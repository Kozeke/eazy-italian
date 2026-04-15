import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

/** Minimum time the LinguAI loading screen stays up after opening a teacher classroom (ms). */
const MIN_TEACHER_CLASSROOM_LOADING_MS = 2800;

type TeacherClassroomTransitionContextValue = {
  /** True while navigating into a teacher classroom until the page finishes loading course data */
  isTeacherClassroomOpening: boolean;
  /** Call immediately before `navigate` to `/teacher/classroom/...` from admin flows */
  startTeacherClassroomOpen: () => void;
  /**
   * Call when teacher `ClassroomPage` has finished its initial course fetch.
   * By default waits until at least {@link MIN_TEACHER_CLASSROOM_LOADING_MS} have passed since `start`.
   * Pass `true` to hide immediately (e.g. on unmount / leave classroom).
   */
  completeTeacherClassroomOpen: (immediate?: boolean) => void;
};

const TeacherClassroomTransitionContext =
  createContext<TeacherClassroomTransitionContextValue | null>(null);

export function TeacherClassroomTransitionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isTeacherClassroomOpening, setOpen] = useState(false);
  const openedAtRef = useRef<number | null>(null);
  const completeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearCompleteTimer = useCallback(() => {
    if (completeTimerRef.current != null) {
      clearTimeout(completeTimerRef.current);
      completeTimerRef.current = null;
    }
  }, []);

  const startTeacherClassroomOpen = useCallback(() => {
    clearCompleteTimer();
    openedAtRef.current = Date.now();
    setOpen(true);
  }, [clearCompleteTimer]);

  const completeTeacherClassroomOpen = useCallback(
    (immediate?: boolean) => {
      if (immediate) {
        clearCompleteTimer();
        openedAtRef.current = null;
        setOpen(false);
        return;
      }

      const started = openedAtRef.current;
      if (started == null) {
        setOpen(false);
        return;
      }

      clearCompleteTimer();
      const elapsed = Date.now() - started;
      const remaining = MIN_TEACHER_CLASSROOM_LOADING_MS - elapsed;

      if (remaining <= 0) {
        openedAtRef.current = null;
        setOpen(false);
        return;
      }

      completeTimerRef.current = setTimeout(() => {
        completeTimerRef.current = null;
        openedAtRef.current = null;
        setOpen(false);
      }, remaining);
    },
    [clearCompleteTimer],
  );

  const value = useMemo(
    () => ({
      isTeacherClassroomOpening,
      startTeacherClassroomOpen,
      completeTeacherClassroomOpen,
    }),
    [
      isTeacherClassroomOpening,
      startTeacherClassroomOpen,
      completeTeacherClassroomOpen,
    ],
  );

  return (
    <TeacherClassroomTransitionContext.Provider value={value}>
      {children}
    </TeacherClassroomTransitionContext.Provider>
  );
}

export function useTeacherClassroomTransition(): TeacherClassroomTransitionContextValue {
  const ctx = useContext(TeacherClassroomTransitionContext);
  if (!ctx) {
    return {
      isTeacherClassroomOpening: false,
      startTeacherClassroomOpen: () => {},
      completeTeacherClassroomOpen: () => {},
    };
  }
  return ctx;
}
