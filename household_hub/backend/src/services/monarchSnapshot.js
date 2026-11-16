// Parsing, validation and matching for Monarch Money snapshots.
//
// A snapshot is a small JSON document (schema version 1) produced from Monarch
// read-only data -- see docs/monarch-snapshot-import.md. Nothing in here talks
// to Monarch; it only interprets a snapshot someone pasted in.

export const SNAPSHOT_VERSION = 1;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const isIso = (v) => typeof v === 'string' && ISO_DATE.test(v) && !isNaN(new Date(v + 'T00:00:00Z'));
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const numOrNull = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

// Returns { snapshot, errors }. `snapshot` is a cleaned copy (only the fields
// we use, numbers coerced) so nothing unexpected is stored or applied.
export function validateSnapshot(raw) {
  const errors = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { snapshot: null, errors: ['The snapshot must be a JSON object.'] };
  }
  if (raw.version !== SNAPSHOT_VERSION) {
    errors.push(`Unsupported snapshot version ${JSON.stringify(raw.version)} (expected ${SNAPSHOT_VERSION}).`);
  }
  if (!isIso(raw.taken_at)) errors.push('taken_at must be a date like 2026-11-15.');

  const income = raw.income && typeof raw.income === 'object' ? raw.income : {};
  const recurring = Array.isArray(income.recurring) ? income.recurring : [];
  if (recurring.length > 200) errors.push('Too many income streams (max 200).');
  const accountsIn = Array.isArray(raw.accounts) ? raw.accounts : [];
  if (accountsIn.length > 500) errors.push('Too many accounts (max 500).');

  const streams = recurring.slice(0, 200).map((s, i) => {
    const amount = Number(s?.amount);
    if (!s || typeof s.name !== 'string' || !s.name.trim()) errors.push(`income.recurring[${i}]: name is required.`);
    if (!Number.isFinite(amount)) errors.push(`income.recurring[${i}]: amount must be a number.`);
    if (s?.last_paid_date != null && !isIso(s.last_paid_date)) errors.push(`income.recurring[${i}]: last_paid_date must be YYYY-MM-DD.`);
    return {
      name: String(s?.name ?? '').trim(),
      frequency: String(s?.frequency ?? '').trim(),
      amount: Math.abs(amount),
      last_paid_date: s?.last_paid_date ?? null,
      next_date: isIso(s?.next_date) ? s.next_date : null,
    };
  });

  const seen = new Set();
  const accounts = accountsIn.slice(0, 500).map((a, i) => {
    const id = a?.id == null ? '' : String(a.id).trim();
    if (!id) errors.push(`accounts[${i}]: id is required.`);
    if (id && seen.has(id)) errors.push(`accounts[${i}]: duplicate id ${id}.`);
    seen.add(id);
    if (!a || typeof a.name !== 'string' || !a.name.trim()) errors.push(`accounts[${i}]: name is required.`);
    const balance = Number(a?.balance);
    if (!Number.isFinite(balance)) errors.push(`accounts[${i}]: balance must be a number.`);
    for (const f of ['apr', 'interest_rate', 'minimum_payment']) {
      const v = numOrNull(a?.[f]);
      if (v !== null && (!Number.isFinite(v) || v < 0)) errors.push(`accounts[${i}]: ${f} must be a non-negative number.`);
    }
    return {
      id,
      name: String(a?.name ?? '').trim(),
      type: String(a?.type ?? '').trim(),
      institution: String(a?.institution ?? '').trim(),
      balance,
      apr: numOrNull(a?.apr),
      interest_rate: numOrNull(a?.interest_rate),
      minimum_payment: numOrNull(a?.minimum_payment),
    };
  });

  // Optional sections used by the payment-detection and recurring-bill review.
  const expensesIn = Array.isArray(raw.recurring_expenses) ? raw.recurring_expenses : [];
  if (expensesIn.length > 200) errors.push('Too many recurring expenses (max 200).');
  const recurring_expenses = expensesIn.slice(0, 200).map((s, i) => {
    const amount = Number(s?.amount);
    if (!s || typeof s.name !== 'string' || !s.name.trim()) errors.push(`recurring_expenses[${i}]: name is required.`);
    if (!Number.isFinite(amount)) errors.push(`recurring_expenses[${i}]: amount must be a number.`);
    if (s?.last_paid_date != null && !isIso(s.last_paid_date)) errors.push(`recurring_expenses[${i}]: last_paid_date must be YYYY-MM-DD.`);
    return {
      id: s?.id == null || s.id === '' ? `idx:${i}:${String(s?.name ?? '').trim().toLowerCase()}` : String(s.id),
      name: String(s?.name ?? '').trim(),
      merchant: String(s?.merchant ?? '').trim(),
      frequency: String(s?.frequency ?? '').trim(),
      amount: Math.abs(amount),
      category: String(s?.category ?? '').trim(),
      last_paid_date: s?.last_paid_date ?? null,
      next_date: isIso(s?.next_date) ? s.next_date : null,
    };
  });

  const txIn = Array.isArray(raw.transactions) ? raw.transactions : [];
  if (txIn.length > 300) errors.push('Too many transactions (max 300).');
  const txSeen = new Set();
  const transactions = txIn.slice(0, 300).map((t, i) => {
    const id = t?.id == null ? '' : String(t.id).trim();
    if (!id) errors.push(`transactions[${i}]: id is required.`);
    if (id && txSeen.has(id)) errors.push(`transactions[${i}]: duplicate id ${id}.`);
    txSeen.add(id);
    if (!isIso(t?.date)) errors.push(`transactions[${i}]: date must be YYYY-MM-DD.`);
    const amount = Number(t?.amount);
    if (!Number.isFinite(amount)) errors.push(`transactions[${i}]: amount must be a number.`);
    if (!t || typeof t.merchant !== 'string' || !t.merchant.trim()) errors.push(`transactions[${i}]: merchant is required.`);
    return {
      id,
      date: t?.date,
      amount: Math.abs(amount),
      merchant: String(t?.merchant ?? '').trim(),
      category: String(t?.category ?? '').trim(),
      account: String(t?.account ?? '').trim(),
    };
  });

  for (const f of ['paycheck_avg_monthly', 'budgeted_paychecks']) {
    const v = numOrNull(income[f]);
    if (v !== null && (!isNum(v) || v < 0)) errors.push(`income.${f} must be a non-negative number.`);
  }

  const snapshot = {
    version: SNAPSHOT_VERSION,
    taken_at: raw.taken_at,
    income: {
      recurring: streams,
      paycheck_avg_monthly: numOrNull(income.paycheck_avg_monthly),
      budgeted_paychecks: numOrNull(income.budgeted_paychecks),
    },
    accounts,
    recurring_expenses,
    transactions,
  };
  return { snapshot: errors.length ? null : snapshot, errors };
}

// ------------------------------------------------------------------ income ---

// How many pay periods fall in an average month. Unknown frequencies return
// null rather than a guess.
export function monthlyFactor(frequency) {
  const f = String(frequency || '').toLowerCase();
  if (f.includes('semimonthly') || f.includes('semi_monthly') || f.includes('twice_monthly')) return 2;
  if (f.includes('biweekly') || f.includes('bi_weekly') || f.includes('every_two_weeks')) return 26 / 12;
  if (f.includes('weekly')) return 52 / 12;
  if (f.includes('quarterly')) return 1 / 3;
  if (f.includes('yearly') || f.includes('annual')) return 1 / 12;
  if (f.includes('monthly')) return 1;
  return null;
}

export const daysBetween = (a, b) => Math.round((new Date(a + 'T00:00:00Z') - new Date(b + 'T00:00:00Z')) / 86400000);
export const ACTIVE_WINDOW_DAYS = 75;

// The three income figures a snapshot can support. A stream is "active" only
// if it was paid recently -- a stream whose last payment was a year ago would
// otherwise silently inflate the number. The user can still include stale
// streams by hand in the importer.
export function computeIncome(snapshot) {
  const streams = snapshot.income.recurring.map((s) => {
    const factor = monthlyFactor(s.frequency);
    const monthly = factor == null ? null : s.amount * factor;
    let active = false;
    let reason = null;
    if (factor == null) reason = `unrecognized frequency "${s.frequency}"`;
    else if (!s.last_paid_date) reason = 'no payment seen';
    else if (daysBetween(snapshot.taken_at, s.last_paid_date) > ACTIVE_WINDOW_DAYS) {
      reason = `last paid ${s.last_paid_date}`;
    } else active = true;
    return { ...s, monthly, active, reason };
  });
  const round = (n) => Math.round(n * 100) / 100;
  return {
    streams,
    streams_total: round(streams.filter((s) => s.active).reduce((sum, s) => sum + s.monthly, 0)),
    average: snapshot.income.paycheck_avg_monthly,
    budget: snapshot.income.budgeted_paychecks,
  };
}

// ---------------------------------------------------------------- accounts ---

// What is actually owed. Monarch reports liabilities as negative balances; a
// positive balance on a card is a credit (overpayment), i.e. nothing owed.
export function amountOwed(account) {
  return account.balance < 0 ? Math.round(-account.balance * 100) / 100 : 0;
}

export function categoryForAccountType(type) {
  const t = String(type || '').toLowerCase();
  if (t.includes('credit')) return 'Credit Cards';
  if (t.includes('student')) return 'Student Loans';
  if (t.includes('auto')) return 'Auto Loan';
  if (t.includes('mortgage')) return 'Mortgage';
  return 'Short-Term Loans';
}

const STOP = new Set(['card', 'credit', 'account', 'loan', 'the', 'my', 'and', 'acct', 'payment', 'bill']);
export const tokens = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((t) => t.length >= 3 && !STOP.has(t) && !/^\d+$/.test(t));
const last4 = (s) => [...String(s || '').matchAll(/(?:\.{3}|\*{2,}|#|x)\s*(\d{4})\b|\((?:\.{3})?(\d{4})\)/gi)].map((m) => m[1] || m[2]);

function score(account, bill) {
  const a = new Set(tokens(account.name));
  const b = new Set(tokens(bill.name));
  const inter = [...a].filter((t) => b.has(t)).length;
  const union = new Set([...a, ...b]).size || 1;
  let s = (inter / union) * 100;
  const digits = last4(account.name);
  const billText = `${bill.name} ${bill.notes || ''}`;
  if (digits.some((d) => billText.includes(d))) s += 60;
  return s;
}

// Proposes a bill for each account. Existing links win; otherwise greedy
// best-score-first so a bill is proposed for at most one account.
export function matchAccounts(accounts, bills) {
  const result = new Map(); // account.id -> { bill_id, confidence }
  const takenBills = new Set();

  for (const a of accounts) {
    const linked = bills.find((b) => b.monarch_account_id && String(b.monarch_account_id) === a.id);
    if (linked) {
      result.set(a.id, { bill_id: linked.id, confidence: 'linked' });
      takenBills.add(linked.id);
    }
  }
  const pairs = [];
  for (const a of accounts) {
    if (result.has(a.id)) continue;
    for (const b of bills) {
      if (takenBills.has(b.id)) continue;
      const s = score(a, b);
      if (s >= 50) pairs.push({ a, b, s });
    }
  }
  pairs.sort((x, y) => y.s - x.s);
  for (const { a, b, s } of pairs) {
    if (result.has(a.id) || takenBills.has(b.id)) continue;
    result.set(a.id, { bill_id: b.id, confidence: s >= 100 ? 'high' : 'likely' });
    takenBills.add(b.id);
  }
  return result;
}
