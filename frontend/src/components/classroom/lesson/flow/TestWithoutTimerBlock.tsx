/**
 * TestWithoutTimerBlock.tsx
 *
 * Multi-question test player; answers and current question index sync bidirectionally
 * over the classroom live WebSocket (same pattern as TypeWordInGap).
 */

import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ExerciseBlockProps } from "./exerciseBlock.types";
import QuestionRenderer, {
  type RuntimeQuestion,
  type StudentAnswer,
} from "../exercise/QuestionRenderer";
import { useLiveSyncField } from "../../../../hooks/useLiveSession";
import { LiveSessionContext } from "../../live/LiveSessionProvider";
import type {
  QuestionDraft,
  GapDraft,
  MatchItemDraft,
  TokenDraft,
} from "../editors/QuestionEditorRenderer";
import { showTeacherExerciseHints } from "./showTeacherExerciseHints";
import "./DragToGap.css";

interface TestWithoutTimerData {
  title?: string;
  questions?: QuestionDraft[];
  payloads?: Record<string, unknown>[];
}

interface TestWithoutTimerItemData {
  type: "test_without_timer";
  id: string;
  label?: string;
  data: TestWithoutTimerData;
  status: string;
}

function splitAnswers(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function mapGap(gap: GapDraft) {
  return {
    id: gap.id,
    answers: splitAnswers(gap.answers),
    case_sensitive: gap.case_sensitive,
    score: gap.score,
  };
}

function toRuntimeQuestion(
  draft: QuestionDraft,
  index: number,
): RuntimeQuestion {
  const base: RuntimeQuestion = {
    id: index + 1,
    type: draft.type,
    prompt: draft.prompt,
    question_text: draft.prompt,
  };

  switch (draft.type) {
    case "multiple_choice":
      return {
        ...base,
        options: draft.options.map((option) => ({
          id: option.id,
          text: option.text,
        })),
        question_metadata: {
          correct_option_ids: draft.correct_option_ids,
        },
      };
    case "true_false":
      return {
        ...base,
        question_metadata: {
          correct_option_id: draft.correct_option_id,
        },
      };
    case "open_answer":
      return {
        ...base,
        question_metadata: {
          teacher_open_answer: {
            expected_mode: draft.expected_mode,
            keywords: draft.keywords,
            pattern: draft.pattern,
            case_insensitive: draft.case_insensitive,
          },
        },
      };
    case "cloze_input":
      return {
        ...base,
        gaps_config: draft.gaps.map(mapGap),
      };
    case "cloze_drag":
      return {
        ...base,
        gaps_config: draft.gaps.map(mapGap),
        question_metadata: {
          word_bank: splitAnswers(draft.word_bank),
          shuffle_word_bank: draft.shuffle_word_bank,
        },
      };
    case "matching_pairs":
      return {
        ...base,
        question_metadata: {
          left_items: draft.left_items as MatchItemDraft[],
          right_items: draft.right_items as MatchItemDraft[],
          shuffle_right: draft.shuffle_right,
          pairs: draft.pairs,
        },
      };
    case "ordering_words":
      return {
        ...base,
        question_metadata: {
          tokens: draft.tokens as TokenDraft[],
          correct_order:
            draft.correct_order.length > 0
              ? draft.correct_order
              : draft.tokens.map((token) => token.id),
        },
      };
    case "ordering_sentences":
      return {
        ...base,
        question_metadata: {
          items: draft.items as TokenDraft[],
          correct_order:
            draft.correct_order.length > 0
              ? draft.correct_order
              : draft.items.map((token) => token.id),
        },
      };
    default:
      return base;
  }
}

function hasAnswer(answer: StudentAnswer | undefined): boolean {
  if (answer == null) return false;
  if (typeof answer === "string") return answer.trim().length > 0;
  if (Array.isArray(answer)) return answer.length > 0;
  return Object.values(answer).some((value) => String(value).trim().length > 0);
}

export default function TestWithoutTimerBlock({
  item,
  mode,
  onComplete,
}: ExerciseBlockProps) {
  const typedItem = item as unknown as TestWithoutTimerItemData;
  const liveCtx = useContext(LiveSessionContext);
  const teacherAnswerHints = showTeacherExerciseHints(mode, liveCtx?.role);
  const exerciseData: TestWithoutTimerData = typedItem.data ?? {};
  const questions = useMemo(
    () => (exerciseData.questions ?? []).map(toRuntimeQuestion),
    [exerciseData.questions],
  );

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, StudentAnswer>>({});
  const [submitted, setSubmitted] = useState(false);

  const currentQuestion = questions[currentIndex] ?? null;
  const isLast = currentIndex === questions.length - 1;
  const answeredCount = Object.values(answers).filter(hasAnswer).length;
  const allAnswered =
    questions.length > 0 &&
    questions.every((question) => hasAnswer(answers[String(question.id)]));

  useEffect(() => {
    setCurrentIndex(0);
    setAnswers({});
    setSubmitted(false);
  }, [typedItem.id]);

  useLiveSyncField(
    `ex/${typedItem.id}/test_answers`,
    answers,
    (remote) => {
      if (remote && typeof remote === "object" && !Array.isArray(remote)) {
        setAnswers(remote as Record<string, StudentAnswer>);
      }
    },
    { bidirectional: true },
  );

  useLiveSyncField(
    `ex/${typedItem.id}/test_idx`,
    currentIndex,
    (remote) => {
      if (typeof remote !== "number" || Number.isNaN(remote)) return;
      const max = Math.max(questions.length - 1, 0);
      setCurrentIndex(Math.min(Math.max(0, Math.round(remote)), max));
    },
    { bidirectional: true },
  );

  const handleAnswer = useCallback(
    (answer: StudentAnswer) => {
      if (!currentQuestion) return;
      setAnswers((prev) => ({ ...prev, [String(currentQuestion.id)]: answer }));
    },
    [currentQuestion],
  );

  const handleSubmit = useCallback(() => {
    if (!allAnswered) return;
    setSubmitted(true);
    onComplete();
  }, [allAnswered, onComplete]);

  if (questions.length === 0) {
    return (
      <div className="dtg-block">
        <div className="dtg-block-title">
          {exerciseData.title || typedItem.label || "Test"}
        </div>
        <div className="twg-helper-bar">No questions added yet.</div>
      </div>
    );
  }

  return (
    <div className="dtg-block">
      {(exerciseData.title || typedItem.label) && (
        <div className="dtg-block-title">
          {exerciseData.title || typedItem.label}
        </div>
      )}

      {/* <div className="twg-helper-bar" aria-hidden="true"> */}
      {/* Answer each question and submit when finished. */}
      {/* </div> */}

      {currentQuestion && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <QuestionRenderer
            question={currentQuestion}
            answer={answers[String(currentQuestion.id)] ?? null}
            onAnswer={handleAnswer}
            disabled={submitted}
            questionKey={`${typedItem.id}-${currentIndex}`}
            teacherAnswerHints={teacherAnswerHints}
          />

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              paddingTop: 6,
            }}
          >
            <span style={{ fontSize: 12, color: "#64748b" }}>
              {answeredCount} / {questions.length} answered
            </span>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                className="dtg-btn-cancel"
                onClick={() => setCurrentIndex((prev) => Math.max(prev - 1, 0))}
                disabled={currentIndex === 0 || submitted}
              >
                Назад
              </button>

              {isLast ? (
                <button
                  type="button"
                  className={[
                    "dtg-btn-save",
                    !allAnswered || submitted ? "dtg-btn-save--disabled" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={handleSubmit}
                  disabled={!allAnswered || submitted}
                >
                  {submitted ? "Завершено" : "Отправить"}
                </button>
              ) : (
                <button
                  type="button"
                  className="dtg-btn-save"
                  onClick={() =>
                    setCurrentIndex((prev) =>
                      Math.min(prev + 1, questions.length - 1),
                    )
                  }
                  disabled={submitted}
                >
                  Дальше
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
