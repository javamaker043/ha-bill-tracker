import React, { useState } from 'react';
import { Trash2 } from 'lucide-react';

// Trash icon that needs a second tap to actually delete -- inline instead of
// window.confirm(), which some embedded webviews (e.g. the Home Assistant
// mobile app) don't reliably show. Pass `children` for a text button instead
// of the bare icon.
export default function ConfirmDeleteButton({ onConfirm, title = 'Delete', className = '', children }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  if (confirming) {
    return (
      <span className="inline-flex items-center gap-1">
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onConfirm();
            } finally {
              setBusy(false);
              setConfirming(false);
            }
          }}
          className="rounded bg-rose-500/25 px-2 py-1 text-xs font-medium text-rose-200 hover:bg-rose-500/35 disabled:opacity-50"
        >
          {busy ? 'Deleting…' : 'Delete?'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setConfirming(false)}
          className="px-1 text-xs text-slate-400 hover:text-white"
        >
          Keep
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      title={title}
      onClick={() => setConfirming(true)}
      className={className || 'p-1 text-slate-500 hover:text-rose-400'}
    >
      {children || <Trash2 size={16} />}
    </button>
  );
}
