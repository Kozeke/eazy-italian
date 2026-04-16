/**
 * AdminUnitEditPage.tsx
 *
 * Route: /admin/units/:id/edit
 *
 * Central unit management hub for admins.
 * ─────────────────────────────────────────────
 *   UnitEditPage
 *     ├── UnitHeader         (hero gradient, breadcrumb, status badge)
 *     ├── [main 2-col layout]
 *     │     ├── UnitMetadataForm   (editable fields + save)
 *     │     ├── UnitContentSections
 *     │     │     └── UnitSectionCard × 5  (Slides / Test / Tasks / Videos / Materials)
 *     └── UnitActionsPanel   (right sidebar: stats + quick actions)
 *
 * Design language: TeacherOnboarding.jsx
 *   – Same T tokens (violet, pink, lime, sky, amber, orange, teal …)
 *   – Gradient hero with animated orbs + floaters
 *   – Nunito display / Inter body
 *   – Card system, shimmer skeletons, save toast
 *
 * APIs used (existing): unitsApi.getAdminUnit, unitsApi.updateUnit
 *                        videosApi.getAdminVideos, tasksApi.getAdminTasks,
 *                        testsApi.getTests, coursesApi.getAdminCourse
 */

import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { unitsApi, videosApi, tasksApi, testsApi } from "../../services/api";
import { Unit } from "../../types";
import { CreateTestMethodPicker } from "./CreateTestMethodPicker";
import { CreateTaskMethodPicker } from "./CreateTaskMethodPicker";
import toast from "react-hot-toast";

/* ─── Design tokens (matches TeacherOnboarding.jsx exactly) ──────────────── */
const T = {
  violet:"#6C35DE", violetL:"#EDE9FF", violetD:"#4F23B0",
  pink:"#F0447C",   pinkL:"#FDE8F0",
  lime:"#0DB85E",   limeL:"#DCFCE7",
  sky:"#0099E6",    skyL:"#DAEEFF",
  amber:"#F5A623",  amberL:"#FEF3C7",
  orange:"#F76D3C", orangeL:"#FFECE5",
  teal:"#00BCD4",   tealL:"#E0F7FA",
  white:"#FFFFFF",
  bg:"#F7F6FF",     border:"#E5DEFF",
  text:"#1A1035",   sub:"#5C5490",
  muted:"#9188C4",  mutedL:"#CFC9EE",
  green:"#16A34A",  greenL:"#DCFCE7",
  red:"#EF4444",    redL:"#FEE2E2",
  dFont:"'Nunito', system-ui, sans-serif",
  bFont:"'Inter', system-ui, sans-serif",
};

/* ─── Status config ──────────────────────────────────────────────────────── */
type StatusKey = 'published' | 'draft' | 'scheduled' | 'archived';
const STATUS_CFG: Record<StatusKey, { label: string; bg: string; color: string }> = {
  published: { label:"Published", bg:T.limeL,   color:T.green  },
  draft:     { label:"Draft",     bg:"#F1F5F9", color:"#64748B" },
  scheduled: { label:"Scheduled", bg:T.violetL, color:T.violet },
  archived:  { label:"Archived",  bg:"#F1F5F9", color:"#94A3B8" },
};

/* ─── Level colours ──────────────────────────────────────────────────────── */
const LEVEL_OPTS = ["A1","A2","B1","B2","C1","C2","mixed"] as const;
type LevelKey = typeof LEVEL_OPTS[number];
const LEVEL_CLR: Record<LevelKey, [string, string]> = {
  A1:[T.tealL,T.teal], A2:[T.skyL,T.sky], B1:[T.limeL,T.lime],
  B2:[T.violetL,T.violet], C1:[T.amberL,T.amber], C2:[T.pinkL,T.pink],
  mixed:[T.orangeL,T.orange],
};

/* ─── Content section configs ────────────────────────────────────────────── */
const SECTIONS = [
  {
    key:"slides", label:"Slides", emoji:"🖼️",
    description:"Presentation slides for this unit.",
    grad:`linear-gradient(135deg,${T.violet},${T.pink})`,
    navFn:(unitId: string | number, _unit?: Unit) => `/admin/units/${unitId}/slides`,
    btnLabel:"Open Slides Editor",
    countKey:"slides_count",
  },
  {
    key:"test", label:"Test", emoji:"📝",
    description:"Unit knowledge test.",
    grad:`linear-gradient(135deg,${T.sky},${T.violet})`,
    navFn:(unitId: string | number) => `/admin/units/${unitId}/test`,
    btnLabel:"Open Test Builder",
    countKey:"tests_count",
  },
  {
    key:"tasks", label:"Tasks", emoji:"✏️",
    description:"Practice tasks and exercises.",
    grad:`linear-gradient(135deg,${T.lime},${T.teal})`,
    navFn:(unitId: string | number) => `/admin/units/${unitId}/tasks`,
    btnLabel:"Open Tasks",
    countKey:"tasks_count",
  },
  {
    key:"videos", label:"Videos", emoji:"🎬",
    description:"Lecture and supplemental videos.",
    grad:`linear-gradient(135deg,${T.amber},${T.orange})`,
    navFn:(unitId: string | number) => `/admin/units/${unitId}/videos`,
    btnLabel:"Open Videos",
    countKey:"videos_count",
  },
  {
    key:"materials", label:"Materials", emoji:"📚",
    description:"Reference documents and attachments.",
    grad:`linear-gradient(135deg,${T.teal},${T.sky})`,
    navFn:(unitId: string | number, _unit?: Unit) => `/admin/units/${unitId}/materials`,
    btnLabel:"Open Materials",
    countKey:"materials_count",
  },
];

/* ════════════════════════════════════════════════════════════════════════════
   CSS
════════════════════════════════════════════════════════════════════════════ */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Nunito:wght@700;800;900&family=Inter:wght@400;500;600;700&display=swap');

@keyframes uep-fadeUp  { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:none} }
@keyframes uep-fadeIn  { from{opacity:0} to{opacity:1} }
@keyframes uep-popIn   { from{opacity:0;transform:scale(.88)} to{opacity:1;transform:scale(1)} }
@keyframes uep-spin    { to{transform:rotate(360deg)} }
@keyframes uep-shimmer { 0%{background-position:-600px 0} 100%{background-position:600px 0} }
@keyframes uep-float   { 0%,100%{transform:translateY(0) rotate(0)} 50%{transform:translateY(-14px) rotate(5deg)} }
@keyframes uep-floatB  { 0%,100%{transform:translateY(0) rotate(0)} 50%{transform:translateY(-9px) rotate(-4deg)} }
@keyframes uep-drift   { 0%,100%{transform:translate(0,0)} 33%{transform:translate(12px,-8px)} 66%{transform:translate(-8px,10px)} }
@keyframes uep-rotSlow { from{transform:rotate(0)} to{transform:rotate(360deg)} }
@keyframes uep-saveFlash { 0%{opacity:0;transform:translateY(8px)} 12%{opacity:1;transform:none} 82%{opacity:1} 100%{opacity:0} }
@keyframes uep-rowIn   { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:none} }

/* ── Root ── */
.uep-root {
  min-height:100vh;
  background:${T.bg};
  font-family:${T.bFont};
  color:${T.text};
  padding-bottom:80px;
}
.uep-root *,.uep-root *::before,.uep-root *::after { box-sizing:border-box; margin:0; padding:0; }

/* ── Center helper ── */
.uep-center {
  display:flex; align-items:center; justify-content:center;
  min-height:60vh; gap:12px;
  font-size:15px; color:${T.sub};
  font-family:${T.bFont};
}
.uep-spinner {
  width:22px; height:22px; border-radius:50%;
  border:3px solid ${T.border}; border-top-color:${T.violet};
  animation:uep-spin .8s linear infinite; flex-shrink:0;
}

/* ════════════════════════════════════════
   HERO HEADER
════════════════════════════════════════ */
.uep-hero {
  position:relative; overflow:hidden;
  padding:32px 40px 28px;
  animation:uep-fadeUp .4s both;
}
.uep-hero-ring {
  position:absolute; border-radius:50%;
  border:2px solid rgba(255,255,255,.07);
  top:50%; left:50%; transform:translate(-50%,-50%);
  pointer-events:none;
}
.uep-orb {
  position:absolute; border-radius:50%;
  opacity:.18; filter:blur(1px); pointer-events:none;
}
.uep-floater {
  position:absolute; pointer-events:none; user-select:none;
  filter:drop-shadow(0 3px 8px rgba(0,0,0,.2));
}

/* breadcrumb */
.uep-bc {
  display:flex; align-items:center; gap:6px;
  font-size:12px; font-weight:600;
  color:rgba(255,255,255,.5);
  margin-bottom:16px; position:relative; z-index:2;
  flex-wrap:wrap;
}
.uep-bc a {
  color:rgba(255,255,255,.65); text-decoration:none;
  cursor:pointer; transition:color .14s;
}
.uep-bc a:hover { color:white }
.uep-bc-sep { color:rgba(255,255,255,.28) }

/* Hero inner row */
.uep-hero-inner {
  position:relative; z-index:2;
  display:flex; align-items:flex-start;
  justify-content:space-between; gap:24px; flex-wrap:wrap;
}
.uep-unit-title {
  font-family:${T.dFont};
  font-size:clamp(20px,3vw,32px); font-weight:900;
  color:white; line-height:1.15; margin-bottom:10px;
  text-shadow:0 2px 12px rgba(0,0,0,.18);
}
.uep-meta-row {
  display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:16px;
}
.uep-pill {
  display:inline-flex; align-items:center;
  border-radius:100px; font-size:11px; font-weight:700;
  padding:4px 10px; gap:4px;
  border:1.5px solid transparent;
}
.uep-pill--ghost {
  background:rgba(255,255,255,.15);
  color:white; border-color:rgba(255,255,255,.28);
}
.uep-pill--lime {
  background:${T.limeL}; color:${T.green}; border-color:${T.lime}44;
}
.uep-pill--amber {
  background:${T.amberL}; color:${T.amber}; border-color:${T.amber}44;
}

/* Hero buttons */
.uep-hero-btns {
  display:flex; gap:10px; flex-wrap:wrap;
}
.uep-hbtn {
  display:inline-flex; align-items:center; gap:7px;
  border-radius:12px; font-size:13px; font-weight:700;
  padding:9px 18px; cursor:pointer; border:none; outline:none;
  transition:all .18s cubic-bezier(.22,.68,0,1.2);
  font-family:${T.bFont};
}
.uep-hbtn:hover { transform:translateY(-2px); filter:brightness(1.06) }
.uep-hbtn-white { background:white; color:${T.violet} }
.uep-hbtn-ghost {
  background:rgba(255,255,255,.15);
  color:white; border:1.5px solid rgba(255,255,255,.3);
}
.uep-hbtn-ghost:hover { background:rgba(255,255,255,.25) }

/* Stats panel */
.uep-stats {
  display:flex; gap:6px; flex-wrap:wrap; align-items:flex-start;
}
.uep-stat {
  background:rgba(255,255,255,.18);
  border:1.5px solid rgba(255,255,255,.22);
  border-radius:14px; padding:10px 16px; text-align:center;
  min-width:60px;
}
.uep-stat-n {
  font-family:${T.dFont}; font-size:22px; font-weight:900;
  color:white; line-height:1;
}
.uep-stat-l {
  font-size:10px; font-weight:700;
  color:rgba(255,255,255,.7); margin-top:3px; text-transform:uppercase; letter-spacing:.5px;
}

/* ════════════════════════════════════════
   BODY LAYOUT
════════════════════════════════════════ */
.uep-body {
  max-width:1180px; margin:0 auto; padding:32px 24px 0;
  display:grid; grid-template-columns:1fr 300px; gap:24px;
  align-items:start;
}
@media(max-width:860px){
  .uep-body { grid-template-columns:1fr; padding:20px 16px 0; }
}

.uep-main { display:flex; flex-direction:column; gap:24px; }

/* ════════════════════════════════════════
   CARD
════════════════════════════════════════ */
.uep-card {
  background:white;
  border:1.5px solid ${T.border};
  border-radius:20px;
  padding:24px;
  animation:uep-fadeUp .42s both;
  box-shadow:0 4px 24px rgba(108,53,222,.06);
}

/* ── Section header ── */
.uep-section-hd {
  display:flex; align-items:center; gap:10px; margin-bottom:20px;
}
.uep-section-icon {
  width:36px; height:36px; border-radius:10px;
  display:flex; align-items:center; justify-content:center;
  font-size:17px; flex-shrink:0;
}
.uep-section-title {
  font-family:${T.dFont}; font-size:17px; font-weight:900; color:${T.text};
}
.uep-section-sub {
  font-size:12px; color:${T.muted}; margin-top:2px;
}

/* ════════════════════════════════════════
   METADATA FORM
════════════════════════════════════════ */
.uep-field { display:flex; flex-direction:column; gap:6px; margin-bottom:18px; }
.uep-field:last-of-type { margin-bottom:0 }
.uep-label {
  font-size:12px; font-weight:700; color:${T.sub};
  text-transform:uppercase; letter-spacing:.5px;
}
.uep-input {
  border:1.5px solid ${T.border}; border-radius:12px;
  padding:10px 14px; font-size:14px; color:${T.text};
  font-family:${T.bFont}; background:${T.bg};
  transition:border-color .18s, box-shadow .18s; outline:none;
  width:100%;
}
.uep-input:focus {
  border-color:${T.violet};
  box-shadow:0 0 0 3px ${T.violetL};
}
.uep-input::placeholder { color:${T.mutedL} }
.uep-textarea {
  border:1.5px solid ${T.border}; border-radius:12px;
  padding:10px 14px; font-size:14px; color:${T.text};
  font-family:${T.bFont}; background:${T.bg};
  transition:border-color .18s, box-shadow .18s; outline:none;
  resize:vertical; min-height:90px; width:100%;
}
.uep-textarea:focus {
  border-color:${T.violet};
  box-shadow:0 0 0 3px ${T.violetL};
}
.uep-select {
  border:1.5px solid ${T.border}; border-radius:12px;
  padding:10px 14px; font-size:14px; color:${T.text};
  font-family:${T.bFont}; background:${T.bg};
  transition:border-color .18s; outline:none;
  cursor:pointer; appearance:none; width:100%;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%239188C4' stroke-width='1.6' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");
  background-repeat:no-repeat;
  background-position:right 14px center;
  padding-right:36px;
}
.uep-select:focus {
  border-color:${T.violet};
  box-shadow:0 0 0 3px ${T.violetL};
}

/* Level chip row */
.uep-level-row {
  display:flex; gap:6px; flex-wrap:wrap;
}
.uep-level-chip {
  border-radius:10px; padding:6px 14px; font-size:13px; font-weight:700;
  cursor:pointer; border:2px solid transparent; transition:all .16s cubic-bezier(.22,.68,0,1.2);
  font-family:${T.bFont};
}
.uep-level-chip:hover { transform:translateY(-2px) scale(1.04) }
.uep-level-chip.sel { transform:translateY(-2px) scale(1.04); box-shadow:0 4px 14px rgba(0,0,0,.1) }

/* Save button */
.uep-save-btn {
  display:inline-flex; align-items:center; gap:8px;
  background:linear-gradient(135deg,${T.violet},${T.pink});
  color:white; border:none; border-radius:14px;
  padding:12px 26px; font-size:14px; font-weight:700;
  font-family:${T.bFont}; cursor:pointer;
  transition:all .2s cubic-bezier(.22,.68,0,1.2);
  box-shadow:0 6px 20px ${T.violet}40;
}
.uep-save-btn:hover { transform:translateY(-2px) scale(1.02); filter:brightness(1.06) }
.uep-save-btn:disabled { opacity:.6; cursor:not-allowed; transform:none }

/* ════════════════════════════════════════
   CONTENT SECTION CARDS
════════════════════════════════════════ */
.uep-content-grid {
  display:flex; flex-direction:column; gap:14px;
}
.uep-sc {
  border:1.5px solid ${T.border}; border-radius:16px;
  overflow:hidden; background:white;
  animation:uep-rowIn .4s both;
  transition:box-shadow .2s, border-color .2s;
}
.uep-sc:hover {
  border-color:${T.violet}55;
  box-shadow:0 6px 24px ${T.violet}14;
}
.uep-sc-head {
  padding:16px 18px;
  display:flex; align-items:center; gap:14px;
}
.uep-sc-icon {
  width:44px; height:44px; border-radius:13px;
  display:flex; align-items:center; justify-content:center;
  font-size:20px; flex-shrink:0;
  box-shadow:0 4px 12px rgba(0,0,0,.12);
}
.uep-sc-info { flex:1; min-width:0 }
.uep-sc-name {
  font-family:${T.dFont}; font-size:15px; font-weight:900; color:${T.text};
  display:flex; align-items:center; gap:8px;
}
.uep-sc-desc { font-size:12px; color:${T.muted}; margin-top:2px }
.uep-sc-count {
  display:inline-flex; align-items:center;
  background:${T.violetL}; color:${T.violet};
  border-radius:100px; padding:2px 9px;
  font-size:11px; font-weight:700;
}
.uep-sc-btn {
  display:inline-flex; align-items:center; gap:6px;
  padding:9px 18px; border-radius:12px;
  font-size:13px; font-weight:700; font-family:${T.bFont};
  cursor:pointer; border:2px solid ${T.border};
  color:${T.violet}; background:white; flex-shrink:0;
  transition:all .18s cubic-bezier(.22,.68,0,1.2);
}
.uep-sc-btn:hover {
  background:${T.violetL}; border-color:${T.violet};
  transform:translateY(-1px) scale(1.02);
}

/* ════════════════════════════════════════
   ACTIONS PANEL (right sidebar)
════════════════════════════════════════ */
.uep-panel {
  display:flex; flex-direction:column; gap:16px;
  position:sticky; top:24px;
}
.uep-panel-stat {
  display:flex; align-items:center; justify-content:space-between;
  padding:10px 14px;
  border-radius:12px; background:${T.bg};
  border:1.5px solid ${T.border};
  font-size:13px;
}
.uep-panel-stat-label { color:${T.sub}; font-weight:600 }
.uep-panel-stat-val { font-weight:800; color:${T.text}; font-family:${T.dFont} }

.uep-danger-btn {
  display:inline-flex; align-items:center; justify-content:center; gap:8px;
  width:100%; padding:12px 20px; border-radius:14px;
  font-size:13px; font-weight:700; font-family:${T.bFont};
  cursor:pointer; border:2px solid ${T.red}44;
  color:${T.red}; background:${T.redL};
  transition:all .18s;
}
.uep-danger-btn:hover { background:${T.red}; color:white; border-color:${T.red} }

/* ════════════════════════════════════════
   TOAST
════════════════════════════════════════ */
.uep-toast {
  position:fixed; bottom:28px; left:50%; transform:translateX(-50%);
  background:${T.violet}; color:white;
  border-radius:14px; padding:12px 24px;
  font-size:14px; font-weight:700; font-family:${T.bFont};
  box-shadow:0 8px 32px ${T.violet}55;
  animation:uep-saveFlash 2.8s ease-in-out both;
  z-index:9999; white-space:nowrap;
  pointer-events:none;
}

/* ── Shimmer ── */
.uep-shimmer {
  background:linear-gradient(90deg,${T.violetL} 25%,#F5F3FF 50%,${T.violetL} 75%);
  background-size:600px 100%;
  animation:uep-shimmer 1.6s infinite linear;
  border-radius:10px;
}
`;

/* ════════════════════════════════════════════════════════════════════════════
   ICON HELPERS
════════════════════════════════════════════════════════════════════════════ */
const Ico = {
  Back: () => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M9 2L4 7l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  Save: () => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M2 2h8l2 2v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V2z" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M4 2v4h6V2M5 9h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  Trash: () => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M2 3.5h10M5.5 3.5V2.5h3v1M5 3.5v7.5h4V3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  Open: () => (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
      <path d="M5 2H2a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V8M8 1h4v4M6.5 6.5L12 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  Spin: () => (
    <span style={{
      display:"inline-block", width:13, height:13, borderRadius:"50%",
      border:`2px solid rgba(255,255,255,.4)`, borderTopColor:"white",
      animation:"uep-spin .8s linear infinite",
    }} />
  ),
};

/* ════════════════════════════════════════════════════════════════════════════
   SUB-COMPONENTS
════════════════════════════════════════════════════════════════════════════ */

/* ── UnitSectionCard ── */
interface UnitSectionCardProps {
  section: typeof SECTIONS[number];
  count: number | null | undefined;
  navigate: (path: string) => void;
  unitId: string;
  unit?: Unit | null;
  delay?: number;
  onOpenTestPicker?: () => void;
  onOpenTaskPicker?: () => void;
}

function UnitSectionCard({ 
  section, 
  count, 
  navigate, 
  unitId, 
  unit, 
  delay = 0,
  onOpenTestPicker,
  onOpenTaskPicker,
}: UnitSectionCardProps) {
  const isEmpty = count === null || count === undefined || count === 0;
  
  const handleClick = () => {
    if (isEmpty) {
      // If empty, open the appropriate picker/wizard
      if (section.key === 'slides') {
        // Navigate to slide generation page
        navigate(`/admin/generate-slide?unitId=${unitId}`);
      } else if (section.key === 'test' && onOpenTestPicker) {
        onOpenTestPicker();
      } else if (section.key === 'tasks' && onOpenTaskPicker) {
        onOpenTaskPicker();
      } else {
        // Fallback: navigate to the section anyway
        navigate(section.navFn(unitId, unit || undefined));
      }
    } else {
      // If not empty, navigate normally
      navigate(section.navFn(unitId, unit || undefined));
    }
  };

  return (
    <div className="uep-sc" style={{ animationDelay:`${delay}s` }}>
      <div className="uep-sc-head">
        <div className="uep-sc-icon" style={{ background: section.grad }}>
          {section.emoji}
        </div>
        <div className="uep-sc-info">
          <div className="uep-sc-name">
            {section.label}
            {count !== null && count !== undefined && (
              <span className="uep-sc-count">{count} item{count !== 1 ? "s" : ""}</span>
            )}
            {isEmpty && (
              <span className="uep-sc-count" style={{ background: T.amberL, color: T.amber }}>
                Empty
              </span>
            )}
          </div>
          <div className="uep-sc-desc">{section.description}</div>
        </div>
        <button
          className="uep-sc-btn"
          onClick={handleClick}
        >
          <Ico.Open />
          {isEmpty 
            ? (section.key === 'slides' ? 'Generate Slides' : `Create ${section.label}`)
            : section.btnLabel
          }
        </button>
      </div>
    </div>
  );
}

/* ── UnitContentSections ── */
interface UnitContentSectionsProps {
  unit: Unit | null;
  counts: Record<string, number | null>;
  navigate: (path: string) => void;
  unitId: string;
  onOpenTestPicker?: () => void;
  onOpenTaskPicker?: () => void;
}

function UnitContentSections({ 
  unit, 
  counts, 
  navigate, 
  unitId,
  onOpenTestPicker,
  onOpenTaskPicker,
}: UnitContentSectionsProps) {
  return (
    <div className="uep-card" style={{ animationDelay:".16s" }}>
      <div className="uep-section-hd">
        <div className="uep-section-icon" style={{ background:T.violetL }}>
          <span style={{ fontSize:17 }}>📦</span>
        </div>
        <div>
          <div className="uep-section-title">Unit Content</div>
          <div className="uep-section-sub">Navigate to each content editor</div>
        </div>
      </div>
      <div className="uep-content-grid">
        {SECTIONS.map((sec, i) => (
          <UnitSectionCard
            key={sec.key}
            section={sec}
            count={counts[sec.countKey]}
            navigate={navigate}
            unitId={unitId}
            unit={unit}
            delay={i * 0.06}
            onOpenTestPicker={onOpenTestPicker}
            onOpenTaskPicker={onOpenTaskPicker}
          />
        ))}
      </div>
    </div>
  );
}

/* ── UnitMetadataForm ── */
interface UnitMetadataFormProps {
  form: {
    title: string;
    description: string;
    level: string;
    order_index: number | string;
    status: string;
  };
  onChange: (field: string, value: string | number) => void;
  onSave: () => void;
  saving: boolean;
  saved: boolean;
}

function UnitMetadataForm({ form, onChange, onSave, saving, saved }: UnitMetadataFormProps) {
  return (
    <div className="uep-card" style={{ animationDelay:".08s" }}>
      <div className="uep-section-hd">
        <div className="uep-section-icon" style={{ background:T.violetL }}>
          <span style={{ fontSize:17 }}>✏️</span>
        </div>
        <div>
          <div className="uep-section-title">Unit Details</div>
          <div className="uep-section-sub">Edit title, description and settings</div>
        </div>
      </div>

      <div className="uep-field">
        <label className="uep-label">Title</label>
        <input
          className="uep-input"
          value={form.title}
          onChange={e => onChange("title", e.target.value)}
          placeholder="Unit title…"
        />
      </div>

      <div className="uep-field">
        <label className="uep-label">Description</label>
        <textarea
          className="uep-textarea"
          value={form.description}
          onChange={e => onChange("description", e.target.value)}
          placeholder="What will students learn in this unit?"
        />
      </div>

      <div className="uep-field">
        <label className="uep-label">Level</label>
        <div className="uep-level-row">
          {LEVEL_OPTS.map(lvl => {
            const [bg, clr] = LEVEL_CLR[lvl as LevelKey] || [T.violetL, T.violet];
            const sel = form.level === lvl;
            return (
              <button
                key={lvl}
                className={`uep-level-chip${sel ? " sel" : ""}`}
                style={{
                  background: sel ? bg : "white",
                  color: sel ? clr : T.sub,
                  borderColor: sel ? clr : T.border,
                }}
                onClick={() => onChange("level", lvl)}
              >
                {lvl}
              </button>
            );
          })}
        </div>
      </div>

      <div className="uep-field">
        <label className="uep-label">Status</label>
        <select
          className="uep-select"
          value={form.status}
          onChange={e => onChange("status", e.target.value)}
        >
          <option value="draft">Draft</option>
          <option value="published">Published</option>
        </select>
      </div>

      <div className="uep-field">
        <label className="uep-label">Order index</label>
        <input
          className="uep-input"
          type="number"
          value={form.order_index === "" ? "" : form.order_index}
          onChange={e => {
            const raw = e.target.value;
            onChange("order_index", raw === "" ? "" : parseInt(raw, 10));
          }}
          min="0"
          placeholder="0"
          style={{ maxWidth:120 }}
        />
      </div>

      <div style={{ display:"flex", justifyContent:"flex-end", marginTop:6 }}>
        <button
          className="uep-save-btn"
          onClick={onSave}
          disabled={saving}
        >
          {saving ? <><Ico.Spin /> Saving…</> : saved ? <>✓ Saved!</> : <><Ico.Save /> Save Unit</>}
        </button>
      </div>
    </div>
  );
}

/* ── UnitActionsPanel ── */
interface UnitActionsPanelProps {
  unit: Unit | null;
  counts: Record<string, number | null>;
  onSave: () => void;
  saving: boolean;
  saved: boolean;
  onDelete?: () => void;
}

function UnitActionsPanel({ unit, counts, onSave, saving, saved, onDelete }: UnitActionsPanelProps) {
  const statusCfg = STATUS_CFG[(unit?.status as StatusKey) || 'draft'] || STATUS_CFG.draft;
  const total = Object.values(counts).reduce((a: number, b) => a + (typeof b === 'number' ? b : 0), 0);

  return (
    <div className="uep-panel">
      {/* Summary card */}
      <div className="uep-card" style={{ padding:20, animationDelay:".1s" }}>
        <div className="uep-section-hd" style={{ marginBottom:14 }}>
          <div className="uep-section-icon" style={{ background:T.skyL }}>
            <span style={{ fontSize:16 }}>📊</span>
          </div>
          <div>
            <div className="uep-section-title" style={{ fontSize:15 }}>Summary</div>
          </div>
        </div>

        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          <div className="uep-panel-stat">
            <span className="uep-panel-stat-label">Status</span>
            <span style={{
              display:"inline-flex", alignItems:"center",
              background: statusCfg.bg, color: statusCfg.color,
              borderRadius:100, padding:"3px 10px",
              fontSize:11, fontWeight:700,
            }}>
              {statusCfg.label}
            </span>
          </div>

          {unit?.level && (
            <div className="uep-panel-stat">
              <span className="uep-panel-stat-label">Level</span>
              <span className="uep-panel-stat-val" style={{ color:(LEVEL_CLR[unit.level as LevelKey]||[T.violetL, T.violet])[1]||T.violet }}>
                {unit.level}
              </span>
            </div>
          )}

          <div className="uep-panel-stat">
            <span className="uep-panel-stat-label">Total items</span>
            <span className="uep-panel-stat-val">{total}</span>
          </div>

          {SECTIONS.map(sec => {
            const count = counts[sec.countKey];
            return count && count > 0 ? (
              <div key={sec.key} className="uep-panel-stat">
                <span className="uep-panel-stat-label">{sec.label}</span>
                <span className="uep-panel-stat-val">{count}</span>
              </div>
            ) : null;
          })}
        </div>
      </div>

      {/* Quick save */}
      <div className="uep-card" style={{ padding:16, animationDelay:".18s" }}>
        <button
          className="uep-save-btn"
          onClick={onSave}
          disabled={saving}
          style={{ width:"100%", justifyContent:"center" }}
        >
          {saving ? <><Ico.Spin /> Saving…</> : saved ? <>✓ Saved!</> : <><Ico.Save /> Save Unit</>}
        </button>
      </div>

      {/* Danger */}
      {onDelete && (
        <div className="uep-card" style={{ padding:16, animationDelay:".24s" }}>
          <div style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:"uppercase", letterSpacing:.5, marginBottom:10 }}>
            Danger zone
          </div>
          <button className="uep-danger-btn" onClick={onDelete}>
            <Ico.Trash /> Delete Unit
          </button>
        </div>
      )}
    </div>
  );
}

/* ── UnitHeader ── */
interface UnitHeaderProps {
  unit: Unit;
  heroGrad: string;
  navigate: (path: string) => void;
}

function UnitHeader({ unit, heroGrad, navigate }: UnitHeaderProps) {
  const [vis, setVis] = useState(false);
  useEffect(() => { const t = setTimeout(() => setVis(true), 80); return () => clearTimeout(t); }, []);

  const statusCfg = STATUS_CFG[(unit.status as StatusKey) || 'draft'] || STATUS_CFG.draft;
  const [, lvClr] = LEVEL_CLR[(unit.level as LevelKey) || 'A1'] || [T.violetL, T.violet];

  const ORB_DATA = [
    { w:140,h:140,bg:"#CE93D8",l:"-3%",t:"6%",  dur:"13s",delay:"0s"   },
    { w:110,h:110,bg:"#4FC3F7",l:"76%",t:"4%",  dur:"16s",delay:"2s"   },
    { w:160,h:160,bg:"#80DEEA",l:"-4%",t:"52%", dur:"19s",delay:"3.5s" },
    { w: 90,h: 90,bg:"#9FA8DA",l:"82%",t:"58%", dur:"11s",delay:"1.2s" },
  ];
  const FLOATERS = [
    { e:"📖",x:"7%",  y:"18%",s:24,d:0,  an:"uep-float 4s ease-in-out infinite"       },
    { e:"✏️",x:"90%", y:"18%",s:20,d:.6, an:"uep-floatB 4.4s ease-in-out infinite .6s" },
    { e:"🎓",x:"5%",  y:"65%",s:26,d:1.1,an:"uep-float 5s ease-in-out infinite 1.1s"   },
    { e:"⭐",x:"93%", y:"63%",s:16,d:.3, an:"uep-floatB 3.5s ease-in-out infinite .3s" },
  ];

  return (
    <div className="uep-hero" style={{ background: heroGrad }}>
      {/* rings */}
      {[420,280,170].map((s,i) => (
        <div key={i} className="uep-hero-ring" style={{
          width:s, height:s,
          animation:`uep-rotSlow ${34-i*8}s linear infinite ${i%2?"reverse":""}`,
        }}/>
      ))}
      {/* orbs */}
      {ORB_DATA.map((o,i) => (
        <div key={i} className="uep-orb" style={{
          width:o.w,height:o.h,background:o.bg,
          left:o.l,top:o.t,
          animation:`uep-drift ${o.dur} ease-in-out infinite ${o.delay}`,
        }}/>
      ))}
      {/* floaters */}
      {FLOATERS.map((f,i) => (
        <div key={i} className="uep-floater" style={{
          left:f.x,top:f.y,fontSize:f.s,
          opacity: vis ? .65 : 0,
          transition:`opacity .6s ${f.d}s`,
          animation: vis ? f.an : "none",
        }}>{f.e}</div>
      ))}

      {/* Breadcrumb */}
      <div className="uep-bc">
        <a onClick={() => navigate("/admin/courses")}>Courses</a>
        <span className="uep-bc-sep">›</span>
        {unit.course_id && (
          <>
            <a onClick={() => navigate(`/admin/courses/${unit.course_id}`)}>
              {unit.course_title || `Course #${unit.course_id}`}
            </a>
            <span className="uep-bc-sep">›</span>
          </>
        )}
        <span style={{ color:"rgba(255,255,255,.85)", fontWeight:700 }}>{unit.title}</span>
      </div>

      {/* Inner */}
      <div className="uep-hero-inner">
        <div style={{ flex:1, minWidth:0 }}>
          <div className="uep-unit-title">{unit.title}</div>
          <div className="uep-meta-row">
            {unit.level && (
              <span className="uep-pill uep-pill--ghost" style={{
                background:`${lvClr || "#fff"}2A`,
                borderColor:`${lvClr || "#fff"}55`,
              }}>
                {unit.level}
              </span>
            )}
            <span className={`uep-pill ${
              unit.status === "published" ? "uep-pill--lime" :
              (unit.status as string) === "scheduled" ? "uep-pill--amber" :
              "uep-pill--ghost"
            }`}>
              {statusCfg.label}
            </span>
          </div>
          <div className="uep-hero-btns">
            <button
              className="uep-hbtn uep-hbtn-ghost"
              onClick={() => navigate(unit.course_id ? `/admin/courses/${unit.course_id}` : "/admin/courses")}
            >
              <Ico.Back /> Back to course
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   MAIN PAGE
════════════════════════════════════════════════════════════════════════════ */
export default function AdminUnitEditPage() {
  const { id: unitId } = useParams<{ id: string }>();
  const navigate   = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [unit,    setUnit]    = useState<Unit | null>(null);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  
  // Picker states
  const [testPickerOpen, setTestPickerOpen] = useState(false);
  const [taskPickerOpen, setTaskPickerOpen] = useState(false);

  const [form, setForm] = useState<{
    title: string;
    description: string;
    level: string;
    order_index: number | string;
    status: string;
  }>({
    title: "", description: "", level: "A1",
    order_index: 0, status: "draft",
  });

  /* Content counts */
  const [counts, setCounts] = useState<Record<string, number | null>>({
    videos_count: null, tasks_count: null,
    tests_count: null, slides_count: null, materials_count: null,
  });

  /* Flash toast helper */
  const flashToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2800);
  }, []);

  /* ── Load unit ── */
  useEffect(() => {
    if (!unitId) { setError("No unit ID"); setLoading(false); return; }

    const load = async () => {
      try {
        setLoading(true);
        const data = await unitsApi.getAdminUnit(parseInt(unitId));
        setUnit(data);
        setForm({
          title:       data.title       || "",
          description: data.description || "",
          level:       data.level       || "A1",
          order_index: data.order_index ?? 0,
          status:      data.status === "published" ? "published" : "draft",
        });

        /* Load content counts in parallel (graceful failures) */
        const [videos, tasks, testsData] = await Promise.allSettled([
          videosApi.getAdminVideos({ unit_id: parseInt(unitId), limit: 1 }),
          tasksApi.getAdminTasks({ unit_id: parseInt(unitId), limit: 1 }),
          testsApi.getTests({ unit_id: parseInt(unitId), limit: 1 }),
        ]);

        setCounts({
          videos_count:    videos.status === "fulfilled"    ? (Array.isArray(videos.value) ? videos.value.length : 0) : 0,
          tasks_count:     tasks.status  === "fulfilled"    ? (Array.isArray(tasks.value) ? tasks.value.length : 0) : 0,
          tests_count:     testsData.status === "fulfilled" ? (testsData.value?.total ?? (testsData.value?.items?.length ?? 0)) : 0,
          slides_count:    (data as any).slides_count    ?? null,
          materials_count: (data as any).materials_count ?? null,
        });
      } catch (e: unknown) {
        setError((e as Error)?.message || "Failed to load unit");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [unitId]);

  /* ── Save ── */
  const handleSave = useCallback(async () => {
    if (!unitId || saving) return;
    try {
      setSaving(true);
      const payload: Partial<Unit> = {
        title:       form.title,
        description: form.description,
        level:       form.level as Unit['level'],
        order_index: typeof form.order_index === 'string' && form.order_index === "" ? 0 : (typeof form.order_index === 'number' ? form.order_index : parseInt(String(form.order_index), 10)),
        status:      form.status as Unit['status'],
        is_visible_to_students: form.status === 'published' ? true : unit.is_visible_to_students,
      };
      const updatedUnit = await unitsApi.updateUnit(parseInt(unitId), payload);
      setUnit(updatedUnit);
      setSaved(true);
      flashToast("💾 Unit saved!");
      setTimeout(() => setSaved(false), 2200);
    } catch (e: unknown) {
      toast.error((e as Error)?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }, [unitId, form, saving, flashToast]);

  /* ── Delete ── */
  const handleDelete = useCallback(async () => {
    if (!window.confirm("Delete this unit? This cannot be undone.")) return;
    if (!unitId) return;
    try {
      await unitsApi.deleteUnit(parseInt(unitId));
      navigate(unit?.course_id ? `/admin/courses/${unit.course_id}` : "/admin/courses");
    } catch (e: unknown) {
      toast.error((e as Error)?.message || "Delete failed");
    }
  }, [unitId, unit, navigate]);

  /* ── Field change ── */
  const handleChange = useCallback((field: string, value: string | number) => {
    setSaved(false);
    setForm(prev => ({ ...prev, [field]: value }));
  }, []);

  /* ── Hero gradient ── */
  const heroGrad = unit
    ? (unit.status === "published" ? `linear-gradient(135deg,${T.lime},${T.teal})`   :
       (unit.status as string) === "scheduled" ? `linear-gradient(135deg,${T.amber},${T.orange})`:
       unit.status === "archived"  ? `linear-gradient(135deg,#64748B,#94A3B8)`       :
       `linear-gradient(135deg,${T.violetD},${T.violet},#9333EA)`)
    : `linear-gradient(135deg,${T.violetD},${T.violet},#9333EA)`;

  /* ── States ── */
  if (loading) return (
    <>
      <style>{CSS}</style>
      <div className="uep-center">
        <div className="uep-spinner" />
        Loading unit…
      </div>
    </>
  );

  if (error || !unit) return (
    <>
      <style>{CSS}</style>
      <div className="uep-center" style={{ flexDirection:"column", gap:16, textAlign:"center" }}>
        <div style={{ fontSize:40 }}>⚠️</div>
        <div style={{ fontFamily:T.dFont, fontSize:18, fontWeight:900, color:T.text }}>
          {error || "Unit not found"}
        </div>
        <button
          onClick={() => navigate(-1)}
          style={{ border:"none", background:"none", cursor:"pointer",
                   color:T.violet, fontWeight:700, fontSize:14 }}
        >
          ← Go back
        </button>
      </div>
    </>
  );

  return (
    <>
      <style>{CSS}</style>
      <div className="uep-root">

        {/* ── Hero ── */}
        <UnitHeader unit={{ ...unit, ...form } as Unit} heroGrad={heroGrad} navigate={navigate} />

        {/* ── Body ── */}
        <div className="uep-body">

          {/* ── Left: metadata + content sections ── */}
          <div className="uep-main">
            <UnitMetadataForm
              form={form}
              onChange={handleChange}
              onSave={handleSave}
              saving={saving}
              saved={saved}
            />
            <UnitContentSections
              unit={{ ...unit, ...form } as Unit}
              counts={counts}
              navigate={navigate}
              unitId={unitId || ""}
              onOpenTestPicker={() => setTestPickerOpen(true)}
              onOpenTaskPicker={() => setTaskPickerOpen(true)}
            />
          </div>

          {/* ── Right: actions panel ── */}
          <UnitActionsPanel
            unit={{ ...unit, ...form } as Unit}
            counts={counts}
            onSave={handleSave}
            saving={saving}
            saved={saved}
            onDelete={handleDelete}
          />
        </div>

      </div>

      {/* Toast */}
      {toastMsg && <div className="uep-toast">{toastMsg}</div>}

      {/* Test Method Picker */}
      <CreateTestMethodPicker
        open={testPickerOpen}
        onClose={() => setTestPickerOpen(false)}
        unitId={unitId ? parseInt(unitId) : null}
        unitTitle={unit?.title || null}
        onManual={() => {
          setTestPickerOpen(false);
          navigate(`/admin/units/${unitId}/test`);
        }}
        onAI={() => {
          setTestPickerOpen(false);
          // Navigate to AI test generation wizard
          navigate(`/admin/units/${unitId}/test?mode=ai`);
        }}
      />

      {/* Task Method Picker */}
      <CreateTaskMethodPicker
        open={taskPickerOpen}
        onClose={() => setTaskPickerOpen(false)}
        unitId={unitId ? parseInt(unitId) : null}
        unitTitle={unit?.title || null}
        onManual={() => {
          setTaskPickerOpen(false);
          navigate(`/admin/units/${unitId}/tasks`);
        }}
        onAI={() => {
          setTaskPickerOpen(false);
          // Navigate to AI task generation wizard
          navigate(`/admin/units/${unitId}/tasks?mode=ai`);
        }}
      />
    </>
  );
}
