import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { Card } from '../components/Card.jsx';
import { formatCurrency } from '../lib/format.js';

const inputClass =
  'w-full rounded-lg border border-white/10 bg-surface-muted px-2 py-1.5 text-sm outline-none focus:border-accent';

export default function MonarchReview() {
  const [tab, setTab] = useState('payments');
  const [data, setData] = useState({ payments: null, recurring: null });
  const [bills, setBills] = useState([]);
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = () =>
    Promise.all([api.monarch.suggestions(), api.monarch.reconcile(), api.bills.list(), api.categories.list()])
      .then(([payments, recurring, b, c]) => {
        setData({ payments, recurring });
        setBills(b);
        setCategories(c);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  if (loading) return <p className="text-slate-400">Loading…</p>;

  const takenAt = data.payments?.taken_at;
  const nPayments = data.payments?.suggestions.length || 0;
  const nRecurring =
    (data.recurring?.new.filter((n) => n.can_add).length || 0) + (data.recurring?.matched.filter((m) => m.drift).length || 0);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Monarch Review</h2>
        <p className="text-sm text-slate-400">
          Payments Monarch saw that you haven't logged here, and how Monarch's recurring bills compare with yours.
          Nothing changes until you confirm, and nothing is written to Monarch.
        </p>
        {takenAt && <p className="mt-1 text-xs text-slate-500">Based on the snapshot from {takenAt}.</p>}
      </div>

      {error && <p className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p>}
      {notice && <p className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">{notice}</p>}

      {!takenAt ? (
        <Card>
          <p className="text-sm text-slate-300">
            No snapshot yet. <Link to="/monarch" className="text-accent-soft hover:underline">Import one from Monarch</Link>{' '}
            first -- include the recurring expenses and recent transactions the prompt asks for.
          </p>
        </Card>
      ) : (
        <>
          <div className="flex gap-2 border-b border-white/10">
            {[
              ['payments', `Suggested payments${nPayments ? ` (${nPayments})` : ''}`],
              ['recurring', `Recurring bills${nRecurring ? ` (${nRecurring})` : ''}`],
            ].map(([key, label]) => (
              <button
                key={key}
                onClick={() => { setTab(key); setNotice(null); setError(null); }}
                className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
                  tab === key ? 'border-accent text-white' : 'border-transparent text-slate-400 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === 'payments' && (
            <Payments
              data={data.payments}
              bills={bills}
              onDone={(msg) => { setNotice(msg); setError(null); load(); }}
              onError={(msg) => { setError(msg); setNotice(null); }}
              onReload={load}
            />
          )}
          {tab === 'recurring' && (
            <Recurring
              data={data.recurring}
              categories={categories}
              onDone={(msg) => { setNotice(msg); setError(null); load(); }}
              onError={(msg) => { setError(msg); setNotice(null); }}
            />
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- payments ---

function Payments({ data, bills, onDone, onError, onReload }) {
  const suggestions = data.suggestions;
  const [picked, setPicked] = useState({});
  const [target, setTarget] = useState({});
  const [busy, setBusy] = useState(false);

  // High-confidence matches start ticked; "likely" ones need a deliberate click.
  useEffect(() => {
    // Keep what the user already ticked/changed when the list reloads (e.g. after
    // dismissing one row); only new rows get the defaults.
    setPicked((prev) => Object.fromEntries(suggestions.map((s) => [s.transaction.id, prev[s.transaction.id] ?? s.confidence === 'high'])));
    setTarget((prev) => Object.fromEntries(suggestions.map((s) => [s.transaction.id, prev[s.transaction.id] ?? String(s.bill.id)])));
  }, [data]);

  const openBills = useMemo(() => bills.filter((b) => b.recurrence !== 'once' || b.status !== 'paid'), [bills]);
  const chosen = suggestions.filter((s) => picked[s.transaction.id]);
  const total = chosen.reduce((sum, s) => sum + s.transaction.amount, 0);

  const apply = async () => {
    setBusy(true);
    try {
      const r = await api.monarch.applySuggestions(
        chosen.map((s) => ({ transaction_id: s.transaction.id, bill_id: Number(target[s.transaction.id]) }))
      );
      if (r.failed.length) {
        onError(`${r.applied} logged, ${r.failed.length} failed: ${r.failed.map((f) => f.error).join(' ')}`);
        onReload();
      } else {
        onDone(`Logged ${r.applied} payment${r.applied === 1 ? '' : 's'}.`);
      }
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const dismiss = async (id) => {
    try {
      await api.monarch.dismissSuggestion(id);
      onDone(null);
    } catch (err) {
      onError(err.message);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        Matched by merchant name and amount against your unpaid bills (credit cards and loans accept larger payments than
        the minimum). Each logged payment uses Monarch's date and amount, and can be undone from the bill's history.
        {data.already_logged > 0 && ` ${data.already_logged} transaction${data.already_logged === 1 ? ' was' : 's were'} skipped because you'd already logged them.`}
      </p>

      {suggestions.length === 0 && (
        <Card>
          <p className="text-sm text-slate-400">
            Nothing to log: no recent Monarch transactions match an unpaid bill. (The snapshot needs a transactions
            section -- re-run the import prompt if you expected some.)
          </p>
        </Card>
      )}

      {suggestions.map((s) => {
        const id = s.transaction.id;
        return (
          <Card key={id} className="space-y-2">
            <div className="flex items-start gap-3">
              <input type="checkbox" className="mt-1" checked={Boolean(picked[id])}
                onChange={(e) => setPicked((p) => ({ ...p, [id]: e.target.checked }))} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{s.transaction.merchant}</p>
                    <p className="text-xs text-slate-400">
                      {s.transaction.date}{s.transaction.account ? ` · ${s.transaction.account}` : ''}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">{formatCurrency(s.transaction.amount)}</p>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      s.confidence === 'high' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'
                    }`}>
                      {s.confidence === 'high' ? 'Strong match' : 'Likely match'}
                    </span>
                  </div>
                </div>
                <label className="mt-2 block">
                  <span className="mb-0.5 block text-[10px] uppercase tracking-wide text-slate-500">
                    Pays this bill (due {s.cycle_due})
                  </span>
                  <select className={inputClass} value={target[id] || ''}
                    onChange={(e) => setTarget((t) => ({ ...t, [id]: e.target.value }))}>
                    {openBills.map((b) => (
                      <option key={b.id} value={String(b.id)}>{b.name} · {formatCurrency(b.amount)}</option>
                    ))}
                  </select>
                </label>
                {s.amount_diff !== 0 && (
                  <p className="mt-1 text-xs text-amber-300/90">
                    {s.amount_diff > 0 ? `${formatCurrency(s.amount_diff)} more` : `${formatCurrency(-s.amount_diff)} less`} than the bill amount.
                  </p>
                )}
              </div>
              <button onClick={() => dismiss(id)} title="Not a bill payment -- don't suggest again"
                className="text-xs text-slate-500 hover:text-rose-400">Dismiss</button>
            </div>
          </Card>
        );
      })}

      {suggestions.length > 0 && (
        <div className="sticky bottom-0 flex flex-wrap items-center gap-3 rounded-lg border border-white/10 bg-surface-raised px-4 py-3">
          <p className="mr-auto text-xs text-slate-300">
            {chosen.length} selected · {formatCurrency(total)}
          </p>
          <button
            onClick={() => setPicked(Object.fromEntries(suggestions.map((s) => [s.transaction.id, true])))}
            className="text-xs text-slate-400 hover:text-white"
          >Select all</button>
          <button
            onClick={apply}
            disabled={busy || chosen.length === 0}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium hover:bg-accent-soft disabled:opacity-40"
          >
            {busy ? 'Logging…' : `Log ${chosen.length} payment${chosen.length === 1 ? '' : 's'}`}
          </button>
        </div>
      )}
    </div>
  );
}

// --------------------------------------------------------------- recurring ---

function Recurring({ data, categories, onDone, onError }) {
  const drifts = data.matched.filter((m) => m.drift && m.new_amount != null);
  const nameMatched = data.matched.filter((m) => m.how === 'name');
  const [driftOn, setDriftOn] = useState({});
  const [adds, setAdds] = useState({});
  const [busy, setBusy] = useState(false);
  const [showStale, setShowStale] = useState(false);

  useEffect(() => {
    // Preserve in-progress choices across reloads (ignoring one stream must not
    // wipe what was ticked or typed on the others).
    setDriftOn((prev) => Object.fromEntries(drifts.map((m) => [m.stream.id, prev[m.stream.id] ?? true])));
    setAdds((prev) =>
      Object.fromEntries(
        data.new
          .filter((n) => n.can_add)
          .map((n) => [n.stream.id, prev[n.stream.id] ?? { on: false, ...n.suggested, due_date: n.suggested.due_date || '' }])
      )
    );
  }, [data]);

  const setAdd = (id, patch) => setAdds((a) => ({ ...a, [id]: { ...a[id], ...patch } }));
  const addsOn = Object.entries(adds).filter(([, v]) => v.on);
  const missingDate = addsOn.some(([, v]) => !v.due_date);
  const pending = drifts.filter((m) => driftOn[m.stream.id]).length + addsOn.length;

  const apply = async () => {
    setBusy(true);
    try {
      const actions = [
        // Remember name-based matches so a rename on either side doesn't break them.
        ...nameMatched.map((m) => ({ type: 'link', bill_id: m.bill.id, stream_id: m.stream.id })),
        ...drifts.filter((m) => driftOn[m.stream.id]).map((m) => ({ type: 'update_amount', bill_id: m.bill.id, stream_id: m.stream.id, amount: m.new_amount })),
        ...addsOn.map(([streamId, v]) => ({
          type: 'add', stream_id: streamId, name: v.name, amount: v.amount, recurrence: v.recurrence, due_date: v.due_date, category: v.category,
        })),
      ];
      const r = await api.monarch.applyReconcile(actions);
      onDone(`${r.added} bill${r.added === 1 ? '' : 's'} added, ${r.updated} amount${r.updated === 1 ? '' : 's'} updated, ${r.linked} match${r.linked === 1 ? '' : 'es'} remembered.`);
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const ignore = async (streamId) => {
    try {
      await api.monarch.applyReconcile([{ type: 'ignore', stream_id: streamId }]);
      onDone(null);
    } catch (err) {
      onError(err.message);
    }
  };

  return (
    <div className="space-y-6">
      <datalist id="review-categories">
        {categories.map((c) => <option key={c.id} value={c.name} />)}
      </datalist>

      <section>
        <h3 className="mb-1 text-sm font-semibold text-slate-200">Price changes</h3>
        <p className="mb-2 text-xs text-slate-500">Bills whose amount in Monarch differs from yours by more than ~2%.</p>
        {drifts.length === 0 && <p className="text-sm text-slate-500">None -- your amounts agree with Monarch.</p>}
        <div className="space-y-2">
          {drifts.map((m) => (
            <Card key={m.stream.id}>
              <label className="flex items-start gap-3">
                <input type="checkbox" className="mt-1" checked={Boolean(driftOn[m.stream.id])}
                  onChange={(e) => setDriftOn((d) => ({ ...d, [m.stream.id]: e.target.checked }))} />
                <div className="text-sm">
                  <p className="font-medium">{m.bill.name}</p>
                  <p className="text-xs text-slate-400">
                    {formatCurrency(m.bill.amount)} here → <strong className="text-slate-200">{formatCurrency(m.new_amount)}</strong> in Monarch{' '}
                    <span className={m.diff > 0 ? 'text-rose-300' : 'text-emerald-300'}>({m.diff > 0 ? '+' : ''}{formatCurrency(m.diff)})</span>
                  </p>
                </div>
              </label>
            </Card>
          ))}
        </div>
        {data.matched.some((m) => m.drift && m.new_amount == null) && (
          <p className="mt-2 text-xs text-slate-500">
            Some matched bills differ in how often they recur (weekly vs monthly); check those by hand.
          </p>
        )}
      </section>

      <section>
        <h3 className="mb-1 text-sm font-semibold text-slate-200">In Monarch but not tracked here</h3>
        <p className="mb-2 text-xs text-slate-500">Recurring expenses paid in the last ~2.5 months with no matching bill.</p>
        {data.new.length === 0 && <p className="text-sm text-slate-500">Nothing new.</p>}
        <div className="space-y-2">
          {data.new.map((n) => {
            const a = adds[n.stream.id];
            return (
              <Card key={n.stream.id} className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{n.stream.name}</p>
                    <p className="text-xs text-slate-400">
                      {formatCurrency(n.stream.amount)} {n.stream.frequency} · {n.stream.category || 'uncategorized'}
                      {n.stream.next_date ? ` · next ${n.stream.next_date}` : ''}
                    </p>
                  </div>
                  <button onClick={() => ignore(n.stream.id)} className="text-xs text-slate-500 hover:text-rose-400">Ignore</button>
                </div>
                {!n.can_add && <p className="text-xs text-amber-300/90">Unrecognized frequency "{n.stream.frequency}" -- add this one by hand on the Bills page.</p>}
                {a && (
                  <>
                    <label className="flex items-center gap-2 text-xs text-slate-300">
                      <input type="checkbox" checked={a.on} onChange={(e) => setAdd(n.stream.id, { on: e.target.checked })} /> Add as a bill
                    </label>
                    {a.on && (
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <input className={`${inputClass} col-span-2 sm:col-span-1`} value={a.name} onChange={(e) => setAdd(n.stream.id, { name: e.target.value })} placeholder="Name" />
                        <input className={inputClass} type="number" step="0.01" min="0" value={a.amount} onChange={(e) => setAdd(n.stream.id, { amount: e.target.value })} />
                        <input className={inputClass} type="date" value={a.due_date} onChange={(e) => setAdd(n.stream.id, { due_date: e.target.value })} title="Next due date (required)" />
                        <input className={inputClass} list="review-categories" value={a.category} onChange={(e) => setAdd(n.stream.id, { category: e.target.value })} placeholder="Category" />
                      </div>
                    )}
                    {a.on && n.suggested.note && <p className="text-xs text-slate-500">Monarch has this as {n.suggested.note}.</p>}
                  </>
                )}
              </Card>
            );
          })}
        </div>
      </section>

      <section>
        <h3 className="mb-1 text-sm font-semibold text-slate-200">Tracked here but not seen in Monarch</h3>
        <p className="mb-2 text-xs text-slate-500">
          No matching recurring expense. They may be cancelled, paid another way, or just named differently -- worth a look
          on the <Link to="/budget" className="text-accent-soft hover:underline">Monthly Budget</Link> reduction list.
        </p>
        {data.unseen.length === 0 && <p className="text-sm text-slate-500">Every recurring bill has a match.</p>}
        <div className="space-y-1">
          {data.unseen.map((b) => (
            <div key={b.id} className="flex items-center justify-between rounded-lg bg-surface-raised px-3 py-2 text-sm">
              <span>{b.name}{Boolean(b.autopay) && <span className="ml-1.5 rounded bg-accent/15 px-1 py-0.5 text-[10px] text-accent-soft">Autopay</span>}</span>
              <span className="text-slate-400">{formatCurrency(b.amount)} {b.recurrence}</span>
            </div>
          ))}
        </div>
      </section>

      {data.stale.length > 0 && (
        <section>
          <button onClick={() => setShowStale((v) => !v)} className="text-xs text-slate-400 hover:text-white">
            {showStale ? 'Hide' : 'Show'} {data.stale.length} stale stream{data.stale.length === 1 ? '' : 's'} in Monarch (ignored here)
          </button>
          {showStale && (
            <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-slate-400">
              {data.stale.map((s) => <li key={s.stream.id}>{s.stream.name} -- {s.reason}</li>)}
            </ul>
          )}
        </section>
      )}

      <div className="sticky bottom-0 flex flex-wrap items-center gap-3 rounded-lg border border-white/10 bg-surface-raised px-4 py-3">
        <p className="mr-auto text-xs text-slate-300">
          {pending} change{pending === 1 ? '' : 's'} selected
          {nameMatched.length > 0 && ` · ${nameMatched.length} name match${nameMatched.length === 1 ? '' : 'es'} will be remembered`}
        </p>
        <button
          onClick={apply}
          disabled={busy || (pending === 0 && nameMatched.length === 0) || missingDate}
          title={missingDate ? 'Enter a due date for each bill you are adding' : undefined}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium hover:bg-accent-soft disabled:opacity-40"
        >
          {busy ? 'Applying…' : 'Apply'}
        </button>
      </div>
    </div>
  );
}
