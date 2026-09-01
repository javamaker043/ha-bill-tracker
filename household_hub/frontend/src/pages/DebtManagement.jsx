import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { Card, StatCard } from '../components/Card.jsx';
import { formatCurrency } from '../lib/format.js';
import { simulatePayoff, utilizationTone } from '../lib/debtPayoff.js';

export default function DebtManagement() {
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState('');
  const [extraPayment, setExtraPayment] = useState('');

  useEffect(() => {
    api.bills.list().then((all) => {
      setBills(all);
      setLoading(false);
    });
  }, []);

  // Debt Management only makes sense for accounts that carry a running
  // balance (credit cards, loans) and actually have one right now.
  const debts = useMemo(
    () => bills.filter((b) => b.category_is_debt && Number(b.current_balance) > 0),
    [bills]
  );

  useEffect(() => {
    if (debts.length && !debts.some((b) => String(b.id) === selectedId)) {
      setSelectedId(String(debts[0].id));
    }
  }, [debts, selectedId]);

  const totals = useMemo(() => {
    const totalBalance = debts.reduce((sum, b) => sum + Number(b.current_balance || 0), 0);
    const totalLimit = debts.reduce((sum, b) => sum + Number(b.credit_limit || 0), 0);
    const totalMinPayment = debts.reduce((sum, b) => sum + Number(b.amount || 0), 0);
    const utilization = totalLimit > 0 ? (totalBalance / totalLimit) * 100 : null;
    return { totalBalance, totalLimit, totalMinPayment, utilization };
  }, [debts]);

  const selected = debts.find((b) => String(b.id) === selectedId) || null;
  const extra = Number(extraPayment) || 0;
  const baseline = selected ? simulatePayoff(selected.current_balance, selected.interest_rate, selected.amount) : null;
  const accelerated = selected
    ? simulatePayoff(selected.current_balance, selected.interest_rate, Number(selected.amount) + extra)
    : null;

  if (loading) return <p className="text-slate-400">Loading…</p>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Debt Management</h2>
        <p className="text-sm text-slate-400">
          Track credit utilization and see how paying extra on a card changes its payoff timeline.
        </p>
      </div>

      {debts.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-400">
            No debt accounts yet. A bill in a <strong>Credit Cards</strong> or <strong>Short-Term Loans</strong>{' '}
            category (or any category with "credit" or "loan" in its name) shows up here once it has a
            balance -- add one from the Bills page, or edit an existing bill and set its current statement
            balance, interest rate, and credit limit.
          </p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total debt balance" value={formatCurrency(totals.totalBalance)} />
            <StatCard label="Total credit limit" value={totals.totalLimit > 0 ? formatCurrency(totals.totalLimit) : '—'} />
            <StatCard
              label="Overall utilization"
              value={totals.utilization != null ? `${totals.utilization.toFixed(1)}%` : '—'}
              tone={utilizationTone(totals.utilization)}
            />
            <StatCard label="Monthly minimum payments" value={formatCurrency(totals.totalMinPayment)} />
          </div>

          <Card className="overflow-x-auto" padding="p-0">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-surface-muted text-left text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-4 py-3">Account</th>
                  <th className="px-4 py-3">Balance</th>
                  <th className="px-4 py-3">Limit</th>
                  <th className="px-4 py-3">Utilization</th>
                  <th className="px-4 py-3">APR</th>
                  <th className="px-4 py-3">Min payment</th>
                  <th className="px-4 py-3">Payoff at minimum</th>
                </tr>
              </thead>
              <tbody>
                {debts.map((b) => {
                  const util = b.credit_limit ? (Number(b.current_balance) / Number(b.credit_limit)) * 100 : null;
                  const payoff = simulatePayoff(b.current_balance, b.interest_rate, b.amount);
                  return (
                    <tr key={b.id} className="border-t border-white/5">
                      <td className="px-4 py-3 font-medium">{b.name}</td>
                      <td className="px-4 py-3">{formatCurrency(b.current_balance)}</td>
                      <td className="px-4 py-3 text-slate-400">
                        {b.credit_limit ? formatCurrency(b.credit_limit) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {util != null ? <UtilizationBar pct={util} /> : <span className="text-slate-500">—</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-400">
                        {b.interest_rate != null ? `${Number(b.interest_rate).toFixed(2)}%` : '—'}
                      </td>
                      <td className="px-4 py-3">{formatCurrency(b.amount)}</td>
                      <td className="px-4 py-3 text-slate-400">
                        {payoff.payoffPossible ? (
                          `${payoff.months} mo`
                        ) : (
                          <span className="text-rose-400">won't pay off</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>

          <Card>
            <h3 className="mb-1 text-sm font-semibold text-slate-200">Payoff scenario</h3>
            <p className="mb-4 text-xs text-slate-500">
              Pick an account and an extra monthly payment to see how much sooner it's paid off, how much
              interest that saves, and what it frees up in your monthly bills once it's gone.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-400">Account</span>
                <select
                  value={selectedId}
                  onChange={(e) => setSelectedId(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-surface-muted px-3 py-2 text-sm outline-none focus:border-accent"
                >
                  {debts.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-400">Extra monthly payment</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={extraPayment}
                  onChange={(e) => setExtraPayment(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-lg border border-white/10 bg-surface-muted px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </label>
            </div>

            {selected && (
              <>
                {selected.interest_rate == null && (
                  <p className="mt-3 text-xs text-amber-400">
                    No interest rate set for {selected.name} -- this scenario assumes 0% APR. Set one on the
                    bill for an accurate payoff estimate.
                  </p>
                )}
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <ScenarioResult title="Minimum payment only" payment={selected.amount} result={baseline} />
                  <ScenarioResult
                    title={`With +${formatCurrency(extra)}/mo extra`}
                    payment={Number(selected.amount) + extra}
                    result={accelerated}
                  />
                </div>

                {extra > 0 && baseline?.payoffPossible && accelerated?.payoffPossible && (
                  <div className="mt-4 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-300">
                    Paying {formatCurrency(extra)} extra each month pays off <strong>{selected.name}</strong>{' '}
                    {baseline.months - accelerated.months} month
                    {baseline.months - accelerated.months === 1 ? '' : 's'} sooner and saves{' '}
                    {formatCurrency(baseline.totalInterest - accelerated.totalInterest)} in interest.
                  </div>
                )}

                <MonthlyBillImpact debts={debts} selected={selected} accelerated={extra > 0 ? accelerated : baseline} />
              </>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function UtilizationBar({ pct }) {
  const tone = pct >= 75 ? 'bg-rose-500' : pct >= 30 ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-white/10">
        <div className={`h-full ${tone}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className="text-xs text-slate-400">{pct.toFixed(0)}%</span>
    </div>
  );
}

function ScenarioResult({ title, payment, result }) {
  return (
    <div className="rounded-lg border border-white/5 bg-surface-muted p-3">
      <p className="text-xs font-medium text-slate-400">{title}</p>
      <p className="mt-1 text-sm text-slate-300">Payment {formatCurrency(payment)}/mo</p>
      {result?.payoffPossible ? (
        <>
          <p className="text-sm text-slate-300">
            Payoff in {result.months} month{result.months === 1 ? '' : 's'}
          </p>
          <p className="text-sm text-slate-300">Total interest {formatCurrency(result.totalInterest)}</p>
        </>
      ) : (
        <p className="mt-1 text-sm text-rose-400">
          At this payment the balance never shrinks -- interest outpaces what's being paid.
        </p>
      )}
    </div>
  );
}

// What the household's total tracked monthly debt payments drop to once
// this one account is paid off -- its minimum payment simply stops being
// part of that total.
function MonthlyBillImpact({ debts, selected, accelerated }) {
  const totalMinPayment = debts.reduce((sum, b) => sum + Number(b.amount || 0), 0);
  const afterPayoff = totalMinPayment - Number(selected.amount || 0);
  return (
    <div className="mt-4 rounded-lg border border-white/5 bg-surface-muted p-3 text-sm text-slate-300">
      <p>Right now your tracked debt accounts total {formatCurrency(totalMinPayment)}/mo in minimum payments.</p>
      <p className="mt-1">
        Once {selected.name} is paid off
        {accelerated?.payoffPossible ? ` (in ${accelerated.months} month${accelerated.months === 1 ? '' : 's'} at that pace)` : ''}
        , that drops to {formatCurrency(afterPayoff)}/mo -- {formatCurrency(selected.amount)} freed up for other
        bills or to put toward another card.
      </p>
    </div>
  );
}
