import React, { useEffect, useState } from 'react';
import { Headphones, Loader2, AlertCircle, CheckCircle2, PhoneOff } from 'lucide-react';

type XonCall = {
  xontel_id: number;
  time: string;
  duration: string;
  call_type: string;
  queue: string;
  agent: string;
  customer_number: string;
  media_path: string | null;
  agent_match?: boolean;
  queue_match?: boolean;
};

/**
 * Plays the XonTel recording for an evaluated call.
 *
 * The match is made server-side on customer phone + call date, so no account
 * mapping is involved. When more than one call shares that phone and date the
 * whole set is offered, best match first, rather than guessing for the user.
 */
export default function CallRecording({ evaluationId }: { evaluationId: number | string }) {
  const [state, setState] = useState<'loading' | 'ready' | 'none' | 'off' | 'error'>('loading');
  const [calls, setCalls] = useState<XonCall[]>([]);
  const [selected, setSelected] = useState(0);
  const [reason, setReason] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/xontel/recording/${evaluationId}`);
        if (res.status === 503) { if (alive) setState('off'); return; }
        if (!res.ok) { if (alive) setState('error'); return; }
        const data = await res.json();
        if (!alive) return;
        const withAudio = (data.calls || []).filter((c: XonCall) => c.media_path);
        if (withAudio.length === 0) {
          setReason(data.reason === 'no_phone' ? 'no_phone' : 'not_found');
          setState('none');
        } else {
          setCalls(withAudio);
          setSelected(0);
          setState('ready');
        }
      } catch {
        if (alive) setState('error');
      }
    })();
    return () => { alive = false; };
  }, [evaluationId]);

  // Nothing to show when the integration isn't switched on — the section
  // shouldn't advertise a feature this deployment doesn't have.
  if (state === 'off') return null;

  return (
    <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-5 sm:p-6 shadow-sm">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-8 h-8 rounded-xl bg-indigo-600/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
          <Headphones size={16} />
        </div>
        <div>
          <h3 className="text-sm font-black uppercase tracking-widest text-zinc-800 dark:text-zinc-100">Call Recording</h3>
          <p className="text-[10px] text-zinc-400 dark:text-zinc-600 font-bold">From XonTel</p>
        </div>
      </div>

      {state === 'loading' && (
        <div className="flex items-center gap-2 text-zinc-400 text-xs font-bold py-3">
          <Loader2 size={14} className="animate-spin" /> Looking up the recording…
        </div>
      )}

      {state === 'error' && (
        <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 text-xs font-bold py-3">
          <AlertCircle size={14} /> Could not reach XonTel right now.
        </div>
      )}

      {state === 'none' && (
        <div className="flex items-center gap-2 text-zinc-400 dark:text-zinc-600 text-xs font-bold py-3">
          <PhoneOff size={14} />
          {reason === 'no_phone'
            ? 'This call has no customer number recorded, so it cannot be matched.'
            : 'No recording found for this customer number on this date.'}
        </div>
      )}

      {state === 'ready' && (
        <div className="space-y-3">
          <audio
            key={calls[selected]?.xontel_id}
            controls
            preload="none"
            className="w-full"
            src={`/api/xontel/stream?path=${encodeURIComponent(calls[selected].media_path || '')}`}
          />

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-bold text-zinc-500 dark:text-zinc-400">
            <span>{calls[selected].time}</span>
            <span className="text-zinc-300 dark:text-zinc-700">·</span>
            <span>{calls[selected].duration}</span>
            <span className="text-zinc-300 dark:text-zinc-700">·</span>
            <span>{calls[selected].queue}</span>
            {calls[selected].agent_match && (
              <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-500">
                <CheckCircle2 size={10} /> Agent matches
              </span>
            )}
          </div>

          {/* Several calls to the same number on the same day — let the QA
              pick rather than silently assuming the top one is right. Any
              call whose agent matches the one being evaluated is highlighted
              in red, so a TL scanning the list can spot it (or all of them,
              if that agent handled the customer more than once) without
              having to open each recording to check. */}
          {calls.length > 1 && (
            <div className="pt-1">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-600">
                  {calls.length} recordings for this number today
                </p>
                {calls.some(c => c.agent_match) && (
                  <p className="text-[9px] font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" /> This agent's call
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {calls.map((c, i) => (
                  <button
                    key={c.xontel_id}
                    onClick={() => setSelected(i)}
                    className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all border ${
                      c.agent_match
                        ? i === selected
                          ? 'bg-rose-600 text-white border-rose-600 ring-2 ring-rose-300 dark:ring-rose-900/60'
                          : 'bg-rose-500/10 border-rose-500 text-rose-600 dark:text-rose-400 hover:bg-rose-500/20'
                        : i === selected
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 hover:border-indigo-400'
                    }`}
                    title={`${c.queue} · ${c.agent || 'no agent'}${c.agent_match ? ' — matches the evaluated agent' : ''}`}
                  >
                    {String(c.time).split(' ')[1] || c.time} · {c.duration}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
