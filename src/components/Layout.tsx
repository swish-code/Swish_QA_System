import React from 'react';
import Sidebar from './Sidebar';
import NotificationBell from './NotificationBell';
import ThemeToggle from './ThemeToggle';
import { motion, AnimatePresence } from 'motion/react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { User, LogOut } from 'lucide-react';

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { user, logout } = useAuth();

  return (
    <div className="flex min-h-screen bg-background text-foreground transition-colors duration-300" dir="ltr">
      <Sidebar />
      <main className="flex-1 ml-64 flex flex-col min-h-screen">
        {/* Top Header */}
        <header className="h-20 border-b border-zinc-100 dark:border-zinc-900 bg-white/80 dark:bg-black/80 backdrop-blur-xl sticky top-0 z-30 px-8 flex items-center justify-between transition-colors duration-300">
          <div className="flex items-center gap-2">
            <div className="w-[1px] h-4 bg-indigo-500" />
            <h2 className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.3em] italic">{location.pathname.replace('/', '') || 'Dashboard'}</h2>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <ThemeToggle />
              <NotificationBell />
            </div>
            
            <div className="h-8 w-[1px] bg-zinc-100 dark:bg-zinc-800" />
            
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-xs font-bold text-zinc-900 dark:text-white leading-none">{user?.display_name}</p>
                <p className="text-[9px] font-black text-zinc-500 dark:text-zinc-600 uppercase tracking-widest mt-1">{user?.role}</p>
              </div>
              <div className="w-10 h-10 rounded-2xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center text-indigo-500 dark:text-indigo-400">
                <User size={20} />
              </div>
              <button 
                onClick={logout}
                className="p-2.5 rounded-xl hover:bg-rose-500/10 text-zinc-600 hover:text-rose-500 transition-all group"
                title="Log Out"
              >
                <LogOut size={18} />
              </button>
            </div>
          </div>
        </header>

        <div className="p-8 flex-1">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
