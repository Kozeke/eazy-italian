/**
 * TypeWordInGapBlock.tsx
 *
 * Student-facing render block for "type word in gap" exercises.
 *
 * Real-time sync
 * ──────────────
 * Each gap is individually synced via `useLiveSyncField` in bidirectional mode.
 *
 * Bidirectional means:
 *   Student side  → typing into a gap broadcasts the value via the live WS.
 *   Teacher side  → receives student patches and mirrors student input in real time.
 *   Teacher side  → typing into a gap also broadcasts (guided-fill / guided-answer mode).
 *   Student side  → receives teacher patches and mirrors teacher input in real time.
 *
 * Echo prevention is handled inside useLiveSyncField — a remote-triggered
 * state update is never re-broadcast back to the sender.
 *
 * Teacher sees an editable input styled with a purple tint so they know they are
 * in guided-fill mode (their typing is pushed live to the student's screen).
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
import { Keyboard } from "lucide-react";
import type { ExerciseBlockProps } from "./exerciseBlock.types";
import type {
  TypeWordInGapData,
  TextSeg,
  GapSeg,
} from "./TypeWordInGapEditorPage";
import { useLiveSyncField } from "../../../../hooks/useLiveSession";
import { LiveSessionContext } from "../../live/LiveSessionProvider";
import { showTeacherExerciseHints } from "./showTeacherExerciseHints";
import "./DragToGap.css";

// ── Types ─────────────────────────────────────────────────────────────────────

interface TypeWordInGapItemData {
  type: "type_word_in_gap";
  id: string;
  label?: string;
  data: TypeWordInGapData;
  status: string;
}

function normaliseAnswer(value: string): string {
  return value.trim().toLocaleLowerCase();
}

// ── SyncedGapInput ────────────────────────────────────────────────────────────
//
// One component per gap → one stable `useLiveSyncField` call per gap.
// This is the pattern described in the useLiveSession.ts doc comment.

interface SyncedGapInputProps {
  gapId: string;
  itemId: string;
  value: string;
  expected: string;
  showCorrect: boolean;
  showWrong: boolean;
  gapIndex: number;
  /** True when the live classroom teacher is broadcasting keystrokes to students */
  isGuidedLiveTeacher: boolean;
  /** True when any teacher view should see the canonical answer (tooltip + styling cues) */
  showAnswerHints: boolean;
  onChange: (gapId: string, value: string) => void;
  onBlur: (gapId: string) => void;
}

const SyncedGapInput = memo(function SyncedGapInput({
  gapId,
  itemId,
  value,
  expected,
  showCorrect,
  showWrong,
  gapIndex,
  isGuidedLiveTeacher,
  showAnswerHints,
  onChange,
  onBlur,
}: SyncedGapInputProps) {
  // ── Bidirectional live sync: both roles broadcast & subscribe ──────────────
  useLiveSyncField(
    `ex/${itemId}/${gapId}`,
    value,
    (v) => onChange(gapId, v as string),
    { bidirectional: true },
  );

  // Both teacher and student get an editable input.
  // Teacher inputs are styled with a purple tint so they know their typing
  // is broadcast live to the student screen (guided-fill mode).
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(gapId, e.target.value)}
      onBlur={() => onBlur(gapId)}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      className={[
        "twg-gap-input",
        isGuidedLiveTeacher ? "twg-gap-input--teacher" : "",
        showCorrect ? "twg-gap-input--correct" : "",
        showWrong ? "twg-gap-input--wrong" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        width: Math.max(
          72,
          Math.max(value.length, expected.length, 3) * 10 + 24,
        ),
      }}
      placeholder="___"
      aria-label={
        isGuidedLiveTeacher
          ? `Gap ${gapIndex + 1} – guide student (your typing is broadcast)`
          : `Gap ${gapIndex + 1}`
      }
      title={showAnswerHints ? `Correct answer: ${expected}` : undefined}
      autoComplete="off"
      autoCapitalize="off"
      autoCorrect="off"
      spellCheck={false}
    />
  );
});

// ── TypeWordInGapBlock ────────────────────────────────────────────────────────

export default function TypeWordInGapBlock({
  item,
  mode,
  onComplete,
  suppressAnswerFeedback = false,
}: ExerciseBlockProps) {
  const typedItem = item as unknown as TypeWordInGapItemData;
  const exerciseData: TypeWordInGapData = typedItem.data ?? {
    title: "",
    segments: [],
    gaps: {},
  };

  const { title, segments = [], gaps = {} } = exerciseData;

  // Detect teacher role for monitoring view
  const liveCtx = useContext(LiveSessionContext);
  const isLiveTeacher = liveCtx?.role === "teacher";
  const showAnswerHints = showTeacherExerciseHints(mode, liveCtx?.role);

  const gapIds: string[] = useMemo(
    () =>
      segments.filter((s): s is GapSeg => s.type === "gap").map((s) => s.id),
    [segments],
  );

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // Fires onComplete once when homework student has filled every gap (any text)
  const completedRef = useRef(false);

  useEffect(() => {
    completedRef.current = false;
  }, [typedItem.id]);

  const isGapCorrect = useCallback(
    (gapId: string) =>
      normaliseAnswer(answers[gapId] ?? "") ===
      normaliseAnswer(gaps[gapId] ?? ""),
    [answers, gaps],
  );

  const allCorrect =
    gapIds.length > 0 && gapIds.every((gapId) => isGapCorrect(gapId));

  const allGapsFilled =
    gapIds.length > 0 &&
    gapIds.every((gapId) => (answers[gapId] ?? "").trim() !== "");

  useEffect(() => {
    if (isLiveTeacher) return;
    if (suppressAnswerFeedback) {
      if (allGapsFilled && !completedRef.current) {
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
    allGapsFilled,
    isLiveTeacher,
    onComplete,
    suppressAnswerFeedback,
  ]);

  const handleChange = useCallback((gapId: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [gapId]: value }));
  }, []);

  const markTouched = useCallback((gapId: string) => {
    setTouched((prev) => ({ ...prev, [gapId]: true }));
  }, []);

  return (
    <div className="dtg-block twg-block">
      {/* ── Exercise header: title + instruction ─────────────────────────── */}
      <div className="dtg-exercise-header">
        {title && (
          <div className="dtg-exercise-title">{title}</div>
        )}
        <div className="dtg-exercise-instruction">
          <Keyboard size={13} />
          Type the correct word in each gap
        </div>
      </div>

      <div
        className="dtg-text twg-text"
        aria-label="Exercise text with typing gaps"
      >
        {segments.map((segment, index) => {
          if (segment.type === "text") {
            return <span key={`t-${index}`}>{(segment as TextSeg).value}</span>;
          }

          const gapId = (segment as GapSeg).id;
          const value = answers[gapId] ?? "";
          const expected = gaps[gapId] ?? "";
          const showCorrect =
            !suppressAnswerFeedback &&
            value.trim() !== "" &&
            isGapCorrect(gapId);
          const showWrong =
            !suppressAnswerFeedback &&
            touched[gapId] &&
            value.trim() !== "" &&
            !isGapCorrect(gapId);

          return (
            // Column-flex wrapper mirrors the SelectWordFormBlock pattern:
            // the SyncedGapInput sits in the text flow and the teacher-only
            // answer hint appears directly below it.
            <span
              key={gapId}
              style={{
                display: "inline-flex",
                flexDirection: "column",
                alignItems: "center",
                verticalAlign: "middle",
              }}
            >
              <SyncedGapInput
                gapId={gapId}
                itemId={typedItem.id}
                value={value}
                expected={expected}
                showCorrect={showCorrect}
                showWrong={showWrong}
                gapIndex={gapIds.indexOf(gapId)}
                isGuidedLiveTeacher={!!isLiveTeacher}
                showAnswerHints={showAnswerHints}
                onChange={handleChange}
                onBlur={markTouched}
              />
              {/* Teacher-only correct-answer badge — students never see this
                  because showAnswerHints is false for any student role. */}
              {showAnswerHints && expected && (
                <span className="twg-teacher-answer-hint">✓ {expected}</span>
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}