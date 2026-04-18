/**
 * exerciseRegistrations.ts
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THIS IS THE ONLY FILE YOU EDIT WHEN ADDING A NEW EXERCISE TYPE.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Steps to add, e.g. "drag_to_gap":
 *   1. Create DragToGapBlock.tsx in this same folder (implements ExerciseBlockProps)
 *   2. Add one line below:
 *        registerExercise("drag_to_gap", () => import("./DragToGapBlock"));
 *   3. Add one entry in exerciseTemplateRegistry.tsx (for the gallery card)
 *   4. Done. SectionBlock, LessonWorkspace, VerticalLessonPlayer: zero changes.
 *
 * Import this file once at your app entry point or at the top of LessonWorkspace
 * so the registrations run before any FlowItemRenderer mounts.
 */

import { registerExercise } from "./exerciseRegistry";

// ── Legacy flow item types → blocks/SlideBlock.tsx ────────────────────────────
// SlideBlock re-exports the parent-folder UIs: SlidesSection (→ SlideStep),
// VideoStep, TaskStep, TestStep. Splitting a type out? Point its registration
// at a new block under ./blocks/ instead of SlideBlock.
registerExercise("slides",        () => import("./blocks/SlideBlock"));
registerExercise("mcq",           () => import("./blocks/SlideBlock"));
registerExercise("cloze",         () => import("./blocks/SlideBlock"));
registerExercise("task",          () => import("./blocks/SlideBlock"));
registerExercise("test",          () => import("./blocks/SlideBlock"));
registerExercise("video",         () => import("./blocks/SlideBlock"));

// ── New exercise types ────────────────────────────────────────────────────────
registerExercise("drag_to_gap",    () => import("./blocks/DragToGapBlock"));
registerExercise("drag_to_image",      () => import("./blocks/DragWordToImageBlock"));
registerExercise("drag_word_to_image", () => import("./blocks/DragWordToImageBlock"));
registerExercise("type_word_to_image", () => import("./blocks/TypeWordToImageBlock"));
registerExercise("select_form_to_image", () => import("./blocks/SelectFormToImageBlock"));
registerExercise("type_word_in_gap", () => import("./blocks/TypeWordInGapBlock"));
registerExercise("select_word_form", () => import("./blocks/SelectWordFormBlock"));
registerExercise("build_sentence", () => import("./blocks/BuildSentenceBlock"));
registerExercise("match_pairs", () => import("./blocks/MatchPairsBlock"));
registerExercise("order_paragraphs", () => import("./blocks/OrderParagraphsBlock"));
registerExercise("sort_into_columns", () => import("./blocks/SortIntoColumnsBlock"));
registerExercise("test_without_timer", () => import("./blocks/TestWithoutTimerBlock"));
registerExercise("test_with_timer", () => import("./blocks/TestWithTimerBlock"));
// registerExercise("sort_sentence",  () => import("./SortSentenceBlock"));
// registerExercise("match_pairs",    () => import("./MatchPairsBlock"));
registerExercise("inline_media", () => import("./homework/HomeworkInlineMediaBlock"));