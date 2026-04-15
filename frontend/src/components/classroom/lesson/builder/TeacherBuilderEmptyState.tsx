/**
 * TeacherBuilderEmptyState.tsx
 *
 * Shown when a teacher opens a unit that has no content yet.
 * Uses the same PlayerFrame / lp-player-body shell as TeacherSlidesEditorPlayer
 * so dimensions and chrome match the slide editor classroom view.
 *
 * Props
 * ─────
 * onManual  — teacher chose to build manually (moves to 'manual-choice' stage)
 * onAI      — teacher chose AI-assisted generation (placeholder for next step)
 * unitTitle — displayed so the teacher knows which unit they're editing
 */

import {
  PlayerFrame,
  PlayerHeader,
} from '../flow/LessonPlayerShared';
import { Sparkles, PenLine, BookOpen } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TeacherBuilderEmptyStateProps {
  unitTitle?:  string;
  onManual:    () => void;
  onAI:        () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TeacherBuilderEmptyState({
  unitTitle,
  onManual,
  onAI,
}: TeacherBuilderEmptyStateProps) {
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex flex-col flex-1 min-h-0 lp-step-enter">
        <PlayerFrame type="slides" status="in_progress">
          <PlayerHeader
            type="slides"
            label="Create your lesson"
            // subtitle="Choose how you want to build this unit — same workspace as when you edit slides."
            status="in_progress"
            stepNum={1}
            total={1}
          />

          <div className="lp-player-body flex flex-col flex-1 min-h-0">
            <div className="flex flex-col flex-1 min-h-0 px-5 py-4 sm:px-7 pb-8">
              {/*
                Inner “classroom board” — distinct from the outer card so it
                reads like the teaching wall inside the same frame as the player.
              */}
              <div
                className={[
                  'flex flex-1 min-h-0 flex-col items-center justify-center',
                  'rounded-2xl border bg-gradient-to-br',
                  'from-[#f8fafb] via-[#EEF0FE]/50 to-slate-100/90',
                  'px-6 py-12 sm:py-16',
                ].join(' ')}
                style={{
                  borderColor: '#C7C9F9',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.85), 0 1px 2px rgba(108,111,239,0.06)',
                }}
              >
                <div className="w-full max-w-sm text-center">
                  <div
                    className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/90 shadow-sm"
                    style={{ border: '1px solid #EEF0FE' }}
                  >
                    <BookOpen className="h-8 w-8" style={{ color: '#6C6FEF' }} />
                  </div>

                  {unitTitle && (
                    <p className="text-[13px] font-semibold truncate" style={{ color: '#4F52C2' }}>
                      {unitTitle}
                    </p>
                  )}

                  <p className="mt-3 text-[14px] leading-relaxed text-slate-600">
                    Start building this unit directly in the classroom view.
                  </p>

                  <div className="mt-8 flex flex-col gap-3">
                    <button
                      type="button"
                      onClick={onManual}
                      className={[
                        'group flex w-full items-center gap-3.5 rounded-2xl border border-slate-200/90',
                        'bg-white/95 px-5 py-4 text-left shadow-sm transition-all duration-150',
                        'focus:outline-none',
                      ].join(' ')}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.borderColor = '#C7C9F9';
                        (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 4px 12px rgba(108,111,239,0.1)';
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.borderColor = '';
                        (e.currentTarget as HTMLButtonElement).style.boxShadow = '';
                      }}
                    >
                      <span
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition-colors group-hover:bg-[#EEF0FE] group-hover:text-[#6C6FEF]"
                      >
                        <PenLine className="h-4 w-4" />
                      </span>
                      <span className="flex flex-col text-left">
                        <span className="text-[14px] font-semibold text-slate-800">Manually</span>
                        <span className="text-[12px] text-slate-400">Add slides, tasks, tests, and videos</span>
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={onAI}
                      className={[
                        'group flex w-full items-center gap-3.5 rounded-2xl border border-slate-200/90',
                        'bg-white/95 px-5 py-4 text-left shadow-sm transition-all duration-150',
                        'hover:border-violet-300 hover:bg-white hover:shadow-md',
                        'focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400',
                      ].join(' ')}
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition-colors group-hover:bg-violet-100 group-hover:text-violet-600">
                        <Sparkles className="h-4 w-4" />
                      </span>
                      <span className="flex flex-col text-left">
                        <span className="text-[14px] font-semibold text-slate-800">Using AI</span>
                        <span className="text-[12px] text-slate-400">Generate lesson content automatically</span>
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </PlayerFrame>
      </div>
    </div>
  );
}