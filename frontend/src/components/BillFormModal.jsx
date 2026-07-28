import React, { useState } from 'react';
import Modal from './Modal.jsx';
import { api } from '../lib/api.js';

const empty = {
  name: '', amount: '', payee: '', category: 'other', recurrence: 'monthly',
  due_date: new Date().toISOString().slice(0, 10), autopay: false,
  assigned_to: '', reminder_days_before: 3, notes: '',
};

export default function BillFormModal({ bill, members, onClose, onSaved }) {
  const [form, setForm] = useState(bill ? { ...empty, ...bill } : empty);
  const [saving, setSaving] = useState(false);

  const set = (key) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [key]: value }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, amount: Number(form.amount), assigned_to: form.assigned_to || null };
      if (bill) await api.bills.update(bill.id, payload);
      else await api.bills.create(payload);
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={bill ? 'Edit bill' : 'Add bill'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Name">
          <input required value={form.name} onChange={set('name')} className={inputClass} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount">
            <input required type="number" step="0.01" value={form.amount} onChange={set('amount')} className={inputClass} />
          </Field>
          <Field label="Due date">
            <input required type="date" value={form.due_date} onChange={set('due_date')} className={inputClass} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Recurrence">
            <select value={form.recurrence} onChange={set('recurrence')} className={inputClass}>
              <option value="once">One-time</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
          </Field>
          <Field label="Category">
            <input value={form.category} onChange={set('category')} className={inputClass} placeholder="utilities, rent…" />
          </Field>
        </div>
        <Field label="Assigned to">
          <select value={form.assigned_to || ''} onChange={set('assigned_to')} className={inputClass}>
            <option value="">Unassigned</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Remind me (days before due)">
          <input type="number" min={0} max={14} value={form.reminder_days_before} onChange={set('reminder_days_before')} className={inputClass} />
        </Field>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={!!form.autopay} onChange={set('autopay')} />
          Autopay enabled
        </label>
        <Field label="Notes">
          <textarea value={form.notes || ''} onChange={set('notes')} className={inputClass} rows={2} />
        </Field>

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-slate-300 hover:bg-white/5">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium hover:bg-accent-soft disabled:opacity-50">
            {saving ? 'Saving…' : 'Save bill'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

const inputClass = 'w-full rounded-lg border border-white/10 bg-surface-muted px-3 py-2 text-sm outline-none focus:border-accent';

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-400">{label}</span>
      {children}
    </label>
  );
}
