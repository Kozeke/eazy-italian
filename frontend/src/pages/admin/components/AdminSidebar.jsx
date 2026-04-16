/**
 * AdminSidebar.jsx  — ProgressMe-style collapsible icon rail
 *
 * Collapsed (default): 60px icon rail
 * Expanded (on hover):  220px — labels, section names, secondary actions
 *
 * Hover-expand strategy: CSS-driven width transition on .asb-root
 * The layout reserves the full 220px via a shim wrapper in AdminLayout,
 * but the visual sidebar clips to 60px when collapsed. This avoids
 * any content jitter — the main area never changes width.
 */

import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import CreateCourseModal from "./CreateCourseModal";
import { SHELL_SIDEBAR_COLLAPSED_WIDTH, SHELL_SIDEBAR_EXPANDED_WIDTH } from "../../../components/layout/shellDimensions";

/* ── Design tokens ───────────────────────────────────────────────────────── */
const T = {
  accent:    "#6C6FEF",
  accentD:   "#4F52C2",
  accentBg:  "#EEF0FE",
  accentText:"#4F52C2",
  white:     "#FFFFFF",
  border:    "#E8E8F0",
  bg:        "#F7F7FA",
  text:      "#18181B",
  sub:       "#52525B",
  muted:     "#A1A1AA",
  mutedL:    "#D4D4D8",
};

// Stores collapsed sidebar width in pixels and keeps teacher/student shells aligned.
const COLLAPSED_W = SHELL_SIDEBAR_COLLAPSED_WIDTH;
// Stores expanded sidebar width in pixels and keeps teacher/student shells aligned.
const EXPANDED_W  = SHELL_SIDEBAR_EXPANDED_WIDTH;

/* ── SVG icons ───────────────────────────────────────────────────────────── */
const IcoBook  = () => (
  <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
    <path d="M3 4.5A1.5 1.5 0 0 1 4.5 3h10A1.5 1.5 0 0 1 16 4.5v11a1.5 1.5 0 0 1-1.5 1.5H4.5A1.5 1.5 0 0 1 3 15.5V4.5Z" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M7 7h6M7 10h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);
const IcoPlus  = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
  </svg>
);
const IcoUsers = () => (
  <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
    <circle cx="8" cy="7" r="3" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M2 17c0-3.314 2.686-6 6-6s6 2.686 6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    <path d="M14 4a3 3 0 0 1 0 6M18 17c0-2.761-1.79-5.11-4.266-5.817" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);
/* ── CSS ─────────────────────────────────────────────────────────────────── */
const CSS = `
  /* ---------- root ---------- */
  .asb-root {
    width: ${COLLAPSED_W}px;
    height: 100vh;
    background: ${T.bg};
    border-right: 1px solid ${T.border};
    display: flex;
    flex-direction: column;
    overflow: hidden;
    position: fixed;
    top: 0; left: 0; z-index: 100;
    transition: width .22s cubic-bezier(.4,0,.2,1),
                box-shadow .22s;
    font-family: -apple-system, 'SF Pro Text', 'Segoe UI', system-ui, sans-serif;
  }
  .asb-root:hover {
    width: ${EXPANDED_W}px;
    box-shadow: 4px 0 20px rgba(108,111,239,.07);
  }

  /* ---------- logo area ---------- */
  .asb-logo {
    height: 56px;
    display: flex;
    align-items: center;
    padding: 0 0 0 16px;
    gap: 10px;
    border-bottom: 1px solid ${T.border};
    flex-shrink: 0;
    overflow: hidden;
  }
  .asb-logo-mark {
    width: 28px; height: 28px;
    border-radius: 8px;
    background: ${T.accent};
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }
  .asb-logo-text {
    white-space: nowrap;
    font-size: 14px; font-weight: 700;
    color: ${T.text};
    opacity: 0;
    transform: translateX(-6px);
    transition: opacity .18s .04s, transform .18s .04s;
    letter-spacing: -.01em;
  }
  .asb-root:hover .asb-logo-text {
    opacity: 1;
    transform: translateX(0);
  }
  .asb-logo-sub {
    font-size: 10.5px;
    color: ${T.muted};
    font-weight: 400;
    margin-top: 1px;
  }

  /* ---------- nav scroll area ---------- */
  .asb-nav {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 10px 8px;
    scrollbar-width: none;
  }
  .asb-nav::-webkit-scrollbar { display: none; }

  /* ---------- section label ---------- */
  .asb-section-label {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: .08em;
    text-transform: uppercase;
    color: ${T.mutedL};
    padding: 10px 4px 4px 8px;
    white-space: nowrap;
    overflow: hidden;
    opacity: 0;
    height: 0;
    transition: opacity .15s, height .15s;
  }
  .asb-root:hover .asb-section-label {
    opacity: 1;
    height: 26px;
  }

  /* ---------- nav item ---------- */
  .asb-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 8px;
    height: 38px;
    border-radius: 8px;
    cursor: pointer;
    transition: background .12s, color .12s;
    font-size: 13.5px;
    font-weight: 500;
    color: ${T.sub};
    position: relative;
    border: none; background: transparent;
    width: 100%; text-align: left;
    text-decoration: none;
    white-space: nowrap;
    overflow: hidden;
    margin-bottom: 1px;
  }
  .asb-item:hover {
    background: ${T.bg};
    color: ${T.text};
  }
  .asb-item.active {
    background: ${T.accentBg};
    color: ${T.accentText};
    font-weight: 600;
  }
  .asb-item .asb-ico {
    flex-shrink: 0;
    width: 28px;
    display: flex; align-items: center; justify-content: center;
    opacity: .55;
    transition: opacity .12s;
  }
  .asb-item:hover .asb-ico,
  .asb-item.active .asb-ico { opacity: 1; }

  .asb-item-label {
    flex: 1;
    opacity: 0;
    transform: translateX(-4px);
    transition: opacity .15s .05s, transform .15s .05s;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .asb-root:hover .asb-item-label {
    opacity: 1;
    transform: translateX(0);
  }

  /* ---------- badge ---------- */
  .asb-badge {
    margin-left: auto;
    min-width: 18px; height: 18px;
    padding: 0 4px;
    border-radius: 9px;
    font-size: 10.5px; font-weight: 700;
    display: flex; align-items: center; justify-content: center;
    background: ${T.accentBg};
    color: ${T.accentText};
    flex-shrink: 0;
    opacity: 0;
    transition: opacity .15s .05s;
  }
  .asb-badge-dot {
    /* tiny dot shown in collapsed state */
    position: absolute;
    top: 7px; right: 8px;
    width: 6px; height: 6px;
    border-radius: 50%;
    background: ${T.accent};
    opacity: 0;
    transition: opacity .12s;
  }
  /* show dot when collapsed, hide dot when expanded */
  .asb-badge-dot.visible { opacity: 1; }
  .asb-root:hover .asb-badge-dot { opacity: 0 !important; }
  .asb-root:hover .asb-badge { opacity: 1; }

  /* sky variant — keep neutral for now */
  .asb-badge-sky { background: ${T.accentBg}; color: ${T.accentText}; }
  .asb-badge-dot-sky { background: ${T.accent}; }

  /* ---------- new course button ---------- */
  .asb-new-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 8px;
    height: 34px;
    border-radius: 7px;
    cursor: pointer;
    background: transparent;
    border: 1.5px dashed ${T.mutedL};
    color: ${T.muted};
    font-size: 12.5px;
    font-weight: 500;
    width: 100%;
    text-align: left;
    white-space: nowrap;
    overflow: hidden;
    transition: background .12s, border-color .12s, color .12s;
    margin-bottom: 6px;
    margin-top: 3px;
  }
  .asb-new-btn:hover {
    background: ${T.accentBg};
    border-color: ${T.accent};
    color: ${T.accentText};
  }
  .asb-new-btn .asb-ico {
    flex-shrink: 0;
    width: 28px;
    display: flex; align-items: center; justify-content: center;
    opacity: .6;
    transition: opacity .12s;
  }
  .asb-new-btn:hover .asb-ico { opacity: 1; }
  .asb-new-btn-label {
    opacity: 0;
    transform: translateX(-4px);
    transition: opacity .15s .05s, transform .15s .05s;
    overflow: hidden;
  }
  .asb-root:hover .asb-new-btn-label {
    opacity: 1;
    transform: translateX(0);
  }

  /* ---------- divider ---------- */
  .asb-divider {
    height: 1px;
    background: ${T.border};
    margin: 6px 4px;
  }

  /* ---------- content library header ---------- */
  .asb-lib-btn {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 8px;
    height: 36px;
    border-radius: 8px;
    cursor: pointer;
    background: transparent;
    border: none;
    color: ${T.muted};
    font-size: 11.5px;
    font-weight: 600;
    letter-spacing: .06em;
    text-transform: uppercase;
    width: 100%;
    text-align: left;
    white-space: nowrap;
    overflow: hidden;
    transition: color .12s, background .12s;
  }
  .asb-lib-btn:hover { background: ${T.bg}; color: ${T.sub}; }
  .asb-lib-btn .asb-ico {
    flex-shrink: 0;
    width: 28px;
    display: flex; align-items: center; justify-content: center;
    opacity: .45;
  }
  .asb-lib-label {
    flex: 1;
    opacity: 0;
    transform: translateX(-4px);
    transition: opacity .15s .05s, transform .15s .05s;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .asb-lib-chevron {
    opacity: 0;
    transition: opacity .15s .05s;
    margin-left: auto;
    flex-shrink: 0;
  }
  .asb-root:hover .asb-lib-label,
  .asb-root:hover .asb-lib-chevron {
    opacity: 1;
    transform: translateX(0);
  }

  /* ---------- sub items ---------- */
  .asb-sub-items {
    overflow: hidden;
    transition: max-height .24s cubic-bezier(.4,0,.2,1),
                opacity .2s;
  }
  .asb-sub-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 8px 0 12px;
    height: 34px;
    border-radius: 7px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
    color: ${T.muted};
    transition: background .12s, color .12s;
    border: none; background: transparent;
    width: 100%; text-align: left;
    text-decoration: none;
    white-space: nowrap;
    overflow: hidden;
    margin-bottom: 1px;
  }
  .asb-sub-item:hover { background: ${T.bg}; color: ${T.sub}; }
  .asb-sub-item.active { background: ${T.accentBg}; color: ${T.accentText}; font-weight: 600; }
  .asb-sub-item .asb-ico {
    flex-shrink: 0;
    width: 22px;
    display: flex; align-items: center; justify-content: center;
    opacity: .5;
  }
  .asb-sub-item:hover .asb-ico,
  .asb-sub-item.active .asb-ico { opacity: 1; }
  .asb-sub-item-label {
    opacity: 0;
    transform: translateX(-4px);
    transition: opacity .15s .05s, transform .15s .05s;
    overflow: hidden;
  }
  .asb-root:hover .asb-sub-item-label {
    opacity: 1;
    transform: translateX(0);
  }

  /* ---------- footer ---------- */
  .asb-footer {
    padding: 8px;
    border-top: 1px solid ${T.border};
    flex-shrink: 0;
    overflow: hidden;
  }
  .asb-user {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 8px;
    border-radius: 8px;
    cursor: pointer;
    transition: background .12s;
    white-space: nowrap;
    overflow: hidden;
  }
  .asb-user:hover { background: ${T.bg}; }
  .asb-avatar {
    width: 28px; height: 28px;
    border-radius: 8px;
    background: ${T.accentBg};
    color: ${T.accentText};
    display: flex; align-items: center; justify-content: center;
    font-size: 12px; font-weight: 700;
    flex-shrink: 0;
  }
  .asb-user-info {
    flex: 1;
    min-width: 0;
    opacity: 0;
    transform: translateX(-4px);
    transition: opacity .15s .05s, transform .15s .05s;
  }
  .asb-user-name {
    font-size: 12.5px; font-weight: 600; color: ${T.text};
    overflow: hidden; text-overflow: ellipsis;
  }
  .asb-user-role {
    font-size: 10px; color: ${T.muted}; font-weight: 500;
    text-transform: uppercase; letter-spacing: .05em;
  }
  .asb-logout-ico {
    flex-shrink: 0;
    color: ${T.muted};
    opacity: 0;
    transition: opacity .15s .05s;
  }
  .asb-root:hover .asb-user-info,
  .asb-root:hover .asb-logout-ico { opacity: 1; transform: translateX(0); }
  .asb-user:hover .asb-logout-ico { color: ${T.sub}; }

  /* ---------- active indicator dot on collapsed items ---------- */
  .asb-active-dot {
    position: absolute;
    left: 4px; top: 50%;
    transform: translateY(-50%);
    width: 3px; height: 18px;
    border-radius: 2px;
    background: ${T.accent};
    opacity: 0;
    transition: opacity .12s;
  }
  .asb-item.active .asb-active-dot { opacity: 1; }
  .asb-root:hover .asb-active-dot { opacity: 0 !important; }
`;

/* ── Component ───────────────────────────────────────────────────────────── */
export default function AdminSidebar() {
  const location = useLocation();
  const navigate  = useNavigate();
  const [createModalOpen, setCreateModalOpen] = useState(false);

  const path = location.pathname;
  const isActive = (href) => path === href || path.startsWith(href + "/");
  const isCoursesActive = path.startsWith("/admin/courses") || path === "/admin" || path === "/admin/";

  const navTo = (href) => (e) => { e && e.preventDefault(); navigate(href); };

  return (
    <>
      <style>{CSS}</style>
      <aside className="asb-root">

        {/* ── Nav ── */}
        <div className="asb-nav">

          {/* ① COURSES */}
          <button
            className={`asb-item ${isCoursesActive ? "active" : ""}`}
            onClick={navTo("/admin/courses")}
          >
            <div className="asb-active-dot" />
            <span className="asb-ico"><IcoBook /></span>
            <span className="asb-item-label">Courses</span>
          </button>

          {/* + New Course — visible only when expanded */}
          <button className="asb-new-btn" onClick={() => setCreateModalOpen(true)}>
            <span className="asb-ico"><IcoPlus /></span>
            <span className="asb-new-btn-label">New Course</span>
          </button>

          <div className="asb-divider" />

          {/* ② STUDENTS */}
          <button
            className={`asb-item ${isActive("/admin/students") ? "active" : ""}`}
            onClick={navTo("/admin/students")}
          >
            <div className="asb-active-dot" />
            <span className="asb-ico"><IcoUsers /></span>
            <span className="asb-item-label">Students</span>
          </button>

          {/* ③ GRADES */}
          {/* <button
            className={`asb-item ${isActive("/admin/grades") ? "active" : ""}`}
            onClick={navTo("/admin/grades")}
          >
            <div className="asb-active-dot" />
            <span className="asb-ico"><IcoGrades /></span>
            <span className="asb-item-label">Grades</span>
          </button> */}

          <div className="asb-divider" />

          {/* ④ CONTENT LIBRARY */}
          {/* <button className="asb-lib-btn" onClick={() => setContentOpen(o => !o)}>
            <span className="asb-ico"><IcoLayers /></span>
            <span className="asb-lib-label">Content Library</span>
            <span className="asb-lib-chevron"><IcoChevron open={contentOpen} /></span>
          </button>

          <div
            className="asb-sub-items"
            style={{
              maxHeight: contentOpen ? 200 : 0,
              opacity:   contentOpen ? 1 : 0,
            }}
          >
            <button
              className={`asb-sub-item ${isActive("/admin/units") ? "active" : ""}`}
              onClick={navTo("/admin/units")}
            >
              <span className="asb-ico"><IcoLayers /></span>
              <span className="asb-sub-item-label">Units</span>
            </button>
            <button
              className={`asb-sub-item ${isActive("/admin/videos") ? "active" : ""}`}
              onClick={navTo("/admin/videos")}
            >
              <span className="asb-ico"><IcoVideo /></span>
              <span className="asb-sub-item-label">Videos</span>
            </button>
            <button
              className={`asb-sub-item ${isActive("/admin/tasks") ? "active" : ""}`}
              onClick={navTo("/admin/tasks")}
            >
              <span className="asb-ico"><IcoTask /></span>
              <span className="asb-sub-item-label">Tasks</span>
            </button>
            <button
              className={`asb-sub-item ${isActive("/admin/tests") ? "active" : ""}`}
              onClick={navTo("/admin/tests")}
            >
              <span className="asb-ico"><IcoTest /></span>
              <span className="asb-sub-item-label">Tests</span>
            </button>
          </div> */}

        </div>

        {/* ── Footer ── */}
        {/* <div className="asb-footer">
          <div className="asb-user">
            <div className="asb-avatar">T</div>
            <div className="asb-user-info">
              <div className="asb-user-name">Teacher</div>
              <div className="asb-user-role">Admin</div>
            </div>
            <span className="asb-logout-ico"><IcoLogout /></span>
          </div>
        </div> */}

      </aside>
      <CreateCourseModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
      />
    </>
  );
}