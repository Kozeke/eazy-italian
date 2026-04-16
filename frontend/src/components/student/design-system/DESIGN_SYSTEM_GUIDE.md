# Student Design System — Integration Guide

## Overview

This design system provides the visual foundation for the student-facing UI.
It shares structural DNA with the teacher/admin panel (spacing, radius, shadows,
border treatment) but establishes a distinct student identity through:

| Property | Teacher panel | Student side |
|---|---|---|
| Primary accent | `primary-blue` (`#4f46e5`) | `teal` (`#0d9488`) |
| Focus rings | `ring-primary-400` | `ring-teal-400` |
| Button CTA | `bg-primary-600` | `bg-teal-600` |
| Progress bar | `from-primary-400` | `from-teal-400` |
| Tone | Professional / structured | Encouraging / progress-first |

---

## Classroom Layout Model (v11)

> **Important:** The classroom lesson workspace is viewport-fitted — it never requires page-level vertical scrolling. This is a hard architectural constraint. The layout hierarchy is:

```
ClassroomLayout          (full viewport, flex col, overflow-x hidden)
  ClassroomHeader        (sticky, sets --lp-header-h CSS variable)
  LessonWorkspace
    .lp-workspace        (height: calc(100dvh - var(--lp-header-h)), overflow: hidden)
      .lp-canvas         (centred max-w-5xl, flex col, padded)
        .lp-player-frame (flex col, fills canvas — IDENTICAL height every step)
          .lp-player-header  (flex-shrink-0 — always visible)
          .lp-player-body    (flex-1, min-h-0, overflow-y-auto — ONLY scroller)
          .lp-player-footer  (flex-shrink-0 — always visible)
```

**Key rules:**
- Never use `LessonContainer` inside the classroom shell — it assumes page scroll.
- All lesson content (slides, task form, test questions) lives in `PlayerBody` / `.lp-player-body`.
- The page must **never** scroll vertically in classroom mode — overflow belongs inside `.lp-player-body` only.
- `--lp-header-h` is driven by CSS classes on `ClassroomHeader`: `classroom-header` sets 60px (single bar), `classroom-header--has-rail` sets 108px (with progress rail sub-bar).

---

## Files

| File | Purpose |
|---|---|
| `student-design-system.tsx` | All reusable React primitives |
| `student-tokens.css` | CSS custom properties + utility classes |
| `lesson-workspace.css` | Viewport-fitted classroom layout classes (`.lp-*`) |
| `classroom-mode.css` | Body-class rules that hide sidebars + define `--lp-header-h` |
| `lesson-polish.css` | Animation layer for the lesson player |

---

## Installation

### 1. Copy design system files

```
src/components/student/student-design-system.tsx
src/components/student/lesson/lesson-workspace.css
src/components/student/lesson/lesson-polish.css
```

### 2. Import the CSS files

In `src/index.css` or `src/globals.css`:

```css
@import './components/student/student-tokens.css';
@import './components/student/lesson/lesson-workspace.css';
@import './components/student/lesson/lesson-polish.css';
@import './components/student/classroom-mode.css';
```

### 3. (Optional) Add Tailwind colour alias

In `tailwind.config.js`:

```js
theme: {
  extend: {
    colors: {
      student: {
        50:  '#f0fdfa',
        100: '#ccfbf1',
        200: '#99f6e4',
        300: '#5eead4',
        400: '#2dd4bf',
        500: '#14b8a6',
        600: '#0d9488',
        700: '#0f766e',
        800: '#115e59',
        900: '#134e4a',
      }
    }
  }
}
```

---

## Component Reference

### Layout

```tsx
// Full-width page wrapper (non-classroom pages)
<PageContainer narrow>
  <PageHeader eyebrow="Student Portal" title="My Classes" subtitle="Your enrolled classrooms." />
</PageContainer>

// Reading-width wrapper — ⚠️ non-classroom pages only, do NOT use inside ClassroomLayout
<LessonContainer>
  {/* static reading content */}
</LessonContainer>

// Sticky top bar (sub-pages outside classroom)
<StickyPageHeader>
  <ArrowLeft /> Back to Classes
</StickyPageHeader>
```

### Classroom Player Zones

These three primitives map directly to the `.lp-player-*` CSS classes.
Use them when building custom step content that will live inside `PlayerFrame` / `.lp-player-frame`.

```tsx
// Pinned header — icon, label, subtitle, complete badge, step counter
<PlayerHeader
  icon={<FileText className="h-5 w-5" />}
  iconBg="bg-amber-50"
  iconColor="text-amber-600"
  label="Writing Task"
  subtitle="Essay"
  isComplete={false}
  stepNum={2}
  total={3}
/>

// The ONLY scrollable zone — content goes here
<PlayerBody>
  <TaskStep … />
</PlayerBody>

// Pinned footer — nav controls, submit bar
<PlayerFooter>
  <PlayerNavFooter … />
</PlayerFooter>
```

> `SkeletonLesson` renders a skeleton shaped exactly like the three-zone player so there is no layout shift when content loads.

### Cards

```tsx
// Basic content card (outside classroom)
<Card>
  <CardBody>Content here</CardBody>
  <CardFooter>
    <StudentButton variant="primary">Enter</StudentButton>
  </CardFooter>
</Card>

// Interactive/clickable card
<Card variant="interactive" accent="border-l-teal-400" onClick={handleClick}>
  <CardBody>...</CardBody>
</Card>

// Section inside a card
<CardSection title="Your score" icon={<Star />}>
  <p>90/100</p>
</CardSection>
```

### Badges & Chips

```tsx
// Flexible badge
<Badge color="emerald">Complete</Badge>
<Badge color="amber" size="sm" dot>Pending</Badge>

// Semantic status badges (auto-colors)
<StatusBadge status="submitted" />
<StatusBadge status="graded" />
<StatusBadge status="live" />
<StatusBadge status="due" />

// Level badge (A1–C2)
<LevelBadge level="B2" />

// Icon + text stat chip
<InfoChip icon={<Clock />} label="30 min" />
```

### Progress

```tsx
// Horizontal bar
<ProgressBar value={72} showLabel />
<ProgressBar value={100} color="emerald" size="lg" labelPosition="above" />

// Circular ring
<ProgressRing value={75} size={48}>
  <span className="text-xs font-bold">75%</span>
</ProgressRing>

// Lesson step strip (used in LessonProgressIndicator, outside classroom header)
<LessonStepStrip
  hasSlides={true}  slidesComplete={true}
  hasTask={true}    taskComplete={false}
  hasTest={false}   testComplete={false}
/>
```

### Tabs / Segmented Control

```tsx
// Pill-style (default)
<SegmentedControl
  value={tab} onChange={setTab}
  options={[
    { value: 'slides', label: 'Slides' },
    { value: 'task',   label: 'Task', badge: 1 },
    { value: 'test',   label: 'Test' },
  ]}
/>

// Underline tabs
<UnderlineTabs value={tab} onChange={setTab} options={[...]} />
```

### Buttons

```tsx
// Variants: primary | secondary | ghost | danger | success | amber
<StudentButton variant="primary">Enter Classroom</StudentButton>
<StudentButton variant="success" iconRight={<ChevronRight />}>Begin Test</StudentButton>
<StudentButton variant="amber" loading={submitting}>Submit</StudentButton>
<StudentButton variant="ghost" size="sm">Cancel</StudentButton>
<StudentButton variant="primary" fullWidth>Join Live Lesson</StudentButton>
```

### Form Inputs

```tsx
<StudentInput
  label="Your answer"
  placeholder="Type here…"
  value={val}
  onChange={e => setVal(e.target.value)}
/>

<StudentTextarea
  label="Your response"
  rows={6}
  placeholder="Write your essay here…"
  value={text}
  onChange={e => setText(e.target.value)}
  error="Response is required"
/>
```

### Callout Blocks

```tsx
// Learning goal (teal) — render inside PlayerBody
<GoalCallout title="What you'll learn">
  By the end of this unit, you will be able to…
</GoalCallout>

// Task / test instructions (sky blue) — render inside PlayerBody
<InstructionsCallout>
  Read each question carefully before answering.
</InstructionsCallout>

// Teacher feedback (indigo) — render inside PlayerBody
<FeedbackCallout>
  Good work! Your grammar was mostly correct.
</FeedbackCallout>

// Task/test submission confirmation — render inside PlayerBody
<SuccessBanner
  title="Task submitted"
  subtitle="12 March 2026 at 14:32"
  score={88} maxScore={100}
/>
```

### Empty & Error States

```tsx
// Generic empty state
<EmptyState
  icon={<BookOpen />}
  title="No classes yet"
  description="Ask your teacher to enrol you in a course."
/>

// Search zero results
<SearchEmptyState query={searchQuery} onClear={() => setSearchQuery('')} />

// Inline error with retry
<ErrorBanner
  title="Couldn't load your classes"
  message={error}
  onRetry={reload}
/>

// Full-page error (outside classroom)
<PageErrorState
  message="The classroom couldn't be loaded."
  onBack={() => navigate('/student/classes')}
/>

// Error inside the classroom player body
<PageErrorState
  context="player"
  message="Could not load this step."
  onBack={() => navigate('/student/classes')}
/>
```

### Loading States

```tsx
// Inline spinner
<Spinner size="md" />

// Text skeleton lines
<SkeletonText lines={3} />

// Rectangular block placeholder
<SkeletonBlock height="h-48" rounded="rounded-2xl" />

// Full card skeleton (matches ClassroomCard)
<SkeletonCard />

// Viewport-fitted lesson player skeleton (v11 — use inside LessonWorkspace)
<SkeletonLesson />

// Full-page loading (outside classroom)
<PageLoadingState label="Loading lesson…" />

// Loading inside classroom player
<PageLoadingState context="player" label="Loading…" />
```

### Other

```tsx
// Stats strip (page header)
<StatsStrip stats={[
  { value: 5, label: 'Classes' },
  { value: '72%', label: 'Avg progress' },
  { value: 2, label: 'Live now', color: 'text-red-500' },
]} />

// Live session alert banner
<LiveAlertBanner count={2} />

// Section divider (border-t)
<SectionDivider />

// Section title row with icon
<SectionHeader
  icon={<Layers />}
  title="Slides"
  badge={<span>3/5 viewed</span>}
  trailing={<Badge color="emerald">Complete</Badge>}
/>

// Search input (student teal focus)
<SearchInput
  value={query}
  onChange={setQuery}
  onClear={() => setQuery('')}
  placeholder="Search classes…"
  resultCount={filteredCount}
/>
```

---

## Design Tokens

All tokens are in `student-tokens.css`. Key custom properties:

```css
--s-accent           /* teal-600 — primary student CTA colour */
--s-accent-soft      /* teal-50  — card tints, goal callout backgrounds */
--s-accent-muted     /* teal-200 — borders, dividers */
--s-lesson-max-width /* 42rem — lesson content column width */
--s-progress-gradient /* teal gradient for progress fills */

/* Classroom workspace tokens (lesson-workspace.css) */
--lp-header-h        /* Total sticky header height (set by ClassroomHeader) */
--lp-workspace-py    /* Vertical padding inside the workspace */
--lp-canvas-px       /* Horizontal padding of the canvas */
--lp-player-radius   /* Border-radius of the player frame */
```

---

## Colour Conventions (quick reference)

| Use case | Color |
|---|---|
| Student CTA / active state | `teal-600` |
| Slides section icon | `teal-600` on `teal-50` bg |
| Task section icon | `amber-600` on `amber-50` bg |
| Test section icon | `emerald-600` on `emerald-50` bg |
| Submit / Start test button | `amber` variant / `success` variant |
| Complete badges | `emerald` |
| Pending / due | `amber` |
| Live session | `red-500` |
| Teacher feedback | `indigo` |
| Instructions | `sky` |
| Goal callout | `teal` |
| Errors | `red` |

---

## Migration Path

To migrate existing student components to use this system:

1. Replace inline `bg-primary-*` accent colours with `bg-teal-*`
2. Replace inline `ring-primary-400` focus rings with `ring-teal-400`
3. Replace hand-rolled button JSX with `<StudentButton variant="..." />`
4. Replace `animate-pulse` skeleton blocks with `<SkeletonBlock />` / `<SkeletonCard />`
5. Replace inline error JSX with `<ErrorBanner />` or `<PageErrorState />`
6. Replace inline empty state JSX with `<EmptyState />` or `<SearchEmptyState />`
7. Replace inline progress bars with `<ProgressBar />`
8. Source the `LessonProgressIndicator` replacement from `<LessonStepStrip />`
9. **Remove `LessonContainer` from any component inside `ClassroomLayout`** — use `PlayerBody` instead
10. Replace `SkeletonLesson` usages: the new version renders a viewport-fitted frame skeleton, not a scrollable list skeleton
11. Pass `context="player"` to `PageLoadingState` / `PageErrorState` when rendering inside the classroom workspace

---

## Classroom Layout Checklist

Before shipping any new step type or classroom-mode component, verify:

- [ ] Content lives inside `.lp-player-body` / `<PlayerBody>` only
- [ ] Nothing outside `.lp-player-body` grows taller when content is long
- [ ] No inline `height:`, `min-height:`, or `clamp()` on the player or its ancestors — these are controlled by `lesson-workspace.css`
- [ ] No `overflow-y-auto` on any element *above* `.lp-player-body` in the tree
- [ ] Switching between step types produces zero layout shift
- [ ] The player frame height is identical for Slides, Task, Test, and Video
- [ ] `--lp-header-h` is correct (60px without rail, 108px with rail)