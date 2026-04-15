/**
 * showTeacherExerciseHints.ts
 *
 * Centralises when inline lesson/homework players may reveal correct answers,
 * drag targets, and other pedagogy hints. Students never satisfy this predicate.
 */

import type { LiveRole } from "../../live/liveSession.types";
import type { PlayerMode } from "./VerticalLessonPlayer";

/**
 * Returns true when the current viewer is a teacher in the lesson/homework
 * player (including live classroom role) and may see correct-answer hints.
 */
export function showTeacherExerciseHints(
  mode: PlayerMode,
  liveRole: LiveRole | null | undefined,
): boolean {
  return mode === "teacher" || liveRole === "teacher";
}
