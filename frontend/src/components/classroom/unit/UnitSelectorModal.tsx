/**
 * UnitSelectorModal.tsx  (v2 — Teacher First-Run Empty State)
 *
 * What changed from v1:
 * ─────────────────────
 * • Added `isTeacher` prop.
 * • When isTeacher === true AND units.length === 0, the modal renders a
 *   teacher-first empty state instead of the unit list / search bar.
 * • Modal modes (internal):
 *     "list"                — default student/teacher-with-units view
 *     "empty-teacher"       — no units + teacher: shows CTA buttons
 *     "manual-placeholder"  — teacher clicked "Create unit manually"
 *     "ai-placeholder"      — teacher clicked "Create unit with AI"
 * • creatingUnitMode state is exposed upward via `onCreateUnit` callback
 *   so ClassroomPage can react to it in a future step.
 * • Student behavior is completely unchanged.
 * • Header title adapts: "Change Unit" vs "Your Course" depending on context.
 * • Close button always present; teacher empty-state skips the footer hint.
 */

import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  X,
  Search,
  BookOpen,
  PenLine,
  Sparkles,
  ArrowLeft,
  Layers,
  Wand2,
} from 'lucide-react';
import UnitListItem from './UnitListItem';

// ─── Types ────────────────────────────────────────────────────────────────────

export type CreatingUnitMode = 'manual' | 'ai' | null;

export type UnitSelectorModalProps = {
  open:           boolean;
  units:          any[];
  currentUnitId:  number | string | null;
  onClose:        () => void;
  onSelectUnit:   (unit: any) => void;
  /** Optional map of unitId → completion status. Falls back gracefully. */
  completedUnitIds?: Set<number | string>;
  courseTitle?:   string;
  /** When true, enables teacher-mode empty state when no units exist. */
  isTeacher?:     boolean;
  /**
   * Fired when the teacher picks a creation mode.
   * Receives null when they cancel back to the empty state.
   * No actual creation happens here yet — UI only.
   */
  onCreateUnit?:  (mode: CreatingUnitMode) => void;
};

// ─── Modal mode derivation ────────────────────────────────────────────────────

type ModalMode = 'list' | 'empty-teacher' | 'manual-placeholder' | 'ai-placeholder';

function deriveMode(
  isTeacher: boolean,
  hasUnits:  boolean,
  creating:  CreatingUnitMode,
): ModalMode {
  if (!isTeacher || hasUnits) return 'list';
  if (creating === 'manual') return 'manual-placeholder';
  if (creating === 'ai')     return 'ai-placeholder';
  return 'empty-teacher';
}

// ─── Teacher empty state ──────────────────────────────────────────────────────

function TeacherEmptyState({
  onManual,
  onAI,
}: {
  onManual: () => void;
  onAI:     () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-8 py-14 text-center">
      {/* Icon cluster */}
      <div className="relative mb-6">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-teal-50 ring-1 ring-teal-100">
          <Layers className="h-8 w-8 text-teal-500" />
        </div>
        <div className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-amber-50 ring-1 ring-amber-100">
          <Sparkles className="h-3.5 w-3.5 text-amber-500" />
        </div>
      </div>

      {/* Heading */}
      <h3 className="text-[17px] font-semibold text-slate-900 leading-snug">
        Start building your course
      </h3>
      <p className="mt-2 max-w-[260px] text-[13px] text-slate-500 leading-relaxed">
        Create your first unit manually or let AI generate it for you.
      </p>

      {/* CTA buttons */}
      <div className="mt-7 flex w-full flex-col gap-3">
        <button
          onClick={onManual}
          className={[
            'group flex w-full items-center gap-3 rounded-xl border border-slate-200',
            'bg-white px-4 py-3.5 text-left transition-all duration-150',
            'hover:border-teal-300 hover:bg-teal-50/60 hover:shadow-sm',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400',
          ].join(' ')}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-50 transition-colors group-hover:bg-teal-100">
            <PenLine className="h-4 w-4 text-teal-600" />
          </span>
          <span className="flex-1">
            <span className="block text-[13px] font-semibold text-slate-800 group-hover:text-teal-800">
              Create unit manually
            </span>
            <span className="block text-[11px] text-slate-400 mt-0.5">
              Write titles, add slides, tasks and tests yourself
            </span>
          </span>
        </button>

        <button
          onClick={onAI}
          className={[
            'group flex w-full items-center gap-3 rounded-xl border border-slate-200',
            'bg-white px-4 py-3.5 text-left transition-all duration-150',
            'hover:border-amber-300 hover:bg-amber-50/60 hover:shadow-sm',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400',
          ].join(' ')}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 transition-colors group-hover:bg-amber-100">
            <Wand2 className="h-4 w-4 text-amber-600" />
          </span>
          <span className="flex-1">
            <span className="block text-[13px] font-semibold text-slate-800 group-hover:text-amber-800">
              Create unit with AI
            </span>
            <span className="block text-[11px] text-slate-400 mt-0.5">
              Generate a complete unit from a topic or learning goal
            </span>
          </span>
        </button>
      </div>
    </div>
  );
}

// ─── Placeholder states ───────────────────────────────────────────────────────

function CreationPlaceholder({
  mode,
  onBack,
}: {
  mode: 'manual' | 'ai';
  onBack: () => void;
}) {
  const isAI = mode === 'ai';
  return (
    <div className="flex flex-col items-center justify-center px-8 py-14 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-50 ring-1 ring-slate-200 mb-5">
        {isAI
          ? <Wand2  className="h-8 w-8 text-amber-400" />
          : <PenLine className="h-8 w-8 text-teal-400" />
        }
      </div>
      <h3 className="text-[15px] font-semibold text-slate-800">
        {isAI ? 'AI Unit Generation' : 'Manual Unit Creation'}
      </h3>
      <p className="mt-2 max-w-[240px] text-[12px] text-slate-400 leading-relaxed">
        {isAI
          ? 'The AI generation form will appear here in the next step.'
          : 'The unit creation form will appear here in the next step.'}
      </p>
      <p className="mt-1 text-[11px] font-medium text-slate-300 uppercase tracking-wide">
        Coming soon
      </p>

      <button
        onClick={onBack}
        className={[
          'mt-8 inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[12px] font-medium',
          'text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400',
        ].join(' ')}
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back
      </button>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function UnitSelectorModal({
  open,
  units,
  currentUnitId,
  onClose,
  onSelectUnit,
  completedUnitIds,
  courseTitle,
  isTeacher = false,
  onCreateUnit,
}: UnitSelectorModalProps) {
  const [query,        setQuery]        = useState('');
  const [creatingMode, setCreatingMode] = useState<CreatingUnitMode>(null);

  const searchRef = useRef<HTMLInputElement>(null);
  const panelRef  = useRef<HTMLDivElement>(null);

  const mode = deriveMode(isTeacher, units.length > 0, creatingMode);

  // Reset state when modal opens; autofocus search (only in list mode)
  useEffect(() => {
    if (open) {
      setQuery('');
      setCreatingMode(null);
      if (mode === 'list') {
        requestAnimationFrame(() => searchRef.current?.focus());
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Lock body scroll while open
  useEffect(() => {
    if (open) {
      document.body.classList.add('classroom-mode-locked');
    } else {
      document.body.classList.remove('classroom-mode-locked');
    }
    return () => document.body.classList.remove('classroom-mode-locked');
  }, [open]);

  // Filtered + ordered units
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return units;
    return units.filter((u) => u.title?.toLowerCase().includes(q));
  }, [units, query]);

  if (!open) return null;

  const handleSelect = (unit: any) => {
    onSelectUnit(unit);
    onClose();
  };

  const handlePickMode = (picked: 'manual' | 'ai') => {
    if (picked === 'manual') {
      // Hand control straight to ClassroomPage — do not trap in modal placeholder.
      onCreateUnit?.('manual');
      onClose();
      return;
    }
    // AI still uses modal placeholder until the AI wizard is built.
    setCreatingMode(picked);
    onCreateUnit?.(picked);
  };

  const handleBackToEmpty = () => {
    setCreatingMode(null);
    onCreateUnit?.(null);
  };

  // ── Header label ─────────────────────────────────────────────────────────
  const headerTitle =
    mode === 'empty-teacher' ? 'Course setup' :
    mode === 'manual-placeholder' ? 'New unit' :
    mode === 'ai-placeholder' ? 'Generate with AI' :
    'Change Unit';

  // ── Prevent backdrop close for placeholder states (accidental dismiss) ───
  const handleBackdropClick = () => {
    if (mode === 'manual-placeholder' || mode === 'ai-placeholder') return;
    onClose();
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm"
        aria-hidden
        onClick={handleBackdropClick}
      />

      {/* Modal panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={headerTitle}
        ref={panelRef}
        className={[
          'fixed z-50 inset-x-4 top-[10vh] mx-auto max-w-lg',
          'flex flex-col bg-white rounded-2xl shadow-2xl ring-1 ring-slate-200',
          mode === 'list' ? 'max-h-[80vh]' : 'max-h-fit',
        ].join(' ')}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between px-5 pt-5 pb-4 border-b border-slate-100">
          <div>
            {courseTitle && (
              <p className="text-xs font-medium uppercase tracking-widest text-slate-400 mb-0.5">
                {courseTitle}
              </p>
            )}
            <h2 className="text-lg font-semibold text-slate-900">{headerTitle}</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* ── Body: switch on mode ────────────────────────────────────────── */}
        {mode === 'empty-teacher' && (
          <TeacherEmptyState
            onManual={() => handlePickMode('manual')}
            onAI={() => handlePickMode('ai')}
          />
        )}

        {(mode === 'manual-placeholder' || mode === 'ai-placeholder') && (
          <CreationPlaceholder
            mode={mode === 'ai-placeholder' ? 'ai' : 'manual'}
            onBack={handleBackToEmpty}
          />
        )}

        {mode === 'list' && (
          <>
            {/* ── Search ───────────────────────────────────────────────── */}
            <div className="px-5 py-3 border-b border-slate-100">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  ref={searchRef}
                  type="text"
                  placeholder="Search units…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className={[
                    'w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3',
                    'text-sm text-slate-800 placeholder:text-slate-400',
                    'focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent',
                    'transition-all',
                  ].join(' ')}
                  aria-label="Search units"
                />
              </div>
            </div>

            {/* ── Unit list ─────────────────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto overscroll-contain">
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center text-slate-400">
                  <BookOpen className="mb-3 h-10 w-10 opacity-20" />
                  <p className="text-sm font-medium">
                    {query ? 'No units match your search' : 'No units available yet'}
                  </p>
                  {query && (
                    <button
                      onClick={() => setQuery('')}
                      className="mt-2 text-xs text-primary-600 hover:underline"
                    >
                      Clear search
                    </button>
                  )}
                </div>
              ) : (
                <ul
                  className="divide-y divide-slate-100 py-1"
                  role="listbox"
                  aria-label="Available units"
                >
                  {filtered.map((unit) => {
                    const isCurrent   = String(unit.id) === String(currentUnitId);
                    const isCompleted = completedUnitIds?.has(unit.id) ?? false;
                    const isLocked    = unit.is_visible_to_students === false;

                    return (
                      <UnitListItem
                        key={unit.id}
                        unit={unit}
                        isCurrent={isCurrent}
                        isCompleted={isCompleted}
                        isLocked={isLocked}
                        onClick={() => !isLocked && handleSelect(unit)}
                      />
                    );
                  })}
                </ul>
              )}
            </div>

            {/* ── Footer hint ───────────────────────────────────────────── */}
            <div className="border-t border-slate-100 px-5 py-3 flex items-center justify-between">
              <p className="text-xs text-slate-400">
                {filtered.length} of {units.length} unit{units.length !== 1 ? 's' : ''}
              </p>
              <button
                onClick={onClose}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}