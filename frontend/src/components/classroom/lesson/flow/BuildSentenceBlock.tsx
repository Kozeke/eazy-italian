/**
 * BuildSentenceBlock.tsx
 *
 * Drag tokens into sentence slots; each sentence row has its own word bank (tokens from
 * `metadata.sentence_groups`). Placements sync bidirectionally over the live channel.
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

/** Stable hash for deterministic per-block shuffles (matches MatchPairsBlock). */
function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

/** Returns a copy of items sorted by seeded pseudo-random scores so pool order is scrambled but stable per seed. */
function deterministicShuffleById<T extends { id: string }>(
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

/**
 * Builds draggable bank order for one sentence: if the author's token list order for that
 * row matches reading order, shuffle within the row so the bank is not trivially sorted.
 */
function wordPoolForSentenceGroup(
  question: OrderingWordsDraft,
  groupSlots: SlotInfo[],
  blockItemId: string,
  sentenceIndex: number,
): SlotInfo[] {
  // Fast lookup from token id to full token draft while building this row's bank
  const tokenById = new Map(question.tokens.map((token) => [token.id, token]));
  // Slot ids for this sentence in correct reading order (same ids as draggable chips)
  const groupReadingIds = groupSlots.map((slot) => slot.id);
  // Which token ids belong to this sentence row
  const groupIdSet = new Set(groupReadingIds);
  // Order those ids appear in the global `tokens` array (author / AI bank order)
  const bankOrderIds = question.tokens
    .map((token) => token.id)
    .filter((id) => groupIdSet.has(id));
  // True when the saved bank order already matches reading order for this row only
  const isBankIdenticalToReadingOrder =
    bankOrderIds.length === groupReadingIds.length &&
    bankOrderIds.every((id, index) => id === groupReadingIds[index]);

  if (isBankIdenticalToReadingOrder) {
    const rowTokens: SlotInfo[] = groupReadingIds
      .map((id) => tokenById.get(id))
      .filter((t): t is TokenDraft => t != null)
      .map((t) => ({ id: t.id, text: t.text }));
    const groupSeed = `${blockItemId}:bs-pool:${sentenceIndex}`;
    return deterministicShuffleById(rowTokens, groupSeed);
  }

  return bankOrderIds
    .map((id) => tokenById.get(id))
    .filter((t): t is TokenDraft => t != null)
    .map((t) => ({ id: t.id, text: t.text }));
}

interface BuildSentenceData {
  title?: string;
  question?: OrderingWordsDraft;
  payload?: Record<string, unknown>;
  /** Legacy AI shape before backend emitted `question` — words per line in order */
  sentences?: Array<{
    id?: string;
    words: string[];
    shuffled?: string[];
    sentence?: string;
  }>;
}

/**
 * Rebuilds an ordering_words draft from raw `sentences[]` rows (generated exercises
 * that were saved without `question`).
 */
function orderingWordsFromRawSentences(
  title: string | undefined,
  sentences: NonNullable<BuildSentenceData["sentences"]>,
): OrderingWordsDraft {
  // Token list and slot groups — mirrors BuildSentenceEditorPage.applyGeneratedBlock
  const tokens: TokenDraft[] = [];
  // Each inner array is token ids for one sentence row
  const sentenceGroups: string[][] = [];

  sentences.forEach((sent, sIdx) => {
    // Ids for slots in this sentence line
    const groupIds: string[] = [];
    (sent.words ?? []).forEach((word, wIdx) => {
      const id = `tok_${sIdx}_${wIdx}`;
      tokens.push({ id, text: word });
      groupIds.push(id);
    });
    sentenceGroups.push(groupIds);
  });

  const correct_order = tokens.map((t) => t.id);

  return {
    type: "ordering_words",
    prompt: title?.trim() ?? "",
    tokens,
    correct_order,
    score: 1,
    metadata: { sentence_groups: sentenceGroups },
  };
}

interface BuildSentenceItemData {
  type: "build_sentence";
  id: string;
  label?: string;
  data: BuildSentenceData;
  status: string;
}

interface SlotInfo {
  id: string;
  text: string;
}

/** Relayed drag state for build-sentence exercises */
interface BuildSentenceLiveBlob {
  placements: Record<string, string>;
  feedbackBySlot: Record<string, "correct" | "wrong">;
}

function buildSentenceGroups(question: OrderingWordsDraft): SlotInfo[][] {
  const tokenById = new Map(question.tokens.map((token) => [token.id, token]));
  const orderedTokens = question.correct_order
    .map((tokenId) => tokenById.get(tokenId))
    .filter(Boolean) as TokenDraft[];

  const rawGroups = Array.isArray(question.metadata?.sentence_groups)
    ? question.metadata?.sentence_groups
    : [];

  const groups = rawGroups
    .map((group) =>
      group
        .map((tokenId) => tokenById.get(tokenId))
        .filter((t): t is TokenDraft => t != null)
        .map((token) => ({
          id: token.id,
          text: token.text,
        })),
    )
    .filter((group) => group.length > 0);

  if (groups.length > 0) return groups;

  return [
    orderedTokens.map((token) => ({
      id: token.id,
      text: token.text,
    })),
  ];
}

export default function BuildSentenceBlock({
  item,
  mode,
  onComplete,
  suppressAnswerFeedback = false,
}: ExerciseBlockProps) {
  const typedItem = item as unknown as BuildSentenceItemData;
  // Resolved ordering_words draft: prefer saved `question`, else legacy `sentences` rows
  const question = useMemo(() => {
    const data = typedItem.data;
    const direct = data?.question;
    if (
      direct &&
      direct.type === "ordering_words" &&
      Array.isArray(direct.tokens) &&
      direct.tokens.length > 0
    ) {
      return direct;
    }
    const legacy = data?.sentences;
    if (legacy && legacy.length > 0) {
      return orderingWordsFromRawSentences(data?.title, legacy);
    }
    return undefined;
  }, [typedItem.data]);

  const liveCtx = useContext(LiveSessionContext);
  const isTeacher = liveCtx?.role === "teacher";
  // Enables drop-slot highlights when a teacher previews the exercise in teacher mode or live teacher role
  const teacherSlotHints = showTeacherExerciseHints(mode, liveCtx?.role);

  const sentenceGroups = useMemo(
    () => (question ? buildSentenceGroups(question) : []),
    [question],
  );
  // One shuffled / author-ordered chip list per sentence row (never merges all sentences into one bank)
  const wordPoolsBySentence = useMemo(() => {
    if (!question) return [];
    return sentenceGroups.map((groupSlots, sentenceIndex) =>
      wordPoolForSentenceGroup(
        question,
        groupSlots,
        typedItem.id,
        sentenceIndex,
      ),
    );
  }, [question, typedItem.id, sentenceGroups]);
  // Maps token id → label for chips already placed in slots (pools are per-row; lookup stays global)
  const tokenTextById = useMemo(() => {
    if (!question) return new Map<string, string>();
    return new Map(question.tokens.map((token) => [token.id, token.text]));
  }, [question]);
  // Resolves which sentence index owns a slot or token id (for cross-row drop rejection)
  const slotSentenceIndex = useMemo(() => {
    const mapOut = new Map<string, number>();
    sentenceGroups.forEach((group, sentenceIndex) => {
      group.forEach((slot) => {
        mapOut.set(slot.id, sentenceIndex);
      });
    });
    return mapOut;
  }, [sentenceGroups]);
  const [placements, setPlacements] = useState<Record<string, string>>({});
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overSlotId, setOverSlotId] = useState<string | null>(null);
  const [feedbackBySlot, setFeedbackBySlot] = useState<
    Record<string, "correct" | "wrong">
  >({});
  const completedRef = useRef(false);

  const buildSentenceLiveBlob = useMemo<BuildSentenceLiveBlob>(
    () => ({ placements, feedbackBySlot }),
    [placements, feedbackBySlot],
  );

  useLiveSyncField(
    `ex/${typedItem.id}/bs`,
    buildSentenceLiveBlob,
    (remote) => {
      const payload = remote as Partial<BuildSentenceLiveBlob> | null;
      if (!payload || typeof payload !== "object") return;
      if (payload.placements && typeof payload.placements === "object") {
        setPlacements(payload.placements as Record<string, string>);
      }
      if (
        payload.feedbackBySlot &&
        typeof payload.feedbackBySlot === "object"
      ) {
        setFeedbackBySlot(
          payload.feedbackBySlot as Record<string, "correct" | "wrong">,
        );
      }
    },
    { bidirectional: true },
  );

  useEffect(() => {
    setPlacements({});
    setDraggingId(null);
    setOverSlotId(null);
    setFeedbackBySlot({});
    completedRef.current = false;
  }, [typedItem.id]);

  const usedWordIds = new Set(Object.values(placements));
  const slotIds = sentenceGroups.flatMap((group) =>
    group.map((slot) => slot.id),
  );

  const visualFeedbackBySlot = useMemo(() => {
    if (suppressAnswerFeedback)
      return {} as Record<string, "correct" | "wrong">;
    const out: Record<string, "correct" | "wrong"> = { ...feedbackBySlot };
    for (const slotId of slotIds) {
      if (out[slotId]) continue;
      const wid = placements[slotId];
      if (!wid) continue;
      out[slotId] = wid === slotId ? "correct" : "wrong";
    }
    return out;
  }, [suppressAnswerFeedback, feedbackBySlot, slotIds, placements]);

  useEffect(() => {
    if (slotIds.length === 0 || isTeacher) return;
    if (suppressAnswerFeedback) {
      const allFilled = slotIds.every((slotId) => Boolean(placements[slotId]));
      if (allFilled && !completedRef.current) {
        completedRef.current = true;
        onComplete();
      }
      return;
    }
    const allCorrect = slotIds.every((slotId) => placements[slotId] === slotId);
    if (allCorrect && !completedRef.current) {
      completedRef.current = true;
      onComplete();
    }
  }, [isTeacher, onComplete, placements, slotIds, suppressAnswerFeedback]);

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
    setOverSlotId(null);
  }, []);

  const handleDropOnSlot = useCallback(
    (slotId: string, e: React.DragEvent) => {
      const droppedWordId = draggingId ?? e.dataTransfer.getData("text/plain");
      if (!droppedWordId) return;

      // Keep each sentence isolated: chips from sentence A cannot fill sentence B slots
      const slotRow = slotSentenceIndex.get(slotId);
      const wordRow = slotSentenceIndex.get(droppedWordId);
      if (
        slotRow === undefined ||
        wordRow === undefined ||
        slotRow !== wordRow
      ) {
        setDraggingId(null);
        setOverSlotId(null);
        return;
      }

      const isCorrect = droppedWordId === slotId;
      setPlacements((prev) => {
        const next = { ...prev };
        for (const [currentSlotId, currentWordId] of Object.entries(next)) {
          if (currentWordId === droppedWordId) delete next[currentSlotId];
        }
        if (suppressAnswerFeedback || isCorrect) {
          next[slotId] = droppedWordId;
        } else {
          delete next[slotId];
        }
        return next;
      });
      setFeedbackBySlot((prev) => {
        if (suppressAnswerFeedback) return {};
        return {
          ...prev,
          [slotId]: isCorrect ? "correct" : "wrong",
        };
      });
      setDraggingId(null);
      setOverSlotId(null);
    },
    [draggingId, slotSentenceIndex, suppressAnswerFeedback],
  );

  const handleDropOnPool = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const droppedWordId = draggingId ?? e.dataTransfer.getData("text/plain");
      if (!droppedWordId) return;
      setPlacements((prev) => {
        const next = { ...prev };
        for (const [slotId, wordId] of Object.entries(next)) {
          if (wordId === droppedWordId) delete next[slotId];
        }
        return next;
      });
      setDraggingId(null);
      setOverSlotId(null);
    },
    [draggingId],
  );

  const handleSlotClick = useCallback((slotId: string) => {
    setPlacements((prev) => {
      const next = { ...prev };
      delete next[slotId];
      return next;
    });
    setFeedbackBySlot((prev) => {
      const next = { ...prev };
      delete next[slotId];
      return next;
    });
  }, []);

  if (!question || sentenceGroups.length === 0) {
    return (
      <div className="dtg-block">
        <div className="dtg-block-title">
          {typedItem.data?.title || typedItem.label || "Build a sentence"}
        </div>
        <div className="twg-helper-bar">No sentence configured yet.</div>
      </div>
    );
  }

  // Visible exercise title line (segment block title or flow item label)
  const exerciseHeadingText = (
    typedItem.data?.title ||
    typedItem.label ||
    ""
  ).trim();
  // ordering_words.prompt is often copied from the same title by AI/backend (e.g. "Build the sentences"); avoid showing it twice under dtg-block-title
  const promptText = (question.prompt ?? "").trim();
  const showPromptSubline =
    promptText.length > 0 && promptText !== exerciseHeadingText;

  return (
    <div className="dtg-block bs-block">
      {(typedItem.data?.title || typedItem.label) && (
        <div className="dtg-block-title">
          {typedItem.data?.title || typedItem.label}
        </div>
      )}

      {showPromptSubline && <div className="bs-prompt">{question.prompt}</div>}

      <div className="bs-sentences" aria-label="Sentence builder">
        {sentenceGroups.map((group, sentenceIndex) => (
          <div key={`sentence-${sentenceIndex}`} className="bs-sentence-row">
            <div className="bs-sentence-label">
              Sentence {sentenceIndex + 1}
            </div>
            <div
              className="dtg-pool-bar bs-sentence-pool"
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDropOnPool}
              aria-label={`Word bank for sentence ${
                sentenceIndex + 1
              } — drag words into the slots below`}
            >
              {(wordPoolsBySentence[sentenceIndex] ?? []).map(
                ({ id, text }) => {
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
                      aria-label={`Word: ${text}${isUsed ? " (placed)" : ""}`}
                    >
                      <GripVertical size={11} />
                      {text}
                    </span>
                  );
                },
              )}
            </div>
            <div className="bs-slot-grid">
              {group.map((slot) => {
                const placedWordId = placements[slot.id];
                const placedWord = placedWordId
                  ? (tokenTextById.get(placedWordId) ?? "")
                  : "";
                const isFilled = placedWord !== "";
                const isOver = overSlotId === slot.id;
                const feedback = visualFeedbackBySlot[slot.id];
                const feedbackClass =
                  feedback === "correct"
                    ? "dtg-drop-zone--correct"
                    : feedback === "wrong"
                      ? "dtg-drop-zone--wrong"
                      : "";
                const teacherHintClass =
                  teacherSlotHints &&
                  draggingId &&
                  slot.id === draggingId &&
                  !feedbackClass
                    ? "dtg-drop-zone--teacher-hint"
                    : "";

                return (
                  <div
                    key={slot.id}
                    className={[
                      "dtg-drop-zone",
                      "bs-drop-zone",
                      isOver ? "dtg-drop-zone--over" : "",
                      isFilled ? "dtg-drop-zone--filled" : "",
                      feedbackClass,
                      teacherHintClass,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    style={{
                      minWidth: Math.max(92, slot.text.trim().length * 9 + 26),
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      setOverSlotId(slot.id);
                    }}
                    onDragLeave={() => setOverSlotId(null)}
                    onDrop={(e) => {
                      e.preventDefault();
                      handleDropOnSlot(slot.id, e);
                    }}
                    onClick={() => isFilled && handleSlotClick(slot.id)}
                    role="button"
                    tabIndex={0}
                    aria-label={
                      isFilled
                        ? `Slot filled with "${placedWord}" — click to remove`
                        : `Empty slot ${slot.text ? `for ${slot.text}` : ""}`
                    }
                    onKeyDown={(e) => {
                      if (
                        (e.key === "Delete" || e.key === "Backspace") &&
                        isFilled
                      ) {
                        handleSlotClick(slot.id);
                      }
                    }}
                  >
                    {isFilled ? (
                      placedWord
                    ) : (
                      <span
                        className="dtg-drop-placeholder"
                        aria-hidden="true"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
