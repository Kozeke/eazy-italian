/**
 * QuestionRenderer.tsx  — v3 polished
 *
 * New in this version:
 * - `reviewMode` prop: shows correct/incorrect overlay after submit
 * - Animated slide-in per question via `questionKey` prop
 * - MCOption correct/incorrect state with icon feedback
 * - TrueFalse correct/incorrect states
 * - OpenAnswer character counter
 * - ClozeInput gap fill states
 * - DnD players: subtle drag handle reveal, smoother drop zones
 * - All players: consistent design token usage
 *
 * Backend payload contract: UNCHANGED from Phase 5.
 *
 * Library: @dnd-kit/core + @dnd-kit/sortable + @dnd-kit/utilities
 */

import React, { useState } from 'react';
import {
  DndContext, DragOverlay,
  PointerSensor, TouchSensor, KeyboardSensor,
  useSensor, useSensors,
  closestCenter, closestCorners,
  useDroppable, useDraggable,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy,
  useSortable, arrayMove, sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  GripVertical, X, Check, CheckCircle2, XCircle,
  ChevronUp, ChevronDown,
} from 'lucide-react';
import './exercise-design-system.css';

// ─────────────────────────────────────────────────────────────────────────────
// Types (unchanged contract)
// ─────────────────────────────────────────────────────────────────────────────

export type QuestionType =
  | 'multiple_choice' | 'true_false' | 'open_answer'
  | 'cloze_input' | 'cloze_drag'
  | 'matching_pairs'
  | 'ordering_words' | 'ordering_sentences';

export interface QuestionOption  { id: string; text: string; }
export interface GapConfig       { id: string; answers: string[]; case_sensitive?: boolean; score?: number; }
export interface MatchItem       { id: string; text: string; }
export interface OrderToken      { id: string; text: string; }

export interface RuntimeQuestion {
  id: number;
  type: QuestionType | string;
  question_text?: string;
  prompt?: string;
  options?: QuestionOption[];
  gaps_config?: GapConfig[];
  template?: string;
  question_metadata?: {
    word_bank?: string[];
    shuffle_word_bank?: boolean;
    left_items?: MatchItem[];
    right_items?: MatchItem[];
    shuffle_right?: boolean;
    tokens?: OrderToken[];
    items?: OrderToken[];
    [key: string]: unknown;
  };
  order_index?: number;
  score?: number;
}

export type StudentAnswer =
  | string
  | Record<string, string>
  | Array<{ left_id: string; right_id: string }>
  | string[];

export interface QuestionRendererProps {
  question: RuntimeQuestion;
  answer: StudentAnswer | null;
  onAnswer: (answer: StudentAnswer) => void;
  disabled?: boolean;
  /** When set, shows correct/incorrect overlays */
  reviewMode?: {
    isCorrect?: boolean;
    correctAnswer?: StudentAnswer;
  };
  /** Triggers CSS animation when changed (e.g. pass question index) */
  questionKey?: string | number;
  /**
   * Lesson/homework teacher preview: show canonical answers, drag targets, and
   * ordering keys without enabling reviewMode scoring UI.
   */
  teacherAnswerHints?: boolean;
}

/** True when a bank word is accepted for a cloze-drag gap (honours case_sensitive). */
function bankWordMatchesGapAnswers(word: string, gap: GapConfig): boolean {
  const trimmed = word.trim();
  if (!trimmed) return false;
  return gap.answers.some((candidate) => {
    const a = candidate.trim();
    if (!a) return false;
    if (gap.case_sensitive) return a === trimmed;
    return a.toLowerCase() === trimmed.toLowerCase();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared primitives
// ─────────────────────────────────────────────────────────────────────────────

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function ColumnLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontSize: 10, fontWeight: 800, letterSpacing: '0.09em',
      textTransform: 'uppercase', color: 'var(--ex-ink-xlight)',
      marginBottom: 8, marginTop: 0,
    }}>
      {children}
    </p>
  );
}

function GapBadge({ index, filled }: { index: number; filled: boolean }) {
  return (
    <span style={{
      flexShrink: 0, width: 28, height: 28,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      borderRadius: 8,
      background: filled ? 'var(--ex-teal-bg)' : 'var(--ex-bg-hover)',
      border: `1.5px solid ${filled ? 'var(--ex-teal-border)' : 'var(--ex-border)'}`,
      color: filled ? 'var(--ex-teal)' : 'var(--ex-ink-xlight)',
      fontSize: 11, fontWeight: 800,
      transition: 'all var(--ex-trans-base)',
    }}>
      {index + 1}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. MultipleChoice  — polished cards + review states
// ─────────────────────────────────────────────────────────────────────────────

export function MultipleChoiceQuestionPlayer({
  question, answer, onAnswer, disabled = false, reviewMode,
}: QuestionRendererProps) {
  const options  = question.options ?? [];
  const selected = typeof answer === 'string' ? answer : null;

  return (
    <div className="ex-stagger" style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      {options.map((opt, i) => {
        const isSelected = selected === opt.id;
        const isCorrect  = reviewMode && isSelected && reviewMode.isCorrect;
        const isWrong    = reviewMode && isSelected && reviewMode.isCorrect === false;
        const isCorrectAnswer = reviewMode && !isSelected &&
          (Array.isArray(reviewMode.correctAnswer)
            ? (reviewMode.correctAnswer as string[]).includes(opt.id)
            : reviewMode.correctAnswer === opt.id);

        let border = 'var(--ex-border-soft)';
        let bg     = 'var(--ex-bg)';
        let textColor = 'var(--ex-ink-mid)';
        if (isCorrect || isCorrectAnswer) { border = 'var(--ex-green-border)'; bg = 'var(--ex-green-bg)'; textColor = 'var(--ex-green)'; }
        if (isWrong)   { border = 'var(--ex-red-border)';   bg = 'var(--ex-red-bg)'; textColor = 'var(--ex-red)'; }
        if (isSelected && !reviewMode) { border = 'var(--ex-teal-border)'; bg = 'var(--ex-teal-bg)'; textColor = 'var(--ex-teal)'; }

        return (
          <MCOptionCard
            key={opt.id}
            letter={LETTERS[i]}
            text={opt.text}
            isSelected={isSelected}
            isCorrect={!!isCorrect || !!isCorrectAnswer}
            isWrong={!!isWrong}
            disabled={disabled || !!reviewMode}
            border={border} bg={bg} textColor={textColor}
            onClick={() => !disabled && !reviewMode && onAnswer(opt.id)}
          />
        );
      })}
    </div>
  );
}

function MCOptionCard({
  letter, text, isSelected, isCorrect, isWrong, disabled,
  border, bg, textColor, onClick,
}: {
  letter: string; text: string; isSelected: boolean;
  isCorrect: boolean; isWrong: boolean; disabled: boolean;
  border: string; bg: string; textColor: string;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const canHover = !disabled && !isSelected;

  return (
    <button
      type="button" onClick={onClick} disabled={disabled}
      onMouseEnter={() => canHover && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={isWrong ? 'ex-animate-shake' : isCorrect && isSelected ? 'ex-animate-bounce-in' : ''}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        width: '100%', padding: '12px 15px', borderRadius: 12,
        border: `2px solid ${hovered && canHover ? 'var(--ex-teal-border)' : border}`,
        background: hovered && canHover ? 'var(--ex-teal-bg)' : bg,
        cursor: disabled ? 'default' : 'pointer',
        textAlign: 'left', fontFamily: 'inherit',
        transition: 'border-color var(--ex-trans-base), background var(--ex-trans-base), box-shadow var(--ex-trans-base)',
        boxShadow: isSelected && !isWrong
          ? `0 0 0 3px ${isCorrect ? 'var(--ex-green-light)' : 'var(--ex-teal-light)'}`
          : hovered && canHover ? 'var(--ex-shadow-sm)' : 'none',
      }}
    >
      {/* Badge */}
      <span style={{
        flexShrink: 0, width: 30, height: 30,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 9,
        background: isCorrect ? 'var(--ex-green)' : isWrong ? 'var(--ex-red)' : isSelected ? 'var(--ex-teal)' : 'var(--ex-bg-hover)',
        color: isCorrect || isWrong || isSelected ? '#fff' : 'var(--ex-ink-light)',
        fontSize: 11, fontWeight: 800,
        transition: 'all var(--ex-trans-base)',
      }}>
        {isCorrect ? <CheckCircle2 size={14} /> : isWrong ? <XCircle size={14} /> : isSelected ? <Check size={14} /> : letter}
      </span>

      <span style={{
        flex: 1, fontSize: 14, lineHeight: 1.45,
        color: hovered && canHover ? 'var(--ex-teal)' : textColor,
        fontWeight: isSelected ? 600 : 400,
        transition: 'color var(--ex-trans-fast)',
      }}>
        {text}
      </span>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. TrueFalse  — segmented pill + review states
// ─────────────────────────────────────────────────────────────────────────────

export function TrueFalseQuestionPlayer({
  question, answer, onAnswer, disabled = false, reviewMode, teacherAnswerHints,
}: QuestionRendererProps) {
  const selected = typeof answer === 'string' ? answer : null;
  const opts = question.options?.length
    ? question.options
    : [{ id: 'true', text: 'True' }, { id: 'false', text: 'False' }];
  const canonicalId = question.question_metadata?.correct_option_id as 'true' | 'false' | '' | undefined;

  return (
    <div style={{
      display: 'flex', borderRadius: 14,
      border: '2px solid var(--ex-border-soft)',
      background: 'var(--ex-bg-soft)', padding: 4, gap: 4, width: '100%',
    }}>
      {opts.map(opt => {
        const isTrue     = opt.id === 'true';
        const isSelected = selected === opt.id;
        const isCorrect  = reviewMode && isSelected && reviewMode.isCorrect;
        const isWrong    = reviewMode && isSelected && !reviewMode.isCorrect;
        const teacherKeyed =
          Boolean(teacherAnswerHints) &&
          !reviewMode &&
          (canonicalId === 'true' || canonicalId === 'false') &&
          opt.id === canonicalId &&
          !isSelected;

        let activeBg = isTrue ? 'var(--ex-green-bg)' : 'var(--ex-red-bg)';
        let activeColor = isTrue ? 'var(--ex-green)' : 'var(--ex-red)';
        let activeBorder = isTrue ? 'var(--ex-green-border)' : 'var(--ex-red-border)';

        if (!reviewMode && isSelected) {
          activeBg = isTrue ? 'var(--ex-teal-bg)' : 'var(--ex-red-bg)';
          activeColor = isTrue ? 'var(--ex-teal)' : 'var(--ex-red)';
          activeBorder = isTrue ? 'var(--ex-teal-border)' : 'var(--ex-red-border)';
        }
        if (isWrong) { activeBg = 'var(--ex-red-bg)'; activeColor = 'var(--ex-red)'; activeBorder = 'var(--ex-red-border)'; }
        if (isCorrect) { activeBg = 'var(--ex-green-bg)'; activeColor = 'var(--ex-green)'; activeBorder = 'var(--ex-green-border)'; }
        if (teacherKeyed) {
          activeBg = 'var(--ex-violet-light)';
          activeColor = 'var(--ex-violet)';
          activeBorder = 'var(--ex-violet-border)';
        }

        return (
          <button
            key={opt.id} type="button"
            disabled={disabled || !!reviewMode}
            onClick={() => !disabled && !reviewMode && onAnswer(opt.id)}
            className={isWrong ? 'ex-animate-shake' : ''}
            style={{
              flex: 1, padding: '12px 0', borderRadius: 10,
              border: `2px solid ${isSelected ? activeBorder : 'transparent'}`,
              background: isSelected ? activeBg : 'transparent',
              color: isSelected ? activeColor : 'var(--ex-ink-light)',
              fontSize: 15, fontWeight: 700,
              cursor: disabled || reviewMode ? 'default' : 'pointer',
              transition: 'all var(--ex-trans-base)', fontFamily: 'inherit',
            }}
          >
            {isTrue ? '✓  True' : '✗  False'}
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. OpenAnswer  — clean textarea with character counter
// ─────────────────────────────────────────────────────────────────────────────

export function OpenAnswerQuestionPlayer({
  question, answer, onAnswer, disabled = false, reviewMode, teacherAnswerHints,
}: QuestionRendererProps) {
  const value = typeof answer === 'string' ? answer : '';
  const [focused, setFocused] = useState(false);
  const MAX = 800;
  const teacherOpen = question.question_metadata?.teacher_open_answer as
    | {
        expected_mode?: string;
        keywords?: Array<{ text?: string; weight?: number }>;
        pattern?: string;
        case_insensitive?: boolean;
      }
    | undefined;

  const borderColor = reviewMode
    ? reviewMode.isCorrect ? 'var(--ex-green-border)' : 'var(--ex-red-border)'
    : focused ? 'var(--ex-teal-border)' : 'var(--ex-border)';

  const bgColor = reviewMode
    ? reviewMode.isCorrect ? 'var(--ex-green-bg)' : 'var(--ex-red-bg)'
    : 'var(--ex-bg)';

  return (
    <div style={{ position: 'relative' }}>
      <textarea
        value={value}
        onChange={e => onAnswer(e.target.value)}
        disabled={disabled || !!reviewMode}
        maxLength={MAX}
        rows={4}
        placeholder="Write your answer here…"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          width: '100%', boxSizing: 'border-box',
          padding: '13px 16px 32px', borderRadius: 12,
          border: `2px solid ${borderColor}`,
          background: bgColor, fontSize: 14, color: 'var(--ex-ink)',
          lineHeight: 1.6, resize: 'vertical', outline: 'none',
          transition: 'border-color var(--ex-trans-base), box-shadow var(--ex-trans-base)',
          boxShadow: focused ? '0 0 0 3px var(--ex-teal-light)' : 'none',
          fontFamily: 'inherit',
          cursor: disabled || reviewMode ? 'default' : 'text',
        }}
        className={reviewMode && !reviewMode.isCorrect ? 'ex-animate-shake' : ''}
      />
      {/* Character counter */}
      {!disabled && !reviewMode && (
        <span style={{
          position: 'absolute', bottom: 9, right: 12,
          fontSize: 10, color: value.length > MAX * 0.9 ? 'var(--ex-amber)' : 'var(--ex-ink-ghost)',
          fontWeight: 500, pointerEvents: 'none',
        }}>
          {value.length}/{MAX}
        </span>
      )}
      {/* Review overlay */}
      {reviewMode && (
        <div style={{
          position: 'absolute', top: 10, right: 12,
          display: 'flex', alignItems: 'center', gap: 4,
          fontSize: 12, fontWeight: 700,
          color: reviewMode.isCorrect ? 'var(--ex-green)' : 'var(--ex-red)',
        }}>
          {reviewMode.isCorrect
            ? <><CheckCircle2 size={14}/> Correct</>
            : <><XCircle size={14}/> Review required</>
          }
        </div>
      )}
      {teacherAnswerHints && teacherOpen && !reviewMode && (
        <div style={{
          marginTop: 10,
          padding: '10px 12px',
          borderRadius: 10,
          border: '1px dashed var(--ex-violet-border)',
          background: 'var(--ex-violet-light)',
          color: 'var(--ex-violet)',
          fontSize: 12,
          lineHeight: 1.5,
        }}>
          <strong>Teacher · Expected</strong>
          {teacherOpen.expected_mode === 'regex' ? (
            <div>Pattern: <code style={{ fontSize: 11 }}>{teacherOpen.pattern || '—'}</code></div>
          ) : (
            <div>
              Keywords:{' '}
              {(teacherOpen.keywords ?? [])
                .map((keyword) => keyword.text)
                .filter(Boolean)
                .join(', ') || '—'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. ClozeInput  — polished gap inputs
// ─────────────────────────────────────────────────────────────────────────────

export function ClozeInputQuestionPlayer({
  question, answer, onAnswer, disabled = false, teacherAnswerHints,
}: QuestionRendererProps) {
  const gaps = question.gaps_config ?? [];
  const current: Record<string, string> =
    answer && typeof answer === 'object' && !Array.isArray(answer)
      ? (answer as Record<string, string>) : {};

  const promptText = question.question_text ?? question.prompt ?? '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {promptText && (
        <div style={{
          padding: '11px 14px', borderRadius: 10,
          background: 'var(--ex-bg-soft)', border: '1px solid var(--ex-border-soft)',
          fontSize: 14, color: 'var(--ex-ink-mid)', lineHeight: 1.6,
        }}>
          {promptText}
        </div>
      )}
      {gaps.map((gap, i) => (
        <ClozeInputRow
          key={gap.id} gap={gap} index={i}
          value={current[gap.id] ?? ''}
          onChange={v => onAnswer({ ...current, [gap.id]: v })}
          disabled={disabled}
          teacherAcceptedPreview={teacherAnswerHints ? gap.answers.join(' · ') : undefined}
        />
      ))}
    </div>
  );
}

function ClozeInputRow({
  gap: _gap,
  index,
  value,
  onChange,
  disabled,
  teacherAcceptedPreview,
}: { gap: GapConfig; index: number; value: string; onChange: (v: string) => void; disabled: boolean; teacherAcceptedPreview?: string }) {
  const [focused, setFocused] = useState(false);
  const filled = value.length > 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <GapBadge index={index} filled={filled} />
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          disabled={disabled}
          placeholder={`Answer for gap ${index + 1}`}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            flex: 1, padding: '10px 14px', borderRadius: 10,
            border: `2px solid ${focused ? 'var(--ex-teal-border)' : filled ? 'var(--ex-green-border)' : 'var(--ex-border)'}`,
            background: filled ? 'var(--ex-green-bg)' : 'var(--ex-bg)',
            fontSize: 14, color: 'var(--ex-ink)', outline: 'none',
            transition: 'all var(--ex-trans-base)',
            boxShadow: focused ? '0 0 0 3px var(--ex-teal-light)' : 'none',
            fontFamily: 'inherit',
          }}
        />
      </div>
      {teacherAcceptedPreview && (
        <div style={{ marginLeft: 40, fontSize: 11, fontWeight: 600, color: 'var(--ex-violet)' }}>
          Accepts: {teacherAcceptedPreview}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. ClozeDrag  — polished DnD word-bank
// ─────────────────────────────────────────────────────────────────────────────

export function ClozeDragQuestionPlayer({
  question, answer, onAnswer, disabled = false, teacherAnswerHints,
}: QuestionRendererProps) {
  const gaps     = question.gaps_config ?? [];
  const wordBank: string[] = question.question_metadata?.word_bank ?? [];
  const current: Record<string, string> =
    answer && typeof answer === 'object' && !Array.isArray(answer)
      ? (answer as Record<string, string>) : {};

  const [activeWord, setActiveWord] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 120, tolerance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const usedWords = new Set(Object.values(current));
  const availableWords = wordBank.filter(w => !usedWords.has(w) || w === activeWord);

  function handleDragStart(e: DragStartEvent) {
    const id = String(e.active.id);
    if (id.startsWith('word::')) setActiveWord(id.slice(6));
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveWord(null);
    const activeId = String(e.active.id);
    const overId   = e.over ? String(e.over.id) : null;
    if (!overId || !activeId.startsWith('word::')) return;
    const word = activeId.slice(6);
    if (overId.startsWith('gap::')) {
      const next = { ...current };
      for (const [k, v] of Object.entries(next)) { if (v === word) delete next[k]; }
      next[overId.slice(5)] = word;
      onAnswer(next);
    } else if (overId === 'word-bank') {
      const next = { ...current };
      for (const [k, v] of Object.entries(next)) { if (v === word) delete next[k]; }
      onAnswer(next);
    }
  }

  return (
    <DndContext sensors={disabled ? [] : sensors} collisionDetection={closestCorners}
      onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {gaps.map((gap, i) => (
            <ClozeDragGapSlot key={gap.id} gap={gap} index={i}
              filled={current[gap.id] ?? null} disabled={disabled}
              onClear={() => { const n = { ...current }; delete n[gap.id]; onAnswer(n); }}
              teacherHintActive={Boolean(teacherAnswerHints && activeWord && bankWordMatchesGapAnswers(activeWord, gap))}
            />
          ))}
        </div>
        <WordBankZone words={availableWords} disabled={disabled} />
      </div>
      <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.18,0.67,0.6,1.22)' }}>
        {activeWord && <WordPill word={activeWord} isOverlay />}
      </DragOverlay>
    </DndContext>
  );
}

function ClozeDragGapSlot({ gap, index, filled, disabled, onClear, teacherHintActive }: {
  gap: GapConfig; index: number; filled: string | null;
  disabled: boolean; onClear: () => void;
  teacherHintActive?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `gap::${gap.id}`, disabled });
  const hintDrop = Boolean(teacherHintActive && !filled && !isOver);
  const teacherHintStyle = hintDrop
    ? {
      border: '2px dashed var(--ex-violet-border)' as const,
      background: 'var(--ex-violet-light)' as const,
      boxShadow: '0 0 0 3px var(--ex-violet-glow)' as const,
    }
    : {};
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <GapBadge index={index} filled={!!filled} />
      <div ref={setNodeRef} style={{
        flex: 1, minHeight: 46,
        display: 'flex', alignItems: 'center',
        paddingLeft: filled ? 0 : 14,
        borderRadius: 11,
        border: `2px ${filled ? 'solid' : 'dashed'} ${isOver ? 'var(--ex-violet)' : filled ? 'var(--ex-teal-border)' : 'var(--ex-border)'}`,
        background: isOver ? 'var(--ex-violet-light)' : filled ? 'var(--ex-teal-bg)' : 'var(--ex-bg-soft)',
        transition: 'all var(--ex-trans-base)',
        boxShadow: isOver ? '0 0 0 3px var(--ex-violet-glow)' : 'none',
        ...teacherHintStyle,
      }}>
        {filled ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px' }}>
            <WordPill word={filled} isDraggable={!disabled} gapId={gap.id} />
            {!disabled && (
              <button type="button" onClick={onClear} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 20, height: 20, borderRadius: 5,
                border: 'none', background: 'transparent',
                color: 'var(--ex-ink-ghost)', cursor: 'pointer', transition: 'color var(--ex-trans-fast)',
              }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--ex-red)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--ex-ink-ghost)')}
              ><X size={13} /></button>
            )}
          </div>
        ) : (
          <span style={{
            fontSize: 13, fontStyle: 'italic', fontWeight: isOver ? 600 : 400,
            color: isOver ? 'var(--ex-violet)' : 'var(--ex-ink-ghost)',
          }}>
            {isOver ? 'Drop here' : 'Drag a word here'}
          </span>
        )}
      </div>
    </div>
  );
}

function WordBankZone({ words, disabled }: { words: string[]; disabled: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'word-bank', disabled });
  return (
    <div>
      <ColumnLabel>Word bank</ColumnLabel>
      <div ref={setNodeRef} style={{
        display: 'flex', flexWrap: 'wrap', gap: 8,
        minHeight: 54, padding: '10px 12px', borderRadius: 12,
        border: `2px dashed ${isOver ? 'var(--ex-violet)' : 'var(--ex-border)'}`,
        background: isOver ? 'var(--ex-violet-light)' : 'var(--ex-bg-soft)',
        transition: 'all var(--ex-trans-base)',
        boxShadow: isOver ? '0 0 0 3px var(--ex-violet-glow)' : 'none',
      }}>
        {words.length === 0
          ? <span style={{ fontSize: 12, color: 'var(--ex-ink-ghost)', fontStyle: 'italic', alignSelf: 'center' }}>All words placed ✓</span>
          : words.map(w => <WordPill key={w} word={w} isDraggable={!disabled} />)
        }
      </div>
    </div>
  );
}

function WordPill({ word, isDraggable = false, gapId, isOverlay = false }: {
  word: string; isDraggable?: boolean; gapId?: string; isOverlay?: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `word::${word}`, disabled: !isDraggable, data: { word, gapId },
  });
  const [hovered, setHovered] = useState(false);
  return (
    <div ref={setNodeRef} {...(isDraggable ? { ...listeners, ...attributes } : {})}
      onMouseEnter={() => isDraggable && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '6px 13px', borderRadius: 20,
        border: `1.5px solid ${isDragging && !isOverlay ? 'var(--ex-border)' : 'var(--ex-teal-border)'}`,
        background: isDragging && !isOverlay ? 'transparent' : hovered ? 'var(--ex-teal-border)' : 'var(--ex-teal-bg)',
        color: isDragging && !isOverlay ? 'transparent' : hovered ? 'var(--ex-teal)' : 'var(--ex-teal)',
        fontSize: 13, fontWeight: 700,
        cursor: isDraggable ? (isDragging ? 'grabbing' : 'grab') : 'default',
        userSelect: 'none', transition: 'all var(--ex-trans-fast)',
        boxShadow: isOverlay ? 'var(--ex-shadow-drag)' : hovered ? 'var(--ex-shadow-xs)' : 'none',
        transform: isOverlay ? 'rotate(2deg) scale(1.05)' : hovered ? 'translateY(-1px)' : 'none',
      }}
    >
      {isDraggable && <GripVertical size={10} style={{ opacity: hovered ? 0.7 : 0.3, transition: 'opacity 0.15s' }} />}
      {word}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. MatchingPairs  — drag right items onto left slots
// ─────────────────────────────────────────────────────────────────────────────

export function MatchingPairsQuestionPlayer({
  question, answer, onAnswer, disabled = false, teacherAnswerHints,
}: QuestionRendererProps) {
  const leftItems:  MatchItem[] = question.question_metadata?.left_items  ?? [];
  const rightItems: MatchItem[] = question.question_metadata?.right_items ?? [];
  const current: Array<{ left_id: string; right_id: string }> =
    Array.isArray(answer) ? (answer as Array<{ left_id: string; right_id: string }>) : [];

  const [activeRightId, setActiveRightId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 120, tolerance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const getPairedRight = (leftId: string) => current.find(p => p.left_id === leftId)?.right_id ?? null;
  const pairedRightIds = new Set(current.map(p => p.right_id));
  const unpairedRight  = rightItems.filter(r => !pairedRightIds.has(r.id));
  const getItem = (id: string) => rightItems.find(r => r.id === id);
  const canonicalPairs = (question.question_metadata?.pairs as Array<{ left_id: string; right_id: string }> | undefined) ?? [];
  const leftByRightId = new Map(canonicalPairs.map(p => [p.right_id, p.left_id]));

  function handleDragStart(e: DragStartEvent) {
    const id = String(e.active.id);
    if (id.startsWith('right::')) setActiveRightId(id.slice(7));
  }
  function handleDragEnd(e: DragEndEvent) {
    setActiveRightId(null);
    const activeId = String(e.active.id);
    const overId   = e.over ? String(e.over.id) : null;
    if (!overId || !activeId.startsWith('right::')) return;
    const rightId = activeId.slice(7);
    if (overId.startsWith('left::')) {
      const leftId = overId.slice(6);
      const next = current.filter(p => p.left_id !== leftId && p.right_id !== rightId);
      onAnswer([...next, { left_id: leftId, right_id: rightId }]);
    } else if (overId === 'unmatched') {
      onAnswer(current.filter(p => p.right_id !== rightId));
    }
  }

  const activeItem = activeRightId ? getItem(activeRightId) : null;

  return (
    <DndContext sensors={disabled ? [] : sensors} collisionDetection={closestCorners}
      onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {leftItems.map(left => {
            const pairedRightId = getPairedRight(left.id);
            const teacherHintLeftSlot =
              Boolean(teacherAnswerHints && activeRightId && leftByRightId.get(activeRightId) === left.id);
            return (
              <MatchRow key={left.id} left={left}
                pairedRight={pairedRightId ? (getItem(pairedRightId) ?? null) : null}
                disabled={disabled}
                onClear={() => onAnswer(current.filter(p => p.left_id !== left.id))}
                teacherHintLeftSlot={teacherHintLeftSlot}
              />
            );
          })}
        </div>
        <UnmatchedPool items={unpairedRight} disabled={disabled} />
      </div>
      <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.18,0.67,0.6,1.22)' }}>
        {activeItem && <RightPill item={activeItem} isOverlay />}
      </DragOverlay>
    </DndContext>
  );
}

function MatchRow({ left, pairedRight, disabled, onClear, teacherHintLeftSlot }: {
  left: MatchItem; pairedRight: MatchItem | null;
  disabled: boolean; onClear: () => void;
  teacherHintLeftSlot?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `left::${left.id}`, disabled });
  const teacherHintStyle =
    teacherHintLeftSlot && !pairedRight
      ? {
        border: '2px dashed var(--ex-violet-border)' as const,
        background: 'var(--ex-violet-light)' as const,
        boxShadow: '0 0 0 3px var(--ex-violet-glow)' as const,
      }
      : {};
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{
        flex: 1, padding: '11px 14px', borderRadius: 10,
        background: 'var(--ex-bg-soft)',
        border: '2px solid var(--ex-border-soft)',
        fontSize: 14, fontWeight: 600, color: 'var(--ex-ink-mid)',
      }}>
        {left.text}
      </div>
      <span style={{ color: 'var(--ex-ink-ghost)', fontSize: 16, flexShrink: 0 }}>→</span>
      <div ref={setNodeRef} style={{
        flex: 1, minHeight: 46,
        display: 'flex', alignItems: 'center',
        padding: pairedRight ? '6px 10px' : '0 14px',
        borderRadius: 11,
        border: `2px ${pairedRight ? 'solid' : 'dashed'} ${isOver ? 'var(--ex-violet)' : pairedRight ? 'var(--ex-green-border)' : 'var(--ex-border)'}`,
        background: isOver ? 'var(--ex-violet-light)' : pairedRight ? 'var(--ex-green-bg)' : 'var(--ex-bg-soft)',
        transition: 'all var(--ex-trans-base)',
        boxShadow: isOver ? '0 0 0 3px var(--ex-violet-glow)' : 'none',
        ...(teacherHintLeftSlot && !pairedRight && !isOver ? teacherHintStyle : {}),
      }}>
        {pairedRight ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
            <RightPill item={pairedRight} isDraggable={!disabled} />
            {!disabled && (
              <button type="button" onClick={onClear} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 20, height: 20, borderRadius: 5,
                border: 'none', background: 'transparent',
                color: 'var(--ex-ink-ghost)', cursor: 'pointer',
                marginLeft: 'auto', transition: 'color var(--ex-trans-fast)',
              }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--ex-red)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--ex-ink-ghost)')}
              ><X size={13} /></button>
            )}
          </div>
        ) : (
          <span style={{
            fontSize: 13, fontStyle: 'italic',
            color: isOver ? 'var(--ex-violet)' : 'var(--ex-ink-ghost)',
            fontWeight: isOver ? 600 : 400,
          }}>
            {isOver ? 'Drop here' : 'Drag a match here'}
          </span>
        )}
      </div>
    </div>
  );
}

function UnmatchedPool({ items, disabled }: { items: MatchItem[]; disabled: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'unmatched', disabled });
  return (
    <div>
      <ColumnLabel>Available matches</ColumnLabel>
      <div ref={setNodeRef} style={{
        display: 'flex', flexWrap: 'wrap', gap: 8,
        minHeight: 54, padding: '10px 12px', borderRadius: 12,
        border: `2px dashed ${isOver ? 'var(--ex-violet)' : 'var(--ex-border)'}`,
        background: isOver ? 'var(--ex-violet-light)' : 'var(--ex-bg-soft)',
        transition: 'all var(--ex-trans-base)',
        boxShadow: isOver ? '0 0 0 3px var(--ex-violet-glow)' : 'none',
      }}>
        {items.length === 0
          ? <span style={{ fontSize: 12, color: 'var(--ex-ink-ghost)', fontStyle: 'italic', alignSelf: 'center' }}>All items matched ✓</span>
          : items.map(item => <RightPill key={item.id} item={item} isDraggable={!disabled} />)
        }
      </div>
    </div>
  );
}

function RightPill({ item, isDraggable = false, isOverlay = false }: {
  item: MatchItem; isDraggable?: boolean; isOverlay?: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `right::${item.id}`, disabled: !isDraggable, data: { item },
  });
  const [hovered, setHovered] = useState(false);
  return (
    <div ref={setNodeRef} {...(isDraggable ? { ...listeners, ...attributes } : {})}
      onMouseEnter={() => isDraggable && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '7px 13px', borderRadius: 20,
        border: `1.5px solid ${isDragging && !isOverlay ? 'var(--ex-border)' : 'var(--ex-violet-border)'}`,
        background: isDragging && !isOverlay ? 'transparent' : hovered ? 'var(--ex-violet-border)' : 'var(--ex-violet-light)',
        color: isDragging && !isOverlay ? 'transparent' : 'var(--ex-violet)',
        fontSize: 13, fontWeight: 700,
        cursor: isDraggable ? (isDragging ? 'grabbing' : 'grab') : 'default',
        userSelect: 'none', transition: 'all var(--ex-trans-fast)',
        boxShadow: isOverlay ? 'var(--ex-shadow-drag)' : hovered ? 'var(--ex-shadow-xs)' : 'none',
        transform: isOverlay ? 'rotate(-1.5deg) scale(1.05)' : hovered ? 'translateY(-1px)' : 'none',
      }}
    >
      {isDraggable && <GripVertical size={10} style={{ opacity: hovered ? 0.7 : 0.3, transition: 'opacity 0.15s' }} />}
      {item.text}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 7 & 8. Ordering  — @dnd-kit sortable with polished row design
// ─────────────────────────────────────────────────────────────────────────────

function OrderingPlayer({ items, answer, onAnswer, disabled, label, correctOrderIds, teacherAnswerHints }: {
  items: OrderToken[]; answer: StudentAnswer | null;
  onAnswer: (a: string[]) => void; disabled: boolean; label: 'word' | 'sentence';
  correctOrderIds: string[];
  teacherAnswerHints?: boolean;
}) {
  const defaultOrder = items.map(t => t.id);
  const currentIds: string[] = Array.isArray(answer) ? (answer as string[]) : defaultOrder;
  const orderedItems = currentIds.map(id => items.find(t => t.id === id)).filter(Boolean) as OrderToken[];
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeItem = activeId ? items.find(t => t.id === activeId) : null;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 120, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragStart(e: DragStartEvent) { setActiveId(String(e.active.id)); }
  function handleDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oi = currentIds.indexOf(String(active.id));
    const ni = currentIds.indexOf(String(over.id));
    if (oi < 0 || ni < 0) return;
    onAnswer(arrayMove(currentIds, oi, ni));
  }

  const move = (idx: number, dir: -1 | 1) => {
    if (disabled) return;
    const next = [...currentIds];
    const swap = idx + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[idx], next[swap]] = [next[swap], next[idx]];
    onAnswer(next);
  };

  return (
    <DndContext sensors={disabled ? [] : sensors} collisionDetection={closestCenter}
      onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <SortableContext items={orderedItems.map(t => t.id)} strategy={verticalListSortingStrategy}>
        <div className="ex-stagger" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {orderedItems.map((item, i) => {
            const canonicalRank = correctOrderIds.indexOf(item.id);
            const canonicalKeyLabel =
              teacherAnswerHints && canonicalRank >= 0 ? canonicalRank + 1 : undefined;
            return (
            <SortableRow key={item.id} item={item} position={i + 1} total={orderedItems.length}
              disabled={disabled} isSentence={label === 'sentence'}
              onUp={() => move(i, -1)} onDown={() => move(i, 1)}
              canonicalKeyLabel={canonicalKeyLabel}
            />
            );
          })}
        </div>
      </SortableContext>
      <DragOverlay dropAnimation={{ duration: 200, easing: 'cubic-bezier(0.18,0.67,0.6,1.22)' }}>
        {activeItem && <OrderRowOverlay item={activeItem} isSentence={label === 'sentence'} />}
      </DragOverlay>
    </DndContext>
  );
}

function SortableRow({ item, position, total, disabled, isSentence, onUp, onDown, canonicalKeyLabel }: {
  item: OrderToken; position: number; total: number;
  disabled: boolean; isSentence: boolean; onUp: () => void; onDown: () => void;
  canonicalKeyLabel?: number;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id, disabled });
  const [hovered, setHovered] = useState(false);

  return (
    <div ref={setNodeRef}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: isSentence ? '13px 14px' : '10px 14px',
        borderRadius: 12,
        border: `2px solid ${isDragging ? 'var(--ex-violet-border)' : hovered ? 'var(--ex-border)' : 'var(--ex-border-soft)'}`,
        background: isDragging ? 'var(--ex-violet-light)' : 'var(--ex-bg)',
        opacity: isDragging ? 0.35 : 1,
        transform: CSS.Transform.toString(transform),
        transition: transition ?? 'transform 0.18s ease, border-color 0.12s ease',
        boxShadow: isDragging ? 'none' : hovered ? 'var(--ex-shadow-sm)' : 'var(--ex-shadow-xs)',
        cursor: disabled ? 'default' : isDragging ? 'grabbing' : 'grab',
      }}
    >
      {!disabled && (
        <div {...listeners} {...attributes} style={{
          color: hovered ? 'var(--ex-ink-light)' : 'var(--ex-ink-ghost)',
          cursor: 'grab', flexShrink: 0, display: 'flex', alignItems: 'center',
          transition: 'color var(--ex-trans-fast)',
        }}>
          <GripVertical size={16} />
        </div>
      )}

      <span style={{
        flexShrink: 0, width: 26, height: 26,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 7,
        background: 'var(--ex-violet-light)', color: 'var(--ex-violet)',
        fontSize: 11, fontWeight: 800,
      }}>
        {position}
      </span>

      {canonicalKeyLabel != null && (
        <span
          title="Canonical position in the answer key"
          style={{
            flexShrink: 0,
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            color: 'var(--ex-violet)',
            background: 'var(--ex-violet-light)',
            border: '1px solid var(--ex-violet-border)',
            borderRadius: 6,
            padding: '2px 7px',
          }}
        >
          Key {canonicalKeyLabel}
        </span>
      )}

      <span style={{
        flex: 1, fontSize: isSentence ? 14 : 13,
        color: 'var(--ex-ink)', lineHeight: 1.5, userSelect: 'none',
      }}>
        {item.text}
      </span>

      {!disabled && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, flexShrink: 0 }}>
          <ArrowBtn disabled={position === 1} onClick={onUp} up />
          <ArrowBtn disabled={position === total} onClick={onDown} up={false} />
        </div>
      )}
    </div>
  );
}

function OrderRowOverlay({ item, isSentence }: { item: OrderToken; isSentence: boolean }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: isSentence ? '13px 14px' : '10px 14px',
      borderRadius: 12,
      border: '2px solid var(--ex-violet-border)',
      background: 'var(--ex-bg)',
      boxShadow: 'var(--ex-shadow-drag)',
      transform: 'rotate(1.5deg) scale(1.02)',
      cursor: 'grabbing',
    }}>
      <GripVertical size={16} color="var(--ex-ink-light)" />
      <span style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 7, background: 'var(--ex-violet-light)', color: 'var(--ex-violet)',
        fontSize: 11, fontWeight: 800 }}>—</span>
      <span style={{ flex: 1, fontSize: isSentence ? 14 : 13, color: 'var(--ex-ink)', userSelect: 'none' }}>
        {item.text}
      </span>
    </div>
  );
}

function ArrowBtn({ disabled, onClick, up }: { disabled: boolean; onClick: () => void; up: boolean }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button type="button" disabled={disabled} onClick={onClick}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 20, height: 20, borderRadius: 4, border: 'none',
        background: hovered && !disabled ? 'var(--ex-bg-hover)' : 'transparent',
        color: disabled ? 'var(--ex-ink-ghost)' : hovered ? 'var(--ex-ink)' : 'var(--ex-ink-xlight)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.3 : 1, transition: 'all var(--ex-trans-fast)',
      }}
    >
      {up ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
    </button>
  );
}

export function OrderingWordsQuestionPlayer({ question, answer, onAnswer, disabled = false, teacherAnswerHints }: QuestionRendererProps) {
  const tokens = question.question_metadata?.tokens ?? [];
  const metaOrder = question.question_metadata?.correct_order as string[] | undefined;
  const correctOrderIds =
    metaOrder && metaOrder.length > 0 ? metaOrder : tokens.map((token) => token.id);
  return <OrderingPlayer items={tokens} answer={answer}
    onAnswer={onAnswer as (a: string[]) => void} disabled={disabled} label="word"
    correctOrderIds={correctOrderIds} teacherAnswerHints={teacherAnswerHints} />;
}

export function OrderingSentencesQuestionPlayer({ question, answer, onAnswer, disabled = false, teacherAnswerHints }: QuestionRendererProps) {
  const sentenceItems = question.question_metadata?.items ?? [];
  const metaOrder = question.question_metadata?.correct_order as string[] | undefined;
  const correctOrderIds =
    metaOrder && metaOrder.length > 0 ? metaOrder : sentenceItems.map((token) => token.id);
  return <OrderingPlayer items={sentenceItems} answer={answer}
    onAnswer={onAnswer as (a: string[]) => void} disabled={disabled} label="sentence"
    correctOrderIds={correctOrderIds} teacherAnswerHints={teacherAnswerHints} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// Dispatcher
// ─────────────────────────────────────────────────────────────────────────────

export default function QuestionRenderer(props: QuestionRendererProps) {
  const type = props.question.type as QuestionType;
  const { questionKey, ...rest } = props;
  return (
    <div key={questionKey} className={questionKey !== undefined ? 'ex-animate-slide-in' : undefined}>
      {(() => {
        switch (type) {
          case 'multiple_choice':    return <MultipleChoiceQuestionPlayer {...rest} />;
          case 'true_false':         return <TrueFalseQuestionPlayer {...rest} />;
          case 'open_answer':        return <OpenAnswerQuestionPlayer {...rest} />;
          case 'cloze_input':        return <ClozeInputQuestionPlayer {...rest} />;
          case 'cloze_drag':         return <ClozeDragQuestionPlayer {...rest} />;
          case 'matching_pairs':     return <MatchingPairsQuestionPlayer {...rest} />;
          case 'ordering_words':     return <OrderingWordsQuestionPlayer {...rest} />;
          case 'ordering_sentences': return <OrderingSentencesQuestionPlayer {...rest} />;
          default:
            if (props.question.options?.length) return <MultipleChoiceQuestionPlayer {...rest} />;
            return <p style={{ fontSize: 13, color: 'var(--ex-ink-xlight)', fontStyle: 'italic' }}>Unsupported: {type}</p>;
        }
      })()}
    </div>
  );
}