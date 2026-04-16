/**
 * AiCourseWizard.tsx
 *
 * Full-page form that collects the minimum inputs needed to generate a
 * course outline with AI, then calls the existing backend endpoint.
 *
 * Route context (set by ClassroomPage → MaterialChoiceModal → navigate):
 *   /teacher/classroom/:courseId/:unitId/ai-builder
 *
 * Props:
 *   courseId   — used as course context and for ingest calls
 *   courseTitle — pre-fills the subject field
 *   unitId     — the unit that was just created (from MaterialChoiceModal)
 *   onOutlineReady(outline, config) — parent navigates to CourseOutlineView
 *   onBack     — teacher changed their mind
 *
 * API calls made here:
 *   POST /api/v1/course-builder/generate-outline
 *     { subject, level, native_language, unit_count, extra_instructions }
 *     → CourseOutlineResponse
 *
 *   POST /api/v1/ingest/upload-many  (only when files are attached)
 *     multipart — files + unit_id + course_id
 *
 * Design: editorial / document-like. Wide single-column form, generous
 * whitespace, Sora typeface, nearly-monochrome palette with a single violet
 * accent. Feels like a focused writing tool, not a wizard.
 */

import React, {
    useCallback, useEffect, useRef, useState,
  } from 'react';
  
  // ─── Types ────────────────────────────────────────────────────────────────────
  
  export interface CourseOutline {
    title:       string;
    description: string;
    modules: Array<{
      id:      string;
      title:   string;
      lessons: Array<{ id: string; title: string; objective: string }>;
    }>;
  }
  
  export interface WizardConfig {
    subject:           string;
    unitCount:         number;
    extraInstructions: string;
    level:             string;
    nativeLanguage:    string;
    uploadedFiles:     File[];
  }
  
  interface AiCourseWizardProps {
    courseId:    number;
    courseTitle: string;
    unitId:      number;
    onOutlineReady: (outline: CourseOutline, config: WizardConfig) => void;
    onBack:      () => void;
  }
  
  // ─── Design tokens ────────────────────────────────────────────────────────────
  
  const C = {
    bg:      '#ffffff',
    pageBg:  '#F9F8FF',
    border:  '#E8E4F3',
    text:    '#0f0c1d',
    sub:     '#4a4468',
    muted:   '#8b85a0',
    mutedL:  '#ccc8e0',
    violet:  '#6C35DE',
    violetL: '#EDE9FF',
    violetD: '#4F23B0',
    red:     '#dc2626',
    redL:    '#fef2f2',
  };
  
  // ─── Helpers ──────────────────────────────────────────────────────────────────
  
  function authHeaders(): HeadersInit {
    const t = localStorage.getItem('token');
    return t ? { Authorization: `Bearer ${t}` } : {};
  }
  
  async function generateOutline(config: WizardConfig): Promise<CourseOutline> {
    const res = await fetch('/api/v1/course-builder/generate-outline', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({
        subject:            config.subject,
        level:              config.level,
        native_language:    config.nativeLanguage,
        unit_count:         config.unitCount,
        extra_instructions: config.extraInstructions,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as any).detail || `Server error ${res.status}`);
    }
    return res.json();
  }
  
  async function ingestFiles(unitId: number, courseId: number, files: File[]): Promise<void> {
    // Fire-and-forget — ingest failures shouldn't block outline display.
    // We upload each file individually to /ingest/upload (single-file endpoint).
    const headers = authHeaders() as Record<string, string>;
    await Promise.allSettled(
      files.map((file) => {
        const form = new FormData();
        form.append('file',      file);
        form.append('unit_id',   String(unitId));
        form.append('course_id', String(courseId));
        return fetch('/api/v1/ingest/upload', {
          method: 'POST',
          headers,
          body:   form,
        });
      }),
    );
  }
  
  // ─── Sub-components ───────────────────────────────────────────────────────────
  
  /** Labelled form field wrapper */
  function Field({
    label,
    hint,
    children,
  }: {
    label:    string;
    hint?:    string;
    children: React.ReactNode;
  }) {
    return (
      <div className="acw-field">
        <div className="acw-field-label">{label}</div>
        {hint && <div className="acw-field-hint">{hint}</div>}
        {children}
      </div>
    );
  }
  
  /** Loading overlay shown while the API call is in flight */
  function GeneratingOverlay({ subject }: { subject: string }) {
    const [tick, setTick] = useState(0);
    const messages = [
      'Designing your course structure…',
      'Creating learning modules…',
      'Writing lesson objectives…',
      'Organising the outline…',
      'Almost ready…',
    ];
    useEffect(() => {
      const id = setInterval(() => setTick((t) => t + 1), 1100);
      return () => clearInterval(id);
    }, []);
  
    return (
      <div className="acw-overlay">
        <div className="acw-overlay-card">
          {/* Spinner */}
          <div className="acw-spinner-wrap" aria-hidden="true">
            <div className="acw-spinner-track" />
            <div className="acw-spinner-arc" />
            <span className="acw-spinner-icon">✦</span>
          </div>
  
          <h2 className="acw-overlay-heading">Building outline…</h2>
          <p className="acw-overlay-subject">{subject}</p>
  
          <p key={tick} className="acw-overlay-tick">
            {messages[tick % messages.length]}
          </p>
  
          {/* Shimmer rows */}
          <div className="acw-shimmer-rows">
            {[90, 70, 80].map((w, i) => (
              <div
                key={i}
                className="acw-shimmer-row"
                style={{ width: `${w}%`, animationDelay: `${i * 0.2}s` }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }
  
  // ─── Main component ───────────────────────────────────────────────────────────
  
  export default function AiCourseWizard({
    courseId,
    courseTitle,
    unitId,
    onOutlineReady,
    onBack,
  }: AiCourseWizardProps) {
    // ── Form state ──────────────────────────────────────────────────────────
    const [modules,   setModules]   = useState<number>(4);
    const [focus,     setFocus]     = useState('');
    const [files,     setFiles]     = useState<File[]>([]);
    const [dragging,  setDragging]  = useState(false);
    const [phase,     setPhase]     = useState<'idle' | 'generating' | 'error'>('idle');
    const [errorMsg,  setErrorMsg]  = useState('');
  
    const fileInputRef  = useRef<HTMLInputElement>(null);
    const isRunningRef  = useRef(false);
  
    // ── File handling ───────────────────────────────────────────────────────
    const addFiles = useCallback((incoming: FileList | null) => {
      if (!incoming) return;
      const allowed = Array.from(incoming).filter((f) =>
        f.type === 'application/pdf' ||
        f.name.toLowerCase().endsWith('.docx') ||
        f.type.startsWith('text/')
      );
      setFiles((prev) => {
        const names = new Set(prev.map((f) => f.name));
        return [...prev, ...allowed.filter((f) => !names.has(f.name))];
      });
    }, []);
  
    const removeFile = useCallback((name: string) => {
      setFiles((prev) => prev.filter((f) => f.name !== name));
    }, []);
  
    // ── Submit ──────────────────────────────────────────────────────────────
    const handleBuild = useCallback(async () => {
      if (isRunningRef.current) return;
      isRunningRef.current = true;
      setPhase('generating');
      setErrorMsg('');
  
      const config: WizardConfig = {
        subject:           courseTitle || 'Course',
        unitCount:         modules,
        extraInstructions: focus.trim(),
        level:             'A2',          // sensible default; bypassed language step
        nativeLanguage:    'English',     // sensible default; bypassed language step
        uploadedFiles:     files,
      };
  
      try {
        // Fire file ingest in parallel — non-blocking for the outline call.
        const ingestPromise = files.length > 0
          ? ingestFiles(unitId, courseId, files)
          : Promise.resolve();
  
        const [outline] = await Promise.all([
          generateOutline(config),
          ingestPromise,
        ]);
  
        onOutlineReady(outline, config);
      } catch (err: unknown) {
        isRunningRef.current = false;
        setPhase('error');
        setErrorMsg(
          err instanceof Error
            ? err.message
            : 'Something went wrong. Please try again.',
        );
      }
    }, [courseId, courseTitle, unitId, modules, focus, files, onOutlineReady]);
  
    const handleRetry = useCallback(() => {
      isRunningRef.current = false;
      setPhase('idle');
      setErrorMsg('');
    }, []);
  
    // ── Keyboard shortcut ───────────────────────────────────────────────────
    useEffect(() => {
      const handler = (e: KeyboardEvent) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleBuild();
      };
      window.addEventListener('keydown', handler);
      return () => window.removeEventListener('keydown', handler);
    }, [handleBuild]);
  
    // ── Render ──────────────────────────────────────────────────────────────
    return (
      <>
        {/* ── Styles ── */}
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&display=swap');
  
          /* ── Keyframes ── */
          @keyframes acw-fade-up {
            from { opacity: 0; transform: translateY(18px); }
            to   { opacity: 1; transform: translateY(0); }
          }
          @keyframes acw-fade-in  { from { opacity: 0; } to { opacity: 1; } }
          @keyframes acw-spin     { to { transform: rotate(360deg); } }
          @keyframes acw-shimmer  {
            0%   { background-position: -400px 0; }
            100% { background-position:  400px 0; }
          }
          @keyframes acw-tick-in  {
            from { opacity: 0; transform: translateY(6px); }
            to   { opacity: 1; transform: translateY(0); }
          }
  
          /* ── Page shell ── */
          .acw-root {
            min-height: calc(100vh - 56px);
            background: ${C.pageBg};
            display: flex;
            align-items: flex-start;
            justify-content: center;
            padding: 48px 24px 80px;
            font-family: 'Sora', system-ui, sans-serif;
            animation: acw-fade-up 0.4s cubic-bezier(0.22, 0.68, 0, 1.1) both;
          }
  
          /* ── Centered column ── */
          .acw-col {
            width: 100%;
            max-width: 560px;
            display: flex;
            flex-direction: column;
            gap: 0;
          }
  
          /* ── Back link ── */
          .acw-back {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            background: none;
            border: none;
            color: ${C.muted};
            font-family: 'Sora', system-ui, sans-serif;
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            padding: 0 0 28px;
            transition: color 0.15s;
          }
          .acw-back:hover { color: ${C.text}; }
  
          /* ── Page header ── */
          .acw-heading {
            font-size: 26px;
            font-weight: 800;
            color: ${C.text};
            letter-spacing: -0.5px;
            line-height: 1.2;
            margin-bottom: 6px;
          }
          .acw-subheading {
            font-size: 14px;
            color: ${C.muted};
            font-weight: 400;
            margin-bottom: 40px;
            line-height: 1.6;
          }
          .acw-course-badge {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            background: ${C.violetL};
            color: ${C.violet};
            border-radius: 8px;
            padding: 4px 10px;
            font-size: 12px;
            font-weight: 600;
            margin-bottom: 20px;
            letter-spacing: 0.1px;
          }
  
          /* ── Form fields ── */
          .acw-form {
            display: flex;
            flex-direction: column;
            gap: 28px;
          }
  
          .acw-field {
            display: flex;
            flex-direction: column;
            gap: 6px;
          }
  
          .acw-field-label {
            font-size: 13px;
            font-weight: 700;
            color: ${C.sub};
            letter-spacing: 0.2px;
          }
  
          .acw-field-hint {
            font-size: 12px;
            color: ${C.mutedL};
            font-weight: 400;
            margin-top: -2px;
            margin-bottom: 2px;
          }
  
          /* ── Module count stepper ── */
          .acw-stepper {
            display: flex;
            align-items: center;
            gap: 0;
            background: ${C.bg};
            border: 1.5px solid ${C.border};
            border-radius: 12px;
            overflow: hidden;
            width: fit-content;
            box-shadow: 0 1px 3px rgba(0,0,0,0.04);
          }
          .acw-stepper-btn {
            width: 44px;
            height: 44px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: none;
            border: none;
            cursor: pointer;
            color: ${C.muted};
            font-size: 18px;
            font-weight: 300;
            transition: background 0.14s, color 0.14s;
            font-family: 'Sora', system-ui, sans-serif;
          }
          .acw-stepper-btn:hover:not(:disabled) {
            background: ${C.pageBg};
            color: ${C.violet};
          }
          .acw-stepper-btn:disabled { opacity: 0.35; cursor: not-allowed; }
          .acw-stepper-value {
            width: 52px;
            text-align: center;
            font-size: 18px;
            font-weight: 700;
            color: ${C.text};
            border-left:  1.5px solid ${C.border};
            border-right: 1.5px solid ${C.border};
            height: 44px;
            display: flex;
            align-items: center;
            justify-content: center;
            letter-spacing: -0.5px;
          }
  
          /* Quick-pick chips for module count */
          .acw-chips {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
            margin-top: 10px;
          }
          .acw-chip {
            padding: 5px 14px;
            border-radius: 20px;
            border: 1.5px solid ${C.border};
            background: ${C.bg};
            color: ${C.sub};
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            transition: border-color 0.14s, background 0.14s, color 0.14s;
            font-family: 'Sora', system-ui, sans-serif;
          }
          .acw-chip:hover { border-color: ${C.violet}; color: ${C.violet}; }
          .acw-chip.active {
            border-color: ${C.violet};
            background: ${C.violetL};
            color: ${C.violet};
          }
  
          /* ── Textarea ── */
          .acw-textarea {
            width: 100%;
            background: ${C.bg};
            border: 1.5px solid ${C.border};
            border-radius: 12px;
            padding: 13px 15px;
            color: ${C.text};
            font-family: 'Sora', system-ui, sans-serif;
            font-size: 14px;
            font-weight: 400;
            line-height: 1.6;
            resize: vertical;
            min-height: 88px;
            outline: none;
            transition: border-color 0.15s, box-shadow 0.15s;
          }
          .acw-textarea::placeholder { color: ${C.mutedL}; font-style: italic; }
          .acw-textarea:focus {
            border-color: ${C.violet};
            box-shadow: 0 0 0 3px ${C.violetL};
          }
  
          /* ── Upload zone ── */
          .acw-upload-zone {
            border: 2px dashed ${C.border};
            border-radius: 12px;
            padding: 22px 20px;
            text-align: center;
            cursor: pointer;
            transition: border-color 0.15s, background 0.15s;
            background: ${C.bg};
          }
          .acw-upload-zone:hover,
          .acw-upload-zone.drag {
            border-color: ${C.violet};
            background: ${C.violetL};
          }
          .acw-upload-icon {
            font-size: 24px;
            margin-bottom: 8px;
            display: block;
          }
          .acw-upload-text {
            font-size: 13px;
            color: ${C.sub};
            font-weight: 500;
            line-height: 1.6;
          }
          .acw-upload-cta {
            color: ${C.violet};
            font-weight: 700;
            text-decoration: underline;
            text-underline-offset: 2px;
          }
          .acw-upload-hint {
            font-size: 11px;
            color: ${C.mutedL};
            margin-top: 4px;
          }
  
          /* File list */
          .acw-file-list {
            display: flex;
            flex-direction: column;
            gap: 6px;
            margin-top: 10px;
          }
          .acw-file-row {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 12px;
            background: ${C.bg};
            border: 1.5px solid ${C.border};
            border-radius: 9px;
            animation: acw-fade-in 0.2s both;
          }
          .acw-file-name {
            flex: 1;
            font-size: 12px;
            font-weight: 500;
            color: ${C.sub};
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .acw-file-remove {
            width: 22px;
            height: 22px;
            border: none;
            background: none;
            cursor: pointer;
            color: ${C.mutedL};
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 6px;
            flex-shrink: 0;
            transition: background 0.13s, color 0.13s;
            font-family: 'Sora', system-ui, sans-serif;
          }
          .acw-file-remove:hover { background: ${C.pageBg}; color: ${C.red}; }
  
          /* ── Divider ── */
          .acw-divider {
            height: 1px;
            background: ${C.border};
            margin: 4px 0;
          }
  
          /* ── CTA button ── */
          .acw-cta {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 9px;
            padding: 15px 32px;
            border-radius: 14px;
            border: none;
            background: ${C.text};
            color: #fff;
            font-family: 'Sora', system-ui, sans-serif;
            font-size: 15px;
            font-weight: 700;
            letter-spacing: -0.2px;
            cursor: pointer;
            transition: background 0.16s, transform 0.13s, box-shadow 0.16s;
            box-shadow: 0 4px 20px rgba(15,12,29,.18);
            margin-top: 8px;
            width: 100%;
          }
          .acw-cta:hover:not(:disabled) {
            background: #1e1840;
            transform: translateY(-2px);
            box-shadow: 0 8px 28px rgba(15,12,29,.22);
          }
          .acw-cta:active:not(:disabled) { transform: translateY(0); }
          .acw-cta:disabled {
            opacity: 0.5;
            cursor: not-allowed;
          }
          .acw-cta-hint {
            text-align: center;
            font-size: 11px;
            color: ${C.mutedL};
            margin-top: 10px;
          }
  
          /* ── Error box ── */
          .acw-error {
            padding: 12px 16px;
            border-radius: 12px;
            background: ${C.redL};
            border: 1.5px solid #fca5a5;
            color: ${C.red};
            font-size: 13px;
            font-weight: 500;
            line-height: 1.5;
            display: flex;
            align-items: flex-start;
            gap: 10px;
          }
          .acw-error-retry {
            background: none;
            border: none;
            color: ${C.violet};
            font-family: 'Sora', system-ui, sans-serif;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            padding: 0;
            white-space: nowrap;
            flex-shrink: 0;
            margin-top: 1px;
            text-decoration: underline;
            text-underline-offset: 2px;
          }
  
          /* ── Generating overlay ── */
          .acw-overlay {
            position: fixed;
            inset: 0;
            background: rgba(249,248,255,0.92);
            backdrop-filter: blur(6px);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 9999;
            padding: 24px;
            animation: acw-fade-in 0.2s ease both;
            font-family: 'Sora', system-ui, sans-serif;
          }
          .acw-overlay-card {
            background: ${C.bg};
            border-radius: 24px;
            box-shadow:
              0 0 0 1px rgba(15,12,29,.06),
              0 24px 64px rgba(15,12,29,.12);
            padding: 44px 40px;
            max-width: 420px;
            width: 100%;
            text-align: center;
            animation: acw-fade-up 0.3s cubic-bezier(0.22,0.68,0,1.1) both;
          }
  
          .acw-spinner-wrap {
            position: relative;
            width: 64px;
            height: 64px;
            margin: 0 auto 28px;
          }
          .acw-spinner-track {
            position: absolute;
            inset: 0;
            border-radius: 50%;
            border: 4px solid ${C.border};
          }
          .acw-spinner-arc {
            position: absolute;
            inset: 0;
            border-radius: 50%;
            border: 4px solid transparent;
            border-top-color: ${C.violet};
            animation: acw-spin 0.9s linear infinite;
          }
          .acw-spinner-icon {
            position: absolute;
            inset: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 20px;
            color: ${C.violet};
          }
  
          .acw-overlay-heading {
            font-size: 22px;
            font-weight: 800;
            color: ${C.text};
            letter-spacing: -0.4px;
            margin-bottom: 6px;
          }
          .acw-overlay-subject {
            font-size: 13px;
            color: ${C.violet};
            font-weight: 600;
            margin-bottom: 18px;
          }
          .acw-overlay-tick {
            font-size: 13px;
            color: ${C.muted};
            font-weight: 400;
            margin-bottom: 28px;
            animation: acw-tick-in 0.3s ease both;
            min-height: 20px;
          }
  
          .acw-shimmer-rows {
            display: flex;
            flex-direction: column;
            gap: 8px;
          }
          .acw-shimmer-row {
            height: 12px;
            border-radius: 6px;
            background: linear-gradient(
              90deg,
              ${C.border} 25%,
              #f0edfc 50%,
              ${C.border} 75%
            );
            background-size: 400px 100%;
            animation: acw-shimmer 1.5s infinite linear;
          }
        `}</style>
  
        {/* ── Generating overlay ── */}
        {phase === 'generating' && (
          <GeneratingOverlay subject={courseTitle || 'your course'} />
        )}
  
        {/* ── Page ── */}
        <div className="acw-root">
          <div className="acw-col">
  
            {/* Back */}
            <button className="acw-back" onClick={onBack} type="button">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M9 2L4 7l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Back
            </button>
  
            {/* Course badge */}
            <span className="acw-course-badge">
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <path d="M6.5 1L7.5 5h4l-3.5 2.5L9 11.5 6.5 9 4 11.5l1-4L1.5 5h4z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
              </svg>
              AI Generation
            </span>
  
            {/* Heading */}
            <h1 className="acw-heading">Generate course with AI</h1>
            <p className="acw-subheading">
              Configure the structure and focus.
              Lessons and slides will be generated later, one at a time.
            </p>
  
            {/* ── Form ── */}
            <div className="acw-form">
  
              {/* 1 — Modules */}
              <Field
                label="Number of modules"
                hint="Each module will contain 2–3 lessons"
              >
                {/* Stepper */}
                <div className="acw-stepper">
                  <button
                    className="acw-stepper-btn"
                    type="button"
                    onClick={() => setModules((n) => Math.max(1, n - 1))}
                    disabled={modules <= 1}
                    aria-label="Decrease module count"
                  >
                    −
                  </button>
                  <div className="acw-stepper-value" aria-live="polite">
                    {modules}
                  </div>
                  <button
                    className="acw-stepper-btn"
                    type="button"
                    onClick={() => setModules((n) => Math.min(12, n + 1))}
                    disabled={modules >= 12}
                    aria-label="Increase module count"
                  >
                    +
                  </button>
                </div>
  
                {/* Quick picks */}
                <div className="acw-chips" role="group" aria-label="Quick pick module count">
                  {[2, 3, 4, 6, 8].map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={`acw-chip ${modules === n ? 'active' : ''}`}
                      onClick={() => setModules(n)}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </Field>
  
              {/* 2 — Special focus */}
              <Field
                label="Special focus"
                hint="Optional — tell the AI what to emphasise"
              >
                <textarea
                  className="acw-textarea"
                  rows={3}
                  placeholder={`e.g. "conversation practice", "business vocabulary", "travel Italian"`}
                  value={focus}
                  onChange={(e) => setFocus(e.target.value)}
                  maxLength={500}
                />
              </Field>
  
              {/* 3 — Upload materials */}
              <Field
                label="Upload materials"
                hint="Optional — AI will reference these when building each lesson"
              >
                {/* Drop zone */}
                <div
                  className={`acw-upload-zone ${dragging ? 'drag' : ''}`}
                  onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    addFiles(e.dataTransfer.files);
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
                  aria-label="Upload materials"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".pdf,.docx,.txt"
                    style={{ display: 'none' }}
                    onChange={(e) => addFiles(e.target.files)}
                    aria-hidden="true"
                  />
                  <span className="acw-upload-icon">
                    {files.length > 0 ? '📂' : '☁️'}
                  </span>
                  <p className="acw-upload-text">
                    Drop <strong>PDF, DOCX, TXT</strong> here or{' '}
                    <span className="acw-upload-cta">browse</span>
                  </p>
                  <p className="acw-upload-hint">Max 50 MB per file</p>
                </div>
  
                {/* File list */}
                {files.length > 0 && (
                  <div className="acw-file-list">
                    {files.map((f) => (
                      <div key={f.name} className="acw-file-row">
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, color: C.muted }}>
                          <path d="M2 2h7l3 3v8H2V2Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
                          <path d="M9 2v3h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                        </svg>
                        <span className="acw-file-name">{f.name}</span>
                        <button
                          className="acw-file-remove"
                          type="button"
                          onClick={() => removeFile(f.name)}
                          aria-label={`Remove ${f.name}`}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </Field>
  
              <div className="acw-divider" />
  
              {/* Error */}
              {phase === 'error' && (
                <div className="acw-error" role="alert">
                  <span style={{ flexShrink: 0 }}>⚠</span>
                  <span style={{ flex: 1 }}>{errorMsg}</span>
                  <button className="acw-error-retry" type="button" onClick={handleRetry}>
                    Try again
                  </button>
                </div>
              )}
  
              {/* CTA */}
              <button
                className="acw-cta"
                type="button"
                onClick={handleBuild}
                disabled={phase === 'generating'}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M8 1l1.5 4.5H14l-4 3 1.5 4.5L8 10.5 4.5 13 6 8.5l-4-3h4.5L8 1Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
                </svg>
                Build course outline
              </button>
  
              <p className="acw-cta-hint">
                ⌘ + Enter to generate
              </p>
  
            </div>
          </div>
        </div>
      </>
    );
  }