import { useMemo, useState } from 'react';
import { Plus, Sparkles, X } from 'lucide-react';
import ExerciseHeader, {
  EXERCISE_HEADER_HEIGHT_PX,
} from '../exercise/ExerciseHeader';
import {
  emptyDraftFor,
  type MatchingPairsDraft,
  type PairDraft,
} from '../editors/QuestionEditorRenderer';
import { draftToApiPayload, validateDraft } from '../editors/questionPayload';
import './DragToGap.css';
import AIExerciseGeneratorModal, {
  type GeneratedBlock,
} from './AI_generation/AIExerciseGeneratorModal';

interface Props {
  initialTitle?: string;
  initialDraft?: MatchingPairsDraft;
  label?: string;
  segmentId?: string | number | null;   // ← ADD THIS
  onSave: (
    title: string,
    payloads: Record<string, unknown>[],
    drafts: MatchingPairsDraft[],
  ) => void | Promise<void>;
  onCancel: () => void;
}

interface PairRowDraft {
  id: string;
  leftId: string;
  rightId: string;
  left: string;
  right: string;
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function makeEmptyRow(): PairRowDraft {
  return {
    id: uid(),
    leftId: uid(),
    rightId: uid(),
    left: '',
    right: '',
  };
}

function normaliseDraft(initialDraft?: MatchingPairsDraft): MatchingPairsDraft {
  return initialDraft ?? (emptyDraftFor('matching_pairs') as MatchingPairsDraft);
}

// ── Helper: map AI output → rows ───────────────────────────────────────────
function applyGeneratedBlock(block: GeneratedBlock): {
  title: string;
  rows: PairRowDraft[];
} {
  const data = block.data as {
    title?: string;
    // Simple format: [{left, right}]
    pairs?: Array<{ left?: string; right?: string; left_id?: string; right_id?: string }>;
    // API flat format: left_items + right_items + pairs with left_id/right_id
    left_items?: Array<{ id: string; text: string }>;
    right_items?: Array<{ id: string; text: string }>;
  };
  const title = data.title ?? block.title ?? '';

  // ── API flat format (AI-generated): left_items + right_items + pairs ──────
  if (Array.isArray(data.left_items) && data.left_items.length > 0) {
    const rightById = new Map((data.right_items ?? []).map((r) => [r.id, r.text]));
    const pairsArr = (data.pairs ?? []) as Array<{ left_id: string; right_id: string }>;
    const rows: PairRowDraft[] = pairsArr.map((p) => ({
      id: uid(),
      leftId: p.left_id,
      rightId: p.right_id,
      left: data.left_items!.find((l) => l.id === p.left_id)?.text ?? '',
      right: rightById.get(p.right_id) ?? '',
    }));
    return { title, rows: rows.length > 0 ? rows : [makeEmptyRow()] };
  }

  // ── Simple format: pairs = [{left, right}] ────────────────────────────────
  const rows: PairRowDraft[] = ((data.pairs ?? []) as Array<{ left?: string; right?: string }>).map((p) => ({
    id: uid(),
    leftId: uid(),
    rightId: uid(),
    left: p.left ?? '',
    right: p.right ?? '',
  }));
  return { title, rows: rows.length > 0 ? rows : [makeEmptyRow()] };
}

function normaliseRows(initialDraft?: MatchingPairsDraft): PairRowDraft[] {
  const draft = normaliseDraft(initialDraft);
  const rightById = new Map(draft.right_items.map((item) => [item.id, item]));
  const pairByLeftId = new Map(draft.pairs.map((pair) => [pair.left_id, pair]));

  const rows = draft.left_items.map((leftItem) => {
    const pair = pairByLeftId.get(leftItem.id);
    const rightItem = pair ? rightById.get(pair.right_id) : undefined;
    return {
      id: uid(),
      leftId: leftItem.id,
      rightId: rightItem?.id ?? uid(),
      left: leftItem.text ?? '',
      right: rightItem?.text ?? '',
    };
  });

  return rows.length > 0 ? rows : [makeEmptyRow()];
}

/**
 * Sattolo shuffle — identical to Fisher-Yates except j is drawn from [0, i)
 * instead of [0, i].  That single change guarantees EVERY element moves
 * (a proper random derangement), with uniform distribution over all
 * derangements.
 *
 * When applied to an array where index i holds the correct match for
 * left_items[i], the result satisfies:  result[i] ≠ correct match for
 * left_items[i]  for every i  →  no correct pair ever sits in the same row.
 */
function sattoloShuffle<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * i); // [0, i) ← the only diff from Fisher-Yates
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function buildDraftFromRows(
  previousDraft: MatchingPairsDraft,
  rows: PairRowDraft[],
  prompt: string,
): MatchingPairsDraft {
  const safeRows = rows.map((row) => ({
    ...row,
    left: row.left.trim(),
    right: row.right.trim(),
  }));

  const left_items = safeRows.map((row) => ({
    id: row.leftId,
    text: row.left,
  }));

  // right_items_ordered[i] is the correct match for left_items[i].
  // Sattolo guarantees result[i] ≠ right_items_ordered[i] for ALL i,
  // so no correct pair occupies the same row in the player — and the
  // layout is truly random (not a predictable rotation or X-cross).
  const right_items_ordered = safeRows.map((row) => ({
    id: row.rightId,
    text: row.right,
  }));
  const right_items =
    right_items_ordered.length > 1
      ? sattoloShuffle(right_items_ordered)
      : right_items_ordered;

  const pairs: PairDraft[] = safeRows.map((row) => ({
    left_id: row.leftId,
    right_id: row.rightId,
  }));

  return {
    ...previousDraft,
    type: 'matching_pairs',
    prompt,
    left_items,
    right_items,
    pairs,
    // Right items are already deranged above; no further shuffle at render time.
    shuffle_right: false,
    score: previousDraft.score ?? 1,
  };
}

export default function MatchPairsEditorPage({
  initialTitle = '',
  initialDraft,
  label = 'Match pairs',
  onSave,
  onCancel,
  segmentId,          // ← ADD THIS
}: Props) {
  const baseDraft = useMemo(() => normaliseDraft(initialDraft), [initialDraft]);
  const [title, setTitle] = useState(initialTitle);
  const [rows, setRows] = useState<PairRowDraft[]>(() => normaliseRows(initialDraft));
  const [showAIModal, setShowAIModal] = useState(false);
  // Server-assigned block id from AI generation — forwarded in the payload so
  // handleExerciseSave upserts the existing block instead of appending a duplicate.
  const [generatedBlockId, setGeneratedBlockId] = useState<string | null>(null);

  const handleGenerated = (block: GeneratedBlock) => {
    setGeneratedBlockId(block.id);
    const { title: newTitle, rows: newRows } = applyGeneratedBlock(block);
    if (newTitle) setTitle(newTitle);
    setRows(newRows);
    setShowAIModal(false);
  };
  const preparedDraft = useMemo(
    () =>
      buildDraftFromRows(
        baseDraft,
        rows,
        title.trim() || label,
      ),
    [baseDraft, rows, title, label],
  );

  const rowsAreValid =
    rows.length > 0 &&
    rows.every(
      (row) => row.left.trim().length > 0 && row.right.trim().length > 0,
    );
  const canSave = rowsAreValid && validateDraft(preparedDraft).length === 0;

  const updateRow = (
    rowId: string,
    side: 'left' | 'right',
    value: string,
  ) => {
    setRows((prev) =>
      prev.map((row) =>
        row.id === rowId
          ? {
              ...row,
              [side]: value,
            }
          : row,
      ),
    );
  };

  const addRow = () => {
    setRows((prev) => [...prev, makeEmptyRow()]);
  };

  const removeRow = (rowId: string) => {
    setRows((prev) => {
      const next = prev.filter((row) => row.id !== rowId);
      return next.length > 0 ? next : [makeEmptyRow()];
    });
  };

  const handleSave = async () => {
    if (!canSave) return;
    const resolvedTitle = title.trim() || label;
    await onSave(
      resolvedTitle,
      [{
        type: 'match_pairs',
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
            Match each left word with the correct right word
          </div>
        </div>

        <div className="mp-editor-card">
          <div className="mp-editor-head">
            <div className="mp-editor-col-label">Left word</div>
            <div className="mp-editor-col-label">Right word</div>
            <div />
          </div>

          <div className="mp-editor-rows">
            {rows.map((row) => (
              <div key={row.id} className="mp-editor-row">
                <input
                  type="text"
                  value={row.left}
                  onChange={(e) => updateRow(row.id, 'left', e.target.value)}
                  placeholder="Write left word"
                  className="mp-editor-input"
                />
                <input
                  type="text"
                  value={row.right}
                  onChange={(e) => updateRow(row.id, 'right', e.target.value)}
                  placeholder="Write right word"
                  className="mp-editor-input"
                />
                <button
                  type="button"
                  className="mp-editor-remove"
                  onClick={() => removeRow(row.id)}
                  aria-label="Remove pair"
                  title="Remove pair"
                >
                  <X size={15} />
                </button>
              </div>
            ))}
          </div>

          <div className="mp-editor-actions">
            <button
              type="button"
              className="mp-editor-add"
              onClick={addRow}
            >
              <Plus size={15} />
              Add couple
            </button>

            <button
              type="button"
              className="dtg-generate-btn"
              style={{ margin: 0 }}
              onClick={() => setShowAIModal(true)}   // ← ADD onClick
            >
              <Sparkles size={13} />
              Сгенерировать
            </button>
          </div>
        </div>

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
                  ? 'Заполните обе колонки перед сохранением'
                  : 'Сохранить упражнение'
              }
            >
              Сохранить
            </button>
          </div>
        </div>
      </div>
      <AIExerciseGeneratorModal
        exerciseType="match_pairs"
        open={showAIModal}
        onClose={() => setShowAIModal(false)}
        segmentId={segmentId}
        onGenerated={handleGenerated}
      />
    </div>
  );
}