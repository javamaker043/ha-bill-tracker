import { Router } from 'express';
import { notify, getPersons } from '../services/homeAssistant.js';
import { checkBills, checkTasks } from '../services/reminders.js';

const router = Router();

// Express 4 doesn't catch a rejected promise from an async handler -- left
// unhandled, Node (15+) terminates the whole process, taking the add-on down
// over e.g. Home Assistant being briefly unreachable. Every async handler
// here reports failures as a normal JSON error instead.
router.post('/test', async (req, res) => {
  const target = req.body.notify_service || process.env.NOTIFY_SERVICE || 'notify.notify';
  try {
    await notify(target, 'Household Hub', 'This is a test notification from Household Hub.');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/run-checks', async (_req, res) => {
  try {
    await checkBills();
    await checkTasks();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/persons', async (_req, res) => {
  try {
    res.json(await getPersons());
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

export default router;
