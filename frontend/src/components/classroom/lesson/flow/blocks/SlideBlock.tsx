/**
 * SlideBlock.tsx  (v2 — mode-aware)
 *
 * Student mode: renders content block with completion badge.
 * Teacher mode: + hover toolbar (Edit / Delete / Move Up / Move Down).
 *
 * ─── Wiring to legacy step UIs (lesson/*.tsx, not lesson/flow/*.tsx) ───────────
 * Vertical lesson stack: SectionBlock → FlowItemRenderer → (registry) → THIS FILE.
 * exerciseRegistrations.ts maps slides | video | task | test | mcq | cloze here.
 * This block still mounts the older presentational steps:
 *   • slides  → SlidesSection → SlideStep
 *   • video   → VideoStep
 *   • task    → TaskStep
 *   • test    → TestStep
 * Newer exercise types bypass this file (their own blocks under flow/blocks/).
 */

import { useState } from "react";
import { Pencil, Trash2, ArrowUp, ArrowDown } from "lucide-react";

import type { LessonFlowItem } from "../lessonFlow.types";
import type { PlayerMode } from "../VerticalLessonPlayer";
import SlidesSection from "../../SlidesSection";
import VideoStep from "../../VideoStep";
import TaskStep from "../../TaskStep";
import TestStep from "../../TestStep";

// ─── Props ────────────────────────────────────────────────────────────────────

interface SlideBlockProps {
  item: LessonFlowItem;
  mode: PlayerMode;
  isFirst?: boolean;
  isLast?: boolean;

  onComplete: () => void;
  onStartTest: (testId: number) => Promise<any>;
  onSubmitTest: (payload: {
    test_id: number;
    answers: Record<string, string>;
  }) => Promise<unknown>;
  onLoadTask?: (taskId: number) => Promise<any>;
  onSubmitTask: (payload: {
    task_id: number;
    answers: Record<string, unknown>;
  }) => Promise<unknown>;
  onOpenTask?: (task: any) => void;
  onOpenTest?: (test: any) => void;
  loading?: boolean;

  // Teacher-only
  onEditSlides?: (presentationId?: number) => void;
  onDeleteBlock?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}

// ─── TeacherBlockToolbar ─────────────────────────────────────────────────────

interface TeacherBlockToolbarProps {
  item: LessonFlowItem;
  onEditSlides?: (presentationId?: number) => void;
  onDelete?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}

function TeacherBlockToolbar({
  item,
  onEditSlides,
  onDelete,
  onMoveUp,
  onMoveDown,
}: TeacherBlockToolbarProps) {
  const showEdit = item.type === "slides" && onEditSlides;

  return (
    <div className="vlp-block-toolbar" aria-label="Block actions">
      {showEdit && (
        <button
          type="button"
          className="vlp-block-toolbar-btn vlp-block-toolbar-btn--edit"
          onClick={() =>
            onEditSlides(
              item.type === "slides" ? (item as any).presentationId : undefined,
            )
          }
          aria-label="Edit slides"
          title="Edit slides"
        >
          <Pencil size={13} />
          <span>Edit</span>
        </button>
      )}

      {onMoveUp && (
        <button
          type="button"
          className="vlp-block-toolbar-btn"
          onClick={onMoveUp}
          aria-label="Move block up"
          title="Move up"
        >
          <ArrowUp size={13} />
        </button>
      )}

      {onMoveDown && (
        <button
          type="button"
          className="vlp-block-toolbar-btn"
          onClick={onMoveDown}
          aria-label="Move block down"
          title="Move down"
        >
          <ArrowDown size={13} />
        </button>
      )}

      {onDelete && (
        <button
          type="button"
          className="vlp-block-toolbar-btn vlp-block-toolbar-btn--delete"
          onClick={onDelete}
          aria-label="Delete block"
          title="Delete block"
        >
          <Trash2 size={13} />
        </button>
      )}
    </div>
  );
}

// ─── SlideBlock ───────────────────────────────────────────────────────────────

export default function SlideBlock({
  item,
  mode,
  isFirst = false,
  isLast = false,
  onComplete,
  onStartTest,
  onSubmitTest,
  onLoadTask,
  onSubmitTask,
  onOpenTask,
  onOpenTest,
  loading,
  onEditSlides,
  onDeleteBlock,
  onMoveUp,
  onMoveDown,
}: SlideBlockProps) {
  const isTeacher = mode === "teacher";
  const [completed, setCompleted] = useState(
    (item as any).status === "completed",
  );

  const handleComplete = () => {
    setCompleted(true);
    onComplete();
  };

  const label = (item as any).label ?? item.type;

  return (
    <article
      className={[
        "vlp-block",
        `vlp-block--${item.type}`,
        completed ? "vlp-block--done" : "",
        isTeacher ? "vlp-block--teacher" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={label}
    >
      {/* Completion badge (student + teacher) */}
      {completed && (
        <div className="vlp-block-badge" aria-label="Completed">
          ✓
        </div>
      )}

      {/* Teacher toolbar — visible on hover via CSS */}
      {isTeacher && (
        <TeacherBlockToolbar
          item={item}
          onEditSlides={onEditSlides}
          onDelete={onDeleteBlock}
          onMoveUp={!isFirst ? onMoveUp : undefined}
          onMoveDown={!isLast ? onMoveDown : undefined}
        />
      )}

      {/* ── Content renderers ────────────────────────────────────────────── */}

      {item.type === "slides" && (
        <SlidesSection
          slides={item.slides}
          onProgressChange={(p) => {
            if (p.completed) handleComplete();
          }}
          locked={item.locked}
          forcedSlide={item.forcedSlide}
        />
      )}

      {item.type === "video" && (
        <VideoStep
          video={item.video}
          onProgressChange={(p) => {
            if (p.completed) handleComplete();
          }}
          locked={item.locked}
        />
      )}

      {item.type === "task" && (
        <TaskStep
          task={item.task}
          submission={item.submission as any}
          onSubmitTask={async (payload) => {
            await onSubmitTask?.(payload);
            handleComplete();
          }}
          onLoadTask={onLoadTask}
          onOpenFull={onOpenTask}
          loading={loading}
        />
      )}

      {item.type === "test" && (
        <TestStep
          test={item.test}
          attempt={item.attempt as any}
          onStartTest={onStartTest}
          onSubmitTest={async (payload) => {
            await onSubmitTest?.(payload);
            handleComplete();
          }}
          onOpenFull={onOpenTest}
          loading={loading}
        />
      )}
    </article>
  );
}
