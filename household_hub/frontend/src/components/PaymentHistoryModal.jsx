import React, { useEffect, useState } from 'react';
import Modal from './Modal.jsx';
import MemberPill from './MemberPill.jsx';
import { api } from '../lib/api.js';
import { formatCurrency } from '../lib/format.js';

// Payments logged through the app store a bare "YYYY-MM-DD" (a calendar
// day, shown as-is); 0.3.0 stored backdated ones as "YYYY-MM-DD 00:00:00",
// same thing. Anything else is an older SQLite datetime('now') -- UTC with
// no timezone marker -- so append one before parsing or Date treats it as
// local time, then show the viewer's local calendar day.
function formatPaidDate(paidDate) {
  const dayOnly = paidDate.match(/^(\d{4}-\d{2}-\d{2})(?: 00:00:00)?$/);
  if (dayOnly) return dayOnly[1];
  const d = new Date(`${paidDate.replace(' ', 'T')}Z`);
  return isNaN(d) ? paidDate : d.toLocaleDateString();
}

function paidFromLabel(p) {
  if (p.paycheck_pay_date) return `Paycheck ${p.paycheck_pay_date}`;
  if (p.source) return p.source;
  return '—';
}

export default function PaymentHistoryModal({ bill, members, onClose, onChanged }) {
  const [payments, setPayments] = useState(null);
  const [error, setError] = useState(null);
  const [confirmingId, setConfirmingId] = useState(null);
  const [undoing, setUndoing] = useState(false);

  const load = () =>
    api.bills
      .get(bill.id)
      .then((full) => setPayments(full.payments))
      .catch((err) => setError(err.message));

  useEffect(() => {
    load();
  }, [bill.id]);

  const memberById = Object.fromEntries((members || []).map((m) => [m.id, m]));
  const showBalance = Boolean(bill.category_is_debt) || (payments || []).some((p) => p.statement_balance != null);
  // Only the newest payment (highest id) can be undone -- see the DELETE
  // route in the backend for why.
  const latestId = (payments || []).reduce((max, p) => Math.max(max, p.id), 0);

  const undo = async (payment) => {
    setUndoing(true);
    setError(null);
    try {
      await api.bills.removePayment(bill.id, payment.id);
      setConfirmingId(null);
      await load();
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setUndoing(false);
    }
  };

  return (
    <Modal title={`Payment history — ${bill.name}`} onClose={onClose}>
      {error && <p className="mb-2 text-sm text-rose-400">{error}</p>}
      {!error && !payments && <p className="text-sm text-slate-400">Loading…</p>}
      {payments && payments.length === 0 && (
        <p className="text-sm text-slate-500">No payments recorded yet for this bill.</p>
      )}
      {payments && payments.length > 0 && (
        <div className="max-h-80 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="pb-2 pr-3">Date</th>
                <th className="pb-2 pr-3">Amount</th>
                {showBalance && <th className="pb-2 pr-3">Balance</th>}
                <th className="pb-2 pr-3">Paid from</th>
                <th className="pb-2 pr-3">Paid by</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-t border-white/5">
                  <td className="whitespace-nowrap py-2 pr-3 text-slate-300">{formatPaidDate(p.paid_date)}</td>
                  <td className="py-2 pr-3 font-medium">{formatCurrency(p.amount_paid)}</td>
                  {showBalance && (
                    <td className="py-2 pr-3 text-slate-300">
                      {p.statement_balance != null ? formatCurrency(p.statement_balance) : '—'}
                    </td>
                  )}
                  <td className="py-2 pr-3 text-slate-300">{paidFromLabel(p)}</td>
                  <td className="py-2 pr-3">
                    <MemberPill member={memberById[p.paid_by]} />
                  </td>
                  <td className="whitespace-nowrap py-2 text-right">
                    {p.id === latestId &&
                      (confirmingId === p.id ? (
                        <>
                          <button
                            onClick={() => undo(p)}
                            disabled={undoing}
                            className="rounded bg-rose-500/20 px-2 py-1 text-xs font-medium text-rose-300 hover:bg-rose-500/30 disabled:opacity-50"
                          >
                            {undoing ? 'Undoing…' : 'Confirm undo'}
                          </button>
                          <button
                            onClick={() => setConfirmingId(null)}
                            disabled={undoing}
                            className="ml-1 px-1 text-xs text-slate-400 hover:text-white"
                          >
                            Keep
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setConfirmingId(p.id)}
                          className="text-xs text-slate-500 hover:text-rose-400"
                        >
                          Undo
                        </button>
                      ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {payments && payments.length > 0 && (
        <p className="mt-3 text-xs text-slate-500">
          Undo removes the most recent payment and moves the bill back to the due date it covered. The
          stored balance isn't changed -- edit the bill if it needs correcting.
        </p>
      )}
      <div className="mt-4 flex justify-end">
        <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-slate-300 hover:bg-white/5">
          Close
        </button>
      </div>
    </Modal>
  );
}
