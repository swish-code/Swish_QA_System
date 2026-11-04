import React, { createContext, useContext, useState, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { TeamKey, TEAM_KEYS, TEAM_LABELS, teamLockOf } from '../teams';

/**
 * Which QA function (Customer Care / Complaint / Technical) the reports are
 * showing. Customer Care is the default. Only the overall supervisor and QAs
 * can look at the other two; everyone else is pinned to Customer Care until
 * team-scoped roles exist.
 */
interface TeamCtx { team: TeamKey; setTeam: (t: TeamKey) => void; canSwitch: boolean; }
const Ctx = createContext<TeamCtx>({ team: 'customer_care', setTeam: () => {}, canSwitch: false });
const KEY = 'qa_team_view';

export function TeamProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  // Team management is locked to its own function; only the overall
  // supervisor and QAs can switch.
  const locked = teamLockOf(user?.role, user?.department);
  const canSwitch = !locked && (user?.role === 'supervisor' || user?.role === 'qa');
  const [team, setTeamState] = useState<TeamKey>(() => {
    try {
      const v = localStorage.getItem(KEY) as TeamKey | null;
      return v && (TEAM_KEYS as string[]).includes(v) ? v : 'customer_care';
    } catch { return 'customer_care'; }
  });
  const setTeam = useCallback((t: TeamKey) => {
    setTeamState(t);
    try { localStorage.setItem(KEY, t); } catch {}
  }, []);
  return <Ctx.Provider value={{ team: locked ?? (canSwitch ? team : 'customer_care'), setTeam, canSwitch }}>{children}</Ctx.Provider>;
}

export const useTeam = () => useContext(Ctx);
export { TEAM_LABELS, TEAM_KEYS };
