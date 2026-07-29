import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/household.db');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
db.exec(schema);

// CREATE TABLE IF NOT EXISTS only helps brand-new databases -- a column
// added to an existing table needs an explicit migration here too, since an
// install from before that column existed already has the table created.
function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

ensureColumn('members', 'ha_user_id', 'TEXT');
ensureColumn('members', 'is_admin', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('members', 'access_revoked', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('bills', 'paycheck_id', 'INTEGER REFERENCES paychecks(id) ON DELETE SET NULL');

export default db;
