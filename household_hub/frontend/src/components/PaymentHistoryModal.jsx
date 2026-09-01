import React, { useEffect, useState } from 'react';
import Modal from './Modal.jsx';
import MemberPill from './MemberPill.jsx';
import { api } from '../lib/api.js';
import { isDebtCategory } from '../lib/billCategory.js';
import { formatCurrency } from '../lib/format.js';

// SQLite's datetime('now') returns UTC with no timezone marker, so append
// one before parsing or the Date constructor treats it as local time.
function formatPaidDate(paidDate) {
  const d = new Date(`${paidDate.replace(' ', 'T')}Z`);
  return isNaN(d) ? paidDate : d.toLocaleString();
}

function paidFromLabel(p) {
  if (p.paycheck_pay_date) return `Paycheck ${p.paycheck_pay_date}`;
  if (p.source) return p.source;
  return '—';
}

export default function PaymentHistoryModal({ bill, members, onClose }) {
  const [payments, setPayments] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.bills
      .get(bill.id)
      .then((full) => setPayments(full.payments))
      .catch((err) => setError(err.message));
  }, [bill.id]);

  const memberById = Object.fromEntries((members || []).map((m) => [m.id, m]));
  const showBalance = isDebtCategory(bill.category) || (payments || []).some((p) => p.statement_balance != null);

  return (
    <Modal title={`Payment history — ${bill.name}`} onClose={onClose}>
      {error && <p className="text-sm text-rose-400">{error}</p>}
      {!error && !payments && <p className="text-sm text-slate-400">Loading…</p>}
      {payments && payments.length === 0 && (
        <p className="text-sm text-slate-500">No payments recorded yet for this bill.</p>
      )}
      {payments && payments.length > 0 && (
        <div className="max-h-80 overflow-y-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="pb-2 pr-3">Date</th>
                <th className="pb-2 pr-3">Amount</th>
                {showBalance && <th className="pb-2 pr-3">Balance</th>}
                <th className="pb-2 pr-3">Paid from</th>
                <th className="pb-2">Paid by</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-t border-white/5">
                  <td className="py-2 pr-3 text-slate-300">{formatPaidDate(p.paid_date)}</td>
                  <td className="py-2 pr-3 font-medium">{formatCurrency(p.amount_paid)}</td>
                  {showBalance && (
                    <td className="py-2 pr-3 text-slate-300">
                      {p.statement_balance != null ? formatCurrency(p.statement_balance) : '—'}
                    </td>
                  )}
                  <td className="py-2 pr-3 text-slate-300">{paidFromLabel(p)}</td>
                  <td className="py-2">
                    <MemberPill member={memberById[p.paid_by]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-4 flex justify-end">
        <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-slate-300 hover:bg-white/5">
          Close
        </button>
      </div>
    </Modal>
  );
}
