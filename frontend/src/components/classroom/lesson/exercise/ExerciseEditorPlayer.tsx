/**
 * ExerciseEditorPlayer.tsx — LinguAI v2 (Screenshot-match refactor)
 *
 * Changes from previous version:
 * - Content area: top offset matches fixed ExerciseHeader (49px, teacher ClassroomHeader)
 * - Content area: paddingBottom accounts for fixed ~76px bottom bar
 * - BottomBar: position fixed, bottom 0, left 0, right 0 — full-width, NO border-radius
 * - All question logic, handlers, stepper, type picker: UNCHANGED
 */

import React, { useCallback, useState, useEffect, useRef } from 'react';
import {
  Plus,
  CheckSquare, ToggleLeft, AlignLeft, PenLine,
  GripHorizontal, Link2, ArrowUpDown, List, X,
  Image, Video, Music, Upload,
} from 'lucide-react';
import QuestionEditorRenderer, {
  QuestionDraft,
  emptyDraftFor,
} from '../editors/QuestionEditorRenderer';
import { EXERCISE_HEADER_HEIGHT_PX } from './ExerciseHeader';
import type { MediaBlock, MediaBlockType } from './ExerciseEditorWorkspace';

// ─── Design tokens ─────────────────────────────────────────────────────────────

const T = {
  primary:    '#6C6FEF',
  primaryDk:  '#4F52C2',
  tint:       '#EEF0FE',
  tintDeep:   '#DDE1FC',
  bg:         '#F7F7FA',
  white:      '#FFFFFF',
  border:     '#E8EAFD',
  borderSoft: '#F1F2FA',
  text:       '#1C1F3A',
  sub:        '#6B6F8E',
  muted:      '#A8ABCA',
  danger:     '#E03C3C',
  dangerBg:   '#FFF1F1',
};

// ─── Type metadata ────────────────────────────────────────────────────────────

const TYPE_META: Record<
  QuestionDraft['type'],
  { label: string; color: string; bg: string; border: string; icon: React.ReactNode }
> = {
  multiple_choice:    { label: 'Multiple Choice',  color: '#6c6fef', bg: '#eef0fe', border: '#cdd0f7', icon: <CheckSquare    size={12} strokeWidth={2.2}/> },
  true_false:         { label: 'True / False',      color: '#0284c7', bg: '#eff8ff', border: '#bae0fd', icon: <ToggleLeft     size={12} strokeWidth={2.2}/> },
  open_answer:        { label: 'Open Answer',       color: '#17a865', bg: '#edfbf4', border: '#9fe6c2', icon: <AlignLeft      size={12} strokeWidth={2.2}/> },
  cloze_input:        { label: 'Fill in blank',     color: '#c07c11', bg: '#fff8eb', border: '#fcd27a', icon: <PenLine        size={12} strokeWidth={2.2}/> },
  cloze_drag:         { label: 'Drag to fill',      color: '#d97706', bg: '#fff7ed', border: '#fed7aa', icon: <GripHorizontal size={12} strokeWidth={2.2}/> },
  matching_pairs:     { label: 'Matching pairs',    color: '#be185d', bg: '#fdf2f8', border: '#fbcfe8', icon: <Link2          size={12} strokeWidth={2.2}/> },
  ordering_words:     { label: 'Word order',        color: '#0891b2', bg: '#ecfeff', border: '#a5f3fc', icon: <ArrowUpDown    size={12} strokeWidth={2.2}/> },
  ordering_sentences: { label: 'Sentence order',   color: '#4f52c2', bg: '#eef0fe', border: '#c5c8f8', icon: <List           size={12} strokeWidth={2.2}/> },
};

const ALL_TYPES = Object.keys(TYPE_META) as QuestionDraft['type'][];

// ─── Props ────────────────────────────────────────────────────────────────────

interface ExerciseEditorPlayerProps {
  questions: QuestionDraft[];
  activeIndex: number;
  isSaving?: boolean;
  onQuestionsChange: (questions: QuestionDraft[]) => void;
  onActiveIndexChange: (index: number) => void;
  onSave: () => void;
  onCancel?: () => void;
  /** Called when teacher picks a media block (image/video/audio) from the picker */
  onPickMedia?: (type: MediaBlockType) => void;
  /** True when this is a blank-slide canvas (questions optional) */
  isSlideMode?: boolean;
  /** Extra px at top to account for the slide-mode banner below the header */
  slideBannerHeight?: number;
  /** Media blocks to render above the question editor */
  mediaBlocks?: MediaBlock[];
  onMediaBlockChange?: (id: string, patch: Partial<MediaBlock>) => void;
  onRemoveMediaBlock?: (id: string) => void;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ExerciseEditorPlayer({
  questions,
  activeIndex,
  isSaving = false,
  onQuestionsChange,
  onActiveIndexChange,
  onSave,
  onCancel,
  onPickMedia,
  isSlideMode = false,
  slideBannerHeight = 0,
  mediaBlocks = [],
  onMediaBlockChange,
  onRemoveMediaBlock,
}: ExerciseEditorPlayerProps) {
  const [showTypeMenu, setShowTypeMenu] = useState(false);
  const [animKey, setAnimKey] = useState(0);
  const prevIndex = useRef(activeIndex);

  useEffect(() => {
    if (prevIndex.current !== activeIndex) {
      setAnimKey(k => k + 1);
      prevIndex.current = activeIndex;
    }
  }, [activeIndex]);

  const activeDraft = questions[activeIndex] ?? null;

  const handleDraftChange = useCallback(
    (updated: QuestionDraft) => {
      const next = [...questions];
      next[activeIndex] = updated;
      onQuestionsChange(next);
    },
    [questions, activeIndex, onQuestionsChange],
  );

  const handleAddQuestion = useCallback(
    (type: QuestionDraft['type']) => {
      const next = [...questions, emptyDraftFor(type)];
      onQuestionsChange(next);
      onActiveIndexChange(next.length - 1);
      setShowTypeMenu(false);
    },
    [questions, onQuestionsChange, onActiveIndexChange],
  );

  const handleRemoveQuestion = useCallback(
    (index: number) => {
      if (questions.length <= 1) return;
      const next = questions.filter((_, i) => i !== index);
      onQuestionsChange(next);
      onActiveIndexChange(Math.min(activeIndex, next.length - 1));
    },
    [questions, activeIndex, onQuestionsChange, onActiveIndexChange],
  );

  return (
    <>
      {/* ── Scrollable content area ────────────────────────────────────────── */}
      <div style={{
        position: 'fixed',
        top: EXERCISE_HEADER_HEIGHT_PX + slideBannerHeight,
        left: 0,
        right: 0,
        bottom: 76,
        overflowY: 'auto',
        background: T.bg,
      }}>
        <div style={{
          maxWidth: 720,
          margin: '0 auto',
          padding: '32px 24px 32px',
          display: 'flex',
          flexDirection: 'column',
          gap: 0,
        }}>
          {/* ── Media blocks (slide mode) ─────────────────── */}
          {mediaBlocks.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
              {mediaBlocks.map(block => (
                <InlineMediaBlock
                  key={block.id}
                  block={block}
                  onChange={(patch) => onMediaBlockChange?.(block.id, patch)}
                  onRemove={() => onRemoveMediaBlock?.(block.id)}
                />
              ))}
            </div>
          )}
          {/* ── Question stepper (only when > 1 questions) ── */}
          {questions.length > 1 && (
            <QuestionStepper
              questions={questions}
              activeIndex={activeIndex}
              onSelect={onActiveIndexChange}
              onRemove={handleRemoveQuestion}
            />
          )}

          {/* ── Active question card ─────────────────────── */}
          {activeDraft ? (
            <div
              key={animKey}
              style={{
                background: T.white,
                borderRadius: 16,
                border: `1px solid ${T.border}`,
                boxShadow: '0 2px 12px rgba(108,111,239,0.06), 0 1px 3px rgba(26,29,58,0.04)',
                overflow: 'hidden',
                animation: 'pmSlideIn 180ms cubic-bezier(0.22,1,0.36,1) both',
              }}
            >
              <QuestionCardHeader
                draft={activeDraft}
                index={activeIndex}
                total={questions.length}
              />
              <div style={{ padding: '24px 28px 32px' }}>
                <QuestionEditorRenderer
                  draft={activeDraft}
                  onChange={handleDraftChange}
                />
              </div>
            </div>
          ) : mediaBlocks.length === 0 ? (
            /* Only show empty state when there are no media blocks either */
            <EmptyState onAdd={() => setShowTypeMenu(true)} isSlideMode={isSlideMode} />
          ) : null}

          {/* ── Add question inline link ──────────────────── */}
          <div style={{
            marginTop: 20,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
          }}>
            <AddQuestionButton
              open={showTypeMenu}
              label={isSlideMode ? 'Add block' : 'Add question'}
              onClick={() => setShowTypeMenu(v => !v)}
            />
            {showTypeMenu && (
              <TypePickerPopover
                onPick={handleAddQuestion}
                onClose={() => setShowTypeMenu(false)}
                onPickMedia={onPickMedia}
              />
            )}
          </div>
        </div>
      </div>

      {/* ── Fixed full-width bottom bar ──────────────────────────────────── */}
      <BottomBar
        isSaving={isSaving}
        onSave={onSave}
        onCancel={onCancel}
      />

      <style>{`
        @keyframes pmSlideIn {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0);    }
        }
      `}</style>
    </>
  );
}

// ─── Question stepper ─────────────────────────────────────────────────────────

function QuestionStepper({
  questions, activeIndex, onSelect, onRemove,
}: {
  questions: QuestionDraft[];
  activeIndex: number;
  onSelect: (i: number) => void;
  onRemove: (i: number) => void;
}) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      marginBottom: 16,
      flexWrap: 'wrap',
    }}>
      {questions.map((q, i) => (
        <StepperTab
          key={i}
          index={i}
          isActive={i === activeIndex}
          prompt={q.prompt}
          canRemove={questions.length > 1}
          onClick={() => onSelect(i)}
          onRemove={() => onRemove(i)}
        />
      ))}
    </div>
  );
}

function StepperTab({
  index, isActive, prompt, canRemove, onClick, onRemove,
}: {
  index: number; isActive: boolean; prompt: string;
  canRemove: boolean; onClick: () => void; onRemove: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '5px 12px',
        borderRadius: 99,
        background: isActive ? T.tint : hovered ? T.bg : T.white,
        border: `1.5px solid ${isActive ? T.tintDeep : T.border}`,
        cursor: 'pointer',
        transition: 'all 120ms ease',
        userSelect: 'none',
      }}
    >
      <span style={{
        fontSize: 12,
        fontWeight: isActive ? 700 : 500,
        color: isActive ? T.primary : T.sub,
        letterSpacing: '-0.01em',
      }}>
        {index + 1}
      </span>
      {prompt.trim() && (
        <span style={{
          fontSize: 12,
          color: isActive ? T.primaryDk : T.sub,
          fontWeight: isActive ? 600 : 400,
          maxWidth: 120,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {prompt.trim()}
        </span>
      )}
      {canRemove && (
        <button
          onClick={e => { e.stopPropagation(); onRemove(); }}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 16, height: 16,
            border: 'none', background: 'transparent',
            color: hovered ? T.muted : 'transparent',
            cursor: 'pointer', padding: 0, borderRadius: 4,
            transition: 'color 110ms ease',
          }}
          title="Remove question"
        >
          <X size={10} strokeWidth={2.5} />
        </button>
      )}
    </div>
  );
}

// ─── Question card header ─────────────────────────────────────────────────────

function QuestionCardHeader({
  draft, index, total,
}: {
  draft: QuestionDraft; index: number; total: number;
}) {
  const meta = TYPE_META[draft.type];
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '13px 24px',
      borderBottom: `1px solid ${T.borderSoft}`,
      background: '#FAFBFF',
    }}>
      <span style={{
        flexShrink: 0,
        minWidth: 32, height: 22,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 6,
        background: T.tint, border: `1px solid ${T.tintDeep}`,
        fontSize: 11, fontWeight: 700, color: T.primary,
        letterSpacing: '-0.01em', padding: '0 7px',
      }}>
        {index + 1}{total > 1 ? ` / ${total}` : ''}
      </span>
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        fontSize: 11, fontWeight: 500, color: T.muted,
        letterSpacing: '0.01em',
      }}>
        {meta.icon}
        {meta.label}
      </span>
    </div>
  );
}

// ─── Add question button ──────────────────────────────────────────────────────

function AddQuestionButton({
  open, onClick, label = 'Add question',
}: { open: boolean; onClick: () => void; label?: string }) {
  const [hovered, setHovered] = useState(false);
  const active = open || hovered;
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '8px 18px',
        borderRadius: 99,
        border: `1.5px dashed ${active ? T.primary : T.border}`,
        background: active ? T.tint : 'transparent',
        color: active ? T.primary : T.muted,
        fontSize: 13, fontWeight: 600,
        cursor: 'pointer',
        transition: 'all 140ms ease',
        fontFamily: 'inherit',
        letterSpacing: '-0.01em',
      }}
    >
      <Plus size={13} strokeWidth={2.5} />
      {label}
    </button>
  );
}

// ─── Media type metadata ──────────────────────────────────────────────────────

const MEDIA_META: Record<
  MediaBlockType,
  { label: string; color: string; bg: string; border: string; icon: React.ReactNode }
> = {
  image: { label: 'Image',  color: '#0891b2', bg: '#ecfeff', border: '#a5f3fc', icon: <Image size={12} strokeWidth={2.2}/> },
  video: { label: 'Video',  color: '#7c3aed', bg: '#f5f3ff', border: '#c4b5fd', icon: <Video size={12} strokeWidth={2.2}/> },
  audio: { label: 'Audio',  color: '#0d9488', bg: '#f0fdfa', border: '#5eead4', icon: <Music size={12} strokeWidth={2.2}/> },
};

const MEDIA_TYPES = Object.keys(MEDIA_META) as MediaBlockType[];

// ─── Type picker popover ──────────────────────────────────────────────────────

function TypePickerPopover({
  onPick, onClose, onPickMedia,
}: {
  onPick: (t: QuestionDraft['type']) => void;
  onClose: () => void;
  onPickMedia?: (t: MediaBlockType) => void;
}) {
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 39 }} />
      <div style={{
        position: 'absolute',
        top: 'calc(100% + 10px)',
        left: '50%',
        transform: 'translateX(-50%)',
        background: T.white,
        borderRadius: 16,
        border: `1px solid ${T.border}`,
        boxShadow: '0 12px 40px rgba(108,111,239,0.12), 0 4px 12px rgba(26,29,58,0.06)',
        zIndex: 40,
        padding: '10px 8px 12px',
        minWidth: 300,
        animation: 'pmSlideIn 140ms cubic-bezier(0.22,1,0.36,1) both',
      }}>
        {/* ── Media blocks section ─────────────────────────────── */}
        {onPickMedia && (
          <>
            <p style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
              textTransform: 'uppercase', color: T.muted,
              padding: '2px 8px 8px', margin: 0,
            }}>
              Media
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 2, marginBottom: 2 }}>
              {MEDIA_TYPES.map(type => (
                <MediaPickerItem
                  key={type}
                  type={type}
                  onPick={() => { onClose(); onPickMedia(type); }}
                />
              ))}
            </div>

            {/* ── Divider ────────────────────────────────────────── */}
            <div style={{
              height: 1, background: T.borderSoft,
              margin: '8px 8px 10px',
            }} />
          </>
        )}

        {/* ── Question types section ───────────────────────────── */}
        <p style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
          textTransform: 'uppercase', color: T.muted,
          padding: '0 8px 8px', margin: 0,
        }}>
          Exercise
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
          {ALL_TYPES.map(type => (
            <TypePickerItem key={type} type={type} onPick={onPick} />
          ))}
        </div>
      </div>
    </>
  );
}

// ─── Media picker item ─────────────────────────────────────────────────────────

function MediaPickerItem({
  type, onPick,
}: { type: MediaBlockType; onPick: () => void }) {
  const meta = MEDIA_META[type];
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onPick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
        padding: '10px 8px', borderRadius: 10,
        border: `1.5px solid ${hovered ? meta.border : 'transparent'}`,
        background: hovered ? meta.bg : 'transparent',
        cursor: 'pointer', textAlign: 'center',
        transition: 'all 110ms ease', fontFamily: 'inherit',
      }}
    >
      <span style={{
        width: 28, height: 28,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 8,
        background: meta.bg, color: meta.color, border: `1px solid ${meta.border}`,
      }}>
        {meta.icon}
      </span>
      <span style={{ fontSize: 11, fontWeight: 600, color: T.text, letterSpacing: '-0.01em' }}>
        {meta.label}
      </span>
    </button>
  );
}

function TypePickerItem({
  type, onPick,
}: { type: QuestionDraft['type']; onPick: (t: QuestionDraft['type']) => void }) {
  const meta = TYPE_META[type];
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={() => onPick(type)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 10px', borderRadius: 10,
        border: `1.5px solid ${hovered ? meta.border : 'transparent'}`,
        background: hovered ? meta.bg : 'transparent',
        cursor: 'pointer', textAlign: 'left',
        transition: 'all 110ms ease', fontFamily: 'inherit',
      }}
    >
      <span style={{
        width: 24, height: 24,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 7,
        background: meta.bg, color: meta.color, border: `1px solid ${meta.border}`,
        flexShrink: 0,
      }}>
        {meta.icon}
      </span>
      <span style={{ fontSize: 12, fontWeight: 600, color: T.text, letterSpacing: '-0.01em' }}>
        {meta.label}
      </span>
    </button>
  );
}

// ─── Full-width fixed bottom bar ──────────────────────────────────────────────
// CRITICAL: position fixed, edge-to-edge, NO border-radius, NO side margins

function BottomBar({
  isSaving, onSave, onCancel,
}: {
  isSaving: boolean;
  onSave: () => void;
  onCancel?: () => void;
}) {
  const [saveHov, setSaveHov]     = useState(false);
  const [cancelHov, setCancelHov] = useState(false);

  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      height: 76,
      zIndex: 100,
      background: T.white,
      borderTop: `1px solid ${T.borderSoft}`,
      /* No border-radius — full-width edge-to-edge */
      display: 'flex',
      alignItems: 'center',
      padding: '0 24px',
      boxShadow: '0 -2px 12px rgba(26,29,58,0.04)',
    }}>
      {/* Inner container: buttons centered within max-width column */}
      <div style={{
        maxWidth: 720,
        margin: '0 auto',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}>
        {onCancel && (
          <button
            onClick={onCancel}
            onMouseEnter={() => setCancelHov(true)}
            onMouseLeave={() => setCancelHov(false)}
            style={{
              flex: 1,
              height: 46,
              borderRadius: 12,
              border: `1.5px solid ${cancelHov ? '#cdd0f7' : T.border}`,
              background: cancelHov ? T.tint : T.white,
              color: cancelHov ? T.primary : T.sub,
              fontSize: 14, fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 130ms ease',
              fontFamily: 'inherit', letterSpacing: '-0.01em',
            }}
          >
            Cancel
          </button>
        )}

        <button
          onClick={onSave}
          disabled={isSaving}
          onMouseEnter={() => setSaveHov(true)}
          onMouseLeave={() => setSaveHov(false)}
          style={{
            flex: onCancel ? 2 : 1,
            height: 46,
            borderRadius: 12,
            border: 'none',
            background: isSaving ? '#9496f4' : saveHov ? T.primaryDk : T.primary,
            color: '#fff',
            fontSize: 14, fontWeight: 700,
            cursor: isSaving ? 'not-allowed' : 'pointer',
            letterSpacing: '-0.01em',
            boxShadow: isSaving ? 'none'
              : saveHov ? '0 6px 22px rgba(108,111,239,0.42)'
              : '0 3px 10px rgba(108,111,239,0.30)',
            transform: saveHov && !isSaving ? 'translateY(-1px)' : 'none',
            transition: 'background 130ms ease, box-shadow 130ms ease, transform 130ms ease',
            fontFamily: 'inherit',
          }}
        >
          {isSaving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ onAdd, isSlideMode }: { onAdd: () => void; isSlideMode?: boolean }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 20, padding: '60px 40px', textAlign: 'center',
    }}>
      <div style={{
        width: 64, height: 64, borderRadius: 20,
        background: T.tint, border: `1.5px solid ${T.tintDeep}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Plus size={28} color={T.primary} strokeWidth={2} />
      </div>
      <div>
        <p style={{ fontSize: 16, fontWeight: 700, color: T.text, margin: '0 0 6px', letterSpacing: '-0.02em' }}>
          {isSlideMode ? 'Empty slide' : 'No questions yet'}
        </p>
        <p style={{ fontSize: 13, color: T.sub, margin: 0, lineHeight: 1.6 }}>
          {isSlideMode
            ? 'Use the button below to add an image, video, audio or exercise block.'
            : 'Add your first question to start building this exercise.'}
        </p>
      </div>
      <button
        onClick={onAdd}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '10px 24px', borderRadius: 12, border: 'none',
          background: hovered ? T.primaryDk : T.primary,
          color: '#fff', fontSize: 13, fontWeight: 700,
          cursor: 'pointer', letterSpacing: '-0.01em',
          boxShadow: hovered ? '0 6px 22px rgba(108,111,239,0.42)' : '0 3px 10px rgba(108,111,239,0.28)',
          transform: hovered ? 'translateY(-1px)' : 'none',
          transition: 'all 120ms ease', fontFamily: 'inherit',
        }}
      >
        <Plus size={14} strokeWidth={2.2} />
        {isSlideMode ? 'Add block' : 'Add first question'}
      </button>
    </div>
  );
}

// ─── InlineMediaBlock ─────────────────────────────────────────────────────────
// Rendered inside the scrollable player area (above question cards).

const INLINE_MEDIA_META: Record<MediaBlockType, {
  label: string; color: string; bg: string; border: string; icon: React.ReactNode;
  placeholder: string;
}> = {
  image: {
    label: 'Image', color: '#0891b2', bg: '#ecfeff', border: '#a5f3fc',
    icon: <Image size={16} strokeWidth={1.8}/>,
    placeholder: 'Paste an image URL or click upload →',
  },
  video: {
    label: 'Video', color: '#7c3aed', bg: '#f5f3ff', border: '#c4b5fd',
    icon: <Video size={16} strokeWidth={1.8}/>,
    placeholder: 'Paste a YouTube or Vimeo URL',
  },
  audio: {
    label: 'Audio', color: '#0d9488', bg: '#f0fdfa', border: '#5eead4',
    icon: <Music size={16} strokeWidth={1.8}/>,
    placeholder: 'Paste an audio file URL',
  },
};

function InlineMediaBlock({
  block, onChange, onRemove,
}: {
  block: MediaBlock;
  onChange: (patch: Partial<MediaBlock>) => void;
  onRemove: () => void;
}) {
  const meta = INLINE_MEDIA_META[block.mediaType];
  const [urlFocused, setUrlFocused] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div style={{
      background: T.white, borderRadius: 14,
      border: `1.5px solid ${T.border}`,
      boxShadow: '0 2px 10px rgba(108,111,239,0.05)',
      overflow: 'hidden',
      animation: 'mbEnter 200ms cubic-bezier(0.22,1,0.36,1) both',
    }}>
      {/* Coloured header strip */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 9,
        padding: '10px 14px',
        background: meta.bg, borderBottom: `1px solid ${meta.border}`,
      }}>
        <span style={{
          width: 28, height: 28, borderRadius: 8, flexShrink: 0,
          background: T.white, border: `1.5px solid ${meta.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: meta.color,
        }}>
          {meta.icon}
        </span>
        <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: meta.color, letterSpacing: '-0.01em' }}>
          {meta.label}
        </span>
        <button
          onClick={onRemove}
          style={{
            background: 'none', border: 'none', color: meta.color,
            opacity: 0.5, cursor: 'pointer', padding: 4, borderRadius: 5,
            display: 'flex', alignItems: 'center',
            transition: 'opacity 110ms ease',
          }}
          onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.opacity = '1')}
          onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.opacity = '0.5')}
        >
          <X size={13} strokeWidth={2.2} />
        </button>
      </div>

      {/* Body */}
      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 9 }}>
        {/* URL row */}
        <div style={{ display: 'flex', gap: 7 }}>
          <input
            type="url"
            value={block.url}
            onChange={e => onChange({ url: e.target.value })}
            onFocus={() => setUrlFocused(true)}
            onBlur={() => setUrlFocused(false)}
            placeholder={meta.placeholder}
            style={{
              flex: 1, height: 36, borderRadius: 9,
              border: `1.5px solid ${urlFocused ? meta.border : T.border}`,
              background: urlFocused ? meta.bg : T.bg,
              padding: '0 11px', fontSize: 12, color: T.text,
              outline: 'none', fontFamily: 'inherit',
              transition: 'all 110ms ease',
            }}
          />
          {block.mediaType === 'image' && (
            <>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) onChange({ url: URL.createObjectURL(f) });
                }}
              />
              <button
                type="button" onClick={() => fileRef.current?.click()}
                title="Upload image"
                style={{
                  height: 36, width: 36, borderRadius: 9, flexShrink: 0,
                  border: `1.5px solid ${T.border}`, background: T.bg,
                  color: T.muted, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', cursor: 'pointer',
                  transition: 'all 110ms ease',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = '#a5f3fc';
                  (e.currentTarget as HTMLButtonElement).style.background = '#ecfeff';
                  (e.currentTarget as HTMLButtonElement).style.color = '#0891b2';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = T.border;
                  (e.currentTarget as HTMLButtonElement).style.background = T.bg;
                  (e.currentTarget as HTMLButtonElement).style.color = T.muted;
                }}
              >
                <Upload size={14} strokeWidth={2} />
              </button>
            </>
          )}
        </div>

        {/* Inline preview */}
        {block.url.trim() && <InlineMediaPreview block={block} />}

        {/* Caption */}
        <input
          type="text" value={block.caption}
          onChange={e => onChange({ caption: e.target.value })}
          placeholder="Caption (optional)"
          style={{
            height: 32, borderRadius: 9,
            border: `1.5px solid ${T.border}`, background: T.bg,
            padding: '0 11px', fontSize: 11, color: T.sub,
            outline: 'none', fontFamily: 'inherit',
          }}
        />
      </div>

      <style>{`
        @keyframes mbEnter {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

function InlineMediaPreview({ block }: { block: MediaBlock }) {
  if (block.mediaType === 'image') {
    return (
      <div style={{
        borderRadius: 9, overflow: 'hidden', border: `1px solid ${T.border}`,
        maxHeight: 220, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: T.bg,
      }}>
        <img src={block.url} alt={block.caption || 'Preview'}
          style={{ maxWidth: '100%', maxHeight: 220, objectFit: 'contain', display: 'block' }}
          onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
        />
      </div>
    );
  }
  if (block.mediaType === 'video') {
    const yt = block.url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([a-zA-Z0-9_-]{11})/);
    if (yt) {
      return (
        <div style={{ borderRadius: 9, overflow: 'hidden', aspectRatio: '16/9', background: '#000' }}>
          <iframe src={`https://www.youtube.com/embed/${yt[1]}`}
            style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen title="Video preview"
          />
        </div>
      );
    }
    return (
      <div style={{
        borderRadius: 8, padding: '8px 12px',
        background: '#f5f3ff', border: '1px solid #c4b5fd',
        fontSize: 11, color: '#7c3aed',
      }}>
        Video URL saved — preview available after saving.
      </div>
    );
  }
  if (block.mediaType === 'audio') {
    return <audio src={block.url} controls style={{ width: '100%', borderRadius: 8 }} />;
  }
  return null;
}