import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from './hooks/useAuth';
import LayoutWrapper from './components/LayoutWrapper';
import LandingPage from './pages/LandingPage';
import LoginPage from './components/auth/LoginPage';
import RegisterPage from './components/auth/RegisterPage';
import TeacherRegisterFlow from './components/auth/TeacherRegisterFlow';
import JoinClassroomPage from './components/auth/JoinClassroomPage';
/* Legacy student catalog / LMS pages (*.legacy.tsx) — re-enable imports + routes below if needed:
import DashboardPage from './pages/DashboardPage.legacy';
import CoursesPage from './pages/CoursesPage.legacy';
import CourseDetailPage from './pages/CourseDetailPage.legacy';
import MyLearningPage from './pages/MyLearningPage.legacy';
import CourseUnitsPage from './pages/CourseUnitsPage.legacy';
import UnitDetailPage from './pages/UnitDetailPage.legacy';
import TasksPage from './pages/TasksPage.legacy';
import TaskDetailPage from './pages/TaskDetailPage.legacy';
import TestsPage from './pages/TestsPage.legacy';
import TestDetailPage from './pages/TestDetailPage.legacy';
import TestTakingPage from './pages/TestTakingPage.legacy';
import TestResultsPage from './pages/TestResultsPage.legacy';
*/
import ProfilePage from './pages/ProfilePage';
import ProtectedRoute from './components/ProtectedRoute';
import AdminRoute from './components/AdminRoute';
// @ts-ignore - AdminRoutes is a .jsx file, TypeScript types are inferred at runtime
import AdminRoutes from './pages/admin/components/AdminRoutes';
// Student app shell
import StudentAppLayout from './components/student/layout/StudentAppLayout';
import MyClassesPage from './components/student/dashboard/MyClassesPage';
// import GradesPage from './pages/student/GradesPage.legacy';
import SettingsPage from './pages/student/SettingsPage';
// Classroom mode
import ClassroomPage from './pages/student/ClassroomPage.tsx';
// import AiBuilderPage from './pages/admin/courses/AiBuilderPage.legacy';
import LoadingScreen from './components/global/LoadingScreen';
import { useTeacherClassroomTransition } from './contexts/TeacherClassroomTransitionContext';
import CheckoutSuccessPage from './pages/CheckoutSuccessPage';
import CheckoutCancelPage from './pages/CheckoutCancelPage';

// Sends /teacher/.../ai-builder to the unit classroom (AiBuilderPage.legacy.tsx route disabled).
function AiBuilderLegacyRedirect() {
  const { courseId, unitId } = useParams<{ courseId: string; unitId: string }>();
  return <Navigate to={`/teacher/classroom/${courseId}/${unitId}`} replace />;
}

function App() {
  const { t } = useTranslation();
  const { loading } = useAuth();
  const { isTeacherClassroomOpening } = useTeacherClassroomTransition();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <LoadingScreen isLoading={isTeacherClassroomOpening} />
    <Routes>
      {/* Public routes */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/register/teacher" element={<TeacherRegisterFlow />} />
      <Route path="/join-classroom" element={<JoinClassroomPage />} />
      <Route path="/success" element={<CheckoutSuccessPage />} />
      <Route path="/cancel" element={<CheckoutCancelPage />} />

      {/* Student app shell (with sidebar) */}
      <Route
        path="/student"
        element={
          <ProtectedRoute>
            <StudentAppLayout />
          </ProtectedRoute>
        }
      >
        {/* Redirect /student → /student/classes */}
        <Route index element={<Navigate to="/student/classes" replace />} />
        {/* My Classes dashboard */}
        <Route path="classes" element={<MyClassesPage />} />
        {/* Grades — GradesPage.legacy.tsx (re-import to restore) */}
        <Route path="grades" element={<Navigate to="/student/classes" replace />} />
        {/* Settings page */}
        <Route path="settings" element={<SettingsPage />} />
      </Route>

      {/* Classroom mode (full screen, no sidebar) */}
      {/* ClassroomPage uses ClassroomLayout internally which adds 'classroom-mode' to <body> */}
      {/* Shell inside page: ClassroomHeader + main#main-content workspace — see ClassroomPage file header. */}
      {/* These are TOP-LEVEL routes - never nested inside StudentAppLayout */}
      <Route
        path="/student/classroom/:courseId"
        element={
          <ProtectedRoute>
            <ClassroomPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/student/classroom/:courseId/:unitId"
        element={
          <ProtectedRoute>
            <ClassroomPage />
          </ProtectedRoute>
        }
      />

      {/* Legacy LayoutWrapper routes — pages renamed to *.legacy.tsx; redirect to student shell */}
      <Route element={<ProtectedRoute><LayoutWrapper /></ProtectedRoute>}>
        <Route path="/dashboard" element={<Navigate to="/student/classes" replace />} />
        <Route path="/courses/*" element={<Navigate to="/student/classes" replace />} />
        <Route path="/my-courses" element={<Navigate to="/student/classes" replace />} />
        <Route path="/units/:id" element={<Navigate to="/student/classes" replace />} />
        <Route path="/tasks/*" element={<Navigate to="/student/classes" replace />} />
        <Route path="/tests/*" element={<Navigate to="/student/classes" replace />} />
        {/*
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/courses" element={<CoursesPage />} />
        <Route path="/courses/:id" element={<CourseDetailPage />} />
        <Route path="/courses/:id/units" element={<CourseUnitsPage />} />
        <Route path="/my-courses" element={<MyLearningPage />} />
        <Route path="/units/:id" element={<UnitDetailPage />} />
        <Route path="/tasks" element={<TasksPage />} />
        <Route path="/tasks/:id" element={<TaskDetailPage />} />
        <Route path="/tests" element={<TestsPage />} />
        <Route path="/tests/:id" element={<TestDetailPage />} />
        <Route path="/tests/:id/take" element={<TestTakingPage />} />
        <Route path="/tests/:id/results/:attemptId" element={<TestResultsPage />} />
        */}
        <Route path="/profile" element={<ProfilePage />} />
      </Route>

      {/* ── Teacher classroom flow (full-screen, teacher-only) ── */}
      <Route
        path="/teacher/classroom/:courseId"
        element={<AdminRoute><ClassroomPage /></AdminRoute>}
      />
      <Route
        path="/teacher/classroom/:courseId/:unitId"
        element={<AdminRoute><ClassroomPage /></AdminRoute>}
      />
      <Route
        path="/teacher/classroom/:courseId/:unitId/editor"
        element={<AdminRoute><ClassroomPage /></AdminRoute>}
      />
      {/* AiBuilderPage.legacy.tsx — re-enable import + <AiBuilderPage /> to restore */}
      <Route
        path="/teacher/classroom/:courseId/:unitId/ai-builder"
        element={<AdminRoute><AiBuilderLegacyRedirect /></AdminRoute>}
      />

      {/* Admin routes */}
      <Route path="/admin/*" element={<AdminRoute><AdminRoutes /></AdminRoute>} />
    </Routes>
    </>
  );
}

export default App;
