/**
 * OrderParagraphsBlock.tsx
 *
 * Paragraph reordering; order of paragraph ids syncs bidirectionally in live mode.
 *
 * Features:
 *  - Auto-check: green border = correct position, red border = wrong position (after first drag)
 *  - All-correct celebration: all borders flash green for 2 s, then onComplete fires
 *  - Teacher: position badge shows the correct order number (1 = "goes first")
 *  - Student: no position numbers shown
 */

import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { GripVertical } from "lucide-react";
import type { ExerciseBlockProps } from "./exerciseBlock.types";
import type {
  OrderingSentencesDraft,
  TokenDraft,
} from "../editors/QuestionEditorRenderer";
import { useLiveSyncField } from "../../../../hooks/useLiveSession";
import { LiveSessionContext } from "../../live/LiveSessionProvider";
import { showTeacherExerciseHints } from "./showTeacherExerciseHints";
import "./DragToGap.css";

// Fixed learner-facing instruction for paragraph-ordering blocks to avoid sourcing prompt text from generated data.
const ORDER_PARAGRAPHS_PROMPT_TEXT = "Reorder the paragraphs to form the correct sequence.";

interface OrderParagraphsData {
  title?: string;
  question?: OrderingSentencesDraft;
  payload?: Record<string, unknown>;
  // Flat format saved by unit generator and exercise generation API
  items?: Array<{ id: string; text: string; correct_order?: number }>;
  shuffled?: string[];
}

interface OrderParagraphsItemData {
  type: "order_paragraphs";
  id: string;
  label?: string;
  data: OrderParagraphsData;
  status: string;
}

function getInitialItems(question: OrderingSentencesDraft): TokenDraft[] {
  if (question.items.length > 0)
    return question.items.map((item) => ({ ...item }));

  const itemById = new Map(question.items.map((item) => [item.id, item]));
  return question.correct_order
    .map((itemId) => itemById.get(itemId))
    .filter(Boolean)
    .map((item) => ({ ...(item as TokenDraft) }));
}

/**
 * Resolves an OrderingSentencesDraft from either storage format:
 *  - Nested: data.question (saved by OrderParagraphsEditorPage)
 *  - Flat:   data.items[]  (saved by unit generator & exercise generation API)
 */
function resolveQuestion(
  data: OrderParagraphsData,
  label?: string,
): OrderingSentencesDraft | undefined {
  if (data.question) return data.question;

  if (data.items && data.items.length > 0) {
    const sorted = [...data.items].sort(
      (a, b) => (a.correct_order ?? 0) - (b.correct_order ?? 0),
    );
    const items: TokenDraft[] = sorted.map((item) => ({
      id: item.id,
      text: item.text,
    }));
    const correct_order = sorted.map((item) => item.id);
    return {
      type: "ordering_sentences",
      prompt: data.title ?? label ?? "",
      items,
      correct_order,
      score: 1,
    };
  }

  return undefined;
}

// Compares two ordered id arrays to prevent no-op state writes from live-sync echoes.
function areIdOrdersEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

export default function OrderParagraphsBlock({
  item,
  mode,
  onComplete,
}: ExerciseBlockProps) {
  const typedItem = item as unknown as OrderParagraphsItemData;
  const question = resolveQuestion(typedItem.data, typedItem.label);

  const liveCtx = useContext(LiveSessionContext);
  const isTeacher = liveCtx?.role === "teacher";
  const teacherOrderHints = showTeacherExerciseHints(mode, liveCtx?.role);

  const initialItems = useMemo(
    () => (question ? getInitialItems(question) : []),
    [question],
  );
  const [orderedItems, setOrderedItems] = useState<TokenDraft[]>(initialItems);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const completedRef = useRef(false);

  /** True after the student has made at least one drag move — enables live coloring. */
  const [hasDragged, setHasDragged] = useState(false);
  /** Briefly true when every paragraph lands in the correct slot. */
  const [celebrating, setCelebrating] = useState(false);

  const itemByIdRef = useRef<Map<string, TokenDraft>>(new Map());

  useEffect(() => {
    setOrderedItems(initialItems);
    setDraggingIndex(null);
    setHasDragged(false);
    setCelebrating(false);
    completedRef.current = false;
  }, [initialItems, typedItem.id]);

  useEffect(() => {
    itemByIdRef.current = new Map(
      initialItems.map((entry) => [entry.id, entry]),
    );
  }, [initialItems]);

  const orderIds = useMemo(
    () => orderedItems.map((entry) => entry.id),
    [orderedItems],
  );

  useLiveSyncField(
    `ex/${typedItem.id}/op`,
    orderIds,
    (remote) => {
      if (!Array.isArray(remote)) return;
      // Stores the remotely-synced order of paragraph ids.
      const ids = remote as string[];
      // Builds the next ordered paragraph list from the item registry.
      const next: TokenDraft[] = [];
      for (const id of ids) {
        const token = itemByIdRef.current.get(id);
        if (token) next.push(token);
      }
      if (next.length !== ids.length) return;
      setOrderedItems((previous) => {
        // Prevent render loops by ignoring remote updates that do not change id ordering.
        const previousIds = previous.map((entry) => entry.id);
        if (areIdOrdersEqual(previousIds, ids)) return previous;
        return next;
      });
    },
    { bidirectional: true },
  );

  /** Completion + celebration logic */
  useEffect(() => {
    if (!question || completedRef.current || isTeacher || !hasDragged) return;
    const currentOrder = orderedItems.map((ci) => ci.id);
    const isComplete =
      currentOrder.length === question.correct_order.length &&
      currentOrder.every((id, idx) => id === question.correct_order[idx]);
    if (isComplete) {
      completedRef.current = true;
      setCelebrating(true);
      setTimeout(() => {
        setCelebrating(false);
        onComplete();
      }, 1800);
    }
  }, [isTeacher, onComplete, orderedItems, question, hasDragged]);

  const moveItem = useCallback((fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    setHasDragged(true);
    setOrderedItems((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }, []);

  if (!question || orderedItems.length === 0) {
    return (
      <div className="dtg-block">
        <div className="dtg-block-title">
          {typedItem.data?.title || typedItem.label || "Order paragraphs"}
        </div>
        <div className="twg-helper-bar">No paragraphs configured yet.</div>
      </div>
    );
  }

  return (
    <div className="dtg-block bs-block">
      {(typedItem.data?.title || typedItem.label) && (
        <div className="dtg-block-title">
          {typedItem.data?.title || typedItem.label}
        </div>
      )}

      <div className="bs-prompt">{ORDER_PARAGRAPHS_PROMPT_TEXT}</div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {orderedItems.map((currentItem, index) => {
          /** 1-based position this paragraph SHOULD be in (answer key) */
          const correctRank =
            question.correct_order.indexOf(currentItem.id) >= 0
              ? question.correct_order.indexOf(currentItem.id) + 1
              : null;

          /** Is this paragraph currently sitting in its correct slot? */
          const isInCorrectSlot =
            question.correct_order[index] === currentItem.id;

          // ── drag-target hint for the teacher (highlights canonical slot) ─────
          const draggedParagraphId =
            draggingIndex !== null
              ? orderedItems[draggingIndex]?.id
              : undefined;
          const canonicalSlotIndex =
            draggedParagraphId != null
              ? question.correct_order.indexOf(draggedParagraphId)
              : -1;
          const showCanonicalRowHint =
            teacherOrderHints &&
            draggingIndex !== null &&
            canonicalSlotIndex >= 0 &&
            index === canonicalSlotIndex;

          // ── border / background based on correctness ──────────────────────────
          let borderColor = "#e2e8f0";
          let bgColor = "#f8fafc";
          let boxShadow: string | undefined;

          if (celebrating) {
            // All-correct celebration: everything goes green
            borderColor = "#22c55e";
          } else if (showCanonicalRowHint) {
            // Teacher drag-target hint
            borderColor = "#c4b5fd";
            bgColor = "#faf5ff";
            boxShadow = "0 0 0 3px rgba(167, 139, 250, 0.35)";
          } else if (hasDragged && !isTeacher) {
            // Student live feedback — border only
            borderColor = isInCorrectSlot ? "#22c55e" : "#f87171";
          }

          return (
            <div
              key={currentItem.id}
              onDragOver={(e) => {
                if (draggingIndex === null) return;
                e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (draggingIndex === null) return;
                moveItem(draggingIndex, index);
                setDraggingIndex(null);
              }}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
                padding: "14px 16px",
                borderRadius: 14,
                border: `1.5px solid ${borderColor}`,
                background: bgColor,
                boxShadow,
                transition:
                  "border-color 0.25s ease, background 0.25s ease, box-shadow 0.25s ease",
              }}
            >
              {/* ── drag handle ─────────────────────────────────────────────── */}
              <button
                type="button"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = "move";
                  setDraggingIndex(index);
                }}
                onDragEnd={() => {
                  setDraggingIndex(null);
                }}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  border: "1px solid #e2e8f0",
                  background: "#fff",
                  color: "#94a3b8",
                  cursor: "grab",
                  flexShrink: 0,
                }}
                aria-label={`Drag paragraph ${index + 1}`}
              >
                <GripVertical size={14} />
              </button>

              {/* ── position badge: correct order for teacher, hidden for student ─ */}
              {teacherOrderHints && correctRank != null && (
                <span
                  title={`This paragraph belongs in position ${correctRank}`}
                  style={{
                    flexShrink: 0,
                    minWidth: 28,
                    height: 28,
                    paddingInline: 6,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 8,
                    background: "#EEF0FE",
                    color: "#4F52C2",
                    fontSize: 12,
                    fontWeight: 800,
                    lineHeight: 1,
                    gap: 3,
                    whiteSpace: "nowrap",
                  }}
                >
                  #{correctRank}
                </span>
              )}

              {/* ── paragraph text ───────────────────────────────────────────── */}
              <div
                style={{
                  flex: 1,
                  fontSize: 14,
                  lineHeight: 1.6,
                  color: "#1e293b",
                  whiteSpace: "pre-wrap",
                }}
              >
                {currentItem.text}
              </div>

            </div>
          );
        })}
      </div>
    </div>
  );
}