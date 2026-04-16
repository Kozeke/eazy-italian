/**
 * shared.ts — Parts 2, 7, 8, 10, 11 (shared layer)
 *
 * Exports everything the component files need so there is a single source
 * of truth for:
 *   • ReviewSlide type & coercion helpers
 *   • deckReducer + useDeck (Parts 2, 8, 11-duplicate)
 *   • useDebounce, useAutosave, LazyImage (Part 10)
 *   • useSlideRegen, useImageRegen (Parts 5, 7)
 *   • useKeyboardNav (Part 11)
 *   • autogrow util, SVG icon primitives, constants
 */

import React, {
    useState, useRef, useEffect, useCallback, useReducer,
  } from "react";
  
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // TYPES
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  
  /** Canonical slide shape used throughout the Review step. */
  export interface ReviewSlide {
    id: string;
    title: string;
    bullets: string[];
    image_url?: string | null;
    image_prompt?: string | null;
    examples?: string[];
    exercise?: string | null;
    teacher_notes?: string | null;
    imageType?: "auto" | "diagram" | "chart" | "scene" | "none";
    /** Transient — true while a Part 7 regen SSE stream is active. */
    _regenerating?: boolean;
  }
  
  export interface UpstreamFormData {
    title: string; slideCount: number; language: string; tone: string; depth: string;
  }
  export interface UpstreamSlide {
    id: string; title: string; bullets: string[]; examples?: string[]; imageType?: string;
  }
  export interface UpstreamDesign {
    theme: string; textDensity: string; imageSource: string; imageStyle: string;
    styleKeywords: string; useThemeStyle: boolean; exercises: boolean; speakerNotes: boolean;
    summarySlide: boolean; quizSlide: boolean; generateImages: boolean;
    imageProvider: string; imageStyleKeywords: string;
  }
  export interface UpstreamResultSlide {
    title: string; bullet_points?: string[]; examples?: string[];
    exercise?: string | null; teacher_notes?: string | null; image?: string | null;
  }
  export interface SlideDeckResult { slides?: UpstreamResultSlide[]; _error?: string; }
  
  export interface ThemeSpec {
    id: string; colors: string[]; dark: boolean;
  }
  
  export interface ImageRegenResult {
    busy:       boolean;
    error:      string | null;
    regen:      (slideId: string, prompt: string) => Promise<string | null>;
    uploadFile: (file: File) => Promise<string | null>;
  }
  
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // CONSTANTS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  
  export const THEMES: ThemeSpec[] = [
    { id: "stardust",  colors: ["#0F0C29","#302B63","#24243E"], dark: true  },
    { id: "clementa",  colors: ["#FFF5E4","#FFCBA4","#FF8B6A"], dark: false },
    { id: "editorial", colors: ["#F7F3EE","#E8DDD0","#1A1108"], dark: false },
    { id: "nightsky",  colors: ["#020818","#0A2342","#1A6B8A"], dark: true  },
    { id: "snowball",  colors: ["#FFFFFF","#F0F4F8","#D9E8F5"], dark: false },
  ];
  
  export const IMAGE_TYPES = [
    { id: "auto",    label: "Auto",    icon: "✨", hint: "AI picks the best type"   },
    { id: "diagram", label: "Diagram", icon: "🔷", hint: "Concept map or flowchart" },
    { id: "chart",   label: "Chart",   icon: "📊", hint: "Bar, pie, or timeline"    },
    { id: "scene",   label: "Scene",   icon: "🖼️",  hint: "Illustrative visual"     },
    { id: "none",    label: "None",    icon: "⊘",  hint: "Skip image for this slide"},
  ] as const;
  
  export const themeAccent = (t: ThemeSpec) => t.colors[t.colors.length - 1];
  export const themeText   = (t: ThemeSpec) => t.dark ? "#ffffff" : "#1a1108";
  export const themeMuted  = (t: ThemeSpec) => t.dark ? "rgba(255,255,255,.42)" : "rgba(0,0,0,.38)";
  export const themeBg     = (t: ThemeSpec, idx: number) =>
    idx === 0
      ? `linear-gradient(135deg,${t.colors[1] || t.colors[0]},${t.colors[0]})`
      : t.colors[1] || t.colors[0];
  
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // COERCION HELPERS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  
  let _seq = 1;
  export const newId = () => `rv_${Date.now()}_${_seq++}`;
  
  export function fromResultSlide(s: UpstreamResultSlide): ReviewSlide {
    return {
      id: newId(), title: s.title ?? "",
      bullets: s.bullet_points ? [...s.bullet_points] : [],
      image_url: s.image ?? null, image_prompt: null,
      examples: s.examples ? [...s.examples] : [],
      exercise: s.exercise ?? null, teacher_notes: s.teacher_notes ?? null,
      imageType: "auto",
    };
  }
  export function fromOutlineSlide(s: UpstreamSlide): ReviewSlide {
    return {
      id: newId(), title: s.title ?? "",
      bullets: s.bullets ? [...s.bullets] : [],
      image_url: null, image_prompt: null,
      examples: s.examples ? [...s.examples] : [],
      exercise: null, teacher_notes: null, imageType: "auto",
    };
  }
  
  /** Part 8 — default slide when teacher clicks "Add Slide". */
  export function blankSlide(): ReviewSlide {
    return {
      id: newId(),
      title: "New Slide",
      bullets: ["Point one", "Point two"],
      image_url: null, image_prompt: null,
      examples: [], exercise: null, teacher_notes: null, imageType: "auto",
    };
  }
  
  /** Part 11 — deep clone of an existing slide with a fresh id. */
  export function duplicateSlideData(s: ReviewSlide): ReviewSlide {
    return {
      ...s,
      id: newId(),
      title: `${s.title} (copy)`,
      bullets: [...s.bullets],
      examples: [...(s.examples ?? [])],
      image_url: s.image_url,
      _regenerating: false,
    };
  }
  
  export function toSavePayload(s: ReviewSlide): UpstreamResultSlide {
    return {
      title: s.title, bullet_points: s.bullets, examples: s.examples,
      exercise: s.exercise, teacher_notes: s.teacher_notes, image: s.image_url ?? null,
    };
  }
  
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // DECK REDUCER
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  
  export type DeckAction =
    | { type: "SET_DECK";         slides: ReviewSlide[] }
    | { type: "PATCH_SLIDE";      id: string; patch: Partial<ReviewSlide> }
    | { type: "PATCH_IMAGE";      index: number; image_url: string }
    | { type: "ADD_SLIDE";        afterId: string }
    | { type: "DUPLICATE_SLIDE";  id: string }           // Part 11
    | { type: "DELETE_SLIDE";     id: string }
    | { type: "MOVE_SLIDE";       fromIdx: number; toIdx: number }
    | { type: "SET_BULLETS";      id: string; bullets: string[] }
    | { type: "ADD_BULLET";       id: string; afterIdx: number }
    | { type: "DELETE_BULLET";    id: string; bulletIdx: number }
    | { type: "MOVE_BULLET";      id: string; fromIdx: number; toIdx: number }
    | { type: "REGEN_START";      id: string }
    | { type: "REGEN_PATCH";      id: string; patch: Partial<ReviewSlide> }
    | { type: "REGEN_END";        id: string };
  
  export function deckReducer(
    state: { slides: ReviewSlide[] },
    action: DeckAction,
  ): { slides: ReviewSlide[] } {
    const S = state.slides;
    const mapId = (id: string, fn: (s: ReviewSlide) => ReviewSlide) =>
      ({ slides: S.map(s => s.id === id ? fn(s) : s) });
  
    switch (action.type) {
      case "SET_DECK":        return { slides: action.slides };
      case "PATCH_SLIDE":     return mapId(action.id, s => ({ ...s, ...action.patch }));
      case "REGEN_START":     return mapId(action.id, s => ({ ...s, _regenerating: true }));
      case "REGEN_PATCH":     return mapId(action.id, s => ({ ...s, ...action.patch }));
      case "REGEN_END":       return mapId(action.id, s => ({ ...s, _regenerating: false }));
  
      case "PATCH_IMAGE": {
        const next = [...S];
        if (next[action.index]) next[action.index] = { ...next[action.index], image_url: action.image_url };
        return { slides: next };
      }
      case "ADD_SLIDE": {
        const idx = S.findIndex(s => s.id === action.afterId);
        const next = [...S]; next.splice(idx + 1, 0, blankSlide());
        return { slides: next };
      }
      // Part 11 — DUPLICATE
      case "DUPLICATE_SLIDE": {
        const idx = S.findIndex(s => s.id === action.id);
        if (idx < 0) return state;
        const next = [...S]; next.splice(idx + 1, 0, duplicateSlideData(S[idx]));
        return { slides: next };
      }
      case "DELETE_SLIDE":
        return S.length <= 1 ? state : { slides: S.filter(s => s.id !== action.id) };
      case "MOVE_SLIDE": {
        const { fromIdx, toIdx } = action; if (fromIdx === toIdx) return state;
        const next = [...S]; const [item] = next.splice(fromIdx, 1); next.splice(toIdx, 0, item);
        return { slides: next };
      }
      case "SET_BULLETS":     return mapId(action.id, s => ({ ...s, bullets: action.bullets }));
      case "ADD_BULLET":      return mapId(action.id, s => {
        const b = [...s.bullets]; b.splice(action.afterIdx + 1, 0, ""); return { ...s, bullets: b };
      });
      case "DELETE_BULLET":   return mapId(action.id, s => ({
        ...s, bullets: s.bullets.length <= 1 ? [""] : s.bullets.filter((_, i) => i !== action.bulletIdx),
      }));
      case "MOVE_BULLET":     return mapId(action.id, s => {
        const { fromIdx, toIdx } = action; if (fromIdx === toIdx) return s;
        const b = [...s.bullets]; const [item] = b.splice(fromIdx, 1); b.splice(toIdx, 0, item);
        return { ...s, bullets: b };
      });
      default: return state;
    }
  }
  
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // useDeck
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  
  export function useDeck(initial: ReviewSlide[]) {
    const [state, dispatch] = useReducer(deckReducer, { slides: initial });
    const [activeId, setActiveId] = useState(initial[0]?.id ?? "");
  
    const activeIdx   = Math.max(0, state.slides.findIndex(s => s.id === activeId));
    const activeSlide = state.slides[activeIdx] ?? null;
  
    const selectById  = (id: string) => setActiveId(id);
    const selectByIdx = (i: number) => { const s = state.slides[i]; if (s) setActiveId(s.id); };
    const selectPrev  = () => selectByIdx(Math.max(0, activeIdx - 1));
    const selectNext  = () => selectByIdx(Math.min(state.slides.length - 1, activeIdx + 1));
  
    // Auto-select newly inserted slides
    const prevLen = useRef(initial.length);
    useEffect(() => {
      if (state.slides.length > prevLen.current) {
        const newIdx = Math.min(activeIdx + 1, state.slides.length - 1);
        setActiveId(state.slides[newIdx].id);
      }
      prevLen.current = state.slides.length;
    }, [state.slides.length]); // eslint-disable-line
  
    const addSlide = (afterId: string) => dispatch({ type: "ADD_SLIDE", afterId });
  
    /** Part 11 — duplicate currently active slide */
    const duplicateSlide = (id: string) => dispatch({ type: "DUPLICATE_SLIDE", id });
  
    const deleteSlide = (id: string) => {
      const idx = state.slides.findIndex(s => s.id === id);
      dispatch({ type: "DELETE_SLIDE", id });
      const rem = state.slides.filter(s => s.id !== id);
      if (rem.length) setActiveId(rem[Math.min(idx, rem.length - 1)].id);
    };
    const moveSlide = (from: number, to: number) =>
      dispatch({ type: "MOVE_SLIDE", fromIdx: from, toIdx: to });
  
    return {
      slides: state.slides,
      activeSlide,
      activeIdx,
      dispatch,
      selectById,
      selectByIdx,
      selectPrev,
      selectNext,
      addSlide,
      duplicateSlide,
      deleteSlide,
      moveSlide,
    };
  }
  
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PART 10 — useDebounce + useAutosave + LazyImage
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  
  export function useDebounce<T>(value: T, delay: number): T {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
      const t = setTimeout(() => setDebounced(value), delay);
      return () => clearTimeout(t);
    }, [value, delay]);
    return debounced;
  }
  
  export type AutosaveStatus = "idle" | "saving" | "saved" | "error";
  
  /** Fires POST /api/v1/slides/draft every `interval` ms when content changes. */
  export function useAutosave(
    slides: ReviewSlide[],
    courseId: number | null | undefined,
    interval = 10_000,
  ): AutosaveStatus {
    const slidesRef = useRef(slides);
    const savedRef  = useRef<string>("");
    const [status, setStatus] = useState<AutosaveStatus>("idle");
  
    useEffect(() => { slidesRef.current = slides; }, [slides]);
  
    useEffect(() => {
      if (!courseId) return;
      const timer = setInterval(async () => {
        const payload = JSON.stringify(slidesRef.current.map(toSavePayload));
        if (payload === savedRef.current) return;
        setStatus("saving");
        try {
          const token = localStorage.getItem("token");
          const res = await fetch("/api/v1/slides/draft", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: JSON.stringify({ course_id: courseId, slides: JSON.parse(payload) }),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          savedRef.current = payload;
          setStatus("saved");
          setTimeout(() => setStatus("idle"), 2500);
        } catch {
          setStatus("error");
          setTimeout(() => setStatus("idle"), 3000);
        }
      }, interval);
      return () => clearInterval(timer);
    }, [courseId, interval]);
  
    return status;
  }
  
  /** Lazy-loads image src once element scrolls into view (Part 10). */
  type LazyImageProps = Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src" | "alt"> & {
    src: string;
    alt: string;
  };

  export function LazyImage({ src, alt, ...imgProps }: LazyImageProps) {
    const ref = useRef<HTMLImageElement>(null);
    const [ready, setReady] = useState(false);
    useEffect(() => {
      if (!ref.current) return;
      if (typeof IntersectionObserver === "undefined") { setReady(true); return; }
      const obs = new IntersectionObserver(
        ([e]) => { if (e.isIntersecting) { setReady(true); obs.disconnect(); } },
        { rootMargin: "200px" },
      );
      obs.observe(ref.current);
      return () => obs.disconnect();
    }, []);
    return React.createElement("img", {
      ref,
      src: ready ? src : undefined,
      alt,
      loading: "lazy",
      decoding: "async",
      ...imgProps,
    });
  }
  
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PART 11 — useKeyboardNav
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  
  /**
   * Adds global Arrow-Left / Arrow-Right keyboard navigation.
   *
   * Fires selectPrev / selectNext unless the user is currently typing in
   * an input or textarea (so bullet editing is never hijacked).
   */
  export function useKeyboardNav(selectPrev: () => void, selectNext: () => void) {
    const prevRef = useRef(selectPrev);
    const nextRef = useRef(selectNext);
    useEffect(() => { prevRef.current = selectPrev; nextRef.current = selectNext; });
  
    useEffect(() => {
      const handler = (e: globalThis.KeyboardEvent) => {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;    // don't hijack typing
        if (e.key === "ArrowLeft"  && !e.metaKey && !e.ctrlKey) { e.preventDefault(); prevRef.current(); }
        if (e.key === "ArrowRight" && !e.metaKey && !e.ctrlKey) { e.preventDefault(); nextRef.current(); }
      };
      window.addEventListener("keydown", handler);
      return () => window.removeEventListener("keydown", handler);
    }, []);
  }
  
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PART 7 — useSlideRegen
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  
  export function useSlideRegen(dispatch: React.Dispatch<DeckAction>) {
    const [busy, setBusy]   = useState(false);
    const [error, setError] = useState<string | null>(null);
    const abort = useRef(new AbortController());
  
    const regen = useCallback(async (slide: ReviewSlide) => {
      abort.current.abort();
      abort.current = new AbortController();
      setBusy(true); setError(null);
      dispatch({ type: "REGEN_START", id: slide.id });
      try {
        const token = localStorage.getItem("token");
        const res = await fetch("/api/v1/ai/regenerate-slide", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ slide_id: slide.id, title: slide.title, bullets: slide.bullets }),
          signal: abort.current.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
  
        const ct = res.headers.get("content-type") ?? "";
        if (ct.includes("text/event-stream")) {
          const reader = res.body!.getReader();
          const dec = new TextDecoder(); let buf = "";
          while (true) {
            const { done, value } = await reader.read(); if (done) break;
            buf += dec.decode(value, { stream: true });
            const frames = buf.split("\n\n"); buf = frames.pop() ?? "";
            for (const frame of frames) {
              const ev  = frame.match(/^event: (.+)$/m)?.[1];
              const raw = frame.match(/^data: (.+)$/m)?.[1];
              if (!ev || !raw) continue;
              try {
                const data = JSON.parse(raw);
                if (ev === "slide_chunk") {
                  const patch: Partial<ReviewSlide> = {};
                  if (data.title)   patch.title   = data.title;
                  if (data.bullets) patch.bullets = data.bullets;
                  if (data.teacher_notes !== undefined) patch.teacher_notes = data.teacher_notes;
                  if (data.exercise      !== undefined) patch.exercise      = data.exercise;
                  dispatch({ type: "REGEN_PATCH", id: slide.id, patch });
                } else if (ev === "slide_done") {
                  dispatch({ type: "REGEN_PATCH", id: slide.id, patch: {
                    title:         data.title         ?? slide.title,
                    bullets:       data.bullet_points ?? slide.bullets,
                    teacher_notes: data.teacher_notes ?? slide.teacher_notes,
                    exercise:      data.exercise      ?? slide.exercise,
                  }});
                }
              } catch { /* malformed frame */ }
            }
          }
        } else {
          const data = await res.json();
          dispatch({ type: "REGEN_PATCH", id: slide.id, patch: {
            title:         data.title         ?? slide.title,
            bullets:       data.bullet_points ?? slide.bullets,
            teacher_notes: data.teacher_notes ?? slide.teacher_notes,
            exercise:      data.exercise      ?? slide.exercise,
          }});
        }
      } catch (e: unknown) {
        if ((e as Error).name !== "AbortError")
          setError((e as Error).message ?? "Regeneration failed");
      } finally {
        dispatch({ type: "REGEN_END", id: slide.id });
        setBusy(false);
      }
    }, [dispatch]);
  
    useEffect(() => () => abort.current.abort(), []);
    return { regen, busy, error };
  }
  
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PART 5 — useImageRegen
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  
  export function useImageRegen(): ImageRegenResult {
    const [busy, setBusy]   = useState(false);
    const [error, setError] = useState<string | null>(null);
  
    const regen = useCallback(async (slideId: string, prompt: string): Promise<string | null> => {
      setBusy(true); setError(null);
      try {
        const token = localStorage.getItem("token");
        const res = await fetch("/api/v1/ai/regenerate-image", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ slide_id: slideId, prompt }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        return (data.image_url ?? data.image ?? null) as string | null;
      } catch (e: unknown) {
        setError((e as Error).message ?? "Image generation failed");
        return null;
      } finally { setBusy(false); }
    }, []);
  
    const uploadFile = useCallback(async (file: File): Promise<string | null> =>
      new Promise(resolve => {
        const r = new FileReader();
        r.onload  = () => resolve(r.result as string);
        r.onerror = () => resolve(null);
        r.readAsDataURL(file);
      }), []);
  
    return { busy, error, regen, uploadFile };
  }
  
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // UTILITIES
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  
  /** Grows a textarea to fit its content exactly. */
  export function autogrow(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }
  
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // SVG ICON PRIMITIVES
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  
  export const IcoChevLeft  = ({sz=16}: {sz?: number}) => React.createElement("svg", { width: sz, height: sz, viewBox: "0 0 16 16", fill: "none", "aria-hidden": "true" }, React.createElement("path", { d: "M10 3L5 8l5 5", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round" }));
  export const IcoChevRight = ({sz=16}: {sz?: number}) => React.createElement("svg", { width: sz, height: sz, viewBox: "0 0 16 16", fill: "none", "aria-hidden": "true" }, React.createElement("path", { d: "M6 3l5 5-5 5", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round" }));
  export const IcoPlus      = ({sz=14}: {sz?: number}) => React.createElement("svg", { width: sz, height: sz, viewBox: "0 0 14 14", fill: "none", "aria-hidden": "true" }, React.createElement("path", { d: "M7 1v12M1 7h12", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round" }));
  export const IcoTrash     = ({sz=14}: {sz?: number}) => React.createElement("svg", { width: sz, height: sz, viewBox: "0 0 14 14", fill: "none", "aria-hidden": "true" }, React.createElement("path", { d: "M2 3.5h10M5.5 3.5V2.5h3v1M5 3.5v7.5h4V3.5", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round" }));
  export const IcoX         = ({sz=12}: {sz?: number}) => React.createElement("svg", { width: sz, height: sz, viewBox: "0 0 12 12", fill: "none", "aria-hidden": "true" }, React.createElement("path", { d: "M2 2l8 8M10 2l-8 8", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round" }));
  export const IcoUpload    = ()                        => React.createElement("svg", { width: "13", height: "13", viewBox: "0 0 13 13", fill: "none", "aria-hidden": "true" }, React.createElement("path", { d: "M6.5 9V2M3 5l3.5-3.5L10 5M2 11h9", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round" }));
  export const IcoSparkle   = ()                        => React.createElement("svg", { width: "13", height: "13", viewBox: "0 0 13 13", fill: "none", "aria-hidden": "true" }, React.createElement("path", { d: "M6.5 1L7.5 5h4l-3.5 2.5L9 11.5 6.5 9 4 11.5l1-4L1.5 5h4z", stroke: "currentColor", strokeWidth: "1.4", strokeLinejoin: "round" }));
  export const IcoDuplicate = ()                        => React.createElement("svg", { width: "13", height: "13", viewBox: "0 0 13 13", fill: "none", "aria-hidden": "true" }, React.createElement("rect", { x: "4.5", y: "4.5", width: "7", height: "7", rx: "1.5", stroke: "currentColor", strokeWidth: "1.5" }), React.createElement("path", { d: "M1.5 8.5V2A1 1 0 0 1 2.5 1h6.5", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round" }));
  export const IcoDots      = ()                        => React.createElement("svg", { width: "8", height: "14", viewBox: "0 0 8 14", fill: "none", "aria-hidden": "true" }, [[2,2],[6,2],[2,5],[6,5],[2,8],[6,8],[2,11],[6,11]].map(([cx,cy]) => React.createElement("circle", { key: `${cx}${cy}`, cx, cy, r: "1.2", fill: "currentColor" })));
  
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // SHARED UI ATOMS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  
  export function AutoTA({ value, onChange, placeholder, className, style }: {
    value: string; onChange: (v: string) => void;
    placeholder?: string; className?: string; style?: React.CSSProperties;
  }) {
    const ref = useRef<HTMLTextAreaElement>(null);
    useEffect(() => { if (ref.current) autogrow(ref.current); }, [value]);
    return React.createElement("textarea", {
      ref,
      className,
      style,
      value,
      placeholder,
      rows: 1,
      onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => { onChange(e.target.value); autogrow(e.target); }
    });
  }
  
  export function Toggle({ on, onToggle }: { on: boolean; onToggle: (v: boolean) => void }) {
    return React.createElement("button", {
      role: "switch",
      "aria-checked": on,
      className: `rv-tog ${on ? "rv-tog--on" : ""}`,
      onClick: () => onToggle(!on)
    });
  }
  
  export function SaveBtn({ saving, saved, onClick, size = "normal" }: {
    saving: boolean; saved: boolean; onClick: () => void; size?: "normal" | "lg";
  }) {
    return React.createElement("button", {
      className: `rv-btn rv-btn--primary ${size === "lg" ? "rv-btn--lg" : ""} ${saving ? "rv-btn--off" : ""}`,
      onClick,
      disabled: saving || saved
    }, saving ? React.createElement(React.Fragment, null, React.createElement("span", { className: "rv-spin" }), " Saving…") : saved ? React.createElement(React.Fragment, null, "✓ Saved") : React.createElement(React.Fragment, null, "💾 Save to Course"));
  }
  
  /** Part 11 — segmented progress indicator: "Slide 3 / 12". */
  export function SlideProgressBar({ current, total }: { current: number; total: number }) {
    const pct = total > 1 ? ((current) / (total - 1)) * 100 : 100;
    return React.createElement("div", {
      className: "rv-progress",
      role: "progressbar",
      "aria-valuenow": current + 1,
      "aria-valuemin": 1,
      "aria-valuemax": total
    }, React.createElement("span", { className: "rv-progress-label" }, `Slide ${current + 1} / ${total}`), React.createElement("div", {
      className: "rv-progress-track",
      title: `${current + 1} of ${total} slides`
    }, React.createElement("div", { className: "rv-progress-fill", style: { width: `${pct}%` } }), total > 1 && total <= 24 && Array.from({ length: total - 1 }).map((_, i) => React.createElement("div", {
      key: i,
      className: "rv-progress-tick",
      style: { left: `${((i + 1) / total) * 100}%` }
    }))));
  }
  
  /** Part 11 — mini slide canvas used as a thumbnail in the navigator. */
  export function MiniDiagram({ title, bullets, accent }: { title: string; bullets: string[]; accent: string }) {
    const items = bullets.slice(0, 4);
    const bW=340, bH=48, gap=10, pX=24, sY=44;
    const tH = sY + items.length * (bH + gap) + 14;
    return React.createElement("div", { style: { background: "#fff", borderRadius: 10, overflow: "hidden" } }, React.createElement("svg", {
      viewBox: `0 0 400 ${tH}`,
      xmlns: "http://www.w3.org/2000/svg",
      style: { width: "100%", height: "auto", display: "block" }
    }, React.createElement("rect", { x: "0", y: "0", width: "400", height: sY-8, fill: accent, opacity: ".12" }), React.createElement("text", {
      x: "200",
      y: sY-14,
      textAnchor: "middle",
      fontFamily: "'Segoe UI',system-ui,sans-serif",
      fontSize: "12",
      fontWeight: "700",
      fill: accent
    }, title.length > 46 ? title.slice(0, 46) + "…" : title), items.map((b, i) => {
      const y = sY + i * (bH + gap);
      const lbl = b.length > 56 ? b.slice(0, 56) + "…" : b;
      return React.createElement("g", { key: i }, React.createElement("rect", {
        x: pX,
        y: y,
        width: bW,
        height: bH,
        rx: "7",
        fill: "#F8FAFC",
        stroke: accent,
        strokeWidth: "1.5",
        opacity: ".92"
      }), React.createElement("circle", {
        cx: pX + 14,
        cy: y + bH / 2,
        r: "3.5",
        fill: accent
      }), React.createElement("text", {
        fontFamily: "'Segoe UI',system-ui,sans-serif",
        fontSize: "11",
        fill: "#0F172A"
      }, React.createElement("tspan", {
        x: pX + 28,
        y: lbl.length > 32 ? y + bH / 2 - 6 : y + bH / 2 + 4
      }, lbl.slice(0, 32)), lbl.length > 32 && React.createElement("tspan", {
        x: pX + 28,
        dy: "14"
      }, lbl.slice(32))));
    })));
  }