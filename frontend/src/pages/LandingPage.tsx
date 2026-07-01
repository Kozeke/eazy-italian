/**
 * LandingPage.tsx
 * Rebuilt from landing__2_.html — design system: #6C6FEF primary, Sora + Inter fonts.
 * Fully internationalised — EN / RU / IT via i18next.
 */
import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";

/* ─── CSS (verbatim from landing__2_.html, adapted for JSX injection) ─── */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=Inter:wght@400;500;600&display=swap');

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --primary:    #6C6FEF;
  --primary-dk: #4F52C2;
  --tint:       #EEF0FE;
  --tint-mid:   #C7CAFF;
  --bg:         #F7F7FA;
  --white:      #FFFFFF;
  --text-main:  #18181B;
  --text-sub:   #52525B;
  --text-muted: #A1A1AA;
  --border:     #E8E8F0;
  --shadow-sm:  0 1px 4px rgba(108,111,239,0.06), 0 4px 16px rgba(108,111,239,0.06);
  --shadow-md:  0 2px 8px rgba(108,111,239,0.08), 0 8px 32px rgba(108,111,239,0.10);
  --r:          14px;
  --r-lg:       20px;
}

@keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
@keyframes spin   { to { transform: rotate(360deg); } }
@keyframes langDropIn { from { opacity:0; transform:translateY(-6px) scale(.97); } to { opacity:1; transform:none; } }

html { scroll-behavior: smooth; }
body { font-family: 'Inter', system-ui, sans-serif; background: var(--bg); color: var(--text-main); line-height: 1.6; -webkit-font-smoothing: antialiased; }

/* ── NAV ── */
nav {
  position: sticky; top: 0; z-index: 100;
  background: rgba(247,247,250,0.82);
  backdrop-filter: blur(16px);
  border-bottom: 1px solid var(--border);
  padding: 0 max(24px, calc((100vw - 1100px)/2));
  height: 64px;
  display: flex; align-items: center; justify-content: space-between;
}
.nav-logo { display: flex; align-items: center; gap: 10px; text-decoration: none; }
.nav-links { display: flex; align-items: center; gap: 8px; }
.nav-links a {
  font-size: 14px; font-weight: 500; color: var(--text-sub);
  text-decoration: none; padding: 6px 14px; border-radius: 8px;
  transition: color .18s, background .18s;
}
.nav-links a:hover { color: var(--primary); background: var(--tint); }
.btn-nav {
  background: var(--primary) !important; color: #fff !important;
  border-radius: 10px !important; padding: 8px 20px !important;
  font-weight: 600 !important; font-size: 14px !important;
  transition: background .18s, transform .12s !important;
}
.btn-nav:hover { background: var(--primary-dk) !important; transform: translateY(-1px); }

/* ── LANG SWITCHER ── */
.lang-switcher { position: relative; }
.lang-btn {
  display: flex; align-items: center; gap: 6px;
  background: var(--white); border: 1.5px solid var(--border);
  border-radius: 8px; padding: 5px 11px;
  font-size: 13px; font-weight: 600; color: var(--text-sub);
  cursor: pointer; transition: border-color .15s, color .15s, background .15s;
  white-space: nowrap;
}
.lang-btn:hover { border-color: var(--primary); color: var(--primary); background: var(--tint); }
.lang-btn.open { border-color: var(--primary); color: var(--primary); background: var(--tint); }
.lang-dropdown {
  position: absolute; top: calc(100% + 6px); right: 0;
  background: var(--white); border: 1.5px solid var(--border);
  border-radius: 10px; padding: 4px;
  box-shadow: var(--shadow-md); min-width: 130px;
  animation: langDropIn .15s ease-out both;
  z-index: 200;
}
.lang-opt {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 10px; border-radius: 7px;
  font-size: 13px; font-weight: 500; color: var(--text-sub);
  cursor: pointer; transition: background .12s, color .12s;
}
.lang-opt:hover { background: var(--tint); color: var(--primary); }
.lang-opt.active { background: var(--tint); color: var(--primary-dk); font-weight: 700; }
.lang-flag { font-size: 16px; line-height: 1; }

/* ── HERO ── */
.hero {
  max-width: 1100px; margin: 0 auto;
  padding: 100px 24px 80px;
  display: flex; flex-direction: column; align-items: center; text-align: center;
}
.hero-badge {
  display: inline-flex; align-items: center; gap: 6px;
  background: var(--tint); color: var(--primary-dk);
  border: 1px solid var(--tint-mid);
  border-radius: 999px; padding: 5px 16px;
  font-size: 13px; font-weight: 600;
  margin-bottom: 28px;
  animation: fadeUp .6s ease both;
}
.hero-badge span { width: 6px; height: 6px; border-radius: 50%; background: var(--primary); display: inline-block; }
h1 {
  font-family: 'Sora', system-ui, sans-serif;
  font-size: clamp(36px, 6vw, 64px);
  font-weight: 800; line-height: 1.1; letter-spacing: -1.5px;
  color: var(--text-main);
  max-width: 760px;
  animation: fadeUp .7s .1s ease both;
}
h1 em { font-style: normal; color: var(--primary); }
.hero-sub {
  margin-top: 20px; font-size: 18px; color: var(--text-sub);
  max-width: 520px; line-height: 1.7;
  animation: fadeUp .7s .2s ease both;
}
.hero-cta {
  margin-top: 36px; display: flex; gap: 12px; flex-wrap: wrap; justify-content: center;
  animation: fadeUp .7s .3s ease both;
}
.btn-primary {
  background: var(--primary); color: #fff;
  border: none; border-radius: var(--r); padding: 14px 32px;
  font-size: 16px; font-weight: 600; cursor: pointer;
  box-shadow: 0 4px 18px rgba(108,111,239,0.30);
  transition: background .18s, transform .12s, box-shadow .18s;
  text-decoration: none; display: inline-block;
}
.btn-primary:hover { background: var(--primary-dk); transform: translateY(-2px); box-shadow: 0 8px 28px rgba(108,111,239,0.36); }
.btn-ghost {
  background: var(--white); color: var(--text-sub);
  border: 1px solid var(--border); border-radius: var(--r); padding: 14px 28px;
  font-size: 15px; font-weight: 500; cursor: pointer;
  transition: border-color .18s, color .18s, transform .12s;
  text-decoration: none; display: inline-block;
}
.btn-ghost:hover { border-color: var(--primary); color: var(--primary); transform: translateY(-1px); }

/* ── HERO VISUAL ── */
.hero-visual {
  margin-top: 64px; width: 100%; max-width: 900px;
  background: var(--white); border-radius: var(--r-lg);
  border: 1px solid var(--border);
  box-shadow: 0 4px 40px rgba(108,111,239,0.13), 0 1px 4px rgba(108,111,239,0.06);
  overflow: hidden;
  animation: fadeUp .8s .4s ease both;
}
.hero-visual-bar {
  background: var(--bg); border-bottom: 1px solid var(--border);
  padding: 12px 18px; display: flex; align-items: center; gap: 7px;
}
.dot { width: 10px; height: 10px; border-radius: 50%; }
.dot-r { background: #FF5F57; }
.dot-y { background: #FEBC2E; }
.dot-g { background: #28C840; }

.hero-langs {
  margin-top: 32px; display: flex; flex-direction: column;
  align-items: center; gap: 12px;
  animation: fadeUp .7s .4s ease both;
}
.hero-langs-label {
  font-size: 13px; font-weight: 600; color: var(--text-muted);
  text-transform: uppercase; letter-spacing: .5px;
}
.hero-langs-list {
  display: flex; flex-wrap: wrap; justify-content: center; gap: 8px;
}
.hero-lang-pill {
  background: var(--tint); color: var(--primary-dk);
  border: 1px solid var(--tint-mid);
  border-radius: 999px; padding: 6px 16px;
  font-size: 14px; font-weight: 600;
}

/* ── HERO DEMO VIDEO ── */
.hero-video-wrap {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  background: #0f0f12;
}
.hero-video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
  border: none;
}

/* ── DASHBOARD MOCK ── */
.db-wrap { display: flex; height: 520px; overflow: hidden; }
.db-topbar {
  position: absolute; top: 0; left: 0; right: 0; height: 52px;
  background: var(--white); border-bottom: 1px solid var(--border);
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 18px 0 14px; z-index: 10;
}
.db-topbar-logo { display: flex; align-items: center; gap: 7px; font-family: 'Sora', sans-serif; font-size: 15px; font-weight: 700; color: var(--text-main); }
.db-topbar-logo em { color: var(--primary); font-style: normal; }
.db-topbar-right { display: flex; align-items: center; gap: 14px; }
.db-icon-btn { width: 28px; height: 28px; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: var(--text-muted); font-size: 13px; cursor: pointer; transition: background .15s; }
.db-icon-btn:hover { background: var(--tint); color: var(--primary); }
.db-avatar { width: 28px; height: 28px; border-radius: 50%; background: var(--primary); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; }
.db-sidebar { width: 52px; flex-shrink: 0; background: var(--white); border-right: 1px solid var(--border); display: flex; flex-direction: column; align-items: center; padding-top: 64px; gap: 6px; }
.db-sidebar-icon { width: 36px; height: 36px; border-radius: 10px; display: flex; align-items: center; justify-content: center; color: var(--text-muted); font-size: 16px; cursor: pointer; transition: background .15s, color .15s; position: relative; }
.db-sidebar-icon.active { background: var(--tint); color: var(--primary); }
.db-sidebar-icon.active::before { content: ''; position: absolute; left: -2px; top: 50%; transform: translateY(-50%); width: 3px; height: 20px; background: var(--primary); border-radius: 0 3px 3px 0; }
.db-sidebar-icon:hover { background: var(--bg); color: var(--primary); }
.db-sidebar-divider { width: 24px; height: 1px; background: var(--border); margin: 4px 0; }
.db-sidebar-add { width: 30px; height: 30px; border-radius: 8px; border: 1.5px dashed var(--tint-mid); display: flex; align-items: center; justify-content: center; color: var(--primary); font-size: 16px; cursor: pointer; transition: background .15s, border-color .15s; }
.db-sidebar-add:hover { background: var(--tint); border-color: var(--primary); }
.db-main { flex: 1; overflow-y: auto; padding: 64px 0 0; background: var(--white); display: flex; flex-direction: column; position: relative; }
.db-content { padding: 28px 28px 20px; flex: 1; }
.db-content-inner { background: var(--white); border-radius: 16px; border: 1px solid var(--border); padding: 24px; box-shadow: var(--shadow-sm); height: 100%; }
.db-page-title { font-family: 'Sora', sans-serif; font-size: 20px; font-weight: 800; color: var(--text-main); margin-bottom: 18px; }
.db-search { width: 100%; height: 38px; border-radius: 10px; border: 1px solid var(--border); background: var(--bg); display: flex; align-items: center; gap: 8px; padding: 0 12px; margin-bottom: 16px; }
.db-search-icon { color: var(--text-muted); font-size: 13px; }
.db-search-placeholder { font-size: 13px; color: var(--text-muted); }
.db-toolbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
.db-count { font-size: 12px; color: var(--text-muted); font-weight: 500; }
.db-view-btns { display: flex; gap: 4px; }
.db-view-btn { width: 28px; height: 28px; border-radius: 7px; display: flex; align-items: center; justify-content: center; font-size: 13px; cursor: pointer; color: var(--text-muted); transition: background .15s, color .15s; }
.db-view-btn.active { background: var(--tint); color: var(--primary); }
.db-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
.db-course-card { border-radius: 12px; border: 1px solid var(--border); overflow: hidden; background: var(--white); cursor: pointer; transition: transform .18s, box-shadow .18s; }
.db-course-card:hover { transform: translateY(-2px); box-shadow: var(--shadow-sm); }
.db-course-thumb { height: 100px; display: flex; align-items: center; justify-content: center; font-family: 'Sora', sans-serif; font-size: 38px; font-weight: 800; letter-spacing: -1px; }
.db-course-info { padding: 10px 11px 11px; }
.db-course-name { font-size: 12px; font-weight: 600; color: var(--text-main); margin-bottom: 4px; line-height: 1.3; }
.db-course-meta { font-size: 11px; color: var(--text-muted); display: flex; align-items: center; gap: 4px; }
.db-create-card { border-radius: 12px; border: 1.5px dashed var(--border); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; cursor: pointer; min-height: 140px; transition: border-color .18s, background .18s; }
.db-create-card:hover { border-color: var(--primary); background: var(--tint); }
.db-create-icon { width: 36px; height: 36px; border-radius: 10px; background: var(--primary); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 18px; }
.db-create-label { font-size: 12px; font-weight: 600; color: var(--primary); }
.progress-row { display: flex; align-items: center; gap: 8px; }
.progress-bar-wrap { flex: 1; background: var(--border); border-radius: 99px; height: 5px; overflow: hidden; }
.progress-bar { height: 5px; border-radius: 99px; background: var(--primary); }
.progress-pct { font-size: 11px; font-weight: 600; color: var(--primary); min-width: 28px; text-align: right; }
.lesson-list { display: flex; flex-direction: column; gap: 7px; }
.lesson-item { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text-sub); }
.lesson-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.ai-chip { display: inline-flex; align-items: center; gap: 5px; background: var(--tint); color: var(--primary-dk); border-radius: 8px; padding: 4px 10px; font-size: 11px; font-weight: 600; }

/* ── SECTIONS ── */
section { max-width: 1100px; margin: 0 auto; padding: 88px 24px; }
.section-label { font-size: 13px; font-weight: 600; color: var(--primary); letter-spacing: .5px; text-transform: uppercase; margin-bottom: 12px; }
h2 { font-family: 'Sora', sans-serif; font-size: clamp(28px, 4vw, 44px); font-weight: 800; letter-spacing: -.8px; line-height: 1.15; color: var(--text-main); margin-bottom: 16px; }
h2 em { font-style: normal; color: var(--primary); }
.section-sub { font-size: 17px; color: var(--text-sub); max-width: 500px; line-height: 1.7; }

/* ── FEATURES ── */
/* Three columns so six cards lay out 3×2 on desktop (auto-fit would fit four narrow columns first). */
.features-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 52px; }
.feat-card { background: var(--white); border-radius: var(--r-lg); border: 1px solid var(--border); padding: 28px; display: flex; flex-direction: column; gap: 14px; box-shadow: var(--shadow-sm); transition: transform .22s, box-shadow .22s; }
.feat-card:hover { transform: translateY(-4px); box-shadow: var(--shadow-md); }
.feat-icon { width: 48px; height: 48px; border-radius: 14px; display: flex; align-items: center; justify-content: center; font-size: 22px; }
.feat-title { font-family: 'Sora', sans-serif; font-size: 17px; font-weight: 700; color: var(--text-main); }
.feat-body { font-size: 14px; color: var(--text-sub); line-height: 1.65; }

/* ── HOW IT WORKS ── */
.how-wrap { display: grid; grid-template-columns: 1fr 1fr; gap: 60px; align-items: center; }
.steps { display: flex; flex-direction: column; gap: 0; }
.step { display: flex; gap: 20px; padding: 24px 0; border-bottom: 1px solid var(--border); cursor: pointer; transition: opacity .2s; }
.step:last-child { border-bottom: none; }
.step-num { width: 36px; height: 36px; border-radius: 10px; flex-shrink: 0; background: var(--tint); color: var(--primary-dk); display: flex; align-items: center; justify-content: center; font-family: 'Sora', sans-serif; font-weight: 800; font-size: 15px; transition: background .2s, color .2s; }
.step.active .step-num { background: var(--primary); color: #fff; }
.step-title { font-family: 'Sora', sans-serif; font-weight: 700; font-size: 15px; margin-bottom: 6px; color: var(--text-main); }
.step-body { font-size: 13px; color: var(--text-sub); line-height: 1.6; max-width: 340px; }
.step-screen { background: var(--white); border-radius: var(--r-lg); border: 1px solid var(--border); box-shadow: var(--shadow-md); overflow: hidden; }
.step-screen-bar { background: var(--bg); border-bottom: 1px solid var(--border); padding: 10px 14px; display: flex; align-items: center; gap: 6px; }
.step-screen-body { padding: 20px; }
.course-row { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--border); }
.course-row:last-of-type { border-bottom: none; }
.course-thumb { width: 36px; height: 36px; border-radius: 9px; display: flex; align-items: center; justify-content: center; font-size: 18px; flex-shrink: 0; }
.course-name { font-size: 13px; font-weight: 600; color: var(--text-main); }
.course-meta { font-size: 11px; color: var(--text-muted); }
.unit-badge { margin-left: auto; background: var(--tint); color: var(--primary-dk); font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 99px; white-space: nowrap; }
.avatar { border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; color: #fff; flex-shrink: 0; }
.student-row { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--border); }
.student-row:last-child { border-bottom: none; }
.student-name { font-size: 12px; font-weight: 600; color: var(--text-main); }
.student-prog { font-size: 11px; color: var(--text-muted); }
.score-badge { margin-left: auto; font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 6px; white-space: nowrap; }
.ai-prompt-box { background: var(--bg); border: 1px solid var(--border); border-radius: 10px; padding: 12px 14px; font-size: 12px; color: var(--text-sub); font-style: italic; margin-bottom: 14px; line-height: 1.6; }
.ai-gen-item { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--border); font-size: 12px; color: var(--text-sub); }
.ai-gen-item:last-child { border-bottom: none; }
.ai-gen-icon { width: 28px; height: 28px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 14px; flex-shrink: 0; }

/* ── EXERCISE PILLS ── */
.ex-pill { display: inline-flex; align-items: center; gap: 6px; color: #fff; border-radius: 99px; padding: 8px 18px; font-size: 13px; font-weight: 700; white-space: nowrap; box-shadow: 0 2px 12px rgba(0,0,0,0.12); }
.word-chip { background: var(--tint); color: var(--primary-dk); border-radius: 7px; padding: 5px 10px; font-size: 13px; font-weight: 600; cursor: grab; border: 1px solid var(--tint-mid); }
.gap-slot { display: inline-block; border: 1.5px solid var(--border); border-radius: 6px; padding: 2px 10px; margin: 0 3px; min-width: 60px; text-align: center; font-size: 13px; font-weight: 600; }
.match-item { border: 1.5px solid var(--border); border-radius: 8px; padding: 8px 10px; font-size: 12px; font-weight: 600; color: var(--text-sub); text-align: center; cursor: pointer; }
.sort-chip { border: 1px solid var(--border); border-radius: 7px; padding: 6px 10px; font-size: 12px; font-weight: 600; margin-bottom: 6px; }

/* ── AI GENERATION ── */
.ai-section-wrap { padding: 88px 24px; }
.ai-tab { background: none; border: 1.5px solid var(--border); border-radius: 10px; padding: 9px 18px; font-size: 13px; font-weight: 600; color: var(--text-sub); cursor: pointer; transition: all .18s; font-family: 'Inter', sans-serif; }
.ai-tab:hover { border-color: var(--primary); color: var(--primary); background: var(--tint); }
.ai-tab.active { background: var(--primary); color: #fff; border-color: var(--primary); }
.ai-point { display: flex; gap: 14px; }
.ai-point-icon { width: 36px; height: 36px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 16px; flex-shrink: 0; }
.ai-point-title { font-family: 'Sora', sans-serif; font-weight: 700; font-size: 14px; margin-bottom: 4px; }
.ai-point-body { font-size: 13px; color: var(--text-sub); line-height: 1.6; }
/* Prevent grid children from overflowing on narrow screens */
.features-grid > *, .testi-grid > *, .pricing-grid > * { min-width: 0; }
.course-gen-row { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--border); }
.course-gen-row:last-of-type { border-bottom: none; }
.cg-num { width: 22px; height: 22px; border-radius: 6px; background: var(--tint); color: var(--primary-dk); font-size: 11px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.cg-title { font-size: 12px; font-weight: 600; color: var(--text-main); }
.cg-sub   { font-size: 11px; color: var(--text-muted); }
.cg-check { margin-left: auto; width: 20px; height: 20px; border-radius: 50%; background: #dcfce7; color: #166534; font-size: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.cg-spinner { margin-left: auto; width: 16px; height: 16px; border-radius: 50%; border: 2px solid var(--tint-mid); border-top-color: var(--primary); animation: spin .7s linear infinite; flex-shrink: 0; }

/* ── STATS BAND ── */
.stats-band { background: var(--primary); padding: 52px 24px; }
.stats-band-inner { max-width: 1100px; margin: 0 auto; display: flex; align-items: center; justify-content: space-around; flex-wrap: wrap; gap: 32px; }
.stat-num { font-family: 'Sora', sans-serif; font-size: 40px; font-weight: 800; color: #fff; line-height: 1; }
.stat-label { font-size: 14px; color: rgba(255,255,255,0.7); margin-top: 4px; }

/* ── TESTIMONIALS ── */
.testi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; margin-top: 48px; }
.testi-card { background: var(--white); border-radius: var(--r-lg); border: 1px solid var(--border); padding: 28px; box-shadow: var(--shadow-sm); }
.testi-stars { font-size: 16px; color: #F5A623; margin-bottom: 14px; letter-spacing: 2px; }
.testi-text { font-size: 14px; color: var(--text-sub); line-height: 1.7; margin-bottom: 20px; font-style: italic; }
.testi-author { display: flex; align-items: center; gap: 10px; }
.testi-name { font-size: 13px; font-weight: 700; color: var(--text-main); }
.testi-role { font-size: 12px; color: var(--text-muted); }

/* ── FOUNDER NOTE ── */
.founder-card {
  margin-top: 40px; max-width: 720px;
  background: var(--white); border-radius: var(--r-lg);
  border: 1px solid var(--border); box-shadow: var(--shadow-md);
  padding: 40px 44px;
  position: relative; overflow: hidden;
}
.founder-card::before {
  content: ""; position: absolute; top: 0; left: 0;
  width: 4px; height: 100%; background: var(--primary);
}
.founder-body p {
  font-size: 16px; color: var(--text-sub); line-height: 1.75;
  margin-bottom: 18px;
}
.founder-body p:last-child { margin-bottom: 0; }
.founder-sign {
  display: flex; align-items: center; gap: 16px;
  margin-top: 28px; padding-top: 24px;
  border-top: 1px solid var(--border);
}
.founder-name { font-family: 'Sora', sans-serif; font-size: 15px; font-weight: 700; color: var(--text-main); }
.founder-role { font-size: 13px; color: var(--text-muted); }
.founder-photo-wrap {
  width: 104px; height: 104px; border-radius: 50%;
  overflow: hidden; flex-shrink: 0;
  border: 2px solid var(--tint);
  background: var(--bg);
  box-shadow: var(--shadow-sm);
}
.founder-photo {
  width: 100%; height: 100%; display: block;
  object-fit: cover; object-position: center center;
}

/* ── DEMO VIDEO ── */
.demo-section-wrap {
  background: var(--white);
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  padding: 88px 24px;
}
.demo-video-frame {
  max-width: 340px; margin: 44px auto 0;
  border-radius: 28px; overflow: hidden;
  border: 8px solid #18181B;
  box-shadow: var(--shadow-md);
  background: #000;
  aspect-ratio: 9 / 16;
}
.demo-video { width: 100%; height: 100%; display: block; object-fit: cover; }
.demo-cta { margin-top: 36px; }
@media (max-width: 640px) {
  .founder-card { padding: 28px 24px; }
  .founder-body p { font-size: 15px; }
  .demo-section-wrap { padding: 64px 20px; }
  .demo-video-frame { max-width: 280px; }
}

/* ── PRICING ── */
/* Billing toggle */
.billing-toggle { display: flex; align-items: center; gap: 6px; background: var(--white); border: 1px solid var(--border); border-radius: 12px; padding: 4px; flex-wrap: wrap; width: fit-content; margin-top: 36px; box-shadow: var(--shadow-sm); }
.billing-btn { display: flex; align-items: center; gap: 5px; padding: 7px 14px; border-radius: 9px; border: none; background: transparent; font-family: 'Inter', sans-serif; font-size: 13px; font-weight: 600; color: var(--text-muted); cursor: pointer; transition: background .15s, color .15s; white-space: nowrap; }
.billing-btn:hover { color: var(--primary); background: var(--tint); }
.billing-btn.active { background: var(--primary); color: #fff; }
.billing-discount { font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 99px; }
.billing-btn.active .billing-discount { background: rgba(255,255,255,0.22); color: #fff; }
.billing-btn:not(.active) .billing-discount { background: #EAF3DE; color: #3B6D11; }

/* Cards grid — 3 fixed cols on desktop */
.pricing-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-top: 28px; }
.price-card { background: var(--white); border-radius: var(--r-lg); border: 1px solid var(--border); padding: 28px; box-shadow: var(--shadow-sm); display: flex; flex-direction: column; transition: transform .2s, box-shadow .2s; }
.price-card:hover { transform: translateY(-3px); box-shadow: var(--shadow-md); }
.price-card.featured { background: var(--primary); border-color: var(--primary); }
.price-card.featured .price-name,
.price-card.featured .price-subtitle,
.price-card.featured .price-val,
.price-card.featured .price-currency { color: #fff; }
.price-card.featured .price-per { color: rgba(255,255,255,0.65); }
.price-card.featured .price-divider { border-color: rgba(255,255,255,0.18); }
.price-card.featured .feat-row-label { color: rgba(255,255,255,0.75); }
.price-card.featured .feat-row-val { color: #fff; }
.price-card.featured .feat-row-val.unlimited { color: #a5f3fc; }
.price-card.featured .feat-row-val.check { color: #86efac; }
.price-card.featured .feat-row-val.dash { color: rgba(255,255,255,0.4); }

/* Header */
.price-name { font-family: 'Sora', sans-serif; font-size: 18px; font-weight: 700; color: var(--text-main); }
.price-subtitle { font-size: 12px; color: var(--text-muted); margin-top: 3px; }

/* Price display */
.price-amount-row { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; margin-top: 20px; }
.price-val { font-family: 'Sora', sans-serif; font-size: 44px; font-weight: 800; color: var(--text-main); line-height: 1; }
.price-currency { font-family: 'Sora', sans-serif; font-size: 20px; font-weight: 700; color: var(--text-muted); align-self: flex-start; margin-top: 6px; }
.price-savings { font-size: 11px; font-weight: 700; padding: 3px 9px; border-radius: 99px; background: #EAF3DE; color: #3B6D11; white-space: nowrap; align-self: center; }
.price-card.featured .price-savings { background: rgba(255,255,255,0.22); color: #fff; }
.price-per { font-size: 12px; color: var(--text-muted); margin-top: 5px; }

/* Feature table */
.price-divider { border: none; border-top: 1px solid var(--border); margin: 20px 0; flex-shrink: 0; }
.feat-rows { flex: 1; display: flex; flex-direction: column; gap: 11px; }
.feat-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.feat-row-label { font-size: 13px; color: var(--text-sub); flex: 1; }
.feat-row-val { font-size: 13px; font-weight: 700; color: var(--text-main); white-space: nowrap; }
.feat-row-val.check { color: #22c55e; }
.feat-row-val.dash { color: var(--text-muted); font-weight: 400; }
.feat-row-val.unlimited { color: var(--primary-dk); }

/* CTA */
.price-cta { margin-top: 24px; flex-shrink: 0; }
.price-cta a { display: block; text-align: center; text-decoration: none; padding: 13px 24px; border-radius: var(--r); font-size: 15px; font-weight: 700; transition: opacity .18s, transform .12s; }
.price-cta a:hover { opacity: .88; transform: translateY(-1px); }

/* ── CTA SECTION ── */
.cta-section { background: var(--tint); border-top: 1px solid var(--tint-mid); border-bottom: 1px solid var(--tint-mid); padding: 88px 24px; }
.cta-inner { max-width: 640px; margin: 0 auto; text-align: center; }
.cta-inner p { font-size: 17px; color: var(--text-sub); margin-bottom: 28px; }
.cta-inner h2 { margin-bottom: 8px; }

/* ── FOOTER ── */
footer { max-width: 1100px; margin: 0 auto; padding: 48px 24px; display: flex; flex-direction: column; align-items: center; gap: 20px; }
.footer-links { display: flex; gap: 28px; }
.footer-links a { font-size: 14px; color: var(--text-muted); text-decoration: none; transition: color .15s; }
.footer-links a:hover { color: var(--primary); }
.footer-copy { font-size: 13px; color: var(--text-muted); }

/* ── HAMBURGER ── */
.nav-hamburger {
  display: none;
  flex-direction: column;
  gap: 5px;
  cursor: pointer;
  padding: 9px;
  border-radius: 9px;
  background: transparent;
  border: none;
  transition: background .15s;
  flex-shrink: 0;
}
.nav-hamburger:hover { background: var(--tint); }
.nav-hamburger span {
  display: block; width: 20px; height: 2px; border-radius: 2px;
  background: var(--text-main); transition: all .25s ease;
}
.nav-hamburger.open span:nth-child(1) { transform: translateY(7px) rotate(45deg); }
.nav-hamburger.open span:nth-child(2) { opacity: 0; transform: scaleX(0); }
.nav-hamburger.open span:nth-child(3) { transform: translateY(-7px) rotate(-45deg); }

/* ── MOBILE MENU OVERLAY ── */
.mobile-menu {
  display: none;
  position: fixed;
  top: 64px; left: 0; right: 0; bottom: 0;
  background: rgba(247,247,250,0.97);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  z-index: 98;
  flex-direction: column;
  padding: 20px 16px 32px;
  gap: 4px;
  border-top: 1px solid var(--border);
  overflow-y: auto;
  animation: fadeUp .2s ease both;
}
.mobile-menu.open { display: flex; }
.mobile-menu a {
  font-size: 16px; font-weight: 500; color: var(--text-sub);
  text-decoration: none; padding: 15px 18px; border-radius: 12px;
  transition: background .15s, color .15s;
}
.mobile-menu a:hover { background: var(--tint); color: var(--primary); }
.mobile-menu-divider { width: 100%; height: 1px; background: var(--border); margin: 8px 0; }
.mobile-menu .btn-mobile-cta {
  margin-top: 8px;
  display: block; text-align: center;
  background: var(--primary); color: #fff; border-radius: 12px;
  padding: 15px 24px; font-size: 16px; font-weight: 700;
  text-decoration: none;
  box-shadow: 0 4px 18px rgba(108,111,239,0.28);
}

/* ── RESPONSIVE ── */

/* Large desktop: no change needed */

/* Medium desktop / wide tablet (≤ 1100px) */
@media (max-width: 1100px) {
  nav {
    padding: 0 24px;
  }
}

/* Tablet (≤ 1024px) */
@media (max-width: 1024px) {
  .db-grid { grid-template-columns: repeat(3, 1fr); }
  .features-grid { grid-template-columns: repeat(2, 1fr); }
  .pricing-grid { grid-template-columns: 1fr; max-width: 480px; margin-left: auto; margin-right: auto; }
  .billing-toggle { flex-wrap: wrap; }
}

/* Tablet (≤ 860px) */
@media (max-width: 860px) {
  .features-grid { grid-template-columns: repeat(2, 1fr); }
  .stats-band-inner { gap: 28px; }
}

/* Mobile landscape / small tablet (≤ 768px) */
@media (max-width: 768px) {
  /* Nav */
  nav { padding: 0 16px; height: 60px; }
  nav .nav-links { display: none; }
  .nav-hamburger { display: flex; }
  .mobile-menu { top: 60px; }

  /* Typography */
  h1 { font-size: clamp(30px, 8vw, 52px); letter-spacing: -1px; }
  h2 { font-size: clamp(24px, 6vw, 38px); letter-spacing: -.5px; }
  .hero-sub { font-size: 16px; }
  .section-sub { font-size: 15px; }

  /* Hero */
  .hero { padding: 72px 20px 48px; }
  .hero-cta { flex-direction: column; align-items: center; }
  .hero-cta a { width: 100%; max-width: 320px; text-align: center; }

  /* Hero visual — demo video */
  .hero-visual { margin-top: 40px; border-radius: 12px; }

  /* Sections */
  section { padding: 64px 20px; }

  /* Features */
  .features-grid { grid-template-columns: 1fr 1fr; gap: 12px; }
  .feat-card { padding: 22px 18px; }

  /* How it works */
  .how-wrap { grid-template-columns: 1fr; gap: 32px; }

  /* Exercise pills — flatten to wrap */
  .exercise-pills-layout {
    grid-template-columns: 1fr !important;
    gap: 16px !important;
  }
  .exercise-pills-side {
    flex-direction: row !important;
    flex-wrap: wrap !important;
    justify-content: center !important;
    align-items: center !important;
  }
  .exercise-pills-side .ex-pill { transform: none !important; }

  /* Stats band */
  .stats-band { padding: 40px 20px; }
  .stats-band-inner { gap: 24px; }
  .stat-num { font-size: 34px; }

  /* Testimonials */
  .testi-grid { grid-template-columns: 1fr; }

  /* Pricing */
  .pricing-grid { max-width: 440px; }
  .billing-toggle { width: 100%; justify-content: center; }

  /* AI generation */
  .ai-section-wrap { padding: 64px 20px; }

  /* CTA section */
  .cta-section { padding: 64px 20px; }
  .cta-inner h2 { font-size: clamp(24px, 6vw, 36px); }

  /* Footer */
  footer { padding: 40px 20px; }
  .footer-links { flex-wrap: wrap; justify-content: center; gap: 16px; }
}

/* Mobile portrait (≤ 480px) */
@media (max-width: 480px) {
  h1 { font-size: clamp(26px, 9vw, 40px); }
  .hero { padding: 56px 16px 44px; }
  section { padding: 52px 16px; }

  /* Features: single column */
  .features-grid { grid-template-columns: 1fr; }

  /* Stats: wrap to 2 cols */
  .stats-band-inner {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
    justify-items: center;
  }
  .stat-num { font-size: 30px; }

  /* Pricing */
  .pricing-grid { max-width: 100%; }

  /* Buttons */
  .btn-primary { font-size: 15px; padding: 13px 24px; }
  .btn-ghost { font-size: 15px; padding: 13px 20px; }

  /* Hero badge wraps */
  .hero-badge { font-size: 12px; padding: 5px 12px; text-align: center; }

  /* Footer */
  .footer-links { gap: 14px; }
}

/* Very small (≤ 360px) */
@media (max-width: 360px) {
  h1 { font-size: 26px; }
  nav { height: 56px; }
  .mobile-menu { top: 56px; }
}
`;

// Static path to the hero demo clip in frontend/public/demo.mp4
const DEMO_VIDEO_SRC = '/demo.mp4';

// Vertical reels-style demo clip for the mid-page "Describe it. AI" section
const DEMO_REELS_VIDEO_SRC = '/demo_reels.mp4';

// Square-cropped founder portrait (head + crossed arms) for circular avatar display
const FOUNDER_PHOTO_SRC = '/founder-avatar.jpeg';

type DemoVideoProps = {
  className: string;
  src?: string;
  autoPlay?: boolean;
};

// Renders a landing-page product demo clip with controls for codec/autoplay fallbacks
function DemoVideo({ className, src = DEMO_VIDEO_SRC, autoPlay = false }: DemoVideoProps) {
  return (
    <video
      className={className}
      src={src}
      autoPlay={autoPlay}
      muted
      loop
      playsInline
      controls
      preload="metadata"
    />
  );
}

/* ─── Logo SVG ─── */
const LogoSVG = ({ width = 150, height = 36 }: { width?: number; height?: number }) => (
  <svg width={width} height={height} viewBox="0 0 180 40" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="20" cy="20" r="17" stroke="#6C6FEF" strokeWidth="1.6" />
    <circle cx="20" cy="20" r="9" stroke="#6C6FEF" strokeWidth="1.1" opacity="0.4" />
    <circle cx="20" cy="20" r="3" fill="#6C6FEF" />
    <circle cx="20" cy="3" r="2" fill="#6C6FEF" opacity="0.75" />
    <circle cx="34.7" cy="11.5" r="2" fill="#6C6FEF" opacity="0.75" />
    <circle cx="34.7" cy="28.5" r="2" fill="#6C6FEF" opacity="0.75" />
    <text x="48" y="26" fontFamily="'Sora', system-ui, sans-serif" fontWeight="700" fontSize="19" fill="#1A1A2E" letterSpacing="-0.5">Lingu</text>
    <text x="106" y="26" fontFamily="'Sora', system-ui, sans-serif" fontWeight="700" fontSize="19" fill="#6C6FEF" letterSpacing="-0.5">AI</text>
  </svg>
);

/* ─── Globe icon ─── */
const GlobeIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
  </svg>
);

/* ─── Language Switcher ─── */
const LANGS = [
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'ru', label: 'Русский', flag: '🇷🇺' },
  { code: 'it', label: 'Italiano', flag: '🇮🇹' },
] as const;

function LangSwitcher() {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = LANGS.find(l => l.code === i18n.language) ?? LANGS[0];

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const select = (code: string) => { i18n.changeLanguage(code); setOpen(false); };

  return (
    <div className="lang-switcher" ref={ref}>
      <button
        className={`lang-btn${open ? ' open' : ''}`}
        onClick={() => setOpen(o => !o)}
        aria-label="Change language"
        type="button"
      >
        <GlobeIcon />
        <span className="lang-flag">{current.flag}</span>
        <span>{current.code.toUpperCase()}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ opacity: 0.5, marginLeft: 2 }}>
          <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {open && (
        <div className="lang-dropdown" role="listbox">
          {LANGS.map(l => (
            <div
              key={l.code}
              className={`lang-opt${l.code === i18n.language ? ' active' : ''}`}
              onClick={() => select(l.code)}
              role="option"
              aria-selected={l.code === i18n.language}
            >
              <span className="lang-flag">{l.flag}</span>
              <span>{l.label}</span>
              {l.code === i18n.language && (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ marginLeft: 'auto' }}>
                  <path d="M2 6L5 9L10 3" stroke="#4F52C2" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Main Component ─── */
export default function LandingPage() {
  const { t } = useTranslation();

  // First-time visitors default to English; switcher choice is cached in localStorage.
  useEffect(() => {
    if (!localStorage.getItem("i18nextLng")) {
      void i18n.changeLanguage("en");
    }
  }, []);
  const [activeStep, setActiveStep] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [billingDuration, setBillingDuration] = useState<"1m" | "3m" | "6m" | "12m">("1m");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Pricing constants (mirrors AdminTariffsPage)
  const STANDARD_BASE = 12;
  const PRO_BASE = 39;
  const DURATION_MONTHS: Record<string, number> = { "1m": 1, "3m": 3, "6m": 6, "12m": 12 };
  const DURATION_DISCOUNT: Record<string, number> = { "1m": 0, "3m": 0.05, "6m": 0.10, "12m": 0.20 };
  const BILLING_DISCOUNTS: Record<string, string> = { "3m": "-5%", "6m": "-10%", "12m": "-20%" };
  const months = DURATION_MONTHS[billingDuration];
  const discount = DURATION_DISCOUNT[billingDuration];
  const standardTotal = Math.round(STANDARD_BASE * months * (1 - discount));
  const proTotal = Math.round(PRO_BASE * months * (1 - discount));
  const standardSavings = discount > 0 ? `Save $${Math.round(STANDARD_BASE * months * discount)}` : null;
  const proSavings = discount > 0 ? `Save $${Math.round(PRO_BASE * months * discount)}` : null;
  const durationLabel = billingDuration === "1m" ? "per month" : billingDuration === "3m" ? "per 3 months" : billingDuration === "6m" ? "per 6 months" : "per year";

  const resetTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % 4);
    }, 3500);
  };

  useEffect(() => {
    resetTimer();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  // Close mobile menu on resize to desktop
  useEffect(() => {
    const onResize = () => { if (window.innerWidth > 768) setMobileMenuOpen(false); };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    document.body.style.overflow = mobileMenuOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileMenuOpen]);

  const handleStepClick = (i: number) => {
    setActiveStep(i);
    resetTimer();
  };

  return (
    <>
      <style>{CSS}</style>

      {/* ── NAV ── */}
      <nav>
        <a href="#" className="nav-logo">
          <LogoSVG />
        </a>
        {/* Desktop links */}
        <div className="nav-links">
          <a href="#features">{t('landing.nav.features', 'Features')}</a>
          <a href="#exercises">{t('landing.nav.exercises', 'Exercises')}</a>
          <a href="#demo">{t('landing.nav.aiGeneration', 'Demo')}</a>
          <a href="#pricing">{t('landing.nav.pricing', 'Pricing')}</a>
          <Link to="/login">{t('landing.nav.login', 'Log in')}</Link>
          <LangSwitcher />
          <Link to="/register" className="btn-nav">{t('landing.nav.getStarted', 'Get started free')}</Link>
        </div>
        {/* Hamburger */}
        <button
          className={`nav-hamburger${mobileMenuOpen ? " open" : ""}`}
          onClick={() => setMobileMenuOpen((v) => !v)}
          aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
        >
          <span /><span /><span />
        </button>
      </nav>

      {/* ── MOBILE MENU ── */}
      <div className={`mobile-menu${mobileMenuOpen ? " open" : ""}`} role="dialog" aria-modal="true">
        <a href="#features" onClick={() => setMobileMenuOpen(false)}>{t('landing.nav.features', 'Features')}</a>
        <a href="#exercises" onClick={() => setMobileMenuOpen(false)}>{t('landing.nav.exercises', 'Exercises')}</a>
        <a href="#demo" onClick={() => setMobileMenuOpen(false)}>{t('landing.nav.aiGeneration', 'Demo')}</a>
        <a href="#pricing" onClick={() => setMobileMenuOpen(false)}>{t('landing.nav.pricing', 'Pricing')}</a>
        <div className="mobile-menu-divider" />
        <Link to="/login" onClick={() => setMobileMenuOpen(false)}>{t('landing.nav.login', 'Log in')}</Link>
        <Link to="/register" className="btn-mobile-cta" onClick={() => setMobileMenuOpen(false)}>{t('landing.nav.getStarted', 'Get started free')} →</Link>
      </div>

      {/* ── HERO ── */}
      <div className="hero">
        <div className="hero-badge"><span></span> {t('landing.hero.badge', 'AI-Powered Language Teaching Platform')}</div>
        <h1>{t('landing.hero.title1', 'Teach languages')}<br />{t('landing.hero.title2', 'smarter with')} <em>{t('landing.hero.titleHighlight', 'AI')}</em></h1>
        <p className="hero-sub">{t('landing.hero.subtitle', 'Build structured courses, generate lessons in minutes, and track every student\'s progress — all in one beautiful platform.')}</p>
        <div className="hero-cta">
          <Link to="/register" className="btn-primary">{t('landing.hero.startFree', 'Start for free →')}</Link>
        </div>

        <div className="hero-langs">
          <span className="hero-langs-label">{t('landing.hero.langsLabel', 'Generate lessons in')}</span>
          <div className="hero-langs-list">
            {["English", "Spanish", "Italian", "German", "French", "Russian"].map((lang) => (
              <span key={lang} className="hero-lang-pill">{lang}</span>
            ))}
          </div>
        </div>

        {/* Product demo video */}
        <div className="hero-visual">
          <div className="hero-visual-bar">
            <div className="dot dot-r" /><div className="dot dot-y" /><div className="dot dot-g" />
            <span style={{ marginLeft: 8, fontSize: 12, color: "var(--text-muted)" }}>linguai.net / demo</span>
          </div>

          <div className="hero-video-wrap">
            <DemoVideo className="hero-video" autoPlay />
          </div>
        </div>
      </div>

      {/* ── FEATURES ── */}
      <section id="features">
        <div className="section-label">{t('landing.featuresSection.label', 'Features')}</div>
        <h2>{t('landing.featuresSection.heading', 'Everything you need to')}<br /><em>{t('landing.featuresSection.headingHighlight', 'teach brilliantly')}</em></h2>
        <p className="section-sub">{t('landing.featuresSection.subtext', 'One platform — from content creation to classroom management and grading.')}</p>
        <div className="features-grid">
          {[
            { icon: "📚", bg: "#EEF0FE", title: t('landing.featuresSection.f1Title', 'Structured course builder'), body: t('landing.featuresSection.f1Body', 'Organise teaching into courses, units, and lessons. Drag to reorder, nest freely, and always give students a clear path forward.') },
            { icon: "✨", bg: "#fef3c7", title: t('landing.featuresSection.f2Title', 'AI content generation'), body: t('landing.featuresSection.f2Body', 'Describe a topic — get a full lesson deck, interactive exercises, and a graded test generated in minutes. No blank-page anxiety.') },
            { icon: "🎓", bg: "#dcfce7", title: t('landing.featuresSection.f3Title', 'Live classroom mode'), body: t('landing.featuresSection.f3Body', 'Assign lessons to classrooms. Students follow at their own pace through slides, drag-and-drop tasks, and timed tests.') },
            { icon: "📊", bg: "#e0f2fe", title: t('landing.featuresSection.f4Title', 'Progress & analytics'), body: t('landing.featuresSection.f4Body', 'See every student\'s completion, scores, and time spent at a glance. Spot weak areas and intervene before they fall behind.') },
            { icon: "🎯", bg: "#fce7f3", title: t('landing.featuresSection.f5Title', 'Rich exercise types'), body: t('landing.featuresSection.f5Body', 'Drag-to-gap, match pairs, sort into columns, type word, true/false, build sentence — 12+ interactive exercise types built in.') },
            { icon: "🏠", bg: "#f0fdf4", title: t('landing.featuresSection.f6Title', 'Homework & self-study'), body: t('landing.featuresSection.f6Body', 'Assign homework that students complete independently. Submissions are collected and graded automatically, saving hours each week.') },
          ].map((f) => (
            <div className="feat-card" key={f.title}>
              <div className="feat-icon" style={{ background: f.bg }}>{f.icon}</div>
              <div className="feat-title">{f.title}</div>
              <p className="feat-body">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── EXERCISE TYPES ── */}
      <section id="exercises" style={{ overflow: "hidden" }}>
        <div className="section-label">{t('landing.exercisesSection.label', 'Exercise library')}</div>
        <h2>{t('landing.exercisesSection.heading', '12+ interactive')}<br /><em>{t('landing.exercisesSection.headingHighlight', 'exercise types')}</em></h2>
        <p className="section-sub">{t('landing.exercisesSection.subtext', 'Every exercise is interactive, auto-graded, and works seamlessly on desktop and mobile.')}</p>

        <div style={{ position: "relative", marginTop: 56, display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div className="exercise-pills-layout" style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 32, alignItems: "center", width: "100%", maxWidth: 900, margin: "0 auto" }}>
            {/* LEFT */}
            <div className="exercise-pills-side" style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-end" }}>
              {[
                { bg: "linear-gradient(135deg,#f87171,#fb923c)", rot: "-2deg", label: "🖼 Image & GIF" },
                { bg: "linear-gradient(135deg,#fb923c,#facc15)", rot: "-1deg", label: "▶ YouTube video" },
                { bg: "linear-gradient(135deg,#4ade80,#22d3ee)", rot: "1.5deg", label: "⬜ Drag to gap" },
                { bg: "linear-gradient(135deg,#22d3ee,#6366f1)", rot: "-1deg", label: "✅ Test with answers" },
                { bg: "linear-gradient(135deg,#6366f1,#a855f7)", rot: "2deg", label: "✏️ Essay & translate" },
                { bg: "linear-gradient(135deg,#a855f7,#ec4899)", rot: "-1.5deg", label: "🎧 Audio playback" },
                { bg: "linear-gradient(135deg,#ec4899,#f87171)", rot: "1deg", label: "⌨️ Type in the gap" },
              ].map((p) => (
                <div key={p.label} className="ex-pill" style={{ background: p.bg, transform: `rotate(${p.rot})` }}>{p.label}</div>
              ))}
            </div>

            {/* CENTRE */}
            <div style={{ background: "var(--white)", borderRadius: 20, border: "1.5px dashed var(--border)", padding: "36px 28px", textAlign: "center", minWidth: 180, boxShadow: "var(--shadow-sm)" }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: "var(--tint)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px", fontSize: 20 }}>✦</div>
              <div style={{ fontFamily: "'Sora', sans-serif", fontWeight: 700, fontSize: 14, color: "var(--text-muted)" }}>Section name</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 20, borderTop: "1px solid var(--border)", paddingTop: 16 }}>+ Add exercise</div>
            </div>

            {/* RIGHT */}
            <div className="exercise-pills-side" style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-start" }}>
              {[
                { bg: "linear-gradient(135deg,#f87171,#a855f7)", rot: "2deg", label: "🖼 Word to image" },
                { bg: "linear-gradient(135deg,#6366f1,#22d3ee)", rot: "-1.5deg", label: "📝 Build sentence" },
                { bg: "linear-gradient(135deg,#22d3ee,#4ade80)", rot: "1deg", label: "🔤 Build from letters" },
                { bg: "linear-gradient(135deg,#a855f7,#6366f1)", rot: "-2deg", label: "☰ Sort into columns" },
                { bg: "linear-gradient(135deg,#6366f1,#22d3ee)", rot: "1.5deg", label: "↕ Order paragraphs" },
                { bg: "linear-gradient(135deg,#22d3ee,#4ade80)", rot: "-1deg", label: "🎙 Voice record" },
                { bg: "linear-gradient(135deg,#4ade80,#facc15)", rot: "2deg", label: "💬 Match pairs" },
              ].map((p) => (
                <div key={p.label} className="ex-pill" style={{ background: p.bg, transform: `rotate(${p.rot})` }}>{p.label}</div>
              ))}
            </div>
          </div>
        </div>

        {/* Exercise preview cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 16, marginTop: 52 }}>
          {/* Drag to gap */}
          <div style={{ background: "var(--white)", borderRadius: "var(--r-lg)", border: "1px solid var(--border)", padding: 24, boxShadow: "var(--shadow-sm)" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 14 }}>Drag to gap</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
              <span className="word-chip">lives</span>
              <span className="word-chip">watches</span>
              <span className="word-chip" style={{ opacity: .4, pointerEvents: "none" }}>starts</span>
              <span className="word-chip">buys</span>
            </div>
            <p style={{ fontSize: 13, color: "var(--text-sub)", lineHeight: 2 }}>
              My brother <span className="gap-slot">starts</span> in a small flat. He <span className="gap-slot" style={{ background: "var(--tint)", borderColor: "var(--primary)", color: "var(--primary-dk)" }}>watches</span> TV every day and she <span className="gap-slot">___</span> a new book every week.
            </p>
          </div>
          {/* Match pairs */}
          <div style={{ background: "var(--white)", borderRadius: "var(--r-lg)", border: "1px solid var(--border)", padding: 24, boxShadow: "var(--shadow-sm)" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 14 }}>Match pairs</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div className="match-item" style={{ borderColor: "var(--primary)", background: "var(--tint)", color: "var(--primary-dk)" }}>I live</div>
              <div className="match-item">permanent situation</div>
              <div className="match-item">I am living</div>
              <div className="match-item" style={{ borderColor: "var(--primary)", background: "var(--tint)", color: "var(--primary-dk)" }}>temporary situation</div>
              <div className="match-item" style={{ borderColor: "var(--primary)", background: "var(--tint)", color: "var(--primary-dk)" }}>every day</div>
              <div className="match-item">adverb of frequency</div>
            </div>
          </div>
          {/* Sort into columns */}
          <div style={{ background: "var(--white)", borderRadius: "var(--r-lg)", border: "1px solid var(--border)", padding: 24, boxShadow: "var(--shadow-sm)" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 14 }}>Sort into columns</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#166534", marginBottom: 8 }}>Presente</div>
                <div className="sort-chip" style={{ background: "#dcfce7", color: "#166534", borderColor: "#86efac" }}>parlo</div>
                <div className="sort-chip" style={{ background: "#dcfce7", color: "#166534", borderColor: "#86efac" }}>mangio</div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#1e40af", marginBottom: 8 }}>Passato</div>
                <div className="sort-chip" style={{ background: "#dbeafe", color: "#1e40af", borderColor: "#93c5fd" }}>ho parlato</div>
                <div className="sort-chip" style={{ background: "var(--bg)", color: "var(--text-muted)", borderColor: "var(--border)", borderStyle: "dashed" }}>ho mangiato</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── MID-PAGE CTA ── */}
      <div className="demo-section-wrap" id="demo">
        <div style={{ maxWidth: 720, margin: "0 auto", textAlign: "center" }}>
          <div className="section-label">{t('landing.demoSection.label', 'See it in action')}</div>
          <h2>{t('landing.demoSection.heading', 'Describe it. AI')}<br /><em>{t('landing.demoSection.headingHighlight', 'builds the whole lesson.')}</em></h2>
          <p className="section-sub" style={{ margin: "0 auto 32px" }}>{t('landing.demoSection.subtext', 'Type a topic or upload a file — get grammar, vocabulary, and interactive exercises in minutes. No credit card needed to try.')}</p>

          <div className="demo-video-frame">
            <DemoVideo className="demo-video" src={DEMO_REELS_VIDEO_SRC} autoPlay />
          </div>

          <div className="demo-cta">
            <Link to="/register" className="btn-primary">{t('landing.demoSection.cta', 'Try it free →')}</Link>
          </div>
        </div>
      </div>

      {/* ── STATS BAND ── */}
      <div className="stats-band">
        <div className="stats-band-inner">
          <div><div className="stat-num">12+</div><div className="stat-label">{t('landing.stats.exerciseTypes', 'Exercise types')}</div></div>
          <div><div className="stat-num">3 min</div><div className="stat-label">{t('landing.stats.generationTime', 'Avg. lesson generation time')}</div></div>
          <div><div className="stat-num">100%</div><div className="stat-label">{t('landing.stats.autoGraded', 'Auto-graded exercises')}</div></div>
          <div><div className="stat-num">6</div><div className="stat-label">{t('landing.stats.languages', 'Teaching languages')}</div></div>
        </div>
      </div>

      {/* How it works section: not rendered — remove `false &&` wrapper to show again. */}
      {false && (
      <section id="how">
        <div className="section-label">How it works</div>
        <h2>From idea to lesson<br /><em>in four steps</em></h2>
        <div style={{ height: 40 }} />
        <div className="how-wrap">
          <div className="steps">
            {[
              { title: "Create your course structure", body: "Add a course, then build units inside it. Each unit holds lessons, tasks, and tests — all neatly organised for your students." },
              { title: "Generate content with AI", body: "Type a topic or paste your notes. AI produces a full slide deck, exercise sheet, and graded test — edit any block you want." },
              { title: "Assign to your classroom", body: "Open a live session or assign as homework. Students join with a code and work through content at their own pace." },
              { title: "Track & improve", body: "Scores, completion rates, and weak-spot analytics update in real time. Know exactly where each student needs support." },
            ].map((s, i) => (
              <div key={i} className={`step${activeStep === i ? " active" : ""}`} onClick={() => handleStepClick(i)}>
                <div className="step-num">{i + 1}</div>
                <div>
                  <div className="step-title">{s.title}</div>
                  <div className="step-body">{s.body}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Screen mockup */}
          <div className="step-screen">
            {/* Step 0 */}
            {activeStep === 0 && (
              <>
                <div className="step-screen-bar">
                  <div className="dot dot-r" /><div className="dot dot-y" /><div className="dot dot-g" />
                  <span style={{ marginLeft: 8, fontSize: 11, color: "var(--text-muted)" }}>My Courses</span>
                </div>
                <div className="step-screen-body">
                  <div style={{ fontFamily: "'Sora',sans-serif", fontWeight: 700, fontSize: 16, marginBottom: 16 }}>My Courses</div>
                  {[
                    { thumb: "🇮🇹", bg: "#EEF0FE", name: "Italian A1 — Beginners", meta: "6 units · 24 lessons", badge: "Active" },
                    { thumb: "📖", bg: "#dcfce7", name: "Italian B1 — Intermediate", meta: "8 units · 31 lessons", badge: "Active" },
                    { thumb: "✏️", bg: "#fef3c7", name: "Italian Grammar Intensive", meta: "4 units · 12 lessons", badge: "Draft", badgeStyle: { background: "var(--bg)", color: "var(--text-muted)" } },
                  ].map((c) => (
                    <div className="course-row" key={c.name}>
                      <div className="course-thumb" style={{ background: c.bg }}>{c.thumb}</div>
                      <div><div className="course-name">{c.name}</div><div className="course-meta">{c.meta}</div></div>
                      <span className="unit-badge" style={c.badgeStyle}>{c.badge}</span>
                    </div>
                  ))}
                  <div style={{ marginTop: 20 }}>
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "var(--primary)", color: "#fff", borderRadius: 10, padding: "9px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>+ New Course</div>
                  </div>
                </div>
              </>
            )}
            {/* Step 1 */}
            {activeStep === 1 && (
              <>
                <div className="step-screen-bar">
                  <div className="dot dot-r" /><div className="dot dot-y" /><div className="dot dot-g" />
                  <span style={{ marginLeft: 8, fontSize: 11, color: "var(--text-muted)" }}>AI Generator</span>
                </div>
                <div className="step-screen-body">
                  <div className="ai-chip" style={{ marginBottom: 14 }}>✨ AI Generator</div>
                  <div className="ai-prompt-box">"Create a lesson about Italian past tense — Passato Prossimo — for A2 students with dialogue examples and fill-in-the-blank exercises."</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".5px" }}>Generated in 38 seconds</div>
                  <div className="ai-gen-item"><div className="ai-gen-icon" style={{ background: "#EEF0FE" }}>🖼</div>Slide deck — 12 slides</div>
                  <div className="ai-gen-item"><div className="ai-gen-icon" style={{ background: "#dcfce7" }}>📝</div>Exercise sheet — 8 tasks</div>
                  <div className="ai-gen-item"><div className="ai-gen-icon" style={{ background: "#fef3c7" }}>✅</div>Graded test — 15 questions</div>
                </div>
              </>
            )}
            {/* Step 2 */}
            {activeStep === 2 && (
              <>
                <div className="step-screen-bar">
                  <div className="dot dot-r" /><div className="dot dot-y" /><div className="dot dot-g" />
                  <span style={{ marginLeft: 8, fontSize: 11, color: "var(--text-muted)" }}>Live Session</span>
                </div>
                <div className="step-screen-body">
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                    <div style={{ fontFamily: "'Sora',sans-serif", fontWeight: 700, fontSize: 15 }}>Italian A1 — Group 3</div>
                    <div style={{ background: "#dcfce7", color: "#166534", fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 99 }}>● Live</div>
                  </div>
                  <div style={{ background: "var(--tint)", borderRadius: 10, padding: "12px 16px", marginBottom: 16, textAlign: "center" }}>
                    <div style={{ fontSize: 11, color: "var(--primary-dk)", fontWeight: 600, marginBottom: 4 }}>Join code</div>
                    <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 26, fontWeight: 800, color: "var(--primary)", letterSpacing: 4 }}>A1-4892</div>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 8 }}>Students online · 7 of 12</div>
                  {[
                    { bg: "#6C6FEF", initials: "MR", name: "Marco R.", prog: "Slide 4 of 12", pct: "33%" },
                    { bg: "#10b981", initials: "LA", name: "Lucia A.", prog: "Exercise 2", pct: "60%" },
                    { bg: "#f59e0b", initials: "GF", name: "Giovanni F.", prog: "On test", pct: "88%" },
                  ].map((s) => (
                    <div className="student-row" key={s.name}>
                      <div className="avatar" style={{ width: 28, height: 28, background: s.bg, fontSize: 11 }}>{s.initials}</div>
                      <div><div className="student-name">{s.name}</div><div className="student-prog">{s.prog}</div></div>
                      <div className="progress-bar-wrap" style={{ width: 70 }}><div className="progress-bar" style={{ width: s.pct }} /></div>
                    </div>
                  ))}
                </div>
              </>
            )}
            {/* Step 3 */}
            {activeStep === 3 && (
              <>
                <div className="step-screen-bar">
                  <div className="dot dot-r" /><div className="dot dot-y" /><div className="dot dot-g" />
                  <span style={{ marginLeft: 8, fontSize: 11, color: "var(--text-muted)" }}>Student Progress</span>
                </div>
                <div className="step-screen-body">
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
                    <div style={{ background: "var(--tint)", borderRadius: 10, padding: 12, textAlign: "center" }}>
                      <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 24, fontWeight: 800, color: "var(--primary)" }}>84%</div>
                      <div style={{ fontSize: 11, color: "var(--primary-dk)" }}>Avg. score</div>
                    </div>
                    <div style={{ background: "#dcfce7", borderRadius: 10, padding: 12, textAlign: "center" }}>
                      <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 24, fontWeight: 800, color: "#166534" }}>91%</div>
                      <div style={{ fontSize: 11, color: "#166534" }}>Pass rate</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 8 }}>Top students</div>
                  {[
                    { bg: "#6C6FEF", initials: "LA", name: "Lucia A.", prog: "12/12 lessons complete", score: "96%", scoreBg: "#dcfce7", scoreColor: "#166534" },
                    { bg: "#f59e0b", initials: "GF", name: "Giovanni F.", prog: "11/12 lessons complete", score: "88%", scoreBg: "#EEF0FE", scoreColor: "var(--primary-dk)" },
                    { bg: "#10b981", initials: "MR", name: "Marco R.", prog: "10/12 lessons complete", score: "74%", scoreBg: "#fef3c7", scoreColor: "#92400e" },
                  ].map((s) => (
                    <div className="student-row" key={s.name}>
                      <div className="avatar" style={{ width: 28, height: 28, background: s.bg, fontSize: 11 }}>{s.initials}</div>
                      <div><div className="student-name">{s.name}</div><div className="student-prog">{s.prog}</div></div>
                      <div className="score-badge" style={{ background: s.scoreBg, color: s.scoreColor }}>{s.score}</div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </section>
      )}

      {/* ── FOUNDER'S NOTE ── */}
      <section>
        <div className="section-label">{t('landing.founderSection.label', 'Why I built this')}</div>
        <h2>{t('landing.founderSection.heading', 'Learning a language is hard enough —')}<br /><em>{t('landing.founderSection.headingHighlight', 'the practice shouldn\'t be boring')}</em></h2>
        <div className="founder-card">
          <div className="founder-body">
            <p>{t('landing.founderSection.p1', 'I built LinguAI around one idea: students learn better when exercises are actually engaging. Tools like Kahoot made quizzes fun — but that\'s just one format. LinguAI gives you a rich variety of interactive exercise types: drag-and-drop, matching, gap-fill, build-a-sentence, and more — so your students stay engaged instead of grinding through the same worksheet every time.')}</p>
            <p>{t('landing.founderSection.p2', 'You describe the lesson, AI builds it with varied interactive practice, and everything\'s auto-checked. Less prep for you, more fun for them.')}</p>
            <p>{t('landing.founderSection.p3', 'It\'s early, and I\'m building this in the open. Try it free — and tell me what would make it better.')}</p>
          </div>
          <div className="founder-sign">
            <div className="founder-photo-wrap">
              <img className="founder-photo" src={FOUNDER_PHOTO_SRC} alt={t('landing.founderSection.name', 'Kozy-Korpesh')} />
            </div>
            <div>
              <div className="founder-name">{t('landing.founderSection.name', 'Kozy-Korpesh')}</div>
              <div className="founder-role">{t('landing.founderSection.role', 'Founder, LinguAI')}</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section id="pricing">
        <div className="section-label">{t('landing.pricingSection.label', 'Pricing')}</div>
        <h2>{t('landing.pricingSection.heading', 'Simple, transparent')}<br /><em>{t('landing.pricingSection.headingHighlight', 'pricing')}</em></h2>
        <p className="section-sub">{t('landing.pricingSection.subtext', 'Start for free. Upgrade when you\'re ready. No credit card required.')}</p>

        {/* Billing duration toggle */}
        <div className="billing-toggle">
          {(["1m", "3m", "6m", "12m"] as const).map((d) => (
            <button
              key={d}
              className={`billing-btn${billingDuration === d ? " active" : ""}`}
              onClick={() => setBillingDuration(d)}
            >
              {d === "1m" ? "Monthly" : d === "3m" ? "3 months" : d === "6m" ? "6 months" : "Annual"}
              {BILLING_DISCOUNTS[d] && (
                <span className="billing-discount">{BILLING_DISCOUNTS[d]}</span>
              )}
            </button>
          ))}
        </div>

        <div className="pricing-grid">
          {/* ── Free ── */}
          <div className="price-card">
            <div className="price-name">{t('landing.pricingSection.freeName', 'Free')}</div>
            <div className="price-subtitle">{t('landing.pricingSection.freeSubtitle', 'Get started at no cost')}</div>
            <div className="price-amount-row">
              <span className="price-currency">$</span>
              <span className="price-val">0</span>
            </div>
            <div className="price-per">{t('landing.pricingSection.freePer', 'forever free')}</div>
            <hr className="price-divider" />
            <div className="feat-rows">
              <div className="feat-row"><span className="feat-row-label">{t('landing.pricingSection.rowExercises', 'AI exercise generations')}</span><span className="feat-row-val">10 / mo</span></div>
              <div className="feat-row"><span className="feat-row-label">{t('landing.pricingSection.rowUnits', 'AI unit generations')}</span><span className="feat-row-val">3 / mo</span></div>
              <div className="feat-row"><span className="feat-row-label">{t('landing.pricingSection.rowCourses', 'AI course generations')}</span><span className="feat-row-val">1 total</span></div>
              <div className="feat-row"><span className="feat-row-label">{t('landing.pricingSection.rowPublish', 'Publish to students')}</span><span className="feat-row-val">1 course</span></div>
              <div className="feat-row"><span className="feat-row-label">{t('landing.pricingSection.rowLive', 'Live classroom')}</span><span className="feat-row-val dash">—</span></div>
              <div className="feat-row"><span className="feat-row-label">{t('landing.pricingSection.rowAnalytics', 'Analytics')}</span><span className="feat-row-val">{t('landing.pricingSection.basic', 'Basic')}</span></div>
            </div>
            <div className="price-cta">
              <Link to="/register" style={{ display: "block", textAlign: "center", padding: "13px 24px", fontSize: 15, fontWeight: 700, textDecoration: "none", color: "var(--text-sub)", border: "1.5px solid var(--border)", borderRadius: "var(--r)", background: "var(--bg)" }}>{t('landing.pricingSection.freeCta', 'Get started')}</Link>
            </div>
          </div>

          {/* ── Standard ── */}
          <div className="price-card" style={{ borderColor: "#a7f3d0" }}>
            <div className="price-name">{t('landing.pricingSection.standardName', 'Standard')}</div>
            <div className="price-subtitle">{t('landing.pricingSection.standardSubtitle', 'For active teachers')}</div>
            <div className="price-amount-row">
              <span className="price-currency" style={{ color: "var(--text-sub)" }}>$</span>
              <span className="price-val">{standardTotal}</span>
              {standardSavings && <span className="price-savings">{standardSavings}</span>}
            </div>
            <div className="price-per">{durationLabel} · ${STANDARD_BASE}/mo base</div>
            <hr className="price-divider" />
            <div className="feat-rows">
              <div className="feat-row"><span className="feat-row-label">{t('landing.pricingSection.rowExercises', 'AI exercise generations')}</span><span className="feat-row-val">100 / mo</span></div>
              <div className="feat-row"><span className="feat-row-label">{t('landing.pricingSection.rowUnits', 'AI unit generations')}</span><span className="feat-row-val">20 / mo</span></div>
              <div className="feat-row"><span className="feat-row-label">{t('landing.pricingSection.rowCourses', 'AI course generations')}</span><span className="feat-row-val">5 / mo</span></div>
              <div className="feat-row"><span className="feat-row-label">{t('landing.pricingSection.rowPublish', 'Publish to students')}</span><span className="feat-row-val check">✓</span></div>
              <div className="feat-row"><span className="feat-row-label">{t('landing.pricingSection.rowLive', 'Live classroom')}</span><span className="feat-row-val check">✓</span></div>
              <div className="feat-row"><span className="feat-row-label">{t('landing.pricingSection.rowAnalytics', 'Analytics')}</span><span className="feat-row-val">{t('landing.pricingSection.full', 'Full')}</span></div>
            </div>
            <div className="price-cta">
              <Link to="/register" style={{ display: "block", textAlign: "center", padding: "13px 24px", fontSize: 15, fontWeight: 700, textDecoration: "none", color: "var(--primary-dk)", border: "1.5px solid var(--primary)", borderRadius: "var(--r)", background: "var(--tint)" }}>{t('landing.pricingSection.trialCta', 'Start free trial')}</Link>
            </div>
          </div>

          {/* ── Pro — featured ── */}
          <div className="price-card featured">
            <div style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "rgba(255,255,255,.18)", color: "#fff", fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 99, marginBottom: 10, letterSpacing: ".5px" }}>
              ★ {t('landing.pricingSection.mostPopular', 'MOST POPULAR')}
            </div>
            <div className="price-name">{t('landing.pricingSection.proName', 'Pro')}</div>
            <div className="price-subtitle">{t('landing.pricingSection.proSubtitle', 'Unlimited AI, for serious educators')}</div>
            <div className="price-amount-row">
              <span className="price-currency">$</span>
              <span className="price-val">{proTotal}</span>
              {proSavings && <span className="price-savings">{proSavings}</span>}
            </div>
            <div className="price-per">{durationLabel} · ${PRO_BASE}/mo base</div>
            <hr className="price-divider" />
            <div className="feat-rows">
              <div className="feat-row"><span className="feat-row-label">{t('landing.pricingSection.rowExercises', 'AI exercise generations')}</span><span className="feat-row-val unlimited">{t('landing.pricingSection.unlimited', 'Unlimited')}</span></div>
              <div className="feat-row"><span className="feat-row-label">{t('landing.pricingSection.rowUnits', 'AI unit generations')}</span><span className="feat-row-val unlimited">{t('landing.pricingSection.unlimited', 'Unlimited')}</span></div>
              <div className="feat-row"><span className="feat-row-label">{t('landing.pricingSection.rowCourses', 'AI course generations')}</span><span className="feat-row-val unlimited">{t('landing.pricingSection.unlimited', 'Unlimited')}</span></div>
              <div className="feat-row"><span className="feat-row-label">{t('landing.pricingSection.rowPublish', 'Publish to students')}</span><span className="feat-row-val check">✓</span></div>
              <div className="feat-row"><span className="feat-row-label">{t('landing.pricingSection.rowLive', 'Live classroom')}</span><span className="feat-row-val check">✓</span></div>
              <div className="feat-row"><span className="feat-row-label">{t('landing.pricingSection.rowAnalytics', 'Analytics')}</span><span className="feat-row-val">{t('landing.pricingSection.fullExports', 'Full + exports')}</span></div>
            </div>
            <div className="price-cta">
              <Link to="/register" style={{ display: "block", background: "#fff", color: "var(--primary-dk)", borderRadius: "var(--r)", padding: "13px 24px", fontSize: 15, fontWeight: 700, textDecoration: "none", textAlign: "center" }}>{t('landing.pricingSection.trialCta', 'Start free trial')}</Link>
            </div>
          </div>
        </div>

        {/* Footnote */}
        <p style={{ marginTop: 20, fontSize: 13, color: "var(--text-muted)", textAlign: "center" }}>
          {t('landing.pricingSection.footnote', 'All plans include homework mode, 12+ exercise types, and student progress tracking. Prices in USD · Billed via Stripe · Cancel anytime.')}
        </p>
      </section>

      {/* ── CTA ── */}
      <div className="cta-section">
        <div className="cta-inner">
          <div className="section-label" style={{ textAlign: "center" }}>{t('landing.ctaSection.label', 'Ready to start?')}</div>
          <h2>{t('landing.ctaSection.heading', 'Join teachers already')}<br /><em>{t('landing.ctaSection.headingHighlight', 'saving hours every week')}</em></h2>
          <p>{t('landing.ctaSection.body', 'Create your free account in 60 seconds. No credit card required.')}</p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <Link to="/register" className="btn-primary">{t('landing.ctaSection.primaryBtn', 'Get started free →')}</Link>
            <Link to="/login" className="btn-ghost">{t('landing.ctaSection.secondaryBtn', 'Sign in')}</Link>
          </div>
        </div>
      </div>

      {/* ── FOOTER ── */}
      <footer>
        <LogoSVG width={120} height={30} />
        <div className="footer-links">
          <a href="#">{t('landing.footerSection.privacy', 'Privacy')}</a>
          <a href="#">{t('landing.footerSection.terms', 'Terms')}</a>
          <a href="#">{t('landing.footerSection.support', 'Support')}</a>
          <a href="#">{t('landing.footerSection.contact', 'Contact')}</a>
        </div>
        <div className="footer-copy">© {new Date().getFullYear()} LinguAI. {t('landing.footerSection.rights', 'All rights reserved.')}</div>
      </footer>
    </>
  );
}