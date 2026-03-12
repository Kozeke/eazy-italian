# Classroom Mode — Integration Notes

## Existing logic reused (not duplicated)

### API calls
| Call | Existing use | Classroom use |
|---|---|---|
| `coursesApi.getById(id)` | AdminCoursesPage | `useClassroom` — course metadata |
| `unitsApi.getAll({ course_id })` | AdminUnitsPage | `useClassroom` — unit list + ordering |
| `unitsApi.getAdminUnit(id)` | AdminUnitDetailPage | `useStudentUnit` — full unit detail with nested videos/tasks/tests |

No new API routes were introduced. All three calls already exist in `services/api`.

### Content rendering logic
`StudentUnitWorkspace` extracts and reuses the following from existing admin pages:

| Pattern | Source | Used in |
|---|---|---|
| Video embed logic (YouTube/Vimeo URL detection, iframe embed, file path resolution) | `AdminVideoEditPage` (preview section) | `VideoCard` |
| Task content block (file path → download link, URL → anchor, text → `<pre>`) | `AdminTaskDetailPage` lines 292–375 | `TaskContentBlock` |
| Task instructions rendered as HTML (`dangerouslySetInnerHTML`) | `AdminTaskDetailPage` line 251 | `TaskCard` expanded view |
| Test stat row (time limit, questions, passing score, max attempts) | `AdminTestDetailsPage` lines 176–193 | `TestCard` |
| Test instructions block (blue highlight box) | `AdminTestDetailsPage` lines 163–168 | `TestCard` expanded view |
| Test settings flags (shuffle, show results, allow review) | `AdminTestDetailsPage` lines 296–307 | `TestCard` expanded settings |
| Level badge color map | `AdminUnitDetailPage` `LEVEL_CFG` | `UnitIntroCard`, `UnitSelector` |
| Task type label map | `AdminUnitDetailPage` `TASK_LABELS` | `TaskCard` |
| `content_count` field shape | `AdminUnitsPage` Unit interface | `UnitSelector` content summary |

---

## What was newly extracted

### `useStudentUnit(unitId)`
A data-only hook wrapping `unitsApi.getAdminUnit`.  
Previously this fetch lived inline inside `AdminUnitDetailPage.fetchUnit`.  
Now it's a standalone hook with no admin concerns (no edit form, no save, no visibility toggle).

### `StudentUnitWorkspace`
A presentation component that accepts resolved unit data and renders the student-facing content.  
Previously no student-facing equivalent existed — only the teacher `AdminUnitDetailPage`.  
This component is intentionally re-entrant: it can be used inside ClassroomPage or mounted standalone on a future `/student/units/:id` route.

---

## Integration conflicts found

### 1. `unitsApi.getAdminUnit` naming
The method is named `getAdminUnit` even though the endpoint it calls is the general unit detail endpoint — not admin-only.  If the backend ever gates this endpoint to admin role, `useStudentUnit` will need to call a dedicated student endpoint.  For now the existing call works and matches what AdminUnitDetailPage uses.

**Recommendation:** If a student-scoped endpoint (`/api/v1/student/units/:id`) already exists or is added later, update `useStudentUnit` to call that instead — the hook interface stays the same.

### 2. Video `file_path` serving
`AdminVideoEditPage` resolves file paths against `VITE_API_BASE_URL`.  
`StudentUnitWorkspace.resolveVideoUrl` replicates the same resolution logic.  
If the URL scheme changes, both places need updating.  
**Recommendation:** Extract `resolveMediaUrl(path)` into a shared `utils/media.ts` helper and import from both.

### 3. `is_visible_to_students` vs student access control
`UnitSelector` dims units where `is_visible_to_students === false`.  
But the API currently returns all units (including hidden ones) from `unitsApi.getAll`.  
A real student-scoped endpoint would filter server-side.  
For now, hidden units are shown as locked — students can see them but not open them.

### 4. Task submission
`StudentUnitWorkspace`'s "Start" button on tasks navigates to `/student/tasks/:id`.  
If this route doesn't exist yet in the student router, it needs to be created or the button should be replaced with an inline submission form.  Same applies to `/student/tests/:id/start` and `/student/videos/:id`.

---

## What was intentionally NOT done

- **No redesign of task submission, test runner, or video player** — those are separate routes navigated to from the workspace.
- **No new analytics, progress tracking, or gamification** — the workspace shows content only.
- **No teacher routes touched** — `AdminUnitDetailPage`, `AdminTaskDetailPage`, `AdminTestDetailsPage` are completely untouched.
- **No copy-paste of admin page code** — all shared logic is either imported from existing API services or referenced via the same API calls.
