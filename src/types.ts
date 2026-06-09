export type UserRole = 'supervisor' | 'qa' | 'tl' | 'agent';
export type Department = 'Swish' | 'Mishmash' | 'FM' | 'Complain' | 'TEC';

export interface User {
  id: number;
  display_name: string;
  username: string;
  role: UserRole;
  department: Department;
  tl_id?: number | null;
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
