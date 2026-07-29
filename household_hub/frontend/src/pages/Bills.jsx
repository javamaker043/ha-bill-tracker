import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Check } from 'lucide-react';
import { api } from '../lib/api.js';
import { Card } from '../components/Card.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import MemberPill from '../components/MemberPill.jsx';
import BillFormModal from '../components/BillFormModal.jsx';

export default function Bills() {
  const [bills, setBills] = useState([]);
  const [members, setMembers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

  const refresh = () => {
    api.bills.list().then(setBills);
    api.members.list().then(setMembers);
  };

  useEffect(refresh, []);

  const memberById = useMemo(() => Object.fromEntries(members.map((m) => [m.id, m])), [members]);

  const markPaid = async (id) => {
    await api.bills.pay(id);
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

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-surface-muted text-left text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Amount</th>
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
                <td className="px-4 py-3">${Number(b.amount).toFixed(2)}</td>
                <td className="px-4 py-3">{b.due_date}</td>
                <td className="px-4 py-3 capitalize text-slate-400">{b.recurrence}</td>
                <td className="px-4 py-3"><MemberPill member={memberById[b.assigned_to]} /></td>
                <td className="px-4 py-3"><StatusBadge status={b.status} /></td>
                <td className="px-4 py-3 text-right">
                  {b.status !== 'paid' && (
                    <button
                      onClick={() => markPaid(b.id)}
                      className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-400 hover:bg-emerald-500/25"
                    >
                      <Check size={14} /> Mark paid
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {bills.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
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
    </div>
  );
}
