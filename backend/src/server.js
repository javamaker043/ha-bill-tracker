import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ingressContext } from './middleware/ingress.js';
import { accessControl } from './middleware/access.js';
import membersRouter from './routes/members.js';
import billsRouter from './routes/bills.js';
import projectsRouter from './routes/projects.js';
import tasksRouter from './routes/tasks.js';
import notifyRouter from './routes/notify.js';
import categoriesRouter from './routes/categories.js';
import { startReminderScheduler } from './services/reminders.js';
import { importMembersOnFirstBoot } from './services/bootstrap.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 8099;

app.use(cors());
app.use(express.json());
app.use(ingressContext);

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api', accessControl);
app.use('/api/members', membersRouter);
app.use('/api/bills', billsRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/notify', notifyRouter);
app.use('/api/categories', categoriesRouter);

// Serve the built React app (see Dockerfile: frontend build output -> /app/public)
const staticDir = path.join(__dirname, '../public');
app.use(express.static(staticDir));
app.get('*', (_req, res) => {
  res.sendFile(path.join(staticDir, 'index.html'));
});

await importMembersOnFirstBoot().catch((err) =>
  console.error('[bootstrap] failed to import members from Home Assistant', err)
);

app.listen(PORT, () => {
  console.log(`[household-hub] listening on :${PORT}`);
  startReminderScheduler();
});
