import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Users, TrendingUp, Target, MessageSquare } from 'lucide-react';
import StatCard from '../components/StatCard';

interface TeamStats {
  avgTeamQuality: string;
  coachingSessions: number;
  processCompliance: number;
  activeAgents: number;
  teamPerformance: { id: number; name: string; score: number }[];
}

export default function TeamPerformance() {
  const { user } = useAuth();
  const [stats, setStats] = useState<TeamStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch(`/api/stats/team?role=${user?.role}&id=${user?.id}&department=${user?.department}`);
        const data = await res.json();
        setStats(data);
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };

    if (user) {
      fetchStats();
    }
  }, [user]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="w-8 h-8 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8" dir="ltr">
      <div className="border-b border-zinc-200 dark:border-zinc-800 pb-8 flex justify-between items-end transition-colors duration-300">
        <div>
          <h2 className="text-3xl font-light text-zinc-900 dark:text-white tracking-tight mb-1">Team Overview</h2>
          <p className="text-zinc-500 text-sm">Performance metrics for the {user?.department} department.</p>
        </div>
        <div className="flex gap-4">
          <div className="px-4 py-2 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl flex items-center gap-2 shadow-sm transition-colors duration-300">
            <Users size={16} className="text-indigo-600 dark:text-indigo-400" />
            <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">{stats?.activeAgents} Members Active</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Avg Team Quality" value={`${stats?.avgTeamQuality}%`} icon={TrendingUp} color="purple" />
        <StatCard title="Coaching Sessions" value={stats?.coachingSessions.toString() || '0'} icon={MessageSquare} color="blue" />
        <StatCard title="Process Compliance" value={`${stats?.processCompliance}%`} icon={Target} color="green" />
        <StatCard title="Active Agents" value={stats?.activeAgents.toString() || '0'} icon={Users} color="orange" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="glass-card border-zinc-200 dark:border-zinc-800/50 bg-white dark:bg-zinc-900/40 transition-colors duration-300 shadow-sm">
          <div className="mb-10">
            <h3 className="text-lg font-medium text-zinc-900 dark:text-white">Comparative Scorecard</h3>
            <p className="text-[10px] text-zinc-400 dark:text-zinc-500 font-bold uppercase tracking-widest mt-1">Individual Performance Distribution</p>
          </div>
          <div className="h-[300px]">
             <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats?.teamPerformance} layout="vertical" margin={{ left: -30 }}>
                <XAxis type="number" hide domain={[0, 100]} />
                <YAxis dataKey="name" type="category" stroke="#a1a1aa" fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip 
                  cursor={{ fill: 'currentColor', opacity: 0.05 }}
                  contentStyle={{ 
                    backgroundColor: 'var(--tooltip-bg, #ffffff)', 
                    border: '1px solid var(--border-color, #e2e8f0)', 
                    borderRadius: '12px',
                    color: 'var(--tooltip-text, #18181b)'
                  }}
                />
                <Bar dataKey="score" radius={[0, 8, 8, 0]} barSize={12}>
                  {stats?.teamPerformance.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.score > 90 ? '#4f46e5' : '#71717a'} fillOpacity={0.8} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass-card border-zinc-200 dark:border-zinc-800/50 bg-white dark:bg-zinc-900/40 transition-colors duration-300 shadow-sm">
          <div className="mb-8 items-center justify-between flex">
            <div>
              <h3 className="text-lg font-medium text-zinc-900 dark:text-white">Team Roster</h3>
              <p className="text-[10px] text-zinc-400 dark:text-zinc-500 font-bold uppercase tracking-widest mt-1">Real-time status</p>
            </div>
            <button className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest hover:text-indigo-500 dark:hover:text-indigo-300">View All</button>
          </div>
          <div className="space-y-4">
            {stats?.teamPerformance.slice(0, 5).map((member) => (
              <div key={member.id} className="flex items-center justify-between p-4 bg-zinc-50/50 dark:bg-zinc-950/30 rounded-2xl border border-zinc-100 dark:border-zinc-800/50 group hover:border-indigo-600/30 transition-all shadow-sm">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold text-xs">
                    {member.name.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-zinc-700 dark:text-white">{member.name}</p>
                    <p className="text-[9px] text-zinc-400 dark:text-zinc-600 font-bold uppercase tracking-widest mt-1">Agent Performance</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-light text-zinc-900 dark:text-zinc-100 tracking-tighter">{member.score}%</p>
                  <button className="text-[9px] font-black uppercase text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 tracking-widest mt-0.5">Start Coaching</button>
                </div>
              </div>
            ))}
            {stats?.teamPerformance.length === 0 && (
              <div className="p-8 text-center text-zinc-400 dark:text-zinc-600 uppercase text-[10px] font-bold tracking-widest">
                No active agents found
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
