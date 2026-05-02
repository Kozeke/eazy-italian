/**
 * AdminHeader.jsx
 *
 * Props unchanged from v1:
 *   userName / userEmail / trialUntil / darkMode / onToggleDark / onLogout /
 *   onProfileSettings / onTariffs
 *
 * Part C (Phase 6):
 *   • Fetches GET /admin/tariffs/me ONCE on mount (single useEffect, no polling).
 *   • When period_expired=true: renders a persistent amber full-width banner
 *     ABOVE the header (z-index 1001, border-radius 0).
 *   • Banner shows only on expiry — not on free plan or fetch failure.
 *   • Header shifts down by 40px via the "with-banner" class so content
 *     never sits behind the banner.
 *   • "Renew plan →" calls the existing onTariffs() prop (navigates to /admin/tariffs).
 *
 * UI strings: `admin.header.*`, plus `admin.help`, `admin.subscription`,
 * `admin.tariffs`, `admin.userMenu`, `admin.theme`, and root `nav.logout`.
 */

import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { SHELL_HEADER_HEIGHT } from "../../../components/layout/shellDimensions";
import { aiLimitFromMe } from "../../../utils/teacherTariffMe";

const T = {
  violet:  "#6C6FEF",
  violetL: "#EDE9FF",
  pink:    "#F0447C",
  lime:    "#0DB85E",
  limeL:   "#E9F9EE",
  sky:     "#3B9EFF",
  white:   "#FFFFFF",
  bg:      "#F8F8FC",
  border:  "#E5DEFF",
  borderL: "#EBEBF0",
  text:    "#18181B",
  sub:     "#52525B",
  muted:   "#A1A1AA",
  danger:  "#E53535",
  // ── Part C: amber expired palette ──
  expiredBg:    "#FAEEDA",
  expiredText:  "#854F0B",
  expiredBorder:"#F0D4A8",
  expiredBtn:   "#C16A10",
  expiredBtnHv: "#9E520B",
};

const HEADER_H = SHELL_HEADER_HEIGHT;
const BANNER_H = 40;   // px — height of the expired banner strip

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@700;800;900&family=Inter:wght@400;500;600;700&display=swap');

  /* ── Part C: Expired plan banner ──────────────────────────────────────────── */
  .ah-expired-banner {
    position: fixed;
    top: 0; left: 0; right: 0;
    z-index: 1001;
    height: ${BANNER_H}px;
    background: ${T.expiredBg};
    border-bottom: 1px solid ${T.expiredBorder};
    border-radius: 0;
    padding: 0 20px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    font-family: 'Inter', system-ui, sans-serif;
  }
  .ah-expired-msg {
    font-size: 13px;
    font-weight: 500;
    color: ${T.expiredText};
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .ah-expired-msg strong { font-weight: 700; }
  .ah-expired-cta {
    flex-shrink: 0;
    font-size: 12.5px;
    font-weight: 700;
    color: ${T.white};
    background: ${T.expiredBtn};
    border: none;
    border-radius: 8px;
    padding: 5px 14px;
    cursor: pointer;
    font-family: 'Inter', system-ui, sans-serif;
    transition: background .15s;
    white-space: nowrap;
  }
  .ah-expired-cta:hover { background: ${T.expiredBtnHv}; }
  .ah-expired-cta:focus-visible { outline: 2px solid ${T.expiredText}; outline-offset: 2px; }

  /* ── Header bar ─────────────────────────────────────────────────────────── */
  .ah-root {
    position: fixed;
    top: 0; left: 0; right: 0;
    z-index: 1000;
    height: ${HEADER_H}px;
    background: ${T.white};
    border-bottom: 1px solid ${T.borderL};
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 20px;
    box-sizing: border-box;
    font-family: 'Inter', system-ui, sans-serif;
    box-shadow: 0 1px 0 ${T.border}, 0 2px 8px rgba(108,53,222,.04);
    transition: top .18s ease;
  }
  /* Shift header below the expired banner when it is visible */
  .ah-root.with-banner { top: ${BANNER_H}px; }

  .ah-logo { display: flex; align-items: center; gap: 9px; text-decoration: none; flex-shrink: 0; }
  .ah-actions { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }

  /* ── Trial icon ─────────────────────────────────────────────────────────── */
  .ah-trial-btn {
    width: 36px; height: 36px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    border: none; background: none; cursor: pointer;
    transition: background .14s; position: relative; flex-shrink: 0;
    color: ${T.lime};
  }
  .ah-trial-btn:hover { background: ${T.limeL}; }
  .ah-trial-btn[aria-expanded="true"] { background: ${T.limeL}; }
  .ah-trial-btn:hover .ah-trial-days,
  .ah-trial-btn[aria-expanded="true"] .ah-trial-days { background: ${T.violet}; color: ${T.white}; }
  .ah-trial-ring {
    position: absolute; inset: 4px; border-radius: 50%;
    border: 1.5px solid currentColor; opacity: .35;
    animation: ah-ring-pulse 2.6s ease-in-out infinite;
  }
  .ah-trial-days {
    position: absolute; top: -6px; right: -6px;
    min-width: 18px; height: 18px; border-radius: 9px;
    background: ${T.white}; border: 1px solid ${T.border};
    padding: 0 4px; display: inline-flex; align-items: center; justify-content: center;
    font-size: 10px; font-weight: 700; color: ${T.violet}; line-height: 1;
    box-shadow: 0 2px 6px rgba(17,24,39,.1); transition: background .14s, color .14s;
  }
  @keyframes ah-ring-pulse {
    0%,100% { transform: scale(1); opacity: .35; }
    50%      { transform: scale(1.15); opacity: .15; }
  }

  .ah-divider { width: 1px; height: 20px; background: ${T.borderL}; margin: 0 4px; flex-shrink: 0; }

  /* ── Avatar ─────────────────────────────────────────────────────────────── */
  .ah-avatar-wrap { position: relative; }
  .ah-avatar {
    width: 36px; height: 36px; border-radius: 50%;
    background: ${T.violetL}; border: none;
    display: flex; align-items: center; justify-content: center;
    font-family: 'Nunito', system-ui, sans-serif;
    font-size: 14px; font-weight: 900; color: ${T.violet};
    cursor: pointer; flex-shrink: 0;
    transition: background .16s, color .16s, box-shadow .16s, transform .16s cubic-bezier(.22,.68,0,1.2);
    user-select: none;
  }
  .ah-avatar:hover, .ah-avatar[aria-expanded="true"] {
    background: ${T.violet}; color: ${T.white};
    box-shadow: 0 4px 14px ${T.violet}44;
  }
  .ah-avatar:active { transform: scale(.95); }

  /* ── Shared dropdown ────────────────────────────────────────────────────── */
  .ah-dropdown {
    position: absolute; top: calc(100% + 8px); right: 0;
    background: ${T.white}; border: 1px solid ${T.borderL};
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0,0,0,.10), 0 2px 8px rgba(0,0,0,.06);
    z-index: 1100; transform-origin: top right;
    animation: ah-dd-in .14s cubic-bezier(.22,.68,0,1.2) forwards;
  }
  @keyframes ah-dd-in {
    from { opacity: 0; transform: scale(.94) translateY(-4px); }
    to   { opacity: 1; transform: scale(1) translateY(0); }
  }

  /* ── Trial popover ──────────────────────────────────────────────────────── */
  .ah-trial-pop { width: 260px; padding: 0; overflow: hidden; }
  .ah-tp-tabs { display: flex; border-bottom: 1px solid ${T.borderL}; }
  .ah-tp-tab {
    flex: 1; padding: 11px 0; text-align: center;
    font-size: 13px; font-weight: 500; color: ${T.muted};
    cursor: pointer; background: none; border: none;
    border-bottom: 2px solid transparent; margin-bottom: -1px;
    transition: color .14s, border-color .14s;
    font-family: 'Inter', system-ui, sans-serif;
  }
  .ah-tp-tab.active { color: ${T.text}; font-weight: 600; border-bottom-color: ${T.violet}; }
  .ah-tp-body { padding: 18px 16px 16px; }
  .ah-tp-plan-row { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
  .ah-tp-plan-name { font-size: 17px; font-weight: 700; color: ${T.text}; font-family: 'Nunito', system-ui, sans-serif; }
  .ah-tp-badge { font-size: 11px; font-weight: 600; color: ${T.violet}; background: ${T.violetL}; border-radius: 5px; padding: 2px 7px; }
  .ah-tp-note { font-size: 12.5px; color: ${T.muted}; line-height: 1.5; margin-bottom: 14px; text-align: center; }
  .ah-tp-cta {
    display: block; width: 100%; padding: 10px 0; border-radius: 8px;
    background: ${T.sky}; color: ${T.white};
    font-size: 13.5px; font-weight: 600; text-align: center;
    border: none; cursor: pointer; font-family: 'Inter', system-ui, sans-serif;
    transition: background .14s;
  }
  .ah-tp-cta:hover { background: #2280d4; }

  /* ── Limits tab ─────────────────────────────────────────────────────────── */
  .ah-tp-limits-body { padding: 14px 16px 16px; }
  .ah-tp-limits-error { font-size: 12.5px; color: ${T.muted}; text-align: center; padding: 18px 0; }
  .ah-tp-limits-spinner { display: flex; align-items: center; justify-content: center; padding: 22px 0; }
  .ah-tp-quota-row { margin-bottom: 12px; }
  .ah-tp-quota-row:last-child { margin-bottom: 0; }
  .ah-tp-quota-label-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 5px; }
  .ah-tp-quota-label { font-size: 11.5px; font-weight: 500; color: ${T.sub}; }
  .ah-tp-quota-value { font-size: 11.5px; font-weight: 700; color: ${T.text}; font-family: 'Nunito', system-ui, sans-serif; }
  .ah-tp-quota-value--warning { color: #D97706; }
  .ah-tp-quota-bar-bg { height: 5px; border-radius: 99px; background: ${T.borderL}; overflow: hidden; }
  .ah-tp-quota-bar-fill { height: 100%; border-radius: 99px; background: ${T.violet}; transition: width 0.4s cubic-bezier(.22,.68,0,1.2); }
  .ah-tp-quota-bar-fill--warning { background: #F59E0B; }
  .ah-tp-quota-bar-fill--danger  { background: #EF4444; }
  @keyframes ah-spin { to { transform: rotate(360deg); } }
  .ah-spinner { width: 20px; height: 20px; border-radius: 50%; border: 2px solid ${T.borderL}; border-top-color: ${T.violet}; animation: ah-spin 0.7s linear infinite; }

  /* ── User dropdown ──────────────────────────────────────────────────────── */
  .ah-user-drop { width: 210px; padding: 5px; }
  .ah-dd-identity { padding: 9px 10px 8px; border-bottom: 1px solid ${T.borderL}; margin-bottom: 3px; }
  .ah-dd-name { font-size: 13px; font-weight: 600; color: ${T.text}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ah-dd-email { font-size: 11.5px; color: ${T.muted}; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ah-dd-item {
    display: flex; align-items: center; gap: 11px;
    padding: 8px 10px; border-radius: 7px;
    font-size: 13.5px; font-weight: 500; color: ${T.sub};
    cursor: pointer; width: 100%; text-align: left;
    background: none; border: none; transition: background .12s, color .12s;
    white-space: nowrap; font-family: 'Inter', system-ui, sans-serif;
  }
  .ah-dd-item:hover { background: ${T.bg}; color: ${T.text}; }
  .ah-dd-item--danger { color: ${T.danger}; }
  .ah-dd-item--danger:hover { background: #FFF1F1; }
  .ah-dd-ico { width: 17px; height: 17px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; opacity: .45; transition: opacity .12s; color: inherit; }
  .ah-dd-sep { height: 1px; background: ${T.borderL}; margin: 3px 2px; }
  .ah-toggle { margin-left: auto; flex-shrink: 0; width: 30px; height: 17px; border-radius: 9px; background: ${T.borderL}; position: relative; transition: background .2s; pointer-events: none; }
  .ah-toggle--on { background: ${T.violet}; }
  .ah-toggle-thumb { position: absolute; top: 2px; left: 2px; width: 13px; height: 13px; border-radius: 50%; background: ${T.white}; box-shadow: 0 1px 3px rgba(0,0,0,.18); transition: transform .2s cubic-bezier(.22,.68,0,1.2); }
  .ah-toggle--on .ah-toggle-thumb { transform: translateX(13px); }

  /* ── Help ───────────────────────────────────────────────────────────────── */
  .ah-help-btn {
    display: flex; align-items: center; gap: 6px;
    padding: 0 12px; height: 32px; border-radius: 8px;
    border: none; background: none; cursor: pointer;
    font-size: 13.5px; font-weight: 500; color: ${T.sub};
    font-family: 'Inter', system-ui, sans-serif; transition: background .14s, color .14s; flex-shrink: 0;
  }
  .ah-help-btn:hover { background: ${T.bg}; color: ${T.text}; }
  .ah-help-drop { width: 220px; padding: 6px; }
  .ah-help-section { padding: 6px 8px 4px; display: flex; align-items: center; gap: 8px; }
  .ah-help-section-ico { width: 28px; height: 28px; border-radius: 7px; background: ${T.violetL}; display: flex; align-items: center; justify-content: center; flex-shrink: 0; color: ${T.violet}; }
  .ah-help-section-title { font-size: 12px; font-weight: 600; color: ${T.text}; font-family: 'Inter', system-ui, sans-serif; }
  .ah-help-item {
    display: flex; align-items: center; justify-content: space-between;
    padding: 7px 10px; border-radius: 7px;
    font-size: 13px; font-weight: 500; color: ${T.sub};
    cursor: pointer; width: 100%; text-align: left;
    background: none; border: none; transition: background .12s, color .12s;
    font-family: 'Inter', system-ui, sans-serif;
  }
  .ah-help-item:hover { background: ${T.bg}; color: ${T.text}; }
  .ah-help-dot { width: 7px; height: 7px; border-radius: 50%; background: ${T.pink}; flex-shrink: 0; }
  .ah-help-sep { height: 1px; background: ${T.borderL}; margin: 4px 2px; }
  .ah-help-support-ico { width: 28px; height: 28px; border-radius: 7px; background: ${T.limeL}; display: flex; align-items: center; justify-content: center; flex-shrink: 0; color: ${T.lime}; }
`;

// ── Icons ────────────────────────────────────────────────────────────────────
const IcoTrial   = () => (<svg width="18" height="18" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.5"/><path d="M10 6v4l2.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>);
const IcoSettings= () => (<svg width="16" height="16" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.4"/><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.22 4.22l1.42 1.42M14.36 14.36l1.42 1.42M4.22 15.78l1.42-1.42M14.36 5.64l1.42-1.42" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>);
const IcoStar    = () => (<svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M10 2l2.39 4.84 5.34.78-3.87 3.77.91 5.32L10 14.27l-4.77 2.44.91-5.32L2.27 7.62l5.34-.78L10 2Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg>);
const IcoMoon    = () => (<svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M17 12.9A8 8 0 0 1 7.1 3a7 7 0 1 0 9.9 9.9Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg>);
const IcoLogout  = () => (<svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M8 3H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M13 14l3-4-3-4M16 10H8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>);
const IcoHelp    = () => (<svg width="15" height="15" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.5"/><path d="M10 13.5v.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><path d="M7.5 7.75C7.5 6.37 8.62 5.25 10 5.25s2.5 1.12 2.5 2.5c0 1.5-2.5 2.5-2.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>);
const IcoSchool  = () => (<svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M2 8l8-5 8 5-8 5-8-5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/><path d="M5 9.5V15c0 1.1 2.24 2 5 2s5-.9 5-2V9.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><path d="M18 8v4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>);
const IcoChatBubble = () => (<svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M3 4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H7l-4 3V4Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg>);

// ── Helpers ──────────────────────────────────────────────────────────────────
/** Formats trial end date using the active UI locale when possible. */
function formatTrialDate(isoStr, lang) {
  if (!isoStr) return null;
  try {
    const locale = lang && String(lang).toLowerCase().startsWith("ru") ? "ru-RU" : undefined;
    return new Date(isoStr).toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" });
  }
  catch { return null; }
}
function getTrialDaysLeft(isoStr) {
  if (!isoStr) return null;
  try {
    const end = new Date(isoStr);
    if (Number.isNaN(end.getTime())) return null;
    const now = new Date();
    const msPerDay = 24 * 60 * 60 * 1000;
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfEndDate = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999);
    return Math.max(0, Math.ceil((endOfEndDate.getTime() - startOfToday.getTime()) / msPerDay));
  } catch { return null; }
}
function getInitial(name) { return name?.trim()[0]?.toUpperCase() ?? "?"; }

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

// ── Phase 5: QuotaRow / LimitsTab ────────────────────────────────────────────
function QuotaRow({ label, used, limit }) {
  const { t } = useTranslation();
  // Limit 0 means the feature is disabled on this plan (not "0 credits").
  const isBlocked   = limit === 0;
  const isUnlimited = limit === null || limit === undefined;
  const pct         = isUnlimited || isBlocked ? 0 : Math.min(100, Math.round((used / Math.max(1, limit)) * 100));
  const isWarning   = !isUnlimited && !isBlocked && pct >= 70 && pct < 90;
  const isDanger    = !isUnlimited && !isBlocked && pct >= 90;
  const barClass    = isDanger ? "ah-tp-quota-bar-fill ah-tp-quota-bar-fill--danger" :
                      isWarning ? "ah-tp-quota-bar-fill ah-tp-quota-bar-fill--warning" :
                                  "ah-tp-quota-bar-fill";
  const valueClass  = isDanger ? "ah-tp-quota-value ah-tp-quota-value--warning" : "ah-tp-quota-value";
  return (
    <div className="ah-tp-quota-row">
      <div className="ah-tp-quota-label-row">
        <span className="ah-tp-quota-label">{label}</span>
        <span className={valueClass}>
          {isBlocked ? t("admin.header.quotaNotOnPlan")
            : isUnlimited ? <span title={t("admin.tariffs.featureValues.unlimited")} style={{ color: "#6C6FEF" }}>∞</span> : `${used} / ${limit}`}
        </span>
      </div>
      {!isUnlimited && !isBlocked && (
        <div className="ah-tp-quota-bar-bg">
          <div className={barClass} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

function LimitsTab({ visible }) {
  const { t } = useTranslation();
  const [status,     setStatus]    = useState("idle");
  const [tariffData, setTariffData] = useState(null);
  // Fetch only when the Limits tab is shown. Do not put `status` in deps — setting
  // `loading` re-ran the effect, the prior cleanup set mounted=false, and the
  // in-flight request never applied (spinner stuck forever).
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setStatus("loading");
    const doFetch = async () => {
      try {
        const token = localStorage.getItem("token") ?? "";
        const res = await fetch("/api/v1/admin/tariffs/me", { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error("fetch failed");
        const data = await res.json();
        if (!cancelled) { setTariffData(data); setStatus("ok"); }
      } catch {
        if (!cancelled) setStatus("error");
      }
    };
    void doFetch();
    return () => { cancelled = true; };
  }, [visible]);
  if (!visible) return null;
  if (status === "loading" || status === "idle") return <div className="ah-tp-limits-spinner"><div className="ah-spinner" aria-label={t("common.loading")} /></div>;
  if (status === "error" || !tariffData) return <div className="ah-tp-limits-body"><p className="ah-tp-limits-error">{t("admin.header.limitsLoadError")}</p></div>;
  const limits = tariffData.ai_limits ?? {};
  const usage  = tariffData.ai_usage  ?? {};
  const exLimit = aiLimitFromMe(limits, "exercise_generation", "exercise_generations");
  const unLimit = aiLimitFromMe(limits, "unit_generation", "unit_generations");
  const coLimit = aiLimitFromMe(limits, "course_generation", "course_generations");
  const pubLimit = aiLimitFromMe(limits, "course_publish", "course_publishes");
  return (
    <div className="ah-tp-limits-body">
      <QuotaRow label={t("admin.header.quotaExercises")} used={usage.exercise_generations ?? 0} limit={exLimit} />
      <QuotaRow label={t("admin.header.quotaUnits")}     used={usage.unit_generations ?? 0}     limit={unLimit} />
      <QuotaRow label={t("admin.header.quotaCourses")}   used={usage.course_generations ?? 0}   limit={coLimit} />
      <QuotaRow label={t("admin.tariffs.featureLabels.publishToStudents")} used={usage.course_publishes ?? 0} limit={pubLimit} />
    </div>
  );
}

// ── TrialPopover ──────────────────────────────────────────────────────────────
function TrialPopover({ trialUntil, onClose, onTariffs }) {
  const { t, i18n } = useTranslation();
  const ref       = useRef(null);
  usePopover(ref, onClose);
  const [tab, setTab] = useState("plan");
  const trialDate = formatTrialDate(trialUntil, i18n.language);
  const daysLeft  = getTrialDaysLeft(trialUntil);
  const isPaid    = trialUntil != null;
  const paidNote  = isPaid && trialDate
    ? (daysLeft == null
        ? t("admin.header.trialPopover.paidDateOnly", { date: trialDate })
        : daysLeft === 1
          ? t("admin.header.trialPopover.paidOneDayLeft", { date: trialDate })
          : t("admin.header.trialPopover.paidManyDaysLeft", { date: trialDate, days: daysLeft }))
    : null;
  return (
    <div className="ah-dropdown ah-trial-pop" ref={ref} role="dialog" aria-label={t("admin.header.trialPopover.aria")}>
      <div className="ah-tp-tabs">
        <button type="button" className={`ah-tp-tab ${tab === "plan" ? "active" : ""}`} onClick={() => setTab("plan")}>{t("admin.subscription.planTab")}</button>
        <button type="button" className={`ah-tp-tab ${tab === "limits" ? "active" : ""}`} onClick={() => setTab("limits")}>{t("admin.subscription.limitsTab")}</button>
      </div>
      {tab === "plan" && (
        <div className="ah-tp-body">
          <div className="ah-tp-plan-row">
            <span className="ah-tp-plan-name">{isPaid ? t("admin.tariffs.plans.standard") : t("admin.tariffs.plans.free")}</span>
            <span className="ah-tp-badge">{isPaid ? t("admin.subscription.active") : t("admin.tariffs.plans.free")}</span>
          </div>
          {paidNote
            ? <p className="ah-tp-note">{paidNote}</p>
            : <p className="ah-tp-note">{t("admin.subscription.upgradeHint")}</p>
          }
          <button type="button" className="ah-tp-cta" onClick={() => { onClose(); onTariffs?.(); }}>{t("admin.subscription.goToPlans")}</button>
        </div>
      )}
      <LimitsTab visible={tab === "limits"} />
    </div>
  );
}

// ── UserDropdown ──────────────────────────────────────────────────────────────
function UserDropdown({ userName, userEmail, darkMode, onToggleDark, onLogout, onClose, onProfileSettings, onTariffs }) {
  const { t } = useTranslation();
  const ref         = useRef(null);
  usePopover(ref, onClose);
  const handle       = (fn) => (e) => { e.stopPropagation(); fn?.(); };
  const runThenClose = (fn) => (e) => { e.stopPropagation(); onClose(); fn?.(); };
  return (
    <div className="ah-dropdown ah-user-drop" ref={ref} role="menu" aria-label={t("admin.userMenu.label")}>
      <div className="ah-dd-identity">
        <div className="ah-dd-name">{userName || t("admin.header.defaultDisplayName")}</div>
        {userEmail && <div className="ah-dd-email">{userEmail}</div>}
      </div>
      <button type="button" className="ah-dd-item" role="menuitem" onClick={runThenClose(onProfileSettings)}><span className="ah-dd-ico"><IcoSettings /></span>{t("admin.header.profileSettings")}</button>
      <button type="button" className="ah-dd-item" role="menuitem" onClick={runThenClose(onTariffs)}><span className="ah-dd-ico"><IcoStar /></span>{t("admin.tariffs.tabs.tariffs")}</button>
      <button type="button" className="ah-dd-item" role="menuitemcheckbox" aria-checked={darkMode} onClick={handle(onToggleDark)}>
        <span className="ah-dd-ico"><IcoMoon /></span>{t("admin.theme.dark")}
        <div className={`ah-toggle ${darkMode ? "ah-toggle--on" : ""}`} aria-hidden="true"><div className="ah-toggle-thumb" /></div>
      </button>
      <div className="ah-dd-sep" role="separator" />
      <button type="button" className="ah-dd-item ah-dd-item--danger" role="menuitem" onClick={handle(onLogout)}><span className="ah-dd-ico"><IcoLogout /></span>{t("nav.logout")}</button>
    </div>
  );
}

// ── HelpDropdown ──────────────────────────────────────────────────────────────
function HelpDropdown({ onClose }) {
  const { t } = useTranslation();
  const ref = useRef(null);
  usePopover(ref, onClose);
  return (
    <div className="ah-dropdown ah-help-drop" ref={ref} role="menu" aria-label={t("admin.help.menuLabel")}>
      <div className="ah-help-section"><div className="ah-help-section-ico" aria-hidden="true"><IcoSchool /></div><span className="ah-help-section-title">{t("admin.help.gettingStarted")}</span></div>
      <button type="button" className="ah-help-item" role="menuitem" onClick={onClose}>{t("admin.help.tutorialArticles")}</button>
      <button type="button" className="ah-help-item" role="menuitem" onClick={onClose}>{t("admin.help.updates")} <span className="ah-help-dot" aria-label={t("admin.header.updatesNewAria")} /></button>
      <div className="ah-help-sep" role="separator" />
      <button type="button" className="ah-help-item" role="menuitem" onClick={onClose}>{t("admin.help.blog")}</button>
      <button type="button" className="ah-help-item" role="menuitem" onClick={onClose}>{t("admin.help.youtube")}</button>
      <div className="ah-help-sep" role="separator" />
      <div className="ah-help-section"><div className="ah-help-support-ico" aria-hidden="true"><IcoChatBubble /></div><span className="ah-help-section-title">{t("admin.help.support")}</span></div>
    </div>
  );
}

// ── AdminHeader ───────────────────────────────────────────────────────────────
export default function AdminHeader({
  userName          = "",
  userEmail         = "",
  trialUntil        = null,
  darkMode          = false,
  onToggleDark      = () => {},
  onLogout          = () => {},
  onProfileSettings = () => {},
  onTariffs         = () => {},
}) {
  const { t } = useTranslation();
  const [userOpen,  setUserOpen]  = useState(false);
  const [trialOpen, setTrialOpen] = useState(false);
  const [helpOpen,  setHelpOpen]  = useState(false);

  // ── Part C: fetch period_expired once on mount ────────────────────────────
  const [periodExpired, setPeriodExpired] = useState(false);

  useEffect(() => {
    let mounted = true;
    const fetchStatus = async () => {
      try {
        const token = localStorage.getItem("token") ?? "";
        const res   = await fetch("/api/v1/admin/tariffs/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;   // fail-safe: never show banner on error
        const data = await res.json();
        if (mounted && data.period_expired === true) setPeriodExpired(true);
      } catch {
        // Network error — hide banner (don't block teacher)
      }
    };
    void fetchStatus();
    return () => { mounted = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);  // run exactly once on mount
  // ─────────────────────────────────────────────────────────────────────────

  const initial       = useMemo(() => getInitial(userName), [userName]);
  const showTrial     = true;
  const trialDaysLeft = useMemo(() => getTrialDaysLeft(trialUntil), [trialUntil]);

  const openUser   = useCallback(() => { setTrialOpen(false); setHelpOpen(false); setUserOpen(o => !o); }, []);
  const openTrial  = useCallback(() => { setUserOpen(false);  setHelpOpen(false); setTrialOpen(o => !o); }, []);
  const openHelp   = useCallback(() => { setUserOpen(false);  setTrialOpen(false); setHelpOpen(o => !o); }, []);
  const closeUser  = useCallback(() => setUserOpen(false),  []);
  const closeTrial = useCallback(() => setTrialOpen(false), []);
  const closeHelp  = useCallback(() => setHelpOpen(false),  []);

  const trialBtnRef = useRef(null);
  const avatarRef   = useRef(null);

  return (
    <>
      <style>{CSS}</style>

      {/* ── Part C: Expired plan banner ──────────────────────────────────────
          Shown only when period_expired=true (fetched once on mount).
          Full-width amber strip — border-radius: 0, z-index: 1001.
          Header shifts down by 40px via ".with-banner" class.
      ─────────────────────────────────────────────────────────────────────── */}
      {periodExpired && (
        <div
          className="ah-expired-banner"
          role="alert"
          aria-live="polite"
          aria-label={t("admin.header.expiredAria")}
        >
          <span className="ah-expired-msg">
            <strong>{t("admin.header.expiredTitle")}</strong>{t("admin.header.expiredMessage")}
          </span>
          <button
            type="button"
            className="ah-expired-cta"
            onClick={() => onTariffs?.()}
            aria-label={t("admin.header.renewAria")}
          >
            {t("admin.header.renewCta")}
          </button>
        </div>
      )}

      <header className={`ah-root${periodExpired ? " with-banner" : ""}`} role="banner">

        {/* Logo */}
        <a className="ah-logo" href="/admin" aria-label={t("admin.header.logoAria")}>
          <svg width="180" height="40" viewBox="0 0 180 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <circle cx="20" cy="20" r="17" stroke="#6C6FEF" strokeWidth="1.6"/>
            <circle cx="20" cy="20" r="9"  stroke="#6C6FEF" strokeWidth="1.1" opacity="0.4"/>
            <circle cx="20" cy="20" r="3"  fill="#6C6FEF"/>
            <circle cx="20" cy="3"       r="2" fill="#6C6FEF" opacity="0.55"/>
            <circle cx="34.7" cy="11.5" r="2" fill="#6C6FEF" opacity="0.55"/>
            <circle cx="34.7" cy="28.5" r="2" fill="#6C6FEF" opacity="0.55"/>
            <text x="48" y="26" fontFamily="'Syne', system-ui, sans-serif" fontWeight="700" fontSize="19" fill="#1A1A2E" letterSpacing="-0.5">Lingu</text>
            <text x="106" y="26" fontFamily="'Syne', system-ui, sans-serif" fontWeight="700" fontSize="19" fill="#6C6FEF" letterSpacing="-0.5">AI</text>
          </svg>
        </a>

        <div style={{ flex: 1 }} aria-hidden="true" />

        <div className="ah-actions">
          {/* Help */}
          <div style={{ position: "relative" }}>
            <button type="button" className="ah-help-btn" onClick={openHelp} aria-haspopup="menu" aria-expanded={helpOpen} aria-label={t("admin.help.menuLabel")}>
              <IcoHelp />{t("admin.help.button")}
            </button>
            {helpOpen && <HelpDropdown onClose={closeHelp} />}
          </div>

          {/* Trial popover trigger */}
          {showTrial && (
            <div style={{ position: "relative" }} ref={trialBtnRef}>
              <button
                type="button"
                className="ah-trial-btn"
                onClick={openTrial}
                aria-haspopup="dialog"
                aria-expanded={trialOpen}
                aria-label={trialDaysLeft != null ? t("admin.subscription.daysLeftAria", { days: trialDaysLeft }) : t("admin.subscription.planAria")}
                title={trialDaysLeft != null ? t("admin.subscription.daysLeftTitle", { days: trialDaysLeft }) : t("admin.subscription.freePlanTitle")}
              >
                <span className="ah-trial-ring" aria-hidden="true" />
                <IcoTrial />
                {trialDaysLeft != null && <span className="ah-trial-days" aria-hidden="true">{trialDaysLeft}d</span>}
              </button>
              {trialOpen && <TrialPopover trialUntil={trialUntil} onClose={closeTrial} onTariffs={onTariffs} />}
            </div>
          )}

          {showTrial && <div className="ah-divider" aria-hidden="true" />}

          {/* Avatar */}
          <div className="ah-avatar-wrap" ref={avatarRef}>
            <button
              type="button"
              className="ah-avatar"
              onClick={openUser}
              aria-haspopup="menu"
              aria-expanded={userOpen}
              aria-label={t("admin.userMenu.openForUser", { userName: userName || t("admin.header.defaultDisplayName") })}
              title={userName || t("admin.header.defaultDisplayName")}
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
                onProfileSettings={onProfileSettings}
                onTariffs={onTariffs}
              />
            )}
          </div>
        </div>
      </header>
    </>
  );
}