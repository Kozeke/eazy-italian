/**
 * StudentSidebar.tsx
 *
 * Student navigation rail with the same interaction model as the teacher panel:
 * collapsed by default, expands on hover, and keeps page content stationary.
 */

import { useLocation, useNavigate } from "react-router-dom";
import { SHELL_HEADER_HEIGHT, SHELL_SIDEBAR_COLLAPSED_WIDTH, SHELL_SIDEBAR_EXPANDED_WIDTH } from "../../layout/shellDimensions";

// ─── Types ────────────────────────────────────────────────────────────────────

interface StudentSidebarProps {
  open: boolean;
  onClose: () => void;
}

// ─── Nav items ────────────────────────────────────────────────────────────────

// Defines all navigation items shown inside the student rail.
const NAV_ITEMS = [
  { label: "My Classes", href: "/student/classes", icon: IcoBook },
  // { label: "Grades", href: "/student/grades", icon: IcoGrades },
  { label: "Settings", href: "/student/settings", icon: IcoSettings },
];

// Stores shared design tokens to match teacher sidebar styling.
const T = {
  accent: "#6C6FEF",
  accentD: "#4F52C2",
  accentBg: "#EEF0FE",
  accentText: "#4F52C2",
  border: "#E8E8F0",
  bg: "#F7F7FA",
  text: "#18181B",
  sub: "#52525B",
  muted: "#A1A1AA",
};

// Stores collapsed sidebar width in pixels and keeps teacher/student shells aligned.
const COLLAPSED_W = SHELL_SIDEBAR_COLLAPSED_WIDTH;
// Stores expanded sidebar width in pixels and keeps teacher/student shells aligned.
const EXPANDED_W = SHELL_SIDEBAR_EXPANDED_WIDTH;
// Stores fixed top header height in pixels and keeps teacher/student shells aligned.
const HEADER_H = SHELL_HEADER_HEIGHT;

// Injects sidebar styles that implement hover-expand behavior.
const CSS = `
  .ssb-root {
    width: ${COLLAPSED_W}px;
    height: calc(100vh - ${HEADER_H}px);
    background: ${T.bg};
    border-right: 1px solid ${T.border};
    display: flex;
    flex-direction: column;
    overflow: hidden;
    position: fixed;
    top: ${HEADER_H}px;
    left: 0;
    z-index: 100;
    transition: width .22s cubic-bezier(.4,0,.2,1), box-shadow .22s;
    font-family: -apple-system, 'SF Pro Text', 'Segoe UI', system-ui, sans-serif;
  }
  .ssb-root:hover {
    width: ${EXPANDED_W}px;
    box-shadow: 4px 0 20px rgba(108,111,239,.07);
  }
  .ssb-nav {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 10px 8px;
    scrollbar-width: none;
  }
  .ssb-nav::-webkit-scrollbar { display: none; }
  .ssb-item {
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
    border: none;
    background: transparent;
    width: 100%;
    text-align: left;
    text-decoration: none;
    white-space: nowrap;
    overflow: hidden;
    margin-bottom: 1px;
  }
  .ssb-item:hover {
    background: ${T.bg};
    color: ${T.text};
  }
  .ssb-item.active {
    background: ${T.accentBg};
    color: ${T.accentText};
    font-weight: 600;
  }
  .ssb-item .ssb-ico {
    flex-shrink: 0;
    width: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: .55;
    transition: opacity .12s;
  }
  .ssb-item:hover .ssb-ico,
  .ssb-item.active .ssb-ico { opacity: 1; }
  .ssb-item-label {
    flex: 1;
    opacity: 0;
    transform: translateX(-4px);
    transition: opacity .15s .05s, transform .15s .05s;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .ssb-root:hover .ssb-item-label {
    opacity: 1;
    transform: translateX(0);
  }
  .ssb-active-dot {
    position: absolute;
    left: 4px;
    top: 50%;
    transform: translateY(-50%);
    width: 3px;
    height: 18px;
    border-radius: 2px;
    background: ${T.accent};
    opacity: 0;
    transition: opacity .12s;
  }
  .ssb-item.active .ssb-active-dot { opacity: 1; }
  .ssb-root:hover .ssb-active-dot { opacity: 0 !important; }
  .ssb-divider { height: 1px; background: ${T.border}; margin: 6px 4px; }
`;

// Renders the courses icon for navigation rows.
function IcoBook() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <path d="M3 4.5A1.5 1.5 0 0 1 4.5 3h10A1.5 1.5 0 0 1 16 4.5v11a1.5 1.5 0 0 1-1.5 1.5H4.5A1.5 1.5 0 0 1 3 15.5V4.5Z" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7 7h6M7 10h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// Renders the settings icon for navigation rows.
function IcoSettings() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 2.7V4.5M10 15.5v1.8M2.7 10H4.5M15.5 10h1.8M4.8 4.8l1.2 1.2M14 14l1.2 1.2M4.8 15.2 6 14M14 6l1.2-1.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export default function StudentSidebar({
  open,
  onClose,
}: StudentSidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();

  // Calculates active route state for each sidebar item.
  const isActive = (href: string) =>
    location.pathname === href || location.pathname.startsWith(href + "/");

  return (
    <>
      <style>{CSS}</style>
      <aside className="ssb-root" aria-label="Student navigation">
        <div className="ssb-nav">
          {NAV_ITEMS.map((item) => {
            // Stores active flag for current navigation row.
            const active = isActive(item.href);
            // Stores icon renderer for current navigation row.
            const IconComponent = item.icon;
            return (
              <button
                key={item.href}
                className={`ssb-item ${active ? "active" : ""}`}
                onClick={() => {
                  onClose();
                  navigate(item.href);
                }}
                aria-current={active ? "page" : undefined}
              >
                <div className="ssb-active-dot" />
                <span className="ssb-ico"><IconComponent /></span>
                <span className="ssb-item-label">{item.label}</span>
              </button>
            );
          })}
          <div className="ssb-divider" />
        </div>
      </aside>
    </>
  );
}
