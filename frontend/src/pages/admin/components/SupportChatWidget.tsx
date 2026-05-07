/**
 * SupportChatWidget.tsx  — redesigned
 * ─────────────────────────────────────
 * Floating support-chat bubble rendered inside AdminLayout.
 *
 * Features
 * ─────────
 * • Floating action button (bottom-right, 54 px circle)
 * • Unread badge — GET /admin/support/unread-count
 * • Full chat panel (360 × 520 px, slide-up open animation)
 * • Long-poll every 4 s while panel is open
 * • Sends via POST /admin/support/messages
 * • All styles as inline React.CSSProperties + injected <style> for
 *   pseudo-selectors / keyframes — no external CSS dependencies.
 */

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  KeyboardEvent,
} from "react";
import { useTranslation } from "react-i18next";

// ─── Design tokens ────────────────────────────────────────────────────────────
const T = {
  primary:  "#6C6FEF",
  primaryD: "#4F52C2",
  tint:     "#EEF0FE",
  bg:       "#F7F7FA",
  white:    "#FFFFFF",
  border:   "#E8E8F0",
  text:     "#18181B",
  sub:      "#52525B",
  muted:    "#A1A1AA",
  danger:   "#EF4444",
  success:  "#22C55E",
} as const;

// ─── API helpers ──────────────────────────────────────────────────────────────
const API_BASE =
  (import.meta.env?.VITE_API_BASE_URL as string | undefined) ??
  "http://localhost:8000/api/v1";

function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiFetch<R>(path: string, options?: RequestInit): Promise<R> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...getAuthHeader() },
    ...options,
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json() as Promise<R>;
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface ChatMessage {
  id:          number;
  sender_role: "teacher" | "support";
  body:        string;
  is_read:     boolean;
  created_at:  string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}

// ─── SVG icons ────────────────────────────────────────────────────────────────
function ChatIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function CloseIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function SendIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

// ─── Spinner ──────────────────────────────────────────────────────────────────
function Spinner({ size = 28, color = T.primary, trackColor = T.tint }: {
  size?: number; color?: string; trackColor?: string;
}) {
  return (
    <div style={{
      width: size, height: size,
      border: `3px solid ${trackColor}`,
      borderTopColor: color,
      borderRadius: "50%",
      animation: "scw-spin 0.65s linear infinite",
      flexShrink: 0,
    }} />
  );
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function SupportChatWidget() {
  const { t } = useTranslation();

  const [open,     setOpen]     = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input,    setInput]    = useState("");
  const [sending,  setSending]  = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [unread,   setUnread]   = useState(0);

  const bottomRef  = useRef<HTMLDivElement>(null);
  const inputRef   = useRef<HTMLTextAreaElement>(null);
  const pollTimer  = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastIdRef  = useRef<number>(0);

  // ── Scroll to bottom ────────────────────────────────────────────────────────
  const scrollBottom = useCallback(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 60);
  }, []);

  // ── Fetch messages (incremental or full) ────────────────────────────────────
  const fetchMessages = useCallback(async (afterId?: number) => {
    try {
      const qs  = afterId != null ? `?after=${afterId}` : "";
      const res = await apiFetch<ChatMessage[]>(`/admin/support/messages${qs}`);
      if (res.length > 0) {
        setMessages(prev => {
          const merged = afterId != null ? [...prev, ...res] : res;
          lastIdRef.current = merged[merged.length - 1].id;
          return merged;
        });
        scrollBottom();
      }
    } catch { /* silently swallow poll errors */ }
  }, [scrollBottom]);

  // ── Initial load when panel opens ──────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    apiFetch<ChatMessage[]>("/admin/support/messages")
      .then(res => {
        setMessages(res);
        if (res.length > 0) lastIdRef.current = res[res.length - 1].id;
        scrollBottom();
      })
      .catch(() => setError(t("admin.supportChat.errors.load")))
      .finally(() => setLoading(false));
    setTimeout(() => inputRef.current?.focus(), 300);
  }, [open, scrollBottom, t]);

  // ── Long-poll while open ────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) { if (pollTimer.current) clearInterval(pollTimer.current); return; }
    pollTimer.current = setInterval(() => {
      fetchMessages(lastIdRef.current || undefined);
    }, 4000);
    return () => { if (pollTimer.current) clearInterval(pollTimer.current); };
  }, [open, fetchMessages]);

  // ── Unread badge poll (every 30 s while closed) ─────────────────────────────
  useEffect(() => {
    const fetchUnread = async () => {
      try {
        const r = await apiFetch<{ unread: number }>("/admin/support/unread-count");
        setUnread(r.unread);
      } catch { /* ignore */ }
    };
    fetchUnread();
    const interval = setInterval(fetchUnread, 30_000);
    return () => clearInterval(interval);
  }, []);

  // ── Send message ────────────────────────────────────────────────────────────
  const send = useCallback(async () => {
    const body = input.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      const msg = await apiFetch<ChatMessage>("/admin/support/messages", {
        method: "POST",
        body:   JSON.stringify({ body }),
      });
      setMessages(prev => {
        const next = [...prev, msg];
        lastIdRef.current = msg.id;
        return next;
      });
      setInput("");
      scrollBottom();
    } catch {
      setError(t("admin.supportChat.errors.send"));
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }, [input, sending, scrollBottom, t]);

  // ── Keyboard: Enter to send, Shift+Enter = newline ──────────────────────────
  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  // ── Textarea auto-grow ──────────────────────────────────────────────────────
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  };

  // ── Toggle open/close ────────────────────────────────────────────────────────
  const toggleOpen = () => {
    setOpen(v => !v);
    if (!open) setUnread(0);
  };

  const canSend = input.trim().length > 0 && !sending;

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Keyframes + pseudo-selector styles (injected once) ─────────────── */}
      <style>{`
        @keyframes scw-panel-in {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0);    }
        }
        @keyframes scw-panel-out {
          from { opacity: 1; transform: translateY(0);    }
          to   { opacity: 0; transform: translateY(16px); }
        }
        @keyframes scw-msg-in {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0);   }
        }
        @keyframes scw-spin {
          to { transform: rotate(360deg); }
        }
        @keyframes scw-badge-pop {
          0%   { transform: scale(0);    }
          70%  { transform: scale(1.15); }
          100% { transform: scale(1);    }
        }

        /* FAB */
        .scw-fab { transition: transform 0.15s, box-shadow 0.15s; }
        .scw-fab:hover  { transform: scale(1.08) !important;
                          box-shadow: 0 12px 40px rgba(108,111,239,0.48), 0 4px 12px rgba(0,0,0,0.12) !important; }
        .scw-fab:active { transform: scale(0.95) !important; }

        /* Close button */
        .scw-close { transition: background 0.15s; }
        .scw-close:hover  { background: rgba(255,255,255,0.30) !important; }
        .scw-close:active { background: rgba(255,255,255,0.40) !important; }

        /* Textarea */
        .scw-ta { transition: border-color 0.15s, background 0.15s; }
        .scw-ta:focus {
          border-color: ${T.primary} !important;
          background:   ${T.white}   !important;
          outline: none;
        }
        .scw-ta::placeholder { color: ${T.muted}; }

        /* Send button */
        .scw-send { transition: transform 0.15s, opacity 0.15s; }
        .scw-send:hover:not(:disabled)  { transform: scale(1.06); }
        .scw-send:active:not(:disabled) { transform: scale(0.94); }

        /* Scrollbar */
        .scw-msgs::-webkit-scrollbar       { width: 4px; }
        .scw-msgs::-webkit-scrollbar-track { background: transparent; }
        .scw-msgs::-webkit-scrollbar-thumb { background: ${T.border}; border-radius: 4px; }

        /* Message entrance */
        .scw-msg-row { animation: scw-msg-in 0.18s ease-out both; }
      `}</style>

      {/* ── Root container ──────────────────────────────────────────────────── */}
      <div style={styles.root}>

        {/* ── Chat panel ──────────────────────────────────────────────────── */}
        {open && (
          <div style={styles.panel}>

            {/* Header */}
            <div style={styles.header}>
              {/* Avatar */}
              <div style={{ position: "relative", flexShrink: 0 }}>
                <div style={styles.headerAvatar}>💬</div>
                <span style={styles.onlineDot} />
              </div>

              {/* Title / subtitle */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={styles.headerTitle}>
                  {t("admin.supportChat.title")}
                </div>
                <div style={styles.headerSub}>
                  {t("admin.supportChat.subtitle")}
                </div>
              </div>

              {/* Close button */}
              <button
                style={styles.closeBtn}
                className="scw-close"
                onClick={toggleOpen}
                aria-label={t("admin.supportChat.closeChatAria")}
              >
                <CloseIcon size={16} />
              </button>
            </div>

            {/* Message list */}
            <div style={styles.messages} className="scw-msgs">
              {loading ? (
                /* Loading state */
                <div style={styles.emptyState}>
                  <Spinner size={28} />
                  <span style={{ fontSize: 12, color: T.muted, marginTop: 6 }}>
                    {t("admin.supportChat.loadingMessages")}
                  </span>
                </div>

              ) : messages.length === 0 ? (
                /* Empty state */
                <div style={styles.emptyState}>
                  <span style={{ fontSize: 36, lineHeight: 1 }}>💬</span>
                  <span style={{ fontWeight: 600, color: T.sub, fontSize: 14, marginTop: 4 }}>
                    {t("admin.supportChat.emptyTitle")}
                  </span>
                  <span style={{ fontSize: 12, color: T.muted, textAlign: "center" }}>
                    {t("admin.supportChat.emptyDescription")}
                  </span>
                </div>

              ) : (
                /* Messages */
                messages.map(msg => {
                  const isTeacher = msg.sender_role === "teacher";
                  return (
                    <div
                      key={msg.id}
                      className="scw-msg-row"
                      style={{
                        display:        "flex",
                        justifyContent: isTeacher ? "flex-end" : "flex-start",
                      }}
                    >
                      <div style={{ maxWidth: "80%", display: "flex", flexDirection: "column",
                                    alignItems: isTeacher ? "flex-end" : "flex-start" }}>
                        {/* Support label */}
                        {!isTeacher && (
                          <span style={styles.supportLabel}>
                            {t("admin.supportChat.supportLabel")}
                          </span>
                        )}

                        {/* Bubble */}
                        <div style={isTeacher ? styles.bubbleTeacher : styles.bubbleSupport}>
                          {msg.body}
                        </div>

                        {/* Timestamp + read */}
                        <div style={{
                          fontSize:  11,
                          color:     T.muted,
                          marginTop: 4,
                          display:   "flex",
                          gap:       4,
                          alignItems: "center",
                        }}>
                          {formatTime(msg.created_at)}
                          {isTeacher && msg.is_read && (
                            <span style={{ color: T.primary, fontSize: 11, fontWeight: 600 }}>✓✓</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={bottomRef} />
            </div>

            {/* Error banner */}
            {error && (
              <div style={styles.errorBanner}>
                <span style={{ marginRight: 5 }}>⚠</span>{error}
              </div>
            )}

            {/* Input footer */}
            <div style={styles.footer}>
              <textarea
                ref={inputRef}
                className="scw-ta"
                style={styles.textarea}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKey}
                placeholder={t("admin.supportChat.inputPlaceholder")}
                rows={1}
                disabled={sending}
                aria-label={t("admin.supportChat.inputPlaceholder")}
              />
              <button
                style={{
                  ...styles.sendBtn,
                  opacity: canSend ? 1 : 0.45,
                  cursor:  canSend ? "pointer" : "not-allowed",
                }}
                className="scw-send"
                onClick={send}
                disabled={!canSend}
                aria-label={t("admin.supportChat.sendMessageAria")}
              >
                {sending ? (
                  <Spinner size={14} color="#fff" trackColor="rgba(255,255,255,0.3)" />
                ) : (
                  <SendIcon size={16} />
                )}
              </button>
            </div>
          </div>
        )}

        {/* ── FAB ───────────────────────────────────────────────────────────── */}
        <button
          style={styles.fab}
          className="scw-fab"
          onClick={toggleOpen}
          aria-label={open ? t("admin.supportChat.closeWidgetAria") : t("admin.supportChat.openWidgetAria")}
          title={t("admin.supportChat.title")}
        >
          {open ? <CloseIcon size={22} /> : <ChatIcon size={22} />}

          {/* Unread badge */}
          {!open && unread > 0 && (
            <span style={styles.badge}>
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </div>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = {
  root: {
    position:      "fixed",
    bottom:        24,
    right:         24,
    zIndex:        9999,
    display:       "flex",
    flexDirection: "column",
    alignItems:    "flex-end",
    gap:           12,
    fontFamily:    "'Inter', system-ui, -apple-system, sans-serif",
  } satisfies React.CSSProperties,

  panel: {
    width:           360,
    height:          520,
    background:      T.white,
    borderRadius:    20,
    boxShadow:       "0 24px 64px rgba(108,111,239,0.18), 0 4px 16px rgba(0,0,0,0.06)",
    display:         "flex",
    flexDirection:   "column",
    overflow:        "hidden",
    transformOrigin: "bottom right",
    animation:       "scw-panel-in 280ms cubic-bezier(0.16, 1, 0.3, 1) both",
  } satisfies React.CSSProperties,

  header: {
    background:  `linear-gradient(135deg, ${T.primary} 0%, ${T.primaryD} 100%)`,
    padding:     "18px 20px",
    display:     "flex",
    alignItems:  "center",
    gap:         12,
    flexShrink:  0,
    borderRadius: "20px 20px 0 0",
  } satisfies React.CSSProperties,

  headerAvatar: {
    width:          38,
    height:         38,
    borderRadius:   "50%",
    background:     T.white,
    display:        "flex",
    alignItems:     "center",
    justifyContent: "center",
    fontSize:       18,
    flexShrink:     0,
  } satisfies React.CSSProperties,

  onlineDot: {
    position:     "absolute",
    bottom:       1,
    right:        1,
    width:        8,
    height:       8,
    borderRadius: "50%",
    background:   T.success,
    border:       `2px solid ${T.white}`,
  } satisfies React.CSSProperties,

  headerTitle: {
    color:         T.white,
    fontWeight:    700,
    fontSize:      15,
    letterSpacing: -0.2,
    lineHeight:    1.2,
  } satisfies React.CSSProperties,

  headerSub: {
    color:     "rgba(255,255,255,0.72)",
    fontSize:  12,
    marginTop: 2,
    lineHeight: 1.3,
  } satisfies React.CSSProperties,

  closeBtn: {
    background:     "rgba(255,255,255,0.18)",
    border:         "none",
    borderRadius:   "50%",
    color:          T.white,
    width:          30,
    height:         30,
    display:        "flex",
    alignItems:     "center",
    justifyContent: "center",
    cursor:         "pointer",
    flexShrink:     0,
  } satisfies React.CSSProperties,

  messages: {
    flex:          1,
    overflowY:     "auto",
    padding:       16,
    display:       "flex",
    flexDirection: "column",
    gap:           10,
    background:    T.bg,
  } satisfies React.CSSProperties,

  supportLabel: {
    fontSize:     11,
    color:        T.muted,
    marginBottom: 3,
    paddingLeft:  2,
    fontWeight:   500,
  } satisfies React.CSSProperties,

  bubbleSupport: {
    padding:      "10px 14px",
    borderRadius: "4px 16px 16px 16px",
    background:   T.white,
    color:        T.text,
    fontSize:     14,
    lineHeight:   1.5,
    boxShadow:    "0 1px 4px rgba(0,0,0,0.05)",
    border:       `1px solid ${T.border}`,
    wordBreak:    "break-word",
  } satisfies React.CSSProperties,

  bubbleTeacher: {
    padding:      "10px 14px",
    borderRadius: "16px 4px 16px 16px",
    background:   `linear-gradient(135deg, ${T.primary}, ${T.primaryD})`,
    color:        T.white,
    fontSize:     14,
    lineHeight:   1.5,
    wordBreak:    "break-word",
  } satisfies React.CSSProperties,

  emptyState: {
    flex:           1,
    display:        "flex",
    flexDirection:  "column",
    alignItems:     "center",
    justifyContent: "center",
    gap:            6,
    padding:        24,
    color:          T.muted,
    fontSize:       13,
  } satisfies React.CSSProperties,

  errorBanner: {
    padding:     "7px 16px",
    background:  "#FEF2F2",
    borderTop:   "1px solid #FECACA",
    color:       "#DC2626",
    fontSize:    12,
    flexShrink:  0,
    display:     "flex",
    alignItems:  "center",
  } satisfies React.CSSProperties,

  footer: {
    padding:     "12px 14px",
    borderTop:   `1px solid ${T.border}`,
    background:  T.white,
    display:     "flex",
    alignItems:  "flex-end",
    gap:         10,
    flexShrink:  0,
  } satisfies React.CSSProperties,

  textarea: {
    flex:        1,
    resize:      "none",
    border:      `1.5px solid ${T.border}`,
    borderRadius: 12,
    padding:     "10px 14px",
    fontSize:    14,
    fontFamily:  "'Inter', system-ui, -apple-system, sans-serif",
    color:       T.text,
    background:  T.bg,
    outline:     "none",
    lineHeight:  1.5,
    minHeight:   40,
    maxHeight:   120,
    overflowY:   "auto",
  } satisfies React.CSSProperties,

  sendBtn: {
    width:          40,
    height:         40,
    borderRadius:   "50%",
    border:         "none",
    background:     `linear-gradient(135deg, ${T.primary}, ${T.primaryD})`,
    color:          T.white,
    display:        "flex",
    alignItems:     "center",
    justifyContent: "center",
    flexShrink:     0,
  } satisfies React.CSSProperties,

  fab: {
    width:          54,
    height:         54,
    borderRadius:   "50%",
    background:     `linear-gradient(135deg, ${T.primary} 0%, ${T.primaryD} 100%)`,
    border:         "none",
    color:          T.white,
    display:        "flex",
    alignItems:     "center",
    justifyContent: "center",
    cursor:         "pointer",
    boxShadow:      "0 8px 32px rgba(108,111,239,0.35), 0 2px 8px rgba(0,0,0,0.10)",
    position:       "relative",
    flexShrink:     0,
  } satisfies React.CSSProperties,

  badge: {
    position:       "absolute",
    top:            -4,
    right:          -4,
    minWidth:       18,
    height:         18,
    borderRadius:   "50%",
    background:     T.danger,
    color:          T.white,
    fontSize:       10,
    fontWeight:     700,
    display:        "flex",
    alignItems:     "center",
    justifyContent: "center",
    border:         `2px solid ${T.white}`,
    padding:        "0 3px",
    animation:      "scw-badge-pop 0.2s cubic-bezier(0.34,1.56,0.64,1) both",
    lineHeight:     1,
  } satisfies React.CSSProperties,
};