/**
 * SlideEditorStep.tsx  (v10 — empty-first block-based editor)
 *
 * Changes from v9:
 * ─────────────────
 * • BLOCK SYSTEM: Replaced fixed Title → Image → Bullets layout with a
 *   dynamic contentBlocks: Array<{ id, type, data }> model (Notion-style).
 * • BLOCK TYPES: Text, Image, List — each independently editable + removable.
 * • EMPTY FIRST: Initial slide state is completely empty (no scaffolding).
 * • CLEAN DATA MODEL: SlideDraft now uses contentBlocks. Legacy fields
 *   (title, bullets, image_url) removed. examples/exercise kept as optional
 *   for compatibility with parent consumers that may still reference them.
 * • ADD BLOCK MENU: "+ Add block" button with type picker.
 * • REORDER: Blocks can be moved up / down via drag-handle arrows.
 * • AUTO-SAVE: Debounce auto-save preserved unchanged.
 * • UNTOUCHED: SegmentedProgressBar, navigation, save-status logic.
 */

import React, {
  useState, useCallback, useRef, useEffect,
} from 'react';
import {
  Plus, Trash2, ImageIcon, ImageOff,
  Pencil, X, Check,
  ChevronLeft, ChevronRight,
  AlignLeft, List, Image as ImageBlockIcon,
  ChevronUp, ChevronDown,
  GripVertical,
} from 'lucide-react';

// ─── Design tokens ─────────────────────────────────────────────────────────────

const T = {
  primary:     '#6C6FEF',
  primaryDark: '#4F52C2',
  tint:        '#EEF0FE',
  tintBorder:  '#C7C9F9',
} as const;

// ─── Block types & data model ─────────────────────────────────────────────────

export type BlockType = 'text' | 'image' | 'list';

export interface TextBlockData  { content: string }
export interface ImageBlockData { url: string }
export interface ListBlockData  { items: string[] }

export type BlockData =
  | { type: 'text';  data: TextBlockData  }
  | { type: 'image'; data: ImageBlockData }
  | { type: 'list';  data: ListBlockData  };

export type ContentBlock = BlockData & { id: string };

// ─── Draft type ───────────────────────────────────────────────────────────────

export interface SlideDraft {
  contentBlocks: ContentBlock[];
  /** @deprecated kept for parent compatibility — not rendered by this editor */
  examples?: string[];
  /** @deprecated kept for parent compatibility — not rendered by this editor */
  exercise?: string;
}

export const EMPTY_SLIDE_DRAFT: SlideDraft = {
  contentBlocks: [],
};

// ─── Props ────────────────────────────────────────────────────────────────────

export type SaveStatus = 'idle' | 'saving' | 'saved';

export interface SlideEditorStepProps {
  /** @deprecated use draft.contentBlocks instead */
  initialTitle?:       string;
  draft?:              SlideDraft;
  onChange?:           (draft: SlideDraft) => void;
  onSave?:             (draft: SlideDraft) => void | Promise<void>;
  isSaving?:           boolean;
  totalSlides?:        number;
  currentSlideIndex?:  number;
  onChangeSlide?:      (i: number) => void;
  viewedSlideIds?:     string[];
  onSaveStatusChange?: (status: SaveStatus) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

// ─── SegmentedProgressBar (unchanged) ─────────────────────────────────────────

function SegmentedProgressBar({
  total, current, viewedIds, onJump,
}: {
  total: number; current: number; viewedIds: string[]; onJump: (i: number) => void;
}) {
  return (
    <div className="flex items-center gap-[3px] w-full" role="tablist" aria-label="Slide progress">
      {Array.from({ length: total }, (_, i) => {
        const isViewed  = viewedIds.includes(String(i));
        const isCurrent = i === current;
        return (
          <button
            key={i}
            role="tab"
            aria-selected={isCurrent}
            aria-label={`Slide ${i + 1}`}
            onClick={() => onJump(i)}
            style={isCurrent ? { backgroundColor: T.primary } : isViewed ? { backgroundColor: T.tintBorder } : {}}
            className={[
              'h-[2px] flex-1 rounded-full transition-all duration-300 focus:outline-none cursor-pointer',
              isCurrent ? 'scale-y-[1.5]' : 'bg-slate-200 hover:bg-slate-300',
            ].join(' ')}
          />
        );
      })}
    </div>
  );
}

// ─── ImagePopover (reused from v9) ───────────────────────────────────────────

function ImagePopover({
  inputRef, value, onChange, onConfirm, onCancel, absolute = false,
}: {
  inputRef: React.RefObject<HTMLInputElement>;
  value: string;
  onChange: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  absolute?: boolean;
}) {
  return (
    <div className={[
      absolute ? 'absolute bottom-2 left-2 right-2 z-10' : 'mt-2',
      'rounded-xl border border-slate-200 bg-white shadow-lg px-3 py-2.5 flex items-center gap-2',
    ].join(' ')}>
      <ImageIcon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
      <input
        ref={inputRef}
        type="url"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="https://…"
        onKeyDown={(e) => {
          if (e.key === 'Enter')  { e.preventDefault(); onConfirm(); }
          if (e.key === 'Escape') { e.preventDefault(); onCancel();  }
        }}
        className="flex-1 min-w-0 text-[13px] text-slate-800 placeholder-slate-300 bg-transparent focus:outline-none"
      />
      <button type="button" onClick={onConfirm} aria-label="Confirm image URL"
        style={{ color: T.primary }}
        className="shrink-0 rounded-md p-1 transition-colors focus:outline-none hover:opacity-70">
        <Check className="h-4 w-4" />
      </button>
      <button type="button" onClick={onCancel} aria-label="Cancel"
        className="shrink-0 rounded-md p-1 text-slate-300 hover:bg-slate-100 hover:text-slate-500 transition-colors focus:outline-none">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

// ─── Block: Text ──────────────────────────────────────────────────────────────

function TextBlock({
  data, onChange,
}: {
  data: TextBlockData;
  onChange: (d: TextBlockData) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [data.content]);

  return (
    <textarea
      ref={ref}
      rows={2}
      value={data.content}
      onChange={(e) => onChange({ content: e.target.value })}
      placeholder="Add text…"
      aria-label="Text block"
      className={[
        'w-full resize-none overflow-hidden bg-transparent',
        'text-[15px] leading-relaxed text-slate-700 placeholder-slate-300',
        'rounded-lg px-2 py-1 -mx-2',
        'border border-transparent',
        'focus:outline-none transition-colors duration-150',
      ].join(' ')}
      onFocus={(e) => {
        e.currentTarget.style.borderColor     = T.tintBorder;
        e.currentTarget.style.backgroundColor = T.tint + '30';
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor     = 'transparent';
        e.currentTarget.style.backgroundColor = 'transparent';
      }}
    />
  );
}

// ─── Block: Image ─────────────────────────────────────────────────────────────

function ImageBlock({
  data, onChange,
}: {
  data: ImageBlockData;
  onChange: (d: ImageBlockData) => void;
}) {
  const [editing,  setEditing]  = useState(!data.url);
  const [inputVal, setInputVal] = useState(data.url);
  const [imgError, setImgError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) { setInputVal(data.url); setImgError(false); }
  }, [data.url, editing]);

  const openEdit = () => {
    setInputVal(data.url);
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };
  const confirm = () => { onChange({ url: inputVal.trim() }); setEditing(false); };
  const cancel  = () => { setInputVal(data.url); setEditing(false); };
  const remove  = (e: React.MouseEvent) => { e.stopPropagation(); onChange({ url: '' }); setEditing(false); };

  if (!data.url) {
    return (
      <div className="relative">
        <button
          type="button"
          onClick={openEdit}
          aria-label="Add image URL"
          className={[
            'flex h-[200px] w-full items-center justify-center gap-2',
            'rounded-xl border-2 border-dashed border-slate-200 bg-slate-50',
            'text-slate-400 transition-colors duration-200 focus:outline-none',
          ].join(' ')}
          onMouseEnter={(e) => {
            const b = e.currentTarget as HTMLButtonElement;
            b.style.borderColor = T.tintBorder;
            b.style.backgroundColor = T.tint;
            b.style.color = T.primary;
          }}
          onMouseLeave={(e) => {
            const b = e.currentTarget as HTMLButtonElement;
            b.style.borderColor = '';
            b.style.backgroundColor = '';
            b.style.color = '';
          }}
        >
          <ImageIcon className="h-5 w-5" />
          <span className="text-sm font-medium">Paste image URL</span>
        </button>
        {editing && (
          <ImagePopover
            inputRef={inputRef} value={inputVal}
            onChange={setInputVal} onConfirm={confirm} onCancel={cancel}
          />
        )}
      </div>
    );
  }

  return (
    <div className="relative group/img overflow-hidden rounded-xl border border-slate-100 bg-slate-50">
      {imgError
        ? <div className="flex h-[200px] w-full items-center justify-center bg-slate-100 text-slate-300">
            <ImageOff className="h-8 w-8" />
          </div>
        : <img
            src={data.url}
            alt="Slide illustration"
            onError={() => setImgError(true)}
            className="max-h-[220px] w-full object-contain block"
          />
      }
      <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/30 opacity-0 group-hover/img:opacity-100 transition-opacity duration-200">
        <button type="button" onClick={openEdit}
          className="flex items-center gap-1.5 rounded-lg bg-white/90 px-3 py-1.5 text-[12px] font-semibold text-slate-700 shadow hover:bg-white transition-colors">
          <Pencil className="h-3 w-3" />Replace
        </button>
        <button type="button" onClick={remove}
          className="flex items-center gap-1.5 rounded-lg bg-white/90 px-3 py-1.5 text-[12px] font-semibold text-red-500 shadow hover:bg-white transition-colors">
          <X className="h-3 w-3" />Remove
        </button>
      </div>
      {editing && (
        <ImagePopover
          inputRef={inputRef} value={inputVal}
          onChange={setInputVal} onConfirm={confirm} onCancel={cancel}
          absolute
        />
      )}
    </div>
  );
}

// ─── Block: List ──────────────────────────────────────────────────────────────

function ListBlock({
  data, onChange,
}: {
  data: ListBlockData;
  onChange: (d: ListBlockData) => void;
}) {
  const items = data.items.length > 0 ? data.items : [''];

  const update = (i: number, v: string) => {
    const next = [...items]; next[i] = v; onChange({ items: next });
  };
  const add = () => onChange({ items: [...items, ''] });
  const remove = (i: number) => {
    if (items.length === 1) { onChange({ items: [''] }); return; }
    onChange({ items: items.filter((_, idx) => idx !== i) });
  };

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const prevLen   = useRef(items.length);
  useEffect(() => {
    if (items.length > prevLen.current) inputRefs.current[items.length - 1]?.focus();
    prevLen.current = items.length;
  }, [items.length]);

  return (
    <ul className="space-y-3">
      {items.map((v, i) => (
        <li key={i} className="group flex items-start gap-3.5">
          <span className="mt-[9px] h-[2px] w-3 shrink-0 rounded-full" style={{ backgroundColor: T.primary }} />
          <input
            ref={(el) => { inputRefs.current[i] = el; }}
            type="text"
            value={v}
            onChange={(e) => update(i, e.target.value)}
            placeholder={`Item ${i + 1}…`}
            aria-label={`List item ${i + 1}`}
            onKeyDown={(e) => {
              if (e.key === 'Enter')                               { e.preventDefault(); add(); }
              if (e.key === 'Backspace' && !v && items.length > 1) { e.preventDefault(); remove(i); }
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = T.tintBorder; e.currentTarget.style.backgroundColor = T.tint + '30'; }}
            onBlur={(e)  => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.backgroundColor = 'transparent'; }}
            className={[
              'flex-1 bg-transparent text-[15px] leading-relaxed text-slate-700 placeholder-slate-300',
              'rounded px-1 py-0.5 -ml-1 border border-transparent',
              'focus:outline-none transition-colors duration-150',
            ].join(' ')}
          />
          <button
            type="button" onClick={() => remove(i)} aria-label="Remove item"
            className="mt-[5px] shrink-0 rounded p-1 text-slate-200 hover:bg-red-50 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all duration-150 focus:opacity-100 focus:outline-none"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </li>
      ))}
      <li className="pt-0.5">
        <button
          type="button" onClick={add}
          style={{ color: T.primary }}
          className="ml-[18px] flex items-center gap-1.5 text-[12px] font-medium opacity-50 hover:opacity-100 transition-opacity duration-150 focus:outline-none focus:opacity-100"
        >
          <Plus className="h-3 w-3" />
          <span>Add item</span>
        </button>
      </li>
    </ul>
  );
}

// ─── Block wrapper (chrome: label, move, remove) ───────────────────────────────

const BLOCK_LABELS: Record<BlockType, string> = {
  text:  'Text',
  image: 'Image',
  list:  'List',
};

function BlockShell({
  block, isFirst, isLast,
  onMoveUp, onMoveDown, onRemove,
  children,
}: {
  block:      ContentBlock;
  isFirst:    boolean;
  isLast:     boolean;
  onMoveUp:   () => void;
  onMoveDown: () => void;
  onRemove:   () => void;
  children:   React.ReactNode;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="group/block relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Block toolbar — appears on hover */}
      <div
        className={[
          'absolute -left-[34px] top-0 flex flex-col items-center gap-0.5',
          'transition-opacity duration-150',
          hovered ? 'opacity-100' : 'opacity-0',
        ].join(' ')}
        style={{ width: 28 }}
      >
        {/* Move up */}
        <button
          type="button"
          onClick={onMoveUp}
          disabled={isFirst}
          aria-label="Move block up"
          className={[
            'flex h-6 w-6 items-center justify-center rounded-md transition-colors focus:outline-none',
            isFirst
              ? 'text-slate-200 cursor-default'
              : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700',
          ].join(' ')}
        >
          <ChevronUp className="h-3 w-3" />
        </button>

        {/* Grip */}
        <span className="flex h-5 items-center text-slate-300">
          <GripVertical className="h-3.5 w-3.5" />
        </span>

        {/* Move down */}
        <button
          type="button"
          onClick={onMoveDown}
          disabled={isLast}
          aria-label="Move block down"
          className={[
            'flex h-6 w-6 items-center justify-center rounded-md transition-colors focus:outline-none',
            isLast
              ? 'text-slate-200 cursor-default'
              : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700',
          ].join(' ')}
        >
          <ChevronDown className="h-3 w-3" />
        </button>
      </div>

      {/* Block type label + remove */}
      <div
        className={[
          'absolute -top-5 right-0 flex items-center gap-1 transition-opacity duration-150',
          hovered ? 'opacity-100' : 'opacity-0',
        ].join(' ')}
      >
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-300 select-none">
          {BLOCK_LABELS[block.type]}
        </span>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${BLOCK_LABELS[block.type]} block`}
          className="flex h-4 w-4 items-center justify-center rounded text-slate-300 hover:bg-red-50 hover:text-red-400 transition-colors focus:outline-none"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      {/* Block content */}
      <div className="py-1">{children}</div>
    </div>
  );
}

// ─── Add Block Menu ───────────────────────────────────────────────────────────

const BLOCK_OPTIONS: { type: BlockType; label: string; icon: React.ReactNode; desc: string }[] = [
  { type: 'text',  label: 'Text',  icon: <AlignLeft className="h-4 w-4" />,       desc: 'Paragraph or heading' },
  { type: 'image', label: 'Image', icon: <ImageBlockIcon className="h-4 w-4" />,  desc: 'From a URL'           },
  { type: 'list',  label: 'List',  icon: <List className="h-4 w-4" />,            desc: 'Bullet points'        },
];

function AddBlockMenu({ onAdd }: { onAdd: (type: BlockType) => void }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const pick = (type: BlockType) => {
    onAdd(type);
    setOpen(false);
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={open ? { color: T.primary, borderColor: T.tintBorder, backgroundColor: T.tint } : {}}
        className={[
          'flex items-center gap-2 rounded-xl px-3 py-2',
          'text-[13px] font-medium text-slate-400',
          'border border-dashed border-slate-200',
          'hover:border-slate-300 hover:text-slate-600',
          'transition-all duration-150 focus:outline-none w-full justify-center',
        ].join(' ')}
        onMouseEnter={(e) => {
          if (open) return;
          e.currentTarget.style.borderColor = T.tintBorder;
          e.currentTarget.style.color = T.primary;
        }}
        onMouseLeave={(e) => {
          if (open) return;
          e.currentTarget.style.borderColor = '';
          e.currentTarget.style.color = '';
        }}
      >
        <Plus className="h-3.5 w-3.5" />
        Add block
      </button>

      {open && (
        <div className="absolute bottom-[calc(100%+6px)] left-0 right-0 z-20 rounded-xl border border-slate-100 bg-white shadow-xl overflow-hidden">
          {BLOCK_OPTIONS.map(({ type, label, icon, desc }) => (
            <button
              key={type}
              type="button"
              onClick={() => pick(type)}
              className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-slate-50 focus:outline-none group"
            >
              <span
                className="flex h-8 w-8 items-center justify-center rounded-lg shrink-0 transition-colors"
                style={{ backgroundColor: T.tint, color: T.primary }}
              >
                {icon}
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold text-slate-800">{label}</span>
                <span className="block text-[11px] text-slate-400">{desc}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptySlide() {
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-3 select-none">
      <div
        className="flex h-12 w-12 items-center justify-center rounded-2xl"
        style={{ backgroundColor: T.tint }}
      >
        <Plus className="h-5 w-5" style={{ color: T.primary }} />
      </div>
      <p className="text-[13px] text-slate-400 text-center max-w-[180px] leading-snug">
        This slide is empty.<br />Add a block to get started.
      </p>
    </div>
  );
}

// ─── SlideEditorCanvas ────────────────────────────────────────────────────────

function SlideEditorCanvas({
  draft, onBlocksChange,
  total, current, viewedIds, onJump, onPrev, onNext,
}: {
  draft:           SlideDraft;
  onBlocksChange:  (blocks: ContentBlock[]) => void;
  total:           number;
  current:         number;
  viewedIds:       string[];
  onJump:          (i: number) => void;
  onPrev:          () => void;
  onNext:          () => void;
}) {
  const blocks = draft?.contentBlocks ?? [];
  const isFirst = current === 0;
  const isLast  = current === total - 1;

  // ── Block mutation helpers ─────────────────────────────────────────────────

  const addBlock = useCallback((type: BlockType) => {
    let newBlock: ContentBlock;
    const id = uid();
    if (type === 'text')  newBlock = { id, type: 'text',  data: { content: '' } };
    else if (type === 'image') newBlock = { id, type: 'image', data: { url: '' } };
    else                  newBlock = { id, type: 'list',  data: { items: [''] } };
    onBlocksChange([...blocks, newBlock]);
  }, [blocks, onBlocksChange]);

  const removeBlock = useCallback((id: string) => {
    onBlocksChange(blocks.filter((b) => b.id !== id));
  }, [blocks, onBlocksChange]);

  const updateBlock = useCallback((id: string, data: BlockData['data']) => {
    onBlocksChange(blocks.map((b) => b.id === id ? { ...b, data } as ContentBlock : b));
  }, [blocks, onBlocksChange]);

  const moveBlock = useCallback((id: string, dir: -1 | 1) => {
    const idx = blocks.findIndex((b) => b.id === id);
    if (idx < 0) return;
    const next = [...blocks];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    onBlocksChange(next);
  }, [blocks, onBlocksChange]);

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">

      {/* ── [pinned] Segmented progress track ──────────────────────────── */}
      {total > 1 && (
        <div className="flex-shrink-0 px-4 pt-2 pb-2 border-b border-slate-100/70">
          <SegmentedProgressBar
            total={total} current={current}
            viewedIds={viewedIds} onJump={onJump}
          />
        </div>
      )}

      {/* ── [scrollable] Content zone ───────────────────────────────────── */}
      <div
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain py-4 pr-5 sm:pr-6"
        style={{ paddingLeft: 44, scrollbarGutter: 'stable' }}
      >
        {blocks.length === 0
          ? <EmptySlide />
          : (
            <div className="space-y-6">
              {blocks.map((block, i) => (
                <BlockShell
                  key={block.id}
                  block={block}
                  isFirst={i === 0}
                  isLast={i === blocks.length - 1}
                  onMoveUp={()   => moveBlock(block.id, -1)}
                  onMoveDown={() => moveBlock(block.id,  1)}
                  onRemove={()   => removeBlock(block.id)}
                >
                  {block.type === 'text' && (
                    <TextBlock
                      data={block.data as TextBlockData}
                      onChange={(d) => updateBlock(block.id, d)}
                    />
                  )}
                  {block.type === 'image' && (
                    <ImageBlock
                      data={block.data as ImageBlockData}
                      onChange={(d) => updateBlock(block.id, d)}
                    />
                  )}
                  {block.type === 'list' && (
                    <ListBlock
                      data={block.data as ListBlockData}
                      onChange={(d) => updateBlock(block.id, d)}
                    />
                  )}
                </BlockShell>
              ))}
            </div>
          )
        }

        {/* Add block button — always visible at bottom of content area */}
        <div className="mt-6">
          <AddBlockMenu onAdd={addBlock} />
        </div>
      </div>

      {/* ── [pinned] Footer nav row ─────────────────────────────────────── */}
      <div className="flex-shrink-0 flex items-center justify-between gap-3 px-4 py-2 border-t border-slate-100">

        {/* Prev */}
        <button
          disabled={isFirst}
          onClick={onPrev}
          aria-label="Previous slide"
          className={[
            'flex h-9 w-9 items-center justify-center rounded-xl border transition-all duration-150',
            'focus:outline-none',
            isFirst
              ? 'cursor-not-allowed border-slate-100 text-slate-200'
              : 'border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-white hover:text-slate-800 hover:shadow-sm active:scale-95',
          ].join(' ')}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {/* Centre counter */}
        <span className="text-[12px] tabular-nums text-slate-400 font-medium select-none">
          {current + 1}&thinsp;of&thinsp;{total}
        </span>

        {/* Next */}
        <button
          disabled={isLast}
          onClick={onNext}
          aria-label="Next slide"
          className={[
            'flex h-9 w-9 items-center justify-center rounded-xl border transition-all duration-150',
            'focus:outline-none',
            isLast
              ? 'cursor-not-allowed border-slate-100 text-slate-200'
              : 'border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-white hover:text-slate-800 hover:shadow-sm active:scale-95',
          ].join(' ')}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default function SlideEditorStep({
  initialTitle:     _initialTitle = '',
  draft:  initialDraft,
  onChange,
  onSave,
  isSaving          = false,
  totalSlides       = 1,
  currentSlideIndex = 0,
  onChangeSlide,
  viewedSlideIds    = [],
  onSaveStatusChange,
}: SlideEditorStepProps) {
  // Resolve initial draft — fall back to empty if none provided.
  // The deprecated initialTitle is intentionally not scaffolded into a block;
  // the empty-first principle means the editor always starts blank.
  const resolvedDraft: SlideDraft = {
    ...EMPTY_SLIDE_DRAFT,
    ...initialDraft,
    contentBlocks: initialDraft?.contentBlocks ?? [],
  };
  const [draft, setDraft] = useState<SlideDraft>(resolvedDraft);

  // ── Refs for auto-save guard ───────────────────────────────────────────────
  const isMountedRef   = useRef(false);
  const isReseedingRef = useRef(false);

  // Re-seed when parent navigates to a different slide slot
  useEffect(() => {
    isReseedingRef.current = true;
    setDraft(resolvedDraft);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSlideIndex]);

  const updateBlocks = useCallback((blocks: ContentBlock[]) => {
    setDraft((prev) => {
      const next: SlideDraft = { ...prev, contentBlocks: blocks };
      onChange?.(next);
      return next;
    });
  }, [onChange]);

  // ── Auto-save via debounce ─────────────────────────────────────────────────
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const debounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeRef      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftRef     = useRef<SlideDraft>(draft);
  draftRef.current   = draft;

  useEffect(() => {
    if (!isMountedRef.current) {
      isMountedRef.current = true;
      return;
    }
    if (isReseedingRef.current) {
      isReseedingRef.current = false;
      return;
    }
    if (!onSave) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (fadeRef.current)     clearTimeout(fadeRef.current);

    setSaveStatus('saving');

    debounceRef.current = setTimeout(async () => {
      try {
        await onSave(draftRef.current);
        setSaveStatus('saved');
        fadeRef.current = setTimeout(() => setSaveStatus('idle'), 2000);
      } catch {
        setSaveStatus('idle');
      }
    }, 800);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  useEffect(() => {
    if (isSaving) setSaveStatus('saving');
  }, [isSaving]);

  useEffect(() => {
    onSaveStatusChange?.(saveStatus);
  }, [saveStatus, onSaveStatusChange]);

  const isFirst = currentSlideIndex === 0;
  const isLast  = currentSlideIndex === totalSlides - 1;

  const prev = () => { if (!isFirst) onChangeSlide?.(currentSlideIndex - 1); };
  const next = () => { if (!isLast)  onChangeSlide?.(currentSlideIndex + 1); };
  const jump = (i: number) => onChangeSlide?.(i);

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
      <SlideEditorCanvas
        draft={draft}
        onBlocksChange={updateBlocks}
        total={totalSlides}
        current={currentSlideIndex}
        viewedIds={viewedSlideIds}
        onJump={jump}
        onPrev={prev}
        onNext={next}
      />
    </div>
  );
} 