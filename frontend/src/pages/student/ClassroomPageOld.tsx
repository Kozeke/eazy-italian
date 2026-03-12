/**
 * ClassroomPage.tsx  (v4)
 *
 * Route: /student/classroom/:courseId/:unitId?
 *
 * What changed from v3:
 * ─────────────────────
 * 1. useUnitPresentation(currentUnit?.id) is called alongside useStudentUnit.
 *    It fetches GET /api/v1/admin/units/{id}/presentations and then the first
 *    presentation's slides. No new endpoints are introduced.
 *
 * 2. LessonWorkspace is rendered when the unit has ANY of:
 *      - a presentation with slides
 *      - a task
 *      - a test
 *    If the unit has only videos (or nothing), it falls back to the original
 *    StudentUnitWorkspace tab view — zero regression for existing courses.
 *
 * 3. taskSubmission and testAttempt are currently passed as null.
 *    These should be wired to a student submission/attempt hook once one
 *    exists in the codebase.
 *
 * Everything else (ClassroomHeader, unit selector modal, route params,
 * handleSelectUnit optimistic update) is unchanged from v3.
 *
 * Data loading pipeline
 * ──────────────────────
 * 1. useClassroom(courseId, unitId)       → course + units + currentUnit
 * 2. useStudentUnit(currentUnit.id)       → unit detail (tasks, tests, videos)
 * 3. useUnitPresentation(currentUnit.id)  → presentation + ReviewSlide[]
 * 4. LessonWorkspace / StudentUnitWorkspace → renders the resolved content
 */

import React, { useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

import ClassroomLayout        from '../../components/classroom/ClassroomLayout';
import ClassroomHeader        from '../../components/classroom/ClassroomHeader';
import StudentUnitWorkspace   from '../../components/classroom/unit/StudentUnitWorkspace';
import LessonWorkspace        from '../../components/classroom/lesson/LessonWorkspace';

import { useClassroom }          from '../../hooks/useClassroom';
import { useStudentUnit }        from '../../hooks/useStudentUnit';
import { useUnitPresentation }   from '../../hooks/useUnitPresentation';
import type { ClassroomUnit }    from '../../hooks/useClassroom';

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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ClassroomPage() {
  const { courseId, unitId } = useParams<{ courseId: string; unitId?: string }>();
  const navigate = useNavigate();

  // ── Step 1: course shell + units ────────────────────────────────────────
  const { state, selectUnit } = useClassroom(courseId, unitId);
  const {
    classroom,
    course,
    units,
    currentUnit,
    loading: courseLoading,
    error:   courseError,
  } = state;

  // ── Step 2: full unit detail — tasks, tests, videos ─────────────────────
  const {
    unit:    unitDetail,
    loading: unitLoading,
    error:   unitError,
  } = useStudentUnit(currentUnit?.id ?? null);

  // ── Step 3: presentation + slides for this unit ──────────────────────────
  //
  // Calls:
  //   GET /api/v1/admin/units/{unitId}/presentations
  //   GET /api/v1/admin/presentations/{presId}/slides
  //
  // Same endpoints AdminGenerateSlidePage uses — no new API surface.
  // Returns empty slides[] gracefully when no presentation exists.
  const {
    slides:         presentationSlides,
    loading:        slidesLoading,
    error:          slidesError,
  } = useUnitPresentation(currentUnit?.id ?? null);

  // ── Handlers ────────────────────────────────────────────────────────────

  const handleBack = useCallback(
    () => navigate('/student/classes'),
    [navigate]
  );

  /**
   * Optimistic unit switch:
   * 1. selectUnit() → header title updates immediately
   * 2. navigate() → URL stays in sync; useStudentUnit + useUnitPresentation
   *    both re-fire via currentUnit.id change
   */
  const handleSelectUnit = useCallback(
    (unit: ClassroomUnit) => {
      selectUnit(unit);
      navigate(`/student/classroom/${courseId}/${unit.id}`, { replace: true });
    },
    [selectUnit, navigate, courseId]
  );

  const handleStartVideo = useCallback(
    (video: { id: number }) => navigate(`/student/videos/${video.id}`),
    [navigate]
  );
  const handleOpenTask = useCallback(
    (task: { id: number }) => navigate(`/student/tasks/${task.id}`),
    [navigate]
  );
  const handleStartTest = useCallback(
    (test: { id: number }) => navigate(`/student/tests/${test.id}/start`),
    [navigate]
  );

  // ── Decide which workspace to show ───────────────────────────────────────
  //
  // Use LessonWorkspace when the unit has a presentation, task, OR test.
  // Fall back to StudentUnitWorkspace (tab view) only for video-only units.
  //
  // We check tasks/tests from unitDetail rather than the currentUnit stub
  // so we have full detail (instructions, settings, etc.) before deciding.
  const hasPresentationContent = presentationSlides.length > 0 || slidesLoading;
  const hasTaskContent  = (unitDetail?.tasks?.length  ?? 0) > 0;
  const hasTestContent  = (unitDetail?.tests?.length  ?? 0) > 0;
  const useLessonWorkspace =
    hasPresentationContent || hasTaskContent || hasTestContent;

  // Combined loading state: show skeleton until at least unit detail resolved
  const contentLoading = courseLoading || unitLoading;

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <ClassroomLayout>
      <ClassroomHeader
        classroom={classroom ?? undefined}
        course={course ?? { id: 0, title: 'Loading…' }}
        currentUnit={currentUnit}
        units={units}
        onBack={handleBack}
        onSelectUnit={handleSelectUnit}
      />

      <main className="mx-auto w-full max-w-7xl px-4 py-8 md:px-6 lg:px-8">
        {courseError ? (
          <ErrorState message={courseError} onBack={handleBack} />
        ) : useLessonWorkspace ? (
          /**
           * LessonWorkspace — for units with slides / task / test.
           *
           * taskSubmission and testAttempt are currently null.
           * Wire to a student-submission hook once it exists, e.g.:
           *   const { submission } = useMyTaskSubmission(primaryTask?.id)
           *   const { attempt }    = useMyTestAttempt(primaryTest?.id)
           */
          <LessonWorkspace
            unit={unitDetail ?? null}
            slides={presentationSlides}
            slidesLoading={slidesLoading}
            slidesError={slidesError ?? undefined}
            loading={contentLoading}
            error={unitError}
            taskSubmission={null}   // TODO: wire useMyTaskSubmission
            testAttempt={null}      // TODO: wire useMyTestAttempt
            onOpenTask={handleOpenTask}
            onStartTest={handleStartTest}
          />
        ) : (
          /**
           * StudentUnitWorkspace — original tab view.
           * Used for video-only units or when all three sections are absent.
           * Zero regression for existing courses.
           */
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
    </ClassroomLayout>
  );
}
