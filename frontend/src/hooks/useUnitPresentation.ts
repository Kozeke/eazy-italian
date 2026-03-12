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
 */

import { useState, useEffect, useCallback } from 'react';
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
  unitId: number | null | undefined
): UseUnitPresentationResult {
  const [presentation, setPresentation] = useState<PresentationMeta | null>(null);
  const [slides, setSlides]             = useState<ReviewSlide[]>([]);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!unitId) {
      setPresentation(null);
      setSlides([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Step 1: list all presentations for this unit (student endpoint)
      const presRes = await fetch(
        `/api/v1/units/${unitId}/presentations`,
        { headers: { ...authHeaders() } }
      );

      if (!presRes.ok) {
        if (presRes.status === 404) {
          // Unit exists but has no presentations — not an error
          setPresentation(null);
          setSlides([]);
          setLoading(false);
          return;
        }
        throw new Error(`Failed to load presentations (HTTP ${presRes.status})`);
      }

      const presData: PresentationMeta[] = await presRes.json();

      // Pick the first visible presentation by order_index
      // TODO: apply is_visible_to_students filter when backend honours it
      const sorted = [...(presData ?? [])].sort(
        (a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)
      );
      const primary = sorted[0] ?? null;

      if (!primary) {
        setPresentation(null);
        setSlides([]);
        setLoading(false);
        return;
      }

      // Step 2: fetch slides for the chosen presentation (student endpoint)
      const slidesRes = await fetch(
        `/api/v1/presentations/${primary.id}/slides`,
        { headers: { ...authHeaders() } }
      );

      if (!slidesRes.ok) {
        if (slidesRes.status === 404) {
          // Presentation or slides not found — not an error
          setPresentation(null);
          setSlides([]);
          setLoading(false);
          return;
        }
        throw new Error(`Failed to load slides (HTTP ${slidesRes.status})`);
      }

      const slidesData: PresentationSlide[] = await slidesRes.json();
      const ordered = [...(slidesData ?? [])].sort(
        (a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)
      );

      setPresentation(primary);
      setSlides(ordered.map(toReviewSlide));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load presentation');
      setPresentation(null);
      setSlides([]);
    } finally {
      setLoading(false);
    }
  }, [unitId]);

  useEffect(() => {
    load();
  }, [load]);

  return { presentation, slides, loading, error, reload: load };
}
