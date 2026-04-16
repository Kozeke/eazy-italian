/**
 * useAITaskGeneration.ts
 *
 * Mutation hook for the "Generate with AI" secondary action inside
 * AdminTaskBuilderPage. This is the single integration layer — neither
 * the wizard nor the builder need to know each other's internals.
 *
 * Responsibilities
 * ─────────────────
 * • Modal open / close state
 * • Fetching newly-generated tasks after wizard success (using existing tasksApi)
 * • Merging them into builder state via `onTasksAppended` callback
 * • Full edge-case safety: empty response, partial failures, unmount-safe,
 *   duplicate-submit proof, malformed-error proof — never crashes UI
 *
 * NOT responsible for
 * ───────────────────
 * • The POST to /units/{unit_id}/generate-tasks
 *   → lives in generateTasksAI() inside AITaskGenerationWizard (shared, one source)
 * • Navigation (none — builder always stays open)
 * • Publishing (generated tasks stay DRAFT always)
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { toast } from "react-hot-toast";
import { tasksApi } from "../../services/api";
import { Task } from "../../types";

/* ─── Shape used by AdminTaskBuilderPage ──────────────────────────────────── */
export interface BuilderEditableTask {
  id:                   number;
  title:                string;
  description:          string;
  instructions:         string;
  taskType:             "writing" | "listening" | "reading";
  gradingType:          "automatic" | "manual";
  unitId:               number | null;
  status:               "draft" | "scheduled" | "published" | "archived";
  maxScore:             number;
  dueAt:                string;
  publishAt:            string;
  content:              string;
  contentSource:        "url" | "file" | "text";
  questions:            any[];
  allowLateSubmissions: boolean;
  latePenaltyPercent:   number;
  maxAttempts:          number | null;
  uploadedFiles:        Array<{
    file_path: string; filename: string; original_filename: string;
    size: number; url: string;
  }>;
  dirty:     boolean;
  saving:    boolean;
  saved:     boolean;
  loadError: string | null;
}

/**
 * GenerationPhase — observable lifecycle for UI feedback
 *
 *  idle  ──openWizard()──►  idle (wizard open)
 *            submit POST ──►  generating  (wizard shows its own loading screen)
 *            onDone() called ──►  fetching  (modal closed, builder shows inline spinner)
 *            all tasks loaded ──►  success  (banner shown, toast fired)
 *            any failure ──►  error  (banner + toast, resetPhase() to idle)
 */
export type GenerationPhase =
  | "idle"
  | "generating"   // POST in flight inside wizard
  | "fetching"     // wizard closed, loading task objects
  | "success"      // tasks appended to builder
  | "error";       // something went wrong

export interface UseAITaskGenerationOptions {
  onTasksAppended: (tasks: BuilderEditableTask[]) => void;
}

export interface UseAITaskGenerationReturn {
  wizardOpen:       boolean;
  openWizard:       () => void;
  closeWizard:      () => void;
  /** Pass directly as AITaskGenerationWizard's `onDone` prop */
  handleWizardDone: (taskIds: number[]) => Promise<void>;
  phase:            GenerationPhase;
  fetchError:       string | null;
  resetPhase:       () => void;
}

export function useAITaskGeneration(
  { onTasksAppended }: UseAITaskGenerationOptions,
): UseAITaskGenerationReturn {
  const [wizardOpen, setWizardOpen] = useState(false);
  const [phase,      setPhase]      = useState<GenerationPhase>("idle");
  const [fetchError, setFetchError] = useState<string | null>(null);

  /* Unmount safety */
  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  /* Duplicate-submit guard */
  const inFlight = useRef(false);

  /* ── openWizard ── always resets stale error state before opening */
  const openWizard = useCallback(() => {
    setFetchError(null);
    setPhase("idle");
    setWizardOpen(true);
  }, []);

  /* ── closeWizard ── safe to call even mid-request (wizard blocks its own close) */
  const closeWizard = useCallback(() => {
    setWizardOpen(false);
  }, []);

  /**
   * handleWizardDone
   * ─────────────────
   * Invoked by AITaskGenerationWizard.onDone(taskIds) after POST succeeds.
   * The wizard has already handled its own loading / error screens for the POST.
   * This function owns everything that happens AFTER the wizard hands off IDs.
   */
  const handleWizardDone = useCallback(async (taskIds: number[]) => {
    if (inFlight.current) return; // prevent race
    inFlight.current = true;

    /* Close modal first — teacher sees builder with loading state */
    if (isMounted.current) {
      setWizardOpen(false);
      setFetchError(null);
    }

    /* ── Edge case A: backend returned empty array ── */
    if (!taskIds || taskIds.length === 0) {
      if (isMounted.current) {
        const msg =
          "Generation completed but no task IDs were returned. " +
          "Check the Tasks list — your drafts may have been saved.";
        setPhase("error");
        setFetchError(msg);
        toast.error(msg, { duration: 7000 });
      }
      inFlight.current = false;
      return;
    }

    if (isMounted.current) setPhase("fetching");

    try {
      /* Fetch all generated tasks in parallel — never let one failure block others */
      const results = await Promise.allSettled(
        taskIds.map((id) => tasksApi.getAdminTask(id)),
      );

      if (!isMounted.current) { inFlight.current = false; return; }

      const loaded: BuilderEditableTask[] = [];
      const failedIds: number[]           = [];

      results.forEach((result, i) => {
        const id = taskIds[i];
        if (result.status === "fulfilled") {
          loaded.push(rawToBuilderTask(result.value));
        } else {
          failedIds.push(id);
          console.error(
            `[useAITaskGeneration] Could not fetch task ${id}:`,
            normalizeError(result.reason),
          );
        }
      });

      /* ── Edge case B: every single fetch failed ── */
      if (loaded.length === 0) {
        const idList = taskIds.join(", ");
        const msg =
          `Tasks were generated (IDs: ${idList}) but could not be loaded. ` +
          "Open them individually from the Tasks list.";
        setPhase("error");
        setFetchError(msg);
        toast.error(msg, { duration: 8000 });
        inFlight.current = false;
        return;
      }

      /* ── Partial success: some fetches failed ── */
      if (failedIds.length > 0) {
        toast(
          `⚠ ${failedIds.length} task(s) could not be loaded (#${failedIds.join(", ")}). ` +
          "Find them in the Tasks list.",
          { duration: 7000 },
        );
      }

      /* ── Happy path ── */
      onTasksAppended(loaded);
      setPhase("success");

      /* Short, teacher-focused success copy */
      toast.success(
        loaded.length === 1
          ? "1 draft task generated. Review and publish when ready."
          : `${loaded.length} draft tasks generated. Review and publish when ready.`,
        { duration: 5000, icon: "✨" },
      );

    } catch (unexpectedErr) {
      /* Promise.allSettled should never throw, but catch as a final safety net */
      if (!isMounted.current) { inFlight.current = false; return; }
      const msg = normalizeError(unexpectedErr);
      setPhase("error");
      setFetchError(msg);
      toast.error(`Task generation failed. ${msg}`, { duration: 7000 });
    } finally {
      inFlight.current = false;
    }
  }, [onTasksAppended]);

  const resetPhase = useCallback(() => {
    setPhase("idle");
    setFetchError(null);
  }, []);

  return {
    wizardOpen,
    openWizard,
    closeWizard,
    handleWizardDone,
    phase,
    fetchError,
    resetPhase,
  };
}

/* ─────────────────────────────────────────────────────────────────────────────
   PRIVATE HELPERS
───────────────────────────────────────────────────────────────────────────── */

/**
 * Safely convert any thrown value to a human-readable string.
 * Handles: Error, string, axios-style { detail, message }, plain objects.
 */
function normalizeError(err: unknown): string {
  if (!err) return "An unexpected error occurred.";
  if (typeof err === "string") return err;
  if (err instanceof Error)    return err.message || "An unexpected error occurred.";
  if (typeof err === "object") {
    const e = err as Record<string, unknown>;
    if (typeof e.detail  === "string" && e.detail)  return e.detail;
    if (typeof e.message === "string" && e.message) return e.message;
  }
  return "An unexpected error occurred.";
}

/**
 * rawToBuilderTask
 * ─────────────────
 * Converts a raw Task API response into the shape AdminTaskBuilderPage uses.
 * Mirrors the private rawTaskToEditable() in the builder page — kept here so
 * this hook is self-contained and avoids a circular import.
 *
 * The duplication is intentional and small (pure data transform, no logic).
 * TODO: If the project grows a shared `taskTransforms.ts`, merge them there.
 */
function rawToBuilderTask(raw: Task): BuilderEditableTask {
  const uploadedFiles = (raw.attachments ?? []).map((path: string) => {
    const filename = path.split("/").pop() ?? path;
    return {
      file_path:         path,
      filename,
      original_filename: filename,
      size:              0,
      url: `${
        import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api/v1"
      }/static/${path}`,
    };
  });

  const taskType: BuilderEditableTask["taskType"] =
    (["writing", "listening", "reading"].includes(raw.type ?? "")
      ? raw.type
      : "writing") as BuilderEditableTask["taskType"];

  let contentSource: BuilderEditableTask["contentSource"] = "text";
  if (taskType === "listening")  contentSource = "url";
  if (uploadedFiles.length > 0) contentSource = "file";

  const questions = Array.isArray(raw.questions)
    ? raw.questions.map((q: any, i: number) => ({
        id:             q.id ?? `q-${i}-${Date.now()}`,
        question:       q.question ?? "",
        type:           q.type ?? "multiple_choice",
        options:        q.options ?? [],
        correct_answer: q.correct_answer,
        points:         q.points ?? 1,
      }))
    : [];

  return {
    id:                   raw.id,
    title:                raw.title       ?? "",
    description:          raw.description ?? "",
    instructions:         raw.instructions ?? "",
    taskType,
    gradingType:          raw.auto_check_config?.grading_type ?? "manual",
    unitId:               raw.unit_id   ?? null,
    status:               ((raw.status ?? "draft") as BuilderEditableTask["status"]),
    maxScore:             raw.max_score  ?? 100,
    dueAt:                raw.due_at     ? new Date(raw.due_at).toISOString().slice(0, 16)     : "",
    publishAt:            raw.publish_at ? new Date(raw.publish_at).toISOString().slice(0, 16) : "",
    content:              raw.content    ?? "",
    contentSource,
    questions,
    allowLateSubmissions: raw.allow_late_submissions ?? false,
    latePenaltyPercent:   raw.late_penalty_percent   ?? 0,
    maxAttempts:          raw.max_attempts            ?? null,
    uploadedFiles,
    /* Fresh from generation — always starts clean */
    dirty:     false,
    saving:    false,
    saved:     false,
    loadError: null,
  };
}