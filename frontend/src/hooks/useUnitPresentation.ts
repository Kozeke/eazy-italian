/**
 * useUnitPresentation.ts
 *
 * Fetches the first published presentation + its slides for a given unit.
 *
 * API surface:
 *   GET /api/v1/units/{unitId}/presentations  (student endpoint with enrollment check)
 *     → PresentationMeta[]  (filtered to published and visible to students)
 *   GET /api/v1/presentations/{presId}/slides  (student endpoint with enrollment check)
 *     → PresentationSlide[]  (only for published presentations visible to students)
 *
 * Selection rule:
 *   Takes the first presentation ordered by order_index (ascending).
 *   If is_visible_to_students is present on the presentation object, only
 *   visible ones are considered.
 *   TODO: If the backend adds a "primary_presentation" flag or a student
 *   visibility filter on this endpoint, apply it here.
 *
 * Teacher classroom (/teacher/classroom/…) uses these same student routes (not
 * GET /admin/units/…/presentations nor GET /admin/presentations/…/slides) so
 * slide hydration shares one code path; course-owning teachers get full deck
 * access on the backend student handlers.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { ReviewSlide } from '../pages/admin/shared';

// ─── API response shapes (from AdminGenerateSlidePage observation) ────────────

export interface PresentationMeta {
  id: number;
  title: string;
  description?: string | null;
  order_index: number;
  is_visible_to_students?: boolean;
  language?: string;
  level?: string;
  created_at?: string;
}

export interface PresentationSlide {
  id: number;
  order_index: number;
  title: string;
  bullet_points?: string[];
  examples?: string[];
  exercise?: string | null;
  teacher_notes?: string | null;
  image_url?: string | null;
  image_alt?: string | null;
}

// ─── What the hook exposes ────────────────────────────────────────────────────

export interface UseUnitPresentationResult {
  presentation: PresentationMeta | null;
  /** Slides normalised to the ReviewSlide shape from shared.ts */
  slides: ReviewSlide[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Converts unknown fetch/parsing failures into a safe user-facing message.
function getPresentationLoadErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    // Hides low-level JSON parser details (for example HTML fallback pages).
    if (error instanceof SyntaxError || /Unexpected token </i.test(error.message)) {
      return 'Slides are temporarily unavailable.';
    }
    return error.message || 'Slides are temporarily unavailable.';
  }
  return 'Slides are temporarily unavailable.';
}

// Safely parses JSON responses and fails with a controlled message.
async function parseJsonResponse<T>(response: Response): Promise<T> {
  // Reads header once to verify this endpoint really returned JSON.
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    throw new Error('Slides are temporarily unavailable.');
  }
  return (await response.json()) as T;
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Normalise a PresentationSlide → ReviewSlide (shared.ts canonical shape). */
function toReviewSlide(s: PresentationSlide): ReviewSlide {
  return {
    id:            String(s.id),
    title:         s.title ?? '',
    bullets:       s.bullet_points ?? [],
    examples:      s.examples ?? [],
    exercise:      s.exercise ?? null,
    teacher_notes: s.teacher_notes ?? null,
    image_url:     s.image_url ?? null,
    image_prompt:  null,
    imageType:     'auto',
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useUnitPresentation(
  unitId: number | null | undefined,
): UseUnitPresentationResult {
  const [presentation, setPresentation] = useState<PresentationMeta | null>(null);
  const [slides, setSlides]             = useState<ReviewSlide[]>([]);
  // No network load while presentation GETs are disabled; avoids a one-frame "loading" flash
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const activeRequestIdRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++activeRequestIdRef.current;
    if (!unitId) {
      if (requestId === activeRequestIdRef.current) {
        setPresentation(null);
        setSlides((prev) => (prev.length > 0 ? [] : prev));
        setError(null);
        setLoading(false);
      }
      return;
    }

    // Reset previous unit slides immediately to avoid stale render.
    setPresentation(null);
    setSlides((prev) => (prev.length > 0 ? [] : prev));
    setLoading(false);
    setError(null);

    // Disabled: no GET /api/v1/units/{unitId}/presentations nor GET /api/v1/presentations/{id}/slides
    /*
    setLoading(true);
    setError(null);

    try {
      // Step 1: list presentations for this unit (student-scoped URL; teachers use course-owner bypass on backend)
      const presRes = await fetch(`/api/v1/units/${unitId}/presentations`, {
        headers: { ...authHeaders() },
      });

      if (!presRes.ok) {
        if (presRes.status === 404) {
          // Unit exists but has no presentations — not an error
          if (requestId !== activeRequestIdRef.current) return;
          setPresentation(null);
          setSlides([]);
          setLoading(false);
          return;
        }
        throw new Error(`Failed to load presentations (HTTP ${presRes.status})`);
      }

      const presData = await parseJsonResponse<PresentationMeta[]>(presRes);

      // Pick the first visible presentation by order_index
      // TODO: apply is_visible_to_students filter when backend honours it
      const sorted = [...(presData ?? [])].sort(
        (a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)
      );
      const primary = sorted[0] ?? null;

      if (!primary) {
        if (requestId !== activeRequestIdRef.current) return;
        setPresentation(null);
        setSlides([]);
        setLoading(false);
        return;
      }

      // Step 2: fetch slides (student-scoped URL; avoids GET /admin/presentations/:id/slides)
      const slidesRes = await fetch(`/api/v1/presentations/${primary.id}/slides`, {
        headers: { ...authHeaders() },
      });

      if (!slidesRes.ok) {
        if (slidesRes.status === 404) {
          // Presentation or slides not found — not an error
          if (requestId !== activeRequestIdRef.current) return;
          setPresentation(null);
          setSlides([]);
          setLoading(false);
          return;
        }
        throw new Error(`Failed to load slides (HTTP ${slidesRes.status})`);
      }

      const slidesData = await parseJsonResponse<PresentationSlide[]>(slidesRes);
      const ordered = [...(slidesData ?? [])].sort(
        (a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)
      );

      if (requestId !== activeRequestIdRef.current) return;
      setPresentation(primary);
      setSlides(ordered.map(toReviewSlide));
    } catch (err) {
      if (requestId !== activeRequestIdRef.current) return;
      setError(getPresentationLoadErrorMessage(err));
      setPresentation(null);
      setSlides([]);
    } finally {
      if (requestId === activeRequestIdRef.current) {
        setLoading(false);
      }
    }
    */
  }, [unitId]);

  useEffect(() => {
    load();
  }, [load]);

  return useMemo(
    () => ({ presentation, slides, loading, error, reload: load }),
    [presentation, slides, loading, error, load],
  );
}
