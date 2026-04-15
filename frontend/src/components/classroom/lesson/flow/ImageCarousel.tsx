/**
 * ImageCarousel.tsx
 *
 * Extracted from SectionBlock.tsx so carousel work doesn't bloat that file.
 * Lives flat alongside SectionBlock.tsx — import paths stay simple.
 *
 * Exports:
 *   ImageCarouselEditor  — teacher mode (edit slides, add/remove)
 *   ImageCarouselViewer  — student mode (read-only navigation)
 *   CarouselSlide        — shared type
 */

import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Upload, X } from "lucide-react";
import type { CarouselSlide } from "../useSegmentPersistence";

export type { CarouselSlide } from "../useSegmentPersistence";

// ─── Editor (teacher mode) ────────────────────────────────────────────────────

interface EditorProps {
  slides: CarouselSlide[];
  onChange: (slides: CarouselSlide[]) => void;
}

export function ImageCarouselEditor({ slides, onChange }: EditorProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const slide = slides[currentIndex] ?? slides[0];

  const updateSlide = (patch: Partial<CarouselSlide>) =>
    onChange(slides.map((s, i) => (i === currentIndex ? { ...s, ...patch } : s)));

  const addSlide = () => {
    const newSlide: CarouselSlide = {
      id: Math.random().toString(36).slice(2, 10),
      url: "",
      caption: "",
    };
    const next = [...slides, newSlide];
    onChange(next);
    setCurrentIndex(next.length - 1);
  };

  const removeSlide = () => {
    if (slides.length <= 1) return;
    const next = slides.filter((_, i) => i !== currentIndex);
    onChange(next);
    setCurrentIndex(Math.min(currentIndex, next.length - 1));
  };

  return (
    <div className="vlp-carousel-editor">
      <div className="vlp-carousel-editor-header">
        <span className="vlp-carousel-editor-title">Image Carousel</span>
        {slides.length > 1 && (
          <button
            type="button"
            className="vlp-carousel-remove-slide"
            onClick={removeSlide}
            aria-label="Remove this slide"
            title="Remove this slide"
          >
            <X size={13} strokeWidth={2.2} />
          </button>
        )}
      </div>

      <div className="vlp-carousel-editor-body">
        <div className="vlp-carousel-slide-frame">
          {slide.url.trim() ? (
            <img src={slide.url} alt={slide.caption || "Slide preview"} />
          ) : (
            <span style={{ fontSize: 12, color: "#A8ABCA" }}>No image yet</span>
          )}
        </div>

        <div className="vlp-carousel-url-row">
          <input
            type="url"
            className="vlp-carousel-url-input"
            value={slide.url}
            onChange={(e) => updateSlide({ url: e.target.value })}
            placeholder="Paste an image URL…"
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) updateSlide({ url: URL.createObjectURL(f) });
            }}
          />
          <button
            type="button"
            className="vlp-carousel-upload-btn"
            onClick={() => fileRef.current?.click()}
            title="Upload image"
          >
            <Upload size={14} strokeWidth={2} />
          </button>
        </div>

        <input
          type="text"
          className="vlp-carousel-caption-input"
          value={slide.caption}
          onChange={(e) => updateSlide({ caption: e.target.value })}
          placeholder="Caption (optional)"
          style={{ width: "100%", boxSizing: "border-box" }}
        />
      </div>

      <div className="vlp-carousel-nav">
        <button
          type="button"
          className="vlp-carousel-nav-btn"
          onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
          disabled={currentIndex === 0}
          aria-label="Previous slide"
        >
          <ChevronLeft size={14} strokeWidth={2.2} />
        </button>
        <span className="vlp-carousel-counter">
          {currentIndex + 1} of {slides.length}
        </span>
        <button
          type="button"
          className="vlp-carousel-nav-btn vlp-carousel-nav-add"
          onClick={addSlide}
          aria-label="Add slide"
        >
          <Plus size={16} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}

// ─── Viewer (student mode) ────────────────────────────────────────────────────

interface ViewerProps {
  slides: CarouselSlide[];
}

export function ImageCarouselViewer({ slides }: ViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  if (slides.length === 0) return null;
  const slide = slides[currentIndex];

  return (
    <div className="vlp-carousel-viewer">
      <div className="vlp-carousel-viewer-frame">
        {slide.url.trim() ? (
          <img
            src={slide.url}
            alt={slide.caption || `Slide ${currentIndex + 1}`}
          />
        ) : (
          <div
            style={{
              width: "100%",
              minHeight: 160,
              background: "#F7F7FA",
              borderRadius: 8,
            }}
          />
        )}
      </div>

      {slide.caption.trim() && (
        <p className="vlp-carousel-viewer-caption">{slide.caption}</p>
      )}

      <div className="vlp-carousel-viewer-nav">
        <button
          type="button"
          className="vlp-carousel-viewer-btn"
          onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
          disabled={currentIndex === 0}
          aria-label="Previous slide"
        >
          <ChevronLeft size={15} strokeWidth={2.2} />
        </button>
        <span className="vlp-carousel-viewer-counter">
          {currentIndex + 1} / {slides.length}
        </span>
        <button
          type="button"
          className="vlp-carousel-viewer-btn"
          onClick={() =>
            setCurrentIndex((i) => Math.min(slides.length - 1, i + 1))
          }
          disabled={currentIndex === slides.length - 1}
          aria-label="Next slide"
        >
          <ChevronRight size={15} strokeWidth={2.2} />
        </button>
      </div>
    </div>
  );
}