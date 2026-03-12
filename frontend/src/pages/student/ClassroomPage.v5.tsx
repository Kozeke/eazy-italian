/**
 * ClassroomPage.tsx  (v5 — Live Session)
 *
 * What changed from v4:
 * ─────────────────────
 * 1. Wrapped in <LiveSessionProvider> which manages the WebSocket transport
 *    transport and exposes session state + actions via context.
 *
 * 2. When the teacher changes unit/slide/section via the live session,
 *    ClassroomPage receives the callbacks (onUnitChange, onSlideChange,
 *    onSectionChange) and updates its own navigation state so the URL
 *    and content stay in sync.
 *
 * 3. LiveSessionBanner is shown at the top of main content (student only).
 *
 * 4. TeacherLiveControls is rendered as a floating overlay (teacher only).
 *    It receives totalSlides, hasTask, hasTest so it can enable/disable
 *    the right section buttons.
 *
 * 5. When a live session is active and the student has NOT detached,
 *    student slide navigation is locked — the SlidesSection/SlidesPlayer
 *    receives a `locked` prop (added in this PR) that disables prev/next.
 *
 * 6. The `currentSlide` from the live session is passed into LessonWorkspace
 *    as `forcedSlide` so it can override the internal SlidesSection state
 *    when following the teacher.
 *
 * Everything else from v4 is unchanged.
 *
 * ─── Backend requirements introduced by live mode ────────────────────────────
 *
 * OPTION A — WebSocket (preferred):
 *   WS  /ws/v1/classrooms/{classroomId}/live?token=<jwt>
 *   JSON messages: { event: LiveEventName, payload: LiveSessionPayload }
 *   Server tracks session state and fans out events to all subscribers.
 *   Student count is included in HEARTBEAT / STUDENT_JOINED payloads.
 *
 * NOTE:
 *   HTTP polling fallback has been removed. Live mode requires WebSocket.
 *
 * The WS endpoint is the only new backend surface.
 * All existing course / unit / slide APIs are unchanged.
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

// Live session components
import { LiveSessionProvider }    from '../../components/classroom/live/LiveSessionProvider';
import { LiveSessionBanner }      from '../../components/classroom/live/LiveSessionBanner';
import TeacherLiveControls        from '../../components/classroom/live/TeacherLiveControls';
import type { LiveSection }       from '../../components/classroom/live/liveSession.types';

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

// ─── Inner page (needs LiveSessionProvider above it) ─────────────────────────

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

  // ── Live session: forced slide / section state ──────────────────────────
  const [liveSlide,   setLiveSlide]   = useState<number | null>(null);
  const [liveSection, setLiveSection] = useState<LiveSection | null>(null);

  // ── Step 1: course shell + units ────────────────────────────────────────
  const { state, selectUnit } = useClassroom(courseId, unitId);
  const { classroom, course, units, currentUnit, loading: courseLoading, error: courseError } = state;

  // ── Step 2: full unit detail ─────────────────────────────────────────────
  const { unit: unitDetail, loading: unitLoading, error: unitError } = useStudentUnit(currentUnit?.id ?? null);

  // ── Step 3: presentation + slides ────────────────────────────────────────
  const { slides: presentationSlides, loading: slidesLoading, error: slidesError } = useUnitPresentation(currentUnit?.id ?? null);

  // ── Live session callbacks (wired into LiveSessionProvider) ─────────────
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

  const handleLiveSlideChange = useCallback((index: number) => {
    setLiveSlide(index);
  }, []);

  const handleLiveSectionChange = useCallback((section: LiveSection) => {
    setLiveSection(section);
  }, []);

  // ── Standard navigation handlers ────────────────────────────────────────
  const handleBack = useCallback(() => navigate('/student/courses'), [navigate]);

  const handleSelectUnit = useCallback(
    (unit: ClassroomUnit) => {
      selectUnit(unit);
      navigate(`/student/classroom/${courseId}/${unit.id}`, { replace: true });
    },
    [selectUnit, navigate, courseId]
  );

  const handleStartVideo = useCallback((video: { id: number }) => navigate(`/student/videos/${video.id}`), [navigate]);
  const handleOpenTask   = useCallback((task: { id: number })  => navigate(`/student/tasks/${task.id}`), [navigate]);
  const handleStartTest  = useCallback((test: { id: number })  => navigate(`/student/tests/${test.id}/start`), [navigate]);

  // ── Workspace selector ───────────────────────────────────────────────────
  const hasPresentationContent = presentationSlides.length > 0 || slidesLoading;
  const hasTaskContent  = (unitDetail?.tasks?.length  ?? 0) > 0;
  const hasTestContent  = (unitDetail?.tests?.length  ?? 0) > 0;
  const useLessonWorkspace = hasPresentationContent || hasTaskContent || hasTestContent;
  const contentLoading = courseLoading || unitLoading;

  return (
    /**
     * Provide live session callbacks here, inside the Provider that was
     * created in the outer ClassroomPage with the correct classroomId.
     */
    <LiveSessionProvider
      classroomId={Number(courseId)} // use actual classroom id if different
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
        />

        {/* Student live banner — sticks just below the header */}
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
              taskSubmission={null}
              testAttempt={null}
              onOpenTask={handleOpenTask}
              onStartTest={handleStartTest}
              /** Live overrides — null means "use internal state" */
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
        onBack={() => navigate('/student/courses')}
      />
    );
  }

  /**
   * isTeacher / userId:
   * Replace with your actual auth hook, e.g.:
   *   const { user, role } = useAuth();
   *   const isTeacher = role === 'teacher' || role === 'admin';
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
