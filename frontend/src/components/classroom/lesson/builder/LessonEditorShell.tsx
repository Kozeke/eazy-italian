/**
 * LessonEditorShell.tsx  (v7 — test editor inside slide/video shell)
 *
 * Changes from v5:
 * ─────────────────
 * • VideoEditorFrame now accepts an optional `initialDraft` prop so existing
 *   videos can be loaded into the editor with their current title / url /
 *   description pre-filled.  LessonWorkspace passes this via the new
 *   `initialVideoDraft` prop on LessonEditorShell.
 *
 * • VideoEditorStep no longer uses the old two-column form layout.  It now
 *   renders a slide-style editor card (title → thumbnail preview → description)
 *   that matches the PlayerFrame proportions used by slide creation.
 *
 * • The PlayerFrame body for video now stretches to fill available vertical
 *   space so the preview area is prominent (matches slide preview height).
 *
 * • All other editor frames (task, test) are unchanged from v5.
 * • Public API: new optional prop `initialVideoDraft?: VideoDraft`.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { ChevronLeft, Save } from 'lucide-react';

import type { ActiveBuilderType } from '../lessonMode.types';

import {
  PlayerFrame,
  PlayerHeader,
} from '../flow/LessonPlayerShared';

import VideoEditorStep, {
  type VideoDraft,
  EMPTY_VIDEO_DRAFT,
} from '../editors/VideoEditorStep';

import TaskEditorStep, {
  type TaskDraft,
  EMPTY_TASK_DRAFT,
} from '../editors/TaskEditorStep';

import TestEditorStep, {
  type TestDraft,
  EMPTY_TEST_DRAFT,
} from '../editors/TestEditorStep';

import type { SlideDraft } from '../editors/SlideEditorStep';

// ─── Draft union ──────────────────────────────────────────────────────────────

export type EditorDraft =
  | { type: 'slides'; draft: SlideDraft }
  | { type: 'video';  draft: VideoDraft }
  | { type: 'task';   draft: TaskDraft  }
  | { type: 'test';   draft: TestDraft  };

// ─── Props ────────────────────────────────────────────────────────────────────

export interface LessonEditorShellProps {
  type:                ActiveBuilderType;
  onBack:              () => void;
  onSave?:             (payload: EditorDraft) => void | Promise<void>;
  initialTitle?:       string;
  stepNum?:            number;
  total?:              number;
  /** Pre-populate the video editor when opening an existing video. */
  initialVideoDraft?:  VideoDraft;
  /** Pre-populate the test editor when opening an existing test. */
  initialTestDraft?:   TestDraft;
  /** Kept for backward-compatibility — no longer used. */
  actions?:            React.ReactNode;
}

// ─── Shared chrome ────────────────────────────────────────────────────────────

function EditorBackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Back"
      className={[
        'inline-flex items-center gap-1.5',
        'rounded-lg bg-white/90 px-2.5 py-1.5 text-[13px] font-medium text-slate-500',
        'shadow-sm ring-1 ring-slate-200/80 backdrop-blur',
        'hover:bg-white hover:text-slate-700 transition-colors duration-150',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400',
      ].join(' ')}
    >
      <ChevronLeft className="h-4 w-4" />
      Back
    </button>
  );
}

function SaveFinishFooter({
  onSave,
  isSaving,
}: {
  onSave:   () => void;
  isSaving: boolean;
}) {
  return (
    <div className="flex items-center justify-end">
      <button
        type="button"
        onClick={onSave}
        disabled={isSaving}
        className={[
          'inline-flex items-center gap-2 rounded-xl px-5 py-2 text-[13px] font-semibold text-white',
          'bg-teal-600 hover:bg-teal-700 active:bg-teal-800 shadow-sm transition-colors duration-150',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:ring-offset-1',
          'disabled:opacity-50 disabled:cursor-not-allowed',
        ].join(' ')}
      >
        <Save className="h-3.5 w-3.5" />
        {isSaving ? 'Saving…' : 'Save & Finish'}
      </button>
    </div>
  );
}

// ─── VideoEditorFrame ─────────────────────────────────────────────────────────
//
// Renders the video editor inside the same PlayerFrame shell as slides, so:
//   • The unit rail + header chrome sit above (unchanged).
//   • The player body holds the VideoEditorStep card at full height.
//   • A pinned "Save & Finish" footer lives in the PlayerFrame footer zone.
//
// The body uses `flex flex-col flex-1 min-h-0` so the preview area stretches
// to fill the available vertical space, matching the slide editor's proportions.

function VideoEditorFrame({
  onBack,
  onSave,
  stepNum,
  total,
  initialDraft,
}: {
  onBack:        () => void;
  onSave:        (d: VideoDraft) => Promise<void>;
  stepNum:       number;
  total:         number;
  initialDraft?: VideoDraft;
}) {
  const [draft, setDraft]       = useState<VideoDraft>(initialDraft ?? { ...EMPTY_VIDEO_DRAFT });
  const [isSaving, setIsSaving] = useState(false);

  // If the teacher opens a different existing video while the editor stays
  // mounted (builder.stage remains 'editing' / type remains 'video'), we
  // still need to refresh the controlled draft values.
  useEffect(() => {
    if (!initialDraft) return;
    setDraft(initialDraft);
  }, [initialDraft]);

  const handleSave = useCallback(async () => {
    if (isSaving) return;
    setIsSaving(true);
    try { await onSave(draft); } finally { setIsSaving(false); }
  }, [draft, isSaving, onSave]);

  return (
    <div className="relative flex flex-col flex-1 min-h-0 lp-step-enter">

      <PlayerFrame
        type="video"
        status="in_progress"
        footer={<SaveFinishFooter onSave={handleSave} isSaving={isSaving} />}
      >

        {/* Top chrome: Back button + PlayerHeader */}
        <div className="flex items-center justify-start px-4 pt-3 sm:px-6">
          <EditorBackButton onClick={onBack} />
        </div>

        <PlayerHeader
          type="video"
          label="Video"
          subtitle={
            initialDraft
              ? 'Edit the title, URL, or description for this video.'
              : 'Paste a YouTube or Vimeo URL to embed a video in this lesson.'
          }
          status="in_progress"
          stepNum={stepNum}
          total={total}
        />

        {/*
          Player body — flex column so VideoEditorStep fills the available
          vertical space, giving the thumbnail area room to breathe.
        */}
        <div className="lp-player-body flex flex-col flex-1 min-h-0">
          <div className="px-5 py-4 sm:px-7 pb-8 flex flex-col flex-1 min-h-0">
            <VideoEditorStep draft={draft} onChange={setDraft} />
          </div>
        </div>

      </PlayerFrame>
    </div>
  );
}

// ─── TaskEditorFrame (unchanged) ──────────────────────────────────────────────

function TaskEditorFrame({
  onBack,
  onSave,
  stepNum,
  total,
}: {
  onBack:  () => void;
  onSave:  (d: TaskDraft) => Promise<void>;
  stepNum: number;
  total:   number;
}) {
  const [draft, setDraft]       = useState<TaskDraft>({ ...EMPTY_TASK_DRAFT });
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = useCallback(async () => {
    if (isSaving) return;
    setIsSaving(true);
    try { await onSave(draft); } finally { setIsSaving(false); }
  }, [draft, isSaving, onSave]);

  return (
    <div className="relative flex flex-col flex-1 min-h-0 lp-step-enter">
      <EditorBackButton onClick={onBack} />
      <PlayerFrame
        type="task"
        status="in_progress"
        footer={<SaveFinishFooter onSave={handleSave} isSaving={isSaving} />}
      >
        <PlayerHeader
          type="task"
          label="Task"
          subtitle="Configure the task details. Students complete this inline."
          status="in_progress"
          stepNum={stepNum}
          total={total}
        />
        <div className="lp-player-body overflow-y-auto">
          <div className="px-5 py-4 sm:px-7 pb-8">
            <TaskEditorStep draft={draft} onChange={setDraft} />
          </div>
        </div>
      </PlayerFrame>
    </div>
  );
}

// ─── AutoSaveStatus ───────────────────────────────────────────────────────────

type SaveStatus = 'idle' | 'saving' | 'saved';

function AutoSaveStatusPill({ status }: { status: SaveStatus }) {
  if (status === 'idle') return null;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-opacity duration-300"
      style={{
        color:           '#6C6FEF',
        backgroundColor: '#EEF0FE',
        border:          '1px solid #C7C9F9',
        opacity:         status === 'saved' ? 0.78 : 1,
      }}
      aria-live="polite"
    >
      {status === 'saving' ? (
        <>
          <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="40" strokeDashoffset="10" strokeLinecap="round" />
          </svg>
          Saving…
        </>
      ) : (
        <>
          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Saved
        </>
      )}
    </span>
  );
}

// ─── TestEditorFrame ──────────────────────────────────────────────────────────
//
// Auto-save edition — replaces the manual "Save & Finish" footer button with a
// debounced auto-save (800 ms) that fires whenever the draft changes.
// A small status pill ("Saving…" / "Saved ✓") appears next to the Back button.

const TEST_AUTOSAVE_DELAY_MS = 800;

function TestEditorFrame({
  onBack,
  onSave,
  stepNum,
  total,
  initialDraft,
}: {
  onBack:        () => void;
  onSave:        (d: TestDraft) => Promise<void>;
  stepNum:       number;
  total:         number;
  initialDraft?: TestDraft;
}) {
  const [draft, setDraft]         = useState<TestDraft>(initialDraft ?? { ...EMPTY_TEST_DRAFT });
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');

  // Stable ref to the latest draft so the debounced callback never closes over stale state.
  const draftRef    = useRef(draft);
  const isSavingRef = useRef(false);
  const timerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep ref in sync.
  useEffect(() => { draftRef.current = draft; }, [draft]);

  // When the teacher opens a different existing test while the frame stays
  // mounted, refresh the draft — mirrors VideoEditorFrame pattern.
  const prevInitialRef = useRef(initialDraft);
  useEffect(() => {
    if (initialDraft && initialDraft !== prevInitialRef.current) {
      prevInitialRef.current = initialDraft;
      setDraft(initialDraft);
      // Cancel any in-flight debounce from the old test.
      if (timerRef.current) clearTimeout(timerRef.current);
      setSaveStatus('idle');
    }
  }, [initialDraft]);

  // Debounced auto-save: fires after the teacher stops typing for 800 ms.
  const scheduleSave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      if (isSavingRef.current) return;
      isSavingRef.current = true;
      setSaveStatus('saving');
      try {
        await onSave(draftRef.current);
        setSaveStatus('saved');
        // Fade out the "Saved" pill after 2 s.
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
        savedTimerRef.current = setTimeout(() => setSaveStatus('idle'), 2000);
      } catch {
        setSaveStatus('idle');
      } finally {
        isSavingRef.current = false;
      }
    }, TEST_AUTOSAVE_DELAY_MS);
  }, [onSave]);

  // Intercept draft changes so we can trigger auto-save.
  const handleChange = useCallback((next: TestDraft) => {
    setDraft(next);
    scheduleSave();
  }, [scheduleSave]);

  // Cleanup timers on unmount.
  useEffect(() => () => {
    if (timerRef.current)     clearTimeout(timerRef.current);
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
  }, []);

  return (
    <div className="relative flex flex-col flex-1 min-h-0 lp-step-enter">

      {/* No footer prop — auto-save replaces the Save & Finish button */}
      <PlayerFrame type="test" status="in_progress">

        {/* Top chrome: Back button + save status pill */}
        <div className="flex items-center justify-between px-4 pt-3 sm:px-6">
          <EditorBackButton onClick={onBack} />
          <AutoSaveStatusPill status={saveStatus} />
        </div>

        <PlayerHeader
          type="test"
          label="Test"
          subtitle={
            initialDraft
              ? 'Edit the test title, questions, and settings.'
              : 'Create a new test. Add a title, then build your questions below.'
          }
          status="in_progress"
          stepNum={stepNum}
          total={total}
        />

        {/* Player body — scrollable so long question lists don't overflow. */}
        <div className="lp-player-body overflow-y-auto">
          <div className="px-5 py-4 sm:px-7 pb-8">
            <TestEditorStep draft={draft} onChange={handleChange} />
          </div>
        </div>

      </PlayerFrame>
    </div>
  );
}

// ─── Shell ────────────────────────────────────────────────────────────────────

export default function LessonEditorShell({
  type,
  onBack,
  onSave,
  stepNum          = 1,
  total            = 1,
  initialVideoDraft,
  initialTestDraft,
}: LessonEditorShellProps) {

  const saveVideo = useCallback(
    async (draft: VideoDraft) => { await onSave?.({ type: 'video', draft }); },
    [onSave],
  );
  const saveTask = useCallback(
    async (draft: TaskDraft)  => { await onSave?.({ type: 'task',  draft }); },
    [onSave],
  );
  const saveTest = useCallback(
    async (draft: TestDraft)  => { await onSave?.({ type: 'test',  draft }); },
    [onSave],
  );

  // Slides are owned by TeacherSlidesEditorPlayer in LessonWorkspace.
  if (!type || type === 'slides') return null;

  return (
    <div className="flex flex-col flex-1 min-h-0 editor-shell-enter">

      {type === 'video' && (
        <VideoEditorFrame
          onBack={onBack}
          onSave={saveVideo}
          stepNum={stepNum}
          total={total}
          initialDraft={initialVideoDraft}
        />
      )}

      {type === 'task' && (
        <TaskEditorFrame
          onBack={onBack}
          onSave={saveTask}
          stepNum={stepNum}
          total={total}
        />
      )}

      {type === 'test' && (
        <TestEditorFrame
          onBack={onBack}
          onSave={saveTest}
          stepNum={stepNum}
          total={total}
          initialDraft={initialTestDraft}
        />
      )}

      <style>{`
        @keyframes editorShellEnter {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .editor-shell-enter {
          animation: editorShellEnter 0.25s cubic-bezier(0.22,1,0.36,1) both;
        }
      `}</style>
    </div>
  );
}