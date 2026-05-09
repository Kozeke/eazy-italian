/**
 * useCourseGeneration.ts
 * ========================
 * Manages the SSE stream that fills a course with AI-generated content
 * unit by unit.
 *
 * FIXES applied:
 *   1. Pre-initialise ALL unit IDs as 'pending' the moment start() is called,
 *      so units never appear empty regardless of SSE state.
 *   2. Auto-reconnect on connection drop (up to MAX_RECONNECTS times) with
 *      exponential back-off.
 *   3. Resume support — already-done unit IDs are sent back as
 *      ?done_unit_ids=1,2,3 so the backend can skip them on reconnect.
 *   4. On final failure, every 'pending' / 'generating' unit is flipped to
 *      'error' so the UI always shows a meaningful state instead of empty.
 */

import { useCallback, useRef, useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

export type UnitGenerationStatus = 'pending' | 'generating' | 'done' | 'error';

export interface UseCourseGenerationOptions {
  /** Numeric course ID — hook is a no-op while null. */
  courseId: number | null;
  /** CEFR level forwarded to the backend (default 'B1'). */
  level: string;
  /**
   * The language the course is TEACHING (e.g. 'Italian', 'Spanish').
   * Forwarded as ?language= — drives Italian example sentences, vocabulary, phrases.
   * Defaults to 'English' when omitted.
   */
  language?: string;
  /**
   * The teacher's native / explanation language (e.g. 'Russian', 'English').
   * Forwarded as ?native_language= — grammar rules and instructions are written
   * in this language so students can understand explanations in their own language.
   * Defaults to 'English' when omitted.
   */
  nativeLanguage?: string;
  /**
   * UUID returned by POST /generate-outline-from-files.
   * Appended to the SSE URL so the backend can ground content in uploaded files.
   */
  sourceToken?: string;
  /**
   * All DB units for the course (just need { id }).
   * Used to pre-populate every unit as 'pending' before the first SSE event
   * arrives, so nothing ever appears empty.
   */
  units?: ReadonlyArray<{ id: number }>;
  /** Called each time a unit finishes. Use to reload unit content. */
  onUnitDone: (unitId: number) => void;
  /** Called once the whole stream completes successfully. */
  onComplete: () => void;
}

export interface UseCourseGenerationResult {
  unitStatuses: Record<number, UnitGenerationStatus>;
  isStreaming: boolean;
  start: () => void;
  /** Manually retry all units currently in 'error' state. */
  retryErrors: () => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_RECONNECTS    = 4;
const RECONNECT_BASE_MS = 1_500; // first retry after 1.5 s; doubles each attempt

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useCourseGeneration({
  courseId,
  level,
  language,
  nativeLanguage,
  sourceToken,
  units,
  onUnitDone,
  onComplete,
}: UseCourseGenerationOptions): UseCourseGenerationResult {

  const [unitStatuses, setUnitStatuses] = useState<Record<number, UnitGenerationStatus>>({});
  const [isStreaming, setIsStreaming]   = useState(false);

  // ── Stable refs (never stale inside ESS callbacks) ───────────────────────
  const esRef             = useRef<EventSource | null>(null);
  const reconnectCount    = useRef(0);
  const reconnectTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const doneUnitIds       = useRef<Set<number>>(new Set());   // for resume on reconnect
  const onUnitDoneRef     = useRef(onUnitDone);
  const onCompleteRef     = useRef(onComplete);
  const courseIdRef       = useRef(courseId);
  const levelRef          = useRef(level);
  const languageRef       = useRef(language);
  const nativeLanguageRef = useRef(nativeLanguage);
  const sourceTokenRef    = useRef(sourceToken);
  const unitsRef          = useRef(units);

  onUnitDoneRef.current  = onUnitDone;
  onCompleteRef.current  = onComplete;
  courseIdRef.current    = courseId;
  levelRef.current       = level;
  languageRef.current    = language;
  nativeLanguageRef.current = nativeLanguage;
  sourceTokenRef.current = sourceToken;
  unitsRef.current       = units;

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** Mark every unit that is still pending / generating as error. */
  const markStuckAsError = useCallback(() => {
    setUnitStatuses(prev => {
      const next = { ...prev };
      for (const [k, v] of Object.entries(next)) {
        if (v === 'pending' || v === 'generating') {
          next[Number(k)] = 'error';
        }
      }
      return next;
    });
  }, []);

  /** Build the SSE URL, forwarding done unit IDs so the backend can skip them. */
  const buildUrl = useCallback((): string => {
    const apiBase =
      (import.meta as any).env?.VITE_API_BASE_URL ?? 'http://localhost:8000/api/v1';
    const jwt = localStorage.getItem('token') ?? '';

    const params = new URLSearchParams({ level: levelRef.current, token: jwt });

    // language — the target language the course TEACHES (e.g. "Italian").
    // Drives Italian vocabulary, example sentences, and phrases in every segment.
    params.set('language', (languageRef.current || 'English').trim());

    // native_language — the explanation language the teacher/student reads in
    // (e.g. "Russian"). Grammar rules and instructions are written in this language.
    if (nativeLanguageRef.current) {
      params.set('native_language', nativeLanguageRef.current.trim());
    }

    if (sourceTokenRef.current) {
      params.set('source_token', sourceTokenRef.current);
    }

    // Tell the backend which units are already done so it can skip them.
    if (doneUnitIds.current.size > 0) {
      params.set('done_unit_ids', [...doneUnitIds.current].join(','));
    }

    return `${apiBase}/course-builder/${courseIdRef.current}/stream?${params}`;
  }, []);

  // ── Core: open (or re-open) the EventSource ───────────────────────────────

  const openStream = useCallback(() => {
    if (!courseIdRef.current) return;

    // Close any leftover connection before opening a new one.
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }

    const es = new EventSource(buildUrl());
    esRef.current = es;

    // ── Clean shutdown ──────────────────────────────────────────────────────
    const teardown = (opts: { success: boolean }) => {
      es.close();
      if (esRef.current === es) esRef.current = null;

      if (opts.success) {
        reconnectCount.current = 0;
        setIsStreaming(false);
        onCompleteRef.current();
      } else {
        // Try to reconnect unless we've hit the limit.
        if (reconnectCount.current < MAX_RECONNECTS) {
          const delay = RECONNECT_BASE_MS * Math.pow(2, reconnectCount.current);
          reconnectCount.current += 1;
          console.warn(
            `[useCourseGeneration] SSE dropped — reconnect attempt ` +
            `${reconnectCount.current}/${MAX_RECONNECTS} in ${delay} ms`,
          );
          reconnectTimer.current = setTimeout(() => {
            openStream();
          }, delay);
        } else {
          console.error('[useCourseGeneration] Max reconnects reached — giving up');
          setIsStreaming(false);
          markStuckAsError();
        }
      }
    };

    // ── SSE message handler ────────────────────────────────────────────────
    es.onmessage = (event: MessageEvent) => {
      let data: Record<string, any>;
      try {
        data = JSON.parse(event.data as string);
      } catch {
        console.error('[useCourseGeneration] Unparseable SSE message:', event.data);
        return;
      }

      switch (data.type) {

        case 'start':
          // { type: 'start', total: N, unit_ids?: number[] }
          // If the backend sends unit_ids up front, use them; otherwise fall back
          // to the units prop that was pre-populated in start().
          if (Array.isArray(data.unit_ids) && data.unit_ids.length > 0) {
            setUnitStatuses(prev => {
              const next = { ...prev };
              for (const id of data.unit_ids as number[]) {
                if (!next[id]) next[id] = 'pending'; // don't overwrite done/error
              }
              return next;
            });
          }
          break;

        case 'unit_start':
          // { type: 'unit_start', unit_id, title, index, total }
          setUnitStatuses(prev => ({ ...prev, [data.unit_id as number]: 'generating' }));
          break;

        case 'unit_done':
          // { type: 'unit_done', unit_id, index, segments_created, exercises_created }
          doneUnitIds.current.add(data.unit_id as number);
          setUnitStatuses(prev => ({ ...prev, [data.unit_id as number]: 'done' }));
          onUnitDoneRef.current(data.unit_id as number);
          break;

        case 'unit_error':
          // { type: 'unit_error', unit_id, index, error }
          console.error(`[useCourseGeneration] unit ${data.unit_id} error:`, data.error);
          setUnitStatuses(prev => ({ ...prev, [data.unit_id as number]: 'error' }));
          break;

        case 'complete':
          // { type: 'complete', units_done, total }
          teardown({ success: true });
          break;

        case 'error':
          console.error('[useCourseGeneration] Server-side SSE error:', data.error);
          teardown({ success: false });
          break;

        default:
          // heartbeat / ping — just keeps the connection alive, ignore
          break;
      }
    };

    es.onerror = () => {
      console.error('[useCourseGeneration] EventSource connection error');
      teardown({ success: false });
    };

  }, [buildUrl, markStuckAsError]);

  // ── Public: start ─────────────────────────────────────────────────────────

  const start = useCallback(() => {
    if (!courseIdRef.current) {
      console.warn('[useCourseGeneration] courseId is null — ignoring start()');
      return;
    }
    if (esRef.current) {
      console.warn('[useCourseGeneration] already streaming — ignoring duplicate start()');
      return;
    }
    if (!localStorage.getItem('token')) {
      console.error('[useCourseGeneration] No JWT — cannot open SSE stream');
      return;
    }

    // ── FIX 1: Pre-initialise ALL units as 'pending' immediately ────────────
    // This guarantees the UI never shows an empty unit while waiting for its
    // unit_start event — even if the connection is slow or drops for later units.
    doneUnitIds.current.clear();
    reconnectCount.current = 0;

    const knownUnits = unitsRef.current ?? [];
    if (knownUnits.length > 0) {
      const initial: Record<number, UnitGenerationStatus> = {};
      for (const u of knownUnits) initial[u.id] = 'pending';
      setUnitStatuses(initial);
    } else {
      setUnitStatuses({});
    }

    setIsStreaming(true);
    openStream();

  // courseId / level / sourceToken / units are accessed via refs — no dep needed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openStream]);

  // ── Public: retryErrors ───────────────────────────────────────────────────
  // Re-opens the stream for any units currently in 'error' state.

  const retryErrors = useCallback(() => {
    if (esRef.current) return; // already streaming

    setUnitStatuses(prev => {
      const next = { ...prev };
      for (const [k, v] of Object.entries(next)) {
        if (v === 'error') next[Number(k)] = 'pending';
      }
      return next;
    });

    reconnectCount.current = 0;
    setIsStreaming(true);
    openStream();
  }, [openStream]);

  return { unitStatuses, isStreaming, start, retryErrors };
}