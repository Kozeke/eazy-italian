/**
 * LiveSessionProvider.tsx  (v4 — evictBlockFromCache)
 *
 * Changes from v3:
 * ─────────────────
 * • New helper  evictBlockKeysFromCache(cache, blockId)
 *   Removes every key whose path contains "/ex/{blockId}/" from the provided
 *   Map.  Covers both plain keys ("ex/{blockId}/field") and student-scoped
 *   keys ("s/{N}/ex/{blockId}/field") so the teacher observation view is also
 *   cleaned on reset.
 *
 * • New context method  evictBlockFromCache(blockId)
 *   Public version, exposed on LiveSyncContextValue.  Call sites:
 *     – SectionBlock.bumpAnswerReset   (teacher + student local UI reset)
 *     – ws.onmessage                   (student receives lesson/reset_block)
 *     – patch()                        (teacher sends lesson/reset_block — own cache)
 *
 * • patch() intercepts LIVE_LESSON_RESET_BLOCK_KEY
 *   When the teacher broadcasts a block reset, the teacher's own patchCacheRef
 *   is evicted immediately — before the WS echo returns — so the new component
 *   that subscribes after the key bump finds an empty cache.
 *
 * • ws.onmessage intercepts lesson/reset_block
 *   When any client (including the teacher's own echo) receives this message,
 *   the block's exercise keys are evicted from patchCacheRef before
 *   notifyAndCache stores the new reset-block payload.
 *
 * All prior changes from v3 (targeted teacher patches, is_correct forwarding)
 * are preserved unchanged.
 */

import React, {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  LiveSyncContextValue,
  LiveRole,
  WsPatch,
  WsSnapshot,
} from "./liveSession.types";
import { classroomAnswersApi } from "../../../services/api";
import { LIVE_LESSON_RESET_BLOCK_KEY } from "./liveSession.types";

export const LiveSessionContext = createContext<LiveSyncContextValue | null>(null);

interface LiveSessionProviderProps {
  classroomId: number;
  role: LiveRole;
  userId: number | string | null | undefined;
  children: React.ReactNode;
  onUnitChange?: (unitId: number) => void;
  onSlideChange?: (slideIndex: number) => void;
  onSectionChange?: (section: { id: string; label: string }) => void;
  /** Current unit — forwarded in every WS patch so answers can be scoped. */
  unitId?: number | null;
  /** Current segment — forwarded in every WS patch so answers can be scoped. */
  segmentId?: number | null;
}

const HEARTBEAT_MS = 30_000;
const RECONNECT_MS = 5_000;
const PERMANENT_CLOSE_CODES = new Set([4001, 4003, 4004]);

function studentPrefix(userId: number | string): string {
  return `s/${userId}/`;
}

// ─── Cache eviction helper ────────────────────────────────────────────────────

/**
 * Remove every patchCache entry whose key path contains "/ex/{blockId}/".
 *
 * This covers:
 *   "ex/{blockId}/gap-0"            — student own key (student role)
 *   "ex/{blockId}/d2g"              — teacher fill key
 *   "s/42/ex/{blockId}/gap-0"       — student-scoped key in teacher observation view
 *
 * Called synchronously before the React key bump that remounts an exercise block,
 * so the new component's subscribe() call finds nothing in cache and does NOT
 * schedule a stale-value replay via setTimeout(0).
 */
function evictBlockKeysFromCache(
  cache: Map<string, unknown>,
  blockId: string,
): void {
  const needle = `/ex/${blockId}/`;
  for (const key of Array.from(cache.keys())) {
    // Match both "ex/{blockId}/..." (no prefix) and "s/{N}/ex/{blockId}/..."
    if (key.startsWith(`ex/${blockId}/`) || key.includes(needle)) {
      cache.delete(key);
    }
  }
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function LiveSessionProvider({
  classroomId,
  role,
  userId,
  children,
  unitId,
  segmentId,
}: LiveSessionProviderProps) {
  const [connected, setConnected] = useState(false);
  const [observedStudentId, setObservedStudentId] = useState<number | null>(null);

  const observedStudentIdRef = useRef<number | null>(null);
  useEffect(() => {
    observedStudentIdRef.current = observedStudentId;
  }, [observedStudentId]);

  const lessonContextRef = useRef<{ unitId: number | null; segmentId: number | null }>({
    unitId:    unitId    ?? null,
    segmentId: segmentId ?? null,
  });

  useEffect(() => {
    lessonContextRef.current.unitId    = unitId    ?? null;
    lessonContextRef.current.segmentId = segmentId ?? null;
  }, [unitId, segmentId]);

  const setLessonContext = useCallback(
    (nextUnitId: number | null, nextSegmentId: number | null) => {
      lessonContextRef.current = { unitId: nextUnitId, segmentId: nextSegmentId };
    },
    [],
  );

  const patchCacheRef = useRef<Map<string, unknown>>(new Map());
  const homeworkLogicalAnswersRef = useRef<Record<string, unknown>>({});
  const listenersRef = useRef<Map<string, Set<(v: unknown) => void>>>(new Map());

  const wsRef = useRef<WebSocket | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(false);

  const userIdRef = useRef(userId);
  useEffect(() => { userIdRef.current = userId; }, [userId]);

  // ── Helpers ─────────────────────────────────────────────────────────────────

  const getWsUrl = useCallback((): string => {
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const token = localStorage.getItem("token") ?? "";
    return `${proto}://${window.location.host}/api/v1/ws/classroom/${classroomId}/live?token=${encodeURIComponent(token)}`;
  }, [classroomId]);

  const sendJson = useCallback((data: object) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }, []);

  const notifyAndCache = useCallback((actualKey: string, value: unknown) => {
    patchCacheRef.current.set(actualKey, value);
    const handlers = listenersRef.current.get(actualKey);
    if (handlers) {
      handlers.forEach((h) => h(value));
    }
  }, []);

  // ── Public cache eviction ────────────────────────────────────────────────────

  /**
   * Evict all cached WS-patch entries for a specific exercise block.
   * Must be called BEFORE bumping the React key that remounts the block.
   * See evictBlockKeysFromCache() above for the full rationale.
   */
  const evictBlockFromCache = useCallback((blockId: string) => {
    evictBlockKeysFromCache(patchCacheRef.current, blockId);
  }, []);

  // ── Connect ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!classroomId || !userId) return;
    mountedRef.current = true;

    const connect = () => {
      if (!mountedRef.current) return;
      const existing = wsRef.current;
      if (existing && (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)) return;
      if (existing) {
        existing.onopen = null; existing.onmessage = null;
        existing.onerror = null; existing.onclose = null;
        wsRef.current = null;
      }
      if (reconnectRef.current) { clearTimeout(reconnectRef.current); reconnectRef.current = null; }

      let ws: WebSocket;
      try { ws = new WebSocket(getWsUrl()); } catch { return; }
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current || wsRef.current !== ws) { ws.onclose = null; ws.close(); return; }
        setConnected(true);
        sendJson({ type: "join", role, user_id: userIdRef.current });
        if (heartbeatRef.current) clearInterval(heartbeatRef.current);
        heartbeatRef.current = setInterval(() => sendJson({ type: "heartbeat" }), HEARTBEAT_MS);

        // Pre-seed patch cache from DB
        if (role === "student" && userIdRef.current != null) {
          classroomAnswersApi
            .getForStudent(classroomId)
            .then(({ patches }) => {
              if (!mountedRef.current) return;
              Object.entries(patches).forEach(([k, v]) => {
                if (!patchCacheRef.current.has(k)) {
                  notifyAndCache(k, v);
                }
              });
            })
            .catch(() => {/* non-critical */});
        } else if (role === "teacher") {
          classroomAnswersApi
            .getAllStudents(classroomId)
            .then(({ students }) => {
              if (!mountedRef.current) return;
              Object.entries(students).forEach(([studentId, answers]) => {
                Object.entries(answers).forEach(([exerciseKey, v]) => {
                  const scopedKey = `s/${studentId}/${exerciseKey}`;
                  if (!patchCacheRef.current.has(scopedKey)) {
                    notifyAndCache(scopedKey, v);
                  }
                });
              });
            })
            .catch(() => {/* non-critical */});
        }
      };

      ws.onmessage = (ev) => {
        if (!mountedRef.current || wsRef.current !== ws) return;
        try {
          const msg = JSON.parse(ev.data as string) as WsPatch | WsSnapshot;

          if (msg.type === "patch") {
            // ── Block-reset interception ─────────────────────────────────────
            // When the server broadcasts (or echoes back) a lesson/reset_block
            // patch, evict all stale exercise-field keys for the affected block
            // from patchCacheRef BEFORE calling notifyAndCache.
            //
            // This ensures that any subscriber which fires AFTER this point
            // (e.g. the newly-remounted component's useLiveSyncField) finds an
            // empty cache and never replays the old answer.
            //
            // The teacher's own echo arrives here too (server broadcasts to the
            // whole room including the sender), so both roles are covered by
            // this single interception point.
            if (msg.key === LIVE_LESSON_RESET_BLOCK_KEY) {
              const payload = msg.value as Partial<{ blockId: string }> | null;
              if (payload?.blockId) {
                evictBlockKeysFromCache(patchCacheRef.current, payload.blockId);
              }
            }

            notifyAndCache(msg.key, msg.value);

          } else if (msg.type === "snapshot") {
            Object.entries(msg.patches).forEach(([key, value]) => notifyAndCache(key, value));
          }
        } catch { /* ignore malformed frames */ }
      };

      ws.onerror = () => { /* surfaces via onclose */ };

      ws.onclose = (ev) => {
        if (wsRef.current !== ws) return;
        wsRef.current = null;
        if (!mountedRef.current) return;
        setConnected(false);
        if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null; }
        if (PERMANENT_CLOSE_CODES.has(ev.code)) return;
        reconnectRef.current = setTimeout(() => { reconnectRef.current = null; connect(); }, RECONNECT_MS);
      };
    };

    connect();

    return () => {
      mountedRef.current = false;
      if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null; }
      if (reconnectRef.current) { clearTimeout(reconnectRef.current); reconnectRef.current = null; }
      if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); wsRef.current = null; }
      setConnected(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classroomId, userId, role]);

  // ── patch() ──────────────────────────────────────────────────────────────────

  /**
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ Student                                                              │
   * │   key auto-prefixed → "s/{userId}/{key}"                           │
   * ├──────────────────────────────────────────────────────────────────────┤
   * │ Teacher — specific student observed (observedStudentId != null)      │
   * │   Sends { key, value, target_student_id }                           │
   * │   Server routes ONLY to that student (plain key) and echoes back    │
   * │   as "s/{N}/key". No local notifyAndCache — doing so would set      │
   * │   isRemoteUpdateRef=true in the exercise block before the broadcast  │
   * │   effect runs, silently dropping the next teacher drag.             │
   * ├──────────────────────────────────────────────────────────────────────┤
   * │ Teacher — all students (observedStudentId == null)                  │
   * │   Sends plain key — server broadcasts to whole room.               │
   * └──────────────────────────────────────────────────────────────────────┘
   *
   * Special case — LIVE_LESSON_RESET_BLOCK_KEY:
   *   When the teacher patches a block reset, the teacher's own patchCacheRef
   *   is evicted immediately (before the WS echo returns) so that the
   *   component remounting after the key bump finds an empty cache.
   */
  const patch = useCallback(
    (key: string, value: unknown, isCorrect?: boolean | null) => {
      // Homework bookkeeping (student only)
      if (role === "student" && typeof key === "string" && key.startsWith("hwu/")) {
        homeworkLogicalAnswersRef.current[key] = value;
      }

      // ── Block-reset: evict own cache immediately (teacher side) ──────────
      // The ws.onmessage handler will also evict when the echo returns, but
      // that round-trip takes 50–200 ms.  For the teacher who just clicked
      // "Reset", we need the eviction to happen before the React key bump
      // (which fires synchronously in bumpAnswerReset, which is called right
      // before this patch() call in teacherResetBlock).
      if (key === LIVE_LESSON_RESET_BLOCK_KEY) {
        const payload = value as Partial<{ blockId: string }> | null;
        if (payload?.blockId) {
          evictBlockKeysFromCache(patchCacheRef.current, payload.blockId);
        }
      }

      // ── Student ─────────────────────────────────────────────────────────
      if (role === "student" && userId != null) {
        const actualKey = `${studentPrefix(userId)}${key}`;
        const msg: Record<string, unknown> = { type: "patch", key: actualKey, value };
        if (isCorrect != null) msg.is_correct = isCorrect;
        const { unitId: u, segmentId: s } = lessonContextRef.current;
        if (u != null) msg.unit_id    = u;
        if (s != null) msg.segment_id = s;
        sendJson(msg);
        return;
      }

      // ── Teacher — targeted (specific student selected) ───────────────────
      const targetStudentId = observedStudentIdRef.current;
      if (role === "teacher" && targetStudentId != null) {
        const msg: Record<string, unknown> = {
          type: "patch",
          key,
          value,
          target_student_id: targetStudentId,
        };
        if (isCorrect != null) msg.is_correct = isCorrect;
        const { unitId: u, segmentId: s } = lessonContextRef.current;
        if (u != null) msg.unit_id    = u;
        if (s != null) msg.segment_id = s;
        sendJson(msg);
        return;
      }

      // ── Teacher — broadcast (all students) ──────────────────────────────
      const msg: Record<string, unknown> = { type: "patch", key, value };
      if (isCorrect != null) msg.is_correct = isCorrect;
      const { unitId: u, segmentId: s } = lessonContextRef.current;
      if (u != null) msg.unit_id    = u;
      if (s != null) msg.segment_id = s;
      sendJson(msg);
    },
    [role, userId, sendJson],
  );

  // ── subscribe() ──────────────────────────────────────────────────────────────

  const subscribe = useCallback(
    (key: string, handler: (value: unknown) => void) => {
      let actualKey = key;
      if (role === "teacher" && observedStudentId != null) {
        actualKey = `${studentPrefix(observedStudentId)}${key}`;
      }

      const cached = patchCacheRef.current.get(actualKey);
      if (cached !== undefined) {
        const tid = setTimeout(() => handler(cached), 0);
        void tid;
      }

      const map = listenersRef.current;
      if (!map.has(actualKey)) map.set(actualKey, new Set());
      map.get(actualKey)!.add(handler);

      return () => {
        const set = map.get(actualKey);
        if (set) {
          set.delete(handler);
          if (set.size === 0) map.delete(actualKey);
        }
      };
    },
    [role, observedStudentId],
  );

  // ── Homework helpers ─────────────────────────────────────────────────────────

  const getHomeworkLogicalAnswersSnapshot = useCallback(
    () => ({ ...homeworkLogicalAnswersRef.current }),
    [],
  );

  const applyHomeworkHydrationForStudent = useCallback(
    (patches: Record<string, unknown>) => {
      homeworkLogicalAnswersRef.current = { ...patches };
      Object.entries(patches).forEach(([k, v]) => notifyAndCache(k, v));
    },
    [notifyAndCache],
  );

  const applyTeacherHomeworkObserveHydration = useCallback(
    (studentId: number, patches: Record<string, unknown>) => {
      Object.entries(patches).forEach(([k, v]) =>
        notifyAndCache(`${studentPrefix(studentId)}${k}`, v),
      );
    },
    [notifyAndCache],
  );

  // ── Context value ────────────────────────────────────────────────────────────

  const value = useMemo<LiveSyncContextValue>(
    () => ({
      patch,
      subscribe,
      connected,
      role,
      userId,
      observedStudentId,
      setObservedStudentId,
      setLessonContext,
      evictBlockFromCache,          // ← NEW
      getHomeworkLogicalAnswersSnapshot,
      applyHomeworkHydrationForStudent,
      applyTeacherHomeworkObserveHydration,
    }),
    [
      patch, subscribe, connected, role, userId, observedStudentId,
      setLessonContext,
      evictBlockFromCache,           // ← NEW
      getHomeworkLogicalAnswersSnapshot, applyHomeworkHydrationForStudent,
      applyTeacherHomeworkObserveHydration,
    ],
  );

  return (
    <LiveSessionContext.Provider value={value}>
      {children}
    </LiveSessionContext.Provider>
  );
}