import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { MessageSquare, X, Phone, Tag, AlertCircle, Send, CheckCircle2 } from 'lucide-react';
import { Evaluation } from '../types';

interface Props {
  evaluation: Evaluation;
  tlId: number;
  onClose: () => void;
  onSubmitted: () => void;
}

/**
 * Modal for a TL to raise a Coaching Request against a specific call.
 *
 * Auto-fills three fields from the evaluation (customer phone, call type,
 * error description). The TL only has to write *why* they want the
 * coaching session. The Agent must approve before the request appears on
 * the TL's Coaching page.
 */
export default function CoachingRequestDialog({ evaluation, tlId, onClose, onSubmitted }: Props) {
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Pull pre-filled values out of the evaluation row.
  const data: any = (evaluation as any).data || {};
  const customerPhone = data.customer_phone || data.phone || '—';
  const callType = evaluation.call_type || '—';
  const errorDescription =
    data?.feedback?.error_description
    || data?.feedback?.general
    || (Array.isArray(data?.common_issues) ? data.common_issues.join(', ') : '')
    || '—';

  const handleSubmit = async () => {
    if (!comment.trim()) {
      setError('Please write the reason for coaching.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/coaching-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          evaluation_id: evaluation.id,
          tl_id: tlId,
          tl_comment: comment.trim()
        })
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      setSuccess(true);
      setTimeout(() => onSubmitted(), 900);
    } catch (e: any) {
      setError(e.message || 'Failed to send coaching request');
    } finally {
      setSubmitting(false);
    }
  };

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-black/70 backdrop-blur-md overflow-y-auto"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-2xl overflow-hidden my-auto"
      >
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/30 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="shrink-0 w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-500">
              <MessageSquare size={18} />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-black text-zinc-900 dark:text-white uppercase tracking-tight">
                Request Coaching
              </h3>
              <p className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest mt-0.5">
                For {evaluation.agent_name || `Agent #${evaluation.agent_id}`} · Call #{evaluation.id}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-zinc-500"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Auto-filled call snapshot */}
        <div className="p-5 sm:p-6 space-y-4">
          <div>
            <p className="text-[9px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mb-2">
              Auto-filled from the call
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
                <div className="flex items-center gap-1.5 text-[9px] font-black text-zinc-500 dark:text-zinc-500 uppercase tracking-widest mb-1.5">
                  <Phone size={10} /> Customer phone
                </div>
                <p className="text-xs font-bold text-zinc-900 dark:text-white truncate">{customerPhone}</p>
              </div>
              <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
                <div className="flex items-center gap-1.5 text-[9px] font-black text-zinc-500 dark:text-zinc-500 uppercase tracking-widest mb-1.5">
                  <Tag size={10} /> Call type
                </div>
                <p className="text-xs font-bold text-zinc-900 dark:text-white truncate">{callType}</p>
              </div>
              <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
                <div className="flex items-center gap-1.5 text-[9px] font-black text-zinc-500 dark:text-zinc-500 uppercase tracking-widest mb-1.5">
                  <AlertCircle size={10} /> Error / issue
                </div>
                <p className="text-xs font-bold text-zinc-900 dark:text-white line-clamp-2">{errorDescription}</p>
              </div>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-widest block mb-2">
              Why does this agent need coaching? <span className="text-rose-500">*</span>
            </label>
            <textarea
              className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 text-sm text-zinc-900 dark:text-white outline-none focus:border-emerald-500 resize-none placeholder:text-zinc-400 dark:placeholder:text-zinc-700"
              rows={5}
              placeholder="Explain the gap you observed and what you'd like to address in the coaching session..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              disabled={submitting || success}
            />
            <p className="text-[10px] text-zinc-400 dark:text-zinc-600 mt-1.5 ml-1">
              The agent will see this comment before they accept the request.
            </p>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-medium flex items-start gap-2">
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-medium flex items-start gap-2">
              <CheckCircle2 size={14} className="shrink-0 mt-0.5" />
              <span>Coaching request sent. Waiting for the agent to approve.</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 sm:p-6 pt-0 flex flex-col sm:flex-row gap-3 sm:justify-end">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-5 py-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 font-black text-[10px] uppercase tracking-widest hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || success || !comment.trim()}
            className="px-6 py-2.5 rounded-xl bg-emerald-600 text-white font-black text-[10px] uppercase tracking-widest shadow-lg shadow-emerald-500/20 hover:bg-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Sending...
              </>
            ) : success ? (
              <>
                <CheckCircle2 size={14} /> Sent
              </>
            ) : (
              <>
                <Send size={14} /> Send Request
              </>
            )}
          </button>
        </div>
      </motion.div>
    </motion.div>,
    document.body
  );
}
