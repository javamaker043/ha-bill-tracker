import React, { useState } from 'react';
import Modal from './Modal.jsx';
import { formatCurrency } from '../lib/format.js';
import { missedCycles } from '../lib/recurrence.js';
import { todayISO } from '../lib/dueDate.js';

const OTHER_SOURCE = '__other__';

const inputClass =
  'w-full rounded-lg border border-white/10 bg-surface-muted px-2 py-1.5 text-sm outline-none focus:border-accent disabled:opacity-50';

// Shown instead of MarkPaidModal when a recurring bill has gone unpaid long
// enough that more than one cycle is now due (e.g. rent unpaid since
// August, now October -- 3 payments owed, not 1). Rather than one "mark
// paid" action silently only covering the oldest cycle, this lists every
// missed cycle so each can be logged with its own amount and payment date
// -- "split up the payments" instead of a single lump action that's unclear
// about which due date it actually settles.
export default function CatchUpModal({ bill, members, paychecks, onClose, onConfirmOne, onAllDone }) {
  const cycles = missedCycles(bill);
  const [rows, setRows] = useState(
    cycles.map((due_date, i) => ({ due_date, amount: bill.amount, paid_date: todayISO(), done: false, key: i }))
  );
  const [paidBy, setPaidBy] = useState('');
  const [statementBalance, setStatementBalance] = useState(bill.current_balance ?? '');
  const [paycheckChoice, setPaycheckChoice] = useState('');
  const [sourceText, setSourceText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const balanceRequired = Boolean(bill.category_is_debt);
  const needsSource = !bill.paycheck_id;
  const doneCount = rows.filter((r) => r.done).length;

  const updateRow = (key, field, value) => {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
  };

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    // The server clears a bill's live paycheck assignment after the first
    // payment, so the original assignment is passed explicitly on every row
    // -- otherwise only the first payment would record which paycheck it
    // came from.
    const paycheckId = needsSource
      ? paycheckChoice && paycheckChoice !== OTHER_SOURCE ? Number(paycheckChoice) : null
      : bill.paycheck_id;
    const source = needsSource && paycheckChoice === OTHER_SOURCE ? sourceText.trim() : null;
    const balance = statementBalance === '' ? null : Number(statementBalance);

    try {
      // Sequential, oldest cycle first -- each call advances the bill's
      // live due_date by exactly one cycle server-side, so they have to
      // land in order for the final state to be "caught up to today"
      // rather than skipping around. Rows already logged (from an earlier
      // attempt that failed part-way) are skipped, so retrying never
      // double-logs a payment.
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (row.done) continue;
        const isLast = i === rows.length - 1;
        await onConfirmOne({
          amount: Number(row.amount) || 0,
          paidBy: paidBy ? Number(paidBy) : null,
          // Only the final payment's balance is meaningful going forward --
          // intermediate catch-up balances during the gap aren't tracked.
          statementBalance: isLast ? balance : null,
          paycheckId,
          source,
          paidDate: row.paid_date,
        });
        setRows((rs) => rs.map((r) => (r.key === row.key ? { ...r, done: true } : r)));
      }
      onAllDone();
    } catch (err) {
      setError(`${err.message} -- the payments marked "logged" were saved; fix the problem and submit again to log the rest.`);
    } finally {
      setSubmitting(false);
    }
  };

  // Closing after a partial run still refreshes the page behind this modal,
  // which otherwise would keep showing the bill's pre-catch-up state.
  const close = () => (doneCount > 0 ? onAllDone() : onClose());
  const remaining = rows.length - doneCount;

  return (
    <Modal title={`Catch up "${bill.name}" -- ${cycles.length} payments due`} onClose={close}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-xs text-slate-500">
          This bill hasn't been marked paid since it was due {bill.due_date}, so {cycles.length} cycles have
          piled up. Log each one with what was actually paid and when -- amounts default to{' '}
          {formatCurrency(bill.amount)} and dates default to today, both editable per payment.
        </p>

        <div className="max-h-64 space-y-2 overflow-y-auto rounded-lg border border-white/10 p-2">
          {rows.map((row, i) => (
            <div
              key={row.key}
              className={`rounded-lg bg-surface p-2 ${row.done ? 'opacity-60' : ''}`}
            >
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="text-slate-300">
                  Due {row.due_date}
                  {i === rows.length - 1 ? ' (current)' : ''}
                </span>
                {row.done && <span className="text-emerald-400">Logged</span>}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="mb-0.5 block text-[10px] uppercase tracking-wide text-slate-500">Amount paid</span>
                  <input
                    required
                    type="number"
                    step="0.01"
                    min="0"
                    value={row.amount}
                    onChange={(e) => updateRow(row.key, 'amount', e.target.value)}
                    disabled={submitting || row.done}
                    className={inputClass}
                  />
                </label>
                <label className="block">
                  <span className="mb-0.5 block text-[10px] uppercase tracking-wide text-slate-500">Paid on</span>
                  <input
                    required
                    type="date"
                    max={todayISO()}
                    value={row.paid_date}
                    onChange={(e) => updateRow(row.key, 'paid_date', e.target.value)}
                    disabled={submitting || row.done}
                    className={inputClass}
                  />
                </label>
              </div>
            </div>
          ))}
        </div>

        {balanceRequired && (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-400">Current statement balance</span>
            <input
              required
              type="number"
              step="0.01"
              value={statementBalance}
              onChange={(e) => setStatementBalance(e.target.value)}
              placeholder="Balance shown on your latest statement"
              className="w-full rounded-lg border border-white/10 bg-surface-muted px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <span className="mt-1 block text-xs text-slate-500">
              Applied once, with the most recent payment -- what matters is where the balance stands now.
            </span>
          </label>
        )}

        {needsSource && (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-400">Paid from</span>
            <select
              required
              value={paycheckChoice}
              onChange={(e) => setPaycheckChoice(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-surface-muted px-3 py-2 text-sm outline-none focus:border-accent"
            >
              <option value="" disabled>
                This bill isn't on a paycheck plan -- select one…
              </option>
              {(paychecks || []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.pay_date} ({formatCurrency(p.available ?? p.expected_amount)})
                </option>
              ))}
              <option value={OTHER_SOURCE}>Paid from another source (not a tracked paycheck)</option>
            </select>
            {paycheckChoice === OTHER_SOURCE && (
              <input
                required
                value={sourceText}
                onChange={(e) => setSourceText(e.target.value)}
                placeholder="e.g. cash, savings account, Nic's personal card"
                className="mt-2 w-full rounded-lg border border-white/10 bg-surface-muted px-3 py-2 text-sm outline-none focus:border-accent"
              />
            )}
            <span className="mt-1 block text-xs text-slate-500">Applied to all {cycles.length} payments.</span>
          </label>
        )}

        {members?.length > 0 && (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-400">Paid by (optional)</span>
            <select
              value={paidBy}
              onChange={(e) => setPaidBy(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-surface-muted px-3 py-2 text-sm outline-none focus:border-accent"
            >
              <option value="">Not specified</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {error && <p className="text-xs text-rose-400">{error}</p>}
        <div className="mt-4 flex items-center justify-end gap-2">
          {submitting && (
            <span className="mr-auto text-xs text-slate-500">
              Logging {Math.min(doneCount + 1, rows.length)} of {rows.length}…
            </span>
          )}
          <button type="button" onClick={close} disabled={submitting} className="rounded-lg px-4 py-2 text-sm text-slate-300 hover:bg-white/5 disabled:opacity-50">
            {doneCount > 0 ? 'Close' : 'Cancel'}
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium hover:bg-accent-soft disabled:opacity-50"
          >
            {submitting ? 'Saving…' : `Log ${remaining} payment${remaining === 1 ? '' : 's'}`}
          </button>
        </div>
      </form>
    </Modal>
  );
}
