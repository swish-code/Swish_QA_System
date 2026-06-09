import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { Bookmark, X, Trash2, RotateCcw, AlertTriangle, FileText, User } from 'lucide-react';
import { useDrafts, type Draft } from '../context/DraftsContext';
import { useAuth } from '../context/AuthContext';

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

/** Single draft card. Typed as React.FC so JSX `key` is accepted. */
type DraftRowProps = {
  draft: Draft;
  onRestore: (d: Draft) => void;
  onDelete: (d: Draft) => Promise<void>;
};

const DraftRow: React.FC<DraftRowProps> = ({ draft, onRestore, onDelete }) => {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleDelete = async () => {
    if (busy) return;
    setBusy(true);
    try { await onDelete(draft); }
    finally { setBusy(false); setConfirmDelete(false); }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow"
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-zinc-900 dark:text-white truncate uppercase tracking-tight">
            {draft.title || 'Untitled draft'}
          </p>
          <div className="flex items-center gap-3 mt-1.5 text-[10px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-600">
            {draft.call_type && <span>{draft.call_type}</span>}
            <span>•</span>
            <span>{formatDate(draft.updated_at)}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          disabled={busy}
          title="Delete draft"
          className="p-2 rounded-lg text-zinc-400 dark:text-zinc-600 hover:bg-rose-500/10 hover:text-rose-500 transition-colors disabled:opacity-40"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {draft.agent_name && (
        <div className="flex items-center gap-2 mb-3 text-[11px] font-bold text-zinc-600 dark:text-zinc-400">
          <User size={12} />
          <span>{draft.agent_name}</span>
        </div>
      )}

      {draft.owner_name && (
        <div className="flex items-center gap-2 mb-3 text-[10px] font-bold uppercase tracking-widest text-indigo-500 dark:text-indigo-400">
          <FileText size={11} />
          <span>{draft.owner_name}</span>
        </div>
      )}

      {confirmDelete ? (
        <div className="flex items-center gap-2 mt-3">
          <button
            type="button"
            onClick={handleDelete}
            disabled={busy}
            className="flex-1 px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-black uppercase tracking-widest transition-colors disabled:opacity-50"
          >
            {busy ? 'Deleting…' : 'Confirm delete'}
          </button>
          <button
            type="button"
            onClick={() => setConfirmDelete(false)}
            disabled={busy}
            className="px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-[10px] font-black uppercase tracking-widest transition-colors"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => onRestore(draft)}
          className="w-full mt-2 px-3 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-black uppercase tracking-widest transition-colors flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20"
        >
          <RotateCcw size={12} />
          Restore Draft
        </button>
      )}
    </motion.div>
  );
};

export default function DraftsPanel() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { drafts, isPanelOpen, isLoading, closePanel, deleteDraft, clearAll } = useDrafts();
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleRestore = (d: Draft) => {
    closePanel();
    navigate(`/evaluate?draft=${d.id}`);
  };

  const handleDelete = async (d: Draft) => { await deleteDraft(d.id); };

  const handleClearAll = async () => {
    setBusy(true);
    try { await clearAll(); }
    finally { setBusy(false); setConfirmClearAll(false); }
  };

  if (!user || user.role === 'agent') return null;

  const panel = (
    <AnimatePresence>
      {isPanelOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="drafts-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/40 dark:bg-black/60 z-[80]"
            onClick={closePanel}
            aria-hidden
          />
          {/* Panel */}
          <motion.aside
            key="drafts-panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 280 }}
            className="fixed top-0 right-0 h-full w-full sm:w-[420px] bg-white dark:bg-zinc-950 border-l border-zinc-200 dark:border-zinc-900 shadow-2xl z-[90] flex flex-col"
            role="dialog"
            aria-label="Stored drafts"
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-3 p-5 border-b border-zinc-100 dark:border-zinc-900">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400">
                  <Bookmark size={18} />
                </div>
                <div>
                  <h2 className="text-base font-black text-zinc-900 dark:text-white tracking-tight">Stored Drafts</h2>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-600 mt-0.5">
                    Manage and restore your saved evaluations
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closePanel}
                className="p-2 rounded-lg text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
                aria-label="Close panel"
              >
                <X size={18} />
              </button>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-5">
              {isLoading ? (
                <div className="space-y-3">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="h-28 bg-zinc-100 dark:bg-zinc-900/50 rounded-2xl animate-pulse" />
                  ))}
                </div>
              ) : drafts.length === 0 ? (
                <div className="flex flex-col items-center justify-center text-center py-16 px-6">
                  <div className="p-4 rounded-3xl bg-zinc-50 dark:bg-zinc-900/50 mb-4">
                    <Bookmark className="text-zinc-300 dark:text-zinc-700" size={40} />
                  </div>
                  <p className="text-sm font-bold text-zinc-700 dark:text-zinc-300">No drafts yet</p>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-500 mt-2 max-w-xs">
                    When you save an evaluation as a draft, it'll show up here so you can finish it later.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <AnimatePresence mode="popLayout">
                    {drafts.map(d => (
                      <DraftRow key={d.id} draft={d} onRestore={handleRestore} onDelete={handleDelete} />
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>

            {/* Footer */}
            {drafts.length > 0 && (
              <div className="p-5 border-t border-zinc-100 dark:border-zinc-900 bg-zinc-50/50 dark:bg-zinc-900/30">
                {confirmClearAll ? (
                  <div className="space-y-3">
                    <div className="flex items-start gap-2 text-[11px] text-rose-600 dark:text-rose-400 font-bold">
                      <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                      <span>This will permanently delete {drafts.length} draft{drafts.length === 1 ? '' : 's'}. This action cannot be undone.</span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleClearAll}
                        disabled={busy}
                        className="flex-1 px-4 py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-[10px] uppercase tracking-widest transition-colors disabled:opacity-50"
                      >
                        {busy ? 'Clearing…' : `Yes, delete all ${drafts.length}`}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmClearAll(false)}
                        disabled={busy}
                        className="px-4 py-3 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-black text-[10px] uppercase tracking-widest transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmClearAll(true)}
                    className="w-full px-4 py-3 rounded-xl bg-white dark:bg-zinc-950 hover:bg-rose-50 dark:hover:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40 text-rose-600 dark:text-rose-400 font-black text-[10px] uppercase tracking-widest transition-colors flex items-center justify-center gap-2"
                  >
                    <Trash2 size={12} />
                    Clear All Drafts
                  </button>
                )}
              </div>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );

  return createPortal(panel, document.body);
}
