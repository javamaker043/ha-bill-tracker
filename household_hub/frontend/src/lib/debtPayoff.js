// Month-by-month amortization simulation rather than the closed-form log
// formula: easier to verify by inspection, and it naturally handles the
// last (partial) payment and the "payment doesn't even cover interest"
// case without special-casing the math.
export function simulatePayoff(balance, aprPercent, monthlyPayment) {
  const startingBalance = Number(balance) || 0;
  const payment = Number(monthlyPayment) || 0;
  const monthlyRate = (Number(aprPercent) || 0) / 100 / 12;

  if (startingBalance <= 0) {
    return { months: 0, totalInterest: 0, totalPaid: 0, payoffPossible: true };
  }
  if (payment <= 0 || (monthlyRate > 0 && payment <= startingBalance * monthlyRate)) {
    // Payment doesn't even cover a month's interest -- balance never shrinks.
    return { months: null, totalInterest: null, totalPaid: null, payoffPossible: false };
  }

  let remaining = startingBalance;
  let totalInterest = 0;
  let months = 0;
  const MAX_MONTHS = 1200; // 100-year safety cap against runaway loops

  while (remaining > 0.005 && months < MAX_MONTHS) {
    const interest = remaining * monthlyRate;
    totalInterest += interest;
    const principal = Math.min(payment - interest, remaining);
    remaining -= principal;
    months += 1;
  }

  const payoffPossible = remaining <= 0.005;
  return {
    months: payoffPossible ? months : null,
    totalInterest: payoffPossible ? totalInterest : null,
    totalPaid: payoffPossible ? startingBalance + totalInterest : null,
    payoffPossible,
  };
}

// Standard credit-utilization risk bands (30%/75%) used for both the
// per-account bar and the overall summary stat.
export function utilizationTone(pct) {
  if (pct == null) return 'default';
  if (pct >= 75) return 'danger';
  if (pct >= 30) return 'warn';
  return 'good';
}
