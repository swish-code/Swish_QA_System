import React from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { X, Check, Clock, MessageSquare, User, Calendar, ShieldCheck, XCircle } from 'lucide-react';
import type { CoachingSnapshot } from '../types';

function fmt(ts: string | null): string {
  if (!ts) return '—';
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return ts;
    return d.toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  } catch { return ts; }
}

const STAGE_ORDER = [
  { key: 'created_at', label: 'Requested by TL', icon: MessageSquare },
  { key: 'agent_approved_at', label: 'Agent approved', icon: ShieldCheck },
  { key: 'session_started_at', label: 'Session started', icon: Clock },
  { key: 'completed_at', label: 'Session completed', icon: Check },
] as const;

type Props = {
  coaching: CoachingSnapshot;
  evaluationId: number;
  onClose: () => void;
};

export default function CoachingDetailsDialog({ coaching, evaluationId, onClose }: Props) {
  const isCompleted = coaching.status === 'Completed';

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 sm:p-6">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/70 backdrop-blur-md"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ duration: 0.25 }}
        className="relative bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-[2rem] w-full max-w-lg shadow-2xl overflow-hidden"
      >
        {/* Accent strip */}
        <div className={`h-1 w-full ${isCompleted ? 'bg-emerald-500' : 'bg-amber-500'}`} />

        {/* Header */}
        <div className="p-6 border-b border-zinc-100 dark:border-zinc-900 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className={`p-2.5 rounded-2xl ${isCompleted ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'} border ${isCompleted ? 'border-emerald-500/30' : 'border-amber-500/30'}`}>
              <MessageSquare size={18} />
            </div>
            <div>
              <h3 className="text-lg font-black text-zinc-900 dark:text-white uppercase tracking-tighter leading-tight">Coaching Session</h3>
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-600 mt-1">
                Evaluation #{evaluationId} • Session #{coaching.id}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 hover:text-rose-500 transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {/* Status badge */}
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500 dark:text-zinc-500">Current status</span>
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border ${
              isCompleted
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30'
            }`}>
              {isCompleted ? <Check size={11} /> : <Clock size={11} />}
              {coaching.status}
            </span>
          </div>

          {/* People */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800 rounded-2xl p-4">
              <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-600">Team Leader</p>
              <p className="mt-1 text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
                <User size={13} className="text-indigo-500" />
                {coaching.tl_name || '—'}
              </p>
            </div>
            <div className="bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800 rounded-2xl p-4">
              <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-600">Agent</p>
              <p className="mt-1 text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
                <User size={13} className="text-emerald-500" />
                {coaching.agent_name || '—'}
              </p>
            </div>
          </div>

          {/* Issues from the original call (failed items + QA note) */}
          {coaching.error_description && (
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-rose-500 dark:text-rose-400 mb-2 flex items-center gap-1.5">
                <XCircle size={11} /> Issues from this call
              </p>
              <pre className="text-xs text-zinc-700 dark:text-zinc-300 bg-rose-500/5 border border-rose-500/20 rounded-2xl p-4 whitespace-pre-wrap font-sans">
                {coaching.error_description}
              </pre>
            </div>
          )}

          {/* TL comment / coaching notes */}
          {coaching.tl_comment && (
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-600 mb-2">TL Notes</p>
              <p className="text-sm text-zinc-700 dark:text-zinc-300 bg-zinc-50 dark:bg-zinc-900/30 border border-zinc-100 dark:border-zinc-800 rounded-2xl p-4 whitespace-pre-wrap">
                {coaching.tl_comment}
              </p>
            </div>
          )}

          {/* Timeline */}
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-600 mb-3">Timeline</p>
            <div className="space-y-2">
              {STAGE_ORDER.map(stage => {
                const ts = coaching[stage.key];
                const reached = !!ts;
                const Icon = stage.icon;
                return (
                  <div key={stage.key} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border ${reached ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-zinc-50 dark:bg-zinc-900/30 border-zinc-100 dark:border-zinc-800'}`}>
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${reached ? 'bg-emerald-500 text-white' : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-600'}`}>
                      <Icon size={12} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-bold ${reached ? 'text-zinc-900 dark:text-white' : 'text-zinc-400 dark:text-zinc-600'}`}>{stage.label}</p>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-600 mt-0.5 flex items-center gap-1">
                        <Calendar size={10} />
                        {fmt(ts)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-6">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-3 rounded-xl bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-black text-[10px] uppercase tracking-widest transition-colors"
          >
            Close
          </button>
        </div>
      </motion.div>
    </div>,
    document.body
  );
}
