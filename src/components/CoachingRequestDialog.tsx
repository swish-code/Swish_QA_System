import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { MessageSquare, X, Phone, Tag, AlertCircle, Send, CheckCircle2, ShieldAlert, XCircle } from 'lucide-react';
import { Evaluation } from '../types';

interface Props {
  evaluation: Evaluation;
  tlId: number;
  onClose: () => void;
  onSubmitted: () => void;
}

/** A failed item from the evaluation, resolved against the form settings. */
type FailedItem = {
  id: string;
  label: string;
  weight: number;
  critical: boolean;
};

/**
 * Modal for a TL to raise a Coaching Request against a specific call.
 *
 * Auto-fills three fields from the evaluation (customer phone, call type,
 * error description) and now ALSO surfaces every failed evaluation item
 * (where the QA marked the answer as "No"). The TL writes *why* they want
 * the coaching session; the Agent must approve before the request appears
 * on the TL's Coaching page.
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

  // ------------------------------------------------------------------
  // Fetch form settings so we can map response IDs back to labels.
  // ------------------------------------------------------------------
  const [questionMap, setQuestionMap] = useState<Record<string, { label: string; critical: boolean; weight: number }>>({});
  const [loadingQuestions, setLoadingQuestions] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoadingQuestions(true);
    fetch('/api/settings/form')
      .then(res => res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`)))
      .then((settings: any[]) => {
        if (cancelled) return;
        const map: Record<string, { label: string; critical: boolean; weight: number }> = {};
        for (const s of settings) {
          if (s.field_type !== 'eval_question') continue;
          let cfg: any = {};
          try { cfg = typeof s.value === 'string' ? JSON.parse(s.value) : (s.value || {}); } catch {}
          map[String(s.id)] = {
            label: s.label_en || `Question #${s.id}`,
            critical: !!cfg.critical,
            weight: Number(cfg.weight) || 0,
          };
        }
        setQuestionMap(map);
      })
      .catch(err => {
        console.error('Failed to fetch form settings for coaching dialog', err);
      })
      .finally(() => {
        if (!cancelled) setLoadingQuestions(false);
      });
    return () => { cancelled = true; };
  }, []);

  // ------------------------------------------------------------------
  // Compute the list of failed items from the evaluation's responses.
  // Each entry where response === 'No' counts as an error/issue.
  // ------------------------------------------------------------------
  const failedItems = useMemo<FailedItem[]>(() => {
    const responses = data?.responses || {};
    const out: FailedItem[] = [];
    for (const [qid, resp] of Object.entries(responses)) {
      if (resp !== 'No') continue;
      const meta = questionMap[String(qid)];
      out.push({
        id: String(qid),
        label: meta?.label || `Question #${qid}`,
        weight: meta?.weight || 0,
        critical: meta?.critical || false,
      });
    }
    // Sort: critical first, then by weight (heaviest deduction first)
    return out.sort((a, b) => {
      if (a.critical !== b.critical) return a.critical ? -1 : 1;
      return b.weight - a.weight;
    });
  }, [data, questionMap]);

  const commonIssues: string[] = Array.isArray(data?.common_issues) ? data.common_issues : [];
  const generalNote: string | undefined = data?.feedback?.error_description || data?.feedback?.general;
  // QA's manual "Mark as Critical" reasons (if any).
  const criticalReasons: string[] = (data?.force_zero_score && Array.isArray(data?.critical_failure_reasons))
    ? data.critical_failure_reasons : [];

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
        className="w-full max-w-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-2xl overflow-hidden my-auto max-h-[90vh] flex flex-col"
      >
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/30 flex items-center justify-between flex-shrink-0">
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

        {/* Body — scrollable so failed-items lists never push buttons off-screen */}
        <div className="p-5 sm:p-6 space-y-5 overflow-y-auto">
          <div>
            <p className="text-[9px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mb-2">
              Auto-filled from the call
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
            </div>
          </div>

          {/* ---------- Manual Critical Failure reasons (if any) ---------- */}
          {criticalReasons.length > 0 && (
            <div>
              <p className="text-[9px] font-black text-rose-600 dark:text-rose-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                <ShieldAlert size={11} /> Marked as Critical · Score forced to 0
              </p>
              <div className="rounded-2xl bg-rose-600/10 border border-rose-500/40 p-3 flex flex-wrap gap-1.5">
                {criticalReasons.map((r) => (
                  <span key={r} className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-rose-600 text-white">
                    {r}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* ---------- All failed items from the evaluation ---------- */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[9px] font-black text-rose-500 uppercase tracking-widest flex items-center gap-1.5">
                <XCircle size={11} /> Issues found in this call
              </p>
              <span className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">
                {failedItems.length} failed
              </span>
            </div>

            {loadingQuestions ? (
              <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-800 animate-pulse">
                <div className="h-3 bg-zinc-200 dark:bg-zinc-800 rounded w-3/4 mb-2" />
                <div className="h-3 bg-zinc-200 dark:bg-zinc-800 rounded w-1/2" />
              </div>
            ) : failedItems.length === 0 ? (
              <div className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 text-center">
                <p className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">
                  ✓ No failed items on this call
                </p>
              </div>
            ) : (
              <div className="rounded-2xl bg-rose-500/5 border border-rose-500/20 divide-y divide-rose-500/15 max-h-48 overflow-y-auto">
                {failedItems.map((item, idx) => (
                  <div key={item.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[9px] font-mono font-bold text-rose-400 dark:text-rose-500 w-5 flex-shrink-0">
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                      <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 truncate" title={item.label}>
                        {item.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {item.weight > 0 && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-rose-500/15 text-rose-600 dark:text-rose-400">
                          -{item.weight}%
                        </span>
                      )}
                      {item.critical && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-rose-600 text-white flex items-center gap-1">
                          <ShieldAlert size={9} /> Critical
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ---------- Common issues + QA general note ---------- */}
          {(commonIssues.length > 0 || generalNote) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {commonIssues.length > 0 && (
                <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
                  <div className="flex items-center gap-1.5 text-[9px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest mb-2">
                    <AlertCircle size={10} /> Common issues flagged
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {commonIssues.map((tag, i) => (
                      <span key={i} className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {generalNote && (
                <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
                  <div className="flex items-center gap-1.5 text-[9px] font-black text-zinc-500 dark:text-zinc-500 uppercase tracking-widest mb-2">
                    <AlertCircle size={10} /> QA general note
                  </div>
                  <p className="text-xs text-zinc-700 dark:text-zinc-300 line-clamp-3 whitespace-pre-wrap">{generalNote}</p>
                </div>
              )}
            </div>
          )}

          <div>
            <label className="text-[10px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-widest block mb-2">
              Why does this agent need coaching? <span className="text-rose-500">*</span>
            </label>
            <textarea
              className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 text-sm text-zinc-900 dark:text-white outline-none focus:border-emerald-500 resize-none placeholder:text-zinc-400 dark:placeholder:text-zinc-700"
              rows={4}
              placeholder="Explain the gap you observed and what you'd like to address in the coaching session..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              disabled={submitting || success}
            />
            <p className="text-[10px] text-zinc-400 dark:text-zinc-600 mt-1.5 ml-1">
              The agent will see this comment + the issues above before they accept the request.
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
        <div className="p-5 sm:p-6 pt-4 border-t border-zinc-100 dark:border-zinc-800 flex flex-col sm:flex-row gap-3 sm:justify-end flex-shrink-0">
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
