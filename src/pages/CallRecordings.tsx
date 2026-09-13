import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  Headphones, Search, Loader2, Link2, ChevronLeft, ChevronRight,
  AlertCircle, CheckCircle2, Sparkles, X, Calendar, PhoneIncoming, PhoneOutgoing, PhoneCall
} from 'lucide-react';

type XonCall = {
  xontel_id: number;
  time: string;
  duration: string;
  call_type: string;
  queue: string;
  agent: string;
  customer_number: string;
  status?: string;
  media_path: string | null;
};

type MapRow = {
  id: number;
  display_name: string;
  xontel_agent_id: number | null;
  xontel_agent_name: string | null;
  suggestion: { id: number; name: string; exact: boolean; why?: string } | null;
};

const isoDaysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

/**
 * Browse one employee's calls straight from XonTel, with inline playback.
 *
 * Needs the employee to be linked to a XonTel account (xontel_agent_map);
 * supervisors manage those links from the "Account Links" panel here, where
 * most rows arrive pre-suggested by name and only need confirming.
 */
export default function CallRecordings() {
  const { user } = useAuth();
  const isSupervisor = user?.role === 'supervisor';

  const [configured, setConfigured] = useState<boolean | null>(null);
  const [agents, setAgents] = useState<any[]>([]);
  const [agentId, setAgentId] = useState<string>('');
  const [fromDate, setFromDate] = useState(isoDaysAgo(7));
  const [toDate, setToDate] = useState(isoDaysAgo(0));
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const [isLoading, setIsLoading] = useState(false);
  const [calls, setCalls] = useState<XonCall[]>([]);
  const [count, setCount] = useState(0);
  const [pages, setPages] = useState<any>(null);
  const [unmapped, setUnmapped] = useState(false);
  const [xonName, setXonName] = useState('');
  const [error, setError] = useState('');
  const [playing, setPlaying] = useState<number | null>(null);

  const [showLinks, setShowLinks] = useState(false);

  useEffect(() => {
    fetch('/api/xontel/status').then(r => r.json()).then(d => setConfigured(!!d.configured)).catch(() => setConfigured(false));
    fetch('/api/users').then(r => r.json()).then((all: any[]) => {
      let list = all.filter(u => u.role === 'agent' && u.status !== 'inactive');
      // A TL only browses their own team.
      if (user?.role === 'tl') list = list.filter(u => Number(u.tl_id) === Number(user.id));
      list.sort((a, b) => String(a.display_name).localeCompare(String(b.display_name)));
      setAgents(list);
    }).catch(() => {});
  }, [user?.id, user?.role]);

  const loadCalls = async (p = page) => {
    if (!agentId) return;
    setIsLoading(true);
    setError('');
    setPlaying(null);
    try {
      const qs = new URLSearchParams({ user_id: agentId, from_date: fromDate, to_date: toDate, page: String(p) });
      if (search.trim()) qs.set('search', search.trim());
      const res = await fetch(`/api/xontel/agent-calls?${qs}`);
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Lookup failed.'); setCalls([]); return; }
      setUnmapped(!!data.unmapped);
      setXonName(data.xontel_agent_name || '');
      setCalls(data.calls || []);
      setCount(data.count || 0);
      setPages(data.pages || null);
    } catch {
      setError('Could not reach the server.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setPage(1);
    loadCalls(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId, fromDate, toDate]);

  const selectedAgent = useMemo(() => agents.find(a => String(a.id) === agentId), [agents, agentId]);

  const typeIcon = (t: string) =>
    t === 'Incoming' ? <PhoneIncoming size={12} className="text-emerald-500" />
    : t === 'Outgoing' ? <PhoneOutgoing size={12} className="text-indigo-500" />
    : <PhoneCall size={12} className="text-zinc-400" />;

  if (configured === false) {
    return (
      <div className="max-w-2xl mx-auto pt-16 text-center">
        <Headphones size={32} className="mx-auto text-zinc-300 dark:text-zinc-700 mb-4" />
        <h2 className="text-xl font-light text-zinc-900 dark:text-white mb-2">Call Recordings</h2>
        <p className="text-sm text-zinc-500">The XonTel integration isn't configured on this server yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-8">
        <div>
          <h2 className="text-2xl sm:text-3xl font-light text-zinc-900 dark:text-white tracking-tight mb-1">Call Recordings</h2>
          <p className="text-zinc-500 text-sm">Every call an employee handled, straight from XonTel, with playback.</p>
        </div>
        {isSupervisor && (
          <button
            onClick={() => setShowLinks(true)}
            className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs font-black uppercase tracking-widest text-zinc-600 dark:text-zinc-300 hover:border-indigo-400 transition-all"
          >
            <Link2 size={14} /> Account Links
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-4 sm:p-5 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="lg:col-span-2">
            <label className="text-[9px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest block mb-1 ml-1">Employee</label>
            <select
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2.5 text-xs font-bold text-zinc-800 dark:text-zinc-100 outline-none focus:border-indigo-500"
            >
              <option value="">Select an employee…</option>
              {agents.map(a => <option key={a.id} value={a.id}>{a.display_name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[9px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest block mb-1 ml-1">From</label>
            <input type="date" value={fromDate} max={toDate} onChange={e => setFromDate(e.target.value)}
              className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2.5 text-xs font-bold text-zinc-800 dark:text-zinc-100 outline-none focus:border-indigo-500 dark:[color-scheme:dark]" />
          </div>
          <div>
            <label className="text-[9px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest block mb-1 ml-1">To</label>
            <input type="date" value={toDate} min={fromDate} onChange={e => setToDate(e.target.value)}
              className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2.5 text-xs font-bold text-zinc-800 dark:text-zinc-100 outline-none focus:border-indigo-500 dark:[color-scheme:dark]" />
          </div>
          <div>
            <label className="text-[9px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest block mb-1 ml-1">Customer number</label>
            <div className="relative">
              <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { setPage(1); loadCalls(1); } }}
                placeholder="Optional"
                className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-8 pr-3 py-2.5 text-xs font-bold text-zinc-800 dark:text-zinc-100 outline-none focus:border-indigo-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      {!agentId ? (
        <div className="text-center py-16 text-zinc-400 dark:text-zinc-600 text-xs font-black uppercase tracking-widest">
          Choose an employee to see their calls
        </div>
      ) : isLoading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-zinc-400 text-xs font-bold">
          <Loader2 size={16} className="animate-spin" /> Fetching calls from XonTel…
        </div>
      ) : error ? (
        <div className="bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400 rounded-2xl px-5 py-4 text-sm font-bold flex items-center gap-2">
          <AlertCircle size={16} /> {error}
        </div>
      ) : unmapped ? (
        <div className="bg-white dark:bg-zinc-950 border border-dashed border-zinc-300 dark:border-zinc-700 rounded-3xl p-8 text-center">
          <Link2 size={28} className="mx-auto text-zinc-300 dark:text-zinc-700 mb-3" />
          <p className="text-sm font-black text-zinc-700 dark:text-zinc-200 mb-1">
            {selectedAgent?.display_name} isn't linked to a XonTel account yet
          </p>
          <p className="text-xs text-zinc-500 mb-4">Calls can be shown once a supervisor links the two accounts.</p>
          {isSupervisor && (
            <button onClick={() => setShowLinks(true)}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-black uppercase tracking-widest hover:bg-indigo-500">
              Link account
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-sm overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 px-5 sm:px-6 py-4 border-b border-zinc-100 dark:border-zinc-900">
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
              {count} call{count === 1 ? '' : 's'}
              <span className="text-zinc-300 dark:text-zinc-700"> · </span>
              XonTel account <span className="text-indigo-600 dark:text-indigo-400">{xonName}</span>
            </p>
            {pages && pages.total_pages > 1 && (
              <div className="flex items-center gap-1">
                <button disabled={page <= 1} onClick={() => { const p = page - 1; setPage(p); loadCalls(p); }}
                  className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 disabled:opacity-30 text-zinc-500"><ChevronLeft size={14} /></button>
                <span className="text-[10px] font-black text-zinc-500 px-2">{page} / {pages.total_pages}</span>
                <button disabled={page >= pages.total_pages} onClick={() => { const p = page + 1; setPage(p); loadCalls(p); }}
                  className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 disabled:opacity-30 text-zinc-500"><ChevronRight size={14} /></button>
              </div>
            )}
          </div>

          {calls.length === 0 ? (
            <div className="py-14 text-center text-zinc-400 dark:text-zinc-600 text-xs font-bold">No calls in this range.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[9px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-600 border-b border-zinc-100 dark:border-zinc-900">
                    <th className="px-5 sm:px-6 py-3">Time</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3">Queue</th>
                    <th className="px-4 py-3">Duration</th>
                    <th className="px-4 py-3 min-w-[260px]">Recording</th>
                  </tr>
                </thead>
                <tbody>
                  {calls.map(c => (
                    <tr key={c.xontel_id} className="border-b border-zinc-50 dark:border-zinc-900/60 hover:bg-zinc-50/60 dark:hover:bg-zinc-900/30">
                      <td className="px-5 sm:px-6 py-3 text-[11px] font-bold text-zinc-700 dark:text-zinc-200 whitespace-nowrap">{c.time}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-zinc-500">{typeIcon(c.call_type)} {c.call_type || '—'}</span>
                      </td>
                      <td className="px-4 py-3 text-[11px] font-mono font-bold text-zinc-700 dark:text-zinc-200">{c.customer_number}</td>
                      <td className="px-4 py-3 text-[10px] font-bold text-zinc-500 whitespace-nowrap">{c.queue || '—'}</td>
                      <td className="px-4 py-3 text-[11px] font-mono text-zinc-500">{c.duration}</td>
                      <td className="px-4 py-3">
                        {c.media_path ? (
                          playing === c.xontel_id ? (
                            <audio controls autoPlay preload="none" className="w-full h-8"
                              src={`/api/xontel/stream?path=${encodeURIComponent(c.media_path)}`} />
                          ) : (
                            <button onClick={() => setPlaying(c.xontel_id)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600/10 text-indigo-600 dark:text-indigo-400 text-[10px] font-black uppercase tracking-widest hover:bg-indigo-600 hover:text-white transition-all">
                              <Headphones size={12} /> Play
                            </button>
                          )
                        ) : (
                          <span className="text-[10px] text-zinc-400 dark:text-zinc-600 font-bold">No recording</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {showLinks && isSupervisor && (
        <AccountLinksPanel
          actorId={user!.id}
          onClose={() => { setShowLinks(false); if (agentId) loadCalls(page); }}
        />
      )}
    </div>
  );
}

/**
 * Supervisor panel: link each QA-system agent to their XonTel account.
 * Suggestions come from the server (normalised-name match) but are only
 * ever applied by an explicit click — a wrong link would attribute one
 * employee's calls to another.
 */
function AccountLinksPanel({ actorId, onClose }: { actorId: number; onClose: () => void }) {
  const [rows, setRows] = useState<MapRow[]>([]);
  const [xonAgents, setXonAgents] = useState<{ id: number; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<number | null>(null);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/xontel/agent-map');
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Could not load.'); return; }
      setRows(data.rows || []);
      setXonAgents(data.agents || []);
    } catch { setError('Could not reach the server.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const save = async (userId: number, xonId: number | null) => {
    setSaving(userId);
    try {
      const name = xonAgents.find(a => a.id === xonId)?.name || '';
      await fetch('/api/xontel/agent-map', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, xontel_agent_id: xonId, xontel_agent_name: name, actor_id: actorId }),
      });
      await load();
    } finally { setSaving(null); }
  };

  const pending = rows.filter(r => !r.xontel_agent_id && r.suggestion);
  const acceptAll = async () => {
    for (const r of pending) await save(r.id, r.suggestion!.id);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-3xl max-h-[85vh] bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-100 dark:border-zinc-900">
          <div>
            <h3 className="text-sm font-black uppercase tracking-widest text-zinc-800 dark:text-zinc-100">XonTel Account Links</h3>
            <p className="text-[10px] text-zinc-500 font-bold mt-0.5">
              {rows.filter(r => r.xontel_agent_id).length} of {rows.length} employees linked
            </p>
          </div>
          <div className="flex items-center gap-2">
            {pending.length > 0 && (
              <button onClick={acceptAll} disabled={saving !== null}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500 disabled:opacity-50">
                <Sparkles size={12} /> Accept {pending.length} suggestion{pending.length === 1 ? '' : 's'}
              </button>
            )}
            <button onClick={onClose} className="p-2 rounded-xl text-zinc-400 hover:text-zinc-800 dark:hover:text-white"><X size={18} /></button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-zinc-400 text-xs font-bold"><Loader2 size={16} className="animate-spin" /> Loading…</div>
          ) : error ? (
            <div className="m-6 bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400 rounded-2xl px-5 py-4 text-sm font-bold">{error}</div>
          ) : (
            <table className="w-full text-left">
              <thead className="sticky top-0 bg-white dark:bg-zinc-950">
                <tr className="text-[9px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-600 border-b border-zinc-100 dark:border-zinc-900">
                  <th className="px-6 py-3">QA employee</th>
                  <th className="px-4 py-3">XonTel account</th>
                  <th className="px-4 py-3 w-28"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className="border-b border-zinc-50 dark:border-zinc-900/60">
                    <td className="px-6 py-3 text-xs font-bold text-zinc-800 dark:text-zinc-100">{r.display_name}</td>
                    <td className="px-4 py-3">
                      <select
                        value={r.xontel_agent_id ?? (r.suggestion?.id ?? '')}
                        disabled={saving === r.id}
                        onChange={e => save(r.id, e.target.value ? Number(e.target.value) : null)}
                        className={`w-full bg-zinc-50 dark:bg-zinc-900 border rounded-xl px-3 py-2 text-xs font-bold outline-none focus:border-indigo-500 ${
                          r.xontel_agent_id
                            ? 'border-emerald-300 dark:border-emerald-800 text-zinc-800 dark:text-zinc-100'
                            : r.suggestion
                              ? 'border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-400'
                              : 'border-zinc-200 dark:border-zinc-800 text-zinc-500'
                        }`}
                      >
                        <option value="">— not linked —</option>
                        {xonAgents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {saving === r.id ? (
                        <Loader2 size={14} className="animate-spin text-zinc-400 inline" />
                      ) : r.xontel_agent_id ? (
                        <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-500"><CheckCircle2 size={12} /> Linked</span>
                      ) : r.suggestion ? (
                        <button onClick={() => save(r.id, r.suggestion!.id)}
                          title={r.suggestion.exact ? 'Names match exactly' : `Matched on ${r.suggestion.why || 'name'} — check before confirming`}
                          className="text-[9px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-400 hover:underline">
                          Confirm
                        </button>
                      ) : (
                        <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-600">Pick one</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="px-6 py-3 border-t border-zinc-100 dark:border-zinc-900 text-[10px] text-zinc-400 dark:text-zinc-600 font-bold flex items-center gap-2">
          <Calendar size={11} /> Amber = suggested by name, not yet confirmed. Green = confirmed.
        </div>
      </div>
    </div>
  );
}
