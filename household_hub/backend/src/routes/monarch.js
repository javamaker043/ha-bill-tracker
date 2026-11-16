import { Router } from 'express';
import db from '../db/index.js';
import { BILLS_WITH_CATEGORY_SELECT } from '../db/billQueries.js';
import { setSetting } from '../db/settingsStore.js';
import {
  validateSnapshot, computeIncome, matchAccounts, amountOwed, categoryForAccountType,
} from '../services/monarchSnapshot.js';
import { suggestPayments, reconcileStreams } from '../services/monarchMatching.js';
import { recordPayment } from '../services/payments.js';
import { localToday } from '../services/dateUtil.js';

const router = Router();

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const isIso = (v) => typeof v === 'string' && ISO_DATE.test(v) && new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v;
const RECURRENCES = ['weekly', 'monthly', 'yearly', 'once'];
const rateOf = (a) => (a.apr != null ? a.apr : a.interest_rate);

function lastSnapshot() {
  const row = db.prepare('SELECT * FROM monarch_snapshots ORDER BY id DESC LIMIT 1').get();
  if (!row) return null;
  try {
    return { row, snapshot: JSON.parse(row.payload) };
  } catch {
    return null;
  }
}

// When was the last import, and what income figures did it support (for the
// Monthly Budget income suggestions)?
router.get('/status', (_req, res) => {
  const last = lastSnapshot();
  if (!last) return res.json({ last: null, income: null });
  res.json({
    last: { taken_at: last.row.taken_at, applied_at: last.row.applied_at, summary: last.row.summary },
    income: computeIncome(last.snapshot),
  });
});

// Dry run: nothing is written. Returns what the snapshot contains and how it
// would line up with existing bills, for the user to review and adjust.
router.post('/preview', (req, res) => {
  const { snapshot, errors } = validateSnapshot(req.body?.snapshot);
  if (!snapshot) return res.status(400).json({ error: errors.join(' '), errors });

  const bills = db.prepare(BILLS_WITH_CATEGORY_SELECT).all();
  // One-time bills aren't candidates: a debt account mirrors an ongoing bill.
  const matches = matchAccounts(snapshot.accounts, bills.filter((b) => b.recurrence !== 'once'));
  const billById = new Map(bills.map((b) => [b.id, b]));
  const warnings = [];

  const accounts = snapshot.accounts.map((a) => {
    const m = matches.get(a.id) || null;
    const bill = m ? billById.get(m.bill_id) : null;
    const rate = rateOf(a);
    const w = [];
    if (a.balance > 0) w.push('Positive balance (a credit): nothing owed will be recorded.');
    if (rate == null) w.push('No APR/interest rate in Monarch.');
    if (a.minimum_payment == null) w.push('No minimum payment in Monarch.');
    if (bill && !bill.category_is_debt) {
      w.push(`Bill category "${bill.category}" isn't marked as debt, so Debt Management won't list it.`);
    }
    return {
      ...a,
      owed: amountOwed(a),
      rate,
      suggested_category: categoryForAccountType(a.type),
      match: m,
      bill: bill && {
        id: bill.id, name: bill.name, amount: bill.amount, category: bill.category,
        category_is_debt: bill.category_is_debt, current_balance: bill.current_balance,
        interest_rate: bill.interest_rate, monarch_account_id: bill.monarch_account_id,
      },
      warnings: w,
    };
  });

  if (snapshot.accounts.length && snapshot.accounts.every((a) => a.balance > 0)) {
    warnings.push('Every balance is positive. Monarch reports debts as negative numbers -- check the snapshot.');
  }
  const missing = accounts.filter((a) => a.rate == null || a.minimum_payment == null).length;
  if (missing) {
    warnings.push(
      `${missing} account${missing === 1 ? ' has' : 's have'} no APR and/or minimum payment in Monarch. ` +
      'Payoff plans need both; fill them in Monarch or on the bill here.'
    );
  }

  res.json({
    taken_at: snapshot.taken_at,
    income: computeIncome(snapshot),
    extras: { recurring_expenses: snapshot.recurring_expenses.length, transactions: snapshot.transactions.length },
    accounts,
    bills: bills
      .filter((b) => b.recurrence !== 'once')
      .map((b) => ({ id: b.id, name: b.name, category: b.category, category_is_debt: b.category_is_debt, monarch_account_id: b.monarch_account_id })),
    warnings,
  });
});

// Applies the user's decisions from the preview, atomically. Re-validates the
// snapshot and every id -- the request is not trusted just because the
// preview produced it.
router.post('/apply', (req, res) => {
  const { snapshot, errors } = validateSnapshot(req.body?.snapshot);
  if (!snapshot) return res.status(400).json({ error: errors.join(' '), errors });
  const decisions = Array.isArray(req.body.accounts) ? req.body.accounts : [];
  const income = req.body.income;

  const byId = new Map(snapshot.accounts.map((a) => [a.id, a]));
  const plan = [];
  for (const d of decisions) {
    const account = byId.get(String(d?.account_id));
    if (!account) return res.status(400).json({ error: `Unknown account ${JSON.stringify(d?.account_id)}.` });
    if (d.action === 'skip' || d.action == null) continue;
    if (d.action === 'link') {
      const bill = db.prepare('SELECT * FROM bills WHERE id = ?').get(d.bill_id);
      if (!bill) return res.status(400).json({ error: `Bill ${d.bill_id} no longer exists (account "${account.name}").` });
      plan.push({ account, action: 'link', bill, update: d.update || {} });
    } else if (d.action === 'create') {
      const c = d.create || {};
      const name = String(c.name ?? account.name).trim();
      if (!name) return res.status(400).json({ error: `A name is required to create a bill for "${account.name}".` });
      if (!isIso(c.due_date)) return res.status(400).json({ error: `A valid due date is required to create "${name}".` });
      const recurrence = c.recurrence || 'monthly';
      if (!RECURRENCES.includes(recurrence)) return res.status(400).json({ error: `Invalid recurrence for "${name}".` });
      const amount = c.amount === '' || c.amount == null ? (account.minimum_payment ?? 0) : Number(c.amount);
      if (!Number.isFinite(amount) || amount < 0) return res.status(400).json({ error: `Invalid amount for "${name}".` });
      plan.push({ account, action: 'create', create: { name, due_date: c.due_date, recurrence, amount }, update: d.update || {} });
    } else {
      return res.status(400).json({ error: `Unknown action ${JSON.stringify(d.action)}.` });
    }
  }

  let incomeValue = null;
  if (income && income.value !== undefined && income.value !== null && income.value !== '') {
    incomeValue = Number(income.value);
    if (!Number.isFinite(incomeValue) || incomeValue < 0) {
      return res.status(400).json({ error: 'Income must be a non-negative number.' });
    }
  }

  const result = { linked: 0, created: 0, balances_updated: 0, income_set: false };

  db.transaction(() => {
    for (const p of plan) {
      const { account, update } = p;
      let billId;
      if (p.action === 'create') {
        const category = categoryForAccountType(account.type);
        // A newly created debt category is marked as debt; an existing one
        // keeps whatever the household chose in Settings.
        if (!db.prepare('SELECT 1 FROM categories WHERE name = ?').get(category)) {
          db.prepare('INSERT INTO categories (name, is_debt) VALUES (?, 1)').run(category);
        }
        const info = db
          .prepare(
            `INSERT INTO bills (name, amount, category, recurrence, due_date, due_day, current_balance, interest_rate)
             VALUES (?, ?, ?, ?, ?, ?, NULL, NULL)`
          )
          .run(p.create.name, p.create.amount, category, p.create.recurrence, p.create.due_date, Number(p.create.due_date.slice(8, 10)));
        billId = info.lastInsertRowid;
        result.created++;
      } else {
        billId = p.bill.id;
        result.linked++;
      }

      // One Monarch account mirrors one bill.
      db.prepare('UPDATE bills SET monarch_account_id = NULL WHERE monarch_account_id = ? AND id != ?').run(account.id, billId);
      db.prepare('UPDATE bills SET monarch_account_id = ? WHERE id = ?').run(account.id, billId);

      if (update.balance !== false) {
        db.prepare("UPDATE bills SET current_balance = ?, balance_as_of = ?, updated_at = datetime('now') WHERE id = ?")
          .run(amountOwed(account), snapshot.taken_at, billId);
        result.balances_updated++;
      }
      const rate = rateOf(account);
      if (update.rate !== false && rate != null) {
        db.prepare('UPDATE bills SET interest_rate = ? WHERE id = ?').run(rate, billId);
      }
      if (update.payment === true && account.minimum_payment != null) {
        db.prepare('UPDATE bills SET amount = ? WHERE id = ?').run(account.minimum_payment, billId);
      }
    }

    if (incomeValue !== null) {
      setSetting('monthly_income', incomeValue);
      setSetting('income_source', ['streams', 'average', 'budget'].includes(income.source) ? `monarch_${income.source}` : 'manual');
      result.income_set = true;
    }

    const summary = `${result.linked} linked, ${result.created} created, ${result.balances_updated} balances updated` +
      (result.income_set ? ', income set' : '');
    db.prepare('INSERT INTO monarch_snapshots (taken_at, summary, payload) VALUES (?, ?, ?)')
      .run(snapshot.taken_at, summary, JSON.stringify(snapshot));
    db.prepare('DELETE FROM monarch_snapshots WHERE id NOT IN (SELECT id FROM monarch_snapshots ORDER BY id DESC LIMIT 5)').run();
  })();

  res.json(result);
});

// ------------------------------------------------- suggested payments (P2) ---

const dismissedSet = (kind) =>
  new Set(db.prepare('SELECT ref FROM monarch_dismissed WHERE kind = ?').all(kind).map((r) => r.ref));

// Recent Monarch transactions that look like payments of bills here. Computed
// fresh from the latest snapshot every time, so it always reflects what has
// already been logged since.
router.get('/suggestions', (_req, res) => {
  const last = lastSnapshot();
  if (!last) return res.json({ taken_at: null, suggestions: [], already_logged: 0 });
  const bills = db.prepare(BILLS_WITH_CATEGORY_SELECT).all();
  const loggedTxnIds = new Set(
    db.prepare('SELECT monarch_transaction_id AS id FROM bill_payments WHERE monarch_transaction_id IS NOT NULL').all().map((r) => r.id)
  );
  const existingPayments = db.prepare('SELECT bill_id, amount_paid, paid_date FROM bill_payments').all();
  const out = suggestPayments(last.snapshot, bills, {
    loggedTxnIds, existingPayments, dismissed: dismissedSet('transaction'), today: localToday(),
  });
  res.json({ taken_at: last.snapshot.taken_at, ...out });
});

// Log the payments the user accepted. Each goes through the same recordPayment
// path as "Mark paid", oldest first so a bill's due date advances in order;
// one failing item doesn't stop the rest.
router.post('/suggestions/apply', (req, res) => {
  const last = lastSnapshot();
  if (!last) return res.status(400).json({ error: 'Import a Monarch snapshot first.' });
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  const txById = new Map((last.snapshot.transactions || []).map((t) => [t.id, t]));

  const resolved = [];
  const failed = [];
  for (const it of items) {
    const tx = txById.get(String(it?.transaction_id));
    if (!tx) { failed.push({ transaction_id: it?.transaction_id, error: 'That transaction is not in the latest snapshot.' }); continue; }
    resolved.push({ tx, bill_id: it.bill_id, paid_by: it.paid_by });
  }
  resolved.sort((a, b) => a.tx.date.localeCompare(b.tx.date));

  let applied = 0;
  for (const r of resolved) {
    const bill = db.prepare('SELECT * FROM bills WHERE id = ?').get(r.bill_id);
    if (!bill) { failed.push({ transaction_id: r.tx.id, error: 'That bill no longer exists.' }); continue; }
    const result = recordPayment(bill, {
      amount_paid: r.tx.amount,
      paid_date: r.tx.date,
      paid_by: r.paid_by || null,
      source: r.tx.account ? `Monarch: ${r.tx.account}` : 'Monarch',
      monarch_transaction_id: r.tx.id,
    });
    if (result.error) failed.push({ transaction_id: r.tx.id, error: result.error.message });
    else applied++;
  }
  res.json({ applied, failed });
});

router.post('/suggestions/dismiss', (req, res) => {
  const id = req.body?.transaction_id;
  if (id == null || String(id).trim() === '') return res.status(400).json({ error: 'transaction_id is required' });
  db.prepare("INSERT OR IGNORE INTO monarch_dismissed (kind, ref) VALUES ('transaction', ?)").run(String(id));
  res.json({ ok: true });
});

// ---------------------------------------- recurring bills reconciliation (P2) ---

router.get('/reconcile', (_req, res) => {
  const last = lastSnapshot();
  if (!last) return res.json({ taken_at: null, matched: [], new: [], stale: [], unseen: [] });
  const bills = db.prepare(BILLS_WITH_CATEGORY_SELECT).all();
  const categories = db.prepare('SELECT name FROM categories').all();
  const out = reconcileStreams(last.snapshot, bills, { dismissed: dismissedSet('stream'), categories });
  res.json({ taken_at: last.snapshot.taken_at, ...out });
});

router.post('/reconcile/apply', (req, res) => {
  const actions = Array.isArray(req.body?.actions) ? req.body.actions : [];
  const plan = [];
  for (const a of actions) {
    if (a.type === 'add') {
      const name = String(a.name ?? '').trim();
      const amount = Number(a.amount);
      if (!name) return res.status(400).json({ error: 'A name is required to add a bill.' });
      if (!isIso(a.due_date)) return res.status(400).json({ error: `A valid due date is required to add "${name}".` });
      if (!Number.isFinite(amount) || amount < 0) return res.status(400).json({ error: `Invalid amount for "${name}".` });
      if (!RECURRENCES.includes(a.recurrence)) return res.status(400).json({ error: `Invalid recurrence for "${name}".` });
      plan.push({ ...a, name, amount });
    } else if (a.type === 'update_amount' || a.type === 'link') {
      const bill = db.prepare('SELECT * FROM bills WHERE id = ?').get(a.bill_id);
      if (!bill) return res.status(400).json({ error: `Bill ${a.bill_id} no longer exists.` });
      if (a.type === 'update_amount') {
        const amount = Number(a.amount);
        if (!Number.isFinite(amount) || amount < 0) return res.status(400).json({ error: `Invalid amount for "${bill.name}".` });
        plan.push({ ...a, amount });
      } else plan.push(a);
    } else if (a.type === 'ignore') {
      plan.push(a);
    } else {
      return res.status(400).json({ error: `Unknown action ${JSON.stringify(a.type)}.` });
    }
  }
  for (const a of plan) {
    if (a.stream_id == null || String(a.stream_id) === '') return res.status(400).json({ error: 'stream_id is required.' });
  }

  const result = { added: 0, updated: 0, linked: 0, ignored: 0 };
  db.transaction(() => {
    for (const a of plan) {
      const streamId = String(a.stream_id);
      if (a.type === 'ignore') {
        db.prepare("INSERT OR IGNORE INTO monarch_dismissed (kind, ref) VALUES ('stream', ?)").run(streamId);
        result.ignored++;
        continue;
      }
      let billId = a.bill_id;
      if (a.type === 'add') {
        const category = String(a.category || 'Other').trim() || 'Other';
        db.prepare('INSERT OR IGNORE INTO categories (name) VALUES (?)').run(category);
        const info = db
          .prepare(
            `INSERT INTO bills (name, amount, category, recurrence, due_date, due_day, monarch_stream_id)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          )
          .run(a.name, a.amount, category, a.recurrence, a.due_date, Number(a.due_date.slice(8, 10)), streamId);
        billId = info.lastInsertRowid;
        result.added++;
        continue;
      }
      // One stream maps to one bill.
      db.prepare('UPDATE bills SET monarch_stream_id = NULL WHERE monarch_stream_id = ? AND id != ?').run(streamId, billId);
      db.prepare('UPDATE bills SET monarch_stream_id = ? WHERE id = ?').run(streamId, billId);
      if (a.type === 'update_amount') {
        db.prepare("UPDATE bills SET amount = ?, updated_at = datetime('now') WHERE id = ?").run(a.amount, billId);
        result.updated++;
      } else {
        result.linked++;
      }
    }
  })();
  res.json(result);
});

export default router;
