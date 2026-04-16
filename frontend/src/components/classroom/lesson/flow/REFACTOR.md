# Exercise Registry Refactor

## The problem

Three files were growing unboundedly as new exercise types were added:

- **`SectionBlock.tsx`** — 852 lines. Contained the carousel editor, carousel viewer, inline media card, and a direct `<SlideBlock>` render loop that would need a new branch for every new exercise type.
- **`LessonWorkspace.tsx`** — 1016 lines. Contained six autosave/hydration effects with their tracking refs, a growing `if (templateId === "img-carousel")` dispatch branch, and all segment persistence logic inline.
- **`ExerciseDraftsPage.tsx`** — 1400 lines. Contained all 20 preview components, three separate lookup maps (`TEMPLATES`, `TEMPLATE_TO_MEDIA_TYPE`, `TEMPLATE_TO_DRAFT_TYPE`), and a 70-line `handleCreate` with branchy dispatch logic.

Every new exercise type required edits to all three files. There was no single place to look to understand what types exist.

---

## The solution

A **registry pattern** with extracted responsibilities. Each concern lives in exactly one file. Adding a new exercise type touches at most two files regardless of how many types already exist.

---

## File map

```
flow/                                  ← same folder as SectionBlock.tsx
  ImageCarousel.tsx                    NEW  extracted carousel editor + viewer
  FlowItemRenderer.tsx                 NEW  registry dispatcher (replaces SlideBlock loop)
  exerciseBlock.types.ts               NEW  shared ExerciseBlockProps contract
  exerciseRegistry.ts                  NEW  Map<type, lazy loader>
  exerciseRegistrations.ts             NEW  ← THE ONLY FILE TO EDIT per new type
  SectionBlock.tsx                     UPDATED  852 → ~420 lines
  VerticalLessonPlayer.tsx             UPDATED  type imports aligned

useSegmentPersistence.ts               NEW  ← same folder as LessonWorkspace
mediaTemplateHandlers.ts               NEW  ← same folder as LessonWorkspace
LessonWorkspace.tsx                    UPDATED  1016 → ~280 lines

exerciseTemplateRegistry.tsx           NEW  ← same folder as ExerciseDraftsPage
ExerciseDraftsPage.tsx                 UPDATED  1400 → ~360 lines
```

---

## What each new file does

### `exerciseBlock.types.ts`
Defines `ExerciseBlockProps` — the interface every exercise block component must implement. `SectionBlock`, `FlowItemRenderer`, and individual block files all import from here. Nothing imports from the individual block files to get this type.

### `exerciseRegistry.ts`
A plain `Map<string, () => Promise<{ default: Component }>>`. Exposes `registerExercise` and `getExerciseLoader`. No React, no JSX, no side effects — just the map and its accessors.

### `exerciseRegistrations.ts`
Calls `registerExercise` for every known type. This is the **single file that knows what exercise types exist**. It is imported once at the top of `LessonWorkspace.tsx` so registrations run before any `FlowItemRenderer` mounts.

```ts
registerExercise("slides",       () => import("./SlideBlock"));
registerExercise("mcq",          () => import("./SlideBlock"));
registerExercise("drag_to_gap",  () => import("./DragToGapBlock")); // ← new type
```

### `FlowItemRenderer.tsx`
Replaces the `items.map(item => <SlideBlock ...>)` loop in `SectionBlock`. Looks up the loader for `item.type`, wraps it in `React.lazy` + `Suspense`, and renders it. `SectionBlock` no longer imports `SlideBlock` or knows any type names.

### `ImageCarousel.tsx`
Exports `ImageCarouselEditor` (teacher mode) and `ImageCarouselViewer` (student mode), plus the `CarouselSlide` type. Extracted verbatim from `SectionBlock` — no logic changed.

### `useSegmentPersistence.ts`
A custom hook that owns everything `LessonWorkspace` previously did inline: fetching segments from the API, hydrating `inlineMediaBySectionId` and `carouselSlidesBySectionId` from server data, debounced autosave (500 ms) for both, flushing saves on unmount, and resetting all state on unit change. Returns the state and two stable handlers (`handleInlineMediaChange`, `handleCarouselSlidesChange`) plus `flush`.

### `mediaTemplateHandlers.ts`
A dispatch map for what happens when the teacher returns from `ExerciseDraftsPage` with a chosen template. Previously this was an `if (templateId === "img-carousel")` branch growing directly inside `LessonWorkspace`'s import effect. Now each template has a handler function, and `handleMediaTemplateImport` picks the right one (falling back to a default plain-media-block handler).

```ts
const handlers = {
  "img-carousel": ({ setCarouselSlidesBySectionId, ... }) => { ... },
  __default__:    ({ setInlineMediaBySectionId, ... })    => { ... },
};
```

### `exerciseTemplateRegistry.tsx`
All 20 preview components and the `TEMPLATE_REGISTRY` array. Each entry declares its `id`, `section`, `label`, `preview`, and the routing intent (`mediaKind`, `draftType`, or `combo`). Replaces the three separate maps (`TEMPLATES`, `TEMPLATE_TO_MEDIA_TYPE`, `TEMPLATE_TO_DRAFT_TYPE`) that `ExerciseDraftsPage` used to maintain separately.

---

## What was removed from each file

| File | Removed |
|---|---|
| `SectionBlock.tsx` | `ImageCarouselEditor`, `ImageCarouselViewer`, `SlideBlock` import, 30-line items render loop |
| `LessonWorkspace.tsx` | 6 autosave/hydration effects, all tracking refs, `img-carousel` dispatch branch, segment fetch effect |
| `ExerciseDraftsPage.tsx` | All 20 preview components, `TEMPLATES` array, `TEMPLATE_TO_MEDIA_TYPE`, `TEMPLATE_TO_DRAFT_TYPE`, branchy `handleCreate` |

---

## Adding a new exercise type

### Step 1 — Create the block component

```
flow/DragToGapBlock.tsx
```

```tsx
import type { ExerciseBlockProps } from "./exerciseBlock.types";

export default function DragToGapBlock({ item, mode, onComplete }: ExerciseBlockProps) {
  // all drag-to-gap logic here
}
```

### Step 2 — Register it

In `flow/exerciseRegistrations.ts`, add one line:

```ts
registerExercise("drag_to_gap", () => import("./DragToGapBlock"));
```

### Step 3 — Add it to the gallery

In `exerciseTemplateRegistry.tsx`, add one entry to `TEMPLATE_REGISTRY`:

```ts
{ id: "drag-to-gap", section: "Words & Gaps", label: "Drag to gap", preview: <DragToGapPreview />, draftType: "drag_to_gap" },
```

### Step 4 — Done

`SectionBlock`, `LessonWorkspace`, and `VerticalLessonPlayer` require **zero changes**.

If the new template also needs special handling when imported back from `ExerciseDraftsPage` (like the carousel does), add one entry to `mediaTemplateHandlers.ts`.

---

## Before and after

### Adding a type — files changed

| | Before | After |
|---|---|---|
| Create block component | `SlideBlock.tsx` (add a branch) | New file only |
| Register the type | `SectionBlock.tsx` + `LessonWorkspace.tsx` | `exerciseRegistrations.ts` (+1 line) |
| Add gallery card | `ExerciseDraftsPage.tsx` (3 places) | `exerciseTemplateRegistry.tsx` (+1 entry) |
| Add import handler | `LessonWorkspace.tsx` (grow the if-chain) | `mediaTemplateHandlers.ts` (+1 handler) |

### Line counts

| File | Before | After |
|---|---|---|
| `SectionBlock.tsx` | 852 | ~420 |
| `LessonWorkspace.tsx` | 1016 | ~280 |
| `ExerciseDraftsPage.tsx` | 1400 | ~360 |

The removed lines moved into focused files that each have one reason to change.

---

## Import graph

```
LessonWorkspace
  ├── useSegmentPersistence       (hydration + autosave)
  ├── mediaTemplateHandlers       (import dispatch)
  ├── flow/exerciseRegistrations  (runs on import, seeds the registry)
  └── flow/VerticalLessonPlayer
        └── flow/SectionBlock
              ├── flow/ImageCarousel         (carousel UI)
              └── flow/FlowItemRenderer
                    └── flow/exerciseRegistry
                          └── flow/[AnyBlock] (lazy, per type)

ExerciseDraftsPage
  └── exerciseTemplateRegistry    (all gallery cards + preview components)
```

Every arrow goes in one direction. No file in the registry chain needs to know about its callers.
