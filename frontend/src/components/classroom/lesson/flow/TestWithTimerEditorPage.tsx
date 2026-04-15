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

// ── Design tokens (matches project-wide system) ───────────────────────────────
const C = {
  primary:   '#6C6FEF',
  primaryDk: '#4F52C2',
  tint:      '#EEF0FE',
  bg:        '#F7F7FA',
  white:     '#FFFFFF',
  text:      '#1C1F3A',
  sub:       '#6B6F8E',
  muted:     '#A8ABCA',
  border:    '#E8EAFD',
  success:   '#10B981',
};

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
  const options: { id: string; text: string }[] = (
    Array.isArray(raw.options) ? raw.options : []
  ).map((o: unknown) => ({
    id: Math.random().toString(36).slice(2, 9),
    text: String(
      typeof o === 'object' && o !== null
        ? (o as Record<string, unknown>).text ?? o
        : o,
    ),
  }));

  const correctIds: string[] = [];
  if (options.length > 0) {
    const correctIdx =
      typeof raw.correct_index === 'number' ? raw.correct_index : 0;
    const correctOpt = options[correctIdx] ?? options[0];
    correctIds.push(correctOpt.id);
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
}: Props) {
  const [draft, setDraft] = useState<TestDraft>(() =>
    normaliseDraft(initialTitle, initialDraft),
  );
  const [showAIModal, setShowAIModal] = useState(false);

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
    setDraft((prev) => applyGeneratedBlock(block, prev));
    setShowAIModal(false);
  };

  return (
    <div className="dtg-editor-root">
      <ExerciseHeader
        title={draft.title}
        headerLabel={label}
        editableTitleInHeader={false}
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
          <label className="dtg-pro-toggle">
            Pro
            <input type="checkbox" style={{ marginLeft: 6 }} />
          </label>

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