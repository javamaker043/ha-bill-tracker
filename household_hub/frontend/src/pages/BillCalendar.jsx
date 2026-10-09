import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
  format, isSameMonth, isToday, addMonths, subMonths,
} from 'date-fns';
import { api } from '../lib/api.js';
import { Card } from '../components/Card.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { formatCurrency } from '../lib/format.js';
import { advanceDueDate } from '../lib/recurrence.js';
import { todayISO } from '../lib/dueDate.js';

// A recurring bill only stores its *next* unpaid due date, so listing bills
// by that date alone would show each one in a single month and leave every
// later month looking empty. This projects the bill's future cycles into the
// visible range: the stored due date keeps the bill's real status, and the
// cycles after it are upcoming (or overdue, if they're already behind us).
function occurrencesInRange(bill, fromISO, toISO) {
  const today = todayISO();
  const out = [];
  const statusFor = (date, isFirst) => {
    if (bill.status === 'paid') return 'paid';
    if (date < today) return 'overdue';
    return isFirst ? bill.status : 'unpaid';
  };
  if (bill.recurrence === 'once') {
    if (bill.due_date >= fromISO && bill.due_date <= toISO) {
      out.push({ bill, date: bill.due_date, status: statusFor(bill.due_date, true) });
    }
    return out;
  }
  let date = bill.due_date;
  let isFirst = true;
  for (let i = 0; i < 1000 && date <= toISO; i++) {
    if (date >= fromISO) out.push({ bill, date, status: statusFor(date, isFirst) });
    date = advanceDueDate(date, bill.recurrence, bill.due_day);
    isFirst = false;
  }
  return out;
}

const chipClass = (status) =>
  status === 'overdue'
    ? 'bg-rose-500/20 text-rose-300'
    : status === 'paid'
    ? 'bg-emerald-500/20 text-emerald-300'
    : 'bg-accent/20 text-accent-soft';

export default function BillCalendar() {
  const [cursor, setCursor] = useState(new Date());
  const [bills, setBills] = useState([]);

  const rangeStart = startOfWeek(startOfMonth(cursor));
  const rangeEnd = endOfWeek(endOfMonth(cursor));
  const days = eachDayOfInterval({ start: rangeStart, end: rangeEnd });

  useEffect(() => {
    api.bills.list().then(setBills);
  }, []);

  const fromISO = format(rangeStart, 'yyyy-MM-dd');
  const toISO = format(rangeEnd, 'yyyy-MM-dd');

  const occurrences = useMemo(
    () => bills.flatMap((b) => occurrencesInRange(b, fromISO, toISO)),
    [bills, fromISO, toISO]
  );

  const billsByDay = useMemo(() => {
    const map = {};
    for (const o of occurrences) {
      (map[o.date] ||= []).push(o);
    }
    return map;
  }, [occurrences]);

  // Phone-friendly agenda: only the days of the displayed month itself (the
  // grid also pads with neighbouring months' days to fill whole weeks).
  const monthPrefix = format(cursor, 'yyyy-MM');
  const agenda = useMemo(
    () =>
      occurrences
        .filter((o) => o.date.startsWith(monthPrefix))
        .sort((a, b) => a.date.localeCompare(b.date) || a.bill.name.localeCompare(b.bill.name)),
    [occurrences, monthPrefix]
  );
  const monthTotal = agenda.reduce((sum, o) => sum + (Number(o.bill.amount) || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">Bill calendar</h2>
          <p className="text-sm text-slate-400">See every due date at a glance.</p>
        </div>
        <div className="flex items-center gap-1 sm:gap-3">
          <button
            onClick={() => setCursor(subMonths(cursor, 1))}
            title="Previous month"
            className="rounded-lg p-2 hover:bg-white/5"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="w-28 text-center text-sm font-medium sm:w-32">{format(cursor, 'MMMM yyyy')}</span>
          <button
            onClick={() => setCursor(addMonths(cursor, 1))}
            title="Next month"
            className="rounded-lg p-2 hover:bg-white/5"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* Small screens: a seven-column grid is unreadable under ~600px, so
          show the month as a dated list instead. */}
      <div className="sm:hidden">
        <Card padding="p-0">
          <div className="flex items-center justify-between border-b border-white/5 px-4 py-3 text-xs text-slate-400">
            <span>
              {agenda.length} bill{agenda.length === 1 ? '' : 's'} due
            </span>
            <span>{formatCurrency(monthTotal)} total</span>
          </div>
          {agenda.length === 0 && <p className="px-4 py-6 text-center text-sm text-slate-500">No bills due this month.</p>}
          {agenda.map((o) => (
            <div
              key={`${o.bill.id}-${o.date}`}
              className="flex items-center justify-between gap-3 border-b border-white/5 px-4 py-3 last:border-b-0"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{o.bill.name}</p>
                <p className={`text-xs ${o.date === todayISO() ? 'font-semibold text-accent-soft' : 'text-slate-400'}`}>
                  {format(new Date(`${o.date}T00:00:00`), 'EEE, MMM d')}
                  {o.date === todayISO() ? ' · today' : ''}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-sm font-medium">{formatCurrency(o.bill.amount)}</span>
                <StatusBadge status={o.status} />
              </div>
            </div>
          ))}
        </Card>
      </div>

      <div className="hidden sm:block">
        <Card padding="p-3">
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-slate-500">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d} className="py-2">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {days.map((day) => {
              const key = format(day, 'yyyy-MM-dd');
              const dayBills = billsByDay[key] || [];
              return (
                <div
                  key={key}
                  className={`min-h-[92px] rounded-lg border border-white/5 p-2 text-left ${
                    isSameMonth(day, cursor) ? 'bg-surface-muted' : 'bg-surface-muted/30 text-slate-600'
                  }`}
                >
                  <p className={`mb-1 text-xs ${isToday(day) ? 'font-semibold text-accent-soft' : 'text-slate-400'}`}>
                    {format(day, 'd')}
                  </p>
                  <div className="space-y-1">
                    {dayBills.slice(0, 3).map((o) => (
                      <div
                        key={o.bill.id}
                        className={`truncate rounded px-1.5 py-0.5 text-[11px] font-medium ${chipClass(o.status)}`}
                        title={`${o.bill.name} — ${formatCurrency(o.bill.amount)}`}
                      >
                        {o.bill.name}
                      </div>
                    ))}
                    {dayBills.length > 3 && (
                      <p className="text-[10px] text-slate-500">+{dayBills.length - 3} more</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}
