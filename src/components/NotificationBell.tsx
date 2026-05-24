import React, { useState, useEffect } from 'react';
import { Bell, Check, Clock, AlertCircle, Inbox } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Notification } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';

export default function NotificationBell() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();

  const fetchNotifications = async () => {
    if (!user) return;
    try {
      const res = await fetch(`/api/notifications?user_id=${user.id}`);
      const data = await res.json();
      setNotifications(data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000); // Poll every 30s
    return () => clearInterval(interval);
  }, [user]);

  const markAsRead = async (id: number) => {
    try {
      await fetch(`/api/notifications/${id}/read`, { method: 'POST' });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    } catch (err) {
      console.error(err);
    }
  };

  const handleNotificationClick = (notification: Notification) => {
    markAsRead(notification.id);
    setIsOpen(false);
    
    if (notification.title.toLowerCase().includes('coaching')) {
      navigate('/coaching');
    } else if (notification.evaluation_id) {
      navigate(`/evaluate/${notification.evaluation_id}`);
    }
  };

  const handleViewAll = () => {
    setIsOpen(false);
    navigate('/notifications');
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <div className="relative">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700 transition-all group"
      >
        <Bell size={20} className={unreadCount > 0 ? 'animate-bounce' : ''} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white text-[8px] font-black rounded-full flex items-center justify-center border-2 border-[#09090b]">
            {unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              className="absolute right-0 mt-4 w-96 bg-zinc-950 border border-zinc-800 rounded-3xl shadow-2xl z-50 overflow-hidden"
            >
              <div className="p-5 border-b border-zinc-800 bg-zinc-900/50 flex justify-between items-center relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-5">
                   <Bell size={40} className="text-white" />
                </div>
                <div>
                  <h3 className="text-[10px] font-black text-white uppercase tracking-[0.3em] italic">Alert Matrix</h3>
                  <p className="text-[8px] text-zinc-500 font-bold uppercase mt-1">{unreadCount} Pending Interactions</p>
                </div>
              </div>
              <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
                {notifications.length > 0 ? (
                  notifications.map(n => (
                    <div 
                      key={n.id}
                      onClick={() => handleNotificationClick(n)}
                      className={`p-5 border-b border-zinc-900/50 hover:bg-zinc-900/50 transition-all cursor-pointer flex gap-4 group/item ${!n.is_read ? 'bg-indigo-500/[0.03]' : ''}`}
                    >
                      <div className={`shrink-0 w-10 h-10 rounded-2xl flex items-center justify-center border transition-transform group-hover/item:scale-110 ${
                        n.title.toLowerCase().includes('approved') ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' : 
                        n.title.toLowerCase().includes('escalated') ? 'bg-amber-500/10 border-amber-500/20 text-amber-500' :
                        'bg-indigo-500/10 border-indigo-500/20 text-indigo-500'
                      }`}>
                        {n.title.toLowerCase().includes('approved') ? <Check size={16} /> : 
                         n.title.toLowerCase().includes('escalated') ? <AlertCircle size={16} /> :
                         <Clock size={16} />}
                      </div>
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className={`text-[10px] uppercase tracking-wider ${!n.is_read ? 'font-black text-white' : 'text-zinc-500'}`}>{n.title}</p>
                          {!n.is_read && <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full" />}
                        </div>
                        <p className="text-[10px] text-zinc-500 leading-relaxed italic whitespace-pre-line line-clamp-3">{n.message}</p>
                        <p className="text-[8px] text-zinc-600 font-black uppercase tracking-tighter">{new Date(n.created_at).toLocaleString()}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-12 text-center flex flex-col items-center gap-4">
                    <div className="p-4 bg-zinc-900 rounded-full text-zinc-800">
                       <Inbox size={24} />
                    </div>
                    <p className="text-[10px] text-zinc-600 font-black uppercase tracking-[0.3em] italic">System Dormant</p>
                  </div>
                )}
              </div>
              <div className="p-4 bg-zinc-900/30 text-center border-t border-zinc-800/50">
                <button 
                  onClick={handleViewAll}
                  className="w-full py-3 text-[9px] font-black text-indigo-400 uppercase tracking-[0.4em] hover:text-white transition-all bg-zinc-900 border border-zinc-800 hover:border-indigo-500/50 rounded-2xl italic"
                >
                  Enter Notification Hub
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
