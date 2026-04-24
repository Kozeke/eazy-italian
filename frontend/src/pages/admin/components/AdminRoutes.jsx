/**
 * AdminRoutes.jsx
 *
 * Course-first admin routing.
 *
 * STRUCTURE:
 *   /admin                     → AdminLayout (sidebar shell)
 *   /admin/                    → AdminDashboardPage (redirect → /admin/courses)
 *   /admin/courses             → AdminCoursesCatalog  ← PRIMARY
 *   /admin/courses/builder     → TeacherOnboardingPage (AI course builder)
 *   /admin/courses/new         → AdminCourseCreatePage (manual)
 *   /admin/courses/:id         → AdminCourseDetailPage (unit tree)
 *   /admin/courses/:id/edit    → AdminCourseEditPage
 *   /admin/students            → AdminStudentsPage
 *   /admin/grades              → AdminGradesPage
 *   ── Content Library (preserved, de-emphasised) ──
 *   /admin/units               → AdminUnitsPage
 *   /admin/units/new           → AdminUnitCreatePage
 *   /admin/units/:id           → AdminUnitDetailPage
 *   /admin/units/:id/edit      → AdminUnitEditPage
 *   /admin/videos              → AdminVideosPage
 *   /admin/videos/new          → AdminVideoCreatePage
 *   /admin/videos/:id/edit     → AdminVideoEditPage
 *   /admin/tasks               → AdminTasksPage
 *   /admin/tasks/new           → AdminTaskCreatePage
 *   /admin/tasks/:id           → AdminTaskDetailPage
 *   /admin/tasks/:id/edit      → AdminTaskEditPage
 *   /admin/tests               → AdminTestsPage
 *   /admin/tests/new           → AdminTestCreatePage
 *   /admin/tests/:id           → AdminTestDetailsPage
 *   /admin/tests/:id/edit      → AdminTestEditPage
 *   /admin/generate-slide        → AdminGenerateSlidePage (full-screen AI wizard)
 *   /admin/presentations/:id/edit → AdminPresentationEditPage (full-screen editor)
 *   /admin/slides/review          → ReviewSlidesPage
 *
 * HOW TO USE:
 *   Replace your existing admin Route block with this component.
 *   Example (in your App.tsx / main router):
 *
 *     import AdminRoutes from './AdminRoutes';
 *     ...
 *     <Route path="/admin/*" element={<AdminRoutes />} />
 *
 * This file is a DROP-IN upgrade — all old routes still work.
 */

import { useCallback, useEffect, useState } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import AdminLayout             from "./AdminLayout";
import api, { segmentsApi } from "../../../services/api";

// Active admin pages
import AdminDashboardPage      from "../AdminDashboardPage";
import AdminCoursesCatalog     from "../AdminCoursesCatalog";
import AdminStudentsPage       from "../AdminStudentsPage";
import AdminStudentViewPage    from "../AdminStudentViewPage";
import ExerciseEditorPage      from "../ExerciseEditorPage";
import ExerciseDraftsPage      from "../ExerciseDraftsPage";
import AdminProfileSettingsPage from "../AdminProfileSettingsPage";
import AdminTariffsPage from "../AdminTariffsPage";

/*
 * Legacy-only admin pages (routes below are commented out). Sources live next to this file:
 *   AdminCourseDetailPage.legacy.jsx, AdminCourseCreatePage.legacy.tsx, AdminCourseEditPage.legacy.tsx,
 *   AdminGradesPage.legacy.tsx, AdminGradeDetailPage.legacy.tsx,
 *   AdminUnitsPage.legacy.tsx, AdminUnitCreatePage.legacy.tsx, AdminUnitDetailPage.legacy.jsx, AdminUnitEditPage.legacy.tsx,
 *   AdminVideosPage.legacy.tsx, AdminVideoCreatePage.legacy.tsx, AdminVideoEditPage.legacy.tsx,
 *   AdminTasksPage.legacy.tsx, AdminTaskDetailPage.legacy.tsx, AdminTaskGradingPage.legacy.tsx, AdminTaskSubmissionsPage.legacy.tsx,
 *   AdminTaskBuilder.legacy.tsx, AdminTestsPage.legacy.tsx, AdminTestCreatePage.legacy.tsx, AdminTestDetailsPage.legacy.tsx,
 *   AdminTestEditPage.legacy.tsx, AdminTestAnalyticsPage.legacy.tsx, AdminTestPreviewPage.legacy.tsx,
 *   TeacherOnboarding.legacy.jsx, AdminGenerateSlidePage.legacy.tsx, AdminPresentationEditPage.legacy.jsx,
 *   AdminTestBuilder.legacy.jsx, ReviewSlidesPage.legacy.tsx,
 *   AdminEmailCampaignsPage.legacy.tsx, AdminProgressPage.legacy.tsx, AdminQuestionBankPage.legacy.tsx,
 *   AdminStudentCreatePage.legacy.tsx, AdminStudentEditPage.legacy.tsx,
 *   AdminTaskCreatePage.legacy.tsx, AdminTaskEditPage.legacy.tsx,
 *   AITaskGenerationWizard.legacy.tsx, AITestGenerationWizard.legacy.tsx,
 *   CourseBuildScreen.legacy.jsx, CourseOutlineScreen.legacy.jsx,
 *   CreateTestMethodPicker.legacy.tsx, CreateTaskMethodPicker.legacy.tsx,
 *   SlideEditorPage.legacy.jsx, SlideEditor.legacy.tsx, SlideImageEditor.legacy.tsx, SlideNavigator.legacy.tsx, SlidePreview.legacy.tsx,
 *   CourseFileUploadModal.legacy.jsx, AiBuilderPage.legacy.tsx (App.tsx), useAITaskGeneration.legacy.ts
 *
 * import AdminCourseDetailPage   from "../AdminCourseDetailPage.legacy";
 * import AdminCourseCreatePage   from "../AdminCourseCreatePage.legacy";
 * import AdminCourseEditPage     from "../AdminCourseEditPage.legacy";
 * import AdminGradesPage         from "../AdminGradesPage.legacy";
 * import AdminGradeDetailPage    from "../AdminGradeDetailPage.legacy";
 * import AdminUnitsPage          from "../AdminUnitsPage.legacy";
 * import AdminUnitCreatePage     from "../AdminUnitCreatePage.legacy";
 * import AdminUnitDetailPage     from "../AdminUnitDetailPage.legacy";
 * import AdminUnitEditPage       from "../AdminUnitEditPage.legacy";
 * import AdminVideosPage         from "../AdminVideosPage.legacy";
 * import AdminVideoCreatePage    from "../AdminVideoCreatePage.legacy";
 * import AdminVideoEditPage      from "../AdminVideoEditPage.legacy";
 * import AdminTasksPage          from "../AdminTasksPage.legacy";
 * import AdminTaskDetailPage     from "../AdminTaskDetailPage.legacy";
 * import AdminTaskGradingPage    from "../AdminTaskGradingPage.legacy";
 * import AdminTaskSubmissionsPage from "../AdminTaskSubmissionsPage.legacy";
 * import { TaskBuilderPage }     from "../AdminTaskBuilder.legacy";
 * import AdminTestsPage          from "../AdminTestsPage.legacy";
 * import AdminTestCreatePage     from "../AdminTestCreatePage.legacy";
 * import AdminTestDetailsPage    from "../AdminTestDetailsPage.legacy";
 * import AdminTestEditPage       from "../AdminTestEditPage.legacy";
 * import AdminTestAnalyticsPage  from "../AdminTestAnalyticsPage.legacy";
 * import AdminTestPreviewPage    from "../AdminTestPreviewPage.legacy";
 * import TeacherOnboardingPage   from "../TeacherOnboarding.legacy";
 * import AdminGenerateSlidePage  from "../AdminGenerateSlidePage.legacy";
 * import AdminPresentationEditPage from "../AdminPresentationEditPage.legacy";
 * import { TestBuilderPage }     from "../AdminTestBuilder.legacy";
 * import { ReviewSlidesPage }    from "../ReviewSlidesPage.legacy";
 */

// NOTE: /teacher/classroom/* routes are registered at the top level in App.tsx

// Legacy redirect for task edit route (re-enable with Task Builder routes):
// function TaskEditRedirect() {
//   const { id } = useParams();
//   return <Navigate to={`/admin/tasks/${id}/builder`} replace />;
// }

function useExerciseDrafts() {
  const [drafts, setDrafts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const loadDrafts = async () => {
      setLoading(true);
      try {
        const response = await api.get("/exercises/drafts");
        const data = response?.data;
        const list = Array.isArray(data)
          ? data
          : Array.isArray(data?.drafts)
            ? data.drafts
            : Array.isArray(data?.items)
              ? data.items
              : [];
        if (mounted) setDrafts(list);
      } catch (error) {
        console.error("Failed to load exercise drafts", error);
        if (mounted) setDrafts([]);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void loadDrafts();
    return () => { mounted = false; };
  }, []);

  return { drafts, loading };
}

/**
 * Persists the custom inline exercise to the segment before navigating back to the
 * classroom so GET /units/... cannot hydrate stale media_blocks before the debounced
 * PUT from LessonWorkspace would run.
 */
async function persistCustomLessonBlockToSegment(segmentId, customBlock) {
  const segmentNumericId = Number(segmentId);
  if (!Number.isFinite(segmentNumericId) || !customBlock) return;
  const priorRaw = await segmentsApi.getSegment(segmentNumericId);
  // segmentsApi.getSegment may return the raw data object or an Axios response
  // wrapper ({ data: {...} }). Unwrap defensively so prior.media_blocks is always
  // the actual array and we never start from an empty list.
  const prior = priorRaw?.data ?? priorRaw;
  const mediaBlocks = Array.isArray(prior?.media_blocks) ? [...prior.media_blocks] : [];
  const matchIndex = mediaBlocks.findIndex(
    (b) => b && String(b.id) === String(customBlock.id),
  );
  const normalized = {
    id: customBlock.id,
    kind: customBlock.kind,
    title: typeof customBlock.title === "string" ? customBlock.title : "",
    data:
      customBlock.data &&
      typeof customBlock.data === "object" &&
      !Array.isArray(customBlock.data)
        ? customBlock.data
        : {},
  };
  if (matchIndex >= 0) {
    mediaBlocks[matchIndex] = { ...mediaBlocks[matchIndex], ...normalized };
  } else {
    mediaBlocks.push(normalized);
  }
  await segmentsApi.updateSegment(segmentNumericId, { media_blocks: mediaBlocks });
}

function ExerciseDraftsPageRoute() {
  const navigate = useNavigate();
  const location = useLocation();
  const { drafts, loading } = useExerciseDrafts();
  const pendingInlineMediaStorageKey = "lessonPendingInlineMedia";
  const draftRouteContextStorageKey = "exerciseDraftsRouteContext";

  const storedRouteContext = (() => {
    const raw = sessionStorage.getItem(draftRouteContextStorageKey);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      sessionStorage.removeItem(draftRouteContextStorageKey);
      return null;
    }
  })();

  const returnTo =
    typeof location.state?.returnTo === "string" && location.state.returnTo.length > 0
      ? location.state.returnTo
      : typeof storedRouteContext?.returnTo === "string" && storedRouteContext.returnTo.length > 0
        ? storedRouteContext.returnTo
        : null;
  const targetSectionId =
    location.state?.targetSectionId ??
    storedRouteContext?.targetSectionId ??
    null;
  // The real integer segment ID from the API (e.g. 99, 103).
  // LessonWorkspace.handleAddContent puts this in route state as `targetSegmentId`.
  // We must read + persist it separately from `targetSectionId` ("section-0" string).
  const targetSegmentId =
    location.state?.targetSegmentId ??
    storedRouteContext?.targetSegmentId ??
    null;

  // Block id + payload snapshot when teacher opens "Edit exercise" from a lesson segment
  const editBlockId =
    typeof location.state?.editBlockId === "string" && location.state.editBlockId.length > 0
      ? location.state.editBlockId
      : typeof storedRouteContext?.editBlockId === "string" &&
          storedRouteContext.editBlockId.length > 0
        ? storedRouteContext.editBlockId
        : null;
  const editBlockBootstrap =
    location.state?.editBlockBootstrap ?? storedRouteContext?.editBlockBootstrap ?? null;

  useEffect(() => {
    if (!location.state?.returnTo || typeof location.state.returnTo !== "string") return;
    sessionStorage.setItem(
      draftRouteContextStorageKey,
      JSON.stringify({
        returnTo: location.state.returnTo,
        targetSectionId: location.state?.targetSectionId ?? null,
        // Persist the integer segment ID so it survives a page refresh.
        targetSegmentId: location.state?.targetSegmentId ?? null,
        editBlockId: location.state?.editBlockId ?? null,
        editBlockBootstrap: location.state?.editBlockBootstrap ?? null,
      }),
    );
  }, [location.state]);

  const clearDraftRouteContext = useCallback(() => {
    sessionStorage.removeItem(draftRouteContextStorageKey);
  }, []);

  const handleClose = () => {
    if (typeof returnTo === "string" && returnTo.length > 0) {
      clearDraftRouteContext();
      navigate(returnTo, { replace: true });
      return;
    }
    navigate(-1);
  };

  const handleExerciseSave = useCallback(
    async (_title, payloads, drafts) => {
      const title = typeof _title === "string" ? _title.trim() : "";
      const firstPayload =
        Array.isArray(payloads) && payloads.length > 0 ? payloads[0] : null;
      const customType =
        firstPayload?.type === "text" ||
        firstPayload?.type === "image" ||
        firstPayload?.type === "drag_to_gap" ||
        firstPayload?.type === "drag_to_image" ||
        firstPayload?.type === "type_word_to_image" ||
        firstPayload?.type === "select_form_to_image" ||
        firstPayload?.type === "type_word_in_gap" ||
        firstPayload?.type === "select_word_form" ||
        firstPayload?.type === "build_sentence" ||
        firstPayload?.type === "match_pairs" ||
        firstPayload?.type === "order_paragraphs" ||
        firstPayload?.type === "sort_into_columns" ||
        firstPayload?.type === "test_without_timer" ||
        firstPayload?.type === "test_with_timer" ||
        firstPayload?.type === "true_false"
          ? firstPayload.type
          : null;
      // Re-use the segment block id when editing so upsertInlineMediaBlock replaces in place.
      // When the AI generator already persisted a block on the server, its id travels back
      // through the payload as _aiBlockId — use that instead of minting a new random id
      // which would cause persistCustomLessonBlockToSegment to append a duplicate block.
      const customBlockId =
        editBlockId && editBlockId.length > 0
          ? editBlockId
          : firstPayload?._aiBlockId &&
              typeof firstPayload._aiBlockId === 'string' &&
              firstPayload._aiBlockId.length > 0
            ? firstPayload._aiBlockId
            : Math.random().toString(36).slice(2, 10);

      const customBlock =
        customType
          ? {
              id: customBlockId,
              kind: customType,
              title:
                title ||
                (customType === "text"
                  ? "Text block"
                  : customType === "image"
                  ? "Image block"
                  : customType === "drag_to_gap"
                  ? "Drag word to gap"
                  : customType === "drag_to_image"
                    ? "Drag word to image"
                  : customType === "type_word_to_image"
                    ? "Type word to image"
                  : customType === "select_form_to_image"
                    ? "Select form to image"
                  : customType === "type_word_in_gap"
                    ? "Type word in gap"
                  : customType === "select_word_form"
                    ? "Select word form"
                  : customType === "build_sentence"
                    ? "Build a sentence"
                  : customType === "match_pairs"
                    ? "Match pairs"
                  : customType === "order_paragraphs"
                    ? "Order paragraphs"
                  : customType === "sort_into_columns"
                    ? "Sort into columns"
                  : customType === "true_false"
                    ? "True / False"
                  : customType === "test_with_timer"
                    ? "Test with timer"
                    : "Test without timer"),
              data:
                firstPayload.data &&
                typeof firstPayload.data === "object" &&
                !Array.isArray(firstPayload.data)
                  ? firstPayload.data
                  : {},
            }
          : null;
      // Tracks whether the block was already written to the server so the
      // lesson workspace can skip its own upsert (prevents the autosave race
      // that overwrites existing media_blocks with only the new block).
      let alreadyPersisted = false;
      if (customBlock && targetSegmentId != null && targetSegmentId !== "") {
        try {
          await persistCustomLessonBlockToSegment(targetSegmentId, customBlock);
          alreadyPersisted = true;
        } catch (err) {
          console.error("[ExerciseDraftsPage] persistCustomLessonBlockToSegment failed", err);
        }
      }
      if (typeof returnTo === "string" && returnTo.length > 0) {
        if (customBlock) {
          sessionStorage.setItem(
            pendingInlineMediaStorageKey,
            JSON.stringify({
              customBlock,
              targetSectionId,
              alreadyPersisted,
            }),
          );
        }
        clearDraftRouteContext();
        navigate(returnTo, {
          replace: true,
          state: {
            exerciseImportForTest: {
              title: title || "Untitled test",
              drafts: drafts ?? [],
              ...(customBlock ? { customBlock } : {}),
            },
            targetSectionId,
          },
        });
        return;
      }
      if (customBlock) {
        sessionStorage.setItem(
          pendingInlineMediaStorageKey,
          JSON.stringify({
            customBlock,
            targetSectionId,
            alreadyPersisted,
          }),
        );
        clearDraftRouteContext();
        navigate(-1);
        return;
      }
      // eslint-disable-next-line no-console
      console.log("[ExerciseDraftsPage] Save (no classroom returnTo)", {
        title,
        drafts,
        payloads,
      });
    },
    [clearDraftRouteContext, editBlockId, navigate, pendingInlineMediaStorageKey, returnTo, targetSectionId, targetSegmentId],
  );

  const handleSelectMediaDirect = useCallback(
    (kind, templateId) => {
      if (typeof returnTo === "string" && returnTo.length > 0) {
        const mediaBlock = {
          id: Math.random().toString(36).slice(2, 10),
          kind,
          url: "",
          caption: "",
        };
        sessionStorage.setItem(
          pendingInlineMediaStorageKey,
          JSON.stringify({
            mediaBlock,
            targetSectionId,
            templateId,
          }),
        );
        clearDraftRouteContext();
        navigate(returnTo, {
          replace: true,
          state: {
            exerciseImportForTest: {
              title: "",
              drafts: [],
              mediaBlock,
            },
            targetSectionId,
          },
        });
        return;
      }
      // No returnTo — nothing to do (standalone gallery usage)
    },
    [clearDraftRouteContext, navigate, pendingInlineMediaStorageKey, returnTo, targetSectionId],
  );

  const initialEditContext =
    editBlockId &&
    editBlockBootstrap &&
    typeof editBlockBootstrap === "object" &&
    typeof editBlockBootstrap.kind === "string"
      ? {
          blockId: editBlockId,
          kind: editBlockBootstrap.kind,
          title: typeof editBlockBootstrap.title === "string" ? editBlockBootstrap.title : "",
          data:
            editBlockBootstrap.data &&
            typeof editBlockBootstrap.data === "object" &&
            !Array.isArray(editBlockBootstrap.data)
              ? editBlockBootstrap.data
              : {},
        }
      : null;

  return (
    <ExerciseDraftsPage
      drafts={drafts}
      draftsLoading={loading}
      onClose={handleClose}
      onSave={handleExerciseSave}
      onSelectMediaDirect={handleSelectMediaDirect}
      onOpenDraft={(id) => navigate(`/admin/exercises/${id}/edit`)}
      segmentId={targetSegmentId}
      initialEditContext={initialEditContext}
    />
  );
}

export default function AdminRoutes() {
  return (
    <Routes>
      {/* ── Onboarding: full-screen, no sidebar ── */}
      {/* <Route path="onboarding" element={<TeacherOnboardingPage />} /> */}

      {/* ── Slide generator: full-screen ── */}
      {/* <Route path="generate-slide" element={<AdminGenerateSlidePage />} /> */}

      {/* ── Presentation editor: full-screen (wraps SlideEditorPage) ── */}
      {/* <Route path="presentations/:presId/edit" element={<AdminPresentationEditPage />} /> */}

      {/* ── Test Builder: full-screen (no sidebar) ── */}
      {/* <Route path="tests/:testId/builder" element={<TestBuilderPage />} /> */}
      
      {/* ── Test Preview: full-screen (no sidebar) ── */}
      {/* <Route path="tests/:testId/preview" element={<AdminTestPreviewPage />} /> */}
      {/* ── Exercise Draft Picker: full-screen (no sidebar) ── */}
      <Route path="exercises/new"       element={<ExerciseDraftsPageRoute />} />
      {/* ── Exercise Editor: full-screen (no sidebar) ── */}
      <Route path="exercises/:id/edit"  element={<ExerciseEditorPage />} />
      {/* ── Task Builder: full-screen (no sidebar) ── */}
      {/* <Route path="tasks/builder" element={<TaskBuilderPage />} /> */}
      {/* <Route path="tasks/builder/new" element={<TaskBuilderPage />} /> */}

      {/* <Route path="tasks/:taskId/builder" element={<TaskBuilderPage />} /> */}

      {/* ── All other admin pages: inside sidebar layout ── */}
      <Route element={<AdminLayout />}>

        {/* Root → redirect logic in dashboard */}
        <Route index element={<AdminDashboardPage />} />

        {/* ── COURSES (primary) ── */}
        <Route path="courses">
          <Route index element={<AdminCoursesCatalog />} />
          {/* <Route path="builder" element={<TeacherOnboardingPage />} /> */}
          {/* <Route path="new"     element={<AdminCourseCreatePage />} /> */}
          {/* <Route path=":id"     element={<AdminCourseDetailPage />} /> */}
          {/* <Route path=":id/edit" element={<AdminCourseEditPage />} /> */}
        </Route>

        {/* ── STUDENTS ── */}
        <Route path="students">
          <Route index element={<AdminStudentsPage />} />
          <Route path=":id" element={<AdminStudentViewPage />} />
        </Route>

        {/* ── PROFILE (header user menu) ── */}
        <Route path="profile" element={<AdminProfileSettingsPage />} />
        {/* ── TARIFFS (header user menu + trial icon) ── */}
        <Route path="tariffs" element={<AdminTariffsPage />} />

        {/* ── GRADES ── */}
        {/* <Route path="grades">
          <Route index element={<AdminGradesPage />} />
          <Route path=":id" element={<AdminGradeDetailPage />} />
        </Route> */}

        {/* ── UNITS (content library) ── */}
        {/* <Route path="units">
          <Route index element={<AdminUnitsPage />} />
          <Route path="new"      element={<AdminUnitCreatePage />} />
          <Route path=":id"      element={<AdminUnitDetailPage />} />
          <Route path=":id/edit" element={<AdminUnitEditPage />} />
        </Route> */}

        {/* ── VIDEOS ── */}
        {/* <Route path="videos">
          <Route index element={<AdminVideosPage />} />
          <Route path="new"      element={<AdminVideoCreatePage />} />
          <Route path=":id/edit" element={<AdminVideoEditPage />} />
        </Route> */}

        {/* ── TASKS ── */}
        {/* Legacy tasks hub + builder (see *.legacy.tsx); /tasks/new had pointed at disabled builder */}
        {/* <Route path="tasks">
          <Route index element={<AdminTasksPage />} />
          <Route path="new" element={<Navigate to="/admin/tasks/builder/new" replace />} />
          <Route path=":id" element={<AdminTaskDetailPage />} />
          <Route path=":id/edit" element={<TaskEditRedirect />} />
          <Route path=":id/grading" element={<AdminTaskGradingPage />} />
          <Route path=":id/submissions" element={<AdminTaskSubmissionsPage />} />
        </Route> */}

        {/* ── TESTS ── */}
        {/* <Route path="tests">
          <Route index element={<AdminTestsPage />} />
          <Route path="new"          element={<AdminTestCreatePage />} />
          <Route path=":id"          element={<AdminTestDetailsPage />} />
          <Route path=":id/edit"     element={<AdminTestEditPage />} />
          <Route path=":id/analytics" element={<AdminTestAnalyticsPage />} />
        </Route> */}

        {/* ── SLIDE REVIEW ── */}
        {/* <Route path="slides/review" element={<ReviewSlidesPage />} /> */}

        {/* ── Catch-all → courses ── */}
        <Route path="*" element={<Navigate to="/admin/courses" replace />} />
      </Route>
    </Routes>
  );
}