import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import * as XLSX from 'xlsx';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { motion, AnimatePresence } from 'motion/react';
import {
  Bell,
  History,
  CheckCircle2,
  XCircle,
  MessageSquare,
  ChevronRight,
  User,
  Clock,
  ArrowRightLeft,
  Search,
  Filter,
  Eye,
  AlertTriangle,
  FileSpreadsheet,
  Calendar
} from 'lucide-react';

interface EscalationLog {
  id: number;
  evaluation_id: number;
  user_id: number;
  user_name: string;
  role: string;
  action: 'escalated' | 'approved' | 'rejected';
  comment: string;
  old_score?: number;
  new_score?: number;
  created_at: string;
  call_type?: string;
  brand?: string;
  evaluation_date?: string;
}

interface Evaluation {
  id: number;
  date: string;
  agent_name: string;
  qa_name: string;
  qa_id?: number;
  brand: string;
  call_type: string;
  final_score: number;
  status: string;
  agent_escalation_status?: string | null;
  agent_escalation_reason?: string | null;
  agent_escalation_response?: string | null;
}

export default function EscalationManagement() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending');
  const [escalations, setEscalations] = useState<Evaluation[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  // Date range. Pending filters on the CALL date (server-side); History
  // filters on when the escalation action happened (client-side, since the
  // history endpoint returns the full log).
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [selectedEval, setSelectedEval] = useState<Evaluation | null>(null);
  const [responseComment, setResponseComment] = useState('');
  const [showResponseModal, setShowResponseModal] = useState(false);
  const [modalAction, setModalAction] = useState<'approved' | 'rejected'>('approved');
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, fromDate, toDate]);

  const groupHistory = (logs: EscalationLog[]) => {
    const groups: { [key: number]: any } = {};
    
    logs.forEach(log => {
      if (!groups[log.evaluation_id]) {
        groups[log.evaluation_id] = {
          evaluation_id: log.evaluation_id,
          call_type: log.call_type,
          brand: log.brand,
          evaluation_date: log.evaluation_date,
          actions: [],
          latest_timestamp: log.created_at
        };
      }
      
      groups[log.evaluation_id].actions.push({
        user_name: log.user_name,
        role: log.role,
        action: log.action,
        comment: log.comment,
        old_score: log.old_score,
        new_score: log.new_score,
        created_at: log.created_at
      });

      if (new Date(log.created_at) > new Date(groups[log.evaluation_id].latest_timestamp)) {
        groups[log.evaluation_id].latest_timestamp = log.created_at;
      }
    });

    return Object.values(groups).map((group: any) => {
      group.actions.sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      const first = group.actions[0];
      const last = group.actions[group.actions.length - 1];

      // Surface BOTH sides of the dispute, not just whoever acted last:
      // who raised it (the escalation/request) and who resolved it
      // (the approve/reject). Previously only `latest_user` was shown, so
      // the escalating TL was invisible in the list.
      const raiser = group.actions.find((a: any) => a.action === 'escalated' || a.action === 'requested') || first;
      const resolver = [...group.actions].reverse().find((a: any) => a.action === 'approved' || a.action === 'rejected');

      return {
        ...group,
        initial_score: first.old_score,
        latest_score: last.new_score,
        latest_user: last.user_name,
        latest_comment: last.comment,
        raised_by: raiser?.user_name || '',
        raised_role: raiser?.role || '',
        raised_comment: raiser?.comment || '',
        resolved_by: resolver?.user_name || '',
        resolved_role: resolver?.role || '',
        resolved_action: resolver?.action || '',
        resolved_comment: resolver?.comment || '',
      };
    }).sort((a: any, b: any) => new Date(b.latest_timestamp).getTime() - new Date(a.latest_timestamp).getTime());
  };

  const loadData = async () => {
    setIsLoading(true);
    try {
      if (activeTab === 'pending') {
        // Filter by status SERVER-side. Previously this pulled the newest 500
        // evaluations and filtered in the browser, so once the system grew
        // past 500 calls any escalation older than that window silently
        // vanished from this page (while still showing in the History Log).
        // The TL pre-approval stage was removed — 'Escalated' is the only
        // in-flight state now.
        const dateQs = `${fromDate ? `&from_date=${fromDate}` : ''}${toDate ? `&to_date=${toDate}` : ''}`;
        const res = await fetch(`/api/evaluations?user_id=${user?.id}&role=${user?.role}&status=Escalated&limit=1000&page=1${dateQs}`);
        const result = await res.json();
        setEscalations(result.data || []);
      } else {
        const res = await fetch('/api/escalations/history');
        const data: EscalationLog[] = await res.json();
        // The history endpoint has no date params, so filter here on when
        // the action was taken — comparing YYYY-MM-DD prefixes keeps the
        // whole "to" day included regardless of time.
        const filtered = data.filter(l => {
          const day = String(l.created_at).slice(0, 10);
          if (fromDate && day < fromDate) return false;
          if (toDate && day > toDate) return false;
          return true;
        });
        setHistory(groupHistory(filtered));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  // Exports everything on this page — not just the active tab — as a
  // two-sheet workbook, fetched fresh so it's complete regardless of what's
  // currently loaded in state. Honours the date range so the file matches
  // what's on screen.
  const handleExport = async () => {
    setIsExporting(true);
    try {
      const dateQs = `${fromDate ? `&from_date=${fromDate}` : ''}${toDate ? `&to_date=${toDate}` : ''}`;
      const [pendingRes, historyRes] = await Promise.all([
        // Status filtered server-side — see loadData for why.
        fetch(`/api/evaluations?user_id=${user?.id}&role=${user?.role}&status=Escalated&limit=1000&page=1${dateQs}`),
        fetch('/api/escalations/history'),
      ]);
      const pendingData = (await pendingRes.json()).data || [];
      const pendingRows = pendingData
        .map((e: Evaluation) => ({
          'Call #': e.id,
          Agent: e.agent_name,
          Evaluator: e.qa_name,
          Brand: e.brand,
          'Call Type': e.call_type,
          Date: e.date,
          Score: e.final_score,
          Status: e.status,
        }));

      const historyLogs: EscalationLog[] = await historyRes.json();
      const historyRows = historyLogs
        // Same action-date window the History tab applies on screen.
        .filter(l => {
          const day = String(l.created_at).slice(0, 10);
          if (fromDate && day < fromDate) return false;
          if (toDate && day > toDate) return false;
          return true;
        })
        .sort((a, b) => a.evaluation_id - b.evaluation_id || new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        .map(l => ({
          'Call #': l.evaluation_id,
          Brand: l.brand || '',
          'Call Type': l.call_type || '',
          'Call Date': l.evaluation_date || '',
          Actor: l.user_name,
          Role: l.role,
          Action: l.action,
          Comment: l.comment || '',
          'Old Score': l.old_score ?? '',
          'New Score': l.new_score ?? '',
          Timestamp: l.created_at,
        }));

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pendingRows), 'Pending Escalations');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(historyRows), 'History Log');
      const stamp = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `escalations-${stamp}.xlsx`);
    } catch (err) {
      console.error(err);
      alert('Export failed. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleRespond = async () => {
    if (modalAction === 'rejected' && !responseComment.trim()) {
      alert('Please provide a reason for rejection.');
      return;
    }

    try {
      // Record current score as old_score for the log
      const res = await fetch(`/api/evaluations/${selectedEval?.id}/escalation-respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user?.id,
          role: user?.role,
          action: modalAction,
          comment: responseComment,
          old_score: selectedEval?.final_score,
          new_score: selectedEval?.final_score // For rejection/TL approval, score doesn't change here
        })
      });

      if (res.ok) {
        setShowResponseModal(false);
        setResponseComment('');
        loadData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-8">
        <div>
          <h2 className="text-2xl sm:text-3xl font-light text-zinc-900 dark:text-white tracking-tight mb-1">Escalation Management</h2>
          <p className="text-zinc-500 text-sm">Review, approve, or reject disputed interactions and track audit history.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* Date range — Pending filters by call date, History by when the
              escalation action happened. */}
          <div className="px-3 py-2 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl flex items-center gap-2 shadow-sm">
            <Calendar size={14} className="text-indigo-600 dark:text-indigo-400 shrink-0" />
            <input
              type="date"
              value={fromDate}
              max={toDate || undefined}
              onChange={(e) => setFromDate(e.target.value)}
              className="bg-transparent text-xs font-bold text-zinc-600 dark:text-zinc-300 outline-none w-[112px] dark:[color-scheme:dark]"
              title={activeTab === 'pending' ? 'From (call date)' : 'From (action date)'}
            />
            <span className="text-zinc-400 dark:text-zinc-600">–</span>
            <input
              type="date"
              value={toDate}
              min={fromDate || undefined}
              onChange={(e) => setToDate(e.target.value)}
              className="bg-transparent text-xs font-bold text-zinc-600 dark:text-zinc-300 outline-none w-[112px] dark:[color-scheme:dark]"
              title={activeTab === 'pending' ? 'To (call date)' : 'To (action date)'}
            />
            {(fromDate || toDate) && (
              <button
                onClick={() => { setFromDate(''); setToDate(''); }}
                title="Clear date filter"
                className="text-zinc-400 hover:text-rose-500 dark:hover:text-rose-400 transition-colors shrink-0"
              >
                <XCircle size={14} />
              </button>
            )}
          </div>

          <div className="flex bg-zinc-50 dark:bg-zinc-950 p-1 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xl">
            <button
              onClick={() => setActiveTab('pending')}
              className={`px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                activeTab === 'pending' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-zinc-400 dark:text-zinc-500 hover:text-indigo-600 dark:hover:text-zinc-300'
              }`}
            >
              Pending Review
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                activeTab === 'history' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-zinc-400 dark:text-zinc-500 hover:text-indigo-600 dark:hover:text-zinc-300'
              }`}
            >
              History Log
            </button>
          </div>

          <button
            onClick={handleExport}
            disabled={isExporting}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-emerald-600 text-white text-xs font-black uppercase tracking-widest shadow-lg shadow-emerald-500/20 hover:bg-emerald-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            title="Export both pending escalations and the full history log to Excel"
          >
            <FileSpreadsheet size={14} />
            {isExporting ? 'Exporting…' : 'Export to Excel'}
          </button>
        </div>
      </div>

      {activeTab === 'pending' ? (
        <div className="space-y-8">
          <div className="grid grid-cols-1 gap-6">
          <AnimatePresence mode="popLayout">
            {escalations.length > 0 ? escalations.map(esc => (
              <motion.div
                key={esc.id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="glass-card flex flex-col md:flex-row items-center gap-8 p-6 hover:border-indigo-500/30 group"
              >
                <div className="flex items-center gap-6 flex-1">
                  <div className="w-14 h-14 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                    <ArrowRightLeft size={28} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                       <h4 className="text-lg font-medium text-zinc-800 dark:text-white">{esc.agent_name}</h4>
                       <div className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest ${
                         esc.status === 'Escalated' ? 'bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-500' : 'bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-500'
                       }`}>
                         {esc.status}
                       </div>
                       {user?.role === 'qa' && Number(esc.qa_id) === Number(user?.id) && (
                         <div
                           className="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-500"
                           title="You created this call — another QA or a Supervisor must resolve it"
                         >
                           Your Call
                         </div>
                       )}
                    </div>
                    <div className="flex items-center gap-4 text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.15em]">
                      <div className="flex items-center gap-1.5">
                        <Clock size={12} className="text-zinc-300 dark:text-zinc-600" />
                        {esc.date}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <User size={12} className="text-zinc-300 dark:text-zinc-600" />
                        QA: {esc.qa_name}
                      </div>
                      <div className="text-zinc-400 dark:text-zinc-300">{esc.brand} - {esc.call_type}</div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-8">
                  <div className="text-right">
                    <p className="text-2xl font-light text-zinc-800 dark:text-white">{esc.final_score}%</p>
                    <p className="text-[9px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">Current Score</p>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => navigate(`/evaluate/${esc.id}`)}
                      className="px-6 py-3 rounded-xl bg-indigo-600 text-white font-black text-[10px] uppercase tracking-widest shadow-lg shadow-indigo-500/20 hover:bg-indigo-500 transition-all flex items-center gap-2"
                    >
                      Process Interaction <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              </motion.div>
            )) : (
              <div className="text-center py-12 sm:py-20 bg-zinc-950/20 rounded-[2rem] border border-zinc-800/50">
                <Bell className="mx-auto text-zinc-800 mb-4" size={40} />
                <p className="text-zinc-400 font-medium">No pending escalations at the moment.</p>
              </div>
            )}
          </AnimatePresence>
          </div>
        </div>
      ) : (
        <div className="glass-card p-0 overflow-hidden bg-white dark:bg-zinc-900/40 border-zinc-200 dark:border-zinc-800 shadow-sm">
          <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/50 flex justify-between items-center transition-colors">
            <div className="flex items-center gap-3">
              <History className="text-indigo-600 dark:text-indigo-400" size={18} />
              <h3 className="text-sm font-bold text-zinc-800 dark:text-white uppercase tracking-widest">Audit Trail Log</h3>
            </div>
            <div className="flex gap-4">
               <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-600" />
                <input 
                  type="text" 
                  placeholder="Filter History..." 
                  className="bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg pl-9 pr-4 py-1.5 text-xs text-zinc-800 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-zinc-700 outline-none focus:border-indigo-500/30"
                />
              </div>
            </div>
          </div>
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <table className="w-full text-left min-w-[720px]">
              <thead>
                <tr className="border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/30 dark:bg-zinc-950/20">
                  <th className="px-6 py-4 text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">Last Update</th>
                  <th className="px-6 py-4 text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">Evaluation</th>
                  <th className="px-6 py-4 text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">Escalation Flow</th>
                  <th className="px-6 py-4 text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">Score Change</th>
                  <th className="px-6 py-4 text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
                {history.map(group => (
                  <tr key={group.evaluation_id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/20 transition-colors group">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-col">
                        <span className="text-xs text-zinc-600 dark:text-zinc-300 font-medium">{new Date(group.latest_timestamp).toLocaleDateString()}</span>
                        <span className="text-[10px] text-zinc-400 dark:text-zinc-600">{new Date(group.latest_timestamp).toLocaleTimeString()}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2 mb-1">
                           <span className="text-xs text-zinc-800 dark:text-white font-black">#{group.evaluation_id}</span>
                           <span className="text-[10px] text-zinc-500 dark:text-zinc-400 font-medium">{group.call_type}</span>
                        </div>
                        <span className="text-[9px] text-zinc-400 dark:text-zinc-600 uppercase tracking-widest font-black leading-none">{group.brand} | {group.evaluation_date}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
                        {group.actions.map((act: any, idx: number) => (
                          <React.Fragment key={idx}>
                            <div className="flex flex-col items-center">
                                <div className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest shadow-sm border ${
                                  act.action === 'escalated' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-500 border-amber-500/20' :
                                  act.action === 'approved' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-500 border-emerald-500/20' :
                                  'bg-rose-500/10 text-rose-600 dark:text-rose-500 border-rose-500/20'
                                }`}>
                                  {act.action}
                                </div>
                            </div>
                            {idx < group.actions.length - 1 && (
                              <ChevronRight size={12} className="text-zinc-300 dark:text-zinc-700 shrink-0" />
                            )}
                          </React.Fragment>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 bg-zinc-50 dark:bg-black/20 p-2 rounded-xl border border-zinc-100 dark:border-zinc-900 shadow-inner">
                        <span className="text-zinc-400 dark:text-zinc-600 text-[10px] font-mono italic">{group.initial_score}%</span>
                        <ArrowRightLeft size={10} className="text-zinc-300 dark:text-zinc-800" />
                        <span className={`text-xs font-black font-mono ${
                          group.latest_score > group.initial_score ? 'text-emerald-600 dark:text-emerald-400' : 
                          group.latest_score < group.initial_score ? 'text-rose-600 dark:text-rose-400' : 'text-zinc-800 dark:text-white'
                        }`}>{group.latest_score}%</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                       <div className="flex flex-col gap-1.5">
                          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-1 italic" title={group.latest_comment}>
                            "{group.latest_comment || 'No comment'}"
                          </p>

                          {/* Both sides: who raised the escalation and who
                              resolved it — the row used to show only the last
                              actor, hiding the escalating TL entirely. */}
                          <div className="flex flex-col gap-1">
                            {group.raised_by && (
                              <div className="flex items-center gap-1.5" title={group.raised_comment || undefined}>
                                <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-500 text-[8px] font-black uppercase tracking-widest shrink-0">
                                  Raised
                                </span>
                                <span className="text-[9px] text-zinc-500 dark:text-zinc-400 font-bold truncate">
                                  {group.raised_by}
                                  {group.raised_role && <span className="text-zinc-400 dark:text-zinc-600"> ({group.raised_role})</span>}
                                </span>
                              </div>
                            )}
                            {group.resolved_by ? (
                              <div className="flex items-center gap-1.5" title={group.resolved_comment || undefined}>
                                <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest shrink-0 ${
                                  group.resolved_action === 'approved'
                                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-500'
                                    : 'bg-rose-500/10 text-rose-600 dark:text-rose-500'
                                }`}>
                                  {group.resolved_action === 'approved' ? 'Approved' : 'Rejected'}
                                </span>
                                <span className="text-[9px] text-zinc-500 dark:text-zinc-400 font-bold truncate">
                                  {group.resolved_by}
                                  {group.resolved_role && <span className="text-zinc-400 dark:text-zinc-600"> ({group.resolved_role})</span>}
                                </span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <span className="px-1.5 py-0.5 rounded bg-zinc-500/10 text-zinc-500 text-[8px] font-black uppercase tracking-widest shrink-0">
                                  Pending
                                </span>
                                <span className="text-[9px] text-zinc-400 dark:text-zinc-600 font-bold">Awaiting Quality</span>
                              </div>
                            )}
                          </div>
                       </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={() => navigate(`/evaluate/${group.evaluation_id}`)}
                        className="p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-600 hover:text-white hover:border-indigo-500 transition-all shadow-md dark:shadow-lg"
                        title="View Full Details"
                      >
                        <Eye size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )
}

    {showResponseModal && createPortal(
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setShowResponseModal(false)}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-black/70 backdrop-blur-md overflow-y-auto"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-3xl overflow-hidden bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl my-auto"
          >
            <div className="p-5 sm:p-6 lg:p-8 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-zinc-50 dark:bg-zinc-950/50">
              <div className="flex items-center gap-3 min-w-0">
                <div className={`shrink-0 p-2 rounded-xl border ${
                  modalAction === 'approved' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-500' : 'bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-500'
                }`}>
                  {modalAction === 'approved' ? <CheckCircle2 size={22} /> : <AlertTriangle size={22} />}
                </div>
                <div className="min-w-0">
                  <h3 className="text-base sm:text-lg lg:text-xl font-bold text-zinc-900 dark:text-white uppercase tracking-tight truncate">{modalAction} Escalation</h3>
                  <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mt-1 truncate">Audit Log Recording...</p>
                </div>
              </div>
              <button onClick={() => setShowResponseModal(false)} className="shrink-0 p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-zinc-500 transition-colors">
                <XCircle size={20} />
              </button>
            </div>

            <div className="p-5 sm:p-6 lg:p-8 space-y-6">
              <div className="space-y-3">
                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] block">
                  Response Feedback {modalAction === 'rejected' && <span className="text-rose-500">(Required)</span>}
                </label>
                <textarea
                  className="input-field min-h-[120px] text-sm resize-none"
                  placeholder={`Provide context for your ${modalAction} decision...`}
                  value={responseComment}
                  onChange={(e) => setResponseComment(e.target.value)}
                />
                <div className="p-4 bg-zinc-50 dark:bg-zinc-950 rounded-2xl border border-zinc-200 dark:border-zinc-800 flex items-start gap-3">
                  <History size={16} className="text-indigo-600 dark:text-indigo-400 mt-0.5 shrink-0" />
                  <p className="text-[10px] text-zinc-500 dark:text-zinc-500 leading-relaxed font-medium">
                    <span className="text-zinc-700 dark:text-zinc-200 uppercase font-black mr-1 tracking-widest">Notice:</span>
                    This response will be logged in the permanent audit trail and visible to the Agent, Team Leader, and Administration.
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 pt-2 sm:pt-4">
                <button
                  onClick={() => setShowResponseModal(false)}
                  className="flex-1 px-6 sm:px-8 py-3 rounded-2xl bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 font-black text-[10px] uppercase tracking-[0.2em] hover:bg-zinc-200 dark:hover:bg-zinc-900 hover:text-zinc-900 dark:hover:text-white transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRespond}
                  className={`flex-1 px-6 sm:px-8 py-3 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] text-white shadow-lg transition-all ${
                    modalAction === 'approved' ? 'bg-emerald-600 shadow-emerald-500/20 hover:bg-emerald-500' : 'bg-rose-600 shadow-rose-500/20 hover:bg-rose-500'
                  }`}
                >
                  Submit Decision
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </AnimatePresence>,
      document.body
    )}
    </div>
  );
}
