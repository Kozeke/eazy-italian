/**
 * auth-routes.integration.tsx
 *
 * REFERENCE FILE — wire the auth pages into your router.
 *
 * ── Route map ──────────────────────────────────────────────────────────────
 *
 *   /register          RegisterPage   (email → role → details → verify)
 *   /login             LoginPage      (password or magic code)
 *   /join-classroom    JoinClassroomPage
 *
 * ── Flow overview ──────────────────────────────────────────────────────────
 *
 *   New Teacher:
 *     /register → email → "I am a Teacher" → details → email verify → /admin/dashboard
 *
 *   New Student:
 *     /register → email → "I am a Student" → details → /join-classroom
 *     /join-classroom → enter code → POST /api/v1/student/join-classroom → /classroom/:id
 *     OR
 *     /join-classroom → "Browse My Classes" → /student/classes
 *
 *   Login (teacher):  /login → password/magic code → /admin/dashboard
 *   Login (student):  /login → password/magic code → /student/classes
 *
 * ── Add to your existing router ────────────────────────────────────────────
 */

import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';

import RegisterPage       from './RegisterPage';
import LoginPage          from './LoginPage';
import JoinClassroomPage  from './JoinClassroomPage';

// Existing layouts (already in your codebase)
// TODO: Create or import StudentAppLayout and MyClassesPage
// import StudentAppLayout   from '../../components/student/StudentAppLayout';
// import MyClassesPage      from '../../components/student/MyClassesPage';

// Classroom mode
import ClassroomPage      from '../../pages/student/ClassroomPage';

const router = createBrowserRouter([
  // ── Auth ──────────────────────────────────────────────────────────────────
  { path: '/register',        element: <RegisterPage /> },
  { path: '/login',           element: <LoginPage /> },
  { path: '/join-classroom',  element: <JoinClassroomPage /> },

  // ── Student app shell ─────────────────────────────────────────────────────
  // TODO: Uncomment when StudentAppLayout and MyClassesPage are created
  // {
  //   path: '/student',
  //   element: <StudentAppLayout />,
  //   children: [
  //     { index: true, element: <Navigate to="/student/classes" replace /> },
  //     { path: 'classes', element: <MyClassesPage /> },
  //     // { path: 'grades',   element: <StudentGradesPage /> },
  //     // { path: 'settings', element: <StudentSettingsPage /> },
  //   ],
  // },

  // ── Classroom mode ────────────────────────────────────────────────────────
  { path: '/classroom/:courseId/:unitId?', element: <ClassroomPage /> },

  // ── Fallback ──────────────────────────────────────────────────────────────
  { path: '/', element: <Navigate to="/login" replace /> },
  { path: '*', element: <Navigate to="/login" replace /> },
]);

export default function AppRoutes() {
  return <RouterProvider router={router} />;
}

/**
 * ── API endpoints used by the auth components ───────────────────────────────
 *
 * POST /api/v1/auth/register
 *   Body: { email, password, first_name, last_name, role: 'teacher'|'student' }
 *   Response: { token, role }
 *
 * POST /api/v1/auth/login
 *   Body: { email, password }
 *   Response: { token, role }
 *
 * POST /api/v1/auth/magic-code
 *   Body: { email }
 *   Response: 200 OK (sends code to email)
 *
 * POST /api/v1/auth/verify-email
 *   Body: { email, code }
 *   Response: { token }
 *
 * POST /api/v1/auth/resend-verification
 *   Body: { email }
 *   Response: 200 OK
 *
 * GET  /api/v1/auth/me
 *   Headers: Authorization: Bearer <token>
 *   Response: { id, email, first_name, last_name, role }
 *
 * POST /api/v1/student/join-classroom
 *   Headers: Authorization: Bearer <token>
 *   Body: { code }
 *   Response: { classroom: { id, name, ... } }
 */
