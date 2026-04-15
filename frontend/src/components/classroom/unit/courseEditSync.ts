/**
 * Maps EditCourseModal fields to PUT /admin/courses/{id} payloads and back.
 * UI level labels map to CEFR CourseLevel values; extra tags live in settings JSON.
 */

import type { CourseEditData } from './EditCourseModal';
import type { ClassroomCourse } from '../../../hooks/useClassroom';

// Maps EditCourseModal level labels to API CourseLevel enum values
const UI_LEVEL_TO_CEFR: Record<string, string> = {
  Beginner: 'A1',
  Elementary: 'A2',
  Intermediate: 'B1',
  'Upper-Intermediate': 'B2',
  Advanced: 'C1',
};

// Maps stored CourseLevel strings back to modal dropdown labels
const CEFR_TO_UI_LEVEL: Record<string, string> = {
  A1: 'Beginner',
  A2: 'Elementary',
  B1: 'Intermediate',
  B2: 'Upper-Intermediate',
  C1: 'Advanced',
  C2: 'Advanced',
  mixed: '',
};

/**
 * Shallow-merges patch into existing settings so keys like learning_outcomes are preserved.
 */
function mergeCourseSettings(
  existing: Record<string, unknown> | null | undefined,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const base =
    existing && typeof existing === 'object' && !Array.isArray(existing)
      ? { ...existing }
      : {};
  return { ...base, ...patch };
}

/**
 * Builds props for EditCourseModal from a course row returned by useClassroom.
 */
export function courseToEditModalSeed(course: ClassroomCourse | null): {
  initialDescription: string;
  initialLanguage: string;
  initialSectionsEnabled: boolean;
  initialAge: string;
  initialLevel: string;
  initialType: string;
} {
  const rawSettings = course?.settings;
  const settingsObj =
    rawSettings && typeof rawSettings === 'object' && !Array.isArray(rawSettings)
      ? (rawSettings as Record<string, unknown>)
      : {};
  const apiLevel = course?.level ? String(course.level) : '';
  return {
    initialDescription: course?.description ?? '',
    initialLanguage: String(settingsObj.ui_language ?? 'en'),
    initialSectionsEnabled: Boolean(settingsObj.sections_enabled),
    initialAge: String(settingsObj.age_band ?? ''),
    initialLevel: CEFR_TO_UI_LEVEL[apiLevel] ?? '',
    initialType: String(settingsObj.course_type ?? ''),
  };
}

/**
 * Builds the JSON body for coursesApi.updateCourse from modal output and existing settings.
 */
export function courseEditDataToUpdatePayload(
  data: CourseEditData,
  existingSettings: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const merged = mergeCourseSettings(existingSettings, {
    ui_language: data.language,
    sections_enabled: data.sectionsEnabled,
    age_band: data.age,
    course_type: data.type,
  });
  const cefr = data.level ? UI_LEVEL_TO_CEFR[data.level] : undefined;
  const payload: Record<string, unknown> = {
    title: data.title,
    description: data.description,
    settings: merged,
  };
  if (cefr) {
    payload.level = cefr;
  }
  return payload;
}
