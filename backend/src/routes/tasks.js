import { Router } from 'express';
import db from '../db/index.js';

const router = Router();

router.get('/', (req, res) => {
  const { project_id, assigned_to, status } = req.query;
  let query = 'SELECT * FROM tasks';
  const clauses = [];
  const params = [];
  if (project_id) { clauses.push('project_id = ?'); params.push(project_id); }
  if (assigned_to) { clauses.push('assigned_to = ?'); params.push(assigned_to); }
  if (status) { clauses.push('status = ?'); params.push(status); }
  if (clauses.length) query += ' WHERE ' + clauses.join(' AND ');
  query += ' ORDER BY (due_date IS NULL), due_date ASC';
  res.json(db.prepare(query).all(...params));
});

router.post('/', (req, res) => {
  const { project_id, title, description, assigned_to, due_date, priority } = req.body;
  if (!title) return res.status(400).json({ error: 'title is required' });
  const info = db
    .prepare(
      `INSERT INTO tasks (project_id, title, description, assigned_to, due_date, priority)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(project_id || null, title, description || null, assigned_to || null, due_date || null, priority || 'normal');
  res.status(201).json(db.prepare('SELECT * FROM tasks WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const merged = { ...existing, ...req.body };
  db.prepare(
    `UPDATE tasks SET project_id=?, title=?, description=?, assigned_to=?, due_date=?, priority=?, status=?, updated_at=datetime('now')
     WHERE id=?`
  ).run(
    merged.project_id, merged.title, merged.description, merged.assigned_to,
    merged.due_date, merged.priority, merged.status, req.params.id
  );
  res.json(db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

export default router;
