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

// ── Shuffle helpers (mirrors BuildSentenceBlock.tsx) ─────────────────────────
// FNV-1a 32-bit hash with finalisation avalanche.
// The old polynomial hash (hash * 31 + charCode) produced nearly sequential
// output for sequential IDs like tok_0_0, tok_0_1 — those only differ in the
// last character so their hashes differed by exactly 1, sorting them back into
// reading order. FNV-1a + avalanche mix makes adjacent inputs diverge strongly.
function hashString(value: string): number {
  let h = 2166136261; // FNV-1a offset basis
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619); // FNV prime
    h >>>= 0;
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x45d9f3b);
  h >>>= 0;
  h ^= h >>> 16;
  return h >>> 0;
}

function deterministicShuffleByIds(ids: string[], seed: string): string[] {
  return [...ids].sort((a, b) => {
    const aHash = hashString(`${seed}:${a}`);
    const bHash = hashString(`${seed}:${b}`);
    if (aHash !== bHash) return aHash - bHash;
    return a.localeCompare(b);
  });
}
// ─────────────────────────────────────────────────────────────────────────────

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

  // Build tokens in correct reading order first (ids are stable positional refs)
  const tokenMap = new Map<string, TokenDraft>();
  const sentenceGroups: string[][] = [];

  sentences.forEach((sent, sIdx) => {
    const groupIds: string[] = [];
    sent.words.forEach((word, wIdx) => {
      const id = `tok_${sIdx}_${wIdx}`;
      tokenMap.set(id, { id, text: word });
      groupIds.push(id);
    });
    sentenceGroups.push(groupIds);
  });

  // correct_order stays in reading order — used for grading
  const correct_order = sentenceGroups.flat();

  // Shuffle the display order of tokens per sentence group (same logic as BuildSentenceBlock)
  const shuffledTokens: TokenDraft[] = [];
  sentenceGroups.forEach((groupIds, sIdx) => {
    const seed = `editor:bs-pool:${sIdx}:${groupIds[0] ?? ''}`;
    const shuffledIds = deterministicShuffleByIds(groupIds, seed);
    shuffledIds.forEach((id) => {
      const t = tokenMap.get(id);
      if (t) shuffledTokens.push(t);
    });
  });

  const draft: OrderingWordsDraft = {
    type: 'ordering_words',
    prompt: title,
    tokens: shuffledTokens,
    correct_order,
    score: 1,
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
        type: 'build_sentence',
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
            Build the correct sentence from the words
          </div>
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