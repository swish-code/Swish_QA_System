import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { motion, AnimatePresence } from 'motion/react';
import { 
  FileCheck, 
  ChevronLeft, 
  ChevronRight, 
  Save, 
  AlertCircle, 
  Info, 
  History, 
  XCircle, 
  Bell,
  Clock,
  User,
  ShieldCheck,
  Zap,
  Mic2,
  Heart,
  Target,
  FileText,
  Search,
  Check
} from 'lucide-react';
import { User as UserType } from '../types';
import { useParams, useNavigate } from 'react-router-dom';

const COMMON_ISSUES = [
  'Wrong Order', 'No Upselling', 'Incomplete Info', 'Delay', 'Poor Listening',
  'System Navigation Error', 'Confirmation Step Missed', 'Policy Compliance Issue'
];

export default function EvaluationForm() {
  const { user } = useAuth();
  const { id } = useParams();
  const navigate = useNavigate();
  const [agents, setAgents] = useState<UserType[]>([]);
  const [escalationHistory, setEscalationHistory] = useState<any[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showActionModal, setShowActionModal] = useState(false);
  const [actionComment, setActionComment] = useState('');
  const [pendingAction, setPendingAction] = useState<'approved' | 'escalated' | 'rejected' | null>(null);

  const [formStructure, setFormStructure] = useState<any[]>([]);
  const [formData, setFormData] = useState<any>({
    agent_id: '',
    evaluator_id: user?.id || '',
    brand: '',
    call_type: 'New Order',
    call_direction: '',
    call_category: '',
    call_duration: '',
    date: new Date().toISOString().split('T')[0],
    responses: {},
    common_issues: [],
    error_classification: '',
    ctq_checked: false,
    feedback: {
      general: '',
      internal: '',
      process: '',
      problem_solving: '',
      empathy: '',
      efficiency: '',
      error_description: ''
    },
    status: 'Pending Review'
  });

  const [formOptions, setFormOptions] = useState<any>({
    brand: [],
    call_direction: [],
    call_category: [],
    call_type: [],
    agent: []
  });

  useEffect(() => {
    fetchFormOptions();
  }, []);

  const fetchFormOptions = async () => {
    try {
      const res = await fetch('/api/settings/form');
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const settings = await res.json();
      
      const options: any = {
        brand: [],
        call_direction: [],
        call_category: [],
        call_type: [],
        agent: []
      };

      const sections = settings.filter((s: any) => s.field_type === 'eval_section' && s.is_active);
      const questions = settings.filter((s: any) => s.field_type === 'eval_question' && s.is_active);

      const dynamicStructure = sections.sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0)).map((section: any) => {
        const sectionQuestions = questions.filter((q: any) => {
          try {
            const config = typeof q.value === 'string' ? JSON.parse(q.value) : q.value;
            return config.section === section.value;
          } catch {
            return false;
          }
        }).sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0)).map((q: any) => {
          const config = typeof q.value === 'string' ? JSON.parse(q.value) : q.value;
          return {
            id: q.id.toString(),
            db_value: q.value,
            label: q.label_en,
            label_ar: q.label_ar,
            weight: config.weight,
            critical: config.critical
          };
        });

        return {
          id: section.value,
          title: section.label_en,
          title_ar: section.label_ar,
          items: sectionQuestions
        };
      }).filter((s: any) => s.items.length > 0);

      setFormStructure(dynamicStructure);

      settings.filter((s: any) => s.is_active).forEach((s: any) => {
        if (options[s.field_type]) {
          options[s.field_type].push({
            id: s.id,
            label: s.label_en,
            value: s.value,
            label_ar: s.label_ar
          });
        }
      });

      setFormOptions(options);

      // Set defaults for new evaluations
      if (!id) {
        setFormData((prev: any) => ({
          ...prev,
          brand: options.brand[0]?.value || '',
          call_direction: options.call_direction[0]?.value || '',
          call_category: options.call_category[0]?.value || '',
          call_type: options.call_type[0]?.value || 'New Order'
        }));
      }
    } catch (err) {
      console.error("Error fetching form options:", err);
    }
  };

  const isReadOnly = id && !(
    (formData.status === 'Escalated' && (user?.role === 'qa' || user?.role === 'supervisor'))
  );
  
  const isEditMode = id && formData.status === 'Escalated' && (user?.role === 'qa' || user?.role === 'supervisor');
  const isCreation = !id;
  const isViewingOnly = id && !isEditMode;

  useEffect(() => {
    fetch('/api/users')
      .then(res => {
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        return res.json();
      })
      .then(data => setAgents(data.filter((u: UserType) => u.role === 'agent')))
      .catch(err => console.error("Error fetching users:", err));
    
    if (id) {
      const fetchEvaluation = async () => {
        try {
          const eRes = await fetch(`/api/evaluations?user_id=${user?.id}&role=${user?.role}`);
          if (!eRes.ok) throw new Error(`HTTP error! status: ${eRes.status}`);
          const result = await eRes.json();
          const eData = result.data || [];
          const found = eData.find((e: any) => e.id === parseInt(id));
          if (found) {
            const parsedData = typeof found.data === 'string' ? JSON.parse(found.data) : found.data;
            // Ensure the top-level status from the database overrides any status stored inside the data JSON
            setFormData({
              ...found,
              ...parsedData,
              status: found.status,
              responses: parsedData.responses || {}
            });
          }

          const hRes = await fetch(`/api/evaluations/${id}/escalation-history`);
          if (!hRes.ok) throw new Error(`HTTP error! status: ${hRes.status}`);
          const hData = await hRes.json();
          setEscalationHistory(hData);
        } catch (err) {
          console.error("Error fetching evaluation details:", err);
        }
      };
      fetchEvaluation();
    }
  }, [id]);

  const handleToggleFailure = (itemId: string) => {
    if (isReadOnly) return;
    const current = formData.responses[itemId];
    // If it's currently 'No' (Failure), toggle back to 'Yes' (Success)
    // If it's anything else (Yes or N/A), toggle to 'No' (Failure)
    setFormData(prev => ({
      ...prev,
      responses: { ...prev.responses, [itemId]: current === 'No' ? 'Yes' : 'No' }
    }));
  };

  const handleToggleNA = (itemId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (isReadOnly) return;
    const current = formData.responses[itemId];
    setFormData(prev => ({
      ...prev,
      responses: { ...prev.responses, [itemId]: current === 'N/A' ? 'Yes' : 'N/A' }
    }));
  };

  const toggleCommonIssue = (issue: string) => {
    if (isReadOnly) return;
    setFormData(prev => ({
      ...prev,
      common_issues: prev.common_issues.includes(issue)
        ? prev.common_issues.filter(i => i !== issue)
        : [...prev.common_issues, issue]
    }));
  };

  const calculateScore = () => {
    let totalPossible = 0;
    let totalDeductions = 0;
    let isCriticalFailed = false;

    formStructure.forEach(section => {
      section.items.forEach((item: any) => {
        const response = formData.responses[item.id] || 'Yes';
        
        if (response === 'N/A') return;

        totalPossible += item.weight;

        if (response === 'No') {
          totalDeductions += item.weight;
          if (item.critical) isCriticalFailed = true;
        }
      });
    });

    if (isCriticalFailed) return 0;
    
    return Math.max(0, 100 - totalDeductions);
  };

  const handleSubmit = async () => {
    if (!formData.agent_id) {
      alert('Please select an agent.');
      return;
    }

    setIsSubmitting(true);
    let isCriticalFailed = false;
    formStructure.forEach(section => {
      section.items.forEach((item: any) => {
        if (formData.responses[item.id] === 'No' && item.critical) {
          isCriticalFailed = true;
        }
      });
    });

    const score = calculateScore();
    const payload: any = {
      ...formData,
      final_score: score,
      critical_failure: isCriticalFailed,
      qa_id: user?.id,
      data: {
        ...formData,
        responses: formData.responses
      }
    };
    
    // For existing evaluations (updates), we keep the status or the server might handle it
    // But for new ones, the server explicitly sets it based on score
    if (!id) {
      delete payload.status;
    }

    const url = isCreation ? '/api/evaluations' : `/api/evaluations/${id}`;
    const method = isCreation ? 'POST' : 'PUT';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        alert(`Evaluation ${isCreation ? 'submitted' : 'updated'} successfully! Final Score: ${score}%`);
        navigate('/');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleWorkflowAction = async () => {
    if ((pendingAction === 'escalated' || pendingAction === 'rejected') && !actionComment.trim()) {
      alert('Comment is mandatory for this action.');
      return;
    }

    setIsSubmitting(true);
    try {
      let endpoint = '';
      let payload: any = {
        user_id: user?.id,
        comment: actionComment,
        action: pendingAction
      };

      if (user?.role === 'tl') {
        endpoint = `/api/evaluations/${id}/tl-action`;
      } else if (user?.role === 'qa' || user?.role === 'supervisor') {
        endpoint = `/api/evaluations/${id}/qa-action`;
        if (pendingAction === 'approved') {
          payload.newData = {
            final_score: calculateScore(),
            critical_failure: false, // Calculate from responses if needed
            data: { ...formData, responses: formData.responses }
          };
        }
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        alert(`Action ${pendingAction} completed.`);
        navigate('/');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
      setShowActionModal(false);
    }
  };

  return (
    <div className="max-w-[1200px] mx-auto pb-20 space-y-12 font-sans bg-white/40 dark:bg-black/40 p-4 md:p-8 rounded-[3rem] border border-zinc-200 dark:border-zinc-800/40 shadow-sm dark:shadow-2xl backdrop-blur-xl transition-colors duration-300">
      {/* Workflow Action Modal */}
      <AnimatePresence>
        {showActionModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/90 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-zinc-900 border border-zinc-800 rounded-[2.5rem] p-10 w-full max-w-lg shadow-[0_0_80px_rgba(0,0,0,0.8)] relative overflow-hidden"
            >
              {/* Subtle gradient accent */}
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-emerald-500 to-transparent opacity-50" />
              
              <h3 className="text-2xl font-black text-white uppercase tracking-tighter mb-8 text-center">
                CONFIRM ACTION: <span className="text-emerald-500">{pendingAction?.toUpperCase()}</span>
              </h3>

              <div className="space-y-6">
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block ml-2">
                    Add Comment {(pendingAction === 'escalated' || pendingAction === 'rejected') && <span className="text-rose-500 font-bold">*</span>}
                  </label>
                  <div className="relative group">
                    <textarea 
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl p-6 text-sm text-white h-44 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 transition-all resize-none placeholder:text-zinc-700 shadow-inner"
                      placeholder="Enter your detailed reasoning here..."
                      value={actionComment}
                      onChange={(e) => setActionComment(e.target.value)}
                    />
                    <div className="absolute top-4 right-4 pointer-events-none opacity-20 group-focus-within:opacity-40 transition-opacity">
                      <FileText size={18} className="text-zinc-500" />
                    </div>
                  </div>
                </div>

                <div className="flex gap-4 pt-4">
                  <button 
                    onClick={() => setShowActionModal(false)}
                    className="flex-1 py-4 rounded-xl bg-zinc-800 text-zinc-400 font-black text-[10px] uppercase tracking-widest border border-zinc-700 hover:bg-zinc-700 hover:text-white transition-all active:scale-[0.98]"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleWorkflowAction}
                    disabled={isSubmitting}
                    className="flex-1 py-4 rounded-xl bg-emerald-600 text-white font-black text-[10px] uppercase tracking-widest shadow-xl shadow-emerald-500/20 hover:bg-emerald-500 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                  >
                    {isSubmitting ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>Confirm {pendingAction}</>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Header Block */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white dark:bg-zinc-950/80 p-8 rounded-[2rem] border border-zinc-100 dark:border-zinc-800 relative shadow-sm dark:shadow-inner overflow-hidden transition-colors duration-300">
        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-600/5 blur-[80px] -z-10" />
        <div className="flex items-center gap-4">
          <div className="p-3 bg-indigo-500/10 rounded-2xl border border-indigo-500/20 text-indigo-600 dark:text-emerald-500">
            <Zap size={24} className="animate-pulse" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-zinc-900 dark:text-white tracking-tighter uppercase leading-none">New Evaluation Form</h1>
            <p className="text-zinc-400 dark:text-zinc-500 text-[10px] font-black uppercase tracking-[0.2em] mt-2">Precision Audit Interface v2.4</p>
          </div>
        </div>

        <div className="mt-6 md:mt-0 flex items-center gap-10">
          <div className="text-right">
            <p className="text-[10px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-widest mb-1">Total Score</p>
            <div className="flex items-center gap-3">
              <span className={`text-4xl font-black tracking-tighter ${calculateScore() >= 90 ? 'text-emerald-500' : calculateScore() >= 75 ? 'text-amber-500' : 'text-rose-500'}`}>
                {calculateScore()}%
              </span>
              <div className="w-12 h-12 rounded-full border-4 border-zinc-100 dark:border-zinc-900 flex items-center justify-center relative">
                 <div className="absolute inset-0 rounded-full border-2 border-emerald-500/10" />
                 <Check className="text-indigo-600 dark:text-emerald-500" size={24} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {isReadOnly && (
        <div className="bg-amber-500/10 border border-amber-500/20 p-6 rounded-3xl flex items-center gap-4">
          <ShieldCheck className="text-amber-500" size={24} />
          <div>
            <h4 className="text-sm font-black text-amber-500 uppercase tracking-widest">Read Only Mode</h4>
            <p className="text-[10px] text-zinc-400 font-medium">This interaction has been finalized and cannot be modified.</p>
          </div>
        </div>
      )}

      {/* 1. EVALUATION SUMMARY */}
      <section className="bg-white/40 dark:bg-zinc-950/40 rounded-[2.5rem] border border-zinc-200 dark:border-zinc-900 p-8 space-y-8 transition-colors duration-300">
        <div className="flex items-center gap-3 pb-6 border-b border-zinc-100 dark:border-zinc-900">
          <div className="w-[1px] h-4 bg-indigo-600 dark:bg-emerald-500" />
          <h2 className="text-[11px] font-black text-indigo-600 dark:text-emerald-500 uppercase tracking-[0.3em]">Evaluation Summary</h2>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="space-y-3">
            <label className="text-[9px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-widest block">Agent Name</label>
            <select 
              value={formData.agent_id}
              disabled={isReadOnly}
              onChange={(e) => setFormData({...formData, agent_id: e.target.value})}
              className="w-full bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-xl px-4 py-3 text-xs text-zinc-800 dark:text-white focus:border-indigo-500 outline-none transition-all appearance-none"
            >
              <option value="">Select Agent</option>
              {agents.map(a => <option key={a.id} value={a.id}>{a.display_name}</option>)}
            </select>
          </div>
          <div className="space-y-3">
            <label className="text-[9px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-widest block">Evaluator</label>
            <div className="px-4 py-3 bg-white dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800 rounded-xl text-xs text-zinc-500 dark:text-zinc-400">
              {user?.display_name || 'System Evaluator'}
            </div>
          </div>
          <div className="space-y-3">
            <label className="text-[9px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-widest block">Call Date</label>
            <input 
              type="date"
              value={formData.date}
              disabled={isReadOnly}
              onChange={(e) => setFormData({...formData, date: e.target.value})}
              className="w-full bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-xl px-4 py-3 text-xs text-zinc-800 dark:text-white focus:border-indigo-500 outline-none transition-all dark:inverted-date-icon" 
            />
          </div>
          <div className="space-y-3">
            <label className="text-[9px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-widest block">Call Type</label>
            <select 
              value={formData.call_type}
              disabled={isReadOnly}
              onChange={(e) => setFormData({...formData, call_type: e.target.value})}
              className="w-full bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-xl px-4 py-3 text-xs text-zinc-800 dark:text-white focus:border-indigo-500 outline-none transition-all"
            >
              <option value="">Select Type</option>
              {formOptions.call_type.map((opt: any) => (
                <option key={opt.id || opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* 2. CALL METADATA */}
      <section className="bg-white/40 dark:bg-zinc-950/40 rounded-[2.5rem] border border-zinc-200 dark:border-zinc-900 p-8 space-y-8 transition-colors duration-300">
        <div className="flex items-center gap-3 pb-6 border-b border-zinc-100 dark:border-zinc-900">
          <div className="w-[1px] h-4 bg-indigo-600 dark:bg-emerald-500" />
          <h2 className="text-[11px] font-black text-indigo-600 dark:text-emerald-500 uppercase tracking-[0.3em]">Call Metadata</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="space-y-3">
            <label className="text-[9px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-widest block">Brand</label>
            <select 
              value={formData.brand}
              disabled={isReadOnly}
              onChange={(e) => setFormData({...formData, brand: e.target.value})}
              className="w-full bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-xl px-4 py-3 text-xs text-zinc-800 dark:text-white outline-none"
            >
              <option value="">Select Brand</option>
              {formOptions.brand.map((opt: any) => (
                <option key={opt.id || opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-3">
            <label className="text-[9px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-widest block">Call Direction</label>
            <select 
              value={formData.call_direction}
              disabled={isReadOnly}
              onChange={(e) => setFormData({...formData, call_direction: e.target.value})}
              className="w-full bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-xl px-4 py-3 text-xs text-zinc-800 dark:text-white outline-none"
            >
              <option value="">Select Direction</option>
              {formOptions.call_direction.map((opt: any) => (
                <option key={opt.id || opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-3">
            <label className="text-[9px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-widest block">Call Category</label>
            <select 
              value={formData.call_category}
              disabled={isReadOnly}
              onChange={(e) => setFormData({...formData, call_category: e.target.value})}
              className="w-full bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-xl px-4 py-3 text-xs text-zinc-800 dark:text-white outline-none"
            >
              <option value="">Select Category</option>
              {formOptions.call_category.map((opt: any) => (
                <option key={opt.id || opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-3 md:col-span-1">
            <label className="text-[9px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-widest block">Call Duration</label>
            <input 
              type="text"
              placeholder="e.g. 05:30"
              value={formData.call_duration}
              disabled={isReadOnly}
              onChange={(e) => setFormData({...formData, call_duration: e.target.value})}
              className="w-full bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-xl px-4 py-3 text-xs text-zinc-800 dark:text-white outline-none placeholder:text-zinc-300 dark:placeholder:text-zinc-700"
            />
          </div>
        </div>
      </section>

      {/* SCORING SECTIONS 3-7 */}
      {formStructure.map((section, idx) => (
        <section key={section.id} className="space-y-6">
          <div className="flex items-center gap-4 ml-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 dark:bg-emerald-500/10 border border-indigo-500/20 dark:border-emerald-500/20 flex items-center justify-center text-indigo-600 dark:text-emerald-500 text-xs font-black">
              0{idx + 3}
            </div>
            <h2 className="text-[12px] font-black text-zinc-800 dark:text-white px-3 py-1 bg-white/50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg uppercase tracking-widest transition-colors duration-300">
              {section.title}
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {section.items.map((item: any) => (
              <div 
                key={item.id} 
                className="group flex flex-col md:flex-row md:items-center justify-between p-6 bg-white/40 dark:bg-zinc-900/20 border border-zinc-200 dark:border-zinc-900 rounded-[1.5rem] hover:border-indigo-500/30 dark:hover:border-emerald-500/30 transition-all hover:bg-white/60 dark:hover:bg-zinc-900/30 shadow-sm"
              >
                <div className="flex items-center gap-4">
                  <div className="flex flex-col">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200 group-hover:text-zinc-900 dark:group-hover:text-white transition-colors">{item.label}</span>
                      <span className="px-1.5 py-0.5 rounded-md bg-rose-500/5 dark:bg-rose-500/10 border border-rose-500/10 text-[8px] font-black text-rose-500 dark:text-rose-400">
                        -{item.weight}%
                      </span>
                      {item.critical && (
                        <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-rose-500/10 border border-rose-500/10 text-[8px] font-black text-rose-500">
                          <AlertCircle size={10} /> CRITICAL
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-6 mt-4 md:mt-0">
                   {/* N/A Toggle */}
                   <button
                     onClick={(e) => handleToggleNA(item.id, e)}
                     disabled={isReadOnly}
                     className={`px-3 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all ${
                       formData.responses[item.id] === 'N/A'
                         ? 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                         : 'text-zinc-700 hover:text-zinc-500 hover:bg-zinc-900/50'
                     }`}
                   >
                     N/A
                   </button>

                   {/* Main Failure Switch */}
                   <div 
                      onClick={() => handleToggleFailure(item.id)}
                      className={`relative w-14 h-7 rounded-full border cursor-pointer transition-all flex items-center ${
                        formData.responses[item.id] === 'No'
                          ? 'bg-rose-600/20 border-rose-500/50'
                          : 'bg-zinc-200 dark:bg-zinc-950 border-zinc-300 dark:border-zinc-800'
                      } ${formData.responses[item.id] === 'N/A' ? 'opacity-20 pointer-events-none' : ''} ${isReadOnly ? 'cursor-default' : ''}`}
                   >
                      <div className={`absolute left-1 w-5 h-5 rounded-full transition-all flex items-center justify-center ${
                        formData.responses[item.id] === 'No'
                          ? 'translate-x-7 bg-rose-500 shadow-lg shadow-rose-500/40'
                          : 'bg-white dark:bg-zinc-800 shadow-sm dark:shadow-inner'
                      }`}>
                        {formData.responses[item.id] === 'No' && <XCircle size={10} className="text-white" />}
                      </div>
                      <span className={`absolute right-2 text-[7px] font-black uppercase tracking-tighter transition-opacity ${
                        formData.responses[item.id] === 'No' ? 'opacity-0' : 'opacity-40 text-zinc-500 dark:text-zinc-400'
                      }`}>
                        PASS
                      </span>
                      <span className={`absolute left-2 text-[7px] font-black uppercase tracking-tighter transition-opacity ${
                        formData.responses[item.id] === 'No' ? 'opacity-100 text-rose-600 dark:text-rose-200' : 'opacity-0'
                      }`}>
                        FAIL
                      </span>
                   </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}

      {/* FINAL DETAILS SECTION 8 */}
      <section className="bg-white/40 dark:bg-zinc-950/40 rounded-[3rem] border border-zinc-200 dark:border-zinc-900 p-10 space-y-12 transition-colors duration-300 shadow-sm">
        <div className="flex items-center gap-3 ml-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 dark:bg-emerald-500/10 border border-indigo-500/20 dark:border-emerald-500/20 flex items-center justify-center text-indigo-600 dark:text-emerald-500 text-xs font-black">
              08
            </div>
            <h2 className="text-[12px] font-black text-zinc-800 dark:text-white px-3 py-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg uppercase tracking-widest">
              FINAL DETAILS
            </h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          <div className="space-y-8">
            <div className="space-y-4">
              <label className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest block">Common Issues</label>
              <div className="flex flex-wrap gap-2">
                {COMMON_ISSUES.map(issue => (
                  <button
                    key={issue}
                    disabled={isReadOnly}
                    onClick={() => toggleCommonIssue(issue)}
                    className={`px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase border transition-all ${
                      formData.common_issues.includes(issue)
                        ? 'bg-indigo-600/10 border-indigo-500/40 text-indigo-600 dark:text-indigo-400'
                        : 'bg-white dark:bg-zinc-900 border-zinc-100 dark:border-zinc-800 text-zinc-500 hover:border-zinc-300 dark:hover:border-zinc-700'
                    }`}
                  >
                    {issue}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <label className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest block">Error Classification</label>
              <div className="grid grid-cols-1 gap-2">
                {['Critical to CST', 'Critical to Business', 'Non-Critical'].map(err => (
                  <button
                    key={err}
                    disabled={isReadOnly}
                    onClick={() => setFormData({...formData, error_classification: err})}
                    className={`text-left px-5 py-3 rounded-2xl text-xs font-medium border transition-all ${
                      formData.error_classification === err
                        ? 'bg-zinc-100 dark:bg-zinc-900 border-indigo-500/40 text-zinc-900 dark:text-white shadow-sm'
                        : 'bg-white dark:bg-zinc-950/40 border-zinc-100 dark:border-zinc-900 text-zinc-400 dark:text-zinc-500'
                    }`}
                  >
                    {err}
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-4">
              <label className="flex items-center gap-4 cursor-pointer group">
                <div className="relative w-12 h-6 flex items-center">
                  <input 
                    type="checkbox" 
                    className="sr-only p-2"
                    checked={formData.ctq_checked}
                    disabled={isReadOnly}
                    onChange={(e) => setFormData({...formData, ctq_checked: e.target.checked})}
                  />
                  <div className={`w-full h-full rounded-full border border-zinc-100 dark:border-zinc-800 transition-colors ${formData.ctq_checked ? 'bg-emerald-600 border-emerald-500' : 'bg-white dark:bg-zinc-950'}`} />
                  <div className={`absolute w-4 h-4 rounded-full bg-white shadow-sm transition-all ${formData.ctq_checked ? 'left-7' : 'left-1'}`} />
                </div>
                <span className="text-[10px] font-black text-zinc-400 dark:text-zinc-400 uppercase tracking-widest group-hover:text-zinc-900 dark:group-hover:text-white transition-colors">CTQ (Critical to Quality) Checked</span>
              </label>
            </div>
          </div>

          <div className="space-y-8">
            <div className="space-y-4">
              <label className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest block">Notes & Feedback</label>
              <textarea 
                className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-900 rounded-3xl p-5 text-sm text-zinc-700 dark:text-zinc-300 outline-none focus:border-indigo-500/40 h-32 resize-none placeholder:text-zinc-300 dark:placeholder:text-zinc-800"
                placeholder="Enter detailed feedback for the agent..."
                value={formData.feedback.general}
                readOnly={isReadOnly}
                onChange={(e) => setFormData({...formData, feedback: {...formData.feedback, general: e.target.value}})}
              />
            </div>
            <div className="space-y-4">
              <label className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest block">Data for Agent (Internal)</label>
              <textarea 
                className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-900 rounded-3xl p-5 text-sm text-zinc-700 dark:text-zinc-300 outline-none focus:border-indigo-500/40 h-32 resize-none placeholder:text-zinc-300 dark:placeholder:text-zinc-800"
                placeholder="Internal notes for the agent..."
                value={formData.feedback.internal}
                readOnly={isReadOnly}
                onChange={(e) => setFormData({...formData, feedback: {...formData.feedback, internal: e.target.value}})}
              />
            </div>
          </div>
        </div>
      </section>

      {/* DETAILED FEEDBACK SECTION 9 */}
      <section className="bg-white/40 dark:bg-zinc-950/40 rounded-[3rem] border border-zinc-200 dark:border-zinc-900 p-10 space-y-12 transition-colors duration-300 shadow-sm">
        <div className="flex items-center gap-3 ml-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 dark:bg-emerald-500/10 border border-indigo-500/20 dark:border-emerald-500/20 flex items-center justify-center text-indigo-600 dark:text-emerald-500 text-xs font-black">
              09
            </div>
            <h2 className="text-[12px] font-black text-zinc-800 dark:text-white px-3 py-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg uppercase tracking-widest">
              DETAILED FEEDBACK
            </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
           {[
             { id: 'process', label: 'Process to Adherence' },
             { id: 'problem_solving', label: 'Problem Solving & Accuracy' },
             { id: 'empathy', label: 'Empathy & Soft Skills' },
             { id: 'efficiency', label: 'Efficiency & Call Management' },
           ].map(fb => (
            <div key={fb.id} className="space-y-4">
              <label className="text-[10px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-widest block ml-2">{fb.label}</label>
              <textarea 
                className="w-full bg-white dark:bg-zinc-950/60 border border-zinc-100 dark:border-zinc-900 rounded-[1.5rem] p-5 text-xs text-zinc-800 dark:text-zinc-400 outline-none focus:border-indigo-500/20 dark:focus:border-emerald-500/20 h-24 resize-none placeholder:text-zinc-300 dark:placeholder:text-zinc-800 transition-all focus:bg-white dark:focus:bg-zinc-950"
                placeholder={`Enter ${fb.label.toLowerCase()} feedback...`}
                readOnly={isReadOnly}
                value={(formData.feedback as any)[fb.id]}
                onChange={(e) => setFormData({...formData, feedback: {...formData.feedback, [fb.id]: e.target.value}})}
              />
            </div>
           ))}
           <div className="md:col-span-2 space-y-4">
              <label className="text-[10px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-widest block ml-2">Error Description</label>
              <textarea 
                className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-900 rounded-[1.5rem] p-5 text-xs text-zinc-800 dark:text-zinc-400 outline-none focus:border-rose-500/20 h-24 resize-none"
                placeholder="Enter detailed error description..."
                readOnly={isReadOnly}
                value={formData.feedback.error_description}
                onChange={(e) => setFormData({...formData, feedback: {...formData.feedback, error_description: e.target.value}})}
              />
           </div>
        </div>
      </section>

      {/* Buttons */}
      <div className="flex justify-end items-center gap-4">
         <button 
           onClick={() => navigate('/')}
           className="px-12 py-4 rounded-2xl bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-500 font-black text-[10px] uppercase tracking-[0.2em] hover:text-zinc-900 dark:hover:text-white transition-all shadow-sm dark:shadow-xl"
         >
           Close
         </button>

         {/* QA Initial Submit */}
         {!id && (user?.role === 'qa' || user?.role === 'supervisor') && (
           <button 
             onClick={handleSubmit}
             disabled={isSubmitting}
             className="px-12 py-4 rounded-2xl bg-emerald-600 text-white font-black text-[10px] uppercase tracking-[0.2em] shadow-2xl shadow-emerald-500/20 hover:bg-emerald-500 transition-all flex items-center gap-3 disabled:opacity-50"
           >
             {isSubmitting ? 'Processing...' : 'Submit Evaluation'} <Save size={16} />
           </button>
         )}

         {/* TL Review Actions */}
         {id && formData.status === 'Pending Review' && (user?.role === 'tl' || user?.role === 'supervisor') && (
           <div className="flex gap-4">
             <button 
               onClick={() => { setPendingAction('approved'); setActionComment(''); setShowActionModal(true); }}
               className="px-8 py-4 rounded-2xl bg-emerald-600 text-white font-black text-[10px] uppercase tracking-[0.2em] shadow-xl shadow-emerald-500/20"
             >
               Approve Interaction
             </button>
             <button 
               onClick={() => { setPendingAction('escalated'); setActionComment(''); setShowActionModal(true); }}
               className="px-8 py-4 rounded-2xl bg-rose-600 text-white font-black text-[10px] uppercase tracking-[0.2em] shadow-xl shadow-rose-500/20"
             >
               Escalate to QA
             </button>
           </div>
         )}

         {/* QA Re-evaluation Actions (Moved) */}
      </div>

      {escalationHistory.length > 0 && (
        <div className="glass-card p-10 mt-12 border-l-4 border-indigo-500 shadow-[0_0_50px_rgba(99,102,241,0.05)]">
          <div className="flex items-center justify-between mb-10 pb-6 border-b border-zinc-800/50">
            <div className="flex items-center gap-3">
              <History size={20} className="text-indigo-400" />
              <h3 className="text-sm font-black text-white uppercase tracking-[0.2em]">Escalation Audit Trail</h3>
            </div>
            
            {/* QA Decision Buttons - Moved for maximum visibility with extra glow */}
            {id && formData.status === 'Escalated' && (user?.role === 'qa' || user?.role === 'supervisor') && (
              <div className="flex gap-3 bg-indigo-500/10 p-2 rounded-2xl border border-indigo-500/20 shadow-[0_0_20px_rgba(99,102,241,0.15)] animate-pulse">
                <button 
                  onClick={() => { setPendingAction('approved'); setActionComment(''); setShowActionModal(true); }}
                  className="px-6 py-2.5 rounded-xl bg-emerald-600 text-white font-black text-[10px] uppercase tracking-widest shadow-lg shadow-emerald-500/40 hover:scale-105 transition-all flex items-center gap-2"
                >
                  <Check size={14} /> Approve & Save
                </button>
                <button 
                  onClick={() => { setPendingAction('rejected'); setActionComment(''); setShowActionModal(true); }}
                  className="px-6 py-2.5 rounded-xl bg-rose-600 text-white font-black text-[10px] uppercase tracking-widest shadow-lg shadow-rose-500/40 hover:scale-105 transition-all flex items-center gap-2"
                >
                  <XCircle size={14} /> Reject Escalation
                </button>
              </div>
            )}
          </div>

          <div className="space-y-8">
            {escalationHistory.map((step, idx) => (
              <div key={idx} className="flex gap-6 relative">
                {idx !== escalationHistory.length - 1 && (
                  <div className="absolute left-[15px] top-10 bottom-0 w-[1px] bg-zinc-200 dark:bg-zinc-800 transition-colors" />
                )}
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 z-10 border ${
                  step.action === 'escalated' ? 'bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-500' :
                  step.action === 'approved' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-500' :
                  'bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-500'
                }`}>
                  {step.action === 'escalated' ? <Bell size={14} /> : step.action === 'approved' ? <Save size={14} /> : <AlertCircle size={14} />}
                </div>
                <div className="flex-1 pb-4">
                   <div className="flex justify-between items-start mb-2">
                      <p className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                        {step.user_name} <span className="text-zinc-400 dark:text-zinc-600 uppercase text-[9px] font-black ml-2 tracking-widest">({step.role})</span>
                      </p>
                      <span className="text-[10px] text-zinc-400 dark:text-zinc-600 font-medium">{new Date(step.created_at).toLocaleString()}</span>
                   </div>
                   <p className="text-[11px] text-zinc-600 dark:text-zinc-400 mb-3 italic bg-zinc-50 dark:bg-black/20 p-3 rounded-xl border border-zinc-100 dark:border-zinc-900/50 transition-colors">"{step.comment || 'No comment provided'}"</p>
                   <div className="flex items-center gap-3">
                      <div className={`px-3 py-1 rounded-md text-[8px] font-black uppercase tracking-widest ${
                         step.action === 'escalated' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-500' :
                         step.action === 'approved' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-500' :
                         'bg-rose-500/10 text-rose-600 dark:text-rose-500'
                      }`}>
                         Decision: {step.action}
                      </div>

                      {step.old_score !== undefined && step.new_score !== undefined && (
                        <div className="flex items-center gap-2 bg-zinc-50 dark:bg-zinc-900/50 px-2 py-1 rounded-md border border-zinc-200 dark:border-zinc-800 transition-colors">
                          <span className="text-[9px] text-zinc-400 dark:text-zinc-500 font-mono italic">{step.old_score}%</span>
                          <ChevronRight size={10} className="text-zinc-300 dark:text-zinc-700" />
                          <span className={`text-[10px] font-black font-mono ${
                            step.new_score > step.old_score ? 'text-emerald-600 dark:text-emerald-400' : 
                            step.new_score < step.old_score ? 'text-rose-600 dark:text-rose-400' : 'text-zinc-500 dark:text-zinc-300'
                          }`}>{step.new_score}%</span>
                        </div>
                      )}
                   </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
