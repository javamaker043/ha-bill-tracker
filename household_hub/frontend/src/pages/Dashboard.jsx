import React, { useEffect, useMemo, useState } from 'react';
import { Check, AlertTriangle } from 'lucide-react';
import { api } from '../lib/api.js';
import { Card, StatCard } from '../components/Card.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import MemberPill from '../components/MemberPill.jsx';
import MarkPaidModal from '../components/MarkPaidModal.jsx';
import CatchUpModal from '../components/CatchUpModal.jsx';
import { formatCurrency } from '../lib/format.js';
import { missedCycles } from '../lib/recurrence.js';

// A 'once' bill has no ongoing monthly obligation to speak of; weekly and
// yearly recurring bills do, but aren't directly comparable to a monthly
// one until normalized onto the same monthly basis -- otherwise a weekly
// bill's real cash-flow impact (~4.3x its amount per month) is invisible
// next to monthly bills in the same total.
function monthlyEquivalent(bill) {
  if (bill.recurrence === 'weekly') return (Number(bill.amount) || 0) * (52 / 12);
  if (bill.recurrence === 'yearly') return (Number(bill.amount) || 0) / 12;
  if (bill.recurrence === 'monthly') return Number(bill.amount) || 0;
  return 0;
}

export default function Dashboard() {
  const [bills, setBills] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [members, setMembers] = useState([]);
  const [paychecks, setPaychecks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [payingBill, setPayingBill] = useState(null);
  const [catchUpBill, setCatchUpBill] = useState(null);

  const refresh = () => {
    Promise.all([api.bills.list(), api.tasks.list({ status: 'todo' }), api.members.list(), api.paychecks.list()])
      .then(([b, t, m, p]) => {
        setBills(b);
        setTasks(t);
        setMembers(m);
        setPaychecks(p);
      })
      .finally(() => setLoading(false));
  };
  useEffect(refresh, []);

  const memberById = useMemo(() => Object.fromEntries(members.map((m) => [m.id, m])), [members]);

  const upcoming = bills.filter((b) => b.status !== 'paid').slice(0, 5);
  const overdueCount = bills.filter((b) => b.status === 'overdue').length;
  const dueThisWeek = bills.filter((b) => {
    if (b.status === 'paid') return false;
    const days = (new Date(b.due_date) - new Date()) / 86400000;
    return days >= 0 && days <= 7;
  }).length;
  const monthlyTotal = bills.filter((b) => b.status !== 'paid').reduce((sum, b) => sum + monthlyEquivalent(b), 0);

  // Same consolidated catch-up flow as Bills/Payment Plans -- lets the
  // Dashboard actually act on what it shows instead of only summarizing,
  // which otherwise meant navigating away just to pay something it's
  // already flagging as needing attention.
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

  if (loading) return <p className="text-slate-400">Loading…</p>;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold">Overview</h2>
        <p className="text-sm text-slate-400">What needs attention across the household.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Overdue bills" value={overdueCount} tone={overdueCount ? 'danger' : 'good'} />
        <StatCard label="Due this week" value={dueThisWeek} tone={dueThisWeek ? 'warn' : 'good'} />
        <StatCard
          label="Monthly bills total"
          value={formatCurrency(monthlyTotal)}
          sub="Weekly & yearly bills normalized to a monthly amount"
        />
        <StatCard label="Open tasks" value={tasks.length} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <h3 className="mb-4 text-sm font-semibold text-slate-200">Upcoming bills</h3>
          <div className="space-y-3">
            {upcoming.length === 0 && <p className="text-sm text-slate-500">Nothing upcoming. Nice.</p>}
            {upcoming.map((b) => {
              const cyclesOwed = b.status === 'overdue' ? missedCycles(b.due_date, b.recurrence).length : 1;
              return (
                <div key={b.id} className="flex items-center justify-between rounded-lg bg-surface-muted px-3 py-2.5">
                  <div>
                    <p className="text-sm font-medium">{b.name}</p>
                    <p className="text-xs text-slate-400">
                      Due {b.due_date} · <MemberPill member={memberById[b.assigned_to]} />
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium">{formatCurrency(b.amount)}</span>
                    <StatusBadge status={b.status} />
                    {cyclesOwed > 1 ? (
                      <button
                        onClick={() => startMarkPaid(b)}
                        title="Multiple payments have piled up -- click to catch up"
                        className="inline-flex items-center gap-1 rounded-md bg-rose-500/15 px-2 py-1 text-xs font-medium text-rose-400 hover:bg-rose-500/25"
                      >
                        <AlertTriangle size={12} /> {cyclesOwed} due
                      </button>
                    ) : (
                      <button
                        onClick={() => startMarkPaid(b)}
                        className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-1 text-xs font-medium text-emerald-400 hover:bg-emerald-500/25"
                      >
                        <Check size={12} /> Paid
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card>
          <h3 className="mb-4 text-sm font-semibold text-slate-200">Open tasks</h3>
          <div className="space-y-3">
            {tasks.length === 0 && <p className="text-sm text-slate-500">No open tasks.</p>}
            {tasks.slice(0, 6).map((t) => (
              <div key={t.id} className="flex items-center justify-between rounded-lg bg-surface-muted px-3 py-2.5">
                <div>
                  <p className="text-sm font-medium">{t.title}</p>
                  <p className="text-xs text-slate-400">
                    {t.due_date ? `Due ${t.due_date}` : 'No due date'} · <MemberPill member={memberById[t.assigned_to]} />
                  </p>
                </div>
                <StatusBadge status={t.status} />
              </div>
            ))}
          </div>
        </Card>
      </div>

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
    </div>
  );
}
