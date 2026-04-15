/**
 * useSegmentPersistence.ts
 *
 * Owns all segment autosave and hydration logic previously in LessonWorkspace.
 * Lives in the same folder as LessonWorkspace.tsx.
 *
 * Responsibilities:
 *   • Fetch segments from the API (teacher mode)
 *   • Hydrate inlineMediaBySectionId and carouselSlidesBySectionId from server data
 *   • Debounced autosave (500 ms) on every change
 *   • Flush saves on unmount / before navigation
 *   • Reset all state when the active unit changes
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { segmentsApi } from "../services/api";
import api from "../services/api";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface InlineMediaBlock {
  id: string;
  kind:
    | "image"
    | "video"
    | "audio"
    | "carousel_slides"
    | "drag_to_gap"
    | "drag_to_image"
    | "type_word_to_image"
    | "select_form_to_image"
    | "type_word_in_gap"
    | "select_word_form"
    | "build_sentence"
    | "match_pairs"
    | "order_paragraphs"
    | "sort_into_columns"
    | "test_without_timer"
    | "test_with_timer";
  url?: string;
  caption?: string;
  slides?: Array<{ id: string; [k: string]: unknown }>;
  title?: string;
  data?: Record<string, unknown>;
}

export interface CarouselSlide {
  id: string;
  url: string;
  caption: string;
  [key: string]: unknown;
}

export interface UnitSegment {
  id: number;
  title?: string;
  order_index?: number;
  media_blocks?: InlineMediaBlock[];
  carousel_slides?: CarouselSlide[];
}

// ─── Pure helpers (exported for use in LessonWorkspace) ──────────────────────

export function normaliseInlineMediaBlocks(blocks: unknown): InlineMediaBlock[] {
  if (!Array.isArray(blocks)) return [];
  return blocks
    .filter((b): b is Record<string, unknown> => Boolean(b) && typeof b === "object")
    .map((b) => ({
      id: String(b.id ?? ""),
      kind: String(b.kind ?? "").toLowerCase() as InlineMediaBlock["kind"],
      url: String(b.url ?? ""),
      caption: String(b.caption ?? ""),
      title: String(b.title ?? ""),
      data:
        b.data && typeof b.data === "object" && !Array.isArray(b.data)
          ? (b.data as Record<string, unknown>)
          : undefined,
      ...(Array.isArray(b.slides) ? { slides: b.slides as CarouselSlide[] } : {}),
    }))
    .filter(
      (b) =>
        Boolean(b.id) &&
        ["image", "video", "audio", "carousel_slides", "drag_to_gap", "drag_to_image", "type_word_to_image", "select_form_to_image", "type_word_in_gap", "select_word_form", "build_sentence", "match_pairs", "order_paragraphs", "sort_into_columns", "test_without_timer", "test_with_timer"].includes(
          b.kind,
        ),
    );
}

export function normaliseCarouselSlides(slides: unknown): CarouselSlide[] {
  if (!Array.isArray(slides)) return [];
  return slides
    .filter((s): s is Record<string, unknown> => Boolean(s) && typeof s === "object")
    .map((s) => ({
      id: String(s.id ?? Math.random().toString(36).slice(2, 10)),
      url: String(s.url ?? ""),
      caption: String(s.caption ?? ""),
    }));
}

export function getSortedSegments(segments?: UnitSegment[]): UnitSegment[] {
  return [...(segments ?? [])].sort(
    (a, b) => (a.order_index ?? 0) - (b.order_index ?? 0),
  );
}

export function resolveSegmentIdForSection(
  sectionId: string,
  segments: UnitSegment[],
): number | null {
  if (segments.length === 0) return null;
  const rawId = Number(sectionId.replace(/^section-/, ""));
  if (Number.isFinite(rawId)) {
    const direct = segments.find((s) => s.id === rawId);
    if (direct) return direct.id;
    if (rawId >= 0 && rawId < segments.length) return segments[rawId].id;
  }
  return sectionId === "section-0" ? segments[0].id : null;
}

function buildInlineMediaBySectionId(
  segments: UnitSegment[],
): Record<string, InlineMediaBlock[]> {
  return segments.reduce<Record<string, InlineMediaBlock[]>>((acc, seg, i) => {
    const blocks = normaliseInlineMediaBlocks(seg.media_blocks);
    if (blocks.length > 0) acc[`section-${i}`] = blocks;
    return acc;
  }, {});
}

function buildCarouselSlidesBySectionId(
  segments: UnitSegment[],
): Record<string, CarouselSlide[]> {
  return segments.reduce<Record<string, CarouselSlide[]>>((acc, seg, i) => {
    const slides = normaliseCarouselSlides(seg.carousel_slides);
    if (slides.length > 0) acc[`section-${i}`] = slides;
    return acc;
  }, {});
}

function buildSignatureMap(
  mediaBySectionId: Record<string, InlineMediaBlock[]>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(mediaBySectionId).map(([id, blocks]) => [
      id,
      JSON.stringify(normaliseInlineMediaBlocks(blocks)),
    ]),
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

interface Options {
  effectiveUnitId: number | null;
  mode: "student" | "teacher";
  /** @deprecated ignored — kept so existing callers don't break */
  refreshKey?: number;
  /**
   * In student mode the main unit endpoint already returns segments with full
   * media_blocks.  Pass them here so we skip the separate /segments fetch
   * (which returns segments WITHOUT media_blocks) and seed the hydration
   * directly from the data we already have.
   */
  unitSegments?: UnitSegment[];
}

export function useSegmentPersistence({ effectiveUnitId, mode, unitSegments }: Options) {
  // ── Fetch segments ───────────────────────────────────────────────────────────
  const [fetchedSegments, setFetchedSegments] = useState<UnitSegment[]>([]);

  // In student mode we use the segments that come embedded in the unit response
  // (they already contain media_blocks).  Making a separate /segments call in
  // student mode returns lightweight segment objects WITHOUT media_blocks, which
  // causes inlineMediaBySectionId to stay empty and exercises never render.
  const isStudent = mode === "student";

  const refetchSegments = useCallback(async () => {
    if (isStudent) return; // students rely on unitSegments prop
    if (!effectiveUnitId) {
      setFetchedSegments([]);
      return;
    }
    try {
      const { data } = await api.get<UnitSegment[]>(
        `/admin/units/${effectiveUnitId}/segments`,
      );
      setFetchedSegments(getSortedSegments(data ?? []));
    } catch {
      setFetchedSegments([]);
    }
  }, [effectiveUnitId, isStudent]);

  // Teacher: fetch from the admin segments endpoint
  useEffect(() => {
    if (isStudent) return; // handled by the unitSegments sync below
    let cancelled = false;
    if (!effectiveUnitId) {
      setFetchedSegments([]);
      return;
    }
    void api
      .get<UnitSegment[]>(`/admin/units/${effectiveUnitId}/segments`)
      .then(({ data }) => {
        if (!cancelled) setFetchedSegments(getSortedSegments(data ?? []));
      })
      .catch(() => {
        if (!cancelled) setFetchedSegments([]);
      });
    return () => {
      cancelled = true;
    };
  }, [effectiveUnitId, isStudent]);

  // Student: sync directly from the unit's embedded segments (already have media_blocks)
  useEffect(() => {
    if (!isStudent) return;
    setFetchedSegments(getSortedSegments(unitSegments ?? []));
  }, [isStudent, unitSegments]);

  // ── State ────────────────────────────────────────────────────────────────────
  const [inlineMediaBySectionId, setInlineMediaBySectionId] = useState<
    Record<string, InlineMediaBlock[]>
  >({});
  const [carouselSlidesBySectionId, setCarouselSlidesBySectionId] = useState<
    Record<string, CarouselSlide[]>
  >({});

  // Always-current refs for timers / flush
  const inlineMediaRef = useRef(inlineMediaBySectionId);
  const carouselRef = useRef(carouselSlidesBySectionId);
  const segmentsRef = useRef(fetchedSegments);
  useEffect(() => { inlineMediaRef.current = inlineMediaBySectionId; }, [inlineMediaBySectionId]);
  useEffect(() => { carouselRef.current = carouselSlidesBySectionId; }, [carouselSlidesBySectionId]);
  useEffect(() => { segmentsRef.current = fetchedSegments; }, [fetchedSegments]);

  // ── Save-tracking ────────────────────────────────────────────────────────────
  const lastSavedMediaSigRef = useRef<Record<string, string>>({});
  const lastSavedCarouselSigRef = useRef<Record<string, string>>({});
  const lastHydratedMediaKeyRef = useRef<string | null>(null);
  const lastHydratedCarouselKeyRef = useRef<string | null>(null);
  const userEditedMediaRef = useRef(new Set<string>());
  const userEditedCarouselRef = useRef(new Set<string>());
  const mediaSaveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const carouselSaveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const loadedMedia = useMemo(
    () => buildInlineMediaBySectionId(fetchedSegments),
    [fetchedSegments],
  );
  const loadedCarousel = useMemo(
    () => buildCarouselSlidesBySectionId(fetchedSegments),
    [fetchedSegments],
  );

  // ── Unit-change reset ────────────────────────────────────────────────────────
  const prevUnitIdRef = useRef<number | null | undefined>(undefined);
  useEffect(() => {
    const prev = prevUnitIdRef.current;
    if (prev === undefined) { prevUnitIdRef.current = effectiveUnitId; return; }
    if (effectiveUnitId != null && prev != null && effectiveUnitId !== prev) {
      Object.values(mediaSaveTimers.current).forEach(clearTimeout);
      mediaSaveTimers.current = {};
      Object.values(carouselSaveTimers.current).forEach(clearTimeout);
      carouselSaveTimers.current = {};
      setInlineMediaBySectionId({});
      setCarouselSlidesBySectionId({});
      setFetchedSegments([]);
      lastSavedMediaSigRef.current = {};
      lastSavedCarouselSigRef.current = {};
      userEditedMediaRef.current = new Set();
      userEditedCarouselRef.current = new Set();
      lastHydratedMediaKeyRef.current = null;
      lastHydratedCarouselKeyRef.current = null;
    }
    prevUnitIdRef.current = effectiveUnitId;
  }, [effectiveUnitId]);

  // ── Hydration: inline media ──────────────────────────────────────────────────
  useEffect(() => {
    if (effectiveUnitId == null) return;
    const key = `${effectiveUnitId}:${JSON.stringify(loadedMedia)}`;
    if (lastHydratedMediaKeyRef.current === key) return;

    setInlineMediaBySectionId((prev) => {
      const merged: Record<string, InlineMediaBlock[]> = {};
      for (const [sid, serverBlocks] of Object.entries(loadedMedia)) {
        const localOnly = (prev[sid] ?? []).filter(
          (b) => !serverBlocks.some((sb) => sb.id === b.id),
        );
        merged[sid] = localOnly.length > 0 ? [...serverBlocks, ...localOnly] : serverBlocks;
      }
      for (const [sid, blocks] of Object.entries(prev)) {
        if (!(sid in merged) && blocks.length > 0) merged[sid] = blocks;
      }
      return merged;
    });
    lastSavedMediaSigRef.current = buildSignatureMap(loadedMedia);
    lastHydratedMediaKeyRef.current = key;
  }, [effectiveUnitId, loadedMedia]);

  // ── Hydration: carousel ──────────────────────────────────────────────────────
  useEffect(() => {
    if (effectiveUnitId == null) return;
    const key = `${effectiveUnitId}:carousel:${JSON.stringify(loadedCarousel)}`;
    if (lastHydratedCarouselKeyRef.current === key) return;

    setCarouselSlidesBySectionId((prev) => {
      const merged: Record<string, CarouselSlide[]> = { ...loadedCarousel };
      for (const [sid, slides] of Object.entries(prev)) {
        if (!(sid in merged) && slides.length > 0) merged[sid] = slides;
      }
      return merged;
    });
    for (const [sid, slides] of Object.entries(loadedCarousel)) {
      lastSavedCarouselSigRef.current[sid] = JSON.stringify(slides);
    }
    lastHydratedCarouselKeyRef.current = key;
  }, [effectiveUnitId, loadedCarousel]);

  // ── Autosave: inline media ───────────────────────────────────────────────────
  useEffect(() => {
    if (mode !== "teacher" || userEditedMediaRef.current.size === 0) return;
    for (const sectionId of userEditedMediaRef.current) {
      const segmentId = resolveSegmentIdForSection(sectionId, fetchedSegments);
      if (!segmentId) continue;
      const blocks = normaliseInlineMediaBlocks(inlineMediaBySectionId[sectionId] ?? []);
      const sig = JSON.stringify(blocks);
      if (lastSavedMediaSigRef.current[sectionId] === sig) continue;
      clearTimeout(mediaSaveTimers.current[sectionId]);
      mediaSaveTimers.current[sectionId] = setTimeout(async () => {
        try {
          await segmentsApi.updateSegment(segmentId, { media_blocks: blocks });
          lastSavedMediaSigRef.current[sectionId] = sig;
        } catch (err) {
          console.error("Failed to save inline media blocks", { sectionId, segmentId, err });
        } finally {
          delete mediaSaveTimers.current[sectionId];
        }
      }, 500);
    }
  }, [inlineMediaBySectionId, mode, fetchedSegments]);

  // ── Autosave: carousel ───────────────────────────────────────────────────────
  useEffect(() => {
    if (mode !== "teacher" || userEditedCarouselRef.current.size === 0) return;
    for (const sectionId of userEditedCarouselRef.current) {
      const segmentId = resolveSegmentIdForSection(sectionId, fetchedSegments);
      if (!segmentId) continue;
      const slides = normaliseCarouselSlides(carouselSlidesBySectionId[sectionId] ?? []);
      const sig = JSON.stringify(slides);
      if (lastSavedCarouselSigRef.current[sectionId] === sig) continue;
      clearTimeout(carouselSaveTimers.current[sectionId]);
      carouselSaveTimers.current[sectionId] = setTimeout(async () => {
        try {
          await segmentsApi.updateSegment(segmentId, { carousel_slides: slides });
          lastSavedCarouselSigRef.current[sectionId] = sig;
        } catch (err) {
          console.error("Failed to save carousel slides", { sectionId, segmentId, err });
        } finally {
          delete carouselSaveTimers.current[sectionId];
        }
      }, 500);
    }
  }, [carouselSlidesBySectionId, mode, fetchedSegments]);

  // ── Flush (called before navigation and on unmount) ──────────────────────────
  const flush = useCallback(() => {
    const media = inlineMediaRef.current;
    const carousel = carouselRef.current;
    const segments = segmentsRef.current;

    for (const t of Object.values(mediaSaveTimers.current)) clearTimeout(t);
    mediaSaveTimers.current = {};
    for (const sectionId of userEditedMediaRef.current) {
      const segmentId = resolveSegmentIdForSection(sectionId, segments);
      if (!segmentId) continue;
      const blocks = normaliseInlineMediaBlocks(media[sectionId] ?? []);
      const sig = JSON.stringify(blocks);
      if (lastSavedMediaSigRef.current[sectionId] === sig) continue;
      void segmentsApi
        .updateSegment(segmentId, { media_blocks: blocks })
        .then(() => { lastSavedMediaSigRef.current[sectionId] = sig; })
        .catch((err) => console.error("Failed to flush media blocks", { sectionId, err }));
    }

    for (const t of Object.values(carouselSaveTimers.current)) clearTimeout(t);
    carouselSaveTimers.current = {};
    for (const sectionId of userEditedCarouselRef.current) {
      const segmentId = resolveSegmentIdForSection(sectionId, segments);
      if (!segmentId) continue;
      const slides = normaliseCarouselSlides(carousel[sectionId] ?? []);
      const sig = JSON.stringify(slides);
      if (lastSavedCarouselSigRef.current[sectionId] === sig) continue;
      void segmentsApi
        .updateSegment(segmentId, { carousel_slides: slides })
        .then(() => { lastSavedCarouselSigRef.current[sectionId] = sig; })
        .catch((err) => console.error("Failed to flush carousel slides", { sectionId, err }));
    }
  }, []);

  useEffect(() => () => { flush(); }, [flush]);

  // ── Public handlers ──────────────────────────────────────────────────────────
  const handleInlineMediaChange = useCallback(
    (sectionId: string, blocks: InlineMediaBlock[]) => {
      userEditedMediaRef.current.add(sectionId);
      setInlineMediaBySectionId((prev) => {
        const normalised = normaliseInlineMediaBlocks(blocks);
        if (blocks.length === 0) {
          if (!(sectionId in prev)) return prev;
          const next = { ...prev };
          delete next[sectionId];
          return next;
        }
        return { ...prev, [sectionId]: normalised };
      });
    },
    [],
  );

  const upsertInlineMediaBlock = useCallback(
    (sectionId: string, block: InlineMediaBlock) => {
      userEditedMediaRef.current.add(sectionId);
      setInlineMediaBySectionId((prev) => {
        const current = normaliseInlineMediaBlocks(prev[sectionId] ?? []);
        if (current.some((existing) => existing.id === block.id)) {
          return {
            ...prev,
            [sectionId]: current.map((existing) =>
              existing.id === block.id ? normaliseInlineMediaBlocks([{ ...existing, ...block }])[0] : existing,
            ),
          };
        }
        return {
          ...prev,
          [sectionId]: [...current, ...normaliseInlineMediaBlocks([block])],
        };
      });
    },
    [],
  );

  const handleCarouselSlidesChange = useCallback(
    (sectionId: string, slides: CarouselSlide[]) => {
      userEditedCarouselRef.current.add(sectionId);
      setCarouselSlidesBySectionId((prev) => ({ ...prev, [sectionId]: slides }));
    },
    [],
  );

  return {
    fetchedSegments,
    refetchSegments,
    inlineMediaBySectionId,
    setInlineMediaBySectionId,
    upsertInlineMediaBlock,
    carouselSlidesBySectionId,
    setCarouselSlidesBySectionId,
    handleInlineMediaChange,
    handleCarouselSlidesChange,
    flush,
  };
}