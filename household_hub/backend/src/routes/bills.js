import { Router } from 'express';
import db from '../db/index.js';
import { advanceDueDate } from '../services/recurrence.js';
import { withComputedStatus } from '../services/billStatus.js';
import { BILLS_WITH_CATEGORY_SELECT } from '../db/billQueries.js';

const router = Router();

router.get('/', (req, res) => {
  const { status, assigned_to } = req.query;
  let query = BILLS_WITH_CATEGORY_SELECT;
  const clauses = [];
  const params = [];
  if (status) {
    clauses.push('bills.status = ?');
    params.push(status);
  }
  if (assigned_to) {
    clauses.push('bills.assigned_to = ?');
    params.push(assigned_to);
  }
  if (clauses.length) query += ' WHERE ' + clauses.join(' AND ');
  query += ' ORDER BY bills.due_date ASC';
  const bills = db.prepare(query).all(...params).map(withComputedStatus);
  res.json(bills);
});

// Bill calendar: all bills whose due_date falls within [from, to]
router.get('/calendar', (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from and to query params required (YYYY-MM-DD)' });
  const bills = db
    .prepare(`${BILLS_WITH_CATEGORY_SELECT} WHERE bills.due_date BETWEEN ? AND ? ORDER BY bills.due_date ASC`)
    .all(from, to)
    .map(withComputedStatus);
  res.json(bills);
});

router.get('/:id', (req, res) => {
  const bill = db.prepare(`${BILLS_WITH_CATEGORY_SELECT} WHERE bills.id = ?`).get(req.params.id);
  if (!bill) return res.status(404).json({ error: 'not found' });
  const payments = db
    .prepare(
      `SELECT bp.*, pc.pay_date AS paycheck_pay_date
       FROM bill_payments bp LEFT JOIN paychecks pc ON pc.id = bp.paycheck_id
       WHERE bp.bill_id = ? ORDER BY bp.paid_date DESC`
    )
    .all(bill.id);
  res.json({ ...withComputedStatus(bill), payments });
});

router.post('/', (req, res) => {
  const {
    name, amount, payee, category, recurrence, due_date,
    autopay, assigned_to, reminder_days_before, current_balance,
    interest_rate, credit_limit, notes,
  } = req.body;
  if (!name || !due_date) return res.status(400).json({ error: 'name and due_date are required' });
  const info = db
    .prepare(
      `INSERT INTO bills (name, amount, payee, category, recurrence, due_date, autopay, assigned_to, reminder_days_before, current_balance, interest_rate, credit_limit, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      name,
      amount || 0,
      payee || null,
      category || 'Other',
      recurrence || 'monthly',
      due_date,
      autopay ? 1 : 0,
      assigned_to || null,
      reminder_days_before ?? 3,
      current_balance ?? null,
      interest_rate ?? null,
      credit_limit ?? null,
      notes || null
    );
  res.status(201).json(db.prepare('SELECT * FROM bills WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM bills WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const merged = { ...existing, ...req.body };
  db.prepare(
    `UPDATE bills SET name=?, amount=?, payee=?, category=?, recurrence=?, due_date=?, autopay=?, assigned_to=?, reminder_days_before=?, status=?, current_balance=?, interest_rate=?, credit_limit=?, notes=?, updated_at=datetime('now')
     WHERE id=?`
  ).run(
    merged.name, merged.amount, merged.payee, merged.category, merged.recurrence,
    merged.due_date, merged.autopay ? 1 : 0, merged.assigned_to, merged.reminder_days_before,
    merged.status, merged.current_balance ?? null, merged.interest_rate ?? null, merged.credit_limit ?? null,
    merged.notes, req.params.id
  );
  res.json(db.prepare('SELECT * FROM bills WHERE id = ?').get(req.params.id));
});

// Assign (or unassign, with paycheck_id: null) a bill to a paycheck for
// payment planning -- separate from actually marking it paid.
router.patch('/:id/paycheck', (req, res) => {
  const existing = db.prepare('SELECT * FROM bills WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  db.prepare('UPDATE bills SET paycheck_id=? WHERE id=?').run(
    req.body.paycheck_id || null,
    req.params.id
  );
  res.json(withComputedStatus(db.prepare('SELECT * FROM bills WHERE id = ?').get(req.params.id)));
});

// Mark paid: logs payment, then rolls due_date forward if recurring
router.post('/:id/pay', (req, res) => {
  const bill = db.prepare('SELECT * FROM bills WHERE id = ?').get(req.params.id);
  if (!bill) return res.status(404).json({ error: 'not found' });
  const { amount_paid, paid_by, statement_balance, paycheck_id, source } = req.body;

  // If the bill already has a live payment-plan assignment, that's the
  // answer. Otherwise it wasn't assigned to a paycheck, so the frontend
  // requires the payer to say which paycheck covered it (paycheck_id) or
  // that it came from somewhere else entirely (source) -- captured here,
  // separately from the bill's own paycheck_id, because a recurring bill
  // clears that live assignment below when it rolls forward. This is what
  // lets a paycheck's board column keep showing what was paid from it
  // after the bill itself has moved on to its next occurrence.
  const paidFromPaycheck = bill.paycheck_id || (paycheck_id ? Number(paycheck_id) : null);
  const paidFromSource = bill.paycheck_id ? null : (source || null);

  db.prepare(
    'INSERT INTO bill_payments (bill_id, amount_paid, paid_by, statement_balance, paycheck_id, source) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(
    bill.id,
    amount_paid ?? bill.amount,
    paid_by || null,
    statement_balance ?? null,
    paidFromPaycheck,
    paidFromSource
  );

  // Only overwrite the bill's stored balance when this payment actually
  // reported one -- otherwise leave the last known balance as-is.
  const currentBalance = statement_balance ?? bill.current_balance;

  if (bill.recurrence === 'once') {
    // A one-time bill stays wherever it ends up: if the payer just picked
    // an existing paycheck for a previously-unassigned bill, reflect that
    // in the live assignment too so it shows there, not just in history.
    db.prepare(
      "UPDATE bills SET status='paid', paycheck_id=?, current_balance=?, updated_at=datetime('now') WHERE id=?"
    ).run(paidFromPaycheck, currentBalance, bill.id);
  } else {
    // Rolling to the next occurrence starts a new, unplanned bill -- clear
    // any payment-plan assignment so it returns to the unassigned pool
    // instead of staying glued to a paycheck that's already been spent.
    const nextDue = advanceDueDate(bill.due_date, bill.recurrence);
    db.prepare(
      "UPDATE bills SET status='unpaid', due_date=?, paycheck_id=NULL, current_balance=?, updated_at=datetime('now') WHERE id=?"
    ).run(nextDue, currentBalance, bill.id);
  }
  res.json(db.prepare('SELECT * FROM bills WHERE id = ?').get(bill.id));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM bills WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

export default router;
