import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { MessageSquare, Plus, CheckCircle, Clock, Search, ChevronRight, User as UserIcon, Calendar } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { User, CoachingSession } from '../types';
import { useSearchParams } from 'react-router-dom';

export default function CoachingManagement() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [sessions, setSessions] = useState<CoachingSession[]>([]);
  const [agents, setAgents] = useState<User[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [newSession, setNewSession] = useState({
    agent_id: '',
    weaknesses: '',
    notes: '',
    plan: '',
    evaluation_id: ''
  });

  const fetchSessions = async () => {
    try {
      const res = await fetch(`/api/coaching?user_id=${user?.id}&role=${user?.role}`);
      if (!res.ok) throw new Error('Coaching data fetch failed');
      const data = await res.json();
      setSessions(data);
    } catch (err) {
      console.error("Error fetching sessions:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
    if (user?.role === 'tl') {
      fetch('/api/users')
        .then(res => {
          if (!res.ok) throw new Error('Users fetch failed');
          return res.json();
        })
        .then(data => setAgents(data.filter((u: User) => u.role === 'agent' && u.tl_id === user.id)))
        .catch(console.error);
    }
  }, [user]);

  useEffect(() => {
    const agentId = searchParams.get('agent_id');
    const evalId = searchParams.get('evaluation_id');
    if (agentId) {
      setNewSession(prev => ({ ...prev, agent_id: agentId, evaluation_id: evalId || '' }));
      setShowModal(true);
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/coaching', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newSession, tl_id: user?.id }),
    });
    if (res.ok) {
      setShowModal(false);
      setNewSession({ agent_id: '', weaknesses: '', notes: '', plan: '', evaluation_id: '' });
      fetchSessions();
    }
  };

  const pendingSessions = sessions.filter(s => s.status === 'open' || s.status === 'pending');
  const completedSessions = sessions.filter(s => s.status === 'completed');

  return (
    <div className="space-y-8 max-w-[1400px] mx-auto" dir="ltr">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end border-b border-zinc-200 dark:border-zinc-800 pb-8 gap-6 transition-colors duration-300">
        <div>
          <h2 className="text-3xl font-black text-zinc-900 dark:text-white tracking-tighter uppercase italic mb-2">Coaching Hub</h2>
          <p className="text-zinc-500 text-xs font-medium max-w-md">Develop agent skills and track performance improvement plans in real-time.</p>
        </div>
        {user?.role === 'tl' && (
          <button 
            onClick={() => setShowModal(true)}
            className="px-8 py-3 rounded-2xl bg-indigo-600 text-white font-black text-[10px] uppercase tracking-widest shadow-xl shadow-indigo-500/20 hover:bg-indigo-500 transition-all flex items-center gap-2"
          >
            <Plus size={18} /> New Session
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
           <div className="flex items-center gap-4 mb-2">
             <div className="w-2 h-8 bg-indigo-500 rounded-full" />
             <h3 className="text-sm font-black text-zinc-800 dark:text-white uppercase tracking-[0.2em]">Active Sessions</h3>
           </div>

           {isLoading ? (
             <div className="py-20 text-center">
               <div className="inline-block w-8 h-8 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
             </div>
           ) : sessions.length === 0 ? (
             <div className="glass-card p-20 text-center border-dashed border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-950/20 transition-colors duration-300">
               <MessageSquare className="mx-auto text-zinc-300 dark:text-zinc-800 mb-4" size={40} />
               <p className="text-zinc-400 dark:text-zinc-600 text-xs font-black uppercase tracking-widest italic">No coaching matches recorded yet</p>
             </div>
           ) : (
             <div className="space-y-4">
               {sessions.map((session: any) => (
                 <motion.div 
                   key={session.id} 
                   initial={{ opacity: 0, x: -20 }}
                   animate={{ opacity: 1, x: 0 }}
                   className="glass-card flex items-center gap-6 border-zinc-200 dark:border-zinc-800/50 bg-white dark:bg-zinc-900/40 group hover:border-indigo-600/30 transition-all cursor-pointer shadow-sm"
                 >
                    <div className="w-14 h-14 rounded-2xl bg-white dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-800 flex flex-col items-center justify-center group-hover:border-indigo-600/20 transition-all p-2">
                       <Calendar size={18} className="text-zinc-400 dark:text-zinc-600 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors" />
                       <span className="text-[8px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mt-1 text-center">
                         {new Date(session.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                       </span>
                    </div>
                    <div className="flex-1">
                       <div className="flex items-center gap-3 mb-2">
                           <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest border ${
                             session.status === 'completed' ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'border-blue-500/20 bg-blue-500/10 text-blue-600 dark:text-blue-400'
                           }`}>
                            {session.status || 'Active'}
                           </span>
                           {session.evaluation_id && (
                             <span className="text-[8px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-widest">Linked to Audit #{session.evaluation_id}</span>
                           )}
                       </div>
                       <h4 className="text-sm font-black text-zinc-800 dark:text-white mb-1 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                         {session.weaknesses?.substring(0, 50)}...
                       </h4>
                       <div className="flex items-center gap-4">
                         <div className="flex items-center gap-1.5">
                           <UserIcon size={10} className="text-zinc-300 dark:text-zinc-600" />
                           <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Agent: {session.agent_name}</p>
                         </div>
                         <div className="flex items-center gap-1.5">
                           <Clock size={10} className="text-zinc-300 dark:text-zinc-600" />
                           <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">By: {session.tl_name}</p>
                         </div>
                       </div>
                    </div>
                    <button className="p-3 bg-white dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-800 rounded-xl hover:text-indigo-600 dark:hover:text-white text-zinc-400 dark:text-zinc-600 transition-all shadow-sm">
                       <ChevronRight size={16} />
                    </button>
                 </motion.div>
               ))}
             </div>
           )}
        </div>

        <div className="space-y-6">
           <div className="glass-card border-zinc-200 dark:border-zinc-800/50 p-8 bg-white dark:bg-zinc-900/40 transition-colors duration-300 shadow-sm">
              <h3 className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                 <Clock className="text-indigo-600 dark:text-indigo-400" size={14} />
                 Statistics
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-950/40 border border-zinc-100 dark:border-zinc-800 transition-colors">
                  <p className="text-[10px] font-black text-zinc-400 dark:text-zinc-600 uppercase mb-2">Total</p>
                  <p className="text-2xl font-black text-zinc-800 dark:text-white italic">{sessions.length}</p>
                </div>
                <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-950/40 border border-zinc-100 dark:border-zinc-800 transition-colors">
                  <p className="text-[10px] font-black text-zinc-400 dark:text-zinc-600 uppercase mb-2">Active</p>
                  <p className="text-2xl font-black text-indigo-600 dark:text-indigo-500 italic">{pendingSessions.length}</p>
                </div>
              </div>
           </div>
           
           <div className="glass-card border-zinc-200 dark:border-zinc-800/50 p-8 overflow-hidden relative bg-white dark:bg-zinc-900/40 transition-colors duration-300 shadow-sm">
              <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 blur-3xl rounded-full" />
              <h3 className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                 <CheckCircle className="text-emerald-600 dark:text-emerald-500" size={14} />
                 Successful Plans
              </h3>
              {completedSessions.length === 0 ? (
                <p className="text-[11px] text-zinc-400 dark:text-zinc-700 text-center py-6 italic font-medium uppercase tracking-widest">No completed improvement plans yet.</p>
              ) : (
                <div className="space-y-3">
                  {completedSessions.slice(0, 3).map(s => (
                    <div key={s.id} className="p-3 rounded-xl bg-white dark:bg-zinc-950/30 border border-zinc-100 dark:border-zinc-800/50 shadow-sm transition-colors">
                      <p className="text-[10px] font-bold text-zinc-800 dark:text-white mb-1">{(s as any).agent_name}</p>
                      <p className="text-[9px] text-zinc-500 dark:text-zinc-500 line-clamp-1">{s.plan}</p>
                    </div>
                  ))}
                </div>
              )}
           </div>
        </div>
      </div>

      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 w-full max-w-2xl rounded-[3rem] overflow-hidden shadow-2xl relative transition-colors duration-300"
            >
              <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-600/5 blur-[100px] -z-10" />
              
              <div className="p-10 border-b border-zinc-100 dark:border-zinc-800/50 flex items-center justify-between bg-white dark:bg-zinc-950/20">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-indigo-600/10 border border-indigo-500/20 rounded-[1.5rem] flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                    <MessageSquare size={28} />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black text-zinc-900 dark:text-white tracking-tighter uppercase italic">New Session</h3>
                    <p className="text-[10px] font-black text-indigo-600 dark:text-indigo-500 uppercase tracking-widest mt-1">Improvement Protocol</p>
                  </div>
                </div>
                <button onClick={() => setShowModal(false)} className="p-2 text-zinc-400 dark:text-zinc-600 hover:text-zinc-600 dark:hover:text-white transition-colors">
                  <svg size={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-10 space-y-8">
                <div className="space-y-4">
                  <label className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest ml-2">Target Agent</label>
                  <select 
                    className="w-full bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-2xl px-6 py-4 text-sm text-zinc-800 dark:text-white outline-none focus:border-indigo-500 transition-all appearance-none cursor-pointer shadow-sm" 
                    value={newSession.agent_id}
                    onChange={(e) => setNewSession({...newSession, agent_id: e.target.value})}
                    required
                  >
                    <option value="">Select from your team...</option>
                    {agents.map(a => <option key={a.id} value={a.id}>{a.display_name}</option>)}
                  </select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-4">
                    <label className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest ml-2">Weaknesses Identified</label>
                    <textarea 
                      className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl px-6 py-4 text-sm text-zinc-800 dark:text-white outline-none focus:border-indigo-500 transition-all resize-none shadow-sm placeholder:text-zinc-400" 
                      rows={4}
                      placeholder="Identify keys gap in performance..."
                      value={newSession.weaknesses}
                      onChange={(e) => setNewSession({...newSession, weaknesses: e.target.value})}
                      required
                    />
                  </div>
                  <div className="space-y-4">
                    <label className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest ml-2">Success Action Plan</label>
                    <textarea 
                      className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl px-6 py-4 text-sm text-zinc-800 dark:text-white outline-none focus:border-indigo-500 transition-all resize-none shadow-sm placeholder:text-zinc-400" 
                      rows={4}
                      placeholder="Step-by-step improvement roadmap..."
                      value={newSession.plan}
                      onChange={(e) => setNewSession({...newSession, plan: e.target.value})}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <label className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest ml-2">Internal Notes (Optional)</label>
                  <textarea 
                    className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl px-6 py-4 text-sm text-zinc-800 dark:text-white outline-none focus:border-indigo-500 transition-all resize-none shadow-sm placeholder:text-zinc-400" 
                    rows={2}
                    placeholder="Private observations..."
                    value={newSession.notes}
                    onChange={(e) => setNewSession({...newSession, notes: e.target.value})}
                  />
                </div>

                <div className="flex justify-end gap-6 pt-6 border-t border-zinc-100 dark:border-zinc-800/50">
                  <button type="submit" className="w-full py-4 rounded-2xl bg-indigo-600 text-white font-black text-[11px] uppercase tracking-[0.2em] shadow-xl shadow-indigo-500/20 hover:bg-indigo-500 transition-all active:scale-[0.98]">
                    Launch Protocol
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
