import React, { useState } from 'react';
import Modal from './Modal.jsx';
import { formatCurrency } from '../lib/format.js';
import { missedCycles } from '../lib/recurrence.js';

const OTHER_SOURCE = '__other__';
const today = () => new Date().toISOString().slice(0, 10);

// Shown instead of MarkPaidModal when a recurring bill has gone unpaid long
// enough that more than one cycle is now due (e.g. rent unpaid since
// August, now October -- 3 payments owed, not 1). Rather than one "mark
// paid" action silently only covering the oldest cycle, this lists every
// missed cycle so each can be logged with its own amount and payment date
// -- "split up the payments" instead of a single lump action that's unclear
// about which due date it actually settles.
export default function CatchUpModal({ bill, members, paychecks, onClose, onConfirmOne, onAllDone }) {
  const cycles = missedCycles(bill.due_date, bill.recurrence);
  const [rows, setRows] = useState(
    cycles.map((due_date, i) => ({ due_date, amount: bill.amount, paid_date: today(), done: false, key: i }))
  );
  const [paidBy, setPaidBy] = useState('');
  const [statementBalance, setStatementBalance] = useState(bill.current_balance ?? '');
  const [paycheckChoice, setPaycheckChoice] = useState('');
  const [sourceText, setSourceText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);

  const balanceRequired = Boolean(bill.category_is_debt);
  const needsSource = !bill.paycheck_id;

  const updateRow = (key, field, value) => {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
  };

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const paycheckId = needsSource && paycheckChoice && paycheckChoice !== OTHER_SOURCE ? Number(paycheckChoice) : null;
    const source = needsSource && paycheckChoice === OTHER_SOURCE ? sourceText.trim() : null;
    const balance = statementBalance === '' ? null : Number(statementBalance);

    try {
      // Sequential, oldest cycle first -- each call advances the bill's
      // live due_date by exactly one cycle server-side, so they have to
      // land in order for the final state to be "caught up to today"
      // rather than skipping around.
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
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
        setProgress(i + 1);
      }
      onAllDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title={`Catch up "${bill.name}" -- ${cycles.length} payments due`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-xs text-slate-500">
          This bill hasn't been marked paid since it was due {bill.due_date}, so {cycles.length} cycles have
          piled up. Log each one with what was actually paid and when -- amounts default to{' '}
          {formatCurrency(bill.amount)} and dates default to today, both editable per payment.
        </p>

        <div className="max-h-56 space-y-2 overflow-y-auto rounded-lg border border-white/10 p-2">
          {rows.map((row, i) => (
            <div key={row.key} className="grid grid-cols-[1fr_auto_auto] items-center gap-2">
              <span className="text-xs text-slate-400">
                Due {row.due_date}
                {i === rows.length - 1 ? ' (current)' : ''}
              </span>
              <input
                required
                type="number"
                step="0.01"
                value={row.amount}
                onChange={(e) => updateRow(row.key, 'amount', e.target.value)}
                disabled={submitting}
                className="w-24 rounded-lg border border-white/10 bg-surface-muted px-2 py-1.5 text-sm outline-none focus:border-accent disabled:opacity-50"
              />
              <input
                required
                type="date"
                value={row.paid_date}
                onChange={(e) => updateRow(row.key, 'paid_date', e.target.value)}
                disabled={submitting}
                className="w-36 rounded-lg border border-white/10 bg-surface-muted px-2 py-1.5 text-sm outline-none focus:border-accent disabled:opacity-50"
              />
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
                  {p.pay_date} ({formatCurrency(p.expected_amount)})
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
              Logging {progress + 1} of {rows.length}…
            </span>
          )}
          <button type="button" onClick={onClose} disabled={submitting} className="rounded-lg px-4 py-2 text-sm text-slate-300 hover:bg-white/5 disabled:opacity-50">
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium hover:bg-accent-soft disabled:opacity-50"
          >
            {submitting ? 'Saving…' : `Log ${rows.length} payments`}
          </button>
        </div>
      </form>
    </Modal>
  );
}
