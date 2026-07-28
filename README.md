# Household Hub

A Home Assistant add-on for tracking household bills (with due-date reminders
and a bill calendar) and project/task lists assigned to family members.

## Architecture

- **Runs as a Home Assistant Add-on** (Docker container managed by HA
  Supervisor on your HA Yellow), reachable through HA's **Ingress** — there
  is no separate login page and no port exposed on your LAN. If you're
  already logged into Home Assistant, you're in.
- **Backend**: Node.js + Express + SQLite (`better-sqlite3`), all data stored
  locally in `/data/household.db` inside the add-on's persistent storage.
  Nothing leaves your network.
- **Frontend**: React + Vite + Tailwind, built into static files the backend
  serves directly (single container, no separate web server).
- **Notifications**: sent through Home Assistant's own `notify.*` services
  via the Supervisor-proxied Core API (uses the auto-injected
  `SUPERVISOR_TOKEN` — no credentials to manage). A daily scheduler (08:00)
  checks bills and tasks; each household member can have their own notify
  target (e.g. `notify.mobile_app_ty_phone`) or fall back to a shared one.
- **People**: "Household members" are lightweight profiles inside the app
  (name + color + optional notify target) used only for assigning bills and
  tasks — they are *not* login accounts, since kids/family members may not
  all have their own HA user. Access control is entirely handled by HA
  Ingress.

## Repo layout

```
config.yaml        # HA add-on manifest (ingress, permissions, options)
Dockerfile          # multi-stage build: frontend -> static files, backend -> Node server
run.sh              # add-on entrypoint, reads options.json
backend/            # Express API + SQLite schema
  src/db/           # schema.sql, sqlite connection
  src/routes/        # bills, tasks, projects, members, notify
  src/services/      # Home Assistant API client, reminder scheduler, recurrence math
frontend/           # React + Vite + Tailwind UI
  src/pages/         # Dashboard, Bills, Bill Calendar, Projects, Project detail, Settings
  src/components/    # shared UI (cards, modals, badges)
```

## Data model (SQLite)

- `bills` — name, amount, payee, category, recurrence (once/weekly/monthly/yearly),
  due_date, autopay, assigned_to, reminder_days_before, status, notes
- `bill_payments` — payment history per bill
- `projects` — name, description, color
- `tasks` — title, description, project_id, assigned_to, due_date, priority, status
- `members` — household member profiles (name, color, optional HA notify target / person entity link)
- `notification_log` — dedupes reminders so you don't get spammed daily

## Local development (on your desktop, outside the add-on)

```bash
cd backend && npm install && npm run dev     # API on :8099
cd frontend && npm install && npm run dev    # UI on :5173, proxies /api to :8099
```

Note: this sandbox's own network policy blocked `npm install` (registry and
GitHub are both allow-listed off), so dependencies haven't been installed or
build-tested here — only syntax/structure verified. Run `npm install` on your
own machine or let the HA Supervisor build the add-on image, where normal
network access applies.

## Building/installing as a HA add-on

1. Push this repo to GitHub (already set up).
2. In Home Assistant: **Settings → Add-ons → Add-on Store → ⋮ → Repositories**,
   add this repo's URL.
3. Install "Household Hub" from the store, start it, and open it from the
   sidebar (Ingress panel).

## Still need from you

1. **Notify targets** — what are the exact HA `notify.*` service names for
   each family member's phone (Settings → People → mobile app), so reminders
   go to the right person? You can also just use one shared `notify.notify`
   target to start.
2. **Bill categories** you want pre-defined (utilities, rent/mortgage,
   subscriptions, insurance, etc.) — currently free-text.
3. **Household members** to seed (names + colors).
4. **Reminder timing** — currently a single daily check at 8am with a
   per-bill "days before due" setting; let me know if you want multiple
   times per day or a different default hour.
5. Confirm whether your **HA Yellow** should be the only place this runs, or
   whether you also want it buildable/testable on the always-on desktop
   outside of HA (the Docker image works standalone too, just without
   Ingress auth — would need a different auth story if run that way).
