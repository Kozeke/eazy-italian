/**
 * exerciseBlock.types.ts
 *
 * The contract every exercise block component must satisfy.
 * Lives alongside SectionBlock.tsx, SlideBlock.tsx, etc.
 *
 * SectionBlock and FlowItemRenderer import from here.
 * Individual block files (SlideBlock, DragToGapBlock…) implement this interface.
 */

import type { LessonFlowItem } from "./lessonFlow.types";
import type { PlayerMode } from "./VerticalLessonPlayer";

export interface ExerciseBlockProps {
  item: LessonFlowItem;
  mode: PlayerMode;
  /**
   * When true (student doing unit homework), exercise UI must not reveal
   * correct/incorrect styling; wrong placements stay allowed. Lesson player and
   * teacher homework review omit this flag so green/red feedback behaves as usual.
   */
  suppressAnswerFeedback?: boolean;
  isFirst: boolean;
  isLast: boolean;
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
  onEditSlides?: (presentationId?: number) => void;
  onDeleteBlock?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}

export type ExerciseBlockComponent = React.ComponentType<ExerciseBlockProps>;