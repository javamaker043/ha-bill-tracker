import { Router } from 'express';
import db from '../db/index.js';
import { withComputedStatus } from '../services/billStatus.js';
import { BILLS_WITH_CATEGORY_SELECT } from '../db/billQueries.js';

const router = Router();

function withBills(paycheck) {
  const bills = db
    .prepare(`${BILLS_WITH_CATEGORY_SELECT} WHERE bills.paycheck_id = ? ORDER BY bills.due_date ASC`)
    .all(paycheck.id)
    .map(withComputedStatus);
  // Live, not-yet-paid bills still sitting on this paycheck -- what's planned.
  const assigned_total = bills.reduce((sum, b) => sum + Number(b.amount || 0), 0);
  // Bills paid from this paycheck, kept even after a recurring bill rolls
  // forward and its live paycheck_id clears -- shown as a read-only, paid
  // record in the board column instead of just vanishing back to Unassigned.
  const paidHistory = db
    .prepare(
      `SELECT bp.id, bp.bill_id, bp.amount_paid, bp.paid_date, b.name AS bill_name
       FROM bill_payments bp JOIN bills b ON b.id = bp.bill_id
       WHERE bp.paycheck_id = ? ORDER BY bp.paid_date DESC`
    )
    .all(paycheck.id);
  // Money paid out of this paycheck doesn't come back once spent, so it has
  // to count against what's left just as much as still-unpaid planned bills
  // do -- otherwise remaining would visibly go *up* every time a bill here
  // gets marked paid, which is backwards.
  const paid_total = paidHistory.reduce((sum, h) => sum + Number(h.amount_paid || 0), 0);
  // Once a paycheck has actually landed, what really arrived (actual_amount)
  // is the money to budget against -- expected_amount is only the plan.
  const available =
    paycheck.actual_amount != null ? Number(paycheck.actual_amount) : Number(paycheck.expected_amount);
  return {
    ...paycheck,
    bills,
    paidHistory,
    assigned_total,
    paid_total,
    available,
    remaining: available - assigned_total - paid_total,
  };
}

router.get('/', (_req, res) => {
  const paychecks = db.prepare('SELECT * FROM paychecks ORDER BY pay_date ASC').all();
  res.json(paychecks.map(withBills));
});

// Bills not yet assigned to a paycheck, past-due first (due_date ASC already
// sorts overdue bills -- earlier dates -- ahead of anything not yet due).
router.get('/unassigned-bills', (_req, res) => {
  const bills = db
    .prepare(
      `${BILLS_WITH_CATEGORY_SELECT} WHERE bills.paycheck_id IS NULL AND bills.status != 'paid' ORDER BY bills.due_date ASC`
    )
    .all()
    .map(withComputedStatus);
  res.json(bills);
});

// '' / null / undefined mean "not recorded yet" (null in the db); anything
// else must be a finite non-negative number.
function parseAmount(value) {
  if (value === '' || value == null) return { value: null };
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return { error: true };
  return { value: n };
}

router.post('/', (req, res) => {
  const { pay_date, expected_amount, actual_amount, notes } = req.body;
  if (!pay_date) return res.status(400).json({ error: 'pay_date is required' });
  const actual = parseAmount(actual_amount);
  if (actual.error) return res.status(400).json({ error: 'actual_amount must be a non-negative number' });
  const info = db
    .prepare('INSERT INTO paychecks (pay_date, expected_amount, actual_amount, notes) VALUES (?, ?, ?, ?)')
    .run(pay_date, expected_amount || 0, actual.value, notes || null);
  res.status(201).json(withBills(db.prepare('SELECT * FROM paychecks WHERE id = ?').get(info.lastInsertRowid)));
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM paychecks WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const merged = { ...existing, ...req.body };
  if (!merged.pay_date) return res.status(400).json({ error: 'pay_date is required' });
  const actual = parseAmount(merged.actual_amount);
  if (actual.error) return res.status(400).json({ error: 'actual_amount must be a non-negative number' });
  db.prepare('UPDATE paychecks SET pay_date=?, expected_amount=?, actual_amount=?, notes=? WHERE id=?').run(
    merged.pay_date,
    Number(merged.expected_amount) || 0,
    actual.value,
    merged.notes,
    req.params.id
  );
  res.json(withBills(db.prepare('SELECT * FROM paychecks WHERE id = ?').get(req.params.id)));
});

// Deleting a paycheck unassigns (not deletes) its bills, via ON DELETE SET NULL.
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM paychecks WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

export default router;
