/**
 * ClassroomPage.tsx  (v16 — source_token wiring + design system)
 *
 * Changes from v15:
 * ─────────────────
 * 1. USAGE PATCH — source_token support
 *    • Reads `source_token` from the URL (?source_token=…) written by
 *      CreateCourseModal when the teacher uploaded files before generation.
 *    • Falls back to sessionStorage key `ai_source_token_${courseId}` (also
 *      written by CreateCourseModal as a belt-and-suspenders backup).
 *    • Passes `sourceToken` into useCourseGeneration so the SSE URL includes
 *      &source_token=… on the first connection (file-grounded generation).
 *    • onComplete now strips BOTH ?ai_outline and ?source_token from the URL
 *      and removes BOTH sessionStorage keys.
 *
 * 2. DESIGN SYSTEM — applied throughout
 *    • Colors: Primary #6C6FEF · Primary Dark #4F52C2 · Tint #EEF0FE ·
 *              Background #F7F7FA · White #FFFFFF
 *    • Soft UI: rounded-xl/2xl (12–16 px), subtle shadows, clean spacing.
 *    • Loading spinner, EmptyLesson, exit-confirm modal all updated.
 *
 * All v15 behaviour is preserved exactly.
 */

import {
  useCallback,
  useMemo,
  useReducer,
  useState,
  useRef,
  useEffect,
} from "react";
import toast from "react-hot-toast";
import { useParams, useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { useCourseGeneration } from "../../hooks/useCourseGeneration";

import ClassroomLayout from "../../components/classroom/ClassroomLayout";
import ClassroomHeader from "../../components/classroom/ClassroomHeader";
import type { ClassroomTab } from "../../components/classroom/ClassroomHeader";
import LessonWorkspace, {
  type LessonWorkspaceProps,
} from "../../components/classroom/lesson/LessonWorkspace";
import HomeworkPlayer from "../../components/classroom/lesson/flow/homework/HomeworkPlayer";
import UnitSelectorModal from "../../components/classroom/unit/UnitSelectorModal";
import type { CreatingUnitMode } from "../../components/classroom/unit/UnitSelectorModal";
import AdditionalMaterialsModal from "../../components/classroom/unit/AdditionalMaterialsModal";
import StudentAnswersPanel from "../../components/classroom/unit/StudentAnswersPanel";
import type { CourseEditData } from "../../components/classroom/unit/EditCourseModal";
import {
  courseToEditModalSeed,
  courseEditDataToUpdatePayload,
} from "../../components/classroom/unit/courseEditSync";
import {
  LessonProgressRail,
  type LessonRailState,
} from "../../components/classroom/lesson/flow/LessonPlayerShared";

import { useClassroom } from "../../hooks/useClassroom";
import { useStudentUnit } from "../../hooks/useStudentUnit";
import { useUnitPresentation } from "../../hooks/useUnitPresentation";
import { useAuth } from "../../hooks/useAuth";
import { useOnlinePresence } from "../../hooks/useOnlinePresence";
import { useTeacherClassroomTransition } from "../../contexts/TeacherClassroomTransitionContext";
import { HomeworkProvider, useHomework } from "../../contexts/HomeworkContext";
import { HomeworkSyncPrefixProvider } from "../../contexts/HomeworkSyncPrefixContext";
import { useHomeworkPersistence } from "../../hooks/useHomeworkPersistence";
import type { InlineMediaBlock } from "../../components/classroom/lesson/useSegmentPersistence";
import type { ClassroomUnit } from "../../hooks/useClassroom";
import type { StudentTask, StudentTest } from "../../hooks/useStudentUnit";

import {
  tasksApi,
  testsApi,
  unitsApi,
  segmentsApi,
  coursesApi,
  homeworkSubmissionApi,
  type UnitMaterialAttachment,
  type HomeworkSubmissionListItemDto,
} from "../../services/api";

import { LiveSessionProvider } from "../../components/classroom/live/LiveSessionProvider";
import { LiveSessionBanner } from "../../components/classroom/live/LiveSessionBanner";
import type { LiveSection } from "../../components/classroom/live/liveSession.types";

// ─── Design tokens (kept here so JSX inline-styles stay consistent) ───────────
const DS = {
  primary:     '#6C6FEF',
  primaryDark: '#4F52C2',
  tint:        '#EEF0FE',
  bg:          '#F7F7FA',
  white:       '#FFFFFF',
} as const;

// Converts raw unit attachment payloads into a stable frontend material shape.
function normalizeUnitMaterials(rawAttachments: unknown): UnitMaterialAttachment[] {
  if (!Array.isArray(rawAttachments)) return [];
  return rawAttachments
    .map((attachment) => {
      // Supports legacy attachments saved as plain string paths.
      if (typeof attachment === "string") {
        const cleanPath = attachment.trim();
        if (!cleanPath) return null;
        const pathPart = cleanPath.split("/").pop() ?? cleanPath;
        const extensionPart = pathPart.includes(".")
          ? pathPart.split(".").pop()?.toLowerCase() ?? "file"
          : "file";
        return {
          name: pathPart,
          path: cleanPath,
          type: extensionPart,
        };
      }
      if (!attachment || typeof attachment !== "object") return null;
      const nextAttachment = attachment as {
        name?: unknown;
        path?: unknown;
        file_path?: unknown;
        original_filename?: unknown;
        filename?: unknown;
        type?: unknown;
      };
      // Accepts both normalized `{name,path}` and upload-response `{original_filename,file_path}`.
      const path =
        typeof nextAttachment.path === "string"
          ? nextAttachment.path
          : typeof nextAttachment.file_path === "string"
            ? nextAttachment.file_path
            : "";
      const fallbackNameFromPath = path.split("/").pop() ?? "";
      const name =
        typeof nextAttachment.name === "string"
          ? nextAttachment.name
          : typeof nextAttachment.original_filename === "string"
            ? nextAttachment.original_filename
            : typeof nextAttachment.filename === "string"
              ? nextAttachment.filename
              : fallbackNameFromPath;
      if (!name || !path) return null;
      const fallbackType =
        name.includes(".") ? name.split(".").pop()?.toLowerCase() ?? "file" : "file";
      return {
        name,
        path,
        type: typeof nextAttachment.type === "string" ? nextAttachment.type : fallbackType,
      };
    })
    .filter((attachment): attachment is UnitMaterialAttachment => attachment !== null);
}

// ─── Lesson progress state machine ────────────────────────────────────────────

type StepState = "idle" | "active" | "complete";

interface LessonProgressState {
  slides: StepState;
  task: StepState;
  test: StepState;
}

function areRailStatesEqual(
  prev: LessonRailState | null,
  next: LessonRailState,
): boolean {
  if (!prev) return false;
  if (prev.activeIndex !== next.activeIndex) return false;
  if (prev.onNavigate !== next.onNavigate) return false;

  const prevItems = prev.items ?? [];
  const nextItems = next.items ?? [];
  if (prevItems.length !== nextItems.length) return false;
  return prevItems.every((p, i) => {
    const n = nextItems[i];
    return (p as any).label === (n as any).label &&
      (p as any).status === (n as any).status;
  });
}

function unitHasLessonContent(
  slidesCount: number,
  slidesLoading: boolean,
  taskCount: number,
  testCount: number,
): boolean {
  return slidesLoading || slidesCount > 0 || taskCount > 0 || testCount > 0;
}

type LessonProgressAction =
  | { type: "SLIDES_STARTED" }
  | { type: "SLIDES_COMPLETE" }
  | { type: "TASK_SUBMITTED" }
  | { type: "TEST_ATTEMPTED" }
  | { type: "RESET" };

function lessonProgressReducer(
  state: LessonProgressState,
  action: LessonProgressAction,
): LessonProgressState {
  switch (action.type) {
    case "SLIDES_STARTED":
      return { ...state, slides: "active" };
    case "SLIDES_COMPLETE":
      return { ...state, slides: "complete" };
    case "TASK_SUBMITTED":
      return { ...state, task: "complete" };
    case "TEST_ATTEMPTED":
      return { ...state, test: "complete" };
    case "RESET":
      return { slides: "idle", task: "idle", test: "idle" };
    default:
      return state;
  }
}

// ─── Error / empty states ─────────────────────────────────────────────────────

function ErrorState({
  message,
  onBack,
}: {
  message: string;
  onBack: () => void;
}) {
  return (
    <div
      className="flex h-screen flex-col items-center justify-center gap-4 px-6"
      style={{ background: DS.bg }}
    >
      <div
        className="flex h-14 w-14 items-center justify-center rounded-2xl"
        style={{ background: DS.tint }}
      >
        <svg className="h-7 w-7" style={{ color: DS.primary }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
        </svg>
      </div>
      <p className="text-base font-semibold text-slate-800">{message}</p>
      <button
        onClick={onBack}
        className="rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:opacity-90 active:scale-95"
        style={{ background: DS.primary }}
      >
        Go back
      </button>
    </div>
  );
}

function EmptyLesson({ unitTitle }: { unitTitle: string }) {
  return (
    <div
      className="mx-auto flex max-w-md flex-col items-center justify-center py-24 text-center"
      style={{ background: 'transparent' }}
    >
      {/* Icon container — uses design system tint */}
      <div
        className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl"
        style={{ background: DS.tint }}
      >
        <svg
          className="h-8 w-8"
          style={{ color: DS.primary }}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.966 8.966 0 0 0-6 2.292m0-14.25v14.25"
          />
        </svg>
      </div>
      <p className="text-base font-semibold text-slate-800">{unitTitle}</p>
      <p className="mt-2 text-sm leading-relaxed text-slate-400">
        Your teacher hasn't added any content to this unit yet.
        <br />
        Check back soon!
      </p>
    </div>
  );
}

// ─── Inner page ───────────────────────────────────────────────────────────────

function ClassroomPageInner({
  courseId,
  isTeacher,
  userId,
  currentUserName,
}: {
  courseId: string;
  isTeacher: boolean;
  userId: number | string | null;
  currentUserName: string;
}) {
  const { unitId } = useParams<{ unitId?: string }>();

  // ── Navigation helpers (declared first — useCourseGeneration closures reference them) ──
  const navigate       = useNavigate();
  const routerLocation = useLocation();
  const classroomBasePath = isTeacher ? '/teacher/classroom' : '/student/classroom';
  const backPath          = isTeacher ? '/admin/courses'     : '/student/classes';

  // ── BLOCK A — AI outline detection & course generation wiring ─────────────
  const [searchParams, setSearchParams] = useSearchParams();

  // Detect ?ai_outline=true written by CreateCourseModal after AI generate
  const isAiOutline     = searchParams.get('ai_outline') === 'true';
  const generationLevel = searchParams.get('level') ?? 'B1';

  // ── source_token — read from URL first, then fall back to sessionStorage ──
  const sourceToken: string | undefined =
    searchParams.get('source_token') ??
    (courseId ? sessionStorage.getItem(`ai_source_token_${courseId}`) : null) ??
    undefined;

  // Read the outline cached in sessionStorage by CreateCourseModal.
  // Shape: { title, units: [{ title, description, sections: [{ title, description }] }] }
  const [courseOutline, setCourseOutline] = useState<any | null>(null);
  useEffect(() => {
    if (!isAiOutline || !courseId) return;
    try {
      const raw = sessionStorage.getItem(`ai_outline_${courseId}`);
      if (raw) setCourseOutline(JSON.parse(raw));
    } catch {
      // ignore parse errors
    }
  }, [isAiOutline, courseId]);

  // Generation hook — start() called from inside UnitSelectorModal  (BLOCK A)
  const courseGen = useCourseGeneration({
    courseId:    courseId ? Number(courseId) : null,
    level:       generationLevel,
    sourceToken,                   // ← NEW: undefined when no files were uploaded
    onUnitDone: (_unitId) => {
      // Silently refresh the unit list so the modal shows fresh content without
      // forcing navigation. The SSE stream keeps running in the background even
      // when the modal is closed and reopened.
      reloadUnits();
    },
    onComplete: () => {
      // ── Strip both ?ai_outline and ?source_token from URL ─────────────────
      setSearchParams(prev => {
        prev.delete('ai_outline');
        prev.delete('source_token');
        return prev;
      });
      // ── Clear outline state so the panel fully dismisses ──────────────────
      setCourseOutline(null);
      // ── Clear both sessionStorage keys ────────────────────────────────────
      if (courseId) {
        sessionStorage.removeItem(`ai_outline_${courseId}`);
        sessionStorage.removeItem(`ai_source_token_${courseId}`);
      }
    },
  });

  // ── Lesson progress state ─────────────────────────────────────────────────
  const [lessonProgress, dispatch] = useReducer(lessonProgressReducer, {
    slides: "idle",
    task: "idle",
    test: "idle",
  });

  const [activeTab, setActiveTab] = useState<ClassroomTab>('lesson');
  const [railState, setRailState] = useState<LessonRailState | null>(null);

  const handleRailStateChange = useCallback((nextState: LessonRailState) => {
    setRailState((prevState) =>
      areRailStatesEqual(prevState, nextState) ? prevState : nextState,
    );
  }, []);

  // ── Current section's real integer segment ID (from the API) ─────────────
  const [currentSectionIntegerId, setCurrentSectionIntegerId] = useState<number | null>(null);
  const handleCurrentSegmentIdChange = useCallback((segmentId: number | null) => {
    setCurrentSectionIntegerId(segmentId);
  }, []);

  const layoutRef = useRef<HTMLDivElement>(null);

  // ── Live session overrides ────────────────────────────────────────────────
  const [liveSlide, setLiveSlide] = useState<number | null>(null);
  const [liveSection, setLiveSection] = useState<LiveSection | null>(null);

  // ── Unit selector modal + teacher builder ─────────────────────────────────
  const [unitSelectorOpen, setUnitSelectorOpen] = useState(false);
  const [sidePanelOpen] = useState(true);
  const [manualBuilderActive, setManualBuilderActive] = useState(false);
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false);
  // Controls visibility of the Additional Materials modal opened from the sidebar.
  const [materialsModalOpen, setMaterialsModalOpen] = useState(false);
  // Stores the materials currently shown in the modal.
  const [materialsModalItems, setMaterialsModalItems] = useState<UnitMaterialAttachment[]>([]);
  // Tracks the modal list fetch state so users can see loading feedback.
  const [materialsLoading, setMaterialsLoading] = useState(false);
  // Tracks in-flight teacher uploads to prevent duplicate submissions.
  const [materialsUploading, setMaterialsUploading] = useState(false);
  // Controls visibility of the teacher-only StudentAnswersPanel (observe student exercise answers)
  const [answersPanelOpen, setAnswersPanelOpen] = useState(false);

  // ── Course data ───────────────────────────────────────────────────────────
  const { state, selectUnit, reloadUnits } = useClassroom(courseId, unitId, isTeacher);
  const {
    classroom,
    course,
    units,
    currentUnit,
    loading: courseLoading,
    error: courseError,
  } = state;

  const { completeTeacherClassroomOpen } = useTeacherClassroomTransition();

  const { items: homeworkItems } = useHomework();

  const [homeworkRoster, setHomeworkRoster] = useState<HomeworkSubmissionListItemDto[]>([]);
  const [homeworkRosterLoading, setHomeworkRosterLoading] = useState(false);

  useEffect(() => {
    if (!isTeacher || !currentUnit?.id) return;
    if (activeTab !== "homework" && !answersPanelOpen) return;
    let cancelled = false;
    setHomeworkRosterLoading(true);
    homeworkSubmissionApi
      .listForTeacher(currentUnit.id)
      .then((rows) => {
        if (!cancelled) {
          setHomeworkRoster(rows);
          setHomeworkRosterLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setHomeworkRosterLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isTeacher, currentUnit?.id, activeTab, answersPanelOpen]);

  useEffect(() => {
    if (!courseLoading) {
      completeTeacherClassroomOpen();
    }
  }, [courseLoading, completeTeacherClassroomOpen]);

  const classroomSessionRef = useRef(0);
  useEffect(() => {
    const session = ++classroomSessionRef.current;
    return () => {
      const ended = session;
      queueMicrotask(() => {
        if (classroomSessionRef.current === ended) {
          completeTeacherClassroomOpen(true);
        }
      });
    };
  }, [completeTeacherClassroomOpen]);

  useEffect(() => {
    if (!exitConfirmOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExitConfirmOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [exitConfirmOpen]);

  // ── Unit detail ───────────────────────────────────────────────────────────
  const {
    unit: unitDetail,
    loading: unitLoading,
    error: unitError,
    reload: reloadUnit,
  } = useStudentUnit(currentUnit?.id ?? null, isTeacher);

  const hw = useHomeworkPersistence({
    unitId: currentUnit?.id ?? null,
    mode: isTeacher ? "teacher" : "student",
    // Enrolled students read homework from unit detail (not from /admin/.../homework)
    studentSourceBlocks: isTeacher ? undefined : unitDetail?.homework_blocks,
  });
  // Persist homework copies without depending on the whole hw object identity
  const { addBlock: addHomeworkBlock } = hw;

  /**
   * Clones a segment exercise block into unit homework_blocks (POST) and opens the homework tab.
   */
  const handleCopyExerciseToHomework = useCallback(
    async (block: InlineMediaBlock) => {
      if (!isTeacher) return;
      const pendingClientId = Math.random().toString(36).slice(2, 12);
      const rawData = block.data;
      const dataClone =
        rawData !== undefined &&
        rawData !== null &&
        typeof rawData === "object"
          ? (JSON.parse(JSON.stringify(rawData)) as Record<string, unknown>)
          : rawData;
      const flowItem: Record<string, unknown> = {
        type: block.kind,
        id: pendingClientId,
        label: block.title ?? block.kind,
        status: "available",
      };
      if (dataClone !== undefined) {
        flowItem.data = dataClone;
      }
      await addHomeworkBlock({
        id: pendingClientId,
        item: flowItem as any,
        copiedFromLesson: true,
      });
      setActiveTab("homework");
    },
    [isTeacher, addHomeworkBlock, setActiveTab],
  );

  // ── Online presence ───────────────────────────────────────────────────────
  const { onlineUsers } = useOnlinePresence({
    classroomId:     typeof courseId === 'string' ? Number(courseId) : courseId,
    currentUserId:   typeof userId   === 'string' ? Number(userId)   : userId,
    currentUserName,
    enabled:         true,
    isTeacher,
  });

  // ── Homework import guards (reset on each navigation) ────────────────────
  const homeworkImportConsumedRef      = useRef(false);
  const homeworkMediaImportConsumedRef = useRef(false);
  useEffect(() => {
    homeworkImportConsumedRef.current      = false;
    homeworkMediaImportConsumedRef.current = false;
  }, [routerLocation.key]);

  // ── Live session callbacks ────────────────────────────────────────────────
  const handleLiveUnitChange = useCallback(
    (newUnitId: number) => {
      const unit = units.find((u) => u.id === newUnitId);
      if (!unit) return;
      selectUnit(unit);
      navigate(`${classroomBasePath}/${courseId}/${newUnitId}`, { replace: true });
    },
    [units, selectUnit, navigate, classroomBasePath, courseId],
  );

  // ── Slides callbacks ──────────────────────────────────────────────────────
  const handleSlidesProgress = useCallback(() => dispatch({ type: "SLIDES_STARTED" }), []);
  const handleSlidesComplete = useCallback(() => dispatch({ type: "SLIDES_COMPLETE" }), []);

  // ── START TEST ─────────────────────────────────────────────────────────────
  const handleStartTest = useCallback(async (testId: number) => {
    return testsApi.startTest(testId);
  }, []);

  // ── LOAD TASK ──────────────────────────────────────────────────────────────
  const handleLoadTask = useCallback(async (taskId: number): Promise<StudentTask> => {
    return tasksApi.getTask(taskId) as Promise<StudentTask>;
  }, []);

  // ── Inline task submission ─────────────────────────────────────────────────
  const handleSubmitTask = useCallback(
    async (payload: { task_id: number; answers: Record<string, unknown> }) => {
      const result = await tasksApi.submitTask(payload.task_id, payload.answers);
      dispatch({ type: "TASK_SUBMITTED" });
      reloadUnit();
      return result;
    },
    [reloadUnit],
  );

  // ── Inline test submission ─────────────────────────────────────────────────
  const handleSubmitTest = useCallback(
    async (payload: { test_id: number; answers: Record<string, string> }) => {
      const submitResult = await testsApi.submitTest(payload.test_id, payload.answers);
      dispatch({ type: "TEST_ATTEMPTED" });
      reloadUnit();
      return submitResult;
    },
    [reloadUnit],
  );

  // ── Legacy fallbacks ───────────────────────────────────────────────────────
  const handleOpenTaskFallback = useCallback(
    (task: StudentTask) => navigate(`/tasks/${task.id}`),
    [navigate],
  );
  const handleOpenTestFallback = useCallback(
    (test: StudentTest) => navigate(`/tests/${test.id}/take`),
    [navigate],
  );

  // ── Slides ────────────────────────────────────────────────────────────────
  const {
    slides: presentationSlides,
    loading: slidesLoading,
    error: slidesError,
    reload: reloadSlides,
  } = useUnitPresentation(currentUnit?.id ?? null, isTeacher);

  // ── Content presence flags ────────────────────────────────────────────────
  const hasPresentationContent = presentationSlides.length > 0 || slidesLoading;
  const hasTaskContent  = (unitDetail?.tasks?.length ?? 0) > 0;
  const hasTestContent  = (unitDetail?.tests?.length ?? 0) > 0;
  const hasAnyContent   = hasPresentationContent || hasTaskContent || hasTestContent;

  const useLessonPlayer = currentUnit != null && unitHasLessonContent(
    presentationSlides.length,
    slidesLoading,
    hasTaskContent ? 1 : 0,
    hasTestContent ? 1 : 0,
  );

  // ── Unit selector modal handlers ──────────────────────────────────────────
  const handleCloseUnitSelector = useCallback(() => setUnitSelectorOpen(false), []);
  const handleOpenUnitSelector  = useCallback(() => setUnitSelectorOpen(true),  []);

  /** Field seeds for EditCourseModal — derived from loaded course row */
  const editCourseSeed = useMemo(() => courseToEditModalSeed(course), [course]);

  /**
   * Persists EditCourseModal fields via PUT /admin/courses/:id and refreshes classroom state.
   */
  const handleEditCourse = useCallback(
    async (data: CourseEditData) => {
      if (!courseId) return;
      try {
        await coursesApi.updateCourse(
          Number(courseId),
          courseEditDataToUpdatePayload(data, course?.settings ?? null),
        );
        toast.success("Курс сохранён");
        reloadUnits();
      } catch (err: unknown) {
        const ax = err as { response?: { data?: { detail?: unknown } } };
        const detail = ax.response?.data?.detail;
        const msg =
          typeof detail === "string"
            ? detail
            : Array.isArray(detail)
              ? JSON.stringify(detail)
              : "Не удалось сохранить курс";
        toast.error(msg);
        throw err;
      }
    },
    [courseId, course?.settings, reloadUnits],
  );

  const handleContentSaved = useCallback(async () => {
    await Promise.all([reloadSlides(), reloadUnit()]);
    setManualBuilderActive(false);
  }, [reloadSlides, reloadUnit]);

  // ── BLOCK B — auto-open modal on empty course or after AI outline ─────────
  const isFirstRun = isTeacher && !courseLoading && units.length === 0;
  useEffect(() => {
    if (isFirstRun || (isAiOutline && isTeacher && !courseLoading)) {
      setUnitSelectorOpen(true);
    }
  }, [isFirstRun, isAiOutline, isTeacher, courseLoading]);

  const handleCreateUnit = useCallback((mode: CreatingUnitMode) => {
    if (mode === "manual") setManualBuilderActive(true);
  }, []);

  const handleAddUnit = useCallback(async () => {
    try {
      const nextOrderIndex = units.length;
      const newUnit = await unitsApi.createUnit({
        title: `Unit ${nextOrderIndex + 1}`,
        level: 'A1',
        course_id: Number(courseId),
        order_index: nextOrderIndex,
      } as any);
      navigate(`${classroomBasePath}/${courseId}/${newUnit.id}`, { replace: false });
    } catch (err) {
      console.error('[handleAddUnit] failed to create unit:', err);
    }
  }, [units.length, courseId, classroomBasePath, navigate]);

  const generatingUnitIdRef = useRef<number | null>(null);

  const handleCreateAndGenerate = useCallback(async (): Promise<{ id: number; title: string } | null> => {
    try {
      const nextOrderIndex = units.length;
      const newUnit = await unitsApi.createUnit({
        title: `Unit ${nextOrderIndex + 1}`,
        level: 'A1',
        course_id: Number(courseId),
        order_index: nextOrderIndex,
      } as any);

      try {
        const existingSegments = await segmentsApi.listSegments(newUnit.id);
        await Promise.all(existingSegments.map((s: any) => segmentsApi.deleteSegment(s.id)));
      } catch (cleanupErr) {
        console.warn('[handleCreateAndGenerate] Could not clean up default segments:', cleanupErr);
      }

      generatingUnitIdRef.current = newUnit.id;
      return { id: newUnit.id, title: newUnit.title ?? `Unit ${nextOrderIndex + 1}` };
    } catch (err) {
      console.error('[handleCreateAndGenerate] failed to create unit:', err);
      return null;
    }
  }, [units.length, courseId]);

  const handleFinishUnit = useCallback(() => {}, []);
  // Opens the Additional Materials modal from the side panel "Additional materials" button.
  const handlePanelExtra = useCallback(() => {
    setMaterialsModalOpen(true);
  }, []);

  // Keeps local modal materials synchronized with the latest loaded unit payload.
  useEffect(() => {
    setMaterialsModalItems(normalizeUnitMaterials(unitDetail?.attachments));
  }, [currentUnit?.id, unitDetail?.attachments]);

  // Refetches materials from API whenever the materials modal is opened.
  useEffect(() => {
    if (!materialsModalOpen) return;
    if (!currentUnit?.id) return;
    // Prevents stale state writes if the user closes the modal quickly.
    let cancelled = false;
    // Loads the freshest attachment list so users see newly uploaded files immediately.
    const refreshMaterials = async () => {
      setMaterialsLoading(true);
      try {
        const unitData = isTeacher
          ? await unitsApi.getAdminUnit(currentUnit.id)
          : await unitsApi.getUnit(currentUnit.id);
        if (cancelled) return;
        setMaterialsModalItems(normalizeUnitMaterials((unitData as any)?.attachments));
      } catch (error) {
        if (!cancelled) {
          console.error("[ClassroomPage] Failed to refresh unit materials", error);
          toast.error("Could not load materials.");
        }
      } finally {
        if (!cancelled) setMaterialsLoading(false);
      }
    };
    void refreshMaterials();
    return () => {
      cancelled = true;
    };
  }, [materialsModalOpen, currentUnit?.id, isTeacher]);

  // Uploads teacher-selected files, persists attachments on the unit, then reloads unit data.
  const handleUploadUnitMaterials = useCallback(
    async (files: File[]) => {
      if (!isTeacher) return;
      if (!currentUnit?.id) {
        toast.error("Open a unit before uploading materials.");
        return;
      }
      if (files.length === 0) return;
      setMaterialsUploading(true);
      try {
        const uploadedMaterials = await Promise.all(
          files.map((file) => unitsApi.uploadUnitMaterialFile(file)),
        );
        const existingMaterials = normalizeUnitMaterials(unitDetail?.attachments);
        const mergedMaterials = [...existingMaterials, ...uploadedMaterials].filter(
          (material, index, fullList) =>
            fullList.findIndex((item) => item.path === material.path) === index,
        );
        await unitsApi.saveUnitMaterials(currentUnit.id, mergedMaterials);
        // Updates modal state immediately after successful save.
        setMaterialsModalItems(mergedMaterials);
        await reloadUnit();
        toast.success(
          uploadedMaterials.length === 1
            ? "Material uploaded."
            : `${uploadedMaterials.length} materials uploaded.`,
        );
      } catch (error) {
        console.error("[ClassroomPage] Failed to upload unit materials", error);
        toast.error("Could not upload materials.");
      } finally {
        setMaterialsUploading(false);
      }
    },
    [isTeacher, currentUnit?.id, unitDetail?.attachments, reloadUnit],
  );

  // ── Course progress rail ──────────────────────────────────────────────────
  const completedUnitIds = useMemo(
    () => new Set(units.filter((u: any) => u.is_completed).map((u: any) => u.id as number)),
    [units],
  );
  const courseProgress = units.length
    ? Math.round((completedUnitIds.size / units.length) * 100)
    : undefined;

  const lessonRailNode = useMemo(() => {
    const items = railState?.items ?? [];
    if (!railState || items.length === 0) return null;
    return (
      <LessonProgressRail
        items={items}
        activeIndex={railState.activeIndex}
        onNavigate={railState.onNavigate}
        compact
      />
    );
  }, [railState]);

  // ── Navigation ────────────────────────────────────────────────────────────
  const requestExitClassroom = useCallback(() => setExitConfirmOpen(true),  []);
  const cancelExitClassroom  = useCallback(() => setExitConfirmOpen(false), []);

  const confirmExitClassroom = useCallback(() => {
    setExitConfirmOpen(false);
    completeTeacherClassroomOpen(true);
    navigate(backPath);
  }, [backPath, navigate, completeTeacherClassroomOpen]);

  const handleSelectUnit = useCallback(
    (unit: ClassroomUnit) => {
      selectUnit(unit);
      dispatch({ type: "RESET" });
      setRailState(null);
      setActiveTab('lesson');
      navigate(`${classroomBasePath}/${courseId}/${unit.id}`, { replace: true });
    },
    [selectUnit, navigate, classroomBasePath, courseId],
  );

  // ── Navigate to ExerciseDraftsPage in homework mode ───────────────────────
  const handleCreateHomeworkExercise = useCallback(() => {
    const returnTo = routerLocation.pathname + routerLocation.search + routerLocation.hash;
    const s = { returnTo, homeworkMode: true, targetSegmentId: currentSectionIntegerId ?? null };
    sessionStorage.setItem('homeworkExerciseDraftsContext', JSON.stringify(s));
    navigate('/admin/exercises/new', { state: s });
  }, [navigate, routerLocation, currentSectionIntegerId]);

  // ── Import homework exercise when returning from ExerciseDraftsPage ────────
  useEffect(() => {
    if (!isTeacher) return;
    if (!hw.hydrated) return;
    const raw = sessionStorage.getItem('homeworkPendingExercise');
    if (!raw) return;
    if (homeworkImportConsumedRef.current) return;
    homeworkImportConsumedRef.current = true;

    try {
      sessionStorage.removeItem('homeworkPendingExercise');
      const exercise = JSON.parse(raw) as {
        exerciseType: string;
        title: string;
        data?: unknown;
        payloads?: Record<string, unknown>[];
        drafts?: unknown[];
      };

      const id = Math.random().toString(36).slice(2, 12);
      const flowItem: Record<string, unknown> = {
        type: exercise.exerciseType,
        id,
        label: exercise.title,
        status: 'available',
        ...(exercise.data != null ? { data: exercise.data } : {}),
        ...(exercise.payloads?.length ? { ...exercise.payloads[0] } : {}),
      };

      hw.addBlock({ id, item: flowItem as any, copiedFromLesson: false });
      setActiveTab('homework');
    } catch (err) {
      console.error('[ClassroomPage] Failed to import homework exercise', err);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routerLocation.key, isTeacher, hw.hydrated]);

  // ── Import inline media when returning from ExerciseDraftsPage ────────────
  useEffect(() => {
    if (!isTeacher) return;
    if (!hw.hydrated) return;
    const raw = sessionStorage.getItem('homeworkPendingInlineMedia');
    if (!raw) return;
    if (homeworkMediaImportConsumedRef.current) return;
    homeworkMediaImportConsumedRef.current = true;

    try {
      sessionStorage.removeItem('homeworkPendingInlineMedia');
      const parsed = JSON.parse(raw) as {
        mediaBlock: { id: string; kind: "image" | "video" | "audio"; url: string; caption: string };
        targetSectionId?: string | null;
        templateId?: string;
      };

      const { mediaBlock } = parsed;
      if (!mediaBlock) return;

      const id = mediaBlock.id || Math.random().toString(36).slice(2, 12);
      const kindLabel: Record<string, string> = { image: "Image", video: "Video", audio: "Audio" };

      const flowItem = {
        type: "inline_media",
        id,
        mediaKind: mediaBlock.kind,
        url: mediaBlock.url ?? "",
        caption: mediaBlock.caption ?? "",
        label: kindLabel[mediaBlock.kind] ?? "Media",
        status: "available",
      };

      hw.addBlock({ id, item: flowItem as any, copiedFromLesson: false });
      setActiveTab('homework');
    } catch (err) {
      console.error('[ClassroomPage] Failed to import homework media block', err);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routerLocation.key, isTeacher, hw.hydrated]);

  // ── LessonWorkspace props ─────────────────────────────────────────────────
  const lessonWorkspaceProps = useMemo<LessonWorkspaceProps>(
    () => ({
      mode: isTeacher ? ("teacher" as const) : ("student" as const),
      unit: (unitDetail as unknown as LessonWorkspaceProps["unit"]),
      slides: presentationSlides as unknown as LessonWorkspaceProps["slides"],
      slidesLoading,
      slidesError: slidesError ?? undefined,
      loading: courseLoading || (unitLoading && unitDetail == null),
      error: unitError,
      taskSubmission: null,
      testAttempt: lessonProgress.test === "complete" ? { status: "completed" } : null,
      onSlidesProgress: handleSlidesProgress,
      onSlidesComplete: handleSlidesComplete,
      onStartTest: handleStartTest,
      onLoadTask: handleLoadTask,
      onSubmitTask: handleSubmitTask,
      onSubmitTest: handleSubmitTest,
      onOpenTask: handleOpenTaskFallback,
      onOpenTest: handleOpenTestFallback,
      forcedSlide: liveSlide,
      forcedSection: liveSection,
      onRailStateChange: handleRailStateChange,
      currentUnitId: currentUnit?.id ?? null,
      onContentSaved: handleContentSaved,
      onUnitReloaded: reloadUnit,
      startInManualBuilder: manualBuilderActive,
      sidePanelOpen,
      units: units as unknown as LessonWorkspaceProps["units"],
      completedUnitIds,
      courseTitle: course?.title,
      // Cast ensures Unit shape differences between hooks and workspace stay internal.
      onSelectUnit: handleSelectUnit as unknown as LessonWorkspaceProps["onSelectUnit"],
      onAddUnit: handleAddUnit,
      onFinishUnit: handleFinishUnit,
      segmentRefreshKey: state.segmentVersion,
      onExtra: handlePanelExtra,
      onCurrentSegmentIdChange: handleCurrentSegmentIdChange,
      onCopyExerciseToHomework: isTeacher ? handleCopyExerciseToHomework : undefined,
    }),
    [
      isTeacher,
      state.segmentVersion,
      unitDetail,
      presentationSlides,
      slidesLoading,
      slidesError,
      courseLoading,
      unitLoading,
      unitError,
      lessonProgress.test,
      handleSlidesProgress,
      handleSlidesComplete,
      handleStartTest,
      handleLoadTask,
      handleSubmitTask,
      handleSubmitTest,
      handleOpenTaskFallback,
      handleOpenTestFallback,
      liveSlide,
      liveSection,
      handleRailStateChange,
      currentUnit?.id,
      handleContentSaved,
      reloadUnit,
      manualBuilderActive,
      sidePanelOpen,
      units,
      completedUnitIds,
      course?.title,
      handleSelectUnit,
      handleAddUnit,
      handleFinishUnit,
      handlePanelExtra,
      handleCurrentSegmentIdChange,
      handleCopyExerciseToHomework,
    ],
  );

  // ── Workspace renderer ────────────────────────────────────────────────────
  function renderWorkspace() {
    if (courseError) {
      return <ErrorState message={courseError} onBack={requestExitClassroom} />;
    }

    // ── Homework tab ────────────────────────────────────────────────────────
    if (activeTab === 'homework') {
      return (
        <div className="lp-workspace">
          <div className="lp-canvas lp-canvas--hw">
            <HomeworkSyncPrefixProvider
              value={currentUnit?.id != null ? `hwu/${currentUnit.id}/` : null}
            >
              <HomeworkPlayer
                mode={isTeacher ? 'teacher' : 'student'}
                unitId={currentUnit?.id ?? null}
                onAddContent={isTeacher ? () => setActiveTab('lesson') : undefined}
                onCreateExercise={isTeacher ? handleCreateHomeworkExercise : undefined}
                onStartTest={handleStartTest}
                onSubmitTest={handleSubmitTest}
                onSubmitTask={handleSubmitTask}
                onDeleteItem={isTeacher ? hw.deleteBlock : undefined}
                onReorderItem={isTeacher ? hw.reorderBlocks : undefined}
              />
            </HomeworkSyncPrefixProvider>
          </div>
        </div>
      );
    }

    // ── Lesson tab (default) ────────────────────────────────────────────────
    if (useLessonPlayer) {
      const unitLoaded = !courseLoading && !unitLoading && unitDetail != null;
      if (!isTeacher && unitLoaded && !hasAnyContent) {
        return <EmptyLesson unitTitle={unitDetail!.title} />;
      }
      return <LessonWorkspace {...lessonWorkspaceProps} />;
    }

    return <LessonWorkspace {...lessonWorkspaceProps} />;
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <LiveSessionProvider
      classroomId={Number(courseId)}
      role={isTeacher ? "teacher" : "student"}
      userId={userId}
      onUnitChange={handleLiveUnitChange}
      onSlideChange={setLiveSlide}
      onSectionChange={setLiveSection}
    >
      <ClassroomLayout ref={layoutRef}>
        <ClassroomHeader
          classroom={classroom ?? undefined}
          course={course ?? { id: 0, title: "Loading…" }}
          currentUnit={currentUnit}
          units={[]}
          completedUnitIds={completedUnitIds}
          progress={courseProgress}
          onBack={requestExitClassroom}
          lessonRail={lessonRailNode}
          onOpenUnitSelector={handleOpenUnitSelector}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          homeworkCount={homeworkItems.length}
          isTeacher={isTeacher}
          onlineUsers={onlineUsers}
          onToggleAnswersPanel={() => setAnswersPanelOpen((v) => !v)}
          answersPanelOpen={answersPanelOpen}
        />

        <LiveSessionBanner />

        <StudentAnswersPanel
          open={answersPanelOpen}
          onClose={() => setAnswersPanelOpen(false)}
          onlineUsers={onlineUsers}
          teacherUserId={userId}
          variant={activeTab === 'homework' ? 'homework' : 'lesson'}
          unitId={currentUnit?.id ?? null}
          homeworkRoster={homeworkRoster}
          homeworkRosterLoading={homeworkRosterLoading}
          onHomeworkReviewed={() => {
            if (!currentUnit?.id) return;
            void homeworkSubmissionApi
              .listForTeacher(currentUnit.id)
              .then(setHomeworkRoster);
          }}
        />

        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 min-h-0 overflow-hidden flex flex-col"
        >
          {renderWorkspace()}
        </main>
      </ClassroomLayout>

      {/*
        Rendered outside ClassroomLayout so it sits above the layout's z-stack.
        Students use it to switch units; teachers also see creation CTAs when
        no units exist yet.
      */}
      {/* ── BLOCK C — course-level generation wired in ── */}
      <UnitSelectorModal
        open={unitSelectorOpen}
        units={units}
        currentUnitId={currentUnit?.id ?? null}
        onClose={handleCloseUnitSelector}
        onSelectUnit={handleSelectUnit}
        courseTitle={course?.title}
        courseThumbnailUrl={course?.thumbnail_url ?? undefined}
        isTeacher={isTeacher}
        onCreateUnit={handleCreateUnit}
        generateUnitId={undefined}
        generateUnitTitle={undefined}
        onCreateAndGenerate={handleCreateAndGenerate}
        onEditCourse={isTeacher ? handleEditCourse : undefined}
        editCourseDescription={editCourseSeed.initialDescription}
        editCourseLanguage={editCourseSeed.initialLanguage}
        editCourseSectionsEnabled={editCourseSeed.initialSectionsEnabled}
        editCourseAge={editCourseSeed.initialAge}
        editCourseLevel={editCourseSeed.initialLevel}
        editCourseType={editCourseSeed.initialType}
        onGenerateSuccess={() => {
          setUnitSelectorOpen(false);
          const newUnitId = generatingUnitIdRef.current;
          generatingUnitIdRef.current = null;
          if (newUnitId) {
            navigate(`${classroomBasePath}/${courseId}/${newUnitId}`, { replace: false });
          } else {
            Promise.all([reloadSlides(), reloadUnit()]);
          }
        }}
        courseOutline={courseOutline}
        unitGenerationStatuses={courseGen.unitStatuses}
        isGeneratingCourse={courseGen.isStreaming}
        onStartCourseGeneration={courseGen.start}
        courseId={courseId ? Number(courseId) : null}
        onEditOutline={(updatedOutline) => {
          // Update in-memory state so CourseGenerationPanel re-renders immediately
          setCourseOutline(updatedOutline);
          // Persist to sessionStorage so a page refresh still shows the edited outline
          if (courseId) {
            try {
              sessionStorage.setItem(`ai_outline_${courseId}`, JSON.stringify(updatedOutline));
            } catch {
              // ignore storage errors
            }
          }
          // Reload the unit list so the modal's unit titles reflect DB changes
          reloadUnits();
        }}
      />

      {/* ── Additional materials modal — teachers upload, students download ── */}
      <AdditionalMaterialsModal
        open={materialsModalOpen}
        isTeacher={isTeacher}
        unitTitle={currentUnit?.title}
        materials={materialsModalItems}
        loading={materialsLoading}
        uploading={materialsUploading}
        onClose={() => setMaterialsModalOpen(false)}
        onUploadFiles={isTeacher ? handleUploadUnitMaterials : undefined}
      />

      {/* ── Exit confirm dialog — design system styling ─────────────────── */}
      {exitConfirmOpen && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center px-4"
          style={{ background: 'rgba(15, 17, 35, 0.40)', backdropFilter: 'blur(4px)' }}
          role="presentation"
          onClick={cancelExitClassroom}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="exit-classroom-title"
            className="w-full max-w-md p-7"
            style={{
              background: DS.white,
              borderRadius: '16px',
              boxShadow: '0 8px 32px rgba(108, 111, 239, 0.12), 0 2px 8px rgba(0,0,0,0.08)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Icon */}
            <div
              className="mb-4 flex h-11 w-11 items-center justify-center"
              style={{ background: DS.tint, borderRadius: '12px' }}
            >
              <svg className="h-5 w-5" style={{ color: DS.primary }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                  d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
              </svg>
            </div>

            <h2
              id="exit-classroom-title"
              className="text-lg font-semibold text-slate-900"
            >
              Leave classroom?
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">
              {isTeacher
                ? "You will return to your courses. Unsaved changes in open editors may be lost."
                : "You will return to My Classes."}
            </p>

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              {/* Cancel */}
              <button
                type="button"
                onClick={cancelExitClassroom}
                className="rounded-xl px-5 py-2.5 text-sm font-semibold transition-all hover:opacity-80 focus:outline-none focus-visible:ring-2"
                style={{
                  background: DS.bg,
                  color: '#374151',
                  border: '1.5px solid #E5E7EB',
                  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                  // @ts-ignore
                  '--tw-ring-color': DS.tint,
                }}
              >
                Stay
              </button>

              {/* Confirm */}
              <button
                type="button"
                onClick={confirmExitClassroom}
                className="rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:opacity-90 active:scale-95 focus:outline-none focus-visible:ring-2"
                style={{
                  background: DS.primary,
                  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                  // @ts-ignore
                  '--tw-ring-color': DS.tint,
                }}
              >
                Leave
              </button>
            </div>
          </div>
        </div>
      )}
    </LiveSessionProvider>
  );
}

// ─── Page (outer) ─────────────────────────────────────────────────────────────

export default function ClassroomPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const { user, isTeacher: userIsTeacher, loading: authLoading } = useAuth();
  const noCourseBackPath = userIsTeacher ? "/admin/courses" : "/student/classes";

  if (!courseId) {
    return (
      <ErrorState
        message="No course specified in the URL."
        onBack={() => navigate(noCourseBackPath)}
      />
    );
  }

  if (authLoading) {
    return (
      <div
        className="flex h-screen items-center justify-center"
        style={{ background: DS.bg }}
      >
        {/* Design-system spinner — uses primary colour */}
        <div
          className="h-9 w-9 animate-spin rounded-full border-[3px] border-transparent"
          style={{
            borderTopColor: DS.primary,
            borderRightColor: DS.tint,
            borderBottomColor: DS.tint,
            borderLeftColor: DS.tint,
          }}
        />
      </div>
    );
  }

  return (
    <HomeworkProvider>
      <ClassroomPageInner
        courseId={courseId}
        isTeacher={userIsTeacher}
        userId={user?.id ?? null}
        currentUserName={user?.full_name ?? ""}
      />
    </HomeworkProvider>
  );
}