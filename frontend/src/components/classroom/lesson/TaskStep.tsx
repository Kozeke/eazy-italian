/**
 * TaskStep.tsx  (v4 — practice / writing / reading inline support)
 *
 * Changes from v3:
 * ─────────────────
 * • `practice` task type is now a first-class inline type:
 *     - Renders task content, instructions, and questions[] if present.
 *     - Falls back to a free-text area when questions are absent.
 *
 * • `writing` task type maps to the existing free-text area (multiline textarea).
 *   No change in behaviour — just explicitly included in the supported set.
 *
 * • `reading` task type:
 *     - Renders the reading passage from task.content or task.description.
 *     - Renders instructions below the passage.
 *     - If questions[] exist, shows them as individually labelled text inputs.
 *     - If no questions, shows a single free-text textarea for the full response.
 *
 * • The INLINE_TEXT_TYPES set now explicitly includes 'practice', 'writing',
 *   and 'reading' so isInlineSupported() returns true for them.
 *
 * • `needsQuestions()` does NOT include these types — they render without
 *   questions when the server doesn't provide them, so no enrichment gate.
 *
 * • UnsupportedTaskFallback is reserved for truly unknown task types only.
 *
 * • All other logic (enrichment, MCQ, gap_fill, submit, SubmittedPanel,
 *   skeleton, animation) is preserved from v3.
 */

import {
  useState, useCallback, useRef, useEffect,
} from 'react';
import {
  FileText, CheckCircle2, Send, Loader2, AlertCircle,
  RotateCcw, ArrowRight, Star, Clock,
  MessageSquare, ChevronRight, RefreshCw, BookOpen,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TaskQuestion {
  id:             number;
  text?:          string;
  question_text?: string;
  order_index?:   number;
  options?:       Array<{ id: number; text: string; option_text?: string }>;
  correct_answer?: string;
}

export interface StudentTask {
  id:                      number;
  title:                   string;
  type:                    string;
  description?:            string | null;
  /** Passage / body text — used for reading tasks */
  content?:                string | null;
  instructions?:           string | null;
  status?:                 string;
  is_visible_to_students?: boolean;
  questions?:              TaskQuestion[];
  settings?:               Record<string, unknown>;
  max_score?:              number | null;
  unit_id?:                number;
}

export interface TaskSubmission {
  id?:           number;
  status?:       string;
  score?:        number | null;
  feedback?:     string | null;
  submitted_at?: string;
  answers?:      Record<string, unknown>;
}

export interface TaskStepProps {
  task:          StudentTask;
  submission:    TaskSubmission | null;
  onSubmitTask:  (payload: { task_id: number; answers: Record<string, unknown> }) => Promise<unknown>;
  /**
   * Fetch full task details when the manifest data is incomplete.
   * Calls GET /api/v1/tasks/:taskId.
   * Optional — if not provided, falls back to manifest data only.
   */
  onLoadTask?:   (taskId: number) => Promise<StudentTask>;
  /**
   * Last-resort fallback — only called from UnsupportedTaskFallback for
   * task types that cannot be rendered inline with current backend data.
   * NOT used on the normal supported-type path.
   */
  onOpenFull?:   (task: StudentTask) => void;
  loading?:      boolean;
  nextStepLabel?: string;
  onContinue?:   () => void;
}

// ─── Supported inline task types ──────────────────────────────────────────────

const INLINE_MCQ_TYPES     = new Set(['auto_mcq']);
const INLINE_GAPFILL_TYPES = new Set(['gap_fill']);
const INLINE_TEXT_TYPES    = new Set([
  'manual', 'essay', 'writing', 'listening',
  'reading', 'practice',
]);

function isInlineSupported(type: string): boolean {
  return (
    INLINE_MCQ_TYPES.has(type) ||
    INLINE_GAPFILL_TYPES.has(type) ||
    INLINE_TEXT_TYPES.has(type)
  );
}

/** Types that REQUIRE question data before they can be rendered inline */
function needsQuestions(type: string): boolean {
  // Only MCQ and gap_fill are blocked without questions.
  // practice / writing / reading can always render with a free-text fallback.
  return INLINE_MCQ_TYPES.has(type) || INLINE_GAPFILL_TYPES.has(type);
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TASK_TYPE_LABELS: Record<string, string> = {
  manual:    'Written task',
  auto_mcq:  'Multiple choice',
  gap_fill:  'Fill in the blanks',
  essay:     'Essay',
  writing:   'Writing',
  listening: 'Listening',
  reading:   'Reading',
  practice:  'Practice',
};

const TASK_TYPE_PILL: Record<string, string> = {
  manual:    'bg-amber-50 text-amber-700 ring-1 ring-amber-200/70',
  auto_mcq:  'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200/70',
  gap_fill:  'bg-violet-50 text-violet-700 ring-1 ring-violet-200/70',
  essay:     'bg-amber-50 text-amber-700 ring-1 ring-amber-200/70',
  writing:   'bg-amber-50 text-amber-700 ring-1 ring-amber-200/70',
  listening: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200/70',
  reading:   'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/70',
  practice:  'bg-teal-50 text-teal-700 ring-1 ring-teal-200/70',
};

// ─── Micro-helpers ────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'medium', timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

// ─── Instruction block ────────────────────────────────────────────────────────

function InstructionBlock({ html }: { html: string }) {
  return (
    <div className="relative rounded-xl overflow-hidden">
      <div className="absolute inset-y-0 left-0 w-[3px] rounded-l-xl bg-gradient-to-b from-amber-400 to-amber-300" />
      <div
        className="pl-5 pr-4 py-3.5 bg-amber-50/60 text-[13.5px] leading-[1.7] text-amber-950 prose prose-sm max-w-none
          prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}

// ─── Reading passage block ────────────────────────────────────────────────────

function ReadingPassage({ html }: { html: string }) {
  return (
    <div className="relative rounded-xl overflow-hidden border border-emerald-100">
      <div className="flex items-center gap-2 border-b border-emerald-100 bg-emerald-50 px-4 py-2.5">
        <BookOpen className="h-3.5 w-3.5 text-emerald-600" />
        <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-emerald-700">
          Reading passage
        </span>
      </div>
      <div
        className="px-5 py-4 bg-white text-[13.5px] leading-[1.8] text-slate-800 prose prose-sm max-w-none
          prose-p:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}

// ─── Metadata row ─────────────────────────────────────────────────────────────

function TaskMeta({ task }: { task: StudentTask }) {
  const typeLabel = TASK_TYPE_LABELS[task.type] ?? task.type;
  const typePill  = TASK_TYPE_PILL[task.type]   ?? 'bg-slate-100 text-slate-600';

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${typePill}`}>
        <FileText className="h-2.5 w-2.5" />
        {typeLabel}
      </span>
      {task.max_score != null && (
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-500">
          <Star className="h-2.5 w-2.5" />
          {task.max_score} pts
        </span>
      )}
    </div>
  );
}

// ─── MCQ option ───────────────────────────────────────────────────────────────

function MCQOption({
  optId, text, selected, disabled, onSelect, questionId,
}: {
  optId:      string;
  text:       string;
  selected:   boolean;
  disabled:   boolean;
  onSelect:   (id: string) => void;
  questionId: number;
}) {
  return (
    <label
      className={[
        'group relative flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3',
        'text-[13.5px] leading-relaxed transition-all duration-150 select-none',
        'focus-within:ring-2 focus-within:ring-amber-400/50',
        disabled ? 'cursor-default' : 'hover:shadow-sm',
        selected
          ? 'border-amber-400 bg-amber-50 text-amber-900 shadow-[0_0_0_1px_theme(colors.amber.300/30)]'
          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50/80',
      ].join(' ')}
    >
      <span
        className={[
          'mt-[3px] flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-all',
          selected
            ? 'border-amber-500 bg-amber-500'
            : 'border-slate-300 bg-white group-hover:border-slate-400',
        ].join(' ')}
      >
        {selected && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
      </span>
      <input
        type="radio"
        name={`q-${questionId}`}
        value={optId}
        checked={selected}
        onChange={() => !disabled && onSelect(optId)}
        disabled={disabled}
        className="sr-only"
      />
      <span className="flex-1">{text}</span>
    </label>
  );
}

// ─── MCQ question block ───────────────────────────────────────────────────────

function MCQQuestion({
  question, index, selected, onSelect, disabled,
}: {
  question: TaskQuestion;
  index:    number;
  selected: string | null;
  onSelect: (id: string) => void;
  disabled: boolean;
}) {
  const text    = question.question_text ?? question.text ?? `Question ${index + 1}`;
  const options = question.options ?? [];

  return (
    <div className="space-y-3">
      <p className="text-[14px] font-semibold leading-snug text-slate-800">
        <span className="mr-2 tabular-nums font-normal text-slate-400">{index + 1}.</span>
        {text}
      </p>
      <div className="space-y-2">
        {options.map((opt) => {
          const optId   = String(opt.id);
          const optText = opt.option_text ?? opt.text ?? '';
          return (
            <MCQOption
              key={opt.id}
              optId={optId}
              text={optText}
              selected={selected === optId}
              disabled={disabled}
              onSelect={onSelect}
              questionId={question.id}
            />
          );
        })}
      </div>
    </div>
  );
}

// ─── Gap fill input ───────────────────────────────────────────────────────────

function GapFillQuestion({
  question, index, value, onChange, disabled,
}: {
  question: TaskQuestion;
  index:    number;
  value:    string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  const text = question.question_text ?? question.text;
  return (
    <div className="space-y-2">
      {text && (
        <label className="text-[13.5px] font-medium leading-snug text-slate-700">
          <span className="mr-1.5 tabular-nums font-normal text-slate-400">{index + 1}.</span>
          {text}
        </label>
      )}
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder="Your answer…"
          className={[
            'w-full rounded-xl border bg-white px-4 py-2.5 text-[13.5px] text-slate-800',
            'placeholder:text-slate-400 transition-all duration-150',
            'focus:outline-none focus:ring-2 focus:ring-amber-400/40 focus:border-amber-400',
            'disabled:opacity-60 disabled:cursor-not-allowed',
            value
              ? 'border-amber-300 bg-amber-50/30'
              : 'border-slate-200 hover:border-slate-300',
          ].join(' ')}
        />
        {value && (
          <CheckCircle2 className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-amber-500" />
        )}
      </div>
    </div>
  );
}

// ─── Reading question (single labelled text input) ────────────────────────────

function ReadingQuestion({
  question, index, value, onChange, disabled,
}: {
  question: TaskQuestion;
  index:    number;
  value:    string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  const text = question.question_text ?? question.text;
  const id   = `rq-${question.id}`;
  return (
    <div className="space-y-2">
      {text && (
        <label htmlFor={id} className="block text-[13.5px] font-semibold leading-snug text-slate-800">
          <span className="mr-1.5 tabular-nums font-normal text-slate-400">{index + 1}.</span>
          {text}
        </label>
      )}
      <textarea
        id={id}
        rows={3}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder="Your answer…"
        className={[
          'w-full resize-none rounded-xl border bg-white px-4 py-2.5',
          'text-[13.5px] leading-relaxed text-slate-800 placeholder:text-slate-400',
          'transition-all duration-150',
          'focus:outline-none focus:ring-2 focus:ring-emerald-400/40 focus:border-emerald-400',
          'disabled:opacity-60 disabled:cursor-not-allowed',
          value
            ? 'border-emerald-300 bg-emerald-50/20'
            : 'border-slate-200 hover:border-slate-300',
        ].join(' ')}
      />
    </div>
  );
}

// ─── Free-text area ───────────────────────────────────────────────────────────

function FreeTextArea({
  value, onChange, disabled, minRows = 6, placeholder,
}: {
  value:        string;
  onChange:     (v: string) => void;
  disabled:     boolean;
  minRows?:     number;
  placeholder?: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(el.scrollHeight, minRows * 24)}px`;
  }, [value, minRows]);

  const charCount = value.length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400">
          Your response
        </label>
        {charCount > 0 && (
          <span className="text-[11px] tabular-nums text-slate-400">
            {charCount} {charCount === 1 ? 'character' : 'characters'}
          </span>
        )}
      </div>
      <div className="relative">
        <textarea
          ref={textareaRef}
          rows={minRows}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder={placeholder ?? 'Write your answer here…'}
          className={[
            'w-full resize-none rounded-xl border bg-white px-4 py-3.5',
            'text-[13.5px] leading-[1.75] text-slate-800 placeholder:text-slate-400',
            'transition-all duration-150',
            'focus:outline-none focus:ring-2 focus:ring-amber-400/40 focus:border-amber-400',
            'disabled:opacity-60 disabled:cursor-not-allowed',
            value
              ? 'border-amber-300'
              : 'border-slate-200 hover:border-slate-300',
          ].join(' ')}
          style={{ overflow: 'hidden' }}
        />
      </div>
    </div>
  );
}

// ─── Submission states ────────────────────────────────────────────────────────

function SubmittingStrip() {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-[13px] text-amber-700">
      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-amber-500" />
      <span className="font-medium">Submitting your work…</span>
    </div>
  );
}

function ErrorStrip({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-[13px] text-red-700">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
      <span className="flex-1 leading-relaxed">{message}</span>
      <button
        onClick={onRetry}
        className="ml-auto flex shrink-0 items-center gap-1.5 rounded-lg border border-red-200 bg-white px-2.5 py-1 text-[12px] font-semibold text-red-600 hover:bg-red-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
      >
        <RotateCcw className="h-3 w-3" />
        Retry
      </button>
    </div>
  );
}

function SubmittedPanel({
  submission, task, onContinue, nextStepLabel,
}: {
  submission:     TaskSubmission;
  task:           StudentTask;
  onContinue?:    () => void;
  nextStepLabel?: string;
}) {
  const isGraded        = submission.status === 'graded';
  const isPendingReview = !isGraded;
  const hasScore        = submission.score != null;
  const hasFeedback     = !!submission.feedback;
  const maxScore        = task.max_score;

  return (
    <div className="space-y-4 task-step-enter">

      {/* ── Confirmation banner ──────────────────────────────────────────── */}
      <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3.5">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm shadow-emerald-200">
          <CheckCircle2 className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-bold text-emerald-900">Task submitted!</p>
          {submission.submitted_at && (
            <p className="mt-0.5 text-[12px] text-emerald-600">
              {formatDate(submission.submitted_at)}
            </p>
          )}
          {isGraded && hasScore && (
            <p className="mt-0.5 text-[13px] font-semibold text-emerald-800">
              Score: {submission.score}{maxScore != null ? ` / ${maxScore}` : ''}
            </p>
          )}
        </div>
      </div>

      {/* ── Score bar ────────────────────────────────────────────────────── */}
      {hasScore && maxScore != null && maxScore > 0 && (
        <div className="space-y-1.5">
          <div className="flex justify-between text-[11px] font-semibold">
            <span className="text-slate-500">Score</span>
            <span className="tabular-nums text-slate-700">
              {Math.round(((submission.score ?? 0) / maxScore) * 100)}%
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500 transition-all duration-700"
              style={{ width: `${Math.min(100, ((submission.score ?? 0) / maxScore) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* ── Teacher feedback ─────────────────────────────────────────────── */}
      {isGraded && hasFeedback && (
        <div className="rounded-xl border border-blue-100 bg-blue-50/70 overflow-hidden">
          <div className="flex items-center gap-2 border-b border-blue-100 px-4 py-2.5">
            <MessageSquare className="h-3.5 w-3.5 text-blue-500" />
            <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-blue-600">
              Teacher feedback
            </span>
          </div>
          <p className="px-4 py-3.5 text-[13.5px] leading-relaxed text-blue-900">
            {submission.feedback}
          </p>
        </div>
      )}

      {/* ── Pending review notice ────────────────────────────────────────── */}
      {isPendingReview && (
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-[12.5px] text-slate-500">
          <Clock className="h-4 w-4 shrink-0 text-slate-400" />
          <span>Waiting for your teacher to grade this submission.</span>
        </div>
      )}

      {/* ── Continue CTA ─────────────────────────────────────────────────── */}
      {onContinue && (
        <div className="pt-1">
          <button
            onClick={onContinue}
            className={[
              'group flex w-full items-center justify-center gap-2.5 rounded-xl px-5 py-3',
              'bg-gradient-to-r from-amber-500 to-amber-400 text-[13.5px] font-bold text-white',
              'shadow-md shadow-amber-200/60 transition-all duration-200',
              'hover:from-amber-600 hover:to-amber-500 hover:shadow-lg hover:shadow-amber-200/60',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2',
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

// ─── Submit bar ───────────────────────────────────────────────────────────────

function SubmitBar({
  canSubmit, submitting, onSubmit,
}: { canSubmit: boolean; submitting: boolean; onSubmit: () => void }) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-slate-100 pt-4">
      <p className={[
        'text-[12px] transition-colors',
        canSubmit ? 'font-medium text-emerald-600' : 'text-slate-400',
      ].join(' ')}>
        {canSubmit ? '✓ Ready to submit' : 'Answer all questions to continue'}
      </p>
      <button
        onClick={onSubmit}
        disabled={submitting || !canSubmit}
        className={[
          'flex shrink-0 items-center gap-2 rounded-xl px-5 py-2.5 text-[13.5px] font-bold transition-all duration-150',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2',
          'active:scale-[0.97]',
          submitting || !canSubmit
            ? 'cursor-not-allowed bg-slate-100 text-slate-400'
            : 'bg-amber-500 text-white shadow-md shadow-amber-200/60 hover:bg-amber-600 hover:shadow-lg hover:shadow-amber-200/60',
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
  );
}

// ─── Unsupported-type fallback ────────────────────────────────────────────────

function UnsupportedTaskFallback({ task, onOpenFull }: {
  task:        StudentTask;
  onOpenFull?: (t: StudentTask) => void;
}) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-5 py-6 text-center space-y-3">
      <p className="text-[13.5px] font-semibold text-slate-700">
        This task type cannot be completed here
      </p>
      <p className="text-[12px] text-slate-400">
        Open the full task to submit your work.
      </p>
      {onOpenFull && (
        <button
          onClick={() => onOpenFull(task)}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[13px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50 hover:border-slate-300 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
        >
          Open task
          <ChevronRight className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function TaskStepSkeleton() {
  return (
    <div className="animate-pulse space-y-4 pt-1">
      <div className="h-5 w-1/2 rounded-lg bg-slate-200" />
      <div className="h-4 w-3/4 rounded bg-slate-100" />
      <div className="h-36 rounded-xl bg-slate-100" />
      <div className="h-10 rounded-xl bg-slate-200" />
    </div>
  );
}

// ─── EnrichmentLoader ─────────────────────────────────────────────────────────

function EnrichmentLoader() {
  return (
    <div className="flex items-center gap-3 py-4 text-[13px] text-slate-500">
      <Loader2 className="h-4 w-4 animate-spin text-amber-400 shrink-0" />
      <span>Loading task details…</span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function TaskStep({
  task,
  submission,
  onSubmitTask,
  onLoadTask,
  onOpenFull,
  loading,
  nextStepLabel,
  onContinue,
}: TaskStepProps) {

  // ── Local submission mirror ────────────────────────────────────────────────
  const [localSubmission, setLocalSubmission] = useState<TaskSubmission | null>(
    submission ?? null,
  );
  useEffect(() => {
    if (submission) setLocalSubmission(submission);
  }, [submission]);

  // ── Enriched task (lazily loaded when manifest data is incomplete) ─────────
  const [enrichedTask,    setEnrichedTask   ] = useState<StudentTask>(task);
  const [enriching,       setEnriching      ] = useState(false);
  const [enrichError,     setEnrichError    ] = useState<string | null>(null);
  const enrichAttemptedRef = useRef(false);

  const taskType   = enrichedTask.type ?? '';
  const isAutoMCQ  = INLINE_MCQ_TYPES.has(taskType);
  const isGapFill  = INLINE_GAPFILL_TYPES.has(taskType);
  const isManual   = INLINE_TEXT_TYPES.has(taskType);
  const isReading  = taskType === 'reading';
  const isPractice = taskType === 'practice';
  const supported  = isInlineSupported(taskType);

  const questions = [...(enrichedTask.questions ?? [])].sort(
    (a, b) => (a.order_index ?? 0) - (b.order_index ?? 0),
  );

  // ── Lazy enrichment ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!onLoadTask) return;
    if (enrichAttemptedRef.current) return;

    const missingQuestions = needsQuestions(taskType) && questions.length === 0;
    const missingDetails   = !enrichedTask.instructions && !enrichedTask.description && !enrichedTask.content;

    if (!missingQuestions && !missingDetails) return;

    enrichAttemptedRef.current = true;

    (async () => {
      setEnriching(true);
      setEnrichError(null);
      try {
        const full = await onLoadTask(task.id);
        setEnrichedTask((prev) => ({
          ...prev,
          ...full,
          id:    prev.id,
          title: prev.title,
          type:  prev.type,
        }));
      } catch (err: any) {
        setEnrichError(err?.message ?? 'Could not load task details.');
      } finally {
        setEnriching(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id, taskType]);

  // ── Answer state ───────────────────────────────────────────────────────────
  const [mcqAnswers,      setMcqAnswers     ] = useState<Record<string, string>>({});
  const [gapAnswers,      setGapAnswers     ] = useState<Record<number, string>>({});
  const [textAnswer,      setTextAnswer     ] = useState('');
  /**
   * For reading tasks with questions[] — one answer per question id.
   * For reading tasks without questions — falls through to textAnswer.
   */
  const [readingAnswers,  setReadingAnswers ] = useState<Record<number, string>>({});
  const [submitting,      setSubmitting     ] = useState(false);
  const [submitError,     setSubmitError    ] = useState<string | null>(null);

  const confirmedRef = useRef(false);

  // ── Can submit? ────────────────────────────────────────────────────────────
  const canSubmit = useCallback((): boolean => {
    if (isAutoMCQ)  return questions.every((q) => !!mcqAnswers[String(q.id)]);
    if (isGapFill)  return questions.every((_, i) => (gapAnswers[i] ?? '').trim().length > 0);
    if (isReading && questions.length > 0) {
      return questions.every((q) => (readingAnswers[q.id] ?? '').trim().length > 0);
    }
    if (isManual)   return textAnswer.trim().length > 0;
    return false;
  }, [isAutoMCQ, isGapFill, isReading, isManual, questions, mcqAnswers, gapAnswers, textAnswer, readingAnswers]);

  // ── Build payload ──────────────────────────────────────────────────────────
  const buildPayload = useCallback((): Record<string, unknown> => {
    if (isAutoMCQ) return { ...mcqAnswers };
    if (isGapFill) return Object.fromEntries(
      Object.entries(gapAnswers).map(([k, v]) => [k, v]),
    );
    if (isReading && questions.length > 0) {
      return Object.fromEntries(
        questions.map((q) => [String(q.id), readingAnswers[q.id] ?? '']),
      );
    }
    return { response: textAnswer };
  }, [isAutoMCQ, isGapFill, isReading, questions, mcqAnswers, gapAnswers, textAnswer, readingAnswers]);

  // ── Submit handler ─────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (!canSubmit() || submitting || confirmedRef.current) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await onSubmitTask({ task_id: task.id, answers: buildPayload() });
      const optimistic: TaskSubmission = {
        status:       'submitted',
        submitted_at: new Date().toISOString(),
        answers:      buildPayload(),
      };
      setLocalSubmission(optimistic);
      confirmedRef.current = true;
    } catch (err: any) {
      setSubmitError(err?.message ?? 'Submission failed — please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [canSubmit, submitting, onSubmitTask, task.id, buildPayload]);

  // ── Skeleton ───────────────────────────────────────────────────────────────
  if (loading) return <TaskStepSkeleton />;

  return (
    <>
      <style>{`
        @keyframes taskStepEnter {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .task-step-enter {
          animation: taskStepEnter 0.35s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
      `}</style>

      <div className="space-y-5 pt-1">

        {/* ── Task header ────────────────────────────────────────────────── */}
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-[17px] font-bold leading-snug tracking-tight text-slate-900">
              {enrichedTask.title}
            </h3>
          </div>
          <TaskMeta task={enrichedTask} />
          {enrichedTask.description && (
            <p className="text-[13.5px] leading-relaxed text-slate-500">
              {enrichedTask.description}
            </p>
          )}
        </div>

        {/* ── Reading passage ────────────────────────────────────────────── */}
        {isReading && (enrichedTask.content || enrichedTask.description) && (
          <ReadingPassage html={enrichedTask.content ?? enrichedTask.description ?? ''} />
        )}

        {/* ── Instructions ──────────────────────────────────────────────── */}
        {enrichedTask.instructions && (
          <InstructionBlock html={enrichedTask.instructions} />
        )}

        {/* ── Enrichment in-progress ────────────────────────────────────── */}
        {enriching && <EnrichmentLoader />}

        {/* ── Enrichment error (non-fatal for free-text types) ──────────── */}
        {enrichError && !enriching && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-[13px] text-amber-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <div className="flex-1">
              <p className="font-medium">Couldn't load full task details</p>
              <p className="text-amber-600 text-[12px]">{enrichError}</p>
            </div>
            {onLoadTask && (
              <button
                onClick={() => {
                  enrichAttemptedRef.current = false;
                  setEnrichError(null);
                  setEnriching(true);
                  onLoadTask(task.id)
                    .then((full) => setEnrichedTask((prev) => ({ ...prev, ...full, id: prev.id, title: prev.title, type: prev.type })))
                    .catch((e) => setEnrichError(e?.message ?? 'Retry failed.'))
                    .finally(() => setEnriching(false));
                }}
                className="flex shrink-0 items-center gap-1.5 rounded-lg border border-amber-200 bg-white px-2.5 py-1 text-[12px] font-semibold text-amber-700 hover:bg-amber-50 transition-colors focus:outline-none"
              >
                <RefreshCw className="h-3 w-3" />
                Retry
              </button>
            )}
          </div>
        )}

        {/* ── Already submitted: show submitted panel ───────────────────── */}
        {localSubmission ? (
          <SubmittedPanel
            submission={localSubmission}
            task={enrichedTask}
            onContinue={onContinue}
            nextStepLabel={nextStepLabel}
          />
        ) : !enriching && (
          /* ── Answer area ──────────────────────────────────────────────── */
          <div className="space-y-5">

            {/* MCQ questions */}
            {isAutoMCQ && questions.length > 0 && (
              <div className="space-y-6">
                {questions.map((q, i) => (
                  <MCQQuestion
                    key={q.id}
                    question={q}
                    index={i}
                    selected={mcqAnswers[String(q.id)] ?? null}
                    onSelect={(v) => setMcqAnswers((prev) => ({ ...prev, [String(q.id)]: v }))}
                    disabled={submitting}
                  />
                ))}
              </div>
            )}

            {/* Gap fill */}
            {isGapFill && questions.length > 0 && (
              <div className="space-y-4">
                {questions.map((q, i) => (
                  <GapFillQuestion
                    key={q.id}
                    question={q}
                    index={i}
                    value={gapAnswers[i] ?? ''}
                    onChange={(v) => setGapAnswers((prev) => ({ ...prev, [i]: v }))}
                    disabled={submitting}
                  />
                ))}
              </div>
            )}

            {/* Reading: per-question text inputs when questions exist */}
            {isReading && questions.length > 0 && (
              <div className="space-y-5">
                {questions.map((q, i) => (
                  <ReadingQuestion
                    key={q.id}
                    question={q}
                    index={i}
                    value={readingAnswers[q.id] ?? ''}
                    onChange={(v) => setReadingAnswers((prev) => ({ ...prev, [q.id]: v }))}
                    disabled={submitting}
                  />
                ))}
              </div>
            )}

            {/* Practice with questions[] — render as reading questions */}
            {isPractice && questions.length > 0 && (
              <div className="space-y-5">
                {questions.map((q, i) => {
                  // If question has options, render MCQ-style
                  if (q.options && q.options.length > 0) {
                    return (
                      <MCQQuestion
                        key={q.id}
                        question={q}
                        index={i}
                        selected={mcqAnswers[String(q.id)] ?? null}
                        onSelect={(v) => setMcqAnswers((prev) => ({ ...prev, [String(q.id)]: v }))}
                        disabled={submitting}
                      />
                    );
                  }
                  return (
                    <ReadingQuestion
                      key={q.id}
                      question={q}
                      index={i}
                      value={readingAnswers[q.id] ?? ''}
                      onChange={(v) => setReadingAnswers((prev) => ({ ...prev, [q.id]: v }))}
                      disabled={submitting}
                    />
                  );
                })}
              </div>
            )}

            {/* Free text — for manual/essay/writing/listening + reading & practice without questions */}
            {isManual && !(isReading && questions.length > 0) && !(isPractice && questions.length > 0) && (
              <FreeTextArea
                value={textAnswer}
                onChange={setTextAnswer}
                disabled={submitting}
                minRows={taskType === 'essay' || taskType === 'writing' ? 8 : 5}
                placeholder={
                  taskType === 'writing'  ? 'Write your response here…'  :
                  taskType === 'practice' ? 'Write your practice work here…' :
                  taskType === 'reading'  ? 'Write your answers here…'   :
                  'Write your answer here…'
                }
              />
            )}

            {/*
              Unsupported type fallback.
              ─────────────────────────
              Shown ONLY when:
              1. The task type is not in any supported set, OR
              2. The type requires questions (MCQ/gap_fill) but enrichment
                 failed and there are none — student cannot proceed inline.
              NOT shown for practice / writing / reading.
            */}
            {(!supported || (needsQuestions(taskType) && questions.length === 0 && !enriching)) && (
              <UnsupportedTaskFallback task={enrichedTask} onOpenFull={onOpenFull} />
            )}

            {/* Submitting strip */}
            {submitting && <SubmittingStrip />}

            {/* Error strip */}
            {submitError && !submitting && (
              <ErrorStrip message={submitError} onRetry={() => setSubmitError(null)} />
            )}

            {/* Submit bar — only for supported types with sufficient data */}
            {supported && !submitting && !(needsQuestions(taskType) && questions.length === 0) && (
              <SubmitBar
                canSubmit={canSubmit()}
                submitting={submitting}
                onSubmit={handleSubmit}
              />
            )}
          </div>
        )}
      </div>
    </>
  );
}