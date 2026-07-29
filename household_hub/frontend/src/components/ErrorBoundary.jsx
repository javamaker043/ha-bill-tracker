import React from 'react';

// Without this, any render error unmounts the whole app to a blank screen
// with no way back except the browser's Back button. Scoped around just the
// routed page content (see App.jsx) so the sidebar stays clickable and a
// crash on one page doesn't take down navigation itself.
export default class ErrorBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[household-hub] render error', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl2 border border-white/5 bg-surface-raised p-10 text-center">
          <p className="text-lg font-semibold">Something went wrong loading this page.</p>
          <p className="max-w-sm text-sm text-slate-400">{this.state.error.message}</p>
          <button
            onClick={() => this.setState({ error: null })}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium hover:bg-accent-soft"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
