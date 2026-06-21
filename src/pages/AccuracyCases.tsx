import React, { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../context/AuthContext';
import {
  ShieldCheck, Plus, X, AlertCircle, Trash2, Edit2, MessageSquare, Check, ChevronDown
} from 'lucide-react';

type Case = {
  id: number;
  qa_id: number;
  qa_name: string;
  tl_id: number;
  tl_name: string;
  evaluation_id: number | null;
  title: string;
  description: string | null;
  severity: 'low' | 'medium' | 'high';
  qa_share: number;
  status: 'open' | 'disputed' | 'resolved' | 'dismissed';
  qa_comment: string | null;
  supervisor_note: string | null;
  created_at: string;
  resolved_at: string | null;
};

const SEVERITIES = ['low', 'medium', 'high'] as const;
const STATUSES = ['open', 'disputed', 'resolved', 'dismissed'] as const;

function fmt(ts: string | null): string {
  if (!ts) return '—';
  try {
    const d = new Date(ts);
    return isNaN(d.getTime()) ? ts : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return ts; }
}

function statusColor(s: string): string {
  switch (s) {
    case 'open': return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30';
    case 'disputed': return 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30';
    case 'resolved': return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30';
    case 'dismissed': return 'bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-300 dark:border-zinc-700';
    default: return 'bg-zinc-100 text-zinc-600 border-zinc-200';
  }
}

function sevColor(s: string): string {
  switch (s) {
    case 'low': return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30';
    case 'medium': return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30';
    case 'high': return 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30';
    default: return '';
  }
}

export default function AccuracyCases() {
  const { user } = useAuth();
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Case | null>(null);

  const isTL = user?.role === 'tl';
  const isSupervisor = user?.role === 'supervisor';
  const isQA = user?.role === 'qa';

  const fetchCases = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      // QAs see only their own cases; TLs see only ones they raised;
      // supervisors see everything.
      if (isQA && user) params.set('qa_id', String(user.id));
      if (isTL && user) params.set('tl_id', String(user.id));
      const res = await fetch(`/api/accuracy-cases?${params}`);
      if (!res.ok) throw new Error('fetch failed');
      const data = await res.json();
      setCases(data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [statusFilter, isQA, isTL, user]);

  useEffect(() => { fetchCases(); }, [fetchCases]);

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-zinc-900 dark:text-white tracking-tighter flex items-center gap-3 italic uppercase">
            <ShieldCheck className="text-indigo-600" size={28} />
            Accuracy Cases
          </h1>
          <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest mt-2">
            {isTL ? 'Cases you raised against QAs' : isQA ? 'Cases raised against you' : 'All accuracy cases in the system'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <select
              className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-3 pr-8 py-2 text-xs font-bold text-zinc-700 dark:text-zinc-300 outline-none cursor-pointer appearance-none"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All statuses</option>
              {STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" size={12} />
          </div>
          {(isTL || isSupervisor) && (
            <button
              onClick={() => setShowCreate(true)}
              className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-indigo-500 transition-colors flex items-center gap-2 shadow-lg shadow-indigo-500/20"
            >
              <Plus size={12} /> New Case
            </button>
          )}
        </div>
      </div>

      {/* Cases grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-48 bg-zinc-100 dark:bg-zinc-900/50 rounded-2xl animate-pulse" />
          ))
        ) : cases.length === 0 ? (
          <div className="col-span-full text-center py-16 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl">
            <ShieldCheck className="mx-auto text-zinc-300 mb-3" size={32} />
            <p className="text-[11px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-600">No cases match the current filter</p>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {cases.map(c => (
              <motion.div
                key={c.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="text-sm font-black text-zinc-900 dark:text-white tracking-tight uppercase line-clamp-2">{c.title}</h3>
                </div>

                <div className="flex flex-wrap gap-1.5 mb-3">
                  <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border ${statusColor(c.status)}`}>{c.status}</span>
                  <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border ${sevColor(c.severity)}`}>{c.severity}</span>
                  <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30">
                    QA Share {(c.qa_share * 100).toFixed(0)}%
                  </span>
                </div>

                <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-600 space-y-1 mb-3">
                  <div className="flex justify-between"><span>QA</span><span className="text-zinc-700 dark:text-zinc-300 normal-case">{c.qa_name}</span></div>
                  <div className="flex justify-between"><span>TL</span><span className="text-zinc-700 dark:text-zinc-300 normal-case">{c.tl_name}</span></div>
                  <div className="flex justify-between"><span>Opened</span><span className="text-zinc-700 dark:text-zinc-300 normal-case">{fmt(c.created_at)}</span></div>
                  {c.evaluation_id && <div className="flex justify-between"><span>Call</span><span className="text-indigo-600 dark:text-indigo-400 normal-case">#{c.evaluation_id}</span></div>}
                </div>

                {c.description && (
                  <p className="text-xs text-zinc-600 dark:text-zinc-400 mb-3 line-clamp-3 bg-zinc-50 dark:bg-zinc-900/40 rounded-lg p-2">
                    {c.description}
                  </p>
                )}

                {c.qa_comment && (
                  <div className="mb-3 p-2 rounded-lg bg-rose-500/5 border border-rose-500/20">
                    <p className="text-[9px] font-black uppercase tracking-widest text-rose-500 mb-0.5 flex items-center gap-1">
                      <MessageSquare size={9} /> QA Response
                    </p>
                    <p className="text-[11px] text-zinc-700 dark:text-zinc-300 line-clamp-2">{c.qa_comment}</p>
                  </div>
                )}

                <div className="mt-auto pt-3 border-t border-zinc-100 dark:border-zinc-900 flex justify-end gap-2">
                  <button
                    onClick={() => setEditing(c)}
                    className="px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 text-[10px] font-black uppercase tracking-widest hover:bg-indigo-500 hover:text-white transition-colors flex items-center gap-1"
                  >
                    <Edit2 size={11} /> {isQA ? 'Comment' : 'Edit'}
                  </button>
                  {isSupervisor && (
                    <button
                      onClick={async () => {
                        if (!confirm('Delete this case permanently?')) return;
                        await fetch(`/api/accuracy-cases/${c.id}`, { method: 'DELETE' });
                        fetchCases();
                      }}
                      className="p-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-900 text-zinc-500 hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                      title="Delete"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      {showCreate && (
        <CaseEditor mode="create" user={user} onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); fetchCases(); }} />
      )}
      {editing && (
        <CaseEditor mode="edit" caseRow={editing} user={user} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); fetchCases(); }} />
      )}
    </div>
  );
}

// ============================================================
// Editor — used for both create (TL) and edit (TL/QA/Supervisor)
// ============================================================
function CaseEditor({ mode, caseRow, user, onClose, onSaved }: {
  mode: 'create' | 'edit';
  caseRow?: Case;
  user: any;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isQA = user?.role === 'qa';
  const isSupervisor = user?.role === 'supervisor';
  const isTL = user?.role === 'tl';
  const canEditAll = isSupervisor || (isTL && caseRow?.tl_id === user?.id);
  const canEditCommentOnly = isQA && caseRow?.qa_id === user?.id;

  const [qas, setQAs] = useState<{ id: number; display_name: string }[]>([]);
  const [form, setForm] = useState({
    qa_id: caseRow?.qa_id || '',
    title: caseRow?.title || '',
    description: caseRow?.description || '',
    severity: caseRow?.severity || 'medium',
    qa_share: caseRow?.qa_share ?? 1.0,
    status: caseRow?.status || 'open',
    qa_comment: caseRow?.qa_comment || '',
    supervisor_note: caseRow?.supervisor_note || '',
    evaluation_id: caseRow?.evaluation_id || '',
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (mode === 'create') {
      fetch('/api/users')
        .then(r => r.ok ? r.json() : [])
        .then(d => setQAs(d.filter((u: any) => u.role === 'qa')));
    }
  }, [mode]);

  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      if (mode === 'create') {
        if (!form.qa_id || !form.title) { throw new Error('QA and title are required'); }
        const res = await fetch('/api/accuracy-cases', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            qa_id: form.qa_id, tl_id: user.id, evaluation_id: form.evaluation_id || null,
            title: form.title, description: form.description, severity: form.severity, qa_share: form.qa_share,
          }),
        });
        if (!res.ok) throw new Error((await res.json()).error || 'Save failed');
      } else if (caseRow) {
        const payload: any = {};
        if (canEditAll) {
          payload.title = form.title;
          payload.description = form.description;
          payload.severity = form.severity;
          payload.status = form.status;
          payload.evaluation_id = form.evaluation_id || null;
          if (isSupervisor) {
            payload.qa_share = form.qa_share;
            payload.supervisor_note = form.supervisor_note;
          }
        }
        if (canEditCommentOnly || canEditAll) {
          payload.qa_comment = form.qa_comment;
        }
        const res = await fetch(`/api/accuracy-cases/${caseRow.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error((await res.json()).error || 'Save failed');
      }
      onSaved();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        className="w-full max-w-xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden my-auto"
      >
        <div className="p-5 border-b border-zinc-100 dark:border-zinc-900 flex items-center justify-between">
          <h3 className="text-base font-black text-zinc-900 dark:text-white uppercase tracking-tight">
            {mode === 'create' ? 'New Accuracy Case' : `Case #${caseRow?.id}`}
          </h3>
          <button onClick={onClose} className="p-2 rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {mode === 'create' && (
            <div>
              <label className="text-[9px] font-black uppercase tracking-widest text-zinc-500 block mb-1">QA</label>
              <select
                value={form.qa_id}
                onChange={(e) => setForm({ ...form, qa_id: parseInt(e.target.value, 10) as any })}
                className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm font-bold"
              >
                <option value="">Select QA…</option>
                {qas.map(q => <option key={q.id} value={q.id}>{q.display_name}</option>)}
              </select>
            </div>
          )}

          {(canEditAll || mode === 'create') ? (
            <>
              <Field label="Title *">
                <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm" />
              </Field>
              <Field label="Description">
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3}
                  className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm resize-none" />
              </Field>
              <Field label="Related Call ID (optional)">
                <input value={form.evaluation_id} onChange={(e) => setForm({ ...form, evaluation_id: e.target.value })}
                  placeholder="e.g. 42" className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Severity">
                  <select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value as any })}
                    className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm font-bold">
                    {SEVERITIES.map(s => <option key={s} value={s}>{s.toUpperCase()}</option>)}
                  </select>
                </Field>
                {mode === 'edit' && (
                  <Field label="Status">
                    <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as any })}
                      className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm font-bold">
                      {STATUSES.map(s => <option key={s} value={s}>{s.toUpperCase()}</option>)}
                    </select>
                  </Field>
                )}
              </div>
              {isSupervisor && (
                <>
                  <Field label={`QA Responsibility: ${(form.qa_share * 100).toFixed(0)}%`}>
                    <input type="range" min="0" max="1" step="0.05" value={form.qa_share}
                      onChange={(e) => setForm({ ...form, qa_share: parseFloat(e.target.value) })}
                      className="w-full" />
                    <p className="text-[10px] text-zinc-500 mt-1">0% = pure TL fault · 50% = shared · 100% = pure QA fault</p>
                  </Field>
                  <Field label="Supervisor Note">
                    <textarea value={form.supervisor_note} onChange={(e) => setForm({ ...form, supervisor_note: e.target.value })} rows={2}
                      className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm resize-none" />
                  </Field>
                </>
              )}
            </>
          ) : (
            <div className="space-y-2 text-sm">
              <p><b>Title:</b> {caseRow?.title}</p>
              <p><b>Severity:</b> {caseRow?.severity}</p>
              {caseRow?.description && <p><b>Description:</b> {caseRow.description}</p>}
            </div>
          )}

          {(canEditCommentOnly || canEditAll) && mode === 'edit' && (
            <Field label={isQA ? 'Your Response' : 'QA Comment'}>
              <textarea value={form.qa_comment} onChange={(e) => setForm({ ...form, qa_comment: e.target.value })}
                rows={3} placeholder={isQA ? "Explain your side — this is logged with the case." : ''}
                disabled={!canEditCommentOnly && !canEditAll}
                className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm resize-none disabled:opacity-60" />
            </Field>
          )}

          {err && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 text-xs flex items-center gap-2">
              <AlertCircle size={14} /> {err}
            </div>
          )}
        </div>

        <div className="p-5 pt-4 border-t border-zinc-100 dark:border-zinc-900 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 text-[10px] font-black uppercase tracking-widest">Cancel</button>
          <button
            onClick={submit}
            disabled={busy}
            className="px-5 py-2 rounded-xl bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-indigo-500/20"
          >
            <Check size={12} /> {busy ? 'Saving…' : mode === 'create' ? 'Create' : 'Save'}
          </button>
        </div>
      </motion.div>
    </div>,
    document.body
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[9px] font-black uppercase tracking-widest text-zinc-500 block mb-1">{label}</label>
      {children}
    </div>
  );
}
