import React, { useEffect, useState } from 'react';
import { Upload, Trash2, Plus } from 'lucide-react';
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

const emptyRow = (key) => ({
  key,
  name: '',
  amount: '',
  due_date: '',
  category: 'Other',
  recurrence: 'monthly',
  assigned_to: '',
  autopay: false,
  notes: '',
});

let nextKey = 1;

function rowIssues(row) {
  const issues = [];
  if (!row.name.trim()) issues.push('missing name');
  if (row.amount === '' || isNaN(Number(row.amount))) issues.push('missing/invalid amount');
  if (!row.due_date) issues.push('missing due date');
  return issues;
}

// Client-side only: everything is editable in the preview table before
// Import runs, including recurrence, so a pasted list is a starting point
// rather than final. Loops the existing bill/category create endpoints per
// row -- no new backend endpoint, and a modest paste-in list (dozens, not
// thousands, of rows) is well within what looping the existing routes
// handles fine.
export default function BulkImportBills({ onImported }) {
  const [text, setText] = useState('');
  const [parseError, setParseError] = useState(null);
  const [rows, setRows] = useState(null);
  const [members, setMembers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState(null);

  useEffect(() => {
    api.members.list().then(setMembers);
    api.categories.list().then(setCategories);
  }, []);

  const loadFromText = () => {
    setParseError(null);
    setResults(null);
    let data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      setParseError(`Invalid JSON: ${err.message}`);
      return;
    }
    const parsedRows = Array.isArray(data) ? data : data.bills;
    if (!Array.isArray(parsedRows)) {
      setParseError('Expected a JSON array of bills, or an object like { "bills": [...] }.');
      return;
    }

    const memberByName = new Map(members.map((m) => [m.name.toLowerCase(), m]));
    setRows(
      parsedRows.map((raw) => {
        const matched = raw.assigned_to_name ? memberByName.get(String(raw.assigned_to_name).toLowerCase()) : null;
        return {
          key: nextKey++,
          name: raw.name || '',
          amount: raw.amount ?? '',
          due_date: raw.due_date || '',
          category: raw.category || 'Other',
          recurrence: raw.recurrence || 'monthly',
          assigned_to: matched ? String(matched.id) : '',
          autopay: !!raw.autopay,
          notes: raw.notes || '',
        };
      })
    );
  };

  const updateRow = (key, field, value) => {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
  };

  const removeRow = (key) => {
    setRows((rs) => rs.filter((r) => r.key !== key));
  };

  const addRow = () => {
    setResults(null);
    setRows((rs) => [...(rs || []), emptyRow(nextKey++)]);
  };

  const runImport = async () => {
    if (!rows || !rows.length) return;
    setImporting(true);
    const summary = { billsOk: 0, billsFail: 0, errors: [] };

    const newCategories = [...new Set(rows.map((r) => r.category.trim()).filter(Boolean))];
    for (const name of newCategories) {
      try {
        await api.categories.create(name);
      } catch (err) {
        summary.errors.push(`Category "${name}": ${err.message}`);
      }
    }

    for (const row of rows) {
      const issues = rowIssues(row);
      if (issues.length) {
        summary.billsFail++;
        summary.errors.push(`${row.name || '(unnamed)'}: ${issues.join(', ')}`);
        continue;
      }
      try {
        await api.bills.create({
          name: row.name.trim(),
          amount: Number(row.amount),
          category: row.category.trim() || 'Other',
          recurrence: row.recurrence,
          due_date: row.due_date,
          autopay: row.autopay,
          assigned_to: row.assigned_to ? Number(row.assigned_to) : null,
          notes: row.notes || '',
        });
        summary.billsOk++;
      } catch (err) {
        summary.billsFail++;
        summary.errors.push(`${row.name}: ${err.message}`);
      }
    }

    setResults(summary);
    setRows(null);
    setText('');
    setImporting(false);
    api.categories.list().then(setCategories);
    onImported?.();
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        Paste a JSON array of bills (or <code>{'{ "bills": [...] }'}</code>) to load a starting list, or
        just click "Add row" below to build one by hand. Everything is editable before you import --
        this runs entirely against your own instance; nothing is sent anywhere else.
      </p>
      {!rows && (
        <>
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setParseError(null);
            }}
            placeholder={PLACEHOLDER}
            rows={8}
            className="w-full rounded-lg border border-white/10 bg-surface-muted px-3 py-2 font-mono text-xs outline-none focus:border-accent"
          />
          {parseError && <p className="text-xs text-rose-400">{parseError}</p>}
          <div className="flex gap-2">
            <button
              onClick={loadFromText}
              disabled={!text.trim()}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium hover:bg-white/5 disabled:opacity-40"
            >
              Load for editing
            </button>
            <button
              onClick={addRow}
              className="flex items-center gap-1 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium hover:bg-white/5"
            >
              <Plus size={12} /> Start blank
            </button>
          </div>
        </>
      )}

      {rows && (
        <>
          <div className="max-h-96 overflow-auto rounded-lg border border-white/10">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-surface-muted text-slate-400">
                <tr>
                  <th className="px-2 py-1.5">Name</th>
                  <th className="px-2 py-1.5">Amount</th>
                  <th className="px-2 py-1.5">Due date</th>
                  <th className="px-2 py-1.5">Recurrence</th>
                  <th className="px-2 py-1.5">Category</th>
                  <th className="px-2 py-1.5">Assigned</th>
                  <th className="px-2 py-1.5">Notes</th>
                  <th className="px-2 py-1.5" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const issues = rowIssues(row);
                  return (
                    <tr key={row.key} className="border-t border-white/5 align-top">
                      <td className="px-2 py-1.5">
                        <input
                          value={row.name}
                          onChange={(e) => updateRow(row.key, 'name', e.target.value)}
                          className={cellInputClass(!row.name.trim())}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="number"
                          step="0.01"
                          value={row.amount}
                          onChange={(e) => updateRow(row.key, 'amount', e.target.value)}
                          className={`w-20 ${cellInputClass(row.amount === '' || isNaN(Number(row.amount)))}`}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="date"
                          value={row.due_date}
                          onChange={(e) => updateRow(row.key, 'due_date', e.target.value)}
                          className={cellInputClass(!row.due_date)}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <select
                          value={row.recurrence}
                          onChange={(e) => updateRow(row.key, 'recurrence', e.target.value)}
                          className={cellInputClass(false)}
                        >
                          <option value="once">One-time</option>
                          <option value="weekly">Weekly</option>
                          <option value="monthly">Monthly</option>
                          <option value="yearly">Yearly</option>
                        </select>
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          value={row.category}
                          onChange={(e) => updateRow(row.key, 'category', e.target.value)}
                          list="bulk-import-categories"
                          className={`w-24 ${cellInputClass(false)}`}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <select
                          value={row.assigned_to}
                          onChange={(e) => updateRow(row.key, 'assigned_to', e.target.value)}
                          className={cellInputClass(false)}
                        >
                          <option value="">Unassigned</option>
                          {members.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          value={row.notes}
                          onChange={(e) => updateRow(row.key, 'notes', e.target.value)}
                          className={`w-32 ${cellInputClass(false)}`}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <button onClick={() => removeRow(row.key)} className="text-slate-500 hover:text-rose-400">
                          <Trash2 size={14} />
                        </button>
                        {issues.length > 0 && (
                          <p className="mt-1 text-[10px] leading-tight text-amber-400">{issues.join('; ')}</p>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <datalist id="bulk-import-categories">
            {categories.map((c) => (
              <option key={c.id} value={c.name} />
            ))}
          </datalist>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={addRow}
              className="flex items-center gap-1 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium hover:bg-white/5"
            >
              <Plus size={12} /> Add row
            </button>
            <button
              onClick={runImport}
              disabled={importing || rows.length === 0}
              className="flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium hover:bg-accent-soft disabled:opacity-50"
            >
              <Upload size={12} /> {importing ? 'Importing…' : `Import ${rows.length} bill${rows.length === 1 ? '' : 's'}`}
            </button>
            <button
              onClick={() => setRows(null)}
              disabled={importing}
              className="rounded-lg px-3 py-1.5 text-xs text-slate-400 hover:bg-white/5"
            >
              Cancel
            </button>
          </div>
        </>
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

function cellInputClass(invalid) {
  return `w-full rounded border bg-surface px-1.5 py-1 text-xs outline-none focus:border-accent ${
    invalid ? 'border-rose-500/50' : 'border-white/10'
  }`;
}
