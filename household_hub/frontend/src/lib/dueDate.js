// Date helpers shared across pages. Everything here works in the browser's
// *local* calendar day on plain "YYYY-MM-DD" strings -- never
// new Date().toISOString() (UTC), which is already "tomorrow" in the evening
// for anyone west of UTC, and never new Date('YYYY-MM-DD') compared against a
// local-midnight Date (parsed as UTC), which is off by the timezone offset.

export function todayISO() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const toDayNumber = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
};

// Whole days from today until dueDate (negative once past due).
export function daysUntilDue(dueDate) {
  return toDayNumber(dueDate) - toDayNumber(todayISO());
}
