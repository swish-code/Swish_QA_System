import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { motion, AnimatePresence } from 'motion/react';
import { Lock, User, ShieldCheck, Activity, Fingerprint, ChevronRight, CheckCircle2, AlertCircle } from 'lucide-react';
import ThemeToggle from '../components/ThemeToggle';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();
      if (response.ok) {
        login(data);
        navigate('/');
      } else {
        setError(data.error || 'Invalid credentials');
      }
    } catch (err) {
      setError('System connection error');
    } finally {
      setIsLoading(false);
    }
  };

  const features = [
    { icon: ShieldCheck, text: "High-Precision Call Auditing" },
    { icon: Activity, text: "Real-time Performance Analytics" },
    { icon: CheckCircle2, text: "Global Quality Standards Compliance" }
  ];

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-slate-50 dark:bg-black selection:bg-indigo-500/30 overflow-hidden font-sans transition-colors duration-500" dir="ltr">
      {/* Left Pane - Branding & Vibe (Visible on desktop) */}
      <div className="hidden lg:flex relative bg-[#0a0a0a] p-24 flex-col justify-between overflow-hidden">
        {/* Abstract Background Elements */}
        <div className="absolute top-0 right-0 w-full h-full opacity-30 pointer-events-none">
          <div className="absolute top-[-20%] right-[-10%] w-[100%] h-[100%] bg-indigo-600/10 rounded-full blur-[160px]" />
          <div className="absolute inset-0 bg-[radial-gradient(#ffffff05_1px,transparent_1px)] bg-[size:32px_32px]" />
          {/* Moving decorative lines */}
          <div className="absolute top-1/4 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-white/5 to-transparent skew-y-12" />
          <div className="absolute bottom-1/4 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-white/5 to-transparent -skew-y-12" />
        </div>

        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
          className="relative z-10"
        >
          <div className="flex items-center gap-4 mb-20">
            <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-[0_0_40px_rgba(255,255,255,0.1)]">
              <ShieldCheck className="text-black" size={24} />
            </div>
            <div className="flex flex-col">
              <span className="text-white font-black tracking-tighter text-2xl uppercase italic leading-none">Swish <span className="text-zinc-500">Global</span></span>
              <span className="text-zinc-600 text-[10px] font-black uppercase tracking-[0.4em] mt-1">Audit Infrastructure</span>
            </div>
          </div>

          <div className="space-y-8 max-w-lg">
            <h1 className="text-7xl font-black text-white tracking-tighter leading-[0.85] mb-8 uppercase italic">
              Swish <br />
              QA <br />
              <span className="text-transparent bg-clip-text bg-[linear-gradient(to_right,theme(colors.indigo.400),theme(colors.indigo.600))]">System.</span>
            </h1>
            <p className="text-zinc-500 text-xl font-medium leading-relaxed max-w-sm">
              The next evolution in quality assurance engineering. Intelligent auditing for top-tier operations.
            </p>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, filter: 'blur(10px)' }}
          animate={{ opacity: 1, filter: 'blur(0px)' }}
          transition={{ duration: 1, delay: 0.6 }}
          className="relative z-10 space-y-12"
        >
          <div className="grid grid-cols-1 gap-8">
            {features.map((item, i) => (
              <div key={i} className="flex items-center gap-6 group">
                <div className="w-12 h-12 flex items-center justify-center rounded-2xl bg-white/5 border border-white/5 text-zinc-500 group-hover:text-indigo-400 group-hover:bg-white/10 transition-all duration-500">
                  <item.icon size={22} />
                </div>
                <div className="flex flex-col">
                  <span className="text-zinc-400 font-black text-[11px] uppercase tracking-widest italic">{item.text}</span>
                  <div className="w-0 group-hover:w-full h-[1px] bg-indigo-500/30 transition-all duration-700 mt-1" />
                </div>
              </div>
            ))}
          </div>

        </motion.div>
      </div>

      {/* Right Pane - Login Form */}
      <div className="relative flex flex-col justify-center items-center p-8 sm:p-12 lg:p-24 bg-white dark:bg-[#0a0a0a] overflow-y-auto">
        {/* Subtle decorative ring for light mode */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] border border-slate-100 dark:border-white/5 rounded-full -z-10 pointer-events-none" />
        
        <div className="absolute top-10 right-10">
          <ThemeToggle />
        </div>

        <motion.div 
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-[460px] space-y-16"
        >
          <div className="text-left space-y-6">
            <div className="lg:hidden flex items-center gap-4 mb-12">
              <div className="w-10 h-10 bg-black dark:bg-white rounded-xl flex items-center justify-center">
                <ShieldCheck className="text-white dark:text-black" size={20} />
              </div>
              <span className="text-zinc-900 dark:text-white font-black tracking-tighter text-xl uppercase italic">Swish QA</span>
            </div>
            
            <div className="inline-flex items-center gap-3 px-4 py-2 bg-slate-100 dark:bg-white/5 text-zinc-500 dark:text-zinc-400 rounded-full text-[9px] font-black uppercase tracking-[0.2em] border border-slate-200 dark:border-white/5 shadow-sm">
              <Fingerprint size={14} className="text-indigo-600 dark:text-indigo-400" /> Biometric Identity Bridge
            </div>
            
            <div>
              <h2 className="text-5xl font-black text-zinc-900 dark:text-white tracking-tighter uppercase italic leading-[0.9]">
                Operator <br />
                <span className="text-indigo-600">Verification</span>
              </h2>
              <p className="text-zinc-400 dark:text-zinc-500 font-bold text-xs uppercase tracking-widest mt-4 ml-1">
                Establish secure connection to the audit mainframe
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-8">
            <div className="space-y-10">
              <div className="group space-y-3 relative">
                <label className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.3em] ml-1 flex items-center gap-2">
                  <User size={12} className="group-focus-within:text-indigo-600 transition-colors" /> User Name
                </label>
                <input
                  type="text"
                  className="w-full bg-slate-50/50 dark:bg-zinc-900/50 border-b-2 border-slate-200 dark:border-zinc-800 px-6 py-5 text-sm font-black text-zinc-900 dark:text-white outline-none focus:border-indigo-600 focus:bg-white dark:focus:bg-zinc-900 transition-all placeholder:text-zinc-300 dark:placeholder:text-zinc-700 italic"
                  placeholder="USERNAME_ID"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </div>

              <div className="group space-y-3 relative">
                <label className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.3em] ml-1 flex items-center gap-2">
                  <Lock size={12} className="group-focus-within:text-indigo-600 transition-colors" /> Password
                </label>
                <input
                  type="password"
                  className="w-full bg-slate-50/50 dark:bg-zinc-900/50 border-b-2 border-slate-200 dark:border-zinc-800 px-6 py-5 text-sm font-black text-zinc-900 dark:text-white outline-none focus:border-indigo-600 focus:bg-white dark:focus:bg-zinc-900 transition-all placeholder:text-zinc-300 dark:placeholder:text-zinc-700"
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            <AnimatePresence mode="wait">
              {error && (
                <motion.div 
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  className="bg-rose-50 dark:bg-rose-500/5 border border-rose-100 dark:border-rose-500/20 text-rose-600 p-5 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-4 italic"
                >
                  <AlertCircle size={18} />
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full group bg-black dark:bg-white text-white dark:text-black py-7 rounded-[2rem] text-[11px] font-black uppercase tracking-[0.4em] flex items-center justify-center gap-4 transition-all active:scale-[0.98] shadow-2xl shadow-indigo-600/10 dark:shadow-white/5 disabled:opacity-50 italic overflow-hidden relative"
            >
              <div className="absolute inset-0 bg-indigo-600 translate-y-full group-hover:translate-y-0 transition-transform duration-500" />
              <span className="relative z-10 flex items-center gap-4 group-hover:text-white transition-colors">
                {isLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    DECRYPTING...
                  </>
                ) : (
                  <>
                    Log In
                    <ChevronRight size={18} className="group-hover:translate-x-2 transition-transform duration-500" />
                  </>
                )}
              </span>
            </button>
          </form>
        </motion.div>
      </div>
    </div>
  );
}
