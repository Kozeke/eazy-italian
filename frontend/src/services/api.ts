import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { 
  User, 
  Unit, 
  Video, 
  Task, 
  TaskSubmission, 
  Test, 
  Question, 
  TestAttempt, 
  Progress, 
  EmailCampaign,
  LoginCredentials,
  RegisterData,
  TokenResponse,

  PaginatedResponse
} from '../types';

// Get API base URL from environment variables
// Defaults to localhost for development if not set
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1';

// Create axios instance
const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authApi = {
  login: async (credentials: LoginCredentials): Promise<TokenResponse> => {
    console.log('Making login request to:', '/auth/login', credentials);
    const response: AxiosResponse<TokenResponse> = await api.post('/auth/login', credentials);
    console.log('Login response received:', response.data);
    return response.data;
  },

  register: async (userData: RegisterData): Promise<User> => {
    const response: AxiosResponse<User> = await api.post('/auth/register', userData);
    return response.data;
  },

  getCurrentUser: async (): Promise<User> => {
    console.log('Making getCurrentUser request to:', '/auth/me');
    const response: AxiosResponse<User> = await api.get('/auth/me');
    console.log('getCurrentUser response received:', response.data);
    return response.data;
  },
};

// Units API
export const unitsApi = {
  getUnits: async (params?: any): Promise<Unit[]> => {
    const response: AxiosResponse<Unit[]> = await api.get('/units/units', { params });
    return response.data;
  },

  getAdminUnits: async (params?: any): Promise<Unit[]> => {
    const response: AxiosResponse<Unit[]> = await api.get('/units/admin/units', { params });
    return response.data;
  },

  getUnit: async (id: number): Promise<Unit> => {
    const response: AxiosResponse<Unit> = await api.get(`/units/units/${id}`);
    return response.data;
  },

  getAdminUnit: async (id: number): Promise<Unit> => {
    const response: AxiosResponse<Unit> = await api.get(`/units/admin/units/${id}`);
    return response.data;
  },

  createUnit: async (unitData: Partial<Unit>): Promise<Unit> => {
    const response: AxiosResponse<Unit> = await api.post('/units/admin/units', unitData);
    return response.data;
  },

  updateUnit: async (id: number, unitData: Partial<Unit>): Promise<Unit> => {
    const response: AxiosResponse<Unit> = await api.put(`/units/admin/units/${id}`, unitData);
    return response.data;
  },

  deleteUnit: async (id: number): Promise<void> => {
    await api.delete(`/units/admin/units/${id}`);
  },
};

// Videos API
export const videosApi = {
  getVideos: async (unitId: number): Promise<Video[]> => {
    const response: AxiosResponse<Video[]> = await api.get(`/videos/units/${unitId}/videos`);
    return response.data;
  },

  createVideo: async (videoData: Partial<Video>): Promise<Video> => {
    const response: AxiosResponse<Video> = await api.post(`/videos/admin/videos`, videoData);
    return response.data;
  },

  updateVideo: async (id: number, videoData: Partial<Video>): Promise<Video> => {
    const response: AxiosResponse<Video> = await api.put(`/videos/admin/videos/${id}`, videoData);
    return response.data;
  },

  deleteVideo: async (id: number): Promise<void> => {
    await api.delete(`/videos/admin/videos/${id}`);
  },
};

// Tasks API
export const tasksApi = {
  // Admin endpoints
  getAdminTasks: async (params?: any): Promise<Task[]> => {
    const response: AxiosResponse<Task[]> = await api.get('/tasks/admin/tasks', { params });
    return response.data;
  },

  getAdminTask: async (id: number): Promise<Task> => {
    const response: AxiosResponse<Task> = await api.get(`/tasks/admin/tasks/${id}`);
    return response.data;
  },

  createTask: async (taskData: Partial<Task>): Promise<Task> => {
    const response: AxiosResponse<Task> = await api.post('/tasks/admin/tasks', taskData);
    return response.data;
  },

  updateTask: async (id: number, taskData: Partial<Task>): Promise<Task> => {
    const response: AxiosResponse<Task> = await api.put(`/tasks/admin/tasks/${id}`, taskData);
    return response.data;
  },

  deleteTask: async (id: number): Promise<void> => {
    await api.delete(`/tasks/admin/tasks/${id}`);
  },

  bulkActionTasks: async (bulkAction: { task_ids: number[]; action: string }): Promise<any> => {
    const response: AxiosResponse<any> = await api.post('/tasks/admin/tasks/bulk-action', bulkAction);
    return response.data;
  },

  bulkAssignTasks: async (bulkAssign: { task_ids: number[]; assign_to_all: boolean; cohort_ids: number[]; student_ids: number[] }): Promise<any> => {
    const response: AxiosResponse<any> = await api.post('/tasks/admin/tasks/bulk-assign', bulkAssign);
    return response.data;
  },

  getTaskSubmissions: async (taskId: number, params?: any): Promise<TaskSubmission[]> => {
    const response: AxiosResponse<TaskSubmission[]> = await api.get(`/tasks/admin/tasks/${taskId}/submissions`, { params });
    return response.data;
  },

  getTaskSubmission: async (taskId: number, submissionId: number): Promise<TaskSubmission> => {
    const response: AxiosResponse<TaskSubmission> = await api.get(`/tasks/admin/tasks/${taskId}/submissions/${submissionId}`);
    return response.data;
  },

  gradeSubmission: async (taskId: number, submissionId: number, gradeData: { score: number; feedback_rich?: string }): Promise<TaskSubmission> => {
    const response: AxiosResponse<TaskSubmission> = await api.post(`/tasks/admin/tasks/${taskId}/submissions/${submissionId}/grade`, gradeData);
    return response.data;
  },

  getTaskStatistics: async (taskId: number): Promise<any> => {
    const response: AxiosResponse<any> = await api.get(`/tasks/admin/tasks/${taskId}/statistics`);
    return response.data;
  },

  // Student endpoints
  getTasks: async (params?: any): Promise<Task[]> => {
    const response: AxiosResponse<Task[]> = await api.get('/tasks', { params });
    return response.data;
  },

  getTask: async (id: number): Promise<Task> => {
    const response: AxiosResponse<Task> = await api.get(`/tasks/${id}`);
    return response.data;
  },

  submitTask: async (id: number, submissionData: Partial<TaskSubmission>): Promise<TaskSubmission> => {
    const response: AxiosResponse<TaskSubmission> = await api.post(`/tasks/${id}/submit`, submissionData);
    return response.data;
  },
};

// Tests API
export const testsApi = {
  getTests: async (params?: any): Promise<PaginatedResponse<Test>> => {
    const response: AxiosResponse<PaginatedResponse<Test>> = await api.get('/tests', { params });
    return response.data;
  },

  getTest: async (id: number): Promise<Test> => {
    const response: AxiosResponse<Test> = await api.get(`/tests/${id}`);
    return response.data;
  },

  createTest: async (testData: Partial<Test>): Promise<Test> => {
    const response: AxiosResponse<Test> = await api.post('/tests/', testData);
    return response.data;
  },

  updateTest: async (id: number, testData: Partial<Test>): Promise<Test> => {
    const response: AxiosResponse<Test> = await api.put(`/tests/${id}`, testData);
    return response.data;
  },

  deleteTest: async (id: number): Promise<void> => {
    await api.delete(`/tests/${id}`);
  },

  startTest: async (id: number): Promise<any> => {
    const response: AxiosResponse<any> = await api.post(`/tests/${id}/start`);
    return response.data;
  },

  submitTest: async (id: number, answers: Record<string, any>): Promise<any> => {
    const response: AxiosResponse<any> = await api.post(`/tests/${id}/submit`, { answers });
    return response.data;
  },
  
  getTestAttempts: async (id: number): Promise<any> => {
    const response: AxiosResponse<any> = await api.get(`/tests/${id}/attempts`);
    return response.data;
  },

  // Test constructor endpoints
  addQuestionToTest: async (testId: number, questionData: any): Promise<any> => {
    const response: AxiosResponse<any> = await api.post(`/tests/${testId}/questions`, questionData);
    return response.data;
  },

  getTestQuestions: async (testId: number): Promise<any> => {
    const response: AxiosResponse<any> = await api.get(`/tests/${testId}/questions`);
    return response.data;
  },

  removeQuestionFromTest: async (testId: number, questionId: number): Promise<void> => {
    await api.delete(`/tests/${testId}/questions/${questionId}`);
  },

  publishTest: async (testId: number): Promise<any> => {
    const response: AxiosResponse<any> = await api.patch(`/tests/${testId}/publish`);
    return response.data;
  },

  unpublishTest: async (testId: number): Promise<any> => {
    const response: AxiosResponse<any> = await api.patch(`/tests/${testId}/unpublish`);
    return response.data;
  },

  getTestResources: async (): Promise<any> => {
    const response: AxiosResponse<any> = await api.get('/tests/resources/all');
    return response.data;
  },
};

// Questions API
export const questionsApi = {
  getQuestions: async (params?: any): Promise<PaginatedResponse<Question>> => {
    const response: AxiosResponse<PaginatedResponse<Question>> = await api.get('/admin/questions', { params });
    return response.data;
  },

  createQuestion: async (questionData: Partial<Question>): Promise<Question> => {
    const response: AxiosResponse<Question> = await api.post('/admin/questions', questionData);
    return response.data;
  },

  updateQuestion: async (id: number, questionData: Partial<Question>): Promise<Question> => {
    const response: AxiosResponse<Question> = await api.put(`/admin/questions/${id}`, questionData);
    return response.data;
  },

  deleteQuestion: async (id: number): Promise<void> => {
    await api.delete(`/admin/questions/${id}`);
  },
};

// Progress API
export const progressApi = {
  getProgress: async (): Promise<Progress[]> => {
    const response: AxiosResponse<Progress[]> = await api.get('/progress');
    return response.data;
  },

  getStudentProgress: async (studentId: number): Promise<Progress[]> => {
    const response: AxiosResponse<Progress[]> = await api.get(`/admin/progress/student/${studentId}`);
    return response.data;
  },

  updateProgress: async (unitId: number, progressData: Partial<Progress>): Promise<Progress> => {
    const response: AxiosResponse<Progress> = await api.put(`/progress/${unitId}`, progressData);
    return response.data;
  },
};

// Email Campaigns API
export const emailCampaignsApi = {
  getCampaigns: async (params?: any): Promise<PaginatedResponse<EmailCampaign>> => {
    const response: AxiosResponse<PaginatedResponse<EmailCampaign>> = await api.get('/admin/email-campaigns', { params });
    return response.data;
  },

  createCampaign: async (campaignData: Partial<EmailCampaign>): Promise<EmailCampaign> => {
    const response: AxiosResponse<EmailCampaign> = await api.post('/admin/email-campaigns', campaignData);
    return response.data;
  },

  updateCampaign: async (id: number, campaignData: Partial<EmailCampaign>): Promise<EmailCampaign> => {
    const response: AxiosResponse<EmailCampaign> = await api.put(`/admin/email-campaigns/${id}`, campaignData);
    return response.data;
  },

  deleteCampaign: async (id: number): Promise<void> => {
    await api.delete(`/admin/email-campaigns/${id}`);
  },

  scheduleCampaign: async (id: number, scheduleData: { schedule_at: string }): Promise<EmailCampaign> => {
    const response: AxiosResponse<EmailCampaign> = await api.post(`/admin/email-campaigns/${id}/schedule`, scheduleData);
    return response.data;
  },
};

export default api;


