import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Settings2, Plus, Edit2, Trash2, Save, X, Search, 
  GripVertical, CheckCircle2, AlertCircle, ChevronDown, 
  Globe, LayoutGrid, Tags, PhoneForwarded, MessageSquare, UserPlus,
  ListChecks, HelpCircle
} from 'lucide-react';

interface FormSetting {
  id?: number;
  field_type: string;
  label_en: string;
  label_ar: string;
  value: string;
  is_active: number;
  sort_order: number;
}

const FIELD_GROUPS = [
  { id: 'brand', label: 'Brands', icon: Tags, color: 'text-indigo-400' },
  { id: 'call_direction', label: 'Call Directions', icon: PhoneForwarded, color: 'text-emerald-400' },
  { id: 'call_category', label: 'Call Categories', icon: MessageSquare, color: 'text-rose-400' },
  { id: 'call_type', label: 'Call Types', icon: LayoutGrid, color: 'text-amber-400' },
  { id: 'agent', label: 'Agent Management', icon: UserPlus, color: 'text-sky-400' },
  { id: 'eval_section', label: 'Evaluation Sections', icon: ListChecks, color: 'text-purple-400' },
  { id: 'eval_question', label: 'Evaluation Questions', icon: HelpCircle, color: 'text-orange-400' },
];

export default function FormSettings() {
  const [settings, setSettings] = useState<FormSetting[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newValues, setNewValues] = useState<{ [key: string]: string }>({});

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const res = await fetch('/api/settings/form');
      if (!res.ok) throw new Error('Settings fetch failed');
      const data = await res.json();
      setSettings(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickAdd = async (fieldType: string) => {
    const label = newValues[fieldType];
    if (!label?.trim()) return;

    try {
      const res = await fetch('/api/settings/form', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          field_type: fieldType,
          label_en: label,
          label_ar: '',
          value: label.toUpperCase().replace(/\s+/g, '_'),
          is_active: 1,
          sort_order: settings.filter(s => s.field_type === fieldType).length
        })
      });

      if (res.ok) {
        setNewValues({ ...newValues, [fieldType]: '' });
        loadSettings();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await fetch(`/api/settings/form/${id}`, { method: 'DELETE' });
      loadSettings();
    } catch (err) {
      console.error(err);
    }
  };

  const getSettingsByType = (type: string) => settings.filter(s => s.field_type === type);

  if (isLoading) {
    return (
      <div className="p-20 flex justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8 max-w-[1600px] mx-auto">
      {/* Header Area */}
      <div className="flex flex-col gap-2">
        <h1 className="text-4xl font-black text-zinc-900 dark:text-white tracking-tighter flex items-center gap-4 italic uppercase">
          <div className="w-1.5 h-10 bg-indigo-600 rounded-full" />
          Protocol Engine
        </h1>
        <p className="text-zinc-500 dark:text-zinc-400 text-[10px] font-black uppercase tracking-[0.4em] ml-6">
          System core configuration & audit matrices
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {FIELD_GROUPS.filter(g => g.id !== 'eval_question' && g.id !== 'eval_section').map(group => (
          <div key={group.id} className="glass-card !p-10 flex flex-col gap-8 group/card transition-all hover:bg-white/60 dark:hover:bg-zinc-900/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-3 rounded-2xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 transition-all group-hover/card:scale-110`}>
                  <group.icon size={20} className={group.color} />
                </div>
                <h3 className="text-[11px] font-black text-zinc-900 dark:text-white uppercase tracking-[0.3em] italic">
                  {group.label}
                </h3>
              </div>
            </div>

            {/* Quick Add Input */}
            <div className="flex gap-2">
              <input 
                type="text"
                placeholder={`Deploy new ${group.label.slice(0, -1)}...`}
                className="flex-1 bg-white/50 dark:bg-zinc-950/50 border border-zinc-100 dark:border-zinc-800 rounded-2xl px-6 py-4 text-[11px] font-black text-zinc-900 dark:text-white outline-none focus:border-indigo-500 transition-all placeholder:text-zinc-300 dark:placeholder:text-zinc-800 placeholder:italic placeholder:font-medium shadow-inner"
                value={newValues[group.id] || ''}
                onChange={e => setNewValues({ ...newValues, [group.id]: e.target.value })}
                onKeyDown={e => e.key === 'Enter' && handleQuickAdd(group.id)}
              />
              <button 
                onClick={() => handleQuickAdd(group.id)}
                className="p-4 bg-black dark:bg-white text-white dark:text-black rounded-2xl hover:bg-indigo-600 dark:hover:bg-indigo-600 dark:hover:text-white transition-all shadow-xl shadow-indigo-600/10 active:scale-95"
              >
                <Plus size={20} />
              </button>
            </div>

            {/* Tags Container */}
            <div className="flex flex-wrap gap-3">
              {getSettingsByType(group.id).map(item => (
                <div 
                  key={item.id}
                  className="flex items-center gap-3 px-5 py-2.5 bg-white dark:bg-zinc-900/80 border border-zinc-100 dark:border-zinc-800 rounded-[1.2rem] group transition-all hover:border-indigo-500/20 shadow-sm"
                >
                  <span className="text-[9px] font-black text-zinc-900 dark:text-zinc-200 uppercase tracking-tighter italic">{item.label_en}</span>
                  <button 
                    onClick={() => item.id && handleDelete(item.id)}
                    className="text-zinc-200 hover:text-rose-500 transition-colors bg-zinc-50 dark:bg-zinc-800 p-1.5 rounded-lg"
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
              {getSettingsByType(group.id).length === 0 && (
                <div className="w-full py-8 text-center border border-dashed border-zinc-100 dark:border-zinc-800 rounded-[2rem]">
                  <p className="text-[9px] text-zinc-300 dark:text-zinc-700 font-bold uppercase tracking-widest italic">Registry Offline</p>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Evaluation Structure Section */}
      <div className="grid grid-cols-1 gap-8">
        <div className="glass-card !p-10">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-12">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-purple-600 rounded-2xl flex items-center justify-center shadow-xl shadow-purple-600/20">
                <ListChecks size={24} className="text-white" />
              </div>
              <div>
                <h3 className="text-2xl font-black text-zinc-900 dark:text-white uppercase tracking-tighter italic">Evaluation Matrix</h3>
                <p className="text-zinc-400 dark:text-zinc-500 text-[9px] font-black uppercase tracking-widest mt-1">Personnel assessment protocol parameters</p>
              </div>
            </div>
            
            <div className="flex gap-2 w-full md:w-auto">
              <input 
                type="text"
                placeholder="Initialize Section..."
                className="flex-1 md:w-80 bg-zinc-50 dark:bg-zinc-950/50 border border-zinc-100 dark:border-zinc-800 rounded-2xl px-6 py-4 text-[11px] font-bold text-zinc-900 dark:text-white outline-none focus:border-indigo-500 transition-all font-medium italic"
                value={newValues['eval_section'] || ''}
                onChange={e => setNewValues({ ...newValues, ['eval_section']: e.target.value })}
              />
              <button 
                onClick={() => handleQuickAdd('eval_section')}
                className="px-8 bg-purple-600 text-white rounded-2xl hover:bg-zinc-900 dark:hover:bg-white dark:hover:text-black transition-all shadow-xl shadow-purple-600/20 font-black text-[10px] uppercase tracking-widest italic"
              >
                Add Node
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
             {settings.filter(s => s.field_type === 'eval_section').map(section => (
               <div key={section.id} className="bg-zinc-50/50 dark:bg-white/5 border border-zinc-100 dark:border-zinc-800/50 rounded-[2.5rem] p-8 space-y-8 shadow-sm">
                 <div className="flex items-center justify-between">
                   <div className="flex items-center gap-3">
                      <div className="w-2.5 h-2.5 rounded-full bg-purple-500 shadow-[0_0_12px_rgba(168,85,247,0.5)]" />
                      <h4 className="text-[12px] font-black text-zinc-900 dark:text-white uppercase tracking-tighter italic">{section.label_en}</h4>
                   </div>
                   <button onClick={() => section.id && handleDelete(section.id)} className="p-2.5 bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-xl text-zinc-300 hover:text-rose-500 transition-all shadow-sm"><Trash2 size={16} /></button>
                 </div>
                 
                 {/* Add Question to this Section */}
                 <div className="flex gap-3">
                   <input 
                    type="text" 
                    placeholder="Error Description / Parameter..."
                    className="flex-1 bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-2xl px-5 py-4 text-[11px] font-bold text-zinc-900 dark:text-white outline-none focus:border-indigo-500 transition-all shadow-sm italic"
                    value={newValues[`q_${section.value}`] || ''}
                    onChange={e => setNewValues({ ...newValues, [`q_${section.value}`]: e.target.value })}
                   />
                   <div className="relative">
                    <input 
                      type="number"
                      placeholder="Deduct"
                      className="w-28 bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-2xl px-4 py-4 text-[11px] font-black text-rose-600 dark:text-rose-500 outline-none focus:border-rose-500 transition-all shadow-sm"
                      value={newValues[`q_${section.value}_weight`] || '5'}
                      onChange={e => setNewValues({ ...newValues, [`q_${section.value}_weight`]: e.target.value })}
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-black text-zinc-400 uppercase">%</div>
                   </div>
                   <button 
                    onClick={async () => {
                      const label = newValues[`q_${section.value}`];
                      const weightStr = newValues[`q_${section.value}_weight`] || '5';
                      const weight = parseInt(weightStr);
                      if (!label?.trim()) return;
                      try {
                        const res = await fetch('/api/settings/form', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            field_type: 'eval_question',
                            label_en: label,
                            label_ar: '',
                            value: JSON.stringify({ weight: weight, critical: false, section: section.value }),
                            is_active: 1,
                            sort_order: 0
                          })
                        });
                        if (res.ok) {
                          setNewValues({ ...newValues, [`q_${section.value}`]: '', [`q_${section.value}_weight`]: '5' });
                          loadSettings();
                        }
                      } catch (err) {}
                    }}
                    className="p-4 bg-indigo-600 text-white rounded-2xl hover:bg-zinc-900 dark:hover:bg-white dark:hover:text-black transition-all shadow-xl shadow-indigo-600/20 active:scale-95 flex items-center justify-center min-w-[56px]"
                   >
                     <Plus size={20} />
                   </button>
                 </div>

                 <div className="flex flex-wrap gap-2 pt-4">
                   {settings.filter(s => s.field_type === 'eval_question' && JSON.parse(s.value).section === section.value).map(q => (
                     <div key={q.id} className="flex items-center gap-3 px-5 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800/80 rounded-2xl group transition-all hover:border-indigo-500/20 shadow-sm">
                       <span className="text-[10px] font-black text-zinc-800 dark:text-zinc-200 uppercase tracking-tight">{q.label_en}</span>
                       <div className="flex items-center gap-2">
                         <div className="px-2 py-0.5 bg-rose-500/5 dark:bg-rose-500/10 border border-rose-500/10 rounded-lg">
                           <span className="text-[9px] font-black text-rose-600 dark:text-rose-400 italic">
                             -{JSON.parse(q.value).weight}%
                           </span>
                         </div>
                         <button onClick={() => q.id && handleDelete(q.id)} className="text-zinc-300 group-hover:text-rose-500 transition-colors bg-zinc-50 dark:bg-zinc-800 rounded-md p-1"><X size={10} /></button>
                       </div>
                     </div>
                   ))}
                   {settings.filter(s => s.field_type === 'eval_question' && JSON.parse(s.value).section === section.value).length === 0 && (
                     <div className="w-full py-8 text-center border border-dashed border-zinc-100 dark:border-zinc-800 rounded-[2rem]">
                        <p className="text-[9px] text-zinc-400 font-bold uppercase tracking-widest italic">Matrix Nodes Required</p>
                     </div>
                   )}
                 </div>
               </div>
             ))}
          </div>
        </div>
      </div>
    </div>
  );
}
