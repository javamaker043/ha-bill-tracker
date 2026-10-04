function daysInMonth(year, monthIndex) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

// Moves an ISO date by `step` cycles (+1 forward, -1 back). Monthly/yearly
// moves are anchored on the bill's original day-of-month (`anchorDay`) and
// clamped to the target month's length -- Jan 31 -> Feb 28 -> Mar 31, not
// the naive JS overflow of Jan 31 -> Mar 3, which then stays on the 3rd
// forever. Without an anchor the current date's own day is used.
function shiftDueDate(isoDate, recurrence, step, anchorDay) {
  const d = new Date(isoDate + 'T00:00:00Z');
  if (recurrence === 'weekly') {
    d.setUTCDate(d.getUTCDate() + 7 * step);
    return d.toISOString().slice(0, 10);
  }
  const day = Number(anchorDay) >= 1 && Number(anchorDay) <= 31 ? Number(anchorDay) : d.getUTCDate();
  let year = d.getUTCFullYear();
  let month = d.getUTCMonth();
  if (recurrence === 'yearly') {
    year += step;
  } else {
    month += step;
    year += Math.floor(month / 12);
    month = ((month % 12) + 12) % 12;
  }
  const clamped = Math.min(day, daysInMonth(year, month));
  return new Date(Date.UTC(year, month, clamped)).toISOString().slice(0, 10);
}

export function advanceDueDate(isoDate, recurrence, anchorDay) {
  return shiftDueDate(isoDate, recurrence, 1, anchorDay);
}

export function retreatDueDate(isoDate, recurrence, anchorDay) {
  return shiftDueDate(isoDate, recurrence, -1, anchorDay);
}
