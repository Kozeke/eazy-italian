/**
 * CreateSlideModal.tsx
 *
 * Minimal wizard-style modal that collects a slide title before the teacher
 * enters the slide editor.  Keeps the lesson canvas visible behind it.
 *
 * Props:
 *   open      — controls visibility
 *   onCancel  — close without creating
 *   onCreate  — called with the entered title; parent transitions to editor
 */

import React, { useEffect, useRef, useState } from "react";
import { X, Presentation } from "lucide-react";

export interface CreateSlideModalProps {
  open: boolean;
  onCancel: () => void;
  onCreate: (title: string) => void;
}

export default function CreateSlideModal({
  open,
  onCancel,
  onCreate,
}: CreateSlideModalProps) {
  const [title, setTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset + focus each time the modal opens
  useEffect(() => {
    if (open) {
      setTitle("");
      // Defer so the element is visible before focusing
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const handleSubmit = () => {
    const trimmed = title.trim();
    if (!trimmed) {
      inputRef.current?.focus();
      return;
    }
    onCreate(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSubmit();
    if (e.key === "Escape") onCancel();
  };

  if (!open) return null;

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      aria-modal="true"
      role="dialog"
      aria-labelledby="csm-title"
    >
      {/* Semi-transparent overlay */}
      <div
        className="absolute inset-0 bg-slate-900/30 backdrop-blur-[2px] csm-backdrop"
        onClick={onCancel}
        aria-hidden
      />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-slate-200/80 bg-white shadow-xl csm-panel">
        {/* Teal accent bar */}
        <div
          className="h-[3px] w-full rounded-t-2xl bg-gradient-to-r from-teal-500 to-teal-400"
          aria-hidden
        />

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-0">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50">
              <Presentation className="h-4 w-4 text-teal-600" />
            </span>
            <h2
              id="csm-title"
              className="text-[15px] font-bold tracking-tight text-slate-900"
            >
              Create slide
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancel"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 pt-5 pb-6" onKeyDown={handleKeyDown}>
          <label
            htmlFor="csm-title-input"
            className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500"
          >
            Slide title
          </label>
          <input
            ref={inputRef}
            id="csm-title-input"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. What is photosynthesis?"
            className={[
              "w-full rounded-xl border bg-white px-3.5 py-2.5",
              "text-[14px] text-slate-800 placeholder-slate-300",
              "transition-colors focus:outline-none focus-visible:ring-2",
              title.trim() === "" && title.length > 0
                ? "border-red-300 focus:border-red-400 focus-visible:ring-red-100"
                : "border-slate-200 focus:border-teal-400 focus-visible:ring-teal-100",
            ].join(" ")}
          />

          {/* Action row */}
          <div className="mt-5 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onCancel}
              className={[
                "rounded-xl border border-slate-200 bg-white px-4 py-2 text-[13px] font-semibold",
                "text-slate-600 transition-all hover:border-slate-300 hover:bg-slate-50",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300",
              ].join(" ")}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!title.trim()}
              className={[
                "rounded-xl bg-teal-600 px-4 py-2 text-[13px] font-semibold text-white",
                "shadow-sm transition-all focus:outline-none focus-visible:ring-2",
                "focus-visible:ring-teal-400",
                title.trim()
                  ? "hover:bg-teal-700 active:scale-[0.97]"
                  : "cursor-not-allowed opacity-40",
              ].join(" ")}
            >
              Create
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes csmBackdropIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes csmPanelIn {
          from { opacity: 0; transform: scale(0.96) translateY(8px); }
          to   { opacity: 1; transform: scale(1)    translateY(0);   }
        }
        .csm-backdrop { animation: csmBackdropIn 0.18s ease both; }
        .csm-panel    { animation: csmPanelIn    0.22s cubic-bezier(0.22, 1, 0.36, 1) both; }
      `}</style>
    </div>
  );
}