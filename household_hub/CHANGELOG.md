# Changelog

## 0.2.1

- Fixed `POST /bills/:id/pay` (marking any bill paid) throwing
  `RangeError: Too few parameter values were provided` on every call --
  the payment-log INSERT was missing the bill's own id from its
  parameter list. This is why "Mark paid" appeared broken everywhere.
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
