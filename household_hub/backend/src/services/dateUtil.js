// "Today" in the server's local timezone (Home Assistant passes the
// household's configured timezone to add-ons via TZ). new Date().toISOString()
// is always UTC, which flips to "tomorrow" in the evening for anyone west of
// UTC -- making a bill due today show up as overdue hours early.
export function localToday() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Strict calendar-date check for "YYYY-MM-DD" (rejects 2026-02-30 etc.).
export function isIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value + 'T00:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === value;
}
