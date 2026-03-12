import { Routes, Route, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from './hooks/useAuth';
import LayoutWrapper from './components/LayoutWrapper';
import LandingPage from './pages/LandingPage';
import LoginPage from './components/auth/LoginPage';
import RegisterPage from './components/auth/RegisterPage';
import JoinClassroomPage from './components/auth/JoinClassroomPage';
import DashboardPage from './pages/DashboardPage';
import CoursesPage from './pages/CoursesPage';
import CourseDetailPage from './pages/CourseDetailPage';
import MyLearningPage from './pages/MyLearningPage';
import CourseUnitsPage from './pages/CourseUnitsPage';
import UnitDetailPage from './pages/UnitDetailPage';
import TasksPage from './pages/TasksPage';
import TaskDetailPage from './pages/TaskDetailPage';
import TestsPage from './pages/TestsPage';
import TestDetailPage from './pages/TestDetailPage';
import TestTakingPage from './pages/TestTakingPage';
import TestResultsPage from './pages/TestResultsPage';
import ProfilePage from './pages/ProfilePage';
import ProtectedRoute from './components/ProtectedRoute';
import AdminRoute from './components/AdminRoute';
// @ts-ignore - AdminRoutes is a .jsx file, TypeScript types are inferred at runtime
import AdminRoutes from './pages/admin/components/AdminRoutes';
// Student app shell
import StudentAppLayout from './components/student/StudentAppLayout';
import MyClassesPage from './components/student/MyClassesPage';
// Classroom mode
import ClassroomPage from './pages/student/ClassroomPage';

function App() {
  const { t } = useTranslation();
  const { loading } = useAuth();

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
    <Routes>
      {/* Public routes */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/join-classroom" element={<JoinClassroomPage />} />

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
        {/* Future student pages can go here */}
        {/* <Route path="grades" element={<StudentGradesPage />} /> */}
        {/* <Route path="settings" element={<StudentSettingsPage />} /> */}
      </Route>

      {/* Classroom mode (full screen, no sidebar) */}
      {/* ClassroomPage uses ClassroomLayout internally which adds 'classroom-mode' to <body> */}
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

      {/* Legacy protected routes (with old LayoutWrapper) */}
      <Route element={<ProtectedRoute><LayoutWrapper /></ProtectedRoute>}>
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
        <Route path="/profile" element={<ProfilePage />} />
      </Route>

      {/* Admin routes */}
      <Route path="/admin/*" element={<AdminRoute><AdminRoutes /></AdminRoute>} />
    </Routes>
  );
}

export default App;
