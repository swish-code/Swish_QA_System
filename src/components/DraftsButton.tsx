import React from 'react';
import { Bookmark } from 'lucide-react';
import { useDrafts } from '../context/DraftsContext';
import { useAuth } from '../context/AuthContext';

export default function DraftsButton() {
  const { user } = useAuth();
  const { count, openPanel } = useDrafts();

  // Agents don't create evaluations and therefore have no drafts.
  if (!user || user.role === 'agent') return null;

  return (
    <button
      type="button"
      onClick={openPanel}
      className="relative p-2 sm:p-2.5 rounded-xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:border-indigo-500/40 transition-colors"
      title={count > 0 ? `${count} saved draft${count === 1 ? '' : 's'}` : 'No saved drafts'}
      aria-label={`Saved drafts (${count})`}
    >
      <Bookmark size={18} />
      {count > 0 && (
        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-indigo-600 text-white text-[10px] font-black flex items-center justify-center leading-none shadow-md">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>
  );
}
