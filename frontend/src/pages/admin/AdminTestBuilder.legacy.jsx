/**
 * TestBuilder.jsx — Production-grade Test Builder  (Phase 1 → 6)
 *
 * ── Architecture ──────────────────────────────────────────────────────────
 *
 *   TestBuilderModal           ← drop-in modal shell (portalled)
 *     open, onClose, unitId, unitTitle, existingTestId
 *     │
 *     └── TestBuilder          ← full 3-panel authoring shell
 *           ├── QuestionSidebar        (left)
 *           │     • score pill per question             [Phase 4]
 *           │     • unsaved-changes dot indicator       [Phase 4]
 *           │     • type-colour coded border            [Phase 4]
 *           ├── [main pane]            (centre)
 *           │     TestMetadataPanel    — shown when no question selected
 *           │     QuestionEditor       — shown when question selected / adding
 *           │       MCQQuestionForm
 *           │       OpenAnswerQuestionForm
 *           │       ClozeQuestionForm
 *           │       VisualQuestionForm
 *           │       — Future form stubs (Phase 6)
 *           │         TrueFalseQuestionForm    (stub)
 *           │         MatchingQuestionForm     (stub)
 *           │         SentenceOrderForm        (stub)
 *           │         WordFromLettersForm      (stub)
 *           │         CategorySortForm         (stub)
 *           └── TestInspector          (right)
 *                 • scoring summary                     [Phase 4]
 *                 • publish readiness indicator         [Phase 4]
 *
 * ── Changes from Phase 1 ─────────────────────────────────────────────────
 *   PHASE 2  — Question editing via PUT /admin/questions/{question_id}
 *              • QuestionEditor detects isEditing and routes to PUT
 *              • handleQuestionUpdated flow in TestBuilder
 *              • Clicking a sidebar question loads it into the editor
 *
 *   PHASE 3  — Image upload (POST /tests/questions/upload-image)
 *              • Full VisualQuestionForm with upload zone, loading spinner,
 *                preview, remove button, and error handling
 *              • Stores { type, path, url } in media array (no schema change)
 *
 *   PHASE 4  — UX improvements
 *              • Empty states (sidebar + main)
 *              • Scoring summary in inspector
 *              • Publish readiness checklist with per-criterion detail
 *              • Unsaved changes warning (beforeunload + in-UI dot)
 *              • Better sidebar question indicators (type color, score pill)
 *              • Loading skeletons (test load, question list)
 *              • Cleaner transitions (fadeUp on panel swap)
 *
 *   PHASE 5  — Safe enhancements (backend-confirmed required)
 *              • Delete question: DELETE /tests/{test_id}/questions/{question_id}
 *                Backend endpoint confirmed: /tests/{test_id}/questions/{question_id}
 *              • Reorder: not yet confirmed — omitted per spec
 *
 *   PHASE 6  — Future question type stubs (architecture only)
 *              • QUESTION_TYPES extended with future types (commented-out entries)
 *              • formMap in QuestionEditor ready to receive new form components
 *              • Stub components defined — no backend calls
 *              • buildInitialDraft / buildPayload have switch cases ready
 *
 * ── Backend contract ──────────────────────────────────────────────────────
 *   GET    /tests                         — list (supports ?unit_id=)
 *   POST   /tests                         — create
 *   GET    /tests/{id}                    — get
 *   PUT    /tests/{id}                    — update metadata
 *   DELETE /tests/{id}                    — delete
 *   GET    /tests/{id}/questions                    — load questions
 *   POST   /tests/{id}/questions                    — add question (returns { id, message })
 *   PATCH  /tests/{id}/publish                      — publish
 *   POST   /tests/questions/upload-image            — image upload (returns { path, url })
 *   PUT    /admin/questions/{qid}                    — edit question  [Phase 2 — ASSUMED]
 *   DELETE /tests/{test_id}/questions/{question_id} — delete question [Phase 5 — CONFIRMED]
 *
 * ── AI generation backend contract (secondary flow) ───────────────────────
 *   POST   /units/{unit_id}/generate-test           — start generation
 *            body: { mcq_count, answers_per_question, difficulty, title?,
 *                    time_limit_minutes, passing_score,
 *                    content_language, question_language }
 *            response: { test_id, poll_url }
 *   GET    {poll_url}                               — poll status
 *            response: { generation_status, question_count, generation_error? }
 *            generation_status: "pending" | "running" | "done" | "failed"
 *
 *   After "done": test_id is a fully-created draft test.
 *   Navigate to /admin/tests/{test_id}/builder?ai=1 to open it.
 *   TestBuilderPage reads ?ai=1 → TestBuilder(fromAI=true) →
 *     loadTest + loadQuestions → auto-select Q1 + AI Draft badge + banner.
 *
 *   The generation flow creates a NEW test. It never modifies the current one.
 *   TODO: If backend adds POST /tests/{id}/merge-from/{srcId},
 *         wire a "Merge into current test" CTA in AIGenerateModal done screen.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useParams } from "react-router-dom";
import { T } from "./TeacherOnboarding.legacy";

/* ─── API base ───────────────────────────────────────────────────────────── */
const API = "/api/v1";

// Get auth token fresh each time
const getAuthToken = () => {
  const token = localStorage.getItem("token") || window.__authToken || "";
  // Trim whitespace and return only if non-empty and valid
  const trimmed = token ? token.trim() : "";
  // Return empty string if token is empty or just whitespace
  return trimmed.length > 0 ? trimmed : "";
};

const authHdr = () => {
  const token = getAuthToken();
  const headers = {
    "Content-Type": "application/json",
  };
  // Only add Authorization if we have a valid token
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
};

async function apiFetch(path, opts = {}) {
  // Always get fresh token
  const token = getAuthToken();
  
  // Extract headers from opts to merge them properly
  const { headers: optsHeaders, ...restOpts } = opts;
  
  // Build headers - always include Content-Type
  const headers = {
    "Content-Type": "application/json",
  };
  
  // Merge custom headers from opts (but filter out undefined/null Authorization)
  if (optsHeaders) {
    Object.keys(optsHeaders).forEach(key => {
      if (optsHeaders[key] != null) {
        headers[key] = optsHeaders[key];
      }
    });
  }
  
  // Always set Authorization header if we have a valid token (this overrides any previous value)
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  } else {
    // Warn if no token is available (but don't block the request)
    console.warn("No authentication token found. Request may fail with 401.");
  }
  
  const res = await fetch(`${API}${path}`, {
    ...restOpts,
    headers,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    // Provide more helpful error messages
    if (res.status === 401) {
      throw new Error(body.detail || "Authentication failed. Please log in again.");
    }
    throw new Error(body.detail || `HTTP ${res.status}`);
  }
  // Handle 204 No Content
  if (res.status === 204) return null;
  return res.json();
}

async function apiUpload(path, formData) {
  // Always get fresh token
  const token = getAuthToken();
  
  const headers = {};
  // Only add Authorization if we have a valid token
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  } else {
    console.warn("No authentication token found. Upload may fail with 401.");
  }
  // Don't set Content-Type for FormData - browser will set it with boundary
  
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers,
    body: formData,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (res.status === 401) {
      throw new Error(body.detail || "Authentication failed. Please log in again.");
    }
    throw new Error(body.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

/* ─── Constants ──────────────────────────────────────────────────────────── */

/**
 * PHASE 6: Future types are listed here (commented out).
 * To activate a type: uncomment its entry, add its form component,
 * and add its case to buildInitialDraft / buildPayload / validate.
 */
const QUESTION_TYPES = [
  { type: "multiple_choice", label: "Multiple Choice", icon: "☑",  color: T.violet, colorL: T.violetL },
  { type: "open_answer",     label: "Open Answer",     icon: "✍",  color: T.sky,    colorL: T.skyL    },
  { type: "cloze",           label: "Fill in Gaps",    icon: "📝", color: T.amber,  colorL: T.amberL  },
  { type: "visual",          label: "Visual",          icon: "🖼", color: T.pink,   colorL: T.pinkL   },
  // ── PHASE 6: FUTURE TYPES (DO NOT ENABLE until backend is confirmed) ──
  // { type: "true_false",      label: "True / False",    icon: "🔁", color: T.teal,   colorL: T.tealL   },
  // { type: "matching",        label: "Matching",         icon: "🔗", color: T.orange, colorL: T.orangeL },
  // { type: "sentence_order",  label: "Sentence Order",   icon: "🔀", color: T.lime,   colorL: T.limeL   },
  // { type: "word_from_letters",label:"Word from Letters",icon: "🔤", color: T.violet, colorL: T.violetL },
  // { type: "category_sort",   label: "Category Sort",    icon: "📂", color: T.pink,   colorL: T.pinkL   },
];

const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];
const ANSWER_TYPES = ["multiple_choice", "single_choice", "open_answer", "true_false"];

/* type → colour map for sidebar indicators */
const TYPE_COLOR = Object.fromEntries(QUESTION_TYPES.map((qt) => [qt.type, qt.color]));

/* ─── Empty shapes ───────────────────────────────────────────────────────── */
const emptyMeta = (unitId = null) => ({
  title: "", description: "", instructions: "",
  time_limit_minutes: "", passing_score: "",
  status: "draft", publish_at: "", order_index: 0,
  settings: {}, unit_id: unitId,
});

const emptyMCQ = () => ({
  type: "multiple_choice", prompt: "", score: 1, autograde: true,
  metadata: {}, level: "B1",
  options: [
    { id: uid(), text: "" }, { id: uid(), text: "" },
    { id: uid(), text: "" }, { id: uid(), text: "" },
  ],
  correct_option_ids: [], shuffle_options: false,
});

const emptyOpenAnswer = () => ({
  type: "open_answer", prompt: "", score: 1, autograde: false,
  metadata: {}, level: "B1",
  expected: {}, manual_review_if_below: null,
});

const emptyCloze = () => ({
  type: "cloze", prompt: "", score: 1, autograde: true,
  metadata: {}, level: "B1", gaps: [],
});

const emptyVisual = () => ({
  type: "visual", prompt: "", score: 1, autograde: true,
  metadata: {}, level: "B1",
  media: [], answer_type: "multiple_choice",
  options: [{ id: uid(), text: "" }, { id: uid(), text: "" }],
  correct_option_ids: [], shuffle_options: false,
  expected: {},
});

/** PHASE 6: stub empty shapes for future types */
const emptyTrueFalse    = () => ({ type: "true_false",       prompt: "", score: 1, autograde: true, metadata: {}, level: "B1", correct_answer: null });
const emptyMatching     = () => ({ type: "matching",          prompt: "", score: 1, autograde: true, metadata: {}, level: "B1", pairs: [] });
const emptySentenceOrder= () => ({ type: "sentence_order",   prompt: "", score: 1, autograde: true, metadata: {}, level: "B1", sentences: [] });
const emptyWordFromLetters = () => ({ type: "word_from_letters", prompt: "", score: 1, autograde: true, metadata: {}, level: "B1", answer: "" });
const emptyCategorySort = () => ({ type: "category_sort",    prompt: "", score: 1, autograde: true, metadata: {}, level: "B1", categories: [] });

const uid = () => Math.random().toString(36).slice(2, 10);

/* ─── Status badge config ────────────────────────────────────────────────── */
const statusCfg = (status) =>
  status === "published"
    ? { label: "Published", bg: T.limeL,  col: T.lime,  border: "rgba(13,184,94,.28)" }
    : { label: "Draft",     bg: T.amberL, col: T.amber, border: "rgba(245,166,35,.35)" };

/* ─── normalise question list from backend ──────────────────────────────── */
const normaliseQuestions = (raw) =>
  (Array.isArray(raw) ? raw : raw?.questions || []).map((q) => {
    const inner = q.question || {};

    return {
      ...q,
      // actual question identity
      id: q.question_id || inner.id || q.id,
      test_question_id: q.id,

      // normalized display/edit fields
      type: inner.type || q.type || q.question_type || "multiple_choice",
      prompt:
        inner.prompt_rich ||
        inner.prompt ||
        q.prompt ||
        q.question_text ||
        q.text ||
        "",
      prompt_rich:
        inner.prompt_rich ||
        q.prompt_rich ||
        "",

      options: inner.options || q.options || [],
      correct_answer: inner.correct_answer || q.correct_answer || {},
      correct_option_ids:
        inner.correct_answer?.correct_option_ids ||
        q.correct_option_ids ||
        [],
      expected_answer_config:
        inner.expected_answer_config || q.expected_answer_config || {},
      gaps_config: inner.gaps_config || q.gaps_config || [],

      score: q.points ?? inner.points ?? q.score ?? 1,
      points: q.points ?? inner.points ?? 1,
      shuffle_options:
        inner.shuffle_options ?? q.shuffle_options ?? false,
      autograde: inner.autograde ?? q.autograde ?? true,
      level: inner.level || q.level || "B1",
      metadata: inner.question_metadata || q.metadata || {},
    };
  });

/* ═══════════════════════════════════════════════════════════════════════════
   STYLES
   ═══════════════════════════════════════════════════════════════════════════ */
const TestBuilderStyles = () => (
  <style>{`
    /* ── Root container (full page) ── */
    .tb-root {
      position:fixed; inset:0; z-index:1000;
      background:${T.bg}; display:flex; flex-direction:column;
      overflow:hidden;
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
      background:linear-gradient(135deg,#0DB85E,#00BCD4);
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
      background:rgba(13,184,94,.25); border:1.5px solid rgba(13,184,94,.55); color:#86EFAC;
      flex-shrink:0;
    }
    .tb-topbar-divider { width:1px; height:20px; background:rgba(255,255,255,.12); flex-shrink:0; }
    .tb-spacer { flex:1; }

    /* [Phase 4] Unsaved-changes indicator in topbar */
    .tb-unsaved-dot {
      width:7px; height:7px; border-radius:50%;
      background:${T.amber}; flex-shrink:0;
      box-shadow:0 0 6px ${T.amber};
      animation:pulse 1.6s ease-in-out infinite;
    }
    @keyframes pulse {
      0%,100% { opacity:1; transform:scale(1); }
      50%      { opacity:.6; transform:scale(1.3); }
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

    /* ── Phase 1: AI + header action buttons ── */
    .tb-topbar-btn--ai {
      background:linear-gradient(135deg,rgba(108,53,222,.55),rgba(240,68,124,.45));
      color:#fff; border:1.5px solid rgba(240,68,124,.45);
      box-shadow:0 2px 12px rgba(108,53,222,.3);
    }
    .tb-topbar-btn--ai:hover {
      background:linear-gradient(135deg,rgba(108,53,222,.75),rgba(240,68,124,.65));
      box-shadow:0 4px 18px rgba(108,53,222,.45);
      transform:translateY(-1px);
    }
    .tb-topbar-btn--ai:active { transform:translateY(0); }

    /* AI generation modal overlay */
    .tb-ai-modal-overlay {
      position:fixed; inset:0; z-index:1200;
      background:rgba(16,8,40,.72); backdrop-filter:blur(6px);
      display:flex; align-items:center; justify-content:center;
      padding:24px; animation:fadeIn .18s both;
    }
    .tb-ai-modal {
      background:#fff; border-radius:22px; width:100%; max-width:520px;
      box-shadow:0 24px 80px rgba(0,0,0,.3), 0 0 0 1.5px rgba(108,53,222,.18);
      animation:fadeUp .24s cubic-bezier(.22,.68,0,1.15) both;
      overflow:hidden;
    }
    .tb-ai-modal-header {
      padding:22px 24px 16px;
      background:linear-gradient(135deg,#1A1035 0%,#2D1A55 100%);
      display:flex; align-items:flex-start; gap:14px;
    }
    .tb-ai-modal-header-icon {
      width:44px; height:44px; border-radius:14px; flex-shrink:0;
      background:linear-gradient(135deg,${T.violet},${T.pink});
      display:flex; align-items:center; justify-content:center; font-size:20px;
    }
    .tb-ai-modal-header-text { flex:1; min-width:0; }
    .tb-ai-modal-title {
      font-family:${T.dFont}; font-size:17px; font-weight:900; color:#fff;
      margin-bottom:3px;
    }
    .tb-ai-modal-sub { font-size:12px; color:rgba(255,255,255,.55); line-height:1.5; }
    .tb-ai-modal-close {
      width:28px; height:28px; border-radius:8px; flex-shrink:0;
      background:rgba(255,255,255,.1); border:1.5px solid rgba(255,255,255,.15);
      color:rgba(255,255,255,.6); font-size:13px; cursor:pointer;
      display:flex; align-items:center; justify-content:center;
      transition:all .14s;
    }
    .tb-ai-modal-close:hover { background:rgba(255,255,255,.2); color:#fff; }
    .tb-ai-modal-body { padding:22px 24px; }
    .tb-ai-modal-notice {
      display:flex; gap:10px; align-items:flex-start;
      background:${T.amberL}; border:1.5px solid rgba(245,166,35,.35);
      border-radius:12px; padding:12px 14px; margin-bottom:18px;
    }
    .tb-ai-modal-notice-icon { font-size:16px; flex-shrink:0; margin-top:1px; }
    .tb-ai-modal-notice-text { font-size:12px; color:#92520A; font-weight:600; line-height:1.55; }
    .tb-ai-modal-notice-text strong { font-weight:800; }
    .tb-ai-modal-context-card {
      background:${T.bg}; border:1.5px solid ${T.border}; border-radius:14px;
      padding:14px 16px; margin-bottom:18px;
    }
    .tb-ai-modal-context-title {
      font-family:${T.dFont}; font-size:11px; font-weight:800; letter-spacing:.1em;
      text-transform:uppercase; color:${T.muted}; margin-bottom:10px;
    }
    .tb-ai-modal-context-row {
      display:flex; align-items:center; gap:10px; margin-bottom:6px;
    }
    .tb-ai-modal-context-row:last-child { margin-bottom:0; }
    .tb-ai-modal-context-label { font-size:11px; font-weight:700; color:${T.muted}; width:72px; flex-shrink:0; }
    .tb-ai-modal-context-val {
      font-size:12px; font-weight:700; color:${T.text};
      background:#fff; border:1.5px solid ${T.border}; border-radius:8px;
      padding:3px 10px; flex:1; min-width:0;
      white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
    }
    .tb-ai-modal-context-val--empty { color:${T.mutedL}; font-style:italic; font-weight:600; }
    .tb-ai-modal-actions { display:flex; gap:10px; }
    .tb-ai-modal-btn-primary {
      flex:1; padding:11px 0; border-radius:11px; border:none;
      background:linear-gradient(135deg,${T.violet},${T.pink});
      color:#fff; font-family:${T.dFont}; font-size:13px; font-weight:800;
      cursor:pointer; transition:all .16s;
      box-shadow:0 4px 18px rgba(108,53,222,.35);
      display:flex; align-items:center; justify-content:center; gap:7px;
    }
    .tb-ai-modal-btn-primary:hover {
      box-shadow:0 6px 24px rgba(108,53,222,.5); transform:translateY(-1px);
    }
    .tb-ai-modal-btn-ghost {
      padding:11px 18px; border-radius:11px; border:2px solid ${T.border};
      background:#fff; color:${T.muted}; font-family:${T.dFont}; font-size:13px;
      font-weight:700; cursor:pointer; transition:all .14s;
    }
    .tb-ai-modal-btn-ghost {
      padding:11px 18px; border-radius:11px; border:2px solid ${T.border};
      background:#fff; color:${T.muted}; font-family:${T.dFont}; font-size:13px;
      font-weight:700; cursor:pointer; transition:all .14s;
    }
    .tb-ai-modal-btn-ghost:hover { border-color:${T.muted}; color:${T.text}; }
    .tb-ai-modal-btn-primary:disabled {
      opacity:.5; cursor:not-allowed; transform:none !important;
      box-shadow:0 4px 18px rgba(108,53,222,.18) !important;
    }

    /* Phase 2: wider modal for the wizard form */
    .tb-ai-modal--wizard { max-width:600px; }

    /* Wizard form grid */
    .tb-ai-wiz-grid {
      display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-bottom:18px;
    }
    .tb-ai-wiz-grid--full { grid-column:1/-1; }
    .tb-ai-wiz-field { display:flex; flex-direction:column; gap:5px; }
    .tb-ai-wiz-label {
      font-size:11px; font-weight:800; letter-spacing:.06em;
      text-transform:uppercase; color:${T.muted};
    }
    .tb-ai-wiz-label--req::after { content:" *"; color:${T.pink}; }
    .tb-ai-wiz-input {
      padding:8px 12px; border-radius:9px; border:2px solid ${T.border};
      font-family:${T.dFont}; font-size:13px; font-weight:700; color:${T.text};
      background:#fff; outline:none; transition:border .14s; width:100%; box-sizing:border-box;
    }
    .tb-ai-wiz-input:focus { border-color:${T.violet}; box-shadow:0 0 0 3px rgba(108,53,222,.1); }
    .tb-ai-wiz-select {
      padding:8px 12px; border-radius:9px; border:2px solid ${T.border};
      font-family:${T.dFont}; font-size:13px; font-weight:700; color:${T.text};
      background:#fff; outline:none; transition:border .14s; width:100%; cursor:pointer;
      appearance:none;
    }
    .tb-ai-wiz-select:focus { border-color:${T.violet}; box-shadow:0 0 0 3px rgba(108,53,222,.1); }
    .tb-ai-wiz-hint { font-size:11px; color:${T.muted}; line-height:1.5; margin-top:2px; }
    .tb-ai-wiz-chips { display:flex; gap:6px; flex-wrap:wrap; }
    .tb-ai-wiz-chip {
      padding:4px 13px; border-radius:999px; border:2px solid ${T.border};
      font-size:11px; font-weight:800; color:${T.muted}; cursor:pointer;
      background:#fff; transition:all .14s; font-family:${T.dFont};
    }
    .tb-ai-wiz-chip--active {
      background:${T.violet}; color:#fff; border-color:transparent;
      box-shadow:0 3px 10px rgba(108,53,222,.25);
    }
    .tb-ai-wiz-chip:hover:not(.tb-ai-wiz-chip--active) { border-color:${T.violet}; color:${T.violet}; }

    /* Phase 2: Progress screen */
    .tb-ai-progress-body {
      padding:32px 28px; display:flex; flex-direction:column; align-items:center;
      text-align:center; gap:18px;
    }
    .tb-ai-progress-ring-wrap {
      position:relative; width:80px; height:80px;
    }
    .tb-ai-progress-spinner {
      width:80px; height:80px; border-radius:50%;
      border:5px solid ${T.border};
      border-top-color:${T.violet};
      animation:spin .9s linear infinite;
    }
    .tb-ai-progress-spinner--done {
      border-color:${T.lime}; border-top-color:${T.lime};
      animation:none;
    }
    .tb-ai-progress-spinner--failed {
      border-color:${T.redL}; border-top-color:${T.red};
      animation:none;
    }
    .tb-ai-progress-icon {
      position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
      font-size:26px;
    }
    .tb-ai-progress-status {
      font-family:${T.dFont}; font-size:17px; font-weight:900; color:${T.text};
    }
    .tb-ai-progress-sub {
      font-size:13px; color:${T.muted}; line-height:1.6; max-width:340px;
    }
    .tb-ai-progress-steps { display:flex; flex-direction:column; gap:8px; width:100%; max-width:360px; }
    .tb-ai-progress-step {
      display:flex; align-items:center; gap:10px;
      padding:8px 12px; border-radius:10px;
      font-size:12px; font-weight:700; transition:all .3s;
    }
    .tb-ai-progress-step--active {
      background:${T.violetL}; color:${T.violet}; border:1.5px solid rgba(108,53,222,.2);
    }
    .tb-ai-progress-step--done {
      background:${T.limeL}; color:${T.lime}; border:1.5px solid rgba(13,184,94,.2);
    }
    .tb-ai-progress-step--waiting {
      background:${T.bg}; color:${T.mutedL}; border:1.5px solid ${T.border};
    }
    .tb-ai-progress-step--failed {
      background:${T.redL}; color:${T.red}; border:1.5px solid rgba(239,68,68,.2);
    }
    .tb-ai-progress-step-icon { font-size:14px; flex-shrink:0; width:18px; text-align:center; }
    .tb-ai-progress-pill {
      display:inline-flex; align-items:center; gap:6px;
      padding:4px 12px; border-radius:999px; font-size:11px; font-weight:800;
    }
    .tb-ai-progress-pill--done { background:${T.limeL}; color:${T.lime}; }
    .tb-ai-progress-pill--failed { background:${T.redL}; color:${T.red}; }
    .tb-ai-modal-btn-cta {
      width:100%; padding:13px 0; border-radius:12px; border:none;
      background:linear-gradient(135deg,${T.violet},${T.pink});
      color:#fff; font-family:${T.dFont}; font-size:14px; font-weight:900;
      cursor:pointer; transition:all .16s; letter-spacing:.02em;
      box-shadow:0 6px 24px rgba(108,53,222,.35);
      display:flex; align-items:center; justify-content:center; gap:8px;
    }
    .tb-ai-modal-btn-cta:hover {
      box-shadow:0 8px 30px rgba(108,53,222,.5); transform:translateY(-1px);
    }
    .tb-ai-error-box {
      background:${T.redL}; border:1.5px solid rgba(239,68,68,.3); border-radius:10px;
      padding:10px 14px; display:flex; gap:8px; align-items:flex-start; width:100%;
    }
    .tb-ai-error-box-text { font-size:12px; color:#991B1B; font-weight:600; line-height:1.5; }

    /* ── Body layout ── */
    .tb-body { flex:1; display:flex; overflow:hidden; min-height:0; }

    /* ── Left sidebar ── */
    .tb-sidebar {
      width:252px; flex-shrink:0; background:#fff;
      border-right:2px solid ${T.border};
      display:flex; flex-direction:column; overflow:hidden;
    }
    .tb-sidebar-head {
      padding:14px 16px 10px; border-bottom:2px solid ${T.bg}; flex-shrink:0;
    }
    .tb-sidebar-label {
      font-size:10px; font-weight:800; letter-spacing:.11em;
      text-transform:uppercase; color:${T.muted}; margin-bottom:8px; display:block;
    }
    .tb-sidebar-title {
      font-family:${T.dFont}; font-size:16px; font-weight:900;
      color:${T.text}; line-height:1.25; margin-bottom:8px;
      word-break:break-word;
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

    /* Question list header */
    .tb-q-list-hd {
      display:flex; align-items:center; justify-content:space-between;
      padding:8px 16px; font-size:10px; font-weight:800;
      letter-spacing:.1em; text-transform:uppercase; color:${T.muted};
    }
    .tb-q-count-badge {
      padding:2px 7px; border-radius:999px; font-size:10px; font-weight:800;
      background:${T.limeL}; color:${T.lime}; border:1.5px solid rgba(13,184,94,.28);
    }

    /* [Phase 4] sidebar total-score summary */
    .tb-sidebar-score-bar {
      margin:0 16px 10px; padding:7px 10px;
      background:${T.bg}; border-radius:10px; border:1.5px solid ${T.border};
      display:flex; align-items:center; justify-content:space-between;
    }
    .tb-sidebar-score-bar-lbl { font-size:10px; font-weight:700; color:${T.muted}; }
    .tb-sidebar-score-bar-val {
      font-family:${T.dFont}; font-size:12px; font-weight:900; color:${T.amber};
    }

    .tb-q-empty {
      padding:18px 16px; text-align:center;
    }
    .tb-q-empty-icon { font-size:26px; opacity:.4; margin-bottom:6px; }
    .tb-q-empty-text { font-size:11px; color:${T.muted}; line-height:1.6; white-space:pre-line; }

    /* Question row — [Phase 4] type-colour left border */
    .tb-q-row {
      display:flex; align-items:flex-start; gap:10px;
      padding:9px 16px; cursor:pointer;
      transition:all .14s;
      border-left:3px solid transparent;
      position:relative;
    }
    .tb-q-row:hover { background:${T.bg}; }
    .tb-q-row--active { background:${T.limeL}; border-left-color:${T.lime}; }
    .tb-q-row--new    { background:${T.violetL}; border-left-color:${T.violet}; }
    .tb-q-num {
      width:22px; height:22px; border-radius:7px; flex-shrink:0;
      display:flex; align-items:center; justify-content:center;
      font-family:${T.dFont}; font-size:10px; font-weight:900;
      background:${T.bg}; color:${T.muted}; border:1.5px solid ${T.border};
      margin-top:1px;
    }
    .tb-q-row--active .tb-q-num {
      background:linear-gradient(135deg,#0DB85E,#00BCD4); color:#fff; border-color:transparent;
    }
    .tb-q-text {
      flex:1; min-width:0; font-size:11px; font-weight:700;
      color:${T.text}; line-height:1.45;
      overflow:hidden; display:-webkit-box;
      -webkit-line-clamp:2; -webkit-box-orient:vertical;
    }
    .tb-q-type-badge {
      padding:2px 7px; border-radius:999px; font-size:9px; font-weight:800;
      background:${T.tealL}; color:${T.teal}; border:1.5px solid rgba(0,188,212,.28);
      white-space:nowrap; flex-shrink:0; align-self:flex-start; margin-top:2px;
    }

    /* [Phase 4] score pill on question row */
    .tb-q-score-pill {
      position:absolute; top:9px; right:12px;
      padding:1px 6px; border-radius:999px; font-size:9px; font-weight:900;
      background:${T.amberL}; color:${T.amber}; border:1.5px solid rgba(245,166,35,.3);
    }

    /* [Phase 4] delete button on question row (appears on hover) */
    .tb-q-del-btn {
      position:absolute; bottom:7px; right:10px;
      width:18px; height:18px; border-radius:5px; border:none;
      background:transparent; color:${T.muted}; cursor:pointer; font-size:11px;
      display:flex; align-items:center; justify-content:center;
      opacity:0; transition:opacity .14s, background .14s;
    }
    .tb-q-row:hover .tb-q-del-btn { opacity:1; }
    .tb-q-del-btn:hover { background:${T.redL}; color:${T.red}; }

    /* Quick-add area */
    .tb-add-area {
      padding:10px 12px; border-top:2px solid ${T.bg}; flex-shrink:0;
    }
    .tb-add-btn {
      display:flex; align-items:center; gap:8px; width:100%;
      padding:8px 12px; border-radius:10px;
      border:2px dashed ${T.border}; background:transparent;
      font-family:${T.dFont}; font-size:11px; font-weight:800;
      color:${T.muted}; cursor:pointer; transition:all .14s;
    }
    .tb-add-btn:hover { border-color:${T.lime}; color:${T.lime}; background:${T.limeL}; }
    .tb-add-btn:disabled { opacity:.4; cursor:not-allowed; }

    /* ── Main editor pane ── */
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
    .tb-breadcrumb-link:hover { color:${T.lime}; }
    .tb-breadcrumb-active { color:${T.lime}; font-weight:800; }

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
      background:${T.bg}; outline:none;
      transition:border-color .15s, box-shadow .15s;
    }
    .tb-input:focus { border-color:${T.lime}; box-shadow:0 0 0 3px ${T.limeL}; background:#fff; }
    .tb-input::placeholder { color:${T.mutedL}; }
    .tb-input--err { border-color:${T.red} !important; box-shadow:0 0 0 3px ${T.redL} !important; }
    .tb-select {
      width:100%; border:2px solid ${T.border}; border-radius:11px;
      padding:9px 13px; font-family:${T.bFont}; font-size:13px; color:${T.text};
      background:${T.bg}; outline:none; cursor:pointer; appearance:none;
      background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%239188C4' d='M6 8L1 3h10z'/%3E%3C/svg%3E");
      background-repeat:no-repeat; background-position:right 13px center;
      transition:border-color .15s;
    }
    .tb-select:focus { border-color:${T.lime}; box-shadow:0 0 0 3px ${T.limeL}; background-color:#fff; }
    .tb-ta {
      width:100%; border:2px solid ${T.border}; border-radius:11px;
      padding:10px 13px; font-family:${T.bFont}; font-size:13px; color:${T.sub};
      background:${T.bg}; outline:none; resize:vertical; line-height:1.65;
      min-height:70px; transition:border-color .15s, box-shadow .15s;
    }
    .tb-ta:focus { border-color:${T.lime}; box-shadow:0 0 0 3px ${T.limeL}; background:#fff; }
    .tb-ta--err { border-color:${T.red} !important; }
    .tb-title-input {
      width:100%; border:2px solid transparent; border-radius:11px;
      padding:7px 10px; font-family:${T.dFont}; font-size:24px; font-weight:900;
      color:${T.text}; background:transparent; outline:none; resize:none;
      line-height:1.25; transition:border-color .15s, background .15s;
    }
    .tb-title-input:hover { background:${T.bg}; border-color:${T.border}; }
    .tb-title-input:focus { border-color:${T.lime}; background:#fff; box-shadow:0 0 0 3px ${T.limeL}; }
    .tb-title-input::placeholder { color:${T.mutedL}; font-style:italic; }

    /* Toggle */
    .tb-toggle {
      position:relative; width:36px; height:20px; flex-shrink:0;
    }
    .tb-toggle input { opacity:0; width:0; height:0; position:absolute; }
    .tb-toggle-track {
      position:absolute; inset:0; border-radius:10px; cursor:pointer;
      background:${T.border}; transition:background .18s;
    }
    .tb-toggle input:checked + .tb-toggle-track { background:${T.lime}; }
    .tb-toggle-thumb {
      position:absolute; top:3px; left:3px; width:14px; height:14px;
      border-radius:50%; background:#fff;
      box-shadow:0 1px 4px rgba(0,0,0,.2); transition:transform .18s;
      pointer-events:none;
    }
    .tb-toggle input:checked ~ .tb-toggle-thumb { transform:translateX(16px); }

    /* Error message */
    .tb-error {
      background:${T.redL}; border:1.5px solid rgba(239,68,68,.25);
      border-radius:10px; padding:9px 12px;
      font-size:12px; font-weight:700; color:${T.red};
      display:flex; align-items:center; gap:8px; margin-bottom:12px;
    }

    /* ── Question type chooser ── */
    .tb-type-grid {
      display:grid; grid-template-columns:repeat(4,1fr); gap:10px; margin-bottom:18px;
    }
    .tb-type-chip {
      display:flex; flex-direction:column; align-items:center; gap:6px;
      padding:14px 6px; border-radius:14px; border:2px solid ${T.border};
      background:#fff; cursor:pointer; transition:all .16s cubic-bezier(.22,.68,0,1.3);
      font-family:${T.dFont}; font-size:11px; font-weight:900; color:${T.sub};
    }
    .tb-type-chip:hover { border-color:${T.violet}; transform:translateY(-2px); }
    .tb-type-chip--active { border-color:transparent; color:#fff; transform:translateY(-2px);
      box-shadow:0 6px 18px rgba(0,0,0,.15); }
    .tb-type-chip-icon { font-size:22px; }

    /* MCQ option rows */
    .tb-opt-row {
      display:flex; align-items:center; gap:8px;
      padding:7px 10px; border-radius:11px;
      border:2px solid ${T.border}; background:${T.bg};
      margin-bottom:7px; transition:border-color .14s;
    }
    .tb-opt-row--correct { border-color:${T.lime}; background:${T.limeL}; }
    .tb-opt-row-key {
      width:24px; height:24px; border-radius:7px; flex-shrink:0;
      display:flex; align-items:center; justify-content:center;
      font-family:${T.dFont}; font-size:10px; font-weight:900;
      background:rgba(0,0,0,.06); color:${T.muted};
    }
    .tb-opt-row--correct .tb-opt-row-key { background:${T.lime}; color:#fff; }
    .tb-opt-input {
      flex:1; border:none; background:transparent; outline:none;
      font-size:13px; font-family:${T.bFont}; color:${T.text};
    }
    .tb-opt-input::placeholder { color:${T.mutedL}; }
    .tb-opt-correct-btn {
      width:22px; height:22px; border-radius:6px; border:none;
      cursor:pointer; font-size:11px; flex-shrink:0;
      transition:all .14s; display:flex; align-items:center; justify-content:center;
    }
    .tb-opt-correct-btn--on  { background:${T.lime}; color:#fff; }
    .tb-opt-correct-btn--off { background:${T.border}; color:${T.muted}; }
    .tb-opt-correct-btn--off:hover { background:${T.limeL}; color:${T.lime}; }
    .tb-opt-del-btn {
      width:22px; height:22px; border-radius:6px; border:none;
      background:transparent; cursor:pointer; color:${T.muted}; font-size:13px;
      display:flex; align-items:center; justify-content:center;
      transition:all .14s;
    }
    .tb-opt-del-btn:hover { background:${T.redL}; color:${T.red}; }

    /* Cloze gap pills */
    .tb-gap-list { display:flex; flex-wrap:wrap; gap:7px; margin-top:10px; }
    .tb-gap-pill {
      display:inline-flex; align-items:center; gap:6px;
      padding:4px 10px 4px 12px; border-radius:999px;
      background:${T.amberL}; border:1.5px solid rgba(245,166,35,.4);
      font-size:12px; font-weight:700; color:${T.amber};
    }
    .tb-gap-pill-del {
      width:16px; height:16px; border-radius:50%; border:none;
      background:rgba(245,166,35,.25); color:${T.amber}; cursor:pointer;
      font-size:10px; display:flex; align-items:center; justify-content:center;
      transition:all .12s;
    }
    .tb-gap-pill-del:hover { background:${T.amber}; color:#fff; }

    /* Visual media zone — [Phase 3] */
    .tb-media-zone {
      border:2px dashed ${T.border}; border-radius:14px;
      padding:20px; text-align:center; cursor:pointer;
      transition:all .16s; background:${T.bg};
    }
    .tb-media-zone:hover { border-color:${T.violet}; background:${T.violetL}; }
    .tb-media-zone--uploading {
      border-color:${T.sky}; background:${T.skyL};
      animation:uploadPulse 1.4s ease-in-out infinite;
    }
    @keyframes uploadPulse { 0%,100%{opacity:1} 50%{opacity:.65} }
    .tb-media-preview {
      width:100%; max-height:220px; border-radius:12px;
      object-fit:contain; border:2px solid ${T.border};
      box-shadow:0 4px 16px rgba(0,0,0,.08);
    }
    .tb-media-preview-wrap {
      position:relative; display:inline-block; width:100%;
    }
    .tb-media-remove-btn {
      position:absolute; top:8px; right:8px;
      background:rgba(0,0,0,.6); color:#fff; border:none;
      border-radius:50%; width:26px; height:26px; cursor:pointer;
      font-size:11px; display:flex; align-items:center; justify-content:center;
      transition:background .14s;
    }
    .tb-media-remove-btn:hover { background:${T.red}; }
    .tb-media-meta {
      margin-top:6px; display:flex; align-items:center; gap:6px;
      font-size:10px; font-weight:700; color:${T.muted};
    }

    /* [Phase 4] Edit-mode header banner */
    .tb-edit-banner {
      display:flex; align-items:center; gap:10px;
      padding:9px 14px; border-radius:12px;
      background:${T.skyL}; border:1.5px solid rgba(0,153,230,.25);
      font-size:12px; font-weight:700; color:${T.sky};
      margin-bottom:14px;
    }

    /* [Phase 3-AI] AI draft entry banner — shown at top of metadata view only */
    .tb-ai-draft-banner {
      display:flex; align-items:flex-start; gap:12px;
      padding:13px 16px; border-radius:14px; margin-bottom:18px;
      background:linear-gradient(135deg,${T.violetL} 0%,rgba(240,68,124,.09) 100%);
      border:1.5px solid rgba(108,53,222,.22);
      animation:fadeUp .3s cubic-bezier(.22,.68,0,1.15) both;
    }
    .tb-ai-draft-banner-icon {
      width:36px; height:36px; border-radius:11px; flex-shrink:0;
      background:linear-gradient(135deg,${T.violet},${T.pink});
      display:flex; align-items:center; justify-content:center;
      font-size:16px; color:#fff;
      box-shadow:0 3px 10px rgba(108,53,222,.3);
    }
    .tb-ai-draft-banner-body { flex:1; min-width:0; }
    .tb-ai-draft-banner-title {
      font-family:${T.dFont}; font-size:13px; font-weight:900; color:${T.violet};
      margin-bottom:3px;
    }
    .tb-ai-draft-banner-sub {
      font-size:11px; font-weight:600; color:${T.sub}; line-height:1.6;
    }
    .tb-ai-draft-banner-sub strong { color:${T.text}; font-weight:800; }
    .tb-ai-draft-banner-dismiss {
      width:22px; height:22px; border-radius:7px; border:none;
      background:rgba(108,53,222,.12); color:${T.violet}; flex-shrink:0;
      cursor:pointer; font-size:12px; display:flex; align-items:center; justify-content:center;
      transition:all .14s; margin-top:1px;
    }
    .tb-ai-draft-banner-dismiss:hover { background:rgba(108,53,222,.22); }

    /* [Phase 4] Future-type stub banner */
    .tb-stub-banner {
      padding:32px 24px; text-align:center;
      background:${T.bg}; border-radius:16px;
      border:2px dashed ${T.border};
    }
    .tb-stub-banner-icon { font-size:36px; margin-bottom:12px; opacity:.5; }
    .tb-stub-banner-title { font-family:${T.dFont}; font-size:16px; font-weight:900; color:${T.muted}; margin-bottom:6px; }
    .tb-stub-banner-sub { font-size:12px; color:${T.mutedL}; }

    /* Question editor submit bar */
    .tb-q-submit-bar {
      display:flex; align-items:center; gap:10px;
      padding:14px 30px; background:#fff;
      border-top:2px solid ${T.border}; flex-shrink:0;
    }

    /* No test state */
    .tb-no-test {
      display:flex; flex-direction:column; align-items:center; justify-content:center;
      min-height:320px; padding:48px 24px; text-align:center;
    }
    .tb-no-test-icon { font-size:52px; margin-bottom:18px; opacity:.55; }
    .tb-no-test-title { font-family:${T.dFont}; font-size:20px; font-weight:900; color:${T.text}; margin-bottom:8px; }
    .tb-no-test-sub { font-size:13px; color:${T.sub}; line-height:1.7; max-width:300px; margin-bottom:24px; }

    /* ── Right inspector ── */
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
    .tb-insp-val { font-weight:800; color:${T.text}; text-align:right; max-width:130px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

    /* [Phase 4] Scoring summary in inspector */
    .tb-score-bar-track {
      height:6px; border-radius:3px; background:${T.bg};
      border:1.5px solid ${T.border}; overflow:hidden; margin-top:6px;
    }
    .tb-score-bar-fill {
      height:100%; border-radius:3px;
      background:linear-gradient(90deg,#0DB85E,#00BCD4);
      transition:width .4s cubic-bezier(.22,.68,0,1.15);
    }
    .tb-score-breakdown {
      display:flex; flex-direction:column; gap:5px; margin-top:8px;
    }
    .tb-score-type-row {
      display:flex; align-items:center; gap:7px; font-size:10px;
    }
    .tb-score-type-dot {
      width:7px; height:7px; border-radius:50%; flex-shrink:0;
    }
    .tb-score-type-lbl { flex:1; font-weight:600; color:${T.muted}; }
    .tb-score-type-val { font-weight:800; color:${T.text}; }

    /* Readiness check rows */
    .tb-check-row {
      display:flex; align-items:center; gap:8px;
      padding:5px 0; font-size:11px; font-weight:600;
    }
    .tb-check-icon {
      width:18px; height:18px; border-radius:5px; flex-shrink:0;
      display:flex; align-items:center; justify-content:center; font-size:10px;
    }
    .tb-check-icon--ok   { background:${T.limeL}; color:${T.lime}; }
    .tb-check-icon--warn { background:${T.redL};  color:${T.red};  }
    .tb-check-icon--info { background:${T.bg};    color:${T.muted}; border:1.5px solid ${T.border}; }

    /* [Phase 4] publish readiness score ring */
    .tb-readiness-ring-wrap {
      display:flex; align-items:center; gap:12px; margin-bottom:10px;
    }
    .tb-readiness-ring {
      width:44px; height:44px; border-radius:50%; flex-shrink:0;
      display:flex; align-items:center; justify-content:center;
      font-family:${T.dFont}; font-size:13px; font-weight:900; color:#fff;
      position:relative;
    }

    /* Inspector action buttons */
    .tb-act-btn {
      display:flex; align-items:center; gap:8px; width:100%; padding:9px 12px;
      border-radius:10px; border:2px solid ${T.border}; background:#fff;
      font-size:12px; font-weight:800; color:${T.text}; cursor:pointer;
      transition:all .14s; font-family:${T.bFont}; text-align:left;
    }
    .tb-act-btn + .tb-act-btn { margin-top:6px; }
    .tb-act-btn:hover:not(:disabled) { border-color:${T.lime}; color:${T.lime}; background:${T.limeL}; }
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
    .tb-act-btn--add-q {
      background:linear-gradient(135deg,${T.violet},#9333ea);
      border-color:transparent; color:#fff;
      box-shadow:0 4px 14px rgba(108,53,222,.2);
    }
    .tb-act-btn--add-q:hover:not(:disabled) { filter:brightness(1.08); color:#fff; border-color:transparent; }
    .tb-act-btn--danger { color:${T.red}; border-color:rgba(239,68,68,.25); }
    .tb-act-btn--danger:hover:not(:disabled) { border-color:${T.red}; background:${T.redL}; color:${T.red}; }
    .tb-act-btn-icon {
      width:22px; height:22px; border-radius:7px;
      display:flex; align-items:center; justify-content:center;
      font-size:11px; flex-shrink:0;
      background:rgba(0,0,0,.05);
    }
    .tb-act-btn--save    .tb-act-btn-icon { background:rgba(255,255,255,.2); }
    .tb-act-btn--publish .tb-act-btn-icon { background:rgba(255,255,255,.2); }
    .tb-act-btn--add-q   .tb-act-btn-icon { background:rgba(255,255,255,.2); }

    /* Confirm delete */
    .tb-confirm-del {
      background:${T.redL}; border-radius:11px; padding:10px 12px;
      border:1.5px solid rgba(239,68,68,.2); animation:fadeIn .15s both;
      margin-top:6px;
    }

    /* Content rows (reusing ws-content-* from TeacherOnboarding) */
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

    /* Hint box */
    .tb-hint {
      padding:10px 14px; border-radius:11px;
      background:${T.bg}; border:1.5px solid ${T.border};
      font-size:11px; color:${T.muted}; line-height:1.6;
      display:flex; align-items:flex-start; gap:8px;
    }

    /* Add option button */
    .tb-add-opt {
      display:inline-flex; align-items:center; gap:7px;
      padding:6px 14px; border-radius:9px;
      border:2px dashed ${T.border}; background:transparent;
      font-size:11px; font-weight:800; color:${T.muted};
      cursor:pointer; transition:all .14s; font-family:${T.dFont};
    }
    .tb-add-opt:hover { border-color:${T.lime}; color:${T.lime}; background:${T.limeL}; }

    /* Primary CTA button */
    .tb-btn-primary {
      display:inline-flex; align-items:center; gap:7px;
      padding:9px 20px; border-radius:11px; border:none; cursor:pointer;
      font-family:${T.dFont}; font-size:13px; font-weight:900; color:#fff;
      background:linear-gradient(135deg,#0DB85E,#00BCD4);
      box-shadow:0 4px 14px rgba(13,184,94,.3);
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

    /* Level chips */
    .tb-level-row { display:flex; gap:6px; flex-wrap:wrap; }
    .tb-level-chip {
      padding:4px 12px; border-radius:999px; border:2px solid ${T.border};
      font-size:11px; font-weight:800; color:${T.muted}; cursor:pointer;
      background:#fff; transition:all .14s;
    }
    .tb-level-chip--active {
      background:${T.violet}; color:#fff; border-color:transparent;
      box-shadow:0 3px 10px rgba(108,53,222,.25);
    }
    .tb-level-chip:hover:not(.tb-level-chip--active) { border-color:${T.violet}; color:${T.violet}; }

    /* Shimmer */
    .shimmer {
      background:linear-gradient(90deg,#EDE9FF 25%,#F5F3FF 50%,#EDE9FF 75%);
      background-size:600px 100%; animation:shimmer 1.6s infinite linear; border-radius:8px;
    }
    @keyframes shimmer { to { background-position:600px 0; } }

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
    @keyframes saveFlash {
      0%   { opacity:0; transform:translateY(16px); }
      10%  { opacity:1; transform:translateY(0);     }
      80%  { opacity:1; }
      100% { opacity:0; }
    }

    @media (max-width:1100px) { .tb-inspector { display:none; } }
    @media (max-width:860px)  { .tb-sidebar   { display:none; } }
  `}</style>
);

/* ═══════════════════════════════════════════════════════════════════════════
   QUESTION SIDEBAR  [Phase 4: score pills, type-colour borders, del button]
   ═══════════════════════════════════════════════════════════════════════════ */
function QuestionSidebar({
  test, questions, selectedQId, addingNew,
  onSelectQuestion, onAddQuestion, onDeleteQuestion, loading,
}) {
  const sc      = test ? statusCfg(test.status) : null;
  const hasTest = !!test;
  const totalPts = questions.reduce((s, q) => s + (q.score || q.points || 0), 0);

  return (
    <div className="tb-sidebar">
      <div className="tb-sidebar-head">
        <span className="tb-sidebar-label">Test</span>

        {hasTest ? (
          <>
            <div className={`tb-sidebar-title${!test.title ? " tb-sidebar-title--placeholder" : ""}`}>
              {test.title || "Untitled test"}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
              <span style={{
                fontSize: 10, fontWeight: 800, padding: "2px 9px", borderRadius: 999,
                background: sc.bg, color: sc.col, border: `1.5px solid ${sc.border}`,
              }}>
                {test.status === "published" ? "✓ " : "⏱ "}{sc.label}
              </span>
            </div>
            {test.unit_id && (
              <div className="tb-sidebar-unit">
                <span style={{ fontSize: 13 }}>📂</span>
                <span>Unit {test.unit_id}</span>
              </div>
            )}
          </>
        ) : (
          <div className="tb-sidebar-title tb-sidebar-title--placeholder">No test yet</div>
        )}
      </div>

      <div className="tb-sidebar-scroll">
        <div className="tb-q-list-hd">
          <span>Questions</span>
          {questions.length > 0 && (
            <span className="tb-q-count-badge">{questions.length}</span>
          )}
        </div>

        {/* [Phase 4] scoring summary bar */}
        {questions.length > 0 && (
          <div className="tb-sidebar-score-bar">
            <span className="tb-sidebar-score-bar-lbl">Total score</span>
            <span className="tb-sidebar-score-bar-val">{totalPts} pts</span>
          </div>
        )}

        {loading ? (
          <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
            {[80, 65, 75].map((_, i) => (
              <div key={i} className="shimmer" style={{ height: 52, borderRadius: 10 }} />
            ))}
          </div>
        ) : questions.length === 0 && !addingNew ? (
          /* [Phase 4] improved empty state */
          <div className="tb-q-empty">
            <div className="tb-q-empty-icon">📋</div>
            <div className="tb-q-empty-text">
              {hasTest
                ? "No questions yet.\nClick ＋ Add question\nto get started."
                : "Create a test first\nto add questions."}
            </div>
          </div>
        ) : (
          <>
            {questions.map((q, qi) => {
              const qtype    = q.type || q.question_type || "multiple_choice";
              const typeInfo = QUESTION_TYPES.find((t) => t.type === qtype);
              const typeColor = TYPE_COLOR[qtype] || T.teal;
              const typeLabel = qtype.replace(/_/g, " ");
              const isActive  = selectedQId === q.id;
              return (
                <div
                  key={q.id}
                  className={`tb-q-row${isActive ? " tb-q-row--active" : ""}`}
                  style={!isActive ? { borderLeftColor: typeColor + "55" } : {}}
                  onClick={() => onSelectQuestion(q.id)}
                >
                  <div className="tb-q-num"
                    style={!isActive ? { borderColor: typeColor + "55" } : {}}
                  >{qi + 1}</div>
                  <div style={{ flex: 1, minWidth: 0, paddingRight: 38 }}>
                    <div className="tb-q-text">
                      {q.prompt || q.question_text || q.text || "Untitled question"}
                    </div>
                    {typeLabel && (
                      <div className="tb-q-type-badge" style={{
                        marginTop: 4, display: "inline-block",
                        background: (typeInfo?.colorL || T.tealL),
                        color: typeColor,
                        borderColor: typeColor + "44",
                      }}>
                        {typeInfo?.icon || ""} {typeLabel}
                      </div>
                    )}
                  </div>
                  {/* [Phase 4] score pill */}
                  {(q.score || q.points) ? (
                    <div className="tb-q-score-pill">{q.score || q.points}pt</div>
                  ) : null}
                  {/* [Phase 5] delete button - uses normalized q.id (real question_id) */}
                  <button
                    className="tb-q-del-btn"
                    onClick={(e) => { e.stopPropagation(); onDeleteQuestion(q.id); }}
                    title="Delete question"
                  >✕</button>
                </div>
              );
            })}
            {addingNew && (
              <div className="tb-q-row tb-q-row--new">
                <div className="tb-q-num" style={{ background: T.violet, color: "#fff", border: "none" }}>
                  {questions.length + 1}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="tb-q-text" style={{ color: T.violet }}>New question…</div>
                  <div className="tb-q-type-badge" style={{
                    marginTop: 4, display: "inline-block",
                    background: T.violetL, color: T.violet, borderColor: "rgba(108,53,222,.25)",
                  }}>
                    drafting
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <div className="tb-add-area">
        <button
          className="tb-add-btn"
          disabled={!hasTest}
          onClick={onAddQuestion}
          title={hasTest ? "Add a new question" : "Create a test first"}
        >
          <span style={{ fontSize: 14 }}>＋</span>
          Add question
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   TEST METADATA PANEL
   ═══════════════════════════════════════════════════════════════════════════ */
function TestMetadataPanel({ meta, onChange, onSave, saving, error, isNew }) {
  const hc = (field) => (e) => onChange({ ...meta, [field]: e.target.value });

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
            background: "linear-gradient(135deg,#0DB85E,#00BCD4)",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20,
          }}>📝</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <textarea
              className="tb-title-input"
              value={meta.title}
              rows={1}
              onChange={hc("title")}
              onInput={(e) => {
                e.target.style.height = "auto";
                e.target.style.height = e.target.scrollHeight + "px";
              }}
              placeholder="Test title…"
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
                }}>✏ Editing metadata</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Description / instructions */}
      <div className="tb-form-card">
        <div className="tb-form-card-title">📋 Description &amp; Instructions</div>
        <div className="tb-field">
          <label className="tb-label">Description</label>
          <textarea className="tb-ta" value={meta.description} rows={2}
            onChange={hc("description")} placeholder="Brief description shown to students…" />
        </div>
        <div className="tb-field">
          <label className="tb-label">Instructions</label>
          <textarea className="tb-ta" value={meta.instructions} rows={3}
            onChange={hc("instructions")} placeholder="Read each question carefully…" />
        </div>
      </div>

      {/* Settings grid */}
      <div className="tb-form-card">
        <div className="tb-form-card-title">⚙ Settings</div>
        <div className="tb-form-grid">
          <div className="tb-field">
            <label className="tb-label">Time Limit (minutes)</label>
            <input className="tb-input" type="number" min="1"
              value={meta.time_limit_minutes} onChange={hc("time_limit_minutes")} placeholder="e.g. 30" />
          </div>
          <div className="tb-field">
            <label className="tb-label">Passing Score (%)</label>
            <input className="tb-input" type="number" min="0" max="100"
              value={meta.passing_score} onChange={hc("passing_score")} placeholder="e.g. 70" />
          </div>
          <div className="tb-field">
            <label className="tb-label">Order index</label>
            <input className="tb-input" type="number" min="0"
              value={meta.order_index} onChange={hc("order_index")} placeholder="0" />
          </div>
          <div className="tb-field">
            <label className="tb-label">Scheduled publish (optional)</label>
            <input className="tb-input" type="datetime-local"
              value={meta.publish_at} onChange={hc("publish_at")} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MCQ QUESTION FORM
   ═══════════════════════════════════════════════════════════════════════════ */
function MCQQuestionForm({ draft, onChange }) {
  const setField = (field, val) => onChange({ ...draft, [field]: val });

  const updateOpt = (id, text) => onChange({
    ...draft,
    options: draft.options.map((o) => (o.id === id ? { ...o, text } : o)),
  });
  const toggleCorrect = (id) => {
    const already = draft.correct_option_ids.includes(id);
    onChange({
      ...draft,
      correct_option_ids: already
        ? draft.correct_option_ids.filter((x) => x !== id)
        : [...draft.correct_option_ids, id],
    });
  };
  const addOption = () => onChange({ ...draft, options: [...draft.options, { id: uid(), text: "" }] });
  const delOption = (id) => onChange({
    ...draft,
    options: draft.options.filter((o) => o.id !== id),
    correct_option_ids: draft.correct_option_ids.filter((x) => x !== id),
  });

  const LABELS = ["A", "B", "C", "D", "E", "F"];

  return (
    <>
      <div className="tb-field">
        <label className="tb-label tb-label--req">Question prompt</label>
        <textarea className="tb-ta" rows={3} value={draft.prompt}
          onChange={(e) => setField("prompt", e.target.value)}
          placeholder="Enter your question here…" />
      </div>

      <div className="tb-field">
        <label className="tb-label tb-label--req">Answer options
          <span style={{ fontSize: 10, fontWeight: 600, color: T.muted, marginLeft: 8, textTransform: "none", letterSpacing: 0 }}>
            — click ✓ to mark correct
          </span>
        </label>
        {draft.options.map((opt, oi) => {
          const isCorrect = draft.correct_option_ids.includes(opt.id);
          return (
            <div key={opt.id} className={`tb-opt-row${isCorrect ? " tb-opt-row--correct" : ""}`}>
              <div className="tb-opt-row-key">{LABELS[oi] || oi + 1}</div>
              <input
                className="tb-opt-input"
                value={opt.text}
                onChange={(e) => updateOpt(opt.id, e.target.value)}
                placeholder={`Option ${LABELS[oi] || oi + 1}…`}
              />
              <button
                className={`tb-opt-correct-btn ${isCorrect ? "tb-opt-correct-btn--on" : "tb-opt-correct-btn--off"}`}
                onClick={() => toggleCorrect(opt.id)}
                title="Mark as correct"
              >✓</button>
              {draft.options.length > 2 && (
                <button className="tb-opt-del-btn" onClick={() => delOption(opt.id)} title="Remove">✕</button>
              )}
            </div>
          );
        })}
        {draft.options.length < 6 && (
          <button className="tb-add-opt" onClick={addOption} style={{ marginTop: 4 }}>
            <span>＋</span> Add option
          </button>
        )}
        {draft.correct_option_ids.length === 0 && draft.options.some((o) => o.text) && (
          <div className="tb-error" style={{ marginTop: 10 }}>
            <span>⚠</span> Mark at least one option as correct.
          </div>
        )}
      </div>

      <div className="tb-form-grid" style={{ marginTop: 4 }}>
        <div className="tb-field">
          <label className="tb-label">Points</label>
          <input className="tb-input" type="number" min="0" step="0.5"
            value={draft.score} onChange={(e) => setField("score", Number(e.target.value))}
            placeholder="1" />
        </div>
        <div className="tb-field">
          <label className="tb-label">Autograde</label>
          <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 8 }}>
            <label className="tb-toggle">
              <input type="checkbox" checked={draft.autograde}
                onChange={(e) => setField("autograde", e.target.checked)} />
              <div className="tb-toggle-track" />
              <div className="tb-toggle-thumb" />
            </label>
            <span style={{ fontSize: 12, fontWeight: 700, color: draft.autograde ? T.lime : T.muted }}>
              {draft.autograde ? "Auto-graded" : "Manual"}
            </span>
          </div>
        </div>
        <div className="tb-field">
          <label className="tb-label">Shuffle options</label>
          <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 8 }}>
            <label className="tb-toggle">
              <input type="checkbox" checked={draft.shuffle_options}
                onChange={(e) => setField("shuffle_options", e.target.checked)} />
              <div className="tb-toggle-track" />
              <div className="tb-toggle-thumb" />
            </label>
            <span style={{ fontSize: 12, fontWeight: 700, color: draft.shuffle_options ? T.lime : T.muted }}>
              {draft.shuffle_options ? "Shuffle on" : "Fixed order"}
            </span>
          </div>
        </div>
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   OPEN ANSWER FORM
   ═══════════════════════════════════════════════════════════════════════════ */
function OpenAnswerQuestionForm({ draft, onChange }) {
  const setField = (field, val) => onChange({ ...draft, [field]: val });

  return (
    <>
      <div className="tb-field">
        <label className="tb-label tb-label--req">Question prompt</label>
        <textarea className="tb-ta" rows={3} value={draft.prompt}
          onChange={(e) => setField("prompt", e.target.value)}
          placeholder="Enter your question here…" />
      </div>

      <div className="tb-field">
        <label className="tb-label">Expected answer / rubric</label>
        <textarea className="tb-ta" rows={3}
          value={typeof draft.expected === "string" ? draft.expected : (draft.expected?.text || draft.expected?.answer || "")}
          onChange={(e) => setField("expected", { text: e.target.value })}
          placeholder="Model answer or grading rubric (used for auto-scoring if enabled)…" />
        <div className="tb-hint" style={{ marginTop: 8 }}>
          <span>💡</span>
          <span>This is used to guide reviewers or power AI-assisted auto-scoring.</span>
        </div>
      </div>

      <div className="tb-form-grid" style={{ marginTop: 4 }}>
        <div className="tb-field">
          <label className="tb-label">Points</label>
          <input className="tb-input" type="number" min="0" step="0.5"
            value={draft.score} onChange={(e) => setField("score", Number(e.target.value))} placeholder="1" />
        </div>
        <div className="tb-field">
          <label className="tb-label">Autograde</label>
          <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 8 }}>
            <label className="tb-toggle">
              <input type="checkbox" checked={draft.autograde}
                onChange={(e) => setField("autograde", e.target.checked)} />
              <div className="tb-toggle-track" />
              <div className="tb-toggle-thumb" />
            </label>
            <span style={{ fontSize: 12, fontWeight: 700, color: draft.autograde ? T.lime : T.muted }}>
              {draft.autograde ? "Auto-graded" : "Manual"}
            </span>
          </div>
        </div>
        <div className="tb-field">
          <label className="tb-label">Send for manual review if score below (%)</label>
          <input className="tb-input" type="number" min="0" max="100"
            value={draft.manual_review_if_below ?? ""}
            onChange={(e) => setField("manual_review_if_below", e.target.value ? Number(e.target.value) : null)}
            placeholder="e.g. 60" />
        </div>
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   CLOZE FORM
   ═══════════════════════════════════════════════════════════════════════════ */
function ClozeQuestionForm({ draft, onChange }) {
  const setField = (field, val) => onChange({ ...draft, [field]: val });
  const [gapInput, setGapInput] = useState("");

  const syncGapsFromPrompt = (promptText) => {
    const matches = [...promptText.matchAll(/\{\{([^}]+)\}\}/g)];
    const newGaps = matches.map((m, i) => ({
      id: uid(), index: i, answer: m[1], placeholder: "___",
    }));
    onChange({ ...draft, prompt: promptText, gaps: newGaps });
  };

  const addGap = () => {
    const answer = gapInput.trim();
    if (!answer) return;
    const newPrompt = draft.prompt + ` {{${answer}}}`;
    const newGap    = { id: uid(), index: draft.gaps.length, answer, placeholder: "___" };
    onChange({ ...draft, prompt: newPrompt, gaps: [...draft.gaps, newGap] });
    setGapInput("");
  };

  const removeGap = (gapId) => {
    const gap = draft.gaps.find((g) => g.id === gapId);
    if (!gap) return;
    const newGaps   = draft.gaps.filter((g) => g.id !== gapId);
    const newPrompt = draft.prompt.replace(` {{${gap.answer}}}`, "").replace(`{{${gap.answer}}}`, "");
    onChange({ ...draft, prompt: newPrompt, gaps: newGaps });
  };

  return (
    <>
      <div className="tb-hint" style={{ marginBottom: 14 }}>
        <span>💡</span>
        <div>
          Write your sentence and insert gaps using{" "}
          <code style={{ background: T.border, padding: "1px 4px", borderRadius: 4, fontSize: 11 }}>{"{{answer}}"}</code>{" "}
          syntax, or use the gap builder below.
        </div>
      </div>

      <div className="tb-field">
        <label className="tb-label tb-label--req">Sentence with gaps</label>
        <textarea className="tb-ta" rows={3} value={draft.prompt}
          onChange={(e) => syncGapsFromPrompt(e.target.value)}
          placeholder={`The capital of France is {{Paris}} and it is famous for the {{Eiffel Tower}}.`} />
      </div>

      {draft.gaps.length > 0 && (
        <div className="tb-field">
          <label className="tb-label">Detected gaps</label>
          <div className="tb-gap-list">
            {draft.gaps.map((gap) => (
              <div key={gap.id} className="tb-gap-pill">
                <span>{gap.answer}</span>
                <button className="tb-gap-pill-del" onClick={() => removeGap(gap.id)}>✕</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="tb-field">
        <label className="tb-label">Quick-add a gap</label>
        <div style={{ display: "flex", gap: 8 }}>
          <input className="tb-input" style={{ flex: 1 }}
            value={gapInput}
            onChange={(e) => setGapInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addGap()}
            placeholder="Type correct answer and press Enter…" />
          <button className="tb-btn-primary" style={{ flexShrink: 0, padding: "9px 16px" }}
            onClick={addGap} disabled={!gapInput.trim()}>
            ＋ Add
          </button>
        </div>
      </div>

      <div className="tb-form-grid" style={{ marginTop: 4 }}>
        <div className="tb-field">
          <label className="tb-label">Points</label>
          <input className="tb-input" type="number" min="0" step="0.5"
            value={draft.score} onChange={(e) => setField("score", Number(e.target.value))} placeholder="1" />
        </div>
        <div className="tb-field">
          <label className="tb-label">Autograde</label>
          <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 8 }}>
            <label className="tb-toggle">
              <input type="checkbox" checked={draft.autograde}
                onChange={(e) => setField("autograde", e.target.checked)} />
              <div className="tb-toggle-track" />
              <div className="tb-toggle-thumb" />
            </label>
            <span style={{ fontSize: 12, fontWeight: 700, color: draft.autograde ? T.lime : T.muted }}>
              {draft.autograde ? "Auto-graded" : "Manual"}
            </span>
          </div>
        </div>
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   VISUAL QUESTION FORM  [Phase 3: full image upload implementation]
   ═══════════════════════════════════════════════════════════════════════════ */
function VisualQuestionForm({ draft, onChange }) {
  const setField = (field, val) => onChange({ ...draft, [field]: val });
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(null); // future XHR progress hook
  const fileRef = useRef();

  /**
   * PHASE 3: Upload to POST /tests/questions/upload-image
   * Backend must return { path, url } (or compatible aliases).
   * We store { type:"image", path, url } in media[0].
   */
  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadErr(null);
    setUploadProgress(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const result = await apiUpload("/tests/questions/upload-image", fd);
      // Accept any of these response shapes
      const url  = result.url  || result.image_url || result.file_url || result.path || "";
      const path = result.path || result.file_path || url;
      // Append to existing media array (do not replace if multiple images ever needed)
      onChange({
        ...draft,
        media: [{ type: "image", path, url }],  // schema matches backend contract
      });
    } catch (err) {
      setUploadErr(err.message || "Upload failed.");
    } finally {
      setUploading(false);
      setUploadProgress(null);
      // Reset file input so same file can be re-selected after removal
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleRemoveImage = () => {
    onChange({ ...draft, media: [] });
    if (fileRef.current) fileRef.current.value = "";
    setUploadErr(null);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const fakeEvent = { target: { files: [file] } };
    handleUpload(fakeEvent);
  };

  const imageItem = draft.media?.[0];
  const imageUrl  = imageItem?.url;

  const showOptions = ["multiple_choice", "single_choice", "true_false"].includes(draft.answer_type);
  const LABELS = ["A", "B", "C", "D", "E"];

  const updateOpt = (id, text) => onChange({
    ...draft, options: (draft.options || []).map((o) => (o.id === id ? { ...o, text } : o)),
  });
  const toggleCorrect = (id) => {
    const already = (draft.correct_option_ids || []).includes(id);
    onChange({
      ...draft,
      correct_option_ids: already
        ? (draft.correct_option_ids || []).filter((x) => x !== id)
        : [...(draft.correct_option_ids || []), id],
    });
  };
  const addOption = () => onChange({ ...draft, options: [...(draft.options || []), { id: uid(), text: "" }] });
  const delOption = (id) => onChange({
    ...draft,
    options: (draft.options || []).filter((o) => o.id !== id),
    correct_option_ids: (draft.correct_option_ids || []).filter((x) => x !== id),
  });

  const atSwitchAnswerType = (type) => {
    let newDraft = { ...draft, answer_type: type };
    if (type === "true_false") {
      const tId = uid(), fId = uid();
      newDraft.options = [{ id: tId, text: "True" }, { id: fId, text: "False" }];
      newDraft.correct_option_ids = [];
    }
    onChange(newDraft);
  };

  return (
    <>
      {/* ── Image upload zone ── */}
      <div className="tb-field">
        <label className="tb-label tb-label--req">Image</label>

        {imageUrl ? (
          /* Preview + remove */
          <div className="tb-media-preview-wrap">
            <img src={imageUrl} alt="Question visual" className="tb-media-preview" />
            <button className="tb-media-remove-btn" onClick={handleRemoveImage} title="Remove image">✕</button>
            {imageItem?.path && (
              <div className="tb-media-meta">
                <span>📎</span>
                <span style={{ fontFamily: "monospace", fontSize: 9, wordBreak: "break-all" }}>
                  {imageItem.path}
                </span>
              </div>
            )}
          </div>
        ) : (
          /* Upload zone — drag & drop supported */
          <div
            className={`tb-media-zone${uploading ? " tb-media-zone--uploading" : ""}`}
            onClick={() => !uploading && fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
          >
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={handleUpload}
            />
            <div style={{ fontSize: 30, marginBottom: 8 }}>
              {uploading ? (
                <span className="tb-spin tb-spin--dark" style={{ width: 28, height: 28, borderWidth: 3 }} />
              ) : "🖼"}
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.sub }}>
              {uploading ? "Uploading…" : "Click or drag to upload image"}
            </div>
            <div style={{ fontSize: 11, color: T.muted, marginTop: 4 }}>PNG, JPG, GIF, WebP · up to 10 MB</div>
          </div>
        )}

        {uploadErr && (
          <div className="tb-error" style={{ marginTop: 8 }}>
            <span>⚠</span>{uploadErr}
          </div>
        )}
      </div>

      <div className="tb-field">
        <label className="tb-label tb-label--req">Question prompt</label>
        <textarea className="tb-ta" rows={2} value={draft.prompt}
          onChange={(e) => setField("prompt", e.target.value)}
          placeholder="What does this image show? / Describe the diagram…" />
      </div>

      <div className="tb-field">
        <label className="tb-label tb-label--req">Answer type</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {ANSWER_TYPES.map((at) => (
            <button
              key={at}
              onClick={() => atSwitchAnswerType(at)}
              style={{
                padding: "5px 14px", borderRadius: 999, fontSize: 11, fontWeight: 800,
                border: `2px solid ${draft.answer_type === at ? T.violet : T.border}`,
                background: draft.answer_type === at ? T.violetL : "#fff",
                color: draft.answer_type === at ? T.violet : T.muted,
                cursor: "pointer", transition: "all .14s",
              }}
            >
              {at.replace(/_/g, " ")}
            </button>
          ))}
        </div>
      </div>

      {showOptions && (
        <div className="tb-field">
          <label className="tb-label tb-label--req">Options
            <span style={{ fontSize: 10, fontWeight: 600, color: T.muted, marginLeft: 8, textTransform: "none", letterSpacing: 0 }}>
              — click ✓ to mark correct
            </span>
          </label>
          {(draft.options || []).map((opt, oi) => {
            const isCorrect = (draft.correct_option_ids || []).includes(opt.id);
            return (
              <div key={opt.id} className={`tb-opt-row${isCorrect ? " tb-opt-row--correct" : ""}`}>
                <div className="tb-opt-row-key">{LABELS[oi] || oi + 1}</div>
                <input
                  className="tb-opt-input"
                  value={opt.text}
                  onChange={(e) => updateOpt(opt.id, e.target.value)}
                  disabled={draft.answer_type === "true_false"}
                  placeholder={`Option ${LABELS[oi] || oi + 1}…`}
                />
                <button
                  className={`tb-opt-correct-btn ${isCorrect ? "tb-opt-correct-btn--on" : "tb-opt-correct-btn--off"}`}
                  onClick={() => toggleCorrect(opt.id)}
                >✓</button>
                {draft.answer_type !== "true_false" && (draft.options || []).length > 2 && (
                  <button className="tb-opt-del-btn" onClick={() => delOption(opt.id)}>✕</button>
                )}
              </div>
            );
          })}
          {draft.answer_type !== "true_false" && (draft.options || []).length < 6 && (
            <button className="tb-add-opt" onClick={addOption} style={{ marginTop: 4 }}>
              <span>＋</span> Add option
            </button>
          )}
        </div>
      )}

      {draft.answer_type === "open_answer" && (
        <div className="tb-field">
          <label className="tb-label">Expected answer</label>
          <textarea className="tb-ta" rows={2}
            value={typeof draft.expected === "string" ? draft.expected : (draft.expected?.text || "")}
            onChange={(e) => setField("expected", { text: e.target.value })}
            placeholder="Model answer for manual review…" />
        </div>
      )}

      <div className="tb-form-grid" style={{ marginTop: 4 }}>
        <div className="tb-field">
          <label className="tb-label">Points</label>
          <input className="tb-input" type="number" min="0" step="0.5"
            value={draft.score} onChange={(e) => setField("score", Number(e.target.value))} placeholder="1" />
        </div>
        <div className="tb-field">
          <label className="tb-label">Autograde</label>
          <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 8 }}>
            <label className="tb-toggle">
              <input type="checkbox" checked={draft.autograde}
                onChange={(e) => setField("autograde", e.target.checked)} />
              <div className="tb-toggle-track" />
              <div className="tb-toggle-thumb" />
            </label>
            <span style={{ fontSize: 12, fontWeight: 700, color: draft.autograde ? T.lime : T.muted }}>
              {draft.autograde ? "Auto-graded" : "Manual"}
            </span>
          </div>
        </div>
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   PHASE 6: FUTURE QUESTION TYPE STUBS
   These components act as placeholders.  When a type is activated:
     1. Uncomment its entry in QUESTION_TYPES
     2. Replace its stub body with a real form
     3. Add buildInitialDraft / buildPayload / validate cases in QuestionEditor
   ═══════════════════════════════════════════════════════════════════════════ */
function FutureTypeStub({ typeName }) {
  return (
    <div className="tb-stub-banner">
      <div className="tb-stub-banner-icon">🔜</div>
      <div className="tb-stub-banner-title">{typeName} — Coming soon</div>
      <div className="tb-stub-banner-sub">
        This question type is not yet available. The architecture is ready;<br />
        implementation will be added in a future release.
      </div>
    </div>
  );
}
const TrueFalseQuestionForm    = ({ draft, onChange }) => <FutureTypeStub typeName="True / False" />;
const MatchingQuestionForm     = ({ draft, onChange }) => <FutureTypeStub typeName="Matching" />;
const SentenceOrderForm        = ({ draft, onChange }) => <FutureTypeStub typeName="Sentence Order" />;
const WordFromLettersForm      = ({ draft, onChange }) => <FutureTypeStub typeName="Word from Letters" />;
const CategorySortForm         = ({ draft, onChange }) => <FutureTypeStub typeName="Category Sort" />;

/* ═══════════════════════════════════════════════════════════════════════════
   QUESTION EDITOR
   Wrapper that routes to the correct form by type, handles level picker,
   and owns submit logic.

   PHASE 2: isEditing → PUT /admin/questions/{question_id}
   PHASE 6: formMap wired for all future types (stub forms)
   ═══════════════════════════════════════════════════════════════════════════ */
function QuestionEditor({ testId, onSaved, onCancel, existingQuestion }) {
  const isEditing = !!existingQuestion;

  /* ── Build initial draft from existing question or fresh empty ── */
  const buildInitialDraft = () => {
    if (!existingQuestion) return emptyMCQ();

    const base = {
      type:      existingQuestion.type      || existingQuestion.question_type || "multiple_choice",
      prompt:    existingQuestion.prompt    || existingQuestion.question_text  || existingQuestion.text || "",
      score:     existingQuestion.score     || existingQuestion.points || 1,
      autograde: existingQuestion.autograde ?? true,
      metadata:  existingQuestion.metadata  || {},
      level:     existingQuestion.level     || "B1",
    };

    switch (base.type) {
      case "multiple_choice":
        return {
          ...base,
          options: (existingQuestion.options || []).map((o) =>
            typeof o === "string" ? { id: uid(), text: o } : (o.id ? o : { ...o, id: uid() })),
          correct_option_ids: existingQuestion.correct_option_ids || [],
          shuffle_options:    existingQuestion.shuffle_options    || false,
        };
      case "open_answer":
        return {
          ...base,
          expected:               existingQuestion.expected               || {},
          manual_review_if_below: existingQuestion.manual_review_if_below ?? null,
        };
      case "cloze":
        return {
          ...base,
          gaps: (existingQuestion.gaps || []).map((g) => g.id ? g : { ...g, id: uid() }),
        };
      case "visual":
        return {
          ...base,
          media:              existingQuestion.media              || [],
          answer_type:        existingQuestion.answer_type        || "multiple_choice",
          options:            (existingQuestion.options || []).map((o) =>
            typeof o === "string" ? { id: uid(), text: o } : (o.id ? o : { ...o, id: uid() })),
          correct_option_ids: existingQuestion.correct_option_ids || [],
          shuffle_options:    existingQuestion.shuffle_options    || false,
          expected:           existingQuestion.expected           || {},
        };
      // PHASE 6 stubs — read existing fields verbatim
      case "true_false":
        return { ...base, correct_answer: existingQuestion.correct_answer ?? null };
      case "matching":
        return { ...base, pairs: existingQuestion.pairs || [] };
      case "sentence_order":
        return { ...base, sentences: existingQuestion.sentences || [] };
      case "word_from_letters":
        return { ...base, answer: existingQuestion.answer || "" };
      case "category_sort":
        return { ...base, categories: existingQuestion.categories || [] };
      default:
        return base;
    }
  };

  const [draft,  setDraft]  = useState(buildInitialDraft);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState(null);

  const qType = QUESTION_TYPES.find((t) => t.type === draft.type) || QUESTION_TYPES[0];

  const switchType = (type) => {
    const empties = {
      multiple_choice:   emptyMCQ,
      open_answer:       emptyOpenAnswer,
      cloze:             emptyCloze,
      visual:            emptyVisual,
      // Phase 6 future types
      true_false:        emptyTrueFalse,
      matching:          emptyMatching,
      sentence_order:    emptySentenceOrder,
      word_from_letters: emptyWordFromLetters,
      category_sort:     emptyCategorySort,
    };
    const base = (empties[type] || emptyMCQ)();
    setDraft({ ...base, level: draft.level, prompt: draft.prompt });
  };

  /* ── Validate ── */
  const validate = () => {
    if (!draft.prompt.trim()) return "Prompt is required.";
    if (draft.type === "multiple_choice") {
      if (draft.options.some((o) => !o.text.trim())) return "All options must have text.";
      if (draft.correct_option_ids.length === 0) return "Mark at least one correct option.";
    }
    if (draft.type === "visual") {
      if (!draft.media?.length) return "Upload an image for a visual question.";
      if (["multiple_choice", "single_choice", "true_false"].includes(draft.answer_type)) {
        if ((draft.correct_option_ids || []).length === 0) return "Mark at least one correct option.";
      }
    }
    if (draft.type === "cloze" && draft.gaps.length === 0) return "Add at least one gap.";
    return null;
  };

  /* ── Build payload (strip client-side id fields) ── */
  const buildPayload = () => {
    const base = {
      type:      draft.type,
      prompt:    draft.prompt.trim(),
      score:     draft.score,
      autograde: draft.autograde,
      metadata:  draft.metadata || {},
      level:     draft.level || "B1",
    };
    switch (draft.type) {
      case "multiple_choice":
        return {
          ...base,
          options:            draft.options.map((o) => ({ text: o.text })),
          correct_option_ids: draft.correct_option_ids,
          shuffle_options:    draft.shuffle_options,
        };
      case "open_answer":
        return {
          ...base,
          expected:               draft.expected,
          manual_review_if_below: draft.manual_review_if_below,
        };
      case "cloze":
        return {
          ...base,
          gaps: draft.gaps.map(({ id: _id, ...rest }) => rest),
        };
      case "visual":
        return {
          ...base,
          media:              draft.media,   // preserves { type, path, url }
          answer_type:        draft.answer_type,
          options:            (draft.options || []).map((o) => ({ text: o.text })),
          correct_option_ids: draft.correct_option_ids || [],
          shuffle_options:    draft.shuffle_options    || false,
          expected:           draft.expected           || {},
        };
      // PHASE 6: stubs — send fields as-is, no processing yet
      case "true_false":
        return { ...base, correct_answer: draft.correct_answer };
      case "matching":
        return { ...base, pairs: draft.pairs };
      case "sentence_order":
        return { ...base, sentences: draft.sentences };
      case "word_from_letters":
        return { ...base, answer: draft.answer };
      case "category_sort":
        return { ...base, categories: draft.categories };
      default:
        return base;
    }
  };

  /**
   * PHASE 2: Route to PUT /admin/questions/{id} when editing,
   * POST /tests/{testId}/questions when creating.
   *
   * ASSUMPTION: PUT /admin/questions/{id} is supported by the backend.
   * The endpoint must accept the same payload shape as POST and return the updated question.
   */
  const handleSubmit = async () => {
    const err = validate();
    if (err) { setError(err); return; }
    setSaving(true);
    setError(null);
    try {
      if (isEditing) {
        // Phase 2: update via PUT
        await apiFetch(`/admin/questions/${existingQuestion.id}`, {
          method: "PUT",
          body: JSON.stringify(buildPayload()),
        });
      } else {
        // Phase 1 create path - try regular endpoint first, fallback to admin
        try {
          await apiFetch(`/tests/${testId}/questions`, {
            method: "POST",
            body: JSON.stringify(buildPayload()),
          });
        } catch (err) {
          await apiFetch(`/admin/tests/${testId}/questions`, {
            method: "POST",
            body: JSON.stringify(buildPayload()),
          });
        }
      }
      onSaved(isEditing);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  /**
   * PHASE 6: formMap — all future types mapped to stubs.
   * Replace stub with real component to activate.
   */
  const formMap = {
    multiple_choice:   MCQQuestionForm,
    open_answer:       OpenAnswerQuestionForm,
    cloze:             ClozeQuestionForm,
    visual:            VisualQuestionForm,
    // Phase 6 stubs
    true_false:        TrueFalseQuestionForm,
    matching:          MatchingQuestionForm,
    sentence_order:    SentenceOrderForm,
    word_from_letters: WordFromLettersForm,
    category_sort:     CategorySortForm,
  };
  const Form = formMap[draft.type] || MCQQuestionForm;

  return (
    <div style={{ maxWidth: 780, animation: "fadeUp .28s both" }}>
      {/* [Phase 4] Edit-mode header banner */}
      {isEditing && (
        <div className="tb-edit-banner">
          <span style={{ fontSize: 16 }}>✏</span>
          <span>
            Editing <strong>{qType.label}</strong> question
            {existingQuestion.prompt ? ` — "${existingQuestion.prompt.slice(0, 42)}${existingQuestion.prompt.length > 42 ? "…" : ""}"` : ""}
          </span>
        </div>
      )}

      {/* Type chooser — only shown for new questions */}
      {!isEditing && (
        <div className="tb-form-card">
          <div className="tb-form-card-title">❓ Question Type</div>
          <div className="tb-type-grid">
            {QUESTION_TYPES.map((qt) => (
              <button
                key={qt.type}
                className={`tb-type-chip${draft.type === qt.type ? " tb-type-chip--active" : ""}`}
                style={draft.type === qt.type ? { background: `linear-gradient(135deg,${qt.color},${qt.color}CC)` } : {}}
                onClick={() => switchType(qt.type)}
              >
                <span className="tb-type-chip-icon">{qt.icon}</span>
                {qt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main form */}
      <div className="tb-form-card" style={{ marginTop: isEditing ? 0 : 14 }}>
        <div className="tb-form-card-title" style={{ gap: 10 }}>
          <span style={{
            width: 30, height: 30, borderRadius: 9, flexShrink: 0,
            background: `linear-gradient(135deg,${qType.color},${qType.color}BB)`,
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, color: "#fff",
          }}>{qType.icon}</span>
          {qType.label}
        </div>

        {error && (
          <div className="tb-error" style={{ marginBottom: 14 }}>
            <span>⚠</span>{error}
          </div>
        )}

        <Form draft={draft} onChange={setDraft} />

        {/* Level selector */}
        <div className="tb-field" style={{ marginTop: 16 }}>
          <label className="tb-label">Difficulty level</label>
          <div className="tb-level-row">
            {LEVELS.map((l) => (
              <button
                key={l}
                className={`tb-level-chip${draft.level === l ? " tb-level-chip--active" : ""}`}
                onClick={() => setDraft((p) => ({ ...p, level: l }))}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Submit bar */}
      <div style={{ display: "flex", gap: 10, marginTop: 16, alignItems: "center" }}>
        <button className="tb-btn-primary" onClick={handleSubmit} disabled={saving}>
          {saving ? (
            <><span className="tb-spin" style={{ borderColor: "rgba(255,255,255,.25)", borderTopColor: "#fff" }} /> Saving…</>
          ) : (
            <>{isEditing ? "💾 Update question" : "＋ Add question"}</>
          )}
        </button>
        <button className="tb-btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        {isEditing && (
          <span style={{ fontSize: 11, color: T.muted, marginLeft: 4 }}>
            Question ID: {existingQuestion.id}
          </span>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   TEST INSPECTOR  [Phase 4: scoring summary, readiness ring]
   ═══════════════════════════════════════════════════════════════════════════ */
function TestInspector({
  test, questions, metaDirty, loading,
  onSave, onPublish, onDelete, onRefresh, onAddQuestion,
}) {
  const [confirmDel, setConfirmDel] = useState(false);

  const hasTitle     = !!(test?.title?.trim());
  const hasQuestions = questions.length > 0;
  const isPublished  = test?.status === "published";
  const totalPoints  = questions.reduce((s, q) => s + (q.score || q.points || 0), 0);
  const canPublish   = hasTitle && hasQuestions && !isPublished;
  const sc           = test ? statusCfg(test.status) : null;

  /* [Phase 4] per-type score breakdown */
  const scoreByType = questions.reduce((acc, q) => {
    const t = q.type || q.question_type || "other";
    acc[t] = (acc[t] || 0) + (q.score || q.points || 0);
    return acc;
  }, {});

  /* [Phase 4] readiness criteria */
  const readinessCriteria = [
    { ok: !!test,       label: "Test created"           },
    { ok: hasTitle,     label: "Test has a title"       },
    { ok: hasQuestions, label: "At least 1 question"    },
    { ok: !isPublished, label: "Currently draft",       invert: true },
    { ok: !metaDirty,   label: "Metadata saved"         },
  ];
  const readinessPassed = readinessCriteria.filter((c) => c.invert ? !c.ok : c.ok).length;
  const readinessTotal  = readinessCriteria.length;
  const readinessPct    = Math.round((readinessPassed / readinessTotal) * 100);
  const ringColor = readinessPct === 100 ? T.lime : readinessPct >= 60 ? T.amber : T.red;

  return (
    <div className="tb-inspector">

      {/* Test meta summary */}
      <div className="tb-insp-sec">
        <div className="tb-insp-hd">📝 Test</div>
        {test ? (
          <>
            <div className="tb-insp-row">
              <span className="tb-insp-key">Status</span>
              <span style={{
                fontSize: 11, fontWeight: 800, padding: "2px 9px", borderRadius: 999,
                background: sc.bg, color: sc.col, border: `1.5px solid ${sc.border}`,
              }}>{sc.label}</span>
            </div>
            {test.time_limit_minutes && (
              <div className="tb-insp-row">
                <span className="tb-insp-key">Time limit</span>
                <span className="tb-insp-val">{test.time_limit_minutes} min</span>
              </div>
            )}
            {test.passing_score && (
              <div className="tb-insp-row">
                <span className="tb-insp-key">Pass score</span>
                <span className="tb-insp-val">{test.passing_score}%</span>
              </div>
            )}
            {/* [Phase 4] unsaved changes indicator */}
            {metaDirty && (
              <div style={{
                marginTop: 8, padding: "5px 9px", borderRadius: 8, fontSize: 10,
                fontWeight: 800, background: T.amberL, color: T.amber,
                border: "1.5px solid rgba(245,166,35,.35)",
                display: "flex", alignItems: "center", gap: 5,
              }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: T.amber, flexShrink: 0, display: "block" }} />
                Unsaved metadata changes
              </div>
            )}
          </>
        ) : (
          <div style={{ fontSize: 12, color: T.muted }}>No test yet</div>
        )}
      </div>

      {/* [Phase 4] Scoring summary */}
      <div className="tb-insp-sec">
        <div className="tb-insp-hd">🏆 Scoring</div>
        <div className="tb-insp-row" style={{ marginBottom: 4 }}>
          <span className="tb-insp-key">Total points</span>
          <span className="tb-insp-val" style={{ color: T.amber, fontFamily: T.dFont }}>
            {totalPoints}
          </span>
        </div>
        <div className="tb-score-bar-track">
          <div className="tb-score-bar-fill"
            style={{ width: questions.length > 0 ? "100%" : "0%" }} />
        </div>
        {Object.keys(scoreByType).length > 1 && (
          <div className="tb-score-breakdown">
            {Object.entries(scoreByType).map(([type, pts]) => {
              const tc = TYPE_COLOR[type] || T.teal;
              return (
                <div key={type} className="tb-score-type-row">
                  <span className="tb-score-type-dot" style={{ background: tc }} />
                  <span className="tb-score-type-lbl">{type.replace(/_/g, " ")}</span>
                  <span className="tb-score-type-val">{pts}pt</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Content stats */}
      <div className="tb-insp-sec">
        <div className="tb-insp-hd">📦 Content</div>
        {[
          { emoji: "❓", label: "Questions",    value: questions.length, bg: T.tealL,  col: T.teal,  ready: hasQuestions },
          { emoji: "🏆", label: "Total points", value: totalPoints,      bg: T.amberL, col: T.amber, ready: totalPoints > 0 },
        ].map(({ emoji, label, value, bg, ready }) => (
          <div key={label} className="ws-content-row">
            <div className="ws-content-icon" style={{ background: bg }}>{emoji}</div>
            <div className="ws-content-info">
              <div className="ws-content-lbl">{label}</div>
              <div className="ws-content-hint">{ready ? `${value}` : "None yet"}</div>
            </div>
            <span className={`ws-content-pill${ready ? " ws-content-pill--done" : " ws-content-pill--pending"}`}>
              {ready ? "✓" : "—"}
            </span>
          </div>
        ))}
      </div>

      {/* [Phase 4] Publish readiness with ring */}
      <div className="tb-insp-sec">
        <div className="tb-insp-hd">✅ Readiness</div>
        <div className="tb-readiness-ring-wrap">
          <div className="tb-readiness-ring"
            style={{ background: `conic-gradient(${ringColor} ${readinessPct}%,${T.bg} 0)` }}>
            <div style={{
              width: 34, height: 34, borderRadius: "50%", background: "#fff",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 12, fontWeight: 900, color: ringColor, fontFamily: T.dFont,
            }}>
              {readinessPct}%
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, color: T.text }}>{readinessPassed}/{readinessTotal} checks</div>
            <div style={{ fontSize: 10, color: T.muted, marginTop: 2 }}>
              {readinessPct === 100 ? "Ready to publish!" : "Complete all checks to publish"}
            </div>
          </div>
        </div>
        {readinessCriteria.map(({ ok, label, invert }) => {
          const pass = invert ? !ok : ok;
          return (
            <div key={label} className="tb-check-row">
              <div className={`tb-check-icon ${pass ? "tb-check-icon--ok" : "tb-check-icon--warn"}`}>
                {pass ? "✓" : "✕"}
              </div>
              <span style={{ color: pass ? T.sub : T.red, fontWeight: pass ? 600 : 700 }}>{label}</span>
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div className="tb-insp-sec" style={{ flex: 1 }}>
        <div className="tb-insp-hd">⚙ Actions</div>

        <button className="tb-act-btn tb-act-btn--add-q"
          onClick={onAddQuestion} disabled={!test}>
          <span className="tb-act-btn-icon">＋</span>
          Add question
        </button>

        <button className="tb-act-btn tb-act-btn--save"
          onClick={onSave} disabled={loading.metadataSave || !test}>
          <span className="tb-act-btn-icon">
            {loading.metadataSave ? <span className="tb-spin" /> : "💾"}
          </span>
          {loading.metadataSave ? "Saving…" : "Save metadata"}
        </button>

        <button className="tb-act-btn tb-act-btn--publish"
          onClick={onPublish}
          disabled={!canPublish || loading.publish}
          title={isPublished ? "Already published" : !hasTitle ? "Add a title first" : !hasQuestions ? "Add at least one question" : "Publish"}>
          <span className="tb-act-btn-icon">
            {loading.publish ? <span className="tb-spin" /> : "🚀"}
          </span>
          {loading.publish ? "Publishing…" : isPublished ? "Published ✓" : "Publish test"}
        </button>

        <button className="tb-act-btn" onClick={onRefresh}
          disabled={loading.test || loading.questionsLoad}>
          <span className="tb-act-btn-icon">
            {(loading.test || loading.questionsLoad) ? <span className="tb-spin tb-spin--dark" /> : "↺"}
          </span>
          Refresh data
        </button>

        {test && !confirmDel && (
          <button className="tb-act-btn tb-act-btn--danger" onClick={() => setConfirmDel(true)}>
            <span className="tb-act-btn-icon" style={{ background: T.redL, color: T.red }}>🗑</span>
            Delete test
          </button>
        )}
        {confirmDel && (
          <div className="tb-confirm-del">
            <div style={{ fontSize: 12, fontWeight: 700, color: T.red, marginBottom: 8 }}>
              Delete "{test?.title || "this test"}"?
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
   PHASE 2 — INLINE AI GENERATION FLOW (secondary entry point)
   ─────────────────────────────────────────────────────────────────────────
   Architecture:
     AIGenerateModal  ← portalled overlay, owns the full 3-screen flow
       screen "wizard"   → form with pre-filled context, editable before submit
       screen "progress" → spinner + step tracker, polls every 3 s
       screen "done"     → success state, CTA to open new draft in builder
       screen "failed"   → error state, retry button returns to wizard

   Backend contract (identical to primary flow in AdminUnitCreatePage.tsx):
     POST /api/v1/units/{unit_id}/generate-test  → { test_id, poll_url }
     GET  {poll_url}  → { generation_status, question_count, generation_error }
       generation_status: "pending" | "running" | "done" | "failed"

   The backend creates a NEW draft test.  It does NOT modify the current test.
   TODO (Phase N): If backend adds POST /tests/{id}/regenerate (in-place), wire
     the submit handler to that endpoint and skip the navigate-to-new-test CTA.

   Polling:
     - Interval ref is cleared on unmount, on close, on done, on failed.
     - The effect uses a stable intervalRef (not closure state) to avoid stale
       captures — same pattern as AdminUnitCreatePage.tsx.
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── Difficulty options — mirrors AdminUnitCreatePage.tsx AI_DIFFICULTIES ── */
const AI_DIFFICULTIES = [
  { value: "A1", label: "A1 — Beginner"      },
  { value: "A2", label: "A2 — Elementary"    },
  { value: "B1", label: "B1 — Intermediate"  },
  { value: "B2", label: "B2 — Upper-Inter."  },
  { value: "C1", label: "C1 — Advanced"      },
  { value: "C2", label: "C2 — Mastery"       },
  { value: "easy",   label: "Easy"           },
  { value: "medium", label: "Medium"         },
  { value: "hard",   label: "Hard"           },
];

const LANGUAGES = [
  { value: "english",  label: "🇬🇧 English"  },
  { value: "russian",  label: "🇷🇺 Russian"   },
  { value: "italian",  label: "🇮🇹 Italian"   },
  { value: "german",   label: "🇩🇪 German"    },
  { value: "french",   label: "🇫🇷 French"    },
  { value: "spanish",  label: "🇪🇸 Spanish"   },
  { value: "auto",     label: "🤖 Auto-detect"},
];

/* ── Progress step config ── */
const PROGRESS_STEPS = [
  { key: "pending", label: "Preparing draft test…"       },
  { key: "running", label: "Generating questions with AI…" },
  { key: "done",    label: "Draft test ready."            },
];

function stepState(stepKey, currentStatus) {
  const order = { pending: 0, running: 1, done: 2, failed: 2 };
  const cur  = order[currentStatus] ?? 0;
  const mine = order[stepKey]       ?? 0;
  if (currentStatus === "failed" && stepKey !== "done") return mine <= cur ? "done" : "waiting";
  if (mine <  cur)                        return "done";
  if (mine === cur && currentStatus !== "done") return "active";
  if (mine === cur && currentStatus === "done")  return "done";
  return "waiting";
}

/**
 * buildDefaultWizardForm — derives pre-fill values from current test context.
 *
 * Context/data mismatches (see phase notes at bottom of file):
 *   unit_id   — sourced from meta.unit_id → test.unit_id → unitId prop (priority order)
 *   difficulty — sourced from questions[0].level (normalised question field).
 *                The test metadata object has no top-level `difficulty` or `level` field
 *                in the builder schema; difficulty lives on individual questions.
 *                Falls back to "B1" if no questions exist yet.
 *   title      — sourced from meta.title → test.title. If truthy, passed as initial value;
 *                wizard label clarifies it's a "hint" the teacher can edit.
 */
function buildDefaultWizardForm({ title, difficulty }) {
  return {
    title:              title || "",
    mcq_count:          10,
    answers_per_question: 4,
    difficulty:         difficulty || "B1",
    time_limit_minutes: 30,
    passing_score:      70,
    content_language:   "auto",
    question_language:  "english",
  };
}

function AIGenerateModal({ open, onClose, onDone, unitId, unitTitle, testTitle, testDifficulty }) {
  /* ── Screen state: "wizard" | "progress" | "done" | "failed" ── */
  const [screen, setScreen]       = useState("wizard");
  const [form,   setForm]         = useState(() => buildDefaultWizardForm({ title: testTitle, difficulty: testDifficulty }));
  const [submitErr, setSubmitErr] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  /* Progress state */
  const [genStatus,    setGenStatus]    = useState("pending"); // pending|running|done|failed
  const [genTestId,    setGenTestId]    = useState(null);
  const [genQCount,    setGenQCount]    = useState(0);
  const [genErrMsg,    setGenErrMsg]    = useState(null);
  const pollRef = useRef(null);

  /* Re-sync form pre-fills when modal opens (in case test loaded after first open) */
  useEffect(() => {
    if (open) {
      setForm(buildDefaultWizardForm({ title: testTitle, difficulty: testDifficulty }));
      setScreen("wizard");
      setSubmitErr(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /* Stop polling on unmount */
  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  if (!open) return null;

  const setField = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  /* ── Polling ──────────────────────────────────────────────────────────── */
  const startPolling = (pollUrl) => {
    if (pollRef.current) clearInterval(pollRef.current);

    pollRef.current = setInterval(async () => {
      try {
        const token = getAuthToken();
        const path  = pollUrl.startsWith("/api/v1") ? pollUrl : `/api/v1${pollUrl}`;
        const res   = await fetch(path, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) return; // transient error — keep polling

        const data = await res.json();
        const status = data.generation_status;

        setGenStatus(status);
        setGenQCount(data.question_count ?? 0);

        if (status === "done") {
          clearInterval(pollRef.current);
          pollRef.current = null;
          setScreen("done");
        } else if (status === "failed") {
          clearInterval(pollRef.current);
          pollRef.current = null;
          setGenErrMsg(data.generation_error || "Generation failed. Please try again.");
          setScreen("failed");
        }
      } catch (e) {
        // Network blip — keep polling, don't surface error yet
        console.warn("[AIGenerateModal] poll error:", e);
      }
    }, 3000);
  };

  /* ── Submit ───────────────────────────────────────────────────────────── */
  const handleSubmit = async () => {
    if (!unitId) {
      setSubmitErr("No unit is associated with this test. Cannot generate.");
      return;
    }
    setSubmitting(true);
    setSubmitErr(null);
    setGenStatus("pending");
    setGenTestId(null);
    setGenQCount(0);
    setGenErrMsg(null);

    try {
      const token = getAuthToken();
      const res   = await fetch(`${API}/units/${unitId}/generate-test`, {
        method:  "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          mcq_count:            Number(form.mcq_count),
          answers_per_question: Number(form.answers_per_question),
          difficulty:           form.difficulty,
          title:                form.title.trim() || undefined,
          time_limit_minutes:   Number(form.time_limit_minutes),
          passing_score:        Number(form.passing_score),
          content_language:     form.content_language,
          question_language:    form.question_language,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Server error ${res.status}`);
      }

      const data = await res.json();
      setGenTestId(data.test_id);
      setScreen("progress");
      startPolling(data.poll_url);
    } catch (e) {
      setSubmitErr(e.message || "Failed to start generation. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Handle close — also clears interval ─────────────────────────────── */
  const handleClose = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    onClose();
  };

  /* ── Navigate to new draft test ───────────────────────────────────────── */
  const handleOpenDraft = () => {
    handleClose();
    if (onDone && genTestId) onDone(genTestId);
  };

  /* ── Retry: return to wizard with previous form values preserved ─────── */
  const handleRetry = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    setScreen("wizard");
    setSubmitErr(null);
  };

  /* ── Header config per screen ─────────────────────────────────────────── */
  const headerCfg = {
    wizard:   { icon: "✨", title: "Generate with AI",     sub: "Create a new AI-drafted test from your unit's content" },
    progress: { icon: "⏳", title: "Generating…",           sub: "Sit back — AI is building your test draft"           },
    done:     { icon: "✅", title: "Draft test ready!",     sub: "Your AI-generated test is waiting to be reviewed"    },
    failed:   { icon: "⚠",  title: "Generation failed",     sub: "Something went wrong. You can retry below."         },
  };
  const hdr = headerCfg[screen] || headerCfg.wizard;

  /* ─────────────────────────────────────────────────────────────────────── */
  return createPortal(
    <div
      className="tb-ai-modal-overlay"
      onClick={(e) => e.target === e.currentTarget && screen !== "progress" && handleClose()}
    >
      <div
        className={`tb-ai-modal${screen === "wizard" ? " tb-ai-modal--wizard" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Generate with AI"
      >
        {/* ── Header ── */}
        <div className="tb-ai-modal-header">
          <div className="tb-ai-modal-header-icon">{hdr.icon}</div>
          <div className="tb-ai-modal-header-text">
            <div className="tb-ai-modal-title">{hdr.title}</div>
            <div className="tb-ai-modal-sub">{hdr.sub}</div>
          </div>
          {/* Prevent accidental close during active generation */}
          {screen !== "progress" && (
            <button className="tb-ai-modal-close" onClick={handleClose} aria-label="Close">✕</button>
          )}
        </div>

        {/* ════════════════════════════════════════════════
            SCREEN 1: WIZARD FORM
            ════════════════════════════════════════════════ */}
        {screen === "wizard" && (
          <div className="tb-ai-modal-body">

            {/* Notice: new test, not merged */}
            <div className="tb-ai-modal-notice">
              <div className="tb-ai-modal-notice-icon">⚠</div>
              <div className="tb-ai-modal-notice-text">
                <strong>This creates a new draft test.</strong> Your current test is not affected.
                Review the draft after generation, then decide what to keep.
              </div>
            </div>

            {/* Unit context (read-only — unit_id must come from the test) */}
            {unitId && (
              <div className="tb-ai-modal-context-card" style={{ marginBottom: 18 }}>
                <div className="tb-ai-modal-context-title">📂 Unit context (read-only)</div>
                <div className="tb-ai-modal-context-row">
                  <span className="tb-ai-modal-context-label">Unit</span>
                  <span className="tb-ai-modal-context-val">
                    {unitTitle ? `${unitTitle}` : `Unit ${unitId}`}
                  </span>
                </div>
              </div>
            )}

            {!unitId && (
              <div className="tb-ai-error-box" style={{ marginBottom: 18 }}>
                <span style={{ fontSize: 16 }}>⚠</span>
                <div className="tb-ai-error-box-text">
                  <strong>No unit linked.</strong> Save the test with a unit first, then try again.
                </div>
              </div>
            )}

            {/* Wizard form grid */}
            <div className="tb-ai-wiz-grid">

              {/* Title (pre-filled, editable) */}
              <div className="tb-ai-wiz-field tb-ai-wiz-grid--full">
                <label className="tb-ai-wiz-label">Title hint</label>
                <input
                  className="tb-ai-wiz-input"
                  value={form.title}
                  onChange={(e) => setField("title", e.target.value)}
                  placeholder="Leave blank — AI will choose a title"
                />
                <div className="tb-ai-wiz-hint">
                  Optional. If left blank, AI picks a title based on the unit content.
                </div>
              </div>

              {/* MCQ count */}
              <div className="tb-ai-wiz-field">
                <label className="tb-ai-wiz-label tb-ai-wiz-label--req">Questions</label>
                <input
                  className="tb-ai-wiz-input"
                  type="number" min="1" max="50" step="1"
                  value={form.mcq_count}
                  onChange={(e) => setField("mcq_count", Math.max(1, parseInt(e.target.value) || 1))}
                />
                <div className="tb-ai-wiz-hint">Number of MCQ questions (1 – 50)</div>
              </div>

              {/* Answers per question */}
              <div className="tb-ai-wiz-field">
                <label className="tb-ai-wiz-label tb-ai-wiz-label--req">Options per Q</label>
                <input
                  className="tb-ai-wiz-input"
                  type="number" min="2" max="6" step="1"
                  value={form.answers_per_question}
                  onChange={(e) => setField("answers_per_question", Math.max(2, parseInt(e.target.value) || 4))}
                />
                <div className="tb-ai-wiz-hint">Answer choices per question (2 – 6)</div>
              </div>

              {/* Difficulty (pre-filled from question level) */}
              <div className="tb-ai-wiz-field tb-ai-wiz-grid--full">
                <label className="tb-ai-wiz-label tb-ai-wiz-label--req">Difficulty / Level</label>
                <div className="tb-ai-wiz-chips">
                  {AI_DIFFICULTIES.map((d) => (
                    <button
                      key={d.value}
                      className={`tb-ai-wiz-chip${form.difficulty === d.value ? " tb-ai-wiz-chip--active" : ""}`}
                      onClick={() => setField("difficulty", d.value)}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Time limit */}
              <div className="tb-ai-wiz-field">
                <label className="tb-ai-wiz-label">Time limit (min)</label>
                <input
                  className="tb-ai-wiz-input"
                  type="number" min="5" max="180" step="5"
                  value={form.time_limit_minutes}
                  onChange={(e) => setField("time_limit_minutes", Math.max(5, parseInt(e.target.value) || 30))}
                />
              </div>

              {/* Passing score */}
              <div className="tb-ai-wiz-field">
                <label className="tb-ai-wiz-label">Passing score (%)</label>
                <input
                  className="tb-ai-wiz-input"
                  type="number" min="0" max="100" step="5"
                  value={form.passing_score}
                  onChange={(e) => setField("passing_score", Math.min(100, Math.max(0, parseInt(e.target.value) || 70)))}
                />
              </div>

              {/* Question language */}
              <div className="tb-ai-wiz-field">
                <label className="tb-ai-wiz-label">Question language</label>
                <select
                  className="tb-ai-wiz-select"
                  value={form.question_language}
                  onChange={(e) => setField("question_language", e.target.value)}
                >
                  {LANGUAGES.filter((l) => l.value !== "auto").map((l) => (
                    <option key={l.value} value={l.value}>{l.label}</option>
                  ))}
                </select>
              </div>

              {/* Content language */}
              <div className="tb-ai-wiz-field">
                <label className="tb-ai-wiz-label">Content language</label>
                <select
                  className="tb-ai-wiz-select"
                  value={form.content_language}
                  onChange={(e) => setField("content_language", e.target.value)}
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.value} value={l.value}>{l.label}</option>
                  ))}
                </select>
                <div className="tb-ai-wiz-hint">Language of the source unit material</div>
              </div>

            </div>

            {/* Submit error */}
            {submitErr && (
              <div className="tb-ai-error-box" style={{ marginBottom: 14 }}>
                <span style={{ fontSize: 16, flexShrink: 0 }}>⚠</span>
                <div className="tb-ai-error-box-text">{submitErr}</div>
              </div>
            )}

            {/* Actions */}
            <div className="tb-ai-modal-actions">
              <button className="tb-ai-modal-btn-ghost" onClick={handleClose} disabled={submitting}>
                Cancel
              </button>
              <button
                className="tb-ai-modal-btn-primary"
                onClick={handleSubmit}
                disabled={submitting || !unitId}
              >
                {submitting
                  ? <><span className="tb-spin" style={{ borderColor: "rgba(255,255,255,.25)", borderTopColor: "#fff" }} /> Starting…</>
                  : <><span style={{ fontSize: 16 }}>✨</span> Generate test</>
                }
              </button>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════
            SCREEN 2: PROGRESS
            ════════════════════════════════════════════════ */}
        {screen === "progress" && (
          <div className="tb-ai-progress-body">
            <div className="tb-ai-progress-ring-wrap">
              <div className="tb-ai-progress-spinner" />
              <div className="tb-ai-progress-icon">⚙</div>
            </div>

            <div className="tb-ai-progress-status">
              {genStatus === "pending" ? "Preparing draft test…" : "Generating questions with AI…"}
            </div>
            <div className="tb-ai-progress-sub">
              This usually takes 20 – 60 seconds. Don't close this window.
            </div>

            <div className="tb-ai-progress-steps">
              {PROGRESS_STEPS.map((step) => {
                const s = stepState(step.key, genStatus);
                return (
                  <div key={step.key} className={`tb-ai-progress-step tb-ai-progress-step--${s}`}>
                    <span className="tb-ai-progress-step-icon">
                      {s === "done" ? "✓" : s === "active" ? <span className="tb-spin tb-spin--dark" style={{ width: 12, height: 12, borderWidth: 2 }} /> : "○"}
                    </span>
                    {step.label}
                  </div>
                );
              })}
            </div>

            <div style={{ fontSize: 11, color: T.mutedL }}>
              Polling for status every 3 s…
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════
            SCREEN 3a: DONE
            ════════════════════════════════════════════════ */}
        {screen === "done" && (
          <div className="tb-ai-progress-body">
            <div className="tb-ai-progress-ring-wrap">
              <div className="tb-ai-progress-spinner tb-ai-progress-spinner--done" />
              <div className="tb-ai-progress-icon">✅</div>
            </div>

            <div className="tb-ai-progress-status">Draft test ready!</div>
            <div className="tb-ai-progress-sub">
              AI generated <strong>{genQCount} question{genQCount !== 1 ? "s" : ""}</strong>.
              Your current test is untouched — open the draft to review and publish it.
            </div>

            <div className="tb-ai-progress-pill tb-ai-progress-pill--done">
              ✓ {genQCount} question{genQCount !== 1 ? "s" : ""} generated
            </div>

            {/* TODO (Phase N): If backend adds in-place merge endpoint
                (POST /tests/{current_id}/merge-from/{new_id}), add a
                "Merge into current test" button here. */}

            <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 10 }}>
              <button className="tb-ai-modal-btn-cta" onClick={handleOpenDraft}>
                <span>📝</span> Open new draft in Test Builder
              </button>
              <div style={{ fontSize: 11, color: T.muted, textAlign: "center", lineHeight: 1.5 }}>
                Your current test is untouched.
                The new draft will open in a fresh builder session.
              </div>
              <button
                className="tb-ai-modal-btn-ghost"
                style={{ width: "100%", textAlign: "center" }}
                onClick={handleClose}
              >
                Stay here, review later
              </button>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════
            SCREEN 3b: FAILED
            ════════════════════════════════════════════════ */}
        {screen === "failed" && (
          <div className="tb-ai-progress-body">
            <div className="tb-ai-progress-ring-wrap">
              <div className="tb-ai-progress-spinner tb-ai-progress-spinner--failed" />
              <div className="tb-ai-progress-icon">⚠</div>
            </div>

            <div className="tb-ai-progress-status">Generation failed</div>

            {genErrMsg && (
              <div className="tb-ai-error-box">
                <span style={{ fontSize: 16, flexShrink: 0 }}>⚠</span>
                <div className="tb-ai-error-box-text">{genErrMsg}</div>
              </div>
            )}

            <div className="tb-ai-progress-sub">
              The AI generation did not complete. Your current test is untouched.
              You can retry — previous form values are preserved.
            </div>

            <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 10 }}>
              <button className="tb-ai-modal-btn-cta" onClick={handleRetry}>
                ↺ Retry generation
              </button>
              <button
                className="tb-ai-modal-btn-ghost"
                style={{ width: "100%", textAlign: "center" }}
                onClick={handleClose}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

      </div>
    </div>,
    document.body
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN TEST BUILDER
   [Phase 2] handleQuestionUpdated flow
   [Phase 4] unsaved-changes beforeunload warning
   [Phase 5] handleDeleteQuestion
   [Phase 1-AI] Generate with AI secondary entry point (topbar button)
   [Phase 2-AI] Inline wizard+progress+done/failed flow inside AIGenerateModal
   [Phase 3-AI] fromAI prop → AI Draft topbar badge + dismissable banner +
                auto-select Q1 + ?ai=1 URL preservation in loadTest redirect
   [Refactor] Full-page component (no modal wrapper)
   ═══════════════════════════════════════════════════════════════════════════ */
export function TestBuilder({ testId, unitId, unitTitle, onClose, fromAI = false }) {
  const navigate = useNavigate();
  const [test,        setTest]        = useState(null);
  const [questions,   setQuestions]   = useState([]);
  const [selectedQId, setSelectedQId] = useState(null);
  const [addingNew,   setAddingNew]   = useState(false);
  const [meta,        setMeta]        = useState(emptyMeta(unitId));
  const [metaDirty,   setMetaDirty]   = useState(false);
  const [isNew,       setIsNew]       = useState(!testId);
  const [toast,       setToast]       = useState(null);
  const [errors,      setErrors]      = useState({});
  const [loading,     setLoading]     = useState({
    test: false, metadataSave: false, questionsLoad: false, publish: false, delete: false,
  });

  // [Phase 3-AI] Banner is visible on entry only when navigated here with ?ai=1.
  // Stays visible until teacher dismisses it; never reappears for this session.
  const [aiDraftBannerVisible, setAiDraftBannerVisible] = useState(fromAI);
  // [Phase 3-AI] Guard: auto-select first question exactly once on AI entry.
  const aiAutoSelectDoneRef = useRef(false);

  const setLoad   = (k, v) => setLoading((p) => ({ ...p, [k]: v }));
  const showToast = (msg)   => { setToast(msg); setTimeout(() => setToast(null), 2400); };
  const clearErr  = (k)     => setErrors((p) => { const n = { ...p }; delete n[k]; return n; });

  /* ── Phase 2-AI / Phase 3-AI: secondary "Generate with AI" entry point ── */
  const [aiModalOpen, setAiModalOpen] = useState(false);

  /**
   * [Phase 3-AI] Called when generation completes and teacher clicks
   * "Open in Test Builder" in the done screen.
   *
   * Navigation strategy:
   *   - Navigate to /admin/tests/{newTestId}/builder?ai=1
   *   - ?ai=1 tells TestBuilderPage to pass fromAI=true to TestBuilder
   *   - TestBuilder loads the new test via existing loadTest/loadQuestions
   *   - Auto-select Q1, show AI Draft badge + dismissable banner
   *
   * Unsaved edits guard:
   *   - If the current test has unsaved metadata (metaDirty), we do NOT wipe
   *     local state silently. Route-based navigation to the new testId causes
   *     React Router to unmount/remount TestBuilderPage, giving it a clean
   *     slate — the current test's dirty state is safely discarded only after
   *     the teacher explicitly confirmed by clicking "Open in Test Builder."
   *     The beforeunload handler is cleared on unmount automatically.
   *
   * The current test is NOT modified. All merging is manual / future work.
   * TODO (Phase N): If backend adds POST /tests/{id}/merge-from/{srcId},
   *   add a "Merge into current test" CTA in the AIGenerateModal done screen.
   */
  const handleAIDone = (newTestId) => {
    navigate(`/admin/tests/${newTestId}/builder?ai=1`);
  };

  /* [Phase 4] Unsaved changes — warn before closing window */
  useEffect(() => {
    const handler = (e) => {
      if (!metaDirty) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [metaDirty]);

  /* ── Load test ── */
  const loadTest = useCallback(async (id) => {
    setLoad("test", true);
    try {
      // Try regular endpoint first (matches testsApi.getTest pattern)
      let data;
      try {
        data = await apiFetch(`/tests/${id}`);
      } catch (err) {
        // Fallback to admin endpoint if regular fails
        data = await apiFetch(`/admin/tests/${id}`);
      }
      setTest(data);
      setMeta({
        title:              data.title              || "",
        description:        data.description        || "",
        instructions:       data.instructions       || "",
        time_limit_minutes: data.time_limit_minutes ?? "",
        passing_score:      data.passing_score      ?? "",
        status:             data.status             || "draft",
        publish_at:         data.publish_at         || "",
        order_index:        data.order_index        ?? 0,
        settings:           data.settings           || {},
        unit_id:            data.unit_id            || unitId,
      });
      // Update URL if testId changed (for create flow).
      // [Phase 3-AI] Preserve ?ai=1 so AI-draft treatment survives a redirect
      // (e.g. when the generate-test endpoint returns a different id than expected).
      if (testId !== data.id && navigate) {
        const aiParam = fromAI ? "?ai=1" : "";
        navigate(`/admin/tests/${data.id}/builder${aiParam}`, { replace: true });
      }
      setMetaDirty(false);
      setIsNew(false);
    } catch (e) {
      setErrors((p) => ({ ...p, load: e.message }));
    } finally {
      setLoad("test", false);
    }
  }, [unitId]);

  /* ── Load questions ── */
  const loadQuestions = useCallback(async (testId) => {
    setLoad("questionsLoad", true);
    try {
      // Try regular endpoint first, fallback to admin
      let data;
      try {
        data = await apiFetch(`/tests/${testId}/questions`);
      } catch (err) {
        data = await apiFetch(`/admin/tests/${testId}/questions`);
      }
      setQuestions(normaliseQuestions(data));
    } catch (e) {
      setErrors((p) => ({ ...p, questions: e.message }));
    } finally {
      setLoad("questionsLoad", false);
    }
  }, []);

  useEffect(() => {
    if (testId) {
      loadTest(testId).then(() => loadQuestions(testId));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testId]);

  /* [Phase 3-AI] Auto-select first question when entering from AI wizard.
     Fires once after loadQuestions resolves. The ref guard prevents re-firing
     if the teacher navigates back to the metadata panel and questions reload.
     If loadQuestions returns zero questions (edge case), the effect is a no-op
     and the teacher lands on the metadata panel normally — no broken state. */
  useEffect(() => {
    if (
      fromAI &&
      !aiAutoSelectDoneRef.current &&
      !loading.questionsLoad &&
      questions.length > 0 &&
      !selectedQId &&
      !addingNew
    ) {
      aiAutoSelectDoneRef.current = true;
      setSelectedQId(questions[0].id);
    }
  }, [fromAI, loading.questionsLoad, questions, selectedQId, addingNew]);

  /* ── Metadata change ── */
  const handleMetaChange = (updated) => {
    setMeta(updated);
    setMetaDirty(true);
    clearErr("save");
  };

  /* ── Create / Save metadata ── */
  const handleSave = async () => {
    if (!meta.title.trim()) {
      setErrors((p) => ({ ...p, save: "Title is required." }));
      return;
    }
    setLoad("metadataSave", true);
    clearErr("save");
    try {
      const payload = {
        title:              meta.title.trim(),
        description:        meta.description        || null,
        instructions:       meta.instructions       || null,
        time_limit_minutes: meta.time_limit_minutes ? Number(meta.time_limit_minutes) : null,
        passing_score:      meta.passing_score      ? Number(meta.passing_score)      : null,
        order_index:        Number(meta.order_index) || 0,
        publish_at:         meta.publish_at         || null,
        settings:           meta.settings           || {},
        unit_id:            meta.unit_id            || unitId || null,
      };

      let saved;
      if (!test) {
        if (!payload.unit_id) {
          setErrors((p) => ({ ...p, save: "unit_id is required to create a test." }));
          return;
        }
        saved = await apiFetch("/tests/", { method: "POST", body: JSON.stringify(payload) });
        setTest(saved);
        setIsNew(false);
        await loadQuestions(saved.id);
        showToast("✅ Test created");
        // Navigate to builder route for the new test
        if (navigate) {
          navigate(`/admin/tests/${saved.id}/builder`, { replace: true });
        }
      } else {
        // Try regular endpoint first, fallback to admin
        try {
          saved = await apiFetch(`/tests/${test.id}`, { method: "PUT", body: JSON.stringify(payload) });
        } catch (err) {
          saved = await apiFetch(`/admin/tests/${test.id}`, { method: "PUT", body: JSON.stringify(payload) });
        }
        setTest(saved);
        showToast("💾 Metadata saved");
      }
      setMetaDirty(false);
    } catch (e) {
      setErrors((p) => ({ ...p, save: e.message }));
    } finally {
      setLoad("metadataSave", false);
    }
  };

  /* ── Publish ── */
  const handlePublish = async () => {
    if (!test) return;
    if (questions.length === 0) {
      setErrors((p) => ({ ...p, publish: "Add at least one question before publishing." }));
      return;
    }
    setLoad("publish", true);
    clearErr("publish");
    try {
      // Try regular endpoint first, fallback to admin
      let updated;
      try {
        updated = await apiFetch(`/tests/${test.id}/publish`, { method: "PATCH" });
      } catch (err) {
        updated = await apiFetch(`/admin/tests/${test.id}/publish`, { method: "PATCH" });
      }
      setTest(updated);
      setMeta((p) => ({ ...p, status: "published" }));
      showToast("🚀 Test published!");
      
      // Check if we're in AI generation flow and redirect to unit page
      if (fromAI) {
        const testUnitId = updated.unit_id || test.unit_id || unitId;
        if (testUnitId) {
          // Small delay to show the success toast before redirecting
          setTimeout(() => {
            navigate(`/admin/units/${testUnitId}`);
          }, 500);
        }
      }
    } catch (e) {
      setErrors((p) => ({ ...p, publish: e.message }));
    } finally {
      setLoad("publish", false);
    }
  };

  /* ── Delete test ── */
  const handleDelete = async () => {
    if (!test) return;
    setLoad("delete", true);
    try {
      // Try regular endpoint first, fallback to admin
      try {
        await apiFetch(`/tests/${test.id}`, { method: "DELETE" });
      } catch (err) {
        await apiFetch(`/admin/tests/${test.id}`, { method: "DELETE" });
      }
      showToast("🗑 Test deleted");
      setTimeout(onClose, 800);
    } catch (e) {
      setErrors((p) => ({ ...p, delete: e.message }));
      setLoad("delete", false);
    }
  };

  /* ── Refresh ── */
  const handleRefresh = () => {
    if (!test) return;
    loadTest(test.id);
    loadQuestions(test.id);
  };

  /* ── Add question flow ── */
  const handleAddQuestion = () => {
    setSelectedQId(null);
    setAddingNew(true);
  };

  /**
   * PHASE 2: Called after both create (isUpdate=false) and update (isUpdate=true).
   * Always reloads question list so IDs/order from backend are correct.
   */
  const handleQuestionSaved = async (isUpdate = false) => {
    if (!test) return;
    
    // Preserve the selected question ID if we're updating (so user can see the updated question)
    const preservedQId = isUpdate ? selectedQId : null;
    
    // Reload questions to get fresh data from backend
    await loadQuestions(test.id);
    
    // Restore selection after reload (for updates) or clear it (for new questions)
    if (isUpdate && preservedQId) {
      // Keep the question selected so user can see the updated content
      setSelectedQId(preservedQId);
    } else {
      // Clear selection for new questions
      setSelectedQId(null);
    }
    
    setAddingNew(false);
    showToast(isUpdate ? "💾 Question updated" : "✅ Question added");
  };

  /**
   * PHASE 5: Delete question via DELETE /tests/{test_id}/questions/{question_id}.
   * Backend endpoint: /tests/{test_id}/questions/{question_id}
   */
  const handleDeleteQuestion = async (qId) => {
    if (!window.confirm("Delete this question?")) return;
    if (!test) {
      showToast("⚠ Cannot delete: test not loaded");
      return;
    }
    try {
      // Use the correct backend endpoint: /tests/{test_id}/questions/{question_id}
      await apiFetch(`/tests/${test.id}/questions/${qId}`, { method: "DELETE" });
      if (selectedQId === qId) setSelectedQId(null);
      await loadQuestions(test.id);
      showToast("🗑 Question deleted");
    } catch (e) {
      showToast(`⚠ Delete failed: ${e.message}`);
    }
  };

  /* ── Derived ── */
  const selectedQuestion = selectedQId ? questions.find((q) => q.id === selectedQId) : null;
  const selectedQIndex   = selectedQId ? questions.findIndex((q) => q.id === selectedQId) : -1;
  const displayError     = errors.save || errors.publish || errors.delete || errors.load || null;

  /* ── Breadcrumb ── */
  const crumbs = [
    { label: unitTitle || "Unit", action: () => { setSelectedQId(null); setAddingNew(false); } },
    { label: test?.title || "New Test", action: addingNew || selectedQuestion ? () => { setSelectedQId(null); setAddingNew(false); } : null },
    addingNew        && { label: "New question",   active: true },
    selectedQuestion && {
      label: `Q${selectedQIndex + 1}: ${(selectedQuestion.prompt || "").slice(0, 28)}${(selectedQuestion.prompt || "").length > 28 ? "…" : ""}`,
      active: true,
    },
  ].filter(Boolean);

  /* [Phase 3-AI] AiDraftBanner — inline component (closure over fromAI state).
     Rendered only at the top of the metadata view, never inside the question
     editor — that would clutter the editing experience.
     Dismissable with ✕; once dismissed it does not reappear for this session. */
  const AiDraftBanner = () => {
    if (!fromAI || !aiDraftBannerVisible) return null;
    return (
      <div className="tb-ai-draft-banner">
        <div className="tb-ai-draft-banner-icon">✨</div>
        <div className="tb-ai-draft-banner-body">
          <div className="tb-ai-draft-banner-title">AI-Generated Draft</div>
          <div className="tb-ai-draft-banner-sub">
            Review each question in the sidebar, edit as needed, then publish when ready.
            This test is in <strong>Draft</strong> status — nothing is visible to students yet.
          </div>
        </div>
        <button
          className="tb-ai-draft-banner-dismiss"
          onClick={() => setAiDraftBannerVisible(false)}
          aria-label="Dismiss AI draft notice"
        >✕</button>
      </div>
    );
  };

  /* ── Main panel content ── */
  const renderMain = () => {
    if (loading.test) {
      return (
        <div style={{ padding: 32, display: "flex", flexDirection: "column", gap: 14 }}>
          {[1, 2, 3].map((i) => <div key={i} className="shimmer" style={{ height: 100, borderRadius: 18 }} />)}
        </div>
      );
    }

    if (addingNew && test) {
      return (
        <QuestionEditor
          testId={test.id}
          onSaved={handleQuestionSaved}
          onCancel={() => setAddingNew(false)}
        />
      );
    }

    /* PHASE 2: clicking a question loads it for editing */
    if (selectedQuestion && !addingNew) {
      return (
        <QuestionEditor
          testId={test.id}
          existingQuestion={selectedQuestion}
          onSaved={handleQuestionSaved}
          onCancel={() => setSelectedQId(null)}
        />
      );
    }

    if (!test) {
      return (
        <div>
          <div className="tb-no-test">
            <div className="tb-no-test-icon">📝</div>
            <div className="tb-no-test-title">No test yet</div>
            <div className="tb-no-test-sub">
              Give your test a title and click <strong>Save metadata</strong> in the right panel to create it.
            </div>
          </div>
          <div style={{ maxWidth: 780, margin: "0 auto" }}>
            <TestMetadataPanel
              meta={meta}
              onChange={handleMetaChange}
              onSave={handleSave}
              saving={loading.metadataSave}
              error={displayError}
              isNew
            />
          </div>
        </div>
      );
    }

    /* [Phase 3-AI] Metadata view: AI banner sits above the form cards.
       Not shown in the question editor views above — intentional. */
    return (
      <>
        <AiDraftBanner />
        <TestMetadataPanel
          meta={meta}
          onChange={handleMetaChange}
          onSave={handleSave}
          saving={loading.metadataSave}
          error={displayError}
          isNew={isNew}
        />
      </>
    );
  };

  /* ── Render ── */
  return (
    <div className="tb-root">
      <TestBuilderStyles />
      <div className="tb-shell">

      {/* Topbar */}
      <div className="tb-topbar">
        <div className="tb-topbar-icon">📝</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
          <span className="tb-topbar-title">{test?.title || "New Test"}</span>
        </div>
        <span className="tb-phase-badge">Test Builder</span>
        {/* [Phase 3-AI] AI-generated draft indicator — only shown on AI-entry path */}
        {fromAI && (
          <span style={{
            padding: "3px 10px", borderRadius: 999, fontSize: 10, fontWeight: 800,
            letterSpacing: ".08em", textTransform: "uppercase",
            background: "rgba(108,53,222,.22)",
            border: "1.5px solid rgba(108,53,222,.45)",
            color: "#C4B5FD",
            flexShrink: 0,
          }}>✨ AI Draft</span>
        )}
        <div className="tb-topbar-divider" />
        {unitTitle && <span className="tb-topbar-sub">📂 {unitTitle}</span>}
        {/* [Phase 4] unsaved dot */}
        {metaDirty && <span className="tb-unsaved-dot" title="Unsaved metadata changes" />}
        <div className="tb-spacer" />

        {/* Phase 1-AI: Generate with AI — secondary entry point */}
        <button
          className="tb-topbar-btn tb-topbar-btn--ai"
          onClick={() => setAiModalOpen(true)}
          title="Generate a new AI-drafted test using this unit's context"
        >
          ✨ Generate with AI
        </button>

        {/* TODO (Import from Unit): No backend endpoint for importing questions
            from another unit/test has been confirmed in the current codebase.
            Enable this button only when a confirmed import endpoint exists. */}

        <div className="tb-topbar-divider" style={{ marginLeft: 4 }} />
        <button className="tb-topbar-btn tb-topbar-btn--close" onClick={onClose}>✕ Close</button>
      </div>

      {/* Body */}
      <div className="tb-body">
        <QuestionSidebar
          test={test}
          questions={questions}
          selectedQId={selectedQId}
          addingNew={addingNew}
          onSelectQuestion={(id) => {
            setAddingNew(false);
            setSelectedQId((prev) => (prev === id ? null : id));
          }}
          onAddQuestion={handleAddQuestion}
          onDeleteQuestion={handleDeleteQuestion}
          loading={loading.questionsLoad}
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
                    onClick={crumb.action}
                    style={{ cursor: crumb.action ? "pointer" : "default" }}
                  >
                    {crumb.label}
                  </span>
                )}
              </span>
            ))}
          </div>

          <div className="tb-main-scroll">
            {renderMain()}
          </div>
        </div>

        <TestInspector
          test={test}
          questions={questions}
          metaDirty={metaDirty}
          loading={loading}
          onSave={handleSave}
          onPublish={handlePublish}
          onDelete={handleDelete}
          onRefresh={handleRefresh}
          onAddQuestion={handleAddQuestion}
        />
      </div>

      {toast && <div className="tb-toast">{toast}</div>}

      {/* Phase 2-AI: inline AI generation flow (wizard → progress → done/failed) */}
      <AIGenerateModal
        open={aiModalOpen}
        onClose={() => setAiModalOpen(false)}
        onDone={handleAIDone}
        unitId={meta.unit_id || unitId || test?.unit_id || null}
        unitTitle={unitTitle || test?.unit_title || null}
        testTitle={meta.title || test?.title || ""}
        testDifficulty={questions[0]?.level || null}
      />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   TEST BUILDER PAGE (Full-page route component)
   Handles routing and navigation.
   [Phase 3-AI] Reads ?ai=1 URL param → passes fromAI prop to TestBuilder.
                The flag is read once on mount. Using a regular variable (not
                state) is intentional: the value must not trigger a re-render
                cycle, and TestBuilder receives it as a stable prop.
   ═══════════════════════════════════════════════════════════════════════════ */
export function TestBuilderPage() {
  const { testId } = useParams();
  const navigate   = useNavigate();

  // [Phase 3-AI] Read ?ai=1 once.  window.location.search is used directly
  // (not useSearchParams) so the param can be consumed without being stored
  // in React state — avoids an unnecessary render cycle.
  const fromAI = new URLSearchParams(window.location.search).get("ai") === "1";

  const handleClose = () => {
    navigate(-1);
  };

  return (
    <TestBuilder
      testId={testId ? parseInt(testId) : null}
      unitId={null}    // resolved from GET /tests/{id} inside TestBuilder
      unitTitle={null} // resolved from GET /tests/{id} inside TestBuilder
      fromAI={fromAI}
      onClose={handleClose}
    />
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   UNIT TEST SECTION
   First-class section card for LessonEditorShell — drop-in replacement.
   Updated to use navigation instead of modal.
   ═══════════════════════════════════════════════════════════════════════════ */
export function UnitTestSection({ unitId, unitTitle, previewData = [], isGenerating }) {
  const navigate = useNavigate();
  const [existingId,   setExistingId]   = useState(null);
  const [unitTests,    setUnitTests]    = useState(null);
  const [loadingTests, setLoadingTests] = useState(false);
  const hasFetched = useRef(false);

  const qGrad    = "linear-gradient(135deg,#0DB85E 0%,#00BCD4 100%)";
  const questions = unitTests ?? previewData;
  const hasQs     = questions.length > 0;

  const showToast = (msg) => {
    // Simple toast - could use a toast library
    const toastEl = document.createElement("div");
    toastEl.textContent = msg;
    toastEl.style.cssText = "position:fixed;bottom:24px;right:24px;background:#1A1035;color:#fff;padding:10px 18px;border-radius:12px;font-size:13px;font-weight:700;z-index:9999;animation:saveFlash 2.4s ease both;";
    document.body.appendChild(toastEl);
    setTimeout(() => toastEl.remove(), 2400);
  };

  const fetchUnitTests = useCallback(async () => {
    if (!unitId || hasFetched.current) return;
    hasFetched.current = true;
    setLoadingTests(true);
    try {
      const tests = await apiFetch(`/admin/tests?unit_id=${unitId}`);
      const list  = Array.isArray(tests) ? tests : tests.items || [];
      if (list.length > 0) {
        setExistingId(list[0].id);
        try {
          const qs = await apiFetch(`/admin/tests/${list[0].id}/questions`);
          setUnitTests(normaliseQuestions(qs));
        } catch { setUnitTests([]); }
      } else {
        setUnitTests([]);
      }
    } catch {
      setUnitTests([]);
    } finally {
      setLoadingTests(false);
    }
  }, [unitId]);

  const handleCreateTest = async () => {
    if (!unitId) {
      showToast("⚠ Unit ID is required");
      return;
    }
    try {
      // Create test first
      const newTest = await apiFetch("/tests/", {
        method: "POST",
        body: JSON.stringify({
          unit_id: unitId,
          title: "New Test",
          status: "draft",
        }),
      });
      // Navigate to builder
      navigate(`/admin/tests/${newTest.id}/builder`);
    } catch (e) {
      showToast(`⚠ Failed to create test: ${e.message}`);
    }
  };

  const handleEditTest = async (testId) => {
    navigate(`/admin/tests/${testId}/builder`);
  };

  return (
    <>
      <div className={`ls-section${isGenerating ? " ls-section--generating" : ""}`}>
        <div className="ls-section-hd" style={{ background: qGrad }}>
          <div className="ls-section-hd-icon">📝</div>
          <span className="ls-section-hd-title">Test</span>
          {hasQs && (
            <span className="ls-section-count ls-section-count--ready">
              {questions.length} question{questions.length !== 1 ? "s" : ""}
            </span>
          )}
          <button className="ls-hd-btn" onClick={existingId ? () => handleEditTest(existingId) : handleCreateTest}>
            {existingId ? "✏ Edit test" : "＋ Create test"}
          </button>
        </div>

        <div className="ls-section-body">
          {loadingTests ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[1, 2].map((i) => <div key={i} className="shimmer" style={{ height: 60, borderRadius: 13 }} />)}
            </div>
          ) : !hasQs ? (
            <>
              <div className="ls-empty">
                <div className="ls-empty-icon">📝</div>
                <div className="ls-empty-title">No test yet</div>
                <div className="ls-empty-sub">
                  Create a test to add multiple-choice, open-answer, fill-in-the-gaps, or visual questions.
                </div>
              </div>
              <div
                className="section-create-cta section-create-cta--teal"
                onClick={handleCreateTest} role="button" tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && handleCreateTest()}
                style={{ marginTop: 16 }}
              >
                <div className="section-create-cta-icon"
                  style={{ background: "linear-gradient(135deg,#0DB85E,#00BCD4)" }}>📝</div>
                <div>
                  <div className="section-create-cta-title" style={{ color: "#00BCD4" }}>Create test</div>
                  <div className="section-create-cta-sub">Add questions and publish</div>
                </div>
                <span className="section-create-cta-arrow">→</span>
              </div>
            </>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {questions.map((q, qi) => (
                <div key={q.id || qi} className="ls-q-card ls-q-card--interactive">
                  <div className="ls-q-hd">
                    <div className="ls-q-num" style={{ background: qGrad }}>{qi + 1}</div>
                    <div className="ls-q-text">{q.prompt || q.question_text || "Untitled question"}</div>
                  </div>
                  {(q.options || []).length > 0 && (
                    <div className="ls-q-opts">
                      {(q.options || []).slice(0, 4).map((opt, oi) => {
                        const isCorrect = (q.correct_option_ids || []).includes(opt.id) || opt.is_correct;
                        const text = typeof opt === "string" ? opt : opt.text || "";
                        return (
                          <div key={oi} className={`ls-q-opt${isCorrect ? " ls-q-opt--correct" : ""}`}>
                            <span className="ls-q-opt-key">{["A","B","C","D"][oi]}</span>
                            <span style={{ flex:1, fontSize:11, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{text}</span>
                            {isCorrect && <span style={{ fontSize:9, color: "#0DB85E", flexShrink:0 }}>✓</span>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div className="ls-q-card-actions">
                    <button className="ls-q-edit-btn" onClick={() => handleEditTest(existingId)}>✏ Edit test</button>
                  </div>
                </div>
              ))}
              <div
                className="section-create-cta section-create-cta--teal"
                onClick={() => handleEditTest(existingId)} role="button" tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && handleEditTest(existingId)}
              >
                <div className="section-create-cta-icon"
                  style={{ background: "linear-gradient(135deg,#0DB85E,#00BCD4)", fontSize: 16 }}>✏</div>
                <div>
                  <div className="section-create-cta-title" style={{ color: "#00BCD4" }}>Open Test Builder</div>
                  <div className="section-create-cta-sub">Edit questions, publish, or manage the test</div>
                </div>
                <span className="section-create-cta-arrow">→</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default TestBuilder;