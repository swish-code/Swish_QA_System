import { motion } from 'motion/react';
import {
  LayoutDashboard,
  Users,
  FileCheck,
  PenTool,
  BarChart3,
  MessageSquare,
  Bell,
  LogOut,
  Settings,
  Zap,
  ChevronRight,
  TrendingUp,
  History,
  Activity,
  Trophy,
  ShieldCheck,
  Sparkles,
  Briefcase
} from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import ThemeToggle from './ThemeToggle';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const links = [
    { name: 'Dashboard', icon: LayoutDashboard, path: '/', roles: ['supervisor', 'cc_supervisor', 'qa', 'tl', 'agent'] },
    { name: 'New Evaluation', icon: Zap, path: '/evaluate', roles: ['qa'] },
    { name: 'All calls', icon: FileCheck, path: '/audits', roles: ['qa', 'supervisor', 'cc_supervisor', 'tl', 'agent'] },
    { name: 'Analysis Deck', icon: Activity, path: '/analysis', roles: ['qa', 'supervisor', 'cc_supervisor', 'tl', 'agent'] },
    { name: 'CC Operations', icon: Briefcase, path: '/cc-operations', roles: ['cc_supervisor', 'supervisor'] },
    { name: 'Team Performance', icon: BarChart3, path: '/team', roles: ['tl', 'supervisor', 'cc_supervisor'] },
    { name: 'LOB Performance', icon: TrendingUp, path: '/lob-performance', roles: ['qa', 'supervisor', 'cc_supervisor', 'tl', 'agent'] },
    { name: 'Coaching', icon: MessageSquare, path: '/coaching', roles: ['tl', 'supervisor', 'cc_supervisor', 'agent', 'qa'] },
    { name: 'Escalations', icon: Bell, path: '/escalations', roles: ['qa', 'tl', 'supervisor', 'cc_supervisor'] },
    { name: 'Drop Point', icon: BarChart3, path: '/drop-point', roles: ['qa', 'supervisor', 'cc_supervisor', 'tl'] },
    { name: 'WOW Calls', icon: Sparkles, path: '/wow-calls', roles: ['qa', 'supervisor', 'cc_supervisor', 'tl'] },
    { name: 'QA KPIs', icon: Trophy, path: '/qa-kpis', roles: ['qa', 'supervisor'] },
    { name: 'TL KPIs', icon: Trophy, path: '/tl-kpis', roles: ['cc_supervisor', 'supervisor'] },
    { name: 'Accuracy Cases', icon: ShieldCheck, path: '/accuracy-cases', roles: ['qa', 'tl', 'supervisor', 'cc_supervisor'] },
    { name: 'User Management', icon: Users, path: '/users', roles: ['supervisor'] },
    { name: 'Activity Audit', icon: History, path: '/activity-audit', roles: ['supervisor'] },
    { name: 'Form Settings', icon: Settings, path: '/settings/form', roles: ['supervisor'] },
  ];

  const filteredLinks = links.filter(link => link.roles.includes(user?.role || ''));

  return (
    <aside className="w-64 h-screen fixed left-0 top-0 glass border-r border-zinc-200 dark:border-zinc-800 flex flex-col p-4 z-50">
      <div className="p-6 flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-2xl shadow-indigo-500/40">
            <FileCheck className="text-white" size={22} />
          </div>
          <span className="font-black text-xl tracking-tighter text-zinc-900 dark:text-zinc-100 uppercase italic">
            Swish <span className="text-indigo-600 dark:text-indigo-400">QA</span>
          </span>
        </div>
      </div>

      {/* min-h-0 lets the flex parent shrink the nav so overflow-y-auto
          actually scrolls instead of pushing the user/logout block out
          of the viewport. Custom scrollbar styling keeps the bar slim. */}
      <nav className="flex-1 min-h-0 overflow-y-auto px-2 space-y-1 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-zinc-300 dark:[&::-webkit-scrollbar-thumb]:bg-zinc-700 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent">
        {filteredLinks.map((link) => (
          <NavLink
            key={link.path}
            to={link.path}
            className={({ isActive }) => cn(
              "sidebar-link",
              isActive && "active"
            )}
          >
            <link.icon size={18} />
            <span className="text-[10px]">{link.name}</span>
          </NavLink>
        ))}
      </nav>

      <div className="p-4 mt-auto border-t border-zinc-100 dark:border-zinc-800/50">
        <div className="flex items-center gap-3 p-3 bg-zinc-50 dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-2xl mb-4 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-black italic shadow-lg shadow-indigo-600/20">
            {user?.display_name.charAt(0)}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-[11px] font-black uppercase tracking-tight truncate text-zinc-900 dark:text-zinc-100 italic">{user?.display_name}</span>
            <span className="text-[9px] text-zinc-400 font-bold uppercase tracking-widest">{user?.role}</span>
          </div>
        </div>

        <button 
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-5 py-3 text-zinc-400 hover:text-rose-500 hover:bg-rose-500/5 rounded-2xl transition-all duration-300 text-[10px] font-black uppercase tracking-widest italic"
        >
          <LogOut size={16} />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
}
