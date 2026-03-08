/**
 * TeacherOnboarding.jsx — Lesson-by-lesson AI generation + RAG integration
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
 * ── RAG integration (frontend-only; no backend changes) ──────────────────
 *   On mount CourseBuildScreen calls GET /ingest/lesson/{unitId}/status for
 *   every lesson that has a known backend unitId (via the `unitMap` prop).
 *   Results populate `lessonSources`.  When hasRAG===true the UI shows a
 *   "📚 Materials available" badge and the AI prompt explicitly names:
 *     1. Course outline
 *     2. Lesson metadata
 *     3. Teacher-uploaded unit materials (via RAG pipeline)
 *
 * ── Terminology ───────────────────────────────────────────────────────────
 *   "Tasks" (never "Exercises")   •   "Test" (never "Quiz"/"Quizzes")
 */

import { useState, useEffect, useCallback, useRef } from "react";
import SlideEditorPage from "./SlideEditorPage";

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

/* ─── LocalStorage helpers (partial-progress persistence) ───────────────── */
const draftKey = (key) => `ob_build_v1_${key}`;
const loadDraft = (key) => {
  try { return JSON.parse(localStorage.getItem(draftKey(key)) || "null"); } catch { return null; }
};
const saveDraft = (key, payload) => {
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

    /* Language cards */
    .lang-card { cursor:pointer;border-radius:22px;position:relative;overflow:hidden;transition:all .22s cubic-bezier(.22,.68,0,1.3);user-select:none;border:4px solid transparent }
    .lang-card:hover { transform:translateY(-6px) scale(1.03) }
    .lang-card.sel   { border-color:white;transform:translateY(-6px) scale(1.03) }

    /* Level chips */
    .lvl-chip { cursor:pointer;border-radius:14px;padding:13px 6px;text-align:center;transition:all .18s cubic-bezier(.22,.68,0,1.2);user-select:none;flex:1;min-width:0;border:3px solid transparent }
    .lvl-chip:hover { transform:translateY(-3px) scale(1.04) }
    .lvl-chip.sel   { transform:translateY(-3px) scale(1.06);border-color:white }

    /* Count buttons */
    .cnt-btn { cursor:pointer;border-radius:13px;padding:13px 8px;text-align:center;flex:1;font-family:${T.dFont};font-size:19px;font-weight:900;color:${T.sub};transition:all .18s cubic-bezier(.22,.68,0,1.2);background:white;border:3px solid ${T.border} }
    .cnt-btn:hover { border-color:${T.violet};color:${T.violet};transform:translateY(-2px) }
    .cnt-btn.sel   { background:linear-gradient(135deg,${T.violet},${T.pink});border-color:transparent;color:white;transform:translateY(-2px);box-shadow:0 8px 20px ${T.violet}44 }

    /* Upload zone */
    .upload-zone { border:3px dashed ${T.border};border-radius:18px;padding:26px;text-align:center;cursor:pointer;transition:all .2s;background:${T.bg} }
    .upload-zone:hover,.upload-zone.drag { border-color:${T.violet};background:${T.violetL};transform:scale(1.01) }

    /* Buttons */
    .btn         { border:none;border-radius:14px;padding:14px 28px;font-family:${T.dFont};font-size:15px;font-weight:800;cursor:pointer;display:inline-flex;align-items:center;gap:8px;transition:all .18s }
    .btn-sm      { padding:10px 18px;font-size:13px;border-radius:11px;font-weight:700 }
    .btn-xs      { padding:6px 13px;font-size:12px;border-radius:9px;font-weight:700 }
    .btn-p       { background:${T.violet};color:#fff;box-shadow:0 4px 16px ${T.violet}44 }
    .btn-p:hover { background:${T.violetD};transform:translateY(-2px);box-shadow:0 10px 28px ${T.violet}55 }
    .btn-p:active{ transform:translateY(0) }
    .btn-p:disabled { opacity:.4;cursor:not-allowed;transform:none;box-shadow:none }
    .btn-white   { background:rgba(255,255,255,.22);color:white;font-weight:700;border:2px solid rgba(255,255,255,.4);backdrop-filter:blur(4px) }
    .btn-white:hover { background:rgba(255,255,255,.35) }
    .btn-outline { background:white;border:3px solid ${T.border};color:${T.text};font-weight:700 }
    .btn-outline:hover { border-color:${T.violet};color:${T.violet};background:${T.violetL} }

    /* Build sidebar lesson row */
    .build-lesson-row { display:flex;align-items:center;gap:10px;padding:9px 14px;cursor:pointer;transition:all .15s;border-left:3px solid transparent }
    .build-lesson-row:hover  { background:${T.bg} }
    .build-lesson-row.active { background:${T.violetL};border-left-color:${T.violet} }

    /* RAG badge */
    .rag-badge       { display:inline-flex;align-items:center;gap:4px;padding:3px 9px;border-radius:999px;font-size:10px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;background:rgba(0,188,212,.1);color:#00838F;border:1.5px solid rgba(0,188,212,.3);white-space:nowrap;flex-shrink:0 }
    .rag-badge--live { animation:ragPulse 2.2s ease-in-out infinite }

    /* Save flash toast */
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
        <h2 style={{ fontFamily: T.dFont, fontSize: 26, fontWeight: 900, marginBottom: 6 }}>Course options ✨</h2>
        <p style={{ color: T.sub, marginBottom: 24, fontSize: 15 }}>Defaults work great — tweak as needed.</p>

        {/* Module count */}
        <div style={{ background: T.bg, border: `3px solid ${T.border}`, borderRadius: 20, padding: 18, marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div>
              <p style={{ fontFamily: T.dFont, fontSize: 15, fontWeight: 800, color: T.text }}>Modules per course</p>
              <p style={{ fontSize: 12, color: T.muted }}>Each module has 2–3 lessons</p>
            </div>
            <div style={{ width: 44, height: 44, borderRadius: 14, background: "linear-gradient(135deg,#F5A623,#F76D3C)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: T.dFont, fontSize: 22, fontWeight: 900, color: "#fff", boxShadow: "0 6px 16px rgba(245,166,35,.45)" }}>{data.unitCount}</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {[2,3,4,6,8].map(n => <button key={n} className={`cnt-btn ${data.unitCount===n?"sel":""}`} onClick={() => onChange({ unitCount: n })}>{n}</button>)}
          </div>
        </div>

        {/* Special focus */}
        <div style={{ background: T.bg, border: `3px solid ${T.border}`, borderRadius: 20, padding: 18, marginBottom: 14 }}>
          <p style={{ fontFamily: T.dFont, fontSize: 15, fontWeight: 800, color: T.text, marginBottom: 4 }}>Special focus <span style={{ fontSize: 13, fontWeight: 500, color: T.muted }}>(optional)</span></p>
          <p style={{ fontSize: 12, color: T.muted, marginBottom: 10 }}>E.g. "Business vocab" or "Travel phrases"</p>
          <textarea rows={2} placeholder="Type a theme or leave blank…" value={data.extraInstructions || ""} onChange={e => onChange({ extraInstructions: e.target.value })}
            style={{ width: "100%", background: "white", border: `2px solid ${T.border}`, borderRadius: 12, padding: "12px 14px", color: T.text, fontFamily: T.bFont, fontSize: 14, outline: "none", transition: "border-color .2s" }}
            onFocus={e => { e.target.style.borderColor = T.amber; e.target.style.boxShadow = `0 0 0 3px ${T.amber}22`; }}
            onBlur={e  => { e.target.style.borderColor = T.border; e.target.style.boxShadow = "none"; }} />
        </div>

        {/* File upload */}
        <div style={{ background: T.bg, border: `3px solid ${T.border}`, borderRadius: 20, padding: 18, marginBottom: 30 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: "linear-gradient(135deg,#0099E6,#6C35DE)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, boxShadow: "0 4px 12px rgba(0,153,230,.4)" }}>📎</div>
            <div>
              <p style={{ fontFamily: T.dFont, fontSize: 15, fontWeight: 800, color: T.text }}>Upload materials <span style={{ fontSize: 13, fontWeight: 500, color: T.muted }}>(optional)</span></p>
              <p style={{ fontSize: 12, color: T.muted }}>AI uses your files when generating each lesson via RAG</p>
            </div>
          </div>

          {files.length > 0 && (
            <div style={{ background: "rgba(0,188,212,.07)", border: "1.5px solid rgba(0,188,212,.25)", borderRadius: 12, padding: "10px 14px", marginBottom: 12, display: "flex", gap: 9, alignItems: "flex-start" }}>
              <span style={{ fontSize: 15, flexShrink: 0 }}>📚</span>
              <p style={{ fontSize: 12, color: "#006064", lineHeight: 1.55 }}>
                <strong>These files will be ingested into the RAG pipeline.</strong> When you generate each lesson, AI will search your materials for relevant content and use it to enrich slides, tasks, and test questions.
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
              <><p style={{ fontSize: 28, marginBottom: 6 }}>☁️</p><p style={{ fontSize: 14, color: T.sub, fontWeight: 600 }}>Drop PDF, DOCX, TXT here<br /><span style={{ color: T.violet, fontWeight: 700 }}>or click to browse</span></p></>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <p style={{ fontSize: 22 }}>✅</p>
                <p style={{ fontSize: 14, fontWeight: 700, color: T.green }}>{files.length} file{files.length > 1 ? "s" : ""} ready</p>
                {files.map((f, i) => <span key={i} style={{ fontSize: 12, color: T.muted }}>📄 {f.name}</span>)}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn btn-outline btn-sm" onClick={onBack}>← Back</button>
          <button className="btn btn-p" onClick={() => onNext(files)} style={{ flex: 1, justifyContent: "center", fontSize: 16, background: "linear-gradient(135deg,#F5A623,#F76D3C,#F0447C)", boxShadow: "0 10px 28px rgba(247,109,60,.45)", borderRadius: 16 }}>
            ✦ Build course outline
          </button>
        </div>
      </div>
    </Shell>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════
   STEP 1 of 2 — COURSE OUTLINE SCREEN
   generateCourseOutline(): returns title + description + modules + lesson
   stubs ONLY. No slides, no tasks, no test generated here.
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

  /* ── generateCourseOutline() ─────────────────────────────────────────── */
  const generateCourseOutline = useCallback(async () => {
    // Prevent duplicate requests (React Strict Mode in dev causes double mount)
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
      isRequestingRef.current = false; // Allow retry on error
      setErrMsg(e?.message || "Something went wrong generating the outline. Please try again.");
      setPhase("error");
    }
  }, [courseData]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { generateCourseOutline(); }, []);

  /* Loading */
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

  /* Error */
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

  /* Done */
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
              { n: courseData.unitCount, label: "Modules",      emoji: "🗂",  col: "rgba(255,255,255,.18)" },
              { n: totalLessons,         label: "Lessons",      emoji: "📖",  col: "rgba(255,255,255,.18)" },
              { n: "TBD",                label: "Slides/lesson", emoji: "🎞", col: "rgba(255,255,255,.12)" },
              { n: "TBD",                label: "Tasks/lesson",  emoji: "📋", col: "rgba(255,255,255,.12)" },
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
   STEP 2 of 2 — COURSE BUILD SCREEN
   Full state shape + generateLessonContent() + saveLessonEdits() + RAG
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── Status dot for sidebar ── */
const StatusDot = ({ status }) => {
  if (status === "done")       return <div style={{ width:22,height:22,borderRadius:"50%",background:"linear-gradient(135deg,#0DB85E,#00BCD4)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:"#fff",fontWeight:900,flexShrink:0 }}>✓</div>;
  if (status === "generating") return <div style={{ width:22,height:22,borderRadius:"50%",border:`3px solid ${T.violet}`,borderTopColor:"transparent",animation:"spin 1s linear infinite",flexShrink:0 }} />;
  if (status === "error")      return <div style={{ width:22,height:22,borderRadius:"50%",background:T.red,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,color:"#fff",fontWeight:900,flexShrink:0 }}>!</div>;
  return <div style={{ width:22,height:22,borderRadius:"50%",background:T.bg,border:`3px solid ${T.border}`,flexShrink:0 }} />;
};

/* ── Empty state (no lesson selected) ── */
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

/* ── Pending: lesson selected, not yet generated ── */
const LessonPending = ({ lesson, sourceInfo, onGenerate }) => {
  const hasRAG = sourceInfo?.hasRAG;
  return (
    <div style={{ maxWidth: 580, animation: "fadeIn .35s both" }}>
      {/* Breadcrumb */}
      <div style={{ fontSize: 12, color: T.muted, fontWeight: 600, marginBottom: 20, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span>{lesson.moduleTitle}</span>
        <span style={{ color: T.border }}>›</span>
        <span style={{ color: T.violet }}>{lesson.title}</span>
        {hasRAG && <RAGBadge chunkCount={sourceInfo.chunkCount} />}
      </div>

      <div style={{ background: "white", border: `3px solid ${T.border}`, borderRadius: 24, padding: 32, marginBottom: 16 }}>
        <h2 style={{ fontFamily: T.dFont, fontSize: 22, fontWeight: 900, color: T.text, marginBottom: 14 }}>{lesson.title}</h2>

        {/* Learning objective */}
        <div style={{ background: T.bg, borderRadius: 14, padding: "14px 18px", marginBottom: 20, display: "flex", alignItems: "flex-start", gap: 12 }}>
          <span style={{ fontSize: 20, flexShrink: 0 }}>🎯</span>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: T.muted, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 3 }}>Learning objective</div>
            <div style={{ fontSize: 14, color: T.sub, fontWeight: 500, lineHeight: 1.6 }}>{lesson.objective}</div>
          </div>
        </div>

        {/* RAG context notice */}
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

        {/* What gets generated */}
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

/* ── Generating: shimmer + live status ── */
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

/* ── Error state with retry ── */
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

/* ── Done: tabbed Slides / Tasks / Test view ── */
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

      {/* Header */}
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

      {/* Tab bar */}
      <div style={{ display: "inline-flex", gap: 6, marginBottom: 22, background: "white", padding: 5, borderRadius: 16, border: `2px solid ${T.border}` }}>
        {tabs.map(({ key, label, emoji, count, color }) => (
          <button key={key} onClick={() => onTabChange(key)} style={{ border: "none", borderRadius: 11, padding: "9px 16px", cursor: "pointer", fontFamily: T.dFont, fontSize: 14, fontWeight: 800, display: "flex", alignItems: "center", gap: 6, background: activeTab === key ? `linear-gradient(135deg,${color},${color}cc)` : "transparent", color: activeTab === key ? "#fff" : T.sub, transition: "all .2s", boxShadow: activeTab === key ? `0 4px 14px ${color}44` : "none" }}>
            <span>{emoji}</span>{label}
            <span style={{ background: activeTab === key ? "rgba(255,255,255,.25)" : T.bg, borderRadius: 999, padding: "1px 7px", fontSize: 11, color: activeTab === key ? "#fff" : T.muted }}>{count}</span>
          </button>
        ))}
      </div>

      {/* ── SLIDES ── */}
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

      {/* ── TASKS ── */}
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

      {/* ── TEST ── */}
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

/* ═══════════════════════════════════════════════════════════════════════════
   CourseBuildScreen
   State: outline · currentLessonId · generatedLessons ·
          lessonGenerationStatus · lessonSources
   ═══════════════════════════════════════════════════════════════════════════ */
const CourseBuildScreen = ({ outline, courseData, uploadedFiles, courseId, unitMap, onFinish }) => {

  /* Flatten lessons with module context */
  const allLessons = outline.modules.flatMap(m =>
    m.lessons.map(l => ({ ...l, moduleTitle: m.title, moduleId: m.id }))
  );

  /* Stable draft identifier */
  const storageDraftKey = courseId
    ? String(courseId)
    : `${courseData.subject}_${outline.title}`.replace(/\W/g, "_").slice(0, 60);

  /* ── Full state shape (per spec) ─────────────────────────────────────── */
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

  /* UI state */
  const [selectedId,      setSelectedId]      = useState(null);
  const [activeTab,       setActiveTab]       = useState("slides");
  const [genAll,          setGenAll]          = useState(false);
  const [editingLessonId, setEditingLessonId] = useState(null);
  const [publishing,     setPublishing]      = useState(false);

  /* ── Restore saved draft ─────────────────────────────────────────────── */
  useEffect(() => {
    const draft = loadDraft(storageDraftKey);
    if (!draft) return;
    if (draft.generatedLessons) setGeneratedLessons(draft.generatedLessons);
    if (draft.lessonGenerationStatus) {
      // Only restore "done" — anything mid-generation resets to "pending"
      const restored = {};
      allLessons.forEach(l => {
        restored[l.id] = draft.lessonGenerationStatus[l.id] === "done" ? "done" : "pending";
      });
      setLessonGenerationStatus(restored);
    }
  }, []);

  /* ── RAG status check: GET /ingest/lesson/{unitId}/status ────────────── */
  useEffect(() => {
    if (!unitMap) {
      // No unitMap provided, but if files were uploaded mark all as RAG-available
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
      } catch { /* endpoint unavailable — silently skip */ }
    });
  }, []);

  /* ── saveLessonEdits(lessonId) ───────────────────────────────────────── */
  const saveLessonEdits = useCallback((lessonId) => {
    setGeneratedLessons(prev => {
      const updated = { ...prev, [lessonId]: { ...prev[lessonId], savedAt: Date.now() } };
      saveDraft(storageDraftKey, { generatedLessons: updated, lessonGenerationStatus });
      return updated;
    });
  }, [lessonGenerationStatus, storageDraftKey]);

  /* ── generateLessonContent(lessonId) ────────────────────────────────── */
  const generateLessonContent = useCallback(async (lessonId) => {
    const lesson = allLessons.find(l => l.id === lessonId);
    if (!lesson) return;
    if (lessonGenerationStatus[lessonId] === "generating") return;

    const srcInfo = lessonSources[lessonId];
    const hasRAG  = srcInfo?.hasRAG;

    /* Build the RAG context block only when materials exist */
    const ragSection = hasRAG
      ? `
TEACHER-UPLOADED UNIT MATERIALS (available via existing RAG pipeline):
  • ${srcInfo.chunkCount != null ? srcInfo.chunkCount + " content chunks" : "Content"} stored for this unit in the vector DB.
  ${(srcInfo.sources || []).map(s => `• ${s.filename} (${s.source_type}, ${s.chunks} chunks)`).join("\n  ")}
  ➤ Ground slides, tasks, and test questions in this material where possible.
  ➤ Reference real examples or terminology from the uploaded files.`
      : "\nNo teacher materials uploaded for this unit (proceed without RAG context).";

    /* Mark only THIS lesson as generating; all others stay unchanged */
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

      /* Update both generated map and status atomically-ish */
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

  /* ── generateAll: sequential, lesson by lesson, never blocking others ── */
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

  /* ── Derived ─────────────────────────────────────────────────────────── */
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

  // ── Slide editor: full-screen overlay for a specific lesson's slides ──
  if (editingLessonId) {
    const selectedLesson = allLessons.find(l => l.id === editingLessonId);
    const editContent = generatedLessons[editingLessonId];
    const slides = editContent?.slides || [];
    
    return (
      <SlideEditorPage
        slides={slides}
        title={selectedLesson.title}
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
          setEditingLessonId(null); // return to build screen after save
        }}
        lessonCtx={{
          title: selectedLesson.title,
          objective: selectedLesson.objective,
          moduleTitle: selectedLesson.moduleTitle,
          lessonIndex: allLessons.findIndex(l => l.id === editingLessonId),
          totalLessons: allLessons.length,
        }}
      />
    );
  }

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: T.bg, overflow: "hidden" }}>

      {/* ── Top header ───────────────────────────────────────────────────── */}
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

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* Left sidebar — module/lesson tree */}
        <div style={{ width: 280, background: "white", borderRight: `2px solid ${T.border}`, overflowY: "auto", flexShrink: 0, paddingBottom: 24 }}>
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
                    {/* Inline Generate button when pending */}
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

          {/* Progress summary */}
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
   ROOT ORCHESTRATOR
   Props:
     courseId  — optional backend ID used as localStorage draft key
     unitMap   — optional { [lessonId]: backendUnitId } for RAG status checks
   ═══════════════════════════════════════════════════════════════════════════ */
const WIZARD_STEPS = ["welcome","language","level","options","outline","build"];

export default function TeacherOnboarding({ courseId, unitMap }) {
  const [step,          setStep]          = useState("welcome");
  const [dir,           setDir]           = useState("forward");
  const [outline,       setOutline]       = useState(null);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [publishing,    setPublishing]    = useState(false);

  const [courseData, setCourseData] = useState({
    subject: "", level: "", nativeLanguage: "English", unitCount: 4, extraInstructions: "",
  });

  const teacherName = "Sarah"; // replace with auth context
  const upd  = p => setCourseData(d => ({ ...d, ...p }));
  const next = f => { setDir("forward"); setStep(WIZARD_STEPS[WIZARD_STEPS.indexOf(f)+1]); };
  const back = f => { setDir("back");    setStep(WIZARD_STEPS[WIZARD_STEPS.indexOf(f)-1]); };

  return (
    <>
      <FontLoader />
      <GlobalStyles />
      {step === "welcome"  && <WelcomeScreen name={teacherName} onContinue={() => next("welcome")} />}
      {step === "language" && <StepLanguage  data={courseData} onChange={upd} dir={dir} onNext={() => next("language")} onBack={() => back("language")} />}
      {step === "level"    && <StepLevel     data={courseData} onChange={upd} dir={dir} onNext={() => next("level")}    onBack={() => back("level")} />}
      {step === "options"  && <StepOptions   data={courseData} onChange={upd} dir={dir}
                                onNext={files => { setUploadedFiles(files); next("options"); }}
                                onBack={() => back("options")} />}
      {step === "outline"  && <CourseOutlineScreen courseData={courseData}
                                onDone={o => { setOutline(o); next("outline"); }}
                                onBack={() => back("outline")} />}
      {step === "build"    && (
        <CourseBuildScreen
          outline={outline}
          courseData={courseData}
          uploadedFiles={uploadedFiles}
          courseId={courseId}
          unitMap={unitMap}
          onFinish={async ({ outline: o, generatedLessons }) => {
            setPublishing(true);
            try {
              // Get authentication token
              const token = window.__authToken || localStorage.getItem('token') || localStorage.getItem('authToken') || '';
              
              if (!token) {
                throw new Error("You must be logged in to publish a course. Please refresh the page and log in again.");
              }
              
              const response = await fetch("/api/v1/course-builder/publish", {
                method: "POST",
                headers: { 
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`
                },
                credentials: "include",
                body: JSON.stringify({
                  outline: o,
                  generated_lessons: generatedLessons,
                  course_data: courseData,
                }),
              });
              
              if (!response.ok) {
                const error = await response.json().catch(() => ({ detail: "Failed to publish course" }));
                if (response.status === 401 || response.status === 403) {
                  throw new Error("Authentication failed. Please refresh the page and log in again.");
                }
                throw new Error(error.detail || "Failed to publish course");
              }
              
              const result = await response.json();
              console.info("[TeacherOnboarding] Course published:", result);
              
              // Navigate to courses page
              window.location.href = "/admin/courses";
            } catch (error) {
              console.error("[TeacherOnboarding] Publish error:", error);
              alert(`Failed to publish course: ${error.message}`);
            } finally {
              setPublishing(false);
            }
          }}
        />
      )}
    </>
  );
}