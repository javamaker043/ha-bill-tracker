import React from 'react';
import { Routes, Route, NavLink } from 'react-router-dom';
import { LayoutDashboard, Receipt, CalendarDays, FolderKanban, Settings } from 'lucide-react';

import Dashboard from './pages/Dashboard.jsx';
import Bills from './pages/Bills.jsx';
import BillCalendar from './pages/BillCalendar.jsx';
import Projects from './pages/Projects.jsx';
import ProjectDetail from './pages/ProjectDetail.jsx';
import SettingsPage from './pages/Settings.jsx';

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/bills', label: 'Bills', icon: Receipt },
  { to: '/calendar', label: 'Bill Calendar', icon: CalendarDays },
  { to: '/projects', label: 'Projects', icon: FolderKanban },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export default function App() {
  return (
    <div className="flex h-screen">
      <aside className="w-60 shrink-0 border-r border-white/5 bg-surface-raised p-4 flex flex-col gap-1">
        <div className="px-2 py-3 mb-2">
          <h1 className="text-lg font-semibold tracking-tight">Household Hub</h1>
          <p className="text-xs text-slate-400">Bills, tasks &amp; reminders</p>
        </div>
        {navItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-accent/15 text-accent-soft'
                  : 'text-slate-300 hover:bg-white/5 hover:text-white'
              }`
            }
          >
            <Icon size={18} strokeWidth={2} />
            {label}
          </NavLink>
        ))}
      </aside>

      <main className="flex-1 overflow-y-auto p-8">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/bills" element={<Bills />} />
          <Route path="/calendar" element={<BillCalendar />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/projects/:id" element={<ProjectDetail />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  );
}
