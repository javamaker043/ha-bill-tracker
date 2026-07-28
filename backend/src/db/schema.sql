-- Household members are simple profiles used for "assigned to" on bills and
-- tasks. They are NOT login accounts -- access to the whole app is already
-- gated by Home Assistant's own authentication via Ingress, so there is no
-- separate password to manage here. This also lets you assign things to
-- people (e.g. kids) who don't have their own HA login.
CREATE TABLE IF NOT EXISTS members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6366f1',
  ha_person_entity_id TEXT,          -- optional link to a HA person.* entity for notify targeting
  notify_target TEXT,                -- optional HA notify service, e.g. notify.mobile_app_ty_phone
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  amount REAL NOT NULL DEFAULT 0,
  payee TEXT,
  category TEXT NOT NULL DEFAULT 'other',
  recurrence TEXT NOT NULL DEFAULT 'monthly',   -- once | weekly | monthly | yearly
  due_date TEXT NOT NULL,                        -- ISO date of the next/only due date
  autopay INTEGER NOT NULL DEFAULT 0,
  assigned_to INTEGER REFERENCES members(id) ON DELETE SET NULL,
  reminder_days_before INTEGER NOT NULL DEFAULT 3,
  status TEXT NOT NULL DEFAULT 'unpaid',          -- unpaid | paid | overdue
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bill_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bill_id INTEGER NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  amount_paid REAL NOT NULL,
  paid_date TEXT NOT NULL DEFAULT (datetime('now')),
  paid_by INTEGER REFERENCES members(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT NOT NULL DEFAULT '#0ea5e9',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  assigned_to INTEGER REFERENCES members(id) ON DELETE SET NULL,
  due_date TEXT,
  priority TEXT NOT NULL DEFAULT 'normal',  -- low | normal | high
  status TEXT NOT NULL DEFAULT 'todo',       -- todo | in_progress | done
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notification_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,          -- bill_reminder | bill_overdue | task_due
  ref_table TEXT NOT NULL,
  ref_id INTEGER NOT NULL,
  sent_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_bills_due_date ON bills(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
