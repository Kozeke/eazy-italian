/**
 * ClassroomLayout.tsx
 *
 * Full-width student classroom layout.
 * Hides the global sidebar and admin/teacher shell while active.
 *
 * Sidebar-hiding mechanism
 * ────────────────────────
 * On mount this component adds the CSS class `classroom-mode` to
 * <body>.  The global stylesheet (or AdminLayout) must hide the
 * sidebar / app-shell nav when that class is present:
 *
 *   body.classroom-mode .app-sidebar,
 *   body.classroom-mode .admin-topbar { display: none !important; }
 *
 * Because AdminLayout renders its sidebar inside its own subtree and
 * classroom pages are rendered at a sibling route level (outside
 * AdminLayout), the simplest approach is the body-class flag —
 * zero prop-drilling, works across any layout boundary.
 *
 * The class is removed automatically on unmount.
 */

import React, { useEffect } from 'react';

interface ClassroomLayoutProps {
  children: React.ReactNode;
}

export default function ClassroomLayout({ children }: ClassroomLayoutProps) {
  // Add/remove classroom-mode body class so global CSS can hide sidebar
  useEffect(() => {
    document.body.classList.add('classroom-mode');
    return () => {
      document.body.classList.remove('classroom-mode');
    };
  }, []);

  return (
    <div className="classroom-layout min-h-screen bg-slate-50">
      {children}
    </div>
  );
}
