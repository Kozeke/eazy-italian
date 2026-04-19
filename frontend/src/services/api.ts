import axios, { AxiosInstance, AxiosResponse } from "axios";
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
  Student,
  AdminStudentCreateResponse,
} from "../types";
import { promptSessionExpired } from "./sessionExpiredPrompt";

// Get API base URL from environment variables
// Defaults to localhost for development if not set
const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api/v1";

// Create axios instance
const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

let refreshFlowPromise: Promise<string | null> | null = null;

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");
    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

// Response interceptor to handle errors
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Avoid infinite loops for auth endpoints (login/refresh)
      const reqUrl: string = String(error.config?.url || "");
      if (reqUrl.includes("/auth/login") || reqUrl.includes("/auth/refresh")) {
        return Promise.reject(error);
      }

      // If the user isn't logged in (no access token stored), don't show a session-expired prompt.
      const hasAccessToken = !!localStorage.getItem("token");
      if (!hasAccessToken) {
        return Promise.reject(error);
      }

      // If another request already kicked off the refresh flow, wait for it and retry.
      if (refreshFlowPromise) {
        const newToken = await refreshFlowPromise;
        if (newToken && error.config) {
          error.config.headers = {
            ...(error.config.headers || {}),
            Authorization: `Bearer ${newToken}`,
          };
          return api.request(error.config);
        }
        return Promise.reject(error);
      }

      // Prompt once, and allow the user 10 seconds to decide.
      let alreadyPrompting =
        sessionStorage.getItem("auth_expired_prompt_open") === "true";
      if (alreadyPrompting) {
        // Stale flag from a previous crash/reload shouldn't block future prompts.
        sessionStorage.removeItem("auth_expired_prompt_open");
        alreadyPrompting = false;
      }
      if (!alreadyPrompting) {
        sessionStorage.setItem("auth_expired_prompt_open", "true");

        const currentUrl =
          window.location.pathname +
          window.location.search +
          window.location.hash;
        try {
          sessionStorage.setItem("post_login_redirect", currentUrl);
        } catch {
          // ignore storage failures
        }

        const forceLogoutToLogin = () => {
          localStorage.removeItem("token");
          localStorage.removeItem("refresh_token");
          // Let AuthProvider cleanup as well (test state, etc.)
          try {
            window.dispatchEvent(new CustomEvent("perform-logout"));
          } catch {
            // ignore
          }
          const next = encodeURIComponent(currentUrl);
          window.location.href = `/login?next=${next}`;
        };

        refreshFlowPromise = (async () => {
          const choice = await promptSessionExpired(10);
          if (choice !== "stay") {
            forceLogoutToLogin();
            return null;
          }

          const refreshToken = localStorage.getItem("refresh_token");
          if (!refreshToken) {
            forceLogoutToLogin();
            return null;
          }

          try {
            const refreshRes = await axios.post<TokenResponse>(
              `${API_BASE_URL}/auth/refresh`,
              {
                refresh_token: refreshToken,
              },
            );
            const newAccessToken = refreshRes.data.access_token;
            localStorage.setItem("token", newAccessToken);
            if (refreshRes.data.refresh_token) {
              localStorage.setItem(
                "refresh_token",
                refreshRes.data.refresh_token,
              );
            }
            return newAccessToken;
          } catch {
            forceLogoutToLogin();
            return null;
          }
        })().finally(() => {
          refreshFlowPromise = null;
          sessionStorage.removeItem("auth_expired_prompt_open");
        });

        const newToken = await refreshFlowPromise;
        if (newToken && error.config) {
          error.config.headers = {
            ...(error.config.headers || {}),
            Authorization: `Bearer ${newToken}`,
          };
          return api.request(error.config);
        }
      }
    }
    return Promise.reject(error);
  },
);

// Auth API
export const authApi = {
  login: async (credentials: LoginCredentials): Promise<TokenResponse> => {
    console.log("Making login request to:", "/auth/login", credentials);
    const response: AxiosResponse<TokenResponse> = await api.post(
      "/auth/login",
      credentials,
    );
    console.log("Login response received:", response.data);
    return response.data;
  },

  register: async (userData: RegisterData): Promise<User> => {
    const response: AxiosResponse<User> = await api.post(
      "/auth/register",
      userData,
    );
    return response.data;
  },

  getCurrentUser: async (): Promise<User> => {
    console.log("Making getCurrentUser request to:", "/users/me");
    const response: AxiosResponse<User> = await api.get("/users/me");
    console.log("getCurrentUser response received:", response.data);
    return response.data;
  },

  logout: async (): Promise<void> => {
    try {
      await api.post("/auth/logout");
    } catch (error) {
      // Logout should still work even if API call fails
      console.error("Logout API call failed:", error);
    }
  },
};

// Courses API
export const coursesApi = {
  // Admin endpoints
  getDashboardStatistics: async (): Promise<any> => {
    const response: AxiosResponse<any> = await api.get(
      "/admin/dashboard/statistics",
    );
    return response.data;
  },

  getAdminCourses: async (params?: any): Promise<any[]> => {
    const response: AxiosResponse<any[]> = await api.get("/admin/courses", {
      params,
    });
    return response.data;
  },

  getAdminCourse: async (id: number): Promise<any> => {
    const response: AxiosResponse<any> = await api.get(`/admin/courses/${id}`);
    return response.data;
  },

  createCourse: async (courseData: Partial<any>): Promise<any> => {
    const response: AxiosResponse<any> = await api.post(
      "/admin/courses",
      courseData,
    );
    return response.data;
  },

  updateCourse: async (id: number, courseData: Partial<any>): Promise<any> => {
    const response: AxiosResponse<any> = await api.put(
      `/admin/courses/${id}`,
      courseData,
    );
    return response.data;
  },

  deleteCourse: async (id: number): Promise<void> => {
    await api.delete(`/admin/courses/${id}`);
  },

  uploadThumbnail: async (
    id: number,
    file: File,
  ): Promise<{ thumbnail_path: string }> => {
    const formData = new FormData();
    formData.append("file", file);
    const response: AxiosResponse<{ thumbnail_path: string }> = await api.post(
      `/admin/courses/${id}/thumbnail`,
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      },
    );
    return response.data;
  },

  generateThumbnail: async (
    id: number,
  ): Promise<{ thumbnail_path: string }> => {
    const response: AxiosResponse<{ thumbnail_path: string }> = await api.post(
      `/admin/courses/${id}/generate-thumbnail`,
    );
    return response.data;
  },

  publishCourse: async (
    id: number,
    publishData?: { publish_at?: string },
  ): Promise<any> => {
    const response: AxiosResponse<any> = await api.patch(
      `/admin/courses/${id}/publish`,
      publishData || {},
    );
    return response.data;
  },

  reorderCourses: async (courseIds: number[]): Promise<any> => {
    const response: AxiosResponse<any> = await api.post(
      "/admin/courses/reorder",
      { course_ids: courseIds },
    );
    return response.data;
  },

  // Student endpoints
  getCourses: async (params?: any): Promise<any[]> => {
    const response: AxiosResponse<any[]> = await api.get("/courses", {
      params,
    });
    return response.data;
  },

  getCourse: async (id: number): Promise<any> => {
    const response: AxiosResponse<any> = await api.get(`/courses/${id}`);
    return response.data;
  },

  enrollInCourse: async (id: number): Promise<any> => {
    const response: AxiosResponse<any> = await api.post(
      `/courses/${id}/enroll`,
    );
    return response.data;
  },

  getEnrolledCourses: async (): Promise<any[]> => {
    const response: AxiosResponse<any[]> = await api.get("/me/courses");
    return response.data;
  },

  getCourseUnits: async (courseId: number): Promise<any> => {
    const response: AxiosResponse<any> = await api.get(
      `/courses/${courseId}/units`,
    );
    return response.data;
  },

  getStudentDashboard: async (): Promise<any> => {
    const response: AxiosResponse<any> = await api.get("/student/dashboard");
    return response.data;
  },
};

// Units API
// Stores one downloadable material linked to a classroom unit.
export interface UnitMaterialAttachment {
  name: string;
  path: string;
  type: string;
}

// Normalizes a static file path into a browser-downloadable URL.
export function resolveStaticAssetUrl(pathOrUrl: string): string {
  if (!pathOrUrl) return "";
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;

  const apiOrigin = API_BASE_URL.replace(/\/api\/v1\/?$/, "");
  const normalizedPath = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;

  if (normalizedPath.startsWith("/api/v1/static/")) {
    return `${apiOrigin}${normalizedPath}`;
  }
  if (normalizedPath.startsWith("/static/")) {
    return `${API_BASE_URL}${normalizedPath}`;
  }
  return `${API_BASE_URL}/static/${pathOrUrl.replace(/^\/+/, "")}`;
}

export const unitsApi = {
  getUnits: async (params?: any): Promise<Unit[]> => {
    const response: AxiosResponse<Unit[]> = await api.get("/units", { params });
    return response.data;
  },

  getAdminUnits: async (params?: any): Promise<Unit[]> => {
    const response: AxiosResponse<Unit[]> = await api.get(
      "/units/admin/units",
      { params },
    );
    return response.data;
  },

  getUnit: async (id: number): Promise<Unit> => {
    const response: AxiosResponse<Unit> = await api.get(`/units/${id}`);
    return response.data;
  },

  getAdminUnit: async (id: number): Promise<Unit> => {
    const response: AxiosResponse<Unit> = await api.get(
      `/units/admin/units/${id}`,
    );
    return response.data;
  },

  createUnit: async (unitData: Partial<Unit>): Promise<Unit> => {
    const response: AxiosResponse<Unit> = await api.post(
      "/units/admin/units",
      unitData,
    );
    return response.data;
  },

  updateUnit: async (id: number, unitData: Partial<Unit>): Promise<Unit> => {
    const response: AxiosResponse<Unit> = await api.put(
      `/units/admin/units/${id}`,
      unitData,
    );
    return response.data;
  },

  // Uploads one teacher file and returns an attachment object ready for unit persistence.
  uploadUnitMaterialFile: async (file: File): Promise<UnitMaterialAttachment> => {
    const formData = new FormData();
    formData.append("files", file);
    const response: AxiosResponse<{
      files: Array<{
        file_path: string;
        original_filename: string;
      }>;
    }> = await api.post(`/tasks/admin/tasks/upload-file?file_type=reading`, formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
    const uploadedFile = response.data.files?.[0];
    if (!uploadedFile?.file_path) {
      throw new Error("Material upload did not return a file path");
    }
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "file";
    return {
      name: uploadedFile.original_filename || file.name,
      path: uploadedFile.file_path,
      type: extension,
    };
  },

  // Persists the full unit material list in the unit attachments field.
  saveUnitMaterials: async (
    unitId: number,
    attachments: UnitMaterialAttachment[],
  ): Promise<Unit> => {
    const response: AxiosResponse<Unit> = await api.put(
      `/units/admin/units/${unitId}`,
      { attachments },
    );
    return response.data;
  },

  deleteUnit: async (id: number): Promise<void> => {
    await api.delete(`/units/admin/units/${id}`);
  },

  /**
   * Persists new order_index values for unit-level videos, tasks, and/or tests
   * after the teacher reorders adjacent items of the same type in the lesson flow.
   */
  reorderUnitContent: async (
    unitId: number,
    body: {
      videos?: Array<{ id: number; order_index: number }>;
      tasks?: Array<{ id: number; order_index: number }>;
      tests?: Array<{ id: number; order_index: number }>;
    },
  ): Promise<{ message: string }> => {
    const response: AxiosResponse<{ message: string }> = await api.post(
      `/units/admin/units/${unitId}/reorder`,
      body,
    );
    return response.data;
  },
};

// ─── Segment body type ────────────────────────────────────────────────────────

export interface InlineMediaBlock {
  id: string;
  kind:
    | "image"
    | "video"
    | "audio"
    | "carousel_slides"
    | "drag_to_gap"
    | "drag_to_image"
    | "type_word_to_image"
    | "select_form_to_image"
    | "type_word_in_gap"
    | "select_word_form"
    | "build_sentence"
    | "match_pairs"
    | "order_paragraphs"
    | "sort_into_columns"
    | "test_without_timer"
    | "test_with_timer"
    | "true_false"
    | "text";
  url?: string;
  caption?: string;
  slides?: CarouselSlide[];
  title?: string;
  data?: Record<string, unknown>;
}

export interface CarouselSlide {
  id: string;
  [key: string]: unknown;
}

export interface CarouselSlideBlock {
  id: string;
  url: string;
  caption: string;
}

export interface SegmentUpdateBody {
  title?: string;
  description?: string;
  order_index?: number;
  status?: "draft" | "scheduled" | "published" | "archived";
  is_visible_to_students?: boolean;
  publish_at?: string | null;
  /** Persisted inline image / video / audio blocks for this section. */
  media_blocks?: InlineMediaBlock[];
  /** Persisted image carousel slides for this section. */
  carousel_slides?: CarouselSlideBlock[];
}

// ─── Segments API ─────────────────────────────────────────────────────────────

export const segmentsApi = {
  /** GET /admin/segments/{id} — single segment including media_blocks (for merge-before-save flows). */
  getSegment: async (id: number): Promise<any> => {
    const response: AxiosResponse<any> = await api.get(`/admin/segments/${id}`);
    return response.data;
  },

  /** PUT /admin/segments/{id} — partial update; accepts any SegmentUpdateBody fields. */
  updateSegment: async (
    id: number,
    segmentData: SegmentUpdateBody,
  ): Promise<any> => {
    const response: AxiosResponse<any> = await api.put(
      `/admin/segments/${id}`,
      segmentData,
    );
    return response.data;
  },

  /** GET /admin/units/{unit_id}/segments — ordered list, each row includes media_blocks. */
  listSegments: async (unitId: number): Promise<any[]> => {
    const response: AxiosResponse<any[]> = await api.get(
      `/admin/units/${unitId}/segments`,
    );
    return response.data;
  },

  /** POST /admin/units/{unit_id}/segments — create a new segment. */
  createSegment: async (
    unitId: number,
    body: {
      title: string;
      order_index?: number;
      status?: string;
      is_visible_to_students?: boolean;
    },
  ): Promise<any> => {
    const response: AxiosResponse<any> = await api.post(
      `/admin/units/${unitId}/segments`,
      body,
    );
    return response.data;
  },

  /** DELETE /admin/segments/{id} — content rows are kept (SET NULL cascade). */
  deleteSegment: async (id: number): Promise<void> => {
    await api.delete(`/admin/segments/${id}`);
  },

  /**
   * POST /admin/units/{unitId}/segments/reorder — bulk update order_index for all segments in a unit.
   * Body matches backend: { segments: [{ id, order_index }, ...] }.
   */
  reorderSegments: async (
    unitId: number,
    segments: Array<{ id: number; order_index: number }>,
  ): Promise<{ message?: string }> => {
    const response: AxiosResponse<{ message?: string }> = await api.post(
      `/admin/units/${unitId}/segments/reorder`,
      { segments },
    );
    return response.data;
  },

  /**
   * GET /units/{unit_id}/segments — student-facing endpoint.
   * Returns only segments where is_visible_to_students=true,
   * ordered by order_index. Requires a valid JWT (any role).
   */
  getStudentSegments: async (unitId: number): Promise<any[]> => {
    const response: AxiosResponse<any[]> = await api.get(
      `/units/${unitId}/segments`,
    );
    return response.data;
  },
};

// Presentations API (teacher admin — slide decks attached to units / segments)
export const presentationsApi = {
  /** Hard-delete a presentation and its slides (204 from backend). */
  deletePresentation: async (id: number): Promise<void> => {
    await api.delete(`/admin/presentations/${id}`);
  },
};

// Videos API
export const videosApi = {
  getVideos: async (unitId: number): Promise<Video[]> => {
    const response: AxiosResponse<Video[]> = await api.get(
      `/videos/units/${unitId}/videos`,
    );
    return response.data;
  },

  getAdminVideos: async (params?: any): Promise<Video[]> => {
    const response: AxiosResponse<Video[]> = await api.get("/admin/videos", {
      params,
    });
    return response.data;
  },

  getAdminVideo: async (id: number): Promise<Video> => {
    const response: AxiosResponse<Video> = await api.get(`/admin/videos/${id}`);
    return response.data;
  },

  createVideo: async (videoData: Partial<Video>): Promise<Video> => {
    const response: AxiosResponse<Video> = await api.post(
      `/admin/videos`,
      videoData,
    );
    return response.data;
  },

  updateVideo: async (
    id: number,
    videoData: Partial<Video>,
  ): Promise<Video> => {
    const response: AxiosResponse<Video> = await api.put(
      `/admin/videos/${id}`,
      videoData,
    );
    return response.data;
  },

  deleteVideo: async (id: number): Promise<void> => {
    await api.delete(`/admin/videos/${id}`);
  },

  uploadThumbnail: async (
    id: number,
    file: File,
  ): Promise<{ thumbnail_path: string }> => {
    const formData = new FormData();
    formData.append("file", file);
    const response: AxiosResponse<{ thumbnail_path: string }> = await api.post(
      `/videos/admin/videos/${id}/thumbnail`,
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      },
    );
    return response.data;
  },

  generateThumbnail: async (
    id: number,
  ): Promise<{ thumbnail_path: string }> => {
    const response: AxiosResponse<{ thumbnail_path: string }> = await api.post(
      `/videos/admin/videos/${id}/generate-thumbnail`,
    );
    return response.data;
  },

  uploadVideoFile: async (
    file: File,
  ): Promise<{ file_path: string; filename: string; size: number }> => {
    const formData = new FormData();
    formData.append("file", file);
    const response: AxiosResponse<{
      file_path: string;
      filename: string;
      size: number;
    }> = await api.post(`/videos/admin/videos/upload`, formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
    return response.data;
  },
  // Video Progress endpoints
  getVideoProgress: async (videoId: number): Promise<any> => {
    const response: AxiosResponse<any> = await api.get(
      `/videos/${videoId}/progress`,
    );
    return response.data;
  },

  updateVideoProgress: async (
    videoId: number,
    progressData: {
      watched_percentage: number;
      last_position_sec: number;
      completed: boolean;
    },
  ): Promise<any> => {
    const formData = new FormData();
    formData.append(
      "last_position_sec",
      progressData.last_position_sec.toString(),
    );
    formData.append(
      "watched_percentage",
      progressData.watched_percentage.toString(),
    );
    formData.append("completed", progressData.completed.toString());

    const response: AxiosResponse<any> = await api.post(
      `/videos/${videoId}/progress`,
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      },
    );
    return response.data;
  },

  resetVideoProgress: async (videoId: number): Promise<{ message: string }> => {
    const response: AxiosResponse<{ message: string }> = await api.delete(
      `/videos/${videoId}/progress`,
    );
    return response.data;
  },
};

// Tasks API
export const tasksApi = {
  // Admin endpoints
  getAdminTasks: async (params?: any): Promise<Task[]> => {
    const response: AxiosResponse<Task[]> = await api.get(
      "/tasks/admin/tasks",
      { params },
    );
    return response.data;
  },

  getAdminTask: async (id: number): Promise<Task> => {
    const response: AxiosResponse<Task> = await api.get(
      `/tasks/admin/tasks/${id}`,
    );
    return response.data;
  },

  createTask: async (taskData: Partial<Task>): Promise<Task> => {
    const response: AxiosResponse<Task> = await api.post(
      "/tasks/admin/tasks",
      taskData,
    );
    return response.data;
  },

  updateTask: async (id: number, taskData: Partial<Task>): Promise<Task> => {
    const response: AxiosResponse<Task> = await api.put(
      `/tasks/admin/tasks/${id}`,
      taskData,
    );
    return response.data;
  },

  deleteTask: async (id: number): Promise<void> => {
    await api.delete(`/tasks/admin/tasks/${id}`);
  },

  bulkActionTasks: async (bulkAction: {
    task_ids: number[];
    action: string;
  }): Promise<any> => {
    const response: AxiosResponse<any> = await api.post(
      "/tasks/admin/tasks/bulk-action",
      bulkAction,
    );
    return response.data;
  },

  bulkAssignTasks: async (bulkAssign: {
    task_ids: number[];
    assign_to_all: boolean;
    cohort_ids: number[];
    student_ids: number[];
  }): Promise<any> => {
    const response: AxiosResponse<any> = await api.post(
      "/tasks/admin/tasks/bulk-assign",
      bulkAssign,
    );
    return response.data;
  },

  getTaskSubmissions: async (
    taskId: number,
    params?: any,
  ): Promise<TaskSubmission[]> => {
    const response: AxiosResponse<TaskSubmission[]> = await api.get(
      `/tasks/admin/tasks/${taskId}/submissions`,
      { params },
    );
    return response.data;
  },

  getTaskSubmission: async (
    taskId: number,
    submissionId: number,
  ): Promise<TaskSubmission> => {
    const response: AxiosResponse<TaskSubmission> = await api.get(
      `/tasks/admin/tasks/${taskId}/submissions/${submissionId}`,
    );
    return response.data;
  },

  gradeSubmission: async (
    taskId: number,
    submissionId: number,
    gradeData: { score: number; feedback_rich?: string },
  ): Promise<TaskSubmission> => {
    const response: AxiosResponse<TaskSubmission> = await api.post(
      `/tasks/admin/tasks/${taskId}/submissions/${submissionId}/grade`,
      gradeData,
    );
    return response.data;
  },

  getTaskStatistics: async (taskId: number): Promise<any> => {
    const response: AxiosResponse<any> = await api.get(
      `/tasks/admin/tasks/${taskId}/statistics`,
    );
    return response.data;
  },

  getTasks: async (params?: any): Promise<Task[]> => {
    const response: AxiosResponse<Task[]> = await api.get("/tasks", { params });
    return response.data;
  },

  getTask: async (id: number): Promise<Task> => {
    const response: AxiosResponse<Task> = await api.get(`/tasks/${id}`);
    return response.data;
  },

  submitTask: async (
    id: number,
    submissionData: Partial<TaskSubmission>,
  ): Promise<TaskSubmission> => {
    const response: AxiosResponse<TaskSubmission> = await api.post(
      `/tasks/${id}/submit`,
      submissionData,
    );
    return response.data;
  },

  uploadTaskFile: async (
    files: File | File[],
    fileType: "listening" | "reading",
  ): Promise<{
    message: string;
    files: Array<{
      file_path: string;
      filename: string;
      original_filename: string;
      size: number;
      url: string;
    }>;
  }> => {
    const formData = new FormData();
    const filesArray = Array.isArray(files) ? files : [files];
    filesArray.forEach((file) => {
      formData.append("files", file);
    });
    const response: AxiosResponse<{
      message: string;
      files: Array<{
        file_path: string;
        filename: string;
        original_filename: string;
        size: number;
        url: string;
      }>;
    }> = await api.post(
      `/tasks/admin/tasks/upload-file?file_type=${fileType}`,
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      },
    );
    return response.data;
  },
};

// Student endpoints
export const usersApi = {
  getStudents: async (): Promise<Student[]> => {
    const response: AxiosResponse<Student[]> = await api.get("/admin/students");

    return response.data;
  },
  createStudent: async (studentData: {
    email: string;
    first_name: string;
    phone?: string;
    native_language?: string;
    timezone?: string;
    teacher_id?: number;
  }): Promise<AdminStudentCreateResponse> => {
    const response: AxiosResponse<AdminStudentCreateResponse> = await api.post(
      "/admin/students",
      studentData,
    );
    return response.data;
  },
  // Updates editable student profile fields from the admin student page modal.
  updateStudent: async (
    studentId: number,
    studentData: {
      email?: string;
      first_name?: string;
      phone?: string;
      native_language?: string;
      timezone?: string;
    },
  ): Promise<Student> => {
    const response: AxiosResponse<Student> = await api.put(
      `/admin/students/${studentId}`,
      studentData,
    );
    return response.data;
  },
  // Deletes a student account from the admin student profile page.
  deleteStudent: async (studentId: number): Promise<void> => {
    await api.delete(`/admin/students/${studentId}`);
  },
  enrollStudentInCourse: async (
    studentId: number,
    courseId: number,
  ): Promise<{ student_id: number; course_id: number; already_enrolled: boolean }> => {
    const response: AxiosResponse<{
      student_id: number;
      course_id: number;
      already_enrolled: boolean;
    }> = await api.post(`/admin/students/${studentId}/enrollments`, {
      course_id: courseId,
    });
    return response.data;
  },
  changeSubscription: async (studentId: number, subscription: string) => {
    await api.put(`/admin/students/${studentId}/subscription`, {
      subscription,
    });
  },
};
// Tests API
export const testsApi = {
  getTests: async (params?: any): Promise<PaginatedResponse<Test>> => {
    const response: AxiosResponse<PaginatedResponse<Test>> = await api.get(
      "/tests",
      { params },
    );
    return response.data;
  },

  getTest: async (id: number): Promise<Test> => {
    const response: AxiosResponse<Test> = await api.get(`/tests/${id}`);
    return response.data;
  },

  createTest: async (testData: Partial<Test>): Promise<Test> => {
    const response: AxiosResponse<Test> = await api.post(
      "/admin/tests",
      testData,
    );
    return response.data;
  },

  updateTest: async (id: number, testData: Partial<Test>): Promise<Test> => {
    const response: AxiosResponse<Test> = await api.put(
      `/admin/tests/${id}`,
      testData,
    );
    return response.data;
  },

  deleteTest: async (id: number): Promise<void> => {
    await api.delete(`/admin/tests/${id}`);
  },

  startTest: async (id: number): Promise<any> => {
    const response: AxiosResponse<any> = await api.post(`/tests/${id}/start`);
    return response.data;
  },

  submitTest: async (
    id: number,
    answers: Record<string, any>,
  ): Promise<any> => {
    const response: AxiosResponse<any> = await api.post(`/tests/${id}/submit`, {
      answers,
    });
    return response.data;
  },

  getTestAttempts: async (id: number): Promise<any> => {
    const response: AxiosResponse<any> = await api.get(`/tests/${id}/attempts`);
    return response.data;
  },

  // Test constructor endpoints
  addQuestionToTest: async (
    testId: number,
    questionData: any,
  ): Promise<any> => {
    const response: AxiosResponse<any> = await api.post(
      `/tests/${testId}/questions`,
      questionData,
    );
    return response.data;
  },

  getTestQuestions: async (testId: number): Promise<any> => {
    const response: AxiosResponse<any> = await api.get(
      `/tests/${testId}/questions`,
    );
    return response.data;
  },

  removeQuestionFromTest: async (
    testId: number,
    questionId: number,
  ): Promise<void> => {
    await api.delete(`/tests/${testId}/questions/${questionId}`);
  },

  regenerateQuestion: async (
    testId: number,
    questionId: number,
  ): Promise<any> => {
    const response: AxiosResponse<any> = await api.post(
      `/tests/${testId}/questions/${questionId}/regenerate`,
    );
    return response.data;
  },

  publishTest: async (testId: number): Promise<any> => {
    const response: AxiosResponse<any> = await api.patch(
      `/tests/${testId}/publish`,
    );
    return response.data;
  },

  unpublishTest: async (testId: number): Promise<any> => {
    const response: AxiosResponse<any> = await api.patch(
      `/tests/${testId}/unpublish`,
    );
    return response.data;
  },

  getTestResources: async (): Promise<any> => {
    const response: AxiosResponse<any> = await api.get("/tests/resources/all");
    return response.data;
  },
};

// Questions API
export const questionsApi = {
  getQuestions: async (params?: any): Promise<PaginatedResponse<Question>> => {
    const response: AxiosResponse<PaginatedResponse<Question>> = await api.get(
      "/admin/questions",
      { params },
    );
    return response.data;
  },

  createQuestion: async (
    questionData: Partial<Question>,
  ): Promise<Question> => {
    const response: AxiosResponse<Question> = await api.post(
      "/admin/questions",
      questionData,
    );
    return response.data;
  },

  updateQuestion: async (
    id: number,
    questionData: Partial<Question>,
  ): Promise<Question> => {
    const response: AxiosResponse<Question> = await api.put(
      `/admin/questions/${id}`,
      questionData,
    );
    return response.data;
  },

  deleteQuestion: async (id: number): Promise<void> => {
    await api.delete(`/admin/questions/${id}`);
  },
};

// Progress API
export const progressApi = {
  getStudentsProgress: async () => {
    const response = await api.get("/progress/students");
    return response.data;
  },

  getProgress: async (): Promise<Progress[]> => {
    const response: AxiosResponse<Progress[]> = await api.get("/progress");
    return response.data;
  },

  getStudentProgress: async (studentId: number): Promise<Progress[]> => {
    const response: AxiosResponse<Progress[]> = await api.get(
      `/admin/progress/student/${studentId}`,
    );
    return response.data;
  },

  updateProgress: async (
    unitId: number,
    progressData: Partial<Progress>,
  ): Promise<Progress> => {
    const response: AxiosResponse<Progress> = await api.put(
      `/progress/${unitId}`,
      progressData,
    );
    return response.data;
  },
};

// Video Progress API
export const videoProgressApi = {
  updateVideoProgress: async (
    videoId: number,
    lastPositionSec: number,
    watchedPercentage: number,
    completed: boolean,
  ): Promise<any> => {
    const formData = new FormData();
    formData.append("last_position_sec", lastPositionSec.toString());
    formData.append("watched_percentage", watchedPercentage.toString());
    formData.append("completed", completed.toString());

    const response: AxiosResponse<any> = await api.post(
      `/videos/${videoId}/progress`,
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      },
    );
    return response.data;
  },

  getVideoProgress: async (videoId: number): Promise<any> => {
    const response: AxiosResponse<any> = await api.get(
      `/videos/${videoId}/progress`,
    );
    return response.data;
  },
};

// Email Campaigns API
export const emailCampaignsApi = {
  getCampaigns: async (
    params?: any,
  ): Promise<PaginatedResponse<EmailCampaign>> => {
    const response: AxiosResponse<PaginatedResponse<EmailCampaign>> =
      await api.get("/admin/email-campaigns", { params });
    return response.data;
  },

  createCampaign: async (
    campaignData: Partial<EmailCampaign>,
  ): Promise<EmailCampaign> => {
    const response: AxiosResponse<EmailCampaign> = await api.post(
      "/admin/email-campaigns",
      campaignData,
    );
    return response.data;
  },

  updateCampaign: async (
    id: number,
    campaignData: Partial<EmailCampaign>,
  ): Promise<EmailCampaign> => {
    const response: AxiosResponse<EmailCampaign> = await api.put(
      `/admin/email-campaigns/${id}`,
      campaignData,
    );
    return response.data;
  },

  deleteCampaign: async (id: number): Promise<void> => {
    await api.delete(`/admin/email-campaigns/${id}`);
  },

  scheduleCampaign: async (
    id: number,
    scheduleData: { schedule_at: string },
  ): Promise<EmailCampaign> => {
    const response: AxiosResponse<EmailCampaign> = await api.post(
      `/admin/email-campaigns/${id}/schedule`,
      scheduleData,
    );
    return response.data;
  },
};

// Grades API=

export const gradesApi = {
  getGrades: async (params: {
    page?: number;
    page_size?: number;
    sort_by?: string;
    sort_dir?: "asc" | "desc";
  }) => {
    const res = await api.get("grades/admin/grades", {
      params,
    });
    return res.data;
  },

  getGradeDetail: async (attemptId: number): Promise<GradeDetail> => {
    const response: AxiosResponse<GradeDetail> = await api.get(
      `grades/admin/grades/${attemptId}`,
    );

    return response.data;
  },

  getStudentStats: async (studentId: number) => {
    const response = await api.get(`grades/admin/students/${studentId}/stats`);
    return response.data;
  },

  getStudentEnrollments: async (studentId: number) => {
    const response = await api.get(
      `grades/admin/students/${studentId}/enrollments`,
    );
    return response.data;
  },

  getTestsStatistics: async () => {
    const response = await api.get("grades/admin/tests/statistics");
    return response.data;
  },
};

// Analytics API
export const analyticsApi = {
  getTestAnalytics: async (testId: number) => {
    const response = await api.get(`/admin/analytics/test/${testId}`);
    return response.data;
  },
  getStudentAnalytics: async (studentId: number) => {
    const response = await api.get(`/admin/analytics/student/${studentId}`);
    return response.data;
  },
};

// Notifications API
export const notificationsApi = {
  getNotifications: async (unreadOnly: boolean = false) => {
    const response = await api.get("/notifications/admin/notifications", {
      params: { unread_only: unreadOnly },
    });
    return response.data;
  },

  getUnreadCount: async () => {
    const response = await api.get(
      "/notifications/admin/notifications/unread-count",
    );
    return response.data;
  },

  markAsRead: async (notificationId: number) => {
    const response = await api.post(
      `/notifications/admin/notifications/${notificationId}/read`,
    );
    return response.data;
  },

  markAllAsRead: async () => {
    const response = await api.post(
      "/notifications/admin/notifications/read-all",
    );
    return response.data;
  },
};

// RAG ingest API — document upload for vector store (PDF, DOCX only in UI; backend also supports VTT/SRT)
export const MAX_RAG_FILE_BYTES = 50 * 1024 * 1024; // 50 MB, must match backend
export const ALLOWED_RAG_EXTENSIONS = ["pdf", "docx"] as const;
export type AllowedRagExtension = (typeof ALLOWED_RAG_EXTENSIONS)[number];

export interface IngestResponseItem {
  lesson_id: number;
  course_id: number;
  filename: string;
  source_type: string;
  title: string;
  chunk_count: number;
  message: string;
}

export const ingestApi = {
  upload: async (
    file: File,
    lessonId: number,
    courseId: number,
    options?: { title?: string; language?: string; wipeExisting?: boolean },
  ): Promise<IngestResponseItem> => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("lesson_id", String(lessonId));
    formData.append("course_id", String(courseId));
    if (options?.title) formData.append("title", options.title);
    if (options?.language) formData.append("language", options.language);
    formData.append("wipe_existing", String(options?.wipeExisting ?? true));
    const response: AxiosResponse<IngestResponseItem> = await api.post(
      "/ingest/upload",
      formData,
      {
        headers: { "Content-Type": "multipart/form-data" },
      },
    );
    return response.data;
  },

  uploadMany: async (
    files: File[],
    lessonId: number,
    courseId: number,
    options?: { language?: string },
  ): Promise<IngestResponseItem[]> => {
    if (files.length === 0) return [];
    const formData = new FormData();
    files.forEach((f) => formData.append("files", f));
    formData.append("lesson_id", String(lessonId));
    formData.append("course_id", String(courseId));
    if (options?.language) formData.append("language", options.language);
    const response: AxiosResponse<IngestResponseItem[]> = await api.post(
      "/ingest/upload-many",
      formData,
      {
        headers: { "Content-Type": "multipart/form-data" },
      },
    );
    return response.data;
  },
};

// Student Tests API
export const studentTestsApi = {
  // 1️⃣ List available tests for student
  getTests: async (): Promise<Test[]> => {
    const response: AxiosResponse<Test[]> = await api.get("/student/tests");
    return response.data;
  },

  // 2️⃣ Get single test details (student view)
  getTest: async (id: number): Promise<Test> => {
    const response: AxiosResponse<Test> = await api.get(`/student/tests/${id}`);
    return response.data;
  },

  // 6️⃣ Get attempt history
  getTestAttempts: async (id: number): Promise<any> => {
    const response: AxiosResponse<any> = await api.get(
      `/student/tests/${id}/attempts`,
    );
    return response.data;
  },

  // 2️⃣ Start test attempt
  startTest: async (id: number): Promise<any> => {
    const response: AxiosResponse<any> = await api.post(
      `/student/tests/${id}/start`,
    );
    return response.data;
  },

  // 4️⃣ Submit test
  submitTest: async (
    id: number,
    answers: Record<string, any>,
  ): Promise<any> => {
    const response: AxiosResponse<any> = await api.post(
      `/student/tests/${id}/submit`,
      {
        answers,
      },
    );
    return response.data;
  },
};

// ─── Homework Blocks API ──────────────────────────────────────────────────────
//
// Paste this block at the end of api.ts, just before `export default api;`
//
// Endpoint convention (mirrors unitsApi):
//   /units/admin/units/{unitId}/homework
//
// Block ↔ HomeworkItem mapping
// ─────────────────────────────
//  API field          HomeworkItem.item field   Notes
//  kind               type                      except inline_media — see below
//  id                 id                        also HomeworkItem.id
//  title              label
//  data               data                      exercises only
//  url / caption      url / caption             media only
//
// inline_media special case
//  Serialising → API  use mediaKind as kind
//  Hydrating   ← API  if kind ∈ {image,video,audio} → reconstruct inline_media wrapper

export interface HomeworkBlock {
  /** Server-assigned id (string uuid or int-as-string) */
  id: string;
  /** Exercise type string OR media kind ("image"|"video"|"audio") */
  kind: string;
  /** Human-readable label — stored as `title` on the server */
  title: string;
  /** 0-based position; used for ordering */
  order_index: number;
  /** Exercise payload — exercises only */
  data?: unknown;
  /** Media URL — media blocks only */
  url?: string;
  /** Media caption — media blocks only */
  caption?: string;
}

export const homeworkApi = {
  /**
   * Fetch all blocks for a unit, ordered by order_index asc.
   * Backend returns { blocks: HomeworkBlock[] } — we unwrap the envelope.
   */
  getBlocks: async (unitId: number): Promise<HomeworkBlock[]> => {
    const response: AxiosResponse<{ blocks: HomeworkBlock[] }> = await api.get(
      `/admin/units/${unitId}/homework`,
    );
    return Array.isArray(response.data?.blocks) ? response.data.blocks : [];
  },

  /**
   * Append a new block; server assigns order_index.
   * Backend endpoint: POST /admin/units/{unitId}/homework/blocks
   * Backend returns { block: HomeworkBlock } — we unwrap the envelope.
   */
  addBlock: async (
    unitId: number,
    block: Omit<HomeworkBlock, "id" | "order_index">,
  ): Promise<HomeworkBlock> => {
    const response: AxiosResponse<{ block: HomeworkBlock }> = await api.post(
      `/admin/units/${unitId}/homework/blocks`,
      block,
    );
    return response.data.block;
  },

  /**
   * Partial-update a block's fields.
   * Backend endpoint: PUT /admin/units/{unitId}/homework/blocks/{blockId}
   * Backend returns { block: HomeworkBlock } — we unwrap the envelope.
   */
  updateBlock: async (
    unitId: number,
    blockId: string,
    patch: Partial<Omit<HomeworkBlock, "id" | "order_index">>,
  ): Promise<HomeworkBlock> => {
    const response: AxiosResponse<{ block: HomeworkBlock }> = await api.put(
      `/admin/units/${unitId}/homework/blocks/${blockId}`,
      patch,
    );
    return response.data.block;
  },

  /**
   * Hard-delete a block.
   * Backend endpoint: DELETE /admin/units/{unitId}/homework/blocks/{blockId}
   */
  deleteBlock: async (unitId: number, blockId: string): Promise<void> => {
    await api.delete(`/admin/units/${unitId}/homework/blocks/${blockId}`);
  },

  /**
   * Move a block one position up or down.
   * Backend endpoint: POST /admin/units/{unitId}/homework/blocks/reorder
   * Body: { blocks: [{ id, order_index }] } — backend uses bulk reorder.
   * We derive the new order from the current block list and direction.
   */
  reorder: async (
    unitId: number,
    blockId: string,
    direction: "up" | "down",
  ): Promise<void> => {
    // Fetch current order, swap the target block, then push the new order.
    const blocks = await homeworkApi.getBlocks(unitId);
    const idx = blocks.findIndex((b) => b.id === blockId);
    if (idx === -1) return;

    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= blocks.length) return;

    // Swap in-place
    [blocks[idx], blocks[swapIdx]] = [blocks[swapIdx], blocks[idx]];

    const orderedPayload = blocks.map((b, i) => ({ id: b.id, order_index: i }));
    await api.post(`/admin/units/${unitId}/homework/blocks/reorder`, {
      blocks: orderedPayload,
    });
  },
};

/** One student's homework workflow row returned from the submissions API */
export interface HomeworkSubmissionDto {
  unit_id: number;
  student_id: number;
  status: string;
  answers: Record<string, unknown>;
  teacher_feedback: string | null;
  submitted_for_review_at: string | null;
  updated_at: string | null;
}

/** Lightweight roster row for the teacher homework panel */
export interface HomeworkSubmissionListItemDto {
  student_id: number;
  student_name: string;
  status: string;
  submitted_for_review_at: string | null;
  updated_at: string | null;
}

export const homeworkSubmissionApi = {
  getMine: async (unitId: number): Promise<HomeworkSubmissionDto> => {
    const response: AxiosResponse<HomeworkSubmissionDto> = await api.get(
      `/units/${unitId}/homework/submission`,
    );
    return response.data;
  },

  saveMine: async (
    unitId: number,
    payload: {
      answers?: Record<string, unknown>;
      action: "save_draft" | "submit_for_review";
    },
  ): Promise<HomeworkSubmissionDto> => {
    const response: AxiosResponse<HomeworkSubmissionDto> = await api.put(
      `/units/${unitId}/homework/submission`,
      payload,
    );
    return response.data;
  },

  listForTeacher: async (
    unitId: number,
  ): Promise<HomeworkSubmissionListItemDto[]> => {
    const response: AxiosResponse<{
      submissions: HomeworkSubmissionListItemDto[];
    }> = await api.get(`/admin/units/${unitId}/homework/submissions`);
    return Array.isArray(response.data?.submissions)
      ? response.data.submissions
      : [];
  },

  getForTeacher: async (
    unitId: number,
    studentId: number,
  ): Promise<HomeworkSubmissionDto> => {
    const response: AxiosResponse<HomeworkSubmissionDto> = await api.get(
      `/admin/units/${unitId}/homework/submissions/${studentId}`,
    );
    return response.data;
  },

  teacherReview: async (
    unitId: number,
    studentId: number,
    body: {
      status: "awaiting_student" | "completed";
      teacher_feedback?: string | null;
    },
  ): Promise<HomeworkSubmissionDto> => {
    const response: AxiosResponse<HomeworkSubmissionDto> = await api.patch(
      `/admin/units/${unitId}/homework/submissions/${studentId}`,
      body,
    );
    return response.data;
  },
};

export default api;
