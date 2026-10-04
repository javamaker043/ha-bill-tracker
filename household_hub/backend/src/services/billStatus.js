import { localToday } from './dateUtil.js';

export function withComputedStatus(bill) {
  if (bill.status === 'paid') return bill;
  return { ...bill, status: bill.due_date < localToday() ? 'overdue' : 'unpaid' };
}
