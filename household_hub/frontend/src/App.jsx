import React, { useEffect, useState } from 'react';
import { Routes, Route, NavLink, useLocation, Link } from 'react-router-dom';
import { LayoutDashboard, Receipt, CalendarDays, FolderKanban, Settings, Wallet, TrendingDown, Menu, X, AlertTriangle } from 'lucide-react';

import Dashboard from './pages/Dashboard.jsx';
import Bills from './pages/Bills.jsx';
import BillCalendar from './pages/BillCalendar.jsx';
import PaymentPlans from './pages/PaymentPlans.jsx';
import DebtManagement from './pages/DebtManagement.jsx';
import Projects from './pages/Projects.jsx';
import ProjectDetail from './pages/ProjectDetail.jsx';
import SettingsPage from './pages/Settings.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/bills', label: 'Bills', icon: Receipt },
  { to: '/calendar', label: 'Bill Calendar', icon: CalendarDays },
  { to: '/payment-plans', label: 'Payment Plans', icon: Wallet },
  { to: '/debt-management', label: 'Debt Management', icon: TrendingDown },
  { to: '/projects', label: 'Projects', icon: FolderKanban },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export default function App() {
  const location = useLocation();
  // Closed by default so mobile (the HA iOS app, small viewports) starts on
  // page content, not the nav; md: breakpoint and up shows it inline instead.
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [crashError, setCrashError] = useState(null);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    // React's error boundaries (see ErrorBoundary.jsx) only catch errors
    // thrown while rendering -- not from useEffect callbacks, event
    // handlers, or rejected promises, which surface as regular uncaught
    // errors instead and otherwise leave no visible trace beyond the
    // console. This is a backstop for that whole other class of crash.
    const onError = (event) => setCrashError(event.error?.message || event.message);
    const onRejection = (event) => setCrashError(event.reason?.message || String(event.reason));
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  return (
    <div className="flex h-screen overflow-hidden">
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/60 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col gap-1 border-r border-white/5 bg-surface-raised p-4 transition-transform duration-200 md:static md:z-auto md:w-60 md:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="mb-2 flex items-center justify-between px-2 py-3">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Household Hub</h1>
            <p className="text-xs text-slate-400">Bills, tasks &amp; reminders</p>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="text-slate-400 hover:text-white md:hidden">
            <X size={20} />
          </button>
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

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-white/5 px-4 py-3 md:hidden">
          <button onClick={() => setSidebarOpen(true)} className="text-slate-300 hover:text-white">
            <Menu size={22} />
          </button>
          <h1 className="text-base font-semibold">Household Hub</h1>
        </header>

        {crashError && (
          <div className="flex items-start gap-3 border-b border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            <AlertTriangle size={18} className="mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="font-medium">Something broke: {crashError}</p>
              <p className="text-xs text-rose-300/80">
                The rest of the app should still work -- try another page from the menu, or reload if things
                look stuck.
              </p>
            </div>
            <button onClick={() => window.location.reload()} className="shrink-0 rounded-md bg-rose-500/20 px-2.5 py-1 text-xs font-medium hover:bg-rose-500/30">
              Reload
            </button>
            <button onClick={() => setCrashError(null)} className="shrink-0 text-rose-300/70 hover:text-rose-100">
              <X size={16} />
            </button>
          </div>
        )}

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8">
          {/* Keyed by path so a crash on one page doesn't linger after you
              navigate away -- the sidebar stays usable either way. */}
          <ErrorBoundary key={location.pathname}>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/bills" element={<Bills />} />
              <Route path="/calendar" element={<BillCalendar />} />
              <Route path="/payment-plans" element={<PaymentPlans />} />
              <Route path="/debt-management" element={<DebtManagement />} />
              <Route path="/projects" element={<Projects />} />
              <Route path="/projects/:id" element={<ProjectDetail />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}

function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl2 border border-white/5 bg-surface-raised p-10 text-center">
      <p className="text-lg font-semibold">Page not found.</p>
      <Link to="/" className="text-sm text-accent-soft hover:underline">
        Back to Dashboard
      </Link>
    </div>
  );
}
