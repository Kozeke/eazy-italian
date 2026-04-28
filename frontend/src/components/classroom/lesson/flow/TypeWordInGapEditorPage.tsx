/**
 * TypeWordInGapEditorPage.tsx
 *
 * Teacher-facing editor for "Type word in gap" exercises.
 *
 * Previously a thin wrapper around DragToGapEditorPage — now a standalone
 * component so live-sync hooks can be added per gap without affecting the
 * drag-to-gap editor.
 *
 * Key differences from DragToGapEditorPage:
 *   • No word-chips bar — replaced by a static "student will type" hint.
 *   • exerciseType is always 'type_word_in_gap'.
 *   • Each gap's correct-answer value is synced via useLiveSyncField so that
 *     collaborating editors (or a live-preview context) stay in sync.
 *
 * Live-sync integration:
 *   useLiveSyncField(`ex/${segmentId}/${gapId}`, gapAnswer, onRemoteChange)
 *   is called inside <SyncedGapEditorInput> — a tiny sub-component that keeps
 *   one hook per gap, satisfying React's Rules of Hooks (no hooks inside loops).
 */

import React, { useState, useRef, useCallback, useEffect, memo } from "react";
import { Sparkles, Trash2, Check, KeyboardIcon } from "lucide-react";
import ExerciseHeader, {
  EXERCISE_HEADER_HEIGHT_PX,
} from "../exercise/ExerciseHeader";
import AIExerciseGeneratorModal, {
  type GeneratedBlock,
} from "./AI_generation/AIExerciseGeneratorModal";
import { useLiveSyncField } from "../../../../hooks/useLiveSession";
import "./DragToGap.css";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface TextSeg {
  type: "text";
  value: string;
}
export interface GapSeg {
  type: "gap";
  id: string;
}
export type Segment = TextSeg | GapSeg;

export interface DragToGapData {
  title: string;
  segments: Segment[];
  gaps: Record<string, string>; // gapId → correct answer
}

// Re-export under the canonical alias used by importers
export type TypeWordInGapData = DragToGapData;

interface Props {
  initialTitle?: string;
  initialData?: TypeWordInGapData;
  /** Display label shown in the top head bar. */
  label?: string;
  /** Segment id forwarded to AI generation and live-sync key namespace. */
  segmentId?: string | number | null;
  onSave: (data: TypeWordInGapData, blockId?: string) => void;
  onCancel: () => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

let _gc = 0;
const newGapId = () => `g${++_gc}_${Date.now()}`;

// ── TextSpan (uncontrolled contenteditable) ────────────────────────────────────
//
// Mounted once with `initial`; the DOM owns the value from then on.
// `React.memo(() => true)` prevents ALL re-renders after mount.
// Parent reads via spanRefs before any structural setState.

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
      const text = el.textContent ?? "";
      const bracketIdx = text.indexOf("[]");
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
          (innerRef as React.MutableRefObject<HTMLSpanElement | null>).current =
            el;
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

// ── SyncedGapEditorInput ───────────────────────────────────────────────────────
//
// One sub-component per rendered gap so that useLiveSyncField satisfies
// React's Rules of Hooks (no hooks inside .map() loops).
//
// Teacher  → on gap-answer change: broadcasts the new value to all peers.
// Peer/collab → when remote patch arrives: calls onRemoteChange to update state.

interface SyncedGapEditorInputProps {
  segmentId?: string | number | null;
  gapId: string;
  gapAnswer: string;
  isActive: boolean;
  isFilled: boolean;
  gapRef: (el: HTMLSpanElement | null) => void;
  onRemoteChange: (gapId: string, value: string) => void;
  onClick: (gapId: string) => void;
}

function SyncedGapEditorInput({
  segmentId,
  gapId,
  gapAnswer,
  isActive,
  isFilled,
  gapRef,
  onRemoteChange,
  onClick,
}: SyncedGapEditorInputProps) {
  // ── Live sync: one hook call per gap ────────────────────────────────────────
  useLiveSyncField(`ex/${segmentId ?? "unsaved"}/${gapId}`, gapAnswer, (v) =>
    onRemoteChange(gapId, v as string),
  );

  return (
    // dtg-gap-wrap--typing switches the wrapper to column flex so the
    // teacher answer hint can sit below the gap chip without breaking
    // the inline text flow.
    <span className="dtg-gap-wrap dtg-gap-wrap--typing" ref={gapRef}>
      <span
        className={["dtg-gap-inner", isActive ? "dtg-gap-inner--active" : ""]
          .filter(Boolean)
          .join(" ")}
      >
        {/* Inline gap input — readOnly in editor, shows correct answer */}
        <input
          className={[
            "dtg-gap-chip",
            isFilled ? "dtg-gap-chip--filled" : "",
            isActive ? "dtg-gap-chip--active" : "",
            !isFilled ? "dtg-gap-chip--empty" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          readOnly
          value={gapAnswer}
          placeholder="___"
          style={{ width: Math.max(56, gapAnswer.length * 9 + 24) }}
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            onClick(gapId);
          }}
          aria-label={
            isFilled
              ? `Gap with answer "${gapAnswer}" — click to edit`
              : "Empty gap — click to add correct answer"
          }
        />

        {/* Dot indicator — green when filled, grey when empty */}
        <span
          className={[
            "dtg-dot",
            isFilled ? "dtg-dot--green" : "dtg-dot--empty",
          ].join(" ")}
          aria-hidden="true"
        />
      </span>

      {/* Teacher-only correct-answer hint — shown below the gap chip.
          Students never see this because this component is only mounted
          inside TypeWordInGapEditorPage (the teacher editor). */}
      {isFilled && (
        <span className="dtg-twg-editor-answer-hint" aria-hidden="true">
          ✓ {gapAnswer}
        </span>
      )}
    </span>
  );
}

// ── Main Editor ────────────────────────────────────────────────────────────────

export default function TypeWordInGapEditorPage({
  initialTitle = "",
  initialData,
  label = "Вписать слово в пропуск",
  segmentId,
  onSave,
  onCancel,
}: Props) {
  const [title, setTitle] = useState(initialData?.title ?? initialTitle);
  const [showAIModal, setShowAIModal] = useState(false);

  // Segment array: alternating TextSeg and GapSeg entries.
  const [segments, setSegments] = useState<Segment[]>(
    initialData?.segments ?? [{ type: "text", value: "" }],
  );

  // gapId → correct answer (empty until filled by teacher)
  const [gaps, setGaps] = useState<Record<string, string>>(
    initialData?.gaps ?? {},
  );

  // Which gap's answer panel is open at the bottom
  const [activeGapId, setActiveGapId] = useState<string | null>(null);
  const [answerDraft, setAnswerDraft] = useState("");

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

  // Refs
  const spanRefs = useRef<Record<number, HTMLSpanElement | null>>({});
  const lastFocusedIdx = useRef<number | null>(null);
  const answerTextareaRef = useRef<HTMLTextAreaElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  // Refs for each gap's DOM element (for popover positioning).
  const gapRefs = useRef<Record<string, HTMLSpanElement | null>>({});
  // Absolute position of the answer popover relative to dtg-main-editor.
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null);
  // Holds the server-assigned block id when AI generation persisted the block.
  // Passed to onSave so handleExerciseSave reuses it instead of generating a
  // new random id that would create a duplicate block on the segment.
  const generatedBlockIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!activeGapId) {
      setPopoverPos(null);
      return;
    }
    const gapEl = gapRefs.current[activeGapId];
    const editorEl = editorRef.current;
    if (!gapEl || !editorEl) return;
    const gapRect = gapEl.getBoundingClientRect();
    const editorRect = editorEl.getBoundingClientRect();
    const panelWidth = editorRect.width * 0.45;
    let left = gapRect.left - editorRect.left;
    // Keep panel within editor bounds.
    const maxLeft = editorRect.width - panelWidth - 8;
    left = Math.min(Math.max(0, left), Math.max(0, maxLeft));
    setPopoverPos({
      top: gapRect.bottom - editorRect.top + 6,
      left,
    });
  }, [activeGapId]);

  // ── DOM sync ─────────────────────────────────────────────────────────────────

  const syncFromDOM = useCallback(
    (segs: Segment[]): Segment[] =>
      segs.map((seg, idx) => {
        if (seg.type === "text") {
          const el = spanRefs.current[idx];
          return {
            type: "text",
            value: el?.textContent ?? (seg as TextSeg).value,
          };
        }
        return seg;
      }),
    [],
  );

  // ── Handlers for remote gap-answer updates (student / collaborator) ───────────

  const handleRemoteGapChange = useCallback((gapId: string, value: string) => {
    setGaps((prev) => ({ ...prev, [gapId]: value }));
  }, []);

  // ── Insert gap at cursor ──────────────────────────────────────────────────────

  const insertGap = useCallback(() => {
    const synced = syncFromDOM(segments);

    const focusIdx = lastFocusedIdx.current;
    let targetIdx = -1;
    if (focusIdx !== null && synced[focusIdx]?.type === "text") {
      targetIdx = focusIdx;
    } else {
      for (let i = synced.length - 1; i >= 0; i--) {
        if (synced[i].type === "text") {
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
          // Selection API edge case — fall back to end of text.
        }
      }
    }

    const gapId = newGapId();
    const fullText = (synced[targetIdx] as TextSeg).value;
    const newSegs: Segment[] = [
      ...synced.slice(0, targetIdx),
      { type: "text", value: fullText.slice(0, cursorPos) },
      { type: "gap", id: gapId },
      { type: "text", value: fullText.slice(cursorPos) },
      ...synced.slice(targetIdx + 1),
    ];

    setSegments(newSegs);
    setGaps((prev) => ({ ...prev, [gapId]: "" }));
    setVersion((v) => v + 1);
    setActiveGapId(gapId);
    setAnswerDraft("");
    setInsertMode(false);
    setTimeout(() => answerTextareaRef.current?.focus(), 60);
  }, [segments, syncFromDOM]);

  // ── Confirm correct answer ────────────────────────────────────────────────────

  const confirmAnswer = useCallback(() => {
    if (!activeGapId || !answerDraft.trim()) return;
    setGaps((prev) => ({ ...prev, [activeGapId]: answerDraft.trim() }));
    setActiveGapId(null);
    setAnswerDraft("");
  }, [activeGapId, answerDraft]);

  // ── Gap click toggle ──────────────────────────────────────────────────────────

  const handleGapClick = useCallback(
    (gapId: string) => {
      setActiveGapId((prev) => {
        if (prev === gapId) return null;
        setAnswerDraft(gaps[gapId] ?? "");
        setTimeout(() => answerTextareaRef.current?.focus(), 30);
        return gapId;
      });
    },
    [gaps],
  );

  // ── Delete gap (merge surrounding text) ──────────────────────────────────────

  const deleteGap = useCallback(
    (gapId: string) => {
      const synced = syncFromDOM(segments);
      const result: Segment[] = [];
      for (let i = 0; i < synced.length; i++) {
        const seg = synced[i];
        if (seg.type === "gap" && seg.id === gapId) {
          const prev = result[result.length - 1];
          const next = synced[i + 1];
          if (prev?.type === "text" && next?.type === "text") {
            (result[result.length - 1] as TextSeg).value += (
              next as TextSeg
            ).value;
            i++;
          }
        } else {
          result.push({ ...seg } as Segment);
        }
      }
      if (result.length === 0) result.push({ type: "text", value: "" });

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
    .filter((s): s is GapSeg => s.type === "gap")
    .map((s) => s.id);

  const canSave =
    gapIds.length > 0 && gapIds.every((id) => (gaps[id] ?? "").trim() !== "");

  const handleSave = useCallback(() => {
    if (!canSave) return;
    const synced = syncFromDOM(segments);
    // Pass the AI-assigned block id so handleExerciseSave reuses it instead
    // of generating a fresh random id that would create a duplicate block.
    onSave({ title, segments: synced, gaps }, generatedBlockIdRef.current ?? undefined);
  }, [canSave, segments, gaps, title, syncFromDOM, onSave]);

  // ── AI generation ─────────────────────────────────────────────────────────────

  const applyGeneratedBlock = useCallback((block: GeneratedBlock) => {
    if (
      block.kind !== "type_word_in_gap" ||
      !block.data ||
      typeof block.data !== "object"
    )
      return;
    // Capture the server-assigned id for use when the user saves the editor.
    generatedBlockIdRef.current = block.id;
    const d = block.data as TypeWordInGapData;
    setTitle(typeof d.title === "string" ? d.title : (block.title ?? ""));
    const nextSegs =
      Array.isArray(d.segments) && d.segments.length > 0
        ? d.segments
        : [{ type: "text" as const, value: "" }];
    setSegments(nextSegs);
    setGaps(
      d.gaps && typeof d.gaps === "object" && !Array.isArray(d.gaps)
        ? { ...d.gaps }
        : {},
    );
    setVersion((v) => v + 1);
    setActiveGapId(null);
    setAnswerDraft("");
    setInsertMode(false);
  }, []);

  // ── Root blur ─────────────────────────────────────────────────────────────────

  const handleRootBlur = useCallback((e: React.FocusEvent) => {
    const relatedTarget = e.relatedTarget as Node | null;
    if (!rootRef.current?.contains(relatedTarget)) {
      setIsEditorFocused(false);
      setInsertMode(false);
    }
  }, []);

  // Global Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setActiveGapId(null);
        setInsertMode(false);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // ── Detect "initial empty state" ─────────────────────────────────────────────

  const isInitialEmpty =
    segments.length === 1 &&
    segments[0].type === "text" &&
    (segments[0] as TextSeg).value === "" &&
    !isEditorFocused;

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div ref={rootRef} className="dtg-editor-root" onBlur={handleRootBlur}>
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
        {/* ── Title ─────────────────────────────────────────────────────────── */}
        <div className="dtg-title-row">
          <input
            className="dtg-title-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Название упражнения"
            aria-label="Exercise title"
          />
        </div>

        {/* ── Typing hint bar — replaces the word-chips bar ─────────────────── */}
        <div className="dtg-words-bar twg-hint-bar">
          <KeyboardIcon
            size={13}
            className="twg-hint-icon"
            aria-hidden="true"
          />
          <span className="dtg-words-bar-hint">
            Ученик будет вписывать ответы прямо в пропуски
          </span>
        </div>

        {/* ── Main editor ───────────────────────────────────────────────────── */}
        <div
          ref={editorRef}
          className={[
            "dtg-main-editor",
            isEditorFocused ? "dtg-main-editor--focused" : "",
            insertMode ? "dtg-main-editor--insert-mode" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          onFocus={() => setIsEditorFocused(true)}
          onClick={() => {
            setIsEditorFocused(true);
            if (
              !document.activeElement ||
              document.activeElement === document.body
            ) {
              const lastTextIdx = [...segments]
                .reverse()
                .findIndex((s) => s.type === "text");
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
                // ── Text segment ─────────────────────────────────────────────
                if (seg.type === "text") {
                  return (
                    <TextSpan
                      key={`t-${idx}-v${version}`}
                      initial={(seg as TextSeg).value}
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

                // ── Gap segment (rendered via SyncedGapEditorInput) ──────────
                const gapId = (seg as GapSeg).id;
                const gapAnswer = gaps[gapId] ?? "";

                return (
                  <SyncedGapEditorInput
                    key={gapId}
                    segmentId={segmentId}
                    gapId={gapId}
                    gapAnswer={gapAnswer}
                    isFilled={gapAnswer !== ""}
                    isActive={activeGapId === gapId}
                    gapRef={(el) => {
                      gapRefs.current[gapId] = el;
                    }}
                    onRemoteChange={handleRemoteGapChange}
                    onClick={handleGapClick}
                  />
                );
              })}
            </div>
          )}

          {/* ── Step 1: "?" — appears when editor is focused ──────────────── */}
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

          {/* ── Step 2: "[ ]" — appears after clicking "?" ────────────────── */}
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
          {/* ── Bottom answer panel (anchored to active gap) ───────────────── */}
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
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      confirmAnswer();
                    }
                    if (e.key === "Escape") setActiveGapId(null);
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
                      "dtg-bottom-panel-confirm",
                      !answerDraft.trim()
                        ? "dtg-bottom-panel-confirm--disabled"
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
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

        {/* ── Generate button ───────────────────────────────────────────────── */}
        <button
          type="button"
          className="dtg-generate-btn"
          onClick={() => setShowAIModal(true)}
        >
          <Sparkles size={13} />
          Сгенерировать
        </button>

        <AIExerciseGeneratorModal
          exerciseType="type_word_in_gap"
          open={showAIModal}
          onClose={() => setShowAIModal(false)}
          segmentId={segmentId}
          onGenerated={(block) => {
            applyGeneratedBlock(block);
          }}
        />

        {/* ── Footer ────────────────────────────────────────────────────────── */}
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
                "dtg-btn-save",
                !canSave ? "dtg-btn-save--disabled" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={handleSave}
              disabled={!canSave}
              title={
                !canSave
                  ? "Заполните все пропуски перед сохранением"
                  : "Сохранить упражнение"
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