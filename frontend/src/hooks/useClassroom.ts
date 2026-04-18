/**
 * useClassroom.ts  (v2)
 *
 * Classroom-level state: course metadata + unit list.
 * Per-unit content loading is delegated to useStudentUnit — no
 * duplication of unit-detail fetching logic here.
 *
 * Data loading flow
 * ─────────────────
 * 1. Fetch course metadata + units via coursesApi.getCourse (student endpoint)
 *    - getCourse returns course with nested units[] array
 *    - Reuses same endpoint as CourseDetailPage.legacy
 * 2. Extract and sort units from course response
 * 3. Resolve currentUnit from route param (or fallback to first published)
 * 4. Per-unit content (videos, tasks, tests) is loaded by useStudentUnit
 *    inside LessonWorkspace — not here.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { coursesApi } from '../services/api';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ClassroomCourse {
  id: number;
  title: string;
  level?: string;
  description?: string | null;
  thumbnail_url?: string | null;
  /** JSON settings from API — merged when saving course edits (sections, language, tags UI) */
  settings?: Record<string, unknown> | null;
}

export interface ClassroomUnit {
  id: number;
  title: string;
  level?: string;
  status?: string;
  order_index: number;
  is_visible_to_students?: boolean;
  content_count?: {
    videos: number;
    tasks: number;
    tests: number;
    published_videos: number;
    published_tasks: number;
    published_tests: number;
  };
}

export interface ClassroomEnrollment {
  id?: number;
  teacher_name?: string;
  [key: string]: unknown;
}

export interface ClassroomState {
  classroom: ClassroomEnrollment | null;
  course: ClassroomCourse | null;
  units: ClassroomUnit[];
  currentUnit: ClassroomUnit | null;
  loading: boolean;
  error: string | null;
  isUnitSelectorOpen: boolean;
  /** Incremented on every selectUnit call so downstream hooks can re-fetch
   *  even when the same unit is re-selected (effectiveUnitId doesn't change). */
  segmentVersion: number;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useClassroom(
  courseId: string | number | null | undefined,
  initialUnitId?: string | number | null,
  isTeacher?: boolean
) {
  const [state, setState] = useState<ClassroomState>({
    classroom: null,
    course: null,
    units: [],
    currentUnit: null,
    loading: true,
    error: null,
    isUnitSelectorOpen: false,
    segmentVersion: 0,
  });

  const [reloadVersion, setReloadVersion] = useState(0);

  // ── Load course + unit list ───────────────────────────────────────────────
  useEffect(() => {
    if (!courseId) return;
    let cancelled = false;

    const load = async () => {
      setState((s) => {
        if (s.loading && s.error === null) return s;
        return { ...s, loading: true, error: null };
      });
      try {
        // Step 1: course metadata + units
        // Teachers use the admin endpoint so draft/invisible courses load fine.
        const courseResponse = isTeacher
          ? await coursesApi.getAdminCourse(Number(courseId))
          : await coursesApi.getCourse(Number(courseId));
        
        // Extract course data
        const courseData: ClassroomCourse = {
          id: courseResponse.id,
          title: courseResponse.title,
          level: courseResponse.level?.value || courseResponse.level,
          description: courseResponse.description,
          thumbnail_url: courseResponse.thumbnail_url || courseResponse.thumbnail_path,
          settings:
            courseResponse.settings &&
            typeof courseResponse.settings === 'object' &&
            !Array.isArray(courseResponse.settings)
              ? (courseResponse.settings as Record<string, unknown>)
              : null,
        };

        // Step 2: Extract and sort units from the response
        const raw = courseResponse.units || [];
        const sortedUnits: ClassroomUnit[] = (raw ?? []).sort(
          (a: ClassroomUnit, b: ClassroomUnit) =>
            (a.order_index ?? 0) - (b.order_index ?? 0)
        );

        if (cancelled) return;

        // Step 3: resolve initial unit
        let initial: ClassroomUnit | null = null;
        if (initialUnitId) {
          initial = sortedUnits.find((u) => u.id === Number(initialUnitId)) ?? null;
        }
        if (!initial) {
          initial =
            sortedUnits.find((u) => u.status === 'published') ??
            sortedUnits[0] ??
            null;
        }

        setState((s) => ({
          ...s,
          course: courseData,
          units: sortedUnits,
          currentUnit: initial,
          loading: false,
        }));
      } catch (err) {
        if (cancelled) return;
        setState((s) => ({
          ...s,
          loading: false,
          error: err instanceof Error ? err.message : 'Failed to load classroom',
        }));
      }
    };

    load();
    return () => { cancelled = true; };
  }, [courseId, initialUnitId, isTeacher, reloadVersion]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const reloadUnits = useCallback(() => {
    setReloadVersion((v) => v + 1);
  }, []);

  const selectUnit = useCallback((unit: ClassroomUnit) => {
    setState((s) => ({
      ...s,
      currentUnit: unit,
      isUnitSelectorOpen: false,
      segmentVersion: s.segmentVersion + 1,
    }));
  }, []);

  const openUnitSelector = useCallback(
    () => setState((s) => ({ ...s, isUnitSelectorOpen: true })),
    []
  );
  const closeUnitSelector = useCallback(
    () => setState((s) => ({ ...s, isUnitSelectorOpen: false })),
    []
  );

  return useMemo(
    () => ({ state, selectUnit, openUnitSelector, closeUnitSelector, reloadUnits }),
    [state, selectUnit, openUnitSelector, closeUnitSelector, reloadUnits],
  );
}