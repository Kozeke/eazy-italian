/**
 * SlideEditorStep.tsx  (v4 — inline canvas editing)
 *
 * The teacher now edits DIRECTLY inside the slide canvas, not in a separate
 * right-side form. The canvas visually mirrors what students see (same card,
 * same proportions, same typography) but every field is editable in-place.
 *
 * Architecture
 * ────────────
 * • EditableSlideCanvas   — the single main surface (mirrors SlidesPlayer card)
 *   ├─ EditableTitle       — styled textarea that looks like the slide h3
 *   ├─ EditableBullets     — inline rows with hover +/✕ affordances
 *   └─ EditableImageSlot   — click-to-replace popover, "Add image" placeholder
 *
 * • SlideFloatingToolbar  — compact floating strip below the canvas
 *   add bullet · add/remove image · Advanced drawer toggle
 *
 * • AdvancedDrawer        — collapsible panel for examples + exercise
 *
 * What was removed
 * ────────────────
 * • 2-column split (student preview left / edit form right)
 * • FieldLabel / TextInput / BulletsEditor / ImageEditor as separate form atoms
 *   (logic inlined into the canvas sub-components)
 * • "Edit slide" panel card
 *
 * What is preserved
 * ─────────────────
 * • SlideDraft type and EMPTY_SLIDE_DRAFT (used by LessonEditorShell)
 * • SlideEditorStepProps interface
 * • Save / Back / onChange wiring (unchanged)
 * • Draft state semantics
 */

import React, {
  useState, useCallback, useRef, useEffect, useMemo,
} from 'react';
import {
  Plus, Trash2, ImageIcon, ImageOff, ChevronDown, ChevronUp,
  Pencil, X, Check,
} from 'lucide-react';
import type { ReviewSlide } from '../../../../pages/admin/shared';

// ─── Draft type (re-exported for LessonEditorShell) ───────────────────────────

export interface SlideDraft {
  title:     string;
  bullets:   string[];
  examples:  string[];
  exercise:  string;
  image_url: string;
}

export const EMPTY_SLIDE_DRAFT: SlideDraft = {
  title:     '',
  bullets:   [''],
  examples:  [],
  exercise:  '',
  image_url: '',
};

// ─── Props ────────────────────────────────────────────────────────────────────

export interface SlideEditorStepProps {
  initialTitle?: string;
  draft?:        SlideDraft;
  onChange?:     (draft: SlideDraft) => void;
}

// ─── EditableTitle ─────────────────────────────────────────────────────────────
// A textarea that visually matches the student h3 title, but is editable.

function EditableTitle({
  value,
  onChange,
}: {
  value:    string;
  onChange: (v: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Auto-resize the textarea height to match content
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <div className="group relative mb-5">
      <textarea
        ref={ref}
        rows={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Slide title…"
        aria-label="Slide title"
        className={[
          // Match student h3 visually
          'w-full resize-none overflow-hidden bg-transparent',
          'text-xl font-bold leading-snug text-slate-900',
          'placeholder-slate-300',
          // Subtle edit ring only on focus
          'rounded-lg px-2 py-1 -mx-2 -my-1',
          'border border-transparent',
          'focus:border-teal-300 focus:bg-teal-50/30 focus:outline-none focus:ring-0',
          'transition-colors duration-150',
        ].join(' ')}
      />
      {/* Teacher-only "click to edit" hint — only when empty and unfocused */}
      {!value && (
        <span className="pointer-events-none absolute left-2 top-1 select-none text-xl font-bold text-slate-300">
          Slide title…
        </span>
      )}
      {/* Subtle edit icon in corner on hover */}
      <Pencil className="absolute right-0 top-0.5 h-3 w-3 text-teal-400 opacity-0 group-hover:opacity-60 transition-opacity pointer-events-none" />
    </div>
  );
}

// ─── EditableBullets ──────────────────────────────────────────────────────────
// Bullet rows that look like the student BulletList but are editable in-place.

function EditableBullets({
  values,
  onChange,
}: {
  values:   string[];
  onChange: (v: string[]) => void;
}) {
  const update = (i: number, v: string) => {
    const next = [...values]; next[i] = v; onChange(next);
  };
  const add    = () => onChange([...values, '']);
  const remove = (i: number) => {
    if (values.length === 1) { onChange(['']); return; }
    onChange(values.filter((_, idx) => idx !== i));
  };

  // Focus the last input when a new bullet is added
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const prevLen   = useRef(values.length);
  useEffect(() => {
    if (values.length > prevLen.current) {
      inputRefs.current[values.length - 1]?.focus();
    }
    prevLen.current = values.length;
  }, [values.length]);

  return (
    <div className="space-y-1">
      {values.map((v, i) => (
        <div key={i} className="group flex items-start gap-3">
          {/* Bullet dot — same as student runtime */}
          <span className="mt-[11px] h-1.5 w-1.5 shrink-0 rounded-full bg-primary-400" />

          {/* Editable text */}
          <input
            ref={(el) => { inputRefs.current[i] = el; }}
            type="text"
            value={v}
            onChange={(e) => update(i, e.target.value)}
            placeholder={`Point ${i + 1}…`}
            aria-label={`Bullet ${i + 1}`}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); add(); }
              if (e.key === 'Backspace' && !v && values.length > 1) {
                e.preventDefault(); remove(i);
              }
            }}
            className={[
              'flex-1 bg-transparent text-[15px] leading-relaxed text-slate-700',
              'placeholder-slate-300',
              'rounded px-1 py-0.5 -ml-1',
              'border border-transparent',
              'focus:border-teal-300 focus:bg-teal-50/30 focus:outline-none',
              'transition-colors duration-150',
            ].join(' ')}
          />

          {/* Remove button — teacher-only, appears on hover */}
          <button
            type="button"
            onClick={() => remove(i)}
            aria-label="Remove bullet"
            className={[
              'mt-[5px] shrink-0 rounded p-1',
              'text-slate-200 hover:bg-red-50 hover:text-red-400',
              'opacity-0 group-hover:opacity-100',
              'transition-all duration-150',
              'focus:opacity-100 focus:outline-none',
            ].join(' ')}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}

      {/* Inline add-bullet row */}
      <button
        type="button"
        onClick={add}
        className={[
          'mt-1 ml-[18px] flex items-center gap-1.5',
          'text-[12px] font-medium text-teal-500 hover:text-teal-700',
          'opacity-50 hover:opacity-100 transition-opacity duration-150',
          'focus:outline-none focus:opacity-100',
        ].join(' ')}
      >
        <Plus className="h-3 w-3" />
        <span>Add bullet</span>
      </button>
    </div>
  );
}

// ─── EditableImageSlot ────────────────────────────────────────────────────────
// Shows the image (or a placeholder), opens an inline popover for URL editing.

function EditableImageSlot({
  value,
  onChange,
}: {
  value:    string;
  onChange: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [inputVal, setInputVal] = useState(value);
  const [imgError, setImgError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync external value → local input when not actively editing
  useEffect(() => {
    if (!editing) { setInputVal(value); setImgError(false); }
  }, [value, editing]);

  const openEdit = () => {
    setInputVal(value);
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const confirm = () => {
    onChange(inputVal.trim());
    setEditing(false);
  };
  const cancel = () => {
    setInputVal(value);
    setEditing(false);
  };
  const remove = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setEditing(false);
  };

  // No image: friendly placeholder
  if (!value) {
    return (
      <div className="relative">
        <button
          type="button"
          onClick={openEdit}
          className={[
            'group flex h-36 w-full items-center justify-center gap-2',
            'rounded-xl border-2 border-dashed border-slate-200',
            'bg-slate-50/60 hover:bg-teal-50/40 hover:border-teal-300',
            'text-slate-400 hover:text-teal-600',
            'transition-colors duration-200',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400',
          ].join(' ')}
          aria-label="Add image"
        >
          <ImageIcon className="h-5 w-5" />
          <span className="text-sm font-medium">Add image</span>
        </button>

        {editing && (
          <ImagePopover
            inputRef={inputRef}
            value={inputVal}
            onChange={setInputVal}
            onConfirm={confirm}
            onCancel={cancel}
          />
        )}
      </div>
    );
  }

  // Has image
  return (
    <div className="relative group/img overflow-hidden rounded-xl border border-slate-100 bg-slate-50">
      {imgError ? (
        <div className="flex h-44 w-full items-center justify-center text-slate-300">
          <ImageOff className="h-8 w-8" />
        </div>
      ) : (
        <img
          src={value}
          alt="Slide illustration"
          onError={() => setImgError(true)}
          className="max-h-64 w-full object-contain block"
        />
      )}

      {/* Teacher overlay controls — visible on hover */}
      <div className={[
        'absolute inset-0 flex items-center justify-center gap-2',
        'bg-black/30 opacity-0 group-hover/img:opacity-100',
        'transition-opacity duration-200',
      ].join(' ')}>
        <button
          type="button"
          onClick={openEdit}
          className="flex items-center gap-1.5 rounded-lg bg-white/90 px-3 py-1.5 text-[12px] font-semibold text-slate-700 shadow hover:bg-white transition-colors"
        >
          <Pencil className="h-3 w-3" />
          Replace
        </button>
        <button
          type="button"
          onClick={remove}
          className="flex items-center gap-1.5 rounded-lg bg-white/90 px-3 py-1.5 text-[12px] font-semibold text-red-500 shadow hover:bg-white transition-colors"
        >
          <X className="h-3 w-3" />
          Remove
        </button>
      </div>

      {editing && (
        <ImagePopover
          inputRef={inputRef}
          value={inputVal}
          onChange={setInputVal}
          onConfirm={confirm}
          onCancel={cancel}
          absolute
        />
      )}
    </div>
  );
}

function ImagePopover({
  inputRef, value, onChange, onConfirm, onCancel, absolute = false,
}: {
  inputRef:  React.RefObject<HTMLInputElement>;
  value:     string;
  onChange:  (v: string) => void;
  onConfirm: () => void;
  onCancel:  () => void;
  absolute?: boolean;
}) {
  return (
    <div className={[
      absolute ? 'absolute bottom-2 left-2 right-2 z-10' : 'mt-2',
      'rounded-xl border border-slate-200 bg-white shadow-lg',
      'px-3 py-2.5 flex items-center gap-2',
    ].join(' ')}>
      <ImageIcon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
      <input
        ref={inputRef}
        type="url"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="https://…"
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); onConfirm(); }
          if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
        }}
        className="flex-1 min-w-0 text-[13px] text-slate-800 placeholder-slate-300 bg-transparent focus:outline-none"
      />
      <button
        type="button"
        onClick={onConfirm}
        aria-label="Confirm image URL"
        className="shrink-0 rounded-md p-1 text-teal-500 hover:bg-teal-50 hover:text-teal-700 transition-colors focus:outline-none"
      >
        <Check className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onCancel}
        aria-label="Cancel"
        className="shrink-0 rounded-md p-1 text-slate-300 hover:bg-slate-100 hover:text-slate-500 transition-colors focus:outline-none"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

// ─── EditableSlideCanvas ──────────────────────────────────────────────────────
// The single editing surface. Mirrors SlidesPlayer's card markup.

function EditableSlideCanvas({
  draft,
  onTitleChange,
  onBulletsChange,
  onImageChange,
}: {
  draft:           SlideDraft;
  onTitleChange:   (v: string)   => void;
  onBulletsChange: (v: string[]) => void;
  onImageChange:   (v: string)   => void;
}) {
  const hasBullets = draft.bullets.some(Boolean);
  const hasImage   = !!draft.image_url;

  return (
    <div className="min-h-[16rem] rounded-2xl border border-slate-200 bg-white px-7 py-7 shadow-sm relative">
      {/* Teacher badge */}
      <div className="absolute right-4 top-4 flex items-center gap-1 rounded-full bg-teal-50 px-2 py-0.5 border border-teal-100">
        <span className="h-1.5 w-1.5 rounded-full bg-teal-400" />
        <span className="text-[10px] font-semibold text-teal-600 tracking-wide uppercase">Editing</span>
      </div>

      {/* Counter badge — same as student runtime */}
      <div className="mb-5 flex items-center">
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold tabular-nums text-slate-500">
          <span className="text-slate-800">1</span>
          <span className="text-slate-300">/</span>
          <span>1</span>
        </span>
      </div>

      {/* Inline editable title */}
      <EditableTitle value={draft.title} onChange={onTitleChange} />

      {/* Content block */}
      <div className="space-y-5">
        {/* Image slot — always rendered (placeholder when empty) */}
        <EditableImageSlot value={draft.image_url} onChange={onImageChange} />

        {/* Bullets — always rendered */}
        <EditableBullets values={draft.bullets} onChange={onBulletsChange} />

        {/* Empty state hint when nothing is filled */}
        {!draft.title && !hasBullets && !hasImage && (
          <p className="text-sm italic text-slate-400 text-center py-4">
            Click any field above to start editing your slide.
          </p>
        )}
      </div>
    </div>
  );
}

// ─── AdvancedDrawer ───────────────────────────────────────────────────────────

function AdvancedDrawer({
  examples,
  exercise,
  onExamplesChange,
  onExerciseChange,
}: {
  examples:         string[];
  exercise:         string;
  onExamplesChange: (v: string[]) => void;
  onExerciseChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);

  const updateExample = (i: number, v: string) => {
    const arr = examples.length ? [...examples] : [''];
    arr[i] = v;
    onExamplesChange(arr);
  };
  const addExample = () => onExamplesChange([...examples, '']);
  const removeExample = (i: number) =>
    onExamplesChange(examples.filter((_, idx) => idx !== i));

  return (
    <div className="rounded-xl border border-slate-100 overflow-hidden bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-[11px] font-semibold text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors focus:outline-none"
      >
        <span>Advanced — examples &amp; exercise</span>
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 space-y-4 bg-slate-50/40 border-t border-slate-100">
          {/* Examples */}
          <div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Examples</p>
            <div className="space-y-1.5">
              {(examples.length ? examples : ['']).map((ex, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={ex}
                    onChange={(e) => updateExample(i, e.target.value)}
                    placeholder={`Example ${i + 1}…`}
                    className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[13px] text-slate-800 placeholder-slate-300 focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-100 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => removeExample(i)}
                    className="shrink-0 rounded-md p-1 text-slate-300 hover:bg-red-50 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addExample}
              className="mt-2 flex items-center gap-1 text-[11px] font-medium text-teal-600 hover:text-teal-700 transition-colors"
            >
              <Plus className="h-3 w-3" />
              Add example
            </button>
          </div>

          {/* Exercise */}
          <div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Exercise</p>
            <textarea
              value={exercise}
              onChange={(e) => onExerciseChange(e.target.value)}
              placeholder="Give students a short exercise…"
              rows={2}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-800 placeholder-slate-300 resize-none focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-100 transition-colors"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function SlideEditorStep({
  initialTitle = '',
  draft: initialDraft,
  onChange,
}: SlideEditorStepProps) {
  const [draft, setDraft] = useState<SlideDraft>(() =>
    initialDraft ?? { ...EMPTY_SLIDE_DRAFT, title: initialTitle, bullets: [''] },
  );

  const update = useCallback(<K extends keyof SlideDraft>(key: K, value: SlideDraft[K]) => {
    setDraft((prev) => {
      const next = { ...prev, [key]: value };
      onChange?.(next);
      return next;
    });
  }, [onChange]);

  return (
    <div className="mx-auto max-w-2xl space-y-4">

      {/* ── Inline-editing canvas (the hero) ──────────────────────────── */}
      <EditableSlideCanvas
        draft={draft}
        onTitleChange={(v)   => update('title', v)}
        onBulletsChange={(v) => update('bullets', v)}
        onImageChange={(v)   => update('image_url', v)}
      />

      {/* ── Advanced section (collapsed by default) ────────────────────── */}
      <AdvancedDrawer
        examples={draft.examples}
        exercise={draft.exercise}
        onExamplesChange={(v) => update('examples', v)}
        onExerciseChange={(v) => update('exercise', v)}
      />

      {/* ── Subtle hint ─────────────────────────────────────────────────── */}
      <p className="text-center text-[11px] text-slate-400 leading-relaxed">
        Edits are live.&ensp;Use{' '}
        <strong className="font-semibold text-slate-500">Save draft</strong> when you're ready.
      </p>

    </div>
  );
}