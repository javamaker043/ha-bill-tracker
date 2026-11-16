# Monarch snapshot import: how to use it

The **Monarch Import** page brings debt balances, APRs, and income figures from Monarch Money into
Household Hub, and **Monarch Review** uses the same snapshot to suggest payments to log and to compare
recurring bills. It works from a *snapshot*: a small JSON document that Claude (with your Monarch
connection) builds from Monarch's read-only data and you paste into the app.

- Nothing is written to Monarch, ever. The prompt forbids write tools and the app has no Monarch credentials.
- Nothing changes in Household Hub until you review and confirm.
- The snapshot contains balances, rates, income figures, recurring expense streams, and about 45 days of
  bill-like transactions (merchant, date, amount, account *name*): no descriptions, notes, or account numbers.
  The latest 5 are stored in the add-on's database, never in git.

## Steps

1. In Household Hub, open **Monarch Import** (sidebar).
2. Click **Copy prompt**. (If the browser blocks copying, tap the prompt box and copy it manually.)
3. Open a Claude conversation that has the **Monarch Money** connection enabled and paste the prompt.
   Claude reads from Monarch and replies with a single JSON code block.
4. Copy Claude's whole reply (the code fence is fine, even if there is some text around it) and paste it into
   **Paste Claude's reply**. Click **Preview**.
5. Review the preview (below), adjust, then click **Apply**.

Repeat whenever you want fresh balances (for example after statements post). Linked accounts are
recognized automatically the next time.

## What the preview lets you decide

**Monthly income** (feeds the Monthly Budget page). Choose one:

| Option | What it is | Watch out for |
|---|---|---|
| Active recurring pay streams | Each recurring income stream converted to a monthly amount (biweekly x 26/12, semimonthly x 2, weekly x 52/12, monthly x 1) | Only streams paid in the last 75 days are counted. Stale ones are listed with the reason and can be ticked back in by hand |
| 6-month average of paychecks | Average monthly "Paychecks" category income | Includes irregular pay, advances, bonuses, so it can be much higher |
| Budgeted paychecks | The amount budgeted for Paychecks in Monarch | Only as good as the budget |
| Don't change my income | Leave it alone | |

These figures can differ a lot. If your pay varies, plan against the lower of a current stream total and a long average.

**Debt accounts.** Each account in the snapshot becomes one of:
- **Linked** to an existing bill (suggested by name and last four digits; an existing link is remembered), or
- **Create a new bill** (you must give the next due date: Monarch doesn't know it), or
- **Skip**.

For linked/created bills, tick what to update:
- **Balance**: sets the bill's current balance to what is owed (and records the "as of" date). Linked bills then
  no longer require typing a statement balance when marking a payment paid (it's optional).
- **APR**: sets the bill's interest rate when Monarch has one (credit cards use APR, loans use interest rate).
- **Payment amount**: sets the bill's payment to Monarch's minimum payment. Off by default so a bill you
  deliberately pay more on isn't overwritten.

Warnings appear for: accounts with no APR/minimum payment in Monarch (payoff plans need both), credit
balances, and linked bills whose category isn't marked as debt in Settings (Debt Management only lists
debt categories).

## Snapshot format (version 1)

```json
{
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
    { "id": "123", "name": "Example Rewards Card (...1234)", "type": "Credit Card", "institution": "Example Bank", "balance": -1500.25, "apr": 24.99, "interest_rate": null, "minimum_payment": 45 }
  ],
  "recurring_expenses": [
    { "id": "s1", "name": "Phone", "merchant": "Example Wireless", "frequency": "monthly", "amount": -95, "category": "Phone", "last_paid_date": "2026-11-03", "next_date": "2026-12-03" }
  ],
  "transactions": [
    { "id": "t1", "date": "2026-11-03", "amount": -95, "merchant": "Example Wireless", "category": "Phone", "account": "Example Checking" }
  ]
}
```

Rules: `version` must be 1; `taken_at` is `YYYY-MM-DD`; account `id`s are unique; balances are numbers **as
Monarch reports them (debts are negative)**; a missing APR/rate/payment is `null`, never a guess;
`income`, `recurring_expenses`, `transactions` and their fields are optional (older snapshots without the last
two still import). Transaction `id`s must be unique and are what stops a payment being logged twice.
Limits: 500 accounts, 200 income streams, 200 recurring expenses, 300 transactions.

## Monarch Review (payments and recurring bills)

When the snapshot includes `recurring_expenses` and `transactions`, **Monarch Review** (sidebar) uses them. The
Dashboard also shows a banner when payments are waiting.

**Suggested payments** lists recent Monarch transactions that look like payments of your unpaid bills.
- A transaction matches a bill when the merchant name overlaps the bill's name or payee **and** the amount is close
  (within 5% or $1). For credit cards and loans, any amount at or above half the usual payment counts, since you
  often pay more than the minimum.
- Each payment settles one cycle, oldest first, so a bill that is two months behind can absorb two transactions.
  Payments up to 10 days before a due date count towards that due date.
- Strong matches start ticked; "likely" ones start unticked. Change the target bill from the dropdown if the
  guess is wrong. **Dismiss** hides a transaction for good.
- Accepting logs the payment exactly like **Mark paid**, with Monarch's date and amount and paid-from "Monarch:
  <account name>". The Monarch transaction id is stored so it can never be logged twice, and you can still undo it
  from the bill's history (it then reappears as a suggestion).
- Transactions you already logged by hand (same bill, same amount, within 5 days) are skipped automatically.

**Recurring bills** compares Monarch's recurring expense streams with your bills:
- **Price changes:** a matched bill whose amount differs by more than ~2% or $0.50. Tick to update the bill.
- **In Monarch but not tracked here:** active streams with no matching bill. Tick to add one (you confirm the name,
  amount, due date and category). Biweekly, twice-monthly and quarterly streams are converted to a monthly amount.
  **Ignore** hides a stream for good.
- **Tracked here but not seen in Monarch:** recurring bills with no matching stream (possibly cancelled or named
  differently). Credit cards and loans linked to a Monarch account are not listed here.
- **Stale streams** (not paid in about 2.5 months) are listed separately and never proposed as new bills.
- Applying also remembers name-based matches, so renaming a bill on either side doesn't break the link.

## The prompt

This is exactly what **Copy prompt** gives you (it lives in `frontend/src/lib/monarchPrompt.js`):

```text
Use ONLY read-only Monarch tools (GetAccounts, GetRecurring, GetCashFlow, GetBudget, GetTransactions). Do not call any create, update, or delete tool.

Build a Household Hub snapshot and reply with ONLY one JSON code block (no other text), in exactly the shape above.

How to fill it in:
- taken_at: today's date, YYYY-MM-DD.
- accounts: every liability account (credit cards, student/auto/other loans, mortgage). id = Monarch's account id as a string; name, type and institution as Monarch reports them; balance EXACTLY as reported (debts are negative); apr for credit cards, interest_rate for loans; minimum_payment. Use null for anything Monarch doesn't have -- never guess.
- income.recurring: GetRecurring with include_liabilities=false; every recurring INCOME stream: name, frequency (as Monarch reports it), amount (positive), last_paid_date, next_date.
- income.paycheck_avg_monthly: GetCashFlow over the last 6 complete months, grouped by month, income category "Paychecks" only; the average per month (null if unavailable).
- income.budgeted_paychecks: GetBudget for the current month; the budgeted amount for "Paychecks" (null if none).
- recurring_expenses: from the same GetRecurring call, every recurring EXPENSE stream (not credit-card payment streams, not transfers): id = the stream_id; name, merchant, frequency, amount (as reported), category, last_paid_date, next_date.
- transactions: GetTransactions for the last 45 days, Debit only, newest first. Include only transactions that look like bill payments: merchants matching a recurring expense stream above, payments to credit cards or loans, and categories such as utilities, phone, internet, insurance, rent/mortgage, subscriptions, loan repayment. At most 150. For each: id, date, amount (as reported), merchant, category, and account = the account NAME only.
Do not include account numbers, descriptions, notes, or anything not listed above.
```

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| "No JSON object found" | The paste didn't include Claude's JSON block; copy the whole reply |
| "taken_at must be a date" / "Unsupported snapshot version" | Claude changed the shape; re-send the prompt |
| Every balance looks wrong / "Every balance is positive" | Balances must be negative for debts; ask Claude to keep them exactly as Monarch reports |
| "No APR/minimum payment" warnings | Monarch doesn't have them. Fill them in Monarch (a Claude `UpdateAccountDebtDetails` call with your confirmation) or enter the APR on the bill in Household Hub |
| A card is missing | It may be a hidden/Finicity-excluded account in Monarch; reconnect it there |
| Same card appears twice | Duplicate accounts in Monarch; hide one there, then Skip it here |
| Wrong bill proposed | Change the dropdown before Apply; relinking an account moves it (one account links to one bill) |

## Privacy and safety

- Never commit a snapshot (`*.snapshot.json` is git-ignored). The repository is public.
- Treat what you paste like any financial data: it is stored only in the add-on database on your Home Assistant.
- To use a different source later (an HA sensor, a script), produce the same version-1 JSON; the importer doesn't care where it came from.
