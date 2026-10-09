import { todayISO } from './dueDate.js';

function daysInMonth(year, monthIndex) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

// Mirrors backend/src/services/recurrence.js's advanceDueDate -- duplicated
// here rather than imported because the frontend and backend are separate
// builds with no shared package. Keep the two in sync if either changes.
// Monthly/yearly moves are anchored on the bill's original day-of-month
// (anchorDay) and clamped to the month's length: Jan 31 -> Feb 28 -> Mar 31.
export function advanceDueDate(isoDate, recurrence, anchorDay) {
  const d = new Date(isoDate + 'T00:00:00Z');
  if (recurrence === 'weekly') {
    d.setUTCDate(d.getUTCDate() + 7);
    return d.toISOString().slice(0, 10);
  }
  const day = Number(anchorDay) >= 1 && Number(anchorDay) <= 31 ? Number(anchorDay) : d.getUTCDate();
  let year = d.getUTCFullYear();
  let month = d.getUTCMonth();
  if (recurrence === 'yearly') year += 1;
  else month += 1;
  year += Math.floor(month / 12);
  month %= 12;
  return new Date(Date.UTC(year, month, Math.min(day, daysInMonth(year, month)))).toISOString().slice(0, 10);
}

// A recurring bill's due_date only ever advances when it's marked paid --
// there's no scheduled job that rolls it forward on its own -- so a bill
// that's gone unpaid for multiple cycles just sits on its oldest unpaid due
// date. This walks forward from there to list every cycle that's now due
// (past-due ones plus the current one), e.g. rent unpaid since August, with
// today in October, returns Aug/Sep/Oct's due dates -- 3 missed payments,
// not just 1. Takes the bill itself (needs due_day for month-end bills).
export function missedCycles(bill) {
  const { due_date: dueDate, recurrence, due_day: anchorDay } = bill;
  if (recurrence === 'once') return [dueDate];
  const today = todayISO();
  const dates = [];
  let next = dueDate;
  const MAX_CYCLES = 260; // safety cap, e.g. 5 years of a weekly bill
  // ISO date strings sort chronologically, so plain string comparison is exact.
  while (next <= today && dates.length < MAX_CYCLES) {
    dates.push(next);
    next = advanceDueDate(next, recurrence, anchorDay);
  }
  return dates.length ? dates : [dueDate];
}

// How many payments an unpaid bill currently owes (past due + current).
export function cyclesOwed(bill) {
  return bill.status === 'overdue' ? missedCycles(bill).length : 1;
}
