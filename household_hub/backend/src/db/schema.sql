-- Household members are simple profiles used for "assigned to" on bills and
-- tasks. They are NOT login accounts -- access to the whole app is already
-- gated by Home Assistant's own authentication via Ingress, so there is no
-- separate password to manage here. This also lets you assign things to
-- people (e.g. kids) who don't have their own HA login.
--
-- is_admin/access_revoked add a lightweight layer on top: a member claims a
-- profile by name the first time HA forwards their identity on an ingress
-- request (see middleware/access.js), and an admin can then revoke that
-- specific person's access to the app.
CREATE TABLE IF NOT EXISTS members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6366f1',
  ha_person_entity_id TEXT,          -- optional link to a HA person.* entity for notify targeting
  ha_user_id TEXT UNIQUE,            -- HA user id (from ingress headers) claimed on first request, used for access control
  notify_target TEXT,                -- optional HA notify service, e.g. notify.mobile_app_ty_phone
  is_admin INTEGER NOT NULL DEFAULT 0,
  access_revoked INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Bill categories. Seeded with sensible defaults below; household members can
-- add their own from Settings.
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO categories (name) VALUES
  ('Utilities'), ('Housing'), ('Subscriptions'), ('Auto'),
  ('Credit Cards'), ('Short-Term Loans'), ('Food'), ('Other');

-- A planned paycheck: a date + expected amount you can assign bills against
-- from the Payment Plans tab, to budget which bills come out of which check.
CREATE TABLE IF NOT EXISTS paychecks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pay_date TEXT NOT NULL,
  expected_amount REAL NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  amount REAL NOT NULL DEFAULT 0,
  payee TEXT,
  category TEXT NOT NULL DEFAULT 'Other',
  recurrence TEXT NOT NULL DEFAULT 'monthly',   -- once | weekly | monthly | yearly
  due_date TEXT NOT NULL,                        -- ISO date of the next/only due date
  autopay INTEGER NOT NULL DEFAULT 0,
  assigned_to INTEGER REFERENCES members(id) ON DELETE SET NULL,
  paycheck_id INTEGER REFERENCES paychecks(id) ON DELETE SET NULL, -- payment-plan assignment
  reminder_days_before INTEGER NOT NULL DEFAULT 3,
  status TEXT NOT NULL DEFAULT 'unpaid',          -- unpaid | paid | overdue
  current_balance REAL,                           -- latest known statement balance, for credit-card/loan bills
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bill_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bill_id INTEGER NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  amount_paid REAL NOT NULL,
  paid_date TEXT NOT NULL DEFAULT (datetime('now')),
  paid_by INTEGER REFERENCES members(id) ON DELETE SET NULL,
  statement_balance REAL,                         -- balance as of this payment, for credit-card/loan bills
  paycheck_id INTEGER REFERENCES paychecks(id) ON DELETE SET NULL -- which paycheck this was paid from, if any,
                                                   -- captured at payment time so it survives the bill rolling
                                                   -- forward and losing its live payment-plan assignment
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
CREATE INDEX IF NOT EXISTS idx_bills_paycheck ON bills(paycheck_id);
CREATE INDEX IF NOT EXISTS idx_paychecks_pay_date ON paychecks(pay_date);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);

-- members.ha_user_id already has an inline UNIQUE for brand-new databases;
-- this index makes the same guarantee for databases where the column was
-- added later via migration (see db/index.js), where ALTER TABLE ADD COLUMN
-- can't declare UNIQUE inline. Partial (WHERE ... IS NOT NULL) so multiple
-- unclaimed (NULL) members are still allowed.
CREATE UNIQUE INDEX IF NOT EXISTS idx_members_ha_user_id
  ON members(ha_user_id) WHERE ha_user_id IS NOT NULL;
