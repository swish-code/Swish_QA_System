import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
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
  Check,
  Bookmark,
  Sparkles
} from 'lucide-react';
import { User as UserType } from '../types';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { notifyDraftsChanged } from '../context/DraftsContext';

const COMMON_ISSUES = [
  'Wrong Order', 'No Upselling', 'Incomplete Info', 'Delay', 'Poor Listening',
  'System Navigation Error', 'Confirmation Step Missed', 'Policy Compliance Issue'
];

// Reasons a QA can attach to a manual "Mark as Critical" zero-score override.
// Shown in a modal when the toggle is flipped on — the QA must pick at least
// one before the score is locked at 0.
const CRITICAL_FAILURE_REASONS = [
  'Misinformation',
  'Call Disconnect',
  'Privacy Breach',
  'No Escalation',
  'Wrong Order',
  'Abusive Language',
  'False Promise',
  'No Documentation',
  'Record Falsification',
  'Critical SOP Violation',
  'Customer Neglect',
  'Unapproved Commitment',
];

// Error-category badge tones — mirror the definitions shown on the Info page
// (CTC / CTB / CTS / NON) so evaluators can see each attribute's category
// while scoring the call.
const CATEGORY_TONES: Record<string, string> = {
  CTC: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30',
  CTB: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30',
  CTS: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30',
  NON: 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/30',
};

export default function EvaluationForm() {
  const { user } = useAuth();
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const draftIdParam = searchParams.get('draft');
  const [agents, setAgents] = useState<UserType[]>([]);
  const [escalationHistory, setEscalationHistory] = useState<any[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  // Controls the Critical Failure reason picker modal.
  const [showCriticalModal, setShowCriticalModal] = useState(false);
  // Draft selection inside the modal — only committed to formData on confirm.
  const [criticalReasonDraft, setCriticalReasonDraft] = useState<string[]>([]);

  // Floating score chip — shows when the header score scrolls out of view.
  // We watch the header card with IntersectionObserver and flip a flag.
  const headerRef = useRef<HTMLDivElement>(null);
  const [showStickyScore, setShowStickyScore] = useState(false);
  useEffect(() => {
    const el = headerRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const obs = new IntersectionObserver(
      (entries) => {
        // Show the chip when the header score is NO LONGER intersecting
        // the viewport (user has scrolled past it).
        setShowStickyScore(!entries[0].isIntersecting);
      },
      { threshold: 0, rootMargin: '-60px 0px 0px 0px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  // Tracks the draft this form is currently bound to. When set, Save as Draft
  // updates the existing record instead of creating a new one, and a successful
  // submit marks the draft 'completed' server-side.
  const [activeDraftId, setActiveDraftId] = useState<number | null>(
    draftIdParam ? parseInt(draftIdParam, 10) : null
  );
  const [showActionModal, setShowActionModal] = useState(false);
  const [actionComment, setActionComment] = useState('');
  const [pendingAction, setPendingAction] = useState<'approved' | 'escalated' | 'rejected' | null>(null);

  const [formStructure, setFormStructure] = useState<any[]>([]);
  // Raw eval_section + eval_question rows from form_settings — kept so the
  // structure can be rebuilt whenever formData.call_type changes (each
  // call type has its own attribute list and weights per the QA Manual).
  const [rawSections, setRawSections] = useState<any[]>([]);
  const [rawQuestions, setRawQuestions] = useState<any[]>([]);

  // Single source of truth for the empty-form shape — used at mount AND
  // when Save-as-Draft wipes the form so the user can start fresh.
  const buildEmptyForm = useCallback(() => ({
    agent_id: '',
    evaluator_id: user?.id || '',
    brand: '',
    call_type: 'New Order',
    call_direction: '',
    call_category: '',
    call_duration: '',
    customer_phone: '',
    date: new Date().toISOString().split('T')[0],
    responses: {},
    common_issues: [],
    error_classification: '',
    ctq_checked: false,
    // When the QA flips this, the score is forced to 0 regardless of the
    // pass/fail toggles. Used for "Critical Failure" overrides.
    force_zero_score: false,
    // QA-selected reasons that justify the forced zero (multi-select).
    // Empty when force_zero_score is false.
    critical_failure_reasons: [] as string[],
    // QA marks an exceptional call as WOW — surfaces on /wow-calls.
    is_wow: false,
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
  }), [user?.id]);

  const [formData, setFormData] = useState<any>(() => buildEmptyForm());

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

  // Rebuild formStructure whenever the raw rows OR the selected call type
  // change. Each question carries the call_types it applies to and the
  // weights_by_type map, both seeded from the QA Manual scorecards.
  // Falls back gracefully for legacy questions that don't have these
  // fields — they apply to every call type with their static weight.
  useEffect(() => {
    if (!rawSections.length || !rawQuestions.length) return;
    const selected = formData.call_type;

    const structure = rawSections
      .sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0))
      .map((section: any) => {
        const items = rawQuestions
          .map((q: any) => {
            let cfg: any = {};
            try { cfg = typeof q.value === 'string' ? JSON.parse(q.value) : q.value; } catch {}
            if (cfg.section !== section.value) return null;

            // Call-type filter — a question with call_types = [] or
            // missing applies to every call type (legacy compat).
            const callTypes: string[] = Array.isArray(cfg.call_types) ? cfg.call_types : [];
            if (callTypes.length > 0 && selected && !callTypes.includes(selected)) {
              return null;
            }

            // Pick the per-call-type weight when available; fall back to
            // the legacy single weight.
            const weight = cfg.weights_by_type && selected && cfg.weights_by_type[selected] != null
              ? Number(cfg.weights_by_type[selected])
              : Number(cfg.weight) || 0;

            return {
              id: q.id.toString(),
              db_value: q.value,
              label: q.label_en,
              label_ar: q.label_ar,
              weight,
              critical: !!cfg.critical,
              category: cfg.category || null,
            };
          })
          .filter(Boolean)
          .sort((a: any, b: any) => (b.weight || 0) - (a.weight || 0));
        return {
          id: section.value,
          title: section.label_en,
          title_ar: section.label_ar,
          items,
        };
      })
      .filter((s: any) => s.items.length > 0);

    setFormStructure(structure);
  }, [rawSections, rawQuestions, formData.call_type]);

  // Restore a draft if /evaluate?draft=<id> was used.
  useEffect(() => {
    if (!draftIdParam || !user) return;
    const draftId = parseInt(draftIdParam, 10);
    if (Number.isNaN(draftId)) return;

    const loadDraft = async () => {
      try {
        const params = new URLSearchParams({
          user_id: String(user.id),
          role: user.role,
        });
        const res = await fetch(`/api/drafts/${draftId}?${params}`);
        if (!res.ok) {
          if (res.status === 404 || res.status === 410) {
            alert('This draft no longer exists.');
            navigate('/evaluate', { replace: true });
          }
          return;
        }
        const draft = await res.json();
        if (draft?.data) {
          // Merge so any newly-added defaults survive (e.g., force_zero_score
          // for old drafts that pre-date the Mark-as-Critical button).
          setFormData((prev: any) => ({
            ...prev,
            ...draft.data,
            responses: draft.data.responses || {},
            common_issues: draft.data.common_issues || [],
            feedback: { ...prev.feedback, ...(draft.data.feedback || {}) },
          }));
          setActiveDraftId(draftId);
        }
      } catch (err) {
        console.error('Failed to restore draft', err);
      }
    };
    loadDraft();
  }, [draftIdParam, user, navigate]);

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

      // Keep the raw rows in state so the call-type-driven rebuild can
      // run later without re-fetching. The actual structure is computed
      // in the call-type-aware useEffect below.
      setRawSections(sections);
      setRawQuestions(questions);

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

      // QA scope — strip brands this user isn't allowed to evaluate.
      // Matches the backend's tri-state semantic: an EMPTY allowed_brands
      // array means "unrestricted" (legacy user or scope never configured),
      // so we only filter when the array has at least one entry. Same rule
      // applies if the stored brand isn't in the active list any more (e.g.
      // after a brand rename) — we just show the full active list rather
      // than locking the QA out of every brand.
      if (user?.role === 'qa') {
        const allowed: string[] = (user as any).allowed_brands || [];
        if (allowed.length > 0) {
          const intersection = options.brand.filter((b: any) => allowed.includes(b.value));
          if (intersection.length > 0) {
            options.brand = intersection;
          }
          // else: stale config (none of the QA's allowed brands are still
          // active) → leave the full list so the form is usable.
        }
      }

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

  // QA edit mode — opened via the pencil icon (?edit=1). Lets a supervisor edit
  // any call, but a QA only their own; the save is change-tracked. A QA who
  // deep-links ?edit=1 to another QA's call stays read-only (and the server
  // rejects the write anyway).
  const isQaEdit = !!id && searchParams.get('edit') === '1' && (
    user?.role === 'supervisor' ||
    (user?.role === 'qa' && Number(formData.qa_id) === Number(user?.id))
  );

  const isReadOnly = id && !(
    (formData.status === 'Escalated' && (user?.role === 'qa' || user?.role === 'supervisor')) ||
    isQaEdit
  );

  const isEditMode = id && (formData.status === 'Escalated' || isQaEdit) && (user?.role === 'qa' || user?.role === 'supervisor');
  const isCreation = !id;
  const isViewingOnly = id && !isEditMode;

  useEffect(() => {
    fetch('/api/users')
      .then(res => {
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        return res.json();
      })
      .then(data => {
        // QA scope: filter agents down to those whose department is in the
        // caller's allowed list. Same tri-state rule as the brand filter:
        // an empty allowed list = unrestricted (legacy or unconfigured),
        // and if filtering wipes out every option we fall back to the full
        // list so the form is never unusable.
        const allowedDeps: string[] = user?.role === 'qa' ? ((user as any).allowed_departments || []) : [];
        let agentsOnly = data.filter((u: UserType) => u.role === 'agent');
        if (user?.role === 'qa' && allowedDeps.length > 0) {
          const scoped = agentsOnly.filter((u: UserType) => allowedDeps.includes(u.department));
          if (scoped.length > 0) agentsOnly = scoped;
        }
        setAgents(agentsOnly);
      })
      .catch(err => console.error("Error fetching users:", err));
    
    if (id) {
      const fetchEvaluation = async () => {
        try {
          // Pull a wide page so the evaluation is found regardless of how many
          // exist — the default 10-row page silently dropped any call beyond
          // the first page (loaded an empty form showing a false 100%). The
          // list endpoint still applies all role/scope visibility rules, so a
          // caller only ever finds an evaluation they're allowed to open.
          const eRes = await fetch(`/api/evaluations?user_id=${user?.id}&role=${user?.role}&limit=100000&page=1`);
          if (!eRes.ok) throw new Error(`HTTP error! status: ${eRes.status}`);
          const result = await eRes.json();
          const eData = result.data || [];
          const found = eData.find((e: any) => e.id === parseInt(id));
          if (found) {
            const parsedData = typeof found.data === 'string' ? JSON.parse(found.data) : found.data;
            // Merge with previous defaults so missing fields (common_issues, feedback subfields) don't crash JSX
            setFormData((prev: any) => ({
              ...prev,
              ...found,
              ...parsedData,
              status: found.status,
              responses: parsedData?.responses || {},
              common_issues: parsedData?.common_issues || [],
              feedback: { ...prev.feedback, ...(parsedData?.feedback || {}) }
            }));
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
    // Hard override: QA explicitly marked the call as a critical failure
    // via the "Mark as Critical" button. That's the only path to 0.
    if (formData.force_zero_score) return 0;

    // Per the QA Manual:
    //   Final Score = Σ(weights of passed attributes) / Σ(all weights) × 100
    //
    // Failing an attribute flagged CRITICAL no longer auto-zeros the call.
    // Critical attributes still carry their full weight as a deduction
    // (so failing FCR & Escalation costs you 10 points, not 100), but
    // turning a single toggle off shouldn't wipe the entire score — the
    // QA can use "Mark as Critical" explicitly when a true Leads-to-Zero
    // violation occurs.
    //
    // N/A responses are excluded from BOTH numerator and denominator so
    // they don't pull the score down for cases where an attribute simply
    // doesn't apply to this call.
    let totalWeight = 0;
    let passedWeight = 0;

    formStructure.forEach(section => {
      section.items.forEach((item: any) => {
        const response = formData.responses[item.id] || 'Yes';
        if (response === 'N/A') return;

        const w = Number(item.weight) || 0;
        totalWeight += w;
        if (response !== 'No') {
          // 'Yes' counts as a pass.
          passedWeight += w;
        }
      });
    });

    if (totalWeight === 0) return 100;
    return Math.max(0, Math.round((passedWeight / totalWeight) * 100));
  };

  // Save the current form as a draft without submitting / scoring.
  // - If we're already bound to an existing draft, update it in place.
  // - Otherwise create a new draft and bind to it (so subsequent clicks
  //   keep updating instead of creating duplicates).
  const handleSaveDraft = async () => {
    if (isSavingDraft) return;
    setIsSavingDraft(true);
    try {
      const body: any = {
        owner_id: user?.id,
        user_id: user?.id,
        role: user?.role,
        agent_id: formData.agent_id || null,
        brand: formData.brand || null,
        call_type: formData.call_type || null,
        data: formData,
      };

      let res: Response;
      if (activeDraftId) {
        res = await fetch(`/api/drafts/${activeDraftId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      } else {
        res = await fetch('/api/drafts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      await res.json();
      notifyDraftsChanged();

      // After saving, blow the form back to its empty state so the QA can
      // immediately start a fresh evaluation. We re-apply the default
      // brand / call_type / etc. that fetchFormOptions seeded at mount —
      // those would otherwise stay blank since the load effect only fires
      // once. Also drop the active draft id and the ?draft= URL param so
      // the next Save creates a brand-new draft instead of overwriting.
      setFormData({
        ...buildEmptyForm(),
        brand: formOptions.brand[0]?.value || '',
        call_direction: formOptions.call_direction[0]?.value || '',
        call_category: formOptions.call_category[0]?.value || '',
        call_type: formOptions.call_type[0]?.value || 'New Order',
      });
      setActiveDraftId(null);
      if (draftIdParam) {
        navigate('/evaluate', { replace: true });
      }

      alert('Draft saved. Open it later from the Drafts panel in the header.');
    } catch (err: any) {
      console.error(err);
      alert(`Failed to save draft: ${err.message || err}`);
    } finally {
      setIsSavingDraft(false);
    }
  };

  const handleSubmit = async () => {
    if (!formData.agent_id) {
      alert('Please select an agent.');
      return;
    }

    setIsSubmitting(true);
    // Manual zero-score override also counts as a critical failure
    // so the server-side flag and downstream reports stay consistent.
    let isCriticalFailed = !!formData.force_zero_score;
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
      // Identifies the editor so the server records a change-tracked edit
      // entry when updating an existing call (ignored on creation).
      editor_id: id ? user?.id : undefined,
      // When submitting from a restored draft, the server marks that draft
      // as 'completed' so it disappears from the side panel.
      draft_id: activeDraftId || undefined,
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
        // Refresh the drafts badge — server marked the draft 'completed'.
        if (activeDraftId) notifyDraftsChanged();
        alert(`Evaluation ${isCreation ? 'submitted' : 'updated'} successfully! Final Score: ${score}%`);

        // QA logging a NEW call: reset the form and stay so they can log the
        // next call immediately, instead of bouncing to the dashboard. Edits
        // and escalation reviews keep their existing navigation.
        if (isCreation && user?.role === 'qa') {
          setFormData({
            ...buildEmptyForm(),
            brand: formOptions.brand[0]?.value || '',
            call_direction: formOptions.call_direction[0]?.value || '',
            call_category: formOptions.call_category[0]?.value || '',
            call_type: formOptions.call_type[0]?.value || 'New Order',
          });
          setActiveDraftId(null);
          if (draftIdParam) navigate('/evaluate', { replace: true });
          window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
          navigate(isCreation ? '/' : '/audits');
        }
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

  // --------------------------------------------------------------
  // Critical Failure reason picker — must pick ≥1 reason to confirm
  // --------------------------------------------------------------
  const toggleCriticalReason = (r: string) => {
    setCriticalReasonDraft(prev =>
      prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r]
    );
  };

  const confirmCriticalReasons = () => {
    setFormData((prev: any) => ({
      ...prev,
      force_zero_score: true,
      critical_failure_reasons: criticalReasonDraft,
    }));
    setShowCriticalModal(false);
  };

  const clearCriticalOverride = () => {
    setFormData((prev: any) => ({
      ...prev,
      force_zero_score: false,
      critical_failure_reasons: [],
    }));
    setCriticalReasonDraft([]);
    setShowCriticalModal(false);
  };

  const criticalModal = showCriticalModal ? createPortal(
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-4 sm:p-6 bg-black/70 backdrop-blur-md overflow-y-auto"
      onClick={() => setShowCriticalModal(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-[2rem] w-full max-w-lg shadow-2xl my-auto overflow-hidden"
      >
        <div className="h-1 w-full bg-gradient-to-r from-transparent via-rose-500 to-transparent" />

        {/* Header */}
        <div className="p-6 border-b border-zinc-100 dark:border-zinc-900 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-2xl bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30">
              <AlertCircle size={18} />
            </div>
            <div>
              <h3 className="text-lg font-black text-zinc-900 dark:text-white uppercase tracking-tighter leading-tight">Critical Failure</h3>
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-500 mt-1">
                Pick at least one reason to force the score to 0
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowCriticalModal(false)}
            className="p-2 rounded-lg text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 hover:text-rose-500 transition-colors"
            aria-label="Close"
          >
            <XCircle size={18} />
          </button>
        </div>

        {/* Reason checkboxes */}
        <div className="p-6 max-h-[50vh] overflow-y-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {CRITICAL_FAILURE_REASONS.map((reason) => {
              const checked = criticalReasonDraft.includes(reason);
              return (
                <button
                  key={reason}
                  type="button"
                  onClick={() => toggleCriticalReason(reason)}
                  className={`flex items-center gap-2 p-3 rounded-xl border text-left transition-all ${
                    checked
                      ? 'bg-rose-500/10 border-rose-500/40 text-rose-700 dark:text-rose-300'
                      : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:border-rose-400/40 hover:bg-rose-50/50 dark:hover:bg-rose-950/20'
                  }`}
                >
                  <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                    checked
                      ? 'bg-rose-600 border-rose-600'
                      : 'bg-transparent border-zinc-300 dark:border-zinc-700'
                  }`}>
                    {checked && <Check size={10} className="text-white" />}
                  </div>
                  <span className="text-xs font-bold">{reason}</span>
                </button>
              );
            })}
          </div>

          <p className="text-[10px] font-bold text-zinc-400 dark:text-zinc-600 mt-4 italic">
            Selected reasons are saved with the evaluation and shown to the agent and TL.
          </p>
        </div>

        {/* Footer */}
        <div className="p-6 pt-4 border-t border-zinc-100 dark:border-zinc-900 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3">
          {/* Remove the override entirely (only meaningful when currently ON) */}
          {formData.force_zero_score ? (
            <button
              type="button"
              onClick={clearCriticalOverride}
              className="px-4 py-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-black text-[10px] uppercase tracking-widest transition-colors"
            >
              Remove Override
            </button>
          ) : <span />}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setShowCriticalModal(false)}
              className="px-4 py-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-black text-[10px] uppercase tracking-widest transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmCriticalReasons}
              disabled={criticalReasonDraft.length === 0}
              className="px-5 py-2.5 rounded-xl bg-rose-600 text-white font-black text-[10px] uppercase tracking-widest shadow-lg shadow-rose-500/20 hover:bg-rose-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              <AlertCircle size={12} />
              Apply Zero Score ({criticalReasonDraft.length})
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  ) : null;

  const actionModal = showActionModal ? createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-black/70 backdrop-blur-md overflow-y-auto"
      onClick={() => setShowActionModal(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[2rem] sm:rounded-[2.5rem] p-6 sm:p-8 lg:p-10 w-full max-w-lg shadow-2xl dark:shadow-[0_0_80px_rgba(0,0,0,0.8)] relative overflow-hidden my-auto"
      >
          {/* Subtle gradient accent */}
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-emerald-500 to-transparent opacity-50" />

          <h3 className="text-lg sm:text-xl md:text-2xl font-black text-zinc-900 dark:text-white uppercase tracking-tighter mb-6 sm:mb-8 text-center">
            CONFIRM ACTION: <span className="text-emerald-600 dark:text-emerald-500">{pendingAction?.toUpperCase()}</span>
          </h3>

          <div className="space-y-6">
            <div className="space-y-3">
              <label className="text-[10px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-widest block ml-2">
                Add Comment {(pendingAction === 'escalated' || pendingAction === 'rejected') && <span className="text-rose-500 font-bold">*</span>}
              </label>
              <div className="relative group">
                <textarea
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 sm:p-6 text-sm text-zinc-900 dark:text-white h-32 sm:h-44 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 resize-none placeholder:text-zinc-400 dark:placeholder:text-zinc-700 shadow-inner"
                  placeholder="Enter your detailed reasoning here..."
                  value={actionComment}
                  onChange={(e) => setActionComment(e.target.value)}
                />
                <div className="absolute top-4 right-4 pointer-events-none opacity-20 group-focus-within:opacity-40 transition-opacity">
                  <FileText size={18} className="text-zinc-500" />
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 pt-2 sm:pt-4">
              <button
                onClick={() => setShowActionModal(false)}
                className="flex-1 py-3 sm:py-4 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 font-black text-[10px] uppercase tracking-widest border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-700 hover:text-zinc-900 dark:hover:text-white transition-all active:scale-[0.98]"
              >
                Cancel
              </button>
              <button
                onClick={handleWorkflowAction}
                disabled={isSubmitting}
                className="flex-1 py-3 sm:py-4 rounded-xl bg-emerald-600 text-white font-black text-[10px] uppercase tracking-widest shadow-xl shadow-emerald-500/20 hover:bg-emerald-500 transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {isSubmitting ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>Confirm {pendingAction}</>
                )}
              </button>
            </div>
          </div>
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <div className="max-w-[1200px] mx-auto pb-20 space-y-12 font-sans bg-white/95 dark:bg-black/95 p-4 md:p-8 rounded-[3rem] border border-zinc-200 dark:border-zinc-800/40 shadow-sm dark:shadow-2xl">
      {actionModal}
      {criticalModal}

      {/* Floating sticky score — appears when the header score scrolls out */}
      {showStickyScore && (() => {
        const score = calculateScore();
        const tone =
          score >= 90 ? 'text-emerald-500 border-emerald-500/30 bg-emerald-500/10'
          : score >= 75 ? 'text-amber-500 border-amber-500/30 bg-amber-500/10'
          : 'text-rose-500 border-rose-500/30 bg-rose-500/10';
        return (
          <div
            className="fixed top-24 right-4 sm:right-6 z-40 pointer-events-none"
            aria-hidden
          >
            <div className={`pointer-events-auto flex items-center gap-3 px-4 py-2.5 rounded-2xl border backdrop-blur-md shadow-xl shadow-zinc-900/10 dark:shadow-black/40 ${tone} animate-in fade-in slide-in-from-top-2 duration-200`}>
              <div className="flex flex-col items-end">
                <span className="text-[9px] font-black uppercase tracking-widest opacity-70 leading-none">Score</span>
                <span className="text-2xl font-black tracking-tighter leading-none mt-0.5">{score}%</span>
              </div>
              {formData.force_zero_score && (
                <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-rose-600 text-white">
                  Critical
                </span>
              )}
            </div>
          </div>
        );
      })()}

      {/* Header Block */}
      <div ref={headerRef} className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white dark:bg-zinc-950/80 p-4 sm:p-6 lg:p-8 rounded-[2rem] border border-zinc-100 dark:border-zinc-800 relative shadow-sm dark:shadow-inner overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-600/5 blur-[80px] -z-10" />
        <div className="flex items-center gap-4">
          <div className="p-3 bg-indigo-500/10 rounded-2xl border border-indigo-500/20 text-indigo-600 dark:text-emerald-500">
            <Zap size={24} className="animate-pulse" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-zinc-900 dark:text-white tracking-tighter uppercase leading-none">New Evaluation Form</h1>
            <p className="text-zinc-400 dark:text-zinc-500 text-[10px] font-black uppercase tracking-[0.2em] mt-2">Precision Audit Interface v2.4</p>
            {activeDraftId && (
              <div className="inline-flex items-center gap-1.5 mt-2 px-2 py-0.5 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400">
                <Bookmark size={10} />
                <span className="text-[9px] font-black uppercase tracking-widest">Restored from draft #{activeDraftId}</span>
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 md:mt-0 flex items-center gap-6 sm:gap-10 flex-wrap">
          <button
            type="button"
            disabled={isReadOnly}
            onClick={() => {
              // Prime the modal's draft with any reasons already saved on
              // the form so editing keeps the prior selections.
              setCriticalReasonDraft(formData.critical_failure_reasons || []);
              setShowCriticalModal(true);
            }}
            title={formData.force_zero_score
              ? 'Critical failure override is ON — click to edit reasons or remove it'
              : 'Force the total score to 0 (Critical Failure override)'}
            className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all flex items-center gap-2 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${
              formData.force_zero_score
                ? 'bg-rose-600 text-white border-rose-500 shadow-lg shadow-rose-500/30 hover:bg-rose-500'
                : 'bg-white dark:bg-zinc-900 text-rose-600 dark:text-rose-400 border-rose-300 dark:border-rose-900/40 hover:bg-rose-50 dark:hover:bg-rose-950/30'
            }`}
          >
            <AlertCircle size={14} />
            {formData.force_zero_score ? 'Critical Failure (Edit)' : 'Mark as Critical (0%)'}
          </button>

          {/* WOW Calls — QA flag for exceptional calls. Toggles instantly
              on already-saved evaluations so it doesn't need a re-submit. */}
          <button
            type="button"
            disabled={isReadOnly}
            onClick={async () => {
              const next = !formData.is_wow;
              setFormData((prev: any) => ({ ...prev, is_wow: next }));
              // If editing a saved evaluation, persist the flag immediately
              // so the WOW Calls page reflects it without waiting for submit.
              if (id) {
                try {
                  await fetch(`/api/evaluations/${id}/wow`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ is_wow: next }),
                  });
                } catch (err) { console.error('WOW toggle failed', err); }
              }
            }}
            title={formData.is_wow ? 'Remove WOW flag' : 'Mark as WOW Call'}
            className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all flex items-center gap-2 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${
              formData.is_wow
                ? 'bg-amber-500 text-white border-amber-400 shadow-lg shadow-amber-500/30 hover:bg-amber-400'
                : 'bg-white dark:bg-zinc-900 text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-900/40 hover:bg-amber-50 dark:hover:bg-amber-950/30'
            }`}
          >
            <Sparkles size={14} className={formData.is_wow ? 'animate-pulse' : ''} />
            {formData.is_wow ? 'WOW Call ✓' : 'WOW Call'}
          </button>

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
            {formData.force_zero_score && (
              <div className="mt-2 max-w-[280px] ml-auto">
                <p className="text-[9px] font-black text-rose-500 uppercase tracking-widest mb-1.5">
                  Critical Failure override
                </p>
                {(formData.critical_failure_reasons || []).length > 0 && (
                  <div className="flex flex-wrap gap-1 justify-end">
                    {formData.critical_failure_reasons.map((r: string) => (
                      <span key={r} className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30">
                        {r}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
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
      <section className="bg-white/40 dark:bg-zinc-950/40 rounded-[2.5rem] border border-zinc-200 dark:border-zinc-900 p-4 sm:p-6 lg:p-8 space-y-6 sm:space-y-8">
        <div className="flex items-center gap-3 pb-6 border-b border-zinc-100 dark:border-zinc-900">
          <div className="w-[1px] h-4 bg-indigo-600 dark:bg-emerald-500" />
          <h2 className="text-[11px] font-black text-indigo-600 dark:text-emerald-500 uppercase tracking-[0.3em]">Evaluation Summary</h2>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 sm:gap-6 lg:gap-8">
          <div className="space-y-3">
            <label className="text-[9px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-widest block">Agent Name</label>
            <select 
              value={formData.agent_id}
              disabled={isReadOnly}
              onChange={(e) => setFormData({...formData, agent_id: e.target.value})}
              className="w-full bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-xl px-4 py-3 text-xs text-zinc-800 dark:text-white focus:border-indigo-500 outline-none appearance-none"
            >
              <option value="">Select Agent</option>
              {agents.map(a => <option key={a.id} value={a.id}>{a.display_name}</option>)}
            </select>
          </div>
          <div className="space-y-3">
            <label className="text-[9px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-widest block">Evaluator</label>
            <div className="px-4 py-3 bg-white dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800 rounded-xl text-xs text-zinc-500 dark:text-zinc-400">
              {/* Existing call → the QA who actually created it; new call → the
                  current user creating it. */}
              {(id ? formData.qa_name : user?.display_name) || 'System Evaluator'}
            </div>
          </div>
          <div className="space-y-3">
            <label className="text-[9px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-widest block">Call Date</label>
            <input 
              type="date"
              value={formData.date}
              disabled={isReadOnly}
              onChange={(e) => setFormData({...formData, date: e.target.value})}
              className="w-full bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-xl px-4 py-3 text-xs text-zinc-800 dark:text-white focus:border-indigo-500 outline-none dark:inverted-date-icon"
            />
          </div>
          <div className="space-y-3">
            <label className="text-[9px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-widest block">Call Type</label>
            <select 
              value={formData.call_type}
              disabled={isReadOnly}
              onChange={(e) => setFormData({...formData, call_type: e.target.value})}
              className="w-full bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-xl px-4 py-3 text-xs text-zinc-800 dark:text-white focus:border-indigo-500 outline-none"
            >
              <option value="">Select Type</option>
              {formOptions.call_type.map((opt: any) => (
                <option key={opt.id || opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          {/* Registration time — recorded automatically by the system when the
              call is logged. Distinct from Call Date (which the QA types and
              may set to the actual call day). Read-only. */}
          <div className="space-y-3">
            <label className="text-[9px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-widest block">Registered On</label>
            <div className="w-full bg-white dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800 rounded-xl px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-2">
              <Clock size={12} className="text-indigo-500 dark:text-emerald-500 shrink-0" />
              <span className="truncate">
                {formData.created_at
                  ? new Date(formData.created_at).toLocaleString()
                  : 'Set automatically on submit'}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* 2. CALL METADATA */}
      <section className="bg-white/40 dark:bg-zinc-950/40 rounded-[2.5rem] border border-zinc-200 dark:border-zinc-900 p-4 sm:p-6 lg:p-8 space-y-6 sm:space-y-8">
        <div className="flex items-center gap-3 pb-6 border-b border-zinc-100 dark:border-zinc-900">
          <div className="w-[1px] h-4 bg-indigo-600 dark:bg-emerald-500" />
          <h2 className="text-[11px] font-black text-indigo-600 dark:text-emerald-500 uppercase tracking-[0.3em]">Call Metadata</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 lg:gap-8">
          <div className="space-y-3 md:col-span-3">
            <label className="text-[9px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-widest block">
              Customer Phone Number <span className="text-rose-500">*</span>
            </label>
            <input
              type="tel"
              inputMode="tel"
              placeholder="e.g. +965 9999 9999"
              value={formData.customer_phone}
              disabled={isReadOnly}
              onChange={(e) => setFormData({ ...formData, customer_phone: e.target.value })}
              className="w-full bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-xl px-4 py-3 text-xs text-zinc-800 dark:text-white outline-none placeholder:text-zinc-300 dark:placeholder:text-zinc-700 focus:border-indigo-500 dark:focus:border-emerald-500"
            />
          </div>
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
            <h2 className="text-[12px] font-black text-zinc-800 dark:text-white px-3 py-1 bg-white/50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg uppercase tracking-widest">
              {section.title}
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {section.items.map((item: any) => (
              <div 
                key={item.id} 
                className="group flex flex-col md:flex-row md:items-center justify-between p-6 bg-white/40 dark:bg-zinc-900/20 border border-zinc-200 dark:border-zinc-900 rounded-[1.5rem] hover:border-indigo-500/30 dark:hover:border-emerald-500/30 hover:bg-white/60 dark:hover:bg-zinc-900/30 shadow-sm"
              >
                <div className="flex items-center gap-4">
                  <div className="flex flex-col">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200 group-hover:text-zinc-900 dark:group-hover:text-white transition-colors">{item.label}</span>
                      <span className="px-1.5 py-0.5 rounded-md bg-rose-500/5 dark:bg-rose-500/10 border border-rose-500/10 text-[8px] font-black text-rose-500 dark:text-rose-400">
                        -{item.weight}%
                      </span>
                      {item.category && (
                        <span
                          className={`px-1.5 py-0.5 rounded-md border text-[8px] font-black uppercase tracking-wider ${CATEGORY_TONES[String(item.category).toUpperCase()] || CATEGORY_TONES.NON}`}
                          title="Error category — see the Info page for what each code means"
                        >
                          {item.category}
                        </span>
                      )}
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
                      <div className={`absolute left-1 w-5 h-5 rounded-full flex items-center justify-center ${
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
      <section className="bg-white/40 dark:bg-zinc-950/40 rounded-[3rem] border border-zinc-200 dark:border-zinc-900 p-10 space-y-12 shadow-sm">
        <div className="flex items-center gap-3 ml-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 dark:bg-emerald-500/10 border border-indigo-500/20 dark:border-emerald-500/20 flex items-center justify-center text-indigo-600 dark:text-emerald-500 text-xs font-black">
              08
            </div>
            <h2 className="text-[12px] font-black text-zinc-800 dark:text-white px-3 py-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg uppercase tracking-widest">
              FINAL DETAILS
            </h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 lg:gap-8">
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
                    onClick={() => setFormData({
                      ...formData,
                      // Click the active option again to deselect it.
                      error_classification: formData.error_classification === err ? '' : err,
                    })}
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
      <section className="bg-white/40 dark:bg-zinc-950/40 rounded-[3rem] border border-zinc-200 dark:border-zinc-900 p-10 space-y-12 shadow-sm">
        <div className="flex items-center gap-3 ml-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 dark:bg-emerald-500/10 border border-indigo-500/20 dark:border-emerald-500/20 flex items-center justify-center text-indigo-600 dark:text-emerald-500 text-xs font-black">
              09
            </div>
            <h2 className="text-[12px] font-black text-zinc-800 dark:text-white px-3 py-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg uppercase tracking-widest">
              DETAILED FEEDBACK
            </h2>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:gap-8">
           {/* The four categorised feedback boxes (Process / Problem Solving /
               Empathy / Efficiency) were removed — the QA already captures
               those signals via the failed-question toggles, so the text
               boxes were redundant noise. Error Description is kept because
               it's free-form context that doesn't map to any single question.
               formData.feedback.{process,problem_solving,empathy,efficiency}
               stays in the state object so historical evaluations keep
               loading cleanly. */}
           <div className="space-y-4">
              <label className="text-[10px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-widest block ml-2">Error Description</label>
              <textarea
                className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-900 rounded-[1.5rem] p-5 text-xs text-zinc-800 dark:text-zinc-400 outline-none focus:border-rose-500/20 h-32 resize-none"
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

         {/* QA Save-as-Draft (creation only — restoring a draft is also creation) */}
         {!id && (user?.role === 'qa' || user?.role === 'supervisor') && (
           <button
             onClick={handleSaveDraft}
             disabled={isSavingDraft || isSubmitting}
             className="px-8 py-4 rounded-2xl bg-white dark:bg-zinc-950 border border-indigo-300 dark:border-indigo-900/60 text-indigo-600 dark:text-indigo-400 font-black text-[10px] uppercase tracking-[0.2em] hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-all flex items-center gap-3 disabled:opacity-50"
             title={activeDraftId ? `Update the existing draft (#${activeDraftId})` : 'Save current progress as a draft'}
           >
             {isSavingDraft ? 'Saving…' : (activeDraftId ? 'Update Draft' : 'Save as Draft')} <Bookmark size={14} />
           </button>
         )}

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

         {/* QA Edit — save changes to an existing call (change-tracked) */}
         {isQaEdit && (
           <button
             onClick={handleSubmit}
             disabled={isSubmitting}
             className="px-12 py-4 rounded-2xl bg-indigo-600 text-white font-black text-[10px] uppercase tracking-[0.2em] shadow-2xl shadow-indigo-500/20 hover:bg-indigo-500 transition-all flex items-center gap-3 disabled:opacity-50"
           >
             {isSubmitting ? 'Saving…' : 'Save Changes'} <Save size={16} />
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
        <div className="glass-card p-4 sm:p-6 lg:p-8 mt-8 sm:mb-12 border-l-4 border-indigo-500 shadow-[0_0_50px_rgba(99,102,241,0.05)]">
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
