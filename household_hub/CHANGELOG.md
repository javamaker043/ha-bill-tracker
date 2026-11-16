# Changelog

## 0.7.0

- **Monarch Review** page (P2 of the Monarch integration plan), fed by the
  same pasted snapshot (the prompt now also asks for recurring expenses and
  ~45 days of bill-like transactions; older snapshots still import).
  - **Suggested payments:** Monarch transactions that look like payments of
    your unpaid bills (merchant/payee overlap + amount; credit cards and loans
    accept larger-than-minimum payments). Strong matches start ticked; change
    the target bill if a guess is wrong; Dismiss hides one for good. Accepting
    logs the payment exactly like Mark paid, with Monarch's date and amount.
    Each payment settles one cycle, oldest first. Transactions you already
    logged by hand are skipped, a Monarch transaction can never be logged
    twice, and undoing a payment makes it reappear as a suggestion. The
    Dashboard shows a banner when payments are waiting.
  - **Recurring bills:** price changes (Monarch's amount differs from yours by
    more than ~2%), recurring expenses in Monarch with no bill here (add them
    with name/amount/due date/category confirmed; biweekly and twice-monthly
    streams become a monthly amount), bills here that Monarch doesn't see
    (possibly cancelled), and stale streams kept out of the way. Matches are
    remembered by stream id so renames don't break them.
- Backend: `/api/monarch/suggestions[/apply|/dismiss]` and
  `/api/monarch/reconcile[/apply]`; new `bill_payments.monarch_transaction_id`
  (unique), `bills.monarch_stream_id`, `monarch_dismissed` table (additive
  migrations, verified against an old-schema database).
- Refactor: "mark paid" now lives in one shared payment service used by both
  the Mark paid route and accepted Monarch payments, so they can't drift.
- Docs: how-to, format, and prompt updated; integration plan marks P2 done and
  records that Home Assistant's Monarch integration only exposes budget sensors.

## 0.6.0

- **Monarch Import** page (P1 of the Monarch integration plan). Paste a
  snapshot that Claude builds from Monarch's read-only data (the page has a
  copy-ready prompt and step-by-step instructions), preview exactly what
  would change, then apply. Nothing is written to Monarch, and nothing
  changes here until you click Apply.
  - **Debts:** each Monarch liability can be linked to an existing bill
    (matched by name and last four digits; links are remembered), created as
    a new debt bill (you supply the due date), or skipped. Choose per
    account whether to update the balance, the APR, and the payment amount.
    Debt Management's payoff scenarios and avalanche/snowball use the
    imported balances and rates directly.
  - **Income:** three Monarch figures (active recurring pay streams, 6-month
    paycheck average, budgeted paychecks) offered side by side; stale streams
    are flagged and excluded unless you tick them back in. The Monthly
    Budget page offers the same figures as one-click suggestions and shows
    where the current income came from.
  - Linked debt bills show "as of <date>" for their balance, and marking a
    payment no longer requires typing a statement balance (it's optional).
    A hand-edited balance clears the "as of" date.
- Backend: `/api/monarch/status|preview|apply`, `monarch_snapshots` table,
  `bills.monarch_account_id` / `balance_as_of`, versioned snapshot format
  (documented in `docs/monarch-snapshot-import.md`), request body limit
  raised to 1 MB.
- Re-importing is idempotent (linked accounts are recognized; no duplicate
  bills), and only the latest 5 snapshots are kept.

## 0.5.0

- **Monthly Budget** page. Enter your average monthly income and see your
  scheduled bills as a typical month against it:
  - Bills per month (weekly bills x 52/12, yearly /12; one-time bills are
    listed separately, not averaged in), what's left over or the shortfall,
    and what share of income the bills use.
  - A "Where the money goes" breakdown by category, and a per-bill table
    (cards on phones) showing schedule, per-payment and per-month cost, % of
    income, and a Type (Essential / Debt / Flexible, classified from the
    category name).
  - **Reduction inventory:** flag any bill with the amount it could drop to
    (0 cancels it, with quick -10/-25/-50% buttons). A "Closing the gap"
    card shows how much the flagged items free up each month, how much is
    still to find, and what bills would total afterwards.
  - "Where to look first" suggests flexible spending, then the highest-APR
    debts when bills exceed income (essentials are never suggested).
  - One-click income suggestion from paychecks planned in the next 30 days.
- New `/api/settings` (monthly income) and `/api/bills/:id/reduce`; new
  `app_settings` table and `bills.reduce_target` column (additive migration,
  verified against an old-schema database).
- Dashboard's monthly-equivalent math moved to a shared helper.
- Docs: [Monarch integration review and recommendations](../docs/monarch-integration.md).

## 0.4.0

Finishes the remaining items from the mobile + financial-management
review, and fixes the workflow bugs a full end-to-end pass turned up.

**New**
- **Undo a payment.** Payment history now has an Undo on the most recent
  payment (two-tap confirm): it deletes the payment and moves the bill
  back to the due date it was covering. Only the latest payment can be
  undone, since payments apply in order.
- **Paycheck actuals vs. expected.** Edit a paycheck (pencil on its
  Payment Plans column) to record what it actually paid. Once set, the
  actual amount replaces the expected one for Available/Remaining, and
  the column shows how far over/short it came in versus plan.
- **Avalanche vs. snowball** comparison on Debt Management (when there
  are 2+ debts): set a total monthly debt budget and see debt-free
  date, total interest, and payoff order for both strategies side by
  side.
- **CSV export** of bills and full payment history from Settings.
- **Delete a bill** from its edit form (two-tap confirm) -- there was
  previously no way to remove one.
- Dashboard: **dollar amount past due** under the overdue count (counts
  every missed cycle, not just one per bill) and a **Next paycheck**
  card showing what's left after planned bills. "Open tasks" now
  includes in-progress tasks.
- **Mobile layouts**: Bills and Debt Management show a card per item
  below the desktop breakpoint instead of a sideways-scrolling table;
  Bill Calendar shows a dated list on phones; the catch-up form stacks
  amount/date per payment instead of squeezing them into one row.

**Fixed**
- **The calendar showed each recurring bill in only one month.** Future
  cycles are now projected, so next month's rent, cards, and
  subscriptions appear.
- **Month-end due dates drifted.** A bill due on the 31st rolled
  Jan 31 -> Mar 3 and then stayed on the 3rd forever. Monthly/yearly
  bills now keep their original day (Jan 31 -> Feb 28 -> Mar 31).
- **"Today" was UTC.** In the evening in US timezones, the payment-date
  default, "overdue", and "due this week" all flipped to tomorrow hours
  early, and a bill due today never counted as due this week. Everything
  now uses the local calendar day (server-side via the add-on's
  timezone). Payment dates are stored as plain days so a backdated
  payment can't display as the day before.
- Catch-up: if one payment in the batch failed part-way, retrying
  re-logged the ones that had already saved. Already-saved rows are now
  skipped, and every payment records the paycheck it came from (the
  server clears a bill's paycheck after the first one).
- Marking a bill paid is now atomic (payment + rollover commit
  together), rejects negative/invalid amounts and dates, an already-paid
  one-time bill, and a paycheck that no longer exists, instead of
  logging a duplicate or failing with a database error.
- Editing a bill no longer saves the transient "overdue" status.
- A stray "0" appeared next to non-autopay bills on Payment Plans.
- **Upgrading from a very old database could crash on boot** (`no such
  column: paycheck_id` / `ha_user_id`): two indexes on later-added
  columns ran before the migration that adds them. They're now created
  after it.
- A Home Assistant outage during the notification test/persons lookup
  could take the whole add-on down (unhandled rejection in an async
  route); one failing reminder no longer blocks the rest from sending.
- API errors now come back as JSON (and unknown `/api` paths as a JSON
  404) instead of an HTML page the UI couldn't read.
- Deleting a paycheck, member, or category now asks for a second tap,
  and uses an in-page confirm rather than `window.confirm`, which some
  mobile webviews don't show.

## 0.3.0

- **Catch-up / split payments for missed bills.** A recurring bill's
  due date only ever moves forward when it's marked paid, so a bill
  left unpaid for multiple cycles (e.g. rent unpaid since August, now
  October) used to show as a single "overdue" bill with no way to
  record more than one payment against it. Overdue bills with more
  than one cycle outstanding now show a "N due" button instead of
  "Mark paid" (on Dashboard, Bills, and Payment Plans) that opens a
  catch-up form listing every missed cycle separately, each with its
  own editable amount and payment date, logged in order.
- **Payment date entry.** Marking a bill paid now asks for a payment
  date (defaults to today, editable) instead of always stamping the
  payment with the current moment -- so a payment that was actually
  made earlier, but forgotten, can be logged with its real date.
- **Dashboard is now actionable.** Upcoming bills can be marked paid
  (or caught up, per above) directly from the Dashboard instead of
  requiring a trip to Bills or Payment Plans. Its monthly bills total
  also now normalizes weekly and yearly bills onto a monthly basis
  instead of only counting bills that recur monthly, so a weekly bill
  no longer disappears from the household's real monthly cash-flow
  picture.
- **Payment history on Debt Management.** Each debt account row now
  has the same payment-history icon already used on Bills and Payment
  Plans, instead of needing to look the bill up elsewhere to see what
  was actually paid on it.
- **Unified "due soon" highlighting** between Bills and Payment Plans
  (previously two separate, slightly different definitions) via a
  shared helper, and autopay bills are now badged consistently on
  Dashboard, Bills, and Payment Plans.
- Fixed modals (add/edit bill, mark paid, catch-up) being able to grow
  taller than the viewport with no way to reach their Save/Cancel
  buttons -- most noticeable on mobile with the keyboard open. Modals
  now cap their height and scroll their contents internally, with the
  header and close button always visible.

## 0.2.13

- **Fixed a crash-on-boot introduced in 0.2.12**: `schema.sql` set
  `is_debt` on the default categories with a plain `UPDATE`, but that
  file runs in full on every boot -- including against an *existing*
  database that doesn't have the `is_debt` column yet, before the
  migration that adds it. Every boot hit `SqliteError: no such column:
  is_debt` and crashed immediately, before the server ever started
  listening, so the add-on crash-looped indefinitely on any upgrade
  from before 0.2.12. Moved that logic into the backend startup code,
  after the column is guaranteed to exist -- also fixed the same seed
  step silently no-op'ing on brand-new installs (a separate bug: the
  "was this column just added" check doesn't fire when the column is
  part of the table's very first `CREATE TABLE`, only on an `ALTER`).
  No data was at risk -- the existing database and all its data were
  never touched by this, the server just never got far enough to serve
  requests.

## 0.2.12

- Added a **Debt Management** tab. Any bill in a Credit Cards or
  Short-Term Loans category (or any category with "credit" or "loan"
  in its name) with a balance shows up here automatically:
  - **Credit utilization** tracking, per account and overall, against
    each account's credit limit -- color-coded at the standard 30%/75%
    risk bands.
  - A **payoff scenario** calculator: pick an account and an extra
    monthly payment amount to see, side by side against paying only
    the minimum, how many months sooner it's paid off, how much
    interest that saves, and what your total tracked monthly debt
    payments drop to once that account is paid off.
  - New `interest_rate` (APR %) and `credit_limit` fields on bills,
    editable from the bill form for debt-category bills alongside the
    existing current-balance field, feeding both calculations above.
- Settings' Bill categories can now be explicitly marked as loan/credit
  with a checkbox, instead of only ever being guessed from the category
  name -- so a category like "Medical Debt" or "Personal Loan from Mom"
  works the same as "Credit Cards" for the current-balance requirement
  on Mark paid and for showing up on Debt Management. Existing installs
  keep working as before: any category that already matched the old
  name-based guess is marked automatically, once, on upgrade.

## 0.2.11

- Every dollar amount shown in the app (bills, balances, paycheck
  totals, payment history, the dashboard, the calendar) now displays
  with thousands separators -- "$9,329.00" instead of "9329.00" --
  through a shared `formatCurrency` helper instead of each page's own
  `toFixed(2)`. Editable amount fields are unchanged (still plain
  number inputs; browsers don't support comma-formatted `type="number"`
  inputs, and reformatting those live would need a bigger rework of
  the input itself).
- On Payment Plans, unassigned bills due within the next 25 days (or
  already overdue) now render with a slightly lighter card background,
  so what needs planning soonest stands out from the rest of the
  Unassigned bills column at a glance.

## 0.2.10

- Marking a bill paid that isn't currently assigned to a paycheck now
  requires saying where the money came from: pick an existing paycheck
  (retroactively, if you forgot to assign it beforehand) or note that
  it was paid from somewhere else entirely (cash, savings, etc.). Shown
  in that bill's payment history as a "Paid from" column either way.
- Fixed paycheck totals to stop giving budget back for money that's
  already been spent: **Remaining** now subtracts both what's still
  planned (unpaid bills still assigned) and what's already been paid
  from that paycheck, instead of only the former -- previously,
  marking a bill paid made Remaining go back *up*, as if the payment
  never happened. Each paycheck's column now shows Available, Planned,
  Spent, and Remaining.

## 0.2.9

- Added an **Add bill** button to Payment Plans, next to Add paycheck,
  so a new bill can be created without switching to the Bills page.
- Marking a bill paid no longer makes it disappear from its paycheck's
  board column. A one-time bill already stayed in place (now dimmed to
  show it's settled); a recurring bill rolls forward to its next due
  date and returns to Unassigned for planning as before, but the just-
  paid record now stays behind in that paycheck's column as a dimmed,
  read-only history entry instead of vanishing.

## 0.2.8

- Bulk import bills now tolerates the most common ways pasted JSON gets
  mangled: "smart quotes" substituted by whatever app it was copied
  through (Word, OneNote, Notes, etc.) and a trailing comma left over
  from hand-editing. Both used to fail with a confusing "Expected
  double-quoted property name" error; now the import auto-corrects them
  and says so, rather than requiring a byte-perfect paste.

## 0.2.7

- Added a **Bulk import bills** section to Settings: paste a JSON array
  of bills (or `{ "bills": [...] }`) to load a starting list, or build
  one from scratch with "Add row" -- handy for entering a backlog from a
  statement, spreadsheet, or notes app. Every field (name, amount, due
  date, recurrence, category, assigned member, notes) is directly
  editable in the table before anything is created, rows can be removed,
  and category names that don't exist yet are created automatically.
  Runs entirely client-side against your own instance's existing API --
  nothing is sent anywhere else.

## 0.2.6

- Added a payment history view: a clock icon next to every bill (on both
  the Bills table and each Payment Plans card) opens a list of every
  time that bill has been paid, with the date, amount, and who paid it.
  The backend has logged this to a `bill_payments` table since the
  first release, but there was previously no way to see it anywhere in
  the app.
- "Mark paid" now also asks who paid, recorded alongside the amount and
  date in that history (optional -- defaults to unspecified).
- For **Credit Cards** and **Short-Term Loans** bills (or any category
  with "credit" or "loan" in its name), "Mark paid" now *requires* the
  current statement balance, recorded alongside that payment and shown
  as its own column in payment history. The Bills table also shows each
  debt bill's latest known balance at a glance, and it's editable
  directly from the bill's edit form too, not just through Mark paid.

## 0.2.4

- **Found and fixed the cause of all data disappearing on every add-on
  update.** The HA base image's own `ENTRYPOINT` is s6-overlay's `/init`,
  which curates (resets) the environment it hands to whatever it runs
  unless told to keep it -- so our bare `CMD` was silently losing every
  `ENV` set in the Dockerfile (`DB_PATH`, `PORT`, `NODE_ENV`). `DB_PATH`
  fell back to the app's own in-container default path instead of
  `/data`, which lives in the container's writable layer and gets wiped
  on every update; `PORT`'s fallback happened to match the intended
  value, which is why this went unnoticed until the boot logging added
  in 0.2.3 caught it red-handed
  (`DB_PATH=/app/data/household.db existed=false`).
  Fixed by making the Dockerfile's own `ENTRYPOINT` bypass s6-overlay
  entirely instead of layering `CMD` under it.

  **Existing installs**: this fix only takes effect going forward. Any
  data from before this update was written to the non-persistent path
  and was already lost on each prior update -- there's nothing under
  `/data` to recover from. Once this version is running, new data will
  correctly persist across future updates.

## 0.2.3

- Investigating reports of add-on data disappearing after clicking
  **Update** in the Supervisor. Nothing in this app's code deletes or
  overwrites `/data` (schema setup is additive-only, and `/data` is
  Supervisor's documented persistent volume that's supposed to survive
  updates), so this adds two things to get real evidence next time it
  happens instead of guessing further:
  - Startup now logs whether `/data/household.db` already existed and
    its size *before* opening it, plus row counts for the core tables
    right after boot -- so the add-on log from the next update will show
    whether the volume itself was empty (a Supervisor/host issue) or the
    file was there but the app didn't see the data (a different bug).
  - The server now handles `SIGTERM`/`SIGINT` by checkpointing the
    WAL-mode database and closing it cleanly before exiting, instead of
    being killed mid-write with no shutdown handling at all, which is
    how Supervisor stops the old container during an update.

## 0.2.2

- Fixed `POST /bills/:id/pay` (marking any bill paid) throwing
  `RangeError: Too few parameter values were provided` on every call --
  the payment-log INSERT was missing the bill's own id from its
  parameter list. This is why "Mark paid" appeared broken everywhere,
  even after 0.2.1 added the amount-editing UI for it.

## 0.2.1

- Fixed "Mark paid" on both the Bills table and the Payment Plans board:
  it now opens a confirmation dialog with an editable amount instead of
  instantly marking the bill paid for the full listed amount with no way
  to say what was actually paid.
- Payment Plans bill cards can now be edited (amount, due date, etc.)
  directly from the board via a pencil icon, instead of only being
  editable from the Bills table.
- Projects and the project detail page now show a proper error message
  with a retry button when a request fails, instead of hanging on
  "Loading…" indefinitely or surfacing only as the generic top-level
  crash banner.
- Fixed a Tailwind class-ordering issue where `Card`'s own `p-5` padding
  silently overrode the `p-0`/`p-3` overrides passed in on the Bills
  table, the project task list, and the bill calendar, causing extra
  unwanted padding.

## 0.2.0

- Added a **Payment Plans** tab: add upcoming paychecks (date + expected
  amount), then assign bills to whichever check covers them from a
  kanban-style board (drag-and-drop on desktop, a dropdown on every bill
  card everywhere else, including mobile/touch). Unassigned bills are
  listed past-due first, and each paycheck shows a live running total of
  what's left after its assigned bills.
- Mobile layout: the sidebar now collapses behind a hamburger menu on
  small screens and slides in as a dismissible overlay instead of
  cramming a full desktop sidebar onto a phone; wide content like the
  bills table and the new payment-plans board scrolls horizontally in
  its own container instead of breaking the page. Aimed at using the app
  through the Home Assistant iOS/Android app, not just desktop browsers.
- Added a global crash banner for errors that happen outside of
  rendering (in effects, event handlers, or rejected promises), which
  the existing error boundary can't catch -- these now show a visible,
  dismissible message instead of failing silently.
- Existing databases (installed before this update) now get their
  schema migrated automatically on next startup instead of silently
  missing columns added in earlier releases.

## 0.1.2

- Version bump only, so Home Assistant's Add-on Store offers this update
  (which also carries the fixes below to anyone who never got them).

## 0.1.1

- Added `build.yaml` so Supervisor builds against the correct base image
  per architecture. Without it, installs on aarch64 hardware (e.g. Home
  Assistant Yellow) failed with "no match for platform in manifest."
- Added an error boundary and a catch-all route on the frontend so a
  single broken page can no longer blank out the entire app; navigating
  to any other page now recovers instead of requiring the browser's Back
  button.
- Fixed a dead end where an already-deleted project's detail page showed
  "Loading…" forever instead of saying the project no longer exists.
- Restructured the repo into a proper Home Assistant add-on repository
  (`repository.json` at the root, the add-on itself under
  `household_hub/`) so it can be added as an Add-on Store source at all.

## 0.1.0

- Initial release: bills with due-date reminders and a bill calendar,
  projects and tasks, bill categories, household member profiles
  imported automatically from Home Assistant, and admin-managed access
  control.
