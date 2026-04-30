/**
 * TrueFalseBlock.tsx
 *
 * Renders AI-generated `true_false` exercise blocks.
 *
 * ── Data shape normalisation ────────────────────────────────────────────────
 * The AI generator produces questions in two possible shapes:
 *
 *   Shape A (AI-generated, unit generation):
 *     { prompt: string, correct_answer: boolean | "true" | "false" }
 *
 *   Shape B (editor-saved, TrueFalseEditorPage):
 *     { type: "true_false", prompt: string, correct_option_id: "true" | "false" }
 *
 * Both shapes are normalised inside `normaliseQuestions()` into a single
 * internal `TFQuestion` type before rendering.
 */

import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { CheckCircle2, XCircle, ChevronLeft, ChevronRight } from "lucide-react";
import type { ExerciseBlockProps } from "./exerciseBlock.types";
import { useLiveSyncField } from "../../../../hooks/useLiveSession";
import { LiveSessionContext } from "../../live/LiveSessionProvider";
import { showTeacherExerciseHints } from "./showTeacherExerciseHints";
import "./DragToGap.css";

// ── Internal types ─────────────────────────────────────────────────────────────

interface TFQuestion {
  /** 1-based display index, used as storage key */
  id: number;
  prompt: string;
  correctId: "true" | "false";
}

type TFAnswer = "true" | "false" | null;

// ── Normalisation ──────────────────────────────────────────────────────────────

function resolveCorrectId(raw: unknown): "true" | "false" {
  if (typeof raw === "boolean") return raw ? "true" : "false";
  const s = String(raw ?? "").toLowerCase().trim();
  return s === "true" ? "true" : "false";
}

function normaliseQuestions(rawList: unknown[]): TFQuestion[] {
  return rawList
    .filter((q): q is Record<string, unknown> => typeof q === "object" && q !== null)
    .map((q, i) => ({
      id: i + 1,
      prompt: String(q.prompt ?? q.statement ?? q.question ?? ""),
      // Shape A: correct_answer | Shape B: correct_option_id
      correctId: resolveCorrectId(q.correct_answer ?? q.correct_option_id ?? q.answer),
    }))
    .filter((q) => q.prompt.length > 0);
}

// ── Sub-components ─────────────────────────────────────────────────────────────

interface ProgressDotsProps {
  total: number;
  current: number;
  answers: Record<number, TFAnswer>;
  onDotClick: (i: number) => void;
}

function ProgressDots({ total, current, answers, onDotClick }: ProgressDotsProps) {
  if (total <= 1) return null;
  return (
    <div style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap" }}>
      {Array.from({ length: total }, (_, i) => {
        const answered = answers[i + 1] != null;
        const active = i === current;
        return (
          <button
            key={i}
            type="button"
            onClick={() => onDotClick(i)}
            style={{
              width: active ? 22 : 8,
              height: 8,
              borderRadius: 4,
              border: "none",
              padding: 0,
              cursor: "pointer",
              background: active
                ? "#6c6fef"
                : answered
                ? "#a5b4fc"
                : "#e2e8f0",
              transition: "width 0.2s, background 0.2s",
              flexShrink: 0,
            }}
            aria-label={`Question ${i + 1}`}
          />
        );
      })}
    </div>
  );
}

interface TFButtonProps {
  label: string;
  emoji: string;
  value: "true" | "false";
  selected: boolean;
  disabled: boolean;
  correct?: boolean; // shown after submit
  wrong?: boolean;
  onClick: () => void;
}

function TFButton({ label, emoji, value, selected, disabled, correct, wrong, onClick }: TFButtonProps) {
  const isTrue = value === "true";

  let bg = "#ffffff";
  let border = "#e2e8f0";
  let color = "#334155";
  let shadow = "0 1px 3px rgba(30,41,59,0.06)";

  if (correct) {
    bg = "#f0fdf4";
    border = "#86efac";
    color = "#15803d";
    shadow = "0 0 0 3px #bbf7d0";
  } else if (wrong) {
    bg = "#fff1f2";
    border = "#fca5a5";
    color = "#b91c1c";
    shadow = "0 0 0 3px #fee2e2";
  } else if (selected) {
    bg = isTrue ? "#eef0fe" : "#fff1f2";
    border = isTrue ? "#6c6fef" : "#f87171";
    color = isTrue ? "#4f52c2" : "#b91c1c";
    shadow = `0 0 0 3px ${isTrue ? "#c7d2fe" : "#fee2e2"}`;
  } else if (!disabled) {
    // hover is handled inline
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        padding: "20px 16px",
        borderRadius: 14,
        border: `2px solid ${border}`,
        background: bg,
        color,
        boxShadow: shadow,
        cursor: disabled ? "default" : "pointer",
        transition: "all 0.15s ease",
        fontFamily: "inherit",
        outline: "none",
        minHeight: 90,
      }}
    >
      <span style={{ fontSize: 28, lineHeight: 1 }}>{emoji}</span>
      <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: 0.2 }}>{label}</span>
    </button>
  );
}

// ── Results panel ──────────────────────────────────────────────────────────────

interface ResultsPanelProps {
  questions: TFQuestion[];
  answers: Record<number, TFAnswer>;
  onReview: (i: number) => void;
}

function ResultsPanel({ questions, answers, onReview }: ResultsPanelProps) {
  const correct = questions.filter((q) => answers[q.id] === q.correctId).length;
  const total = questions.length;
  const pct = Math.round((correct / total) * 100);
  const allCorrect = correct === total;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, animation: "fadeInUp 0.3s ease" }}>
      {/* Score card */}
      <div
        style={{
          borderRadius: 14,
          background: allCorrect ? "#f0fdf4" : pct >= 70 ? "#eef0fe" : "#fff7ed",
          border: `1px solid ${allCorrect ? "#86efac" : pct >= 70 ? "#c7d2fe" : "#fed7aa"}`,
          padding: "18px 20px",
          display: "flex",
          alignItems: "center",
          gap: 14,
        }}
      >
        <span style={{ fontSize: 34, lineHeight: 1 }}>{allCorrect ? "🎉" : pct >= 70 ? "👍" : "📚"}</span>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#1e293b" }}>
            {correct} / {total}
          </div>
          <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>
            {pct}% correct · {allCorrect ? "Perfect score!" : pct >= 70 ? "Good work!" : "Keep practising!"}
          </div>
        </div>
      </div>

      {/* Per-question breakdown */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {questions.map((q, i) => {
          const given = answers[q.id];
          const ok = given === q.correctId;
          return (
            <button
              key={q.id}
              type="button"
              onClick={() => onReview(i)}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #f1f5f9",
                background: "#ffffff",
                cursor: "pointer",
                textAlign: "left",
                fontFamily: "inherit",
                transition: "background 0.12s",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#f8fafc"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#ffffff"; }}
            >
              {ok
                ? <CheckCircle2 size={16} color="#16a34a" style={{ flexShrink: 0, marginTop: 1 }} />
                : <XCircle size={16} color="#dc2626" style={{ flexShrink: 0, marginTop: 1 }} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: "#334155", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#cbd5e1", marginRight: 6 }}>Q{i + 1}</span>
                  {q.prompt}
                </div>
                {!ok && (
                  <div
                    style={{
                      marginTop: 4,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      background: "#eef0fe",
                      border: "1px solid #c7cafc",
                      borderRadius: 6,
                      padding: "2px 8px",
                      fontSize: 11,
                      color: "#4f52c2",
                      fontWeight: 600,
                    }}
                  >
                    ✓ {q.correctId === "true" ? "True" : "False"}
                  </div>
                )}
              </div>
              <span style={{ fontSize: 11, color: "#e2e8f0", flexShrink: 0, paddingTop: 2 }}>→</span>
            </button>
          );
        })}
      </div>

      <style>{`@keyframes fadeInUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }`}</style>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function TrueFalseBlock({ item, mode, onComplete }: ExerciseBlockProps) {
  const rawItem = item as unknown as {
    id: string;
    type: string;
    label?: string;
    data?: Record<string, unknown>;
  };

  const liveCtx = useContext(LiveSessionContext);
  const teacherHints = showTeacherExerciseHints(mode, liveCtx?.role);

  const data = rawItem.data ?? {};
  const title = String(data.title ?? rawItem.label ?? "True / False");

  // ── Normalise questions from both AI and editor shapes ─────────────────────
  const questions = useMemo<TFQuestion[]>(() => {
    const rawQuestions = Array.isArray(data.questions) ? data.questions : [];
    // Shape B (editor) payloads are stored in data.questions already but with type field.
    // Shape A (AI) has no type field, uses correct_answer.
    return normaliseQuestions(rawQuestions);
  }, [data.questions]);

  // ── State ──────────────────────────────────────────────────────────────────
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, TFAnswer>>({});
  const [submitted, setSubmitted] = useState(false);
  const [reviewMode, setReviewMode] = useState(false);

  useEffect(() => {
    setCurrentIndex(0);
    setAnswers({});
    setSubmitted(false);
    setReviewMode(false);
  }, [rawItem.id]);

  // ── Live sync ──────────────────────────────────────────────────────────────
  useLiveSyncField(
    `ex/${rawItem.id}/tf_answers`,
    answers,
    (remote) => {
      if (remote && typeof remote === "object" && !Array.isArray(remote))
        setAnswers(remote as Record<number, TFAnswer>);
    },
    { bidirectional: true },
  );

  useLiveSyncField(
    `ex/${rawItem.id}/tf_idx`,
    currentIndex,
    (remote) => {
      if (typeof remote !== "number" || Number.isNaN(remote)) return;
      setCurrentIndex(Math.min(Math.max(0, Math.round(remote)), Math.max(questions.length - 1, 0)));
    },
    { bidirectional: true },
  );

  // ── Derived ────────────────────────────────────────────────────────────────
  const currentQuestion = questions[currentIndex] ?? null;
  const isLast = currentIndex === questions.length - 1;
  const answeredCount = questions.filter((q) => answers[q.id] != null).length;
  const allAnswered = questions.length > 0 && answeredCount === questions.length;

  const handleAnswer = useCallback(
    (value: "true" | "false") => {
      if (!currentQuestion || submitted) return;
      setAnswers((prev) => ({ ...prev, [currentQuestion.id]: value }));
    },
    [currentQuestion, submitted],
  );

  const handleSubmit = useCallback(() => {
    if (!allAnswered || submitted) return;
    setSubmitted(true);
    onComplete();
  }, [allAnswered, submitted, onComplete]);

  // ── Empty state ────────────────────────────────────────────────────────────
  if (questions.length === 0) {
    return (
      <div className="dtg-block">
        <div className="dtg-block-title">{title}</div>
        <div className="twg-helper-bar">No questions added yet.</div>
      </div>
    );
  }

  // ── Results panel ──────────────────────────────────────────────────────────
  if (submitted && !reviewMode) {
    return (
      <div className="dtg-block">
        <div className="dtg-block-title">{title}</div>
        <ResultsPanel
          questions={questions}
          answers={answers}
          onReview={(i) => { setCurrentIndex(i); setReviewMode(true); }}
        />
      </div>
    );
  }

  // ── Review a single question after submission ──────────────────────────────
  if (submitted && reviewMode && currentQuestion) {
    const given = answers[currentQuestion.id];
    const isCorrect = given === currentQuestion.correctId;

    return (
      <div className="dtg-block">
        <div className="dtg-block-title">{title}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <QuestionCard
            question={currentQuestion}
            index={currentIndex}
            total={questions.length}
            selectedAnswer={given ?? null}
            disabled
            reviewMode
          />
          {isCorrect ? (
            <FeedbackBanner bg="#f0fdf4" border="#86efac" color="#15803d">
              <CheckCircle2 size={15} color="#16a34a" style={{ flexShrink: 0 }} />
              Your answer was correct!
            </FeedbackBanner>
          ) : (
            <FeedbackBanner bg="#eef0fe" border="#c7cafc" color="#4f52c2">
              <CheckCircle2 size={15} color="#6c6fef" style={{ flexShrink: 0 }} />
              <span>
                <span style={{ opacity: 0.65, marginRight: 5 }}>Correct answer:</span>
                <strong>{currentQuestion.correctId === "true" ? "True" : "False"}</strong>
              </span>
            </FeedbackBanner>
          )}
          {teacherHints && (
            <FeedbackBanner bg="#fffbeb" border="#fde68a" color="#b45309">
              <span style={{ fontWeight: 700 }}>Answer: </span>
              {currentQuestion.correctId === "true" ? "True ✓" : "False ✓"}
            </FeedbackBanner>
          )}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, paddingTop: 4 }}>
            <button type="button" className="dtg-btn-cancel" onClick={() => setReviewMode(false)}>
              ← Results
            </button>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="dtg-btn-cancel" onClick={() => setCurrentIndex((p) => Math.max(p - 1, 0))} disabled={currentIndex === 0}>
                <ChevronLeft size={14} /> Prev
              </button>
              <button type="button" className="dtg-btn-save" onClick={() => setCurrentIndex((p) => Math.min(p + 1, questions.length - 1))} disabled={isLast}>
                Next <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Normal answering mode ──────────────────────────────────────────────────
  return (
    <div className="dtg-block">
      <div className="dtg-block-title">{title}</div>
      {currentQuestion && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <QuestionCard
            question={currentQuestion}
            index={currentIndex}
            total={questions.length}
            selectedAnswer={answers[currentQuestion.id] ?? null}
            disabled={submitted}
            reviewMode={false}
            onAnswer={handleAnswer}
            teacherHints={teacherHints}
          />

          <ProgressDots
            total={questions.length}
            current={currentIndex}
            answers={answers}
            onDotClick={setCurrentIndex}
          />

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, paddingTop: 2 }}>
            <span style={{ fontSize: 12, color: "#64748b" }}>
              {answeredCount} / {questions.length} answered
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                className="dtg-btn-cancel"
                onClick={() => setCurrentIndex((p) => Math.max(p - 1, 0))}
                disabled={currentIndex === 0}
              >
                <ChevronLeft size={14} /> Prev
              </button>
              {isLast ? (
                <button
                  type="button"
                  className={["dtg-btn-save", !allAnswered || submitted ? "dtg-btn-save--disabled" : ""].filter(Boolean).join(" ")}
                  onClick={handleSubmit}
                  disabled={!allAnswered || submitted}
                >
                  {submitted ? "Submitted ✓" : "Submit"}
                </button>
              ) : (
                <button
                  type="button"
                  className="dtg-btn-save"
                  onClick={() => setCurrentIndex((p) => Math.min(p + 1, questions.length - 1))}
                >
                  Next <ChevronRight size={14} />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── QuestionCard ───────────────────────────────────────────────────────────────

interface QuestionCardProps {
  question: TFQuestion;
  index: number;
  total: number;
  selectedAnswer: TFAnswer;
  disabled: boolean;
  reviewMode: boolean;
  onAnswer?: (v: "true" | "false") => void;
  teacherHints?: boolean;
}

function QuestionCard({ question, index, total, selectedAnswer, disabled, reviewMode, onAnswer, teacherHints }: QuestionCardProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Counter */}
      <div style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8", letterSpacing: 0.5, textTransform: "uppercase" }}>
        Question {index + 1} of {total}
      </div>

      {/* Prompt card */}
      <div
        style={{
          background: "#f7f7fa",
          borderRadius: 14,
          padding: "18px 20px",
          fontSize: 15,
          fontWeight: 500,
          color: "#1e293b",
          lineHeight: 1.6,
          border: "1px solid #e2e8f0",
        }}
      >
        {question.prompt}
      </div>

      {/* Teacher hint badge */}
      {teacherHints && !reviewMode && (
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: "#eef0fe",
            border: "1px solid #c7cafc",
            borderRadius: 8,
            padding: "4px 12px",
            fontSize: 12,
            color: "#4f52c2",
            fontWeight: 600,
            alignSelf: "flex-start",
          }}
        >
          ✓ Correct: {question.correctId === "true" ? "True" : "False"}
        </div>
      )}

      {/* True / False buttons */}
      <div style={{ display: "flex", gap: 12 }}>
        {(["true", "false"] as const).map((val) => {
          const isSelected = selectedAnswer === val;
          const isCorrectVal = question.correctId === val;

          let correct: boolean | undefined;
          let wrong: boolean | undefined;

          if (reviewMode && isSelected) {
            correct = isCorrectVal;
            wrong = !isCorrectVal;
          } else if (reviewMode && isCorrectVal) {
            correct = true;
          }

          return (
            <TFButton
              key={val}
              value={val}
              label={val === "true" ? "True" : "False"}
              emoji={val === "true" ? "✅" : "❌"}
              selected={isSelected}
              disabled={disabled}
              correct={correct}
              wrong={wrong}
              onClick={() => onAnswer?.(val)}
            />
          );
        })}
      </div>
    </div>
  );
}

// ── FeedbackBanner ─────────────────────────────────────────────────────────────

function FeedbackBanner({
  bg, border, color, children,
}: {
  bg: string; border: string; color: string; children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: 10,
        padding: "10px 14px",
        fontSize: 13,
        color,
        fontWeight: 500,
      }}
    >
      {children}
    </div>
  );
}