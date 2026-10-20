/**
 * QA team scorecard — three KPIs computed from plain rows, with no database
 * access, so the exact code that ships can be run against real data and
 * checked against an independent count.
 *
 *   1. QA Call Coverage      calls evaluated per working day, PER QA
 *   2. Agent Coverage        evaluated calls per active agent, + every agent hit
 *   3. QA Evaluation Accuracy  share of evaluations NOT overturned on dispute
 *
 * Definitions (agreed with the business, 2026-10-20) are spelled out where they
 * are applied, because each one changes the number.
 */

export const SCORECARD_THRESHOLDS = {
  coverage: { target: 50, benchmark: 45 },   // calls / QA / working day
  agent: { target: 50, benchmark: 45 },      // calls / active agent / month
  accuracy: { target: 98, benchmark: 95 },   // % upheld
} as const;

export type KpiStatus = 'target' | 'benchmark' | 'below' | 'na';

export interface ScorecardInput {
  month: string; // YYYY-MM
  /** Users with role 'qa'. The QA team is exactly these people. */
  qas: { id: number; display_name: string }[];
  /** Evaluations REGISTERED in the month (by created_at day), by ANY evaluator. */
  evaluations: { id: number; qa_id: number; agent_id: number; date: string; final_score: number | null }[];
  /** Days with a completed check-in AND check-out, for any user, in the month. */
  attendance: { user_id: number; date: string }[];
  /** Every agent account. `monitored` = on the QA roster (users.qa_monitored). */
  agents: { id: number; display_name: string; monitored: boolean; first_evaluated_on: string | null }[];
  /** The current calendar month (YYYY-MM): roster agents with no evaluation yet are only flagged here. */
  currentMonth: string;
  /** The whole escalation log (small), used to find disputes that were upheld. */
  escalationLogs: { id: number; evaluation_id: number; role: string; action: string; old_score: number | null }[];
}

const round = (n: number, dp: number) => {
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
};

/** Status is judged on the DISPLAYED (rounded) value so a card never reads
 *  "45.0" yet shows red because the hidden value was 44.96. */
export function statusFor(value: number | null, t: { target: number; benchmark: number }): KpiStatus {
  if (value === null || Number.isNaN(value)) return 'na';
  if (value >= t.target) return 'target';
  if (value >= t.benchmark) return 'benchmark';
  return 'below';
}

export function computeScorecard(input: ScorecardInput) {
  const { month, qas, evaluations, attendance, agents, escalationLogs, currentMonth } = input;
  const [yy, mm] = month.split('-').map(Number);
  const monthEnd = `${month}-${String(new Date(yy, mm, 0).getDate()).padStart(2, '0')}`;
  const T = SCORECARD_THRESHOLDS;

  const qaIds = new Set(qas.map(q => q.id));
  const qaName = new Map(qas.map(q => [q.id, q.display_name]));
  const agentName = new Map(agents.map(a => [a.id, a.display_name]));

  // Only the QA team's own evaluations count. A supervisor's occasional
  // evaluation is reported, not silently folded into someone's average.
  const qaEvals = evaluations.filter(e => qaIds.has(e.qa_id));
  const excludedNonQa = evaluations.length - qaEvals.length;

  // ---------------------------------------------------------------- KPI 1 --
  const attendedBy = new Map<number, Set<string>>();
  for (const a of attendance) {
    if (!attendedBy.has(a.user_id)) attendedBy.set(a.user_id, new Set());
    attendedBy.get(a.user_id)!.add(String(a.date));
  }

  const evalsByQa = new Map<number, typeof qaEvals>();
  for (const e of qaEvals) {
    if (!evalsByQa.has(e.qa_id)) evalsByQa.set(e.qa_id, []);
    evalsByQa.get(e.qa_id)!.push(e);
  }

  // ---------------------------------------------------------------- KPI 3 --
  // A call counts as "overturned as a QA error" when its dispute was upheld:
  // Quality approved an escalation AND the call's score is not what it was
  // when first disputed. Comparing against the CURRENT score (not just the
  // score on the approval row) also catches the case where the approval was
  // logged without a change and the score was corrected afterwards by edit.
  // An approval that left the score untouched is not a QA error.
  const logsByEval = new Map<number, ScorecardInput['escalationLogs']>();
  for (const l of [...escalationLogs].sort((a, b) => a.id - b.id)) {
    if (!logsByEval.has(l.evaluation_id)) logsByEval.set(l.evaluation_id, []);
    logsByEval.get(l.evaluation_id)!.push(l);
  }
  const isOverturned = (e: { id: number; final_score: number | null }) => {
    const logs = logsByEval.get(e.id);
    if (!logs || logs.length === 0) return null;
    const upheld = logs.some(l => l.role === 'qa' && l.action === 'approved');
    const original = logs[0].old_score;
    if (!upheld || original === null || original === undefined || e.final_score === null) return null;
    return Math.abs(Number(e.final_score) - Number(original)) > 0.0001
      ? { original: Number(original), final: Number(e.final_score) }
      : null;
  };

  const qa_rows = [] as any[];
  let teamCounted = 0, teamDays = 0, teamTotal = 0, teamOverturned = 0;
  const overturnedAll: any[] = [];

  for (const q of qas) {
    const mine = evalsByQa.get(q.id) || [];
    const attended = attendedBy.get(q.id) || new Set<string>();
    if (mine.length === 0 && attended.size === 0) continue;

    const perDate = new Map<string, number>();
    for (const e of mine) perDate.set(e.date, (perDate.get(e.date) || 0) + 1);

    // Working days = days with a completed attendance record, matching the
    // existing QA KPI. A call logged on a day with no completed check-in/out
    // (typically today, before check-out) is not counted, on either side of
    // the ratio, and is reported so it is never invisible. With no attendance
    // data at all, fall back to the days the QA evaluated anything.
    const basis: 'attendance' | 'evaluation days' = attended.size > 0 ? 'attendance' : 'evaluation days';
    const workDates = basis === 'attendance' ? attended : new Set(perDate.keys());
    let counted = 0;
    for (const d of workDates) counted += perDate.get(d) || 0;
    const days = workDates.size;
    const perDay = days > 0 ? round(counted / days, 1) : null;

    const daily = Array.from(new Set([...perDate.keys(), ...workDates])).sort().map(d => ({
      date: d,
      calls: perDate.get(d) || 0,
      worked: workDates.has(d),
    }));

    const overturned = mine
      .map(e => ({ e, o: isOverturned(e) }))
      .filter(x => x.o)
      .map(x => ({
        evaluation_id: x.e.id,
        qa_id: q.id,
        qa_name: q.display_name,
        agent_name: agentName.get(x.e.agent_id) || `Agent #${x.e.agent_id}`,
        date: x.e.date,
        original_score: x.o!.original,
        final_score: x.o!.final,
      }));
    const total = mine.length;
    const pct = total > 0 ? round(((total - overturned.length) / total) * 100, 2) : null;

    teamCounted += counted; teamDays += days; teamTotal += total; teamOverturned += overturned.length;
    overturnedAll.push(...overturned);

    qa_rows.push({
      qa_id: q.id,
      qa_name: q.display_name,
      coverage: {
        per_day: perDay,
        status: statusFor(perDay, T.coverage),
        calls_counted: counted,
        working_days: days,
        basis,
        calls_total: total,
        calls_on_unworked_days: total - counted,
        daily,
      },
      accuracy: {
        pct,
        status: statusFor(pct, T.accuracy),
        evaluations: total,
        overturned: overturned.length,
        overturned_calls: overturned,
      },
    });
  }

  const teamPerDay = teamDays > 0 ? round(teamCounted / teamDays, 1) : null;
  const teamPct = teamTotal > 0 ? round(((teamTotal - teamOverturned) / teamTotal) * 100, 2) : null;

  // ---------------------------------------------------------------- KPI 2 --
  // "Active agents" = the monitored roster PLUS anyone QA actually evaluated
  // this month. The second part keeps past months honest: an agent who has
  // since left was active, and was being evaluated, while the month ran —
  // using today's roster alone would shrink the denominator for history.
  const perAgent = new Map<number, number>();
  for (const e of qaEvals) perAgent.set(e.agent_id, (perAgent.get(e.agent_id) || 0) + 1);

  // A roster agent counts for a PAST month only if they had been evaluated by
  // its end — otherwise they had not started yet (the roster is today's, and
  // new joiners would show as "never evaluated" in every month before they
  // arrived). In the CURRENT month an unevaluated roster agent is exactly what
  // this KPI must flag, so they always count.
  const rosterInMonth = (a: ScorecardInput['agents'][number]) =>
    a.monitored && (month >= currentMonth || (a.first_evaluated_on !== null && a.first_evaluated_on <= monthEnd));
  const scope = new Set<number>(agents.filter(rosterInMonth).map(a => a.id));
  for (const id of perAgent.keys()) scope.add(id);

  const monitoredIds = new Set(agents.filter(a => a.monitored && scope.has(a.id)).map(a => a.id));
  const agentRows = Array.from(scope).map(id => ({
    agent_id: id,
    agent_name: agentName.get(id) || `Agent #${id}`,
    calls: perAgent.get(id) || 0,
    on_roster: monitoredIds.has(id),
  })).sort((a, b) => a.calls - b.calls || a.agent_name.localeCompare(b.agent_name));

  const avgPerAgent = scope.size > 0 ? round(qaEvals.length / scope.size, 1) : null;
  const evaluatedAgents = agentRows.filter(r => r.calls > 0).length;
  const coveredPct = scope.size > 0 ? round((evaluatedAgents / scope.size) * 100, 1) : null;

  return {
    month,
    thresholds: T,
    qa_rows,
    team: {
      // The target is PER QA, so the team view counts who met it rather than
      // blending everyone into one average — a blend would let a part-time QA
      // pull two full-time ones below the line (or hide them above it).
      coverage: {
        qas: qa_rows.length,
        qas_at_target: qa_rows.filter(r => r.coverage.status === 'target').length,
        qas_at_benchmark_or_better: qa_rows.filter(r => r.coverage.status === 'target' || r.coverage.status === 'benchmark').length,
        calls_counted: teamCounted,
        qa_days: teamDays,
        avg_per_qa_day: teamPerDay,
      },
      accuracy: {
        pct: teamPct,
        status: statusFor(teamPct, T.accuracy),
        evaluations: teamTotal,
        overturned: teamOverturned,
        overturned_calls: overturnedAll.sort((a, b) => String(b.date).localeCompare(String(a.date))),
      },
    },
    agent_coverage: {
      avg_per_agent: avgPerAgent,
      status: statusFor(avgPerAgent, T.agent),
      calls_evaluated: qaEvals.length,
      active_agents: scope.size,
      roster_size: monitoredIds.size,
      evaluated_agents: evaluatedAgents,
      covered_pct: coveredPct,
      all_covered: scope.size > 0 && evaluatedAgents === scope.size,
      not_evaluated: agentRows.filter(r => r.calls === 0),
      off_roster_but_evaluated: agentRows.filter(r => !r.on_roster && r.calls > 0).length,
      agents: agentRows,
    },
    meta: {
      excluded_non_qa_evaluations: excludedNonQa,
      basis_note:
        'Evaluations are counted on the day they were registered. Working days are days with a completed check-in and check-out.',
    },
  };
}
