/**
 * The three QA functions: Customer Care, Complaint Team and Technical Team.
 *
 * An agent's DEPARTMENT decides which function they belong to, and the
 * function decides which scorecard (call type) can be used to evaluate them.
 * Shared by the server (which enforces it) and the evaluation form (which
 * only offers what is allowed), so the rule lives in exactly one place.
 */

export type TeamKey = 'customer_care' | 'complaint' | 'technical';

export const TEAM_LABELS: Record<TeamKey, string> = {
  customer_care: 'Customer Care',
  complaint: 'Complaint Team',
  technical: 'Technical Team',
};

/** Department -> function. Anything not listed (e.g. a new department) stays Customer Care. */
const TEAM_OF_DEPARTMENT: Record<string, TeamKey> = {
  Swish: 'customer_care',
  Mishmash: 'customer_care',
  FM: 'customer_care',
  Complain: 'complaint',
  TEC: 'technical',
};

export function teamOfDepartment(department: string | null | undefined): TeamKey {
  return TEAM_OF_DEPARTMENT[String(department ?? '')] ?? 'customer_care';
}

/** The call type that belongs to a team's own scorecard. */
export const TECHNICAL_CALL_TYPE = 'Technical';
export const COMPLAINT_CALL_TYPE = 'Complaints';

/**
 * Which call types a team may be evaluated with:
 *  - Complaint Team  -> only Complaints (its existing scorecard, unchanged)
 *  - Technical Team  -> only Technical (its own scorecard)
 *  - Customer Care   -> everything it had before, minus the Technical scorecard
 * Scorecards must never be mixed or interchangeable between teams.
 */
export function allowedCallTypes(team: TeamKey, allCallTypes: string[]): string[] {
  const norm = (s: string) => s.trim().toLowerCase();
  if (team === 'technical') return allCallTypes.filter(c => norm(c) === norm(TECHNICAL_CALL_TYPE));
  if (team === 'complaint') return allCallTypes.filter(c => norm(c) === norm(COMPLAINT_CALL_TYPE));
  return allCallTypes.filter(c => norm(c) !== norm(TECHNICAL_CALL_TYPE));
}

export function isCallTypeAllowed(team: TeamKey, callType: string, allCallTypes: string[]): boolean {
  return allowedCallTypes(team, allCallTypes).some(c => c.trim().toLowerCase() === String(callType ?? '').trim().toLowerCase());
}

/**
 * The team a staff account is locked to, or null when they may look across
 * teams (the overall supervisor, QAs).
 *  - supervisor / tl / cc_supervisor whose department is Complain or TEC are
 *    that function's own management and see ONLY that function
 *  - every other Team Leader and the Customer Care supervisor are Customer Care
 */
export function teamLockOf(role: string | null | undefined, department: string | null | undefined): TeamKey | null {
  const staff = role === 'supervisor' || role === 'tl' || role === 'cc_supervisor';
  if (!staff) return null;
  const t = teamOfDepartment(department);
  if (t !== 'customer_care') return t;
  return role === 'supervisor' ? null : 'customer_care';
}

export const TEAM_KEYS: TeamKey[] = ['customer_care', 'complaint', 'technical'];

/** Any unknown/garbled value becomes Customer Care, never "everything". */
export function normalizeTeam(v: unknown): TeamKey {
  return (TEAM_KEYS as string[]).includes(String(v)) ? (String(v) as TeamKey) : 'customer_care';
}

/**
 * SQL fragment restricting a users query (no alias) to one function's agents.
 * Built only from the fixed department list above, so it is safe to inline.
 * 'all' (or empty) adds nothing.
 */
export function agentDepartmentSql(team: unknown): string {
  if (team === undefined || team === null || team === '' || team === 'all') return '';
  const t = normalizeTeam(team);
  const inList = (t === 'customer_care'
    ? Object.keys(TEAM_OF_DEPARTMENT).filter(d => TEAM_OF_DEPARTMENT[d] === 'customer_care')
    : Object.keys(TEAM_OF_DEPARTMENT).filter(d => TEAM_OF_DEPARTMENT[d] === t)
  ).map(d => "'" + d + "'").join(',');
  return t === 'customer_care'
    ? ` AND (department IS NULL OR department NOT IN ('Complain','TEC'))`
    : ` AND department IN (${inList})`;
}
