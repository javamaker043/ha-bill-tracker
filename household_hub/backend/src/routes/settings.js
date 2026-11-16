import { Router } from 'express';
import { getSetting, setSetting, deleteSetting } from '../db/settingsStore.js';

const router = Router();

function readSettings() {
  const raw = getSetting('monthly_income');
  const income = raw !== null && raw !== '' ? Number(raw) : null;
  return {
    monthly_income: Number.isFinite(income) ? income : null,
    // Where the income figure came from: 'manual' or a Monarch source.
    income_source: getSetting('income_source'),
  };
}

router.get('/', (_req, res) => {
  res.json(readSettings());
});

// monthly_income: average monthly take-home, or null/'' to clear it. Typing a
// number by hand marks the source as manual.
router.put('/', (req, res) => {
  const { monthly_income } = req.body;
  if (monthly_income === undefined) return res.status(400).json({ error: 'monthly_income is required' });
  if (monthly_income === null || monthly_income === '') {
    deleteSetting('monthly_income');
    deleteSetting('income_source');
  } else {
    const n = Number(monthly_income);
    if (!Number.isFinite(n) || n < 0) {
      return res.status(400).json({ error: 'monthly_income must be a non-negative number' });
    }
    setSetting('monthly_income', n);
    const allowed = ['monarch_streams', 'monarch_average', 'monarch_budget'];
    setSetting('income_source', allowed.includes(req.body.income_source) ? req.body.income_source : 'manual');
  }
  res.json(readSettings());
});

export default router;
