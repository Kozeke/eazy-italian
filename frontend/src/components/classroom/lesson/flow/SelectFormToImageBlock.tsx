/**
 * SelectFormToImageBlock.tsx
 *
 * Dropdowns under images with per-card bidirectional live sync.
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
  SelectFormToImageCard,
  SelectFormToImageData,
} from "./SelectFormToImageEditorPage";
import { useLiveSyncField } from "../../../../hooks/useLiveSession";
import { LiveSessionContext } from "../../live/LiveSessionProvider";
import { showTeacherExerciseHints } from "./showTeacherExerciseHints";
import "./DragToGap.css";

interface SelectFormToImageItemData {
  type: "select_form_to_image";
  id: string;
  label?: string;
  data: SelectFormToImageData;
  status: string;
}

function normaliseAnswer(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function shuffle<T>(arr: T[]): T[] {
  const next = [...arr];
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function normaliseOptions(card: SelectFormToImageCard): string[] {
  const seen = new Set<string>();
  const options: string[] = [];

  for (const option of [...(card.options ?? []), ...(card.answers ?? [])]) {
    const trimmed = option.trim();
    const key = normaliseAnswer(trimmed);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    options.push(trimmed);
  }

  return options;
}

interface SyncedSfiSelectProps {
  cardId: string;
  itemId: string;
  value: string;
  showCorrect: boolean;
  showWrong: boolean;
  index: number;
  options: string[];
  onChange: (cardId: string, value: string) => void;
  onBlur: (cardId: string) => void;
}

/** Keeps one select's value on the shared live channel */
const SyncedSfiSelect = memo(function SyncedSfiSelect({
  cardId,
  itemId,
  value,
  showCorrect,
  showWrong,
  index,
  options,
  onChange,
  onBlur,
}: SyncedSfiSelectProps) {
  useLiveSyncField(
    `ex/${itemId}/sfi_${cardId}`,
    value,
    (v) => onChange(cardId, v as string),
    { bidirectional: true },
  );

  return (
    <select
      value={value}
      onChange={(e) => onChange(cardId, e.target.value)}
      onBlur={() => onBlur(cardId)}
      className={[
        "swf-gap-select",
        "sfi-player-select",
        showCorrect ? "swf-gap-select--correct" : "",
        showWrong ? "swf-gap-select--wrong" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={`Image answer ${index + 1}`}
    >
      <option value="">Select form...</option>
      {options.map((option) => (
        <option key={`${cardId}-${option}`} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
});

export default function SelectFormToImageBlock({
  item,
  mode,
  onComplete,
  suppressAnswerFeedback = false,
}: ExerciseBlockProps) {
  const typedItem = item as unknown as SelectFormToImageItemData;
  const exerciseData: SelectFormToImageData = typedItem.data ?? {
    title: "",
    cards: [],
  };

  const { title, cards = [] } = exerciseData;

  const liveCtx = useContext(LiveSessionContext);
  const isTeacher = liveCtx?.role === "teacher";
  const teacherAnswerHints = showTeacherExerciseHints(mode, liveCtx?.role);

  const visibleCards = useMemo(
    () =>
      cards.filter((card): card is SelectFormToImageCard => Boolean(card.id)),
    [cards],
  );

  const optionPoolByCardId = useMemo(
    () =>
      Object.fromEntries(
        visibleCards.map((card) => [card.id, shuffle(normaliseOptions(card))]),
      ),
    [visibleCards],
  );
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const completedRef = useRef(false);

  useEffect(() => {
    completedRef.current = false;
  }, [typedItem.id]);

  const isCardCorrect = useCallback(
    (cardId: string) => {
      const selected = normaliseAnswer(answers[cardId] ?? "");
      const card = visibleCards.find((entry) => entry.id === cardId);
      const accepted = (card?.answers ?? []).map(normaliseAnswer);
      return Boolean(selected) && accepted.includes(selected);
    },
    [answers, visibleCards],
  );

  const allCorrect =
    visibleCards.length > 0 &&
    visibleCards.every((card) => isCardCorrect(card.id));

  const allCardsChosen =
    visibleCards.length > 0 &&
    visibleCards.every((card) => (answers[card.id] ?? "").trim() !== "");

  useEffect(() => {
    if (isTeacher) return;
    if (suppressAnswerFeedback) {
      if (allCardsChosen && !completedRef.current) {
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
    allCardsChosen,
    isTeacher,
    onComplete,
    suppressAnswerFeedback,
  ]);

  const handleChange = useCallback((cardId: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [cardId]: value }));
    setTouched((prev) => ({ ...prev, [cardId]: true }));
  }, []);

  const markTouched = useCallback((cardId: string) => {
    setTouched((prev) => ({ ...prev, [cardId]: true }));
  }, []);

  return (
    <div className="dtg-block sfi-block">
      {title && <div className="dtg-block-title">{title}</div>}

      {!teacherAnswerHints && (
        <div className="swf-helper-bar" aria-hidden="true">
          Select the correct form under each image.
        </div>
      )}

      <div
        className="dti-player-grid twi-player-grid sfi-player-grid"
        aria-label="Image cards with selectable answers"
      >
        {visibleCards.map((card, index) => {
          const value = answers[card.id] ?? "";
          const showCorrect =
            !suppressAnswerFeedback &&
            value.trim() !== "" &&
            isCardCorrect(card.id);
          const showWrong =
            !suppressAnswerFeedback &&
            touched[card.id] &&
            value.trim() !== "" &&
            !isCardCorrect(card.id);

          const acceptedPreview = (card.answers ?? [])
            .filter((a) => a.trim())
            .join(" · ");

          return (
            <div
              key={card.id}
              className="dti-player-card twi-player-card sfi-player-card"
            >
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
                <SyncedSfiSelect
                  cardId={card.id}
                  itemId={typedItem.id}
                  value={value}
                  showCorrect={showCorrect}
                  showWrong={showWrong}
                  index={index}
                  options={
                    optionPoolByCardId[card.id] ?? normaliseOptions(card)
                  }
                  onChange={handleChange}
                  onBlur={markTouched}
                />
                {teacherAnswerHints && acceptedPreview && (
                  <span className="swf-teacher-answer-hint">
                    Accepts: {acceptedPreview}
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
