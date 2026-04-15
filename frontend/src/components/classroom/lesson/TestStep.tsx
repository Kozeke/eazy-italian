/**
 * TestStep.tsx  (v3 — POST /tests/:id/start for runtime question loading)
 *
 * What changed from v2:
 * ─────────────────────
 * • Questions are NO LONGER expected to already exist on `test.questions`.
 *   The unit manifest only carries test metadata (id, title, time_limit_minutes).
 *
 * • When the student clicks "Begin test", TestStep calls `onStartTest` which
 *   hits POST /api/v1/tests/:testId/start.  The response contains the full
 *   question payload with runtime attempt data.
 *
 * • Phase machine gains two new phases:
 *     'idle'    – initial state before the student starts (shows IntroPanel)
 *     'loading' – POST /start is in flight (shows spinner inside the card)
 *   The existing phases (answering / confirming / submitting / results) are
 *   unchanged.
 *
 * • The `onStartTest` prop is required.  It replaces the old `onOpenFull`
 *   fallback as the primary path.  `onOpenFull` is kept only for the rare
 *   case where `onStartTest` itself throws AND we have no questions at all.
 *
 * • `StartedTestData` captures the shape returned by POST /tests/:id/start:
 *     { attempt_id, test_id, questions, time_limit_minutes, total_points }
 *   Questions use the backend format: prompt (rich), type, options.
 *
 * • `RuntimeQuestion` normalises the backend question shape so QuestionSlide
 *   and QuestionNavBar continue to work without change.
 *
 * • NoQuestionsGate is now only shown when onStartTest failed AND there are
 *   no cached questions — it no longer renders on initial mount.
 *
 * • All UI, styling, animation, ScoreRing, ResultsPanel, ProgressBar,
 *   JumpDots, QuestionSlide, ConfirmationOverlay, and submit logic are
 *   preserved exactly.
 */

import React, {
  useState, useCallback, useEffect, useRef, useMemo,
} from 'react';
import {
  ClipboardList, Clock, CheckCircle2, XCircle,
  ChevronLeft, ChevronRight, Send, Loader2, AlertCircle,
  Award, Play, ArrowRight, ChevronDown,
  BookOpen, Sparkles, RefreshCw,
} from 'lucide-react';

// Phase-4: dispatcher renders the correct player for each question type.
import QuestionRenderer, {
  type StudentAnswer,
  type RuntimeQuestion as RendererQuestion,
} from './exercise/QuestionRenderer';

// ─── Backend question shape (from POST /tests/:id/start) ─────────────────────

interface BackendOption {
  id:          number;
  text?:       string;
  option_text?: string;
  is_correct?: boolean;
}

interface BackendQuestion {
  id:           number;
  type:         string;          // 'multiple_choice' | 'cloze' | 'visual' | …
  prompt?:      string;          // rich text / plain text question body
  question_text?: string;        // fallback alias some responses use
  text?:        string;          // another fallback alias
  options?:     BackendOption[];
  order_index?: number;
  score?:       number;
  answer_type?: string;          // for 'visual' questions
  gaps_count?:  number;          // for 'cloze' questions
  media?:       Array<{ url: string; type: string }>;
  // Phase-4 fields
  gaps_config?: Array<{ id: string; answers: string[]; case_sensitive?: boolean; score?: number }>;
  question_metadata?: Record<string, unknown>;
  template?: string;
}

/** Shape returned by POST /api/v1/tests/:testId/start */
interface StartedTestData {
  attempt_id:         number;
  test_id:            number;
  test_title?:        string;
  time_limit_minutes?: number | null;
  started_at?:        string;
  questions:          BackendQuestion[];
  total_points?:      number;
}

// ─── Normalised runtime question ──────────────────────────────────────────────

export interface TestQuestion {
  id:              number;
  question_text?:  string;
  text?:           string;
  type?:           string;
  order_index?:    number;
  options?:        Array<{
    id:           number | string;
    text?:        string;
    option_text?: string;
    is_correct?:  boolean;
  }>;
  correct_answer?: string;
  /** raw rich prompt from backend */
  prompt?:         string;
  /** for gap-fill / cloze questions */
  gaps_count?:     number;
  // Phase-4 extras
  gaps_config?:    Array<{ id: string; answers: string[]; case_sensitive?: boolean; score?: number }>;
  question_metadata?: Record<string, unknown>;
  template?: string;
}

/** Normalise a BackendQuestion into a TestQuestion understood by QuestionRenderer */
function normaliseQuestion(q: BackendQuestion): TestQuestion {
  return {
    id:           q.id,
    // Unify prompt / question_text / text into question_text for display
    question_text: q.prompt ?? q.question_text ?? q.text,
    text:          q.text,
    prompt:        q.prompt,
    type:          q.type,
    order_index:   q.order_index,
    options:       q.options as TestQuestion['options'],
    gaps_count:    q.gaps_count,
    // Phase-4 passthrough
    gaps_config:        q.gaps_config,
    question_metadata:  q.question_metadata,
    template:           q.template,
  };
}

// ─── Public types ─────────────────────────────────────────────────────────────

export interface StudentTest {
  id:                  number;
  title:               string;
  description?:        string | null;
  instructions?:       string | null;
  status?:             string;
  time_limit_minutes?: number | null;
  passing_score?:      number | null;
  questions_count?:    number | null;
  /** Unit manifest does NOT include full questions — use onStartTest to load */
  questions?:          TestQuestion[];
  settings?: {
    max_attempts?:      number;
    show_results?:      boolean;
    shuffle_questions?: boolean;
    shuffle_options?:   boolean;
    [key: string]:      unknown;
  };
  unit_id?: number;
}

export interface TestAttempt {
  id?:           number;
  status?:       string;
  score?:        number | null;
  passed?:       boolean | null;
  submitted_at?: string;
  answers?:      Record<string, unknown>;
  review?:       Array<{
    question_id:      number;
    correct:          boolean;
    selected_option?: string;
    correct_answer?:  string;
  }>;
}

export interface TestStepProps {
  test:     StudentTest;
  attempt:  TestAttempt | null;

  /**
   * PRIMARY PATH — calls POST /api/v1/tests/:testId/start.
   * Returns StartedTestData with full question payload.
   * Called when the student clicks "Begin test".
   */
  onStartTest:  (testId: number) => Promise<StartedTestData>;

  /** Submit answers to POST /api/v1/tests/:testId/submit */
  onSubmitTest: (payload: { test_id: number; answers: Record<string, string> }) => Promise<TestAttempt | void>;

  /**
   * Last-resort fallback — only shown when onStartTest fails AND there are
   * no cached questions at all.
   */
  onOpenFull?:    (test: StudentTest) => void;
  loading?:       boolean;
  nextStepLabel?: string;
  onContinue?:    () => void;
}

// ─── Phase type ───────────────────────────────────────────────────────────────

type Phase = 'idle' | 'loading' | 'answering' | 'confirming' | 'submitting' | 'results';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function scoreColor(score: number, passing: number | null): {
  ring: string; text: string; bg: string; bar: string;
} {
  const pass = passing ?? 60;
  if (score >= pass) return {
    ring: 'stroke-emerald-400',
    text: 'text-emerald-600',
    bg:   'bg-emerald-50',
    bar:  'bg-emerald-400',
  };
  if (score >= pass * 0.75) return {
    ring: 'stroke-amber-400',
    text: 'text-amber-600',
    bg:   'bg-amber-50',
    bar:  'bg-amber-400',
  };
  return {
    ring: 'stroke-red-400',
    text: 'text-red-600',
    bg:   'bg-red-50',
    bar:  'bg-red-400',
  };
}

// ─── ScoreRing ────────────────────────────────────────────────────────────────

function ScoreRing({ score, passed }: { score: number; passed: boolean | null }) {
  const radius    = 44;
  const circ      = 2 * Math.PI * radius;
  const fraction  = Math.min(Math.max(score / 100, 0), 1);
  const dashArray = `${(circ * fraction).toFixed(1)} ${circ.toFixed(1)}`;
  const ringCls   = passed === false ? 'stroke-red-400' : passed ? 'stroke-emerald-400' : 'stroke-amber-400';
  const textCls   = passed === false ? 'text-red-600' : passed ? 'text-emerald-700' : 'text-amber-600';

  return (
    <div className="relative flex items-center justify-center" style={{ width: 108, height: 108 }}>
      <svg width="108" height="108" viewBox="0 0 108 108" className="-rotate-90">
        <circle cx="54" cy="54" r={radius} fill="none" strokeWidth="8" className="stroke-slate-100" />
        <circle
          cx="54" cy="54" r={radius}
          fill="none" strokeWidth="8"
          strokeLinecap="round"
          className={`${ringCls} transition-all duration-1000 ease-out`}
          strokeDasharray={dashArray}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-[22px] font-extrabold tabular-nums leading-none ${textCls}`}>
          {Math.round(score)}%
        </span>
        <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">score</span>
      </div>
    </div>
  );
}

// ─── ProgressBar ──────────────────────────────────────────────────────────────

function ProgressBar({ answered, total }: { answered: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((answered / total) * 100);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Progress</span>
        <span className="text-[11px] font-bold tabular-nums text-slate-500">
          {answered}<span className="font-normal text-slate-300"> / {total}</span>
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-emerald-400 transition-all duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ─── JumpDots ─────────────────────────────────────────────────────────────────

function JumpDots({
  questions, answers, current, onJump, disabled,
}: {
  questions: TestQuestion[];
  answers:   Record<string, StudentAnswer>;
  current:   number;
  onJump:    (i: number) => void;
  disabled:  boolean;
}) {
  if (questions.length > 20) return null;
  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5">
      {questions.map((q, i) => {
        const answered  = !!answers[String(q.id)];
        const isCurrent = i === current;
        return (
          <button
            key={q.id}
            onClick={() => onJump(i)}
            disabled={disabled}
            title={`Question ${i + 1}${answered ? ' (answered)' : ''}`}
            className={[
              'rounded-full transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400',
              isCurrent
                ? 'h-2.5 w-6 bg-emerald-500'
                : answered
                ? 'h-2.5 w-2.5 bg-emerald-300 hover:bg-emerald-400'
                : 'h-2.5 w-2.5 bg-slate-200 hover:bg-slate-300',
            ].join(' ')}
          />
        );
      })}
    </div>
  );
}

// ─── MetaChip ─────────────────────────────────────────────────────────────────

function MetaChip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11.5px] font-medium text-slate-500">
      {icon}
      {label}
    </span>
  );
}

// ─── IntroPanel ───────────────────────────────────────────────────────────────

function IntroPanel({
  test,
  totalQ,
  onStart,
  startError,
  onRetryStart,
}: {
  test:          StudentTest;
  totalQ:        number;
  onStart:       () => void;
  startError?:   string | null;
  onRetryStart?: () => void;
}) {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <h3 className="text-[17px] font-bold leading-snug tracking-tight text-slate-900">
          {test.title}
        </h3>
        {test.description && (
          <p className="text-[13.5px] leading-relaxed text-slate-500">{test.description}</p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {totalQ > 0 && (
          <MetaChip
            icon={<ClipboardList className="h-3 w-3" />}
            label={`${totalQ} question${totalQ !== 1 ? 's' : ''}`}
          />
        )}
        {test.time_limit_minutes && (
          <MetaChip
            icon={<Clock className="h-3 w-3" />}
            label={formatDuration(test.time_limit_minutes)}
          />
        )}
        {test.passing_score != null && (
          <MetaChip
            icon={<Award className="h-3 w-3" />}
            label={`Pass: ${test.passing_score}%`}
          />
        )}
      </div>

      {test.instructions && (
        <div className="relative rounded-xl overflow-hidden">
          <div className="absolute inset-y-0 left-0 w-[3px] rounded-l-xl bg-gradient-to-b from-emerald-400 to-emerald-300" />
          <div className="pl-5 pr-4 py-3.5 bg-emerald-50/60 text-[13.5px] leading-[1.7] text-emerald-950">
            {test.instructions}
          </div>
        </div>
      )}

      {/* Start error message */}
      {startError && (
        <div className="flex items-start gap-3 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-[13px] text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
          <div className="flex-1 space-y-1">
            <p className="font-medium">Could not load test questions</p>
            <p className="text-red-500 text-[12px]">{startError}</p>
          </div>
          {onRetryStart && (
            <button
              onClick={onRetryStart}
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-red-200 bg-white px-2.5 py-1 text-[12px] font-semibold text-red-600 hover:bg-red-50 transition-colors focus:outline-none"
            >
              <RefreshCw className="h-3 w-3" />
              Retry
            </button>
          )}
        </div>
      )}

      <div className="pt-1">
        <button
          onClick={onStart}
          className={[
            'group flex w-full items-center justify-center gap-2.5 rounded-xl px-5 py-3',
            'bg-gradient-to-r from-emerald-600 to-emerald-500 text-[13.5px] font-bold text-white',
            'shadow-md shadow-emerald-200/60 transition-all duration-200',
            'hover:from-emerald-700 hover:to-emerald-600 hover:shadow-lg hover:shadow-emerald-200/60',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2',
            'active:scale-[0.98]',
          ].join(' ')}
        >
          <Play className="h-4 w-4" />
          {startError ? 'Try again' : 'Begin test'}
        </button>
      </div>
    </div>
  );
}

// ─── LoadingPanel ─────────────────────────────────────────────────────────────

function LoadingPanel({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center gap-4 py-10">
      <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
      <div className="space-y-1 text-center">
        <p className="text-[14px] font-semibold text-slate-700">{title}</p>
        <p className="text-[12px] text-slate-400">Loading questions…</p>
      </div>
    </div>
  );
}

// ─── QuestionSlide ────────────────────────────────────────────────────────────

function QuestionSlide({
  question, index, total, selected, onSelect, disabled,
}: {
  question: TestQuestion;
  index:    number;
  total:    number;
  selected: string | null;
  onSelect: (id: string) => void;
  disabled: boolean;
}) {
  // Normalise display text: prompt > question_text > text > fallback
  const text    = question.prompt ?? question.question_text ?? question.text ?? `Question ${index + 1}`;
  const options = question.options ?? [];

  return (
    <div className="space-y-4 test-step-question-enter">
      <p className="text-[15px] font-bold leading-snug text-slate-900">
        <span className="mr-2 tabular-nums text-[13px] font-normal text-slate-400">
          {index + 1}/{total}
        </span>
        {/* Render prompt as HTML if it contains tags, else plain */}
        {text && text.includes('<') ? (
          <span dangerouslySetInnerHTML={{ __html: text }} />
        ) : (
          text
        )}
      </p>
      {options.length > 0 ? (
        <div className="space-y-2">
          {options.map((opt) => {
            const optId   = String(opt.id);
            const optText = opt.option_text ?? opt.text ?? '';
            const isSel   = selected === optId;
            return (
              <label
                key={opt.id}
                className={[
                  'group flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3',
                  'text-[13.5px] leading-relaxed transition-all duration-150 select-none',
                  'focus-within:ring-2 focus-within:ring-emerald-400/50',
                  disabled ? 'cursor-default' : 'hover:shadow-sm',
                  isSel
                    ? 'border-emerald-400 bg-emerald-50 text-emerald-900 shadow-[0_0_0_1px_theme(colors.emerald.300/30)]'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50/80',
                ].join(' ')}
              >
                <span
                  className={[
                    'mt-[3px] flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-all',
                    isSel
                      ? 'border-emerald-500 bg-emerald-500'
                      : 'border-slate-300 bg-white group-hover:border-slate-400',
                  ].join(' ')}
                >
                  {isSel && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                </span>
                <input
                  type="radio"
                  name={`test-q-${question.id}`}
                  value={optId}
                  checked={isSel}
                  onChange={() => !disabled && onSelect(optId)}
                  disabled={disabled}
                  className="sr-only"
                />
                <span className="flex-1">{optText}</span>
              </label>
            );
          })}
        </div>
      ) : (
        /* Cloze / open-ended fallback — single text input */
        <input
          type="text"
          value={selected ?? ''}
          onChange={(e) => !disabled && onSelect(e.target.value)}
          disabled={disabled}
          placeholder="Your answer…"
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[13.5px] text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/40 focus:border-emerald-400 disabled:opacity-60"
        />
      )}
    </div>
  );
}

// ─── QuestionNavBar ───────────────────────────────────────────────────────────

function QuestionNavBar({
  current, total, answeredCount, canSubmit, isLast,
  onPrev, onNext, onSubmit, submitting,
}: {
  current:       number;
  total:         number;
  answeredCount: number;
  canSubmit:     boolean;
  isLast:        boolean;
  onPrev:        () => void;
  onNext:        () => void;
  onSubmit:      () => void;
  submitting:    boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <button
        type="button"
        onClick={onPrev}
        disabled={current === 0}
        className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[12.5px] font-semibold text-slate-500 shadow-sm transition-all hover:border-slate-300 hover:text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
      >
        <ChevronLeft className="h-4 w-4" />
        Prev
      </button>

      {isLast ? (
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit || submitting}
          className={[
            'flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5',
            'text-[13px] font-bold transition-all duration-150',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2',
            'active:scale-[0.97]',
            canSubmit && !submitting
              ? 'bg-emerald-600 text-white shadow-md shadow-emerald-200/60 hover:bg-emerald-700'
              : 'bg-slate-100 text-slate-400 cursor-not-allowed',
          ].join(' ')}
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          {submitting ? 'Submitting…' : `Review & submit (${answeredCount}/${total})`}
        </button>
      ) : (
        <button
          type="button"
          onClick={onNext}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[13px] font-semibold text-slate-600 shadow-sm transition-all hover:border-slate-300 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

// ─── ConfirmationOverlay ──────────────────────────────────────────────────────

function ConfirmationOverlay({
  answered, total, onConfirm, onBack, submitting,
}: {
  answered:   number;
  total:      number;
  onConfirm:  () => void;
  onBack:     () => void;
  submitting: boolean;
}) {
  const allAnswered = answered === total;
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-emerald-500" />
          <p className="text-[14px] font-bold text-slate-800">Ready to submit?</p>
        </div>
        <div className="flex items-center gap-2">
          {allAnswered ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
          )}
          <p className={`text-[13px] ${allAnswered ? 'text-emerald-700' : 'text-amber-700'}`}>
            {allAnswered
              ? `All ${total} questions answered`
              : `${answered} of ${total} questions answered — ${total - answered} unanswered`}
          </p>
        </div>
        {!allAnswered && (
          <p className="text-[12px] text-slate-400 pl-6">
            You can still submit — unanswered questions will be marked incorrect.
          </p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          disabled={submitting}
          className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[13px] font-semibold text-slate-600 shadow-sm transition-all hover:border-slate-300 disabled:opacity-50 focus:outline-none"
        >
          <ChevronLeft className="h-4 w-4" />
          Go back
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={submitting}
          className={[
            'flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5',
            'text-[13px] font-bold text-white transition-all duration-150',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2',
            'active:scale-[0.97]',
            submitting
              ? 'bg-emerald-400 cursor-not-allowed'
              : 'bg-emerald-600 shadow-md shadow-emerald-200/60 hover:bg-emerald-700',
          ].join(' ')}
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          {submitting ? 'Submitting…' : 'Submit test'}
        </button>
      </div>
    </div>
  );
}

// ─── ResultsPanel ─────────────────────────────────────────────────────────────

function ResultsPanel({
  test, attempt, questions, answers, nextStepLabel, onContinue,
}: {
  test:           StudentTest;
  attempt:        TestAttempt;
  questions:      TestQuestion[];
  answers:        Record<string, StudentAnswer>;
  nextStepLabel?: string;
  onContinue?:    () => void;
}) {
  const score   = attempt.score ?? null;
  const passed  = attempt.passed ?? null;
  const colors  = score != null ? scoreColor(score, test.passing_score ?? null) : null;
  const review  = attempt.review ?? [];
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  return (
    <div className="space-y-5 test-step-question-enter">

      {/* ── Score summary ───────────────────────────────────────────────── */}
      <div className={[
        'flex items-center justify-center gap-6 rounded-2xl p-5',
        colors?.bg ?? 'bg-slate-50',
        'border border-slate-100',
      ].join(' ')}>
        {score != null && (
          <ScoreRing score={score} passed={passed} />
        )}
        <div className="space-y-2">
          <div className={[
            'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-bold',
            passed === true
              ? 'bg-emerald-100 text-emerald-700'
              : passed === false
              ? 'bg-red-100 text-red-700'
              : 'bg-slate-100 text-slate-600',
          ].join(' ')}>
            {passed === true
              ? <><CheckCircle2 className="h-3.5 w-3.5" />Passed</>
              : passed === false
              ? <><XCircle className="h-3.5 w-3.5" />Not passed</>
              : <><BookOpen className="h-3.5 w-3.5" />Submitted</>
            }
          </div>
          {test.passing_score != null && (
            <p className="text-[11.5px] text-slate-400">
              Pass mark: {test.passing_score}%
            </p>
          )}
        </div>
      </div>

      {/* ── Per-question review accordion ──────────────────────────────── */}
      {review.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400 px-1">
            Question review
          </p>
          {review.map((r, i) => {
            const q     = questions.find((qq) => qq.id === r.question_id);
            const qText = q?.prompt ?? q?.question_text ?? q?.text ?? `Question ${i + 1}`;
            const isOpen = openIdx === i;

            return (
              <div
                key={r.question_id}
                className={[
                  'rounded-xl border overflow-hidden transition-all',
                  r.correct ? 'border-emerald-100' : 'border-red-100',
                ].join(' ')}
              >
                <button
                  type="button"
                  onClick={() => setOpenIdx(isOpen ? null : i)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left"
                >
                  {r.correct
                    ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                    : <XCircle      className="h-4 w-4 shrink-0 text-red-400" />
                  }
                  <span className="flex-1 text-[13px] font-medium text-slate-800 leading-snug line-clamp-2">
                    {qText && qText.includes('<')
                      ? <span dangerouslySetInnerHTML={{ __html: qText }} />
                      : qText
                    }
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                  />
                </button>
                {isOpen && (
                  <div className={[
                    'border-t px-4 py-3 text-[12.5px] space-y-1',
                    r.correct ? 'border-emerald-100 bg-emerald-50/50' : 'border-red-100 bg-red-50/50',
                  ].join(' ')}>
                    {r.selected_option && (
                      <p className="text-slate-600">
                        Your answer: <span className="font-semibold">{r.selected_option}</span>
                      </p>
                    )}
                    {!r.correct && r.correct_answer && (
                      <p className="text-emerald-700">
                        Correct answer: <span className="font-semibold">{r.correct_answer}</span>
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Continue CTA ──────────────────────────────────────────────── */}
      {onContinue && (
        <div className="pt-1">
          <button
            onClick={onContinue}
            className={[
              'group flex w-full items-center justify-center gap-2.5 rounded-xl px-5 py-3',
              'bg-gradient-to-r from-emerald-600 to-emerald-500 text-[13.5px] font-bold text-white',
              'shadow-md shadow-emerald-200/60 transition-all duration-200',
              'hover:from-emerald-700 hover:to-emerald-600 hover:shadow-lg hover:shadow-emerald-200/60',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2',
              'active:scale-[0.98]',
            ].join(' ')}
          >
            {nextStepLabel ?? 'Continue lesson'}
            <ArrowRight className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5" />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function TestStepSkeleton() {
  return (
    <div className="animate-pulse space-y-4 pt-1">
      <div className="h-5 w-2/3 rounded-lg bg-slate-200" />
      <div className="flex gap-2">
        <div className="h-6 w-16 rounded-full bg-slate-100" />
        <div className="h-6 w-20 rounded-full bg-slate-100" />
      </div>
      <div className="h-48 rounded-xl bg-slate-100" />
    </div>
  );
}

// ─── StartFailedGate ──────────────────────────────────────────────────────────
/**
 * Shown only when onStartTest throws AND no cached questions exist.
 * This is a genuine failure state, not the normal "no questions yet" path.
 */
function StartFailedGate({
  test,
  error,
  onRetry,
  onOpenFull,
}: {
  test:        StudentTest;
  error:       string;
  onRetry:     () => void;
  onOpenFull?: (t: StudentTest) => void;
}) {
  return (
    <div className="rounded-xl border border-dashed border-red-200 bg-red-50/70 px-5 py-6 text-center space-y-3">
      <AlertCircle className="mx-auto h-8 w-8 text-red-400" />
      <p className="text-[13.5px] font-semibold text-slate-700">
        Could not load test questions
      </p>
      <p className="text-[12px] text-red-500">{error}</p>
      <div className="flex items-center justify-center gap-3 pt-1">
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[13px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50 hover:border-slate-300 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Retry
        </button>
        {onOpenFull && (
          <button
            onClick={() => onOpenFull(test)}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[13px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50 hover:border-slate-300 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
          >
            Open test
            <ChevronRight className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function TestStep({
  test,
  attempt,
  onStartTest,
  onSubmitTest,
  onOpenFull,
  loading,
  nextStepLabel,
  onContinue,
}: TestStepProps) {

  // ── Local attempt mirror ──────────────────────────────────────────────────
  const [localAttempt, setLocalAttempt] = useState<TestAttempt | null>(attempt ?? null);
  useEffect(() => {
    if (attempt) setLocalAttempt(attempt);
  }, [attempt]);

  // ── Runtime questions (loaded via POST /start) ────────────────────────────
  const [runtimeQuestions, setRuntimeQuestions] = useState<TestQuestion[]>(
    // Seed from test.questions if the unit manifest happens to include them
    // (fallback for edge cases; normally empty from unit manifest)
    (test.questions ?? []).map(q => q as TestQuestion),
  );

  // ── Start state ───────────────────────────────────────────────────────────
  const [startError, setStartError] = useState<string | null>(null);
  const [startFailed, setStartFailed] = useState(false);

  // ── Phase ─────────────────────────────────────────────────────────────────
  const initialPhase: Phase = localAttempt ? 'results' : 'idle';
  const [phase, setPhase]   = useState<Phase>(initialPhase);

  useEffect(() => {
    if (attempt && phase === 'idle') setPhase('results');
  }, [attempt]); // eslint-disable-line

  // ── Answer state ──────────────────────────────────────────────────────────
  const [answers,     setAnswers    ] = useState<Record<string, StudentAnswer>>({});
  const [currentQ,    setCurrentQ  ] = useState(0);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting,  setSubmitting ] = useState(false);
  const confirmedRef = useRef(false);

  const questions = useMemo(
    () => [...runtimeQuestions].sort(
      (a, b) => (a.order_index ?? 0) - (b.order_index ?? 0),
    ),
    [runtimeQuestions],
  );

  const question    = questions[currentQ] ?? null;
  const isLast      = currentQ === questions.length - 1;
  const allAnswered = questions.length > 0 && questions.every((q) => !!answers[String(q.id)]);
  const answered    = Object.keys(answers).length;
  // Use loaded count or manifest hint for display before questions load
  const totalQ      = questions.length || (test.questions_count ?? 0);

  // ── Begin Test — calls POST /tests/:id/start ──────────────────────────────
  const handleBeginTest = useCallback(async () => {
    setStartError(null);
    setStartFailed(false);
    setPhase('loading');
    try {
      const data = await onStartTest(test.id);
      const normalised = (data.questions ?? []).map(normaliseQuestion);
      if (normalised.length === 0) {
        throw new Error('The server returned no questions for this test.');
      }
      setRuntimeQuestions(normalised);
      setAnswers({});
      setCurrentQ(0);
      setPhase('answering');
    } catch (err: any) {
      const msg = err?.message ?? 'Failed to load test questions. Please try again.';
      setStartError(msg);
      setStartFailed(true);
      setPhase('idle');
    }
  }, [onStartTest, test.id]);

  // ── Question navigation ───────────────────────────────────────────────────
  const handleSelect = useCallback((answer: StudentAnswer) => {
    if (!question) return;
    setAnswers((prev) => ({ ...prev, [String(question.id)]: answer }));
  }, [question]);

  const handleNext = useCallback(() => {
    setCurrentQ((q) => Math.min(q + 1, questions.length - 1));
  }, [questions.length]);

  const handlePrev = useCallback(() => {
    setCurrentQ((q) => Math.max(q - 1, 0));
  }, []);

  const handleReviewAndSubmit = useCallback(() => {
    setPhase('confirming');
  }, []);

  const handleBackToAnswering = useCallback(() => {
    setPhase('answering');
  }, []);

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleConfirmSubmit = useCallback(async () => {
    if (submitting || confirmedRef.current) return;
    setSubmitting(true);
    setSubmitError(null);
    setPhase('submitting');
    try {
      const result = await onSubmitTest({
        test_id: test.id,
        answers: Object.fromEntries(
          Object.entries(answers).map(([k, v]) => [
            k,
            typeof v === 'string' ? v : JSON.stringify(v),
          ]),
        ),
      });
      const resolved: TestAttempt = (result as TestAttempt) ?? {
        status:       'completed',
        submitted_at: new Date().toISOString(),
        answers,
      };
      setLocalAttempt(resolved);
      confirmedRef.current = true;
      setPhase('results');
    } catch (err: any) {
      setSubmitError(err?.message ?? 'Submission failed — please try again.');
      setPhase('confirming');
    } finally {
      setSubmitting(false);
    }
  }, [submitting, onSubmitTest, test.id, answers]);

  // ── Outer loading skeleton (parent-controlled) ────────────────────────────
  if (loading) return <TestStepSkeleton />;

  // ── Start completely failed and no questions cached ────────────────────────
  if (startFailed && questions.length === 0) {
    return (
      <StartFailedGate
        test={test}
        error={startError ?? 'Unknown error'}
        onRetry={handleBeginTest}
        onOpenFull={onOpenFull}
      />
    );
  }

  return (
    <>
      <style>{`
        @keyframes testStepQuestionEnter {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .test-step-question-enter {
          animation: testStepQuestionEnter 0.3s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
      `}</style>

      <div className="space-y-5 pt-1">

        {/* ── IDLE / INTRO ──────────────────────────────────────────────── */}
        {phase === 'idle' && (
          <IntroPanel
            test={test}
            totalQ={totalQ as number}
            onStart={handleBeginTest}
            startError={startError}
            onRetryStart={handleBeginTest}
          />
        )}

        {/* ── LOADING questions ─────────────────────────────────────────── */}
        {phase === 'loading' && (
          <LoadingPanel title={test.title} />
        )}

        {/* ── ANSWERING ─────────────────────────────────────────────────── */}
        {phase === 'answering' && question && (
          <>
            <ProgressBar answered={answered} total={questions.length} />

            {/* Phase-4: QuestionRenderer dispatches by type */}
            <div className="space-y-4 test-step-question-enter">
              <p className="text-[15px] font-bold leading-snug text-slate-900">
                <span className="mr-2 tabular-nums text-[13px] font-normal text-slate-400">
                  {currentQ + 1}/{questions.length}
                </span>
                {(() => {
                  const t = question.prompt ?? question.question_text ?? question.text ?? '';
                  return t.includes('<')
                    ? <span dangerouslySetInnerHTML={{ __html: t }} />
                    : t;
                })()}
              </p>
              <QuestionRenderer
                question={question as RendererQuestion}
                answer={answers[String(question.id)] ?? null}
                onAnswer={handleSelect}
                disabled={false}
              />
            </div>

            {submitError && (
              <div className="flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-[13px] text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {submitError}
              </div>
            )}

            <QuestionNavBar
              current={currentQ}
              total={questions.length}
              answeredCount={answered}
              canSubmit={allAnswered}
              isLast={isLast}
              onPrev={handlePrev}
              onNext={handleNext}
              onSubmit={handleReviewAndSubmit}
              submitting={false}
            />

            <JumpDots
              questions={questions}
              answers={answers}
              current={currentQ}
              onJump={setCurrentQ}
              disabled={false}
            />
          </>
        )}

        {/* ── CONFIRMING / SUBMITTING ────────────────────────────────────── */}
        {(phase === 'confirming' || phase === 'submitting') && (
          <>
            <ConfirmationOverlay
              answered={answered}
              total={questions.length}
              onConfirm={handleConfirmSubmit}
              onBack={handleBackToAnswering}
              submitting={submitting}
            />
            {submitError && (
              <div className="flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-[13px] text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {submitError}
              </div>
            )}
          </>
        )}

        {/* ── RESULTS ───────────────────────────────────────────────────── */}
        {phase === 'results' && localAttempt && (
          <ResultsPanel
            test={test}
            attempt={localAttempt}
            questions={questions}
            answers={answers}
            nextStepLabel={nextStepLabel}
            onContinue={onContinue}
          />
        )}

      </div>
    </>
  );
}