import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { Card, StatCard } from '../components/Card.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import MemberPill from '../components/MemberPill.jsx';
import { formatCurrency } from '../lib/format.js';

export default function Dashboard() {
  const [bills, setBills] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.bills.list(), api.tasks.list({ status: 'todo' }), api.members.list()])
      .then(([b, t, m]) => {
        setBills(b);
        setTasks(t);
        setMembers(m);
      })
      .finally(() => setLoading(false));
  }, []);

  const memberById = useMemo(() => Object.fromEntries(members.map((m) => [m.id, m])), [members]);

  const upcoming = bills.filter((b) => b.status !== 'paid').slice(0, 5);
  const overdueCount = bills.filter((b) => b.status === 'overdue').length;
  const dueThisWeek = bills.filter((b) => {
    if (b.status === 'paid') return false;
    const days = (new Date(b.due_date) - new Date()) / 86400000;
    return days >= 0 && days <= 7;
  }).length;
  const monthlyTotal = bills
    .filter((b) => b.recurrence === 'monthly' && b.status !== 'paid')
    .reduce((sum, b) => sum + Number(b.amount || 0), 0);

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
        <StatCard label="Monthly bills total" value={formatCurrency(monthlyTotal)} />
        <StatCard label="Open tasks" value={tasks.length} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <h3 className="mb-4 text-sm font-semibold text-slate-200">Upcoming bills</h3>
          <div className="space-y-3">
            {upcoming.length === 0 && <p className="text-sm text-slate-500">Nothing upcoming. Nice.</p>}
            {upcoming.map((b) => (
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
                </div>
              </div>
            ))}
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
    </div>
  );
}
