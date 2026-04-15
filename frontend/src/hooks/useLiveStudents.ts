/**
 * useLiveStudents.ts
 *
 * Derives the list of users currently connected to the live WS session by
 * subscribing to the special `_presence/users` patch key.
 *
 * ─── How it works ────────────────────────────────────────────────────────────
 *
 * The backend (live.py) now maintains a `_presence/users` entry in every room's
 * patch snapshot.  Whenever a user joins or leaves the live WS the server:
 *   1. Updates `room["patches"]["_presence/users"]` with the fresh list.
 *   2. Broadcasts a `{ type: "patch", key: "_presence/users", value: [...] }`
 *      to every connection in the room.
 *
 * Because the LiveSessionProvider already handles snapshot + ongoing patches,
 * this hook just subscribes to that key via `ctx.subscribe` — zero extra WS
 * connections, zero extra state.  The initial snapshot value fires the
 * subscriber synchronously on mount, so the panel populates immediately.
 *
 * ─── Usage (teacher side, inside LiveSessionProvider) ────────────────────────
 *
 *   const liveUsers = useLiveStudents();
 *
 *   // Merge with useOnlinePresence results (deduplicate by user_id):
 *   const mergedUsers = useMergedOnlineUsers(onlineUsers, liveUsers);
 *
 * ─── Filtering ────────────────────────────────────────────────────────────────
 *
 * The hook returns ALL connected users (teacher + students).  Call-sites should
 * filter by role or exclude the teacher's own user_id as needed.
 * StudentAnswersPanel already filters the teacher out via `teacherUserId`.
 */

import { useContext, useEffect, useRef, useState } from 'react';
import { LiveSessionContext }                        from '../components/classroom/live/LiveSessionProvider';
import { getAvatarColor }                            from './useOnlinePresence';
import type { OnlineUser }                           from './useOnlinePresence';

// ─── Wire shape from the server ───────────────────────────────────────────────

interface LivePresenceUser {
  user_id:    number;
  user_name:  string;
  avatar_url: string | null;
  role:       'teacher' | 'student';
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Returns the list of users currently connected to the live WS room.
 * Fires immediately on mount from the cached snapshot value, then
 * updates in real time as users join or leave.
 */
export function useLiveStudents(): OnlineUser[] {
  const ctx = useContext(LiveSessionContext);
  const [users, setUsers] = useState<OnlineUser[]>([]);

  // Track the unsubscribe function so we clean up on unmount or ctx change.
  const unsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!ctx) return;

    // Unsubscribe from any previous subscription before re-subscribing.
    if (unsubRef.current) {
      unsubRef.current();
      unsubRef.current = null;
    }

    const unsub = ctx.subscribe('_presence/users', (raw) => {
      if (!Array.isArray(raw)) return;

      const enriched: OnlineUser[] = (raw as LivePresenceUser[]).map((u) => ({
        user_id:    u.user_id,
        user_name:  u.user_name ?? `User ${u.user_id}`,
        avatar_url: u.avatar_url ?? null,
        color:      getAvatarColor(u.user_id),
      }));

      setUsers(enriched);
    });

    unsubRef.current = unsub;

    return () => {
      unsub();
      unsubRef.current = null;
    };
  // ctx is stable after provider mounts — safe to use as sole dep.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx]);

  return users;
}