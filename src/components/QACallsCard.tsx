import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'motion/react';
import { Calendar, Headphones, ChevronDown } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

type QARow = {
  id: number;
  display_name: string;
  username: string;
  call_count: number;
};

type QACallsResponse = {
  start_date: string | null;
  end_date: string | null;
  total_calls: number;
  qas: QARow[];
};

type RangePreset = 'today' | 'week' | 'month' | 'all' | 'custom';

const today = () => new Date().toISOString().split('T')[0];

const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
};

const firstOfThisMonth = () => {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().split('T')[0];
};

const labelFor = (preset: RangePreset): string => {
  switch (preset) {
    case 'today': return 'Today';
    case 'week': return 'Last 7 days';
    case 'month': return 'This month';
    case 'all': return 'All time';
    case 'custom': return 'Custom range';
  }
};

export default function QACallsCard() {
  const { user } = useAuth();
  const isQA = user?.role === 'qa';

  const [preset, setPreset] = useState<RangePreset>('today');
  const [startDate, setStartDate] = useState<string>(today());
  const [endDate, setEndDate] = useState<string>(today());
  const [data, setData] = useState<QACallsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [presetOpen, setPresetOpen] = useState(false);

  // Apply preset → start/end dates
  const applyPreset = useCallback((p: RangePreset) => {
    setPreset(p);
    setPresetOpen(false);
    if (p === 'today') { setStartDate(today()); setEndDate(today()); }
    else if (p === 'week') { setStartDate(daysAgo(6)); setEndDate(today()); }
    else if (p === 'month') { setStartDate(firstOfThisMonth()); setEndDate(today()); }
    else if (p === 'all') { setStartDate(''); setEndDate(''); }
    // custom → keep whatever the user picked
  }, []);

  const fetchData = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        user_id: String(user.id),
        role: user.role,
      });
      if (startDate) params.set('start_date', startDate);
      if (endDate) params.set('end_date', endDate);
      const res = await fetch(`/api/stats/qa-calls?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: QACallsResponse = await res.json();
      setData(json);
    } catch (err) {
      console.error('Failed to load QA call counts', err);
      setData({ start_date: null, end_date: null, total_calls: 0, qas: [] });
    } finally {
      setIsLoading(false);
    }
  }, [user, startDate, endDate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const rangeLabel = useMemo(() => {
    if (preset !== 'custom') return labelFor(preset);
    if (!startDate && !endDate) return 'All time';
    if (startDate === endDate) return startDate;
    return `${startDate || '…'} → ${endDate || '…'}`;
  }, [preset, startDate, endDate]);

  // Max count for the bar widths
  const maxCount = useMemo(() => {
    if (!data?.qas?.length) return 0;
    return Math.max(...data.qas.map(q => q.call_count));
  }, [data]);

  return (
    <div className="glass-card">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400">
            <Headphones size={18} />
          </div>
          <div>
            <h3 className="text-lg font-medium text-zinc-900 dark:text-white leading-none">
              {isQA ? 'My Logged Calls' : 'QA Productivity'}
            </h3>
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-600 mt-1">
              Calls registered per Quality user
            </p>
          </div>
        </div>

        {/* Preset dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setPresetOpen(v => !v)}
            className="px-3 py-2 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl flex items-center gap-2 text-[11px] font-bold text-zinc-600 dark:text-zinc-300 hover:border-indigo-500/40 transition-colors min-w-[160px] justify-between"
          >
            <span className="flex items-center gap-2">
              <Calendar size={14} className="text-indigo-500" />
              {rangeLabel}
            </span>
            <ChevronDown size={14} className={`transition-transform ${presetOpen ? 'rotate-180' : ''}`} />
          </button>

          {presetOpen && (
            <>
              {/* Backdrop click-out */}
              <div
                className="fixed inset-0 z-10"
                onClick={() => setPresetOpen(false)}
                aria-hidden
              />
              <div className="absolute right-0 mt-2 w-52 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl shadow-zinc-900/10 dark:shadow-black/40 z-20 overflow-hidden">
                {(['today', 'week', 'month', 'all', 'custom'] as RangePreset[]).map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => applyPreset(p)}
                    className={`w-full text-left px-3 py-2 text-[11px] font-bold uppercase tracking-widest transition-colors ${
                      preset === p
                        ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
                        : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900'
                    }`}
                  >
                    {labelFor(p)}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Custom date inputs */}
      {preset === 'custom' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
          <div>
            <label className="text-[9px] font-black uppercase tracking-widest text-zinc-500 dark:text-zinc-500 mb-1 block">From</label>
            <input
              type="date"
              value={startDate}
              max={endDate || undefined}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs text-zinc-700 dark:text-zinc-200 focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="text-[9px] font-black uppercase tracking-widest text-zinc-500 dark:text-zinc-500 mb-1 block">To</label>
            <input
              type="date"
              value={endDate}
              min={startDate || undefined}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs text-zinc-700 dark:text-zinc-200 focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>
      )}

      {/* Total + rows */}
      <div className="space-y-4">
        <div className="flex items-baseline justify-between border-b border-zinc-100 dark:border-zinc-900 pb-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 dark:text-zinc-500">
            {isQA ? 'Your total' : 'Total calls'}
          </p>
          <p className="text-3xl font-black tracking-tighter text-indigo-600 dark:text-indigo-400">
            {isLoading ? '—' : (data?.total_calls ?? 0).toLocaleString()}
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map(i => (
              <div key={i} className="h-10 bg-zinc-100 dark:bg-zinc-900/50 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : !data?.qas?.length ? (
          <p className="text-center text-[10px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-700 py-6">
            No Quality users found
          </p>
        ) : (
          <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
            {data.qas.map((qa, idx) => {
              const pct = maxCount > 0 ? (qa.call_count / maxCount) * 100 : 0;
              const isMe = qa.id === user?.id;
              return (
                <div
                  key={qa.id}
                  className={`flex items-center gap-3 p-2 rounded-xl ${
                    isMe
                      ? 'bg-indigo-500/5 border border-indigo-500/20'
                      : 'border border-transparent'
                  }`}
                >
                  <div className="w-7 h-7 rounded-lg bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center text-[10px] font-mono text-zinc-500 flex-shrink-0">
                    {String(idx + 1).padStart(2, '0')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-zinc-700 dark:text-zinc-200 truncate">
                      {qa.display_name} {isMe && <span className="text-indigo-500 font-black">• YOU</span>}
                    </p>
                    <div className="h-1.5 w-full bg-zinc-100 dark:bg-zinc-900 rounded-full mt-1.5 overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.5, ease: 'easeOut' }}
                        className="h-full bg-indigo-600 dark:bg-indigo-500 rounded-full"
                      />
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-black text-zinc-900 dark:text-white tabular-nums">
                      {qa.call_count.toLocaleString()}
                    </p>
                    <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-600">calls</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
