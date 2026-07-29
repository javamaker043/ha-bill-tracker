# Changelog

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
