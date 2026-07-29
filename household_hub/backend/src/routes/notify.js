import { Router } from 'express';
import { notify, getPersons } from '../services/homeAssistant.js';
import { checkBills, checkTasks } from '../services/reminders.js';

const router = Router();

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
  await checkBills();
  await checkTasks();
  res.json({ ok: true });
});

router.get('/persons', async (_req, res) => {
  res.json(await getPersons());
});

export default router;
