/**
 * TeacherEmptyClassroom.tsx
 *
 * Empty-state card shown when a teacher opens a course that has no units yet.
 * Centered layout, minimal white background, generous spacing — ProgressMe style.
 *
 * Props:
 *   courseTitle  — displayed as context above the card
 *   onCreateMaterial — called when teacher clicks "Create material"
 */

import React from 'react';

interface TeacherEmptyClassroomProps {
  courseTitle?: string;
  onCreateMaterial: () => void;
}

export default function TeacherEmptyClassroom({
  courseTitle,
  onCreateMaterial,
}: TeacherEmptyClassroomProps) {
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700&display=swap');

        @keyframes tec-float {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-8px); }
        }
        @keyframes tec-fade-up {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .tec-root {
          font-family: 'Sora', system-ui, sans-serif;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: calc(100vh - 56px); /* subtract header height */
          padding: 48px 24px;
          background: #fff;
        }

        .tec-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 32px;
          animation: tec-fade-up 0.5s cubic-bezier(0.22, 0.68, 0, 1.1) both;
        }

        /* ── Illustration ── */
        .tec-illustration {
          width: 120px;
          height: 120px;
          animation: tec-float 4s ease-in-out infinite;
        }

        /* ── Text block ── */
        .tec-text {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
          text-align: center;
          max-width: 320px;
        }

        .tec-heading {
          font-size: 22px;
          font-weight: 700;
          color: #0f0c1d;
          letter-spacing: -0.4px;
          line-height: 1.25;
        }

        .tec-sub {
          font-size: 14px;
          font-weight: 400;
          color: #8b85a0;
          line-height: 1.6;
        }

        /* ── CTA button ── */
        .tec-btn {
          position: relative;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 13px 28px;
          border-radius: 14px;
          border: none;
          background: #0f0c1d;
          color: #fff;
          font-family: 'Sora', system-ui, sans-serif;
          font-size: 14px;
          font-weight: 600;
          letter-spacing: -0.1px;
          cursor: pointer;
          transition: background 0.18s, transform 0.15s, box-shadow 0.18s;
          box-shadow: 0 4px 20px rgba(15, 12, 29, 0.18);
          outline: none;
        }

        .tec-btn:hover {
          background: #1e1840;
          transform: translateY(-2px);
          box-shadow: 0 8px 28px rgba(15, 12, 29, 0.24);
        }

        .tec-btn:active {
          transform: translateY(0);
          box-shadow: 0 2px 10px rgba(15, 12, 29, 0.14);
        }

        .tec-btn:focus-visible {
          outline: 2px solid #6C35DE;
          outline-offset: 3px;
        }

        /* ── Decorative dots ── */
        .tec-dots {
          display: flex;
          gap: 6px;
          align-items: center;
        }

        .tec-dot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: #e5e0f5;
        }
      `}</style>

      <div className="tec-root">
        <div className="tec-card">

          {/* Illustration */}
          <svg
            className="tec-illustration"
            viewBox="0 0 120 120"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            {/* Background circle */}
            <circle cx="60" cy="60" r="56" fill="#F4F1FF" />

            {/* Book body */}
            <rect x="28" y="34" width="64" height="52" rx="6" fill="#fff" stroke="#E5DEFF" strokeWidth="2"/>

            {/* Spine */}
            <rect x="28" y="34" width="10" height="52" rx="3" fill="#EDE9FF"/>
            <rect x="28" y="34" width="10" height="52" rx="0" fill="#EDE9FF" style={{borderRadius: '3px 0 0 3px'}}/>

            {/* Lines */}
            <rect x="46" y="48" width="36" height="3" rx="1.5" fill="#E5DEFF"/>
            <rect x="46" y="57" width="28" height="3" rx="1.5" fill="#E5DEFF"/>
            <rect x="46" y="66" width="32" height="3" rx="1.5" fill="#E5DEFF"/>
            <rect x="46" y="75" width="20" height="3" rx="1.5" fill="#E5DEFF"/>

            {/* Plus badge */}
            <circle cx="84" cy="38" r="14" fill="#6C35DE"/>
            <path d="M84 32v12M78 38h12" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"/>
          </svg>

          {/* Text */}
          <div className="tec-text">
            <h2 className="tec-heading">Create learning material</h2>
            <p className="tec-sub">
              This course has no units yet.
              <br />
              Add your first lesson to get started.
            </p>
          </div>

          {/* CTA */}
          <button
            className="tec-btn"
            onClick={onCreateMaterial}
            type="button"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            Create material
          </button>

          {/* Decorative dots */}
          <div className="tec-dots" aria-hidden="true">
            <div className="tec-dot" />
            <div className="tec-dot" style={{ background: '#CFC9EE' }} />
            <div className="tec-dot" />
          </div>

        </div>
      </div>
    </>
  );
}