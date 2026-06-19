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
  TeacherPaymentRecord,
} from "../types";

// Get API base URL from environment variables
// Defaults to localhost for development if not set
export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api/v1";

// Normalized API root (no trailing slash) for raw `fetch` URLs aligned with the axios client baseURL.
export const API_V1_BASE = API_BASE_URL.replace(/\/+$/, "");

/**
 * Derives WebSocket origin (scheme + host) from the configured API URL so sockets reach the backend, not the Vite dev server.
 */
export function wsOriginFromApiBase(): string {
  try {
    const parsedApiUrl = new URL(API_BASE_URL);
    const wsProtocol = parsedApiUrl.protocol === "https:" ? "wss:" : "ws:";
    return `${wsProtocol}//${parsedApiUrl.host}`;
  } catch {
    if (typeof window === "undefined") {
      return "ws://localhost:8000";
    }
    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${wsProtocol}//${window.location.host}`;
  }
}

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

// Response interceptor to handle 401 errors via silent token refresh.
// Flow: attempt silent refresh → retry request on success → redirect to login on failure.
// The "Session expired" prompt is intentionally not shown so it never appears on initial
// page load when the browser has stale tokens from a previous session.
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Avoid infinite loops for auth endpoints (login/refresh)
      const reqUrl: string = String(error.config?.url || "");
      if (reqUrl.includes("/auth/login") || reqUrl.includes("/auth/refresh")) {
        return Promise.reject(error);
      }

      // If the user isn't logged in (no access token stored), nothing to refresh.
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

      // Capture URL for post-login redirect before any async work
      const currentUrl =
        window.location.pathname +
        window.location.search +
        window.location.hash;

      // Clears tokens and navigates to /login, preserving the intended destination.
      const redirectToLogin = () => {
        localStorage.removeItem("token");
        localStorage.removeItem("refresh_token");
        // Notify AuthProvider so test state and other side-effects are cleaned up.
        try {
          window.dispatchEvent(new CustomEvent("perform-logout"));
        } catch {
          // ignore dispatch failures
        }
        try {
          sessionStorage.setItem("post_login_redirect", currentUrl);
        } catch {
          // ignore storage failures
        }
        window.location.href = `/login?next=${encodeURIComponent(currentUrl)}`;
      };

      // Attempt a silent refresh. If there is no refresh token on hand, go straight
      // to login — the session is unrecoverable and we must not show a stale prompt.
      const refreshToken = localStorage.getItem("refresh_token");
      if (!refreshToken) {
        redirectToLogin();
        return Promise.reject(error);
      }

      // Start a single shared refresh promise so concurrent 401s do not race.
      refreshFlowPromise = (async () => {
        try {
          const refreshRes = await axios.post<TokenResponse>(
            `${API_BASE_URL}/auth/refresh`,
            { refresh_token: refreshToken },
          );
          const newAccessToken = refreshRes.data.access_token;
          localStorage.setItem("token", newAccessToken);
          if (refreshRes.data.refresh_token) {
            localStorage.setItem("refresh_token", refreshRes.data.refresh_token);
          }
          return newAccessToken;
        } catch {
          // Refresh token itself is expired or invalid — redirect silently to login.
          redirectToLogin();
          return null;
        }
      })().finally(() => {
        refreshFlowPromise = null;
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

  // Persists profile fields for the signed-in account (PUT /users/me).
  updateCurrentUser: async (payload: {
    email?: string;
    first_name?: string;
    last_name?: string;
    locale?: string;
    notification_prefs?: Record<string, unknown>;
  }): Promise<User> => {
    const response: AxiosResponse<User> = await api.put("/users/me", payload);
    return response.data;
  },

  // Uploads the authenticated user's profile avatar image to /users/me/avatar.
  uploadCurrentUserAvatar: async (file: File): Promise<User> => {
    // Stores multipart payload expected by backend avatar upload endpoint.
    const avatarFormData = new FormData();
    avatarFormData.append("file", file);
    // Stores backend response with updated current-user profile avatar fields.
    const response: AxiosResponse<User> = await api.post(
      "/users/me/avatar",
      avatarFormData,
      {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      },
    );
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

  /** GET /admin/courses/:id/enrolled-student-ids — student user ids enrolled in the course (teacher-owned). */
  getCourseEnrolledStudentIds: async (
    courseId: number,
  ): Promise<{ student_ids: number[] }> => {
    const response: AxiosResponse<{ student_ids: number[] }> = await api.get(
      `/admin/courses/${courseId}/enrolled-student-ids`,
    );
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

  /** POST /admin/courses/:id/units/reorder — body { unit_ids: number[] } lists every unit in the course in display order. */
  reorderCourseUnits: async (
    courseId: number,
    unitIds: number[],
  ): Promise<{ message?: string }> => {
    const response: AxiosResponse<{ message?: string }> = await api.post(
      `/admin/courses/${courseId}/units/reorder`,
      { unit_ids: unitIds },
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

  /**
   * POST /admin/units/:id/publish — sets unit to published (or scheduled if publish_at set).
   * When publish_children is true, draft videos/tasks/tests in the unit are published too.
   */
  publishUnit: async (
    id: number,
    body?: { publish_at?: string | null; publish_children?: boolean },
  ): Promise<{ message: string }> => {
    const response: AxiosResponse<{ message: string }> = await api.post(
      `/units/admin/units/${id}/publish`,
      body ?? { publish_children: true },
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
    | "drag_word_to_image"
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
    | "text"
    | "image_placeholder"
    | "gif_animation"
    | "image_stacked"
    | "video_embed"
    | "audio_embed";
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

// LEGACY: videosApi — Video / VideoProgress replaced by video_embed blocks on Segment.
// LEGACY: Replaced by: video_embed exercise block in Segment.media_blocks JSONB.
// LEGACY:              Video progress tracking → UnitHomeworkSubmission / segment completion state.
// LEGACY:              videoProgress methods (getVideoProgress, updateVideoProgress, resetVideoProgress)
// LEGACY:              are also commented out — VideoProgress table is removed in the new architecture.
export const videosApi = {
  // LEGACY:   getVideos: async (unitId: number): Promise<Video[]> => {
  // LEGACY:     const response: AxiosResponse<Video[]> = await api.get(
  // LEGACY:       `/videos/units/${unitId}/videos`,
  // LEGACY:     );
  // LEGACY:     return response.data;
  // LEGACY:   },

  // LEGACY:   getAdminVideos: async (params?: any): Promise<Video[]> => {
  // LEGACY:     const response: AxiosResponse<Video[]> = await api.get("/admin/videos", {
  // LEGACY:       params,
  // LEGACY:     });
  // LEGACY:     return response.data;
  // LEGACY:   },

  // LEGACY:   getAdminVideo: async (id: number): Promise<Video> => {
  // LEGACY:     const response: AxiosResponse<Video> = await api.get(`/admin/videos/${id}`);
  // LEGACY:     return response.data;
  // LEGACY:   },

  // LEGACY:   createVideo: async (videoData: Partial<Video>): Promise<Video> => {
  // LEGACY:     const response: AxiosResponse<Video> = await api.post(
  // LEGACY:       `/admin/videos`,
  // LEGACY:       videoData,
  // LEGACY:     );
  // LEGACY:     return response.data;
  // LEGACY:   },

  // LEGACY:   updateVideo: async (
  // LEGACY:     id: number,
  // LEGACY:     videoData: Partial<Video>,
  // LEGACY:   ): Promise<Video> => {
  // LEGACY:     const response: AxiosResponse<Video> = await api.put(
  // LEGACY:       `/admin/videos/${id}`,
  // LEGACY:       videoData,
  // LEGACY:     );
  // LEGACY:     return response.data;
  // LEGACY:   },

  // LEGACY:   deleteVideo: async (id: number): Promise<void> => {
  // LEGACY:     await api.delete(`/admin/videos/${id}`);
  // LEGACY:   },

  // LEGACY:   uploadThumbnail: async (
  // LEGACY:     id: number,
  // LEGACY:     file: File,
  // LEGACY:   ): Promise<{ thumbnail_path: string }> => {
  // LEGACY:     const formData = new FormData();
  // LEGACY:     formData.append("file", file);
  // LEGACY:     const response: AxiosResponse<{ thumbnail_path: string }> = await api.post(
  // LEGACY:       `/videos/admin/videos/${id}/thumbnail`,
  // LEGACY:       formData,
  // LEGACY:       {
  // LEGACY:         headers: {
  // LEGACY:           "Content-Type": "multipart/form-data",
  // LEGACY:         },
  // LEGACY:       },
  // LEGACY:     );
  // LEGACY:     return response.data;
  // LEGACY:   },

  // LEGACY:   generateThumbnail: async (
  // LEGACY:     id: number,
  // LEGACY:   ): Promise<{ thumbnail_path: string }> => {
  // LEGACY:     const response: AxiosResponse<{ thumbnail_path: string }> = await api.post(
  // LEGACY:       `/videos/admin/videos/${id}/generate-thumbnail`,
  // LEGACY:     );
  // LEGACY:     return response.data;
  // LEGACY:   },

  // LEGACY:   uploadVideoFile: async (
  // LEGACY:     file: File,
  // LEGACY:   ): Promise<{ file_path: string; filename: string; size: number }> => {
  // LEGACY:     const formData = new FormData();
  // LEGACY:     formData.append("file", file);
  // LEGACY:     const response: AxiosResponse<{
  // LEGACY:       file_path: string;
  // LEGACY:       filename: string;
  // LEGACY:       size: number;
  // LEGACY:     }> = await api.post(`/videos/admin/videos/upload`, formData, {
  // LEGACY:       headers: {
  // LEGACY:         "Content-Type": "multipart/form-data",
  // LEGACY:       },
  // LEGACY:     });
  // LEGACY:     return response.data;
  // LEGACY:   },
  // LEGACY:   // Video Progress endpoints
  // LEGACY:   getVideoProgress: async (videoId: number): Promise<any> => {
  // LEGACY:     const response: AxiosResponse<any> = await api.get(
  // LEGACY:       `/videos/${videoId}/progress`,
  // LEGACY:     );
  // LEGACY:     return response.data;
  // LEGACY:   },

  // LEGACY:   updateVideoProgress: async (
  // LEGACY:     videoId: number,
  // LEGACY:     progressData: {
  // LEGACY:       watched_percentage: number;
  // LEGACY:       last_position_sec: number;
  // LEGACY:       completed: boolean;
  // LEGACY:     },
  // LEGACY:   ): Promise<any> => {
  // LEGACY:     const formData = new FormData();
  // LEGACY:     formData.append(
  // LEGACY:       "last_position_sec",
  // LEGACY:       progressData.last_position_sec.toString(),
  // LEGACY:     );
  // LEGACY:     formData.append(
  // LEGACY:       "watched_percentage",
  // LEGACY:       progressData.watched_percentage.toString(),
  // LEGACY:     );
  // LEGACY:     formData.append("completed", progressData.completed.toString());

  // LEGACY:     const response: AxiosResponse<any> = await api.post(
  // LEGACY:       `/videos/${videoId}/progress`,
  // LEGACY:       formData,
  // LEGACY:       {
  // LEGACY:         headers: {
  // LEGACY:           "Content-Type": "multipart/form-data",
  // LEGACY:         },
  // LEGACY:       },
  // LEGACY:     );
  // LEGACY:     return response.data;
  // LEGACY:   },

  // LEGACY:   resetVideoProgress: async (videoId: number): Promise<{ message: string }> => {
  // LEGACY:     const response: AxiosResponse<{ message: string }> = await api.delete(
  // LEGACY:       `/videos/${videoId}/progress`,
  // LEGACY:     );
  // LEGACY:     return response.data;
  // LEGACY:   },

};

// LEGACY: tasksApi — Task / TaskSubmission replaced by exercise blocks on Segment (media_blocks JSONB).
// LEGACY: Replaced by: segment block editor (Segment.media_blocks) + UnitHomeworkSubmission.answers JSONB.
// LEGACY:              Exercise authoring → segment block editor.
// LEGACY:              Student answers / grading → UnitHomeworkSubmission teacher feedback fields.
export const tasksApi = {
  // LEGACY:   // Admin endpoints
  // LEGACY:   getAdminTasks: async (params?: any): Promise<Task[]> => {
  // LEGACY:     const response: AxiosResponse<Task[]> = await api.get(
  // LEGACY:       "/tasks/admin/tasks",
  // LEGACY:       { params },
  // LEGACY:     );
  // LEGACY:     return response.data;
  // LEGACY:   },

  // LEGACY:   getAdminTask: async (id: number): Promise<Task> => {
  // LEGACY:     const response: AxiosResponse<Task> = await api.get(
  // LEGACY:       `/tasks/admin/tasks/${id}`,
  // LEGACY:     );
  // LEGACY:     return response.data;
  // LEGACY:   },

  // LEGACY:   createTask: async (taskData: Partial<Task>): Promise<Task> => {
  // LEGACY:     const response: AxiosResponse<Task> = await api.post(
  // LEGACY:       "/tasks/admin/tasks",
  // LEGACY:       taskData,
  // LEGACY:     );
  // LEGACY:     return response.data;
  // LEGACY:   },

  // LEGACY:   updateTask: async (id: number, taskData: Partial<Task>): Promise<Task> => {
  // LEGACY:     const response: AxiosResponse<Task> = await api.put(
  // LEGACY:       `/tasks/admin/tasks/${id}`,
  // LEGACY:       taskData,
  // LEGACY:     );
  // LEGACY:     return response.data;
  // LEGACY:   },

  // LEGACY:   deleteTask: async (id: number): Promise<void> => {
  // LEGACY:     await api.delete(`/tasks/admin/tasks/${id}`);
  // LEGACY:   },

  // LEGACY:   bulkActionTasks: async (bulkAction: {
  // LEGACY:     task_ids: number[];
  // LEGACY:     action: string;
  // LEGACY:   }): Promise<any> => {
  // LEGACY:     const response: AxiosResponse<any> = await api.post(
  // LEGACY:       "/tasks/admin/tasks/bulk-action",
  // LEGACY:       bulkAction,
  // LEGACY:     );
  // LEGACY:     return response.data;
  // LEGACY:   },

  // LEGACY:   bulkAssignTasks: async (bulkAssign: {
  // LEGACY:     task_ids: number[];
  // LEGACY:     assign_to_all: boolean;
  // LEGACY:     cohort_ids: number[];
  // LEGACY:     student_ids: number[];
  // LEGACY:   }): Promise<any> => {
  // LEGACY:     const response: AxiosResponse<any> = await api.post(
  // LEGACY:       "/tasks/admin/tasks/bulk-assign",
  // LEGACY:       bulkAssign,
  // LEGACY:     );
  // LEGACY:     return response.data;
  // LEGACY:   },

  // LEGACY:   getTaskSubmissions: async (
  // LEGACY:     taskId: number,
  // LEGACY:     params?: any,
  // LEGACY:   ): Promise<TaskSubmission[]> => {
  // LEGACY:     const response: AxiosResponse<TaskSubmission[]> = await api.get(
  // LEGACY:       `/tasks/admin/tasks/${taskId}/submissions`,
  // LEGACY:       { params },
  // LEGACY:     );
  // LEGACY:     return response.data;
  // LEGACY:   },

  // LEGACY:   getTaskSubmission: async (
  // LEGACY:     taskId: number,
  // LEGACY:     submissionId: number,
  // LEGACY:   ): Promise<TaskSubmission> => {
  // LEGACY:     const response: AxiosResponse<TaskSubmission> = await api.get(
  // LEGACY:       `/tasks/admin/tasks/${taskId}/submissions/${submissionId}`,
  // LEGACY:     );
  // LEGACY:     return response.data;
  // LEGACY:   },

  // LEGACY:   gradeSubmission: async (
  // LEGACY:     taskId: number,
  // LEGACY:     submissionId: number,
  // LEGACY:     gradeData: { score: number; feedback_rich?: string },
  // LEGACY:   ): Promise<TaskSubmission> => {
  // LEGACY:     const response: AxiosResponse<TaskSubmission> = await api.post(
  // LEGACY:       `/tasks/admin/tasks/${taskId}/submissions/${submissionId}/grade`,
  // LEGACY:       gradeData,
  // LEGACY:     );
  // LEGACY:     return response.data;
  // LEGACY:   },

  // LEGACY:   getTaskStatistics: async (taskId: number): Promise<any> => {
  // LEGACY:     const response: AxiosResponse<any> = await api.get(
  // LEGACY:       `/tasks/admin/tasks/${taskId}/statistics`,
  // LEGACY:     );
  // LEGACY:     return response.data;
  // LEGACY:   },

  // LEGACY:   getTasks: async (params?: any): Promise<Task[]> => {
  // LEGACY:     const response: AxiosResponse<Task[]> = await api.get("/tasks", { params });
  // LEGACY:     return response.data;
  // LEGACY:   },

  // LEGACY:   getTask: async (id: number): Promise<Task> => {
  // LEGACY:     const response: AxiosResponse<Task> = await api.get(`/tasks/${id}`);
  // LEGACY:     return response.data;
  // LEGACY:   },

  // LEGACY:   submitTask: async (
  // LEGACY:     id: number,
  // LEGACY:     submissionData: Partial<TaskSubmission>,
  // LEGACY:   ): Promise<TaskSubmission> => {
  // LEGACY:     const response: AxiosResponse<TaskSubmission> = await api.post(
  // LEGACY:       `/tasks/${id}/submit`,
  // LEGACY:       submissionData,
  // LEGACY:     );
  // LEGACY:     return response.data;
  // LEGACY:   },

  // LEGACY:   uploadTaskFile: async (
  // LEGACY:     files: File | File[],
  // LEGACY:     fileType: "listening" | "reading",
  // LEGACY:   ): Promise<{
  // LEGACY:     message: string;
  // LEGACY:     files: Array<{
  // LEGACY:       file_path: string;
  // LEGACY:       filename: string;
  // LEGACY:       original_filename: string;
  // LEGACY:       size: number;
  // LEGACY:       url: string;
  // LEGACY:     }>;
  // LEGACY:   }> => {
  // LEGACY:     const formData = new FormData();
  // LEGACY:     const filesArray = Array.isArray(files) ? files : [files];
  // LEGACY:     filesArray.forEach((file) => {
  // LEGACY:       formData.append("files", file);
  // LEGACY:     });
  // LEGACY:     const response: AxiosResponse<{
  // LEGACY:       message: string;
  // LEGACY:       files: Array<{
  // LEGACY:         file_path: string;
  // LEGACY:         filename: string;
  // LEGACY:         original_filename: string;
  // LEGACY:         size: number;
  // LEGACY:         url: string;
  // LEGACY:       }>;
  // LEGACY:     }> = await api.post(
  // LEGACY:       `/tasks/admin/tasks/upload-file?file_type=${fileType}`,
  // LEGACY:       formData,
  // LEGACY:       {
  // LEGACY:         headers: {
  // LEGACY:           "Content-Type": "multipart/form-data",
  // LEGACY:         },
  // LEGACY:       },
  // LEGACY:     );
  // LEGACY:     return response.data;
  // LEGACY:   },

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
// LEGACY: testsApi — Test / TestAttempt / Question replaced by test_without_timer / test_with_timer blocks.
// LEGACY: Replaced by: test_without_timer and test_with_timer exercise blocks in Segment.media_blocks JSONB.
// LEGACY:              Student answers → UnitHomeworkSubmission.answers JSONB.
// LEGACY:              Test constructor routes (addQuestionToTest, publishTest, etc.) are segment editor operations.
export const testsApi = {
  // LEGACY:   getTests: async (params?: any): Promise<PaginatedResponse<Test>> => {
  // LEGACY:     const response: AxiosResponse<PaginatedResponse<Test>> = await api.get(
  // LEGACY:       "/tests",
  // LEGACY:       { params },
  // LEGACY:     );
  // LEGACY:     return response.data;
  // LEGACY:   },

  // LEGACY:   getTest: async (id: number): Promise<Test> => {
  // LEGACY:     const response: AxiosResponse<Test> = await api.get(`/tests/${id}`);
  // LEGACY:     return response.data;
  // LEGACY:   },

  // LEGACY:   createTest: async (testData: Partial<Test>): Promise<Test> => {
  // LEGACY:     const response: AxiosResponse<Test> = await api.post(
  // LEGACY:       "/admin/tests",
  // LEGACY:       testData,
  // LEGACY:     );
  // LEGACY:     return response.data;
  // LEGACY:   },

  // LEGACY:   updateTest: async (id: number, testData: Partial<Test>): Promise<Test> => {
  // LEGACY:     const response: AxiosResponse<Test> = await api.put(
  // LEGACY:       `/admin/tests/${id}`,
  // LEGACY:       testData,
  // LEGACY:     );
  // LEGACY:     return response.data;
  // LEGACY:   },

  // LEGACY:   deleteTest: async (id: number): Promise<void> => {
  // LEGACY:     await api.delete(`/admin/tests/${id}`);
  // LEGACY:   },

  // LEGACY:   startTest: async (id: number): Promise<any> => {
  // LEGACY:     const response: AxiosResponse<any> = await api.post(`/tests/${id}/start`);
  // LEGACY:     return response.data;
  // LEGACY:   },

  // LEGACY:   submitTest: async (
  // LEGACY:     id: number,
  // LEGACY:     answers: Record<string, any>,
  // LEGACY:   ): Promise<any> => {
  // LEGACY:     const response: AxiosResponse<any> = await api.post(`/tests/${id}/submit`, {
  // LEGACY:       answers,
  // LEGACY:     });
  // LEGACY:     return response.data;
  // LEGACY:   },

  // LEGACY:   getTestAttempts: async (id: number): Promise<any> => {
  // LEGACY:     const response: AxiosResponse<any> = await api.get(`/tests/${id}/attempts`);
  // LEGACY:     return response.data;
  // LEGACY:   },

  // LEGACY:   // Test constructor endpoints
  // LEGACY:   addQuestionToTest: async (
  // LEGACY:     testId: number,
  // LEGACY:     questionData: any,
  // LEGACY:   ): Promise<any> => {
  // LEGACY:     const response: AxiosResponse<any> = await api.post(
  // LEGACY:       `/tests/${testId}/questions`,
  // LEGACY:       questionData,
  // LEGACY:     );
  // LEGACY:     return response.data;
  // LEGACY:   },

  // LEGACY:   getTestQuestions: async (testId: number): Promise<any> => {
  // LEGACY:     const response: AxiosResponse<any> = await api.get(
  // LEGACY:       `/tests/${testId}/questions`,
  // LEGACY:     );
  // LEGACY:     return response.data;
  // LEGACY:   },

  // LEGACY:   removeQuestionFromTest: async (
  // LEGACY:     testId: number,
  // LEGACY:     questionId: number,
  // LEGACY:   ): Promise<void> => {
  // LEGACY:     await api.delete(`/tests/${testId}/questions/${questionId}`);
  // LEGACY:   },

  // LEGACY:   regenerateQuestion: async (
  // LEGACY:     testId: number,
  // LEGACY:     questionId: number,
  // LEGACY:   ): Promise<any> => {
  // LEGACY:     const response: AxiosResponse<any> = await api.post(
  // LEGACY:       `/tests/${testId}/questions/${questionId}/regenerate`,
  // LEGACY:     );
  // LEGACY:     return response.data;
  // LEGACY:   },

  // LEGACY:   publishTest: async (testId: number): Promise<any> => {
  // LEGACY:     const response: AxiosResponse<any> = await api.patch(
  // LEGACY:       `/tests/${testId}/publish`,
  // LEGACY:     );
  // LEGACY:     return response.data;
  // LEGACY:   },

  // LEGACY:   unpublishTest: async (testId: number): Promise<any> => {
  // LEGACY:     const response: AxiosResponse<any> = await api.patch(
  // LEGACY:       `/tests/${testId}/unpublish`,
  // LEGACY:     );
  // LEGACY:     return response.data;
  // LEGACY:   },

  // LEGACY:   getTestResources: async (): Promise<any> => {
  // LEGACY:     const response: AxiosResponse<any> = await api.get("/tests/resources/all");
  // LEGACY:     return response.data;
  // LEGACY:   },

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

// LEGACY: studentTestsApi — student-facing test attempt endpoints replaced by segment-based exercises.
// LEGACY: Replaced by: test_without_timer / test_with_timer exercise blocks in Segment.media_blocks JSONB.
// LEGACY:              Student answers → UnitHomeworkSubmission.answers JSONB (PUT /units/{id}/homework/submission).
export const studentTestsApi = {
  // LEGACY:   // 1️⃣ List available tests for student
  // LEGACY:   getTests: async (): Promise<Test[]> => {
  // LEGACY:     const response: AxiosResponse<Test[]> = await api.get("/student/tests");
  // LEGACY:     return response.data;
  // LEGACY:   },

  // LEGACY:   // 2️⃣ Get single test details (student view)
  // LEGACY:   getTest: async (id: number): Promise<Test> => {
  // LEGACY:     const response: AxiosResponse<Test> = await api.get(`/student/tests/${id}`);
  // LEGACY:     return response.data;
  // LEGACY:   },

  // LEGACY:   // 6️⃣ Get attempt history
  // LEGACY:   getTestAttempts: async (id: number): Promise<any> => {
  // LEGACY:     const response: AxiosResponse<any> = await api.get(
  // LEGACY:       `/student/tests/${id}/attempts`,
  // LEGACY:     );
  // LEGACY:     return response.data;
  // LEGACY:   },

  // LEGACY:   // 2️⃣ Start test attempt
  // LEGACY:   startTest: async (id: number): Promise<any> => {
  // LEGACY:     const response: AxiosResponse<any> = await api.post(
  // LEGACY:       `/student/tests/${id}/start`,
  // LEGACY:     );
  // LEGACY:     return response.data;
  // LEGACY:   },

  // LEGACY:   // 4️⃣ Submit test
  // LEGACY:   submitTest: async (
  // LEGACY:     id: number,
  // LEGACY:     answers: Record<string, any>,
  // LEGACY:   ): Promise<any> => {
  // LEGACY:     const response: AxiosResponse<any> = await api.post(
  // LEGACY:       `/student/tests/${id}/submit`,
  // LEGACY:       {
  // LEGACY:         answers,
  // LEGACY:       },
  // LEGACY:     );
  // LEGACY:     return response.data;
  // LEGACY:   },

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

// Teacher tariff catalog, status, and payment ledger (requires teacher JWT).
export const teacherTariffsApi = {
  // Loads newest payment rows for the tariffs "Payments" tab.
  listPayments: async (params?: {
    limit?: number;
    offset?: number;
  }): Promise<TeacherPaymentRecord[]> => {
    const response: AxiosResponse<TeacherPaymentRecord[]> = await api.get(
      "/admin/tariffs/payments",
      { params },
    );
    return Array.isArray(response.data) ? response.data : [];
  },

  // Records a checkout outcome (simulated Pay in UI or future PSP webhook).
  recordPayment: async (body: {
    amount: number;
    currency?: string;
    status?: string;
    plan_code?: string;
    billing_period?: string;
    description?: string;
    provider_ref?: string;
  }): Promise<TeacherPaymentRecord> => {
    const response: AxiosResponse<TeacherPaymentRecord> = await api.post(
      "/admin/tariffs/payments",
      body,
    );
    return response.data;
  },

  // Creates a Stripe PaymentIntent on the backend for checkout confirmation.
  createPaymentIntent: async (body: {
    amount: number;
    currency?: string;
    plan_code?: string;
    billing_period?: string;
  }): Promise<{ client_secret: string; payment_intent_id: string }> => {
    // Stores backend-generated Stripe client secret and payment intent reference.
    const response: AxiosResponse<{
      client_secret: string;
      payment_intent_id: string;
    }> = await api.post("/admin/tariffs/payments/intent", body);
    return response.data;
  },
};

// ─── Classroom Exercise Answers API ──────────────────────────────────────────
//
// Restores the latest saved answer per (block_id, field_key) so the classroom
// can hydrate exercise blocks on load / after a server restart.
//
// GET /classrooms/{classroomId}/exercise-answers
//   Student  → own answers only (server ignores studentId param).
//   Teacher  → all students when studentId omitted; one student otherwise.
//
// Single-student shape:
//   { patches: { "ex/{block}/{field}": value, … }, student_id: N, classroom_id: N }
//
// All-students shape (teacher, no studentId):
//   { students: { "N": { "ex/…": value, … }, … }, classroom_id: N }

export interface ExerciseAnswerPatches {
  patches: Record<string, unknown>;
  student_id: number;
  classroom_id: number;
}

export interface AllStudentAnswers {
  students: Record<string, Record<string, unknown>>;
  classroom_id: number;
}

export interface ExerciseAnswerClearRequest {
  block_id: string;
  student_id?: number;
  unit_id?: number;
  segment_id?: number;
}

export interface ExerciseAnswerClearResponse {
  cleared: boolean;
  rows_written: number;
  block_id: string;
  students_cleared?: number;
}

export const classroomAnswersApi = {
  /**
   * Fetch saved answers for the calling user (student) or a specific student
   * when called by a teacher.  Optionally scoped to a unit or segment.
   */
  getForStudent: async (
    classroomId: number,
    opts?: { studentId?: number; unitId?: number; segmentId?: number },
  ): Promise<ExerciseAnswerPatches> => {
    const response: AxiosResponse<ExerciseAnswerPatches> = await api.get(
      `/classrooms/${classroomId}/exercise-answers`,
      {
        params: {
          ...(opts?.studentId != null ? { student_id:  opts.studentId  } : {}),
          ...(opts?.unitId    != null ? { unit_id:     opts.unitId     } : {}),
          ...(opts?.segmentId != null ? { segment_id:  opts.segmentId  } : {}),
        },
      },
    );
    return response.data;
  },

  /**
   * Teacher only: fetch the latest answers for every student in the classroom.
   * Optionally filtered to a specific unit or segment.
   */
  getAllStudents: async (
    classroomId: number,
    opts?: { unitId?: number; segmentId?: number },
  ): Promise<AllStudentAnswers> => {
    const response: AxiosResponse<AllStudentAnswers> = await api.get(
      `/classrooms/${classroomId}/exercise-answers`,
      {
        params: {
          ...(opts?.unitId    != null ? { unit_id:    opts.unitId    } : {}),
          ...(opts?.segmentId != null ? { segment_id: opts.segmentId } : {}),
        },
      },
    );
    return response.data;
  },

  /**
   * Clear a student's (or all students') answers for a specific exercise block.
   *
   * Writes null-value sentinel rows so the backend's DISTINCT ON query returns
   * null for every field — history is fully preserved, only the "latest" wins.
   *
   * Teacher + student_id  → clears one student's answers for the block.
   * Teacher + no student  → clears ALL students' answers for the block.
   * Student               → always clears only their own answers.
   */
  clearBlockAnswers: async (
    classroomId: number,
    blockId: string,
    opts?: {
      studentId?: number;
      unitId?: number;
      segmentId?: number;
    },
  ): Promise<ExerciseAnswerClearResponse> => {
    const body: ExerciseAnswerClearRequest = {
      block_id: blockId,
      ...(opts?.studentId != null ? { student_id: opts.studentId } : {}),
      ...(opts?.unitId != null ? { unit_id: opts.unitId } : {}),
      ...(opts?.segmentId != null ? { segment_id: opts.segmentId } : {}),
    };
    const response: AxiosResponse<ExerciseAnswerClearResponse> = await api.post(
      `/classrooms/${classroomId}/exercise-answers/clear`,
      body,
    );
    return response.data;
  },
};

export default api;