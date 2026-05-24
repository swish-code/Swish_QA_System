import { LucideIcon } from 'lucide-react';
import { motion } from 'motion/react';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: string;
  trendUp?: boolean;
  color: 'purple' | 'blue' | 'green' | 'orange' | 'red';
}

export default function StatCard({ title, value, icon: Icon, trend, color }: StatCardProps) {
  return (
    <motion.div 
      whileHover={{ y: -2 }}
      className="bg-card dark:bg-zinc-900/40 border border-card-border dark:border-zinc-800 p-6 rounded-2xl shadow-sm dark:shadow-none transition-all duration-300"
    >
      <div className="text-zinc-600 dark:text-zinc-500 text-[10px] font-black uppercase tracking-widest mb-2 flex items-center gap-2">
        <Icon size={12} className={
          color === 'red' ? 'text-rose-500' : 
          color === 'green' ? 'text-emerald-500' : 
          'text-indigo-600 dark:text-indigo-400'
        } />
        {title}
      </div>
      <div className={`text-4xl font-light tracking-tighter ${color === 'red' ? 'text-rose-500' : 'text-zinc-900 dark:text-zinc-100'}`}>
        {value}
      </div>
      {trend && (
        <div className={`text-[10px] font-bold mt-2 ${trend.startsWith('+') || trend.startsWith('↑') ? 'text-emerald-500' : 'text-rose-400/60'}`}>
          {trend} {trend.includes('%') ? 'from last month' : ''}
        </div>
      )}
    </motion.div>
  );
}
