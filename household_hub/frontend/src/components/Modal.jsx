import React from 'react';
import { X } from 'lucide-react';

export default function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      {/* max-h + overflow-y-auto so a long form (many fields, or the mobile
          keyboard eating half the viewport) scrolls inside the modal
          instead of pushing its Save/Cancel buttons off-screen with no way
          to reach them. */}
      <div className="flex max-h-[90vh] w-full max-w-md flex-col rounded-xl2 border border-white/10 bg-surface-raised shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/5 p-6 pb-4">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto p-6 pt-4">{children}</div>
      </div>
    </div>
  );
}
