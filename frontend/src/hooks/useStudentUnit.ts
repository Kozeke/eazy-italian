/**
 * useStudentUnit.ts
 *
 * Reusable hook for loading a single unit's full content in the student context.
 *
 * Reused logic
 * ────────────
 * Uses the student-scoped endpoint `unitsApi.getUnit` which requires
 * enrollment check. Returns unit with nested videos[], tasks[], and tests[]
 * arrays (same shape as AdminUnitDetailPage but filtered for student visibility).
 * No new API routes are introduced.
 *
 * The hook is intentionally data-only.  It has no navigation or
 * teacher-side edit concerns so it can be dropped into any student
 * page or classroom component without conflict.
 */

import { useState, useEffect, useCallback } from 'react';
import { unitsApi } from '../services/api';

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
}

interface UseStudentUnitResult {
  unit: StudentUnitDetail | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useStudentUnit(unitId: number | null | undefined): UseStudentUnitResult {
  const [unit, setUnit]       = useState<StudentUnitDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!unitId) {
      setUnit(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // Use student endpoint which requires enrollment check
      // Returns unit with nested videos[], tasks[], tests[].
      const data = await unitsApi.getUnit(unitId);
      setUnit(data as unknown as StudentUnitDetail);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load unit content');
    } finally {
      setLoading(false);
    }
  }, [unitId]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { unit, loading, error, reload: fetch };
}
