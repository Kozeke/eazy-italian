import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { 
  User, 
  Unit, 
  Video, 
  Task, 
  TaskSubmission, 
  Test, 
  Question, 
  Progress, 
  EmailCampaign,
  LoginCredentials,
  RegisterData,
  TokenResponse,
  GradeDetail,
  PaginatedResponse,
  Student
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

// Courses API
export const coursesApi = {
  // Admin endpoints
  getDashboardStatistics: async (): Promise<any> => {
    const response: AxiosResponse<any> = await api.get('/admin/dashboard/statistics');
    return response.data;
  },

  getAdminCourses: async (params?: any): Promise<any[]> => {
    const response: AxiosResponse<any[]> = await api.get('/admin/courses', { params });
    return response.data;
  },

  getAdminCourse: async (id: number): Promise<any> => {
    const response: AxiosResponse<any> = await api.get(`/admin/courses/${id}`);
    return response.data;
  },

  createCourse: async (courseData: Partial<any>): Promise<any> => {
    const response: AxiosResponse<any> = await api.post('/admin/courses', courseData);
    return response.data;
  },

  updateCourse: async (id: number, courseData: Partial<any>): Promise<any> => {
    const response: AxiosResponse<any> = await api.put(`/admin/courses/${id}`, courseData);
    return response.data;
  },

  deleteCourse: async (id: number): Promise<void> => {
    await api.delete(`/admin/courses/${id}`);
  },

  generateThumbnail: async (id: number): Promise<{ thumbnail_path: string }> => {
    const response: AxiosResponse<{ thumbnail_path: string }> = await api.post(
      `/admin/courses/${id}/generate-thumbnail`
    );
    return response.data;
  },

  publishCourse: async (id: number, publishData?: { publish_at?: string }): Promise<any> => {
    const response: AxiosResponse<any> = await api.patch(`/admin/courses/${id}/publish`, publishData || {});
    return response.data;
  },

  reorderCourses: async (courseIds: number[]): Promise<any> => {
    const response: AxiosResponse<any> = await api.post('/admin/courses/reorder', { course_ids: courseIds });
    return response.data;
  },

  // Student endpoints
  getCourses: async (params?: any): Promise<any[]> => {
    const response: AxiosResponse<any[]> = await api.get('/courses', { params });
    return response.data;
  },

  getCourse: async (id: number): Promise<any> => {
    const response: AxiosResponse<any> = await api.get(`/courses/${id}`);
    return response.data;
  },

  enrollInCourse: async (id: number): Promise<any> => {
    const response: AxiosResponse<any> = await api.post(`/courses/${id}/enroll`);
    return response.data;
  },

  getEnrolledCourses: async (): Promise<any[]> => {
    const response: AxiosResponse<any[]> = await api.get('/me/courses');
    return response.data;
  },
  
  getCourseUnits: async (courseId: number): Promise<any> => {
    const response: AxiosResponse<any> = await api.get(`/courses/${courseId}/units`);
    return response.data;
  },

  getStudentDashboard: async (): Promise<any> => {
    const response: AxiosResponse<any> = await api.get('/student/dashboard');
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
    const response: AxiosResponse<Unit> = await api.get(`/units/${id}`);
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

  getAdminVideos: async (params?: any): Promise<Video[]> => {
    const response: AxiosResponse<Video[]> = await api.get('/videos/admin/videos', { params });
    return response.data;
  },

  getAdminVideo: async (id: number): Promise<Video> => {
    const response: AxiosResponse<Video> = await api.get(`/videos/admin/videos/${id}`);
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

  uploadThumbnail: async (id: number, file: File): Promise<{ thumbnail_path: string }> => {
    const formData = new FormData();
    formData.append('file', file);
    const response: AxiosResponse<{ thumbnail_path: string }> = await api.post(
      `/videos/admin/videos/${id}/thumbnail`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );
    return response.data;
  },

  generateThumbnail: async (id: number): Promise<{ thumbnail_path: string }> => {
    const response: AxiosResponse<{ thumbnail_path: string }> = await api.post(
      `/videos/admin/videos/${id}/generate-thumbnail`
    );
    return response.data;
  },

  uploadVideoFile: async (file: File): Promise<{ file_path: string; filename: string; size: number }> => {
    const formData = new FormData();
    formData.append('file', file);
    const response: AxiosResponse<{ file_path: string; filename: string; size: number }> = await api.post(
      `/videos/admin/videos/upload`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );
    return response.data;
  },
  // Video Progress endpoints
  getVideoProgress: async (videoId: number): Promise<any> => {
    const response: AxiosResponse<any> = await api.get(`/videos/${videoId}/progress`);
    return response.data;
  },

  updateVideoProgress: async (videoId: number, progressData: { watched_percentage: number; last_position_sec: number; completed: boolean }): Promise<any> => {
    const formData = new FormData();
    formData.append('last_position_sec', progressData.last_position_sec.toString());
    formData.append('watched_percentage', progressData.watched_percentage.toString());
    formData.append('completed', progressData.completed.toString());
    
    const response: AxiosResponse<any> = await api.post(
      `/videos/${videoId}/progress`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );
    return response.data;
  },

  resetVideoProgress: async (videoId: number): Promise<{ message: string }> => {
    const response: AxiosResponse<{ message: string }> = await api.delete(`/videos/${videoId}/progress`);
    return response.data;
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

// Student endpoints
export const usersApi = {
  getStudents: async (): Promise<Student[]> => {
    const response: AxiosResponse<Student[]> =
      await api.get('/students/admin/students');
  
    return response.data;
  },
  changeSubscription: async (studentId: number, subscription: string) => {
    await api.put(`/students/${studentId}/subscription`, {
      subscription,
    });
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
  getStudentsProgress: async () => {
    const response = await api.get('/progress/students');
    return response.data;
  },
  
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

// Video Progress API
export const videoProgressApi = {
  updateVideoProgress: async (
    videoId: number,
    lastPositionSec: number,
    watchedPercentage: number,
    completed: boolean
  ): Promise<any> => {
    const formData = new FormData();
    formData.append('last_position_sec', lastPositionSec.toString());
    formData.append('watched_percentage', watchedPercentage.toString());
    formData.append('completed', completed.toString());
    
    const response: AxiosResponse<any> = await api.post(
      `/videos/${videoId}/progress`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );
    return response.data;
  },

  getVideoProgress: async (videoId: number): Promise<any> => {
    const response: AxiosResponse<any> = await api.get(`/videos/${videoId}/progress`);
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

// Grades API=

export const gradesApi = {
  getGrades: async (params: {
    page?: number;
    page_size?: number;
    sort_by?: string;
    sort_dir?: 'asc' | 'desc';
  }) => {
    const res = await api.get('grades/admin/grades', {
      params,
    });
    return res.data;
  },
  
  
  getGradeDetail: async (attemptId: number): Promise<GradeDetail> => {
    const response: AxiosResponse<GradeDetail> =
      await api.get(`grades/admin/grades/${attemptId}`);
  
    return response.data;
  },
  
  getStudentStats: async (studentId: number) => {
    const response = await api.get(`grades/admin/students/${studentId}/stats`);
    return response.data;
  },
  
  getStudentEnrollments: async (studentId: number) => {
    const response = await api.get(`grades/admin/students/${studentId}/enrollments`);
    return response.data;
  },
  
  getTestsStatistics: async () => {
    const response = await api.get('grades/admin/tests/statistics');
    return response.data;
  },
};

// Student Tests API
export const studentTestsApi = {
  // 1️⃣ List available tests for student
  getTests: async (): Promise<Test[]> => {
    const response: AxiosResponse<Test[]> =
      await api.get('/student/tests');
    return response.data;
  },

  // 2️⃣ Get single test details (student view)
  getTest: async (id: number): Promise<Test> => {
    const response: AxiosResponse<Test> =
      await api.get(`/student/tests/${id}`);
    return response.data;
  },

  // 6️⃣ Get attempt history
  getTestAttempts: async (id: number): Promise<any> => {
    const response: AxiosResponse<any> =
      await api.get(`/student/tests/${id}/attempts`);
    return response.data;
  },

  // 2️⃣ Start test attempt
  startTest: async (id: number): Promise<any> => {
    const response: AxiosResponse<any> =
      await api.post(`/student/tests/${id}/start`);
    return response.data;
  },

  // 4️⃣ Submit test
  submitTest: async (
    id: number,
    answers: Record<string, any>
  ): Promise<any> => {
    const response: AxiosResponse<any> =
      await api.post(`/student/tests/${id}/submit`, {
        answers,
      });
    return response.data;
  },
};


export default api;


