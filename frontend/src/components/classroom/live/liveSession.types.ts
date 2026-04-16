/**
 * liveSession_types.ts  (v2 — multi-student observer support)
 *
 * Changes from v1:
 * ─────────────────
 * • LiveSyncContextValue gains:
 *     userId            — current user's ID (exposed from provider)
 *     observedStudentId — which student the teacher is currently watching
 *     setObservedStudentId — setter to switch observed student
 *
 * ─── Key convention (updated) ─────────────────────────────────────────────────
 *   Teacher patches  →  "ex/{exerciseId}/{fieldId}"        (no prefix)
 *   Student patches  →  "s/{userId}/ex/{exerciseId}/{fieldId}"  (auto-prefixed)
 *
 *   The LiveSessionProvider handles the prefixing transparently:
 *   • Students call patch("ex/…", v) — provider sends "s/{userId}/ex/…"
 *   • Teachers call subscribe("ex/…", h) — when observedStudentId is set,
 *     provider internally subscribes to "s/{observedStudentId}/ex/…"
 */

export type LiveRole = "teacher" | "student";

export interface LiveSyncContextValue {
  /**
   * Emit a patch over the live WebSocket.
   *
   * Both teachers and students may call this with the same plain key
   * ("ex/exerciseId/fieldId"). The provider handles namespacing:
   * • Teacher → sends the key as-is (broadcast to students)
   * • Student → auto-prefixes with "s/{userId}/" before sending
   *
   * The server persists all values and relays them to the room.
   */
  patch: (key: string, value: unknown) => void;

  /**
   * Subscribe to remote patches for a given key.
   * Returns an unsubscribe function.
   *
   * For teachers: when observedStudentId is set, internally maps
   * "ex/…" → "s/{observedStudentId}/ex/…" so the teacher sees the
   * selected student's inputs without any call-site changes.
   * Fires immediately with the cached value if one exists.
   */
  subscribe: (key: string, handler: (value: unknown) => void) => () => void;

  /** true once the WS handshake is complete */
  connected: boolean;

  role: LiveRole;

  /** The current user's ID (same value passed to <LiveSessionProvider userId={…}>) */
  userId: number | string | null | undefined;

  /**
   * Teacher only: which student's exercise inputs are currently being observed.
   * null  → teacher sees their own patches (standard guided-fill mode).
   * N     → teacher's subscribe() calls are internally redirected to that
   *          student's scoped keys ("s/{N}/ex/…").
   */
  observedStudentId: number | null;

  /**
   * Set the observed student. Pass null to return to standard mode.
   * Automatically triggers re-subscription in all active exercise blocks.
   */
  setObservedStudentId: (id: number | null) => void;

  /**
   * Snapshot of logical homework keys (`hwu/…`) the current student has patched
   * since load (used for REST persistence).
   */
  getHomeworkLogicalAnswersSnapshot: () => Record<string, unknown>;

  /**
   * Student: seed local live cache + snapshot ref after loading homework from REST.
   */
  applyHomeworkHydrationForStudent: (patches: Record<string, unknown>) => void;

  /**
   * Teacher: load one student's saved homework into the scoped WS cache so blocks render it.
   */
  applyTeacherHomeworkObserveHydration: (
    studentId: number,
    patches: Record<string, unknown>,
  ) => void;
}

// ─── WS wire shapes ───────────────────────────────────────────────────────────

export interface WsPatch {
  type: "patch";
  key: string;
  value: unknown;
}
export interface WsSnapshot {
  type: "snapshot";
  patches: Record<string, unknown>;
}

/**
 * High‑level live session payload used by the dedicated live transport.
 * The backend may attach extra fields; the frontend only relies on the
 * documented ones.
 */
export interface LiveSessionPayload {
  classroom_id: number;
  unit_id: number | null;
  slide_index: number | null;
  /**
   * Currently active section in the lesson player.
   * `"slides"`  → presentation slides
   * `"task"`    → inline tasks
   * `"test"`    → inline tests
   */
  section: "slides" | "task" | "test" | null;
  teacher_id?: number | null;
  student_count?: number | null;
  timestamp?: number;
  [key: string]: unknown;
}

/** Canonical event names sent over the live WebSocket channel. */
export type LiveEventName =
  | "SESSION_STARTED"
  | "SESSION_ENDED"
  | "SLIDE_CHANGED"
  | "SECTION_CHANGED"
  | "UNIT_CHANGED"
  | "STUDENT_JOINED"
  | "STUDENT_LEFT";

/** Raw WS message envelope used by `liveSessionTransport.ts`. */
export interface LiveSocketMessage {
  event: LiveEventName;
  payload: LiveSessionPayload;
}

// ─── Lesson UI (teacher → students) ───────────────────────────────────────────
/** Teacher patches this; student lesson players scroll `[data-lesson-focus-anchor]` into view */
export const LIVE_LESSON_FOCUS_BLOCK_KEY = "lesson/focus_block" as const;

/** Payload for LIVE_LESSON_FOCUS_BLOCK_KEY — `t` forces a new patch when re-focusing the same block */
export interface LiveLessonFocusPayload {
  blockId: string;
  t: number;
}

/**
 * Teacher patches this to clear ALL students' answers for a specific block.
 * Students subscribe and remount the FlowItemRenderer for the given blockId.
 * `t` ensures a new patch is always broadcast even when the same block is reset twice.
 */
export const LIVE_LESSON_RESET_BLOCK_KEY = "lesson/reset_block" as const;

/** Payload for LIVE_LESSON_RESET_BLOCK_KEY */
export interface LiveLessonResetBlockPayload {
  blockId: string;
  t: number;
}

// ─── Live lesson section model ────────────────────────────────────────────────

export interface LiveSection {
  id: string;
  label: string;
}
