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
  status: 'Pending Review' | 'Approved' | 'Escalated' | 'Reevaluated' | 'Reevaluation Rejected' | 'Sent to Agent';
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
