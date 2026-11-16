// Matching logic for the Monarch review: which transactions look like payments
// of which bills, and how Monarch's recurring expense streams line up with the
// bills tracked here. Pure functions over plain data -- no database access.
import { advanceDueDate } from './recurrence.js';
import { tokens, monthlyFactor, daysBetween, ACTIVE_WINDOW_DAYS } from './monarchSnapshot.js';

const addDays = (iso, n) => {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// Share of `a`'s tokens that also appear in `b` (0..1). Asymmetric on purpose:
// a bill called "Verizon" is fully contained in a merchant "VERIZON WIRELESS
// AUTOPAY", but not the other way around.
function containment(a, b) {
  const A = new Set(a);
  if (!A.size) return 0;
  const B = new Set(b);
  let hit = 0;
  for (const t of A) if (B.has(t)) hit++;
  return hit / A.size;
}

const billTokens = (bill) => tokens(`${bill.name} ${bill.payee || ''}`);

// ------------------------------------------------------- payment detection ---

// Due dates a payment could be settling right now: every cycle already due
// plus the next one if it's within 10 days (people pay a little early).
export function candidateCycles(bill, today) {
  if (bill.recurrence === 'once') return bill.status === 'paid' ? [] : [bill.due_date];
  const limit = addDays(today, 10);
  const out = [];
  let d = bill.due_date;
  while (d <= limit && out.length < 60) {
    out.push(d);
    d = advanceDueDate(d, bill.recurrence, bill.due_day);
  }
  return out;
}

function scorePair(bill, tx) {
  const contain = containment(billTokens(bill), tokens(tx.merchant));
  const diff = Math.abs(tx.amount - Number(bill.amount));
  const tol = Math.max(1, Number(bill.amount) * 0.05);
  const exact = diff <= Math.max(0.5, Number(bill.amount) * 0.01);
  const near = diff <= tol;
  // Debt payments are often more than the minimum, so any amount at or above
  // half the usual payment counts; everything else has to be close.
  const amountOk = bill.category_is_debt ? tx.amount >= Number(bill.amount) * 0.5 : near;
  const ok = (contain >= 0.5 && amountOk) || (contain >= 0.25 && exact);
  if (!ok) return null;
  return {
    score: contain * 100 + (exact ? 30 : near ? 10 : 0),
    confidence: contain >= 0.99 && exact ? 'high' : 'likely',
    amount_diff: Math.round((tx.amount - Number(bill.amount)) * 100) / 100,
  };
}

// Suggests which bill each recent Monarch transaction paid.
//  - loggedTxnIds: Monarch transaction ids already turned into payments
//  - existingPayments: payments already in the app (to avoid double-logging a
//    payment the user entered by hand)
//  - dismissed: Set of transaction ids the user said to ignore
export function suggestPayments(snapshot, bills, { loggedTxnIds, existingPayments, dismissed, today }) {
  const txs = (snapshot.transactions || [])
    .filter((t) => !loggedTxnIds.has(t.id) && !dismissed.has(t.id) && t.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date));

  const open = bills.filter((b) => b.recurrence !== 'once' || b.status !== 'paid');
  const cyclesByBill = new Map(open.map((b) => [b.id, candidateCycles(b, today)]));
  const used = new Map(); // bill.id -> number of cycles already consumed
  let alreadyLogged = 0;
  const suggestions = [];

  for (const tx of txs) {
    let best = null;
    for (const bill of open) {
      const s = scorePair(bill, tx);
      if (!s) continue;
      if (!best || s.score > best.s.score) best = { bill, s };
    }
    if (!best) continue;
    const { bill, s } = best;

    // Already entered by hand? Same bill, same amount, within a few days.
    const manual = existingPayments.some(
      (p) => p.bill_id === bill.id && Math.abs(Number(p.amount_paid) - tx.amount) <= 0.01 &&
        Math.abs(daysBetween(String(p.paid_date).slice(0, 10), tx.date)) <= 5
    );
    if (manual) { alreadyLogged++; continue; }

    // Each payment settles one cycle, oldest first, and only if it isn't
    // before that cycle's window opens (10 days ahead of the due date).
    const cycles = cyclesByBill.get(bill.id);
    const idx = used.get(bill.id) || 0;
    const cycle = cycles[idx];
    if (!cycle || tx.date < addDays(cycle, -10)) continue;
    used.set(bill.id, idx + 1);

    suggestions.push({
      transaction: tx,
      bill: {
        id: bill.id, name: bill.name, amount: bill.amount, due_date: bill.due_date,
        recurrence: bill.recurrence, category_is_debt: bill.category_is_debt,
      },
      cycle_due: cycle,
      confidence: s.confidence,
      amount_diff: s.amount_diff,
    });
  }
  return { suggestions, already_logged: alreadyLogged };
}

// ---------------------------------------------------- recurring reconciliation ---

export function streamActive(stream, takenAt) {
  return Boolean(stream.last_paid_date) && daysBetween(takenAt, stream.last_paid_date) <= ACTIVE_WINDOW_DAYS;
}

// How a Monarch frequency maps onto what a bill can express (weekly, monthly,
// yearly). Biweekly and semimonthly become the equivalent monthly amount.
export function billShapeForStream(stream) {
  const f = String(stream.frequency || '').toLowerCase();
  const amt = (n) => Math.round(n * 100) / 100;
  if (f.includes('semimonthly') || f.includes('twice_monthly')) {
    return { recurrence: 'monthly', amount: amt(stream.amount * 2), note: 'twice a month, combined into one monthly amount' };
  }
  if (f.includes('biweekly') || f.includes('every_two_weeks')) {
    return { recurrence: 'monthly', amount: amt((stream.amount * 26) / 12), note: 'every two weeks, converted to a monthly amount' };
  }
  if (f.includes('weekly')) return { recurrence: 'weekly', amount: amt(stream.amount), note: null };
  if (f.includes('quarterly')) return { recurrence: 'monthly', amount: amt(stream.amount / 3), note: 'quarterly, converted to a monthly amount' };
  if (f.includes('yearly') || f.includes('annual')) return { recurrence: 'yearly', amount: amt(stream.amount), note: null };
  if (f.includes('monthly')) return { recurrence: 'monthly', amount: amt(stream.amount), note: null };
  return null;
}

export function reconcileStreams(snapshot, bills, { dismissed, categories }) {
  const streams = snapshot.recurring_expenses || [];
  const recurring = bills.filter((b) => b.recurrence !== 'once');
  const takenAt = snapshot.taken_at;

  const matchOf = new Map(); // stream.id -> bill
  const takenBills = new Set();
  for (const s of streams) {
    const linked = recurring.find((b) => b.monarch_stream_id && b.monarch_stream_id === s.id);
    if (linked) { matchOf.set(s.id, { bill: linked, how: 'linked' }); takenBills.add(linked.id); }
  }
  const pairs = [];
  for (const s of streams) {
    if (matchOf.has(s.id)) continue;
    const st = tokens(`${s.name} ${s.merchant}`);
    for (const b of recurring) {
      if (takenBills.has(b.id) || b.monarch_account_id) continue;
      const bt = billTokens(b);
      const score = Math.max(containment(bt, st), containment(st, bt));
      if (score >= 0.6) pairs.push({ s, b, score });
    }
  }
  pairs.sort((x, y) => y.score - x.score);
  for (const { s, b } of pairs) {
    if (matchOf.has(s.id) || takenBills.has(b.id)) continue;
    matchOf.set(s.id, { bill: b, how: 'name' });
    takenBills.add(b.id);
  }

  const catByLower = new Map(categories.map((c) => [c.name.toLowerCase(), c.name]));
  const matched = [];
  const added = [];
  const stale = [];
  for (const s of streams) {
    const active = streamActive(s, takenAt);
    const m = matchOf.get(s.id);
    if (m) {
      const shape = billShapeForStream(s);
      // Compare like with like: per-payment when the cadence matches, else per month.
      const sameCadence = shape && shape.recurrence === m.bill.recurrence;
      const streamAmt = sameCadence ? shape.amount : s.amount * (monthlyFactor(s.frequency) ?? 1);
      const billAmt = sameCadence ? Number(m.bill.amount) : Number(m.bill.amount) * (monthlyFactor(m.bill.recurrence) ?? 1);
      const diff = Math.round((streamAmt - billAmt) * 100) / 100;
      // A price change of ~2% or $0.50 is worth surfacing (rent/phone/insurance
      // increases are exactly what people miss).
      const drift = Math.abs(diff) > Math.max(0.5, billAmt * 0.02);
      matched.push({
        stream: s, active, how: m.how,
        bill: { id: m.bill.id, name: m.bill.name, amount: m.bill.amount, recurrence: m.bill.recurrence },
        drift, new_amount: drift && sameCadence ? shape.amount : null, diff,
      });
    } else if (!active) {
      stale.push({ stream: s, reason: s.last_paid_date ? `last paid ${s.last_paid_date}` : 'no payment seen' });
    } else if (!dismissed.has(s.id)) {
      const shape = billShapeForStream(s);
      added.push({
        stream: s,
        can_add: Boolean(shape),
        suggested: shape && {
          name: s.name,
          amount: shape.amount,
          recurrence: shape.recurrence,
          due_date: s.next_date,
          category: catByLower.get(s.category.toLowerCase()) || 'Other',
          note: shape.note,
        },
      });
    }
  }

  // Recurring bills that no Monarch stream accounts for -- possibly cancelled
  // or forgotten. Debt accounts are tracked through their account, not a stream.
  const unseen = recurring
    .filter((b) => !takenBills.has(b.id) && !b.monarch_account_id && !(b.category_is_debt && b.current_balance != null))
    .map((b) => ({ id: b.id, name: b.name, amount: b.amount, recurrence: b.recurrence, category: b.category, autopay: b.autopay }));

  return { matched, new: added, stale, unseen };
}
