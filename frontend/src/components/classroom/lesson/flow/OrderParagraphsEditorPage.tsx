import { useMemo, useState } from 'react';
import ExerciseHeader, {
  EXERCISE_HEADER_HEIGHT_PX,
} from '../exercise/ExerciseHeader';
import QuestionEditorRenderer, {
  emptyDraftFor,
  type OrderingSentencesDraft,
  type QuestionDraft,
  type TokenDraft,
} from '../editors/QuestionEditorRenderer';
import { draftToApiPayload, validateDraft } from '../editors/questionPayload';
import './DragToGap.css';
import AIExerciseGenerateButton from './AI_generation/AIExerciseGenerateButton';
import AIExerciseGeneratorModal, {
  type GeneratedBlock,
} from './AI_generation/AIExerciseGeneratorModal';

interface Props {
  initialTitle?: string;
  initialDraft?: OrderingSentencesDraft;
  label?: string;
  segmentId?: string | number | null;
  onSave: (
    title: string,
    payloads: Record<string, unknown>[],
    drafts: QuestionDraft[],
  ) => void | Promise<void>;
  onCancel: () => void;
  /** Header cog: return to exercise template gallery (ExerciseDraftsPage). */
  onSettingsClick?: () => void;
}

function applyGeneratedBlock(block: GeneratedBlock): {
  title: string;
  draft: OrderingSentencesDraft;
} {
  const data = block.data as {
    title?: string;
    // Actual API shape: items array with id, text, correct_order (1-based index)
    items?: Array<{ id: string; text: string; correct_order?: number }>;
    // Legacy shape (kept for safety): flat array of paragraph strings
    paragraphs?: string[];
  };

  const title = data.title ?? block.title ?? '';

  let items: TokenDraft[];
  let correct_order: string[];

  if (data.items && data.items.length > 0) {
    // ── Real API response ──────────────────────────────────────────────────
    // Sort by correct_order (1-based) to derive the canonical sequence,
    // then build TokenDraft items preserving the original ids.
    const sorted = [...data.items].sort(
      (a, b) => (a.correct_order ?? 0) - (b.correct_order ?? 0),
    );
    items = sorted.map((item) => ({ id: item.id, text: item.text }));
    correct_order = sorted.map((item) => item.id);
  } else {
    // ── Fallback: legacy paragraphs[] shape ───────────────────────────────
    const paragraphs = data.paragraphs ?? [];
    items = paragraphs.map((text, idx) => ({ id: `para_${idx}`, text }));
    correct_order = items.map((item) => item.id);
  }

  const draft: OrderingSentencesDraft = {
    type: 'ordering_sentences',
    prompt: title,
    items,
    correct_order,
    score: 1,
  };

  return { title, draft };
}

function normaliseDraft(initialDraft?: OrderingSentencesDraft): OrderingSentencesDraft {
  return initialDraft ?? (emptyDraftFor('ordering_sentences') as OrderingSentencesDraft);
}

export default function OrderParagraphsEditorPage({
  initialTitle = '',
  initialDraft,
  label = 'Order paragraphs',
  onSave,
  onCancel,
  segmentId,
  onSettingsClick,
}: Props) {
  const [title, setTitle] = useState(initialTitle);
  const [draft, setDraft] = useState<OrderingSentencesDraft>(() =>
    normaliseDraft(initialDraft),
  );
  const [showAIModal, setShowAIModal] = useState(false);
  // Server-assigned block id from AI generation — forwarded in the payload so
  // handleExerciseSave upserts the existing block instead of appending a duplicate.
  const [generatedBlockId, setGeneratedBlockId] = useState<string | null>(null);

  const handleGenerated = (block: GeneratedBlock) => {
    setGeneratedBlockId(block.id);
    const { title: newTitle, draft: newDraft } = applyGeneratedBlock(block);
    if (newTitle) setTitle(newTitle);
    setDraft(newDraft);
    setShowAIModal(false);
  };

  const preparedDraft = useMemo(
    () => ({
      ...draft,
      prompt: draft.prompt.trim() || title.trim() || label,
    }),
    [draft, title, label],
  );

  const canSave = useMemo(
    () => validateDraft(preparedDraft).length === 0,
    [preparedDraft],
  );

  const handleSave = async () => {
    if (!canSave) return;
    const resolvedTitle = title.trim() || label;
    await onSave(
      resolvedTitle,
      [{
        type: 'order_paragraphs',
        _aiBlockId: generatedBlockId ?? undefined,
        data: {
          title: resolvedTitle,
          question: preparedDraft,
          payload: draftToApiPayload(preparedDraft),
        },
      }],
      [preparedDraft],
    );
  };

  return (
    <div className="dtg-editor-root">
      <ExerciseHeader
        title={title}
        headerLabel={label}
        editableTitleInHeader={false}
        onSettingsClick={onSettingsClick}
        onClose={onCancel}
      />

      <div
        className="dtg-editor-content"
        style={{ paddingTop: EXERCISE_HEADER_HEIGHT_PX + 14 }}
      >
        <div className="dtg-title-row">
          <input
            className="dtg-title-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Название упражнения"
            aria-label="Exercise title"
          />
        </div>

        <div className="dtg-editor-title-preview">
          <div className="dtg-exercise-instruction">
            Arrange the paragraphs in the correct order
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            flexWrap: 'wrap',
            gap: 10,
            marginBottom: 10,
          }}
        >
          <AIExerciseGenerateButton
            onClick={() => setShowAIModal(true)}
            style={{ margin: 0 }}
          />
        </div>

        <QuestionEditorRenderer
          draft={draft}
          onChange={(next) => setDraft(next as OrderingSentencesDraft)}
        />

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
                  ? 'Заполните все предложения перед сохранением'
                  : 'Сохранить упражнение'
              }
            >
              Сохранить
            </button>
          </div>
        </div>
      </div>

      <AIExerciseGeneratorModal
        open={showAIModal}
        onClose={() => setShowAIModal(false)}
        segmentId={segmentId}
        exerciseType="order_paragraphs"
        onGenerated={handleGenerated}
      />
    </div>
  );
}