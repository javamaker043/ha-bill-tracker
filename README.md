# Household Hub

A Home Assistant add-on for tracking household bills (with due-date reminders
and a bill calendar) and project/task lists assigned to family members.

## Features

- **Bills** — track recurring or one-off bills (amount, payee, category,
  autopay, who's responsible), log payment history, and see everything's
  status at a glance.
- **Bill categories** — pre-loaded with Utilities, Housing, Subscriptions,
  Auto, Credit Cards, Short-Term Loans, and Food; add your own from Settings
  or straight out of the bill form.
- **Bill calendar** — month view of upcoming and past due dates.
- **Projects & tasks** — group tasks into projects, assign them to household
  members, set priority/due dates, and track status.
- **Dashboard** — at-a-glance summary of what's due soon and what's
  outstanding.
- **Reminders** — a scheduler checks bills and tasks twice a day (8am and
  6pm) and pushes due notifications through Home Assistant, by default to one
  shared `notify.*` target (each member can still be given their own instead).
- **Household members** — profiles imported automatically from HA's
  `person.*` entities on first boot (no manual data entry); the first
  imported member becomes admin and can promote other admins or revoke a
  specific person's access to the app from Settings.

## Architecture

- **Runs entirely on your HA Yellow — no separate server needed.** The whole
  app (frontend + backend + database) is one Docker image that Home
  Assistant Supervisor builds and runs locally from this repo. There's
  nothing to host, deploy, or keep online elsewhere; install it like any
  other add-on and it lives on the Yellow alongside HA Core.
- **Runs as a Home Assistant Add-on**, reachable through HA's **Ingress** —
  there is no separate login page and no port exposed on your LAN. If you're
  already logged into Home Assistant, you're in.
- **Backend**: Node.js + Express + SQLite (`better-sqlite3`), all data stored
  locally in `/data/household.db` inside the add-on's persistent storage.
  Nothing leaves your network.
- **Frontend**: React + Vite + Tailwind, built into static files the backend
  serves directly (single container, no separate web server).
- **Notifications**: sent through Home Assistant's own `notify.*` services
  via the Supervisor-proxied Core API (uses the auto-injected
  `SUPERVISOR_TOKEN` — no credentials to manage). A scheduler runs at 08:00
  and 18:00 daily; every member falls back to one shared notify target
  (`notify_service` in Configuration) unless they're given their own
  (e.g. `notify.mobile_app_ty_phone`).
- **People**: "Household members" are lightweight profiles inside the app
  (name + color + optional notify target) used for assigning bills and
  tasks — they are *not* login accounts, since kids/family members may not
  all have their own HA user. On first boot, with no members yet in the
  database, the app imports one profile per HA `person.*` entity so you don't
  have to type your household in by hand; the first person imported is made
  admin.
- **Access control**: real authentication is still entirely HA Ingress — you
  need a valid HA login to reach the app at all. On top of that, an admin
  member can revoke a specific person's access to Household Hub (or promote
  another admin) from Settings. The backend recognizes *who* is asking by
  matching the HA user identity Ingress forwards on each request to a member
  by name, then blocks API calls from anyone whose access has been revoked.
  If your Supervisor version doesn't forward that identity, this layer is
  simply inert (HA's own login is still the gate).

## Repo layout

This repo is a Home Assistant **add-on repository**: `repository.json` at
the root describes the repository itself, and the add-on lives in its own
`household_hub/` subfolder (HA requires this even for a repository with
only one add-on in it — see [Installing](#installing-as-a-ha-add-on-web-ui)).

```
repository.json          # HA add-on repository manifest (name/url/maintainer)
household_hub/           # the add-on itself
  config.yaml             # HA add-on manifest (ingress, permissions, options)
  build.yaml               # maps each supported arch to its HA base image, so
                            # Supervisor builds with the right platform (aarch64
                            # on a Yellow, not the Dockerfile's amd64 fallback)
  Dockerfile               # multi-stage build: frontend -> static files, backend -> Node server
  run.sh                   # add-on entrypoint, reads options.json
  backend/                 # Express API + SQLite schema
    src/db/                # schema.sql, sqlite connection
    src/routes/             # bills, tasks, projects, members, categories, notify
    src/services/           # Home Assistant API client, reminder scheduler, recurrence math, first-boot import
    src/middleware/         # ingress identity, per-member access control
  frontend/                # React + Vite + Tailwind UI
    src/pages/              # Dashboard, Bills, Bill Calendar, Projects, Project detail, Settings
    src/components/         # shared UI (cards, modals, badges)
```

## Configuration

Set from the add-on's **Configuration** tab in Home Assistant (backed by
`config.yaml`'s `options`/`schema`):

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `reminder_lookahead_days` | int (1-14) | `3` | How many days before a bill/task is due to start reminding. |
| `notify_service` | string | `notify.notify` | Default HA `notify.*` service used when a household member has no notify target of their own. |

## Data model (SQLite)

- `bills` — name, amount, payee, category, recurrence (once/weekly/monthly/yearly),
  due_date, autopay, assigned_to, reminder_days_before, status, notes
- `bill_payments` — payment history per bill
- `categories` — bill category names; seeded with Utilities, Housing,
  Subscriptions, Auto, Credit Cards, Short-Term Loans, Food, Other
- `projects` — name, description, color
- `tasks` — title, description, project_id, assigned_to, due_date, priority, status
- `members` — household member profiles (name, color, optional HA notify
  target / person entity link, `is_admin`, `access_revoked`, `ha_user_id`
  used to recognize returning HA users)
- `notification_log` — dedupes reminders so you don't get spammed daily

## Installing as a HA add-on (web UI)

Everything below is done from the Home Assistant web interface — no
command line, no SSH, nothing installed outside HA itself.

1. **Add this repo as an add-on source.**
   - In the HA sidebar, go to **Settings → Add-ons**.
   - Click **Add-on Store** (bottom right).
   - Click the **⋮** (three-dot) menu in the top right corner and choose
     **Repositories**.
   - Paste this repo's URL: `https://github.com/javamaker043/ha-bill-tracker`
   - Click **Add**, then **Close**. (If HA says the URL "is not a valid
     add-on repository," it's looking for a `repository.json` at the repo
     root, which this repo has — make sure you're pointed at the repo URL
     itself, not a branch/subfolder URL, and that your fork/clone is on the
     latest commit that includes `repository.json`.)
2. **Find and install Household Hub.**
   - Still on the Add-on Store page, refresh/reload if it doesn't appear
     right away (pull down or reload the browser tab).
   - Scroll down (new repositories show up as their own section) and click
     the **Household Hub** card.
   - Click **Install**. HA Supervisor will build the Docker image on your
     HA Yellow itself — this can take several minutes the first time
     (compiling `better-sqlite3` and building the frontend). You can watch
     progress in the build log at the bottom of the page.
3. **Configure it (optional).**
   - Once installed, go to the **Configuration** tab for the add-on if you
     want to change `reminder_lookahead_days` or `notify_service` from
     their defaults (see [Configuration](#configuration) below). You can
     also change these later.
4. **Start it.**
   - Go to the **Info** tab and turn on **Start on boot** and **Watchdog**
     if you want it to come back up automatically after HA restarts.
   - Click **Start**.
   - Turn on **Show in sidebar** so "Household Hub" appears as a panel in
     the main HA sidebar.
5. **Open it.**
   - Click **Household Hub** in the sidebar (or the **Open Web UI** button
     on the add-on's Info tab). It opens inside Home Assistant's own
     authenticated session via Ingress — no separate login.
   - On first launch, the app auto-imports your HA `person.*` entities as
     household members (see [Features](#features)); if you have none set
     up, add **Settings → People** entries first, or just add members by
     hand from the app's own Settings page.

To get add-on updates after pushing changes to this repo, go back to
**Settings → Add-ons → Household Hub**, and click **Update** when a new
version is available (or **Rebuild** to force a fresh build from the
latest commit on the default branch).

## Local development (optional, desktop-only — not needed to run the add-on)

Everything below is purely for developing/testing on a desktop before
pushing changes; the HA Yellow install itself needs none of this — Supervisor
builds and runs the container on its own.

```bash
cd household_hub/backend && npm install && npm run dev     # API on :8099
cd household_hub/frontend && npm install && npm run dev    # UI on :5173, proxies /api to :8099
```

Note: this sandbox's own network policy blocked `npm install` (registry and
GitHub are both allow-listed off), so dependencies haven't been installed or
build-tested here — only syntax/structure verified. Run `npm install` on your
own machine or let the HA Supervisor build the add-on image, where normal
network access applies.
