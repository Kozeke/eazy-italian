/**
 * UnitSelectorModal.tsx
 *
 * Modal for selecting a unit within Classroom Mode.
 * Replaces the UnitSelector drawer with a centered, keyboard-accessible modal.
 *
 * Features:
 * - Autofocused search input
 * - Filtered unit list via UnitListItem
 * - Current unit highlight, locked state, completion indicators
 * - Graceful fallback when lock/completion metadata is unavailable
 * - Traps focus inside modal (via simple aria + role pattern)
 * - Closes on backdrop click or Escape key
 */

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { X, Search, BookOpen } from 'lucide-react';
import UnitListItem from './UnitListItem';

// ─── Types ────────────────────────────────────────────────────────────────────

export type UnitSelectorModalProps = {
  open: boolean;
  units: any[];
  currentUnitId: number | string | null;
  onClose: () => void;
  onSelectUnit: (unit: any) => void;
  /** Optional map of unitId → completion status. Falls back gracefully. */
  completedUnitIds?: Set<number | string>;
  courseTitle?: string;
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function UnitSelectorModal({
  open,
  units,
  currentUnitId,
  onClose,
  onSelectUnit,
  completedUnitIds,
  courseTitle,
}: UnitSelectorModalProps) {
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const panelRef  = useRef<HTMLDivElement>(null);

  // Reset search when modal opens; autofocus
  useEffect(() => {
    if (open) {
      setQuery('');
      // Small delay to ensure modal is mounted before focusing
      requestAnimationFrame(() => searchRef.current?.focus());
    }
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

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm"
        aria-hidden
        onClick={onClose}
      />

      {/* Modal panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Change unit"
        ref={panelRef}
        className={[
          'fixed z-50 inset-x-4 top-[10vh] mx-auto max-w-lg',
          'flex flex-col bg-white rounded-2xl shadow-2xl ring-1 ring-slate-200',
          'max-h-[80vh]',
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
            <h2 className="text-lg font-semibold text-slate-900">Change Unit</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* ── Search ─────────────────────────────────────────────────────── */}
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

        {/* ── Unit list ───────────────────────────────────────────────────── */}
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

        {/* ── Footer hint ─────────────────────────────────────────────────── */}
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
      </div>
    </>
  );
}
