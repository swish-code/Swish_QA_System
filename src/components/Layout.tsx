import React, { useState, useEffect, useCallback } from 'react';
import Sidebar from './Sidebar';
import NotificationBell from './NotificationBell';
import ThemeToggle from './ThemeToggle';
import DraftsButton from './DraftsButton';
import DraftsPanel from './DraftsPanel';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { User, LogOut, Menu } from 'lucide-react';

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { user, logout } = useAuth();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Auto-close mobile sidebar on route change
  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [location.pathname]);

  const handleOpenMobileSidebar = useCallback(() => setMobileSidebarOpen(true), []);
  const handleCloseMobileSidebar = useCallback(() => setMobileSidebarOpen(false), []);

  return (
    <div className="flex min-h-screen bg-background text-foreground" dir="ltr">
      <Sidebar mobileOpen={mobileSidebarOpen} onMobileClose={handleCloseMobileSidebar} />
      <main className="flex-1 lg:ml-64 flex flex-col min-h-screen min-w-0">
        {/* Top Header — backdrop-blur removed (was repainting every scroll frame) */}
        <header className="h-16 sm:h-20 border-b border-zinc-100 dark:border-zinc-900 bg-white/95 dark:bg-black/95 sticky top-0 z-30 px-4 sm:px-8 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={handleOpenMobileSidebar}
              className="lg:hidden p-2 rounded-xl text-zinc-600 dark:text-zinc-400 hover:text-indigo-600 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-900 shrink-0"
              aria-label="Open menu"
            >
              <Menu size={20} />
            </button>
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-[1px] h-4 bg-indigo-500 shrink-0" />
              <h2 className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.3em] italic truncate">{location.pathname.replace('/', '') || 'Dashboard'}</h2>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-6 shrink-0">
            <div className="flex items-center gap-2 sm:gap-3">
              <ThemeToggle />
              <DraftsButton />
              <NotificationBell />
            </div>

            <div className="hidden sm:block h-8 w-[1px] bg-zinc-100 dark:bg-zinc-800" />

            <div className="flex items-center gap-2 sm:gap-4">
              <div className="text-right hidden sm:block">
                <p className="text-xs font-bold text-zinc-900 dark:text-white leading-none truncate max-w-[160px]">{user?.display_name}</p>
                <p className="text-[9px] font-black text-zinc-500 dark:text-zinc-600 uppercase tracking-widest mt-1">{user?.role}</p>
              </div>
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center text-indigo-500 dark:text-indigo-400 shrink-0">
                <User size={18} />
              </div>
              <button
                onClick={logout}
                className="p-2 sm:p-2.5 rounded-xl hover:bg-rose-500/10 text-zinc-600 hover:text-rose-500 shrink-0"
                title="Log Out"
              >
                <LogOut size={18} />
              </button>
            </div>
          </div>
        </header>

        {/* Page content — heavy AnimatePresence + motion.div removed (was 300ms per nav) */}
        <div className="p-4 sm:p-6 lg:p-8 flex-1 min-w-0">
          {children}
        </div>
      </main>

      {/* Right-side drafts panel; renders to body via portal */}
      <DraftsPanel />
    </div>
  );
}
