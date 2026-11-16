import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Copy, Check, AlertTriangle } from 'lucide-react';
import { api } from '../lib/api.js';
import { Card } from '../components/Card.jsx';
import { formatCurrency } from '../lib/format.js';
import { todayISO } from '../lib/dueDate.js';
import { SNAPSHOT_PROMPT } from '../lib/monarchPrompt.js';

const inputClass =
  'w-full rounded-lg border border-white/10 bg-surface-muted px-3 py-2 text-sm outline-none focus:border-accent';

// Claude usually answers with a ```json fenced block, and rich-text sources
// swap in smart quotes -- accept the paste as-is instead of making the user
// clean it up.
function extractJson(text) {
  const unfenced = text.replace(/```[a-zA-Z]*\s*/g, '');
  const start = unfenced.indexOf('{');
  const end = unfenced.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('No JSON object found in what you pasted.');
  const body = unfenced.slice(start, end + 1);
  try {
    return JSON.parse(body);
  } catch (err) {
    const fixed = body.replace(/[“”″]/g, '"').replace(/[‘’′]/g, "'").replace(/,(\s*[}\]])/g, '$1');
    try {
      return JSON.parse(fixed);
    } catch {
      throw new Error(`That isn't valid JSON (${err.message}).`);
    }
  }
}

const SOURCE_LABEL = {
  streams: 'Active recurring pay streams',
  average: '6-month average of paychecks',
  budget: 'Budgeted paychecks in Monarch',
};

export default function MonarchImport() {
  const [step, setStep] = useState('input');
  const [text, setText] = useState('');
  const [snapshot, setSnapshot] = useState(null);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState(null);
  const [result, setResult] = useState(null);

  // Decisions, keyed by Monarch account id / stream index.
  const [rows, setRows] = useState({});
  const [incomeChoice, setIncomeChoice] = useState('none');
  const [streamOn, setStreamOn] = useState({});

  useEffect(() => {
    api.monarch.status().then(setStatus).catch(() => {});
  }, []);

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(SNAPSHOT_PROMPT);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError('Copy was blocked by this browser -- select the prompt text above and copy it manually.');
    }
  };

  const runPreview = async () => {
    setError(null);
    setBusy(true);
    try {
      const parsed = extractJson(text);
      const p = await api.monarch.preview(parsed);
      setSnapshot(parsed);
      setPreview(p);
      const initial = {};
      for (const a of p.accounts) {
        initial[a.id] = {
          choice: a.match ? String(a.match.bill_id) : 'skip',
          balance: true,
          rate: a.rate != null,
          payment: Boolean(a.bill && Number(a.bill.amount) === 0 && a.minimum_payment != null),
          create: { name: a.name, due_date: '', amount: a.minimum_payment ?? '' },
        };
      }
      setRows(initial);
      setStreamOn(Object.fromEntries(p.income.streams.map((s, i) => [i, s.active])));
      setIncomeChoice(p.income.streams.some((s) => s.active) ? 'streams' : 'none');
      setStep('preview');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const setRow = (id, patch) => setRows((r) => ({ ...r, [id]: { ...r[id], ...patch } }));
  const setCreate = (id, patch) => setRows((r) => ({ ...r, [id]: { ...r[id], create: { ...r[id].create, ...patch } } }));

  const streamsTotal = useMemo(
    () => (preview ? preview.income.streams.reduce((sum, s, i) => sum + (streamOn[i] && s.monthly != null ? s.monthly : 0), 0) : 0),
    [preview, streamOn]
  );
  const incomeValue = !preview
    ? null
    : incomeChoice === 'streams' ? Math.round(streamsTotal * 100) / 100
    : incomeChoice === 'average' ? preview.income.average
    : incomeChoice === 'budget' ? preview.income.budget
    : null;

  const counts = useMemo(() => {
    const v = Object.values(rows);
    return {
      link: v.filter((r) => r.choice !== 'skip' && r.choice !== 'create').length,
      create: v.filter((r) => r.choice === 'create').length,
    };
  }, [rows]);
  const createMissingDate = Object.values(rows).some((r) => r.choice === 'create' && !r.create.due_date);

  const apply = async () => {
    setError(null);
    setBusy(true);
    try {
      const accounts = preview.accounts.map((a) => {
        const r = rows[a.id];
        const update = { balance: r.balance, rate: r.rate, payment: r.payment };
        if (r.choice === 'skip') return { account_id: a.id, action: 'skip' };
        if (r.choice === 'create') return { account_id: a.id, action: 'create', create: r.create, update };
        return { account_id: a.id, action: 'link', bill_id: Number(r.choice), update };
      });
      const res = await api.monarch.apply({
        snapshot,
        accounts,
        income: incomeValue != null && incomeChoice !== 'none' ? { source: incomeChoice, value: incomeValue } : null,
      });
      setResult(res);
      setStep('done');
      api.monarch.status().then(setStatus).catch(() => {});
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setStep('input'); setText(''); setSnapshot(null); setPreview(null); setResult(null); setError(null);
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Monarch Import</h2>
        <p className="text-sm text-slate-400">
          Bring in debt balances, APRs, and income figures from Monarch Money. You review everything before
          anything changes, and nothing is ever written back to Monarch.
        </p>
        {status?.last && (
          <p className="mt-1 text-xs text-slate-500">
            Last import: snapshot from {status.last.taken_at} ({status.last.summary}).
          </p>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" /> <span>{error}</span>
        </div>
      )}

      {step === 'input' && (
        <>
          <Card>
            <h3 className="mb-2 text-sm font-semibold text-slate-200">How to get a snapshot</h3>
            <ol className="list-decimal space-y-1.5 pl-5 text-sm text-slate-300">
              <li>Open a Claude conversation that has the Monarch Money connection enabled.</li>
              <li>Copy the prompt below and send it. Claude reads from Monarch (read-only) and replies with one JSON block.</li>
              <li>Copy Claude's whole reply (the code block is fine) and paste it into the box below.</li>
              <li>Click <strong>Preview</strong>, review and adjust, then <strong>Apply</strong>.</li>
            </ol>
            <textarea
              readOnly
              value={SNAPSHOT_PROMPT}
              rows={7}
              onFocus={(e) => e.target.select()}
              className="mt-3 w-full rounded-lg border border-white/10 bg-surface-muted px-3 py-2 font-mono text-xs text-slate-300 outline-none"
            />
            <button
              onClick={copyPrompt}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-sm hover:bg-white/5"
            >
              {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy prompt'}
            </button>
            <p className="mt-3 text-xs text-slate-500">
              The snapshot has balances and income figures only -- no transactions or full account numbers. It's
              stored in this add-on's database (the latest 5 are kept) and never leaves your Home Assistant.
            </p>
          </Card>

          <Card>
            <h3 className="mb-2 text-sm font-semibold text-slate-200">Paste Claude's reply</h3>
            <textarea
              value={text}
              onChange={(e) => { setText(e.target.value); setError(null); }}
              rows={10}
              placeholder='{ "version": 1, "taken_at": "...", ... }'
              className="w-full rounded-lg border border-white/10 bg-surface-muted px-3 py-2 font-mono text-xs outline-none focus:border-accent"
            />
            <button
              onClick={runPreview}
              disabled={!text.trim() || busy}
              className="mt-3 rounded-lg bg-accent px-4 py-2 text-sm font-medium hover:bg-accent-soft disabled:opacity-40"
            >
              {busy ? 'Checking…' : 'Preview'}
            </button>
          </Card>
        </>
      )}

      {step === 'preview' && preview && (
        <>
          <p className="text-sm text-slate-300">
            Snapshot from <strong>{preview.taken_at}</strong>: {preview.accounts.length} account{preview.accounts.length === 1 ? '' : 's'},{' '}
            {preview.income.streams.length} income stream{preview.income.streams.length === 1 ? '' : 's'}. Nothing has changed yet.
          </p>

          {preview.warnings.length > 0 && (
            <div className="space-y-1 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              {preview.warnings.map((w, i) => <p key={i}>{w}</p>)}
            </div>
          )}

          <Card>
            <h3 className="mb-1 text-sm font-semibold text-slate-200">Monthly income</h3>
            <p className="mb-3 text-xs text-slate-500">
              Pick which figure becomes your average monthly income on the Monthly Budget page. These can differ a
              lot -- prefer the lower of a current stream total and a long average if your pay varies.
            </p>
            <div className="space-y-2 text-sm">
              <Radio checked={incomeChoice === 'streams'} onChange={() => setIncomeChoice('streams')}
                label={SOURCE_LABEL.streams} value={streamsTotal} />
              {incomeChoice === 'streams' && (
                <div className="ml-6 space-y-1 rounded-lg bg-surface-muted p-2 text-xs">
                  {preview.income.streams.length === 0 && <p className="text-slate-500">No recurring income streams in this snapshot.</p>}
                  {preview.income.streams.map((s, i) => (
                    <label key={i} className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2">
                        <input type="checkbox" checked={Boolean(streamOn[i])} disabled={s.monthly == null}
                          onChange={(e) => setStreamOn((o) => ({ ...o, [i]: e.target.checked }))} />
                        <span className={s.active ? 'text-slate-200' : 'text-slate-500'}>
                          {s.name} ({s.frequency})
                        </span>
                      </span>
                      <span className="text-right text-slate-400">
                        {s.monthly != null ? `${formatCurrency(s.monthly)}/mo` : '—'}
                        {s.reason && <span className="ml-2 text-amber-400">{s.reason}</span>}
                      </span>
                    </label>
                  ))}
                </div>
              )}
              <Radio checked={incomeChoice === 'average'} onChange={() => setIncomeChoice('average')}
                label={SOURCE_LABEL.average} value={preview.income.average} disabled={preview.income.average == null} />
              <Radio checked={incomeChoice === 'budget'} onChange={() => setIncomeChoice('budget')}
                label={SOURCE_LABEL.budget} value={preview.income.budget} disabled={preview.income.budget == null} />
              <Radio checked={incomeChoice === 'none'} onChange={() => setIncomeChoice('none')} label="Don't change my income" />
            </div>
          </Card>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-200">Debt accounts</h3>
            <div className="space-y-3">
              {preview.accounts.length === 0 && <p className="text-sm text-slate-500">No accounts in this snapshot.</p>}
              {preview.accounts.map((a) => {
                const r = rows[a.id];
                if (!r) return null;
                const linking = r.choice !== 'skip' && r.choice !== 'create';
                const bill = linking ? preview.bills.find((b) => String(b.id) === r.choice) : null;
                const current = a.match && String(a.match.bill_id) === r.choice ? a.bill : null;
                return (
                  <Card key={a.id} className="space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{a.name}</p>
                        <p className="text-xs text-slate-400">{a.type || 'Account'}</p>
                      </div>
                      <div className="text-right text-xs text-slate-300">
                        <p className="text-sm font-medium">{formatCurrency(a.owed)} owed</p>
                        <p className="text-slate-400">
                          {a.rate != null ? `${Number(a.rate).toFixed(2)}% APR` : 'no APR'} ·{' '}
                          {a.minimum_payment != null ? `${formatCurrency(a.minimum_payment)} min` : 'no min payment'}
                        </p>
                      </div>
                    </div>
                    {a.warnings.length > 0 && (
                      <ul className="list-disc space-y-0.5 pl-4 text-xs text-amber-300/90">
                        {a.warnings.map((w, i) => <li key={i}>{w}</li>)}
                      </ul>
                    )}
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-slate-400">
                        Household Hub bill {a.match && <span className="text-emerald-400">({a.match.confidence === 'linked' ? 'already linked' : `${a.match.confidence} match`})</span>}
                      </span>
                      <select value={r.choice} onChange={(e) => setRow(a.id, { choice: e.target.value })} className={inputClass}>
                        <option value="skip">Skip this account</option>
                        <option value="create">Create a new bill…</option>
                        {preview.bills.map((b) => (
                          <option key={b.id} value={String(b.id)}>
                            {b.name}{b.monarch_account_id && b.monarch_account_id !== a.id ? ' (linked to another account)' : ''}
                          </option>
                        ))}
                      </select>
                    </label>
                    {r.choice === 'create' && (
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                        <input className={inputClass} value={r.create.name} onChange={(e) => setCreate(a.id, { name: e.target.value })} placeholder="Bill name" />
                        <label className="block">
                          <span className="mb-0.5 block text-[10px] uppercase tracking-wide text-slate-500">Next due date (required)</span>
                          <input type="date" className={inputClass} value={r.create.due_date} min={todayISO()}
                            onChange={(e) => setCreate(a.id, { due_date: e.target.value })} />
                        </label>
                        <label className="block">
                          <span className="mb-0.5 block text-[10px] uppercase tracking-wide text-slate-500">Monthly payment</span>
                          <input type="number" step="0.01" min="0" className={inputClass} value={r.create.amount}
                            onChange={(e) => setCreate(a.id, { amount: e.target.value })} />
                        </label>
                      </div>
                    )}
                    {r.choice !== 'skip' && (
                      <div className="space-y-1 text-xs text-slate-300">
                        <Check2 checked={r.balance} onChange={(v) => setRow(a.id, { balance: v })}>
                          Update balance{current ? ` (${current.current_balance != null ? formatCurrency(current.current_balance) : 'none'} → ${formatCurrency(a.owed)})` : ` to ${formatCurrency(a.owed)}`}
                        </Check2>
                        {a.rate != null && (
                          <Check2 checked={r.rate} onChange={(v) => setRow(a.id, { rate: v })}>
                            Update APR{current ? ` (${current.interest_rate != null ? `${Number(current.interest_rate).toFixed(2)}%` : 'none'} → ${Number(a.rate).toFixed(2)}%)` : ` to ${Number(a.rate).toFixed(2)}%`}
                          </Check2>
                        )}
                        {a.minimum_payment != null && r.choice !== 'create' && (
                          <Check2 checked={r.payment} onChange={(v) => setRow(a.id, { payment: v })}>
                            Set the bill's payment amount to the minimum {formatCurrency(a.minimum_payment)}
                            {current ? ` (now ${formatCurrency(current.amount)})` : ''}
                          </Check2>
                        )}
                        {bill && !bill.category_is_debt && (
                          <p className="text-amber-300/90">This bill's category isn't marked as debt (Settings), so it won't appear on Debt Management.</p>
                        )}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          </div>

          <div className="sticky bottom-0 -mx-1 flex flex-wrap items-center gap-3 rounded-lg border border-white/10 bg-surface-raised px-4 py-3">
            <p className="mr-auto text-xs text-slate-300">
              {counts.link} to link · {counts.create} to create ·{' '}
              {incomeValue != null && incomeChoice !== 'none' ? `income ${formatCurrency(incomeValue)}/mo` : 'income unchanged'}
            </p>
            <button onClick={reset} disabled={busy} className="rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-white/5">Start over</button>
            <button
              onClick={apply}
              disabled={busy || createMissingDate}
              title={createMissingDate ? 'Enter a due date for each bill you are creating' : undefined}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium hover:bg-accent-soft disabled:opacity-40"
            >
              {busy ? 'Applying…' : 'Apply'}
            </button>
          </div>
        </>
      )}

      {step === 'done' && result && (
        <Card>
          <h3 className="text-sm font-semibold text-emerald-300">Import applied</h3>
          <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-slate-300">
            <li>{result.linked} bill{result.linked === 1 ? '' : 's'} linked, {result.created} created</li>
            <li>{result.balances_updated} balance{result.balances_updated === 1 ? '' : 's'} updated</li>
            <li>{result.income_set ? 'Monthly income updated' : 'Monthly income unchanged'}</li>
          </ul>
          <div className="mt-4 flex flex-wrap gap-2 text-sm">
            <Link to="/debt-management" className="rounded-lg border border-white/10 px-3 py-1.5 hover:bg-white/5">Debt Management</Link>
            <Link to="/budget" className="rounded-lg border border-white/10 px-3 py-1.5 hover:bg-white/5">Monthly Budget</Link>
            <Link to="/bills" className="rounded-lg border border-white/10 px-3 py-1.5 hover:bg-white/5">Bills</Link>
            <button onClick={reset} className="rounded-lg px-3 py-1.5 text-slate-300 hover:bg-white/5">Import another</button>
          </div>
        </Card>
      )}
    </div>
  );
}

function Radio({ checked, onChange, label, value, disabled }) {
  return (
    <label className={`flex items-center justify-between gap-2 ${disabled ? 'opacity-40' : ''}`}>
      <span className="flex items-center gap-2">
        <input type="radio" name="income-source" checked={checked} onChange={onChange} disabled={disabled} />
        {label}
      </span>
      {value != null && <span className="text-slate-300">{formatCurrency(value)}/mo</span>}
      {value == null && disabled && <span className="text-xs text-slate-500">not in snapshot</span>}
    </label>
  );
}

function Check2({ checked, onChange, children }) {
  return (
    <label className="flex items-start gap-2">
      <input type="checkbox" className="mt-0.5" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{children}</span>
    </label>
  );
}
