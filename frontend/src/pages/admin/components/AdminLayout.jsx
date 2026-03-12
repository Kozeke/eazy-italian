/**
 * AdminLayout.jsx
 *
 * Shell layout for all admin pages.
 * Renders AdminSidebar on the left, <Outlet/> on the right.
 *
 * Design matches TeacherOnboarding's bg (#F7F6FF) and border (#E5DEFF).
 */

import { useEffect, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import AdminSidebar from "./AdminSidebar.jsx";
import { coursesApi, progressApi } from "../../../services/api";

/* ── Topbar height token ────────────────────────────────────────────────── */
const TOPBAR_H = 0; // no global topbar — sidebar owns the full height

const CSS = `
  .al-root {
    display: flex;
    height: 100vh;
    width: 100%;
    background: #F7F6FF;
    overflow: hidden;
  }
  .al-main {
    flex: 1;
    min-width: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }
`;

export default function AdminLayout() {
  const navigate = useNavigate();
  const [courseCount,  setCourseCount]  = useState(0);
  const [studentCount, setStudentCount] = useState(0);

  /* Load counts for badge display — best-effort, silent on error */
  useEffect(() => {
    coursesApi.getAdminCourses?.()
      .then((c) => setCourseCount(Array.isArray(c) ? c.length : 0))
      .catch(() => {});

    // Try dashboard stats for student count
    coursesApi.getDashboardStatistics?.()
      .then((d) => setStudentCount(d?.students_count ?? 0))
      .catch(() => {});
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("token");
    navigate("/login");
  };

  return (
    <>
      <style>{CSS}</style>
      <div className="al-root">
        <AdminSidebar
          courseCount={courseCount}
          studentCount={studentCount}
          onLogout={handleLogout}
        />
        <main className="al-main">
          <Outlet />
        </main>
      </div>
    </>
  );
}
