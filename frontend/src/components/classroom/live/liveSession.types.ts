/**
 * liveSession_types.ts  (v3 — evictBlockFromCache)
 *
 * Changes from v2:
 * ─────────────────
 * • LiveSyncContextValue gains:
 *     evictBlockFromCache(blockId)
 *       Synchronously removes ALL cached WS-patch entries for a specific
 *       exercise block from the provider's patchCacheRef before the React
 *       key bump that remounts the block. Without this, subscribe() replays
 *       the stale answer via setTimeout(0) and the reset appears to work
 *       then immediately repopulate.
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
   * Notify the provider of the current lesson context (unit + segment).
   * The values are forwarded as `unit_id` / `segment_id` in every subsequent
   * WS patch message so the backend can store them for later answer restoration.
   *
   * Call whenever the active unit or segment changes in the classroom:
   *   setLessonContext(unit.id, segment?.id ?? null)
   */
  setLessonContext: (unitId: number | null, segmentId: number | null) => void;

  /**
   * Immediately evict all cached WS-patch entries for a specific exercise block
   * from the provider's in-memory patchCacheRef.
   *
   * ── Why this is needed ────────────────────────────────────────────────────
   * When a block is reset (via "Сбросить ответы"), the React key bumps and the
   * component remounts.  The new component's useLiveSyncField calls subscribe(),
   * which synchronously checks patchCacheRef and schedules a setTimeout(0) to
   * replay the cached value into the fresh component.
   *
   * If the cache still holds the old answer, the 1-second markBlockReset guard
   * in useLiveSyncField discards this replay — but only within that 1-second
   * window.  Any subscriber that fires after the window (slow React batches,
   * WS reconnect, REST re-hydration) sees the stale value and repopulates the
   * exercise.
   *
   * Calling evictBlockFromCache(blockId) BEFORE the key bump ensures the cache
   * is empty, so subscribe() finds nothing and no replay is scheduled at all.
   * The guard becomes belt-and-suspenders rather than the only line of defence.
   *
   * ── What is evicted ───────────────────────────────────────────────────────
   * All keys matching  "ex/{blockId}/"   — plain exercise keys (teacher fill &
   *                                         student's own view)
   * All keys matching  "s/{studentId}/ex/{blockId}/" — student-scoped keys in the teacher
   *                                          observation view
   *
   * The lesson/reset_block control key itself is NOT evicted (it's not an
   * exercise-field key and its presence in cache is harmless).
   *
   * ── When to call ──────────────────────────────────────────────────────────
   * • Teacher side  → call from bumpAnswerReset(), before setAnswerResetSeqByBlockId
   * • Student side  → the LiveSessionProvider calls this automatically from
   *                   ws.onmessage when it receives a lesson/reset_block patch
   */
  evictBlockFromCache: (blockId: string) => void;

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