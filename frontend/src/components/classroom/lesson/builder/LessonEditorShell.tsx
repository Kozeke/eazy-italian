/**
 * LessonEditorShell.tsx  (v3 — initialTitle forwarding)
 *
 * Changes from v2:
 * ─────────────────
 * • `initialTitle?: string` prop added.
 *   When type === 'slides', this is forwarded to SlideEditorStep so the
 *   slide draft is pre-populated with the title the teacher entered in the
 *   CreateSlideModal wizard.
 *
 * • slideDraft initialised with the incoming title so the preview shows the
 *   right heading the moment the editor opens.
 *
 * • Everything else (editor meta, per-type drafts, save handler, action bar,
 *   layout) is unchanged from v2.
 */

import React, { useState, useCallback } from 'react';
import {
  ChevronLeft,
  Presentation, PlayCircle, FileText, ClipboardList,
  Save,
} from 'lucide-react';

import type { ActiveBuilderType } from '../lessonMode.types';

import SlideEditorStep, {
  type SlideDraft,
  EMPTY_SLIDE_DRAFT,
} from '../editors/SlideEditorStep';

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

// ─── Draft union type ─────────────────────────────────────────────────────────

export type EditorDraft =
  | { type: 'slides'; draft: SlideDraft }
  | { type: 'video';  draft: VideoDraft }
  | { type: 'task';   draft: TaskDraft  }
  | { type: 'test';   draft: TestDraft  };

// ─── Props ────────────────────────────────────────────────────────────────────

export interface LessonEditorShellProps {
  type:          ActiveBuilderType;
  onBack:        () => void;
  /** Called with the current draft when Save is clicked. */
  onSave?:       (payload: EditorDraft) => void | Promise<void>;
  /**
   * Pre-populated title for slide editors — set from the CreateSlideModal
   * wizard so the player immediately shows the teacher's chosen heading.
   */
  initialTitle?: string;
  /** Fully override the action bar (optional) */
  actions?:      React.ReactNode;
}

// ─── Editor meta (chrome config) ─────────────────────────────────────────────

interface EditorMeta {
  Icon:      React.ElementType;
  title:     string;
  subtitle:  string;
  accentBar: string;
  iconBg:    string;
  iconText:  string;
  saveRing:  string;
  saveBg:    string;
  saveText:  string;
  saveHover: string;
}

const EDITOR_META: Record<NonNullable<ActiveBuilderType>, EditorMeta> = {
  slides: {
    Icon:      Presentation,
    title:     'Create slides',
    subtitle:  'Build a slide deck for this unit.',
    accentBar: 'from-teal-500 to-teal-400',
    iconBg:    'bg-teal-50',
    iconText:  'text-teal-600',
    saveRing:  'focus-visible:ring-teal-400',
    saveBg:    'bg-teal-600',
    saveText:  'text-white',
    saveHover: 'hover:bg-teal-700',
  },
  video: {
    Icon:      PlayCircle,
    title:     'Create video lesson',
    subtitle:  'Embed a YouTube or Vimeo video for students.',
    accentBar: 'from-sky-500 to-sky-400',
    iconBg:    'bg-sky-50',
    iconText:  'text-sky-600',
    saveRing:  'focus-visible:ring-sky-400',
    saveBg:    'bg-sky-600',
    saveText:  'text-white',
    saveHover: 'hover:bg-sky-700',
  },
  task: {
    Icon:      FileText,
    title:     'Create task',
    subtitle:  'Write an activity for students to complete.',
    accentBar: 'from-amber-500 to-amber-400',
    iconBg:    'bg-amber-50',
    iconText:  'text-amber-600',
    saveRing:  'focus-visible:ring-amber-400',
    saveBg:    'bg-amber-500',
    saveText:  'text-white',
    saveHover: 'hover:bg-amber-600',
  },
  test: {
    Icon:      ClipboardList,
    title:     'Create test',
    subtitle:  'Set up a graded test for this unit.',
    accentBar: 'from-emerald-600 to-emerald-500',
    iconBg:    'bg-emerald-50',
    iconText:  'text-emerald-700',
    saveRing:  'focus-visible:ring-emerald-400',
    saveBg:    'bg-emerald-600',
    saveText:  'text-white',
    saveHover: 'hover:bg-emerald-700',
  },
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function LessonEditorShell({
  type,
  onBack,
  onSave,
  initialTitle = '',
  actions,
}: LessonEditorShellProps) {
  // ── Per-type draft state ───────────────────────────────────────────────────
  // NOTE: hooks must be declared before any conditional return (Rules of Hooks)
  const [slideDraft, setSlideDraft] = useState<SlideDraft>({
    ...EMPTY_SLIDE_DRAFT,
    // Pre-populate title from the wizard so the preview shows it immediately
    title:   initialTitle,
    bullets: [''],
  });
  const [videoDraft, setVideoDraft] = useState<VideoDraft>({ ...EMPTY_VIDEO_DRAFT });
  const [taskDraft,  setTaskDraft]  = useState<TaskDraft>( { ...EMPTY_TASK_DRAFT  });
  const [testDraft,  setTestDraft]  = useState<TestDraft>( { ...EMPTY_TEST_DRAFT  });
  const [isSaving, setIsSaving] = useState(false);

  // ── Save handler — assembles typed union for the parent ───────────────────
  const handleSave = useCallback(async () => {
    if (!onSave || !type || isSaving) return;

    setIsSaving(true);
    try {
      switch (type) {
        case 'slides':
          await onSave({ type: 'slides', draft: slideDraft });
          break;
        case 'video':
          await onSave({ type: 'video', draft: videoDraft });
          break;
        case 'task':
          await onSave({ type: 'task', draft: taskDraft });
          break;
        case 'test':
          await onSave({ type: 'test', draft: testDraft });
          break;
      }
    } finally {
      setIsSaving(false);
    }
  }, [type, onSave, slideDraft, videoDraft, taskDraft, testDraft, isSaving]);

  if (!type) return null;

  const meta = EDITOR_META[type];
  const { Icon, title, subtitle, accentBar, iconBg, iconText } = meta;

  // ── Default action bar ────────────────────────────────────────────────────
  const defaultActions = (
    <>
      <button
        type="button"
        onClick={onBack}
        className={[
          'rounded-xl border border-slate-200 bg-white px-5 py-2 text-[13px] font-semibold',
          'text-slate-600 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300',
        ].join(' ')}
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={handleSave}
        disabled={isSaving}
        className={[
          'flex items-center gap-2 rounded-xl px-5 py-2 text-[13px] font-semibold shadow-sm',
          'transition-all focus:outline-none focus-visible:ring-2',
          isSaving ? 'cursor-wait opacity-70' : '',
          meta.saveBg,
          meta.saveText,
          meta.saveHover,
          meta.saveRing,
        ].join(' ')}
      >
        <Save className="h-3.5 w-3.5" />
        {isSaving ? 'Saving...' : 'Save draft'}
      </button>
    </>
  );

  return (
    <div className="flex flex-col flex-1 min-h-0 editor-shell-enter">

      {/* ── Gradient accent bar ────────────────────────────────────────── */}
      <div className={`h-[3px] w-full shrink-0 bg-gradient-to-r ${accentBar}`} aria-hidden />

      {/* ── Shell header ──────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-slate-100 bg-white px-6 py-4">
        <div className="flex items-center justify-between gap-4">

          {/* Back */}
          <button
            type="button"
            onClick={onBack}
            className={[
              'flex items-center gap-1.5 text-[13px] font-medium text-slate-400',
              'hover:text-slate-700 transition-colors focus:outline-none',
              'focus-visible:underline shrink-0',
            ].join(' ')}
            aria-label="Back to content type chooser"
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Back</span>
          </button>

          {/* Type + title */}
          <div className="flex items-center gap-3 min-w-0">
            <span className={[
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
              iconBg,
            ].join(' ')}>
              <Icon className={`h-4 w-4 ${iconText}`} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-[15px] font-bold text-slate-900 leading-snug">
                {title}
              </p>
              <p className="truncate text-[12px] text-slate-400 leading-snug">
                {subtitle}
              </p>
            </div>
          </div>

          {/* Balance spacer */}
          <div className="w-14 shrink-0" aria-hidden />
        </div>
      </div>

      {/* ── Scrollable editor body ─────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-y-auto bg-slate-50/60">
        <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">

          {type === 'slides' && (
            <SlideEditorStep
              initialTitle={initialTitle}
              draft={slideDraft}
              onChange={setSlideDraft}
            />
          )}

          {type === 'video' && (
            <VideoEditorStep
              draft={videoDraft}
              onChange={setVideoDraft}
            />
          )}

          {type === 'task' && (
            <TaskEditorStep
              draft={taskDraft}
              onChange={setTaskDraft}
            />
          )}

          {type === 'test' && (
            <TestEditorStep
              draft={testDraft}
              onChange={setTestDraft}
            />
          )}

        </div>
      </div>

      {/* ── Sticky action bar ──────────────────────────────────────────── */}
      <div className="shrink-0 border-t border-slate-100 bg-white px-6 py-3">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-end gap-3">
          {actions ?? defaultActions}
        </div>
      </div>

      {/* Entrance animation */}
      <style>{`
        @keyframes editorShellEnter {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .editor-shell-enter {
          animation: editorShellEnter 0.25s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
      `}</style>

    </div>
  );
}