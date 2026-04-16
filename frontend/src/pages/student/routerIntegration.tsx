/**
 * routerIntegration.tsx  (v2)
 *
 * ─── Drop-in classroom route wiring ─────────────────────────────────────────
 *
 * The classroom is registered as a TOP-LEVEL route — never nested inside
 * AdminLayout — so the teacher sidebar is structurally absent.  No CSS
 * workarounds needed beyond the body-class safety net.
 *
 * Add the two <Route> entries below into your root router definition,
 * alongside (not inside) your existing /admin and /student routes.
 */

// ── Example: React Router v6 createBrowserRouter ────────────────────────────

import { createBrowserRouter, RouterProvider } from 'react-router-dom';

import AdminLayout  from '../../components/admin/AdminLayout';
import ClassroomPage from './ClassroomPage';

// existing student pages (paths are illustrative — match your project)
// import StudentCoursesPage from './pages/student/StudentCoursesPage';
// import StudentUnitPage    from './pages/student/StudentUnitPage';

const router = createBrowserRouter([

  // ── Teacher / admin (sidebar layout) ───────────────────────────────────
  {
    path: '/admin',
    element: <AdminLayout />,
    children: [
      // ... all existing admin children unchanged ...
    ],
  },

  // ── Student My Classes (no sidebar needed) ──────────────────────────────
  // { path: '/student/courses', element: <StudentCoursesPage /> },
  // { path: '/student/courses/:courseId/units/:unitId', element: <StudentUnitPage /> },

  // ── NEW: Classroom Mode ─────────────────────────────────────────────────
  // Opens course, auto-selects first published unit
  { path: '/student/classroom/:courseId',         element: <ClassroomPage /> },
  // Opens course and pre-selects a specific unit (lesson_id === unit.id)
  { path: '/student/classroom/:courseId/:unitId', element: <ClassroomPage /> },

]);

export default function App() {
  return <RouterProvider router={router} />;
}


// ─── Entering Classroom Mode from existing student pages ─────────────────────
//
// OPTION A — "Enter Classroom" from a course card (My Classes page):
//
//   import { useNavigate } from 'react-router-dom';
//   const navigate = useNavigate();
//
//   <button onClick={() => navigate(`/student/classroom/${course.id}`)}>
//     Enter Classroom
//   </button>
//
//
// OPTION B — "Study this unit" from a unit list inside a course:
//
//   // lesson_id maps to unit.id per codebase convention
//   <button onClick={() => navigate(`/student/classroom/${course.id}/${unit.id}`)}>
//     Study
//   </button>
//
//
// OPTION C — Redirect from old /student/courses/:courseId/units/:unitId route:
//
//   // In StudentUnitPage (or wherever the old unit page lives), redirect:
//   import { Navigate, useParams } from 'react-router-dom';
//
//   export default function StudentUnitPage() {
//     const { courseId, unitId } = useParams();
//     return <Navigate to={`/student/classroom/${courseId}/${unitId}`} replace />;
//   }
//   // This lets deep-links to old routes transparently enter classroom mode.
//
//
// ─── Exiting Classroom Mode ───────────────────────────────────────────────────
//
//   ClassroomHeader's "Back to My Classes" button calls:
//     navigate('/student/courses')
//
//   This unmounts ClassroomPage → ClassroomLayout → removes `classroom-mode`
//   from <body> → sidebar CSS rule no longer applies.
