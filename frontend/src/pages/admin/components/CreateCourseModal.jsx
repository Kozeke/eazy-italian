/**
 * CreateCourseModal.jsx  (v3 — file-enriched generation)
 *
 * Two modes in one compact modal:
 *   • Quick    — single title input → create course immediately
 *   • Generate — describe your course → AI builds title + units (JSON POST /generate-outline).
 *                Optional file enrichment: CourseFileUploadModal.legacy.jsx (multipart /generate-outline-from-files).
 *
 * Props:
 *   open       — controls visibility
 *   onClose    — called when user cancels / presses Escape / clicks backdrop
 *   onCreated  — called with the created course object after success
 */

import React, {
  useCallback, useEffect, useRef, useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { useTeacherClassroomTransition } from '../../../contexts/TeacherClassroomTransitionContext';
// Optional second step: teacher attaches PDFs/docs before outline generation.
import CourseFileUploadModal from './CourseFileUploadModal.legacy';

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  primary:    '#6C6FEF',
  primaryDk:  '#4F52C2',
  tint:       '#EEF0FE',
  tintDeep:   '#DDE1FC',
  bg:         '#F7F7FA',
  white:      '#FFFFFF',
  border:     '#E8EAFD',
  text:       '#1C1F3A',
  sub:        '#6B6F8E',
  muted:      '#A8ABCA',
  error:      '#EF4444',
  errorBg:    '#FEF2F2',
  success:    '#10B981',
  successBg:  '#ECFDF5',
};

const FONT_DISPLAY = "'Nunito', system-ui, sans-serif";
const FONT_BODY    = "'Inter', system-ui, sans-serif";

const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

// ─── API helpers ──────────────────────────────────────────────────────────────

function authHeaders() {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Resolves API base URL for admin create flows (same default as services/api.ts).
const ADMIN_API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1').replace(/\/+$/, '');

// Builds an absolute API URL from the configured base and a relative endpoint path.
function buildAdminApiUrl(endpointPath) {
  return `${ADMIN_API_BASE}/${endpointPath.replace(/^\/+/, '')}`;
}

// Parses JSON safely and reports empty/non-JSON payloads with actionable context.
async function parseJsonResponse(res, fallbackMessage) {
  const rawBody = await res.text();
  if (!rawBody || !rawBody.trim()) {
    throw new Error(fallbackMessage);
  }
  try {
    return JSON.parse(rawBody);
  } catch {
    throw new Error(fallbackMessage);
  }
}

async function apiCreateCourse(title) {
  const res = await fetch(buildAdminApiUrl('/admin/courses'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ title, status: 'published', is_visible_to_students: true }),
  });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  return parseJsonResponse(
    res,
    'Course was created but API returned an empty or invalid JSON response. Check VITE_API_BASE_URL and backend proxy settings.',
  );
}

async function apiCreateUnit(courseId, title, orderIndex = 0, description = '') {
  const res = await fetch(buildAdminApiUrl('/units/admin/units'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({
      title,
      description,
      level: 'A1',
      status: 'draft',
      order_index: orderIndex,
      course_id: courseId,
      is_visible_to_students: false,
    }),
  });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  return parseJsonResponse(res, 'Unit was created but API returned an empty or invalid JSON response.');
}

async function apiUploadThumbnail(courseId, file) {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(buildAdminApiUrl(`/admin/courses/${courseId}/thumbnail`), {
    method: 'POST',
    headers: { ...authHeaders() },
    body: form,
  });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
}

/**
 * Fast path — no uploaded files.
 * POST /api/v1/course-builder/generate-outline   (JSON body)
 * Returns { title, units: [...] }
 */
async function apiGenerateOutline(description, level) {
  const res = await fetch(buildAdminApiUrl('/course-builder/generate-outline'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ description, level }),
  });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  return parseJsonResponse(res, 'Outline generation returned an empty or invalid JSON response.');
}

/**
 * File-enrichment path — teacher uploaded one or more files.
 * POST /api/v1/course-builder/generate-outline-from-files   (multipart)
 * Returns { title, units: [...], source_token: "<uuid>" }
 *
 * source_token is stored in sessionStorage and forwarded to the SSE stream
 * so each unit's content is grounded in the uploaded material.
 */
async function apiGenerateOutlineFromFiles(description, level, files) {
  const form = new FormData();
  form.append('description', description);
  form.append('level', level);
  for (const f of files) form.append('files', f);

  const res = await fetch(buildAdminApiUrl('/course-builder/generate-outline-from-files'), {
    method: 'POST',
    headers: { ...authHeaders() },   // no Content-Type — browser sets multipart boundary
    body: form,
  });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  return parseJsonResponse(res, 'Outline generation from files returned an empty or invalid JSON response.');
}

// ─── Tiny sub-components ──────────────────────────────────────────────────────

const ThumbnailPlaceholder = () => (
  <svg
    width="100%" height="100%" viewBox="0 0 120 80"
    fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"
  >
    <rect width="120" height="80" rx="10" fill={C.tint} />
    <rect x="20" y="18" width="80" height="8" rx="4" fill="#CFC9EE" />
    <rect x="28" y="32" width="64" height="5" rx="2.5" fill={C.border} />
    <rect x="32" y="42" width="56" height="5" rx="2.5" fill={C.border} />
    <rect x="36" y="52" width="48" height="5" rx="2.5" fill={C.border} />
  </svg>
);

const ThumbnailZone = ({ preview, onPick, onClear, disabled }) => {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) onPick(file);
  };

  return (
    <div style={{ position: 'relative' }}>
      <div
        role="button" tabIndex={0} aria-label="Click or drag to upload thumbnail"
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && !disabled) inputRef.current?.click(); }}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        style={{
          width: '100%', aspectRatio: '16/9',
          borderRadius: 12, overflow: 'hidden',
          border: `2px dashed ${dragOver ? C.primary : preview ? 'transparent' : C.border}`,
          background: preview ? 'transparent' : C.bg,
          cursor: disabled ? 'default' : 'pointer',
          position: 'relative',
          transition: 'border-color .15s, box-shadow .15s',
          boxShadow: dragOver ? `0 0 0 3px ${C.tint}` : 'none',
        }}
      >
        {preview ? (
          <img src={preview} alt="Course thumbnail"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        ) : (
          <ThumbnailPlaceholder />
        )}
        {!disabled && (
          <div className="ccm2-thumb-overlay" style={{
            position: 'absolute', inset: 0,
            background: preview ? 'rgba(28,31,58,.45)' : 'rgba(108,111,239,.06)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 6, opacity: 0, transition: 'opacity .18s', borderRadius: 10,
          }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 11V4M5 7l3-3 3 3M2 14h12"
                stroke={preview ? '#fff' : C.primary} strokeWidth="1.6"
                strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span style={{ fontSize: 12, fontWeight: 700, color: preview ? '#fff' : C.primary, fontFamily: FONT_BODY }}>
              {preview ? 'Change photo' : 'Upload photo'}
            </span>
          </div>
        )}
      </div>

      {preview && !disabled && (
        <button
          onClick={(e) => { e.stopPropagation(); onClear(); }}
          aria-label="Remove thumbnail"
          style={{
            position: 'absolute', top: 7, right: 7,
            width: 24, height: 24, borderRadius: 6,
            border: 'none', background: 'rgba(28,31,58,.55)',
            color: '#fff', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background .15s',
          }}
        >
          <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
            <path d="M1 1l7 7M8 1L1 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
      )}

      <input
        ref={inputRef} type="file" accept="image/*"
        style={{ display: 'none' }}
        onChange={e => { const file = e.target.files?.[0]; if (file) onPick(file); e.target.value = ''; }}
        aria-hidden="true"
      />
    </div>
  );
};

const Spinner = ({ size = 14, color = '#fff' }) => (
  <span style={{
    display: 'inline-block',
    width: size, height: size,
    border: `2px solid rgba(255,255,255,.3)`,
    borderTopColor: color,
    borderRadius: '50%',
    animation: 'ccm2-spin .7s linear infinite',
    flexShrink: 0,
  }} />
);

const SparkleIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
    <path d="M7 1l1.2 3.8L12 6l-3.8 1.2L7 11 5.8 7.2 2 6l3.8-1.2L7 1z"
      fill="currentColor" opacity=".9" />
    <path d="M11.5 1l.5 1.5L13.5 3l-1.5.5L11.5 5l-.5-1.5L9.5 3l1.5-.5L11.5 1z"
      fill="currentColor" opacity=".6" />
  </svg>
);

const GeneratingSteps = ({ step }) => {
  const steps = [
    'Crafting course outline…',
    'Building course structure…',
    'Almost ready…',
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {steps.map((label, i) => {
        const done    = i < step;
        const current = i === step;
        return (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            opacity: done ? 1 : current ? 1 : 0.35,
            transition: 'opacity .3s',
          }}>
            <span style={{
              width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: done ? C.success : current ? C.primary : C.bg,
              border: `2px solid ${done ? C.success : current ? C.primary : C.border}`,
              transition: 'all .3s',
            }}>
              {done ? (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M2 5l2.5 2.5L8 3" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              ) : current ? (
                <span style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: '#fff', animation: 'ccm2-pulse .8s ease-in-out infinite',
                }} />
              ) : null}
            </span>
            <span style={{
              fontSize: 13, fontWeight: current ? 600 : 500,
              color: done ? C.success : current ? C.text : C.muted,
              fontFamily: FONT_BODY, transition: 'color .3s',
            }}>
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

export default function CreateCourseModal({ open, onClose, onCreated }) {
  const navigate = useNavigate();
  const { startTeacherClassroomOpen } = useTeacherClassroomTransition();

  const [mode, setMode]               = useState('quick');
  const [thumbFile, setThumbFile]     = useState(null);
  const [thumbPreview, setThumbPreview] = useState(null);
  const [quickTitle, setQuickTitle]   = useState('');
  const [description, setDescription] = useState('');
  const [level, setLevel]             = useState('B1');
  const [loading, setLoading]         = useState(false);
  const [genStep, setGenStep]         = useState(0);
  const [error, setError]             = useState(null);

  // ── File enrichment step (Generate mode only)
  const [fileModalOpen, setFileModalOpen] = useState(false);

  const quickInputRef = useRef(null);
  const descRef       = useRef(null);

  // Reset on open
  useEffect(() => {
    if (open) {
      setMode('quick');
      setQuickTitle('');
      setDescription('');
      setLevel('B1');
      setThumbFile(null);
      setThumbPreview(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
      setLoading(false);
      setGenStep(0);
      setError(null);
      setFileModalOpen(false);
      setTimeout(() => quickInputRef.current?.focus(), 80);
    }
  }, [open]);

  useEffect(() => {
    return () => { if (thumbPreview) URL.revokeObjectURL(thumbPreview); };
  }, [thumbPreview]);

  useEffect(() => {
    if (!open || loading) return;
    const t = setTimeout(() => {
      if (mode === 'quick') quickInputRef.current?.focus();
      else                  descRef.current?.focus();
    }, 60);
    return () => clearTimeout(t);
  }, [mode, open, loading]);

  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (e.key === 'Escape' && !loading) onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [open, onClose, loading]);

  const handleThumbPick = useCallback((file) => {
    if (thumbPreview) URL.revokeObjectURL(thumbPreview);
    setThumbFile(file);
    setThumbPreview(URL.createObjectURL(file));
  }, [thumbPreview]);

  const handleThumbClear = useCallback(() => {
    if (thumbPreview) URL.revokeObjectURL(thumbPreview);
    setThumbFile(null);
    setThumbPreview(null);
  }, [thumbPreview]);

  // ── Navigate helper — forwards source_token in URL when present
  const goToClassroom = useCallback((courseId, unitId, generationParams = null) => {
    startTeacherClassroomOpen();
    const base = unitId
      ? `/teacher/classroom/${courseId}/${unitId}`
      : `/teacher/classroom/${courseId}`;

    let search = '';
    if (generationParams) {
      const params = new URLSearchParams({
        ai_outline: 'true',
        level: generationParams.level ?? 'B1',
      });
      if (generationParams.sourceToken) {
        params.set('source_token', generationParams.sourceToken);
      }
      search = `?${params.toString()}`;
    }

    navigate(base + search);
  }, [navigate, startTeacherClassroomOpen]);

  // ── QUICK CREATE ─────────────────────────────────────────────────────────────

  const handleQuickCreate = useCallback(async () => {
    const title = quickTitle.trim();
    if (!title) {
      setError('Please enter a course title.');
      quickInputRef.current?.focus();
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const course = await apiCreateCourse(title);
      if (thumbFile) {
        try { await apiUploadThumbnail(course.id, thumbFile); }
        catch (e) { console.warn('[CreateCourseModal] Thumbnail upload failed.', e); }
      }
      let firstUnitId = null;
      try {
        const unit = await apiCreateUnit(course.id, 'Unit 1', 0);
        firstUnitId = unit.id;
      } catch (e) {
        console.warn('[CreateCourseModal] First unit failed, continuing.', e);
      }
      onCreated?.(course);
      goToClassroom(course.id, firstUnitId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create course.');
      setLoading(false);
    }
  }, [quickTitle, onCreated, goToClassroom, thumbFile]);

  // ── AI GENERATE — Step 2: outline + course creation (was also Step 2 for CourseFileUploadModal.legacy) ──
  //
  //  files.length === 0  →  POST /generate-outline            (JSON, fast path)
  //  files.length  >  0  →  POST /generate-outline-from-files (multipart, returns source_token)

  const handleGenerateWithFiles = useCallback(async (files) => {
    setFileModalOpen(false);
    setLoading(true);
    setGenStep(0);

    const desc = description.trim();

    try {
      // ── Step 0: generate outline via appropriate endpoint ──────────────────
      let outline;
      let sourceToken = null;

      if (files.length > 0) {
        // File-enrichment path
        try {
          const result = await apiGenerateOutlineFromFiles(desc, level, files);
          sourceToken = result.source_token ?? null;
          outline     = result;                 // same shape as OutlineRequest response
          console.info(
            '[CreateCourseModal] Outline from files — source_token:', sourceToken,
            'units:', outline.units?.length,
          );
        } catch (aiErr) {
          console.warn('[CreateCourseModal] Outline-from-files failed, falling back.', aiErr);
          outline = { title: desc.slice(0, 80), units: [{ title: 'Unit 1', description: '', sections: [] }] };
        }
      } else {
        // Fast path — no files
        try {
          outline = await apiGenerateOutline(desc, level);
        } catch (aiErr) {
          console.warn('[CreateCourseModal] Outline generation failed, falling back.', aiErr);
          outline = { title: desc.slice(0, 80), units: [{ title: 'Unit 1', description: '', sections: [] }] };
        }
      }

      setGenStep(1);

      // ── Step 1: create course row ────────────────────────────────────────────
      const course = await apiCreateCourse(outline.title);
      if (thumbFile) {
        try { await apiUploadThumbnail(course.id, thumbFile); }
        catch (e) { console.warn('[CreateCourseModal] Thumbnail upload failed.', e); }
      }

      setGenStep(2);

      // ── Step 2: create unit rows ─────────────────────────────────────────────
      let firstUnitId = null;
      const unitTitles = outline.units ?? [];

      for (let i = 0; i < Math.max(1, unitTitles.length); i++) {
        const u = unitTitles[i] ?? { title: `Unit ${i + 1}`, description: '' };
        try {
          const unit = await apiCreateUnit(course.id, u.title, i, u.description ?? '');
          if (i === 0) firstUnitId = unit.id;
        } catch (e) {
          console.warn(`[CreateCourseModal] Unit ${i} failed.`, e);
        }
      }

      // ── Step 3: cache outline (+ source_token) for UnitSelectorModal ─────────
      try {
        sessionStorage.setItem(`ai_outline_${course.id}`, JSON.stringify(outline));
        if (sourceToken) {
          // UnitSelectorModal / useCourseGeneration reads this to append
          // &source_token=... to the SSE URL so units are grounded in files.
          sessionStorage.setItem(`ai_source_token_${course.id}`, sourceToken);
        }
      } catch {
        // sessionStorage full — not critical
      }

      await new Promise(r => setTimeout(r, 350));

      onCreated?.(course);
      goToClassroom(course.id, firstUnitId, { level, sourceToken });

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setLoading(false);
      setGenStep(0);
    }
  }, [description, level, thumbFile, onCreated, goToClassroom]);

  // ── AI GENERATE — Step 1: validate, then open file-enrichment modal (Skip → JSON outline; files → multipart).
  const handleGenerate = useCallback(() => {
    const desc = description.trim();
    if (!desc) {
      setError('Please describe your course.');
      descRef.current?.focus();
      return;
    }
    setError(null);
    setFileModalOpen(true);
  }, [description]);

  const handleBackdrop = useCallback((e) => {
    if (e.target === e.currentTarget && !loading) onClose();
  }, [loading, onClose]);

  if (!open) return null;

  const isGenerate = mode === 'generate';
  const canSubmit  = isGenerate ? description.trim().length > 0 : quickTitle.trim().length > 0;

  return createPortal(
    <>
      <style>{`
        @keyframes ccm2-fade-in { from{opacity:0} to{opacity:1} }
        @keyframes ccm2-pop-in  {
          from { opacity:0; transform: scale(.94) translateY(12px) }
          to   { opacity:1; transform: none }
        }
        @keyframes ccm2-spin  { to { transform: rotate(360deg) } }
        @keyframes ccm2-pulse { 0%,100%{opacity:.4} 50%{opacity:1} }

        .ccm2-backdrop { animation: ccm2-fade-in .18s ease; }
        .ccm2-modal    { animation: ccm2-pop-in .24s cubic-bezier(.22,.68,0,1.15); }

        .ccm2-tab {
          flex: 1; padding: 7px 0; border: none; cursor: pointer;
          font-size: 13px; font-weight: 600; border-radius: 9px;
          transition: all .18s; display: flex; align-items: center;
          justify-content: center; gap: 5px;
          font-family: ${FONT_BODY};
        }
        .ccm2-tab-active {
          background: ${C.white}; color: ${C.primary};
          box-shadow: 0 1px 4px rgba(108,111,239,.18), 0 1px 2px rgba(0,0,0,.06);
        }
        .ccm2-tab-inactive { background: transparent; color: ${C.sub}; }
        .ccm2-tab-inactive:hover { color: ${C.text}; background: rgba(255,255,255,.5); }

        .ccm2-input {
          width: 100%; padding: 11px 14px; box-sizing: border-box;
          border-radius: 12px; border: 1.5px solid ${C.border};
          background: ${C.bg}; color: ${C.text};
          font-size: 14px; font-weight: 500; outline: none;
          font-family: ${FONT_BODY}; resize: none;
          transition: border-color .15s, box-shadow .15s;
        }
        .ccm2-input::placeholder { color: ${C.muted}; }
        .ccm2-input:focus {
          border-color: ${C.primary};
          box-shadow: 0 0 0 3px ${C.tint};
        }

        .ccm2-level-chip {
          padding: 5px 11px; border-radius: 8px; font-size: 12px;
          font-weight: 700; border: 1.5px solid transparent;
          cursor: pointer; transition: all .15s; font-family: ${FONT_BODY};
          letter-spacing: .2px;
        }
        .ccm2-level-chip-active  { background: ${C.tint}; color: ${C.primary}; border-color: ${C.border}; }
        .ccm2-level-chip-inactive { background: ${C.bg}; color: ${C.muted}; border-color: ${C.bg}; }
        .ccm2-level-chip-inactive:hover { background: ${C.tint}; color: ${C.sub}; border-color: ${C.border}; }

        .ccm2-btn-cancel {
          padding: 10px 18px; border-radius: 11px; font-size: 14px;
          font-weight: 600; cursor: pointer; font-family: ${FONT_BODY};
          border: 1.5px solid ${C.border}; background: ${C.white};
          color: ${C.sub}; transition: background .15s;
        }
        .ccm2-btn-cancel:hover:not(:disabled) { background: ${C.bg}; }

        .ccm2-btn-primary {
          padding: 10px 22px; border-radius: 11px; font-size: 14px;
          font-weight: 700; cursor: pointer; font-family: ${FONT_DISPLAY};
          border: none; color: ${C.white}; letter-spacing: -.1px;
          display: flex; align-items: center; gap: 7px;
          transition: background .15s, transform .1s, opacity .15s;
        }
        .ccm2-btn-primary:hover:not(:disabled) {
          background: ${C.primaryDk} !important;
          transform: translateY(-1px);
        }
        .ccm2-btn-primary:active:not(:disabled) { transform: translateY(0); }
        .ccm2-btn-primary:disabled { opacity: .7; cursor: not-allowed; }

        .ccm2-close:hover { background: ${C.tint} !important; color: ${C.primary} !important; }

        .ccm2-thumb-overlay { pointer-events: none; }
        div:hover > .ccm2-thumb-overlay,
        div:focus > .ccm2-thumb-overlay { opacity: 1 !important; }
      `}</style>

      {/* Backdrop — hidden while file modal is open so only one modal shows */}
      <div
        className="ccm2-backdrop"
        onClick={handleBackdrop}
        role="dialog"
        aria-modal="true"
        aria-label="Create Course"
        style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(26,26,48,.5)',
          backdropFilter: 'blur(4px)',
          display: fileModalOpen ? 'none' : 'flex',
          alignItems: 'center', justifyContent: 'center',
          padding: 16,
        }}
      >
        {/* Modal card */}
        <div
          className="ccm2-modal"
          style={{
            background: C.white,
            borderRadius: 20,
            boxShadow: '0 24px 64px rgba(108,111,239,.18), 0 4px 16px rgba(0,0,0,.08)',
            width: '100%', maxWidth: 400,
            padding: '24px 24px 20px',
            display: 'flex', flexDirection: 'column', gap: 0,
            fontFamily: FONT_BODY,
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* ── Header ── */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
            <span style={{ fontSize: 17, fontWeight: 800, color: C.text, fontFamily: FONT_DISPLAY, letterSpacing: '-.3px' }}>
              New Course
            </span>
            <button
              className="ccm2-close"
              onClick={() => !loading && onClose()}
              disabled={loading}
              aria-label="Close"
              style={{
                width: 28, height: 28, borderRadius: 8,
                border: 'none', background: C.bg, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: C.muted, transition: 'background .15s, color .15s', flexShrink: 0,
              }}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
              </svg>
            </button>
          </div>

          {/* ── Mode toggle ── */}
          <div style={{ display: 'flex', gap: 3, padding: 3, background: C.bg, borderRadius: 12, marginBottom: 20 }}>
            {[
              { id: 'quick',    label: 'Quick',    icon: null },
              { id: 'generate', label: 'Generate', icon: <SparkleIcon /> },
            ].map(({ id, label, icon }) => (
              <button
                key={id}
                className={`ccm2-tab ${mode === id ? 'ccm2-tab-active' : 'ccm2-tab-inactive'}`}
                onClick={() => { if (!loading) { setMode(id); setError(null); } }}
                disabled={loading}
              >
                {icon}{label}
              </button>
            ))}
          </div>

          {/* ── Thumbnail (shared) ── */}
          <div style={{ marginBottom: 16 }}>
            <ThumbnailZone
              preview={thumbPreview}
              onPick={handleThumbPick}
              onClear={handleThumbClear}
              disabled={loading}
            />
          </div>

          {/* ── QUICK MODE ── */}
          {!isGenerate && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input
                ref={quickInputRef}
                className="ccm2-input"
                type="text"
                placeholder="e.g. English for Business B2"
                value={quickTitle}
                onChange={e => { setQuickTitle(e.target.value); setError(null); }}
                onKeyDown={e => { if (e.key === 'Enter') handleQuickCreate(); }}
                disabled={loading}
                maxLength={120}
                autoComplete="off"
              />
            </div>
          )}

          {/* ── GENERATE MODE ── */}
          {isGenerate && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {loading ? (
                <div style={{ padding: '16px 14px', background: C.bg, borderRadius: 14, border: `1.5px solid ${C.border}` }}>
                  <GeneratingSteps step={genStep} />
                </div>
              ) : (
                <>
                  <textarea
                    ref={descRef}
                    className="ccm2-input"
                    rows={3}
                    placeholder="e.g. A B2 business English course for professionals, covering emails, negotiations, and presentations."
                    value={description}
                    onChange={e => { setDescription(e.target.value); setError(null); }}
                    disabled={loading}
                    maxLength={400}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: '.4px', textTransform: 'uppercase', flexShrink: 0 }}>
                      Level
                    </span>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {CEFR_LEVELS.map(l => (
                        <button
                          key={l}
                          className={`ccm2-level-chip ${level === l ? 'ccm2-level-chip-active' : 'ccm2-level-chip-inactive'}`}
                          onClick={() => setLevel(l)}
                        >
                          {l}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Error ── */}
          {error && (
            <div style={{
              marginTop: 12, padding: '9px 13px', borderRadius: 10,
              background: C.errorBg, border: `1.5px solid #FCA5A5`,
              color: C.error, fontSize: 13, fontWeight: 500,
            }} role="alert">
              {error}
            </div>
          )}

          {/* ── Footer ── */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
            {!loading && (
              <button
                className="ccm2-btn-cancel"
                onClick={() => !loading && onClose()}
                disabled={loading}
                type="button"
              >
                Cancel
              </button>
            )}
            <button
              className="ccm2-btn-primary"
              style={{
                background: canSubmit && !loading ? C.primary : C.muted,
                flex: loading ? 1 : 'unset',
                justifyContent: loading ? 'center' : 'flex-start',
              }}
              onClick={isGenerate ? handleGenerate : handleQuickCreate}
              disabled={loading || !canSubmit}
              type="button"
            >
              {loading ? (
                <><Spinner />{isGenerate ? 'Generating…' : 'Creating…'}</>
              ) : isGenerate ? (
                <><SparkleIcon />Generate Course</>
              ) : (
                'Create Course'
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ── File enrichment modal (Generate mode, step 2) ── */}
      <CourseFileUploadModal
        open={fileModalOpen}
        onClose={() => setFileModalOpen(false)}
        onSkip={() => handleGenerateWithFiles([])}
        onGenerate={handleGenerateWithFiles}
      />
    </>,
    document.body,
  );
}