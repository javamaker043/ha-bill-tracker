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
