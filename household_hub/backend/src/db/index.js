import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/household.db');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

// Log what we found on disk *before* opening -- if DB_PATH already existed
// with a non-trivial size, the volume survived; if it's missing/empty, the
// persistent volume itself was wiped (a Supervisor/host issue, not
// something this app did). This is the one piece of evidence that tells
// the two apart after a report of "data disappears on update".
const existedBefore = fs.existsSync(DB_PATH);
const sizeBefore = existedBefore ? fs.statSync(DB_PATH).size : 0;
console.log(
  `[household-hub] DB_PATH=${DB_PATH} existed=${existedBefore} size=${sizeBefore} bytes`
);

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
db.exec(schema);

// CREATE TABLE IF NOT EXISTS only helps brand-new databases -- a column
// added to an existing table needs an explicit migration here too, since an
// install from before that column existed already has the table created.
// Returns true only when the column didn't already exist and was just
// added -- lets a one-time backfill run exactly once, right when a column
// is introduced, instead of on every boot (which would keep stomping any
// later manual change to that data).
function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    return true;
  }
  return false;
}

ensureColumn('members', 'ha_user_id', 'TEXT');
ensureColumn('members', 'is_admin', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('members', 'access_revoked', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('bills', 'paycheck_id', 'INTEGER REFERENCES paychecks(id) ON DELETE SET NULL');
ensureColumn('bills', 'current_balance', 'REAL');
ensureColumn('bill_payments', 'statement_balance', 'REAL');
ensureColumn('bill_payments', 'paycheck_id', 'INTEGER REFERENCES paychecks(id) ON DELETE SET NULL');
ensureColumn('bill_payments', 'source', 'TEXT');
ensureColumn('bills', 'interest_rate', 'REAL');
ensureColumn('bills', 'credit_limit', 'REAL');

if (ensureColumn('categories', 'is_debt', 'INTEGER NOT NULL DEFAULT 0')) {
  // Preserve the old name-based heuristic's behavior for existing installs
  // so upgrading doesn't silently change what "Mark paid" requires for
  // bills already in categories that look debt-related -- one-time only,
  // so a later manual toggle in Settings isn't overwritten on next boot.
  db.exec(
    `UPDATE categories SET is_debt = 1 WHERE is_debt = 0 AND (name LIKE '%credit%' OR name LIKE '%loan%')`
  );
}

// Row counts after schema/migration, still tied to the pre-open existence
// check above: e.g. "existed=true size=45056 bytes" followed by
// "bills=0" means the file was there but empty/fresh -- a different
// problem (corruption, wrong file) than "existed=false" (volume wiped).
const counts = ['members', 'bills', 'projects', 'paychecks']
  .map((table) => `${table}=${db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n}`)
  .join(' ');
console.log(`[household-hub] row counts at boot: ${counts}`);

export default db;
