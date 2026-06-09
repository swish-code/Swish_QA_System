import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../context/AuthContext';
import {
  BarChart3,
  Search,
  RefreshCw,
  ArrowUpDown,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  User,
  Phone,
  Target,
  Calendar,
  Filter
} from 'lucide-react';

interface AgentReport {
  agent_id: number;
  agent_name: string;
  total_calls: number;
  avg_score: string;
  avg_duration: string;
  error_list: { label: string; count: number }[];
}

const todayStr = () => new Date().toISOString().split('T')[0];

export default function DropPoint() {
  const { user } = useAuth();
  const [reports, setReports] = useState<AgentReport[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters — applied server-side for date range + agent, client-side for search.
  const [searchTerm, setSearchTerm] = useState('');
  const [fromDate, setFromDate] = useState<string>(todayStr());
  const [toDate, setToDate] = useState<string>(todayStr());
  const [selectedAgent, setSelectedAgent] = useState<string>('all');

  // Agent list (for the dropdown). Loaded once on mount.
  const [agents, setAgents] = useState<{ id: number; display_name: string }[]>([]);

  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({
    key: 'total_calls',
    direction: 'desc'
  });
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        user_id: String(user?.id || ''),
        role: user?.role || '',
      });
      if (fromDate) params.set('from_date', fromDate);
      if (toDate) params.set('to_date', toDate);
      if (selectedAgent && selectedAgent !== 'all') params.set('agent_id', selectedAgent);

      const response = await fetch(`/api/stats/drop-point?${params.toString()}`);
      const data = await response.json();
      setReports(data);
    } catch (error) {
      console.error('Error fetching drop point report:', error);
    } finally {
      setLoading(false);
    }
  }, [user, fromDate, toDate, selectedAgent]);

  // Initial load + whenever filters change
  useEffect(() => { fetchReport(); }, [fetchReport]);

  // Load agents once for the dropdown
  useEffect(() => {
    fetch('/api/users')
      .then(res => res.ok ? res.json() : Promise.reject())
      .then(data => setAgents(data.filter((u: any) => u.role === 'agent')))
      .catch(() => {});
  }, []);

  // Auto-refresh every 5 minutes (only when viewing today and no specific
  // agent — otherwise the manual Refresh button is fine).
  useEffect(() => {
    const interval = setInterval(fetchReport, 300000);
    return () => clearInterval(interval);
  }, [fetchReport]);

  const handleSort = (key: string) => {
    setSortConfig({
      key,
      direction: sortConfig.key === key && sortConfig.direction === 'desc' ? 'asc' : 'desc'
    });
  };

  const handleResetFilters = () => {
    setSearchTerm('');
    setFromDate(todayStr());
    setToDate(todayStr());
    setSelectedAgent('all');
  };

  // Smart heading caption based on filters
  const rangeCaption = useMemo(() => {
    if (fromDate === toDate) {
      if (fromDate === todayStr()) return 'Live Daily Performance Report • Today';
      return `Performance Report • ${fromDate}`;
    }
    return `Performance Report • ${fromDate || '…'} → ${toDate || '…'}`;
  }, [fromDate, toDate]);

  const filteredReports = useMemo(() => {
    const q = searchTerm.toLowerCase();
    return reports
      .filter(r => r.agent_name.toLowerCase().includes(q))
      .sort((a: any, b: any) => {
        let valA = a[sortConfig.key];
        let valB = b[sortConfig.key];

        if (sortConfig.key === 'errors_count') {
          valA = a.error_list.reduce((acc: number, curr: any) => acc + curr.count, 0);
          valB = b.error_list.reduce((acc: number, curr: any) => acc + curr.count, 0);
        }

        if (sortConfig.direction === 'asc') return valA > valB ? 1 : -1;
        return valA < valB ? 1 : -1;
      });
  }, [reports, searchTerm, sortConfig]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 sm:space-y-8 max-w-[1600px] mx-auto">
      {/* Header section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-zinc-900 dark:text-white tracking-tighter flex items-center gap-3">
            <BarChart3 className="text-indigo-600" size={32} />
            Drop Point
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 text-xs font-bold uppercase tracking-widest mt-2 flex items-center gap-2">
            <Calendar size={12} />
            {rangeCaption}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchReport}
            disabled={loading}
            className="p-3 bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-2xl text-zinc-600 dark:text-zinc-400 hover:text-indigo-600 dark:hover:text-white hover:border-indigo-500/30 transition-all shadow-sm disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white dark:bg-zinc-900/40 border border-zinc-100 dark:border-zinc-800 rounded-2xl p-3 sm:p-4 shadow-sm">
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-3">
          {/* From */}
          <div>
            <label className="text-[9px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest block mb-1 ml-1">From (Call Date)</label>
            <input
              type="date"
              className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-800 dark:text-zinc-100 outline-none focus:border-indigo-500 dark:[color-scheme:dark]"
              value={fromDate}
              max={toDate || undefined}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </div>

          {/* To */}
          <div>
            <label className="text-[9px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest block mb-1 ml-1">To (Call Date)</label>
            <input
              type="date"
              className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-800 dark:text-zinc-100 outline-none focus:border-indigo-500 dark:[color-scheme:dark]"
              value={toDate}
              min={fromDate || undefined}
              onChange={(e) => setToDate(e.target.value)}
            />
          </div>

          {/* Employee dropdown */}
          <div>
            <label className="text-[9px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest block mb-1 ml-1">Employee</label>
            <div className="relative">
              <select
                className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg pl-3 pr-7 py-2 text-xs text-zinc-800 dark:text-zinc-100 outline-none focus:border-indigo-500 appearance-none cursor-pointer"
                value={selectedAgent}
                onChange={(e) => setSelectedAgent(e.target.value)}
              >
                <option value="all">All Employees</option>
                {agents.map(a => (
                  <option key={a.id} value={a.id}>{a.display_name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-600 pointer-events-none" size={12} />
            </div>
          </div>

          {/* Live search */}
          <div className="col-span-2 sm:col-span-1">
            <label className="text-[9px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest block mb-1 ml-1">Search</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-600" size={12} />
              <input
                type="text"
                placeholder="Filter by name…"
                className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg pl-7 pr-3 py-2 text-xs text-zinc-800 dark:text-zinc-100 outline-none focus:border-indigo-500 placeholder:text-zinc-400"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          {/* Reset button */}
          <div className="col-span-2 sm:col-span-4 lg:col-span-1 flex items-end">
            <button
              onClick={handleResetFilters}
              className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 font-black text-[10px] uppercase tracking-widest border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-white transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              <Filter size={11} /> Reset
            </button>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
        <div className="bg-white dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800 p-6 rounded-[2rem] shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-600">
              <Phone size={18} />
            </div>
            <span className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">Total Evaluated Calls</span>
          </div>
          <p className="text-2xl sm:text-3xl md:text-4xl font-black text-zinc-900 dark:text-white tracking-tighter">
            {reports.reduce((acc, curr) => acc + curr.total_calls, 0)}
          </p>
        </div>

        <div className="bg-white dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800 p-6 rounded-[2rem] shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-600">
              <Target size={18} />
            </div>
            <span className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">Team Average Score</span>
          </div>
          <p className="text-2xl sm:text-3xl md:text-4xl font-black text-zinc-900 dark:text-white tracking-tighter">
            {reports.length > 0
              ? (reports.reduce((acc, curr) => acc + parseFloat(curr.avg_score), 0) / reports.length).toFixed(1)
              : '0.0'}%
          </p>
        </div>

        <div className="bg-white dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800 p-6 rounded-[2rem] shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-rose-500/10 rounded-lg text-rose-600">
              <AlertCircle size={18} />
            </div>
            <span className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">Total Identified Issues</span>
          </div>
          <p className="text-2xl sm:text-3xl md:text-4xl font-black text-zinc-900 dark:text-white tracking-tighter">
            {reports.reduce((acc, curr) => acc + curr.error_list.reduce((eAcc, eCurr) => eAcc + eCurr.count, 0), 0)}
          </p>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white dark:bg-zinc-900/40 border border-zinc-100 dark:border-zinc-800 rounded-[2rem] overflow-hidden shadow-sm">
        <div className="overflow-x-auto -mx-4 sm:mx-0">
          <table className="w-full text-left min-w-[720px]">
            <thead>
              <tr className="border-b border-zinc-100 dark:border-zinc-800/50 bg-white dark:bg-zinc-950/20">
                <th className="px-8 py-5">
                  <button
                    onClick={() => handleSort('agent_name')}
                    className="flex items-center gap-2 text-[10px] font-black text-zinc-500 uppercase tracking-widest hover:text-indigo-600 transition-colors"
                  >
                    Employee <ArrowUpDown size={12} />
                  </button>
                </th>
                <th className="px-8 py-5">
                  <button
                    onClick={() => handleSort('total_calls')}
                    className="flex items-center gap-2 text-[10px] font-black text-zinc-500 uppercase tracking-widest hover:text-indigo-600 transition-colors"
                  >
                    Calls <ArrowUpDown size={12} />
                  </button>
                </th>
                <th className="px-8 py-5">
                  <button
                    onClick={() => handleSort('avg_score')}
                    className="flex items-center gap-2 text-[10px] font-black text-zinc-500 uppercase tracking-widest hover:text-indigo-600 transition-colors"
                  >
                    Average Score <ArrowUpDown size={12} />
                  </button>
                </th>
                <th className="px-8 py-5">
                  <button
                    onClick={() => handleSort('avg_duration')}
                    className="flex items-center gap-2 text-[10px] font-black text-zinc-500 uppercase tracking-widest hover:text-indigo-600 transition-colors"
                  >
                    Avg Duration (AHT) <ArrowUpDown size={12} />
                  </button>
                </th>
                <th className="px-8 py-5">
                  <button
                    onClick={() => handleSort('errors_count')}
                    className="flex items-center gap-2 text-[10px] font-black text-zinc-500 uppercase tracking-widest hover:text-indigo-600 transition-colors"
                  >
                    Issue Hits <ArrowUpDown size={12} />
                  </button>
                </th>
                <th className="px-8 py-5 text-right text-[10px] font-black text-zinc-500 uppercase tracking-widest">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={6} className="px-8 py-6">
                      <div className="h-4 bg-zinc-100 dark:bg-zinc-800 rounded-lg w-full" />
                    </td>
                  </tr>
                ))
              ) : filteredReports.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-8 py-12 sm:py-20 text-center">
                    <div className="flex flex-col items-center gap-4">
                      <div className="p-4 bg-zinc-50 dark:bg-zinc-950 rounded-full">
                        <User className="text-zinc-300" size={32} />
                      </div>
                      <p className="text-zinc-400 dark:text-zinc-600 text-xs font-black uppercase tracking-widest italic">No matching reports for the selected range</p>
                    </div>
                  </td>
                </tr>
              ) : filteredReports.map((report) => {
                const totalErrors = report.error_list.reduce((acc, curr) => acc + curr.count, 0);
                const isExpanded = expandedRow === report.agent_id;

                return (
                  <React.Fragment key={report.agent_id}>
                    <tr className={`group hover:bg-zinc-50 dark:hover:bg-zinc-950/40 transition-all cursor-pointer ${isExpanded ? 'bg-zinc-50/50 dark:bg-zinc-950/20' : ''}`} onClick={() => setExpandedRow(isExpanded ? null : report.agent_id)}>
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-xl bg-white dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-800 flex items-center justify-center text-zinc-400 group-hover:border-indigo-500/30 shadow-sm">
                            <User size={18} />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-zinc-900 dark:text-white tracking-tight">{report.agent_name}</p>
                            <p className="text-[10px] text-zinc-400 dark:text-zinc-500 font-medium">Agent ID: #{report.agent_id}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <span className="text-sm font-mono font-bold text-zinc-600 dark:text-zinc-400">{report.total_calls}</span>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-3">
                          <span className={`text-sm font-black tracking-tighter ${parseFloat(report.avg_score) >= 90 ? 'text-emerald-600' : parseFloat(report.avg_score) >= 80 ? 'text-indigo-600' : 'text-rose-600'}`}>
                            {report.avg_score}%
                          </span>
                          <div className="w-16 h-1 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                            <div
                              className={`h-full transition-all duration-1000 ${parseFloat(report.avg_score) >= 90 ? 'bg-emerald-500' : parseFloat(report.avg_score) >= 80 ? 'bg-indigo-500' : 'bg-rose-500'}`}
                              style={{ width: `${report.avg_score}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <span className="text-sm font-mono font-medium text-zinc-600 dark:text-zinc-400">{report.avg_duration}</span>
                      </td>
                      <td className="px-8 py-6">
                        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${totalErrors > 0 ? 'bg-rose-600/10 text-rose-600 border border-rose-500/20' : 'bg-emerald-600/10 text-emerald-600 border border-emerald-500/20'}`}>
                          {totalErrors} Hits
                        </span>
                      </td>
                      <td className="px-8 py-6 text-right">
                        <button className="p-2 hover:bg-white dark:hover:bg-zinc-900 rounded-xl transition-all border border-transparent hover:border-zinc-100 dark:hover:border-zinc-800">
                          {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                        </button>
                      </td>
                    </tr>

                    <AnimatePresence>
                      {isExpanded && (
                        <motion.tr
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="bg-white dark:bg-zinc-950/30 overflow-hidden"
                        >
                          <td colSpan={6} className="px-8 py-0">
                            <motion.div
                              initial={{ y: -20 }}
                              animate={{ y: 0 }}
                              className="py-8 space-y-6"
                            >
                              <div className="flex items-center gap-2 mb-2">
                                <AlertCircle size={14} className="text-rose-500" />
                                <h4 className="text-[10px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-[0.2em]">Detailed Issue Analysis</h4>
                              </div>

                              {report.error_list.length > 0 ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                  {report.error_list.map((error, idx) => (
                                    <div key={idx} className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800/50 p-4 rounded-2xl shadow-sm hover:border-rose-500/20 group">
                                      <div className="flex justify-between items-start gap-4">
                                        <p className="text-xs font-bold text-zinc-800 dark:text-zinc-300 leading-relaxed">{error.label}</p>
                                        <span className="px-2 py-1 bg-rose-500/10 text-rose-600 text-[10px] font-black rounded-lg min-w-[24px] text-center">
                                          {error.count}
                                        </span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="p-8 border-2 border-dashed border-zinc-100 dark:border-zinc-800 rounded-3xl text-center">
                                  <p className="text-zinc-400 dark:text-zinc-600 text-[10px] font-black uppercase tracking-widest italic">
                                    Pristine Performance • No issues found in this range
                                  </p>
                                </div>
                              )}
                            </motion.div>
                          </td>
                        </motion.tr>
                      )}
                    </AnimatePresence>
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
