import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import CoachingRequestDialog from '../components/CoachingRequestDialog';
import CoachingDetailsDialog from '../components/CoachingDetailsDialog';
import { useAuth } from '../context/AuthContext';
import {
  Search,
  Filter,
  FileText,
  Eye,
  Download,
  Mail,
  Calendar,
  User,
  Tag,
  BarChart3,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  MessageSquare,
  MoreHorizontal,
  ChevronDown,
  ArrowRightLeft,
  X,
  Clock,
  Hourglass,
  Pencil,
  History
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Evaluation } from '../types';

interface PaginationData {
  totalItems: number;
  totalPages: number;
  currentPage: number;
  limit: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export default function AuditList() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [pagination, setPagination] = useState<PaginationData | null>(null);
  const [agents, setAgents] = useState<{id: number, display_name: string}[]>([]);
  
  // Filter States (Initial from URL or defaults)
  const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '');
  const [selectedAgent, setSelectedAgent] = useState(searchParams.get('agent_id') || 'all');
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || 'all');
  const [coachingFilter, setCoachingFilter] = useState(searchParams.get('coaching_status') || 'all');
  const [startDate, setStartDate] = useState(searchParams.get('from_date') || '');
  const [endDate, setEndDate] = useState(searchParams.get('to_date') || '');

  const [isLoading, setIsLoading] = useState(true);
  const [isChangingPage, setIsChangingPage] = useState(false);

  // Evaluation row the TL clicked "Coaching" on — opens the request dialog.
  const [coachingTarget, setCoachingTarget] = useState<Evaluation | null>(null);
  // Evaluation row whose coaching badge was clicked — opens the details modal.
  const [coachingDetails, setCoachingDetails] = useState<Evaluation | null>(null);

  // Agent escalation (dispute) request flow.
  const [escalateTarget, setEscalateTarget] = useState<Evaluation | null>(null);
  const [escalateReason, setEscalateReason] = useState('');
  const [isEscalating, setIsEscalating] = useState(false);
  const [escalateError, setEscalateError] = useState('');

  // Edit-history viewer (admin/supervisor): who edited this call, what & when.
  const [historyTarget, setHistoryTarget] = useState<Evaluation | null>(null);
  const [editHistory, setEditHistory] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const openEditHistory = async (audit: Evaluation) => {
    setHistoryTarget(audit);
    setEditHistory([]);
    setIsLoadingHistory(true);
    try {
      const res = await fetch(`/api/evaluations/${audit.id}/edits`);
      const data = await res.json();
      setEditHistory(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // An agent may escalate a call only when it's visible to them ('Sent to
  // Agent'), scored below 100, and has never been escalated before. Calls
  // already in / past the Leader↔Quality cycle are excluded.
  const canAgentEscalate = useCallback((audit: Evaluation) => (
    user?.role === 'agent' &&
    audit.status === 'Sent to Agent' &&
    audit.final_score < 100 &&
    !audit.agent_escalation_status
  ), [user]);

  const submitAgentEscalation = async () => {
    if (!escalateTarget || !user?.id) return;
    setIsEscalating(true);
    setEscalateError('');
    try {
      const res = await fetch(`/api/evaluations/${escalateTarget.id}/agent-escalate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id, reason: escalateReason.trim() }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        setEscalateError(result.error || 'Failed to submit escalation request.');
        return;
      }
      setEscalateTarget(null);
      setEscalateReason('');
      fetchEvaluations(searchParams);
    } catch (err) {
      setEscalateError('Network error — please try again.');
    } finally {
      setIsEscalating(false);
    }
  };

  const fetchEvaluations = useCallback(async (params: URLSearchParams) => {
    setIsChangingPage(true);
    try {
      const queryParams = new URLSearchParams(params);
      queryParams.set('user_id', user?.id?.toString() || '');
      queryParams.set('role', user?.role || '');
      
      const res = await fetch(`/api/evaluations?${queryParams.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch evaluations');
      const result = await res.json();
      
      setEvaluations(result.data || []);
      setPagination(result.pagination);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
      setIsChangingPage(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [user]);

  useEffect(() => {
    fetch('/api/users')
      .then(res => res.json())
      .then(data => setAgents(data.filter((u: any) => u.role === 'agent')))
      .catch(console.error);
  }, []);

  // Form-settings question map — used to expand response IDs into real
  // question labels when building the "send by email" body.
  const [questionMap, setQuestionMap] = useState<Record<string, { label: string; critical: boolean; weight: number }>>({});
  useEffect(() => {
    fetch('/api/settings/form')
      .then(res => res.ok ? res.json() : Promise.reject())
      .then((settings: any[]) => {
        const map: Record<string, { label: string; critical: boolean; weight: number }> = {};
        for (const s of settings) {
          if (s.field_type !== 'eval_question') continue;
          let cfg: any = {};
          try { cfg = typeof s.value === 'string' ? JSON.parse(s.value) : (s.value || {}); } catch {}
          map[String(s.id)] = {
            label: s.label_en || `Question #${s.id}`,
            critical: !!cfg.critical,
            weight: Number(cfg.weight) || 0,
          };
        }
        setQuestionMap(map);
      })
      .catch(() => {});
  }, []);

  // Builds a plain-text email body summarising the call. Opens the OS
  // default mail client via mailto: AND copies the same text to the
  // clipboard so the QA can paste into webmail if mailto: is blocked.
  const handleEmailCall = useCallback(async (audit: any) => {
    const data: any = audit.data || {};
    const lines: string[] = [];
    lines.push(`Call Audit #${audit.id}`);
    lines.push('====================');
    lines.push('');
    lines.push(`Agent:           ${audit.agent_name || `#${audit.agent_id}`}`);
    if (audit.qa_name) lines.push(`Evaluator (QA):  ${audit.qa_name}`);
    lines.push(`Brand:           ${audit.brand || '—'}`);
    lines.push(`Call Type:       ${audit.call_type || '—'}`);
    lines.push(`Call Date:       ${audit.date || '—'}`);
    if (data.customer_phone) lines.push(`Customer Phone:  ${data.customer_phone}`);
    if (data.call_duration) lines.push(`Call Duration:   ${data.call_duration}`);
    lines.push('');
    lines.push(`Final Score:     ${audit.final_score}%`);
    lines.push(`Status:          ${audit.status}`);
    lines.push(`Critical Fail:   ${audit.critical_failure ? 'YES' : 'No'}`);

    // Critical-failure reasons (when QA manually forced the zero).
    if (data.force_zero_score && Array.isArray(data.critical_failure_reasons) && data.critical_failure_reasons.length) {
      lines.push('');
      lines.push(`Marked-as-Critical reasons (${data.critical_failure_reasons.length}):`);
      data.critical_failure_reasons.forEach((r: string) => lines.push(`  • ${r}`));
    }

    // Failed evaluation items, resolved against the form-settings map.
    const responses = data.responses || {};
    const failedIds = Object.keys(responses).filter(k => responses[k] === 'No');
    if (failedIds.length) {
      lines.push('');
      lines.push(`Failed items (${failedIds.length}):`);
      failedIds.forEach(qid => {
        const meta = questionMap[String(qid)];
        const label = meta?.label || `Question #${qid}`;
        const tags: string[] = [];
        if (meta?.weight) tags.push(`-${meta.weight}%`);
        if (meta?.critical) tags.push('CRITICAL');
        lines.push(`  • ${label}${tags.length ? ` (${tags.join(' · ')})` : ''}`);
      });
    }

    // Common-issue tags.
    if (Array.isArray(data.common_issues) && data.common_issues.length) {
      lines.push('');
      lines.push(`Common Issues:   ${data.common_issues.join(', ')}`);
    }

    // QA general note / error description.
    const generalNote = data?.feedback?.error_description || data?.feedback?.general;
    if (generalNote) {
      lines.push('');
      lines.push('QA Note:');
      lines.push(String(generalNote).trim());
    }

    // Coaching status if any.
    if (audit.coaching) {
      lines.push('');
      lines.push(`Coaching:        ${audit.coaching.status}`);
      if (audit.coaching.tl_name) lines.push(`Coached by:      ${audit.coaching.tl_name}`);
      if (audit.coaching.completed_at) lines.push(`Completed:       ${audit.coaching.completed_at}`);
    }

    lines.push('');
    lines.push(`Open in system:  ${window.location.origin}/evaluate/${audit.id}`);

    const body = lines.join('\n');
    const subject = `Call Audit #${audit.id} — ${audit.agent_name || ''} · ${audit.final_score}%`;

    // Copy to clipboard (best-effort) so the QA can paste into any client.
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(body);
      }
    } catch {
      // Clipboard access can be denied; fall back to mailto: only.
    }

    // Open the OS default mail client with subject + body pre-filled.
    const mailto = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;
  }, [questionMap]);

  useEffect(() => {
    fetchEvaluations(searchParams);
  }, [searchParams, fetchEvaluations]);

  const updateFilters = (newParams: Record<string, string | number>) => {
    const params = new URLSearchParams(searchParams);
    Object.entries(newParams).forEach(([key, value]) => {
      if (value === 'all' || value === '') {
        params.delete(key);
      } else {
        params.set(key, value.toString());
      }
    });
    // Reset to page 1 on filter change if page wasn't specifically passed
    if (newParams.page === undefined) params.set('page', '1');
    setSearchParams(params);
  };

  const handleApplyFilters = () => {
    updateFilters({
      agent_id: selectedAgent,
      status: statusFilter,
      coaching_status: coachingFilter,
      from_date: startDate,
      to_date: endDate,
      search: searchTerm,
      page: 1
    });
  };

  const handleResetFilters = () => {
    setSearchTerm('');
    setSelectedAgent('all');
    setStatusFilter('all');
    setCoachingFilter('all');
    setStartDate('');
    setEndDate('');
    setSearchParams({});
  };

  const handlePageChange = (page: number) => {
    updateFilters({ page });
  };

  const handleLimitChange = (limit: number) => {
    updateFilters({ limit, page: 1 });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Sent to Agent': return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
      case 'Pending Review': return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
      case 'Escalated': return 'text-rose-400 bg-rose-500/10 border-rose-500/20';
      case 'Quality Approved': return 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20';
      case 'Rejected by Quality': return 'text-rose-500 bg-rose-500/10 border-rose-500/20';
      default: return 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20';
    }
  };

  // Memoize average so we don't reduce on every render
  const averageScore = useMemo(() => {
    if (evaluations.length === 0) return 0;
    return Math.round(evaluations.reduce((acc, curr) => acc + curr.final_score, 0) / evaluations.length);
  }, [evaluations]);

  return (
    <div className="space-y-4 max-w-[1400px] mx-auto">
      {/* Compact Header & Stats Banner */}
      <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-3 sm:p-4 shadow-sm">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-emerald-500 shrink-0">
              <FileText size={16} />
            </div>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-black text-zinc-900 dark:text-white tracking-tighter uppercase italic leading-tight">All Calls</h1>
              <p className="text-zinc-500 dark:text-zinc-500 text-[10px] font-medium leading-tight mt-0.5 hidden sm:block">
                Complete archive of call evaluations and quality metrics.
              </p>
            </div>
          </div>

          <div className="flex gap-2 shrink-0">
            <div className="bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800 px-3 sm:px-4 py-2 rounded-xl flex items-center gap-2 sm:gap-3">
              <p className="text-[9px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest leading-none">Total</p>
              <p className="text-base sm:text-lg font-black text-zinc-900 dark:text-white tracking-tighter leading-none">{pagination?.totalItems || 0}</p>
            </div>
            <div className="bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800 px-3 sm:px-4 py-2 rounded-xl flex items-center gap-2 sm:gap-3">
              <p className="text-[9px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest leading-none">Avg</p>
              <p className="text-base sm:text-lg font-black text-indigo-600 dark:text-emerald-500 tracking-tighter leading-none">
                {averageScore}%
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Compact Filter Section */}
      <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-3 sm:p-4 shadow-sm">
        <div className="flex flex-col lg:flex-row gap-3 lg:items-end">
          {/* Filters Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3 flex-1">
            {/* Agent Filter */}
            <div>
              <label className="text-[9px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest block mb-1 ml-1">Agent</label>
              <div className="relative">
                <select
                  className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg pl-3 pr-7 py-2 text-xs text-zinc-800 dark:text-zinc-100 outline-none focus:border-indigo-500 appearance-none cursor-pointer"
                  value={selectedAgent}
                  onChange={(e) => setSelectedAgent(e.target.value)}
                >
                  <option value="all">All Agents</option>
                  {agents.map(a => (
                    <option key={a.id} value={a.id}>{a.display_name}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-600 pointer-events-none" size={12} />
              </div>
            </div>

            {/* Date Filter: From */}
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
                  <option value="Pending Review">Pending Review</option>
                  <option value="Sent to Agent">Sent to Agent</option>
                  <option value="Escalated">Escalated</option>
                  <option value="Reevaluated">Reevaluated</option>
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-600 pointer-events-none" size={12} />
              </div>
            </div>

            {/* Coaching Filter */}
            <div>
              <label className="text-[9px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest block mb-1 ml-1">Coaching</label>
              <div className="relative">
                <select
                  className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg pl-3 pr-7 py-2 text-xs text-zinc-800 dark:text-zinc-100 outline-none focus:border-indigo-500 appearance-none cursor-pointer"
                  value={coachingFilter}
                  onChange={(e) => setCoachingFilter(e.target.value)}
                >
                  <option value="all">All Calls</option>
                  <option value="coached">Coached Only</option>
                  <option value="not_coached">Not Coached Only</option>
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-600 pointer-events-none" size={12} />
              </div>
            </div>

            {/* Search Filter */}
            <div className="col-span-2 sm:col-span-3 lg:col-span-1">
              <label className="text-[9px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest block mb-1 ml-1">Search</label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-600" size={12} />
                <input
                  type="text"
                  placeholder="Brand, type..."
                  className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg pl-7 pr-3 py-2 text-xs text-zinc-800 dark:text-zinc-100 outline-none focus:border-indigo-500 placeholder:text-zinc-400"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleApplyFilters()}
                />
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 lg:shrink-0 lg:pb-0">
            <button
              onClick={handleResetFilters}
              className="flex-1 lg:flex-none px-4 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 font-black text-[10px] uppercase tracking-widest border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-white transition-all active:scale-95"
            >
              Reset
            </button>
            <button
              onClick={handleApplyFilters}
              className="flex-1 lg:flex-none px-4 py-2 rounded-lg bg-indigo-600 text-white font-black text-[10px] uppercase tracking-widest shadow-lg shadow-indigo-500/20 hover:bg-indigo-500 transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              <Filter size={12} />
              Apply
            </button>
          </div>
        </div>
      </div>

      {/* List Container */}
      <div className="bg-white dark:bg-zinc-950/50 rounded-[2.5rem] border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-sm dark:shadow-2xl backdrop-blur-sm">
        <div className="overflow-x-auto -mx-4 sm:mx-0">
          <table className="w-full text-left border-collapse min-w-[860px]">
            <thead>
              <tr className="border-b border-zinc-100 dark:border-zinc-800/50">
                <th className="px-8 py-6 text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">Audit Profile</th>
                <th className="px-8 py-6 text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">Metadata</th>
                <th className="px-8 py-6 text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">Performance</th>
                <th className="px-8 py-6 text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">Status</th>
                <th className="px-8 py-6 text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">Coaching</th>
                <th className="px-8 py-6 text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/30">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
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
              ) : evaluations.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 sm:py-20 text-center text-zinc-400 dark:text-zinc-600 italic text-sm">
                    No audits found matching your criteria.
                  </td>
                </tr>
              ) : (
                <>
                  {evaluations.map((audit) => (
                    <tr
                      key={audit.id}
                      className={`group cursor-pointer ${isChangingPage ? 'opacity-30' : ''} ${
                        audit.last_edited_at
                          ? 'bg-indigo-50/70 dark:bg-indigo-500/10 hover:bg-indigo-100/70 dark:hover:bg-indigo-500/15'
                          : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/20'
                      }`}
                      onClick={() => navigate(`/evaluate/${audit.id}`)}
                    >
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center text-zinc-400 group-hover:border-indigo-500 group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                          <User size={18} />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-zinc-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors uppercase tracking-tight">{audit.agent_name}</p>
                          <p className="text-[10px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-widest mt-1">ID: #{audit.agent_id}</p>
                          {audit.last_edited_at && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); openEditHistory(audit); }}
                              className="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest border bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30 hover:bg-indigo-500 hover:text-white hover:border-indigo-500 transition-colors"
                              title={`Edited${audit.last_editor_name ? ` by ${audit.last_editor_name}` : ''}${audit.last_edited_at ? ` · ${new Date(audit.last_edited_at).toLocaleString()}` : ''} — click for history`}
                            >
                              <Pencil size={10} /> Edited
                            </button>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
                          <Tag size={12} className="text-zinc-400 dark:text-zinc-600" />
                          <span className="text-[11px] font-medium tracking-tight uppercase">{audit.brand} / {audit.call_type}</span>
                        </div>
                        <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
                          <Calendar size={12} className="text-zinc-400 dark:text-zinc-600" />
                          <span className="text-[11px] font-medium tracking-tight whitespace-nowrap">{audit.date}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-4">
                        <div className="relative">
                          <span className={`text-xl font-black italic tracking-tighter ${
                            audit.final_score >= 90 ? 'text-emerald-500' : 
                            audit.final_score >= 75 ? 'text-amber-500' : 'text-rose-500'
                          }`}>
                            {audit.final_score}%
                          </span>
                          {audit.critical_failure && (
                            <div className="absolute -top-2 -right-2 text-rose-500 animate-bounce" title="Critical Failure">
                              <ShieldAlert size={14} />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-[80px] h-1.5 bg-zinc-100 dark:bg-zinc-900 rounded-full overflow-hidden border border-zinc-200 dark:border-zinc-800/50">
                           <div 
                             className={`h-full transition-all duration-1000 ${
                               audit.final_score >= 90 ? 'bg-emerald-500' : 
                               audit.final_score >= 75 ? 'bg-amber-500' : 'bg-rose-500'
                             }`}
                             style={{ width: `${audit.final_score}%` }}
                           />
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <span className={`inline-block px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border ${getStatusColor(audit.status)}`}>
                        {audit.status}
                      </span>
                    </td>
                    <td className="px-8 py-6">
                      {audit.coaching && audit.coaching.status === 'Completed' ? (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setCoachingDetails(audit); }}
                          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500 hover:text-white hover:border-emerald-500 transition-colors"
                          title="Click for coaching details"
                        >
                          <span aria-hidden>✓</span>
                          Coached
                        </button>
                      ) : audit.coaching ? (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setCoachingDetails(audit); }}
                          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30 hover:bg-indigo-500 hover:text-white hover:border-indigo-500 transition-colors"
                          title="Coaching in progress — click for details"
                        >
                          <span aria-hidden>⋯</span>
                          {audit.coaching.status}
                        </button>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border bg-zinc-100 dark:bg-zinc-900/50 text-zinc-500 dark:text-zinc-500 border-zinc-200 dark:border-zinc-800"
                          title="No coaching session yet"
                        >
                          <span aria-hidden>⏳</span>
                          Not Coached
                        </span>
                      )}
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex items-center justify-center gap-2">
                         <button
                           onClick={(e) => { e.stopPropagation(); navigate(`/evaluate/${audit.id}`); }}
                           className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-indigo-600 dark:hover:text-white hover:border-indigo-300 dark:hover:border-zinc-600 transition-all"
                           title="View Details"
                         >
                           <Eye size={16} />
                         </button>
                         {(user?.role === 'qa' || user?.role === 'supervisor') && (
                           <button
                             onClick={(e) => { e.stopPropagation(); navigate(`/evaluate/${audit.id}?edit=1`); }}
                             className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500 hover:text-white hover:border-amber-500 transition-all"
                             title="Edit this call"
                           >
                             <Pencil size={16} />
                           </button>
                         )}
                         {(user?.role === 'qa' || user?.role === 'supervisor') && (
                           <button
                             onClick={(e) => { e.stopPropagation(); handleEmailCall(audit); }}
                             className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500 hover:text-white hover:border-indigo-500 transition-all"
                             title="Email call details — copies to clipboard and opens your mail client"
                           >
                             <Mail size={16} />
                           </button>
                         )}
                         {user?.role === 'tl' && (
                           <button
                             onClick={(e) => {
                               e.stopPropagation();
                               setCoachingTarget(audit);
                             }}
                             className="px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500 hover:text-white hover:border-emerald-500 transition-all flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest"
                             title="Request Coaching for this call"
                           >
                             <MessageSquare size={14} />
                             <span className="hidden md:inline">Coaching</span>
                           </button>
                         )}

                         {/* Agent escalation (dispute) — button + status badges */}
                         {canAgentEscalate(audit) && (
                           <button
                             onClick={(e) => { e.stopPropagation(); setEscalateError(''); setEscalateReason(''); setEscalateTarget(audit); }}
                             className="px-3 py-2 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500 hover:text-white hover:border-indigo-500 transition-all flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest"
                             title="Request a re-review of this call from your Team Leader"
                           >
                             <ArrowRightLeft size={14} />
                             <span className="hidden md:inline">Escalate</span>
                           </button>
                         )}
                         {user?.role === 'agent' && audit.agent_escalation_status === 'pending' && (
                           <span
                             className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest border bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
                             title="Awaiting your Team Leader's decision"
                           >
                             <Hourglass size={14} />
                             <span className="hidden md:inline">Pending</span>
                           </span>
                         )}
                         {user?.role === 'agent' && audit.agent_escalation_status === 'rejected' && (
                           <span
                             className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest border bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30"
                             title={audit.agent_escalation_response ? `Reason: ${audit.agent_escalation_response}` : 'Your escalation request was rejected'}
                           >
                             <X size={14} />
                             <span className="hidden md:inline">Rejected</span>
                           </span>
                         )}

                         <button
                           onClick={(e) => e.stopPropagation()}
                           className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-indigo-600 dark:hover:text-white hover:border-indigo-300 dark:hover:border-zinc-600 transition-all"
                           title="Download"
                         >
                           <Download size={16} />
                         </button>
                      </div>
                    </td>
                  </tr>
                ))}
                </>
              )}
            </tbody>
          </table>
        </div>

        {/* Improved Pagination Footer */}
        {pagination && pagination.totalPages > 0 && (
          <div className="bg-white dark:bg-zinc-950/50 border-t border-zinc-100 dark:border-zinc-800 px-8 py-6 flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-6">
              <div className="flex flex-col">
                <span className="text-[10px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-widest">Showing</span>
                <span className="text-xs font-black text-zinc-800 dark:text-white italic">
                  {(pagination.currentPage - 1) * pagination.limit + 1} - {Math.min(pagination.currentPage * pagination.limit, pagination.totalItems)}
                  <span className="text-zinc-500 dark:text-zinc-600 font-medium not-italic ml-2">of {pagination.totalItems} Audits</span>
                </span>
              </div>
              
              <div className="h-8 w-px bg-zinc-200 dark:bg-zinc-900" />

              <div className="flex items-center gap-3">
                <span className="text-[10px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-widest">Limit</span>
                <div className="flex p-1 bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl">
                  {[10, 25, 50].map((l) => (
                    <button
                      key={l}
                      onClick={() => handleLimitChange(l)}
                      className={`px-3 py-1 rounded-lg text-[9px] font-black transition-all ${
                        pagination.limit === l 
                          ? 'bg-white dark:bg-zinc-800 text-indigo-600 dark:text-white shadow-sm' 
                          : 'text-zinc-500 dark:text-zinc-600 hover:text-zinc-700 dark:hover:text-zinc-400'
                      }`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex gap-1">
                <button
                  disabled={!pagination.hasPrevPage}
                  onClick={() => handlePageChange(pagination.currentPage - 1)}
                  className="w-10 h-10 rounded-xl border border-zinc-200 dark:border-zinc-800 flex items-center justify-center text-zinc-400 dark:text-zinc-500 hover:text-indigo-600 dark:hover:text-white hover:bg-zinc-50 dark:hover:bg-zinc-900 disabled:opacity-20 disabled:cursor-not-allowed transition-all"
                >
                  <ChevronLeft size={18} />
                </button>
                
                <div className="flex items-center gap-1 mx-2">
                  {(() => {
                    const { totalPages, currentPage } = pagination;
                    const pages = [];
                    const startPage = Math.max(1, currentPage - 1);
                    const endPage = Math.min(totalPages, currentPage + 1);

                    if (startPage > 1) {
                      pages.push(
                        <button key={1} onClick={() => handlePageChange(1)} className="w-10 h-10 rounded-xl text-xs font-black transition-all hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-400 dark:text-zinc-500">1</button>
                      );
                      if (startPage > 2) pages.push(<span key="dots-start" className="text-zinc-300 dark:text-zinc-700 italic"><MoreHorizontal size={14} /></span>);
                    }

                    for (let i = startPage; i <= endPage; i++) {
                      pages.push(
                        <button
                          key={i}
                          onClick={() => handlePageChange(i)}
                          className={`w-10 h-10 rounded-xl text-xs font-black transition-all ${
                            currentPage === i 
                              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' 
                              : 'hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-400 dark:text-zinc-500 hover:text-zinc-800 dark:hover:text-white'
                          }`}
                        >
                          {i}
                        </button>
                      );
                    }

                    if (endPage < totalPages) {
                      if (endPage < totalPages - 1) pages.push(<span key="dots-end" className="text-zinc-300 dark:text-zinc-700 italic"><MoreHorizontal size={14} /></span>);
                      pages.push(
                        <button key={totalPages} onClick={() => handlePageChange(totalPages)} className="w-10 h-10 rounded-xl text-xs font-black transition-all hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-400 dark:text-zinc-500">{totalPages}</button>
                      );
                    }
                    return pages;
                  })()}
                </div>

                <button
                  disabled={!pagination.hasNextPage}
                  onClick={() => handlePageChange(pagination.currentPage + 1)}
                  className="w-10 h-10 rounded-xl border border-zinc-200 dark:border-zinc-800 flex items-center justify-center text-zinc-400 dark:text-zinc-500 hover:text-indigo-600 dark:hover:text-white hover:bg-zinc-50 dark:hover:bg-zinc-900 disabled:opacity-20 disabled:cursor-not-allowed transition-all"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {coachingTarget && user?.id && (
        <CoachingRequestDialog
          evaluation={coachingTarget}
          tlId={user.id}
          onClose={() => setCoachingTarget(null)}
          onSubmitted={() => setCoachingTarget(null)}
        />
      )}

      {coachingDetails?.coaching && (
        <CoachingDetailsDialog
          coaching={coachingDetails.coaching}
          evaluationId={coachingDetails.id}
          onClose={() => setCoachingDetails(null)}
        />
      )}

      {/* Agent escalation request modal */}
      {escalateTarget && createPortal(
        <div
          onClick={() => !isEscalating && setEscalateTarget(null)}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md overflow-y-auto"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-3xl overflow-hidden bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl my-auto"
          >
            <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-zinc-50 dark:bg-zinc-950/50">
              <div className="flex items-center gap-3 min-w-0">
                <div className="shrink-0 p-2 rounded-xl border bg-indigo-500/10 border-indigo-500/20 text-indigo-600 dark:text-indigo-400">
                  <ArrowRightLeft size={22} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-lg font-bold text-zinc-900 dark:text-white uppercase tracking-tight truncate">Escalate Call</h3>
                  <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mt-1 truncate">
                    {escalateTarget.brand} / {escalateTarget.call_type} · {escalateTarget.final_score}%
                  </p>
                </div>
              </div>
              <button onClick={() => !isEscalating && setEscalateTarget(null)} className="shrink-0 p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-zinc-500 transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div className="p-4 bg-indigo-50/60 dark:bg-indigo-500/5 rounded-2xl border border-indigo-200 dark:border-indigo-500/20 flex items-start gap-3">
                <Clock size={16} className="text-indigo-600 dark:text-indigo-400 mt-0.5 shrink-0" />
                <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-relaxed font-medium">
                  Your request goes to your <span className="font-black text-zinc-800 dark:text-zinc-200">Team Leader</span>. If approved, the call is sent to Quality for re-review. You can submit only <span className="font-black text-zinc-800 dark:text-zinc-200">one</span> request per call.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] block">
                  Reason <span className="text-zinc-400 normal-case font-bold tracking-normal">(optional, but recommended)</span>
                </label>
                <textarea
                  className="w-full min-h-[110px] text-sm resize-none bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl px-4 py-3 text-zinc-800 dark:text-zinc-100 outline-none focus:border-indigo-500 placeholder:text-zinc-400"
                  placeholder="Explain why you believe this call should be re-reviewed..."
                  value={escalateReason}
                  onChange={(e) => setEscalateReason(e.target.value)}
                  disabled={isEscalating}
                />
              </div>

              {escalateError && (
                <p className="text-[11px] font-bold text-rose-600 dark:text-rose-400">{escalateError}</p>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => setEscalateTarget(null)}
                  disabled={isEscalating}
                  className="flex-1 px-6 py-3 rounded-2xl bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 font-black text-[10px] uppercase tracking-[0.2em] hover:bg-zinc-200 dark:hover:bg-zinc-900 hover:text-zinc-900 dark:hover:text-white transition-all disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={submitAgentEscalation}
                  disabled={isEscalating}
                  className="flex-1 px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] text-white bg-indigo-600 shadow-lg shadow-indigo-500/20 hover:bg-indigo-500 transition-all disabled:opacity-50"
                >
                  {isEscalating ? 'Submitting…' : 'Submit Request'}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Edit history (admin audit) — who edited this call, what changed, when */}
      {historyTarget && createPortal(
        <div
          onClick={() => setHistoryTarget(null)}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md overflow-y-auto"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl rounded-3xl overflow-hidden bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl my-auto max-h-[85vh] flex flex-col"
          >
            <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-zinc-50 dark:bg-zinc-950/50 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="shrink-0 p-2 rounded-xl border bg-indigo-500/10 border-indigo-500/20 text-indigo-600 dark:text-indigo-400">
                  <History size={22} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-lg font-bold text-zinc-900 dark:text-white uppercase tracking-tight truncate">Edit History</h3>
                  <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mt-1 truncate">
                    #{historyTarget.id} · {historyTarget.agent_name}
                  </p>
                </div>
              </div>
              <button onClick={() => setHistoryTarget(null)} className="shrink-0 p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-zinc-500 transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-5 overflow-y-auto">
              {isLoadingHistory ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-7 h-7 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
                </div>
              ) : editHistory.length === 0 ? (
                <p className="text-center text-zinc-400 dark:text-zinc-600 italic text-sm py-12">No edits recorded for this call.</p>
              ) : (
                editHistory.map((entry) => (
                  <div key={entry.id} className="rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                    <div className="flex items-center justify-between gap-3 px-4 py-3 bg-zinc-50 dark:bg-zinc-950/50 border-b border-zinc-100 dark:border-zinc-800">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-6 h-6 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-[10px] font-black text-indigo-600 dark:text-indigo-400 shrink-0">
                          {(entry.editor_name || '?').charAt(0)}
                        </div>
                        <span className="text-sm font-bold text-zinc-800 dark:text-zinc-200 truncate">{entry.editor_name || `User #${entry.editor_id}`}</span>
                      </div>
                      <span className="flex items-center gap-1.5 text-[10px] font-bold text-zinc-400 dark:text-zinc-500 shrink-0">
                        <Clock size={12} /> {new Date(entry.created_at).toLocaleString()}
                      </span>
                    </div>
                    <div className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
                      {(entry.changes || []).map((c: any, i: number) => (
                        <div key={i} className="flex items-center gap-3 px-4 py-2.5 text-xs">
                          <span className="font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-widest text-[9px] w-32 shrink-0 truncate" title={c.label}>{c.label}</span>
                          <span className="flex items-center gap-2 min-w-0 flex-1">
                            <span className="px-2 py-0.5 rounded bg-rose-500/10 text-rose-600 dark:text-rose-400 font-medium line-through truncate max-w-[40%]" title={String(c.old)}>{String(c.old) || '—'}</span>
                            <ChevronRight size={12} className="text-zinc-300 dark:text-zinc-700 shrink-0" />
                            <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold truncate max-w-[40%]" title={String(c.new)}>{String(c.new) || '—'}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
