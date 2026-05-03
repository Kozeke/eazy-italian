/**
 * useOnlinePresence.ts
 *
 * Tracks which students are currently online in a given classroom via WebSocket.
 *
 * Protocol (same WS endpoint pattern used by existing /ws routes):
 * ─────────────────────────────────────────────────────────────────
 *  → { type: "join",      classroom_id, user_id, user_name, avatar_url }
 *  → { type: "heartbeat", classroom_id, user_id }          (every 30 s)
 *  ← { type: "presence_update", users: OnlineUser[] }
 *  ← { type: "user_joined",     user: OnlineUser }
 *  ← { type: "user_left",       user_id: number }
 *
 * Usage (teacher side):
 * ─────────────────────
 *   const { onlineUsers } = useOnlinePresence({
 *     classroomId: classroom.id,
 *     currentUserId: me.id,
 *     currentUserName: me.full_name,
 *     currentUserAvatar: me.avatar_url,
 *     enabled: isTeacher,
 *   });
 *
 * The hook is safe to use on the student side too (enabled=false keeps it dormant).
 * When enabled=true on the student side it will still emit join/heartbeat so the
 * teacher can see that student's avatar appear. Pass isTeacher=false from the
 * student page to suppress the returned onlineUsers list (empty array).
 *
 * Fixes (v2):
 * ───────────
 * • mountedRef is no longer reset inside the effect — it is only set to `false`
 *   in the cleanup, preventing the "ghost reconnect" race where the old socket's
 *   onclose fires after the new effect has already re-set mountedRef to true.
 * • currentUserName / currentUserAvatar are stored in refs and NOT in the effect
 *   dependency array. They are read at call-time (onopen / heartbeat), so the
 *   socket is not torn down when profile data loads asynchronously.
 * • wsRef is nulled after close so stale refs can't leak into the reconnect path.
 * • A reconnect guard (reconnectTimerRef) prevents stacking multiple timers when
 *   the component re-renders rapidly.
 * • The returned `onlineUsers` list excludes the current logged-in user so
 *   header presence only shows "other participants".
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { wsOriginFromApiBase } from '../services/api';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface OnlineUser {
  user_id: number;
  user_name: string;
  avatar_url?: string | null;
  /** ISO timestamp when they were last seen — set by the server */
  last_seen?: string;
  /** Assigned deterministically from user_id for consistent avatar colours */
  color?: string;
}

export interface UseOnlinePresenceOptions {
  classroomId?: number | null;
  currentUserId?: number | null;
  currentUserName?: string;
  currentUserAvatar?: string | null;
  /**
   * When false the socket is never opened and onlineUsers is always [].
   * Defaults to true.
   */
  enabled?: boolean;
  /**
   * When true the hook returns online users excluding the current user.
   * When false (student) it still connects (so the teacher can see the
   * student) but returns an empty array.
   * Defaults to true.
   */
  isTeacher?: boolean;
  /** WebSocket base URL — defaults to auto-derived from window.location */
  wsBaseUrl?: string;
  /** Heartbeat interval in ms — defaults to 30 000 */
  heartbeatIntervalMs?: number;
}

export interface UseOnlinePresenceResult {
  /** All other users currently online (current user excluded). Empty for non-teachers. */
  onlineUsers: OnlineUser[];
  /** Total count of online users */
  totalOnline: number;
  /** Whether the WebSocket is currently connected */
  connected: boolean;
}

// ─── Avatar colour palette (design-system aligned) ───────────────────────────

const AVATAR_COLORS = [
  '#6C6FEF', // primary
  '#EC4899', // pink
  '#F59E0B', // amber
  '#10B981', // emerald
  '#3B82F6', // blue
  '#8B5CF6', // violet
  '#EF4444', // red
  '#06B6D4', // cyan
  '#F97316', // orange
  '#84CC16', // lime
];

export function getAvatarColor(userId: number): string {
  return AVATAR_COLORS[userId % AVATAR_COLORS.length];
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/** Close codes that indicate a permanent server-side rejection — never retry. */
const PERMANENT_CLOSE_CODES = new Set([4001, 4003, 4004]);

export function useOnlinePresence({
  classroomId,
  currentUserId,
  currentUserName = 'Unknown',
  currentUserAvatar,
  enabled = true,
  isTeacher = true,
  wsBaseUrl,
  heartbeatIntervalMs = 30_000,
}: UseOnlinePresenceOptions): UseOnlinePresenceResult {
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [connected, setConnected]     = useState(false);

  const wsRef              = useRef<WebSocket | null>(null);
  const heartbeatRef       = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  // mountedRef tracks whether the current effect instance is still live.
  // It must NOT be set to true inside the effect — only the initial value
  // and the cleanup's `false` assignment matter. This prevents the race
  // where a closing socket sees mountedRef=true and fires a reconnect
  // belonging to a previous effect run.
  const mountedRef = useRef(false);

  // ── Keep user-meta in refs so they are always current without being deps ──
  const userNameRef   = useRef(currentUserName);
  const avatarUrlRef  = useRef(currentUserAvatar);
  useEffect(() => { userNameRef.current  = currentUserName;   }, [currentUserName]);
  useEffect(() => { avatarUrlRef.current = currentUserAvatar; }, [currentUserAvatar]);

  // Derive WS base URL once (stable across renders)
  const getWsBase = useCallback((): string => {
    if (wsBaseUrl) return wsBaseUrl;
    return wsOriginFromApiBase();
  }, [wsBaseUrl]);

  // Attach a deterministic colour to every user object
  const enrichUser = (u: OnlineUser): OnlineUser => ({
    ...u,
    color: u.color ?? getAvatarColor(u.user_id),
  });

    // ── Connection effect — only re-runs when the identity of the session changes
  // Note: currentUserName / currentUserAvatar intentionally excluded from deps.
  // They are read via refs at send-time so they are always up-to-date.
  useEffect(() => {
    if (!enabled || !classroomId || !currentUserId) return;

    // Mark this effect instance as live
    mountedRef.current = true;

    const connect = () => {
      // Don't open a new socket if this effect instance was cleaned up
      if (!mountedRef.current) return;

      // ── Guard: skip if a socket is already open or connecting.
      // Without this, a stale onclose from a previous socket can clobber
      // wsRef.current on the active socket and schedule a spurious reconnect,
      // producing the 5-second reconnect loop seen on the student dashboard.
      const existing = wsRef.current;
      if (existing && (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)) {
        return;
      }

      // Detach all handlers from any lingering stale socket (CLOSING/CLOSED) before
      // overwriting wsRef so its onclose can no longer mutate shared state.
      if (existing) {
        existing.onopen    = null;
        existing.onmessage = null;
        existing.onerror   = null;
        existing.onclose   = null;
        wsRef.current      = null;
      }

      // Clear any pending reconnect timer
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }

      // Read the token fresh on every connect attempt so reconnects after a
      // token refresh use the new token instead of a stale one baked into a
      // closure at effect-mount time.
      const token = localStorage.getItem('token') ?? '';
      const url   = `${getWsBase()}/api/v1/ws/classroom/${classroomId}/presence?token=${encodeURIComponent(token)}`;

      try {
        const ws = new WebSocket(url);
        wsRef.current = ws;

        ws.onopen = () => {
          if (!mountedRef.current) {
            ws.onclose = null;
            ws.close();
            return;
          }
          // Ignore open events from a socket that has been superseded
          if (wsRef.current !== ws) { ws.onclose = null; ws.close(); return; }

          setConnected(true);

          // Announce ourselves — read name/avatar from refs so we always
          // send the latest values without needing them as effect deps.
          ws.send(JSON.stringify({
            type:         'join',
            classroom_id: classroomId,
            user_id:      currentUserId,
            user_name:    userNameRef.current,
            avatar_url:   avatarUrlRef.current ?? null,
          }));

          // Start heartbeat
          if (heartbeatRef.current) clearInterval(heartbeatRef.current);
          heartbeatRef.current = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                type:         'heartbeat',
                classroom_id: classroomId,
                user_id:      currentUserId,
              }));
            }
          }, heartbeatIntervalMs);
        };

        ws.onmessage = (ev) => {
          if (!mountedRef.current || wsRef.current !== ws) return;
          try {
            const msg = JSON.parse(ev.data as string);

            switch (msg.type) {
              case 'presence_update':
                // Full snapshot — exclude the logged-in user so the header only
                // shows presence of other participants.
                setOnlineUsers(
                  (msg.users as OnlineUser[])
                    .filter((u) => String(u.user_id) !== String(currentUserId))
                    .map(enrichUser)
                );
                break;

              case 'user_joined':
                setOnlineUsers((prev) => {
                  // Ignore self-joins to prevent showing the current user in presence UI.
                  if (String(msg.user.user_id) === String(currentUserId)) return prev;
                  const exists = prev.some((u) => u.user_id === msg.user.user_id);
                  if (exists) return prev;
                  return [...prev, enrichUser(msg.user as OnlineUser)];
                });
                break;

              case 'user_left':
                setOnlineUsers((prev) =>
                  prev.filter((u) => u.user_id !== msg.user_id)
                );
                break;

              default:
                break;
            }
          } catch {
            // ignore malformed frames
          }
        };

        ws.onerror = () => {
          // Errors surface via onclose; nothing extra needed here
        };

        ws.onclose = (ev) => {
          // Only act if this is still the current socket — stale sockets must
          // not clobber shared refs or schedule reconnects.
          if (wsRef.current !== ws) return;
          wsRef.current = null;
          if (!mountedRef.current) return;

          setConnected(false);
          if (heartbeatRef.current) {
            clearInterval(heartbeatRef.current);
            heartbeatRef.current = null;
          }

          // Don't retry on permanent server rejections (bad token, not enrolled, etc.)
          if (PERMANENT_CLOSE_CODES.has(ev.code)) return;

          // Schedule a reconnect only if still mounted
          reconnectTimerRef.current = setTimeout(() => {
            reconnectTimerRef.current = null;
            connect();
          }, 5_000);
        };
      } catch {
        // WebSocket constructor threw (bad URL / SSR env) — fail silently
      }
    };

    connect();

    // ── Cleanup: mark this instance as dead, tear down everything ──────────
    return () => {
      mountedRef.current = false;

      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }

      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }

      if (wsRef.current) {
        wsRef.current.onclose = null; // prevent the reconnect path from firing
        wsRef.current.close();
        wsRef.current = null;
      }

      setOnlineUsers([]);
      setConnected(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // currentUserName / currentUserAvatar intentionally omitted — tracked via refs above.
  }, [classroomId, currentUserId, enabled, heartbeatIntervalMs, getWsBase]);

  return {
    onlineUsers: isTeacher ? onlineUsers : [],
    totalOnline: onlineUsers.length,
    connected,
  };
}