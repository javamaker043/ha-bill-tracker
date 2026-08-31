import React, { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Plus, AlertTriangle } from 'lucide-react';
import { api } from '../lib/api.js';
import { Card } from '../components/Card.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import MemberPill from '../components/MemberPill.jsx';
import Modal from '../components/Modal.jsx';

const statuses = ['todo', 'in_progress', 'done'];

export default function ProjectDetail() {
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [members, setMembers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', due_date: '', assigned_to: '', priority: 'normal' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saveError, setSaveError] = useState(null);

  const refresh = () => {
    setError(null);
    Promise.all([api.projects.list(), api.tasks.list({ project_id: id }), api.members.list()])
      .then(([all, t, m]) => {
        const found = all.find((p) => String(p.id) === id);
        setProject(found || null);
        setNotFound(!found);
        setTasks(t);
        setMembers(m);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(refresh, [id]);

  const memberById = useMemo(() => Object.fromEntries(members.map((m) => [m.id, m])), [members]);

  const submit = async (e) => {
    e.preventDefault();
    setSaveError(null);
    try {
      await api.tasks.create({ ...form, project_id: id, assigned_to: form.assigned_to || null });
      setShowForm(false);
      setForm({ title: '', due_date: '', assigned_to: '', priority: 'normal' });
      refresh();
    } catch (err) {
      setSaveError(err.message);
    }
  };

  const cycleStatus = async (task) => {
    const next = statuses[(statuses.indexOf(task.status) + 1) % statuses.length];
    try {
      await api.tasks.update(task.id, { status: next });
      refresh();
    } catch (err) {
      setError(err.message);
    }
  };

  if (error) {
    return (
      <div className="space-y-4">
        <Link to="/projects" className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white">
          <ArrowLeft size={16} /> All projects
        </Link>
        <div className="flex items-center gap-3 rounded-xl2 border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          <AlertTriangle size={18} className="shrink-0" />
          <p className="flex-1">Couldn't load this project: {error}</p>
          <button onClick={refresh} className="shrink-0 rounded-md bg-rose-500/20 px-2.5 py-1 text-xs font-medium hover:bg-rose-500/30">
            Retry
          </button>
        </div>
      </div>
    );
  }
  if (loading) return <p className="text-slate-400">Loading…</p>;
  if (notFound) {
    return (
      <div className="space-y-4">
        <Link to="/projects" className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white">
          <ArrowLeft size={16} /> All projects
        </Link>
        <p className="text-slate-400">This project doesn't exist (it may have been deleted).</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link to="/projects" className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white">
        <ArrowLeft size={16} /> All projects
      </Link>

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">{project.name}</h2>
          {project.description && <p className="text-sm text-slate-400">{project.description}</p>}
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium hover:bg-accent-soft"
        >
          <Plus size={16} /> Add task
        </button>
      </div>

      <Card className="overflow-hidden" padding="p-0">
        <div className="divide-y divide-white/5">
          {tasks.map((t) => (
            <div key={t.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-medium">{t.title}</p>
                <p className="text-xs text-slate-400">
                  {t.due_date ? `Due ${t.due_date}` : 'No due date'} · <MemberPill member={memberById[t.assigned_to]} /> ·{' '}
                  <span className="capitalize">{t.priority}</span> priority
                </p>
              </div>
              <button onClick={() => cycleStatus(t)}>
                <StatusBadge status={t.status} />
              </button>
            </div>
          ))}
          {tasks.length === 0 && <p className="px-4 py-8 text-center text-sm text-slate-500">No tasks yet.</p>}
        </div>
      </Card>

      {showForm && (
        <Modal title="Add task" onClose={() => setShowForm(false)}>
          <form onSubmit={submit} className="space-y-3">
            <input
              required
              placeholder="Task title"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className="w-full rounded-lg border border-white/10 bg-surface-muted px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <input
              type="date"
              value={form.due_date}
              onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
              className="w-full rounded-lg border border-white/10 bg-surface-muted px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <select
              value={form.assigned_to}
              onChange={(e) => setForm((f) => ({ ...f, assigned_to: e.target.value }))}
              className="w-full rounded-lg border border-white/10 bg-surface-muted px-3 py-2 text-sm outline-none focus:border-accent"
            >
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
            <select
              value={form.priority}
              onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
              className="w-full rounded-lg border border-white/10 bg-surface-muted px-3 py-2 text-sm outline-none focus:border-accent"
            >
              <option value="low">Low priority</option>
              <option value="normal">Normal priority</option>
              <option value="high">High priority</option>
            </select>
            {saveError && <p className="text-xs text-rose-400">{saveError}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowForm(false)} className="rounded-lg px-4 py-2 text-sm text-slate-300 hover:bg-white/5">
                Cancel
              </button>
              <button type="submit" className="rounded-lg bg-accent px-4 py-2 text-sm font-medium hover:bg-accent-soft">
                Add task
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
