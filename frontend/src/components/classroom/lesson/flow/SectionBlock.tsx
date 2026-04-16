/**
 * SectionBlock.tsx  (v8 — controlled mediaBlocks vs undefined)
 *
 * Responsibilities:
 *   • Section chrome: header, rename, inline media cards, carousel, nav
 *   • Delegates ALL exercise rendering to <FlowItemRenderer>
 *   • Wraps each exercise in <ExerciseBlockMenu> (teacher: full menu;
 *     student: reset-only) so answers can be cleared via "Сбросить ответы".
 *
 * Adding a new exercise type requires ZERO changes here.
 * Edit exerciseRegistrations.ts and create the block component.
 *
 * Extracted to their own files (same folder):
 *   ImageCarouselEditor / ImageCarouselViewer  →  ./ImageCarousel
 *   FlowItemRenderer                           →  ./FlowItemRenderer
 *   ExerciseBlockMenu                          →  ./ExerciseBlockMenu
 */

import React, { forwardRef, useCallback, useContext, useEffect, useRef, useState } from "react";
import {
  Pencil,
  X,
  Image,
  Video,
  Music,
  Upload,
  PlusCircle,
} from "lucide-react";

import type { LessonFlowItem } from "./lessonFlow.types";
import type { PlayerMode } from "./VerticalLessonPlayer";
import { SEGMENT_EDITABLE_EXERCISE_KINDS } from "../../../../pages/admin/exerciseTemplateRegistry";
import { FlowItemRenderer } from "./FlowItemRenderer";
import { ImageCarouselEditor, ImageCarouselViewer } from "./ImageCarousel.tsx";
import type { CarouselSlide } from "./ImageCarousel.tsx";
import BottomNavigation from "./BottomNavigation";
import type { InlineMediaBlock } from "../useSegmentPersistence";
import ExerciseBlockMenu from "./ExerciseBlockMenu";
import "./ExerciseBlockMenu.css";
import { LiveSessionContext } from "../../live/LiveSessionProvider";
import {
  LIVE_LESSON_FOCUS_BLOCK_KEY,
  LIVE_LESSON_RESET_BLOCK_KEY,
  type LiveLessonResetBlockPayload,
} from "../../live/liveSession.types";
import { markBlockReset } from "../../../../hooks/useLiveSession";

// ─── Inline media types ───────────────────────────────────────────────────────

type MediaKind = "image" | "video" | "audio" | "carousel_slides";

const MEDIA_META: Record<
  MediaKind,
  {
    label: string;
    color: string;
    bg: string;
    border: string;
    icon: React.ReactNode;
    placeholder: string;
  }
> = {
  image: {
    label: "Image",
    color: "#0891b2",
    bg: "#ecfeff",
    border: "#a5f3fc",
    icon: <Image size={15} strokeWidth={1.8} />,
    placeholder: "Paste an image URL…",
  },
  video: {
    label: "Video",
    color: "#7c3aed",
    bg: "#f5f3ff",
    border: "#c4b5fd",
    icon: <Video size={15} strokeWidth={1.8} />,
    placeholder: "Paste a YouTube / Vimeo URL…",
  },
  audio: {
    label: "Audio",
    color: "#0d9488",
    bg: "#f0fdfa",
    border: "#5eead4",
    icon: <Music size={15} strokeWidth={1.8} />,
    placeholder: "Paste an audio file URL…",
  },
  carousel_slides: {
    label: "Image Carousel",
    color: "#d97706",
    bg: "#fffbeb",
    border: "#fde68a",
    icon: <Image size={15} strokeWidth={1.8} />,
    placeholder: "",
  },
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface SectionBlockProps {
  sectionId: string;
  label: string;
  index: number;
  total: number;
  items: LessonFlowItem[];
  mode: PlayerMode;

  onItemCompleted: (id: string, type: string) => void;
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
  onAddContent?: () => void;
  /** Teacher: called on every keystroke while renaming — parent debounces persistence. */
  onSectionTitleChange?: (newLabel: string) => void;
  onDeleteBlock?: (blockId: string) => void;
  onReorderBlock?: (blockId: string, direction: "up" | "down") => void;
  /** Called when teacher clicks "Edit exercise" or "Edit (new version)" in the block menu */
  onEditBlock?: (blockId: string) => void;
  /** Teacher: copy a persisted segment exercise into unit homework (saved via API). */
  onCopyExerciseToHomework?: (block: InlineMediaBlock) => void | Promise<void>;

  // Inline navigation
  onScrollToPrev: () => void;
  onScrollToNext: () => void;
  completedSteps: number;
  totalSteps: number;

  // Inline media
  mediaBlocks?: InlineMediaBlock[];
  onMediaBlocksChange?: (blocks: InlineMediaBlock[]) => void;
  pendingInlineMedia?: {
    id: string;
    kind: "image" | "video" | "audio";
    url: string;
    caption: string;
  } | null;
  onInlineMediaConsumed?: () => void;
  onProgrammaticScroll?: () => void;

  // Carousel
  carouselSlides?: CarouselSlide[];
  onCarouselSlidesChange?: (slides: CarouselSlide[]) => void;
}

// ─── InlineMediaPreview ───────────────────────────────────────────────────────

function InlineMediaPreview({
  block,
  meta,
}: {
  block: InlineMediaBlock & { kind: "image" | "video" | "audio" };
  meta: (typeof MEDIA_META)[MediaKind];
}) {
  if (block.kind === "image") {
    return (
      <div className="vlp-inline-media-preview">
        <img
          src={block.url ?? ""}
          alt={block.caption || "Preview"}
          style={{
            maxWidth: "100%",
            maxHeight: 260,
            objectFit: "contain",
            display: "block",
            borderRadius: 8,
          }}
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      </div>
    );
  }
  if (block.kind === "video") {
    const yt = (block.url ?? "").match(
      /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([a-zA-Z0-9_-]{11})/,
    );
    if (yt) {
      return (
        <div
          style={{
            borderRadius: 10,
            overflow: "hidden",
            aspectRatio: "16/9",
            background: "#000",
          }}
        >
          <iframe
            src={`https://www.youtube.com/embed/${yt[1]}`}
            style={{ width: "100%", height: "100%", border: "none", display: "block" }}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            title="Video preview"
          />
        </div>
      );
    }
    return (
      <p style={{ fontSize: 12, color: meta.color, margin: 0, padding: "8px 0" }}>
        Preview available after saving.
      </p>
    );
  }
  if (block.kind === "audio") {
    return (
      <audio src={block.url ?? ""} controls style={{ width: "100%", borderRadius: 8 }} />
    );
  }
  return null;
}

// ─── InlineMediaCard ──────────────────────────────────────────────────────────

function InlineMediaCard({
  block,
  onChange,
  onRemove,
}: {
  block: InlineMediaBlock & { kind: "image" | "video" | "audio" };
  onChange: (patch: Partial<InlineMediaBlock>) => void;
  onRemove: () => void;
}) {
  const meta = MEDIA_META[block.kind];
  const [focused, setFocused] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="vlp-inline-media">
      <div
        className="vlp-inline-media-header"
        style={{ background: meta.bg, borderBottom: `1px solid ${meta.border}` }}
      >
        <span
          className="vlp-inline-media-icon"
          style={{ color: meta.color, border: `1.5px solid ${meta.border}` }}
        >
          {meta.icon}
        </span>
        <span className="vlp-inline-media-label" style={{ color: meta.color }}>
          {meta.label}
        </span>
        <button
          type="button"
          className="vlp-inline-media-remove"
          onClick={onRemove}
          aria-label={`Remove ${meta.label} block`}
          style={{ color: meta.color }}
        >
          <X size={13} strokeWidth={2.2} />
        </button>
      </div>

      <div className="vlp-inline-media-body">
        <div className="vlp-inline-media-url-row">
          <input
            type="url"
            value={block.url ?? ""}
            onChange={(e) => onChange({ url: e.target.value })}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={meta.placeholder}
            className="vlp-inline-media-url"
            style={{
              borderColor: focused ? meta.color : undefined,
              background: focused ? meta.bg : undefined,
            }}
          />
          {block.kind === "image" && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onChange({ url: URL.createObjectURL(f) });
                }}
              />
              <button
                type="button"
                className="vlp-inline-media-upload"
                onClick={() => fileRef.current?.click()}
                title="Upload image"
              >
                <Upload size={14} strokeWidth={2} />
              </button>
            </>
          )}
        </div>

        {(block.url ?? "").trim() && <InlineMediaPreview block={block} meta={meta} />}

        <input
          type="text"
          value={block.caption ?? ""}
          onChange={(e) => onChange({ caption: e.target.value })}
          placeholder="Caption (optional)"
          className="vlp-inline-media-caption"
        />
      </div>
    </div>
  );
}

// ─── SectionBlock ─────────────────────────────────────────────────────────────

const SectionBlock = forwardRef<HTMLElement, SectionBlockProps>(
  (
    {
      sectionId: _sectionId,
      label,
      index,
      total,
      items,
      mode,
      onItemCompleted,
      onStartTest,
      onSubmitTest,
      onLoadTask,
      onSubmitTask,
      onOpenTask,
      onOpenTest,
      loading,
      onEditSlides,
      onAddContent,
      onSectionTitleChange,
      onDeleteBlock,
      onReorderBlock,
      onEditBlock,
      onCopyExerciseToHomework,
      onScrollToPrev,
      onScrollToNext,
      completedSteps,
      totalSteps,
      mediaBlocks: controlledMediaBlocks,
      onMediaBlocksChange,
      pendingInlineMedia,
      onInlineMediaConsumed,
      onProgrammaticScroll,
      carouselSlides,
      onCarouselSlidesChange,
    },
    ref,
  ) => {
    const isTeacher = mode === "teacher";
    const isEmpty = items.length === 0;

    // Live classroom WS — teacher-only patches scroll targets for students
    const liveSession = useContext(LiveSessionContext);

    const isSimpleMediaBlock = (
      block: InlineMediaBlock,
    ): block is InlineMediaBlock & { kind: "image" | "video" | "audio" } =>
      block.kind === "image" || block.kind === "video" || block.kind === "audio";

    // ── Inline media state ─────────────────────────────────────────────────────
    const [localMediaBlocks, setLocalMediaBlocks] = useState<InlineMediaBlock[]>(
      controlledMediaBlocks ?? [],
    );
    // True when parent persists media (teacher); then missing prop means "no blocks", not "use local cache".
    const isMediaOwnedByParent = Boolean(onMediaBlocksChange);
    const mediaBlocks = isMediaOwnedByParent
      ? (controlledMediaBlocks ?? [])
      : (controlledMediaBlocks ?? localMediaBlocks);

    const mediaBlocksRef = useRef(mediaBlocks);
    useEffect(() => { mediaBlocksRef.current = mediaBlocks; }, [mediaBlocks]);

    const scrollToBlockIdRef = useRef<string | null>(null);
    const consumedMediaIdsRef = useRef(new Set<string>());

    const commitMediaBlocks = (
      updater: (prev: InlineMediaBlock[]) => InlineMediaBlock[],
    ) => {
      if (onMediaBlocksChange) {
        onMediaBlocksChange(updater(mediaBlocksRef.current));
        return;
      }
      setLocalMediaBlocks((prev) => updater(prev));
    };

    useEffect(() => {
      const id = scrollToBlockIdRef.current;
      if (!id) return;
      const el = document.querySelector<HTMLElement>(`[data-block-id="${id}"]`);
      if (!id) return;
      scrollToBlockIdRef.current = null;
      onProgrammaticScroll?.();
      el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });

    useEffect(() => {
      if (!pendingInlineMedia) return;
      if (consumedMediaIdsRef.current.has(pendingInlineMedia.id)) return;
      consumedMediaIdsRef.current.add(pendingInlineMedia.id);
      commitMediaBlocks((prev) =>
        prev.some((b) => b.id === pendingInlineMedia.id) ? prev : [...prev, pendingInlineMedia],
      );
      scrollToBlockIdRef.current = pendingInlineMedia.id;
      onInlineMediaConsumed?.();
    }, [pendingInlineMedia, onInlineMediaConsumed]);

    const updateMedia = (id: string, patch: Partial<InlineMediaBlock>) =>
      commitMediaBlocks((prev) =>
        prev.map((m) => (m.id === id ? { ...m, ...patch } : m)),
      );

    const removeMedia = (id: string) =>
      commitMediaBlocks((prev) => prev.filter((m) => m.id !== id));

    // ── Section title inline edit (teacher) ────────────────────────────────────
    const [isRenaming, setIsRenaming] = useState(false);
    const [draftLabel, setDraftLabel] = useState(label);
    const renameInputRef = useRef<HTMLInputElement>(null);
    // Snapshot of the title when edit mode opens — used to revert on Escape
    const renameBaselineRef = useRef(label);

    useEffect(() => {
      if (!isRenaming) setDraftLabel(label);
    }, [label, isRenaming]);

    const startRename = () => {
      renameBaselineRef.current = label;
      setDraftLabel(label);
      setIsRenaming(true);
      requestAnimationFrame(() => renameInputRef.current?.focus());
    };

    const finishRename = () => {
      const trimmed = draftLabel.trim();
      if (!trimmed) {
        const fallback =
          renameBaselineRef.current.trim() || `Section ${index + 1}`;
        onSectionTitleChange?.(fallback);
        setDraftLabel(fallback);
      }
      setIsRenaming(false);
    };

    const revertRename = () => {
      onSectionTitleChange?.(renameBaselineRef.current);
      setDraftLabel(renameBaselineRef.current);
      setIsRenaming(false);
    };

    const handleTitleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value;
      setDraftLabel(v);
      onSectionTitleChange?.(v);
    };

    const handleTitleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        renameInputRef.current?.blur();
      }
      if (e.key === "Escape") {
        e.preventDefault();
        revertRename();
      }
    };

    const handleTitleHeadingKeyDown = (e: React.KeyboardEvent<HTMLHeadingElement>) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        startRename();
      }
    };

    // Per-exercise counter so changing the key remounts FlowItemRenderer and clears local answer state
    const [answerResetSeqByBlockId, setAnswerResetSeqByBlockId] = useState<
      Record<string, number>
    >({});
    // Remounts the flow block for blockId so typed/dragged answers return to a blank attempt.
    // markBlockReset MUST be called before the state update so the flag is set before the new
    // component mounts and its useLiveSyncField subscribe fires — otherwise the stale WS-cached
    // value replays into the freshly mounted component and undoes the reset.
    const bumpAnswerReset = useCallback((blockId: string) => {
      markBlockReset(blockId);
      setAnswerResetSeqByBlockId((prev) => ({
        ...prev,
        [blockId]: (prev[blockId] ?? 0) + 1,
      }));
    }, []);

    /**
     * Teacher-side reset: bumps local seq AND broadcasts over the live session
     * so ALL connected students' answers for this block are cleared instantly.
     * Students call bumpAnswerReset directly (local-only).
     */
    const teacherResetBlock = useCallback(
      (blockId: string) => {
        bumpAnswerReset(blockId);
        if (liveSession?.role === "teacher") {
          liveSession.patch(LIVE_LESSON_RESET_BLOCK_KEY, {
            blockId,
            t: Date.now(),
          });
        }
      },
      [bumpAnswerReset, liveSession],
    );

    // Students: listen for teacher-initiated resets and clear the matching block locally
    useEffect(() => {
      if (!liveSession || liveSession.role !== "student") return;
      return liveSession.subscribe(LIVE_LESSON_RESET_BLOCK_KEY, (raw) => {
        const v = raw as Partial<LiveLessonResetBlockPayload> | null;
        if (!v || typeof v.blockId !== "string" || !v.blockId) return;
        bumpAnswerReset(v.blockId);
      });
    }, [liveSession, bumpAnswerReset]);

    const hasMedia = mediaBlocks.length > 0;
    const hasContent = !isEmpty || hasMedia;

    return (
      <section
        ref={ref}
        className={["vlp-section", isTeacher ? "vlp-section--teacher" : ""]
          .filter(Boolean)
          .join(" ")}
        id={`section-${index}`}
        aria-label={`Section ${index + 1}: ${label}`}
      >
        {/* ── Section Header ──────────────────────────────────────────────── */}
        <header className="vlp-section-header">
          <div className="vlp-section-title-row">
            {isRenaming ? (
              <input
                ref={renameInputRef}
                type="text"
                className="vlp-section-title-input"
                value={draftLabel}
                onChange={handleTitleInputChange}
                onBlur={finishRename}
                onKeyDown={handleTitleInputKeyDown}
                maxLength={120}
                aria-label="Section title"
              />
            ) : (
              <>
                <h2
                  className={
                    isTeacher && onSectionTitleChange
                      ? "vlp-section-title vlp-section-title--editable"
                      : "vlp-section-title"
                  }
                  onClick={
                    isTeacher && onSectionTitleChange ? startRename : undefined
                  }
                  onKeyDown={
                    isTeacher && onSectionTitleChange
                      ? handleTitleHeadingKeyDown
                      : undefined
                  }
                  role={isTeacher && onSectionTitleChange ? "button" : undefined}
                  tabIndex={isTeacher && onSectionTitleChange ? 0 : undefined}
                >
                  {label}
                </h2>
                {isTeacher && onSectionTitleChange && (
                  <button
                    type="button"
                    className="vlp-section-edit-btn"
                    onClick={startRename}
                    aria-label="Rename section"
                    title="Rename section"
                  >
                    <Pencil size={13} />
                  </button>
                )}
              </>
            )}
            <div className="vlp-section-eyebrow">
              Section {index + 1}{total > 1 ? ` of ${total}` : ""}
            </div>
          </div>
          <div className="vlp-section-rule" aria-hidden />
        </header>

        {/* ── Content area ──────────────────────────────────────────────────── */}
        <div className="vlp-section-body">
          {/* Persisted section blocks */}
          {hasMedia && (
            <div className="vlp-inline-media-list">
              {mediaBlocks.map((block, blockIndex) => (
                <div
                  key={block.id}
                  data-block-id={block.id}
                  data-lesson-focus-anchor={block.id}
                >
                  {isSimpleMediaBlock(block) ? (
                    <InlineMediaCard
                      block={block}
                      onChange={(patch) => updateMedia(block.id, patch)}
                      onRemove={() => removeMedia(block.id)}
                    />
                  ) : isTeacher ? (
                    <ExerciseBlockMenu
                      onCopyToHomework={
                        onCopyExerciseToHomework &&
                        !isSimpleMediaBlock(block) &&
                        block.kind !== "carousel_slides"
                          ? () => {
                              void onCopyExerciseToHomework(block);
                            }
                          : undefined
                      }
                      onFocusExercise={
                        liveSession?.role === "teacher"
                          ? () => {
                              liveSession.patch(LIVE_LESSON_FOCUS_BLOCK_KEY, {
                                blockId: block.id,
                                t: Date.now(),
                              });
                            }
                          : undefined
                      }
                      onResetAnswers={() => teacherResetBlock(block.id)}
                      resetIsTeacherBroadcast={!!liveSession}
                      onEdit={
                        onEditBlock && SEGMENT_EDITABLE_EXERCISE_KINDS.has(block.kind)
                          ? () => onEditBlock(block.id)
                          : undefined
                      }
                      onEditNew={
                        onEditBlock && SEGMENT_EDITABLE_EXERCISE_KINDS.has(block.kind)
                          ? () => onEditBlock(block.id)
                          : undefined
                      }
                      onDelete={onDeleteBlock ? () => onDeleteBlock(block.id) : undefined}
                      onMoveUp={
                        onReorderBlock && blockIndex > 0
                          ? () => onReorderBlock(block.id, "up")
                          : undefined
                      }
                      onMoveDown={
                        onReorderBlock && blockIndex < mediaBlocks.length - 1
                          ? () => onReorderBlock(block.id, "down")
                          : undefined
                      }
                    >
                      <FlowItemRenderer
                        key={`ex-remount-${block.id}-${answerResetSeqByBlockId[block.id] ?? 0}`}
                        item={
                          {
                            id: block.id,
                            type: block.kind,
                            label: block.title ?? block.kind,
                            data: block.data ?? {},
                            status: "available",
                          } as any
                        }
                        mode={mode}
                        isFirst={false}
                        isLast={false}
                        onComplete={() => {}}
                        onStartTest={onStartTest}
                        onSubmitTest={onSubmitTest}
                        onLoadTask={onLoadTask}
                        onSubmitTask={onSubmitTask}
                        onOpenTask={onOpenTask}
                        onOpenTest={onOpenTest}
                        loading={loading}
                        onEditSlides={onEditSlides}
                      />
                    </ExerciseBlockMenu>
                  ) : (
                    <ExerciseBlockMenu onResetAnswers={() => bumpAnswerReset(block.id)}>
                      <FlowItemRenderer
                        key={`ex-remount-${block.id}-${answerResetSeqByBlockId[block.id] ?? 0}`}
                        item={
                          {
                            id: block.id,
                            type: block.kind,
                            label: block.title ?? block.kind,
                            data: block.data ?? {},
                            status: "available",
                          } as any
                        }
                        mode={mode}
                        isFirst={false}
                        isLast={false}
                        onComplete={() => {}}
                        onStartTest={onStartTest}
                        onSubmitTest={onSubmitTest}
                        onLoadTask={onLoadTask}
                        onSubmitTask={onSubmitTask}
                        onOpenTask={onOpenTask}
                        onOpenTest={onOpenTest}
                        loading={loading}
                        onEditSlides={onEditSlides}
                      />
                    </ExerciseBlockMenu>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Carousel */}
          {isTeacher && carouselSlides !== undefined && (
            <ImageCarouselEditor
              slides={carouselSlides}
              onChange={onCarouselSlidesChange ?? (() => {})}
            />
          )}
          {!isTeacher && carouselSlides && carouselSlides.length > 0 && (
            <ImageCarouselViewer slides={carouselSlides} />
          )}

          {/* Divider between media/carousel and exercise items */}
          {!isEmpty && (hasMedia || (carouselSlides && carouselSlides.length > 0)) && (
            <hr className="vlp-section-divider" aria-hidden />
          )}

          {/* ── Exercise items — dispatched via registry ───────────────────── */}
          {!isEmpty && (
            <div className="vlp-blocks">
              {items.map((item, blockIndex) => (
                <div key={item.id} data-lesson-focus-anchor={item.id}>
                {isTeacher ? (
                  <ExerciseBlockMenu
                    onCopyToHomework={
                      onCopyExerciseToHomework &&
                      SEGMENT_EDITABLE_EXERCISE_KINDS.has(item.type)
                        ? () => {
                            const it = item as {
                              id: string;
                              type: string;
                              label?: string;
                              data?: Record<string, unknown>;
                            };
                            void onCopyExerciseToHomework({
                              id: it.id,
                              kind: it.type as InlineMediaBlock["kind"],
                              title: it.label ?? it.type,
                              data: it.data ?? {},
                            });
                          }
                        : undefined
                    }
                    onFocusExercise={
                      liveSession?.role === "teacher"
                        ? () => {
                            liveSession.patch(LIVE_LESSON_FOCUS_BLOCK_KEY, {
                              blockId: item.id,
                              t: Date.now(),
                            });
                          }
                        : undefined
                    }
                    onResetAnswers={() => teacherResetBlock(item.id)}
                    resetIsTeacherBroadcast={!!liveSession}
                    onEdit={
                      onEditBlock && SEGMENT_EDITABLE_EXERCISE_KINDS.has(item.type)
                        ? () => onEditBlock(item.id)
                        : undefined
                    }
                    onEditNew={
                      onEditBlock && SEGMENT_EDITABLE_EXERCISE_KINDS.has(item.type)
                        ? () => onEditBlock(item.id)
                        : undefined
                    }
                    onDelete={onDeleteBlock ? () => onDeleteBlock(item.id) : undefined}
                    onMoveUp={
                      onReorderBlock && blockIndex > 0
                        ? () => onReorderBlock(item.id, "up")
                        : undefined
                    }
                    onMoveDown={
                      onReorderBlock && blockIndex < items.length - 1
                        ? () => onReorderBlock(item.id, "down")
                        : undefined
                    }
                  >
                    <FlowItemRenderer
                      key={`ex-remount-${item.id}-${answerResetSeqByBlockId[item.id] ?? 0}`}
                      item={item}
                      mode={mode}
                      isFirst={blockIndex === 0}
                      isLast={blockIndex === items.length - 1}
                      onComplete={() => onItemCompleted(item.id, item.type)}
                      onStartTest={onStartTest}
                      onSubmitTest={onSubmitTest}
                      onLoadTask={onLoadTask}
                      onSubmitTask={onSubmitTask}
                      onOpenTask={onOpenTask}
                      onOpenTest={onOpenTest}
                      loading={loading}
                      onEditSlides={onEditSlides}
                    />
                  </ExerciseBlockMenu>
                ) : (
                  <ExerciseBlockMenu onResetAnswers={() => bumpAnswerReset(item.id)}>
                    <FlowItemRenderer
                      key={`ex-remount-${item.id}-${answerResetSeqByBlockId[item.id] ?? 0}`}
                      item={item}
                      mode={mode}
                      isFirst={blockIndex === 0}
                      isLast={blockIndex === items.length - 1}
                      onComplete={() => onItemCompleted(item.id, item.type)}
                      onStartTest={onStartTest}
                      onSubmitTest={onSubmitTest}
                      onLoadTask={onLoadTask}
                      onSubmitTask={onSubmitTask}
                      onOpenTask={onOpenTask}
                      onOpenTest={onOpenTest}
                      loading={loading}
                      onEditSlides={onEditSlides}
                    />
                  </ExerciseBlockMenu>
                )}
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {!hasContent && (
            <div className="vlp-section-empty-state">
              {isTeacher && onAddContent ? (
                <button
                  type="button"
                  className="vlp-section-add-btn"
                  onClick={onAddContent}
                >
                  <PlusCircle size={16} strokeWidth={1.8} />
                  Add content
                </button>
              ) : (
                <p className="vlp-section-empty-label">
                  No content in this section yet.
                </p>
              )}
            </div>
          )}

          {hasContent && isTeacher && onAddContent && (
            <div className="vlp-section-actions">
              <button
                type="button"
                className="vlp-section-add-btn"
                onClick={onAddContent}
              >
                <PlusCircle size={16} strokeWidth={1.8} />
                Add content
              </button>
            </div>
          )}
        </div>

        {/* ── Inline bottom navigation ─────────────────────────────────────── */}
        <BottomNavigation
          currentIndex={index}
          total={total}
          mode={mode}
          onPrev={onScrollToPrev}
          onNext={onScrollToNext}
          completedSteps={completedSteps}
          totalSteps={totalSteps}
        />
      </section>
    );
  },
);

SectionBlock.displayName = "SectionBlock";

export default React.memo(SectionBlock);