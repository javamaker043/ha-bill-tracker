import React, { useState } from 'react';
import Modal from './Modal.jsx';

export default function MarkPaidModal({ bill, members, onClose, onConfirm }) {
  const [amount, setAmount] = useState(bill.amount);
  const [paidBy, setPaidBy] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onConfirm(Number(amount) || 0, paidBy ? Number(paidBy) : null);
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
