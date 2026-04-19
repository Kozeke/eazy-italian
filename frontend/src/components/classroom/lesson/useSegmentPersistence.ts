/**
 * useSegmentPersistence.ts
 *
 * Owns all segment autosave and hydration logic previously in LessonWorkspace.
 * Lives in the same folder as LessonWorkspace.tsx.
 *
 * Responsibilities:
 *   • Fetch segments from the API (teacher mode)
 *   • Hydrate inlineMediaBySectionId and carouselSlidesBySectionId from server data
 *   • Debounced autosave (500 ms) on every change (media, carousel, section titles)
 *   • Flush saves on unmount / before navigation
 *   • Reset all state when the active unit changes
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { segmentsApi } from "../../../services/api";
  import api from "../../../services/api";

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
    | "test_with_timer"
    | "true_false"
    | "text";      // AI-generated text/explanation blocks (markdown content)
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
        [
          "image", "video", "audio", "carousel_slides",
          "drag_to_gap", "drag_to_image", "type_word_to_image", "select_form_to_image",
          "type_word_in_gap", "select_word_form", "build_sentence", "match_pairs",
          "order_paragraphs", "sort_into_columns", "test_without_timer", "test_with_timer",
          "true_false",
          "text",  // AI-generated text/explanation blocks
        ].includes(b.kind),
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
   * Segments embedded in the full unit response (already contain media_blocks).
   *
   * Student mode:  this is the ONLY source — we never call /segments separately.
   * Teacher mode:  used as an immediate seed so media_blocks render right away,
   *                before the slower /admin/units/:id/segments fetch resolves.
   *                The /segments response (which has richer metadata) overwrites
   *                the seed once it arrives.
   *
   * In both modes the segments must belong to effectiveUnitId — the caller
   * (LessonWorkspace) is responsible for passing `undefined` while the new
   * unit is still loading so we never seed with stale data.
   */
  unitSegments?: UnitSegment[];
}

export function useSegmentPersistence({ effectiveUnitId, mode, unitSegments }: Options) {
  // ── Fetch segments ───────────────────────────────────────────────────────────
  const [fetchedSegments, setFetchedSegments] = useState<UnitSegment[]>([]);
  /**
   * Tracks which unit the current `fetchedSegments` were loaded for.
   * Hydration is gated on this matching `effectiveUnitId` so that stale
   * segments from the previously-viewed unit never pollute the new unit's
   * inlineMediaBySectionId while the async fetch is still in-flight.
   */
  const [fetchedForUnitId, setFetchedForUnitId] = useState<number | null>(null);

  // In student mode we use the segments that come embedded in the unit response
  // (they already contain media_blocks).  Making a separate /segments call in
  // student mode returns lightweight segment objects WITHOUT media_blocks, which
  // causes inlineMediaBySectionId to stay empty and exercises never render.
  const isStudent = mode === "student";

  const refetchSegments = useCallback(async () => {
    if (isStudent) return; // students rely on unitSegments prop
    if (!effectiveUnitId) {
      setFetchedSegments([]);
      setFetchedForUnitId(null);
      return;
    }
    try {
      const { data } = await api.get<UnitSegment[]>(
        `/admin/units/${effectiveUnitId}/segments`,
      );
      setFetchedSegments(getSortedSegments(data ?? []));
      setFetchedForUnitId(effectiveUnitId);
    } catch {
      setFetchedSegments([]);
      setFetchedForUnitId(null);
    }
  }, [effectiveUnitId, isStudent]);

  // ── Teacher: seed immediately from unitSegments, then fetch full detail ──────
  //
  // Problem being solved:
  //   The /admin/units/:id/segments fetch is async.  Between the unit-change
  //   reset (which zeros fetchedForUnitId) and the fetch completing, the
  //   hydration guard keeps inlineMediaBySectionId empty — so the teacher sees
  //   a blank section for a noticeable moment, or worse, stale blocks from the
  //   previous unit can leak through the `sortedSegments` fallback in
  //   LessonWorkspace.
  //
  // Fix:
  //   When `unitSegments` is already available for the current unit (the parent
  //   full-unit response arrived first), stamp them as the initial fetchedSegments
  //   so hydration can fire immediately.  The /segments fetch still runs in
  //   parallel and overwrites with richer metadata once it lands.
  //
  //   Guard: we only stamp when unitSegments belong to effectiveUnitId.
  //   LessonWorkspace passes `undefined` while the new unit is loading, so we
  //   never accidentally seed with stale data from a previous unit.
  useEffect(() => {
    if (isStudent) return; // student path handled separately below
    if (!effectiveUnitId) return;

    const segments = getSortedSegments(unitSegments ?? []);
    if (segments.length === 0) return; // still loading — wait for /segments fetch

    // Only seed if these segments actually belong to the current unit.
    // unitSegments[0].unit_id isn't always present, so we rely on the caller
    // (LessonWorkspace) to pass undefined while a different unit is loading.
    setFetchedSegments(segments);
    setFetchedForUnitId(effectiveUnitId);
  }, [isStudent, unitSegments, effectiveUnitId]);

  // Teacher: fetch full segment detail (richer metadata, authoritative order).
  // Runs in parallel with the seed above and overwrites once resolved.
  useEffect(() => {
    if (isStudent) return; // handled by the unitSegments sync below
    let cancelled = false;
    if (!effectiveUnitId) {
      setFetchedSegments([]);
      setFetchedForUnitId(null);
      return;
    }
    // Capture the unit id at fetch-start so we can stamp it alongside the data.
    // This prevents a stale loadedMedia (still holding the previous unit's blocks)
    // from triggering hydration for the new unit during the async gap.
    const fetchingForUnitId = effectiveUnitId;
    void api
      .get<UnitSegment[]>(`/admin/units/${effectiveUnitId}/segments`)
      .then(({ data }) => {
        if (!cancelled) {
          setFetchedSegments(getSortedSegments(data ?? []));
          setFetchedForUnitId(fetchingForUnitId);
        }
      })
      .catch(() => {
        if (!cancelled) {
          // Keep the seed data in place if the fetch fails — better to show
          // slightly less-rich data than to blank the section entirely.
          if (fetchingForUnitId === effectiveUnitId) return;
          setFetchedSegments([]);
          setFetchedForUnitId(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [effectiveUnitId, isStudent]);

  // Student: sync directly from the unit's embedded segments (already have media_blocks).
  // Only stamp fetchedForUnitId once we have real segments that belong to
  // effectiveUnitId.  When unitSegments is undefined/empty it means the parent's
  // fetch for the new unit is still in-flight — we clear segments but keep
  // fetchedForUnitId as null so the hydration guard stays closed until real data
  // arrives, preventing stale blocks from the previous unit leaking in.
  useEffect(() => {
    if (!isStudent) return;
    const segments = getSortedSegments(unitSegments ?? []);
    setFetchedSegments(segments);
    setFetchedForUnitId(segments.length > 0 ? effectiveUnitId : null);
  }, [isStudent, unitSegments, effectiveUnitId]);

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
  // Latest title string per section key while the teacher is typing (used by the debounced PUT)
  const pendingTitleBySectionRef = useRef<Record<string, string>>({});
  // Debounce timers for PUT /admin/segments/{id} when section titles change
  const titleSaveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

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
    // Reset whenever the unit ID changes — including transitions through null
    // (e.g. useStudentUnit briefly sets unit=null while loading the new unit).
    // The old guard required BOTH prev and effectiveUnitId to be non-null, which
    // meant a null→B or A→null transition never fired the reset, leaving stale
    // media blocks from the previous unit visible until hydration for B replaced them.
    if (effectiveUnitId !== prev) {
      Object.values(mediaSaveTimers.current).forEach(clearTimeout);
      mediaSaveTimers.current = {};
      Object.values(carouselSaveTimers.current).forEach(clearTimeout);
      carouselSaveTimers.current = {};
      Object.values(titleSaveTimers.current).forEach(clearTimeout);
      titleSaveTimers.current = {};
      pendingTitleBySectionRef.current = {};
      setInlineMediaBySectionId({});
      setCarouselSlidesBySectionId({});
      setFetchedSegments([]);
      setFetchedForUnitId(null);
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
    // Guard: only hydrate once fetchedSegments are confirmed to belong to the
    // current unit. Without this, a stale loadedMedia (still holding the
    // previous unit's blocks) would stamp wrong exercises into the new unit's
    // sections during the async gap between unit change and fetch completion.
    if (fetchedForUnitId !== effectiveUnitId) return;
    const key = `${effectiveUnitId}:${JSON.stringify(loadedMedia)}`;
    if (lastHydratedMediaKeyRef.current === key) return;

    setInlineMediaBySectionId((prev) => {
      const merged: Record<string, InlineMediaBlock[]> = {};
      for (const [sid, serverBlocks] of Object.entries(loadedMedia)) {
        // Preserve any blocks the teacher added locally that haven't yet been
        // confirmed by the server (optimistic UI). This is safe because we
        // already confirmed fetchedForUnitId === effectiveUnitId above, so
        // prev cannot contain blocks from a different unit at this point.
        const localOnly = (prev[sid] ?? []).filter(
          (b) => !serverBlocks.some((sb) => sb.id === b.id),
        );
        merged[sid] = localOnly.length > 0 ? [...serverBlocks, ...localOnly] : serverBlocks;
      }
      // NOTE: we intentionally do NOT carry forward prev sections that have no
      // server counterpart — doing so would re-introduce blocks from a
      // previously-viewed unit that the reset already cleared.
      return merged;
    });
    lastSavedMediaSigRef.current = buildSignatureMap(loadedMedia);
    lastHydratedMediaKeyRef.current = key;
  }, [effectiveUnitId, fetchedForUnitId, loadedMedia]);

  // ── Hydration: carousel ──────────────────────────────────────────────────────
  useEffect(() => {
    if (effectiveUnitId == null) return;
    // Same unit-match guard as inline media hydration above.
    if (fetchedForUnitId !== effectiveUnitId) return;
    const key = `${effectiveUnitId}:carousel:${JSON.stringify(loadedCarousel)}`;
    if (lastHydratedCarouselKeyRef.current === key) return;

    setCarouselSlidesBySectionId((_prev) => {
      // Use server data directly; prev could still hold slides from the old
      // unit if the reset and this hydration landed in the same batch.
      return { ...loadedCarousel };
    });
    for (const [sid, slides] of Object.entries(loadedCarousel)) {
      lastSavedCarouselSigRef.current[sid] = JSON.stringify(slides);
    }
    lastHydratedCarouselKeyRef.current = key;
  }, [effectiveUnitId, fetchedForUnitId, loadedCarousel]);

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
  /**
   * Applies a section title locally and schedules a debounced persist (teacher only).
   */
  const persistSegmentTitleDebounced = useCallback(
    (sectionId: string, title: string) => {
      if (mode !== "teacher") return;
      pendingTitleBySectionRef.current[sectionId] = title;
      setFetchedSegments((prev) => {
        const segmentId = resolveSegmentIdForSection(sectionId, prev);
        if (!segmentId) return prev;
        return prev.map((s) => (s.id === segmentId ? { ...s, title } : s));
      });
      clearTimeout(titleSaveTimers.current[sectionId]);
      titleSaveTimers.current[sectionId] = setTimeout(async () => {
        const segs = segmentsRef.current;
        const segmentId = resolveSegmentIdForSection(sectionId, segs);
        const pending = pendingTitleBySectionRef.current[sectionId];
        if (!segmentId || pending === undefined) {
          delete titleSaveTimers.current[sectionId];
          return;
        }
        const seg = segs.find((s) => s.id === segmentId);
        const orderIdx = seg?.order_index ?? 0;
        const payloadTitle =
          pending.trim() || `Section ${orderIdx + 1}`;
        try {
          await segmentsApi.updateSegment(segmentId, { title: payloadTitle });
        } catch (err) {
          // Avoid losing edits silently — console is enough for now (same as media autosave)
          console.error("Failed to save segment title", { sectionId, segmentId, err });
        } finally {
          delete titleSaveTimers.current[sectionId];
        }
      }, 500);
    },
    [mode],
  );

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

    const titleTimerKeys = Object.keys(titleSaveTimers.current);
    for (const t of Object.values(titleSaveTimers.current)) clearTimeout(t);
    titleSaveTimers.current = {};
    for (const sectionId of titleTimerKeys) {
      const segmentId = resolveSegmentIdForSection(sectionId, segments);
      const pending = pendingTitleBySectionRef.current[sectionId];
      if (!segmentId || pending === undefined) continue;
      const seg = segments.find((s) => s.id === segmentId);
      const orderIdx = seg?.order_index ?? 0;
      const payloadTitle = pending.trim() || `Section ${orderIdx + 1}`;
      void segmentsApi
        .updateSegment(segmentId, { title: payloadTitle })
        .catch((err) => console.error("Failed to flush segment title", { sectionId, err }));
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
    persistSegmentTitleDebounced,
  };
}
