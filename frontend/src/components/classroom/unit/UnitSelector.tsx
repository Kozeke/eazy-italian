/**
 * UnitSelector.tsx  (v2)
 *
 * Slide-in drawer listing all units for the current course.
 * Uses the ClassroomUnit type from useClassroom — no independent fetching.
 *
 * content_count shape mirrors the exact field returned by unitsApi:
 *   { videos, tasks, tests, published_videos, published_tasks, published_tests }
 */

import React from 'react';
import { X, BookOpen, CheckCircle2, Lock } from 'lucide-react';
import type { ClassroomUnit } from '../../hooks/useClassroom';

// ─── Props ────────────────────────────────────────────────────────────────────

interface UnitSelectorProps {
  isOpen: boolean;
  units: ClassroomUnit[];
  currentUnitId?: number | null;
  courseTitle?: string;
  onSelect: (unit: ClassroomUnit) => void;
  onClose: () => void;
}

// ─── Level colors (same palette as rest of app) ───────────────────────────────

const LEVEL_COLORS: Record<string, string> = {
  A1: 'bg-sky-100 text-sky-700',
  A2: 'bg-blue-100 text-blue-700',
  B1: 'bg-indigo-100 text-indigo-700',
  B2: 'bg-violet-100 text-violet-700',
  C1: 'bg-purple-100 text-purple-700',
  C2: 'bg-fuchsia-100 text-fuchsia-700',
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function UnitSelector({
  isOpen,
  units,
  currentUnitId,
  courseTitle,
  onSelect,
  onClose,
}: UnitSelectorProps) {
  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />

      {/* Drawer */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Select a unit"
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col bg-white shadow-xl ring-1 ring-slate-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              {courseTitle ?? 'Course'}
            </p>
            <h2 className="text-base font-semibold text-slate-900">Choose a unit</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
            aria-label="Close unit selector"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Unit list */}
        <div className="flex-1 overflow-y-auto">
          {units.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center text-slate-400">
              <BookOpen className="mb-3 h-10 w-10 opacity-25" />
              <p className="text-sm">No units available yet.</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {units.map((unit) => {
                const isCurrent = unit.id === currentUnitId;
                const isLocked  = unit.is_visible_to_students === false;
                const levelCls  = unit.level
                  ? (LEVEL_COLORS[unit.level] ?? 'bg-slate-100 text-slate-600')
                  : null;

                // Build content summary from the real API field shape
                const cc = unit.content_count;
                const contentParts: string[] = [];
                if (cc) {
                  if (cc.videos > 0)
                    contentParts.push(`${cc.published_videos ?? cc.videos}/${cc.videos} vid`);
                  if (cc.tasks > 0)
                    contentParts.push(`${cc.published_tasks ?? cc.tasks}/${cc.tasks} task`);
                  if (cc.tests > 0)
                    contentParts.push(`${cc.published_tests ?? cc.tests}/${cc.tests} test`);
                }

                return (
                  <li key={unit.id}>
                    <button
                      disabled={isLocked}
                      onClick={() => {
                        onSelect(unit);
                        onClose();
                      }}
                      className={[
                        'group w-full px-5 py-3.5 text-left transition-colors',
                        'focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-400',
                        'disabled:cursor-not-allowed disabled:opacity-40',
                        isCurrent ? 'bg-primary-50' : 'hover:bg-slate-50',
                      ].join(' ')}
                    >
                      <div className="flex items-start gap-3">
                        {/* Order bubble */}
                        <span
                          className={[
                            'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                            isCurrent
                              ? 'bg-primary-600 text-white'
                              : 'bg-slate-100 text-slate-600 group-hover:bg-slate-200',
                          ].join(' ')}
                        >
                          {unit.order_index}
                        </span>

                        <div className="min-w-0 flex-1">
                          {/* Title + level */}
                          <div className="flex items-center gap-2">
                            <span
                              className={[
                                'truncate text-sm font-medium',
                                isCurrent ? 'text-primary-700' : 'text-slate-800',
                              ].join(' ')}
                            >
                              {unit.title}
                            </span>
                            {levelCls && (
                              <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${levelCls}`}>
                                {unit.level}
                              </span>
                            )}
                          </div>

                          {/* Content summary */}
                          {contentParts.length > 0 && (
                            <p className="mt-0.5 text-xs text-slate-400">
                              {contentParts.join(' · ')}
                            </p>
                          )}
                        </div>

                        {/* Right icon */}
                        <span className="mt-0.5 shrink-0">
                          {isLocked ? (
                            <Lock className="h-4 w-4 text-slate-300" />
                          ) : isCurrent ? (
                            <BookOpen className="h-4 w-4 text-primary-400" />
                          ) : unit.status === 'published' ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                          ) : null}
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>
    </>
  );
}
