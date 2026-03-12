/**
 * TeacherLiveControls.tsx
 *
 * Floating control panel visible only to the teacher when in a classroom.
 *
 * ── Layout ────────────────────────────────────────────────────────────────────
 * Collapsed: "Go Live" pill button in the bottom-right.
 * Expanded (session active): a compact panel with:
 *   • Session status + student count
 *   • Slide prev / next
 *   • Section switcher: Slides / Task / Test
 *   • End session button
 *
 * Intentionally small and non-intrusive so the teacher can still see
 * the slide content while managing navigation.
 */

import React, { useState } from 'react';
import {
  Radio,
  Users,
  ChevronLeft,
  ChevronRight,
  Layers,
  FileText,
  ClipboardList,
  Square,
  Loader2,
  Wifi,
  WifiOff,
  Activity,
} from 'lucide-react';
import { useLiveSession } from './LiveSessionProvider';
import type { LiveSection } from './liveSession.types';

// ─── Props ────────────────────────────────────────────────────────────────────

export interface TeacherLiveControlsProps {
  /** Id of the currently viewed unit — used when starting the session */
  currentUnitId: number | null;
  /** Total slides in the current unit (for disabling next at end) */
  totalSlides:   number;
  /** Whether the current unit has a task */
  hasTask?:      boolean;
  /** Whether the current unit has a test */
  hasTest?:      boolean;
}

// ─── Connection badge ─────────────────────────────────────────────────────────

function ConnectionDot({ state }: { state: string }) {
  if (state === 'connected') return (
    <span title="WebSocket connected" className="flex h-2 w-2 rounded-full bg-emerald-400">
      <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-emerald-400 opacity-75" />
    </span>
  );
  if (state === 'polling') return (
    <span title="Polling mode" className="flex h-2 w-2 rounded-full bg-amber-400" />
  );
  return <span title="Disconnected" className="flex h-2 w-2 rounded-full bg-slate-300" />;
}

// ─── Section tab ──────────────────────────────────────────────────────────────

function SectionTab({
  label, icon: Icon, section, active, disabled, onClick,
}: {
  label:    string;
  icon:     React.ElementType;
  section:  LiveSection;
  active:   boolean;
  disabled: boolean;
  onClick:  () => void;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={[
        'flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium transition-all',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400',
        'disabled:cursor-not-allowed disabled:opacity-40',
        active
          ? 'bg-primary-600 text-white shadow-sm'
          : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900',
      ].join(' ')}
      aria-pressed={active}
      title={`Switch to ${label}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function TeacherLiveControls({
  currentUnitId,
  totalSlides,
  hasTask = false,
  hasTest = false,
}: TeacherLiveControlsProps) {
  const { session, actions } = useLiveSession();
  const [starting, setStarting] = useState(false);

  const { sessionActive, currentSlide, activeSection, studentCount, connectionState } = session;

  // ── Start session ────────────────────────────────────────────────────────
  const handleStart = async () => {
    if (!currentUnitId) return;
    setStarting(true);
    try {
      await actions.startSession(currentUnitId, 0);
    } finally {
      setStarting(false);
    }
  };

  // ── Slide navigation ─────────────────────────────────────────────────────
  const canPrev = currentSlide > 0;
  const canNext = currentSlide < totalSlides - 1;

  const handlePrev = () => {
    if (canPrev) actions.broadcastSlide(currentSlide - 1);
  };
  const handleNext = () => {
    if (canNext) actions.broadcastSlide(currentSlide + 1);
  };

  // ── Section switch ───────────────────────────────────────────────────────
  const handleSection = (s: LiveSection) => {
    if (s !== activeSection) actions.broadcastSection(s);
  };

  // ─────────────────────────────────────────────────────────────────────────
  // NOT live — show the "Go Live" button
  // ─────────────────────────────────────────────────────────────────────────

  if (!sessionActive) {
    return (
      <div className="fixed bottom-6 right-6 z-50">
        <button
          onClick={handleStart}
          disabled={starting || !currentUnitId}
          className={[
            'group flex items-center gap-2.5 rounded-full px-5 py-3 text-sm font-semibold shadow-lg',
            'bg-primary-600 text-white transition-all duration-200',
            'hover:bg-primary-700 hover:shadow-xl hover:scale-105',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2',
            'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100',
          ].join(' ')}
        >
          {starting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Radio className="h-4 w-4 transition-transform group-hover:scale-110" />
          )}
          {starting ? 'Starting…' : 'Start Live Lesson'}
        </button>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // LIVE — expanded control panel
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div
      className={[
        'fixed bottom-6 right-6 z-50',
        'w-72 rounded-2xl border border-slate-200 bg-white shadow-2xl ring-1 ring-slate-100',
        'overflow-hidden',
      ].join(' ')}
    >
      {/* ── Header bar ────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between bg-primary-600 px-4 py-3">
        <div className="flex items-center gap-2.5">
          {/* Live pulse dot */}
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
          </span>
          <span className="text-sm font-semibold text-white">Live Mode</span>
        </div>
        <div className="flex items-center gap-3">
          {/* Connection indicator */}
          <div className="relative flex items-center">
            <ConnectionDot state={connectionState} />
          </div>
          {/* Student count */}
          <div className="flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-medium text-white">
            <Users className="h-3 w-3" />
            <span>{studentCount}</span>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* ── Slide controls ──────────────────────────────────────────────── */}
        {activeSection === 'slides' && totalSlides > 0 && (
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
              Slide Navigation
            </p>
            <div className="flex items-center gap-2">
              <button
                disabled={!canPrev}
                onClick={handlePrev}
                className={[
                  'flex flex-1 items-center justify-center gap-1.5 rounded-lg border py-2 text-sm font-medium transition-all',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400',
                  canPrev
                    ? 'border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
                    : 'border-slate-100 text-slate-300 cursor-not-allowed',
                ].join(' ')}
              >
                <ChevronLeft className="h-4 w-4" />
                Prev
              </button>

              <div className="flex flex-col items-center px-1 min-w-[3rem]">
                <span className="text-base font-bold tabular-nums text-slate-900">
                  {currentSlide + 1}
                </span>
                <span className="text-[10px] text-slate-400">of {totalSlides}</span>
              </div>

              <button
                disabled={!canNext}
                onClick={handleNext}
                className={[
                  'flex flex-1 items-center justify-center gap-1.5 rounded-lg border py-2 text-sm font-medium transition-all',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400',
                  canNext
                    ? 'border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
                    : 'border-slate-100 text-slate-300 cursor-not-allowed',
                ].join(' ')}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* ── Section switcher ────────────────────────────────────────────── */}
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
            Learning Stage
          </p>
          <div className="flex gap-1.5">
            <SectionTab
              label="Slides" icon={Layers}
              section="slides" active={activeSection === 'slides'}
              disabled={totalSlides === 0}
              onClick={() => handleSection('slides')}
            />
            <SectionTab
              label="Task" icon={FileText}
              section="task" active={activeSection === 'task'}
              disabled={!hasTask}
              onClick={() => handleSection('task')}
            />
            <SectionTab
              label="Test" icon={ClipboardList}
              section="test" active={activeSection === 'test'}
              disabled={!hasTest}
              onClick={() => handleSection('test')}
            />
          </div>
        </div>

        {/* ── Status row ──────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between border-t border-slate-100 pt-3">
          <span className="flex items-center gap-1.5 text-xs text-slate-400">
            <Activity className="h-3.5 w-3.5" />
            {connectionState === 'polling' ? 'Polling' : 'WebSocket'}
          </span>

          <button
            onClick={actions.endSession}
            className={[
              'flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5',
              'text-xs font-medium text-red-600 transition-colors',
              'hover:bg-red-50 hover:border-red-300',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400',
            ].join(' ')}
          >
            <Square className="h-3 w-3 fill-red-500" />
            End Session
          </button>
        </div>
      </div>
    </div>
  );
}
