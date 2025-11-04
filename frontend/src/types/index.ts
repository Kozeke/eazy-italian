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
  goals?: string;
  tags?: string[];
  publish_at?: string;
  release_at?: string;
  status: 'draft' | 'published' | 'archived';
  order_index: number;
  is_visible_to_students?: boolean;
  meta_title?: string;
  meta_description?: string;
  created_by: number;
  created_at: string;
  updated_at?: string;
  videos?: Video[];
  tasks?: Task[];
  tests?: Test[];
  content_count?: {
    videos: number;
    tasks: number;
    tests: number;
  };
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
  status?: 'draft' | 'published' | 'archived' | string;
  order_index?: number;
  is_visible_to_students?: boolean;
  created_at: string;
  updated_at?: string;
}

export interface Task {
  id: number;
  unit_id?: number;
  title: string;
  description?: string;
  instructions?: string;
  content?: string;
  type: 'manual' | 'auto' | 'practice' | 'writing';
  auto_task_type?: 'single_choice' | 'multiple_choice' | 'matching' | 'ordering' | 'gap_fill' | 'short_answer' | 'numeric';
  status: 'draft' | 'scheduled' | 'published' | 'archived';
  publish_at?: string;
  order_index: number;
  max_score: number;
  due_at?: string;
  allow_late_submissions: boolean;
  late_penalty_percent: number;
  max_attempts?: number;
  attachments: string[];
  rubric: Record<string, any>;
  auto_check_config: Record<string, any>;
  
  // Assignment settings
  assign_to_all: boolean;
  assigned_cohorts: number[];
  assigned_students: number[];
  
  // Notification settings
  send_assignment_email: boolean;
  reminder_days_before?: number;
  send_results_email: boolean;
  send_teacher_copy: boolean;
  
  created_by: number;
  created_at: string;
  updated_at?: string;
  
  // Computed properties
  assigned_student_count?: number;
  submission_stats?: {
    total: number;
    submitted: number;
    graded: number;
    pending: number;
  };
  average_score?: number;
  is_available?: boolean;
  is_overdue?: boolean;
  unit_title?: string;
  
  // Relationships
  unit?: Unit;
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
  attempt_number: number;
  time_spent_minutes?: number;
  
  // Computed properties
  is_submitted?: boolean;
  is_graded?: boolean;
  is_late?: boolean;
  final_score?: number;
  student_name?: string;
  grader_name?: string;
  
  // Relationships
  task?: Task;
  student?: User;
  grader?: User;
}

export interface Test {
  id: number;
  unit_id?: number | null;
  title: string;
  description?: string;
  instructions?: string;
  time_limit_minutes?: number;
  passing_score?: number;
  settings?: Record<string, any>;
  pass_threshold?: number;
  status?: 'draft' | 'published' | 'archived' | string;
  created_by?: number;
  created_at?: string;
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
