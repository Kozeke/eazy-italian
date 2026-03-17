/**
 * ManualBuilderLauncher.tsx  (v2 — CreateSlideModal intercept)
 *
 * Changes from v1:
 * ─────────────────
 * • When the teacher clicks the Slides card, we no longer call onSelect('slides')
 *   immediately.  Instead we open the local CreateSlideModal first.
 *
 * • On modal confirm (onCreate) we call the new onSelectSlides(title) callback,
 *   passing the chosen title.  This lets the parent initialise the slide draft
 *   with the right title before entering the editor.
 *
 * • On modal cancel we simply close it and stay on the launcher.
 *
 * • All other cards (video / task / test) still call onSelect directly — they
 *   don't need a pre-creation wizard at this stage.
 *
 * • Props diff:
 *     ADDED   onSelectSlides: (title: string) => void
 *     REMOVED nothing — onSelect still exists for non-slide types.
 */

import React, { useState } from "react";
import {
  Presentation,
  PlayCircle,
  FileText,
  ClipboardList,
  ChevronLeft,
  Layers,
  Video,
  PenSquare,
  BadgeCheck,
} from "lucide-react";
import type { ActiveBuilderType } from "../lessonMode.types";
import CreateSlideModal from "./CreateSlideModal";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ManualBuilderLauncherProps {
  /** Called for non-slide types (video / task / test). */
  onSelect: (type: ActiveBuilderType) => void;
  /** Called after the teacher fills in the slide title modal. */
  onSelectSlides: (title: string) => void;
  onBack: () => void;
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

const CARDS: CardConfig[] = [
  {
    type: "slides",
    label: "Slides",
    description:
      "Build a slide deck to walk students through the lesson material.",
    Icon: Presentation,
    IllustIcon: Layers,
    accent: {
      bg: "bg-white",
      border: "border-slate-200",
      iconBg: "bg-teal-50",
      iconText: "text-teal-500",
      labelText: "text-teal-700",
      hoverBorder: "hover:border-teal-300",
      hoverBg: "hover:bg-teal-50/30",
      bar: "bg-teal-500",
    },
  },
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
    type: "task",
    label: "Task",
    description:
      "Create a written or multiple-choice task for students to complete.",
    Icon: FileText,
    IllustIcon: PenSquare,
    accent: {
      bg: "bg-white",
      border: "border-slate-200",
      iconBg: "bg-amber-50",
      iconText: "text-amber-500",
      labelText: "text-amber-700",
      hoverBorder: "hover:border-amber-300",
      hoverBg: "hover:bg-amber-50/30",
      bar: "bg-amber-500",
    },
  },
  {
    type: "test",
    label: "Test",
    description: "Set up a graded test with questions students must pass.",
    Icon: ClipboardList,
    IllustIcon: BadgeCheck,
    accent: {
      bg: "bg-white",
      border: "border-slate-200",
      iconBg: "bg-emerald-50",
      iconText: "text-emerald-500",
      labelText: "text-emerald-700",
      hoverBorder: "hover:border-emerald-300",
      hoverBg: "hover:bg-emerald-50/30",
      bar: "bg-emerald-500",
    },
  },
];

// ─── Single card ──────────────────────────────────────────────────────────────

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
        "group relative flex flex-col items-start text-left",
        "rounded-2xl border p-6 transition-all duration-200",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
        "focus-visible:ring-slate-400",
        "shadow-sm hover:shadow-md",
        accent.bg,
        accent.border,
        accent.hoverBorder,
        accent.hoverBg,
        "builder-card-enter",
      ].join(" ")}
      style={{ animationDelay: `${index * 60}ms`, animationFillMode: "both" }}
    >
      {/* Accent top bar */}
      <div
        className={[
          "absolute inset-x-0 top-0 h-[3px] rounded-t-2xl",
          "opacity-0 group-hover:opacity-100 transition-opacity duration-200",
          accent.bar,
        ].join(" ")}
        aria-hidden
      />

      {/* Icon */}
      <div
        className={[
          "mb-5 flex h-12 w-12 items-center justify-center rounded-xl",
          "transition-transform duration-200 group-hover:scale-110",
          accent.iconBg,
        ].join(" ")}
      >
        <Icon className={`h-6 w-6 ${accent.iconText}`} />
      </div>

      {/* Label */}
      <span
        className={[
          "text-[17px] font-bold tracking-tight mb-1.5",
          accent.labelText,
        ].join(" ")}
      >
        {label}
      </span>

      {/* Description */}
      <span className="text-[13px] leading-relaxed text-slate-500 flex-1">
        {description}
      </span>

      {/* Illustration icon */}
      <IllustIcon
        className={[
          "absolute bottom-5 right-5 h-8 w-8 opacity-[0.07]",
          "transition-opacity duration-200 group-hover:opacity-[0.13]",
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
  onSelectSlides,
  onBack,
}: ManualBuilderLauncherProps) {
  const [slideModalOpen, setSlideModalOpen] = useState(false);

  const handleCardClick = (type: ActiveBuilderType) => {
    if (type === "slides") {
      setSlideModalOpen(true);
    } else {
      onSelect(type);
    }
  };

  return (
    <>
      <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">
          {/* Back */}
          <button
            type="button"
            onClick={onBack}
            className={[
              "mb-6 flex items-center gap-1.5 text-[13px] font-medium text-slate-400",
              "hover:text-slate-700 transition-colors focus:outline-none",
              "focus-visible:underline",
            ].join(" ")}
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </button>

          {/* Header */}
          <div className="mb-8">
            <h2 className="text-[22px] font-bold tracking-tight text-slate-900">
              What would you like to add?
            </h2>
            <p className="mt-1.5 text-[14px] text-slate-500">
              Choose a content type to start building your lesson.
            </p>
          </div>

          {/* 2 × 2 card grid */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {CARDS.map((card, i) => (
              <BuilderCard
                key={card.type}
                card={card}
                index={i}
                onClick={() => handleCardClick(card.type)}
              />
            ))}
          </div>
        </div>

        {/* Entrance animation */}
        <style>{`
          @keyframes builderCardEnter {
            from { opacity: 0; transform: translateY(12px); }
            to   { opacity: 1; transform: translateY(0); }
          }
          .builder-card-enter {
            animation: builderCardEnter 0.3s cubic-bezier(0.22, 1, 0.36, 1) both;
          }
        `}</style>
      </div>

      {/* Slide creation wizard modal — rendered above the launcher */}
      <CreateSlideModal
        open={slideModalOpen}
        onCancel={() => setSlideModalOpen(false)}
        onCreate={(title: string) => {
          setSlideModalOpen(false);
          onSelectSlides(title);
        }}
      />
    </>
  );
}
