/**
 * exerciseRegistry.ts
 *
 * Maps item.type strings to lazy-loaded block components.
 * Lives flat alongside SectionBlock.tsx, SlideBlock.tsx, etc.
 *
 * Only exerciseRegistrations.ts and FlowItemRenderer.tsx import from here.
 * SectionBlock, LessonWorkspace, VerticalLessonPlayer never touch this file.
 */

import type { ExerciseBlockComponent } from "./exerciseBlock.types";

type Loader = () => Promise<{ default: ExerciseBlockComponent }>;

const registry = new Map<string, Loader>();

export function registerExercise(type: string, loader: Loader): void {
  if (registry.has(type)) {
    console.warn(
      `[exerciseRegistry] Duplicate registration for type "${type}". Overwriting.`,
    );
  }
  registry.set(type, loader);
}

export function getExerciseLoader(type: string): Loader | null {
  return registry.get(type) ?? null;
}

/** For debugging — lists all registered types. */
export function getRegisteredTypes(): string[] {
  return [...registry.keys()];
}