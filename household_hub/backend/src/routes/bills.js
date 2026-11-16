import { Router } from 'express';
import db from '../db/index.js';
import { retreatDueDate } from '../services/recurrence.js';
import { recordPayment } from '../services/payments.js';
import { withComputedStatus } from '../services/billStatus.js';
import { BILLS_WITH_CATEGORY_SELECT } from '../db/billQueries.js';
import { isIsoDate } from '../services/dateUtil.js';

const router = Router();

const dayOf = (isoDate) => Number(isoDate.slice(8, 10));

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
  if (!isIsoDate(due_date)) return res.status(400).json({ error: 'due_date must be a valid YYYY-MM-DD date' });
  const info = db
    .prepare(
      `INSERT INTO bills (name, amount, payee, category, recurrence, due_date, due_day, autopay, assigned_to, reminder_days_before, current_balance, interest_rate, credit_limit, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      name,
      amount || 0,
      payee || null,
      category || 'Other',
      recurrence || 'monthly',
      due_date,
      dayOf(due_date),
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
  if (!isIsoDate(merged.due_date)) return res.status(400).json({ error: 'due_date must be a valid YYYY-MM-DD date' });
  // The edit form sends the whole row back, including the *computed*
  // 'overdue' status -- only 'paid' is real stored state, so don't persist
  // a transient overdue/unpaid value that would go stale.
  const status = merged.status === 'paid' ? 'paid' : 'unpaid';
  // Re-anchor the day-of-month only when the due date itself was edited.
  const dueDay = merged.due_date !== existing.due_date ? dayOf(merged.due_date) : existing.due_day ?? dayOf(merged.due_date);
  db.prepare(
    `UPDATE bills SET name=?, amount=?, payee=?, category=?, recurrence=?, due_date=?, due_day=?, autopay=?, assigned_to=?, reminder_days_before=?, status=?, current_balance=?, interest_rate=?, credit_limit=?, notes=?, updated_at=datetime('now')
     WHERE id=?`
  ).run(
    merged.name, merged.amount, merged.payee, merged.category, merged.recurrence,
    merged.due_date, dueDay, merged.autopay ? 1 : 0, merged.assigned_to, merged.reminder_days_before,
    status, merged.current_balance ?? null, merged.interest_rate ?? null, merged.credit_limit ?? null,
    merged.notes, req.params.id
  );
  // A hand-edited balance is no longer "as of" the last Monarch import.
  if ((merged.current_balance ?? null) !== (existing.current_balance ?? null)) {
    db.prepare('UPDATE bills SET balance_as_of = NULL WHERE id = ?').run(req.params.id);
  }
  res.json(db.prepare('SELECT * FROM bills WHERE id = ?').get(req.params.id));
});

// Assign (or unassign, with paycheck_id: null) a bill to a paycheck for
// payment planning -- separate from actually marking it paid.
router.patch('/:id/paycheck', (req, res) => {
  const existing = db.prepare('SELECT * FROM bills WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  if (req.body.paycheck_id && !db.prepare('SELECT 1 FROM paychecks WHERE id = ?').get(req.body.paycheck_id)) {
    return res.status(400).json({ error: 'That paycheck no longer exists -- refresh and pick another.' });
  }
  db.prepare('UPDATE bills SET paycheck_id=? WHERE id=?').run(
    req.body.paycheck_id || null,
    req.params.id
  );
  res.json(withComputedStatus(db.prepare('SELECT * FROM bills WHERE id = ?').get(req.params.id)));
});

// Monthly Budget: flag a bill for reduction by giving the per-payment amount
// it could drop to (0 = cancel it), or clear the flag with reduce_target: null.
router.patch('/:id/reduce', (req, res) => {
  const bill = db.prepare('SELECT * FROM bills WHERE id = ?').get(req.params.id);
  if (!bill) return res.status(404).json({ error: 'not found' });
  const { reduce_target } = req.body;
  let value = null;
  if (reduce_target !== null && reduce_target !== undefined && reduce_target !== '') {
    value = Number(reduce_target);
    if (!Number.isFinite(value) || value < 0) {
      return res.status(400).json({ error: 'reduce_target must be a non-negative number' });
    }
    if (value >= Number(bill.amount)) {
      return res.status(400).json({ error: 'The reduced amount must be less than the current amount.' });
    }
  }
  db.prepare("UPDATE bills SET reduce_target = ?, updated_at = datetime('now') WHERE id = ?").run(value, bill.id);
  res.json(db.prepare(`${BILLS_WITH_CATEGORY_SELECT} WHERE bills.id = ?`).get(bill.id));
});

// Mark paid: logs payment, then rolls due_date forward if recurring.
// Validation and bookkeeping live in services/payments.js so payments
// accepted from Monarch go through exactly the same path.
router.post('/:id/pay', (req, res) => {
  const bill = db.prepare('SELECT * FROM bills WHERE id = ?').get(req.params.id);
  if (!bill) return res.status(404).json({ error: 'not found' });
  const { amount_paid, paid_by, statement_balance, paycheck_id, source, paid_date } = req.body;
  const result = recordPayment(bill, { amount_paid, paid_by, statement_balance, paycheck_id, source, paid_date });
  if (result.error) return res.status(result.error.status).json({ error: result.error.message });
  res.json(result.bill);
});

// Undo the most recent payment on a bill (wrong amount/date, or logged on
// the wrong bill) -- deletes it and steps the bill back to the due date it
// was paying. Only the latest payment can be undone: payments are applied
// in order, so removing an older one would leave the due date inconsistent
// with what's left. The stored balance is deliberately left alone since the
// real balance may have changed since -- edit the bill if it needs fixing.
router.delete('/:id/payments/:paymentId', (req, res) => {
  const bill = db.prepare('SELECT * FROM bills WHERE id = ?').get(req.params.id);
  if (!bill) return res.status(404).json({ error: 'not found' });
  const latest = db.prepare('SELECT id FROM bill_payments WHERE bill_id = ? ORDER BY id DESC LIMIT 1').get(bill.id);
  if (!latest || String(latest.id) !== String(req.params.paymentId)) {
    return res.status(409).json({ error: 'Only the most recent payment on a bill can be undone.' });
  }
  db.transaction(() => {
    db.prepare('DELETE FROM bill_payments WHERE id = ?').run(latest.id);
    if (bill.recurrence === 'once') {
      db.prepare("UPDATE bills SET status='unpaid', updated_at=datetime('now') WHERE id=?").run(bill.id);
    } else {
      const prevDue = retreatDueDate(bill.due_date, bill.recurrence, bill.due_day);
      db.prepare("UPDATE bills SET status='unpaid', due_date=?, updated_at=datetime('now') WHERE id=?").run(prevDue, bill.id);
    }
  })();
  res.json(withComputedStatus(db.prepare(`${BILLS_WITH_CATEGORY_SELECT} WHERE bills.id = ?`).get(bill.id)));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM bills WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

export default router;
