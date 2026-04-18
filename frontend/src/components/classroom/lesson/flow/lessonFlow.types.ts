/**
 * lessonFlow.types.ts  (v3 — multiple task items per flow)
 *
 * Changes from v2:
 *   • LessonFlowTaskItem gains an optional `label` field so each task pill
 *     can show the task title instead of the generic "Task" string.
 *   • No other structural changes — the union, status type, and LessonFlow
 *     model are unchanged so existing consumers keep working.
 *
 * Runtime note: task rows still use `StudentTask` from ../TaskStep; slide progress
 * type is re-exported from ../SlideStep. Vertical player reaches those UIs via
 * FlowItemRenderer → blocks/SlideBlock.tsx (see exerciseRegistrations.ts).
 */

// Re-export from ../SlideStep — SlidesSection / SlideBlock depend on this shape.
export type { SlideProgress } from '../SlideStep';

// ─── Video progress ───────────────────────────────────────────────────────────

export type VideoProgress = {
  /** 0–1 fraction of the video the student has reached */
  watchedFraction: number;
  /** true once the student has watched past the completion threshold */
  completed: boolean;
};

// ─── Frontend video model (adapter-friendly) ──────────────────────────────────

export type StudentVideo = {
  /** Unique identifier — required */
  id: number | string;

  /** Display title shown above the player */
  title?: string;

  /** Optional short description shown below the title */
  description?: string;

  /**
   * Embeddable URL (iframe src) or a direct video src.
   * Supported providers are detected automatically in VideoStep:
   *   - YouTube  → https://www.youtube.com/watch?v=…  or  https://youtu.be/…
   *   - Vimeo    → https://vimeo.com/…
   *   - Direct   → any other URL is rendered as <video src="…">
   */
  url?: string;

  /**
   * Explicit provider hint — overrides auto-detection.
   */
  provider?: 'youtube' | 'vimeo' | 'direct' | string;

  /**
   * Thumbnail shown while the player is loading or when url is absent.
   */
  thumbnail_url?: string;

  /**
   * Total duration in seconds — used for progress estimation on
   * native <video> elements. Not required for iframe embeds.
   */
  duration_seconds?: number;

  /** Ordering hint within the unit — lower = earlier */
  order?: number;
};

// ─── Lesson flow item status ───────────────────────────────────────────────────

export type LessonFlowItemStatus =
  | 'available'
  | 'in_progress'
  | 'completed'
  | 'locked';

// ─── Individual item types ────────────────────────────────────────────────────

export type LessonFlowSlidesItem = {
  type:            'slides';
  id:              string;
  label?:          string;
  slides:          import('../../../../pages/admin/shared').ReviewSlide[];
  status:          LessonFlowItemStatus;
  locked?:         boolean;
  forcedSlide?:    number;
  /** Backend presentation id — used by teacher Edit Slides button. */
  presentationId?: number;
};

export type LessonFlowTaskItem = {
  type:       'task';
  id:         string;
  /** Display label shown in the pill nav. Falls back to task title or "Task". */
  label?:     string;
  task:       import('../TaskStep').StudentTask;
  submission: unknown;
  status:     LessonFlowItemStatus;
};

export type LessonFlowTestItem = {
  type:    'test';
  id:      string;
  label?:  string;
  test:    import('../../../../hooks/useStudentUnit').StudentTest;
  attempt: unknown;
  status:  LessonFlowItemStatus;
};

/**
 * LessonFlowVideoItem — a first-class video step in the lesson flow.
 */
export type LessonFlowVideoItem = {
  type:      'video';
  id:        string;
  label?:    string;
  video?:    StudentVideo;
  status:    LessonFlowItemStatus;
  /** Prevents the student from interacting (live classroom mode) */
  locked?:   boolean;
};

export type LessonFlowDividerItem = {
  type:   'divider';
  id:     string;
  label?: string;
};

// ─── Union ────────────────────────────────────────────────────────────────────

export type LessonFlowItem =
  | LessonFlowSlidesItem
  | LessonFlowTaskItem
  | LessonFlowTestItem
  | LessonFlowVideoItem
  | LessonFlowDividerItem;

// ─── Top-level model ──────────────────────────────────────────────────────────

export type LessonFlow = {
  items:          LessonFlowItem[];
  totalSteps:     number;
  completedSteps: number;
};