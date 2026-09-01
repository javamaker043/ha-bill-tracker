import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Check, History } from 'lucide-react';
import { api } from '../lib/api.js';
import { Card } from '../components/Card.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import MemberPill from '../components/MemberPill.jsx';
import BillFormModal from '../components/BillFormModal.jsx';
import MarkPaidModal from '../components/MarkPaidModal.jsx';
import PaymentHistoryModal from '../components/PaymentHistoryModal.jsx';
import { isDebtCategory } from '../lib/billCategory.js';
import { formatCurrency } from '../lib/format.js';

export default function Bills() {
  const [bills, setBills] = useState([]);
  const [members, setMembers] = useState([]);
  const [paychecks, setPaychecks] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [payingBill, setPayingBill] = useState(null);
  const [historyBill, setHistoryBill] = useState(null);

  const refresh = () => {
    api.bills.list().then(setBills);
    api.members.list().then(setMembers);
    api.paychecks.list().then(setPaychecks);
  };

  useEffect(refresh, []);

  const memberById = useMemo(() => Object.fromEntries(members.map((m) => [m.id, m])), [members]);

  const confirmPaid = async (amount, paidBy, statementBalance, paycheckId, source) => {
    await api.bills.pay(payingBill.id, {
      amount_paid: amount,
      paid_by: paidBy,
      statement_balance: statementBalance,
      paycheck_id: paycheckId,
      source,
    });
    setPayingBill(null);
    refresh();
  };

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
            {bills.map((b) => (
              <tr key={b.id} className="border-t border-white/5 hover:bg-white/[0.02]">
                <td
                  className="px-4 py-3 font-medium cursor-pointer"
                  onClick={() => { setEditing(b); setShowForm(true); }}
                >
                  {b.name}
                </td>
                <td className="px-4 py-3">{formatCurrency(b.amount)}</td>
                <td className="px-4 py-3 text-slate-400">
                  {isDebtCategory(b.category) ? (b.current_balance != null ? formatCurrency(b.current_balance) : '—') : ''}
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
                    {b.status !== 'paid' && (
                      <button
                        onClick={() => setPayingBill(b)}
                        className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-400 hover:bg-emerald-500/25"
                      >
                        <Check size={14} /> Mark paid
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
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

      {historyBill && (
        <PaymentHistoryModal bill={historyBill} members={members} onClose={() => setHistoryBill(null)} />
      )}
    </div>
  );
}
