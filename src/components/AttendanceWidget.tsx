import React, { useEffect, useState, useCallback } from 'react';
import { LogIn, LogOut, Check, Clock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

type TodayRecord = {
  id: number;
  user_id: number;
  date: string;
  check_in_at: string | null;
  check_out_at: string | null;
};

function fmtTime(ts: string | null): string {
  if (!ts) return '—';
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return ts;
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  } catch { return ts; }
}

/**
 * Compact Check-In / Check-Out card. Visible to QAs only — that's the
 * role whose KPI target depends on attendance days. Admin (supervisor)
 * sees the read-side data via the QA KPIs page, not this widget.
 */
export default function AttendanceWidget() {
  const { user } = useAuth();
  const [record, setRecord] = useState<TodayRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const fetchToday = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch(`/api/attendance/today?user_id=${user.id}`);
      if (!res.ok) throw new Error('fetch failed');
      const json = await res.json();
      setRecord(json);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [user]);

  useEffect(() => { fetchToday(); }, [fetchToday]);

  // QAs only — hides cleanly for every other role.
  if (!user || user.role !== 'qa') return null;

  const checkIn = async () => {
    setBusy(true); setErr(null);
    try {
      const res = await fetch('/api/attendance/check-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Check-in failed');
      await fetchToday();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const checkOut = async () => {
    setBusy(true); setErr(null);
    try {
      const res = await fetch('/api/attendance/check-out', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Check-out failed');
      await fetchToday();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const hasCheckIn = !!record?.check_in_at;
  const hasCheckOut = !!record?.check_out_at;
  const stage: 'idle' | 'in' | 'done' = !hasCheckIn ? 'idle' : !hasCheckOut ? 'in' : 'done';

  const accent =
    stage === 'idle' ? 'border-zinc-200 dark:border-zinc-800' :
    stage === 'in' ? 'border-emerald-500/40' :
    'border-indigo-500/40';

  return (
    <div className={`bg-white dark:bg-zinc-950 border ${accent} rounded-2xl p-4 sm:p-5 shadow-sm flex items-center justify-between gap-4 flex-wrap`}>
      <div className="flex items-center gap-4 min-w-0">
        <div className={`p-2.5 rounded-2xl border ${
          stage === 'done' ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-600 dark:text-indigo-400' :
          stage === 'in' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400' :
          'bg-zinc-100 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-500'
        }`}>
          <Clock size={18} />
        </div>
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-600">
            Attendance · Today
          </p>
          <p className="text-sm font-bold text-zinc-900 dark:text-white mt-0.5">
            {loading ? 'Loading…' :
              stage === 'idle' ? 'You haven\'t checked in yet' :
              stage === 'in'   ? `Checked in at ${fmtTime(record!.check_in_at)} — still on shift` :
              `Shift logged: ${fmtTime(record!.check_in_at)} → ${fmtTime(record!.check_out_at)}`}
          </p>
          {err && <p className="text-[10px] font-bold text-rose-500 mt-1">{err}</p>}
        </div>
      </div>

      <div className="flex gap-2">
        {stage === 'idle' && (
          <button
            onClick={checkIn}
            disabled={busy}
            className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-emerald-500/20 disabled:opacity-50 flex items-center gap-2"
          >
            <LogIn size={12} /> {busy ? 'Working…' : 'Check In'}
          </button>
        )}
        {stage === 'in' && (
          <button
            onClick={checkOut}
            disabled={busy}
            className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-indigo-500/20 disabled:opacity-50 flex items-center gap-2"
          >
            <LogOut size={12} /> {busy ? 'Working…' : 'Check Out'}
          </button>
        )}
        {stage === 'done' && (
          <span className="px-4 py-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-600 dark:text-indigo-400 text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
            <Check size={12} /> Day Complete
          </span>
        )}
      </div>
    </div>
  );
}
