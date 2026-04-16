/**
 * lessonMode.types.ts  (v3 — removes 'player' BuilderStage)
 *
 * Changes from v2:
 * ─────────────────
 * • 'player' stage removed from BuilderStage. Teachers should never be shown
 *   the student-facing LessonFlow player. After saving, teachers land in
 *   'manual-choice' (ManualBuilderLauncher) instead.
 * • TEACHER_POST_SAVE_STATE updated to 'manual-choice'.
 * • All other types are unchanged.
 */

export type ClassroomMode = 'student' | 'teacher';

/**
 * null            — builder is not active (student mode, or teacher viewing
 *                   content without any builder overlay)
 * 'entry'         — unit is empty; showing the "Create your lesson" entry screen
 * 'manual-choice' — teacher is in ManualBuilderLauncher choosing content type
 * 'editing'       — a specific content editor is open
 */
export type BuilderStage =
  | null
  | 'entry'
  | 'manual-choice'
  | 'editing';

export type ActiveBuilderType = null | 'slides' | 'video' | 'task' | 'test';

export interface BuilderState {
  stage:      BuilderStage;
  activeType: ActiveBuilderType;
}

/** Builder is idle — normal lesson player, no teacher overlay. */
export const INITIAL_BUILDER_STATE: BuilderState = {
  stage:      null,
  activeType: null,
};

/**
 * State entered after a successful save, or when a teacher opens a unit that
 * already has content. stage: null means no builder overlay — teacher sees
 * their content and can add more via an explicit "Add content" action.
 */
export const TEACHER_POST_SAVE_STATE: BuilderState = {
  stage:      null,
  activeType: null,
};