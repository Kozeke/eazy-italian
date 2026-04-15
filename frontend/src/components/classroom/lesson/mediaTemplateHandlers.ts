/**
 * mediaTemplateHandlers.ts
 *
 * Maps template IDs to the state mutations they trigger when the teacher
 * returns from ExerciseDraftsPage to LessonWorkspace.
 *
 * Lives in the same folder as LessonWorkspace.tsx.
 *
 * Adding a new template with special import behaviour = one new entry here.
 * LessonWorkspace's import effect stays stable.
 */

import type { InlineMediaBlock, CarouselSlide } from "./useSegmentPersistence";

export interface PendingMediaBlock {
  id: string;
  kind: "image" | "video" | "audio";
  url: string;
  caption: string;
}

export interface MediaTemplateHandlerContext {
  targetSectionId: string;
  mediaBlock?: PendingMediaBlock;
  upsertInlineMediaBlock: (sectionId: string, block: InlineMediaBlock) => void;
  setCarouselSlidesBySectionId: React.Dispatch<
    React.SetStateAction<Record<string, CarouselSlide[]>>
  >;
  setPendingInlineMedia: (block: PendingMediaBlock | null) => void;
  setPendingInlineMediaTargetSectionId: (id: string | null) => void;
}

type TemplateHandler = (ctx: MediaTemplateHandlerContext) => void;

// ── Handler map ───────────────────────────────────────────────────────────────

const handlers: Record<string, TemplateHandler> = {
  // Carousel: initialise the slide list for the target section instead of
  // adding a flat media block.
  "img-carousel": ({ targetSectionId, setCarouselSlidesBySectionId }) => {
    setCarouselSlidesBySectionId((prev) => {
      if (prev[targetSectionId]) return prev; // already initialised
      return {
        ...prev,
        [targetSectionId]: [
          { id: Math.random().toString(36).slice(2, 10), url: "", caption: "" },
        ],
      };
    });
  },

  // Default: plain image / video / audio block
  __default__: ({
    targetSectionId,
    mediaBlock,
    upsertInlineMediaBlock,
    setPendingInlineMedia,
    setPendingInlineMediaTargetSectionId,
  }) => {
    if (!mediaBlock) return;
    upsertInlineMediaBlock(targetSectionId, mediaBlock);
    setPendingInlineMedia(mediaBlock);
    setPendingInlineMediaTargetSectionId(targetSectionId);
  },
};

/**
 * Dispatch the correct state mutations for the given template ID.
 * Falls through to `__default__` if no specific handler is registered.
 */
export function handleMediaTemplateImport(
  templateId: string | undefined,
  ctx: MediaTemplateHandlerContext,
): void {
  const handler =
    (templateId && handlers[templateId]) || handlers.__default__;
  handler(ctx);
}

/**
 * Register a handler for a new template ID at runtime.
 * Useful for feature-flagged or plugin-contributed templates.
 */
export function registerMediaTemplateHandler(
  templateId: string,
  handler: TemplateHandler,
): void {
  handlers[templateId] = handler;
}