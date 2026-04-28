import React, {
  useState,
  useRef,
  useCallback,
  useEffect,
  memo,
  useMemo,
} from 'react';
import {
  Sparkles,
  Trash2,
  Check,
  Plus,
} from 'lucide-react';
import ExerciseHeader, { EXERCISE_HEADER_HEIGHT_PX } from '../exercise/ExerciseHeader';
import type { TextSeg, GapSeg, Segment } from './DragToGapEditorPage';
import './DragToGap.css';
import AIExerciseGeneratorModal, {
  type GeneratedBlock,
} from './AI_generation/AIExerciseGeneratorModal';

export type { TextSeg, GapSeg, Segment };

export interface SelectWordFormGapConfig {
  options: string[];
  correctAnswers: string[];
}

export interface SelectWordFormData {
  title: string;
  segments: Segment[];
  gaps: Record<string, SelectWordFormGapConfig | string[]>;
}

interface VariantDraft {
  id: string;
  value: string;
  checked: boolean;
}

interface Props {
  initialTitle?: string;
  initialData?: SelectWordFormData;
  label?: string;
  onSave: (data: SelectWordFormData, blockId?: string) => void;
  onCancel: () => void;
  segmentId?: string | number | null;
}

let gapCounter = 0;
const newGapId = () => `swf_g${++gapCounter}_${Date.now()}`;
let variantCounter = 0;
const newVariantId = () => `swf_v${++variantCounter}_${Date.now()}`;

function normaliseAnswer(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function createVariantDraft(value = '', checked = true): VariantDraft {
  return {
    id: newVariantId(),
    value,
    checked,
  };
}

function sanitiseVariantValues(values: string[]): string[] {
  const seen = new Set<string>();
  const next: string[] = [];

  for (const value of values) {
    const trimmed = value.trim();
    const key = normaliseAnswer(trimmed);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    next.push(trimmed);
  }

  return next;
}

function normaliseGapConfig(
  gapConfig?: SelectWordFormGapConfig | string[],
): SelectWordFormGapConfig {
  if (Array.isArray(gapConfig)) {
    const values = sanitiseVariantValues(gapConfig);
    return {
      options: values,
      correctAnswers: values,
    };
  }

  const correctAnswers = sanitiseVariantValues(gapConfig?.correctAnswers ?? []);
  const options = sanitiseVariantValues([
    ...(gapConfig?.options ?? []),
    ...correctAnswers,
  ]);
  const correctSet = new Set(correctAnswers.map(normaliseAnswer));

  return {
    options,
    correctAnswers: options.filter((option) => correctSet.has(normaliseAnswer(option))),
  };
}

function normaliseGapState(
  gaps?: SelectWordFormData['gaps'],
): Record<string, SelectWordFormGapConfig> {
  if (!gaps) return {};

  return Object.fromEntries(
    Object.entries(gaps).map(([gapId, gapConfig]) => [
      gapId,
      normaliseGapConfig(gapConfig),
    ]),
  );
}

function createVariantDrafts(gapConfig: SelectWordFormGapConfig): VariantDraft[] {
  if (gapConfig.options.length === 0) {
    return [createVariantDraft()];
  }

  const correctSet = new Set(gapConfig.correctAnswers.map(normaliseAnswer));

  return gapConfig.options.map((option) =>
    createVariantDraft(option, correctSet.has(normaliseAnswer(option))),
  );
}

function collectCheckedVariants(rows: VariantDraft[]): string[] {
  const allVariants = collectAllVariants(rows);
  const allVariantKeys = new Set(allVariants.map(normaliseAnswer));
  const seen = new Set<string>();
  const answers: string[] = [];

  for (const row of rows) {
    if (!row.checked) continue;

    const trimmed = row.value.trim();
    if (!trimmed) continue;

    const key = normaliseAnswer(trimmed);
    if (!allVariantKeys.has(key) || seen.has(key)) continue;
    seen.add(key);
    answers.push(trimmed);
  }

  return answers;
}

function collectAllVariants(rows: VariantDraft[]): string[] {
  return sanitiseVariantValues(rows.map((row) => row.value));
}

function formatGapPreview(answers: string[]): string {
  if (answers.length === 0) return '';
  if (answers.length === 1) return answers[0];
  const preview = answers.slice(0, 2).join(' / ');
  return answers.length > 2 ? `${preview} +${answers.length - 2}` : preview;
}

const TextSpan = memo(
  function TextSpan({
    initial,
    onFocus,
    divRef,
    onBracketInsert,
  }: {
    initial: string;
    onFocus: () => void;
    divRef: (el: HTMLSpanElement | null) => void;
    /** Called when the user types "[]" so parent can insert a gap at cursor. */
    onBracketInsert?: () => void;
  }) {
    const innerRef = useRef<HTMLSpanElement>(null);
    // Keeps the latest callback without causing TextSpan re-renders.
    const onBracketInsertRef = useRef(onBracketInsert);
    onBracketInsertRef.current = onBracketInsert;

    useEffect(() => {
      if (innerRef.current) innerRef.current.textContent = initial;
    }, [initial]);

    // Converts typed "[]" into an actual gap token at the current cursor.
    const handleInput = useCallback(() => {
      const editableElement = innerRef.current;
      if (!editableElement) return;
      const editableText = editableElement.textContent ?? '';
      const bracketIndex = editableText.indexOf('[]');
      if (bracketIndex === -1) return;

      const textWithoutBrackets =
        editableText.slice(0, bracketIndex) + editableText.slice(bracketIndex + 2);
      editableElement.textContent = textWithoutBrackets;

      const selection = window.getSelection();
      if (selection) {
        const caretRange = document.createRange();
        if (textWithoutBrackets.length > 0 && editableElement.firstChild) {
          caretRange.setStart(
            editableElement.firstChild,
            Math.min(bracketIndex, textWithoutBrackets.length),
          );
        } else {
          caretRange.setStart(editableElement, 0);
        }
        caretRange.collapse(true);
        selection.removeAllRanges();
        selection.addRange(caretRange);
      }

      onBracketInsertRef.current?.();
    }, []);

    return (
      <span
        ref={(el) => {
          (innerRef as React.MutableRefObject<HTMLSpanElement | null>).current = el;
          divRef(el);
        }}
        contentEditable
        suppressContentEditableWarning
        className="dtg-text-seg"
        onFocus={onFocus}
        onInput={handleInput}
      />
    );
  },
  () => true,
);

export default function SelectWordFormEditorPage({
  initialTitle = '',
  initialData,
  label = 'Выбрать форму слова',
  onSave,
  segmentId,
  onCancel,
}: Props) {
  const [title, setTitle] = useState(initialData?.title ?? initialTitle);
  const [segments, setSegments] = useState<Segment[]>(
    initialData?.segments ?? [{ type: 'text', value: '' }],
  );
  const [gaps, setGaps] = useState<Record<string, SelectWordFormGapConfig>>(
    () => normaliseGapState(initialData?.gaps),
  );
  const [activeGapId, setActiveGapId] = useState<string | null>(null);
  const [variantRows, setVariantRows] = useState<VariantDraft[]>(() =>
    createVariantDrafts(normaliseGapConfig()),
  );
  const [isEditorFocused, setIsEditorFocused] = useState(false);
  const [insertMode, setInsertMode] = useState(false);
  const [version, setVersion] = useState(0);
  const [showAIModal, setShowAIModal] = useState(false);

  const spanRefs = useRef<Record<number, HTMLSpanElement | null>>({});
  const lastFocusedIdx = useRef<number | null>(null);
  const variantInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const rootRef = useRef<HTMLDivElement>(null);
  // Tracks editor DOM node for anchoring the floating gap editor panel.
  const editorRef = useRef<HTMLDivElement>(null);
  // Stores each rendered gap element to position the floating panel under active gap.
  const gapRefs = useRef<Record<string, HTMLSpanElement | null>>({});
  // Stores floating panel coordinates relative to dtg-main-editor.
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null);
  // Holds the server-assigned block id when AI generation persisted the block.
  // Passed to onSave so handleExerciseSave reuses it instead of generating a
  // new random id that would create a duplicate block on the segment.
  const generatedBlockIdRef = useRef<string | null>(null);

  const selectedVariants = useMemo(
    () => collectCheckedVariants(variantRows),
    [variantRows],
  );

  const closeGapEditor = useCallback(() => {
    setActiveGapId(null);
    setPopoverPos(null);
    setVariantRows(createVariantDrafts(normaliseGapConfig()));
  }, []);

  const openGapEditor = useCallback((gapId: string, gapConfig: SelectWordFormGapConfig) => {
    setActiveGapId(gapId);
    setVariantRows(createVariantDrafts(gapConfig));
  }, []);

  // Recomputes the floating panel position every time a different gap is opened.
  useEffect(() => {
    if (!activeGapId) {
      setPopoverPos(null);
      return;
    }
    const gapElement = gapRefs.current[activeGapId];
    const editorElement = editorRef.current;
    if (!gapElement || !editorElement) return;
    const gapRect = gapElement.getBoundingClientRect();
    const editorRect = editorElement.getBoundingClientRect();
    const panelWidth = editorRect.width * 0.45;
    let nextLeft = gapRect.left - editorRect.left;
    const maxLeft = editorRect.width - panelWidth - 8;
    nextLeft = Math.min(Math.max(0, nextLeft), Math.max(0, maxLeft));
    setPopoverPos({
      top: gapRect.bottom - editorRect.top + 6,
      left: nextLeft,
    });
  }, [activeGapId]);

  const syncFromDOM = useCallback(
    (segs: Segment[]): Segment[] =>
      segs.map((seg, idx) => {
        if (seg.type === 'text') {
          const el = spanRefs.current[idx];
          return { type: 'text', value: el?.textContent ?? (seg as TextSeg).value };
        }
        return seg;
      }),
    [],
  );

  const insertGap = useCallback(() => {
    const synced = syncFromDOM(segments);

    const focusIdx = lastFocusedIdx.current;
    let targetIdx = -1;
    if (focusIdx !== null && synced[focusIdx]?.type === 'text') {
      targetIdx = focusIdx;
    } else {
      for (let i = synced.length - 1; i >= 0; i--) {
        if (synced[i].type === 'text') {
          targetIdx = i;
          break;
        }
      }
    }
    if (targetIdx < 0) return;

    let cursorPos = (synced[targetIdx] as TextSeg).value.length;
    const span = spanRefs.current[targetIdx];
    if (span) {
      const sel = window.getSelection();
      if (sel?.rangeCount && span.contains(sel.anchorNode)) {
        try {
          const range = sel.getRangeAt(0);
          const pre = document.createRange();
          pre.selectNodeContents(span);
          pre.setEnd(range.startContainer, range.startOffset);
          cursorPos = pre.toString().length;
        } catch {
          // Fall back to inserting at the end of the segment.
        }
      }
    }

    const gapId = newGapId();
    const fullText = (synced[targetIdx] as TextSeg).value;
    const nextSegments: Segment[] = [
      ...synced.slice(0, targetIdx),
      { type: 'text', value: fullText.slice(0, cursorPos) },
      { type: 'gap', id: gapId },
      { type: 'text', value: fullText.slice(cursorPos) },
      ...synced.slice(targetIdx + 1),
    ];

    setSegments(nextSegments);
    const emptyGap = normaliseGapConfig();

    setGaps((prev) => ({ ...prev, [gapId]: emptyGap }));
    setVersion((prev) => prev + 1);
    openGapEditor(gapId, emptyGap);
    setInsertMode(false);
  }, [openGapEditor, segments, syncFromDOM]);

  const confirmAnswer = useCallback(() => {
    if (!activeGapId) return;
    const options = collectAllVariants(variantRows);
    if (options.length === 0 || selectedVariants.length === 0) return;

    setGaps((prev) => ({
      ...prev,
      [activeGapId]: {
        options,
        correctAnswers: selectedVariants,
      },
    }));
    closeGapEditor();
  }, [activeGapId, closeGapEditor, selectedVariants, variantRows]);

  const deleteGap = useCallback(
    (gapId: string) => {
      const synced = syncFromDOM(segments);
      const result: Segment[] = [];
      for (let i = 0; i < synced.length; i++) {
        const seg = synced[i];
        if (seg.type === 'gap' && seg.id === gapId) {
          const prev = result[result.length - 1];
          const next = synced[i + 1];
          if (prev?.type === 'text' && next?.type === 'text') {
            (result[result.length - 1] as TextSeg).value += (next as TextSeg).value;
            i++;
          }
        } else {
          result.push({ ...seg } as Segment);
        }
      }
      if (result.length === 0) result.push({ type: 'text', value: '' });

      setSegments(result);
      setGaps((prev) => {
        const next = { ...prev };
        delete next[gapId];
        return next;
      });
      setVersion((prev) => prev + 1);
      if (activeGapId === gapId) closeGapEditor();
    },
    [segments, syncFromDOM, activeGapId, closeGapEditor],
  );

  const gapIds = useMemo(
    () =>
      segments
        .filter((segment): segment is GapSeg => segment.type === 'gap')
        .map((segment) => segment.id),
    [segments],
  );

  const canSave =
    gapIds.length > 0 &&
    gapIds.every((gapId) => (gaps[gapId]?.correctAnswers ?? []).length > 0);

  const handleSave = useCallback(() => {
    if (!canSave) return;
    const synced = syncFromDOM(segments);
    // Pass the AI-assigned block id so handleExerciseSave reuses it instead
    // of generating a fresh random id that would create a duplicate block.
    onSave({ title, segments: synced, gaps }, generatedBlockIdRef.current ?? undefined);
  }, [canSave, gaps, onSave, segments, syncFromDOM, title]);

  const applyGeneratedBlock = useCallback((block: GeneratedBlock) => {
    if (block.kind !== 'select_word_form' || !block.data || typeof block.data !== 'object') return;
    // Capture the server-assigned id for use when the user saves the editor.
    generatedBlockIdRef.current = block.id;
    const d = block.data as SelectWordFormData;
    setTitle(typeof d.title === 'string' ? d.title : block.title ?? '');
    const nextSegs = Array.isArray(d.segments) && d.segments.length > 0
      ? d.segments
      : [{ type: 'text' as const, value: '' }];
    setSegments(nextSegs);
    setGaps(normaliseGapState(d.gaps && typeof d.gaps === 'object' && !Array.isArray(d.gaps) ? d.gaps : {}));
    setVersion((v) => v + 1);
    setActiveGapId(null);
    setVariantRows(createVariantDrafts(normaliseGapConfig()));
    setInsertMode(false);
  }, []);

  const handleRootBlur = useCallback((e: React.FocusEvent) => {
    const relatedTarget = e.relatedTarget as Node | null;
    if (!rootRef.current?.contains(relatedTarget)) {
      setIsEditorFocused(false);
      setInsertMode(false);
    }
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeGapEditor();
        setInsertMode(false);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [closeGapEditor]);

  const isInitialEmpty =
    segments.length === 1 &&
    segments[0].type === 'text' &&
    (segments[0] as TextSeg).value === '' &&
    !isEditorFocused;

  return (
    <div
      ref={rootRef}
      className="dtg-editor-root"
      onBlur={handleRootBlur}
    >
      <ExerciseHeader
        title={title}
        headerLabel={label}
        editableTitleInHeader={false}
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

        <div
          ref={editorRef}
          className={[
            'dtg-main-editor',
            isEditorFocused ? 'dtg-main-editor--focused' : '',
            insertMode ? 'dtg-main-editor--insert-mode' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          onFocus={() => setIsEditorFocused(true)}
          onClick={() => {
            setIsEditorFocused(true);
            if (!document.activeElement || document.activeElement === document.body) {
              const lastTextIdx = [...segments]
                .reverse()
                .findIndex((segment) => segment.type === 'text');
              if (lastTextIdx >= 0) {
                const realIdx = segments.length - 1 - lastTextIdx;
                spanRefs.current[realIdx]?.focus();
              }
            }
          }}
        >
          {isInitialEmpty && (
            <div
              className="dtg-placeholder"
              onClick={() => {
                setIsEditorFocused(true);
                setTimeout(() => spanRefs.current[0]?.focus(), 10);
              }}
            >
              Введите текст упражнения
            </div>
          )}

          {!isInitialEmpty && (
            <div className="dtg-segments">
              {segments.map((segment, idx) => {
                if (segment.type === 'text') {
                  return (
                    <TextSpan
                      key={`t-${idx}-v${version}`}
                      initial={(segment as TextSeg).value}
                      onFocus={() => {
                        lastFocusedIdx.current = idx;
                      }}
                      divRef={(el) => {
                        spanRefs.current[idx] = el;
                      }}
                      onBracketInsert={insertGap}
                    />
                  );
                }

                const gapId = (segment as GapSeg).id;
                const gapConfig = gaps[gapId] ?? normaliseGapConfig();
                const previewValue = formatGapPreview(gapConfig.correctAnswers);
                const isFilled = gapConfig.correctAnswers.length > 0;
                const isActive = activeGapId === gapId;

                return (
                  <span
                    key={gapId}
                    className="dtg-gap-wrap"
                    ref={(el) => {
                      gapRefs.current[gapId] = el;
                    }}
                  >
                    <span
                      className={[
                        'dtg-gap-inner',
                        isActive ? 'dtg-gap-inner--active' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      <input
                        className={[
                          'dtg-gap-chip',
                          isFilled ? 'dtg-gap-chip--filled' : '',
                          isActive ? 'dtg-gap-chip--active' : '',
                          !isFilled ? 'dtg-gap-chip--empty' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        readOnly
                        value={previewValue}
                        placeholder="___"
                        style={{
                          width: Math.min(220, Math.max(56, Math.max(previewValue.length, 3) * 9 + 24)),
                        }}
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isActive) {
                            closeGapEditor();
                          } else {
                            openGapEditor(gapId, gapConfig);
                          }
                        }}
                        aria-label={
                          isFilled
                            ? `Gap with ${gapConfig.correctAnswers.length} correct forms — click to edit`
                            : 'Empty gap — click to add dropdown forms'
                        }
                      />

                      <span
                        className={[
                          'dtg-dot',
                          isFilled ? 'dtg-dot--green' : 'dtg-dot--empty',
                        ].join(' ')}
                        aria-hidden="true"
                      />
                    </span>
                  </span>
                );
              })}
            </div>
          )}

          {isEditorFocused && !insertMode && (
            <button
              type="button"
              className="dtg-insert-btn dtg-insert-btn--question"
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setInsertMode(true);
              }}
              title="Добавить пропуск"
              aria-label="Show gap insert button"
            >
              ?
            </button>
          )}

          {isEditorFocused && insertMode && (
            <button
              type="button"
              className="dtg-insert-btn dtg-insert-btn--bracket"
              onMouseDown={(e) => {
                e.preventDefault();
                insertGap();
              }}
              title="Вставить пропуск на месте курсора"
              aria-label="Insert gap at cursor"
            >
              [ ]
            </button>
          )}
          {activeGapId && popoverPos && (
            <div
              className="dtg-bottom-panel"
              style={{ top: popoverPos.top, left: popoverPos.left }}
            >
              <div className="dtg-bottom-panel-header">
                <span className="dtg-bottom-panel-label">Правильные формы</span>
                <button
                  type="button"
                  className="dtg-bottom-panel-delete"
                  onClick={() => deleteGap(activeGapId)}
                  title="Удалить пропуск"
                  aria-label="Delete gap"
                >
                  <Trash2 size={13} />
                </button>
              </div>

              <div className="dtg-bottom-panel-body">
                <span className="dtg-bottom-panel-hint">
                  Отметьте галочками правильные формы и добавьте новые варианты ниже.
                </span>
                <div className="dtg-variant-list">
                  {variantRows.map((row, index) => (
                    <div key={row.id} className="dtg-variant-row">
                      <label className="dtg-variant-check" aria-label={`Mark variant ${index + 1} as correct`}>
                        <input
                          type="checkbox"
                          checked={row.checked}
                          onChange={(e) => {
                            setVariantRows((prev) =>
                              prev.map((variant) =>
                                variant.id === row.id
                                  ? { ...variant, checked: e.target.checked }
                                  : variant,
                              ),
                            );
                          }}
                        />
                      </label>
                      <input
                        ref={(el) => {
                          variantInputRefs.current[row.id] = el;
                        }}
                        className="dtg-variant-input"
                        placeholder={`Вариант ${index + 1}`}
                        value={row.value}
                        onChange={(e) => {
                          const value = e.target.value;
                          setVariantRows((prev) =>
                            prev.map((variant) =>
                              variant.id === row.id ? { ...variant, value } : variant,
                            ),
                          );
                        }}
                        onKeyDown={(e) => {
                          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                            e.preventDefault();
                            confirmAnswer();
                          }
                          if (e.key === 'Escape') {
                            closeGapEditor();
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="dtg-variant-remove"
                        onClick={() => {
                          setVariantRows((prev) => {
                            if (prev.length === 1) {
                              return createVariantDrafts({ options: [], correctAnswers: [] });
                            }
                            return prev.filter((variant) => variant.id !== row.id);
                          });
                        }}
                      >
                        Удалить
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="dtg-variant-add"
                  onClick={() => {
                    const newRow = createVariantDraft();
                    setVariantRows((prev) => [...prev, newRow]);
                    setTimeout(() => variantInputRefs.current[newRow.id]?.focus(), 30);
                  }}
                >
                  <Plus size={14} />
                  Добавить вариант
                </button>
                <div className="dtg-bottom-panel-actions">
                  <button
                    type="button"
                    className="dtg-bottom-panel-cancel"
                    onClick={closeGapEditor}
                  >
                    Отмена
                  </button>
                  <button
                    type="button"
                    className={[
                      'dtg-bottom-panel-confirm',
                      selectedVariants.length === 0
                        ? 'dtg-bottom-panel-confirm--disabled'
                        : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={confirmAnswer}
                    disabled={selectedVariants.length === 0}
                  >
                    <Check size={13} />
                    Сохранить формы
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <button type="button" className="dtg-generate-btn" onClick={() => setShowAIModal(true)}>
          <Sparkles size={13} />
          Сгенерировать
        </button>
          <AIExerciseGeneratorModal
          exerciseType="select_word_form"
          open={showAIModal}
          onClose={() => setShowAIModal(false)}
          segmentId={segmentId}
          onGenerated={(block) => {
            applyGeneratedBlock(block);
          }}
        />
        <div className="dtg-footer">
          <label className="dtg-pro-toggle">
            Pro
            <input type="checkbox" style={{ marginLeft: 6 }} />
          </label>

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
                  ? 'Заполните все пропуски перед сохранением'
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