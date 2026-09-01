import { Router } from 'express';
import db from '../db/index.js';

const router = Router();

router.get('/', (_req, res) => {
  res.json(db.prepare('SELECT * FROM categories ORDER BY name').all());
});

router.post('/', (req, res) => {
  const name = req.body.name?.trim();
  if (!name) return res.status(400).json({ error: 'name is required' });
  db.prepare('INSERT OR IGNORE INTO categories (name) VALUES (?)').run(name);
  res.status(201).json(db.prepare('SELECT * FROM categories WHERE name = ?').get(name));
});

// Toggled from Settings: marks whether bills in this category carry a
// running balance (credit card, loan) -- drives the current-balance/APR/
// credit-limit fields on bills and what shows up on Debt Management,
// instead of only ever guessing from the category name.
router.patch('/:id/debt', (req, res) => {
  const existing = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  db.prepare('UPDATE categories SET is_debt = ? WHERE id = ?').run(req.body.is_debt ? 1 : 0, req.params.id);
  res.json(db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

export default router;
