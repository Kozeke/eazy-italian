/**
 * LiveSessionProvider.tsx  (v2 — multi-student observer support)
 *
 * Changes from v1:
 * ─────────────────
 * • Students auto-prefix their patch keys: "ex/…" → "s/{userId}/ex/…"
 *   This scopes each student's exercise state into its own namespace,
 *   preventing collisions when multiple students are in the same room.
 *
 * • Teachers keep sending unmodified keys for guided-fill (broadcast to all
 *   students).
 *
 * • observedStudentId state: when the teacher sets this to a student's ID,
 *   the subscribe() function transparently maps "ex/…" → "s/{N}/ex/…" so
 *   all exercise blocks automatically show that student's answers — zero
 *   call-site changes required.
 *
 * • patchCacheRef: every received patch (snapshot + live) is stored so that
 *   when the teacher switches observed student, subscribe() fires immediately
 *   with the cached value — no round-trip needed.
 *
 * • userId is now exposed on the context value for use by StudentAnswersPanel
 *   and any other consumer that needs it.
 *
 * Backwards-compatible: all existing exercise blocks continue to work with
 * the same useLiveSyncField(key, …) call signature.
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

// ─── Context ──────────────────────────────────────────────────────────────────

export const LiveSessionContext = createContext<LiveSyncContextValue | null>(
  null,
);

// ─── Provider ─────────────────────────────────────────────────────────────────

interface LiveSessionProviderProps {
  classroomId: number;
  role: LiveRole;
  userId: number | string | null | undefined;
  children: React.ReactNode;

  // ── Legacy callbacks kept for ClassroomPage compatibility ─────────────────
  onUnitChange?: (unitId: number) => void;
  onSlideChange?: (slideIndex: number) => void;
  onSectionChange?: (section: { id: string; label: string }) => void;
}

const HEARTBEAT_MS = 30_000;
const RECONNECT_MS = 5_000;

/** Close codes that indicate a permanent server-side rejection — never retry. */
const PERMANENT_CLOSE_CODES = new Set([4001, 4003, 4004]);

/** Build the student-scoped patch key prefix for a given user ID. */
function studentPrefix(userId: number | string): string {
  return `s/${userId}/`;
}

export function LiveSessionProvider({
  classroomId,
  role,
  userId,
  children,
}: LiveSessionProviderProps) {
  const [connected, setConnected] = useState(false);

  /**
   * Which student's answers the teacher is currently observing.
   * null  → teacher sees their own guided-fill patches (standard mode).
   * N     → teacher's subscribe() is redirected to "s/{N}/…" keys.
   */
  const [observedStudentId, setObservedStudentId] = useState<number | null>(
    null,
  );

  // All patches ever received are cached here so that switching observed
  // student can immediately replay the stored value without a server round-trip.
  const patchCacheRef = useRef<Map<string, unknown>>(new Map());

  // Logical `hwu/…` keys (no student prefix) accumulated for homework REST autosave
  const homeworkLogicalAnswersRef = useRef<Record<string, unknown>>({});

  // listeners: actualKey → Set<handler>
  // actualKey is the namespaced key ("s/42/ex/…" or plain "ex/…")
  const listenersRef = useRef<Map<string, Set<(v: unknown) => void>>>(
    new Map(),
  );

  const wsRef = useRef<WebSocket | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(false);

  // Keep userId in a ref so the connect effect's closure always reads the
  // latest value without needing it as a reactive dependency.
  const userIdRef = useRef(userId);
  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

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

  /**
   * Notify all handlers subscribed to `actualKey` and update the cache.
   */
  const notifyAndCache = useCallback((actualKey: string, value: unknown) => {
    patchCacheRef.current.set(actualKey, value);
    const handlers = listenersRef.current.get(actualKey);
    if (handlers) {
      handlers.forEach((h) => h(value));
    }
  }, []);

  // ── Connect ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!classroomId || !userId) return;

    mountedRef.current = true;

    const connect = () => {
      if (!mountedRef.current) return;

      const existing = wsRef.current;
      if (
        existing &&
        (existing.readyState === WebSocket.OPEN ||
          existing.readyState === WebSocket.CONNECTING)
      ) {
        return;
      }

      if (existing) {
        existing.onopen = null;
        existing.onmessage = null;
        existing.onerror = null;
        existing.onclose = null;
        wsRef.current = null;
      }

      if (reconnectRef.current) {
        clearTimeout(reconnectRef.current);
        reconnectRef.current = null;
      }

      let ws: WebSocket;
      try {
        ws = new WebSocket(getWsUrl());
      } catch {
        return;
      }
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) {
          ws.onclose = null;
          ws.close();
          return;
        }
        if (wsRef.current !== ws) {
          ws.onclose = null;
          ws.close();
          return;
        }

        setConnected(true);
        sendJson({ type: "join", role, user_id: userIdRef.current });

        if (heartbeatRef.current) clearInterval(heartbeatRef.current);
        heartbeatRef.current = setInterval(() => {
          sendJson({ type: "heartbeat" });
        }, HEARTBEAT_MS);
      };

      ws.onmessage = (ev) => {
        if (!mountedRef.current || wsRef.current !== ws) return;
        try {
          const msg = JSON.parse(ev.data as string) as WsPatch | WsSnapshot;

          if (msg.type === "patch") {
            notifyAndCache(msg.key, msg.value);
          } else if (msg.type === "snapshot") {
            Object.entries(msg.patches).forEach(([key, value]) => {
              notifyAndCache(key, value);
            });
          }
        } catch {
          // Ignore malformed frames
        }
      };

      ws.onerror = () => {
        /* surfaces via onclose */
      };

      ws.onclose = (ev) => {
        if (wsRef.current !== ws) return;
        wsRef.current = null;
        if (!mountedRef.current) return;

        setConnected(false);
        if (heartbeatRef.current) {
          clearInterval(heartbeatRef.current);
          heartbeatRef.current = null;
        }

        if (PERMANENT_CLOSE_CODES.has(ev.code)) return;

        reconnectRef.current = setTimeout(() => {
          reconnectRef.current = null;
          connect();
        }, RECONNECT_MS);
      };
    };

    connect();

    return () => {
      mountedRef.current = false;

      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
      if (reconnectRef.current) {
        clearTimeout(reconnectRef.current);
        reconnectRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }

      setConnected(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classroomId, userId, role]);

  // ── Public API ───────────────────────────────────────────────────────────────

  /**
   * Send a patch over the live WebSocket.
   *
   * Students automatically have their keys prefixed with "s/{userId}/" so
   * each student's exercise state lives in its own namespace. Teachers send
   * keys as-is (broadcast to all students for guided-fill).
   */
  const patch = useCallback(
    (key: string, value: unknown) => {
      if (
        role === "student" &&
        typeof key === "string" &&
        key.startsWith("hwu/")
      ) {
        homeworkLogicalAnswersRef.current[key] = value;
      }
      let actualKey = key;
      if (role === "student" && userId != null) {
        actualKey = `${studentPrefix(userId)}${key}`;
      }
      sendJson({ type: "patch", key: actualKey, value });
    },
    [role, userId, sendJson],
  );

  const getHomeworkLogicalAnswersSnapshot = useCallback(
    () => ({ ...homeworkLogicalAnswersRef.current }),
    [],
  );

  const applyHomeworkHydrationForStudent = useCallback(
    (patches: Record<string, unknown>) => {
      homeworkLogicalAnswersRef.current = { ...patches };
      Object.entries(patches).forEach(([k, v]) => {
        notifyAndCache(k, v);
      });
    },
    [notifyAndCache],
  );

  const applyTeacherHomeworkObserveHydration = useCallback(
    (studentId: number, patches: Record<string, unknown>) => {
      Object.entries(patches).forEach(([k, v]) => {
        notifyAndCache(`${studentPrefix(studentId)}${k}`, v);
      });
    },
    [notifyAndCache],
  );

  /**
   * Subscribe to remote patches for a given key.
   * Returns an unsubscribe function (call it from useEffect cleanup).
   *
   * Key mapping rules:
   * • Students always subscribe to the plain key ("ex/…") — they see the
   *   teacher's guided-fill patches, never other students' patches.
   * • Teachers with observedStudentId set subscribe to the scoped key
   *   ("s/{observedStudentId}/ex/…") — they see only that student's answers.
   * • Teachers without observedStudentId subscribe to the plain key (they
   *   see their own patches echoed back, which is the standard guided mode).
   *
   * If a cached value exists for the resolved key it is fired asynchronously
   * on the next tick so call-sites don't receive a value during render.
   */
  const subscribe = useCallback(
    (key: string, handler: (value: unknown) => void) => {
      let actualKey = key;
      if (role === "teacher" && observedStudentId != null) {
        actualKey = `${studentPrefix(observedStudentId)}${key}`;
      }

      // Fire immediately with cached value so switching students instantly
      // populates exercise blocks with the new student's stored answers.
      const cached = patchCacheRef.current.get(actualKey);
      if (cached !== undefined) {
        // Defer to avoid setState-during-render issues in exercise blocks
        const tid = setTimeout(() => handler(cached), 0);
        // We intentionally don't cancel this timeout on unsubscribe —
        // it fires once within a tick and the handler checks its own
        // component's mounted state internally.
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
    // observedStudentId in the dep array ensures all exercise block effects
    // re-run when the teacher switches observed student, re-creating their
    // subscriptions against the new student-scoped key.
    [role, observedStudentId],
  );

  const value = useMemo<LiveSyncContextValue>(
    () => ({
      patch,
      subscribe,
      connected,
      role,
      userId,
      observedStudentId,
      setObservedStudentId,
      getHomeworkLogicalAnswersSnapshot,
      applyHomeworkHydrationForStudent,
      applyTeacherHomeworkObserveHydration,
    }),
    [
      patch,
      subscribe,
      connected,
      role,
      userId,
      observedStudentId,
      getHomeworkLogicalAnswersSnapshot,
      applyHomeworkHydrationForStudent,
      applyTeacherHomeworkObserveHydration,
    ],
  );

  return (
    <LiveSessionContext.Provider value={value}>
      {children}
    </LiveSessionContext.Provider>
  );
}
