/**
 * AdminCoursesCatalog.jsx  —  Courses Catalog
 * Visual: ProgressMe-style — white container with side margins,
 *         uniform square cards, no hover action buttons, no badges.
 */
import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { coursesApi } from "../../services/api";
import toast from "react-hot-toast";
import CreateCourseModal from "./components/CreateCourseModal";
import { useTeacherClassroomTransition } from "../../contexts/TeacherClassroomTransitionContext";

/* ── Design tokens ───────────────────────────────────────────────────────── */
const T = {
  violet:"#6C6FEF", violetL:"#EEF0FE", violetD:"#4F52C2",
  pink:"#F0447C",
  lime:"#0DB85E",   limeL:"#DCFCE7",
  sky:"#0099E6",    skyL:"#DAEEFF",
  amber:"#F5A623",  amberL:"#FEF3C7",
  orange:"#F76D3C", orangeL:"#FFECE5",
  teal:"#00BCD4",   tealL:"#E0F7FA",
  white:"#FFFFFF",
  bg:"#F7F7FA",     border:"#E8E8F0",
  text:"#18181B",   sub:"#52525B",
  muted:"#A1A1AA",  mutedL:"#D4D4D8",
  green:"#16A34A",  greenL:"#DCFCE7",
  red:"#EF4444",    redL:"#FEE2E2",
  dFont:"'Nunito', system-ui, sans-serif",
  bFont:"'Inter', system-ui, sans-serif",
};

/* soft pastel fills for cards without thumbnail */
const PASTELS      = ["#FADADD","#DAE8FA","#DAF5E8","#FAF0DA","#E8DAFA","#DAF5FA","#FAE8DA","#F0DAFA"];
const PASTEL_TEXT  = ["#C97A85","#6A9AC9","#5AB88A","#C9A060","#8A60C9","#4AAEC4","#C98A60","#9A60C9"];

const GRADS = [
  "linear-gradient(135deg,#6C6FEF,#9B9EF7)",
  "linear-gradient(135deg,#4F52C2,#6C6FEF)",
  "linear-gradient(135deg,#0DB85E,#6C6FEF)",
  "linear-gradient(135deg,#0099E6,#4F52C2)",
  "linear-gradient(135deg,#6C6FEF,#F0447C)",
  "linear-gradient(135deg,#00BCD4,#6C6FEF)",
  "linear-gradient(135deg,#F5A623,#F76D3C)",
  "linear-gradient(135deg,#9B9EF7,#6C6FEF)",
];

const STATUS_CFG = {
  published:{ bg:T.limeL,  color:T.green  },
  draft:    { bg:"#F1F5F9", color:"#64748B"},
  scheduled:{ bg:T.violetL, color:T.violetD },
  archived: { bg:"#F1F5F9", color:"#64748B"},
};

// Resolves translated status labels for list-row chips and keeps defaults for missing locale keys.
function getStatusLabel(t, status) {
  if (status === "published") return t("admin.course.status.published", { defaultValue: "Published" });
  if (status === "scheduled") return t("admin.course.status.scheduled", { defaultValue: "Scheduled" });
  if (status === "archived") return t("admin.course.status.archived", { defaultValue: "Archived" });
  return t("admin.course.status.draft", { defaultValue: "Draft" });
}

const stripHtml = h => {
  if (!h) return "";
  const d = document.createElement("div");
  d.innerHTML = h;
  return d.textContent || "";
};

/* ── CSS ──────────────────────────────────────────────────────────────────── */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Nunito:wght@700;800;900&family=Inter:wght@400;500;600;700&display=swap');

@keyframes cat-fadeUp  { from{opacity:0;transform:translateY(8px)}  to{opacity:1;transform:none} }
@keyframes cat-popIn   { from{opacity:0;transform:scale(.96)}        to{opacity:1;transform:scale(1)} }
@keyframes cat-shimmer { 0%{background-position:-600px 0} 100%{background-position:600px 0} }
@keyframes cat-float   { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-12px)} }
@keyframes cat-floatB  { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }

.cat-root {
  min-height:100%;
  /* background:${T.bg}; */
  font-family:${T.bFont};
  color:${T.text};
  padding-bottom:80px;
}
.cat-root *, .cat-root *::before, .cat-root *::after {
  box-sizing:border-box; margin:0; padding:0;
}

/* ── White container (ProgressMe style) ── */
.cat-page {
  background:${T.white};
  border-radius:16px;
  border:1px solid ${T.border};
  /* side margins so background peeks through */
  margin:28px 20%;
  padding:36px 44px 48px;
  animation:cat-fadeUp .28s both;
  box-shadow:0 1px 4px rgba(108,111,239,.04);
}

/* ── Title ── */
.cat-title {
  font-family:${T.dFont};
  font-size:24px; font-weight:900;
  color:${T.text}; margin-bottom:22px;
}

/* ── Search ── */
.cat-search {
  display:flex; align-items:center; gap:8px;
  background:white; border:1.5px solid ${T.border};
  border-radius:10px; padding:9px 14px;
  margin-bottom:14px;
  transition:border-color .15s, box-shadow .15s;
}
.cat-search:focus-within {
  border-color:${T.violet}; box-shadow:0 0 0 3px ${T.violetL};
}
.cat-search input {
  flex:1; border:none; outline:none;
  font-family:${T.bFont}; font-size:13.5px;
  color:${T.text}; background:transparent;
}
.cat-search input::placeholder { color:${T.mutedL}; }
.cat-clear-btn {
  border:none; background:none; cursor:pointer;
  color:${T.mutedL}; font-size:18px; line-height:1; padding:0;
  transition:color .13s;
}
.cat-clear-btn:hover { color:${T.sub}; }

/* ── Toolbar row (filters + view toggle) ── */
.cat-toolbar {
  display:flex; align-items:center;
  gap:8px; flex-wrap:wrap; margin-bottom:16px;
}

.cat-select {
  background:white; border:1.5px solid ${T.border}; border-radius:9px;
  padding:7px 28px 7px 11px;
  font-family:${T.bFont}; font-size:12.5px; font-weight:500; color:${T.sub};
  outline:none; cursor:pointer; transition:border-color .14s;
  -webkit-appearance:none; appearance:none;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='11' height='11' viewBox='0 0 12 12' fill='none'%3E%3Cpath d='M2 4l4 4 4-4' stroke='%23A1A1AA' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  background-repeat:no-repeat; background-position:right 9px center;
}
.cat-select:focus { border-color:${T.violet}; box-shadow:0 0 0 3px ${T.violetL}; }

.cat-view-toggle {
  display:flex; background:white;
  border:1.5px solid ${T.border}; border-radius:9px;
  overflow:hidden; flex-shrink:0; margin-left:auto;
}
.cat-vbtn {
  padding:7px 10px; border:none; background:transparent;
  color:${T.mutedL}; cursor:pointer; transition:all .13s;
  display:flex; align-items:center;
}
.cat-vbtn.on  { background:${T.violetL}; color:${T.violetD}; }
.cat-vbtn:hover:not(.on) { background:${T.bg}; color:${T.sub}; }

/* ── Result count ── */
.cat-result-count {
  font-size:12px; color:${T.muted}; font-weight:600;
  margin-bottom:16px;
  display:flex; align-items:center; gap:10px;
}
.cat-result-count::after {
  content:''; flex:1; height:1px; background:${T.border};
}

/* ════════════════════════════════
   GRID
════════════════════════════════ */
.cat-grid {
  display:grid;
  /* 1fr tracks fill the row so space aligns with .cat-page padding */
  grid-template-columns:repeat(auto-fill,minmax(180px,1fr));
  gap:18px;
  width:100%;
}

/* ── Create-course tile ──
   Same size as a card (square thumb + body section)
   so it sits flush in the grid with no height mismatch.
── */
.cat-create-tile {
  display:flex; flex-direction:column;
  border-radius:12px; overflow:hidden;
  border:1.5px dashed ${T.border};
  background:white;
  cursor:pointer;
  transition:border-color .17s, background .17s;
  animation:cat-popIn .28s both;
  /* Allows equal fr columns to shrink without forcing overflow */
  min-width:0;
}
/* The "thumb" area — square, matches card thumb */
.cat-create-thumb {
  width:100%; aspect-ratio:1/1;
  display:flex; flex-direction:column;
  align-items:center; justify-content:center; gap:10px;
}
.cat-create-tile:hover { border-color:${T.violet}; background:${T.violetL}; }
.cat-create-tile-ico {
  width:36px; height:36px; border-radius:10px;
  background:${T.violet};
  display:flex; align-items:center; justify-content:center;
  color:white; flex-shrink:0;
  transition:transform .16s;
}
.cat-create-tile:hover .cat-create-tile-ico { transform:scale(1.07); }
.cat-create-tile-label {
  font-family:${T.bFont}; font-size:12.5px; font-weight:600;
  color:${T.violetD};
}
/* body placeholder so height matches card body */
.cat-create-body {
  padding:11px 13px 13px;
  /* invisible but keeps the height consistent */
  visibility:hidden;
  font-size:13px; line-height:1.25;
}

/* ── Course card ── */
.cat-card {
  background:white; border-radius:12px;
  border:1px solid ${T.border};
  cursor:pointer; display:flex; flex-direction:column;
  overflow:hidden;
  transition:transform .17s, box-shadow .17s, border-color .17s;
  animation:cat-popIn .3s both;
  box-shadow:none;
  /* Allows equal fr columns to shrink without forcing overflow */
  min-width:0;
}
.cat-card:hover {
  transform:translateY(-2px);
  box-shadow:0 4px 14px rgba(108,111,239,.10);
  border-color:${T.violet};
}

/* square thumbnail */
.cat-card-thumb {
  width:100%; aspect-ratio:1/1;
  position:relative; overflow:hidden; flex-shrink:0;
  display:flex; align-items:center; justify-content:center;
  border-radius:0;
}
.cat-card-thumb-img {
  width:100%; height:100%; object-fit:cover; display:block;
}
.cat-card-thumb-initial {
  font-family:${T.dFont};
  font-size:clamp(36px,9vw,56px);
  font-weight:900; user-select:none; line-height:1;
  opacity:0.75;
}

/* card body */
.cat-card-body {
  padding:11px 13px 13px;
  display:flex; flex-direction:column; gap:0;
  border-top:1px solid ${T.border};
}
.cat-card-title {
  font-family:${T.bFont}; font-size:12.5px; font-weight:600;
  color:${T.text}; line-height:1.35;
  display:-webkit-box; -webkit-line-clamp:2;
  -webkit-box-orient:vertical; overflow:hidden;
}
.cat-card-sub {
  display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin-top:5px;
}
.cat-card-sub-item {
  font-size:10.5px; color:${T.muted}; font-weight:500;
  display:flex; align-items:center; gap:3px;
}

/* ── LIST view rows ── */
.cat-list { display:flex; flex-direction:column; gap:9px; }

.cat-row {
  background:white; border-radius:12px;
  border:1.5px solid ${T.border};
  display:flex; align-items:center; gap:12px;
  padding:10px 14px; cursor:pointer;
  transition:all .16s; animation:cat-fadeUp .26s both;
}
.cat-row:hover {
  border-color:${T.violet};
  box-shadow:0 2px 10px rgba(108,111,239,.08);
  transform:translateX(2px);
}
.cat-row-swatch {
  width:40px; height:40px; border-radius:11px; flex-shrink:0;
  display:flex; align-items:center; justify-content:center;
  font-family:${T.dFont}; font-size:17px; font-weight:900; color:white;
}
.cat-row-info { flex:1; min-width:0; }
.cat-row-title {
  font-family:${T.dFont}; font-size:14px; font-weight:800; color:${T.text};
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-bottom:2px;
}
.cat-row-meta {
  display:flex; gap:8px; align-items:center; flex-wrap:wrap;
}
.cat-row-meta-item {
  font-size:11.5px; color:${T.muted}; font-weight:500;
  display:flex; align-items:center; gap:3px;
}
.cat-row-status {
  font-size:10.5px; font-weight:700;
  padding:3px 9px; border-radius:6px; white-space:nowrap; flex-shrink:0;
}

/* progress bar (used in list) */
.cat-track {
  height:3px; background:${T.border};
  border-radius:999px; overflow:hidden;
}
.cat-fill {
  height:100%; border-radius:999px;
  background:linear-gradient(90deg,${T.lime},${T.teal});
  transition:width .5s;
}
.cat-row-prog { width:80px; flex-shrink:0; }

/* icon button (list only) */
.cat-ico-btn {
  width:26px; height:26px; border-radius:7px;
  border:1px solid ${T.border}; background:white;
  color:${T.sub};
  display:flex; align-items:center; justify-content:center;
  cursor:pointer; transition:all .12s;
}
.cat-ico-btn:hover     { background:${T.violetL}; border-color:${T.violet}; color:${T.violetD}; }
.cat-ico-btn.del:hover { background:${T.redL};    border-color:${T.red};    color:${T.red};    }
.cat-row-actions {
  display:flex; gap:4px; flex-shrink:0;
  opacity:0; transition:opacity .13s;
}
.cat-row:hover .cat-row-actions { opacity:1; }

/* ── Skeleton ── */
.cat-skeleton {
  border-radius:12px; overflow:hidden;
  background:white; border:1px solid ${T.border};
  animation:cat-popIn .3s both;
}
.cat-skel-sq {
  width:100%; aspect-ratio:1/1;
  background:linear-gradient(90deg,#eef0fe 25%,#f5f6ff 50%,#eef0fe 75%);
  background-size:600px 100%;
  animation:cat-shimmer 1.6s infinite linear;
}
.cat-skel-body { padding:11px 13px 13px; border-top:1px solid ${T.border}; }
.cat-skel-line {
  border-radius:6px; margin-bottom:7px;
  background:linear-gradient(90deg,#eef0fe 25%,#f5f6ff 50%,#eef0fe 75%);
  background-size:600px 100%;
  animation:cat-shimmer 1.6s infinite linear;
}

/* ── Empty state ── */
.cat-empty {
  min-height:50vh; display:flex; align-items:center;
  justify-content:center; padding:40px;
  position:relative; overflow:hidden;
  animation:cat-fadeUp .38s both;
}
.cat-empty-floater {
  position:absolute; pointer-events:none; user-select:none;
  opacity:0; transition:opacity .7s;
}
.cat-empty-floater.v { opacity:.42; }
.cat-empty-card {
  position:relative; z-index:2;
  background:white; border:1px solid ${T.border};
  border-radius:20px; padding:44px 44px 36px;
  text-align:center; max-width:440px; width:100%;
  box-shadow:0 6px 24px rgba(108,111,239,.07);
  animation:cat-popIn .38s .06s both;
}
.cat-empty-orb {
  width:68px; height:68px; border-radius:20px;
  background:${T.violetL}; border:1.5px solid rgba(108,111,239,.15);
  display:flex; align-items:center; justify-content:center; font-size:32px;
  margin:0 auto 18px;
  animation:cat-float 4s ease-in-out infinite;
}
.cat-empty-badge {
  display:inline-flex; align-items:center; gap:5px;
  background:${T.violetL}; border:1px solid rgba(108,111,239,.18);
  border-radius:999px; padding:4px 13px;
  font-family:${T.dFont}; font-size:10.5px; font-weight:800;
  color:${T.violetD}; letter-spacing:.08em; text-transform:uppercase; margin-bottom:12px;
}
.cat-empty-title {
  font-family:${T.dFont}; font-size:clamp(17px,3vw,22px); font-weight:900;
  color:${T.text}; line-height:1.2; margin-bottom:8px;
}
.cat-empty-title span { color:${T.violet}; }
.cat-empty-sub {
  font-size:13px; color:${T.sub}; line-height:1.7;
  max-width:300px; margin:0 auto 20px;
}
.cat-empty-feats {
  display:grid; grid-template-columns:1fr 1fr; gap:7px; margin-bottom:20px;
}
.cat-empty-feat {
  border-radius:10px; padding:10px 9px;
  display:flex; align-items:center; gap:8px;
  font-family:${T.dFont}; font-size:11px; font-weight:700;
  color:white; line-height:1.3;
}
.cat-empty-cta {
  width:100%; border:none; border-radius:11px;
  background:${T.violet}; color:white;
  font-family:${T.dFont}; font-size:14px; font-weight:800;
  padding:13px 24px; cursor:pointer;
  box-shadow:0 2px 10px rgba(108,111,239,.22);
  display:flex; align-items:center; justify-content:center; gap:8px;
  transition:all .17s;
}
.cat-empty-cta:hover {
  background:${T.violetD};
  box-shadow:0 4px 16px rgba(108,111,239,.28);
  transform:translateY(-1px);
}
.cat-empty-note { margin-top:9px; font-size:11.5px; color:${T.muted}; }

/* no results */
.cat-no-res {
  display:flex; flex-direction:column;
  align-items:center; padding:50px 24px; text-align:center;
  animation:cat-fadeUp .32s both;
}
.cat-no-res-emoji { font-size:34px; margin-bottom:12px; opacity:.35; }
.cat-no-res-title { font-family:${T.dFont}; font-size:17px; font-weight:900; color:${T.text}; margin-bottom:5px; }
.cat-no-res-sub   { font-size:12.5px; color:${T.muted}; }

/* delete modal */
.cat-modal-bg {
  position:fixed; inset:0; z-index:1000;
  background:rgba(24,24,27,.35); backdrop-filter:blur(4px);
  display:flex; align-items:center; justify-content:center;
  padding:24px; animation:cat-fadeUp .15s both;
}
.cat-modal {
  background:white; border-radius:18px; padding:30px;
  max-width:340px; width:100%;
  box-shadow:0 20px 54px rgba(0,0,0,.15);
  animation:cat-popIn .17s both;
}

/* responsive */
/* ~tablet / small laptop: exactly three cards per row at 1024px-wide viewports */
@media(max-width:1024px) and (min-width:769px){
  .cat-grid { grid-template-columns:repeat(3,minmax(0,1fr)); gap:16px; }
}
@media(max-width:768px){
  .cat-page { margin:16px 16px; padding:22px 20px 28px; }
  .cat-grid { grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:14px; }
}
@media(max-width:480px){
  .cat-grid { grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }
}
`;

/* ── Micro-icons ─────────────────────────────────────────────────────────── */
const I = {
  Search:   ()=><svg width="15" height="15" viewBox="0 0 20 20" fill="none"><circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.7"/><path d="M14 14l4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>,
  Plus:     ()=><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/></svg>,
  Grid:     ()=><svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="1" y="1" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5"/><rect x="9" y="1" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5"/><rect x="1" y="9" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5"/><rect x="9" y="9" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5"/></svg>,
  List:     ()=><svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 4h10M3 8h10M3 12h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>,
  Pencil:   ()=><svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M11.5 2.5l2 2L5 13H3v-2L11.5 2.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg>,
  Trash:    ()=><svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M2 4h12M5 4V2.5h6V4M5 4l.5 9h5L11 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  Units:    ()=><svg width="11" height="11" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.4"/><path d="M5 6h6M5 9h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>,
  Students: ()=><svg width="11" height="11" viewBox="0 0 16 16" fill="none"><circle cx="6" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.4"/><path d="M1 14c0-2.76 2.24-5 5-5s5 2.24 5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><path d="M11 3a2.5 2.5 0 0 1 0 5M15 14c0-2.2-1.5-4.08-3.5-4.72" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>,
  Spark:    ()=><svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 1l1.5 4.5H14L10.5 8 12 12.5 8 10l-4 2.5 1.5-4.5L2 5.5h4.5L8 1Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg>,
};

/* ── Skeleton ── */
const Skel = ({i}) => (
  <div className="cat-skeleton" style={{animationDelay:`${i*.05}s`}}>
    <div className="cat-skel-sq"/>
    <div className="cat-skel-body">
      <div className="cat-skel-line" style={{height:12,width:"70%"}}/>
      <div className="cat-skel-line" style={{height:10,width:"46%"}}/>
    </div>
  </div>
);

/* ── Empty state ── */
const EmptyState = ({onNew, t}) => {
  const [v, setV] = useState(false);
  useEffect(()=>{ const t=setTimeout(()=>setV(true),80); return()=>clearTimeout(t); },[]);
  const FLOATS = [
    {e:"📚",x:"5%", y:"10%",s:28,d:0},  {e:"✏️",x:"88%",y:"12%",s:22,d:.5},
    {e:"🎯",x:"3%", y:"72%",s:24,d:1.1},{e:"🌍",x:"86%",y:"74%",s:22,d:.3},
  ];
  const FEATS = [
    {e:"🧠",l:t("admin.courses.empty.aiBuilder", { defaultValue: "AI course builder" }), g:`linear-gradient(135deg,${T.violet},#9B9EF7)`},
    {e:"🚀",l:t("admin.courses.empty.lessonByLesson", { defaultValue: "Lesson by lesson" }),  g:`linear-gradient(135deg,${T.violetD},${T.violet})`},
    {e:"📊",l:t("admin.courses.empty.liveAnalytics", { defaultValue: "Live analytics" }),    g:`linear-gradient(135deg,${T.lime},${T.teal})`},
    {e:"📝",l:t("admin.courses.empty.autoTestGen", { defaultValue: "Auto test gen" }),     g:`linear-gradient(135deg,${T.amber},${T.orange})`},
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
        <div className="cat-empty-badge"><I.Spark/> {t("admin.courses.empty.welcome", { defaultValue: "Welcome to your studio" })}</div>
        <h2 className="cat-empty-title">{t("admin.courses.empty.titlePrefix", { defaultValue: "Build your first" })} <span>{t("admin.courses.empty.titleHighlight", { defaultValue: "AI-powered course" })}</span></h2>
        <p className="cat-empty-sub">
          {t("admin.courses.empty.subtitle", { defaultValue: "Create engaging language courses with AI-generated slides, tasks and tests." })}
        </p>
        <div className="cat-empty-feats">
          {FEATS.map((f,i)=>(
            <div key={f.l} className="cat-empty-feat" style={{background:f.g,
              opacity:v?1:0,transform:v?"scale(1)":"scale(.92)",
              transition:`all .34s cubic-bezier(.22,.68,0,1.3) ${.07+i*.06}s`}}>
              <span style={{fontSize:16}}>{f.e}</span><span>{f.l}</span>
            </div>
          ))}
        </div>
        <button className="cat-empty-cta" onClick={onNew}>✨ {t("admin.courses.empty.createFirst", { defaultValue: "Create First Course" })}</button>
        <p className="cat-empty-note">{t("admin.courses.empty.note", { defaultValue: "Takes ~2 minutes - AI does the heavy lifting" })}</p>
      </div>
    </div>
  );
};

/* ── Course card (grid) ── */
const Card = ({course, idx, onOpen}) => {
  const pastel     = PASTELS[idx % PASTELS.length];
  const pastelText = PASTEL_TEXT[idx % PASTEL_TEXT.length];

  const apiBase = typeof import.meta !== "undefined"
    ? (import.meta.env?.VITE_API_BASE_URL || "http://localhost:8000/api/v1")
    : "http://localhost:8000/api/v1";
  let thumb = null;
  if (course.thumbnail_url) thumb = course.thumbnail_url;
  else if (course.thumbnail_path)
    thumb = `${apiBase}/static/thumbnails/${course.thumbnail_path.split("/").pop()}`;

  const initial    = (course.title || "?")[0].toUpperCase();
  const unitsTotal = course.units_count ?? 0;
  const enrolled   = course.enrolled_students_count ?? 0;

  return (
    <div className="cat-card" style={{animationDelay:`${idx*.04}s`}}
      onClick={()=>onOpen(course)}>
      {/* Square thumb */}
      <div className="cat-card-thumb" style={{background: thumb ? "#eee" : pastel}}>
        {thumb
          ? <img className="cat-card-thumb-img" src={thumb} alt={course.title}
              onError={e=>{e.target.style.display="none";}}/>
          : <span className="cat-card-thumb-initial" style={{color:pastelText}}>{initial}</span>
        }
      </div>
      {/* Body */}
      <div className="cat-card-body">
        <div className="cat-card-title">{course.title}</div>
        <div className="cat-card-sub">
          {enrolled > 0 && <span className="cat-card-sub-item"><I.Students/> {enrolled}</span>}
        </div>
      </div>
    </div>
  );
};

/* ── Course row (list) ── */
const Row = ({course, idx, onOpen, onDelete, t}) => {
  const grad = GRADS[idx % GRADS.length];
  const st   = STATUS_CFG[course.status] || STATUS_CFG.draft;
  // Stores translated status chip label for list rows.
  const statusLabel = getStatusLabel(t, course.status);
  const pct  = (course.units_count ?? 0) > 0
    ? Math.round(((course.published_units_count ?? 0) / course.units_count) * 100) : 0;
  return (
    <div className="cat-row" style={{animationDelay:`${idx*.04}s`}}
      onClick={()=>onOpen(course)}>
      <div className="cat-row-swatch" style={{background:grad}}>
        {(course.title||"?")[0].toUpperCase()}
      </div>
      <div className="cat-row-info">
        <div className="cat-row-title">{course.title}</div>
        <div className="cat-row-meta">
          {course.level && <span className="cat-row-meta-item" style={{fontWeight:700,color:T.violetD}}>{course.level}</span>}
          {(course.units_count??0) > 0 && <span className="cat-row-meta-item"><I.Units/> {course.units_count} {t("admin.courses.units", { defaultValue: "units" })}</span>}
          {(course.enrolled_students_count??0) > 0 && <span className="cat-row-meta-item"><I.Students/> {course.enrolled_students_count}</span>}
        </div>
      </div>
      {(course.units_count??0) > 0 && (
        <div className="cat-row-prog">
          <div style={{fontSize:10,color:T.muted,fontWeight:600,marginBottom:3,textAlign:"right"}}>{pct}%</div>
          <div className="cat-track"><div className="cat-fill" style={{width:`${pct}%`}}/></div>
        </div>
      )}
      <span className="cat-row-status" style={{background:st.bg,color:st.color}}>{statusLabel}</span>
      <div className="cat-row-actions">
        {/* Legacy course editor: route /admin/courses/:id/edit is disabled (see AdminCourseEditPage.legacy.tsx).
        <button className="cat-ico-btn" onClick={e=>{e.stopPropagation();onEdit(course.id);}}><I.Pencil/></button>
        */}
        <button className="cat-ico-btn del" onClick={e=>{e.stopPropagation();onDelete(course);}}><I.Trash/></button>
      </div>
    </div>
  );
};

/* ── Delete modal ── */
const DelModal = ({course, busy, onConfirm, onCancel, t}) => (
  <div className="cat-modal-bg" onClick={onCancel}>
    <div className="cat-modal" onClick={e=>e.stopPropagation()}>
      <div style={{fontSize:34,textAlign:"center",marginBottom:12}}>🗑️</div>
      <h3 style={{fontFamily:T.dFont,fontSize:17,fontWeight:900,color:T.text,textAlign:"center",marginBottom:7}}>
        {t("admin.courses.delete.title", { defaultValue: "Delete course?" })}
      </h3>
      <p style={{fontSize:12.5,color:T.sub,textAlign:"center",lineHeight:1.7,marginBottom:20}}>
        <strong style={{color:T.text}}>"{course.title}"</strong> and all its content will be
        {" "}{t("admin.courses.delete.subtitle", { defaultValue: "permanently removed. This cannot be undone." })}
      </p>
      <div style={{display:"flex",gap:8}}>
        <button style={{flex:1,padding:"10px",borderRadius:10,border:`1.5px solid ${T.border}`,background:"white",color:T.sub,fontFamily:T.dFont,fontSize:13,fontWeight:700,cursor:"pointer"}}
          onClick={onCancel}>{t("common.cancel", { defaultValue: "Cancel" })}</button>
        <button disabled={busy}
          style={{flex:1,padding:"10px",borderRadius:10,border:"none",background:"#EF4444",color:"white",fontFamily:T.dFont,fontSize:13,fontWeight:800,cursor:busy?"not-allowed":"pointer",opacity:busy?.65:1,boxShadow:"0 3px 12px rgba(239,68,68,.24)"}}
          onClick={onConfirm}>{busy ? t("admin.courses.delete.deleting", { defaultValue: "Deleting..." }) : t("admin.courses.delete.action", { defaultValue: "Delete" })}</button>
      </div>
    </div>
  </div>
);

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════════════════════ */
export default function AdminCoursesCatalog() {
  // Provides translation function for catalog labels/toasts across all admin pages.
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { startTeacherClassroomOpen } = useTeacherClassroomTransition();
  const [courses,  setCourses]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [query,    setQuery]    = useState("");
  const [view,     setView]     = useState("grid");
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const searchRef = useRef(null);

  useEffect(()=>{
    coursesApi.getAdminCourses()
      .then(d => setCourses(Array.isArray(d) ? d : []))
      .catch(() => toast.error(t("admin.courses.loadError", { defaultValue: "Failed to load courses" })))
      .finally(() => setLoading(false));
  }, [t]);

  useEffect(()=>{
    const fn = e => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault(); searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, []);

  const filtered = useMemo(()=>{
    const q = query.toLowerCase().trim();
    return courses.filter(c =>
      (!q || c.title.toLowerCase().includes(q) || stripHtml(c.description||"").toLowerCase().includes(q))
    );
  }, [courses, query]);

  const handleOpen = course => {
    startTeacherClassroomOpen();
    const cid = course.id;
    const uid = course.first_unit_id;
    navigate(uid ? `/teacher/classroom/${cid}/${uid}` : `/teacher/classroom/${cid}`);
  };
  // Legacy: pointed at AdminCourseEditPage.legacy (route commented in AdminRoutes).
  // const handleEdit = id => navigate(`/admin/courses/${id}/edit`);
  const handleNew    = ()  => setCreateModalOpen(true);
  const handleDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await coursesApi.deleteCourse(toDelete.id);
      setCourses(c => c.filter(x => x.id !== toDelete.id));
      toast.success(t("admin.courses.deleted", { defaultValue: "Course deleted" }));
    } catch { toast.error(t("admin.courses.deleteError", { defaultValue: "Failed to delete course" })); }
    finally { setDeleting(false); setToDelete(null); }
  };

  const isFiltered = !!query;

  return (
    <>
      <style>{CSS}</style>
      <div className="cat-root">
        <div className="cat-page">

          {/* Title */}
          <div className="cat-title">{t("admin.nav.courses", { defaultValue: "Courses" })}</div>

          {/* Search */}
          <div className="cat-search">
            <I.Search/>
            <input ref={searchRef} value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={t("admin.courses.searchPlaceholder", { defaultValue: "Search courses..." })}/>
            {query && <button className="cat-clear-btn" onClick={()=>setQuery("")}>×</button>}
          </div>

          {/* Filters + view toggle */}
          <div className="cat-toolbar">
            {/* <select className="cat-select" value={level} onChange={e=>setLevel(e.target.value)}>
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
            </select> */}
            <div className="cat-view-toggle">
              <button className={`cat-vbtn ${view==="grid"?"on":""}`} onClick={()=>setView("grid")} title={t("admin.courses.view.grid", { defaultValue: "Grid" })}><I.Grid/></button>
              <button className={`cat-vbtn ${view==="list"?"on":""}`} onClick={()=>setView("list")} title={t("admin.courses.view.list", { defaultValue: "List" })}><I.List/></button>
            </div>
          </div>

          {/* Result count */}
          {!loading && courses.length > 0 && (
            <div className="cat-result-count">
              {isFiltered
                ? t("admin.courses.count.filtered", { defaultValue: `${filtered.length} of ${courses.length} courses`, filtered: filtered.length, total: courses.length })
                : t("admin.courses.count.total", { defaultValue: `${courses.length} course${courses.length!==1?"s":""}`, count: courses.length })}
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="cat-grid">
              {/* placeholder for create tile */}
            <div style={{borderRadius:12,border:`1px dashed ${T.border}`,background:T.bg,aspectRatio:"1/1"}}/>
              {[...Array(5)].map((_,i) => <Skel key={i} i={i+1}/>)}
            </div>
          )}

          {/* Empty state */}
          {!loading && courses.length === 0 && <EmptyState onNew={handleNew} t={t}/>}

          {/* No filter results */}
          {!loading && courses.length > 0 && filtered.length === 0 && (
            <div className="cat-no-res">
              <div className="cat-no-res-emoji">🔍</div>
              <div className="cat-no-res-title">{t("admin.courses.noResults.title", { defaultValue: "No courses match" })}</div>
              <div className="cat-no-res-sub">{t("admin.courses.noResults.subtitle", { defaultValue: "Try adjusting your search or clearing the filters." })}</div>
              <button style={{marginTop:14,border:"none",background:T.violetL,color:T.violetD,fontFamily:T.dFont,fontSize:12.5,fontWeight:700,padding:"7px 16px",borderRadius:9,cursor:"pointer"}}
                onClick={()=>{setQuery("");}}>
                {t("admin.courses.noResults.clear", { defaultValue: "Clear filters" })}
              </button>
            </div>
          )}

          {/* Grid view */}
          {!loading && courses.length > 0 && view === "grid" && (
            <div className="cat-grid">
              {/* Create tile — same card structure so heights match */}
              <div className="cat-create-tile" onClick={handleNew}>
                <div className="cat-create-thumb">
                  <div className="cat-create-tile-ico"><I.Plus/></div>
                  <span className="cat-create-tile-label">{t("admin.courses.create", { defaultValue: "Create course" })}</span>
                </div>
                {/* invisible body spacer matching card body height */}
                <div className="cat-create-body">—</div>
              </div>

              {filtered.map((c, i) => (
                <Card key={c.id} course={c} idx={i} onOpen={handleOpen}/>
              ))}
            </div>
          )}

          {/* List view */}
          {!loading && courses.length > 0 && view === "list" && (
            <div className="cat-list">
              {filtered.map((c, i) => (
                <Row key={c.id} course={c} idx={i} t={t}
                  onOpen={handleOpen} onDelete={setToDelete}/>
              ))}
              <button
                onClick={handleNew}
                style={{marginTop:2,border:`1.5px dashed ${T.border}`,borderRadius:11,background:"white",padding:"10px",cursor:"pointer",color:T.violetD,fontFamily:T.dFont,fontSize:13,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",gap:8,transition:"background .15s,border-color .15s"}}
                onMouseEnter={e=>{e.currentTarget.style.background=T.violetL;e.currentTarget.style.borderColor=T.violet;}}
                onMouseLeave={e=>{e.currentTarget.style.background="white";e.currentTarget.style.borderColor=T.border;}}>
                <I.Plus/> {t("admin.courses.create", { defaultValue: "Create course" })}
              </button>
            </div>
          )}

        </div>
      </div>

      <CreateCourseModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
      />

      {toDelete && (
        <DelModal
          course={toDelete} busy={deleting} t={t}
          onConfirm={handleDelete} onCancel={()=>!deleting&&setToDelete(null)}/>
      )}
    </>
  );
}