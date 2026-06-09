import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/AuthContext';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  MessageSquare,
  Plus,
  CheckCircle,
  Clock,
  Search,
  Filter,
  ChevronDown,
  User as UserIcon,
  Calendar,
  Play,
  AlertCircle,
  Phone,
  Tag,
  X,
  Eye,
  ShieldAlert
} from 'lucide-react';
import { User } from '../types';

// ---------------------------------------------------------------------------
// Types & helpers
// ---------------------------------------------------------------------------

interface CoachingRequest {
  id: number;
  evaluation_id: number;
  tl_id: number;
  agent_id: number;
  customer_phone: string;
  call_type: string;
  error_description: string;
  tl_comment: string;
  status: 'Pending Employee Approval' | 'Approved' | 'In Progress' | 'Completed';
  created_at: string;
  agent_approved_at: string | null;
  session_started_at: string | null;
  completed_at: string | null;
  agent_name: string;
  tl_name: string;
  eval_brand: string;
  eval_score: number;
  eval_date: string;
}

function formatDuration(fromIso: string, toIso: string): string {
  const ms = new Date(toIso).getTime() - new Date(fromIso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  if (hrs < 24) return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
  const days = Math.floor(hrs / 24);
  const remH = hrs % 24;
  return remH > 0 ? `${days}d ${remH}h` : `${days}d`;
}

function fmt(ts: string | null | undefined): string {
  if (!ts) return '—';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return ts;
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function getStatusColor(status: CoachingRequest['status']): string {
  switch (status) {
    case 'Pending Employee Approval': return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
    case 'Approved': return 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20';
    case 'In Progress': return 'text-blue-400 bg-blue-500/10 border-blue-500/20';
    case 'Completed': return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
    default: return 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20';
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CoachingManagement() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();

  // --- Data state
  const [requests, setRequests] = useState<CoachingRequest[]>([]);
  const [agents, setAgents] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // --- Filter state (in-memory; this list is small enough)
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // --- Per-row action / detail modals
  const [requestActionId, setRequestActionId] = useState<number | null>(null);
  const [detailsTarget, setDetailsTarget] = useState<CoachingRequest | null>(null);

  // --- "New Session" modal (legacy free-form coaching plan, TL only)
  const [showNewSessionModal, setShowNewSessionModal] = useState(false);
  const [newSession, setNewSession] = useState({
    agent_id: '',
    weaknesses: '',
    notes: '',
    plan: '',
    evaluation_id: ''
  });

  const fetchRequests = async () => {
    if (!user?.id || !user?.role) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/coaching-requests?user_id=${user.id}&role=${user.role}`);
      if (!res.ok) throw new Error('Coaching requests fetch failed');
      const data = await res.json();
      setRequests(data);
    } catch (err) {
      console.error("Error fetching coaching requests:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const performRequestAction = async (id: number, action: 'approve' | 'start' | 'complete') => {
    setRequestActionId(id);
    try {
      const res = await fetch(`/api/coaching-requests/${id}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user?.id })
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      await fetchRequests();
      // If a detail modal is open for this row, refresh its data from the new list
      setDetailsTarget(prev => prev && prev.id === id ? null : prev);
    } catch (err) {
      console.error(`Coaching request ${action} failed:`, err);
      alert(`Action failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setRequestActionId(null);
    }
  };

  useEffect(() => {
    fetchRequests();
    if (user?.role === 'tl') {
      fetch('/api/users')
        .then(res => res.ok ? res.json() : Promise.reject(new Error('Users fetch failed')))
        .then(data => setAgents(data.filter((u: User) => u.role === 'agent' && u.tl_id === user.id)))
        .catch(console.error);
    }
  }, [user]);

  useEffect(() => {
    const agentId = searchParams.get('agent_id');
    const evalId = searchParams.get('evaluation_id');
    if (agentId) {
      setNewSession(prev => ({ ...prev, agent_id: agentId, evaluation_id: evalId || '' }));
      setShowNewSessionModal(true);
    }
  }, [searchParams]);

  const handleSubmitNewSession = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/coaching', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newSession, tl_id: user?.id }),
    });
    if (res.ok) {
      setShowNewSessionModal(false);
      setNewSession({ agent_id: '', weaknesses: '', notes: '', plan: '', evaluation_id: '' });
      // The "New Session" flow uses the legacy coaching_sessions table —
      // it doesn't affect this list, but a refresh is harmless.
    }
  };

  // -----------------------------------------------------------------------
  // Filter the in-memory list
  // -----------------------------------------------------------------------
  const filteredRequests = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return requests.filter(r => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (startDate && r.created_at < startDate) return false;
      // Inclusive end of day for end date filter
      if (endDate && r.created_at > `${endDate}T23:59:59`) return false;
      if (q) {
        const haystack = [
          r.agent_name, r.tl_name, r.call_type, r.eval_brand,
          r.customer_phone, `call #${r.evaluation_id}`, `#${r.id}`
        ].join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [requests, searchTerm, statusFilter, startDate, endDate]);

  const stats = useMemo(() => {
    const total = requests.length;
    const completed = requests.filter(r => r.status === 'Completed').length;
    const active = total - completed;
    return { total, completed, active };
  }, [requests]);

  const handleResetFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setStartDate('');
    setEndDate('');
  };

  // -----------------------------------------------------------------------
  return (
    <div className="space-y-4 max-w-[1400px] mx-auto">
      {/* Compact Header & Stats Banner (AuditList parity) */}
      <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-3 sm:p-4 shadow-sm">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-emerald-500 shrink-0">
              <MessageSquare size={16} />
            </div>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-black text-zinc-900 dark:text-white tracking-tighter uppercase italic leading-tight">Coaching Hub</h1>
              <p className="text-zinc-500 dark:text-zinc-500 text-[10px] font-medium leading-tight mt-0.5 hidden sm:block">
                Develop agent skills and track improvement requests in real-time.
              </p>
            </div>
          </div>

          <div className="flex gap-2 shrink-0 flex-wrap">
            <div className="bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800 px-3 sm:px-4 py-2 rounded-xl flex items-center gap-2 sm:gap-3">
              <p className="text-[9px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest leading-none">Total</p>
              <p className="text-base sm:text-lg font-black text-zinc-900 dark:text-white tracking-tighter leading-none">{stats.total}</p>
            </div>
            <div className="bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800 px-3 sm:px-4 py-2 rounded-xl flex items-center gap-2 sm:gap-3">
              <p className="text-[9px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest leading-none">Active</p>
              <p className="text-base sm:text-lg font-black text-indigo-600 dark:text-indigo-400 tracking-tighter leading-none">{stats.active}</p>
            </div>
            <div className="bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800 px-3 sm:px-4 py-2 rounded-xl flex items-center gap-2 sm:gap-3">
              <p className="text-[9px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest leading-none">Done</p>
              <p className="text-base sm:text-lg font-black text-emerald-600 dark:text-emerald-500 tracking-tighter leading-none">{stats.completed}</p>
            </div>

            {user?.role === 'tl' && (
              <button
                onClick={() => setShowNewSessionModal(true)}
                className="px-3 py-2 rounded-xl bg-indigo-600 text-white font-black text-[10px] uppercase tracking-widest shadow-lg shadow-indigo-500/20 hover:bg-indigo-500 transition-all flex items-center gap-2"
              >
                <Plus size={14} /> New Session
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Compact Filter Section */}
      <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-3 sm:p-4 shadow-sm">
        <div className="flex flex-col lg:flex-row gap-3 lg:items-end">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3 flex-1">
            {/* Status Filter */}
            <div>
              <label className="text-[9px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest block mb-1 ml-1">Status</label>
              <div className="relative">
                <select
                  className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg pl-3 pr-7 py-2 text-xs text-zinc-800 dark:text-zinc-100 outline-none focus:border-indigo-500 appearance-none cursor-pointer"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="all">Any Status</option>
                  <option value="Pending Employee Approval">Pending Employee Approval</option>
                  <option value="Approved">Approved</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Completed">Completed</option>
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-600 pointer-events-none" size={12} />
              </div>
            </div>

            {/* Date Filter: From (created_at) */}
            <div>
              <label className="text-[9px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest block mb-1 ml-1">From</label>
              <input
                type="date"
                className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-800 dark:text-zinc-100 outline-none focus:border-indigo-500 dark:[color-scheme:dark]"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>

            {/* Date Filter: To */}
            <div>
              <label className="text-[9px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest block mb-1 ml-1">To</label>
              <input
                type="date"
                className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-800 dark:text-zinc-100 outline-none focus:border-indigo-500 dark:[color-scheme:dark]"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>

            {/* Search Filter */}
            <div className="col-span-2 sm:col-span-3 lg:col-span-1">
              <label className="text-[9px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest block mb-1 ml-1">Search</label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-600" size={12} />
                <input
                  type="text"
                  placeholder="Agent, TL, brand…"
                  className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg pl-7 pr-3 py-2 text-xs text-zinc-800 dark:text-zinc-100 outline-none focus:border-indigo-500 placeholder:text-zinc-400"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="flex gap-2 lg:shrink-0 lg:pb-0">
            <button
              onClick={handleResetFilters}
              className="flex-1 lg:flex-none px-4 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 font-black text-[10px] uppercase tracking-widest border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-white transition-all active:scale-95"
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      {/* List Container (table view, mirrors AuditList) */}
      <div className="bg-white dark:bg-zinc-950/50 rounded-[2.5rem] border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-sm dark:shadow-2xl backdrop-blur-sm">
        <div className="overflow-x-auto -mx-4 sm:mx-0">
          <table className="w-full text-left border-collapse min-w-[920px]">
            <thead>
              <tr className="border-b border-zinc-100 dark:border-zinc-800/50">
                <th className="px-8 py-6 text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">Coaching Profile</th>
                <th className="px-8 py-6 text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">Call Metadata</th>
                <th className="px-8 py-6 text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">Performance</th>
                <th className="px-8 py-6 text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">Status</th>
                <th className="px-8 py-6 text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">Created</th>
                <th className="px-8 py-6 text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/30">
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={6} className="px-8 py-10">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-zinc-100 dark:bg-zinc-900/50 rounded-2xl" />
                        <div className="space-y-2">
                          <div className="w-32 h-3 bg-zinc-100 dark:bg-zinc-900/50 rounded-full" />
                          <div className="w-16 h-2 bg-zinc-100 dark:bg-zinc-900/50 rounded-full" />
                        </div>
                      </div>
                    </td>
                  </tr>
                ))
              ) : filteredRequests.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 sm:py-20 text-center text-zinc-400 dark:text-zinc-600 italic text-sm">
                    {requests.length === 0
                      ? (user?.role === 'tl' ? 'No coaching requests yet. Open All Calls and click "Coaching" on any row.' : 'No coaching requests in scope.')
                      : 'No coaching requests match the current filters.'}
                  </td>
                </tr>
              ) : (
                filteredRequests.map((r) => {
                  const isAgent = user?.role === 'agent' && Number(user.id) === r.agent_id;
                  const isTl = user?.role === 'tl' && Number(user.id) === r.tl_id;
                  const isBusy = requestActionId === r.id;
                  return (
                    <tr
                      key={r.id}
                      className="group hover:bg-zinc-50 dark:hover:bg-zinc-800/20 cursor-pointer"
                      onClick={() => setDetailsTarget(r)}
                    >
                      {/* Coaching Profile */}
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center text-zinc-400 group-hover:border-indigo-500 group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                            <UserIcon size={18} />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-zinc-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors uppercase tracking-tight">{r.agent_name}</p>
                            <p className="text-[10px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-widest mt-1">By {r.tl_name} · Call #{r.evaluation_id}</p>
                          </div>
                        </div>
                      </td>

                      {/* Call Metadata */}
                      <td className="px-8 py-6">
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
                            <Tag size={12} className="text-zinc-400 dark:text-zinc-600" />
                            <span className="text-[11px] font-medium tracking-tight uppercase">{r.eval_brand || '—'} / {r.call_type || '—'}</span>
                          </div>
                          <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
                            <Phone size={12} className="text-zinc-400 dark:text-zinc-600" />
                            <span className="text-[11px] font-medium tracking-tight whitespace-nowrap">{r.customer_phone || '—'}</span>
                          </div>
                        </div>
                      </td>

                      {/* Performance */}
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-4">
                          <div className="relative">
                            <span className={`text-xl font-black italic tracking-tighter ${
                              r.eval_score >= 90 ? 'text-emerald-500' :
                              r.eval_score >= 75 ? 'text-amber-500' : 'text-rose-500'
                            }`}>
                              {r.eval_score}%
                            </span>
                            {r.error_description && (
                              <div className="absolute -top-2 -right-2 text-rose-500" title={r.error_description}>
                                <ShieldAlert size={14} />
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-[80px] h-1.5 bg-zinc-100 dark:bg-zinc-900 rounded-full overflow-hidden border border-zinc-200 dark:border-zinc-800/50">
                            <div
                              className={`h-full transition-all duration-1000 ${
                                r.eval_score >= 90 ? 'bg-emerald-500' :
                                r.eval_score >= 75 ? 'bg-amber-500' : 'bg-rose-500'
                              }`}
                              style={{ width: `${r.eval_score}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-8 py-6">
                        <span className={`inline-block px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border ${getStatusColor(r.status)}`}>
                          {r.status}
                        </span>
                      </td>

                      {/* Created */}
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
                          <Calendar size={12} className="text-zinc-400 dark:text-zinc-600" />
                          <span className="text-[11px] font-medium tracking-tight whitespace-nowrap">{fmt(r.created_at)}</span>
                        </div>
                      </td>

                      {/* Actions (role-aware) */}
                      <td className="px-8 py-6">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setDetailsTarget(r); }}
                            className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-indigo-600 dark:hover:text-white hover:border-indigo-300 dark:hover:border-zinc-600 transition-all"
                            title="View Details"
                          >
                            <Eye size={16} />
                          </button>

                          {isAgent && r.status === 'Pending Employee Approval' && (
                            <button
                              disabled={isBusy}
                              onClick={(e) => { e.stopPropagation(); performRequestAction(r.id, 'approve'); }}
                              className="px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500 hover:text-white hover:border-emerald-500 transition-all flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
                              title="Approve coaching request"
                            >
                              <CheckCircle size={14} />
                              <span className="hidden md:inline">Approve</span>
                            </button>
                          )}

                          {isTl && r.status === 'Approved' && (
                            <button
                              disabled={isBusy}
                              onClick={(e) => { e.stopPropagation(); performRequestAction(r.id, 'start'); }}
                              className="px-3 py-2 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-600 dark:text-blue-400 hover:bg-blue-500 hover:text-white hover:border-blue-500 transition-all flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
                              title="Start coaching session"
                            >
                              <Play size={14} />
                              <span className="hidden md:inline">Start</span>
                            </button>
                          )}

                          {isTl && (r.status === 'Approved' || r.status === 'In Progress') && (
                            <button
                              disabled={isBusy}
                              onClick={(e) => { e.stopPropagation(); performRequestAction(r.id, 'complete'); }}
                              className="px-3 py-2 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500 hover:text-white hover:border-indigo-500 transition-all flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
                              title="Mark coaching as completed"
                            >
                              <CheckCircle size={14} />
                              <span className="hidden md:inline">Done</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer: showing count */}
        {!isLoading && filteredRequests.length > 0 && (
          <div className="bg-white dark:bg-zinc-950/50 border-t border-zinc-100 dark:border-zinc-800 px-8 py-4 flex items-center justify-between">
            <span className="text-[10px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-widest">
              Showing {filteredRequests.length} of {requests.length}
            </span>
            <span className="text-[10px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-widest">
              Live data
            </span>
          </div>
        )}
      </div>

      {/* -------------- Details modal -------------- */}
      {detailsTarget && createPortal(
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 sm:p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 bg-black/70 backdrop-blur-md"
            onClick={() => setDetailsTarget(null)}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="relative bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-[2rem] w-full max-w-xl shadow-2xl overflow-hidden"
          >
            <div className={`h-1 w-full ${detailsTarget.status === 'Completed' ? 'bg-emerald-500' : detailsTarget.status === 'In Progress' ? 'bg-blue-500' : detailsTarget.status === 'Approved' ? 'bg-indigo-500' : 'bg-amber-500'}`} />

            <div className="p-6 border-b border-zinc-100 dark:border-zinc-900 flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30">
                  <MessageSquare size={18} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-zinc-900 dark:text-white uppercase tracking-tighter leading-tight">Coaching #{detailsTarget.id}</h3>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-600 mt-1">
                    Call #{detailsTarget.evaluation_id} • {detailsTarget.eval_brand}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setDetailsTarget(null)}
                className="p-2 rounded-lg text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 hover:text-rose-500 transition-colors"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500 dark:text-zinc-500">Current status</span>
                <span className={`inline-block px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border ${getStatusColor(detailsTarget.status)}`}>
                  {detailsTarget.status}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800 rounded-2xl p-4">
                  <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-600">Team Leader</p>
                  <p className="mt-1 text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
                    <UserIcon size={13} className="text-indigo-500" />
                    {detailsTarget.tl_name}
                  </p>
                </div>
                <div className="bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800 rounded-2xl p-4">
                  <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-600">Agent</p>
                  <p className="mt-1 text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
                    <UserIcon size={13} className="text-emerald-500" />
                    {detailsTarget.agent_name}
                  </p>
                </div>
                <div className="bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800 rounded-2xl p-4">
                  <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-600">Phone</p>
                  <p className="mt-1 text-sm font-bold text-zinc-900 dark:text-white">{detailsTarget.customer_phone || '—'}</p>
                </div>
                <div className="bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800 rounded-2xl p-4">
                  <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-600">Score</p>
                  <p className={`mt-1 text-sm font-bold ${detailsTarget.eval_score >= 90 ? 'text-emerald-500' : detailsTarget.eval_score >= 75 ? 'text-amber-500' : 'text-rose-500'}`}>
                    {detailsTarget.eval_score}%
                  </p>
                </div>
              </div>

              {detailsTarget.error_description && (
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-rose-500 dark:text-rose-400 mb-2 flex items-center gap-1.5">
                    <AlertCircle size={11} /> Issues from this call
                  </p>
                  <pre className="text-xs text-zinc-700 dark:text-zinc-300 bg-rose-500/5 border border-rose-500/20 rounded-2xl p-4 whitespace-pre-wrap font-sans">
                    {detailsTarget.error_description}
                  </pre>
                </div>
              )}

              {detailsTarget.tl_comment && (
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-600 mb-2">TL Notes</p>
                  <p className="text-sm text-zinc-700 dark:text-zinc-300 bg-zinc-50 dark:bg-zinc-900/30 border border-zinc-100 dark:border-zinc-800 rounded-2xl p-4 whitespace-pre-wrap">
                    {detailsTarget.tl_comment}
                  </p>
                </div>
              )}

              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-600 mb-3">Timeline</p>
                <div className="space-y-2">
                  {[
                    { key: 'created_at', label: 'Requested by TL', ts: detailsTarget.created_at },
                    { key: 'agent_approved_at', label: 'Agent approved', ts: detailsTarget.agent_approved_at },
                    { key: 'session_started_at', label: 'Session started', ts: detailsTarget.session_started_at },
                    { key: 'completed_at', label: 'Session completed', ts: detailsTarget.completed_at },
                  ].map(stage => {
                    const reached = !!stage.ts;
                    return (
                      <div key={stage.key} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border ${reached ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-zinc-50 dark:bg-zinc-900/30 border-zinc-100 dark:border-zinc-800'}`}>
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${reached ? 'bg-emerald-500 text-white' : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-600'}`}>
                          <Clock size={12} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs font-bold ${reached ? 'text-zinc-900 dark:text-white' : 'text-zinc-400 dark:text-zinc-600'}`}>{stage.label}</p>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-600 mt-0.5">
                            {fmt(stage.ts)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {detailsTarget.completed_at && (
                  <p className="mt-2 text-[10px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400 text-right">
                    Total duration: {formatDuration(detailsTarget.created_at, detailsTarget.completed_at)}
                  </p>
                )}
              </div>
            </div>

            <div className="px-6 pb-6">
              <button
                type="button"
                onClick={() => setDetailsTarget(null)}
                className="w-full py-3 rounded-xl bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-black text-[10px] uppercase tracking-widest transition-colors"
              >
                Close
              </button>
            </div>
          </motion.div>
        </div>,
        document.body
      )}

      {/* -------------- New Session modal (legacy TL flow) -------------- */}
      {showNewSessionModal && createPortal(
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[110] flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 w-full max-w-2xl rounded-[3rem] overflow-hidden shadow-2xl relative my-auto"
          >
            <div className="p-6 sm:p-8 lg:p-10 border-b border-zinc-100 dark:border-zinc-800/50 flex items-center justify-between bg-white dark:bg-zinc-950/20">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-indigo-600/10 border border-indigo-500/20 rounded-[1.5rem] flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                  <MessageSquare size={28} />
                </div>
                <div>
                  <h3 className="text-xl sm:text-2xl font-black text-zinc-900 dark:text-white tracking-tighter uppercase italic">New Session</h3>
                  <p className="text-[10px] font-black text-indigo-600 dark:text-indigo-500 uppercase tracking-widest mt-1">Improvement Protocol</p>
                </div>
              </div>
              <button onClick={() => setShowNewSessionModal(false)} className="p-2 text-zinc-400 dark:text-zinc-600 hover:text-zinc-600 dark:hover:text-white transition-colors">
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmitNewSession} className="p-6 sm:p-8 lg:p-10 space-y-6 sm:space-y-8">
              <div className="space-y-4">
                <label className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest ml-2">Target Agent</label>
                <select
                  className="w-full bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-2xl px-6 py-4 text-sm text-zinc-800 dark:text-white outline-none focus:border-indigo-500 appearance-none cursor-pointer shadow-sm"
                  value={newSession.agent_id}
                  onChange={(e) => setNewSession({ ...newSession, agent_id: e.target.value })}
                  required
                >
                  <option value="">Select from your team...</option>
                  {agents.map(a => <option key={a.id} value={a.id}>{a.display_name}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                <div className="space-y-4">
                  <label className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest ml-2">Weaknesses Identified</label>
                  <textarea
                    className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl px-6 py-4 text-sm text-zinc-800 dark:text-white outline-none focus:border-indigo-500 resize-none shadow-sm placeholder:text-zinc-400"
                    rows={4}
                    placeholder="Identify keys gap in performance..."
                    value={newSession.weaknesses}
                    onChange={(e) => setNewSession({ ...newSession, weaknesses: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-4">
                  <label className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest ml-2">Success Action Plan</label>
                  <textarea
                    className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl px-6 py-4 text-sm text-zinc-800 dark:text-white outline-none focus:border-indigo-500 resize-none shadow-sm placeholder:text-zinc-400"
                    rows={4}
                    placeholder="Step-by-step improvement roadmap..."
                    value={newSession.plan}
                    onChange={(e) => setNewSession({ ...newSession, plan: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="space-y-4">
                <label className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest ml-2">Internal Notes (Optional)</label>
                <textarea
                  className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl px-6 py-4 text-sm text-zinc-800 dark:text-white outline-none focus:border-indigo-500 transition-all resize-none shadow-sm placeholder:text-zinc-400"
                  rows={2}
                  placeholder="Private observations..."
                  value={newSession.notes}
                  onChange={(e) => setNewSession({ ...newSession, notes: e.target.value })}
                />
              </div>

              <div className="flex justify-end gap-4 pt-4 border-t border-zinc-100 dark:border-zinc-800/50">
                <button type="button" onClick={() => setShowNewSessionModal(false)} className="px-6 py-3 rounded-xl bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 font-black text-[10px] uppercase tracking-widest">
                  Cancel
                </button>
                <button type="submit" className="px-8 py-3 rounded-xl bg-indigo-600 text-white font-black text-[10px] uppercase tracking-widest shadow-xl shadow-indigo-500/20 hover:bg-indigo-500 transition-all active:scale-[0.98]">
                  Launch Protocol
                </button>
              </div>
            </form>
          </motion.div>
        </div>,
        document.body
      )}
    </div>
  );
}
