import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
  format, isSameMonth, isToday, addMonths, subMonths,
} from 'date-fns';
import { api } from '../lib/api.js';
import { Card } from '../components/Card.jsx';

export default function BillCalendar() {
  const [cursor, setCursor] = useState(new Date());
  const [bills, setBills] = useState([]);

  const rangeStart = startOfWeek(startOfMonth(cursor));
  const rangeEnd = endOfWeek(endOfMonth(cursor));
  const days = eachDayOfInterval({ start: rangeStart, end: rangeEnd });

  useEffect(() => {
    api.bills
      .calendar(format(rangeStart, 'yyyy-MM-dd'), format(rangeEnd, 'yyyy-MM-dd'))
      .then(setBills);
  }, [cursor]);

  const billsByDay = useMemo(() => {
    const map = {};
    for (const b of bills) {
      (map[b.due_date] ||= []).push(b);
    }
    return map;
  }, [bills]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Bill calendar</h2>
          <p className="text-sm text-slate-400">See every due date at a glance.</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setCursor(subMonths(cursor, 1))} className="rounded-lg p-2 hover:bg-white/5">
            <ChevronLeft size={18} />
          </button>
          <span className="w-32 text-center text-sm font-medium">{format(cursor, 'MMMM yyyy')}</span>
          <button onClick={() => setCursor(addMonths(cursor, 1))} className="rounded-lg p-2 hover:bg-white/5">
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

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
                  {dayBills.slice(0, 3).map((b) => (
                    <div
                      key={b.id}
                      className={`truncate rounded px-1.5 py-0.5 text-[11px] font-medium ${
                        b.status === 'overdue'
                          ? 'bg-rose-500/20 text-rose-300'
                          : b.status === 'paid'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-accent/20 text-accent-soft'
                      }`}
                      title={`${b.name} — $${b.amount}`}
                    >
                      {b.name}
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
  );
}
