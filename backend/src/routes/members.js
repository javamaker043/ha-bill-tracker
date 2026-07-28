import { Router } from 'express';
import db from '../db/index.js';

const router = Router();

router.get('/', (_req, res) => {
  res.json(db.prepare('SELECT * FROM members ORDER BY name').all());
});

router.post('/', (req, res) => {
  const { name, color, ha_person_entity_id, notify_target } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const info = db
    .prepare(
      'INSERT INTO members (name, color, ha_person_entity_id, notify_target) VALUES (?, ?, ?, ?)'
    )
    .run(name, color || '#6366f1', ha_person_entity_id || null, notify_target || null);
  res.status(201).json(db.prepare('SELECT * FROM members WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const { name, color, ha_person_entity_id, notify_target } = req.body;
  const existing = db.prepare('SELECT * FROM members WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  db.prepare(
    'UPDATE members SET name=?, color=?, ha_person_entity_id=?, notify_target=? WHERE id=?'
  ).run(
    name ?? existing.name,
    color ?? existing.color,
    ha_person_entity_id ?? existing.ha_person_entity_id,
    notify_target ?? existing.notify_target,
    req.params.id
  );
  res.json(db.prepare('SELECT * FROM members WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM members WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

export default router;
