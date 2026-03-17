/**
 * ClassroomLayout.tsx  (v2 — Focused Learning Mode)
 *
 * Full-viewport classroom shell. Adds `classroom-mode` to <body> on mount
 * so that the student sidebar + topbar are hidden via CSS.
 *
 * What's new:
 * ───────────
 * • Semantic `classroom-layout` div now covers the viewport with a clean
 *   off-white bg that matches the student design system.
 * • Exports a stable context so child routes can read the classroom-mode
 *   state without prop-drilling (useful for the live banner, teacher bar etc.)
 * • A thin teal progress underline can optionally be shown at the very top
 *   of the viewport (driven by `progress` prop) — this gives a persistent
 *   global progress signal without cluttering the header.
 */

import React, { createContext, useContext, useEffect, forwardRef } from 'react';

// ─── Context ──────────────────────────────────────────────────────────────────

interface ClassroomModeContextValue {
  isClassroomMode: true;
}

const ClassroomModeContext = createContext<ClassroomModeContextValue>({
  isClassroomMode: true,
});

export function useClassroomMode() {
  return useContext(ClassroomModeContext);
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface ClassroomLayoutProps {
  children: React.ReactNode;
  /** 0–100 — renders a hairline progress bar at the very top edge */
  progress?: number;
}

// ─── Component ────────────────────────────────────────────────────────────────

const ClassroomLayout = forwardRef<HTMLDivElement, ClassroomLayoutProps>(
  ({ children, progress }, ref) => {
    useEffect(() => {
      document.body.classList.add('classroom-mode');
      return () => {
        document.body.classList.remove('classroom-mode');
      };
    }, []);

    const pct = progress !== undefined ? Math.min(100, Math.max(0, progress)) : null;

    return (
      <ClassroomModeContext.Provider value={{ isClassroomMode: true }}>
        <div ref={ref} className="classroom-layout h-screen bg-[#f8fafc] flex flex-col overflow-hidden">
        {/* Global teal progress rail — sits above the sticky header */}
        {pct !== null && (
          <div className="fixed top-0 left-0 right-0 z-50 h-[3px] bg-slate-200/60">
            <div
              className="h-full bg-gradient-to-r from-teal-400 to-teal-600 transition-all duration-700 ease-out"
              style={{ width: `${pct}%` }}
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Course progress"
            />
          </div>
        )}
        {children}
      </div>
    </ClassroomModeContext.Provider>
    );
  }
);

ClassroomLayout.displayName = 'ClassroomLayout';

export default ClassroomLayout;
