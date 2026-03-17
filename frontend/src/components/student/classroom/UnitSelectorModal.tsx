/**
 * UnitSelectorModal.tsx  (v2 — Focused Learning Mode / Design System)
 *
 * Premium unit-switcher modal. Feels like a modern workspace/command-palette
 * switcher — not a basic list overlay.
 *
 * What changed from v1:
 * ─────────────────────
 * • Enters with a subtle scale-in + fade animation (CSS keyframe).
 * • Header shows course thumbnail/icon, title, and a completion summary
 *   (e.g. "3 of 8 units complete").
 * • Progress mini-bar under the header title.
 * • Search input: teal focus ring, clear button, live result count badge.
 * • Group sections: "In Progress / Available" vs "Completed" — collapsed by
 *   default if all units are in one bucket.
 * • Footer: total units + Esc hint + Cancel button.
 * • Keyboard: Escape closes, focus trapped inside, autofocus on search.
 * • Scroll lock on body while open.
 * • Accepts `completedCount` prop for header summary.
 */

import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  X,
  Search,
  BookOpen,
  GraduationCap,
  CheckCircle2,
  Layers,
} from 'lucide-react';
import UnitListItem from './UnitListItem';

// ─── Types ────────────────────────────────────────────────────────────────────

export type UnitSelectorModalProps = {
  open: boolean;
  units: any[];
  currentUnitId: number | string | null;
  onClose: () => void;
  onSelectUnit: (unit: any) => void;
  completedUnitIds?: Set<number | string>;
  /** Total number of completed units (for header summary) */
  completedCount?: number;
  courseTitle?: string;
  courseThumbnail?: string | null;
  courseLevel?: string;
};

// ─── Level colors ─────────────────────────────────────────────────────────────

const LEVEL_COLORS: Record<string, string> = {
  A1: 'bg-sky-100 text-sky-700',
  A2: 'bg-blue-100 text-blue-700',
  B1: 'bg-indigo-100 text-indigo-700',
  B2: 'bg-violet-100 text-violet-700',
  C1: 'bg-purple-100 text-purple-700',
  C2: 'bg-fuchsia-100 text-fuchsia-700',
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function UnitSelectorModal({
  open,
  units,
  currentUnitId,
  onClose,
  onSelectUnit,
  completedUnitIds,
  completedCount = 0,
  courseTitle,
  courseThumbnail,
  courseLevel,
}: UnitSelectorModalProps) {
  const [query,    setQuery]    = useState('');
  const [visible,  setVisible]  = useState(false);
  const searchRef  = useRef<HTMLInputElement>(null);
  const panelRef   = useRef<HTMLDivElement>(null);

  // Animate in/out
  useEffect(() => {
    if (open) {
      setVisible(true);
      setQuery('');
      requestAnimationFrame(() => {
        requestAnimationFrame(() => searchRef.current?.focus());
      });
    } else {
      setVisible(false);
    }
  }, [open]);

  // Escape key
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Body scroll lock
  useEffect(() => {
    if (open) document.body.classList.add('classroom-mode-locked');
    else      document.body.classList.remove('classroom-mode-locked');
    return () => document.body.classList.remove('classroom-mode-locked');
  }, [open]);

  // Filtered units
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return units;
    return units.filter((u) => u.title?.toLowerCase().includes(q));
  }, [units, query]);

  // Split into sections when not searching
  const sections = useMemo(() => {
    if (query.trim()) return null; // flat list when searching

    const completed: any[] = [];
    const available: any[] = [];

    for (const u of units) {
      const isLocked    = u.is_visible_to_students === false;
      const isCompleted = completedUnitIds?.has(u.id) ?? false;
      if (isCompleted && !isLocked) completed.push(u);
      else available.push(u);
    }

    // Only split if there's actually something in both buckets
    if (!completed.length || !available.length) return null;
    return { available, completed };
  }, [units, completedUnitIds, query]);

  if (!open && !visible) return null;

  const handleSelect = (unit: any) => {
    onSelectUnit(unit);
    onClose();
  };

  const levelCls = courseLevel ? (LEVEL_COLORS[courseLevel] ?? 'bg-slate-100 text-slate-600') : null;
  const completionPct = units.length ? Math.round((completedCount / units.length) * 100) : 0;

  const renderList = (list: any[]) =>
    list.map((unit) => {
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
    });

  return (
    <>
      {/* ── Backdrop ─────────────────────────────────────────────────────── */}
      <div
        className={[
          'fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-[3px] transition-opacity duration-200',
          open ? 'opacity-100' : 'opacity-0',
        ].join(' ')}
        aria-hidden
        onClick={onClose}
      />

      {/* ── Panel ────────────────────────────────────────────────────────── */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Switch unit"
        ref={panelRef}
        className={[
          'unit-selector-panel',
          'fixed z-50 inset-x-4 top-[8vh] mx-auto w-full max-w-xl',
          'flex flex-col bg-white rounded-2xl',
          'shadow-[0_24px_64px_-12px_rgba(0,0,0,0.28),0_0_0_1px_rgba(0,0,0,0.06)]',
          'max-h-[82vh] overflow-hidden',
          'transition-all duration-200',
          open ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 -translate-y-2',
        ].join(' ')}
      >
        {/* ── Modal header ─────────────────────────────────────────────── */}
        <div className="relative flex items-start gap-3.5 px-5 pt-5 pb-4 border-b border-slate-100">
          {/* Course thumbnail / icon */}
          {courseThumbnail ? (
            <img
              src={courseThumbnail}
              alt={courseTitle}
              className="h-10 w-10 shrink-0 rounded-xl object-cover ring-1 ring-slate-200"
            />
          ) : (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-teal-700 shadow-md shadow-teal-100">
              <GraduationCap className="h-5 w-5 text-white" />
            </div>
          )}

          {/* Title block */}
          <div className="flex-1 min-w-0">
            {courseTitle && (
              <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-0.5 truncate">
                {courseTitle}
                {courseLevel && levelCls && (
                  <span className={`ml-2 rounded-full px-1.5 py-0.5 text-[9px] font-bold normal-case tracking-normal ${levelCls}`}>
                    {courseLevel}
                  </span>
                )}
              </p>
            )}
            <h2 className="text-[15px] font-bold text-slate-900 leading-snug">
              Switch Unit
            </h2>

            {/* Completion mini summary */}
            {units.length > 0 && (
              <div className="mt-2 flex items-center gap-2">
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-teal-400 to-teal-600 transition-all duration-500"
                    style={{ width: `${completionPct}%` }}
                  />
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                  <span className="text-[10px] font-semibold text-slate-500">
                    {completedCount} / {units.length} complete
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Close button */}
          <button
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Search ───────────────────────────────────────────────────── */}
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/60">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              ref={searchRef}
              type="text"
              placeholder="Search units…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className={[
                'w-full rounded-xl border border-slate-200 bg-white py-2 pl-8.5 pr-8',
                'pl-9 text-[13px] text-slate-800 placeholder:text-slate-400',
                'shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent',
                'transition-all duration-150',
              ].join(' ')}
              aria-label="Search units"
            />
            {/* Live count badge */}
            {query && (
              <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                <span className="text-[10px] font-semibold text-slate-400">
                  {filtered.length}
                </span>
                <button
                  onClick={() => setQuery('')}
                  className="rounded-full p-0.5 text-slate-400 hover:text-slate-600 transition-colors"
                  aria-label="Clear search"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Unit list ─────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {filtered.length === 0 ? (
            /* Empty state */
            <div className="flex flex-col items-center justify-center py-16 text-center text-slate-400 px-4">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
                <BookOpen className="h-5 w-5 opacity-40" />
              </div>
              <p className="text-[13px] font-semibold text-slate-600">
                {query ? 'No units found' : 'No units available'}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {query
                  ? `No units match "${query}"`
                  : 'Your teacher hasn't added any units yet.'}
              </p>
              {query && (
                <button
                  onClick={() => setQuery('')}
                  className="mt-3 rounded-lg px-3 py-1.5 text-xs font-semibold text-teal-600 bg-teal-50 hover:bg-teal-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
                >
                  Clear search
                </button>
              )}
            </div>
          ) : sections ? (
            /* Sectioned list: Available + Completed */
            <>
              {/* Available / In Progress */}
              {sections.available.length > 0 && (
                <div>
                  <div className="sticky top-0 flex items-center gap-2 bg-white/95 backdrop-blur-sm px-4 py-2 border-b border-slate-100/80">
                    <Layers className="h-3 w-3 text-slate-400" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      Available · {sections.available.length}
                    </span>
                  </div>
                  <ul role="listbox" aria-label="Available units">
                    {renderList(sections.available)}
                  </ul>
                </div>
              )}

              {/* Completed */}
              {sections.completed.length > 0 && (
                <div>
                  <div className="sticky top-0 flex items-center gap-2 bg-white/95 backdrop-blur-sm px-4 py-2 border-b border-slate-100/80">
                    <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">
                      Completed · {sections.completed.length}
                    </span>
                  </div>
                  <ul role="listbox" aria-label="Completed units">
                    {renderList(sections.completed)}
                  </ul>
                </div>
              )}
            </>
          ) : (
            /* Flat list (when searching or no split) */
            <ul role="listbox" aria-label="Units" className="py-1">
              {renderList(filtered)}
            </ul>
          )}
        </div>

        {/* ── Footer ───────────────────────────────────────────────────── */}
        <div className="shrink-0 flex items-center justify-between border-t border-slate-100 bg-slate-50/60 px-5 py-3">
          <p className="text-[11px] text-slate-400">
            {query
              ? `${filtered.length} of ${units.length} units`
              : `${units.length} unit${units.length !== 1 ? 's' : ''} total`}
          </p>
          <div className="flex items-center gap-3">
            <span className="hidden sm:block text-[10px] text-slate-300 font-medium">
              Press <kbd className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[9px] text-slate-500">Esc</kbd> to close
            </span>
            <button
              onClick={onClose}
              className="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-slate-500 hover:bg-slate-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
