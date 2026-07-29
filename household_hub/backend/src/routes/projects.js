import { Router } from 'express';
import db from '../db/index.js';

const router = Router();

router.get('/', (_req, res) => {
  const projects = db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all();
  const withCounts = projects.map((p) => {
    const counts = db
      .prepare(
        `SELECT
           SUM(CASE WHEN status != 'done' THEN 1 ELSE 0 END) AS open_tasks,
           COUNT(*) AS total_tasks
         FROM tasks WHERE project_id = ?`
      )
      .get(p.id);
    return { ...p, ...counts };
  });
  res.json(withCounts);
});

router.post('/', (req, res) => {
  const { name, description, color } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const info = db
    .prepare('INSERT INTO projects (name, description, color) VALUES (?, ?, ?)')
    .run(name, description || null, color || '#0ea5e9');
  res.status(201).json(db.prepare('SELECT * FROM projects WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const merged = { ...existing, ...req.body };
  db.prepare('UPDATE projects SET name=?, description=?, color=? WHERE id=?').run(
    merged.name, merged.description, merged.color, req.params.id
  );
  res.json(db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

export default router;
