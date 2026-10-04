import { Router } from 'express';
import db from '../db/index.js';
import { withComputedStatus } from '../services/billStatus.js';
import { localToday } from '../services/dateUtil.js';
import { BILLS_WITH_CATEGORY_SELECT } from '../db/billQueries.js';

const router = Router();

// Text cells starting with = + - @ (or tab/CR) are interpreted as formulas by
// Excel/Sheets -- bill names and notes are user-entered, so neutralize them
// with a leading apostrophe. Real numbers are left alone (a negative amount
// is not an injection).
function cell(value) {
  if (value == null) return '';
  let text = String(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function sendCsv(res, filename, header, rows) {
  const lines = [header.map(cell).join(','), ...rows.map((r) => r.map(cell).join(','))];
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}-${localToday()}.csv"`);
  // BOM so Excel opens it as UTF-8 instead of mangling non-ASCII names.
  res.send('﻿' + lines.join('\r\n') + '\r\n');
}

router.get('/bills.csv', (_req, res) => {
  const members = Object.fromEntries(db.prepare('SELECT id, name FROM members').all().map((m) => [m.id, m.name]));
  const bills = db.prepare(`${BILLS_WITH_CATEGORY_SELECT} ORDER BY bills.due_date ASC`).all().map(withComputedStatus);
  sendCsv(
    res,
    'bills',
    ['Name', 'Amount', 'Category', 'Recurrence', 'Next due date', 'Status', 'Autopay', 'Assigned to', 'Payee',
      'Current balance', 'APR %', 'Credit limit', 'Notes'],
    bills.map((b) => [
      b.name, b.amount, b.category, b.recurrence, b.due_date, b.status, b.autopay ? 'yes' : 'no',
      members[b.assigned_to] || '', b.payee, b.current_balance, b.interest_rate, b.credit_limit, b.notes,
    ])
  );
});

router.get('/payments.csv', (_req, res) => {
  const payments = db
    .prepare(
      `SELECT bp.id, b.name AS bill_name, b.category, bp.amount_paid, bp.paid_date, bp.statement_balance, bp.source,
              m.name AS paid_by_name, pc.pay_date AS paycheck_pay_date
       FROM bill_payments bp
       JOIN bills b ON b.id = bp.bill_id
       LEFT JOIN members m ON m.id = bp.paid_by
       LEFT JOIN paychecks pc ON pc.id = bp.paycheck_id
       ORDER BY bp.paid_date DESC, bp.id DESC`
    )
    .all();
  sendCsv(
    res,
    'payments',
    ['Payment date', 'Bill', 'Category', 'Amount paid', 'Paid by', 'Paid from', 'Statement balance'],
    payments.map((p) => [
      String(p.paid_date).slice(0, 10), p.bill_name, p.category, p.amount_paid, p.paid_by_name,
      p.paycheck_pay_date ? `Paycheck ${p.paycheck_pay_date}` : p.source, p.statement_balance,
    ])
  );
});

export default router;
