/**
 * useStudentUnit.ts
 *
 * Reusable hook for loading a single unit's full content in the student context.
 *
 * Reused logic
 * ────────────
 * Uses the student-scoped endpoint `unitsApi.getUnit` by default, which
 * requires enrollment check. When `isTeacher` is true it switches to the
 * admin-scoped endpoint `unitsApi.getAdminUnit` so draft or hidden units can
 * still be loaded inside the teacher classroom flow.
 *
 * The hook is intentionally data-only.  It has no navigation or
 * teacher-side edit concerns so it can be dropped into any student
 * page or classroom component without conflict.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { unitsApi } from '../services/api';
import type { HomeworkBlock } from '../services/api';

// ─── Shared domain types (mirror AdminUnitDetailPage) ────────────────────────

export interface StudentVideo {
  id: number;
  title: string;
  description?: string | null;
  status: string;
  source_type: 'file' | 'url' | string;
  external_url?: string | null;
  file_path?: string | null;
  duration_sec: number | null;
  order_index: number;
  is_visible_to_students?: boolean;
}

export interface StudentTask {
  id: number;
  title: string;
  description?: string | null;
  instructions?: string | null;
  content?: string | null;
  status: string;
  type: string;
  order_index: number;
  questions?: Array<{
    id?: number;
    question: string;
    type: string;
    options?: string[];
    correct_answer?: string | number;
    points?: number;
  }>;
  is_visible_to_students?: boolean;
}

export interface StudentTest {
  id: number;
  title: string;
  description?: string | null;
  instructions?: string | null;
  status: string;
  time_limit_minutes: number | null;
  passing_score?: number;
  questions_count?: number;
  order_index: number;
  settings?: {
    max_attempts?: number;
    shuffle_questions?: boolean;
    shuffle_options?: boolean;
    show_results_immediately?: boolean;
    allow_review?: boolean;
  };
  is_visible_to_students?: boolean;
}

export interface StudentSegmentMediaBlock {
  id: string;
  kind: 'image' | 'video' | 'audio' | string;
  url: string;
  caption: string;
}

export interface StudentSegment {
  id: number;
  title: string;
  description?: string | null;
  order_index: number;
  status: string;
  is_visible_to_students?: boolean;
  media_blocks?: StudentSegmentMediaBlock[];
}

// Mirrors backend AttachmentSchema used for unit-level downloadable materials.
export interface StudentUnitAttachment {
  name: string;
  path: string;
  type: string;
}

export interface StudentUnitDetail {
  id: number;
  title: string;
  description: string | null;
  goals: string | null;
  level: string;
  status: string;
  order_index: number;
  course_id: number | null;
  course_title?: string;
  tags?: string[];
  videos: StudentVideo[];
  tasks: StudentTask[];
  tests: StudentTest[];
  content_count: {
    videos: number;
    tasks: number;
    tests: number;
    published_videos: number;
    published_tasks: number;
    published_tests: number;
  };
  segments?: StudentSegment[];
  attachments?: StudentUnitAttachment[];
  /** Mirrors GET /admin/units/:id/homework blocks; included on GET /units/:id for enrolled learners */
  homework_blocks?: HomeworkBlock[];
}

interface UseStudentUnitResult {
  unit: StudentUnitDetail | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useStudentUnit(
  unitId: number | null | undefined,
  isTeacher = false,
): UseStudentUnitResult {
  const [unit, setUnit]       = useState<StudentUnitDetail | null>(null);
  const [loading, setLoading] = useState(Boolean(unitId));
  const [error, setError]     = useState<string | null>(null);
  const activeRequestIdRef = useRef(0);

  const fetch = useCallback(async () => {
    const requestId = ++activeRequestIdRef.current;
    if (!unitId) {
      if (requestId === activeRequestIdRef.current) {
        setUnit(null);
        setError(null);
        setLoading(false);
      }
      return;
    }
    // Clear stale unit content immediately when switching unit ids.
    setUnit(null);
    setLoading(true);
    setError(null);
    try {
      const data = isTeacher
        ? await unitsApi.getAdminUnit(unitId)
        : await unitsApi.getUnit(unitId);
      if (requestId !== activeRequestIdRef.current) return;
      setUnit(data as unknown as StudentUnitDetail);
    } catch (err) {
      if (requestId !== activeRequestIdRef.current) return;
      setError(err instanceof Error ? err.message : 'Could not load unit content');
    } finally {
      if (requestId === activeRequestIdRef.current) {
        setLoading(false);
      }
    }
  }, [isTeacher, unitId]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return useMemo(
    () => ({ unit, loading, error, reload: fetch }),
    [unit, loading, error, fetch],
  );
}
