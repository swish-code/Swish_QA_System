import React, { useState, useRef, useEffect } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';

type Option = { value: string; label: string };

type Props = {
  label?: string;
  options: Option[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
};

/**
 * Lightweight multi-select with chips and an inline dropdown.
 * Click outside or on a chip's X to deselect; "Select all" toggles every option.
 */
export default function MultiSelectField({ label, options, value, onChange, placeholder = 'Select…', disabled = false }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

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

  const toggle = (v: string) => {
    if (value.includes(v)) onChange(value.filter(x => x !== v));
    else onChange([...value, v]);
  };

  const allSelected = options.length > 0 && options.every(o => value.includes(o.value));
  const toggleAll = () => {
    if (allSelected) onChange([]);
    else onChange(options.map(o => o.value));
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
        className={`w-full min-h-[60px] bg-slate-50 dark:bg-zinc-900/50 border border-slate-200 dark:border-zinc-800 rounded-2xl px-4 py-3 text-left outline-none focus:border-indigo-600 shadow-inner flex flex-wrap gap-2 items-center transition-colors ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-indigo-500/50'} ${open ? 'border-indigo-600' : ''}`}
      >
        {valueLabels.length === 0 ? (
          <span className="text-zinc-400 dark:text-zinc-600 text-xs font-bold italic">{placeholder}</span>
        ) : (
          valueLabels.map((lab, idx) => (
            <span
              key={idx}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-700 dark:text-indigo-300 text-[10px] font-black uppercase tracking-widest"
            >
              {lab}
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
          <ChevronDown size={16} className={`text-zinc-400 transition-transform ${open ? 'rotate-180' : ''}`} />
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
              <button
                type="button"
                onClick={toggleAll}
                className="w-full text-left px-4 py-2.5 border-b border-zinc-100 dark:border-zinc-800 text-[10px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors flex items-center justify-between"
              >
                <span>{allSelected ? 'Deselect all' : 'Select all'}</span>
                <span className="text-zinc-400">{value.length} / {options.length}</span>
              </button>
              {options.map(opt => {
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
