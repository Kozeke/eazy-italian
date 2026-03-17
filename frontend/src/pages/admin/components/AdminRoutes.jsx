/**
 * AdminRoutes.jsx
 *
 * Course-first admin routing.
 *
 * STRUCTURE:
 *   /admin                     → AdminLayout (sidebar shell)
 *   /admin/                    → AdminDashboardPage (redirect → /admin/courses)
 *   /admin/courses             → AdminCoursesCatalog  ← PRIMARY
 *   /admin/courses/builder     → TeacherOnboardingPage (AI course builder)
 *   /admin/courses/new         → AdminCourseCreatePage (manual)
 *   /admin/courses/:id         → AdminCourseDetailPage (unit tree)
 *   /admin/courses/:id/edit    → AdminCourseEditPage
 *   /admin/students            → AdminStudentsPage
 *   /admin/grades              → AdminGradesPage
 *   ── Content Library (preserved, de-emphasised) ──
 *   /admin/units               → AdminUnitsPage
 *   /admin/units/new           → AdminUnitCreatePage
 *   /admin/units/:id           → AdminUnitDetailPage
 *   /admin/units/:id/edit      → AdminUnitEditPage
 *   /admin/videos              → AdminVideosPage
 *   /admin/videos/new          → AdminVideoCreatePage
 *   /admin/videos/:id/edit     → AdminVideoEditPage
 *   /admin/tasks               → AdminTasksPage
 *   /admin/tasks/new           → AdminTaskCreatePage
 *   /admin/tasks/:id           → AdminTaskDetailPage
 *   /admin/tasks/:id/edit      → AdminTaskEditPage
 *   /admin/tests               → AdminTestsPage
 *   /admin/tests/new           → AdminTestCreatePage
 *   /admin/tests/:id           → AdminTestDetailsPage
 *   /admin/tests/:id/edit      → AdminTestEditPage
 *   /admin/generate-slide        → AdminGenerateSlidePage (full-screen AI wizard)
 *   /admin/presentations/:id/edit → AdminPresentationEditPage (full-screen editor)
 *   /admin/slides/review          → ReviewSlidesPage
 *
 * HOW TO USE:
 *   Replace your existing admin Route block with this component.
 *   Example (in your App.tsx / main router):
 *
 *     import AdminRoutes from './AdminRoutes';
 *     ...
 *     <Route path="/admin/*" element={<AdminRoutes />} />
 *
 * This file is a DROP-IN upgrade — all old routes still work.
 */

import { Routes, Route, Navigate, useParams } from "react-router-dom";
import AdminLayout             from "./AdminLayout";

// Pages
import AdminDashboardPage      from "../AdminDashboardPage";
import AdminCoursesCatalog     from "../AdminCoursesCatalog";
import AdminCourseDetailPage   from "../AdminCourseDetailPage";
import AdminCourseCreatePage   from "../AdminCourseCreatePage";
import AdminCourseEditPage     from "../AdminCourseEditPage";

import AdminStudentsPage       from "../AdminStudentsPage";
import AdminStudentViewPage    from "../AdminStudentViewPage";
import AdminGradesPage         from "../AdminGradesPage";
import AdminGradeDetailPage    from "../AdminGradeDetailPage";

import AdminUnitsPage          from "../AdminUnitsPage";
import AdminUnitCreatePage     from "../AdminUnitCreatePage";
import AdminUnitDetailPage     from "../AdminUnitDetailPage";
import AdminUnitEditPage       from "../AdminUnitEditPage";

import AdminVideosPage         from "../AdminVideosPage";
import AdminVideoCreatePage    from "../AdminVideoCreatePage";
import AdminVideoEditPage      from "../AdminVideoEditPage";

import AdminTasksPage          from "../AdminTasksPage";
import AdminTaskDetailPage     from "../AdminTaskDetailPage";
import AdminTaskGradingPage    from "../AdminTaskGradingPage";
import AdminTaskSubmissionsPage from "../AdminTaskSubmissionsPage";
import { TaskBuilderPage }     from "../AdminTaskBuilder";

import AdminTestsPage          from "../AdminTestsPage";
import AdminTestCreatePage     from "../AdminTestCreatePage";
import AdminTestDetailsPage    from "../AdminTestDetailsPage";
import AdminTestEditPage       from "../AdminTestEditPage";
import AdminTestAnalyticsPage  from "../AdminTestAnalyticsPage";
import AdminTestPreviewPage    from "../AdminTestPreviewPage";

import TeacherOnboardingPage   from "../TeacherOnboarding";
import AdminGenerateSlidePage  from "../AdminGenerateSlidePage";
import AdminPresentationEditPage from "../AdminPresentationEditPage";
import { TestBuilderPage }     from "../AdminTestBuilder";

import { ReviewSlidesPage }    from "../ReviewSlidesPage";

// NOTE: /teacher/classroom/* routes are registered at the top level in App.tsx

// Redirect component for task edit route
function TaskEditRedirect() {
  const { id } = useParams();
  return <Navigate to={`/admin/tasks/${id}/builder`} replace />;
}

export default function AdminRoutes() {
  return (
    <Routes>
      {/* ── Onboarding: full-screen, no sidebar ── */}
      <Route path="onboarding" element={<TeacherOnboardingPage />} />

      {/* ── Slide generator: full-screen ── */}
      <Route path="generate-slide" element={<AdminGenerateSlidePage />} />

      {/* ── Presentation editor: full-screen (wraps SlideEditorPage) ── */}
      <Route path="presentations/:presId/edit" element={<AdminPresentationEditPage />} />

      {/* ── Test Builder: full-screen (no sidebar) ── */}
      <Route path="tests/:testId/builder" element={<TestBuilderPage />} />
      
      {/* ── Test Preview: full-screen (no sidebar) ── */}
      <Route path="tests/:testId/preview" element={<AdminTestPreviewPage />} />

      {/* ── Task Builder: full-screen (no sidebar) ── */}
      <Route path="tasks/builder" element={<TaskBuilderPage />} />
      <Route path="tasks/builder/new" element={<TaskBuilderPage />} />
      <Route path="tasks/:taskId/builder" element={<TaskBuilderPage />} />

      {/* ── All other admin pages: inside sidebar layout ── */}
      <Route element={<AdminLayout />}>

        {/* Root → redirect logic in dashboard */}
        <Route index element={<AdminDashboardPage />} />

        {/* ── COURSES (primary) ── */}
        <Route path="courses">
          <Route index element={<AdminCoursesCatalog />} />
          <Route path="builder" element={<TeacherOnboardingPage />} />
          <Route path="new"     element={<AdminCourseCreatePage />} />
          <Route path=":id"     element={<AdminCourseDetailPage />} />
          <Route path=":id/edit" element={<AdminCourseEditPage />} />
        </Route>

        {/* ── STUDENTS ── */}
        <Route path="students">
          <Route index element={<AdminStudentsPage />} />
          <Route path=":id" element={<AdminStudentViewPage />} />
        </Route>

        {/* ── GRADES ── */}
        <Route path="grades">
          <Route index element={<AdminGradesPage />} />
          <Route path=":id" element={<AdminGradeDetailPage />} />
        </Route>

        {/* ── UNITS (content library) ── */}
        <Route path="units">
          <Route index element={<AdminUnitsPage />} />
          <Route path="new"      element={<AdminUnitCreatePage />} />
          <Route path=":id"      element={<AdminUnitDetailPage />} />
          <Route path=":id/edit" element={<AdminUnitEditPage />} />
        </Route>

        {/* ── VIDEOS ── */}
        <Route path="videos">
          <Route index element={<AdminVideosPage />} />
          <Route path="new"      element={<AdminVideoCreatePage />} />
          <Route path=":id/edit" element={<AdminVideoEditPage />} />
        </Route>

        {/* ── TASKS ── */}
        <Route path="tasks">
          <Route index element={<AdminTasksPage />} />
          <Route path="new"              element={<Navigate to="/admin/tasks/builder/new" replace />} />
          <Route path=":id"              element={<AdminTaskDetailPage />} />
          <Route path=":id/edit"         element={<TaskEditRedirect />} />
          <Route path=":id/grading"      element={<AdminTaskGradingPage />} />
          <Route path=":id/submissions"  element={<AdminTaskSubmissionsPage />} />
        </Route>

        {/* ── TESTS ── */}
        <Route path="tests">
          <Route index element={<AdminTestsPage />} />
          <Route path="new"          element={<AdminTestCreatePage />} />
          <Route path=":id"          element={<AdminTestDetailsPage />} />
          <Route path=":id/edit"     element={<AdminTestEditPage />} />
          <Route path=":id/analytics" element={<AdminTestAnalyticsPage />} />
        </Route>

        {/* ── SLIDE REVIEW ── */}
        <Route path="slides/review" element={<ReviewSlidesPage />} />

        {/* ── Catch-all → courses ── */}
        <Route path="*" element={<Navigate to="/admin/courses" replace />} />
      </Route>
    </Routes>
  );
}
