/**
 * AdminUnitDetailPage.jsx  —  Unit content hub
 * URL: /admin/units/:unitId
 *
 * Five first-class content sections rendered as stacked cards:
 *   🎬 Videos  ·  🖼 Slides  ·  ✏️ Tasks  ·  📝 Test  ·  📚 Materials
 *
 * Design language: TeacherOnboarding.jsx
 *   – Gradient section headers (ls-section-hd pattern)
 *   – Task cards, question cards, material rows (ls-task-card / ls-mat-row)
 *   – gen-cta banner for Slides (empty state)
 *   – Shimmer loading skeleton
 *   – Save toast  ·  Hero header with orb decorations
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { unitsApi, testsApi } from "../../services/api";
import toast from "react-hot-toast";
import { CreateTaskMethodPicker } from "./CreateTaskMethodPicker.legacy";
import { AITaskGenerationWizard } from "./AITaskGenerationWizard.legacy";

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

/* ── Status config ───────────────────────────────────────────────────────── */
const STATUS_CFG = {
  published:{ label:"Published", bg:T.limeL,    color:T.green  },
  draft:    { label:"Draft",     bg:"#F1F5F9",   color:"#64748B"},
  scheduled:{ label:"Scheduled", bg:T.violetL,   color:T.violet },
  archived: { label:"Archived",  bg:"#F1F5F9",   color:"#94A3B8"},
};

const LEVEL_CLR = {
  A1:[T.tealL,T.teal], A2:[T.skyL,T.sky], B1:[T.limeL,T.lime],
  B2:[T.violetL,T.violet], C1:[T.amberL,T.amber], C2:[T.pinkL,T.pink],
  mixed:[T.orangeL,T.orange],
};

/* TaskType (top-level) */
const TASK_TYPE_CFG = {
  manual:    { label:"Manual",    emoji:"✍️",  bg:T.skyL,    color:T.sky    },
  auto:      { label:"Auto",      emoji:"🤖",  bg:T.violetL, color:T.violet },
  practice:  { label:"Practice",  emoji:"💪",  bg:T.tealL,   color:T.teal   },
  writing:   { label:"Writing",   emoji:"📝",  bg:T.skyL,    color:T.sky    },
  listening: { label:"Listening", emoji:"🎧",  bg:T.violetL, color:T.violet },
  reading:   { label:"Reading",   emoji:"📖",  bg:T.limeL,   color:T.lime   },
};
/* AutoTaskType (sub-type when type === "auto") */
const AUTO_TASK_TYPE_CFG = {
  single_choice:   { label:"Single Choice",   emoji:"🔘",  bg:T.violetL, color:T.violet },
  multiple_choice: { label:"Multiple Choice", emoji:"☑️",  bg:T.violetL, color:T.violet },
  matching:        { label:"Matching",        emoji:"🔗",  bg:T.pinkL,   color:T.pink   },
  ordering:        { label:"Ordering",        emoji:"🔢",  bg:T.orangeL, color:T.orange },
  gap_fill:        { label:"Gap Fill",        emoji:"🧩",  bg:T.amberL,  color:T.amber  },
  short_answer:    { label:"Short Answer",    emoji:"💬",  bg:T.limeL,   color:T.lime   },
  numeric:         { label:"Numeric",         emoji:"🔢",  bg:T.tealL,   color:T.teal   },
};
/* Resolve display config for a task */
const getTaskTypeCfg = t => {
  if (t.type === "auto" && t.auto_task_type)
    return AUTO_TASK_TYPE_CFG[t.auto_task_type] || TASK_TYPE_CFG.auto;
  return TASK_TYPE_CFG[t.type] || { label: t.type || "Task", emoji:"✏️", bg:T.amberL, color:T.amber };
};
/* Format due date */
const fmtDue = iso => {
  if (!iso) return null;
  const d = new Date(iso);
  const now = new Date();
  const diff = d - now;
  if (diff < 0) return { label:"Overdue", overdue:true };
  const days = Math.floor(diff / 86400000);
  if (days === 0) return { label:"Due today", soon:true };
  if (days === 1) return { label:"Due tomorrow", soon:true };
  return { label:`Due ${d.toLocaleDateString(undefined,{month:"short",day:"numeric"})}`, overdue:false, soon:false };
};

const FILE_EXT_CFG = {
  pdf:  { emoji:"📄", color:T.red,    bg:T.redL    },
  docx: { emoji:"📝", color:T.sky,    bg:T.skyL    },
  vtt:  { emoji:"🎬", color:T.violet, bg:T.violetL },
  srt:  { emoji:"🎬", color:T.violet, bg:T.violetL },
  pptx: { emoji:"📊", color:T.orange, bg:T.orangeL },
  mp4:  { emoji:"🎥", color:T.sky,    bg:T.skyL    },
};

/* ── Helpers ──────────────────────────────────────────────────────────────── */
const fmtDur = s => {
  if (!s) return null;
  return s >= 60 ? `${Math.floor(s/60)}m ${s%60}s` : `${s}s`;
};
const fmtSize = n => {
  if (!n) return null;
  const units = ["B","KB","MB","GB"];
  let i = 0; while (n >= 1024 && i < 3) { n /= 1024; i++; }
  return `${n < 10 ? n.toFixed(1) : Math.round(n)} ${units[i]}`;
};
const getExtCfg = fname => {
  const ext = (fname||"").split(".").pop()?.toLowerCase() || "";
  return FILE_EXT_CFG[ext] || { emoji:"📎", color:T.muted, bg:T.bg };
};
const stripHtml = h => {
  if (!h) return "";
  const d = document.createElement("div"); d.innerHTML = h;
  return d.textContent || "";
};

/* ════════════════════════════════════════════════════════════════════════════
   CSS
════════════════════════════════════════════════════════════════════════════ */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Nunito:wght@700;800;900&family=Inter:wght@400;500;600;700&display=swap');

@keyframes udp-fadeUp  { from{opacity:0;transform:translateY(18px)} to{opacity:1;transform:none} }
@keyframes udp-popIn   { from{opacity:0;transform:scale(.9)} to{opacity:1;transform:scale(1)} }
@keyframes udp-spin    { to{transform:rotate(360deg)} }
@keyframes udp-shimmer { 0%{background-position:-600px 0} 100%{background-position:600px 0} }
@keyframes udp-float   { 0%,100%{transform:translateY(0) rotate(0)} 50%{transform:translateY(-14px) rotate(5deg)} }
@keyframes udp-floatB  { 0%,100%{transform:translateY(0) rotate(0)} 50%{transform:translateY(-9px) rotate(-4deg)} }
@keyframes udp-drift   { 0%,100%{transform:translate(0,0)} 33%{transform:translate(12px,-8px)} 66%{transform:translate(-8px,10px)} }
@keyframes udp-rotSlow { from{transform:rotate(0)} to{transform:rotate(360deg)} }
@keyframes udp-pulse   { 0%,100%{transform:scale(1)} 50%{transform:scale(1.07)} }
@keyframes udp-saveFlash { 0%{opacity:0;transform:translateY(6px)} 12%{opacity:1;transform:none} 82%{opacity:1} 100%{opacity:0} }
@keyframes udp-rowIn   { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:none} }

.udp-root {
  min-height:100%; background:${T.bg};
  font-family:${T.bFont}; color:${T.text};
  padding-bottom:100px;
}
.udp-root *, .udp-root *::before, .udp-root *::after { box-sizing:border-box; margin:0; padding:0; }

/* ════════════════════════════════════════════════════
   HERO HEADER
════════════════════════════════════════════════════ */
.udp-hero {
  position:relative; overflow:hidden;
  padding:30px 40px 26px;
  animation:udp-fadeUp .38s both;
}
.udp-hero-ring {
  position:absolute; border-radius:50%;
  border:2px solid rgba(255,255,255,.07);
  top:50%; left:50%; transform:translate(-50%,-50%);
  pointer-events:none;
}
.udp-orb {
  position:absolute; border-radius:50%;
  opacity:.18; filter:blur(1px); pointer-events:none;
}
.udp-floater {
  position:absolute; pointer-events:none; user-select:none;
  filter:drop-shadow(0 3px 8px rgba(0,0,0,.2));
}

/* breadcrumb */
.udp-breadcrumb {
  display:flex; align-items:center; gap:6px;
  font-size:12px; font-weight:600;
  color:rgba(255,255,255,.5);
  margin-bottom:14px; position:relative; z-index:2;
  flex-wrap:wrap;
}
.udp-breadcrumb a {
  color:rgba(255,255,255,.62); text-decoration:none;
  cursor:pointer; transition:color .14s; border-radius:4px;
}
.udp-breadcrumb a:hover { color:white; }
.udp-bc-sep { color:rgba(255,255,255,.28); }

/* Hero inner */
.udp-hero-inner {
  position:relative; z-index:2;
  display:flex; align-items:flex-start;
  justify-content:space-between; gap:22px; flex-wrap:wrap;
}
.udp-unit-title {
  font-family:${T.dFont};
  font-size:clamp(20px,3vw,30px); font-weight:900;
  color:white; line-height:1.15; margin-bottom:8px;
  text-shadow:0 2px 12px rgba(0,0,0,.18);
}
.udp-meta-row {
  display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:14px;
}
.udp-hero-pill {
  display:inline-flex; align-items:center; gap:4px;
  font-size:11px; font-weight:800; padding:4px 12px;
  border-radius:999px; backdrop-filter:blur(4px);
  border:1.5px solid rgba(255,255,255,.25); letter-spacing:.04em;
}
.udp-hero-pill--ghost  { background:rgba(255,255,255,.16); color:rgba(255,255,255,.92); }
.udp-hero-pill--lime   { background:rgba(13,184,94,.28); color:rgba(255,255,255,.95); border-color:rgba(13,184,94,.5); }
.udp-hero-pill--amber  { background:rgba(245,166,35,.28); color:rgba(255,255,255,.95); border-color:rgba(245,166,35,.5); }

/* Hero buttons */
.udp-hero-btns { display:flex; gap:8px; flex-wrap:wrap; }
.udp-hbtn {
  display:inline-flex; align-items:center; gap:7px;
  padding:9px 18px; border-radius:12px;
  font-family:${T.dFont}; font-size:13px; font-weight:800;
  cursor:pointer; border:none; transition:all .17s; white-space:nowrap;
}
.udp-hbtn-white {
  background:white; color:${T.violet};
  box-shadow:0 4px 14px rgba(0,0,0,.16);
}
.udp-hbtn-white:hover { background:${T.violetL}; transform:translateY(-1px); box-shadow:0 8px 20px rgba(0,0,0,.2); }
.udp-hbtn-ghost {
  background:rgba(255,255,255,.14); color:white;
  border:1.5px solid rgba(255,255,255,.3);
}
.udp-hbtn-ghost:hover { background:rgba(255,255,255,.24); }
.udp-hbtn-icon {
  width:22px; height:22px; border-radius:7px;
  background:rgba(255,255,255,.18);
  display:flex; align-items:center; justify-content:center; flex-shrink:0;
}
.udp-hbtn-white .udp-hbtn-icon { background:${T.violetL}; }

/* Stats panel */
.udp-stats-panel {
  display:flex; gap:0;
  background:rgba(255,255,255,.10);
  border:1.5px solid rgba(255,255,255,.18);
  border-radius:14px; overflow:hidden;
  backdrop-filter:blur(6px); width:fit-content;
  flex-shrink:0; align-self:flex-start;
}
.udp-stat {
  padding:12px 20px; text-align:center;
  border-right:1.5px solid rgba(255,255,255,.14);
}
.udp-stat:last-child { border-right:none; }
.udp-stat-n { font-family:${T.dFont}; font-size:22px; font-weight:900; color:white; line-height:1; }
.udp-stat-l { font-size:10px; color:rgba(255,255,255,.5); text-transform:uppercase; letter-spacing:.08em; font-weight:600; margin-top:3px; }

/* ════════════════════════════════════════════════════
   CONTENT AREA
════════════════════════════════════════════════════ */
.udp-body { padding:24px 40px; }

/* ── Section card (matches ls-section pattern) ── */
.udp-section {
  background:white; border-radius:24px;
  border:2px solid ${T.border}; overflow:hidden;
  margin-bottom:20px;
  animation:udp-fadeUp .4s both;
  box-shadow:0 2px 10px rgba(108,53,222,.05);
}

/* Gradient header bar */
.udp-sec-hd {
  display:flex; align-items:center; gap:12px;
  padding:14px 22px; min-height:58px;
  position:relative; overflow:hidden;
}
/* subtle inner glow top-right */
.udp-sec-hd::after {
  content:''; position:absolute; top:-50px; right:-40px;
  width:140px; height:140px; border-radius:50%;
  background:rgba(255,255,255,.14); pointer-events:none;
}
.udp-sec-hd-icon {
  width:36px; height:36px; border-radius:12px;
  background:rgba(255,255,255,.24);
  display:flex; align-items:center; justify-content:center;
  font-size:18px; flex-shrink:0; position:relative; z-index:1;
  box-shadow:0 2px 8px rgba(0,0,0,.12);
}
.udp-sec-hd-title {
  font-family:${T.dFont}; font-size:16px; font-weight:900;
  color:#fff; flex:1; position:relative; z-index:1;
  letter-spacing:.01em;
}
.udp-sec-hd-count {
  padding:4px 12px; border-radius:999px; font-size:10px; font-weight:800;
  background:rgba(255,255,255,.24); color:rgba(255,255,255,.95);
  border:1.5px solid rgba(255,255,255,.32);
  white-space:nowrap; flex-shrink:0; position:relative; z-index:1;
  letter-spacing:.04em;
}
.udp-sec-hd-btn {
  display:inline-flex; align-items:center; gap:5px;
  padding:7px 15px; border-radius:10px; font-size:11.5px; font-weight:800;
  cursor:pointer; border:1.5px solid rgba(255,255,255,.38);
  background:rgba(255,255,255,.18); color:#fff;
  transition:all .16s; white-space:nowrap; flex-shrink:0;
  font-family:${T.dFont}; position:relative; z-index:1;
  letter-spacing:.01em;
}
.udp-sec-hd-btn:hover { background:rgba(255,255,255,.32); border-color:rgba(255,255,255,.75); transform:translateY(-1px); }
.udp-sec-hd-btn:disabled { opacity:.35; cursor:not-allowed; transform:none; }
.udp-sec-hd-btn--solid {
  background:#fff; color:${T.violet};
  border-color:transparent;
  box-shadow:0 3px 14px rgba(0,0,0,.16);
}
.udp-sec-hd-btn--solid:hover { transform:translateY(-1px); box-shadow:0 6px 20px rgba(0,0,0,.2); background:#fff; }

/* Section body */
.udp-sec-body { padding:20px 22px 24px; transition:max-height .3s ease-out, opacity .3s ease-out, padding .3s ease-out; overflow:hidden; }
.udp-sec-body--collapsed { max-height:0; padding:0 22px; opacity:0; }
.udp-sec-body--expanded { max-height:10000px; opacity:1; }

/* Toggle button in header */
.udp-sec-hd-toggle {
  display:inline-flex; align-items:center; justify-content:center;
  width:32px; height:32px; border-radius:8px;
  background:rgba(255,255,255,.18); color:#fff;
  border:1.5px solid rgba(255,255,255,.32);
  cursor:pointer; transition:all .16s; flex-shrink:0;
  position:relative; z-index:1;
  font-size:14px;
}
.udp-sec-hd-toggle:hover { background:rgba(255,255,255,.32); border-color:rgba(255,255,255,.75); transform:scale(1.05); }
.udp-sec-hd-toggle--collapsed { transform:rotate(-90deg); }
.udp-sec-hd-toggle--expanded { transform:rotate(0deg); }

/* Compact section empty */
.udp-sec-empty {
  display:flex; flex-direction:column; align-items:center;
  padding:36px 24px; text-align:center;
}
.udp-sec-empty-icon {
  width:64px; height:64px; border-radius:20px;
  background:linear-gradient(135deg,${T.violetL},${T.pinkL});
  display:flex; align-items:center; justify-content:center;
  font-size:30px; margin-bottom:14px;
  box-shadow:0 6px 20px rgba(108,53,222,.14);
}
.udp-sec-empty-title { font-family:${T.dFont}; font-size:16px; font-weight:900; color:${T.text}; margin-bottom:7px; }
.udp-sec-empty-sub   { font-size:12.5px; color:${T.sub}; line-height:1.75; max-width:320px; margin-bottom:20px; }

/* Section CTA button (inside empty) */
.udp-sec-cta {
  display:inline-flex; align-items:center; gap:7px;
  padding:10px 20px; border-radius:12px; border:none;
  font-family:${T.dFont}; font-size:13px; font-weight:900;
  cursor:pointer; transition:all .16s;
  box-shadow:0 4px 14px rgba(0,0,0,.12);
}
.udp-sec-cta:hover { transform:translateY(-2px); filter:brightness(1.06); box-shadow:0 8px 22px rgba(0,0,0,.18); }

/* ════════════════════════════════════════════════════
   VIDEOS SECTION
════════════════════════════════════════════════════ */

/* ── Video card (mirrors deck-card, sky/blue colour language) ── */
.udp-vid-card {
  border:2px solid ${T.border}; border-radius:20px;
  background:#fff; overflow:hidden;
  transition:all .22s cubic-bezier(.22,.68,0,1.2);
  margin-bottom:12px; animation:udp-rowIn .36s both;
  box-shadow:0 1px 5px rgba(0,153,230,.05);
}
.udp-vid-card:last-child { margin-bottom:0; }
.udp-vid-card:hover {
  border-color:rgba(0,153,230,.28);
  box-shadow:0 10px 30px rgba(0,153,230,.14);
  transform:translateY(-3px);
}

/* Banner: 16:9 ish area with real thumbnail or gradient fallback */
.udp-vid-banner {
  height:106px; position:relative; overflow:hidden;
  border-bottom:2px solid ${T.border};
  display:flex; align-items:center; justify-content:center;
  cursor:pointer;
}
.udp-vid-banner-img {
  position:absolute; inset:0; width:100%; height:100%;
  object-fit:cover;
}
.udp-vid-banner-grad {
  position:absolute; inset:0;
  background:linear-gradient(135deg,${T.sky},${T.violet});
  opacity:.16;
  transition:opacity .18s;
}
.udp-vid-card:hover .udp-vid-banner-grad { opacity:.28; }

/* Centre play icon (shown when no thumbnail image fills the frame) */
.udp-vid-play-icon {
  width:42px; height:42px; border-radius:50%; flex-shrink:0;
  background:rgba(255,255,255,.92); backdrop-filter:blur(4px);
  display:flex; align-items:center; justify-content:center;
  box-shadow:0 4px 18px rgba(0,0,0,.18); position:relative; z-index:1;
  transition:transform .18s, box-shadow .18s;
}
.udp-vid-card:hover .udp-vid-play-icon {
  transform:scale(1.1);
  box-shadow:0 6px 24px rgba(0,0,0,.22);
}

/* Source + duration badge row — top-left of banner */
.udp-vid-badges {
  position:absolute; top:9px; left:10px; z-index:2;
  display:flex; gap:5px;
}
.udp-vid-badge {
  display:inline-flex; align-items:center; gap:4px;
  padding:2px 9px; border-radius:999px;
  font-family:${T.dFont}; font-size:10px; font-weight:800;
  backdrop-filter:blur(8px);
}
.udp-vid-badge--yt   { background:rgba(255,0,0,.82);    color:#fff; }
.udp-vid-badge--vim  { background:rgba(26,183,234,.85);  color:#fff; }
.udp-vid-badge--file { background:rgba(108,53,222,.82);  color:#fff; }
.udp-vid-badge--url  { background:rgba(15,23,42,.72);    color:rgba(255,255,255,.92); }
.udp-vid-badge--dur  {
  background:rgba(15,23,42,.62); color:rgba(255,255,255,.92);
  position:absolute; right:10px; top:9px; z-index:2;
}

/* Watch hover overlay on banner */
.udp-vid-watch-overlay {
  position:absolute; inset:0; z-index:3;
  background:rgba(0,153,230,.78);
  display:flex; align-items:center; justify-content:center;
  flex-direction:column; gap:5px;
  opacity:0; transition:opacity .17s;
}
.udp-vid-card:hover .udp-vid-watch-overlay { opacity:1; }
.udp-vid-watch-lbl {
  font-family:${T.dFont}; font-size:13px; font-weight:900; color:#fff;
  display:flex; align-items:center; gap:6px;
}

/* Info row below banner */
.udp-vid-info {
  padding:11px 14px; display:flex; align-items:center; gap:10px;
}
.udp-vid-text { flex:1; min-width:0; }
.udp-vid-title {
  font-family:${T.dFont}; font-size:14px; font-weight:900;
  color:${T.text}; white-space:nowrap; overflow:hidden;
  text-overflow:ellipsis; margin-bottom:2px;
}
.udp-vid-meta {
  font-size:11px; color:${T.muted}; display:flex; gap:8px;
  flex-wrap:wrap; align-items:center;
}
.udp-vid-actions { display:flex; gap:4px; flex-shrink:0; }

/* "Add another video" dashed row — same as udp-add-deck */
.udp-add-vid {
  display:flex; align-items:center; gap:12px;
  padding:14px 18px; border-radius:16px;
  border:2px dashed ${T.border}; background:#fff;
  color:${T.muted}; cursor:pointer;
  font-family:${T.dFont}; font-size:13px; font-weight:800;
  transition:all .2s; width:100%; text-align:left; margin-top:4px;
}
.udp-add-vid:hover {
  border-color:${T.sky}; color:${T.sky}; background:${T.skyL};
  transform:translateY(-1px);
}
.udp-add-vid-ico {
  width:32px; height:32px; border-radius:10px;
  background:${T.skyL}; color:${T.sky};
  display:flex; align-items:center; justify-content:center;
  flex-shrink:0; transition:all .18s;
}
.udp-add-vid:hover .udp-add-vid-ico { background:${T.sky}; color:#fff; transform:rotate(90deg); }

/* ════════════════════════════════════════════════════
   SLIDES SECTION
════════════════════════════════════════════════════ */

/* AI-generate CTA banner */
.udp-slides-cta {
  border-radius:20px; padding:22px 24px;
  display:flex; align-items:center; gap:20px;
  background:linear-gradient(135deg,${T.violet} 0%,${T.pink} 100%);
  box-shadow:0 10px 32px rgba(108,53,222,.3);
  margin-bottom:16px; position:relative; overflow:hidden;
}
.udp-slides-cta::before {
  content:''; position:absolute; top:-40px; right:-30px;
  width:160px; height:160px; border-radius:50%;
  background:rgba(255,255,255,.08); pointer-events:none;
}
.udp-slides-cta-icon {
  width:54px; height:54px; border-radius:17px;
  background:rgba(255,255,255,.2);
  display:flex; align-items:center; justify-content:center;
  font-size:27px; flex-shrink:0;
  box-shadow:0 4px 16px rgba(0,0,0,.14);
}
.udp-slides-cta-title { font-family:${T.dFont}; font-size:18px; font-weight:900; color:#fff; margin-bottom:5px; }
.udp-slides-cta-sub   { font-size:12.5px; color:rgba(255,255,255,.78); line-height:1.65; max-width:400px; }
.udp-slides-cta-btn {
  display:inline-flex; align-items:center; gap:8px;
  padding:12px 22px; border-radius:14px; border:none; cursor:pointer;
  background:white; color:${T.violet}; font-family:${T.dFont};
  font-size:14px; font-weight:900;
  box-shadow:0 4px 18px rgba(0,0,0,.2);
  transition:all .2s cubic-bezier(.22,.68,0,1.2); white-space:nowrap; flex-shrink:0;
}
.udp-slides-cta-btn:hover { transform:translateY(-2px) scale(1.03); box-shadow:0 10px 28px rgba(0,0,0,.24); }

/* ── Deck card (one per Presentation) ── */
.udp-deck-card {
  border:2px solid ${T.border}; border-radius:20px;
  background:#fff; overflow:hidden;
  transition:all .22s cubic-bezier(.22,.68,0,1.2);
  margin-bottom:12px; animation:udp-rowIn .36s both;
  box-shadow:0 1px 5px rgba(108,53,222,.05);
}
.udp-deck-card:last-child { margin-bottom:0; }
.udp-deck-card:hover {
  border-color:rgba(108,53,222,.28);
  box-shadow:0 10px 30px rgba(108,53,222,.14);
  transform:translateY(-3px);
}

/* Deck banner: mini slide grid preview */
.udp-deck-banner {
  height:100px; background:linear-gradient(135deg,${T.violetL},${T.pinkL});
  border-bottom:2px solid ${T.border};
  position:relative; overflow:hidden;
  display:flex; align-items:center; justify-content:center; gap:8px;
  padding:0 18px;
  cursor:pointer;
}
.udp-deck-banner::after {
  content:''; position:absolute; inset:0;
  background:rgba(108,53,222,.0);
  transition:background .18s;
}
.udp-deck-card:hover .udp-deck-banner::after {
  background:rgba(108,53,222,.06);
}
.udp-deck-mini {
  width:58px; height:40px; border-radius:8px;
  background:#fff; border:1.5px solid ${T.border};
  position:relative; overflow:hidden; flex-shrink:0;
  transition:transform .2s;
  box-shadow:0 2px 8px rgba(0,0,0,.08);
}
.udp-deck-card:hover .udp-deck-mini { transform:translateY(-2px) rotate(-1deg); }
.udp-deck-card:hover .udp-deck-mini:nth-child(2) { transform:translateY(0px) rotate(1deg); }
.udp-deck-mini-line {
  height:5px; border-radius:3px; background:${T.border};
  margin:5px 6px 0;
}
.udp-deck-mini-line:nth-child(1) { width:55%; }
.udp-deck-mini-line:nth-child(2) { width:75%; }
.udp-deck-mini-line:nth-child(3) { width:40%; }
.udp-deck-mini img {
  position:absolute; inset:0; width:100%; height:100%;
  object-fit:cover; opacity:.7;
}

/* Deck count badge (top-left of banner) */
.udp-deck-count-badge {
  position:absolute; top:10px; left:12px; z-index:2;
  background:rgba(108,53,222,.82); color:#fff;
  font-family:${T.dFont}; font-size:10px; font-weight:900;
  padding:2px 9px; border-radius:999px;
  border:1.5px solid rgba(255,255,255,.28);
}

/* Deck edit overlay on banner hover */
.udp-deck-open-overlay {
  position:absolute; inset:0; z-index:3;
  background:rgba(108,53,222,.78);
  display:flex; align-items:center; justify-content:center;
  flex-direction:column; gap:5px;
  opacity:0; transition:opacity .17s; cursor:pointer;
}
.udp-deck-card:hover .udp-deck-open-overlay { opacity:1; }
.udp-deck-open-lbl {
  font-family:${T.dFont}; font-size:13px; font-weight:900; color:#fff;
  display:flex; align-items:center; gap:6px;
}

/* Deck info row (below banner) */
.udp-deck-info {
  padding:12px 16px; display:flex; align-items:center; gap:12px;
}
.udp-deck-title {
  flex:1; min-width:0;
  font-family:${T.dFont}; font-size:14px; font-weight:900;
  color:${T.text}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
}
.udp-deck-meta {
  font-size:11px; color:${T.muted}; margin-top:2px;
  display:flex; gap:8px; align-items:center; flex-wrap:wrap;
}
.udp-deck-actions {
  display:flex; gap:4px; flex-shrink:0;
}

/* Publish toggle */
.udp-pub-toggle {
  display:inline-flex; align-items:center; gap:5px;
  padding:5px 12px; border-radius:10px; cursor:pointer;
  font-family:${T.dFont}; font-size:11px; font-weight:800;
  border:1.5px solid; transition:all .16s; white-space:nowrap; flex-shrink:0;
}
.udp-pub-toggle--pub {
  background:${T.limeL}; color:${T.green}; border-color:rgba(22,163,74,.28);
}
.udp-pub-toggle--pub:hover {
  background:#FEE2E2; color:#EF4444; border-color:rgba(239,68,68,.28);
}
.udp-pub-toggle--draft {
  background:${T.bg}; color:${T.muted}; border-color:${T.border};
}
.udp-pub-toggle--draft:hover {
  background:${T.limeL}; color:${T.green}; border-color:rgba(22,163,74,.28);
}

/* "Add deck" dashed row */
.udp-add-deck {
  display:flex; align-items:center; gap:12px;
  padding:14px 18px; border-radius:16px;
  border:2px dashed ${T.border}; background:#fff;
  color:${T.muted}; cursor:pointer;
  font-family:${T.dFont}; font-size:13px; font-weight:800;
  transition:all .2s; width:100%; text-align:left; margin-top:4px;
}
.udp-add-deck:hover {
  border-color:${T.violet}; color:${T.violet}; background:${T.violetL};
  transform:translateY(-1px);
}
.udp-add-deck-ico {
  width:32px; height:32px; border-radius:10px;
  background:${T.violetL}; color:${T.violet};
  display:flex; align-items:center; justify-content:center;
  flex-shrink:0; transition:all .18s;
}
.udp-add-deck:hover .udp-add-deck-ico { background:${T.violet}; color:#fff; transform:rotate(90deg); }

/* Slide thumbnail grid (inside deck card expand) */
.udp-deck-slides-grid {
  display:grid;
  grid-template-columns:repeat(auto-fill,minmax(140px,1fr));
  gap:8px; padding:0 16px 14px;
}
.udp-slide-mini-card {
  border:2px solid ${T.border}; border-radius:11px; overflow:hidden;
  display:flex; flex-direction:column;
  transition:all .16s; cursor:pointer; animation:udp-rowIn .3s both;
}
.udp-slide-mini-card:hover {
  border-color:${T.violet}55; transform:translateY(-2px);
  box-shadow:0 4px 12px rgba(108,53,222,.12);
}
.udp-slide-mini-thumb {
  height:72px; background:${T.bg};
  border-bottom:2px solid ${T.border};
  padding:8px 10px; position:relative; overflow:hidden;
}
.udp-slide-mini-thumb img {
  position:absolute; inset:0; width:100%; height:100%; object-fit:cover; opacity:.6;
}
.udp-slide-mini-num {
  position:absolute; top:5px; right:7px;
  font-family:${T.dFont}; font-size:9px; font-weight:800; color:${T.mutedL};
}
.udp-slide-mini-line { height:5px; border-radius:3px; background:${T.border}; margin-bottom:4px; }
.udp-slide-mini-foot {
  padding:5px 8px; background:#fff;
  font-size:10px; font-weight:700; color:${T.sub};
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
}

/* ════════════════════════════════════════════════════
   TASKS SECTION
════════════════════════════════════════════════════ */

/* Task card — full card matching VideoCard / DeckCard pattern */
.udp-task-card {
  border:2px solid ${T.border}; border-radius:20px;
  background:#fff; overflow:hidden;
  transition:all .22s cubic-bezier(.22,.68,0,1.2);
  margin-bottom:12px; animation:udp-rowIn .36s both;
  cursor:pointer;
  box-shadow:0 1px 5px rgba(245,166,35,.05);
}
.udp-task-card:last-child { margin-bottom:0; }
.udp-task-card:hover {
  border-color:rgba(245,166,35,.36);
  box-shadow:0 10px 30px rgba(245,166,35,.15);
  transform:translateY(-3px);
}

/* Coloured accent header (short gradient band) */
.udp-task-banner {
  height:5px; width:100%; flex-shrink:0;
}

/* Main content row */
.udp-task-content {
  display:flex; align-items:flex-start; gap:14px;
  padding:15px 18px 12px;
}
.udp-task-icon {
  width:46px; height:46px; border-radius:14px; flex-shrink:0;
  display:flex; align-items:center; justify-content:center;
  font-size:22px;
}
.udp-task-body { flex:1; min-width:0; }
.udp-task-title {
  font-family:${T.dFont}; font-size:14px; font-weight:900; color:${T.text};
  margin-bottom:5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
}
.udp-task-chips { display:flex; gap:5px; flex-wrap:wrap; align-items:center; }
.udp-task-chip {
  display:inline-flex; align-items:center; gap:3px;
  font-size:10px; font-weight:800; padding:2px 8px;
  border-radius:999px; white-space:nowrap;
}
.udp-task-chip--type  { }  /* colour set inline */
.udp-task-chip--score { background:${T.amberL}; color:${T.amber}; }
.udp-task-chip--due   { background:${T.skyL}; color:${T.sky}; }
.udp-task-chip--over  { background:${T.redL}; color:${T.red}; }
.udp-task-chip--soon  { background:${T.amberL}; color:${T.amber}; }

/* Footer bar: stats + actions */
.udp-task-footer {
  display:flex; align-items:center; gap:8px;
  padding:8px 16px 12px; border-top:1.5px solid ${T.border};
  margin-top:0;
}
.udp-task-stats { flex:1; display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
.udp-task-stat  { font-size:10px; font-weight:700; color:${T.muted}; display:flex; align-items:center; gap:3px; }
.udp-task-stat--warn { color:${T.orange}; }
.udp-task-actions { display:flex; gap:4px; flex-shrink:0; }

/* "Add another task" dashed row */
.udp-add-task {
  display:flex; align-items:center; gap:12px;
  padding:14px 18px; border-radius:16px;
  border:2px dashed ${T.border}; background:#fff;
  color:${T.muted}; cursor:pointer;
  font-family:${T.dFont}; font-size:13px; font-weight:800;
  transition:all .2s; width:100%; text-align:left; margin-top:4px;
}
.udp-add-task:hover {
  border-color:${T.amber}; color:${T.amber}; background:${T.amberL};
  transform:translateY(-1px);
}
.udp-add-task-ico {
  width:32px; height:32px; border-radius:10px;
  background:${T.amberL}; color:${T.amber};
  display:flex; align-items:center; justify-content:center;
  flex-shrink:0; transition:all .18s;
}
.udp-add-task:hover .udp-add-task-ico { background:${T.amber}; color:#fff; transform:rotate(90deg); }

/* ════════════════════════════════════════════════════
   TEST SECTION
════════════════════════════════════════════════════ */

/* Test card — prominent, since unit typically has 1 */
.udp-test-card {
  border:2px solid ${T.border}; border-radius:20px;
  background:#fff; overflow:hidden;
  transition:all .22s cubic-bezier(.22,.68,0,1.2);
  margin-bottom:12px; animation:udp-rowIn .36s both;
  box-shadow:0 1px 5px rgba(13,184,94,.05);
}
.udp-test-card:last-child { margin-bottom:0; }
.udp-test-card:hover {
  border-color:rgba(13,184,94,.3);
  box-shadow:0 10px 32px rgba(13,184,94,.14);
  transform:translateY(-3px);
}

/* Banner strip */
.udp-test-banner {
  height:82px; position:relative; overflow:hidden;
  border-bottom:2px solid ${T.border};
  display:flex; align-items:center; gap:18px;
  padding:0 22px; cursor:pointer;
  background:linear-gradient(135deg,${T.limeL},${T.tealL});
}
.udp-test-card:hover .udp-test-banner { background:linear-gradient(135deg,${T.lime}22,${T.teal}22); }
.udp-test-banner-icon {
  width:52px; height:52px; border-radius:17px; flex-shrink:0;
  background:linear-gradient(135deg,${T.lime},${T.teal});
  display:flex; align-items:center; justify-content:center;
  font-size:24px;
  box-shadow:0 6px 18px rgba(13,184,94,.3);
  transition:transform .2s;
}
.udp-test-card:hover .udp-test-banner-icon { transform:scale(1.06) rotate(-3deg); }
.udp-test-banner-title {
  font-family:${T.dFont}; font-size:17px; font-weight:900; color:${T.text};
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
  flex:1; min-width:0;
}
.udp-test-banner-desc {
  font-size:12px; color:${T.sub}; margin-top:3px;
  display:-webkit-box; -webkit-line-clamp:1; -webkit-box-orient:vertical; overflow:hidden;
}

/* Open-on-hover overlay for test banner */
.udp-test-banner-overlay {
  position:absolute; inset:0;
  background:rgba(13,184,94,.78);
  display:flex; align-items:center; justify-content:center; gap:8px;
  opacity:0; transition:opacity .17s; cursor:pointer;
  font-family:${T.dFont}; font-size:13px; font-weight:900; color:#fff;
}
.udp-test-card:hover .udp-test-banner-overlay { opacity:1; }

/* Stats pill row */
.udp-test-stats-row {
  display:flex; gap:6px; padding:10px 16px; flex-wrap:wrap;
  border-bottom:1.5px solid ${T.border};
}
.udp-test-stat-pill {
  display:inline-flex; align-items:center; gap:5px;
  padding:4px 11px; border-radius:999px;
  font-family:${T.dFont}; font-size:11px; font-weight:800;
  border:1.5px solid;
}
.udp-test-stat-pill--time   { background:${T.skyL};   color:${T.sky};   border-color:rgba(0,153,230,.2); }
.udp-test-stat-pill--pass   { background:${T.limeL};  color:${T.green}; border-color:rgba(22,163,74,.2); }
.udp-test-stat-pill--q      { background:${T.violetL};color:${T.violet};border-color:rgba(108,53,222,.2); }
.udp-test-stat-pill--atts   { background:${T.amberL}; color:${T.amber}; border-color:rgba(245,166,35,.2); }

/* Test footer: actions */
.udp-test-footer {
  display:flex; align-items:center; gap:8px;
  padding:10px 14px;
}
.udp-test-action-btn {
  display:inline-flex; align-items:center; gap:5px;
  padding:7px 14px; border-radius:11px; cursor:pointer;
  font-family:${T.dFont}; font-size:12px; font-weight:800;
  border:1.5px solid; transition:all .16s; white-space:nowrap;
}
.udp-test-action-btn--open {
  background:linear-gradient(135deg,${T.lime},${T.teal}); color:#fff;
  border-color:transparent;
  box-shadow:0 3px 12px rgba(13,184,94,.28);
}
.udp-test-action-btn--open:hover { filter:brightness(1.08); transform:translateY(-1px); }
.udp-test-action-btn--ghost {
  background:#fff; color:${T.sub}; border-color:${T.border};
}
.udp-test-action-btn--ghost:hover {
  background:${T.bg}; border-color:${T.violet}55; color:${T.violet};
}
.udp-test-action-btn--results {
  background:#fff; color:${T.violet}; border-color:rgba(108,53,222,.28);
}
.udp-test-action-btn--results:hover { background:${T.violetL}; }

/* "Add test" dashed row */
.udp-add-test {
  display:flex; align-items:center; gap:12px;
  padding:14px 18px; border-radius:16px;
  border:2px dashed ${T.border}; background:#fff;
  color:${T.muted}; cursor:pointer;
  font-family:${T.dFont}; font-size:13px; font-weight:800;
  transition:all .2s; width:100%; text-align:left; margin-top:4px;
}
.udp-add-test:hover {
  border-color:${T.lime}; color:${T.green}; background:${T.limeL};
  transform:translateY(-1px);
}
.udp-add-test-ico {
  width:32px; height:32px; border-radius:10px;
  background:${T.limeL}; color:${T.green};
  display:flex; align-items:center; justify-content:center;
  flex-shrink:0; transition:all .18s;
}
.udp-add-test:hover .udp-add-test-ico { background:${T.lime}; color:#fff; transform:rotate(90deg); }

/* ════════════════════════════════════════════════════
   MATERIALS SECTION
════════════════════════════════════════════════════ */
/* Upload zone */
.udp-upload-zone {
  border:2.5px dashed ${T.border}; border-radius:18px;
  padding:28px 24px; text-align:center; cursor:pointer;
  transition:all .22s cubic-bezier(.22,.68,0,1.2); background:${T.bg};
  margin-bottom:16px; position:relative; overflow:hidden;
}
.udp-upload-zone::before {
  content:'';
  position:absolute; inset:0;
  background:radial-gradient(ellipse at center, ${T.tealL}50 0%, transparent 70%);
  opacity:0; transition:opacity .22s; pointer-events:none;
}
.udp-upload-zone:hover::before, .udp-upload-zone.drag::before { opacity:1; }
.udp-upload-zone:hover, .udp-upload-zone.drag {
  border-color:${T.teal}; background:${T.tealL};
  transform:scale(1.015);
  box-shadow:0 8px 28px rgba(0,188,212,.14);
}
.udp-upload-zone-icon { font-size:38px; margin-bottom:12px; position:relative; }
.udp-upload-zone-title { font-family:${T.dFont}; font-size:15px; font-weight:900; color:${T.text}; margin-bottom:5px; position:relative; }
.udp-upload-zone-sub   { font-size:12px; color:${T.muted}; line-height:1.7; position:relative; }

/* File row */
.udp-mat-row {
  display:flex; align-items:center; gap:14px;
  padding:12px 16px; border:2px solid ${T.border};
  border-radius:16px; background:#fff;
  transition:all .18s cubic-bezier(.22,.68,0,1.2);
  margin-bottom:8px; animation:udp-rowIn .34s both;
}
.udp-mat-row:last-child { margin-bottom:0; }
.udp-mat-row:hover {
  border-color:${T.teal}44;
  box-shadow:0 5px 16px rgba(0,188,212,.1);
  transform:translateY(-1px);
}
.udp-mat-icon {
  width:42px; height:42px; border-radius:13px;
  display:flex; align-items:center; justify-content:center;
  font-size:19px; flex-shrink:0;
  box-shadow:0 2px 8px rgba(0,0,0,.08);
}
.udp-mat-info { flex:1; min-width:0; }
.udp-mat-name { font-size:13px; font-weight:700; color:${T.text}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-bottom:3px; }
.udp-mat-meta { font-size:11px; color:${T.muted}; display:flex; gap:10px; flex-wrap:wrap; align-items:center; }
.udp-mat-indexed { font-size:10px; font-weight:800; padding:2px 9px; border-radius:999px; }
.udp-mat-indexed--yes { background:${T.limeL}; color:${T.green}; border:1.5px solid rgba(22,163,74,.2); }
.udp-mat-indexed--no  { background:${T.bg};    color:${T.muted}; border:1.5px solid ${T.border}; }
.udp-mat-actions { display:flex; gap:4px; flex-shrink:0; opacity:0; transition:opacity .14s; }
.udp-mat-row:hover .udp-mat-actions { opacity:1; }

/* Info note */
.udp-mat-note {
  display:flex; align-items:flex-start; gap:8px;
  padding:10px 14px; border-radius:11px;
  background:${T.amberL}; border:1.5px solid rgba(245,166,35,.3);
  font-size:11px; color:${T.sub}; line-height:1.6;
  margin-top:14px;
}

/* ════════════════════════════════════════════════════
   SHARED
════════════════════════════════════════════════════ */
/* icon button */
.udp-ico-btn {
  width:30px; height:30px; border-radius:9px;
  border:1.5px solid ${T.border}; background:white;
  color:${T.sub}; display:flex; align-items:center;
  justify-content:center; cursor:pointer; transition:all .14s;
  flex-shrink:0;
}
.udp-ico-btn:hover         { background:${T.violetL}; border-color:${T.violet}; color:${T.violet}; }
.udp-ico-btn.open:hover    { background:${T.skyL}; border-color:${T.sky}; color:${T.sky}; }
.udp-ico-btn.del:hover     { background:${T.redL}; border-color:${T.red}; color:${T.red}; }
.udp-ico-btn.dl:hover      { background:${T.limeL}; border-color:${T.lime}; color:${T.lime}; }
.udp-ico-btn:disabled      { opacity:.35; cursor:wait; }

/* status badge (reusable) */
.udp-status-chip {
  font-size:10px; font-weight:800; padding:2px 9px;
  border-radius:999px; white-space:nowrap; flex-shrink:0;
}

/* Loading skeleton */
.udp-skel-sec {
  background:white; border:2px solid ${T.border}; border-radius:22px;
  overflow:hidden; margin-bottom:16px;
}
.udp-skel-hd  { height:54px; }
.udp-skel-body { padding:20px 22px; }
.udp-skel-line {
  border-radius:8px; margin-bottom:10px;
  background:linear-gradient(90deg,${T.violetL} 25%,#f0ecff 50%,${T.violetL} 75%);
  background-size:600px 100%;
  animation:udp-shimmer 1.6s infinite linear;
}

/* Spinner */
.udp-spinner {
  width:22px; height:22px;
  border:3px solid ${T.border}; border-top-color:${T.teal};
  border-radius:50%; animation:udp-spin .8s linear infinite;
  flex-shrink:0;
}
.udp-spinner-sm {
  width:14px; height:14px; border-width:2px;
  border-color:${T.border}; border-top-color:currentColor;
}

/* Center  */
.udp-center {
  display:flex; align-items:center; justify-content:center;
  height:50vh; gap:12px; color:${T.muted}; font-size:15px;
}

/* Save toast */
.udp-toast {
  position:fixed; bottom:24px; right:24px; z-index:9999;
  background:#1A1035; color:white;
  padding:10px 18px; border-radius:12px;
  font-size:13px; font-weight:700;
  display:flex; align-items:center; gap:8px;
  animation:udp-saveFlash 2.4s ease both;
  pointer-events:none; box-shadow:0 8px 24px rgba(0,0,0,.25);
}

.udp-root::-webkit-scrollbar { width:4px; }
.udp-root::-webkit-scrollbar-track { background:transparent; }
.udp-root::-webkit-scrollbar-thumb { background:${T.border}; border-radius:999px; }
`;

/* ── Icons ───────────────────────────────────────────────────────────────── */
const Ico = {
  Back:   ()=><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 2L4 7l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  Plus:   ()=><svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>,
  Pencil: ()=><svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M11 2l3 3L6 13H3v-3L11 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg>,
  Open:   ()=><svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M9 3h4v4M13 3l-7 7M3 5H2a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  Trash:  ()=><svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M2 4h12M5 4V2.5h6V4M5 4l.5 9h5L11 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  Dl:     ()=><svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M8 2v8M5 7l3 3 3-3M3 13h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  Upload: ()=><svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M8 11V3M5 6l3-3 3 3M3 13h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  Spark:  ()=><svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M8 1l1.5 4.5H14L10.5 8 12 12.5 8 10l-4 2.5 1.5-4.5L2 5.5h4.5L8 1Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg>,
  Eye:    ()=><svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M1 8c0-3.866 3.134-7 7-7s7 3.134 7 7-3.134 7-7 7-7-3.134-7-7Z" stroke="currentColor" strokeWidth="1.4"/><circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.4"/></svg>,
  Play:   ()=><svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M3 2l9 5-9 5V2Z" fill="currentColor"/></svg>,
  Clock:  ()=><svg width="11" height="11" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.4"/><path d="M7 4v3.5l2 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>,
  Chart:  ()=><svg width="11" height="11" viewBox="0 0 14 14" fill="none"><rect x="1" y="8" width="3" height="5" rx="1" stroke="currentColor" strokeWidth="1.4"/><rect x="5.5" y="5" width="3" height="8" rx="1" stroke="currentColor" strokeWidth="1.4"/><rect x="10" y="2" width="3" height="11" rx="1" stroke="currentColor" strokeWidth="1.4"/></svg>,
  Warn:   ()=><svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M8 2L1 14h14L8 2Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/><path d="M8 7v3M8 12v.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>,
};

/* ── Shimmer skel section ────────────────────────────────────────────────── */
const SkelSection = ({ gradClr, i }) => (
  <div className="udp-skel-sec" style={{ animationDelay: `${i*.08}s` }}>
    <div className="udp-skel-hd" style={{ background: gradClr }} />
    <div className="udp-skel-body">
      {[80, 65, 72].map((w, j) => (
        <div key={j} className="udp-skel-line" style={{ height: 14, width: `${w}%`, animationDelay: `${i*.08+j*.04}s` }} />
      ))}
    </div>
  </div>
);

/* ── Auth header helper (shared across all API calls in this file) ── */
const authH = () => {
  const t = localStorage.getItem("token");
  return t
    ? { Authorization: `Bearer ${t}`, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" };
};

/* ── YouTube video-id extractor ─────────────────────────────────────────── */
const extractYtId = url => {
  if (!url) return null;
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
};

/* ── Thumbnail URL for a video object ─────────────────────────────────────── */
const vidThumbUrl = v => {
  // 1. Static server thumbnail
  if (v.thumbnail_path) {
    const base = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE_URL)
      || "/api/v1";
    return `${base}/static/${v.thumbnail_path}`;
  }
  // 2. YouTube auto-thumb from external_url
  const ytId = extractYtId(v.external_url || "");
  if (ytId) return `https://img.youtube.com/vi/${ytId}/mqdefault.jpg`;
  return null;
};

/* ── Source badge config ─────────────────────────────────────────────────── */
const srcBadge = v => {
  const ytId = extractYtId(v.external_url || "");
  if (ytId)                           return { cls:"udp-vid-badge--yt",   label:"▶ YouTube" };
  if (/vimeo/i.test(v.external_url||"")) return { cls:"udp-vid-badge--vim",  label:"▶ Vimeo"   };
  if (v.source_type === "url")        return { cls:"udp-vid-badge--url",  label:"🔗 URL"     };
  return                                     { cls:"udp-vid-badge--file", label:"📁 File"    };
};

/* ── Open/watch URL ─────────────────────────────────────────────────────── */
const vidOpenUrl = v => {
  if (v.external_url) return v.external_url;
  const base = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE_URL) || "/api/v1";
  return `${base}/videos/${v.id}/stream`;
};

/* ── VideoCard ───────────────────────────────────────────────────────────── */
const VideoCard = ({ video: v, unitId, onDelete, onTogglePublish, navigate, style }) => {
  const [toggling, setToggling] = useState(false);
  const [imgErr,   setImgErr]   = useState(false);

  const isPublished = v.status === "published";
  const st   = STATUS_CFG[v.status] || STATUS_CFG.draft;
  const dur  = fmtDur(v.duration_sec);
  const src  = srcBadge(v);
  const thumb = imgErr ? null : vidThumbUrl(v);
  const openUrl = vidOpenUrl(v);

  const handleWatch = e => {
    e.stopPropagation();
    window.open(openUrl, "_blank", "noopener,noreferrer");
  };

  const handleToggle = async e => {
    e.stopPropagation();
    setToggling(true);
    await onTogglePublish(v, isPublished);
    setToggling(false);
  };

  return (
    <div className="udp-vid-card" style={style}>
      {/* ── Banner ── */}
      <div className="udp-vid-banner">
        {/* Background gradient always present */}
        <div className="udp-vid-banner-grad" />

        {/* Real thumbnail */}
        {thumb && (
          <img
            className="udp-vid-banner-img"
            src={thumb}
            alt=""
            onError={() => setImgErr(true)}
          />
        )}

        {/* Source badge */}
        <div className="udp-vid-badges">
          <span className={`udp-vid-badge ${src.cls}`}>{src.label}</span>
        </div>

        {/* Duration badge */}
        {dur && <span className="udp-vid-badge udp-vid-badge--dur"><Ico.Clock />{dur}</span>}

        {/* Centre play */}
        <div className="udp-vid-play-icon" style={{ color: T.sky }}>
          <Ico.Play />
        </div>

        {/* Watch hover overlay */}
        <div className="udp-vid-watch-overlay" onClick={handleWatch}>
          <div className="udp-vid-watch-lbl">
            <Ico.Play /> Watch video
          </div>
        </div>
      </div>

      {/* ── Info row ── */}
      <div className="udp-vid-info">
        <div className="udp-vid-text">
          <div className="udp-vid-title">{v.title}</div>
          <div className="udp-vid-meta">
            <span>#{v.order_index ?? 0}</span>
            {v.view_count > 0 && <span><Ico.Chart /> {v.view_count} views</span>}
          </div>
        </div>

        <div className="udp-vid-actions">
          {/* Publish toggle */}
          <button
            className={`udp-pub-toggle ${isPublished ? "udp-pub-toggle--pub" : "udp-pub-toggle--draft"}`}
            onClick={handleToggle}
            disabled={toggling}
            title={isPublished ? "Click to unpublish" : "Click to publish"}
          >
            {toggling
              ? <div className="udp-spinner udp-spinner-sm" style={{ borderTopColor:"currentColor", borderColor:"currentColor22" }} />
              : isPublished ? "✓ Published" : "Draft"}
          </button>

          {/* Watch */}
          <button
            className="udp-ico-btn open"
            title="Watch video"
            onClick={handleWatch}
          >
            <Ico.Play />
          </button>

          {/* Edit */}
          <button
            className="udp-ico-btn"
            title="Edit video"
            onClick={e => { e.stopPropagation(); navigate(`/admin/videos/${v.id}/edit`); }}
          >
            <Ico.Pencil />
          </button>

          {/* Delete */}
          <button
            className="udp-ico-btn del"
            title="Delete video"
            onClick={e => { e.stopPropagation(); onDelete(v); }}
          >
            <Ico.Trash />
          </button>
        </div>
      </div>
    </div>
  );
};

/* ── Delete video modal ─────────────────────────────────────────────────── */
const DeleteVideoModal = ({ video, busy, onConfirm, onCancel }) => (
  <div
    style={{ position:"fixed", inset:0, zIndex:1000, background:"rgba(26,16,53,.55)", backdropFilter:"blur(4px)", display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}
    onClick={() => !busy && onCancel()}
  >
    <div
      style={{ background:"white", borderRadius:24, padding:36, maxWidth:360, width:"100%", boxShadow:"0 32px 80px rgba(0,0,0,.24)", animation:"udp-popIn .2s both" }}
      onClick={e => e.stopPropagation()}
    >
      <div style={{ fontSize:40, textAlign:"center", marginBottom:14 }}>🗑️</div>
      <div style={{ fontFamily:T.dFont, fontSize:19, fontWeight:900, color:T.text, textAlign:"center", marginBottom:8 }}>
        Delete video?
      </div>
      <p style={{ fontSize:13, color:T.sub, textAlign:"center", lineHeight:1.7, marginBottom:22 }}>
        <strong style={{ color:T.text }}>"{video.title}"</strong> will be permanently deleted.
        This cannot be undone.
      </p>
      <div style={{ display:"flex", gap:10 }}>
        <button
          disabled={busy}
          onClick={onCancel}
          style={{ flex:1, padding:"11px", borderRadius:13, border:`2px solid ${T.border}`, background:"white", color:T.sub, fontFamily:T.dFont, fontSize:13, fontWeight:800, cursor:"pointer" }}
        >
          Cancel
        </button>
        <button
          disabled={busy}
          onClick={onConfirm}
          style={{ flex:1, padding:"11px", borderRadius:13, border:"none", background:"linear-gradient(135deg,#EF4444,#DC2626)", color:"white", fontFamily:T.dFont, fontSize:13, fontWeight:900, cursor:busy?"not-allowed":"pointer", opacity:busy?.6:1, boxShadow:"0 6px 20px rgba(239,68,68,.38)" }}
        >
          {busy ? "Deleting…" : "Delete video"}
        </button>
      </div>
    </div>
  </div>
);

/* ════════════════════════════════════════════════════════════════════════════
   SECTION: VIDEOS
════════════════════════════════════════════════════════════════════════════ */
const VideosSection = ({ unitId, navigate, isExpanded, onToggle }) => {
  const [videos,   setVideos]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [toDelete, setToDelete] = useState(null);
  const [delBusy,  setDelBusy]  = useState(false);

  /* ── Load ── */
  const loadVideos = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/admin/videos?unit_id=${unitId}&limit=100`, { headers: authH() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      const list = Array.isArray(d) ? d : (d.videos || d.items || []);
      setVideos(list.sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)));
    } catch {
      setVideos([]);
    } finally {
      setLoading(false);
    }
  }, [unitId]);

  useEffect(() => { loadVideos(); }, [loadVideos]);

  /* ── Publish/unpublish: PUT /api/v1/admin/videos/:id ── */
  const handleTogglePublish = async (video, isCurrentlyPublished) => {
    const newStatus = isCurrentlyPublished ? "draft" : "published";
    try {
      const res = await fetch(`/api/v1/admin/videos/${video.id}`, {
        method: "PUT",
        headers: authH(),
        body: JSON.stringify({ status: newStatus, is_visible_to_students: !isCurrentlyPublished }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setVideos(prev => prev.map(v =>
        v.id === video.id
          ? { ...v, status: newStatus, is_visible_to_students: !isCurrentlyPublished }
          : v
      ));
      toast.success(isCurrentlyPublished ? "Video unpublished" : "Video published 🎉");
    } catch {
      toast.error("Could not update status");
    }
  };

  /* ── Delete: DELETE /api/v1/admin/videos/:id ── */
  const handleDelete = async () => {
    if (!toDelete) return;
    setDelBusy(true);
    try {
      const res = await fetch(`/api/v1/admin/videos/${toDelete.id}`, {
        method: "DELETE",
        headers: authH(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setVideos(prev => prev.filter(v => v.id !== toDelete.id));
      toast.success("Video deleted");
    } catch {
      toast.error("Delete failed");
    } finally {
      setDelBusy(false);
      setToDelete(null);
    }
  };

  const hasVideos = videos.length > 0;
  const publishedCount = videos.filter(v => v.status === "published").length;

  return (
    <>
      <div className="udp-section" style={{ animationDelay: ".06s" }}>
        <div className="udp-sec-hd" style={{ background: `linear-gradient(135deg,${T.sky},${T.violet})` }}>
          <button
            className={`udp-sec-hd-toggle ${isExpanded ? 'udp-sec-hd-toggle--expanded' : 'udp-sec-hd-toggle--collapsed'}`}
            onClick={onToggle}
            title={isExpanded ? "Collapse" : "Expand"}
          >
            ▼
          </button>
          <div className="udp-sec-hd-icon">🎬</div>
          <div className="udp-sec-hd-title">Videos</div>
          {hasVideos && (
            <span className="udp-sec-hd-count">
              {videos.length} video{videos.length !== 1 ? "s" : ""}
              {publishedCount > 0 ? ` · ${publishedCount} published` : ""}
            </span>
          )}
          <button
            className="udp-sec-hd-btn"
            onClick={() => navigate(`/admin/videos/new?unit_id=${unitId}`)}
          >
            <Ico.Plus /> Add video
          </button>
          {hasVideos && (
            <button
              className="udp-sec-hd-btn"
              onClick={() => loadVideos()}
              title="Refresh"
            >
              ↻ Refresh
            </button>
          )}
        </div>

        <div className={`udp-sec-body ${isExpanded ? 'udp-sec-body--expanded' : 'udp-sec-body--collapsed'}`}>
          {loading ? (
            <div style={{ display:"flex", alignItems:"center", gap:10, padding:"18px 0", color:T.muted }}>
              <div className="udp-spinner" style={{ borderTopColor:T.sky }} /> Loading videos…
            </div>
          ) : !hasVideos ? (
            /* ── Empty state ── */
            <div className="udp-sec-empty">
              <div className="udp-sec-empty-icon" style={{ background:`linear-gradient(135deg,${T.skyL},${T.violetL})` }}>🎬</div>
              <div className="udp-sec-empty-title">No videos yet</div>
              <div className="udp-sec-empty-sub">
                Upload video files or link YouTube/Vimeo — students watch the lesson
                before completing tasks and the test.
              </div>
              <div style={{ display:"flex", gap:10, flexWrap:"wrap", justifyContent:"center" }}>
                <button
                  className="udp-sec-cta"
                  style={{ background:`linear-gradient(135deg,${T.sky},${T.violet})`, color:"white" }}
                  onClick={() => navigate(`/admin/videos/new?unit_id=${unitId}`)}
                >
                  <Ico.Plus /> Add First Video
                </button>
              </div>
            </div>
          ) : (
            /* ── Video cards ── */
            <>
              {videos.map((v, i) => (
                <VideoCard
                  key={v.id}
                  video={v}
                  unitId={unitId}
                  onDelete={setToDelete}
                  onTogglePublish={handleTogglePublish}
                  navigate={navigate}
                  style={{ animationDelay:`${i*.06}s` }}
                />
              ))}

              {/* Add another video row */}
              <button
                className="udp-add-vid"
                onClick={() => navigate(`/admin/videos/new?unit_id=${unitId}`)}
              >
                <span className="udp-add-vid-ico"><Ico.Plus /></span>
                Add another video
              </button>
            </>
          )}
        </div>
      </div>

      {/* Delete modal */}
      {toDelete && (
        <DeleteVideoModal
          video={toDelete}
          busy={delBusy}
          onConfirm={handleDelete}
          onCancel={() => !delBusy && setToDelete(null)}
        />
      )}
    </>
  );
};

/* ════════════════════════════════════════════════════════════════════════════
   SECTION: SLIDES
════════════════════════════════════════════════════════════════════════════ */

/* ── DeckCard: one card per Presentation entity ─────────────────────────── */
const DeckCard = ({ deck, unitId, onDelete, onTogglePublish, navigate, style }) => {
  const [toggling, setToggling] = useState(false);
  const isPublished = deck.status === "published" || deck.is_visible_to_students;
  const slides = deck.slides || deck.presentation_slides || [];
  const previewSlides = slides.slice(0, 3);
  const bgPairs = [
    [T.violetL, T.pinkL],
    [T.skyL,    T.violetL],
    [T.limeL,   T.skyL],
  ];
  const [bg1, bg2] = bgPairs[deck.id % bgPairs.length] || bgPairs[0];

  const goToEditor = () =>
    navigate(`/admin/presentations/${deck.id}/edit?unit_id=${unitId}`);

  const handleTogglePublish = async (e) => {
    e.stopPropagation();
    setToggling(true);
    await onTogglePublish(deck, isPublished);
    setToggling(false);
  };

  return (
    <div className="udp-deck-card" style={style}>
      {/* Banner */}
      <div className="udp-deck-banner" style={{ background: `linear-gradient(135deg,${bg1},${bg2})` }}>
        {/* Mini slide previews */}
        {previewSlides.length > 0
          ? previewSlides.map((s, i) => (
              <div key={s.id || i} className="udp-deck-mini" style={{ transform: i === 1 ? "rotate(-2deg) scale(1.05)" : i === 2 ? "rotate(2deg)" : "rotate(-1deg)" }}>
                {s.image_url && <img src={s.image_url} alt="" onError={e => { e.target.style.display="none"; }} />}
                <div className="udp-deck-mini-line" />
                <div className="udp-deck-mini-line" />
                <div className="udp-deck-mini-line" />
              </div>
            ))
          : [0,1,2].map(i => (
              <div key={i} className="udp-deck-mini" style={{ transform: i === 1 ? "rotate(-2deg) scale(1.05)" : i === 2 ? "rotate(2deg)" : "rotate(-1deg)" }}>
                <div className="udp-deck-mini-line" />
                <div className="udp-deck-mini-line" />
                <div className="udp-deck-mini-line" />
              </div>
            ))
        }
        {/* Slide count badge */}
        {slides.length > 0 && (
          <div className="udp-deck-count-badge">
            🖼️ {slides.length} slide{slides.length !== 1 ? "s" : ""}
          </div>
        )}
        {/* Hover overlay */}
        <div className="udp-deck-open-overlay" onClick={goToEditor}>
          <div className="udp-deck-open-lbl">
            <Ico.Pencil /> Open editor
          </div>
        </div>
      </div>

      {/* Info row */}
      <div className="udp-deck-info">
        <div style={{ flex:1, minWidth:0 }}>
          <div className="udp-deck-title">{deck.title || "Untitled deck"}</div>
          <div className="udp-deck-meta">
            {deck.language && <span>🌐 {deck.language}</span>}
            {deck.level    && <span>📊 {deck.level}</span>}
            {deck.duration_minutes && <span>⏱ {deck.duration_minutes} min</span>}
          </div>
        </div>
        <div className="udp-deck-actions">
          {/* Publish toggle */}
          <button
            className={`udp-pub-toggle ${isPublished ? "udp-pub-toggle--pub" : "udp-pub-toggle--draft"}`}
            onClick={handleTogglePublish}
            disabled={toggling}
            title={isPublished ? "Click to unpublish" : "Click to publish"}
          >
            {toggling
              ? <div className="udp-spinner udp-spinner-sm" style={{ borderTopColor:"currentColor", borderColor:"currentColor22" }}/>
              : isPublished ? "✓ Published" : "Draft"}
          </button>
          {/* Edit */}
          <button className="udp-ico-btn" title="Edit slides" onClick={goToEditor}>
            <Ico.Pencil />
          </button>
          {/* Delete */}
          <button className="udp-ico-btn del" title="Delete deck" onClick={e => { e.stopPropagation(); onDelete(deck); }}>
            <Ico.Trash />
          </button>
        </div>
      </div>

      {/* Slide thumbnail strip (if deck has slides) */}
      {slides.length > 0 && (
        <div className="udp-deck-slides-grid" onClick={goToEditor}>
          {slides.slice(0, 6).map((s, i) => {
            const bg = [T.bg, T.violetL, T.skyL, T.limeL, T.amberL, T.pinkL][i % 6];
            return (
              <div key={s.id || i} className="udp-slide-mini-card" style={{ animationDelay:`${i*.03}s` }}>
                <div className="udp-slide-mini-thumb" style={{ background: bg }}>
                  {s.image_url && <img src={s.image_url} alt="" onError={e => { e.target.style.display="none"; }}/>}
                  <div className="udp-slide-mini-num">#{i+1}</div>
                  <div className="udp-slide-mini-line" />
                  <div className="udp-slide-mini-line" />
                </div>
                <div className="udp-slide-mini-foot">{s.title || `Slide ${i+1}`}</div>
              </div>
            );
          })}
          {slides.length > 6 && (
            <div className="udp-slide-mini-card" style={{ background:T.violetL, border:`2px dashed ${T.violet}55`, display:"flex", alignItems:"center", justifyContent:"center", minHeight:88, borderRadius:11 }}>
              <div style={{ textAlign:"center", color:T.violet }}>
                <div style={{ fontFamily:T.dFont, fontSize:16, fontWeight:900 }}>+{slides.length - 6}</div>
                <div style={{ fontSize:10, fontWeight:700 }}>more</div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/* ── Delete deck modal ───────────────────────────────────────────────────── */
const DeleteDeckModal = ({ deck, busy, onConfirm, onCancel }) => (
  <div style={{ position:"fixed", inset:0, zIndex:1000, background:"rgba(26,16,53,.55)", backdropFilter:"blur(4px)", display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}
    onClick={() => !busy && onCancel()}>
    <div style={{ background:"white", borderRadius:24, padding:36, maxWidth:360, width:"100%", boxShadow:"0 32px 80px rgba(0,0,0,.24)", animation:"udp-popIn .2s both" }}
      onClick={e => e.stopPropagation()}>
      <div style={{ fontSize:40, textAlign:"center", marginBottom:14 }}>🗑️</div>
      <div style={{ fontFamily:T.dFont, fontSize:19, fontWeight:900, color:T.text, textAlign:"center", marginBottom:8 }}>
        Delete slide deck?
      </div>
      <p style={{ fontSize:13, color:T.sub, textAlign:"center", lineHeight:1.7, marginBottom:22 }}>
        <strong style={{ color:T.text }}>"{deck.title}"</strong> and all its slides will be permanently deleted.
      </p>
      <div style={{ display:"flex", gap:10 }}>
        <button disabled={busy} onClick={onCancel}
          style={{ flex:1, padding:"11px", borderRadius:13, border:`2px solid ${T.border}`, background:"white", color:T.sub, fontFamily:T.dFont, fontSize:13, fontWeight:800, cursor:"pointer" }}>
          Cancel
        </button>
        <button disabled={busy} onClick={onConfirm}
          style={{ flex:1, padding:"11px", borderRadius:13, border:"none", background:"linear-gradient(135deg,#EF4444,#DC2626)", color:"white", fontFamily:T.dFont, fontSize:13, fontWeight:900, cursor:busy?"not-allowed":"pointer", opacity:busy?.6:1, boxShadow:"0 6px 20px rgba(239,68,68,.38)" }}>
          {busy ? "Deleting…" : "Delete deck"}
        </button>
      </div>
    </div>
  </div>
);

/* ════════════════════════════════════════════════════════════════════════════
   SLIDES SECTION
════════════════════════════════════════════════════════════════════════════ */
const SlidesSection = ({ unitId, courseId, navigate, isExpanded, onToggle }) => {
  const [decks,    setDecks]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [creating, setCreating] = useState(false);   // busy: creating empty deck
  const [toDelete, setToDelete] = useState(null);
  const [delBusy,  setDelBusy]  = useState(false);

  /* ── Load presentations for this unit ── */
  const loadDecks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/admin/units/${unitId}/presentations`, { headers: authH() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      // Each presentation may embed its slides; sort by order_index / created_at
      const list = Array.isArray(d) ? d : (d.presentations || d.items || []);
      setDecks(list.sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)));
    } catch {
      setDecks([]);
    } finally {
      setLoading(false);
    }
  }, [unitId]);

  useEffect(() => { loadDecks(); }, [loadDecks]);

  /* ── Create empty deck then navigate to editor ── */
  const handleNewEmptyDeck = async () => {
    setCreating(true);
    try {
      const body = {
        title:                  "New slide deck",
        description:            "",
        topic:                  "",
        is_visible_to_students: false,
        order_index:            decks.length,
        language:               "English",
      };
      const res = await fetch(`/api/v1/admin/units/${unitId}/presentations`, {
        method: "POST", headers: authH(), body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const pres = await res.json();
      navigate(`/admin/presentations/${pres.id}/edit?unit_id=${unitId}`);
    } catch (e) {
      toast.error(e.message || "Could not create deck");
      setCreating(false);
    }
  };

  /* ── Publish / unpublish ── */
  const handleTogglePublish = async (deck, isCurrentlyPublished) => {
    try {
      const newStatus = isCurrentlyPublished ? "draft" : "published";
      const res = await fetch(`/api/v1/admin/presentations/${deck.id}`, {
        method: "PATCH", headers: authH(),
        body: JSON.stringify({
          status: newStatus,
          is_visible_to_students: !isCurrentlyPublished,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setDecks(prev => prev.map(d =>
        d.id === deck.id
          ? { ...d, status: newStatus, is_visible_to_students: !isCurrentlyPublished }
          : d
      ));
      toast.success(isCurrentlyPublished ? "Deck unpublished" : "Deck published 🎉");
    } catch {
      toast.error("Could not update status");
    }
  };

  /* ── Delete ── */
  const handleDelete = async () => {
    if (!toDelete) return;
    setDelBusy(true);
    try {
      const res = await fetch(`/api/v1/admin/presentations/${toDelete.id}`, {
        method: "DELETE", headers: authH(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setDecks(prev => prev.filter(d => d.id !== toDelete.id));
      toast.success("Deck deleted");
    } catch {
      toast.error("Delete failed");
    } finally {
      setDelBusy(false);
      setToDelete(null);
    }
  };

  const hasDecks = decks.length > 0;
  const goToGenerator = () => navigate(`/admin/generate-slide?unitId=${unitId}`);
  const totalSlides = decks.reduce((n, d) => n + ((d.slides || d.presentation_slides || []).length), 0);

  return (
    <>
      <div className="udp-section" style={{ animationDelay: ".10s" }}>
        <div className="udp-sec-hd" style={{ background: `linear-gradient(135deg,${T.violet},${T.pink})` }}>
          <button
            className={`udp-sec-hd-toggle ${isExpanded ? 'udp-sec-hd-toggle--expanded' : 'udp-sec-hd-toggle--collapsed'}`}
            onClick={onToggle}
            title={isExpanded ? "Collapse" : "Expand"}
          >
            ▼
          </button>
          <div className="udp-sec-hd-icon">🖼️</div>
          <div className="udp-sec-hd-title">Slides</div>
          {hasDecks && (
            <span className="udp-sec-hd-count">
              {decks.length} deck{decks.length !== 1 ? "s" : ""}
              {totalSlides > 0 ? ` · ${totalSlides} slides` : ""}
            </span>
          )}
          <button className="udp-sec-hd-btn udp-sec-hd-btn--solid" onClick={goToGenerator}>
            <Ico.Spark /> Generate with AI
          </button>
          <button
            className="udp-sec-hd-btn"
            onClick={handleNewEmptyDeck}
            disabled={creating}
          >
            {creating
              ? <><div className="udp-spinner udp-spinner-sm" style={{ borderTopColor:"rgba(255,255,255,.8)", borderColor:"rgba(255,255,255,.25)" }}/> Creating…</>
              : <><Ico.Plus /> New deck</>}
          </button>
        </div>

        <div className={`udp-sec-body ${isExpanded ? 'udp-sec-body--expanded' : 'udp-sec-body--collapsed'}`}>
          {loading ? (
            <div style={{ display:"flex", alignItems:"center", gap:10, padding:"18px 0", color:T.muted }}>
              <div className="udp-spinner" style={{ borderTopColor:T.violet }}/> Loading slide decks…
            </div>
          ) : !hasDecks ? (
            /* ── Empty state ── */
            <>
              <div className="udp-slides-cta">
                <div className="udp-slides-cta-icon">✨</div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div className="udp-slides-cta-title">Generate AI slides</div>
                  <div className="udp-slides-cta-sub">
                    AI builds a complete slide deck from your unit — vocabulary, grammar, examples,
                    exercises and teacher notes all in one go.
                  </div>
                </div>
                <button className="udp-slides-cta-btn" onClick={goToGenerator}>
                  <Ico.Spark /> Generate slides
                </button>
              </div>

              {/* Two smaller CTAs */}
              <div style={{ display:"flex", gap:10, marginTop:12 }}>
                <button
                  onClick={handleNewEmptyDeck}
                  disabled={creating}
                  style={{
                    flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:8,
                    padding:"12px 18px", borderRadius:14,
                    border:`2px dashed ${T.border}`, background:"#fff",
                    color:T.sub, fontFamily:T.dFont, fontSize:13, fontWeight:800,
                    cursor:"pointer", transition:"all .16s",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor=T.violet; e.currentTarget.style.color=T.violet; e.currentTarget.style.background=T.violetL; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor=T.border; e.currentTarget.style.color=T.sub; e.currentTarget.style.background="#fff"; }}
                >
                  {creating
                    ? <><div className="udp-spinner udp-spinner-sm" style={{ borderTopColor:T.violet }}/> Creating…</>
                    : <><Ico.Plus /> Start from scratch</>}
                </button>
              </div>
            </>
          ) : (
            /* ── Deck list ── */
            <>
              {decks.map((deck, i) => (
                <DeckCard
                  key={deck.id}
                  deck={deck}
                  unitId={unitId}
                  onDelete={setToDelete}
                  onTogglePublish={handleTogglePublish}
                  navigate={navigate}
                  style={{ animationDelay: `${i * .06}s` }}
                />
              ))}

              {/* Add another deck row */}
              <div style={{ display:"flex", gap:8, marginTop:8 }}>
                <button
                  className="udp-add-deck"
                  style={{ flex:1 }}
                  onClick={handleNewEmptyDeck}
                  disabled={creating}
                >
                  <span className="udp-add-deck-ico"><Ico.Plus /></span>
                  {creating ? "Creating deck…" : "Add another deck"}
                </button>
                <button
                  style={{
                    display:"flex", alignItems:"center", gap:7, padding:"13px 18px",
                    borderRadius:16, border:"none", flexShrink:0,
                    background:`linear-gradient(135deg,${T.violet},${T.pink})`,
                    color:"#fff", fontFamily:T.dFont, fontSize:13, fontWeight:900,
                    cursor:"pointer", boxShadow:`0 4px 14px rgba(108,53,222,.3)`,
                    transition:"all .16s",
                  }}
                  onClick={goToGenerator}
                  onMouseEnter={e => { e.currentTarget.style.transform="translateY(-1px)"; e.currentTarget.style.boxShadow=`0 8px 22px rgba(108,53,222,.42)`; }}
                  onMouseLeave={e => { e.currentTarget.style.transform="none"; e.currentTarget.style.boxShadow=`0 4px 14px rgba(108,53,222,.3)`; }}
                >
                  <Ico.Spark /> Generate with AI
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Delete modal */}
      {toDelete && (
        <DeleteDeckModal
          deck={toDelete}
          busy={delBusy}
          onConfirm={handleDelete}
          onCancel={() => !delBusy && setToDelete(null)}
        />
      )}
    </>
  );
};

/* ── Delete task/test modal (shared) ──────────────────────────────────────── */
const DeleteEntityModal = ({ emoji, label, name, busy, onConfirm, onCancel }) => (
  <div
    style={{ position:"fixed", inset:0, zIndex:1000, background:"rgba(26,16,53,.55)",
      backdropFilter:"blur(4px)", display:"flex", alignItems:"center",
      justifyContent:"center", padding:24 }}
    onClick={() => !busy && onCancel()}
  >
    <div
      style={{ background:"white", borderRadius:24, padding:36, maxWidth:360,
        width:"100%", boxShadow:"0 32px 80px rgba(0,0,0,.24)",
        animation:"udp-popIn .2s both" }}
      onClick={e => e.stopPropagation()}
    >
      <div style={{ fontSize:40, textAlign:"center", marginBottom:14 }}>{emoji}</div>
      <div style={{ fontFamily:T.dFont, fontSize:19, fontWeight:900, color:T.text,
        textAlign:"center", marginBottom:8 }}>
        Delete {label}?
      </div>
      <p style={{ fontSize:13, color:T.sub, textAlign:"center", lineHeight:1.7, marginBottom:22 }}>
        <strong style={{ color:T.text }}>"{name}"</strong> will be permanently deleted.
        This cannot be undone.
      </p>
      <div style={{ display:"flex", gap:10 }}>
        <button disabled={busy} onClick={onCancel}
          style={{ flex:1, padding:"11px", borderRadius:13, border:`2px solid ${T.border}`,
            background:"white", color:T.sub, fontFamily:T.dFont, fontSize:13,
            fontWeight:800, cursor:"pointer" }}>
          Cancel
        </button>
        <button disabled={busy} onClick={onConfirm}
          style={{ flex:1, padding:"11px", borderRadius:13, border:"none",
            background:"linear-gradient(135deg,#EF4444,#DC2626)", color:"white",
            fontFamily:T.dFont, fontSize:13, fontWeight:900,
            cursor:busy?"not-allowed":"pointer", opacity:busy?.6:1,
            boxShadow:"0 6px 20px rgba(239,68,68,.38)" }}>
          {busy ? "Deleting…" : `Delete ${label}`}
        </button>
      </div>
    </div>
  </div>
);

/* ── TaskCard ────────────────────────────────────────────────────────────── */
const TaskCard = ({ task: t, onDelete, onTogglePublish, navigate, style }) => {
  const [toggling, setToggling] = useState(false);
  const cfg  = getTaskTypeCfg(t);
  const st   = STATUS_CFG[t.status] || STATUS_CFG.draft;
  const due  = fmtDue(t.due_at);
  const isPublished = t.status === "published";
  const subs = t.submission_stats || {};
  const submitted = subs.submitted || 0;
  const graded    = subs.graded    || 0;
  const pending   = subs.pending   || 0;

  const handleToggle = async e => {
    e.stopPropagation();
    setToggling(true);
    await onTogglePublish(t, isPublished);
    setToggling(false);
  };

  return (
    <div className="udp-task-card" style={style}
      onClick={() => navigate(`/admin/tasks/${t.id}`)}>
      {/* Coloured accent top bar */}
      <div className="udp-task-banner"
        style={{ background:`linear-gradient(90deg,${cfg.color},${T.amber})` }} />

      {/* Main row */}
      <div className="udp-task-content">
        {/* Type icon square */}
        <div className="udp-task-icon" style={{ background:cfg.bg }}>
          {cfg.emoji}
        </div>

        <div className="udp-task-body">
          <div className="udp-task-title">{t.title}</div>
          <div className="udp-task-chips">
            {/* Type badge */}
            <span className="udp-task-chip udp-task-chip--type"
              style={{ background:cfg.bg, color:cfg.color }}>
              {cfg.label}
            </span>
            {/* Max score */}
            {t.max_score != null && (
              <span className="udp-task-chip udp-task-chip--score">
                🎯 {t.max_score} pts
              </span>
            )}
            {/* Due date */}
            {due && (
              <span className={`udp-task-chip ${due.overdue ? "udp-task-chip--over" : due.soon ? "udp-task-chip--soon" : "udp-task-chip--due"}`}>
                ⏰ {due.label}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Footer: stats + actions */}
      <div className="udp-task-footer">
        <div className="udp-task-stats">
          {submitted > 0 && (
            <span className="udp-task-stat">
              📥 {submitted} submitted
            </span>
          )}
          {graded > 0 && (
            <span className="udp-task-stat">
              ✅ {graded} graded
            </span>
          )}
          {pending > 0 && (
            <span className="udp-task-stat udp-task-stat--warn">
              ⏳ {pending} pending
            </span>
          )}
          {submitted === 0 && (
            <span className="udp-task-stat" style={{ color:T.mutedL }}>
              No submissions yet
            </span>
          )}
        </div>

        <div className="udp-task-actions">
          {/* Publish toggle */}
          <button
            className={`udp-pub-toggle ${isPublished ? "udp-pub-toggle--pub" : "udp-pub-toggle--draft"}`}
            onClick={handleToggle}
            disabled={toggling}
            title={isPublished ? "Click to unpublish" : "Click to publish"}
          >
            {toggling
              ? <div className="udp-spinner udp-spinner-sm" />
              : isPublished ? "✓ Published" : "Draft"}
          </button>

          {/* Submissions shortcut (only if there are submissions) */}
          {submitted > 0 && (
            <button className="udp-ico-btn open" title="View submissions"
              onClick={e => { e.stopPropagation(); navigate(`/admin/tasks/${t.id}/submissions`); }}>
              <Ico.Chart />
            </button>
          )}

          {/* Edit */}
          <button className="udp-ico-btn" title="Edit task"
            onClick={e => { e.stopPropagation(); navigate(`/admin/tasks/${t.id}/builder`); }}>
            <Ico.Pencil />
          </button>

          {/* Delete */}
          <button className="udp-ico-btn del" title="Delete task"
            onClick={e => { e.stopPropagation(); onDelete(t); }}>
            <Ico.Trash />
          </button>
        </div>
      </div>
    </div>
  );
};

/* ════════════════════════════════════════════════════════════════════════════
   SECTION: TASKS
════════════════════════════════════════════════════════════════════════════ */
const TasksSection = ({ unitId, unitTitle, navigate, isExpanded, onToggle }) => {
  const [tasks,   setTasks]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [toDelete,setToDelete]= useState(null);
  const [delBusy, setDelBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);

  /* ── Load: GET /api/v1/admin/tasks?unit_id=X&sort_by=order_index&sort_order=asc ── */
  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/v1/admin/tasks?unit_id=${unitId}&limit=100&sort_by=order_index&sort_order=asc`,
        { headers: authH() }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      setTasks(Array.isArray(d) ? d : (d.tasks || d.items || []));
    } catch {
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [unitId]);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  /* ── Publish/unpublish: PUT /api/v1/admin/tasks/:id ── */
  const handleTogglePublish = async (task, isCurrentlyPublished) => {
    const newStatus = isCurrentlyPublished ? "draft" : "published";
    try {
      const res = await fetch(`/api/v1/admin/tasks/${task.id}`, {
        method:"PUT", headers:authH(),
        body:JSON.stringify({ status:newStatus }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setTasks(prev => prev.map(t =>
        t.id === task.id ? { ...t, status:newStatus } : t
      ));
      toast.success(isCurrentlyPublished ? "Task unpublished" : "Task published 🎉");
    } catch {
      toast.error("Could not update status");
    }
  };

  /* ── Delete: DELETE /api/v1/admin/tasks/:id ── */
  const handleDelete = async () => {
    if (!toDelete) return;
    setDelBusy(true);
    try {
      const res = await fetch(`/api/v1/admin/tasks/${toDelete.id}`, {
        method:"DELETE", headers:authH(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setTasks(prev => prev.filter(t => t.id !== toDelete.id));
      toast.success("Task deleted");
    } catch {
      toast.error("Delete failed");
    } finally {
      setDelBusy(false);
      setToDelete(null);
    }
  };

  const hasTasks = tasks.length > 0;
  const publishedCount = tasks.filter(t => t.status === "published").length;
  const pendingCount   = tasks.reduce((n, t) => n + ((t.submission_stats?.pending) || 0), 0);

  return (
    <>
      <div className="udp-section" style={{ animationDelay:".14s" }}>
        <div className="udp-sec-hd" style={{ background:`linear-gradient(135deg,${T.amber},${T.orange})` }}>
          <button
            className={`udp-sec-hd-toggle ${isExpanded ? 'udp-sec-hd-toggle--expanded' : 'udp-sec-hd-toggle--collapsed'}`}
            onClick={onToggle}
            title={isExpanded ? "Collapse" : "Expand"}
          >
            ▼
          </button>
          <div className="udp-sec-hd-icon">✏️</div>
          <div className="udp-sec-hd-title">Tasks</div>
          {hasTasks && (
            <span className="udp-sec-hd-count">
              {tasks.length} task{tasks.length !== 1 ? "s" : ""}
              {publishedCount > 0 ? ` · ${publishedCount} published` : ""}
              {pendingCount > 0 ? ` · ${pendingCount} pending review` : ""}
            </span>
          )}
          <button className="udp-sec-hd-btn"
            onClick={() => setPickerOpen(true)}>
            <Ico.Plus /> Create task
          </button>
          {hasTasks && (
            <button className="udp-sec-hd-btn" onClick={() => loadTasks()} title="Refresh">
              ↻ Refresh
            </button>
          )}
        </div>

        <div className={`udp-sec-body ${isExpanded ? 'udp-sec-body--expanded' : 'udp-sec-body--collapsed'}`}>
          {loading ? (
            <div style={{ display:"flex", alignItems:"center", gap:10, padding:"18px 0", color:T.muted }}>
              <div className="udp-spinner" style={{ borderTopColor:T.amber }} /> Loading tasks…
            </div>
          ) : !hasTasks ? (
            /* ── Empty state ── */
            <div className="udp-sec-empty">
              <div className="udp-sec-empty-icon" style={{ background:`linear-gradient(135deg,${T.amberL},${T.orangeL})` }}>✏️</div>
              <div className="udp-sec-empty-title">No tasks yet</div>
              <div className="udp-sec-empty-sub">
                Create written tasks, multiple-choice, gap-fill, listening or reading exercises
                for students to complete after the lesson.
              </div>
              <button className="udp-sec-cta"
                style={{ background:`linear-gradient(135deg,${T.amber},${T.orange})`, color:"white" }}
                onClick={() => setPickerOpen(true)}>
                <Ico.Plus /> Create First Task
              </button>
            </div>
          ) : (
            /* ── Task cards ── */
            <>
              {tasks.map((t, i) => (
                <TaskCard
                  key={t.id}
                  task={t}
                  onDelete={setToDelete}
                  onTogglePublish={handleTogglePublish}
                  navigate={navigate}
                  style={{ animationDelay:`${i*.06}s` }}
                />
              ))}

              <button className="udp-add-task"
                onClick={() => setPickerOpen(true)}>
                <span className="udp-add-task-ico"><Ico.Plus /></span>
                Create another task
              </button>
            </>
          )}
        </div>
      </div>

      {toDelete && (
        <DeleteEntityModal
          emoji="🗑️" label="task" name={toDelete.title}
          busy={delBusy}
          onConfirm={handleDelete}
          onCancel={() => !delBusy && setToDelete(null)}
        />
      )}

      <CreateTaskMethodPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        unitId={unitId}
        unitTitle={unitTitle}
        onManual={() => {
          setPickerOpen(false);
          navigate(`/admin/tasks/builder/new?unitId=${unitId}${unitTitle ? `&unitTitle=${encodeURIComponent(unitTitle)}` : ""}`);
        }}
        onAI={() => {
          setPickerOpen(false);
          setWizardOpen(true);
        }}
      />

      <AITaskGenerationWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onBack={() => {
          setWizardOpen(false);
          setPickerOpen(true);
        }}
        unitId={unitId}
        unitTitle={unitTitle}
        onDone={(taskIds) => {
          setWizardOpen(false);
          if (taskIds && taskIds.length > 0) {
            navigate(`/admin/tasks/builder?generated=${taskIds.join(",")}&ai=1`);
          } else {
            // Reload tasks if generation completed but no IDs returned
            loadTasks();
          }
        }}
      />
    </>
  );
};

/* ── TestCard ─────────────────────────────────────────────────────────────── */
const TestCard = ({ test, onDelete, onTogglePublish, navigate, style }) => {
  const [toggling,   setToggling]   = useState(false);
  const [qCount,     setQCount]     = useState(test.question_count ?? test.questions_count ?? null);
  const [qLoading,   setQLoading]   = useState(false);

  const isPublished = test.status === "published";
  const st          = STATUS_CFG[test.status] || STATUS_CFG.draft;
  const maxAttempts = test.settings?.max_attempts ?? test.max_attempts ?? null;

  /* ── Fetch question count lazily on mount (if not in test data) ── */
  useEffect(() => {
    if (qCount !== null) return;          // already known
    let cancelled = false;
    setQLoading(true);
    fetch(`/api/v1/admin/tests/${test.id}/questions`, { headers: authH() })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (cancelled) return;
        // response is { questions:[], total:N } or an array
        const n = Array.isArray(d) ? d.length : (d?.total ?? d?.questions?.length ?? null);
        setQCount(n);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setQLoading(false); });
    return () => { cancelled = true; };
  }, [test.id, qCount]);

  const handleToggle = async e => {
    e.stopPropagation();
    setToggling(true);
    await onTogglePublish(test, isPublished);
    setToggling(false);
  };

  const handleOpen  = e => { e.stopPropagation(); navigate(`/admin/tests/${test.id}/builder`); };
  const handleEdit  = e => { e.stopPropagation(); navigate(`/admin/tests/${test.id}/builder`); };
  const handleStats = e => { e.stopPropagation(); navigate(`/admin/tests/${test.id}/analytics`); };
  const handlePreview = e => { e.stopPropagation(); navigate(`/admin/tests/${test.id}/preview`); };

  return (
    <div className="udp-test-card" style={style}>

      {/* ── Banner (clickable → open test) ── */}
      <div className="udp-test-banner" onClick={handleOpen}>
        <div className="udp-test-banner-icon">📝</div>
        <div style={{ flex:1, minWidth:0 }}>
          <div className="udp-test-banner-title">{test.title}</div>
          {test.description && (
            <div className="udp-test-banner-desc">{test.description}</div>
          )}
        </div>
        {/* Status chip — visible even without hover */}
        <span className="udp-status-chip"
          style={{ background:st.bg, color:st.color, flexShrink:0 }}>
          {st.label}
        </span>
        {/* Hover overlay */}
        <div className="udp-test-banner-overlay" onClick={handleOpen}>
          <Ico.Open /> Open test
        </div>
      </div>

      {/* ── Stat pills row ── */}
      <div className="udp-test-stats-row">
        {test.time_limit_minutes != null && (
          <span className="udp-test-stat-pill udp-test-stat-pill--time">
            <Ico.Clock /> {test.time_limit_minutes} min
          </span>
        )}
        {test.passing_score != null && (
          <span className="udp-test-stat-pill udp-test-stat-pill--pass">
            🎯 Pass at {test.passing_score}%
          </span>
        )}
        <span className="udp-test-stat-pill udp-test-stat-pill--q">
          {qLoading
            ? <span style={{ opacity:.5 }}>… questions</span>
            : qCount !== null
              ? `📋 ${qCount} question${qCount !== 1 ? "s" : ""}`
              : "📋 No questions yet"}
        </span>
        {maxAttempts != null && (
          <span className="udp-test-stat-pill udp-test-stat-pill--atts">
            🔁 {maxAttempts} attempt{maxAttempts !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* ── Footer: action buttons ── */}
      <div className="udp-test-footer">
        {/* Primary: Open */}
        <button className="udp-test-action-btn udp-test-action-btn--open"
          onClick={handleOpen}>
          <Ico.Open /> Open
        </button>

        {/* Edit */}
        <button className="udp-test-action-btn udp-test-action-btn--ghost"
          onClick={handleEdit}>
          <Ico.Pencil /> Edit
        </button>

        {/* Results / Analytics */}
        <button className="udp-test-action-btn udp-test-action-btn--results"
          onClick={handleStats}>
          <Ico.Chart /> Results
        </button>

        {/* Preview */}
        <button className="udp-test-action-btn udp-test-action-btn--ghost"
          onClick={handlePreview}
          title="Preview test">
          👁 Preview
        </button>

        {/* Spacer */}
        <div style={{ flex:1 }} />

        {/* Publish toggle */}
        <button
          className={`udp-pub-toggle ${isPublished ? "udp-pub-toggle--pub" : "udp-pub-toggle--draft"}`}
          onClick={handleToggle}
          disabled={toggling}
          title={isPublished ? "Click to unpublish" : "Click to publish"}
        >
          {toggling
            ? <div className="udp-spinner udp-spinner-sm" />
            : isPublished ? "✓ Published" : "Draft"}
        </button>

        {/* Delete */}
        <button className="udp-ico-btn del" title="Delete test"
          onClick={e => { e.stopPropagation(); onDelete(test); }}>
          <Ico.Trash />
        </button>
      </div>
    </div>
  );
};

/* ════════════════════════════════════════════════════════════════════════════
   SECTION: TEST
════════════════════════════════════════════════════════════════════════════ */
const TestSection = ({ unitId, unitTitle, navigate, isExpanded, onToggle }) => {
  const [tests,   setTests]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [toDelete,setToDelete]= useState(null);
  const [delBusy, setDelBusy] = useState(false);

  /* ── Load: try /admin/tests?unit_id=X, fall back to unit detail ── */
  const loadTests = useCallback(async () => {
    setLoading(true);
    try {
      // Primary: dedicated tests list filtered by unit
      const res = await fetch(
        `/api/v1/admin/tests?unit_id=${unitId}&limit=50`,
        { headers: authH() }
      );
      if (res.ok) {
        const d = await res.json();
        const list = Array.isArray(d) ? d : (d.tests || d.items || []);
        setTests(list.sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)));
        return;
      }
      // Fallback: pull tests from unit detail endpoint
      const r2 = await fetch(`/api/v1/units/admin/units/${unitId}`, { headers: authH() });
      if (r2.ok) {
        const unit = await r2.json();
        setTests((unit.tests || []).sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)));
        return;
      }
      setTests([]);
    } catch {
      setTests([]);
    } finally {
      setLoading(false);
    }
  }, [unitId]);

  useEffect(() => { loadTests(); }, [loadTests]);

  /* ── Publish: PATCH /api/v1/admin/tests/:id/publish|unpublish ── */
  const handleTogglePublish = async (test, isCurrentlyPublished) => {
    const endpoint = isCurrentlyPublished ? "unpublish" : "publish";
    try {
      const res = await fetch(`/api/v1/admin/tests/${test.id}/${endpoint}`, {
        method: "PATCH",
        headers: authH(),
      });
      // Also try PUT if PATCH/endpoint not found (different API shapes)
      if (!res.ok) {
        const fallback = await fetch(`/api/v1/admin/tests/${test.id}`, {
          method: "PUT",
          headers: authH(),
          body: JSON.stringify({ status: isCurrentlyPublished ? "draft" : "published" }),
        });
        if (!fallback.ok) throw new Error("Update failed");
      }
      const newStatus = isCurrentlyPublished ? "draft" : "published";
      setTests(prev => prev.map(t =>
        t.id === test.id ? { ...t, status: newStatus } : t
      ));
      toast.success(isCurrentlyPublished ? "Test unpublished" : "Test published 🎉");
    } catch {
      toast.error("Could not update status");
    }
  };

  /* ── Delete: DELETE /api/v1/admin/tests/:id ── */
  const handleDelete = async () => {
    if (!toDelete) return;
    setDelBusy(true);
    try {
      const res = await fetch(`/api/v1/admin/tests/${toDelete.id}`, {
        method: "DELETE",
        headers: authH(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setTests(prev => prev.filter(t => t.id !== toDelete.id));
      toast.success("Test deleted");
    } catch {
      toast.error("Delete failed");
    } finally {
      setDelBusy(false);
      setToDelete(null);
    }
  };

  /* ── Create test: Navigate to test creation page (method picker) ── */
  const handleCreateTest = () => {
    const params = new URLSearchParams();
    if (unitId) params.set("unitId", String(unitId));
    if (unitTitle) params.set("unitTitle", unitTitle);
    navigate(`/admin/tests/new?${params.toString()}`);
  };

  const hasTests       = tests.length > 0;
  const publishedCount = tests.filter(t => t.status === "published").length;

  return (
    <>
      <div className="udp-section" style={{ animationDelay:".18s" }}>
        {/* ── Section header ── */}
        <div className="udp-sec-hd"
          style={{ background:`linear-gradient(135deg,${T.lime},${T.teal})` }}>
          <button
            className={`udp-sec-hd-toggle ${isExpanded ? 'udp-sec-hd-toggle--expanded' : 'udp-sec-hd-toggle--collapsed'}`}
            onClick={onToggle}
            title={isExpanded ? "Collapse" : "Expand"}
          >
            ▼
          </button>
          <div className="udp-sec-hd-icon">📝</div>
          <div className="udp-sec-hd-title">Test</div>
          {hasTests && (
            <span className="udp-sec-hd-count">
              {tests.length} test{tests.length !== 1 ? "s" : ""}
              {publishedCount > 0 ? ` · ${publishedCount} published` : ""}
            </span>
          )}
          <button className="udp-sec-hd-btn"
            onClick={handleCreateTest}>
            <Ico.Plus /> Create test
          </button>
          {hasTests && (
            <button className="udp-sec-hd-btn" onClick={() => loadTests()} title="Refresh">
              ↻ Refresh
            </button>
          )}
        </div>

        {/* ── Body ── */}
        <div className={`udp-sec-body ${isExpanded ? 'udp-sec-body--expanded' : 'udp-sec-body--collapsed'}`}>
          {loading ? (
            <div style={{ display:"flex", alignItems:"center", gap:10,
              padding:"18px 0", color:T.muted }}>
              <div className="udp-spinner" style={{ borderTopColor:T.lime }} />
              Loading test…
            </div>

          ) : !hasTests ? (
            /* ── Empty state ── */
            <div className="udp-sec-empty">
              <div className="udp-sec-empty-icon" style={{ background:`linear-gradient(135deg,${T.limeL},${T.tealL})` }}>📝</div>
              <div className="udp-sec-empty-title">No test yet</div>
              <div className="udp-sec-empty-sub">
                Add a unit test to check comprehension — multiple-choice, gap-fill,
                short-answer and open questions all supported.
              </div>
              <div style={{ display:"flex", gap:10, justifyContent:"center",
                flexWrap:"wrap" }}>
                <button className="udp-sec-cta"
                  style={{ background:`linear-gradient(135deg,${T.lime},${T.teal})`,
                    color:"white" }}
                  onClick={handleCreateTest}>
                  <Ico.Plus /> Create Test
                </button>
                <button className="udp-sec-cta"
                  style={{ background:`linear-gradient(135deg,${T.violet},${T.pink})`,
                    color:"white" }}
                  onClick={() => navigate(
                    `/admin/tests/new?unitId=${unitId}&ai=true`
                  )}>
                  <Ico.Spark /> Generate with AI
                </button>
              </div>
            </div>

          ) : (
            /* ── Test cards ── */
            <>
              {tests.map((test, i) => (
                <TestCard
                  key={test.id}
                  test={test}
                  onDelete={setToDelete}
                  onTogglePublish={handleTogglePublish}
                  navigate={navigate}
                  style={{ animationDelay:`${i*.07}s` }}
                />
              ))}

              {/* "Add another test" dashed row — a unit CAN have more than one */}
              <button className="udp-add-test"
                onClick={handleCreateTest}>
                <span className="udp-add-test-ico"><Ico.Plus /></span>
                Add another test
              </button>
            </>
          )}
        </div>
      </div>

      {toDelete && (
        <DeleteEntityModal
          emoji="🗑️" label="test" name={toDelete.title}
          busy={delBusy}
          onConfirm={handleDelete}
          onCancel={() => !delBusy && setToDelete(null)}
        />
      )}
    </>
  );
};

/* ════════════════════════════════════════════════════════════════════════════
   SECTION: MATERIALS
════════════════════════════════════════════════════════════════════════════ */
const MaterialsSection = ({ unitId, courseId, isExpanded, onToggle }) => {
  const [files,     setFiles]     = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const [uploading, setUploading] = useState(false);
  const [deleting,  setDeleting]  = useState(null);
  const [dragOver,  setDragOver]  = useState(false);
  const fileRef = useRef(null);

  const apiBase = typeof import.meta !== "undefined"
    ? (import.meta.env?.VITE_API_BASE_URL || "/api/v1")
    : "/api/v1";

  const loadFiles = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${apiBase}/ingest/lesson/${unitId}/files`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      setFiles(d.files || []);
    } catch (e) {
      setError(e.message || "Failed to load files");
    } finally {
      setLoading(false);
    }
  }, [unitId, apiBase]);

  useEffect(() => { loadFiles(); }, [loadFiles]);

  const handleUpload = async file => {
    if (!file || !courseId) {
      if (!courseId) toast.error("Course ID missing — cannot upload");
      return;
    }
    setUploading(true);
    try {
      const token = localStorage.getItem("token");
      const form = new FormData();
      form.append("file", file);
      form.append("lesson_id", String(unitId));
      form.append("course_id", String(courseId));
      form.append("wipe_existing", "false");
      const res = await fetch(`${apiBase}/ingest/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.detail || "Upload failed");
      }
      await loadFiles();
      toast.success("File uploaded and indexed");
    } catch (e) {
      toast.error(e.message || "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleDelete = async fname => {
    if (!window.confirm(`Remove "${fname}" from disk? Indexed chunks are kept.`)) return;
    setDeleting(fname);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${apiBase}/ingest/lesson/${unitId}/file/${encodeURIComponent(fname)}`, {
        method: "DELETE", headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      await loadFiles();
      toast.success("File removed");
    } catch {
      toast.error("Delete failed");
    } finally {
      setDeleting(null);
    }
  };

  const handleDownload = async fname => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${apiBase}/ingest/lesson/${unitId}/file/${encodeURIComponent(fname)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = fname;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      toast.error("Download failed");
    }
  };

  const totalSize = files.reduce((s, f) => s + (f.size_bytes || 0), 0);
  const indexedCount = files.filter(f => f.has_chunks).length;

  return (
    <div className="udp-section" style={{ animationDelay: ".22s" }}>
      <div className="udp-sec-hd" style={{ background: `linear-gradient(135deg,${T.teal},${T.lime})` }}>
        <button
          className={`udp-sec-hd-toggle ${isExpanded ? 'udp-sec-hd-toggle--expanded' : 'udp-sec-hd-toggle--collapsed'}`}
          onClick={onToggle}
          title={isExpanded ? "Collapse" : "Expand"}
        >
          ▼
        </button>
        <div className="udp-sec-hd-icon">📚</div>
        <div className="udp-sec-hd-title">Materials</div>
        {files.length > 0 && (
          <span className="udp-sec-hd-count">
            {files.length} file{files.length !== 1 ? "s" : ""}
            {indexedCount > 0 && ` · ${indexedCount} indexed`}
          </span>
        )}
        <button
          className="udp-sec-hd-btn"
          disabled={uploading || !courseId}
          onClick={() => fileRef.current?.click()}
        >
          {uploading
            ? <><div className="udp-spinner udp-spinner-sm" style={{ borderColor:"rgba(255,255,255,.4)", borderTopColor:"white" }}/> Uploading…</>
            : <><Ico.Upload /> Upload file</>}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.docx,.vtt,.srt,.pptx"
          style={{ display:"none" }}
          onChange={e => handleUpload(e.target.files?.[0])}
          disabled={uploading || !courseId}
        />
      </div>
      <div className={`udp-sec-body ${isExpanded ? 'udp-sec-body--expanded' : 'udp-sec-body--collapsed'}`}>
        {loading && (
          <div style={{ display:"flex", alignItems:"center", gap:10, padding:"16px 0", color:T.muted }}>
            <div className="udp-spinner" style={{ borderTopColor:T.teal }} /> Loading files…
          </div>
        )}

        {!loading && error && (
          <div style={{ display:"flex", alignItems:"center", gap:8, padding:"16px 0", color:T.red, fontSize:13 }}>
            <Ico.Warn /> {error}
            <button onClick={loadFiles} style={{ border:"none", background:"none", cursor:"pointer", color:T.violet, fontWeight:700, fontSize:13 }}>Retry</button>
          </div>
        )}

        {!loading && !error && (
          <>
            {/* Drop zone (shown when empty) */}
            {files.length === 0 && (
              <div
                className={`udp-upload-zone ${dragOver ? "drag" : ""}`}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleUpload(f); }}
                onClick={() => fileRef.current?.click()}
              >
                <div className="udp-upload-zone-icon">{uploading ? "⏳" : "📂"}</div>
                <div className="udp-upload-zone-title">{uploading ? "Uploading…" : "Drop files here or click to upload"}</div>
                <div className="udp-upload-zone-sub">
                  PDF, DOCX, VTT or SRT · Files are indexed for AI Q&A<br/>
                  {!courseId && <span style={{ color:T.red }}>⚠ Course must be saved before uploading</span>}
                </div>
              </div>
            )}

            {/* File rows */}
            {files.map((f, i) => {
              const ec = getExtCfg(f.filename);
              return (
                <div key={f.filename} className="udp-mat-row" style={{ animationDelay:`${i*.04}s`, opacity:f.file_missing?.6:1 }}>
                  <div className="udp-mat-icon" style={{ background:ec.bg }}>
                    {ec.emoji}
                  </div>
                  <div className="udp-mat-info">
                    <div className="udp-mat-name">{f.filename}</div>
                    <div className="udp-mat-meta">
                      {f.size_human && <span>{f.size_human}</span>}
                      <span className={`udp-mat-indexed udp-mat-indexed--${f.has_chunks?"yes":"no"}`}>
                        {f.has_chunks ? `✓ ${f.chunk_count} chunks indexed` : "Not indexed"}
                      </span>
                      {f.file_missing && (
                        <span style={{ color:T.amber, display:"flex", alignItems:"center", gap:3 }}>
                          <Ico.Warn /> File missing on disk
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="udp-mat-actions">
                    {!f.file_missing && (
                      <button className="udp-ico-btn dl" title="Download" onClick={() => handleDownload(f.filename)}><Ico.Dl /></button>
                    )}
                    <button
                      className="udp-ico-btn del" title="Remove from disk"
                      disabled={deleting === f.filename}
                      onClick={() => handleDelete(f.filename)}
                    >
                      {deleting === f.filename
                        ? <div className="udp-spinner udp-spinner-sm" style={{ borderColor:`${T.red}44`, borderTopColor:T.red }} />
                        : <Ico.Trash />}
                    </button>
                  </div>
                </div>
              );
            })}

            {/* Upload more strip (when files exist) */}
            {files.length > 0 && (
              <div
                style={{ display:"flex", alignItems:"center", gap:10, padding:"12px 14px", borderRadius:12, border:`2px dashed ${T.border}`, background:T.bg, cursor:"pointer", marginTop:10, transition:"all .16s" }}
                onClick={() => fileRef.current?.click()}
                onMouseEnter={e => { e.currentTarget.style.borderColor=T.teal; e.currentTarget.style.background=T.tealL; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor=T.border; e.currentTarget.style.background=T.bg; }}
              >
                <div style={{ width:34, height:34, borderRadius:10, background:T.tealL, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                  <Ico.Upload />
                </div>
                <div>
                  <div style={{ fontFamily:T.dFont, fontSize:13, fontWeight:800, color:T.text }}>Upload another file</div>
                  <div style={{ fontSize:11, color:T.muted }}>PDF, DOCX, VTT, SRT · {fmtSize(totalSize) ? `${fmtSize(totalSize)} total` : "AI Q&A source files"}</div>
                </div>
              </div>
            )}

            {/* Info note */}
            {files.length > 0 && (
              <div className="udp-mat-note">
                <span style={{ flexShrink:0, marginTop:1 }}>ℹ️</span>
                <span>
                  Removing a file only deletes it from disk — the AI can still answer from indexed chunks.
                  To remove from AI knowledge entirely, delete the chunks from the RAG panel in unit settings.
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

/* ════════════════════════════════════════════════════════════════════════════
   MAIN PAGE
════════════════════════════════════════════════════════════════════════════ */
export default function AdminUnitDetailPage() {
  const { id: unitId } = useParams();  // route uses :id  (/admin/units/:id)
  const navigate   = useNavigate();

  const [unit,    setUnit]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [toastMsg,setToastMsg]= useState(null);
  const [heroVis, setHeroVis] = useState(false);
  
  // Section expand/collapse state (default all collapsed)
  const [expandedSections, setExpandedSections] = useState({
    videos: false,
    slides: false,
    tasks: false,
    tests: false,
    materials: false,
  });

  const toggleSection = useCallback((section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  }, []);

  const showToast = useCallback(msg => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2400);
  }, []);

  useEffect(() => {
    if (!unitId) return;
    setLoading(true); setError(null);
    unitsApi.getAdminUnit(Number(unitId))
      .then(d => setUnit(d))
      .catch(e => setError(e?.message || "Failed to load unit"))
      .finally(() => setLoading(false));
    const t = setTimeout(() => setHeroVis(true), 140);
    return () => clearTimeout(t);
  }, [unitId]);

  /* ── Derived stats ── */
  const videoCount  = unit?.videos?.length  ?? 0;
  const taskCount   = unit?.tasks?.length   ?? 0;
  const testCount   = unit?.tests?.length   ?? 0;
  const totalItems  = videoCount + taskCount + testCount;

  const statusCfg = unit ? (STATUS_CFG[unit.status] || STATUS_CFG.draft) : STATUS_CFG.draft;
  const [lvBg, lvColor] = unit?.level ? (LEVEL_CLR[unit.level] || [T.violetL, T.violet]) : [T.violetL, T.violet];

  /* ── Gradient for hero — varies by unit status ── */
  const heroGrad =
    unit?.status === "published" ? `linear-gradient(135deg,${T.lime},${T.teal})`  :
    unit?.status === "scheduled" ? `linear-gradient(135deg,${T.amber},${T.orange})`:
    unit?.status === "archived"  ? `linear-gradient(135deg,#64748B,#94A3B8)`      :
    `linear-gradient(135deg,${T.violetD},${T.violet},#9333EA)`;

  /* ── Hero orbs/floaters (same system as other pages) ── */
  const ORB_DATA = [
    { w:140,h:140,bg:"#CE93D8",l:"-3%",t:"6%", dur:"13s",delay:"0s"   },
    { w:110,h:110,bg:"#4FC3F7",l:"76%",t:"4%", dur:"16s",delay:"2s"   },
    { w:160,h:160,bg:"#80DEEA",l:"-4%",t:"52%",dur:"19s",delay:"3.5s" },
    { w: 90,h: 90,bg:"#9FA8DA",l:"82%",t:"58%",dur:"11s",delay:"1.2s" },
  ];
  const FLOATERS = [
    { e:"📖",x:"7%", y:"18%",s:24,d:0,  an:"udp-float 4s ease-in-out infinite"      },
    { e:"✏️",x:"90%",y:"18%",s:20,d:.6, an:"udp-floatB 4.4s ease-in-out infinite .6s"},
    { e:"🎓",x:"5%", y:"65%",s:26,d:1.1,an:"udp-float 5s ease-in-out infinite 1.1s"  },
    { e:"⭐",x:"93%",y:"63%",s:16,d:.3, an:"udp-floatB 3.5s ease-in-out infinite .3s"},
  ];

  /* ── Loading / error ── */
  if (loading) return (
    <>
      <style>{CSS}</style>
      <div className="udp-center">
        <div className="udp-spinner" style={{ width:24, height:24 }} /> Loading unit…
      </div>
    </>
  );

  if (error || !unit) return (
    <>
      <style>{CSS}</style>
      <div className="udp-center" style={{ flexDirection:"column", gap:16, textAlign:"center" }}>
        <div style={{ fontSize:40 }}>⚠️</div>
        <div style={{ fontFamily:T.dFont, fontSize:18, fontWeight:900, color:T.text }}>{error || "Unit not found"}</div>
        <button onClick={() => navigate(-1)} style={{ border:"none", background:"none", cursor:"pointer", color:T.violet, fontWeight:700, fontSize:14 }}>← Go back</button>
      </div>
    </>
  );

  return (
    <>
      <style>{CSS}</style>

      <div className="udp-root">

        {/* ════════════════════════════════════════
            HERO HEADER
        ════════════════════════════════════════ */}
        <div className="udp-hero" style={{ background: heroGrad }}>
          {/* Rings */}
          {[420,280,170].map((s,i) => (
            <div key={i} className="udp-hero-ring" style={{
              width:s, height:s,
              animation:`udp-rotSlow ${34-i*8}s linear infinite ${i%2?"reverse":""}`,
            }}/>
          ))}
          {/* Orbs */}
          {ORB_DATA.map((o,i) => (
            <div key={i} className="udp-orb" style={{
              width:o.w, height:o.h, background:o.bg,
              left:o.l, top:o.t,
              animation:`udp-drift ${o.dur} ease-in-out infinite ${o.delay}`,
            }}/>
          ))}
          {/* Floaters */}
          {FLOATERS.map((f,i) => (
            <div key={i} className="udp-floater" style={{
              left:f.x, top:f.y, fontSize:f.s,
              opacity: heroVis ? .65 : 0,
              transition:`opacity .6s ${f.d}s`,
              animation: heroVis ? f.an : "none",
            }}>{f.e}</div>
          ))}

          {/* Breadcrumb */}
          <div className="udp-breadcrumb">
            <a onClick={() => navigate("/admin/courses")}>
              <span style={{ display:"inline-flex", alignItems:"center", gap:4 }}>
                <Ico.Back /> Courses
              </span>
            </a>
            <span className="udp-bc-sep">›</span>
            {unit.course_id && (
              <>
                <a onClick={() => navigate(`/admin/courses/${unit.course_id}`)}>
                  {unit.course_title || `Course #${unit.course_id}`}
                </a>
                <span className="udp-bc-sep">›</span>
              </>
            )}
            <span style={{ color:"rgba(255,255,255,.8)", fontWeight:700 }}>{unit.title}</span>
          </div>

          {/* Inner: title + meta + btns | stats */}
          <div className="udp-hero-inner">
            <div style={{ flex:1, minWidth:0 }}>
              <div className="udp-unit-title">{unit.title}</div>
              <div className="udp-meta-row">
                {unit.level && (
                  <span className="udp-hero-pill udp-hero-pill--ghost"
                    style={{ background:`${lvColor}2A`, borderColor:`${lvColor}55` }}>
                    {unit.level}
                  </span>
                )}
                <span className={`udp-hero-pill ${
                  unit.status === "published" ? "udp-hero-pill--lime" :
                  unit.status === "scheduled" ? "udp-hero-pill--amber" :
                  "udp-hero-pill--ghost"
                }`}>
                  {statusCfg.label}
                </span>
                {unit.is_visible_to_students === false && (
                  <span className="udp-hero-pill udp-hero-pill--ghost">🔒 Hidden</span>
                )}
              </div>
              <div className="udp-hero-btns">
                <button className="udp-hbtn udp-hbtn-white" onClick={() => navigate(`/admin/units/${unitId}/edit`)}>
                  <span className="udp-hbtn-icon"><Ico.Pencil /></span> Edit unit
                </button>
                <button className="udp-hbtn udp-hbtn-ghost" onClick={() => navigate(`/admin/courses/${unit.course_id}`)}>
                  <span className="udp-hbtn-icon"><Ico.Back /></span> Back to course
                </button>
              </div>
            </div>

            {/* Stats */}
            <div className="udp-stats-panel">
              <div className="udp-stat">
                <div className="udp-stat-n">{videoCount}</div>
                <div className="udp-stat-l">Videos</div>
              </div>
              <div className="udp-stat">
                <div className="udp-stat-n">{taskCount}</div>
                <div className="udp-stat-l">Tasks</div>
              </div>
              <div className="udp-stat">
                <div className="udp-stat-n">{testCount}</div>
                <div className="udp-stat-l">Test{testCount !== 1 ? "s" : ""}</div>
              </div>
              {totalItems > 0 && (
                <div className="udp-stat">
                  <div className="udp-stat-n">{totalItems}</div>
                  <div className="udp-stat-l">Total</div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ════════════════════════════════════════
            5 CONTENT SECTIONS
        ════════════════════════════════════════ */}
        <div className="udp-body">
          <VideosSection
            unitId={unit.id}
            navigate={navigate}
            isExpanded={expandedSections.videos}
            onToggle={() => toggleSection('videos')}
          />
          <SlidesSection
            unitId={unit.id}
            courseId={unit.course_id}
            navigate={navigate}
            isExpanded={expandedSections.slides}
            onToggle={() => toggleSection('slides')}
          />
          <TasksSection
            unitId={unit.id}
            unitTitle={unit.title}
            navigate={navigate}
            isExpanded={expandedSections.tasks}
            onToggle={() => toggleSection('tasks')}
          />
          <TestSection
            unitId={unit.id}
            unitTitle={unit.title}
            navigate={navigate}
            isExpanded={expandedSections.tests}
            onToggle={() => toggleSection('tests')}
          />
          <MaterialsSection
            unitId={unit.id}
            courseId={unit.course_id}
            isExpanded={expandedSections.materials}
            onToggle={() => toggleSection('materials')}
          />
        </div>

      </div>

      {/* Save toast */}
      {toastMsg && <div className="udp-toast">{toastMsg}</div>}
    </>
  );
}
