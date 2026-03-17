/**
 * lessonFlow.builder.ts  (v3 — multiple task items per flow)
 *
 * Changes from v2:
 * ─────────────────
 * • `BuildLessonFlowOptions` replaces the single `primaryTask` / `taskSubmission`
 *   pair with:
 *     - `tasks`: all tasks from unit.tasks[], sorted by order_index
 *     - `taskSubmissionsById`: a map of taskId → TaskSubmission | null
 *
 *   Each task in the array becomes its own LessonFlowTaskItem in the flow:
 *     slides → video(s) → task-1 → task-2 → … → test
 *
 * • `selectPrimaryItem` is kept for callers that still need it (e.g. selecting
 *   the primary test). It is no longer used internally for tasks.
 *
 * • `primaryTest` / `testAttempt` are unchanged.
 *
 * • `videos`, `videoCompletions`, `forcedSlide`, `locked` are unchanged.
 *
 * • totalSteps and completedSteps count every item including all task items.
 */

import type {
  LessonFlow,
  LessonFlowItem,
  LessonFlowItemStatus,
  LessonFlowSlidesItem,
  LessonFlowTaskItem,
  LessonFlowTestItem,
  LessonFlowVideoItem,
  StudentVideo,
} from './lessonFlow.types.ts';

import type { ReviewSlide } from '../../../../pages/admin/shared';

// ─── Re-export for consumers that imported from here ─────────────────────────

export type { LessonFlow, LessonFlowItem };

// ─── selectPrimaryItem ────────────────────────────────────────────────────────

/**
 * Returns the first item from a list sorted by `order_index`.
 * Used to resolve the primary test for a unit.
 */
export function selectPrimaryItem<T extends { order_index?: number }>(
  items: T[],
): T | null {
  if (!items.length) return null;
  const sorted = [...items].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
  return sorted[0];
}

// ─── BuildLessonFlowOptions ───────────────────────────────────────────────────

export interface BuildLessonFlowOptions {
  slides:          ReviewSlide[];
  viewedSlideIds:  string[];
  slidesCompleted: boolean;

  /**
   * All published tasks for this unit, in any order.
   * The builder sorts them by order_index and emits one LessonFlowTaskItem
   * per task.  Pass `unit.tasks ?? []`.
   */
  tasks:                 any[];
  /**
   * Map of task id (number | string) → submission object or null.
   * Used to mark each task item as 'completed' when a submission exists.
   */
  taskSubmissionsById:   Record<string | number, any>;

  primaryTest:     any | null;
  testAttempt:     any;

  videos?:         StudentVideo[];
  videoCompletions?: Record<string, boolean>;

  forcedSlide?:    number | null;
  locked?:         boolean;
}

// ─── Status helpers ───────────────────────────────────────────────────────────

function slidesStatus(
  slides:          ReviewSlide[],
  slidesCompleted: boolean,
  viewedSlideIds:  string[],
): LessonFlowItemStatus {
  if (!slides.length)            return 'available';
  if (slidesCompleted)           return 'completed';
  if (viewedSlideIds.length > 0) return 'in_progress';
  return 'available';
}

function taskStatus(taskId: number | string, submissionsById: Record<string | number, any>): LessonFlowItemStatus {
  if (submissionsById[taskId]) return 'completed';
  return 'available';
}

function testStatus(attempt: any): LessonFlowItemStatus {
  if (attempt) return 'completed';
  return 'available';
}

function videoStatus(
  videoId:          number | string,
  videoCompletions: Record<string, boolean>,
): LessonFlowItemStatus {
  if (videoCompletions[String(videoId)]) return 'completed';
  return 'available';
}

// ─── buildLessonFlow ──────────────────────────────────────────────────────────

export function buildLessonFlow({
  slides,
  viewedSlideIds,
  slidesCompleted,
  tasks = [],
  taskSubmissionsById = {},
  primaryTest,
  testAttempt,
  videos = [],
  videoCompletions = {},
  forcedSlide,
  locked = false,
}: BuildLessonFlowOptions): LessonFlow {
  const items: LessonFlowItem[] = [];

  // ── Slides ──────────────────────────────────────────────────────────────────
  if (slides.length > 0) {
    const slidesItem: LessonFlowSlidesItem = {
      type:        'slides',
      id:          'slides-main',
      label:       'Lesson Slides',
      slides,
      status:      slidesStatus(slides, slidesCompleted, viewedSlideIds),
      locked:      locked,
      forcedSlide: forcedSlide ?? undefined,
    };
    items.push(slidesItem);
  }

  // ── Videos ──────────────────────────────────────────────────────────────────
  const sortedVideos = [...videos].sort((a, b) => {
    const ao = a.order ?? 9999;
    const bo = b.order ?? 9999;
    if (ao !== bo) return ao - bo;
    return String(a.id).localeCompare(String(b.id));
  });

  for (const video of sortedVideos) {
    const videoItem: LessonFlowVideoItem = {
      type:   'video',
      id:     `video-${video.id}`,
      label:  video.title ?? 'Video',
      video,
      status: videoStatus(video.id, videoCompletions),
      locked: locked,
    };
    items.push(videoItem);
  }

  // ── Tasks (all of them, sorted by order_index) ──────────────────────────────
  const publishedTasks = tasks
    .filter((t: any) => {
      // Include all tasks; filter out explicitly hidden ones if the field exists
      if (t.is_visible_to_students === false) return false;
      return true;
    })
    .sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0));

  for (const task of publishedTasks) {
    const taskItem: LessonFlowTaskItem = {
      type:       'task',
      id:         `task-${task.id}`,
      // Use task title as the pill label; truncate long titles
      label:      task.title ? (task.title.length > 24 ? task.title.slice(0, 22) + '…' : task.title) : 'Task',
      task,
      submission: taskSubmissionsById[task.id] ?? null,
      status:     taskStatus(task.id, taskSubmissionsById),
    };
    items.push(taskItem);
  }

  // ── Test ────────────────────────────────────────────────────────────────────
  if (primaryTest) {
    const testItem: LessonFlowTestItem = {
      type:    'test',
      id:      `test-${primaryTest.id}`,
      test:    primaryTest,
      attempt: testAttempt ?? null,
      status:  testStatus(testAttempt),
    };
    items.push(testItem);
  }

  // ── Tally ───────────────────────────────────────────────────────────────────
  const totalSteps     = items.length;
  const completedSteps = items.filter((i) => (i as any).status === 'completed').length;

  return { items, totalSteps, completedSteps };
}