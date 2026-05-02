/**
 * MatchPairsBlock.tsx
 *
 * Matching lines UI; completed pairs list syncs bidirectionally in live sessions.
 */

import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  MatchItemDraft,
  MatchingPairsDraft,
  PairDraft,
} from "../editors/QuestionEditorRenderer";
import type { ExerciseBlockProps } from "./exerciseBlock.types";
import { useLiveSyncField } from "../../../../hooks/useLiveSession";
import { LiveSessionContext } from "../../live/LiveSessionProvider";
import { showTeacherExerciseHints } from "./showTeacherExerciseHints";
import "./DragToGap.css";

interface MatchPairsData {
  title?: string;
  question?: MatchingPairsDraft;
  payload?: Record<string, unknown>;
  // Flat API format (AI-generated blocks without a `question` wrapper)
  left_items?: MatchItemDraft[];
  right_items?: MatchItemDraft[];
  pairs?: PairDraft[];
}

interface MatchPairsItemData {
  type: "match_pairs";
  id: string;
  label?: string;
  data: MatchPairsData;
  status: string;
}

interface ActiveSelection {
  side: "left" | "right";
  id: string;
}

interface MatchLine {
  leftId: string;
  rightId: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
}

const MATCH_COLORS = [
  "#6366f1",
  "#06b6d4",
  "#f97316",
  "#22c55e",
  "#ec4899",
  "#8b5cf6",
  "#eab308",
  "#14b8a6",
];
// Fixed learner-facing instruction for match-pairs blocks to avoid duplicating generated titles.
const MATCH_PAIRS_PROMPT_TEXT = "Match each item on the left with its correct pair on the right.";

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function deterministicShuffle<T extends { id: string }>(
  items: T[],
  seed: string,
): T[] {
  return [...items].sort((a, b) => {
    const aHash = hashString(`${seed}:${a.id}`);
    const bHash = hashString(`${seed}:${b.id}`);
    if (aHash !== bHash) return aHash - bHash;
    return a.id.localeCompare(b.id);
  });
}

function colorWithAlpha(hex: string, alpha: string): string {
  return `${hex}${alpha}`;
}

export default function MatchPairsBlock({
  item,
  mode,
  onComplete,
  suppressAnswerFeedback = false,
}: ExerciseBlockProps) {
  const typedItem = item as unknown as MatchPairsItemData;
  // Support both:
  //   1. Editor-saved format: data.question = MatchingPairsDraft
  //   2. Flat AI-generated format: data.left_items / data.right_items / data.pairs
  const question = typedItem.data?.question;
  const flatLeftItems = typedItem.data?.left_items;
  const flatRightItems = typedItem.data?.right_items;
  const flatPairs = typedItem.data?.pairs;
  const hasFlatData =
    !question && Array.isArray(flatLeftItems) && flatLeftItems.length > 0;

  const boardRef = useRef<HTMLDivElement | null>(null);
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const wrongResetTimerRef = useRef<number | null>(null);
  // Avoids duplicate onComplete callbacks once this block is finished
  const completedRef = useRef(false);

  const liveCtx = useContext(LiveSessionContext);
  const isTeacher = liveCtx?.role === "teacher";
  // Enables correct-pair highlights when a teacher previews matching in teacher mode or live teacher role
  const teacherPairHints = showTeacherExerciseHints(mode, liveCtx?.role);

  const leftItems = useMemo<MatchItemDraft[]>(() => {
    const raw = hasFlatData
      ? (flatLeftItems ?? [])
      : (question?.left_items ?? []);
    // Flat AI payloads use parallel arrays — shuffle the left column too so rows are not aligned answers
    return hasFlatData
      ? deterministicShuffle(raw, `${typedItem.id}:left`)
      : [...raw];
  }, [hasFlatData, flatLeftItems, question, typedItem.id]);
  const rightItems = useMemo<MatchItemDraft[]>(() => {
    const raw = hasFlatData
      ? (flatRightItems ?? [])
      : (question?.right_items ?? []);
    const shouldShuffle = hasFlatData
      ? true
      : (question?.shuffle_right ?? false);
    return shouldShuffle
      ? deterministicShuffle(raw, `${typedItem.id}:right`)
      : [...raw];
  }, [hasFlatData, flatRightItems, question, typedItem.id]);
  const correctPairs = useMemo<PairDraft[]>(
    () => (hasFlatData ? (flatPairs ?? []) : (question?.pairs ?? [])),
    [hasFlatData, flatPairs, question],
  );
  const rightByLeftId = useMemo(
    () => new Map(correctPairs.map((pair) => [pair.left_id, pair.right_id])),
    [correctPairs],
  );
  const leftByRightId = useMemo(
    () => new Map(correctPairs.map((pair) => [pair.right_id, pair.left_id])),
    [correctPairs],
  );
  const colorByLeftId = useMemo(
    () =>
      new Map(
        correctPairs.map((pair, index) => [
          pair.left_id,
          MATCH_COLORS[index % MATCH_COLORS.length],
        ]),
      ),
    [correctPairs],
  );

  // Seeded Sattolo derangement for the right column.
  //
  // Strategy:
  //   1. Build `aligned[]` — right items reordered so aligned[i] is the
  //      CORRECT match for leftItems[i].  This is the "original" array that
  //      Sattolo will derange.
  //   2. Apply seeded Sattolo (j ∈ [0,i), not [0,i]) — every element is
  //      guaranteed to move, so no correct pair can ever sit in the same row.
  //   3. The seed is derived from the exercise ID, so the layout is stable
  //      across re-renders but different for every exercise.
  //
  // This handles ALL sources: editor-saved, AI flat-format, and legacy
  // exercises with shuffle_right:true.
  const displayRightItems = useMemo<MatchItemDraft[]>(() => {
    const n = leftItems.length;
    if (n <= 1 || rightItems.length === 0) return rightItems;

    // Step 1 — align right items to left order
    const aligned: MatchItemDraft[] = [];
    for (const leftItem of leftItems) {
      const correctRightId = rightByLeftId.get(leftItem.id);
      const rightItem = rightItems.find((r) => r.id === correctRightId);
      if (rightItem) aligned.push(rightItem);
    }
    // Safety: if we can't build a full aligned array fall back to stored order
    if (aligned.length !== n) return rightItems;

    // Step 2 — seeded Sattolo shuffle (guaranteed derangement)
    // LCG parameters from Numerical Recipes; >>> 0 keeps it uint32.
    let state = hashString(`${typedItem.id}:sattolo`);
    const seededRand = (max: number): number => {
      state = ((state * 1664525) + 1013904223) >>> 0;
      return state % max;
    };
    const result = [...aligned];
    for (let i = n - 1; i > 0; i--) {
      const j = seededRand(i); // [0, i) — Sattolo's derangement guarantee
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }, [rightItems, leftItems, rightByLeftId, typedItem.id]);

  const [activeSelection, setActiveSelection] =
    useState<ActiveSelection | null>(null);
  const [matchedPairs, setMatchedPairs] = useState<PairDraft[]>([]);
  const [wrongIds, setWrongIds] = useState<string[]>([]);
  const [lines, setLines] = useState<MatchLine[]>([]);
  const [boardSize, setBoardSize] = useState({ width: 0, height: 0 });

  const isFullyCorrect = useMemo(
    () =>
      correctPairs.length > 0 &&
      correctPairs.every((canonicalPair) =>
        matchedPairs.some(
          (attemptedPair) =>
            attemptedPair.left_id === canonicalPair.left_id &&
            attemptedPair.right_id === canonicalPair.right_id,
        ),
      ),
    [correctPairs, matchedPairs],
  );

  useLiveSyncField(
    `ex/${typedItem.id}/mp`,
    matchedPairs,
    (remote) => {
      if (Array.isArray(remote)) {
        setMatchedPairs(remote as PairDraft[]);
      }
    },
    { bidirectional: true },
  );

  const matchedRightIds = useMemo(
    () => new Set(matchedPairs.map((pair) => pair.right_id)),
    [matchedPairs],
  );
  const matchedLeftIds = useMemo(
    () => new Set(matchedPairs.map((pair) => pair.left_id)),
    [matchedPairs],
  );

  useEffect(() => {
    setActiveSelection(null);
    setMatchedPairs([]);
    setWrongIds([]);
    setLines([]);
    setBoardSize({ width: 0, height: 0 });
    completedRef.current = false;
    if (wrongResetTimerRef.current) {
      window.clearTimeout(wrongResetTimerRef.current);
      wrongResetTimerRef.current = null;
    }
  }, [typedItem.id]);

  useEffect(
    () => () => {
      if (wrongResetTimerRef.current) {
        window.clearTimeout(wrongResetTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (correctPairs.length === 0 || completedRef.current || isTeacher) return;
    if (suppressAnswerFeedback) {
      const everyLeftMatched = leftItems.every((leftItem) =>
        matchedPairs.some((pair) => pair.left_id === leftItem.id),
      );
      if (everyLeftMatched) {
        completedRef.current = true;
        onComplete();
      }
      return;
    }
    if (!isFullyCorrect) return;
    completedRef.current = true;
    onComplete();
  }, [
    correctPairs.length,
    isFullyCorrect,
    isTeacher,
    leftItems,
    matchedPairs,
    onComplete,
    suppressAnswerFeedback,
  ]);

  const getColorForItem = useCallback(
    (side: "left" | "right", id: string) => {
      const leftId = side === "left" ? id : leftByRightId.get(id);
      return leftId ? colorByLeftId.get(leftId) : undefined;
    },
    [colorByLeftId, leftByRightId],
  );

  const recomputeLines = useCallback(() => {
    const board = boardRef.current;
    if (!board) {
      setLines([]);
      return;
    }

    const boardRect = board.getBoundingClientRect();
    setBoardSize({
      width: boardRect.width,
      height: boardRect.height,
    });

    const nextLines = matchedPairs
      .map((pair) => {
        const leftEl = buttonRefs.current[pair.left_id];
        const rightEl = buttonRefs.current[pair.right_id];
        if (!leftEl || !rightEl) return null;

        const leftRect = leftEl.getBoundingClientRect();
        const rightRect = rightEl.getBoundingClientRect();
        const expectedRight = rightByLeftId.get(pair.left_id);
        const pairOk = expectedRight === pair.right_id;
        const lineColor = suppressAnswerFeedback
          ? "#cbd5e1"
          : pairOk
            ? (colorByLeftId.get(pair.left_id) ?? MATCH_COLORS[0])
            : "#ef4444";

        return {
          leftId: pair.left_id,
          rightId: pair.right_id,
          x1: leftRect.right - boardRect.left,
          y1: leftRect.top + leftRect.height / 2 - boardRect.top,
          x2: rightRect.left - boardRect.left,
          y2: rightRect.top + rightRect.height / 2 - boardRect.top,
          color: lineColor,
        };
      })
      .filter(Boolean) as MatchLine[];

    setLines(nextLines);
  }, [colorByLeftId, matchedPairs, rightByLeftId, suppressAnswerFeedback]);

  useEffect(() => {
    recomputeLines();

    const handleResize = () => recomputeLines();
    window.addEventListener("resize", handleResize);

    const observer =
      typeof ResizeObserver !== "undefined" && boardRef.current
        ? new ResizeObserver(() => recomputeLines())
        : null;
    if (observer && boardRef.current) {
      observer.observe(boardRef.current);
    }

    return () => {
      window.removeEventListener("resize", handleResize);
      observer?.disconnect();
    };
  }, [recomputeLines]);

  const handleWrongMatch = useCallback((leftId: string, rightId: string) => {
    setWrongIds([leftId, rightId]);
    if (wrongResetTimerRef.current) {
      window.clearTimeout(wrongResetTimerRef.current);
    }
    wrongResetTimerRef.current = window.setTimeout(() => {
      setWrongIds([]);
      wrongResetTimerRef.current = null;
    }, 450);
  }, []);

  const handlePick = useCallback(
    (side: "left" | "right", id: string) => {
      if (suppressAnswerFeedback) {
        if (side === "left" && matchedLeftIds.has(id)) {
          setMatchedPairs((prev) => prev.filter((pair) => pair.left_id !== id));
          setActiveSelection(null);
          return;
        }
        if (side === "right" && matchedRightIds.has(id)) {
          setMatchedPairs((prev) =>
            prev.filter((pair) => pair.right_id !== id),
          );
          setActiveSelection(null);
          return;
        }
      } else {
        if (side === "left" && matchedLeftIds.has(id)) return;
        if (side === "right" && matchedRightIds.has(id)) return;
      }

      if (!activeSelection) {
        setActiveSelection({ side, id });
        return;
      }

      if (activeSelection.side === side) {
        setActiveSelection({ side, id });
        return;
      }

      const leftId = side === "left" ? id : activeSelection.id;
      const rightId = side === "right" ? id : activeSelection.id;
      const isCorrect = rightByLeftId.get(leftId) === rightId;

      if (!isCorrect) {
        if (suppressAnswerFeedback) {
          setMatchedPairs((prev) => {
            if (prev.some((pair) => pair.left_id === leftId)) return prev;
            return [...prev, { left_id: leftId, right_id: rightId }];
          });
          setWrongIds([]);
          setActiveSelection(null);
          return;
        }
        setActiveSelection(null);
        handleWrongMatch(leftId, rightId);
        return;
      }

      setMatchedPairs((prev) => {
        if (prev.some((pair) => pair.left_id === leftId)) return prev;
        return [...prev, { left_id: leftId, right_id: rightId }];
      });
      setWrongIds([]);
      setActiveSelection(null);
    },
    [
      activeSelection,
      handleWrongMatch,
      matchedLeftIds,
      matchedRightIds,
      rightByLeftId,
      suppressAnswerFeedback,
    ],
  );

  const teacherHintRightId =
    teacherPairHints && activeSelection?.side === "left"
      ? (rightByLeftId.get(activeSelection.id) ?? null)
      : null;
  const teacherHintLeftId =
    teacherPairHints && activeSelection?.side === "right"
      ? (leftByRightId.get(activeSelection.id) ?? null)
      : null;

  if (leftItems.length === 0 || rightItems.length === 0) {
    return (
      <div className="dtg-block">
        <div className="dtg-block-title">
          {typedItem.data?.title || typedItem.label || "Match pairs"}
        </div>
        <div className="twg-helper-bar">No pairs configured yet.</div>
      </div>
    );
  }

  return (
    <div className="dtg-block mp-block">
      {(typedItem.data?.title || typedItem.label) && (
        <div className="dtg-block-title">
          {typedItem.data?.title || typedItem.label}
        </div>
      )}

      <div className="bs-prompt">{MATCH_PAIRS_PROMPT_TEXT}</div>

      <div ref={boardRef} className="mp-player-board">
        <div className="mp-player-columns">
          <div className="mp-player-column">
            {leftItems.map((leftItem) => {
              const isSelected =
                activeSelection?.side === "left" &&
                activeSelection.id === leftItem.id;
              const isMatched = matchedLeftIds.has(leftItem.id);
              const isWrong =
                !suppressAnswerFeedback && wrongIds.includes(leftItem.id);
              const color = getColorForItem("left", leftItem.id);
              const pairForLeft = matchedPairs.find(
                (p) => p.left_id === leftItem.id,
              );
              const pairCorrect =
                Boolean(pairForLeft) &&
                rightByLeftId.get(leftItem.id) === pairForLeft?.right_id;

              return (
                <button
                  key={leftItem.id}
                  ref={(element) => {
                    buttonRefs.current[leftItem.id] = element;
                  }}
                  type="button"
                  className={[
                    "mp-player-item",
                    teacherHintLeftId === leftItem.id
                      ? "mp-player-item--teacher-hint"
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => handlePick("left", leftItem.id)}
                  style={{
                    borderColor: isMatched
                      ? suppressAnswerFeedback
                        ? "#cbd5e1"
                        : pairCorrect
                          ? (color ?? "#6c6fef")
                          : "#ef4444"
                      : isWrong
                        ? "#ef4444"
                        : isSelected
                          ? "#6c6fef"
                          : "#e2e8f0",
                    background: isMatched
                      ? suppressAnswerFeedback
                        ? "#f1f5f9"
                        : pairCorrect
                          ? colorWithAlpha(color ?? "#6c6fef", "18")
                          : "#fee2e2"
                      : isWrong
                        ? "#fee2e2"
                        : isSelected
                          ? "#eef0fe"
                          : "#ffffff",
                    color:
                      isMatched && !suppressAnswerFeedback && pairCorrect
                        ? (color ?? "#6c6fef")
                        : "#1e293b",
                  }}
                >
                  {leftItem.text}
                </button>
              );
            })}
          </div>

          <div className="mp-player-column mp-player-column--right">
            {displayRightItems.map((rightItem) => {
              const isSelected =
                activeSelection?.side === "right" &&
                activeSelection.id === rightItem.id;
              const isMatched = matchedRightIds.has(rightItem.id);
              const isWrong =
                !suppressAnswerFeedback && wrongIds.includes(rightItem.id);
              const color = getColorForItem("right", rightItem.id);
              const pairForRight = matchedPairs.find(
                (p) => p.right_id === rightItem.id,
              );
              const pairCorrect =
                pairForRight !== undefined &&
                rightByLeftId.get(pairForRight.left_id) === rightItem.id;

              return (
                <button
                  key={rightItem.id}
                  ref={(element) => {
                    buttonRefs.current[rightItem.id] = element;
                  }}
                  type="button"
                  className={[
                    "mp-player-item",
                    "mp-player-item--right",
                    teacherHintRightId === rightItem.id
                      ? "mp-player-item--teacher-hint"
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => handlePick("right", rightItem.id)}
                  style={{
                    borderColor: isMatched
                      ? suppressAnswerFeedback
                        ? "#cbd5e1"
                        : pairCorrect
                          ? (color ?? "#6c6fef")
                          : "#ef4444"
                      : isWrong
                        ? "#ef4444"
                        : isSelected
                          ? "#6c6fef"
                          : "#e2e8f0",
                    background: isMatched
                      ? suppressAnswerFeedback
                        ? "#f1f5f9"
                        : pairCorrect
                          ? colorWithAlpha(color ?? "#6c6fef", "18")
                          : "#fee2e2"
                      : isWrong
                        ? "#fee2e2"
                        : isSelected
                          ? "#eef0fe"
                          : "#ffffff",
                    color:
                      isMatched && !suppressAnswerFeedback && pairCorrect
                        ? (color ?? "#6c6fef")
                        : "#1e293b",
                  }}
                >
                  {rightItem.text}
                </button>
              );
            })}
          </div>
        </div>

        {boardSize.width > 0 && boardSize.height > 0 && (
          <svg
            className="mp-player-lines"
            viewBox={`0 0 ${boardSize.width} ${boardSize.height}`}
            preserveAspectRatio="none"
          >
            {lines.map((line) => (
              <g key={`${line.leftId}-${line.rightId}`}>
                <line
                  x1={line.x1}
                  y1={line.y1}
                  x2={line.x2}
                  y2={line.y2}
                  stroke={line.color}
                  strokeWidth="3"
                  strokeLinecap="round"
                />
                <circle cx={line.x1} cy={line.y1} r="4" fill={line.color} />
                <circle cx={line.x2} cy={line.y2} r="4" fill={line.color} />
              </g>
            ))}
          </svg>
        )}
      </div>
    </div>
  );
}