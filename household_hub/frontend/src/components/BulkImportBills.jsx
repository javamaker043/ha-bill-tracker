import React, { useState } from 'react';
import { Upload } from 'lucide-react';
import { api } from '../lib/api.js';

const PLACEHOLDER = `{
  "bills": [
    {
      "name": "Verizon",
      "amount": 408,
      "due_date": "2026-09-01",
      "category": "Utilities",
      "recurrence": "monthly",
      "assigned_to_name": "Ty",
      "notes": "optional"
    }
  ]
}`;

// Client-side only: matches assigned_to_name against already-loaded members
// and creates any categories that don't exist yet, then loops api.bills.create
// per row. No new backend endpoint -- a modest paste-in list (dozens, not
// thousands, of rows) is well within what looping the existing create route
// handles fine.
export default function BulkImportBills({ onImported }) {
  const [text, setText] = useState('');
  const [preview, setPreview] = useState(null);
  const [parseError, setParseError] = useState(null);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState(null);

  const buildPreview = async () => {
    setParseError(null);
    setResults(null);
    let data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      setParseError(`Invalid JSON: ${err.message}`);
      setPreview(null);
      return;
    }
    const rows = Array.isArray(data) ? data : data.bills;
    if (!Array.isArray(rows)) {
      setParseError('Expected a JSON array of bills, or an object like { "bills": [...] }.');
      setPreview(null);
      return;
    }

    const [members, categories] = await Promise.all([api.members.list(), api.categories.list()]);
    const memberByName = new Map(members.map((m) => [m.name.toLowerCase(), m]));
    const categoryNames = new Set(categories.map((c) => c.name));

    const parsed = rows.map((raw, i) => {
      const issues = [];
      if (!raw.name) issues.push('missing name');
      if (raw.amount == null || isNaN(Number(raw.amount))) issues.push('missing/invalid amount');
      if (!raw.due_date) issues.push('missing due_date');

      let assigned_to = null;
      if (raw.assigned_to_name) {
        const m = memberByName.get(String(raw.assigned_to_name).toLowerCase());
        if (m) assigned_to = m.id;
        else issues.push(`no member named "${raw.assigned_to_name}" -- will import unassigned`);
      }

      const category = raw.category || 'Other';
      const willCreateCategory = !categoryNames.has(category);

      return { key: i, raw, issues, assigned_to, category, willCreateCategory };
    });
    setPreview(parsed);
  };

  const runImport = async () => {
    if (!preview) return;
    setImporting(true);
    const summary = { billsOk: 0, billsFail: 0, errors: [] };

    const newCategories = [...new Set(preview.filter((r) => r.willCreateCategory).map((r) => r.category))];
    for (const name of newCategories) {
      try {
        await api.categories.create(name);
      } catch (err) {
        summary.errors.push(`Category "${name}": ${err.message}`);
      }
    }

    for (const row of preview) {
      // Unresolved member names are non-blocking (imports unassigned instead);
      // everything else (missing name/amount/due_date) blocks that row.
      const blocking = row.issues.filter((i) => !i.startsWith('no member named'));
      if (blocking.length) {
        summary.billsFail++;
        summary.errors.push(`${row.raw.name || '(unnamed)'}: ${blocking.join(', ')}`);
        continue;
      }
      try {
        await api.bills.create({
          name: row.raw.name,
          amount: Number(row.raw.amount),
          category: row.category,
          recurrence: row.raw.recurrence || 'monthly',
          due_date: row.raw.due_date,
          autopay: !!row.raw.autopay,
          assigned_to: row.assigned_to,
          reminder_days_before: row.raw.reminder_days_before ?? 3,
          notes: row.raw.notes || '',
        });
        summary.billsOk++;
      } catch (err) {
        summary.billsFail++;
        summary.errors.push(`${row.raw.name}: ${err.message}`);
      }
    }

    setResults(summary);
    setPreview(null);
    setText('');
    setImporting(false);
    onImported?.();
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        Paste a JSON array of bills (or <code>{'{ "bills": [...] }'}</code>) to create many at once --
        handy for entering a backlog from a spreadsheet, statement, or notes app. This runs entirely
        against your own instance; nothing is sent anywhere else.
      </p>
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setPreview(null);
          setResults(null);
        }}
        placeholder={PLACEHOLDER}
        rows={8}
        className="w-full rounded-lg border border-white/10 bg-surface-muted px-3 py-2 font-mono text-xs outline-none focus:border-accent"
      />
      {parseError && <p className="text-xs text-rose-400">{parseError}</p>}
      <div className="flex gap-2">
        <button
          onClick={buildPreview}
          disabled={!text.trim()}
          className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium hover:bg-white/5 disabled:opacity-40"
        >
          Preview
        </button>
        {preview && (
          <button
            onClick={runImport}
            disabled={importing}
            className="flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium hover:bg-accent-soft disabled:opacity-50"
          >
            <Upload size={12} /> {importing ? 'Importing…' : `Import ${preview.length} bill${preview.length === 1 ? '' : 's'}`}
          </button>
        )}
      </div>

      {preview && (
        <div className="max-h-64 overflow-y-auto rounded-lg border border-white/10">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-surface-muted text-slate-400">
              <tr>
                <th className="px-2 py-1.5">Name</th>
                <th className="px-2 py-1.5">Amount</th>
                <th className="px-2 py-1.5">Due</th>
                <th className="px-2 py-1.5">Category</th>
                <th className="px-2 py-1.5">Issues</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((row) => (
                <tr key={row.key} className="border-t border-white/5">
                  <td className="px-2 py-1.5">{row.raw.name || '—'}</td>
                  <td className="px-2 py-1.5">{row.raw.amount ?? '—'}</td>
                  <td className="px-2 py-1.5">{row.raw.due_date || '—'}</td>
                  <td className="px-2 py-1.5">
                    {row.category}
                    {row.willCreateCategory ? ' (new)' : ''}
                  </td>
                  <td className={`px-2 py-1.5 ${row.issues.length ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {row.issues.length ? row.issues.join('; ') : 'OK'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {results && (
        <div className="rounded-lg border border-white/10 bg-surface-muted p-3 text-xs">
          <p className="font-medium text-slate-200">
            Imported {results.billsOk} bill{results.billsOk === 1 ? '' : 's'}
            {results.billsFail ? `, ${results.billsFail} failed` : ''}.
          </p>
          {results.errors.length > 0 && (
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-rose-400">
              {results.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
