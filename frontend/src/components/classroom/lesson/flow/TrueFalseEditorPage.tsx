/**
 * TrueFalseEditorPage.tsx
 *
 * True/False exercise editor page that reuses shared test editor layout and footer actions.
 */
import { useMemo, useState } from 'react';
import ExerciseHeader, {
  EXERCISE_HEADER_HEIGHT_PX,
} from '../exercise/ExerciseHeader';
import TestEditorStep, {
  type TestDraft,
  type TestQuestion,
} from '../editors/TestEditorStep';
import {
  emptyDraftFor,
  type QuestionDraft,
  type TrueFalseDraft,
} from '../editors/QuestionEditorRenderer';
import { draftToApiPayload, validateDraft } from '../editors/questionPayload';
import AIExerciseGeneratorModal, {
  type GeneratedBlock,
} from './AI_generation/AIExerciseGeneratorModal';
import './DragToGap.css';

interface Props {
  initialTitle?: string;
  initialDraft?: TestDraft;
  label?: string;
  onSave: (
    title: string,
    payloads: Record<string, unknown>[],
    drafts: QuestionDraft[],
  ) => void | Promise<void>;
  onCancel: () => void;
  segmentId?: string | number | null;
  exerciseType?: 'true_false';
  /** Header cog: return to exercise template gallery (ExerciseDraftsPage). */
  onSettingsClick?: () => void;
}

function makeId(): string {
  return Math.random().toString(36).slice(2, 9);
}

function makeTrueFalseQuestion(): TestQuestion {
  const draft = emptyDraftFor('true_false') as TrueFalseDraft;
  return {
    id: makeId(),
    prompt: draft.prompt,
    answers: [],
    typedDraft: draft,
  };
}

function normaliseDraft(
  initialTitle: string,
  initialDraft?: TestDraft,
): TestDraft {
  const base = initialDraft ?? {
    title: '',
    description: '',
    instructions: '',
    time_limit_minutes: 0,
    passing_score: 60,
    questions: [makeTrueFalseQuestion()],
  };

  return {
    ...base,
    title: base.title || initialTitle,
    time_limit_minutes:
      typeof base.time_limit_minutes === 'number' && base.time_limit_minutes > 0
        ? Math.min(180, Math.round(base.time_limit_minutes))
        : 0,
    questions: base.questions.length > 0 ? base.questions : [makeTrueFalseQuestion()],
  };
}

function clampTimeLimit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(180, Math.max(0, Math.round(value)));
}

/** Convert a raw AI-generated question into a true_false TestQuestion. */
function aiQuestionToTrueFalseQuestion(raw: Record<string, unknown>): TestQuestion {
  const id = makeId();
  const prompt = String(raw.prompt ?? raw.question ?? raw.statement ?? '');

  // The AI may return correct_answer as true/false boolean or string
  const rawAnswer = raw.correct_answer ?? raw.answer ?? raw.is_true;
  const isTrue =
    typeof rawAnswer === 'boolean'
      ? rawAnswer
      : String(rawAnswer).toLowerCase() === 'true';

  const trueDraft = emptyDraftFor('true_false') as TrueFalseDraft;
  const typedDraft: TrueFalseDraft = {
    ...trueDraft,
    prompt,
    correct_option_id: isTrue ? 'true' : 'false',
  };

  return {
    id,
    prompt,
    answers: [],
    typedDraft,
  };
}

/** Apply an AI-generated block, merging true/false questions into the current draft.
 *  Preserves the existing time_limit_minutes set by the teacher. */
function applyGeneratedBlock(block: GeneratedBlock, prev: TestDraft): TestDraft {
  const data = block.data as Record<string, unknown>;

  // Support both `questions` and `statements` arrays from the AI response
  const rawQuestions: unknown[] = Array.isArray(data.questions)
    ? data.questions
    : Array.isArray(data.statements)
    ? data.statements
    : [];

  const newQuestions = rawQuestions
    .filter((q): q is Record<string, unknown> => typeof q === 'object' && q !== null)
    .map(aiQuestionToTrueFalseQuestion);

  const title = String(data.title ?? block.title ?? prev.title ?? '');

  return {
    ...prev,
    title: title || prev.title,
    // Keep the teacher-set time limit — do NOT reset it
    time_limit_minutes: prev.time_limit_minutes,
    questions: newQuestions.length > 0 ? newQuestions : prev.questions,
  };
}

export default function TrueFalseEditorPage({
  initialTitle = '',
  initialDraft,
  label = 'True / False',
  onSave,
  onCancel,
  segmentId,
  exerciseType = 'true_false',
  onSettingsClick,
}: Props) {
  const [draft, setDraft] = useState<TestDraft>(() =>
    normaliseDraft(initialTitle, initialDraft),
  );
  const [showAIModal, setShowAIModal] = useState(false);
  // Server-assigned block id from AI generation — forwarded in the payload so
  // handleExerciseSave upserts the existing block instead of appending a duplicate.
  const [generatedBlockId, setGeneratedBlockId] = useState<string | null>(null);

  const questionDrafts = useMemo(
    () =>
      draft.questions
        .map((question) => question.typedDraft)
        .filter(Boolean) as QuestionDraft[],
    [draft.questions],
  );

  const canSave = useMemo(
    () =>
      questionDrafts.length > 0 &&
      questionDrafts.every(
        (questionDraft) =>
          questionDraft.type === 'true_false' &&
          validateDraft(questionDraft).length === 0,
      ),
    [questionDrafts],
  );

  const handleChange = (next: TestDraft) => {
    setDraft({
      ...next,
      time_limit_minutes: clampTimeLimit(next.time_limit_minutes),
    });
  };

  const handleSave = async () => {
    if (!canSave) return;
    const resolvedTitle = draft.title.trim() || label;
    const type = draft.time_limit_minutes > 0 ? 'test_with_timer' : 'test_without_timer';

    await onSave(
      resolvedTitle,
      [{
        type,
        _aiBlockId: generatedBlockId ?? undefined,
        data: {
          title: resolvedTitle,
          ...(type === 'test_with_timer'
            ? { time_limit_minutes: clampTimeLimit(draft.time_limit_minutes) }
            : {}),
          questions: questionDrafts,
          payloads: questionDrafts.map(draftToApiPayload),
        },
      }],
      questionDrafts,
    );
  };

  const handleGenerated = (block: GeneratedBlock) => {
    setGeneratedBlockId(block.id);
    setDraft((prev) => applyGeneratedBlock(block, prev));
    setShowAIModal(false);
  };

  return (
    <div className="dtg-editor-root">
      <ExerciseHeader
        title={draft.title}
        headerLabel={label}
        editableTitleInHeader={false}
        onSettingsClick={onSettingsClick}
        onClose={onCancel}
      />

      <div
        className="dtg-editor-content"
        style={{ paddingTop: EXERCISE_HEADER_HEIGHT_PX + 14 }}
      >
        <TestEditorStep
          draft={draft}
          onChange={handleChange}
          onAIGenerate={() => setShowAIModal(true)}
          lockTimeLimitToZero={false}
          defaultQuestionType="true_false"
        />

        {/* ── AI Modal ──────────────────────────────────────────────────────── */}
        <AIExerciseGeneratorModal
          exerciseType={exerciseType}
          open={showAIModal}
          onClose={() => setShowAIModal(false)}
          segmentId={segmentId}
          onGenerated={handleGenerated}
        />

        {/* ── Footer ────────────────────────────────────────────────────────── */}
        <div className="dtg-footer">
          {/*
          <label className="dtg-pro-toggle">
            Pro
            <input type="checkbox" style={{ marginLeft: 6 }} />
          </label>
          */}

          <div className="dtg-footer-btns">
            <button
              type="button"
              className="dtg-btn-cancel"
              onClick={onCancel}
            >
              Отмена
            </button>
            <button
              type="button"
              className={[
                'dtg-btn-save',
                !canSave ? 'dtg-btn-save--disabled' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={handleSave}
              disabled={!canSave}
              title={
                !canSave
                  ? 'Добавьте валидные вопросы True / False'
                  : 'Сохранить упражнение'
              }
            >
              Сохранить
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}