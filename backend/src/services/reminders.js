import cron from 'node-cron';
import db from '../db/index.js';
import { notify } from './homeAssistant.js';

const DEFAULT_NOTIFY = process.env.NOTIFY_SERVICE || 'notify.notify';
const LOOKAHEAD_DAYS = Number(process.env.REMINDER_LOOKAHEAD_DAYS || 3);

function alreadySent(type, refTable, refId, sinceHoursAgo = 20) {
  const row = db
    .prepare(
      `SELECT 1 FROM notification_log
       WHERE type=? AND ref_table=? AND ref_id=? AND sent_at >= datetime('now', ?)`
    )
    .get(type, refTable, refId, `-${sinceHoursAgo} hours`);
  return Boolean(row);
}

function logSent(type, refTable, refId) {
  db.prepare('INSERT INTO notification_log (type, ref_table, ref_id) VALUES (?, ?, ?)').run(
    type,
    refTable,
    refId
  );
}

async function checkBills() {
  const today = new Date().toISOString().slice(0, 10);
  const bills = db.prepare("SELECT * FROM bills WHERE status != 'paid'").all();

  for (const bill of bills) {
    const daysUntilDue = Math.floor(
      (new Date(bill.due_date) - new Date(today)) / 86400000
    );
    const target = resolveNotifyTarget(bill.assigned_to);

    if (daysUntilDue < 0 && !alreadySent('bill_overdue', 'bills', bill.id)) {
      await notify(target, 'Bill overdue', `${bill.name} ($${bill.amount}) was due ${bill.due_date}`);
      logSent('bill_overdue', 'bills', bill.id);
    } else if (
      daysUntilDue >= 0 &&
      daysUntilDue <= (bill.reminder_days_before ?? LOOKAHEAD_DAYS) &&
      !alreadySent('bill_reminder', 'bills', bill.id)
    ) {
      await notify(
        target,
        'Upcoming bill',
        `${bill.name} ($${bill.amount}) is due ${bill.due_date}`
      );
      logSent('bill_reminder', 'bills', bill.id);
    }
  }
}

async function checkTasks() {
  const today = new Date().toISOString().slice(0, 10);
  const tasks = db
    .prepare("SELECT * FROM tasks WHERE status != 'done' AND due_date IS NOT NULL AND due_date <= ?")
    .all(today);

  for (const task of tasks) {
    if (alreadySent('task_due', 'tasks', task.id)) continue;
    const target = resolveNotifyTarget(task.assigned_to);
    await notify(target, 'Task due', task.title);
    logSent('task_due', 'tasks', task.id);
  }
}

function resolveNotifyTarget(memberId) {
  if (!memberId) return DEFAULT_NOTIFY;
  const member = db.prepare('SELECT notify_target FROM members WHERE id = ?').get(memberId);
  return member?.notify_target || DEFAULT_NOTIFY;
}

export function startReminderScheduler() {
  const runChecks = () => {
    checkBills().catch((err) => console.error('[reminders] bill check failed', err));
    checkTasks().catch((err) => console.error('[reminders] task check failed', err));
  };
  cron.schedule('0 8 * * *', runChecks);
  cron.schedule('0 18 * * *', runChecks);
  console.log('[reminders] scheduler started (08:00 and 18:00)');
}

// Exported for the manual "test notification" endpoint / immediate run on boot
export { checkBills, checkTasks };
