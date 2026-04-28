/**
 * DragToGapBlock.tsx
 *
 * "Drag word to gap" exercise.
 *
 * Live session: placements and gap feedback sync bidirectionally via
 * `useLiveSyncField` so teachers and students mirror each other's state.
 *
 * Student view:
 *   • Top grey bar shows shuffled draggable word chips (grab cursor, GripVertical icon).
 *   • Exercise text is rendered with blank drop-zones at each gap.
 *   • Drag a chip from the bar onto a zone to fill it.
 *   • Click a filled zone to return the chip to the bar.
 *   • "Check" button activates once all gaps are filled.
 *   • After checking, zones turn green (correct) or red (wrong).
 *
 * Teacher lesson view uses the same interactive renderer as student view so
 * newly-added exercises can be tested immediately inside the lesson canvas.
 *
 * Homework (student): `suppressAnswerFeedback` keeps zones neutral and allows
 * wrong chips to stay in gaps; the teacher view still derives green/red from
 * saved placements when reviewing.
 *
 * Registered in exerciseRegistrations.ts as "drag_to_gap".
 * Data shape: DragToGapData (from DragToGapEditorPage).
 */

import React, {
  useState,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react";
import type { ExerciseBlockProps } from "./exerciseBlock.types";
import type { DragToGapData, TextSeg, GapSeg } from "./DragToGapEditorPage";
import { GripVertical, MoveHorizontal } from "lucide-react";
import { useLiveSyncField } from "../../../../hooks/useLiveSession";
import { LiveSessionContext } from "../../live/LiveSessionProvider";
import { showTeacherExerciseHints } from "./showTeacherExerciseHints";
import "./DragToGap.css";

// ── Types ──────────────────────────────────────────────────────────────────────

interface DragToGapItemData {
  type: "drag_to_gap";
  id: string;
  label?: string;
  data: DragToGapData;
  status: string;
}

interface WordEntry {
  id: string;
  word: string;
}

/** Serializable drag-to-gap state relayed over the classroom live WebSocket */
interface DragToGapLiveBlob {
  placements: Record<string, string>;
  feedbackByGap: Record<string, "correct" | "wrong">;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Block ──────────────────────────────────────────────────────────────────────

export default function DragToGapBlock({
  item,
  mode,
  onComplete,
  suppressAnswerFeedback = false,
}: ExerciseBlockProps) {
  const typedItem = item as unknown as DragToGapItemData;
  const exerciseData: DragToGapData = typedItem.data ?? {
    title: "",
    segments: [],
    gaps: {},
  };

  const { title, segments = [], gaps = {} } = exerciseData;

  // Used so lesson completion runs for students only (teacher follows along in guided mode)
  const liveCtx = useContext(LiveSessionContext);
  // Skips student completion when the live teacher drives the board
  const isTeacher = liveCtx?.role === "teacher";
  // Surfaces purple canonical-gap hints for any teacher viewer (lesson canvas or live)
  const teacherHintGaps = showTeacherExerciseHints(mode, liveCtx?.role);

  // Ordered list of gap IDs as they appear in the text.
  const gapIds: string[] = segments
    .filter((s): s is GapSeg => s.type === "gap")
    .map((s) => s.id);

  // ── Word pool (shuffled, stable across re-renders) ─────────────────────────
  const [wordPool] = useState<WordEntry[]>(() =>
    shuffle(gapIds.map((id) => ({ id, word: gaps[id] ?? "" }))),
  );

  // ── Interaction state ──────────────────────────────────────────────────────
  /** placements[gapId] = wordId from the pool that is currently in that gap */
  const [placements, setPlacements] = useState<Record<string, string>>({});
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overGapId, setOverGapId] = useState<string | null>(null);
  const [feedbackByGap, setFeedbackByGap] = useState<
    Record<string, "correct" | "wrong">
  >({});

  // Prevents calling onComplete repeatedly once the exercise is considered done
  const completedRef = useRef(false);

  // Single patch payload keeps gap placements and feedback consistent across peers
  const dragToGapLiveBlob = useMemo<DragToGapLiveBlob>(
    () => ({ placements, feedbackByGap }),
    [placements, feedbackByGap],
  );

  useLiveSyncField(
    `ex/${typedItem.id}/d2g`,
    dragToGapLiveBlob,
    (remote) => {
      const payload = remote as Partial<DragToGapLiveBlob> | null;
      if (!payload || typeof payload !== "object") return;
      if (payload.placements && typeof payload.placements === "object") {
        setPlacements(payload.placements as Record<string, string>);
      }
      if (payload.feedbackByGap && typeof payload.feedbackByGap === "object") {
        setFeedbackByGap(
          payload.feedbackByGap as Record<string, "correct" | "wrong">,
        );
      }
    },
    { bidirectional: true },
  );

  const usedWordIds = new Set(Object.values(placements));

  // Gap ids whose configured answer text matches the chip currently being dragged
  const teacherDragHintGapIds = useMemo(() => {
    if (!teacherHintGaps || !draggingId) return new Set<string>();
    const chipWord =
      wordPool.find((w) => w.id === draggingId)?.word?.trim() ?? "";
    if (!chipWord) return new Set<string>();
    const next = new Set<string>();
    for (const gid of gapIds) {
      if ((gaps[gid] ?? "").trim() === chipWord) next.add(gid);
    }
    return next;
  }, [teacherHintGaps, draggingId, wordPool, gapIds, gaps]);

  useEffect(() => {
    completedRef.current = false;
  }, [typedItem.id]);

  // Per-gap styling for lesson mode and for teacher homework review (derive when only placements exist)
  const visualFeedbackByGap = useMemo(() => {
    if (suppressAnswerFeedback)
      return {} as Record<string, "correct" | "wrong">;
    const out: Record<string, "correct" | "wrong"> = { ...feedbackByGap };
    for (const gapId of gapIds) {
      if (out[gapId]) continue;
      const wordId = placements[gapId];
      if (!wordId) continue;
      const placedWord = wordPool.find((w) => w.id === wordId)?.word ?? "";
      const ok = placedWord.trim() === (gaps[gapId] ?? "").trim();
      out[gapId] = ok ? "correct" : "wrong";
    }
    return out;
  }, [
    suppressAnswerFeedback,
    feedbackByGap,
    gapIds,
    placements,
    wordPool,
    gaps,
  ]);

  // Fires when remote sync fills all gaps correctly (not only on local drop)
  useEffect(() => {
    if (isTeacher) return;
    if (suppressAnswerFeedback) {
      const allFilled =
        gapIds.length > 0 &&
        gapIds.every((gapId) => Boolean(placements[gapId]));
      if (allFilled && !completedRef.current) {
        completedRef.current = true;
        onComplete();
      }
      return;
    }
    const allCorrect =
      gapIds.length > 0 &&
      gapIds.every((gapId) => {
        const wordId = placements[gapId];
        if (!wordId) return false;
        const placedWord = wordPool.find((w) => w.id === wordId)?.word ?? "";
        return placedWord.trim() === (gaps[gapId] ?? "").trim();
      });
    if (allCorrect && !completedRef.current) {
      completedRef.current = true;
      onComplete();
    }
  }, [
    gapIds,
    placements,
    wordPool,
    gaps,
    onComplete,
    isTeacher,
    suppressAnswerFeedback,
  ]);

  // ── Drag handlers ──────────────────────────────────────────────────────────

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
    setOverGapId(null);
  }, []);

  const handleDropOnGap = useCallback(
    (gapId: string, e: React.DragEvent) => {
      const droppedWordId = draggingId ?? e.dataTransfer.getData("text/plain");
      if (!droppedWordId) return;
      const droppedWord =
        wordPool.find((word) => word.id === droppedWordId)?.word ?? "";
      const isCorrect = droppedWord.trim() === (gaps[gapId] ?? "").trim();

      setPlacements((prev) => {
        const next = { ...prev };
        // Remove this word from any gap it was previously occupying.
        for (const [gid, wid] of Object.entries(next)) {
          if (wid === droppedWordId) delete next[gid];
        }
        if (suppressAnswerFeedback || isCorrect) {
          next[gapId] = droppedWordId;
        } else {
          delete next[gapId];
        }
        return next;
      });
      setFeedbackByGap((prev) => {
        if (suppressAnswerFeedback) return {};
        return {
          ...prev,
          [gapId]: isCorrect ? "correct" : "wrong",
        };
      });
      setDraggingId(null);
      setOverGapId(null);
    },
    [draggingId, wordPool, gaps, placements, gapIds, suppressAnswerFeedback],
  );

  const handleDropOnPool = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const droppedWordId = draggingId ?? e.dataTransfer.getData("text/plain");
      if (!droppedWordId) return;
      setPlacements((prev) => {
        const next = { ...prev };
        for (const [gid, wid] of Object.entries(next)) {
          if (wid === droppedWordId) delete next[gid];
        }
        return next;
      });
      setDraggingId(null);
    },
    [draggingId],
  );

  const handleGapClick = useCallback((gapId: string) => {
    setPlacements((prev) => {
      const next = { ...prev };
      delete next[gapId];
      return next;
    });
    setFeedbackByGap((prev) => {
      const next = { ...prev };
      delete next[gapId];
      return next;
    });
  }, []);

  // ── Interactive view (student + teacher lesson canvas) ───────────────────

  return (
    <div className="dtg-block">
      {/* ── Exercise header: title + instruction ─────────────────────────── */}
      {(title || true) && (
        <div className="dtg-exercise-header">
          {title && (
            <div className="dtg-exercise-title">{title}</div>
          )}
          <div className="dtg-exercise-instruction">
            <MoveHorizontal size={13} />
            Drag words into the correct gaps
          </div>
        </div>
      )}

      {/* ── Word pool (draggable chips) ──────────────────────────────────── */}
      <div
        className="dtg-pool-bar"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDropOnPool}
        aria-label="Word pool — drag words to the gaps below"
      >
        {wordPool.map(({ id, word }) => {
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
        })}
      </div>

      {/* ── Text with drop zones ─────────────────────────────────────────── */}
      <div className="dtg-text" aria-label="Exercise text">
        {segments.map((seg, idx) => {
          if (seg.type === "text") {
            return <span key={`t-${idx}`}>{(seg as TextSeg).value}</span>;
          }

          const gapId = (seg as GapSeg).id;
          const placedWordId = placements[gapId];
          const placedWord = placedWordId
            ? (wordPool.find((w) => w.id === placedWordId)?.word ?? "")
            : "";
          const isFilled = placedWord !== "";
          const isOver = overGapId === gapId;
          const feedback = visualFeedbackByGap[gapId];
          const feedbackClass =
            feedback === "correct"
              ? "dtg-drop-zone--correct"
              : feedback === "wrong"
                ? "dtg-drop-zone--wrong"
                : "";
          const teacherHintClass =
            teacherHintGaps &&
            draggingId &&
            teacherDragHintGapIds.has(gapId) &&
            !feedbackClass
              ? "dtg-drop-zone--teacher-hint"
              : "";

          return (
            <span
              key={gapId}
              className={[
                "dtg-drop-zone",
                isOver ? "dtg-drop-zone--over" : "",
                isFilled ? "dtg-drop-zone--filled" : "",
                feedbackClass,
                teacherHintClass,
              ]
                .filter(Boolean)
                .join(" ")}
              style={{ minWidth: Math.max(72, placedWord.length * 9 + 24) }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setOverGapId(gapId);
              }}
              onDragLeave={() => setOverGapId(null)}
              onDrop={(e) => {
                e.preventDefault();
                handleDropOnGap(gapId, e);
              }}
              onClick={() => isFilled && handleGapClick(gapId)}
              role="button"
              tabIndex={0}
              aria-label={
                isFilled
                  ? `Gap filled with "${placedWord}" — click to remove`
                  : "Empty gap — drop a word here"
              }
              onKeyDown={(e) => {
                if ((e.key === "Delete" || e.key === "Backspace") && isFilled) {
                  handleGapClick(gapId);
                }
              }}
            >
              {isFilled ? (
                placedWord
              ) : (
                <span className="dtg-drop-placeholder" aria-hidden="true" />
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}