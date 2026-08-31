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
import paychecksRouter from './routes/paychecks.js';
import { startReminderScheduler } from './services/reminders.js';
import { importMembersOnFirstBoot } from './services/bootstrap.js';
import db from './db/index.js';

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
app.use('/api/paychecks', paychecksRouter);

// Serve the built React app (see Dockerfile: frontend build output -> /app/public)
const staticDir = path.join(__dirname, '../public');
app.use(express.static(staticDir));
app.get('*', (_req, res) => {
  res.sendFile(path.join(staticDir, 'index.html'));
});

await importMembersOnFirstBoot().catch((err) =>
  console.error('[bootstrap] failed to import members from Home Assistant', err)
);

const server = app.listen(PORT, () => {
  console.log(`[household-hub] listening on :${PORT}`);
  startReminderScheduler();
});

// Supervisor sends SIGTERM (not SIGKILL) to stop the old container during
// an update, but Node has no default handler for it, so without this the
// process is killed mid-request with the WAL file possibly still holding
// uncheckpointed writes. This forces a checkpoint into the main db file and
// closes the connection cleanly before exiting.
function shutdown(signal) {
  console.log(`[household-hub] received ${signal}, shutting down`);
  server.close(() => {
    try {
      db.pragma('wal_checkpoint(TRUNCATE)');
      db.close();
      console.log('[household-hub] database closed cleanly');
    } catch (err) {
      console.error('[household-hub] error closing database', err);
    }
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
