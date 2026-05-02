/**
 * QuestionEditorRenderer.tsx — LinguAI v2
 *
 * Visual redesign of the editing surface to match ProgressMe-family aesthetics.
 * Backend payload contracts: UNCHANGED.
 * Draft type interfaces: UNCHANGED.
 * All editor architectures: UNCHANGED.
 *
 * What changed:
 * ─────────────
 * Primitives:
 *   EFieldLabel   — smaller, navy-tinted, spacing tightened
 *   ESection      — marginBottom 28→24, label row revised
 *   EInput        — softer borders, navy focus ring
 *   ETextarea     — taller default rows, generous padding
 *   ENumberInput  — narrower, centered
 *   EToggle       — uses LinguAI primary
 *   EAddButton    — solid tint fill instead of transparent-dashed
 *   EIconButton   — slightly smaller, softer danger state
 *   EPromptField  — bigger textarea (rows=3), char count repositioned
 *
 * MCQ-specific (primary focus):
 *   MCOptionRow   — checkbox to mark correct answer (no letter-badge toggle),
 *                   correct state uses LinguAI tint+green, input is inline
 *                   No points block, no helper text.
 *
 * True/False:
 *   Segmented control — larger, rounder, cleaner active states
 *
 * Open Answer:
 *   ModeTab — rounder pill tabs
 *   KeywordRow — cleaner layout
 *
 * All other types: inherit primitive improvements silently
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  Plus, Trash2, Tag, Code2, GripVertical, X,
  Info, ArrowRight,
  CheckCircle2,
} from 'lucide-react';
import '../exercise/exercise-design-system.css';
import '../flow/DragToGap.css';

// ─────────────────────────────────────────────────────────────────────────────
// Draft types — UNCHANGED
// ─────────────────────────────────────────────────────────────────────────────

export interface OptionDraft    { id: string; text: string; }
export interface GapDraft       { id: string; answers: string; case_sensitive: boolean; score: number; }
export interface MatchItemDraft { id: string; text: string; }
export interface PairDraft      { left_id: string; right_id: string; }
export interface TokenDraft     { id: string; text: string; }
export interface KeywordDraft   { text: string; weight: number; }

export type QuestionDraft =
  | MultipleChoiceDraft | TrueFalseDraft | OpenAnswerDraft
  | ClozeInputDraft | ClozeDragDraft | MatchingPairsDraft
  | OrderingWordsDraft | OrderingSentencesDraft;

export interface MultipleChoiceDraft {
  type: 'multiple_choice'; prompt: string;
  options: OptionDraft[]; correct_option_ids: string[]; score: number;
}
export interface TrueFalseDraft {
  type: 'true_false'; prompt: string;
  correct_option_id: 'true' | 'false' | ''; score: number;
}
export interface OpenAnswerDraft {
  type: 'open_answer'; prompt: string;
  expected_mode: 'keywords' | 'regex';
  keywords: KeywordDraft[]; pattern: string;
  case_insensitive: boolean; score: number;
}
export interface ClozeInputDraft {
  type: 'cloze_input'; prompt: string; gaps: GapDraft[]; score: number;
}
export interface ClozeDragDraft {
  type: 'cloze_drag'; prompt: string; gaps: GapDraft[];
  word_bank: string; shuffle_word_bank: boolean; score: number;
}
export interface MatchingPairsDraft {
  type: 'matching_pairs'; prompt: string;
  left_items: MatchItemDraft[]; right_items: MatchItemDraft[];
  pairs: PairDraft[]; shuffle_right: boolean; score: number;
}
export interface OrderingWordsDraft {
  type: 'ordering_words'; prompt: string;
  tokens: TokenDraft[]; correct_order: string[]; score: number;
  metadata?: {
    sentence_groups?: string[][];
    [key: string]: unknown;
  };
}
export interface OrderingSentencesDraft {
  type: 'ordering_sentences'; prompt: string;
  items: TokenDraft[]; correct_order: string[]; score: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers — UNCHANGED
// ─────────────────────────────────────────────────────────────────────────────

export function uid(): string { return Math.random().toString(36).slice(2, 9); }

export function emptyDraftFor(type: QuestionDraft['type']): QuestionDraft {
  switch (type) {
    case 'multiple_choice': return { type, prompt: '', score: 1,
      options: [{ id: uid(), text: '' }, { id: uid(), text: '' }], correct_option_ids: [] };
    case 'true_false': return { type, prompt: '', score: 1, correct_option_id: '' };
    case 'open_answer': return { type, prompt: '', score: 1,
      expected_mode: 'keywords', keywords: [{ text: '', weight: 1 }],
      pattern: '', case_insensitive: true };
    case 'cloze_input': return { type, prompt: '', score: 1,
      gaps: [{ id: 'gap_1', answers: '', case_sensitive: false, score: 1 }] };
    case 'cloze_drag': return { type, prompt: '', score: 1,
      gaps: [{ id: 'gap_1', answers: '', case_sensitive: false, score: 1 }],
      word_bank: '', shuffle_word_bank: true };
    case 'matching_pairs': return { type, prompt: '', score: 1,
      left_items: [{ id: uid(), text: '' }], right_items: [{ id: uid(), text: '' }],
      pairs: [], shuffle_right: true };
    case 'ordering_words': return { type, prompt: '', score: 1,
      tokens: [{ id: uid(), text: '' }, { id: uid(), text: '' }], correct_order: [] };
    case 'ordering_sentences': return { type, prompt: '', score: 1,
      items: [{ id: uid(), text: '' }, { id: uid(), text: '' }], correct_order: [] };
  }
}

function makeEmptyToken(): TokenDraft {
  return { id: uid(), text: '' };
}

function makeDefaultSentenceGroup(): TokenDraft[] {
  return [makeEmptyToken(), makeEmptyToken()];
}

function getOrderingWordsSentenceGroups(draft: OrderingWordsDraft): TokenDraft[][] {
  const tokenMap = new Map(draft.tokens.map((token) => [token.id, token]));
  const rawGroups = Array.isArray(draft.metadata?.sentence_groups)
    ? draft.metadata?.sentence_groups
    : [];

  const groups = rawGroups
    .map((group) =>
      group
        .map((tokenId) => tokenMap.get(tokenId))
        .filter(Boolean)
        .map((token) => ({ ...(token as TokenDraft) })),
    )
    .filter((group) => group.length > 0);

  const orderedIds =
    draft.correct_order.length > 0
      ? draft.correct_order
      : draft.tokens.map((token) => token.id);

  const groupedIds = new Set(groups.flat().map((token) => token.id));
  const leftovers = orderedIds
    .map((tokenId) => tokenMap.get(tokenId))
    .filter(
      (token): token is TokenDraft =>
        Boolean(token) && !groupedIds.has((token as TokenDraft).id),
    )
    .map((token) => ({ ...token }));

  if (groups.length === 0) {
    const fallback = orderedIds
      .map((tokenId) => tokenMap.get(tokenId))
      .filter(Boolean)
      .map((token) => ({ ...(token as TokenDraft) }));

    if (fallback.length > 0) return [fallback];
    return [makeDefaultSentenceGroup()];
  }

  if (leftovers.length > 0) {
    groups[groups.length - 1].push(...leftovers);
  }

  return groups;
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

function buildOrderingWordsDraft(
  previousDraft: OrderingWordsDraft,
  nextGroups: TokenDraft[][],
): OrderingWordsDraft {
  const safeGroups =
    nextGroups.length > 0
      ? nextGroups.map((group) => group.map((token) => ({ ...token })))
      : [makeDefaultSentenceGroup()];

  const orderedTokens = safeGroups.flat();
  const correctOrder = orderedTokens.map((token) => token.id);
  const tokenById = new Map(orderedTokens.map((token) => [token.id, token]));
  const tokens = scrambleTokenIds(correctOrder)
    .map((tokenId) => tokenById.get(tokenId))
    .filter(Boolean)
    .map((token) => ({ ...(token as TokenDraft) }));

  return {
    ...previousDraft,
    tokens,
    correct_order: correctOrder,
    metadata: {
      ...(previousDraft.metadata ?? {}),
      sentence_groups: safeGroups.map((group) => group.map((token) => token.id)),
    },
  };
}

function getOrderingSentencesItems(draft: OrderingSentencesDraft): TokenDraft[] {
  const itemById = new Map(draft.items.map((item) => [item.id, item]));
  const orderedIds =
    draft.correct_order.length > 0
      ? draft.correct_order
      : draft.items.map((item) => item.id);

  const orderedItems = orderedIds
    .map((itemId) => itemById.get(itemId))
    .filter(Boolean)
    .map((item) => ({ ...(item as TokenDraft) }));

  if (orderedItems.length > 0) return orderedItems;

  return [
    { id: uid(), text: '' },
    { id: uid(), text: '' },
  ];
}

function buildOrderingSentencesDraft(
  previousDraft: OrderingSentencesDraft,
  orderedItems: TokenDraft[],
): OrderingSentencesDraft {
  const safeItems =
    orderedItems.length > 0
      ? orderedItems.map((item) => ({ ...item }))
      : [
          { id: uid(), text: '' },
          { id: uid(), text: '' },
        ];
  const correctOrder = safeItems.map((item) => item.id);
  const itemById = new Map(safeItems.map((item) => [item.id, item]));

  return {
    ...previousDraft,
    items: scrambleTokenIds(correctOrder)
      .map((itemId) => itemById.get(itemId))
      .filter(Boolean)
      .map((item) => ({ ...(item as TokenDraft) })),
    correct_order: correctOrder,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Design tokens (local shortcuts for readability)
// ─────────────────────────────────────────────────────────────────────────────

const T = {
  primary:       '#06b6d4',
  primaryDark:   '#0891b2',
  tint:          '#ecfeff',
  tintHover:     '#cffafe',
  tintBorder:    '#a5f3fc',
  ink:           '#1a1d3a',
  ink2:          '#3e4272',
  ink3:          '#7578a4',
  ink4:          '#aeb1cc',
  ink5:          '#d4d6ea',
  border:        '#e8eaf4',
  borderSoft:    '#f1f2fa',
  surface:       '#ffffff',
  surfaceSoft:   '#fafbff',
  bg:            '#f7f7fa',
  bgHover:       '#f3f4fe',
  green:         '#06b6d4',
  greenBg:       '#ecfeff',
  greenBorder:   '#a5f3fc',
  amber:         '#df8e0a',
  amberBg:       '#fff8eb',
  amberBorder:   '#fcd27a',
  red:           '#e03c3c',
  redBg:         '#fff1f1',
  redBorder:     '#f5aaaa',
  teal:          '#0d9488',
  tealBg:        '#f0fdfa',
  tealBorder:    '#5eead4',
  glow:          'rgba(6,182,212,0.13)',
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Shared primitive components — redesigned
// ─────────────────────────────────────────────────────────────────────────────

/* ── EInput ─────────────────────────────────────────────────────────────────── */
function EInput({
  value, onChange, placeholder, style, mono,
}: {
  value: string; onChange: (v: string) => void;
  placeholder?: string; style?: React.CSSProperties; mono?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      type="text" value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        width: '100%', boxSizing: 'border-box',
        padding: '9px 12px',
        borderRadius: 10,
        border: `1.5px solid ${focused ? T.primary : T.border}`,
        background: T.surface,
        fontSize: 13,
        color: T.ink,
        lineHeight: 1.5,
        outline: 'none',
        transition: 'border-color 110ms ease, box-shadow 110ms ease',
        boxShadow: focused ? `0 0 0 3px ${T.glow}` : 'none',
        fontFamily: mono ? 'ui-monospace, monospace' : 'inherit',
        letterSpacing: '-0.01em',
        ...style,
      }}
    />
  );
}

/* ── ETextarea ──────────────────────────────────────────────────────────────── */
function ETextarea({
  value, onChange, placeholder, rows = 3,
}: {
  value: string; onChange: (v: string) => void; placeholder?: string; rows?: number;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <textarea
      value={value} rows={rows}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        width: '100%', boxSizing: 'border-box',
        padding: '12px 14px',
        borderRadius: 12,
        border: `1.5px solid ${focused ? T.primary : T.border}`,
        background: T.surface,
        fontSize: 14,
        color: T.ink,
        lineHeight: 1.6,
        outline: 'none',
        resize: 'vertical',
        transition: 'border-color 110ms ease, box-shadow 110ms ease',
        boxShadow: focused ? `0 0 0 3px ${T.glow}` : 'none',
        fontFamily: 'inherit',
        letterSpacing: '-0.01em',
      }}
    />
  );
}

/* ── ENumberInput ───────────────────────────────────────────────────────────── */
function ENumberInput({
  value, onChange, min, max, step, style,
}: {
  value: number; onChange: (v: number) => void;
  min?: number; max?: number; step?: number; style?: React.CSSProperties;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      type="number" value={value} min={min} max={max} step={step}
      onChange={e => onChange(parseFloat(e.target.value) || 0)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        width: 64, padding: '7px 10px',
        borderRadius: 8,
        border: `1.5px solid ${focused ? T.primary : T.border}`,
        background: T.surface,
        fontSize: 13, color: T.ink,
        outline: 'none', textAlign: 'center',
        transition: 'border-color 110ms ease, box-shadow 110ms ease',
        boxShadow: focused ? `0 0 0 3px ${T.glow}` : 'none',
        fontFamily: 'inherit',
        ...style,
      }}
    />
  );
}

/* ── EToggle ────────────────────────────────────────────────────────────────── */
function EToggle({
  checked, onChange, label,
}: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label style={{
      display: 'inline-flex', alignItems: 'center', gap: 9,
      cursor: 'pointer', userSelect: 'none',
    }}>
      <span style={{
        position: 'relative', display: 'inline-block',
        width: 34, height: 19, borderRadius: 10,
        background: checked ? T.primary : T.border,
        transition: 'background 180ms ease', flexShrink: 0,
        boxShadow: checked ? `0 2px 8px ${T.glow}` : 'none',
      }}>
        <span style={{
          position: 'absolute', top: 2.5,
          left: checked ? 17 : 2.5,
          width: 14, height: 14, borderRadius: '50%',
          background: '#fff',
          boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
          transition: 'left 180ms ease',
        }} />
        <input
          type="checkbox" checked={checked}
          onChange={e => onChange(e.target.checked)}
          style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
        />
      </span>
      <span style={{ fontSize: 13, color: T.ink3, fontWeight: 500, letterSpacing: '-0.01em' }}>
        {label}
      </span>
    </label>
  );
}

/* ── EFieldLabel ────────────────────────────────────────────────────────────── */
function EFieldLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 9 }}>
      <span style={{
        fontSize: 11, fontWeight: 700,
        letterSpacing: '0.06em', textTransform: 'uppercase',
        color: T.ink4,
      }}>
        {children}
      </span>
      {hint && (
        <span style={{
          fontSize: 11, color: T.ink5,
          textTransform: 'none', letterSpacing: 0, fontWeight: 400,
        }}>
          {hint}
        </span>
      )}
    </div>
  );
}

/* ── ESection ───────────────────────────────────────────────────────────────── */
function ESection({
  label, hint, children,
}: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <EFieldLabel hint={hint}>{label}</EFieldLabel>
      {children}
    </div>
  );
}

/* ── EAddButton ─────────────────────────────────────────────────────────────── */
function EAddButton({ onClick, label }: { onClick: () => void; label: string }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button" onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        marginTop: 10, padding: '7px 14px',
        borderRadius: 9,
        border: `1.5px solid ${hovered ? T.primary : T.tintBorder}`,
        background: hovered ? T.tintHover : T.tint,
        color: hovered ? T.primaryDark : T.primary,
        fontSize: 12, fontWeight: 700,
        cursor: 'pointer',
        transition: 'all 110ms ease',
        fontFamily: 'inherit',
        letterSpacing: '-0.01em',
      }}
    >
      <Plus size={12} strokeWidth={2.5} />
      {label}
    </button>
  );
}

/* ── EIconButton ────────────────────────────────────────────────────────────── */
function EIconButton({
  onClick, title, danger, children,
}: { onClick: () => void; title?: string; danger?: boolean; children: React.ReactNode }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button" onClick={onClick} title={title}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 28, height: 28, borderRadius: 7,
        border: 'none', flexShrink: 0,
        background: hovered
          ? danger ? T.redBg : T.bgHover
          : 'transparent',
        color: hovered
          ? danger ? T.red : T.ink3
          : T.ink5,
        cursor: 'pointer',
        transition: 'all 110ms ease',
      }}
    >
      {children}
    </button>
  );
}

/* ── EPromptField ───────────────────────────────────────────────────────────── */
function EPromptField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <ETextarea
        value={value}
        onChange={onChange}
        placeholder="Type the question here…"
        rows={2}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. MultipleChoiceQuestionEditor  — primary visual focus
// ─────────────────────────────────────────────────────────────────────────────

export function MultipleChoiceQuestionEditor({
  draft, onChange,
}: { draft: MultipleChoiceDraft; onChange: (d: MultipleChoiceDraft) => void }) {
  const set = useCallback(
    (patch: Partial<MultipleChoiceDraft>) => onChange({ ...draft, ...patch }),
    [draft, onChange],
  );

  const updateOption = (id: string, text: string) =>
    set({ options: draft.options.map(o => o.id === id ? { ...o, text } : o) });
  const removeOption = (id: string) => set({
    options: draft.options.filter(o => o.id !== id),
    correct_option_ids: draft.correct_option_ids.filter(c => c !== id),
  });
  const toggleCorrect = (id: string) => {
    const has = draft.correct_option_ids.includes(id);
    set({ correct_option_ids: has
      ? draft.correct_option_ids.filter(c => c !== id)
      : [...draft.correct_option_ids, id] });
  };

  return (
    <div>
      <EPromptField value={draft.prompt} onChange={v => set({ prompt: v })} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {draft.options.map((opt) => {
          const isCorrect = draft.correct_option_ids.includes(opt.id);
          return (
            <MCOptionRow
              key={opt.id}
              isCorrect={isCorrect}
              value={opt.text}
              onToggle={() => toggleCorrect(opt.id)}
              onChange={text => updateOption(opt.id, text)}
              onRemove={draft.options.length > 2 ? () => removeOption(opt.id) : undefined}
            />
          );
        })}
      </div>

      <div style={{ marginTop: 6 }}>
        <button
          type="button"
          className="dtg-variant-add"
          onClick={() => set({ options: [...draft.options, { id: uid(), text: '' }] })}
        >
          <Plus size={13} />
          Добавить вариант
        </button>
      </div>
    </div>
  );
}

function MCOptionRow({
  isCorrect, value, onToggle, onChange, onRemove,
}: {
  isCorrect: boolean;
  value: string; onToggle: () => void;
  onChange: (v: string) => void; onRemove?: () => void;
}) {
  const [rowHovered, setRowHovered] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const active = rowHovered || inputFocused;

  return (
    <div
      className="dtg-variant-row"
      onMouseEnter={() => setRowHovered(true)}
      onMouseLeave={() => setRowHovered(false)}
      style={{
        borderRadius: 8,
        padding: '2px 0',
        background: active ? T.surfaceSoft : 'transparent',
      }}
    >
      <label
        className="dtg-variant-check"
        title={isCorrect ? 'Unmark as correct' : 'Mark as correct'}
      >
        <input
          type="checkbox"
          checked={isCorrect}
          onChange={onToggle}
        />
      </label>

      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Вариант"
        onFocus={() => setInputFocused(true)}
        onBlur={() => setInputFocused(false)}
        className="dtg-variant-input"
      />

      {onRemove && (
        <button
          type="button"
          className="dtg-variant-remove"
          onClick={onRemove}
          aria-label="Remove option"
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
          <Trash2 size={13} />
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. TrueFalseQuestionEditor  — segmented pill
// ─────────────────────────────────────────────────────────────────────────────

export function TrueFalseQuestionEditor({
  draft, onChange,
}: { draft: TrueFalseDraft; onChange: (d: TrueFalseDraft) => void }) {
  const set = useCallback(
    (patch: Partial<TrueFalseDraft>) => onChange({ ...draft, ...patch }),
    [draft, onChange],
  );

  const OPTIONS = [
    { val: 'true'  as const, label: 'True',  icon: '✓',
      color: T.green,  bg: T.greenBg,  border: T.greenBorder },
    { val: 'false' as const, label: 'False', icon: '✗',
      color: T.red,    bg: T.redBg,    border: T.redBorder },
  ];

  return (
    <div>
      <EPromptField value={draft.prompt} onChange={v => set({ prompt: v })} />

      <ESection label="Correct answer">
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10,
        }}>
          {OPTIONS.map(opt => {
            const active = draft.correct_option_id === opt.val;
            return (
              <button
                key={opt.val} type="button"
                onClick={() => set({ correct_option_id: opt.val })}
                style={{
                  display: 'flex', alignItems: 'center',
                  justifyContent: 'center', gap: 10,
                  padding: '16px 0',
                  borderRadius: 14,
                  border: `2px solid ${active ? opt.border : T.border}`,
                  background: active ? opt.bg : T.surface,
                  color: active ? opt.color : T.ink4,
                  fontSize: 16, fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 180ms ease',
                  fontFamily: 'inherit',
                  letterSpacing: '-0.02em',
                  boxShadow: active ? `0 0 0 3px ${active && opt.val === 'true' ? 'rgba(23,168,101,0.1)' : 'rgba(224,60,60,0.08)'}` : 'none',
                }}
              >
                <span style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 28, height: 28, borderRadius: '50%',
                  background: active ? opt.color : T.border,
                  color: active ? '#fff' : T.ink5,
                  fontSize: 14, fontWeight: 800,
                  transition: 'all 180ms ease',
                  flexShrink: 0,
                }}>
                  {opt.icon}
                </span>
                {opt.label}
              </button>
            );
          })}
        </div>

        {draft.correct_option_id === '' && (
          <InlineHint icon={<Info size={12}/>} color={T.amber}>
            Select the correct answer above
          </InlineHint>
        )}
      </ESection>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. OpenAnswerQuestionEditor
// ─────────────────────────────────────────────────────────────────────────────

export function OpenAnswerQuestionEditor({
  draft, onChange,
}: { draft: OpenAnswerDraft; onChange: (d: OpenAnswerDraft) => void }) {
  const set = useCallback(
    (patch: Partial<OpenAnswerDraft>) => onChange({ ...draft, ...patch }),
    [draft, onChange],
  );
  const updateKw = (i: number, patch: Partial<KeywordDraft>) =>
    set({ keywords: draft.keywords.map((k, j) => j === i ? { ...k, ...patch } : k) });

  return (
    <div>
      <EPromptField value={draft.prompt} onChange={v => set({ prompt: v })} />

      {/* Mode tabs */}
      <ESection label="Grading mode">
        <div style={{ display: 'flex', gap: 6 }}>
          {([
            { mode: 'keywords' as const, icon: <Tag size={12}/>,   label: 'Keywords' },
            { mode: 'regex'    as const, icon: <Code2 size={12}/>, label: 'Regex' },
          ]).map(opt => {
            const active = draft.expected_mode === opt.mode;
            return (
              <ModeTab key={opt.mode} active={active} icon={opt.icon} label={opt.label}
                onClick={() => set({ expected_mode: opt.mode })} />
            );
          })}
        </div>
      </ESection>

      {/* Keywords */}
      {draft.expected_mode === 'keywords' && (
        <ESection label="Keywords" hint="· answer must contain these">
          <div className="ex-stagger" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {draft.keywords.map((kw, i) => (
              <KeywordRow
                key={i} kw={kw}
                onChange={patch => updateKw(i, patch)}
                onRemove={draft.keywords.length > 1
                  ? () => set({ keywords: draft.keywords.filter((_, j) => j !== i) })
                  : undefined}
              />
            ))}
          </div>
          <EAddButton
            onClick={() => set({ keywords: [...draft.keywords, { text: '', weight: 1 }] })}
            label="Add keyword"
          />
        </ESection>
      )}

      {/* Regex */}
      {draft.expected_mode === 'regex' && (
        <ESection label="Regex pattern">
          <div style={{
            display: 'flex', alignItems: 'center',
            borderRadius: 10,
            border: `1.5px solid ${T.border}`,
            overflow: 'hidden', background: T.surface,
          }}>
            <Delim>/</Delim>
            <input
              type="text" value={draft.pattern}
              onChange={e => set({ pattern: e.target.value })}
              placeholder={`\\bword\\b`}
              style={{
                flex: 1, padding: '9px 12px',
                border: 'none', outline: 'none',
                fontSize: 13, fontFamily: 'ui-monospace, monospace',
                color: T.ink, background: 'transparent',
                letterSpacing: '0.02em',
              }}
            />
            <Delim>/</Delim>
          </div>
        </ESection>
      )}

      <div style={{ marginBottom: 20 }}>
        <EToggle checked={draft.case_insensitive} onChange={v => set({ case_insensitive: v })}
          label="Case insensitive" />
      </div>
    </div>
  );
}

function ModeTab({ active, icon, label, onClick }: {
  active: boolean; icon: React.ReactNode; label: string; onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button" onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '7px 16px', borderRadius: 99,
        border: `1.5px solid ${active ? T.tintBorder : hovered ? T.border : T.borderSoft}`,
        background: active ? T.tint : hovered ? T.surfaceSoft : 'transparent',
        color: active ? T.primary : T.ink3,
        fontSize: 12, fontWeight: 700,
        cursor: 'pointer',
        transition: 'all 110ms ease', fontFamily: 'inherit',
        letterSpacing: '-0.01em',
      }}
    >
      {icon}{label}
    </button>
  );
}

function KeywordRow({ kw, onChange, onRemove }: {
  kw: KeywordDraft;
  onChange: (p: Partial<KeywordDraft>) => void;
  onRemove?: () => void;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '9px 12px',
      borderRadius: 10,
      border: `1.5px solid ${T.border}`,
      background: T.surfaceSoft,
    }}>
      <span style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 24, height: 24, borderRadius: 7,
        background: T.tint, color: T.primary, flexShrink: 0,
      }}>
        <Tag size={11} strokeWidth={2.2} />
      </span>
      <EInput value={kw.text} onChange={v => onChange({ text: v })} placeholder="keyword"
        style={{ background: 'transparent', border: 'none', boxShadow: 'none', padding: '4px 6px', flex: 1 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <span style={{ fontSize: 11, color: T.ink4, fontWeight: 600 }}>weight</span>
        <ENumberInput value={kw.weight} onChange={v => onChange({ weight: v })} min={0} max={1} step={0.1}
          style={{ width: 58 }} />
      </div>
      {onRemove && <EIconButton onClick={onRemove} danger><Trash2 size={13}/></EIconButton>}
    </div>
  );
}

function Delim({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      padding: '9px 12px',
      background: T.surfaceSoft,
      color: T.ink4,
      fontSize: 14, fontFamily: 'monospace',
      borderRight: `1px solid ${T.border}`, flexShrink: 0,
      letterSpacing: 0,
    }}>
      {children}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared GapCard (Cloze Input + Cloze Drag) — improved
// ─────────────────────────────────────────────────────────────────────────────

function GapCard({
  gap, index, canRemove, onUpdate, onRemove,
}: {
  gap: GapDraft; index: number; canRemove: boolean;
  onUpdate: (p: Partial<GapDraft>) => void; onRemove: () => void;
}) {
  const hasAnswers = gap.answers.trim().length > 0;
  const answerPills = hasAnswers
    ? gap.answers.split(',').map(a => a.trim()).filter(Boolean)
    : [];

  return (
    <div style={{
      borderRadius: 12,
      border: `1.5px solid ${hasAnswers ? T.border : T.amberBorder}`,
      background: T.surface,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '9px 14px',
        background: T.surfaceSoft,
        borderBottom: `1px solid ${T.borderSoft}`,
      }}>
        <span style={{
          flexShrink: 0, width: 22, height: 22,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: 6,
          background: hasAnswers ? T.tint : T.amberBg,
          color: hasAnswers ? T.primary : T.amber,
          fontSize: 10, fontWeight: 800,
        }}>
          {index + 1}
        </span>
        <span style={{ fontSize: 11, fontWeight: 700, color: T.ink4, letterSpacing: '0.04em' }}>
          Gap {index + 1}
        </span>
        <code style={{
          fontSize: 10, color: T.ink5,
          background: T.bg, padding: '1px 6px',
          borderRadius: 4, fontFamily: 'monospace',
          border: `1px solid ${T.borderSoft}`,
        }}>
          {gap.id}
        </code>
        <div style={{ flex: 1 }} />
        {canRemove && (
          <EIconButton onClick={onRemove} title="Remove gap" danger>
            <Trash2 size={13} />
          </EIconButton>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: '13px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>
          <EFieldLabel hint="· comma-separated">Accepted answers</EFieldLabel>
          <EInput
            value={gap.answers}
            onChange={v => onUpdate({ answers: v })}
            placeholder="answer1, answer2, variant3"
          />
          {answerPills.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 7 }}>
              {answerPills.map((a, i) => (
                <span key={i} style={{
                  padding: '3px 9px', borderRadius: 99,
                  background: T.greenBg,
                  border: `1px solid ${T.greenBorder}`,
                  fontSize: 11, fontWeight: 600, color: T.green,
                }}>
                  {a}
                </span>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <EToggle checked={gap.case_sensitive} onChange={v => onUpdate({ case_sensitive: v })} label="Case sensitive" />
        </div>
      </div>
    </div>
  );
}

function GapList({ gaps, onChange }: { gaps: GapDraft[]; onChange: (g: GapDraft[]) => void }) {
  const update = (id: string, patch: Partial<GapDraft>) =>
    onChange(gaps.map(g => g.id === id ? { ...g, ...patch } : g));
  const remove = (id: string) => onChange(gaps.filter(g => g.id !== id));
  const add = () => {
    const newId = `gap_${gaps.length + 1}`;
    onChange([...gaps, { id: newId, answers: '', case_sensitive: false, score: 1 }]);
  };
  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {gaps.map((g, i) => (
          <GapCard key={g.id} gap={g} index={i}
            canRemove={gaps.length > 1}
            onUpdate={p => update(g.id, p)}
            onRemove={() => remove(g.id)}
          />
        ))}
      </div>
      <EAddButton onClick={add} label="Add gap" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. ClozeInputQuestionEditor
// ─────────────────────────────────────────────────────────────────────────────

export function ClozeInputQuestionEditor({
  draft, onChange,
}: { draft: ClozeInputDraft; onChange: (d: ClozeInputDraft) => void }) {
  const set = useCallback(
    (patch: Partial<ClozeInputDraft>) => onChange({ ...draft, ...patch }),
    [draft, onChange],
  );
  return (
    <div>
      <EPromptField value={draft.prompt} onChange={v => set({ prompt: v })} />

      {/* Usage hint */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 10,
        padding: '11px 14px', marginBottom: 20,
        borderRadius: 10,
        background: T.tint,
        border: `1px solid ${T.tintBorder}`,
        fontSize: 12, color: T.primaryDark,
        lineHeight: 1.55,
      }}>
        <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          In the prompt, use{' '}
          <code style={{
            fontFamily: 'monospace',
            background: T.tintBorder,
            color: T.primaryDark,
            padding: '1px 5px', borderRadius: 4,
          }}>
            [gap_1]
          </code>{' '}
          placeholders to indicate each blank.
        </span>
      </div>

      <ESection label="Gaps">
        <GapList gaps={draft.gaps} onChange={gaps => set({ gaps })} />
      </ESection>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. ClozeDragQuestionEditor
// ─────────────────────────────────────────────────────────────────────────────

export function ClozeDragQuestionEditor({
  draft, onChange,
}: { draft: ClozeDragDraft; onChange: (d: ClozeDragDraft) => void }) {
  const set = useCallback(
    (patch: Partial<ClozeDragDraft>) => onChange({ ...draft, ...patch }),
    [draft, onChange],
  );

  const wordPills = draft.word_bank.split(',').map(w => w.trim()).filter(Boolean);

  return (
    <div>
      <EPromptField value={draft.prompt} onChange={v => set({ prompt: v })} />

      <ESection label="Word bank" hint="· comma-separated">
        <EInput value={draft.word_bank} onChange={v => set({ word_bank: v })} placeholder="apple, banana, cherry" />
        {wordPills.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
            {wordPills.map((w, i) => (
              <span key={i} style={{
                padding: '4px 12px', borderRadius: 99,
                background: T.tealBg,
                border: `1px solid ${T.tealBorder}`,
                fontSize: 12, fontWeight: 700, color: T.teal,
              }}>
                {w}
              </span>
            ))}
          </div>
        )}
        <div style={{ marginTop: 12 }}>
          <EToggle checked={draft.shuffle_word_bank} onChange={v => set({ shuffle_word_bank: v })}
            label="Shuffle word bank for students" />
        </div>
      </ESection>

      <ESection label="Gaps">
        <GapList gaps={draft.gaps} onChange={gaps => set({ gaps })} />
      </ESection>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. MatchingPairsQuestionEditor
// ─────────────────────────────────────────────────────────────────────────────

export function MatchingPairsQuestionEditor({
  draft, onChange,
}: { draft: MatchingPairsDraft; onChange: (d: MatchingPairsDraft) => void }) {
  const set = useCallback(
    (patch: Partial<MatchingPairsDraft>) => onChange({ ...draft, ...patch }),
    [draft, onChange],
  );

  const updateItem = (side: 'left_items' | 'right_items', id: string, text: string) =>
    set({ [side]: draft[side].map(it => it.id === id ? { ...it, text } : it) });
  const removeItem = (side: 'left_items' | 'right_items', id: string) => set({
    [side]: draft[side].filter(it => it.id !== id),
    pairs: draft.pairs.filter(p => side === 'left_items' ? p.left_id !== id : p.right_id !== id),
  });
  const addItem = (side: 'left_items' | 'right_items') =>
    set({ [side]: [...draft[side], { id: uid(), text: '' }] });
  const updatePair = (leftId: string, rightId: string) => {
    const filtered = draft.pairs.filter(p => p.left_id !== leftId && p.right_id !== rightId);
    if (rightId) set({ pairs: [...filtered, { left_id: leftId, right_id: rightId }] });
    else set({ pairs: filtered });
  };
  const getPairRight = (leftId: string) => draft.pairs.find(p => p.left_id === leftId)?.right_id ?? '';

  const LETTERS = 'ABCDEFGHIJ';

  return (
    <div>
      <EPromptField value={draft.prompt} onChange={v => set({ prompt: v })} />

      <ESection label="Items">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <EFieldLabel>Left (prompts)</EFieldLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {draft.left_items.map((item, i) => (
                <MatchItemRow
                  key={item.id} value={item.text} letter={LETTERS[i] ?? String(i + 1)}
                  badgeColor={T.primary} badgeBg={T.tint}
                  onChange={v => updateItem('left_items', item.id, v)}
                  onRemove={draft.left_items.length > 1 ? () => removeItem('left_items', item.id) : undefined}
                />
              ))}
              <EAddButton onClick={() => addItem('left_items')} label="Add left" />
            </div>
          </div>
          <div>
            <EFieldLabel>Right (answers)</EFieldLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {draft.right_items.map((item, i) => (
                <MatchItemRow
                  key={item.id} value={item.text} letter={LETTERS[i] ?? String(i + 1)}
                  badgeColor={T.teal} badgeBg={T.tealBg}
                  onChange={v => updateItem('right_items', item.id, v)}
                  onRemove={draft.right_items.length > 1 ? () => removeItem('right_items', item.id) : undefined}
                />
              ))}
              <EAddButton onClick={() => addItem('right_items')} label="Add right" />
            </div>
          </div>
        </div>
      </ESection>

      {draft.left_items.length > 0 && draft.right_items.length > 0 && (
        <ESection label="Correct pairs" hint="· connect each left to its right">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {draft.left_items.map((left, i) => {
              const paired = getPairRight(left.id);
              return (
                <PairConnectorRow
                  key={left.id}
                  letter={LETTERS[i] ?? String(i + 1)}
                  leftText={left.text}
                  pairedRightId={paired}
                  rightItems={draft.right_items}
                  onChange={rightId => updatePair(left.id, rightId)}
                />
              );
            })}
          </div>
          {draft.pairs.length === draft.left_items.length && (
            <InlineHint icon={<CheckCircle2 size={12}/>} color={T.green}>
              All pairs connected
            </InlineHint>
          )}
        </ESection>
      )}

      <div style={{ marginBottom: 20 }}>
        <EToggle checked={draft.shuffle_right} onChange={v => set({ shuffle_right: v })}
          label="Shuffle right items for students" />
      </div>
    </div>
  );
}

function MatchItemRow({ value, letter, badgeColor, badgeBg, onChange, onRemove }: {
  value: string; letter: string; badgeColor: string; badgeBg: string;
  onChange: (v: string) => void; onRemove?: () => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
      <span style={{
        flexShrink: 0, width: 26, height: 26,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 8, background: badgeBg, color: badgeColor,
        fontSize: 11, fontWeight: 800,
        border: `1px solid ${badgeColor}22`,
      }}>
        {letter}
      </span>
      <EInput value={value} onChange={onChange} placeholder={`Item ${letter}`} />
      {onRemove && <EIconButton onClick={onRemove} danger><Trash2 size={13}/></EIconButton>}
    </div>
  );
}

function PairConnectorRow({ letter, leftText, pairedRightId, rightItems, onChange }: {
  letter: string; leftText: string; pairedRightId: string;
  rightItems: MatchItemDraft[]; onChange: (rightId: string) => void;
}) {
  const paired = !!pairedRightId;
  const [focused, setFocused] = useState(false);
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 13px',
      borderRadius: 11,
      border: `1.5px solid ${paired ? T.greenBorder : T.border}`,
      background: paired ? T.greenBg : T.surfaceSoft,
      transition: 'border-color 110ms ease, background 110ms ease',
    }}>
      <span style={{
        flexShrink: 0, width: 24, height: 24,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 7, background: T.tint, color: T.primary,
        fontSize: 10, fontWeight: 800,
      }}>
        {letter}
      </span>
      <span style={{
        flex: 1, fontSize: 13,
        color: leftText ? T.ink2 : T.ink5,
        fontStyle: leftText ? 'normal' : 'italic',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        letterSpacing: '-0.01em',
      }}>
        {leftText || 'empty'}
      </span>
      <ArrowRight size={13} color={T.ink5} style={{ flexShrink: 0 }} />
      <select
        value={pairedRightId}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          padding: '6px 10px', borderRadius: 9,
          border: `1.5px solid ${focused ? T.primary : paired ? T.greenBorder : T.border}`,
          background: paired ? T.greenBg : T.surface,
          color: paired ? T.green : T.ink3,
          fontSize: 13, fontWeight: paired ? 600 : 400,
          outline: 'none', cursor: 'pointer',
          fontFamily: 'inherit', minWidth: 140,
          boxShadow: focused ? `0 0 0 3px ${T.glow}` : 'none',
          transition: 'all 110ms ease',
        }}
      >
        <option value="">— select match —</option>
        {rightItems.map(r => (
          <option key={r.id} value={r.id}>{r.text || `(${r.id})`}</option>
        ))}
      </select>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 7 & 8. Ordering editors
// ─────────────────────────────────────────────────────────────────────────────

function BuildSentenceQuestionEditor({
  draft,
  onChange,
}: {
  draft: OrderingWordsDraft;
  onChange: (d: OrderingWordsDraft) => void;
}) {
  const groups = useMemo(() => getOrderingWordsSentenceGroups(draft), [draft]);
  const [draggingSentenceIndex, setDraggingSentenceIndex] = useState<number | null>(null);
  const [draggingWord, setDraggingWord] = useState<{
    sentenceIndex: number;
    tokenId: string;
  } | null>(null);

  const commitGroups = useCallback(
    (nextGroups: TokenDraft[][]) => {
      onChange(buildOrderingWordsDraft(draft, nextGroups));
    },
    [draft, onChange],
  );

  const updateWord = (sentenceIndex: number, tokenId: string, text: string) => {
    commitGroups(
      groups.map((group, currentSentenceIndex) =>
        currentSentenceIndex !== sentenceIndex
          ? group
          : group.map((token) =>
              token.id === tokenId ? { ...token, text } : token,
            ),
      ),
    );
  };

  const addWord = (sentenceIndex: number) => {
    commitGroups(
      groups.map((group, currentSentenceIndex) =>
        currentSentenceIndex !== sentenceIndex
          ? group
          : [...group, makeEmptyToken()],
      ),
    );
  };

  const removeWord = (sentenceIndex: number, tokenId: string) => {
    commitGroups(
      groups.map((group, currentSentenceIndex) =>
        currentSentenceIndex !== sentenceIndex
          ? group
          : group.filter((token) => token.id !== tokenId),
      ),
    );
  };

  const addSentence = () => {
    commitGroups([...groups, makeDefaultSentenceGroup()]);
  };

  const removeSentence = (sentenceIndex: number) => {
    if (groups.length === 1) {
      commitGroups([makeDefaultSentenceGroup()]);
      return;
    }

    commitGroups(groups.filter((_, index) => index !== sentenceIndex));
  };

  const moveSentence = (fromSentenceIndex: number, toSentenceIndex: number) => {
    if (fromSentenceIndex === toSentenceIndex) return;
    const nextGroups = [...groups];
    const [moved] = nextGroups.splice(fromSentenceIndex, 1);
    nextGroups.splice(toSentenceIndex, 0, moved);
    commitGroups(nextGroups);
  };

  const moveWord = (
    fromSentenceIndex: number,
    tokenId: string,
    toSentenceIndex: number,
    toWordIndex?: number,
  ) => {
    if (fromSentenceIndex !== toSentenceIndex) return;

    const sourceGroup = groups[fromSentenceIndex] ?? [];
    const token = sourceGroup.find((item) => item.id === tokenId);
    if (!token) return;

    const nextGroups = groups.map((group) => [...group]);
    nextGroups[fromSentenceIndex] = nextGroups[fromSentenceIndex].filter(
      (item) => item.id !== tokenId,
    );

    const insertIndex =
      typeof toWordIndex === 'number'
        ? Math.max(0, Math.min(toWordIndex, nextGroups[toSentenceIndex]?.length ?? 0))
        : nextGroups[toSentenceIndex]?.length ?? 0;

    if (!nextGroups[toSentenceIndex]) nextGroups[toSentenceIndex] = [];
    nextGroups[toSentenceIndex].splice(insertIndex, 0, token);

    commitGroups(nextGroups);
  };

  return (
    <div>
      {/* <div className="dtg-words-bar" style={{ marginBottom: 12 }}>
        <span className="dtg-words-bar-hint">
          Перетаскивайте слова и карточки предложений, чтобы собрать правильный порядок
        </span>
      </div> */}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {groups.map((group, sentenceIndex) => (
          <div
            key={`sentence-${sentenceIndex}-${group.map((token) => token.id).join('-')}`}
            onDragOver={(e) => {
              if (draggingSentenceIndex !== null) {
                e.preventDefault();
                return;
              }

              if (draggingWord && draggingWord.sentenceIndex === sentenceIndex) {
                e.preventDefault();
              }
            }}
            onDrop={(e) => {
              e.preventDefault();

              if (draggingSentenceIndex !== null) {
                moveSentence(draggingSentenceIndex, sentenceIndex);
                setDraggingSentenceIndex(null);
                return;
              }

              if (draggingWord && draggingWord.sentenceIndex === sentenceIndex) {
                moveWord(draggingWord.sentenceIndex, draggingWord.tokenId, sentenceIndex);
                setDraggingWord(null);
              }
            }}
            style={{
              width: '100%',
              maxWidth: 760,
              borderRadius: 18,
              border: `1.5px solid ${T.border}`,
              background: '#f1f5f9',
              padding: 14,
              boxSizing: 'border-box',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <button
                type="button"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'move';
                  setDraggingSentenceIndex(sentenceIndex);
                }}
                onDragEnd={() => {
                  setDraggingSentenceIndex(null);
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  border: `1px solid ${T.border}`,
                  background: '#fff',
                  color: T.ink4,
                  cursor: 'grab',
                  flexShrink: 0,
                }}
                aria-label={`Drag sentence ${sentenceIndex + 1}`}
                title="Перетащить предложение"
              >
                <GripVertical size={14} />
              </button>

              <span style={{ fontSize: 12, fontWeight: 700, color: T.ink3 }}>
                Предложение {sentenceIndex + 1}
              </span>

              <div style={{ flex: 1 }} />

              <button
                type="button"
                onClick={() => removeSentence(sentenceIndex)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  border: 'none',
                  background: 'transparent',
                  color: T.ink4,
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
                aria-label={`Remove sentence ${sentenceIndex + 1}`}
                title="Удалить предложение"
              >
                <X size={14} />
              </button>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-start' }}>
              {group.map((token, wordIndex) => {
                const inputWidth = Math.max(
                  108,
                  Math.min(
                    220,
                    Math.max(token.text.trim().length, 'Write a word'.length) * 8 + 34,
                  ),
                );

                return (
                  <div
                    key={token.id}
                    onDragOver={(e) => {
                      if (!draggingWord || draggingWord.sentenceIndex !== sentenceIndex) {
                        return;
                      }

                      e.preventDefault();
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (!draggingWord || draggingWord.sentenceIndex !== sentenceIndex) return;
                      moveWord(draggingWord.sentenceIndex, draggingWord.tokenId, sentenceIndex, wordIndex);
                      setDraggingWord(null);
                    }}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '7px 10px',
                      borderRadius: 14,
                      border: `1.5px solid ${T.border}`,
                      background: '#fff',
                      minHeight: 46,
                    }}
                  >
                    <button
                      type="button"
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = 'move';
                        setDraggingWord({
                          sentenceIndex,
                          tokenId: token.id,
                        });
                      }}
                      onDragEnd={() => {
                        setDraggingWord(null);
                      }}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 18,
                        height: 18,
                        color: T.ink4,
                        cursor: 'grab',
                        border: 'none',
                        background: 'transparent',
                        padding: 0,
                        flexShrink: 0,
                      }}
                      aria-label={`Drag word ${token.text || wordIndex + 1}`}
                      title="Перетащить слово"
                    >
                      <GripVertical size={14} />
                    </button>

                    <input
                      type="text"
                      value={token.text}
                      onChange={(e) => updateWord(sentenceIndex, token.id, e.target.value)}
                      placeholder="Write a word"
                      style={{
                        width: inputWidth,
                        border: 'none',
                        outline: 'none',
                        background: 'transparent',
                        fontSize: 13,
                        color: T.ink,
                        fontFamily: 'inherit',
                      }}
                    />

                    <button
                      type="button"
                      onClick={() => removeWord(sentenceIndex, token.id)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 20,
                        height: 20,
                        borderRadius: 6,
                        border: 'none',
                        background: 'transparent',
                        color: T.ink5,
                        cursor: 'pointer',
                        flexShrink: 0,
                      }}
                      aria-label="Remove word"
                      title="Удалить слово"
                    >
                      <X size={13} />
                    </button>
                  </div>
                );
              })}

              <button
                type="button"
                onClick={() => addWord(sentenceIndex)}
                className="dtg-variant-add"
                style={{
                  width: 42,
                  height: 46,
                  justifyContent: 'center',
                  padding: 0,
                  borderRadius: 14,
                  marginTop: 0,
                }}
                aria-label={`Add word to sentence ${sentenceIndex + 1}`}
                title="Добавить слово"
              >
                <Plus size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={addSentence}
          className="dtg-variant-add"
          style={{ marginTop: 0 }}
        >
          <Plus size={13} />
          Добавить предложение
        </button>
      </div>
    </div>
  );
}

function OrderingSentencesEditor({
  label, draft, onChangeRaw,
}: {
  label: string;
  draft: OrderingSentencesDraft;
  onChangeRaw: (d: OrderingSentencesDraft) => void;
}) {
  const orderedItems = useMemo(() => getOrderingSentencesItems(draft), [draft]);
  const [draggingSentenceIndex, setDraggingSentenceIndex] = useState<number | null>(null);

  const commitItems = useCallback(
    (nextItems: TokenDraft[]) => {
      onChangeRaw(buildOrderingSentencesDraft(draft, nextItems));
    },
    [draft, onChangeRaw],
  );

  const updateItem = (itemId: string, text: string) => {
    commitItems(
      orderedItems.map((item) =>
        item.id === itemId ? { ...item, text } : item,
      ),
    );
  };

  const addItem = () => {
    commitItems([...orderedItems, { id: uid(), text: '' }]);
  };

  const removeItem = (itemId: string) => {
    const nextItems = orderedItems.filter((item) => item.id !== itemId);
    if (nextItems.length === 0) {
      commitItems([{ id: uid(), text: '' }]);
      return;
    }
    commitItems(nextItems);
  };

  const moveItem = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    const nextItems = [...orderedItems];
    const [moved] = nextItems.splice(fromIndex, 1);
    nextItems.splice(toIndex, 0, moved);
    commitItems(nextItems);
  };

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {orderedItems.map((item, sentenceIndex) => (
          <div
            key={`sentence-${item.id}`}
            onDragOver={(e) => {
              if (draggingSentenceIndex === null) return;
              e.preventDefault();
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (draggingSentenceIndex === null) return;
              moveItem(draggingSentenceIndex, sentenceIndex);
              setDraggingSentenceIndex(null);
            }}
            style={{
              width: '100%',
              maxWidth: 760,
              borderRadius: 18,
              border: `1.5px solid ${T.border}`,
              background: '#f1f5f9',
              padding: 14,
              boxSizing: 'border-box',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <button
                type="button"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'move';
                  setDraggingSentenceIndex(sentenceIndex);
                }}
                onDragEnd={() => {
                  setDraggingSentenceIndex(null);
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  border: `1px solid ${T.border}`,
                  background: '#fff',
                  color: T.ink4,
                  cursor: 'grab',
                  flexShrink: 0,
                }}
                aria-label={`Drag sentence ${sentenceIndex + 1}`}
                title={`Drag ${label.toLowerCase()} ${sentenceIndex + 1}`}
              >
                <GripVertical size={14} />
              </button>

              <span style={{ fontSize: 12, fontWeight: 700, color: T.ink3 }}>
                {label} {sentenceIndex + 1}
              </span>

              <div style={{ flex: 1 }} />

              <button
                type="button"
                onClick={() => removeItem(item.id)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  border: 'none',
                  background: 'transparent',
                  color: T.ink4,
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
                aria-label={`Remove ${label.toLowerCase()} ${sentenceIndex + 1}`}
                title={`Remove ${label.toLowerCase()}`}
              >
                <X size={14} />
              </button>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-start' }}>
              <input
                type="text"
                value={item.text}
                onChange={(e) => updateItem(item.id, e.target.value)}
                placeholder={`Write ${label.toLowerCase()}`}
                style={{
                  width: '100%',
                  minHeight: 46,
                  borderRadius: 14,
                  border: `1.5px solid ${T.border}`,
                  background: '#fff',
                  padding: '0 14px',
                  fontSize: 13,
                  color: T.ink,
                  fontFamily: 'inherit',
                  outline: 'none',
                }}
              />
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={addItem}
          className="dtg-variant-add"
          style={{ marginTop: 0 }}
        >
          <Plus size={13} />
          Add sentence
        </button>

      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared micro-components
// ─────────────────────────────────────────────────────────────────────────────

function InlineHint({ icon, color, children }: {
  icon: React.ReactNode; color: string; children: React.ReactNode;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      marginTop: 12, fontSize: 12, color, fontWeight: 600,
      letterSpacing: '-0.01em',
    }}>
      <span style={{ flexShrink: 0, color }}>{icon}</span>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Named exports for individual editors — UNCHANGED
// ─────────────────────────────────────────────────────────────────────────────

export function OrderingWordsQuestionEditor({
  draft, onChange,
}: { draft: OrderingWordsDraft; onChange: (d: OrderingWordsDraft) => void }) {
  return <BuildSentenceQuestionEditor draft={draft} onChange={onChange} />;
}

export function OrderingSentencesQuestionEditor({
  draft, onChange,
}: { draft: OrderingSentencesDraft; onChange: (d: OrderingSentencesDraft) => void }) {
  return <OrderingSentencesEditor label="Sentence" draft={draft} onChangeRaw={onChange as any} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// QuestionEditorRenderer — dispatcher (UNCHANGED)
// ─────────────────────────────────────────────────────────────────────────────

export interface QuestionEditorRendererProps {
  draft: QuestionDraft;
  onChange: (draft: QuestionDraft) => void;
}

export default function QuestionEditorRenderer({ draft, onChange }: QuestionEditorRendererProps) {
    switch (draft.type) {
    case 'multiple_choice':    return <MultipleChoiceQuestionEditor    draft={draft} onChange={onChange as any} />;
    case 'true_false':         return <TrueFalseQuestionEditor         draft={draft} onChange={onChange as any} />;
    case 'open_answer':        return <OpenAnswerQuestionEditor        draft={draft} onChange={onChange as any} />;
    case 'cloze_input':        return <ClozeInputQuestionEditor        draft={draft} onChange={onChange as any} />;
    case 'cloze_drag':         return <ClozeDragQuestionEditor         draft={draft} onChange={onChange as any} />;
    case 'matching_pairs':     return <MatchingPairsQuestionEditor     draft={draft} onChange={onChange as any} />;
    case 'ordering_words':     return <OrderingWordsQuestionEditor     draft={draft} onChange={onChange as any} />;
    case 'ordering_sentences': return <OrderingSentencesQuestionEditor draft={draft} onChange={onChange as any} />;
  }
}