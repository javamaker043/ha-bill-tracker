import React from 'react';

const styles = {
  paid: 'bg-emerald-500/15 text-emerald-400',
  unpaid: 'bg-amber-500/15 text-amber-400',
  overdue: 'bg-rose-500/15 text-rose-400',
  todo: 'bg-slate-500/15 text-slate-300',
  in_progress: 'bg-accent/15 text-accent-soft',
  done: 'bg-emerald-500/15 text-emerald-400',
};

const labels = {
  in_progress: 'In progress',
};

export default function StatusBadge({ status }) {
  const label = labels[status] || status?.charAt(0).toUpperCase() + status?.slice(1);
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status] || styles.todo}`}>
      {label}
    </span>
  );
}
