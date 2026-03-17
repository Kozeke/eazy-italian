/**
 * TeacherClassroomHeader.tsx
 *
 * Simplified classroom header for the teacher view.
 *
 * Layout:
 *   LEFT  — course thumbnail (if available) + course title
 *   RIGHT — Exit button (log out of classroom, back to courses)
 *
 * No sidebar, no unit selector, no student-facing controls.
 * Sits inside ClassroomLayout which already handles body.classroom-mode
 * to hide the admin sidebar.
 */

import React from 'react';

interface TeacherClassroomHeaderProps {
  course: {
    id: number;
    title: string;
    thumbnail_url?: string | null;
    thumbnail_path?: string | null;
  };
  onExit: () => void;
}

// ── Thumbnail placeholder SVG ────────────────────────────────────────────────
function ThumbnailFallback() {
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect width="40" height="40" rx="8" fill="#EDE9FF"/>
      <path
        d="M10 14a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H12a2 2 0 0 1-2-2V14Z"
        fill="#D4CBFF"
      />
      <rect x="14" y="17" width="12" height="2" rx="1" fill="#9B8FD9"/>
      <rect x="14" y="21" width="8"  height="2" rx="1" fill="#C4BBF0"/>
    </svg>
  );
}

// ── Exit icon ────────────────────────────────────────────────────────────────
function ExitIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      {/* Door with arrow leaving */}
      <path
        d="M6 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M10 11l3-3-3-3M13 8H6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function TeacherClassroomHeader({ course, onExit }: TeacherClassroomHeaderProps) {
  const thumbnailSrc = course.thumbnail_url || course.thumbnail_path
    ? (course.thumbnail_url || `/api/v1/uploads/${course.thumbnail_path}`)
    : null;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700&display=swap');

        .tch-root {
          position: sticky;
          top: 0;
          z-index: 40;
          height: 56px;
          background: #fff;
          border-bottom: 1px solid #F0EDF8;
          display: flex;
          align-items: center;
          padding: 0 20px;
          gap: 12px;
          font-family: 'Sora', system-ui, sans-serif;
        }

        /* ── Left cluster ── */
        .tch-left {
          display: flex;
          align-items: center;
          gap: 11px;
          flex: 1;
          min-width: 0;
        }

        .tch-thumb {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          overflow: hidden;
          flex-shrink: 0;
          border: 1px solid #EDE9FF;
          background: #EDE9FF;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .tch-thumb img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }

        .tch-title {
          font-size: 14px;
          font-weight: 600;
          color: #0f0c1d;
          letter-spacing: -0.2px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .tch-badge {
          flex-shrink: 0;
          padding: 3px 8px;
          border-radius: 20px;
          background: #F4F1FF;
          color: #6C35DE;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.2px;
        }

        /* ── Right: exit button ── */
        .tch-exit {
          flex-shrink: 0;
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 7px 14px;
          border-radius: 10px;
          border: 1.5px solid #EDE9FF;
          background: transparent;
          color: #5C5490;
          font-family: 'Sora', system-ui, sans-serif;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: border-color 0.15s, background 0.15s, color 0.15s, transform 0.12s;
          white-space: nowrap;
        }

        .tch-exit:hover {
          border-color: #0f0c1d;
          color: #0f0c1d;
          background: #F9F8FF;
          transform: translateX(1px);
        }

        .tch-exit:active {
          transform: translateX(0);
        }

        .tch-exit:focus-visible {
          outline: 2px solid #6C35DE;
          outline-offset: 2px;
        }
      `}</style>

      <header className="tch-root">

        {/* Left — thumbnail + title */}
        <div className="tch-left">
          <div className="tch-thumb">
            {thumbnailSrc
              ? <img src={thumbnailSrc} alt="" />
              : <ThumbnailFallback />
            }
          </div>

          <span className="tch-title" title={course.title}>
            {course.title}
          </span>

          <span className="tch-badge">Teacher</span>
        </div>

        {/* Right — exit */}
        <button
          className="tch-exit"
          onClick={onExit}
          type="button"
          aria-label="Exit classroom and return to courses"
        >
          <ExitIcon />
          <span>Exit</span>
        </button>

      </header>
    </>
  );
}