/**
 * TestSection.tsx  (v2 — Premium Test Experience)
 *
 * Redesigned student test experience.
 *
 * Phases:
 *  • intro     — readiness screen with test metadata, rules, start CTA
 *  • playing   — focused question player with timer, nav, progress
 *  • confirm   — submit confirmation overlay
 *  • submitted — animated results summary with per-question review
 *
 * Design notes:
 *  — Tone: focused, serious, premium edtech (think Duolingo meets Notion)
 *  — Typography: DM Sans for UI chrome, DM Serif Display for question text
 *  — Color: teal accent system with emerald pass / red fail outcomes
 *  — Timer uses a live countdown ring when time_limit_minutes is set
 *  — Question progress is a full-width segmented bar above the question
 *  — Answer options use large radio cards with keyboard support
 *  — Jump navigator (grid) shown below for ≤ 20 questions
 *  — Submit confirm is a modal-style overlay inside the card
 *  — Results show score ring + streak bars per question
 *
 * API surface unchanged — onSubmitTest receives { test_id, answers }.
 */

import React, {
  useState, useCallback, useEffect, useRef, useMemo,
} from 'react';
import {
  ClipboardList, Clock, Percent, CheckCircle2, XCircle,
  ChevronLeft, ChevronRight, Send, Loader2, AlertCircle,
  ExternalLink, Award, Play, Trophy, Target, Zap,
  RotateCcw, ChevronDown, BookOpen,
} from 'lucide-react';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface TestQuestion {
  id: number;
  question_text?: string;
  text?: string;
  type?: string;
  order_index?: number;
  options?: Array<{
    id: number;
    text?: string;
    option_text?: string;
    is_correct?: boolean;
  }>;
  correct_answer?: string;
}

export interface StudentTest {
  id: number;
  title: string;
  description?: string | null;
  instructions?: string | null;
  status?: string;
  time_limit_minutes?: number | null;
  passing_score?: number | null;
  questions_count?: number | null;
  questions?: TestQuestion[];
  settings?: {
    max_attempts?: number;
    show_results?: boolean;
    shuffle_questions?: boolean;
    shuffle_options?: boolean;
    [key: string]: unknown;
  };
  unit_id?: number;
}

export interface TestAttempt {
  id?: number;
  status?: string;
  score?: number | null;
  passed?: boolean | null;
  submitted_at?: string;
  answers?: Record<string, unknown>;
  review?: Array<{
    question_id: number;
    correct: boolean;
    selected_option?: string;
    correct_answer?: string;
  }>;
}

export interface TestSectionProps {
  test: StudentTest;
  attempt: TestAttempt | null;
  onSubmitTest: (payload: { test_id: number; answers: Record<string, string> }) => Promise<TestAttempt | void>;
  onOpenFull?: (test: StudentTest) => void;
  loading?: boolean;
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const FONTS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=DM+Serif+Display:ital@0;1&display=swap');
`;

// ─── Timer hook ────────────────────────────────────────────────────────────────

function useCountdown(minutes: number | null | undefined, active: boolean) {
  const totalSeconds = (minutes ?? 0) * 60;
  const [remaining, setRemaining] = useState(totalSeconds);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!active || !minutes) return;
    setRemaining(totalSeconds);
    intervalRef.current = setInterval(() => {
      setRemaining((r) => Math.max(0, r - 1));
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [active, minutes, totalSeconds]);

  const pct = totalSeconds > 0 ? (remaining / totalSeconds) * 100 : 100;
  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const label = `${mins}:${String(secs).padStart(2, '0')}`;
  const urgent = remaining < 60 && minutes != null;
  const expired = remaining === 0 && minutes != null;

  return { label, pct, urgent, expired, remaining };
}

// ─── Timer ring ────────────────────────────────────────────────────────────────

function TimerRing({
  label, pct, urgent,
}: { label: string; pct: number; urgent: boolean }) {
  const size = 52;
  const r = (size - 5) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      aria-label={`Time remaining: ${label}`}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke="#e2e8f0" strokeWidth={4} />
        <circle cx={size / 2} cy={size / 2} r={r}
          fill="none"
          stroke={urgent ? '#ef4444' : '#0d9488'}
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          style={{ transition: 'stroke-dasharray 1s linear, stroke 0.3s' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-0">
        <Clock className={`h-2.5 w-2.5 ${urgent ? 'text-red-400' : 'text-slate-400'}`} />
        <span className={`text-[10px] font-bold tabular-nums leading-none ${urgent ? 'text-red-500' : 'text-slate-700'}`}>
          {label}
        </span>
      </div>
    </div>
  );
}

// ─── Progress strip ────────────────────────────────────────────────────────────

function ProgressStrip({
  total, current, answers,
  onJump, disabled,
}: {
  total: number; current: number;
  answers: Record<string, string>;
  questions: TestQuestion[];
  onJump: (i: number) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex gap-[3px]" role="list" aria-label="Question progress">
      {Array.from({ length: total }).map((_, i) => {
        const isCurrent = i === current;
        const isAnswered = false; // We'll key by index for visual only
        return (
          <button
            key={i}
            role="listitem"
            disabled={disabled}
            onClick={() => onJump(i)}
            aria-label={`Question ${i + 1}${isCurrent ? ' (current)' : ''}`}
            className={[
              'h-1.5 flex-1 rounded-full transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:ring-offset-1',
              isCurrent
                ? 'bg-teal-500'
                : 'bg-slate-200 hover:bg-slate-300',
            ].join(' ')}
          />
        );
      })}
    </div>
  );
}

// ─── Stat chip ─────────────────────────────────────────────────────────────────

function StatChip({ icon: Icon, label, value, color = 'slate' }: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  color?: 'slate' | 'teal' | 'emerald' | 'amber' | 'red';
}) {
  const colors = {
    slate:   'bg-slate-50 text-slate-600 border-slate-100',
    teal:    'bg-teal-50 text-teal-700 border-teal-100',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    amber:   'bg-amber-50 text-amber-700 border-amber-100',
    red:     'bg-red-50 text-red-700 border-red-100',
  };
  return (
    <div className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 ${colors[color]}`}>
      <Icon className="h-4 w-4 shrink-0 opacity-70" />
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider opacity-60">{label}</div>
        <div className="text-sm font-bold leading-tight">{value}</div>
      </div>
    </div>
  );
}

// ─── Answer option ─────────────────────────────────────────────────────────────

function AnswerOption({
  optId, label, letter,
  isSelected, isDisabled,
  isCorrect, isWrong,
  onSelect,
}: {
  optId: string; label: string; letter: string;
  isSelected: boolean; isDisabled: boolean;
  isCorrect?: boolean; isWrong?: boolean;
  onSelect: () => void;
}) {
  const base = 'group relative flex w-full cursor-pointer items-start gap-3.5 rounded-2xl border-2 px-4 py-3.5 text-left transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:ring-offset-2';

  let variant = 'border-slate-200 bg-white hover:border-teal-300 hover:bg-teal-50/40 hover:shadow-sm';
  if (isSelected && !isCorrect && !isWrong) variant = 'border-teal-400 bg-teal-50 shadow-sm shadow-teal-100';
  if (isCorrect)  variant = 'border-emerald-400 bg-emerald-50 shadow-sm';
  if (isWrong)    variant = 'border-red-300 bg-red-50';
  if (isDisabled && !isSelected && !isCorrect && !isWrong) variant += ' opacity-50';

  const letterBg = isCorrect
    ? 'bg-emerald-500 text-white'
    : isWrong
    ? 'bg-red-400 text-white'
    : isSelected
    ? 'bg-teal-500 text-white'
    : 'bg-slate-100 text-slate-500 group-hover:bg-teal-100 group-hover:text-teal-600';

  return (
    <button
      role="radio"
      aria-checked={isSelected}
      disabled={isDisabled}
      onClick={onSelect}
      className={`${base} ${variant}`}
      style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}
    >
      <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold transition-colors ${letterBg}`}>
        {letter}
      </span>
      <span className="flex-1 text-sm font-medium leading-relaxed text-slate-800">{label}</span>
      {isCorrect && <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />}
      {isWrong   && <XCircle      className="mt-0.5 h-5 w-5 shrink-0 text-red-400"     />}
    </button>
  );
}

// ─── Score ring ────────────────────────────────────────────────────────────────

function ScoreRing({ score, passed }: { score: number; passed: boolean | null | undefined }) {
  const size = 120;
  const r = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const color = passed === true ? '#10b981' : passed === false ? '#ef4444' : '#0d9488';

  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke="#f1f5f9" strokeWidth={8} />
        <circle cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke={color} strokeWidth={8}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          style={{ transition: 'stroke-dasharray 1.2s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-black tabular-nums text-slate-900">{score}%</span>
        <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Score</span>
      </div>
    </div>
  );
}

// ─── Results view ──────────────────────────────────────────────────────────────

function ResultsView({
  test, attempt, onOpenFull,
}: {
  test: StudentTest;
  attempt: TestAttempt;
  onOpenFull?: (t: StudentTest) => void;
}) {
  const [reviewOpen, setReviewOpen] = useState(false);
  const score = attempt.score ?? null;
  const passed = attempt.passed;
  const passingScore = test.passing_score ?? null;
  const showResults = test.settings?.show_results !== false;
  const review = attempt.review ?? [];
  const correctCount = review.filter((r) => r.correct).length;

  return (
    <div className="space-y-6" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      {/* Outcome header */}
      <div className={[
        'relative overflow-hidden rounded-2xl px-6 py-6 text-center',
        passed === true
          ? 'bg-gradient-to-br from-emerald-50 to-teal-50 ring-1 ring-emerald-100'
          : passed === false
          ? 'bg-gradient-to-br from-red-50 to-orange-50 ring-1 ring-red-100'
          : 'bg-gradient-to-br from-slate-50 to-slate-100 ring-1 ring-slate-200',
      ].join(' ')}>
        {/* Decorative circles */}
        <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full opacity-10"
          style={{ background: passed === true ? '#10b981' : passed === false ? '#ef4444' : '#94a3b8' }} />
        <div className="pointer-events-none absolute -bottom-6 -left-6 h-24 w-24 rounded-full opacity-10"
          style={{ background: passed === true ? '#0d9488' : passed === false ? '#f97316' : '#64748b' }} />

        {/* Icon */}
        <div className={[
          'mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl',
          passed === true ? 'bg-emerald-100' : passed === false ? 'bg-red-100' : 'bg-slate-200',
        ].join(' ')}>
          {passed === true
            ? <Trophy className="h-7 w-7 text-emerald-500" />
            : passed === false
            ? <Target className="h-7 w-7 text-red-400" />
            : <Award className="h-7 w-7 text-slate-500" />
          }
        </div>

        <h3 className={[
          'text-xl font-black leading-tight',
          passed === true ? 'text-emerald-800' : passed === false ? 'text-red-700' : 'text-slate-800',
        ].join(' ')} style={{ fontFamily: "'DM Serif Display', serif" }}>
          {passed === true ? 'Well done!' : passed === false ? 'Keep practising' : 'Test submitted'}
        </h3>

        {passed === false && passingScore != null && (
          <p className="mt-1 text-sm text-red-600/70">
            You needed {passingScore}% to pass
          </p>
        )}

        {attempt.submitted_at && (
          <p className="mt-1.5 text-xs text-slate-400">
            Submitted {new Date(attempt.submitted_at).toLocaleString('en', {
              day: 'numeric', month: 'short', year: 'numeric',
              hour: '2-digit', minute: '2-digit',
            })}
          </p>
        )}
      </div>

      {/* Score ring + stats */}
      {score != null && (
        <div className="flex flex-col items-center gap-5 sm:flex-row sm:justify-center">
          <ScoreRing score={score} passed={passed} />

          <div className="flex flex-col gap-2.5 sm:items-start items-center">
            {correctCount > 0 && review.length > 0 && (
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <span className="text-sm text-slate-600">
                  <strong className="text-slate-900">{correctCount}</strong> of {review.length} correct
                </span>
              </div>
            )}
            {passingScore != null && (
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-slate-400" />
                <span className="text-sm text-slate-600">
                  Pass mark: <strong className="text-slate-900">{passingScore}%</strong>
                </span>
              </div>
            )}
            {passed !== null && passed !== undefined && (
              <div className={[
                'mt-1 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold',
                passed ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700',
              ].join(' ')}>
                {passed ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                {passed ? 'Passed' : 'Not passed'}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Question review */}
      {showResults && review.length > 0 && (
        <div>
          <button
            onClick={() => setReviewOpen((v) => !v)}
            className="flex w-full items-center justify-between rounded-xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
          >
            <span className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-slate-400" />
              Review answers
            </span>
            <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${reviewOpen ? 'rotate-180' : ''}`} />
          </button>

          {reviewOpen && (
            <div className="mt-2 space-y-2">
              {review.map((r, i) => (
                <div
                  key={r.question_id}
                  className={[
                    'flex items-start gap-3 rounded-xl border px-4 py-3',
                    r.correct
                      ? 'border-emerald-100 bg-emerald-50'
                      : 'border-red-100 bg-red-50',
                  ].join(' ')}
                >
                  <div className={[
                    'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
                    r.correct ? 'bg-emerald-200 text-emerald-700' : 'bg-red-200 text-red-700',
                  ].join(' ')}>
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {r.correct
                        ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                        : <XCircle className="h-4 w-4 shrink-0 text-red-400" />}
                      <span className={`text-sm font-medium ${r.correct ? 'text-emerald-800' : 'text-red-800'}`}>
                        Question {i + 1} — {r.correct ? 'Correct' : 'Incorrect'}
                      </span>
                    </div>
                    {!r.correct && r.correct_answer && (
                      <p className="mt-1 text-xs text-slate-500">
                        Correct answer: <em className="font-medium text-slate-700">{r.correct_answer}</em>
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {onOpenFull && (
        <div className="flex justify-center border-t border-slate-100 pt-4">
          <button
            onClick={() => onOpenFull(test)}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            View full results
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Submit confirm overlay ────────────────────────────────────────────────────

function SubmitConfirm({
  total, answered,
  onConfirm, onCancel,
  submitting,
}: {
  total: number; answered: number;
  onConfirm: () => void; onCancel: () => void;
  submitting: boolean;
}) {
  const unanswered = total - answered;
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-white/95 backdrop-blur-sm p-6"
      role="dialog" aria-modal aria-label="Confirm test submission">
      <div className="max-w-xs text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-50 to-emerald-50 ring-1 ring-teal-100">
          <Send className="h-7 w-7 text-teal-600" />
        </div>
        <h3 className="text-lg font-bold text-slate-900" style={{ fontFamily: "'DM Serif Display', serif" }}>
          Submit your test?
        </h3>
        <p className="mt-2 text-sm text-slate-500 leading-relaxed">
          {unanswered === 0
            ? "You've answered all questions. This action cannot be undone."
            : `You have ${unanswered} unanswered question${unanswered !== 1 ? 's' : ''}. You can go back and answer them, or submit now.`}
        </p>

        <div className="mt-2 flex items-center justify-center gap-3 text-xs text-slate-400">
          <span className="flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
            {answered} answered
          </span>
          {unanswered > 0 && (
            <span className="flex items-center gap-1">
              <AlertCircle className="h-3.5 w-3.5 text-amber-400" />
              {unanswered} skipped
            </span>
          )}
        </div>

        <div className="mt-5 flex flex-col gap-2">
          <button
            onClick={onConfirm}
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-teal-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 disabled:opacity-60"
          >
            {submitting
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Submitting…</>
              : <><Send className="h-4 w-4" /> Confirm &amp; Submit</>}
          </button>
          <button
            onClick={onCancel}
            disabled={submitting}
            className="w-full rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 disabled:opacity-60"
          >
            Continue reviewing
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

type TestPhase = 'intro' | 'playing' | 'confirm' | 'submitted';
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

export default function TestSection({
  test, attempt, onSubmitTest, onOpenFull, loading = false,
}: TestSectionProps) {
  const [phase, setPhase]           = useState<TestPhase>(attempt ? 'submitted' : 'intro');
  const [currentQ, setCurrentQ]     = useState(0);
  const [answers, setAnswers]       = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [localAttempt, setLocalAttempt] = useState<TestAttempt | null>(attempt);
  const cardRef = useRef<HTMLDivElement>(null);

  // Timer
  const timerActive = phase === 'playing';
  const { label: timerLabel, pct: timerPct, urgent: timerUrgent, expired: timerExpired }
    = useCountdown(test.time_limit_minutes, timerActive);

  // Auto-submit when time expires
  useEffect(() => {
    if (timerExpired && phase === 'playing') handleSubmit();
  }, [timerExpired]);

  useEffect(() => {
    setLocalAttempt(attempt);
    if (attempt) setPhase('submitted');
  }, [attempt]);

  const questions = useMemo(() =>
    (test.questions ?? []).slice().sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)),
  [test.questions]);

  const totalQ   = questions.length;
  const question = questions[currentQ] ?? null;
  const isLast   = currentQ === totalQ - 1;
  const answeredCount = Object.keys(answers).length;
  const allAnswered = totalQ > 0 && questions.every((q) => !!answers[String(q.id)]);

  const handleStart = () => {
    setPhase('playing');
    setCurrentQ(0);
    setAnswers({});
    setSubmitError(null);
  };

  const handleSelect = useCallback((optionId: string) => {
    if (!question) return;
    setAnswers((prev) => ({ ...prev, [String(question.id)]: optionId }));
  }, [question]);

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    setPhase('confirm');
    try {
      const result = await onSubmitTest({ test_id: test.id, answers });
      const done: TestAttempt = {
        ...(result as TestAttempt ?? {}),
        status: 'completed',
        submitted_at: new Date().toISOString(),
      };
      setLocalAttempt(done);
      setPhase('submitted');
    } catch (err: any) {
      setSubmitError(err?.message ?? 'Submission failed. Please try again.');
      setPhase('playing');
    } finally {
      setSubmitting(false);
    }
  };

  const scrollTop = () => {
    cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const goToQ = (i: number) => { setCurrentQ(i); scrollTop(); };

  // ── Skeleton ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <section aria-label="Test" className="pt-2">
        <div className="animate-pulse space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-slate-200" />
            <div className="h-5 w-16 rounded bg-slate-200" />
          </div>
          <div className="h-64 rounded-2xl bg-slate-100" />
        </div>
      </section>
    );
  }

  return (
    <>
      {/* Inject fonts */}
      <style>{FONTS}</style>

      <section aria-label="Test" className="pt-2" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
        {/* ── Section header ─────────────────────────────────────────────── */}
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
            <ClipboardList className="h-4 w-4" />
          </span>
          <h2 className="text-base font-semibold text-slate-900">Test</h2>
          {localAttempt && (
            <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Completed
            </span>
          )}
        </div>

        {/* ── Card ───────────────────────────────────────────────────────── */}
        <div
          ref={cardRef}
          className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_1px_4px_0_rgba(0,0,0,0.06)]"
        >
          {/* Confirm overlay */}
          {phase === 'confirm' && (
            <SubmitConfirm
              total={totalQ}
              answered={answeredCount}
              onConfirm={handleSubmit}
              onCancel={() => setPhase('playing')}
              submitting={submitting}
            />
          )}

          {/* ── INTRO phase ─────────────────────────────────────────────── */}
          {phase === 'intro' && (
            <div className="p-6 space-y-5">
              {/* Title block */}
              <div>
                <h3
                  className="text-xl font-black leading-snug text-slate-900"
                  style={{ fontFamily: "'DM Serif Display', serif" }}
                >
                  {test.title}
                </h3>
                {test.description && (
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{test.description}</p>
                )}
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {test.time_limit_minutes && (
                  <StatChip icon={Clock} label="Time limit" value={`${test.time_limit_minutes} min`} color="teal" />
                )}
                {totalQ > 0 && (
                  <StatChip icon={ClipboardList} label="Questions" value={totalQ} color="slate" />
                )}
                {test.passing_score != null && (
                  <StatChip icon={Target} label="Pass mark" value={`${test.passing_score}%`} color="emerald" />
                )}
                {(test.settings?.max_attempts ?? 0) > 0 && (
                  <StatChip icon={RotateCcw} label="Attempts" value={`×${test.settings!.max_attempts}`} color="amber" />
                )}
              </div>

              {/* Instructions */}
              {test.instructions && (
                <div className="rounded-xl border border-sky-100 bg-sky-50 px-4 py-3.5">
                  <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-sky-600">
                    <Zap className="h-3.5 w-3.5" />
                    Instructions
                  </p>
                  <p className="text-sm leading-relaxed text-sky-900">{test.instructions}</p>
                </div>
              )}

              {/* CTA */}
              <div className="flex items-center justify-between border-t border-slate-100 pt-4">
                <p className="text-xs text-slate-400">
                  {totalQ > 0
                    ? `${totalQ} question${totalQ !== 1 ? 's' : ''} — answer all, then submit.`
                    : 'Opens in full test view.'}
                </p>
                {totalQ === 0 && onOpenFull ? (
                  <button
                    onClick={() => onOpenFull(test)}
                    className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
                  >
                    Open test <ExternalLink className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <button
                    onClick={handleStart}
                    className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-emerald-100 transition-colors hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                  >
                    <Play className="h-4 w-4" />
                    Begin Test
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── PLAYING phase ───────────────────────────────────────────── */}
          {(phase === 'playing' || phase === 'confirm') && question && (
            <div>
              {/* Header bar */}
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/80 px-5 py-3">
                <div className="flex items-center gap-2.5">
                  <span className="text-xs font-bold tabular-nums text-slate-500">
                    {currentQ + 1}
                    <span className="font-normal text-slate-300"> / </span>
                    {totalQ}
                  </span>
                  <div className="h-3.5 w-px bg-slate-200" />
                  <span className="text-xs text-slate-400">
                    <span className="font-semibold text-teal-600">{answeredCount}</span> answered
                  </span>
                </div>
                {test.time_limit_minutes && (
                  <TimerRing label={timerLabel} pct={timerPct} urgent={timerUrgent} />
                )}
              </div>

              {/* Progress strip */}
              <div className="px-5 pt-3 pb-0">
                <ProgressStrip
                  total={totalQ}
                  current={currentQ}
                  answers={answers}
                  questions={questions}
                  onJump={goToQ}
                  disabled={submitting}
                />
              </div>

              {/* Question body */}
              <div className="px-5 pt-5 pb-4 space-y-4">
                {/* Question number */}
                <div className="flex items-center gap-2">
                  <span className="rounded-lg bg-teal-50 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-teal-600">
                    Question {currentQ + 1}
                  </span>
                </div>

                {/* Question text */}
                <p
                  className="text-[17px] font-medium leading-relaxed text-slate-900"
                  style={{ fontFamily: "'DM Serif Display', serif" }}
                >
                  {question.question_text ?? question.text ?? `Question ${currentQ + 1}`}
                </p>

                {/* Options */}
                <div role="radiogroup" aria-label={`Options for question ${currentQ + 1}`} className="space-y-2.5">
                  {(question.options ?? []).map((opt, oi) => {
                    const optId = String(opt.id);
                    const label = opt.option_text ?? opt.text ?? '';
                    return (
                      <AnswerOption
                        key={opt.id}
                        optId={optId}
                        label={label}
                        letter={LETTERS[oi] ?? String(oi + 1)}
                        isSelected={answers[String(question.id)] === optId}
                        isDisabled={submitting || phase === 'confirm'}
                        onSelect={() => handleSelect(optId)}
                      />
                    );
                  })}
                </div>

                {submitError && (
                  <div className="flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {submitError}
                  </div>
                )}
              </div>

              {/* Jump navigator (≤ 20 questions) */}
              {totalQ <= 20 && totalQ > 1 && (
                <div className="mx-5 mb-1 flex flex-wrap justify-center gap-1.5 border-t border-slate-100 pt-3">
                  {questions.map((q, i) => {
                    const isAnswered = !!answers[String(q.id)];
                    const isCurrent = i === currentQ;
                    return (
                      <button
                        key={q.id}
                        onClick={() => goToQ(i)}
                        disabled={submitting}
                        title={`Question ${i + 1}${isAnswered ? ' (answered)' : ''}`}
                        aria-label={`Go to question ${i + 1}`}
                        className={[
                          'flex h-7 w-7 items-center justify-center rounded-lg text-[11px] font-bold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400',
                          isCurrent
                            ? 'bg-teal-600 text-white shadow-sm'
                            : isAnswered
                            ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200',
                        ].join(' ')}
                      >
                        {i + 1}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Navigation footer */}
              <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-5 py-4">
                <button
                  disabled={currentQ === 0 || submitting}
                  onClick={() => goToQ(currentQ - 1)}
                  className={[
                    'flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-sm font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400',
                    currentQ === 0 || submitting
                      ? 'cursor-not-allowed border-slate-100 text-slate-300'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50',
                  ].join(' ')}
                >
                  <ChevronLeft className="h-4 w-4" /> Previous
                </button>

                {!isLast ? (
                  <button
                    onClick={() => goToQ(currentQ + 1)}
                    disabled={submitting}
                    className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition-all hover:border-teal-300 hover:bg-teal-50 hover:text-teal-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 disabled:opacity-40"
                  >
                    Next <ChevronRight className="h-4 w-4" />
                  </button>
                ) : (
                  <button
                    onClick={() => setPhase('confirm')}
                    disabled={submitting}
                    className={[
                      'flex items-center gap-2 rounded-xl px-5 py-2 text-sm font-semibold shadow-sm transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400',
                      !allAnswered
                        ? 'bg-teal-50 text-teal-600 border border-teal-200 hover:bg-teal-100'
                        : 'bg-teal-600 text-white shadow-teal-100 hover:bg-teal-700',
                      submitting ? 'opacity-60 cursor-not-allowed' : '',
                    ].join(' ')}
                  >
                    <Send className="h-4 w-4" />
                    {allAnswered ? 'Submit Test' : 'Review & Submit'}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── SUBMITTED phase ─────────────────────────────────────────── */}
          {phase === 'submitted' && localAttempt && (
            <div className="p-6">
              <ResultsView
                test={test}
                attempt={localAttempt}
                onOpenFull={onOpenFull}
              />
            </div>
          )}
        </div>
      </section>
    </>
  );
}
