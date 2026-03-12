/**
 * TestSection.tsx
 *
 * Renders a test inline within the LessonWorkspace flow.
 *
 * Behaviour:
 * - "Not started" state: shows test meta (time, questions, passing score)
 *                        + instructions + "Begin Test" button
 * - "In progress" state: question-by-question flow with answer selection
 * - "Submitted" state: shows score, pass/fail, per-question review
 *
 * Design decisions:
 * - Reuses the same question rendering logic as the standalone test player
 *   but embedded inline (no routing, no separate page)
 * - Multiple-choice questions shown as radio cards (same UX as TaskSection MCQ)
 * - If a separate test player component exists in the codebase, swap the
 *   inline player body for that component — the section shell stays the same
 *
 * Props:
 *   test           — StudentTest from useStudentUnit
 *   attempt        — existing attempt (null = not yet started)
 *   onSubmitTest   — async callback; receives { test_id, answers } payload
 *   onOpenFull     — navigate to full test page (escape hatch)
 *   loading        — skeleton while test is loading
 *
 * Backend alignment:
 *   Payload sent to onSubmitTest mirrors the existing student test
 *   submission endpoint. No new API surface required.
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  ClipboardList, Clock, Percent, CheckCircle2, XCircle,
  ChevronLeft, ChevronRight, Send, Loader2, AlertCircle,
  ExternalLink, Award, Play,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

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
  status?: string;       // 'completed' | 'in_progress' | 'graded'
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

// ─── Question card ────────────────────────────────────────────────────────────

function QuestionCard({
  question,
  index,
  total,
  selected,
  onSelect,
  disabled,
  reviewResult,
}: {
  question: TestQuestion;
  index: number;
  total: number;
  selected: string | null;
  onSelect: (optionId: string) => void;
  disabled: boolean;
  reviewResult?: { correct: boolean; correct_answer?: string } | null;
}) {
  const text    = question.question_text ?? question.text ?? `Question ${index + 1}`;
  const options = question.options ?? [];

  return (
    <div className="space-y-4">
      {/* Progress */}
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span className="font-semibold tabular-nums text-slate-500">
          Question {index + 1} <span className="text-slate-300">of</span> {total}
        </span>
        <div className="flex gap-1">
          {Array.from({ length: total }).map((_, i) => (
            <span
              key={i}
              className={[
                'h-1.5 rounded-full transition-all',
                i < index
                  ? 'w-3 bg-primary-400'
                  : i === index
                  ? 'w-5 bg-primary-600'
                  : 'w-3 bg-slate-200',
              ].join(' ')}
            />
          ))}
        </div>
      </div>

      {/* Question text */}
      <p className="text-base font-medium leading-relaxed text-slate-900">{text}</p>

      {/* Options */}
      <div className="space-y-2.5">
        {options.map((opt) => {
          const optText   = opt.option_text ?? opt.text ?? '';
          const optId     = String(opt.id);
          const isSelected = selected === optId;
          const isReviewed = !!reviewResult;
          const isCorrect  = isReviewed && String(opt.is_correct) === 'true';
          const isWrong    = isReviewed && isSelected && !opt.is_correct;

          let cardCls = 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50';
          if (isSelected && !isReviewed) cardCls = 'border-primary-400 bg-primary-50 text-primary-900';
          if (isCorrect)  cardCls = 'border-emerald-400 bg-emerald-50 text-emerald-900';
          if (isWrong)    cardCls = 'border-red-300 bg-red-50 text-red-800';

          return (
            <label
              key={opt.id}
              className={[
                'flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 text-sm transition-all',
                disabled ? 'cursor-default' : '',
                cardCls,
              ].join(' ')}
            >
              <input
                type="radio"
                name={`test-q-${question.id}`}
                value={optId}
                checked={isSelected}
                onChange={() => !disabled && onSelect(optId)}
                disabled={disabled}
                className="mt-0.5 shrink-0 accent-primary-600"
              />
              <span className="flex-1 leading-relaxed">{optText}</span>
              {isCorrect  && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500 mt-0.5" />}
              {isWrong    && <XCircle      className="h-4 w-4 shrink-0 text-red-400 mt-0.5"    />}
            </label>
          );
        })}
      </div>
    </div>
  );
}

// ─── Results view ─────────────────────────────────────────────────────────────

function ResultsView({
  test,
  attempt,
  onOpenFull,
}: {
  test: StudentTest;
  attempt: TestAttempt;
  onOpenFull?: (t: StudentTest) => void;
}) {
  const score       = attempt.score ?? null;
  const passed      = attempt.passed;
  const passingScore = test.passing_score ?? null;
  const showResults = test.settings?.show_results !== false;

  return (
    <div className="space-y-4">
      {/* Score card */}
      <div className={[
        'flex items-center gap-4 rounded-xl border px-5 py-4',
        passed === true
          ? 'border-emerald-200 bg-emerald-50'
          : passed === false
          ? 'border-red-100 bg-red-50'
          : 'border-slate-200 bg-slate-50',
      ].join(' ')}>
        <Award className={[
          'h-8 w-8 shrink-0',
          passed === true  ? 'text-emerald-500' :
          passed === false ? 'text-red-400'     : 'text-slate-400',
        ].join(' ')} />

        <div className="flex-1">
          <p className={[
            'text-sm font-semibold',
            passed === true  ? 'text-emerald-800' :
            passed === false ? 'text-red-700'     : 'text-slate-700',
          ].join(' ')}>
            {passed === true ? 'Passed!' : passed === false ? 'Not passed' : 'Submitted'}
          </p>
          {attempt.submitted_at && (
            <p className="mt-0.5 text-xs text-slate-400">
              {new Date(attempt.submitted_at).toLocaleString()}
            </p>
          )}
        </div>

        {score != null && (
          <div className="text-right">
            <p className="text-2xl font-bold tabular-nums text-slate-900">{score}%</p>
            {passingScore != null && (
              <p className="text-xs text-slate-400">Pass: {passingScore}%</p>
            )}
          </div>
        )}
      </div>

      {/* Detailed review — only shown when show_results is enabled */}
      {showResults && attempt.review && attempt.review.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
            Review
          </p>
          {attempt.review.map((r, i) => (
            <div
              key={r.question_id}
              className={[
                'flex items-center gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm',
                r.correct
                  ? 'border-emerald-100 bg-emerald-50 text-emerald-800'
                  : 'border-red-100 bg-red-50 text-red-800',
              ].join(' ')}
            >
              {r.correct
                ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                : <XCircle      className="h-4 w-4 shrink-0 text-red-400"     />}
              <span>Question {i + 1}</span>
              {!r.correct && r.correct_answer && (
                <span className="ml-auto text-xs text-slate-500">
                  Answer: <em>{r.correct_answer}</em>
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {onOpenFull && (
        <div className="flex justify-end">
          <button
            onClick={() => onOpenFull(test)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
          >
            View full results
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type TestPhase = 'intro' | 'playing' | 'submitted';

export default function TestSection({
  test,
  attempt,
  onSubmitTest,
  onOpenFull,
  loading = false,
}: TestSectionProps) {
  const [phase, setPhase]       = useState<TestPhase>(attempt ? 'submitted' : 'intro');
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers]   = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [localAttempt, setLocalAttempt] = useState<TestAttempt | null>(attempt);

  // Sync prop → state
  useEffect(() => {
    setLocalAttempt(attempt);
    if (attempt) setPhase('submitted');
  }, [attempt]);

  const questions = (test.questions ?? [])
    .slice()
    .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));

  const totalQ   = questions.length;
  const question = questions[currentQ] ?? null;

  const canPrev  = currentQ > 0;
  const canNext  = currentQ < totalQ - 1;
  const isLast   = currentQ === totalQ - 1;

  const allAnswered = totalQ > 0 && questions.every((q) => !!answers[String(q.id)]);

  const handleStart = () => {
    setPhase('playing');
    setCurrentQ(0);
    setAnswers({});
  };

  const handleSelect = useCallback((optionId: string) => {
    if (!question) return;
    setAnswers((prev) => ({ ...prev, [String(question.id)]: optionId }));
  }, [question]);

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await onSubmitTest({ test_id: test.id, answers });
      const finishedAttempt: TestAttempt = {
        ...(result as TestAttempt ?? {}),
        status: 'completed',
        submitted_at: new Date().toISOString(),
      };
      setLocalAttempt(finishedAttempt);
      setPhase('submitted');
    } catch (err: any) {
      setSubmitError(err?.message ?? 'Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Skeleton ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <section aria-label="Test" className="pt-2">
        <div className="animate-pulse space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-slate-200" />
            <div className="h-5 w-16 rounded bg-slate-200" />
          </div>
          <div className="h-48 rounded-2xl bg-slate-100" />
        </div>
      </section>
    );
  }

  return (
    <section aria-label="Test" className="pt-2">
      {/* ── Section header ──────────────────────────────────────────────── */}
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
          <ClipboardList className="h-4 w-4" />
        </span>

        <div className="flex flex-1 items-baseline gap-2 min-w-0">
          <h2 className="text-base font-semibold text-slate-900">Test</h2>
        </div>

        {localAttempt && (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Completed
          </span>
        )}
      </div>

      {/* ── Card ─────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-sm space-y-5">

        {/* ── INTRO phase ─────────────────────────────────────────────── */}
        {phase === 'intro' && (
          <>
            <div>
              <h3 className="text-[17px] font-semibold leading-snug text-slate-900">{test.title}</h3>
              {test.description && (
                <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{test.description}</p>
              )}
            </div>

            {/* Stats */}
            <div className="flex flex-wrap gap-4 text-xs text-slate-500">
              {test.time_limit_minutes && (
                <span className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-slate-400" />
                  {test.time_limit_minutes} min
                </span>
              )}
              {totalQ > 0 && (
                <span className="flex items-center gap-1.5">
                  <ClipboardList className="h-3.5 w-3.5 text-slate-400" />
                  {totalQ} question{totalQ !== 1 ? 's' : ''}
                </span>
              )}
              {test.passing_score != null && (
                <span className="flex items-center gap-1.5">
                  <Percent className="h-3.5 w-3.5 text-slate-400" />
                  {test.passing_score}% to pass
                </span>
              )}
            </div>

            {/* Instructions */}
            {test.instructions && (
              <div className="rounded-lg border border-blue-100 bg-blue-50 px-3.5 py-3">
                <p className="mb-1 text-xs font-semibold text-blue-700">Instructions</p>
                <p className="text-sm leading-relaxed text-blue-900">{test.instructions}</p>
              </div>
            )}

            {/* If no inline questions, direct to full page */}
            {totalQ === 0 && onOpenFull ? (
              <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-4 text-center">
                <p className="text-sm text-slate-500">
                  This test requires the full test view.
                </p>
                <button
                  onClick={() => onOpenFull(test)}
                  className="mt-3 flex mx-auto items-center gap-1.5 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
                >
                  Open test
                  <ExternalLink className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between border-t border-slate-100 pt-4">
                <span className="text-xs text-slate-400">
                  Answer all questions, then submit.
                </span>
                <button
                  onClick={handleStart}
                  className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                >
                  <Play className="h-4 w-4" />
                  Begin Test
                </button>
              </div>
            )}
          </>
        )}

        {/* ── PLAYING phase ───────────────────────────────────────────── */}
        {phase === 'playing' && question && (
          <>
            <QuestionCard
              question={question}
              index={currentQ}
              total={totalQ}
              selected={answers[String(question.id)] ?? null}
              onSelect={handleSelect}
              disabled={submitting}
              reviewResult={null}
            />

            {submitError && (
              <div className="flex items-center gap-2 rounded-lg border border-red-100 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {submitError}
              </div>
            )}

            {/* Navigation */}
            <div className="flex items-center justify-between border-t border-slate-100 pt-4 gap-2">
              <button
                disabled={!canPrev || submitting}
                onClick={() => setCurrentQ((q) => q - 1)}
                className={[
                  'flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-sm font-medium transition-all',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400',
                  !canPrev || submitting
                    ? 'cursor-not-allowed border-slate-100 text-slate-300'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300',
                ].join(' ')}
              >
                <ChevronLeft className="h-4 w-4" />
                Prev
              </button>

              <span className="text-xs tabular-nums text-slate-400">
                {Object.keys(answers).length}&thinsp;/&thinsp;{totalQ} answered
              </span>

              {!isLast ? (
                <button
                  onClick={() => setCurrentQ((q) => q + 1)}
                  disabled={submitting}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 disabled:opacity-40"
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </button>
              ) : (
                <button
                  onClick={handleSubmit}
                  disabled={submitting || !allAnswered}
                  className={[
                    'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400',
                    submitting || !allAnswered
                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                      : 'bg-emerald-600 text-white shadow-sm hover:bg-emerald-700',
                  ].join(' ')}
                >
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  {submitting ? 'Submitting…' : 'Submit Test'}
                </button>
              )}
            </div>

            {/* Jump dots */}
            {totalQ <= 20 && (
              <div className="flex flex-wrap items-center justify-center gap-1.5 pt-1">
                {questions.map((q, i) => {
                  const answered = !!answers[String(q.id)];
                  return (
                    <button
                      key={q.id}
                      onClick={() => setCurrentQ(i)}
                      disabled={submitting}
                      title={`Question ${i + 1}`}
                      className={[
                        'rounded-full transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400',
                        i === currentQ
                          ? 'h-2.5 w-6 bg-primary-600'
                          : answered
                          ? 'h-2.5 w-2.5 bg-emerald-400'
                          : 'h-2.5 w-2.5 bg-slate-200 hover:bg-slate-300',
                      ].join(' ')}
                    />
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ── SUBMITTED phase ─────────────────────────────────────────── */}
        {phase === 'submitted' && localAttempt && (
          <ResultsView
            test={test}
            attempt={localAttempt}
            onOpenFull={onOpenFull}
          />
        )}
      </div>
    </section>
  );
}
