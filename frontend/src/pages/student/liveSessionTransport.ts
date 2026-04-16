/**
 * liveSessionTransport.ts
 *
 * Thin transport abstraction for live classroom mode.
 *
 * WebSocket only — no HTTP polling fallback (to avoid background GET /live/session).
 *
 * ─── Backend requirements ────────────────────────────────────────────────────
 *
 * PRIMARY  — WebSocket
 *   WS  /ws/v1/classrooms/{classroomId}/live
 *   Messages are JSON-serialised LiveSocketMessage objects.
 *   The server authenticates via the token query-param:
 *     ws://…/live?token=<jwt>
 *
 * NOTE
 *   We intentionally do NOT support an HTTP polling fallback anymore.
 *   If the WebSocket can't connect, live mode won't function (and we avoid
 *   background polling like GET /live/session).
 *
 * ─── Minimal new endpoints ───────────────────────────────────────────────────
 *
 * All existing classroom / unit / slide API calls are unchanged.
 * Only the WS endpoint is required.
 */

import type {
  LiveSocketMessage,
  LiveSessionPayload,
  LiveEventName,
} from '../../components/classroom/live/liveSession.types';

// ─── Types ────────────────────────────────────────────────────────────────────

type MessageHandler = (msg: LiveSocketMessage) => void;

export interface LiveTransport {
  connect():                       void;
  disconnect():                    void;
  send(event: LiveEventName, payload: Partial<LiveSessionPayload>): void;
  onMessage(handler: MessageHandler): () => void;
  getMode(): 'websocket';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function authToken(): string | null {
  return localStorage.getItem('token');
}

function wsBaseUrl(): string {
  // Prefer API base URL (e.g. http://localhost:8000/api/v1) so WS connects to the backend,
  // not the frontend dev server origin.
  const apiBase = (import.meta as any)?.env?.VITE_API_BASE_URL as string | undefined;
  if (apiBase) {
    try {
      const u = new URL(apiBase);
      const protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${protocol}//${u.host}`;
    } catch {
      // fall through
    }
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}`;
}

// ─── WebSocket transport ──────────────────────────────────────────────────────

class WebSocketTransport implements LiveTransport {
  private ws:       WebSocket | null = null;
  private handlers: Set<MessageHandler> = new Set();
  private url:      string;

  constructor(classroomId: number) {
    const token   = authToken() ?? '';
    this.url      = `${wsBaseUrl()}/ws/v1/classrooms/${classroomId}/live?token=${token}`;
  }

  connect() {
    if (this.ws) return;
    this.ws = new WebSocket(this.url);

    this.ws.onmessage = (e: MessageEvent) => {
      try {
        const msg: LiveSocketMessage = JSON.parse(e.data);
        this.handlers.forEach((h) => h(msg));
      } catch { /* ignore malformed */ }
    };

    this.ws.onerror = () => {
      // No fallback; just drop the socket reference.
      this.ws = null;
    };
  }

  disconnect() {
    this.ws?.close();
    this.ws = null;
  }

  send(event: LiveEventName, payload: Partial<LiveSessionPayload>) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ event, payload }));
    }
  }

  onMessage(handler: MessageHandler) {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  getMode() { return 'websocket' as const; }
}

// ─── Factory — WebSocket only ────────────────────────────────────────────────

export async function createLiveTransport(classroomId: number): Promise<LiveTransport> {
  return Promise.resolve(new WebSocketTransport(classroomId));
}
