// Categories carry an explicit is_debt flag, toggled from Settings, which is
// the source of truth once it's available -- the name-based guess below only
// kicks in when the caller doesn't have (or hasn't loaded) the categories
// list, e.g. before it's fetched, so behavior degrades gracefully rather
// than breaking.
export function isDebtCategory(category, categories) {
  if (categories) {
    const match = categories.find((c) => c.name === category);
    if (match) return Boolean(match.is_debt);
  }
  return /credit|loan/i.test(category || '');
}
