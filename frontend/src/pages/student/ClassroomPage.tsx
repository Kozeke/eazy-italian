/**
 * ClassroomPage.tsx  (v6 — full inline lesson flow)
 *
 * What changed from v5 (Live Session):
 * ─────────────────────────────────────
 * 1. Wires onSubmitTask / onSubmitTest so TaskSection and TestSection can
 *    submit inline without leaving the classroom page.
 *
 * 2. Tracks aggregate lesson progress (0-100) via LessonWorkspace's
 *    onProgressChange callback and passes it to ClassroomHeader as `progress`.
 *
 * 3. Exposes a minimal submission/attempt hook pattern so the parent can
 *    swap in real API hooks once available. Currently uses local state.
 *
 * ─── Inline submission wiring ────────────────────────────────────────────────
 *
 * Tasks:
 *   POST /api/v1/student/tasks/{taskId}/submit
 *   body: { answers: Record<string, any> }
 *   → 200 { submission }
 *
 * Tests:
 *   POST /api/v1/student/tests/{testId}/submit
 *   body: { answers: Record<string, string> }
 *   → 200 { attempt: { score, passed, review[] } }
 *
 * These are standard student submission endpoints. Replace the stub
 * implementations below with your real API calls.
 */

import React, { useCallback, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

import ClassroomLayout       from '../../components/classroom/ClassroomLayout';
import ClassroomHeader       from '../../components/classroom/ClassroomHeader';
import StudentUnitWorkspace  from '../../components/classroom/unit/StudentUnitWorkspace';
import LessonWorkspace       from '../../components/classroom/lesson/LessonWorkspace';

import { useClassroom }        from '../../hooks/useClassroom';
import { useStudentUnit }      from '../../hooks/useStudentUnit';
import { useUnitPresentation } from '../../hooks/useUnitPresentation';
import type { ClassroomUnit }  from '../../hooks/useClassroom';

// Live session
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

// ─── Stub API helpers (replace with real calls) ───────────────────────────────
//
// These are thin wrappers around fetch. Swap them out for your
// existing api service layer (e.g. tasksApi.submitStudentTask).

async function submitTaskApi(
  taskId: number,
  answers: Record<string, unknown>
): Promise<{ id: number; status: string; score?: number | null; submitted_at: string }> {
  const token = localStorage.getItem('token');
  const res = await fetch(`/api/v1/student/tasks/${taskId}/submit`, {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ answers }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? 'Task submission failed');
  }
  return res.json();
}

async function submitTestApi(
  testId: number,
  answers: Record<string, string>
): Promise<{
  id: number;
  status: string;
  score?: number | null;
  passed?: boolean | null;
  submitted_at: string;
  review?: Array<{ question_id: number; correct: boolean; correct_answer?: string }>;
}> {
  const token = localStorage.getItem('token');
  const res = await fetch(`/api/v1/student/tests/${testId}/submit`, {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ answers }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? 'Test submission failed');
  }
  return res.json();
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

  // ── Live session overrides ────────────────────────────────────────────────
  const [liveSlide,   setLiveSlide]   = useState<number | null>(null);
  const [liveSection, setLiveSection] = useState<LiveSection | null>(null);

  // ── Progress for header ProgressPill ─────────────────────────────────────
  const [lessonProgress, setLessonProgress] = useState(0);

  // ── Submission state (local — replace with API-backed hooks) ─────────────
  const [taskSubmission, setTaskSubmission] = useState<unknown>(null);
  const [testAttempt,    setTestAttempt]    = useState<unknown>(null);

  // ── Data hooks ────────────────────────────────────────────────────────────
  const { state, selectUnit } = useClassroom(courseId, unitId);
  const { classroom, course, units, currentUnit, loading: courseLoading, error: courseError } = state;

  const { unit: unitDetail, loading: unitLoading, error: unitError } = useStudentUnit(currentUnit?.id ?? null);

  const { slides: presentationSlides, loading: slidesLoading, error: slidesError } = useUnitPresentation(currentUnit?.id ?? null);

  // Reset submission state when unit changes
  const prevUnitId = useRef<number | null>(null);
  React.useEffect(() => {
    if (currentUnit?.id !== prevUnitId.current) {
      setTaskSubmission(null);
      setTestAttempt(null);
      setLessonProgress(0);
      prevUnitId.current = currentUnit?.id ?? null;
    }
  }, [currentUnit?.id]);

  // ── Live session callbacks ────────────────────────────────────────────────
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

  const handleLiveSlideChange  = useCallback((index: number) => setLiveSlide(index), []);
  const handleLiveSectionChange = useCallback((section: LiveSection) => setLiveSection(section), []);

  // ── Navigation ────────────────────────────────────────────────────────────
  const handleBack = useCallback(() => navigate('/student/classes'), [navigate]);

  const handleSelectUnit = useCallback(
    (unit: ClassroomUnit) => {
      selectUnit(unit);
      navigate(`/student/classroom/${courseId}/${unit.id}`, { replace: true });
    },
    [selectUnit, navigate, courseId]
  );

  const handleStartVideo = useCallback((v: { id: number }) => navigate(`/student/videos/${v.id}`), [navigate]);
  const handleOpenTask   = useCallback((t: { id: number }) => navigate(`/student/tasks/${t.id}`), [navigate]);
  const handleStartTest  = useCallback((t: { id: number }) => navigate(`/student/tests/${t.id}/start`), [navigate]);

  // ── Inline submission handlers ────────────────────────────────────────────
  const handleSubmitTask = useCallback(
    async (payload: { task_id: number; answers: Record<string, unknown> }) => {
      const submission = await submitTaskApi(payload.task_id, payload.answers);
      setTaskSubmission(submission);
    },
    []
  );

  const handleSubmitTest = useCallback(
    async (payload: { test_id: number; answers: Record<string, string> }) => {
      const attempt = await submitTestApi(payload.test_id, payload.answers);
      setTestAttempt(attempt);
      return attempt;
    },
    []
  );

  // ── Workspace selector ────────────────────────────────────────────────────
  const hasPresentationContent = presentationSlides.length > 0 || slidesLoading;
  const hasTaskContent  = (unitDetail?.tasks?.length  ?? 0) > 0;
  const hasTestContent  = (unitDetail?.tests?.length  ?? 0) > 0;
  const useLessonWorkspace = hasPresentationContent || hasTaskContent || hasTestContent;
  const contentLoading = courseLoading || unitLoading;

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
          progress={lessonProgress}
          onBack={handleBack}
          onSelectUnit={handleSelectUnit}
        />

        {/* Student live banner */}
        <LiveSessionBanner />

        <main className="mx-auto w-full max-w-7xl px-4 py-8 md:px-6 lg:px-8">
          {courseError ? (
            <ErrorState message={courseError} onBack={handleBack} />
          ) : useLessonWorkspace ? (
            <LessonWorkspace
              unit={unitDetail ?? null}
              slides={presentationSlides}
              slidesLoading={slidesLoading}
              slidesError={slidesError ?? undefined}
              loading={contentLoading}
              error={unitError}
              taskSubmission={taskSubmission}
              testAttempt={testAttempt}
              onOpenTask={handleOpenTask}
              onStartTest={handleStartTest}
              onSubmitTask={handleSubmitTask}
              onSubmitTest={handleSubmitTest}
              onProgressChange={setLessonProgress}
              forcedSlide={liveSlide}
              forcedSection={liveSection}
            />
          ) : (
            <StudentUnitWorkspace
              unit={unitDetail ?? null}
              course={course}
              loading={contentLoading}
              error={unitError}
              onStartVideo={handleStartVideo}
              onOpenTask={handleOpenTask}
              onStartTest={handleStartTest}
            />
          )}
        </main>

        {/* Teacher-only floating controls */}
        {isTeacher && (
          <TeacherLiveControls
            currentUnitId={currentUnit?.id ?? null}
            totalSlides={presentationSlides.length}
            hasTask={hasTaskContent}
            hasTest={hasTestContent}
          />
        )}
      </ClassroomLayout>
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

  /**
   * Replace with your auth hook:
   *   const { user, role } = useAuth();
   *   const isTeacher = role === 'teacher' || role === 'admin';
   *   const userId    = user?.id ?? null;
   */
  const isTeacher = false; // TODO: wire useAuth()
  const userId    = null;  // TODO: wire useAuth()

  return (
    <ClassroomPageInner
      courseId={courseId}
      isTeacher={isTeacher}
      userId={userId}
    />
  );
}
