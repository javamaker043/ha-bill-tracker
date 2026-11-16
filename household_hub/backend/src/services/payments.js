import db from '../db/index.js';
import { advanceDueDate } from './recurrence.js';
import { isIsoDate, localToday } from './dateUtil.js';

// Logs a payment against a bill and rolls a recurring bill to its next due
// date. Shared by the manual "mark paid" route and by payments accepted from
// Monarch, so both go through exactly the same validation and bookkeeping.
//
// Returns { bill } on success, or { error: { status, message } } -- callers
// turn that into a response; nothing here touches req/res.
export function recordPayment(bill, input) {
  const { amount_paid, paid_by, statement_balance, paycheck_id, source, paid_date, monarch_transaction_id } = input;

  // A paid one-time bill has nothing left to pay -- a second submit (double
  // tap, stale tab) would otherwise log a duplicate payment.
  if (bill.recurrence === 'once' && bill.status === 'paid') {
    return { error: { status: 409, message: 'This bill is already marked paid.' } };
  }
  const amount = amount_paid ?? bill.amount;
  if (!Number.isFinite(Number(amount)) || Number(amount) < 0) {
    return { error: { status: 400, message: 'amount_paid must be a non-negative number' } };
  }
  if (paid_date && !isIsoDate(paid_date)) {
    return { error: { status: 400, message: 'paid_date must be a valid YYYY-MM-DD date' } };
  }
  if (paycheck_id && !db.prepare('SELECT 1 FROM paychecks WHERE id = ?').get(paycheck_id)) {
    return { error: { status: 400, message: 'That paycheck no longer exists -- pick another source.' } };
  }
  if (
    monarch_transaction_id &&
    db.prepare('SELECT 1 FROM bill_payments WHERE monarch_transaction_id = ?').get(String(monarch_transaction_id))
  ) {
    return { error: { status: 409, message: 'That Monarch transaction has already been logged.' } };
  }

  // If the bill already has a live payment-plan assignment, that's the
  // answer. Otherwise it wasn't assigned to a paycheck, so the payer says
  // which paycheck covered it (paycheck_id) or that it came from somewhere
  // else entirely (source) -- captured here, separately from the bill's own
  // paycheck_id, because a recurring bill clears that live assignment below
  // when it rolls forward. This is what lets a paycheck's board column keep
  // showing what was paid from it after the bill has moved on.
  const paidFromPaycheck = bill.paycheck_id || (paycheck_id ? Number(paycheck_id) : null);
  const paidFromSource = bill.paycheck_id ? null : (source || null);

  // Stored as a bare calendar day -- a payment date is a day, not an instant,
  // and a time would make it render as the previous/next day once shifted
  // between UTC and the viewer's timezone.
  const paidDateValue = paid_date || localToday();

  // Payment row + bill rollover commit together or not at all, so a failure
  // between the two can never leave a logged payment on a bill that still
  // shows the old due date (which would invite paying it twice).
  db.transaction(() => {
    db.prepare(
      `INSERT INTO bill_payments (bill_id, amount_paid, paid_by, statement_balance, paycheck_id, source, paid_date, monarch_transaction_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      bill.id,
      Number(amount),
      paid_by || null,
      statement_balance ?? null,
      paidFromPaycheck,
      paidFromSource,
      paidDateValue,
      monarch_transaction_id ? String(monarch_transaction_id) : null
    );

    // Only overwrite the bill's stored balance when this payment actually
    // reported one -- otherwise leave the last known balance as-is.
    const currentBalance = statement_balance ?? bill.current_balance;
    if (statement_balance != null) {
      db.prepare('UPDATE bills SET balance_as_of = NULL WHERE id = ?').run(bill.id);
    }

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
      const nextDue = advanceDueDate(bill.due_date, bill.recurrence, bill.due_day);
      db.prepare(
        "UPDATE bills SET status='unpaid', due_date=?, paycheck_id=NULL, current_balance=?, updated_at=datetime('now') WHERE id=?"
      ).run(nextDue, currentBalance, bill.id);
    }
  })();

  return { bill: db.prepare('SELECT * FROM bills WHERE id = ?').get(bill.id) };
}
