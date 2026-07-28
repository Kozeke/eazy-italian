/**
 * RefineChatPanel.tsx
 *
 * Floating "Refine with AI" chat panel. Teacher-only. Lives alongside
 * VerticalLessonPlayer.tsx / SectionBlock.tsx in the flow/ folder.
 *
 * Controlled by `scope` (owned by LessonWorkspace.tsx) — this component owns
 * only its own session-only message history and in-flight/error state.
 *
 * v1 scope, per spec:
 *   - single request/response per turn (no streaming)
 *   - one-level undo (a second refine replaces the stored previous state)
 *   - no persistence of chat history across mounts
 */

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Sparkles, X, Send, Undo2, Loader2 } from "lucide-react";

import type { InlineMediaBlock } from "../useSegmentPersistence";
import { refineApi, segmentsApi } from "../../../../services/api";

// ─── Types ────────────────────────────────────────────────────────────────────

export type RefineScope =
  | {
      type: "block";
      blockId: string;
      blockTitle: string;
      sectionId: string;
      segmentId: number;
    }
  | {
      type: "segment";
      sectionId: string;
      segmentId: number;
    };

interface RefineChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface RefineChatPanelProps {
  scope: RefineScope;
  /** Lesson player column — anchors fixed positioning when portaled to body. */
  anchorRef: React.RefObject<HTMLElement>;
  /** Current persisted blocks for scope.sectionId — needed to build the
   *  full media_blocks array the undo PUT must send (the endpoint replaces
   *  the whole array, it does not patch a single block). */
  blocks: InlineMediaBlock[];
  isMobileViewport: boolean;
  onClose: () => void;
  onWidenToSection: () => void;
  /** Re-scopes the panel when the teacher clicks a different block on the page.
   *  Parent resolves title / section / segment id, so only the id is needed. */
  onRescopeToBlock: (blockId: string) => void;
  /** Called with the freshly-updated block(s) so the parent can patch local state. */
  onApplied: (updatedBlocks: InlineMediaBlock[]) => void;
}

// Identifies a scope for the "reset history when scope changes" effect below.
function scopeKey(scope: RefineScope): string {
  return scope.type === "block" ? `block:${scope.blockId}` : `segment:${scope.sectionId}`;
}

// Keeps the portaled panel pinned to the player column; z-index beats .ebm-menu (9999).
function useRefinePanelPosition(
  anchorRef: React.RefObject<HTMLElement>,
  isMobileViewport: boolean,
): React.CSSProperties {
  const [style, setStyle] = useState<React.CSSProperties>({
    position: "fixed",
    opacity: 0,
    pointerEvents: "none",
    zIndex: 10000,
  });

  useLayoutEffect(() => {
    const update = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const base: React.CSSProperties = {
        position: "fixed",
        zIndex: 10000,
        opacity: 1,
        pointerEvents: "auto",
      };
      if (isMobileViewport) {
        setStyle({
          ...base,
          left: rect.left + 12,
          right: window.innerWidth - rect.right + 12,
          bottom: window.innerHeight - rect.bottom + 12,
          width: "auto",
          maxHeight: "60vh",
        });
      } else {
        setStyle({
          ...base,
          right: window.innerWidth - rect.right + 16,
          bottom: window.innerHeight - rect.bottom + 16,
          width: 340,
          maxHeight: 420,
        });
      }
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [anchorRef, isMobileViewport]);

  return style;
}

// Briefly pulses the block's background (#EEF0FE) so the teacher can see what changed.
function flashBlocks(blockIds: string[]) {
  for (const id of blockIds) {
    const safeId = window.CSS?.escape ? window.CSS.escape(id) : id;
    const el = document.querySelector<HTMLElement>(`[data-lesson-focus-anchor="${safeId}"]`);
    if (!el) continue;
    el.classList.add("lw-refine-pulse");
    window.setTimeout(() => el.classList.remove("lw-refine-pulse"), 1000);
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

/** One-tap preset instructions. Labels come from i18n so they are sent to the
 *  model in the teacher's UI language; the backend's language rules keep the
 *  generated content in the course's target language regardless. */
const QUICK_ACTION_KEYS = [
  "harder",
  "easier",
  "addWords",
  "addQuestions",
  "shorter",
  "fixErrors",
] as const;

export default function RefineChatPanel({
  scope,
  anchorRef,
  blocks,
  isMobileViewport,
  onClose,
  onWidenToSection,
  onRescopeToBlock,
  onApplied,
}: RefineChatPanelProps) {
  const { t } = useTranslation();
  const panelRef = useRef<HTMLDivElement>(null);
  const panelPosition = useRefinePanelPosition(anchorRef, isMobileViewport);
  const [messages, setMessages] = useState<RefineChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUndo, setLastUndo] = useState<{
    updatedBlockIds: string[];
    previousBlocks: InlineMediaBlock[];
  } | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Session-only history — reset whenever the scope actually changes
  // (different block, or widened from block → whole section).
  useEffect(() => {
    setMessages([]);
    setError(null);
    setLastUndo(null);
    setInput("");
  }, [scopeKey(scope)]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight });
  }, [messages, sending]);

  // Spec: "Clicking a different block while the panel is open re-scopes to it."
  // Blocks are identified by the same [data-lesson-focus-anchor] attribute the
  // scroll-to-block and pulse-flash paths already use.
  //
  // UX TRADEOFF (deliberate, flagging it): this fires on ANY click inside a
  // block, including a teacher clicking into an exercise to try it out — which
  // re-scopes and therefore clears the session chat history. That is what the
  // spec asks for. If it proves annoying in real use, the narrower fix is to
  // re-scope only on clicks that land on non-interactive parts of the block.
  useEffect(() => {
    const handler = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      // Never re-scope from clicks inside the panel itself.
      if (panelRef.current?.contains(target)) return;

      const anchor = target.closest<HTMLElement>("[data-lesson-focus-anchor]");
      const blockId = anchor?.getAttribute("data-lesson-focus-anchor");
      if (!blockId) return;
      if (scope.type === "block" && scope.blockId === blockId) return;

      onRescopeToBlock(blockId);
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [scope, onRescopeToBlock]);

  const scopeLabel =
    scope.type === "block" ? scope.blockTitle : t("classroom.refinePanel.wholeSection");

  const handleSend = async (preset?: string) => {
    const instruction = (preset ?? input).trim();
    if (!instruction || sending) return;

    setSending(true);
    setError(null);
    const nextMessages: RefineChatMessage[] = [...messages, { role: "user", content: instruction }];
    setMessages(nextMessages);
    setInput("");

    try {
      const response = await refineApi.refineSegment(scope.segmentId, {
        instruction,
        block_id: scope.type === "block" ? scope.blockId : null,
        // Last 6 turns max, per spec — send what we had *before* this turn plus the new one.
        history: nextMessages.slice(-6).map((m) => ({ role: m.role, content: m.content })),
      });

      const updatedBlocks: InlineMediaBlock[] =
        scope.type === "block"
          ? response.block
            ? [response.block]
            : []
          : response.blocks ?? [];
      const previousBlocks: InlineMediaBlock[] =
        scope.type === "block"
          ? response.previous_block
            ? [response.previous_block]
            : []
          : response.previous_blocks ?? [];

      if (updatedBlocks.length === 0) {
        throw new Error("empty_response");
      }

      onApplied(updatedBlocks);
      flashBlocks(updatedBlocks.map((b) => b.id));
      setLastUndo({
        updatedBlockIds: updatedBlocks.map((b) => b.id),
        previousBlocks,
      });
      setMessages((prev) => [...prev, { role: "assistant", content: response.summary }]);
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 422) {
        setError(t("classroom.refinePanel.errorCouldNotApply"));
      } else if (status === 402) {
        setError(t("classroom.refinePanel.errorQuota"));
      } else {
        setError(t("classroom.refinePanel.errorGeneric"));
      }
      // Remove the optimistic user turn's "pending" state, but keep it visible
      // in history — the teacher can just try rephrasing on the next send.
    } finally {
      setSending(false);
    }
  };

  const handleUndo = async () => {
    if (!lastUndo) return;
    const { updatedBlockIds, previousBlocks } = lastUndo;
    const previousById = new Map(previousBlocks.map((b) => [b.id, b]));

    // The segment PUT replaces the whole media_blocks array, so we must send
    // the full current array with just the refined block(s) swapped back.
    const restoredList = blocks.map((b) =>
      previousById.has(b.id) ? (previousById.get(b.id) as InlineMediaBlock) : b,
    );

    try {
      await segmentsApi.updateSegment(scope.segmentId, { media_blocks: restoredList });
      onApplied(previousBlocks);
      flashBlocks(updatedBlockIds);
      setLastUndo(null);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: t("classroom.refinePanel.undoConfirmed") },
      ]);
    } catch {
      setError(t("classroom.refinePanel.errorGeneric"));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const panel = (
    <div
      ref={panelRef}
      className={
        isMobileViewport ? "lw-refine-panel lw-refine-panel--sheet" : "lw-refine-panel"
      }
      style={panelPosition}
      role="dialog"
      aria-label={t("classroom.refinePanel.title")}
    >
      <div className="lw-refine-panel__header">
        <Sparkles size={15} strokeWidth={2} />
        <span className="lw-refine-panel__title">{t("classroom.refinePanel.title")}</span>
        <span className="lw-refine-panel__scope-chip">
          {scopeLabel}
          {scope.type === "block" && (
            <button
              type="button"
              className="lw-refine-panel__scope-chip-close"
              onClick={onWidenToSection}
              aria-label={t("classroom.refinePanel.widenScope")}
              title={t("classroom.refinePanel.widenScope")}
            >
              <X size={11} strokeWidth={2.5} />
            </button>
          )}
        </span>
        <button
          type="button"
          className="lw-refine-panel__close"
          onClick={onClose}
          aria-label={t("common.close")}
        >
          <X size={16} strokeWidth={2} />
        </button>
      </div>

      <div className="lw-refine-panel__body" ref={bodyRef}>
        {messages.length === 0 && !sending && (
          <p className="lw-refine-panel__hint">{t("classroom.refinePanel.hint")}</p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={
              m.role === "user"
                ? "lw-refine-msg lw-refine-msg--user"
                : "lw-refine-msg lw-refine-msg--assistant"
            }
          >
            {m.content}
          </div>
        ))}
        {sending && (
          <div className="lw-refine-msg lw-refine-msg--assistant lw-refine-msg--pending">
            <Loader2 size={13} className="lw-refine-spin" />
            {t("classroom.refinePanel.thinking")}
          </div>
        )}
        {lastUndo && !sending && (
          <div className="lw-refine-panel__success-row">
            <button type="button" className="lw-refine-panel__undo-btn" onClick={handleUndo}>
              <Undo2 size={13} strokeWidth={2} />
              {t("classroom.refinePanel.undo")}
            </button>
          </div>
        )}
        {error && <p className="lw-refine-panel__error">{error}</p>}
      </div>

      {/* Quick actions — one-tap presets so the teacher doesn't have to type a
          common instruction. Sends immediately; the input stays free for
          anything custom. Hidden while a request is in flight. */}
      {!sending && (
        <div className="lw-refine-panel__quick">
          {QUICK_ACTION_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              className="lw-refine-panel__chip"
              onClick={() => void handleSend(t(`classroom.refinePanel.quick.${key}`))}
            >
              {t(`classroom.refinePanel.quick.${key}`)}
            </button>
          ))}
        </div>
      )}

      <div className="lw-refine-panel__footer">
        <input
          type="text"
          className="lw-refine-panel__input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t("classroom.refinePanel.placeholder")}
          disabled={sending}
          maxLength={1000}
        />
        <button
          type="button"
          className="lw-refine-panel__send"
          onClick={() => void handleSend()}
          disabled={sending || !input.trim()}
          aria-label={t("classroom.refinePanel.send")}
        >
          {sending ? <Loader2 size={15} className="lw-refine-spin" /> : <Send size={15} />}
        </button>
      </div>
    </div>
  );

  return createPortal(panel, document.body);
}