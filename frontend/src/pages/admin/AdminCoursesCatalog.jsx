/**
 * AdminCoursesCatalog.jsx  —  Primary teacher entry point — Courses Catalog
 *
 * Visual design: fully aligned with TeacherOnboarding.jsx
 *   ─ T color tokens  ─ Nunito 900 headings  ─ Floating-orb hero
 *   ─ Gradient lang-cards  ─ Shimmer skeleton  ─ Rich empty state
 *   ─ gen-cta New-Course banner  ─ Grid + List views  ─ Delete modal
 */
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { coursesApi }  from "../../services/api";
import toast           from "react-hot-toast";

/* ── Design tokens (mirrors TeacherOnboarding T object) ─────────────────── */
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
  ["linear-gradient(135deg,#6C35DE,#F0447C)","#6C35DE"],
  ["linear-gradient(135deg,#0099E6,#6C35DE)","#0099E6"],
  ["linear-gradient(135deg,#0DB85E,#0099E6)","#0DB85E"],
  ["linear-gradient(135deg,#F5A623,#F76D3C)","#F5A623"],
  ["linear-gradient(135deg,#F0447C,#F76D3C)","#F0447C"],
  ["linear-gradient(135deg,#00BCD4,#0DB85E)","#00BCD4"],
  ["linear-gradient(135deg,#F76D3C,#F5A623)","#F76D3C"],
  ["linear-gradient(135deg,#9333EA,#0099E6)","#9333EA"],
];

const STATUS_CFG = {
  published:{ label:"Published", bg:T.limeL,   color:T.green  },
  draft:    { label:"Draft",     bg:"#F1F5F9",  color:"#64748B"},
  scheduled:{ label:"Scheduled", bg:T.violetL,  color:T.violet },
  archived: { label:"Archived",  bg:"#F1F5F9",  color:"#64748B"},
};

const LEVEL_CLR = {
  A1:[T.tealL,T.teal], A2:[T.skyL,T.sky], B1:[T.limeL,T.lime],
  B2:[T.violetL,T.violet], C1:[T.amberL,T.amber], C2:[T.pinkL,T.pink],
  mixed:[T.orangeL,T.orange],
};

const stripHtml = h => { if(!h)return""; const d=document.createElement("div"); d.innerHTML=h; return d.textContent||""; };

/* ── CSS ──────────────────────────────────────────────────────────────────── */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Nunito:wght@700;800;900&family=Inter:wght@400;500;600;700&display=swap');

@keyframes cat-fadeUp  { from{opacity:0;transform:translateY(22px)} to{opacity:1;transform:none} }
@keyframes cat-popIn   { from{opacity:0;transform:scale(.86)} to{opacity:1;transform:scale(1)} }
@keyframes cat-drift   { 0%,100%{transform:translate(0,0) rotate(0deg)} 33%{transform:translate(14px,-10px) rotate(4deg)} 66%{transform:translate(-10px,12px) rotate(-3deg)} }
@keyframes cat-float   { 0%,100%{transform:translateY(0) rotate(0)} 50%{transform:translateY(-16px) rotate(6deg)} }
@keyframes cat-floatB  { 0%,100%{transform:translateY(0) rotate(0)} 50%{transform:translateY(-10px) rotate(-5deg)} }
@keyframes cat-shimmer { 0%{background-position:-600px 0} 100%{background-position:600px 0} }
@keyframes cat-spin    { to{transform:rotate(360deg)} }
@keyframes cat-pulse   { 0%,100%{transform:scale(1)} 50%{transform:scale(1.06)} }
@keyframes cat-rotSlow { from{transform:rotate(0)} to{transform:rotate(360deg)} }
@keyframes cat-bounce  { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-4px)} }

.cat-root {
  min-height:100%; background:${T.bg};
  font-family:${T.bFont}; color:${T.text};
  padding-bottom:80px;
}
.cat-root *,
.cat-root *::before,
.cat-root *::after { box-sizing:border-box; margin:0; padding:0; }

/* ── Hero ── */
.cat-hero {
  position:relative; overflow:hidden;
  background:linear-gradient(135deg,${T.violetD} 0%,${T.violet} 55%,#9333EA 100%);
  padding:44px 48px 40px;
  animation:cat-fadeUp .42s both;
}
.cat-hero-ring {
  position:absolute; border-radius:50%;
  border:2px solid rgba(255,255,255,.09);
  top:50%; left:50%;
  transform:translate(-50%,-50%);
  pointer-events:none;
}
.cat-orb {
  position:absolute; border-radius:50%;
  opacity:.22; filter:blur(1px); pointer-events:none;
}
.cat-floater {
  position:absolute; pointer-events:none;
  user-select:none;
  filter:drop-shadow(0 4px 12px rgba(0,0,0,.24));
}
.cat-hero-inner {
  position:relative; z-index:2;
  display:flex; align-items:flex-end;
  justify-content:space-between; gap:24px; flex-wrap:wrap;
}
.cat-eyebrow {
  display:inline-flex; align-items:center; gap:7px;
  background:rgba(255,255,255,.18); border:1.5px solid rgba(255,255,255,.28);
  border-radius:999px; padding:5px 14px 5px 10px;
  font-family:${T.dFont}; font-size:11px; font-weight:800;
  color:rgba(255,255,255,.92); letter-spacing:.08em;
  text-transform:uppercase; margin-bottom:12px; backdrop-filter:blur(4px);
}
.cat-eyebrow-dot {
  width:7px; height:7px; border-radius:50%; background:${T.lime};
  animation:cat-pulse 2s ease-in-out infinite;
}
.cat-hero-title {
  font-family:${T.dFont};
  font-size:clamp(28px,4vw,40px); font-weight:900;
  color:white; line-height:1.08; margin-bottom:8px;
  text-shadow:0 2px 14px rgba(0,0,0,.18);
}
.cat-hero-title span {
  background:linear-gradient(90deg,#fff 60%,rgba(255,255,255,.65));
  -webkit-background-clip:text; -webkit-text-fill-color:transparent;
}
.cat-hero-sub {
  font-size:14.5px; color:rgba(255,255,255,.72);
  line-height:1.65; max-width:420px; font-weight:500;
}
.cat-stats-row {
  display:flex; gap:0; margin-top:20px;
  background:rgba(255,255,255,.10); border-radius:16px;
  border:1.5px solid rgba(255,255,255,.18);
  backdrop-filter:blur(6px); overflow:hidden;
  width:fit-content;
}
.cat-stat {
  padding:14px 24px; text-align:center;
  border-right:1.5px solid rgba(255,255,255,.15);
}
.cat-stat:last-child { border-right:none; }
.cat-stat-n {
  font-family:${T.dFont}; font-size:26px; font-weight:900;
  color:white; line-height:1;
}
.cat-stat-l {
  font-size:10px; color:rgba(255,255,255,.55);
  text-transform:uppercase; letter-spacing:.08em; font-weight:600;
  margin-top:3px;
}

/* Hero CTA */
.cat-new-btn {
  display:inline-flex; align-items:center; gap:10px;
  background:white; color:${T.violet};
  font-family:${T.dFont}; font-size:15px; font-weight:900;
  padding:14px 26px; border-radius:18px; border:none;
  cursor:pointer; transition:all .2s cubic-bezier(.22,.68,0,1.3);
  box-shadow:0 8px 28px rgba(0,0,0,.22);
  white-space:nowrap; align-self:flex-end; flex-shrink:0;
  animation:cat-bounce 2.8s ease-in-out infinite 2.5s;
}
.cat-new-btn:hover {
  transform:translateY(-3px) scale(1.03);
  box-shadow:0 16px 40px rgba(0,0,0,.3); background:${T.violetL};
}
.cat-new-btn:active { transform:translateY(0) scale(.99); }
.cat-new-btn-ico {
  width:26px; height:26px; border-radius:8px;
  background:linear-gradient(135deg,${T.violet},${T.pink});
  display:flex; align-items:center; justify-content:center;
  color:white; font-size:14px; flex-shrink:0;
  transition:transform .2s;
}
.cat-new-btn:hover .cat-new-btn-ico { transform:rotate(8deg) scale(1.12); }

/* ── Toolbar ── */
.cat-toolbar {
  padding:22px 48px 0;
  display:flex; align-items:center; gap:10px; flex-wrap:wrap;
  animation:cat-fadeUp .46s .06s both;
}
.cat-search {
  display:flex; align-items:center; gap:9px;
  flex:1; min-width:220px; max-width:400px;
  background:white; border:2px solid ${T.border};
  border-radius:14px; padding:10px 16px;
  transition:border-color .16s, box-shadow .16s;
}
.cat-search:focus-within {
  border-color:${T.violet}; box-shadow:0 0 0 3px ${T.violetL};
}
.cat-search input {
  flex:1; border:none; outline:none;
  font-family:${T.bFont}; font-size:14px; color:${T.text}; background:transparent;
}
.cat-search input::placeholder { color:${T.mutedL}; }
.cat-clear-btn {
  border:none; background:none; cursor:pointer;
  color:${T.mutedL}; font-size:18px; line-height:1; padding:0;
  transition:color .13s;
}
.cat-clear-btn:hover { color:${T.sub}; }

.cat-select {
  background:white; border:2px solid ${T.border}; border-radius:12px;
  padding:10px 32px 10px 14px;
  font-family:${T.bFont}; font-size:13px; font-weight:500; color:${T.sub};
  outline:none; cursor:pointer; transition:border-color .15s;
  -webkit-appearance:none; appearance:none;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12' fill='none'%3E%3Cpath d='M2 4l4 4 4-4' stroke='%239188C4' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  background-repeat:no-repeat; background-position:right 12px center;
}
.cat-select:focus { border-color:${T.violet}; box-shadow:0 0 0 3px ${T.violetL}; }

.cat-view-toggle {
  display:flex; background:white;
  border:2px solid ${T.border}; border-radius:12px; overflow:hidden; flex-shrink:0;
}
.cat-vbtn {
  padding:9px 12px; border:none; background:transparent;
  color:${T.mutedL}; cursor:pointer; transition:all .14s;
  display:flex; align-items:center;
}
.cat-vbtn.on { background:${T.violetL}; color:${T.violet}; }
.cat-vbtn:hover:not(.on) { background:${T.bg}; color:${T.sub}; }

.cat-result-count {
  padding:8px 48px 0;
  font-size:12px; color:${T.muted}; font-weight:600;
  animation:cat-fadeUp .48s .08s both;
}

/* ── Grid ── */
.cat-grid {
  padding:20px 48px;
  display:grid;
  grid-template-columns:repeat(auto-fill,minmax(296px,1fr));
  gap:22px;
}
.cat-list {
  padding:20px 48px;
  display:flex; flex-direction:column; gap:12px;
}

/* ── CARD (grid) ── */
.cat-card {
  background:white; border-radius:24px;
  border:2px solid ${T.border}; overflow:hidden;
  cursor:pointer; display:flex; flex-direction:column;
  position:relative;
  transition:all .22s cubic-bezier(.22,.68,0,1.2);
  animation:cat-popIn .38s both;
}
.cat-card:hover {
  transform:translateY(-6px);
  box-shadow:0 20px 50px rgba(108,53,222,.16);
  border-color:rgba(108,53,222,.35);
}
.cat-card:active { transform:translateY(-2px); }

.cat-card-banner {
  height:104px; position:relative; overflow:hidden; flex-shrink:0;
}
.cat-card-banner-img {
  width:100%; height:100%; object-fit:cover; display:block;
}
.cat-card-banner-overlay {
  position:absolute; inset:0; background:rgba(0,0,0,.14);
}
.cat-card-badges {
  position:absolute; top:10px; right:12px;
  display:flex; gap:6px; align-items:center; z-index:1;
}
.cat-badge {
  font-size:10px; font-weight:800; padding:3px 9px;
  border-radius:8px; letter-spacing:.04em;
  backdrop-filter:blur(4px); border:1px solid rgba(255,255,255,.25);
}
.cat-card-initial {
  position:absolute; bottom:-20px; left:18px;
  width:54px; height:54px; border-radius:17px;
  border:3px solid white;
  display:flex; align-items:center; justify-content:center;
  font-family:${T.dFont}; font-size:22px; font-weight:900; color:white;
  box-shadow:0 6px 20px rgba(0,0,0,.18); z-index:2;
}
.cat-card-body {
  padding:28px 20px 12px;
  flex:1; display:flex; flex-direction:column; gap:6px;
}
.cat-level-pill {
  font-size:11px; font-weight:800; padding:2px 10px;
  border-radius:999px; display:inline-flex; align-items:center;
  gap:4px; width:fit-content; margin-bottom:2px;
}
.cat-card-title {
  font-family:${T.dFont}; font-size:17px; font-weight:900;
  color:${T.text}; line-height:1.25;
  display:-webkit-box; -webkit-line-clamp:2;
  -webkit-box-orient:vertical; overflow:hidden;
}
.cat-card-desc {
  font-size:12.5px; color:${T.muted}; line-height:1.6;
  display:-webkit-box; -webkit-line-clamp:2;
  -webkit-box-orient:vertical; overflow:hidden;
}
.cat-progress-wrap { margin-top:8px; }
.cat-progress-hd {
  display:flex; justify-content:space-between;
  font-size:11px; font-weight:700; color:${T.muted}; margin-bottom:5px;
}
.cat-progress-hd strong { color:${T.text}; }
.cat-track {
  height:5px; background:${T.border};
  border-radius:999px; overflow:hidden;
}
.cat-fill {
  height:100%; border-radius:999px;
  background:linear-gradient(90deg,${T.lime},${T.teal});
  transition:width .5s cubic-bezier(.22,.68,0,1.2);
}
.cat-card-footer {
  padding:10px 20px 16px;
  display:flex; align-items:center; justify-content:space-between;
  border-top:1.5px solid ${T.border}; gap:10px;
}
.cat-chip-row { display:flex; gap:7px; flex-wrap:wrap; align-items:center; }
.cat-chip {
  display:inline-flex; align-items:center; gap:4px;
  font-size:11px; font-weight:600; color:${T.sub};
  background:${T.bg}; padding:3px 9px;
  border-radius:8px; border:1.5px solid ${T.border};
  white-space:nowrap;
}
.cat-card-actions {
  display:flex; gap:4px; opacity:0;
  transition:opacity .15s; flex-shrink:0;
}
.cat-card:hover .cat-card-actions { opacity:1; }

/* ── ROW (list) ── */
.cat-row {
  background:white; border-radius:18px;
  border:2px solid ${T.border};
  display:flex; align-items:center; gap:16px;
  padding:14px 18px; cursor:pointer;
  transition:all .18s;
  animation:cat-fadeUp .34s both;
}
.cat-row:hover {
  border-color:rgba(108,53,222,.35);
  box-shadow:0 6px 24px rgba(108,53,222,.12);
  transform:translateX(3px);
}
.cat-row-swatch {
  width:46px; height:46px; border-radius:14px; flex-shrink:0;
  display:flex; align-items:center; justify-content:center;
  font-family:${T.dFont}; font-size:18px; font-weight:900; color:white;
}
.cat-row-info { flex:1; min-width:0; }
.cat-row-title {
  font-family:${T.dFont}; font-size:15px; font-weight:800; color:${T.text};
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-bottom:3px;
}
.cat-row-meta {
  display:flex; gap:10px; align-items:center; flex-wrap:wrap;
}
.cat-row-meta-item {
  font-size:12px; color:${T.muted}; font-weight:500;
  display:flex; align-items:center; gap:4px;
}
.cat-row-prog { width:100px; flex-shrink:0; }
.cat-row-status {
  font-size:11px; font-weight:700;
  padding:4px 11px; border-radius:8px; white-space:nowrap; flex-shrink:0;
}
.cat-row-actions {
  display:flex; gap:4px; flex-shrink:0;
  opacity:0; transition:opacity .15s;
}
.cat-row:hover .cat-row-actions { opacity:1; }

/* ── Icon button ── */
.cat-ico-btn {
  width:30px; height:30px; border-radius:10px;
  border:1.5px solid ${T.border}; background:white;
  color:${T.sub};
  display:flex; align-items:center; justify-content:center;
  cursor:pointer; transition:all .14s;
}
.cat-ico-btn:hover { background:${T.violetL}; border-color:${T.violet}; color:${T.violet}; }
.cat-ico-btn.del:hover { background:${T.redL}; border-color:${T.red}; color:${T.red}; }

/* ── Loading skeleton ── */
.cat-skeleton {
  border-radius:24px; overflow:hidden;
  background:white; border:2px solid ${T.border};
  animation:cat-popIn .38s both;
}
.cat-skel-banner {
  height:104px;
  background:linear-gradient(90deg,${T.violetL} 25%,#f0ecff 50%,${T.violetL} 75%);
  background-size:600px 100%;
  animation:cat-shimmer 1.6s infinite linear;
}
.cat-skel-body { padding:28px 20px 14px; }
.cat-skel-line {
  border-radius:8px; margin-bottom:10px;
  background:linear-gradient(90deg,${T.violetL} 25%,#f0ecff 50%,${T.violetL} 75%);
  background-size:600px 100%;
  animation:cat-shimmer 1.6s infinite linear;
}

/* ── Empty state ── */
.cat-empty {
  min-height:68vh; display:flex; align-items:center;
  justify-content:center; padding:48px;
  position:relative; overflow:hidden;
  animation:cat-fadeUp .45s both;
}
.cat-empty-floater {
  position:absolute; pointer-events:none; user-select:none;
  filter:drop-shadow(0 4px 10px rgba(0,0,0,.12));
  opacity:0; transition:opacity .7s;
}
.cat-empty-floater.v { opacity:.65; }
.cat-empty-card {
  position:relative; z-index:2;
  background:white; border:2px solid ${T.border};
  border-radius:32px; padding:52px 52px 44px;
  text-align:center; max-width:520px; width:100%;
  box-shadow:0 32px 80px rgba(108,53,222,.12);
  animation:cat-popIn .5s .1s both;
}
.cat-empty-orb {
  width:96px; height:96px; border-radius:30px;
  background:linear-gradient(135deg,${T.violet},${T.pink});
  display:flex; align-items:center; justify-content:center; font-size:44px;
  margin:0 auto 28px;
  box-shadow:0 16px 48px rgba(108,53,222,.4);
  animation:cat-float 4s ease-in-out infinite;
}
.cat-empty-badge {
  display:inline-flex; align-items:center; gap:6px;
  background:linear-gradient(90deg,${T.violet},${T.pink});
  border-radius:999px; padding:5px 16px;
  font-family:${T.dFont}; font-size:11px; font-weight:900;
  color:white; letter-spacing:.1em; text-transform:uppercase; margin-bottom:18px;
}
.cat-empty-title {
  font-family:${T.dFont}; font-size:clamp(24px,4vw,32px); font-weight:900;
  color:${T.text}; line-height:1.15; margin-bottom:12px;
}
.cat-empty-title span {
  background:linear-gradient(90deg,${T.violet},${T.pink},${T.orange});
  -webkit-background-clip:text; -webkit-text-fill-color:transparent;
}
.cat-empty-sub {
  font-size:15px; color:${T.sub}; line-height:1.7;
  max-width:360px; margin:0 auto 28px;
}
.cat-empty-feats {
  display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:30px;
}
.cat-empty-feat {
  border-radius:16px; padding:15px 12px;
  display:flex; align-items:center; gap:10px;
  font-family:${T.dFont}; font-size:12px; font-weight:800;
  color:white; line-height:1.3;
  box-shadow:0 4px 16px rgba(0,0,0,.14);
}
.cat-empty-cta {
  width:100%; border:none; border-radius:18px;
  background:linear-gradient(135deg,${T.violet},${T.pink});
  color:white; font-family:${T.dFont}; font-size:17px; font-weight:900;
  padding:18px 32px; cursor:pointer;
  box-shadow:0 12px 36px rgba(108,53,222,.42);
  display:flex; align-items:center; justify-content:center; gap:10px;
  transition:all .2s cubic-bezier(.22,.68,0,1.2);
  animation:cat-bounce 2.6s ease-in-out infinite 2.2s;
}
.cat-empty-cta:hover {
  transform:translateY(-3px) scale(1.02);
  box-shadow:0 18px 44px rgba(108,53,222,.55);
}
.cat-empty-note { margin-top:12px; font-size:12px; color:${T.muted}; }

/* no-results */
.cat-no-res {
  display:flex; flex-direction:column;
  align-items:center; padding:60px 48px;
  text-align:center; animation:cat-fadeUp .4s both;
}
.cat-no-res-emoji { font-size:48px; margin-bottom:16px; opacity:.5; }
.cat-no-res-title { font-family:${T.dFont}; font-size:20px; font-weight:900; color:${T.text}; margin-bottom:8px; }
.cat-no-res-sub   { font-size:13px; color:${T.muted}; }

/* delete modal */
.cat-modal-bg {
  position:fixed; inset:0; z-index:1000;
  background:rgba(26,16,53,.55); backdrop-filter:blur(4px);
  display:flex; align-items:center; justify-content:center;
  padding:24px; animation:cat-fadeUp .2s both;
}
.cat-modal {
  background:white; border-radius:24px; padding:36px;
  max-width:380px; width:100%;
  box-shadow:0 32px 80px rgba(0,0,0,.22);
  animation:cat-popIn .22s both;
}

/* footer nudge */
.cat-more-btn {
  display:inline-flex; align-items:center; gap:9px;
  padding:12px 26px; border-radius:16px;
  background:${T.violetL}; color:${T.violet};
  font-family:${T.dFont}; font-size:14px; font-weight:800;
  cursor:pointer; transition:all .18s;
  border:2px dashed rgba(108,53,222,.4);
}
.cat-more-btn:hover {
  background:${T.violet}; color:white;
  border-color:transparent; box-shadow:0 8px 24px rgba(108,53,222,.44);
}
`;

/* ── Micro-icons ─────────────────────────────────────────────────────────── */
const I = {
  Search:  ()=><svg width="16" height="16" viewBox="0 0 20 20" fill="none"><circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.7"/><path d="M14 14l4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>,
  Plus:    ()=><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>,
  Grid:    ()=><svg width="15" height="15" viewBox="0 0 16 16" fill="none"><rect x="1" y="1" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5"/><rect x="9" y="1" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5"/><rect x="1" y="9" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5"/><rect x="9" y="9" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5"/></svg>,
  List:    ()=><svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M3 4h10M3 8h10M3 12h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>,
  Pencil:  ()=><svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M11.5 2.5l2 2L5 13H3v-2L11.5 2.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg>,
  Trash:   ()=><svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M2 4h12M5 4V2.5h6V4M5 4l.5 9h5L11 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  Open:    ()=><svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M9 3h4v4M13 3l-7 7M3 5H2a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  Units:   ()=><svg width="11" height="11" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.4"/><path d="M5 6h6M5 9h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>,
  Students:()=><svg width="11" height="11" viewBox="0 0 16 16" fill="none"><circle cx="6" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.4"/><path d="M1 14c0-2.76 2.24-5 5-5s5 2.24 5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><path d="M11 3a2.5 2.5 0 0 1 0 5M15 14c0-2.2-1.5-4.08-3.5-4.72" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>,
  Spark:   ()=><svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M8 1l1.5 4.5H14L10.5 8 12 12.5 8 10l-4 2.5 1.5-4.5L2 5.5h4.5L8 1Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg>,
};

/* ── Skeleton card ───────────────────────────────────────────────────────── */
const Skel = ({i}) => (
  <div className="cat-skeleton" style={{animationDelay:`${i*.06}s`}}>
    <div className="cat-skel-banner" style={{animationDelay:`${i*.06}s`}}/>
    <div className="cat-skel-body">
      <div className="cat-skel-line" style={{height:10,width:"38%",animationDelay:`${i*.06+.04}s`}}/>
      <div className="cat-skel-line" style={{height:18,width:"80%",animationDelay:`${i*.06+.07}s`}}/>
      <div className="cat-skel-line" style={{height:12,width:"62%",animationDelay:`${i*.06+.10}s`}}/>
      <div className="cat-skel-line" style={{height:5,width:"100%",borderRadius:999,marginTop:14,animationDelay:`${i*.06+.13}s`}}/>
    </div>
    <div style={{padding:"10px 20px 14px",borderTop:`1.5px solid ${T.border}`,display:"flex",gap:8}}>
      <div className="cat-skel-line" style={{height:24,width:60,borderRadius:8,marginBottom:0}}/>
      <div className="cat-skel-line" style={{height:24,width:50,borderRadius:8,marginBottom:0}}/>
    </div>
  </div>
);

/* ── Empty state ─────────────────────────────────────────────────────────── */
const EmptyState = ({onNew}) => {
  const [v, setV] = useState(false);
  useEffect(()=>{ const t=setTimeout(()=>setV(true),120); return()=>clearTimeout(t); },[]);
  const FLOATS = [
    {e:"📚",x:"4%", y:"8%", s:42,d:0},   {e:"✏️",x:"90%",y:"12%",s:32,d:.5},
    {e:"🎯",x:"2%", y:"68%",s:38,d:1.1}, {e:"🌍",x:"88%",y:"70%",s:34,d:.3},
    {e:"💬",x:"46%",y:"3%", s:30,d:.8},  {e:"📝",x:"80%",y:"44%",s:28,d:1.4},
    {e:"⚡",x:"14%",y:"84%",s:28,d:.6},  {e:"🎓",x:"76%",y:"84%",s:32,d:1.0},
  ];
  const FEATS = [
    {e:"🧠",l:"AI course builder",  g:`linear-gradient(135deg,${T.violet},${T.pink})`},
    {e:"🚀",l:"Lesson by lesson",    g:`linear-gradient(135deg,${T.sky},${T.violet})`},
    {e:"📊",l:"Live analytics",      g:`linear-gradient(135deg,${T.lime},${T.sky})`},
    {e:"📝",l:"Auto test generator", g:`linear-gradient(135deg,${T.amber},${T.orange})`},
  ];
  return (
    <div className="cat-empty">
      {FLOATS.map((f,i)=>(
        <div key={i} className={`cat-empty-floater ${v?"v":""}`}
          style={{left:f.x,top:f.y,fontSize:f.s,transition:`opacity .7s ${f.d}s`,
            animation:v?`${i%2?"cat-floatB":"cat-float"} ${3.4+i*.4}s ease-in-out infinite ${f.d}s`:"none"}}>
          {f.e}
        </div>
      ))}
      <div className="cat-empty-card">
        <div className="cat-empty-orb">🎓</div>
        <div className="cat-empty-badge"><I.Spark/> Welcome to your studio</div>
        <h2 className="cat-empty-title">
          Build your first<br/>
          <span>AI-powered course</span>
        </h2>
        <p className="cat-empty-sub">
          Create engaging language courses with AI-generated slides, tasks
          and tests — <strong style={{color:T.text}}>lesson by lesson</strong>, at your own pace.
        </p>
        <div className="cat-empty-feats">
          {FEATS.map((f,i)=>(
            <div key={f.l} className="cat-empty-feat" style={{background:f.g,
              opacity:v?1:0,transform:v?"scale(1)":"scale(.86)",
              transition:`all .44s cubic-bezier(.22,.68,0,1.3) ${.1+i*.06}s`}}>
              <span style={{fontSize:24}}>{f.e}</span><span>{f.l}</span>
            </div>
          ))}
        </div>
        <button className="cat-empty-cta" onClick={onNew}>✨ Create First Course</button>
        <p className="cat-empty-note">Takes ~2 minutes · AI does the heavy lifting</p>
      </div>
    </div>
  );
};

/* ── Course card (grid) ──────────────────────────────────────────────────── */
const Card = ({course, idx, onOpen, onEdit, onDelete}) => {
  const [grad, accent] = GRADS[idx % GRADS.length];
  const st = STATUS_CFG[course.status] || STATUS_CFG.draft;
  const [lvBg,lvColor] = LEVEL_CLR[course.level] || [T.violetL, T.violet];
  const apiBase = typeof import.meta !== "undefined"
    ? (import.meta.env?.VITE_API_BASE_URL || "http://localhost:8000/api/v1")
    : "http://localhost:8000/api/v1";
  let thumb = null;
  if(course.thumbnail_url) thumb = course.thumbnail_url;
  else if(course.thumbnail_path) thumb = `${apiBase}/static/thumbnails/${course.thumbnail_path.split("/").pop()}`;
  const unitsDone  = course.published_units_count ?? 0;
  const unitsTotal = course.units_count ?? 0;
  const pct = unitsTotal > 0 ? Math.round((unitsDone/unitsTotal)*100) : 0;
  const initial = (course.title||"?")[0].toUpperCase();
  return (
    <div className="cat-card" style={{animationDelay:`${idx*.05}s`}} onClick={()=>onOpen(course.id)}>
      <div className="cat-card-banner" style={{background:grad}}>
        {thumb && (
          <>
            <img className="cat-card-banner-img" src={thumb} alt={course.title}
              onError={e=>{e.target.style.display="none";}}/>
            <div className="cat-card-banner-overlay"/>
          </>
        )}
        <div className="cat-card-badges">
          {course.level && <span className="cat-badge" style={{background:"rgba(255,255,255,.22)",color:"white"}}>{course.level}</span>}
          <span className="cat-badge" style={{background:st.bg,color:st.color}}>{st.label}</span>
        </div>
        <div className="cat-card-initial" style={{background:grad}}>{initial}</div>
      </div>
      <div className="cat-card-body">
        {course.level && <div className="cat-level-pill" style={{background:lvBg,color:lvColor}}>{course.level}</div>}
        <div className="cat-card-title">{course.title}</div>
        {course.description && <div className="cat-card-desc">{stripHtml(course.description)}</div>}
        {unitsTotal > 0 && (
          <div className="cat-progress-wrap">
            <div className="cat-progress-hd">
              <span>Units</span>
              <strong>{unitsDone}/{unitsTotal} published</strong>
            </div>
            <div className="cat-track"><div className="cat-fill" style={{width:`${pct}%`}}/></div>
          </div>
        )}
      </div>
      <div className="cat-card-footer">
        <div className="cat-chip-row">
          {unitsTotal > 0 && <span className="cat-chip"><I.Units/> {unitsTotal} unit{unitsTotal!==1?"s":""}</span>}
          {(course.enrolled_students_count??0) > 0 && <span className="cat-chip"><I.Students/> {course.enrolled_students_count}</span>}
        </div>
        <div className="cat-card-actions">
          <button className="cat-ico-btn" title="Open"     onClick={e=>{e.stopPropagation();onOpen(course.id);}}><I.Open/></button>
          <button className="cat-ico-btn" title="Settings" onClick={e=>{e.stopPropagation();onEdit(course.id);}}><I.Pencil/></button>
          <button className="cat-ico-btn del" title="Delete" onClick={e=>{e.stopPropagation();onDelete(course);}}><I.Trash/></button>
        </div>
      </div>
    </div>
  );
};

/* ── Course row (list) ───────────────────────────────────────────────────── */
const Row = ({course, idx, onOpen, onEdit, onDelete}) => {
  const [grad] = GRADS[idx % GRADS.length];
  const st = STATUS_CFG[course.status] || STATUS_CFG.draft;
  const pct = (course.units_count??0) > 0
    ? Math.round(((course.published_units_count??0)/course.units_count)*100) : 0;
  return (
    <div className="cat-row" style={{animationDelay:`${idx*.04}s`}} onClick={()=>onOpen(course.id)}>
      <div className="cat-row-swatch" style={{background:grad}}>
        {(course.title||"?")[0].toUpperCase()}
      </div>
      <div className="cat-row-info">
        <div className="cat-row-title">{course.title}</div>
        <div className="cat-row-meta">
          {course.level && <span className="cat-row-meta-item" style={{fontWeight:700,color:T.violet}}>{course.level}</span>}
          {(course.units_count??0) > 0 && <span className="cat-row-meta-item"><I.Units/> {course.units_count} units</span>}
          {(course.enrolled_students_count??0) > 0 && <span className="cat-row-meta-item"><I.Students/> {course.enrolled_students_count} students</span>}
        </div>
      </div>
      {(course.units_count??0) > 0 && (
        <div className="cat-row-prog">
          <div style={{fontSize:10,color:T.muted,fontWeight:700,marginBottom:4,textAlign:"right"}}>{pct}%</div>
          <div className="cat-track"><div className="cat-fill" style={{width:`${pct}%`}}/></div>
        </div>
      )}
      <span className="cat-row-status" style={{background:st.bg,color:st.color}}>{st.label}</span>
      <div className="cat-row-actions">
        <button className="cat-ico-btn" onClick={e=>{e.stopPropagation();onEdit(course.id);}}><I.Pencil/></button>
        <button className="cat-ico-btn del" onClick={e=>{e.stopPropagation();onDelete(course);}}><I.Trash/></button>
      </div>
    </div>
  );
};

/* ── Delete modal ────────────────────────────────────────────────────────── */
const DelModal = ({course, busy, onConfirm, onCancel}) => (
  <div className="cat-modal-bg" onClick={onCancel}>
    <div className="cat-modal" onClick={e=>e.stopPropagation()}>
      <div style={{fontSize:40,textAlign:"center",marginBottom:16}}>🗑️</div>
      <h3 style={{fontFamily:T.dFont,fontSize:20,fontWeight:900,color:T.text,textAlign:"center",marginBottom:8}}>
        Delete course?
      </h3>
      <p style={{fontSize:13,color:T.sub,textAlign:"center",lineHeight:1.7,marginBottom:24}}>
        <strong style={{color:T.text}}>"{course.title}"</strong> and all its content will be
        permanently removed. This cannot be undone.
      </p>
      <div style={{display:"flex",gap:10}}>
        <button
          style={{flex:1,padding:"12px",borderRadius:14,border:`2px solid ${T.border}`,background:"white",color:T.sub,fontFamily:T.dFont,fontSize:14,fontWeight:800,cursor:"pointer"}}
          onClick={onCancel}>Cancel</button>
        <button
          disabled={busy}
          style={{flex:1,padding:"12px",borderRadius:14,border:"none",background:"linear-gradient(135deg,#EF4444,#DC2626)",color:"white",fontFamily:T.dFont,fontSize:14,fontWeight:900,cursor:busy?"not-allowed":"pointer",opacity:busy?.65:1,boxShadow:"0 6px 20px rgba(239,68,68,.4)"}}
          onClick={onConfirm}>{busy?"Deleting…":"Delete"}</button>
      </div>
    </div>
  </div>
);

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════════════════════ */
export default function AdminCoursesCatalog() {
  const navigate = useNavigate();
  const [courses,  setCourses]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [query,    setQuery]    = useState("");
  const [level,    setLevel]    = useState("");
  const [status,   setStatus]   = useState("");
  const [view,     setView]     = useState("grid");
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [heroVis,  setHeroVis]  = useState(false);
  const searchRef = useRef(null);

  useEffect(()=>{
    coursesApi.getAdminCourses()
      .then(d=>setCourses(Array.isArray(d)?d:[]))
      .catch(()=>toast.error("Failed to load courses"))
      .finally(()=>setLoading(false));
    const t=setTimeout(()=>setHeroVis(true),200);
    return()=>clearTimeout(t);
  },[]);

  useEffect(()=>{
    const fn=e=>{
      if((e.metaKey||e.ctrlKey)&&e.key==="k"){e.preventDefault();searchRef.current?.focus();}
    };
    window.addEventListener("keydown",fn);
    return()=>window.removeEventListener("keydown",fn);
  },[]);

  const filtered = useMemo(()=>{
    const q=query.toLowerCase().trim();
    return courses.filter(c=>
      (!q||c.title.toLowerCase().includes(q)||stripHtml(c.description||"").toLowerCase().includes(q))&&
      (!level||c.level===level)&&(!status||c.status===status)
    );
  },[courses,query,level,status]);

  const published     = courses.filter(c=>c.status==="published").length;
  const totalStudents = courses.reduce((s,c)=>s+(c.enrolled_students_count||0),0);
  const totalUnits    = courses.reduce((s,c)=>s+(c.units_count||0),0);

  const handleOpen   = id => navigate(`/admin/courses/${id}`);
  const handleEdit   = id => navigate(`/admin/courses/${id}/edit`);
  const handleNew    = ()  => navigate("/admin/courses/builder");
  const handleDelete = async () => {
    if(!toDelete) return;
    setDeleting(true);
    try {
      await coursesApi.deleteCourse(toDelete.id);
      setCourses(c=>c.filter(x=>x.id!==toDelete.id));
      toast.success("Course deleted");
    } catch { toast.error("Failed to delete course"); }
    finally { setDeleting(false); setToDelete(null); }
  };

  const isFiltered = !!(query||level||status);
  const HERO_ORB_DATA = [
    {w:180,h:180,bg:"#CE93D8",l:"-4%",t:"8%", dur:"12s",delay:"0s"},
    {w:140,h:140,bg:"#4FC3F7",l:"72%",t:"5%", dur:"15s",delay:"2s"},
    {w:200,h:200,bg:"#80DEEA",l:"-6%",t:"52%",dur:"18s",delay:"4s"},
    {w:120,h:120,bg:"#9FA8DA",l:"78%",t:"56%",dur:"11s",delay:"1s"},
  ];
  const HERO_FLOATS = [
    {e:"📖",x:"7%", y:"14%",s:32,d:0,  an:"cat-float 3.8s ease-in-out infinite"},
    {e:"✏️",x:"88%",y:"16%",s:26,d:.6, an:"cat-floatB 4.2s ease-in-out infinite .6s"},
    {e:"🎓",x:"4%", y:"62%",s:36,d:1.2,an:"cat-float 5s ease-in-out infinite 1.2s"},
    {e:"⭐",x:"92%",y:"64%",s:22,d:.3, an:"cat-floatB 3.5s ease-in-out infinite .3s"},
    {e:"💡",x:"47%",y:"6%", s:28,d:.9, an:"cat-float 4.6s ease-in-out infinite .9s"},
    {e:"🏆",x:"76%",y:"44%",s:26,d:1.5,an:"cat-floatB 4s ease-in-out infinite 1.5s"},
  ];

  return (
    <>
      <style>{CSS}</style>
      <div className="cat-root">

        {/* ── HERO ── */}
        <div className="cat-hero">
          {[560,380,240].map((s,i)=>(
            <div key={i} className="cat-hero-ring" style={{
              width:s,height:s,
              animation:`cat-rotSlow ${38-i*8}s linear infinite ${i%2?"reverse":""}`,
            }}/>
          ))}
          {HERO_ORB_DATA.map((o,i)=>(
            <div key={i} className="cat-orb" style={{
              width:o.w,height:o.h,background:o.bg,left:o.l,top:o.t,
              animation:`cat-drift ${o.dur} ease-in-out infinite ${o.delay}`,
            }}/>
          ))}
          {HERO_FLOATS.map((f,i)=>(
            <div key={i} className="cat-floater" style={{
              left:f.x,top:f.y,fontSize:f.s,
              opacity:heroVis?.72:0,
              transition:`opacity .7s ${f.d}s`,
              animation:heroVis?f.an:"none",
            }}>{f.e}</div>
          ))}

          <div className="cat-hero-inner">
            <div>
              <div className="cat-eyebrow">
                <span className="cat-eyebrow-dot"/>
                Teacher Studio
              </div>
              <h1 className="cat-hero-title">
                <span>Your Course Catalog</span>
              </h1>
              <p className="cat-hero-sub">
                Build, organise and publish AI-powered learning experiences for your students.
              </p>
              {!loading && courses.length > 0 && (
                <div className="cat-stats-row">
                  {[
                    {n:courses.length, l:"Courses"},
                    {n:published,      l:"Published"},
                    {n:totalUnits,     l:"Units"},
                    {n:totalStudents,  l:"Students"},
                  ].map(s=>(
                    <div key={s.l} className="cat-stat">
                      <div className="cat-stat-n">{s.n}</div>
                      <div className="cat-stat-l">{s.l}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button className="cat-new-btn" onClick={handleNew}>
              <span className="cat-new-btn-ico"><I.Plus/></span>
              New Course
            </button>
          </div>
        </div>

        {/* ── TOOLBAR ── */}
        {(courses.length > 0 || isFiltered) && (
          <div className="cat-toolbar">
            <div className="cat-search">
              <I.Search/>
              <input ref={searchRef} value={query}
                onChange={e=>setQuery(e.target.value)}
                placeholder="Search courses…" />
              {query && (
                <button className="cat-clear-btn" onClick={()=>setQuery("")}>×</button>
              )}
            </div>
            <select className="cat-select" value={level} onChange={e=>setLevel(e.target.value)}>
              <option value="">All levels</option>
              {["A1","A2","B1","B2","C1","C2","mixed"].map(l=>(
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
            <select className="cat-select" value={status} onChange={e=>setStatus(e.target.value)}>
              <option value="">All statuses</option>
              <option value="published">Published</option>
              <option value="draft">Draft</option>
              <option value="scheduled">Scheduled</option>
              <option value="archived">Archived</option>
            </select>
            <div className="cat-view-toggle">
              <button className={`cat-vbtn ${view==="grid"?"on":""}`} onClick={()=>setView("grid")} title="Grid"><I.Grid/></button>
              <button className={`cat-vbtn ${view==="list"?"on":""}`} onClick={()=>setView("list")} title="List"><I.List/></button>
            </div>
          </div>
        )}

        {!loading && courses.length > 0 && (
          <div className="cat-result-count">
            {isFiltered ? `${filtered.length} of ${courses.length} courses` : `${courses.length} course${courses.length!==1?"s":""}`}
          </div>
        )}

        {/* ── CONTENT ── */}
        {loading && (
          <div className="cat-grid">
            {[...Array(6)].map((_,i)=><Skel key={i} i={i}/>)}
          </div>
        )}

        {!loading && courses.length === 0 && <EmptyState onNew={handleNew}/>}

        {!loading && courses.length > 0 && filtered.length === 0 && (
          <div className="cat-no-res">
            <div className="cat-no-res-emoji">🔍</div>
            <div className="cat-no-res-title">No courses match</div>
            <div className="cat-no-res-sub">Try adjusting your search or clearing the filters.</div>
            <button style={{marginTop:18,border:"none",background:T.violetL,color:T.violet,fontFamily:T.dFont,fontSize:13,fontWeight:800,padding:"9px 20px",borderRadius:12,cursor:"pointer"}}
              onClick={()=>{setQuery("");setLevel("");setStatus("");}}>
              Clear filters
            </button>
          </div>
        )}

        {!loading && filtered.length > 0 && view === "grid" && (
          <div className="cat-grid">
            {filtered.map((c,i)=>(
              <Card key={c.id} course={c} idx={i}
                onOpen={handleOpen} onEdit={handleEdit} onDelete={setToDelete}/>
            ))}
          </div>
        )}

        {!loading && filtered.length > 0 && view === "list" && (
          <div className="cat-list">
            {filtered.map((c,i)=>(
              <Row key={c.id} course={c} idx={i}
                onOpen={handleOpen} onEdit={handleEdit} onDelete={setToDelete}/>
            ))}
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div style={{padding:"8px 48px 24px",display:"flex",justifyContent:"center"}}>
            <button className="cat-more-btn" onClick={handleNew}>
              <I.Plus/> Create another course
            </button>
          </div>
        )}

      </div>

      {toDelete && (
        <DelModal
          course={toDelete} busy={deleting}
          onConfirm={handleDelete} onCancel={()=>!deleting&&setToDelete(null)}/>
      )}
    </>
  );
}
