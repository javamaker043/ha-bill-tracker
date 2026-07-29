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

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

export default router;
