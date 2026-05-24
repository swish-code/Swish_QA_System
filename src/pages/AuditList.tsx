import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  Search, 
  Filter, 
  FileText, 
  Eye, 
  Download,
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
  ChevronDown
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Evaluation } from '../types';
import { motion, AnimatePresence } from 'motion/react';

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
  const [startDate, setStartDate] = useState(searchParams.get('from_date') || '');
  const [endDate, setEndDate] = useState(searchParams.get('to_date') || '');
  
  const [isLoading, setIsLoading] = useState(true);
  const [isChangingPage, setIsChangingPage] = useState(false);

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

  return (
    <div className="space-y-8 max-w-[1400px] mx-auto">
      {/* Header & Stats Banner */}
      <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-[2.5rem] p-8 md:p-12 relative overflow-hidden transition-colors duration-300 shadow-sm">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-600/5 blur-[120px] -z-10" />
        
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-emerald-500">
                <FileText size={20} />
              </div>
              <h1 className="text-3xl font-black text-zinc-900 dark:text-white tracking-tighter uppercase italic">All Calls</h1>
            </div>
            <p className="text-zinc-500 text-xs font-medium max-w-md leading-relaxed">
              Explore and filter the complete archive of call evaluations. Monitor agent performance and call quality metrics in one place.
            </p>
          </div>

          <div className="flex gap-4">
            <div className="bg-white dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800 p-6 rounded-3xl min-w-[160px] transition-colors duration-300">
              <p className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mb-2">Total Results</p>
              <p className="text-3xl font-black text-zinc-900 dark:text-white tracking-tighter">{pagination?.totalItems || 0}</p>
            </div>
            <div className="bg-white dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800 p-6 rounded-3xl min-w-[160px] transition-colors duration-300">
              <p className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mb-2">Global Avg.</p>
              <p className="text-3xl font-black text-indigo-600 dark:text-emerald-500 tracking-tighter">
                {evaluations.length > 0 
                  ? Math.round(evaluations.reduce((acc, curr) => acc + curr.final_score, 0) / evaluations.length)
                  : 0}%
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Filter Section */}
      <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-[2.5rem] p-8 space-y-8 shadow-sm dark:shadow-2xl transition-colors duration-300">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Agent Filter */}
          <div className="space-y-3">
            <label className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.2em] ml-2 font-mono">Agent User</label>
            <div className="relative group">
              <select 
                className="w-full bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-2xl px-6 py-4 text-sm text-zinc-800 dark:text-zinc-100 outline-none focus:border-indigo-500 transition-all appearance-none cursor-pointer"
                value={selectedAgent}
                onChange={(e) => setSelectedAgent(e.target.value)}
              >
                <option value="all">All Agents</option>
                {agents.map(a => (
                  <option key={a.id} value={a.id}>{a.display_name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-5 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-600 transition-colors group-hover:text-zinc-600 dark:group-hover:text-zinc-400" size={14} />
            </div>
          </div>

          {/* Date Filter: From */}
          <div className="space-y-3">
            <label className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.2em] ml-2">From Date</label>
            <div className="relative">
              <input 
                type="date" 
                className="w-full bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-2xl px-6 py-4 text-sm text-zinc-800 dark:text-zinc-100 outline-none focus:border-indigo-500 transition-all dark:[color-scheme:dark]"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
          </div>

          {/* Date Filter: To */}
          <div className="space-y-3">
            <label className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.2em] ml-2">To Date</label>
            <div className="relative">
              <input 
                type="date" 
                className="w-full bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-2xl px-6 py-4 text-sm text-zinc-800 dark:text-zinc-100 outline-none focus:border-indigo-500 transition-all dark:[color-scheme:dark]"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          {/* Search Filter */}
          <div className="space-y-3">
            <label className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.2em] ml-2">Keyword Search</label>
            <div className="relative group">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-600 group-focus-within:text-indigo-600 dark:group-focus-within:text-indigo-400 transition-colors" size={16} />
              <input 
                type="text" 
                placeholder="Search brands, types..."
                className="w-full bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-2xl pl-12 pr-6 py-4 text-sm text-zinc-800 dark:text-zinc-100 outline-none focus:border-indigo-500 transition-all placeholder:text-zinc-400"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Filter Actions */}
        <div className="flex flex-col sm:flex-row justify-between items-center pt-4 border-t border-zinc-200 dark:border-zinc-800/50 gap-4">
          <div className="flex items-center gap-4">
            <div className="space-y-3 min-w-[200px]">
              <select 
                className="w-full bg-white dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800 rounded-xl px-4 py-2 text-[10px] font-black uppercase text-zinc-500 outline-none focus:border-indigo-500 transition-all appearance-none cursor-pointer tracking-widest text-center"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">Any Status</option>
                {/* ... existing options ... */}
                <option value="Pending Review">Pending Review</option>
                <option value="Sent to Agent">Sent to Agent</option>
                <option value="Escalated">Escalated</option>
                <option value="Reevaluated">Reevaluated</option>
              </select>
            </div>
          </div>

          <div className="flex gap-4 w-full sm:w-auto">
            <button 
              onClick={handleResetFilters}
              className="flex-1 sm:flex-none px-8 py-3 rounded-2xl bg-white dark:bg-zinc-900 text-zinc-500 font-black text-[10px] uppercase tracking-widest border border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 hover:text-zinc-800 dark:hover:text-white transition-all shadow-sm active:scale-95"
            >
              Reset
            </button>
            <button 
              onClick={handleApplyFilters}
              className="flex-1 sm:flex-none px-10 py-3 rounded-2xl bg-indigo-600 text-white font-black text-[10px] uppercase tracking-widest shadow-xl shadow-indigo-500/20 hover:bg-indigo-500 transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              <Filter size={14} />
              Apply Filters
            </button>
          </div>
        </div>
      </div>

      {/* List Container */}
      <div className="bg-white dark:bg-zinc-950/50 rounded-[2.5rem] border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-sm dark:shadow-2xl backdrop-blur-sm transition-colors duration-300">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-zinc-100 dark:border-zinc-800/50">
                <th className="px-8 py-6 text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">Audit Profile</th>
                <th className="px-8 py-6 text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">Metadata</th>
                <th className="px-8 py-6 text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">Performance</th>
                <th className="px-8 py-6 text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">Status</th>
                <th className="px-8 py-6 text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/30">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={5} className="px-8 py-10">
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
                  <td colSpan={5} className="py-20 text-center text-zinc-400 dark:text-zinc-600 italic text-sm">
                    No audits found matching your criteria.
                  </td>
                </tr>
              ) : (
                <AnimatePresence mode="popLayout">
                  {evaluations.map((audit) => (
                    <motion.tr 
                      key={audit.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: isChangingPage ? 0.3 : 1 }}
                      exit={{ opacity: 0 }}
                      className="group hover:bg-zinc-50 dark:hover:bg-zinc-800/20 transition-all cursor-pointer"
                      onClick={() => navigate(`/evaluate/${audit.id}`)}
                    >
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center text-zinc-400 group-hover:border-indigo-500 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-all">
                          <User size={18} />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-zinc-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors uppercase tracking-tight">{audit.agent_name}</p>
                          <p className="text-[10px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-widest mt-1">ID: #{audit.agent_id}</p>
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
                      <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                         <button 
                           onClick={(e) => { e.stopPropagation(); navigate(`/evaluate/${audit.id}`); }}
                           className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-400 hover:text-indigo-600 dark:hover:text-white hover:border-indigo-300 dark:hover:border-zinc-600 transition-all flex items-center gap-2 group/btn"
                           title="View Details"
                         >
                           <Eye size={16} />
                         </button>
                         {user?.role === 'tl' && (
                           <button 
                             onClick={(e) => { 
                               e.stopPropagation(); 
                               navigate(`/coaching?agent_id=${audit.agent_id}&evaluation_id=${audit.id}`); 
                             }}
                             className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 hover:bg-emerald-500 hover:text-white transition-all flex items-center gap-2"
                             title="Start Coaching"
                           >
                             <MessageSquare size={16} />
                           </button>
                         )}
                         <button 
                           onClick={(e) => e.stopPropagation()}
                           className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-400 hover:text-indigo-600 dark:hover:text-white hover:border-indigo-300 dark:hover:border-zinc-600 transition-all"
                         >
                           <Download size={16} />
                         </button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
              )}
            </tbody>
          </table>
        </div>

        {/* Improved Pagination Footer */}
        {pagination && pagination.totalPages > 0 && (
          <div className="bg-white dark:bg-zinc-950/50 border-t border-zinc-100 dark:border-zinc-800 px-8 py-6 flex flex-col md:flex-row items-center justify-between gap-6 transition-colors duration-300">
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
                  {[15, 25, 50].map((l) => (
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
    </div>
  );
}
