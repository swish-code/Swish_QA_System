import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { motion } from 'motion/react';
import {
  Target, Users, ShieldCheck, ChevronDown, ChevronRight, FileSpreadsheet, AlertCircle, CheckCircle2, MinusCircle, XCircle, Loader2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

type Status = 'target' | 'benchmark' | 'below' | 'na';

type OverturnedCall = {
  evaluation_id: number; qa_id: number; qa_name: string; agent_name: string;
  date: string; original_score: number; final_score: number;
};
type QARow = {
  qa_id: number; qa_name: string;
  coverage: {
    per_day: number | null; status: Status; calls_counted: number; working_days: number;
    basis: 'attendance' | 'evaluation days'; calls_total: number; calls_on_unworked_days: number;
    daily: { date: string; calls: number; worked: boolean }[];
  };
  accuracy: { pct: number | null; status: Status; evaluations: number; overturned: number; overturned_calls: OverturnedCall[] };
};
type AgentRow = { agent_id: number; agent_name: string; calls: number; on_roster: boolean };
type Scorecard = {
  month: string;
  thresholds: { coverage: { target: number; benchmark: number }; agent: { target: number; benchmark: number }; accuracy: { target: number; benchmark: number } };
  qa_rows: QARow[];
  team: {
    coverage: { qas: number; qas_at_target: number; qas_at_benchmark_or_better: number; calls_counted: number; qa_days: number; avg_per_qa_day: number | null };
    accuracy: { pct: number | null; status: Status; evaluations: number; overturned: number; overturned_calls: OverturnedCall[] };
  };
  agent_coverage: {
    avg_per_agent: number | null; status: Status; calls_evaluated: number; active_agents: number; roster_size: number;
    evaluated_agents: number; covered_pct: number | null; all_covered: boolean; not_evaluated: AgentRow[];
    off_roster_but_evaluated: number; agents: AgentRow[];
  };
  meta: { excluded_non_qa_evaluations: number; basis_note: string };
};

const STATUS_UI: Record<Status, { label: string; chip: string; text: string; Icon: any }> = {
  target:    { label: 'Target met',     chip: 'bg-emerald-500/10 border-emerald-500/30', text: 'text-emerald-600 dark:text-emerald-400', Icon: CheckCircle2 },
  benchmark: { label: 'Meets minimum',  chip: 'bg-amber-500/10 border-amber-500/30',     text: 'text-amber-600 dark:text-amber-400',     Icon: MinusCircle },
  below:     { label: 'Below minimum',  chip: 'bg-rose-500/10 border-rose-500/30',       text: 'text-rose-600 dark:text-rose-400',       Icon: XCircle },
  na:        { label: 'No data',        chip: 'bg-zinc-500/10 border-zinc-500/20',       text: 'text-zinc-500',                          Icon: MinusCircle },
};

function StatusChip({ status }: { status: Status }) {
  const u = STATUS_UI[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[9px] font-black uppercase tracking-widest ${u.chip} ${u.text}`}>
      <u.Icon size={11} /> {u.label}
    </span>
  );
}

function Section({ icon: Icon, title, subtitle, children }: { icon: any; title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}
      className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-5 sm:p-7 shadow-sm"
    >
      <div className="flex items-start gap-3 mb-5">
        <div className="w-9 h-9 rounded-xl bg-indigo-600/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0"><Icon size={18} /></div>
        <div>
          <h2 className="text-sm font-black uppercase tracking-widest text-zinc-900 dark:text-white">{title}</h2>
          <p className="text-[11px] text-zinc-500 mt-0.5 font-medium">{subtitle}</p>
        </div>
      </div>
      {children}
    </motion.section>
  );
}

const fmt = (n: number | null | undefined, dp = 1) => (n === null || n === undefined ? '—' : Number(n).toFixed(dp).replace(/\.0+$/, dp === 1 ? '' : '.00'));

export default function QAScorecard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isSupervisor = user?.role === 'supervisor';
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [data, setData] = useState<Scorecard | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [openQa, setOpenQa] = useState<number | null>(null);
  const [openAcc, setOpenAcc] = useState<number | null>(null);
  const [showAllAgents, setShowAllAgents] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true); setError('');
    fetch(`/api/kpi/qa-scorecard?month=${month}&user_id=${user?.id}`)
      .then(async r => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
        return j as Scorecard;
      })
      .then(j => { if (alive) setData(j); })
      .catch(e => { if (alive) { setError(e.message || 'Could not load the scorecard.'); setData(null); } })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [month, user?.id]);

  const th = data?.thresholds;

  const exportXlsx = () => {
    if (!data) return;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
      { KPI: 'QA Call Coverage (per QA, calls / working day)', Target: th!.coverage.target, Minimum: th!.coverage.benchmark, Result: `${data.team.coverage.qas_at_target} of ${data.team.coverage.qas} QAs at target; ${data.team.coverage.qas_at_benchmark_or_better} at minimum or better` },
      { KPI: 'Agent Coverage (calls / active agent)', Target: th!.agent.target, Minimum: th!.agent.benchmark, Result: data.agent_coverage.avg_per_agent ?? '', Status: STATUS_UI[data.agent_coverage.status].label, 'Agents evaluated': `${data.agent_coverage.evaluated_agents} of ${data.agent_coverage.active_agents}` },
      { KPI: 'QA Evaluation Accuracy (%)', Target: th!.accuracy.target, Minimum: th!.accuracy.benchmark, Result: data.team.accuracy.pct ?? '', Status: STATUS_UI[data.team.accuracy.status].label, Evaluations: data.team.accuracy.evaluations, Overturned: data.team.accuracy.overturned },
    ]), 'Summary');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.qa_rows.map(r => ({
      QA: r.qa_name, 'Calls counted': r.coverage.calls_counted, 'Working days': r.coverage.working_days, 'Calls / day': r.coverage.per_day ?? '',
      Status: STATUS_UI[r.coverage.status].label, 'Days based on': r.coverage.basis, 'Calls logged on days without a completed check-out (not counted)': r.coverage.calls_on_unworked_days,
    }))), 'Call Coverage');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.qa_rows.flatMap(r => r.coverage.daily.map(d => ({
      QA: r.qa_name, Date: d.date, Calls: d.calls, 'Counted as a working day': d.worked ? 'Yes' : 'No',
    })))), 'Daily');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.agent_coverage.agents.map(a => ({
      Agent: a.agent_name, 'Calls evaluated': a.calls, 'On QA roster': a.on_roster ? 'Yes' : 'No (evaluated this month)',
    }))), 'Agent Coverage');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.qa_rows.map(r => ({
      QA: r.qa_name, Evaluations: r.accuracy.evaluations, Overturned: r.accuracy.overturned, 'Accuracy %': r.accuracy.pct ?? '', Status: STATUS_UI[r.accuracy.status].label,
    }))), 'Accuracy');
    const overturned = [...data.qa_rows.flatMap(r => r.accuracy.overturned_calls)];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(overturned.map(o => ({
      Call: o.evaluation_id, QA: o.qa_name, Agent: o.agent_name, 'Registered on': o.date, 'Score when disputed': o.original_score, 'Score now': o.final_score,
    }))), 'Overturned calls');
    XLSX.writeFile(wb, `QA-Scorecard-${month}.xlsx`);
  };

  const agentsShown = useMemo(() => {
    const all = data?.agent_coverage.agents || [];
    return showAllAgents ? all : all.slice(0, 8);
  }, [data, showAllAgents]);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-light text-zinc-900 dark:text-white tracking-tight">QA Scorecard</h1>
          <p className="text-zinc-500 text-sm mt-1">Call coverage, agent coverage and evaluation accuracy for the Quality team.</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="month" value={month} max={new Date().toISOString().slice(0, 7)}
            onChange={e => e.target.value && setMonth(e.target.value)}
            className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2.5 text-xs font-bold text-zinc-700 dark:text-zinc-200 outline-none focus:border-indigo-500 dark:[color-scheme:dark]"
          />
          <button
            onClick={exportXlsx} disabled={!data}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500 disabled:opacity-40 transition-all"
          >
            <FileSpreadsheet size={14} /> Export
          </button>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center gap-2 py-24 text-zinc-400 text-xs font-bold uppercase tracking-widest">
          <Loader2 size={16} className="animate-spin" /> Calculating…
        </div>
      )}
      {error && !loading && (
        <div className="flex items-center gap-2 bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 rounded-2xl px-5 py-4 text-sm font-bold">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {data && !loading && th && (
        <>
          {/* ------------------------------------------------ KPI 1 ------ */}
          <Section icon={Target} title="1 · QA Call Coverage" subtitle={`Calls evaluated per working day, per QA. Target ${th.coverage.target} · minimum ${th.coverage.benchmark}.`}>
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-left min-w-[560px]">
                <thead>
                  <tr className="text-[9px] font-black uppercase tracking-widest text-zinc-400">
                    <th className="px-3 py-2">QA</th><th className="px-3 py-2 text-right">Calls counted</th>
                    <th className="px-3 py-2 text-right">Working days</th><th className="px-3 py-2 text-right">Calls / day</th><th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.qa_rows.length === 0 && (
                    <tr><td colSpan={5} className="px-3 py-8 text-center text-xs font-bold text-zinc-400">No QA activity in this month.</td></tr>
                  )}
                  {data.qa_rows.map(r => (
                    <React.Fragment key={r.qa_id}>
                      <tr className="border-t border-zinc-100 dark:border-zinc-900 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900/40" onClick={() => setOpenQa(openQa === r.qa_id ? null : r.qa_id)}>
                        <td className="px-3 py-3 text-sm font-black text-zinc-900 dark:text-white">
                          <span className="inline-flex items-center gap-1.5">{openQa === r.qa_id ? <ChevronDown size={13} /> : <ChevronRight size={13} />}{r.qa_name}</span>
                        </td>
                        <td className="px-3 py-3 text-right text-sm font-bold text-zinc-600 dark:text-zinc-300">{r.coverage.calls_counted}</td>
                        <td className="px-3 py-3 text-right text-sm font-bold text-zinc-600 dark:text-zinc-300">{r.coverage.working_days}</td>
                        <td className={`px-3 py-3 text-right text-xl font-black ${STATUS_UI[r.coverage.status].text}`}>{fmt(r.coverage.per_day)}</td>
                        <td className="px-3 py-3"><StatusChip status={r.coverage.status} /></td>
                      </tr>
                      {openQa === r.qa_id && (
                        <tr className="bg-zinc-50/60 dark:bg-zinc-900/30">
                          <td colSpan={5} className="px-4 py-4">
                            {r.coverage.basis === 'evaluation days' && (
                              <p className="text-[11px] font-bold text-amber-600 dark:text-amber-400 mb-2">
                                No check-in/check-out records for this QA — working days are the days they logged calls, which can overstate the average.
                              </p>
                            )}
                            {r.coverage.calls_on_unworked_days > 0 && (
                              <p className="text-[11px] font-bold text-zinc-500 mb-2">
                                {r.coverage.calls_on_unworked_days} call(s) were logged on a day without a completed check-in/out (usually today) and aren't counted yet.
                              </p>
                            )}
                            <div className="flex flex-wrap gap-1.5">
                              {r.coverage.daily.map(d => (
                                <span key={d.date} title={d.worked ? 'Working day' : 'No completed check-in/out — not counted'}
                                  className={`px-2 py-1 rounded-lg text-[10px] font-bold border ${d.worked
                                    ? (d.calls >= th.coverage.target ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                                      : d.calls >= th.coverage.benchmark ? 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400'
                                      : 'bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400')
                                    : 'bg-zinc-100 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-400'}`}>
                                  {d.date.slice(5)} · {d.calls}
                                </span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            {data.qa_rows.length > 1 && (
              <p className="mt-4 text-[11px] font-bold text-zinc-500">
                Team: <b className="text-zinc-800 dark:text-zinc-100">{data.team.coverage.qas_at_target}</b> of {data.team.coverage.qas} QAs at target ·{' '}
                <b className="text-zinc-800 dark:text-zinc-100">{data.team.coverage.qas_at_benchmark_or_better}</b> at the minimum or better.
              </p>
            )}
          </Section>

          {/* ------------------------------------------------ KPI 2 ------ */}
          <Section icon={Users} title="2 · Agent Coverage" subtitle={`Evaluated calls per active agent this month, and every agent evaluated at least once. Target ${th.agent.target} · minimum ${th.agent.benchmark}.`}>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
              <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-4">
                <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Calls per agent</p>
                <p className={`text-3xl font-black mt-1 ${STATUS_UI[data.agent_coverage.status].text}`}>{fmt(data.agent_coverage.avg_per_agent)}</p>
                <div className="mt-2"><StatusChip status={data.agent_coverage.status} /></div>
              </div>
              <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-4">
                <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Calls evaluated</p>
                <p className="text-3xl font-black mt-1 text-zinc-900 dark:text-white">{data.agent_coverage.calls_evaluated}</p>
              </div>
              <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-4">
                <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Active agents</p>
                <p className="text-3xl font-black mt-1 text-zinc-900 dark:text-white">{data.agent_coverage.active_agents}</p>
                <p className="text-[10px] text-zinc-500 font-bold mt-1">{data.agent_coverage.roster_size} on roster{data.agent_coverage.off_roster_but_evaluated > 0 ? ` + ${data.agent_coverage.off_roster_but_evaluated} evaluated off-roster` : ''}</p>
              </div>
              <div className={`rounded-2xl border p-4 ${data.agent_coverage.all_covered ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-rose-500/30 bg-rose-500/5'}`}>
                <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Agents evaluated</p>
                <p className={`text-3xl font-black mt-1 ${data.agent_coverage.all_covered ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                  {data.agent_coverage.evaluated_agents}<span className="text-lg text-zinc-400"> / {data.agent_coverage.active_agents}</span>
                </p>
                <p className="text-[10px] font-bold mt-1 text-zinc-500">{data.agent_coverage.all_covered ? 'Every agent covered (100%)' : `${fmt(data.agent_coverage.covered_pct)}% — target is 100%`}</p>
              </div>
            </div>

            {data.agent_coverage.not_evaluated.length > 0 && (
              <div className="mb-4 rounded-2xl border border-rose-500/30 bg-rose-500/5 px-4 py-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-rose-600 dark:text-rose-400 mb-2">Not evaluated this month</p>
                <div className="flex flex-wrap gap-1.5">
                  {data.agent_coverage.not_evaluated.map(a => (
                    <span key={a.agent_id} className="px-2.5 py-1 rounded-lg bg-white dark:bg-zinc-950 border border-rose-500/30 text-[11px] font-bold text-rose-600 dark:text-rose-400">{a.agent_name}</span>
                  ))}
                </div>
              </div>
            )}

            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-left min-w-[420px]">
                <thead><tr className="text-[9px] font-black uppercase tracking-widest text-zinc-400"><th className="px-3 py-2">Agent</th><th className="px-3 py-2 text-right">Calls evaluated</th><th className="px-3 py-2">Roster</th></tr></thead>
                <tbody>
                  {agentsShown.map(a => (
                    <tr key={a.agent_id} className="border-t border-zinc-100 dark:border-zinc-900">
                      <td className="px-3 py-2 text-sm font-bold text-zinc-800 dark:text-zinc-100">{a.agent_name}</td>
                      <td className={`px-3 py-2 text-right text-sm font-black ${a.calls === 0 ? 'text-rose-600 dark:text-rose-400' : 'text-zinc-700 dark:text-zinc-200'}`}>{a.calls}</td>
                      <td className="px-3 py-2 text-[10px] font-bold text-zinc-400">{a.on_roster ? 'On roster' : 'Evaluated this month, not on roster'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.agent_coverage.agents.length > 8 && (
              <button onClick={() => setShowAllAgents(v => !v)} className="mt-3 text-[10px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400 hover:underline">
                {showAllAgents ? 'Show fewer' : `Show all ${data.agent_coverage.agents.length} agents`}
              </button>
            )}
            {isSupervisor && (
              <p className="mt-3 text-[10px] text-zinc-400 font-medium">
                The roster is set per agent in User Management → "Monitored by QA". Agents who left should be unticked.
              </p>
            )}
          </Section>

          {/* ------------------------------------------------ KPI 3 ------ */}
          <Section icon={ShieldCheck} title="3 · QA Evaluation Accuracy" subtitle={`Share of evaluations not overturned after a dispute. Target ≥ ${th.accuracy.target}% · minimum ≥ ${th.accuracy.benchmark}%.`}>
            <div className="flex flex-wrap items-center gap-x-8 gap-y-3 mb-5">
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Team accuracy</p>
                <p className={`text-4xl font-black mt-1 ${STATUS_UI[data.team.accuracy.status].text}`}>{fmt(data.team.accuracy.pct, 2)}{data.team.accuracy.pct !== null && '%'}</p>
              </div>
              <StatusChip status={data.team.accuracy.status} />
              <p className="text-[11px] font-bold text-zinc-500">
                <b className="text-zinc-800 dark:text-zinc-100">{data.team.accuracy.overturned}</b> overturned out of <b className="text-zinc-800 dark:text-zinc-100">{data.team.accuracy.evaluations}</b> evaluations
              </p>
            </div>
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-left min-w-[520px]">
                <thead><tr className="text-[9px] font-black uppercase tracking-widest text-zinc-400"><th className="px-3 py-2">QA</th><th className="px-3 py-2 text-right">Evaluations</th><th className="px-3 py-2 text-right">Overturned</th><th className="px-3 py-2 text-right">Accuracy</th><th className="px-3 py-2">Status</th></tr></thead>
                <tbody>
                  {data.qa_rows.map(r => (
                    <React.Fragment key={r.qa_id}>
                      <tr className={`border-t border-zinc-100 dark:border-zinc-900 ${r.accuracy.overturned > 0 ? 'cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900/40' : ''}`}
                        onClick={() => r.accuracy.overturned > 0 && setOpenAcc(openAcc === r.qa_id ? null : r.qa_id)}>
                        <td className="px-3 py-3 text-sm font-black text-zinc-900 dark:text-white">
                          <span className="inline-flex items-center gap-1.5">
                            {r.accuracy.overturned > 0 ? (openAcc === r.qa_id ? <ChevronDown size={13} /> : <ChevronRight size={13} />) : <span className="w-[13px]" />}{r.qa_name}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-right text-sm font-bold text-zinc-600 dark:text-zinc-300">{r.accuracy.evaluations}</td>
                        <td className="px-3 py-3 text-right text-sm font-bold text-zinc-600 dark:text-zinc-300">{r.accuracy.overturned}</td>
                        <td className={`px-3 py-3 text-right text-lg font-black ${STATUS_UI[r.accuracy.status].text}`}>{fmt(r.accuracy.pct, 2)}{r.accuracy.pct !== null && '%'}</td>
                        <td className="px-3 py-3"><StatusChip status={r.accuracy.status} /></td>
                      </tr>
                      {openAcc === r.qa_id && (
                        <tr className="bg-zinc-50/60 dark:bg-zinc-900/30"><td colSpan={5} className="px-4 py-3">
                          <div className="space-y-1.5">
                            {r.accuracy.overturned_calls.map(o => (
                              <button key={o.evaluation_id} onClick={() => navigate(`/evaluate/${o.evaluation_id}`)}
                                className="w-full flex flex-wrap items-center justify-between gap-2 text-left px-3 py-2 rounded-xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 hover:border-indigo-400 transition-colors">
                                <span className="text-xs font-black text-zinc-800 dark:text-zinc-100">Call #{o.evaluation_id} <span className="font-bold text-zinc-400">· {o.agent_name} · {o.date}</span></span>
                                <span className="text-[11px] font-black text-rose-600 dark:text-rose-400">{o.original_score}% → {o.final_score}%</span>
                              </button>
                            ))}
                          </div>
                        </td></tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-[11px] text-zinc-500 font-medium leading-relaxed">
              A call counts as overturned when Quality approved a dispute <b>and</b> its score is no longer what it was when first disputed. An approval that left the score unchanged is not counted.
              The figure is for calls registered in this month, so it can still move as later disputes are resolved.
            </p>
          </Section>

          <p className="text-[10px] text-zinc-400 font-medium pb-6">
            {data.meta.basis_note}
            {data.meta.excluded_non_qa_evaluations > 0 && ` ${data.meta.excluded_non_qa_evaluations} evaluation(s) made by non-QA users are excluded.`}
          </p>
        </>
      )}
    </div>
  );
}
