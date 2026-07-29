# Changelog

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
