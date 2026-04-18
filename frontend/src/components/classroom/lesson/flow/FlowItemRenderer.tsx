/**
 * FlowItemRenderer.tsx
 *
 * Looks up the registered component for item.type and renders it lazily.
 * SectionBlock replaces its <SlideBlock> loop with <FlowItemRenderer>.
 *
 * Registry: exerciseRegistrations.ts. Legacy kinds (slides, video, task, test, …)
 * still load ./blocks/SlideBlock, which imports lesson/SlideStep (via SlidesSection),
 * VideoStep, TaskStep, TestStep.
 *
 * Unknown types log a warning and render nothing — they never crash the page.
 */

import { lazy, Suspense, useMemo } from "react";
import { getExerciseLoader } from "./exerciseRegistry";
import type { ExerciseBlockProps } from "./exerciseBlock.types";

function BlockSkeleton() {
  return (
    <div
      className="vlp-block-skeleton"
      style={{
        height: 80,
        borderRadius: 12,
        background: "var(--color-background-secondary, #f3f4f6)",
      }}
      aria-hidden
    />
  );
}

export function FlowItemRenderer(props: ExerciseBlockProps) {
  const { item } = props;

  // Create the lazy component once per type string, not per render.
  const Block = useMemo(() => {
    const loader = getExerciseLoader(item.type);
    if (!loader) {
      console.warn(
        `[FlowItemRenderer] No renderer for type "${item.type}". ` +
          `Add it to exerciseRegistrations.ts.`,
      );
      return null;
    }
    return lazy(loader);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.type]);

  if (!Block) return null;

  return (
    <Suspense fallback={<BlockSkeleton />}>
      <Block {...props} />
    </Suspense>
  );
}