/**
 * TypeWordToImageBlock.tsx
 *
 * Typed answers under images; each field uses bidirectional live sync.
 */

import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  memo,
  useRef,
  useState,
} from "react";
import type { ExerciseBlockProps } from "./exerciseBlock.types";
import type {
  TypeWordToImageCard,
  TypeWordToImageData,
} from "./TypeWordToImageEditorPage";
import { useLiveSyncField } from "../../../../hooks/useLiveSession";
import { LiveSessionContext } from "../../live/LiveSessionProvider";
import { showTeacherExerciseHints } from "./showTeacherExerciseHints";
import "./DragToGap.css";

interface TypeWordToImageItemData {
  type: "type_word_to_image";
  id: string;
  label?: string;
  data: TypeWordToImageData;
  status: string;
}

function normaliseAnswer(value: string): string {
  return value.trim().toLocaleLowerCase();
}

interface SyncedTwimInputProps {
  cardId: string;
  itemId: string;
  value: string;
  expected: string;
  showCorrect: boolean;
  showWrong: boolean;
  index: number;
  onChange: (cardId: string, value: string) => void;
  onBlur: (cardId: string) => void;
}

/** One live-sync hook per image card (Rules of Hooks) */
const SyncedTwimInput = memo(function SyncedTwimInput({
  cardId,
  itemId,
  value,
  expected,
  showCorrect,
  showWrong,
  index,
  onChange,
  onBlur,
}: SyncedTwimInputProps) {
  useLiveSyncField(
    `ex/${itemId}/twi_${cardId}`,
    value,
    (v) => onChange(cardId, v as string),
    { bidirectional: true },
  );

  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(cardId, e.target.value)}
      onBlur={() => onBlur(cardId)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.currentTarget.blur();
        }
      }}
      className={[
        "twg-gap-input",
        "twi-player-input",
        showCorrect ? "twg-gap-input--correct" : "",
        showWrong ? "twg-gap-input--wrong" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        width: Math.max(
          120,
          Math.max(value.length, expected.length, 5) * 11 + 28,
        ),
      }}
      placeholder="Type word"
      aria-label={`Image answer ${index + 1}`}
      autoComplete="off"
      autoCapitalize="off"
      autoCorrect="off"
      spellCheck={false}
    />
  );
});

export default function TypeWordToImageBlock({
  item,
  mode,
  onComplete,
  suppressAnswerFeedback = false,
}: ExerciseBlockProps) {
  const typedItem = item as unknown as TypeWordToImageItemData;
  const exerciseData: TypeWordToImageData = typedItem.data ?? {
    title: "",
    cards: [],
  };

  const { title, cards = [] } = exerciseData;

  const liveCtx = useContext(LiveSessionContext);
  const isTeacher = liveCtx?.role === "teacher";
  const teacherAnswerHints = showTeacherExerciseHints(mode, liveCtx?.role);

  const visibleCards = useMemo(
    () => cards.filter((card): card is TypeWordToImageCard => Boolean(card.id)),
    [cards],
  );

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const completedRef = useRef(false);

  useEffect(() => {
    completedRef.current = false;
  }, [typedItem.id]);

  const isCardCorrect = useCallback(
    (cardId: string) => {
      const card = visibleCards.find((entry) => entry.id === cardId);
      return (
        normaliseAnswer(answers[cardId] ?? "") ===
        normaliseAnswer(card?.answer ?? "")
      );
    },
    [answers, visibleCards],
  );

  const allCorrect =
    visibleCards.length > 0 &&
    visibleCards.every((card) => isCardCorrect(card.id));

  const allFieldsFilled =
    visibleCards.length > 0 &&
    visibleCards.every((card) => (answers[card.id] ?? "").trim() !== "");

  useEffect(() => {
    if (isTeacher) return;
    if (suppressAnswerFeedback) {
      if (allFieldsFilled && !completedRef.current) {
        completedRef.current = true;
        onComplete();
      }
      return;
    }
    if (allCorrect && !completedRef.current) {
      completedRef.current = true;
      onComplete();
    }
  }, [
    allCorrect,
    allFieldsFilled,
    isTeacher,
    onComplete,
    suppressAnswerFeedback,
  ]);

  const handleChange = useCallback((cardId: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [cardId]: value }));
  }, []);

  const markTouched = useCallback((cardId: string) => {
    setTouched((prev) => ({ ...prev, [cardId]: true }));
  }, []);

  return (
    <div className="dtg-block twi-block">
      {title && <div className="dtg-block-title">{title}</div>}

      <div className="twi-helper-bar" aria-hidden="true">
        Type the correct word under each image.
      </div>

      <div
        className="dti-player-grid twi-player-grid"
        aria-label="Image cards with typed answers"
      >
        {visibleCards.map((card, index) => {
          const value = answers[card.id] ?? "";
          const expected = card.answer ?? "";
          const showCorrect =
            !suppressAnswerFeedback &&
            value.trim() !== "" &&
            isCardCorrect(card.id);
          const showWrong =
            !suppressAnswerFeedback &&
            touched[card.id] &&
            value.trim() !== "" &&
            !isCardCorrect(card.id);

          return (
            <div key={card.id} className="dti-player-card twi-player-card">
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

              <span
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "stretch",
                  width: "100%",
                }}
              >
                <SyncedTwimInput
                  cardId={card.id}
                  itemId={typedItem.id}
                  value={value}
                  expected={expected}
                  showCorrect={showCorrect}
                  showWrong={showWrong}
                  index={index}
                  onChange={handleChange}
                  onBlur={markTouched}
                />
                {teacherAnswerHints && expected.trim() && (
                  <span className="swf-teacher-answer-hint">
                    Answer: {expected}
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
