import { useMemo, useState } from 'react';
import { GripVertical, Plus, Sparkles, Trash2 } from 'lucide-react';
import ExerciseHeader, {
  EXERCISE_HEADER_HEIGHT_PX,
} from '../exercise/ExerciseHeader';
import {
  emptyDraftFor,
  type OrderingWordsDraft,
  type TokenDraft,
} from '../editors/QuestionEditorRenderer';
import { draftToApiPayload, validateDraft } from '../editors/questionPayload';
import './DragToGap.css';
// After the existing imports, add:
import AIExerciseGeneratorModal, {
  type GeneratedBlock,
} from './AI_generation/AIExerciseGeneratorModal';

interface Props {
  initialTitle?: string;
  initialDraft?: OrderingWordsDraft;
  label?: string;
  segmentId?: string | number | null;   // ← ADD
  onSave: (
    title: string,
    payloads: Record<string, unknown>[],
    drafts: OrderingWordsDraft[],
  ) => void | Promise<void>;
  onCancel: () => void;
}

interface ColumnDraft {
  title: string;
  words: TokenDraft[];
}

function makeEmptyToken(): TokenDraft {
  return {
    id: Math.random().toString(36).slice(2, 9),
    text: '',
  };
}

function makeDefaultColumn(): ColumnDraft {
  return {
    title: '',
    words: [makeEmptyToken(), makeEmptyToken()],
  };
}

function normaliseDraft(initialDraft?: OrderingWordsDraft): OrderingWordsDraft {
  return initialDraft ?? (emptyDraftFor('ordering_words') as OrderingWordsDraft);
}

function normaliseColumns(initialDraft?: OrderingWordsDraft): ColumnDraft[] {
  const draft = normaliseDraft(initialDraft);
  const tokenMap = new Map(draft.tokens.map((token) => [token.id, token]));
  const rawGroups = Array.isArray(draft.metadata?.sentence_groups)
    ? draft.metadata.sentence_groups
    : [];
  const rawTitles = Array.isArray(draft.metadata?.column_titles)
    ? draft.metadata.column_titles
    : [];

  const groups = rawGroups
    .map((group, index) => ({
      title: typeof rawTitles[index] === 'string' ? rawTitles[index] : '',
      words: group
        .map((tokenId) => tokenMap.get(tokenId))
        .filter(Boolean)
        .map((token) => ({ ...(token as TokenDraft) })),
    }))
    .filter((group) => group.words.length > 0);

  if (groups.length >= 2) return groups;

  return [makeDefaultColumn(), makeDefaultColumn()];
}

function scrambleTokenIds(ids: string[]): string[] {
  if (ids.length <= 1) return [...ids];
  if (ids.length === 2) return [ids[1], ids[0]];

  const odds = ids.filter((_, index) => index % 2 === 1).reverse();
  const evens = ids.filter((_, index) => index % 2 === 0);
  const scrambled = [...odds, ...evens];

  return scrambled.every((id, index) => id === ids[index])
    ? [...ids.slice(1), ids[0]]
    : scrambled;
}

function applyGeneratedBlock(block: GeneratedBlock): {
  title: string;
  columns: ColumnDraft[];
} {
  const data = block.data as {
    title?: string;
    columns?: Array<{ title: string; words: string[] }>;
  };

  const title = data.title ?? block.title ?? '';
  const rawColumns = data.columns ?? [];

  const columns: ColumnDraft[] = rawColumns.map((col) => ({
    title: col.title ?? '',
    words: (col.words ?? []).map((w) => ({
      id: Math.random().toString(36).slice(2, 9),
      text: w,
    })),
  }));

  // Ensure at least 2 columns so the editor invariant is never broken
  while (columns.length < 2) columns.push(makeDefaultColumn());

  return { title, columns };
}

function buildDraftFromColumns(
  previousDraft: OrderingWordsDraft,
  columns: ColumnDraft[],
): OrderingWordsDraft {
  const safeColumns = columns.map((column) => ({
    title: column.title,
    words: column.words.map((word) => ({ ...word })),
  }));
  const orderedTokens = safeColumns.flatMap((column) => column.words);
  const correctOrder = orderedTokens.map((token) => token.id);
  const tokenById = new Map(orderedTokens.map((token) => [token.id, token]));

  return {
    ...previousDraft,
    tokens: scrambleTokenIds(correctOrder)
      .map((tokenId) => tokenById.get(tokenId))
      .filter(Boolean)
      .map((token) => ({ ...(token as TokenDraft) })),
    correct_order: correctOrder,
    metadata: {
      ...(previousDraft.metadata ?? {}),
      sentence_groups: safeColumns.map((column) =>
        column.words.map((token) => token.id),
      ),
      column_titles: safeColumns.map((column) => column.title),
    },
  };
}

export default function SortIntoColumnsEditorPage({
  initialTitle = '',
  initialDraft,
  label = 'Sort into columns',
  onSave,
  segmentId,          // ← ADD
  onCancel,
}: Props) {
  const baseDraft = useMemo(() => normaliseDraft(initialDraft), [initialDraft]);
  const [title, setTitle] = useState(initialTitle);
  const [columns, setColumns] = useState<ColumnDraft[]>(() =>
    normaliseColumns(initialDraft),
  );
  const [showAIModal, setShowAIModal] = useState(false);   // ← ADD
    const handleGenerated = (block: GeneratedBlock) => {     // ← ADD
    const { title: newTitle, columns: newColumns } = applyGeneratedBlock(block);
    if (newTitle) setTitle(newTitle);
    setColumns(newColumns);
  };
  const preparedDraft = useMemo(
    () => ({
      ...buildDraftFromColumns(baseDraft, columns),
      prompt: title.trim() || label,
    }),
    [baseDraft, columns, title, label],
  );

  const columnsAreValid =
    columns.length >= 2 &&
    columns.every(
      (column) =>
        column.title.trim().length > 0 &&
        column.words.length > 0 &&
        column.words.every((word) => word.text.trim().length > 0),
    );

  const canSave =
    columnsAreValid &&
    preparedDraft.tokens.length >= 2 &&
    validateDraft(preparedDraft).length === 0;

  const previewWords = useMemo(
    () =>
      columns.flatMap((column) =>
        column.words
          .map((word) => ({ id: word.id, text: word.text.trim() }))
          .filter((word) => word.text.length > 0),
      ),
    [columns],
  );

  const updateColumn = (
    columnIndex: number,
    updater: (column: ColumnDraft) => ColumnDraft,
  ) =>
    setColumns((prev) =>
      prev.map((column, index) =>
        index === columnIndex ? updater(column) : column,
      ),
    );

  const updateWord = (
    columnIndex: number,
    tokenId: string,
    text: string,
  ) => {
    updateColumn(columnIndex, (column) => ({
      ...column,
      words: column.words.map((word) =>
        word.id === tokenId ? { ...word, text } : word,
      ),
    }));
  };

  const addWord = (columnIndex: number) => {
    updateColumn(columnIndex, (column) => ({
      ...column,
      words: [...column.words, makeEmptyToken()],
    }));
  };

  const removeWord = (columnIndex: number, tokenId: string) => {
    updateColumn(columnIndex, (column) => ({
      ...column,
      words:
        column.words.length > 1
          ? column.words.filter((word) => word.id !== tokenId)
          : [makeEmptyToken()],
    }));
  };

  const updateColumnTitle = (columnIndex: number, nextTitle: string) => {
    updateColumn(columnIndex, (column) => ({
      ...column,
      title: nextTitle,
    }));
  };

  const addColumn = () => {
    setColumns((prev) => [...prev, makeDefaultColumn()]);
  };

  const removeColumn = (columnIndex: number) => {
    setColumns((prev) => {
      if (prev.length <= 2) return prev;
      return prev.filter((_, index) => index !== columnIndex);
    });
  };

  const handleSave = async () => {
    if (!canSave) return;

    const resolvedTitle = title.trim() || label;
    await onSave(
      resolvedTitle,
      [{
        type: 'sort_into_columns',
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

        <div
          className="dtg-words-bar"
          style={{ marginBottom: 14 }}
        >
          {previewWords.length === 0 ? (
            <span className="dtg-words-bar-hint">
              Added words will appear here
            </span>
          ) : (
            previewWords.map((word) => (
              <span key={word.id} className="dtg-chip dtg-chip--preview">
                <GripVertical size={11} />
                {word.text}
              </span>
            ))
          )}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: 16,
            alignItems: 'start',
            marginBottom: 22,
          }}
        >
          {columns.map((column, columnIndex) => (
            <div
              key={`column-${columnIndex}`}
              style={{
                borderRadius: 20,
                border: '1.5px solid #e8eaf4',
                background: '#f8fafc',
                padding: 16,
                minHeight: 250,
                boxSizing: 'border-box',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'stretch',
                justifyContent: 'flex-start',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  marginBottom: 14,
                }}
              >
                <input
                  type="text"
                  value={column.title}
                  onChange={(e) => updateColumnTitle(columnIndex, e.target.value)}
                  placeholder="Column title"
                  style={{
                    flex: 1,
                    border: 'none',
                    outline: 'none',
                    background: '#fff',
                    borderRadius: 12,
                    padding: '12px 14px',
                    fontSize: 14,
                    fontWeight: 700,
                    color: '#1a1d3a',
                    boxShadow: 'inset 0 0 0 1.5px #e8eaf4',
                    fontFamily: 'inherit',
                  }}
                />
                <button
                  type="button"
                  onClick={() => removeColumn(columnIndex)}
                  disabled={columns.length <= 2}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 10,
                    border: 'none',
                    background: 'transparent',
                    color: columns.length <= 2 ? '#d4d6ea' : '#94a3b8',
                    cursor: columns.length <= 2 ? 'not-allowed' : 'pointer',
                    flexShrink: 0,
                  }}
                  aria-label={`Remove column ${columnIndex + 1}`}
                  title="Удалить колонку"
                >
                  <Trash2 size={16} />
                </button>
              </div>

              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 10,
                  alignContent: 'flex-start',
                  minHeight: 120,
                }}
              >
                {column.words.length === 0 && (
                  <span
                    className="dtg-words-bar-hint"
                    style={{ width: '100%' }}
                  >
                    Drop words here
                  </span>
                )}

                {column.words.map((word) => (
                  <div
                    key={word.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '8px 10px',
                      borderRadius: 14,
                      border: '1.5px solid #e8eaf4',
                      background: '#fff',
                    }}
                  >
                    <input
                      type="text"
                      value={word.text}
                      onChange={(e) =>
                        updateWord(columnIndex, word.id, e.target.value)
                      }
                      placeholder="Write a word"
                      style={{
                        flex: 1,
                        border: 'none',
                        outline: 'none',
                        background: 'transparent',
                        fontSize: 13,
                        color: '#1a1d3a',
                        fontFamily: 'inherit',
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => removeWord(columnIndex, word.id)}
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 8,
                        border: 'none',
                        background: 'transparent',
                        color: '#94a3b8',
                        cursor: 'pointer',
                        flexShrink: 0,
                      }}
                      aria-label="Remove word"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => addWord(columnIndex)}
                style={{
                  marginTop: 12,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  border: 'none',
                  background: 'transparent',
                  color: '#4f52c2',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                <Plus size={14} />
                Add word
              </button>
            </div>
          ))}

          <div
            style={{
              borderRadius: 20,
              border: '1.5px dashed #cbd5e1',
              background: '#ffffff',
              padding: 16,
              minHeight: 250,
              boxSizing: 'border-box',
              display: 'flex',
              alignItems: 'flex-end',
            }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                width: '100%',
              }}
            >
              <button
                type="button"
                onClick={addColumn}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  minHeight: 48,
                  borderRadius: 14,
                  border: '1.5px solid #e8eaf4',
                  background: '#f8fafc',
                  color: '#1a1d3a',
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                <Plus size={16} />
                Add column
              </button>

              <button
                type="button"
                className="dtg-generate-btn"
                style={{ width: '100%', justifyContent: 'center', margin: 0 }}
                onClick={() => setShowAIModal(true)}
              >
                <Sparkles size={13} />
                Сгенерировать
              </button>
            </div>
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
                  ? 'Заполните названия колонок и все слова перед сохранением'
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
          exerciseType="sort_into_columns"
          onGenerated={handleGenerated}
        />
      )}
    </div>
  );
}