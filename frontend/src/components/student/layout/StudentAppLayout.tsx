/**
 * StudentAppLayout.tsx
 *
 * Student shell aligned to teacher shell structure:
 * fixed top header, fixed hover-expand sidebar, and stable content shim.
 */

import { useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import StudentSidebar from "./StudentSidebar";
import { useAuth } from "../../../hooks/useAuth";
import AdminHeader from "../../../pages/admin/components/AdminHeader.jsx";
import { SHELL_HEADER_HEIGHT, SHELL_SIDEBAR_COLLAPSED_WIDTH } from "../../layout/shellDimensions";

// Stores collapsed sidebar width in pixels and keeps teacher/student shells aligned.
const COLLAPSED_W = SHELL_SIDEBAR_COLLAPSED_WIDTH;
// Stores fixed top header height in pixels and keeps teacher/student shells aligned.
const HEADER_H = SHELL_HEADER_HEIGHT;

// Injects shell CSS so student and teacher layouts share the same spacing model.
const CSS = `
  .sal-root {
    display: flex;
    height: 100vh;
    width: 100%;
    background: #F8F8FC;
    overflow: hidden;
    padding-top: ${HEADER_H}px;
    box-sizing: border-box;
  }
  .sal-sidebar-shim {
    width: ${COLLAPSED_W}px;
    min-width: ${COLLAPSED_W}px;
    flex-shrink: 0;
  }
  .sal-main {
    flex: 1;
    min-width: 0;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }
  .sal-main__content {
    flex: 1;
    min-height: 0;
  }
`;

// Renders the student shell and handles student logout.
export default function StudentAppLayout() {
  // Stores dark mode toggle state for the shared header dropdown switch.
  const [darkMode, setDarkMode] = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // Handles user sign-out and clears local auth tokens.
  const handleLogout = async () => {
    const loggedOut = await logout();
    if (loggedOut) {
      localStorage.removeItem("token");
      localStorage.removeItem("refresh_token");
      navigate("/login", { replace: true });
    }
  };

  // Stores full name to display in the shared teacher-style header.
  const headerUserName = `${user?.first_name ?? ""} ${user?.last_name ?? ""}`.trim() || "Student";

  return (
    <>
      <style>{CSS}</style>
      <AdminHeader
        userName={headerUserName}
        userEmail={user?.email ?? ""}
        trialUntil={null}
        darkMode={darkMode}
        onToggleDark={() => setDarkMode((previousMode) => !previousMode)}
        onLogout={handleLogout}
      />

      <div className="sal-root">
        <StudentSidebar
          open={false}
          onClose={() => {}}
        />
        <div className="sal-sidebar-shim" aria-hidden="true" />
        <main className="sal-main" id="main-content" tabIndex={-1}>
          <div className="sal-main__content">
            <Outlet />
          </div>
        </main>
      </div>
    </>
  );
}
