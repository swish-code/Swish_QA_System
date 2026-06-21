import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from '../types';

interface AuthContextType {
  user: User | null;
  login: (userData: { token: string; user: User; session_id?: number | null }) => void;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Heartbeat interval — 2 min keeps the user_sessions row's last_seen_at
// fresh enough that we accurately credit time online without spamming.
const HEARTBEAT_MS = 2 * 60 * 1000;

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    const token = localStorage.getItem('token');
    if (savedUser && token) {
      setUser(JSON.parse(savedUser));
    }
    setIsLoading(false);
  }, []);

  // Heartbeat — keeps the session_id row updated so the Duration KPI
  // reflects real time online. Pauses when the tab is hidden. Skipped
  // silently when no session_id is stored (e.g., legacy sessions).
  useEffect(() => {
    if (!user) return;
    const sessionId = localStorage.getItem('session_id');
    if (!sessionId) return;

    let cancelled = false;
    const ping = async () => {
      if (cancelled) return;
      if (document.hidden) return;
      try {
        await fetch('/api/sessions/heartbeat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: parseInt(sessionId, 10) }),
        });
      } catch {}
    };
    ping(); // immediate first ping
    const id = setInterval(ping, HEARTBEAT_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [user]);

  const login = (userData: { token: string; user: User; session_id?: number | null }) => {
    localStorage.setItem('token', userData.token);
    localStorage.setItem('user', JSON.stringify(userData.user));
    if (userData.session_id) {
      localStorage.setItem('session_id', String(userData.session_id));
    }
    setUser(userData.user);
  };

  const logout = () => {
    // Finalise the session row server-side. Best-effort — never blocks the
    // local logout (auth state must always be clearable client-side).
    const sessionId = localStorage.getItem('session_id');
    if (sessionId) {
      fetch('/api/sessions/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: parseInt(sessionId, 10) }),
      }).catch(() => {});
    }
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('session_id');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
