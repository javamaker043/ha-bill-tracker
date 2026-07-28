import React, { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { Card } from '../components/Card.jsx';
import Modal from '../components/Modal.jsx';

export default function Projects() {
  const [projects, setProjects] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', color: '#0ea5e9' });
  const navigate = useNavigate();

  const refresh = () => api.projects.list().then(setProjects);
  useEffect(refresh, []);

  const submit = async (e) => {
    e.preventDefault();
    await api.projects.create(form);
    setShowForm(false);
    setForm({ name: '', description: '', color: '#0ea5e9' });
    refresh();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Projects</h2>
          <p className="text-sm text-slate-400">Group tasks by household project.</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium hover:bg-accent-soft"
        >
          <Plus size={16} /> New project
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((p) => (
          <Card key={p.id} className="cursor-pointer hover:border-white/20" >
            <div onClick={() => navigate(`/projects/${p.id}`)}>
              <div className="mb-2 flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: p.color }} />
                <h3 className="font-medium">{p.name}</h3>
              </div>
              {p.description && <p className="mb-3 text-sm text-slate-400">{p.description}</p>}
              <p className="text-xs text-slate-500">
                {p.open_tasks || 0} open / {p.total_tasks || 0} tasks
              </p>
            </div>
          </Card>
        ))}
        {projects.length === 0 && (
          <p className="text-sm text-slate-500">No projects yet — create one to start assigning tasks.</p>
        )}
      </div>

      {showForm && (
        <Modal title="New project" onClose={() => setShowForm(false)}>
          <form onSubmit={submit} className="space-y-3">
            <input
              required
              placeholder="Project name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full rounded-lg border border-white/10 bg-surface-muted px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <textarea
              placeholder="Description (optional)"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className="w-full rounded-lg border border-white/10 bg-surface-muted px-3 py-2 text-sm outline-none focus:border-accent"
              rows={2}
            />
            <input
              type="color"
              value={form.color}
              onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
              className="h-9 w-16 rounded"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowForm(false)} className="rounded-lg px-4 py-2 text-sm text-slate-300 hover:bg-white/5">
                Cancel
              </button>
              <button type="submit" className="rounded-lg bg-accent px-4 py-2 text-sm font-medium hover:bg-accent-soft">
                Create
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
