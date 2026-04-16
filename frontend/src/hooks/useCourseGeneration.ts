/**
 * useCourseGeneration.ts
 * ========================
 * Manages the SSE stream that fills a course with AI-generated content
 * unit by unit.
 *
 * When the teacher uploaded files during course creation, a `sourceToken`
 * is available (stored in sessionStorage by CreateCourseModal and read
 * from the URL ?source_token= by the caller).  The hook appends it to the
 * SSE URL so the backend can ground each unit's content in the uploaded
 * materials.
 *
 * Usage
 * ─────
 * const courseGen = useCourseGeneration({
 *   courseId:    42,
 *   level:       'B1',
 *   sourceToken: searchParams.get('source_token') ?? undefined,
 *   onUnitDone:  (unitId) => { ... },
 *   onComplete:  ()       => { ... },
 * });
 *
 * courseGen.start();
 *
 * // In UI:
 * courseGen.unitStatuses   // Record<unitId, 'pending'|'generating'|'done'|'error'>
 * courseGen.isStreaming     // true while SSE is open
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
   * UUID returned by POST /generate-outline-from-files.
   * When present it is appended to the SSE URL as ?source_token=<uuid>
   * so the backend forwards the extracted file text to each unit generator.
   * Omit (or pass undefined) when no files were uploaded.
   */
  sourceToken?: string;
  /**
   * Called each time a unit finishes generating.
   * Use to reload the unit list so the modal reflects fresh content.
   */
  onUnitDone: (unitId: number) => void;
  /**
   * Called once the entire stream completes.
   * Use to strip ?ai_outline=true / ?source_token from the URL and
   * clear sessionStorage.
   */
  onComplete: () => void;
}

export interface UseCourseGenerationResult {
  /** Per-unit status map; key is unit_id as a number. */
  unitStatuses: Record<number, UnitGenerationStatus>;
  /** True while the EventSource connection is alive. */
  isStreaming: boolean;
  /**
   * Opens the SSE stream and begins generating all units in order.
   * Safe to call multiple times — no-ops if already streaming or courseId is null.
   */
  start: () => void;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useCourseGeneration({
  courseId,
  level,
  sourceToken,
  onUnitDone,
  onComplete,
}: UseCourseGenerationOptions): UseCourseGenerationResult {
  const [unitStatuses, setUnitStatuses] = useState<Record<number, UnitGenerationStatus>>({});
  const [isStreaming, setIsStreaming]   = useState(false);

  const esRef = useRef<EventSource | null>(null);

  // Stable refs so EventSource handlers never capture stale closures
  const onUnitDoneRef = useRef(onUnitDone);
  const onCompleteRef = useRef(onComplete);
  onUnitDoneRef.current = onUnitDone;
  onCompleteRef.current = onComplete;

  const start = useCallback(() => {
    if (!courseId) {
      console.warn('[useCourseGeneration] courseId is null — ignoring start()');
      return;
    }
    if (esRef.current) {
      console.warn('[useCourseGeneration] already streaming — ignoring duplicate start()');
      return;
    }

    const jwtToken = localStorage.getItem('token');
    if (!jwtToken) {
      console.error('[useCourseGeneration] No JWT found in localStorage — cannot open SSE stream');
      return;
    }

    const apiBase = (import.meta as any).env?.VITE_API_BASE_URL ?? 'http://localhost:8000/api/v1';

    // Build URL params
    const params = new URLSearchParams({
      level: level,
      token: jwtToken,
    });

    // Append source_token when files were uploaded — backend pops the cached
    // extracted text and forwards it to each UnitGenerateRequest.source_content.
    if (sourceToken) {
      params.set('source_token', sourceToken);
      console.info('[useCourseGeneration] source_token attached — units will be grounded in uploaded files');
    }

    const url = `${apiBase}/course-builder/${courseId}/stream?${params.toString()}`;

    setIsStreaming(true);
    setUnitStatuses({});

    const es = new EventSource(url);
    esRef.current = es;

    const teardown = (error?: boolean) => {
      es.close();
      esRef.current = null;
      setIsStreaming(false);
      if (error) return;
      onCompleteRef.current();
    };

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
          // { type: 'start', total: N }
          break;

        case 'unit_start':
          // { type: 'unit_start', unit_id, title, index, total }
          setUnitStatuses(prev => ({ ...prev, [data.unit_id as number]: 'generating' }));
          break;

        case 'unit_done':
          // { type: 'unit_done', unit_id, index, segments_created, exercises_created }
          setUnitStatuses(prev => ({ ...prev, [data.unit_id as number]: 'done' }));
          onUnitDoneRef.current(data.unit_id as number);
          break;

        case 'unit_error':
          // { type: 'unit_error', unit_id, index, error }
          setUnitStatuses(prev => ({ ...prev, [data.unit_id as number]: 'error' }));
          break;

        case 'complete':
          // { type: 'complete', units_done, total }
          teardown();
          break;

        case 'error':
          console.error('[useCourseGeneration] Server-side SSE error:', data.error);
          teardown(true);
          break;

        default:
          console.log('[useCourseGeneration] Unknown SSE event type:', data.type);
      }
    };

    es.onerror = () => {
      console.error('[useCourseGeneration] EventSource connection error');
      teardown(true);
    };

  // Intentionally omit isStreaming from deps — esRef guard handles re-entrancy
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId, level, sourceToken]);

  return { unitStatuses, isStreaming, start };
}