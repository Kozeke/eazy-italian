import { Routes, Route } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from './hooks/useAuth';
import LayoutWrapper from './components/LayoutWrapper';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import CoursesPage from './pages/CoursesPage';
import CourseDetailPage from './pages/CourseDetailPage';
import MyLearningPage from './pages/MyLearningPage';
import CourseUnitsPage from './pages/CourseUnitsPage';
import UnitDetailPage from './pages/UnitDetailPage';
import TasksPage from './pages/TasksPage';
import TestsPage from './pages/TestsPage';
import TestDetailPage from './pages/TestDetailPage';
import TestTakingPage from './pages/TestTakingPage';
import TestResultsPage from './pages/TestResultsPage';
import ProfilePage from './pages/ProfilePage';
import AdminDashboardPage from './pages/admin/AdminDashboardPage';
import AdminUnitsPage from './pages/admin/AdminUnitsPage';
import AdminUnitCreatePage from './pages/admin/AdminUnitCreatePage';
import AdminUnitEditPage from './pages/admin/AdminUnitEditPage';
import AdminVideosPage from './pages/admin/AdminVideosPage';
import AdminVideoCreatePage from './pages/admin/AdminVideoCreatePage';
import AdminVideoEditPage from './pages/admin/AdminVideoEditPage';
import AdminTasksPage from './pages/admin/AdminTasksPage';
import AdminTaskCreatePage from './pages/admin/AdminTaskCreatePage';
import AdminTaskEditPage from './pages/admin/AdminTaskEditPage';
import AdminTaskDetailPage from './pages/admin/AdminTaskDetailPage';
import AdminTaskSubmissionsPage from './pages/admin/AdminTaskSubmissionsPage';
import AdminTaskGradingPage from './pages/admin/AdminTaskGradingPage';
import AdminTestsPage from './pages/admin/AdminTestsPage';
import AdminTestCreatePage from './pages/admin/AdminTestCreatePage';
import AdminTestEditPage from './pages/admin/AdminTestEditPage';
import AdminQuestionBankPage from './pages/admin/AdminQuestionBankPage';
import AdminStudentsPage from './pages/admin/AdminStudentsPage';
import AdminStudentCreatePage from './pages/admin/AdminStudentCreatePage';
import AdminStudentEditPage from './pages/admin/AdminStudentEditPage';
import AdminEmailCampaignsPage from './pages/admin/AdminEmailCampaignsPage';
import AdminGradesPage from './pages/admin/AdminGradesPage';
import AdminProgressPage from './pages/admin/AdminProgressPage';
import AdminSettingsPage from './pages/admin/AdminSettingsPage';
import AdminAuditLogPage from './pages/admin/AdminAuditLogPage';
import AdminCoursesPage from './pages/admin/AdminCoursesPage';
import AdminCourseCreatePage from './pages/admin/AdminCourseCreatePage';
import AdminCourseEditPage from './pages/admin/AdminCourseEditPage';
import AdminLayout from './components/admin/AdminLayout';
import ProtectedRoute from './components/ProtectedRoute';
import AdminRoute from './components/AdminRoute';

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

      {/* Protected routes */}
      <Route element={<ProtectedRoute><LayoutWrapper /></ProtectedRoute>}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/courses" element={<CoursesPage />} />
        <Route path="/courses/:id" element={<CourseDetailPage />} />
        <Route path="/courses/:id/units" element={<CourseUnitsPage />} />
        <Route path="/my-courses" element={<MyLearningPage />} />
        <Route path="/units/:id" element={<UnitDetailPage />} />
        <Route path="/tasks" element={<TasksPage />} />
        <Route path="/tasks/:id" element={<TasksPage />} />
        <Route path="/tests" element={<TestsPage />} />
        <Route path="/tests/:id" element={<TestDetailPage />} />
        <Route path="/tests/:id/take" element={<TestTakingPage />} />
        <Route path="/tests/:id/results/:attemptId" element={<TestResultsPage />} />
        <Route path="/profile" element={<ProfilePage />} />
      </Route>

             {/* Admin routes */}
       <Route element={<AdminRoute><AdminLayout /></AdminRoute>}>
         <Route path="/admin" element={<AdminDashboardPage />} />
         
         {/* Courses routes */}
         <Route path="/admin/courses" element={<AdminCoursesPage />} />
         <Route path="/admin/courses/new" element={<AdminCourseCreatePage />} />
         <Route path="/admin/courses/:id" element={<AdminCoursesPage />} />
         <Route path="/admin/courses/:id/edit" element={<AdminCourseEditPage />} />
         
         {/* Units routes */}
         <Route path="/admin/units" element={<AdminUnitsPage />} />
         <Route path="/admin/units/new" element={<AdminUnitCreatePage />} />
         <Route path="/admin/units/:id/edit" element={<AdminUnitEditPage />} />
         
         {/* Videos routes */}
         <Route path="/admin/videos" element={<AdminVideosPage />} />
         <Route path="/admin/videos/new" element={<AdminVideoCreatePage />} />
         <Route path="/admin/videos/:id/edit" element={<AdminVideoEditPage />} />
         
         {/* Tasks routes */}
         <Route path="/admin/tasks" element={<AdminTasksPage />} />
         <Route path="/admin/tasks/new" element={<AdminTaskCreatePage />} />
         <Route path="/admin/tasks/:id" element={<AdminTaskDetailPage />} />
         <Route path="/admin/tasks/:id/edit" element={<AdminTaskEditPage />} />
         <Route path="/admin/tasks/:id/submissions" element={<AdminTaskSubmissionsPage />} />
         <Route path="/admin/tasks/:id/submissions/:submissionId" element={<AdminTaskGradingPage />} />
         
         {/* Tests routes */}
         <Route path="/admin/tests" element={<AdminTestsPage />} />
         <Route path="/admin/tests/new" element={<AdminTestCreatePage />} />
         <Route path="/admin/tests/:id/edit" element={<AdminTestEditPage />} />
         
         {/* Students routes */}
         <Route path="/admin/students" element={<AdminStudentsPage />} />
         <Route path="/admin/students/new" element={<AdminStudentCreatePage />} />
         <Route path="/admin/students/:id/edit" element={<AdminStudentEditPage />} />
         
         {/* Other admin routes */}
         <Route path="/admin/questions" element={<AdminQuestionBankPage />} />
         <Route path="/admin/email-campaigns" element={<AdminEmailCampaignsPage />} />
         <Route path="/admin/grades" element={<AdminGradesPage />} />
         <Route path="/admin/progress" element={<AdminProgressPage />} />
         <Route path="/admin/settings" element={<AdminSettingsPage />} />
         <Route path="/admin/audit-log" element={<AdminAuditLogPage />} />
       </Route>
    </Routes>
  );
}

export default App;
