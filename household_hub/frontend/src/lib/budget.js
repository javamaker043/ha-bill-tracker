// Cost of one payment of a bill, expressed per month so weekly, monthly and
// yearly bills can be added together and compared against monthly income.
// One-time bills aren't an ongoing monthly cost, so they count as 0 here.
export function monthlyFactor(recurrence) {
  if (recurrence === 'weekly') return 52 / 12;
  if (recurrence === 'yearly') return 1 / 12;
  if (recurrence === 'monthly') return 1;
  return 0;
}

export function monthlyEquivalent(bill) {
  return (Number(bill.amount) || 0) * monthlyFactor(bill.recurrence);
}

// A bill counts as flagged for reduction only while its target is still
// below its current amount (editing the amount later can leave a stale one).
export function isFlagged(bill) {
  return bill.reduce_target != null && Number(bill.reduce_target) < Number(bill.amount);
}

// Monthly money freed up if the bill drops to its reduce_target.
export function monthlySavings(bill) {
  if (!isFlagged(bill)) return 0;
  return ((Number(bill.amount) || 0) - (Number(bill.reduce_target) || 0)) * monthlyFactor(bill.recurrence);
}

// Rough triage used to decide where to look first -- a heuristic on the
// category name, since categories carry no "essential" flag. Debt comes from
// the category's explicit is_debt setting.
const ESSENTIAL_RE = /housing|rent|mortgage|utilit|electric|water|gas|power|insur|medic|health|food|grocer|child|tax/i;
export function billKind(bill) {
  if (bill.category_is_debt) return 'debt';
  if (ESSENTIAL_RE.test(bill.category || '')) return 'essential';
  return 'flexible';
}

export const KIND_LABEL = { essential: 'Essential', debt: 'Debt', flexible: 'Flexible' };

// "the 5th", "every week", "yearly (Mar 5)" for a bill's schedule column.
export function scheduleLabel(bill) {
  if (bill.recurrence === 'weekly') return 'Weekly';
  const day = Number(String(bill.due_date).slice(8, 10));
  const n = day % 100 >= 11 && day % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[day % 10] || 'th');
  if (bill.recurrence === 'yearly') return `Yearly (${String(bill.due_date).slice(5)})`;
  return `Monthly, the ${day}${n}`;
}
