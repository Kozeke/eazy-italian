/**
 * TeacherLiveControls.tsx
 *
 * Temporary no-op placeholder so classroom screens compile while the
 * live-teaching control panel is disabled.
 */

// Stores props expected by classroom pages when rendering teacher live controls.
export interface TeacherLiveControlsProps {
  // Stores the id of the currently viewed unit; currently unused in the stub.
  currentUnitId: number | null;
  // Stores total slide count in the current unit; currently unused in the stub.
  totalSlides: number;
  // Stores whether the current unit has at least one task; currently unused in the stub.
  hasTask?: boolean;
  // Stores whether the current unit has at least one test; currently unused in the stub.
  hasTest?: boolean;
}

export default function TeacherLiveControls(_props: TeacherLiveControlsProps) {
  // Prevents layout shift while effectively disabling the live-controls UI.
  return null;
}

