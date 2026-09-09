import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, ShieldCheck, CheckCircle2, XCircle, Phone, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

type FoundCall = {
  id: number;
  date: string;
  brand: string;
  call_type: string;
  status: string;
  customer_phone: string;
  agent_name: string | null;
};

type Result = { found: boolean; count: number; calls: FoundCall[] } | null;

/**
 * The compliance role's only screen. Answers exactly one question — has a
 * call been registered for this customer number? — and shows nothing else:
 * no scores, no QA identity, no evaluation content.
 */
export default function ComplianceSearch() {
  const { user } = useAuth();
  const [phone, setPhone] = useState('');
  const [result, setResult] = useState<Result>(null);
  const [searchedFor, setSearchedFor] = useState('');
  const [error, setError] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  const digits = phone.replace(/\D/g, '');
  const canSearch = digits.length >= 7 && !isSearching;

  const handleSearch = async () => {
    if (!canSearch) return;
    setIsSearching(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch(
        `/api/compliance/phone-lookup?user_id=${user?.id}&phone=${encodeURIComponent(phone)}`
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Lookup failed.');
      } else {
        setResult(data);
        setSearchedFor(phone.trim());
      }
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* Header */}
      <div className="text-center pt-4 sm:pt-10">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-600/10 text-indigo-600 dark:text-indigo-400 mb-4">
          <ShieldCheck size={26} />
        </div>
        <h2 className="text-2xl sm:text-3xl font-light text-zinc-900 dark:text-white tracking-tight mb-2">
          Customer Number Lookup
        </h2>
        <p className="text-zinc-500 text-sm max-w-md mx-auto">
          Enter a customer number to check whether a call has been registered for it.
        </p>
      </div>

      {/* Search box */}
      <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-2 shadow-lg">
        <div className="flex flex-col sm:flex-row items-stretch gap-2">
          <div className="flex items-center gap-3 flex-1 px-5 py-4">
            <Phone size={18} className="text-zinc-400 dark:text-zinc-600 shrink-0" />
            <input
              type="tel"
              inputMode="tel"
              autoFocus
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
              placeholder="e.g. 55123456"
              className="w-full bg-transparent text-lg font-bold tracking-wider text-zinc-900 dark:text-white placeholder:text-zinc-300 dark:placeholder:text-zinc-700 placeholder:font-normal placeholder:tracking-normal outline-none"
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={!canSearch}
            className="flex items-center justify-center gap-2 px-8 py-4 rounded-2xl bg-indigo-600 text-white text-xs font-black uppercase tracking-widest transition-all hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-indigo-500/20"
          >
            {isSearching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            {isSearching ? 'Searching' : 'Search'}
          </button>
        </div>
      </div>

      {/* Hint while the number is too short to search — mirrors the server's
          7-digit minimum so the button never fails silently. */}
      {digits.length > 0 && digits.length < 7 && (
        <p className="text-center text-[11px] text-zinc-400 dark:text-zinc-600 font-bold uppercase tracking-widest">
          Enter at least 7 digits
        </p>
      )}

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 rounded-2xl px-5 py-4 text-sm font-bold text-center">
          {error}
        </div>
      )}

      {/* Result */}
      <AnimatePresence mode="wait">
        {result && (
          <motion.div
            key={searchedFor + String(result.found)}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="space-y-4"
          >
            {result.found ? (
              <>
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-3xl p-6 sm:p-8 text-center">
                  <CheckCircle2 size={36} className="mx-auto text-emerald-600 dark:text-emerald-500 mb-3" />
                  <p className="text-lg font-black text-emerald-700 dark:text-emerald-400 uppercase tracking-widest mb-1">
                    Call Registered
                  </p>
                  <p className="text-sm text-emerald-700/70 dark:text-emerald-500/70 font-bold">
                    {result.count} call{result.count === 1 ? '' : 's'} found for {searchedFor}
                  </p>
                </div>

                <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-3xl overflow-hidden shadow-sm">
                  {result.calls.map((call, i) => (
                    <div
                      key={call.id}
                      className={`flex flex-wrap items-center justify-between gap-3 px-5 sm:px-6 py-4 ${
                        i > 0 ? 'border-t border-zinc-100 dark:border-zinc-900' : ''
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-black text-zinc-900 dark:text-white">
                          Call #{call.id}
                          <span className="ml-2 text-[10px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-600">
                            {call.date}
                          </span>
                        </p>
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 font-bold mt-0.5 truncate">
                          {call.brand} · {call.call_type}
                          {call.agent_name && <> · Agent: {call.agent_name}</>}
                        </p>
                      </div>
                      <span className="px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-900 text-[9px] font-black uppercase tracking-widest text-zinc-500 dark:text-zinc-400 shrink-0">
                        {call.status}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="bg-rose-500/5 border border-rose-500/20 rounded-3xl p-6 sm:p-8 text-center">
                <XCircle size={36} className="mx-auto text-rose-500 mb-3" />
                <p className="text-lg font-black text-rose-600 dark:text-rose-400 uppercase tracking-widest mb-1">
                  No Call Found
                </p>
                <p className="text-sm text-rose-600/60 dark:text-rose-400/60 font-bold">
                  No call has been registered for {searchedFor}
                </p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
