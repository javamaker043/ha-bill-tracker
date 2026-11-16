// The instructions given to Claude (with the Monarch connection) to produce a
// snapshot. Keep in sync with docs/monarch-snapshot-import.md and
// backend/src/services/monarchSnapshot.js (schema version 1).
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
  ]
}`;

export const SNAPSHOT_PROMPT = `Use ONLY read-only Monarch tools (GetAccounts, GetRecurring, GetCashFlow, GetBudget). Do not call any create, update, or delete tool.

Build a Household Hub snapshot and reply with ONLY one JSON code block (no other text), in exactly this shape:

${SNAPSHOT_EXAMPLE}

How to fill it in:
- taken_at: today's date, YYYY-MM-DD.
- accounts: every liability account (credit cards, student/auto/other loans, mortgage). id = Monarch's account id as a string; name and type as Monarch reports them; balance EXACTLY as reported (debts are negative); apr for credit cards, interest_rate for loans; minimum_payment. Use null for anything Monarch doesn't have -- never guess.
- income.recurring: GetRecurring with include_liabilities=false; every recurring INCOME stream: name, frequency (as Monarch reports it), amount (positive), last_paid_date, next_date.
- income.paycheck_avg_monthly: GetCashFlow over the last 6 complete months, grouped by month, income category "Paychecks" only; the average per month (null if unavailable).
- income.budgeted_paychecks: GetBudget for the current month; the budgeted amount for "Paychecks" (null if none).
Do not include transactions, account numbers, or anything not listed above.`;
