// Matches "Credit Cards" and "Short-Term Loans" (the seeded defaults) as well
// as any custom category a household adds later with "credit" or "loan" in
// the name, e.g. "Auto Loans" or "Student Loans" -- these are the categories
// that carry a running statement balance worth tracking over time, unlike a
// flat recurring bill like Utilities or Subscriptions.
export function isDebtCategory(category) {
  return /credit|loan/i.test(category || '');
}
