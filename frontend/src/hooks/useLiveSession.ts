/**
 * useLiveSession.ts
 *
 * Two hooks:
 *
 *  useLiveSession()      — access the raw patch/subscribe API
 *  useLiveSyncField()    — one-liner integration for any exercise input
 *
 * ─── useLiveSyncField ────────────────────────────────────────────────────────
 *
 *  Integrates a single field into the live sync channel.
 *
 *  Default (unidirectional):
 *  • Teacher:  on every local value change → broadcasts the new value
 *  • Student:  when a remote patch arrives  → calls onChange silently
 *
 *  Bidirectional mode ({ bidirectional: true }):
 *  • Both roles broadcast their local changes
 *  • Both roles subscribe to remote patches
 *  • Echo prevention: a value that arrived from remote is not re-broadcast back
 *
 *  Use bidirectional for classroom exercises so teachers and students mirror
 *  each other's inputs in real time (all flow exercise blocks use this mode).
 *
 *  The hook is designed to be a zero-friction drop-in inside any exercise
 *  block that already has (value, onChange) state:
 *
 *    // Per-field (e.g. TypeWordInGap gaps, typed image cards):
 *    useLiveSyncField(`ex/${item.id}/${gapId}`, value, onChange, { bidirectional: true });
 *
 *    // Combined blob (e.g. DragToGap placements + feedback):
 *    useLiveSyncField(`ex/${item.id}/d2g`, { placements, feedbackByGap }, applyRemote, { bidirectional: true });
 *
 *    // MatchPairsBlock — sync the whole answers map at once:
 *    useLiveSyncField(`ex/${item.id}/answers`, answers, (v) => setAnswers(v as typeof answers));
 *
 *    // BuildSentenceBlock — sync word order array:
 *    useLiveSyncField(`ex/${item.id}/order`, wordOrder, (v) => setWordOrder(v as string[]));
 *
 *    // SortIntoColumnsBlock — sync columns map:
 *    useLiveSyncField(`ex/${item.id}/columns`, columns, (v) => setColumns(v as typeof columns));
 *
 *  Returns nothing. Pure side-effects only.
 */

import { useContext, useEffect, useRef } from "react";
import { LiveSessionContext } from "../components/classroom/live/LiveSessionProvider";
import { HomeworkSyncPrefixContext } from "../contexts/HomeworkSyncPrefixContext";

// ─── Block-reset registry ─────────────────────────────────────────────────────
//
// Module-level store: when a block is reset (teacher or student side),
// `markBlockReset(blockId)` stamps it here. The subscribe callback in
// `useLiveSyncField` checks this registry and, if the block was just reset,
// ignores the immediate cached WS value that the provider replays on subscribe,
// then patches `null` back to the server to wipe the stale cache so future
// subscribers also start clean.
//
// The flag is cleared automatically after 5 s (well beyond any component
// mount cycle) so it never leaks across unrelated sessions.

const pendingBlockResets = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Call this BEFORE bumping the React key that remounts an exercise block.
 * It tells every `useLiveSyncField` instance mounted for `blockId` to discard
 * the first incoming remote value (which is the stale WS-cached answer).
 *
 * Works for ALL exercise types — including those that use per-gap/per-card
 * keys — because the registry is keyed on blockId and WS keys are parsed to
 * extract it at subscription time.
 */
export function markBlockReset(blockId: string): void {
  const existing = pendingBlockResets.get(blockId);
  if (existing !== undefined) clearTimeout(existing);
  // 1 s is plenty to cover the async cache-replay tick (setTimeout 0, fires in < 5 ms)
  // plus the server null-patch round-trip (< 200 ms). Keeping it short means the
  // teacher can immediately start demonstrating after a reset without the 5 s blackout.
  pendingBlockResets.set(
    blockId,
    setTimeout(() => pendingBlockResets.delete(blockId), 1_000),
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
   * Echo prevention is handled automatically: a value received from the
   * remote will not be re-broadcast back, preventing infinite loops.
   *
   * @default false
   */
  bidirectional?: boolean;
}

/**
 * @param key      Stable sync key, e.g. `ex/${item.id}/${gapId}`
 * @param value    The current local value
 * @param onChange Called with the remote value when a patch arrives
 * @param options  Optional config — pass `{ bidirectional: true }` for
 *                 two-way sync (student input visible to teacher)
 */
export function useLiveSyncField(
  key: string,
  value: unknown,
  onChange: (remoteValue: unknown) => void,
  options?: LiveSyncOptions,
): void {
  const ctx = useContext(LiveSessionContext);
  const homeworkPrefix = useContext(HomeworkSyncPrefixContext) ?? "";

  const { bidirectional = false } = options ?? {};

  // Prefix homework keys so they never collide with in-lesson `ex/…` sync keys
  const resolvedKey = homeworkPrefix ? `${homeworkPrefix}${key}` : key;

  // Keep onChange stable in a ref so the subscription never stale-captures it
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Tracks whether the latest value change was triggered by a remote patch.
  // If so, we skip re-broadcasting it to prevent an echo loop.
  const isRemoteUpdateRef = useRef(false);

  // ── Broadcast: teacher always; student only when bidirectional ───────────
  const prevValueRef = useRef<unknown>(undefined);
  const prevResolvedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!ctx) return;

    const shouldPatch = ctx.role === "teacher" || bidirectional;
    if (!shouldPatch) return;

    if (prevResolvedKeyRef.current !== resolvedKey) {
      prevResolvedKeyRef.current = resolvedKey;
      prevValueRef.current = undefined;
    }

    // Skip the very first render (no patch on mount)
    if (prevValueRef.current === undefined) {
      prevValueRef.current = value;
      return;
    }

    // Skip no-ops
    if (prevValueRef.current === value) return;
    prevValueRef.current = value;

    // If this state change was triggered by an incoming remote patch, don't
    // echo it back — that would cause an infinite update loop.
    if (isRemoteUpdateRef.current) {
      isRemoteUpdateRef.current = false;
      return;
    }

    ctx.patch(resolvedKey, value);

    // value is the intentional reactive dep; resolvedKey when switching homework unit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, resolvedKey]);

  // ── Subscribe: student always; teacher when bidirectional ────────────────
  useEffect(() => {
    if (!ctx) return;

    const shouldSubscribe = ctx.role === "student" || bidirectional;
    if (!shouldSubscribe) return;

    // ── Reset-awareness ──────────────────────────────────────────────────────
    // LiveSessionProvider.subscribe fires the cached value via setTimeout(, 0),
    // i.e. ASYNCHRONOUSLY — not synchronously during the subscribe() call.
    // A "firstCallbackConsumed" closure variable therefore cannot tell apart
    // the stale-cache replay from a real live update: by the time the async
    // callback fires, firstCallbackConsumed is already true.
    //
    // Instead, we check pendingBlockResets on EVERY incoming value.
    // markBlockReset() stamps the blockId and auto-clears after 1 s, which is
    // long enough to cover the async tick + WS round-trip but short enough
    // that a teacher can re-demonstrate immediately after resetting.
    //
    // When a stale value is detected we also patch null back so that:
    //  • The server cache is wiped (future subscribers start blank).
    //  • The null ACK that comes back is also discarded (remoteValue === null).
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
      // Mark that the next state update will be from a remote source
      // so the broadcast effect above can skip re-emitting it.
      isRemoteUpdateRef.current = true;
      onChangeRef.current(remoteValue);
    });

    return unsub;

    // resolvedKey switches when homework unit context changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedKey, ctx, bidirectional]);
}
