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
  exerciseType?: 'test_without_timer';
}

function normaliseDraft(
  initialTitle: string,
  initialDraft?: TestDraft,
): TestDraft {
  const base = initialDraft ?? { ...EMPTY_TEST_DRAFT };
  return {
    ...base,
    title: base.title || initialTitle,
    time_limit_minutes: 0,
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

/** Apply an AI-generated block, merging questions into draft. */
function applyGeneratedBlock(block: GeneratedBlock, prev: TestDraft): TestDraft {
  const data = block.data as Record<string, unknown>;
  const rawQuestions: unknown[] = Array.isArray(data.questions) ? data.questions : [];
  const newQuestions = rawQuestions
    .filter((q): q is Record<string, unknown> => typeof q === 'object' && q !== null)
    .map(aiQuestionToTestQuestion);

  const title = String(data.title ?? block.title ?? prev.title);

  // Replace current questions with AI-generated ones (or append if desired)
  return {
    ...prev,
    title: title || prev.title,
    time_limit_minutes: 0,
    questions: newQuestions.length > 0 ? newQuestions : prev.questions,
  };
}

export default function TestWithoutTimerEditorPage({
  initialTitle = '',
  initialDraft,
  label = 'Тест без таймера',
  onSave,
  onCancel,
  segmentId,
  exerciseType = 'test_without_timer',
}: Props) {
  const [draft, setDraft] = useState<TestDraft>(() =>
    normaliseDraft(initialTitle, initialDraft),
  );
  const [showAIModal, setShowAIModal] = useState(false);
  // Tracks the server-assigned block ID when AI generation already persisted
  // the block to the segment. Passed through onSave so AdminRoutes reuses the
  // same ID instead of generating a new random one (which would create a duplicate).
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
      questionDrafts.every((questionDraft) => validateDraft(questionDraft).length === 0),
    [questionDrafts],
  );

  const handleChange = (next: TestDraft) => {
    setDraft({
      ...next,
      time_limit_minutes: 0,
    });
  };

  const handleSave = async () => {
    if (!canSave) return;
    await onSave(
      draft.title.trim() || label,
      [{
        type: 'test_without_timer',
        // Carry the AI-assigned block id so AdminRoutes.handleExerciseSave
        // reuses it instead of generating a fresh random id (which would
        // cause a duplicate block to be appended to the segment).
        _aiBlockId: generatedBlockId ?? undefined,
        data: {
          title: draft.title.trim() || label,
          questions: questionDrafts,
          payloads: questionDrafts.map(draftToApiPayload),
        },
      }],
      questionDrafts,
    );
  };

  const handleGenerated = (block: GeneratedBlock) => {
    // Store the server-assigned block id so handleSave can pass it through
    // the payload, preventing persistCustomLessonBlockToSegment from creating
    // a duplicate block with a freshly generated random id.
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

        {/* ── AI Generate button ─────────────────────────────────────────── */}
        {/* <button
          type="button"
          className="dtg-generate-btn"
          onClick={() => setShowAIModal(true)}
          style={{
            display:        'inline-flex',
            alignItems:     'center',
            gap:            6,
            marginTop:      4,
            padding:        '8px 16px',
            borderRadius:   10,
            border:         `1.5px solid ${C.border}`,
            background:     C.tint,
            color:          C.primary,
            fontSize:       13,
            fontWeight:     600,
            cursor:         'pointer',
            transition:     'background 0.15s, border-color 0.15s',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = '#DDE1FC';
            (e.currentTarget as HTMLButtonElement).style.borderColor = C.primary;
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = C.tint;
            (e.currentTarget as HTMLButtonElement).style.borderColor = C.border;
          }}
        >
          <Sparkles size={14} />
          Сгенерировать с AI
        </button> */}

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