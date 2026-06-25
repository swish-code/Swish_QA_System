import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../context/AuthContext';
import {
  Briefcase, Calendar, Users, MessageSquare, Bell, Clock,
  ChevronRight, X, AlertCircle, CheckCircle2, Save
} from 'lucide-react';

type TLRow = {
  id: number;
  display_name: string;
  username: string;
  team_size: number;
  audits: number;
  avg_team_score: number;
  coaching: {
    total: number;
    completed: number;
    in_progress: number;
    pending: number;
    avg_session_minutes: number;
  };
  escalations: {
    total: number;
    within_sla: number;
    overdue: number;
    open: number;
    avg_response_hours: number;
    sla_hours: number;
  };
};

type CoachingDetail = {
  id: number;
  evaluation_id: number;
  status: string;
  created_at: string;
  agent_approved_at: string | null;
  session_started_at: string | null;
  completed_at: string | null;
  tl_comment: string;
  cc_supervisor_note: string | null;
  agent_name: string;
};

type EscalationDetail = {
  id: number;
  evaluation_id: number;
  role: string;
  comment: string;
  created_at: string;
  responded_at: string | null;
  cc_supervisor_note: string | null;
  final_score: number;
  brand: string;
  call_type: string;
  call_date: string;
  agent_name: string;
};

const today = () => new Date().toISOString().split('T')[0];
const firstOfMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};

function fmt(ts: string | null): string {
  if (!ts) return '—';
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return ts;
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return ts; }
}

export default function CCOperations() {
  const { user } = useAuth();
  const [fromDate, setFromDate] = useState(firstOfMonth());
  const [toDate, setToDate] = useState(today());
  const [rows, setRows] = useState<TLRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTL, setSelectedTL] = useState<TLRow | null>(null);

  const fetchRows = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        user_id: String(user.id),
        role: user.role,
        from_date: fromDate,
        to_date: toDate,
      });
      const res = await fetch(`/api/cc/tl-ops?${params}`);
      if (!res.ok) throw new Error('fetch failed');
      const json = await res.json();
      setRows(json.tls || []);
    } catch (e) {
      console.error('CC ops fetch failed', e);
    } finally {
      setLoading(false);
    }
  }, [user, fromDate, toDate]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  const totals = useMemo(() => {
    return rows.reduce((acc, r) => ({
      tls: acc.tls + 1,
      agents: acc.agents + r.team_size,
      coachings: acc.coachings + r.coaching.total,
      escalations: acc.escalations + r.escalations.total,
      overdue: acc.overdue + r.escalations.overdue,
    }), { tls: 0, agents: 0, coachings: 0, escalations: 0, overdue: 0 });
  }, [rows]);

  return (
    <div className="space-y-6 max-w-[1500px] mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-zinc-900 dark:text-white tracking-tighter flex items-center gap-3 italic uppercase">
            <Briefcase className="text-indigo-600" size={28} />
            CC Operations
          </h1>
          <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest mt-2">
            Per-TL coaching & escalation activity — your direct line managers
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2">
            <Calendar size={14} className="text-indigo-500" />
            <input type="date" value={fromDate} max={toDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="bg-transparent text-xs font-bold text-zinc-800 dark:text-zinc-100 outline-none cursor-pointer dark:[color-scheme:dark]" />
            <span className="text-zinc-400">→</span>
            <input type="date" value={toDate} min={fromDate}
              onChange={(e) => setToDate(e.target.value)}
              className="bg-transparent text-xs font-bold text-zinc-800 dark:text-zinc-100 outline-none cursor-pointer dark:[color-scheme:dark]" />
          </div>
        </div>
      </div>

      {/* Headline stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label="Team Leaders" value={totals.tls} icon={Briefcase} accent="indigo" />
        <StatCard label="Total Agents" value={totals.agents} icon={Users} accent="emerald" />
        <StatCard label="Coachings" value={totals.coachings} icon={MessageSquare} accent="blue" />
        <StatCard label="Escalations" value={totals.escalations} icon={Bell} accent="amber" />
        <StatCard label="Overdue" value={totals.overdue} icon={AlertCircle} accent="rose" />
      </div>

      {/* TL table */}
      <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[900px]">
            <thead>
              <tr className="border-b border-zinc-100 dark:border-zinc-900 text-[10px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-600">
                <th className="px-6 py-3">Team Leader</th>
                <th className="px-6 py-3 text-center">Team</th>
                <th className="px-6 py-3 text-center">Avg Score</th>
                <th className="px-6 py-3 text-center">Coachings</th>
                <th className="px-6 py-3 text-center">Avg Session</th>
                <th className="px-6 py-3 text-center">Escalations</th>
                <th className="px-6 py-3 text-center">SLA</th>
                <th className="px-6 py-3 text-center">Avg Response</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
              {loading ? Array.from({ length: 3 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td colSpan={9} className="px-6 py-4"><div className="h-3 bg-zinc-100 dark:bg-zinc-900 rounded w-full" /></td>
                </tr>
              )) : rows.length === 0 ? (
                <tr><td colSpan={9} className="px-6 py-12 text-center text-[10px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-600">
                  No Team Leaders assigned to you yet
                </td></tr>
              ) : rows.map(tl => {
                const overdueCount = tl.escalations.overdue;
                const slaRate = tl.escalations.total > 0
                  ? Math.round((tl.escalations.within_sla / tl.escalations.total) * 100)
                  : 100;
                return (
                  <tr key={tl.id}
                      onClick={() => setSelectedTL(tl)}
                      className="cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900/40 group">
                    <td className="px-6 py-4">
                      <p className="text-sm font-black text-zinc-900 dark:text-white uppercase tracking-tight">{tl.display_name}</p>
                      <p className="text-[9px] font-mono text-zinc-400 dark:text-zinc-600">{tl.username}</p>
                    </td>
                    <td className="px-6 py-4 text-center text-sm font-bold text-zinc-700 dark:text-zinc-300">{tl.team_size}</td>
                    <td className="px-6 py-4 text-center">
                      <span className={`text-sm font-black ${tl.avg_team_score >= 90 ? 'text-emerald-500' : tl.avg_team_score >= 75 ? 'text-amber-500' : 'text-rose-500'}`}>
                        {tl.avg_team_score || '—'}{tl.avg_team_score ? '%' : ''}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-1.5 text-xs font-bold">
                        <span className="text-emerald-600">{tl.coaching.completed}✓</span>
                        <span className="text-zinc-400">/</span>
                        <span className="text-zinc-700 dark:text-zinc-300">{tl.coaching.total}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center text-xs font-mono text-zinc-600 dark:text-zinc-400">
                      {tl.coaching.avg_session_minutes ? `${tl.coaching.avg_session_minutes}m` : '—'}
                    </td>
                    <td className="px-6 py-4 text-center text-sm font-bold text-zinc-700 dark:text-zinc-300">{tl.escalations.total}</td>
                    <td className="px-6 py-4 text-center">
                      <div className="inline-flex items-center gap-1.5">
                        <span className={`text-xs font-black ${slaRate >= 90 ? 'text-emerald-500' : slaRate >= 75 ? 'text-amber-500' : 'text-rose-500'}`}>{slaRate}%</span>
                        {overdueCount > 0 && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30">
                            {overdueCount} late
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center text-xs font-mono text-zinc-600 dark:text-zinc-400">
                      {tl.escalations.avg_response_hours ? `${tl.escalations.avg_response_hours}h` : '—'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <ChevronRight size={14} className="text-zinc-400 group-hover:text-indigo-500" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {selectedTL && (
        <TLDetailModal tl={selectedTL} fromDate={fromDate} toDate={toDate} onClose={() => setSelectedTL(null)} />
      )}
    </div>
  );
}

function StatCard({ label, value, icon: Icon, accent }: { label: string; value: number; icon: any; accent: string }) {
  const tone = {
    indigo: 'text-indigo-600 bg-indigo-500/10 border-indigo-500/20',
    emerald: 'text-emerald-600 bg-emerald-500/10 border-emerald-500/20',
    blue: 'text-blue-600 bg-blue-500/10 border-blue-500/20',
    amber: 'text-amber-600 bg-amber-500/10 border-amber-500/20',
    rose: 'text-rose-600 bg-rose-500/10 border-rose-500/20',
  }[accent] || '';
  return (
    <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className={`p-1.5 rounded-lg border ${tone}`}><Icon size={12} /></div>
        <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500">{label}</p>
      </div>
      <p className="text-2xl font-black tracking-tighter text-zinc-900 dark:text-white">{value}</p>
    </div>
  );
}

// =================================================================
// TL Detail Modal — full coaching + escalation lists for one TL,
// with editable cc_supervisor_note on every row.
// =================================================================
function TLDetailModal({ tl, fromDate, toDate, onClose }: {
  tl: TLRow; fromDate: string; toDate: string; onClose: () => void;
}) {
  const [coachings, setCoachings] = useState<CoachingDetail[]>([]);
  const [escalations, setEscalations] = useState<EscalationDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'coaching' | 'escalation'>('coaching');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ from_date: fromDate, to_date: toDate });
      const res = await fetch(`/api/cc/tl-ops/${tl.id}?${params}`);
      const json = await res.json();
      setCoachings(json.coachings || []);
      setEscalations(json.escalations || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [tl.id, fromDate, toDate]);

  useEffect(() => { load(); }, [load]);

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-[110] bg-black/70 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-2xl overflow-hidden my-auto max-h-[90vh] flex flex-col"
      >
        <div className="p-5 border-b border-zinc-100 dark:border-zinc-900 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-black text-zinc-900 dark:text-white uppercase tracking-tighter">{tl.display_name}</h3>
            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-600">{tl.username} · {fromDate} → {toDate}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"><X size={18} /></button>
        </div>

        <div className="flex border-b border-zinc-100 dark:border-zinc-900">
          <button onClick={() => setTab('coaching')}
            className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest border-b-2 ${tab === 'coaching' ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-zinc-400'}`}>
            Coachings ({coachings.length})
          </button>
          <button onClick={() => setTab('escalation')}
            className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest border-b-2 ${tab === 'escalation' ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-zinc-400'}`}>
            Escalations ({escalations.length})
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {loading ? (
            <div className="space-y-2">{[0, 1, 2].map(i => <div key={i} className="h-20 bg-zinc-100 dark:bg-zinc-900 rounded-2xl animate-pulse" />)}</div>
          ) : tab === 'coaching' ? (
            coachings.length === 0 ? <EmptyState label="No coachings in this range" /> :
              coachings.map(c => <CoachingCard key={c.id} c={c} onSaved={load} />)
          ) : (
            escalations.length === 0 ? <EmptyState label="No escalations in this range" /> :
              escalations.map(e => <EscalationCard key={e.id} es={e} onSaved={load} />)
          )}
        </div>
      </motion.div>
    </motion.div>,
    document.body
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="text-center py-12">
      <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-600">{label}</p>
    </div>
  );
}

const CoachingCard: React.FC<{ c: CoachingDetail; onSaved: () => void }> = ({ c, onSaved }) => {
  const [note, setNote] = useState(c.cc_supervisor_note || '');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const save = async () => {
    setSaving(true);
    try {
      await fetch(`/api/cc/notes/coaching/${c.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note }),
      });
      setSavedAt(Date.now());
      onSaved();
    } finally { setSaving(false); }
  };
  const isDone = c.status === 'Completed';
  return (
    <div className="bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <p className="text-xs font-black text-zinc-900 dark:text-white uppercase">Call #{c.evaluation_id} · {c.agent_name}</p>
          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mt-0.5 flex items-center gap-1.5"><Clock size={10}/>{fmt(c.created_at)}</p>
        </div>
        <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest border ${isDone ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30' : 'bg-amber-500/10 text-amber-600 border-amber-500/30'}`}>{c.status}</span>
      </div>
      {c.tl_comment && (
        <p className="text-[11px] text-zinc-600 dark:text-zinc-400 bg-white dark:bg-zinc-950/40 border border-zinc-100 dark:border-zinc-900 rounded-lg p-2 mb-2"><b>TL note:</b> {c.tl_comment}</p>
      )}
      <div className="grid grid-cols-3 gap-2 text-[10px] font-bold text-zinc-500 mb-2">
        <div><b className="block text-zinc-400">Approved</b>{fmt(c.agent_approved_at)}</div>
        <div><b className="block text-zinc-400">Started</b>{fmt(c.session_started_at)}</div>
        <div><b className="block text-zinc-400">Completed</b>{fmt(c.completed_at)}</div>
      </div>
      <NoteEditor note={note} setNote={setNote} save={save} saving={saving} savedAt={savedAt} />
    </div>
  );
};

const EscalationCard: React.FC<{ es: EscalationDetail; onSaved: () => void }> = ({ es, onSaved }) => {
  const [note, setNote] = useState(es.cc_supervisor_note || '');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const save = async () => {
    setSaving(true);
    try {
      await fetch(`/api/cc/notes/escalation/${es.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note }),
      });
      setSavedAt(Date.now());
      onSaved();
    } finally { setSaving(false); }
  };
  const responseHours = es.responded_at
    ? Math.round((new Date(es.responded_at).getTime() - new Date(es.created_at).getTime()) / 3600000 * 10) / 10
    : null;
  const overdue = !es.responded_at && (Date.now() - new Date(es.created_at).getTime() > 24 * 3600 * 1000);
  return (
    <div className="bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <p className="text-xs font-black text-zinc-900 dark:text-white uppercase">Call #{es.evaluation_id} · {es.agent_name} · {es.brand}/{es.call_type}</p>
          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mt-0.5 flex items-center gap-1.5"><Clock size={10}/>Escalated {fmt(es.created_at)}</p>
        </div>
        {es.responded_at ? (
          <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest border bg-emerald-500/10 text-emerald-600 border-emerald-500/30">{responseHours}h Resolved</span>
        ) : overdue ? (
          <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest border bg-rose-500/10 text-rose-600 border-rose-500/30">SLA Overdue</span>
        ) : (
          <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest border bg-amber-500/10 text-amber-600 border-amber-500/30">Open</span>
        )}
      </div>
      {es.comment && (
        <p className="text-[11px] text-zinc-600 dark:text-zinc-400 bg-white dark:bg-zinc-950/40 border border-zinc-100 dark:border-zinc-900 rounded-lg p-2 mb-2"><b>Reason:</b> {es.comment}</p>
      )}
      <NoteEditor note={note} setNote={setNote} save={save} saving={saving} savedAt={savedAt} />
    </div>
  );
};

function NoteEditor({ note, setNote, save, saving, savedAt }: {
  note: string; setNote: (s: string) => void; save: () => void; saving: boolean; savedAt: number | null;
}) {
  return (
    <div className="mt-2">
      <label className="text-[9px] font-black uppercase tracking-widest text-indigo-500 mb-1 block">CC Supervisor Note</label>
      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
        placeholder="Add follow-up notes…"
        className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-800 dark:text-zinc-200 outline-none focus:border-indigo-500 resize-none placeholder:text-zinc-400" />
      <div className="flex items-center justify-between mt-1.5">
        {savedAt ? (
          <span className="text-[10px] text-emerald-500 font-bold flex items-center gap-1"><CheckCircle2 size={10}/>Saved</span>
        ) : <span />}
        <button onClick={save} disabled={saving}
          className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-50 flex items-center gap-1.5">
          <Save size={11}/>{saving ? 'Saving…' : 'Save Note'}
        </button>
      </div>
    </div>
  );
}
