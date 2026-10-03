// Mirrors backend/src/services/recurrence.js's advanceDueDate -- duplicated
// here rather than imported because the frontend and backend are separate
// builds with no shared package. Keep the two in sync if either changes.
export function advanceDueDate(isoDate, recurrence) {
  const d = new Date(isoDate + 'T00:00:00Z');
  switch (recurrence) {
    case 'weekly':
      d.setUTCDate(d.getUTCDate() + 7);
      break;
    case 'yearly':
      d.setUTCFullYear(d.getUTCFullYear() + 1);
      break;
    case 'monthly':
    default:
      d.setUTCMonth(d.getUTCMonth() + 1);
      break;
  }
  return d.toISOString().slice(0, 10);
}

// A recurring bill's due_date only ever advances when it's marked paid --
// there's no scheduled job that rolls it forward on its own -- so a bill
// that's gone unpaid for multiple cycles just sits on its oldest unpaid due
// date. This walks forward from there to list every cycle that's now due
// (past-due ones plus the current one), e.g. rent unpaid since August, with
// today in October, returns Aug/Sep/Oct's due dates -- 3 missed payments,
// not just 1.
export function missedCycles(dueDate, recurrence) {
  if (recurrence === 'once') return [dueDate];
  const today = new Date(new Date().toDateString());
  const dates = [];
  let next = dueDate;
  const MAX_CYCLES = 60; // safety cap, e.g. 5 years of a monthly bill
  while (new Date(next) <= today && dates.length < MAX_CYCLES) {
    dates.push(next);
    next = advanceDueDate(next, recurrence);
  }
  return dates.length ? dates : [dueDate];
}
