import React from 'react';

export function Card({ children, className = '' }) {
  return (
    <div className={`rounded-xl2 border border-white/5 bg-surface-raised p-5 ${className}`}>
      {children}
    </div>
  );
}

export function StatCard({ label, value, sub, tone = 'default' }) {
  const tones = {
    default: 'text-slate-100',
    danger: 'text-rose-400',
    warn: 'text-amber-400',
    good: 'text-emerald-400',
  };
  return (
    <Card>
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${tones[tone]}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </Card>
  );
}
