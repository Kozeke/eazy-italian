/**
 * AdminCourseDetailPage.jsx
 *
 * Course → Units builder.
 * URL: /admin/courses/:id
 *
 * Design language: TeacherOnboarding.jsx
 *   – Violet gradient hero header (orb rings, floating decorators)
 *   – Unit rows styled after WorkspaceSidebar module rows
 *   – Inline rename (click title → input → blur/Enter to save)
 *   – Up/down reorder arrows (swaps order_index via PUT /admin/units/:id)
 *   – Dashed "Add unit" CTA at bottom (ws-add-row--module style)
 *   – Shimmer loading skeleton
 *   – Rich empty state
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { coursesApi, unitsApi } from "../../services/api";
import toast from "react-hot-toast";

/* ── Design tokens ───────────────────────────────────────────────────────── */
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

const GRADS = [
  "linear-gradient(135deg,#6C35DE,#F0447C)",
  "linear-gradient(135deg,#0099E6,#6C35DE)",
  "linear-gradient(135deg,#0DB85E,#0099E6)",
  "linear-gradient(135deg,#F5A623,#F76D3C)",
  "linear-gradient(135deg,#F0447C,#F76D3C)",
  "linear-gradient(135deg,#00BCD4,#0DB85E)",
  "linear-gradient(135deg,#9333EA,#0099E6)",
  "linear-gradient(135deg,#F76D3C,#F5A623)",
];

const STATUS_CFG = {
  published:{ label:"Published", bg:T.limeL,    color:T.green  },
  draft:    { label:"Draft",     bg:"#F1F5F9",   color:"#64748B"},
  scheduled:{ label:"Scheduled", bg:T.violetL,   color:T.violet },
  archived: { label:"Archived",  bg:"#F1F5F9",   color:"#64748B"},
};

const LEVEL_CLR = {
  A1:[T.tealL,T.teal], A2:[T.skyL,T.sky], B1:[T.limeL,T.lime],
  B2:[T.violetL,T.violet], C1:[T.amberL,T.amber], C2:[T.pinkL,T.pink],
  mixed:[T.orangeL,T.orange],
};

const stripHtml = h => {
  if(!h) return "";
  const d = document.createElement("div"); d.innerHTML = h;
  return d.textContent || "";
};

/* ── CSS ──────────────────────────────────────────────────────────────────── */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Nunito:wght@700;800;900&family=Inter:wght@400;500;600;700&display=swap');

@keyframes cdp-fadeUp  { from{opacity:0;transform:translateY(18px)} to{opacity:1;transform:none} }
@keyframes cdp-popIn   { from{opacity:0;transform:scale(.9)} to{opacity:1;transform:scale(1)} }
@keyframes cdp-spin    { to{transform:rotate(360deg)} }
@keyframes cdp-pulse   { 0%,100%{transform:scale(1)} 50%{transform:scale(1.07)} }
@keyframes cdp-float   { 0%,100%{transform:translateY(0) rotate(0)} 50%{transform:translateY(-14px) rotate(5deg)} }
@keyframes cdp-floatB  { 0%,100%{transform:translateY(0) rotate(0)} 50%{transform:translateY(-9px) rotate(-4deg)} }
@keyframes cdp-drift   { 0%,100%{transform:translate(0,0)} 33%{transform:translate(12px,-8px)} 66%{transform:translate(-8px,10px)} }
@keyframes cdp-rotSlow { from{transform:rotate(0)} to{transform:rotate(360deg)} }
@keyframes cdp-shimmer { 0%{background-position:-600px 0} 100%{background-position:600px 0} }
@keyframes cdp-saveFlash { 0%{opacity:0;transform:translateY(6px)} 12%{opacity:1;transform:none} 82%{opacity:1} 100%{opacity:0} }
@keyframes cdp-rowIn   { from{opacity:0;transform:translateX(-12px)} to{opacity:1;transform:none} }

.cdp-root {
  min-height:100%; background:${T.bg};
  font-family:${T.bFont}; color:${T.text};
  padding-bottom:100px;
}
.cdp-root *,
.cdp-root *::before,
.cdp-root *::after { box-sizing:border-box; margin:0; padding:0; }

/* ════════════════════════════════════════════════════
   HERO HEADER
════════════════════════════════════════════════════ */
.cdp-hero {
  position:relative; overflow:hidden;
  background:linear-gradient(135deg,${T.violetD} 0%,${T.violet} 60%,#9333EA 100%);
  padding:32px 40px 28px;
  animation:cdp-fadeUp .38s both;
}

/* Rotating rings (mirrors TeacherOnboarding LeftPanel) */
.cdp-ring {
  position:absolute; border-radius:50%;
  border:2px solid rgba(255,255,255,.08);
  top:50%; left:50%;
  transform:translate(-50%,-50%);
  pointer-events:none;
}
/* Orbs */
.cdp-orb {
  position:absolute; border-radius:50%;
  opacity:.20; filter:blur(1px); pointer-events:none;
}
/* Emoji floaters */
.cdp-floater {
  position:absolute; pointer-events:none; user-select:none;
  filter:drop-shadow(0 3px 8px rgba(0,0,0,.22));
  transition:opacity .6s;
}

/* Breadcrumb */
.cdp-breadcrumb {
  display:flex; align-items:center; gap:6px;
  font-size:12px; font-weight:600;
  color:rgba(255,255,255,.55);
  margin-bottom:16px;
  position:relative; z-index:2;
}
.cdp-breadcrumb a {
  color:rgba(255,255,255,.65); text-decoration:none;
  cursor:pointer; transition:color .14s;
  border-radius:6px; padding:2px 0;
}
.cdp-breadcrumb a:hover { color:white; }
.cdp-breadcrumb-sep { color:rgba(255,255,255,.3); }

/* Header inner layout */
.cdp-hero-inner {
  position:relative; z-index:2;
  display:flex; align-items:flex-start;
  justify-content:space-between; gap:24px; flex-wrap:wrap;
}

/* Course title */
.cdp-course-title {
  font-family:${T.dFont}; font-size:clamp(22px,3.5vw,34px);
  font-weight:900; color:white; line-height:1.12;
  margin-bottom:8px;
  text-shadow:0 2px 12px rgba(0,0,0,.18);
}

/* Description */
.cdp-course-desc {
  font-size:13.5px; color:rgba(255,255,255,.65);
  line-height:1.65; max-width:520px;
  font-weight:500; margin-bottom:12px;
  display:-webkit-box; -webkit-line-clamp:2;
  -webkit-box-orient:vertical; overflow:hidden;
}

/* Meta row: level + status pills */
.cdp-meta-row {
  display:flex; align-items:center; gap:8px; flex-wrap:wrap;
}
.cdp-hero-pill {
  display:inline-flex; align-items:center; gap:4px;
  font-size:11px; font-weight:800;
  padding:4px 12px; border-radius:999px;
  backdrop-filter:blur(4px);
  border:1.5px solid rgba(255,255,255,.25);
  letter-spacing:.04em;
}
.cdp-hero-pill--ghost  { background:rgba(255,255,255,.16); color:rgba(255,255,255,.92); }
.cdp-hero-pill--lime   { background:rgba(13,184,94,.28);   color:rgba(255,255,255,.95); border-color:rgba(13,184,94,.5); }
.cdp-hero-pill--amber  { background:rgba(245,166,35,.28);  color:rgba(255,255,255,.95); border-color:rgba(245,166,35,.5); }

/* Stats strip */
.cdp-stats-strip {
  display:flex; gap:0;
  background:rgba(255,255,255,.10);
  border:1.5px solid rgba(255,255,255,.18);
  border-radius:14px; overflow:hidden;
  backdrop-filter:blur(6px);
  width:fit-content; flex-shrink:0; align-self:flex-start;
  margin-top:4px;
}
.cdp-stat {
  padding:14px 22px; text-align:center;
  border-right:1.5px solid rgba(255,255,255,.14);
}
.cdp-stat:last-child { border-right:none; }
.cdp-stat-n { font-family:${T.dFont}; font-size:24px; font-weight:900; color:white; line-height:1; }
.cdp-stat-l { font-size:10px; color:rgba(255,255,255,.5); text-transform:uppercase; letter-spacing:.08em; font-weight:600; margin-top:3px; }

/* Hero action buttons */
.cdp-hero-btns { display:flex; gap:8px; margin-top:18px; flex-wrap:wrap; }
.cdp-btn {
  display:inline-flex; align-items:center; gap:7px;
  padding:10px 20px; border-radius:13px;
  font-family:${T.dFont}; font-size:13px; font-weight:800;
  cursor:pointer; border:none; transition:all .18s;
  text-decoration:none; white-space:nowrap;
}
.cdp-btn-white {
  background:white; color:${T.violet};
  box-shadow:0 4px 14px rgba(0,0,0,.16);
}
.cdp-btn-white:hover { background:${T.violetL}; transform:translateY(-1px); box-shadow:0 8px 22px rgba(0,0,0,.2); }
.cdp-btn-ghost {
  background:rgba(255,255,255,.15); color:white;
  border:1.5px solid rgba(255,255,255,.32);
}
.cdp-btn-ghost:hover { background:rgba(255,255,255,.26); }
.cdp-btn-icon {
  width:22px; height:22px; border-radius:7px;
  background:rgba(255,255,255,.18);
  display:flex; align-items:center; justify-content:center; flex-shrink:0;
}
.cdp-btn-white .cdp-btn-icon { background:${T.violetL}; }

/* ════════════════════════════════════════════════════
   UNITS SECTION
════════════════════════════════════════════════════ */
.cdp-units-section {
  padding:24px 40px 0;
  animation:cdp-fadeUp .44s .08s both;
}
.cdp-section-hd {
  display:flex; align-items:center; justify-content:space-between;
  margin-bottom:20px;
}
.cdp-section-title {
  font-family:${T.dFont}; font-size:20px; font-weight:900; color:${T.text};
  display:flex; align-items:center; gap:10px;
}
.cdp-section-badge {
  display:inline-flex; align-items:center;
  background:linear-gradient(135deg,${T.violetL},${T.pinkL});
  color:${T.violet};
  font-size:12px; font-weight:800;
  padding:3px 12px; border-radius:999px;
  border:1.5px solid rgba(108,53,222,.18);
}
.cdp-section-subtitle {
  font-size:13px; color:${T.muted}; margin-top:4px; font-weight:500; line-height:1.5;
}

/* Progress bar above unit list */
.cdp-overall-progress {
  background:white; border:1.5px solid ${T.border};
  border-radius:14px; padding:14px 18px;
  display:flex; align-items:center; gap:16px;
  margin-bottom:18px;
  animation:cdp-fadeUp .46s .1s both;
}
.cdp-prog-label {
  font-size:12px; font-weight:700; color:${T.sub};
  white-space:nowrap; flex-shrink:0;
}
.cdp-prog-track {
  flex:1; height:6px; background:${T.border};
  border-radius:999px; overflow:hidden;
}
.cdp-prog-fill {
  height:100%; border-radius:999px;
  background:linear-gradient(90deg,${T.lime},${T.teal});
  transition:width .6s cubic-bezier(.22,.68,0,1.2);
}
.cdp-prog-pct {
  font-family:${T.dFont}; font-size:14px; font-weight:900;
  color:${T.text}; white-space:nowrap; flex-shrink:0;
}

/* ── Unit row card ── */
.cdp-unit {
  background:white;
  border:2px solid ${T.border};
  border-radius:20px;
  margin-bottom:10px;
  display:flex; align-items:stretch;
  overflow:hidden;
  transition:all .22s cubic-bezier(.22,.68,0,1.2);
  animation:cdp-rowIn .38s both;
  position:relative;
  box-shadow:0 1px 4px rgba(108,53,222,.04);
}
.cdp-unit:hover {
  border-color:rgba(108,53,222,.28);
  box-shadow:0 10px 32px rgba(108,53,222,.12);
  transform:translateY(-3px);
}
.cdp-unit.dragging {
  box-shadow:0 20px 48px rgba(108,53,222,.3);
  border-color:${T.violet};
  opacity:.92; z-index:100;
  transform:scale(1.01);
}
.cdp-unit.drag-over {
  border-color:${T.violet};
  background:${T.violetL};
}

/* Drag handle */
.cdp-drag-handle {
  display:flex; flex-direction:column;
  align-items:center; justify-content:center; gap:3px;
  padding:0 14px; cursor:grab;
  color:${T.mutedL}; flex-shrink:0;
  transition:color .14s;
  border-right:1.5px solid ${T.border};
  background:${T.bg};
  user-select:none;
}
.cdp-drag-handle:hover { color:${T.violet}; background:${T.violetL}; }
.cdp-drag-handle:active { cursor:grabbing; }
.cdp-drag-dot { width:3px; height:3px; border-radius:50%; background:currentColor; }

/* Gradient index badge */
.cdp-unit-num {
  width:42px; height:42px; border-radius:14px; flex-shrink:0;
  display:flex; align-items:center; justify-content:center;
  font-family:${T.dFont}; font-size:16px; font-weight:900;
  color:white; margin:0 14px;
  box-shadow:0 4px 12px rgba(0,0,0,.14);
}

/* Unit row main content area */
.cdp-unit-body {
  flex:1; min-width:0;
  padding:14px 0; display:flex;
  align-items:center; gap:14px;
}

/* Title (static) */
.cdp-unit-title {
  flex:1; min-width:0;
  font-family:${T.dFont}; font-size:15px; font-weight:800;
  color:${T.text}; white-space:nowrap;
  overflow:hidden; text-overflow:ellipsis;
  cursor:text;
  padding:4px 8px; border-radius:8px; border:2px solid transparent;
  transition:border-color .14s, background .14s;
  line-height:1.4;
}
.cdp-unit-title:hover { background:${T.bg}; border-color:${T.border}; }

/* Inline rename input */
.cdp-unit-title-input {
  flex:1; min-width:0;
  font-family:${T.dFont}; font-size:15px; font-weight:800;
  color:${T.text};
  padding:4px 10px; border-radius:8px;
  border:2px solid ${T.violet};
  background:white; outline:none;
  box-shadow:0 0 0 3px ${T.violetL};
  line-height:1.4;
  transition:none;
}

/* Meta chips row */
.cdp-unit-meta {
  display:flex; align-items:center; gap:6px;
  flex-wrap:wrap; flex-shrink:0;
}
.cdp-mini-chip {
  font-size:11px; font-weight:600;
  padding:3px 9px; border-radius:8px;
  background:${T.bg}; color:${T.sub};
  border:1.5px solid ${T.border};
  display:inline-flex; align-items:center; gap:3px;
  white-space:nowrap;
}
.cdp-unit-status-chip {
  font-size:10px; font-weight:800; padding:3px 9px;
  border-radius:999px; white-space:nowrap; flex-shrink:0;
  letter-spacing:.04em;
}

/* Right-side action group (hidden until hover) */
.cdp-unit-actions {
  display:flex; align-items:center; gap:4px;
  padding:0 14px; flex-shrink:0;
  opacity:0; transition:opacity .15s;
}
.cdp-unit:hover .cdp-unit-actions { opacity:1; }

/* Reorder arrows */
.cdp-reorder-col {
  display:flex; flex-direction:column; gap:2px;
  flex-shrink:0;
}
.cdp-arrow-btn {
  width:24px; height:24px; border-radius:7px;
  border:1.5px solid ${T.border}; background:white;
  color:${T.mutedL}; cursor:pointer;
  display:flex; align-items:center; justify-content:center;
  transition:all .13s; font-size:10px; padding:0; line-height:1;
}
.cdp-arrow-btn:hover { background:${T.violetL}; border-color:${T.violet}; color:${T.violet}; }
.cdp-arrow-btn:disabled { opacity:.28; cursor:not-allowed; }

/* Icon button */
.cdp-ico-btn {
  width:32px; height:32px; border-radius:10px;
  border:1.5px solid ${T.border}; background:white;
  color:${T.sub}; display:flex; align-items:center;
  justify-content:center; cursor:pointer; transition:all .14s;
  flex-shrink:0;
}
.cdp-ico-btn:hover            { background:${T.violetL}; border-color:${T.violet}; color:${T.violet}; }
.cdp-ico-btn.open:hover       { background:${T.skyL}; border-color:${T.sky}; color:${T.sky}; }
.cdp-ico-btn.del:hover        { background:${T.redL}; border-color:${T.red}; color:${T.red}; }
.cdp-ico-btn.saving           { opacity:.5; cursor:wait; }

/* Open CTA on right — arrow chip */
.cdp-open-btn {
  display:inline-flex; align-items:center; gap:6px;
  padding:8px 16px; border-radius:12px;
  background:${T.violetL}; color:${T.violet};
  border:1.5px solid rgba(108,53,222,.2);
  font-family:${T.dFont}; font-size:12px; font-weight:800;
  cursor:pointer; transition:all .18s cubic-bezier(.22,.68,0,1.2); flex-shrink:0;
  white-space:nowrap; letter-spacing:.01em;
}
.cdp-open-btn:hover {
  background:linear-gradient(135deg,${T.violet},${T.pink});
  border-color:transparent; color:white;
  transform:translateX(3px);
  box-shadow:0 4px 16px rgba(108,53,222,.32);
}

/* ── Inline create row ── */
.cdp-create-row {
  background:white; border:2px dashed ${T.violet}55;
  border-radius:20px; padding:14px 18px;
  display:flex; align-items:center; gap:12px;
  margin-bottom:10px;
  animation:cdp-popIn .22s both;
}
.cdp-create-input {
  flex:1; border:2px solid ${T.violet}; border-radius:10px;
  padding:10px 14px; font-family:${T.dFont}; font-size:15px;
  font-weight:800; color:${T.text}; background:white;
  outline:none; box-shadow:0 0 0 3px ${T.violetL};
}
.cdp-create-input::placeholder { color:${T.mutedL}; }
.cdp-create-save {
  display:inline-flex; align-items:center; gap:6px;
  padding:10px 18px; border-radius:12px; border:none;
  background:linear-gradient(135deg,${T.violet},${T.pink});
  color:white; font-family:${T.dFont}; font-size:13px; font-weight:900;
  cursor:pointer; box-shadow:0 4px 14px rgba(108,53,222,.35);
  transition:all .16s; white-space:nowrap; flex-shrink:0;
}
.cdp-create-save:disabled { opacity:.5; cursor:not-allowed; }
.cdp-create-save:hover:not(:disabled) { filter:brightness(1.06); transform:translateY(-1px); }
.cdp-create-cancel {
  width:36px; height:36px; border-radius:10px;
  border:1.5px solid ${T.border}; background:white;
  color:${T.muted}; cursor:pointer;
  display:flex; align-items:center; justify-content:center;
  font-size:18px; line-height:1;
  transition:all .13s; flex-shrink:0;
}
.cdp-create-cancel:hover { background:${T.redL}; border-color:${T.red}; color:${T.red}; }

/* ── Add unit CTA ── */
.cdp-add-btn {
  display:flex; align-items:center; gap:12px;
  padding:15px 20px; border-radius:18px;
  border:2px dashed ${T.border};
  background:white; color:${T.muted};
  cursor:pointer; font-family:${T.dFont};
  font-size:14px; font-weight:800;
  transition:all .2s; width:100%; text-align:left;
  margin-top:4px;
}
.cdp-add-btn:hover {
  border-color:${T.violet}; color:${T.violet};
  background:${T.violetL};
  transform:translateY(-1px);
}
.cdp-add-btn-ico {
  width:34px; height:34px; border-radius:11px;
  background:${T.violetL}; color:${T.violet};
  display:flex; align-items:center; justify-content:center;
  flex-shrink:0; transition:all .18s;
}
.cdp-add-btn:hover .cdp-add-btn-ico { background:${T.violet}; color:white; transform:rotate(90deg); }

/* ── Empty state ── */
.cdp-empty {
  background:white; border:2px solid ${T.border};
  border-radius:24px; padding:56px 32px;
  text-align:center;
  animation:cdp-popIn .4s .1s both;
}
.cdp-empty-orb {
  width:80px; height:80px; border-radius:26px;
  background:linear-gradient(135deg,${T.violet},${T.pink});
  display:flex; align-items:center; justify-content:center;
  font-size:36px; margin:0 auto 24px;
  box-shadow:0 12px 40px rgba(108,53,222,.36);
  animation:cdp-float 4s ease-in-out infinite;
}
.cdp-empty-title { font-family:${T.dFont}; font-size:22px; font-weight:900; color:${T.text}; margin-bottom:10px; }
.cdp-empty-sub   { font-size:14px; color:${T.sub}; line-height:1.7; max-width:380px; margin:0 auto 28px; }
.cdp-empty-cta {
  display:inline-flex; align-items:center; gap:8px;
  padding:14px 26px; border-radius:16px; border:none;
  background:linear-gradient(135deg,${T.violet},${T.pink});
  color:white; font-family:${T.dFont}; font-size:15px; font-weight:900;
  cursor:pointer; box-shadow:0 8px 24px rgba(108,53,222,.4);
  transition:all .2s;
  animation:cdp-pulse 2.4s ease-in-out infinite 2s;
}
.cdp-empty-cta:hover { transform:translateY(-2px) scale(1.02); box-shadow:0 14px 32px rgba(108,53,222,.5); }

/* ── Loading skeleton ── */
.cdp-skel-row {
  background:white; border:2px solid ${T.border}; border-radius:20px;
  height:72px; overflow:hidden; margin-bottom:10px;
}
.cdp-skel-shimmer {
  height:100%;
  background:linear-gradient(90deg,${T.violetL} 25%,#f0ecff 50%,${T.violetL} 75%);
  background-size:600px 100%;
  animation:cdp-shimmer 1.6s infinite linear;
}

/* ── Delete confirm modal ── */
.cdp-modal-bg {
  position:fixed; inset:0; z-index:1000;
  background:rgba(26,16,53,.55); backdrop-filter:blur(4px);
  display:flex; align-items:center; justify-content:center;
  padding:24px; animation:cdp-fadeUp .18s both;
}
.cdp-modal {
  background:white; border-radius:24px; padding:36px;
  max-width:370px; width:100%;
  box-shadow:0 32px 80px rgba(0,0,0,.24);
  animation:cdp-popIn .2s both;
}

/* ── Save toast ── */
.cdp-toast {
  position:fixed; bottom:24px; right:24px; z-index:9999;
  background:#1A1035; color:white;
  padding:10px 18px; border-radius:12px;
  font-size:13px; font-weight:700;
  display:flex; align-items:center; gap:8px;
  animation:cdp-saveFlash 2.4s ease both;
  pointer-events:none;
  box-shadow:0 8px 24px rgba(0,0,0,.25);
}

/* ── Loading / error center ── */
.cdp-center {
  display:flex; align-items:center; justify-content:center;
  height:50vh; gap:12px; color:${T.muted}; font-size:15px;
}
.cdp-spinner {
  width:24px; height:24px;
  border:3px solid ${T.border}; border-top-color:${T.violet};
  border-radius:50%; animation:cdp-spin .8s linear infinite;
}

/* Scrollbar */
.cdp-root::-webkit-scrollbar { width:4px; }
.cdp-root::-webkit-scrollbar-track { background:transparent; }
.cdp-root::-webkit-scrollbar-thumb { background:${T.border}; border-radius:999px; }
`;

/* ── Icons ───────────────────────────────────────────────────────────────── */
const Ico = {
  Back:  ()=><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 2L4 7l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  Plus:  ()=><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>,
  Pencil:()=><svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M11 2l3 3L6 13H3v-3L11 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg>,
  Open:  ()=><svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M9 3h4v4M13 3l-7 7M3 5H2a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  Trash: ()=><svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M2 4h12M5 4V2.5h6V4M5 4l.5 9h5L11 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  Check: ()=><svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M2 7l4 4 6-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  Up:    ()=><svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 7l3-3 3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  Down:  ()=><svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 3l3 3 3-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  Students:()=><svg width="11" height="11" viewBox="0 0 16 16" fill="none"><circle cx="6" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.4"/><path d="M1 14c0-2.76 2.24-5 5-5s5 2.24 5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><path d="M11 3a2.5 2.5 0 0 1 0 5M15 14c0-2.2-1.5-4.08-3.5-4.72" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>,
  Video: ()=><svg width="11" height="11" viewBox="0 0 16 16" fill="none"><rect x="1" y="3" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.4"/><path d="M11 6.5l4-2.5v8l-4-2.5V6.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg>,
  Task:  ()=><svg width="11" height="11" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.4"/><path d="M5 5h6M5 8h6M5 11h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>,
  Test:  ()=><svg width="11" height="11" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.4"/><path d="M5 6l2 2 4-4M5 11h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  Drag:  ()=>(
    <div style={{display:"flex",flexDirection:"column",gap:"3px",padding:"2px"}}>
      {[0,1,2].map(i=>(
        <div key={i} style={{display:"flex",gap:"3px"}}>
          <div style={{width:3,height:3,borderRadius:"50%",background:"currentColor"}}/>
          <div style={{width:3,height:3,borderRadius:"50%",background:"currentColor"}}/>
        </div>
      ))}
    </div>
  ),
};

/* ── Skeleton ────────────────────────────────────────────────────────────── */
const UnitSkel = ({i}) => (
  <div className="cdp-skel-row" style={{animationDelay:`${i*.06}s`}}>
    <div className="cdp-skel-shimmer"/>
  </div>
);

/* ════════════════════════════════════════════════════════════════════════════
   UNIT ROW
════════════════════════════════════════════════════════════════════════════ */
const UnitRow = ({
  unit, idx, total,
  onOpen, onEdit, onDelete,
  onMoveUp, onMoveDown,
  onRenameStart, onRenameDone, onRenameCancel,
  renamingId, renameVal, setRenameVal, renameSaving,
}) => {
  const grad    = GRADS[idx % GRADS.length];
  const st      = STATUS_CFG[unit.status] || STATUS_CFG.draft;
  const [lvBg, lvColor] = LEVEL_CLR[unit.level] || [T.violetL, T.violet];
  const isRenaming = renamingId === unit.id;
  const inputRef = useRef(null);

  useEffect(() => {
    if (isRenaming) inputRef.current?.focus();
  }, [isRenaming]);

  const contentCount = unit.content_count || {};
  const videoCount   = contentCount.videos ?? 0;
  const taskCount    = contentCount.tasks  ?? 0;
  const testCount    = contentCount.tests  ?? 0;

  return (
    <div
      className="cdp-unit"
      style={{ animationDelay: `${idx * .05}s` }}
    >
      {/* Drag handle */}
      <div className="cdp-drag-handle" title="Drag to reorder" style={{minHeight:70}}>
        <Ico.Drag/>
      </div>

      {/* Gradient number badge */}
      <div className="cdp-unit-num" style={{ background: grad }}>
        {idx + 1}
      </div>

      {/* Main body */}
      <div className="cdp-unit-body">
        {/* Title or inline input */}
        {isRenaming ? (
          <input
            ref={inputRef}
            className="cdp-unit-title-input"
            value={renameVal}
            onChange={e => setRenameVal(e.target.value)}
            onBlur={() => onRenameDone(unit.id)}
            onKeyDown={e => {
              if (e.key === "Enter") onRenameDone(unit.id);
              if (e.key === "Escape") onRenameCancel();
            }}
            disabled={renameSaving}
            style={{ width: "100%", maxWidth: 420 }}
          />
        ) : (
          <div
            className="cdp-unit-title"
            title="Click to rename"
            onClick={() => onRenameStart(unit)}
          >
            {unit.title}
          </div>
        )}

        {/* Meta chips */}
        {!isRenaming && (
          <div className="cdp-unit-meta">
            {unit.level && (
              <span className="cdp-mini-chip" style={{ background: lvBg, color: lvColor, borderColor: `${lvColor}33` }}>
                {unit.level}
              </span>
            )}
            {videoCount > 0 && (
              <span className="cdp-mini-chip">
                <Ico.Video/> {videoCount}
              </span>
            )}
            {taskCount > 0 && (
              <span className="cdp-mini-chip">
                <Ico.Task/> {taskCount}
              </span>
            )}
            {testCount > 0 && (
              <span className="cdp-mini-chip">
                <Ico.Test/> {testCount}
              </span>
            )}
            <span
              className="cdp-unit-status-chip"
              style={{ background: st.bg, color: st.color }}
            >
              {st.label}
            </span>
          </div>
        )}

        {/* Inline rename saving indicator */}
        {isRenaming && renameSaving && (
          <div style={{ display:"flex", alignItems:"center", gap:6, color:T.muted, fontSize:12, fontWeight:600 }}>
            <div className="cdp-spinner" style={{ width:14, height:14, borderWidth:2 }}/>
            Saving…
          </div>
        )}
      </div>

      {/* Right actions (revealed on hover) */}
      <div className="cdp-unit-actions">
        {/* Reorder arrows */}
        <div className="cdp-reorder-col">
          <button
            className="cdp-arrow-btn" title="Move up"
            disabled={idx === 0}
            onClick={e => { e.stopPropagation(); onMoveUp(idx); }}
          ><Ico.Up/></button>
          <button
            className="cdp-arrow-btn" title="Move down"
            disabled={idx === total - 1}
            onClick={e => { e.stopPropagation(); onMoveDown(idx); }}
          ><Ico.Down/></button>
        </div>

        {/* Edit settings */}
        <button
          className="cdp-ico-btn" title="Edit settings"
          onClick={e => { e.stopPropagation(); onEdit(unit.id); }}
        ><Ico.Pencil/></button>

        {/* Delete */}
        <button
          className="cdp-ico-btn del" title="Delete"
          onClick={e => { e.stopPropagation(); onDelete(unit); }}
        ><Ico.Trash/></button>

        {/* Open unit */}
        <button
          className="cdp-open-btn"
          onClick={e => { e.stopPropagation(); onOpen(unit.id); }}
        >
          Open <span style={{ fontSize:13 }}>→</span>
        </button>
      </div>
    </div>
  );
};

/* ════════════════════════════════════════════════════════════════════════════
   DELETE MODAL
════════════════════════════════════════════════════════════════════════════ */
const DelModal = ({ unit, busy, onConfirm, onCancel }) => (
  <div className="cdp-modal-bg" onClick={() => !busy && onCancel()}>
    <div className="cdp-modal" onClick={e => e.stopPropagation()}>
      <div style={{ fontSize:40, textAlign:"center", marginBottom:16 }}>🗑️</div>
      <h3 style={{ fontFamily:T.dFont, fontSize:20, fontWeight:900, color:T.text, textAlign:"center", marginBottom:8 }}>
        Delete unit?
      </h3>
      <p style={{ fontSize:13, color:T.sub, textAlign:"center", lineHeight:1.7, marginBottom:24 }}>
        <strong style={{ color:T.text }}>"{unit.title}"</strong> and all its videos, tasks
        and tests will be permanently deleted. This cannot be undone.
      </p>
      <div style={{ display:"flex", gap:10 }}>
        <button
          disabled={busy}
          style={{ flex:1, padding:"12px", borderRadius:14, border:`2px solid ${T.border}`, background:"white", color:T.sub, fontFamily:T.dFont, fontSize:14, fontWeight:800, cursor:"pointer" }}
          onClick={onCancel}
        >Cancel</button>
        <button
          disabled={busy}
          style={{ flex:1, padding:"12px", borderRadius:14, border:"none", background:"linear-gradient(135deg,#EF4444,#DC2626)", color:"white", fontFamily:T.dFont, fontSize:14, fontWeight:900, cursor:busy?"not-allowed":"pointer", opacity:busy?.6:1, boxShadow:"0 6px 20px rgba(239,68,68,.4)" }}
          onClick={onConfirm}
        >{busy ? "Deleting…" : "Delete unit"}</button>
      </div>
    </div>
  </div>
);

/* ════════════════════════════════════════════════════════════════════════════
   MAIN PAGE
════════════════════════════════════════════════════════════════════════════ */
export default function AdminCourseDetailPage() {
  const { id }   = useParams();
  const navigate = useNavigate();

  const [course,      setCourse]      = useState(null);
  const [units,       setUnits]       = useState([]);
  const [loading,     setLoading]     = useState(true);

  /* rename state */
  const [renamingId,  setRenamingId]  = useState(null);
  const [renameVal,   setRenameVal]   = useState("");
  const [renameSaving,setRenameSaving]= useState(false);

  /* inline create state */
  const [creating,    setCreating]    = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createBusy,  setCreateBusy]  = useState(false);
  const createRef = useRef(null);

  /* delete state */
  const [toDelete,    setToDelete]    = useState(null);
  const [deleteBusy,  setDeleteBusy]  = useState(false);

  /* toast */
  const [toastMsg,    setToastMsg]    = useState(null);

  /* hero floaters */
  const [heroVis,     setHeroVis]     = useState(false);

  /* ── Load ── */
  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      coursesApi.getAdminCourse(parseInt(id)),
      (unitsApi.getUnits?.({ course_id: id }) || Promise.resolve([])).catch(() => []),
    ]).then(([c, u]) => {
      setCourse(c);
      const sorted = (Array.isArray(u) ? u : []).sort(
        (a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)
      );
      setUnits(sorted);
    }).catch(() => {
      toast.error("Failed to load course");
    }).finally(() => setLoading(false));
    const t = setTimeout(() => setHeroVis(true), 160);
    return () => clearTimeout(t);
  }, [id]);

  /* focus inline create */
  useEffect(() => {
    if (creating) createRef.current?.focus();
  }, [creating]);

  /* ── Toast helper ── */
  const showToast = useCallback((msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2400);
  }, []);

  /* ── Rename ── */
  const handleRenameStart = useCallback((unit) => {
    setRenamingId(unit.id);
    setRenameVal(unit.title);
  }, []);

  const handleRenameDone = useCallback(async (unitId) => {
    const trimmed = renameVal.trim();
    if (!trimmed) { setRenamingId(null); return; }
    const original = units.find(u => u.id === unitId)?.title;
    if (trimmed === original) { setRenamingId(null); return; }

    setRenameSaving(true);
    try {
      const updated = await unitsApi.updateUnit(unitId, { title: trimmed });
      setUnits(prev => prev.map(u => u.id === unitId ? { ...u, title: updated.title ?? trimmed } : u));
      showToast("✓ Unit renamed");
    } catch {
      toast.error("Failed to rename unit");
    } finally {
      setRenameSaving(false);
      setRenamingId(null);
    }
  }, [renameVal, units, showToast]);

  const handleRenameCancel = useCallback(() => {
    setRenamingId(null);
    setRenameVal("");
  }, []);

  /* ── Reorder ── */
  const swapUnits = useCallback(async (idxA, idxB) => {
    const next = [...units];
    [next[idxA], next[idxB]] = [next[idxB], next[idxA]];

    // Reassign order_index sequentially
    const withIdx = next.map((u, i) => ({ ...u, order_index: i + 1 }));
    setUnits(withIdx);

    try {
      await Promise.all([
        unitsApi.updateUnit(withIdx[idxA].id, { order_index: withIdx[idxA].order_index }),
        unitsApi.updateUnit(withIdx[idxB].id, { order_index: withIdx[idxB].order_index }),
      ]);
      showToast("✓ Order saved");
    } catch {
      toast.error("Failed to save order");
      setUnits(units); // revert
    }
  }, [units, showToast]);

  /* ── Inline create ── */
  const handleCreate = useCallback(async () => {
    const trimmed = createTitle.trim();
    if (!trimmed) return;
    setCreateBusy(true);
    try {
      const newUnit = await unitsApi.createUnit({
        title: trimmed,
        course_id: parseInt(id),
        status: "draft",
        order_index: units.length + 1,
      });
      setUnits(prev => [...prev, newUnit]);
      setCreateTitle("");
      setCreating(false);
      showToast("✓ Unit created");
    } catch {
      toast.error("Failed to create unit");
    } finally {
      setCreateBusy(false);
    }
  }, [createTitle, id, units.length, showToast]);

  /* ── Delete ── */
  const handleDelete = useCallback(async () => {
    if (!toDelete) return;
    setDeleteBusy(true);
    try {
      await unitsApi.deleteUnit(toDelete.id);
      setUnits(prev => {
        const next = prev.filter(u => u.id !== toDelete.id);
        return next.map((u, i) => ({ ...u, order_index: i + 1 }));
      });
      showToast("✓ Unit deleted");
    } catch {
      toast.error("Failed to delete unit");
    } finally {
      setDeleteBusy(false);
      setToDelete(null);
    }
  }, [toDelete, showToast]);

  /* ── Derived stats ── */
  const publishedUnits = units.filter(u => u.status === "published").length;
  const totalStudents  = course?.enrolled_students_count ?? 0;
  const pubPct         = units.length > 0 ? Math.round((publishedUnits / units.length) * 100) : 0;

  const courseStatusCfg = STATUS_CFG[course?.status] || STATUS_CFG.draft;

  /* ── Hero decoration config ── */
  const ORB_DATA = [
    { w:160,h:160,bg:"#CE93D8",l:"-3%",t:"8%", dur:"13s",delay:"0s"  },
    { w:120,h:120,bg:"#4FC3F7",l:"74%",t:"4%", dur:"16s",delay:"2s"  },
    { w:180,h:180,bg:"#80DEEA",l:"-5%",t:"50%",dur:"19s",delay:"3.5s"},
    { w:100,h:100,bg:"#9FA8DA",l:"80%",t:"55%",dur:"11s",delay:"1.2s"},
  ];
  const FLOATERS = [
    { e:"📖",x:"8%", y:"18%",s:28,d:0,  an:"cdp-float 4s ease-in-out infinite" },
    { e:"✏️",x:"89%",y:"20%",s:22,d:.6, an:"cdp-floatB 4.4s ease-in-out infinite .6s" },
    { e:"🎓",x:"5%", y:"60%",s:30,d:1.1,an:"cdp-float 5s ease-in-out infinite 1.1s" },
    { e:"⭐",x:"93%",y:"62%",s:18,d:.3, an:"cdp-floatB 3.5s ease-in-out infinite .3s" },
    { e:"💡",x:"48%",y:"8%", s:22,d:.8, an:"cdp-float 4.6s ease-in-out infinite .8s" },
  ];

  /* ─────────────────────────────────────────────────── */
  /* Loading                                             */
  /* ─────────────────────────────────────────────────── */
  if (loading) return (
    <>
      <style>{CSS}</style>
      <div className="cdp-center">
        <div className="cdp-spinner"/> Loading course…
      </div>
    </>
  );

  if (!course) return (
    <>
      <style>{CSS}</style>
      <div className="cdp-center">Course not found.</div>
    </>
  );

  /* ─────────────────────────────────────────────────── */
  /* Render                                              */
  /* ─────────────────────────────────────────────────── */
  const [lvBg, lvColor] = LEVEL_CLR[course.level] || [T.violetL, T.violet];

  return (
    <>
      <style>{CSS}</style>

      <div className="cdp-root">

        {/* ════════════════════════════════════════════
            HERO
        ════════════════════════════════════════════ */}
        <div className="cdp-hero">
          {/* Rings */}
          {[480,320,200].map((s,i) => (
            <div key={i} className="cdp-ring" style={{
              width:s, height:s,
              animation:`cdp-rotSlow ${36-i*8}s linear infinite ${i%2?"reverse":""}`,
            }}/>
          ))}

          {/* Orbs */}
          {ORB_DATA.map((o,i) => (
            <div key={i} className="cdp-orb" style={{
              width:o.w, height:o.h, background:o.bg,
              left:o.l, top:o.t,
              animation:`cdp-drift ${o.dur} ease-in-out infinite ${o.delay}`,
            }}/>
          ))}

          {/* Floaters */}
          {FLOATERS.map((f,i) => (
            <div key={i} className="cdp-floater" style={{
              left:f.x, top:f.y, fontSize:f.s,
              opacity: heroVis ? .68 : 0,
              transition:`opacity .6s ${f.d}s`,
              animation: heroVis ? f.an : "none",
            }}>{f.e}</div>
          ))}

          {/* Breadcrumb */}
          <div className="cdp-breadcrumb">
            <a onClick={() => navigate("/admin/courses")}>
              <span style={{ display:"inline-flex", alignItems:"center", gap:4 }}>
                <Ico.Back/> Courses
              </span>
            </a>
            <span className="cdp-breadcrumb-sep">›</span>
            <span style={{ color:"rgba(255,255,255,.82)", fontWeight:700 }}>{course.title}</span>
          </div>

          <div className="cdp-hero-inner">
            {/* Left: title + desc + meta */}
            <div style={{ flex:1, minWidth:0 }}>
              <div className="cdp-course-title">{course.title}</div>
              {course.description && (
                <div className="cdp-course-desc">{stripHtml(course.description)}</div>
              )}
              <div className="cdp-meta-row">
                {course.level && (
                  <span className="cdp-hero-pill cdp-hero-pill--ghost"
                    style={{ background:`${lvColor}2A`, borderColor:`${lvColor}55` }}>
                    {course.level}
                  </span>
                )}
                {course.subject && (
                  <span className="cdp-hero-pill cdp-hero-pill--ghost">
                    {course.subject}
                  </span>
                )}
                <span className={`cdp-hero-pill ${
                  course.status === "published" ? "cdp-hero-pill--lime" :
                  course.status === "scheduled" ? "cdp-hero-pill--amber" :
                  "cdp-hero-pill--ghost"}`}>
                  {courseStatusCfg.label}
                </span>
              </div>

              {/* Action buttons */}
              <div className="cdp-hero-btns">
                <button
                  className="cdp-btn cdp-btn-white"
                  onClick={() => navigate(`/admin/courses/${id}/edit`)}
                >
                  <span className="cdp-btn-icon"><Ico.Pencil/></span>
                  Edit Course
                </button>
                <button
                  className="cdp-btn cdp-btn-ghost"
                  onClick={() => { setCreating(true); setCreateTitle(""); }}
                >
                  <span className="cdp-btn-icon"><Ico.Plus/></span>
                  Add Unit
                </button>
              </div>
            </div>

            {/* Right: stat boxes */}
            <div className="cdp-stats-strip">
              <div className="cdp-stat">
                <div className="cdp-stat-n">{units.length}</div>
                <div className="cdp-stat-l">Units</div>
              </div>
              <div className="cdp-stat">
                <div className="cdp-stat-n">{publishedUnits}</div>
                <div className="cdp-stat-l">Published</div>
              </div>
              <div className="cdp-stat">
                <div className="cdp-stat-n">{totalStudents}</div>
                <div className="cdp-stat-l">Students</div>
              </div>
            </div>
          </div>
        </div>

        {/* ════════════════════════════════════════════
            UNITS SECTION
        ════════════════════════════════════════════ */}
        <div className="cdp-units-section">
          <div className="cdp-section-hd">
            <div>
              <div className="cdp-section-title">
                Units
                {units.length > 0 && (
                  <span className="cdp-section-badge">{units.length}</span>
                )}
              </div>
              <div className="cdp-section-subtitle">
                {units.length === 0
                  ? "Organise your course into units — each unit is a chapter."
                  : "Click a title to rename · Drag or use arrows to reorder · Open to edit content"}
              </div>
            </div>
          </div>

          {/* Published-units progress bar */}
          {units.length > 1 && (
            <div className="cdp-overall-progress">
              <span className="cdp-prog-label">Published</span>
              <div className="cdp-prog-track">
                <div className="cdp-prog-fill" style={{ width: `${pubPct}%` }}/>
              </div>
              <span className="cdp-prog-pct">{publishedUnits}/{units.length}</span>
            </div>
          )}

          {/* Loading skeleton */}
          {loading && [...Array(4)].map((_,i) => <UnitSkel key={i} i={i}/>)}

          {/* Empty state */}
          {!loading && units.length === 0 && !creating && (
            <div className="cdp-empty">
              <div className="cdp-empty-orb">📦</div>
              <div className="cdp-empty-title">No units yet</div>
              <div className="cdp-empty-sub">
                Units are the chapters of your course. Each unit holds videos,
                slides, tasks and a test — built lesson by lesson.
              </div>
              <button
                className="cdp-empty-cta"
                onClick={() => { setCreating(true); setCreateTitle(""); }}
              >
                <Ico.Plus/> Create First Unit
              </button>
            </div>
          )}

          {/* Inline create row */}
          {creating && (
            <div className="cdp-create-row">
              <div style={{
                width:42, height:42, borderRadius:14, flexShrink:0,
                background:`linear-gradient(135deg,${T.violet},${T.pink})`,
                display:"flex", alignItems:"center", justifyContent:"center",
                fontFamily:T.dFont, fontSize:16, fontWeight:900, color:"white",
                boxShadow:`0 4px 12px rgba(108,53,222,.3)`,
              }}>
                {units.length + 1}
              </div>
              <input
                ref={createRef}
                className="cdp-create-input"
                value={createTitle}
                onChange={e => setCreateTitle(e.target.value)}
                placeholder="Unit title…"
                onKeyDown={e => {
                  if (e.key === "Enter") handleCreate();
                  if (e.key === "Escape") { setCreating(false); setCreateTitle(""); }
                }}
                disabled={createBusy}
              />
              <button
                className="cdp-create-save"
                onClick={handleCreate}
                disabled={createBusy || !createTitle.trim()}
              >
                {createBusy
                  ? <><div className="cdp-spinner" style={{ width:14, height:14, borderWidth:2 }}/> Saving…</>
                  : <><Ico.Check/> Add unit</>}
              </button>
              <button
                className="cdp-create-cancel"
                onClick={() => { setCreating(false); setCreateTitle(""); }}
                disabled={createBusy}
                title="Cancel"
              >×</button>
            </div>
          )}

          {/* Unit rows */}
          {units.map((unit, idx) => (
            <UnitRow
              key={unit.id}
              unit={unit}
              idx={idx}
              total={units.length}
              onOpen={uid => navigate(`/admin/units/${uid}`)}
              onEdit={uid => navigate(`/admin/units/${uid}/edit`)}
              onDelete={setToDelete}
              onMoveUp={() => swapUnits(idx, idx - 1)}
              onMoveDown={() => swapUnits(idx, idx + 1)}
              onRenameStart={handleRenameStart}
              onRenameDone={handleRenameDone}
              onRenameCancel={handleRenameCancel}
              renamingId={renamingId}
              renameVal={renameVal}
              setRenameVal={setRenameVal}
              renameSaving={renameSaving}
            />
          ))}

          {/* Add unit button */}
          {units.length > 0 && !creating && (
            <button
              className="cdp-add-btn"
              onClick={() => { setCreating(true); setCreateTitle(""); }}
            >
              <span className="cdp-add-btn-ico"><Ico.Plus/></span>
              Add unit
              <span style={{ marginLeft:"auto", fontSize:12, color:T.mutedL, fontWeight:600 }}>
                ↵ or click
              </span>
            </button>
          )}
        </div>

      </div>

      {/* Delete confirm modal */}
      {toDelete && (
        <DelModal
          unit={toDelete}
          busy={deleteBusy}
          onConfirm={handleDelete}
          onCancel={() => !deleteBusy && setToDelete(null)}
        />
      )}

      {/* Save toast */}
      {toastMsg && (
        <div className="cdp-toast">{toastMsg}</div>
      )}
    </>
  );
}
