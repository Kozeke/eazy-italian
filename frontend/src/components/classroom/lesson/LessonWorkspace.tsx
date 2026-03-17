/**
 * LessonWorkspace.tsx  (v15 — CreateSlideModal + player-hero slide editor)
 *
 * Changes from v14:
 * ─────────────────
 * • useBuilderState gains `slideInitialTitle` state and a new
 *   `selectSlides(title)` action:
 *     - sets stage = 'editing', activeType = 'slides'
 *     - stores the title so LessonEditorShell can pre-populate the draft
 *
 * • ManualBuilderLauncher now receives `onSelectSlides` in addition to
 *   `onSelect` so the slides card triggers the wizard → editor path while
 *   other card types still go directly to editing.
 *
 * • LessonEditorShell receives `initialTitle={builder.slideInitialTitle}`
 *   which it forwards to SlideEditorStep.
 *
 * • All other render branches, student runtime, and live-session wiring
 *   are completely unchanged from v14.
 */

import React, { useState, useCallback, useEffect } from 'react';
import toast from 'react-hot-toast';

import './lesson-polish.css';
import './lesson-workspace.css';

import type { StudentUnitDetail, StudentTask, StudentTest } from '../../../hooks/useStudentUnit';
import type { ReviewSlide }                                  from '../../../pages/admin/shared';

import type { SlideProgress } from './SlidesSection';
import type { StudentVideo }  from './flow/lessonFlow.types';

import { buildLessonFlow, selectPrimaryItem } from './flow/lessonFlow.builder';
import type { LessonRailState }               from './flow/LessonFlowComponents';

import {
  LessonFlow,
  LessonFlowSkeleton,
  LessonFlowEmpty,
  LessonFlowError,
} from './flow/LessonFlowComponents';

import TeacherBuilderEmptyState from './builder/TeacherBuilderEmptyState';
import ManualBuilderLauncher    from './builder/ManualBuilderLauncher';
import LessonEditorShell        from './builder/LessonEditorShell';
import type { EditorDraft }     from './builder/LessonEditorShell';
import type { SlideDraft }      from './editors/SlideEditorStep';

import type {
  ClassroomMode,
  BuilderState,
  ActiveBuilderType,
} from './lessonMode.types';
import { INITIAL_BUILDER_STATE } from './lessonMode.types';
import api from '../../../services/api';

// ─── Types ────────────────────────────────────────────────────────────────────

type LiveSection = 'slides' | 'task' | 'test' | 'video';

export interface TaskSubmission {
  id?:           number;
  status?:       string;
  score?:        number | null;
  feedback?:     string | null;
  submitted_at?: string;
  answers?:      Record<string, unknown>;
}

export interface TestAttempt {
  id?:           number;
  status?:       string;
  score?:        number | null;
  passed?:       boolean | null;
  submitted_at?: string;
  answers?:      Record<string, unknown>;
  review?:       Array<{
    question_id:      number;
    correct:          boolean;
    selected_option?: string;
    correct_answer?:  string;
  }>;
}

export interface StartedTestData {
  attempt_id:          number;
  test_id:             number;
  test_title?:         string;
  time_limit_minutes?: number | null;
  started_at?:         string;
  questions:           Array<{
    id:           number;
    type:         string;
    prompt?:      string;
    options?:     Array<{ id: number; text?: string; option_text?: string }>;
    order_index?: number;
    score?:       number;
    gaps_count?:  number;
  }>;
  total_points?: number;
}

interface AdminPresentationListItem {
  id: number;
  order_index?: number | null;
}

function normalizeTextList(values: string[]): string[] {
  return values.map((value) => value.trim()).filter(Boolean);
}

function getSaveErrorMessage(error: unknown): string {
  if (
    error &&
    typeof error === 'object' &&
    'response' in error &&
    error.response &&
    typeof error.response === 'object' &&
    'data' in error.response &&
    error.response.data &&
    typeof error.response.data === 'object' &&
    'detail' in error.response.data &&
    typeof error.response.data.detail === 'string'
  ) {
    return error.response.data.detail;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'Could not save slides';
}

async function saveSlidesDraftToApi(
  unitId: number | string,
  draft: SlideDraft,
): Promise<void> {
  const cleanedTitle = draft.title.trim() || 'Untitled slide';
  const bulletPoints = normalizeTextList(draft.bullets);
  const examples = normalizeTextList(draft.examples);
  const exercise = draft.exercise.trim();
  const imageUrl = draft.image_url.trim();

  const { data: presentations } = await api.get<AdminPresentationListItem[]>(
    `/admin/units/${unitId}/presentations`,
    { params: { limit: 100 } },
  );

  const nextOrderIndex = (presentations ?? []).reduce(
    (max, item) => Math.max(max, item.order_index ?? -1),
    -1,
  ) + 1;

  const { data: presentation } = await api.post<{ id: number }>(
    `/admin/units/${unitId}/presentations`,
    {
      title: cleanedTitle,
      is_visible_to_students: false,
      order_index: nextOrderIndex,
    },
  );

  await api.post(`/admin/presentations/${presentation.id}/slides`, {
    title: cleanedTitle,
    bullet_points: bulletPoints,
    examples,
    exercise: exercise || null,
    image_url: imageUrl || null,
    order_index: 0,
  });
}

export type LessonWorkspaceProps = {
  mode?:           ClassroomMode;

  unit:            StudentUnitDetail | null;
  slides?:         ReviewSlide[];
  slidesLoading?:  boolean;
  slidesError?:    string | null;
  videos?:         StudentVideo[];

  taskSubmission?: TaskSubmission | null;
  testAttempt?:    TestAttempt | null;

  loading?:        boolean;
  error?:          string | null;

  onStartTest:     (testId: number) => Promise<StartedTestData>;
  onLoadTask?:     (taskId: number) => Promise<StudentTask>;

  onSubmitTask:    (payload: { task_id: number; answers: Record<string, unknown> }) => Promise<unknown>;
  onSubmitTest:    (payload: { test_id: number; answers: Record<string, string> }) => Promise<unknown>;

  onSlidesProgress?: () => void;
  onSlidesComplete?: () => void;
  onTaskSubmitted?:  () => void;
  onTestAttempted?:  () => void;

  onOpenTask?:     (task: StudentTask) => void;
  onOpenTest?:     (test: StudentTest) => void;

  forcedSlide?:    number | null;
  forcedSection?:  LiveSection | null;

  onRailStateChange?:    (state: LessonRailState) => void;
  onBuilderStateChange?: (state: BuilderState) => void;
  onContentSaved?:       () => void | Promise<void>;

  /**
   * When true, the workspace enters ManualBuilderLauncher immediately,
   * bypassing the TeacherBuilderEmptyState entry screen.
   */
  startInManualBuilder?: boolean;
};

// ─── useBuilderState ──────────────────────────────────────────────────────────

function useBuilderState(
  mode:                  ClassroomMode,
  hasContent:            boolean,
  unitId:                number | string | null | undefined,
  onExternalChange?:     (state: BuilderState) => void,
  onContentSaved?:       () => void | Promise<void>,
  startInManualBuilder?: boolean,
) {
  const [builder, setBuilder] = useState<BuilderState>(() => {
    if (mode === 'teacher') {
      if (startInManualBuilder) return { stage: 'manual-choice', activeType: null };
      if (!hasContent)          return { stage: 'entry',          activeType: null };
    }
    return INITIAL_BUILDER_STATE;
  });

  /**
   * Title entered in CreateSlideModal — passed to LessonEditorShell so
   * SlideEditorStep can pre-populate the draft and show it in the player
   * immediately when the editor opens.
   */
  const [slideInitialTitle, setSlideInitialTitle] = useState('');

  useEffect(() => {
    if (mode !== 'teacher') return;
    if (startInManualBuilder) {
      setBuilder({ stage: 'manual-choice', activeType: null });
      return;
    }
    setBuilder(!hasContent
      ? { stage: 'entry', activeType: null }
      : INITIAL_BUILDER_STATE,
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitId, mode, startInManualBuilder]);

  useEffect(() => {
    onExternalChange?.(builder);
  }, [builder, onExternalChange]);

  const goToManual    = useCallback(() => setBuilder({ stage: 'manual-choice', activeType: null }), []);
  const goToEntry     = useCallback(() => setBuilder({ stage: 'entry',          activeType: null }), []);

  /** For non-slide types — enter editor directly. */
  const selectType    = useCallback((type: ActiveBuilderType) => {
    setBuilder({ stage: 'editing', activeType: type });
  }, []);

  /**
   * For the slides type — called AFTER CreateSlideModal confirms.
   * Stores the title and enters the slide editor.
   */
  const selectSlides  = useCallback((title: string) => {
    setSlideInitialTitle(title);
    setBuilder({ stage: 'editing', activeType: 'slides' });
  }, []);

  const backToLauncher = useCallback(() => setBuilder({ stage: 'manual-choice', activeType: null }), []);

  const goToAI = useCallback(() => {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.info('[TeacherBuilder] AI requested — not yet implemented.');
    }
  }, []);

  const handleSave = useCallback(async (payload: EditorDraft) => {
    if (payload.type !== 'slides') {
      toast('Only slide saving is wired to the backend right now.');
      return;
    }

    if (!unitId) {
      toast.error('Select a unit before saving slides.');
      return;
    }

    const toastId = toast.loading('Saving slides...');
    try {
      await saveSlidesDraftToApi(unitId, payload.draft);
      await onContentSaved?.();
      setSlideInitialTitle('');
      setBuilder(INITIAL_BUILDER_STATE);
      toast.success('Slides saved', { id: toastId });
    } catch (error) {
      toast.error(getSaveErrorMessage(error), { id: toastId });
      throw error;
    }
  }, [onContentSaved, unitId]);

  return {
    builder,
    slideInitialTitle,
    goToManual,
    goToEntry,
    selectType,
    selectSlides,
    backToLauncher,
    goToAI,
    handleSave,
  } as const;
}

// ─── LessonCanvas ─────────────────────────────────────────────────────────────

function LessonCanvas({ children }: { children: React.ReactNode }) {
  return (
    <div className="lp-workspace">
      <div className="lp-canvas">
        {children}
      </div>
    </div>
  );
}

// ─── SlidesErrorCard ──────────────────────────────────────────────────────────

function SlidesErrorCard({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-amber-100 bg-amber-50 overflow-hidden mb-3 flex-shrink-0">
      <div className="h-[3px] w-full bg-gradient-to-r from-amber-400 to-amber-300" />
      <div className="px-5 py-4 text-[13px] text-amber-700">
        Could not load slides: {message}
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function LessonWorkspace({
  mode = 'student',
  unit,
  slides = [],
  slidesLoading = false,
  slidesError,
  videos = [],
  taskSubmission = null,
  testAttempt    = null,
  loading,
  error,
  onStartTest,
  onLoadTask,
  onSubmitTask,
  onSubmitTest,
  onSlidesProgress: _onSlidesProgress,
  onSlidesComplete,
  onTaskSubmitted,
  onTestAttempted,
  onOpenTask,
  onOpenTest,
  forcedSlide,
  forcedSection,
  onRailStateChange,
  onBuilderStateChange,
  onContentSaved,
  startInManualBuilder = false,
}: LessonWorkspaceProps) {

  const [slideProgress] = useState<SlideProgress>({
    currentSlide: 0, viewedSlideIds: [], completed: false,
  });

  const [videoCompletions, setVideoCompletions] = useState<Record<string, boolean>>({});
  const handleVideoCompleted = useCallback((id: string) => {
    setVideoCompletions((prev) => prev[id] ? prev : { ...prev, [id]: true });
  }, []);

  const [localTaskSubmissions, setLocalTaskSubmissions] = useState<
    Record<string | number, TaskSubmission>
  >(() => {
    if (taskSubmission && unit?.tasks?.length === 1) {
      return { [unit.tasks[0].id]: taskSubmission };
    }
    return {};
  });

  const [taskDetailsById, setTaskDetailsById] = useState<Record<string | number, StudentTask>>({});

  const handleItemCompleted = useCallback((id: string, type: string) => {
    if (type === 'slides') onSlidesComplete?.();
    if (type === 'video')  handleVideoCompleted(id.replace(/^video-/, ''));
  }, [onSlidesComplete, handleVideoCompleted]);

  const handleLoadTask = useCallback(async (taskId: number): Promise<StudentTask> => {
    if (taskDetailsById[taskId]) return taskDetailsById[taskId];
    if (!onLoadTask) throw new Error('onLoadTask not provided');
    const detail = await onLoadTask(taskId);
    setTaskDetailsById((prev) => ({ ...prev, [taskId]: detail }));
    return detail;
  }, [onLoadTask, taskDetailsById]);

  const handleSubmitTask = useCallback(
    async (payload: { task_id: number; answers: Record<string, unknown> }) => {
      const result = await onSubmitTask(payload);
      setLocalTaskSubmissions((prev) => ({
        ...prev,
        [payload.task_id]: { status: 'submitted', submitted_at: new Date().toISOString(), answers: payload.answers },
      }));
      onTaskSubmitted?.();
      return result;
    },
    [onSubmitTask, onTaskSubmitted],
  );

  const handleSubmitTest = useCallback(
    async (payload: { test_id: number; answers: Record<string, string> }) => {
      const result = await onSubmitTest(payload);
      onTestAttempted?.();
      return result;
    },
    [onSubmitTest, onTestAttempted],
  );

  // ── Pre-guard: compute values needed by useBuilderState unconditionally ──
  const _primaryTest  = selectPrimaryItem(unit?.tests ?? []) as StudentTest | null;
  const _allTasks     = unit?.tasks ?? [];
  const hasAnyContent = (slides.length > 0 || slidesLoading)
    || (videos?.length ?? 0) > 0
    || _allTasks.length > 0
    || !!_primaryTest;

  // Builder state — MUST be called unconditionally (Rules of Hooks)
  const {
    builder,
    slideInitialTitle,
    goToManual,
    goToEntry,
    selectType,
    selectSlides,
    backToLauncher,
    goToAI,
    handleSave,
  } = useBuilderState(
    mode,
    hasAnyContent,
    unit?.id,
    onBuilderStateChange,
    onContentSaved,
    startInManualBuilder,
  );

  // ── Guards ─────────────────────────────────────────────────────────────────
  if (loading) return <LessonCanvas><LessonFlowSkeleton /></LessonCanvas>;
  if (error)   return <LessonCanvas><LessonFlowError message={error} onBack={() => window.history.back()} /></LessonCanvas>;

  const isTeacherBuilding = mode === 'teacher' && (
    builder.stage === 'manual-choice' || builder.stage === 'editing'
  );
  if (!unit && !isTeacherBuilding) {
    return (
      <LessonCanvas>
        <LessonFlowEmpty title="No unit selected" description="Choose a unit from the header to begin." />
      </LessonCanvas>
    );
  }

  const primaryTest = _primaryTest;
  const allTasks    = _allTasks;

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER DECISION TREE
  // ═══════════════════════════════════════════════════════════════════════════

  // [1] Student + no content
  if (mode === 'student' && !hasAnyContent) {
    return (
      <LessonCanvas>
        <LessonFlowEmpty
          title="No lesson content available yet"
          description="Your teacher hasn't added content to this unit."
        />
      </LessonCanvas>
    );
  }

  // [2] Teacher + entry
  if (mode === 'teacher' && builder.stage === 'entry') {
    return (
      <LessonCanvas>
        <TeacherBuilderEmptyState unitTitle={unit?.title} onManual={goToManual} onAI={goToAI} />
      </LessonCanvas>
    );
  }

  // [3] Teacher + manual-choice
  if (mode === 'teacher' && builder.stage === 'manual-choice') {
    return (
      <LessonCanvas>
        {/*
          ManualBuilderLauncher v2:
          • onSelect handles video / task / test (direct to editor)
          • onSelectSlides handles the slide wizard path
        */}
        <ManualBuilderLauncher
          onSelect={selectType}
          onSelectSlides={selectSlides}
          onBack={goToEntry}
        />
      </LessonCanvas>
    );
  }

  // [4] Teacher + editing
  if (mode === 'teacher' && builder.stage === 'editing' && builder.activeType) {
    return (
      <LessonCanvas>
        {/*
          LessonEditorShell v3 receives initialTitle for the slides case.
          SlideEditorStep uses this to pre-populate the draft so the
          live player immediately shows the title the teacher entered.
        */}
        <LessonEditorShell
          type={builder.activeType}
          onBack={backToLauncher}
          onSave={handleSave}
          initialTitle={builder.activeType === 'slides' ? slideInitialTitle : undefined}
        />
      </LessonCanvas>
    );
  }

  // [5] Normal lesson player (student or teacher-with-content)
  const mergedSubmissions: Record<string | number, TaskSubmission> = { ...localTaskSubmissions };
  if (taskSubmission && allTasks.length === 1) {
    mergedSubmissions[allTasks[0].id] = taskSubmission;
  }

  const flow = buildLessonFlow({
    slides,
    viewedSlideIds:      slideProgress.viewedSlideIds,
    slidesCompleted:     slideProgress.completed,
    tasks:               allTasks,
    taskSubmissionsById: mergedSubmissions,
    primaryTest,
    testAttempt:         testAttempt as any,
    videos,
    videoCompletions,
    forcedSlide,
    locked: forcedSection !== null && forcedSection !== undefined,
  });

  return (
    <LessonCanvas>
      {slidesError && !slidesLoading && <SlidesErrorCard message={slidesError} />}
      <LessonFlow
        flow={flow}
        onStartTest={onStartTest}
        onLoadTask={handleLoadTask}
        onSubmitTask={handleSubmitTask}
        onSubmitTest={handleSubmitTest}
        onOpenTask={onOpenTask}
        onOpenTest={onOpenTest}
        onItemCompleted={handleItemCompleted}
        loading={loading}
        onActiveIndexChange={onRailStateChange}
      />
    </LessonCanvas>
  );
}