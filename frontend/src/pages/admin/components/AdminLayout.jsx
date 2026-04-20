/**
 * AdminLayout.jsx
 *
 * Shell layout for all admin pages.
 * Renders AdminSidebar (fixed, hover-expands) + <Outlet/> in the main area.
 *
 * Sidebar strategy:
 *   The sidebar is `position: fixed` at 60px wide (collapsed) and expands
 *   to 220px on hover — purely visually.
 *   The main content area has a fixed left margin of 60px (the collapsed rail
 *   width), so it NEVER shifts when the sidebar expands. The sidebar overlays
 *   on top when expanded, which is standard SaaS behaviour (e.g. ProgressMe).
 */

import { useMemo, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../../hooks/useAuth";
import AdminHeader from "./AdminHeader.jsx";
import AdminSidebar from "./AdminSidebar.jsx";
import SupportChatWidget from "./SupportChatWidget";
import { SHELL_HEADER_HEIGHT, SHELL_SIDEBAR_COLLAPSED_WIDTH } from "../../../components/layout/shellDimensions";

// Stores collapsed sidebar width in pixels and keeps teacher/student shells aligned.
const COLLAPSED_W = SHELL_SIDEBAR_COLLAPSED_WIDTH;
// Stores fixed top header height in pixels and keeps teacher/student shells aligned.
const HEADER_H = SHELL_HEADER_HEIGHT;

const CSS = `
  .al-root {
    display: flex;
    height: 100vh;
    width: 100%;
    background: #F8F8FC;
    overflow: hidden;
    padding-top: ${HEADER_H}px;
    box-sizing: border-box;
  }
  /* Spacer shim — keeps main content from sitting under the sidebar */
  .al-sidebar-shim {
    width: ${COLLAPSED_W}px;
    min-width: ${COLLAPSED_W}px;
    flex-shrink: 0;
  }
  .al-root .asb-root {
    top: ${HEADER_H}px;
    height: calc(100vh - ${HEADER_H}px);
  }
  .al-main {
    flex: 1;
    min-width: 0;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }
  .al-main--builder {
    overflow: hidden;
  }
  .al-main__content {
    flex: 1;
    min-height: 0;
  }
  .al-main__content--builder {
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
`;

export default function AdminLayout() {
  // Provides translation function for shell-level fallback labels.
  const { t } = useTranslation();
  const navigate  = useNavigate();
  const location  = useLocation();
  const { user, logout } = useAuth();
  const [darkMode, setDarkMode] = useState(false);
  // True when the legacy full-screen builder route is active (currently unused — see TeacherOnboarding.legacy.jsx + AdminRoutes).
  const isCourseBuilder = location.pathname === "/admin/courses/builder";

  // Prefer API full_name, then first+last, then email local-part for the shell menu label.
  const headerDisplayName = useMemo(() => {
    const full = user?.full_name?.trim();
    if (full) return full;
    const combined = `${user?.first_name ?? ""} ${user?.last_name ?? ""}`.trim();
    if (combined) return combined;
    const email = user?.email?.trim();
    if (email && email.includes("@")) return email.split("@")[0];
    return t("admin.role.teacher", { defaultValue: "Teacher" });
  }, [t, user]);
  // Stores subscription end date and controls the tariff icon visibility in the header.
  const trialUntilIso = user?.subscription_ends_at ?? null;

  const handleLogout = async () => {
    const loggedOut = await logout();
    if (loggedOut) {
      localStorage.removeItem("token");
      localStorage.removeItem("refresh_token");
      navigate("/login");
    }
  };

  return (
    <>
      <style>{CSS}</style>
      <AdminHeader
        userName={headerDisplayName}
        userEmail={user?.email ?? ""}
        trialUntil={trialUntilIso}
        darkMode={darkMode}
        onToggleDark={() => setDarkMode(d => !d)}
        onLogout={handleLogout}
        onProfileSettings={() => navigate("/admin/profile")}
        onTariffs={() => navigate("/admin/tariffs")}
      />
      <div className="al-root">
        {/* Fixed sidebar — overlays content when expanded */}
        <AdminSidebar />

        {/* Shim reserves exactly the collapsed rail width */}
        <div className="al-sidebar-shim" aria-hidden="true" />

        {/* Main content — margin is constant, no jitter */}
        <main className={`al-main ${isCourseBuilder ? "al-main--builder" : ""}`}>
          <div className={`al-main__content ${isCourseBuilder ? "al-main__content--builder" : ""}`}>
            <Outlet />
          </div>
        </main>
      </div>

      {/* ── Floating support chat — visible on all admin pages ── */}
      <SupportChatWidget />
    </>
  );
}