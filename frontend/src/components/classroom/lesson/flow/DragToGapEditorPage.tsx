/**
 * DragToGapEditorPage.tsx
 *
 * Teacher-facing editor for "Drag word to gap" exercises.
 *
 * UX flow:
 *   1. Teacher types exercise text in the large text area.
 *   2. Clicking the text area shows a "?" button on the left corner.
 *   3. Clicking "?" reveals the "[ ]" insert button.
 *   4. Hovering the text while in insert mode shows a crosshair cursor.
 *   5. Clicking "[ ]" inserts a gap at the cursor — an inline input appears
 *      with a green/grey dot to its right.
 *   6. Clicking the gap input opens the "Correct answer" textarea panel
 *      at the bottom of the editor.
 *   7. Teacher types the correct word (Enter or "Save answer" button).
 *      → word fills the gap input (disabled/grey style)
 *      → word chip appears in the top grey bar
 *   8. Save is disabled until every gap has a correct answer.
 *
 * Output shape (DragToGapData) is consumed by DragToGapBlock.
 */

import React, {
  useState,
  useRef,
  useCallback,
  useEffect,
  memo,
} from 'react';
import {
  GripVertical,
  Sparkles,
  Trash2,
  Check,
} from 'lucide-react';
import ExerciseHeader, { EXERCISE_HEADER_HEIGHT_PX } from '../exercise/ExerciseHeader';
import AIExerciseGeneratorModal, {
  type GeneratedBlock,
} from './AI_generation/AIExerciseGeneratorModal';
import './DragToGap.css';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface TextSeg { type: 'text'; value: string }
export interface GapSeg  { type: 'gap';  id: string }
export type Segment = TextSeg | GapSeg;

export interface DragToGapData {
  title: string;
  segments: Segment[];
  gaps: Record<string, string>; // gapId → correct answer
}

interface Props {
  initialTitle?: string;
  initialData?: DragToGapData;
  /** Display label shown in the top head bar. */
  label?: string;
  exerciseType?: 'drag_to_gap' | 'type_word_in_gap';
  wordsBarMode?: 'chips' | 'typing_hint';
  typingHintText?: string;
  /** Segment id for POST /segments/{id}/exercises/drag-to-gap (from lesson context). */
  segmentId?: string | number | null;
  onSave: (data: DragToGapData) => void;
  onCancel: () => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

let _gc = 0;
const newGapId = () => `g${++_gc}_${Date.now()}`;

/**
 * TextSpan — UNCONTROLLED contenteditable span.
 *
 * Mounted once with `initial` as text content; thereafter the DOM owns the
 * value. Parent reads the DOM via spanRefs before any structural state change.
 * Key-based remount (via `version`) forces a fresh mount after structural edits.
 *
 * `React.memo(() => true)` prevents ALL re-renders after mount.
 */
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
    /** Called when the user types "[]" — parent should insert a gap at cursor. */
    onBracketInsert?: () => void;
  }) {
    const innerRef = useRef<HTMLSpanElement>(null);

    // Use a ref so the callback is always fresh without triggering re-renders.
    const onBracketInsertRef = useRef(onBracketInsert);
    onBracketInsertRef.current = onBracketInsert;

    useEffect(() => {
      if (innerRef.current) innerRef.current.textContent = initial;
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // intentionally empty — set once on mount

    // Detect "[]" typed anywhere in this span and convert it into a gap.
    const handleInput = useCallback(() => {
      const el = innerRef.current;
      if (!el) return;

      const text = el.textContent ?? '';
      const bracketIdx = text.indexOf('[]');
      if (bracketIdx === -1) return;

      // Strip "[]" from the DOM text.
      const newText = text.slice(0, bracketIdx) + text.slice(bracketIdx + 2);
      el.textContent = newText;

      // Restore cursor to the position where "[]" started.
      const sel = window.getSelection();
      if (sel) {
        const range = document.createRange();
        if (newText.length > 0 && el.firstChild) {
          range.setStart(el.firstChild, Math.min(bracketIdx, newText.length));
        } else {
          range.setStart(el, 0);
        }
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
      }

      // Delegate gap insertion to the parent (reads cursor pos from Selection API).
      onBracketInsertRef.current?.();
    }, []); // intentionally empty — innerRef and ref-callback are stable

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
  () => true, // never re-render
);

// ── Main Editor ────────────────────────────────────────────────────────────────

export default function DragToGapEditorPage({
  initialTitle = '',
  initialData,
  label = 'Перенести слово к пропуску',
  exerciseType = 'drag_to_gap',
  wordsBarMode = 'chips',
  typingHintText = 'Ученик будет вписывать ответы прямо в пропуски',
  segmentId,
  onSave,
  onCancel,
}: Props) {
  const [title, setTitle] = useState(initialTitle);
  const [showAIModal, setShowAIModal] = useState(false);
  /**
   * Server-assigned block id from a previous AI generation POST call.
   * Carried through handleSave so the parent reuses it instead of minting
   * a new random id — which would create a duplicate block in media_blocks.
   */
  const [persistedBlockId, setPersistedBlockId] = useState<string | null>(null);

  // Segment array: alternating TextSeg and GapSeg entries.
  const [segments, setSegments] = useState<Segment[]>(
    initialData?.segments ?? [{ type: 'text', value: '' }],
  );

  // gapId → correct answer (empty until filled by teacher)
  const [gaps, setGaps] = useState<Record<string, string>>(
    initialData?.gaps ?? {},
  );

  // Which gap's answer panel is open at the bottom
  const [activeGapId, setActiveGapId] = useState<string | null>(null);
  const [answerDraft, setAnswerDraft] = useState('');

  // Editor focus state
  const [isEditorFocused, setIsEditorFocused] = useState(false);

  // Two-step insert flow: false = show "?", true = show "[ ]"
  const [insertMode, setInsertMode] = useState(false);

  /**
   * Version counter — bumped on every structural change (insert/delete gap).
   * Text spans use `key={t-${idx}-v${version}}` to force remount and pick up
   * the correct `initial` value after a structural change.
   */
  const [version, setVersion] = useState(0);

  // Refs: one per segment index for text spans
  const spanRefs = useRef<Record<number, HTMLSpanElement | null>>({});
  const lastFocusedIdx = useRef<number | null>(null);
  const answerTextareaRef = useRef<HTMLTextAreaElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Refs for each gap's DOM element (for popover positioning)
  const gapRefs = useRef<Record<string, HTMLSpanElement | null>>({});

  // Absolute position of the answer popover relative to dtg-main-editor
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!activeGapId) { setPopoverPos(null); return; }
    const gapEl = gapRefs.current[activeGapId];
    const editorEl = editorRef.current;
    if (!gapEl || !editorEl) return;
    const gapRect = gapEl.getBoundingClientRect();
    const editorRect = editorEl.getBoundingClientRect();
    const PANEL_WIDTH = 264;
    let left = gapRect.left - editorRect.left;
    // Keep panel within editor bounds
    const maxLeft = editorRect.width - PANEL_WIDTH - 8;
    left = Math.min(Math.max(0, left), Math.max(0, maxLeft));
    setPopoverPos({
      top: gapRect.bottom - editorRect.top + 6,
      left,
    });
  }, [activeGapId]);

  // ── DOM sync ─────────────────────────────────────────────────────────────────

  /**
   * Read all text-segment values from the live DOM.
   * Must be called BEFORE any structural setState that would remount spans.
   */
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

  // ── Insert gap at cursor ──────────────────────────────────────────────────────

  const insertGap = useCallback(() => {
    // 1. Capture current text from DOM before state change.
    const synced = syncFromDOM(segments);

    // 2. Decide which text segment to split.
    const focusIdx = lastFocusedIdx.current;
    let targetIdx = -1;
    if (focusIdx !== null && synced[focusIdx]?.type === 'text') {
      targetIdx = focusIdx;
    } else {
      for (let i = synced.length - 1; i >= 0; i--) {
        if (synced[i].type === 'text') { targetIdx = i; break; }
      }
    }
    if (targetIdx < 0) return;

    // 3. Determine cursor offset inside that span.
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
          // Selection API edge case — fall back to end of text.
        }
      }
    }

    // 4. Build new segment array with gap inserted.
    const gapId = newGapId();
    const fullText = (synced[targetIdx] as TextSeg).value;
    const newSegs: Segment[] = [
      ...synced.slice(0, targetIdx),
      { type: 'text', value: fullText.slice(0, cursorPos) },
      { type: 'gap',  id: gapId },
      { type: 'text', value: fullText.slice(cursorPos) },
      ...synced.slice(targetIdx + 1),
    ];

    setSegments(newSegs);
    setGaps((prev) => ({ ...prev, [gapId]: '' }));
    setVersion((v) => v + 1);
    setActiveGapId(gapId);
    setAnswerDraft('');
    setInsertMode(false); // reset to "?" after inserting
    setTimeout(() => answerTextareaRef.current?.focus(), 60);
  }, [segments, syncFromDOM]);

  // ── Confirm correct answer ───────────────────────────────────────────────────

  const confirmAnswer = useCallback(() => {
    if (!activeGapId || !answerDraft.trim()) return;
    setGaps((prev) => ({ ...prev, [activeGapId]: answerDraft.trim() }));
    setActiveGapId(null);
    setAnswerDraft('');
  }, [activeGapId, answerDraft]);

  // ── Delete gap (merge surrounding text) ──────────────────────────────────────

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
            i++; // skip the right text segment
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
      setVersion((v) => v + 1);
      if (activeGapId === gapId) setActiveGapId(null);
    },
    [segments, syncFromDOM, activeGapId],
  );

  // ── Save ──────────────────────────────────────────────────────────────────────

  const gapIds = segments
    .filter((s): s is GapSeg => s.type === 'gap')
    .map((s) => s.id);

  const canSave =
    gapIds.length > 0 &&
    gapIds.every((id) => (gaps[id] ?? '').trim() !== '');

  const handleSave = useCallback(() => {
    if (!canSave) return;
    const synced = syncFromDOM(segments);
    const data: DragToGapData & { _persistedBlockId?: string } = { title, segments: synced, gaps };
    if (persistedBlockId) data._persistedBlockId = persistedBlockId;
    onSave(data);
  }, [canSave, segments, gaps, title, persistedBlockId, syncFromDOM, onSave]);

  const applyGeneratedBlock = useCallback((block: GeneratedBlock) => {
    if (block.kind !== exerciseType || !block.data || typeof block.data !== 'object') return;
    const d = block.data as DragToGapData;
    setTitle(typeof d.title === 'string' ? d.title : block.title ?? '');
    const nextSegs = Array.isArray(d.segments) && d.segments.length > 0
      ? d.segments
      : [{ type: 'text' as const, value: '' }];
    setSegments(nextSegs);
    setGaps(d.gaps && typeof d.gaps === 'object' && !Array.isArray(d.gaps) ? { ...d.gaps } : {});
    setVersion((v) => v + 1);
    setActiveGapId(null);
    setAnswerDraft('');
    setInsertMode(false);
    // Capture the server-assigned block id so handleSave can reuse it,
    // preventing a duplicate block from being appended on the segment.
    if (typeof block.id === 'string' && block.id.length > 0) {
      setPersistedBlockId(block.id);
    }
  }, [exerciseType]);

  // ── Root blur handling ────────────────────────────────────────────────────────

  // Detects when focus leaves the entire component (editor + bottom panel).
  const handleRootBlur = useCallback((e: React.FocusEvent) => {
    const relatedTarget = e.relatedTarget as Node | null;
    if (!rootRef.current?.contains(relatedTarget)) {
      setIsEditorFocused(false);
      setInsertMode(false);
      // Don't close activeGapId — user might be clicking the textarea
    }
  }, []);

  // Global Escape to close panels / reset insert mode
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveGapId(null);
        setInsertMode(false);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // ── Word chips for top bar (only filled gaps) ────────────────────────────────

  const filledChips = gapIds
    .map((id) => ({ id, word: gaps[id] ?? '' }))
    .filter(({ word }) => word !== '');

  // ── Detect "initial empty state" ─────────────────────────────────────────────

  const isInitialEmpty =
    segments.length === 1 &&
    segments[0].type === 'text' &&
    (segments[0] as TextSeg).value === '' &&
    !isEditorFocused;

  // ── Render ────────────────────────────────────────────────────────────────────

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
          placeholder="Exercise title (shown to students)"
          aria-label="Exercise title"
        />
      </div>

      {/* ── Student-facing preview: how the title + instruction look in the block */}
      <div className="dtg-editor-title-preview">
        {/* <span className="dtg-editor-title-preview__label">Student view</span>
        <div className="dtg-exercise-title" style={{ fontSize: 14 }}>
          {title || <span style={{ color: '#94a3b8', fontWeight: 400 }}>No title yet — type one above</span>}
        </div> */}
        <div className="dtg-exercise-instruction">
          {/* <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8L6 12M6 12L18 16M6 12H22M2 12H4"/></svg> */}
          Drag words into the correct gaps
        </div>
      </div>

      {/* ── Words bar — top grey area showing draggable chips ─────────────────── */}
      <div className="dtg-words-bar">
        {wordsBarMode === 'chips' ? (
          <>
            {filledChips.length === 0 && (
              <span className="dtg-words-bar-hint">
                Слова появятся здесь после заполнения пропусков
              </span>
            )}
            {filledChips.map(({ id, word }) => (
              <span key={id} className="dtg-chip dtg-chip--bar">
                <GripVertical size={11} />
                {word}
              </span>
            ))}
          </>
        ) : (
          <span className="dtg-words-bar-hint">{typingHintText}</span>
        )}
      </div>

      {/* ── Main editor ───────────────────────────────────────────────────────── */}
      <div
        ref={editorRef}
        className={[
          'dtg-main-editor',
          isEditorFocused ? 'dtg-main-editor--focused' : '',
          insertMode     ? 'dtg-main-editor--insert-mode' : '',
        ].filter(Boolean).join(' ')}
        onFocus={() => setIsEditorFocused(true)}
        onClick={() => {
          setIsEditorFocused(true);
          // Focus the last text span if nothing else is focused
          if (!document.activeElement || document.activeElement === document.body) {
            const lastTextIdx = [...segments]
              .reverse()
              .findIndex((s) => s.type === 'text');
            if (lastTextIdx >= 0) {
              const realIdx = segments.length - 1 - lastTextIdx;
              spanRefs.current[realIdx]?.focus();
            }
          }
        }}
      >
        {/* Placeholder */}
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

        {/* Segments */}
        {!isInitialEmpty && (
          <div className="dtg-segments">
            {segments.map((seg, idx) => {
              if (seg.type === 'text') {
                return (
                  <TextSpan
                    key={`t-${idx}-v${version}`}
                    initial={(seg as TextSeg).value}
                    onFocus={() => { lastFocusedIdx.current = idx; }}
                    divRef={(el) => { spanRefs.current[idx] = el; }}
                    onBracketInsert={insertGap}
                  />
                );
              }

              // ── Gap segment ────────────────────────────────────────────────
              const gapId = (seg as GapSeg).id;
              const gapAnswer = gaps[gapId] ?? '';
              const isFilled = gapAnswer !== '';
              const isActive = activeGapId === gapId;

              return (
                <span key={gapId} className="dtg-gap-wrap" ref={(el) => { gapRefs.current[gapId] = el; }}>
                  <span
                    className={[
                      'dtg-gap-inner',
                      isActive ? 'dtg-gap-inner--active' : '',
                    ].filter(Boolean).join(' ')}
                  >
                    {/* Inline gap input */}
                    <input
                      className={[
                        'dtg-gap-chip',
                        isFilled  ? 'dtg-gap-chip--filled'  : '',
                        isActive  ? 'dtg-gap-chip--active'  : '',
                        !isFilled ? 'dtg-gap-chip--empty'   : '',
                      ].filter(Boolean).join(' ')}
                      readOnly
                      value={gapAnswer}
                      placeholder="___"
                      style={{
                        width: Math.max(56, gapAnswer.length * 9 + 24),
                      }}
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isActive) {
                          setActiveGapId(null);
                        } else {
                          setActiveGapId(gapId);
                          setAnswerDraft(gapAnswer);
                          setTimeout(() => answerTextareaRef.current?.focus(), 30);
                        }
                      }}
                      aria-label={
                        isFilled
                          ? `Gap with answer "${gapAnswer}" — click to edit`
                          : 'Empty gap — click to add correct answer'
                      }
                    />

                    {/* Dot indicator — green when filled, grey when empty */}
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

        {/* ── Left-corner insert button ─────────────────────────────────────
            Step 1: "?" appears when editor is focused
            Step 2: "[ ]" appears after clicking "?"                        */}
        {isEditorFocused && !insertMode && (
          <button
            type="button"
            className="dtg-insert-btn dtg-insert-btn--question"
            onMouseDown={(e) => {
              e.preventDefault(); // keep editor focused / selection intact
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
              e.preventDefault(); // keep selection intact for cursor position
              insertGap();
            }}
            title="Вставить пропуск на месте курсора"
            aria-label="Insert gap at cursor"
          >
            [ ]
          </button>
        )}

        {/* ── Answer popover — floats below the active gap ─────────────────── */}
        {activeGapId && popoverPos && (
          <div
            className="dtg-bottom-panel"
            style={{ top: popoverPos.top, left: popoverPos.left }}
          >
            <div className="dtg-bottom-panel-header">
              <span className="dtg-bottom-panel-label">Правильный ответ</span>
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
              <textarea
                ref={answerTextareaRef}
                className="dtg-answer-textarea"
                placeholder="Введите правильный ответ..."
                value={answerDraft}
                rows={2}
                onChange={(e) => setAnswerDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    confirmAnswer();
                  }
                  if (e.key === 'Escape') setActiveGapId(null);
                }}
              />
              <div className="dtg-bottom-panel-actions">
                <button
                  type="button"
                  className="dtg-bottom-panel-cancel"
                  onClick={() => setActiveGapId(null)}
                >
                  Отмена
                </button>
                <button
                  type="button"
                  className={[
                    'dtg-bottom-panel-confirm',
                    !answerDraft.trim() ? 'dtg-bottom-panel-confirm--disabled' : '',
                  ].filter(Boolean).join(' ')}
                  onClick={confirmAnswer}
                  disabled={!answerDraft.trim()}
                >
                  <Check size={13} />
                  Сохранить ответ
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Generate button ───────────────────────────────────────────────────── */}
      <button
        type="button"
        className="dtg-generate-btn"
        onClick={() => setShowAIModal(true)}
      >
        <Sparkles size={13} />
        Сгенерировать
      </button>

      <AIExerciseGeneratorModal
        exerciseType={exerciseType}
        open={showAIModal}
        onClose={() => setShowAIModal(false)}
        segmentId={segmentId}
        onGenerated={(block) => {
          applyGeneratedBlock(block);
        }}
      />

      {/* ── Footer ────────────────────────────────────────────────────────────── */}
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
            ].filter(Boolean).join(' ')}
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