import React from 'react';

export default function MemberPill({ member }) {
  if (!member) return <span className="text-xs text-slate-500">Unassigned</span>;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-300">
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: member.color }} />
      {member.name}
    </span>
  );
}
