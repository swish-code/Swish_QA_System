export type UserRole = 'supervisor' | 'cc_supervisor' | 'qa' | 'tl' | 'agent';
export type Department = 'Swish' | 'Mishmash' | 'FM' | 'Complain' | 'TEC';

export interface User {
  id: number;
  display_name: string;
  username: string;
  role: UserRole;
  department: Department;
  tl_id?: number | null;
  /** TL only: the Call-Center Supervisor this TL reports to. */
  cc_supervisor_id?: number | null;
  status: 'active' | 'inactive';
  /** QA scope — list of department names this QA may view (deny-by-default if empty). */
  allowed_departments?: string[];
  /** QA scope — list of brand values this QA may view (deny-by-default if empty). */
  allowed_brands?: string[];
}

export interface FormConfig {
  id: number;
  label: string;
  field_type: 'text' | 'number' | 'select' | 'checkbox';
  options?: any;
  section: 'Data for Call' | 'Call Type' | 'Quality Metrics' | 'Call Details' | 'Agent Info';
  required: boolean;
  call_type: string;
}

/** Snapshot of the most relevant coaching session attached to an evaluation
 *  (completed first, then most recently created). Null when none exists. */
export interface CoachingSnapshot {
  id: number;
  status: string;
  tl_id: number;
  tl_name: string;
  agent_id: number;
  agent_name: string;
  tl_comment: string;
  /** Auto-generated list of failed evaluation items + QA notes from the call. */
  error_description?: string;
  created_at: string;
  agent_approved_at: string | null;
  session_started_at: string | null;
  completed_at: string | null;
}

export interface Evaluation {
  id: number;
  date: string;
  agent_id: number;
  agent_name?: string;
  qa_id: number;
  qa_name?: string;
  brand: string;
  call_type: string;
  final_score: number;
  status:
    | 'Pending Review'        // score < 90 — waiting for TL to approve / escalate. Hidden from Agent.
    | 'Sent to Agent'          // score ≥ 90 auto, or TL approved a low-score one. Visible to Agent.
    | 'Escalated'              // TL escalated back to Quality. Hidden from Agent.
    | 'Quality Approved'       // QA approved after a TL escalation. Visible to Agent.
    | 'Rejected by Quality'    // QA rejected after a TL escalation. Visible to Agent.
    | 'Approved'               // legacy — kept for old rows.
    | 'Reevaluated'            // legacy — kept for old rows.
    | 'Reevaluation Rejected'; // legacy — kept for old rows.
  critical_failure: boolean;
  data: Record<string, any>;
  /** Server-attached coaching summary. Null = call has never been coached. */
  coaching?: CoachingSnapshot | null;
  /** Agent-initiated escalation (dispute) lifecycle. Null = never requested. */
  agent_escalation_status?: 'pending' | 'approved' | 'rejected' | null;
  /** The Agent's reason when they requested the escalation. */
  agent_escalation_reason?: string | null;
  /** The TL's comment when approving / rejecting the agent's request. */
  agent_escalation_response?: string | null;
}

export interface Notification {
  id: number;
  user_id: number;
  title: string;
  message: string;
  evaluation_id: number;
  is_read: boolean;
  created_at: string;
}

export interface CoachingSession {
  id: number;
  agent_id: number;
  tl_id: number;
  weaknesses: string;
  notes: string;
  plan: string;
  status: 'open' | 'closed';
  created_at: string;
}
