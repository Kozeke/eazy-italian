/**
 * LandingPage.tsx
 * Rebuilt from landing__2_.html — design system: #6C6FEF primary, Syne + Inter fonts.
 */
import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";

/* ─── CSS (verbatim from landing__2_.html, adapted for JSX injection) ─── */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=Inter:wght@400;500;600&display=swap');

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
  font-family: 'Syne', system-ui, sans-serif;
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
  margin-top: 64px; width: 100%; max-width: 980px;
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

/* ── DASHBOARD MOCK ── */
.db-wrap { display: flex; height: 520px; overflow: hidden; }
.db-topbar {
  position: absolute; top: 0; left: 0; right: 0; height: 52px;
  background: var(--white); border-bottom: 1px solid var(--border);
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 18px 0 14px; z-index: 10;
}
.db-topbar-logo { display: flex; align-items: center; gap: 7px; font-family: 'Syne', sans-serif; font-size: 15px; font-weight: 700; color: var(--text-main); }
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
.db-page-title { font-family: 'Syne', sans-serif; font-size: 20px; font-weight: 800; color: var(--text-main); margin-bottom: 18px; }
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
.db-course-thumb { height: 100px; display: flex; align-items: center; justify-content: center; font-family: 'Syne', sans-serif; font-size: 38px; font-weight: 800; letter-spacing: -1px; }
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
h2 { font-family: 'Syne', sans-serif; font-size: clamp(28px, 4vw, 44px); font-weight: 800; letter-spacing: -.8px; line-height: 1.15; color: var(--text-main); margin-bottom: 16px; }
h2 em { font-style: normal; color: var(--primary); }
.section-sub { font-size: 17px; color: var(--text-sub); max-width: 500px; line-height: 1.7; }

/* ── FEATURES ── */
/* Three columns so six cards lay out 3×2 on desktop (auto-fit would fit four narrow columns first). */
.features-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 52px; }
.feat-card { background: var(--white); border-radius: var(--r-lg); border: 1px solid var(--border); padding: 28px; display: flex; flex-direction: column; gap: 14px; box-shadow: var(--shadow-sm); transition: transform .22s, box-shadow .22s; }
.feat-card:hover { transform: translateY(-4px); box-shadow: var(--shadow-md); }
.feat-icon { width: 48px; height: 48px; border-radius: 14px; display: flex; align-items: center; justify-content: center; font-size: 22px; }
.feat-title { font-family: 'Syne', sans-serif; font-size: 17px; font-weight: 700; color: var(--text-main); }
.feat-body { font-size: 14px; color: var(--text-sub); line-height: 1.65; }

/* ── HOW IT WORKS ── */
.how-wrap { display: grid; grid-template-columns: 1fr 1fr; gap: 60px; align-items: center; }
.steps { display: flex; flex-direction: column; gap: 0; }
.step { display: flex; gap: 20px; padding: 24px 0; border-bottom: 1px solid var(--border); cursor: pointer; transition: opacity .2s; }
.step:last-child { border-bottom: none; }
.step-num { width: 36px; height: 36px; border-radius: 10px; flex-shrink: 0; background: var(--tint); color: var(--primary-dk); display: flex; align-items: center; justify-content: center; font-family: 'Syne', sans-serif; font-weight: 800; font-size: 15px; transition: background .2s, color .2s; }
.step.active .step-num { background: var(--primary); color: #fff; }
.step-title { font-family: 'Syne', sans-serif; font-weight: 700; font-size: 15px; margin-bottom: 6px; color: var(--text-main); }
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
.ai-tab { background: none; border: 1.5px solid var(--border); border-radius: 10px; padding: 9px 18px; font-size: 13px; font-weight: 600; color: var(--text-sub); cursor: pointer; transition: all .18s; font-family: 'Inter', sans-serif; }
.ai-tab:hover { border-color: var(--primary); color: var(--primary); background: var(--tint); }
.ai-tab.active { background: var(--primary); color: #fff; border-color: var(--primary); }
.ai-point { display: flex; gap: 14px; }
.ai-point-icon { width: 36px; height: 36px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 16px; flex-shrink: 0; }
.ai-point-title { font-family: 'Syne', sans-serif; font-weight: 700; font-size: 14px; margin-bottom: 4px; }
.ai-point-body { font-size: 13px; color: var(--text-sub); line-height: 1.6; }
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
.stat-num { font-family: 'Syne', sans-serif; font-size: 40px; font-weight: 800; color: #fff; line-height: 1; }
.stat-label { font-size: 14px; color: rgba(255,255,255,0.7); margin-top: 4px; }

/* ── TESTIMONIALS ── */
.testi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; margin-top: 48px; }
.testi-card { background: var(--white); border-radius: var(--r-lg); border: 1px solid var(--border); padding: 28px; box-shadow: var(--shadow-sm); }
.testi-stars { font-size: 16px; color: #F5A623; margin-bottom: 14px; letter-spacing: 2px; }
.testi-text { font-size: 14px; color: var(--text-sub); line-height: 1.7; margin-bottom: 20px; font-style: italic; }
.testi-author { display: flex; align-items: center; gap: 10px; }
.testi-name { font-size: 13px; font-weight: 700; color: var(--text-main); }
.testi-role { font-size: 12px; color: var(--text-muted); }

/* ── PRICING ── */
.pricing-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 20px; margin-top: 48px; }
.price-card { background: var(--white); border-radius: var(--r-lg); border: 1px solid var(--border); padding: 32px; box-shadow: var(--shadow-sm); }
.price-card.featured { background: var(--primary); border-color: var(--primary); }
.price-card.featured .price-name, .price-card.featured .price-val, .price-card.featured .price-per, .price-card.featured .price-feature { color: #fff; }
.price-card.featured .check { color: rgba(255,255,255,0.8); }
.price-card.featured .price-divider { border-color: rgba(255,255,255,0.2); }
.price-name { font-family: 'Syne', sans-serif; font-size: 20px; font-weight: 700; color: var(--text-main); margin-bottom: 8px; }
.price-val { font-family: 'Syne', sans-serif; font-size: 48px; font-weight: 800; color: var(--text-main); line-height: 1; }
.price-per { font-size: 13px; color: var(--text-muted); margin-top: 4px; margin-bottom: 16px; }
.price-divider { border: none; border-top: 1px solid var(--border); margin: 20px 0; }
.price-feature { display: flex; align-items: center; gap: 10px; font-size: 14px; color: var(--text-sub); margin-bottom: 10px; }
.check { color: #22c55e; font-weight: 700; }
.price-cta { margin-top: 24px; }
.price-cta a { display: block; text-align: center; text-decoration: none; padding: 13px 24px; border-radius: var(--r); font-size: 15px; font-weight: 700; transition: opacity .18s; }

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

/* ── RESPONSIVE ── */
@media (max-width: 720px) {
  .how-wrap { grid-template-columns: 1fr; }
  nav .nav-links a:not(.btn-nav) { display: none; }
  .db-grid { grid-template-columns: repeat(2, 1fr); }
  /* Single column on small screens — three equal columns would squeeze feature copy. */
  .features-grid { grid-template-columns: 1fr; }
}
@media (max-width: 480px) {
  .db-grid { grid-template-columns: 1fr; }
}
`;

/* ─── Logo SVG ─── */
const LogoSVG = ({ width = 150, height = 36 }: { width?: number; height?: number }) => (
  <svg width={width} height={height} viewBox="0 0 180 40" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="20" cy="20" r="17" stroke="#6C6FEF" strokeWidth="1.6" />
    <circle cx="20" cy="20" r="9" stroke="#6C6FEF" strokeWidth="1.1" opacity="0.4" />
    <circle cx="20" cy="20" r="3" fill="#6C6FEF" />
    <circle cx="20" cy="3" r="2" fill="#6C6FEF" opacity="0.75" />
    <circle cx="34.7" cy="11.5" r="2" fill="#6C6FEF" opacity="0.75" />
    <circle cx="34.7" cy="28.5" r="2" fill="#6C6FEF" opacity="0.75" />
    <text x="48" y="26" fontFamily="'Syne', system-ui, sans-serif" fontWeight="700" fontSize="19" fill="#1A1A2E" letterSpacing="-0.5">Lingu</text>
    <text x="106" y="26" fontFamily="'Syne', system-ui, sans-serif" fontWeight="700" fontSize="19" fill="#6C6FEF" letterSpacing="-0.5">AI</text>
  </svg>
);

/* ─── Main Component ─── */
export default function LandingPage() {
  const [activeTab, setActiveTab] = useState<"unit" | "exercise" | "course">("unit");
  const [activeStep, setActiveStep] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
        <div className="nav-links">
          <a href="#features">Features</a>
          <a href="#exercises">Exercises</a>
          <a href="#ai-generation">AI Generation</a>
          {/* <a href="#how">How it works</a> */}
          <a href="#pricing">Pricing</a>
          <Link to="/login">Log in</Link>
          <Link to="/register" className="btn-nav">Get started free</Link>
        </div>
      </nav>

      {/* ── HERO ── */}
      <div className="hero">
        <div className="hero-badge"><span></span> AI-Powered Language Teaching Platform</div>
        <h1>Teach languages<br />smarter with <em>AI</em></h1>
        <p className="hero-sub">Build structured courses, generate lessons in minutes, and track every student's progress — all in one beautiful platform.</p>
        <div className="hero-cta">
          <Link to="/register" className="btn-primary">Start for free →</Link>
          {/* <a href="#how" className="btn-ghost">See how it works</a> */}
        </div>

        {/* Dashboard preview */}
        <div className="hero-visual">
          <div className="hero-visual-bar">
            <div className="dot dot-r" /><div className="dot dot-y" /><div className="dot dot-g" />
            <span style={{ marginLeft: 8, fontSize: 12, color: "var(--text-muted)" }}>linguai.app / dashboard</span>
          </div>

          <div className="db-wrap" style={{ position: "relative" }}>
            {/* Top bar */}
            <div className="db-topbar">
              <div className="db-topbar-logo">
                <svg width="22" height="22" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="20" cy="20" r="17" stroke="#6C6FEF" strokeWidth="1.8" />
                  <circle cx="20" cy="20" r="9" stroke="#6C6FEF" strokeWidth="1.2" opacity="0.4" />
                  <circle cx="20" cy="20" r="3.5" fill="#6C6FEF" />
                  <circle cx="20" cy="3" r="2.2" fill="#6C6FEF" opacity="0.7" />
                  <circle cx="35" cy="11.5" r="2.2" fill="#6C6FEF" opacity="0.7" />
                  <circle cx="35" cy="28.5" r="2.2" fill="#6C6FEF" opacity="0.7" />
                </svg>
                Lingu <em>AI</em>
              </div>
              <div className="db-topbar-right">
                <div className="db-icon-btn">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                </div>
                <div className="db-icon-btn">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                </div>
                <div className="db-avatar">K</div>
              </div>
            </div>

            {/* Sidebar */}
            <div className="db-sidebar">
              <div className="db-sidebar-icon active">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>
              </div>
              <div className="db-sidebar-divider" />
              <div className="db-sidebar-add">+</div>
              <div className="db-sidebar-divider" />
              <div className="db-sidebar-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" /></svg>
              </div>
            </div>

            {/* Main content */}
            <div className="db-main">
              <div className="db-content">
                <div className="db-content-inner">
                  <div className="db-page-title">Courses</div>
                  <div className="db-search">
                    <span className="db-search-icon">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                    </span>
                    <span className="db-search-placeholder">Search courses...</span>
                  </div>
                  <div className="db-toolbar">
                    <span className="db-count">89 courses</span>
                    <div className="db-view-btns">
                      <div className="db-view-btn active">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>
                      </div>
                      <div className="db-view-btn">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>
                      </div>
                    </div>
                  </div>
                  <div className="db-grid">
                    <div className="db-create-card">
                      <div className="db-create-icon">+</div>
                      <div className="db-create-label">Create course</div>
                    </div>
                    {[
                      { bg: "#FADADD", color: "#C4757A", letter: "E", name: "English for business", students: 1 },
                      { bg: "#C9DFF5", color: "#6A8DAD", letter: "E", name: "English B1 Course", students: 1 },
                      { bg: "#C6E9CE", color: "#5E9E6E", letter: "I", name: "Italian A1 Grammar", students: 1 },
                      { bg: "#FDEEC8", color: "#B8922A", letter: "E", name: "English Beginners", students: 3 },
                      { bg: "#E2D4F0", color: "#8B68B5", letter: "I", name: "Italian Intermediate", students: 2 },
                      { bg: "#BDE8E4", color: "#4A9990", letter: "I", name: "Italian Conversation", students: 5 },
                      { bg: "#F9DEC8", color: "#C07640", letter: "I", name: "Italian B2", students: 4 },
                    ].map((c) => (
                      <div className="db-course-card" key={c.name}>
                        <div className="db-course-thumb" style={{ background: c.bg, color: c.color }}>{c.letter}</div>
                        <div className="db-course-info">
                          <div className="db-course-name">{c.name}</div>
                          <div className="db-course-meta">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /></svg>
                            {c.students}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── FEATURES ── */}
      <section id="features">
        <div className="section-label">Features</div>
        <h2>Everything you need to<br /><em>teach brilliantly</em></h2>
        <p className="section-sub">One platform — from content creation to classroom management and grading.</p>
        <div className="features-grid">
          {[
            { icon: "📚", bg: "#EEF0FE", title: "Structured course builder", body: "Organise teaching into courses, units, and lessons. Drag to reorder, nest freely, and always give students a clear path forward." },
            { icon: "✨", bg: "#fef3c7", title: "AI content generation", body: "Describe a topic — get a full lesson deck, interactive exercises, and a graded test generated in minutes. No blank-page anxiety." },
            { icon: "🎓", bg: "#dcfce7", title: "Live classroom mode", body: "Assign lessons to classrooms. Students follow at their own pace through slides, drag-and-drop tasks, and timed tests." },
            { icon: "📊", bg: "#e0f2fe", title: "Progress & analytics", body: "See every student's completion, scores, and time spent at a glance. Spot weak areas and intervene before they fall behind." },
            { icon: "🎯", bg: "#fce7f3", title: "Rich exercise types", body: "Drag-to-gap, match pairs, sort into columns, type word, true/false, build sentence — 12+ interactive exercise types built in." },
            { icon: "🏠", bg: "#f0fdf4", title: "Homework & self-study", body: "Assign homework that students complete independently. Submissions are collected and graded automatically, saving hours each week." },
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
        <div className="section-label">Exercise library</div>
        <h2>12+ interactive<br /><em>exercise types</em></h2>
        <p className="section-sub">Every exercise is interactive, auto-graded, and works seamlessly on desktop and mobile.</p>

        <div style={{ position: "relative", marginTop: 56, display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 32, alignItems: "center", width: "100%", maxWidth: 900, margin: "0 auto" }}>
            {/* LEFT */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-end" }}>
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
              <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 14, color: "var(--text-muted)" }}>Section name</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 20, borderTop: "1px solid var(--border)", paddingTop: 16 }}>+ Add exercise</div>
            </div>

            {/* RIGHT */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-start" }}>
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

      {/* ── AI GENERATION ── */}
      <div style={{ background: "var(--white)", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)", padding: "88px 24px" }} id="ai-generation">
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div className="section-label">AI generation</div>
          <h2>Describe it. AI<br /><em>builds it for you.</em></h2>
          <p className="section-sub">Generate full units, individual exercises, or entire courses — all from a simple description.</p>

          {/* Tab switcher */}
          <div style={{ display: "flex", gap: 8, marginTop: 40, marginBottom: 36, flexWrap: "wrap" }}>
            <button className={`ai-tab${activeTab === "unit" ? " active" : ""}`} onClick={() => setActiveTab("unit")}>✦ Generate unit</button>
            <button className={`ai-tab${activeTab === "exercise" ? " active" : ""}`} onClick={() => setActiveTab("exercise")}>⬜ Generate exercise</button>
            <button className={`ai-tab${activeTab === "course" ? " active" : ""}`} onClick={() => setActiveTab("course")}>📚 Generate course</button>
          </div>

          {/* UNIT tab */}
          {activeTab === "unit" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, alignItems: "start" }}>
              <div style={{ background: "var(--white)", borderRadius: "var(--r-lg)", border: "1px solid var(--border)", boxShadow: "var(--shadow-md)", overflow: "hidden" }}>
                <div style={{ background: "var(--bg)", borderBottom: "1px solid var(--border)", padding: "10px 16px", display: "flex", alignItems: "center", gap: 6 }}>
                  <div className="dot dot-r" /><div className="dot dot-y" /><div className="dot dot-g" />
                  <span style={{ marginLeft: 8, fontSize: 11, color: "var(--text-muted)" }}>Generate Unit Content</span>
                </div>
                <div style={{ padding: 24 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--tint)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>✦</div>
                    <div>
                      <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 14 }}>Generate Unit Content</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Unit 14</div>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", background: "var(--bg)", borderRadius: 10, padding: 3, marginBottom: 16 }}>
                    <div style={{ textAlign: "center", padding: 8, background: "var(--white)", borderRadius: 8, fontSize: 12, fontWeight: 600, color: "var(--text-main)", boxShadow: "var(--shadow-sm)" }}>✦ Generate with AI</div>
                    <div style={{ textAlign: "center", padding: 8, fontSize: 12, color: "var(--text-muted)" }}>↑ From File</div>
                  </div>
                  <input style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "var(--text-muted)", outline: "none", marginBottom: 10 }} placeholder="e.g. Present Simple tense, Vocabulary: Food & Drink..." readOnly />
                  <textarea style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "var(--text-muted)", resize: "none", height: 80, outline: "none", fontFamily: "inherit" }} placeholder="Describe what you'd like the AI to focus on…" readOnly />
                  <div style={{ textAlign: "center", fontSize: 12, color: "var(--text-muted)", margin: "10px 0" }}>⌄ Advanced settings</div>
                  <div style={{ background: "var(--primary)", color: "#fff", borderRadius: "var(--r)", padding: 12, textAlign: "center", fontSize: 14, fontWeight: 700 }}>★ Generate 3 Segments</div>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 20, paddingTop: 8 }}>
                {[
                  { icon: "✦", bg: "#EEF0FE", title: "One prompt, full unit", body: "Describe the topic and level — AI generates 3 lesson segments complete with slides, exercises, and a graded test." },
                  { icon: "📂", bg: "#dcfce7", title: "Or upload your materials", body: "Got existing worksheets or PDFs? Upload them and AI extracts the content into an editable lesson automatically." },
                  { icon: "✏️", bg: "#fef3c7", title: "Always editable", body: "Every slide, every exercise question, every test item is fully editable after generation. AI gives you the head start." },
                  { icon: "🎯", bg: "#e0f2fe", title: "Choose what to generate", body: "Select which segments to generate and in what order. Skip what you already have — generate only what you need." },
                ].map((p) => (
                  <div className="ai-point" key={p.title}>
                    <div className="ai-point-icon" style={{ background: p.bg }}>{p.icon}</div>
                    <div>
                      <div className="ai-point-title">{p.title}</div>
                      <div className="ai-point-body">{p.body}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* EXERCISE tab */}
          {activeTab === "exercise" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, alignItems: "start" }}>
              <div style={{ background: "var(--white)", borderRadius: "var(--r-lg)", border: "1px solid var(--border)", boxShadow: "var(--shadow-md)", overflow: "hidden" }}>
                <div style={{ background: "var(--bg)", borderBottom: "1px solid var(--border)", padding: "10px 16px", display: "flex", alignItems: "center", gap: 6 }}>
                  <div className="dot dot-r" /><div className="dot dot-y" /><div className="dot dot-g" />
                  <span style={{ marginLeft: 8, fontSize: 11, color: "var(--text-muted)" }}>AI Exercise Generator</span>
                </div>
                <div style={{ padding: 24 }}>
                  <div className="ai-chip" style={{ marginBottom: 14 }}>⬜ Drag-to-Gap</div>
                  <div style={{ background: "var(--bg)", border: "1.5px solid var(--primary)", borderRadius: 10, padding: "10px 14px", fontSize: 12, color: "var(--text-sub)", marginBottom: 14 }}>"Practice Italian present tense with irregular verbs: essere, avere, fare — intermediate level"</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
                    {["sono", "hai", "fa", "siamo", "avete"].map((w) => <span key={w} className="word-chip">{w}</span>)}
                  </div>
                  <p style={{ fontSize: 13, color: "var(--text-sub)", lineHeight: 2 }}>
                    Io <span className="gap-slot" style={{ background: "var(--tint)", borderColor: "var(--primary)", color: "var(--primary-dk)" }}>sono</span> italiano. Tu <span className="gap-slot">___</span> una studentessa. Lei <span className="gap-slot">___</span> la spesa.
                  </p>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 20, paddingTop: 8 }}>
                {[
                  { icon: "✦", bg: "#EEF0FE", title: "Exercise-level AI", body: "Generate a single exercise of any type — drag-to-gap, match pairs, sort columns, true/false — from just a description." },
                  { icon: "💡", bg: "#fef3c7", title: "Smart prompt suggestions", body: "One-click prompt chips help you get started: \"Write a text on the topic\", \"Practice past tense with\", and more." },
                  { icon: "👁", bg: "#dcfce7", title: "Preview before adding", body: "See the generated exercise with words in gaps before adding it to your lesson. Regenerate if needed." },
                  { icon: "📄", bg: "#e0f2fe", title: "Generate from your materials", body: "Switch to \"By materials\" and upload a PDF or text — AI builds exercises from your own content instantly." },
                ].map((p) => (
                  <div className="ai-point" key={p.title}>
                    <div className="ai-point-icon" style={{ background: p.bg }}>{p.icon}</div>
                    <div>
                      <div className="ai-point-title">{p.title}</div>
                      <div className="ai-point-body">{p.body}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* COURSE tab */}
          {activeTab === "course" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, alignItems: "start" }}>
              <div style={{ background: "var(--white)", borderRadius: "var(--r-lg)", border: "1px solid var(--border)", boxShadow: "var(--shadow-md)", overflow: "hidden" }}>
                <div style={{ background: "var(--bg)", borderBottom: "1px solid var(--border)", padding: "10px 16px", display: "flex", alignItems: "center", gap: 6 }}>
                  <div className="dot dot-r" /><div className="dot dot-y" /><div className="dot dot-g" />
                  <span style={{ marginLeft: 8, fontSize: 11, color: "var(--text-muted)" }}>AI Course Generator</span>
                </div>
                <div style={{ padding: 24 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--tint)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>📚</div>
                    <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 14 }}>Generate Full Course</div>
                  </div>
                  <div style={{ border: "1.5px solid var(--primary)", borderRadius: 10, padding: "10px 14px", fontSize: 12, color: "var(--text-sub)", marginBottom: 10 }}>Italian A2 — Intermediate beginners, focused on everyday conversation and grammar</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".5px", margin: "14px 0 10px" }}>Generated outline — 6 units</div>
                  <div className="course-gen-row"><span className="cg-num">1</span><div><div className="cg-title">Greetings & Introductions</div><div className="cg-sub">3 segments · vocabulary + dialogue</div></div><span className="cg-check">✓</span></div>
                  <div className="course-gen-row"><span className="cg-num">2</span><div><div className="cg-title">Daily Routines — Presente</div><div className="cg-sub">3 segments · grammar focus</div></div><span className="cg-check">✓</span></div>
                  <div className="course-gen-row" style={{ opacity: .6 }}><span className="cg-num" style={{ background: "var(--bg)", color: "var(--text-muted)" }}>3</span><div><div className="cg-title">Food & Restaurants</div><div className="cg-sub">generating…</div></div><div className="cg-spinner" /></div>
                  <div className="course-gen-row" style={{ opacity: .3 }}><span className="cg-num" style={{ background: "var(--bg)", color: "var(--text-muted)" }}>4</span><div><div className="cg-title">Shopping & Prices</div><div className="cg-sub">queued</div></div></div>
                  <div style={{ background: "var(--primary)", color: "#fff", borderRadius: "var(--r)", padding: 12, textAlign: "center", fontSize: 13, fontWeight: 700, marginTop: 16 }}>★ Generate All Units</div>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 20, paddingTop: 8 }}>
                {[
                  { icon: "📚", bg: "#EEF0FE", title: "Full course in minutes", body: "Describe your course — level, audience, topic — and AI builds a complete outline with units, segments, slides, and exercises." },
                  { icon: "🔄", bg: "#fef3c7", title: "Edit the outline first", body: "Review and adjust the AI-generated unit outline before generating content — add, remove, or reorder units freely." },
                  { icon: "⚡", bg: "#dcfce7", title: "Parallel generation", body: "All units generate in parallel. A 6-unit course with slides, tasks, and tests is ready in under 2 minutes." },
                  { icon: "🎯", bg: "#e0f2fe", title: "Always teacher-reviewed", body: "Generated content is a head start — every slide, exercise, and test question is editable before publishing to students." },
                ].map((p) => (
                  <div className="ai-point" key={p.title}>
                    <div className="ai-point-icon" style={{ background: p.bg }}>{p.icon}</div>
                    <div>
                      <div className="ai-point-title">{p.title}</div>
                      <div className="ai-point-body">{p.body}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── STATS BAND ── */}
      <div className="stats-band">
        <div className="stats-band-inner">
          <div><div className="stat-num">12+</div><div className="stat-label">Exercise types</div></div>
          <div><div className="stat-num">3 min</div><div className="stat-label">Avg. lesson generation time</div></div>
          <div><div className="stat-num">100%</div><div className="stat-label">Auto-graded tests</div></div>
          <div><div className="stat-num">∞</div><div className="stat-label">Students per classroom</div></div>
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
                  <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 16, marginBottom: 16 }}>My Courses</div>
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
                    <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 15 }}>Italian A1 — Group 3</div>
                    <div style={{ background: "#dcfce7", color: "#166534", fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 99 }}>● Live</div>
                  </div>
                  <div style={{ background: "var(--tint)", borderRadius: 10, padding: "12px 16px", marginBottom: 16, textAlign: "center" }}>
                    <div style={{ fontSize: 11, color: "var(--primary-dk)", fontWeight: 600, marginBottom: 4 }}>Join code</div>
                    <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 26, fontWeight: 800, color: "var(--primary)", letterSpacing: 4 }}>A1-4892</div>
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
                      <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 24, fontWeight: 800, color: "var(--primary)" }}>84%</div>
                      <div style={{ fontSize: 11, color: "var(--primary-dk)" }}>Avg. score</div>
                    </div>
                    <div style={{ background: "#dcfce7", borderRadius: 10, padding: 12, textAlign: "center" }}>
                      <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 24, fontWeight: 800, color: "#166534" }}>91%</div>
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

      {/* ── TESTIMONIALS ── */}
      <section>
        <div className="section-label">What teachers say</div>
        <h2>Built for language<br /><em>educators, by educators</em></h2>
        <div className="testi-grid">
          {[
            { initials: "SM", bg: "#6C6FEF", name: "Silvia M.", role: "Italian teacher, Milan", text: "I used to spend entire Sundays preparing lesson materials. Now I describe the topic, tweak the AI output, and I'm done in 20 minutes. My students love the interactive exercises." },
            { initials: "LP", bg: "#10b981", name: "Lorenzo P.", role: "Language school director, Rome", text: "The live classroom mode changed how I teach. I can see in real time who is stuck on slide 4 and who has already finished the test. No more guessing." },
            { initials: "CF", bg: "#f59e0b", name: "Chiara F.", role: "Private tutor, Florence", text: "The analytics panel is genuinely useful. I identified that 60% of my class was struggling with subjunctive before anyone told me — the data just showed it." },
          ].map((t) => (
            <div className="testi-card" key={t.name}>
              <div className="testi-stars">★★★★★</div>
              <p className="testi-text">"{t.text}"</p>
              <div className="testi-author">
                <div className="avatar" style={{ background: t.bg, width: 36, height: 36, fontSize: 13 }}>{t.initials}</div>
                <div><div className="testi-name">{t.name}</div><div className="testi-role">{t.role}</div></div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── PRICING ── */}
      <section id="pricing">
        <div className="section-label">Pricing</div>
        <h2>Simple, transparent<br /><em>pricing</em></h2>
        <p className="section-sub">Start for free. Upgrade when you're ready. No hidden fees.</p>
        <div className="pricing-grid">
          {/* Free */}
          <div className="price-card">
            <div className="price-name">Free</div>
            <div className="price-val">€0</div>
            <div className="price-per">forever free</div>
            <hr className="price-divider" />
            <div className="price-feature"><div className="check">✓</div> 1 course, 3 units</div>
            <div className="price-feature"><div className="check">✓</div> Up to 15 students</div>
            <div className="price-feature"><div className="check">✓</div> 5 AI generations / month</div>
            <div className="price-feature"><div className="check">✓</div> Basic analytics</div>
            <div className="price-cta">
              <Link to="/register" className="btn-ghost" style={{ display: "block", textAlign: "center", padding: "13px 24px", fontSize: 15, fontWeight: 700, textDecoration: "none", color: "var(--text-sub)", border: "1px solid var(--border)", borderRadius: "var(--r)" }}>Get started</Link>
            </div>
          </div>
          {/* Pro - featured */}
          <div className="price-card featured">
            <div style={{ display: "inline-block", background: "rgba(255,255,255,.2)", color: "#fff", fontSize: 11, fontWeight: 700, padding: "3px 12px", borderRadius: 99, marginBottom: 12, letterSpacing: ".5px" }}>MOST POPULAR</div>
            <div className="price-name">Pro</div>
            <div className="price-val">€19</div>
            <div className="price-per">per month, billed monthly</div>
            <hr className="price-divider" />
            <div className="price-feature"><div className="check">✓</div> Unlimited courses & units</div>
            <div className="price-feature"><div className="check">✓</div> Unlimited students</div>
            <div className="price-feature"><div className="check">✓</div> Unlimited AI generations</div>
            <div className="price-feature"><div className="check">✓</div> Full analytics dashboard</div>
            <div className="price-feature"><div className="check">✓</div> Homework & self-study mode</div>
            <div className="price-feature"><div className="check">✓</div> Priority support</div>
            <div className="price-cta">
              <Link to="/register" style={{ display: "block", background: "#fff", color: "var(--primary-dk)", borderRadius: "var(--r)", padding: "13px 24px", fontSize: 15, fontWeight: 700, textDecoration: "none", textAlign: "center" }}>Start free trial</Link>
            </div>
          </div>
          {/* School */}
          <div className="price-card">
            <div className="price-name">School</div>
            <div className="price-val">€49</div>
            <div className="price-per">per month · up to 10 teachers</div>
            <hr className="price-divider" />
            <div className="price-feature"><div className="check">✓</div> Everything in Pro</div>
            <div className="price-feature"><div className="check">✓</div> Team management</div>
            <div className="price-feature"><div className="check">✓</div> Shared course library</div>
            <div className="price-feature"><div className="check">✓</div> School-wide analytics</div>
            <div className="price-feature"><div className="check">✓</div> Dedicated onboarding</div>
            <div className="price-cta">
              <Link to="/register" className="btn-ghost" style={{ display: "block", textAlign: "center", padding: "13px 24px", fontSize: 15, fontWeight: 700, textDecoration: "none", color: "var(--text-sub)", border: "1px solid var(--border)", borderRadius: "var(--r)" }}>Contact us</Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <div className="cta-section">
        <div className="cta-inner">
          <div className="section-label" style={{ textAlign: "center" }}>Ready to start?</div>
          <h2>Join teachers already<br /><em>saving hours every week</em></h2>
          <p>Create your free account in 60 seconds. No credit card required.</p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <Link to="/register" className="btn-primary">Get started free →</Link>
            <Link to="/login" className="btn-ghost">Sign in</Link>
          </div>
        </div>
      </div>

      {/* ── FOOTER ── */}
      <footer>
        <LogoSVG width={120} height={30} />
        <div className="footer-links">
          <a href="#">Privacy</a>
          <a href="#">Terms</a>
          <a href="#">Support</a>
          <a href="#">Contact</a>
        </div>
        <div className="footer-copy">© {new Date().getFullYear()} LinguAI. All rights reserved.</div>
      </footer>
    </>
  );
}