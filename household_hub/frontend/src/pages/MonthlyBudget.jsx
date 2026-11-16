import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Pencil, Scissors, X } from 'lucide-react';
import { api } from '../lib/api.js';
import { Card, StatCard } from '../components/Card.jsx';
import { formatCurrency } from '../lib/format.js';
import { daysUntilDue } from '../lib/dueDate.js';
import {
  monthlyFactor, monthlyEquivalent, isFlagged, monthlySavings, billKind, KIND_LABEL, scheduleLabel,
} from '../lib/budget.js';

const KIND_STYLE = {
  essential: 'bg-sky-500/15 text-sky-300',
  debt: 'bg-violet-500/15 text-violet-300',
  flexible: 'bg-amber-500/15 text-amber-300',
};

const MONARCH_SOURCE_LABEL = {
  monarch_streams: 'active recurring pay streams',
  monarch_average: '6-month average of paychecks',
  monarch_budget: 'budgeted paychecks',
};

const pct = (part, whole) => (whole > 0 ? (part / whole) * 100 : null);
const fmtPct = (n) => (n == null ? '—' : `${n.toFixed(n >= 10 ? 0 : 1)}%`);

export default function MonthlyBudget() {
  const [bills, setBills] = useState([]);
  const [paychecks, setPaychecks] = useState([]);
  const [income, setIncome] = useState(null);
  const [incomeSource, setIncomeSource] = useState(null);
  const [pendingSource, setPendingSource] = useState(null);
  const [monarch, setMonarch] = useState(null);
  const [incomeInput, setIncomeInput] = useState('');
  const [editingIncome, setEditingIncome] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reducingId, setReducingId] = useState(null);

  const load = () =>
    Promise.all([
      api.bills.list(),
      api.paychecks.list(),
      api.settings.get(),
      api.monarch.status().catch(() => null),
    ])
      .then(([b, p, s, m]) => {
        setBills(b);
        setPaychecks(p);
        setMonarch(m && m.last ? m : null);
        setIncomeSource(s.income_source);
        setIncome(s.monthly_income);
        setIncomeInput(s.monthly_income == null ? '' : String(s.monthly_income));
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  const saveIncome = async (value, source) => {
    setError(null);
    try {
      const s = await api.settings.update({ monthly_income: value, income_source: source });
      setIncomeSource(s.income_source);
      setIncome(s.monthly_income);
      setIncomeInput(s.monthly_income == null ? '' : String(s.monthly_income));
      setEditingIncome(false);
    } catch (err) {
      setError(err.message);
    }
  };

  const setTarget = async (bill, target) => {
    setError(null);
    try {
      await api.bills.setReduceTarget(bill.id, target);
      setReducingId(null);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  // Ongoing monthly cost only: weekly/monthly/yearly bills normalized to a
  // monthly amount. One-time bills are listed separately, not averaged in.
  const recurring = useMemo(
    () => bills.filter((b) => monthlyFactor(b.recurrence) > 0).sort((a, b) => monthlyEquivalent(b) - monthlyEquivalent(a)),
    [bills]
  );
  const oneTime = useMemo(() => bills.filter((b) => b.recurrence === 'once' && b.status !== 'paid'), [bills]);

  const total = recurring.reduce((sum, b) => sum + monthlyEquivalent(b), 0);
  const savings = recurring.reduce((sum, b) => sum + monthlySavings(b), 0);
  const afterCuts = total - savings;
  const hasIncome = income != null;
  const gap = hasIncome ? total - income : null; // > 0 means bills exceed income
  const stillToFind = gap != null && gap > 0 ? Math.max(0, gap - savings) : 0;
  const coveredPct = gap != null && gap > 0 ? Math.min(100, (savings / gap) * 100) : 0;
  const usedPct = hasIncome ? pct(total, income) : null;
  const usedTone = usedPct == null ? 'default' : usedPct > 100 ? 'danger' : usedPct > 80 ? 'warn' : 'good';

  const categories = useMemo(() => {
    const map = new Map();
    for (const b of recurring) {
      const key = b.category || 'Other';
      map.set(key, (map.get(key) || 0) + monthlyEquivalent(b));
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [recurring]);

  // Paychecks already planned for the next 30 days -- a one-click starting
  // point for the income field (their actual amount if recorded).
  const paycheckSuggestion = useMemo(() => {
    const upcoming = paychecks.filter((p) => {
      const d = daysUntilDue(p.pay_date);
      return d >= 0 && d <= 30;
    });
    return { count: upcoming.length, total: upcoming.reduce((sum, p) => sum + (Number(p.available) || 0), 0) };
  }, [paychecks]);

  // Where to look first when there's a shortfall: flexible spending, then
  // the debts costing the most interest. Essentials are left out.
  const candidates = useMemo(() => {
    if (!(gap > 0)) return [];
    const open = recurring.filter((b) => !isFlagged(b));
    const flexible = open.filter((b) => billKind(b) === 'flexible');
    const debts = open
      .filter((b) => billKind(b) === 'debt')
      .sort((a, b) => (Number(b.interest_rate) || 0) - (Number(a.interest_rate) || 0));
    return [...flexible.map((b) => ({ bill: b, why: 'Flexible spending' })), ...debts.map((b) => ({
      bill: b,
      why: b.interest_rate != null ? `Debt at ${Number(b.interest_rate).toFixed(2)}% APR` : 'Debt payment',
    }))].slice(0, 6);
  }, [recurring, gap]);

  if (loading) return <p className="text-slate-400">Loading…</p>;

  const renderAction = (b) => (
    <button
      onClick={() => setReducingId(reducingId === b.id ? null : b.id)}
      className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium ${
        isFlagged(b)
          ? 'bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
          : 'bg-white/5 text-slate-300 hover:bg-white/10'
      }`}
    >
      <Scissors size={12} />
      {isFlagged(b) ? `Save ${formatCurrency(monthlySavings(b))}/mo` : 'Reduce…'}
    </button>
  );

  const editor = (b) =>
    reducingId === b.id && (
      <ReduceEditor bill={b} onSave={(t) => setTarget(b, t)} onClear={() => setTarget(b, null)} onClose={() => setReducingId(null)} />
    );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Monthly Budget</h2>
        <p className="text-sm text-slate-400">
          Your scheduled bills as a typical month, set against your average monthly income -- and an inventory of
          what to reduce if they don't fit.
        </p>
      </div>

      {error && <p className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p>}

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">Average monthly income</p>
            {!editingIncome && (
              <p className="mt-1 text-2xl font-semibold">
                {hasIncome ? formatCurrency(income) : <span className="text-slate-500">Not set</span>}
              </p>
            )}
            {!editingIncome && hasIncome && incomeSource && (
              <p className="text-xs text-slate-500">
                {incomeSource === 'manual' ? 'Entered by hand' : `From Monarch: ${MONARCH_SOURCE_LABEL[incomeSource] || incomeSource}`}
              </p>
            )}
          </div>
          {!editingIncome && (
            <button
              onClick={() => setEditingIncome(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-sm hover:bg-white/5"
            >
              <Pencil size={13} /> {hasIncome ? 'Edit' : 'Enter income'}
            </button>
          )}
        </div>
        {editingIncome && (
          <form
            className="mt-3 flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              saveIncome(incomeInput === '' ? null : Number(incomeInput), pendingSource);
            }}
          >
            <input
              autoFocus
              type="number"
              step="0.01"
              min="0"
              value={incomeInput}
              onChange={(e) => { setIncomeInput(e.target.value); setPendingSource(null); }}
              placeholder="Take-home per month"
              className="w-48 rounded-lg border border-white/10 bg-surface-muted px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <button type="submit" className="rounded-lg bg-accent px-4 py-2 text-sm font-medium hover:bg-accent-soft">
              Save
            </button>
            <button
              type="button"
              onClick={() => { setEditingIncome(false); setIncomeInput(hasIncome ? String(income) : ''); }}
              className="rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-white/5"
            >
              Cancel
            </button>
            {hasIncome && (
              <button type="button" onClick={() => saveIncome(null, null)} className="px-2 text-xs text-slate-500 hover:text-rose-400">
                Clear
              </button>
            )}
          </form>
        )}
        {paycheckSuggestion.count > 0 && (!hasIncome || editingIncome) && (
          <p className="mt-3 text-xs text-slate-400">
            {paycheckSuggestion.count} paycheck{paycheckSuggestion.count === 1 ? '' : 's'} planned in the next 30 days
            total {formatCurrency(paycheckSuggestion.total)}.{' '}
            <button
              type="button"
              onClick={() => { setEditingIncome(true); setPendingSource(null); setIncomeInput(String(Math.round(paycheckSuggestion.total * 100) / 100)); }}
              className="text-accent-soft hover:underline"
            >
              Use that amount
            </button>
          </p>
        )}
        {monarch?.income && (!hasIncome || editingIncome) && (
          <div className="mt-3 text-xs text-slate-400">
            <p>From your Monarch import ({monarch.last.taken_at}) -- these can differ a lot, so pick deliberately:</p>
            <div className="mt-1 flex flex-wrap gap-2">
              {[
                ['Active pay streams', monarch.income.streams_total, 'monarch_streams'],
                ['6-month average', monarch.income.average, 'monarch_average'],
                ['Monarch budget', monarch.income.budget, 'monarch_budget'],
              ].map(([label, value, source]) =>
                value != null && value > 0 ? (
                  <button
                    key={label}
                    type="button"
                    onClick={() => { setEditingIncome(true); setPendingSource(source); setIncomeInput(String(Math.round(value * 100) / 100)); }}
                    className="rounded-md bg-white/5 px-2 py-1 text-slate-200 hover:bg-white/10"
                  >
                    {label}: {formatCurrency(value)}
                  </button>
                ) : null
              )}
            </div>
          </div>
        )}
        {!monarch && !hasIncome && (
          <p className="mt-2 text-xs text-slate-500">
            Tip: <Link to="/monarch" className="text-accent-soft hover:underline">import from Monarch</Link> to get income
            suggestions from your real pay history.
          </p>
        )}
        <p className="mt-2 text-xs text-slate-500">
          Use your usual take-home per month. If your pay varies, an average over several months is a safer number
          to plan against than your best month.
        </p>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Monthly income" value={hasIncome ? formatCurrency(income) : '—'} />
        <StatCard
          label="Bills per month"
          value={formatCurrency(total)}
          sub={`${recurring.length} recurring bill${recurring.length === 1 ? '' : 's'}, weekly & yearly normalized`}
        />
        <StatCard
          label={gap != null && gap > 0 ? 'Shortfall' : 'Left over'}
          value={hasIncome ? formatCurrency(Math.abs(income - total)) : '—'}
          tone={!hasIncome ? 'default' : gap > 0 ? 'danger' : 'good'}
          sub={hasIncome ? (gap > 0 ? 'bills exceed income' : 'after scheduled bills') : 'enter income to compare'}
        />
        <StatCard
          label="Income used by bills"
          value={fmtPct(usedPct)}
          tone={usedTone}
          sub={hasIncome ? 'above ~80% leaves little room for food, savings, surprises' : undefined}
        />
      </div>

      {hasIncome && gap > 0 && (
        <Card>
          <h3 className="text-sm font-semibold text-slate-200">Closing the gap</h3>
          <p className="mt-1 text-sm text-slate-300">
            Bills are {formatCurrency(gap)}/month more than income.{' '}
            {savings > 0 ? (
              <>
                Reductions you've flagged free up <strong className="text-emerald-300">{formatCurrency(savings)}</strong>/month
                {stillToFind > 0 ? <>, leaving <strong className="text-rose-300">{formatCurrency(stillToFind)}</strong> still to find.</> : ' -- that covers it.'}
              </>
            ) : (
              'Flag bills to reduce below to see how far each one gets you.'
            )}
          </p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full bg-emerald-500" style={{ width: `${coveredPct}%` }} />
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {fmtPct(coveredPct)} of the gap covered
            {savings > 0 && ` · bills would drop to ${formatCurrency(afterCuts)}/month`}
          </p>
        </Card>
      )}
      {hasIncome && gap <= 0 && (
        <Card>
          <p className="text-sm text-emerald-300">
            Your income covers your scheduled bills with {formatCurrency(-gap)}/month to spare.
          </p>
        </Card>
      )}

      {candidates.length > 0 && (
        <Card>
          <h3 className="text-sm font-semibold text-slate-200">Where to look first</h3>
          <p className="mb-3 mt-1 text-xs text-slate-500">
            Flexible spending first, then debts costing the most interest. Essentials (housing, utilities, insurance,
            food) aren't suggested. Categories are classified by name -- see the Type column.
          </p>
          <div className="space-y-2">
            {candidates.map(({ bill: b, why }) => (
              <div key={b.id}>
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-muted px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {b.name}
                      {Boolean(b.autopay) && (
                        <span className="ml-1.5 rounded bg-accent/15 px-1 py-0.5 text-[10px] font-normal text-accent-soft">Autopay</span>
                      )}
                    </p>
                    <p className="text-xs text-slate-400">
                      {why} · {formatCurrency(monthlyEquivalent(b))}/mo
                    </p>
                  </div>
                  {renderAction(b)}
                </div>
                {editor(b)}
              </div>
            ))}
          </div>
          {candidates.some((c) => billKind(c.bill) === 'debt') && (
            <p className="mt-3 text-xs text-slate-500">
              For debts, <Link to="/debt-management" className="text-accent-soft hover:underline">Debt Management</Link>{' '}
              shows how paying extra or changing payoff order affects interest.
            </p>
          )}
        </Card>
      )}

      <Card>
        <h3 className="mb-3 text-sm font-semibold text-slate-200">Where the money goes</h3>
        {categories.length === 0 && <p className="text-sm text-slate-500">No recurring bills yet.</p>}
        <div className="space-y-2">
          {categories.map(([name, amount]) => {
            const share = pct(amount, total) || 0;
            return (
              <div key={name}>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-300">{name}</span>
                  <span className="text-slate-400">
                    {formatCurrency(amount)}/mo · {fmtPct(share)} of bills
                    {hasIncome && ` · ${fmtPct(pct(amount, income))} of income`}
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full bg-accent" style={{ width: `${share}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-slate-200">Scheduled bills</h3>

        <div className="space-y-3 lg:hidden">
          {recurring.map((b) => (
            <div key={b.id}>
              <div className="rounded-xl2 border border-white/5 bg-surface-raised p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{b.name}</p>
                    <p className="text-xs text-slate-400">{scheduleLabel(b)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">{formatCurrency(monthlyEquivalent(b))}/mo</p>
                    <p className="text-xs text-slate-500">
                      {formatCurrency(b.amount)} {b.recurrence === 'monthly' ? '' : `per ${b.recurrence === 'weekly' ? 'week' : 'year'}`}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${KIND_STYLE[billKind(b)]}`}>{KIND_LABEL[billKind(b)]}</span>
                    {hasIncome && <span className="text-xs text-slate-500">{fmtPct(pct(monthlyEquivalent(b), income))} of income</span>}
                  </div>
                  {renderAction(b)}
                </div>
              </div>
              {editor(b)}
            </div>
          ))}
        </div>

        <Card className="hidden overflow-x-auto lg:block" padding="p-0">
          <table className="w-full text-sm">
            <thead className="bg-surface-muted text-left text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-3">Bill</th>
                <th className="px-4 py-3">Schedule</th>
                <th className="px-4 py-3">Per payment</th>
                <th className="px-4 py-3">Per month</th>
                <th className="px-4 py-3">% of income</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {recurring.map((b) => (
                <React.Fragment key={b.id}>
                  <tr className="border-t border-white/5">
                    <td className="px-4 py-3 font-medium">
                      {b.name}
                      {Boolean(b.autopay) && (
                        <span className="ml-1.5 rounded bg-accent/15 px-1 py-0.5 text-[10px] font-normal text-accent-soft">Autopay</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-400">{scheduleLabel(b)}</td>
                    <td className="px-4 py-3">{formatCurrency(b.amount)}</td>
                    <td className="px-4 py-3 font-medium">{formatCurrency(monthlyEquivalent(b))}</td>
                    <td className="px-4 py-3 text-slate-400">{hasIncome ? fmtPct(pct(monthlyEquivalent(b), income)) : '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${KIND_STYLE[billKind(b)]}`}>{KIND_LABEL[billKind(b)]}</span>
                    </td>
                    <td className="px-4 py-3 text-right">{renderAction(b)}</td>
                  </tr>
                  {reducingId === b.id && (
                    <tr className="border-t border-white/5 bg-surface-muted/40">
                      <td colSpan={7} className="px-4 py-3">{editor(b)}</td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
              {recurring.length > 0 && (
                <tr className="border-t border-white/10 bg-surface-muted font-semibold">
                  <td className="px-4 py-3" colSpan={3}>Total per month</td>
                  <td className="px-4 py-3">{formatCurrency(total)}</td>
                  <td className="px-4 py-3 text-slate-400">{hasIncome ? fmtPct(usedPct) : '—'}</td>
                  <td colSpan={2}></td>
                </tr>
              )}
              {recurring.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    No recurring bills yet -- add some on the Bills page.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>

        {oneTime.length > 0 && (
          <p className="mt-3 text-xs text-slate-500">
            Not included above: {oneTime.length} one-time bill{oneTime.length === 1 ? '' : 's'} (
            {formatCurrency(oneTime.reduce((sum, b) => sum + (Number(b.amount) || 0), 0))} total) -- they're a
            one-off cost, not part of a typical month.
          </p>
        )}
      </div>
    </div>
  );
}

// Inline editor: the per-payment amount a bill could drop to (0 = cancel).
function ReduceEditor({ bill, onSave, onClear, onClose }) {
  const [value, setValue] = useState(bill.reduce_target == null ? '' : String(bill.reduce_target));
  const [saving, setSaving] = useState(false);
  const amount = Number(bill.amount) || 0;
  const target = value === '' ? null : Number(value);
  const valid = target != null && Number.isFinite(target) && target >= 0 && target < amount;
  const preview = valid ? (amount - target) * monthlyFactor(bill.recurrence) : 0;
  const round = (n) => String(Math.round(n * 100) / 100);

  return (
    <div className="mt-2 rounded-lg border border-white/10 bg-surface-muted p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-slate-300">
          Reduce {bill.name} (currently {formatCurrency(amount)} per payment) to:
        </p>
        <button onClick={onClose} title="Close" className="text-slate-500 hover:text-white">
          <X size={14} />
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          type="number"
          step="0.01"
          min="0"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="New amount"
          className="w-32 rounded-lg border border-white/10 bg-surface px-3 py-1.5 text-sm outline-none focus:border-accent"
        />
        {[['Cancel', 0], ['-10%', 0.9], ['-25%', 0.75], ['-50%', 0.5]].map(([label, mult]) => (
          <button
            key={label}
            type="button"
            onClick={() => setValue(round(amount * mult))}
            className="rounded-md bg-white/5 px-2 py-1 text-xs text-slate-300 hover:bg-white/10"
          >
            {label}
          </button>
        ))}
      </div>
      {value !== '' && !valid && (
        <p className="mt-2 text-xs text-amber-400">Enter an amount below {formatCurrency(amount)} (0 cancels it).</p>
      )}
      {valid && <p className="mt-2 text-xs text-emerald-300">Frees up {formatCurrency(preview)} per month.</p>}
      <div className="mt-3 flex items-center gap-2">
        <button
          disabled={!valid || saving}
          onClick={async () => { setSaving(true); await onSave(target); setSaving(false); }}
          className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium hover:bg-accent-soft disabled:opacity-40"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        {bill.reduce_target != null && (
          <button onClick={onClear} className="px-2 text-xs text-slate-400 hover:text-rose-400">
            Remove from list
          </button>
        )}
      </div>
    </div>
  );
}
