/**
 * SelectWordFormBlock.tsx
 *
 * Inline dropdown gaps in text; each gap syncs bidirectionally in live mode.
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
  SelectWordFormData,
  SelectWordFormGapConfig,
  TextSeg,
  GapSeg,
} from "./SelectWordFormEditorPage";
import { useLiveSyncField } from "../../../../hooks/useLiveSession";
import { LiveSessionContext } from "../../live/LiveSessionProvider";
import { showTeacherExerciseHints } from "./showTeacherExerciseHints";
import "./DragToGap.css";

interface SelectWordFormItemData {
  type: "select_word_form";
  id: string;
  label?: string;
  data: SelectWordFormData;
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

function normaliseGapConfig(
  gapConfig?: SelectWordFormGapConfig | string[],
): SelectWordFormGapConfig {
  if (Array.isArray(gapConfig)) {
    const values = gapConfig
      .map((value) => value.trim())
      .filter(
        (value, index, all) =>
          value !== "" &&
          all.findIndex(
            (entry) => normaliseAnswer(entry) === normaliseAnswer(value),
          ) === index,
      );

    return {
      options: values,
      correctAnswers: values,
    };
  }

  const correctAnswers = (gapConfig?.correctAnswers ?? [])
    .map((value) => value.trim())
    .filter(
      (value, index, all) =>
        value !== "" &&
        all.findIndex(
          (entry) => normaliseAnswer(entry) === normaliseAnswer(value),
        ) === index,
    );
  const options = [...(gapConfig?.options ?? []), ...correctAnswers]
    .map((value) => value.trim())
    .filter(
      (value, index, all) =>
        value !== "" &&
        all.findIndex(
          (entry) => normaliseAnswer(entry) === normaliseAnswer(value),
        ) === index,
    );
  const correctSet = new Set(correctAnswers.map(normaliseAnswer));

  return {
    options,
    correctAnswers: options.filter((option) =>
      correctSet.has(normaliseAnswer(option)),
    ),
  };
}

interface SyncedSwfSelectProps {
  gapId: string;
  itemId: string;
  value: string;
  showCorrect: boolean;
  showWrong: boolean;
  gapIndex: number;
  gapOptions: string[];
  selectWidth: number;
  onChange: (gapId: string, value: string) => void;
  onBlur: (gapId: string) => void;
}

/** One hook per gap for stable live WebSocket subscriptions */
const SyncedSwfSelect = memo(function SyncedSwfSelect({
  gapId,
  itemId,
  value,
  showCorrect,
  showWrong,
  gapIndex,
  gapOptions,
  selectWidth,
  onChange,
  onBlur,
}: SyncedSwfSelectProps) {
  useLiveSyncField(
    `ex/${itemId}/swf_${gapId}`,
    value,
    (v) => onChange(gapId, v as string),
    { bidirectional: true },
  );

  return (
    <select
      value={value}
      onChange={(e) => onChange(gapId, e.target.value)}
      onBlur={() => onBlur(gapId)}
      className={[
        "swf-gap-select",
        showCorrect ? "swf-gap-select--correct" : "",
        showWrong ? "swf-gap-select--wrong" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        width: Math.max(96, selectWidth),
      }}
      aria-label={`Gap ${gapIndex + 1}`}
    >
      <option value="">Select...</option>
      {gapOptions.map((option) => (
        <option key={`${gapId}-${option}`} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
});

export default function SelectWordFormBlock({
  item,
  mode,
  onComplete,
  suppressAnswerFeedback = false,
}: ExerciseBlockProps) {
  const typedItem = item as unknown as SelectWordFormItemData;
  const exerciseData: SelectWordFormData = typedItem.data ?? {
    title: "",
    segments: [],
    gaps: {},
  };

  const { title, segments = [], gaps = {} } = exerciseData;

  const liveCtx = useContext(LiveSessionContext);
  const isTeacher = liveCtx?.role === "teacher";
  const teacherAnswerHints = showTeacherExerciseHints(mode, liveCtx?.role);

  const normalisedGaps = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(gaps).map(([gapId, gapConfig]) => [
          gapId,
          normaliseGapConfig(gapConfig),
        ]),
      ),
    [gaps],
  );

  const gapIds = useMemo(
    () =>
      segments
        .filter((segment): segment is GapSeg => segment.type === "gap")
        .map((segment) => segment.id),
    [segments],
  );

  const optionPoolByGapId = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(normalisedGaps).map(([gapId, gapConfig]) => [
          gapId,
          shuffle(gapConfig.options),
        ]),
      ),
    [normalisedGaps],
  );

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const completedRef = useRef(false);

  useEffect(() => {
    completedRef.current = false;
  }, [typedItem.id]);

  const isGapCorrect = useCallback(
    (gapId: string) => {
      const selected = normaliseAnswer(answers[gapId] ?? "");
      const accepted = (normalisedGaps[gapId]?.correctAnswers ?? []).map(
        normaliseAnswer,
      );
      return Boolean(selected) && accepted.includes(selected);
    },
    [answers, normalisedGaps],
  );

  const allCorrect =
    gapIds.length > 0 && gapIds.every((gapId) => isGapCorrect(gapId));

  const allGapsChosen =
    gapIds.length > 0 &&
    gapIds.every((gapId) => (answers[gapId] ?? "").trim() !== "");

  useEffect(() => {
    if (isTeacher) return;
    if (suppressAnswerFeedback) {
      if (allGapsChosen && !completedRef.current) {
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
    allGapsChosen,
    isTeacher,
    onComplete,
    suppressAnswerFeedback,
  ]);

  const handleChange = useCallback((gapId: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [gapId]: value }));
    setTouched((prev) => ({ ...prev, [gapId]: true }));
  }, []);

  const markTouched = useCallback((gapId: string) => {
    setTouched((prev) => ({ ...prev, [gapId]: true }));
  }, []);

  return (
    <div className="dtg-block swf-block">
      {/* ── Exercise header: title + instruction ─────────────────────────── */}
      <div className="dtg-exercise-header">
        {title && (
          <div className="dtg-exercise-title">{title}</div>
        )}
        
          <div className="dtg-exercise-instruction">
            Select the correct word form in each gap
          </div>
        
      </div>

      <div
        className="dtg-text swf-text"
        aria-label="Exercise text with dropdown gaps"
      >
        {segments.map((segment, index) => {
          if (segment.type === "text") {
            return <span key={`t-${index}`}>{(segment as TextSeg).value}</span>;
          }

          const gapId = (segment as GapSeg).id;
          const value = answers[gapId] ?? "";
          const gapConfig = normalisedGaps[gapId] ?? {
            options: [],
            correctAnswers: [],
          };
          const gapOptions = optionPoolByGapId[gapId] ?? gapConfig.options;
          const longestAccepted = Math.max(
            ...gapOptions.map((option) => option.length),
            4,
          );
          const showCorrect =
            !suppressAnswerFeedback &&
            value.trim() !== "" &&
            isGapCorrect(gapId);
          const showWrong =
            !suppressAnswerFeedback &&
            touched[gapId] &&
            value.trim() !== "" &&
            !isGapCorrect(gapId);

          const acceptedPreview = (gapConfig.correctAnswers ?? []).join(" · ");

          return (
            <span
              key={gapId}
              style={{
                display: "inline-flex",
                flexDirection: "column",
                alignItems: "flex-start",
                verticalAlign: "middle",
              }}
            >
              <SyncedSwfSelect
                gapId={gapId}
                itemId={typedItem.id}
                value={value}
                showCorrect={showCorrect}
                showWrong={showWrong}
                gapIndex={gapIds.indexOf(gapId)}
                gapOptions={gapOptions}
                selectWidth={longestAccepted * 10 + 54}
                onChange={handleChange}
                onBlur={markTouched}
              />
              {teacherAnswerHints && acceptedPreview && (
                <span className="swf-teacher-answer-hint">
                  Accepts: {acceptedPreview}
                </span>
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}