/**
 * ManualBuilderLauncher.tsx  (refactored)
 *
 * CHANGES:
 * ─────────
 * • "Slides" card removed — a blank slide is now created directly when
 *   the teacher clicks "Add content" from the empty state or the footer.
 *   The parent (LessonWorkspace) calls onSelectSlides("Untitled Slide")
 *   immediately, bypassing this launcher entirely for the slides path.
 *
 * • This launcher now shows only two content types:
 *     1. Video  — inline embed editor (unchanged)
 *     2. Exercise — navigate to /admin/exercises/new (unchanged)
 *       The exercise page now also supports Image / Video / Audio blocks.
 *
 * • "Lesson builder · Step 1" label removed.
 * • CreateSlideModal import and state removed.
 */

import React, { useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  PlayCircle,
  ClipboardList,
  ChevronLeft,
  Video,
  BadgeCheck,
  Plus,
  X,
} from "lucide-react";
import type { ActiveBuilderType } from "../lessonMode.types";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface ManualBuilderLauncherProps {
  onSelect: (type: ActiveBuilderType) => void;
  /** kept for API compat — no longer used inside this component */
  onSelectSlides: (title: string) => void;

  /** When true the Back button says "Back to lesson". */
  hasExistingContent?: boolean;
  onBack: () => void;
  activeSegmentId?: number | null;
}

// ─── Card config ──────────────────────────────────────────────────────────────

interface CardConfig {
  type: ActiveBuilderType;
  label: string;
  description: string;
  Icon: React.ElementType;
  IllustIcon: React.ElementType;
  accent: {
    bg: string;
    border: string;
    iconBg: string;
    iconText: string;
    labelText: string;
    hoverBorder: string;
    hoverBg: string;
    bar: string;
  };
}

const DRAFT_ROUTE_CONTEXT_STORAGE_KEY = "exerciseDraftsRouteContext";

const CARDS: CardConfig[] = [
  {
    type: "video",
    label: "Video",
    description: "Embed a YouTube or Vimeo video as a guided lesson resource.",
    Icon: PlayCircle,
    IllustIcon: Video,
    accent: {
      bg: "bg-white",
      border: "border-slate-200",
      iconBg: "bg-sky-50",
      iconText: "text-sky-500",
      labelText: "text-sky-700",
      hoverBorder: "hover:border-sky-300",
      hoverBg: "hover:bg-sky-50/30",
      bar: "bg-sky-500",
    },
  },
  {
    type: "test",
    label: "Exercise / Media",
    description:
      "Add questions, image, video, or audio blocks to your lesson.",
    Icon: ClipboardList,
    IllustIcon: BadgeCheck,
    accent: {
      bg: "bg-white",
      border: "border-slate-200",
      iconBg: "bg-[#EEF0FE]",
      iconText: "text-[#6C6FEF]",
      labelText: "text-[#4F52C2]",
      hoverBorder: "hover:border-[#C7C9F9]",
      hoverBg: "hover:bg-[#EEF0FE]/40",
      bar: "bg-[#6C6FEF]",
    },
  },
];

// ─── Card ─────────────────────────────────────────────────────────────────────

function BuilderCard({
  card,
  index,
  onClick,
}: {
  card: CardConfig;
  index: number;
  onClick: () => void;
}) {
  const { label, description, Icon, IllustIcon, accent } = card;
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "group relative flex flex-col items-start text-left rounded-2xl border p-5",
        "transition-all duration-200 focus:outline-none focus-visible:ring-2",
        "focus-visible:ring-offset-2 focus-visible:ring-slate-400 shadow-sm hover:shadow-md",
        "builder-card-enter",
        accent.bg,
        accent.border,
        accent.hoverBorder,
        accent.hoverBg,
      ].join(" ")}
      style={{ animationDelay: `${index * 60}ms`, animationFillMode: "both" }}
    >
      <div
        className={[
          "absolute inset-x-0 top-0 h-[3px] rounded-t-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-200",
          accent.bar,
        ].join(" ")}
        aria-hidden
      />
      <div
        className={[
          "mb-4 flex h-10 w-10 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-110",
          accent.iconBg,
        ].join(" ")}
      >
        <Icon className={`h-5 w-5 ${accent.iconText}`} />
      </div>
      <span
        className={[
          "text-[15px] font-bold tracking-tight mb-1",
          accent.labelText,
        ].join(" ")}
      >
        {label}
      </span>
      <span className="text-[12px] leading-relaxed text-slate-500 flex-1">
        {description}
      </span>
      <IllustIcon
        className={[
          "absolute bottom-4 right-4 h-7 w-7 opacity-[0.07] transition-opacity duration-200 group-hover:opacity-[0.12]",
          accent.iconText,
        ].join(" ")}
        aria-hidden
      />
    </button>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ManualBuilderLauncher({
  onSelect,
  hasExistingContent = false,
  onBack,
}: ManualBuilderLauncherProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const panelRef = useRef<HTMLDivElement>(null);

  const dialogLabel = hasExistingContent
    ? "Add content"
    : "What would you like to add?";

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onBack();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onBack]);

  useEffect(() => {
    document.body.classList.add("classroom-mode-locked");
    return () => document.body.classList.remove("classroom-mode-locked");
  }, []);

  useEffect(() => {
    requestAnimationFrame(() => panelRef.current?.focus());
  }, []);

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm"
        aria-hidden
        onClick={onBack}
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="manual-builder-launcher-title"
        tabIndex={-1}
        className={[
          "fixed z-50 inset-x-4 top-[8vh] mx-auto max-w-2xl outline-none",
          "flex max-h-[84vh] flex-col overflow-hidden rounded-2xl bg-white",
          "shadow-2xl ring-1 ring-slate-200",
        ].join(" ")}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Brand accent bar */}
        <div
          className="h-[3px] w-full shrink-0 rounded-t-2xl"
          style={{ background: "linear-gradient(to right, #6C6FEF, #9496ef)" }}
          aria-hidden
        />

        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1.5 text-[13px] font-medium text-slate-500 hover:text-slate-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 rounded-lg -ml-1 px-1 py-0.5"
          >
            <ChevronLeft className="h-4 w-4" />
            {hasExistingContent ? "Back to lesson" : "Back"}
          </button>
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6C6FEF]/40"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          <div className="mb-5">
            <h2
              id="manual-builder-launcher-title"
              className="text-[19px] font-bold tracking-tight text-slate-900 flex items-center gap-2"
            >
              <Plus className="h-5 w-5 text-slate-400 shrink-0" />
              {dialogLabel}
            </h2>
            <p className="mt-1 text-[13px] text-slate-500">
              Choose a content type to add to your lesson.
            </p>
          </div>

          {/* Slide shortcut — full-width banner */}
          <SlideShortcut />

          {/* Other content types */}
          <p className="mt-5 mb-3 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
            Or add
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {CARDS.map((card, i) => (
              <BuilderCard
                key={card.type}
                card={card}
                index={i}
                onClick={() => {
                  if (card.type === "test") {
                    const returnTo = `${location.pathname}${location.search}${location.hash}`;
                    sessionStorage.setItem(
                      DRAFT_ROUTE_CONTEXT_STORAGE_KEY,
                      JSON.stringify({
                        returnTo,
                        targetSectionId: null,
                      }),
                    );
                    navigate("/admin/exercises/new", { state: { returnTo } });
                    return;
                  }
                  onSelect(card.type);
                }}
              />
            ))}
          </div>
        </div>

        <style>{`
          @keyframes builderCardEnter {
            from { opacity: 0; transform: translateY(10px); }
            to   { opacity: 1; transform: translateY(0); }
          }
          .builder-card-enter {
            animation: builderCardEnter 0.28s cubic-bezier(0.22,1,0.36,1) both;
          }
        `}</style>
      </div>
    </>
  );
}

// ─── Slide shortcut banner ────────────────────────────────────────────────────
// A prominent full-width card that navigates to /admin/exercises/new with
// a flag indicating "slide" mode — the exercise page handles image/video/audio
// blocks on a white canvas.

function SlideShortcut() {
  const navigate = useNavigate();
  const location = useLocation();
  const [hov, setHov] = React.useState(false);

  const handleClick = () => {
    const returnTo = `${location.pathname}${location.search}${location.hash}`;
    sessionStorage.setItem(
      DRAFT_ROUTE_CONTEXT_STORAGE_KEY,
      JSON.stringify({
        returnTo,
        targetSectionId: null,
      }),
    );
    navigate("/admin/exercises/new", {
      state: { returnTo, slideMode: true },
    });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "16px 20px",
        borderRadius: 16,
        border: `1.5px solid ${hov ? "#C7C9F9" : "#E8EAFD"}`,
        background: hov ? "#EEF0FE" : "#FAFBFF",
        cursor: "pointer",
        textAlign: "left",
        transition: "all 160ms ease",
        fontFamily: "inherit",
        boxShadow: hov
          ? "0 4px 18px rgba(108,111,239,0.10)"
          : "0 1px 4px rgba(26,29,58,0.04)",
      }}
    >
      {/* Icon */}
      <span
        style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          background: "#EEF0FE",
          border: "1.5px solid #C7C9F9",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          transition: "transform 160ms ease",
          transform: hov ? "scale(1.08)" : "none",
        }}
      >
        {/* White page icon */}
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <rect x="3" y="2" width="14" height="16" rx="2" fill="#EEF0FE" stroke="#6C6FEF" strokeWidth="1.5"/>
          <path d="M6 7h8M6 10h8M6 13h5" stroke="#6C6FEF" strokeWidth="1.2" strokeLinecap="round"/>
        </svg>
      </span>

      {/* Text */}
      <div style={{ flex: 1 }}>
        <p style={{
          margin: 0,
          fontSize: 15,
          fontWeight: 700,
          color: "#4F52C2",
          letterSpacing: "-0.02em",
        }}>
          Blank slide
        </p>
        <p style={{
          margin: "2px 0 0",
          fontSize: 12,
          color: "#7578A4",
          lineHeight: 1.5,
        }}>
          White canvas — add images, video, audio or exercises
        </p>
      </div>

      {/* Arrow */}
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        style={{
          color: "#6C6FEF",
          opacity: hov ? 1 : 0.4,
          transition: "opacity 160ms ease",
          flexShrink: 0,
        }}
      >
        <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </button>
  );
}