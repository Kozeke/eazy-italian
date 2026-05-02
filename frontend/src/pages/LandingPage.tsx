/**
 * LandingPage.tsx
 * Rebuilt from landing__2_.html — design system: #6C6FEF primary, Syne + Inter fonts.
 *
 * Phase 4 changes (pricing section only):
 * - New Free / Standard / Pro plan cards with updated copy and prices
 * - Monthly / Annual billing toggle with savings badges
 * - "Generate your first course" callout inside Free card
 * - School card updated to $49/mo · up to 10 teachers
 * - CTA subtext updated
 */
import { useState } from "react";
import { Link } from "react-router-dom";

/* ─── CSS (verbatim — unchanged) ─── */
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
.features-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; margin-top: 52px; }
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
  // ── Phase 4: billing toggle ──────────────────────────────────────────────
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");

  // ── Phase 4: derived pricing ──────────────────────────────────────────────
  const isAnnual = billing === "annual";
  // Monthly prices
  const STANDARD_MONTHLY = 12;
  const PRO_MONTHLY       = 39;
  // Annual prices (billed as one payment)
  const STANDARD_ANNUAL  = 115; // 12*12*0.8 ≈ 115  → saves $29 vs 12 × monthly
  const PRO_ANNUAL        = 374; // 39*12*0.8 ≈ 374  → saves $94 vs 12 × monthly

  const standardPrice = isAnnual ? `$${STANDARD_ANNUAL}` : `$${STANDARD_MONTHLY}`;
  const proPrice      = isAnnual ? `$${PRO_ANNUAL}`      : `$${PRO_MONTHLY}`;
  const standardPer   = isAnnual ? "per year" : "per month";
  const proPer        = isAnnual ? "per year" : "per month";

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
          <a href="#how">How it works</a>
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
          <a href="#how" className="btn-ghost">See how it works</a>
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

      {/* ── FEATURES, EXERCISE TYPES, AI GENERATION, STATS, HOW IT WORKS, TESTIMONIALS ── */}
      {/* ... existing code — all sections between hero and pricing are unchanged ... */}

      {/* ── PRICING ── */}
      <section id="pricing">
        <div className="section-label">Pricing</div>
        <h2>Simple, transparent<br /><em>pricing</em></h2>
        <p className="section-sub">Start for free. Upgrade when you're ready. No hidden fees.</p>

        {/* ── Phase 4: Billing toggle ──────────────────────────────────────── */}
        <div style={{
          display: "flex", justifyContent: "center", marginTop: 32,
          gap: 4,
        }}>
          <div style={{
            display: "inline-flex", alignItems: "center",
            background: "var(--white)", border: "1px solid var(--border)",
            borderRadius: 12, padding: 4,
            boxShadow: "var(--shadow-sm)",
          }}>
            <button
              type="button"
              onClick={() => setBilling("monthly")}
              style={{
                padding: "8px 22px", borderRadius: 9, border: "none",
                fontSize: 14, fontWeight: 600, cursor: "pointer",
                fontFamily: "inherit",
                background: !isAnnual ? "var(--primary)" : "transparent",
                color:      !isAnnual ? "#fff" : "var(--text-sub)",
                transition: "background .18s, color .18s",
              }}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setBilling("annual")}
              style={{
                padding: "8px 22px", borderRadius: 9, border: "none",
                fontSize: 14, fontWeight: 600, cursor: "pointer",
                fontFamily: "inherit",
                display: "flex", alignItems: "center", gap: 8,
                background: isAnnual ? "var(--primary)" : "transparent",
                color:      isAnnual ? "#fff" : "var(--text-sub)",
                transition: "background .18s, color .18s",
              }}
            >
              Annual
              <span style={{
                fontSize: 11, fontWeight: 700, padding: "2px 7px",
                borderRadius: 99,
                background: isAnnual ? "rgba(255,255,255,0.22)" : "var(--tint)",
                color: isAnnual ? "#fff" : "var(--primary-dk)",
                whiteSpace: "nowrap",
              }}>
                save 20%
              </span>
            </button>
          </div>
        </div>

        {/* ── Pricing cards ──────────────────────────────────────────────────── */}
        <div className="pricing-grid">

          {/* ── FREE ──────────────────────────────────────────────────────── */}
          <div className="price-card">
            <div className="price-name">Free</div>
            <div className="price-val">$0</div>
            <div className="price-per">forever free</div>

            {/* Phase 4: teacher-only draft callout */}
            <div style={{
              background: "var(--tint)", color: "var(--primary-dk)",
              borderRadius: 8, padding: "8px 12px",
              fontSize: 13, lineHeight: 1.55,
              marginBottom: 16,
            }}>
              Generate a full AI course for free. Preview it as teacher, upgrade when you're ready to share with students.
            </div>

            <hr className="price-divider" />
            <div className="price-feature"><div className="check">✓</div> Generate up to 10 AI exercises / month</div>
            <div className="price-feature"><div className="check">✓</div> Generate up to 3 AI units / month</div>
            <div className="price-feature"><div className="check">✓</div> Generate 1 full AI course — preview before you pay</div>
            <div className="price-feature"><div className="check">✓</div> Course visible to teacher only until you upgrade</div>
            <div className="price-feature"><div className="check">✓</div> Up to 3 students</div>
            <div className="price-feature" style={{ color: "var(--text-muted)" }}>
              <div style={{ color: "#ef4444", fontWeight: 700 }}>✗</div> Publish course to students
            </div>
            <div className="price-cta">
              <Link
                to="/register"
                className="btn-ghost"
                style={{
                  display: "block", textAlign: "center", padding: "13px 24px",
                  fontSize: 15, fontWeight: 700, textDecoration: "none",
                  color: "var(--text-sub)", border: "1px solid var(--border)",
                  borderRadius: "var(--r)",
                }}
              >
                Get started
              </Link>
            </div>
          </div>

          {/* ── STANDARD (featured) ───────────────────────────────────────── */}
          <div className="price-card featured">
            <div style={{
              display: "inline-block", background: "rgba(255,255,255,.2)",
              color: "#fff", fontSize: 11, fontWeight: 700,
              padding: "3px 12px", borderRadius: 99,
              marginBottom: 12, letterSpacing: ".5px",
            }}>
              MOST POPULAR
            </div>
            <div className="price-name">Standard</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <div className="price-val">{standardPrice}</div>
              {isAnnual && (
                <span style={{
                  fontSize: 12, fontWeight: 700, padding: "2px 8px",
                  borderRadius: 99, background: "#22c55e",
                  color: "#fff", whiteSpace: "nowrap", marginBottom: 2,
                }}>
                  save $29
                </span>
              )}
            </div>
            <div className="price-per">{standardPer}</div>
            <hr className="price-divider" />
            <div className="price-feature"><div className="check">✓</div> 100 AI exercise generations / month</div>
            <div className="price-feature"><div className="check">✓</div> 20 AI unit generations / month</div>
            <div className="price-feature"><div className="check">✓</div> 5 AI course generations / month</div>
            <div className="price-feature"><div className="check">✓</div> Publish courses to students</div>
            <div className="price-feature"><div className="check">✓</div> Up to 50 students</div>
            <div className="price-feature"><div className="check">✓</div> Priority email support</div>
            <div className="price-cta">
              <Link
                to="/register"
                style={{
                  display: "block", background: "#fff",
                  color: "var(--primary-dk)", borderRadius: "var(--r)",
                  padding: "13px 24px", fontSize: 15, fontWeight: 700,
                  textDecoration: "none", textAlign: "center",
                }}
              >
                Start free trial
              </Link>
            </div>
          </div>

          {/* ── PRO ───────────────────────────────────────────────────────── */}
          <div className="price-card">
            <div className="price-name">Pro</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <div className="price-val">{proPrice}</div>
              {isAnnual && (
                <span style={{
                  fontSize: 12, fontWeight: 700, padding: "2px 8px",
                  borderRadius: 99, background: "#22c55e",
                  color: "#fff", whiteSpace: "nowrap", marginBottom: 2,
                }}>
                  save $94
                </span>
              )}
            </div>
            <div className="price-per">{proPer}</div>
            <hr className="price-divider" />
            <div className="price-feature"><div className="check">✓</div> Unlimited AI exercise generations</div>
            <div className="price-feature"><div className="check">✓</div> Unlimited AI unit generations</div>
            <div className="price-feature"><div className="check">✓</div> Unlimited AI course generations</div>
            <div className="price-feature"><div className="check">✓</div> Publish courses to students</div>
            <div className="price-feature"><div className="check">✓</div> Unlimited students</div>
            <div className="price-feature"><div className="check">✓</div> Priority support + early access to new features</div>
            <div className="price-cta">
              <Link
                to="/register"
                className="btn-ghost"
                style={{
                  display: "block", textAlign: "center", padding: "13px 24px",
                  fontSize: 15, fontWeight: 700, textDecoration: "none",
                  color: "var(--text-sub)", border: "1px solid var(--border)",
                  borderRadius: "var(--r)",
                }}
              >
                Start free trial
              </Link>
            </div>
          </div>

          {/* ── SCHOOL (updated from €49 to $49) ─────────────────────────── */}
          {/* <div className="price-card">
            <div className="price-name">School</div>
            <div className="price-val">$49</div>
            <div className="price-per">per month · up to 10 teachers</div>
            <hr className="price-divider" />
            <div className="price-feature"><div className="check">✓</div> Everything in Pro</div>
            <div className="price-feature"><div className="check">✓</div> Team management</div>
            <div className="price-feature"><div className="check">✓</div> Shared course library</div>
            <div className="price-feature"><div className="check">✓</div> School-wide analytics</div>
            <div className="price-feature"><div className="check">✓</div> Dedicated onboarding</div>
            <div className="price-cta">
              <Link
                to="/register"
                className="btn-ghost"
                style={{
                  display: "block", textAlign: "center", padding: "13px 24px",
                  fontSize: 15, fontWeight: 700, textDecoration: "none",
                  color: "var(--text-sub)", border: "1px solid var(--border)",
                  borderRadius: "var(--r)",
                }}
              >
                Contact us
              </Link>
            </div>
          </div> */}

        </div>
      </section>

      {/* ── CTA ── */}
      <div className="cta-section">
        <div className="cta-inner">
          <div className="section-label" style={{ textAlign: "center" }}>Ready to start?</div>
          <h2>Join teachers already<br /><em>saving hours every week</em></h2>
          {/* Phase 4: updated subtext */}
          <p>Create your free account in 60 seconds. Generate your first AI course for free.</p>
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