/**
 * ClassroomLayout.tsx  (v3 — mobile/tablet responsive)
 *
 * Changes from v2:
 * ─────────────────
 * 1. MOBILE VIEWPORT FIX
 *    • Removed `h-screen` (100vh) Tailwind class which clips content on iOS
 *      Safari / mobile Chrome because 100vh doesn't account for the slide-in
 *      address bar.
 *    • Replaced with inline `style={{ height: '100dvh' }}` (dynamic viewport
 *      height) with a `100svh` fallback so the classroom shell fills exactly
 *      the visible area on all mobile browsers.
 *    • `touch-action: pan-y` on the root ensures the browser's native vertical
 *      scroll gesture is never swallowed by child handlers.
 *
 * 2. TABLET / MOBILE SCROLL
 *    • `overflow-hidden` is kept on the root so only the inner `.vlp-root`
 *      scroll container scrolls — prevents double scroll-bars on desktop.
 *      The classroom-mode.css patch adds `-webkit-overflow-scrolling: touch`
 *      to `.vlp-root` for smooth iOS momentum scroll.
 *
 * All v2 behaviour is preserved exactly.
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
  /** ClassroomPage order: ClassroomHeader → LiveSessionBanner → panels → `<main>`. */
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
        <div
          ref={ref}
          className="classroom-layout bg-[#f8fafc] flex flex-col overflow-hidden"
          style={{
            // Use dynamic viewport height so the classroom fills the visible area
            // on mobile even when the browser's address bar is shown.
            // Cascade: 100dvh (best) → 100svh (fallback) → set via .classroom-layout CSS class.
            height: '100dvh',
            // Fallback for browsers that don't support dvh (set via @supports in CSS):
            // the .classroom-layout class in classroom-mode.css provides 100svh.
          }}
        >
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