/**
 * HomeworkPlayer.tsx
 *
 * A flat exercise player with NO sections.
 * Mirrors the visual language of VerticalLessonPlayer / SectionBlock but
 * renders all homework items in a single scrollable list.
 *
 * Teacher mode:
 *   • Same ⋯ block menu as the lesson player (delete, reorder)
 *   • "Add exercise" button at the bottom
 *   • Each item copied from the lesson shows a "Из урока" badge
 *
 * Student mode:
 *   • ⋯ menu on each block with "Сбросить ответы" only; no add button
 *
 * Scroll: the outer `.hw-player` is the scrollport (like `.vlp-root`); there is
 * no nested scroll inside `.hw-player-body`, and the scrollbar is visually hidden.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Layers,
  Wand2,
  Copy,
} from "lucide-react";
import { useHomework } from "../../../../../contexts/HomeworkContext";
import type { HomeworkItem } from "../../../../../contexts/HomeworkContext";
import { FlowItemRenderer } from "../FlowItemRenderer";
import ExerciseBlockMenu from "../ExerciseBlockMenu";
import type { PlayerMode } from "../VerticalLessonPlayer";
import "../ExerciseBlockMenu.css";
import "./HomeworkPlayer.css";
import { useLiveSession } from "../../../../../hooks/useLiveSession";
import {
  homeworkSubmissionApi,
  type HomeworkSubmissionDto,
} from "../../../../../services/api";

// ─── Single homework exercise block ──────────────────────────────────────────

interface HwBlockProps {
  hw: HomeworkItem;
  index: number;
  total: number;
  mode: PlayerMode;
  onRemove: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onItemCompleted: (id: string, type: string) => void;
  onStartTest: (testId: number) => Promise<any>;
  onSubmitTest: (payload: { test_id: number; answers: Record<string, string> }) => Promise<unknown>;
  onSubmitTask: (payload: { task_id: number; answers: Record<string, unknown> }) => Promise<unknown>;
}

function HwBlock({
  hw,
  index,
  total,
  mode,
  onRemove,
  onMoveUp,
  onMoveDown,
  onItemCompleted,
  onStartTest,
  onSubmitTest,
  onSubmitTask,
}: HwBlockProps) {
  // Provides localized labels for per-item homework badges.
  const { t } = useTranslation();
  // Bumped to remount FlowItemRenderer so homework attempt answers clear locally
  const [answerResetSeq, setAnswerResetSeq] = useState(0);

  const flowItem = (
    <FlowItemRenderer
      key={`hw-remount-${hw.item.id}-${answerResetSeq}`}
      item={hw.item}
      mode={mode}
      suppressAnswerFeedback={mode === "student"}
      isFirst={index === 0}
      isLast={index === total - 1}
      onComplete={() => onItemCompleted(hw.item.id, hw.item.type)}
      onStartTest={onStartTest}
      onSubmitTest={onSubmitTest}
      onSubmitTask={onSubmitTask}
    />
  );

  return (
    <div className="hw-block-row">
      {/* Copied-from-lesson badge */}
      {hw.copiedFromLesson && (
        <div className="hw-block-badge-from-lesson">
          <Copy size={10} strokeWidth={2.5} />
          {t("classroom.homework.fromLesson")}
        </div>
      )}

      {/* ⋯ block menu: teacher (reorder/delete) or student (reset answers only) */}
      {mode === "teacher" ? (
        <ExerciseBlockMenu
          onResetAnswers={() => setAnswerResetSeq((n) => n + 1)}
          onMoveUp={index > 0 ? onMoveUp : undefined}
          onMoveDown={index < total - 1 ? onMoveDown : undefined}
          onDelete={onRemove}
        >
          {flowItem}
        </ExerciseBlockMenu>
      ) : (
        <ExerciseBlockMenu onResetAnswers={() => setAnswerResetSeq((n) => n + 1)}>
          {flowItem}
        </ExerciseBlockMenu>
      )}
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface HomeworkPlayerProps {
  mode: PlayerMode;
  /** Classroom unit id — enables persisted homework sync + status workflow */
  unitId?: number | null;
  lessonTitle?: string;
  onAddContent?: () => void;
  onCreateExercise?: () => void;
  onItemCompleted?: (id: string, type: string) => void;
  onStartTest?: (testId: number) => Promise<any>;
  onSubmitTest?: (payload: { test_id: number; answers: Record<string, string> }) => Promise<unknown>;
  onSubmitTask?: (payload: { task_id: number; answers: Record<string, unknown> }) => Promise<unknown>;
  /** Teacher-only: persisted delete via the API */
  onDeleteItem?: (id: string) => Promise<void>;
  /** Teacher-only: persisted reorder via the API */
  onReorderItem?: (id: string, direction: "up" | "down") => Promise<void>;
}

// ─── Main component ───────────────────────────────────────────────────────────

/** Human-readable homework workflow labels for the student banner */
function homeworkStatusLabel(status: string, t: (key: string) => string): string {
  switch (status) {
    case "pending_review":
      return t("classroom.homework.status.pendingReview");
    case "awaiting_student":
      return t("classroom.homework.status.awaitingStudent");
    case "completed":
      return t("classroom.homework.status.completed");
    case "assigned":
    default:
      return t("classroom.homework.status.assigned");
  }
}

export default function HomeworkPlayer({
  mode,
  unitId = null,
  lessonTitle = "Lesson",
  onAddContent,
  onCreateExercise,
  onItemCompleted = () => {},
  onStartTest = async () => ({}),
  onSubmitTest = async () => ({}),
  onSubmitTask = async () => ({}),
  onDeleteItem,
  onReorderItem,
}: HomeworkPlayerProps) {
  // Provides localized labels for homework statuses, actions, and empty states.
  const { t } = useTranslation();
  const { items, removeItem, reorderItem } = useHomework();
  const {
    observedStudentId,
    applyHomeworkHydrationForStudent,
    applyTeacherHomeworkObserveHydration,
    getHomeworkLogicalAnswersSnapshot,
  } = useLiveSession();

  // Server-backed submission row for the current student (or defaults)
  const [submission, setSubmission] = useState<HomeworkSubmissionDto | null>(null);
  const [submitBusy, setSubmitBusy] = useState(false);
  const lastSavedJsonRef = useRef<string>("");

  const handleRemove = (id: string) =>
    onDeleteItem ? onDeleteItem(id) : removeItem(id);
  const handleReorder = (id: string, dir: "up" | "down") =>
    onReorderItem ? onReorderItem(id, dir) : reorderItem(id, dir);

  // Remount exercise blocks when the teacher switches observed student so stale WS keys disappear
  const remountKey =
    mode === "teacher"
      ? `hw-${unitId ?? 0}-t-${observedStudentId ?? "none"}`
      : `hw-${unitId ?? 0}-s`;

  // Student: load persisted answers once per unit
  useEffect(() => {
    if (mode !== "student" || !unitId) return;
    let cancelled = false;
    setSubmission(null);
    (async () => {
      try {
        const row = await homeworkSubmissionApi.getMine(unitId);
        if (cancelled) return;
        setSubmission(row);
        applyHomeworkHydrationForStudent((row.answers ?? {}) as Record<string, unknown>);
        lastSavedJsonRef.current = JSON.stringify(row.answers ?? {});
      } catch {
        if (!cancelled) setSubmission(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, unitId, applyHomeworkHydrationForStudent]);

  // Teacher: hydrate observed student's saved homework from REST (same UX as live lesson answers)
  useEffect(() => {
    if (mode !== "teacher" || !unitId || observedStudentId == null) return;
    let cancelled = false;
    (async () => {
      try {
        const row = await homeworkSubmissionApi.getForTeacher(unitId, observedStudentId);
        if (cancelled) return;
        applyTeacherHomeworkObserveHydration(observedStudentId, (row.answers ?? {}) as Record<string, unknown>);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, unitId, observedStudentId, applyTeacherHomeworkObserveHydration]);

  // Student: debounced autosave of logical homework patch map
  useEffect(() => {
    if (mode !== "student" || !unitId || !submission) return;
    if (submission.status === "completed") return;

    const tick = window.setInterval(async () => {
      const snap = getHomeworkLogicalAnswersSnapshot();
      const json = JSON.stringify(snap);
      if (json === lastSavedJsonRef.current) return;
      try {
        const next = await homeworkSubmissionApi.saveMine(unitId, {
          answers: snap,
          action: "save_draft",
        });
        setSubmission(next);
        lastSavedJsonRef.current = JSON.stringify(next.answers ?? {});
      } catch {
        /* ignore transient network errors */
      }
    }, 2500);

    return () => window.clearInterval(tick);
  }, [mode, unitId, submission, getHomeworkLogicalAnswersSnapshot]);

  const handleSubmitForReview = useCallback(async () => {
    if (!unitId || mode !== "student" || !submission) return;
    if (submission.status === "completed" || submission.status === "pending_review") return;
    setSubmitBusy(true);
    try {
      const snap = getHomeworkLogicalAnswersSnapshot();
      const next = await homeworkSubmissionApi.saveMine(unitId, {
        answers: snap,
        action: "submit_for_review",
      });
      setSubmission(next);
      lastSavedJsonRef.current = JSON.stringify(next.answers ?? {});
    } finally {
      setSubmitBusy(false);
    }
  }, [unitId, mode, submission, getHomeworkLogicalAnswersSnapshot]);

  const readOnlyHomework = mode === "student" && submission?.status === "completed";

  return (
    <div className="hw-player">
      {/* ── Header — matches lesson player section header style ────────── */}
      <div className="hw-player-header">
        <h2 className="hw-player-lesson-title">{lessonTitle}</h2>
        {items.length > 0 && (
          <span className="hw-player-header-count">{items.length}</span>
        )}
      </div>
      <div className="hw-player-header-rule" aria-hidden />

      {mode === "student" && submission && (
        <div className="hw-status-banner">
          <div className="hw-status-banner__row">
            <span className="hw-status-pill">{homeworkStatusLabel(submission.status, t)}</span>
            {submission.status !== "completed" &&
              submission.status !== "pending_review" && (
                <button
                  type="button"
                  className="hw-submit-review-btn"
                  disabled={submitBusy || items.length === 0}
                  onClick={() => void handleSubmitForReview()}
                >
                  {submitBusy ? "…" : t("classroom.homework.submitForReview")}
                </button>
              )}
          </div>
          {submission.teacher_feedback && submission.status === "awaiting_student" && (
            <p className="hw-teacher-feedback">{submission.teacher_feedback}</p>
          )}
        </div>
      )}

      {/* ── Body ──────────────────────────────────────────────────────────── */}
      <div className={`hw-player-body ${readOnlyHomework ? "hw-player-body--locked" : ""}`}>
        {items.length === 0 ? (
          /* Empty state — two action cards */
          mode === "teacher" ? (
            <div className="hw-empty">
              <div className="hw-empty-cards">
                <button
                  className="hw-empty-card hw-empty-card--active"
                  onClick={onAddContent}
                  disabled={!onAddContent}
                >
                  <Layers size={20} strokeWidth={1.8} className="hw-empty-card-icon" />
                  <span>{t("classroom.homework.pickExercise")}</span>
                </button>
                <button
                  className="hw-empty-card"
                  onClick={onCreateExercise}
                  disabled={!onCreateExercise}
                >
                  <Wand2 size={20} strokeWidth={1.8} className="hw-empty-card-icon" />
                  <span>{t("classroom.homework.createExercise")}</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="hw-empty">
              <p className="hw-empty-title">{t("classroom.homework.emptyTitle")}</p>
              <p className="hw-empty-sub">{t("classroom.homework.emptySubtitle")}</p>
            </div>
          )
        ) : (
          /* Exercise list */
          <div className="hw-blocks" key={remountKey}>
            {items.map((hw, index) => (
              <HwBlock
                key={hw.id}
                hw={hw}
                index={index}
                total={items.length}
                mode={mode}
                onRemove={() => handleRemove(hw.id)}
                onMoveUp={() => handleReorder(hw.id, "up")}
                onMoveDown={() => handleReorder(hw.id, "down")}
                onItemCompleted={onItemCompleted}
                onStartTest={onStartTest}
                onSubmitTest={onSubmitTest}
                onSubmitTask={onSubmitTask}
              />
            ))}

            {/* Add more controls (teacher only) */}
            {mode === "teacher" && (
              <div className="hw-add-more">
                {onAddContent && (
                  <button className="hw-add-btn" onClick={onAddContent}>
                    <Layers size={14} strokeWidth={2.5} />
                    {t("classroom.homework.pickExercise")}
                  </button>
                )}
                {onCreateExercise && (
                  <button className="hw-add-btn hw-add-btn--create" onClick={onCreateExercise}>
                    <Wand2 size={14} strokeWidth={2.5} />
                    {t("classroom.homework.createExercise")}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}