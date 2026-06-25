import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { motion } from 'motion/react';
import { useAuth } from '../context/AuthContext';
import { Trophy, Calendar, MessageSquare, Bell, ChevronRight } from 'lucide-react';

type SummaryRow = {
  tl_id: number;
  tl_name: string;
  coaching_score: number;
  sla_score: number;
  total_score: number;
};

type Detail = {
  tl_id: number;
  month: string;
  config: any;
  coaching: { total: number; target: number; score: number; weight: number };
  escalations: { total: number; responded: number; within_sla: number; sla_hours: number; score: number; weight: number };
  total_score: number;
};

const currentMonth = () => new Date().toISOString().slice(0, 7);
const scoreColor = (s: number) =>
  s >= 90 ? 'text-emerald-600 dark:text-emerald-400' :
  s >= 75 ? 'text-indigo-600 dark:text-indigo-400' :
  s >= 60 ? 'text-amber-600 dark:text-amber-400' :
  'text-rose-600 dark:text-rose-400';
const scoreBg = (s: number) =>
  s >= 90 ? 'bg-emerald-500' : s >= 75 ? 'bg-indigo-500' : s >= 60 ? 'bg-amber-500' : 'bg-rose-500';

export default function TLKPIs() {
  const { user } = useAuth();
  const [month, setMonth] = useState(currentMonth());
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [selectedTL, setSelectedTL] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ user_id: String(user.id), role: user.role, month });
      const sRes = await fetch(`/api/kpi/tl-summary?${params}`);
      const sJson = await sRes.json();
      setSummary(sJson.tls || []);
      if (selectedTL) {
        const dRes = await fetch(`/api/kpi/tl/${selectedTL}?month=${month}`);
        setDetail(await dRes.json());
      } else {
        setDetail(null);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [user, month, selectedTL]);
  useEffect(() => { fetchAll(); }, [fetchAll]);

  const selectedName = useMemo(() => summary.find(s => s.tl_id === selectedTL)?.tl_name || '', [summary, selectedTL]);

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-zinc-900 dark:text-white tracking-tighter flex items-center gap-3 italic uppercase">
            <Trophy className="text-indigo-600" size={28} />
            TL KPIs
          </h1>
          <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest mt-2">
            Coachings 60% · Escalations SLA 40%
          </p>
        </div>
        <div className="flex items-center gap-2 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2">
          <Calendar size={14} className="text-indigo-500" />
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)}
            className="bg-transparent text-xs font-bold text-zinc-800 dark:text-zinc-100 outline-none cursor-pointer dark:[color-scheme:dark]" />
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-zinc-100 dark:border-zinc-900">
          <h2 className="text-sm font-black text-zinc-900 dark:text-white tracking-tight uppercase">TL Leaderboard — {month}</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[600px]">
            <thead>
              <tr className="border-b border-zinc-100 dark:border-zinc-900 text-[10px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-600">
                <th className="px-6 py-3">Rank</th>
                <th className="px-6 py-3">Team Leader</th>
                <th className="px-6 py-3">Coaching</th>
                <th className="px-6 py-3">SLA</th>
                <th className="px-6 py-3 text-right">Total</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
              {loading ? Array.from({ length: 3 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td colSpan={6} className="px-6 py-4"><div className="h-3 bg-zinc-100 dark:bg-zinc-900 rounded w-full" /></td>
                </tr>
              )) : summary.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-[10px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-600">
                  No Team Leaders found
                </td></tr>
              ) : summary.map((row, i) => {
                const isOpen = selectedTL === row.tl_id;
                return (
                  <tr key={row.tl_id} onClick={() => setSelectedTL(isOpen ? null : row.tl_id)}
                      className={`group cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900/40 ${isOpen ? 'bg-indigo-500/5' : ''}`}>
                    <td className="px-6 py-4 text-xs font-mono font-bold text-zinc-500">{String(i + 1).padStart(2, '0')}</td>
                    <td className="px-6 py-4 text-sm font-bold text-zinc-900 dark:text-white">{row.tl_name}</td>
                    <td className={`px-6 py-4 text-xs font-black ${scoreColor(row.coaching_score)}`}>{row.coaching_score.toFixed(1)}</td>
                    <td className={`px-6 py-4 text-xs font-black ${scoreColor(row.sla_score)}`}>{row.sla_score.toFixed(1)}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="inline-flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-zinc-100 dark:bg-zinc-900 rounded-full overflow-hidden">
                          <div className={`h-full ${scoreBg(row.total_score)} rounded-full`} style={{ width: `${Math.min(100, row.total_score)}%` }} />
                        </div>
                        <span className={`text-sm font-black ${scoreColor(row.total_score)}`}>{row.total_score.toFixed(1)}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4"><ChevronRight size={14} className={`text-zinc-400 transition-transform ${isOpen ? 'rotate-90' : ''}`} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {detail && (
        <div className="space-y-6">
          <div className="bg-gradient-to-br from-indigo-600 to-indigo-700 rounded-3xl p-8 text-white shadow-xl shadow-indigo-500/20">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.3em] opacity-80">TL KPI · {detail.month}</p>
                <h2 className="text-3xl sm:text-4xl font-black tracking-tighter mt-1">{selectedName}</h2>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-black uppercase tracking-[0.3em] opacity-80">Total Score</p>
                <p className="text-5xl sm:text-6xl font-black tracking-tighter">{detail.total_score.toFixed(1)}<span className="text-2xl opacity-80">%</span></p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <KPICard icon={MessageSquare} label="Coachings" weight={detail.coaching.weight} score={detail.coaching.score}
              lines={[['Done', detail.coaching.total], ['Target', detail.coaching.target]]} />
            <KPICard icon={Bell} label="Escalations SLA" weight={detail.escalations.weight} score={detail.escalations.score}
              lines={[['Total', detail.escalations.total], ['Responded', detail.escalations.responded], ['Within SLA', detail.escalations.within_sla], ['SLA', `${detail.escalations.sla_hours}h`]]} />
          </div>
        </div>
      )}
    </div>
  );
}

function KPICard({ icon: Icon, label, weight, score, lines }: { icon: any; label: string; weight: number; score: number; lines: [string, any][] }) {
  return (
    <motion.div layout className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"><Icon size={14} /></div>
          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">{label}</p>
        </div>
        <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400">{(weight * 100).toFixed(0)}%</span>
      </div>
      <div className="flex items-baseline gap-1 mb-3">
        <span className={`text-3xl font-black tracking-tighter ${scoreColor(score)}`}>{score.toFixed(1)}</span>
        <span className="text-xs text-zinc-400 font-bold">/ 100</span>
      </div>
      <div className="h-1.5 bg-zinc-100 dark:bg-zinc-900 rounded-full overflow-hidden mb-4">
        <div className={`h-full ${scoreBg(score)} rounded-full`} style={{ width: `${Math.min(100, score)}%` }} />
      </div>
      <div className="space-y-1">
        {lines.map(([k, v]) => (
          <div key={k} className="flex justify-between text-[10px] font-bold text-zinc-500 dark:text-zinc-400">
            <span>{k}</span><span className="font-mono text-zinc-700 dark:text-zinc-200">{v}</span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
