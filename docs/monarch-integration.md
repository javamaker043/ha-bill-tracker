# Monarch Money integration: review and recommendations

Status: proposal. Nothing in Household Hub or Monarch was changed as part of this review.

**How this was reviewed.** The Monarch MCP connection was exercised with *read-only* calls only (recurring
streams, accounts, cash flow, budget, debt payoff plan). This document records what the data looks like
and what it means for the app. It deliberately contains no balances, account names, or merchants:
this repository is public.

---

## 1. What the connection gives us

| Area | Monarch tools | Useful to Household Hub for |
|---|---|---|
| Recurring activity | `GetRecurring` (income, expenses, card payments, transfers; frequency, last paid, next forecast) | Income suggestion, bill discovery/reconciliation |
| Accounts | `GetAccounts` (balance, type, institution; APR/rate/min payment when set) | Live debt balances, Debt Management inputs |
| Debt plan | `GetDebtPaydownPlan`, `GetDebtPaydownBudget` | Cross-check the in-app avalanche/snowball numbers |
| Cash flow | `GetCashFlow` (group by month/category/merchant, avg/sum) | Real average income, spending trends |
| Budget | `GetBudget` (planned vs actual, fixed/flex) | Plan-vs-actual overlay on Monthly Budget |
| Transactions | `GetTransactions` (merchant, amount, date, category, recurring flag) | Detect payments so they don't have to be logged by hand |

The same server also exposes **write** tools (create/update/delete transactions, categories, rules, goals,
budgets, account debt details). Nothing in the app should use them without an explicit per-action
confirmation (see section 6).

## 2. The key constraint: who can talk to Monarch

The MCP connection lives in a Claude session. The Household Hub add-on is a separate process inside Home
Assistant (ingress-only, no inbound access), so **it cannot call the MCP**. Options, from least to most
invasive:

| Option | How | Pros | Cons |
|---|---|---|---|
| **A. Snapshot import (recommended first)** | In a Claude session, pull a read-only snapshot from Monarch and paste/upload it into a "Monarch import" screen in Household Hub (same pattern as Bulk import). The app previews, matches, and applies on confirm. | No credentials stored in the add-on; works today; user reviews every change; nothing can be written back by accident | Manual: refresh when you want it |
| **B. Home Assistant entities** | If the Monarch integration in HA exposes sensors (balances, maybe recurring), read them via the Supervisor API the add-on already uses for `person.*` | Automatic, no new secrets | **Unverified**: depends entirely on what that integration exposes; typically balances only, not recurring/transactions/APR |
| **C. Direct API from the add-on** | Add a Monarch client to the backend with a token in the add-on options | Fully automatic, scheduled | Unofficial API surface, credential/token storage and refresh, bigger blast radius, ToS risk; build last, if ever |
| **D. Scheduled Claude task** | A scheduled Claude task pulls from Monarch and posts a snapshot to the add-on | Automatic | Add-on has no externally reachable endpoint today; would need one (auth!) |

**Recommendation:** build **A** (a versioned snapshot format + importer), then add **B** only for whatever
entities HA turns out to expose. Treat C/D as optional later steps. Because A defines a snapshot schema,
B/C/D can all feed the same importer.

**To verify before choosing B:** in Home Assistant, Developer Tools -> States, filter on the Monarch
integration's name and list the entities and attributes it creates.

## 3. Recommended integrations, in priority order

### P1: Income suggestion for Monthly Budget (small)
The new Monthly Budget page takes a manual monthly income. Monarch can propose one, but the three
available numbers **disagree materially** in the reviewed data (roughly a third apart):

1. Sum of *active* recurring income streams, normalized to monthly (biweekly x 26/12, semimonthly x 2)
2. Trailing 6-month average of the `Paychecks` category (includes irregular pay, advances, bonuses)
3. The budgeted `Paychecks` amount in Monarch's own budget

Recommendation: show all three as labelled one-click suggestions with their source, default to (1) when
streams are current, and let the user pick. Always plan against the lower of "typical" and "average"
when pay varies. Exclude `Other Income`, interest, and transfers from the paycheck figure.

### P1: Debt balances and rates -> Debt Management (medium, biggest manual-entry saver)
Today every payment on a debt bill asks for the current statement balance, and APR/limit are typed by hand.
Monarch already holds balances for every connected card and loan.
- Link a debt bill to a Monarch account (`bills.monarch_account_id`).
- On import, update `current_balance` (and record the as-of date) so "Mark paid" no longer needs the
  balance typed in for linked bills.
- Pull APR / interest rate / minimum payment where present; use them to fill the bill's APR and
  default payment.
- **Data gap (see cleanup):** in the reviewed data nearly every card and loan had no APR and/or
  payment saved in Monarch, so avalanche/snowball can't run for most debts until that is filled in
  (in Monarch via `UpdateAccountDebtDetails`, or in the app). Credit limits are not exposed, so
  utilization stays manual.

### P2: Detect payments instead of logging them (medium)
Match Monarch transactions to bills (merchant + amount within a tolerance + date window around the
due date) and present a **"Suggested payments" inbox**: one-click confirm logs the payment with the
real date and amount via the existing `/pay` endpoint. This removes the forgotten-payment problem
at the source. Never auto-log: always confirm. De-duplicate by storing the matched Monarch
transaction id on the payment.

### P2: Reconcile recurring streams with scheduled bills (medium)
Compare Monarch's recurring expense streams with Household Hub bills:
- **Unmatched in Monarch** -> "Add as bill?" (prefill name, amount, frequency, next date, category)
- **Unmatched in the app** -> "Not seen in Monarch recently" (possible cancelled/forgotten bill: feeds the
  Monthly Budget "reduce" inventory)
- **Amount drift** (stream amount vs bill amount) -> "Update bill amount?"
Filter out unreliable streams (section 5.1): require a recent last-paid date and a forecast date that
isn't in the past.
**Do not import credit-card payment streams as bills.** In the reviewed data their amounts equal
the full current balance, not a payment you actually owe each month, and their last-paid dates were
more than a year old. Use each card's own minimum payment instead.

### P3: Plan vs actual overlay on Monthly Budget (medium)
Show Monarch's budget and actuals next to the scheduled-bills view: per category group, planned vs
actual this month, plus a 6-month income/expense trend. Surface Monarch's "unallocated" figure:
in the reviewed data the budgeted expenses exceeded budgeted income, which is exactly the
shortfall the new page is meant to make visible and act on.

### P3: Debt plan cross-check (small)
Compare the in-app payoff simulation to `GetDebtPaydownPlan` (same avalanche/snowball definitions).
Large differences usually mean missing APR/payment data on one side.

## 4. Proposed data model changes (Household Hub)

Additive only, via `ensureColumn` / `CREATE TABLE IF NOT EXISTS` (remember: no DML in `schema.sql`
may reference a migrated column, and indexes on migrated columns belong in `db/index.js`).

- `bills.source` TEXT (`manual` | `monarch`), `bills.monarch_stream_id` TEXT, `bills.monarch_account_id` TEXT
- `bills.balance_as_of` TEXT (when `current_balance` was last refreshed; the balance is stale-able data)
- `bill_payments.monarch_transaction_id` TEXT, unique where not null (idempotent matching)
- `monarch_snapshots` (id, taken_at, schema_version, payload JSON): the last applied snapshot, for
  diffing and for a visible "last synced" timestamp
- `app_settings` keys: `income_source` (`manual` | `monarch_streams` | `monarch_avg`), `monarch_last_sync`
- Category mapping table (Monarch category/group -> Hub category), user-editable

Snapshot schema (versioned, source-agnostic so paste/HA/API can all produce it):
`{ version, taken_at, accounts[], recurring{income[],expenses[],card_payments[]}, cashflow{income_by_month[]}, budget{month,totals} }`.

## 5. Cleanup efforts

### 5.1 In Monarch (found during the review)
1. **Debt details missing:** 17 liabilities have no APR/rate and/or minimum payment; only the mortgage is
   complete. Fill them in (Monarch account settings, or `UpdateAccountDebtDetails` with confirmation). Until
   then, debt payoff plans in both Monarch and Household Hub are incomplete.
2. **Stale recurring streams:** most streams have last-paid dates a year or more old, or forecast dates in the
   past (both income streams, all credit-card payment streams, several expense streams). Review and
   delete/refresh them; an income stream that stopped months ago inflates the income suggestion.
3. **Credit-card payment streams** carry full-balance amounts; either ignore them or recreate as the real
   payment. Don't feed them into budgets.
4. **Possible duplicate accounts:** two store cards each appear under two account names (same last digits).
   If they are the same card, hide one: liabilities and utilization are currently double counted.
5. **Hidden accounts:** two institutions are excluded because they connect through a provider whose data
   can't be shared. Reconnect through a supported provider so debts from those institutions appear.
6. **Budget hygiene:** budgeted expenses exceed budgeted income (negative unallocated); a category name
   has a trailing space; some categories have real spend but a $0 budget; one stream is attached to the
   wrong account type.
7. **Income categorization:** keep paychecks, one-off income, interest, and transfers in separate
   categories. The paycheck average is only meaningful if non-pay deposits stay out of it.

### 5.2 In Household Hub
1. Decide ownership (section 7) and **de-duplicate bills on first import**; provide a match/merge screen
   rather than creating second copies of every bill.
2. Align category names with Monarch groups; mark Mortgage / Auto / Student / Credit Card categories
   `is_debt` so Debt Management picks them up.
3. Make "current statement balance" **optional for bills linked to a Monarch account** (it is currently
   required when marking a debt bill paid).
4. Add provenance (`source`) and "as of" dates so a stale balance is visibly stale.
5. Remove or hide manually duplicated debt entries once linked.
6. Add automated tests. There are none in the repo today; the throwaway harness used for validation
   (real routes + real SQLite via WASM + real UI) should be promoted to repo dev tooling or replaced with
   `node:test` + `better-sqlite3` in CI.
7. Keep the Dockerfile unchanged: the importer is pure JSON, no new native dependencies.

### 5.3 In Home Assistant
1. Confirm what the Monarch integration actually exposes (section 2) before designing around it.
2. Remove unused/duplicate entities it created; give kept ones stable names.
3. If a token is ever needed by the add-on, store it as an add-on option or secret, never in the database
   and never in git.

### 5.4 Repository and security
1. This repo is public: **never commit snapshots, exports, or screenshots with real data**. Add
   `*.snapshot.json` and `/data` to `.gitignore`, and use synthetic fixtures for tests.
2. The Monarch MCP includes destructive write tools. For any automated/scheduled use, restrict to the
   read-only tool set; require a visible confirmation for every write (e.g. filling debt details).
3. Log sync results (counts, errors), never payloads.

## 6. Guardrails for any write-back
Only three write-backs are worth considering: filling missing debt details, correcting a stale recurring
stream, and tagging matched transactions. Each must be a single explicit user action showing exactly
what will change in Monarch, never a bulk or background operation.

## 7. Who owns what

| Concern | Source of truth | Why |
|---|---|---|
| What actually happened (transactions, balances) | **Monarch** | Bank-connected |
| Obligations and due dates, reminders, who pays, paycheck allocation | **Household Hub** | Planning and household workflow |
| Income average, debt rates, budgets | Monarch, **suggested** into the Hub, user confirms | Avoids silent overwrites |
| Reduction targets (Monthly Budget inventory) | **Household Hub** | Decisions live where the plan lives |

## 8. Phased plan

| Phase | Scope | Size |
|---|---|---|
| 0 | Clean up Monarch data (5.1) and verify HA entities | S, mostly manual |
| 1 | Snapshot schema + importer screen; income suggestions (3 sources) | M |
| 2 | Debt account linking + balance/APR/payment sync; optional balance on pay | M |
| 3 | Payment-matching inbox; recurring reconciliation | M-L |
| 4 | Plan-vs-actual overlay, cash-flow trend, debt-plan cross-check | M |
| 5 | Optional automation (HA entities, scheduled snapshots) | M, only if wanted |

## 9. Open questions
- What does the Monarch integration in Home Assistant expose? (Gates option B.)
- Which income number should be the default for planning: current recurring streams, or the trailing average?
- Should accounts held by only one household member be filterable per member in the Hub?
- Are the two hidden institutions needed in the debt view?
