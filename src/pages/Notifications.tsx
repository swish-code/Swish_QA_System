import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Notification } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Bell, 
  Check, 
  Clock, 
  AlertCircle, 
  CheckCircle2, 
  Trash2, 
  ChevronRight,
  Filter,
  Search,
  Inbox
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Notifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [filter, setFilter] = useState<'all' | 'unread' | 'read'>('all');
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  const fetchNotifications = async () => {
    if (!user) return;
    try {
      const res = await fetch(`/api/notifications?user_id=${user.id}`);
      const data = await res.json();
      setNotifications(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, [user]);

  const markAsRead = async (id: number) => {
    try {
      await fetch(`/api/notifications/${id}/read`, { method: 'POST' });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    } catch (err) {
      console.error(err);
    }
  };

  const markAllAsRead = async () => {
    if (!user) return;
    try {
      await fetch(`/api/notifications/read-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id })
      });
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch (err) {
      console.error(err);
    }
  };

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.is_read) {
      markAsRead(notification.id);
    }
    
    if (notification.title.toLowerCase().includes('coaching')) {
      navigate('/coaching');
    } else if (notification.evaluation_id) {
      navigate(`/evaluate/${notification.evaluation_id}`);
    }
  };

  const filteredNotifications = notifications.filter(n => {
    if (filter === 'unread') return !n.is_read;
    if (filter === 'read') return n.is_read;
    return true;
  });

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <div className="p-8 max-w-[1200px] mx-auto space-y-8">
      {/* Header Area */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-4xl font-black text-zinc-900 dark:text-white tracking-tighter flex items-center gap-4 italic uppercase">
            <div className="w-1.5 h-10 bg-indigo-600 rounded-full" />
            Notification Hub
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 text-[10px] font-black uppercase tracking-[0.4em] ml-6">
            Global alert matrix & interaction sync
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={markAllAsRead}
            disabled={unreadCount === 0}
            className="flex items-center gap-2 px-6 py-3 bg-zinc-900 dark:bg-zinc-800 text-zinc-400 hover:text-white rounded-2xl border border-zinc-800 transition-all font-black text-[10px] uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed italic"
          >
            <CheckCircle2 size={14} />
            Mark all as read
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Sidebar Filters */}
        <div className="lg:col-span-1 space-y-6">
          <div className="glass-card !p-6 space-y-6">
            <h3 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest flex items-center gap-2 italic">
              <Filter size={14} className="text-indigo-600" />
              Filter Stream
            </h3>
            
            <div className="flex flex-col gap-2">
              {[
                { id: 'all', icon: Inbox, label: 'All Activity' },
                { id: 'unread', icon: Bell, label: `Unread (${unreadCount})` },
                { id: 'read', icon: Check, label: 'History' },
              ].map(item => (
                <button
                  key={item.id}
                  onClick={() => setFilter(item.id as any)}
                  className={`flex items-center justify-between p-4 rounded-xl transition-all font-black text-[10px] uppercase tracking-wider italic ${
                    filter === item.id 
                    ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-600/20' 
                    : 'bg-zinc-50 dark:bg-zinc-900/50 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-all'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <item.icon size={14} />
                    {item.label}
                  </div>
                  {filter === item.id && <ChevronRight size={14} />}
                </button>
              ))}
            </div>
          </div>

          <div className="glass-card !p-6 bg-indigo-600/5 border-indigo-500/10">
            <h4 className="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-2 italic">Pro Tip</h4>
            <p className="text-[10px] text-zinc-500 dark:text-zinc-400 leading-relaxed italic">
              Notifications provide instant access to evaluations and coaching sessions. Click any alert to view details.
            </p>
          </div>
        </div>

        {/* Main Stream */}
        <div className="lg:col-span-3 space-y-4">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <div className="w-10 h-10 border-4 border-zinc-800 border-t-indigo-600 rounded-full animate-spin" />
              <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest animate-pulse">Scanning matrix...</p>
            </div>
          ) : filteredNotifications.length > 0 ? (
            <div className="space-y-4">
              {filteredNotifications.map((n, idx) => (
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  key={n.id}
                  onClick={() => handleNotificationClick(n)}
                  className={`group relative overflow-hidden glass-card !p-6 flex gap-6 cursor-pointer hover:border-indigo-500/30 transition-all hover:bg-white dark:hover:bg-zinc-900/40 ${!n.is_read ? 'bg-indigo-600/[0.03] border-l-4 border-l-indigo-600' : ''}`}
                >
                  <div className={`shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center border transition-all group-hover:scale-110 ${
                    n.title.toLowerCase().includes('approved') ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' : 
                    n.title.toLowerCase().includes('escalated') ? 'bg-amber-500/10 border-amber-500/20 text-amber-500' :
                    'bg-indigo-500/10 border-indigo-500/20 text-indigo-600'
                  }`}>
                    {n.title.toLowerCase().includes('approved') ? <CheckCircle2 size={20} /> : 
                     n.title.toLowerCase().includes('escalated') ? <AlertCircle size={20} /> :
                     <Bell size={20} />}
                  </div>

                  <div className="flex-1 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className={`text-xs font-black uppercase tracking-tight ${!n.is_read ? 'text-zinc-900 dark:text-white' : 'text-zinc-500'}`}>
                        {n.title}
                      </h4>
                      <div className="flex items-center gap-2">
                        <Clock size={12} className="text-zinc-400" />
                        <span className="text-[10px] font-bold text-zinc-400">{new Date(n.created_at).toLocaleString()}</span>
                      </div>
                    </div>
                    
                    <div className="bg-zinc-50 dark:bg-zinc-950/50 p-4 rounded-xl border border-zinc-100 dark:border-zinc-900 whitespace-pre-line text-[11px] text-zinc-600 dark:text-zinc-400 leading-relaxed italic font-medium">
                      {n.message}
                    </div>

                    <div className="flex items-center gap-4 pt-2">
                      <button className="text-[9px] font-black text-indigo-500 uppercase tracking-widest hover:underline flex items-center gap-1">
                        View Details <ChevronRight size={10} />
                      </button>
                    </div>
                  </div>

                  {!n.is_read && (
                    <div className="absolute top-0 right-0 p-2">
                      <div className="w-2 h-2 bg-indigo-500 rounded-full animate-ping" />
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="glass-card !p-20 flex flex-col items-center justify-center text-center space-y-6">
              <div className="w-20 h-20 bg-zinc-50 dark:bg-zinc-900 rounded-full flex items-center justify-center text-zinc-300 dark:text-zinc-700">
                <Inbox size={40} />
              </div>
              <div className="space-y-2">
                <h3 className="text-sm font-black text-zinc-900 dark:text-white uppercase tracking-widest italic">Matrix Synchronized</h3>
                <p className="text-[10px] text-zinc-500 max-w-xs font-medium italic">No notifications found matches your current filter. Your interaction queue is clear.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
