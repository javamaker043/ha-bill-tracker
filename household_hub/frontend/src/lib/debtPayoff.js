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

// Pays every debt's minimum each month and throws whatever's left of the
// monthly budget at one debt at a time in priority order, rolling a paid-off
// debt's minimum into the budget for the next (the budget stays constant, so
// that happens automatically). 'avalanche' targets the highest APR first
// (least total interest); 'snowball' the smallest balance first (quickest
// early wins). Order is fixed from the starting balances/rates.
export function simulateStrategy(debts, monthlyBudget, strategy) {
  const accounts = debts
    .map((d) => ({
      id: d.id,
      name: d.name,
      balance: Number(d.balance) || 0,
      rate: (Number(d.apr) || 0) / 100 / 12,
      min: Number(d.minPayment) || 0,
    }))
    .filter((a) => a.balance > 0);

  const totalMin = accounts.reduce((sum, a) => sum + a.min, 0);
  const budget = Math.max(Number(monthlyBudget) || 0, totalMin);

  const order = [...accounts].sort(
    strategy === 'avalanche'
      ? (a, b) => b.rate - a.rate || a.balance - b.balance
      : (a, b) => a.balance - b.balance || b.rate - a.rate
  );

  const payoffMonth = new Map();
  let totalInterest = 0;
  let months = 0;
  const MAX_MONTHS = 1200;

  while (accounts.some((a) => a.balance > 0.005) && months < MAX_MONTHS) {
    months += 1;
    for (const a of accounts) {
      if (a.balance <= 0) continue;
      const interest = a.balance * a.rate;
      a.balance += interest;
      totalInterest += interest;
    }
    let available = budget;
    for (const a of accounts) {
      if (a.balance <= 0) continue;
      const pay = Math.min(a.min, a.balance);
      a.balance -= pay;
      available -= pay;
    }
    for (const a of order) {
      if (available <= 0.005) break;
      if (a.balance <= 0) continue;
      const pay = Math.min(available, a.balance);
      a.balance -= pay;
      available -= pay;
    }
    for (const a of accounts) {
      if (a.balance <= 0.005) {
        a.balance = 0;
        if (!payoffMonth.has(a.id)) payoffMonth.set(a.id, months);
      }
    }
  }

  const payoffPossible = accounts.every((a) => a.balance === 0);
  return {
    payoffPossible,
    budget,
    months: payoffPossible ? months : null,
    totalInterest: payoffPossible ? totalInterest : null,
    order: order.map((a) => ({ id: a.id, name: a.name, month: payoffMonth.get(a.id) ?? null })),
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
