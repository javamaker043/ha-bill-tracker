import { Router } from 'express';
import db from '../db/index.js';
import { withComputedStatus } from '../services/billStatus.js';

const router = Router();

function withBills(paycheck) {
  const bills = db
    .prepare('SELECT * FROM bills WHERE paycheck_id = ? ORDER BY due_date ASC')
    .all(paycheck.id)
    .map(withComputedStatus);
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
  return {
    ...paycheck,
    bills,
    paidHistory,
    assigned_total,
    remaining: Number(paycheck.expected_amount) - assigned_total,
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
    .prepare("SELECT * FROM bills WHERE paycheck_id IS NULL AND status != 'paid' ORDER BY due_date ASC")
    .all()
    .map(withComputedStatus);
  res.json(bills);
});

router.post('/', (req, res) => {
  const { pay_date, expected_amount, notes } = req.body;
  if (!pay_date) return res.status(400).json({ error: 'pay_date is required' });
  const info = db
    .prepare('INSERT INTO paychecks (pay_date, expected_amount, notes) VALUES (?, ?, ?)')
    .run(pay_date, expected_amount || 0, notes || null);
  res.status(201).json(withBills(db.prepare('SELECT * FROM paychecks WHERE id = ?').get(info.lastInsertRowid)));
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM paychecks WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const merged = { ...existing, ...req.body };
  db.prepare('UPDATE paychecks SET pay_date=?, expected_amount=?, notes=? WHERE id=?').run(
    merged.pay_date,
    merged.expected_amount,
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
