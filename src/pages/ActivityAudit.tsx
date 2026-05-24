import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Filter, 
  Trash2, 
  RefreshCw, 
  Calendar, 
  Download, 
  ShieldAlert, 
  ChevronLeft, 
  ChevronRight, 
  Activity, 
  User as UserIcon, 
  Terminal, 
  AlertCircle, 
  CheckCircle,
  Database,
  Tag,
  Clock,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../context/AuthContext';
import { User } from '../types';

interface AuditLog {
  id: number;
  user_id: number | null;
  user_name: string;
  action_type: string;
  section: string;
  details: string;
  ip_address: string;
  user_agent: string;
  status: 'success' | 'warning' | 'error';
  created_at: string;
}

interface Pagination {
  totalItems: number;
  totalPages: number;
  currentPage: number;
  limit: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

interface FiltersData {
  users: string[];
  actions: string[];
  sections: string[];
}

export default function ActivityAudit() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    totalItems: 0,
    totalPages: 1,
    currentPage: 1,
    limit: 20,
    hasNextPage: false,
    hasPrevPage: false
  });
  const [filtersData, setFiltersData] = useState<FiltersData>({
    users: [],
    actions: [],
    sections: []
  });

  // Filter States
  const [search, setSearch] = useState('');
  const [filterUser, setFilterUser] = useState('all');
  const [filterAction, setFilterAction] = useState('all');
  const [filterSection, setFilterSection] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  // Stats
  const [totalSuccessCount, setTotalSuccessCount] = useState(0);
  const [totalErrorCount, setTotalErrorCount] = useState(0);

  useEffect(() => {
    fetchLogs();
  }, [page, filterUser, filterAction, filterSection, filterStatus, fromDate, toDate]);

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20',
        search,
        user_name: filterUser,
        action_type: filterAction,
        section: filterSection,
        status: filterStatus,
        from_date: fromDate,
        to_date: toDate
      });

      const res = await fetch(`/api/audit-logs?${params.toString()}`);
      if (res.ok) {
        const result = await res.json();
        setLogs(result.data);
        setPagination(result.pagination);
        setFiltersData(result.filters);

        // Count metrics for micro summary
        if (result.data) {
          const success = result.data.filter((l: AuditLog) => l.status === 'success').length;
          const error = result.data.filter((l: AuditLog) => l.status === 'error').length;
          setTotalSuccessCount(success);
          setTotalErrorCount(error);
        }
      }
    } catch (err) {
      console.error('Failed to fetch audit logs:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearchKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      setPage(1);
      fetchLogs();
    }
  };

  const resetFilters = () => {
    setSearch('');
    setFilterUser('all');
    setFilterAction('all');
    setFilterSection('all');
    setFilterStatus('all');
    setFromDate('');
    setToDate('');
    setPage(1);
  };

  const handleDeleteLog = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this specific log entry?')) return;
    try {
      const res = await fetch(`/api/audit-logs/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        alert('Log entry successfully deleted.');
        fetchLogs();
      } else {
        const errData = await res.json();
        alert(errData.error || 'Failed to delete log.');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleClearAllLogs = async () => {
    if (!window.confirm('⚠️ WARNING: This will permanently DELETE ALL system log records. This action is irreversible. Proceed?')) return;
    try {
      const res = await fetch('/api/audit-logs/clear', {
        method: 'POST'
      });
      if (res.ok) {
        alert('All activity logs have been cleared.');
        fetchLogs();
      } else {
        const errData = await res.json();
        alert(errData.error || 'Failed to clear logs.');
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Convert logs to CSV and trigger dynamic download
  const handleExportToCSV = () => {
    if (logs.length === 0) {
      alert('No data to export.');
      return;
    }

    const headers = ['ID', 'User', 'Action Type', 'Section', 'Details', 'IP Address', 'User Agent', 'Status', 'Date/Time'];
    const rows = logs.map(l => [
      l.id,
      `"${l.user_name.replace(/"/g, '""')}"`,
      `"${l.action_type}"`,
      `"${l.section}"`,
      `"${l.details.replace(/"/g, '""').replace(/\n/g, ' ')}"`,
      `"${l.ip_address}"`,
      `"${l.user_agent.replace(/"/g, '""')}"`,
      l.status.toUpperCase(),
      l.created_at
    ]);

    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" 
      + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    const currentTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
    link.setAttribute("download", `Quality_System_AuditLogs_${currentTimestamp}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const isSupervisor = user?.role === 'supervisor';

  return (
    <div className="space-y-8 pb-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="w-1.5 h-6 bg-indigo-600 rounded-full" />
            <h2 className="text-4xl font-black text-zinc-900 dark:text-white tracking-tighter uppercase italic">
              Activity & Audit Logs
            </h2>
          </div>
          <p className="text-zinc-400 dark:text-zinc-500 text-[10px] font-black uppercase tracking-[0.4em] ml-4">
            Secured immutable log file of all system events & compliance modifications
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleExportToCSV}
            className="flex items-center gap-2 px-6 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-md italic hover:scale-[1.02]"
          >
            <Download size={14} /> Export to CSV
          </button>
          
          {isSupervisor && (
            <button
              onClick={handleClearAllLogs}
              className="flex items-center gap-2 px-6 py-3.5 bg-rose-500 hover:bg-rose-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-md italic hover:scale-[1.02]"
            >
              <Trash2 size={14} /> Clear All Logs
            </button>
          )}
        </div>
      </div>

      {/* Analytics Dashboard mini widgets */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Total Logs */}
        <div className="bg-white dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-850 p-6 rounded-3xl shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-950/40 rounded-2xl flex items-center justify-center text-indigo-600 dark:text-indigo-400">
            <Activity size={20} />
          </div>
          <div>
            <span className="text-[10px] text-zinc-400 font-extrabold uppercase tracking-widest block">Total Processed Events</span>
            <span className="text-2xl font-black text-zinc-900 dark:text-white mt-1 tracking-tight italic">
              {pagination.totalItems}
            </span>
          </div>
        </div>

        {/* Success Events */}
        <div className="bg-white dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-850 p-6 rounded-3xl shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-950/40 rounded-2xl flex items-center justify-center text-emerald-600 dark:text-emerald-400">
            <CheckCircle size={20} />
          </div>
          <div>
            <span className="text-[10px] text-zinc-400 font-extrabold uppercase tracking-widest block">Successful Runs</span>
            <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1 tracking-tight italic">
              {totalSuccessCount} <span className="text-[11px] font-bold text-zinc-300 dark:text-zinc-700 uppercase">This batch</span>
            </span>
          </div>
        </div>

        {/* Failed Operations */}
        <div className="bg-white dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-850 p-6 rounded-3xl shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-rose-50 dark:bg-rose-950/40 rounded-2xl flex items-center justify-center text-rose-600 dark:text-rose-400">
            <AlertCircle size={20} />
          </div>
          <div>
            <span className="text-[10px] text-zinc-400 font-extrabold uppercase tracking-widest block">Errors / Failures</span>
            <span className="text-2xl font-black text-rose-600 dark:text-rose-400 mt-1 tracking-tight italic">
              {totalErrorCount} <span className="text-[11px] font-bold text-zinc-300 dark:text-zinc-700 uppercase">This batch</span>
            </span>
          </div>
        </div>

        {/* Safety Lock Status */}
        <div className="bg-white dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-850 p-6 rounded-3xl shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-amber-50 dark:bg-amber-950/40 rounded-2xl flex items-center justify-center text-amber-600 dark:text-amber-500">
            <ShieldAlert size={20} />
          </div>
          <div>
            <span className="text-[10px] text-zinc-400 font-extrabold uppercase tracking-widest block">Immutable Status</span>
            <span className="text-lg font-black text-amber-600 dark:text-amber-500 mt-1 uppercase tracking-tighter italic block">
              {isSupervisor ? 'SUPER ADMIN (CLEAR OK)' : 'LOCKED (READ-ONLY)'}
            </span>
          </div>
        </div>
      </div>

      {/* Advanced Filters Frame */}
      <div className="bg-white dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-850 p-6 rounded-3xl shadow-md space-y-6">
        <h3 className="text-xs font-black uppercase text-zinc-400 dark:text-zinc-600 tracking-[0.2em] flex items-center gap-2">
          <Filter size={14} /> Filter Control Deck
        </h3>

        {/* Row 1: Search & Date picker */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Keyword Search */}
          <div className="relative group">
            <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-zinc-400 group-focus-within:text-indigo-600 transition-colors" size={18} />
            <input 
              type="text" 
              placeholder="Search by keyword (Enter)..." 
              className="w-full bg-slate-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl pl-16 pr-6 py-4 text-xs font-black uppercase tracking-tight outline-none focus:border-indigo-600 transition-all placeholder:text-zinc-300 dark:placeholder:text-zinc-700 italic shadow-sm" 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleSearchKeyPress}
            />
          </div>

          {/* Date from */}
          <div className="relative flex items-center">
            <span className="absolute left-6 text-zinc-400 font-black text-[9px] uppercase tracking-widest pl-1">From:</span>
            <input 
              type="date"
              className="w-full bg-slate-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl pl-20 pr-6 py-4 text-xs font-black uppercase tracking-tight outline-none focus:border-indigo-600 transition-all shadow-sm" 
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </div>

          {/* Date to */}
          <div className="relative flex items-center">
            <span className="absolute left-6 text-zinc-400 font-black text-[9px] uppercase tracking-widest pl-1">To:</span>
            <input 
              type="date"
              className="w-full bg-slate-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl pl-20 pr-6 py-4 text-xs font-black uppercase tracking-tight outline-none focus:border-indigo-600 transition-all shadow-sm" 
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </div>
        </div>

        {/* Row 2: Category selections */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-6">
          {/* Filter by User */}
          <select
            className="bg-slate-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl px-6 py-4 text-[10px] font-black uppercase tracking-widest text-zinc-500 hover:text-indigo-600 transition-all cursor-pointer shadow-sm outline-none"
            value={filterUser}
            onChange={(e) => { setFilterUser(e.target.value); setPage(1); }}
          >
            <option value="all">👥 ALL USERS</option>
            {filtersData.users.map(u => (
              <option key={u} value={u}>{u.toUpperCase()}</option>
            ))}
          </select>

          {/* Filter by Action Code */}
          <select
            className="bg-slate-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl px-6 py-4 text-[10px] font-black uppercase tracking-widest text-zinc-500 hover:text-indigo-600 transition-all cursor-pointer shadow-sm outline-none"
            value={filterAction}
            onChange={(e) => { setFilterAction(e.target.value); setPage(1); }}
          >
            <option value="all">⚡ ALL ACTIONS</option>
            {filtersData.actions.map(act => (
              <option key={act} value={act}>{act}</option>
            ))}
          </select>

          {/* Filter by Section */}
          <select
            className="bg-slate-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl px-6 py-4 text-[10px] font-black uppercase tracking-widest text-zinc-500 hover:text-indigo-600 transition-all cursor-pointer shadow-sm outline-none"
            value={filterSection}
            onChange={(e) => { setFilterSection(e.target.value); setPage(1); }}
          >
            <option value="all">📂 ALL SECTIONS</option>
            {filtersData.sections.map(sec => (
              <option key={sec} value={sec}>{sec.toUpperCase()}</option>
            ))}
          </select>

          {/* Filter by Status */}
          <select
            className="bg-slate-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl px-6 py-4 text-[10px] font-black uppercase tracking-widest text-zinc-500 hover:text-indigo-600 transition-all cursor-pointer shadow-sm outline-none"
            value={filterStatus}
            onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
          >
            <option value="all">🚦 ALL STATUSES</option>
            <option value="success">✅ SUCCESS</option>
            <option value="error">❌ ERROR</option>
          </select>

          {/* Reset button */}
          <button
            onClick={resetFilters}
            className="flex items-center justify-center gap-2 px-6 py-4 bg-zinc-150 dark:bg-zinc-900 border border-zinc-250 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all italic shadow-sm"
          >
            <RefreshCw size={12} /> Reset Deck
          </button>
        </div>
      </div>

      {/* Main Table Records Frame */}
      <div className="bg-white dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-850 rounded-3xl shadow-md overflow-hidden">
        {isLoading ? (
          <div className="p-32 text-center text-[11px] font-black uppercase tracking-[0.4em] italic text-zinc-300">
            Fetching secure audit records from mainframe...
          </div>
        ) : logs.length === 0 ? (
          <div className="p-32 text-center flex flex-col items-center justify-center">
            <Database size={48} className="text-zinc-200 dark:text-zinc-800 mb-4" />
            <p className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.4em] italic">No audit records found matching configuration</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-zinc-50/50 dark:bg-zinc-950/30 text-zinc-400 dark:text-zinc-600 text-[10px] uppercase font-black tracking-[0.2em] italic border-b border-zinc-100 dark:border-zinc-800">
                  <th className="px-8 py-6">ID</th>
                  <th className="px-8 py-6">Operator</th>
                  <th className="px-8 py-6">Subsystem</th>
                  <th className="px-8 py-6">Trigger Event</th>
                  <th className="px-8 py-6">IP Address</th>
                  <th className="px-8 py-6">Status</th>
                  <th className="px-8 py-6">Time Checked</th>
                  {isSupervisor && <th className="px-8 py-6 text-right pr-12">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/30">
                {logs.map((item) => (
                  <React.Fragment key={item.id}>
                    <tr 
                      onClick={() => setSelectedLog(selectedLog?.id === item.id ? null : item)}
                      className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/10 transition-colors cursor-pointer group"
                    >
                      {/* ID */}
                      <td className="px-8 py-5">
                        <span className="font-mono text-zinc-400 font-bold">#{item.id}</span>
                      </td>

                      {/* Operator User */}
                      <td className="px-8 py-5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-zinc-900 flex items-center justify-center text-zinc-500">
                            <UserIcon size={14} />
                          </div>
                          <div>
                            <p className="text-xs font-black text-zinc-900 dark:text-white uppercase tracking-tight italic">{item.user_name}</p>
                            <p className="text-[8px] text-zinc-400 uppercase tracking-widest mt-0.5">Authorized Operative</p>
                          </div>
                        </div>
                      </td>

                      {/* Section */}
                      <td className="px-8 py-5">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-900 text-zinc-500 text-[9px] font-black uppercase tracking-wider">
                          <Tag size={10} /> {item.section}
                        </span>
                      </td>

                      {/* Event Type */}
                      <td className="px-8 py-5">
                        <p className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 font-mono tracking-tight uppercase">
                          {item.action_type}
                        </p>
                        <p className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate max-w-[280px] mt-0.5 font-bold">
                          {item.details}
                        </p>
                      </td>

                      {/* IP address */}
                      <td className="px-8 py-5">
                        <span className="font-mono text-xs font-semibold text-zinc-400">{item.ip_address}</span>
                      </td>

                      {/* Status Check badge */}
                      <td className="px-8 py-5">
                        {item.status === 'success' ? (
                          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/35 dark:text-emerald-400 text-[8px] font-black tracking-widest uppercase">
                            SUCCESS
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-rose-100 text-rose-800 dark:bg-rose-900/35 dark:text-rose-400 text-[8px] font-black tracking-widest uppercase">
                            FAILED
                          </span>
                        )}
                      </td>

                      {/* Time Checked */}
                      <td className="px-8 py-5">
                        <div className="flex items-center gap-2 text-zinc-500">
                          <Clock size={12} className="text-zinc-300" />
                          <span className="text-[10px] font-bold">{new Date(item.created_at).toLocaleString()}</span>
                        </div>
                      </td>

                      {/* Actions */}
                      {isSupervisor && (
                        <td className="px-8 py-5 text-right pr-12" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => handleDeleteLog(item.id)}
                            className="bg-zinc-50 hover:bg-rose-100 dark:bg-zinc-900 dark:hover:bg-rose-900/20 text-zinc-400 hover:text-rose-500 p-2.5 rounded-xl transition-all shadow-sm"
                            title="Delete specific log entry"
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      )}
                    </tr>

                    {/* Collapsible log detail frame */}
                    {selectedLog?.id === item.id && (
                      <tr>
                        <td colSpan={isSupervisor ? 8 : 7} className="px-10 py-6 bg-slate-50/50 dark:bg-zinc-950/20 border-t border-b border-zinc-100 dark:border-zinc-850">
                          <motion.div 
                            initial={{ opacity: 0, y: -5 }} 
                            animate={{ opacity: 1, y: 0 }}
                            className="space-y-4"
                          >
                            <div className="flex items-center justify-between">
                              <h4 className="text-[10px] font-black uppercase text-zinc-400 tracking-widest flex items-center gap-2">
                                <Terminal size={14} /> Full Hardware & Parameter Envelope Trace Exception
                              </h4>
                              <button 
                                onClick={() => setSelectedLog(null)} 
                                className="text-zinc-400 hover:text-zinc-600 p-1 bg-white hover:bg-zinc-100 dark:bg-zinc-900 rounded-lg shadow-sm"
                              >
                                <X size={12} />
                              </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              <div className="space-y-2">
                                <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Payload Details Summary</p>
                                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 font-bold text-xs text-zinc-700 dark:text-zinc-300 italic shadow-inner">
                                  {item.details}
                                </div>
                              </div>

                              <div className="space-y-2">
                                <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Request Headers Device Signature</p>
                                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 font-mono text-[10px] text-zinc-500 tracking-tight shadow-inner truncate">
                                  {item.user_agent}
                                </div>
                              </div>
                            </div>
                          </motion.div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Dynamic Pagination Controls */}
        {!isLoading && logs.length > 0 && (
          <div className="bg-zinc-50/50 dark:bg-zinc-950/35 border-t border-zinc-100 dark:border-zinc-800 px-8 py-5 flex items-center justify-between">
            <span className="text-[10.5px] font-black uppercase tracking-widest text-zinc-400">
              Showing Page <span className="text-zinc-900 dark:text-zinc-300">{pagination.currentPage}</span> of {pagination.totalPages} ({pagination.totalItems} events documented)
            </span>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={!pagination.hasPrevPage}
                className="p-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl hover:text-indigo-600 transition-all font-bold disabled:opacity-40 disabled:hover:text-inherit shadow-sm cursor-pointer"
              >
                <ChevronLeft size={16} />
              </button>

              <div className="flex items-center gap-1">
                {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map((idx) => (
                  <button
                    key={idx}
                    onClick={() => setPage(idx)}
                    className={`w-9 h-9 rounded-xl text-[10.5px] font-black uppercase transition-all shadow-sm flex items-center justify-center ${
                      pagination.currentPage === idx 
                        ? 'bg-indigo-600 text-white font-extrabold shadow-md shadow-indigo-600/20' 
                        : 'bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-400 hover:text-indigo-600'
                    }`}
                  >
                    {idx}
                  </button>
                ))}
              </div>

              <button
                onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
                disabled={!pagination.hasNextPage}
                className="p-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl hover:text-indigo-600 transition-all font-bold disabled:opacity-40 disabled:hover:text-inherit shadow-sm cursor-pointer"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
