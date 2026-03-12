/**
 * TaskSection.tsx
 *
 * Renders a unit task inline within the LessonWorkspace flow.
 *
 * Behaviour:
 * - Shows task title, type badge, description and instructions (HTML)
 * - For auto_mcq tasks: renders inline question cards with radio selection
 * - For manual/essay/writing tasks: renders a textarea for free-form response
 * - For gap_fill tasks: renders per-blank inputs
 * - After submit: shows confirmation state + marks section complete
 *
 * Props:
 *   task           — StudentTask from useStudentUnit
 *   submission     — existing submission (null = not yet submitted)
 *   onSubmitTask   — async callback; receives { task_id, answers } payload
 *   onOpenFull     — navigate to full task page (fallback / "View full task")
 *   loading        — skeleton while task is loading
 *
 * Backend alignment:
 *   Uses existing student task submission endpoint pattern.
 *   The payload shape mirrors what student task pages already send.
 *   No new API endpoints are introduced.
 */

import React, { useState, useCallback, useRef } from 'react';
import {
  FileText, CheckCircle2, ChevronRight, Send, Loader2,
  AlertCircle, ExternalLink, RotateCcw,
} from 'lucide-react';

// ─── Types (aligned with existing StudentTask from useStudentUnit) ────────────

export interface TaskQuestion {
  id: number;
  text?: string;
  question_text?: string;
  order_index?: number;
  options?: Array<{ id: number; text: string; option_text?: string }>;
  correct_answer?: string;
}

export interface StudentTask {
  id: number;
  title: string;
  type: string;
  description?: string | null;
  instructions?: string | null;
  status?: string;
  is_visible_to_students?: boolean;
  questions?: TaskQuestion[];
  settings?: Record<string, unknown>;
  max_score?: number | null;
  unit_id?: number;
}

export interface TaskSubmission {
  id?: number;
  status?: string;    // 'pending' | 'graded' | 'submitted'
  score?: number | null;
  feedback?: string | null;
  submitted_at?: string;
  answers?: Record<string, unknown>;
}

export interface TaskSectionProps {
  task: StudentTask;
  submission: TaskSubmission | null;
  onSubmitTask: (payload: { task_id: number; answers: Record<string, unknown> }) => Promise<void>;
  onOpenFull?: (task: StudentTask) => void;
  loading?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TASK_TYPE_LABELS: Record<string, string> = {
  manual:    'Written task',
  auto_mcq:  'Multiple choice',
  gap_fill:  'Gap fill',
  essay:     'Essay',
  writing:   'Writing',
  listening: 'Listening',
  reading:   'Reading',
};

const TASK_TYPE_COLORS: Record<string, string> = {
  manual:    'bg-amber-50 text-amber-700 border-amber-200',
  auto_mcq:  'bg-indigo-50 text-indigo-700 border-indigo-200',
  gap_fill:  'bg-violet-50 text-violet-700 border-violet-200',
  essay:     'bg-amber-50 text-amber-700 border-amber-200',
  writing:   'bg-amber-50 text-amber-700 border-amber-200',
  listening: 'bg-sky-50 text-sky-700 border-sky-200',
  reading:   'bg-emerald-50 text-emerald-700 border-emerald-200',
};

// ─── MCQ Question ─────────────────────────────────────────────────────────────

function MCQQuestion({
  question,
  index,
  selected,
  onSelect,
  disabled,
}: {
  question: TaskQuestion;
  index: number;
  selected: string | null;
  onSelect: (optionId: string) => void;
  disabled: boolean;
}) {
  const text = question.question_text ?? question.text ?? `Question ${index + 1}`;
  const options = question.options ?? [];

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-slate-800 leading-relaxed">
        <span className="mr-2 tabular-nums text-slate-400">{index + 1}.</span>
        {text}
      </p>
      <div className="space-y-2">
        {options.map((opt) => {
          const optText = opt.option_text ?? opt.text ?? '';
          const optId = String(opt.id);
          const isSelected = selected === optId;
          return (
            <label
              key={opt.id}
              className={[
                'flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 text-sm transition-all',
                'focus-within:ring-2 focus-within:ring-primary-400',
                disabled ? 'cursor-default' : '',
                isSelected
                  ? 'border-primary-400 bg-primary-50 text-primary-900'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50',
              ].join(' ')}
            >
              <input
                type="radio"
                name={`q-${question.id}`}
                value={optId}
                checked={isSelected}
                onChange={() => !disabled && onSelect(optId)}
                disabled={disabled}
                className="mt-0.5 shrink-0 accent-primary-600"
              />
              <span className="leading-relaxed">{optText}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

// ─── Submission confirmation ───────────────────────────────────────────────────

function SubmittedState({ submission, task, onOpenFull }: {
  submission: TaskSubmission;
  task: StudentTask;
  onOpenFull?: (t: StudentTask) => void;
}) {
  const hasScore  = submission.score != null;
  const isGraded  = submission.status === 'graded';

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
        <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-emerald-800">Task submitted</p>
          {submission.submitted_at && (
            <p className="mt-0.5 text-xs text-emerald-600">
              {new Date(submission.submitted_at).toLocaleString()}
            </p>
          )}
        </div>
        {hasScore && (
          <span className="shrink-0 rounded-full bg-emerald-100 px-3 py-1 text-sm font-bold text-emerald-800">
            {submission.score}
            {task.max_score ? `/${task.max_score}` : ''}
          </span>
        )}
      </div>

      {isGraded && submission.feedback && (
        <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
          <p className="mb-1 text-xs font-semibold text-blue-700 uppercase tracking-wider">Feedback</p>
          <p className="text-sm leading-relaxed text-blue-900">{submission.feedback}</p>
        </div>
      )}

      {!isGraded && (
        <p className="text-xs text-slate-400 text-center">
          Waiting for teacher to grade your submission.
        </p>
      )}

      {onOpenFull && (
        <div className="flex justify-end">
          <button
            onClick={() => onOpenFull(task)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
          >
            View full task
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function TaskSection({
  task,
  submission,
  onSubmitTask,
  onOpenFull,
  loading = false,
}: TaskSectionProps) {
  // MCQ: map of questionId → selected optionId string
  const [mcqAnswers, setMcqAnswers]   = useState<Record<string, string>>({});
  // Manual/essay: free text
  const [textAnswer, setTextAnswer]   = useState('');
  // Gap fill: map of index → answer string
  const [gapAnswers, setGapAnswers]   = useState<Record<number, string>>({});

  const [submitting, setSubmitting]   = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [localSubmission, setLocalSubmission] = useState<TaskSubmission | null>(submission);

  const confirmedRef = useRef(false);

  const typeLabel   = TASK_TYPE_LABELS[task.type] ?? task.type;
  const typeColor   = TASK_TYPE_COLORS[task.type] ?? 'bg-slate-100 text-slate-600 border-slate-200';
  const isAutoMCQ   = task.type === 'auto_mcq';
  const isGapFill   = task.type === 'gap_fill';
  const isManual    = ['manual', 'essay', 'writing', 'listening', 'reading'].includes(task.type);

  const questions   = task.questions ?? [];

  // ── Update local state when prop changes (e.g. after parent refetch) ──────
  React.useEffect(() => {
    setLocalSubmission(submission);
  }, [submission]);

  // ── Build submission payload ───────────────────────────────────────────────
  const buildPayload = useCallback(() => {
    if (isAutoMCQ) {
      return {
        task_id: task.id,
        answers: mcqAnswers,
      };
    }
    if (isGapFill) {
      return {
        task_id: task.id,
        answers: gapAnswers as Record<string, unknown>,
      };
    }
    return {
      task_id: task.id,
      answers: { text: textAnswer },
    };
  }, [task.id, isAutoMCQ, isGapFill, mcqAnswers, gapAnswers, textAnswer]);

  // ── Validate ──────────────────────────────────────────────────────────────
  const canSubmit = useCallback(() => {
    if (isAutoMCQ && questions.length > 0) {
      return questions.every((q) => mcqAnswers[String(q.id)]);
    }
    if (isGapFill && questions.length > 0) {
      return questions.every((_, i) => (gapAnswers[i] ?? '').trim().length > 0);
    }
    return textAnswer.trim().length > 0;
  }, [isAutoMCQ, isGapFill, questions, mcqAnswers, gapAnswers, textAnswer]);

  const handleSubmit = async () => {
    if (!canSubmit()) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await onSubmitTask(buildPayload());
      // Optimistic local completion
      const pending: TaskSubmission = {
        status: 'submitted',
        submitted_at: new Date().toISOString(),
      };
      setLocalSubmission(pending);
      confirmedRef.current = true;
    } catch (err: any) {
      setSubmitError(err?.message ?? 'Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Skeleton ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <section aria-label="Task" className="pt-2">
        <div className="animate-pulse space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-slate-200" />
            <div className="h-5 w-24 rounded bg-slate-200" />
          </div>
          <div className="h-40 rounded-2xl bg-slate-100" />
        </div>
        <div className="mt-10 border-t border-slate-100" />
      </section>
    );
  }

  return (
    <section aria-label="Task" className="pt-2">
      {/* ── Section header ──────────────────────────────────────────────── */}
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
          <FileText className="h-4 w-4" />
        </span>

        <div className="flex flex-1 items-baseline gap-2 min-w-0">
          <h2 className="text-base font-semibold text-slate-900">Task</h2>
          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${typeColor}`}>
            {typeLabel}
          </span>
        </div>

        {localSubmission && (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Submitted
          </span>
        )}
      </div>

      {/* ── Task card ────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-sm space-y-5">
        {/* Title */}
        <div>
          <h3 className="text-[17px] font-semibold leading-snug text-slate-900">{task.title}</h3>
          {task.description && (
            <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{task.description}</p>
          )}
        </div>

        {/* Instructions */}
        {task.instructions && (
          <div
            className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm leading-relaxed text-blue-900 prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: task.instructions }}
          />
        )}

        {/* ── Submitted state ──────────────────────────────────────────── */}
        {localSubmission ? (
          <SubmittedState
            submission={localSubmission}
            task={task}
            onOpenFull={onOpenFull}
          />
        ) : (
          <>
            {/* ── MCQ question list ───────────────────────────────────── */}
            {isAutoMCQ && questions.length > 0 && (
              <div className="space-y-6 pt-1">
                {questions
                  .slice()
                  .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
                  .map((q, i) => (
                    <MCQQuestion
                      key={q.id}
                      question={q}
                      index={i}
                      selected={mcqAnswers[String(q.id)] ?? null}
                      onSelect={(v) =>
                        setMcqAnswers((prev) => ({ ...prev, [String(q.id)]: v }))
                      }
                      disabled={submitting}
                    />
                  ))}
              </div>
            )}

            {/* ── Gap fill ────────────────────────────────────────────── */}
            {isGapFill && questions.length > 0 && (
              <div className="space-y-4 pt-1">
                {questions
                  .slice()
                  .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
                  .map((q, i) => (
                    <div key={q.id} className="space-y-1.5">
                      <label className="text-sm font-medium text-slate-700 leading-relaxed">
                        <span className="mr-1.5 tabular-nums text-slate-400">{i + 1}.</span>
                        {q.question_text ?? q.text}
                      </label>
                      <input
                        type="text"
                        value={gapAnswers[i] ?? ''}
                        onChange={(e) =>
                          setGapAnswers((prev) => ({ ...prev, [i]: e.target.value }))
                        }
                        disabled={submitting}
                        placeholder="Your answer…"
                        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-400/30 transition-all disabled:opacity-60"
                      />
                    </div>
                  ))}
              </div>
            )}

            {/* ── Free text (manual / essay / writing / etc.) ─────────── */}
            {isManual && (
              <div className="space-y-1.5 pt-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Your response
                </label>
                <textarea
                  rows={6}
                  value={textAnswer}
                  onChange={(e) => setTextAnswer(e.target.value)}
                  disabled={submitting}
                  placeholder="Write your answer here…"
                  className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-800 placeholder:text-slate-400 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-400/30 transition-all disabled:opacity-60"
                />
              </div>
            )}

            {/* ── "Open full task" fallback for unsupported types ─────── */}
            {!isAutoMCQ && !isGapFill && !isManual && onOpenFull && (
              <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-4 text-center">
                <p className="text-sm text-slate-500">
                  This task type requires the full task view.
                </p>
                <button
                  onClick={() => onOpenFull(task)}
                  className="mt-3 flex mx-auto items-center gap-1.5 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
                >
                  Open task
                  <ExternalLink className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* ── Error ───────────────────────────────────────────────── */}
            {submitError && (
              <div className="flex items-center gap-2 rounded-lg border border-red-100 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {submitError}
                <button
                  onClick={() => setSubmitError(null)}
                  className="ml-auto text-red-400 hover:text-red-600"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* ── Submit button ────────────────────────────────────────── */}
            {(isAutoMCQ || isGapFill || isManual) && (
              <div className="flex items-center justify-between border-t border-slate-100 pt-4">
                <span className="text-xs text-slate-400">
                  {canSubmit() ? 'Ready to submit.' : 'Answer all questions to continue.'}
                </span>
                <button
                  onClick={handleSubmit}
                  disabled={submitting || !canSubmit()}
                  className={[
                    'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400',
                    submitting || !canSubmit()
                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                      : 'bg-amber-500 text-white hover:bg-amber-600 shadow-sm hover:shadow',
                  ].join(' ')}
                >
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  {submitting ? 'Submitting…' : 'Submit'}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <div className="mt-10 border-t border-slate-100" aria-hidden />
    </section>
  );
}
