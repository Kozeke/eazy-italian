import { useCallback, useRef, useState } from 'react';
import { Check, Plus, Upload, X } from 'lucide-react';
import ExerciseHeader, {
  EXERCISE_HEADER_HEIGHT_PX,
} from '../exercise/ExerciseHeader';
import api from '../../../../services/api';
import AIExerciseGenerateButton from './AI_generation/AIExerciseGenerateButton';
import AIExerciseGeneratorModal, {
  type GeneratedBlock,
} from './AI_generation/AIExerciseGeneratorModal';
import './DragToGap.css';

export interface SelectFormToImageCard {
  id: string;
  imageUrl: string;
  options?: string[];
  answers: string[];
}

export interface SelectFormToImageData {
  title: string;
  cards: SelectFormToImageCard[];
}

interface Props {
  initialTitle?: string;
  initialData?: SelectFormToImageData;
  label?: string;
  onSave: (data: SelectFormToImageData, blockId?: string) => void;
  onCancel: () => void;
  segmentId?: string | number | null;
  exerciseType?: 'select_form_to_image';
  /** Header cog: return to exercise template gallery (ExerciseDraftsPage). */
  onSettingsClick?: () => void;
}

interface OptionDraft {
  id: string;
  value: string;
  checked: boolean;
}

interface CardDraft {
  id: string;
  imageUrl: string;
  options: OptionDraft[];
}

let cardCounter = 0;
const newCardId = () => `sfi_${++cardCounter}_${Date.now()}`;
let optionCounter = 0;
const newOptionId = () => `sfi_opt_${++optionCounter}_${Date.now()}`;

function createEmptyCard(): SelectFormToImageCard {
  return {
    id: newCardId(),
    imageUrl: '',
    answers: [''],
  };
}

function normaliseAnswer(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function sanitiseAnswers(answers: string[]): string[] {
  const seen = new Set<string>();
  const next: string[] = [];

  for (const answer of answers) {
    const trimmed = answer.trim();
    const key = normaliseAnswer(trimmed);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    next.push(trimmed);
  }

  return next;
}

function createOptionDraft(value = '', checked = true): OptionDraft {
  return {
    id: newOptionId(),
    value,
    checked,
  };
}

function createOptionDrafts(
  options: string[],
  answers: string[],
): OptionDraft[] {
  const mergedOptions = sanitiseAnswers([...options, ...answers]);
  if (mergedOptions.length === 0) {
    return [createOptionDraft()];
  }

  const correctSet = new Set(sanitiseAnswers(answers).map(normaliseAnswer));
  return mergedOptions.map((option) =>
    createOptionDraft(option, correctSet.has(normaliseAnswer(option))),
  );
}

function collectOptionValues(rows: OptionDraft[]): string[] {
  return sanitiseAnswers(rows.map((row) => row.value));
}

function collectCorrectAnswers(rows: OptionDraft[]): string[] {
  const validOptions = new Set(collectOptionValues(rows).map(normaliseAnswer));
  const seen = new Set<string>();
  const answers: string[] = [];

  for (const row of rows) {
    if (!row.checked) continue;

    const trimmed = row.value.trim();
    const key = normaliseAnswer(trimmed);
    if (!key || !validOptions.has(key) || seen.has(key)) continue;
    seen.add(key);
    answers.push(trimmed);
  }

  return answers;
}

function normaliseCard(card?: SelectFormToImageCard): CardDraft {
  return {
    id: card?.id ?? newCardId(),
    imageUrl: card?.imageUrl ?? '',
    options: createOptionDrafts(card?.options ?? card?.answers ?? [], card?.answers ?? []),
  };
}

function serialiseCard(card: CardDraft): SelectFormToImageCard {
  return {
    id: card.id,
    imageUrl: card.imageUrl.trim(),
    options: collectOptionValues(card.options),
    answers: collectCorrectAnswers(card.options),
  };
}

export default function SelectFormToImageEditorPage({
  initialTitle = '',
  initialData,
  label = 'Выбрать форму по изображению',
  onSave,
  onCancel,
  segmentId,
  onSettingsClick,
}: Props) {
  const [showAIModal, setShowAIModal] = useState(false);

  const [title, setTitle] = useState(initialData?.title ?? initialTitle);
  const [cards, setCards] = useState<CardDraft[]>(
    initialData?.cards?.length
      ? initialData.cards.map((card) => normaliseCard(card))
      : [normaliseCard(createEmptyCard())],
  );
  const [uploadingCardId, setUploadingCardId] = useState<string | null>(null);
  const [uploadErrors, setUploadErrors] = useState<Record<string, string>>({});
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  // Holds the server-assigned block id when AI generation persisted the block.
  // Passed to onSave so handleExerciseSave reuses it instead of generating a
  // new random id that would create a duplicate block on the segment.
  const generatedBlockIdRef = useRef<string | null>(null);

  const canSave =
    cards.length > 0 &&
    uploadingCardId === null &&
    cards.every(
      (card) =>
        card.imageUrl.trim() !== '' && serialiseCard(card).answers.length > 0,
    );

  const updateCard = (cardId: string, patch: Partial<CardDraft>) => {
    setCards((prev) =>
      prev.map((card) => (card.id === cardId ? { ...card, ...patch } : card)),
    );
  };

  const updateOption = (cardId: string, optionId: string, value: string) => {
    setCards((prev) =>
      prev.map((card) =>
        card.id === cardId
          ? {
              ...card,
              options: card.options.map((option) =>
                option.id === optionId ? { ...option, value } : option,
              ),
            }
          : card,
      ),
    );
  };

  const toggleOption = (cardId: string, optionId: string, checked: boolean) => {
    setCards((prev) =>
      prev.map((card) =>
        card.id === cardId
          ? {
              ...card,
              options: card.options.map((option) =>
                option.id === optionId ? { ...option, checked } : option,
              ),
            }
          : card,
      ),
    );
  };

  const addOption = (cardId: string) => {
    setCards((prev) =>
      prev.map((card) => {
        if (card.id !== cardId) return card;
        return {
          ...card,
          options: [...card.options, createOptionDraft()],
        };
      }),
    );
  };

  const removeOption = (cardId: string, optionId: string) => {
    setCards((prev) =>
      prev.map((card) => {
        if (card.id !== cardId) return card;
        if (card.options.length === 1) {
          return { ...card, options: [createOptionDraft()] };
        }
        return {
          ...card,
          options: card.options.filter((option) => option.id !== optionId),
        };
      }),
    );
  };

  const addCard = () => {
    setCards((prev) => [...prev, normaliseCard(createEmptyCard())]);
  };

  const removeCard = (cardId: string) => {
    setCards((prev) => {
      if (prev.length === 1) return prev;
      return prev.filter((card) => card.id !== cardId);
    });
  };

  const handleSave = () => {
    if (!canSave) return;
    // Embed _persistedBlockId inside the data object so it survives
    // ExerciseDraftsPage's onSave adapter — AdminRoutes reads it from
    // firstPayload.data._persistedBlockId and reuses the block id,
    // preventing a duplicate block from being appended to the segment.
    const data: SelectFormToImageData & { _persistedBlockId?: string } = {
      title: title.trim(),
      cards: cards.map((card) => serialiseCard(card)),
    };
    if (generatedBlockIdRef.current) data._persistedBlockId = generatedBlockIdRef.current;
    onSave(data, generatedBlockIdRef.current ?? undefined);
  };
  // Apply AI-generated select_form_to_image data into local draft state.
  const applyGeneratedBlock = useCallback((block: GeneratedBlock) => {
    // Capture the server-assigned id for use when the user saves the editor.
    generatedBlockIdRef.current = block.id;
    if (block.kind !== 'select_form_to_image' || !block.data || typeof block.data !== 'object') return;
    const d = block.data as SelectFormToImageData;
    setTitle(typeof d.title === 'string' ? d.title : block.title ?? '');
    setCards(
      Array.isArray(d.cards) && d.cards.length > 0
        ? d.cards.map((card) => normaliseCard(card))
        : [normaliseCard(createEmptyCard())],
    );
  }, []);

  const handleImageUpload = async (cardId: string, file?: File) => {
    if (!file) return;

    setUploadingCardId(cardId);
    setUploadErrors((prev) => {
      const next = { ...prev };
      delete next[cardId];
      return next;
    });

    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await api.post<Record<string, string | undefined>>(
        '/tests/questions/upload-image',
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        },
      );
      const result = response.data ?? {};
      const imageUrl =
        result.url ?? result.image_url ?? result.file_url ?? result.path ?? '';

      if (!imageUrl) {
        throw new Error('Image upload did not return a usable URL.');
      }

      updateCard(cardId, { imageUrl });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to upload image.';
      setUploadErrors((prev) => ({ ...prev, [cardId]: message }));
    } finally {
      setUploadingCardId((prev) => (prev === cardId ? null : prev));
      if (fileInputRefs.current[cardId]) {
        fileInputRefs.current[cardId]!.value = '';
      }
    }
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
        aria-label={label}
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
            Select the correct form under each image
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

        <div className="dti-editor-board" aria-label="Image cards with selectable forms">
          {cards.map((card, index) => {
            const hasImage = card.imageUrl.trim() !== '';
            const isUploading = uploadingCardId === card.id;
            const uploadError = uploadErrors[card.id];

            return (
              <div
                key={card.id}
                className="dti-editor-card"
                style={{ flexBasis: 256, width: 256 }}
              >
                {index > 0 && (
                  <button
                    type="button"
                    className="dti-editor-card-remove"
                    onClick={() => removeCard(card.id)}
                    aria-label="Remove image card"
                    title="Удалить карточку"
                  >
                    <X size={14} />
                  </button>
                )}

                <input
                  ref={(el) => {
                    fileInputRefs.current[card.id] = el;
                  }}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    void handleImageUpload(card.id, e.target.files?.[0]);
                  }}
                />

                <button
                  type="button"
                  className={[
                    'dti-image-slot',
                    hasImage ? 'dti-image-slot--filled' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  disabled={isUploading}
                  onClick={() => fileInputRefs.current[card.id]?.click()}
                  aria-label={hasImage ? 'Replace image' : 'Upload image'}
                  title={hasImage ? 'Заменить изображение' : 'Загрузить изображение'}
                >
                  {hasImage ? (
                    <img
                      src={card.imageUrl}
                      alt=""
                      className="dti-image-slot-preview"
                    />
                  ) : (
                    <span className="dti-image-slot-upload">
                      <Upload size={18} />
                      <span>{isUploading ? 'Uploading...' : 'Upload'}</span>
                    </span>
                  )}
                </button>

                <div className="dti-answer-row" style={{ alignItems: 'flex-start' }}>
                  <div className="dtg-variant-list" style={{ flex: 1 }}>
                    {card.options.map((option, optionIndex) => (
                      <div
                        key={option.id}
                        className="dtg-variant-row"
                        style={{
                          display: 'flex',
                          flexWrap: 'nowrap',
                          alignItems: 'center',
                          gap: 8,
                        }}
                      >
                        <label
                          className="dtg-variant-check"
                          aria-label={`Mark form ${optionIndex + 1} as correct`}
                        >
                          <input
                            type="checkbox"
                            checked={option.checked}
                            onChange={(e) =>
                              toggleOption(card.id, option.id, e.target.checked)
                            }
                          />
                        </label>
                        <input
                          type="text"
                          value={option.value}
                          onChange={(e) =>
                            updateOption(card.id, option.id, e.target.value)
                          }
                          className="dtg-variant-input"
                          style={{
                            flex: '0 0 148px',
                            width: 148,
                            minWidth: 148,
                            paddingRight: 12,
                          }}
                          placeholder={`Form ${optionIndex + 1}`}
                          aria-label={`Form ${optionIndex + 1}`}
                        />
                        <button
                          type="button"
                          className="dtg-variant-remove"
                          onClick={() => removeOption(card.id, option.id)}
                          aria-label={`Remove form ${optionIndex + 1}`}
                          title="Удалить вариант"
                          style={{
                            padding: 0,
                            width: 28,
                            minWidth: 28,
                            height: 28,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          <X size={13} />
                        </button>
                      </div>
                    ))}

                    <button
                      type="button"
                      className="dtg-variant-add"
                      onClick={() => addOption(card.id)}
                      style={{
                        width: 196,
                        padding: '5px 10px',
                        fontSize: 12,
                        borderRadius: 7,
                        justifyContent: 'center',
                        alignSelf: 'center',
                      }}
                    >
                      <Plus size={13} />
                      Добавить вариант
                    </button>
                  </div>
                </div>

                {uploadError && (
                  <div className="dti-upload-error" role="alert">
                    {uploadError}
                  </div>
                )}
              </div>
            );
          })}

          <button
            type="button"
            className="dti-add-card"
            onClick={addCard}
            aria-label="Add image card"
            title="Добавить карточку"
          >
            <Plus size={18} />
          </button>
        </div>

        <div className="dtg-footer">
          <div className="dtg-footer-btns">
            <button type="button" className="dtg-btn-cancel" onClick={onCancel}>
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
                  ? 'Добавьте изображение и хотя бы одну форму в каждую карточку'
                  : 'Сохранить упражнение'
              }
            >
              <Check size={14} />
              Сохранить
            </button>
          </div>
        </div>
      </div>

      <AIExerciseGeneratorModal
        open={showAIModal}
        onClose={() => setShowAIModal(false)}
        segmentId={segmentId}
        exerciseType="select_form_to_image"
        onGenerated={applyGeneratedBlock}
      />
    </div>
  );
}