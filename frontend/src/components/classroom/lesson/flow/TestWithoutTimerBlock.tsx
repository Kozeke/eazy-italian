/**
 * TestWithoutTimerBlock.tsx — updated with results panel + per-question hints
 */

import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { CheckCircle2, XCircle, AlertCircle } from "lucide-react";
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
  return value.split(",").map((e) => e.trim()).filter(Boolean);
}

function mapGap(gap: GapDraft) {
  return { id: gap.id, answers: splitAnswers(gap.answers), case_sensitive: gap.case_sensitive, score: gap.score };
}

/** Fisher-Yates shuffle — returns a new array, does not mutate the original. */
function shuffled<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function toRuntimeQuestion(draft: QuestionDraft, index: number): RuntimeQuestion {
  const rawDraft = draft as unknown as Record<string, unknown>;
  if (!draft.type && rawDraft.correct_index !== undefined) {
    const rawOptions = (rawDraft.options ?? []) as Array<{ text?: string; id?: string }>;
    const correctIndex = Number(rawDraft.correct_index ?? 0);
    const normalisedOptions = rawOptions.map((o, i) => ({ id: o.id ?? `opt_${i}`, text: o.text ?? "" }));
    const correctId = normalisedOptions[correctIndex]?.id ?? `opt_${correctIndex}`;
    draft = { ...(draft as object), type: "multiple_choice", options: normalisedOptions, correct_option_ids: [correctId] } as QuestionDraft;
  }
  const base: RuntimeQuestion = { id: index + 1, type: draft.type, prompt: draft.prompt, question_text: draft.prompt };
  switch (draft.type) {
    case "multiple_choice":
      return { ...base, options: shuffled(draft.options).map((o) => ({ id: o.id, text: o.text })), question_metadata: { correct_option_ids: draft.correct_option_ids } };
    case "true_false":
      return { ...base, question_metadata: { correct_option_id: draft.correct_option_id } };
    case "open_answer":
      return { ...base, question_metadata: { teacher_open_answer: { expected_mode: draft.expected_mode, keywords: draft.keywords, pattern: draft.pattern, case_insensitive: draft.case_insensitive } } };
    case "cloze_input":
      return { ...base, gaps_config: draft.gaps.map(mapGap) };
    case "cloze_drag":
      return { ...base, gaps_config: draft.gaps.map(mapGap), question_metadata: { word_bank: splitAnswers(draft.word_bank), shuffle_word_bank: draft.shuffle_word_bank } };
    case "matching_pairs":
      return { ...base, question_metadata: { left_items: draft.left_items as MatchItemDraft[], right_items: draft.right_items as MatchItemDraft[], shuffle_right: draft.shuffle_right, pairs: draft.pairs } };
    case "ordering_words":
      return { ...base, question_metadata: { tokens: draft.tokens as TokenDraft[], correct_order: draft.correct_order.length > 0 ? draft.correct_order : draft.tokens.map((t) => t.id) } };
    case "ordering_sentences":
      return { ...base, question_metadata: { items: draft.items as TokenDraft[], correct_order: draft.correct_order.length > 0 ? draft.correct_order : draft.items.map((t) => t.id) } };
    default:
      return base;
  }
}

function hasAnswer(answer: StudentAnswer | undefined): boolean {
  if (answer == null) return false;
  if (typeof answer === "string") return answer.trim().length > 0;
  if (Array.isArray(answer)) return answer.length > 0;
  return Object.values(answer).some((v) => String(v).trim().length > 0);
}

// ─── scoring ──────────────────────────────────────────────────────────────────

type QuestionVerdict = "correct" | "incorrect" | "open";

function getQuestionVerdict(q: RuntimeQuestion, answer: StudentAnswer | undefined): QuestionVerdict {
  if (!hasAnswer(answer)) return "incorrect";
  const meta = q.question_metadata as Record<string, unknown> | undefined;
  switch (q.type) {
    case "multiple_choice": {
      const correctIds: string[] = (meta?.correct_option_ids as string[]) ?? [];
      const given: string[] = Array.isArray(answer) ? (answer as string[]) : [answer as string];
      return given.length === correctIds.length && given.every((id) => correctIds.includes(id)) ? "correct" : "incorrect";
    }
    case "true_false":
      return answer === meta?.correct_option_id ? "correct" : "incorrect";
    case "open_answer":
      return "open";
    case "cloze_input":
    case "cloze_drag": {
      const gc = (q as any).gaps_config ?? [];
      if (typeof answer !== "object" || Array.isArray(answer)) return "incorrect";
      const m = answer as Record<string, string>;
      return gc.every((gap: any) => { const g = String(m[gap.id] ?? "").trim(); return gap.answers.some((a: string) => gap.case_sensitive ? a === g : a.toLowerCase() === g.toLowerCase()); }) ? "correct" : "incorrect";
    }
    case "matching_pairs": {
      const pairs = (meta?.pairs as Array<{ left_id: string; right_id: string }>) ?? [];
      if (typeof answer !== "object" || Array.isArray(answer)) return "incorrect";
      const m = answer as Record<string, string>;
      return pairs.every((p) => m[p.left_id] === p.right_id) ? "correct" : "incorrect";
    }
    case "ordering_words":
    case "ordering_sentences": {
      const co = (meta?.correct_order as string[]) ?? [];
      const given = Array.isArray(answer) ? (answer as string[]) : [];
      return co.length === given.length && co.every((id, i) => id === given[i]) ? "correct" : "incorrect";
    }
    default: return "open";
  }
}

function getCorrectAnswerHint(q: RuntimeQuestion): string {
  const meta = q.question_metadata as Record<string, unknown> | undefined;
  switch (q.type) {
    case "multiple_choice": {
      const ids: string[] = (meta?.correct_option_ids as string[]) ?? [];
      const opts = (q as any).options ?? [];
      return opts.filter((o: any) => ids.includes(o.id)).map((o: any) => o.text).join(", ");
    }
    case "true_false": return (meta?.correct_option_id as string) === "true" ? "True" : "False";
    case "open_answer": {
      const toa = meta?.teacher_open_answer as any;
      if (toa?.keywords?.length) return `Keywords: ${toa.keywords.join(", ")}`;
      if (toa?.pattern) return `Pattern: ${toa.pattern}`;
      return "";
    }
    case "cloze_input":
    case "cloze_drag": return ((q as any).gaps_config ?? []).map((g: any) => g.answers[0] ?? "").join(" / ");
    case "matching_pairs": {
      const left = (meta?.left_items as any[]) ?? [];
      const right = (meta?.right_items as any[]) ?? [];
      const pairs = (meta?.pairs as any[]) ?? [];
      return pairs.map((p) => { const l = left.find((i: any) => i.id === p.left_id)?.text ?? p.left_id; const r = right.find((i: any) => i.id === p.right_id)?.text ?? p.right_id; return `${l} → ${r}`; }).join("; ");
    }
    case "ordering_words": { const t = (meta?.tokens as any[]) ?? []; const o = (meta?.correct_order as string[]) ?? []; return o.map((id) => t.find((x: any) => x.id === id)?.text ?? id).join(" "); }
    case "ordering_sentences": { const t = (meta?.items as any[]) ?? []; const o = (meta?.correct_order as string[]) ?? []; return o.map((id) => t.find((x: any) => x.id === id)?.text ?? id).join(" → "); }
    default: return "";
  }
}

// ─── Results Panel ─────────────────────────────────────────────────────────────

function HintBanner({ bg, border, color, children }: { bg: string; border: string; color: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9, background: bg, border: `1.5px solid ${border}`, borderRadius: 12, padding: "11px 15px", fontSize: 13, color, fontWeight: 500 }}>
      {children}
    </div>
  );
}

/** Shown only to teachers — reveals the correct answer inline while students answer. */
function TeacherCorrectAnswerHint({ question }: { question: RuntimeQuestion }) {
  const hint = getCorrectAnswerHint(question);
  if (!hint) return null;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      background: "#fefce8", border: "1.5px dashed #fbbf24",
      borderRadius: 10, padding: "8px 14px",
      fontSize: 12, color: "#92400e", fontWeight: 500,
    }}>
      <span style={{
        fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
        textTransform: "uppercase", color: "#d97706", flexShrink: 0,
      }}>
        ✦ Teacher only
      </span>
      <span style={{ width: 1, height: 12, background: "#fcd34d", flexShrink: 0 }} />
      <span style={{ color: "#78350f" }}>
        Correct: <strong>{hint}</strong>
      </span>
    </div>
  );
}

function ResultsPanel({ questions, answers, onReview }: { questions: RuntimeQuestion[]; answers: Record<string, StudentAnswer>; onReview: (i: number) => void }) {
  const verdicts = questions.map((q) => getQuestionVerdict(q, answers[String(q.id)]));
  const correctCount = verdicts.filter((v) => v === "correct").length;
  const openCount = verdicts.filter((v) => v === "open").length;
  const gradable = questions.length - openCount;
  const pct = gradable > 0 ? Math.round((correctCount / gradable) * 100) : 0;
  const sc = pct >= 80 ? "#16a34a" : pct >= 50 ? "#d97706" : "#dc2626";
  const sb = pct >= 80 ? "#f0fdf4" : pct >= 50 ? "#fffbeb" : "#fef2f2";
  const sbr = pct >= 80 ? "#bbf7d0" : pct >= 50 ? "#fde68a" : "#fecaca";
  const lbl = correctCount === gradable ? "Perfect score! 🎉" : pct >= 80 ? "Great job! 👏" : pct >= 50 ? "Good effort! 💪" : "Keep practicing! 📚";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, animation: "fadeInUp 0.35s ease" }}>
      {/* Score card */}
      <div style={{ background: sb, border: `1.5px solid ${sbr}`, borderRadius: 16, padding: "20px 24px", display: "flex", alignItems: "center", gap: 20 }}>
        <div style={{ width: 68, height: 68, borderRadius: "50%", background: "#fff", border: `3px solid ${sc}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, flexDirection: "column" }}>
          <span style={{ fontSize: 22, fontWeight: 800, color: sc, lineHeight: 1 }}>{correctCount}</span>
          <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600, lineHeight: 1.3 }}>/{gradable}</span>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#1e293b", marginBottom: 4 }}>{lbl}</div>
          <div style={{ fontSize: 13, color: "#64748b", marginBottom: 10 }}>
            {correctCount} correct · {gradable - correctCount} incorrect{openCount > 0 ? ` · ${openCount} for review` : ""}
          </div>
          <div style={{ height: 6, background: "#e2e8f0", borderRadius: 99, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pct}%`, background: sc, borderRadius: 99, transition: "width 0.7s cubic-bezier(.4,0,.2,1)" }} />
          </div>
        </div>
      </div>

      {/* Per-question list */}
      <div style={{ background: "#fff", border: "1.5px solid #e8eaf0", borderRadius: 14, overflow: "hidden" }}>
        <div style={{ padding: "10px 16px", borderBottom: "1px solid #f1f5f9", fontSize: 11, fontWeight: 700, color: "#94a3b8", letterSpacing: "0.07em", textTransform: "uppercase" }}>
          Review questions
        </div>
        {questions.map((q, i) => {
          const v = verdicts[i];
          const hint = getCorrectAnswerHint(q);
          return (
            <button
              key={q.id}
              type="button"
              onClick={() => onReview(i)}
              style={{ width: "100%", display: "flex", alignItems: "flex-start", gap: 12, padding: "13px 16px", background: "transparent", border: "none", borderBottom: i < questions.length - 1 ? "1px solid #f8fafc" : "none", cursor: "pointer", textAlign: "left", transition: "background 0.12s" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#f8fafc"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
            >
              <div style={{ paddingTop: 2, flexShrink: 0 }}>
                {v === "open" ? <AlertCircle size={17} color="#d97706" /> : v === "correct" ? <CheckCircle2 size={17} color="#16a34a" /> : <XCircle size={17} color="#dc2626" />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: "#334155", fontWeight: 500, marginBottom: (v === "incorrect" && hint) || v === "open" ? 7 : 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#cbd5e1", marginRight: 6 }}>Q{i + 1}</span>
                  {q.prompt}
                </div>
                {v === "incorrect" && hint && (
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "#eef0fe", border: "1px solid #c7cafc", borderRadius: 8, padding: "3px 10px", fontSize: 12, color: "#4f52c2", fontWeight: 500 }}>
                    <span style={{ opacity: 0.6, fontSize: 10 }}>✓</span>{hint}
                  </div>
                )}
                {v === "open" && (
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "3px 10px", fontSize: 12, color: "#b45309", fontWeight: 500 }}>
                    Teacher review required
                  </div>
                )}
              </div>
              <span style={{ fontSize: 12, color: "#e2e8f0", paddingTop: 3, flexShrink: 0 }}>→</span>
            </button>
          );
        })}
      </div>
      <style>{`@keyframes fadeInUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }`}</style>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function TestWithoutTimerBlock({ item, mode, onComplete }: ExerciseBlockProps) {
  const typedItem = item as unknown as TestWithoutTimerItemData;
  const liveCtx = useContext(LiveSessionContext);
  const teacherAnswerHints = showTeacherExerciseHints(mode, liveCtx?.role);
  const exerciseData: TestWithoutTimerData = typedItem.data ?? {};
  const questions = useMemo(() => (exerciseData.questions ?? []).map(toRuntimeQuestion), [exerciseData.questions]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, StudentAnswer>>({});
  const [submitted, setSubmitted] = useState(false);
  const [reviewMode, setReviewMode] = useState(false);

  const currentQuestion = questions[currentIndex] ?? null;
  const isLast = currentIndex === questions.length - 1;
  const answeredCount = Object.values(answers).filter(hasAnswer).length;
  const allAnswered = questions.length > 0 && questions.every((q) => hasAnswer(answers[String(q.id)]));

  useEffect(() => { setCurrentIndex(0); setAnswers({}); setSubmitted(false); setReviewMode(false); }, [typedItem.id]);

  useLiveSyncField(`ex/${typedItem.id}/test_answers`, answers, (remote) => {
    if (remote && typeof remote === "object" && !Array.isArray(remote)) setAnswers(remote as Record<string, StudentAnswer>);
  }, { bidirectional: true });

  useLiveSyncField(`ex/${typedItem.id}/test_idx`, currentIndex, (remote) => {
    if (typeof remote !== "number" || Number.isNaN(remote)) return;
    setCurrentIndex(Math.min(Math.max(0, Math.round(remote)), Math.max(questions.length - 1, 0)));
  }, { bidirectional: true });

  const handleAnswer = useCallback((answer: StudentAnswer) => {
    if (!currentQuestion) return;
    setAnswers((prev) => ({ ...prev, [String(currentQuestion.id)]: answer }));
  }, [currentQuestion]);

  const handleSubmit = useCallback(() => {
    if (!allAnswered) return;
    setSubmitted(true);
    onComplete();
  }, [allAnswered, onComplete]);

  if (questions.length === 0) {
    return (
      <div className="dtg-block">
        <div className="dtg-block-title">{exerciseData.title || typedItem.label || "Test"}</div>
        <div className="twg-helper-bar">No questions added yet.</div>
      </div>
    );
  }

  const title = exerciseData.title || typedItem.label;

  // ── Results summary ────────────────────────────────────────────────────────
  if (submitted && !reviewMode) {
    return (
      <div className="dtg-block">
        {title && <div className="dtg-block-title">{title}</div>}
        <ResultsPanel questions={questions} answers={answers} onReview={(i) => { setCurrentIndex(i); setReviewMode(true); }} />
      </div>
    );
  }

  // ── Review a single question after submission ──────────────────────────────
  if (submitted && reviewMode && currentQuestion) {
    const verdict = getQuestionVerdict(currentQuestion, answers[String(currentQuestion.id)]);
    const hint = getCorrectAnswerHint(currentQuestion);
    return (
      <div className="dtg-block">
        {title && <div className="dtg-block-title">{title}</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <QuestionRenderer question={currentQuestion} answer={answers[String(currentQuestion.id)] ?? null} onAnswer={() => {}} disabled={true} questionKey={`${typedItem.id}-${currentIndex}-review`} teacherAnswerHints={teacherAnswerHints} />

          {verdict === "correct" && (
            <HintBanner bg="#f0fdf4" border="#bbf7d0" color="#16a34a">
              <CheckCircle2 size={15} color="#16a34a" style={{ flexShrink: 0 }} />
              Your answer was correct!
            </HintBanner>
          )}
          {verdict === "incorrect" && hint && (
            <HintBanner bg="#eef0fe" border="#c7cafc" color="#4f52c2">
              <CheckCircle2 size={15} color="#6c6fef" style={{ flexShrink: 0 }} />
              <span><span style={{ opacity: 0.65, marginRight: 5 }}>Correct answer:</span><strong>{hint}</strong></span>
            </HintBanner>
          )}
          {verdict === "open" && (
            <HintBanner bg="#fffbeb" border="#fde68a" color="#b45309">
              <AlertCircle size={15} color="#d97706" style={{ flexShrink: 0 }} />
              This open answer will be reviewed by your teacher.
            </HintBanner>
          )}

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, paddingTop: 4 }}>
            <button type="button" className="dtg-btn-cancel" onClick={() => setReviewMode(false)}>← Results</button>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="dtg-btn-cancel" onClick={() => setCurrentIndex((p) => Math.max(p - 1, 0))} disabled={currentIndex === 0}>Назад</button>
              <button type="button" className="dtg-btn-save" onClick={() => setCurrentIndex((p) => Math.min(p + 1, questions.length - 1))} disabled={isLast}>Дальше</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Normal answering mode ──────────────────────────────────────────────────
  return (
    <div className="dtg-block">
      {title && <div className="dtg-block-title">{title}</div>}
      {currentQuestion && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <QuestionRenderer question={currentQuestion} answer={answers[String(currentQuestion.id)] ?? null} onAnswer={handleAnswer} disabled={submitted} questionKey={`${typedItem.id}-${currentIndex}`} teacherAnswerHints={teacherAnswerHints} />
          {teacherAnswerHints && <TeacherCorrectAnswerHint question={currentQuestion} />}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, paddingTop: 6 }}>
            <span style={{ fontSize: 12, color: "#64748b" }}>{answeredCount} / {questions.length} answered</span>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="dtg-btn-cancel" onClick={() => setCurrentIndex((p) => Math.max(p - 1, 0))} disabled={currentIndex === 0 || submitted}>Назад</button>
              {isLast ? (
                <button type="button" className={["dtg-btn-save", !allAnswered || submitted ? "dtg-btn-save--disabled" : ""].filter(Boolean).join(" ")} onClick={handleSubmit} disabled={!allAnswered || submitted}>
                  {submitted ? "Завершено" : "Отправить"}
                </button>
              ) : (
                <button type="button" className="dtg-btn-save" onClick={() => setCurrentIndex((p) => Math.min(p + 1, questions.length - 1))} disabled={submitted}>Дальше</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}