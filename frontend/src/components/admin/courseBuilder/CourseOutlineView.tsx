/**
 * CourseOutlineView.tsx
 *
 * Displays the AI-generated course outline returned by
 * POST /api/v1/course-builder/generate-outline.
 *
 * Shows:
 *   • Course title + description
 *   • Each module as an expandable card
 *   • Each lesson as a row inside its module (title + objective)
 *   • Stats strip: module count, total lesson count
 *
 * Does NOT generate lesson content yet — that is lesson-by-lesson in the
 * next screen (CourseBuildScreen / the existing builder).
 *
 * Props:
 *   outline        — CourseOutlineResponse from the backend
 *   config         — WizardConfig carried forward (subject, unitCount, …)
 *   onStartBuilding(outline, config) — parent navigates to the builder
 *   onBack         — go back to the wizard form
 *
 * Design: same Sora + near-monochrome palette as AiCourseWizard.
 * Module cards use graduated violet-to-warm gradient accents.
 */

import { useState } from 'react';
import type { CourseOutline, WizardConfig } from './AiCourseWizard';

// ─── Re-export for convenience ─────────────────────────────────────────────────
export type { CourseOutline, WizardConfig };

// ─── Props ────────────────────────────────────────────────────────────────────

interface CourseOutlineViewProps {
  outline:          CourseOutline;
  config:           WizardConfig;
  onStartBuilding:  (outline: CourseOutline, config: WizardConfig) => void;
  onBack:           () => void;
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
};

// Gradient accent for each module card header (cycles)
const MODULE_ACCENTS = [
  { from: '#6C35DE', to: '#a855f7' },
  { from: '#0099E6', to: '#6C35DE' },
  { from: '#0DB85E', to: '#0099E6' },
  { from: '#F5A623', to: '#F76D3C' },
  { from: '#F0447C', to: '#F76D3C' },
  { from: '#00BCD4', to: '#0DB85E' },
  { from: '#9333EA', to: '#0099E6' },
  { from: '#F76D3C', to: '#F5A623' },
];

// ─── Module card ──────────────────────────────────────────────────────────────

function ModuleCard({
  module,
  index,
}: {
  module: CourseOutline['modules'][0];
  index:  number;
}) {
  const [open, setOpen] = useState(true);
  const accent = MODULE_ACCENTS[index % MODULE_ACCENTS.length];

  return (
    <div className="cov-module">
      {/* Header */}
      <button
        className="cov-module-header"
        style={{ background: `linear-gradient(135deg, ${accent.from}, ${accent.to})` }}
        onClick={() => setOpen((o) => !o)}
        type="button"
        aria-expanded={open}
      >
        <span className="cov-module-num">{index + 1}</span>

        <div className="cov-module-meta">
          <span className="cov-module-title">{module.title}</span>
          <span className="cov-module-count">
            {module.lessons.length} lesson{module.lessons.length !== 1 ? 's' : ''}
          </span>
        </div>

        <svg
          className="cov-module-chevron"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
        >
          <path d="M4 6l4 4 4-4" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {/* Lesson rows */}
      {open && (
        <div className="cov-lessons">
          {module.lessons.map((lesson, li) => (
            <div key={lesson.id} className="cov-lesson">
              <span className="cov-lesson-num">{li + 1}</span>
              <div className="cov-lesson-body">
                <p className="cov-lesson-title">{lesson.title}</p>
                {lesson.objective && (
                  <p className="cov-lesson-obj">🎯 {lesson.objective}</p>
                )}
              </div>
              <span className="cov-lesson-status">Not generated</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function CourseOutlineView({
  outline,
  config,
  onStartBuilding,
  onBack,
}: CourseOutlineViewProps) {
  const totalLessons = outline.modules.reduce(
    (sum, m) => sum + m.lessons.length,
    0,
  );

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&display=swap');

        @keyframes cov-fade-up {
          from { opacity: 0; transform: translateY(18px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes cov-fade-in { from { opacity: 0; } to { opacity: 1; } }

        /* ── Page shell ── */
        .cov-root {
          min-height: calc(100vh - 56px);
          background: ${C.pageBg};
          font-family: 'Sora', system-ui, sans-serif;
          display: flex;
          flex-direction: column;
        }

        /* ── Hero banner ── */
        .cov-hero {
          background: linear-gradient(135deg, #1A1035 0%, #6C35DE 60%, #F0447C 100%);
          padding: 40px clamp(20px, 5vw, 64px);
          position: relative;
          overflow: hidden;
        }
        .cov-hero::after {
          content: '';
          position: absolute;
          inset: 0;
          background: radial-gradient(ellipse at 80% 50%, rgba(240,68,124,.28) 0%, transparent 60%);
          pointer-events: none;
        }
        .cov-hero-inner {
          max-width: 780px;
          margin: 0 auto;
          position: relative;
          z-index: 1;
          animation: cov-fade-up 0.4s cubic-bezier(0.22,0.68,0,1.1) both;
        }
        .cov-hero-eyebrow {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.55);
          margin-bottom: 12px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .cov-hero-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #a3e635;
          flex-shrink: 0;
        }
        .cov-hero-title {
          font-size: clamp(22px, 3.2vw, 32px);
          font-weight: 800;
          color: #fff;
          letter-spacing: -0.5px;
          line-height: 1.2;
          margin-bottom: 10px;
        }
        .cov-hero-desc {
          font-size: 14px;
          color: rgba(255,255,255,.72);
          line-height: 1.65;
          max-width: 520px;
          margin-bottom: 24px;
          font-weight: 400;
        }

        /* Stats strip */
        .cov-stats {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }
        .cov-stat {
          background: rgba(255,255,255,.14);
          border: 1.5px solid rgba(255,255,255,.2);
          border-radius: 10px;
          padding: 7px 14px;
          display: flex;
          align-items: center;
          gap: 7px;
          backdrop-filter: blur(6px);
        }
        .cov-stat-val {
          font-size: 17px;
          font-weight: 800;
          color: #fff;
          letter-spacing: -0.4px;
        }
        .cov-stat-label {
          font-size: 12px;
          color: rgba(255,255,255,.65);
          font-weight: 400;
        }
        .cov-stat-emoji { font-size: 15px; }

        /* ── Body ── */
        .cov-body {
          flex: 1;
          max-width: 780px;
          width: 100%;
          margin: 0 auto;
          padding: 36px clamp(16px,4vw,40px) 80px;
          animation: cov-fade-up 0.45s 0.1s cubic-bezier(0.22,0.68,0,1.1) both;
        }

        .cov-section-label {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: ${C.mutedL};
          margin-bottom: 16px;
        }

        /* ── Module card ── */
        .cov-module {
          border-radius: 16px;
          overflow: hidden;
          border: 1.5px solid ${C.border};
          background: ${C.bg};
          margin-bottom: 12px;
          animation: cov-fade-in 0.3s both;
          box-shadow: 0 2px 8px rgba(15,12,29,.04);
        }

        .cov-module-header {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 14px 18px;
          cursor: pointer;
          border: none;
          width: 100%;
          text-align: left;
          transition: opacity 0.14s;
        }
        .cov-module-header:hover { opacity: 0.92; }

        .cov-module-num {
          width: 32px;
          height: 32px;
          border-radius: 9px;
          background: rgba(255,255,255,0.2);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          font-weight: 800;
          color: #fff;
          flex-shrink: 0;
        }

        .cov-module-meta {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .cov-module-title {
          font-size: 15px;
          font-weight: 700;
          color: #fff;
          letter-spacing: -0.2px;
          line-height: 1.2;
        }

        .cov-module-count {
          font-size: 11px;
          color: rgba(255,255,255,.65);
          font-weight: 500;
        }

        .cov-module-chevron {
          flex-shrink: 0;
          transition: transform 0.25s cubic-bezier(0.22,0.68,0,1.2);
        }

        /* ── Lesson rows ── */
        .cov-lessons {
          display: flex;
          flex-direction: column;
        }

        .cov-lesson {
          display: flex;
          align-items: flex-start;
          gap: 14px;
          padding: 14px 18px;
          border-top: 1.5px solid ${C.border};
          animation: cov-fade-in 0.25s both;
          transition: background 0.12s;
        }
        .cov-lesson:hover { background: ${C.pageBg}; }

        .cov-lesson-num {
          width: 24px;
          height: 24px;
          border-radius: 7px;
          background: ${C.pageBg};
          border: 1.5px solid ${C.border};
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          font-weight: 700;
          color: ${C.muted};
          flex-shrink: 0;
          margin-top: 1px;
        }

        .cov-lesson-body {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .cov-lesson-title {
          font-size: 14px;
          font-weight: 600;
          color: ${C.text};
          letter-spacing: -0.1px;
          line-height: 1.35;
        }

        .cov-lesson-obj {
          font-size: 12px;
          color: ${C.muted};
          font-weight: 400;
          line-height: 1.5;
        }

        .cov-lesson-status {
          flex-shrink: 0;
          font-size: 11px;
          font-weight: 600;
          color: ${C.mutedL};
          background: ${C.pageBg};
          border: 1.5px solid ${C.border};
          border-radius: 20px;
          padding: 3px 10px;
          white-space: nowrap;
          margin-top: 1px;
        }

        /* ── CTA card ── */
        .cov-cta-card {
          background: ${C.bg};
          border: 1.5px solid ${C.border};
          border-radius: 18px;
          padding: 24px 28px;
          display: flex;
          align-items: center;
          gap: 20px;
          margin-top: 28px;
          box-shadow: 0 4px 20px rgba(108,53,222,.08);
          flex-wrap: wrap;
        }

        .cov-cta-icon {
          width: 52px;
          height: 52px;
          border-radius: 16px;
          background: linear-gradient(135deg, #6C35DE, #F0447C);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 24px;
          flex-shrink: 0;
          box-shadow: 0 6px 20px rgba(108,53,222,.28);
        }

        .cov-cta-text { flex: 1; min-width: 160px; }

        .cov-cta-heading {
          font-size: 16px;
          font-weight: 700;
          color: ${C.text};
          letter-spacing: -0.2px;
          margin-bottom: 4px;
        }

        .cov-cta-sub {
          font-size: 13px;
          color: ${C.muted};
          line-height: 1.55;
          font-weight: 400;
        }

        .cov-cta-btn {
          flex-shrink: 0;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 13px 24px;
          border-radius: 12px;
          border: none;
          background: ${C.text};
          color: #fff;
          font-family: 'Sora', system-ui, sans-serif;
          font-size: 14px;
          font-weight: 700;
          letter-spacing: -0.1px;
          cursor: pointer;
          transition: background 0.15s, transform 0.13s, box-shadow 0.15s;
          box-shadow: 0 4px 16px rgba(15,12,29,.16);
        }
        .cov-cta-btn:hover {
          background: #1e1840;
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(15,12,29,.2);
        }
        .cov-cta-btn:active { transform: translateY(0); }

        /* ── Back link ── */
        .cov-back {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: none;
          border: none;
          color: ${C.mutedL};
          font-family: 'Sora', system-ui, sans-serif;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          padding: 0;
          margin-top: 16px;
          transition: color 0.14s;
        }
        .cov-back:hover { color: ${C.sub}; }
      `}</style>

      <div className="cov-root">

        {/* ── Hero ── */}
        <div className="cov-hero">
          <div className="cov-hero-inner">
            <div className="cov-hero-eyebrow">
              <span className="cov-hero-dot" />
              Course outline · Ready to review
            </div>

            <h1 className="cov-hero-title">{outline.title}</h1>

            {outline.description && (
              <p className="cov-hero-desc">{outline.description}</p>
            )}

            {/* Stats */}
            <div className="cov-stats">
              <div className="cov-stat">
                <span className="cov-stat-emoji">🗂</span>
                <span className="cov-stat-val">{outline.modules.length}</span>
                <span className="cov-stat-label">Modules</span>
              </div>
              <div className="cov-stat">
                <span className="cov-stat-emoji">📖</span>
                <span className="cov-stat-val">{totalLessons}</span>
                <span className="cov-stat-label">Lessons</span>
              </div>
              <div className="cov-stat">
                <span className="cov-stat-emoji">🎞</span>
                <span className="cov-stat-val">TBD</span>
                <span className="cov-stat-label">Slides / lesson</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="cov-body">
          <p className="cov-section-label">Course structure</p>

          {outline.modules.map((mod, i) => (
            <ModuleCard key={mod.id} module={mod} index={i} />
          ))}

          {/* Start building CTA */}
          <div className="cov-cta-card">
            <div className="cov-cta-icon">🚀</div>
            <div className="cov-cta-text">
              <p className="cov-cta-heading">Ready to build lesson by lesson?</p>
              <p className="cov-cta-sub">
                Generate <strong>slides</strong>, <strong>tasks</strong> and a <strong>test</strong> for each lesson individually — at your own pace.
              </p>
            </div>
            <button
              className="cov-cta-btn"
              type="button"
              onClick={() => onStartBuilding(outline, config)}
            >
              Start building
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M5 2l5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>

          {/* Back */}
          <button className="cov-back" type="button" onClick={onBack}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M9 2L4 7l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Back to wizard
          </button>
        </div>
      </div>
    </>
  );
}