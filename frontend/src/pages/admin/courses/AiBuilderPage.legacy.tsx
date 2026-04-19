/**
 * AiBuilderPage.legacy.tsx
 *
 * Route entry point for the AI course building flow (legacy; App.tsx redirects /ai-builder to unit classroom — re-mount to restore).
 * Was mounted at: /teacher/classroom/:courseId/:unitId/ai-builder
 *
 * ── Two-phase state machine ────────────────────────────────────────────────
 *   phase = 'wizard'   → AiCourseWizard   (form: modules, focus, files)
 *   phase = 'outline'  → CourseOutlineView (show generated modules + lessons)
 *
 *   Transition: wizard calls onOutlineReady → flip to 'outline'
 *   Outline "Start building" → navigate to the existing builder
 *     (currently /admin/courses/builder — reuses TeacherOnboardingPage builder phase)
 *
 * ── What this does NOT do ─────────────────────────────────────────────────
 *   • It does not build lesson content (slides / tasks / test).
 *   • It does not replace any existing builder pages.
 *   • "Start building" navigation target can be swapped later.
 *
 * ── Uses ClassroomLayout so the admin sidebar stays hidden ────────────────
 *   ClassroomLayout adds body.classroom-mode which triggers the CSS in
 *   classroom-mode.css.  TeacherClassroomHeader is shown at the top.
 */

import { useCallback, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

import ClassroomLayout         from '../../../components/classroom/ClassroomLayout';
import TeacherClassroomHeader  from '../../student/TeacherClassroomHeader';
import AiCourseWizard          from '../../../components/admin/courseBuilder/AiCourseWizard';
import CourseOutlineView       from '../../../components/admin/courseBuilder/CourseOutlineView';
import { useClassroom }        from '../../../hooks/useClassroom';

import type { CourseOutline, WizardConfig } from '../../../components/admin/courseBuilder/AiCourseWizard';

// ─── Phase type ───────────────────────────────────────────────────────────────

type Phase = 'wizard' | 'outline';

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AiBuilderPage() {
  const { courseId, unitId } = useParams<{ courseId: string; unitId: string }>();
  const navigate             = useNavigate();

  // ── Course metadata (for the header and wizard subject) ───────────────────
  const { state } = useClassroom(courseId ?? null);
  const course    = state.course;

  // ── Phase state ───────────────────────────────────────────────────────────
  const [phase,   setPhase]   = useState<Phase>('wizard');
  const [outline, setOutline] = useState<CourseOutline | null>(null);
  const [config,  setConfig]  = useState<WizardConfig | null>(null);

  // ── Transitions ───────────────────────────────────────────────────────────

  const handleOutlineReady = useCallback(
    (generatedOutline: CourseOutline, wizardConfig: WizardConfig) => {
      setOutline(generatedOutline);
      setConfig(wizardConfig);
      setPhase('outline');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [],
  );

  const handleBackToWizard = useCallback(() => {
    setPhase('wizard');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // Returns to catalog because full-screen TeacherOnboarding builder lives in *.legacy.jsx and its /admin/courses/builder route is disabled.
  const handleStartBuilding = useCallback(
    (_builtOutline: CourseOutline, _builtConfig: WizardConfig) => {
      // Legacy hand-off (outline + courseData via location.state) — re-enable when AdminRoutes mounts TeacherOnboarding.legacy again:
      // navigate('/admin/courses/builder', {
      //   state: {
      //     outline: builtOutline,
      //     courseData: { subject, level, nativeLanguage, unitCount, extraInstructions },
      //     uploadedFiles: [],
      //     courseId: courseId ? Number(courseId) : undefined,
      //     unitId: unitId ? Number(unitId) : undefined,
      //   },
      // });
      void _builtOutline;
      void _builtConfig;
      navigate('/admin/courses');
    },
    [navigate],
  );

  const handleExitToAdmin = useCallback(
    () => navigate('/admin/courses'),
    [navigate],
  );

  const handleBackFromWizard = useCallback(
    () => navigate(-1),
    [navigate],
  );

  // ── Guards ────────────────────────────────────────────────────────────────
  if (!courseId || !unitId) {
    return (
      <div style={{ padding: 48, textAlign: 'center', fontFamily: 'system-ui', color: '#8b85a0' }}>
        Missing course or unit in URL.
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <ClassroomLayout>
      {/* Simplified teacher header */}
      <TeacherClassroomHeader
        course={
          course
            ? { id: course.id, title: course.title, thumbnail_url: course.thumbnail_url }
            : { id: Number(courseId), title: state.loading ? 'Loading…' : 'Course' }
        }
        onExit={handleExitToAdmin}
      />

      {/* Phase: wizard */}
      {phase === 'wizard' && (
        <AiCourseWizard
          courseId={Number(courseId)}
          courseTitle={course?.title ?? ''}
          unitId={Number(unitId)}
          onOutlineReady={handleOutlineReady}
          onBack={handleBackFromWizard}
        />
      )}

      {/* Phase: outline */}
      {phase === 'outline' && outline && config && (
        <CourseOutlineView
          outline={outline}
          config={config}
          onStartBuilding={handleStartBuilding}
          onBack={handleBackToWizard}
        />
      )}
    </ClassroomLayout>
  );
}