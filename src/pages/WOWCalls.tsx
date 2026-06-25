import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  Sparkles, Search, Eye, Calendar, User, Tag, Trophy,
  ChevronLeft, ChevronRight, ChevronDown
} from 'lucide-react';

type Evaluation = {
  id: number;
  date: string;
  agent_id: number;
  agent_name?: string;
  qa_id: number;
  qa_name?: string;
  brand: string;
  call_type: string;
  final_score: number;
  status: string;
  critical_failure: number | boolean;
  is_wow?: number | boolean;
};

type Pagination = {
  totalItems: number;
  totalPages: number;
  currentPage: number;
  limit: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
};

export default function WOWCalls() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchWOW = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        user_id: String(user.id),
        role: user.role,
        wow_only: '1',
        page: String(page),
        limit: String(limit),
      });
      if (search.trim()) params.set('search', search.trim());
      if (fromDate) params.set('from_date', fromDate);
      if (toDate) params.set('to_date', toDate);
      const res = await fetch(`/api/evaluations?${params}`);
      if (!res.ok) throw new Error('fetch failed');
      const json = await res.json();
      setEvaluations(json.data || []);
      setPagination(json.pagination);
    } catch (e) {
      console.error('WOW calls fetch failed', e);
    } finally {
      setLoading(false);
    }
  }, [user, page, limit, search, fromDate, toDate]);

  useEffect(() => { fetchWOW(); }, [fetchWOW]);

  // Quick stats from the loaded page (not the full set, but useful at a glance)
  const stats = useMemo(() => {
    if (!evaluations.length) return { avg: 0, perfect: 0 };
    const avg = evaluations.reduce((s, e) => s + e.final_score, 0) / evaluations.length;
    const perfect = evaluations.filter(e => e.final_score === 100).length;
    return { avg: Math.round(avg * 10) / 10, perfect };
  }, [evaluations]);

  // Agents shouldn't even reach this page (Sidebar hides it), but defend
  // against direct URL navigation too.
  if (user?.role === 'agent') {
    return (
      <div className="text-center py-24 text-zinc-500">
        <p className="text-[11px] font-black uppercase tracking-widest">Not available for your role.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">
      {/* Hero */}
      <div className="relative overflow-hidden bg-gradient-to-br from-amber-500 via-amber-600 to-orange-600 rounded-3xl p-6 sm:p-8 text-white shadow-xl shadow-amber-500/20">
        <Sparkles className="absolute top-3 right-3 text-white/20" size={120} />
        <div className="relative flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-white/20 backdrop-blur-sm border border-white/30">
            <Trophy size={28} />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tighter italic uppercase">WOW Calls</h1>
            <p className="text-[11px] sm:text-xs font-bold uppercase tracking-widest opacity-90 mt-1">
              Exceptional calls flagged by Quality — company-wide showcase
            </p>
          </div>
        </div>

        <div className="relative grid grid-cols-3 gap-3 mt-6">
          <div className="bg-white/15 backdrop-blur-sm border border-white/20 rounded-xl px-3 py-2">
            <p className="text-[9px] font-black uppercase tracking-widest opacity-80">Total WOW</p>
            <p className="text-2xl font-black tracking-tighter mt-0.5">{pagination?.totalItems ?? 0}</p>
          </div>
          <div className="bg-white/15 backdrop-blur-sm border border-white/20 rounded-xl px-3 py-2">
            <p className="text-[9px] font-black uppercase tracking-widest opacity-80">Avg Score (page)</p>
            <p className="text-2xl font-black tracking-tighter mt-0.5">{stats.avg}%</p>
          </div>
          <div className="bg-white/15 backdrop-blur-sm border border-white/20 rounded-xl px-3 py-2">
            <p className="text-[9px] font-black uppercase tracking-widest opacity-80">Perfect 100%</p>
            <p className="text-2xl font-black tracking-tighter mt-0.5">{stats.perfect}</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-3 sm:p-4 shadow-sm">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          <div>
            <label className="text-[9px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest block mb-1 ml-1">From</label>
            <input type="date" className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-800 dark:text-zinc-100 outline-none focus:border-amber-500 dark:[color-scheme:dark]"
              value={fromDate} max={toDate || undefined}
              onChange={(e) => { setFromDate(e.target.value); setPage(1); }} />
          </div>
          <div>
            <label className="text-[9px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest block mb-1 ml-1">To</label>
            <input type="date" className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-800 dark:text-zinc-100 outline-none focus:border-amber-500 dark:[color-scheme:dark]"
              value={toDate} min={fromDate || undefined}
              onChange={(e) => { setToDate(e.target.value); setPage(1); }} />
          </div>
          <div className="col-span-2">
            <label className="text-[9px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest block mb-1 ml-1">Search</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-600" size={12} />
              <input type="text" placeholder="Agent name, brand…"
                className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg pl-7 pr-3 py-2 text-xs text-zinc-800 dark:text-zinc-100 outline-none focus:border-amber-500 placeholder:text-zinc-400"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                onKeyDown={(e) => e.key === 'Enter' && fetchWOW()} />
            </div>
          </div>
        </div>
      </div>

      {/* List */}
      <div className="bg-white dark:bg-zinc-950/50 rounded-3xl border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[820px]">
            <thead>
              <tr className="border-b border-zinc-100 dark:border-zinc-800/50">
                <th className="px-6 py-4 text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">Agent</th>
                <th className="px-6 py-4 text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">QA</th>
                <th className="px-6 py-4 text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">Metadata</th>
                <th className="px-6 py-4 text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">Score</th>
                <th className="px-6 py-4 text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest text-center">View</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/30">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={5} className="px-6 py-6"><div className="h-3 bg-zinc-100 dark:bg-zinc-900 rounded w-full" /></td>
                  </tr>
                ))
              ) : evaluations.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-16 text-center">
                    <Sparkles className="mx-auto text-amber-300 mb-3" size={32} />
                    <p className="text-[11px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-600">
                      No WOW calls have been flagged yet
                    </p>
                  </td>
                </tr>
              ) : evaluations.map(ev => (
                <tr key={ev.id} className="group hover:bg-amber-50/40 dark:hover:bg-amber-950/20 cursor-pointer"
                  onClick={() => navigate(`/evaluate/${ev.id}`)}>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-600 dark:text-amber-400">
                        <User size={16} />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-zinc-900 dark:text-white uppercase tracking-tight">{ev.agent_name}</p>
                        <p className="text-[10px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-widest mt-0.5">ID: #{ev.agent_id}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-xs font-bold text-zinc-700 dark:text-zinc-300">{ev.qa_name || '—'}</p>
                  </td>
                  <td className="px-6 py-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
                        <Tag size={11} />
                        <span className="text-[11px] font-medium uppercase tracking-tight">{ev.brand} / {ev.call_type}</span>
                      </div>
                      <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
                        <Calendar size={11} />
                        <span className="text-[11px] font-medium">{ev.date}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <Sparkles size={14} className="text-amber-500" />
                      <span className={`text-xl font-black tracking-tighter ${
                        ev.final_score >= 90 ? 'text-emerald-500' : ev.final_score >= 75 ? 'text-amber-500' : 'text-rose-500'
                      }`}>{ev.final_score}%</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <button onClick={(e) => { e.stopPropagation(); navigate(`/evaluate/${ev.id}`); }}
                      className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-amber-500 hover:border-amber-300 transition-all">
                      <Eye size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination && pagination.totalPages > 0 && (
          <div className="border-t border-zinc-100 dark:border-zinc-800 px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-600">
                {(pagination.currentPage - 1) * pagination.limit + 1}–{Math.min(pagination.currentPage * pagination.limit, pagination.totalItems)} of {pagination.totalItems}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-600">Per page</span>
                <select value={limit} onChange={(e) => { setLimit(parseInt(e.target.value, 10)); setPage(1); }}
                  className="text-xs font-bold bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-2 py-1">
                  {[10, 25, 50].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button disabled={!pagination.hasPrevPage} onClick={() => setPage(p => p - 1)}
                className="w-9 h-9 rounded-lg border border-zinc-200 dark:border-zinc-800 flex items-center justify-center text-zinc-500 hover:text-amber-500 disabled:opacity-30">
                <ChevronLeft size={16} />
              </button>
              <span className="px-3 text-xs font-black">{pagination.currentPage} / {pagination.totalPages}</span>
              <button disabled={!pagination.hasNextPage} onClick={() => setPage(p => p + 1)}
                className="w-9 h-9 rounded-lg border border-zinc-200 dark:border-zinc-800 flex items-center justify-center text-zinc-500 hover:text-amber-500 disabled:opacity-30">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
