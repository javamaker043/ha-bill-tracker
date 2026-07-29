export function withComputedStatus(bill) {
  if (bill.status === 'paid') return bill;
  const today = new Date().toISOString().slice(0, 10);
  return { ...bill, status: bill.due_date < today ? 'overdue' : 'unpaid' };
}
