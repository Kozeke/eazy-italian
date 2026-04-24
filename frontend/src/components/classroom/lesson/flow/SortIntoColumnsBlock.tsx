/**
 * SortIntoColumnsBlock.tsx
 *
 * Sort tokens into columns; drag placements sync bidirectionally in live sessions.
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
  OrderingWordsDraft,
  TokenDraft,
} from "../editors/QuestionEditorRenderer";
import { useLiveSyncField } from "../../../../hooks/useLiveSession";
import { LiveSessionContext } from "../../live/LiveSessionProvider";
import { showTeacherExerciseHints } from "./showTeacherExerciseHints";
import "./DragToGap.css";

/** Raw column entry produced by the unit-generator (pre-question-hydration path). */
interface RawColumnEntry {
  title: string;
  words: string[];
}

interface SortIntoColumnsData {
  title?: string;
  question?: OrderingWordsDraft;
  payload?: Record<string, unknown>;
  /** Legacy / unit-generator format: present when question is absent. */
  columns?: RawColumnEntry[];
}

interface SortIntoColumnsItemData {
  type: "sort_into_columns";
  id: string;
  label?: string;
  data: SortIntoColumnsData;
  status: string;
}

/**
 * Convert the raw `{columns: [{title, words}]}` shape (stored by the unit
 * generator before `_ordering_words_from_sort_columns` was introduced) into
 * the `OrderingWordsDraft` shape that `buildColumns` / `SortIntoColumnsBlock`
 * expects.  Token IDs mirror the Python generator: `sic_{colIdx}_{wordIdx}`.
 */
function buildQuestionFromRawColumns(
  rawColumns: RawColumnEntry[],
): OrderingWordsDraft {
  const tokensInOrder: TokenDraft[] = [];
  const sentenceGroups: string[][] = [];
  const columnTitles: string[] = [];

  rawColumns.forEach((col, colIdx) => {
    const groupIds: string[] = [];
    col.words.forEach((word, wordIdx) => {
      const id = `sic_${colIdx}_${wordIdx}`;
      tokensInOrder.push({ id, text: word });
      groupIds.push(id);
    });
    sentenceGroups.push(groupIds);
    columnTitles.push(col.title ?? `Column ${colIdx + 1}`);
  });

  const correctOrder = tokensInOrder.map((t) => t.id);

  // Odds-first scramble — mirrors SortIntoColumnsEditorPage.scrambleTokenIds
  function scramble(ids: string[]): string[] {
    if (ids.length <= 1) return [...ids];
    if (ids.length === 2) return [ids[1], ids[0]];
    const odds = ids.filter((_, i) => i % 2 === 1).reverse();
    const evens = ids.filter((_, i) => i % 2 === 0);
    const result = [...odds, ...evens];
    return result.every((id, i) => id === ids[i]) ? [...ids.slice(1), ids[0]] : result;
  }

  const tokById = new Map(tokensInOrder.map((t) => [t.id, t]));
  const scrambledTokens = scramble(correctOrder).map((id) => ({ ...tokById.get(id)! }));

  return {
    type: "ordering_words",
    prompt: "",
    tokens: scrambledTokens,
    correct_order: correctOrder,
    score: 1,
    metadata: {
      sentence_groups: sentenceGroups,
      column_titles: columnTitles,
    },
  } as unknown as OrderingWordsDraft;
}

interface ColumnInfo {
  title: string;
  tokens: TokenDraft[];
}

/** Serialized drag state for column-sort exercises */
interface SortColumnsLiveBlob {
  placements: Record<string, number>;
  feedbackByColumn: Record<number, "correct" | "wrong">;
}

function buildColumns(question: OrderingWordsDraft): ColumnInfo[] {
  const tokenById = new Map(question.tokens.map((token) => [token.id, token]));
  const rawGroups = Array.isArray(question.metadata?.sentence_groups)
    ? question.metadata.sentence_groups
    : [];
  const rawTitles = Array.isArray(question.metadata?.column_titles)
    ? question.metadata.column_titles
    : [];

  const columns = rawGroups
    .map((group, index) => ({
      title:
        typeof rawTitles[index] === "string" && rawTitles[index].trim()
          ? rawTitles[index]
          : `Column ${index + 1}`,
      tokens: group
        .map((tokenId) => tokenById.get(tokenId))
        .filter(Boolean)
        .map((token) => ({ ...(token as TokenDraft) })),
    }))
    .filter((column) => column.tokens.length > 0);

  if (columns.length > 0) return columns;

  return [
    {
      title: "Column 1",
      tokens: question.correct_order
        .map((tokenId) => tokenById.get(tokenId))
        .filter(Boolean)
        .map((token) => ({ ...(token as TokenDraft) })),
    },
  ];
}

export default function SortIntoColumnsBlock({
  item,
  mode,
  onComplete,
  suppressAnswerFeedback = false,
}: ExerciseBlockProps) {
  const typedItem = item as unknown as SortIntoColumnsItemData;

  // Resolve question: prefer the canonical `data.question` field produced by the
  // Python generator; fall back to converting `data.columns` for exercises that
  // were persisted by the unit-generator before question-hydration was added.
  const question: OrderingWordsDraft | undefined = useMemo(() => {
    if (typedItem.data?.question) return typedItem.data.question;
    const rawCols = typedItem.data?.columns;
    if (Array.isArray(rawCols) && rawCols.length >= 2) {
      return buildQuestionFromRawColumns(rawCols as RawColumnEntry[]);
    }
    return undefined;
  }, [typedItem.data]);

  const liveCtx = useContext(LiveSessionContext);
  const isTeacher = liveCtx?.role === "teacher";
  const teacherColumnHints = showTeacherExerciseHints(mode, liveCtx?.role);

  const columns = useMemo(
    () => (question ? buildColumns(question) : []),
    [question],
  );
  const [wordPool] = useState<TokenDraft[]>(() =>
    (question?.tokens ?? []).map((token) => ({ ...token })),
  );
  const [placements, setPlacements] = useState<Record<string, number>>({});
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overColumnIndex, setOverColumnIndex] = useState<number | null>(null);
  const [feedbackByColumn, setFeedbackByColumn] = useState<
    Record<number, "correct" | "wrong">
  >({});
  const completedRef = useRef(false);

  const sortColumnsLiveBlob = useMemo<SortColumnsLiveBlob>(
    () => ({ placements, feedbackByColumn }),
    [placements, feedbackByColumn],
  );

  useLiveSyncField(
    `ex/${typedItem.id}/sic`,
    sortColumnsLiveBlob,
    (remote) => {
      const payload = remote as Partial<SortColumnsLiveBlob> | null;
      if (!payload || typeof payload !== "object") return;
      if (payload.placements && typeof payload.placements === "object") {
        setPlacements(payload.placements as Record<string, number>);
      }
      if (
        payload.feedbackByColumn &&
        typeof payload.feedbackByColumn === "object"
      ) {
        setFeedbackByColumn(
          payload.feedbackByColumn as Record<number, "correct" | "wrong">,
        );
      }
    },
    { bidirectional: true },
  );

  const correctColumnByTokenId = useMemo(() => {
    const mapping = new Map<string, number>();
    columns.forEach((column, columnIndex) => {
      column.tokens.forEach((token) => {
        mapping.set(token.id, columnIndex);
      });
    });
    return mapping;
  }, [columns]);

  useEffect(() => {
    setPlacements({});
    setDraggingId(null);
    setOverColumnIndex(null);
    setFeedbackByColumn({});
    completedRef.current = false;
  }, [typedItem.id]);

  const columnVisualFeedback = useCallback(
    (columnIndex: number): "correct" | "wrong" | undefined => {
      if (suppressAnswerFeedback) return undefined;
      const direct = feedbackByColumn[columnIndex];
      if (direct) return direct;
      for (const token of wordPool) {
        if (
          placements[token.id] === columnIndex &&
          correctColumnByTokenId.get(token.id) !== columnIndex
        ) {
          return "wrong";
        }
      }
      const inColumn = wordPool.filter(
        (token) => placements[token.id] === columnIndex,
      );
      if (inColumn.length === 0) return undefined;
      if (
        inColumn.every(
          (token) => correctColumnByTokenId.get(token.id) === columnIndex,
        )
      ) {
        return "correct";
      }
      return undefined;
    },
    [
      suppressAnswerFeedback,
      feedbackByColumn,
      wordPool,
      placements,
      correctColumnByTokenId,
    ],
  );

  useEffect(() => {
    if (isTeacher) return;
    if (suppressAnswerFeedback) {
      const everyTokenPlaced =
        wordPool.length > 0 &&
        wordPool.every((token) => placements[token.id] !== undefined);
      if (everyTokenPlaced && !completedRef.current) {
        completedRef.current = true;
        onComplete();
      }
      return;
    }
    const allPlaced =
      wordPool.length > 0 &&
      wordPool.every(
        (token) =>
          placements[token.id] === correctColumnByTokenId.get(token.id),
      );
    if (allPlaced && !completedRef.current) {
      completedRef.current = true;
      onComplete();
    }
  }, [
    correctColumnByTokenId,
    isTeacher,
    onComplete,
    placements,
    wordPool,
    suppressAnswerFeedback,
  ]);

  const handleChipDragStart = useCallback(
    (wordId: string, e: React.DragEvent) => {
      setDraggingId(wordId);
      e.dataTransfer.setData("text/plain", wordId);
      e.dataTransfer.effectAllowed = "move";
    },
    [],
  );

  const handleChipDragEnd = useCallback(() => {
    setDraggingId(null);
    setOverColumnIndex(null);
  }, []);

  const handleDropOnColumn = useCallback(
    (columnIndex: number, e: React.DragEvent) => {
      const droppedWordId = draggingId ?? e.dataTransfer.getData("text/plain");
      if (!droppedWordId) return;

      const isCorrect =
        correctColumnByTokenId.get(droppedWordId) === columnIndex;

      setPlacements((prev) => {
        const next = { ...prev };
        if (suppressAnswerFeedback || isCorrect) {
          next[droppedWordId] = columnIndex;
        } else {
          delete next[droppedWordId];
        }
        return next;
      });
      setFeedbackByColumn((prev) => {
        if (suppressAnswerFeedback) return {};
        return {
          ...prev,
          [columnIndex]: isCorrect ? "correct" : "wrong",
        };
      });
      setDraggingId(null);
      setOverColumnIndex(null);
    },
    [correctColumnByTokenId, draggingId, placements, suppressAnswerFeedback],
  );

  const handleDropOnPool = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const droppedWordId = draggingId ?? e.dataTransfer.getData("text/plain");
      if (!droppedWordId) return;

      setPlacements((prev) => {
        const next = { ...prev };
        delete next[droppedWordId];
        return next;
      });
      setDraggingId(null);
      setOverColumnIndex(null);
    },
    [draggingId],
  );

  const handlePlacedWordClick = useCallback((wordId: string) => {
    setPlacements((prev) => {
      const next = { ...prev };
      delete next[wordId];
      return next;
    });
  }, []);

  if (!question || columns.length === 0) {
    return (
      <div className="dtg-block">
        <div className="dtg-block-title">
          {typedItem.data?.title || typedItem.label || "Sort into columns"}
        </div>
        <div className="twg-helper-bar">No columns configured yet.</div>
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

      <div
        className="dtg-pool-bar"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDropOnPool}
        aria-label="Word pool — drag words into the columns below"
      >
        {wordPool.map((word) => {
          const isUsed = placements[word.id] !== undefined;
          const isDragging = draggingId === word.id;

          return (
            <span
              key={word.id}
              className={[
                "dtg-chip",
                "dtg-chip--draggable",
                isUsed ? "dtg-chip--used" : "",
                isDragging ? "dtg-chip--dragging" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              draggable={!isUsed}
              onDragStart={(e) => !isUsed && handleChipDragStart(word.id, e)}
              onDragEnd={handleChipDragEnd}
              aria-label={`Word: ${word.text}${isUsed ? " (placed)" : ""}`}
            >
              <GripVertical size={11} />
              {word.text}
            </span>
          );
        })}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: 16,
        }}
      >
        {columns.map((column, columnIndex) => {
          const placedTokens = wordPool.filter(
            (token) => placements[token.id] === columnIndex,
          );
          const feedback = columnVisualFeedback(columnIndex);
          const feedbackClass =
            feedback === "correct"
              ? "dtg-drop-zone--correct"
              : feedback === "wrong"
                ? "dtg-drop-zone--wrong"
                : "";
          const targetColForDrag =
            draggingId != null
              ? correctColumnByTokenId.get(draggingId)
              : undefined;
          const teacherHintClass =
            teacherColumnHints &&
            draggingId &&
            targetColForDrag === columnIndex &&
            !feedbackClass
              ? "dtg-drop-zone--teacher-hint"
              : "";

          return (
            <div
              key={`column-${columnIndex}`}
              className={[
                "dtg-drop-zone",
                overColumnIndex === columnIndex ? "dtg-drop-zone--over" : "",
                feedbackClass,
                teacherHintClass,
              ]
                .filter(Boolean)
                .join(" ")}
              style={{
                minHeight: 220,
                display: "flex",
                flexDirection: "column",
                alignItems: "stretch",
                gap: 12,
                padding: 16,
                borderRadius: 20,
                background: "#f8fafc",
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setOverColumnIndex(columnIndex);
              }}
              onDragLeave={() => setOverColumnIndex(null)}
              onDrop={(e) => {
                e.preventDefault();
                handleDropOnColumn(columnIndex, e);
              }}
            >
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 800,
                  color: "#1a1d3a",
                  paddingBottom: 10,
                  borderBottom: "1px solid #e2e8f0",
                }}
              >
                {column.title}
              </div>

              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 8,
                  alignContent: "flex-start",
                  minHeight: 120,
                }}
              >
                {placedTokens.length > 0 ? (
                  placedTokens.map((token) => (
                    <button
                      key={token.id}
                      type="button"
                      className={[
                        "dtg-chip",
                        "dtg-chip--draggable",
                        draggingId === token.id ? "dtg-chip--dragging" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      draggable
                      onDragStart={(e) => handleChipDragStart(token.id, e)}
                      onDragEnd={handleChipDragEnd}
                      onClick={() => handlePlacedWordClick(token.id)}
                      style={{ cursor: "grab" }}
                    >
                      <GripVertical size={11} />
                      {token.text}
                    </button>
                  ))
                ) : (
                  <span className="dtg-drop-placeholder" aria-hidden="true">
                    Drop words here
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}