const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

// "$9,329.00" instead of the bare toFixed(2) "9329.00" every currency
// display in the app used to produce -- thousands separators matter once
// balances (credit cards, loans) run into four+ figures.
export function formatCurrency(value) {
  return currencyFormatter.format(Number(value) || 0);
}
