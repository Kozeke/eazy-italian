/**
 * useLiveSession.ts  (v2 — extended markBlockReset guard)
 *
 * Changes from v1:
 * ─────────────────
 * • markBlockReset guard extended from 1 s → 5 s.
 *
 *   The guard is the second line of defence (first line is evictBlockFromCache,
 *   which deletes stale cache entries synchronously before the key bump).
 *   With the cache eviction in place, the guard should rarely be needed.
 *   But it still catches edge cases:
 *     – WS snapshot arrives after a reconnect, re-injecting old answers
 *     – REST re-hydration completes concurrently with the reset
 *     – Slow React batching delays the key bump beyond one scheduler tick
 *
 *   1 s was too tight for any of these; 5 s covers real-world reconnect
 *   latencies (RECONNECT_MS = 5 000) plus the DB round-trip for null writes.
 *   After 5 s the block is unguarded, which is safe: by then either the null
 *   rows are persisted (REST clear) or the WS echo has already arrived.
 *
 * All prior logic is unchanged.
 */

import { useContext, useEffect, useRef } from "react";
import { LiveSessionContext } from "../components/classroom/live/LiveSessionProvider";
import { HomeworkSyncPrefixContext } from "../contexts/HomeworkSyncPrefixContext";

// ─── Block-reset registry ─────────────────────────────────────────────────────

const pendingBlockResets = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Call this BEFORE bumping the React key that remounts an exercise block.
 * It tells every `useLiveSyncField` instance mounted for `blockId` to discard
 * the first incoming remote value (which is the stale WS-cached answer).
 *
 * Guard duration: 5 000 ms (up from 1 000 ms) to cover:
 *   • WS reconnect + snapshot re-injection (RECONNECT_MS = 5 000)
 *   • DB round-trip for null sentinel writes (~200 ms)
 *   • Slow React scheduler batching
 *
 * The primary defence against stale-cache replay is evictBlockFromCache()
 * (called from bumpAnswerReset before the key bump).  This guard is the
 * belt-and-suspenders fallback for values that enter the cache AFTER
 * eviction (e.g. a WS snapshot received mid-reset).
 */
export function markBlockReset(blockId: string): void {
  const existing = pendingBlockResets.get(blockId);
  if (existing !== undefined) clearTimeout(existing);
  pendingBlockResets.set(
    blockId,
    setTimeout(() => pendingBlockResets.delete(blockId), 5_000), // ← was 1_000
  );
}

/** Extract blockId from a WS key containing `/ex/{blockId}/…` (lesson or homework-prefixed). */
function extractBlockId(key: string): string | null {
  const marker = "/ex/";
  const pos = key.indexOf(marker);
  if (pos === -1) return null;
  const rest = key.slice(pos + marker.length);
  const nextSlash = rest.indexOf("/");
  if (nextSlash === -1) return null;
  return rest.slice(0, nextSlash);
}

// ─── useLiveSession ───────────────────────────────────────────────────────────

export function useLiveSession() {
  const ctx = useContext(LiveSessionContext);
  if (!ctx)
    throw new Error("useLiveSession must be used inside <LiveSessionProvider>");
  return ctx;
}

// ─── useLiveSyncField ─────────────────────────────────────────────────────────

export interface LiveSyncOptions {
  /**
   * When true, both teacher and student broadcast their changes AND
   * subscribe to the other side's patches. Ideal for "monitor student
   * input" scenarios (e.g. TypeWordInGap).
   *
   * @default false
   */
  bidirectional?: boolean;
}

/**
 * @param key      Stable sync key, e.g. `ex/${item.id}/gap-0`
 * @param value    Current local value (from useState)
 * @param onChange Called when a remote patch arrives
 * @param options  { bidirectional } — see LiveSyncOptions
 */
export function useLiveSyncField(
  key: string,
  value: unknown,
  onChange: (remoteValue: unknown) => void,
  options: LiveSyncOptions = {},
): void {
  const { bidirectional = false } = options;

  const ctx = useContext(LiveSessionContext);
  const hwPrefix = useContext(HomeworkSyncPrefixContext);

  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  const isRemoteUpdateRef = useRef(false);

  // Resolved key — prepend homework prefix when inside a homework context
  const resolvedKey = hwPrefix ? `${hwPrefix}${key}` : key;

  // ── Broadcast: teacher always; student when bidirectional ────────────────
  useEffect(() => {
    if (!ctx) return;
    const shouldBroadcast = ctx.role === "teacher" || bidirectional;
    if (!shouldBroadcast) return;

    if (isRemoteUpdateRef.current) {
      isRemoteUpdateRef.current = false;
      return;
    }

    ctx.patch(resolvedKey, value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, resolvedKey]);

  // ── Subscribe: student always; teacher when bidirectional ────────────────
  useEffect(() => {
    if (!ctx) return;

    const shouldSubscribe = ctx.role === "student" || bidirectional;
    if (!shouldSubscribe) return;

    const blockId = extractBlockId(resolvedKey);

    const unsub = ctx.subscribe(resolvedKey, (remoteValue) => {
      if (blockId && pendingBlockResets.has(blockId)) {
        // Stale server-cache replay after a reset — discard it.
        // Only send the null wipe once (skip if already null to avoid echo loop).
        if (remoteValue !== null) {
          ctx.patch(resolvedKey, null);
        }
        return;
      }
      isRemoteUpdateRef.current = true;
      onChangeRef.current(remoteValue);
    });

    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedKey, ctx, bidirectional]);
}