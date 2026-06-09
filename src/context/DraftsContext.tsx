import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';

export type Draft = {
  id: number;
  owner_id: number;
  owner_name?: string;
  agent_id: number | null;
  agent_name?: string;
  brand: string | null;
  call_type: string | null;
  title: string;
  data: any;
  status: string;
  created_at: string;
  updated_at: string;
};

type DraftsContextValue = {
  drafts: Draft[];
  count: number;
  isPanelOpen: boolean;
  isLoading: boolean;
  openPanel: () => void;
  closePanel: () => void;
  refresh: () => Promise<void>;
  deleteDraft: (id: number) => Promise<void>;
  clearAll: () => Promise<void>;
};

const DraftsContext = createContext<DraftsContextValue | null>(null);

export function DraftsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [isPanelOpen, setPanelOpen] = useState(false);
  const [isLoading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) {
      setDrafts([]);
      return;
    }
    // Drafts only make sense for users who can create evaluations.
    if (user.role === 'agent') {
      setDrafts([]);
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({
        user_id: String(user.id),
        role: user.role,
      });
      const res = await fetch(`/api/drafts?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setDrafts(json.drafts || []);
    } catch (err) {
      console.error('Failed to fetch drafts', err);
      setDrafts([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Initial load + reload on user change
  useEffect(() => { refresh(); }, [refresh]);

  // Allow other parts of the app to ask for a refresh via a custom event
  // (e.g., EvaluationForm after Save-as-Draft / Submit).
  useEffect(() => {
    const handler = () => { refresh(); };
    window.addEventListener('drafts:refresh', handler);
    return () => window.removeEventListener('drafts:refresh', handler);
  }, [refresh]);

  const openPanel = useCallback(() => {
    setPanelOpen(true);
    refresh();
  }, [refresh]);

  const closePanel = useCallback(() => setPanelOpen(false), []);

  const deleteDraft = useCallback(async (id: number) => {
    if (!user) return;
    const params = new URLSearchParams({
      user_id: String(user.id),
      role: user.role,
    });
    const res = await fetch(`/api/drafts/${id}?${params}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await refresh();
  }, [user, refresh]);

  const clearAll = useCallback(async () => {
    if (!user) return;
    const params = new URLSearchParams({
      user_id: String(user.id),
      role: user.role,
    });
    const res = await fetch(`/api/drafts?${params}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await refresh();
  }, [user, refresh]);

  const value = useMemo<DraftsContextValue>(() => ({
    drafts,
    count: drafts.length,
    isPanelOpen,
    isLoading,
    openPanel,
    closePanel,
    refresh,
    deleteDraft,
    clearAll,
  }), [drafts, isPanelOpen, isLoading, openPanel, closePanel, refresh, deleteDraft, clearAll]);

  return <DraftsContext.Provider value={value}>{children}</DraftsContext.Provider>;
}

export function useDrafts() {
  const ctx = useContext(DraftsContext);
  if (!ctx) throw new Error('useDrafts must be used inside <DraftsProvider>');
  return ctx;
}

// Helper that any component can call to notify the provider that drafts
// changed on the server side (e.g., after creating or submitting one).
export function notifyDraftsChanged() {
  window.dispatchEvent(new CustomEvent('drafts:refresh'));
}
