import React, { useState, useRef, useEffect } from 'react';
import { Check, ChevronDown, X, Search } from 'lucide-react';

type Option = { value: string; label: string };

type Props = {
  label?: string;
  options: Option[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Small variant sized to sit inline with compact filter-bar inputs. */
  compact?: boolean;
};

/**
 * Lightweight multi-select with chips and an inline dropdown.
 * Click outside or on a chip's X to deselect; "Select all" toggles every option.
 */
export default function MultiSelectField({ label, options, value, onChange, placeholder = 'Select…', disabled = false, compact = false }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Fresh search + keyboard focus every time the dropdown opens.
  useEffect(() => {
    if (open) {
      setQuery('');
      setTimeout(() => searchRef.current?.focus(), 0);
    }
  }, [open]);

  const toggle = (v: string) => {
    if (value.includes(v)) onChange(value.filter(x => x !== v));
    else onChange([...value, v]);
  };

  // Type-to-filter the option list so long rosters don't need scrolling.
  const q = query.trim().toLowerCase();
  const visibleOptions = q ? options.filter(o => o.label.toLowerCase().includes(q)) : options;

  // "Select all" operates on the visible (filtered) set: with a query it
  // adds/removes just the matches, without one it toggles everything.
  const allSelected = visibleOptions.length > 0 && visibleOptions.every(o => value.includes(o.value));
  const toggleAll = () => {
    const visible = visibleOptions.map(o => o.value);
    if (allSelected) onChange(value.filter(v => !visible.includes(v)));
    else onChange(Array.from(new Set([...value, ...visible])));
  };

  const valueLabels = value
    .map(v => options.find(o => o.value === v)?.label || v);

  return (
    <div ref={rootRef} className="space-y-2 relative">
      {label && (
        <label className="text-[10px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-[0.3em] ml-1 flex items-center gap-2 italic">
          {label}
        </label>
      )}

      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(v => !v)}
        className={`w-full text-left outline-none focus:border-indigo-600 flex flex-wrap items-center transition-colors ${
          compact
            ? 'min-h-[34px] bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-1.5 gap-1'
            : 'min-h-[60px] bg-slate-50 dark:bg-zinc-900/50 border border-slate-200 dark:border-zinc-800 rounded-2xl px-4 py-3 gap-2 shadow-inner'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-indigo-500/50'} ${open ? 'border-indigo-600' : ''}`}
      >
        {valueLabels.length === 0 ? (
          <span className={`text-zinc-400 dark:text-zinc-600 font-bold ${compact ? 'text-xs' : 'text-xs italic'}`}>{placeholder}</span>
        ) : compact && valueLabels.length > 1 ? (
          // Compact: one summary chip instead of a wrapping chip cloud so the
          // control keeps the same height as the neighbouring inputs.
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-indigo-500/10 border border-indigo-500/30 text-indigo-700 dark:text-indigo-300 text-[10px] font-black uppercase tracking-widest">
            {valueLabels.length} agents
            <span
              role="button"
              tabIndex={-1}
              onClick={(e) => { e.stopPropagation(); onChange([]); }}
              className="hover:text-rose-500 transition-colors"
              aria-label="Clear selection"
            >
              <X size={11} />
            </span>
          </span>
        ) : (
          valueLabels.map((lab, idx) => (
            <span
              key={idx}
              className={`inline-flex items-center gap-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-700 dark:text-indigo-300 font-black uppercase tracking-widest ${
                compact ? 'px-2 py-0.5 text-[9px] max-w-full' : 'px-2.5 py-1 text-[10px]'
              }`}
            >
              <span className="truncate">{lab}</span>
              <span
                role="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.stopPropagation();
                  toggle(value[idx]);
                }}
                className="hover:text-rose-500 transition-colors"
                aria-label={`Remove ${lab}`}
              >
                <X size={11} />
              </span>
            </span>
          ))
        )}
        <span className="ml-auto flex-shrink-0">
          <ChevronDown size={compact ? 12 : 16} className={`text-zinc-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {open && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl shadow-zinc-900/10 dark:shadow-black/40 max-h-72 overflow-y-auto">
          {options.length === 0 ? (
            <div className="p-4 text-center text-[10px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-600">
              No options
            </div>
          ) : (
            <>
              {/* Type-to-search — filters the list below as you type */}
              <div className="sticky top-0 bg-white dark:bg-zinc-950 border-b border-zinc-100 dark:border-zinc-800 p-2">
                <div className="relative">
                  <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-600" />
                  <input
                    ref={searchRef}
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => e.stopPropagation()}
                    placeholder="Search…"
                    className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg pl-7 pr-7 py-1.5 text-xs text-zinc-800 dark:text-zinc-100 outline-none focus:border-indigo-500 placeholder:text-zinc-400"
                  />
                  {query && (
                    <button
                      type="button"
                      onClick={() => { setQuery(''); searchRef.current?.focus(); }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-rose-500 transition-colors"
                      aria-label="Clear search"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={toggleAll}
                className="w-full text-left px-4 py-2.5 border-b border-zinc-100 dark:border-zinc-800 text-[10px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors flex items-center justify-between"
              >
                <span>{allSelected ? (q ? 'Deselect matches' : 'Deselect all') : (q ? 'Select matches' : 'Select all')}</span>
                <span className="text-zinc-400">{value.length} / {options.length}</span>
              </button>
              {visibleOptions.length === 0 ? (
                <div className="p-4 text-center text-[10px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-600">
                  No matches
                </div>
              ) : visibleOptions.map(opt => {
                const selected = value.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggle(opt.value)}
                    className={`w-full text-left px-4 py-2.5 text-xs font-bold flex items-center justify-between hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors ${selected ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-700 dark:text-zinc-300'}`}
                  >
                    <span>{opt.label}</span>
                    {selected && <Check size={14} className="text-indigo-600 dark:text-indigo-400 flex-shrink-0" />}
                  </button>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}
