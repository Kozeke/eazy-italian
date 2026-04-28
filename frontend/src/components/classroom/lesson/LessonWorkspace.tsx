/**
 * LessonWorkspace.tsx  (v2 — registry architecture)
 *
 * Orchestration layer between ClassroomPage and VerticalLessonPlayer.
 *
 * Heavy logic extracted to:
 *   useSegmentPersistence  — all hydration + autosave (same folder)
 *   mediaTemplateHandlers  — template import dispatch (same folder)
 *   exerciseRegistrations  — exercise type → component map (flow/ folder)
 *
 * This file now only owns:
 *   • flow construction
 *   • rail-state lifting
 *   • item-completion routing
 *   • teacher delete for segment exercises + unit flow rows (videos/tasks/tests/slides)
 *   • navigation to/from ExerciseDraftsPage
 *   • prop assembly for VerticalLessonPlayer
 *
 * The main lesson/homework row uses `px-[var(--classroom-align-gutter)]` so its edges
 * match ClassroomHeader’s pinned strip and the SectionSidePanel column.
 */

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { LayoutGrid } from "lucide-react";

// Register all exercise types before any SectionBlock / FlowItemRenderer mounts
import "./flow/exerciseRegistrations";

import "./lesson-polish.css";
import "./lesson-workspace.css";
import "./flow/lesson-vertical.css";

import { buildLessonFlow, selectPrimaryItem } from "./flow/lessonFlow.builder";
import type { LessonFlow } from "./flow/lessonFlow.types";
import VerticalLessonPlayer from "./flow/VerticalLessonPlayer";
import type { VerticalLessonPlayerProps } from "./flow/VerticalLessonPlayer";
import {
  LessonFlowSkeleton,
  LessonFlowError,
  LessonRailState,
} from "./flow/LessonPlayerShared";
import SectionSidePanel, {
  type Segment as SidePanelSegment,
} from "../unit/SectionSidePanel";
import "../classroom-mode.css";

import {
  useSegmentPersistence,
  getSortedSegments,
  resolveSegmentIdForSection,
  normaliseInlineMediaBlocks,
  type UnitSegment,
  type InlineMediaBlock,
} from "./useSegmentPersistence";
import {
  classroomAnswersApi,
  presentationsApi,
  segmentsApi,
  tasksApi,
  testsApi,
  unitsApi,
  videosApi,
} from "../../../services/api";
import {
  handleMediaTemplateImport,
  type PendingMediaBlock,
} from "./mediaTemplateHandlers";
import {
  SEGMENT_EDITABLE_EXERCISE_KINDS,
  templateIdForSegmentExerciseKind,
} from "../../../pages/admin/exerciseTemplateRegistry";

export type { LessonRailState };

// ─── Supporting types ─────────────────────────────────────────────────────────

export interface LiveSection {
  id: string;
  label: string;
}

export interface ClassroomUnit {
  id: number;
  title: string;
  [key: string]: unknown;
}

// Re-export so callers that previously imported InlineMediaBlock from here still work
export type { InlineMediaBlock };

interface ReviewSlide {
  id: string | number;
  [key: string]: unknown;
}

interface UnitDetail {
  id?: number;
  slides_completed?: boolean;
  viewedSlideIds?: string[];
  presentations?: Array<{ id: number; title?: string; slides?: any[] }>;
  tasks?: any[];
  tests?: any[];
  videos?: Array<{
    id: number | string;
    is_completed?: boolean;
  }>;
  segments?: UnitSegment[];
  [key: string]: unknown;
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface LessonWorkspaceProps {
  mode: "student" | "teacher";
  /** Classroom/course id — used to scope the exercise-answer clear API call. */
  classroomId: number;
  unit: UnitDetail | null;
  slides: ReviewSlide[];
  slidesLoading: boolean;
  slidesError?: string;
  loading: boolean;
  error: string | null;
  /** @deprecated Legacy — ignored */
  taskSubmission: null;
  testAttempt: { status: string } | null;
  onSlidesProgress: () => void;
  onSlidesComplete: () => void;
  onStartTest: (testId: number) => Promise<any>;
  onLoadTask: (taskId: number) => Promise<any>;
  onSubmitTask: (payload: any) => Promise<unknown>;
  onSubmitTest: (payload: any) => Promise<unknown>;
  onOpenTask: (task: any) => void;
  onOpenTest: (test: any) => void;
  forcedSlide: number | null;
  forcedSection: LiveSection | null;
  /** Optional — header `LessonProgressRail` disabled; omit to skip lift to ClassroomPage. */
  onRailStateChange?: (state: LessonRailState) => void;
  currentUnitId: number | null;
  onContentSaved: () => void;
  onUnitReloaded: () => void;
  startInManualBuilder: boolean;
  sidePanelOpen: boolean;
  units: ClassroomUnit[];
  completedUnitIds: Set<number>;
  courseTitle?: string;
  onSelectUnit: (unit: ClassroomUnit) => void;
  onAddUnit: () => void;
  onFinishUnit: () => void;
  onExtra: (key: string) => void;
  /** Called whenever the visible section changes, with the real API integer
   *  segment ID (e.g. 99) for that section.  Use this to pass the correct
   *  segmentId to AIExerciseGeneratorModal or ExerciseDraftsPage. */
  onCurrentSegmentIdChange?: (segmentId: number | null) => void;
  /** Bumped by the parent on every unit selection (even re-selection of the
   *  current unit) so useSegmentPersistence re-fetches fresh segment data. */
  segmentRefreshKey?: number;
  /** Teacher: copy a segment exercise into unit homework (persisted via homework API). */
  onCopyExerciseToHomework?: (block: InlineMediaBlock) => void | Promise<void>;
  /** Teacher: toggles StudentAnswersPanel (live observer for student answers). */
  onToggleAnswersPanel?: () => void;
  /** Teacher: whether StudentAnswersPanel is open — drives the rail button active state. */
  answersPanelOpen?: boolean;
  /** Teacher: set on the answers rail wrapper so StudentAnswersPanel can dock beside the rail button. */
  answersPanelAnchorRef?: RefObject<HTMLDivElement>;
  /** Disables the side panel publish/finish button while the parent runs an async publish. */
  finishUnitActionPending?: boolean;
}

// ─── Flow-building helpers ────────────────────────────────────────────────────

function buildSubmissionsMap(tasks: any[]): Record<string | number, any> {
  const map: Record<string | number, any> = {};
  for (const t of tasks) {
    if (t?.id != null) map[t.id] = t.submission ?? null;
  }
  return map;
}

function buildVideoCompletions(
  videos?: Array<{
    id: number | string;
    is_completed?: boolean;
    [k: string]: unknown;
  }>,
): Record<string, boolean> {
  const map: Record<string, boolean> = {};
  for (const v of videos ?? []) {
    map[String(v.id)] = Boolean(v.is_completed);
  }
  return map;
}

function deriveFlow(
  unit: UnitDetail | null,
  slides: ReviewSlide[],
  testAttempt: LessonWorkspaceProps["testAttempt"],
  forcedSlide: number | null,
): LessonFlow {
  const tasks = unit?.tasks ?? [];
  const videos = unit?.videos;
  const rawTests = unit?.tests ?? [];
  const presentationGroups =
    unit?.presentations && unit.presentations.length > 0
      ? unit.presentations.map((p) => ({
          id: p.id,
          title: p.title,
          slides: p.slides ?? [],
        }))
      : undefined;

  return buildLessonFlow({
    presentationGroups,
    slides: slides as any[],
    slidesPresentationId: unit?.presentations?.[0]?.id ?? null,
    viewedSlideIds: unit?.viewedSlideIds ?? [],
    slidesCompleted: unit?.slides_completed ?? false,
    tasks,
    taskSubmissionsById: buildSubmissionsMap(tasks),
    primaryTest: selectPrimaryItem(rawTests),
    testAttempt,
    videos: videos as any[],
    videoCompletions: buildVideoCompletions(videos),
    forcedSlide,
    locked: false,
  });
}

/**
 * Parses a lesson section key (`section-0`, `section-1`, …) into its numeric index.
 * Used when restoring the visible section after returning from the exercise editor.
 */
function parseLessonSectionIndex(
  sectionId: string | null | undefined,
): number | null {
  if (sectionId == null || typeof sectionId !== "string") return null;
  const match = /^section-(\d+)$/.exec(sectionId);
  if (!match) return null;
  return Number.parseInt(match[1], 10);
}

function buildTeacherProps(
  onContentSaved: () => void,
  onAddContent: (sectionId?: string) => void,
): Pick<VerticalLessonPlayerProps, "onEditSlides" | "onAddContent"> {
  return {
    onEditSlides: (_presentationId?: number) => {
      onContentSaved();
    },
    onAddContent,
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

function LessonWorkspace({
  mode,
  classroomId,
  unit,
  slides,
  slidesLoading,
  slidesError,
  loading,
  error,
  testAttempt,
  onSlidesComplete,
  onStartTest,
  onLoadTask,
  onSubmitTask,
  onSubmitTest,
  onOpenTask,
  onOpenTest,
  forcedSlide,
  onRailStateChange: _onRailStateChangeDisabled,
  onContentSaved,
  onUnitReloaded,
  onFinishUnit,
  sidePanelOpen,
  units,
  currentUnitId,
  completedUnitIds,
  courseTitle,
  onSelectUnit,
  onAddUnit,
  onExtra,
  onCurrentSegmentIdChange,
  segmentRefreshKey = 0,
  onCopyExerciseToHomework,
  onToggleAnswersPanel,
  answersPanelOpen = false,
  answersPanelAnchorRef,
  finishUnitActionPending = false,
}: LessonWorkspaceProps) {
  // Provides localized labels for classroom lesson workspace controls.
  const { t } = useTranslation();
  const pendingInlineMediaStorageKey = "lessonPendingInlineMedia";
  const draftRouteContextStorageKey = "exerciseDraftsRouteContext";
  const routerLocation = useLocation();
  const navigate = useNavigate();
  // Tracks whether the viewport is narrow enough to switch to the mobile single-column classroom layout.
  const [isMobileViewport, setIsMobileViewport] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(max-width: 1023px)").matches;
  });
  // Top of LessonWorkspace component body (around line 208):
  // console.log('[LessonWorkspace] mode prop =', mode);

  const effectiveUnitId = currentUnitId ?? unit?.id ?? null;

  // Drives “Publish unit” vs “Finish unit” in the section panel for draft teacher units.
  const sidePanelFinishVariant = useMemo<"publish" | "finish">(() => {
    if (mode !== "teacher") return "finish";
    const st = (unit as { status?: string } | null | undefined)?.status;
    return st === "draft" ? "publish" : "finish";
  }, [mode, unit]);

  // Keeps the mobile layout flag in sync with viewport resizes.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia("(max-width: 1023px)");
    const syncViewportMode = () => setIsMobileViewport(mediaQuery.matches);
    syncViewportMode();
    mediaQuery.addEventListener("change", syncViewportMode);
    return () => mediaQuery.removeEventListener("change", syncViewportMode);
  }, []);

  // ── Persistence: hydration + autosave ────────────────────────────────────────
  const {
    fetchedSegments,
    refetchSegments,
    inlineMediaBySectionId,
    upsertInlineMediaBlock,
    carouselSlidesBySectionId,
    setCarouselSlidesBySectionId,
    handleInlineMediaChange,
    handleCarouselSlidesChange,
    flush: flushInlineMediaSaves,
    persistSegmentTitleDebounced,
  } = useSegmentPersistence({
    effectiveUnitId,
    mode,
    refreshKey: segmentRefreshKey,
    unitSegments:
      unit?.id === effectiveUnitId
        ? (unit?.segments as UnitSegment[] | undefined)
        : undefined,
  });

  // Build sortedSegments from the hook's fetchedSegments first.
  // Fall back to unit?.segments ONLY when both belong to the same unit —
  // if unit?.id !== effectiveUnitId the unit fetch is still in-flight and
  // unit?.segments holds stale data from the previous unit, which would leak
  // the old unit's media blocks into the new unit's sections.
  const sortedSegments = useMemo(() => {
    if (fetchedSegments.length > 0) return fetchedSegments;
    // Only use the embedded segments when they are confirmed to be for the
    // current unit.  While useStudentUnit is resolving the new unit it
    // briefly sets unit=null, so unit?.id will be undefined — safe to skip.
    if (unit?.id != null && unit.id === effectiveUnitId) {
      return getSortedSegments(unit.segments);
    }
    return [];
  }, [fetchedSegments, unit?.id, unit?.segments, effectiveUnitId]);

  /**
   * Maps the UI section string-key (e.g. "section-0") to the real integer
   * segment ID returned by the API (e.g. 99, 103 …).
   * Use this instead of the raw sectionId whenever you need to call a backend
   * endpoint that expects a segment id.
   */
  const sectionToSegmentIntegerIdMap = useMemo(
    () =>
      sortedSegments.reduce<Record<string, number>>((acc, seg, idx) => {
        acc[`section-${idx}`] = seg.id;
        return acc;
      }, {}),
    [sortedSegments, t],
  );

  const sidePanelSegments = useMemo(
    () =>
      sortedSegments.map((segment) => ({
        id: segment.id,
        title:
          segment.title ??
          t("classroom.lessonWorkspace.sectionLabel", {
            index: segment.order_index ?? 0,
          }),
        order_index: segment.order_index ?? 0,
        status: "draft",
        is_visible_to_students: true,
        videos: [],
        tasks: [],
        tests: [],
        presentations: [],
      })),
    [sortedSegments],
  );

  // ── Pending media state ───────────────────────────────────────────────────────
  const [pendingInlineMedia, setPendingInlineMedia] =
    useState<PendingMediaBlock | null>(null);
  const [
    pendingInlineMediaTargetSectionId,
    setPendingInlineMediaTargetSectionId,
  ] = useState<string | null>(null);

  /**
   * When the teacher returns from an editor page (ExerciseDraftsPage), we store
   * the id of the new / just-edited block here so VerticalLessonPlayer can scroll
   * it into view after React renders the updated section.
   */
  const [pendingScrollToBlockId, setPendingScrollToBlockId] = useState<string | null>(null);

  const exerciseImportConsumedRef = useRef(false);

  // Reset the guard when the unit changes
  useEffect(() => {
    exerciseImportConsumedRef.current = false;
  }, [effectiveUnitId]);

  // ── Section definitions (memoised to avoid spurious VLP effect re-runs) ─────
  // Previously created inline inside the JSX with `.map()`, which produced a new
  // array reference on every render and caused VLP's sections useMemo + effects to
  // fire constantly — including the critical pendingInlineMedia scroll effect, which
  // raced against the clearing effect and missed the target section.
  const sectionDefinitions = useMemo(
    () =>
      sortedSegments.length > 0
        ? sortedSegments.map((segment, index) => ({
            id: `section-${index}`,
            label:
              segment.title ??
              t("classroom.lessonWorkspace.sectionLabel", { index: index + 1 }),
          }))
        : undefined,
    [sortedSegments, t],
  );

  // ── Flow ──────────────────────────────────────────────────────────────────────
  const flow = useMemo(
    () => deriveFlow(unit, slides, testAttempt, forcedSlide),
    [unit, slides, testAttempt, forcedSlide],
  );

  const currentUnitSteps = useMemo(
    () =>
      flow.items
        .filter((item) => item.type !== "divider")
        .map((item) => ({
          label: (item as any).label ?? item.type,
          done: (item as any).status === "completed",
        })),
    [flow.items],
  );

  // ── Section index (vertical lesson scroll) ───────────────────────────────────
  const [visibleSectionIndex, setVisibleSectionIndex] = useState(0);
  // Header LessonProgressRail disabled — was: debounce timer for onRailStateChange lift.
  // const railTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollToSectionRef = useRef<((index: number) => void) | null>(null);

  // Tracks the previous effectiveUnitId so we can detect unit switches without
  // triggering the reset on the initial render (undefined sentinel).
  const prevEffectiveUnitIdRef = useRef<number | null | undefined>(undefined);

  // Reset the visible section to 0 whenever the user navigates to a different
  // unit so the player always opens at the first section of the new unit.
  useEffect(() => {
    if (prevEffectiveUnitIdRef.current === undefined) {
      prevEffectiveUnitIdRef.current = effectiveUnitId;
      return;
    }
    if (effectiveUnitId !== prevEffectiveUnitIdRef.current) {
      setVisibleSectionIndex(0);
      prevEffectiveUnitIdRef.current = effectiveUnitId;
    }
  }, [effectiveUnitId]);

  /**
   * The real integer segment ID (from the API) for the currently visible
   * section. Always use this — not the string "section-N" sectionId — when
   * passing a segment identifier to backend endpoints or to components such
   * as AIExerciseGeneratorModal.
   */
  const currentSectionIntegerId: number | null =
    sectionToSegmentIntegerIdMap[`section-${visibleSectionIndex}`] ?? null;

  // Notify parent whenever the active segment ID changes so it can pass the
  // correct integer segment ID to AIExerciseGeneratorModal / ExerciseDraftsPage.
  useEffect(() => {
    onCurrentSegmentIdChange?.(currentSectionIntegerId);
  }, [currentSectionIntegerId, onCurrentSegmentIdChange]);

  const onNavigate = useCallback((index: number) => {
    setVisibleSectionIndex(index);
    scrollToSectionRef.current?.(index);
  }, []);

  const handleSelectSegment = useCallback(
    (segment: UnitSegment) => {
      const targetIndex = sortedSegments.findIndex((s) => s.id === segment.id);
      if (targetIndex >= 0) {
        onNavigate(targetIndex);
        // NOTE: do NOT call onUnitReloaded() here — navigating between sections
        // is a pure UI scroll. Reloading the unit would reset visibleSectionIndex
        // back to 0 (via parent state updates) immediately after we navigated away.
      }
    },
    [onNavigate, sortedSegments],
  );

  const handleAddSegment = useCallback(async () => {
    if (mode !== "teacher" || !effectiveUnitId) return;
    const orderIndex = sortedSegments.length;
    try {
      await segmentsApi.createSegment(effectiveUnitId, {
        title: t("classroom.lessonWorkspace.sectionLabel", {
          index: orderIndex + 1,
        }),
        order_index: orderIndex,
        status: "published",
        is_visible_to_students: true,
      });
      await refetchSegments();
      onUnitReloaded();
    } catch (err) {
      console.error("[LessonWorkspace] Failed to add section", err);
    }
  }, [
    mode,
    effectiveUnitId,
    sortedSegments.length,
    refetchSegments,
    onUnitReloaded,
    t,
  ]);

  /**
   * Persists a new section order after drag-and-drop in the side panel, then aligns scroll index with the same segment.
   */
  const handleReorderSegments = useCallback(
    async (orderedSegmentIds: number[]) => {
      if (
        mode !== "teacher" ||
        !effectiveUnitId ||
        orderedSegmentIds.length === 0
      )
        return;
      const activeSegmentId = sortedSegments[visibleSectionIndex]?.id ?? null;
      try {
        const payload = orderedSegmentIds.map((id, order_index) => ({
          id,
          order_index,
        }));
        await segmentsApi.reorderSegments(effectiveUnitId, payload);
        await refetchSegments();
        onUnitReloaded();
        if (activeSegmentId != null) {
          const newIndex = orderedSegmentIds.findIndex(
            (id) => id === activeSegmentId,
          );
          if (newIndex >= 0) {
            setVisibleSectionIndex(newIndex);
            requestAnimationFrame(() => scrollToSectionRef.current?.(newIndex));
          }
        }
      } catch (err) {
        console.error("[LessonWorkspace] Failed to reorder sections", err);
      }
    },
    [
      mode,
      effectiveUnitId,
      sortedSegments,
      visibleSectionIndex,
      refetchSegments,
      onUnitReloaded,
    ],
  );

  const handleRemoveSegment = useCallback(
    async (segment: SidePanelSegment) => {
      if (mode !== "teacher") return;
      const deletedIndex = sortedSegments.findIndex((s) => s.id === segment.id);
      const oldLen = sortedSegments.length;
      if (deletedIndex < 0 || oldLen <= 1) return;
      try {
        await segmentsApi.deleteSegment(segment.id);
        await refetchSegments();
        onUnitReloaded();
        let nextIdx = visibleSectionIndex;
        if (deletedIndex < visibleSectionIndex)
          nextIdx = visibleSectionIndex - 1;
        else if (deletedIndex === visibleSectionIndex) {
          nextIdx = Math.min(deletedIndex, oldLen - 2);
        }
        nextIdx = Math.max(0, nextIdx);
        setVisibleSectionIndex(nextIdx);
        requestAnimationFrame(() => scrollToSectionRef.current?.(nextIdx));
      } catch (err) {
        // Log only — parent toast not wired here; avoids silent failure in devtools
        console.error("[LessonWorkspace] Failed to delete section", err);
      }
    },
    [
      mode,
      sortedSegments,
      refetchSegments,
      onUnitReloaded,
      visibleSectionIndex,
    ],
  );

  // Header LessonProgressRail disabled — was: lift flow.items + visibleSectionIndex to ClassroomPage.
  // useEffect(() => {
  //   if (railTimerRef.current) clearTimeout(railTimerRef.current);
  //   railTimerRef.current = setTimeout(() => {
  //     onRailStateChange?.({
  //       items: flow.items,
  //       activeIndex: visibleSectionIndex,
  //       onNavigate,
  //     });
  //   }, 16);
  //   return () => {
  //     if (railTimerRef.current) clearTimeout(railTimerRef.current);
  //   };
  // }, [flow.items, visibleSectionIndex, onNavigate, onRailStateChange]);

  // ── Handlers ──────────────────────────────────────────────────────────────────
  const handleItemCompleted = useCallback(
    (id: string, type: string) => {
      void id;
      if (type === "slides") onSlidesComplete();
      onUnitReloaded();
    },
    [onSlidesComplete, onUnitReloaded],
  );

  const handleFinish = useCallback(() => {
    onFinishUnit();
  }, [onFinishUnit]);

  const handleAddContent = useCallback(
    (sectionId?: string) => {
      flushInlineMediaSaves();
      sessionStorage.removeItem("lessonScrollY");
      const returnTo =
        routerLocation.pathname + routerLocation.search + routerLocation.hash;
      // Resolve the real integer segment ID from the API using the map.
      // Falls back to the current section's integer ID, then the first segment.
      const targetSegmentId: number | null =
        sectionId != null
          ? (sectionToSegmentIntegerIdMap[sectionId] ??
            resolveSegmentIdForSection(sectionId, sortedSegments))
          : (currentSectionIntegerId ?? sortedSegments[0]?.id ?? null);
      sessionStorage.setItem(
        draftRouteContextStorageKey,
        JSON.stringify({
          returnTo,
          targetSectionId: sectionId ?? null,
          targetSegmentId,
        }),
      );
      navigate("/admin/exercises/new", {
        state: {
          returnTo,
          targetSectionId: sectionId ?? null,
          targetSegmentId,
        },
      });
    },
    [
      draftRouteContextStorageKey,
      flushInlineMediaSaves,
      navigate,
      routerLocation,
      sortedSegments,
      sectionToSegmentIntegerIdMap,
      currentSectionIntegerId,
    ],
  );

  const handleDeleteBlock = useCallback(
    async (blockId: string) => {
      if (mode !== "teacher" || !effectiveUnitId) return;

      // Remove a persisted segment JSON block (AI exercises, etc.) via PUT media_blocks.
      for (const [sectionId, blocks] of Object.entries(
        inlineMediaBySectionId,
      )) {
        if (!blocks.some((b) => b.id === blockId)) continue;
        const prunedBlocks = blocks.filter((b) => b.id !== blockId);
        const targetSegmentId = resolveSegmentIdForSection(
          sectionId,
          sortedSegments,
        );
        if (!targetSegmentId) {
          console.warn(
            "[LessonWorkspace] Delete block: could not resolve segment id",
            sectionId,
          );
          return;
        }
        try {
          await segmentsApi.updateSegment(targetSegmentId, {
            media_blocks: normaliseInlineMediaBlocks(prunedBlocks),
          });
          handleInlineMediaChange(sectionId, prunedBlocks);
        } catch (err) {
          console.error(
            "[LessonWorkspace] Failed to delete segment media block",
            err,
          );
        }
        return;
      }

      // Numeric id parsed from synthetic flow item ids (see lessonFlow.builder).
      const videoIdMatch = /^video-(\d+)$/.exec(blockId);
      if (videoIdMatch) {
        const backendVideoId = Number(videoIdMatch[1]);
        try {
          await videosApi.deleteVideo(backendVideoId);
          onUnitReloaded();
        } catch (err) {
          console.error("[LessonWorkspace] Failed to delete video", err);
        }
        return;
      }

      const taskIdMatch = /^task-(\d+)$/.exec(blockId);
      if (taskIdMatch) {
        const backendTaskId = Number(taskIdMatch[1]);
        try {
          await tasksApi.deleteTask(backendTaskId);
          onUnitReloaded();
        } catch (err) {
          console.error("[LessonWorkspace] Failed to delete task", err);
        }
        return;
      }

      const testIdMatch = /^test-(\d+)$/.exec(blockId);
      if (testIdMatch) {
        const backendTestId = Number(testIdMatch[1]);
        try {
          await testsApi.deleteTest(backendTestId);
          onUnitReloaded();
        } catch (err) {
          console.error("[LessonWorkspace] Failed to delete test", err);
        }
        return;
      }

      const presentationIdMatch = /^slides-pres-(\d+)$/.exec(blockId);
      if (presentationIdMatch) {
        const backendPresentationId = Number(presentationIdMatch[1]);
        try {
          await presentationsApi.deletePresentation(backendPresentationId);
          onUnitReloaded();
        } catch (err) {
          console.error("[LessonWorkspace] Failed to delete presentation", err);
        }
        return;
      }

      if (blockId === "slides-main") {
        const slidesItem = flow.items.find((i) => i.type === "slides") as
          | { presentationId?: number }
          | undefined;
        const presentationId = slidesItem?.presentationId;
        if (presentationId == null) return;
        try {
          await presentationsApi.deletePresentation(Number(presentationId));
          onUnitReloaded();
        } catch (err) {
          console.error("[LessonWorkspace] Failed to delete presentation", err);
        }
      }
    },
    [
      mode,
      effectiveUnitId,
      flow.items,
      handleInlineMediaChange,
      inlineMediaBySectionId,
      onUnitReloaded,
      sortedSegments,
    ],
  );

  const handleReorderBlock = useCallback(
    async (blockId: string, direction: "up" | "down") => {
      if (mode !== "teacher") return;

      // Reorder persisted segment media_blocks (custom exercises, etc.)
      for (const [sectionId, blocks] of Object.entries(
        inlineMediaBySectionId,
      )) {
        const blockPosition = blocks.findIndex((b) => b.id === blockId);
        if (blockPosition === -1) continue;
        const swapPosition =
          direction === "up" ? blockPosition - 1 : blockPosition + 1;
        if (swapPosition < 0 || swapPosition >= blocks.length) return;
        const reorderedBlocks = [...blocks];
        const temp = reorderedBlocks[blockPosition];
        reorderedBlocks[blockPosition] = reorderedBlocks[swapPosition];
        reorderedBlocks[swapPosition] = temp;
        handleInlineMediaChange(sectionId, reorderedBlocks);
        return;
      }

      if (!effectiveUnitId) return;

      // Flow items (slides / videos / tasks / tests) — DB only supports reorder within each type
      const nonDividerItems = flow.items.filter((i) => i.type !== "divider");
      const currentIndex = nonDividerItems.findIndex((i) => i.id === blockId);
      if (currentIndex === -1) return;
      const neighborIndex =
        direction === "up" ? currentIndex - 1 : currentIndex + 1;
      if (neighborIndex < 0 || neighborIndex >= nonDividerItems.length) return;

      const currentItem = nonDividerItems[currentIndex] as Record<
        string,
        unknown
      >;
      const neighborItem = nonDividerItems[neighborIndex] as Record<
        string,
        unknown
      >;
      if (currentItem.type !== neighborItem.type) return;

      try {
        if (currentItem.type === "video") {
          const curVideo = (
            currentItem as {
              video?: { id?: number; order_index?: number; order?: number };
            }
          ).video;
          const neighVideo = (
            neighborItem as {
              video?: { id?: number; order_index?: number; order?: number };
            }
          ).video;
          if (curVideo?.id == null || neighVideo?.id == null) return;
          const curOrder = Number(curVideo.order_index ?? curVideo.order ?? 0);
          const neighOrder = Number(
            neighVideo.order_index ?? neighVideo.order ?? 0,
          );
          await unitsApi.reorderUnitContent(effectiveUnitId, {
            videos: [
              { id: Number(curVideo.id), order_index: neighOrder },
              { id: Number(neighVideo.id), order_index: curOrder },
            ],
          });
        } else if (currentItem.type === "task") {
          const curTask = (
            currentItem as { task?: { id?: number; order_index?: number } }
          ).task;
          const neighTask = (
            neighborItem as { task?: { id?: number; order_index?: number } }
          ).task;
          if (curTask?.id == null || neighTask?.id == null) return;
          const curOrder = Number(curTask.order_index ?? 0);
          const neighOrder = Number(neighTask.order_index ?? 0);
          await unitsApi.reorderUnitContent(effectiveUnitId, {
            tasks: [
              { id: Number(curTask.id), order_index: neighOrder },
              { id: Number(neighTask.id), order_index: curOrder },
            ],
          });
        } else if (currentItem.type === "test") {
          const curTest = (
            currentItem as { test?: { id?: number; order_index?: number } }
          ).test;
          const neighTest = (
            neighborItem as { test?: { id?: number; order_index?: number } }
          ).test;
          if (curTest?.id == null || neighTest?.id == null) return;
          const curOrder = Number(curTest.order_index ?? 0);
          const neighOrder = Number(neighTest.order_index ?? 0);
          await unitsApi.reorderUnitContent(effectiveUnitId, {
            tests: [
              { id: Number(curTest.id), order_index: neighOrder },
              { id: Number(neighTest.id), order_index: curOrder },
            ],
          });
        } else {
          return;
        }
        onUnitReloaded();
      } catch (err) {
        console.error(
          "[LessonWorkspace] Failed to reorder unit flow item",
          err,
        );
      }
    },
    [
      mode,
      effectiveUnitId,
      flow.items,
      handleInlineMediaChange,
      inlineMediaBySectionId,
      onUnitReloaded,
    ],
  );

  const handleEditBlock = useCallback(
    (blockId: string) => {
      if (mode !== "teacher") return;

      // Segment section key (`section-2`) that actually owns this block — not the scroll rail index
      let blockSectionId: string | null = null;
      // Persisted segment block so the drafts page can open the right editor with data
      let found: InlineMediaBlock | null = null;
      for (const [sectionId, blocks] of Object.entries(
        inlineMediaBySectionId,
      )) {
        const hit = blocks.find((b) => b.id === blockId);
        if (hit && SEGMENT_EDITABLE_EXERCISE_KINDS.has(hit.kind)) {
          found = hit;
          blockSectionId = sectionId;
          break;
        }
      }
      if (
        !found ||
        !blockSectionId ||
        !templateIdForSegmentExerciseKind(found.kind)
      ) {
        console.warn(
          "[LessonWorkspace] Edit block: no editable segment exercise found for id",
          blockId,
        );
        return;
      }

      flushInlineMediaSaves();
      sessionStorage.removeItem("lessonScrollY");
      const returnTo =
        routerLocation.pathname + routerLocation.search + routerLocation.hash;
      // Integer segment id for APIs — derived from the section that stores the block
      const targetSegmentId: number | null =
        sectionToSegmentIntegerIdMap[blockSectionId] ??
        resolveSegmentIdForSection(blockSectionId, sortedSegments) ??
        sortedSegments[0]?.id ??
        null;

      // Snapshot for ExerciseDraftsPage — avoids a second round-trip to the API
      const editBlockBootstrap = {
        kind: found.kind,
        title: found.title ?? "",
        data:
          found.data &&
          typeof found.data === "object" &&
          !Array.isArray(found.data)
            ? found.data
            : {},
      };

      sessionStorage.setItem(
        draftRouteContextStorageKey,
        JSON.stringify({
          returnTo,
          targetSectionId: blockSectionId,
          targetSegmentId,
          editBlockId: blockId,
          editBlockBootstrap,
        }),
      );
      navigate("/admin/exercises/new", {
        state: {
          returnTo,
          targetSectionId: blockSectionId,
          targetSegmentId,
          editBlockId: blockId,
          editBlockBootstrap,
        },
      });
    },
    [
      mode,
      draftRouteContextStorageKey,
      flushInlineMediaSaves,
      inlineMediaBySectionId,
      navigate,
      routerLocation,
      sectionToSegmentIntegerIdMap,
      sortedSegments,
    ],
  );

  const handleResetBlockAnswers = useCallback(
    async (blockId: string, studentId?: number) => {
      if (!classroomId) return;
      try {
        await classroomAnswersApi.clearBlockAnswers(classroomId, blockId, {
          studentId,
          unitId: effectiveUnitId ?? undefined,
        });
      } catch (err) {
        console.warn("[LessonWorkspace] Failed to clear block answers:", err);
      }
    },
    [classroomId, effectiveUnitId],
  );

  // ── Media import effect (return from ExerciseDraftsPage) ─────────────────────
  useEffect(() => {
    if (mode !== "teacher") return;

    const routeState = routerLocation.state as
      | {
          exerciseImportForTest?: {
            mediaBlock?: PendingMediaBlock;
            customBlock?: InlineMediaBlock;
          };
          targetSectionId?: string | null;
        }
      | undefined;

    const storedImport = (() => {
      const raw = sessionStorage.getItem(pendingInlineMediaStorageKey);
      console.log(
        "[LessonWorkspace] checking lessonPendingInlineMedia on mount:",
        { found: !!raw, raw },
      );

      if (!raw) return null;
      try {
        return JSON.parse(raw) as {
          mediaBlock?: PendingMediaBlock;
          customBlock?: InlineMediaBlock;
          targetSectionId?: string | null;
          templateId?: string;
          /** True when persistCustomLessonBlockToSegment already saved the block
           *  to the server — upsertInlineMediaBlock must be skipped to avoid the
           *  autosave race that would overwrite all other media_blocks. */
          alreadyPersisted?: boolean;
        };
      } catch {
        sessionStorage.removeItem(pendingInlineMediaStorageKey);
        return null;
      }
    })();

    const mediaBlock =
      routeState?.exerciseImportForTest?.mediaBlock ?? storedImport?.mediaBlock;
    const customBlock =
      routeState?.exerciseImportForTest?.customBlock ??
      storedImport?.customBlock;
    // Stores whether router state still carries a section anchor even when
    // the pending import payload is missing (e.g. large upload could not be stored).
    const hasSectionReturnState = typeof routeState?.targetSectionId === "string";
    if (!mediaBlock && !customBlock && !storedImport?.templateId && !hasSectionReturnState) return;
    if (exerciseImportConsumedRef.current) return;
    exerciseImportConsumedRef.current = true;

    const targetSectionId =
      routeState?.targetSectionId ??
      storedImport?.targetSectionId ??
      "section-0";
    const templateId = storedImport?.templateId;

    const { pathname, search, hash } = routerLocation;
    navigate(`${pathname}${search}${hash}`, { replace: true, state: {} });
    sessionStorage.removeItem(pendingInlineMediaStorageKey);

    if (!mediaBlock && !customBlock && !templateId && hasSectionReturnState) {
      // Stores parsed section index for direct fallback scroll when there is no block payload.
      const fallbackTargetIdx = parseLessonSectionIndex(targetSectionId);
      if (fallbackTargetIdx !== null && fallbackTargetIdx > 0) {
        setPendingInlineMediaTargetSectionId(targetSectionId);
        setVisibleSectionIndex(fallbackTargetIdx);
        requestAnimationFrame(() => {
          scrollToSectionRef.current?.(fallbackTargetIdx);
        });
      }
      return;
    }

    if (customBlock) {
      // Traces custom block handoff from drafts page back into lesson section state.
      if (customBlock.kind === "image_stacked") {
        console.log("[LessonWorkspace] importing image_stacked customBlock", {
          customBlockId: customBlock.id,
          customBlockTitle: customBlock.title,
          targetSectionId,
          alreadyPersisted: Boolean(storedImport?.alreadyPersisted),
          dataKeys:
            customBlock.data && typeof customBlock.data === "object"
              ? Object.keys(customBlock.data as Record<string, unknown>)
              : [],
        });
      }
      if (storedImport?.alreadyPersisted) {
        // The block was already written to the server by persistCustomLessonBlockToSegment
        // before navigation. Skip upsertInlineMediaBlock: calling it while
        // inlineMediaBySectionId is not yet hydrated would set state to [newBlock]
        // only, causing the 500 ms autosave to overwrite all other blocks on the
        // segment. The normal mount-fetch → hydration cycle will bring in the
        // full, correct media_blocks list from the server.
      } else {
        // Block has not been persisted yet — optimistically add it to local state
        // so it appears immediately and the autosave writes it.
        upsertInlineMediaBlock(targetSectionId, customBlock);
      }
      // Signal VLP to scroll to the right section.
      // Clearing is handled by the data-driven effect below once sortedSegments
      // are available — avoids the 150 ms race where segments haven't loaded yet.
      setPendingInlineMediaTargetSectionId(targetSectionId);

      // ── Scroll to the specific block (new or edited) ─────────────────────
      // After the editor saves and navigates back, we tell VLP to scroll the
      // exact block (by its data-lesson-focus-anchor id) into view so the
      // teacher lands right on the content they just created / modified.
      setPendingScrollToBlockId(customBlock.id);

      // ── Direct scroll-to-section (belt-and-suspenders) ───────────────────
      // The pendingInlineMediaTargetSectionId signal races when sortedSegments
      // haven't loaded yet on remount (VLP only has section-0, can't find
      // section-N, and the clearing effect nulls the signal before sections
      // populate). Directly set visibleSectionIndex + call scrollToSectionRef
      // so the correct section is shown regardless of segment-load timing.
      const targetIdx = parseLessonSectionIndex(targetSectionId);
      if (targetIdx !== null && targetIdx > 0) {
        setVisibleSectionIndex(targetIdx);
        // scrollToSectionRef is wired after VLP mounts; one rAF is enough.
        requestAnimationFrame(() => {
          scrollToSectionRef.current?.(targetIdx);
        });
      }

      return;
    }

    handleMediaTemplateImport(templateId, {
      targetSectionId,
      mediaBlock,
      upsertInlineMediaBlock,
      setCarouselSlidesBySectionId,
      setPendingInlineMedia,
      setPendingInlineMediaTargetSectionId,
    });

    // Carousel-only template path does not set pending target — still jump back to the right section.
    // Cleared by the data-driven effect below once sortedSegments are available.
    if (
      templateId === "img-carousel" &&
      parseLessonSectionIndex(targetSectionId) != null
    ) {
      setPendingInlineMediaTargetSectionId(targetSectionId);
    }

    // Direct scroll for non-customBlock paths (same belt-and-suspenders as above).
    const templateTargetIdx = parseLessonSectionIndex(targetSectionId);
    if (templateTargetIdx !== null && templateTargetIdx > 0) {
      setVisibleSectionIndex(templateTargetIdx);
      requestAnimationFrame(() => {
        scrollToSectionRef.current?.(templateTargetIdx);
      });
    }
  }, [
    mode,
    pendingInlineMediaStorageKey,
    routerLocation,
    navigate,
    upsertInlineMediaBlock,
    setCarouselSlidesBySectionId,
    setPendingInlineMediaTargetSectionId,
    setVisibleSectionIndex,
  ]);

  // ── Clear pendingInlineMediaTargetSectionId once data is ready ───────────────
  // The import effect sets this signal but does NOT clear it on a fixed timer.
  // Instead we wait until sortedSegments have loaded (VLP's sections are populated
  // and its scroll effect can find the target section), then clear in the next
  // animation frame — giving VLP's useEffect one render cycle to act first.
  useEffect(() => {
    if (!pendingInlineMediaTargetSectionId || sortedSegments.length === 0)
      return;
    const raf = requestAnimationFrame(() => {
      setPendingInlineMediaTargetSectionId(null);
    });
    return () => cancelAnimationFrame(raf);
  }, [
    pendingInlineMediaTargetSectionId,
    sortedSegments,
    setPendingInlineMediaTargetSectionId,
  ]);

  // ── Render gates ───────────────────────────────────────────────────────────────
  if (loading && !unit) return <LessonFlowSkeleton />;
  if (error) return <LessonFlowError message={error} />;

  // Hides the floating section side panel on mobile to prevent horizontal overflow.
  const showDesktopSidePanel = sidePanelOpen && !isMobileViewport;

  // True when the teacher should see the answers rail (left on desktop, top strip on mobile).
  const hasTeacherAnswersRail =
    mode === "teacher" && typeof onToggleAnswersPanel === "function";

  // Uses a horizontal flex row when the sections panel and/or the answers rail needs column siblings.
  const useWideLessonRow =
    showDesktopSidePanel || (hasTeacherAnswersRail && !isMobileViewport);

  // ── Main render ────────────────────────────────────────────────────────────────
  return (
    <div className="lesson-workspace flex flex-col flex-1 min-h-0">
      {slidesError && !slides.length && (
        <div
          role="alert"
          className="mx-4 mt-3 mb-1 flex items-center gap-2 rounded-xl border border-amber-100
                     bg-amber-50 px-4 py-2.5 text-[13px] text-amber-700"
        >
          <span className="font-medium">
            {t("classroom.lessonWorkspace.slidesUnavailable")}
          </span>
          <span>{t("classroom.lessonWorkspace.tryAgainLater")}</span>
        </div>
      )}

      <div
        className={[
          // flex-1 + min-h-0: fill <main> under the header so inner .vlp-root can scroll (main is overflow-hidden).
          "flex flex-1 w-full min-h-0 pb-4 px-[var(--classroom-align-gutter)]",
          useWideLessonRow
            ? "flex-row justify-center gap-3"
            : "flex-col justify-start",
        ].join(" ")}
        style={{ gap: 3 }}
      >
        {/* Mobile/tablet: compact strip aligned with lesson column; hidden ≤480px (header fallback). */}
        {hasTeacherAnswersRail && isMobileViewport && (
          <div
            ref={answersPanelAnchorRef}
            className="lw-answers-rail lw-answers-rail--mobile lw-answers-rail--mobile--responsive mt-1 shrink-0"
            aria-label={t("classroom.lessonWorkspace.studentAnswers")}
          >
            {/* <div className="lw-answers-rail__head lw-answers-rail__head--mobile">
              <span className="lw-answers-rail__title">Answers</span>
            </div> */}
            <div className="lw-answers-rail__body lw-answers-rail__body--mobile">
              <button
                type="button"
                onClick={onToggleAnswersPanel}
                aria-label={t("classroom.lessonWorkspace.viewStudentAnswers")}
                aria-pressed={answersPanelOpen}
                title={t("classroom.lessonWorkspace.studentAnswers")}
                className={[
                  "ch-icon-btn",
                  answersPanelOpen
                    ? "ch-icon-btn--answers ch-icon-btn--answers-active"
                    : "ch-icon-btn--answers",
                ].join(" ")}
              >
                <LayoutGrid size={15} strokeWidth={2.2} />
              </button>
            </div>
          </div>
        )}

        {hasTeacherAnswersRail && !isMobileViewport && (
          <aside
            ref={answersPanelAnchorRef}
            className="lw-answers-rail shrink-0"
            aria-label={t("classroom.lessonWorkspace.studentAnswers")}
          >
            {/* <div className="lw-answers-rail__head">
              <p className="lw-answers-rail__title">Answers</p>
            </div> */}
            <div className="lw-answers-rail__body">
              <button
                type="button"
                onClick={onToggleAnswersPanel}
                aria-label={t("classroom.lessonWorkspace.viewStudentAnswers")}
                aria-pressed={answersPanelOpen}
                title={t("classroom.lessonWorkspace.studentAnswers")}
                className={[
                  "ch-icon-btn",
                  answersPanelOpen
                    ? "ch-icon-btn--answers ch-icon-btn--answers-active"
                    : "ch-icon-btn--answers",
                ].join(" ")}
              >
                <LayoutGrid size={15} strokeWidth={2.2} />
              </button>
            </div>
          </aside>
        )}

        <div
          className={[
            // flex-1: in column layout, take height below the answers rail; in row layout, fill beside the panel so .vlp-root gets a bounded flex height.
            "flex  min-h-0 flex-col",
            showDesktopSidePanel
              ? "min-w-[700px] max-w-[900px]"
              : "w-full min-w-0 max-w-none",
          ].join(" ")}
        >
          <VerticalLessonPlayer
            key={`vlp-unit-${effectiveUnitId ?? "none"}`}
            flow={flow}
            mode={mode}
            sectionDefinitions={sectionDefinitions}
            onActiveSectionChange={(index) => {
              setVisibleSectionIndex(index);
            }}
            onScrollToSectionReady={(scrollToSection) => {
              scrollToSectionRef.current = scrollToSection;
            }}
            loading={slidesLoading}
            onItemCompleted={handleItemCompleted}
            onStartTest={onStartTest}
            onSubmitTest={onSubmitTest}
            onLoadTask={onLoadTask}
            onSubmitTask={onSubmitTask}
            onOpenTask={onOpenTask}
            onOpenTest={onOpenTest}
            onFinish={handleFinish}
            inlineMediaBySectionId={inlineMediaBySectionId}
            onInlineMediaChange={
              mode === "teacher" ? handleInlineMediaChange : undefined
            }
            carouselSlidesBySectionId={carouselSlidesBySectionId}
            onCarouselSlidesChange={
              mode === "teacher" ? handleCarouselSlidesChange : undefined
            }
            pendingInlineMedia={mode === "teacher" ? pendingInlineMedia : null}
            pendingInlineMediaTargetSectionId={
              mode === "teacher" ? pendingInlineMediaTargetSectionId : null
            }
            onInlineMediaConsumed={
              mode === "teacher"
                ? () => {
                    setPendingInlineMedia(null);
                    setPendingInlineMediaTargetSectionId(null);
                  }
                : undefined
            }
            pendingScrollToBlockId={
              mode === "teacher" ? pendingScrollToBlockId : null
            }
            onScrollToBlockConsumed={
              mode === "teacher"
                ? () => setPendingScrollToBlockId(null)
                : undefined
            }
            {...(mode === "teacher"
              ? {
                  ...buildTeacherProps(onContentSaved, handleAddContent),
                  onDeleteBlock: handleDeleteBlock,
                  onReorderBlock: handleReorderBlock,
                  onEditBlock: handleEditBlock,
                  onCopyExerciseToHomework,
                  onSectionTitleChange: persistSegmentTitleDebounced,
                  onResetBlockAnswers: handleResetBlockAnswers,
                }
              : {})}
          />
        </div>

        {showDesktopSidePanel && (
          <SectionSidePanel
            open={showDesktopSidePanel}
            segments={
              sidePanelSegments.length > 0 ? sidePanelSegments : undefined
            }
            currentSegmentId={
              sidePanelSegments[visibleSectionIndex]?.id ?? null
            }
            onSelectSegment={handleSelectSegment}
            onAddSegment={mode === "teacher" ? handleAddSegment : undefined}
            onRemoveSegment={
              mode === "teacher" && sortedSegments.length > 1
                ? handleRemoveSegment
                : undefined
            }
            onReorderSegments={
              mode === "teacher" && sortedSegments.length > 1
                ? handleReorderSegments
                : undefined
            }
            units={units}
            currentUnitId={currentUnitId}
            completedUnitIds={completedUnitIds}
            courseTitle={courseTitle}
            onSelectUnit={mode === "teacher" ? () => {} : onSelectUnit}
            onAddUnit={mode === "teacher" ? undefined : onAddUnit}
            onFinishUnit={onFinishUnit}
            onExtra={() => onExtra("extra")}
            currentUnitSteps={currentUnitSteps}
            finishButtonVariant={sidePanelFinishVariant}
            finishButtonDisabled={finishUnitActionPending}
          />
        )}
      </div>
    </div>
  );
}

export default memo(LessonWorkspace);