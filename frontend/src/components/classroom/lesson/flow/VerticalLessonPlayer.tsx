/**
 * VerticalLessonPlayer.tsx  (v4 — persist block answer clear)
 *
 * Changes from v3:
 *   • Added `onResetBlockAnswers` prop.
 *     When the teacher clicks "Сбросить ответы" in the block menu,
 *     SectionBlock calls this callback AFTER doing the local UI reset,
 *     so the server stores null-value sentinel rows for all affected fields.
 *     The callback is optional — absence is safe (no API call).
 */

import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { LessonFlow as LessonFlowModel, LessonFlowItem } from './lessonFlow.types';
import type { InlineMediaBlock } from '../useSegmentPersistence';
import type { CarouselSlide } from './ImageCarousel';
import { LiveSessionContext } from '../../live/LiveSessionProvider';
import {
  LIVE_LESSON_FOCUS_BLOCK_KEY,
  type LiveLessonFocusPayload,
} from '../../live/liveSession.types';
import SectionBlock from './SectionBlock';

export type PlayerMode = 'student' | 'teacher';

// ─── Section grouping ─────────────────────────────────────────────────────────

type GroupedSection = {
  id: string;
  label: string;
  items: LessonFlowItem[];
};

type SectionDefinition = {
  id: string;
  label: string;
};

function groupIntoSections(
  items: LessonFlowItem[],
  sectionDefinitions?: SectionDefinition[],
): GroupedSection[] {
  if (sectionDefinitions && sectionDefinitions.length > 0) {
    const scaffold = sectionDefinitions.map((section) => ({
      id: section.id,
      label: section.label,
      items: [] as LessonFlowItem[],
    }));

    const nonDividerItems = items.filter((item) => item.type !== 'divider');
    if (scaffold.length > 0 && nonDividerItems.length > 0) {
      scaffold[0].items = nonDividerItems;
    }
    return scaffold;
  }

  const sections: GroupedSection[] = [];
  let current: GroupedSection = { id: 'section-0', label: 'Lesson', items: [] };

  for (const item of items) {
    if (item.type === 'divider') {
      if (current.items.length > 0) sections.push(current);
      current = { id: `section-${item.id}`, label: item.label ?? 'Section', items: [] };
      continue;
    }
    current.items.push(item);
  }

  sections.push(current);
  return sections;
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface VerticalLessonPlayerProps {
  flow: LessonFlowModel;
  mode: PlayerMode;
  sectionDefinitions?: SectionDefinition[];
  onActiveSectionChange?: (index: number) => void;
  onScrollToSectionReady?: ((scrollToSection: (index: number) => void) => void) | null;
  onItemCompleted: (id: string, type: string) => void;
  onStartTest: (testId: number) => Promise<any>;
  onSubmitTest: (payload: { test_id: number; answers: Record<string, string> }) => Promise<unknown>;
  onLoadTask?: (taskId: number) => Promise<any>;
  onSubmitTask: (payload: { task_id: number; answers: Record<string, unknown> }) => Promise<unknown>;
  onOpenTask?: (task: any) => void;
  onOpenTest?: (test: any) => void;
  loading?: boolean;
  onEditSlides?: (presentationId?: number) => void;
  onFinish?: () => void;
  onAddContent?: (sectionId?: string) => void;

  // ── Exercise block menu actions (teacher only) ──────────────────────────────
  /** Called when teacher clicks "Удалить упражнение" in the block menu */
  onDeleteBlock?: (blockId: string) => void;
  /** Called when teacher clicks move up/down in the block menu */
  onReorderBlock?: (blockId: string, direction: 'up' | 'down') => void;
  /** Called when teacher clicks "Редактировать упражнение" or "Редактировать" */
  onEditBlock?: (blockId: string) => void;
  /** Teacher: copy a segment inline exercise into unit homework (persisted). */
  onCopyExerciseToHomework?: (block: InlineMediaBlock) => void | Promise<void>;
  /** Teacher: live section title edits — parent debounces and persists to the API. */
  onSectionTitleChange?: (sectionId: string, newTitle: string) => void;
  /**
   * Teacher: persist a block answer clear to the server.
   * Called by SectionBlock after the local UI reset so null-value sentinel rows
   * are written to exercise_field_answer_events.
   * Signature matches classroomAnswersApi.clearBlockAnswers.
   *   blockId    — the exercise block that was reset
   *   studentId  — undefined → clear all students; number → clear one student
   */
  onResetBlockAnswers?: (blockId: string, studentId?: number) => Promise<void>;

  // ── Inline media ────────────────────────────────────────────────────────────
  inlineMediaBySectionId?: Record<string, InlineMediaBlock[]>;
  onInlineMediaChange?: (sectionId: string, blocks: InlineMediaBlock[]) => void;
  pendingInlineMedia?: {
    id: string;
    kind: 'image' | 'video' | 'audio';
    url: string;
    caption: string;
  } | null;
  pendingInlineMediaTargetSectionId?: string | null;
  onInlineMediaConsumed?: () => void;

  // ── Carousel ────────────────────────────────────────────────────────────────
  carouselSlidesBySectionId?: Record<string, CarouselSlide[]>;
  onCarouselSlidesChange?: (sectionId: string, slides: CarouselSlide[]) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function VerticalLessonPlayer({
  flow,
  mode,
  sectionDefinitions,
  onActiveSectionChange,
  onScrollToSectionReady,
  onItemCompleted,
  onStartTest,
  onSubmitTest,
  onLoadTask,
  onSubmitTask,
  onOpenTask,
  onOpenTest,
  loading,
  onEditSlides,
  onFinish: _onFinish,
  onAddContent,
  onDeleteBlock,
  onReorderBlock,
  onEditBlock,
  onCopyExerciseToHomework,
  onSectionTitleChange,
  onResetBlockAnswers,          // ← NEW
  inlineMediaBySectionId,
  onInlineMediaChange,
  pendingInlineMedia,
  pendingInlineMediaTargetSectionId,
  onInlineMediaConsumed,
  carouselSlidesBySectionId,
  onCarouselSlidesChange,
}: VerticalLessonPlayerProps) {
  const sections = useMemo(
    () => groupIntoSections(flow.items, sectionDefinitions),
    [flow.items, sectionDefinitions],
  );
  const sectionRefs = useRef<Array<HTMLElement | null>>([]);
  const [activeSectionIndex, setActiveSectionIndex] = useState(0);

  const programmaticScrollAtRef = useRef(0);
  const handleProgrammaticScroll = useCallback(() => {
    programmaticScrollAtRef.current = Date.now();
  }, []);

  const liveSession = useContext(LiveSessionContext);

  useEffect(() => {
    if (!sections.length) {
      setActiveSectionIndex(0);
      return;
    }
    setActiveSectionIndex((prev) =>
      Math.max(0, Math.min(prev, sections.length - 1)),
    );
  }, [sections]);

  useEffect(() => {
    if (!pendingInlineMediaTargetSectionId || sections.length === 0) return;
    const targetIndex = sections.findIndex(
      (section) => section.id === pendingInlineMediaTargetSectionId,
    );
    if (targetIndex >= 0) {
      setActiveSectionIndex(targetIndex);
    }
  }, [pendingInlineMediaTargetSectionId, sections]);

  useEffect(() => {
    onActiveSectionChange?.(activeSectionIndex);
  }, [activeSectionIndex, onActiveSectionChange]);

  // ── Scroll position persistence ───────────────────────────────────────────
  useEffect(() => {
    const saved = sessionStorage.getItem('lessonScrollY');
    if (saved) window.scrollTo(0, Number(saved));

    const saveScroll = () => {
      if (Date.now() - programmaticScrollAtRef.current < 1500) return;
      sessionStorage.setItem('lessonScrollY', String(window.scrollY));
    };
    window.addEventListener('scroll', saveScroll, { passive: true });
    return () => window.removeEventListener('scroll', saveScroll);
  }, []);

  const scrollToSection = useCallback(
    (index: number) => {
      if (index < 0 || index >= sections.length) return;
      setActiveSectionIndex(index);
    },
    [sections.length],
  );

  // Teacher "Внимание на упражнение": jump to the right segment if needed, then scroll the block into view
  useEffect(() => {
    if (mode !== 'student' || !liveSession) return;
    return liveSession.subscribe(LIVE_LESSON_FOCUS_BLOCK_KEY, (raw) => {
      const v = raw as Partial<LiveLessonFocusPayload> | null;
      if (!v || typeof v.blockId !== 'string' || !v.blockId) return;
      const blockId = v.blockId;

      const sectionIndexForBlock = sections.findIndex((section) => {
        if (section.items.some((it) => it.id === blockId)) return true;
        const media = inlineMediaBySectionId?.[section.id];
        return media?.some((b) => b.id === blockId) ?? false;
      });
      if (sectionIndexForBlock < 0) return;

      const runScroll = () => {
        const safeId =
          typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
            ? CSS.escape(blockId)
            : blockId.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const el = document.querySelector<HTMLElement>(
          `[data-lesson-focus-anchor="${safeId}"]`,
        );
        if (!el) return;
        handleProgrammaticScroll();
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      };

      scrollToSection(sectionIndexForBlock);
      requestAnimationFrame(() => {
        requestAnimationFrame(runScroll);
      });
    });
  }, [
    mode,
    liveSession,
    sections,
    inlineMediaBySectionId,
    scrollToSection,
    handleProgrammaticScroll,
  ]);

  useEffect(() => {
    if (!onScrollToSectionReady) return;
    onScrollToSectionReady(scrollToSection);
    return () => onScrollToSectionReady(() => {});
  }, [onScrollToSectionReady, scrollToSection]);

  const handleMediaChange = useCallback(
    (sectionId: string, blocks: InlineMediaBlock[]) => onInlineMediaChange?.(sectionId, blocks),
    [onInlineMediaChange],
  );

  const handleCarouselChange = useCallback(
    (sectionId: string, slides: CarouselSlide[]) => onCarouselSlidesChange?.(sectionId, slides),
    [onCarouselSlidesChange],
  );

  const handleAddContent = useCallback(
    (sectionId: string) => {
      const targetIndex = sections.findIndex((section) => section.id === sectionId);
      if (targetIndex >= 0) setActiveSectionIndex(targetIndex);
      onAddContent?.(sectionId);
    },
    [onAddContent, sections],
  );

  const sectionCallbacks = useMemo(
    () =>
      sections.map((section, index) => ({
        setRef: (el: HTMLElement | null) => { sectionRefs.current[index] = el; },
        onMediaBlocksChange: onInlineMediaChange
          ? (blocks: InlineMediaBlock[]) => handleMediaChange(section.id, blocks)
          : undefined,
        onCarouselSlidesChange: onCarouselSlidesChange
          ? (slides: CarouselSlide[]) => handleCarouselChange(section.id, slides)
          : undefined,
        onAddContent: onAddContent ? () => handleAddContent(section.id) : undefined,
        onScrollToPrev: () => scrollToSection(index - 1),
        onScrollToNext: () => scrollToSection(index + 1),
      })),
    [sections, onInlineMediaChange, onCarouselSlidesChange, onAddContent, handleMediaChange, handleCarouselChange, handleAddContent, scrollToSection],
  );

  return (
    <div className="vlp-root">
      <div className="vlp-canvas">
        {sections.length > 0 && (() => {
          const i = activeSectionIndex;
          const section = sections[i];
          const callbacks = sectionCallbacks[i];
          const isTarget =
            pendingInlineMedia != null &&
            (pendingInlineMediaTargetSectionId === section.id ||
              (!pendingInlineMediaTargetSectionId && i === 0));
          return (
            <SectionBlock
              key={section.id}
              ref={callbacks?.setRef}
              sectionId={section.id}
              label={section.label}
              index={i}
              total={sections.length}
              items={section.items}
              mode={mode}
              onItemCompleted={onItemCompleted}
              onStartTest={onStartTest}
              onSubmitTest={onSubmitTest}
              onLoadTask={onLoadTask}
              onSubmitTask={onSubmitTask}
              onOpenTask={onOpenTask}
              onOpenTest={onOpenTest}
              loading={loading}
              onEditSlides={onEditSlides}
              onDeleteBlock={onDeleteBlock}
              onReorderBlock={onReorderBlock}
              onEditBlock={onEditBlock}
              onCopyExerciseToHomework={onCopyExerciseToHomework}
              onSectionTitleChange={
                onSectionTitleChange
                  ? (newTitle: string) => onSectionTitleChange(section.id, newTitle)
                  : undefined
              }
              onResetBlockAnswers={onResetBlockAnswers}  
              mediaBlocks={inlineMediaBySectionId?.[section.id]}
              onMediaBlocksChange={callbacks?.onMediaBlocksChange}
              pendingInlineMedia={
                isTarget && pendingInlineMedia
                  ? {
                      id: pendingInlineMedia.id,
                      kind: pendingInlineMedia.kind,
                      url: pendingInlineMedia.url ?? '',
                      caption: pendingInlineMedia.caption ?? '',
                    }
                  : null
              }
              onInlineMediaConsumed={isTarget ? onInlineMediaConsumed : undefined}
              onProgrammaticScroll={handleProgrammaticScroll}
              carouselSlides={carouselSlidesBySectionId?.[section.id]}
              onCarouselSlidesChange={callbacks?.onCarouselSlidesChange}
              onAddContent={callbacks?.onAddContent}
              onScrollToPrev={callbacks.onScrollToPrev}
              onScrollToNext={callbacks.onScrollToNext}
              completedSteps={flow.completedSteps}
              totalSteps={flow.totalSteps}
            />
          );
        })()}
      </div>
    </div>
  );
}