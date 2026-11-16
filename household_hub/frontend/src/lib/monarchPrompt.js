// The instructions given to Claude (with the Monarch connection) to produce a
// snapshot. Keep in sync with docs/monarch-snapshot-import.md and
// backend/src/services/monarchSnapshot.js (schema version 1; the
// recurring_expenses and transactions sections are optional).
export const SNAPSHOT_EXAMPLE = `{
  "version": 1,
  "taken_at": "2026-11-15",
  "income": {
    "recurring": [
      { "name": "Employer A", "frequency": "biweekly", "amount": 2000, "last_paid_date": "2026-11-07", "next_date": "2026-11-21" }
    ],
    "paycheck_avg_monthly": 4300,
    "budgeted_paychecks": 4200
  },
  "accounts": [
    { "id": "123", "name": "Example Rewards Card (...1234)", "type": "Credit Card", "balance": -1500.25, "apr": 24.99, "interest_rate": null, "minimum_payment": 45 },
    { "id": "456", "name": "Example Auto Loan (...9876)", "type": "Auto", "balance": -12000, "apr": null, "interest_rate": 6.5, "minimum_payment": 310 }
  ],
  "recurring_expenses": [
    { "id": "s1", "name": "Phone", "merchant": "Example Wireless", "frequency": "monthly", "amount": -95, "category": "Phone", "last_paid_date": "2026-11-03", "next_date": "2026-12-03" }
  ],
  "transactions": [
    { "id": "t1", "date": "2026-11-03", "amount": -95, "merchant": "Example Wireless", "category": "Phone", "account": "Example Checking" }
  ]
}`;

export const SNAPSHOT_PROMPT = `Use ONLY read-only Monarch tools (GetAccounts, GetRecurring, GetCashFlow, GetBudget, GetTransactions). Do not call any create, update, or delete tool.

Build a Household Hub snapshot and reply with ONLY one JSON code block (no other text), in exactly this shape:

${SNAPSHOT_EXAMPLE}

How to fill it in:
- taken_at: today's date, YYYY-MM-DD.
- accounts: every liability account (credit cards, student/auto/other loans, mortgage). id = Monarch's account id as a string; name and type as Monarch reports them; balance EXACTLY as reported (debts are negative); apr for credit cards, interest_rate for loans; minimum_payment. Use null for anything Monarch doesn't have -- never guess.
- income.recurring: GetRecurring with include_liabilities=false; every recurring INCOME stream: name, frequency (as Monarch reports it), amount (positive), last_paid_date, next_date.
- income.paycheck_avg_monthly: GetCashFlow over the last 6 complete months, grouped by month, income category "Paychecks" only; the average per month (null if unavailable).
- income.budgeted_paychecks: GetBudget for the current month; the budgeted amount for "Paychecks" (null if none).
- recurring_expenses: from the same GetRecurring call, every recurring EXPENSE stream (not credit-card payment streams, not transfers): id = the stream_id; name, merchant, frequency, amount (as reported), category, last_paid_date, next_date.
- transactions: GetTransactions for the last 45 days, Debit only, newest first. Include only transactions that look like bill payments: merchants matching a recurring expense stream above, payments to credit cards or loans, and categories such as utilities, phone, internet, insurance, rent/mortgage, subscriptions, loan repayment. At most 150. For each: id, date, amount (as reported), merchant, category, and account = the account NAME only.
Do not include account numbers, descriptions, notes, or anything not listed above.`;
