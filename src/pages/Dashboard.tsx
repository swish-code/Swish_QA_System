import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { NavLink, useNavigate } from 'react-router-dom';
import StatCard from '../components/StatCard';
import { motion } from 'motion/react';
import { 
  TrendingUp, 
  Users, 
  FileCheck, 
  AlertCircle, 
  Trophy, 
  Target,
  ArrowUpRight,
  Clock,
  ArrowRightLeft,
  Eye
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell
} from 'recharts';

const data = [
  { name: 'Jan', value: 85 },
  { name: 'Feb', value: 88 },
  { name: 'Mar', value: 82 },
  { name: 'Apr', value: 91 },
  { name: 'May', value: 89 },
  { name: 'Jun', value: 94 },
];

const leaderBoard = [
  { name: 'Ahmed Mohamed', score: 98, trend: '+2%' },
  { name: 'Sarah Khalid', score: 96, trend: '+1%' },
  { name: 'Mahmoud Ali', score: 95, trend: '-3%' },
  { name: 'Layla Youssef', score: 94, trend: '+5%' },
];

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [evals, setEvals] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [evalsRes, statsRes] = await Promise.all([
          fetch(`/api/evaluations?user_id=${user?.id}&role=${user?.role}`),
          fetch(`/api/stats/dashboard?user_id=${user?.id}&role=${user?.role}`)
        ]);
        
        if (!evalsRes.ok || !statsRes.ok) {
          throw new Error('Failed to fetch dashboard data');
        }

        const evalsData = await evalsRes.json();
        const statsData = await statsRes.json();
        
        setEvals(evalsData.data || []);
        setStats(statsData);
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };
    if (user) fetchData();
  }, [user]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="w-8 h-8 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex justify-between items-end border-b border-zinc-200 dark:border-zinc-800 pb-8 transition-colors duration-300">
        <div>
          <h2 className="text-3xl font-light text-zinc-900 dark:text-white tracking-tight mb-1">Welcome back, {user?.display_name} 👋</h2>
          <p className="text-zinc-500 text-sm">Here's your quality performance overview for today.</p>
        </div>
        <div className="flex gap-4">
          <div className="px-4 py-2 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl flex items-center gap-2 transition-colors duration-300">
            <Clock size={16} className="text-indigo-600 dark:text-indigo-400" />
            <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400">{new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Avg Quality Score" value={`${stats?.avgScore || '0'}%`} icon={TrendingUp} trend="+2.5%" color="purple" />
        <StatCard title="Total Audits" value={stats?.totalAudits?.toLocaleString() || '0'} icon={FileCheck} trend="↑ 12" color="blue" />
        <StatCard title="Critical Failures" value={stats?.criticalFailures?.toString() || '0'} icon={AlertCircle} trend="↓ 1" color="red" />
        <StatCard title="Active Agents" value={stats?.activeAgents?.toString() || '0'} icon={Users} color="orange" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Chart */}
        <div className="lg:col-span-2 glass-card">
          <div className="flex justify-between items-center mb-10">
            <div>
              <h3 className="text-lg font-medium text-zinc-900 dark:text-white">Quality Trends</h3>
              <p className="text-xs text-zinc-600 dark:text-zinc-500 font-bold uppercase tracking-widest mt-1">6-Month Analysis</p>
            </div>
            <button className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors flex items-center gap-1 uppercase tracking-widest">
              View Analytics <ArrowUpRight size={14} />
            </button>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data}>
                <defs>
                  <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.05} vertical={false} />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} dy={10} />
                <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(value) => `${value}%`} dx={-10} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: '12px' }}
                  itemStyle={{ color: 'var(--app-fg)', fontSize: '12px' }}
                />
                <Area type="monotone" dataKey="value" stroke="#4f46e5" strokeWidth={2} fillOpacity={1} fill="url(#colorValue)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Leaderboard or Personal Pain Points */}
        <div className="glass-card">
          <div className="flex items-center gap-2 mb-8">
            {user?.role === 'agent' ? (
              <>
                <AlertCircle className="text-rose-400" size={18} />
                <h3 className="text-lg font-medium text-zinc-900 dark:text-white">Focus Areas</h3>
              </>
            ) : (
              <>
                <Trophy className="text-indigo-500 dark:text-indigo-400" size={18} />
                <h3 className="text-lg font-medium text-zinc-900 dark:text-white">Top Performers</h3>
              </>
            )}
          </div>
          
          <div className="space-y-6">
            {user?.role === 'agent' ? (
              stats?.painPoints?.map((item: any, index: number) => (
                <div key={item.label} className="space-y-2">
                  <div className="flex justify-between items-end">
                    <p className="text-[11px] font-bold text-zinc-700 dark:text-zinc-300 line-clamp-1">{item.label}</p>
                    <p className="text-[10px] font-black text-rose-600 dark:text-rose-500 uppercase tracking-widest">{item.count} hits</p>
                  </div>
                  <div className="h-1.5 w-full bg-zinc-100 dark:bg-zinc-950 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${(item.count / (stats.totalAudits || 1)) * 100}%` }}
                      className="h-full bg-rose-500 dark:bg-rose-600 rounded-full"
                    />
                  </div>
                </div>
              ))
            ) : (
              stats?.topPerformers?.map((item: any, index: number) => (
                <div key={item.id} className="flex items-center gap-4 group">
                  <div className="w-8 h-8 rounded-lg bg-white dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-800 flex items-center justify-center text-xs font-mono text-zinc-500 group-hover:border-indigo-500/30 transition-all">
                    0{index + 1}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">{item.name}</p>
                    <div className="w-full bg-zinc-100 dark:bg-zinc-950 h-1 rounded-full mt-2 overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${item.score}%` }}
                        className="h-full bg-indigo-600 rounded-full" 
                      />
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{item.score}%</p>
                  </div>
                </div>
              ))
            )}

            {((user?.role === 'agent' && (!stats?.painPoints || stats.painPoints.length === 0)) || 
              (user?.role !== 'agent' && (!stats?.topPerformers || stats.topPerformers.length === 0))) && (
              <div className="flex-1 flex items-center justify-center h-48">
                 <p className="text-[10px] font-bold text-zinc-400 dark:text-zinc-700 uppercase tracking-widest text-center">No focus data yet</p>
              </div>
            )}
          </div>

          <button 
            onClick={() => navigate(user?.role === 'agent' ? '/audits' : '/team')}
            className="w-full mt-10 py-3 bg-white dark:bg-zinc-950 hover:bg-zinc-50 dark:hover:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-[10px] font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400 transition-all"
          >
            {user?.role === 'agent' ? 'View All Personal Audits' : 'Full Rankings'}
          </button>
        </div>
      </div>



      {user?.role === 'agent' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="glass-card p-8">
            <div className="flex items-center gap-2 mb-6">
              <Target className="text-orange-500" size={24} />
              <h3 className="text-xl font-bold text-zinc-900 dark:text-white">Current Badges</h3>
            </div>
            <div className="flex gap-4">
              <div className="p-4 bg-purple-600/5 dark:bg-purple-600/10 border border-purple-200 dark:border-purple-500/20 rounded-2xl text-center flex-1">
                <Trophy className="text-purple-600 dark:text-purple-400 mx-auto mb-2" size={32} />
                <p className="text-xs font-bold text-purple-600 dark:text-purple-400">Quality Champion</p>
              </div>
              <div className="p-4 bg-blue-600/5 dark:bg-blue-600/10 border border-blue-200 dark:border-blue-500/20 rounded-2xl text-center flex-1">
                <TrendingUp className="text-blue-600 dark:text-blue-400 mx-auto mb-2" size={32} />
                <p className="text-xs font-bold text-blue-600 dark:text-blue-400">Top Performer</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
