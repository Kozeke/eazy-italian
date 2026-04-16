/**
 * CourseFileUploadModal.jsx
 *
 * Step 2 of course generation — optional file enrichment.
 * Opened after the user clicks "Generate with AI" in CreateCourseModal.
 *
 * Props:
 *   open       — controls visibility
 *   onClose    — called when user presses Escape / clicks backdrop
 *   onSkip     — called when user clicks Skip (proceed without files)
 *   onGenerate — called with File[] when user clicks Generate
 */

import React, {
    useCallback, useEffect, useRef, useState,
  } from 'react';
  import { createPortal } from 'react-dom';
  
  // ─── Design tokens ────────────────────────────────────────────────────────────
  
  const C = {
    primary:   '#6C6FEF',
    primaryDk: '#4F52C2',
    tint:      '#EEF0FE',
    tintDeep:  '#DDE1FC',
    bg:        '#F7F7FA',
    white:     '#FFFFFF',
    border:    '#E8EAFD',
    text:      '#1C1F3A',
    sub:       '#6B6F8E',
    muted:     '#A8ABCA',
    error:     '#EF4444',
    errorBg:   '#FEF2F2',
  };
  
  const FONT_DISPLAY = "'Nunito', system-ui, sans-serif";
  const FONT_BODY    = "'Inter', system-ui, sans-serif";
  
  // Accepted MIME types
  const ACCEPTED = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'text/plain',
    'image/jpeg',
    'image/png',
    'image/webp',
    'video/mp4',
    'video/quicktime',
    'text/vtt',
    'application/x-subrip',
  ];
  
  const ACCEPT_ATTR = ACCEPTED.join(',');
  const MAX_FILES   = 10;
  const MAX_MB      = 50;
  
  // ─── Helpers ──────────────────────────────────────────────────────────────────
  
  function formatBytes(bytes) {
    if (bytes < 1024)       return `${bytes} B`;
    if (bytes < 1024 ** 2)  return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  }
  
  function fileIcon(file) {
    const t = file.type;
    if (t.startsWith('image/')) return (
      <svg viewBox="0 0 20 20" width="18" height="18" fill="none">
        <rect x="2" y="2" width="16" height="16" rx="3" stroke={C.primary} strokeWidth="1.4"/>
        <circle cx="7" cy="7.5" r="1.5" fill={C.primary}/>
        <path d="M2 13l4-4 3 3 3-3.5 4 4.5" stroke={C.primary} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    );
    if (t === 'application/pdf') return (
      <svg viewBox="0 0 20 20" width="18" height="18" fill="none">
        <rect x="3" y="1" width="14" height="18" rx="2" stroke={C.primary} strokeWidth="1.4"/>
        <path d="M6 7h8M6 10h8M6 13h5" stroke={C.primary} strokeWidth="1.3" strokeLinecap="round"/>
      </svg>
    );
    if (t.startsWith('video/')) return (
      <svg viewBox="0 0 20 20" width="18" height="18" fill="none">
        <rect x="2" y="4" width="12" height="12" rx="2" stroke={C.primary} strokeWidth="1.4"/>
        <path d="M14 8l4-2v8l-4-2V8z" stroke={C.primary} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    );
    if (t.startsWith('text/') || t.includes('subrip')) return (
      <svg viewBox="0 0 20 20" width="18" height="18" fill="none">
        <rect x="3" y="1" width="14" height="18" rx="2" stroke={C.primary} strokeWidth="1.4"/>
        <path d="M6 6h8M6 9.5h8M6 13h5" stroke={C.primary} strokeWidth="1.3" strokeLinecap="round"/>
      </svg>
    );
    // Word / generic
    return (
      <svg viewBox="0 0 20 20" width="18" height="18" fill="none">
        <rect x="3" y="1" width="14" height="18" rx="2" stroke={C.primary} strokeWidth="1.4"/>
        <path d="M6 7h8M6 10.5h8M6 14h5" stroke={C.primary} strokeWidth="1.3" strokeLinecap="round"/>
      </svg>
    );
  }
  
  // ─── FileRow ──────────────────────────────────────────────────────────────────
  
  function FileRow({ file, onRemove }) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '9px 12px',
        borderRadius: 10,
        background: C.tint,
        border: `1px solid ${C.border}`,
      }}>
        <span style={{ flexShrink: 0 }}>{fileIcon(file)}</span>
  
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            margin: 0,
            fontSize: 13,
            fontWeight: 500,
            color: C.text,
            fontFamily: FONT_BODY,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {file.name}
          </p>
          <p style={{
            margin: 0,
            fontSize: 11,
            color: C.muted,
            fontFamily: FONT_BODY,
            marginTop: 1,
          }}>
            {formatBytes(file.size)}
          </p>
        </div>
  
        <button
          onClick={onRemove}
          title="Remove file"
          style={{
            flexShrink: 0,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 4,
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            color: C.muted,
            transition: 'color .15s',
          }}
          onMouseEnter={e => e.currentTarget.style.color = C.error}
          onMouseLeave={e => e.currentTarget.style.color = C.muted}
        >
          <svg viewBox="0 0 16 16" width="15" height="15" fill="none">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
          </svg>
        </button>
      </div>
    );
  }
  
  // ─── DropZone ─────────────────────────────────────────────────────────────────
  
  function DropZone({ onFiles, disabled }) {
    const [over, setOver] = useState(false);
    const inputRef = useRef(null);
  
    const handleDrop = useCallback((e) => {
      e.preventDefault();
      setOver(false);
      if (disabled) return;
      const files = Array.from(e.dataTransfer.files);
      onFiles(files);
    }, [onFiles, disabled]);
  
    const handleDragOver = useCallback((e) => {
      e.preventDefault();
      if (!disabled) setOver(true);
    }, [disabled]);
  
    const handleChange = useCallback((e) => {
      const files = Array.from(e.target.files);
      onFiles(files);
      e.target.value = '';
    }, [onFiles]);
  
    return (
      <div
        onClick={() => !disabled && inputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={() => setOver(false)}
        style={{
          border: `1.5px dashed ${over ? C.primary : C.border}`,
          borderRadius: 12,
          background: over ? C.tint : C.bg,
          padding: '22px 16px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 6,
          cursor: disabled ? 'not-allowed' : 'pointer',
          transition: 'background .15s, border-color .15s',
          opacity: disabled ? 0.5 : 1,
          userSelect: 'none',
        }}
      >
        {/* Upload icon */}
        <svg viewBox="0 0 40 40" width="36" height="36" fill="none">
          <circle cx="20" cy="20" r="19" fill={C.tint}/>
          <path d="M13 23v2a2 2 0 002 2h10a2 2 0 002-2v-2" stroke={C.primary} strokeWidth="1.6" strokeLinecap="round"/>
          <path d="M20 26V14M16 18l4-4 4 4" stroke={C.primary} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
  
        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: C.text, fontFamily: FONT_BODY }}>
          Drop files here or <span style={{ color: C.primary }}>browse</span>
        </p>
        <p style={{ margin: 0, fontSize: 11, color: C.muted, fontFamily: FONT_BODY, textAlign: 'center' }}>
          PDF, DOCX, TXT, images, video, subtitles · up to {MAX_MB} MB each · max {MAX_FILES} files
        </p>
  
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT_ATTR}
          style={{ display: 'none' }}
          onChange={handleChange}
        />
      </div>
    );
  }
  
  // ─── Main component ───────────────────────────────────────────────────────────
  
  export default function CourseFileUploadModal({ open, onClose, onSkip, onGenerate }) {
    const [files, setFiles] = useState([]);
    const [error, setError] = useState(null);
  
    // Reset on open
    useEffect(() => {
      if (open) {
        setFiles([]);
        setError(null);
      }
    }, [open]);
  
    // Escape to close
    useEffect(() => {
      if (!open) return;
      const h = (e) => { if (e.key === 'Escape') onClose?.(); };
      document.addEventListener('keydown', h);
      return () => document.removeEventListener('keydown', h);
    }, [open, onClose]);
  
    const addFiles = useCallback((incoming) => {
      setError(null);
      setFiles(prev => {
        const combined = [...prev];
        const names    = new Set(prev.map(f => f.name));
  
        for (const f of incoming) {
          if (combined.length >= MAX_FILES) {
            setError(`Maximum ${MAX_FILES} files allowed.`);
            break;
          }
          if (f.size > MAX_MB * 1024 * 1024) {
            setError(`"${f.name}" exceeds ${MAX_MB} MB.`);
            continue;
          }
          if (!names.has(f.name)) {
            combined.push(f);
            names.add(f.name);
          }
        }
        return combined;
      });
    }, []);
  
    const removeFile = useCallback((idx) => {
      setFiles(prev => prev.filter((_, i) => i !== idx));
      setError(null);
    }, []);
  
    const handleGenerate = useCallback(() => {
      onGenerate?.(files);
    }, [files, onGenerate]);
  
    const handleBackdrop = useCallback((e) => {
      if (e.target === e.currentTarget) onClose?.();
    }, [onClose]);
  
    if (!open) return null;
  
    const atLimit = files.length >= MAX_FILES;
  
    return createPortal(
      <div
        onClick={handleBackdrop}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(28,31,58,.45)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          padding: '16px',
        }}
      >
        <div style={{
          background: C.white,
          borderRadius: 18,
          width: '100%',
          maxWidth: 480,
          boxShadow: '0 8px 40px rgba(28,31,58,.14)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}>
          {/* ── Header ── */}
          <div style={{
            padding: '20px 24px 16px',
            borderBottom: `1px solid ${C.border}`,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 12,
          }}>
            {/* Icon */}
            <div style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: C.tint,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}>
              <svg viewBox="0 0 20 20" width="20" height="20" fill="none">
                <path d="M4 4a2 2 0 012-2h6l4 4v10a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"
                  stroke={C.primary} strokeWidth="1.5" strokeLinejoin="round"/>
                <path d="M12 2v4h4" stroke={C.primary} strokeWidth="1.5" strokeLinejoin="round"/>
                <path d="M8 11h4M8 13.5h2.5" stroke={C.primary} strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
            </div>
  
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 style={{
                margin: 0,
                fontSize: 16,
                fontWeight: 700,
                color: C.text,
                fontFamily: FONT_DISPLAY,
                lineHeight: 1.3,
              }}>
                Enrich with your materials
              </h2>
              <p style={{
                margin: '3px 0 0',
                fontSize: 12.5,
                color: C.sub,
                fontFamily: FONT_BODY,
                lineHeight: 1.45,
              }}>
                Upload files to give the AI more context. This step is optional.
              </p>
            </div>
  
            {/* Close */}
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 4,
                borderRadius: 6,
                color: C.muted,
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
              }}
              onMouseEnter={e => e.currentTarget.style.color = C.text}
              onMouseLeave={e => e.currentTarget.style.color = C.muted}
            >
              <svg viewBox="0 0 16 16" width="16" height="16" fill="none">
                <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
  
          {/* ── Body ── */}
          <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
  
            {/* Drop zone */}
            <DropZone onFiles={addFiles} disabled={atLimit} />
  
            {/* Error */}
            {error && (
              <p style={{
                margin: 0,
                fontSize: 12,
                color: C.error,
                fontFamily: FONT_BODY,
                padding: '6px 10px',
                background: '#FEF2F2',
                borderRadius: 8,
              }}>
                {error}
              </p>
            )}
  
            {/* File list */}
            {files.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
                {files.map((f, i) => (
                  <FileRow key={`${f.name}-${i}`} file={f} onRemove={() => removeFile(i)} />
                ))}
              </div>
            )}
  
            {/* Counter badge */}
            {files.length > 0 && (
              <p style={{
                margin: 0,
                fontSize: 11.5,
                color: C.sub,
                fontFamily: FONT_BODY,
                display: 'flex',
                alignItems: 'center',
                gap: 5,
              }}>
                <svg viewBox="0 0 16 16" width="13" height="13" fill="none">
                  <circle cx="8" cy="8" r="7" stroke={C.muted} strokeWidth="1.3"/>
                  <path d="M8 7v4M8 5.5v.5" stroke={C.muted} strokeWidth="1.3" strokeLinecap="round"/>
                </svg>
                {files.length} / {MAX_FILES} files added
              </p>
            )}
          </div>
  
          {/* ── Footer ── */}
          <div style={{
            padding: '14px 24px 20px',
            borderTop: `1px solid ${C.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
          }}>
            {/* Skip */}
            <button
              onClick={onSkip}
              style={{
                background: 'none',
                border: `1px solid ${C.border}`,
                borderRadius: 10,
                padding: '9px 18px',
                fontSize: 13,
                fontWeight: 500,
                color: C.sub,
                fontFamily: FONT_BODY,
                cursor: 'pointer',
                transition: 'border-color .15s, color .15s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = C.muted;
                e.currentTarget.style.color = C.text;
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = C.border;
                e.currentTarget.style.color = C.sub;
              }}
            >
              Skip for now
            </button>
  
            {/* Generate */}
            <button
              onClick={handleGenerate}
              disabled={files.length === 0}
              style={{
                background: files.length === 0 ? C.tintDeep : C.primary,
                border: 'none',
                borderRadius: 10,
                padding: '9px 22px',
                fontSize: 13,
                fontWeight: 600,
                color: files.length === 0 ? C.muted : C.white,
                fontFamily: FONT_BODY,
                cursor: files.length === 0 ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                transition: 'background .15s',
              }}
              onMouseEnter={e => { if (files.length > 0) e.currentTarget.style.background = C.primaryDk; }}
              onMouseLeave={e => { if (files.length > 0) e.currentTarget.style.background = C.primary; }}
            >
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
                <path d="M8 1.5l1.91 3.87L14 6.35l-3 2.93.71 4.15L8 11.5l-3.71 1.93.71-4.15L2 6.35l4.09-.98L8 1.5z"
                  fill="currentColor" strokeWidth="0.6" strokeLinejoin="round"/>
              </svg>
              Generate{files.length > 0 ? ` with ${files.length} file${files.length > 1 ? 's' : ''}` : ''}
            </button>
          </div>
        </div>
      </div>,
      document.body,
    );
  }