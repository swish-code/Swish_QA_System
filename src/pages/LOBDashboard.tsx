import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { NavLink, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { 
  Trophy, 
  TrendingDown, 
  Zap, 
  AlertCircle, 
  Search,
  Filter,
  Calendar,
  FileCheck,
  Eye,
  ArrowUpRight,
  Target
} from 'lucide-react';
import StatCard from '../components/StatCard';

export default function LOBDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [department, setDepartment] = useState('all');
  const [dateRange, setDateRange] = useState({
    from: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0],
    to: new Date().toISOString().split('T')[0]
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/stats/lob?department=${department}&from_date=${dateRange.from}&to_date=${dateRange.to}`);
      if (!res.ok) throw new Error('LOB data fetch failed');
      const result = await res.json();
      setData(result);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [department, dateRange]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="w-12 h-12 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-10 pb-20">
      {/* Header & Filters */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 bg-card p-8 rounded-[2.5rem] border border-card-border shadow-sm transition-colors duration-300">
        <div>
          <h1 className="text-3xl font-black text-zinc-900 dark:text-white tracking-tighter uppercase mb-2">LOB Performance Hub</h1>
          <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest">Line of Business Analytics & Quality Insights</p>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 bg-white dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800 rounded-xl px-4 py-2 transition-colors duration-300">
            <Filter size={14} className="text-zinc-400 dark:text-zinc-500" />
            <select 
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="bg-transparent border-none text-[10px] font-black uppercase tracking-widest text-zinc-600 dark:text-zinc-400 outline-none"
            >
              <option value="all" className="dark:bg-zinc-900">All Departments</option>
              <option value="Swish" className="dark:bg-zinc-900">Swish</option>
              <option value="Mishmash" className="dark:bg-zinc-900">Mishmash</option>
              <option value="FM" className="dark:bg-zinc-900">FM</option>
              <option value="Complain" className="dark:bg-zinc-900">Complain</option>
              <option value="TEC" className="dark:bg-zinc-900">TEC</option>
            </select>
          </div>

          <div className="flex items-center gap-2 bg-white dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800 rounded-xl px-4 py-2 transition-colors duration-300">
            <Calendar size={14} className="text-zinc-400 dark:text-zinc-500" />
            <input 
              type="date" 
              value={dateRange.from}
              onChange={(e) => setDateRange({...dateRange, from: e.target.value})}
              className="bg-transparent border-none text-[10px] font-black uppercase tracking-widest text-zinc-600 dark:text-zinc-400 outline-none dark:inverted-date-icon"
            />
            <span className="text-zinc-300 dark:text-zinc-700">-</span>
            <input 
              type="date" 
              value={dateRange.to}
              onChange={(e) => setDateRange({...dateRange, to: e.target.value})}
              className="bg-transparent border-none text-[10px] font-black uppercase tracking-widest text-zinc-600 dark:text-zinc-400 outline-none dark:inverted-date-icon"
            />
          </div>
        </div>
      </div>

      {/* Summary Chips */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard title="Overall LOB Quality" value={`${Math.round(data?.summary?.avgScore || 0)}%`} icon={Target} color="purple" trend="+1.2%" />
        <StatCard title="Total LOB Audits" value={data?.summary?.totalAudits || '0'} icon={FileCheck} color="blue" trend="+5%" />
        <StatCard title="Active LOB Agents" value={data?.summary?.activeAgents || '0'} icon={Zap} color="orange" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        {/* Top Performers */}
        <div className="glass-card relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-8 opacity-[0.03] dark:opacity-5 group-hover:opacity-10 transition-opacity">
            <Trophy size={160} className="text-emerald-500" />
          </div>
          <div className="flex items-center gap-3 mb-10 pb-6 border-b border-zinc-100 dark:border-zinc-800/50">
            <Trophy className="text-emerald-600 dark:text-emerald-400" size={20} />
            <h3 className="text-lg font-black text-zinc-900 dark:text-white uppercase tracking-tighter">Elite Performers</h3>
          </div>
          <div className="space-y-6">
            {data?.topPerformers?.map((agent: any, idx: number) => (
              <div key={agent.id} className="flex items-center gap-6 relative z-10">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400 text-xs font-black">
                  #{idx + 1}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-zinc-700 dark:text-zinc-200">{agent.name}</p>
                  <p className="text-[9px] text-zinc-400 dark:text-zinc-500 font-black uppercase tracking-widest mt-1">{agent.count} Evaluations</p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-black text-emerald-600 dark:text-emerald-400 tracking-tighter">{agent.score}%</p>
                </div>
              </div>
            ))}
            {(!data?.topPerformers || data.topPerformers.length === 0) && (
              <p className="text-center py-10 text-zinc-400 dark:text-zinc-700 text-[10px] font-black uppercase tracking-[0.2em]">No performance data available</p>
            )}
          </div>
        </div>

        {/* Bottom Performers */}
        <div className="glass-card relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-8 opacity-[0.03] dark:opacity-5 group-hover:opacity-10 transition-opacity">
            <TrendingDown size={160} className="text-rose-500" />
          </div>
          <div className="flex items-center gap-3 mb-10 pb-6 border-b border-zinc-100 dark:border-zinc-800/50">
            <TrendingDown className="text-rose-600 dark:text-rose-400" size={20} />
            <h3 className="text-lg font-black text-zinc-900 dark:text-white uppercase tracking-tighter">Needs Focus</h3>
          </div>
          <div className="space-y-6 text-zinc-400">
            {data?.bottomPerformers?.map((agent: any, idx: number) => (
              <div key={agent.id} className="flex items-center gap-6 relative z-10">
                <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-600 dark:text-rose-400 text-xs font-black">
                  #{idx + 1}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-zinc-700 dark:text-zinc-200">{agent.name}</p>
                  <p className="text-[9px] text-zinc-400 dark:text-zinc-500 font-black uppercase tracking-widest mt-1">{agent.count} Evaluations</p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-black text-rose-600 dark:text-rose-400 tracking-tighter">{agent.score}%</p>
                </div>
              </div>
            ))}
            {(!data?.bottomPerformers || data.bottomPerformers.length === 0) && (
              <p className="text-center py-10 text-zinc-400 dark:text-zinc-700 text-[10px] font-black uppercase tracking-[0.2em]">No performance data available</p>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        {/* Pain Points (Most Deduced Attributes) */}
        <div className="glass-card">
          <div className="flex items-center gap-3 mb-10 pb-6 border-b border-zinc-100 dark:border-zinc-800/50">
            <AlertCircle className="text-rose-600 dark:text-rose-500" size={20} />
            <h3 className="text-lg font-black text-zinc-900 dark:text-white uppercase tracking-tighter">Pain Points (Critical Deductions)</h3>
          </div>
          <div className="space-y-8">
            {data?.painPoints?.map((point: any) => (
              <div key={point.label} className="space-y-3">
                <div className="flex justify-between items-end">
                  <p className="text-xs font-bold text-zinc-600 dark:text-zinc-300">{point.label}</p>
                  <p className="text-[10px] font-black text-rose-600 dark:text-rose-500 uppercase tracking-widest">{point.count} Hits</p>
                </div>
                <div className="h-2 w-full bg-zinc-100 dark:bg-zinc-900 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${(point.count / (data.summary.totalAudits || 1)) * 100}%` }}
                    className="h-full bg-rose-600 rounded-full shadow-[0_0_10px_rgba(225,29,72,0.3)]"
                  />
                </div>
              </div>
            ))}
            {(!data?.painPoints || data.painPoints.length === 0) && (
              <div className="h-48 flex items-center justify-center">
                 <p className="text-zinc-400 dark:text-zinc-700 text-[10px] font-black uppercase tracking-[0.2em]">No recurring issues identified</p>
              </div>
            )}
          </div>
        </div>

        {/* WOW calls */}
        <div className="glass-card">
          <div className="flex items-center gap-3 mb-10 pb-6 border-b border-zinc-100 dark:border-zinc-800/50">
            <Zap className="text-amber-500 dark:text-amber-400" size={20} />
            <h3 className="text-lg font-black text-zinc-900 dark:text-white uppercase tracking-tighter">LOB WOW CALLS (100%)</h3>
          </div>
          <div className="space-y-4">
            {data?.wowCalls?.map((call: any) => (
              <div key={call.id} className="p-4 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl flex items-center justify-between group hover:border-amber-500/30 transition-all shadow-sm">
                <div className="flex items-center gap-4">
                  <div className="w-8 h-8 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-500">
                    <Zap size={14} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-zinc-900 dark:text-white uppercase tracking-tight">{call.agent_name}</p>
                    <p className="text-[9px] text-zinc-400 dark:text-zinc-500 font-black uppercase tracking-widest mt-1">{call.date}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="px-3 py-1 bg-amber-500/10 rounded-lg text-[9px] font-black text-amber-600 dark:text-amber-500 border border-amber-500/10 uppercase">
                    Perfect Score
                  </div>
                  <button 
                    onClick={() => navigate(`/evaluate/${call.id}`)}
                    className="p-2 bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-xl text-zinc-400 dark:text-zinc-600 hover:text-indigo-600 dark:hover:text-white transition-all"
                  >
                    <Eye size={14} />
                  </button>
                </div>
              </div>
            ))}
            {(!data?.wowCalls || data.wowCalls.length === 0) && (
               <div className="h-48 flex items-center justify-center">
                 <p className="text-zinc-400 dark:text-zinc-700 text-[10px] font-black uppercase tracking-[0.2em]">Searching for excellence...</p>
               </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
