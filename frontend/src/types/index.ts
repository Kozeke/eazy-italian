export interface User {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  role: 'student' | 'teacher';
  locale: string;
  email_verified_at?: string;
  notification_prefs: Record<string, any>;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
}

export interface Unit {
  id: number;
  title: string;
  level: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
  description?: string;
  release_at?: string;
  status: 'draft' | 'published' | 'archived';
  order_index: number;
  created_by: number;
  created_at: string;
  updated_at?: string;
  videos?: Video[];
  tasks?: Task[];
  tests?: Test[];
}

export interface Video {
  id: number;
  unit_id: number;
  title: string;
  description?: string;
  source_type: 'file' | 'url';
  file_path?: string;
  external_url?: string;
  duration_sec?: number;
  created_at: string;
  updated_at?: string;
}

export interface Task {
  id: number;
  unit_id: number;
  title: string;
  instructions_rich?: string;
  attachments: string[];
  type: 'manual' | 'auto';
  due_at?: string;
  max_points: number;
  rubric: Record<string, any>;
  auto_check_config: Record<string, any>;
  created_by: number;
  created_at: string;
  updated_at?: string;
  submissions?: TaskSubmission[];
}

export interface TaskSubmission {
  id: number;
  task_id: number;
  student_id: number;
  answers: Record<string, any>;
  attachments: string[];
  submitted_at?: string;
  graded_at?: string;
  grader_id?: number;
  score?: number;
  feedback_rich?: string;
  status: 'draft' | 'submitted' | 'graded';
  task?: Task;
  student?: User;
  grader?: User;
}

export interface Test {
  id: number;
  unit_id?: number;
  title: string;
  description?: string;
  settings: Record<string, any>;
  pass_threshold: number;
  status: 'draft' | 'published' | 'archived';
  created_by: number;
  created_at: string;
  updated_at?: string;
  test_questions?: TestQuestion[];
  attempts?: TestAttempt[];
}

export interface Question {
  id: number;
  bank_tags: string[];
  level: string;
  type: 'multiple_choice' | 'single_choice' | 'gap_fill' | 'matching' | 'ordering' | 'short_answer' | 'listening' | 'reading';
  prompt_rich: string;
  media: string[];
  options: string[];
  correct_answer: string[];
  explanation_rich?: string;
  points: number;
  created_by: number;
  created_at: string;
  updated_at?: string;
}

export interface TestQuestion {
  id: number;
  test_id: number;
  question_id: number;
  order_index: number;
  points?: number;
  question?: Question;
}

export interface TestAttempt {
  id: number;
  test_id: number;
  student_id: number;
  started_at: string;
  submitted_at?: string;
  score?: number;
  detail: Record<string, any>;
  status: 'in_progress' | 'completed' | 'timed_out';
  test?: Test;
  student?: User;
}

export interface Progress {
  id: number;
  student_id: number;
  unit_id: number;
  started_at: string;
  completed_at?: string;
  completion_pct: number;
  total_points: number;
  earned_points: number;
  student?: User;
  unit?: Unit;
}

export interface EmailCampaign {
  id: number;
  title: string;
  template_type?: string;
  subject: string;
  body_rich: string;
  audience_filter: Record<string, any>;
  schedule_at?: string;
  status: 'draft' | 'scheduled' | 'sent' | 'cancelled';
  created_by: number;
  created_at: string;
  updated_at?: string;
  created_by_user?: User;
  email_logs?: EmailLog[];
}

export interface EmailLog {
  id: number;
  campaign_id: number;
  recipient_id: number;
  sent_at: string;
  status: 'pending' | 'sent' | 'failed' | 'bounced';
  error_msg?: string;
  campaign?: EmailCampaign;
  recipient?: User;
}

export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  role?: 'student' | 'teacher';
  locale?: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
}
