import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Check, Pencil, History } from 'lucide-react';
import { api } from '../lib/api.js';
import Modal from '../components/Modal.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import BillFormModal from '../components/BillFormModal.jsx';
import MarkPaidModal from '../components/MarkPaidModal.jsx';
import PaymentHistoryModal from '../components/PaymentHistoryModal.jsx';

const emptyPaycheck = { pay_date: new Date().toISOString().slice(0, 10), expected_amount: '', notes: '' };

export default function PaymentPlans() {
  const [paychecks, setPaychecks] = useState([]);
  const [unassigned, setUnassigned] = useState([]);
  const [members, setMembers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyPaycheck);
  const [addingBill, setAddingBill] = useState(false);
  const [editingBill, setEditingBill] = useState(null);
  const [payingBill, setPayingBill] = useState(null);
  const [historyBill, setHistoryBill] = useState(null);

  const refresh = () => {
    api.paychecks.list().then(setPaychecks);
    api.paychecks.unassignedBills().then(setUnassigned);
    api.members.list().then(setMembers);
  };
  useEffect(refresh, []);

  const addPaycheck = async (e) => {
    e.preventDefault();
    if (!form.pay_date) return;
    await api.paychecks.create({ ...form, expected_amount: Number(form.expected_amount) || 0 });
    setForm(emptyPaycheck);
    setShowForm(false);
    refresh();
  };

  const removePaycheck = async (id) => {
    await api.paychecks.remove(id);
    refresh();
  };

  const assignBill = async (billId, paycheckId) => {
    await api.bills.assignPaycheck(billId, paycheckId);
    refresh();
  };

  const confirmPaid = async (amount, paidBy, statementBalance) => {
    await api.bills.pay(payingBill.id, { amount_paid: amount, paid_by: paidBy, statement_balance: statementBalance });
    setPayingBill(null);
    refresh();
  };

  // Native HTML5 drag-and-drop for desktop/mouse users; the per-card select
  // below is the reliable path on touch devices where drag doesn't work.
  const onDragStart = (e, billId) => e.dataTransfer.setData('text/plain', String(billId));
  const allowDrop = (e) => e.preventDefault();
  const onDrop = (e, paycheckId) => {
    e.preventDefault();
    const billId = Number(e.dataTransfer.getData('text/plain'));
    if (billId) assignBill(billId, paycheckId);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Payment Plans</h2>
          <p className="text-sm text-slate-400">
            Add each upcoming paycheck, then assign bills to whichever check covers them.
            Unassigned bills are listed past-due first.
          </p>
        </div>
        <div className="flex gap-2 self-start">
          <button
            onClick={() => setAddingBill(true)}
            className="flex items-center gap-2 rounded-lg border border-white/10 px-4 py-2 text-sm font-medium hover:bg-white/5"
          >
            <Plus size={16} /> Add bill
          </button>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium hover:bg-accent-soft"
          >
            <Plus size={16} /> Add paycheck
          </button>
        </div>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-2">
        <BoardColumn
          title="Unassigned bills"
          subtitle={`${unassigned.length} bill${unassigned.length === 1 ? '' : 's'} to plan for`}
          onDrop={(e) => onDrop(e, null)}
          onDragOver={allowDrop}
        >
          {unassigned.map((b) => (
            <BillCard
              key={b.id}
              bill={b}
              paychecks={paychecks}
              onAssign={assignBill}
              onDragStart={onDragStart}
              onMarkPaid={setPayingBill}
              onEdit={setEditingBill}
              onHistory={setHistoryBill}
            />
          ))}
          {unassigned.length === 0 && <EmptyHint text="Nothing left to assign." />}
        </BoardColumn>

        {paychecks.map((p) => (
          <BoardColumn
            key={p.id}
            title={p.pay_date}
            subtitle={`$${p.remaining.toFixed(2)} remaining of $${Number(p.expected_amount).toFixed(2)}`}
            tone={p.remaining < 0 ? 'danger' : 'default'}
            onDrop={(e) => onDrop(e, p.id)}
            onDragOver={allowDrop}
            onDelete={() => removePaycheck(p.id)}
          >
            {p.bills.map((b) => (
              <BillCard
                key={b.id}
                bill={b}
                paychecks={paychecks}
                onAssign={assignBill}
                onDragStart={onDragStart}
                onMarkPaid={setPayingBill}
                onEdit={setEditingBill}
                onHistory={setHistoryBill}
              />
            ))}
            {p.bills.length === 0 && p.paidHistory.length === 0 && (
              <EmptyHint text="Drag a bill here, or use its dropdown." />
            )}
            {p.paidHistory.length > 0 && (
              <div className="space-y-1.5 border-t border-white/5 pt-2">
                {p.paidHistory.map((h) => (
                  <PaidHistoryRow key={h.id} entry={h} />
                ))}
              </div>
            )}
          </BoardColumn>
        ))}

        {paychecks.length === 0 && (
          <p className="text-sm text-slate-500">Add a paycheck to start planning.</p>
        )}
      </div>

      {showForm && (
        <Modal title="Add paycheck" onClose={() => setShowForm(false)}>
          <form onSubmit={addPaycheck} className="space-y-3">
            <Field label="Pay date">
              <input
                required
                type="date"
                value={form.pay_date}
                onChange={(e) => setForm((f) => ({ ...f, pay_date: e.target.value }))}
                className={inputClass}
              />
            </Field>
            <Field label="Expected amount">
              <input
                required
                type="number"
                step="0.01"
                value={form.expected_amount}
                onChange={(e) => setForm((f) => ({ ...f, expected_amount: e.target.value }))}
                className={inputClass}
              />
            </Field>
            <Field label="Notes (optional)">
              <input
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                className={inputClass}
                placeholder="e.g. Ty's paycheck"
              />
            </Field>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setShowForm(false)} className="rounded-lg px-4 py-2 text-sm text-slate-300 hover:bg-white/5">
                Cancel
              </button>
              <button type="submit" className="rounded-lg bg-accent px-4 py-2 text-sm font-medium hover:bg-accent-soft">
                Add
              </button>
            </div>
          </form>
        </Modal>
      )}

      {(addingBill || editingBill) && (
        <BillFormModal
          bill={editingBill}
          members={members}
          onClose={() => { setAddingBill(false); setEditingBill(null); }}
          onSaved={() => { setAddingBill(false); setEditingBill(null); refresh(); }}
        />
      )}

      {payingBill && (
        <MarkPaidModal bill={payingBill} members={members} onClose={() => setPayingBill(null)} onConfirm={confirmPaid} />
      )}

      {historyBill && (
        <PaymentHistoryModal bill={historyBill} members={members} onClose={() => setHistoryBill(null)} />
      )}
    </div>
  );
}

function BoardColumn({ title, subtitle, tone = 'default', onDrop, onDragOver, onDelete, children }) {
  return (
    <div
      onDrop={onDrop}
      onDragOver={onDragOver}
      className="flex w-72 shrink-0 flex-col gap-3 rounded-xl2 border border-white/5 bg-surface-raised p-3"
    >
      <div className="flex items-start justify-between gap-2 px-1">
        <div>
          <p className="text-sm font-semibold">{title}</p>
          <p className={`text-xs ${tone === 'danger' ? 'text-rose-400' : 'text-slate-400'}`}>{subtitle}</p>
        </div>
        {onDelete && (
          <button onClick={onDelete} className="text-slate-500 hover:text-rose-400">
            <Trash2 size={14} />
          </button>
        )}
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

function BillCard({ bill, paychecks, onAssign, onDragStart, onMarkPaid, onEdit, onHistory }) {
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, bill.id)}
      className={`cursor-grab space-y-2 rounded-lg border border-white/5 bg-surface-muted p-3 active:cursor-grabbing ${
        bill.status === 'paid' ? 'opacity-50' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{bill.name}</p>
          <p className="text-xs text-slate-400">Due {bill.due_date}</p>
        </div>
        <button
          onClick={() => onEdit(bill)}
          title="Edit bill"
          className="flex items-center gap-1 text-sm font-semibold text-slate-200 hover:text-accent-soft"
        >
          ${Number(bill.amount).toFixed(2)} <Pencil size={11} className="text-slate-500" />
        </button>
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <StatusBadge status={bill.status} />
          <button onClick={() => onHistory(bill)} title="Payment history" className="text-slate-500 hover:text-white">
            <History size={13} />
          </button>
        </div>
        {bill.status !== 'paid' && (
          <button
            onClick={() => onMarkPaid(bill)}
            className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-400 hover:bg-emerald-500/25"
          >
            <Check size={12} /> Paid
          </button>
        )}
      </div>
      <select
        value={bill.paycheck_id || ''}
        onChange={(e) => onAssign(bill.id, e.target.value ? Number(e.target.value) : null)}
        className="w-full rounded-md border border-white/10 bg-surface px-2 py-1.5 text-xs outline-none focus:border-accent"
      >
        <option value="">Unassigned</option>
        {paychecks.map((p) => (
          <option key={p.id} value={p.id}>
            {p.pay_date} (${Number(p.expected_amount).toFixed(2)})
          </option>
        ))}
      </select>
    </div>
  );
}

function EmptyHint({ text }) {
  return <p className="px-1 text-xs text-slate-500">{text}</p>;
}

// A bill that was paid from this paycheck, kept visible here even after a
// recurring bill's live assignment moves on to its next occurrence -- a
// read-only, greyed-out record, not draggable or editable from this spot.
function PaidHistoryRow({ entry }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-white/5 bg-surface-muted/40 p-2 opacity-50">
      <div>
        <p className="text-xs font-medium line-through">{entry.bill_name}</p>
        <p className="text-[10px] text-slate-500">Paid {entry.paid_date.slice(0, 10)}</p>
      </div>
      <span className="text-xs">${Number(entry.amount_paid).toFixed(2)}</span>
    </div>
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
