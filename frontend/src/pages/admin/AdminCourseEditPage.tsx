/**
 * TeacherCourseEditPage.jsx
 *
 * Route: /teacher/courses/:courseId
 *
 * Central course management hub for teachers.
 * Matches TeacherOnboarding design tokens exactly (T, FontLoader, GlobalStyles,
 * MODULE_GRADS). Does NOT duplicate unit/video/task editors — this is a hub.
 *
 * ── Components ────────────────────────────────────────────────────────────────
 *   TeacherCourseEditPage   ← default export, entry point
 *     CourseHeader          ← title, status badge, back button
 *     CourseMetadataForm    ← editable course fields
 *     CourseUnitsSection    ← unit cards list + create unit
 *     CourseActionsPanel    ← summary stats + save / publish actions
 *
 * ── API helpers used ──────────────────────────────────────────────────────────
 *   coursesApi.getAdminCourse(id)
 *   coursesApi.updateCourse(id, data)
 *   unitsApi.getAdminUnits() → filtered by course_id
 *   unitsApi.createUnit(data)
 *   unitsApi.deleteUnit(id)
 *   unitsApi.reorderUnit(id, direction) — only if endpoint exists
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { coursesApi, unitsApi } from "../../services/api";
import { Unit } from "../../types";

/* ─── Re-use design tokens from TeacherOnboarding ───────────────────────────── */
export const T = {
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
  green:   "#16A34A", greenL:  "#DCFCE7",
  red:     "#EF4444", redL:    "#FEE2E2",
  dFont:   "'Nunito', system-ui, sans-serif",
  bFont:   "'Inter', system-ui, sans-serif",
};

const MODULE_GRADS = [
  "linear-gradient(135deg,#6C35DE,#F0447C)",
  "linear-gradient(135deg,#0099E6,#6C35DE)",
  "linear-gradient(135deg,#0DB85E,#0099E6)",
  "linear-gradient(135deg,#F5A623,#F76D3C)",
  "linear-gradient(135deg,#F0447C,#F76D3C)",
  "linear-gradient(135deg,#00BCD4,#0DB85E)",
  "linear-gradient(135deg,#F76D3C,#F5A623)",
  "linear-gradient(135deg,#9333EA,#0099E6)",
];

/* ─── Font loader ────────────────────────────────────────────────────────────── */
const FontLoader = () => (
  <style>{`@import url('https://fonts.googleapis.com/css2?family=Nunito:wght@700;800;900&family=Inter:wght@400;500;600;700&display=swap');`}</style>
);

/* ─── Page-scoped styles ─────────────────────────────────────────────────────── */
const PageStyles = () => (
  <style>{`
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { height: 100%; }
    body { background: ${T.bg}; color: ${T.text}; font-family: ${T.bFont}; }

    @keyframes fadeUp   { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
    @keyframes fadeIn   { from{opacity:0} to{opacity:1} }
    @keyframes spin     { to{transform:rotate(360deg)} }
    @keyframes shimmer  { 0%{background-position:-600px 0} 100%{background-position:600px 0} }
    @keyframes toastIn  { 0%{opacity:0;transform:translateY(12px) scale(.95)} 15%{opacity:1;transform:none} 80%{opacity:1} 100%{opacity:0} }

    .tce-page        { min-height:100vh; background:${T.bg}; font-family:${T.bFont}; }
    .tce-fade-up     { animation:fadeUp .42s cubic-bezier(.22,.68,0,1.2) both; }
    .tce-fade-in     { animation:fadeIn .35s ease both; }

    /* ── Topbar ── */
    .tce-topbar      { position:sticky; top:0; z-index:30; background:rgba(247,246,255,.92);
                        backdrop-filter:blur(14px); border-bottom:1.5px solid ${T.border};
                        padding:0 32px; height:64px; display:flex; align-items:center;
                        justify-content:space-between; gap:16px; }
    .tce-topbar-left { display:flex; align-items:center; gap:14px; min-width:0; }
    .tce-topbar-right{ display:flex; align-items:center; gap:10px; flex-shrink:0; }

    /* ── Back button ── */
    .tce-btn-back    { display:inline-flex; align-items:center; gap:6px; padding:7px 14px;
                        border-radius:11px; border:1.5px solid ${T.border}; background:white;
                        color:${T.sub}; font-size:13px; font-weight:600; cursor:pointer;
                        transition:all .18s cubic-bezier(.22,.68,0,1.2); white-space:nowrap;
                        font-family:${T.bFont}; }
    .tce-btn-back:hover { border-color:${T.violet}; color:${T.violet}; transform:translateY(-1px);
                           box-shadow:0 4px 12px ${T.violet}22; }

    /* ── Action buttons ── */
    .tce-btn         { display:inline-flex; align-items:center; gap:7px; padding:9px 18px;
                        border-radius:12px; font-size:13px; font-weight:700; cursor:pointer;
                        transition:all .18s cubic-bezier(.22,.68,0,1.2); border:none;
                        font-family:${T.bFont}; white-space:nowrap; }
    .tce-btn:disabled{ opacity:.55; cursor:not-allowed; transform:none !important; }
    .tce-btn--ghost  { background:white; border:1.5px solid ${T.border}; color:${T.sub}; }
    .tce-btn--ghost:hover:not(:disabled) { border-color:${T.violet}; color:${T.violet};
                        transform:translateY(-1px); box-shadow:0 4px 12px ${T.violet}20; }
    .tce-btn--save   { background:white; border:1.5px solid ${T.violet}; color:${T.violet}; }
    .tce-btn--save:hover:not(:disabled) { background:${T.violetL}; transform:translateY(-1px);
                        box-shadow:0 6px 18px ${T.violet}30; }
    .tce-btn--pub    { background:linear-gradient(135deg,${T.violet},${T.pink}); color:white;
                        box-shadow:0 6px 20px ${T.violet}44; }
    .tce-btn--pub:hover:not(:disabled) { transform:translateY(-2px);
                        box-shadow:0 10px 28px ${T.violet}55; }
    .tce-btn--add    { background:linear-gradient(135deg,${T.sky},${T.violet}); color:white;
                        box-shadow:0 4px 14px ${T.sky}44; }
    .tce-btn--add:hover:not(:disabled) { transform:translateY(-2px);
                        box-shadow:0 8px 22px ${T.sky}55; }
    .tce-btn--danger { background:white; border:1.5px solid ${T.redL}; color:${T.red}; }
    .tce-btn--danger:hover:not(:disabled) { background:${T.redL}; transform:translateY(-1px); }

    /* ── Body layout ── */
    .tce-body        { max-width:1200px; margin:0 auto; padding:32px 32px 64px;
                        display:grid; grid-template-columns:1fr 320px; gap:28px;
                        align-items:start; }
    @media (max-width:900px) {
      .tce-body      { grid-template-columns:1fr; padding:20px 16px 48px; }
    }
    .tce-main        { display:flex; flex-direction:column; gap:24px; }

    /* ── Cards ── */
    .tce-card        { background:white; border-radius:20px; border:1.5px solid ${T.border};
                        padding:28px; box-shadow:0 2px 12px rgba(108,53,222,.06); }
    .tce-card-title  { font-family:${T.dFont}; font-size:17px; font-weight:800; color:${T.text};
                        display:flex; align-items:center; gap:9px; margin-bottom:20px; }
    .tce-card-title-icon { width:34px; height:34px; border-radius:10px; display:flex;
                        align-items:center; justify-content:center; font-size:17px; flex-shrink:0; }

    /* ── Form fields ── */
    .tce-field       { display:flex; flex-direction:column; gap:6px; margin-bottom:18px; }
    .tce-field:last-child { margin-bottom:0; }
    .tce-label       { font-size:12px; font-weight:700; color:${T.sub};
                        text-transform:uppercase; letter-spacing:.6px; }
    .tce-input       { padding:11px 14px; border-radius:12px; border:1.5px solid ${T.border};
                        font-size:14px; color:${T.text}; font-family:${T.bFont};
                        background:white; transition:border-color .15s, box-shadow .15s;
                        outline:none; width:100%; }
    .tce-input:focus { border-color:${T.violet}; box-shadow:0 0 0 3px ${T.violet}18; }
    .tce-input::placeholder { color:${T.mutedL}; }
    .tce-textarea    { resize:vertical; min-height:90px; line-height:1.55; }
    .tce-select      { appearance:none; background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath d='M2 4l4 4 4-4' stroke='%239188C4' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");
                        background-repeat:no-repeat; background-position:right 12px center;
                        padding-right:32px; cursor:pointer; }
    .tce-form-row    { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
    @media (max-width:640px) { .tce-form-row { grid-template-columns:1fr; } }

    /* ── Tags ── */
    .tce-tags        { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:8px; }
    .tce-tag         { display:inline-flex; align-items:center; gap:5px; padding:4px 10px;
                        border-radius:20px; background:${T.violetL}; color:${T.violet};
                        font-size:12px; font-weight:700; font-family:${T.bFont}; }
    .tce-tag-x       { cursor:pointer; opacity:.7; transition:opacity .12s; line-height:1;
                        background:none; border:none; color:${T.violet}; padding:0; font-size:13px; }
    .tce-tag-x:hover { opacity:1; }
    .tce-tag-input-row { display:flex; gap:8px; }
    .tce-tag-input-row .tce-input { flex:1; }

    /* ── Toggle ── */
    .tce-toggle-row  { display:flex; align-items:center; justify-content:space-between;
                        padding:12px 14px; border-radius:12px; background:${T.violetL};
                        border:1.5px solid ${T.border}; }
    .tce-toggle-label { font-size:13px; font-weight:600; color:${T.text}; }
    .tce-toggle-hint { font-size:11px; color:${T.muted}; margin-top:2px; }
    .tce-switch      { position:relative; width:40px; height:22px; flex-shrink:0; cursor:pointer; }
    .tce-switch input{ opacity:0; width:0; height:0; position:absolute; }
    .tce-switch-track { position:absolute; inset:0; border-radius:11px; background:${T.mutedL};
                         transition:background .18s; }
    .tce-switch input:checked + .tce-switch-track { background:${T.violet}; }
    .tce-switch-thumb { position:absolute; top:3px; left:3px; width:16px; height:16px;
                         border-radius:50%; background:white; box-shadow:0 1px 4px rgba(0,0,0,.2);
                         transition:transform .18s cubic-bezier(.22,.68,0,1.3); }
    .tce-switch input:checked ~ .tce-switch-thumb { transform:translateX(18px); }

    /* ── Unit cards ── */
    .tce-unit-list   { display:flex; flex-direction:column; gap:10px; }
    .tce-unit-card   { display:flex; align-items:center; gap:14px; padding:14px 16px;
                        border-radius:16px; border:1.5px solid ${T.border}; background:white;
                        transition:all .2s cubic-bezier(.22,.68,0,1.2); cursor:default; }
    .tce-unit-card:hover { border-color:${T.violet}44; box-shadow:0 4px 18px rgba(108,53,222,.1);
                            transform:translateY(-1px); }
    .tce-unit-avatar { width:44px; height:44px; border-radius:12px; display:flex;
                        align-items:center; justify-content:center; font-family:${T.dFont};
                        font-weight:900; font-size:15px; line-height:1; color:white; flex-shrink:0; align-self:center; }
    .tce-unit-info   { flex:1; min-width:0; }
    .tce-unit-title  { font-size:14px; font-weight:700; color:${T.text}; white-space:nowrap;
                        overflow:hidden; text-overflow:ellipsis; }
    .tce-unit-meta   { display:flex; align-items:center; gap:8px; margin-top:3px; flex-wrap:wrap; }
    .tce-unit-actions { display:flex; align-items:center; gap:6px; flex-shrink:0; }

    /* ── Badges ── */
    .tce-badge       { display:inline-flex; align-items:center; padding:3px 9px; border-radius:20px;
                        font-size:11px; font-weight:700; font-family:${T.bFont}; white-space:nowrap; }
    .tce-badge--draft     { background:${T.border}; color:${T.sub}; }
    .tce-badge--published { background:${T.limeL}; color:${T.lime}; }
    .tce-badge--scheduled { background:${T.skyL}; color:${T.sky}; }
    .tce-badge--archived  { background:${T.redL}; color:${T.red}; }
    .tce-badge--level     { background:${T.violetL}; color:${T.violet}; }
    .tce-badge--content   { background:${T.amberL}; color:${T.amber}; }

    /* ── Icon button ── */
    .tce-icon-btn    { width:32px; height:32px; border-radius:9px; border:1.5px solid ${T.border};
                        background:white; color:${T.muted}; cursor:pointer; display:flex;
                        align-items:center; justify-content:center; transition:all .15s;
                        font-size:14px; }
    .tce-icon-btn:hover { border-color:${T.violet}; color:${T.violet}; background:${T.violetL}; }
    .tce-icon-btn--danger:hover { border-color:${T.red}; color:${T.red}; background:${T.redL}; }

    /* ── Actions panel (sidebar) ── */
    .tce-panel       { background:white; border-radius:20px; border:1.5px solid ${T.border};
                        padding:24px; box-shadow:0 2px 12px rgba(108,53,222,.06);
                        position:sticky; top:80px; }
    .tce-panel-title { font-family:${T.dFont}; font-size:15px; font-weight:900; color:${T.text};
                        margin-bottom:18px; }
    .tce-stat-row    { display:flex; align-items:center; justify-content:space-between;
                        padding:9px 0; border-bottom:1px solid ${T.border}; }
    .tce-stat-row:last-of-type { border-bottom:none; }
    .tce-stat-label  { font-size:12px; color:${T.muted}; font-weight:600; }
    .tce-stat-value  { font-family:${T.dFont}; font-size:16px; font-weight:900; color:${T.text}; }
    .tce-panel-divider { height:1px; background:${T.border}; margin:16px 0; }
    .tce-panel-actions { display:flex; flex-direction:column; gap:10px; }

    /* ── Empty state ── */
    .tce-empty       { text-align:center; padding:40px 20px; }
    .tce-empty-icon  { font-size:40px; margin-bottom:12px; }
    .tce-empty-title { font-family:${T.dFont}; font-size:16px; font-weight:800; color:${T.text};
                        margin-bottom:6px; }
    .tce-empty-sub   { font-size:13px; color:${T.muted}; }

    /* ── Loading skeleton ── */
    .tce-shimmer     { background:linear-gradient(90deg,${T.violetL} 25%,#F5F3FF 50%,${T.violetL} 75%);
                        background-size:600px 100%; animation:shimmer 1.6s infinite linear;
                        border-radius:10px; }

    /* ── Spinner ── */
    .tce-spin        { width:15px; height:15px; border:2.5px solid currentColor;
                        border-top-color:transparent; border-radius:50%;
                        animation:spin .7s linear infinite; display:inline-block; }

    /* ── Toast ── */
    .tce-toast       { position:fixed; bottom:32px; left:50%; transform:translateX(-50%);
                        background:${T.text}; color:white; padding:11px 22px; border-radius:14px;
                        font-size:13px; font-weight:600; font-family:${T.bFont}; z-index:999;
                        animation:toastIn 3s ease both; pointer-events:none;
                        box-shadow:0 8px 28px rgba(0,0,0,.28); white-space:nowrap; }

    /* ── Create unit modal overlay ── */
    .tce-overlay     { position:fixed; inset:0; background:rgba(26,16,53,.55);
                        backdrop-filter:blur(4px); z-index:100; display:flex;
                        align-items:center; justify-content:center; padding:20px; }
    .tce-modal       { background:white; border-radius:24px; padding:32px; width:100%;
                        max-width:480px; box-shadow:0 24px 64px rgba(108,53,222,.25);
                        animation:fadeUp .3s cubic-bezier(.22,.68,0,1.2) both; }
    .tce-modal-title { font-family:${T.dFont}; font-size:20px; font-weight:900; color:${T.text};
                        margin-bottom:20px; }
    .tce-modal-actions { display:flex; gap:10px; margin-top:24px; justify-content:flex-end; }

    /* ── Header course title ── */
    .tce-course-name { font-family:${T.dFont}; font-size:18px; font-weight:900; color:${T.text};
                        white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:320px; }
    .tce-topbar-sep  { color:${T.mutedL}; font-size:18px; flex-shrink:0; }

    /* ── Section header ── */
    .tce-section-header { display:flex; align-items:center; justify-content:space-between;
                           margin-bottom:16px; }
    .tce-section-title  { font-family:${T.dFont}; font-size:17px; font-weight:800; color:${T.text};
                           display:flex; align-items:center; gap:8px; }

    /* ── Thumbnail strip ── */
    .tce-thumb-box   { border:1.5px dashed ${T.border}; border-radius:14px; overflow:hidden;
                        position:relative; background:${T.violetL}; aspect-ratio:16/9;
                        max-height:140px; display:flex; align-items:center; justify-content:center; }
    .tce-thumb-img   { width:100%; height:100%; object-fit:cover; display:block; }
    .tce-thumb-empty { display:flex; flex-direction:column; align-items:center; gap:6px;
                        color:${T.muted}; font-size:12px; font-weight:600; padding:16px; text-align:center; }
    .tce-thumb-overlay { position:absolute; inset:0; background:rgba(26,16,53,.5);
                          display:flex; align-items:center; justify-content:center; gap:8px;
                          opacity:0; transition:opacity .18s; }
    .tce-thumb-box:hover .tce-thumb-overlay { opacity:1; }

    .tce-reorder-btn { width:28px; height:28px; border-radius:8px; border:1.5px solid ${T.border};
                        background:white; cursor:pointer; display:flex; align-items:center;
                        justify-content:center; color:${T.muted}; transition:all .15s; font-size:12px; }
    .tce-reorder-btn:hover { border-color:${T.violet}; color:${T.violet}; }
    .tce-reorder-btn:disabled { opacity:.3; cursor:not-allowed; }
  `}</style>
);

/* ─── Helpers ────────────────────────────────────────────────────────────────── */
type StatusKey = 'draft' | 'published' | 'scheduled' | 'archived';
type LevelKey = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2' | 'mixed';

const statusLabel = (s: string): string => {
  const labels: Record<StatusKey, string> = { draft: "Draft", published: "Published", scheduled: "Scheduled", archived: "Archived" };
  return labels[s as StatusKey] || s;
};
const statusClass = (s: string): string => {
  const classes: Record<StatusKey, string> = { draft: "tce-badge--draft", published: "tce-badge--published", scheduled: "tce-badge--scheduled", archived: "tce-badge--archived" };
  return classes[s as StatusKey] || "tce-badge--draft";
};
const levelColors: Record<LevelKey, string> = { A1: T.violet, A2: T.sky, B1: T.lime, B2: T.amber, C1: T.orange, C2: T.pink, mixed: T.teal };
const totalContent = (cc?: { videos?: number; tasks?: number; tests?: number }): number => (cc?.videos || 0) + (cc?.tasks || 0) + (cc?.tests || 0);

/* ─── Sub-components ─────────────────────────────────────────────────────────── */

/* CourseHeader */
interface CourseHeaderProps {
  title: string;
  status?: string;
  level?: string;
  onBack: () => void;
}

function CourseHeader({ title, status, level, onBack }: CourseHeaderProps) {
  return (
    <div className="tce-topbar">
      <div className="tce-topbar-left">
        <button className="tce-btn-back" onClick={onBack}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M9 2L4 7l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Courses
        </button>
        <span className="tce-topbar-sep">›</span>
        <span className="tce-course-name">{title || "Untitled Course"}</span>
        {status && <span className={`tce-badge ${statusClass(status)}`}>{statusLabel(status)}</span>}
        {level && <span className="tce-badge tce-badge--level">{level}</span>}
      </div>
      <div style={{ fontSize: 12, color: T.muted, fontWeight: 600 }}>Course Hub</div>
    </div>
  );
}

/* CourseMetadataForm */
interface CourseMetadataFormProps {
  formData: {
    title: string;
    description: string;
    level: string;
    status: string;
    publish_at: string;
    order_index: number;
    thumbnail_url: string;
    duration_hours: number | null;
    tags: string[];
    is_visible_to_students: boolean;
  };
  onChange: (field: string, value: any) => void;
  thumbnail: string | null;
  onThumbnailChange: (file: File) => void;
  onRemoveThumbnail: () => void;
}

function CourseMetadataForm({ formData, onChange, thumbnail, onThumbnailChange, onRemoveThumbnail }: CourseMetadataFormProps) {
  const [tagInput, setTagInput] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !formData.tags.includes(t)) {
      onChange("tags", [...formData.tags, t]);
      setTagInput("");
    }
  };

  return (
    <div className="tce-card tce-fade-up" style={{ animationDelay: ".08s" }}>
      <div className="tce-card-title">
        <span className="tce-card-title-icon" style={{ background: T.violetL }}>📝</span>
        Course Details
      </div>

      {/* Title */}
      <div className="tce-field">
        <label className="tce-label">Title *</label>
        <input
          className="tce-input"
          value={formData.title}
          onChange={(e) => onChange("title", e.target.value)}
          placeholder="e.g. Italian A1 — Absolute Beginners"
        />
      </div>

      {/* Description */}
      <div className="tce-field">
        <label className="tce-label">Description</label>
        <textarea
          className="tce-input tce-textarea"
          value={formData.description}
          onChange={(e) => onChange("description", e.target.value)}
          placeholder="What will students learn in this course?"
        />
      </div>

      {/* Level + Status row */}
      <div className="tce-form-row">
        <div className="tce-field" style={{ marginBottom: 0 }}>
          <label className="tce-label">Level</label>
          <select
            className="tce-input tce-select"
            value={formData.level}
            onChange={(e) => onChange("level", e.target.value)}
          >
            {["A1","A2","B1","B2","C1","C2","mixed"].map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </div>
        <div className="tce-field" style={{ marginBottom: 0 }}>
          <label className="tce-label">Status</label>
          <select
            className="tce-input tce-select"
            value={formData.status}
            onChange={(e) => onChange("status", e.target.value)}
          >
            <option value="draft">Draft</option>
            <option value="scheduled">Scheduled</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </select>
        </div>
      </div>

      {/* Duration + Order */}
      <div className="tce-form-row" style={{ marginTop: 18 }}>
        <div className="tce-field" style={{ marginBottom: 0 }}>
          <label className="tce-label">Duration (hours)</label>
          <input
            type="number"
            min="0"
            className="tce-input"
            value={formData.duration_hours ?? ""}
            onChange={(e) => onChange("duration_hours", e.target.value ? Number(e.target.value) : null)}
            placeholder="e.g. 12"
          />
        </div>
        <div className="tce-field" style={{ marginBottom: 0 }}>
          <label className="tce-label">Display Order</label>
          <input
            type="number"
            min="0"
            className="tce-input"
            value={formData.order_index}
            onChange={(e) => onChange("order_index", Number(e.target.value))}
            placeholder="0"
          />
        </div>
      </div>

      {/* Publish at */}
      <div className="tce-field" style={{ marginTop: 18 }}>
        <label className="tce-label">Publish At (optional)</label>
        <input
          type="datetime-local"
          className="tce-input"
          value={formData.publish_at}
          onChange={(e) => onChange("publish_at", e.target.value)}
        />
      </div>

      {/* Thumbnail */}
      <div className="tce-field">
        <label className="tce-label">Thumbnail</label>
        <div className="tce-thumb-box">
          {thumbnail
            ? <>
                <img src={thumbnail} alt="thumbnail" className="tce-thumb-img" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                <div className="tce-thumb-overlay">
                  <button className="tce-btn tce-btn--ghost" style={{ padding: "6px 12px", fontSize: 12 }}
                    onClick={() => fileRef.current?.click()}>Change</button>
                  <button className="tce-btn tce-btn--danger" style={{ padding: "6px 12px", fontSize: 12 }}
                    onClick={onRemoveThumbnail}>Remove</button>
                </div>
              </>
            : <div className="tce-thumb-empty">
                <span style={{ fontSize: 28 }}>🖼️</span>
                <span>No thumbnail</span>
                <button className="tce-btn tce-btn--ghost" style={{ marginTop: 6, padding: "6px 14px", fontSize: 12 }}
                  onClick={() => fileRef.current?.click()}>Upload image</button>
              </div>
          }
        </div>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onThumbnailChange(f); }} />
      </div>

      {/* Thumbnail URL */}
      <div className="tce-field">
        <label className="tce-label">Or paste thumbnail URL</label>
        <input
          className="tce-input"
          value={formData.thumbnail_url}
          onChange={(e) => onChange("thumbnail_url", e.target.value)}
          placeholder="https://..."
        />
      </div>

      {/* Tags */}
      <div className="tce-field">
        <label className="tce-label">Tags</label>
        {formData.tags.length > 0 && (
          <div className="tce-tags">
            {formData.tags.map((tag: string) => (
              <span key={tag} className="tce-tag">
                #{tag}
                <button className="tce-tag-x" onClick={() => onChange("tags", formData.tags.filter((t: string) => t !== tag))}>×</button>
              </span>
            ))}
          </div>
        )}
        <div className="tce-tag-input-row">
          <input
            className="tce-input"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
            placeholder="Add tag and press Enter"
          />
          <button className="tce-btn tce-btn--ghost" onClick={addTag} style={{ padding: "9px 14px" }}>+ Add</button>
        </div>
      </div>

      {/* Visibility toggle */}
      <div className="tce-toggle-row">
        <div>
          <div className="tce-toggle-label">Visible to students</div>
          <div className="tce-toggle-hint">If off, students cannot see this course</div>
        </div>
        <label className="tce-switch">
          <input
            type="checkbox"
            checked={formData.is_visible_to_students}
            onChange={(e) => onChange("is_visible_to_students", e.target.checked)}
          />
          <span className="tce-switch-track" />
          <span className="tce-switch-thumb" />
        </label>
      </div>
    </div>
  );
}

/* CourseUnitCard */
interface CourseUnitCardProps {
  unit: Unit;
  index: number;
  total: number;
  onOpen: (unit: Unit) => void;
  onEdit: (unit: Unit) => void;
  onDelete: (unit: Unit) => void;
  onMoveUp: (unit: Unit) => void;
  onMoveDown: (unit: Unit) => void;
}

function CourseUnitCard({ unit, index, total, onOpen, onEdit, onDelete, onMoveUp, onMoveDown }: CourseUnitCardProps) {
  const grad = MODULE_GRADS[index % MODULE_GRADS.length];
  const lvlColor = levelColors[unit.level as LevelKey] || T.violet;
  const cc = unit.content_count || { videos: 0, tasks: 0, tests: 0 };
  const items = [
    cc.videos && `${cc.videos} video${cc.videos !== 1 ? "s" : ""}`,
    cc.tasks  && `${cc.tasks} task${cc.tasks !== 1 ? "s" : ""}`,
    cc.tests  && `${cc.tests} test${cc.tests !== 1 ? "s" : ""}`,
  ].filter(Boolean);

  return (
    <div className="tce-unit-card tce-fade-up" style={{ animationDelay: `${.05 + index * .04}s` }}>
      {/* Drag handle / index */}
      <div className="tce-unit-avatar" style={{ background: grad }}>
        {index + 1}
      </div>

      {/* Info */}
      <div className="tce-unit-info">
        <div className="tce-unit-title">{unit.title}</div>
        <div className="tce-unit-meta">
          <span className={`tce-badge tce-badge--level`} style={{ background: `${lvlColor}18`, color: lvlColor }}>{unit.level}</span>
          <span className={`tce-badge ${statusClass(unit.status)}`}>{statusLabel(unit.status)}</span>
          {items.length > 0 && (
            <span className="tce-badge tce-badge--content">{items.join(" · ")}</span>
          )}
        </div>
      </div>

      {/* Reorder */}
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <button className="tce-reorder-btn" onClick={() => onMoveUp(unit)} disabled={index === 0} title="Move up">▲</button>
        <button className="tce-reorder-btn" onClick={() => onMoveDown(unit)} disabled={index === total - 1} title="Move down">▼</button>
      </div>

      {/* Actions */}
      <div className="tce-unit-actions">
        <button className="tce-icon-btn" title="Open unit" onClick={() => onOpen(unit)}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M5 2h7v7M12 2L2 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <button className="tce-icon-btn" title="Edit unit" onClick={() => onEdit(unit)}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M9.5 1.5l3 3L4 13H1v-3L9.5 1.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
          </svg>
        </button>
        <button className="tce-icon-btn tce-icon-btn--danger" title="Delete unit" onClick={() => onDelete(unit)}>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
            <path d="M2 3.5h9M5.5 3.5V2.5h2v1M5 3.5v7h3V3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>
    </div>
  );
}

/* CourseUnitsSection */
interface CourseUnitsSectionProps {
  units: Unit[];
  onOpenUnit: (unit: Unit) => void;
  onEditUnit: (unit: Unit) => void;
  onDeleteUnit: (unit: Unit) => void;
  onCreateUnit: () => void;
  onMoveUp: (unit: Unit) => void;
  onMoveDown: (unit: Unit) => void;
}

function CourseUnitsSection({ units, onOpenUnit, onEditUnit, onDeleteUnit, onCreateUnit, onMoveUp, onMoveDown }: CourseUnitsSectionProps) {
  const publishedCount = units.filter((u: Unit) => u.status === "published").length;

  return (
    <div className="tce-card tce-fade-up" style={{ animationDelay: ".14s" }}>
      <div className="tce-section-header">
        <div className="tce-section-title">
          <span className="tce-card-title-icon" style={{ background: T.skyL, fontSize: 16 }}>📚</span>
          Units
          <span className="tce-badge" style={{ background: T.violetL, color: T.violet, marginLeft: 4 }}>{units.length}</span>
          {publishedCount > 0 && (
            <span className="tce-badge tce-badge--published" style={{ marginLeft: 2 }}>{publishedCount} published</span>
          )}
        </div>
        <button className="tce-btn tce-btn--add" onClick={onCreateUnit}>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
            <path d="M6.5 1v11M1 6.5h11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
          New Unit
        </button>
      </div>

      {units.length === 0 ? (
        <div className="tce-empty">
          <div className="tce-empty-icon">📦</div>
          <div className="tce-empty-title">No units yet</div>
          <div className="tce-empty-sub">Create the first unit to start building your course</div>
          <button className="tce-btn tce-btn--add" style={{ marginTop: 16 }} onClick={onCreateUnit}>+ Create First Unit</button>
        </div>
      ) : (
        <div className="tce-unit-list">
          {units.map((unit: Unit, i: number) => (
            <CourseUnitCard
              key={unit.id}
              unit={unit}
              index={i}
              total={units.length}
              onOpen={onOpenUnit}
              onEdit={onEditUnit}
              onDelete={onDeleteUnit}
              onMoveUp={onMoveUp}
              onMoveDown={onMoveDown}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* CourseActionsPanel */
interface CourseActionsPanelProps {
  units: Unit[];
  formData: {
    title: string;
    description: string;
    level: string;
    status: string;
    publish_at: string;
    order_index: number;
    thumbnail_url: string;
    duration_hours: number | null;
    tags: string[];
    is_visible_to_students: boolean;
  };
  saving: boolean;
  onSave: () => void;
  onPublish: () => void;
  onDelete: () => void;
}

function CourseActionsPanel({ units, formData, saving, onSave, onPublish, onDelete }: CourseActionsPanelProps) {
  const publishedUnits = units.filter((u: Unit) => u.status === "published").length;
  const isPublished = formData.status === "published";

  return (
    <div className="tce-panel tce-fade-up" style={{ animationDelay: ".18s" }}>
      <div className="tce-panel-title">📋 Course Summary</div>

      <div className="tce-stat-row">
        <span className="tce-stat-label">Total Units</span>
        <span className="tce-stat-value">{units.length}</span>
      </div>
      <div className="tce-stat-row">
        <span className="tce-stat-label">Published Units</span>
        <span className="tce-stat-value" style={{ color: T.lime }}>{publishedUnits}</span>
      </div>
      <div className="tce-stat-row">
        <span className="tce-stat-label">Total Content</span>
        <span className="tce-stat-value">{units.reduce((acc: number, u: Unit) => acc + totalContent(u.content_count), 0)}</span>
      </div>
      <div className="tce-stat-row">
        <span className="tce-stat-label">Level</span>
        <span className="tce-stat-value" style={{ fontSize: 14 }}>{formData.level || "—"}</span>
      </div>
      <div className="tce-stat-row">
        <span className="tce-stat-label">Status</span>
        <span className={`tce-badge ${statusClass(formData.status)}`} style={{ fontSize: 12 }}>
          {statusLabel(formData.status)}
        </span>
      </div>
      {formData.duration_hours && (
        <div className="tce-stat-row">
          <span className="tce-stat-label">Duration</span>
          <span className="tce-stat-value" style={{ fontSize: 14 }}>{formData.duration_hours}h</span>
        </div>
      )}

      <div className="tce-panel-divider" />

      <div className="tce-panel-actions">
        <button className="tce-btn tce-btn--save" style={{ width: "100%", justifyContent: "center" }}
          onClick={onSave} disabled={saving}>
          {saving ? <><span className="tce-spin" />  Saving…</> : "💾 Save Changes"}
        </button>

        {!isPublished ? (
          <button className="tce-btn tce-btn--pub" style={{ width: "100%", justifyContent: "center" }}
            onClick={onPublish} disabled={saving}>
            {saving ? <><span className="tce-spin" />  Publishing…</> : "🚀 Save & Publish"}
          </button>
        ) : (
          <button className="tce-btn tce-btn--pub" style={{ width: "100%", justifyContent: "center", background: `linear-gradient(135deg,${T.lime},${T.sky})` }}
            onClick={onSave} disabled={saving}>
            {saving ? <><span className="tce-spin" />  Updating…</> : "✅ Update Published Course"}
          </button>
        )}

        <div className="tce-panel-divider" style={{ margin: "4px 0" }} />

        <button className="tce-btn tce-btn--danger" style={{ width: "100%", justifyContent: "center", fontSize: 12 }}
          onClick={onDelete}>
          🗑 Delete Course
        </button>
      </div>
    </div>
  );
}

/* ─── Create Unit Modal ───────────────────────────────────────────────────────── */
interface CreateUnitModalProps {
  courseId: number;
  onClose: () => void;
  onCreated: (unit: Unit) => void;
}

function CreateUnitModal({ courseId, onClose, onCreated }: CreateUnitModalProps) {
  const [title, setTitle]   = useState("");
  const [level, setLevel]   = useState<string>("A1");
  const [status, setStatus] = useState<string>("draft");
  const [creating, setCreating] = useState(false);
  const [err, setErr]       = useState("");

  const handleCreate = async () => {
    if (!title.trim()) { setErr("Unit title is required"); return; }
    setCreating(true); setErr("");
    try {
      const unit = await unitsApi.createUnit({
        title: title.trim(),
        level: level as Unit['level'],
        status: status as Unit['status'],
        course_id: courseId,
        order_index: 0,
      });
      onCreated(unit);
    } catch (e: unknown) {
      setErr((e as any)?.response?.data?.detail || "Failed to create unit");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="tce-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="tce-modal">
        <div className="tce-modal-title">➕ Create New Unit</div>

        <div className="tce-field">
          <label className="tce-label">Unit Title *</label>
          <input
            className="tce-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
            placeholder="e.g. Greetings & Introductions"
            autoFocus
          />
        </div>

        <div className="tce-form-row">
          <div className="tce-field" style={{ marginBottom: 0 }}>
            <label className="tce-label">Level</label>
            <select className="tce-input tce-select" value={level} onChange={(e) => setLevel(e.target.value as string)}>
              {["A1","A2","B1","B2","C1","C2","mixed"].map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div className="tce-field" style={{ marginBottom: 0 }}>
            <label className="tce-label">Status</label>
            <select className="tce-input tce-select" value={status} onChange={(e) => setStatus(e.target.value as string)}>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>
          </div>
        </div>

        {err && (
          <div style={{ marginTop: 12, padding: "9px 14px", background: T.redL, borderRadius: 10, color: T.red, fontSize: 13, fontWeight: 600 }}>
            ⚠ {err}
          </div>
        )}

        <div className="tce-modal-actions">
          <button className="tce-btn tce-btn--ghost" onClick={onClose}>Cancel</button>
          <button className="tce-btn tce-btn--pub" onClick={handleCreate} disabled={creating}>
            {creating ? <><span className="tce-spin" />  Creating…</> : "Create Unit"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Confirm Delete Modal ───────────────────────────────────────────────────── */
interface ConfirmModalProps {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}

function ConfirmModal({ message, onConfirm, onCancel, danger = false }: ConfirmModalProps) {
  return (
    <div className="tce-overlay" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="tce-modal">
        <div className="tce-modal-title" style={{ color: danger ? T.red : T.text }}>
          {danger ? "⚠ Confirm Delete" : "Confirm"}
        </div>
        <p style={{ fontSize: 14, color: T.sub, lineHeight: 1.6 }}>{message}</p>
        <div className="tce-modal-actions">
          <button className="tce-btn tce-btn--ghost" onClick={onCancel}>Cancel</button>
          <button className="tce-btn tce-btn--danger" onClick={onConfirm}>Delete</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Loading Skeleton ───────────────────────────────────────────────────────── */
function LoadingSkeleton() {
  return (
    <div className="tce-page">
      <div className="tce-topbar">
        <div className="tce-topbar-left">
          <div className="tce-shimmer" style={{ width: 90, height: 34 }} />
          <div className="tce-shimmer" style={{ width: 200, height: 24 }} />
        </div>
      </div>
      <div className="tce-body">
        <div className="tce-main">
          <div className="tce-card"><div className="tce-shimmer" style={{ height: 280 }} /></div>
          <div className="tce-card"><div className="tce-shimmer" style={{ height: 180 }} /></div>
        </div>
        <div>
          <div className="tce-panel"><div className="tce-shimmer" style={{ height: 320 }} /></div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════════
   MAIN PAGE
   ════════════════════════════════════════════════════════════════════════════════ */
interface ConfirmDeleteState {
  type: 'course' | 'unit';
  item?: Unit;
}

export default function TeacherCourseEditPage() {
  const navigate   = useNavigate();
  const { id: courseId } = useParams<{ id: string }>();
  const id = courseId ? parseInt(courseId, 10) : null;

  /* ── State ── */
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [units,    setUnits]    = useState<Unit[]>([]);
  const [toast,    setToast]    = useState<string | null>(null);
  const [showCreateUnit, setShowCreateUnit] = useState(false);
  const [confirmDelete, setConfirmDelete]   = useState<ConfirmDeleteState | null>(null);
  const [thumbnail, setThumbnail]           = useState<string | null>(null);
  const [thumbFile, setThumbFile]           = useState<File | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    level: "A1",
    status: "draft",
    publish_at: "",
    order_index: 0,
    thumbnail_url: "",
    duration_hours: null,
    tags: [],
    is_visible_to_students: true,
    settings: { allow_enrollment: true, certificate_available: false, max_students: null },
  });

  /* ── Toast helper ── */
  const showToast = useCallback((msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  /* ── Load course + units ── */
  useEffect(() => {
    if (!id || !Number.isFinite(id)) return;
    (async () => {
      setLoading(true);
      try {
        const [course, allUnits] = await Promise.all([
          coursesApi.getAdminCourse(id),
          unitsApi.getAdminUnits(),
        ]);

        const publishAt = course.publish_at
          ? new Date(course.publish_at).toISOString().slice(0, 16)
          : "";

        setFormData({
          title: course.title || "",
          description: course.description || "",
          level: course.level || "A1",
          status: course.status || "draft",
          publish_at: publishAt,
          order_index: course.order_index ?? 0,
          thumbnail_url: course.thumbnail_url || "",
          duration_hours: course.duration_hours || null,
          tags: course.tags || [],
          is_visible_to_students: course.is_visible_to_students ?? true,
          settings: course.settings || { allow_enrollment: true, certificate_available: false, max_students: null },
        });

        // Set thumbnail
        const apiBase = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api/v1";
        if (course.thumbnail_url) {
          setThumbnail(course.thumbnail_url);
        } else if ((course as any).thumbnail_path) {
          setThumbnail(`${apiBase}/static/thumbnails/${(course as any).thumbnail_path.split("/").pop()}`);
        }

        // Filter units for this course
        const courseUnits = (allUnits || [])
          .filter((u) => u.course_id === id)
          .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
        setUnits(courseUnits);
      } catch (err) {
        console.error("Error loading course:", err);
        showToast("❌ Failed to load course");
        navigate("/teacher/courses");
      } finally {
        setLoading(false);
      }
    })();
  }, [id, navigate, showToast]);

  /* ── Form field change ── */
  const handleChange = useCallback((field: string, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }, []);

  /* ── Thumbnail file ── */
  const handleThumbnailChange = useCallback((file: File) => {
    setThumbFile(file);
    const url = URL.createObjectURL(file);
    setThumbnail(url);
    setFormData((prev) => ({ ...prev, thumbnail_url: "" }));
  }, []);

  const handleRemoveThumbnail = useCallback(() => {
    setThumbFile(null);
    setThumbnail(null);
    setFormData((prev) => ({ ...prev, thumbnail_url: "", thumbnail_path: "" }));
  }, []);

  /* ── Save ── */
  const doSave = useCallback(async (publish = false) => {
    if (!id || !Number.isFinite(id)) return;
    if (!formData.title.trim()) { showToast("⚠ Course title is required"); return; }
    setSaving(true);
    try {
      // Upload thumbnail first if file selected
      if (thumbFile) {
        try {
          const res = await coursesApi.uploadThumbnail(id, thumbFile);
          if (res.thumbnail_path) {
            setFormData((prev) => ({ ...prev, thumbnail_path: res.thumbnail_path }));
          }
        } catch {}
        setThumbFile(null);
      }

      const payload = {
        title: formData.title.trim(),
        description: formData.description.trim() || undefined,
        level: formData.level,
        status: publish ? "published" : formData.status,
        publish_at: formData.publish_at || undefined,
        order_index: formData.order_index,
        thumbnail_url: formData.thumbnail_url.trim() || undefined,
        duration_hours: formData.duration_hours || undefined,
        tags: formData.tags.length > 0 ? formData.tags : undefined,
        is_visible_to_students: formData.is_visible_to_students,
        settings: formData.settings,
      };

      await coursesApi.updateCourse(id, payload);

      if (publish) {
        setFormData((prev) => ({ ...prev, status: "published" }));
        showToast("🚀 Course published!");
      } else {
        showToast("💾 Course saved!");
      }
    } catch (err) {
      console.error("Save error:", err);
      showToast("❌ Failed to save course");
    } finally {
      setSaving(false);
    }
  }, [formData, id, thumbFile, showToast]);

  /* ── Delete course ── */
  const handleDeleteCourse = async () => {
    if (!id || !Number.isFinite(id)) return;
    setConfirmDelete(null);
    try {
      await coursesApi.deleteCourse(id);
      navigate("/admin/courses");
    } catch {
      showToast("❌ Failed to delete course");
    }
  };

  /* ── Unit actions ── */
  const handleOpenUnit  = (unit: Unit) => navigate(`/admin/units/${unit.id}`);
  const handleEditUnit  = (unit: Unit) => navigate(`/admin/units/${unit.id}/edit`);

  const handleDeleteUnit = async () => {
    const unit = confirmDelete?.item;
    setConfirmDelete(null);
    if (!unit) return;
    try {
      await unitsApi.deleteUnit(unit.id);
      setUnits((prev) => prev.filter((u) => u.id !== unit.id));
      showToast("🗑 Unit deleted");
    } catch {
      showToast("❌ Failed to delete unit");
    }
  };

  const handleUnitCreated = (unit: Unit) => {
    setShowCreateUnit(false);
    setUnits((prev) => [...prev, unit].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)));
    showToast("✅ Unit created!");
    // Navigate to edit the new unit immediately
    navigate(`/admin/units/${unit.id}/edit`);
  };

  /* ── Reorder helpers (optimistic, persists via order_index update) ── */
  const handleMoveUp = useCallback(async (unit: Unit) => {
    const idx = units.findIndex((u) => u.id === unit.id);
    if (idx <= 0) return;
    const swapped = [...units];
    [swapped[idx - 1], swapped[idx]] = [swapped[idx], swapped[idx - 1]];
    const updated = swapped.map((u, i) => ({ ...u, order_index: i }));
    setUnits(updated);
    try {
      await Promise.all([
        unitsApi.updateUnit(updated[idx - 1].id, { order_index: idx - 1 }),
        unitsApi.updateUnit(updated[idx].id, { order_index: idx }),
      ]);
    } catch { /* revert silently */ }
  }, [units]);

  const handleMoveDown = useCallback(async (unit: Unit) => {
    const idx = units.findIndex((u) => u.id === unit.id);
    if (idx >= units.length - 1) return;
    const swapped = [...units];
    [swapped[idx], swapped[idx + 1]] = [swapped[idx + 1], swapped[idx]];
    const updated = swapped.map((u, i) => ({ ...u, order_index: i }));
    setUnits(updated);
    try {
      await Promise.all([
        unitsApi.updateUnit(updated[idx].id, { order_index: idx }),
        unitsApi.updateUnit(updated[idx + 1].id, { order_index: idx + 1 }),
      ]);
    } catch { /* revert silently */ }
  }, [units]);

  /* ── Render ── */
  if (loading) return (
    <>
      <FontLoader />
      <PageStyles />
      <LoadingSkeleton />
    </>
  );

  return (
    <>
      <FontLoader />
      <PageStyles />

      <div className="tce-page">

        {/* Header */}
        <CourseHeader
          title={formData.title}
          status={formData.status}
          level={formData.level}
          onBack={() => navigate("/admin/courses")}
        />

        {/* Body */}
        <div className="tce-body">

          {/* ── Left: form + units ── */}
          <div className="tce-main">
            <CourseMetadataForm
              formData={formData}
              onChange={handleChange}
              thumbnail={thumbnail}
              onThumbnailChange={handleThumbnailChange}
              onRemoveThumbnail={handleRemoveThumbnail}
            />
            <CourseUnitsSection
              units={units}
              onOpenUnit={handleOpenUnit}
              onEditUnit={handleEditUnit}
              onDeleteUnit={(unit: Unit) => setConfirmDelete({ type: "unit", item: unit })}
              onCreateUnit={() => setShowCreateUnit(true)}
              onMoveUp={handleMoveUp}
              onMoveDown={handleMoveDown}
            />
          </div>

          {/* ── Right: actions panel ── */}
          <div>
            <CourseActionsPanel
              units={units}
              formData={formData}
              saving={saving}
              onSave={() => doSave(false)}
              onPublish={() => doSave(true)}
              onDelete={() => setConfirmDelete({ type: "course" })}
            />
          </div>
        </div>

        {/* ── Toast ── */}
        {toast && <div className="tce-toast">{toast}</div>}

        {/* ── Create unit modal ── */}
        {showCreateUnit && id && Number.isFinite(id) && (
          <CreateUnitModal
            courseId={id}
            onClose={() => setShowCreateUnit(false)}
            onCreated={handleUnitCreated}
          />
        )}

        {/* ── Confirm delete modals ── */}
        {confirmDelete?.type === "course" && (
          <ConfirmModal
            danger
            message={`Are you sure you want to delete "${formData.title}"? This cannot be undone.`}
            onConfirm={handleDeleteCourse}
            onCancel={() => setConfirmDelete(null)}
          />
        )}
        {confirmDelete?.type === "unit" && (
          <ConfirmModal
            danger
            message={`Delete unit "${confirmDelete.item?.title}"? All content inside will be removed.`}
            onConfirm={handleDeleteUnit}
            onCancel={() => setConfirmDelete(null)}
          />
        )}
      </div>
    </>
  );
}