/**
 * OrderParagraphsBlock.tsx
 *
 * Paragraph reordering; order of paragraph ids syncs bidirectionally in live mode.
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

interface OrderParagraphsData {
  title?: string;
  question?: OrderingSentencesDraft;
  payload?: Record<string, unknown>;
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

export default function OrderParagraphsBlock({
  item,
  mode,
  onComplete,
}: ExerciseBlockProps) {
  const typedItem = item as unknown as OrderParagraphsItemData;
  const question = typedItem.data?.question;

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

  const itemByIdRef = useRef<Map<string, TokenDraft>>(new Map());

  useEffect(() => {
    setOrderedItems(initialItems);
    setDraggingIndex(null);
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
      const ids = remote as string[];
      const next: TokenDraft[] = [];
      for (const id of ids) {
        const token = itemByIdRef.current.get(id);
        if (token) next.push(token);
      }
      if (next.length === ids.length) setOrderedItems(next);
    },
    { bidirectional: true },
  );

  useEffect(() => {
    if (!question || completedRef.current || isTeacher) return;
    const currentOrder = orderedItems.map((currentItem) => currentItem.id);
    const isComplete =
      currentOrder.length === question.correct_order.length &&
      currentOrder.every(
        (itemId, index) => itemId === question.correct_order[index],
      );
    if (isComplete) {
      completedRef.current = true;
      onComplete();
    }
  }, [isTeacher, onComplete, orderedItems, question]);

  const moveItem = useCallback((fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
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

      {question.prompt?.trim() && (
        <div className="bs-prompt">{question.prompt}</div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {orderedItems.map((currentItem, index) => {
          const correctRank =
            question.correct_order.indexOf(currentItem.id) >= 0
              ? question.correct_order.indexOf(currentItem.id) + 1
              : null;
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
                borderRadius: 18,
                border: `1.5px solid ${showCanonicalRowHint ? "#c4b5fd" : "#e2e8f0"}`,
                background: showCanonicalRowHint ? "#faf5ff" : "#f8fafc",
                boxShadow: showCanonicalRowHint
                  ? "0 0 0 3px rgba(167, 139, 250, 0.35)"
                  : undefined,
              }}
            >
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

              <span
                style={{
                  flexShrink: 0,
                  width: 28,
                  height: 28,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 8,
                  background: "#eef2ff",
                  color: "#4f46e5",
                  fontSize: 12,
                  fontWeight: 800,
                }}
              >
                {index + 1}
              </span>

              {teacherOrderHints && correctRank != null && (
                <span
                  className="swf-teacher-answer-hint"
                  style={{ flexShrink: 0, alignSelf: "center", margin: 0 }}
                  title="Canonical position in the answer key"
                >
                  Key #{correctRank}
                </span>
              )}

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
