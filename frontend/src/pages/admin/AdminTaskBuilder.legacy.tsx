/**
 * AdminTaskBuilder.jsx — Production-grade Task Builder
 *
 * ── Architecture ──────────────────────────────────────────────────────────
 *
 *   TaskBuilder                   ← full 3-panel authoring shell
 *     ├── TaskSidebar             (left)
 *     │     • task list for unit
 *     │     • status badge per task
 *     │     • type badge
 *     │     • "Add Task" action
 *     ├── [main pane]             (centre)
 *     │     TaskMetadataPanel     — shown when no section selected
 *     │     WritingTaskEditor     — shown when editing writing task content
 *     └── TaskInspector           (right)
 *           • task status / max score / due date
 *           • publish readiness checklist
 *           • save / delete / refresh / publish actions
 *
 *   TaskBuilderPage               ← full-page route wrapper
 *   UnitTaskSection               ← drop-in section card for unit editor
 *
 * ── Backend contract ──────────────────────────────────────────────────────
 *   GET    /admin/tasks               — list (supports ?unit_id=)
 *   POST   /admin/tasks               — create
 *   GET    /admin/tasks/{id}          — get
 *   PUT    /admin/tasks/{id}          — update
 *   DELETE /admin/tasks/{id}          — delete
 *
 * ── Styling ───────────────────────────────────────────────────────────────
 *   All classes share the `.tb-` prefix to reuse TestBuilder CSS tokens.
 *   Task-specific overrides are prefixed `.tkb-`.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
// @ts-ignore
import { T } from "./TeacherOnboarding.legacy";
// ── AI generation (secondary in-builder flow) ──────────────────────────────
import {
  AITaskGenerationWizard,
} from "./AITaskGenerationWizard.legacy";

/* ─── Types ──────────────────────────────────────────────────────────────── */
declare global {
  interface Window {
    __authToken?: string;
  }
}

/* ─── API ────────────────────────────────────────────────────────────────── */
const API = "/api/v1";

const getAuthToken = () => {
  const token = localStorage.getItem("token") || window.__authToken || "";
  const trimmed = token ? token.trim() : "";
  return trimmed.length > 0 ? trimmed : "";
};

async function apiFetch(path: string, opts: any = {}) {
  const token = getAuthToken();
  const { headers: optsHeaders, ...restOpts } = opts;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (optsHeaders) {
    Object.keys(optsHeaders).forEach((k) => {
      if (optsHeaders[k] != null) headers[k] = optsHeaders[k];
    });
  }
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { ...restOpts, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (res.status === 401) throw new Error((body as any).detail || "Authentication failed.");
    throw new Error((body as any).detail || `HTTP ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

async function apiUploadFile(fileType: string, file: File, onProgress?: (progress: number) => void) {
  const token = getAuthToken();
  const formData = new FormData();
  formData.append("file", file);
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API}/admin/tasks/upload-file?file_type=${fileType}`);
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { resolve(JSON.parse(xhr.responseText)); }
        catch { resolve({ url: xhr.responseText, name: file.name }); }
      } else {
        try { reject(new Error(JSON.parse(xhr.responseText).detail || `HTTP ${xhr.status}`)); }
        catch { reject(new Error(`HTTP ${xhr.status}`)); }
      }
    };
    xhr.onerror = () => reject(new Error("Network error during upload."));
    xhr.send(formData);
  });
}

/* ─── Constants ──────────────────────────────────────────────────────────── */
const TASK_TYPES = [
  { type: "writing",  label: "Writing",  icon: "✍",  color: T.violet, colorL: T.violetL },
  { type: "reading",  label: "Reading",  icon: "📖", color: T.sky,    colorL: T.skyL    },
  { type: "listening",label: "Listening",icon: "🎧", color: T.teal,   colorL: T.tealL   },
  { type: "manual",   label: "Manual",   icon: "📋", color: T.amber,  colorL: T.amberL  },
  { type: "auto",     label: "Auto",     icon: "⚡", color: T.lime,   colorL: T.limeL   },
  { type: "practice", label: "Practice", icon: "🏋",  color: T.orange, colorL: T.orangeL },
  { type: "task",     label: "Task",     icon: "✅", color: T.pink,   colorL: T.pinkL   },
];

const TYPE_MAP = Object.fromEntries(TASK_TYPES.map((t) => [t.type, t]));

const statusCfg = (status: string) => {
  switch (status) {
    case "published": return { label: "Published", bg: T.limeL,   col: T.lime,   border: "rgba(13,184,94,.28)"  };
    case "scheduled": return { label: "Scheduled", bg: T.skyL,    col: T.sky,    border: "rgba(0,153,230,.28)"  };
    case "archived":  return { label: "Archived",  bg: T.bg,      col: T.muted,  border: T.border               };
    default:          return { label: "Draft",     bg: T.amberL,  col: T.amber,  border: "rgba(245,166,35,.35)" };
  }
};

/* ─── Empty shapes ───────────────────────────────────────────────────────── */
const emptyTask = (unitId = null) => ({
  title: "", description: "", instructions: "",
  content: "", type: "writing", status: "draft",
  max_score: 100, due_at: "", publish_at: "",
  rubric: "", allow_late_submissions: false,
  late_penalty_percent: 0, max_attempts: null,
  unit_id: unitId,
  assignment_settings: { assign_to_all: true },
  notification_settings: {},
  attachments: [],
  questions: [],
});

/* ═══════════════════════════════════════════════════════════════════════════
   STYLES  (reuses .tb-* classes; task-specific under .tkb-*)
   ═══════════════════════════════════════════════════════════════════════════ */
const TaskBuilderStyles = () => (
  <style>{`
    /* ── Root ── */
    .tb-root {
      position:fixed; inset:0; z-index:1000;
      background:${T.bg}; display:flex; flex-direction:column; overflow:hidden;
    }
    .tb-shell {
      flex:1; display:flex; flex-direction:column;
      background:${T.bg}; overflow:hidden;
      animation:phaseEnter .28s cubic-bezier(.22,.68,0,1.15) both;
    }

    /* ── Topbar ── */
    .tb-topbar {
      display:flex; align-items:center; gap:12px; padding:0 20px;
      height:52px; flex-shrink:0;
      background:linear-gradient(135deg,#1A1035 0%,#0F2D45 100%);
      border-bottom:1px solid rgba(255,255,255,.07);
      box-shadow:0 2px 20px rgba(0,0,0,.28); z-index:30;
    }
    .tb-topbar-icon {
      width:32px; height:32px; border-radius:10px; flex-shrink:0;
      background:linear-gradient(135deg,${T.violet},${T.pink});
      display:flex; align-items:center; justify-content:center; font-size:15px;
    }
    .tb-topbar-title {
      font-family:${T.dFont}; font-size:14px; font-weight:900;
      color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
    }
    .tb-topbar-sub { font-size:11px; color:rgba(255,255,255,.45); white-space:nowrap; flex-shrink:0; }
    .tb-phase-badge {
      padding:3px 10px; border-radius:999px; font-size:10px; font-weight:800;
      letter-spacing:.08em; text-transform:uppercase;
      background:rgba(108,53,222,.25); border:1.5px solid rgba(108,53,222,.55); color:#C4B5FD;
      flex-shrink:0;
    }
    .tb-topbar-divider { width:1px; height:20px; background:rgba(255,255,255,.12); flex-shrink:0; }
    .tb-spacer { flex:1; }
    .tb-unsaved-dot {
      width:7px; height:7px; border-radius:50%;
      background:${T.amber}; flex-shrink:0;
      box-shadow:0 0 6px ${T.amber};
      animation:pulse 1.6s ease-in-out infinite;
    }
    .tb-topbar-btn {
      display:inline-flex; align-items:center; gap:6px; padding:6px 14px;
      border-radius:9px; font-family:${T.dFont}; font-size:11px; font-weight:800;
      cursor:pointer; border:none; transition:all .16s; white-space:nowrap; flex-shrink:0;
    }
    .tb-topbar-btn--close {
      background:rgba(255,255,255,.1); color:rgba(255,255,255,.7);
      border:1.5px solid rgba(255,255,255,.18);
    }
    .tb-topbar-btn--close:hover { background:rgba(255,255,255,.18); color:#fff; }

    /* ── Body ── */
    .tb-body { flex:1; display:flex; overflow:hidden; min-height:0; }

    /* ── Sidebar ── */
    .tb-sidebar {
      width:252px; flex-shrink:0; background:#fff;
      border-right:2px solid ${T.border};
      display:flex; flex-direction:column; overflow:hidden;
    }
    .tb-sidebar-head { padding:14px 16px 10px; border-bottom:2px solid ${T.bg}; flex-shrink:0; }
    .tb-sidebar-label {
      font-size:10px; font-weight:800; letter-spacing:.11em;
      text-transform:uppercase; color:${T.muted}; margin-bottom:8px; display:block;
    }
    .tb-sidebar-title {
      font-family:${T.dFont}; font-size:16px; font-weight:900;
      color:${T.text}; line-height:1.25; margin-bottom:8px; word-break:break-word;
    }
    .tb-sidebar-title--placeholder { color:${T.mutedL}; font-style:italic; }
    .tb-sidebar-unit {
      display:flex; align-items:center; gap:6px;
      font-size:11px; font-weight:700; color:${T.muted};
      background:${T.bg}; border-radius:8px; padding:5px 9px;
      border:1.5px solid ${T.border}; margin-bottom:10px;
    }
    .tb-sidebar-scroll { flex:1; overflow-y:auto; padding:8px 0 16px; }
    .tb-sidebar-scroll::-webkit-scrollbar { width:3px; }
    .tb-sidebar-scroll::-webkit-scrollbar-thumb { background:${T.border}; border-radius:2px; }

    /* Task list header */
    .tb-q-list-hd {
      display:flex; align-items:center; justify-content:space-between;
      padding:8px 16px; font-size:10px; font-weight:800;
      letter-spacing:.1em; text-transform:uppercase; color:${T.muted};
    }
    .tb-q-count-badge {
      padding:2px 7px; border-radius:999px; font-size:10px; font-weight:800;
      background:${T.violetL}; color:${T.violet}; border:1.5px solid rgba(108,53,222,.25);
    }

    /* Task row */
    .tb-q-row {
      display:flex; align-items:flex-start; gap:10px;
      padding:9px 16px; cursor:pointer; transition:all .14s;
      border-left:3px solid transparent; position:relative;
    }
    .tb-q-row:hover { background:${T.bg}; }
    .tb-q-row--active { background:${T.violetL}; border-left-color:${T.violet}; }
    .tb-q-num {
      width:22px; height:22px; border-radius:7px; flex-shrink:0;
      display:flex; align-items:center; justify-content:center;
      font-family:${T.dFont}; font-size:10px; font-weight:900;
      background:${T.bg}; color:${T.muted}; border:1.5px solid ${T.border}; margin-top:1px;
    }
    .tb-q-row--active .tb-q-num {
      background:linear-gradient(135deg,${T.violet},${T.pink}); color:#fff; border-color:transparent;
    }
    .tb-q-text {
      flex:1; min-width:0; font-size:11px; font-weight:700;
      color:${T.text}; line-height:1.45;
      overflow:hidden; display:-webkit-box;
      -webkit-line-clamp:2; -webkit-box-orient:vertical;
    }
    .tb-q-type-badge {
      padding:2px 7px; border-radius:999px; font-size:9px; font-weight:800;
      background:${T.violetL}; color:${T.violet}; border:1.5px solid rgba(108,53,222,.25);
      white-space:nowrap; flex-shrink:0; align-self:flex-start; margin-top:2px;
    }
    .tb-q-del-btn {
      position:absolute; bottom:7px; right:10px;
      width:18px; height:18px; border-radius:5px; border:none;
      background:transparent; color:${T.muted}; cursor:pointer; font-size:11px;
      display:flex; align-items:center; justify-content:center;
      opacity:0; transition:opacity .14s, background .14s;
    }
    .tb-q-row:hover .tb-q-del-btn { opacity:1; }
    .tb-q-del-btn:hover { background:${T.redL}; color:${T.red}; }

    /* Empty state */
    .tb-q-empty { padding:18px 16px; text-align:center; }
    .tb-q-empty-icon { font-size:26px; opacity:.4; margin-bottom:6px; }
    .tb-q-empty-text { font-size:11px; color:${T.muted}; line-height:1.6; white-space:pre-line; }

    /* Add area */
    .tb-add-area { padding:10px 12px; border-top:2px solid ${T.bg}; flex-shrink:0; }
    .tb-add-btn {
      display:flex; align-items:center; gap:8px; width:100%;
      padding:8px 12px; border-radius:10px;
      border:2px dashed ${T.border}; background:transparent;
      font-family:${T.dFont}; font-size:11px; font-weight:800;
      color:${T.muted}; cursor:pointer; transition:all .14s;
    }
    .tb-add-btn:hover { border-color:${T.violet}; color:${T.violet}; background:${T.violetL}; }
    .tb-add-btn:disabled { opacity:.4; cursor:not-allowed; }

    /* ── Main pane ── */
    .tb-main { flex:1; display:flex; flex-direction:column; overflow:hidden; min-width:0; }
    .tb-main-scroll { flex:1; overflow-y:auto; padding:26px 30px 48px; }
    .tb-main-scroll::-webkit-scrollbar { width:4px; }
    .tb-main-scroll::-webkit-scrollbar-thumb { background:${T.border}; border-radius:2px; }

    /* Breadcrumb */
    .tb-breadcrumb {
      display:flex; align-items:center; gap:6px; padding:9px 30px;
      background:#fff; border-bottom:2px solid ${T.border};
      font-size:12px; font-weight:600; color:${T.muted}; flex-shrink:0;
    }
    .tb-breadcrumb-sep { color:${T.border}; font-size:14px; }
    .tb-breadcrumb-link { cursor:pointer; color:${T.muted}; transition:color .12s; }
    .tb-breadcrumb-link:hover { color:${T.violet}; }
    .tb-breadcrumb-active { color:${T.violet}; font-weight:800; }

    /* Form cards */
    .tb-form-card {
      background:#fff; border:2px solid ${T.border}; border-radius:20px;
      padding:24px 26px; animation:fadeUp .3s both;
    }
    .tb-form-card + .tb-form-card { margin-top:14px; }
    .tb-form-card-title {
      font-family:${T.dFont}; font-size:13px; font-weight:900; color:${T.text};
      margin-bottom:14px; display:flex; align-items:center; gap:8px;
    }
    .tb-form-grid { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
    @media (max-width:860px) { .tb-form-grid { grid-template-columns:1fr; } }

    .tb-field { margin-bottom:14px; }
    .tb-field:last-child { margin-bottom:0; }
    .tb-label {
      font-size:10px; font-weight:800; letter-spacing:.1em;
      text-transform:uppercase; color:${T.muted};
      margin-bottom:6px; display:block;
    }
    .tb-label--req::after { content:" *"; color:${T.red}; }
    .tb-input {
      width:100%; border:2px solid ${T.border}; border-radius:11px;
      padding:10px 13px; font-family:${T.bFont}; font-size:13px; color:${T.text};
      background:${T.bg}; outline:none; box-sizing:border-box;
      transition:border-color .15s, box-shadow .15s;
    }
    .tb-input:focus { border-color:${T.violet}; box-shadow:0 0 0 3px ${T.violetL}; background:#fff; }
    .tb-input::placeholder { color:${T.mutedL}; }
    .tb-input--err { border-color:${T.red} !important; box-shadow:0 0 0 3px ${T.redL} !important; }
    .tb-select {
      width:100%; border:2px solid ${T.border}; border-radius:11px;
      padding:9px 13px; font-family:${T.bFont}; font-size:13px; color:${T.text};
      background:${T.bg}; outline:none; cursor:pointer; appearance:none;
      background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%239188C4' d='M6 8L1 3h10z'/%3E%3C/svg%3E");
      background-repeat:no-repeat; background-position:right 13px center;
      transition:border-color .15s; box-sizing:border-box;
    }
    .tb-select:focus { border-color:${T.violet}; box-shadow:0 0 0 3px ${T.violetL}; background-color:#fff; }
    .tb-ta {
      width:100%; border:2px solid ${T.border}; border-radius:11px;
      padding:10px 13px; font-family:${T.bFont}; font-size:13px; color:${T.sub};
      background:${T.bg}; outline:none; resize:vertical; line-height:1.65;
      min-height:70px; transition:border-color .15s, box-shadow .15s; box-sizing:border-box;
    }
    .tb-ta:focus { border-color:${T.violet}; box-shadow:0 0 0 3px ${T.violetL}; background:#fff; }
    .tb-ta--err { border-color:${T.red} !important; }
    .tb-title-input {
      width:100%; border:2px solid transparent; border-radius:11px;
      padding:7px 10px; font-family:${T.dFont}; font-size:24px; font-weight:900;
      color:${T.text}; background:transparent; outline:none; resize:none;
      line-height:1.25; transition:border-color .15s, background .15s; box-sizing:border-box;
    }
    .tb-title-input:hover { background:${T.bg}; border-color:${T.border}; }
    .tb-title-input:focus { border-color:${T.violet}; background:#fff; box-shadow:0 0 0 3px ${T.violetL}; }
    .tb-title-input::placeholder { color:${T.mutedL}; font-style:italic; }

    /* Toggle */
    .tb-toggle { position:relative; width:36px; height:20px; flex-shrink:0; }
    .tb-toggle input { opacity:0; width:0; height:0; position:absolute; }
    .tb-toggle-track {
      position:absolute; inset:0; border-radius:10px; cursor:pointer;
      background:${T.border}; transition:background .18s;
    }
    .tb-toggle input:checked + .tb-toggle-track { background:${T.violet}; }
    .tb-toggle-thumb {
      position:absolute; top:3px; left:3px; width:14px; height:14px;
      border-radius:50%; background:#fff;
      box-shadow:0 1px 4px rgba(0,0,0,.2); transition:transform .18s;
      pointer-events:none;
    }
    .tb-toggle input:checked ~ .tb-toggle-thumb { transform:translateX(16px); }

    /* Error banner */
    .tb-error {
      background:${T.redL}; border:1.5px solid rgba(239,68,68,.25);
      border-radius:10px; padding:9px 12px;
      font-size:12px; font-weight:700; color:${T.red};
      display:flex; align-items:center; gap:8px; margin-bottom:12px;
    }

    /* No-task empty state */
    .tb-no-test {
      display:flex; flex-direction:column; align-items:center; justify-content:center;
      min-height:320px; padding:48px 24px; text-align:center;
    }
    .tb-no-test-icon { font-size:52px; margin-bottom:18px; opacity:.55; }
    .tb-no-test-title { font-family:${T.dFont}; font-size:20px; font-weight:900; color:${T.text}; margin-bottom:8px; }
    .tb-no-test-sub { font-size:13px; color:${T.sub}; line-height:1.7; max-width:300px; margin-bottom:24px; }

    /* ── Inspector ── */
    .tb-inspector {
      width:262px; flex-shrink:0; background:#fff;
      border-left:2px solid ${T.border};
      overflow-y:auto; display:flex; flex-direction:column;
    }
    .tb-inspector::-webkit-scrollbar { width:3px; }
    .tb-inspector::-webkit-scrollbar-thumb { background:${T.border}; border-radius:2px; }
    .tb-insp-sec { padding:14px 15px; border-bottom:2px solid ${T.bg}; }
    .tb-insp-hd {
      font-size:10px; font-weight:800; letter-spacing:.1em;
      text-transform:uppercase; color:${T.muted}; margin-bottom:10px;
    }
    .tb-insp-row {
      display:flex; justify-content:space-between; align-items:center;
      font-size:12px; padding:4px 0;
    }
    .tb-insp-key { color:${T.muted}; font-weight:600; }
    .tb-insp-val {
      font-weight:800; color:${T.text}; text-align:right;
      max-width:130px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
    }

    /* Content stats */
    .ws-content-row { display:flex; align-items:center; gap:10px; padding:6px 0; }
    .ws-content-icon {
      width:30px; height:30px; border-radius:9px; flex-shrink:0;
      display:flex; align-items:center; justify-content:center; font-size:14px;
    }
    .ws-content-info { flex:1; min-width:0; }
    .ws-content-lbl  { font-size:11px; font-weight:800; color:${T.text}; }
    .ws-content-hint { font-size:10px; color:${T.muted}; font-weight:600; }
    .ws-content-pill { padding:2px 8px; border-radius:999px; font-size:10px; font-weight:800; }
    .ws-content-pill--done    { background:${T.limeL}; color:${T.lime}; }
    .ws-content-pill--pending { background:${T.bg}; color:${T.muted}; border:1.5px solid ${T.border}; }

    /* Readiness */
    .tb-readiness-ring-wrap { display:flex; align-items:center; gap:12px; margin-bottom:10px; }
    .tb-readiness-ring {
      width:44px; height:44px; border-radius:50%; flex-shrink:0;
      display:flex; align-items:center; justify-content:center;
      font-family:${T.dFont}; font-size:13px; font-weight:900; color:#fff;
    }
    .tb-check-row { display:flex; align-items:center; gap:8px; padding:5px 0; font-size:11px; font-weight:600; }
    .tb-check-icon {
      width:18px; height:18px; border-radius:5px; flex-shrink:0;
      display:flex; align-items:center; justify-content:center; font-size:10px;
    }
    .tb-check-icon--ok   { background:${T.limeL}; color:${T.lime}; }
    .tb-check-icon--warn { background:${T.redL};  color:${T.red};  }
    .tb-check-icon--info { background:${T.bg};    color:${T.muted}; border:1.5px solid ${T.border}; }

    /* Action buttons */
    .tb-act-btn {
      display:flex; align-items:center; gap:8px; width:100%; padding:9px 12px;
      border-radius:10px; border:2px solid ${T.border}; background:#fff;
      font-size:12px; font-weight:800; color:${T.text}; cursor:pointer;
      transition:all .14s; font-family:${T.bFont}; text-align:left;
    }
    .tb-act-btn + .tb-act-btn { margin-top:6px; }
    .tb-act-btn:hover:not(:disabled) { border-color:${T.violet}; color:${T.violet}; background:${T.violetL}; }
    .tb-act-btn:disabled { opacity:.38; cursor:not-allowed; }
    .tb-act-btn--save {
      background:linear-gradient(135deg,${T.violet},${T.pink});
      border-color:transparent; color:#fff;
      box-shadow:0 4px 14px rgba(108,53,222,.28);
    }
    .tb-act-btn--save:hover:not(:disabled) {
      filter:brightness(1.08); transform:translateY(-1px); color:#fff;
      border-color:transparent; box-shadow:0 6px 18px rgba(108,53,222,.38);
    }
    .tb-act-btn--publish {
      background:linear-gradient(135deg,#0DB85E,#00BCD4);
      border-color:transparent; color:#fff;
      box-shadow:0 4px 14px rgba(13,184,94,.3);
    }
    .tb-act-btn--publish:hover:not(:disabled) {
      filter:brightness(1.07); transform:translateY(-1px); color:#fff;
      border-color:transparent;
    }
    .tb-act-btn--danger { color:${T.red}; border-color:rgba(239,68,68,.25); }
    .tb-act-btn--danger:hover:not(:disabled) { border-color:${T.red}; background:${T.redL}; color:${T.red}; }
    .tb-act-btn-icon {
      width:22px; height:22px; border-radius:7px;
      display:flex; align-items:center; justify-content:center;
      font-size:11px; flex-shrink:0; background:rgba(0,0,0,.05);
    }
    .tb-act-btn--save    .tb-act-btn-icon { background:rgba(255,255,255,.2); }
    .tb-act-btn--publish .tb-act-btn-icon { background:rgba(255,255,255,.2); }

    /* Confirm delete */
    .tb-confirm-del {
      background:${T.redL}; border-radius:11px; padding:10px 12px;
      border:1.5px solid rgba(239,68,68,.2); animation:fadeIn .15s both; margin-top:6px;
    }

    /* Hint box */
    .tb-hint {
      padding:10px 14px; border-radius:11px;
      background:${T.bg}; border:1.5px solid ${T.border};
      font-size:11px; color:${T.muted}; line-height:1.6;
      display:flex; align-items:flex-start; gap:8px;
    }

    /* Primary / ghost button */
    .tb-btn-primary {
      display:inline-flex; align-items:center; gap:7px;
      padding:9px 20px; border-radius:11px; border:none; cursor:pointer;
      font-family:${T.dFont}; font-size:13px; font-weight:900; color:#fff;
      background:linear-gradient(135deg,${T.violet},${T.pink});
      box-shadow:0 4px 14px rgba(108,53,222,.3);
      transition:all .16s;
    }
    .tb-btn-primary:hover:not(:disabled) { filter:brightness(1.07); transform:translateY(-1px); }
    .tb-btn-primary:disabled { opacity:.45; cursor:not-allowed; }
    .tb-btn-ghost {
      display:inline-flex; align-items:center; gap:7px;
      padding:9px 16px; border-radius:11px;
      border:2px solid ${T.border}; background:#fff;
      font-family:${T.dFont}; font-size:12px; font-weight:800; color:${T.muted};
      cursor:pointer; transition:all .14s;
    }
    .tb-btn-ghost:hover { border-color:${T.violet}; color:${T.violet}; background:${T.violetL}; }

    /* Task-type chips (for writing selector) */
    .tkb-type-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; margin-bottom:18px; }
    .tkb-type-chip {
      display:flex; flex-direction:column; align-items:center; gap:6px;
      padding:14px 6px; border-radius:14px; border:2px solid ${T.border};
      background:#fff; cursor:pointer; transition:all .16s cubic-bezier(.22,.68,0,1.3);
      font-family:${T.dFont}; font-size:11px; font-weight:900; color:${T.sub};
    }
    .tkb-type-chip:hover { border-color:${T.violet}; transform:translateY(-2px); }
    .tkb-type-chip--active {
      border-color:transparent; color:#fff; transform:translateY(-2px);
      box-shadow:0 6px 18px rgba(0,0,0,.15);
    }
    .tkb-type-chip-icon { font-size:22px; }

    /* Rubric table */
    .tkb-rubric-row {
      display:flex; gap:8px; padding:8px 10px;
      border-radius:10px; border:1.5px solid ${T.border};
      background:${T.bg}; margin-bottom:8px; align-items:flex-start;
    }
    .tkb-rubric-criterion { flex:2; min-width:0; }
    .tkb-rubric-desc      { flex:3; min-width:0; }
    .tkb-rubric-pts       { width:60px; flex-shrink:0; }
    .tkb-rubric-del {
      width:22px; height:22px; border-radius:6px; border:none;
      background:transparent; cursor:pointer; color:${T.muted}; font-size:13px;
      display:flex; align-items:center; justify-content:center;
      transition:all .14s; flex-shrink:0; margin-top:2px;
    }
    .tkb-rubric-del:hover { background:${T.redL}; color:${T.red}; }

    /* Section tab bar */
    .tkb-tab-bar {
      display:flex; gap:2px;
      padding:10px 30px 0; background:#fff;
      border-bottom:2px solid ${T.border}; flex-shrink:0;
    }
    .tkb-tab {
      padding:8px 16px 10px; font-family:${T.dFont}; font-size:12px; font-weight:800;
      color:${T.muted}; cursor:pointer; border-radius:10px 10px 0 0;
      border:2px solid transparent; border-bottom:none; background:transparent;
      transition:all .14s; position:relative; bottom:-2px;
    }
    .tkb-tab:hover { color:${T.violet}; background:${T.violetL}; }
    .tkb-tab--active {
      color:${T.violet}; background:#fff;
      border-color:${T.border}; border-bottom-color:#fff;
    }

    /* Shimmer */
    .shimmer {
      background:linear-gradient(90deg,#EDE9FF 25%,#F5F3FF 50%,#EDE9FF 75%);
      background-size:600px 100%; animation:shimmer 1.6s infinite linear; border-radius:8px;
    }

    /* Spinner */
    .tb-spin {
      width:14px; height:14px; border-radius:50%; flex-shrink:0;
      border:2.5px solid rgba(255,255,255,.25); border-top-color:#fff;
      animation:spin .75s linear infinite; display:inline-block;
    }
    .tb-spin--dark { border-color:${T.border}; border-top-color:${T.violet}; }

    /* Toast */
    .tb-toast {
      position:fixed; bottom:24px; right:24px; z-index:9999;
      background:#1A1035; color:#fff; padding:10px 18px;
      border-radius:12px; font-size:13px; font-weight:700;
      display:flex; align-items:center; gap:8px;
      animation:saveFlash 2.4s ease both; pointer-events:none;
      box-shadow:0 8px 24px rgba(0,0,0,.25);
    }

    @keyframes fadeIn   { from{opacity:0} to{opacity:1} }
    @keyframes fadeUp   { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:none} }
    @keyframes phaseEnter { from{opacity:0;transform:scale(.98)} to{opacity:1;transform:none} }
    @keyframes spin     { to{transform:rotate(360deg)} }
    @keyframes shimmer  { to{background-position:600px 0} }
    @keyframes pulse    { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.6;transform:scale(1.3)} }
    @keyframes saveFlash {
      0%   { opacity:0; transform:translateY(16px); }
      10%  { opacity:1; transform:translateY(0);    }
      80%  { opacity:1; }
      100% { opacity:0; }
    }

    @media (max-width:1100px) { .tb-inspector { display:none; } }
    @media (max-width:860px)  { .tb-sidebar   { display:none; } }

    /* ── AI generation (topbar button + banners) ── */
    .tb-topbar-btn--ai {
      background:linear-gradient(135deg,rgba(108,53,222,.22),rgba(240,68,124,.18));
      color:#C4B5FD; border:1.5px solid rgba(108,53,222,.45);
    }
    .tb-topbar-btn--ai:hover:not(:disabled) {
      background:linear-gradient(135deg,rgba(108,53,222,.38),rgba(240,68,124,.28));
      color:#fff; border-color:rgba(108,53,222,.75);
    }
    .tb-topbar-btn--ai:disabled { opacity:.4; cursor:not-allowed; }

    /* AI generation inline banners (below topbar, above body) */
    .tkb-gen-banner {
      display:flex; align-items:flex-start; gap:10px;
      padding:9px 20px; flex-shrink:0;
      font-size:12px; font-weight:700;
      animation:fadeIn .22s ease both;
    }
    .tkb-gen-banner--fetching {
      background:rgba(108,53,222,.1);
      border-bottom:1.5px solid rgba(108,53,222,.2); color:${T.violet};
    }
    .tkb-gen-banner--success {
      background:rgba(13,184,94,.07);
      border-bottom:1.5px solid rgba(13,184,94,.2); color:${T.lime};
    }
    .tkb-gen-banner--error {
      background:rgba(239,68,68,.07);
      border-bottom:1.5px solid rgba(239,68,68,.2); color:${T.red};
    }
    .tkb-gen-banner-spin {
      width:13px; height:13px; border-radius:50%; flex-shrink:0;
      border:2px solid rgba(108,53,222,.25); border-top-color:${T.violet};
      animation:spin .75s linear infinite; display:inline-block; margin-top:1px;
    }
    .tkb-gen-banner-dismiss {
      margin-left:auto; background:none; border:none; cursor:pointer;
      font-size:13px; color:inherit; opacity:.65; padding:0 2px; flex-shrink:0;
      line-height:1; transition:opacity .14s;
    }
    .tkb-gen-banner-dismiss:hover { opacity:1; }
    .tkb-gen-retry {
      display:inline-flex; align-items:center; gap:4px;
      margin-left:8px; padding:2px 9px; border-radius:6px;
      font-size:11px; font-weight:800; cursor:pointer;
      background:rgba(239,68,68,.12); color:${T.red};
      border:1.5px solid rgba(239,68,68,.3); transition:all .14s;
    }
    .tkb-gen-retry:hover { background:rgba(239,68,68,.2); }

    /* ── Upload zone ── */
    .tkb-upload-zone {
      border:2.5px dashed ${T.border}; border-radius:18px;
      padding:32px 24px; text-align:center; cursor:pointer;
      background:${T.bg}; transition:all .18s; position:relative; overflow:hidden;
    }
    .tkb-upload-zone:hover,.tkb-upload-zone--drag {
      border-color:${T.violet}; background:${T.violetL}; transform:scale(1.01);
    }
    .tkb-upload-zone--loading { pointer-events:none; opacity:.7; }
    .tkb-upload-zone-icon { font-size:32px; margin-bottom:10px; display:block; opacity:.7; }
    .tkb-upload-zone-title {
      font-family:${T.dFont}; font-size:14px; font-weight:900;
      color:${T.sub}; margin-bottom:4px;
    }
    .tkb-upload-zone-sub { font-size:11px; color:${T.muted}; line-height:1.5; }
    .tkb-upload-zone-btn {
      display:inline-flex; align-items:center; gap:6px; margin-top:12px;
      padding:7px 16px; border-radius:10px;
      background:linear-gradient(135deg,${T.violet},${T.pink});
      border:none; color:#fff; font-family:${T.dFont}; font-size:11px;
      font-weight:800; cursor:pointer;
    }
    .tkb-upload-progress {
      position:absolute; bottom:0; left:0; right:0; height:3px;
      background:${T.violet}; transform-origin:left; transition:width .4s;
    }

    /* ── File list ── */
    .tkb-file-list { display:flex; flex-direction:column; gap:8px; margin-top:12px; }
    .tkb-file-item {
      display:flex; align-items:center; gap:10px;
      padding:10px 12px; border-radius:12px;
      border:1.5px solid ${T.border}; background:#fff;
      transition:border-color .14s;
    }
    .tkb-file-item:hover { border-color:${T.violet}; }
    .tkb-file-icon {
      width:32px; height:32px; border-radius:9px; flex-shrink:0;
      display:flex; align-items:center; justify-content:center; font-size:16px;
    }
    .tkb-file-name {
      flex:1; min-width:0; font-size:12px; font-weight:700; color:${T.text};
      overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
    }
    .tkb-file-size { font-size:10px; color:${T.muted}; font-weight:600; flex-shrink:0; }
    .tkb-file-del {
      width:22px; height:22px; border-radius:6px; border:none;
      background:transparent; cursor:pointer; color:${T.muted};
      display:flex; align-items:center; justify-content:center; font-size:12px;
      transition:all .14s; flex-shrink:0;
    }
    .tkb-file-del:hover { background:${T.redL}; color:${T.red}; }

    /* ── Audio player ── */
    .tkb-audio-player {
      width:100%; border-radius:12px; border:1.5px solid ${T.border};
      background:${T.bg}; padding:8px 12px; box-sizing:border-box;
    }
    .tkb-audio-player audio { width:100%; height:36px; outline:none; }

    /* ── Question editor ── */
    .tkb-qed-row {
      background:#fff; border:2px solid ${T.border}; border-radius:16px;
      padding:16px 18px; margin-bottom:10px;
      transition:border-color .14s;
    }
    .tkb-qed-row:hover { border-color:${T.violet}; }
    .tkb-qed-row--active { border-color:${T.violet}; box-shadow:0 0 0 3px ${T.violetL}; }
    .tkb-qed-row-head {
      display:flex; align-items:center; gap:8px; margin-bottom:12px;
    }
    .tkb-qed-num {
      width:24px; height:24px; border-radius:8px; flex-shrink:0;
      background:linear-gradient(135deg,${T.violet},${T.pink});
      color:#fff; font-family:${T.dFont}; font-size:11px; font-weight:900;
      display:flex; align-items:center; justify-content:center;
    }
    .tkb-qed-type-sel {
      padding:4px 10px; border-radius:8px; font-size:11px; font-weight:800;
      border:1.5px solid ${T.border}; background:${T.bg}; color:${T.sub};
      cursor:pointer; appearance:none; outline:none;
    }
    .tkb-qed-type-sel:focus { border-color:${T.violet}; }
    .tkb-qed-pts {
      padding:4px 8px; border-radius:8px; font-size:11px; font-weight:800;
      border:1.5px solid ${T.border}; background:${T.bg}; color:${T.sub};
      width:60px; outline:none;
    }
    .tkb-qed-pts:focus { border-color:${T.violet}; }
    .tkb-qed-del {
      margin-left:auto; width:22px; height:22px; border-radius:6px;
      border:none; background:transparent; cursor:pointer;
      color:${T.muted}; font-size:12px; display:flex; align-items:center;
      justify-content:center; transition:all .14s; flex-shrink:0;
    }
    .tkb-qed-del:hover { background:${T.redL}; color:${T.red}; }
    .tkb-qed-option-row {
      display:flex; align-items:center; gap:8px; margin-bottom:6px;
    }
    .tkb-qed-option-radio {
      width:16px; height:16px; accent-color:${T.violet}; flex-shrink:0; cursor:pointer;
    }
    .tkb-qed-option-input {
      flex:1; border:1.5px solid ${T.border}; border-radius:8px;
      padding:6px 10px; font-size:12px; color:${T.text}; background:${T.bg};
      outline:none; transition:border-color .14s;
    }
    .tkb-qed-option-input:focus { border-color:${T.violet}; background:#fff; }
    .tkb-qed-option-del {
      width:20px; height:20px; border-radius:5px; border:none;
      background:transparent; cursor:pointer; color:${T.muted};
      display:flex; align-items:center; justify-content:center; font-size:11px;
      transition:all .14s; flex-shrink:0;
    }
    .tkb-qed-option-del:hover { background:${T.redL}; color:${T.red}; }
    .tkb-qed-correct-label {
      font-size:10px; font-weight:800; color:${T.lime};
      padding:2px 7px; border-radius:999px;
      background:${T.limeL}; border:1.5px solid rgba(13,184,94,.25);
      white-space:nowrap;
    }
  `}</style>
);

/* ═══════════════════════════════════════════════════════════════════════════
   TASK SIDEBAR
   ═══════════════════════════════════════════════════════════════════════════ */
function TaskSidebar({
  tasks, selectedTaskId, unitTitle, onSelectTask, onAddTask, onDeleteTask, loading,
}: any) {
  return (
    <div className="tb-sidebar">
      <div className="tb-sidebar-head">
        <span className="tb-sidebar-label">Task Builder</span>
        {unitTitle && (
          <div className="tb-sidebar-unit">
            <span style={{ fontSize: 13 }}>📂</span>
            <span>{unitTitle}</span>
          </div>
        )}
      </div>

      <div className="tb-sidebar-scroll">
        <div className="tb-q-list-hd">
          <span>Tasks</span>
          {tasks.length > 0 && (
            <span className="tb-q-count-badge">{tasks.length}</span>
          )}
        </div>

        {loading ? (
          <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
            {[80, 65, 75].map((_, i) => (
              <div key={i} className="shimmer" style={{ height: 52, borderRadius: 10 }} />
            ))}
          </div>
        ) : tasks.length === 0 ? (
          <div className="tb-q-empty">
            <div className="tb-q-empty-icon">✍</div>
            <div className="tb-q-empty-text">
              {"No tasks yet.\nClick ＋ Add Task\nto get started."}
            </div>
          </div>
        ) : (
          tasks.map((task: any, i: number) => {
            const typeInfo = TYPE_MAP[task.type] || TYPE_MAP.task;
            const sc = statusCfg(task.status);
            const isActive = selectedTaskId === task.id;
            return (
              <div
                key={task.id}
                className={`tb-q-row${isActive ? " tb-q-row--active" : ""}`}
                style={!isActive ? { borderLeftColor: typeInfo.color + "55" } : {}}
                onClick={() => onSelectTask(task.id)}
              >
                <div className="tb-q-num"
                  style={!isActive ? { borderColor: typeInfo.color + "55" } : {}}>
                  {i + 1}
                </div>
                <div style={{ flex: 1, minWidth: 0, paddingRight: 24 }}>
                  <div className="tb-q-text">
                    {task.title || "Untitled task"}
                  </div>
                  <div style={{ display: "flex", gap: 5, marginTop: 4, flexWrap: "wrap" }}>
                    <span className="tb-q-type-badge" style={{
                      background: typeInfo.colorL,
                      color: typeInfo.color,
                      borderColor: typeInfo.color + "44",
                    }}>
                      {typeInfo.icon} {typeInfo.label}
                    </span>
                    <span style={{
                      padding: "2px 7px", borderRadius: 999, fontSize: 9, fontWeight: 800,
                      background: sc.bg, color: sc.col, border: `1.5px solid ${sc.border}`,
                    }}>
                      {sc.label}
                    </span>
                  </div>
                </div>
                <button
                  className="tb-q-del-btn"
                  onClick={(e) => { e.stopPropagation(); onDeleteTask(task.id); }}
                  title="Delete task"
                >✕</button>
              </div>
            );
          })
        )}
      </div>

      <div className="tb-add-area">
        <button className="tb-add-btn" onClick={onAddTask}>
          <span style={{ fontSize: 14 }}>＋</span>
          Add Task
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   TASK METADATA PANEL  (shown when no section selected)
   ═══════════════════════════════════════════════════════════════════════════ */
function TaskMetadataPanel({ draft, onChange, error, isNew }: any) {
  const hc = (field: string) => (e: any) => onChange({ ...draft, [field]: e.target.value });
  const hv = (field: string, val: any) => onChange({ ...draft, [field]: val });

  return (
    <div style={{ maxWidth: 780, animation: "fadeUp .3s both" }}>
      {error && (
        <div className="tb-error">
          <span style={{ fontSize: 16 }}>⚠</span>{error}
        </div>
      )}

      {/* Title */}
      <div className="tb-form-card">
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 14, flexShrink: 0,
            background: `linear-gradient(135deg,${T.violet},${T.pink})`,
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20,
          }}>✍</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <textarea
              className="tb-title-input"
              value={draft.title}
              rows={1}
              onChange={hc("title")}
              onInput={(e: any) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = "auto";
                target.style.height = target.scrollHeight + "px";
              }}
              placeholder="Task title…"
            />
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
              {isNew ? (
                <span style={{
                  fontSize: 11, fontWeight: 800, padding: "2px 9px", borderRadius: 999,
                  background: T.amberL, color: T.amber, border: "1.5px solid rgba(245,166,35,.35)",
                }}>⏱ New draft</span>
              ) : (
                <span style={{
                  fontSize: 11, fontWeight: 800, padding: "2px 9px", borderRadius: 999,
                  background: T.bg, color: T.muted, border: `1.5px solid ${T.border}`,
                }}>✏ Editing task</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Task type */}
      <div className="tb-form-card">
        <div className="tb-form-card-title">🏷 Task Type</div>
        <div className="tkb-type-grid">
          {TASK_TYPES.map((tt) => (
            <div
              key={tt.type}
              className={`tkb-type-chip${draft.type === tt.type ? " tkb-type-chip--active" : ""}`}
              style={draft.type === tt.type ? { background: `linear-gradient(135deg,${tt.color},${tt.color}CC)` } : {}}
              onClick={() => hv("type", tt.type)}
            >
              <span className="tkb-type-chip-icon">{tt.icon}</span>
              {tt.label}
            </div>
          ))}
        </div>
      </div>

      {/* Description / instructions */}
      <div className="tb-form-card">
        <div className="tb-form-card-title">📋 Description &amp; Instructions</div>
        <div className="tb-field">
          <label className="tb-label">Description</label>
          <textarea className="tb-ta" value={draft.description} rows={2}
            onChange={hc("description")} placeholder="Brief overview shown to students…" />
        </div>
        <div className="tb-field">
          <label className="tb-label tb-label--req">Instructions</label>
          <textarea className="tb-ta" value={draft.instructions} rows={4}
            onChange={hc("instructions")} placeholder="Step-by-step instructions for completing this task…" />
        </div>
      </div>

      {/* Settings */}
      <div className="tb-form-card">
        <div className="tb-form-card-title">⚙ Settings</div>
        <div className="tb-form-grid">
          <div className="tb-field">
            <label className="tb-label">Max Score</label>
            <input className="tb-input" type="number" min="0"
              value={draft.max_score} onChange={hc("max_score")} placeholder="100" />
          </div>
          <div className="tb-field">
            <label className="tb-label">Due Date (optional)</label>
            <input className="tb-input" type="datetime-local"
              value={draft.due_at} onChange={hc("due_at")} />
          </div>
          <div className="tb-field">
            <label className="tb-label">Scheduled Publish (optional)</label>
            <input className="tb-input" type="datetime-local"
              value={draft.publish_at} onChange={hc("publish_at")} />
          </div>
          <div className="tb-field">
            <label className="tb-label">Max Attempts</label>
            <input className="tb-input" type="number" min="1"
              value={draft.max_attempts ?? ""}
              onChange={(e) => hv("max_attempts", e.target.value ? Number(e.target.value) : null)}
              placeholder="Unlimited" />
          </div>
        </div>
        <div style={{ display: "flex", gap: 20, marginTop: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <label className="tb-toggle">
              <input type="checkbox" checked={!!draft.allow_late_submissions}
                onChange={(e) => hv("allow_late_submissions", e.target.checked)} />
              <div className="tb-toggle-track" />
              <div className="tb-toggle-thumb" />
            </label>
            <span style={{ fontSize: 12, fontWeight: 700, color: draft.allow_late_submissions ? T.violet : T.muted }}>
              Allow late submissions
            </span>
          </div>
          {draft.allow_late_submissions && (
            <div className="tb-field" style={{ marginBottom: 0 }}>
              <input className="tb-input" type="number" min="0" max="100"
                value={draft.late_penalty_percent}
                onChange={hc("late_penalty_percent")}
                placeholder="0"
                style={{ width: 100 }}
              />
              <span style={{ fontSize: 11, color: T.muted, marginLeft: 6 }}>% penalty</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   WRITING TASK EDITOR
   ═══════════════════════════════════════════════════════════════════════════ */
const uid = () => Math.random().toString(36).slice(2, 10);

function WritingTaskEditor({ draft, onChange, error, isNew }: any) {
  const hc = (field: string) => (e: any) => onChange({ ...draft, [field]: e.target.value });
  const hv = (field: string, val: any) => onChange({ ...draft, [field]: val });

  // Rubric as structured rows
  const rubricRows = (() => {
    try {
      const parsed = typeof draft.rubric === "string" ? JSON.parse(draft.rubric || "[]") : (draft.rubric || []);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  })();

  const setRubric = (rows: any[]) => hv("rubric", JSON.stringify(rows));
  const addRubricRow = () => setRubric([...rubricRows, { id: uid(), criterion: "", description: "", points: 10 }]);
  const updateRubricRow = (id: string, field: string, val: any) =>
    setRubric(rubricRows.map((r: any) => r.id === id ? { ...r, [field]: val } : r));
  const deleteRubricRow = (id: string) => setRubric(rubricRows.filter((r: any) => r.id !== id));

  const [tab, setTab] = useState("prompt");

  return (
    <div style={{ maxWidth: 780, animation: "fadeUp .3s both" }}>
      {error && (
        <div className="tb-error">
          <span style={{ fontSize: 16 }}>⚠</span>{error}
        </div>
      )}

      {/* Title header */}
      <div className="tb-form-card">
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 14, flexShrink: 0,
            background: `linear-gradient(135deg,${T.violet},${T.pink})`,
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20,
          }}>✍</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <textarea
              className="tb-title-input"
              value={draft.title}
              rows={1}
              onChange={hc("title")}
              onInput={(e: any) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = "auto";
                target.style.height = target.scrollHeight + "px";
              }}
              placeholder="Task title…"
            />
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
              <span style={{
                padding: "2px 9px", borderRadius: 999, fontSize: 10, fontWeight: 800,
                background: T.violetL, color: T.violet, border: "1.5px solid rgba(108,53,222,.25)",
              }}>✍ Writing Task</span>
              <span style={{
                padding: "2px 9px", borderRadius: 999, fontSize: 10, fontWeight: 800,
                background: T.amberL, color: T.amber, border: "1.5px solid rgba(245,166,35,.35)",
              }}>
                {draft.max_score || 100} pts max
              </span>
              {isNew && (
                <span style={{
                  padding: "2px 9px", borderRadius: 999, fontSize: 10, fontWeight: 800,
                  background: T.amberL, color: T.amber, border: "1.5px solid rgba(245,166,35,.35)",
                }}>⏱ New draft</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="tkb-tab-bar">
        {[
          { id: "prompt",       label: "✍ Prompt"       },
          { id: "instructions", label: "📋 Instructions" },
          { id: "rubric",       label: "🏆 Rubric"       },
          { id: "settings",     label: "⚙ Settings"      },
        ].map((t) => (
          <button
            key={t.id}
            className={`tkb-tab${tab === t.id ? " tkb-tab--active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab: Prompt */}
      {tab === "prompt" && (
        <div className="tb-form-card" style={{ borderRadius: "0 0 20px 20px", borderTop: "none" }}>
          <div className="tb-form-card-title">✍ Writing Prompt</div>
          <div className="tb-field">
            <label className="tb-label tb-label--req">Prompt / Assignment Body</label>
            <textarea
              className="tb-ta"
              rows={8}
              value={draft.content}
              onChange={hc("content")}
              placeholder="Write a persuasive essay arguing for or against…&#10;&#10;Your response should:&#10;• Be at least 300 words&#10;• Include a clear thesis&#10;• Use supporting evidence"
            />
          </div>
          <div className="tb-field">
            <label className="tb-label">Description (shown as task subtitle)</label>
            <textarea className="tb-ta" rows={2}
              value={draft.description} onChange={hc("description")}
              placeholder="Brief overview of this writing task…" />
          </div>
          <div className="tb-hint">
            <span>💡</span>
            <span>
              The prompt is the main writing assignment students will see. Be clear about length,
              format, and any specific requirements.
            </span>
          </div>
        </div>
      )}

      {/* Tab: Instructions */}
      {tab === "instructions" && (
        <div className="tb-form-card" style={{ borderRadius: "0 0 20px 20px", borderTop: "none" }}>
          <div className="tb-form-card-title">📋 Student Instructions</div>
          <div className="tb-field">
            <label className="tb-label tb-label--req">Instructions</label>
            <textarea
              className="tb-ta"
              rows={8}
              value={draft.instructions}
              onChange={hc("instructions")}
              placeholder="1. Read the prompt carefully before writing.&#10;2. Plan your response in the space below.&#10;3. Write a well-structured essay with an introduction, body paragraphs, and conclusion.&#10;4. Review your work before submitting."
            />
          </div>
          <div className="tb-hint">
            <span>💡</span>
            <span>
              Instructions appear at the top of the student task view. Use numbered steps
              to make expectations clear.
            </span>
          </div>
        </div>
      )}

      {/* Tab: Rubric */}
      {tab === "rubric" && (
        <div className="tb-form-card" style={{ borderRadius: "0 0 20px 20px", borderTop: "none" }}>
          <div className="tb-form-card-title">🏆 Grading Rubric</div>

          {rubricRows.length === 0 ? (
            <div style={{
              padding: "32px 24px", textAlign: "center",
              background: T.bg, borderRadius: 16, border: `2px dashed ${T.border}`,
              marginBottom: 14,
            }}>
              <div style={{ fontSize: 32, marginBottom: 10, opacity: .5 }}>🏆</div>
              <div style={{ fontFamily: T.dFont, fontSize: 15, fontWeight: 900, color: T.muted, marginBottom: 6 }}>
                No rubric yet
              </div>
              <div style={{ fontSize: 12, color: T.mutedL }}>
                Add criteria to guide grading and show students how they'll be evaluated.
              </div>
            </div>
          ) : (
            <>
              {/* Column headers */}
              <div style={{
                display: "flex", gap: 8, padding: "0 10px",
                marginBottom: 6, fontSize: 10, fontWeight: 800,
                letterSpacing: ".1em", textTransform: "uppercase", color: T.muted,
              }}>
                <span style={{ flex: 2 }}>Criterion</span>
                <span style={{ flex: 3 }}>Description</span>
                <span style={{ width: 60 }}>Pts</span>
                <span style={{ width: 22 }} />
              </div>
              {rubricRows.map((row) => (
                <div key={row.id} className="tkb-rubric-row">
                  <div className="tkb-rubric-criterion">
                    <input
                      className="tb-input"
                      value={row.criterion}
                      onChange={(e) => updateRubricRow(row.id, "criterion", e.target.value)}
                      placeholder="e.g. Clarity"
                    />
                  </div>
                  <div className="tkb-rubric-desc">
                    <textarea
                      className="tb-ta"
                      rows={2}
                      value={row.description}
                      onChange={(e) => updateRubricRow(row.id, "description", e.target.value)}
                      placeholder="What earns full marks…"
                    />
                  </div>
                  <div className="tkb-rubric-pts">
                    <input
                      className="tb-input"
                      type="number"
                      min="0"
                      value={row.points}
                      onChange={(e) => updateRubricRow(row.id, "points", Number(e.target.value))}
                    />
                  </div>
                  <button className="tkb-rubric-del" onClick={() => deleteRubricRow(row.id)}>✕</button>
                </div>
              ))}
              <div style={{
                marginTop: 8, padding: "6px 10px", borderRadius: 8,
                background: T.amberL, fontSize: 11, fontWeight: 800, color: T.amber,
                display: "inline-flex", alignItems: "center", gap: 6,
              }}>
                🏆 Total rubric points: {rubricRows.reduce((s, r) => s + (Number(r.points) || 0), 0)}
              </div>
            </>
          )}

          <button
            style={{
              display: "flex", alignItems: "center", gap: 8, marginTop: 14,
              padding: "8px 14px", borderRadius: 10,
              border: `2px dashed ${T.border}`, background: "transparent",
              fontFamily: T.dFont, fontSize: 11, fontWeight: 800,
              color: T.muted, cursor: "pointer", transition: "all .14s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.violet; e.currentTarget.style.color = T.violet; e.currentTarget.style.background = T.violetL; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.muted; e.currentTarget.style.background = "transparent"; }}
            onClick={addRubricRow}
          >
            <span>＋</span> Add criterion
          </button>

          <div className="tb-hint" style={{ marginTop: 14 }}>
            <span>💡</span>
            <span>
              The rubric helps teachers grade consistently and shows students how their work is evaluated.
              Points here are for guidance — the task's max score is set in Settings.
            </span>
          </div>
        </div>
      )}

      {/* Tab: Settings */}
      {tab === "settings" && (
        <div className="tb-form-card" style={{ borderRadius: "0 0 20px 20px", borderTop: "none" }}>
          <div className="tb-form-card-title">⚙ Task Settings</div>
          <div className="tb-form-grid">
            <div className="tb-field">
              <label className="tb-label">Max Score</label>
              <input className="tb-input" type="number" min="0"
                value={draft.max_score} onChange={hc("max_score")} placeholder="100" />
            </div>
            <div className="tb-field">
              <label className="tb-label">Due Date (optional)</label>
              <input className="tb-input" type="datetime-local"
                value={draft.due_at} onChange={hc("due_at")} />
            </div>
            <div className="tb-field">
              <label className="tb-label">Scheduled Publish (optional)</label>
              <input className="tb-input" type="datetime-local"
                value={draft.publish_at} onChange={hc("publish_at")} />
            </div>
            <div className="tb-field">
              <label className="tb-label">Max Attempts</label>
              <input className="tb-input" type="number" min="1"
                value={draft.max_attempts ?? ""}
                onChange={(e) => hv("max_attempts", e.target.value ? Number(e.target.value) : null)}
                placeholder="Unlimited" />
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
            <label className="tb-toggle">
              <input type="checkbox" checked={!!draft.allow_late_submissions}
                onChange={(e) => hv("allow_late_submissions", e.target.checked)} />
              <div className="tb-toggle-track" />
              <div className="tb-toggle-thumb" />
            </label>
            <span style={{ fontSize: 12, fontWeight: 700, color: draft.allow_late_submissions ? T.violet : T.muted }}>
              Allow late submissions
            </span>
          </div>
          {draft.allow_late_submissions && (
            <div className="tb-field" style={{ marginTop: 10 }}>
              <label className="tb-label">Late Penalty (%)</label>
              <input className="tb-input" type="number" min="0" max="100"
                value={draft.late_penalty_percent} onChange={hc("late_penalty_percent")}
                placeholder="0" style={{ maxWidth: 160 }} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   DOCUMENT UPLOADER  (reading tasks)
   ═══════════════════════════════════════════════════════════════════════════ */
const READING_ACCEPT = ".pdf,.doc,.docx,.txt,.md,.rtf";

function fileIcon(name = "") {
  const ext = (name.split(".").pop() || "").toLowerCase();
  if (ext === "pdf") return "📄";
  if (["doc","docx"].includes(ext)) return "📝";
  if (["mp3","m4a","ogg","wav","aac"].includes(ext)) return "🎵";
  if (["mp4","webm","ogv","mov"].includes(ext)) return "🎬";
  return "📎";
}
function fmtBytes(n: number | undefined) {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function DocumentUploader({ attachments, onChange, disabled: _disabled }: any) {
  const [uploading, setUploading] = useState(false);
  const [progress,  setProgress]  = useState(0);
  const [error,     setError]     = useState<string | null>(null);
  const [drag,      setDrag]      = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const doUpload = async (file: File) => {
    setError(null);
    setUploading(true);
    setProgress(0);
    try {
      const result: any = await apiUploadFile("reading", file, setProgress);
      const att = {
        id:   result.id   || uid(),
        name: result.name || result.filename || file.name,
        url:  result.url  || result.file_url || "",
        size: result.size || file.size,
        type: result.type || file.type,
      };
      onChange([...attachments, att]);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  const handleFiles = (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    doUpload(f);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault(); setDrag(false);
    handleFiles(e.dataTransfer.files);
  };

  return (
    <div>
      {error && (
        <div className="tb-error" style={{ marginBottom: 10 }}>
          <span>⚠</span>{error}
        </div>
      )}

      <div
        className={`tkb-upload-zone${uploading ? " tkb-upload-zone--loading" : ""}${drag ? " tkb-upload-zone--drag" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={handleDrop}
        onClick={() => !uploading && inputRef.current?.click()}
      >
        <span className="tkb-upload-zone-icon">📄</span>
        <div className="tkb-upload-zone-title">
          {uploading ? "Uploading document…" : "Drop a document here"}
        </div>
        <div className="tkb-upload-zone-sub">
          PDF, Word, TXT, Markdown · Up to 20 MB
        </div>
        {!uploading && (
          <button className="tkb-upload-zone-btn" onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}>
            📎 Choose file
          </button>
        )}
        {uploading && (
          <div className="tkb-upload-progress" style={{ width: `${progress}%` }} />
        )}
      </div>

      <input
        ref={inputRef} type="file" accept={READING_ACCEPT}
        style={{ display: "none" }}
        onChange={(e) => handleFiles(e.target.files)}
      />

      {attachments.length > 0 && (
        <div className="tkb-file-list">
          {attachments.map((att: any) => (
            <div key={att.id} className="tkb-file-item">
              <div className="tkb-file-icon" style={{ background: T.skyL }}>{fileIcon(att.name)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="tkb-file-name">{att.name}</div>
                {att.size && <div className="tkb-file-size">{fmtBytes(att.size)}</div>}
              </div>
              {att.url && (
                <a href={att.url} target="_blank" rel="noreferrer"
                  style={{ fontSize: 11, color: T.sky, fontWeight: 700, textDecoration: "none", flexShrink: 0 }}
                  onClick={(e) => e.stopPropagation()}>
                  Open ↗
                </a>
              )}
              <button className="tkb-file-del"
                onClick={() => onChange(attachments.filter((a: any) => a.id !== att.id))}>
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   AUDIO/VIDEO UPLOADER  (listening tasks)
   ═══════════════════════════════════════════════════════════════════════════ */
const LISTENING_ACCEPT = ".mp3,.m4a,.ogg,.wav,.aac,.mp4,.webm,.mov";

function AudioUploader({ attachments, onChange, disabled: _disabled }: any) {
  const [uploading, setUploading] = useState(false);
  const [progress,  setProgress]  = useState(0);
  const [error,     setError]     = useState<string | null>(null);
  const [drag,      setDrag]      = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const doUpload = async (file: File) => {
    setError(null);
    setUploading(true);
    setProgress(0);
    try {
      const result: any = await apiUploadFile("listening", file, setProgress);
      const att = {
        id:       result.id       || uid(),
        name:     result.name     || result.filename || file.name,
        url:      result.url      || result.file_url || "",
        size:     result.size     || file.size,
        type:     result.type     || file.type || file.name.split(".").pop() || "",
        mediaType: file.type || "",
      };
      onChange([...attachments, att]);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  const handleFiles = (files: FileList | null) => {
    const f = files?.[0]; if (!f) return;
    doUpload(f);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault(); setDrag(false);
    handleFiles(e.dataTransfer.files);
  };

  const isVideo = (att: any) => {
    const ext = ((att.name || "").split(".").pop() || "").toLowerCase();
    return ["mp4","webm","mov","ogv"].includes(ext) || (att.mediaType || "").startsWith("video");
  };

  return (
    <div>
      {error && (
        <div className="tb-error" style={{ marginBottom: 10 }}>
          <span>⚠</span>{error}
        </div>
      )}

      <div
        className={`tkb-upload-zone${uploading ? " tkb-upload-zone--loading" : ""}${drag ? " tkb-upload-zone--drag" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={handleDrop}
        onClick={() => !uploading && inputRef.current?.click()}
      >
        <span className="tkb-upload-zone-icon">🎧</span>
        <div className="tkb-upload-zone-title">
          {uploading ? "Uploading media…" : "Drop audio or video here"}
        </div>
        <div className="tkb-upload-zone-sub">
          MP3, M4A, WAV, OGG, MP4, WebM · Up to 200 MB
        </div>
        {!uploading && (
          <button className="tkb-upload-zone-btn" onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}>
            🎵 Choose file
          </button>
        )}
        {uploading && (
          <div className="tkb-upload-progress" style={{ width: `${progress}%` }} />
        )}
      </div>

      <input
        ref={inputRef} type="file" accept={LISTENING_ACCEPT}
        style={{ display: "none" }}
        onChange={(e) => handleFiles(e.target.files)}
      />

      {attachments.length > 0 && (
        <div className="tkb-file-list">
          {attachments.map((att: { id: string; name: string; url?: string; size?: number; mediaType?: string }) => (
            <div key={att.id} style={{ marginBottom: 8 }}>
              <div className="tkb-file-item">
                <div className="tkb-file-icon" style={{ background: T.tealL }}>{fileIcon(att.name)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="tkb-file-name">{att.name}</div>
                  {att.size && <div className="tkb-file-size">{fmtBytes(att.size)}</div>}
                </div>
                {att.url && (
                  <a href={att.url} target="_blank" rel="noreferrer"
                    style={{ fontSize: 11, color: T.teal, fontWeight: 700, textDecoration: "none", flexShrink: 0 }}
                    onClick={(e) => e.stopPropagation()}>
                    Open ↗
                  </a>
                )}
                <button className="tkb-file-del"
                  onClick={() => onChange(attachments.filter((a: any) => a.id !== att.id))}>
                  ✕
                </button>
              </div>

              {/* Inline preview */}
              {att.url && (
                <div className="tkb-audio-player">
                  {isVideo(att) ? (
                    <video src={att.url} controls style={{ width: "100%", borderRadius: 8, maxHeight: 200 }} />
                  ) : (
                    <audio src={att.url} controls style={{ width: "100%" }} />
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   TASK QUESTION EDITOR  (shared by reading & listening)
   ═══════════════════════════════════════════════════════════════════════════ */
const Q_TYPES = [
  { value: "multiple_choice", label: "Multiple choice" },
  { value: "single_choice",   label: "Single choice"   },
  { value: "true_false",      label: "True / False"    },
  { value: "short_answer",    label: "Short answer"    },
];

function emptyQuestion() {
  return {
    id: uid(), type: "single_choice",
    question: "", options: ["", ""], correct_answer: "", points: 2,
  };
}

function TaskQuestionEditor({ questions, onChange }: any) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const addQuestion = () => {
    const q = emptyQuestion();
    onChange([...questions, q]);
    setActiveId(q.id);
  };

  const updateQ = (id: string, patch: any) =>
    onChange(questions.map((q: any) => q.id === id ? { ...q, ...patch } : q));

  const deleteQ = (id: string) => {
    onChange(questions.filter((q: any) => q.id !== id));
    if (activeId === id) setActiveId(null);
  };

  const updateOption = (qid: string, idx: number, val: string) => {
    const q = questions.find((x: any) => x.id === qid);
    if (!q) return;
    const opts = [...(q.options || [])];
    opts[idx] = val;
    updateQ(qid, { options: opts });
  };

  const addOption = (qid: string) => {
    const q = questions.find((x: any) => x.id === qid);
    if (!q) return;
    updateQ(qid, { options: [...(q.options || []), ""] });
  };

  const removeOption = (qid: string, idx: number) => {
    const q = questions.find((x: any) => x.id === qid);
    if (!q) return;
    const opts = (q.options || []).filter((_: any, i: number) => i !== idx);
    updateQ(qid, { options: opts });
  };

  return (
    <div>
      {questions.length === 0 ? (
        <div style={{
          padding: "32px 24px", textAlign: "center",
          background: T.bg, borderRadius: 16, border: `2px dashed ${T.border}`,
          marginBottom: 14,
        }}>
          <div style={{ fontSize: 32, marginBottom: 10, opacity: .5 }}>❓</div>
          <div style={{ fontFamily: T.dFont, fontSize: 14, fontWeight: 900, color: T.muted, marginBottom: 6 }}>
            No comprehension questions yet
          </div>
          <div style={{ fontSize: 11, color: T.mutedL }}>
            Add questions to test understanding.
          </div>
        </div>
      ) : (
        questions.map((q: any, idx: number) => (
          <div
            key={q.id}
            className={`tkb-qed-row${activeId === q.id ? " tkb-qed-row--active" : ""}`}
            onClick={() => setActiveId(q.id)}
          >
            <div className="tkb-qed-row-head">
              <div className="tkb-qed-num">{idx + 1}</div>
              <select
                className="tkb-qed-type-sel"
                value={q.type}
                onChange={(e) => {
                  const t = e.target.value;
                  const patch: any = { type: t };
                  if (t === "true_false") patch.options = ["True", "False"];
                  if (t === "short_answer") patch.options = [];
                  updateQ(q.id, patch);
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {Q_TYPES.map((qt) => (
                  <option key={qt.value} value={qt.value}>{qt.label}</option>
                ))}
              </select>
              <input
                className="tkb-qed-pts"
                type="number" min="0" value={q.points}
                onChange={(e) => updateQ(q.id, { points: Number(e.target.value) })}
                onClick={(e) => e.stopPropagation()}
                title="Points"
              />
              <span style={{ fontSize: 10, color: T.muted, fontWeight: 700 }}>pts</span>
              <button className="tkb-qed-del" onClick={(e) => { e.stopPropagation(); deleteQ(q.id); }}>✕</button>
            </div>

            {/* Question text */}
            <div className="tb-field" style={{ marginBottom: 10 }}>
              <textarea
                className="tb-ta"
                rows={2}
                value={q.question}
                onChange={(e) => updateQ(q.id, { question: e.target.value })}
                placeholder={`Question ${idx + 1}…`}
                onClick={(e) => e.stopPropagation()}
              />
            </div>

            {/* Options (choice types) */}
            {["multiple_choice","single_choice","true_false"].includes(q.type) && (
              <div>
                <div style={{
                  fontSize: 10, fontWeight: 800, letterSpacing: ".1em",
                  textTransform: "uppercase", color: T.muted, marginBottom: 6,
                }}>
                  {q.type === "multiple_choice" ? "Options (check all correct)" : "Options (select correct)"}
                </div>
                {(q.options || []).map((opt: string, oi: number) => {
                  const isCorrect = q.type === "multiple_choice"
                    ? (Array.isArray(q.correct_answer) ? q.correct_answer.includes(opt) : false)
                    : q.correct_answer === opt;
                  return (
                    <div key={oi} className="tkb-qed-option-row">
                      {q.type === "multiple_choice" ? (
                        <input
                          type="checkbox" checked={isCorrect}
                          className="tkb-qed-option-radio"
                          onChange={(e) => {
                            const arr = Array.isArray(q.correct_answer) ? [...q.correct_answer] : [];
                            updateQ(q.id, {
                              correct_answer: e.target.checked ? [...arr, opt] : arr.filter((x) => x !== opt),
                            });
                          }}
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <input
                          type="radio" checked={isCorrect} readOnly
                          className="tkb-qed-option-radio"
                          onChange={() => updateQ(q.id, { correct_answer: opt })}
                          onClick={(e) => { e.stopPropagation(); updateQ(q.id, { correct_answer: opt }); }}
                        />
                      )}
                      <input
                        className="tkb-qed-option-input"
                        value={opt}
                        onChange={(e) => updateOption(q.id, oi, e.target.value)}
                        placeholder={`Option ${oi + 1}…`}
                        onClick={(e) => e.stopPropagation()}
                        readOnly={q.type === "true_false"}
                      />
                      {isCorrect && <span className="tkb-qed-correct-label">✓ Correct</span>}
                      {q.type !== "true_false" && (q.options || []).length > 2 && (
                        <button className="tkb-qed-option-del"
                          onClick={(e) => { e.stopPropagation(); removeOption(q.id, oi); }}>
                          ✕
                        </button>
                      )}
                    </div>
                  );
                })}
                {q.type !== "true_false" && (
                  <button
                    style={{
                      display: "flex", alignItems: "center", gap: 6, marginTop: 4,
                      padding: "5px 10px", borderRadius: 8,
                      border: `1.5px dashed ${T.border}`, background: "transparent",
                      fontSize: 11, fontWeight: 800, color: T.muted, cursor: "pointer",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.violet; e.currentTarget.style.color = T.violet; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.muted; }}
                    onClick={(e) => { e.stopPropagation(); addOption(q.id); }}
                  >
                    ＋ Add option
                  </button>
                )}
              </div>
            )}

            {/* Short answer */}
            {q.type === "short_answer" && (
              <div className="tb-field" style={{ marginBottom: 0 }}>
                <label className="tb-label">Model answer (optional)</label>
                <textarea
                  className="tb-ta" rows={2}
                  value={q.correct_answer || ""}
                  onChange={(e) => updateQ(q.id, { correct_answer: e.target.value })}
                  placeholder="Expected answer for teacher reference…"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            )}
          </div>
        ))
      )}

      <button
        className="tb-add-btn"
        style={{ marginTop: 4 }}
        onClick={addQuestion}
      >
        <span style={{ fontSize: 14 }}>＋</span>
        Add question
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   READING TASK EDITOR
   ═══════════════════════════════════════════════════════════════════════════ */
function ReadingTaskEditor({ draft, onChange, error, isNew }: any) {
  const hc = (field: string) => (e: any) => onChange({ ...draft, [field]: e.target.value });
  const hv = (field: string, val: any) => onChange({ ...draft, [field]: val });

  const rubricRows = (() => {
    try {
      const parsed = typeof draft.rubric === "string" ? JSON.parse(draft.rubric || "[]") : (draft.rubric || []);
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  })();
  const setRubric = (rows: { id: string; criterion: string; description: string; points: number }[]) => hv("rubric", JSON.stringify(rows));
  const addRubricRow = () => setRubric([...rubricRows, { id: uid(), criterion: "", description: "", points: 5 }]);
  const updateRubricRow = (id: string, field: string, val: any) =>
    setRubric(rubricRows.map((r: { id: string; criterion: string; description: string; points: number }) => r.id === id ? { ...r, [field]: val } : r));
  const deleteRubricRow = (id: string) => setRubric(rubricRows.filter((r: { id: string; criterion: string; description: string; points: number }) => r.id !== id));

  const attachments = Array.isArray(draft.attachments) ? draft.attachments : [];
  const questions   = Array.isArray(draft.questions)   ? draft.questions   : [];

  const [tab, setTab] = useState("reading");

  return (
    <div style={{ maxWidth: 780, animation: "fadeUp .3s both" }}>
      {error && (
        <div className="tb-error">
          <span style={{ fontSize: 16 }}>⚠</span>{error}
        </div>
      )}

      {/* Title header */}
      <div className="tb-form-card">
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 14, flexShrink: 0,
            background: `linear-gradient(135deg,${T.sky},#00BCD4)`,
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20,
          }}>📖</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <textarea
              className="tb-title-input"
              value={draft.title} rows={1}
              onChange={hc("title")}
              onInput={(e: any) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = "auto";
                target.style.height = target.scrollHeight + "px";
              }}
              placeholder="Reading task title…"
            />
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
              <span style={{
                padding: "2px 9px", borderRadius: 999, fontSize: 10, fontWeight: 800,
                background: T.skyL, color: T.sky, border: "1.5px solid rgba(0,153,230,.25)",
              }}>📖 Reading Task</span>
              <span style={{
                padding: "2px 9px", borderRadius: 999, fontSize: 10, fontWeight: 800,
                background: T.amberL, color: T.amber, border: "1.5px solid rgba(245,166,35,.35)",
              }}>
                {draft.max_score || 100} pts max
              </span>
              {attachments.length > 0 && (
                <span style={{
                  padding: "2px 9px", borderRadius: 999, fontSize: 10, fontWeight: 800,
                  background: T.limeL, color: T.lime, border: "1.5px solid rgba(13,184,94,.25)",
                }}>
                  {attachments.length} doc{attachments.length !== 1 ? "s" : ""} uploaded
                </span>
              )}
              {questions.length > 0 && (
                <span style={{
                  padding: "2px 9px", borderRadius: 999, fontSize: 10, fontWeight: 800,
                  background: T.violetL, color: T.violet, border: "1.5px solid rgba(108,53,222,.25)",
                }}>
                  {questions.length} question{questions.length !== 1 ? "s" : ""}
                </span>
              )}
              {isNew && (
                <span style={{
                  padding: "2px 9px", borderRadius: 999, fontSize: 10, fontWeight: 800,
                  background: T.amberL, color: T.amber, border: "1.5px solid rgba(245,166,35,.35)",
                }}>⏱ New draft</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="tkb-tab-bar">
        {[
          { id: "reading",      label: "📖 Reading Material" },
          { id: "instructions", label: "📋 Instructions"      },
          { id: "questions",    label: `❓ Questions${questions.length ? ` (${questions.length})` : ""}` },
          { id: "rubric",       label: "🏆 Rubric"            },
          { id: "settings",     label: "⚙ Settings"           },
        ].map((t) => (
          <button key={t.id} className={`tkb-tab${tab === t.id ? " tkb-tab--active" : ""}`}
            onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab: Reading Material */}
      {tab === "reading" && (
        <div className="tb-form-card" style={{ borderRadius: "0 0 20px 20px", borderTop: "none" }}>
          <div className="tb-form-card-title">📖 Reading Material</div>

          <div className="tb-field">
            <label className="tb-label">Article Text (inline)</label>
            <textarea
              className="tb-ta" rows={10}
              value={draft.content}
              onChange={hc("content")}
              placeholder="Paste or type the reading text here. Students will read this directly in the task view.&#10;&#10;You can also upload a document below as an alternative or supplement."
            />
          </div>

          <div className="tb-field">
            <label className="tb-label">Upload Document{attachments.length > 0 ? ` (${attachments.length} uploaded)` : ""}</label>
            <DocumentUploader
              attachments={attachments}
              onChange={(atts: any) => hv("attachments", atts)}
              disabled={false}
            />
          </div>

          <div className="tb-field">
            <label className="tb-label">Description</label>
            <textarea className="tb-ta" rows={2}
              value={draft.description} onChange={hc("description")}
              placeholder="Brief overview shown to students…" />
          </div>

          <div className="tb-hint">
            <span>💡</span>
            <span>
              Provide inline article text, upload a document, or both.
              At least one reading source is required to save this task.
            </span>
          </div>
        </div>
      )}

      {/* Tab: Instructions */}
      {tab === "instructions" && (
        <div className="tb-form-card" style={{ borderRadius: "0 0 20px 20px", borderTop: "none" }}>
          <div className="tb-form-card-title">📋 Student Instructions</div>
          <div className="tb-field">
            <label className="tb-label tb-label--req">Instructions</label>
            <textarea
              className="tb-ta" rows={8}
              value={draft.instructions} onChange={hc("instructions")}
              placeholder="1. Read the passage carefully.&#10;2. Answer each comprehension question in full sentences.&#10;3. Refer back to the text to support your answers."
            />
          </div>
          <div className="tb-hint">
            <span>💡</span>
            <span>Clear instructions help students know exactly what to do before, during, and after reading.</span>
          </div>
        </div>
      )}

      {/* Tab: Questions */}
      {tab === "questions" && (
        <div className="tb-form-card" style={{ borderRadius: "0 0 20px 20px", borderTop: "none" }}>
          <div className="tb-form-card-title">❓ Comprehension Questions</div>
          <TaskQuestionEditor
            questions={questions}
            onChange={(qs: { id: string; type: string; question: string; options?: string[]; correct_answer?: string | string[]; points: number }[]) => hv("questions", qs)}
          />
          <div className="tb-hint" style={{ marginTop: 14 }}>
            <span>💡</span>
            <span>
              Questions test reading comprehension. Points per question are for guidance —
              the task's overall max score is set in Settings.
            </span>
          </div>
        </div>
      )}

      {/* Tab: Rubric */}
      {tab === "rubric" && (
        <div className="tb-form-card" style={{ borderRadius: "0 0 20px 20px", borderTop: "none" }}>
          <div className="tb-form-card-title">🏆 Grading Rubric</div>
          {rubricRows.length === 0 ? (
            <div style={{
              padding: "32px 24px", textAlign: "center",
              background: T.bg, borderRadius: 16, border: `2px dashed ${T.border}`, marginBottom: 14,
            }}>
              <div style={{ fontSize: 32, marginBottom: 10, opacity: .5 }}>🏆</div>
              <div style={{ fontFamily: T.dFont, fontSize: 14, fontWeight: 900, color: T.muted, marginBottom: 6 }}>No rubric yet</div>
              <div style={{ fontSize: 11, color: T.mutedL }}>Add criteria to guide grading.</div>
            </div>
          ) : (
            <>
              <div style={{ display: "flex", gap: 8, padding: "0 10px", marginBottom: 6, fontSize: 10, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase", color: T.muted }}>
                <span style={{ flex: 2 }}>Criterion</span>
                <span style={{ flex: 3 }}>Description</span>
                <span style={{ width: 60 }}>Pts</span>
                <span style={{ width: 22 }} />
              </div>
              {rubricRows.map((row) => (
                <div key={row.id} className="tkb-rubric-row">
                  <div className="tkb-rubric-criterion">
                    <input className="tb-input" value={row.criterion}
                      onChange={(e) => updateRubricRow(row.id, "criterion", e.target.value)}
                      placeholder="e.g. Comprehension" />
                  </div>
                  <div className="tkb-rubric-desc">
                    <textarea className="tb-ta" rows={2} value={row.description}
                      onChange={(e) => updateRubricRow(row.id, "description", e.target.value)}
                      placeholder="What earns full marks…" />
                  </div>
                  <div className="tkb-rubric-pts">
                    <input className="tb-input" type="number" min="0" value={row.points}
                      onChange={(e) => updateRubricRow(row.id, "points", Number(e.target.value))} />
                  </div>
                  <button className="tkb-rubric-del" onClick={() => deleteRubricRow(row.id)}>✕</button>
                </div>
              ))}
              <div style={{ marginTop: 8, padding: "6px 10px", borderRadius: 8, background: T.amberL, fontSize: 11, fontWeight: 800, color: T.amber, display: "inline-flex", alignItems: "center", gap: 6 }}>
                🏆 Total: {rubricRows.reduce((s, r) => s + (Number(r.points) || 0), 0)} pts
              </div>
            </>
          )}
          <button
            style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14, padding: "8px 14px", borderRadius: 10, border: `2px dashed ${T.border}`, background: "transparent", fontFamily: T.dFont, fontSize: 11, fontWeight: 800, color: T.muted, cursor: "pointer", transition: "all .14s" }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.violet; e.currentTarget.style.color = T.violet; e.currentTarget.style.background = T.violetL; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.muted; e.currentTarget.style.background = "transparent"; }}
            onClick={addRubricRow}
          >
            <span>＋</span> Add criterion
          </button>
        </div>
      )}

      {/* Tab: Settings */}
      {tab === "settings" && (
        <div className="tb-form-card" style={{ borderRadius: "0 0 20px 20px", borderTop: "none" }}>
          <div className="tb-form-card-title">⚙ Task Settings</div>
          <div className="tb-form-grid">
            <div className="tb-field">
              <label className="tb-label">Max Score</label>
              <input className="tb-input" type="number" min="0"
                value={draft.max_score} onChange={hc("max_score")} placeholder="100" />
            </div>
            <div className="tb-field">
              <label className="tb-label">Due Date (optional)</label>
              <input className="tb-input" type="datetime-local" value={draft.due_at} onChange={hc("due_at")} />
            </div>
            <div className="tb-field">
              <label className="tb-label">Scheduled Publish (optional)</label>
              <input className="tb-input" type="datetime-local" value={draft.publish_at} onChange={hc("publish_at")} />
            </div>
            <div className="tb-field">
              <label className="tb-label">Max Attempts</label>
              <input className="tb-input" type="number" min="1"
                value={draft.max_attempts ?? ""}
                onChange={(e) => hv("max_attempts", e.target.value ? Number(e.target.value) : null)}
                placeholder="Unlimited" />
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
            <label className="tb-toggle">
              <input type="checkbox" checked={!!draft.allow_late_submissions}
                onChange={(e) => hv("allow_late_submissions", e.target.checked)} />
              <div className="tb-toggle-track" /><div className="tb-toggle-thumb" />
            </label>
            <span style={{ fontSize: 12, fontWeight: 700, color: draft.allow_late_submissions ? T.violet : T.muted }}>
              Allow late submissions
            </span>
          </div>
          {draft.allow_late_submissions && (
            <div className="tb-field" style={{ marginTop: 10 }}>
              <label className="tb-label">Late Penalty (%)</label>
              <input className="tb-input" type="number" min="0" max="100"
                value={draft.late_penalty_percent} onChange={hc("late_penalty_percent")}
                placeholder="0" style={{ maxWidth: 160 }} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   LISTENING TASK EDITOR
   ═══════════════════════════════════════════════════════════════════════════ */
function ListeningTaskEditor({ draft, onChange, error, isNew }: any) {
  const hc = (field: string) => (e: any) => onChange({ ...draft, [field]: e.target.value });
  const hv = (field: string, val: any) => onChange({ ...draft, [field]: val });

  const rubricRows = (() => {
    try {
      const parsed = typeof draft.rubric === "string" ? JSON.parse(draft.rubric || "[]") : (draft.rubric || []);
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  })();
  const setRubric = (rows: any[]) => hv("rubric", JSON.stringify(rows));
  const addRubricRow = () => setRubric([...rubricRows, { id: uid(), criterion: "", description: "", points: 5 }]);
  const updateRubricRow = (id: string, field: string, val: any) =>
    setRubric(rubricRows.map((r: any) => r.id === id ? { ...r, [field]: val } : r));
  const deleteRubricRow = (id: string) => setRubric(rubricRows.filter((r: any) => r.id !== id));

  const attachments = Array.isArray(draft.attachments) ? draft.attachments : [];
  const questions   = Array.isArray(draft.questions)   ? draft.questions   : [];

  const [tab, setTab] = useState("transcript");

  return (
    <div style={{ maxWidth: 780, animation: "fadeUp .3s both" }}>
      {error && (
        <div className="tb-error">
          <span style={{ fontSize: 16 }}>⚠</span>{error}
        </div>
      )}

      {/* Title header */}
      <div className="tb-form-card">
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 14, flexShrink: 0,
            background: `linear-gradient(135deg,${T.teal},#00E5FF)`,
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20,
          }}>🎧</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <textarea
              className="tb-title-input"
              value={draft.title} rows={1}
              onChange={hc("title")}
              onInput={(e: any) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = "auto";
                target.style.height = target.scrollHeight + "px";
              }}
              placeholder="Listening task title…"
            />
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
              <span style={{
                padding: "2px 9px", borderRadius: 999, fontSize: 10, fontWeight: 800,
                background: T.tealL, color: T.teal, border: "1.5px solid rgba(0,188,212,.25)",
              }}>🎧 Listening Task</span>
              <span style={{
                padding: "2px 9px", borderRadius: 999, fontSize: 10, fontWeight: 800,
                background: T.amberL, color: T.amber, border: "1.5px solid rgba(245,166,35,.35)",
              }}>
                {draft.max_score || 100} pts max
              </span>
              {attachments.length > 0 ? (
                <span style={{
                  padding: "2px 9px", borderRadius: 999, fontSize: 10, fontWeight: 800,
                  background: T.limeL, color: T.lime, border: "1.5px solid rgba(13,184,94,.25)",
                }}>
                  {attachments.length} file{attachments.length !== 1 ? "s" : ""} ✓
                </span>
              ) : (
                <span style={{
                  padding: "2px 9px", borderRadius: 999, fontSize: 10, fontWeight: 800,
                  background: T.redL, color: T.red, border: "1.5px solid rgba(239,68,68,.25)",
                }}>
                  ⚠ No media yet
                </span>
              )}
              {questions.length > 0 && (
                <span style={{
                  padding: "2px 9px", borderRadius: 999, fontSize: 10, fontWeight: 800,
                  background: T.violetL, color: T.violet, border: "1.5px solid rgba(108,53,222,.25)",
                }}>
                  {questions.length} question{questions.length !== 1 ? "s" : ""}
                </span>
              )}
              {isNew && (
                <span style={{
                  padding: "2px 9px", borderRadius: 999, fontSize: 10, fontWeight: 800,
                  background: T.amberL, color: T.amber, border: "1.5px solid rgba(245,166,35,.35)",
                }}>⏱ New draft</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="tkb-tab-bar">
        {[
          { id: "transcript",   label: "📝 Transcript"         },
          { id: "media",        label: "🎧 Media"             },
          { id: "instructions", label: "📋 Instructions"       },
          { id: "questions",    label: `❓ Questions${questions.length ? ` (${questions.length})` : ""}` },
          { id: "rubric",       label: "🏆 Rubric"             },
          { id: "settings",     label: "⚙ Settings"            },
        ].map((t) => (
          <button key={t.id} className={`tkb-tab${tab === t.id ? " tkb-tab--active" : ""}`}
            onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab: Transcript */}
      {tab === "transcript" && (
        <div className="tb-form-card" style={{ borderRadius: "0 0 20px 20px", borderTop: "none" }}>
          <div className="tb-form-card-title">📝 Transcript / Context</div>
          <div className="tb-field">
            <label className="tb-label">Transcript (optional)</label>
            <textarea
              className="tb-ta" rows={10}
              value={draft.content} onChange={hc("content")}
              placeholder="Paste the spoken transcript here.&#10;&#10;This is stored in the task's content field. Teachers may use it for reference, or you may optionally show it to students."
            />
          </div>
          <div className="tb-field">
            <label className="tb-label">Description</label>
            <textarea className="tb-ta" rows={2}
              value={draft.description} onChange={hc("description")}
              placeholder="Brief context about this listening material…" />
          </div>
          <div className="tb-hint">
            <span>💡</span>
            <span>The transcript is saved in the content field. It helps with grading and can serve as teacher reference material.</span>
          </div>
        </div>
      )}

      {/* Tab: Media upload */}
      {tab === "media" && (
        <div className="tb-form-card" style={{ borderRadius: "0 0 20px 20px", borderTop: "none" }}>
          <div className="tb-form-card-title">🎧 Audio / Video</div>
          <AudioUploader
            attachments={attachments}
            onChange={(atts: any) => hv("attachments", atts)}
            disabled={false}
          />
          <div className="tb-hint" style={{ marginTop: 14 }}>
            <span>💡</span>
            <span>
              Upload the audio or video students will listen to. At least one media file
              is required. You can add a transcript in the Transcript tab.
            </span>
          </div>
        </div>
      )}

      {/* Tab: Instructions */}
      {tab === "instructions" && (
        <div className="tb-form-card" style={{ borderRadius: "0 0 20px 20px", borderTop: "none" }}>
          <div className="tb-form-card-title">📋 Student Instructions</div>
          <div className="tb-field">
            <label className="tb-label tb-label--req">Instructions</label>
            <textarea
              className="tb-ta" rows={8}
              value={draft.instructions} onChange={hc("instructions")}
              placeholder="1. Listen to the audio carefully from start to finish.&#10;2. You may listen up to 3 times.&#10;3. Answer each question using full sentences.&#10;4. Submit your responses when done."
            />
          </div>
          <div className="tb-hint">
            <span>💡</span>
            <span>Tell students how many times they can play the audio and what kind of answers to write.</span>
          </div>
        </div>
      )}

      {/* Tab: Questions */}
      {tab === "questions" && (
        <div className="tb-form-card" style={{ borderRadius: "0 0 20px 20px", borderTop: "none" }}>
          <div className="tb-form-card-title">❓ Listening Questions</div>
          <TaskQuestionEditor
            questions={questions}
            onChange={(qs: { id: string; type: string; question: string; options?: string[]; correct_answer?: string | string[]; points: number }[]) => hv("questions", qs)}
          />
          <div className="tb-hint" style={{ marginTop: 14 }}>
            <span>💡</span>
            <span>
              Add questions that test what students heard. Works best with single-choice,
              true/false, and short-answer types.
            </span>
          </div>
        </div>
      )}

      {/* Tab: Rubric */}
      {tab === "rubric" && (
        <div className="tb-form-card" style={{ borderRadius: "0 0 20px 20px", borderTop: "none" }}>
          <div className="tb-form-card-title">🏆 Grading Rubric</div>
          {rubricRows.length === 0 ? (
            <div style={{
              padding: "32px 24px", textAlign: "center",
              background: T.bg, borderRadius: 16, border: `2px dashed ${T.border}`, marginBottom: 14,
            }}>
              <div style={{ fontSize: 32, marginBottom: 10, opacity: .5 }}>🏆</div>
              <div style={{ fontFamily: T.dFont, fontSize: 14, fontWeight: 900, color: T.muted, marginBottom: 6 }}>No rubric yet</div>
              <div style={{ fontSize: 11, color: T.mutedL }}>Add criteria to guide grading.</div>
            </div>
          ) : (
            <>
              <div style={{ display: "flex", gap: 8, padding: "0 10px", marginBottom: 6, fontSize: 10, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase", color: T.muted }}>
                <span style={{ flex: 2 }}>Criterion</span>
                <span style={{ flex: 3 }}>Description</span>
                <span style={{ width: 60 }}>Pts</span>
                <span style={{ width: 22 }} />
              </div>
              {rubricRows.map((row) => (
                <div key={row.id} className="tkb-rubric-row">
                  <div className="tkb-rubric-criterion">
                    <input className="tb-input" value={row.criterion}
                      onChange={(e) => updateRubricRow(row.id, "criterion", e.target.value)}
                      placeholder="e.g. Listening accuracy" />
                  </div>
                  <div className="tkb-rubric-desc">
                    <textarea className="tb-ta" rows={2} value={row.description}
                      onChange={(e) => updateRubricRow(row.id, "description", e.target.value)}
                      placeholder="What earns full marks…" />
                  </div>
                  <div className="tkb-rubric-pts">
                    <input className="tb-input" type="number" min="0" value={row.points}
                      onChange={(e) => updateRubricRow(row.id, "points", Number(e.target.value))} />
                  </div>
                  <button className="tkb-rubric-del" onClick={() => deleteRubricRow(row.id)}>✕</button>
                </div>
              ))}
              <div style={{ marginTop: 8, padding: "6px 10px", borderRadius: 8, background: T.amberL, fontSize: 11, fontWeight: 800, color: T.amber, display: "inline-flex", alignItems: "center", gap: 6 }}>
                🏆 Total: {rubricRows.reduce((s, r) => s + (Number(r.points) || 0), 0)} pts
              </div>
            </>
          )}
          <button
            style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14, padding: "8px 14px", borderRadius: 10, border: `2px dashed ${T.border}`, background: "transparent", fontFamily: T.dFont, fontSize: 11, fontWeight: 800, color: T.muted, cursor: "pointer", transition: "all .14s" }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.violet; e.currentTarget.style.color = T.violet; e.currentTarget.style.background = T.violetL; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.muted; e.currentTarget.style.background = "transparent"; }}
            onClick={addRubricRow}
          >
            <span>＋</span> Add criterion
          </button>
        </div>
      )}

      {/* Tab: Settings */}
      {tab === "settings" && (
        <div className="tb-form-card" style={{ borderRadius: "0 0 20px 20px", borderTop: "none" }}>
          <div className="tb-form-card-title">⚙ Task Settings</div>
          <div className="tb-form-grid">
            <div className="tb-field">
              <label className="tb-label">Max Score</label>
              <input className="tb-input" type="number" min="0"
                value={draft.max_score} onChange={hc("max_score")} placeholder="100" />
            </div>
            <div className="tb-field">
              <label className="tb-label">Due Date (optional)</label>
              <input className="tb-input" type="datetime-local" value={draft.due_at} onChange={hc("due_at")} />
            </div>
            <div className="tb-field">
              <label className="tb-label">Scheduled Publish (optional)</label>
              <input className="tb-input" type="datetime-local" value={draft.publish_at} onChange={hc("publish_at")} />
            </div>
            <div className="tb-field">
              <label className="tb-label">Max Attempts</label>
              <input className="tb-input" type="number" min="1"
                value={draft.max_attempts ?? ""}
                onChange={(e) => hv("max_attempts", e.target.value ? Number(e.target.value) : null)}
                placeholder="Unlimited" />
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
            <label className="tb-toggle">
              <input type="checkbox" checked={!!draft.allow_late_submissions}
                onChange={(e) => hv("allow_late_submissions", e.target.checked)} />
              <div className="tb-toggle-track" /><div className="tb-toggle-thumb" />
            </label>
            <span style={{ fontSize: 12, fontWeight: 700, color: draft.allow_late_submissions ? T.violet : T.muted }}>
              Allow late submissions
            </span>
          </div>
          {draft.allow_late_submissions && (
            <div className="tb-field" style={{ marginTop: 10 }}>
              <label className="tb-label">Late Penalty (%)</label>
              <input className="tb-input" type="number" min="0" max="100"
                value={draft.late_penalty_percent} onChange={hc("late_penalty_percent")}
                placeholder="0" style={{ maxWidth: 160 }} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
function TaskInspector({
  task, draft, dirty, loading, errors,
  onSave, onPublish, onDelete, onRefresh,
}: any) {
  const [confirmDel, setConfirmDel] = useState(false);

  const sc = task ? statusCfg(task.status) : null;
  const isPublished = task?.status === "published";

  const hasTitle        = !!(draft?.title?.trim());
  const hasContent      = !!(draft?.content?.trim());
  const hasInstructions = !!(draft?.instructions?.trim());
  const attachments     = Array.isArray(draft?.attachments) ? draft.attachments : [];
  const questions       = Array.isArray(draft?.questions)   ? draft.questions   : [];
  const taskType        = draft?.type || "writing";

  let readinessCriteria = [];
  if (taskType === "reading") {
    readinessCriteria = [
      { ok: hasTitle,                              label: "Has title"            },
      { ok: hasInstructions,                       label: "Has instructions"     },
      { ok: hasContent || attachments.length > 0,  label: "Has reading material" },
      { ok: !dirty,                                label: "Changes saved"        },
      { ok: !!task,                                label: "Task created"         },
    ];
  } else if (taskType === "listening") {
    readinessCriteria = [
      { ok: hasTitle,               label: "Has title"          },
      { ok: hasInstructions,        label: "Has instructions"   },
      { ok: attachments.length > 0, label: "Has media uploaded" },
      { ok: !dirty,                 label: "Changes saved"      },
      { ok: !!task,                 label: "Task created"       },
    ];
  } else {
    readinessCriteria = [
      { ok: hasTitle,        label: "Has title"          },
      { ok: hasContent,      label: "Has writing prompt" },
      { ok: hasInstructions, label: "Has instructions"   },
      { ok: !dirty,          label: "Changes saved"      },
      { ok: !!task,          label: "Task created"       },
    ];
  }

  const passed    = readinessCriteria.filter((c) => c.ok).length;
  const total     = readinessCriteria.length;
  const pct       = Math.round((passed / total) * 100);
  const ringColor = pct === 100 ? T.lime : pct >= 60 ? T.amber : T.red;
  const canPublish = task && !isPublished && readinessCriteria.slice(0, -2).every((c) => c.ok);

  const displayError = errors.save || errors.publish || errors.delete || null;

  const contentRows = taskType === "reading"
    ? [
        { emoji: "📖", label: "Title",        ready: hasTitle,                             hint: draft?.title || "Not set"                   },
        { emoji: "📄", label: "Material",     ready: hasContent || attachments.length > 0, hint: attachments.length > 0 ? `${attachments.length} doc(s)` : hasContent ? "Inline ✓" : "Not set" },
        { emoji: "📋", label: "Instructions", ready: hasInstructions,                      hint: hasInstructions ? "Set ✓" : "Not set"        },
        { emoji: "❓", label: "Questions",    ready: questions.length > 0,                 hint: questions.length > 0 ? `${questions.length} q(s)` : "Optional" },
      ]
    : taskType === "listening"
    ? [
        { emoji: "🎧", label: "Title",        ready: hasTitle,              hint: draft?.title || "Not set"                           },
        { emoji: "🎵", label: "Media",        ready: attachments.length > 0,hint: attachments.length > 0 ? `${attachments.length} file(s) ✓` : "Required" },
        { emoji: "📋", label: "Instructions", ready: hasInstructions,       hint: hasInstructions ? "Set ✓" : "Not set"               },
        { emoji: "❓", label: "Questions",    ready: questions.length > 0,  hint: questions.length > 0 ? `${questions.length} q(s)` : "Optional" },
      ]
    : [
        { emoji: "✍", label: "Title",        ready: hasTitle,        hint: draft?.title || "Not set"   },
        { emoji: "📝", label: "Prompt",       ready: hasContent,      hint: hasContent ? "Set ✓" : "Not set" },
        { emoji: "📋", label: "Instructions", ready: hasInstructions, hint: hasInstructions ? "Set ✓" : "Not set" },
      ];

  return (
    <div className="tb-inspector">

      {/* Task summary */}
      <div className="tb-insp-sec">
        <div className="tb-insp-hd">{TYPE_MAP[taskType]?.icon || "📋"} Task</div>
        {task ? (
          <>
            <div className="tb-insp-row">
              <span className="tb-insp-key">Status</span>
              {sc && (
                <span style={{
                  fontSize: 11, fontWeight: 800, padding: "2px 9px", borderRadius: 999,
                  background: sc.bg, color: sc.col, border: `1.5px solid ${sc.border}`,
                }}>{sc.label}</span>
              )}
            </div>
            <div className="tb-insp-row">
              <span className="tb-insp-key">Type</span>
              <span className="tb-insp-val">
                {TYPE_MAP[task.type]?.icon || "📋"} {TYPE_MAP[task.type]?.label || task.type}
              </span>
            </div>
            {task.max_score != null && (
              <div className="tb-insp-row">
                <span className="tb-insp-key">Max score</span>
                <span className="tb-insp-val" style={{ color: T.amber, fontFamily: T.dFont }}>
                  {task.max_score} pts
                </span>
              </div>
            )}
            {taskType === "reading" && attachments.length > 0 && (
              <div className="tb-insp-row">
                <span className="tb-insp-key">Documents</span>
                <span className="tb-insp-val">{attachments.length}</span>
              </div>
            )}
            {taskType === "listening" && attachments.length > 0 && (
              <div className="tb-insp-row">
                <span className="tb-insp-key">Media files</span>
                <span className="tb-insp-val">{attachments.length}</span>
              </div>
            )}
            {questions.length > 0 && (
              <div className="tb-insp-row">
                <span className="tb-insp-key">Questions</span>
                <span className="tb-insp-val">{questions.length}</span>
              </div>
            )}
            {task.due_at && (
              <div className="tb-insp-row">
                <span className="tb-insp-key">Due</span>
                <span className="tb-insp-val">
                  {new Date(task.due_at).toLocaleDateString()}
                </span>
              </div>
            )}
            {dirty && (
              <div style={{
                marginTop: 8, padding: "5px 9px", borderRadius: 8, fontSize: 10,
                fontWeight: 800, background: T.amberL, color: T.amber,
                border: "1.5px solid rgba(245,166,35,.35)",
                display: "flex", alignItems: "center", gap: 5,
              }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: T.amber, flexShrink: 0, display: "block" }} />
                Unsaved changes
              </div>
            )}
          </>
        ) : (
          <div style={{ fontSize: 12, color: T.muted }}>Fill in details to create this task.</div>
        )}
      </div>

      {/* Content */}
      <div className="tb-insp-sec">
        <div className="tb-insp-hd">📦 Content</div>
        {contentRows.map(({ emoji, label, ready, hint }) => (
          <div key={label} className="ws-content-row">
            <div className="ws-content-icon" style={{ background: ready ? T.limeL : T.bg }}>{emoji}</div>
            <div className="ws-content-info">
              <div className="ws-content-lbl">{label}</div>
              <div className="ws-content-hint" style={{
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 110,
              }}>{hint}</div>
            </div>
            <span className={`ws-content-pill${ready ? " ws-content-pill--done" : " ws-content-pill--pending"}`}>
              {ready ? "✓" : "—"}
            </span>
          </div>
        ))}
      </div>

      {/* Readiness */}
      <div className="tb-insp-sec">
        <div className="tb-insp-hd">✅ Readiness</div>
        <div className="tb-readiness-ring-wrap">
          <div className="tb-readiness-ring"
            style={{ background: `conic-gradient(${ringColor} ${pct}%,${T.bg} 0)` }}>
            <div style={{
              width: 34, height: 34, borderRadius: "50%", background: "#fff",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 12, fontWeight: 900, color: ringColor, fontFamily: T.dFont,
            }}>
              {pct}%
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, color: T.text }}>{passed}/{total} checks</div>
            <div style={{ fontSize: 10, color: T.muted, marginTop: 2 }}>
              {pct === 100 ? "Ready to publish!" : "Complete all checks"}
            </div>
          </div>
        </div>
        {readinessCriteria.map(({ ok, label }) => (
          <div key={label} className="tb-check-row">
            <div className={`tb-check-icon ${ok ? "tb-check-icon--ok" : "tb-check-icon--warn"}`}>
              {ok ? "✓" : "✕"}
            </div>
            <span style={{ color: ok ? T.sub : T.red, fontWeight: ok ? 600 : 700 }}>{label}</span>
          </div>
        ))}
      </div>

      {/* Errors */}
      {displayError && (
        <div className="tb-insp-sec">
          <div className="tb-error" style={{ margin: 0 }}>
            <span>⚠</span>{displayError}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="tb-insp-sec" style={{ flex: 1 }}>
        <div className="tb-insp-hd">⚙ Actions</div>

        <button className="tb-act-btn tb-act-btn--save"
          onClick={onSave} disabled={loading.save}>
          <span className="tb-act-btn-icon">
            {loading.save ? <span className="tb-spin" /> : "💾"}
          </span>
          {loading.save ? "Saving…" : task ? "Save task" : "Create task"}
        </button>

        <button className="tb-act-btn tb-act-btn--publish"
          onClick={onPublish}
          disabled={!canPublish || loading.publish}
          title={isPublished ? "Already published" : !canPublish ? "Complete required fields first" : "Publish"}>
          <span className="tb-act-btn-icon">
            {loading.publish ? <span className="tb-spin" /> : "🚀"}
          </span>
          {loading.publish ? "Publishing…" : isPublished ? "Published ✓" : "Publish task"}
        </button>

        <button className="tb-act-btn" onClick={onRefresh}
          disabled={!task || loading.task}>
          <span className="tb-act-btn-icon">
            {loading.task ? <span className="tb-spin tb-spin--dark" /> : "↺"}
          </span>
          Refresh
        </button>

        {task && !confirmDel && (
          <button className="tb-act-btn tb-act-btn--danger" onClick={() => setConfirmDel(true)}>
            <span className="tb-act-btn-icon" style={{ background: T.redL, color: T.red }}>🗑</span>
            Delete task
          </button>
        )}
        {confirmDel && (
          <div className="tb-confirm-del">
            <div style={{ fontSize: 12, fontWeight: 700, color: T.red, marginBottom: 8 }}>
              Delete "{task?.title || "this task"}"?
            </div>
            <div style={{ display: "flex", gap: 7 }}>
              <button style={{
                flex: 1, background: T.red, color: "#fff", border: "none",
                borderRadius: 8, padding: "7px 0", fontSize: 12, fontWeight: 800,
                cursor: "pointer", fontFamily: T.dFont,
              }} onClick={() => { onDelete(); setConfirmDel(false); }}>
                {loading.delete ? "Deleting…" : "Delete"}
              </button>
              <button style={{
                flex: 1, background: "#fff", color: T.muted,
                border: `2px solid ${T.border}`, borderRadius: 8,
                padding: "7px 0", fontSize: 12, fontWeight: 700,
                cursor: "pointer", fontFamily: T.dFont,
              }} onClick={() => setConfirmDel(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN TASK BUILDER
   ═══════════════════════════════════════════════════════════════════════════ */
export function TaskBuilder({ taskId, unitId, unitTitle, generatedTaskIds, onClose }: any) {
  const navigate = useNavigate();
  const location = useLocation();

  /* ── State ── */
  const [task,    setTask]    = useState<any>(null);
  const [tasks,   setTasks]   = useState<any[]>([]);  // all tasks for this unit
  const [draft,   setDraft]   = useState(emptyTask(unitId));
  const [dirty,   setDirty]   = useState(false);
  const [isNew,   setIsNew]   = useState(!taskId);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(taskId || null);
  const [toast,   setToast]   = useState<string | null>(null);
  const [errors,  setErrors]  = useState<any>({});
  const [loading, setLoading] = useState({
    tasks: false, task: false, save: false, delete: false, publish: false,
  });

  // ── ✦ AI GENERATION STATE ──────────────────────────────────────────────
  type AIPhase = "idle" | "generating" | "fetching" | "success" | "error";
  const [aiWizardOpen,    setAiWizardOpen]    = useState(false);
  const [aiPhase,         setAiPhase]         = useState<AIPhase>("idle");
  const [aiError,         setAiError]         = useState<string | null>(null);
  const [aiAddedCount,    setAiAddedCount]    = useState<number | null>(null);
  const aiInFlight        = useRef(false);
  const aiMounted         = useRef(true);
  useEffect(() => { aiMounted.current = true; return () => { aiMounted.current = false; }; }, []);

  /** Open wizard — always reset stale error / success state first */
  const handleOpenAiWizard = () => {
    if (!unitId) return; // guard: no unit means wizard can't function
    setAiError(null);
    setAiPhase("idle");
    setAiAddedCount(null);
    setAiWizardOpen(true);
  };

  /**
   * handleAiDone — called by AITaskGenerationWizard.onDone(taskIds)
   *
   * The wizard has already POSTed to /units/{unit_id}/generate-tasks and
   * received the response. We now just need to reload the sidebar task list
   * so the new drafts appear immediately.
   *
   * We do NOT navigate. We do NOT open each task individually.
   * Tasks stay as DRAFT — no auto-publish.
   */
  const handleAiDone = useCallback(async (taskIds: number[]) => {
    if (aiInFlight.current) return;
    aiInFlight.current = true;

    setAiWizardOpen(false);
    setAiError(null);

    // Edge case A: backend returned no IDs
    if (!taskIds || taskIds.length === 0) {
      if (aiMounted.current) {
        const msg = "Generation completed but returned no task IDs. Check the task list — drafts may have been saved.";
        setAiPhase("error");
        setAiError(msg);
        showToast("⚠ " + msg);
      }
      aiInFlight.current = false;
      return;
    }

    if (aiMounted.current) setAiPhase("fetching");

    try {
      // Reload the whole unit task list — simplest stable refresh path.
      // This picks up all newly generated tasks in a single call.
      if (unitId) {
        setLoad("tasks", true);
        const data = await apiFetch(`/admin/tasks?unit_id=${unitId}`);
        const list: any[] = Array.isArray(data) ? data : data?.items || [];
        if (aiMounted.current) {
          setTasks(list);
          setLoad("tasks", false);
        }
      }

      if (!aiMounted.current) { aiInFlight.current = false; return; }

      setAiPhase("success");
      setAiAddedCount(taskIds.length);
      showToast(`✨ ${taskIds.length} draft task${taskIds.length !== 1 ? "s" : ""} generated. Review and publish when ready.`);

    } catch (err: any) {
      if (!aiMounted.current) { aiInFlight.current = false; return; }
      const msg = err?.message || "Failed to reload tasks after generation.";
      setAiPhase("error");
      setAiError(msg);
      setLoad("tasks", false);
      showToast("⚠ Task generation failed. " + msg);
    } finally {
      aiInFlight.current = false;
    }
  }, [unitId]); // eslint-disable-line react-hooks/exhaustive-deps

  const dismissAiBanner = () => { setAiPhase("idle"); setAiError(null); setAiAddedCount(null); };
  // ── END AI GENERATION STATE ────────────────────────────────────────────
  const [view, setView] = useState<"meta" | "content">("content");

  const setLoad   = (k: string, v: boolean) => setLoading((p) => ({ ...p, [k]: v }));
  const showToast = (msg: string)   => { setToast(msg); setTimeout(() => setToast(null), 2400); };
  const clearErr  = (k: string)     => setErrors((p: any) => { const n = { ...p }; delete n[k]; return n; });

  /* Unsaved changes guard */
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!dirty) return;
      e.preventDefault(); e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  /* ── Load tasks for unit ── */
  const loadTasks = useCallback(async () => {
    if (!unitId) return;
    setLoad("tasks", true);
    try {
      const data = await apiFetch(`/admin/tasks?unit_id=${unitId}`);
      const list = Array.isArray(data) ? data : data?.items || [];
      setTasks(list);
    } catch (e: any) {
      setErrors((p: any) => ({ ...p, list: e.message }));
    } finally {
      setLoad("tasks", false);
    }
  }, [unitId]);

  /* ── Load single task ── */
  const loadTask = useCallback(async (id: number) => {
    setLoad("task", true);
    try {
      const data = await apiFetch(`/admin/tasks/${id}`);
      setTask(data);
      setDraft({
        title:                    data.title                  || "",
        description:              data.description            || "",
        instructions:             data.instructions           || "",
        content:                  data.content               || "",
        type:                     data.type                  || "writing",
        status:                   data.status                || "draft",
        max_score:                data.max_score             ?? 100,
        due_at:                   data.due_at                || "",
        publish_at:               data.publish_at            || "",
        rubric:                   typeof data.rubric === "object"
                                    ? JSON.stringify(data.rubric || [])
                                    : (data.rubric              || "[]"),
        allow_late_submissions:   data.allow_late_submissions ?? false,
        late_penalty_percent:     data.late_penalty_percent  ?? 0,
        max_attempts:             data.max_attempts          ?? null,
        unit_id:                  data.unit_id               || unitId,
        assignment_settings:      data.assignment_settings   || { assign_to_all: true },
        notification_settings:    data.notification_settings || {},
        attachments:              Array.isArray(data.attachments) ? data.attachments : [],
        questions:                Array.isArray(data.questions)   ? data.questions   : [],
      });
      setDirty(false);
      setIsNew(false);
    } catch (e: any) {
      setErrors((p: any) => ({ ...p, load: e.message }));
    } finally {
      setLoad("task", false);
    }
  }, [unitId]);

  /* ── Load generated tasks by IDs (from AI generation flow) ── */
  const loadGeneratedTasks = useCallback(async (ids: number[]) => {
    if (!ids || ids.length === 0) return;
    setLoad("tasks", true);
    try {
      // Load all generated tasks in parallel
      const taskPromises = ids.map(id => apiFetch(`/admin/tasks/${id}`));
      const loadedTasks = await Promise.all(taskPromises);
      
      // Update tasks list with loaded tasks
      setTasks(loadedTasks);
      
      // Auto-select the first generated task if no taskId is provided
      if (!taskId && loadedTasks.length > 0) {
        const firstTask = loadedTasks[0];
        setSelectedTaskId(firstTask.id);
        await loadTask(firstTask.id);
      }
    } catch (e: any) {
      setErrors((p: any) => ({ ...p, generated: e.message }));
      showToast("⚠ Failed to load generated tasks: " + (e.message || "Unknown error"));
    } finally {
      setLoad("tasks", false);
    }
  }, [taskId, loadTask]);

  /* Initial load */
  useEffect(() => {
    if (generatedTaskIds && generatedTaskIds.length > 0) {
      // Load generated tasks instead of unit tasks
      loadGeneratedTasks(generatedTaskIds);
    } else {
      // Normal flow: load unit tasks
      loadTasks();
      if (taskId) loadTask(taskId);
    }
  }, [taskId, generatedTaskIds, loadGeneratedTasks, loadTasks, loadTask]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Draft change ── */
  const handleDraftChange = (updated: any) => {
    setDraft(updated);
    setDirty(true);
    clearErr("save");
  };

  /* ── Build payload ── */
  const buildPayload = () => {
    const rubricParsed = (() => {
      try {
        const parsed = JSON.parse(draft.rubric || "[]");
        // Backend expects a dictionary (Dict[str, Any]), not an array
        // Convert array to empty object if empty, or keep as object if it's already an object
        if (Array.isArray(parsed)) {
          // Backend schema requires Dict, so return empty object for empty arrays
          return {};
        }
        // If it's already an object/dict, return it (or empty object if falsy)
        return parsed && typeof parsed === 'object' ? parsed : {};
      } catch {
        return {};
      }
    })();
    return {
      title:                    draft.title.trim(),
      description:              draft.description              || null,
      instructions:             draft.instructions            || null,
      content:                  draft.content                 || null,
      type:                     draft.type                    || "writing",
      status:                   draft.status                  || "draft",
      max_score:                draft.max_score != null ? Number(draft.max_score) : 100,
      due_at:                   draft.due_at                  || null,
      publish_at:               draft.publish_at              || null,
      rubric:                   rubricParsed,
      allow_late_submissions:   !!draft.allow_late_submissions,
      late_penalty_percent:     Number(draft.late_penalty_percent) || 0,
      max_attempts:             draft.max_attempts != null ? Number(draft.max_attempts) : null,
      unit_id:                  (() => {
        const finalUnitId = draft.unit_id || unitId;
        if (!finalUnitId) {
          throw new Error("unit_id is required. Please provide a unit_id in the URL or task data.");
        }
        return finalUnitId;
      })(),
      assignment_settings:      draft.assignment_settings     || { assign_to_all: true },
      notification_settings:    draft.notification_settings   || {},
      attachments:              Array.isArray(draft.attachments) ? draft.attachments : [],
      questions:                Array.isArray(draft.questions)   ? draft.questions   : [],
    };
  };

  /* ── Validate ── */
  const validate = () => {
    if (!draft.title?.trim()) { setErrors((p: any) => ({ ...p, save: "Title is required." })); return false; }
    if (!draft.type)          { setErrors((p: any) => ({ ...p, save: "Task type is required." })); return false; }
    const finalUnitId = draft.unit_id || unitId;
    if (!finalUnitId) { setErrors((p: any) => ({ ...p, save: "Unit ID is required. Please select a unit." })); return false; }
    if (!draft.instructions?.trim()) {
      setErrors((p: any) => ({ ...p, save: "Instructions are required." })); return false;
    }
    if (draft.type === "writing" && !draft.content?.trim()) {
      setErrors((p: any) => ({ ...p, save: "Writing prompt (content) is required for writing tasks." }));
      return false;
    }
    if (draft.type === "reading") {
      const atts = Array.isArray(draft.attachments) ? draft.attachments : [];
      if (!draft.content?.trim() && atts.length === 0) {
        setErrors((p: any) => ({ ...p, save: "A reading task requires either article text or at least one uploaded document." }));
        return false;
      }
    }
    if (draft.type === "listening") {
      const atts = Array.isArray(draft.attachments) ? draft.attachments : [];
      if (atts.length === 0) {
        setErrors((p: any) => ({ ...p, save: "A listening task requires at least one audio or video file." }));
        return false;
      }
    }
    // Validate questions if present
    const qs: any[] = Array.isArray(draft.questions) ? draft.questions : [];
    for (let i = 0; i < qs.length; i++) {
      const q = qs[i];
      if (!q.question?.trim()) {
        setErrors((p: any) => ({ ...p, save: `Question ${i + 1} is missing question text.` })); return false;
      }
      if (["multiple_choice","single_choice","true_false"].includes(q.type)) {
        const opts = q.options || [];
        if (opts.some((o: any) => !String(o).trim())) {
          setErrors((p: any) => ({ ...p, save: `Question ${i + 1} has an empty option.` })); return false;
        }
        const ans = Array.isArray(q.correct_answer) ? q.correct_answer : [q.correct_answer];
        if (!ans.filter(Boolean).length) {
          setErrors((p: any) => ({ ...p, save: `Question ${i + 1} needs a correct answer selected.` })); return false;
        }
      }
    }
    return true;
  };

  /* ── Save / Create ── */
  const handleSave = async () => {
    if (!validate()) return;
    setLoad("save", true);
    clearErr("save");
    try {
      const payload = buildPayload();
      let saved;
      if (!task) {
        saved = await apiFetch("/admin/tasks", { method: "POST", body: JSON.stringify(payload) });
        setTask(saved);
        setIsNew(false);
        setSelectedTaskId(saved.id);
        await loadTasks();
        showToast("✅ Task created");
        if (navigate) navigate(`/admin/tasks/${saved.id}/builder`, { replace: true });
      } else {
        saved = await apiFetch(`/admin/tasks/${task.id}`, { method: "PUT", body: JSON.stringify(payload) });
        setTask(saved);
        await loadTasks();
        showToast("💾 Task saved");
      }
      setDirty(false);
    } catch (e: any) {
      setErrors((p: any) => ({ ...p, save: e.message }));
    } finally {
      setLoad("save", false);
    }
  };

  /* ── Publish ── */
  const handlePublish = async () => {
    if (!task) return;
    if (!validate()) return;
    // First save any unsaved changes
    if (dirty) await handleSave();
    setLoad("publish", true);
    clearErr("publish");
    try {
      // Use dedicated publish endpoint
      await apiFetch(`/admin/tasks/${task.id}/publish`, {
        method: "POST",
      });
      // Reload the task to get updated status
      const updated = await apiFetch(`/admin/tasks/${task.id}`);
      setTask(updated);
      setDraft((p) => ({ ...p, status: "published" }));
      await loadTasks();
      showToast("🚀 Task published!");
      
      // Check if we're in AI generation flow and redirect to unit page
      const searchParams = new URLSearchParams(location.search);
      const isAiFlow = searchParams.get('ai') === '1';
      if (isAiFlow) {
        const taskUnitId = updated.unit_id || unitId;
        if (taskUnitId) {
          // Small delay to show the success toast before redirecting
          setTimeout(() => {
            navigate(`/admin/units/${taskUnitId}`);
          }, 500);
        }
      }
    } catch (e: any) {
      setErrors((p: any) => ({ ...p, publish: e.message }));
    } finally {
      setLoad("publish", false);
    }
  };

  /* ── Delete ── */
  const handleDelete = async () => {
    if (!task) return;
    setLoad("delete", true);
    try {
      await apiFetch(`/admin/tasks/${task.id}`, { method: "DELETE" });
      showToast("🗑 Task deleted");
      setTask(null);
      setDraft(emptyTask(unitId));
      setSelectedTaskId(null);
      setIsNew(true);
      setDirty(false);
      await loadTasks();
    } catch (e: any) {
      setErrors((p: any) => ({ ...p, delete: e.message }));
      setLoad("delete", false);
    }
  };

  /* ── Refresh ── */
  const handleRefresh = () => {
    if (task) loadTask(task.id);
    loadTasks();
  };

  /* ── Select task from sidebar ── */
  const handleSelectTask = (id: number) => {
    if (selectedTaskId === id) { setSelectedTaskId(null); setTask(null); setDraft(emptyTask(unitId)); setIsNew(true); return; }
    setSelectedTaskId(id);
    loadTask(id);
  };

  /* ── Add task (new blank) ── */
  const handleAddTask = () => {
    setSelectedTaskId(null);
    setTask(null);
    setDraft(emptyTask(unitId));
    setIsNew(true);
    setDirty(false);
    clearErr("save");
  };

  /* ── Delete from sidebar ── */
  const handleDeleteTask = async (id: number) => {
    if (!window.confirm("Delete this task?")) return;
    try {
      await apiFetch(`/admin/tasks/${id}`, { method: "DELETE" });
      if (selectedTaskId === id) {
        setTask(null);
        setDraft(emptyTask(unitId));
        setSelectedTaskId(null);
        setIsNew(true);
      }
      await loadTasks();
      showToast("🗑 Task deleted");
    } catch (e: any) {
      showToast(`⚠ Delete failed: ${e.message}`);
    }
  };

  /* ── Breadcrumbs ── */
  const crumbs: any[] = [
    { label: unitTitle || "Unit", action: () => {} },
    {
      label: task?.title || (isNew ? "New Task" : "Task"),
      action: null,
      active: !isNew,
    },
    ...(isNew ? [{ label: "New task", active: true, action: null }] : []),
  ];

  /* ── Main panel ── */
  const isWriting   = draft.type === "writing";
  const isReading   = draft.type === "reading";
  const isListening = draft.type === "listening";
  const typeInfo    = TYPE_MAP[draft.type] || TYPE_MAP.task;

  const renderMain = () => {
    if (loading.task) {
      return (
        <div style={{ padding: 32, display: "flex", flexDirection: "column", gap: 14 }}>
          {[1, 2, 3].map((i) => <div key={i} className="shimmer" style={{ height: 100, borderRadius: 18 }} />)}
        </div>
      );
    }

    const displayError: string | null = errors.save || errors.load || null;

    // Route to the type-specific editor for all states — new AND existing.
    // The metadata panel (type selector, settings) is accessible via the ⚙ Metadata tab.
    if (isWriting) {
      return (
        <WritingTaskEditor
          draft={draft}
          onChange={handleDraftChange}
          error={displayError}
          isNew={isNew}
        />
      );
    }

    if (isReading) {
      return (
        <ReadingTaskEditor
          draft={draft}
          onChange={handleDraftChange}
          error={displayError}
          isNew={isNew}
        />
      );
    }

    if (isListening) {
      return (
        <ListeningTaskEditor
          draft={draft}
          onChange={handleDraftChange}
          error={displayError}
          isNew={isNew}
        />
      );
    }

    // All other types (manual, auto, practice, task): show metadata panel
    return (
      <TaskMetadataPanel
        draft={draft}
        onChange={handleDraftChange}
        error={displayError}
        isNew={isNew}
      />
    );
  };

  /* ── Render ── */
  return (
    <div className="tb-root">
      <TaskBuilderStyles />
      <div className="tb-shell">

        {/* Topbar */}
        <div className="tb-topbar">
          <div className="tb-topbar-icon" style={{
            background: isReading   ? `linear-gradient(135deg,${T.sky},#00BCD4)`
                       : isListening ? `linear-gradient(135deg,${T.teal},#00E5FF)`
                       : `linear-gradient(135deg,${T.violet},${T.pink})`,
          }}>
            {typeInfo.icon}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
            <span className="tb-topbar-title">{task?.title || draft.title || "New Task"}</span>
          </div>
          <span className="tb-phase-badge">Task Builder</span>
          <div className="tb-topbar-divider" />
          {unitTitle && <span className="tb-topbar-sub">📂 {unitTitle}</span>}
          {dirty && <span className="tb-unsaved-dot" title="Unsaved changes" />}
          <div className="tb-spacer" />

          {/* ── ✦ Generate with AI button ── */}
          <button
            className="tb-topbar-btn tb-topbar-btn--ai"
            onClick={handleOpenAiWizard}
            disabled={!unitId || aiPhase === "fetching"}
            title={
              !unitId
                ? "Open from a unit page to enable AI generation"
                : aiPhase === "fetching"
                ? "Loading generated tasks…"
                : "Generate draft tasks with AI"
            }
          >
            {aiPhase === "fetching"
              ? <><span className="tb-spin" style={{ borderColor: "rgba(196,181,253,.3)", borderTopColor: "#C4B5FD" }} /> Generating…</>
              : <>✨ Generate with AI</>
            }
          </button>

          <button className="tb-topbar-btn tb-topbar-btn--close" onClick={onClose}>✕ Close</button>
        </div>

        {/* ── ✦ AI generation inline banners (between topbar and body) ── */}
        {aiPhase === "fetching" && (
          <div className="tkb-gen-banner tkb-gen-banner--fetching">
            <span className="tkb-gen-banner-spin" />
            <span>Loading generated tasks… This may take a few moments.</span>
          </div>
        )}
        {aiPhase === "success" && aiAddedCount !== null && (
          <div className="tkb-gen-banner tkb-gen-banner--success">
            <span>✨</span>
            <span>
              {aiAddedCount} draft task{aiAddedCount !== 1 ? "s" : ""} generated.
              Review and publish when ready — they're not visible to students yet.
            </span>
            <button className="tkb-gen-banner-dismiss" onClick={dismissAiBanner} aria-label="Dismiss">✕</button>
          </div>
        )}
        {aiPhase === "error" && aiError && (
          <div className="tkb-gen-banner tkb-gen-banner--error">
            <span>⚠</span>
            <span>Task generation failed. {aiError}</span>
            <button className="tkb-gen-retry" onClick={handleOpenAiWizard}>↺ Try again</button>
            <button className="tkb-gen-banner-dismiss" onClick={dismissAiBanner} aria-label="Dismiss">✕</button>
          </div>
        )}

        {/* Body */}
        <div className="tb-body">
          <TaskSidebar
            tasks={tasks}
            selectedTaskId={selectedTaskId}
            unitTitle={unitTitle}
            onSelectTask={handleSelectTask}
            onAddTask={handleAddTask}
            onDeleteTask={handleDeleteTask}
            loading={loading.tasks}
          />

          <div className="tb-main">
            {/* Breadcrumb */}
            <div className="tb-breadcrumb">
              {crumbs.map((crumb, i) => (
                <span key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {i > 0 && <span className="tb-breadcrumb-sep">›</span>}
                  {crumb.active ? (
                    <span className="tb-breadcrumb-active">{crumb.label}</span>
                  ) : (
                    <span
                      className="tb-breadcrumb-link"
                      onClick={crumb.action || undefined}
                      style={{ cursor: crumb.action ? "pointer" : "default" }}
                    >
                      {crumb.label}
                    </span>
                  )}
                </span>
              ))}
            </div>

            {/* View toggle — show for writing/reading/listening (new and existing) */}
            {(isWriting || isReading || isListening) && (
              <div style={{
                display: "flex", gap: 0, padding: "0 30px",
                background: "#fff", borderBottom: `2px solid ${T.border}`,
                flexShrink: 0,
              }}>
                {[
                  { id: "meta",    label: "⚙ Metadata"               },
                  { id: "content", label: `${typeInfo.icon} Content` },
                ].map((v) => (
                  <button
                    key={v.id}
                    className={`tkb-tab${view === v.id ? " tkb-tab--active" : ""}`}
                    onClick={() => setView(v.id as "meta" | "content")}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            )}

            <div className="tb-main-scroll">
              {view === "meta" && (isWriting || isReading || isListening) ? (
                <TaskMetadataPanel
                  draft={draft}
                  onChange={handleDraftChange}
                  error={errors.save || errors.load || null}
                  isNew={isNew}
                />
              ) : (
                renderMain()
              )}
            </div>
          </div>

          <TaskInspector
            task={task}
            draft={draft}
            dirty={dirty}
            loading={loading}
            errors={errors}
            onSave={handleSave}
            onPublish={handlePublish}
            onDelete={handleDelete}
            onRefresh={handleRefresh}
          />
        </div>

        {toast && <div className="tb-toast">{toast}</div>}

        {/* ── ✦ AI Generation Wizard — mounted at builder root, no navigation ── */}
        <AITaskGenerationWizard
          open={aiWizardOpen}
          onClose={() => setAiWizardOpen(false)}
          onBack={() => setAiWizardOpen(false)}
          unitId={unitId ?? null}
          unitTitle={unitTitle ?? null}
          onDone={handleAiDone}
        />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   TASK BUILDER PAGE  (full-page route)
   ═══════════════════════════════════════════════════════════════════════════ */
export function TaskBuilderPage() {
  const { taskId } = useParams();
  const navigate   = useNavigate();
  const location   = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const unitIdParam = searchParams.get('unit_id') || searchParams.get('unitId');
  const unitId = unitIdParam ? parseInt(unitIdParam) : null;
  
  // Support ?generated=41,42,43 query param (from AI generation flow)
  const generatedParam = searchParams.get('generated');
  const generatedIds = generatedParam
    ? generatedParam.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id))
    : null;
  
  // Support route state (alternative to query params)
  const stateGeneratedIds = (location.state as any)?.generatedIds;
  const finalGeneratedIds = generatedIds || (Array.isArray(stateGeneratedIds) ? stateGeneratedIds : null);
  
  return (
    <TaskBuilder
      taskId={taskId ? parseInt(taskId) : null}
      unitId={unitId}
      unitTitle={null}
      generatedTaskIds={finalGeneratedIds}
      onClose={() => navigate(-1)}
    />
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   UNIT TASK SECTION
   Drop-in section card for the unit editor — mirrors UnitTestSection.
   ═══════════════════════════════════════════════════════════════════════════ */
export function UnitTaskSection({ unitId, unitTitle: _unitTitle, previewData = [] }: any) {
  const navigate        = useNavigate();
  const [unitTasks,     setUnitTasks]     = useState<any[] | null>(null);
  const [loadingTasks,  setLoadingTasks]  = useState(false);
  const hasFetched      = useRef(false);

  const tasks = unitTasks ?? previewData;
  const hasTasks = tasks.length > 0;

  const fetchUnitTasks = useCallback(async () => {
    if (!unitId || hasFetched.current) return;
    hasFetched.current = true;
    setLoadingTasks(true);
    try {
      const data = await apiFetch(`/admin/tasks?unit_id=${unitId}`);
      const list: any[] = Array.isArray(data) ? data : data?.items || [];
      setUnitTasks(list);
    } catch {
      setUnitTasks([]);
    } finally {
      setLoadingTasks(false);
    }
  }, [unitId]);

  useEffect(() => { fetchUnitTasks(); }, [fetchUnitTasks]);

  const openBuilder = (taskId: number | null = null) => {
    if (taskId) {
      navigate(`/admin/tasks/${taskId}/builder`);
    } else {
      navigate(`/admin/tasks/builder/new?unit_id=${unitId}`);
    }
  };

  return (
    <div style={{
      background: "#fff", border: `2px solid ${T.border}`, borderRadius: 20,
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "14px 18px", borderBottom: `2px solid ${T.bg}`,
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: 12, flexShrink: 0,
          background: `linear-gradient(135deg,${T.violet},${T.pink})`,
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17,
        }}>✍</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: T.dFont, fontSize: 14, fontWeight: 900, color: T.text }}>Tasks</div>
          <div style={{ fontSize: 11, color: T.muted, fontWeight: 600 }}>
            {hasTasks ? `${tasks.length} task${tasks.length !== 1 ? "s" : ""}` : "No tasks yet"}
          </div>
        </div>
        <button
          onClick={() => openBuilder()}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "7px 14px", borderRadius: 10,
            background: `linear-gradient(135deg,${T.violet},${T.pink})`,
            border: "none", color: "#fff", fontFamily: T.dFont, fontSize: 11,
            fontWeight: 800, cursor: "pointer", boxShadow: "0 3px 10px rgba(108,53,222,.25)",
            transition: "all .15s",
          }}
        >
          ＋ Add Task
        </button>
      </div>

      {/* Content */}
      <div style={{ padding: "10px 18px 16px" }}>
        {loadingTasks ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "8px 0" }}>
            {[70, 85, 60].map((_w, i) => (
              <div key={i} className="shimmer" style={{ height: 44, borderRadius: 10 }} />
            ))}
          </div>
        ) : !hasTasks ? (
          <div style={{
            padding: "28px 16px", textAlign: "center",
            background: T.bg, borderRadius: 14, border: `2px dashed ${T.border}`,
          }}>
            <div style={{ fontSize: 28, opacity: .4, marginBottom: 8 }}>✍</div>
            <div style={{ fontFamily: T.dFont, fontSize: 13, fontWeight: 900, color: T.muted, marginBottom: 4 }}>
              No tasks yet
            </div>
            <div style={{ fontSize: 11, color: T.mutedL }}>
              Click ＋ Add Task to create a writing assignment.
            </div>
          </div>
        ) : (
          tasks.map((task: any) => {
            const typeInfo = TYPE_MAP[task.type] || TYPE_MAP.task;
            const sc = statusCfg(task.status);
            return (
              <div
                key={task.id}
                onClick={() => openBuilder(task.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "10px 12px", borderRadius: 12,
                  border: `1.5px solid ${T.border}`, background: T.bg,
                  cursor: "pointer", transition: "all .14s", marginBottom: 8,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.violet; e.currentTarget.style.background = T.violetL; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.background = T.bg; }}
              >
                <div style={{
                  width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                  background: typeInfo.colorL,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 14, color: typeInfo.color,
                }}>{typeInfo.icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontFamily: T.dFont, fontSize: 13, fontWeight: 800, color: T.text,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>{task.title || "Untitled task"}</div>
                  <div style={{ fontSize: 10, color: T.muted, marginTop: 2, fontWeight: 600 }}>
                    {typeInfo.label}
                    {task.max_score != null ? ` · ${task.max_score} pts` : ""}
                    {task.due_at ? ` · Due ${new Date(task.due_at).toLocaleDateString()}` : ""}
                  </div>
                </div>
                <span style={{
                  padding: "2px 8px", borderRadius: 999, fontSize: 10, fontWeight: 800,
                  background: sc.bg, color: sc.col, border: `1.5px solid ${sc.border}`,
                  flexShrink: 0,
                }}>{sc.label}</span>
                <span style={{ fontSize: 16, color: T.muted, flexShrink: 0 }}>›</span>
              </div>
            );
          })
        )}
      </div>

      <style>{`
        @keyframes shimmer { to { background-position:600px 0; } }
        .shimmer {
          background:linear-gradient(90deg,#EDE9FF 25%,#F5F3FF 50%,#EDE9FF 75%);
          background-size:600px 100%; animation:shimmer 1.6s infinite linear; border-radius:8px;
        }
      `}</style>
    </div>
  );
}

export default TaskBuilder;