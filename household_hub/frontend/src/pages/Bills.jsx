import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Check, History, AlertTriangle } from 'lucide-react';
import { api } from '../lib/api.js';
import { Card } from '../components/Card.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import MemberPill from '../components/MemberPill.jsx';
import BillFormModal from '../components/BillFormModal.jsx';
import MarkPaidModal from '../components/MarkPaidModal.jsx';
import CatchUpModal from '../components/CatchUpModal.jsx';
import PaymentHistoryModal from '../components/PaymentHistoryModal.jsx';
import { formatCurrency } from '../lib/format.js';
import { daysUntilDue } from '../lib/dueDate.js';
import { missedCycles } from '../lib/recurrence.js';

export default function Bills() {
  const [bills, setBills] = useState([]);
  const [members, setMembers] = useState([]);
  const [paychecks, setPaychecks] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [payingBill, setPayingBill] = useState(null);
  const [catchUpBill, setCatchUpBill] = useState(null);
  const [historyBill, setHistoryBill] = useState(null);

  const refresh = () => {
    api.bills.list().then(setBills);
    api.members.list().then(setMembers);
    api.paychecks.list().then(setPaychecks);
  };

  useEffect(refresh, []);

  const memberById = useMemo(() => Object.fromEntries(members.map((m) => [m.id, m])), [members]);

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

  // Same consolidated catch-up flow as Payment Plans: a recurring bill
  // unpaid long enough to owe more than one cycle gets the split-payment
  // modal instead of a single mark-paid action that would only settle the
  // oldest missed due date.
  const startMarkPaid = (bill) => {
    if (bill.status === 'overdue' && missedCycles(bill.due_date, bill.recurrence).length > 1) {
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Bills</h2>
          <p className="text-sm text-slate-400">All recurring and one-off household bills.</p>
        </div>
        <button
          onClick={() => { setEditing(null); setShowForm(true); }}
          className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium hover:bg-accent-soft"
        >
          <Plus size={16} /> Add bill
        </button>
      </div>

      <Card className="overflow-x-auto" padding="p-0">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-surface-muted text-left text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Balance</th>
              <th className="px-4 py-3">Due</th>
              <th className="px-4 py-3">Recurrence</th>
              <th className="px-4 py-3">Assigned</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {bills.map((b) => {
              const dueSoon = b.status !== 'paid' && daysUntilDue(b.due_date) <= 25;
              const cyclesOwed = b.status === 'overdue' ? missedCycles(b.due_date, b.recurrence).length : 1;
              return (
              <tr key={b.id} className={`border-t border-white/5 hover:bg-white/[0.02] ${dueSoon ? 'bg-[#282c3b]' : ''}`}>
                <td
                  className="px-4 py-3 font-medium cursor-pointer"
                  onClick={() => { setEditing(b); setShowForm(true); }}
                >
                  {b.name}
                  {b.autopay && (
                    <span className="ml-1.5 rounded bg-accent/15 px-1 py-0.5 text-[10px] font-normal text-accent-soft">
                      Autopay
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">{formatCurrency(b.amount)}</td>
                <td className="px-4 py-3 text-slate-400">
                  {b.category_is_debt ? (b.current_balance != null ? formatCurrency(b.current_balance) : '—') : ''}
                </td>
                <td className="px-4 py-3">{b.due_date}</td>
                <td className="px-4 py-3 capitalize text-slate-400">{b.recurrence}</td>
                <td className="px-4 py-3"><MemberPill member={memberById[b.assigned_to]} /></td>
                <td className="px-4 py-3"><StatusBadge status={b.status} /></td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => setHistoryBill(b)}
                      title="Payment history"
                      className="text-slate-500 hover:text-white"
                    >
                      <History size={16} />
                    </button>
                    {b.status !== 'paid' && cyclesOwed > 1 && (
                      <button
                        onClick={() => startMarkPaid(b)}
                        title="Multiple payments have piled up -- click to catch up"
                        className="inline-flex items-center gap-1 rounded-md bg-rose-500/15 px-2.5 py-1 text-xs font-medium text-rose-400 hover:bg-rose-500/25"
                      >
                        <AlertTriangle size={14} /> {cyclesOwed} due
                      </button>
                    )}
                    {b.status !== 'paid' && cyclesOwed <= 1 && (
                      <button
                        onClick={() => startMarkPaid(b)}
                        className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-400 hover:bg-emerald-500/25"
                      >
                        <Check size={14} /> Mark paid
                      </button>
                    )}
                  </div>
                </td>
              </tr>
              );
            })}
            {bills.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                  No bills yet — add your first one.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {showForm && (
        <BillFormModal
          bill={editing}
          members={members}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); refresh(); }}
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
        <PaymentHistoryModal bill={historyBill} members={members} onClose={() => setHistoryBill(null)} />
      )}
    </div>
  );
}
