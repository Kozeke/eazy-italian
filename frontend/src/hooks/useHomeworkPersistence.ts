/**
 * useHomeworkPersistence.ts
 *
 * Bridges the in-memory HomeworkContext with the backend homework API.
 *
 * Rules
 * ─────
 * • Teachers hydrate from GET /admin/units/:id/homework (mutations use the same API).
 * • Students hydrate from `studentSourceBlocks` (embedded on GET /units/:id) because
 *   they cannot call admin homework routes.
 * • No debounce: homework mutations are discrete clicks (add / delete /
 *   reorder), not continuous keystrokes.  Every action hits the API
 *   immediately; the context is updated only on success.
 * • On mount / unitId change: clears the context, fetches blocks, and
 *   hydrates the context from the server response.
 *
 * Serialisation helpers (inline_media special case)
 * ──────────────────────────────────────────────────
 *  Serialising HomeworkItem → API block
 *    inline_media.mediaKind  →  kind
 *
 *  Hydrating API block → HomeworkItem
 *    kind ∈ {image,video,audio}  →  type: "inline_media" + mediaKind wrapper
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useHomework } from "../contexts/HomeworkContext";
import type { HomeworkItem } from "../contexts/HomeworkContext";
import { homeworkApi } from "../services/api";
import type { HomeworkBlock } from "../services/api";

// ─── Constants ────────────────────────────────────────────────────────────────

const MEDIA_KINDS = new Set(["image", "video", "audio"]);

// ─── Serialisation helpers ─────────────────────────────────────────────────────

/** Convert an API block to an in-memory HomeworkItem */
function blockToItem(block: HomeworkBlock): HomeworkItem {
  let flowItem: Record<string, unknown>;

  if (MEDIA_KINDS.has(block.kind)) {
    // Reconstruct the inline_media wrapper that InlineMediaBlock expects
    flowItem = {
      type: "inline_media",
      id: block.id,
      mediaKind: block.kind,
      url: block.url ?? "",
      caption: block.caption ?? "",
      label: block.title ?? block.kind,
      status: "available",
    };
  } else {
    flowItem = {
      type: block.kind,
      id: block.id,
      label: block.title,
      status: "available",
      ...(block.data != null ? { data: block.data } : {}),
    };
  }

  return { id: block.id, item: flowItem };
}

/** Convert an in-memory HomeworkItem to the shape expected by the API */
function itemToApiBody(
  item: HomeworkItem,
): Omit<HomeworkBlock, "id" | "order_index"> {
  const fi = item.item as Record<string, unknown>;

  if (fi.type === "inline_media") {
    return {
      kind: fi.mediaKind as string,
      title: (fi.label as string | undefined) ?? (fi.mediaKind as string),
      url: fi.url as string | undefined,
      caption: fi.caption as string | undefined,
    };
  }

  return {
    kind: fi.type as string,
    title: (fi.label as string | undefined) ?? (fi.type as string),
    data: fi.data,
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UseHomeworkPersistenceOptions {
  unitId: number | null;
  mode: "teacher" | "student";
  /** Populated for students from unit detail `homework_blocks`; ignored in teacher mode */
  studentSourceBlocks?: HomeworkBlock[] | null;
}

export interface UseHomeworkPersistenceResult {
  /** True once the initial GET has resolved (or failed) for the current unit */
  hydrated: boolean;
  /** POST a new block; updates context on success */
  addBlock: (item: HomeworkItem) => Promise<void>;
  /** PATCH an existing block; updates context on success */
  updateBlock: (id: string, patch: Partial<HomeworkItem["item"]>) => Promise<void>;
  /** DELETE a block; updates context on success */
  deleteBlock: (id: string) => Promise<void>;
  /** Reorder a block one step up or down; updates context on success */
  reorderBlocks: (id: string, direction: "up" | "down") => Promise<void>;
}

export function useHomeworkPersistence({
  unitId,
  mode,
  studentSourceBlocks,
}: UseHomeworkPersistenceOptions): UseHomeworkPersistenceResult {
  const { items, addItem, removeItem, reorderItem } = useHomework();
  const [hydrated, setHydrated] = useState(false);

  // Stable ref so the fetch effect can clear existing items without
  // capturing `items` as a reactive dependency (which would loop).
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // ── Hydration ──────────────────────────────────────────────────────────────

  useEffect(() => {
    // Students never load via this hook
    if (mode !== "teacher") return;

    setHydrated(false);

    // Clear whatever was in context for the previous unit
    const snapshot = itemsRef.current;
    snapshot.forEach((i) => removeItem(i.id));

    if (unitId === null) return;

    let cancelled = false;

    homeworkApi
      .getBlocks(unitId)
      .then((blocks) => {
        if (cancelled) return;
        blocks.forEach((block) => addItem(blockToItem(block)));
        setHydrated(true);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[useHomeworkPersistence] Failed to load blocks:", err);
        // Mark hydrated even on error so the UI doesn't stay in a loading limbo
        setHydrated(true);
      });

    return () => {
      cancelled = true;
    };
    // addItem / removeItem are stable useCallback refs from the context
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitId, mode]);

  // ── Student hydration (read-only, from unit payload) ───────────────────────

  useEffect(() => {
    if (mode !== "student") return;

    setHydrated(false);

    // Drop previous unit’s items so the homework tab never shows stale blocks
    const snapshot = itemsRef.current;
    snapshot.forEach((i) => removeItem(i.id));

    if (unitId === null) {
      setHydrated(true);
      return;
    }

    // Treat missing array as “no blocks yet” (e.g. unit fetch cleared detail momentarily)
    const blocksFromUnit = studentSourceBlocks ?? [];

    blocksFromUnit.forEach((block: HomeworkBlock) => addItem(blockToItem(block)));
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitId, mode, studentSourceBlocks]);

  // ── Mutations ──────────────────────────────────────────────────────────────

  const addBlock = useCallback(
    async (item: HomeworkItem) => {
      if (mode !== "teacher" || unitId === null) return;
      try {
        const saved = await homeworkApi.addBlock(unitId, itemToApiBody(item));
        // Use the server-assigned id so the context stays in sync
        addItem({ ...item, id: saved.id, item: { ...item.item, id: saved.id } });
      } catch (err) {
        console.error("[useHomeworkPersistence] addBlock failed:", err);
      }
    },
    [unitId, mode, addItem],
  );

  const updateBlock = useCallback(
    async (id: string, patch: Partial<HomeworkItem["item"]>) => {
      if (mode !== "teacher" || unitId === null) return;
      try {
        // Build API patch: map label → title, handle inline_media kind swap
        const apiPatch: Partial<Omit<HomeworkBlock, "id" | "order_index">> = {};
        if ("label" in patch) apiPatch.title = patch.label;
        if ("data" in patch) apiPatch.data = patch.data;
        if ("url" in patch) apiPatch.url = patch.url;
        if ("caption" in patch) apiPatch.caption = patch.caption;
        if ("mediaKind" in patch) apiPatch.kind = patch.mediaKind;

        await homeworkApi.updateBlock(unitId, id, apiPatch);

        // Merge patch into the existing item in context via addItem (upsert)
        const existing = itemsRef.current.find((i) => i.id === id);
        if (existing) {
          addItem({ ...existing, item: { ...existing.item, ...patch } });
        }
      } catch (err) {
        console.error("[useHomeworkPersistence] updateBlock failed:", err);
      }
    },
    [unitId, mode, addItem],
  );

  const deleteBlock = useCallback(
    async (id: string) => {
      if (mode !== "teacher" || unitId === null) return;
      try {
        await homeworkApi.deleteBlock(unitId, id);
        removeItem(id);
      } catch (err) {
        console.error("[useHomeworkPersistence] deleteBlock failed:", err);
      }
    },
    [unitId, mode, removeItem],
  );

  const reorderBlocks = useCallback(
    async (id: string, direction: "up" | "down") => {
      if (mode !== "teacher" || unitId === null) return;
      try {
        await homeworkApi.reorder(unitId, id, direction);
        reorderItem(id, direction);
      } catch (err) {
        console.error("[useHomeworkPersistence] reorderBlocks failed:", err);
      }
    },
    [unitId, mode, reorderItem],
  );

  return { hydrated, addBlock, updateBlock, deleteBlock, reorderBlocks };
}