/**
 * DragWordToImageBlock.tsx
 *
 * Drag words onto image cards. State syncs bidirectionally in live sessions
 * (same mechanism as TypeWordInGap).
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
  DragToImageCard,
  DragToImageData,
} from "./DragWordToImageEditorPage";
import { useLiveSyncField } from "../../../../hooks/useLiveSession";
import { LiveSessionContext } from "../../live/LiveSessionProvider";
import { showTeacherExerciseHints } from "./showTeacherExerciseHints";
import "./DragToGap.css";

interface DragToImageItemData {
  type: "drag_to_image";
  id: string;
  label?: string;
  data: DragToImageData;
  status: string;
}

interface WordEntry {
  id: string;
  word: string;
}

/** Serializable state for WebSocket patch relay */
interface DragToImageLiveBlob {
  placements: Record<string, string>;
  feedbackByCard: Record<string, "correct" | "wrong">;
}

function shuffle<T>(arr: T[]): T[] {
  const next = [...arr];
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

export default function DragWordToImageBlock({
  item,
  mode,
  onComplete,
  suppressAnswerFeedback = false,
}: ExerciseBlockProps) {
  const typedItem = item as unknown as DragToImageItemData;
  const exerciseData: DragToImageData = typedItem.data ?? {
    title: "",
    cards: [],
  };

  const { title, cards = [] } = exerciseData;

  // Skips onComplete when the viewer is the teacher (mirrors TypeWordInGapBlock)
  const liveCtx = useContext(LiveSessionContext);
  const isTeacher = liveCtx?.role === "teacher";
  const teacherDragHints = showTeacherExerciseHints(mode, liveCtx?.role);

  const [wordPool] = useState<WordEntry[]>(() =>
    shuffle(
      cards
        .filter((card) => card.answer.trim() !== "")
        .map((card) => ({ id: card.id, word: card.answer.trim() })),
    ),
  );
  const [placements, setPlacements] = useState<Record<string, string>>({});
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overCardId, setOverCardId] = useState<string | null>(null);
  const [feedbackByCard, setFeedbackByCard] = useState<
    Record<string, "correct" | "wrong">
  >({});

  // Ensures onComplete runs once after the exercise is finished for this mount
  const completedRef = useRef(false);

  // Bundles placement + feedback so one patch updates both sides atomically
  const dragToImageLiveBlob = useMemo<DragToImageLiveBlob>(
    () => ({ placements, feedbackByCard }),
    [placements, feedbackByCard],
  );

  useLiveSyncField(
    `ex/${typedItem.id}/dti`,
    dragToImageLiveBlob,
    (remote) => {
      const payload = remote as Partial<DragToImageLiveBlob> | null;
      if (!payload || typeof payload !== "object") return;
      if (payload.placements && typeof payload.placements === "object") {
        setPlacements(payload.placements as Record<string, string>);
      }
      if (
        payload.feedbackByCard &&
        typeof payload.feedbackByCard === "object"
      ) {
        setFeedbackByCard(
          payload.feedbackByCard as Record<string, "correct" | "wrong">,
        );
      }
    },
    { bidirectional: true },
  );

  const usedWordIds = new Set(Object.values(placements));

  const draggedChipWord = draggingId
    ? (wordPool.find((entry) => entry.id === draggingId)?.word ?? "").trim()
    : "";

  const isCardCorrect = useCallback(
    (cardId: string, wordId: string) => {
      const card = cards.find((entry) => entry.id === cardId);
      const word = wordPool.find((entry) => entry.id === wordId)?.word ?? "";
      return word.trim() === (card?.answer ?? "").trim();
    },
    [cards, wordPool],
  );

  useEffect(() => {
    completedRef.current = false;
  }, [typedItem.id]);

  const visualFeedbackByCard = useMemo(() => {
    if (suppressAnswerFeedback)
      return {} as Record<string, "correct" | "wrong">;
    const out: Record<string, "correct" | "wrong"> = { ...feedbackByCard };
    for (const card of cards) {
      if (!card.id || out[card.id]) continue;
      const wordId = placements[card.id];
      if (!wordId) continue;
      out[card.id] = isCardCorrect(card.id, wordId) ? "correct" : "wrong";
    }
    return out;
  }, [
    suppressAnswerFeedback,
    feedbackByCard,
    cards,
    placements,
    isCardCorrect,
  ]);

  useEffect(() => {
    if (isTeacher) return;
    if (suppressAnswerFeedback) {
      const allFilled =
        cards.length > 0 &&
        cards.every((card) => {
          if (!card.answer.trim()) return true;
          return Boolean(placements[card.id]);
        });
      if (allFilled && !completedRef.current) {
        completedRef.current = true;
        onComplete();
      }
      return;
    }
    const allCorrect =
      cards.length > 0 &&
      cards.every((card) => {
        const wordId = placements[card.id];
        return wordId ? isCardCorrect(card.id, wordId) : false;
      });
    if (allCorrect && !completedRef.current) {
      completedRef.current = true;
      onComplete();
    }
  }, [
    cards,
    isCardCorrect,
    isTeacher,
    onComplete,
    placements,
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
    setOverCardId(null);
  }, []);

  const handleDropOnCard = useCallback(
    (cardId: string, e: React.DragEvent) => {
      const droppedWordId = draggingId ?? e.dataTransfer.getData("text/plain");
      if (!droppedWordId) return;

      const correct = isCardCorrect(cardId, droppedWordId);

      setPlacements((prev) => {
        const next = { ...prev };
        for (const [existingCardId, existingWordId] of Object.entries(next)) {
          if (existingWordId === droppedWordId) delete next[existingCardId];
        }
        if (suppressAnswerFeedback || correct) {
          next[cardId] = droppedWordId;
        } else {
          delete next[cardId];
        }
        return next;
      });

      setFeedbackByCard((prev) => {
        if (suppressAnswerFeedback) return {};
        return {
          ...prev,
          [cardId]: correct ? "correct" : "wrong",
        };
      });
      setDraggingId(null);
      setOverCardId(null);
    },
    [cards, draggingId, isCardCorrect, placements, suppressAnswerFeedback],
  );

  const handleDropOnPool = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const droppedWordId = draggingId ?? e.dataTransfer.getData("text/plain");
      if (!droppedWordId) return;

      setPlacements((prev) => {
        const next = { ...prev };
        for (const [cardId, wordId] of Object.entries(next)) {
          if (wordId === droppedWordId) delete next[cardId];
        }
        return next;
      });

      setDraggingId(null);
      setOverCardId(null);
    },
    [draggingId],
  );

  const handleRemovePlacement = useCallback((cardId: string) => {
    setPlacements((prev) => {
      const next = { ...prev };
      delete next[cardId];
      return next;
    });
    setFeedbackByCard((prev) => {
      const next = { ...prev };
      delete next[cardId];
      return next;
    });
  }, []);

  const visibleCards = useMemo(
    () => cards.filter((card): card is DragToImageCard => Boolean(card.id)),
    [cards],
  );

  return (
    <div className="dtg-block dti-block">
      {/* ── Exercise header: title + instruction ─────────────────────────── */}
      <div className="dtg-exercise-header">
        {title && (
          <div className="dtg-exercise-title">{title}</div>
        )}
        <div className="dtg-exercise-instruction">
          Drag words onto the correct images
        </div>
      </div>

      <div
        className="dtg-pool-bar"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDropOnPool}
        aria-label="Word pool"
      >
        {wordPool.length === 0 ? (
          <span className="dtg-pool-bar-empty">
            Add answer words in the editor first.
          </span>
        ) : (
          wordPool.map(({ id, word }) => {
            const isUsed = usedWordIds.has(id);
            const isDragging = draggingId === id;

            return (
              <span
                key={id}
                className={[
                  "dtg-chip",
                  "dtg-chip--draggable",
                  isUsed ? "dtg-chip--used" : "",
                  isDragging ? "dtg-chip--dragging" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                draggable={!isUsed}
                onDragStart={(e) => !isUsed && handleChipDragStart(id, e)}
                onDragEnd={handleChipDragEnd}
                aria-label={`Word: ${word}${isUsed ? " (placed)" : ""}`}
              >
                <GripVertical size={11} />
                {word}
              </span>
            );
          })
        )}
      </div>

      <div className="dti-player-grid" aria-label="Image cards">
        {visibleCards.map((card) => {
          const placedWordId = placements[card.id];
          const placedWord = placedWordId
            ? (wordPool.find((entry) => entry.id === placedWordId)?.word ?? "")
            : "";
          const isFilled = placedWord !== "";
          const isOver = overCardId === card.id;
          const feedback = visualFeedbackByCard[card.id];
          const teacherHintDrop =
            teacherDragHints &&
            draggedChipWord &&
            (card.answer ?? "").trim() === draggedChipWord &&
            !feedback;

          return (
            <div key={card.id} className="dti-player-card">
              <div className="dti-player-image-shell">
                {card.imageUrl.trim() ? (
                  <img
                    src={card.imageUrl}
                    alt=""
                    className="dti-player-image"
                  />
                ) : (
                  <div className="dti-player-image-placeholder">No image</div>
                )}
              </div>

              <button
                type="button"
                className={[
                  "dti-player-drop-zone",
                  isOver ? "dti-player-drop-zone--over" : "",
                  isFilled ? "dti-player-drop-zone--filled" : "",
                  feedback === "correct" ? "dti-player-drop-zone--correct" : "",
                  feedback === "wrong" ? "dti-player-drop-zone--wrong" : "",
                  teacherHintDrop ? "dti-player-drop-zone--teacher-hint" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  setOverCardId(card.id);
                }}
                onDragLeave={() => setOverCardId(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  handleDropOnCard(card.id, e);
                }}
                onClick={() => isFilled && handleRemovePlacement(card.id)}
                aria-label={
                  isFilled
                    ? `Placed word ${placedWord}. Click to remove.`
                    : "Drop the correct word here"
                }
              >
                {isFilled ? (
                  placedWord
                ) : (
                  <span className="dti-player-drop-placeholder">Drop word</span>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}