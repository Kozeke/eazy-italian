/**
 * LiveSessionProvider.tsx
 *
 * React Context that wires the transport layer to component-consumable state.
 *
 * Usage:
 *   // In ClassroomPage (or ClassroomLayout):
 *   <LiveSessionProvider classroomId={classroomId} role="teacher" userId={myId}>
 *     <ClassroomLayout>…</ClassroomLayout>
 *   </LiveSessionProvider>
 *
 *   // In any child:
 *   const { session, actions } = useLiveSession();
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from 'react';

import {
  INITIAL_LIVE_STATE,
  LIVE_EVENTS,
  type LiveSection,
  type LiveSessionState,
  type LiveSessionPayload,
} from './liveSession.types';
import { createLiveTransport, type LiveTransport } from '../../../pages/student/liveSessionTransport';

// ─── Context shape ────────────────────────────────────────────────────────────

export interface LiveSessionActions {
  /** Teacher: start the live session */
  startSession(unitId: number, slideIndex?: number): Promise<void>;
  /** Teacher: end the live session */
  endSession(): Promise<void>;
  /** Teacher: broadcast slide change */
  broadcastSlide(index: number): void;
  /** Teacher: broadcast unit change */
  broadcastUnit(unitId: number): void;
  /** Teacher: broadcast section change */
  broadcastSection(section: LiveSection): void;
  /** Student: opt out of following — returns to manual navigation */
  detach(): void;
  /** Student: re-attach to teacher */
  reattach(): void;
}

interface LiveSessionContextValue {
  session: LiveSessionState;
  actions: LiveSessionActions;
}

const LiveSessionContext = createContext<LiveSessionContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

interface LiveSessionProviderProps {
  classroomId: number;
  /** 'teacher' — can start/end sessions and broadcast events.
   *  'student' — subscribes and auto-follows. */
  role:        'teacher' | 'student';
  userId?:     number | string | null;
  children:    React.ReactNode;
  /** Called when teacher changes unit (student side: triggers unit switch) */
  onUnitChange?:    (unitId: number) => void;
  /** Called when teacher changes slide */
  onSlideChange?:   (index: number) => void;
  /** Called when teacher changes section */
  onSectionChange?: (section: LiveSection) => void;
}

export function LiveSessionProvider({
  classroomId,
  role,
  userId,
  children,
  onUnitChange,
  onSlideChange,
  onSectionChange,
}: LiveSessionProviderProps) {
  const [session, setSession] = useState<LiveSessionState>({
    ...INITIAL_LIVE_STATE,
    role,
  });

  const transportRef = useRef<LiveTransport | null>(null);
  const sessionRef   = useRef(session);
  sessionRef.current = session;

  // ── Build transport once per classroomId ─────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    let transport: LiveTransport | null = null;

    (async () => {
      setSession((s) => ({ ...s, connectionState: 'connecting' }));
      transport = await createLiveTransport(classroomId);
      if (cancelled) { transport.disconnect(); return; }

      transportRef.current = transport;

      const unsub = transport.onMessage((msg) => {
        if (cancelled) return;

        switch (msg.event) {
          case LIVE_EVENTS.SESSION_STARTED:
            setSession((s) => ({
              ...s,
              sessionActive:  true,
              teacherId:      msg.payload.teacher_id ?? s.teacherId,
              currentUnitId:  msg.payload.unit_id  ?? s.currentUnitId,
              currentSlide:   msg.payload.slide_index ?? 0,
              activeSection:  (msg.payload.section as LiveSection) ?? 'slides',
              studentCount:   msg.payload.student_count ?? s.studentCount,
            }));
            if (role === 'student') {
              onUnitChange?.(msg.payload.unit_id!);
              onSlideChange?.(msg.payload.slide_index ?? 0);
              onSectionChange?.((msg.payload.section as LiveSection) ?? 'slides');
            }
            break;

          case LIVE_EVENTS.SESSION_ENDED:
            setSession((s) => ({
              ...s,
              sessionActive: false,
              detached: false,
            }));
            break;

          case LIVE_EVENTS.UNIT_CHANGED:
            setSession((s) => ({
              ...s,
              currentUnitId: msg.payload.unit_id ?? s.currentUnitId,
              currentSlide: 0,
              activeSection: 'slides',
            }));
            if (role === 'student' && !sessionRef.current.detached) {
              onUnitChange?.(msg.payload.unit_id!);
              onSlideChange?.(0);
              onSectionChange?.('slides');
            }
            break;

          case LIVE_EVENTS.SLIDE_CHANGED:
            setSession((s) => ({
              ...s,
              currentSlide: msg.payload.slide_index ?? s.currentSlide,
              activeSection: 'slides',
            }));
            if (role === 'student' && !sessionRef.current.detached) {
              onSlideChange?.(msg.payload.slide_index ?? 0);
              onSectionChange?.('slides');
            }
            break;

          case LIVE_EVENTS.SECTION_CHANGED:
            setSession((s) => ({
              ...s,
              activeSection: (msg.payload.section as LiveSection) ?? s.activeSection,
            }));
            if (role === 'student' && !sessionRef.current.detached) {
              onSectionChange?.((msg.payload.section as LiveSection) ?? 'slides');
            }
            break;

          case LIVE_EVENTS.STUDENT_JOINED:
          case LIVE_EVENTS.HEARTBEAT:
            setSession((s) => ({
              ...s,
              studentCount: msg.payload.student_count ?? s.studentCount,
            }));
            break;
        }
      });

      transport.connect();
      setSession((s) => ({
        ...s,
        connectionState: transport!.getMode() === 'websocket' ? 'connected' : 'polling',
      }));

      return unsub; // returned but not used as effect cleanup directly
    })();

    return () => {
      cancelled = true;
      transport?.disconnect();
      transportRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classroomId, role]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const buildPayload = useCallback(
    (overrides: Partial<LiveSessionPayload> = {}): LiveSessionPayload => ({
      classroom_id: classroomId,
      unit_id:      sessionRef.current.currentUnitId!,
      slide_index:  sessionRef.current.currentSlide,
      section:      sessionRef.current.activeSection,
      teacher_id:   userId ?? 0,
      timestamp:    Date.now(),
      ...overrides,
    }),
    [classroomId, userId]
  );

  const startSession = useCallback(async (unitId: number, slideIndex = 0) => {
    const payload = buildPayload({ unit_id: unitId, slide_index: slideIndex, section: 'slides' });
    setSession((s) => ({
      ...s,
      sessionActive:  true,
      teacherId:      userId ?? null,
      currentUnitId:  unitId,
      currentSlide:   slideIndex,
      activeSection:  'slides',
    }));
    transportRef.current?.send(LIVE_EVENTS.SESSION_STARTED, payload);
  }, [buildPayload, userId]);

  const endSession = useCallback(async () => {
    setSession((s) => ({ ...s, sessionActive: false }));
    transportRef.current?.send(LIVE_EVENTS.SESSION_ENDED, buildPayload());
  }, [buildPayload]);

  const broadcastSlide = useCallback((index: number) => {
    setSession((s) => ({ ...s, currentSlide: index, activeSection: 'slides' }));
    transportRef.current?.send(LIVE_EVENTS.SLIDE_CHANGED, buildPayload({ slide_index: index, section: 'slides' }));
  }, [buildPayload]);

  const broadcastUnit = useCallback((unitId: number) => {
    setSession((s) => ({ ...s, currentUnitId: unitId, currentSlide: 0, activeSection: 'slides' }));
    transportRef.current?.send(LIVE_EVENTS.UNIT_CHANGED, buildPayload({ unit_id: unitId, slide_index: 0, section: 'slides' }));
  }, [buildPayload]);

  const broadcastSection = useCallback((section: LiveSection) => {
    setSession((s) => ({ ...s, activeSection: section }));
    transportRef.current?.send(LIVE_EVENTS.SECTION_CHANGED, buildPayload({ section }));
  }, [buildPayload]);

  const detach = useCallback(() => {
    setSession((s) => ({ ...s, detached: true }));
  }, []);

  const reattach = useCallback(() => {
    setSession((s) => ({ ...s, detached: false }));
    // Re-sync to latest broadcast state
    if (sessionRef.current.currentUnitId !== null) {
      onUnitChange?.(sessionRef.current.currentUnitId);
      onSlideChange?.(sessionRef.current.currentSlide);
      onSectionChange?.(sessionRef.current.activeSection);
    }
  }, [onUnitChange, onSlideChange, onSectionChange]);

  const actions = useMemo<LiveSessionActions>(
    () => ({ startSession, endSession, broadcastSlide, broadcastUnit, broadcastSection, detach, reattach }),
    [startSession, endSession, broadcastSlide, broadcastUnit, broadcastSection, detach, reattach]
  );

  return (
    <LiveSessionContext.Provider value={{ session, actions }}>
      {children}
    </LiveSessionContext.Provider>
  );
}

// ─── Consumer hook ────────────────────────────────────────────────────────────

export function useLiveSession(): LiveSessionContextValue {
  const ctx = useContext(LiveSessionContext);
  if (!ctx) throw new Error('useLiveSession must be used inside <LiveSessionProvider>');
  return ctx;
}
