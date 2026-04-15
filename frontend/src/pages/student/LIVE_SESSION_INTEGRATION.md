# Live Classroom Mode — Integration Guide

## Architecture Overview

```
Teacher Browser                     Server                      Student Browser
─────────────────                 ─────────────                ─────────────────
TeacherLiveControls
  │ broadcastSlide()                          ──WS──→ fan-out to students
  │ broadcastSection()
  │ endSession()                                ──WS──→ fan-out to students
```

---

## File Layout

```
src/components/classroom/live/
  liveSession.types.ts         ← canonical types + event names
  liveSessionTransport.ts      ← WS/polling abstraction
  LiveSessionProvider.tsx      ← React context + state machine
  TeacherLiveControls.tsx      ← floating teacher UI
  LiveSessionBanner.tsx        ← student banner + StudentLiveIndicator

src/pages/student/
  ClassroomPage.v5.tsx         ← updated ClassroomPage with live wiring
  LessonWorkspace.live.tsx     ← updated LessonWorkspace with live props
```

---

## Backend Requirements

### Option A — WebSocket (recommended)

```
WS  /ws/v1/classrooms/{classroomId}/live?token=<jwt>
```

**Message shape (both directions):**
```json
{
  "event": "SLIDE_CHANGED",
  "payload": {
    "classroom_id": 42,
    "unit_id": 7,
    "slide_index": 3,
    "section": "slides",
    "teacher_id": 1,
    "timestamp": 1710000000000,
    "student_count": 14
  }
}
```

**Server responsibilities:**
1. Authenticate via token query param.
2. Identify role (teacher vs student) from JWT.
3. Teacher messages → validate + fan-out to all subscribers of that classroom.
4. Student connect/disconnect → update `student_count` + emit `STUDENT_JOINED`.
5. Persist latest `LiveSessionPayload` in Redis/DB so late-joining students sync.
6. On teacher disconnect → emit `SESSION_ENDED` to all students.

---

### REST Polling fallback (removed)

Polling fallback was removed to avoid background requests like
`GET /api/v1/classrooms/{classroomId}/live/session`. Live classroom mode now
requires the WebSocket endpoint.

## Wiring into ClassroomPage

```tsx
// ClassroomPage.tsx

// 1. Determine role — replace with your auth hook
const { user, role } = useAuth();
const isTeacher = role === 'teacher' || role === 'admin';

// 2. Wrap content in LiveSessionProvider
// <LiveSessionProvider
//   classroomId={Number(courseId)}   // or actual classroom.id
//   role={isTeacher ? 'teacher' : 'student'}
//   userId={user?.id ?? null}
//   onUnitChange={handleLiveUnitChange}
//   onSlideChange={handleLiveSlideChange}
//   onSectionChange={handleLiveSectionChange}
// >
//   {/* ... rest of classroom ... */}
//   <LiveSessionBanner />          {/* student banner */}
//   <TeacherLiveControls ... />    {/* teacher floating panel */}
// </LiveSessionProvider>
```

---

## Live Props Added to Existing Components

### LessonWorkspace
| Prop | Type | Purpose |
|------|------|---------|
| `forcedSlide` | `number \| null` | Override slide index when following teacher |
| `forcedSection` | `'slides' \| 'task' \| 'test' \| null` | Show only teacher's active section |

### SlidesSection (minor addition)
| Prop | Type | Purpose |
|------|------|---------|
| `locked` | `boolean` | Disable user navigation controls |
| `forcedSlide` | `number` | Jump to this slide when set |

### SlidesPlayer (minor addition)
| Prop | Type | Purpose |
|------|------|---------|
| `locked` | `boolean` | Disable prev/next/dot buttons |

---

## Event Flow Examples

### Teacher starts session
```
1. Teacher clicks "Start Live Lesson"
2. TeacherLiveControls → actions.startSession(unitId)
3. LiveSessionProvider → transport.send(SESSION_STARTED, payload)
4. WS: server fans out to all students in classroom
5. Students receive SESSION_STARTED → onUnitChange() → onSlideChange()
6. Student ClassroomPage switches to correct unit, slide 0
7. LiveSessionBanner appears on all student screens
```

### Teacher advances slide
```
1. Teacher clicks "Next" in TeacherLiveControls
2. actions.broadcastSlide(currentSlide + 1)
3. transport.send(SLIDE_CHANGED, { slide_index: N })
4. Students receive SLIDE_CHANGED
5. onSlideChange(N) → ClassroomPage.setLiveSlide(N)
6. LessonWorkspace receives forcedSlide=N
7. SlidesSection jumps to slide N (locked — student can't override)
```

### Student detaches
```
1. Student clicks "Leave live session" in LiveSessionBanner
2. actions.detach() → session.detached = true
3. Live callbacks no longer update ClassroomPage state
4. Student can navigate freely
5. Banner changes to amber "Browsing independently" state
6. "Rejoin lesson" button → actions.reattach() → re-syncs to current state
```

### Teacher ends session
```
1. Teacher clicks "End Session"
2. actions.endSession() → transport.send(SESSION_ENDED, …)
3. All students receive SESSION_ENDED
4. session.sessionActive = false
5. LiveSessionBanner disappears
6. Student navigation unlocked
7. forcedSlide / forcedSection = null → LessonWorkspace returns to normal
```

---

## UX Behaviour Summary

| State | Student can navigate? | Banner shown? |
|-------|-----------------------|---------------|
| No session | Yes (normal) | None |
| Session active + attached | No (locked) | "Live lesson in progress · Following teacher" |
| Session active + detached | Yes (free) | "You've left the live session · Rejoin?" |
| Session ended | Yes (normal) | None |

---

## Connection Fallback

The transport factory (`createLiveTransport`) tries WebSocket first with a
3-second timeout. If WS fails or is unavailable, it silently falls back to
1.5-second polling. The `connectionState` field in session reflects which
mode is active (`'connected'` / `'polling'`), shown in the teacher panel.

No configuration required — it works on any server that serves the REST
endpoints, even without WebSocket support.
