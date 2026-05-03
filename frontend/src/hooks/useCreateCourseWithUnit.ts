/**
 * useCreateCourseWithUnit.ts
 *
 * Drop-in hook for the "Create Course" submit flow.
 *
 * Usage in AdminCourseCreatePage (or any course-creation modal):
 *
 *   const { createCourseWithUnit, loading, error } = useCreateCourseWithUnit();
 *
 *   const handleSubmit = async (courseTitle: string) => {
 *     const result = await createCourseWithUnit(courseTitle);
 *     if (result) {
 *       navigate(`/student/classroom/${result.courseId}/${result.unitId}`);
 *     }
 *   };
 *
 * What it does:
 *   1. POST /api/v1/admin/courses  → creates the course
 *   2. POST /api/v1/admin/units    → creates "Unit 1" linked to that course
 *   3. Returns { courseId, unitId } so the caller can navigate directly
 *
 * The caller should navigate to /student/classroom/:courseId/:unitId
 * so ClassroomPage boots with Unit 1 already selected — no empty state.
 */

import { useState, useCallback } from 'react';
import { API_V1_BASE } from '../services/api';

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('token') ?? '';
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

interface CreateCourseWithUnitResult {
  courseId: number;
  unitId: number;
}

interface UseCreateCourseWithUnitReturn {
  createCourseWithUnit: (
    courseTitle: string,
    /** Optional extra fields forwarded to the course create payload */
    courseExtra?: Record<string, unknown>,
  ) => Promise<CreateCourseWithUnitResult | null>;
  loading: boolean;
  error: string | null;
}

export function useCreateCourseWithUnit(): UseCreateCourseWithUnitReturn {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const createCourseWithUnit = useCallback(
    async (
      courseTitle: string,
      courseExtra: Record<string, unknown> = {},
    ): Promise<CreateCourseWithUnitResult | null> => {
      setLoading(true);
      setError(null);

      try {
        // ── Step 1: Create the course ─────────────────────────────────────
        const courseRes = await fetch(`${API_V1_BASE}/admin/courses`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ title: courseTitle, ...courseExtra }),
        });

        if (!courseRes.ok) {
          const body = await courseRes.json().catch(() => ({}));
          throw new Error(body?.detail ?? `Course creation failed (${courseRes.status})`);
        }

        const course = await courseRes.json();
        const courseId: number = course.id;

        // ── Step 2: Create "Unit 1" linked to that course ─────────────────
        // UnitCreate schema requires: title (str), level (UnitLevel).
        // level defaults to 'A1' — the safest minimum-valid value.
        const unitRes = await fetch(`${API_V1_BASE}/admin/units`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({
            title: 'Unit 1',
            level: 'A1',
            course_id: courseId,
            order_index: 0,
          }),
        });

        if (!unitRes.ok) {
          const body = await unitRes.json().catch(() => ({}));
          throw new Error(body?.detail ?? `Unit creation failed (${unitRes.status})`);
        }

        const unit = await unitRes.json();
        const unitId: number = unit.id;

        return { courseId, unitId };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unexpected error';
        setError(message);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return { createCourseWithUnit, loading, error };
}