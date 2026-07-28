import { Router } from 'express';
import db from '../db/index.js';
import { advanceDueDate } from '../services/recurrence.js';

const router = Router();

const withComputedStatus = (bill) => {
  if (bill.status === 'paid') return bill;
  const today = new Date().toISOString().slice(0, 10);
  return { ...bill, status: bill.due_date < today ? 'overdue' : 'unpaid' };
};

router.get('/', (req, res) => {
  const { status, assigned_to } = req.query;
  let query = 'SELECT * FROM bills';
  const clauses = [];
  const params = [];
  if (status) {
    clauses.push('status = ?');
    params.push(status);
  }
  if (assigned_to) {
    clauses.push('assigned_to = ?');
    params.push(assigned_to);
  }
  if (clauses.length) query += ' WHERE ' + clauses.join(' AND ');
  query += ' ORDER BY due_date ASC';
  const bills = db.prepare(query).all(...params).map(withComputedStatus);
  res.json(bills);
});

// Bill calendar: all bills whose due_date falls within [from, to]
router.get('/calendar', (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from and to query params required (YYYY-MM-DD)' });
  const bills = db
    .prepare('SELECT * FROM bills WHERE due_date BETWEEN ? AND ? ORDER BY due_date ASC')
    .all(from, to)
    .map(withComputedStatus);
  res.json(bills);
});

router.get('/:id', (req, res) => {
  const bill = db.prepare('SELECT * FROM bills WHERE id = ?').get(req.params.id);
  if (!bill) return res.status(404).json({ error: 'not found' });
  const payments = db.prepare('SELECT * FROM bill_payments WHERE bill_id = ? ORDER BY paid_date DESC').all(bill.id);
  res.json({ ...withComputedStatus(bill), payments });
});

router.post('/', (req, res) => {
  const {
    name, amount, payee, category, recurrence, due_date,
    autopay, assigned_to, reminder_days_before, notes,
  } = req.body;
  if (!name || !due_date) return res.status(400).json({ error: 'name and due_date are required' });
  const info = db
    .prepare(
      `INSERT INTO bills (name, amount, payee, category, recurrence, due_date, autopay, assigned_to, reminder_days_before, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      name,
      amount || 0,
      payee || null,
      category || 'other',
      recurrence || 'monthly',
      due_date,
      autopay ? 1 : 0,
      assigned_to || null,
      reminder_days_before ?? 3,
      notes || null
    );
  res.status(201).json(db.prepare('SELECT * FROM bills WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM bills WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const merged = { ...existing, ...req.body };
  db.prepare(
    `UPDATE bills SET name=?, amount=?, payee=?, category=?, recurrence=?, due_date=?, autopay=?, assigned_to=?, reminder_days_before=?, status=?, notes=?, updated_at=datetime('now')
     WHERE id=?`
  ).run(
    merged.name, merged.amount, merged.payee, merged.category, merged.recurrence,
    merged.due_date, merged.autopay ? 1 : 0, merged.assigned_to, merged.reminder_days_before,
    merged.status, merged.notes, req.params.id
  );
  res.json(db.prepare('SELECT * FROM bills WHERE id = ?').get(req.params.id));
});

// Mark paid: logs payment, then rolls due_date forward if recurring
router.post('/:id/pay', (req, res) => {
  const bill = db.prepare('SELECT * FROM bills WHERE id = ?').get(req.params.id);
  if (!bill) return res.status(404).json({ error: 'not found' });
  const { amount_paid, paid_by } = req.body;

  db.prepare('INSERT INTO bill_payments (bill_id, amount_paid, paid_by) VALUES (?, ?, ?)').run(
    amount_paid ?? bill.amount,
    paid_by || null
  );

  if (bill.recurrence === 'once') {
    db.prepare("UPDATE bills SET status='paid', updated_at=datetime('now') WHERE id=?").run(bill.id);
  } else {
    const nextDue = advanceDueDate(bill.due_date, bill.recurrence);
    db.prepare("UPDATE bills SET status='unpaid', due_date=?, updated_at=datetime('now') WHERE id=?").run(
      nextDue,
      bill.id
    );
  }
  res.json(db.prepare('SELECT * FROM bills WHERE id = ?').get(bill.id));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM bills WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

export default router;
