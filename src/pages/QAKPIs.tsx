import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  Target, Phone, Clock, ListChecks, ShieldCheck, TrendingUp, Trophy, Settings,
  Calendar, ArrowRight, AlertCircle, ChevronRight, Download
} from 'lucide-react';
import * as XLSX from 'xlsx';

type SummaryRow = {
  qa_id: number;
  qa_name: string;
  calls_score: number;
  duration_score: number;
  tasks_score: number;
  accuracy_score: number;
  total_score: number;
};

type Detail = {
  qa_id: number;
  month: string;
  config: any;
  calls: { actual: number; target: number; score: number; weight: number };
  duration: { actual_hours: number; target_hours: number; leave_days: number; score: number; weight: number };
  tasks: { total: number; on_time: number; overdue: number; sla_hours: number; score: number; weight: number };
  accuracy: { cases: number; deductions: number; score: number; weight: number };
  total_score: number;
};

const currentMonth = () => new Date().toISOString().slice(0, 7);

function scoreColor(s: number): string {
  if (s >= 90) return 'text-emerald-600 dark:text-emerald-400';
  if (s >= 75) return 'text-indigo-600 dark:text-indigo-400';
  if (s >= 60) return 'text-amber-600 dark:text-amber-400';
  return 'text-rose-600 dark:text-rose-400';
}

function scoreBg(s: number): string {
  if (s >= 90) return 'bg-emerald-500';
  if (s >= 75) return 'bg-indigo-500';
  if (s >= 60) return 'bg-amber-500';
  return 'bg-rose-500';
}

export default function QAKPIs() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [month, setMonth] = useState(currentMonth());
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedQA, setSelectedQA] = useState<number | null>(null);

  // QAs see their own detail by default; supervisors see the summary table
  // and can click into a QA to see the breakdown.
  const isSupervisor = user?.role === 'supervisor';
  const targetQAId = selectedQA ?? (isSupervisor ? null : (user?.id ?? null));

  const fetchSummary = useCallback(async () => {
    if (!isSupervisor) return;
    try {
      const res = await fetch(`/api/kpi/summary?month=${month}`);
      if (!res.ok) throw new Error('summary fetch failed');
      const data = await res.json();
      setSummary(data.qas || []);
    } catch (e) { console.error(e); }
  }, [month, isSupervisor]);

  const fetchDetail = useCallback(async () => {
    if (!targetQAId) { setDetail(null); return; }
    try {
      const res = await fetch(`/api/kpi/qa/${targetQAId}?month=${month}`);
      if (!res.ok) throw new Error('detail fetch failed');
      setDetail(await res.json());
    } catch (e) { console.error(e); setDetail(null); }
  }, [targetQAId, month]);

  // -------------------------------------------------------------------
  // Excel export
  //   Supervisor view → two sheets:
  //     1. Leaderboard (one row per QA — summary scores)
  //     2. Full Breakdown (one row per QA — every metric's raw + score)
  //   QA self-view → single sheet with their own breakdown.
  // Fetches detail for every QA on the fly so weights/targets are
  // accurate even if defaults were customised per user.
  // -------------------------------------------------------------------
  const [exporting, setExporting] = useState(false);
  const exportToExcel = useCallback(async () => {
    setExporting(true);
    try {
      // Always fetch per-QA detail rows (the leaderboard endpoint only
      // returns scores, not the raw counts we want in the breakdown).
      const qaIds = isSupervisor
        ? summary.map(s => s.qa_id)
        : (user ? [user.id] : []);
      const details = await Promise.all(
        qaIds.map(id =>
          fetch(`/api/kpi/qa/${id}?month=${month}`)
            .then(r => r.ok ? r.json() : null)
            .catch(() => null)
        )
      ).then(rows => rows.filter(Boolean) as Detail[]);

      const wb = XLSX.utils.book_new();

      // ----- Sheet 1: Leaderboard (supervisor only) -----
      if (isSupervisor) {
        const leaderboardRows = summary.map((s, i) => ({
          Rank: i + 1,
          'QA Name': s.qa_name,
          'Calls Score': s.calls_score,
          'Duration Score': s.duration_score,
          'Tasks Score': s.tasks_score,
          'Accuracy Score': s.accuracy_score,
          'Total Score': s.total_score,
        }));
        const ws1 = XLSX.utils.json_to_sheet(leaderboardRows);
        ws1['!cols'] = [
          { wch: 6 }, { wch: 24 }, { wch: 13 }, { wch: 15 }, { wch: 13 }, { wch: 16 }, { wch: 14 },
        ];
        XLSX.utils.book_append_sheet(wb, ws1, 'Leaderboard');
      }

      // ----- Sheet 2: Full per-QA breakdown -----
      const idToName = new Map(summary.map(s => [s.qa_id, s.qa_name]));
      const detailRows = details.map(d => {
        const name = idToName.get(d.qa_id) || (user?.id === d.qa_id ? user.display_name : `QA #${d.qa_id}`);
        return {
          QA: name,
          Month: d.month,
          'Calls Logged': d.calls.actual,
          'Calls Target': d.calls.target,
          'Calls Score': d.calls.score,
          'Calls Weight %': (d.calls.weight * 100).toFixed(0),
          'Duration Hours': d.duration.actual_hours,
          'Duration Target Hours': d.duration.target_hours,
          'Leave Days': d.duration.leave_days,
          'Duration Score': d.duration.score,
          'Duration Weight %': (d.duration.weight * 100).toFixed(0),
          'Tasks Total': d.tasks.total,
          'Tasks On Time': d.tasks.on_time,
          'Tasks Overdue': d.tasks.overdue,
          'SLA Hours': d.tasks.sla_hours,
          'Tasks Score': d.tasks.score,
          'Tasks Weight %': (d.tasks.weight * 100).toFixed(0),
          'Accuracy Cases': d.accuracy.cases,
          'Accuracy Deductions': d.accuracy.deductions,
          'Accuracy Score': d.accuracy.score,
          'Accuracy Weight %': (d.accuracy.weight * 100).toFixed(0),
          'TOTAL SCORE': d.total_score,
        };
      });
      const ws2 = XLSX.utils.json_to_sheet(detailRows);
      ws2['!cols'] = new Array(23).fill(null).map(() => ({ wch: 16 }));
      ws2['!cols'][0] = { wch: 22 }; // QA name a bit wider
      XLSX.utils.book_append_sheet(wb, ws2, 'Full Breakdown');

      // ----- Sheet 3: Accuracy cases for this month (supervisor only) -----
      if (isSupervisor) {
        try {
          const monthStart = `${month}-01`;
          const [yr, mo] = month.split('-').map(Number);
          const lastDay = new Date(yr, mo, 0).getDate();
          const monthEnd = `${month}-${String(lastDay).padStart(2, '0')}`;
          const casesRes = await fetch(`/api/accuracy-cases?from_date=${monthStart}&to_date=${monthEnd}`);
          if (casesRes.ok) {
            const cases = await casesRes.json();
            const caseRows = (cases as any[]).map(c => ({
              ID: c.id,
              QA: c.qa_name,
              'Raised By (TL)': c.tl_name,
              'Call ID': c.evaluation_id || '',
              Title: c.title,
              Severity: c.severity,
              'QA Share %': (Number(c.qa_share) * 100).toFixed(0),
              Status: c.status,
              Description: c.description || '',
              'QA Comment': c.qa_comment || '',
              'Supervisor Note': c.supervisor_note || '',
              'Created At': c.created_at,
              'Resolved At': c.resolved_at || '',
            }));
            if (caseRows.length) {
              const ws3 = XLSX.utils.json_to_sheet(caseRows);
              ws3['!cols'] = [
                { wch: 6 }, { wch: 20 }, { wch: 20 }, { wch: 8 }, { wch: 30 },
                { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 40 }, { wch: 40 },
                { wch: 30 }, { wch: 20 }, { wch: 20 },
              ];
              XLSX.utils.book_append_sheet(wb, ws3, 'Accuracy Cases');
            }
          }
        } catch (e) { console.error('accuracy cases export failed:', e); }
      }

      const filename = isSupervisor
        ? `qa-kpis-${month}.xlsx`
        : `qa-kpis-${user?.display_name?.replace(/\s+/g, '_') || 'me'}-${month}.xlsx`;
      XLSX.writeFile(wb, filename);
    } catch (e) {
      console.error('Excel export failed:', e);
      alert('Excel export failed. See console for details.');
    } finally {
      setExporting(false);
    }
  }, [isSupervisor, summary, month, user]);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchSummary(), fetchDetail()]).finally(() => setLoading(false));
  }, [fetchSummary, fetchDetail]);

  const targetQAName = useMemo(() => {
    if (!targetQAId) return null;
    if (targetQAId === user?.id) return user.display_name;
    return summary.find(s => s.qa_id === targetQAId)?.qa_name || `QA #${targetQAId}`;
  }, [targetQAId, summary, user]);

  return (
    <div className="space-y-6 max-w-[1500px] mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-zinc-900 dark:text-white tracking-tighter flex items-center gap-3 italic uppercase">
            <Trophy className="text-indigo-600" size={28} />
            QA KPIs
          </h1>
          <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest mt-2">
            Monthly performance — Calls 40% · Duration 10% · Tasks 20% · Accuracy 30%
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2">
            <Calendar size={14} className="text-indigo-500" />
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="bg-transparent text-xs font-bold text-zinc-800 dark:text-zinc-100 outline-none cursor-pointer dark:[color-scheme:dark]"
            />
          </div>
          {(user?.role === 'supervisor' || user?.role === 'qa') && (
            <button
              onClick={() => navigate('/accuracy-cases')}
              className="px-4 py-2 rounded-xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 text-[10px] font-black uppercase tracking-widest hover:border-indigo-500/40 transition-colors flex items-center gap-2"
            >
              <ShieldCheck size={12} /> Accuracy Cases
            </button>
          )}
          <button
            onClick={exportToExcel}
            disabled={exporting || loading || (isSupervisor && summary.length === 0)}
            className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500 transition-colors flex items-center gap-2 shadow-lg shadow-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
            title={isSupervisor
              ? 'Download every QA\'s KPI breakdown as an Excel workbook'
              : 'Download your own KPI breakdown as an Excel sheet'}
          >
            {exporting ? (
              <>
                <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Exporting…
              </>
            ) : (
              <>
                <Download size={12} /> Excel
              </>
            )}
          </button>
        </div>
      </div>

      {/* Supervisor summary table */}
      {isSupervisor && (
        <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm">
          <div className="p-4 border-b border-zinc-100 dark:border-zinc-900">
            <h2 className="text-sm font-black text-zinc-900 dark:text-white tracking-tight uppercase">QA Leaderboard — {month}</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[700px]">
              <thead>
                <tr className="border-b border-zinc-100 dark:border-zinc-900 text-[10px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-600">
                  <th className="px-6 py-3">Rank</th>
                  <th className="px-6 py-3">QA</th>
                  <th className="px-6 py-3">Calls</th>
                  <th className="px-6 py-3">Duration</th>
                  <th className="px-6 py-3">Tasks</th>
                  <th className="px-6 py-3">Accuracy</th>
                  <th className="px-6 py-3 text-right">Total</th>
                  <th className="px-6 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td colSpan={8} className="px-6 py-4">
                        <div className="h-3 bg-zinc-100 dark:bg-zinc-900 rounded w-full" />
                      </td>
                    </tr>
                  ))
                ) : summary.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-[10px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-600">
                      No QA users found
                    </td>
                  </tr>
                ) : summary.map((row, i) => {
                  const isOpen = selectedQA === row.qa_id;
                  return (
                    <tr
                      key={row.qa_id}
                      onClick={() => setSelectedQA(isOpen ? null : row.qa_id)}
                      className={`group cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900/40 ${isOpen ? 'bg-indigo-500/5' : ''}`}
                    >
                      <td className="px-6 py-4 text-xs font-mono font-bold text-zinc-500">{String(i + 1).padStart(2, '0')}</td>
                      <td className="px-6 py-4 text-sm font-bold text-zinc-900 dark:text-white">{row.qa_name}</td>
                      <td className={`px-6 py-4 text-xs font-black ${scoreColor(row.calls_score)}`}>{row.calls_score.toFixed(1)}</td>
                      <td className={`px-6 py-4 text-xs font-black ${scoreColor(row.duration_score)}`}>{row.duration_score.toFixed(1)}</td>
                      <td className={`px-6 py-4 text-xs font-black ${scoreColor(row.tasks_score)}`}>{row.tasks_score.toFixed(1)}</td>
                      <td className={`px-6 py-4 text-xs font-black ${scoreColor(row.accuracy_score)}`}>{row.accuracy_score.toFixed(1)}</td>
                      <td className="px-6 py-4 text-right">
                        <div className="inline-flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-zinc-100 dark:bg-zinc-900 rounded-full overflow-hidden">
                            <div className={`h-full ${scoreBg(row.total_score)} rounded-full`} style={{ width: `${Math.min(100, row.total_score)}%` }} />
                          </div>
                          <span className={`text-sm font-black ${scoreColor(row.total_score)}`}>{row.total_score.toFixed(1)}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <ChevronRight size={14} className={`text-zinc-400 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Detail panel */}
      {detail ? (
        <DetailPanel detail={detail} qaName={targetQAName || ''} />
      ) : !isSupervisor && !loading ? (
        <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-12 text-center">
          <AlertCircle className="mx-auto text-zinc-300 mb-3" size={32} />
          <p className="text-[11px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-600">
            No KPI data available for your account this month.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function DetailPanel({ detail, qaName }: { detail: Detail; qaName: string }) {
  const cards = [
    {
      key: 'calls',
      label: 'Calls',
      icon: Phone,
      score: detail.calls.score,
      weight: detail.calls.weight,
      lines: [
        ['Logged', `${detail.calls.actual}`],
        ['Target', `${detail.calls.target}`],
      ],
    },
    {
      key: 'duration',
      label: 'Duration',
      icon: Clock,
      score: detail.duration.score,
      weight: detail.duration.weight,
      lines: [
        ['Active hours', `${detail.duration.actual_hours}h`],
        ['Target', `${detail.duration.target_hours}h`],
        ['Leave days', `${detail.duration.leave_days}`],
      ],
    },
    {
      key: 'tasks',
      label: 'Tasks (Escalations)',
      icon: ListChecks,
      score: detail.tasks.score,
      weight: detail.tasks.weight,
      lines: [
        ['Total', `${detail.tasks.total}`],
        ['On time', `${detail.tasks.on_time}`],
        ['Overdue', `${detail.tasks.overdue}`],
        ['SLA', `${detail.tasks.sla_hours}h`],
      ],
    },
    {
      key: 'accuracy',
      label: 'Accuracy',
      icon: ShieldCheck,
      score: detail.accuracy.score,
      weight: detail.accuracy.weight,
      lines: [
        ['Cases', `${detail.accuracy.cases}`],
        ['Deductions', `${detail.accuracy.deductions}`],
      ],
    },
  ] as const;

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-br from-indigo-600 to-indigo-700 dark:from-indigo-700 dark:to-indigo-900 rounded-3xl p-8 text-white shadow-xl shadow-indigo-500/20">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] opacity-80">Overall KPI · {detail.month}</p>
            <h2 className="text-3xl sm:text-4xl font-black tracking-tighter mt-1">{qaName}</h2>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-black uppercase tracking-[0.3em] opacity-80">Total Score</p>
            <p className="text-5xl sm:text-6xl font-black tracking-tighter">{detail.total_score.toFixed(1)}<span className="text-2xl opacity-80">%</span></p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map(card => {
          const Icon = card.icon;
          return (
            <motion.div
              key={card.key}
              layout
              className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                    <Icon size={14} />
                  </div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">{card.label}</p>
                </div>
                <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-600">
                  {(card.weight * 100).toFixed(0)}%
                </span>
              </div>
              <div className="flex items-baseline gap-1 mb-3">
                <span className={`text-3xl font-black tracking-tighter ${scoreColor(card.score)}`}>{card.score.toFixed(1)}</span>
                <span className="text-xs text-zinc-400 font-bold">/ 100</span>
              </div>
              <div className="h-1.5 bg-zinc-100 dark:bg-zinc-900 rounded-full overflow-hidden mb-4">
                <div className={`h-full ${scoreBg(card.score)} rounded-full transition-all`} style={{ width: `${Math.min(100, card.score)}%` }} />
              </div>
              <div className="space-y-1">
                {card.lines.map(([k, v]) => (
                  <div key={k} className="flex justify-between text-[10px] font-bold text-zinc-500 dark:text-zinc-400">
                    <span>{k}</span>
                    <span className="font-mono text-zinc-700 dark:text-zinc-200">{v}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
