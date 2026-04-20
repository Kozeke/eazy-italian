/**
 * SupportChatWidget.tsx
 * ─────────────────────
 * Floating support-chat bubble rendered inside AdminLayout.
 *
 * Features
 * ─────────
 * • Floating action button (bottom-right corner)
 * • Unread badge pulled from  GET /admin/support/unread-count
 * • Full chat panel  (open/close toggle)
 * • Long-poll for new replies every 4 s while panel is open
 * • Sends via  POST /admin/support/messages
 * • All messages persisted to DB + forwarded to Telegram
 *
 * Design tokens (match codebase palette)
 * ──────────────────────────────────────
 * Primary   #6C6FEF   Primary Dark  #4F52C2
 * Tint      #EEF0FE   Background    #F7F7FA
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
    primary:   "#6C6FEF",
    primaryD:  "#4F52C2",
    tint:      "#EEF0FE",
    bg:        "#F7F7FA",
    white:     "#FFFFFF",
    border:    "#E8E8F0",
    text:      "#18181B",
    sub:       "#52525B",
    muted:     "#A1A1AA",
    danger:    "#EF4444",
    success:   "#22C55E",
    shadow:    "0 8px 32px rgba(108,111,239,0.18), 0 2px 8px rgba(0,0,0,0.08)",
    shadowSm:  "0 2px 8px rgba(0,0,0,0.08)",
  };
  
  // ─── API base URL (same pattern as api.ts) ────────────────────────────────────
  const API_BASE =
    (import.meta.env?.VITE_API_BASE_URL as string | undefined) ??
    "http://localhost:8000/api/v1";
  
  function getAuthHeader(): Record<string, string> {
    const token = localStorage.getItem("token");
    return token ? { Authorization: `Bearer ${token}` } : {};
  }
  
  async function apiFetch<T>(
    path: string,
    options?: RequestInit,
  ): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { "Content-Type": "application/json", ...getAuthHeader() },
      ...options,
    });
    if (!res.ok) throw new Error(`API ${res.status}`);
    return res.json() as Promise<T>;
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
      return new Date(iso).toLocaleTimeString([], {
        hour:   "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  }
  
  // ─── Bubble icon ──────────────────────────────────────────────────────────────
  function ChatIcon({ size = 22 }: { size?: number }) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    );
  }
  
  function CloseIcon({ size = 18 }: { size?: number }) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
      >
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    );
  }
  
  function SendIcon({ size = 18 }: { size?: number }) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <line x1="22" y1="2" x2="11" y2="13" />
        <polygon points="22 2 15 22 11 13 2 9 22 2" />
      </svg>
    );
  }
  
  // ─── Component ────────────────────────────────────────────────────────────────
  export default function SupportChatWidget() {
    // Provides localized strings for support chat widget labels and messages.
    const { t } = useTranslation();
    const [open,     setOpen]     = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input,    setInput]    = useState("");
    const [sending,  setSending]  = useState(false);
    const [loading,  setLoading]  = useState(false);
    const [error,    setError]    = useState<string | null>(null);
    const [unread,   setUnread]   = useState(0);
  
    const bottomRef   = useRef<HTMLDivElement>(null);
    const inputRef    = useRef<HTMLTextAreaElement>(null);
    const pollTimer   = useRef<ReturnType<typeof setInterval> | null>(null);
    const lastIdRef   = useRef<number>(0);
  
    // ── Scroll to bottom ────────────────────────────────────────────────────────
    const scrollBottom = useCallback(() => {
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 60);
    }, []);
  
    // ── Fetch messages ──────────────────────────────────────────────────────────
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
      } catch {
        /* silently swallow poll errors */
      }
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
      inputRef.current?.focus();
    }, [open, scrollBottom, t]);
  
    // ── Long-poll while open ────────────────────────────────────────────────────
    useEffect(() => {
      if (!open) {
        if (pollTimer.current) clearInterval(pollTimer.current);
        return;
      }
      pollTimer.current = setInterval(() => {
        fetchMessages(lastIdRef.current || undefined);
      }, 4000);
      return () => {
        if (pollTimer.current) clearInterval(pollTimer.current);
      };
    }, [open, fetchMessages]);
  
    // ── Unread badge (even when closed) ────────────────────────────────────────
    useEffect(() => {
      const fetchUnread = async () => {
        try {
          const r = await apiFetch<{ unread: number }>("/admin/support/unread-count");
          setUnread(r.unread);
        } catch { /* ignore */ }
      };
      fetchUnread();
      const t = setInterval(fetchUnread, 15_000);
      return () => clearInterval(t);
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
  
    // ── Keyboard shortcut (Enter to send, Shift+Enter = newline) ───────────────
    const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    };
  
    // ── Toggle open ─────────────────────────────────────────────────────────────
    const toggleOpen = () => {
      setOpen(v => !v);
      if (!open) setUnread(0);
    };
  
    // ── Styles (plain objects — no Tailwind dependency) ────────────────────────
    const styles = {
      root: {
        position:   "fixed",
        bottom:     28,
        right:      28,
        zIndex:     9999,
        display:    "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap:        12,
        fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
      },
      panel: {
        width:           360,
        height:          520,
        background:      T.white,
        borderRadius:    20,
        boxShadow:       T.shadow,
        display:         "flex",
        flexDirection:   "column",
        overflow:        "hidden",
        border:          `1.5px solid ${T.border}`,
        transformOrigin: "bottom right",
        animation:       "scw-enter .22s cubic-bezier(.22,1,.36,1)",
      },
      header: {
        background:     `linear-gradient(135deg, ${T.primary} 0%, ${T.primaryD} 100%)`,
        padding:        "16px 18px",
        display:        "flex",
        alignItems:     "center",
        gap:            12,
        flexShrink:     0,
      },
      headerAvatar: {
        width:          38,
        height:         38,
        borderRadius:   "50%",
        background:     "rgba(255,255,255,0.22)",
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        flexShrink:     0,
      },
      headerTitle: {
        flex:       1,
        color:      T.white,
        fontWeight: 700,
        fontSize:   15,
        letterSpacing: -0.2,
      },
      headerSub: {
        color:      "rgba(255,255,255,0.75)",
        fontSize:   12,
        marginTop:  2,
      },
      onlineDot: {
        width:           8,
        height:          8,
        borderRadius:    "50%",
        background:      T.success,
        border:          "2px solid rgba(255,255,255,0.5)",
        position:        "absolute",
        bottom:          1,
        right:           1,
      },
      closeBtn: {
        background:     "rgba(255,255,255,0.15)",
        border:         "none",
        borderRadius:   8,
        color:          T.white,
        width:          30,
        height:         30,
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        cursor:         "pointer",
        flexShrink:     0,
        transition:     "background .15s",
      },
      messages: {
        flex:       1,
        overflowY:  "auto",
        padding:    "16px 14px",
        display:    "flex",
        flexDirection: "column",
        gap:        10,
        background: T.bg,
      },
      bubble: (role: string): React.CSSProperties => ({
        maxWidth:     "80%",
        padding:      "9px 13px",
        borderRadius: role === "teacher" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
        alignSelf:    role === "teacher" ? "flex-end" : "flex-start",
        background:   role === "teacher" ? T.primary : T.white,
        color:        role === "teacher" ? T.white : T.text,
        fontSize:     14,
        lineHeight:   1.5,
        boxShadow:    T.shadowSm,
        border:       role === "teacher" ? "none" : `1px solid ${T.border}`,
        wordBreak:    "break-word",
      }),
      bubbleTime: (role: string): React.CSSProperties => ({
        fontSize:   10,
        color:      role === "teacher" ? "rgba(255,255,255,0.65)" : T.muted,
        marginTop:  4,
        textAlign:  role === "teacher" ? "right" : "left",
      }),
      emptyState: {
        flex:           1,
        display:        "flex",
        flexDirection:  "column",
        alignItems:     "center",
        justifyContent: "center",
        color:          T.muted,
        fontSize:       13,
        gap:            10,
        padding:        24,
        textAlign:      "center",
      },
      footer: {
        padding:         "10px 12px",
        borderTop:       `1.5px solid ${T.border}`,
        background:      T.white,
        display:         "flex",
        alignItems:      "flex-end",
        gap:             8,
        flexShrink:      0,
      },
      textarea: {
        flex:           1,
        resize:         "none",
        border:         `1.5px solid ${T.border}`,
        borderRadius:   12,
        padding:        "9px 12px",
        fontSize:       14,
        fontFamily:     "inherit",
        color:          T.text,
        background:     T.bg,
        outline:        "none",
        lineHeight:     1.5,
        maxHeight:      100,
        minHeight:      38,
        overflowY:      "auto",
        transition:     "border-color .15s",
      },
      sendBtn: {
        width:          38,
        height:         38,
        borderRadius:   12,
        border:         "none",
        background:     T.primary,
        color:          T.white,
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        cursor:         "pointer",
        flexShrink:     0,
        transition:     "background .15s, transform .1s",
      },
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
        boxShadow:      T.shadow,
        position:       "relative",
        flexShrink:     0,
        transition:     "transform .15s, box-shadow .15s",
      },
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
      },
      errorBanner: {
        padding:        "7px 14px",
        background:     "#FEF2F2",
        borderTop:      "1px solid #FECACA",
        color:          "#DC2626",
        fontSize:       12,
        flexShrink:     0,
      },
    } satisfies Record<string, React.CSSProperties | ((role: string) => React.CSSProperties)>;
  
    return (
      <>
        {/* ── Keyframe animation injected once ─────────────────────────────── */}
        <style>{`
          @keyframes scw-enter {
            from { opacity: 0; transform: scale(.88) translateY(10px); }
            to   { opacity: 1; transform: scale(1)   translateY(0);    }
          }
          .scw-fab:hover  { transform: scale(1.07) !important; }
          .scw-fab:active { transform: scale(.96)  !important; }
          .scw-send:hover  { background: ${T.primaryD} !important; }
          .scw-send:active { transform: scale(.92) !important; }
          .scw-close:hover { background: rgba(255,255,255,.28) !important; }
          .scw-ta:focus { border-color: ${T.primary} !important; }
          .scw-msgs::-webkit-scrollbar { width: 4px; }
          .scw-msgs::-webkit-scrollbar-thumb { background: ${T.border}; border-radius: 4px; }
        `}</style>
  
        <div style={styles.root}>
          {/* ── Chat panel ─────────────────────────────────────────────────── */}
          {open && (
            <div style={styles.panel}>
              {/* Header */}
              <div style={styles.header}>
                <div style={{ ...styles.headerAvatar, position: "relative" }}>
                  <ChatIcon size={20} />
                  <span style={styles.onlineDot} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={styles.headerTitle}>{t("admin.supportChat.title")}</div>
                  <div style={styles.headerSub}>{t("admin.supportChat.subtitle")}</div>
                </div>
                <button
                  style={styles.closeBtn}
                  className="scw-close"
                  onClick={toggleOpen}
                  aria-label={t("admin.supportChat.closeChatAria")}
                >
                  <CloseIcon size={16} />
                </button>
              </div>
  
              {/* Messages */}
              <div style={styles.messages} className="scw-msgs">
                {loading ? (
                  <div style={styles.emptyState}>
                    <div
                      style={{
                        width:  28,
                        height: 28,
                        border: `3px solid ${T.tint}`,
                        borderTopColor: T.primary,
                        borderRadius: "50%",
                        animation: "scw-spin .7s linear infinite",
                      }}
                    />
                    <style>{`@keyframes scw-spin{to{transform:rotate(360deg)}}`}</style>
                    {t("admin.supportChat.loadingMessages")}
                  </div>
                ) : messages.length === 0 ? (
                  <div style={styles.emptyState}>
                    <div style={{ fontSize: 36 }}>💬</div>
                    <div style={{ fontWeight: 600, color: T.sub, fontSize: 14 }}>
                      {t("admin.supportChat.emptyTitle")}
                    </div>
                    <div>
                      {t("admin.supportChat.emptyDescription")}
                    </div>
                  </div>
                ) : (
                  messages.map(msg => (
                    <div key={msg.id}>
                      <div
                        style={{
                          display:   "flex",
                          justifyContent:
                            msg.sender_role === "teacher" ? "flex-end" : "flex-start",
                        }}
                      >
                        <div>
                          {msg.sender_role === "support" && (
                            <div
                              style={{
                                fontSize:    11,
                                color:       T.muted,
                                marginBottom: 3,
                                paddingLeft:  4,
                              }}
                            >
                              {t("admin.supportChat.supportLabel")}
                            </div>
                          )}
                          <div style={styles.bubble(msg.sender_role)}>
                            {msg.body}
                          </div>
                          <div style={styles.bubbleTime(msg.sender_role)}>
                            {formatTime(msg.created_at)}
                            {msg.sender_role === "teacher" &&
                              (msg.is_read ? ` · ${t("admin.supportChat.readStatus")}` : "")}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
                <div ref={bottomRef} />
              </div>
  
              {/* Error banner */}
              {error && <div style={styles.errorBanner}>⚠ {error}</div>}
  
              {/* Input footer */}
              <div style={styles.footer}>
                <textarea
                  ref={inputRef}
                  className="scw-ta"
                  style={styles.textarea}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder={t("admin.supportChat.inputPlaceholder")}
                  rows={1}
                  disabled={sending}
                />
                <button
                  style={{
                    ...styles.sendBtn,
                    opacity: (!input.trim() || sending) ? 0.5 : 1,
                    cursor:  (!input.trim() || sending) ? "not-allowed" : "pointer",
                  }}
                  className="scw-send"
                  onClick={send}
                  disabled={!input.trim() || sending}
                  aria-label={t("admin.supportChat.sendMessageAria")}
                >
                  {sending ? (
                    <div
                      style={{
                        width:  14,
                        height: 14,
                        border: "2.5px solid rgba(255,255,255,.4)",
                        borderTopColor: "#fff",
                        borderRadius: "50%",
                        animation: "scw-spin .6s linear infinite",
                      }}
                    />
                  ) : (
                    <SendIcon size={16} />
                  )}
                </button>
              </div>
            </div>
          )}
  
          {/* ── FAB ──────────────────────────────────────────────────────────── */}
          <button
            style={styles.fab}
            className="scw-fab"
            onClick={toggleOpen}
            aria-label={open ? t("admin.supportChat.closeWidgetAria") : t("admin.supportChat.openWidgetAria")}
            title={t("admin.supportChat.title")}
          >
            {open ? <CloseIcon size={22} /> : <ChatIcon size={22} />}
            {!open && unread > 0 && (
              <span style={styles.badge}>{unread > 9 ? "9+" : unread}</span>
            )}
          </button>
        </div>
      </>
    );
  }