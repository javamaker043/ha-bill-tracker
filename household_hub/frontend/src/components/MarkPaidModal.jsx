import React, { useState } from 'react';
import Modal from './Modal.jsx';
import { isDebtCategory } from '../lib/billCategory.js';

const OTHER_SOURCE = '__other__';

export default function MarkPaidModal({ bill, members, paychecks, onClose, onConfirm }) {
  const [amount, setAmount] = useState(bill.amount);
  const [paidBy, setPaidBy] = useState('');
  const [statementBalance, setStatementBalance] = useState(bill.current_balance ?? '');
  const [paycheckChoice, setPaycheckChoice] = useState('');
  const [sourceText, setSourceText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const balanceRequired = isDebtCategory(bill.category);
  const needsSource = !bill.paycheck_id;

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const balance = statementBalance === '' ? null : Number(statementBalance);
      const paycheckId = needsSource && paycheckChoice && paycheckChoice !== OTHER_SOURCE ? Number(paycheckChoice) : null;
      const source = needsSource && paycheckChoice === OTHER_SOURCE ? sourceText.trim() : null;
      await onConfirm(Number(amount) || 0, paidBy ? Number(paidBy) : null, balance, paycheckId, source);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={`Mark "${bill.name}" paid`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-400">Amount paid</span>
          <input
            autoFocus
            required
            type="number"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-surface-muted px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </label>
        <p className="text-xs text-slate-500">
          Bill amount is ${Number(bill.amount).toFixed(2)}. Adjust if you paid a different amount.
        </p>
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
              {bill.category} bills track a running balance -- enter what your latest statement shows,
              even if it's the same as last time.
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
                  {p.pay_date} (${Number(p.expected_amount).toFixed(2)})
                </option>
              ))}
              <option value={OTHER_SOURCE}>Paid from another source (not a tracked paycheck)</option>
            </select>
            {paycheckChoice === OTHER_SOURCE && (
              <input
                required
                autoFocus
                value={sourceText}
                onChange={(e) => setSourceText(e.target.value)}
                placeholder="e.g. cash, savings account, Nic's personal card"
                className="mt-2 w-full rounded-lg border border-white/10 bg-surface-muted px-3 py-2 text-sm outline-none focus:border-accent"
              />
            )}
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
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-slate-300 hover:bg-white/5">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium hover:bg-accent-soft disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Confirm paid'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
