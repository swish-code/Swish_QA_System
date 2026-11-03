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
