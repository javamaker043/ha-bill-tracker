# Changelog

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
