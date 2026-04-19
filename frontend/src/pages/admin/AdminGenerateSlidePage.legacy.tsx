import React, { useState, useRef, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ReviewSlidesPage, ReviewStyles } from "./ReviewSlidesPage.legacy";

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface FormData {
  title: string;
  slideCount: number;
  language: string;
  tone: string;
  depth: string;
}

interface Slide {
  id: string;
  title: string;
  bullets: string[];
  examples?: string[];
  imageType?: string; // "auto" | "diagram" | "chart" | "scene" | "none"
}

interface DesignData {
  theme: string;
  textDensity: string;
  imageSource: string;
  imageStyle: string;
  styleKeywords: string;
  useThemeStyle: boolean;
  exercises: boolean;
  speakerNotes: boolean;
  summarySlide: boolean;
  quizSlide: boolean;
  generateImages: boolean;
  imageProvider: string;
  imageStyleKeywords: string;
}

/** Shape of one slide inside SlideDeckResult — image is a plain data URI string. */
interface ResultSlide {
  title:          string;
  bullet_points?: string[];
  examples?:      string[];
  exercise?:      string | null;
  teacher_notes?: string | null;
  /** Data URI populated progressively as SSE image_ready events arrive. */
  image?:         string | null;
}

interface SlideDeckResult {
  slides?: ResultSlide[];
  _error?: string;
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const LANGUAGES    = ["English","Italian","Spanish","French","German","Portuguese","Dutch","Polish"];
const TONES        = ["Professional","Academic","Casual","Inspirational","Technical"];
const SLIDE_COUNTS = [1, 5, 8, 10, 15, 20];
const DEPTHS = [
  { id:"minimal",   label:"Minimal",   desc:"Key points only"    },
  { id:"concise",   label:"Concise",   desc:"Balanced coverage"  },
  { id:"detailed",  label:"Detailed",  desc:"In-depth content"   },
  { id:"extensive", label:"Extensive", desc:"Comprehensive"      },
];
const THEMES = [
  { id:"stardust",  name:"Stardust",   colors:["#0F0C29","#302B63","#24243E"], dark:true  },
  { id:"clementa",  name:"Clementa",   colors:["#FFF5E4","#FFCBA4","#FF8B6A"], dark:false },
  { id:"editorial", name:"Editorial",  colors:["#F7F3EE","#E8DDD0","#1A1108"], dark:false },
  { id:"nightsky",  name:"Night Sky",  colors:["#020818","#0A2342","#1A6B8A"], dark:true  },
  { id:"snowball",  name:"Snowball",   colors:["#FFFFFF","#F0F4F8","#D9E8F5"], dark:false },
];
const IMG_SOURCES = ["AI Generated","Stock Images","No Images"];
const IMG_STYLES  = [
  { id:"illustration", label:"Illustration", icon:"✏️" },
  { id:"photo",        label:"Photo",        icon:"📷" },
  { id:"abstract",     label:"Abstract",     icon:"🎨" },
  { id:"3d",           label:"3D",           icon:"🧊" },
  { id:"lineart",      label:"Line Art",     icon:"〰️" },
  { id:"custom",       label:"Custom",       icon:"⚙️" },
];
const IMAGE_TYPES = [
  { id:"auto",    label:"Auto",    icon:"✨", hint:"AI picks the best type" },
  { id:"diagram", label:"Diagram", icon:"🔷", hint:"Concept map or flowchart" },
  { id:"chart",   label:"Chart",   icon:"📊", hint:"Bar, pie, or timeline" },
  { id:"scene",   label:"Scene",   icon:"🖼️", hint:"Illustrative visual" },
  { id:"none",    label:"None",    icon:"⊘",  hint:"Skip image for this slide" },
];
const STEP_META = [
  { n:1, label:"Setup",   desc:"Presentation basics"  },
  { n:2, label:"Outline", desc:"Edit slide structure" },
  { n:3, label:"Design",  desc:"Visual styling"       },
  { n:4, label:"Review", desc:"Draft preview"        },
];
const INIT_FORM = { title:"", slideCount:1, language:"English", tone:"Professional", depth:"concise" };
const INIT_DESIGN = {
  theme:"editorial", textDensity:"concise",
  imageSource:"AI Generated", imageStyle:"illustration",
  styleKeywords:"", useThemeStyle:false,
  exercises:false, speakerNotes:true, summarySlide:true, quizSlide:false,
  generateImages:false, imageProvider:"svg", imageStyleKeywords:"",
};

let _uid = 1;
const uid = () => `sl_${_uid++}`;

function buildBody(form: FormData, slides: Slide[], design: DesignData) {
  return {
    topic:                 form.title,
    level:                 form.tone.toLowerCase(),
    duration_minutes:      form.slideCount * 3,
    target_audience:       `${form.tone} audience`,
    learning_goals:        slides.flatMap((s: Slide) => s.bullets).filter(Boolean).slice(0, 8),
    include_exercises:     design.exercises,
    include_teacher_notes: design.speakerNotes,
    language:              form.language,

    // ── image fields ──────────────────────────────────────────────────
    generate_images:       design.generateImages === true,  // Explicit boolean check
    image_provider:        design.imageProvider   ?? "svg",
    image_style:           design.imageStyle       ?? "illustration",
    image_style_keywords:  design.imageStyleKeywords ?? "",
  };
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────

export default function SlideGenerator() {
  const [step,    setStep]    = useState<number>(1);
  const [form,    setForm]    = useState<FormData>(INIT_FORM);
  const [slides,  setSlides]  = useState<Slide[]>([]);
  const [design,  setDesign]  = useState<DesignData>(INIT_DESIGN);
  const [busy,    setBusy]    = useState<boolean>(false);
  const [busyMsg, setBusyMsg] = useState<string>("");
  const [result,  setResult]  = useState<SlideDeckResult | null>(null);
  const [adv,     setAdv]     = useState<boolean>(false);
  const [ready,   setReady]   = useState<boolean>(false);
  const [saving,  setSaving]  = useState<boolean>(false);
  const [saved,   setSaved]   = useState<boolean>(false);
  /** Keyed by 1-based slide index (matching SSE slide_id). */
  const [imageProgress, setImageProgress] = useState<Record<number, string>>({});
  /** Abort controller — cancels the SSE image stream if the component unmounts. */
  const abortRef = useRef<AbortController>(new AbortController());
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const unitIdParam = searchParams.get("unitId");
  const unitId = unitIdParam ? Number(unitIdParam) : null;

  useEffect(() => { requestAnimationFrame(() => setReady(true)); }, []);
  
  // Debug: log design state changes
  useEffect(() => {
    console.log("[root] design.generateImages changed to:", design.generateImages);
  }, [design.generateImages]);

  // Cancel any in-flight SSE stream when the component unmounts
  useEffect(() => {
    return () => { abortRef.current.abort(); };
  }, []);

  const handleGenerateOutline = async () => {
    if (!form.title.trim()) return;
    setBusy(true); setBusyMsg("Crafting your outline…");
    try {
      const token = localStorage.getItem("token");
      const res  = await fetch("/api/v1/ai/generate-slides", {
        method:"POST", 
        headers:{
          "Content-Type":"application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(buildBody(form, [], design)),
      });
      const data = res.ok ? await res.json() : null;
      const parsed: Slide[] = data?.slides?.map((s: { title: string; bullet_points?: string[]; examples?: string[] }) => ({
        id:uid(), 
        title:s.title, 
        bullets: s.bullet_points || [],
        examples: s.examples || [],
        imageType: "auto",
      })) || [];
      while (parsed.length < form.slideCount)
        parsed.push({ id:uid(), title:`Topic ${parsed.length+1}`, bullets:["Key point here"] });
      setSlides(parsed.slice(0, form.slideCount));
    } catch {
      setSlides(Array.from({length:form.slideCount},(_,i) => ({
        id:uid(),
        title: i===0?"Introduction":i===form.slideCount-1?"Summary & Conclusion":`Module ${i}`,
        bullets:["Core concept","Supporting example"],
        imageType: "auto",
      })));
    } finally { setBusy(false); setStep(2); }
  };

  /**
   * Phase 1 — Generate slide text via a fast blocking call (~5–10 s).
   *            Show slides in Step 4 immediately.
   * Phase 2 — If images are enabled, open an SSE stream and patch each
   *            slide's image field as image_ready events arrive.
   *            Images complete in parallel, appearing in the UI one by one.
   */
  const handleGenerate = async () => {
    const currentDesign = design;
    const shouldGenerateImages =
      currentDesign.generateImages === true &&
      currentDesign.imageProvider !== "none";

    // Reset and enter busy state
    abortRef.current = new AbortController();   // fresh controller for this run
    setBusy(true);
    setBusyMsg("Generating slide content…");
    setResult(null);
    setImageProgress({});

    const token   = localStorage.getItem("token");
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };

    // ── Phase 1: text generation ───────────────────────────────────────────────
    let textDeck: SlideDeckResult;
    try {
      const res = await fetch("/api/v1/ai/generate-slides", {
        method: "POST",
        headers,
        body: JSON.stringify(buildBody(form, slides, currentDesign)),
        signal: abortRef.current.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      textDeck = await res.json();
    } catch (e: unknown) {
      if ((e as Error).name === "AbortError") return;
      setResult({ _error: (e as Error).message ?? String(e) });
      setStep(4);
      setBusy(false);
      return;
    }

    // Show slides immediately — images will arrive progressively
    setResult(textDeck);
    setStep(4);

    if (!shouldGenerateImages || !textDeck.slides?.length) {
      setBusy(false);
      return;
    }

    // ── Phase 2: image streaming ───────────────────────────────────────────────
    setBusyMsg("Generating images…");

    // Pre-populate progress state — every eligible slide starts as "loading".
    // Intro (index 0) and summary (last index) are skipped automatically.
    const n = textDeck.slides.length;
    const initProgress: Record<number, string> = {};
    for (let i = 0; i < n; i++) {
      initProgress[i + 1] = (i === 0 || i === n - 1) ? "skipped" : "loading";
    }
    setImageProgress(initProgress);

    const streamBody = {
      slides:               textDeck.slides,
      topic:                form.title,
      target_audience:      `${form.tone} audience`,
      image_provider:       currentDesign.imageProvider,
      image_style:          currentDesign.imageStyle,
      image_style_keywords: currentDesign.imageStyleKeywords,
      theme:                currentDesign.theme,
      skip_intro_slide:     true,
      skip_summary_slide:   true,
    };

    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    try {
      const streamRes = await fetch("/api/v1/ai/generate-slides-with-images-stream", {
        method: "POST",
        headers,
        body: JSON.stringify(streamBody),
        signal: abortRef.current.signal,
      });
      if (!streamRes.ok) throw new Error(`Stream HTTP ${streamRes.status}`);
      if (!streamRes.body)  throw new Error("No response body");

      reader = streamRes.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      // Parse SSE frames from the byte stream.
      // Each frame is terminated by a blank line ("\n\n").
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";           // last element = incomplete frame

        for (const frame of frames) {
          const event = frame.match(/^event: (.+)$/m)?.[1];
          const raw   = frame.match(/^data: (.+)$/m)?.[1];
          if (!event || !raw) continue;

          let data: Record<string, unknown>;
          try { data = JSON.parse(raw); }
          catch { continue; }

          if (event === "image_ready") {
            // Patch the single slide whose image just arrived.
            // slide_id is 1-based per the SSE spec.
            const { slide_id, image_url } = data as { slide_id: number; image_url: string };
            setResult(prev => {
              if (!prev?.slides) return prev;
              const updated = [...prev.slides];
              updated[slide_id - 1] = { ...updated[slide_id - 1], image: image_url };
              return { ...prev, slides: updated };
            });
            setImageProgress(prev => ({ ...prev, [slide_id]: "done" }));

          } else if (event === "finished") {
            // Any slide still "loading" at this point had an unrecoverable error.
            setImageProgress(prev => {
              const next = { ...prev };
              for (const k of Object.keys(next)) {
                if (next[Number(k)] === "loading") next[Number(k)] = "error";
              }
              return next;
            });

          } else if (event === "error") {
            console.error("[stream] server error:", (data as { message: string }).message);
          }
        }
      }
    } catch (e: unknown) {
      if ((e as Error).name === "AbortError") return;
      console.error("[stream] image stream failed:", e);
      // Slides are already visible — just mark remaining loading slides as failed.
      setImageProgress(prev => {
        const next = { ...prev };
        for (const k of Object.keys(next)) {
          if (next[Number(k)] === "loading") next[Number(k)] = "error";
        }
        return next;
      });
    } finally {
      try { reader?.releaseLock(); } catch { /* ignore */ }
      setBusy(false);
    }
  };

  // editedSlides is passed by ReviewSlidesPage after the teacher finishes editing.
  // Falls back to the raw result or the outline if no edits were made.
  const handleSave = async (editedSlides?: ResultSlide[]) => {
    setSaving(true);
    try {
      const token = localStorage.getItem("token");

      if (!unitId || !Number.isFinite(unitId)) {
        throw new Error("Unit ID is required. Please open this page with ?unitId=123 in the URL.");
      }

      const createBody = {
        title:                  form.title || "AI Presentation",
        description:            form.title || "",
        topic:                  form.title || "",
        level:                  form.tone,
        duration_minutes:       form.slideCount * 3,
        language:               form.language,
        learning_goals:         slides.flatMap((s: Slide) => s.bullets).filter(Boolean).slice(0, 8),
        target_audience:        `${form.tone} audience`,
        is_visible_to_students: false,
        order_index:            0,
      };

      const presRes = await fetch(`/api/v1/admin/units/${unitId}/presentations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(createBody),
      });
      if (!presRes.ok) {
        const errorText = await presRes.text();
        throw new Error(`Create presentation failed (HTTP ${presRes.status}): ${errorText}`);
      }
      const pres = (await presRes.json()) as { id: number };

      // Use teacher-edited slides if provided, otherwise fall back to generated/outline slides
      const deckSlides: ResultSlide[] = editedSlides?.length
        ? editedSlides
        : result?.slides?.length
          ? result.slides
          : slides.map((s: Slide) => ({
              title: s.title,
              bullet_points: s.bullets,
              examples: s.examples || [],
              exercise: null,
              teacher_notes: null,
              image: null,
            }));

      for (let i = 0; i < deckSlides.length; i++) {
        const s = deckSlides[i];
        const slideRes = await fetch(`/api/v1/admin/presentations/${pres.id}/slides`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            title:         s.title,
            bullet_points: s.bullet_points || [],
            examples:      s.examples || [],
            exercise:      s.exercise ?? null,
            teacher_notes: s.teacher_notes ?? null,
            image_url:     s.image || null,
            image_alt:     null,
            order_index:   i,
          }),
        });
        if (!slideRes.ok) {
          const errorText = await slideRes.text();
          throw new Error(`Create slide ${i + 1} failed (HTTP ${slideRes.status}): ${errorText}`);
        }
      }

      setSaved(true);
      navigate(`/admin/units/${unitId}`);
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      console.error("Save failed:", errorMessage);
      alert(`Failed to save presentation: ${errorMessage}`);
    } finally {
      setSaving(false);
    }
  };

  const handleGoBack = () => {
    if (unitId && Number.isFinite(unitId)) {
      // Navigate to unit page if unitId exists
      navigate(`/admin/units/${unitId}`);
    } else {
      // Navigate to unit create page if no unitId
      navigate('/admin/units/new');
    }
  };

  return (
    <>
      <SGStyles />
      <ReviewStyles />
      <div className={`sg ${ready?"sg--in":""}`}>
        {step !== 4 && <SGHeader onBack={handleGoBack} />}
        {step !== 4 && <SGStepper step={step} />}
        {step !== 4 && (
          <main className="sg-main">
            {step===1 && <Step1 form={form} setForm={setForm} busy={busy} busyMsg={busyMsg} onNext={handleGenerateOutline} />}
            {step===2 && <Step2 slides={slides} setSlides={setSlides} onNext={()=>setStep(3)} onBack={()=>setStep(1)} />}
            {step===3 && <Step3 design={design} setDesign={setDesign} form={form} slides={slides}
              adv={adv} setAdv={setAdv} busy={busy} busyMsg={busyMsg} result={result}
              onGenerate={handleGenerate} onBack={()=>setStep(2)} />}
          </main>
        )}
      </div>

      {/* Step 4 renders OUTSIDE the sg wrapper — full viewport */}
      {step===4 && (
        <ReviewSlidesPage
          result={result}
          form={form}
          design={design}
          slides={slides}
          onBack={() => setStep(3)}
          onSave={handleSave}
          saving={saving}
          saved={saved}
          imageProgress={imageProgress}
        />
      )}
    </>
  );
}

// ─── HEADER ──────────────────────────────────────────────────────────────────

function SGHeader({ onBack }: { onBack: () => void }) {
  return (
    <header className="sg-header">
      <div className="sg-logo">
        <button 
          onClick={onBack}
          className="sg-back-btn"
          style={{ 
            marginRight: '12px', 
            padding: '6px 12px',
            background: 'rgba(255,255,255,0.1)',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: '6px',
            color: 'white',
            cursor: 'pointer',
            fontSize: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.15)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ transform: 'rotate(180deg)' }}>
            <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Back to Unit
        </button>
        <div className="sg-logo-mark">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <rect x="1" y="1" width="7" height="5" rx="1.5" fill="white" opacity=".9"/>
            <rect x="10" y="1" width="7" height="5" rx="1.5" fill="white" opacity=".6"/>
            <rect x="1" y="8" width="16" height="3" rx="1.5" fill="white" opacity=".75"/>
            <rect x="1" y="13" width="10" height="3" rx="1.5" fill="white" opacity=".5"/>
          </svg>
        </div>
        EduSlide <em>AI</em>
      </div>
      <div className="sg-header-r">
        <div className="sg-credit-pill"><span className="sg-c-dot"/>Credits: <strong>48</strong></div>
        <button className="sg-header-btn">Dashboard</button>
      </div>
    </header>
  );
}

// ─── STEPPER ─────────────────────────────────────────────────────────────────

function SGStepper({ step }: { step: number }) {
  return (
    <div className="sg-stepper">
      <div className="sg-stepper-row">
        {STEP_META.map((s,i) => {
          const done = step > s.n, active = step === s.n;
          return (
            <div key={s.n} className="sg-step-item">
              {i > 0 && <div className={`sg-connector ${done||active?"sg-connector--on":""}`}/>}
              <div className={`sg-node ${active?"sg-node--a":""} ${done?"sg-node--d":""}`}>
                {done
                  ? <svg width="11" height="11" viewBox="0 0 11 11"><path d="M1.5 5.5l3 3 5-5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  : <span>{s.n}</span>
                }
              </div>
              <div className="sg-node-text">
                <strong>{s.label}</strong>
                <span>{s.desc}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── STEP 1 ──────────────────────────────────────────────────────────────────

function Step1({ form, setForm, busy, busyMsg, onNext }: {
  form: FormData;
  setForm: React.Dispatch<React.SetStateAction<FormData>>;
  busy: boolean;
  busyMsg: string;
  onNext: () => void;
}) {
  const set = (k: keyof FormData, v: string | number) => setForm((f: FormData) => ({...f, [k]: v}));
  const ok  = form.title.trim().length >= 3;
  return (
    <div className="sg-panel sg-fadein">
      <div className="sg-hero">
        <span className="sg-badge">Step 1 of 3</span>
        <h1 className="sg-h1">Create Your Presentation</h1>
        <p className="sg-sub">Describe what you want to present — the AI will structure your outline.</p>
      </div>

      <div className="sg-grid">
        {/* Title */}
        <div className="sg-field sg-field--full">
          <label className="sg-lbl">Presentation Title <span className="sg-req">*</span></label>
          <div className="sg-iw">
            <input className="sg-inp sg-inp--lg"
              placeholder="e.g. Introduction to Machine Learning for Educators"
              value={form.title} maxLength={200}
              onChange={e=>set("title",e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&ok&&!busy&&onNext()} />
            <span className="sg-char">{form.title.length}/200</span>
          </div>
        </div>

        {/* Slide count */}
        <div className="sg-field">
          <label className="sg-lbl">Number of Slides</label>
          <div className="sg-selw">
            <select className="sg-sel" value={form.slideCount} onChange={e=>set("slideCount",+e.target.value)}>
              {SLIDE_COUNTS.map(n=><option key={n} value={n}>{n} slides</option>)}
            </select><span className="sg-arr">▾</span>
          </div>
        </div>

        {/* Language */}
        <div className="sg-field">
          <label className="sg-lbl">Language</label>
          <div className="sg-selw">
            <select className="sg-sel" value={form.language} onChange={e=>set("language",e.target.value)}>
              {LANGUAGES.map(l=><option key={l}>{l}</option>)}
            </select><span className="sg-arr">▾</span>
          </div>
        </div>

        {/* Tone */}
        <div className="sg-field sg-field--full">
          <label className="sg-lbl">Tone</label>
          <div className="sg-tone-row">
            {TONES.map(t=>(
              <button key={t} className={`sg-pill ${form.tone===t?"sg-pill--on":""}`}
                onClick={()=>set("tone",t)}>{t}</button>
            ))}
          </div>
        </div>

        {/* Depth */}
        <div className="sg-field sg-field--full">
          <label className="sg-lbl">Content Depth</label>
          <div className="sg-depth-row">
            {DEPTHS.map(d=>(
              <button key={d.id} className={`sg-depth-card ${form.depth===d.id?"sg-depth-card--on":""}`}
                onClick={()=>set("depth",d.id)}>
                <strong>{d.label}</strong><span>{d.desc}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="sg-actions">
        <button className={`sg-btn sg-btn--primary sg-btn--lg ${(!ok||busy)?"sg-btn--off":""}`}
          onClick={onNext} disabled={!ok||busy}>
          {busy?<><Spin/>{busyMsg}</>:<>Generate Outline <Arr/></>}
        </button>
        {ok&&<p className="sg-hint">AI will generate {form.slideCount} slides in {form.language}</p>}
      </div>
    </div>
  );
}

// ─── STEP 2 ──────────────────────────────────────────────────────────────────

function Step2({ slides, setSlides, onNext, onBack }: {
  slides: Slide[];
  setSlides: React.Dispatch<React.SetStateAction<Slide[]>>;
  onNext: () => void;
  onBack: () => void;
}) {
  const dragIdx  = useRef<number | null>(null);
  const dragOver = useRef<number | null>(null);

  const updateTitle = (id: string, v: string) => setSlides((ss: Slide[]) => ss.map((s: Slide) => s.id === id ? {...s, title: v} : s));
  const addSlide    = () => setSlides((ss: Slide[]) => [...ss, {id:uid(), title:`Slide ${ss.length+1}`, bullets:["New content"]}]);
  const removeSlide = (id: string) => setSlides((ss: Slide[]) => ss.filter((s: Slide) => s.id !== id));

  const updateBullet = (id: string, bulletIdx: number, val: string) =>
    setSlides((ss: Slide[]) => ss.map((s: Slide) =>
      s.id === id
        ? { ...s, bullets: s.bullets.map((b: string, i: number) => i === bulletIdx ? val : b) }
        : s
    ));

  const addBullet = (id: string) =>
    setSlides((ss: Slide[]) => ss.map((s: Slide) =>
      s.id === id ? { ...s, bullets: [...s.bullets, ""] } : s
    ));

  const removeBullet = (id: string, bulletIdx: number) =>
    setSlides((ss: Slide[]) => ss.map((s: Slide) =>
      s.id === id && s.bullets.length > 1
        ? { ...s, bullets: s.bullets.filter((_: string, i: number) => i !== bulletIdx) }
        : s
    ));

  const updateImageType = (id: string, type: string) =>
    setSlides((ss: Slide[]) => ss.map((s: Slide) => s.id === id ? { ...s, imageType: type } : s));

  const onDrop = () => {
    if(dragIdx.current==null||dragOver.current==null)return;
    const n=[...slides],[m]=n.splice(dragIdx.current,1);
    n.splice(dragOver.current,0,m);
    setSlides(n); dragIdx.current=dragOver.current=null;
  };

  return (
    <div className="sg-panel sg-fadein">
      <div className="sg-hero">
        <span className="sg-badge">Step 2 of 3</span>
        <h1 className="sg-h1">Slide Outline</h1>
        <p className="sg-sub">AI generated your structure. Edit titles, reorder, add or remove slides.</p>
      </div>

      <div className="sg-toolbar">
        <div className="sg-count-row">
          <div className="sg-count-badge">{slides.length}</div>
          <span>Total Slides</span>
        </div>
        <button className="sg-btn sg-btn--ghost sg-btn--sm" onClick={addSlide}>
          <PlusIco/> Add Slide
        </button>
      </div>

      <div className="sg-list">
        {slides.map((s: Slide, i: number) => (
          <div key={s.id} className="sg-sc"
            draggable
            onDragStart={()=>dragIdx.current=i}
            onDragEnter={()=>dragOver.current=i}
            onDragOver={e=>e.preventDefault()}
            onDrop={onDrop}>
            <DragIco/>
            <div className="sg-sn">{i+1}</div>
            <div className="sg-sb">
              <input className="sg-sti" value={s.title} onChange={e=>updateTitle(s.id,e.target.value)} placeholder="Slide title…"/>
              <div className="sg-bullets-editable">
                {(s.bullets||[]).map((b: string, j: number) => (
                  <div key={j} className="sg-bullet-row">
                    <span className="sg-bullet-dot">▸</span>
                    <input
                      className="sg-bullet-inp"
                      value={b}
                      onChange={e => updateBullet(s.id, j, e.target.value)}
                      placeholder="Bullet point…"
                    />
                    {s.bullets.length > 1 && (
                      <button className="sg-bullet-rm" onClick={() => removeBullet(s.id, j)}>×</button>
                    )}
                  </div>
                ))}
                <button className="sg-bullet-add" onClick={() => addBullet(s.id)}>+ Add point</button>
              </div>
              <div className="sg-img-type-row">
                <span className="sg-img-type-label">Image type</span>
                <div className="sg-img-type-pills">
                  {IMAGE_TYPES.map((t: { id: string; label: string; icon: string; hint: string }) => (
                    <button
                      key={t.id}
                      className={`sg-img-pill ${(s.imageType || "auto") === t.id ? "sg-img-pill--on" : ""}`}
                      onClick={() => updateImageType(s.id, t.id)}
                      title={t.hint}
                    >
                      {t.icon} {t.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {slides.length>2&&(
              <button className="sg-del" onClick={()=>removeSlide(s.id)} title="Remove">×</button>
            )}
          </div>
        ))}
      </div>

      <div className="sg-actions sg-actions--row">
        <button className="sg-btn sg-btn--ghost" onClick={onBack}>← Back</button>
        <button className="sg-btn sg-btn--primary sg-btn--lg" onClick={onNext}>
          Customize Design <Arr/>
        </button>
      </div>
    </div>
  );
}

// ─── STEP 3 ──────────────────────────────────────────────────────────────────

function Step3({ design, setDesign, form, slides, adv, setAdv, busy, busyMsg, result, onGenerate, onBack }: {
  design: DesignData;
  setDesign: React.Dispatch<React.SetStateAction<DesignData>>;
  form: FormData;
  slides: Slide[];
  adv: boolean;
  setAdv: React.Dispatch<React.SetStateAction<boolean>>;
  busy: boolean;
  busyMsg: string;
  result: SlideDeckResult | null;
  onGenerate: () => void;
  onBack: () => void;
}) {
  const set = (k: keyof DesignData, v: string | boolean) => {
    console.log("[Step3 set] updating", k, "to", v);
    setDesign((d: DesignData) => {
      const updated = {...d, [k]: v};
      console.log("[Step3 set] updated design:", updated);
      return updated;
    });
  };
  const credits = slides.length*2 + (design.exercises?4:0) + (design.quizSlide?3:0);

  return (
    <div className="sg-panel sg-panel--wide sg-fadein">
      <div className="sg-hero">
        <span className="sg-badge">Step 3 of 3</span>
        <h1 className="sg-h1">Design & Visual Settings</h1>
        <p className="sg-sub">Customise the look before the final generation.</p>
      </div>

      <div className="sg-design-wrap">
        {/* ── LEFT COLUMN ── */}
        <div className="sg-dl">

          {/* THEME */}
          <Sec icon="🎨" title="Theme Selection">
            <div className="sg-themes">
              {THEMES.map(t=>(
                <button key={t.id} className={`sg-tc ${design.theme===t.id?"sg-tc--on":""}`}
                  onClick={()=>set("theme",t.id)}>
                  <div className="sg-ts">{t.colors.map((c,i)=><div key={i} style={{flex:1,background:c}}/>)}</div>
                  <span className="sg-tn">{t.name}</span>
                  {design.theme===t.id&&<div className="sg-tck">✓</div>}
                </button>
              ))}
            </div>
          </Sec>

          {/* TEXT DENSITY */}
          <Sec icon="📝" title="Text Density">
            <div className="sg-density-pills">
              {DEPTHS.map(d=>(
                <button key={d.id} className={`sg-dp ${design.textDensity===d.id?"sg-dp--on":""}`}
                  onClick={()=>set("textDensity",d.id)}>
                  <strong>{d.label}</strong><span>{d.desc}</span>
                </button>
              ))}
            </div>
          </Sec>

          {/* IMAGE GENERATION */}
          <Sec icon="🤖" title="Image Generation">
            <div className="sg-toggle-row">
              <div>
                <div style={{fontSize:13,fontWeight:600,color:"var(--k2)"}}>Generate images for slides</div>
                <div style={{fontSize:11,color:"var(--k4)",marginTop:2}}>
                  AI will create a visual for each slide based on content
                </div>
              </div>
              <div
                className={`sg-tog ${design.generateImages ? "sg-tog--on" : ""}`}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const newValue = !design.generateImages;
                  console.log("[toggle] generateImages changing from", design.generateImages, "to", newValue);
                  console.log("[toggle] current design object:", design);
                  set("generateImages", newValue);
                  // Verify the update happened
                  setTimeout(() => {
                    console.log("[toggle] after update, design.generateImages should be:", newValue);
                  }, 100);
                }}
              />
            </div>

            {design.generateImages && (
              <>
                <div className="sg-sublbl" style={{marginTop:16}}>Image Backend</div>
                <div className="sg-provider-cards">
                  <button
                    className={`sg-provider-card ${design.imageProvider==="svg" ? "sg-provider-card--on" : ""}`}
                    onClick={() => set("imageProvider", "svg")}
                  >
                    <div className="sg-provider-icon">⚡</div>
                    <div className="sg-provider-info">
                      <strong>SVG Diagrams</strong>
                      <span>Free · Offline · Instant</span>
                      <span className="sg-provider-tag sg-provider-tag--free">FREE</span>
                    </div>
                    <div className="sg-provider-check">
                      {design.imageProvider==="svg" && "✓"}
                    </div>
                  </button>

                  <button
                    className={`sg-provider-card ${design.imageProvider==="huggingface" ? "sg-provider-card--on" : ""}`}
                    onClick={() => set("imageProvider", "huggingface")}
                  >
                    <div className="sg-provider-icon">🤗</div>
                    <div className="sg-provider-info">
                      <strong>HuggingFace</strong>
                      <span>Free tier · Diffusion model</span>
                      <span className="sg-provider-tag sg-provider-tag--key">Needs HF_API_KEY</span>
                    </div>
                    <div className="sg-provider-check">
                      {design.imageProvider==="huggingface" && "✓"}
                    </div>
                  </button>
                </div>

                <div className="sg-sublbl" style={{marginTop:14}}>Style Keywords</div>
                <input
                  className="sg-inp sg-inp--sm"
                  placeholder="minimal, geometric, flat illustration…"
                  value={design.imageStyleKeywords}
                  onChange={e => set("imageStyleKeywords", e.target.value)}
                />

                <div className="sg-img-count-note">
                  <span>📸</span>
                  <span>
                    <strong>{slides.filter((s: Slide) => (s.imageType || "auto") !== "none").length}</strong> of{" "}
                    {slides.length} slides will receive images
                    {" "}· intro & summary slides skipped automatically
                  </span>
                </div>
              </>
            )}
          </Sec>

          {/* IMAGE SETTINGS */}
          <Sec icon="🖼️" title="Image Settings">
            <div className="sg-sublbl">Image Source</div>
            <div className="sg-src-row">
              {IMG_SOURCES.map(s=>(
                <button key={s} className={`sg-srcbtn ${design.imageSource===s?"sg-srcbtn--on":""}`}
                  onClick={()=>set("imageSource",s)}>{s}</button>
              ))}
            </div>
            {design.imageSource!=="No Images"&&<>
              <div className="sg-sublbl" style={{marginTop:16}}>AI Image Style</div>
              <div className="sg-style-g">
                {IMG_STYLES.map(s=>(
                  <button key={s.id} className={`sg-stbtn ${design.imageStyle===s.id?"sg-stbtn--on":""}`}
                    onClick={()=>set("imageStyle",s.id)}>
                    <span>{s.icon}</span>{s.label}
                  </button>
                ))}
              </div>
              <div className="sg-sublbl" style={{marginTop:16}}>Style Keywords</div>
              <input className="sg-inp sg-inp--sm" placeholder="minimal, geometric, futuristic…"
                value={design.styleKeywords} onChange={e=>set("styleKeywords",e.target.value)}/>
              <label className="sg-cb-row" style={{marginTop:10}}>
                <input type="checkbox" checked={design.useThemeStyle} onChange={e=>set("useThemeStyle",e.target.checked)}/>
                <span>Use theme style for images</span>
              </label>
            </>}
          </Sec>

          {/* ADVANCED */}
          <div className="sg-adv">
            <button className="sg-adv-hd" onClick={() => setAdv((a: boolean) => !a)}>
              <span>⚙️ Advanced Settings</span>
              <span className={`sg-adv-arr ${adv?"sg-adv-arr--open":""}`}>▾</span>
            </button>
            {adv&&(
              <div className="sg-adv-body">
                {[
                  {k:"exercises",   l:"Include exercises",              i:"✏️"},
                  {k:"speakerNotes",l:"Include speaker notes",          i:"📌"},
                  {k:"summarySlide",l:"Add summary slide at the end",   i:"📋"},
                  {k:"quizSlide",   l:"Generate quiz slide at the end", i:"🧠"},
                ].map(o=>(
                  <label key={o.k} className="sg-adv-row">
                    <span className="sg-adv-lbl"><span>{o.i}</span>{o.l}</span>
                    <div className={`sg-tog ${design[o.k as keyof DesignData]?"sg-tog--on":""}`} onClick={()=>set(o.k as keyof DesignData, !design[o.k as keyof DesignData])}/>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT COLUMN ── */}
        <div className="sg-dr">
          {/* Deck Preview */}
          <div className="sg-prev">
            <div className="sg-prev-hd">
              <div className="sg-dot sg-dot--r"/><div className="sg-dot sg-dot--y"/><div className="sg-dot sg-dot--g"/>
              <span className="sg-prev-lbl">Preview</span>
            </div>
            <DeckPreview slides={slides} design={design}/>
          </div>

          {/* CTA Card */}
          <div className="sg-cta-card">
            <div className="sg-cta-title">{form.title||"Untitled Presentation"}</div>
            <div className="sg-cta-meta">
              <span>{slides.length} slides</span><span>·</span>
              <span>{form.language}</span><span>·</span><span>{form.tone}</span>
            </div>

            <button className={`sg-btn sg-btn--xl ${busy?"sg-btn--off":""}`} onClick={onGenerate} disabled={busy}>
              {busy?<><Spin/>{busyMsg}</>:<>✨ Generate Presentation</>}
            </button>

            <div className="sg-credits">
              <span>⚡</span> Estimated usage: <strong>{credits} credits</strong>
            </div>

            {result&&!result._error&&(
              <div className="sg-ok">
                <span>🎉</span>
                <div><strong>Presentation ready!</strong>
                  <div style={{fontSize:12,color:"#6B7280",marginTop:2}}>{result.slides?.length} slides generated</div>
                </div>
              </div>
            )}
            {result?._error&&<div className="sg-err">⚠️ {result._error}</div>}
          </div>

          <button className="sg-btn sg-btn--ghost sg-back-btn" onClick={onBack}>← Edit outline</button>
        </div>
      </div>
    </div>
  );
}

// ─── DECK PREVIEW ─────────────────────────────────────────────────────────────

function DeckPreview({ slides, design }: { slides: Slide[]; design: DesignData }) {
  const t  = THEMES.find((x: { id: string; name: string; colors: string[]; dark: boolean }) => x.id === design.theme) || THEMES[2];
  const tx = t.dark ? "#fff" : "#1a1a1a";
  const ac = t.colors[t.colors.length - 1];
  return (
    <div className="sg-dpv" style={{background:t.colors[0]}}>
      {slides.slice(0,4).map((s: Slide, i: number) => (
        <div key={s.id} className="sg-ms" style={{
          background:i===0?`linear-gradient(135deg,${t.colors[1]||t.colors[0]},${t.colors[0]})`:t.colors[1]||t.colors[0],
          borderLeft:`3px solid ${ac}`,
        }}>
          <div style={{fontSize:9,fontWeight:700,color:ac,opacity:.7,marginBottom:3}}>{i+1}</div>
          <div style={{fontSize:12,fontWeight:700,color:tx,lineHeight:1.3}}>{s.title}</div>
          <div style={{display:"flex",gap:4,marginTop:6}}>
            {(s.bullets||[]).slice(0,2).map((_: string, j: number) => (
              <div key={j} style={{width:28,height:3,borderRadius:2,background:tx,opacity:.2}}/>
            ))}
          </div>
        </div>
      ))}
      {slides.length>4&&(
        <div style={{textAlign:"center",fontSize:11,color:tx,opacity:.35,padding:6}}>
          +{slides.length-4} more
        </div>
      )}
    </div>
  );
}

// ─── REUSABLES ────────────────────────────────────────────────────────────────

function Sec({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <div className="sg-sec">
      <div className="sg-sec-title"><span>{icon}</span>{title}</div>
      {children}
    </div>
  );
}
const Spin   = () => <div className="sg-spin"/>;
const Arr    = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{marginLeft:2}}>
    <path d="M2 7h10M8 3l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const PlusIco = () => (
  <svg width="11" height="11" viewBox="0 0 11 11" fill="none" style={{marginRight:3}}>
    <path d="M5.5 1v9M1 5.5h9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
  </svg>
);
const DragIco = () => (
  <svg width="10" height="16" viewBox="0 0 10 16" fill="none" style={{opacity:.35,flexShrink:0}}>
    {[[2,2],[8,2],[2,6],[8,6],[2,10],[8,10],[2,14],[8,14]].map(([cx,cy])=>(
      <circle key={`${cx}${cy}`} cx={cx} cy={cy} r="1.3" fill="#9CA3AF"/>
    ))}
  </svg>
);

// ─── STYLES ───────────────────────────────────────────────────────────────────

function SGStyles() {
  return <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Outfit:wght@300;400;500;600&display=swap');
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    :root{
      --bg:#F8FAFC; --sur:#FFFFFF; --bdr:#E2E8F0; --bdr2:#CBD5E1;
      --ink:#0F172A; --k2:#334155; --k3:#64748B; --k4:#94A3B8;
      --blu:#2563EB; --bluh:#1D4ED8; --blubg:#EFF6FF;
      --amb:#F59E0B; --ambbg:#FFFBEB;
      --grn:#10B981; --grnbg:#ECFDF5;
      --red:#EF4444; --redbg:#FEF2F2;
      --r:12px; --rs:8px;
      --sh:0 1px 3px rgba(0,0,0,.06),0 4px 16px rgba(0,0,0,.04);
      --shl:0 8px 32px rgba(0,0,0,.10);
    }
    body{background:var(--bg);font-family:'Outfit',sans-serif;color:var(--ink);min-height:100vh}
    input,select,button,textarea{font-family:inherit}

    /* ROOT */
    .sg{opacity:0;transform:translateY(10px);transition:opacity .4s ease,transform .4s ease;min-height:100vh;display:flex;flex-direction:column}
    .sg--in{opacity:1;transform:none}

    /* HEADER */
    .sg-header{height:56px;background:var(--ink);display:flex;align-items:center;justify-content:space-between;padding:0 32px;position:sticky;top:0;z-index:200}
    .sg-logo{display:flex;align-items:center;gap:10px;font-family:'Plus Jakarta Sans',sans-serif;font-size:16px;font-weight:700;color:#fff}
    .sg-logo em{color:var(--amb);font-style:normal}
    .sg-logo-mark{width:32px;height:32px;background:linear-gradient(135deg,#2563EB,#7C3AED);border-radius:8px;display:flex;align-items:center;justify-content:center}
    .sg-header-r{display:flex;align-items:center;gap:12px}
    .sg-credit-pill{display:flex;align-items:center;gap:6px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);border-radius:20px;padding:4px 12px;font-size:12px;color:rgba(255,255,255,.7)}
    .sg-c-dot{width:6px;height:6px;border-radius:50%;background:var(--grn);box-shadow:0 0 6px var(--grn)}
    .sg-header-btn{background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.14);border-radius:8px;padding:6px 14px;font-size:13px;font-weight:500;color:#fff;cursor:pointer;transition:background .15s}
    .sg-header-btn:hover{background:rgba(255,255,255,.18)}

    /* STEPPER */
    .sg-stepper{background:var(--sur);border-bottom:1px solid var(--bdr);padding:20px 32px}
    .sg-stepper-row{max-width:620px;margin:0 auto;display:flex;align-items:center}
    .sg-step-item{display:flex;align-items:center;gap:12px;flex:1}
    .sg-connector{flex:1;height:2px;background:var(--bdr);margin:0 -6px;transition:background .3s;z-index:0}
    .sg-connector--on{background:var(--blu)}
    .sg-node{width:32px;height:32px;border-radius:50%;background:var(--sur);border:2px solid var(--bdr2);display:flex;align-items:center;justify-content:center;font-family:'Plus Jakarta Sans',sans-serif;font-size:13px;font-weight:700;color:var(--k4);flex-shrink:0;transition:all .25s;position:relative;z-index:1}
    .sg-node--a{border-color:var(--blu);background:var(--blu);color:#fff;box-shadow:0 0 0 4px rgba(37,99,235,.14)}
    .sg-node--d{border-color:var(--blu);background:var(--blu)}
    .sg-node-text{display:flex;flex-direction:column;gap:1px}
    .sg-node-text strong{font-family:'Plus Jakarta Sans',sans-serif;font-size:13px;font-weight:700;color:var(--k2)}
    .sg-node-text span{font-size:11px;color:var(--k4)}

    /* MAIN */
    .sg-main{flex:1;padding:40px 24px 80px;max-width:960px;margin:0 auto;width:100%}
    .sg-fadein{animation:fdin .35s cubic-bezier(.22,1,.36,1)}
    @keyframes fdin{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}

    /* PANEL */
    .sg-panel{max-width:680px;margin:0 auto}
    .sg-panel--wide{max-width:100%}

    /* HERO */
    .sg-hero{margin-bottom:36px}
    .sg-badge{display:inline-flex;background:var(--blubg);color:var(--blu);font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;padding:4px 10px;border-radius:20px;margin-bottom:12px;font-family:'Plus Jakarta Sans',sans-serif}
    .sg-h1{font-family:'Plus Jakarta Sans',sans-serif;font-size:28px;font-weight:800;color:var(--ink);line-height:1.2;margin-bottom:8px}
    .sg-sub{font-size:15px;color:var(--k3)}

    /* FORM */
    .sg-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px 24px;margin-bottom:32px}
    .sg-field{display:flex;flex-direction:column;gap:7px}
    .sg-field--full{grid-column:1/-1}
    .sg-lbl{font-size:13px;font-weight:600;color:var(--k2);font-family:'Plus Jakarta Sans',sans-serif}
    .sg-req{color:var(--red);margin-left:2px}
    .sg-iw{position:relative}
    .sg-char{position:absolute;right:12px;top:50%;transform:translateY(-50%);font-size:11px;color:var(--k4);pointer-events:none}
    .sg-inp{width:100%;border:1.5px solid var(--bdr);border-radius:var(--rs);background:var(--sur);font-size:14px;color:var(--ink);transition:border-color .2s,box-shadow .2s;outline:none;padding:10px 14px}
    .sg-inp--lg{font-size:16px;padding:13px 40px 13px 16px}
    .sg-inp--sm{padding:9px 14px;font-size:13px}
    .sg-inp:focus{border-color:var(--blu);box-shadow:0 0 0 3px rgba(37,99,235,.1)}
    .sg-inp::placeholder{color:var(--k4)}
    .sg-selw{position:relative}
    .sg-sel{width:100%;border:1.5px solid var(--bdr);border-radius:var(--rs);background:var(--sur);font-size:14px;color:var(--ink);padding:10px 36px 10px 14px;appearance:none;outline:none;cursor:pointer;transition:border-color .2s}
    .sg-sel:focus{border-color:var(--blu);box-shadow:0 0 0 3px rgba(37,99,235,.1)}
    .sg-arr{position:absolute;right:12px;top:50%;transform:translateY(-50%);pointer-events:none;color:var(--k4);font-size:11px}
    .sg-tone-row{display:flex;gap:8px;flex-wrap:wrap}
    .sg-pill{padding:7px 16px;border-radius:20px;border:1.5px solid var(--bdr);background:#fff;cursor:pointer;font-size:13px;font-weight:500;color:var(--k2);transition:all .15s}
    .sg-pill:hover{border-color:var(--blu);color:var(--blu);background:var(--blubg)}
    .sg-pill--on{border-color:var(--blu);background:var(--blu);color:#fff}
    .sg-depth-row{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
    .sg-depth-card{padding:12px;border-radius:var(--rs);border:1.5px solid var(--bdr);background:#fff;cursor:pointer;text-align:left;display:flex;flex-direction:column;gap:4px;transition:all .2s}
    .sg-depth-card strong{font-size:13px;font-weight:700;color:var(--k2);font-family:'Plus Jakarta Sans',sans-serif}
    .sg-depth-card span{font-size:11px;color:var(--k4)}
    .sg-depth-card:hover{border-color:var(--blu);background:var(--blubg)}
    .sg-depth-card--on{border-color:var(--blu);background:var(--blubg)}
    .sg-depth-card--on strong{color:var(--blu)}

    /* ACTIONS */
    .sg-actions{display:flex;flex-direction:column;align-items:flex-start;gap:10px}
    .sg-actions--row{flex-direction:row;justify-content:space-between;align-items:center}
    .sg-hint{font-size:12px;color:var(--k4)}

    /* BUTTONS */
    .sg-btn{display:inline-flex;align-items:center;gap:6px;border:none;border-radius:var(--rs);font-family:'Plus Jakarta Sans',sans-serif;font-weight:600;cursor:pointer;transition:all .15s;white-space:nowrap}
    .sg-btn--primary{background:var(--blu);color:#fff;padding:11px 22px;font-size:14px;box-shadow:0 2px 8px rgba(37,99,235,.25)}
    .sg-btn--primary:hover:not(:disabled){background:var(--bluh);box-shadow:0 4px 16px rgba(37,99,235,.35);transform:translateY(-1px)}
    .sg-btn--lg{padding:13px 28px;font-size:15px}
    .sg-btn--xl{width:100%;justify-content:center;padding:15px;font-size:16px;border-radius:12px;background:linear-gradient(135deg,var(--blu),#7C3AED);box-shadow:0 4px 20px rgba(37,99,235,.3)}
    .sg-btn--xl:hover:not(:disabled){box-shadow:0 6px 28px rgba(37,99,235,.4);transform:translateY(-1px)}
    .sg-btn--ghost{background:transparent;color:var(--k3);border:1.5px solid var(--bdr);padding:9px 18px;font-size:13px}
    .sg-btn--ghost:hover{border-color:var(--bdr2);color:var(--ink);background:var(--bg)}
    .sg-btn--sm{padding:7px 14px;font-size:12px}
    .sg-btn--off{opacity:.5;cursor:not-allowed;pointer-events:none}

    /* OUTLINE TOOLBAR */
    .sg-toolbar{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}
    .sg-count-row{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:600;color:var(--k2)}
    .sg-count-badge{width:28px;height:28px;border-radius:8px;background:var(--blu);color:#fff;display:flex;align-items:center;justify-content:center;font-family:'Plus Jakarta Sans',sans-serif;font-size:13px;font-weight:700}

    /* SLIDE LIST */
    .sg-list{display:flex;flex-direction:column;gap:8px;margin-bottom:32px}
    .sg-sc{display:flex;align-items:center;gap:12px;background:var(--sur);border:1.5px solid var(--bdr);border-radius:var(--r);padding:14px 16px;cursor:grab;transition:all .2s;box-shadow:var(--sh)}
    .sg-sc:hover{border-color:var(--bdr2);box-shadow:0 4px 12px rgba(0,0,0,.08);transform:translateY(-1px)}
    .sg-sc:active{cursor:grabbing}
    .sg-sn{width:28px;height:28px;border-radius:8px;background:var(--bg);border:1px solid var(--bdr);display:flex;align-items:center;justify-content:center;font-family:'Plus Jakarta Sans',sans-serif;font-size:12px;font-weight:700;color:var(--k3);flex-shrink:0}
    .sg-sb{flex:1;min-width:0}
    .sg-sti{width:100%;border:none;outline:none;background:transparent;font-family:'Plus Jakarta Sans',sans-serif;font-size:14px;font-weight:600;color:var(--ink);padding:0;margin-bottom:6px}
    .sg-sti:focus{color:var(--blu)}
    .sg-bullets-list{display:flex;flex-direction:column;gap:4px;margin-top:6px}
    .sg-bullet-line{display:flex;gap:6px;font-size:12px;color:var(--k3);line-height:1.45}
    .sg-bullet-dot{color:var(--blu);flex-shrink:0;font-size:10px;padding-top:2px}
    .sg-bullets-editable{display:flex;flex-direction:column;gap:5px;margin-top:8px}
    .sg-bullet-row{display:flex;align-items:center;gap:6px}
    .sg-bullet-inp{flex:1;border:none;border-bottom:1px solid transparent;background:transparent;font-size:12px;color:var(--k2);outline:none;padding:2px 0;transition:border-color .15s}
    .sg-bullet-inp:focus{border-bottom-color:var(--blu)}
    .sg-bullet-inp::placeholder{color:var(--k4)}
    .sg-bullet-rm{background:none;border:none;cursor:pointer;color:var(--k4);font-size:13px;line-height:1;transition:color .15s;width:18px;height:18px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
    .sg-bullet-rm:hover{color:var(--red)}
    .sg-bullet-add{align-self:flex-start;background:none;border:none;cursor:pointer;font-size:11px;color:var(--blu);padding:0;margin-top:2px;font-weight:600;transition:opacity .15s}
    .sg-bullet-add:hover{opacity:.7}
    .sg-img-type-row{display:flex;align-items:center;gap:10px;margin-top:10px;padding-top:10px;border-top:1px solid var(--bdr)}
    .sg-img-type-label{font-size:11px;font-weight:600;color:var(--k4);white-space:nowrap;font-family:'Plus Jakarta Sans',sans-serif}
    .sg-img-type-pills{display:flex;gap:5px;flex-wrap:wrap}
    .sg-img-pill{padding:4px 10px;border-radius:20px;border:1.5px solid var(--bdr);background:white;cursor:pointer;font-size:11px;font-weight:500;color:var(--k3);transition:all .15s;display:flex;align-items:center;gap:4px}
    .sg-img-pill:hover{border-color:var(--blu);color:var(--blu);background:var(--blubg)}
    .sg-img-pill--on{border-color:var(--blu);background:var(--blu);color:white}
    .sg-del{width:26px;height:26px;border-radius:6px;border:1px solid var(--bdr);background:#fff;cursor:pointer;color:var(--k4);font-size:16px;display:flex;align-items:center;justify-content:center;transition:all .15s;flex-shrink:0}
    .sg-del:hover{border-color:var(--red);color:var(--red);background:var(--redbg)}

    /* DESIGN */
    .sg-design-wrap{display:grid;grid-template-columns:1fr 300px;gap:24px;align-items:start}
    .sg-dl{display:flex;flex-direction:column;gap:10px}
    .sg-dr{position:sticky;top:80px;display:flex;flex-direction:column;gap:14px}

    /* SECTION */
    .sg-sec{background:var(--sur);border:1.5px solid var(--bdr);border-radius:var(--r);padding:20px;box-shadow:var(--sh)}
    .sg-sec-title{display:flex;align-items:center;gap:8px;font-family:'Plus Jakarta Sans',sans-serif;font-size:14px;font-weight:700;color:var(--ink);margin-bottom:16px}
    .sg-sublbl{font-size:12px;font-weight:600;color:var(--k3);font-family:'Plus Jakarta Sans',sans-serif;margin-bottom:8px;letter-spacing:.02em}

    /* THEMES */
    .sg-themes{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}
    .sg-tc{border-radius:8px;overflow:hidden;border:2px solid var(--bdr);cursor:pointer;background:none;position:relative;aspect-ratio:16/10;transition:all .2s;padding:0}
    .sg-tc:hover{transform:scale(1.04);border-color:var(--bdr2)}
    .sg-tc--on{border-color:var(--blu);box-shadow:0 0 0 3px rgba(37,99,235,.2)}
    .sg-ts{width:100%;height:calc(100% - 20px);display:flex}
    .sg-tn{position:absolute;bottom:0;left:0;right:0;font-size:9px;font-weight:700;text-align:center;padding:3px 4px;background:rgba(0,0,0,.55);color:#fff;font-family:'Plus Jakarta Sans',sans-serif;letter-spacing:.04em}
    .sg-tck{position:absolute;top:4px;right:4px;width:16px;height:16px;border-radius:50%;background:var(--blu);color:#fff;font-size:9px;font-weight:700;display:flex;align-items:center;justify-content:center}

    /* DENSITY PILLS */
    .sg-density-pills{display:flex;gap:8px}
    .sg-dp{flex:1;padding:10px 6px;text-align:center;border:1.5px solid var(--bdr);border-radius:var(--rs);background:#fff;cursor:pointer;display:flex;flex-direction:column;gap:3px;transition:all .15s}
    .sg-dp strong{font-size:13px;font-weight:700;color:var(--k2);font-family:'Plus Jakarta Sans',sans-serif}
    .sg-dp span{font-size:10px;color:var(--k4)}
    .sg-dp:hover{border-color:var(--blu);background:var(--blubg)}
    .sg-dp--on{border-color:var(--blu);background:var(--blubg)}
    .sg-dp--on strong{color:var(--blu)}

    /* IMG */
    .sg-src-row{display:flex;gap:8px}
    .sg-srcbtn{flex:1;padding:8px 4px;text-align:center;border:1.5px solid var(--bdr);border-radius:var(--rs);background:#fff;cursor:pointer;font-size:12px;font-weight:500;color:var(--k2);transition:all .15s}
    .sg-srcbtn:hover{border-color:var(--blu);color:var(--blu);background:var(--blubg)}
    .sg-srcbtn--on{border-color:var(--blu);background:var(--blu);color:#fff}
    .sg-style-g{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
    .sg-stbtn{padding:8px 6px;border-radius:var(--rs);border:1.5px solid var(--bdr);background:#fff;cursor:pointer;font-size:12px;font-weight:500;color:var(--k2);display:flex;align-items:center;justify-content:center;gap:5px;transition:all .15s}
    .sg-stbtn:hover{border-color:var(--grn);color:var(--grn);background:var(--grnbg)}
    .sg-stbtn--on{border-color:var(--grn);background:var(--grnbg);color:#059669;font-weight:600}
    .sg-cb-row{display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;color:var(--k2)}
    .sg-cb-row input{width:15px;height:15px;accent-color:var(--blu);cursor:pointer}
    .sg-toggle-row{display:flex;align-items:center;justify-content:space-between;gap:16px}
    .sg-provider-cards{display:flex;flex-direction:column;gap:8px;margin-top:4px}
    .sg-provider-card{display:flex;align-items:center;gap:12px;padding:12px 14px;border:1.5px solid var(--bdr);border-radius:var(--rs);background:white;cursor:pointer;text-align:left;transition:all .2s;width:100%}
    .sg-provider-card:hover{border-color:var(--blu);background:var(--blubg)}
    .sg-provider-card--on{border-color:var(--blu);background:var(--blubg)}
    .sg-provider-icon{font-size:22px;flex-shrink:0}
    .sg-provider-info{flex:1;display:flex;flex-direction:column;gap:2px}
    .sg-provider-info strong{font-size:13px;font-weight:700;color:var(--ink);font-family:'Plus Jakarta Sans',sans-serif}
    .sg-provider-info span{font-size:11px;color:var(--k3)}
    .sg-provider-tag{display:inline-block;padding:1px 6px;border-radius:4px;font-size:10px;font-weight:700;letter-spacing:.04em;font-family:'Plus Jakarta Sans',sans-serif;margin-top:2px}
    .sg-provider-tag--free{background:var(--grnbg);color:#059669}
    .sg-provider-tag--key{background:var(--ambbg);color:#92400E}
    .sg-provider-check{font-size:14px;color:var(--blu);font-weight:700;flex-shrink:0}
    .sg-img-count-note{display:flex;align-items:flex-start;gap:6px;margin-top:12px;padding:10px 12px;background:var(--blubg);border:1px solid #BFDBFE;border-radius:8px;font-size:12px;color:var(--k2);line-height:1.5}

    /* ADVANCED */
    .sg-adv{background:var(--sur);border:1.5px solid var(--bdr);border-radius:var(--r);overflow:hidden;box-shadow:var(--sh)}
    .sg-adv-hd{width:100%;padding:14px 20px;display:flex;align-items:center;justify-content:space-between;background:transparent;border:none;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;font-size:14px;font-weight:600;color:var(--k2);transition:background .15s}
    .sg-adv-hd:hover{background:var(--bg)}
    .sg-adv-arr{font-size:14px;color:var(--k4);transition:transform .2s}
    .sg-adv-arr--open{transform:rotate(180deg)}
    .sg-adv-body{padding:4px 20px 16px;border-top:1px solid var(--bdr)}
    .sg-adv-row{display:flex;align-items:center;justify-content:space-between;padding:11px 0;cursor:pointer;border-bottom:1px solid var(--bdr)}
    .sg-adv-row:last-child{border-bottom:none}
    .sg-adv-lbl{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--k2);font-weight:500}
    .sg-tog{width:40px;height:22px;border-radius:11px;background:var(--bdr2);border:none;cursor:pointer;position:relative;transition:background .2s;flex-shrink:0}
    .sg-tog--on{background:var(--blu)}
    .sg-tog::after{content:'';position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.2);transition:transform .2s cubic-bezier(.34,1.56,.64,1)}
    .sg-tog--on::after{transform:translateX(18px)}

    /* PREVIEW */
    .sg-prev{border-radius:var(--r);overflow:hidden;border:1.5px solid var(--bdr);box-shadow:var(--sh)}
    .sg-prev-hd{background:#1E2430;padding:9px 14px;display:flex;align-items:center;gap:6px}
    .sg-dot{width:10px;height:10px;border-radius:50%}
    .sg-dot--r{background:#FF5F57}
    .sg-dot--y{background:#FFBD2E}
    .sg-dot--g{background:#28C840}
    .sg-prev-lbl{font-size:10px;color:rgba(255,255,255,.3);margin-left:auto;font-family:'Plus Jakarta Sans',sans-serif;font-weight:700;letter-spacing:.06em;text-transform:uppercase}
    .sg-dpv{padding:12px;display:flex;flex-direction:column;gap:6px}
    .sg-ms{border-radius:6px;padding:10px 12px;transition:all .2s}

    /* CTA CARD */
    .sg-cta-card{background:var(--sur);border:1.5px solid var(--bdr);border-radius:var(--r);padding:20px;box-shadow:var(--sh);display:flex;flex-direction:column;gap:12px}
    .sg-cta-title{font-family:'Plus Jakarta Sans',sans-serif;font-size:15px;font-weight:700;color:var(--ink);line-height:1.3}
    .sg-cta-meta{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--k4)}
    .sg-credits{display:flex;align-items:center;justify-content:center;gap:5px;font-size:12px;color:var(--k3);background:var(--ambbg);border:1px solid #FDE68A;border-radius:8px;padding:8px}
    .sg-ok{display:flex;align-items:center;gap:10px;background:var(--grnbg);border:1px solid #A7F3D0;border-radius:8px;padding:12px;font-size:13px;color:#065F46;animation:fdin .3s ease}
    .sg-ok span{font-size:22px}
    .sg-err{background:var(--redbg);border:1px solid #FECACA;border-radius:8px;padding:12px;font-size:12px;color:#991B1B}
    .sg-back-btn{align-self:flex-start}

    /* DRAFT HEADER */
    .sg-draft-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px;gap:20px;flex-wrap:wrap}
    .sg-draft-eyebrow{display:flex;align-items:center;gap:10px;margin-bottom:4px}
    .sg-draft-meta{font-size:13px;color:var(--k3)}
    .sg-draft-actions{display:flex;gap:10px;align-items:center;flex-shrink:0}
    .sg-badge--draft{background:var(--ambbg);color:var(--amb);border:1px solid #FDE68A}
    .sg-badge--err{background:var(--redbg);color:var(--red)}

    /* DRAFT DECK */
    .sg-draft-deck{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:20px;margin-bottom:40px}

    /* DRAFT SLIDE CARD */
    .sg-draft-slide{border-radius:14px;padding:24px;min-height:220px;display:flex;flex-direction:column;gap:12px;box-shadow:0 4px 20px rgba(0,0,0,.12);transition:transform .2s,box-shadow .2s}
    .sg-draft-slide:hover{transform:translateY(-2px);box-shadow:0 8px 32px rgba(0,0,0,.18)}
    .sg-ds-num{font-family:'Plus Jakarta Sans',sans-serif;font-size:11px;font-weight:800;letter-spacing:.1em}
    .sg-ds-title{font-family:'Plus Jakarta Sans',sans-serif;font-size:18px;font-weight:700;line-height:1.3}
    .sg-ds-bullets{list-style:none;padding:0;display:flex;flex-direction:column;gap:6px}
    .sg-ds-bullet{font-size:13px;line-height:1.5;padding-left:14px;position:relative}
    .sg-ds-bullet::before{content:'▸';position:absolute;left:0;font-size:10px;opacity:.6}
    .sg-ds-examples{margin-top:4px}
    .sg-ds-examples-label{font-size:10px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;margin-bottom:4px}
    .sg-ds-example{font-size:12px;font-style:italic;margin-bottom:3px}
    .sg-ds-exercise{margin-top:auto;padding:10px 14px;border-left:3px solid;border-radius:0 8px 8px 0;background:rgba(255,255,255,.12)}
    .sg-ds-exercise-label{font-size:11px;font-weight:700;display:block;margin-bottom:4px}
    .sg-ds-notes{background:rgba(0,0,0,.15);border-radius:8px;padding:10px 12px;font-size:12px;color:rgba(255,255,255,.6)}
    .sg-ds-notes-label{font-weight:700;display:block;margin-bottom:4px}
    .sg-img-skeleton{height:140px;border-radius:8px;background:rgba(255,255,255,.1);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;margin-bottom:12px}
    .sg-img-shimmer{width:40px;height:40px;border-radius:50%;border:3px solid rgba(255,255,255,.2);border-top-color:rgba(255,255,255,.7);animation:sp .8s linear infinite}
    .sg-img-error-badge{padding:5px 10px;border-radius:6px;font-size:11px;background:rgba(0,0,0,.15);color:rgba(255,255,255,.5);margin-bottom:8px;display:inline-block}
    .sg-img-block{border-radius:10px;overflow:hidden;margin-bottom:12px;background:rgba(255,255,255,.08)}
    .sg-img-block--svg{padding:0;overflow:hidden;border-radius:10px;background:white}
    .sg-img-block--svg svg{width:100%;height:auto;display:block}
    .sg-img-photo{width:100%;height:160px;object-fit:cover;display:block}

    /* FOOTER */
    .sg-draft-footer{display:flex;justify-content:space-between;align-items:center;padding-top:24px;border-top:1px solid var(--bdr);flex-wrap:wrap;gap:12px}

    /* IMAGE STREAM PROGRESS BANNER */
    .sg-img-progress-wrap{margin-top:12px;padding:10px 14px;background:var(--blubg);border:1px solid #BFDBFE;border-radius:10px;display:flex;flex-direction:column;gap:6px}
    .sg-img-progress-row{display:flex;align-items:center;justify-content:space-between;gap:8px}
    .sg-img-progress-label{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--k2);font-weight:500}
    .sg-img-progress-pct{font-size:12px;font-weight:700;color:var(--blu);white-space:nowrap}
    .sg-img-progress-track{height:5px;border-radius:99px;background:rgba(37,99,235,.15);overflow:hidden}
    .sg-img-progress-fill{height:100%;border-radius:99px;background:var(--blu);transition:width .4s cubic-bezier(.4,0,.2,1)}
    .sg-img-progress-spin{width:14px;height:14px;border-radius:50%;border:2px solid rgba(37,99,235,.2);border-top-color:var(--blu);animation:sp .7s linear infinite;flex-shrink:0}

    /* SPINNER */
    .sg-spin{width:16px;height:16px;border-radius:50%;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;animation:sp .65s linear infinite;flex-shrink:0}
    @keyframes sp{to{transform:rotate(360deg)}}

    /* RESPONSIVE */
    @media(max-width:900px){
      .sg-design-wrap{grid-template-columns:1fr}
      .sg-dr{position:static}
      .sg-themes{grid-template-columns:repeat(3,1fr)}
      .sg-depth-row{grid-template-columns:repeat(2,1fr)}
    }
    @media(max-width:640px){
      .sg-main{padding:24px 16px 60px}
      .sg-h1{font-size:22px}
      .sg-grid{grid-template-columns:1fr}
      .sg-depth-row{grid-template-columns:repeat(2,1fr)}
      .sg-stepper{padding:14px 16px;overflow-x:auto}
      .sg-node-text{display:none}
      .sg-density-pills{flex-wrap:wrap}
      .sg-src-row{flex-wrap:wrap}
      .sg-draft-deck{grid-template-columns:1fr}
      .sg-draft-header{flex-direction:column}
      .sg-draft-footer{flex-direction:column-reverse}
    }
  `}</style>;
}