/**
 * ClassroomPage.tsx  (v6 — Teacher Manual Builder Wiring)
 *
 * What changed from v5:
 * ─────────────────────
 * 1. UnitSelectorModal added — renders outside ClassroomLayout so it sits
 *    above the layout's z-stack.
 *
 * 2. `unitSelectorOpen` state controls the modal.  isFirstRun auto-opens it
 *    for teachers on an empty course once data has loaded.
 *
 * 3. `manualBuilderActive` boolean — set true when teacher clicks
 *    "Create unit manually".  Passed to LessonWorkspace as
 *    `startInManualBuilder` which boots it into ManualBuilderLauncher.
 *
 * 4. handleCreateUnit:
 *      'manual' → setManualBuilderActive(true)  (modal already closed itself)
 *      'ai'     → placeholder; modal handles its own state
 *
 * 5. LessonWorkspace now always rendered (removed StudentUnitWorkspace
 *    branch — LessonWorkspace v14 handles empty/no-content internally).
 *    Receives `mode` prop so it can distinguish teacher vs student.
 *
 * 6. All v5 live-session wiring is unchanged.
 */

import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

import ClassroomLayout   from '../../components/classroom/ClassroomLayout';
import ClassroomHeader   from '../../components/classroom/ClassroomHeader';
import LessonWorkspace   from '../../components/classroom/lesson/LessonWorkspace';
import UnitSelectorModal from '../../components/classroom/unit/UnitSelectorModal';
import type { CreatingUnitMode } from '../../components/classroom/unit/UnitSelectorModal';

import { useClassroom }        from '../../hooks/useClassroom';
import { useStudentUnit }      from '../../hooks/useStudentUnit';
import { useUnitPresentation } from '../../hooks/useUnitPresentation';
import { useAuth }             from '../../hooks/useAuth';
import type { ClassroomUnit }  from '../../hooks/useClassroom';
import type { StudentTask, StudentTest } from '../../hooks/useStudentUnit';
import { tasksApi, testsApi }  from '../../services/api';

// Live session components
import { LiveSessionProvider }  from '../../components/classroom/live/LiveSessionProvider';
import { LiveSessionBanner }    from '../../components/classroom/live/LiveSessionBanner';
import TeacherLiveControls      from '../../components/classroom/live/TeacherLiveControls';
import type { LiveSection }     from '../../components/classroom/live/liveSession.types';

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

  // ── Live session state ───────────────────────────────────────────────────
  const [liveSlide,   setLiveSlide]   = useState<number | null>(null);
  const [liveSection, setLiveSection] = useState<LiveSection | null>(null);

  // ── Course + units ───────────────────────────────────────────────────────
  const { state, selectUnit } = useClassroom(courseId, unitId, isTeacher);
  const {
    classroom, course, units, currentUnit,
    loading: courseLoading, error: courseError,
  } = state;

  // ── Unit detail + slides ─────────────────────────────────────────────────
  const {
    unit: unitDetail, loading: unitLoading, error: unitError, reload: reloadUnit,
  } = useStudentUnit(currentUnit?.id ?? null);

  const {
    slides: presentationSlides, loading: slidesLoading, error: slidesError,
    reload: reloadPresentation,
  } = useUnitPresentation(currentUnit?.id ?? null, isTeacher);

  // ── Unit selector modal ───────────────────────────────────────────────────
  const [unitSelectorOpen,    setUnitSelectorOpen]    = useState(false);
  /**
   * True once the teacher has clicked "Create unit manually" in the modal.
   * Passed to LessonWorkspace as `startInManualBuilder` so it skips the
   * TeacherBuilderEmptyState entry screen and lands on ManualBuilderLauncher.
   */
  const [manualBuilderActive, setManualBuilderActive] = useState(false);

  // Auto-open modal for teachers who have no units yet (after data loads).
  const isFirstRun = isTeacher && !courseLoading && units.length === 0;
  useEffect(() => {
    if (isFirstRun) setUnitSelectorOpen(true);
  }, [isFirstRun]);

  // ── Live session callbacks ────────────────────────────────────────────────
  const handleLiveUnitChange = useCallback(
    (newUnitId: number) => {
      const unit = units.find((u) => u.id === newUnitId);
      if (unit) {
        selectUnit(unit);
        navigate(`/student/classroom/${courseId}/${newUnitId}`, { replace: true });
      }
    },
    [units, selectUnit, navigate, courseId],
  );
  const handleLiveSlideChange   = useCallback((index: number)       => setLiveSlide(index),    []);
  const handleLiveSectionChange = useCallback((section: LiveSection) => setLiveSection(section), []);

  // ── Standard navigation ───────────────────────────────────────────────────
  const handleBack = useCallback(() => navigate('/student/classes'), [navigate]);

  const handleSelectUnit = useCallback(
    (unit: ClassroomUnit) => {
      selectUnit(unit);
      navigate(`/student/classroom/${courseId}/${unit.id}`, { replace: true });
    },
    [selectUnit, navigate, courseId],
  );

  const handleOpenTask = useCallback(
    (task: { id: number }) => navigate(`/student/tasks/${task.id}`),
    [navigate],
  );
  const handleOpenTest = useCallback(
    (test: { id: number }) => navigate(`/student/tests/${test.id}/start`),
    [navigate],
  );

  const handleStartTest = useCallback(
    async (testId: number) => testsApi.startTest(testId),
    [],
  );

  const handleLoadTask = useCallback(
    async (taskId: number): Promise<StudentTask> => {
      const result = await tasksApi.getTask(taskId);
      return result as StudentTask;
    },
    [],
  );

  const handleSubmitTask = useCallback(
    async (payload: { task_id: number; answers: Record<string, unknown> }) => {
      const result = await tasksApi.submitTask(payload.task_id, payload.answers);
      reloadUnit();
      return result;
    },
    [reloadUnit],
  );

  const handleSubmitTest = useCallback(
    async (payload: { test_id: number; answers: Record<string, string> }) => {
      const result = await testsApi.submitTest(payload.test_id, payload.answers);
      reloadUnit();
      return result;
    },
    [reloadUnit],
  );

  // ── Unit selector modal handlers ──────────────────────────────────────────
  const handleOpenUnitSelector  = useCallback(() => setUnitSelectorOpen(true),  []);
  const handleCloseUnitSelector = useCallback(() => setUnitSelectorOpen(false), []);

  /**
   * Called by UnitSelectorModal when the teacher picks a creation mode.
   *
   * For 'manual': UnitSelectorModal already called onClose() before firing
   * this callback, so the modal is already gone.  We just activate the
   * in-classroom builder by flipping manualBuilderActive.
   *
   * For 'ai': still placeholder — modal shows its own AI placeholder state.
   */
  const handleCreateUnit = useCallback((mode: CreatingUnitMode) => {
    if (mode === 'manual') {
      setManualBuilderActive(true);
    }
  }, []);

  const handleContentSaved = useCallback(async () => {
    setManualBuilderActive(false);
    await reloadPresentation();
  }, [reloadPresentation]);

  // ── Derived flags ─────────────────────────────────────────────────────────
  const hasTaskContent = (unitDetail?.tasks?.length  ?? 0) > 0;
  const hasTestContent = (unitDetail?.tests?.length  ?? 0) > 0;
  const contentLoading = courseLoading || unitLoading;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <LiveSessionProvider
      classroomId={Number(courseId)}
      role={isTeacher ? 'teacher' : 'student'}
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
          onOpenUnitSelector={handleOpenUnitSelector}
        />

        <LiveSessionBanner />

        <main className="mx-auto w-full max-w-7xl px-4 py-8 md:px-6 lg:px-8">
          {courseError ? (
            <ErrorState message={courseError} onBack={handleBack} />
          ) : (
            /*
             * LessonWorkspace v14 handles all render cases internally:
             *   - loading skeleton
             *   - no-unit empty state
             *   - teacher builder stages (entry / manual-choice / editing)
             *   - normal student lesson player
             *
             * startInManualBuilder={manualBuilderActive} skips 'entry' and
             * lands directly on ManualBuilderLauncher when the teacher has
             * chosen to build manually from the modal.
             */
            <LessonWorkspace
              mode={isTeacher ? 'teacher' : 'student'}
              unit={unitDetail ?? null}
              slides={presentationSlides}
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
              onContentSaved={handleContentSaved}
              startInManualBuilder={manualBuilderActive}
            />
          )}
        </main>

        {isTeacher && (
          <TeacherLiveControls
            currentUnitId={currentUnit?.id ?? null}
            totalSlides={presentationSlides.length}
            hasTask={hasTaskContent}
            hasTest={hasTestContent}
          />
        )}
      </ClassroomLayout>

      {/*
        Rendered outside ClassroomLayout so it sits above the z-stack.
        Students use it to switch units; teachers also get creation CTAs
        when no units exist yet.
      */}
      <UnitSelectorModal
        open={unitSelectorOpen}
        units={units}
        currentUnitId={currentUnit?.id ?? null}
        onClose={handleCloseUnitSelector}
        onSelectUnit={handleSelectUnit}
        courseTitle={course?.title}
        isTeacher={isTeacher}
        onCreateUnit={handleCreateUnit}
      />
    </LiveSessionProvider>
  );
}

// ─── Page (outer) ─────────────────────────────────────────────────────────────

export default function ClassroomPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate     = useNavigate();

  if (!courseId) {
    return (
      <ErrorState
        message="No course specified in the URL."
        onBack={() => navigate('/student/classes')}
      />
    );
  }

  const { user, isTeacher: userIsTeacher } = useAuth();

  return (
    <ClassroomPageInner
      courseId={courseId}
      isTeacher={userIsTeacher}
      userId={user?.id ?? null}
    />
  );
}