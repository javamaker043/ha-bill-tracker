import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Check, Pencil, History, AlertTriangle } from 'lucide-react';
import { api } from '../lib/api.js';
import Modal from '../components/Modal.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import MemberPill from '../components/MemberPill.jsx';
import BillFormModal from '../components/BillFormModal.jsx';
import MarkPaidModal from '../components/MarkPaidModal.jsx';
import CatchUpModal from '../components/CatchUpModal.jsx';
import PaymentHistoryModal from '../components/PaymentHistoryModal.jsx';
import { formatCurrency } from '../lib/format.js';
import { daysUntilDue, todayISO } from '../lib/dueDate.js';
import { cyclesOwed as countCyclesOwed } from '../lib/recurrence.js';

const emptyPaycheck = () => ({ pay_date: todayISO(), expected_amount: '', notes: '' });

export default function PaymentPlans() {
  const [paychecks, setPaychecks] = useState([]);
  const [unassigned, setUnassigned] = useState([]);
  const [members, setMembers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyPaycheck);
  const [editingPaycheck, setEditingPaycheck] = useState(null);
  const [addingBill, setAddingBill] = useState(false);
  const [editingBill, setEditingBill] = useState(null);
  const [payingBill, setPayingBill] = useState(null);
  const [catchUpBill, setCatchUpBill] = useState(null);
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
    setForm(emptyPaycheck());
    setShowForm(false);
    refresh();
  };

  // The column asks for confirmation inline before calling this (see
  // BoardColumn) -- deleting a paycheck unassigns every bill planned on it.
  const removePaycheck = async (paycheck) => {
    await api.paychecks.remove(paycheck.id);
    refresh();
  };

  const deleteWarning = (paycheck) => {
    const planned = paycheck.bills.length;
    return planned
      ? `Delete the ${paycheck.pay_date} paycheck? Its ${planned} planned bill${planned === 1 ? '' : 's'} will go back to Unassigned.`
      : `Delete the ${paycheck.pay_date} paycheck?`;
  };

  const savePaycheck = async (data) => {
    await api.paychecks.update(editingPaycheck.id, data);
    setEditingPaycheck(null);
    refresh();
  };

  const assignBill = async (billId, paycheckId) => {
    await api.bills.assignPaycheck(billId, paycheckId);
    refresh();
  };

  const confirmPaid = async (amount, paidBy, statementBalance, paycheckId, source, paidDate) => {
    await api.bills.pay(payingBill.id, {
      amount_paid: amount,
      paid_by: paidBy,
      statement_balance: statementBalance,
      paycheck_id: paycheckId,
      source,
      paid_date: paidDate,
    });
    setPayingBill(null);
    refresh();
  };

  // A recurring bill that's gone unpaid long enough to owe more than one
  // cycle (see lib/recurrence.js) gets the catch-up/split flow instead of
  // the single mark-paid modal, which would otherwise only ever settle the
  // oldest missed due date and leave the rest looking resolved.
  const startMarkPaid = (bill) => {
    if (countCyclesOwed(bill) > 1) {
      setCatchUpBill(bill);
    } else {
      setPayingBill(bill);
    }
  };

  const confirmCatchUpRow = ({ amount, paidBy, statementBalance, paycheckId, source, paidDate }) =>
    api.bills.pay(catchUpBill.id, {
      amount_paid: amount,
      paid_by: paidBy,
      statement_balance: statementBalance,
      paycheck_id: paycheckId,
      source,
      paid_date: paidDate,
    });

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
              onMarkPaid={startMarkPaid}
              onEdit={setEditingBill}
              onHistory={setHistoryBill}
              members={members}
            />
          ))}
          {unassigned.length === 0 && <EmptyHint text="Nothing left to assign." />}
        </BoardColumn>

        {paychecks.map((p) => (
          <BoardColumn
            key={p.id}
            title={p.pay_date}
            subtitle={<PaycheckTotals paycheck={p} />}
            onDrop={(e) => onDrop(e, p.id)}
            onDragOver={allowDrop}
            onDelete={() => removePaycheck(p)}
            deleteWarning={deleteWarning(p)}
            onEdit={() => setEditingPaycheck(p)}
          >
            {p.bills.map((b) => (
              <BillCard
                key={b.id}
                bill={b}
                paychecks={paychecks}
                onAssign={assignBill}
                onDragStart={onDragStart}
                onMarkPaid={startMarkPaid}
                onEdit={setEditingBill}
                onHistory={setHistoryBill}
                members={members}
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

      {editingPaycheck && (
        <PaycheckEditModal
          paycheck={editingPaycheck}
          onClose={() => setEditingPaycheck(null)}
          onSave={savePaycheck}
        />
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
        <MarkPaidModal
          bill={payingBill}
          members={members}
          paychecks={paychecks}
          onClose={() => setPayingBill(null)}
          onConfirm={confirmPaid}
        />
      )}

      {catchUpBill && (
        <CatchUpModal
          bill={catchUpBill}
          members={members}
          paychecks={paychecks}
          onClose={() => setCatchUpBill(null)}
          onConfirmOne={confirmCatchUpRow}
          onAllDone={() => { setCatchUpBill(null); refresh(); }}
        />
      )}

      {historyBill && (
        <PaymentHistoryModal
          bill={historyBill}
          members={members}
          onClose={() => setHistoryBill(null)}
          onChanged={refresh}
        />
      )}
    </div>
  );
}

// Record what a paycheck actually paid once it lands (and fix the date or
// plan if they changed). Once an actual amount is set it replaces the
// expected one everywhere the paycheck is budgeted against.
function PaycheckEditModal({ paycheck, onClose, onSave }) {
  const [payDate, setPayDate] = useState(paycheck.pay_date);
  const [expected, setExpected] = useState(paycheck.expected_amount);
  const [actual, setActual] = useState(paycheck.actual_amount ?? '');
  const [notes, setNotes] = useState(paycheck.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSave({
        pay_date: payDate,
        expected_amount: Number(expected) || 0,
        actual_amount: actual === '' ? null : Number(actual),
        notes: notes || null,
      });
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  const variance = actual === '' ? null : Number(actual) - (Number(expected) || 0);

  return (
    <Modal title="Edit paycheck" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Pay date">
          <input required type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Expected amount">
          <input
            required
            type="number"
            step="0.01"
            min="0"
            value={expected}
            onChange={(e) => setExpected(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Actual amount received">
          <input
            type="number"
            step="0.01"
            min="0"
            value={actual}
            onChange={(e) => setActual(e.target.value)}
            placeholder="Leave blank until it lands"
            className={inputClass}
          />
          {variance != null && variance !== 0 && (
            <span className={`mt-1 block text-xs ${variance < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
              {variance < 0 ? 'Short' : 'Over'} expected by {formatCurrency(Math.abs(variance))} -- budgeting now
              uses the actual amount.
            </span>
          )}
        </Field>
        <Field label="Notes (optional)">
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} />
        </Field>
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
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function BoardColumn({ title, subtitle, onDrop, onDragOver, onDelete, onEdit, deleteWarning, children }) {
  // Inline two-step confirm (not window.confirm, which some embedded
  // webviews -- e.g. the Home Assistant mobile app -- don't reliably show).
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  return (
    <div
      onDrop={onDrop}
      onDragOver={onDragOver}
      className="flex w-72 shrink-0 flex-col gap-3 rounded-xl2 border border-white/5 bg-surface-raised p-3"
    >
      <div className="flex items-start justify-between gap-2 px-1">
        <div>
          <p className="text-sm font-semibold">{title}</p>
          <div className="text-xs text-slate-400">{subtitle}</div>
        </div>
        <div className="flex items-center gap-1">
          {onEdit && (
            <button onClick={onEdit} title="Edit paycheck / record actual amount" className="p-1 text-slate-500 hover:text-white">
              <Pencil size={14} />
            </button>
          )}
          {onDelete && (
            <button
              onClick={() => setConfirmingDelete(true)}
              title="Delete paycheck"
              className="p-1 text-slate-500 hover:text-rose-400"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>
      {confirmingDelete && (
        <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-2 text-xs text-rose-200">
          <p>{deleteWarning || 'Delete this paycheck?'}</p>
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => { setConfirmingDelete(false); onDelete(); }}
              className="rounded bg-rose-500/30 px-2 py-1 font-medium hover:bg-rose-500/40"
            >
              Delete
            </button>
            <button onClick={() => setConfirmingDelete(false)} className="px-2 py-1 text-slate-300 hover:text-white">
              Keep
            </button>
          </div>
        </div>
      )}
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

// Money paid out of a paycheck stays spent -- Remaining subtracts both what's
// still planned (live, unpaid bills) and what's already been paid, so it
// doesn't visibly go back up every time something here gets marked paid.
function PaycheckTotals({ paycheck: p }) {
  const received = p.actual_amount != null;
  const variance = received ? Number(p.actual_amount) - Number(p.expected_amount) : 0;
  return (
    <div className="space-y-0.5">
      <p>
        {received ? 'Received' : 'Expected'} {formatCurrency(p.available)}
        {received && variance !== 0 && (
          <span className={variance < 0 ? 'text-rose-400' : 'text-emerald-400'}>
            {' '}({variance < 0 ? '-' : '+'}{formatCurrency(Math.abs(variance))} vs plan)
          </span>
        )}
      </p>
      <p>
        Planned {formatCurrency(p.assigned_total)} · Spent {formatCurrency(p.paid_total)}
      </p>
      <p className={`font-medium ${p.remaining < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
        Remaining {formatCurrency(p.remaining)}
      </p>
    </div>
  );
}

function BillCard({ bill, paychecks, onAssign, onDragStart, onMarkPaid, onEdit, onHistory, members }) {
  const assignedMember = (members || []).find((m) => m.id === bill.assigned_to);
  const cyclesOwed = countCyclesOwed(bill);
  const dueSoon = daysUntilDue(bill.due_date) <= 25;

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, bill.id)}
      className={`cursor-grab space-y-2 rounded-lg border border-white/5 p-3 active:cursor-grabbing ${
        dueSoon && bill.status !== 'paid' ? 'bg-[#282c3b]' : 'bg-surface-muted'
      } ${bill.status === 'paid' ? 'opacity-50' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{bill.name}</p>
          <p className="text-xs text-slate-400">
            Due {bill.due_date}
            {Boolean(bill.autopay) && <span className="ml-1.5 rounded bg-accent/15 px-1 py-0.5 text-[10px] text-accent-soft">Autopay</span>}
          </p>
          {assignedMember && (
            <div className="mt-0.5">
              <MemberPill member={assignedMember} />
            </div>
          )}
        </div>
        <button
          onClick={() => onEdit(bill)}
          title="Edit bill"
          className="flex items-center gap-1 text-sm font-semibold text-slate-200 hover:text-accent-soft"
        >
          {formatCurrency(bill.amount)} <Pencil size={11} className="text-slate-500" />
        </button>
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <StatusBadge status={bill.status} />
          <button onClick={() => onHistory(bill)} title="Payment history" className="text-slate-500 hover:text-white">
            <History size={13} />
          </button>
        </div>
        {bill.status !== 'paid' && cyclesOwed > 1 && (
          <button
            onClick={() => onMarkPaid(bill)}
            title="Multiple payments have piled up -- click to catch up"
            className="inline-flex items-center gap-1 rounded-md bg-rose-500/15 px-2 py-0.5 text-[11px] font-medium text-rose-400 hover:bg-rose-500/25"
          >
            <AlertTriangle size={12} /> {cyclesOwed} due
          </button>
        )}
        {bill.status !== 'paid' && cyclesOwed <= 1 && (
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
            {p.pay_date} ({formatCurrency(p.available ?? p.expected_amount)})
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
      <span className="text-xs">{formatCurrency(entry.amount_paid)}</span>
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
