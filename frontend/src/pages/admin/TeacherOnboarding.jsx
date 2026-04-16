/**
 * TeacherOnboardingPage.jsx
 *
 * ── Architecture ──────────────────────────────────────────────────────────
 *
 *   TeacherOnboardingPage          ← top-level entry point
 *     phase: "setup" | "builder"
 *     │
 *     ├── SetupFlow                ← setup phase
 *     │     Internal steps: welcome → language → level → options → outline
 *     │     onComplete({ outline, courseData, uploadedFiles }) → flips phase
 *     │
 *     └── CourseBuilderWorkspace   ← builder phase
 *           Thin shell; owns publish + receives all setup output.
 *           Renders CourseBuildScreen.
 *
 * ── Generation rules (NEVER a full-course single request) ─────────────────
 *   Step 1  CourseOutlineScreen   → generateCourseOutline()
 *             Returns: title · description · modules · lesson stubs ONLY
 *             (no slides, no tasks, no test)
 *
 *   Step 2  CourseBuildScreen     → generateLessonContent(lessonId)
 *             Generates ONE lesson at a time: slides + tasks + test
 *             RAG pipeline consulted when teacher-uploaded unit materials exist
 *
 * ── State shape (CourseBuildScreen) ───────────────────────────────────────
 *   {
 *     outline:                CourseOutline | null,
 *     currentLessonId:        string | null,
 *     generatedLessons:       { [lessonId]: { slides, tasks, test, savedAt } },
 *     lessonGenerationStatus: { [lessonId]: "pending"|"generating"|"done"|"error" },
 *     lessonSources:          { [lessonId]: { hasRAG, chunkCount, sources, checked } },
 *   }
 *
 * ── Terminology ───────────────────────────────────────────────────────────
 *   "Tasks" (never "Exercises")   •   "Test" (never "Quiz"/"Quizzes")
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import SlideEditorPage from "./SlideEditorPage";

/* ─── ID factory ─────────────────────────────────────────────────────────── */
const uid = () => Math.random().toString(36).slice(2, 10);

/* ─── Design tokens ──────────────────────────────────────────────────────── */
export const T = {
  violet:  "#6C35DE", violetL: "#EDE9FF", violetD: "#4F23B0",
  pink:    "#F0447C", pinkL:   "#FDE8F0",
  lime:    "#0DB85E", limeL:   "#DCFCE7",
  sky:     "#0099E6", skyL:    "#DAEEFF",
  amber:   "#F5A623", amberL:  "#FEF3C7",
  orange:  "#F76D3C", orangeL: "#FFECE5",
  teal:    "#00BCD4", tealL:   "#E0F7FA",
  white:   "#FFFFFF",
  bg:      "#F7F6FF",
  border:  "#E5DEFF",
  text:    "#1A1035",
  sub:     "#5C5490",
  muted:   "#9188C4",
  mutedL:  "#CFC9EE",
  green:   "#16A34A", greenL:  "#DCFCE7",
  red:     "#EF4444", redL:    "#FEE2E2",
  dFont:   "'Nunito', system-ui, sans-serif",
  bFont:   "'Inter', system-ui, sans-serif",
};

/* ─── Module gradient palette ────────────────────────────────────────────── */
const MODULE_GRADS = [
  "linear-gradient(135deg,#6C35DE,#F0447C)",
  "linear-gradient(135deg,#0099E6,#6C35DE)",
  "linear-gradient(135deg,#0DB85E,#0099E6)",
  "linear-gradient(135deg,#F5A623,#F76D3C)",
  "linear-gradient(135deg,#F0447C,#F76D3C)",
  "linear-gradient(135deg,#00BCD4,#0DB85E)",
  "linear-gradient(135deg,#F76D3C,#F5A623)",
  "linear-gradient(135deg,#9333EA,#0099E6)",
];

/* ─── Per-step left-panel config ─────────────────────────────────────────── */
const PANEL = {
  language: {
    grad: "linear-gradient(160deg,#0099E6 0%,#6C35DE 100%)",
    emoji: "🗣️", heading: "Choose your\nteaching language",
    sub: "Your course will be built around this language.",
    accent: "#0099E6", orbs: ["#4FC3F7","#CE93D8","#80DEEA","#9FA8DA"],
  },
  level: {
    grad: "linear-gradient(160deg,#0DB85E 0%,#0099E6 100%)",
    emoji: "🎯", heading: "Tell us about\nyour students",
    sub: "AI tailors vocabulary and pace to their level.",
    accent: "#0DB85E", orbs: ["#A5D6A7","#80DEEA","#C8E6C9","#B2EBF2"],
  },
  options: {
    grad: "linear-gradient(160deg,#F5A623 0%,#F0447C 100%)",
    emoji: "✨", heading: "Final\ncourse options",
    sub: "Add materials and customise the structure.",
    accent: "#F5A623", orbs: ["#FFCC80","#F48FB1","#FFAB91","#CE93D8"],
  },
};

/* ─── Fonts ──────────────────────────────────────────────────────────────── */
export const FontLoader = () => (
  <style>{`@import url('https://fonts.googleapis.com/css2?family=Nunito:wght@700;800;900&family=Inter:wght@400;500;600;700&display=swap');`}</style>
);

/* ─── LocalStorage helpers ───────────────────────────────────────────────── */
const draftKey  = (key) => `ob_build_v1_${key}`;
const loadDraft = (key) => {
  try { return JSON.parse(localStorage.getItem(draftKey(key)) || "null"); } catch { return null; }
};
const saveDraft  = (key, payload) => {
  try { localStorage.setItem(draftKey(key), JSON.stringify({ ...payload, _ts: Date.now() })); } catch { /* quota */ }
};
const clearDraft = (key) => { try { localStorage.removeItem(draftKey(key)); } catch { /* ignore */ } };

/* ─── Global CSS ─────────────────────────────────────────────────────────── */
export const GlobalStyles = () => (
  <style>{`
    *,*::before,*::after { box-sizing:border-box; margin:0; padding:0 }
    html,body { height:100% }
    body { background:${T.bg}; color:${T.text}; font-family:${T.bFont} }

    @keyframes fadeUp    { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
    @keyframes fadeIn    { from{opacity:0} to{opacity:1} }
    @keyframes popIn     { from{opacity:0;transform:scale(.7) rotate(-6deg)} to{opacity:1;transform:scale(1) rotate(0)} }
    @keyframes slideR    { from{opacity:0;transform:translateX(44px)} to{opacity:1;transform:translateX(0)} }
    @keyframes slideL    { from{opacity:0;transform:translateX(-44px)} to{opacity:1;transform:translateX(0)} }
    @keyframes spin      { to{transform:rotate(360deg)} }
    @keyframes float     { 0%,100%{transform:translateY(0) rotate(0)} 50%{transform:translateY(-14px) rotate(5deg)} }
    @keyframes floatB    { 0%,100%{transform:translateY(0) rotate(0)} 50%{transform:translateY(-9px) rotate(-4deg)} }
    @keyframes drift     { 0%,100%{transform:translate(0,0)} 33%{transform:translate(12px,-8px)} 66%{transform:translate(-8px,10px)} }
    @keyframes shimmer   { 0%{background-position:-600px 0} 100%{background-position:600px 0} }
    @keyframes bounceBtn { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-4px)} }
    @keyframes rotateSlow{ from{transform:rotate(0)} to{transform:rotate(360deg)} }
    @keyframes pulse     { 0%,100%{transform:scale(1)} 50%{transform:scale(1.06)} }
    @keyframes ragPulse  { 0%,100%{opacity:.8;transform:scale(1)} 50%{opacity:1;transform:scale(1.03)} }
    @keyframes saveFlash { 0%{opacity:0;transform:translateY(4px)} 15%{opacity:1;transform:translateY(0)} 80%{opacity:1} 100%{opacity:0} }

    /* ── Phase transition animations ── */
    @keyframes phaseEnter {
      from { opacity:0; transform:translateY(18px) scale(.985); filter:blur(2px); }
      to   { opacity:1; transform:none; filter:none; }
    }
    @keyframes phaseExit {
      from { opacity:1; transform:scale(1);    filter:blur(0); }
      to   { opacity:0; transform:scale(.985); filter:blur(2px); }
    }
    .phase-enter  { animation: phaseEnter .52s cubic-bezier(.22,.68,0,1.15) both; }
    .phase-exit   { animation: phaseExit  .28s ease-in both; pointer-events:none; }
    .phase-fill   { flex:1; min-height:0; display:flex; flex-direction:column; }
    .phase-scroll { flex:1; min-height:0; overflow-y:auto; }

    .enter { animation:slideR .42s cubic-bezier(.22,.68,0,1.2) both }
    .back  { animation:slideL .42s cubic-bezier(.22,.68,0,1.2) both }

    .shimmer {
      background:linear-gradient(90deg,#EDE9FF 25%,#F5F3FF 50%,#EDE9FF 75%);
      background-size:600px 100%;
      animation:shimmer 1.6s infinite linear;
      border-radius:8px;
    }

    textarea { resize:vertical }
    input::placeholder,textarea::placeholder { color:${T.mutedL} }

    .lang-card { cursor:pointer;border-radius:22px;position:relative;overflow:hidden;transition:all .22s cubic-bezier(.22,.68,0,1.3);user-select:none;border:4px solid transparent }
    .lang-card:hover { transform:translateY(-6px) scale(1.03) }
    .lang-card.sel   { border-color:white;transform:translateY(-6px) scale(1.03) }

    .lvl-chip { cursor:pointer;border-radius:14px;padding:13px 6px;text-align:center;transition:all .18s cubic-bezier(.22,.68,0,1.2);user-select:none;flex:1;min-width:0;border:3px solid transparent }
    .lvl-chip:hover { transform:translateY(-3px) scale(1.04) }
    .lvl-chip.sel   { transform:translateY(-3px) scale(1.06);border-color:white }

    .cnt-btn { cursor:pointer;border-radius:11px;padding:10px 8px;text-align:center;flex:1;font-family:${T.dFont};font-size:17px;font-weight:900;color:${T.sub};transition:all .18s cubic-bezier(.22,.68,0,1.2);background:white;border:3px solid ${T.border} }
    .cnt-btn:hover { border-color:${T.violet};color:${T.violet};transform:translateY(-2px) }
    .cnt-btn.sel   { background:linear-gradient(135deg,${T.violet},${T.pink});border-color:transparent;color:white;transform:translateY(-2px);box-shadow:0 8px 20px ${T.violet}44 }

    .upload-zone { border:3px dashed ${T.border};border-radius:16px;padding:16px;text-align:center;cursor:pointer;transition:all .2s;background:${T.bg} }
    .upload-zone:hover,.upload-zone.drag { border-color:${T.violet};background:${T.violetL};transform:scale(1.01) }

    .btn         { border:none;border-radius:14px;padding:12px 24px;font-family:${T.dFont};font-size:15px;font-weight:800;cursor:pointer;display:inline-flex;align-items:center;gap:8px;transition:all .18s }
    .btn-sm      { padding:9px 16px;font-size:13px;border-radius:11px;font-weight:700 }
    .btn-xs      { padding:6px 13px;font-size:12px;border-radius:9px;font-weight:700 }
    .btn-p       { background:${T.violet};color:#fff;box-shadow:0 4px 16px ${T.violet}44 }
    .btn-p:hover { background:${T.violetD};transform:translateY(-2px);box-shadow:0 10px 28px ${T.violet}55 }
    .btn-p:active{ transform:translateY(0) }
    .btn-p:disabled { opacity:.4;cursor:not-allowed;transform:none;box-shadow:none }
    .btn-white   { background:rgba(255,255,255,.22);color:white;font-weight:700;border:2px solid rgba(255,255,255,.4);backdrop-filter:blur(4px) }
    .btn-white:hover { background:rgba(255,255,255,.35) }
    .btn-outline { background:white;border:3px solid ${T.border};color:${T.text};font-weight:700 }
    .btn-outline:hover { border-color:${T.violet};color:${T.violet};background:${T.violetL} }

    .build-lesson-row { display:flex;align-items:center;gap:10px;padding:9px 14px;cursor:pointer;transition:all .15s;border-left:3px solid transparent }
    .build-lesson-row:hover  { background:${T.bg} }
    .build-lesson-row.active { background:${T.violetL};border-left-color:${T.violet} }

    .rag-badge       { display:inline-flex;align-items:center;gap:4px;padding:3px 9px;border-radius:999px;font-size:10px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;background:rgba(0,188,212,.1);color:#00838F;border:1.5px solid rgba(0,188,212,.3);white-space:nowrap;flex-shrink:0 }
    .rag-badge--live { animation:ragPulse 2.2s ease-in-out infinite }

    .save-toast { position:fixed;bottom:24px;right:24px;background:#1A1035;color:#fff;padding:10px 18px;border-radius:12px;font-size:13px;font-weight:700;display:flex;align-items:center;gap:8px;animation:saveFlash 2.4s ease both;pointer-events:none;z-index:9999 }

    ::-webkit-scrollbar { width:4px;height:4px }
    ::-webkit-scrollbar-track { background:transparent }
    ::-webkit-scrollbar-thumb { background:${T.border};border-radius:999px }
  `}</style>
);


/* ═══════════════════════════════════════════════════════════════════════════
   SHARED MICRO-COMPONENTS
   ═══════════════════════════════════════════════════════════════════════════ */

const ShimmerRow = ({ width = "100%", height = 14, mt = 8 }) => (
  <div className="shimmer" style={{ height, width, marginTop: mt, borderRadius: 8 }} />
);

const RAGBadge = ({ chunkCount, live = false }) => (
  <span className={`rag-badge${live ? " rag-badge--live" : ""}`}>
    📚 {chunkCount ? `${chunkCount} chunks` : "Materials"} available
  </span>
);

/* ─── Left decorative panel ──────────────────────────────────────────────── */
const LeftPanel = ({ cfg }) => (
  <div style={{ width: "42%", flexShrink: 0, background: cfg.grad, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: "48px 40px", position: "relative", overflow: "hidden", minHeight: "100vh" }}>
    {cfg.orbs.map((c, i) => (
      <div key={i} style={{ position: "absolute", width: [160,120,200,100][i], height: [160,120,200,100][i], borderRadius: "50%", background: c, opacity: .25, left: ["-5%","65%","-10%","55%"][i], top: ["5%","10%","55%","62%"][i], filter: "blur(2px)", animation: `drift ${9+i*2}s ease-in-out infinite ${i*1.5}s`, pointerEvents: "none" }} />
    ))}
    <div style={{ position: "absolute", width: 420, height: 420, borderRadius: "50%", border: "2px solid rgba(255,255,255,.12)", top: "50%", left: "50%", transform: "translate(-50%,-50%)", animation: "rotateSlow 30s linear infinite", pointerEvents: "none" }} />
    <div style={{ position: "absolute", width: 260, height: 260, borderRadius: "50%", border: "2px solid rgba(255,255,255,.10)", top: "50%", left: "50%", transform: "translate(-50%,-50%)", animation: "rotateSlow 18s linear infinite reverse", pointerEvents: "none" }} />
    <div style={{ fontSize: 96, lineHeight: 1, marginBottom: 28, filter: "drop-shadow(0 14px 32px rgba(0,0,0,.28))", animation: "float 4s ease-in-out infinite", position: "relative", zIndex: 1 }}>{cfg.emoji}</div>
    <h2 style={{ fontFamily: T.dFont, fontWeight: 900, fontSize: "clamp(22px,2.8vw,30px)", color: "#fff", textAlign: "center", lineHeight: 1.2, marginBottom: 14, whiteSpace: "pre-line", position: "relative", zIndex: 1, textShadow: "0 2px 14px rgba(0,0,0,.2)" }}>{cfg.heading}</h2>
    <p style={{ fontSize: 14, color: "rgba(255,255,255,.80)", textAlign: "center", lineHeight: 1.7, maxWidth: 230, position: "relative", zIndex: 1 }}>{cfg.sub}</p>
    <div style={{ position: "absolute", bottom: 32, display: "flex", gap: 8 }}>
      {["language","level","options"].map(k => (
        <div key={k} style={{ height: 6, borderRadius: 999, width: cfg === PANEL[k] ? 28 : 8, background: cfg === PANEL[k] ? "#fff" : "rgba(255,255,255,.35)", transition: "all .3s" }} />
      ))}
    </div>
  </div>
);

export const Shell = ({ children, stepKey, wide }) => {
  const cfg = PANEL[stepKey];
  return (
    <div style={{ minHeight: "100vh", display: "flex" }}>
      <LeftPanel cfg={cfg} />
      <div style={{ flex: 1, background: "#fff", display: "flex", flexDirection: "column", justifyContent: "center", padding: "48px clamp(24px,4vw,64px)", overflowY: "auto" }}>
        <div style={{ maxWidth: wide ? 500 : 440, width: "100%" }}>{children}</div>
      </div>
    </div>
  );
};

export const StepBar = ({ current, total }) => {
  const labels = ["Language","Level","Options","Generate"];
  const clrs   = [T.sky, T.lime, T.amber, T.violet];
  const active = clrs[current-1] || T.violet;
  return (
    <div style={{ marginBottom: 30 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontSize: 11, color: T.muted, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase" }}>Step {current} / {total}</span>
        <span style={{ fontSize: 11, fontWeight: 800, fontFamily: T.dFont, background: active, color: "#fff", padding: "3px 12px", borderRadius: 999 }}>{labels[current-1]}</span>
      </div>
      <div style={{ height: 8, background: T.border, borderRadius: 999, overflow: "hidden", marginBottom: 14 }}>
        <div style={{ height: "100%", borderRadius: 999, background: `linear-gradient(90deg,${active},${active}cc)`, width: `${(current/total)*100}%`, transition: "width .5s cubic-bezier(.22,.68,0,1.2)", boxShadow: `0 0 10px ${active}88` }} />
      </div>
      <div style={{ display: "flex", alignItems: "center" }}>
        {labels.map((l, i) => {
          const done = i+1 < current; const isCur = i+1 === current;
          return (
            <div key={l} style={{ display: "flex", alignItems: "center", flex: i < labels.length-1 ? 1 : "none" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                <div style={{ width: 26, height: 26, borderRadius: "50%", background: done ? T.green : isCur ? active : T.border, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 900, color: "#fff", boxShadow: isCur ? `0 0 0 4px ${active}28` : "none", transform: isCur ? "scale(1.18)" : "scale(1)", transition: "all .3s", fontFamily: T.dFont, flexShrink: 0 }}>{done ? "✓" : i+1}</div>
                <span style={{ fontSize: 10, fontWeight: 700, color: isCur ? active : T.mutedL, whiteSpace: "nowrap" }}>{l}</span>
              </div>
              {i < labels.length-1 && <div style={{ flex: 1, height: 2, background: i+1 < current ? T.green : T.border, margin: "0 4px 14px", borderRadius: 999, transition: "background .4s" }} />}
            </div>
          );
        })}
      </div>
    </div>
  );
};


/* ═══════════════════════════════════════════════════════════════════════════
   WELCOME SCREEN
   ═══════════════════════════════════════════════════════════════════════════ */
const WelcomeScreen = ({ name, onContinue }) => {
  const [p, setP] = useState(0);
  useEffect(() => {
    const ts = [150,650,1250,1850].map((d, i) => setTimeout(() => setP(i+1), d));
    return () => ts.forEach(clearTimeout);
  }, []);

  const features = [
    { emoji: "📚", label: "AI course builder",   grad: "linear-gradient(135deg,#6C35DE,#F0447C)" },
    { emoji: "🧠", label: "Auto test generator", grad: "linear-gradient(135deg,#0099E6,#00BCD4)" },
    { emoji: "📊", label: "Live analytics",       grad: "linear-gradient(135deg,#0DB85E,#0099E6)" },
    { emoji: "🚀", label: "Lesson by lesson",     grad: "linear-gradient(135deg,#F5A623,#F76D3C)" },
  ];
  const floaters = [
    { e:"📖",x:"6%", y:"10%",s:38,a:0   }, { e:"✏️",x:"87%",y:"13%",s:30,a:.7  },
    { e:"🎓",x:"3%", y:"64%",s:42,a:1.3 }, { e:"⭐",x:"91%",y:"68%",s:26,a:.4  },
    { e:"💡",x:"47%",y:"4%", s:32,a:.9  }, { e:"🌍",x:"13%",y:"85%",s:34,a:1.6 },
    { e:"📝",x:"82%",y:"82%",s:28,a:.2  }, { e:"🏆",x:"76%",y:"40%",s:30,a:1.1 },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#6C35DE 0%,#F0447C 48%,#F76D3C 100%)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, position: "relative", overflow: "hidden" }}>
      {[700,500,300].map((s,i) => <div key={i} style={{ position: "fixed", width: s, height: s, borderRadius: "50%", border: `${2-i*.5}px solid rgba(255,255,255,.07)`, top: "50%", left: "50%", transform: "translate(-50%,-50%)", animation: `rotateSlow ${40-i*8}s linear infinite ${i%2?"reverse":""}`, pointerEvents: "none" }} />)}
      {floaters.map((f,i) => <div key={i} style={{ position: "fixed", left: f.x, top: f.y, fontSize: f.s, opacity: p>=3 ? .75 : 0, transition: `opacity .7s ${i*.08}s`, animation: p>=3 ? `${i%2?"floatB":"float"} ${3.2+i*.4}s ease-in-out infinite ${f.a}s` : "none", pointerEvents: "none", userSelect: "none", filter: "drop-shadow(0 4px 12px rgba(0,0,0,.22))" }}>{f.e}</div>)}
      <div style={{ position: "relative", zIndex: 1, width: "100%", maxWidth: 560, background: "rgba(255,255,255,.94)", borderRadius: 36, padding: "52px 44px", boxShadow: "0 40px 100px rgba(0,0,0,.26)", textAlign: "center", opacity: p>=1 ? 1 : 0, transform: p>=1 ? "translateY(0)" : "translateY(36px)", transition: "all .8s cubic-bezier(.22,.68,0,1.2)" }}>
        <div style={{ width: 100, height: 100, borderRadius: 32, background: "linear-gradient(135deg,#6C35DE,#F0447C)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 28px", fontSize: 48, boxShadow: "0 16px 48px rgba(108,53,222,.5)", animation: p>=4 ? "float 4s ease-in-out infinite" : "none" }}>🎓</div>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "linear-gradient(90deg,#6C35DE,#F0447C)", borderRadius: 999, padding: "6px 18px", fontSize: 11, fontWeight: 800, color: "#fff", letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 16, fontFamily: T.dFont, opacity: p>=2 ? 1 : 0, transition: "opacity .5s .1s" }}>🎉 Welcome aboard</div>
        <div style={{ opacity: p>=2 ? 1 : 0, transform: p>=2 ? "none" : "translateY(20px)", transition: "all .6s .1s" }}>
          <h1 style={{ fontFamily: T.dFont, fontSize: "clamp(30px,5.5vw,46px)", fontWeight: 900, lineHeight: 1.08, color: T.text, marginBottom: 14 }}>
            Hi {name || "Teacher"},<br/>
            <span style={{ background: "linear-gradient(90deg,#6C35DE,#F0447C,#F76D3C)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>let's build! 🚀</span>
          </h1>
          <p style={{ color: T.sub, fontSize: 16, lineHeight: 1.7, maxWidth: 360, margin: "0 auto" }}>
            Create your first AI-powered course — <strong style={{ color: T.text }}>lesson by lesson</strong>, at your own pace.
          </p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, margin: "28px 0", opacity: p>=3 ? 1 : 0, transition: "opacity .5s .15s" }}>
          {features.map((f,i) => <div key={f.label} style={{ borderRadius: 18, padding: "18px 14px", background: f.grad, display: "flex", alignItems: "center", gap: 12, opacity: p>=3 ? 1 : 0, transform: p>=3 ? "scale(1)" : "scale(.84)", transition: `all .45s cubic-bezier(.22,.68,0,1.3) ${i*.07}s`, boxShadow: "0 4px 16px rgba(0,0,0,.14)" }}><span style={{ fontSize: 26 }}>{f.emoji}</span><span style={{ fontFamily: T.dFont, fontSize: 13, fontWeight: 800, color: "#fff", lineHeight: 1.3 }}>{f.label}</span></div>)}
        </div>
        <div style={{ opacity: p>=4 ? 1 : 0, transform: p>=4 ? "none" : "translateY(12px)", transition: "all .5s" }}>
          <button onClick={onContinue} style={{ width: "100%", border: "none", borderRadius: 18, background: "linear-gradient(135deg,#6C35DE,#F0447C)", color: "#fff", fontFamily: T.dFont, fontSize: 17, fontWeight: 900, padding: "18px 32px", cursor: "pointer", boxShadow: "0 12px 36px rgba(108,53,222,.5)", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, transition: "all .2s", animation: p>=4 ? "bounceBtn 2.5s ease-in-out infinite 2.5s" : "none" }}>Let's get started →</button>
          <p style={{ marginTop: 12, fontSize: 12, color: T.muted }}>Takes ~2 minutes · free to start</p>
        </div>
      </div>
    </div>
  );
};


/* ═══════════════════════════════════════════════════════════════════════════
   STEP 1 — LANGUAGE
   ═══════════════════════════════════════════════════════════════════════════ */
const LANGUAGES = [
  { label: "Italian", flag: "🇮🇹", grad: "linear-gradient(145deg,#0DB85E,#0099E6)", accent: "#0DB85E", sample: "Ciao!" },
  { label: "Spanish", flag: "🇪🇸", grad: "linear-gradient(145deg,#F76D3C,#F5A623)", accent: "#F76D3C", sample: "¡Hola!" },
  { label: "French",  flag: "🇫🇷", grad: "linear-gradient(145deg,#6C35DE,#F0447C)", accent: "#6C35DE", sample: "Bonjour!" },
  { label: "English", flag: "🇬🇧", grad: "linear-gradient(145deg,#0099E6,#00BCD4)", accent: "#0099E6", sample: "Hello!" },
];

const StepLanguage = ({ data, onChange, onNext, onBack, dir }) => (
  <Shell stepKey="language" wide>
    <div className={dir === "back" ? "back" : "enter"}>
      <StepBar current={1} total={4} />
      <h2 style={{ fontFamily: T.dFont, fontSize: 26, fontWeight: 900, marginBottom: 6 }}>What language do you teach?</h2>
      <p style={{ color: T.sub, marginBottom: 26, fontSize: 15 }}>Pick one — you can add more courses later.</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 30 }}>
        {LANGUAGES.map((l, i) => {
          const sel = data.subject === l.label;
          return (
            <div key={l.label} className={`lang-card ${sel ? "sel" : ""}`} onClick={() => onChange({ subject: l.label })} style={{ background: l.grad, boxShadow: sel ? `0 0 0 4px white,0 0 0 7px ${l.accent},0 16px 32px ${l.accent}44` : "0 4px 18px rgba(0,0,0,.15)", animation: `popIn .4s cubic-bezier(.22,.68,0,1.3) ${i*.07}s both` }}>
              {sel && <div style={{ position: "absolute", top: 12, right: 12, width: 26, height: 26, borderRadius: "50%", background: "rgba(255,255,255,.95)", color: l.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 900, animation: "popIn .2s both" }}>✓</div>}
              <div style={{ padding: "30px 16px 22px", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                <div style={{ width: 70, height: 70, borderRadius: "50%", background: "rgba(255,255,255,.22)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40 }}>{l.flag}</div>
                <span style={{ fontFamily: T.dFont, fontSize: 18, fontWeight: 900, color: "#fff", textShadow: "0 1px 8px rgba(0,0,0,.2)" }}>{l.label}</span>
                <span style={{ fontSize: 12, color: "rgba(255,255,255,.88)", fontStyle: "italic", fontWeight: 600, background: "rgba(255,255,255,.18)", borderRadius: 999, padding: "3px 12px" }}>{l.sample}</span>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <button className="btn btn-outline btn-sm" onClick={onBack}>← Back</button>
        <button className="btn btn-p" onClick={onNext} disabled={!data.subject} style={{ flex: 1, justifyContent: "center", background: "linear-gradient(135deg,#0099E6,#6C35DE)", boxShadow: "0 8px 24px rgba(108,53,222,.4)" }}>Continue →</button>
      </div>
    </div>
  </Shell>
);


/* ═══════════════════════════════════════════════════════════════════════════
   STEP 2 — LEVEL + NATIVE LANGUAGE
   ═══════════════════════════════════════════════════════════════════════════ */
const LEVELS   = ["A1","A2","B1","B2","C1","C2"];
const LEVEL_LB = { A1:"Beginner",A2:"Elementary",B1:"Intermediate",B2:"Upper-Int.",C1:"Advanced",C2:"Mastery" };
const LVL_G    = ["linear-gradient(135deg,#0DB85E,#0099E6)","linear-gradient(135deg,#22C55E,#0DB85E)","linear-gradient(135deg,#0099E6,#6C35DE)","linear-gradient(135deg,#6C35DE,#F0447C)","linear-gradient(135deg,#F0447C,#F76D3C)","linear-gradient(135deg,#F76D3C,#F5A623)"];
const LVL_A    = ["#0DB85E","#22C55E","#0099E6","#6C35DE","#F0447C","#F76D3C"];

const StepLevel = ({ data, onChange, onNext, onBack, dir }) => (
  <Shell stepKey="level">
    <div className={dir === "back" ? "back" : "enter"}>
      <StepBar current={2} total={4} />
      <h2 style={{ fontFamily: T.dFont, fontSize: 26, fontWeight: 900, marginBottom: 6 }}>Who are your students? 🎯</h2>
      <p style={{ color: T.sub, marginBottom: 24, fontSize: 15 }}>Helps AI set the right tone and vocabulary.</p>

      <div style={{ background: T.bg, borderRadius: 20, padding: 18, marginBottom: 16, border: `3px solid ${T.border}` }}>
        <p style={{ fontSize: 11, fontWeight: 800, color: T.muted, letterSpacing: ".12em", textTransform: "uppercase", marginBottom: 14, fontFamily: T.dFont }}>Proficiency level</p>
        <div style={{ display: "flex", gap: 8 }}>
          {LEVELS.map((lvl, i) => {
            const sel = data.level === lvl;
            return (
              <div key={lvl} className={`lvl-chip ${sel ? "sel" : ""}`} onClick={() => onChange({ level: lvl })} style={{ background: sel ? LVL_G[i] : "white", border: `3px solid ${sel ? LVL_A[i] : T.border}`, boxShadow: sel ? `0 0 0 3px white,0 0 0 5px ${LVL_A[i]},0 8px 20px ${LVL_A[i]}44` : "0 2px 8px rgba(0,0,0,.05)" }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: sel ? "rgba(255,255,255,.9)" : LVL_A[i], margin: "0 auto 6px" }} />
                <div style={{ fontFamily: T.dFont, fontSize: 15, fontWeight: 900, color: sel ? "#fff" : T.text }}>{lvl}</div>
                <div style={{ fontSize: 9, fontWeight: 700, color: sel ? "rgba(255,255,255,.8)" : T.muted }}>{LEVEL_LB[lvl]}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ background: T.bg, borderRadius: 20, padding: 18, marginBottom: 30, border: `3px solid ${T.border}` }}>
        <p style={{ fontSize: 11, fontWeight: 800, color: T.muted, letterSpacing: ".12em", textTransform: "uppercase", marginBottom: 16, fontFamily: T.dFont }}>Students' native language</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {[{lang:"English",flag:"🇬🇧",grad:"linear-gradient(135deg,#0099E6,#00BCD4)",acc:"#0099E6",note:"Instructions in English"},{lang:"Russian",flag:"🇷🇺",grad:"linear-gradient(135deg,#F0447C,#6C35DE)",acc:"#F0447C",note:"Объяснения на русском"}].map(({lang,flag,grad,acc,note}) => {
            const sel = data.nativeLanguage === lang;
            return (
              <div key={lang} onClick={() => onChange({ nativeLanguage: lang })} style={{ cursor: "pointer", borderRadius: 18, background: sel ? grad : "white", border: `3px solid ${sel ? acc : T.border}`, padding: "18px 14px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, transition: "all .22s cubic-bezier(.22,.68,0,1.2)", boxShadow: sel ? `0 0 0 3px white,0 0 0 5px ${acc},0 10px 24px ${acc}33` : "0 2px 8px rgba(0,0,0,.05)", transform: sel ? "translateY(-3px) scale(1.02)" : "none" }}>
                <div style={{ width: 52, height: 52, borderRadius: "50%", background: sel ? "rgba(255,255,255,.22)" : T.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>{flag}</div>
                <span style={{ fontFamily: T.dFont, fontSize: 16, fontWeight: 900, color: sel ? "#fff" : T.text }}>{lang}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: sel ? "rgba(255,255,255,.85)" : T.muted, textAlign: "center" }}>{note}</span>
                {sel && <div style={{ width: 22, height: 22, borderRadius: "50%", background: "rgba(255,255,255,.92)", color: acc, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 900, animation: "popIn .2s both" }}>✓</div>}
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <button className="btn btn-outline btn-sm" onClick={onBack}>← Back</button>
        <button className="btn btn-p" onClick={onNext} disabled={!data.level || !data.nativeLanguage} style={{ flex: 1, justifyContent: "center", background: "linear-gradient(135deg,#0DB85E,#0099E6)", boxShadow: "0 8px 24px rgba(13,184,94,.4)" }}>Continue →</button>
      </div>
    </div>
  </Shell>
);


/* ═══════════════════════════════════════════════════════════════════════════
   STEP 3 — OPTIONS + FILE UPLOAD
   ═══════════════════════════════════════════════════════════════════════════ */
const StepOptions = ({ data, onChange, onNext, onBack, dir }) => {
  const [drag,  setDrag]  = useState(false);
  const [files, setFiles] = useState([]);
  const add = fs => setFiles(p => [...p, ...Array.from(fs).filter(f =>
    f.type === "application/pdf" || f.name.endsWith(".docx") || f.type.startsWith("text/"))]);

  return (
    <Shell stepKey="options">
      <div className={dir === "back" ? "back" : "enter"}>
        <StepBar current={3} total={4} />
        <h2 style={{ fontFamily: T.dFont, fontSize: 24, fontWeight: 900, marginBottom: 4 }}>Course options ✨</h2>
        <p style={{ color: T.sub, marginBottom: 16, fontSize: 14 }}>Defaults work great. Adjust only if needed.</p>

        <div style={{ background: T.bg, border: `3px solid ${T.border}`, borderRadius: 18, padding: 14, marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div>
              <p style={{ fontFamily: T.dFont, fontSize: 14, fontWeight: 800, color: T.text }}>Modules per course</p>
              <p style={{ fontSize: 12, color: T.muted }}>Each module has 2–3 lessons</p>
            </div>
            <div style={{ width: 38, height: 38, borderRadius: 12, background: "linear-gradient(135deg,#F5A623,#F76D3C)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: T.dFont, fontSize: 18, fontWeight: 900, color: "#fff", boxShadow: "0 4px 12px rgba(245,166,35,.38)" }}>{data.unitCount}</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {[2,3,4,6,8].map(n => <button key={n} className={`cnt-btn ${data.unitCount===n?"sel":""}`} onClick={() => onChange({ unitCount: n })}>{n}</button>)}
          </div>
        </div>

        <div style={{ background: T.bg, border: `3px solid ${T.border}`, borderRadius: 18, padding: 14, marginBottom: 12 }}>
          <p style={{ fontFamily: T.dFont, fontSize: 14, fontWeight: 800, color: T.text, marginBottom: 4 }}>Special focus <span style={{ fontSize: 12, fontWeight: 500, color: T.muted }}>(optional)</span></p>
          <p style={{ fontSize: 11, color: T.muted, marginBottom: 8 }}>Examples: business vocab, travel phrases</p>
          <textarea rows={2} placeholder="Type a theme or leave blank…" value={data.extraInstructions || ""} onChange={e => onChange({ extraInstructions: e.target.value })}
            style={{ width: "100%", background: "white", border: `2px solid ${T.border}`, borderRadius: 11, padding: "10px 12px", color: T.text, fontFamily: T.bFont, fontSize: 13, outline: "none", transition: "border-color .2s", resize: "none" }}
            onFocus={e => { e.target.style.borderColor = T.amber; e.target.style.boxShadow = `0 0 0 3px ${T.amber}22`; }}
            onBlur={e  => { e.target.style.borderColor = T.border; e.target.style.boxShadow = "none"; }} />
        </div>

        <div style={{ background: T.bg, border: `3px solid ${T.border}`, borderRadius: 18, padding: 14, marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: "linear-gradient(135deg,#0099E6,#6C35DE)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, boxShadow: "0 4px 10px rgba(0,153,230,.32)" }}>📎</div>
            <div>
              <p style={{ fontFamily: T.dFont, fontSize: 14, fontWeight: 800, color: T.text }}>Upload materials <span style={{ fontSize: 12, fontWeight: 500, color: T.muted }}>(optional)</span></p>
              <p style={{ fontSize: 11, color: T.muted }}>AI can use your files during lesson generation.</p>
            </div>
          </div>

          {files.length > 0 && (
            <div style={{ background: "rgba(0,188,212,.07)", border: "1.5px solid rgba(0,188,212,.25)", borderRadius: 11, padding: "8px 10px", marginBottom: 10, display: "flex", gap: 8, alignItems: "flex-start" }}>
              <span style={{ fontSize: 14, flexShrink: 0 }}>📚</span>
              <p style={{ fontSize: 11, color: "#006064", lineHeight: 1.45 }}>
                <strong>Your files will be indexed for RAG.</strong> AI will use them to ground slides, tasks, and tests.
              </p>
            </div>
          )}

          <div className={`upload-zone ${drag ? "drag" : ""}`}
            onDragOver={e => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={e => { e.preventDefault(); setDrag(false); add(e.dataTransfer.files); }}
            onClick={() => document.getElementById("fu-onboard").click()}>
            <input id="fu-onboard" type="file" multiple accept=".pdf,.docx,.txt" style={{ display: "none" }} onChange={e => add(e.target.files)} />
            {files.length === 0 ? (
              <><p style={{ fontSize: 22, marginBottom: 4 }}>☁️</p><p style={{ fontSize: 13, color: T.sub, fontWeight: 600 }}>Drop PDF, DOCX or TXT here<br /><span style={{ color: T.violet, fontWeight: 700 }}>or click to browse</span></p></>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <p style={{ fontSize: 18 }}>✅</p>
                <p style={{ fontSize: 13, fontWeight: 700, color: T.green }}>{files.length} file{files.length > 1 ? "s" : ""} ready</p>
                {files.map((f, i) => <span key={i} style={{ fontSize: 11, color: T.muted }}>📄 {f.name}</span>)}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn btn-outline btn-sm" onClick={onBack}>← Back</button>
          <button className="btn btn-p btn-sm" onClick={() => onNext(files)} style={{ flex: 1, justifyContent: "center", fontSize: 14, background: "linear-gradient(135deg,#F5A623,#F76D3C,#F0447C)", boxShadow: "0 8px 22px rgba(247,109,60,.38)", borderRadius: 14 }}>
            ✦ Build course outline
          </button>
        </div>
      </div>
    </Shell>
  );
};


/* ═══════════════════════════════════════════════════════════════════════════
   COURSE OUTLINE SCREEN
   ═══════════════════════════════════════════════════════════════════════════ */
const OutlineModuleCard = ({ module, moduleIndex }) => {
  const [open, setOpen] = useState(true);
  const grad = MODULE_GRADS[moduleIndex % MODULE_GRADS.length];
  return (
    <div style={{ borderRadius: 20, overflow: "hidden", border: `3px solid ${T.border}`, background: "white" }}>
      <div onClick={() => setOpen(o => !o)} style={{ background: grad, padding: "14px 20px", cursor: "pointer", display: "flex", alignItems: "center", gap: 14, userSelect: "none" }}>
        <div style={{ width: 36, height: 36, borderRadius: 12, background: "rgba(255,255,255,.2)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: T.dFont, fontSize: 16, fontWeight: 900, color: "#fff", flexShrink: 0 }}>{moduleIndex + 1}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: T.dFont, fontSize: 15, fontWeight: 900, color: "#fff" }}>{module.title}</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,.8)", marginTop: 2 }}>{module.lessons.length} lesson{module.lessons.length !== 1 ? "s" : ""}</div>
        </div>
        <div style={{ color: "rgba(255,255,255,.75)", fontSize: 18, transition: "transform .3s", transform: open ? "rotate(180deg)" : "none" }}>⌄</div>
      </div>
      {open && module.lessons.map((lesson, li) => (
        <div key={lesson.id} style={{ padding: "13px 20px", borderTop: `2px solid ${T.border}`, display: "flex", alignItems: "flex-start", gap: 14, animation: "fadeIn .3s both" }}>
          <div style={{ width: 26, height: 26, borderRadius: 8, background: T.bg, border: `2px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: T.muted, flexShrink: 0, marginTop: 2 }}>{li + 1}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, color: T.text, fontSize: 14, marginBottom: 3 }}>{lesson.title}</div>
            <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.5 }}>🎯 {lesson.objective}</div>
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, background: T.bg, color: T.muted, border: `2px solid ${T.border}`, padding: "3px 10px", borderRadius: 999, flexShrink: 0, marginTop: 2, whiteSpace: "nowrap" }}>Not generated</div>
        </div>
      ))}
    </div>
  );
};

const CourseOutlineScreen = ({ courseData, onDone, onBack }) => {
  const [phase,   setPhase]   = useState("loading");
  const [outline, setOutline] = useState(null);
  const [errMsg,  setErrMsg]  = useState("");
  const isRequestingRef = useRef(false);

  const generateCourseOutline = useCallback(async () => {
    if (isRequestingRef.current) return;
    isRequestingRef.current = true;

    setPhase("loading");
    setErrMsg("");
    try {
      const res = await fetch("/api/v1/course-builder/generate-outline", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject:            courseData.subject,
          level:              courseData.level,
          native_language:    courseData.nativeLanguage,
          unit_count:         courseData.unitCount,
          extra_instructions: courseData.extraInstructions || "",
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Server error ${res.status}`);
      }
      const parsed = await res.json();
      setOutline(parsed);
      setPhase("done");
    } catch (e) {
      isRequestingRef.current = false;
      setErrMsg(e?.message || "Something went wrong generating the outline. Please try again.");
      setPhase("error");
    }
  }, [courseData]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { generateCourseOutline(); }, []);

  if (phase === "loading") return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(160deg,#6C35DE 0%,#F0447C 55%,#F76D3C 100%)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, position: "relative", overflow: "hidden" }}>
      {[600,400,240].map((s,i) => <div key={i} style={{ position: "fixed", width: s, height: s, borderRadius: "50%", border: "2px solid rgba(255,255,255,.08)", top: "50%", left: "50%", transform: "translate(-50%,-50%)", animation: `rotateSlow ${24+i*8}s linear infinite ${i%2?"reverse":""}`, pointerEvents: "none" }} />)}
      <div style={{ background: "rgba(255,255,255,.96)", borderRadius: 32, padding: "48px 40px", maxWidth: 480, width: "100%", textAlign: "center", boxShadow: "0 40px 100px rgba(0,0,0,.28)", position: "relative", zIndex: 1, animation: "fadeUp .6s both" }}>
        <div style={{ width: 76, height: 76, margin: "0 auto 28px", position: "relative" }}>
          <div style={{ width: 76, height: 76, borderRadius: "50%", border: `5px solid ${T.border}`, position: "absolute" }} />
          <div style={{ width: 76, height: 76, borderRadius: "50%", border: `5px solid transparent`, borderTopColor: T.violet, position: "absolute", animation: "spin 1s linear infinite" }} />
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>✨</div>
        </div>
        <h2 style={{ fontFamily: T.dFont, fontSize: 26, fontWeight: 900, marginBottom: 8, color: T.text }}>Crafting your outline…</h2>
        <p style={{ color: T.sub, fontSize: 14, lineHeight: 1.7, maxWidth: 340, margin: "0 auto 28px" }}>
          AI is designing your <strong>{courseData.subject}</strong> course structure.<br />
          <span style={{ color: T.violet, fontWeight: 700 }}>Only modules &amp; lessons</span> — slides, tasks &amp; test come later, per lesson.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, textAlign: "left" }}>
          {[
            { label: `${courseData.unitCount} module${courseData.unitCount>1?"s":""}`, emoji: "🗂" },
            { label: "Lessons inside each module", emoji: "📖" },
            { label: "Learning objectives", emoji: "🎯" },
          ].map((item, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, background: T.bg, borderRadius: 12, padding: "12px 16px", animation: `fadeUp .5s ${i*.15+.2}s both` }}>
              <span style={{ fontSize: 18 }}>{item.emoji}</span>
              <div style={{ flex: 1 }}><ShimmerRow width={`${60+i*10}%`} height={12} /></div>
              <span style={{ fontSize: 12, color: T.muted, fontWeight: 600, whiteSpace: "nowrap" }}>{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  if (phase === "error") return (
    <div style={{ minHeight: "100vh", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ maxWidth: 380, textAlign: "center", animation: "fadeUp .5s both" }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>😕</div>
        <h2 style={{ fontFamily: T.dFont, fontSize: 24, fontWeight: 900, marginBottom: 8, color: T.text }}>Generation failed</h2>
        <p style={{ color: T.sub, marginBottom: 28, fontSize: 14, lineHeight: 1.6 }}>{errMsg}</p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <button className="btn btn-outline btn-sm" onClick={onBack}>← Back</button>
          <button className="btn btn-p" onClick={generateCourseOutline} style={{ background: "linear-gradient(135deg,#6C35DE,#F0447C)" }}>Try again</button>
        </div>
      </div>
    </div>
  );

  const totalLessons = outline.modules.reduce((s, m) => s + m.lessons.length, 0);
  return (
    <div style={{ minHeight: "100vh", background: T.bg, display: "flex", flexDirection: "column" }}>
      <div style={{ background: "linear-gradient(135deg,#1A1035 0%,#6C35DE 60%,#F0447C 100%)", padding: "32px clamp(20px,4vw,56px)", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle at 80% 50%, rgba(240,68,124,.3) 0%, transparent 60%)", pointerEvents: "none" }} />
        <div style={{ maxWidth: 860, margin: "0 auto", position: "relative", zIndex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".12em", textTransform: "uppercase", color: "rgba(255,255,255,.6)", marginBottom: 10, fontFamily: T.dFont }}>Step 1 of 2 · Course Outline ✓</div>
          <h1 style={{ fontFamily: T.dFont, fontSize: "clamp(22px,3vw,34px)", fontWeight: 900, color: "#fff", marginBottom: 8, lineHeight: 1.15, animation: "fadeUp .5s both" }}>{outline.title}</h1>
          <p style={{ color: "rgba(255,255,255,.8)", fontSize: 15, lineHeight: 1.65, maxWidth: 580, marginBottom: 20, animation: "fadeUp .5s .1s both" }}>{outline.description}</p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", animation: "fadeUp .5s .18s both" }}>
            {[
              { n: courseData.unitCount, label: "Modules",       emoji: "🗂",  col: "rgba(255,255,255,.18)" },
              { n: totalLessons,         label: "Lessons",       emoji: "📖",  col: "rgba(255,255,255,.18)" },
              { n: "TBD",                label: "Slides/lesson", emoji: "🎞",  col: "rgba(255,255,255,.12)" },
              { n: "TBD",                label: "Tasks/lesson",  emoji: "📋",  col: "rgba(255,255,255,.12)" },
            ].map(({ n, label, emoji, col }) => (
              <div key={label} style={{ background: col, borderRadius: 14, padding: "8px 16px", backdropFilter: "blur(8px)", border: "1.5px solid rgba(255,255,255,.2)", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 16 }}>{emoji}</span>
                <span style={{ fontFamily: T.dFont, fontWeight: 900, fontSize: 18, color: "#fff" }}>{n}</span>
                <span style={{ fontSize: 12, color: "rgba(255,255,255,.75)" }}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ flex: 1, maxWidth: 860, margin: "0 auto", padding: "36px clamp(16px,4vw,40px)", width: "100%" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ fontFamily: T.dFont, fontSize: 20, fontWeight: 900, color: T.text }}>Course Structure</h2>
          <div style={{ fontSize: 12, fontWeight: 700, background: T.amberL, color: T.amber, padding: "5px 14px", borderRadius: 999, border: `2px solid ${T.amber}44` }}>👀 Review before building</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 36, animation: "fadeUp .5s both" }}>
          {outline.modules.map((mod, mi) => <OutlineModuleCard key={mod.id} module={mod} moduleIndex={mi} />)}
        </div>
        <div style={{ background: "white", border: `3px solid ${T.violet}44`, borderRadius: 24, padding: "24px 28px", display: "flex", alignItems: "center", gap: 20, marginBottom: 24, boxShadow: `0 8px 32px ${T.violet}18`, animation: "fadeUp .5s .2s both", flexWrap: "wrap" }}>
          <div style={{ width: 52, height: 52, borderRadius: 18, background: "linear-gradient(135deg,#6C35DE,#F0447C)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, flexShrink: 0, animation: "pulse 2.5s ease-in-out infinite" }}>🚀</div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <p style={{ fontFamily: T.dFont, fontSize: 17, fontWeight: 900, color: T.text, marginBottom: 4 }}>Ready to build lesson by lesson?</p>
            <p style={{ color: T.sub, fontSize: 13, lineHeight: 1.6 }}>Generate <strong style={{ color: T.violet }}>slides</strong>, <strong style={{ color: T.sky }}>tasks</strong>, and a <strong style={{ color: T.lime }}>test</strong> for each lesson individually — at your own pace. Nothing is permanent until you publish.</p>
          </div>
          <button className="btn btn-p" style={{ flexShrink: 0, background: "linear-gradient(135deg,#6C35DE,#F0447C)", boxShadow: "0 8px 24px rgba(108,53,222,.4)", fontSize: 15, padding: "14px 28px" }} onClick={() => onDone(outline)}>
            Start building →
          </button>
        </div>
        <button className="btn btn-outline btn-sm" onClick={onBack} style={{ color: T.muted }}>← Back to options</button>
      </div>
    </div>
  );
};


/* ═══════════════════════════════════════════════════════════════════════════
   COURSE BUILD SCREEN — lesson-by-lesson content generation
   ═══════════════════════════════════════════════════════════════════════════ */

const StatusDot = ({ status }) => {
  if (status === "done")       return <div style={{ width:22,height:22,borderRadius:"50%",background:"linear-gradient(135deg,#0DB85E,#00BCD4)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:"#fff",fontWeight:900,flexShrink:0 }}>✓</div>;
  if (status === "generating") return <div style={{ width:22,height:22,borderRadius:"50%",border:`3px solid ${T.violet}`,borderTopColor:"transparent",animation:"spin 1s linear infinite",flexShrink:0 }} />;
  if (status === "error")      return <div style={{ width:22,height:22,borderRadius:"50%",background:T.red,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,color:"#fff",fontWeight:900,flexShrink:0 }}>!</div>;
  return <div style={{ width:22,height:22,borderRadius:"50%",background:T.bg,border:`3px solid ${T.border}`,flexShrink:0 }} />;
};

const BuildEmptyState = ({ totalCount, doneCount, onGenerateAll, genAll, hasAnyRAG }) => (
  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", textAlign: "center", maxWidth: 480, margin: "0 auto", padding: 32 }}>
    <div style={{ fontSize: 72, marginBottom: 20, animation: "float 4s ease-in-out infinite" }}>📚</div>
    <h2 style={{ fontFamily: T.dFont, fontSize: 26, fontWeight: 900, marginBottom: 10, color: T.text }}>Choose a lesson to build</h2>
    <p style={{ color: T.sub, fontSize: 15, lineHeight: 1.7, marginBottom: 16 }}>
      Select any lesson from the left panel to generate its content, or use the button below to generate everything sequentially.
    </p>

    {hasAnyRAG && (
      <div style={{ background: "rgba(0,188,212,.07)", border: "1.5px solid rgba(0,188,212,.28)", borderRadius: 16, padding: "14px 18px", marginBottom: 20, maxWidth: 400, display: "flex", gap: 10, alignItems: "flex-start", textAlign: "left" }}>
        <span style={{ fontSize: 18, flexShrink: 0 }}>📚</span>
        <p style={{ fontSize: 13, color: "#00697A", lineHeight: 1.6 }}>
          <strong>Teacher materials detected.</strong> Lessons marked <span style={{ fontWeight: 800, color: "#00838F" }}>📚 Materials</span> will use your uploaded content during generation for richer, personalised output.
        </p>
      </div>
    )}

    <div style={{ display: "flex", gap: 10, marginBottom: 32, flexWrap: "wrap", justifyContent: "center" }}>
      {[{emoji:"🎞",label:"Slides",color:T.violet,bg:T.violetL},{emoji:"📋",label:"Tasks",color:T.sky,bg:T.skyL},{emoji:"📝",label:"Test",color:T.lime,bg:T.limeL}].map(({ emoji, label, color, bg }) => (
        <div key={label} style={{ background: bg, borderRadius: 12, padding: "8px 16px", display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 16 }}>{emoji}</span>
          <span style={{ fontFamily: T.dFont, fontSize: 13, fontWeight: 800, color }}>{label}</span>
        </div>
      ))}
    </div>

    <button className="btn btn-p" style={{ fontSize: 15, background: "linear-gradient(135deg,#6C35DE,#F0447C)", boxShadow: "0 8px 24px rgba(108,53,222,.4)", marginBottom: 12 }} onClick={onGenerateAll} disabled={genAll}>
      {genAll ? "⟳ Generating all lessons…" : `⚡ Generate all ${totalCount} lessons`}
    </button>
    {doneCount > 0 && <p style={{ fontSize: 13, color: T.muted }}>{doneCount} of {totalCount} already done ✓</p>}
  </div>
);

const LessonPending = ({ lesson, sourceInfo, onGenerate }) => {
  const hasRAG = sourceInfo?.hasRAG;
  return (
    <div style={{ maxWidth: 580, animation: "fadeIn .35s both" }}>
      <div style={{ fontSize: 12, color: T.muted, fontWeight: 600, marginBottom: 20, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span>{lesson.moduleTitle}</span>
        <span style={{ color: T.border }}>›</span>
        <span style={{ color: T.violet }}>{lesson.title}</span>
        {hasRAG && <RAGBadge chunkCount={sourceInfo.chunkCount} />}
      </div>

      <div style={{ background: "white", border: `3px solid ${T.border}`, borderRadius: 24, padding: 32, marginBottom: 16 }}>
        <h2 style={{ fontFamily: T.dFont, fontSize: 22, fontWeight: 900, color: T.text, marginBottom: 14 }}>{lesson.title}</h2>

        <div style={{ background: T.bg, borderRadius: 14, padding: "14px 18px", marginBottom: 20, display: "flex", alignItems: "flex-start", gap: 12 }}>
          <span style={{ fontSize: 20, flexShrink: 0 }}>🎯</span>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: T.muted, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 3 }}>Learning objective</div>
            <div style={{ fontSize: 14, color: T.sub, fontWeight: 500, lineHeight: 1.6 }}>{lesson.objective}</div>
          </div>
        </div>

        {hasRAG && (
          <div style={{ background: "rgba(0,188,212,.07)", border: "1.5px solid rgba(0,188,212,.3)", borderRadius: 14, padding: "13px 16px", marginBottom: 20, display: "flex", gap: 12, alignItems: "flex-start" }}>
            <span style={{ fontSize: 20, flexShrink: 0 }}>📚</span>
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#00697A", letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 4 }}>Teacher materials will be used</div>
              <div style={{ fontSize: 13, color: "#00838F", lineHeight: 1.55 }}>
                {sourceInfo.chunkCount} content chunk{sourceInfo.chunkCount !== 1 ? "s" : ""} from your uploaded files are available for this unit.
                AI will retrieve and incorporate relevant passages into slides, tasks, and test questions.
              </div>
              {sourceInfo.sources?.length > 0 && (
                <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {sourceInfo.sources.map((s, i) => (
                    <span key={i} style={{ fontSize: 11, background: "rgba(0,188,212,.12)", color: "#006064", border: "1px solid rgba(0,188,212,.25)", borderRadius: 999, padding: "2px 9px", fontWeight: 600 }}>📄 {s.filename}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <p style={{ fontSize: 12, fontWeight: 800, color: T.muted, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 12 }}>What AI will generate using:</p>
        <div style={{ background: T.bg, borderRadius: 12, padding: "11px 14px", marginBottom: 18, display: "flex", flexDirection: "column", gap: 6 }}>
          {[
            { icon: "📋", label: "1. Course outline", desc: "Title, description, module structure" },
            { icon: "🎯", label: "2. Lesson metadata", desc: `"${lesson.title}" · ${lesson.objective}` },
            { icon: hasRAG ? "📚" : "🔍", label: hasRAG ? "3. Your uploaded materials (RAG)" : "3. RAG pipeline", desc: hasRAG ? `${sourceInfo.chunkCount} chunks from your files` : "No materials uploaded for this unit yet" },
          ].map(({ icon, label, desc }) => (
            <div key={label} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <span style={{ fontSize: 15, flexShrink: 0, marginTop: 1 }}>{icon}</span>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{label}</div>
                <div style={{ fontSize: 11, color: T.muted }}>{desc}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 28 }}>
          {[
            { emoji: "🎞", label: "Slides", desc: "4–5 content slides with key points",      color: T.violet, bg: T.violetL },
            { emoji: "📋", label: "Tasks",  desc: "2–3 interactive practice activities",      color: T.sky,    bg: T.skyL    },
            { emoji: "📝", label: "Test",   desc: "3–4 multiple-choice questions + answers",  color: T.lime,   bg: T.limeL   },
          ].map(({ emoji, label, desc, color, bg }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 14, background: bg, borderRadius: 14, padding: "12px 16px" }}>
              <span style={{ fontSize: 22, flexShrink: 0 }}>{emoji}</span>
              <div>
                <div style={{ fontFamily: T.dFont, fontSize: 14, fontWeight: 800, color }}>{label}</div>
                <div style={{ fontSize: 12, color: T.sub }}>{desc}{hasRAG ? " · grounded in your materials" : ""}</div>
              </div>
            </div>
          ))}
        </div>

        <button className="btn btn-p" style={{ width: "100%", justifyContent: "center", fontSize: 16, padding: "16px", background: "linear-gradient(135deg,#6C35DE,#F0447C)", boxShadow: "0 10px 28px rgba(108,53,222,.4)", borderRadius: 16 }} onClick={onGenerate}>
          {hasRAG ? "✦ Generate lesson (with your materials)" : "✦ Generate this lesson"}
        </button>
      </div>
    </div>
  );
};

const LessonGenerating = ({ lesson, hasRAG }) => {
  const [tick, setTick] = useState(0);
  const msgs = hasRAG
    ? ["Searching your uploaded materials…", "Extracting relevant content…", "Designing slides from your content…", "Writing tasks…", "Building test questions…", "Polishing content…"]
    : ["Designing slides…", "Writing tasks…", "Building test questions…", "Polishing content…", "Almost there…"];
  useEffect(() => { const id = setInterval(() => setTick(t => t+1), 950); return () => clearInterval(id); }, []);
  return (
    <div style={{ maxWidth: 580, animation: "fadeIn .35s both" }}>
      <div style={{ fontSize: 12, color: T.muted, fontWeight: 600, marginBottom: 20, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span>{lesson.moduleTitle}</span><span style={{ color: T.border }}>›</span><span style={{ color: T.violet }}>{lesson.title}</span>
        {hasRAG && <RAGBadge live />}
      </div>
      <div style={{ background: "white", border: `3px solid ${T.violet}44`, borderRadius: 24, padding: 36, textAlign: "center" }}>
        <div style={{ width: 68, height: 68, margin: "0 auto 24px", position: "relative" }}>
          <div style={{ width: 68, height: 68, borderRadius: "50%", border: `5px solid ${T.violetL}`, position: "absolute" }} />
          <div style={{ width: 68, height: 68, borderRadius: "50%", border: `5px solid transparent`, borderTopColor: T.violet, position: "absolute", animation: "spin 1.2s linear infinite" }} />
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>{hasRAG ? "📚" : "✨"}</div>
        </div>
        <h3 style={{ fontFamily: T.dFont, fontSize: 20, fontWeight: 900, marginBottom: 8, color: T.text }}>Generating lesson content…</h3>
        <p key={tick} style={{ color: T.violet, fontWeight: 700, fontSize: 14, marginBottom: 28, animation: "fadeIn .3s both" }}>{msgs[tick % msgs.length]}</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, textAlign: "left" }}>
          {[...Array(4)].map((_, i) => (
            <div key={i} style={{ background: T.bg, borderRadius: 14, padding: 14, opacity: 1 - i * .15 }}>
              <ShimmerRow width="55%" height={10} mt={0} /><ShimmerRow width="90%" height={9} mt={8} /><ShimmerRow width="70%" height={9} mt={6} /><ShimmerRow width="45%" height={9} mt={6} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const LessonError = ({ lesson, onRetry }) => (
  <div style={{ maxWidth: 580, animation: "fadeIn .35s both" }}>
    <div style={{ fontSize: 12, color: T.muted, fontWeight: 600, marginBottom: 20, display: "flex", alignItems: "center", gap: 6 }}>
      <span>{lesson.moduleTitle}</span><span style={{ color: T.border }}>›</span><span style={{ color: T.violet }}>{lesson.title}</span>
    </div>
    <div style={{ background: "white", border: `3px solid ${T.red}44`, borderRadius: 24, padding: "36px 32px", textAlign: "center" }}>
      <div style={{ fontSize: 52, marginBottom: 16 }}>⚠️</div>
      <h3 style={{ fontFamily: T.dFont, fontSize: 20, fontWeight: 900, marginBottom: 8, color: T.text }}>Generation failed</h3>
      <p style={{ color: T.sub, fontSize: 14, lineHeight: 1.65, marginBottom: 28 }}>Something went wrong for this lesson only. All other lessons are unaffected.</p>
      <button className="btn btn-p" style={{ background: "linear-gradient(135deg,#6C35DE,#F0447C)" }} onClick={onRetry}>↺ Try again</button>
    </div>
  </div>
);

const TASK_ICONS  = { Speaking: "🗣️", Writing: "✏️", Listening: "👂", Reading: "📖", Practice: "🔄" };
const TASK_COLORS = {
  Speaking:  { bg: T.pinkL,   color: T.pink   },
  Writing:   { bg: T.skyL,    color: T.sky    },
  Listening: { bg: T.limeL,   color: T.lime   },
  Reading:   { bg: T.violetL, color: T.violet },
  Practice:  { bg: T.amberL,  color: T.amber  },
};

const LessonDone = ({ lesson, content, sourceInfo, activeTab, onTabChange, onRegenerate, onSave, onEditSlides }) => {
  const [confirmRegen, setConfirmRegen] = useState(false);
  const [showSave,     setShowSave]     = useState(false);
  const hasRAG = sourceInfo?.hasRAG;

  const tabs = [
    { key: "slides", label: "Slides", emoji: "🎞", count: content.slides?.length || 0, color: T.violet },
    { key: "tasks",  label: "Tasks",  emoji: "📋", count: content.tasks?.length  || 0, color: T.sky    },
    { key: "test",   label: "Test",   emoji: "📝", count: content.test?.length   || 0, color: T.lime   },
  ];

  const handleSave = () => {
    onSave();
    setShowSave(true);
    setTimeout(() => setShowSave(false), 2400);
  };

  return (
    <div style={{ maxWidth: 780, animation: "fadeIn .4s both" }}>
      {showSave && <div className="save-toast">💾 Progress saved</div>}

      <div style={{ marginBottom: 22 }}>
        <div style={{ fontSize: 12, color: T.muted, fontWeight: 600, marginBottom: 6, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span>{lesson.moduleTitle}</span><span style={{ color: T.border }}>›</span>
          <span style={{ color: T.violet }}>{lesson.title}</span>
          {hasRAG && <RAGBadge chunkCount={sourceInfo.chunkCount} />}
        </div>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ fontFamily: T.dFont, fontSize: 24, fontWeight: 900, color: T.text, marginBottom: 6 }}>{lesson.title}</h2>
            <p style={{ fontSize: 13, color: T.sub, marginBottom: 10 }}>{lesson.objective}</p>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: T.limeL, borderRadius: 999, padding: "4px 13px", fontSize: 11, fontWeight: 800, color: T.green }}>✓ Generated</span>
              {content.savedAt && <span style={{ fontSize: 11, color: T.muted }}>💾 Saved {new Date(content.savedAt).toLocaleTimeString()}</span>}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
            <button className="btn btn-outline btn-sm" style={{ color: T.green, borderColor: `${T.lime}88` }} onClick={handleSave}>💾 Save edits</button>
            <button className="btn btn-outline btn-sm" style={{ color: T.sky, borderColor: `${T.sky}88` }} onClick={onEditSlides}>✏️ Edit Slides</button>
            {!confirmRegen ? (
              <button className="btn btn-outline btn-sm" style={{ color: T.violet, borderColor: `${T.violet}66` }} onClick={() => setConfirmRegen(true)}>↺ Regenerate</button>
            ) : (
              <div style={{ display: "flex", gap: 6, alignItems: "center", background: T.amberL, border: `2px solid ${T.amber}66`, borderRadius: 11, padding: "7px 11px" }}>
                <span style={{ fontSize: 12, color: T.text, fontWeight: 600 }}>Replaces current</span>
                <button className="btn btn-xs" style={{ background: T.violet, color: "#fff" }} onClick={() => { setConfirmRegen(false); onRegenerate(); }}>Confirm</button>
                <button className="btn btn-xs btn-outline" onClick={() => setConfirmRegen(false)}>Cancel</button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: "inline-flex", gap: 6, marginBottom: 22, background: "white", padding: 5, borderRadius: 16, border: `2px solid ${T.border}` }}>
        {tabs.map(({ key, label, emoji, count, color }) => (
          <button key={key} onClick={() => onTabChange(key)} style={{ border: "none", borderRadius: 11, padding: "9px 16px", cursor: "pointer", fontFamily: T.dFont, fontSize: 14, fontWeight: 800, display: "flex", alignItems: "center", gap: 6, background: activeTab === key ? `linear-gradient(135deg,${color},${color}cc)` : "transparent", color: activeTab === key ? "#fff" : T.sub, transition: "all .2s", boxShadow: activeTab === key ? `0 4px 14px ${color}44` : "none" }}>
            <span>{emoji}</span>{label}
            <span style={{ background: activeTab === key ? "rgba(255,255,255,.25)" : T.bg, borderRadius: 999, padding: "1px 7px", fontSize: 11, color: activeTab === key ? "#fff" : T.muted }}>{count}</span>
          </button>
        ))}
      </div>

      {activeTab === "slides" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 16 }}>
          {(content.slides || []).map((slide, si) => (
            <div key={slide.id || si} style={{ background: "white", border: `3px solid ${T.border}`, borderRadius: 20, overflow: "hidden", animation: `fadeUp .4s ${si*.07}s both` }}>
              <div style={{ background: `linear-gradient(135deg,${T.violet},${T.pink})`, padding: "14px 18px", display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 24 }}>{slide.emoji || "📑"}</span>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,.65)", letterSpacing: ".1em", textTransform: "uppercase" }}>Slide {si+1}</div>
                  <div style={{ fontFamily: T.dFont, fontSize: 14, fontWeight: 900, color: "#fff", lineHeight: 1.3 }}>{slide.title}</div>
                </div>
              </div>
              <div style={{ padding: "14px 18px" }}>
                {(slide.bullets || []).map((b, bi) => (
                  <div key={bi} style={{ display: "flex", gap: 8, marginBottom: 7, fontSize: 13, color: T.text, lineHeight: 1.5 }}>
                    <span style={{ color: T.violet, flexShrink: 0, fontWeight: 900, marginTop: 1 }}>›</span>
                    <span>{b}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === "tasks" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {(content.tasks || []).map((task, ti) => {
            const tc = TASK_COLORS[task.type] || { bg: T.violetL, color: T.violet };
            return (
              <div key={task.id || ti} style={{ background: "white", border: `3px solid ${T.border}`, borderRadius: 20, padding: 22, animation: `fadeUp .4s ${ti*.08}s both` }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: task.example ? 14 : 0 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 14, background: tc.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>{TASK_ICONS[task.type] || "📋"}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                      <span style={{ fontSize: 11, fontWeight: 800, background: tc.bg, color: tc.color, padding: "3px 10px", borderRadius: 999, textTransform: "uppercase", letterSpacing: ".08em" }}>{task.type || "Activity"}</span>
                      <span style={{ fontSize: 11, color: T.muted }}>Task {ti+1}</span>
                    </div>
                    <div style={{ fontWeight: 700, color: T.text, fontSize: 15, lineHeight: 1.55 }}>{task.instruction}</div>
                  </div>
                </div>
                {task.example && (
                  <div style={{ background: T.bg, border: `2px solid ${T.border}`, borderRadius: 12, padding: "11px 16px", fontSize: 13, color: T.sub }}>
                    💬 <em>Example:</em> <span style={{ fontStyle: "normal", color: T.text, fontWeight: 600 }}>"{task.example}"</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {activeTab === "test" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {(content.test || []).map((q, qi) => (
            <div key={q.id || qi} style={{ background: "white", border: `3px solid ${T.border}`, borderRadius: 20, padding: 22, animation: `fadeUp .4s ${qi*.08}s both` }}>
              <div style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "flex-start" }}>
                <div style={{ width: 30, height: 30, borderRadius: 10, background: "linear-gradient(135deg,#0DB85E,#00BCD4)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: T.dFont, fontSize: 13, fontWeight: 900, color: "#fff", flexShrink: 0 }}>{qi+1}</div>
                <div style={{ fontWeight: 700, color: T.text, fontSize: 15, lineHeight: 1.55, flex: 1 }}>{q.question}</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {(q.options || []).map((opt, oi) => {
                  const correct = oi === q.correct;
                  return (
                    <div key={oi} style={{ borderRadius: 12, padding: "10px 14px", fontSize: 13, fontWeight: 600, background: correct ? T.limeL : T.bg, border: `2px solid ${correct ? T.lime : T.border}`, color: correct ? T.green : T.text, display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontFamily: T.dFont, fontWeight: 900, fontSize: 12, color: correct ? T.green : T.muted, flexShrink: 0 }}>{["A","B","C","D"][oi]}</span>
                      <span style={{ flex: 1 }}>{opt}</span>
                      {correct && <span style={{ fontSize: 14, flexShrink: 0 }}>✓</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const CourseBuildScreen = ({ outline, courseData, uploadedFiles, courseId, unitMap, onFinish }) => {
  const allLessons = outline.modules.flatMap(m =>
    m.lessons.map(l => ({ ...l, moduleTitle: m.title, moduleId: m.id }))
  );

  const storageDraftKey = courseId
    ? String(courseId)
    : `${courseData.subject}_${outline.title}`.replace(/\W/g, "_").slice(0, 60);

  const [currentLessonId,        setCurrentLessonId]        = useState(null);
  const [generatedLessons,       setGeneratedLessons]       = useState({});
  const [lessonGenerationStatus, setLessonGenerationStatus] = useState(() => {
    const init = {};
    allLessons.forEach(l => { init[l.id] = "pending"; });
    return init;
  });
  const [lessonSources, setLessonSources] = useState(() => {
    const init = {};
    allLessons.forEach(l => { init[l.id] = { hasRAG: false, chunkCount: 0, sources: [], checked: false }; });
    return init;
  });

  const [selectedId,      setSelectedId]      = useState(null);
  const [activeTab,       setActiveTab]       = useState("slides");
  const [genAll,          setGenAll]          = useState(false);
  const [editingLessonId, setEditingLessonId] = useState(null);
  const [publishing,      setPublishing]      = useState(false);

  useEffect(() => {
    const draft = loadDraft(storageDraftKey);
    if (!draft) return;
    if (draft.generatedLessons) setGeneratedLessons(draft.generatedLessons);
    if (draft.lessonGenerationStatus) {
      const restored = {};
      allLessons.forEach(l => {
        restored[l.id] = draft.lessonGenerationStatus[l.id] === "done" ? "done" : "pending";
      });
      setLessonGenerationStatus(restored);
    }
  }, []);

  useEffect(() => {
    if (!unitMap) {
      if (uploadedFiles?.length > 0) {
        setLessonSources(prev => {
          const next = { ...prev };
          allLessons.forEach(l => {
            next[l.id] = { hasRAG: true, chunkCount: null, sources: [], checked: true, fromGlobalUpload: true };
          });
          return next;
        });
      }
      return;
    }

    allLessons.forEach(async (lesson) => {
      const unitId = unitMap[lesson.id];
      if (!unitId) return;
      try {
        const res = await fetch(`/ingest/lesson/${unitId}/status`, {
          headers: { Authorization: `Bearer ${window.__authToken || ""}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        setLessonSources(prev => ({
          ...prev,
          [lesson.id]: { hasRAG: data.chunk_count > 0, chunkCount: data.chunk_count, sources: data.sources || [], checked: true, unitId },
        }));
      } catch { /* silently skip */ }
    });
  }, []);

  const saveLessonEdits = useCallback((lessonId) => {
    setGeneratedLessons(prev => {
      const updated = { ...prev, [lessonId]: { ...prev[lessonId], savedAt: Date.now() } };
      saveDraft(storageDraftKey, { generatedLessons: updated, lessonGenerationStatus });
      return updated;
    });
  }, [lessonGenerationStatus, storageDraftKey]);

  const generateLessonContent = useCallback(async (lessonId) => {
    const lesson = allLessons.find(l => l.id === lessonId);
    if (!lesson) return;
    if (lessonGenerationStatus[lessonId] === "generating") return;

    const srcInfo = lessonSources[lessonId];
    const hasRAG  = srcInfo?.hasRAG;

    const ragSection = hasRAG
      ? `\nTEACHER-UPLOADED UNIT MATERIALS (available via existing RAG pipeline):\n  • ${srcInfo.chunkCount != null ? srcInfo.chunkCount + " content chunks" : "Content"} stored for this unit in the vector DB.\n  ${(srcInfo.sources || []).map(s => `• ${s.filename} (${s.source_type}, ${s.chunks} chunks)`).join("\n  ")}\n  ➤ Ground slides, tasks, and test questions in this material where possible.\n  ➤ Reference real examples or terminology from the uploaded files.`
      : "\nNo teacher materials uploaded for this unit (proceed without RAG context).";

    setCurrentLessonId(lessonId);
    setLessonGenerationStatus(prev => ({ ...prev, [lessonId]: "generating" }));

    try {
      const res = await fetch("/api/v1/course-builder/generate-lesson", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          course_title:       outline.title,
          course_description: outline.description || "",
          module_title:       lesson.moduleTitle,
          lesson_title:       lesson.title,
          lesson_objective:   lesson.objective,
          subject:            courseData.subject,
          level:              courseData.level,
          native_language:    courseData.nativeLanguage,
          extra_instructions: courseData.extraInstructions || "",
          rag_context:        hasRAG ? ragSection : "",
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Server error ${res.status}`);
      }
      const parsed = await res.json();
      const withTs = { ...parsed, savedAt: Date.now() };

      setGeneratedLessons(prev => {
        const next = { ...prev, [lessonId]: withTs };
        saveDraft(storageDraftKey, {
          generatedLessons:       next,
          lessonGenerationStatus: { ...lessonGenerationStatus, [lessonId]: "done" },
        });
        return next;
      });
      setLessonGenerationStatus(prev => ({ ...prev, [lessonId]: "done" }));
    } catch {
      setLessonGenerationStatus(prev => ({ ...prev, [lessonId]: "error" }));
    } finally {
      setCurrentLessonId(prev => (prev === lessonId ? null : prev));
    }
  }, [allLessons, lessonGenerationStatus, lessonSources, courseData, outline, storageDraftKey]);

  const generateAll = useCallback(async () => {
    setGenAll(true);
    for (const lesson of allLessons) {
      const st = lessonGenerationStatus[lesson.id];
      if (st === "pending" || st === "error") {
        await generateLessonContent(lesson.id);
      }
    }
    setGenAll(false);
  }, [allLessons, lessonGenerationStatus, generateLessonContent]);

  const doneCount  = Object.values(lessonGenerationStatus).filter(s => s === "done").length;
  const totalCount = allLessons.length;
  const allDone    = doneCount === totalCount;
  const hasAnyRAG  = Object.values(lessonSources).some(s => s.hasRAG);

  const selectedLesson  = selectedId ? allLessons.find(l => l.id === selectedId) : null;
  const selectedStatus  = selectedId ? lessonGenerationStatus[selectedId] : null;
  const selectedContent = selectedId ? generatedLessons[selectedId]       : null;
  const selectedSource  = selectedId ? lessonSources[selectedId]          : null;

  const handleFinish = async () => {
    setPublishing(true);
    try {
      clearDraft(storageDraftKey);
      await onFinish({ outline, generatedLessons });
    } finally {
      setPublishing(false);
    }
  };

  if (editingLessonId) {
    const editLesson  = allLessons.find(l => l.id === editingLessonId);
    const editContent = generatedLessons[editingLessonId];
    const slides = editContent?.slides || [];

    return (
      <SlideEditorPage
        slides={slides}
        title={editLesson.title}
        meta={`${slides.length} slides · ${courseData.subject}`}
        onBack={() => setEditingLessonId(null)}
        onSave={(editedSlides) => {
          setGeneratedLessons(prev => {
            const next = {
              ...prev,
              [editingLessonId]: { ...prev[editingLessonId], slides: editedSlides, savedAt: Date.now() },
            };
            saveDraft(storageDraftKey, { generatedLessons: next, lessonGenerationStatus });
            return next;
          });
          setEditingLessonId(null);
        }}
        lessonCtx={{
          title:        editLesson.title,
          objective:    editLesson.objective,
          moduleTitle:  editLesson.moduleTitle,
          lessonIndex:  allLessons.findIndex(l => l.id === editingLessonId),
          totalLessons: allLessons.length,
        }}
      />
    );
  }

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", background: T.bg, overflow: "hidden" }}>
      {/* Top header */}
      <div style={{ background: "linear-gradient(135deg,#1A1035,#2D1B69)", padding: "13px 24px", display: "flex", alignItems: "center", gap: 16, boxShadow: "0 2px 20px rgba(0,0,0,.25)", zIndex: 20, flexShrink: 0 }}>
        <div style={{ width: 36, height: 36, borderRadius: 12, background: "linear-gradient(135deg,#6C35DE,#F0447C)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>🎓</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: T.dFont, fontSize: 15, fontWeight: 900, color: "#fff", marginBottom: 5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{outline.title}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ flex: 1, maxWidth: 280, height: 5, background: "rgba(255,255,255,.15)", borderRadius: 999, overflow: "hidden" }}>
              <div style={{ height: "100%", background: "linear-gradient(90deg,#0DB85E,#00BCD4)", borderRadius: 999, width: `${(doneCount/totalCount)*100}%`, transition: "width .6s cubic-bezier(.22,.68,0,1.2)" }} />
            </div>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,.65)", fontWeight: 700, whiteSpace: "nowrap" }}>{doneCount} / {totalCount} lessons ready</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          {!allDone && (
            <button className="btn btn-white btn-sm" onClick={generateAll} disabled={genAll || allDone} style={{ fontSize: 13 }}>
              {genAll ? "⟳ Generating…" : "⚡ Generate all"}
            </button>
          )}
          {allDone && (
            <button className="btn btn-sm" style={{ background: "linear-gradient(135deg,#0DB85E,#00BCD4)", color: "#fff", fontFamily: T.dFont, animation: publishing ? "none" : "pulse 2s ease-in-out infinite", boxShadow: "0 4px 16px rgba(13,184,94,.4)" }} onClick={handleFinish} disabled={publishing}>
              {publishing ? "⏳ Publishing…" : "🎉 Publish course"}
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", overflow: "hidden" }}>
        {/* Left sidebar */}
        <div style={{ width: 280, background: "white", borderRight: `2px solid ${T.border}`, overflowY: "auto", flexShrink: 0, minHeight: 0, paddingBottom: 24 }}>
          <div style={{ padding: "14px 16px 6px", fontSize: 10, fontWeight: 800, color: T.muted, letterSpacing: ".12em", textTransform: "uppercase", borderBottom: `2px solid ${T.bg}` }}>
            Step 2 of 2 · Build lessons
          </div>

          {outline.modules.map((mod, mi) => (
            <div key={mod.id} style={{ marginBottom: 4 }}>
              <div style={{ margin: "10px 10px 4px", background: MODULE_GRADS[mi % MODULE_GRADS.length], borderRadius: 12, padding: "9px 14px" }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,.7)", letterSpacing: ".1em", textTransform: "uppercase" }}>Module {mi+1}</div>
                <div style={{ fontFamily: T.dFont, fontSize: 13, fontWeight: 900, color: "#fff", lineHeight: 1.35 }}>{mod.title}</div>
              </div>

              {mod.lessons.map(lesson => {
                const status  = lessonGenerationStatus[lesson.id] || "pending";
                const active  = selectedId === lesson.id;
                const srcInfo = lessonSources[lesson.id];
                return (
                  <div key={lesson.id} className={`build-lesson-row ${active ? "active" : ""}`}
                    onClick={() => { setSelectedId(lesson.id); setActiveTab("slides"); }}>
                    <StatusDot status={status} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{lesson.title}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 2, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 11, color: status==="done"?T.green : status==="generating"?T.violet : status==="error"?T.red : T.muted, fontWeight: 600 }}>
                          {status==="done" ? "✓ Ready" : status==="generating" ? "Building…" : status==="error" ? "⚠ Error" : "Not generated"}
                        </span>
                        {srcInfo?.hasRAG && (
                          <span style={{ fontSize: 9, fontWeight: 800, color: "#00838F", background: "rgba(0,188,212,.1)", border: "1px solid rgba(0,188,212,.28)", borderRadius: 999, padding: "1px 6px", letterSpacing: ".04em", whiteSpace: "nowrap" }}>📚 Materials</span>
                        )}
                      </div>
                    </div>
                    {status === "pending" && (
                      <button
                        className="btn btn-xs btn-p"
                        style={{ flexShrink: 0, padding: "5px 10px", fontSize: 11, background: "linear-gradient(135deg,#6C35DE,#F0447C)" }}
                        onClick={e => { e.stopPropagation(); setSelectedId(lesson.id); generateLessonContent(lesson.id); }}>
                        Generate
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ))}

          <div style={{ margin: "12px 10px 0", background: T.bg, borderRadius: 12, padding: "12px 14px", border: `2px solid ${T.border}` }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.sub, marginBottom: 6 }}>Overall progress</div>
            <div style={{ height: 6, background: T.border, borderRadius: 999, overflow: "hidden", marginBottom: 6 }}>
              <div style={{ height: "100%", background: "linear-gradient(90deg,#0DB85E,#00BCD4)", borderRadius: 999, width: `${(doneCount/totalCount)*100}%`, transition: "width .5s" }} />
            </div>
            <div style={{ fontSize: 12, color: T.muted }}>{doneCount}/{totalCount} lessons generated</div>
            {hasAnyRAG && (
              <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#00838F", fontWeight: 600 }}>
                <span>📚</span><span>Teacher materials active for some lessons</span>
              </div>
            )}
          </div>
        </div>

        {/* Right content panel */}
        <div style={{ flex: 1, overflowY: "auto", padding: "28px 32px" }}>
          {!selectedLesson ? (
            <BuildEmptyState totalCount={totalCount} doneCount={doneCount} onGenerateAll={generateAll} genAll={genAll} hasAnyRAG={hasAnyRAG} />

          ) : selectedStatus === "pending" ? (
            <LessonPending lesson={selectedLesson} sourceInfo={selectedSource}
              onGenerate={() => generateLessonContent(selectedLesson.id)} />

          ) : selectedStatus === "generating" ? (
            <LessonGenerating lesson={selectedLesson} hasRAG={selectedSource?.hasRAG} />

          ) : selectedStatus === "error" ? (
            <LessonError lesson={selectedLesson} onRetry={() => {
              setLessonGenerationStatus(p => ({ ...p, [selectedLesson.id]: "pending" }));
              generateLessonContent(selectedLesson.id);
            }} />

          ) : (
            <LessonDone
              lesson={selectedLesson}
              content={selectedContent}
              sourceInfo={selectedSource}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              onSave={() => saveLessonEdits(selectedLesson.id)}
              onEditSlides={() => setEditingLessonId(selectedLesson.id)}
              onRegenerate={() => {
                setLessonGenerationStatus(p => ({ ...p, [selectedLesson.id]: "pending" }));
                generateLessonContent(selectedLesson.id);
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
};


/* ═══════════════════════════════════════════════════════════════════════════
   SETUP FLOW
   Owns the wizard internals: welcome → language → level → options → outline.
   Calls onComplete({ outline, courseData, uploadedFiles }) when the teacher
   clicks "Start building →" on the outline review screen.
   ═══════════════════════════════════════════════════════════════════════════ */

const SETUP_STEPS = ["welcome", "language", "level", "options", "outline"];

function SetupFlow({ onComplete }) {
  const [step,          setStep]          = useState("welcome");
  const [dir,           setDir]           = useState("forward");
  const [uploadedFiles, setUploadedFiles] = useState([]);

  const [courseData, setCourseData] = useState({
    subject: "", level: "", nativeLanguage: "English", unitCount: 4, extraInstructions: "",
  });

  const teacherName = "Sarah"; // replace with auth context
  const upd  = patch => setCourseData(d => ({ ...d, ...patch }));
  const next = from  => { setDir("forward"); setStep(SETUP_STEPS[SETUP_STEPS.indexOf(from) + 1]); };
  const back = from  => { setDir("back");    setStep(SETUP_STEPS[SETUP_STEPS.indexOf(from) - 1]); };

  /** Called by CourseOutlineScreen when teacher clicks "Start building →" */
  const handleOutlineDone = (outline) => {
    onComplete({ outline, courseData, uploadedFiles });
  };

  return (
    <>
      {step === "welcome"  && <WelcomeScreen name={teacherName} onContinue={() => next("welcome")} />}
      {step === "language" && <StepLanguage  data={courseData} onChange={upd} dir={dir} onNext={() => next("language")} onBack={() => back("language")} />}
      {step === "level"    && <StepLevel     data={courseData} onChange={upd} dir={dir} onNext={() => next("level")}    onBack={() => back("level")} />}
      {step === "options"  && <StepOptions   data={courseData} onChange={upd} dir={dir}
                                onNext={files => { setUploadedFiles(files); next("options"); }}
                                onBack={() => back("options")} />}
      {step === "outline"  && <CourseOutlineScreen courseData={courseData}
                                onDone={handleOutlineDone}
                                onBack={() => back("outline")} />}
    </>
  );
}


/* ═══════════════════════════════════════════════════════════════════════════
   COURSE BUILDER WORKSPACE — 3-panel interactive authoring environment
   ─────────────────────────────────────────────────────────────────────────
   Layout:
     WorkspaceTopbar          (dark nav, full-width)
     ├── WorkspaceSidebar     (264px · course tree)
     ├── WorkspaceMain        (flex-1 · editor area)
     └── WorkspaceInspector   (272px · metadata + actions)

   Local state (no generation, no backend in this iteration):
     selectedId       — active lessonId or null (course-level view)
     expandedMods     — Set<moduleId> of open modules
     activeTab        — "overview"|"slides"|"tasks"|"test"
     courseEdits      — { title, description } live edits
     lessonNotes      — { [lessonId]: string } per-lesson scratch notes
     visibility       — "draft"|"published"
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── Workspace-scoped CSS ─────────────────────────────────────────────────── */
const WorkspaceStyles = () => (
  <style>{`
    /* ── Root shell ── */
    .ws-root { height:100vh; display:flex; flex-direction:column; overflow:hidden; background:${T.bg}; }
    .ws-body  { flex:1; display:flex; overflow:hidden; min-height:0; }

    /* ── Topbar ── */
    .ws-topbar {
      display:flex; align-items:center; gap:14px; padding:0 22px;
      height:54px; flex-shrink:0;
      background:linear-gradient(135deg,#1A1035 0%,#2D1B69 100%);
      border-bottom:1px solid rgba(255,255,255,.07);
      box-shadow:0 2px 20px rgba(0,0,0,.28); z-index:30;
    }
    .ws-topbar-divider { width:1px; height:22px; background:rgba(255,255,255,.12); flex-shrink:0; }
    .ws-topbar-title { font-family:${T.dFont}; font-size:15px; font-weight:900; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .ws-topbar-sub   { font-size:11px; color:rgba(255,255,255,.45); white-space:nowrap; flex-shrink:0; }
    .ws-phase-badge  { padding:3px 10px; border-radius:999px; font-size:10px; font-weight:800; letter-spacing:.08em; text-transform:uppercase; background:rgba(108,53,222,.35); border:1.5px solid rgba(108,53,222,.6); color:#C4B5FD; flex-shrink:0; }
    .ws-spacer       { flex:1; }
    .ws-topbar-btn {
      display:inline-flex; align-items:center; gap:6px; padding:7px 16px;
      border-radius:10px; font-family:${T.dFont}; font-size:12px; font-weight:800;
      cursor:pointer; border:none; transition:all .16s; white-space:nowrap; flex-shrink:0;
    }
    .ws-topbar-btn--ghost { background:rgba(255,255,255,.1); color:rgba(255,255,255,.75); border:1.5px solid rgba(255,255,255,.2); }
    .ws-topbar-btn--ghost:hover { background:rgba(255,255,255,.18); color:#fff; }
    .ws-topbar-btn--pub { background:linear-gradient(135deg,${T.lime},#00BCD4); color:#fff; box-shadow:0 4px 14px rgba(13,184,94,.4); }
    .ws-topbar-btn--pub:hover { filter:brightness(1.08); transform:translateY(-1px); box-shadow:0 6px 18px rgba(13,184,94,.5); }
    .ws-topbar-btn--pub:active { transform:translateY(0); }

    /* ── Sidebar ── */
    .ws-sidebar {
      width:264px; flex-shrink:0; background:#fff;
      border-right:2px solid ${T.border};
      display:flex; flex-direction:column; overflow:hidden;
    }
    .ws-sidebar-head {
      display:flex; align-items:center; justify-content:space-between;
      padding:12px 14px 10px; border-bottom:2px solid ${T.bg};
      flex-shrink:0;
    }
    .ws-sidebar-label { font-size:10px; font-weight:800; letter-spacing:.11em; text-transform:uppercase; color:${T.muted}; }
    .ws-sidebar-scroll { flex:1; overflow-y:auto; padding:8px 0 20px; }
    .ws-sidebar-scroll::-webkit-scrollbar { width:3px; }
    .ws-sidebar-scroll::-webkit-scrollbar-thumb { background:${T.border}; border-radius:2px; }

    /* Module header */
    .ws-mod-hd {
      display:flex; align-items:center; gap:10px;
      margin:6px 8px 2px; padding:9px 12px; border-radius:12px;
      cursor:pointer; user-select:none; transition:opacity .14s;
    }
    .ws-mod-hd:hover { opacity:.88; }
    .ws-mod-chevron { font-size:11px; color:rgba(255,255,255,.7); transition:transform .22s; flex-shrink:0; }
    .ws-mod-chevron--open { transform:rotate(90deg); }
    .ws-mod-num { width:22px; height:22px; border-radius:7px; background:rgba(255,255,255,.22); display:flex; align-items:center; justify-content:center; font-family:${T.dFont}; font-size:11px; font-weight:900; color:#fff; flex-shrink:0; }
    .ws-mod-title { font-family:${T.dFont}; font-size:12px; font-weight:900; color:#fff; flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; line-height:1.3; }
    .ws-mod-count { font-size:10px; color:rgba(255,255,255,.65); white-space:nowrap; flex-shrink:0; }

    /* Lesson row */
    .ws-lesson-row {
      display:flex; align-items:center; gap:9px;
      padding:8px 12px 8px 30px;
      cursor:pointer; transition:all .14s;
      border-left:3px solid transparent;
      position:relative;
    }
    .ws-lesson-row:hover { background:${T.bg}; }
    .ws-lesson-row--active { background:${T.violetL}; border-left-color:${T.violet}; }
    .ws-lesson-row--active .ws-lesson-title { color:${T.violet}; }
    .ws-lesson-num { font-size:10px; font-weight:800; color:${T.mutedL}; min-width:16px; flex-shrink:0; font-family:${T.dFont}; }
    .ws-lesson-row--active .ws-lesson-num { color:${T.violet}; }
    .ws-lesson-title { font-size:12px; font-weight:700; color:${T.text}; flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; line-height:1.4; }
    .ws-lesson-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; border:2px solid ${T.border}; background:#fff; transition:all .15s; }
    .ws-lesson-dot--idle       { background:#fff; border-color:${T.border}; }
    .ws-lesson-dot--pending    { background:#fff; border-color:${T.border}; }
    .ws-lesson-dot--partial    { background:${T.amber}; border-color:${T.amber}; box-shadow:0 0 0 2px ${T.amberL}; }
    .ws-lesson-dot--ready      { background:${T.lime}; border-color:${T.lime}; box-shadow:0 0 0 2px ${T.limeL}; }
    .ws-lesson-dot--done       { background:${T.lime}; border-color:${T.lime}; box-shadow:0 0 0 2px ${T.limeL}; }
    .ws-lesson-dot--error      { background:${T.red};  border-color:${T.red};  box-shadow:0 0 0 2px ${T.redL}; }
    .ws-lesson-dot--generating { background:${T.violet}; border-color:${T.violet}; box-shadow:0 0 0 2px ${T.violetL}; animation:genPulse .9s ease-in-out infinite; }

    /* Sidebar progress strip */
    .ws-sidebar-foot {
      flex-shrink:0; padding:10px 12px;
      border-top:2px solid ${T.bg}; background:#fff;
    }

    /* ── Main area ── */
    .ws-main { flex:1; display:flex; flex-direction:column; overflow:hidden; min-width:0; }
    .ws-main-scroll { flex:1; overflow-y:auto; padding:28px 32px 48px; }
    .ws-main-scroll::-webkit-scrollbar { width:4px; }
    .ws-main-scroll::-webkit-scrollbar-thumb { background:${T.border}; border-radius:2px; }

    /* Breadcrumb bar */
    .ws-breadcrumb {
      display:flex; align-items:center; gap:6px;
      padding:10px 32px; flex-shrink:0;
      background:#fff; border-bottom:2px solid ${T.border};
      font-size:12px; font-weight:600; color:${T.muted};
    }
    .ws-breadcrumb-sep { color:${T.border}; font-size:14px; }
    .ws-breadcrumb-active { color:${T.violet}; font-weight:800; }
    .ws-breadcrumb-link { cursor:pointer; transition:color .13s; }
    .ws-breadcrumb-link:hover { color:${T.text}; }

    /* Tab bar */
    .ws-tabs { display:flex; align-items:center; gap:2px; flex-shrink:0; padding:0 32px; background:#fff; border-bottom:2px solid ${T.border}; }
    .ws-tab {
      display:flex; align-items:center; gap:6px;
      padding:12px 18px; font-family:${T.dFont}; font-size:13px; font-weight:800;
      color:${T.muted}; cursor:pointer; border:none; background:transparent;
      border-bottom:3px solid transparent; margin-bottom:-2px;
      transition:all .15s; white-space:nowrap;
    }
    .ws-tab:hover { color:${T.text}; }
    .ws-tab--active { color:${T.violet}; border-bottom-color:${T.violet}; }
    .ws-tab-badge { padding:2px 7px; border-radius:999px; font-size:10px; font-weight:800; background:${T.bg}; color:${T.muted}; }
    .ws-tab--active .ws-tab-badge { background:${T.violetL}; color:${T.violet}; }

    /* Editor card */
    .ws-card {
      background:#fff; border:2px solid ${T.border}; border-radius:20px;
      padding:24px 26px; animation:fadeUp .3s both;
    }
    .ws-card + .ws-card { margin-top:16px; }
    .ws-card-title { font-family:${T.dFont}; font-size:13px; font-weight:900; color:${T.text}; margin-bottom:14px; display:flex; align-items:center; gap:8px; }
    .ws-card-label { font-size:10px; font-weight:800; letter-spacing:.1em; text-transform:uppercase; color:${T.muted}; margin-bottom:8px; display:block; }

    /* Editable fields */
    .ws-input {
      width:100%; border:2px solid ${T.border}; border-radius:12px;
      padding:11px 14px; font-family:${T.bFont}; font-size:14px; color:${T.text};
      background:${T.bg}; outline:none; transition:border-color .16s, box-shadow .16s;
    }
    .ws-input:focus { border-color:${T.violet}; box-shadow:0 0 0 3px ${T.violetL}; background:#fff; }
    .ws-input::placeholder { color:${T.mutedL}; }
    .ws-title-input {
      width:100%; border:2px solid transparent; border-radius:12px;
      padding:8px 10px; font-family:${T.dFont}; font-size:26px; font-weight:900;
      color:${T.text}; background:transparent; outline:none;
      transition:border-color .16s, background .16s; resize:none; overflow:hidden;
      line-height:1.25;
    }
    .ws-title-input:hover { background:${T.bg}; border-color:${T.border}; }
    .ws-title-input:focus { border-color:${T.violet}; background:#fff; box-shadow:0 0 0 3px ${T.violetL}; }
    .ws-ta {
      width:100%; border:2px solid ${T.border}; border-radius:12px;
      padding:11px 14px; font-family:${T.bFont}; font-size:13px; color:${T.sub};
      background:${T.bg}; outline:none; resize:vertical; line-height:1.65;
      transition:border-color .16s, box-shadow .16s; min-height:80px;
    }
    .ws-ta:focus { border-color:${T.violet}; box-shadow:0 0 0 3px ${T.violetL}; background:#fff; }

    /* Chip */
    .ws-chip {
      display:inline-flex; align-items:center; gap:5px;
      padding:5px 12px; border-radius:999px; font-size:11px; font-weight:800;
      letter-spacing:.04em; border:1.5px solid currentColor; white-space:nowrap;
    }

    /* Module overview card */
    .ws-mod-card {
      border-radius:16px; overflow:hidden; border:2px solid ${T.border};
      transition:box-shadow .16s, transform .16s; cursor:pointer;
    }
    .ws-mod-card:hover { box-shadow:0 6px 20px rgba(108,53,222,.13); transform:translateY(-2px); }

    /* Slide placeholder */
    .ws-slide-ph {
      background:${T.bg}; border:2px solid ${T.border}; border-radius:14px;
      padding:16px; display:flex; flex-direction:column; gap:8px;
      border-top:4px solid ${T.border};
    }
    .ws-slide-ph-line { height:9px; border-radius:4px; background:${T.border}; }

    /* Content empty state */
    .ws-empty {
      display:flex; flex-direction:column; align-items:center; justify-content:center;
      padding:56px 24px; text-align:center;
    }
    .ws-empty-icon { font-size:52px; margin-bottom:18px; opacity:.65; }
    .ws-empty-title { font-family:${T.dFont}; font-size:18px; font-weight:900; color:${T.text}; margin-bottom:8px; }
    .ws-empty-sub   { font-size:13px; color:${T.sub}; line-height:1.7; max-width:320px; margin-bottom:24px; }

    /* ── Inspector ── */
    .ws-inspector { width:272px; flex-shrink:0; background:#fff; border-left:2px solid ${T.border}; overflow-y:auto; display:flex; flex-direction:column; }
    .ws-inspector::-webkit-scrollbar { width:3px; }
    .ws-inspector::-webkit-scrollbar-thumb { background:${T.border}; border-radius:2px; }
    .ws-insp-sec { padding:14px 16px; border-bottom:2px solid ${T.bg}; }
    .ws-insp-hd { font-size:10px; font-weight:800; letter-spacing:.1em; text-transform:uppercase; color:${T.muted}; margin-bottom:10px; }
    .ws-insp-row { display:flex; justify-content:space-between; align-items:center; font-size:12px; padding:4px 0; }
    .ws-insp-key { color:${T.muted}; font-weight:600; }
    .ws-insp-val { font-weight:800; color:${T.text}; text-align:right; max-width:140px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

    /* Visibility radio */
    .ws-vis-opt {
      display:flex; align-items:center; gap:10px; padding:9px 12px;
      border-radius:11px; cursor:pointer; border:2px solid ${T.border};
      transition:all .14s; margin-bottom:7px; background:#fff;
    }
    .ws-vis-opt:last-child { margin-bottom:0; }
    .ws-vis-opt--on { border-color:${T.violet}; background:${T.violetL}; }
    .ws-vis-radio { width:16px; height:16px; border-radius:50%; border:2px solid ${T.border}; background:#fff; flex-shrink:0; display:flex; align-items:center; justify-content:center; transition:all .14s; }
    .ws-vis-opt--on .ws-vis-radio { border-color:${T.violet}; background:${T.violet}; }
    .ws-vis-radio-dot { width:6px; height:6px; border-radius:50%; background:#fff; }
    .ws-vis-lbl { font-size:12px; font-weight:800; color:${T.text}; flex:1; }
    .ws-vis-sub { font-size:11px; color:${T.muted}; }
    .ws-vis-opt--on .ws-vis-lbl { color:${T.violet}; }

    /* Content status indicator */
    .ws-content-row { display:flex; align-items:center; gap:10px; padding:8px 0; border-bottom:1.5px solid ${T.bg}; }
    .ws-content-row:last-child { border-bottom:none; }
    .ws-content-icon { width:32px; height:32px; border-radius:10px; display:flex; align-items:center; justify-content:center; font-size:16px; flex-shrink:0; }
    .ws-content-info { flex:1; min-width:0; }
    .ws-content-lbl  { font-size:12px; font-weight:800; color:${T.text}; }
    .ws-content-hint { font-size:10px; color:${T.muted}; margin-top:1px; }
    .ws-content-pill { padding:2px 9px; border-radius:999px; font-size:10px; font-weight:800; white-space:nowrap; }
    .ws-content-pill--pending { background:${T.bg}; color:${T.muted}; border:1.5px solid ${T.border}; }
    .ws-content-pill--ready   { background:${T.limeL}; color:${T.lime}; border:1.5px solid rgba(13,184,94,.28); }
    .ws-content-pill--partial { background:${T.amberL}; color:${T.amber}; border:1.5px solid rgba(245,166,35,.35); }
    .ws-content-pill--done    { background:${T.limeL}; color:${T.lime}; border:1.5px solid rgba(13,184,94,.28); }
    .ws-content-pill--gen     { background:${T.violetL}; color:${T.violet}; border:1.5px solid ${T.violet}44; animation:genPulse 1.2s ease-in-out infinite; }

    /* Inspector action buttons */
    .ws-act-btn {
      display:flex; align-items:center; gap:8px; width:100%; padding:9px 12px;
      border-radius:10px; border:2px solid ${T.border}; background:#fff;
      font-size:12px; font-weight:800; color:${T.text}; cursor:pointer;
      transition:all .14s; font-family:${T.bFont}; text-align:left;
    }
    .ws-act-btn + .ws-act-btn { margin-top:6px; }
    .ws-act-btn:hover:not(:disabled) { border-color:${T.violet}; color:${T.violet}; background:${T.violetL}; }
    .ws-act-btn:disabled { opacity:.38; cursor:not-allowed; }
    .ws-act-btn--generate { background:linear-gradient(135deg,${T.violet},${T.pink}); border-color:transparent; color:#fff; box-shadow:0 4px 14px rgba(108,53,222,.35); }
    .ws-act-btn--generate:hover:not(:disabled) { filter:brightness(1.07); transform:translateY(-1px); box-shadow:0 6px 18px rgba(108,53,222,.45); color:#fff; background:linear-gradient(135deg,${T.violet},${T.pink}); border-color:transparent; }
    .ws-act-btn--danger { color:${T.red}; border-color:rgba(239,68,68,.25); }
    .ws-act-btn--danger:hover:not(:disabled) { border-color:${T.red}; background:${T.redL}; color:${T.red}; }
    .ws-act-btn-icon { width:22px; height:22px; border-radius:7px; background:rgba(255,255,255,.2); display:flex; align-items:center; justify-content:center; font-size:11px; flex-shrink:0; }
    .ws-act-btn--generate .ws-act-btn-icon { background:rgba(255,255,255,.18); }

    /* Save toast */
    .ws-toast { position:fixed; bottom:24px; right:24px; z-index:9999; background:#1A1035; color:#fff; padding:10px 18px; border-radius:12px; font-size:13px; font-weight:700; display:flex; align-items:center; gap:8px; animation:saveFlash 2.4s ease both; pointer-events:none; box-shadow:0 8px 24px rgba(0,0,0,.25); }

    /* Lesson note textarea */
    .ws-note-ta { width:100%; border:2px solid ${T.border}; border-radius:10px; padding:9px 12px; font-size:12px; font-family:${T.bFont}; color:${T.sub}; background:${T.bg}; outline:none; resize:none; min-height:60px; line-height:1.6; transition:border-color .15s; }
    .ws-note-ta:focus { border-color:${T.violet}; background:#fff; }
    .ws-note-ta::placeholder { color:${T.mutedL}; }

    /* Slide deck grid */
    .ws-slides-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:14px; }

    /* Task placeholder */
    .ws-task-ph { background:#fff; border:2px solid ${T.border}; border-radius:16px; padding:16px 18px; display:flex; align-items:flex-start; gap:12px; }
    .ws-task-ph-icon { width:38px; height:38px; border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:18px; flex-shrink:0; }

    /* Test question placeholder */
    .ws-q-ph { background:#fff; border:2px solid ${T.border}; border-radius:16px; padding:18px 20px; }
    .ws-q-opts { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:12px; }
    .ws-q-opt-ph { height:36px; border-radius:10px; background:${T.bg}; border:2px solid ${T.border}; display:flex; align-items:center; padding:0 12px; gap:8px; }

    @media (max-width: 1100px) { .ws-inspector { display:none; } }
    @media (max-width: 860px)  { .ws-sidebar   { display:none; } }

    /* ── Inline editing ── */
    .ws-inline-input {
      background:rgba(255,255,255,.18); border:1.5px solid rgba(255,255,255,.45);
      border-radius:7px; padding:3px 8px; font-family:${T.dFont}; font-size:12px;
      font-weight:900; color:#fff; outline:none; width:100%; min-width:0; flex:1;
    }
    .ws-inline-input::placeholder { color:rgba(255,255,255,.45); }
    .ws-inline-input:focus { background:rgba(255,255,255,.28); border-color:rgba(255,255,255,.75); }
    .ws-inline-input--lesson {
      background:transparent; border:1.5px solid transparent; color:${T.text};
      font-family:${T.bFont}; font-size:12px; font-weight:700; padding:2px 6px; border-radius:6px;
    }
    .ws-inline-input--lesson:focus { background:#fff; border-color:${T.violet}; box-shadow:0 0 0 2px ${T.violetL}; }
    .ws-mod-input {
      background:rgba(255,255,255,.18); border:1.5px solid rgba(255,255,255,.45);
      border-radius:8px; padding:4px 9px; font-family:${T.dFont}; font-size:14px;
      font-weight:900; color:#fff; outline:none; flex:1; min-width:0;
    }
    .ws-mod-input:focus { background:rgba(255,255,255,.28); border-color:rgba(255,255,255,.8); }

    /* Add rows */
    .ws-add-row {
      display:flex; align-items:center; gap:7px;
      padding:7px 12px 7px 30px; cursor:pointer;
      color:${T.muted}; font-size:11px; font-weight:700;
      transition:all .13s; border-radius:8px; margin:1px 6px;
      user-select:none;
    }
    .ws-add-row:hover { background:${T.violetL}; color:${T.violet}; }
    .ws-add-row--module {
      padding:8px 12px; justify-content:center;
      margin:8px 8px 0; border:2px dashed ${T.border};
      border-radius:12px;
    }
    .ws-add-row--module:hover { border-color:${T.violet}; background:${T.violetL}; color:${T.violet}; }

    /* Hover-reveal icons */
    .ws-hover-group { position:relative; }
    .ws-hover-actions {
      display:flex; align-items:center; gap:3px;
      opacity:0; transition:opacity .13s; flex-shrink:0;
    }
    .ws-hover-group:hover .ws-hover-actions,
    .ws-lesson-row:hover .ws-hover-actions { opacity:1; }

    /* Small icon button */
    .ws-icon-btn {
      width:20px; height:20px; border-radius:6px; border:none; cursor:pointer;
      display:flex; align-items:center; justify-content:center; font-size:10px;
      transition:all .13s; background:transparent; flex-shrink:0;
      color:${T.muted}; padding:0; line-height:1;
    }
    .ws-icon-btn:hover               { background:${T.bg};    color:${T.text}; }
    .ws-icon-btn--del:hover          { background:${T.redL};  color:${T.red};  }
    .ws-icon-btn--light              { color:rgba(255,255,255,.65); }
    .ws-icon-btn--light:hover        { background:rgba(255,255,255,.22); color:#fff; }
    .ws-icon-btn--light.ws-icon-btn--del:hover { background:rgba(239,68,68,.28); color:#FCA5A5; }

    /* Inline confirm strip */
    .ws-confirm-strip {
      display:flex; align-items:center; gap:5px;
      background:${T.redL}; border:1.5px solid rgba(239,68,68,.25);
      border-radius:9px; padding:5px 9px;
      margin:2px 6px 2px 28px; animation:fadeIn .15s both;
    }
    .ws-confirm-strip--mod { margin:2px 6px; }

    /* Lesson title editor (main area) */
    .ws-lesson-h1 {
      width:100%; border:2px solid transparent; border-radius:10px;
      padding:6px 10px; font-family:${T.dFont}; font-size:22px; font-weight:900;
      color:${T.text}; background:transparent; outline:none; resize:none;
      line-height:1.25; transition:border-color .15s, background .15s;
    }
    .ws-lesson-h1:hover { background:${T.bg}; border-color:${T.border}; }
    .ws-lesson-h1:focus { border-color:${T.violet}; background:#fff; box-shadow:0 0 0 3px ${T.violetL}; }

    /* Inspector editable fields */
    .ws-insp-input {
      width:100%; border:2px solid ${T.border}; border-radius:9px;
      padding:7px 10px; font-family:${T.bFont}; font-size:12px; font-weight:700;
      color:${T.text}; background:${T.bg}; outline:none;
      transition:border-color .15s, box-shadow .15s;
    }
    .ws-insp-input:focus { border-color:${T.violet}; box-shadow:0 0 0 2px ${T.violetL}; background:#fff; }
    .ws-insp-ta {
      width:100%; border:2px solid ${T.border}; border-radius:9px;
      padding:7px 10px; font-family:${T.bFont}; font-size:11px;
      color:${T.sub}; background:${T.bg}; outline:none; resize:none;
      line-height:1.6; min-height:58px; transition:border-color .15s;
    }
    .ws-insp-ta:focus { border-color:${T.violet}; box-shadow:0 0 0 2px ${T.violetL}; background:#fff; }
    .ws-insp-ta::placeholder, .ws-insp-input::placeholder { color:${T.mutedL}; }

    /* ══════════════════════════════════════════════════════
       LESSON CONTENT SECTIONS
       Each section: header bar + body.
       ══════════════════════════════════════════════════════ */

    /* Wrapper */
    .ls-section {
      border-radius:20px; overflow:hidden;
      border:2px solid ${T.border};
      animation:fadeUp .35s both;
    }
    .ls-section + .ls-section { margin-top:16px; }

    /* Gradient header bar */
    .ls-section-hd {
      display:flex; align-items:center; gap:10px;
      padding:13px 18px; min-height:52px;
    }
    .ls-section-hd-icon {
      width:32px; height:32px; border-radius:10px;
      background:rgba(255,255,255,.2); display:flex;
      align-items:center; justify-content:center;
      font-size:16px; flex-shrink:0;
    }
    .ls-section-hd-title {
      font-family:${T.dFont}; font-size:14px; font-weight:900;
      color:#fff; flex:1; white-space:nowrap;
    }
    .ls-section-count {
      padding:3px 10px; border-radius:999px; font-size:10px; font-weight:800;
      background:rgba(255,255,255,.2); color:rgba(255,255,255,.9);
      border:1.5px solid rgba(255,255,255,.3); white-space:nowrap; flex-shrink:0;
    }
    .ls-section-count--ready {
      background:rgba(255,255,255,.3); color:#fff;
    }

    /* Header action buttons */
    .ls-hd-btn {
      display:inline-flex; align-items:center; gap:5px;
      padding:5px 13px; border-radius:9px; font-size:11px; font-weight:800;
      cursor:pointer; border:1.5px solid rgba(255,255,255,.4);
      background:rgba(255,255,255,.15); color:#fff;
      transition:all .15s; white-space:nowrap; flex-shrink:0;
      font-family:${T.dFont}; letter-spacing:.02em;
    }
    .ls-hd-btn:hover:not(:disabled) { background:rgba(255,255,255,.3); border-color:rgba(255,255,255,.7); }
    .ls-hd-btn:disabled { opacity:.38; cursor:not-allowed; }
    .ls-hd-btn--ai {
      background:rgba(255,255,255,.22); border-color:rgba(255,255,255,.55);
    }
    .ls-hd-btn--ai:hover:not(:disabled) { background:rgba(255,255,255,.35); }

    /* Section body */
    .ls-section-body { background:#fff; padding:20px 22px 24px; }

    /* Compact empty state (inside a section) */
    .ls-empty {
      display:flex; flex-direction:column; align-items:center;
      padding:28px 20px 24px; text-align:center;
    }
    .ls-empty-icon   { font-size:38px; margin-bottom:10px; opacity:.55; }
    .ls-empty-title  { font-family:${T.dFont}; font-size:15px; font-weight:900; color:${T.text}; margin-bottom:6px; }
    .ls-empty-sub    { font-size:12px; color:${T.sub}; line-height:1.7; max-width:320px; margin-bottom:18px; }

    /* ── Slide cards ── */
    .ls-slide-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(200px,1fr)); gap:12px; }
    .ls-slide-card {
      border:2px solid ${T.border}; border-radius:14px; overflow:hidden;
      display:flex; flex-direction:column;
      transition:box-shadow .15s, transform .15s; cursor:pointer;
    }
    .ls-slide-card:hover { box-shadow:0 4px 16px rgba(108,53,222,.14); transform:translateY(-2px); }
    .ls-slide-thumb {
      height:112px; background:${T.bg};
      border-bottom:2px solid ${T.border};
      display:flex; flex-direction:column; gap:6px;
      padding:14px 16px; position:relative; overflow:hidden;
    }
    .ls-slide-num {
      position:absolute; top:8px; right:10px;
      font-size:10px; font-weight:800; color:${T.mutedL}; font-family:${T.dFont};
    }
    .ls-slide-line { height:8px; border-radius:4px; background:${T.border}; }
    .ls-slide-footer {
      padding:8px 12px; display:flex; align-items:center; gap:8px; background:#fff;
    }
    .ls-slide-title-ph { flex:1; height:9px; border-radius:4px; background:${T.border}; }

    /* ── Task cards ── */
    .ls-task-card {
      display:flex; align-items:flex-start; gap:14px;
      padding:14px 16px; border:2px solid ${T.border};
      border-radius:16px; background:#fff;
      transition:box-shadow .15s, border-color .15s; cursor:pointer;
    }
    .ls-task-card:hover { border-color:${T.sky}; box-shadow:0 4px 14px rgba(0,153,230,.1); }
    .ls-task-icon {
      width:40px; height:40px; border-radius:12px;
      display:flex; align-items:center; justify-content:center;
      font-size:18px; flex-shrink:0;
    }
    .ls-task-body  { flex:1; min-width:0; }
    .ls-task-label { font-size:12px; font-weight:800; margin-bottom:4px; }
    .ls-task-desc  { font-size:12px; color:${T.sub}; line-height:1.6; }
    .ls-task-badge {
      padding:3px 9px; border-radius:999px; font-size:10px; font-weight:800;
      background:${T.bg}; color:${T.muted}; border:1.5px solid ${T.border};
      white-space:nowrap; flex-shrink:0; align-self:flex-start;
    }

    /* ── Question cards ── */
    .ls-q-card {
      border:2px solid ${T.border}; border-radius:16px;
      padding:16px 18px; background:#fff;
      transition:box-shadow .15s, border-color .15s; cursor:pointer;
    }
    .ls-q-card:hover { border-color:${T.lime}; box-shadow:0 4px 14px rgba(13,184,94,.1); }
    .ls-q-hd { display:flex; align-items:flex-start; gap:10px; margin-bottom:10px; }
    .ls-q-num {
      width:26px; height:26px; border-radius:8px; flex-shrink:0;
      display:flex; align-items:center; justify-content:center;
      font-family:${T.dFont}; font-size:11px; font-weight:900; color:#fff;
    }
    .ls-q-text { flex:1; min-width:0; font-size:13px; font-weight:700; color:${T.text}; line-height:1.5; }
    .ls-q-opts { display:grid; grid-template-columns:1fr 1fr; gap:7px; }
    .ls-q-opt {
      display:flex; align-items:center; gap:8px;
      height:34px; border-radius:9px;
      background:${T.bg}; border:1.5px solid ${T.border};
      padding:0 11px; font-size:11px; font-weight:700; color:${T.sub};
      transition:all .14s; cursor:pointer;
    }
    .ls-q-opt:hover { border-color:${T.lime}; background:${T.limeL}; color:${T.text}; }
    .ls-q-opt--correct { border-color:${T.lime}; background:${T.limeL}; color:${T.lime}; }
    .ls-q-opt-key {
      width:17px; height:17px; border-radius:5px; flex-shrink:0;
      background:rgba(0,0,0,.06); display:flex; align-items:center;
      justify-content:center; font-family:${T.dFont}; font-size:9px; font-weight:900; color:${T.muted};
    }

    /* ── Material rows ── */
    .ls-mat-row {
      display:flex; align-items:center; gap:12px;
      padding:10px 14px; border:2px solid ${T.border};
      border-radius:13px; background:#fff;
      transition:border-color .14s, box-shadow .14s; cursor:default;
    }
    .ls-mat-row + .ls-mat-row { margin-top:8px; }
    .ls-mat-row:hover { border-color:${T.amber}; box-shadow:0 3px 12px rgba(245,166,35,.12); }
    .ls-mat-icon {
      width:36px; height:36px; border-radius:10px;
      display:flex; align-items:center; justify-content:center;
      font-size:17px; flex-shrink:0; background:${T.amberL};
    }
    .ls-mat-name { flex:1; font-size:13px; font-weight:700; color:${T.text}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .ls-mat-meta { font-size:11px; color:${T.muted}; font-weight:600; white-space:nowrap; flex-shrink:0; }

    /* Divider with label */
    .ls-divider {
      display:flex; align-items:center; gap:10px;
      margin:20px 0 16px; color:${T.mutedL}; font-size:11px; font-weight:700;
      letter-spacing:.08em; text-transform:uppercase;
    }
    .ls-divider::before, .ls-divider::after {
      content:""; flex:1; height:1.5px; background:${T.border};
    }

    /* Ghost shimmer */
    .ls-ghost { background:${T.bg}; border-radius:8px; animation:shimmer 1.6s infinite linear; background-size:600px 100%;
      background-image:linear-gradient(90deg,${T.bg} 25%,${T.border} 50%,${T.bg} 75%); }

    /* ══════════════════════════════════════════════════════
       GENERATION UX
       ══════════════════════════════════════════════════════ */

    @keyframes spin      { to { transform: rotate(360deg); } }
    @keyframes genPulse  { 0%,100%{opacity:.7} 50%{opacity:1} }
    @keyframes stepSlide { from{opacity:0;transform:translateX(-8px)} to{opacity:1;transform:translateX(0)} }
    @keyframes barFill   { from{width:0%} to{width:var(--bar-w)} }

    /* Generate CTA banner (idle state, no content yet) */
    .gen-cta {
      background:linear-gradient(135deg,${T.violet} 0%,${T.pink} 100%);
      border-radius:18px; padding:24px 26px; margin-bottom:16px;
      display:flex; align-items:center; gap:20px;
      box-shadow:0 8px 28px rgba(108,53,222,.28);
      animation:fadeUp .35s both;
    }
    .gen-cta-icon {
      width:52px; height:52px; border-radius:16px;
      background:rgba(255,255,255,.18); display:flex;
      align-items:center; justify-content:center;
      font-size:26px; flex-shrink:0;
    }
    .gen-cta-title { font-family:${T.dFont}; font-size:18px; font-weight:900; color:#fff; margin-bottom:4px; }
    .gen-cta-sub   { font-size:12px; color:rgba(255,255,255,.75); line-height:1.6; max-width:400px; }
    .gen-cta-btn {
      display:inline-flex; align-items:center; gap:8px;
      padding:12px 22px; border-radius:12px; border:none; cursor:pointer;
      background:#fff; color:${T.violet}; font-family:${T.dFont};
      font-size:14px; font-weight:900;
      box-shadow:0 4px 16px rgba(0,0,0,.18);
      transition:all .18s; white-space:nowrap; flex-shrink:0;
    }
    .gen-cta-btn:hover { transform:translateY(-2px) scale(1.02); box-shadow:0 8px 24px rgba(0,0,0,.22); }
    .gen-cta-btn:active { transform:translateY(0) scale(1); }
    .gen-cta-btn:disabled { opacity:.55; cursor:not-allowed; transform:none; }

    /* Generating progress card */
    .gen-progress {
      background:#fff; border:2px solid ${T.border}; border-radius:18px;
      padding:22px 24px; margin-bottom:16px;
      animation:fadeUp .25s both;
    }
    .gen-progress-hd {
      display:flex; align-items:center; gap:12px; margin-bottom:16px;
    }
    .gen-spinner {
      width:28px; height:28px; border-radius:50%;
      border:3px solid ${T.violetL}; border-top-color:${T.violet};
      animation:spin .75s linear infinite; flex-shrink:0;
    }
    .gen-progress-title { font-family:${T.dFont}; font-size:15px; font-weight:900; color:${T.text}; }
    .gen-progress-sub   { font-size:12px; color:${T.muted}; margin-top:2px; animation:genPulse 1.8s ease-in-out infinite; }
    .gen-bar-track { height:6px; background:${T.border}; border-radius:999px; overflow:hidden; margin-bottom:14px; }
    .gen-bar-fill  { height:100%; border-radius:999px; background:linear-gradient(90deg,${T.violet},${T.pink}); transition:width .6s cubic-bezier(.4,0,.2,1); }

    /* Step list */
    .gen-steps { display:flex; flex-direction:column; gap:6px; }
    .gen-step {
      display:flex; align-items:center; gap:10px;
      font-size:12px; font-weight:600;
      animation:stepSlide .25s both;
    }
    .gen-step-dot {
      width:18px; height:18px; border-radius:50%; flex-shrink:0;
      display:flex; align-items:center; justify-content:center;
      font-size:9px; font-weight:900; transition:all .3s;
    }
    .gen-step--done  .gen-step-dot { background:${T.limeL}; color:${T.lime}; }
    .gen-step--active .gen-step-dot { background:${T.violetL}; border:2px solid ${T.violet}; animation:genPulse 1s ease-in-out infinite; }
    .gen-step--wait  .gen-step-dot { background:${T.bg}; border:2px solid ${T.border}; }
    .gen-step--done  { color:${T.sub}; }
    .gen-step--active { color:${T.violet}; font-weight:800; }
    .gen-step--wait  { color:${T.mutedL}; }

    /* Done banner */
    .gen-done {
      background:${T.limeL}; border:2px solid rgba(13,184,94,.28); border-radius:14px;
      padding:13px 18px; margin-bottom:16px;
      display:flex; align-items:center; gap:12px;
      animation:fadeUp .3s both;
    }
    .gen-done-icon { width:34px; height:34px; border-radius:11px; background:${T.lime}; display:flex; align-items:center; justify-content:center; font-size:16px; color:#fff; flex-shrink:0; }
    .gen-done-title { font-family:${T.dFont}; font-size:13px; font-weight:900; color:${T.green}; }
    .gen-done-sub   { font-size:11px; color:${T.sub}; margin-top:1px; }
    .gen-done-regen {
      margin-left:auto; flex-shrink:0;
      display:inline-flex; align-items:center; gap:5px;
      padding:6px 13px; border-radius:9px; border:1.5px solid rgba(13,184,94,.35);
      background:#fff; color:${T.green}; font-family:${T.dFont};
      font-size:11px; font-weight:800; cursor:pointer; transition:all .15s;
    }
    .gen-done-regen:hover { background:${T.limeL}; border-color:${T.lime}; }

    /* Error banner */
    .gen-error {
      background:${T.redL}; border:2px solid rgba(239,68,68,.22); border-radius:14px;
      padding:13px 18px; margin-bottom:16px;
      display:flex; align-items:center; gap:12px;
      animation:fadeUp .3s both;
    }

    /* Section generating overlay */
    .ls-section--generating { opacity:.55; pointer-events:none; transition:opacity .3s; }
    .ls-section--generating .ls-section-hd { filter:saturate(.6); }

    /* Inspector generate button override */
    .ws-act-btn--generate-live {
      background:linear-gradient(135deg,${T.violet},${T.pink}); border-color:transparent;
      color:#fff; box-shadow:0 4px 14px rgba(108,53,222,.35);
    }
    .ws-act-btn--generate-live:hover:not(:disabled) {
      filter:brightness(1.08); transform:translateY(-1px);
      box-shadow:0 6px 18px rgba(108,53,222,.45); color:#fff;
      background:linear-gradient(135deg,${T.violet},${T.pink}); border-color:transparent;
    }
    .ws-act-btn--regen {
      background:${T.limeL}; border-color:rgba(13,184,94,.3); color:${T.green};
    }
    .ws-act-btn--regen:hover:not(:disabled) { background:rgba(13,184,94,.15); border-color:${T.lime}; color:${T.green}; }

    /* ══════════════════════════════════════════════════════
       MATERIALS / RAG UX
       ══════════════════════════════════════════════════════ */

    /* Teal RAG-ready badge (reusable) */
    .rag-chip {
      display:inline-flex; align-items:center; gap:4px;
      padding:2px 9px; border-radius:999px;
      font-size:10px; font-weight:800; letter-spacing:.04em;
      background:rgba(0,188,212,.12); color:#00838F;
      border:1.5px solid rgba(0,188,212,.28);
      white-space:nowrap; flex-shrink:0;
    }
    .rag-chip--live { animation:ragPulse 2s ease-in-out infinite; }
    .rag-chip--sm   { font-size:9px; padding:1px 7px; }

    /* Materials section inner layout overrides */
    .mat-rag-banner {
      border-radius:14px; padding:14px 18px; margin-bottom:16px;
      background:linear-gradient(135deg,rgba(0,188,212,.1) 0%,rgba(13,184,94,.08) 100%);
      border:1.5px solid rgba(0,188,212,.22);
      display:flex; align-items:flex-start; gap:12px;
    }
    .mat-rag-banner-icon {
      width:36px; height:36px; border-radius:11px; flex-shrink:0;
      background:linear-gradient(135deg,${T.teal},${T.lime});
      display:flex; align-items:center; justify-content:center; font-size:17px;
    }
    .mat-rag-banner-title { font-family:${T.dFont}; font-size:13px; font-weight:900; color:#00838F; margin-bottom:3px; }
    .mat-rag-banner-sub   { font-size:11px; color:${T.sub}; line-height:1.65; }

    /* Individual file card */
    .mat-file-card {
      display:flex; align-items:center; gap:12px;
      padding:10px 14px; border-radius:13px;
      border:2px solid ${T.border}; background:#fff;
      transition:border-color .14s, box-shadow .14s;
    }
    .mat-file-card + .mat-file-card { margin-top:8px; }
    .mat-file-card:hover { border-color:${T.teal}; box-shadow:0 3px 12px rgba(0,188,212,.1); }
    .mat-file-icon {
      width:36px; height:36px; border-radius:10px; flex-shrink:0;
      display:flex; align-items:center; justify-content:center; font-size:17px;
    }
    .mat-file-name { font-size:12px; font-weight:700; color:${T.text}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .mat-file-meta { font-size:10px; color:${T.muted}; margin-top:2px; font-weight:600; }

    /* Sources strip (post-generation) */
    .mat-sources-strip {
      margin-top:14px; padding:12px 14px;
      background:${T.bg}; border-radius:12px;
      border:1.5px solid ${T.border};
    }
    .mat-sources-title { font-size:10px; font-weight:800; color:${T.muted}; letter-spacing:.08em; text-transform:uppercase; margin-bottom:8px; }
    .mat-source-row {
      display:flex; align-items:center; gap:8px;
      padding:5px 0; border-bottom:1px solid ${T.border}; font-size:11px; color:${T.sub};
    }
    .mat-source-row:last-child { border-bottom:none; }

    /* Gen CTA rag variant */
    .gen-cta--rag {
      background:linear-gradient(135deg,#00838F 0%,#0099E6 55%,${T.violet} 100%);
    }
    .gen-cta--rag .gen-cta-icon { background:rgba(255,255,255,.15); }

    /* Gen progress rag step highlight */
    .gen-step--rag-active .gen-step-dot {
      background:rgba(0,188,212,.15); border:2px solid ${T.teal};
      animation:none;
    }
    .gen-step--rag-active { color:${T.teal}; font-weight:800; }

    /* Inspector materials row */
    .insp-mat-row {
      display:flex; align-items:center; gap:8px;
      padding:7px 10px; border-radius:10px;
      background:rgba(0,188,212,.07); border:1.5px solid rgba(0,188,212,.18);
      margin-bottom:8px;
    }
    .insp-mat-count { font-family:${T.dFont}; font-size:13px; font-weight:900; color:#00838F; }
    .insp-mat-label { font-size:11px; color:${T.sub}; flex:1; }

    /* No-materials nudge in inspector */
    .insp-mat-nudge {
      padding:8px 10px; border-radius:9px;
      background:${T.bg}; border:1.5px dashed ${T.border};
      font-size:11px; color:${T.muted}; line-height:1.6; margin-bottom:8px;
    }

    /* ══════════════════════════════════════════════════════
       SLIDES — FIRST-CLASS ENTITY
       ══════════════════════════════════════════════════════ */

    /* Slide card: interactive hover reveals edit overlay */
    .ls-slide-card--interactive {
      cursor:pointer; position:relative;
    }
    .ls-slide-card--interactive:hover {
      border-color:${T.violet};
      box-shadow:0 4px 18px rgba(108,53,222,.18);
      transform:translateY(-2px);
    }
    .ls-slide-overlay {
      position:absolute; inset:0; border-radius:inherit;
      background:rgba(108,53,222,.82);
      display:flex; align-items:center; justify-content:center;
      flex-direction:column; gap:6px;
      opacity:0; transition:opacity .15s;
      pointer-events:none;
    }
    .ls-slide-card--interactive:hover .ls-slide-overlay { opacity:1; pointer-events:auto; }
    .ls-slide-overlay-label {
      font-family:${T.dFont}; font-size:11px; font-weight:900;
      color:#fff; letter-spacing:.04em;
    }

    /* Slide action strip (shown when slides exist) */
    .slides-action-strip {
      display:flex; align-items:center; gap:8px;
      padding:10px 14px; border-radius:13px;
      background:${T.violetL}; border:1.5px solid rgba(108,53,222,.2);
      margin-bottom:14px;
    }
    .slides-action-strip-title {
      flex:1; font-size:12px; font-weight:700; color:${T.violet};
    }
    .slides-action-btn {
      display:inline-flex; align-items:center; gap:5px;
      padding:6px 12px; border-radius:9px; cursor:pointer;
      font-family:${T.dFont}; font-size:11px; font-weight:800;
      border:none; transition:all .15s;
    }
    .slides-action-btn--edit {
      background:linear-gradient(135deg,${T.violet},${T.pink});
      color:#fff; box-shadow:0 3px 12px rgba(108,53,222,.3);
    }
    .slides-action-btn--edit:hover {
      filter:brightness(1.08); transform:translateY(-1px);
      box-shadow:0 5px 16px rgba(108,53,222,.4);
    }
    .slides-action-btn--view {
      background:#fff; color:${T.violet};
      border:1.5px solid rgba(108,53,222,.3);
    }
    .slides-action-btn--view:hover { background:${T.violetL}; }

    /* "Create" CTA inside empty state */
    .section-create-cta {
      margin-top:16px;
      display:flex; align-items:center; gap:10px;
      padding:14px 18px; border-radius:14px;
      background:${T.violetL}; border:2px dashed rgba(108,53,222,.3);
      cursor:pointer; transition:all .18s;
    }
    .section-create-cta:hover {
      background:rgba(108,53,222,.12); border-color:${T.violet};
      transform:translateY(-1px);
    }
    .section-create-cta--sky {
      background:${T.skyL}; border-color:rgba(0,153,230,.3);
    }
    .section-create-cta--sky:hover {
      background:rgba(0,153,230,.12); border-color:${T.sky};
    }
    .section-create-cta--teal {
      background:${T.tealL}; border-color:rgba(0,188,212,.3);
    }
    .section-create-cta--teal:hover {
      background:rgba(0,188,212,.12); border-color:${T.teal};
    }
    .section-create-cta-icon {
      width:36px; height:36px; border-radius:11px; flex-shrink:0;
      display:flex; align-items:center; justify-content:center; font-size:18px;
    }
    .section-create-cta-title {
      font-family:${T.dFont}; font-size:13px; font-weight:900; color:${T.text}; margin-bottom:2px;
    }
    .section-create-cta-sub {
      font-size:11px; color:${T.muted}; line-height:1.5;
    }
    .section-create-cta-arrow {
      margin-left:auto; font-size:18px; color:${T.mutedL}; flex-shrink:0;
      transition:transform .15s;
    }
    .section-create-cta:hover .section-create-cta-arrow { transform:translateX(3px); }

    /* ══════════════════════════════════════════════════════
       TASKS — EXTENSION POINTS
       ══════════════════════════════════════════════════════ */

    /* Task card edit affordance */
    .ls-task-card--interactive { cursor:default; }
    .ls-task-card-actions {
      display:flex; flex-direction:column; align-items:flex-end; gap:5px; flex-shrink:0;
    }
    .ls-task-edit-btn {
      display:inline-flex; align-items:center; gap:4px;
      padding:4px 10px; border-radius:8px; cursor:pointer;
      font-family:${T.dFont}; font-size:10px; font-weight:800;
      background:#fff; color:${T.muted}; border:1.5px solid ${T.border};
      transition:all .14s;
    }
    .ls-task-edit-btn:hover {
      border-color:${T.sky}; color:${T.sky}; background:${T.skyL};
    }
    /* Task type selection grid in future builder */
    .task-type-grid {
      display:grid; grid-template-columns:repeat(auto-fill,minmax(130px,1fr)); gap:8px; margin-top:12px;
    }
    .task-type-tile {
      padding:12px 10px; border-radius:12px; border:2px solid ${T.border};
      background:#fff; cursor:pointer; text-align:center; transition:all .15s;
    }
    .task-type-tile:hover {
      border-color:${T.sky}; box-shadow:0 3px 12px rgba(0,153,230,.14); transform:translateY(-1px);
    }
    .task-type-tile-emoji { font-size:22px; margin-bottom:5px; }
    .task-type-tile-label { font-family:${T.dFont}; font-size:11px; font-weight:800; color:${T.text}; }

    /* ══════════════════════════════════════════════════════
       TEST — EXTENSION POINTS
       ══════════════════════════════════════════════════════ */

    /* Question card edit affordance */
    .ls-q-card--interactive { cursor:default; }
    .ls-q-card-actions {
      display:flex; justify-content:flex-end; padding:0 4px 8px;
    }
    .ls-q-edit-btn {
      display:inline-flex; align-items:center; gap:4px;
      padding:4px 10px; border-radius:8px; cursor:pointer;
      font-family:${T.dFont}; font-size:10px; font-weight:800;
      background:#fff; color:${T.muted}; border:1.5px solid ${T.border};
      transition:all .14s;
    }
    .ls-q-edit-btn:hover {
      border-color:${T.lime}; color:${T.lime}; background:${T.limeL};
    }

    /* ══════════════════════════════════════════════════════
       BUILDER STUB MODAL
       Future task / test builders render inside this shell.
       Plug in the real builder by replacing the modal body content.
       ══════════════════════════════════════════════════════ */
    .builder-modal-backdrop {
      position:fixed; inset:0; z-index:120;
      background:rgba(26,16,53,.55); backdrop-filter:blur(4px);
      display:flex; align-items:center; justify-content:center;
      animation:fadeIn .18s both;
    }
    .builder-modal {
      width:min(560px,96vw); max-height:85vh; border-radius:22px;
      background:#fff; box-shadow:0 24px 80px rgba(0,0,0,.22);
      display:flex; flex-direction:column; overflow:hidden;
      animation:fadeUp .22s both;
    }
    .builder-modal-hd {
      padding:18px 22px 14px; border-bottom:2px solid ${T.bg};
      display:flex; align-items:center; gap:12px;
    }
    .builder-modal-hd-icon {
      width:38px; height:38px; border-radius:12px; flex-shrink:0;
      display:flex; align-items:center; justify-content:center; font-size:18px;
    }
    .builder-modal-title {
      font-family:${T.dFont}; font-size:16px; font-weight:900; color:${T.text};
    }
    .builder-modal-sub { font-size:12px; color:${T.muted}; margin-top:2px; }
    .builder-modal-close {
      margin-left:auto; width:30px; height:30px; border-radius:9px;
      background:${T.bg}; border:none; cursor:pointer; font-size:14px;
      display:flex; align-items:center; justify-content:center;
      color:${T.muted}; transition:background .14s;
    }
    .builder-modal-close:hover { background:${T.border}; }
    .builder-modal-body {
      flex:1; overflow-y:auto; padding:20px 22px;
    }
    .builder-modal-footer {
      padding:14px 22px; border-top:2px solid ${T.bg};
      display:flex; gap:10px; justify-content:flex-end;
    }
    .builder-modal-btn {
      padding:9px 20px; border-radius:11px; cursor:pointer;
      font-family:${T.dFont}; font-size:12px; font-weight:800;
      border:none; transition:all .15s;
    }
    .builder-modal-btn--primary {
      background:linear-gradient(135deg,${T.violet},${T.pink});
      color:#fff; box-shadow:0 3px 12px rgba(108,53,222,.28);
    }
    .builder-modal-btn--primary:hover { filter:brightness(1.07); transform:translateY(-1px); }
    .builder-modal-btn--ghost {
      background:${T.bg}; color:${T.muted}; border:1.5px solid ${T.border};
    }
    .builder-modal-btn--ghost:hover { background:${T.border}; }

    /* Inspector action button — live slide edit */
    .ws-act-btn--slides {
      background:linear-gradient(135deg,${T.violet},${T.pink});
      color:#fff; border-color:transparent;
      box-shadow:0 3px 10px rgba(108,53,222,.28);
    }
    .ws-act-btn--slides:hover:not(:disabled) {
      filter:brightness(1.07); transform:translateY(-1px);
      box-shadow:0 5px 16px rgba(108,53,222,.38);
      color:#fff; border-color:transparent;
      background:linear-gradient(135deg,${T.violet},${T.pink});
    }
    .ws-act-btn--task {
      background:${T.skyL}; color:${T.sky}; border-color:rgba(0,153,230,.3);
    }
    .ws-act-btn--task:hover:not(:disabled) { background:rgba(0,153,230,.15); border-color:${T.sky}; color:${T.sky}; }
    .ws-act-btn--test {
      background:${T.limeL}; color:${T.lime}; border-color:rgba(13,184,94,.3);
    }
    .ws-act-btn--test:hover:not(:disabled) { background:rgba(13,184,94,.15); border-color:${T.lime}; color:${T.lime}; }

    /* ══════════════════════════════════════════════════════
       DRAFT / SAVE INDICATOR
       ══════════════════════════════════════════════════════ */

    /* Pill shown between progress bar and save button */
    .ws-draft-pill {
      display:inline-flex; align-items:center; gap:5px;
      padding:4px 10px; border-radius:999px; flex-shrink:0;
      font-family:${T.dFont}; font-size:10px; font-weight:800;
      letter-spacing:.04em; transition:all .25s; white-space:nowrap;
    }
    .ws-draft-pill--unsaved {
      background:rgba(245,166,35,.18); color:#F5A623;
      border:1.5px solid rgba(245,166,35,.45);
    }
    .ws-draft-pill--saved {
      background:rgba(13,184,94,.12); color:rgba(13,184,94,.95);
      border:1.5px solid rgba(13,184,94,.35);
    }
    .ws-draft-pill--saving {
      background:rgba(108,53,222,.18); color:#C4B5FD;
      border:1.5px solid rgba(108,53,222,.4);
      animation:genPulse 1s ease-in-out infinite;
    }
    .ws-draft-dot { width:6px; height:6px; border-radius:50%; }
    .ws-draft-pill--unsaved .ws-draft-dot { background:#F5A623; }
    .ws-draft-pill--saved   .ws-draft-dot { background:#0DB85E; }
    .ws-draft-pill--saving  .ws-draft-dot { background:#C4B5FD; animation:genPulse 1s ease-in-out infinite; }

    /* Save button variants driven by dirty state */
    .ws-topbar-btn--save {
      background:rgba(255,255,255,.1); color:rgba(255,255,255,.6);
      border:1.5px solid rgba(255,255,255,.15);
    }
    .ws-topbar-btn--save:hover { background:rgba(255,255,255,.15); color:rgba(255,255,255,.85); }

    .ws-topbar-btn--save-dirty {
      background:linear-gradient(135deg,#F5A623,#F76D3C);
      color:#fff; border:none;
      box-shadow:0 3px 14px rgba(245,166,35,.42);
    }
    .ws-topbar-btn--save-dirty:hover {
      filter:brightness(1.07); transform:translateY(-1px);
      box-shadow:0 5px 18px rgba(245,166,35,.5);
    }
    .ws-topbar-btn--save-dirty:active { transform:translateY(0); }
  `}</style>
);

/* ── Workspace topbar ─────────────────────────────────────────────────────── */
const WorkspaceTopbar = ({ title, doneCount, totalCount, onSave, saving, onPublish, unsavedChanges, lastSavedAt }) => {
  /* Human-readable "saved X min ago" label */
  const savedLabel = useMemo(() => {
    if (!lastSavedAt) return null;
    const mins = Math.round((Date.now() - lastSavedAt) / 60000);
    if (mins < 1) return "just now";
    if (mins === 1) return "1 min ago";
    return `${mins} min ago`;
  }, [lastSavedAt, saving]); // re-compute when saving clears

  const pillClass = saving
    ? "ws-draft-pill ws-draft-pill--saving"
    : unsavedChanges
    ? "ws-draft-pill ws-draft-pill--unsaved"
    : lastSavedAt
    ? "ws-draft-pill ws-draft-pill--saved"
    : null;

  return (
    <div className="ws-topbar">
      <div style={{ width:34,height:34,borderRadius:11,background:"linear-gradient(135deg,#6C35DE,#F0447C)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0 }}>🎓</div>
      <div style={{ display:"flex",flexDirection:"column",gap:1,minWidth:0 }}>
        <span className="ws-topbar-title">{title}</span>
      </div>
      <span className="ws-phase-badge">Builder</span>
      <div className="ws-topbar-divider" />

      {/* Progress */}
      <div style={{ display:"flex",alignItems:"center",gap:9,flexShrink:0 }}>
        <div style={{ width:140,height:5,background:"rgba(255,255,255,.12)",borderRadius:999,overflow:"hidden" }}>
          <div style={{ height:"100%",background:"linear-gradient(90deg,#0DB85E,#00BCD4)",borderRadius:999,width:`${totalCount?((doneCount/totalCount)*100):0}%`,transition:"width .6s cubic-bezier(.22,.68,0,1.2)" }} />
        </div>
        <span className="ws-topbar-sub">{doneCount}/{totalCount} ready</span>
      </div>

      <div className="ws-spacer" />

      {/* Draft indicator pill */}
      {pillClass && (
        <span className={pillClass}>
          <span className="ws-draft-dot" />
          {saving ? "Saving…" : unsavedChanges ? "Unsaved changes" : `Saved ${savedLabel}`}
        </span>
      )}

      {/* Save button — highlights when there are unsaved changes */}
      <button
        className={`ws-topbar-btn ${unsavedChanges ? "ws-topbar-btn--save-dirty" : "ws-topbar-btn--save"}`}
        onClick={onSave}
        disabled={saving}
      >
        {saving ? "⏳ Saving…" : unsavedChanges ? "💾 Save changes" : "💾 Saved"}
      </button>

      <button className="ws-topbar-btn ws-topbar-btn--pub" onClick={onPublish} disabled={doneCount === 0}>
        🚀 Publish course
      </button>
    </div>
  );
};

/* ── Sidebar ──────────────────────────────────────────────────────────────── */
const WorkspaceSidebar = ({
  modules, selectedId, onSelect, expandedMods, onToggleMod,
  onAddModule, onRenameModule, onDeleteModule,
  onAddLesson, onRenameLesson, onDeleteLesson,
  lessonStatuses,
}) => {
  const [editingModId,    setEditingModId]    = useState(null);
  const [editingLessonId, setEditingLessonId] = useState(null);
  const [editVal,         setEditVal]         = useState("");
  const [confirmModId,    setConfirmModId]    = useState(null);
  const [confirmLessonId, setConfirmLessonId] = useState(null);
  const editRef = useRef(null);

  useEffect(() => { editRef.current?.focus(); }, [editingModId, editingLessonId]);

  const startEditMod = (e, mod) => {
    e.stopPropagation();
    setEditingModId(mod.id); setEditVal(mod.title);
    setEditingLessonId(null); setConfirmModId(null);
  };
  const commitEditMod = () => {
    if (editVal.trim()) onRenameModule(editingModId, editVal.trim());
    setEditingModId(null);
  };
  const startEditLesson = (e, lesson) => {
    e.stopPropagation();
    setEditingLessonId(lesson.id); setEditVal(lesson.title);
    setEditingModId(null); setConfirmLessonId(null);
  };
  const commitEditLesson = () => {
    if (editVal.trim()) onRenameLesson(editingLessonId, editVal.trim());
    setEditingLessonId(null);
  };

  const totalLessons = modules.reduce((s, m) => s + m.lessons.length, 0);
  const doneCount    = Object.values(lessonStatuses).filter(s => s === "done" || s === "ready").length;

  return (
    <div className="ws-sidebar">
      {/* Header */}
      <div className="ws-sidebar-head">
        <span className="ws-sidebar-label">Course Structure</span>
        <span style={{ fontSize:11, fontWeight:700, color:T.muted }}>{doneCount}/{totalLessons}</span>
      </div>

      {/* Course root row */}
      <div
        className={`ws-lesson-row${!selectedId ? " ws-lesson-row--active" : ""}`}
        style={{ padding:"9px 14px", borderLeft:`3px solid ${!selectedId ? T.violet : "transparent"}` }}
        onClick={() => { onSelect(null); setEditingModId(null); setEditingLessonId(null); }}
      >
        <span style={{ fontSize:14, flexShrink:0 }}>📋</span>
        <span className="ws-lesson-title" style={{ fontWeight:900, fontSize:12 }}>Course Details</span>
        {!selectedId && <span style={{ width:7,height:7,borderRadius:"50%",background:T.violet,flexShrink:0 }} />}
      </div>

      {/* Tree */}
      <div className="ws-sidebar-scroll">
        {modules.map((mod, mi) => {
          const grad    = MODULE_GRADS[mi % MODULE_GRADS.length];
          const isOpen  = expandedMods.has(mod.id);
          const modDone = mod.lessons.filter(l => lessonStatuses[l.id] === "done" || lessonStatuses[l.id] === "ready").length;
          const isEditingMod    = editingModId   === mod.id;
          const isConfirmingMod = confirmModId   === mod.id;

          return (
            <div key={mod.id}>
              {/* ── Module header ── */}
              <div
                className="ws-mod-hd ws-hover-group"
                style={{ background: grad }}
                onClick={() => { if (!isEditingMod) onToggleMod(mod.id); }}
              >
                <span className={`ws-mod-chevron${isOpen ? " ws-mod-chevron--open" : ""}`}>▶</span>
                <span className="ws-mod-num">{mi + 1}</span>

                {isEditingMod ? (
                  <input
                    ref={editRef}
                    className="ws-inline-input"
                    value={editVal}
                    onChange={e => setEditVal(e.target.value)}
                    onBlur={commitEditMod}
                    onKeyDown={e => { if (e.key === "Enter") commitEditMod(); if (e.key === "Escape") setEditingModId(null); }}
                    onClick={e => e.stopPropagation()}
                  />
                ) : (
                  <>
                    <span className="ws-mod-title">{mod.title}</span>
                    <span className="ws-mod-count">{modDone}/{mod.lessons.length}</span>
                  </>
                )}

                {!isEditingMod && (
                  <div className="ws-hover-actions" onClick={e => e.stopPropagation()}>
                    <button className="ws-icon-btn ws-icon-btn--light" title="Rename" onClick={e => startEditMod(e, mod)}>✏</button>
                    <button
                      className="ws-icon-btn ws-icon-btn--light ws-icon-btn--del" title="Delete"
                      onClick={e => { e.stopPropagation(); setConfirmModId(isConfirmingMod ? null : mod.id); setConfirmLessonId(null); }}
                    >✕</button>
                  </div>
                )}
              </div>

              {/* ── Delete module confirm ── */}
              {isConfirmingMod && (
                <div className="ws-confirm-strip ws-confirm-strip--mod">
                  <span style={{ fontSize:11, fontWeight:700, color:T.red, flex:1 }}>Delete "{mod.title}"?</span>
                  <button
                    style={{ background:T.redL,color:T.red,border:"none",borderRadius:6,padding:"3px 9px",fontSize:11,fontWeight:800,cursor:"pointer" }}
                    onClick={() => { onDeleteModule(mod.id); setConfirmModId(null); }}
                  >Delete</button>
                  <button
                    style={{ background:T.bg,color:T.muted,border:"none",borderRadius:6,padding:"3px 9px",fontSize:11,fontWeight:700,cursor:"pointer" }}
                    onClick={() => setConfirmModId(null)}
                  >Cancel</button>
                </div>
              )}

              {/* ── Lessons ── */}
              {isOpen && (
                <>
                  {mod.lessons.map((lesson, li) => {
                    const st              = lessonStatuses[lesson.id] || "pending";
                    const active          = selectedId === lesson.id;
                    const isEditingLesson = editingLessonId  === lesson.id;
                    const isConfirmLesson = confirmLessonId  === lesson.id;

                    return (
                      <div key={lesson.id}>
                        <div
                          className={`ws-lesson-row ws-hover-group${active ? " ws-lesson-row--active" : ""}`}
                          onClick={() => { if (!isEditingLesson) { onSelect(lesson.id); setConfirmLessonId(null); } }}
                        >
                          <span className="ws-lesson-num">{li + 1}</span>

                          {isEditingLesson ? (
                            <input
                              ref={editRef}
                              className="ws-inline-input ws-inline-input--lesson"
                              value={editVal}
                              onChange={e => setEditVal(e.target.value)}
                              onBlur={commitEditLesson}
                              onKeyDown={e => { if (e.key === "Enter") commitEditLesson(); if (e.key === "Escape") setEditingLessonId(null); }}
                              onClick={e => e.stopPropagation()}
                              style={{ flex:1 }}
                            />
                          ) : (
                            <span className="ws-lesson-title">{lesson.title}</span>
                          )}

                          {!isEditingLesson && (
                            <>
                              <div className="ws-hover-actions" onClick={e => e.stopPropagation()}>
                                <button className="ws-icon-btn" title="Rename" onClick={e => startEditLesson(e, lesson)}>✏</button>
                                <button
                                  className="ws-icon-btn ws-icon-btn--del" title="Delete"
                                  onClick={e => { e.stopPropagation(); setConfirmLessonId(isConfirmLesson ? null : lesson.id); setConfirmModId(null); }}
                                >✕</button>
                              </div>
                              <span className={`ws-lesson-dot ws-lesson-dot--${st}`} />
                            </>
                          )}
                        </div>

                        {/* ── Delete lesson confirm ── */}
                        {isConfirmLesson && (
                          <div className="ws-confirm-strip">
                            <span style={{ fontSize:11, fontWeight:700, color:T.red, flex:1 }}>Delete lesson?</span>
                            <button
                              style={{ background:T.redL,color:T.red,border:"none",borderRadius:6,padding:"3px 9px",fontSize:11,fontWeight:800,cursor:"pointer" }}
                              onClick={() => { onDeleteLesson(lesson.id); setConfirmLessonId(null); }}
                            >Delete</button>
                            <button
                              style={{ background:T.bg,color:T.muted,border:"none",borderRadius:6,padding:"3px 9px",fontSize:11,fontWeight:700,cursor:"pointer" }}
                              onClick={() => setConfirmLessonId(null)}
                            >Cancel</button>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Add lesson row */}
                  <div className="ws-add-row" onClick={() => onAddLesson(mod.id)}>
                    <span style={{ fontSize:13, lineHeight:1 }}>＋</span> Add lesson
                  </div>
                </>
              )}
            </div>
          );
        })}

        {/* Add module row */}
        <div className="ws-add-row ws-add-row--module" onClick={onAddModule}>
          <span style={{ fontSize:14, lineHeight:1 }}>＋</span> Add module
        </div>
      </div>

      {/* Footer progress */}
      <div className="ws-sidebar-foot">
        <div style={{ height:5, background:T.border, borderRadius:999, overflow:"hidden", marginBottom:5 }}>
          <div style={{ height:"100%", background:"linear-gradient(90deg,#0DB85E,#00BCD4)", borderRadius:999, width:`${totalLessons ? ((doneCount/totalLessons)*100) : 0}%`, transition:"width .5s" }} />
        </div>
        <div style={{ fontSize:11, color:T.muted, fontWeight:600 }}>{doneCount} of {totalLessons} lessons ready</div>
      </div>
    </div>
  );
};

/* ── Main: Course Details view ───────────────────────────────────────────── */
const CourseDetailsView = ({
  modules, courseData, courseEdits, onEditCourse,
  onAddModule, onRenameModule, onDeleteModule,
  onAddLesson, onDeleteLesson, onSelectLesson,
}) => {
  const [editingModId,    setEditingModId]    = useState(null);
  const [editVal,         setEditVal]         = useState("");
  const [confirmModId,    setConfirmModId]    = useState(null);
  const [confirmLessonId, setConfirmLessonId] = useState(null);
  const editRef = useRef(null);
  useEffect(() => { editRef.current?.focus(); }, [editingModId]);

  const totalLessons = modules.reduce((s, m) => s + m.lessons.length, 0);

  const AddLessonBtn = ({ modId }) => (
    <button
      style={{ display:"inline-flex",alignItems:"center",gap:6,padding:"6px 14px",borderRadius:9,border:`2px dashed ${T.border}`,background:"transparent",cursor:"pointer",fontSize:12,fontWeight:700,color:T.muted,transition:"all .15s",fontFamily:T.bFont }}
      onMouseEnter={e => Object.assign(e.currentTarget.style, { borderColor:T.violet,color:T.violet,background:T.violetL })}
      onMouseLeave={e => Object.assign(e.currentTarget.style, { borderColor:T.border,color:T.muted,background:"transparent" })}
      onClick={() => onAddLesson(modId)}
    >＋ Add lesson</button>
  );

  return (
    <div style={{ maxWidth:860, animation:"fadeUp .35s both" }}>

      {/* ── Course header card ── */}
      <div className="ws-card" style={{ marginBottom:0 }}>
        <div style={{ display:"flex",alignItems:"flex-start",gap:16,marginBottom:20 }}>
          <div style={{ width:52,height:52,borderRadius:16,background:"linear-gradient(135deg,#6C35DE,#F0447C)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,flexShrink:0 }}>🎓</div>
          <div style={{ flex:1,minWidth:0 }}>
            <textarea
              className="ws-title-input"
              value={courseEdits.title}
              onChange={e => onEditCourse({ title: e.target.value })}
              rows={1}
              placeholder="Course title…"
              onInput={e => { e.target.style.height="auto"; e.target.style.height=e.target.scrollHeight+"px"; }}
            />
          </div>
          <div style={{ display:"flex",gap:6,flexShrink:0,flexWrap:"wrap",justifyContent:"flex-end" }}>
            <span className="ws-chip" style={{ color:T.violet,borderColor:`${T.violet}55`,background:T.violetL }}>{courseData.subject}</span>
            <span className="ws-chip" style={{ color:T.sky,   borderColor:`${T.sky}55`,   background:T.skyL   }}>{courseData.level}</span>
            <span className="ws-chip" style={{ color:T.teal,  borderColor:`${T.teal}55`,  background:T.tealL  }}>{courseData.nativeLanguage}</span>
          </div>
        </div>
        <label className="ws-card-label">Description</label>
        <textarea
          className="ws-ta"
          value={courseEdits.description}
          onChange={e => onEditCourse({ description: e.target.value })}
          placeholder="Describe what students will learn in this course…"
          rows={3}
        />
      </div>

      {/* ── Stats strip ── */}
      <div style={{ display:"flex",gap:12,margin:"16px 0",flexWrap:"wrap" }}>
        {[
          { n:modules.length, label:"Modules", emoji:"🗂", col:T.violet, bg:T.violetL },
          { n:totalLessons,   label:"Lessons", emoji:"📖", col:T.sky,    bg:T.skyL    },
          { n:"TBD",          label:"Slides",  emoji:"🎞", col:T.pink,   bg:T.pinkL   },
          { n:"TBD",          label:"Tasks",   emoji:"📋", col:T.teal,   bg:T.tealL   },
          { n:"TBD",          label:"Test Qs", emoji:"📝", col:T.lime,   bg:T.limeL   },
        ].map(({ n, label, emoji, col, bg }) => (
          <div key={label} style={{ background:bg,borderRadius:14,padding:"10px 16px",display:"flex",alignItems:"center",gap:9,border:`2px solid ${col}28`,flex:"0 0 auto" }}>
            <span style={{ fontSize:18 }}>{emoji}</span>
            <span style={{ fontFamily:T.dFont,fontWeight:900,fontSize:20,color:col }}>{n}</span>
            <span style={{ fontSize:12,color:col,fontWeight:700,opacity:.8 }}>{label}</span>
          </div>
        ))}
      </div>

      {/* ── Modules card ── */}
      <div className="ws-card" style={{ marginTop:0 }}>
        <div className="ws-card-title">🗂 Modules</div>

        {modules.length === 0 && (
          <div style={{ textAlign:"center",padding:"32px 0 20px",color:T.mutedL,fontSize:13 }}>
            No modules yet — add your first one below.
          </div>
        )}

        <div style={{ display:"flex",flexDirection:"column",gap:12 }}>
          {modules.map((mod, mi) => {
            const grad            = MODULE_GRADS[mi % MODULE_GRADS.length];
            const isEditingTitle  = editingModId   === mod.id;
            const isConfirmingMod = confirmModId   === mod.id;

            return (
              <div key={mod.id} style={{ borderRadius:16,overflow:"hidden",border:`2px solid ${T.border}`,transition:"box-shadow .15s" }}
                onMouseEnter={e => !isConfirmingMod && (e.currentTarget.style.boxShadow="0 4px 16px rgba(108,53,222,.1)")}
                onMouseLeave={e => e.currentTarget.style.boxShadow=""}
              >
                {/* Module header bar */}
                <div style={{ background:grad,padding:"11px 16px",display:"flex",alignItems:"center",gap:12 }}>
                  <div style={{ width:28,height:28,borderRadius:9,background:"rgba(255,255,255,.2)",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:T.dFont,fontSize:13,fontWeight:900,color:"#fff",flexShrink:0 }}>{mi+1}</div>
                  {isEditingTitle ? (
                    <input
                      ref={editRef}
                      className="ws-mod-input"
                      value={editVal}
                      onChange={e => setEditVal(e.target.value)}
                      onBlur={() => { if (editVal.trim()) onRenameModule(mod.id, editVal.trim()); setEditingModId(null); }}
                      onKeyDown={e => { if (e.key==="Enter") { if (editVal.trim()) onRenameModule(mod.id, editVal.trim()); setEditingModId(null); } if (e.key==="Escape") setEditingModId(null); }}
                    />
                  ) : (
                    <span style={{ fontFamily:T.dFont,fontSize:14,fontWeight:900,color:"#fff",flex:1 }}>{mod.title}</span>
                  )}
                  {!isEditingTitle && <>
                    <span style={{ fontSize:11,color:"rgba(255,255,255,.7)",fontWeight:700,flexShrink:0 }}>{mod.lessons.length} lesson{mod.lessons.length!==1?"s":""}</span>
                    <div style={{ display:"flex",gap:3 }}>
                      <button className="ws-icon-btn ws-icon-btn--light" title="Rename module"
                        onClick={() => { setEditingModId(mod.id); setEditVal(mod.title); setConfirmModId(null); }}>✏</button>
                      <button className="ws-icon-btn ws-icon-btn--light ws-icon-btn--del" title="Delete module"
                        onClick={() => setConfirmModId(confirmModId === mod.id ? null : mod.id)}>🗑</button>
                    </div>
                  </>}
                </div>

                {/* Delete confirm bar */}
                {isConfirmingMod && (
                  <div style={{ background:T.redL,padding:"10px 18px",display:"flex",alignItems:"center",gap:12,borderBottom:`2px solid rgba(239,68,68,.12)` }}>
                    <span style={{ flex:1,fontSize:13,fontWeight:700,color:T.red }}>Delete this module and all {mod.lessons.length} lesson{mod.lessons.length!==1?"s":""}?</span>
                    <button style={{ background:T.red,color:"#fff",border:"none",borderRadius:9,padding:"7px 16px",fontSize:12,fontWeight:800,cursor:"pointer",fontFamily:T.dFont }}
                      onClick={() => { onDeleteModule(mod.id); setConfirmModId(null); }}>Delete</button>
                    <button style={{ background:"#fff",color:T.muted,border:`2px solid ${T.border}`,borderRadius:9,padding:"7px 14px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:T.dFont }}
                      onClick={() => setConfirmModId(null)}>Cancel</button>
                  </div>
                )}

                {/* Lessons body */}
                <div style={{ background:"#fff",padding:"12px 18px 14px" }}>
                  {mod.lessons.length === 0 && (
                    <div style={{ fontSize:12,color:T.mutedL,fontStyle:"italic",marginBottom:10 }}>No lessons yet</div>
                  )}
                  {mod.lessons.length > 0 && (
                    <div style={{ display:"flex",gap:8,flexWrap:"wrap",marginBottom:10 }}>
                      {mod.lessons.map((l, li) => {
                        const isConfirmingLesson = confirmLessonId === l.id;
                        return (
                          <div key={l.id}>
                            {isConfirmingLesson ? (
                              <div style={{ display:"flex",alignItems:"center",gap:5,background:T.redL,borderRadius:8,padding:"5px 10px",border:`1.5px solid rgba(239,68,68,.25)` }}>
                                <span style={{ fontSize:11,fontWeight:700,color:T.red }}>Delete?</span>
                                <button style={{ background:"transparent",color:T.red,border:"none",fontWeight:800,fontSize:11,cursor:"pointer",padding:"0 3px" }}
                                  onClick={() => { onDeleteLesson(l.id); setConfirmLessonId(null); }}>Yes</button>
                                <button style={{ background:"transparent",color:T.muted,border:"none",fontWeight:700,fontSize:11,cursor:"pointer" }}
                                  onClick={() => setConfirmLessonId(null)}>✕</button>
                              </div>
                            ) : (
                              <div
                                className="ws-hover-group"
                                style={{ display:"inline-flex",alignItems:"center",gap:4,background:T.bg,borderRadius:9,padding:"5px 10px",border:`1.5px solid ${T.border}`,cursor:"pointer",transition:"all .14s" }}
                                onClick={() => onSelectLesson(l.id)}
                                onMouseEnter={e => Object.assign(e.currentTarget.style,{ borderColor:T.violet,background:T.violetL })}
                                onMouseLeave={e => Object.assign(e.currentTarget.style,{ borderColor:T.border,background:T.bg     })}
                              >
                                <span style={{ fontSize:11,fontWeight:700,color:T.sub }}>{li+1}. {l.title}</span>
                                <button
                                  className="ws-hover-actions ws-icon-btn ws-icon-btn--del"
                                  style={{ width:14,height:14,fontSize:8,marginLeft:2,borderRadius:4 }}
                                  onClick={e => { e.stopPropagation(); setConfirmLessonId(l.id); }}
                                >✕</button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <AddLessonBtn modId={mod.id} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Add module button */}
        <button
          style={{ display:"flex",alignItems:"center",justifyContent:"center",gap:8,width:"100%",marginTop:14,padding:"13px",borderRadius:14,border:`2px dashed ${T.border}`,background:"transparent",cursor:"pointer",fontSize:13,fontWeight:800,color:T.muted,transition:"all .16s",fontFamily:T.dFont }}
          onMouseEnter={e => Object.assign(e.currentTarget.style,{ borderColor:T.violet,color:T.violet,background:T.violetL })}
          onMouseLeave={e => Object.assign(e.currentTarget.style,{ borderColor:T.border,color:T.muted,background:"transparent" })}
          onClick={onAddModule}
        >＋ Add module</button>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════
   LESSON GENERATION — MOCK ENGINE + CONTENT SECTIONS
   ─────────────────────────────────────────────────────────────────────────
   Generation state lives in useGenerationEngine (CourseBuilderWorkspace).
   Each section below (Slides / Tasks / Test / Materials) is a self-contained
   card with a gradient header + white body. No generation logic lives here —
   action buttons call back up through LessonEditorShell props.

   Per-lesson state shape:
     lessonGenerationStatus[id] : "idle" | "generating" | "done" | "error"
     generatedLessons[id]       : { slides, tasks, test, generatedAt }
     genStep[id]                : 0–N (current progress step)
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── Generation steps — RAG variant adds a materials search step at the front */
/* When hasRAG=true the first step becomes a materials search step */
const GEN_STEPS_BASE = [
  { label: "Analysing lesson objective",   emoji: "🎯", rag: false },
  { label: "Generating slide deck",        emoji: "🎞", rag: false },
  { label: "Building practice tasks",      emoji: "📋", rag: false },
  { label: "Creating test questions",      emoji: "📝", rag: false },
  { label: "Finalising content",           emoji: "✨", rag: false },
];
const GEN_STEPS_RAG = [
  { label: "Searching your materials",     emoji: "📚", rag: true  },
  { label: "Analysing lesson objective",   emoji: "🎯", rag: false },
  { label: "Generating slide deck",        emoji: "🎞", rag: false },
  { label: "Building practice tasks",      emoji: "📋", rag: false },
  { label: "Creating test questions",      emoji: "📝", rag: false },
  { label: "Finalising content",           emoji: "✨", rag: false },
];
const GEN_STEPS = GEN_STEPS_BASE; /* default export for backward compat */

/* ── Generation banner: idle CTA ── */
const GenerateCTA = ({ onGenerate, isGenerating, sources }) => {
  const hasRAG   = sources?.hasRAG;
  const fileCount = sources?.fileCount || 0;
  return (
    <div className={`gen-cta${hasRAG ? " gen-cta--rag" : ""}`}>
      <div className="gen-cta-icon">
        {hasRAG ? "📚" : "✦"}
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <div className="gen-cta-title">
          {hasRAG ? "Generate with your materials" : "Ready to generate content"}
        </div>
        <div className="gen-cta-sub">
          {hasRAG
            ? `AI will search your ${fileCount} uploaded file${fileCount !== 1 ? "s" : ""} for relevant content, then build slides, tasks and a test grounded in your own materials.`
            : "AI will create slides, practice tasks and a short test tailored to this lesson's objective and your students' level."}
        </div>
        {hasRAG && (
          <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:8, flexWrap:"wrap" }}>
            <span className="rag-chip" style={{ background:"rgba(255,255,255,.2)", color:"#fff", border:"1.5px solid rgba(255,255,255,.4)", fontSize:10 }}>
              📚 {fileCount} file{fileCount !== 1 ? "s" : ""} indexed
            </span>
            <span style={{ fontSize:11, color:"rgba(255,255,255,.7)", fontWeight:600 }}>
              · RAG-assisted generation
            </span>
          </div>
        )}
      </div>
      <button className="gen-cta-btn" onClick={onGenerate} disabled={isGenerating}>
        {isGenerating ? (
          <><span style={{ width:14, height:14, borderRadius:"50%", border:"2.5px solid rgba(108,53,222,.25)", borderTopColor:"#fff", animation:"spin .75s linear infinite", display:"inline-block", flexShrink:0 }} /> Generating…</>
        ) : (
          <>{hasRAG ? "📚" : <span style={{ fontSize:16 }}>✦</span>} Generate Lesson</>
        )}
      </button>
    </div>
  );
};

/* ── Generation progress card ── */
const GeneratingCard = ({ currentStep, sources }) => {
  const hasRAG = sources?.hasRAG;
  const steps  = hasRAG ? GEN_STEPS_RAG : GEN_STEPS_BASE;
  const pct    = Math.round((currentStep / steps.length) * 100);

  return (
    <div className="gen-progress">
      <div className="gen-progress-hd">
        <div className="gen-spinner" style={{ borderTopColor: hasRAG && currentStep === 0 ? T.teal : T.violet }} />
        <div>
          <div className="gen-progress-title">
            {hasRAG && currentStep === 0 ? "Searching your materials…" : "Generating lesson content…"}
          </div>
          <div className="gen-progress-sub" style={{ color: hasRAG && currentStep === 0 ? T.teal : undefined }}>
            {currentStep < steps.length
              ? `${steps[currentStep]?.emoji} ${steps[currentStep]?.label}…`
              : "Finalising…"}
          </div>
        </div>
        <span style={{ marginLeft:"auto", fontFamily:T.dFont, fontWeight:900, fontSize:18, color: hasRAG && currentStep === 0 ? T.teal : T.violet, flexShrink:0 }}>{pct}%</span>
      </div>
      <div className="gen-bar-track">
        <div className="gen-bar-fill" style={{ width:`${pct}%`, background: hasRAG && currentStep === 0
          ? "linear-gradient(90deg,#00BCD4,#0099E6)"
          : "linear-gradient(90deg,#6C35DE,#F0447C)" }} />
      </div>
      <div className="gen-steps">
        {steps.map((step, i) => {
          const state = i < currentStep ? "done" : i === currentStep ? "active" : "wait";
          const isRagStep = step.rag && state === "active";
          return (
            <div
              key={i}
              className={`gen-step gen-step--${isRagStep ? "rag-active" : state}`}
              style={{ animationDelay:`${i*60}ms` }}
            >
              <div className="gen-step-dot" style={ isRagStep ? { background:"rgba(0,188,212,.15)", border:`2px solid ${T.teal}` } : undefined }>
                {state === "done"
                  ? "✓"
                  : state === "active"
                    ? <span style={{ width:6, height:6, borderRadius:"50%", background: isRagStep ? T.teal : T.violet, display:"block", animation:"genPulse 1s infinite" }} />
                    : ""}
              </div>
              <span>{step.emoji} {step.label}</span>
              {step.rag && state !== "wait" && (
                <span className="rag-chip rag-chip--sm" style={{ marginLeft:"auto" }}>
                  {state === "done" ? "✓ searched" : "RAG"}
                </span>
              )}
            </div>
          );
        })}
      </div>
      {hasRAG && (
        <div style={{ marginTop:12, padding:"8px 10px", background:"rgba(0,188,212,.06)", borderRadius:9, border:"1.5px solid rgba(0,188,212,.16)", fontSize:11, color:"#00697A", fontWeight:600, lineHeight:1.55 }}>
          📚 AI is cross-referencing your uploaded materials to enrich this lesson with relevant examples and context.
        </div>
      )}
    </div>
  );
};

/* ── Done banner ── */
const GeneratedDoneBanner = ({ lesson, generatedAt, onRegenerate, isGenerating, sources }) => {
  const hasRAG    = sources?.hasRAG;
  const fileCount = sources?.fileCount || 0;
  const when = generatedAt
    ? new Intl.DateTimeFormat("en", { hour:"numeric", minute:"2-digit" }).format(new Date(generatedAt))
    : "";
  return (
    <div className="gen-done">
      <div className="gen-done-icon">✓</div>
      <div>
        <div className="gen-done-title">Content generated</div>
        <div className="gen-done-sub">
          Generated at {when}
          {hasRAG ? ` · grounded in ${fileCount} uploaded file${fileCount !== 1 ? "s" : ""}` : " · Slides, tasks and test ready"}
        </div>
        {hasRAG && (
          <div style={{ marginTop:5 }}>
            <span className="rag-chip">📚 Materials used</span>
          </div>
        )}
      </div>
      <button className="gen-done-regen" onClick={onRegenerate} disabled={isGenerating}>
        {isGenerating ? "…" : "↺ Regenerate"}
      </button>
    </div>
  );
};

/* ── Error banner ── */
const GenerationErrorBanner = ({ onRetry }) => (
  <div className="gen-error">
    <div style={{ width:34, height:34, borderRadius:11, background:T.red, display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, color:"#fff", flexShrink:0 }}>!</div>
    <div style={{ flex:1 }}>
      <div style={{ fontFamily:T.dFont, fontSize:13, fontWeight:900, color:T.red }}>Generation failed</div>
      <div style={{ fontSize:11, color:T.sub, marginTop:2 }}>Something went wrong. Check your connection and try again.</div>
    </div>
    <button
      style={{ marginLeft:"auto", flexShrink:0, display:"inline-flex", alignItems:"center", gap:5, padding:"6px 13px", borderRadius:9, border:`1.5px solid rgba(239,68,68,.3)`, background:"#fff", color:T.red, fontFamily:T.dFont, fontSize:11, fontWeight:800, cursor:"pointer", transition:"all .15s" }}
      onClick={onRetry}
    >↺ Retry</button>
  </div>
);

/* ── Mock slide content ── */
const mockSlides = (lesson, courseData) => {
  const lang  = courseData?.nativeLanguage || "English";
  const level = courseData?.level          || "Intermediate";
  return [
    {
      id: uid(), title: "Introduction",
      accent: T.violet,
      bullets: [
        `Welcome to: ${lesson.title}`,
        `Level: ${level} · Language: ${lang}`,
        "By the end of this lesson you will master the core concept.",
      ],
      speakerNote: "Warm up activity: ask students what they already know about the topic.",
    },
    {
      id: uid(), title: "Core Vocabulary",
      accent: T.sky,
      bullets: [
        "Key term 1 — definition and example sentence",
        "Key term 2 — definition and example sentence",
        "Key term 3 — definition and usage context",
      ],
      speakerNote: "Drill pronunciation before moving to meaning.",
    },
    {
      id: uid(), title: "Grammar Focus",
      accent: T.pink,
      bullets: [
        "Rule: [structure] + [complement]",
        "Affirmative: Subject + verb + object",
        "Negative: Subject + auxiliary + not + verb",
        "Question: Auxiliary + subject + verb?",
      ],
      speakerNote: "Show three board examples; elicit student responses.",
    },
    {
      id: uid(), title: "Model Dialogue",
      accent: T.teal,
      bullets: [
        "A: Could you help me with the assignment?",
        "B: Of course! What do you need?",
        "A: I need help understanding the main rule.",
        "B: Let me show you a quick example.",
      ],
      speakerNote: "Play audio if available; students repeat in pairs.",
    },
    {
      id: uid(), title: "Summary & Next Steps",
      accent: T.lime,
      bullets: [
        `Today we covered: ${lesson.title}`,
        "Complete the practice tasks before the next session.",
        "Take the end-of-lesson test to check your understanding.",
      ],
      speakerNote: "Allow 5 minutes for questions. Assign test as homework if needed.",
    },
  ];
};

/* ── Mock task content ── */
const mockTasks = (lesson, courseData) => {
  const level = courseData?.level || "Intermediate";
  return [
    {
      id: uid(), type: "Speaking", emoji: "🗣️",
      col: T.pink, bg: T.pinkL,
      instruction: `Describe the main concept from "${lesson.title}" in your own words to a partner. Use at least three of the key vocabulary words introduced in the slides.`,
      example: `"I think this means… and an example would be…"`,
      answerKey: "Assess fluency and accurate use of target vocabulary.",
      duration: "5–7 min",
    },
    {
      id: uid(), type: "Writing", emoji: "✏️",
      col: T.sky, bg: T.skyL,
      instruction: `Write 4–6 sentences applying the grammar structure from this lesson. Use real-life context relevant to a ${level} learner.`,
      example: `"Every morning, she _____ (verb) before she _____ (verb)."`,
      answerKey: "Check subject-verb agreement and correct tense usage.",
      duration: "8–10 min",
    },
    {
      id: uid(), type: "Reading", emoji: "📖",
      col: T.teal, bg: T.tealL,
      instruction: `Read the short passage below and answer the comprehension questions that follow. Focus on the underlined vocabulary from the slides.`,
      example: `"The passage introduces the concept through a real-world scenario…"`,
      answerKey: "Answers in bold in the teacher guide. Accept paraphrased responses.",
      duration: "6–8 min",
    },
  ];
};

/* ── Mock test content ── */
const mockTest = (lesson) => [
  {
    id: uid(),
    text: `Which of the following best describes the main concept covered in "${lesson.title}"?`,
    options: [
      { key:"A", text:"An unrelated grammatical structure", correct:false },
      { key:"B", text:"The target language function of the lesson", correct:true  },
      { key:"C", text:"A vocabulary list from a previous unit", correct:false },
      { key:"D", text:"None of the above", correct:false },
    ],
  },
  {
    id: uid(),
    text: "Choose the sentence that correctly uses the grammar structure introduced in the slides.",
    options: [
      { key:"A", text:"She go to the market every day.",  correct:false },
      { key:"B", text:"She goes to the market every day.", correct:true  },
      { key:"C", text:"She going to the market every day.", correct:false },
      { key:"D", text:"She gone to the market every day.", correct:false },
    ],
  },
  {
    id: uid(),
    text: "What is the correct response in the model dialogue when asked for help?",
    options: [
      { key:"A", text:"\"No, I don't have time.\"",               correct:false },
      { key:"B", text:"\"Of course! What do you need?\"",         correct:true  },
      { key:"C", text:"\"I already finished the assignment.\"",   correct:false },
      { key:"D", text:"\"Ask someone else.\"",                    correct:false },
    ],
  },
  {
    id: uid(),
    text: "Which vocabulary word from this lesson means to clearly explain a concept?",
    options: [
      { key:"A", text:"Memorise",   correct:false },
      { key:"B", text:"Ignore",     correct:false },
      { key:"C", text:"Illustrate", correct:true  },
      { key:"D", text:"Confuse",    correct:false },
    ],
  },
];

/* ── Async mock generator ── */
/*
  Real integration: replace the setTimeout chain with fetch('/api/v1/lesson/generate', …).
  The step callbacks (onStep) allow the UI to animate through progress regardless of backend.
  Returns the generated content object.
*/
const mockGenerateLesson = async ({ lesson, courseData, onStep, signal }) => {
  const delays = [900, 1400, 1200, 1100, 700];
  for (let i = 0; i < GEN_STEPS.length; i++) {
    await new Promise((res, rej) => {
      const t = setTimeout(res, delays[i]);
      signal?.addEventListener("abort", () => { clearTimeout(t); rej(new Error("aborted")); });
    });
    onStep(i + 1);
  }
  return {
    slides:      mockSlides(lesson, courseData),
    tasks:       mockTasks(lesson, courseData),
    test:        mockTest(lesson),
    generatedAt: new Date().toISOString(),
  };
};

/* ═══════════════════════════════════════════════════════════════════════════
   BUILDER STUB MODAL
   ─────────────────────────────────────────────────────────────────────────
   Shell for the upcoming Task Builder and Test Builder.
   Replace the <body> children with the real builder UI when ready.
   Props:
     open        — bool
     onClose     — () => void
     title       — string
     subtitle    — string
     icon        — string (emoji)
     iconBg      — CSS gradient/color string
     children    — React node (the builder body, defaults to coming-soon state)
   ═══════════════════════════════════════════════════════════════════════════ */
const BuilderStubModal = ({ open, onClose, title, subtitle, icon, iconBg, children }) => {
  if (!open) return null;

  return (
    <div className="builder-modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="builder-modal">

        {/* Header */}
        <div className="builder-modal-hd">
          <div className="builder-modal-hd-icon" style={{ background: iconBg }}>
            {icon}
          </div>
          <div>
            <div className="builder-modal-title">{title}</div>
            {subtitle && <div className="builder-modal-sub">{subtitle}</div>}
          </div>
          <button className="builder-modal-close" onClick={onClose}>✕</button>
        </div>

        {/* Body — swap in real builder here */}
        <div className="builder-modal-body">
          {children || (
            <div style={{ textAlign:"center", padding:"32px 20px" }}>
              <div style={{ fontSize:44, marginBottom:14 }}>🛠</div>
              <div style={{ fontFamily:T.dFont, fontSize:17, fontWeight:900, color:T.text, marginBottom:8 }}>
                Builder coming soon
              </div>
              <div style={{ fontSize:13, color:T.muted, lineHeight:1.7, maxWidth:320, margin:"0 auto" }}>
                This builder is being prepared. The extension point is ready — drop in the builder component as <code style={{ fontSize:11, background:T.bg, padding:"1px 6px", borderRadius:5 }}>{"<BuilderStubModal>"}</code> children.
              </div>
              <div style={{ marginTop:22, padding:"14px 20px", background:T.bg, borderRadius:14, border:`1.5px solid ${T.border}`, textAlign:"left", fontSize:12, color:T.sub, lineHeight:1.75 }}>
                <strong style={{ color:T.text }}>Wiring guide:</strong><br />
                1. Import your builder component<br />
                2. Pass it as <code style={{ fontSize:11, background:"#fff", padding:"1px 5px", borderRadius:4 }}>children</code> to this modal<br />
                3. Wire <code style={{ fontSize:11, background:"#fff", padding:"1px 5px", borderRadius:4 }}>onSave(item)</code> up to the lesson state<br />
                4. Remove the coming-soon default body above
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="builder-modal-footer">
          <button className="builder-modal-btn builder-modal-btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="builder-modal-btn builder-modal-btn--primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

const SectionHeader = ({ grad, icon, title, count, countReady, children }) => (
  <div className="ls-section-hd" style={{ background: grad }}>
    <div className="ls-section-hd-icon">{icon}</div>
    <span className="ls-section-hd-title">{title}</span>
    {count !== undefined && (
      <span className={`ls-section-count${countReady ? " ls-section-count--ready" : ""}`}>
        {count === 0 ? "Empty" : `${count} ${count === 1 ? title.slice(0,-1).toLowerCase() : title.toLowerCase()}`}
      </span>
    )}
    {children}
  </div>
);

/* ═══════════════════════════════════════════════════════════════════════════
   SLIDES SECTION — first-class content entity
   ─────────────────────────────────────────────────────────────────────────
   Props:
     slides         — SlideEditorPage-compatible slide[] (empty → empty state)
     isGenerating   — bool (dims while generation is running)
     onEditSlides   — () => void — opens SlideEditorPage for this lesson
                      INTEGRATION POINT: already wired to the existing editor
   ═══════════════════════════════════════════════════════════════════════════ */
const SlidesSection = ({ slides = [], isGenerating, onEditSlides }) => {
  const SLIDE_ACCENTS = [T.violet, T.sky, T.pink, T.teal, T.lime, T.amber];
  const hasSlides = slides.length > 0;

  return (
    <div className={`ls-section${isGenerating ? " ls-section--generating" : ""}`}>
      <SectionHeader
        grad="linear-gradient(135deg,#6C35DE 0%,#F0447C 100%)"
        icon="🎞"
        title="Slides"
        count={slides.length}
        countReady={hasSlides}
      >
        {hasSlides && (
          <button className="ls-hd-btn" onClick={onEditSlides} title="Open slide editor">
            ✏ Edit
          </button>
        )}
      </SectionHeader>

      <div className="ls-section-body">
        {!hasSlides ? (
          /* ── Empty state ── */
          <div className="ls-empty">
            <div className="ls-empty-icon">🎞</div>
            <div className="ls-empty-title">No slides yet</div>
            <div className="ls-empty-sub">
              Generate this lesson to create a full slide deck, or create slides manually in the editor.
            </div>

            {/* Ghost skeleton */}
            <div className="ls-slide-grid" style={{ width:"100%", opacity:.22, pointerEvents:"none" }}>
              {[
                { w1:"72%", w2:"90%", w3:"60%", a:"#6C35DE" },
                { w1:"85%", w2:"55%", w3:"78%", a:"#0099E6" },
                { w1:"60%", w2:"80%", w3:"50%", a:"#F0447C" },
                { w1:"78%", w2:"65%", w3:"88%", a:"#0DB85E" },
              ].map((ws, i) => (
                <div key={i} className="ls-slide-card" style={{ cursor:"default" }}>
                  <div className="ls-slide-thumb" style={{ borderTop:`3px solid ${ws.a}` }}>
                    <span className="ls-slide-num">{i+1}</span>
                    <div className="ls-slide-line" style={{ width:ws.w1, height:11 }} />
                    <div className="ls-slide-line" style={{ width:ws.w2 }} />
                    <div className="ls-slide-line" style={{ width:ws.w3 }} />
                    <div className="ls-slide-line" style={{ width:"45%", opacity:.6 }} />
                  </div>
                  <div className="ls-slide-footer"><div className="ls-slide-title-ph" /></div>
                </div>
              ))}
            </div>

            {/* Create CTA — opens the existing SlideEditorPage with empty slides */}
            <div
              className="section-create-cta"
              onClick={onEditSlides}
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === "Enter" && onEditSlides?.()}
            >
              <div className="section-create-cta-icon" style={{ background:`linear-gradient(135deg,${T.violet},${T.pink})` }}>
                🎞
              </div>
              <div>
                <div className="section-create-cta-title">Create slides manually</div>
                <div className="section-create-cta-sub">Open the slide editor to build your deck from scratch</div>
              </div>
              <span className="section-create-cta-arrow">→</span>
            </div>
          </div>
        ) : (
          /* ── Has slides ── */
          <>
            {/* Action strip */}
            <div className="slides-action-strip">
              <span className="slides-action-strip-title">
                {slides.length} slide{slides.length !== 1 ? "s" : ""} · ready to edit
              </span>
              <button className="slides-action-btn slides-action-btn--view" onClick={onEditSlides}>
                👁 View
              </button>
              <button className="slides-action-btn slides-action-btn--edit" onClick={onEditSlides}>
                ✏ Edit Slides
              </button>
            </div>

            {/* Slide grid — each card opens the editor on click */}
            <div className="ls-slide-grid">
              {slides.map((slide, i) => {
                const accent = slide.accent || SLIDE_ACCENTS[i % SLIDE_ACCENTS.length];
                return (
                  <div
                    key={slide.id}
                    className="ls-slide-card ls-slide-card--interactive"
                    onClick={onEditSlides}
                    title={`Edit "${slide.title}"`}
                  >
                    <div className="ls-slide-thumb" style={{ borderTop:`3px solid ${accent}` }}>
                      <span className="ls-slide-num" style={{ color:accent }}>{i+1}</span>
                      <div style={{ fontFamily:T.dFont, fontSize:11, fontWeight:900, color:T.text, marginBottom:5, lineHeight:1.3 }}>
                        {slide.title}
                      </div>
                      {(slide.bullets||[]).slice(0,3).map((b, bi) => (
                        <div key={bi} style={{ fontSize:10, color:T.sub, lineHeight:1.5, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                          • {b}
                        </div>
                      ))}
                    </div>
                    <div className="ls-slide-footer">
                      <span style={{ fontSize:11, fontWeight:700, color:T.sub, flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                        {slide.title}
                      </span>
                      {slide.speakerNote && (
                        <span title={slide.speakerNote} style={{ fontSize:10, color:T.mutedL, flexShrink:0 }}>📝</span>
                      )}
                    </div>
                    {/* Edit overlay on hover */}
                    <div className="ls-slide-overlay">
                      <span style={{ fontSize:22 }}>✏</span>
                      <span className="ls-slide-overlay-label">Edit slide</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
};


const TASK_TYPES = [
  { emoji:"🗣️", label:"Speaking",  desc:"Oral production or conversation practice",    col:T.pink,   bg:T.pinkL   },
  { emoji:"✏️", label:"Writing",   desc:"Written production — sentences or paragraph", col:T.sky,    bg:T.skyL    },
  { emoji:"👂", label:"Listening", desc:"Audio-based comprehension activity",           col:T.violet, bg:T.violetL },
  { emoji:"📖", label:"Reading",   desc:"Text-based comprehension task",                col:T.teal,   bg:T.tealL   },
  { emoji:"🔤", label:"Vocabulary",desc:"Word recognition or usage drill",              col:T.lime,   bg:T.limeL   },
];

/* ═══════════════════════════════════════════════════════════════════════════
   TASKS SECTION — first-class content entity with builder extension points
   ─────────────────────────────────────────────────────────────────────────
   Props:
     tasks          — task[] (from generation or manual add)
     isGenerating   — bool
     onCreateTask   — () => void — EXTENSION POINT: open TaskBuilder modal
     onEditTask     — (taskId) => void — EXTENSION POINT: edit existing task
   ═══════════════════════════════════════════════════════════════════════════ */
const TasksSection = ({ tasks = [], isGenerating, onCreateTask, onEditTask }) => (
  <div className={`ls-section${isGenerating ? " ls-section--generating" : ""}`}>
    <SectionHeader
      grad="linear-gradient(135deg,#0099E6 0%,#6C35DE 100%)"
      icon="📋"
      title="Tasks"
      count={tasks.length}
      countReady={tasks.length > 0}
    >
      <button className="ls-hd-btn" onClick={onCreateTask} title="Create a new task">
        ＋ Add task
      </button>
    </SectionHeader>

    <div className="ls-section-body">
      {tasks.length === 0 ? (
        <>
          <div className="ls-empty">
            <div className="ls-empty-icon">📋</div>
            <div className="ls-empty-title">No tasks yet</div>
            <div className="ls-empty-sub">
              Generate this lesson to create practice tasks, or add a task manually.
            </div>
          </div>

          {/* Available task types — dimmed preview */}
          <div className="ls-divider">Available task types</div>
          <div style={{ display:"flex", flexDirection:"column", gap:9 }}>
            {TASK_TYPES.map(({ emoji, label, desc, col, bg }) => (
              <div key={label} className="ls-task-card" style={{ cursor:"default", opacity:.42 }}>
                <div className="ls-task-icon" style={{ background:bg }}>{emoji}</div>
                <div className="ls-task-body">
                  <div className="ls-task-label" style={{ color:col }}>{label}</div>
                  <div className="ls-task-desc">{desc}</div>
                </div>
                <span className="ls-task-badge">Pending</span>
              </div>
            ))}
          </div>

          {/* Create CTA — EXTENSION POINT: opens TaskBuilder */}
          <div
            className="section-create-cta section-create-cta--sky"
            onClick={onCreateTask}
            role="button"
            tabIndex={0}
            onKeyDown={e => e.key === "Enter" && onCreateTask?.()}
          >
            <div className="section-create-cta-icon" style={{ background:`linear-gradient(135deg,${T.sky},${T.violet})` }}>
              📋
            </div>
            <div>
              <div className="section-create-cta-title" style={{ color:T.sky }}>Create task manually</div>
              <div className="section-create-cta-sub">Choose a task type and write the instructions</div>
            </div>
            <span className="section-create-cta-arrow">→</span>
          </div>
        </>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {tasks.map(task => (
            <div key={task.id} className="ls-task-card ls-task-card--interactive">
              <div className="ls-task-icon" style={{ background:task.bg || T.skyL }}>{task.emoji}</div>
              <div className="ls-task-body">
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                  <div className="ls-task-label" style={{ color:task.col || T.sky, marginBottom:0 }}>{task.type}</div>
                  {task.duration && <span style={{ fontSize:10, color:T.muted, fontWeight:600 }}>· {task.duration}</span>}
                </div>
                <div className="ls-task-desc">{task.instruction}</div>
                {task.example && (
                  <div style={{ marginTop:6, padding:"6px 10px", background:T.bg, borderRadius:8, border:`1.5px solid ${T.border}`, fontSize:11, color:T.sub, fontStyle:"italic" }}>
                    {task.example}
                  </div>
                )}
              </div>
              {/* Actions — EXTENSION POINT: onEditTask opens TaskBuilder pre-populated */}
              <div className="ls-task-card-actions">
                <span className="ls-task-badge" style={{ background:T.limeL, color:T.lime, borderColor:"rgba(13,184,94,.28)" }}>
                  Ready
                </span>
                <button
                  className="ls-task-edit-btn"
                  onClick={e => { e.stopPropagation(); onEditTask?.(task.id); }}
                  title="Edit this task"
                >
                  ✏ Edit
                </button>
              </div>
            </div>
          ))}

          {/* Add more tasks CTA */}
          <div
            className="section-create-cta section-create-cta--sky"
            onClick={onCreateTask}
            role="button"
            tabIndex={0}
            onKeyDown={e => e.key === "Enter" && onCreateTask?.()}
            style={{ marginTop:4 }}
          >
            <div className="section-create-cta-icon" style={{ background:`linear-gradient(135deg,${T.sky},${T.violet})`, fontSize:16 }}>
              ＋
            </div>
            <div>
              <div className="section-create-cta-title" style={{ color:T.sky }}>Add another task</div>
              <div className="section-create-cta-sub">Speaking, Writing, Reading, Listening or Vocabulary</div>
            </div>
            <span className="section-create-cta-arrow">→</span>
          </div>
        </div>
      )}
    </div>
  </div>
);


/* ═══════════════════════════════════════════════════════════════════════════
   TEST SECTION — first-class content entity with builder extension points
   ─────────────────────────────────────────────────────────────────────────
   Props:
     questions         — question[] (from generation or manual add)
     isGenerating      — bool
     onCreateQuestion  — () => void — EXTENSION POINT: open TestBuilder modal
     onEditQuestion    — (questionId) => void — EXTENSION POINT: edit question
   ═══════════════════════════════════════════════════════════════════════════ */
const TestSection = ({ questions = [], isGenerating, onCreateQuestion, onEditQuestion }) => {
  const qGrad = "linear-gradient(135deg,#0DB85E 0%,#00BCD4 100%)";
  const hasQuestions = questions.length > 0;

  return (
    <div className={`ls-section${isGenerating ? " ls-section--generating" : ""}`}>
      <SectionHeader
        grad={qGrad}
        icon="📝"
        title="Test"
        count={questions.length}
        countReady={hasQuestions}
      >
        <button className="ls-hd-btn" onClick={onCreateQuestion} title="Add a question">
          ＋ Add question
        </button>
      </SectionHeader>

      <div className="ls-section-body">
        {!hasQuestions ? (
          <>
            <div className="ls-empty">
              <div className="ls-empty-icon">📝</div>
              <div className="ls-empty-title">No test yet</div>
              <div className="ls-empty-sub">
                Generate this lesson to produce multiple-choice questions aligned to the learning objective, or add questions manually.
              </div>
            </div>

            {/* Example structure preview */}
            <div className="ls-divider">Example structure</div>
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {[
                { q:"Which sentence uses the correct form of the verb?", correct:"B" },
                { q:"What does the underlined word mean in context?",    correct:"A" },
                { q:"Choose the most appropriate response.",             correct:"C" },
              ].map(({ q, correct }, qi) => (
                <div key={qi} className="ls-q-card" style={{ opacity:.28 + qi * .04, cursor:"default" }}>
                  <div className="ls-q-hd">
                    <div className="ls-q-num" style={{ background:qGrad }}>{qi+1}</div>
                    <div className="ls-q-text">{q}</div>
                  </div>
                  <div className="ls-q-opts">
                    {["A","B","C","D"].map(opt => (
                      <div key={opt} className={`ls-q-opt${opt === correct ? " ls-q-opt--correct" : ""}`}>
                        <span className="ls-q-opt-key">{opt}</span>
                        <div style={{ flex:1, height:8, borderRadius:3, background:opt === correct ? "rgba(13,184,94,.3)" : T.border }} />
                        {opt === correct && <span style={{ fontSize:9, color:T.lime }}>✓</span>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Create CTA — EXTENSION POINT: opens TestBuilder */}
            <div
              className="section-create-cta section-create-cta--teal"
              onClick={onCreateQuestion}
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === "Enter" && onCreateQuestion?.()}
              style={{ marginTop:16 }}
            >
              <div className="section-create-cta-icon" style={{ background:"linear-gradient(135deg,#0DB85E,#00BCD4)" }}>
                📝
              </div>
              <div>
                <div className="section-create-cta-title" style={{ color:T.teal }}>Add question manually</div>
                <div className="section-create-cta-sub">Multiple-choice, true/false or short answer</div>
              </div>
              <span className="section-create-cta-arrow">→</span>
            </div>
          </>
        ) : (
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {questions.map((q, qi) => (
              <div key={q.id} className="ls-q-card ls-q-card--interactive">
                <div className="ls-q-hd">
                  <div className="ls-q-num" style={{ background:qGrad }}>{qi+1}</div>
                  <div className="ls-q-text">{q.text}</div>
                </div>
                <div className="ls-q-opts">
                  {(q.options||[]).map(opt => (
                    <div key={opt.key} className={`ls-q-opt${opt.correct ? " ls-q-opt--correct" : ""}`}>
                      <span className="ls-q-opt-key">{opt.key}</span>
                      <span style={{ flex:1, fontSize:11, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                        {opt.text}
                      </span>
                      {opt.correct && <span style={{ fontSize:9, color:T.lime, flexShrink:0 }}>✓</span>}
                    </div>
                  ))}
                </div>
                {/* Edit affordance — EXTENSION POINT: onEditQuestion opens TestBuilder pre-populated */}
                <div className="ls-q-card-actions">
                  <button
                    className="ls-q-edit-btn"
                    onClick={() => onEditQuestion?.(q.id)}
                    title="Edit this question"
                  >
                    ✏ Edit question
                  </button>
                </div>
              </div>
            ))}

            {/* Add more CTA */}
            <div
              className="section-create-cta section-create-cta--teal"
              onClick={onCreateQuestion}
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === "Enter" && onCreateQuestion?.()}
            >
              <div className="section-create-cta-icon" style={{ background:"linear-gradient(135deg,#0DB85E,#00BCD4)", fontSize:16 }}>
                ＋
              </div>
              <div>
                <div className="section-create-cta-title" style={{ color:T.teal }}>Add another question</div>
                <div className="section-create-cta-sub">Multiple-choice, true/false or short answer</div>
              </div>
              <span className="section-create-cta-arrow">→</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};


/*    Shows teacher-uploaded unit files and their RAG availability status.
   No new backend assumptions — sources derived from uploadedFiles prop.
   Post-generation: future-ready sources strip (empty until backend wired).
   ═══════════════════════════════════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════════════════════════════════
   MATERIALS SECTION
   Shows teacher-uploaded unit files and their RAG availability status.
   No new backend assumptions — sources derived from uploadedFiles prop.
   Post-generation: future-ready sources strip (empty until backend wired).
   ═══════════════════════════════════════════════════════════════════════════ */
const MaterialsSection = ({ lesson, uploadedFiles, genStatus, genContent }) => {
  const typeEmoji = { pdf:"📄", doc:"📝", ppt:"📊", video:"🎬", file:"📎" };
  const typeBg    = { pdf:T.redL, doc:T.skyL, ppt:T.orangeL, video:T.violetL, file:T.bg };

  const files = (uploadedFiles || []).map(f => ({
    id:   f.name || f.id || uid(),
    name: f.name,
    size: f.size ? `${(f.size / 1024).toFixed(0)} KB` : null,
    type: /pdf/i.test(f.name||"")      ? "pdf"
        : /docx?/i.test(f.name||"")   ? "doc"
        : /pptx?/i.test(f.name||"")   ? "ppt"
        : /mp4|mov|webm/i.test(f.name||"") ? "video"
        : "file",
  }));

  const hasFiles    = files.length > 0;
  const isDone      = genStatus === "done";
  /*
    Future: genContent?.sources will carry back-end references like
    [{ fileName, relevanceScore, chunkCount }] once the RAG pipeline
    returns sourcing metadata. Rendered as a "Sources used" strip below.
  */
  const usedSources = genContent?.sources || [];

  return (
    <div className="ls-section">
      <SectionHeader
        grad="linear-gradient(135deg,#00838F 0%,#0099E6 60%,#6C35DE 100%)"
        icon="📚"
        title="Materials"
        count={files.length}
        countReady={hasFiles}
      >
        {hasFiles && <span className="rag-chip" style={{ background:"rgba(255,255,255,.22)", color:"#fff", border:"1.5px solid rgba(255,255,255,.4)" }}>RAG-ready</span>}
        <button className="ls-hd-btn" disabled title="Upload coming soon">⬆ Upload</button>
      </SectionHeader>

      <div className="ls-section-body">

        {/* ── Has files — RAG-ready state ── */}
        {hasFiles && (
          <>
            {/* RAG explanation banner */}
            <div className="mat-rag-banner">
              <div className="mat-rag-banner-icon">🔍</div>
              <div>
                <div className="mat-rag-banner-title">AI will use these materials</div>
                <div className="mat-rag-banner-sub">
                  When you generate this lesson, the AI searches your uploaded files for relevant vocabulary, grammar examples, dialogues and context — then weaves them into the slides, tasks and test.
                  <br /><br />
                  <strong style={{ color:"#00697A" }}>Your content, your curriculum.</strong> Generation stays grounded in the materials you know and trust.
                </div>
              </div>
            </div>

            {/* File list */}
            <div style={{ marginBottom: isDone && usedSources.length === 0 ? 14 : 0 }}>
              {files.map(f => (
                <div key={f.id} className="mat-file-card">
                  <div className="mat-file-icon" style={{ background: typeBg[f.type] || T.bg }}>
                    {typeEmoji[f.type] || "📎"}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div className="mat-file-name">{f.name}</div>
                    {f.size && <div className="mat-file-meta">{f.size}</div>}
                  </div>
                  <span className="rag-chip">
                    {isDone ? "✓ used" : "📚 indexed"}
                  </span>
                  <span style={{ fontSize:10, fontWeight:800, color:T.muted, background:T.bg, padding:"2px 8px", borderRadius:999, border:`1.5px solid ${T.border}`, flexShrink:0 }}>
                    {f.type.toUpperCase()}
                  </span>
                </div>
              ))}
            </div>

            {/* Sources used strip — shown after generation */}
            {isDone && (
              <div className="mat-sources-strip" style={{ animation:"fadeUp .3s both" }}>
                <div className="mat-sources-title">
                  {usedSources.length > 0 ? "Sources referenced in this lesson" : "Sources referenced"}
                </div>
                {usedSources.length > 0 ? (
                  usedSources.map((s, i) => (
                    <div key={i} className="mat-source-row">
                      <span style={{ fontSize:13 }}>{typeEmoji[s.type] || "📎"}</span>
                      <span style={{ flex:1, fontWeight:600 }}>{s.fileName}</span>
                      {s.chunkCount && <span className="rag-chip rag-chip--sm">{s.chunkCount} chunks</span>}
                    </div>
                  ))
                ) : (
                  /* Placeholder — will be populated by backend sourcing metadata */
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <span className="rag-chip">📚 {files.length} file{files.length !== 1 ? "s" : ""} searched</span>
                    <span style={{ fontSize:11, color:T.muted, fontWeight:600 }}>
                      Detailed source attribution will appear here once backend sourcing is wired.
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Hint when not yet generated */}
            {!isDone && genStatus !== "generating" && (
              <div style={{ display:"flex", alignItems:"center", gap:8, padding:"9px 12px", background:T.bg, borderRadius:10, border:`1.5px solid ${T.border}`, marginTop:12 }}>
                <span style={{ fontSize:14 }}>💡</span>
                <span style={{ fontSize:11, color:T.muted, fontWeight:600, lineHeight:1.55 }}>
                  Click <strong style={{ color:T.violet }}>Generate Lesson</strong> above to create content grounded in these materials.
                </span>
              </div>
            )}
          </>
        )}

        {/* ── No files — clear empty state with path forward ── */}
        {!hasFiles && (
          <div className="ls-empty">
            <div className="ls-empty-icon">📚</div>
            <div className="ls-empty-title">No materials uploaded yet</div>
            <div className="ls-empty-sub">
              Upload unit materials — textbook chapters, teacher guides, audio scripts or vocabulary lists — and the AI will use them as source material when generating lesson content.
            </div>

            {/* What materials enable */}
            <div style={{ width:"100%", maxWidth:400, textAlign:"left", marginBottom:18 }}>
              {[
                { icon:"🎞", label:"Slides", desc:"Pulled from your vocabulary and grammar examples" },
                { icon:"📋", label:"Tasks",  desc:"Based on your dialogues and comprehension texts" },
                { icon:"📝", label:"Test",   desc:"Questions aligned to your curriculum materials" },
              ].map(({ icon, label, desc }) => (
                <div key={label} style={{ display:"flex", alignItems:"flex-start", gap:10, padding:"8px 0", borderBottom:`1.5px solid ${T.bg}` }}>
                  <span style={{ fontSize:16, flexShrink:0, paddingTop:1 }}>{icon}</span>
                  <div>
                    <div style={{ fontSize:12, fontWeight:800, color:T.text, marginBottom:2 }}>{label}</div>
                    <div style={{ fontSize:11, color:T.muted, lineHeight:1.5 }}>{desc}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* How to upload */}
            <div style={{ display:"flex", alignItems:"flex-start", gap:10, padding:"12px 16px", background:"rgba(0,188,212,.07)", borderRadius:13, border:"1.5px solid rgba(0,188,212,.2)", maxWidth:400, textAlign:"left" }}>
              <span style={{ fontSize:20, flexShrink:0 }}>📂</span>
              <div>
                <div style={{ fontSize:12, fontWeight:800, color:"#00697A", marginBottom:4 }}>How to add materials</div>
                <div style={{ fontSize:11, color:T.sub, lineHeight:1.65 }}>
                  Materials are uploaded at the <strong>course setup</strong> step. Return to setup, upload your files, and they'll be indexed and available to every lesson in this course automatically.
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════
   LESSON EDITOR SHELL
   Receives generation state from CourseBuilderWorkspace.
   Renders the correct banner (CTA / generating / done / error) then sections.
   ═══════════════════════════════════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════════════════════════════════
   LESSON EDITOR SHELL
   ─────────────────────────────────────────────────────────────────────────
   Receives generation state from CourseBuilderWorkspace.
   Renders the correct banner (CTA / generating / done / error) then sections.

   Slide integration:
     onEditSlides — opens the existing SlideEditorPage (passed from workspace)

   Builder extension points (stubs until TaskBuilder / TestBuilder ship):
     onCreateTask     — opens TaskBuilder modal
     onEditTask       — opens TaskBuilder pre-populated
     onCreateQuestion — opens TestBuilder modal
     onEditQuestion   — opens TestBuilder pre-populated
   ═══════════════════════════════════════════════════════════════════════════ */
const LessonEditorShell = ({
  lesson, lessonNotes, onNoteChange,
  onRenameLesson, onUpdateObjective, uploadedFiles,
  genStatus,      /* "idle" | "generating" | "done" | "error" */
  genStep,        /* 0-5 — current step index while generating */
  genContent,     /* { slides, tasks, test, generatedAt } | null */
  onGenerate,     /* () => void */
  onRegenerate,   /* () => void */
  sources,        /* { hasRAG, fileCount, fileNames[] } — derived from uploadedFiles */
  onEditSlides,   /* () => void — opens SlideEditorPage */
}) => {
  const isGenerating = genStatus === "generating";
  const isDone       = genStatus === "done";
  const isError      = genStatus === "error";
  const slides    = genContent?.slides    || [];
  const tasks     = genContent?.tasks     || [];
  const questions = genContent?.test      || [];

  /*
    Builder modals — local to this lesson view.
    When TaskBuilder / TestBuilder ship, replace the stub body
    with the real builder component passed as children.
  */
  const [taskBuilderOpen, setTaskBuilderOpen]   = useState(false);
  const [testBuilderOpen, setTestBuilderOpen]   = useState(false);
  const [editingTaskId,   setEditingTaskId]     = useState(null);
  const [editingQId,      setEditingQId]        = useState(null);

  const handleCreateTask     = () => { setEditingTaskId(null); setTaskBuilderOpen(true); };
  const handleEditTask       = (id) => { setEditingTaskId(id); setTaskBuilderOpen(true); };
  const handleCreateQuestion = () => { setEditingQId(null); setTestBuilderOpen(true); };
  const handleEditQuestion   = (id) => { setEditingQId(id); setTestBuilderOpen(true); };

  return (
    <div style={{ maxWidth:860, animation:"fadeUp .32s both" }}>

      {/* ── Header card ── */}
      <div className="ws-card" style={{ marginBottom:16 }}>
        <div style={{ display:"flex",alignItems:"flex-start",gap:16 }}>
          <div style={{ width:44,height:44,borderRadius:14,background:`linear-gradient(135deg,${T.violet},${T.pink})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0 }}>📖</div>

          <div style={{ flex:1,minWidth:0 }}>
            <textarea
              className="ws-lesson-h1"
              value={lesson.title}
              rows={1}
              onChange={e => onRenameLesson(lesson.id, e.target.value)}
              onInput={e => { e.target.style.height="auto"; e.target.style.height=e.target.scrollHeight+"px"; }}
              placeholder="Lesson title…"
            />

            {/* Meta chips */}
            <div style={{ display:"flex",alignItems:"center",gap:8,marginTop:6,flexWrap:"wrap" }}>
              <span style={{ fontSize:11,fontWeight:700,color:T.muted,background:T.bg,border:`1.5px solid ${T.border}`,borderRadius:8,padding:"3px 10px" }}>
                📂 {lesson.moduleTitle}
              </span>
              {/* Status chip — updates with generation state */}
              {isDone ? (
                <span style={{ fontSize:11,fontWeight:800,padding:"3px 10px",borderRadius:999,background:T.limeL,color:T.lime,border:"1.5px solid rgba(13,184,94,.28)" }}>
                  ✓ Content ready
                </span>
              ) : isGenerating ? (
                <span style={{ fontSize:11,fontWeight:800,padding:"3px 10px",borderRadius:999,background:T.violetL,color:T.violet,border:`1.5px solid ${T.violet}44`,animation:"genPulse 1.4s infinite" }}>
                  ✦ Generating…
                </span>
              ) : (
                <span style={{ fontSize:11,fontWeight:800,padding:"3px 10px",borderRadius:999,background:T.bg,color:T.muted,border:`1.5px solid ${T.border}` }}>
                  ⬜ Not started
                </span>
              )}
              {/* RAG chip — shows when unit materials are available */}
              {sources?.hasRAG && (
                <span className="rag-chip" style={{ fontSize:10 }}>
                  📚 {sources.fileCount} file{sources.fileCount !== 1 ? "s" : ""} ready
                </span>
              )}
            </div>

            {/* Editable objective */}
            <div style={{ display:"flex",alignItems:"flex-start",gap:8,background:T.bg,borderRadius:10,padding:"10px 14px",marginTop:10 }}>
              <span style={{ fontSize:16,flexShrink:0,paddingTop:2 }}>🎯</span>
              <div style={{ flex:1,minWidth:0 }}>
                <div style={{ fontSize:10,fontWeight:800,color:T.muted,letterSpacing:".09em",textTransform:"uppercase",marginBottom:5 }}>Learning Objective</div>
                <textarea
                  style={{ width:"100%",border:"2px solid transparent",borderRadius:8,background:"transparent",outline:"none",resize:"none",fontFamily:T.bFont,fontSize:13,color:T.sub,lineHeight:1.65,padding:"2px 4px",transition:"border-color .14s,background .14s" }}
                  value={lesson.objective || ""}
                  rows={2}
                  onChange={e => onUpdateObjective(lesson.id, e.target.value)}
                  placeholder="What will students be able to do after this lesson?"
                  onFocus={e => Object.assign(e.currentTarget.style,{ borderColor:T.violet,background:"#fff" })}
                  onBlur={e => Object.assign(e.currentTarget.style,{ borderColor:"transparent",background:"transparent" })}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Teacher notes */}
        <div style={{ marginTop:16,paddingTop:16,borderTop:`2px solid ${T.bg}` }}>
          <label className="ws-card-label" style={{ marginBottom:6 }}>📌 Teacher Notes</label>
          <textarea
            className="ws-note-ta"
            value={lessonNotes[lesson.id] || ""}
            onChange={e => onNoteChange(lesson.id, e.target.value)}
            placeholder="Private notes — not visible to students…"
            rows={2}
          />
        </div>
      </div>

      {/* ── Generation state banners ── */}
      {isError && <GenerationErrorBanner onRetry={onGenerate} />}

      {isGenerating && <GeneratingCard currentStep={genStep} sources={sources} />}

      {!isGenerating && !isDone && !isError && (
        <GenerateCTA onGenerate={onGenerate} isGenerating={false} sources={sources} />
      )}

      {isDone && (
        <GeneratedDoneBanner
          lesson={lesson}
          generatedAt={genContent?.generatedAt}
          onRegenerate={onRegenerate}
          isGenerating={false}
          sources={sources}
        />
      )}

      {/* ── Content sections — always mounted, dims while generating ── */}
      <SlidesSection
        slides={slides}
        isGenerating={isGenerating}
        onEditSlides={onEditSlides}
      />
      <TasksSection
        tasks={tasks}
        isGenerating={isGenerating}
        onCreateTask={handleCreateTask}
        onEditTask={handleEditTask}
      />
      <TestSection
        questions={questions}
        isGenerating={isGenerating}
        onCreateQuestion={handleCreateQuestion}
        onEditQuestion={handleEditQuestion}
      />
      <MaterialsSection
        lesson={lesson}
        uploadedFiles={uploadedFiles}
        genStatus={genStatus}
        genContent={genContent}
      />

      {/* ── Builder stub modals — EXTENSION POINTS ── */}
      <BuilderStubModal
        open={taskBuilderOpen}
        onClose={() => { setTaskBuilderOpen(false); setEditingTaskId(null); }}
        title={editingTaskId ? "Edit Task" : "Create Task"}
        subtitle={editingTaskId ? "Modify this practice task" : "Add a practice task for this lesson"}
        icon="📋"
        iconBg={`linear-gradient(135deg,${T.sky},${T.violet})`}
      />
      <BuilderStubModal
        open={testBuilderOpen}
        onClose={() => { setTestBuilderOpen(false); setEditingQId(null); }}
        title={editingQId ? "Edit Question" : "Add Question"}
        subtitle={editingQId ? "Modify this test question" : "Add a question to this lesson's test"}
        icon="📝"
        iconBg="linear-gradient(135deg,#0DB85E,#00BCD4)"
      />
    </div>
  );
};


const WorkspaceInspector = ({
  modules, courseData, selectedLesson,
  visibility, onVisibilityChange,
  lessonGenStatus, lessonGenContent, lessonGenStep, onGenerate,
  sources,
  lessonNotes, onNoteChange,
  totalLessons, doneCount,
  onRenameLesson, onUpdateObjective, onDeleteLesson, onSelectLesson,
  onEditSlides,  /* () => void — opens SlideEditorPage for selected lesson */
}) => {
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => { setConfirmDelete(false); }, [selectedLesson?.id]);

  const hasRAG    = sources?.hasRAG    || false;
  const fileCount = sources?.fileCount || 0;
  const fileNames = sources?.fileNames || [];

  /* ── Course-level inspector ── */
  if (!selectedLesson) return (
    <div className="ws-inspector">
      <div className="ws-insp-sec">
        <div className="ws-insp-hd">📋 Course</div>
        {[
          { k:"Subject",  v:courseData.subject        },
          { k:"Level",    v:courseData.level           },
          { k:"Language", v:courseData.nativeLanguage  },
          { k:"Modules",  v:modules.length             },
          { k:"Lessons",  v:totalLessons               },
        ].map(({ k,v }) => (
          <div key={k} className="ws-insp-row">
            <span className="ws-insp-key">{k}</span>
            <span className="ws-insp-val">{v}</span>
          </div>
        ))}
      </div>

      <div className="ws-insp-sec">
        <div className="ws-insp-hd">📊 Progress</div>
        <div style={{ height:6,background:T.border,borderRadius:999,overflow:"hidden",marginBottom:8 }}>
          <div style={{ height:"100%",background:"linear-gradient(90deg,#0DB85E,#00BCD4)",borderRadius:999,width:`${totalLessons ? (doneCount/totalLessons)*100 : 0}%`,transition:"width .5s" }} />
        </div>
        <div style={{ fontSize:12,color:T.muted,fontWeight:600,marginBottom:8 }}>{doneCount} of {totalLessons} lessons generated</div>
        {[
          { emoji:"🎞", label:"Slides",  n: doneCount },
          { emoji:"📋", label:"Tasks",   n: doneCount },
          { emoji:"📝", label:"Test Qs", n: doneCount },
        ].map(({ emoji,label,n }) => (
          <div key={label} className="ws-insp-row">
            <span style={{ display:"flex",alignItems:"center",gap:5,color:T.muted,fontWeight:600,fontSize:12 }}><span>{emoji}</span>{label}</span>
            <span style={{ fontSize:12,fontWeight:800,color:T.text }}>{n}/{totalLessons}</span>
          </div>
        ))}
      </div>

      <div className="ws-insp-sec">
        <div className="ws-insp-hd">👁 Visibility</div>
        {[
          { val:"draft",     label:"Draft",     sub:"Only you can see it",    emoji:"🔒" },
          { val:"published", label:"Published", sub:"Visible to all students", emoji:"🌐" },
          { val:"unlisted",  label:"Unlisted",  sub:"Shareable via link only", emoji:"🔗" },
        ].map(({ val,label,sub,emoji }) => (
          <div key={val} className={`ws-vis-opt${visibility===val?" ws-vis-opt--on":""}`} onClick={() => onVisibilityChange(val)}>
            <div className="ws-vis-radio">{visibility===val && <div className="ws-vis-radio-dot" />}</div>
            <span style={{ fontSize:16 }}>{emoji}</span>
            <div style={{ flex:1,minWidth:0 }}>
              <div className="ws-vis-lbl">{label}</div>
              <div className="ws-vis-sub">{sub}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="ws-insp-sec" style={{ flex:1 }}>
        <div className="ws-insp-hd">⚡ Quick Actions</div>
        <div style={{ padding:"10px 12px",background:T.violetL,borderRadius:10,border:`1.5px solid ${T.violet}22`,fontSize:11,color:T.violet,fontWeight:600,lineHeight:1.6 }}>
          Select a lesson in the sidebar to generate its content.
        </div>
        <button className="ws-act-btn" style={{ marginTop:8 }}>
          <span className="ws-act-btn-icon" style={{ background:T.skyL,fontSize:12 }}>📤</span>
          Export course outline
        </button>
      </div>

      {/* ── Unit materials status ── */}
      <div className="ws-insp-sec">
        <div className="ws-insp-hd">📚 Unit Materials</div>
        {hasRAG ? (
          <>
            <div className="insp-mat-row">
              <span style={{ fontSize:18 }}>📚</span>
              <div style={{ flex:1, minWidth:0 }}>
                <div className="insp-mat-count">{fileCount} file{fileCount !== 1 ? "s" : ""} indexed</div>
                <div className="insp-mat-label">Available for RAG-assisted generation</div>
              </div>
              <span className="rag-chip">RAG-ready</span>
            </div>
            <div style={{ fontSize:11, color:T.sub, lineHeight:1.6, marginTop:4 }}>
              Every lesson in this course can draw on these materials when generating content.
            </div>
            {fileNames.slice(0, 3).map((n, i) => (
              <div key={i} style={{ display:"flex", alignItems:"center", gap:6, marginTop:5, fontSize:11, color:T.muted, fontWeight:600 }}>
                <span style={{ fontSize:12 }}>📄</span>
                <span style={{ flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{n}</span>
              </div>
            ))}
            {fileNames.length > 3 && (
              <div style={{ fontSize:10, color:T.mutedL, marginTop:4, fontWeight:600 }}>
                + {fileNames.length - 3} more file{fileNames.length - 3 !== 1 ? "s" : ""}
              </div>
            )}
          </>
        ) : (
          <div className="insp-mat-nudge">
            No materials uploaded yet. Upload unit files during course setup to let AI generate richer, curriculum-aligned content.
          </div>
        )}
      </div>
    </div>
  );

  /* ── Lesson-level inspector ── */
  const isGenerating = lessonGenStatus === "generating";
  const isDone       = lessonGenStatus === "done";
  const isError      = lessonGenStatus === "error";
  const isIdle       = !isGenerating && !isDone && !isError;

  const slides    = lessonGenContent?.slides    || [];
  const tasks     = lessonGenContent?.tasks     || [];
  const questions = lessonGenContent?.test      || [];
  const genAt     = lessonGenContent?.generatedAt;

  /* Status pill config */
  const stCfg = isDone
    ? { label:"✓ Ready",      bg:T.limeL,   col:T.lime,   border:"rgba(13,184,94,.28)" }
    : isGenerating
    ? { label:"⟳ Generating", bg:T.violetL, col:T.violet, border:`${T.violet}44` }
    : isError
    ? { label:"⚠ Error",      bg:T.redL,    col:T.red,    border:"rgba(239,68,68,.25)" }
    : { label:"⬜ Not started",bg:T.bg,      col:T.muted,  border:T.border };

  /* Step fraction for mini progress in inspector while generating */
  const activeSteps = hasRAG ? GEN_STEPS_RAG : GEN_STEPS_BASE;
  const stepPct = isGenerating
    ? Math.round((lessonGenStep / activeSteps.length) * 100)
    : isDone ? 100 : 0;
  const activeStepLabel = activeSteps[lessonGenStep];

  return (
    <div className="ws-inspector">

      {/* ── Lesson meta ── */}
      <div className="ws-insp-sec">
        <div className="ws-insp-hd">📖 Lesson</div>

        <label className="ws-card-label" style={{ marginBottom:5 }}>Title</label>
        <input
          className="ws-insp-input"
          value={selectedLesson.title}
          onChange={e => onRenameLesson(selectedLesson.id, e.target.value)}
          placeholder="Lesson title…"
          style={{ marginBottom:10 }}
        />

        <label className="ws-card-label" style={{ marginBottom:5 }}>Objective</label>
        <textarea
          className="ws-insp-ta"
          value={selectedLesson.objective || ""}
          onChange={e => onUpdateObjective(selectedLesson.id, e.target.value)}
          placeholder="Learning objective…"
          rows={3}
          style={{ marginBottom:8 }}
        />

        <div className="ws-insp-row">
          <span className="ws-insp-key">Module</span>
          <span className="ws-insp-val" style={{ color:T.violet }}>{selectedLesson.moduleTitle}</span>
        </div>
        <div className="ws-insp-row">
          <span className="ws-insp-key">Status</span>
          <span style={{ fontSize:11,fontWeight:800,padding:"2px 9px",borderRadius:999,background:stCfg.bg,color:stCfg.col,border:`1.5px solid ${stCfg.border}` }}>
            {stCfg.label}
          </span>
        </div>
        {genAt && isDone && (
          <div style={{ fontSize:10,color:T.muted,marginTop:4,fontWeight:600 }}>
            Generated at {new Intl.DateTimeFormat("en",{ hour:"numeric",minute:"2-digit" }).format(new Date(genAt))}
            {hasRAG && <span style={{ color:"#00838F" }}> · with materials</span>}
          </div>
        )}
      </div>

      {/* ── Content status — live counts ── */}
      <div className="ws-insp-sec">
        <div className="ws-insp-hd">📦 Content</div>

        {/* Mini progress bar while generating */}
        {(isGenerating || isDone) && (
          <div style={{ marginBottom:10 }}>
            <div style={{ height:4,background:T.border,borderRadius:999,overflow:"hidden" }}>
              <div style={{
                height:"100%", borderRadius:999, width:`${stepPct}%`, transition:"width .5s cubic-bezier(.4,0,.2,1)",
                background: isGenerating && activeStepLabel?.rag
                  ? "linear-gradient(90deg,#00BCD4,#0099E6)"
                  : "linear-gradient(90deg,#6C35DE,#F0447C)",
              }} />
            </div>
            {isGenerating && activeStepLabel && (
              <div style={{ fontSize:10, fontWeight:700, marginTop:4, animation:"genPulse 1.4s infinite",
                color: activeStepLabel.rag ? T.teal : T.violet }}>
                {activeStepLabel.emoji} {activeStepLabel.label}…
              </div>
            )}
          </div>
        )}

        {[
          { emoji:"🎞", label:"Slides", hint:"4–5 slides",   count:slides.length,    col:T.violet, bg:T.violetL },
          { emoji:"📋", label:"Tasks",  hint:"3 activities", count:tasks.length,     col:T.sky,    bg:T.skyL    },
          { emoji:"📝", label:"Test",   hint:"4 questions",  count:questions.length, col:T.lime,   bg:T.limeL   },
        ].map(({ emoji,label,hint,count,col,bg }) => {
          const ready = count > 0;
          return (
            <div key={label} className="ws-content-row">
              <div className="ws-content-icon" style={{ background:bg }}>{emoji}</div>
              <div className="ws-content-info">
                <div className="ws-content-lbl">{label}</div>
                <div className="ws-content-hint">{ready ? `${count} ${label.toLowerCase()}` : hint}</div>
              </div>
              <span className={`ws-content-pill${ready ? " ws-content-pill--done" : isGenerating ? " ws-content-pill--gen" : " ws-content-pill--pending"}`}>
                {ready ? "✓" : isGenerating ? "…" : "Pending"}
              </span>
            </div>
          );
        })}
      </div>

      {/* ── Generate / Regenerate ── */}
      <div className="ws-insp-sec">
        <div className="ws-insp-hd">✦ Generation</div>

        {/* Materials context row — always show when a lesson is selected */}
        {hasRAG ? (
          <div className="insp-mat-row" style={{ marginBottom:10 }}>
            <span style={{ fontSize:16 }}>📚</span>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:11, fontWeight:800, color:"#00838F" }}>
                {fileCount} file{fileCount !== 1 ? "s" : ""} will be searched
              </div>
              <div className="insp-mat-label">AI uses your uploaded materials</div>
            </div>
            <span className="rag-chip rag-chip--sm">RAG</span>
          </div>
        ) : (
          <div className="insp-mat-nudge" style={{ marginBottom:10 }}>
            💡 No materials uploaded. Upload unit files during setup to ground generation in your curriculum.
          </div>
        )}

        {isIdle && (
          <>
            <button
              className="ws-act-btn ws-act-btn--generate-live"
              onClick={onGenerate}
              style={{ marginBottom:8, background: hasRAG
                ? "linear-gradient(135deg,#00838F,#0099E6)"
                : undefined }}
            >
              <span className="ws-act-btn-icon" style={{ background:"rgba(255,255,255,.2)", fontSize:14 }}>
                {hasRAG ? "📚" : "✦"}
              </span>
              {hasRAG ? "Generate with materials" : "Generate lesson"}
            </button>
            <div style={{ fontSize:11, color:T.muted, lineHeight:1.55, padding:"8px 10px", background:T.bg, borderRadius:9, border:`1.5px solid ${T.border}` }}>
              {hasRAG
                ? "Slides, tasks and test will be grounded in your uploaded files."
                : "Generates slides, tasks and test questions from the lesson objective."}
            </div>
          </>
        )}

        {isGenerating && (
          <div style={{ background: activeStepLabel?.rag ? "rgba(0,188,212,.08)" : T.violetL,
            borderRadius:12, padding:"12px 14px",
            border: activeStepLabel?.rag ? "1.5px solid rgba(0,188,212,.3)" : `1.5px solid ${T.violet}33` }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
              <div style={{ width:14, height:14, borderRadius:"50%",
                border:`2.5px solid ${activeStepLabel?.rag ? "rgba(0,188,212,.25)" : T.violetL}`,
                borderTopColor: activeStepLabel?.rag ? T.teal : T.violet,
                animation:"spin .75s linear infinite", flexShrink:0 }} />
              <span style={{ fontSize:12, fontWeight:800, color: activeStepLabel?.rag ? T.teal : T.violet }}>
                {activeStepLabel?.rag ? "Searching materials…" : "Generating…"}
              </span>
            </div>
            <div style={{ fontSize:11, color: activeStepLabel?.rag ? "#00697A" : T.violet, fontWeight:600, lineHeight:1.5 }}>
              Step {Math.min(lessonGenStep + 1, activeSteps.length)} of {activeSteps.length}: {activeStepLabel?.label || "Finalising"}
            </div>
            <div style={{ height:3, borderRadius:999, marginTop:8, overflow:"hidden",
              background: activeStepLabel?.rag ? "rgba(0,188,212,.15)" : `${T.violet}22` }}>
              <div style={{ height:"100%", borderRadius:999, width:`${stepPct}%`, transition:"width .5s",
                background: activeStepLabel?.rag ? T.teal : T.violet }} />
            </div>
          </div>
        )}

        {isDone && (
          <>
            {hasRAG && (
              <div style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 10px",
                background:"rgba(0,188,212,.07)", borderRadius:9, border:"1.5px solid rgba(0,188,212,.18)",
                marginBottom:8, animation:"fadeUp .3s both" }}>
                <span style={{ fontSize:14 }}>📚</span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:11, fontWeight:800, color:"#00838F" }}>Generated with materials</div>
                  <div style={{ fontSize:10, color:T.sub, marginTop:1 }}>
                    Content is grounded in your {fileCount} uploaded file{fileCount !== 1 ? "s" : ""}
                  </div>
                </div>
              </div>
            )}
            <button className="ws-act-btn ws-act-btn--regen" onClick={onGenerate} style={{ marginBottom:8 }}>
              <span className="ws-act-btn-icon" style={{ background:T.limeL, fontSize:12 }}>↺</span>
              Regenerate lesson
            </button>
          </>
        )}

        {isError && (
          <>
            <div style={{ background:T.redL, borderRadius:10, padding:"10px 12px", border:`1.5px solid rgba(239,68,68,.2)`, marginBottom:8 }}>
              <div style={{ fontSize:11, fontWeight:700, color:T.red, marginBottom:3 }}>Generation failed</div>
              <div style={{ fontSize:10, color:T.sub }}>Check connection and retry.</div>
            </div>
            <button className="ws-act-btn ws-act-btn--generate-live" onClick={onGenerate}
              style={{ background: hasRAG ? "linear-gradient(135deg,#00838F,#0099E6)" : undefined }}>
              <span className="ws-act-btn-icon" style={{ background:"rgba(255,255,255,.2)", fontSize:12 }}>↺</span>
              Retry generation
            </button>
          </>
        )}
      </div>

      {/* ── Teacher notes ── */}
      <div className="ws-insp-sec">
        <div className="ws-insp-hd">📌 Notes</div>
        <textarea
          className="ws-note-ta"
          value={lessonNotes[selectedLesson.id] || ""}
          onChange={e => onNoteChange(selectedLesson.id, e.target.value)}
          placeholder="Private notes…"
          rows={3}
        />
      </div>

      {/* ── Actions ── */}
      <div className="ws-insp-sec" style={{ flex:1 }}>
        <div className="ws-insp-hd">⚙ Actions</div>

        {/* Slides — live integration */}
        <button
          className="ws-act-btn ws-act-btn--slides"
          onClick={onEditSlides}
          disabled={!onEditSlides}
        >
          <span className="ws-act-btn-icon" style={{ background:"rgba(255,255,255,.2)", fontSize:11 }}>🎞</span>
          {(lessonGenContent?.slides?.length || 0) > 0 ? "Edit Slides" : "Create Slides"}
        </button>

        {/* Tasks — extension point (enabled stub) */}
        <button
          className="ws-act-btn ws-act-btn--task"
          onClick={() => {/* TaskBuilder will connect here */}}
          title="Task builder — coming soon"
          style={{ opacity:.7 }}
        >
          <span className="ws-act-btn-icon" style={{ background:T.skyL, fontSize:11 }}>📋</span>
          Add Task
        </button>

        {/* Test — extension point (enabled stub) */}
        <button
          className="ws-act-btn ws-act-btn--test"
          onClick={() => {/* TestBuilder will connect here */}}
          title="Test builder — coming soon"
          style={{ opacity:.7 }}
        >
          <span className="ws-act-btn-icon" style={{ background:T.limeL, fontSize:11 }}>📝</span>
          Add Question
        </button>

        {/* Delete */}
        {!confirmDelete ? (
          <button className="ws-act-btn ws-act-btn--danger" onClick={() => setConfirmDelete(true)}>
            <span className="ws-act-btn-icon" style={{ background:T.redL, fontSize:11 }}>🗑</span>
            Delete lesson
          </button>
        ) : (
          <div style={{ background:T.redL, borderRadius:11, padding:"10px 12px", border:`1.5px solid rgba(239,68,68,.2)`, animation:"fadeIn .15s both" }}>
            <div style={{ fontSize:12, fontWeight:700, color:T.red, marginBottom:8 }}>Delete "{selectedLesson.title}"?</div>
            <div style={{ display:"flex", gap:7 }}>
              <button
                style={{ flex:1, background:T.red, color:"#fff", border:"none", borderRadius:8, padding:"7px 0", fontSize:12, fontWeight:800, cursor:"pointer", fontFamily:T.dFont }}
                onClick={() => { onDeleteLesson(selectedLesson.id); setConfirmDelete(false); onSelectLesson(null); }}
              >Delete</button>
              <button
                style={{ flex:1, background:"#fff", color:T.muted, border:`2px solid ${T.border}`, borderRadius:8, padding:"7px 0", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:T.dFont }}
                onClick={() => setConfirmDelete(false)}
              >Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════
   CUSTOM HOOKS — extracted from CourseBuilderWorkspace for clarity
   ─────────────────────────────────────────────────────────────────────────
   useCourseState      — canonical course tree + all CRUD mutations
   useDraftPersistence — unsaved-changes tracking, auto-save, explicit save
   useGenerationEngine — per-lesson async generation + slide editor overlay
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── useCourseState ──────────────────────────────────────────────────────── */
function useCourseState(outline) {
  const [course, setCourse] = useState(() => ({
    title:       outline.title       || "",
    description: outline.description || "",
    modules: (outline.modules || []).map(m => ({
      id:      m.id      || uid(),
      title:   m.title   || "Untitled Module",
      lessons: (m.lessons || []).map(l => ({
        id:        l.id        || uid(),
        title:     l.title     || "Untitled Lesson",
        objective: l.objective || "",
      })),
    })),
  }));

  const [selectedId,  setSelectedId]  = useState(null);
  const [lessonNotes, setLessonNotes] = useState({});
  const [expandedMods, setExpandedMods] = useState(
    () => new Set((outline.modules || []).map(m => m.id))
  );

  /* Derived */
  const allLessons = course.modules.flatMap(m =>
    m.lessons.map(l => ({ ...l, moduleTitle: m.title, moduleId: m.id }))
  );
  const selectedLesson = selectedId ? allLessons.find(l => l.id === selectedId) : null;

  /* Course patch */
  const patchCourse = patch => setCourse(c => ({ ...c, ...patch }));

  /* Module mutations */
  const addModule = () => {
    const id = uid();
    setCourse(c => ({ ...c, modules: [...c.modules, { id, title: "New Module", lessons: [] }] }));
    setExpandedMods(p => new Set([...p, id]));
  };
  const renameModule = (id, title) =>
    setCourse(c => ({ ...c, modules: c.modules.map(m => m.id === id ? { ...m, title } : m) }));
  const deleteModule = (id) => {
    const mod = course.modules.find(m => m.id === id);
    if (mod && selectedId && mod.lessons.some(l => l.id === selectedId)) setSelectedId(null);
    setCourse(c => ({ ...c, modules: c.modules.filter(m => m.id !== id) }));
    setExpandedMods(p => { const n = new Set(p); n.delete(id); return n; });
  };

  /* Lesson mutations */
  const addLesson = (moduleId) => {
    const id = uid();
    setCourse(c => ({
      ...c,
      modules: c.modules.map(m =>
        m.id !== moduleId ? m : { ...m, lessons: [...m.lessons, { id, title: "New Lesson", objective: "" }] }
      ),
    }));
    setSelectedId(id);
    setExpandedMods(p => new Set([...p, moduleId]));
  };
  const renameLesson = (id, title) =>
    setCourse(c => ({
      ...c, modules: c.modules.map(m => ({ ...m, lessons: m.lessons.map(l => l.id === id ? { ...l, title } : l) })),
    }));
  const updateObjective = (id, objective) =>
    setCourse(c => ({
      ...c, modules: c.modules.map(m => ({ ...m, lessons: m.lessons.map(l => l.id === id ? { ...l, objective } : l) })),
    }));
  const deleteLesson = (id) => {
    if (selectedId === id) setSelectedId(null);
    setCourse(c => ({
      ...c, modules: c.modules.map(m => ({ ...m, lessons: m.lessons.filter(l => l.id !== id) })),
    }));
  };

  /* Sidebar */
  const toggleMod = id => setExpandedMods(prev => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next;
  });
  const handleSelectLesson = id => setSelectedId(id);

  return {
    course, allLessons, selectedLesson, selectedId,
    expandedMods, lessonNotes,
    setLessonNotes, toggleMod, handleSelectLesson,
    patchCourse, addModule, renameModule, deleteModule,
    addLesson, renameLesson, updateObjective, deleteLesson,
  };
}

/* ── useDraftPersistence ─────────────────────────────────────────────────── */
/*
  Watches `course` and `lessonNotes` for changes and:
   - Sets `unsavedChanges = true` on any mutation after initial mount
   - Auto-saves to localStorage after a 1.5s debounce (frontend-only, no API needed)
   - handleSave() saves immediately, sets lastSavedAt, clears dirty flag, shows toast

  When the backend save endpoint is ready, replace the saveDraft call in
  handleSave with fetch('/api/v1/course-builder/save', { method:'PUT', body:... }).
*/
function useDraftPersistence({ courseId, course, lessonNotes }) {
  const [unsavedChanges, setUnsavedChanges] = useState(false);
  const [lastSavedAt,    setLastSavedAt]    = useState(null);
  const [saving,         setSaving]         = useState(false);
  const [saveToast,      setSaveToast]      = useState(false);

  const isFirstRender = useRef(true);
  const debounceTimer = useRef(null);

  /* Mark dirty + debounced localStorage auto-save whenever tracked data changes */
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    setUnsavedChanges(true);
    clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      saveDraft(courseId || "default", { course, lessonNotes });
    }, 1500);
    return () => clearTimeout(debounceTimer.current);
  }, [course, lessonNotes]); // reference-equality: fires when state objects are replaced

  /* Explicit save — clears dirty, records timestamp, shows toast */
  const handleSave = useCallback(() => {
    setSaving(true);
    saveDraft(courseId || "default", { course, lessonNotes });
    setTimeout(() => {
      setSaving(false);
      setUnsavedChanges(false);
      setLastSavedAt(Date.now());
      setSaveToast(true);
      setTimeout(() => setSaveToast(false), 2400);
    }, 500);
  }, [courseId, course, lessonNotes]);

  return { unsavedChanges, lastSavedAt, saving, saveToast, handleSave };
}

/* ── useGenerationEngine ─────────────────────────────────────────────────── */
/*
  Per-lesson async generation.  Each lesson has its own AbortController so
  cancellations and retries are isolated — running one never blocks another.

  Also owns the SlideEditorPage overlay state:
    editingLessonId — when set, CourseBuilderWorkspace renders the editor
    instead of the builder shell.  updateSlides() saves back + clears it.
*/
function useGenerationEngine({ allLessons, courseData }) {
  const [lessonGenerationStatus, setLessonGenerationStatus] = useState({});
  const [generatedLessons,       setGeneratedLessons]       = useState({});
  const [genStep,                setGenStep]                = useState({});
  const [editingLessonId,        setEditingLessonId]        = useState(null);
  const abortRefs = useRef({});

  /* Abort all on unmount */
  useEffect(() => {
    const refs = abortRefs.current;
    return () => Object.values(refs).forEach(c => c.abort());
  }, []);

  const generateLesson = useCallback(async (lessonId) => {
    abortRefs.current[lessonId]?.abort();
    const controller = new AbortController();
    abortRefs.current[lessonId] = controller;

    const lesson = allLessons.find(l => l.id === lessonId);
    if (!lesson) return;

    setLessonGenerationStatus(p => ({ ...p, [lessonId]: "generating" }));
    setGenStep(p => ({ ...p, [lessonId]: 0 }));

    try {
      const content = await mockGenerateLesson({
        lesson, courseData,
        signal: controller.signal,
        onStep: step => setGenStep(p => ({ ...p, [lessonId]: step })),
      });
      if (controller.signal.aborted) return;
      setGeneratedLessons(p => ({ ...p, [lessonId]: content }));
      setLessonGenerationStatus(p => ({ ...p, [lessonId]: "done" }));
      setGenStep(p => ({ ...p, [lessonId]: GEN_STEPS.length }));
    } catch (err) {
      if (err.message === "aborted") return;
      console.error("Lesson generation failed:", err);
      setLessonGenerationStatus(p => ({ ...p, [lessonId]: "error" }));
    }
  }, [allLessons, courseData]);

  /* Saves slide edits back into generatedLessons and closes the editor overlay.
     Also promotes idle lessons to "done" when teacher creates slides manually. */
  const updateSlides = useCallback((lessonId, editedSlides) => {
    setGeneratedLessons(prev => ({
      ...prev,
      [lessonId]: { ...(prev[lessonId] || {}), slides: editedSlides, savedAt: Date.now() },
    }));
    setLessonGenerationStatus(prev => {
      if (!prev[lessonId] || prev[lessonId] === "idle") return { ...prev, [lessonId]: "done" };
      return prev;
    });
    setEditingLessonId(null);
  }, []);

  /* Derived — consumed by sidebar dots and inspector */
  const lessonStatuses = Object.fromEntries(
    allLessons.map(l => {
      const s = lessonGenerationStatus[l.id];
      return [l.id, s === "done" ? "done" : s === "generating" ? "generating" : s === "error" ? "error" : "idle"];
    })
  );
  const doneCount = Object.values(lessonGenerationStatus).filter(s => s === "done").length;

  return {
    lessonGenerationStatus, generatedLessons, genStep,
    editingLessonId, setEditingLessonId,
    generateLesson, updateSlides,
    lessonStatuses, doneCount,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   COURSE BUILDER WORKSPACE  ← root orchestrator
   ─────────────────────────────────────────────────────────────────────────
   Three-panel layout:  WorkspaceSidebar | main area | WorkspaceInspector
   State is split across the three hooks above; this component owns only:
     - visibility toggle (draft/published)
     - breadcrumb derivation
     - prop-threading to children
   ═══════════════════════════════════════════════════════════════════════════ */
function CourseBuilderWorkspace({ outline, courseData, uploadedFiles, courseId, unitMap }) {

  /* ── Core state via hooks ── */
  const cs  = useCourseState(outline);
  const gen = useGenerationEngine({ allLessons: cs.allLessons, courseData });
  const draft = useDraftPersistence({ courseId, course: cs.course, lessonNotes: cs.lessonNotes });

  /* ── Local UI-only state ── */
  const [visibility, setVisibility] = useState("draft");

  /* ── Shared sources — unit-level RAG availability ── */
  const sharedSources = {
    hasRAG:    (uploadedFiles || []).length > 0,
    fileCount: (uploadedFiles || []).length,
    fileNames: (uploadedFiles || []).map(f => f.name).filter(Boolean),
    /* future: chunkCount, sources[] from GET /api/v1/rag/unit/:unitId/status */
  };

  /* ── Publish (stub) ── */
  const handlePublish = () => { alert("Publish flow will be wired in the next iteration."); };

  /* ── Slide editor portal — mounts on document.body to escape AdminLayout stacking context ── */
  const slideEditorPortal = gen.editingLessonId ? (() => {
    const editLesson  = cs.allLessons.find(l => l.id === gen.editingLessonId);
    const editContent = gen.generatedLessons[gen.editingLessonId];
    const editSlides  = editContent?.slides || [];

    return createPortal(
      <SlideEditorPage
        slides={editSlides}
        title={editLesson?.title || "Untitled Lesson"}
        meta={`${editSlides.length} slide${editSlides.length !== 1 ? "s" : ""} · ${courseData.subject || "Lesson"}`}
        onBack={() => gen.setEditingLessonId(null)}
        onSave={(edited) => gen.updateSlides(gen.editingLessonId, edited)}
        lessonCtx={{
          title:        editLesson?.title,
          objective:    editLesson?.objective,
          moduleTitle:  editLesson?.moduleTitle,
          lessonIndex:  cs.allLessons.findIndex(l => l.id === gen.editingLessonId),
          totalLessons: cs.allLessons.length,
        }}
      />,
      document.body
    );
  })() : null;

  /* ── Breadcrumb ── */
  const breadcrumb = cs.selectedLesson
    ? [
        { label: cs.course.title || "Course", action: () => cs.handleSelectLesson(null) },
        { label: cs.selectedLesson.moduleTitle },
        { label: cs.selectedLesson.title, active: true },
      ]
    : [{ label: cs.course.title || "Course", active: true }];

  return (
    <>
      <WorkspaceStyles />
      <div className="ws-root">

        {/* ── Topbar ── */}
        <WorkspaceTopbar
          title={cs.course.title}
          doneCount={gen.doneCount}
          totalCount={cs.allLessons.length}
          onSave={draft.handleSave}
          saving={draft.saving}
          onPublish={handlePublish}
          unsavedChanges={draft.unsavedChanges}
          lastSavedAt={draft.lastSavedAt}
        />

        <div className="ws-body">

          {/* ── Left sidebar ── */}
          <WorkspaceSidebar
            modules={cs.course.modules}
            selectedId={cs.selectedId}
            onSelect={cs.handleSelectLesson}
            expandedMods={cs.expandedMods}
            onToggleMod={cs.toggleMod}
            onAddModule={cs.addModule}
            onRenameModule={cs.renameModule}
            onDeleteModule={cs.deleteModule}
            onAddLesson={cs.addLesson}
            onRenameLesson={cs.renameLesson}
            onDeleteLesson={cs.deleteLesson}
            lessonStatuses={gen.lessonStatuses}
          />

          {/* ── Main editor ── */}
          <div className="ws-main">
            {/* Breadcrumb */}
            <div className="ws-breadcrumb">
              {breadcrumb.map((crumb, i) => (
                <span key={i} style={{ display:"flex",alignItems:"center",gap:6 }}>
                  {i > 0 && <span className="ws-breadcrumb-sep">›</span>}
                  {crumb.active
                    ? <span className="ws-breadcrumb-active">{crumb.label}</span>
                    : <span className="ws-breadcrumb-link" onClick={crumb.action}>{crumb.label}</span>
                  }
                </span>
              ))}
            </div>

            {/* Scrollable content */}
            <div className="ws-main-scroll">
              {!cs.selectedLesson ? (
                <CourseDetailsView
                  modules={cs.course.modules}
                  courseData={courseData}
                  courseEdits={{ title: cs.course.title, description: cs.course.description }}
                  onEditCourse={cs.patchCourse}
                  onAddModule={cs.addModule}
                  onRenameModule={cs.renameModule}
                  onDeleteModule={cs.deleteModule}
                  onAddLesson={cs.addLesson}
                  onDeleteLesson={cs.deleteLesson}
                  onSelectLesson={cs.handleSelectLesson}
                />
              ) : (
                <LessonEditorShell
                  lesson={cs.selectedLesson}
                  lessonNotes={cs.lessonNotes}
                  onNoteChange={(id, val) => cs.setLessonNotes(p => ({ ...p, [id]: val }))}
                  onRenameLesson={cs.renameLesson}
                  onUpdateObjective={cs.updateObjective}
                  uploadedFiles={uploadedFiles}
                  genStatus={gen.lessonGenerationStatus[cs.selectedLesson.id] || "idle"}
                  genStep={gen.genStep[cs.selectedLesson.id] || 0}
                  genContent={gen.generatedLessons[cs.selectedLesson.id] || null}
                  onGenerate={() => gen.generateLesson(cs.selectedLesson.id)}
                  onRegenerate={() => gen.generateLesson(cs.selectedLesson.id)}
                  sources={sharedSources}
                  onEditSlides={() => gen.setEditingLessonId(cs.selectedLesson.id)}
                />
              )}
            </div>
          </div>

          {/* ── Right inspector ── */}
          <WorkspaceInspector
            modules={cs.course.modules}
            courseData={courseData}
            selectedLesson={cs.selectedLesson}
            visibility={visibility}
            onVisibilityChange={setVisibility}
            lessonGenStatus={cs.selectedLesson ? (gen.lessonGenerationStatus[cs.selectedLesson.id] || "idle") : null}
            lessonGenContent={cs.selectedLesson ? (gen.generatedLessons[cs.selectedLesson.id] || null) : null}
            lessonGenStep={cs.selectedLesson ? (gen.genStep[cs.selectedLesson.id] || 0) : 0}
            onGenerate={cs.selectedLesson ? () => gen.generateLesson(cs.selectedLesson.id) : null}
            onEditSlides={cs.selectedLesson ? () => gen.setEditingLessonId(cs.selectedLesson.id) : null}
            sources={sharedSources}
            lessonNotes={cs.lessonNotes}
            onNoteChange={(id, val) => cs.setLessonNotes(p => ({ ...p, [id]: val }))}
            totalLessons={cs.allLessons.length}
            doneCount={gen.doneCount}
            onRenameLesson={cs.renameLesson}
            onUpdateObjective={cs.updateObjective}
            onDeleteLesson={cs.deleteLesson}
            onSelectLesson={cs.handleSelectLesson}
          />
        </div>

        {draft.saveToast && <div className="ws-toast">💾 Draft saved</div>}
      </div>

      {/* Slide editor — portalled to document.body to escape layout stacking context */}
      {slideEditorPortal}
    </>
  );
}


/* ═══════════════════════════════════════════════════════════════════════════
   TEACHER ONBOARDING PAGE  ← top-level entry point
   ─────────────────────────────────────────────────────────────────────────
   phase: "setup"   — SetupFlow (welcome → language → level → options → outline)
   phase: "builder" — CourseBuilderWorkspace (lesson-by-lesson build + publish)

   Transition: smooth fade + subtle scale when flipping phase.
   ═══════════════════════════════════════════════════════════════════════════ */

export default function TeacherOnboardingPage({ courseId, unitMap }) {
  const [phase,       setPhase]       = useState("setup");
  const [builderData, setBuilderData] = useState(null); // { outline, courseData, uploadedFiles }
  const [transitioning, setTransitioning] = useState(false);

  /**
   * Called by SetupFlow when outline is approved and teacher clicks
   * "Start building →".  Runs a brief exit animation on setup, then
   * flips to builder phase.
   */
  const handleSetupComplete = ({ outline, courseData, uploadedFiles }) => {
    setTransitioning(true);
    // Give the exit animation time to play (matches phaseExit duration)
    setTimeout(() => {
      setBuilderData({ outline, courseData, uploadedFiles });
      setPhase("builder");
      setTransitioning(false);
    }, 300);
  };

  return (
    <>
      <FontLoader />
      <GlobalStyles />

      {phase === "setup" && (
        <div className={`${transitioning ? "phase-exit" : "phase-enter"} phase-scroll`}>
          <SetupFlow onComplete={handleSetupComplete} />
        </div>
      )}

      {phase === "builder" && builderData && (
        <div className="phase-enter phase-fill">
          <CourseBuilderWorkspace
            outline={builderData.outline}
            courseData={builderData.courseData}
            uploadedFiles={builderData.uploadedFiles}
            courseId={courseId}
            unitMap={unitMap}
          />
        </div>
      )}
    </>
  );
}

/*
 * Named export alias for drop-in backward compatibility.
 * Existing import { TeacherOnboarding } or default import both work.
 */
export { TeacherOnboardingPage as TeacherOnboarding };