/**
 * AdminHeader.jsx
 *
 * Props:
 *   userName     {string}   – first initial in avatar              (default "Teacher")
 *   userEmail    {string}   – shown in user dropdown identity block
 *   trialUntil   {string}   – ISO date string; null hides the trial icon entirely
 *   darkMode     {boolean}  – controlled dark-mode state
 *   onToggleDark {func}     – called when dark-theme toggle is clicked
 *   onLogout     {func}     – called when Logout is clicked
 */

import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { SHELL_HEADER_HEIGHT } from "../../../components/layout/shellDimensions";

/* ── Design tokens ────────────────────────────────────────────────────────── */
const T = {
  violet:  "#6C35DE",
  violetL: "#EDE9FF",
  pink:    "#F0447C",
  lime:    "#0DB85E",
  limeL:   "#E9F9EE",
  sky:     "#3B9EFF",
  skyL:    "#EBF4FF",
  white:   "#FFFFFF",
  bg:      "#F8F8FC",
  border:  "#E5DEFF",
  borderL: "#EBEBF0",
  text:    "#18181B",
  sub:     "#52525B",
  muted:   "#A1A1AA",
  danger:  "#E53535",
};

// Stores fixed top header height in pixels and keeps teacher/student shells aligned.
const HEADER_H = SHELL_HEADER_HEIGHT;

/* ── CSS ─────────────────────────────────────────────────────────────────── */
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@700;800;900&family=Inter:wght@400;500;600;700&display=swap');

  /* ── Header bar ─────────────────────────────────────────────────────────── */
  .ah-root {
    position: fixed;
    top: 0; left: 0; right: 0;
    z-index: 1000;
    height: ${HEADER_H}px;
    background: ${T.white};
    border-bottom: 1px solid ${T.borderL};
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 20px;
    box-sizing: border-box;
    font-family: 'Inter', system-ui, sans-serif;
    box-shadow: 0 1px 0 ${T.border}, 0 2px 8px rgba(108,53,222,.04);
  }

  /* ── Logo ───────────────────────────────────────────────────────────────── */
  .ah-logo {
    display: flex; align-items: center; gap: 9px;
    text-decoration: none; flex-shrink: 0;
  }
  .ah-logo-mark {
    width: 30px; height: 30px; border-radius: 9px;
    background: linear-gradient(135deg, ${T.violet}, ${T.pink});
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
    box-shadow: 0 3px 10px ${T.violet}44;
  }
  .ah-logo-text {
    font-family: 'Nunito', system-ui, sans-serif;
    font-size: 16px; font-weight: 800; color: ${T.text};
    line-height: 1; letter-spacing: -.01em;
  }
  .ah-logo-sub {
    font-size: 10px; font-weight: 500; color: ${T.muted};
    margin-top: 1px; letter-spacing: .02em;
  }

  /* ── Right cluster ──────────────────────────────────────────────────────── */
  .ah-actions {
    display: flex; align-items: center; gap: 4px; flex-shrink: 0;
  }

  /* ── Shared pill button (trial icon + avatar) ───────────────────────────── */
  .ah-pill-btn {
    display: flex; align-items: center; justify-content: center;
    border: none; background: none; padding: 0;
    cursor: pointer; border-radius: 50%;
    transition: background .14s;
    flex-shrink: 0;
  }
  .ah-pill-btn:focus-visible { outline: 2px solid ${T.violet}; outline-offset: 2px; }

  /* ── Trial icon button ──────────────────────────────────────────────────── */
  .ah-trial-btn {
    width: 36px; height: 36px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    border: none; background: none;
    cursor: pointer;
    transition: background .14s;
    position: relative;
    flex-shrink: 0;
    color: ${T.lime};
  }
  .ah-trial-btn:hover { background: ${T.limeL}; }
  .ah-trial-btn[aria-expanded="true"] { background: ${T.limeL}; }

  /* Animated ring on the trial icon */
  .ah-trial-ring {
    position: absolute; inset: 4px;
    border-radius: 50%;
    border: 1.5px solid currentColor;
    opacity: .35;
    animation: ah-ring-pulse 2.6s ease-in-out infinite;
  }
  @keyframes ah-ring-pulse {
    0%,100% { transform: scale(1);   opacity: .35; }
    50%      { transform: scale(1.15); opacity: .15; }
  }

  /* ── Divider between trial and avatar ──────────────────────────────────── */
  .ah-divider {
    width: 1px; height: 20px; background: ${T.borderL};
    margin: 0 4px; flex-shrink: 0;
  }

  /* ── Avatar ─────────────────────────────────────────────────────────────── */
  .ah-avatar-wrap { position: relative; }
  .ah-avatar {
    width: 36px; height: 36px; border-radius: 50%;
    background: ${T.violetL}; border: 1.5px solid ${T.border};
    display: flex; align-items: center; justify-content: center;
    font-family: 'Nunito', system-ui, sans-serif;
    font-size: 14px; font-weight: 900; color: ${T.violet};
    cursor: pointer; flex-shrink: 0;
    transition: background .16s, color .16s, border-color .16s,
                transform .16s cubic-bezier(.22,.68,0,1.2), box-shadow .16s;
    user-select: none; border: none;
  }
  .ah-avatar:hover,
  .ah-avatar[aria-expanded="true"] {
    background: ${T.violet}; color: ${T.white};
    box-shadow: 0 4px 14px ${T.violet}44;
  }
  .ah-avatar:active { transform: scale(.95); }

  /* ── Shared dropdown shell ──────────────────────────────────────────────── */
  .ah-dropdown {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    background: ${T.white};
    border: 1px solid ${T.borderL};
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0,0,0,.10), 0 2px 8px rgba(0,0,0,.06);
    z-index: 1100;
    transform-origin: top right;
    animation: ah-dd-in .14s cubic-bezier(.22,.68,0,1.2) forwards;
  }
  @keyframes ah-dd-in {
    from { opacity: 0; transform: scale(.94) translateY(-4px); }
    to   { opacity: 1; transform: scale(1)   translateY(0); }
  }

  /* ── Trial popover ──────────────────────────────────────────────────────── */
  .ah-trial-pop {
    width: 240px;
    padding: 0;
    overflow: hidden;
  }

  /* Tab bar */
  .ah-tp-tabs {
    display: flex;
    border-bottom: 1px solid ${T.borderL};
  }
  .ah-tp-tab {
    flex: 1; padding: 11px 0; text-align: center;
    font-size: 13px; font-weight: 500; color: ${T.muted};
    cursor: pointer; background: none; border: none;
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
    transition: color .14s, border-color .14s;
    font-family: 'Inter', system-ui, sans-serif;
  }
  .ah-tp-tab.active {
    color: ${T.text}; font-weight: 600;
    border-bottom-color: ${T.violet};
  }

  /* Popover body */
  .ah-tp-body { padding: 18px 16px 16px; }

  .ah-tp-plan-row {
    display: flex; align-items: center; gap: 8px; margin-bottom: 10px;
  }
  .ah-tp-plan-name {
    font-size: 17px; font-weight: 700; color: ${T.text};
    font-family: 'Nunito', system-ui, sans-serif;
  }
  .ah-tp-badge {
    font-size: 11px; font-weight: 600; color: ${T.violet};
    background: ${T.violetL}; border-radius: 5px;
    padding: 2px 7px; letter-spacing: .01em;
  }

  .ah-tp-note {
    font-size: 12.5px; color: ${T.muted}; line-height: 1.5;
    margin-bottom: 14px; text-align: center;
  }

  .ah-tp-cta {
    display: block; width: 100%;
    padding: 10px 0; border-radius: 8px;
    background: ${T.sky}; color: ${T.white};
    font-size: 13.5px; font-weight: 600;
    text-align: center; border: none; cursor: pointer;
    font-family: 'Inter', system-ui, sans-serif;
    transition: background .14s, transform .12s;
    text-decoration: none;
  }
  .ah-tp-cta:hover { background: #2280d4; }
  .ah-tp-cta:active { transform: scale(.97); }

  /* Limits tab placeholder */
  .ah-tp-limits {
    font-size: 13px; color: ${T.muted};
    padding: 18px 16px; text-align: center;
  }

  /* ── User dropdown ──────────────────────────────────────────────────────── */
  .ah-user-drop { width: 210px; padding: 5px; }

  /* Identity block */
  .ah-dd-identity {
    padding: 9px 10px 8px;
    border-bottom: 1px solid ${T.borderL};
    margin-bottom: 3px;
  }
  .ah-dd-name {
    font-size: 13px; font-weight: 600; color: ${T.text};
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .ah-dd-email {
    font-size: 11.5px; color: ${T.muted}; margin-top: 2px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }

  /* Menu item */
  .ah-dd-item {
    display: flex; align-items: center; gap: 11px;
    padding: 8px 10px; border-radius: 7px;
    font-size: 13.5px; font-weight: 500; color: ${T.sub};
    cursor: pointer; width: 100%; text-align: left;
    background: none; border: none;
    transition: background .12s, color .12s;
    white-space: nowrap; font-family: 'Inter', system-ui, sans-serif;
  }
  .ah-dd-item:hover { background: ${T.bg}; color: ${T.text}; }
  .ah-dd-item:hover .ah-dd-ico { opacity: 1; }
  .ah-dd-item:focus-visible { outline: 2px solid ${T.violet}; outline-offset: -2px; border-radius: 7px; }
  .ah-dd-item--danger { color: ${T.danger}; }
  .ah-dd-item--danger:hover { background: #FFF1F1; }
  .ah-dd-item--danger .ah-dd-ico { opacity: .7; }

  .ah-dd-ico {
    width: 17px; height: 17px;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0; opacity: .45; transition: opacity .12s; color: inherit;
  }

  .ah-dd-sep { height: 1px; background: ${T.borderL}; margin: 3px 2px; }

  /* Dark toggle */
  .ah-toggle {
    margin-left: auto; flex-shrink: 0;
    width: 30px; height: 17px; border-radius: 9px;
    background: ${T.borderL}; position: relative;
    transition: background .2s; pointer-events: none;
  }
  .ah-toggle--on { background: ${T.violet}; }
  .ah-toggle-thumb {
    position: absolute; top: 2px; left: 2px;
    width: 13px; height: 13px; border-radius: 50%;
    background: ${T.white};
    box-shadow: 0 1px 3px rgba(0,0,0,.18);
    transition: transform .2s cubic-bezier(.22,.68,0,1.2);
  }
  .ah-toggle--on .ah-toggle-thumb { transform: translateX(13px); }

  /* ── Help button ────────────────────────────────────────────────────────── */
  .ah-help-btn {
    display: flex; align-items: center; gap: 6px;
    padding: 0 12px; height: 32px; border-radius: 8px;
    border: none; background: none; cursor: pointer;
    font-size: 13.5px; font-weight: 500; color: ${T.sub};
    font-family: 'Inter', system-ui, sans-serif;
    transition: background .14s, color .14s;
    flex-shrink: 0;
  }
  .ah-help-btn:hover { background: ${T.bg}; color: ${T.text}; }
  .ah-help-btn[aria-expanded="true"] { background: ${T.bg}; color: ${T.text}; }
  .ah-help-btn:focus-visible { outline: 2px solid ${T.violet}; outline-offset: 2px; }

  /* ── Help dropdown ──────────────────────────────────────────────────────── */
  .ah-help-drop {
    width: 220px;
    padding: 6px;
  }

  .ah-help-section {
    padding: 6px 8px 4px;
    display: flex; align-items: center; gap: 8px;
  }
  .ah-help-section-ico {
    width: 28px; height: 28px; border-radius: 7px;
    background: ${T.violetL};
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0; color: ${T.violet};
  }
  .ah-help-section-title {
    font-size: 12px; font-weight: 600; color: ${T.text};
    font-family: 'Inter', system-ui, sans-serif;
  }

  .ah-help-item {
    display: flex; align-items: center; justify-content: space-between;
    padding: 7px 10px; border-radius: 7px;
    font-size: 13px; font-weight: 500; color: ${T.sub};
    cursor: pointer; width: 100%; text-align: left;
    background: none; border: none;
    transition: background .12s, color .12s;
    font-family: 'Inter', system-ui, sans-serif;
  }
  .ah-help-item:hover { background: ${T.bg}; color: ${T.text}; }
  .ah-help-item:focus-visible { outline: 2px solid ${T.violet}; outline-offset: -2px; border-radius: 7px; }

  .ah-help-dot {
    width: 7px; height: 7px; border-radius: 50%;
    background: ${T.pink}; flex-shrink: 0;
  }

  .ah-help-sep { height: 1px; background: ${T.borderL}; margin: 4px 2px; }

  .ah-help-support-ico {
    width: 28px; height: 28px; border-radius: 7px;
    background: ${T.limeL};
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0; color: ${T.lime};
  }
`;

/* ── Icons ───────────────────────────────────────────────────────────────── */
const IcoLogo = () => (
  <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
    <path d="M10 2L3 6v8l7 4 7-4V6L10 2Z" stroke="white" strokeWidth="1.7" strokeLinejoin="round"/>
    <path d="M10 2v12M3 6l7 4 7-4" stroke="white" strokeWidth="1.4" strokeLinecap="round"/>
  </svg>
);

/** Hourglass / trial icon — matches the circular timer feel from the screenshot */
const IcoTrial = () => (
  <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
    <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M10 6v4l2.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const IcoSettings = () => (
  <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
    <circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.4"/>
    <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.22 4.22l1.42 1.42M14.36 14.36l1.42 1.42M4.22 15.78l1.42-1.42M14.36 5.64l1.42-1.42"
      stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
  </svg>
);

const IcoStar = () => (
  <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
    <path d="M10 2l2.39 4.84 5.34.78-3.87 3.77.91 5.32L10 14.27l-4.77 2.44.91-5.32L2.27 7.62l5.34-.78L10 2Z"
      stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
  </svg>
);

const IcoMoon = () => (
  <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
    <path d="M17 12.9A8 8 0 0 1 7.1 3a7 7 0 1 0 9.9 9.9Z"
      stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
  </svg>
);

const IcoLogout = () => (
  <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
    <path d="M8 3H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    <path d="M13 14l3-4-3-4M16 10H8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const IcoHelp = () => (
  <svg width="15" height="15" viewBox="0 0 20 20" fill="none">
    <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M10 13.5v.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    <path d="M7.5 7.75C7.5 6.37 8.62 5.25 10 5.25s2.5 1.12 2.5 2.5c0 1.5-2.5 2.5-2.5 3.5"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

const IcoSchool = () => (
  <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
    <path d="M2 8l8-5 8 5-8 5-8-5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
    <path d="M5 9.5V15c0 1.1 2.24 2 5 2s5-.9 5-2V9.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    <path d="M18 8v4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
  </svg>
);

const IcoChat = () => (
  <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
    <path d="M3 4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H7l-4 3V4Z"
      stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
  </svg>
);

/* ── Helpers ─────────────────────────────────────────────────────────────── */
function formatTrialDate(isoStr) {
  if (!isoStr) return null;
  try {
    return new Date(isoStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch { return null; }
}
function getInitial(name) {
  return name?.trim()[0]?.toUpperCase() ?? "?";
}

/* ── usePopover — shared close logic ─────────────────────────────────────── */
function usePopover(ref, onClose) {
  useEffect(() => {
    function onPD(e) { if (ref.current && !ref.current.contains(e.target)) onClose(); }
    document.addEventListener("pointerdown", onPD, true);
    return () => document.removeEventListener("pointerdown", onPD, true);
  }, [ref, onClose]);
  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
}

/* ── TrialPopover ────────────────────────────────────────────────────────── */
function TrialPopover({ trialUntil, onClose }) {
  const ref = useRef(null);
  usePopover(ref, onClose);
  const [tab, setTab] = useState("plan"); // "plan" | "limits"
  const trialDate = formatTrialDate(trialUntil);

  return (
    <div className="ah-dropdown ah-trial-pop" ref={ref} role="dialog" aria-label="Subscription info">
      {/* Tabs */}
      <div className="ah-tp-tabs">
        <button className={`ah-tp-tab ${tab === "plan" ? "active" : ""}`} onClick={() => setTab("plan")}>
          Plan
        </button>
        <button className={`ah-tp-tab ${tab === "limits" ? "active" : ""}`} onClick={() => setTab("limits")}>
          Limits
        </button>
      </div>

      {tab === "plan" ? (
        <div className="ah-tp-body">
          <div className="ah-tp-plan-row">
            <span className="ah-tp-plan-name">Standard</span>
            <span className="ah-tp-badge">Trial</span>
          </div>
          {trialDate && (
            <p className="ah-tp-note">
              Plan paid until {trialDate} inclusive
            </p>
          )}
          <button className="ah-tp-cta" onClick={onClose}>
            Go to plans
          </button>
        </div>
      ) : (
        <div className="ah-tp-limits">
          Usage limits will appear here.
        </div>
      )}
    </div>
  );
}

/* ── UserDropdown ────────────────────────────────────────────────────────── */
function UserDropdown({ userName, userEmail, darkMode, onToggleDark, onLogout, onClose }) {
  const ref = useRef(null);
  usePopover(ref, onClose);

  const handle = (fn) => (e) => { e.stopPropagation(); fn?.(); };

  return (
    <div className="ah-dropdown ah-user-drop" ref={ref} role="menu" aria-label="User menu">
      {/* Identity */}
      <div className="ah-dd-identity">
        <div className="ah-dd-name">{userName || "Teacher"}</div>
        {userEmail && <div className="ah-dd-email">{userEmail}</div>}
      </div>

      <button className="ah-dd-item" role="menuitem" onClick={handle(onClose)}>
        <span className="ah-dd-ico"><IcoSettings /></span>
        Profile settings
      </button>

      <button className="ah-dd-item" role="menuitem" onClick={handle(onClose)}>
        <span className="ah-dd-ico"><IcoStar /></span>
        Tariffs
      </button>

      <button
        className="ah-dd-item" role="menuitemcheckbox" aria-checked={darkMode}
        onClick={handle(onToggleDark)}
      >
        <span className="ah-dd-ico"><IcoMoon /></span>
        Dark theme
        <div className={`ah-toggle ${darkMode ? "ah-toggle--on" : ""}`} aria-hidden="true">
          <div className="ah-toggle-thumb" />
        </div>
      </button>

      <div className="ah-dd-sep" role="separator" />

      <button className="ah-dd-item ah-dd-item--danger" role="menuitem" onClick={handle(onLogout)}>
        <span className="ah-dd-ico"><IcoLogout /></span>
        Logout
      </button>
    </div>
  );
}

/* ── HelpDropdown ────────────────────────────────────────────────────────── */
function HelpDropdown({ onClose }) {
  const ref = useRef(null);
  usePopover(ref, onClose);

  return (
    <div className="ah-dropdown ah-help-drop" ref={ref} role="menu" aria-label="Help menu">
      {/* Getting started section */}
      <div className="ah-help-section">
        <div className="ah-help-section-ico" aria-hidden="true"><IcoSchool /></div>
        <span className="ah-help-section-title">Getting started</span>
      </div>

      <button className="ah-help-item" role="menuitem" onClick={onClose}>
        Tutorial articles
      </button>
      <button className="ah-help-item" role="menuitem" onClick={onClose}>
        Updates
        <span className="ah-help-dot" aria-label="New updates available" />
      </button>

      <div className="ah-help-sep" role="separator" />

      <button className="ah-help-item" role="menuitem" onClick={onClose}>
        Blog
      </button>
      <button className="ah-help-item" role="menuitem" onClick={onClose}>
        YouTube channel
      </button>

      <div className="ah-help-sep" role="separator" />

      {/* Support section */}
      <div className="ah-help-section">
        <div className="ah-help-support-ico" aria-hidden="true"><IcoChat /></div>
        <span className="ah-help-section-title">Support service</span>
      </div>
    </div>
  );
}

/* ── AdminHeader ─────────────────────────────────────────────────────────── */
export default function AdminHeader({
  userName     = "Teacher",
  userEmail    = "",
  trialUntil   = null,
  darkMode     = false,
  onToggleDark = () => {},
  onLogout     = () => {},
}) {
  const [userOpen,  setUserOpen]  = useState(false);
  const [trialOpen, setTrialOpen] = useState(false);
  const [helpOpen,  setHelpOpen]  = useState(false);

  const initial   = useMemo(() => getInitial(userName), [userName]);
  const showTrial = trialUntil != null;

  const openUser   = useCallback(() => { setTrialOpen(false); setHelpOpen(false); setUserOpen(o => !o); }, []);
  const openTrial  = useCallback(() => { setUserOpen(false);  setHelpOpen(false); setTrialOpen(o => !o); }, []);
  const openHelp   = useCallback(() => { setUserOpen(false);  setTrialOpen(false); setHelpOpen(o => !o); }, []);
  const closeUser  = useCallback(() => setUserOpen(false),  []);
  const closeTrial = useCallback(() => setTrialOpen(false), []);
  const closeHelp  = useCallback(() => setHelpOpen(false),  []);

  /* Ref wrappers so the trial-btn click doesn't immediately re-open via document listener */
  const trialBtnRef = useRef(null);
  const avatarRef   = useRef(null);

  return (
    <>
      <style>{CSS}</style>

      <header className="ah-root" role="banner">

        {/* ── Logo ── */}
        <a className="ah-logo" href="/admin" aria-label="LinguAI home">
          <svg width="180" height="40" viewBox="0 0 180 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <circle cx="20" cy="20" r="17" stroke="#6C6FEF" strokeWidth="1.6"/>
            <circle cx="20" cy="20" r="9"  stroke="#6C6FEF" strokeWidth="1.1" opacity="0.4"/>
            <circle cx="20" cy="20" r="3"  fill="#6C6FEF"/>
            <circle cx="20" cy="3"         r="2" fill="#6C6FEF" opacity="0.55"/>
            <circle cx="34.7" cy="11.5"   r="2" fill="#6C6FEF" opacity="0.55"/>
            <circle cx="34.7" cy="28.5"   r="2" fill="#6C6FEF" opacity="0.55"/>
            <text x="48" y="26"
              fontFamily="'Syne', system-ui, sans-serif"
              fontWeight="700" fontSize="19"
              fill="#1A1A2E" letterSpacing="-0.5">Lingu</text>
            <text x="106" y="26"
              fontFamily="'Syne', system-ui, sans-serif"
              fontWeight="700" fontSize="19"
              fill="#6C6FEF" letterSpacing="-0.5">AI</text>
          </svg>
          {/* Fluenso logo kept for reference:
          <svg width="190" height="40" viewBox="0 0 190 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path
              d="M6 32 Q16 14 26 24 Q36 34 46 16"
              stroke="#0F9B7A"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <path
              d="M9 36 Q19 18 29 28 Q39 38 49 20"
              stroke="#0F9B7A"
              strokeWidth="1.1"
              strokeLinecap="round"
              opacity="0.38"
            />
            <circle cx="49" cy="20" r="2.5" fill="#0F9B7A" />
            <text
              x="62"
              y="26"
              fontFamily="'Syne', system-ui, sans-serif"
              fontWeight="700"
              fontSize="19"
              fill="#1A2E2A"
              letterSpacing="-0.4"
            >
              Fluenso
            </text>
          </svg>
          */}
        </a>

        <div style={{ flex: 1 }} aria-hidden="true" />

        {/* ── Right cluster ── */}
        <div className="ah-actions">

          {/* Help button */}
          <div style={{ position: "relative" }}>
            <button
              className="ah-help-btn"
              onClick={openHelp}
              aria-haspopup="menu"
              aria-expanded={helpOpen}
              aria-label="Help menu"
            >
              <IcoHelp />
              Help
            </button>
            {helpOpen && <HelpDropdown onClose={closeHelp} />}
          </div>

          {/* Trial icon button */}
          {showTrial && (
            <div style={{ position: "relative" }} ref={trialBtnRef}>
              <button
                className="ah-trial-btn"
                onClick={openTrial}
                aria-haspopup="dialog"
                aria-expanded={trialOpen}
                aria-label="Subscription info"
                title="Trial plan"
              >
                <span className="ah-trial-ring" aria-hidden="true" />
                <IcoTrial />
              </button>

              {trialOpen && (
                <TrialPopover trialUntil={trialUntil} onClose={closeTrial} />
              )}
            </div>
          )}

          {/* Divider */}
          {showTrial && <div className="ah-divider" aria-hidden="true" />}

          {/* Avatar */}
          <div className="ah-avatar-wrap" ref={avatarRef}>
            <button
              className="ah-avatar"
              onClick={openUser}
              aria-haspopup="menu"
              aria-expanded={userOpen}
              aria-label={`Open user menu for ${userName}`}
              title={userName}
            >
              {initial}
            </button>

            {userOpen && (
              <UserDropdown
                userName={userName}
                userEmail={userEmail}
                darkMode={darkMode}
                onToggleDark={onToggleDark}
                onLogout={() => { closeUser(); onLogout(); }}
                onClose={closeUser}
              />
            )}
          </div>

        </div>
      </header>
    </>
  );
}