import { Router } from 'express';
import db from '../db/index.js';
import { BILLS_WITH_CATEGORY_SELECT } from '../db/billQueries.js';
import { setSetting } from '../db/settingsStore.js';
import {
  validateSnapshot, computeIncome, matchAccounts, amountOwed, categoryForAccountType,
} from '../services/monarchSnapshot.js';

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

export default router;
