import { useMemo, useState } from 'react';
import ExerciseHeader, {
  EXERCISE_HEADER_HEIGHT_PX,
} from '../exercise/ExerciseHeader';
import TestEditorStep, {
  EMPTY_TEST_DRAFT,
  type TestDraft,
  type TestQuestion,
} from '../editors/TestEditorStep';
import { draftToApiPayload, validateDraft } from '../editors/questionPayload';
import type { QuestionDraft } from '../editors/QuestionEditorRenderer';
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
  exerciseType?: 'test_with_timer';
  /** Header cog: return to exercise template gallery (ExerciseDraftsPage). */
  onSettingsClick?: () => void;
}

const DEFAULT_TIME_LIMIT = 10; // minutes — shown when no existing draft

function normaliseDraft(
  initialTitle: string,
  initialDraft?: TestDraft,
): TestDraft {
  const base = initialDraft ?? { ...EMPTY_TEST_DRAFT };
  return {
    ...base,
    title: base.title || initialTitle,
    // Preserve an existing limit; fall back to the default only when 0 / absent
    time_limit_minutes: base.time_limit_minutes || DEFAULT_TIME_LIMIT,
  };
}

/** Convert a raw AI-generated question object into a TestQuestion. */
function aiQuestionToTestQuestion(raw: Record<string, unknown>): TestQuestion {
  const id = Math.random().toString(36).slice(2, 9);
  const prompt = String(raw.prompt ?? raw.question ?? '');

  // Preserve original IDs from the AI payload so correct_option_ids can be resolved.
  const rawOptions: { originalId: string; text: string }[] = (
    Array.isArray(raw.options) ? raw.options : []
  ).map((o: unknown) => {
    if (typeof o === 'object' && o !== null) {
      const obj = o as Record<string, unknown>;
      return {
        originalId: String(obj.id ?? Math.random().toString(36).slice(2, 9)),
        text: String(obj.text ?? o),
      };
    }
    return { originalId: Math.random().toString(36).slice(2, 9), text: String(o) };
  });

  // Map original IDs → fresh internal IDs for this draft
  const originalToNew = new Map<string, string>(
    rawOptions.map((o) => [o.originalId, Math.random().toString(36).slice(2, 9)]),
  );

  const options: { id: string; text: string }[] = rawOptions.map((o) => ({
    id: originalToNew.get(o.originalId)!,
    text: o.text,
  }));

  // Prefer correct_option_ids (AI uses original IDs); fall back to correct_index
  const correctIds: string[] = [];
  if (options.length > 0) {
    const rawCorrectIds = Array.isArray(raw.correct_option_ids)
      ? (raw.correct_option_ids as unknown[]).map(String)
      : [];

    if (rawCorrectIds.length > 0) {
      for (const origId of rawCorrectIds) {
        const newId = originalToNew.get(origId);
        if (newId) correctIds.push(newId);
      }
    }

    if (correctIds.length === 0) {
      const correctIdx = typeof raw.correct_index === 'number' ? raw.correct_index : 0;
      correctIds.push((options[correctIdx] ?? options[0]).id);
    }
  }

  const typedDraft: QuestionDraft = {
    type: 'multiple_choice',
    prompt,
    options,
    correct_option_ids: correctIds,
    score: 1,
  } as QuestionDraft;

  return {
    id,
    prompt,
    answers: options.map((o) => ({
      id: o.id,
      text: o.text,
      isCorrect: correctIds.includes(o.id),
    })),
    typedDraft,
  };
}

/** Apply an AI-generated block, merging questions into the current draft.
 *  Preserves the existing time_limit_minutes set by the teacher. */
function applyGeneratedBlock(block: GeneratedBlock, prev: TestDraft): TestDraft {
  const data = block.data as Record<string, unknown>;
  const rawQuestions: unknown[] = Array.isArray(data.questions)
    ? data.questions
    : [];
  const newQuestions = rawQuestions
    .filter((q): q is Record<string, unknown> => typeof q === 'object' && q !== null)
    .map(aiQuestionToTestQuestion);

  const title = String(data.title ?? block.title ?? prev.title);

  return {
    ...prev,
    title: title || prev.title,
    // ↓ Keep the teacher-set time limit — do NOT reset it to 0
    time_limit_minutes: prev.time_limit_minutes || DEFAULT_TIME_LIMIT,
    questions: newQuestions.length > 0 ? newQuestions : prev.questions,
  };
}

export default function TestWithTimerEditorPage({
  initialTitle = '',
  initialDraft,
  label = 'Тест с таймером',
  onSave,
  onCancel,
  segmentId,
  exerciseType = 'test_with_timer',
  onSettingsClick,
}: Props) {
  const [draft, setDraft] = useState<TestDraft>(() =>
    normaliseDraft(initialTitle, initialDraft),
  );
  const [showAIModal, setShowAIModal] = useState(false);
  // Server-assigned block id set when AI generation saves a block to the segment.
  // Forwarded through the payload so handleExerciseSave reuses the same id
  // instead of generating a new random one that would produce a duplicate block.
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
        (questionDraft) => validateDraft(questionDraft).length === 0,
      ),
    [questionDrafts],
  );

  const handleChange = (next: TestDraft) => {
    // Preserve the time_limit_minutes that TestEditorStep manages
    setDraft(next);
  };

  const handleSave = async () => {
    if (!canSave) return;
    await onSave(
      draft.title.trim() || label,
      [
        {
          type: 'test_with_timer',
          _aiBlockId: generatedBlockId ?? undefined,
          data: {
            title: draft.title.trim() || label,
            time_limit_minutes: draft.time_limit_minutes || DEFAULT_TIME_LIMIT,
            questions: questionDrafts,
            payloads: questionDrafts.map(draftToApiPayload),
          },
        },
      ],
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
                  ? 'Заполните вопрос и варианты ответа перед сохранением'
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