import React, { useEffect, useMemo, useState } from 'react';
import { Check, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { Card, StatCard } from '../components/Card.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import MemberPill from '../components/MemberPill.jsx';
import MarkPaidModal from '../components/MarkPaidModal.jsx';
import CatchUpModal from '../components/CatchUpModal.jsx';
import { formatCurrency } from '../lib/format.js';
import { daysUntilDue, todayISO } from '../lib/dueDate.js';
import { cyclesOwed as countCyclesOwed } from '../lib/recurrence.js';

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
    Promise.all([api.bills.list(), api.tasks.list(), api.members.list(), api.paychecks.list()])
      .then(([b, t, m, p]) => {
        setBills(b);
        // Open = anything not done, so tasks someone has started (in
        // progress) don't vanish from the overview.
        setTasks(t.filter((task) => task.status !== 'done'));
        setMembers(m);
        setPaychecks(p);
      })
      .finally(() => setLoading(false));
  };
  useEffect(refresh, []);

  const memberById = useMemo(() => Object.fromEntries(members.map((m) => [m.id, m])), [members]);

  const unpaid = bills.filter((b) => b.status !== 'paid');
  const upcoming = unpaid.slice(0, 5);
  const overdue = unpaid.filter((b) => b.status === 'overdue');
  // What's actually owed, not just how many bills: every missed cycle of an
  // overdue recurring bill is a payment still outstanding.
  const overdueAmount = overdue.reduce((sum, b) => sum + (Number(b.amount) || 0) * countCyclesOwed(b), 0);
  const dueThisWeek = unpaid.filter((b) => {
    const days = daysUntilDue(b.due_date);
    return days >= 0 && days <= 7;
  }).length;
  const monthlyTotal = unpaid.reduce((sum, b) => sum + monthlyEquivalent(b), 0);

  // The soonest paycheck that hasn't happened yet (or is today) -- the one
  // new bills should be planned against.
  const nextPaycheck = paychecks.find((p) => p.pay_date >= todayISO()) || null;

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

  // Same consolidated catch-up flow as Bills/Payment Plans -- lets the
  // Dashboard actually act on what it shows instead of only summarizing.
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

  if (loading) return <p className="text-slate-400">Loading…</p>;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold">Overview</h2>
        <p className="text-sm text-slate-400">What needs attention across the household.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Overdue bills"
          value={overdue.length}
          tone={overdue.length ? 'danger' : 'good'}
          sub={overdue.length ? `${formatCurrency(overdueAmount)} past due` : undefined}
        />
        <StatCard label="Due this week" value={dueThisWeek} tone={dueThisWeek ? 'warn' : 'good'} />
        <StatCard
          label="Monthly bills total"
          value={formatCurrency(monthlyTotal)}
          sub="Weekly & yearly bills normalized to a monthly amount"
        />
        <StatCard label="Open tasks" value={tasks.length} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Card>
            <h3 className="mb-4 text-sm font-semibold text-slate-200">Upcoming bills</h3>
            <div className="space-y-3">
              {upcoming.length === 0 && <p className="text-sm text-slate-500">Nothing upcoming. Nice.</p>}
              {upcoming.map((b) => {
                const owed = countCyclesOwed(b);
                return (
                  <div key={b.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-muted px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{b.name}</p>
                      <p className="text-xs text-slate-400">
                        Due {b.due_date} · <MemberPill member={memberById[b.assigned_to]} />
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium">{formatCurrency(b.amount)}</span>
                      <StatusBadge status={b.status} />
                      {owed > 1 ? (
                        <button
                          onClick={() => startMarkPaid(b)}
                          title="Multiple payments have piled up -- click to catch up"
                          className="inline-flex items-center gap-1 rounded-md bg-rose-500/15 px-2 py-1 text-xs font-medium text-rose-400 hover:bg-rose-500/25"
                        >
                          <AlertTriangle size={12} /> {owed} due
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
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-200">Next paycheck</h3>
              <Link to="/payment-plans" className="text-xs text-accent-soft hover:underline">
                Payment Plans
              </Link>
            </div>
            {nextPaycheck ? (
              <div className="text-sm">
                <p className="text-slate-300">
                  {nextPaycheck.pay_date}
                  <span className="text-slate-500"> · {formatCurrency(nextPaycheck.available)} available</span>
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  Planned {formatCurrency(nextPaycheck.assigned_total)} · Spent {formatCurrency(nextPaycheck.paid_total)}
                </p>
                <p
                  className={`mt-1 font-medium ${nextPaycheck.remaining < 0 ? 'text-rose-400' : 'text-emerald-400'}`}
                >
                  {nextPaycheck.remaining < 0
                    ? `Over-committed by ${formatCurrency(-nextPaycheck.remaining)}`
                    : `${formatCurrency(nextPaycheck.remaining)} left after planned bills`}
                </p>
              </div>
            ) : (
              <p className="text-sm text-slate-500">
                No upcoming paycheck planned yet -- add one in Payment Plans to see what each check covers.
              </p>
            )}
          </Card>
        </div>

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
