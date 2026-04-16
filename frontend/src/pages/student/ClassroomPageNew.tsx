/**
 * ClassroomPage.tsx
 *
 * Unified classroom route for both teachers and students.
 * Role is determined via useAuth() — no duplicate pages.
 *
 * ── Teacher view ────────────────────────────────────────────────────────────
 *   • TeacherClassroomHeader  (thumbnail + title + exit)
 *   • No student UnitSelector, no progress bar, no live banner
 *   • Empty classroom state  → TeacherEmptyClassroom + MaterialChoiceModal
 *   • After unit is created:
 *       mode === 'manual'  → /teacher/classroom/:courseId/:unitId/editor
 *       mode === 'ai'      → /teacher/classroom/:courseId/:unitId/ai-builder
 *
 * ── Student view ────────────────────────────────────────────────────────────
 *   • ClassroomHeader (unchanged)
 *   • LessonWorkspace / StudentUnitWorkspace (unchanged)
 *   • LiveSessionBanner + TeacherLiveControls (unchanged)
 *
 * ── Architecture ─────────────────────────────────────────────────────────────
 *   ClassroomPage (outer, reads :courseId + auth)
 *     └── ClassroomPageInner (inner, all runtime state)
 *           ├── [teacher] TeacherClassroomHeader
 *           │     └── [no units] TeacherEmptyClassroom
 *           │           └── MaterialChoiceModal
 *           └── [student] ClassroomHeader + LessonWorkspace / StudentUnitWorkspace
 */

import { useCallback, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

// ── Layout shell ───────────────────────────────────────────────────────────
import ClassroomLayout      from '../../components/classroom/ClassroomLayout';

// ── Student components (unchanged) ────────────────────────────────────────
import ClassroomHeader      from '../../components/classroom/ClassroomHeader';
import LessonWorkspace      from '../../components/classroom/lesson/LessonWorkspace';

// ── Hooks ──────────────────────────────────────────────────────────────────
import { useClassroom }        from '../../hooks/useClassroom';
import { useStudentUnit }      from '../../hooks/useStudentUnit';
import { useUnitPresentation } from '../../hooks/useUnitPresentation';
import { useAuth }             from '../../hooks/useAuth';
import type { ClassroomUnit }  from '../../hooks/useClassroom';
import type { StudentTask, StudentTest } from '../../hooks/useStudentUnit';

// ── Live session (student + teacher) ──────────────────────────────────────
import { LiveSessionProvider }  from '../../components/classroom/live/LiveSessionProvider';
import { LiveSessionBanner }    from '../../components/classroom/live/LiveSessionBanner';
import TeacherLiveControls      from '../../components/classroom/live/TeacherLiveControls';
import type { LiveSection }     from '../../components/classroom/live/liveSession.types';
import { tasksApi, testsApi, unitsApi } from '../../services/api';

type MaterialMode = 'manual' | 'ai';
type UnitLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

// ─── Error state ──────────────────────────────────────────────────────────────

function ErrorState({ message, onBack }: { message: string; onBack: () => void }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-base font-medium text-slate-700">Couldn't load the classroom</p>
      <p className="max-w-sm text-sm text-slate-400">{message}</p>
      <button
        onClick={onBack}
        className="rounded-full bg-primary-600 px-5 py-2 text-sm font-medium text-white hover:bg-primary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
      >
        Back to My Classes
      </button>
    </div>
  );
}

function EmptyLesson({ unitTitle }: { unitTitle: string }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center justify-center py-24 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100">
        <svg className="h-8 w-8 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.966 8.966 0 0 0-6 2.292m0-14.25v14.25"
          />
        </svg>
      </div>
      <p className="text-base font-semibold text-slate-700">{unitTitle}</p>
      <p className="mt-1.5 text-sm text-slate-400">
        Your teacher hasn&apos;t added any content to this unit yet.
        <br />
        Check back soon!
      </p>
    </div>
  );
}

function TeacherClassroomHeader({
  course,
  onExit,
}: {
  course: { id: number; title: string; thumbnail_url?: string | null };
  onExit: () => void;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-sm shadow-sm">
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between gap-4 px-4 md:px-6 lg:px-8">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Teacher Classroom</p>
          <h1 className="truncate text-lg font-semibold text-slate-900">{course.title}</h1>
        </div>
        <button
          onClick={onExit}
          className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
          type="button"
        >
          Exit
        </button>
      </div>
    </header>
  );
}

function TeacherEmptyClassroom({
  courseTitle,
  onCreateMaterial,
}: {
  courseTitle?: string;
  onCreateMaterial: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-5xl flex-col items-center justify-center px-4 py-10 text-center md:px-6 lg:px-8">
      <div className="mb-4 rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-violet-700">
        Empty Classroom
      </div>
      <h2 className="text-2xl font-semibold text-slate-900">
        {courseTitle ? `Start building ${courseTitle}` : 'Start building your course'}
      </h2>
      <p className="mt-3 max-w-xl text-sm text-slate-500">
        This course does not have any units yet. Create your first unit and choose whether to continue in the
        manual editor or the AI builder.
      </p>
      <button
        onClick={onCreateMaterial}
        className="mt-6 rounded-full bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-700"
        type="button"
      >
        Create material
      </button>
    </main>
  );
}

function MaterialChoiceModal({
  open,
  courseId,
  unitLevel,
  defaultOrderIndex,
  onClose,
  onCreated,
}: {
  open: boolean;
  courseId: number;
  unitLevel?: string;
  defaultOrderIndex: number;
  onClose: () => void;
  onCreated: (payload: { unitId: number; mode: MaterialMode }) => void;
}) {
  const [title, setTitle] = useState('');
  const [creatingMode, setCreatingMode] = useState<MaterialMode | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = useCallback(
    async (mode: MaterialMode) => {
      const trimmedTitle = title.trim();
      if (!trimmedTitle) {
        setError('Please enter a unit title.');
        return;
      }

      setCreatingMode(mode);
      setError(null);

      const normalizedLevel: UnitLevel =
        unitLevel === 'A1' || unitLevel === 'A2' || unitLevel === 'B1' ||
        unitLevel === 'B2' || unitLevel === 'C1' || unitLevel === 'C2'
          ? unitLevel
          : 'A1';

      try {
        const unit = await unitsApi.createUnit({
          title: trimmedTitle,
          level: normalizedLevel,
          status: 'draft',
          course_id: courseId,
          order_index: defaultOrderIndex,
        });
        onCreated({ unitId: unit.id, mode });
        setTitle('');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create unit');
      } finally {
        setCreatingMode(null);
      }
    },
    [title, unitLevel, courseId, defaultOrderIndex, onCreated],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !creatingMode) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Create your first unit</h3>
            <p className="mt-1 text-sm text-slate-500">Pick a title, then choose how you want to continue building.</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            disabled={!!creatingMode}
            type="button"
          >
            <span className="sr-only">Close</span>
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <label className="mt-5 block text-sm font-medium text-slate-700">
          Unit title
          <input
            className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
            placeholder="e.g. Introductions and greetings"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !creatingMode) {
                void handleCreate('manual');
              }
            }}
            disabled={!!creatingMode}
          />
        </label>

        {error && (
          <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <button
            onClick={() => void handleCreate('manual')}
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!!creatingMode}
            type="button"
          >
            {creatingMode === 'manual' ? 'Creating...' : 'Manual editor'}
          </button>
          <button
            onClick={() => void handleCreate('ai')}
            className="rounded-2xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!!creatingMode}
            type="button"
          >
            {creatingMode === 'ai' ? 'Creating...' : 'AI builder'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Inner page ───────────────────────────────────────────────────────────────

function ClassroomPageInner({
  courseId,
  isTeacher,
  userId,
}: {
  courseId:  string;
  isTeacher: boolean;
  userId:    number | string | null;
}) {
  const { unitId } = useParams<{ unitId?: string }>();
  const navigate   = useNavigate();

  // ── Teacher UI state ───────────────────────────────────────────────────
  const [choiceModalOpen, setChoiceModalOpen] = useState(false);

  // ── Live session state ─────────────────────────────────────────────────
  const [liveSlide,   setLiveSlide]   = useState<number | null>(null);
  const [liveSection, setLiveSection] = useState<LiveSection | null>(null);

  // ── Course shell + unit list ───────────────────────────────────────────
  const { state, selectUnit } = useClassroom(courseId, unitId, isTeacher);
  const {
    classroom, course, units, currentUnit,
    loading: courseLoading,
    error:   courseError,
  } = state;

  // ── Unit detail ────────────────────────────────────────────────────────
  const { unit: unitDetail, loading: unitLoading, error: unitError, reload: reloadUnit } = useStudentUnit(
    currentUnit?.id ?? null
  );

  // ── Slides ─────────────────────────────────────────────────────────────
  const {
    slides:  presentationSlides,
    loading: slidesLoading,
    error:   slidesError,
  } = useUnitPresentation(currentUnit?.id ?? null);

  // ── Content flags ──────────────────────────────────────────────────────
  const hasPresentationContent = presentationSlides.length > 0 || slidesLoading;
  const hasTaskContent  = (unitDetail?.tasks?.length  ?? 0) > 0;
  const hasTestContent  = (unitDetail?.tests?.length  ?? 0) > 0;
  const useLessonWorkspace = hasPresentationContent || hasTaskContent || hasTestContent;
  const contentLoading = courseLoading || unitLoading;

  // ── Navigation ─────────────────────────────────────────────────────────
  const handleExitTeacher = useCallback(
    () => navigate('/admin/courses'),
    [navigate]
  );

  const handleBack = useCallback(
    () => navigate('/student/classes'),
    [navigate]
  );

  const handleSelectUnit = useCallback(
    (unit: ClassroomUnit) => {
      selectUnit(unit);
      navigate(`/student/classroom/${courseId}/${unit.id}`, { replace: true });
    },
    [selectUnit, navigate, courseId]
  );

  const handleOpenTask = useCallback(
    (task: { id: number }) => navigate(`/student/tasks/${task.id}`),
    [navigate]
  );
  const handleOpenTest = useCallback(
    (test: { id: number }) => navigate(`/student/tests/${test.id}/start`),
    [navigate]
  );
  const handleStartTest = useCallback(
    async (testId: number) => testsApi.startTest(testId),
    []
  );
  const handleLoadTask = useCallback(
    async (taskId: number): Promise<StudentTask> => {
      const result = await tasksApi.getTask(taskId);
      return result as StudentTask;
    },
    []
  );
  const handleSubmitTask = useCallback(
    async (payload: { task_id: number; answers: Record<string, unknown> }) => {
      const result = await tasksApi.submitTask(payload.task_id, payload.answers);
      reloadUnit();
      return result;
    },
    [reloadUnit]
  );
  const handleSubmitTest = useCallback(
    async (payload: { test_id: number; answers: Record<string, string> }) => {
      const result = await testsApi.submitTest(payload.test_id, payload.answers);
      reloadUnit();
      return result;
    },
    [reloadUnit]
  );

  // ── Live session callbacks ─────────────────────────────────────────────
  const handleLiveUnitChange = useCallback(
    (newUnitId: number) => {
      const unit = units.find((u) => u.id === newUnitId);
      if (unit) {
        selectUnit(unit);
        navigate(`/student/classroom/${courseId}/${newUnitId}`, { replace: true });
      }
    },
    [units, selectUnit, navigate, courseId]
  );

  const handleLiveSlideChange   = useCallback((index: number) => setLiveSlide(index), []);
  const handleLiveSectionChange = useCallback((section: LiveSection) => setLiveSection(section), []);

  // ── Material created → navigate to correct editor ─────────────────────
  const handleMaterialCreated = useCallback(
    ({ unitId: newUnitId, mode }: { unitId: number; mode: MaterialMode }) => {
      setChoiceModalOpen(false);
      if (mode === 'ai') {
        navigate(`/teacher/classroom/${courseId}/${newUnitId}/ai-builder`);
      } else {
        // Manual — navigate to unit context for now; editor to be built later
        navigate(`/teacher/classroom/${courseId}/${newUnitId}/editor`);
      }
    },
    [courseId, navigate]
  );

  // ── Render ─────────────────────────────────────────────────────────────

  // ── Teacher path ──────────────────────────────────────────────────────
  if (isTeacher) {
    const courseReady = !courseLoading && !courseError;
    const hasUnits    = units.length > 0;

    return (
      <ClassroomLayout>

        {/* Simplified teacher header */}
        <TeacherClassroomHeader
          course={course ?? { id: 0, title: courseLoading ? 'Loading…' : 'Untitled Course' }}
          onExit={handleExitTeacher}
        />

        {/* Error */}
        {courseError && (
          <ErrorState message={courseError} onBack={handleExitTeacher} />
        )}

        {/* Empty state */}
        {courseReady && !hasUnits && (
          <TeacherEmptyClassroom
            courseTitle={course?.title}
            onCreateMaterial={() => setChoiceModalOpen(true)}
          />
        )}

        {/* Units exist — future: teacher unit editor shell goes here */}
        {courseReady && hasUnits && (
          <main className="mx-auto w-full max-w-7xl px-4 py-8 md:px-6 lg:px-8">
            {/* Placeholder until teacher unit editor is built */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '60vh',
                fontFamily: "'Sora', system-ui, sans-serif",
                color: '#9188C4',
                fontSize: 14,
              }}
            >
              Unit editor coming soon
            </div>
          </main>
        )}

        {/* Material choice modal */}
        {course && (
          <MaterialChoiceModal
            open={choiceModalOpen}
            courseId={course.id}
            unitLevel={course.level}
            defaultOrderIndex={units.length}
            onClose={() => setChoiceModalOpen(false)}
            onCreated={handleMaterialCreated}
          />
        )}

      </ClassroomLayout>
    );
  }

  // ── Student path (unchanged) ───────────────────────────────────────────
  return (
    <LiveSessionProvider
      classroomId={Number(courseId)}
      role="student"
      userId={userId}
      onUnitChange={handleLiveUnitChange}
      onSlideChange={handleLiveSlideChange}
      onSectionChange={handleLiveSectionChange}
    >
      <ClassroomLayout>
        <ClassroomHeader
          classroom={classroom ?? undefined}
          course={course ?? { id: 0, title: 'Loading…' }}
          currentUnit={currentUnit}
          units={units}
          onBack={handleBack}
          onSelectUnit={handleSelectUnit}
        />

        <LiveSessionBanner />

        <main className="mx-auto w-full max-w-7xl px-4 py-8 md:px-6 lg:px-8">
          {courseError ? (
            <ErrorState message={courseError} onBack={handleBack} />
          ) : useLessonWorkspace ? (
            <LessonWorkspace
              unit={unitDetail as any}
              slides={presentationSlides as any}
              slidesLoading={slidesLoading}
              slidesError={slidesError ?? undefined}
              loading={contentLoading}
              error={unitError}
              taskSubmission={null}
              testAttempt={null}
              onLoadTask={handleLoadTask}
              onSubmitTask={handleSubmitTask}
              onSubmitTest={handleSubmitTest}
              onOpenTask={handleOpenTask}
              onOpenTest={handleOpenTest as (test: StudentTest) => void}
              onStartTest={handleStartTest}
              forcedSlide={liveSlide}
              forcedSection={liveSection}
            />
          ) : (
            <LessonWorkspace
              unit={unitDetail as any}
              slides={presentationSlides as any}
              slidesLoading={slidesLoading}
              slidesError={slidesError ?? undefined}
              loading={contentLoading}
              error={unitError}
              taskSubmission={null}
              testAttempt={null}
              onLoadTask={handleLoadTask}
              onSubmitTask={handleSubmitTask}
              onSubmitTest={handleSubmitTest}
              onOpenTask={handleOpenTask}
              onOpenTest={handleOpenTest as (test: StudentTest) => void}
              onStartTest={handleStartTest}
              forcedSlide={liveSlide}
              forcedSection={liveSection}
            />
          )}
          {!contentLoading && !courseError && !useLessonWorkspace && unitDetail && (
            <EmptyLesson unitTitle={unitDetail.title} />
          )}
        </main>

        {/* Teacher live controls — shown when a teacher joins as observer */}
        <TeacherLiveControls
          currentUnitId={currentUnit?.id ?? null}
          totalSlides={presentationSlides.length}
          hasTask={hasTaskContent}
          hasTest={hasTestContent}
        />

      </ClassroomLayout>
    </LiveSessionProvider>
  );
}

// ─── Page (outer) ─────────────────────────────────────────────────────────────

export default function ClassroomPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate     = useNavigate();
  const { user, isTeacher: userIsTeacher } = useAuth();

  if (!courseId) {
    return (
      <ErrorState
        message="No course specified in the URL."
        onBack={() => navigate('/student/classes')}
      />
    );
  }

  return (
    <ClassroomPageInner
      courseId={courseId}
      isTeacher={userIsTeacher}
      userId={user?.id ?? null}
    />
  );
}