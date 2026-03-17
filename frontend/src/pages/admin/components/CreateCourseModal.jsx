/**
 * CreateCourseModal.tsx
 *
 * A minimal, clean modal for creating a new course.
 *
 * Props:
 *   open       — controls visibility
 *   onClose    — called when user cancels or clicks backdrop
 *   onCreated  — called with the created course object after success
 *
 * Behaviour:
 *   1. User fills in title (required) and optionally uploads a thumbnail.
 *   2. On "Create":
 *      a. POST /api/v1/admin/courses   → creates the course
 *      b. If thumbnail selected:
 *         POST /api/v1/admin/courses/:id/thumbnail  (multipart)
 *   3. Navigates to /teacher/classroom/:courseId on success.
 *
 * Design: minimal, compact, consistent with the T palette used across the
 * TeacherOnboarding design system (violet accent, soft borders, Nunito/Inter).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';

// ─── Design tokens (matches TeacherOnboarding T palette) ─────────────────────

const T = {
  violet:  '#6C35DE',
  violetL: '#EDE9FF',
  violetD: '#4F23B0',
  bg:      '#F7F6FF',
  border:  '#E5DEFF',
  text:    '#1A1035',
  sub:     '#5C5490',
  muted:   '#9188C4',
  mutedL:  '#CFC9EE',
  white:   '#FFFFFF',
  red:     '#EF4444',
  redL:    '#FEE2E2',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function authHeaders() {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiCreateCourse(title) {
  const res = await fetch('/api/v1/admin/courses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ title }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => `HTTP ${res.status}`);
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

async function apiUploadThumbnail(courseId, file) {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`/api/v1/admin/courses/${courseId}/thumbnail`, {
    method: 'POST',
    headers: { ...authHeaders() },
    body: form,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => `HTTP ${res.status}`);
    throw new Error(text || `HTTP ${res.status}`);
  }
}

// ─── Thumbnail placeholder SVG ────────────────────────────────────────────────

const ThumbnailPlaceholder = () => (
  <svg
    width="100%"
    height="100%"
    viewBox="0 0 120 80"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <rect width="120" height="80" rx="10" fill={T.violetL} />
    <rect x="20" y="18" width="80" height="8" rx="4" fill={T.mutedL} />
    <rect x="28" y="32" width="64" height="5" rx="2.5" fill={T.border} />
    <rect x="32" y="42" width="56" height="5" rx="2.5" fill={T.border} />
    <rect x="36" y="52" width="48" height="5" rx="2.5" fill={T.border} />
  </svg>
);

// ─── Upload icon ─────────────────────────────────────────────────────────────

const UploadIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path
      d="M7 9.5V2M4 5l3-3 3 3M2 12h10"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

// ─── Spinner ──────────────────────────────────────────────────────────────────

const Spinner = () => (
  <span
    style={{
      display: 'inline-block',
      width: 14,
      height: 14,
      border: `2px solid rgba(255,255,255,.35)`,
      borderTopColor: '#fff',
      borderRadius: '50%',
      animation: 'ccm-spin .7s linear infinite',
      flexShrink: 0,
    }}
  />
);

// ─── Props ────────────────────────────────────────────────────────────────────

/**
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   onCreated?: (course: { id: number, title: string, [key: string]: unknown }) => void
 * }} props
 */

// ─── Component ────────────────────────────────────────────────────────────────

export default function CreateCourseModal({ open, onClose, onCreated }) {
  const navigate = useNavigate();

  const [title,        setTitle]        = useState('');
  const [thumbFile,    setThumbFile]    = useState(null);
  const [thumbPreview, setThumbPreview] = useState(null);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState(null);

  const fileInputRef  = useRef(null);
  const titleInputRef = useRef(null);

  // Reset state whenever the modal opens
  useEffect(() => {
    if (open) {
      setTitle('');
      setThumbFile(null);
      setThumbPreview(null);
      setError(null);
      setLoading(false);
      // Auto-focus title after mount animation settles
      setTimeout(() => titleInputRef.current?.focus(), 80);
    }
  }, [open]);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Revoke object URL on unmount / change
  useEffect(() => {
    return () => { if (thumbPreview) URL.revokeObjectURL(thumbPreview); };
  }, [thumbPreview]);

  const handleFileChange = useCallback((e) => {
    const file = e.target.files?.[0] ?? null;
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file.');
      return;
    }
    setThumbFile(file);
    setThumbPreview(URL.createObjectURL(file));
    setError(null);
    // Reset input so re-selecting same file fires onChange
    e.target.value = '';
  }, []);

  const handleCreate = useCallback(async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError('Please enter a course title.');
      titleInputRef.current?.focus();
      return;
    }

    setError(null);
    setLoading(true);

    try {
      // 1. Create course
      const course = await apiCreateCourse(trimmedTitle);

      // 2. Upload thumbnail if provided
      if (thumbFile) {
        try {
          await apiUploadThumbnail(course.id, thumbFile);
        } catch {
          // Non-fatal — thumbnail upload failure shouldn't block course creation
          console.warn('[CreateCourseModal] Thumbnail upload failed, continuing.');
        }
      }

      // 3. Notify parent and navigate
      onCreated?.(course);
      navigate(`/teacher/classroom/${course.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create course. Please try again.');
      setLoading(false);
    }
  }, [title, thumbFile, navigate, onCreated]);

  const handleBackdropClick = useCallback((e) => {
    if (e.target === e.currentTarget && !loading) onClose();
  }, [loading, onClose]);

  const handleCancel = useCallback(() => {
    if (!loading) onClose();
  }, [loading, onClose]);

  if (!open) return null;

  // ─── Inline styles ─────────────────────────────────────────────────────────
  // Kept inline so this component is self-contained with zero CSS-module deps.

  const s = {
    backdrop: {
      position: 'fixed',
      inset: 0,
      background: 'rgba(26,16,53,.48)',
      backdropFilter: 'blur(3px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '16px',
      animation: 'ccm-fade-in .18s ease',
    },
    modal: {
      background: T.white,
      borderRadius: 20,
      boxShadow: '0 24px 60px rgba(108,53,222,.18), 0 4px 16px rgba(0,0,0,.08)',
      width: '100%',
      maxWidth: 380,
      padding: '28px 28px 24px',
      display: 'flex',
      flexDirection: 'column',
      gap: 20,
      animation: 'ccm-pop-in .22s cubic-bezier(.22,.68,0,1.2)',
      fontFamily: "'Inter', system-ui, sans-serif",
    },
    header: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    title: {
      fontSize: 18,
      fontWeight: 800,
      color: T.text,
      fontFamily: "'Nunito', system-ui, sans-serif",
      letterSpacing: '-.3px',
    },
    closeBtn: {
      width: 28,
      height: 28,
      borderRadius: 8,
      border: 'none',
      background: T.bg,
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: T.muted,
      transition: 'background .15s, color .15s',
      flexShrink: 0,
    },
    thumbWrapper: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 10,
    },
    thumbFrame: {
      width: '100%',
      aspectRatio: '16/9',
      borderRadius: 12,
      overflow: 'hidden',
      border: `2px dashed ${T.border}`,
      background: T.bg,
      position: 'relative',
      cursor: 'pointer',
      transition: 'border-color .15s',
    },
    thumbImg: {
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      display: 'block',
    },
    uploadBtn: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '7px 14px',
      borderRadius: 9,
      border: `1.5px solid ${T.border}`,
      background: T.white,
      color: T.sub,
      fontSize: 13,
      fontWeight: 600,
      cursor: 'pointer',
      transition: 'border-color .15s, color .15s, background .15s',
      fontFamily: "'Inter', system-ui, sans-serif",
    },
    fieldGroup: {
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
    },
    label: {
      fontSize: 12,
      fontWeight: 700,
      color: T.sub,
      letterSpacing: '.3px',
      textTransform: 'uppercase',
    },
    input: {
      width: '100%',
      padding: '10px 13px',
      borderRadius: 11,
      border: `1.5px solid ${T.border}`,
      background: T.bg,
      color: T.text,
      fontSize: 14,
      fontWeight: 500,
      outline: 'none',
      transition: 'border-color .15s',
      fontFamily: "'Inter', system-ui, sans-serif",
    },
    errorBox: {
      padding: '9px 13px',
      borderRadius: 10,
      background: '#FEE2E2',
      border: '1.5px solid #FCA5A5',
      color: T.red,
      fontSize: 13,
      fontWeight: 500,
    },
    footer: {
      display: 'flex',
      gap: 10,
      justifyContent: 'flex-end',
      paddingTop: 2,
    },
    cancelBtn: {
      padding: '9px 18px',
      borderRadius: 11,
      border: `1.5px solid ${T.border}`,
      background: T.white,
      color: T.sub,
      fontSize: 14,
      fontWeight: 600,
      cursor: 'pointer',
      transition: 'background .15s, border-color .15s',
      fontFamily: "'Inter', system-ui, sans-serif",
    },
    createBtn: {
      padding: '9px 22px',
      borderRadius: 11,
      border: 'none',
      background: loading ? '#9B7FE8' : T.violet,
      color: T.white,
      fontSize: 14,
      fontWeight: 700,
      cursor: loading ? 'not-allowed' : 'pointer',
      display: 'flex',
      alignItems: 'center',
      gap: 7,
      transition: 'background .15s, transform .1s',
      fontFamily: "'Nunito', system-ui, sans-serif",
      letterSpacing: '-.1px',
    },
  };

  return createPortal(
    <>
      {/* Keyframe definitions */}
      <style>{`
        @keyframes ccm-fade-in { from{opacity:0} to{opacity:1} }
        @keyframes ccm-pop-in  { from{opacity:0;transform:scale(.93) translateY(10px)} to{opacity:1;transform:none} }
        @keyframes ccm-spin    { to{transform:rotate(360deg)} }

        .ccm-close-btn:hover  { background: ${T.violetL} !important; color: ${T.violet} !important; }
        .ccm-upload-btn:hover { border-color: ${T.violet} !important; color: ${T.violet} !important; background: ${T.violetL} !important; }
        .ccm-cancel-btn:hover { background: ${T.bg} !important; border-color: ${T.mutedL} !important; }
        .ccm-create-btn:hover:not(:disabled) { background: ${T.violetD} !important; transform: translateY(-1px); }
        .ccm-create-btn:active:not(:disabled) { transform: translateY(0); }
        .ccm-thumb-frame:hover { border-color: ${T.violet} !important; }
        .ccm-input:focus { border-color: ${T.violet} !important; box-shadow: 0 0 0 3px ${T.violetL}; }
      `}</style>

      {/* Backdrop */}
      <div style={s.backdrop} onClick={handleBackdropClick} role="dialog" aria-modal="true" aria-label="Create Course">

        {/* Modal card */}
        <div style={s.modal}>

          {/* ── Header ── */}
          <div style={s.header}>
            <span style={s.title}>Create Course</span>
            <button
              className="ccm-close-btn"
              style={s.closeBtn}
              onClick={handleCancel}
              aria-label="Close"
              disabled={loading}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
              </svg>
            </button>
          </div>

          {/* ── Thumbnail ── */}
          <div style={s.thumbWrapper}>
            {/* Preview frame — click to upload */}
            <div
              className="ccm-thumb-frame"
              style={s.thumbFrame}
              onClick={() => !loading && fileInputRef.current?.click()}
              role="button"
              aria-label="Click to upload thumbnail"
              tabIndex={0}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
            >
              {thumbPreview
                ? <img src={thumbPreview} alt="Course thumbnail preview" style={s.thumbImg} />
                : <ThumbnailPlaceholder />
              }
            </div>

            {/* Upload button */}
            <button
              className="ccm-upload-btn"
              style={s.uploadBtn}
              onClick={() => !loading && fileInputRef.current?.click()}
              disabled={loading}
              type="button"
            >
              <UploadIcon />
              {thumbFile ? 'Change thumbnail' : 'Upload thumbnail'}
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleFileChange}
              aria-hidden="true"
            />
          </div>

          {/* ── Title field ── */}
          <div style={s.fieldGroup}>
            <label style={s.label} htmlFor="ccm-title-input">
              Course title
            </label>
            <input
              id="ccm-title-input"
              ref={titleInputRef}
              className="ccm-input"
              style={s.input}
              type="text"
              placeholder="e.g. English for Beginners"
              value={title}
              onChange={e => { setTitle(e.target.value); setError(null); }}
              onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
              disabled={loading}
              maxLength={120}
              autoComplete="off"
            />
          </div>

          {/* ── Error ── */}
          {error && (
            <div style={s.errorBox} role="alert">
              {error}
            </div>
          )}

          {/* ── Footer buttons ── */}
          <div style={s.footer}>
            <button
              className="ccm-cancel-btn"
              style={s.cancelBtn}
              onClick={handleCancel}
              disabled={loading}
              type="button"
            >
              Cancel
            </button>
            <button
              className="ccm-create-btn"
              style={s.createBtn}
              onClick={handleCreate}
              disabled={loading}
              type="button"
            >
              {loading && <Spinner />}
              {loading ? 'Creating…' : 'Create'}
            </button>
          </div>

        </div>
      </div>
    </>,
    document.body,
  );
}