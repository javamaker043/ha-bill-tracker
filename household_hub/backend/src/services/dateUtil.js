// "Today" in the server's local timezone (Home Assistant passes the
// household's configured timezone to add-ons via TZ). new Date().toISOString()
// is always UTC, which flips to "tomorrow" in the evening for anyone west of
// UTC -- making a bill due today show up as overdue hours early.
export function localToday() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
