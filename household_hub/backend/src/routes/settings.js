import { Router } from 'express';
import db from '../db/index.js';

const router = Router();

function readSettings() {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = 'monthly_income'").get();
  const income = row && row.value !== '' && row.value != null ? Number(row.value) : null;
  return { monthly_income: Number.isFinite(income) ? income : null };
}

router.get('/', (_req, res) => {
  res.json(readSettings());
});

// monthly_income: average monthly take-home, or null/'' to clear it.
router.put('/', (req, res) => {
  const { monthly_income } = req.body;
  if (monthly_income === undefined) return res.status(400).json({ error: 'monthly_income is required' });
  if (monthly_income === null || monthly_income === '') {
    db.prepare("DELETE FROM app_settings WHERE key = 'monthly_income'").run();
  } else {
    const n = Number(monthly_income);
    if (!Number.isFinite(n) || n < 0) {
      return res.status(400).json({ error: 'monthly_income must be a non-negative number' });
    }
    db.prepare(
      "INSERT INTO app_settings (key, value) VALUES ('monthly_income', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    ).run(String(n));
  }
  res.json(readSettings());
});

export default router;
