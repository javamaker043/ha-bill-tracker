import React, { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '../lib/api.js';
import { Card } from '../components/Card.jsx';

export default function Settings() {
  const [members, setMembers] = useState([]);
  const [form, setForm] = useState({ name: '', color: '#6366f1', notify_target: '' });
  const [testTarget, setTestTarget] = useState('notify.notify');
  const [testStatus, setTestStatus] = useState('');

  const refresh = () => api.members.list().then(setMembers);
  useEffect(refresh, []);

  const addMember = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    await api.members.create(form);
    setForm({ name: '', color: '#6366f1', notify_target: '' });
    refresh();
  };

  const removeMember = async (id) => {
    await api.members.remove(id);
    refresh();
  };

  const sendTest = async () => {
    setTestStatus('Sending…');
    try {
      await api.notify.test(testTarget);
      setTestStatus('Sent! Check your HA notification target.');
    } catch (err) {
      setTestStatus(`Failed: ${err.message}`);
    }
  };

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h2 className="text-2xl font-semibold">Settings</h2>
        <p className="text-sm text-slate-400">Household members and Home Assistant notifications.</p>
      </div>

      <Card>
        <h3 className="mb-4 text-sm font-semibold text-slate-200">Household members</h3>
        <div className="space-y-2 mb-4">
          {members.map((m) => (
            <div key={m.id} className="flex items-center justify-between rounded-lg bg-surface-muted px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: m.color }} />
                <span className="text-sm font-medium">{m.name}</span>
                {m.notify_target && <span className="text-xs text-slate-500">→ {m.notify_target}</span>}
              </div>
              <button onClick={() => removeMember(m.id)} className="text-slate-500 hover:text-rose-400">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          {members.length === 0 && <p className="text-sm text-slate-500">No members added yet.</p>}
        </div>

        <form onSubmit={addMember} className="grid grid-cols-[1fr_auto_1fr_auto] gap-2 items-center">
          <input
            placeholder="Name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="rounded-lg border border-white/10 bg-surface-muted px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <input
            type="color"
            value={form.color}
            onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
            className="h-9 w-10 rounded"
          />
          <input
            placeholder="notify.mobile_app_xxx (optional)"
            value={form.notify_target}
            onChange={(e) => setForm((f) => ({ ...f, notify_target: e.target.value }))}
            className="rounded-lg border border-white/10 bg-surface-muted px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <button type="submit" className="rounded-lg bg-accent p-2 hover:bg-accent-soft">
            <Plus size={16} />
          </button>
        </form>
      </Card>

      <Card>
        <h3 className="mb-2 text-sm font-semibold text-slate-200">Test Home Assistant notification</h3>
        <p className="mb-4 text-xs text-slate-500">
          Enter a HA notify service (e.g. <code>notify.mobile_app_ty_phone</code>) and send a test push.
        </p>
        <div className="flex gap-2">
          <input
            value={testTarget}
            onChange={(e) => setTestTarget(e.target.value)}
            className="flex-1 rounded-lg border border-white/10 bg-surface-muted px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <button onClick={sendTest} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium hover:bg-accent-soft">
            Send test
          </button>
        </div>
        {testStatus && <p className="mt-2 text-xs text-slate-400">{testStatus}</p>}
      </Card>
    </div>
  );
}
