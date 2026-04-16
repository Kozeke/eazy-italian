import { useMemo, useState } from 'react';
import ExerciseHeader, {
  EXERCISE_HEADER_HEIGHT_PX,
} from '../exercise/ExerciseHeader';
import QuestionEditorRenderer, {
  emptyDraftFor,
  type OrderingWordsDraft,
  type QuestionDraft,
} from '../editors/QuestionEditorRenderer';
import { draftToApiPayload, validateDraft } from '../editors/questionPayload';
import './DragToGap.css';
import AIExerciseGeneratorModal, {
  type GeneratedBlock,
} from './AI_generation/AIExerciseGeneratorModal';
import type { TokenDraft } from '../editors/QuestionEditorRenderer';

interface Props {
  initialTitle?: string;
  initialDraft?: OrderingWordsDraft;
  label?: string;
  segmentId?: string | number | null;   // ← ADD THIS
  onSave: (
    title: string,
    payloads: Record<string, unknown>[],
    drafts: QuestionDraft[],
  ) => void | Promise<void>;
  onCancel: () => void;
}

// Add this helper function before the component
function applyGeneratedBlock(block: GeneratedBlock): {
  title: string;
  draft: OrderingWordsDraft;
} {
  const data = block.data as {
    title?: string;
    sentences?: Array<{ id: string; words: string[]; shuffled: string[]; sentence: string }>;
  };

  const title = data.title ?? block.title ?? '';
  const sentences = data.sentences ?? [];

  // Build one OrderingWordsDraft per sentence, merged as sentence_groups
  const tokens: TokenDraft[] = [];
  const sentenceGroups: string[][] = [];

  sentences.forEach((sent, sIdx) => {
    const groupIds: string[] = [];
    sent.words.forEach((word, wIdx) => {
      const id = `tok_${sIdx}_${wIdx}`;
      tokens.push({ id, text: word });
      groupIds.push(id);
    });
    sentenceGroups.push(groupIds);
  });

  const correct_order = tokens.map((t) => t.id);

  const draft: OrderingWordsDraft = {
    type: 'ordering_words',
    prompt: title,
    tokens,
    correct_order,
    score: 1,   // ← ADD THIS TOO
    metadata: { sentence_groups: sentenceGroups },
  };

  return { title, draft };
}

function normaliseDraft(initialDraft?: OrderingWordsDraft): OrderingWordsDraft {
  return initialDraft ?? (emptyDraftFor('ordering_words') as OrderingWordsDraft);
}

export default function BuildSentenceEditorPage({
  initialTitle = '',
  initialDraft,
  label = 'Build a sentence',
  onSave,
  onCancel,
  segmentId,
}: Props) {
  const [title, setTitle] = useState(initialTitle);
  const [draft, setDraft] = useState<OrderingWordsDraft>(() =>
    normaliseDraft(initialDraft),
  );
  // Inside the component, after the existing useState calls:
  const [showAIModal, setShowAIModal] = useState(false);

  const handleGenerated = (block: GeneratedBlock) => {
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
        type: 'build_sentence',
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

        <QuestionEditorRenderer draft={draft} onChange={(next) => setDraft(next as OrderingWordsDraft)}   onAIGenerate={() => setShowAIModal(true)}  />

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
                  ? 'Заполните задание и все слова перед сохранением'
                  : 'Сохранить упражнение'
              }
            >
              Сохранить
            </button>
          </div>
        </div>
      </div>
      {showAIModal && (
        <AIExerciseGeneratorModal
          open={showAIModal}
          onClose={() => setShowAIModal(false)}
          segmentId={segmentId}
          exerciseType="build_sentence"
          onGenerated={handleGenerated}
        />
      )}
          </div>
  );
}
