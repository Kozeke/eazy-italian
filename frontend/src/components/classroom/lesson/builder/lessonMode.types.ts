/**
 * lessonMode.types.ts
 *
 * Shared discriminated types for the classroom mode system.
 * Both ClassroomPage and LessonWorkspace import from here so the
 * mode contract is defined in exactly one place.
 */

// ─── Classroom mode ───────────────────────────────────────────────────────────

/**
 * 'student' — read-only lesson runtime, exactly as before.
 * 'teacher' — adds builder affordances when the unit is empty,
 *             and will eventually surface inline editing controls.
 */
export type ClassroomMode = 'student' | 'teacher';

// ─── Builder stage ─────────────────────────────────────────────────────────────

/**
 * Tracks the teacher's progression through the in-classroom builder wizard.
 *
 * null         — builder is not active (student mode, or unit has content)
 * 'entry'      — unit is empty; showing the "Create your lesson" entry screen
 * 'manual-choice' — teacher clicked "Manually"; show content-type picker
 * 'editing'    — a specific content editor is open (e.g. slides, task, test)
 */
export type BuilderStage = null | 'entry' | 'manual-choice' | 'editing';

/**
 * The type of content the teacher is currently building.
 * null when no specific editor is open yet.
 */
export type ActiveBuilderType = null | 'slides' | 'video' | 'task' | 'test';

// ─── Builder state ─────────────────────────────────────────────────────────────

export interface BuilderState {
  stage:      BuilderStage;
  activeType: ActiveBuilderType;
}

export const INITIAL_BUILDER_STATE: BuilderState = {
  stage:      null,
  activeType: null,
};