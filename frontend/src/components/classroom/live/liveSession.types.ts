/**
 * liveSession.types.ts
 *
 * Canonical types for Live Classroom Mode.
 * Shared by teacher controls, student listeners, and the WebSocket layer.
 */

// ─── Session section enum ─────────────────────────────────────────────────────

export type LiveSection = 'slides' | 'task' | 'test';

// ─── Event names ──────────────────────────────────────────────────────────────

export const LIVE_EVENTS = {
  SESSION_STARTED:  'SESSION_STARTED',
  SESSION_ENDED:    'SESSION_ENDED',
  UNIT_CHANGED:     'UNIT_CHANGED',
  SLIDE_CHANGED:    'SLIDE_CHANGED',
  SECTION_CHANGED:  'SECTION_CHANGED',
  HEARTBEAT:        'HEARTBEAT',
  STUDENT_JOINED:   'STUDENT_JOINED',
  STUDENT_LEFT:     'STUDENT_LEFT',
} as const;

export type LiveEventName = (typeof LIVE_EVENTS)[keyof typeof LIVE_EVENTS];

// ─── Broadcast payload ────────────────────────────────────────────────────────

export interface LiveSessionPayload {
  classroom_id: number;
  unit_id:      number;
  slide_index:  number;
  section:      LiveSection;
  teacher_id:   number | string;
  timestamp:    number;
}

// ─── Inbound WebSocket message ────────────────────────────────────────────────

export interface LiveSocketMessage {
  event:   LiveEventName;
  payload: Partial<LiveSessionPayload> & { student_count?: number };
}

// ─── Session state (client-side) ─────────────────────────────────────────────

export interface LiveSessionState {
  /** Whether a live session is currently active in this classroom */
  sessionActive:   boolean;
  /** User id of the teacher running the session */
  teacherId:       number | string | null;
  /** Currently broadcast unit id */
  currentUnitId:   number | null;
  /** 0-based slide index */
  currentSlide:    number;
  /** Which section of the lesson is active */
  activeSection:   LiveSection;
  /** Number of students currently connected (teacher view only) */
  studentCount:    number;
  /** Role this client is playing */
  role:            'teacher' | 'student';
  /** Whether THIS student has opted out of following */
  detached:        boolean;
  /** Connection status */
  connectionState: 'connecting' | 'connected' | 'disconnected' | 'polling';
}

export const INITIAL_LIVE_STATE: LiveSessionState = {
  sessionActive:   false,
  teacherId:       null,
  currentUnitId:   null,
  currentSlide:    0,
  activeSection:   'slides',
  studentCount:    0,
  role:            'student',
  detached:        false,
  connectionState: 'disconnected',
};
