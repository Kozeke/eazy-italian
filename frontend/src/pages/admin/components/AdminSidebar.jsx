/**
 * AdminSidebar.jsx
 *
 * Course-first admin navigation.
 * Design tokens mirror TeacherOnboarding.jsx (T palette, Nunito/Inter fonts).
 *
 * Structure:
 *   ① Courses  ← PRIMARY authoring hub
 *       └─ [+ New Course]
 *   ② Students
 *   ③ Grades
 *   ─────────────
 *   ④ Content Library  ← collapsible, de-emphasised
 *       ├─ Units
 *       ├─ Videos
 *       ├─ Tasks
 *       └─ Tests
 */

import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { FontLoader } from "../TeacherOnboarding";

/* ── Design tokens (mirrors TeacherOnboarding T object) ─────────────────── */
const T = {
  violet:  "#6C35DE", violetL: "#EDE9FF", violetD: "#4F23B0",
  pink:    "#F0447C", pinkL:   "#FDE8F0",
  lime:    "#0DB85E", limeL:   "#DCFCE7",
  sky:     "#0099E6", skyL:    "#DAEEFF",
  amber:   "#F5A623", amberL:  "#FEF3C7",
  orange:  "#F76D3C", orangeL: "#FFECE5",
  teal:    "#00BCD4", tealL:   "#E0F7FA",
  white:   "#FFFFFF",
  bg:      "#F7F6FF",
  border:  "#E5DEFF",
  text:    "#1A1035",
  sub:     "#5C5490",
  muted:   "#9188C4",
  mutedL:  "#CFC9EE",
};

/* ── SVG icons ───────────────────────────────────────────────────────────── */
const IcoBook     = ({ sz = 18 }) => (
  <svg width={sz} height={sz} viewBox="0 0 20 20" fill="none">
    <path d="M3 4.5A1.5 1.5 0 0 1 4.5 3h10A1.5 1.5 0 0 1 16 4.5v11a1.5 1.5 0 0 1-1.5 1.5H4.5A1.5 1.5 0 0 1 3 15.5V4.5Z" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M7 7h6M7 10h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);
const IcoPlus     = ({ sz = 14 }) => (
  <svg width={sz} height={sz} viewBox="0 0 14 14" fill="none">
    <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
  </svg>
);
const IcoUsers    = ({ sz = 18 }) => (
  <svg width={sz} height={sz} viewBox="0 0 20 20" fill="none">
    <circle cx="8" cy="7" r="3" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M2 17c0-3.314 2.686-6 6-6s6 2.686 6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    <path d="M14 4a3 3 0 0 1 0 6M18 17c0-2.761-1.79-5.11-4.266-5.817" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);
const IcoGrades   = ({ sz = 18 }) => (
  <svg width={sz} height={sz} viewBox="0 0 20 20" fill="none">
    <rect x="3" y="3" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M7 10l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const IcoLayers   = ({ sz = 15 }) => (
  <svg width={sz} height={sz} viewBox="0 0 20 20" fill="none">
    <path d="M10 2L2 7l8 5 8-5-8-5Z" stroke="currentColor" strokeWidth="1.4"/>
    <path d="M2 13l8 5 8-5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
  </svg>
);
const IcoVideo    = ({ sz = 15 }) => (
  <svg width={sz} height={sz} viewBox="0 0 20 20" fill="none">
    <rect x="2" y="5" width="12" height="10" rx="2" stroke="currentColor" strokeWidth="1.4"/>
    <path d="M14 8.5l4-2v7l-4-2V8.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
  </svg>
);
const IcoTask     = ({ sz = 15 }) => (
  <svg width={sz} height={sz} viewBox="0 0 20 20" fill="none">
    <rect x="3" y="3" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.4"/>
    <path d="M7 7h6M7 10h4M7 13h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
  </svg>
);
const IcoTest     = ({ sz = 15 }) => (
  <svg width={sz} height={sz} viewBox="0 0 20 20" fill="none">
    <rect x="3" y="3" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.4"/>
    <path d="M7 7h2v2H7V7ZM11 7h2v2h-2V7ZM7 11h2v2H7v-2ZM11 11h2v2h-2v-2Z" fill="currentColor" opacity=".7"/>
  </svg>
);
const IcoChevron  = ({ open, sz = 12 }) => (
  <svg width={sz} height={sz} viewBox="0 0 12 12" fill="none"
    style={{ transform: open ? "rotate(90deg)" : "rotate(0)", transition: "transform .22s" }}>
    <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const IcoDash     = ({ sz = 18 }) => (
  <svg width={sz} height={sz} viewBox="0 0 20 20" fill="none">
    <rect x="3" y="3" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
    <rect x="11" y="3" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
    <rect x="3" y="11" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
    <rect x="11" y="11" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
  </svg>
);
const IcoLogout   = ({ sz = 16 }) => (
  <svg width={sz} height={sz} viewBox="0 0 20 20" fill="none">
    <path d="M8 3H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    <path d="M13 14l3-4-3-4M16 10H8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

/* ── Sidebar CSS ─────────────────────────────────────────────────────────── */
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@700;800;900&family=Inter:wght@400;500;600;700&display=swap');

  .asb-root {
    width: 232px;
    min-width: 232px;
    height: 100vh;
    background: ${T.white};
    border-right: 1.5px solid ${T.border};
    display: flex;
    flex-direction: column;
    overflow: hidden;
    position: relative;
    font-family: 'Inter', system-ui, sans-serif;
  }

  /* Faint violet orb top-right */
  .asb-root::before {
    content: '';
    position: absolute;
    top: -60px; right: -60px;
    width: 200px; height: 200px;
    border-radius: 50%;
    background: radial-gradient(circle, ${T.violetL} 0%, transparent 70%);
    pointer-events: none;
    z-index: 0;
  }

  .asb-logo {
    padding: 20px 20px 14px;
    display: flex;
    align-items: center;
    gap: 10px;
    position: relative;
    z-index: 1;
  }
  .asb-logo-mark {
    width: 34px; height: 34px;
    border-radius: 10px;
    background: linear-gradient(135deg, ${T.violet}, ${T.pink});
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
    box-shadow: 0 4px 12px ${T.violet}44;
  }
  .asb-logo-text {
    font-family: 'Nunito', system-ui, sans-serif;
    font-size: 17px; font-weight: 800;
    color: ${T.text};
    line-height: 1;
  }
  .asb-logo-sub {
    font-size: 10px; font-weight: 500;
    color: ${T.muted};
    margin-top: 1px;
  }

  .asb-divider {
    height: 1px;
    background: ${T.border};
    margin: 4px 16px 8px;
  }

  .asb-section-label {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: .08em;
    text-transform: uppercase;
    color: ${T.mutedL};
    padding: 8px 20px 4px;
    position: relative; z-index: 1;
  }

  /* ── Nav items ─────────────────────────────────────────────────────────── */
  .asb-nav {
    flex: 1;
    overflow-y: auto;
    padding: 4px 12px 12px;
    position: relative; z-index: 1;
    scrollbar-width: none;
  }
  .asb-nav::-webkit-scrollbar { display: none; }

  .asb-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 11px;
    border-radius: 12px;
    cursor: pointer;
    transition: all .15s cubic-bezier(.22,.68,0,1.2);
    font-size: 13.5px;
    font-weight: 500;
    color: ${T.sub};
    position: relative;
    border: none; background: none; width: 100%; text-align: left;
    text-decoration: none;
    margin-bottom: 2px;
  }
  .asb-item:hover {
    background: ${T.violetL};
    color: ${T.violet};
    transform: translateX(2px);
  }
  .asb-item.active {
    background: linear-gradient(135deg, ${T.violet}1A, ${T.pink}12);
    color: ${T.violet};
    font-weight: 600;
  }
  .asb-item.active .asb-icon { color: ${T.violet}; }
  .asb-item .asb-icon {
    flex-shrink: 0;
    opacity: .7;
    transition: opacity .15s;
  }
  .asb-item:hover .asb-icon,
  .asb-item.active .asb-icon { opacity: 1; }

  /* Primary "Courses" item — bigger, gradient pill */
  .asb-item-primary {
    background: linear-gradient(135deg, ${T.violet}, ${T.violetD});
    color: white !important;
    font-family: 'Nunito', system-ui, sans-serif;
    font-size: 15px;
    font-weight: 800;
    padding: 12px 14px;
    border-radius: 14px;
    margin-bottom: 6px;
    box-shadow: 0 6px 22px ${T.violet}45;
    letter-spacing: .01em;
    transition: all .18s cubic-bezier(.22,.68,0,1.2);
  }
  .asb-item-primary:hover {
    background: linear-gradient(135deg, ${T.violetD}, #8B44F6) !important;
    color: white !important;
    transform: translateY(-2px);
    box-shadow: 0 10px 28px ${T.violet}55;
  }
  .asb-item-primary.active {
    background: linear-gradient(135deg, ${T.violetD}, ${T.pink}) !important;
    color: white !important;
  }
  .asb-item-primary .asb-icon { opacity: 1 !important; color: white !important; }

  /* New Course CTA button */
  .asb-new-btn {
    display: flex;
    align-items: center;
    gap: 7px;
    width: 100%;
    padding: 8px 11px 8px 12px;
    border-radius: 11px;
    border: 1.5px dashed ${T.violet}70;
    background: ${T.violetL};
    color: ${T.violet};
    font-size: 12.5px;
    font-weight: 700;
    cursor: pointer;
    transition: all .18s cubic-bezier(.22,.68,0,1.2);
    margin-bottom: 10px;
    font-family: 'Inter', system-ui, sans-serif;
    text-decoration: none;
    letter-spacing: .01em;
  }
  .asb-new-btn:hover {
    background: linear-gradient(135deg, ${T.violet}, ${T.pink});
    color: white;
    border-color: transparent;
    box-shadow: 0 5px 16px ${T.violet}44;
    transform: translateY(-1px);
  }
  .asb-new-btn-icon {
    width: 20px; height: 20px;
    border-radius: 6px;
    background: ${T.violet}22;
    border: 1px solid ${T.violet}40;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0; transition: all .18s;
  }
  .asb-new-btn:hover .asb-new-btn-icon {
    background: rgba(255,255,255,.22);
    border-color: rgba(255,255,255,.3);
    color: white;
  }
  .asb-new-btn-icon svg { color: ${T.violet}; transition: color .18s; }
  .asb-new-btn:hover .asb-new-btn-icon svg { color: white; }

  /* Collapsible sub-section */
  .asb-collapse-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 11px;
    width: 100%;
    border: none; background: none;
    cursor: pointer;
    border-radius: 10px;
    color: ${T.muted};
    font-size: 12px;
    font-weight: 600;
    letter-spacing: .04em;
    text-transform: uppercase;
    transition: all .15s;
    margin-top: 4px;
  }
  .asb-collapse-btn:hover { background: ${T.bg}; color: ${T.sub}; }

  .asb-sub-item {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 7px 11px 7px 20px;
    border-radius: 10px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
    color: ${T.muted};
    transition: all .14s;
    border: none; background: none; width: 100%; text-align: left;
    text-decoration: none;
    margin-bottom: 1px;
  }
  .asb-sub-item:hover { background: ${T.bg}; color: ${T.sub}; }
  .asb-sub-item.active { background: ${T.violetL}; color: ${T.violet}; font-weight: 600; }

  .asb-sub-items {
    overflow: hidden;
    transition: max-height .28s cubic-bezier(.4,0,.2,1), opacity .22s;
  }

  /* Bottom user area */
  .asb-footer {
    padding: 10px 14px 14px;
    border-top: 1.5px solid ${T.border};
    position: relative; z-index: 1;
    background: linear-gradient(to bottom, transparent, ${T.violetL}30);
  }
  .asb-user {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 10px;
    border-radius: 13px;
    cursor: pointer;
    transition: all .15s;
    border: 1.5px solid transparent;
  }
  .asb-user:hover {
    background: ${T.violetL};
    border-color: ${T.border};
  }
  .asb-avatar {
    width: 32px; height: 32px;
    border-radius: 10px;
    background: linear-gradient(135deg, ${T.violet}, ${T.pink});
    display: flex; align-items: center; justify-content: center;
    font-family: 'Nunito', system-ui, sans-serif;
    font-size: 13px; font-weight: 900; color: white;
    flex-shrink: 0;
    box-shadow: 0 3px 10px ${T.violet}40;
  }
  .asb-user-info { flex: 1; min-width: 0; }
  .asb-user-name {
    font-size: 13px; font-weight: 600; color: ${T.text};
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .asb-user-role {
    font-size: 10px; color: ${T.muted}; font-weight: 500;
    text-transform: uppercase; letter-spacing: .04em;
  }

  /* Badge count */
  .asb-badge {
    margin-left: auto;
    min-width: 20px; height: 20px;
    padding: 0 5px;
    border-radius: 10px;
    background: ${T.violetL};
    color: ${T.violet};
    font-size: 11px; font-weight: 700;
    display: flex; align-items: center; justify-content: center;
    font-family: 'Nunito', system-ui, sans-serif;
  }
  .asb-item-primary .asb-badge {
    background: rgba(255,255,255,.25);
    color: white;
  }
`;

/* ── Component ───────────────────────────────────────────────────────────── */
export default function AdminSidebar({ courseCount, studentCount, onLogout }) {
  const location = useLocation();
  const navigate  = useNavigate();
  const [contentOpen, setContentOpen] = useState(false);

  const path = location.pathname;

  const isActive    = (href) => path === href || path.startsWith(href + "/");
  const isCoursesActive = path.startsWith("/admin/courses") || path === "/admin" || path === "/admin/";

  const navTo = (href) => (e) => {
    e && e.preventDefault();
    navigate(href);
  };

  return (
    <>
      <style>{CSS}</style>
      <FontLoader />

      <aside className="asb-root">
        {/* ── Logo ── */}
        <div className="asb-logo">
          <div className="asb-logo-mark">
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
              <path d="M10 2L3 6v8l7 4 7-4V6L10 2Z" stroke="white" strokeWidth="1.6" strokeLinejoin="round"/>
              <path d="M10 2v12M3 6l7 4 7-4" stroke="white" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
          </div>
          <div>
            <div className="asb-logo-text">EduAdmin</div>
            <div className="asb-logo-sub">Teacher Portal</div>
          </div>
        </div>

        {/* ── Nav ── */}
        <div className="asb-nav">

          {/* ① COURSES — primary */}
          <div style={{ marginBottom: 2 }}>
            <button
              className={`asb-item asb-item-primary ${isCoursesActive ? "active" : ""}`}
              onClick={navTo("/admin/courses")}
            >
              <span className="asb-icon"><IcoBook sz={18} /></span>
              Courses
              {courseCount > 0 && (
                <span className="asb-badge">{courseCount}</span>
              )}
            </button>

            {/* + New Course CTA */}
            <button
              className="asb-new-btn"
              onClick={navTo("/admin/courses/builder")}
            >
              <span className="asb-new-btn-icon">
                <IcoPlus sz={12} />
              </span>
              New Course
            </button>
          </div>

          {/* ── Divider ── */}
          <div className="asb-divider" />

          {/* ② STUDENTS */}
          <button
            className={`asb-item ${isActive("/admin/students") ? "active" : ""}`}
            onClick={navTo("/admin/students")}
          >
            <span className="asb-icon"><IcoUsers sz={18} /></span>
            Students
            {studentCount > 0 && (
              <span className="asb-badge" style={{ marginLeft: "auto", background: "#DAEEFF", color: "#0099E6" }}>
                {studentCount}
              </span>
            )}
          </button>

          {/* ③ GRADES */}
          <button
            className={`asb-item ${isActive("/admin/grades") ? "active" : ""}`}
            onClick={navTo("/admin/grades")}
          >
            <span className="asb-icon"><IcoGrades sz={18} /></span>
            Grades
          </button>

          {/* ── Divider ── */}
          <div className="asb-divider" style={{ margin: "8px 8px" }} />

          {/* ④ CONTENT LIBRARY — collapsible, de-emphasised */}
          <button
            className="asb-collapse-btn"
            onClick={() => setContentOpen(o => !o)}
          >
            <IcoChevron open={contentOpen} />
            Content Library
          </button>

          <div
            className="asb-sub-items"
            style={{
              maxHeight: contentOpen ? 220 : 0,
              opacity:   contentOpen ? 1 : 0,
            }}
          >
            <button
              className={`asb-sub-item ${isActive("/admin/units") ? "active" : ""}`}
              onClick={navTo("/admin/units")}
            >
              <IcoLayers />  Units
            </button>
            <button
              className={`asb-sub-item ${isActive("/admin/videos") ? "active" : ""}`}
              onClick={navTo("/admin/videos")}
            >
              <IcoVideo />  Videos
            </button>
            <button
              className={`asb-sub-item ${isActive("/admin/tasks") ? "active" : ""}`}
              onClick={navTo("/admin/tasks")}
            >
              <IcoTask />  Tasks
            </button>
            <button
              className={`asb-sub-item ${isActive("/admin/tests") ? "active" : ""}`}
              onClick={navTo("/admin/tests")}
            >
              <IcoTest />  Tests
            </button>
          </div>
        </div>

        {/* ── Footer / User ── */}
        <div className="asb-footer">
          <div className="asb-user" onClick={onLogout}>
            <div className="asb-avatar">T</div>
            <div className="asb-user-info">
              <div className="asb-user-name">Teacher</div>
              <div className="asb-user-role">Admin</div>
            </div>
            <IcoLogout sz={15} />
          </div>
        </div>
      </aside>
    </>
  );
}
