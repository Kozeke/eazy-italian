/**
 * TestEditorStep.tsx  (v3 — question persistence)
 *
 * Changes from v2:
 * ─────────────────
 * • TestQuestion now carries an optional `questionId?: number` — the real
 *   backend id returned after POST /tests/{id}/questions.
 *   When questionId is present, Save calls PUT /admin/questions/{id}.
 *   When it is absent, Save calls POST /tests/{id}/questions.
 *   This is the ONLY structural change needed in this file.
 *
 * • TestAnswer carries an optional `answerId?: number` for future use but
 *   is not required by the current save flow.
 *
 * • All rendering, UX, and EMPTY_TEST_DRAFT are unchanged from v2.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  ChevronDown, ChevronUp,
  Plus, Sparkles, X, Info,
} from 'lucide-react';

// Phase-4: typed question editor dispatcher
import QuestionEditorRenderer, {
  type MultipleChoiceDraft,
  type QuestionDraft,
  emptyDraftFor,
} from './QuestionEditorRenderer';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TestAnswer {
  id:        string;   // client-only uuid
  answerId?: number;   // backend id (future-use)
  text:      string;
  isCorrect: boolean;
}

export interface TestQuestion {
  id:          string;   // client-only uuid (stable key for React)
  questionId?: number;   // ← real backend id; absent = not yet saved
  prompt:      string;
  answers:     TestAnswer[];
  /** Phase-4: typed draft for new question types. When present, this is the
   *  source of truth for the question body and answers is ignored. */
  typedDraft?: QuestionDraft;
}

/** Full draft — superset of v1/v2 so existing save handlers stay intact. */
export interface TestDraft {
  // ── v1 fields (unchanged) ──────────────────────────────────────────────────
  title:               string;
  description:         string;
  instructions:        string;
  time_limit_minutes:  number;   // 0 = unlimited
  passing_score:       number;   // 0–100 %
  // ── v2 additions ──────────────────────────────────────────────────────────
  questions:           TestQuestion[];
}

function makeId(): string {
  return Math.random().toString(36).slice(2, 9);
}

function makeAnswer(
  id: string = makeId(),
  text = '',
  isCorrect = false,
): TestAnswer {
  return { id, text, isCorrect };
}

function createMultipleChoiceDraft(
  prompt = '',
  answers: TestAnswer[] = [makeAnswer(), makeAnswer()],
): MultipleChoiceDraft {
  const safeAnswers = answers.length >= 2 ? answers : [...answers, makeAnswer(), makeAnswer()].slice(0, 2);
  return {
    type: 'multiple_choice',
    prompt,
    options: safeAnswers.map((answer) => ({
      id: answer.id,
      text: answer.text,
    })),
    correct_option_ids: safeAnswers
      .filter((answer) => answer.isCorrect)
      .map((answer) => answer.id),
    score: 1,
  };
}

function syncLegacyFields(question: TestQuestion, draft: QuestionDraft): TestQuestion {
  if (draft.type === 'multiple_choice') {
    return {
      ...question,
      prompt: draft.prompt,
      typedDraft: draft,
      answers: draft.options.map((option) => ({
        id: option.id,
        text: option.text,
        isCorrect: draft.correct_option_ids.includes(option.id),
      })),
    };
  }

  return {
    ...question,
    prompt: draft.prompt,
    typedDraft: draft,
  };
}

function normaliseQuestion(question: TestQuestion): TestQuestion {
  const draft =
    question.typedDraft ??
    createMultipleChoiceDraft(question.prompt, question.answers);

  return syncLegacyFields(question, draft);
}

function normaliseQuestions(
  questions?: TestQuestion[],
  defaultQuestionType: QuestionDraft["type"] = "multiple_choice",
): TestQuestion[] {
  const next = (questions ?? []).map(normaliseQuestion);
  return next.length > 0 ? next : [makeQuestion(defaultQuestionType)];
}

function normaliseDraft(
  draft?: TestDraft,
  lockTimeLimitToZero = true,
  defaultQuestionType: QuestionDraft["type"] = "multiple_choice",
): TestDraft {
  const base = draft ?? { ...EMPTY_TEST_DRAFT };
  return {
    ...base,
    time_limit_minutes: lockTimeLimitToZero
      ? 0
      : base.time_limit_minutes,
    questions: normaliseQuestions(base.questions, defaultQuestionType),
  };
}

function makeQuestion(
  type: QuestionDraft["type"] = "multiple_choice",
): TestQuestion {
  return syncLegacyFields({
    id:      makeId(),
    prompt:  '',
    answers: [],
  }, emptyDraftFor(type) as QuestionDraft);
}

export const EMPTY_TEST_DRAFT: TestDraft = {
  title:               '',
  description:         '',
  instructions:        '',
  time_limit_minutes:  0,
  passing_score:       60,
  questions:           [makeQuestion()],
};

// ─── Props ────────────────────────────────────────────────────────────────────

export interface TestEditorStepProps {
  draft?:    TestDraft;
  onChange?: (draft: TestDraft) => void;
  lockTimeLimitToZero?: boolean;
  defaultQuestionType?: QuestionDraft["type"];
  /** Called when the teacher clicks "Сгенерировать" — opens the AI modal in the parent. */
  onAIGenerate?: () => void;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Inline editable title at the very top of the shell (above the card). */
function TitleInput({
  value,
  onChange,
}: {
  value:    string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Test title…"
      aria-label="Test title"
      className={[
        'w-full bg-transparent text-[20px] font-bold text-slate-800 placeholder-slate-300',
        'border-b-2 border-transparent focus:border-cyan-500',
        'pb-1 focus:outline-none transition-colors duration-150',
        'caret-cyan-500',
      ].join(' ')}
    />
  );
}

// ─── QuestionBlock ─────────────────────────────────────────────────────────────

function QuestionBlock({
  question,
  onChange,
  onRemove,
  canRemove,
}: {
  question:  TestQuestion;
  onChange:  (q: TestQuestion) => void;
  onRemove:  () => void;
  canRemove: boolean;
}) {
  const typedDraft =
    question.typedDraft ??
    createMultipleChoiceDraft(question.prompt, question.answers);

  return (
    <div className="relative px-4 py-4">
      <div className="pr-8">
        <QuestionEditorRenderer
          draft={typedDraft}
          onChange={(draft) => onChange(syncLegacyFields(question, draft))}
        />
      </div>

      <div className="absolute right-4 top-4">
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="text-slate-300 hover:text-red-400 transition-colors focus:outline-none"
            aria-label="Remove question"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── AdvancedSettings ─────────────────────────────────────────────────────────

function AdvancedSettings({
  draft,
  onUpdate,
}: {
  draft:    TestDraft;
  onUpdate: <K extends keyof TestDraft>(key: K, value: TestDraft[K]) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-2xl border border-slate-100 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={[
          'w-full flex items-center justify-between px-5 py-3.5',
          'text-[13px] font-semibold text-slate-500 hover:text-slate-700',
          'bg-slate-50 transition-colors focus:outline-none',
        ].join(' ')}
      >
        <span className="inline-flex items-center gap-2">
          <Info className="h-4 w-4" />
          Advanced settings
        </span>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {open && (
        <div className="px-5 py-4 flex flex-col gap-4 bg-white">
          {/* Description */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              Description <span className="normal-case font-normal text-slate-300">(optional)</span>
            </label>
            <textarea
              value={draft.description}
              onChange={(e) => onUpdate('description', e.target.value)}
              placeholder="Short summary shown to students before they start."
              rows={2}
              className={[
                'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 resize-none',
                'text-[13px] text-slate-800 placeholder-slate-300',
                'focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100',
                'transition-colors',
              ].join(' ')}
            />
          </div>

          {/* Instructions */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              Instructions <span className="normal-case font-normal text-slate-300">(optional)</span>
            </label>
            <textarea
              value={draft.instructions}
              onChange={(e) => onUpdate('instructions', e.target.value)}
              placeholder="e.g. Answer all questions. You may not use your notes."
              rows={2}
              className={[
                'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 resize-none',
                'text-[13px] text-slate-800 placeholder-slate-300',
                'focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100',
                'transition-colors',
              ].join(' ')}
            />
          </div>

          {/* Passing score */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              Passing score
            </label>
            <div className="flex items-center gap-0 rounded-xl border border-slate-200 bg-white overflow-hidden w-fit">
              <button
                type="button"
                onClick={() => onUpdate('passing_score', Math.max(0, draft.passing_score - 5))}
                disabled={draft.passing_score <= 0}
                className="px-3 py-2 text-slate-500 hover:bg-slate-50 disabled:opacity-30 transition-colors focus:outline-none"
              >−</button>
              <span className="min-w-[72px] px-3 py-2 text-center text-[14px] font-semibold text-slate-800 border-x border-slate-200">
                {draft.passing_score}%
              </span>
              <button
                type="button"
                onClick={() => onUpdate('passing_score', Math.min(100, draft.passing_score + 5))}
                disabled={draft.passing_score >= 100}
                className="px-3 py-2 text-slate-500 hover:bg-slate-50 disabled:opacity-30 transition-colors focus:outline-none"
              >+</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function TestEditorStep({
  draft: initialDraft,
  onChange,
  lockTimeLimitToZero = true,
  defaultQuestionType = "multiple_choice",
  onAIGenerate,
}: TestEditorStepProps) {
  const [draft, setDraft] = useState<TestDraft>(() =>
    normaliseDraft(initialDraft, lockTimeLimitToZero, defaultQuestionType),
  );
  const draftRef = useRef(draft);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  // Keep in sync when the parent refreshes the draft (e.g. teacher opens a
  // different existing test while this frame stays mounted).
  const prevDraftRef = useRef(initialDraft);
  useEffect(() => {
    if (initialDraft && initialDraft !== prevDraftRef.current) {
      prevDraftRef.current = initialDraft;
      const next = normaliseDraft(
        initialDraft,
        lockTimeLimitToZero,
        defaultQuestionType,
      );
      draftRef.current = next;
      setDraft(next);
    }
  }, [defaultQuestionType, initialDraft, lockTimeLimitToZero]);

  // Temporarily hide advanced settings in this editor step.
  // (Kept in code for quick re-enable without losing the implementation.)
  const showAdvancedSettings = false;

  const questionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const pendingScrollQuestionIdRef = useRef<string | null>(null);

  const commitDraft = useCallback(
    (updater: (prev: TestDraft) => TestDraft) => {
      const next = updater(draftRef.current);
      draftRef.current = next;
      setDraft(next);
      onChange?.(next);
    },
    [onChange],
  );

  const update = useCallback(<K extends keyof TestDraft>(key: K, value: TestDraft[K]) => {
    commitDraft((prev) => ({
      ...prev,
      [key]: value,
      ...(lockTimeLimitToZero ? { time_limit_minutes: 0 } : {}),
    }));
  }, [commitDraft, lockTimeLimitToZero]);

  // ── Question mutations ────────────────────────────────────────────────────

  const updateQuestion = useCallback((qId: string, updated: TestQuestion) => {
    commitDraft((prev) => ({
      ...prev,
      ...(lockTimeLimitToZero ? { time_limit_minutes: 0 } : {}),
      questions: prev.questions.map((q) => q.id === qId ? normaliseQuestion(updated) : q),
    }));
  }, [commitDraft, lockTimeLimitToZero]);

  const removeQuestion = useCallback((qId: string) => {
    commitDraft((prev) => ({
      ...prev,
      ...(lockTimeLimitToZero ? { time_limit_minutes: 0 } : {}),
      questions: prev.questions.filter((q) => q.id !== qId),
    }));
  }, [commitDraft, lockTimeLimitToZero]);

  const addQuestion = useCallback(() => {
    const q = makeQuestion(defaultQuestionType);
    pendingScrollQuestionIdRef.current = q.id;
    commitDraft((prev) => ({
      ...prev,
      ...(lockTimeLimitToZero ? { time_limit_minutes: 0 } : {}),
      questions: [...prev.questions, q],
    }));
  }, [commitDraft, defaultQuestionType, lockTimeLimitToZero]);

  useEffect(() => {
    const questionId = pendingScrollQuestionIdRef.current;
    if (!questionId) return;

    questionRefs.current[questionId]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    pendingScrollQuestionIdRef.current = null;
  }, [draft.questions.length]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-5">

      {/* ── A. Inline title ─────────────────────────────────────────────── */}
      <TitleInput
        value={draft.title}
        onChange={(v) => update('title', v)}
      />

      {/* ── B. Questions ────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        {draft.questions.map((q, idx) => (
          <div
            key={q.id}
            ref={(node) => {
              questionRefs.current[q.id] = node;
            }}
            className={idx > 0 ? 'border-t border-slate-100' : ''}
          >
            <QuestionBlock
              question={q}
              onChange={(updated) => updateQuestion(q.id, updated)}
              onRemove={() => removeQuestion(q.id)}
              canRemove={draft.questions.length > 1}
            />
          </div>
        ))}
      </div>

      {/* ── C. Footer actions ───────────────────────────────────────────── */}
      <div
        className="flex items-center gap-3 py-2"
      >
        <button
          type="button"
          onClick={addQuestion}
          className={[
            'inline-flex items-center gap-1.5 rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-1.5',
            'text-[13px] font-medium text-cyan-700 hover:border-cyan-300 hover:bg-cyan-100',
            'transition-colors focus:outline-none',
          ].join(' ')}
        >
          <Plus className="h-4 w-4" />
          Добавить вопрос
        </button>

        <button
          type="button"
          className={[
            'inline-flex items-center gap-1.5 text-[13px] font-medium text-cyan-600',
            'hover:text-cyan-700 transition-colors focus:outline-none',
          ].join(' ')}
          aria-label="AI generate questions"
          onClick={onAIGenerate}
          disabled={!onAIGenerate}
        >
          <Sparkles className="h-4 w-4" />
          Сгенерировать
        </button>
      </div>

      {/* ── D. Advanced (collapsible) ────────────────────────────────────── */}
      {showAdvancedSettings && (
        <AdvancedSettings draft={draft} onUpdate={update} />
      )}

    </div>
  );
}