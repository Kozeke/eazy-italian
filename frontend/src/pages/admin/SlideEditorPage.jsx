/**
 * SlideEditorPage.jsx — Self-contained slide editor
 *
 * Matches the design in Image 1:
 *   • Dark navy topbar  with DRAFT badge, Edit/Preview toggle,
 *     ← Back button, blue "Save to Course" gradient CTA
 *   • Warm-beige canvas background
 *   • White left navigator + right settings sidebar
 *   • Slide thumbnail strip, full edit canvas, settings panel
 *
 * NO dependency on ReviewSlidesPage / ReviewStyles.
 * All styles are self-contained in the CSS string below.
 *
 * ── Usage ────────────────────────────────────────────────────────────────
 *
 * Basic (from onboarding / build screen):
 *   <SlideEditorPage
 *     slides={content.slides}        // [{ id, title, bullets, image_url, … }]
 *     title="future continuous"
 *     meta="4 slides · English · Professional"
 *     onSave={(editedSlides) => …}   // called with updated slides array
 *     onBack={() => …}
 *   />
 *
 * Lesson mode (adds objective bar + last-lesson card):
 *   <SlideEditorPage
 *     slides={content.slides}
 *     title={lesson.title}
 *     meta={`${slides.length} slides · ${courseData.subject}`}
 *     onSave={(editedSlides) => …}
 *     onBack={() => …}
 *     lessonCtx={{
 *       title:        lesson.title,
 *       objective:    lesson.objective,
 *       moduleTitle:  lesson.moduleTitle,
 *       lessonIndex:  allLessons.indexOf(lesson),   // 0-based
 *       totalLessons: allLessons.length,
 *     }}
 *   />
 */

import { useState, useRef, useEffect, useCallback } from "react";

/* ─── Design tokens ──────────────────────────────────────────────────────── */
const C = {
  navy:     "#0F172A",
  beige:    "#F7F4EF",
  beigeD:   "#EDE9E1",
  white:    "#FFFFFF",
  border:   "#E2DDD6",
  border2:  "#C9C4BC",
  ink:      "#1C1917",
  k2:       "#292524",
  k3:       "#57534E",
  k4:       "#A8A29E",
  blue:     "#3B82F6",
  blueD:    "#2563EB",
  blueBg:   "#EFF6FF",
  indigo:   "#6366F1",
  green:    "#16A34A",
  greenBg:  "#F0FDF4",
  red:      "#DC2626",
  redBg:    "#FEF2F2",
  purple:   "#7C3AED",
  purpleBg: "#F5F3FF",
};

/* ─── Scoped CSS ─────────────────────────────────────────────────────────── */
const CSS = `
  .sep-root *, .sep-root *::before, .sep-root *::after { box-sizing: border-box; margin: 0; padding: 0; }

  .sep-root {
    position: fixed; inset: 0; z-index: 200;
    display: flex; flex-direction: column;
    background: ${C.beige};
    font-family: 'Plus Jakarta Sans', 'Inter', system-ui, sans-serif;
    color: ${C.ink}; overflow: hidden;
  }

  /* ── TOPBAR ── */
  .sep-top {
    display: flex; align-items: center; gap: 12px;
    padding: 0 20px; height: 52px; flex-shrink: 0;
    background: ${C.navy}; border-bottom: 1px solid rgba(255,255,255,.07);
  }
  .sep-badge {
    padding: 2px 9px; border-radius: 20px; flex-shrink: 0;
    font-size: 10px; font-weight: 800; letter-spacing: .07em; text-transform: uppercase;
    background: rgba(245,158,11,.18); border: 1px solid rgba(245,158,11,.38); color: #FCD34D;
  }
  .sep-top-title { font-size: 14px; font-weight: 700; color: rgba(255,255,255,.9); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sep-top-meta  { font-size: 12px; color: rgba(255,255,255,.45); white-space: nowrap; flex-shrink: 0; }
  .sep-spacer    { flex: 1; }
  .sep-mode-toggle { display: flex; border-radius: 7px; border: 1px solid rgba(255,255,255,.18); overflow: hidden; flex-shrink: 0; }
  .sep-mode-btn  { padding: 5px 14px; font-size: 12px; font-weight: 600; border: none; background: transparent; color: rgba(255,255,255,.5); cursor: pointer; transition: all .14s; font-family: inherit; }
  .sep-mode-btn--on { background: ${C.blue}; color: #fff; }
  .sep-mode-btn:not(.sep-mode-btn--on):hover { background: rgba(255,255,255,.1); color: rgba(255,255,255,.85); }
  .sep-ghost {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 6px 14px; border-radius: 7px; flex-shrink: 0;
    border: 1px solid rgba(255,255,255,.22); background: transparent;
    font-size: 13px; font-weight: 600; color: rgba(255,255,255,.75);
    cursor: pointer; transition: all .14s; font-family: inherit; white-space: nowrap;
  }
  .sep-ghost:hover { background: rgba(255,255,255,.1); color: #fff; border-color: rgba(255,255,255,.38); }
  .sep-save {
    display: inline-flex; align-items: center; gap: 7px;
    padding: 7px 18px; border-radius: 8px; border: none; flex-shrink: 0;
    background: linear-gradient(135deg, ${C.blue}, ${C.indigo});
    color: #fff; font-size: 13px; font-weight: 700;
    cursor: pointer; transition: all .16s; font-family: inherit;
    box-shadow: 0 4px 14px rgba(99,102,241,.45); white-space: nowrap;
  }
  .sep-save:hover { background: linear-gradient(135deg,${C.blueD},#4F46E5); transform: translateY(-1px); box-shadow: 0 6px 20px rgba(99,102,241,.55); }
  .sep-save:active { transform: translateY(0); }
  .sep-save--done { background: linear-gradient(135deg,${C.green},#059669) !important; box-shadow: 0 4px 14px rgba(22,163,74,.4) !important; }

  /* ── SUBBAR ── */
  .sep-sub {
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    padding: 0 20px; height: 36px; flex-shrink: 0;
    background: ${C.white}; border-bottom: 1px solid ${C.border};
  }
  .sep-sub-l { display: flex; align-items: center; gap: 10px; }
  .sep-sub-lbl { font-size: 12px; font-weight: 700; color: ${C.k3}; white-space: nowrap; }
  .sep-prog-track { position: relative; width: 160px; height: 5px; background: ${C.border}; border-radius: 3px; overflow: hidden; }
  .sep-prog-fill  { position: absolute; left:0; top:0; height: 100%; background: ${C.blue}; border-radius: 3px; transition: width .22s cubic-bezier(.4,0,.2,1); }
  .sep-kbd  { font-size: 11px; color: ${C.k4}; white-space: nowrap; }
  .sep-kbd kbd { display: inline-flex; align-items: center; padding: 1px 5px; border-radius: 4px; border: 1px solid ${C.border2}; background: ${C.white}; font-size: 10px; font-weight: 600; color: ${C.k3}; font-family: inherit; box-shadow: 0 1px 0 ${C.border2}; }

  /* ── OBJ BAR ── */
  .sep-obj { display: flex; align-items: center; gap: 8px; padding: 6px 20px; flex-shrink: 0; background: rgba(22,163,74,.07); border-bottom: 1px solid rgba(22,163,74,.18); font-size: 12px; }
  .sep-obj-lbl { font-size: 10px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: ${C.green}; flex-shrink: 0; }

  /* ── BODY ── */
  .sep-body { display: grid; grid-template-columns: 192px 1fr 272px; flex: 1; min-height: 0; overflow: hidden; }
  @media (max-width: 1100px) { .sep-body { grid-template-columns: 172px 1fr 252px; } }
  @media (max-width: 860px)  { .sep-body { grid-template-columns: 172px 1fr; } .sep-sidebar { display: none; } }

  /* ── NAVIGATOR ── */
  .sep-nav { background: ${C.white}; border-right: 1px solid ${C.border}; display: flex; flex-direction: column; overflow: hidden; }
  .sep-nav-hd { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px 8px; border-bottom: 1px solid ${C.border}; flex-shrink: 0; }
  .sep-nav-lbl { font-size: 10px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; color: ${C.k4}; }
  .sep-nav-add { width: 26px; height: 26px; border-radius: 6px; cursor: pointer; border: 1.5px solid ${C.border}; background: transparent; display: flex; align-items: center; justify-content: center; color: ${C.k4}; transition: all .14s; font-size: 16px; }
  .sep-nav-add:hover { border-color: ${C.blue}; color: ${C.blue}; background: ${C.blueBg}; }
  .sep-nav-list { list-style: none; flex: 1; overflow-y: auto; padding: 8px 8px 4px; display: flex; flex-direction: column; gap: 4px; }
  .sep-nav-list::-webkit-scrollbar { width: 4px; }
  .sep-nav-list::-webkit-scrollbar-thumb { background: ${C.border2}; border-radius: 2px; }
  .sep-thumb { border-radius: 9px; cursor: pointer; position: relative; border: 2px solid transparent; transition: border-color .14s, box-shadow .14s; user-select: none; }
  .sep-thumb:hover { border-color: ${C.border2}; box-shadow: 0 2px 8px rgba(0,0,0,.08); }
  .sep-thumb--on { border-color: ${C.blue} !important; box-shadow: 0 0 0 3px rgba(59,130,246,.12) !important; }
  .sep-thumb-c { padding: 9px 11px 10px; border-radius: 7px; overflow: hidden; min-height: 68px; display: flex; flex-direction: column; gap: 5px; background: ${C.beigeD}; border-top: 3px solid ${C.border2}; }
  .sep-thumb--on .sep-thumb-c { border-top-color: ${C.blue}; }
  .sep-thumb-n { font-size: 9px; font-weight: 800; letter-spacing: .1em; color: ${C.k4}; }
  .sep-thumb--on .sep-thumb-n { color: ${C.blue}; }
  .sep-thumb-t { font-size: 10px; font-weight: 700; color: ${C.k2}; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .sep-thumb-ls { display: flex; flex-direction: column; gap: 3px; margin-top: 2px; }
  .sep-thumb-l  { height: 2px; border-radius: 2px; background: ${C.k4}; opacity: .22; }
  .sep-thumb-acts { position: absolute; top: 4px; right: 4px; display: flex; gap: 3px; opacity: 0; transition: opacity .12s; z-index: 2; }
  .sep-thumb:hover .sep-thumb-acts { opacity: 1; }
  .sep-tact { width: 20px; height: 20px; border-radius: 4px; border: none; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: background .12s; font-size: 10px; background: rgba(255,255,255,.85); color: ${C.k3}; }
  .sep-tact:hover { background: ${C.blue}; color: #fff; }
  .sep-tact--del:hover { background: ${C.red}; color: #fff; }
  .sep-tact:disabled { opacity: .3; cursor: default; }
  .sep-nav-foot { display: flex; align-items: center; justify-content: center; gap: 6px; margin: 6px 8px 10px; padding: 7px; border-radius: 7px; flex-shrink: 0; border: 1.5px dashed ${C.border2}; background: transparent; font-size: 12px; font-weight: 600; color: ${C.k4}; cursor: pointer; transition: all .14s; font-family: inherit; }
  .sep-nav-foot:hover { border-color: ${C.blue}; color: ${C.blue}; background: ${C.blueBg}; }
  .sep-nav-hint { padding: 6px 14px 10px; font-size: 9px; font-weight: 600; color: ${C.k4}; text-align: center; letter-spacing: .04em; border-top: 1px solid ${C.border}; flex-shrink: 0; }

  /* ── CENTER ── */
  .sep-center { overflow-y: auto; background: ${C.beige}; display: flex; flex-direction: column; }
  .sep-center::-webkit-scrollbar { width: 5px; }
  .sep-center::-webkit-scrollbar-thumb { background: ${C.border2}; border-radius: 3px; }

  .sep-toolbar { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; padding: 7px 20px; background: ${C.white}; border-bottom: 1px solid ${C.border}; position: sticky; top: 0; z-index: 20; flex-shrink: 0; }
  .sep-tpos { font-size: 12px; font-weight: 600; color: ${C.k4}; min-width: 40px; text-align: center; }
  .sep-tsep { width: 1px; height: 18px; background: ${C.border}; margin: 0 2px; flex-shrink: 0; }
  .sep-tbtn { display: inline-flex; align-items: center; gap: 5px; padding: 5px 11px; border-radius: 6px; border: 1.5px solid ${C.border}; background: transparent; cursor: pointer; font-size: 12px; font-weight: 500; color: ${C.k2}; transition: all .13s; font-family: inherit; white-space: nowrap; }
  .sep-tbtn:hover:not(:disabled) { border-color: ${C.blue}; color: ${C.blue}; background: ${C.blueBg}; }
  .sep-tbtn:disabled { opacity: .35; cursor: default; }
  .sep-tbtn--dup:hover:not(:disabled) { border-color: ${C.purple}; color: ${C.purple}; background: ${C.purpleBg}; }
  .sep-tbtn--del:hover:not(:disabled) { border-color: ${C.red}; color: ${C.red}; background: ${C.redBg}; }

  .sep-scroll { flex: 1; padding: 24px 28px 40px; overflow-y: auto; }

  .sep-canvas {
    border-radius: 16px; padding: 28px 30px 32px;
    display: flex; flex-direction: column; gap: 20px;
    background: ${C.beigeD}; border-top: 5px solid ${C.border2};
    box-shadow: 0 6px 32px rgba(0,0,0,.10), 0 1px 4px rgba(0,0,0,.06);
    position: relative; min-height: 380px;
    animation: sep-fi .22s both;
  }
  @keyframes sep-fi { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:none; } }

  .sep-canvas-num { font-size: 11px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; color: ${C.k4}; }
  .sep-chip { display: inline-flex; align-items: center; gap: 5px; padding: 3px 10px; border-radius: 20px; font-size: 10px; font-weight: 700; letter-spacing: .05em; background: rgba(22,163,74,.12); color: ${C.green}; border: 1px solid rgba(22,163,74,.22); }

  .sep-img-empty { height: 110px; border-radius: 10px; border: 2px dashed ${C.border2}; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; }
  .sep-img-photo { width: 100%; max-height: 200px; object-fit: cover; border-radius: 10px; display: block; }
  .sep-img-actions { display: flex; gap: 8px; flex-wrap: wrap; }
  .sep-img-btn { display: inline-flex; align-items: center; gap: 5px; padding: 5px 12px; border-radius: 7px; border: 1.5px solid ${C.border}; background: transparent; font-size: 12px; font-weight: 600; color: ${C.k3}; cursor: pointer; transition: all .13s; font-family: inherit; }
  .sep-img-btn:hover { border-color: ${C.purple}; color: ${C.purple}; background: ${C.purpleBg}; }
  .sep-img-btn--del:hover { border-color: ${C.red}; color: ${C.red}; background: ${C.redBg}; }

  .sep-field { display: flex; flex-direction: column; gap: 6px; }
  .sep-flbl { font-size: 10px; font-weight: 800; letter-spacing: .09em; text-transform: uppercase; color: ${C.k4}; }
  .sep-title-ta { width: 100%; resize: none; overflow: hidden; font-family: 'Plus Jakarta Sans', system-ui, sans-serif; font-size: 24px; font-weight: 700; line-height: 1.3; color: ${C.ink}; background: rgba(0,0,0,.03); border: 2px solid transparent; border-radius: 8px; padding: 6px 8px; outline: none; transition: background .14s, border-color .14s; caret-color: ${C.blue}; }
  .sep-title-ta:focus { background: rgba(0,0,0,.05); border-color: rgba(0,0,0,.10); }
  .sep-title-ta::placeholder { opacity: .28; }

  .sep-blist { display: flex; flex-direction: column; gap: 3px; }
  .sep-brow  { display: flex; align-items: flex-start; gap: 8px; padding: 2px 0; border-radius: 6px; }
  .sep-bdot  { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; margin-top: 11px; background: ${C.k3}; }
  .sep-bta   { flex: 1; resize: none; overflow: hidden; font-size: 15px; line-height: 1.55; font-family: inherit; color: ${C.k2}; background: rgba(0,0,0,.02); border: 1.5px solid transparent; border-radius: 6px; padding: 4px 8px; outline: none; transition: background .12s, border-color .12s; caret-color: ${C.blue}; }
  .sep-bta:focus { background: rgba(0,0,0,.05); border-color: rgba(0,0,0,.09); }
  .sep-bta::placeholder { opacity: .3; }
  .sep-bdel  { width: 24px; height: 24px; border-radius: 5px; border: none; background: transparent; cursor: pointer; color: ${C.k4}; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 5px; opacity: 0; transition: all .12s; font-size: 11px; }
  .sep-brow:hover .sep-bdel { opacity: 1; }
  .sep-bdel:hover { background: ${C.redBg}; color: ${C.red}; }
  .sep-badd  { display: inline-flex; align-items: center; gap: 5px; margin-top: 4px; padding: 5px 8px; border-radius: 6px; border: none; background: transparent; cursor: pointer; font-size: 12px; font-weight: 600; color: ${C.blue}; font-family: inherit; transition: background .12s; }
  .sep-badd:hover { background: ${C.blueBg}; }

  .sep-box     { padding: 12px 14px; border-left: 3px solid ${C.border2}; border-radius: 0 8px 8px 0; background: rgba(0,0,0,.04); }
  .sep-box-lbl { font-size: 11px; font-weight: 700; color: ${C.k4}; display: block; margin-bottom: 5px; }
  .sep-box-ta  { width: 100%; resize: none; overflow: hidden; background: rgba(255,255,255,.5); border: 1.5px solid ${C.border}; border-radius: 6px; padding: 5px 8px; font-size: 13px; line-height: 1.5; outline: none; font-family: inherit; color: ${C.k2}; transition: border-color .13s; }
  .sep-box-ta:focus { border-color: ${C.blue}; }
  .sep-notes     { background: rgba(0,0,0,.05); border-radius: 8px; padding: 10px 12px; }
  .sep-notes-lbl { font-size: 11px; font-weight: 700; color: ${C.k4}; display: block; margin-bottom: 4px; }
  .sep-notes-ta  { width: 100%; resize: none; overflow: hidden; background: rgba(255,255,255,.45); border: 1.5px solid ${C.border}; border-radius: 6px; padding: 5px 8px; font-size: 12px; line-height: 1.5; color: ${C.k3}; outline: none; font-family: inherit; }
  .sep-notes-ta:focus { border-color: ${C.blue}; }

  /* ── PREVIEW ── */
  .sep-prev-chrome { padding: 8px 20px; background: ${C.white}; border-bottom: 1px solid ${C.border}; display: flex; align-items: center; gap: 10px; font-size: 12px; color: ${C.k3}; position: sticky; top: 0; z-index: 20; flex-shrink: 0; }
  .sep-prev-badge { font-weight: 700; color: ${C.k2}; }
  .sep-prev-obj { margin-left: auto; font-size: 11px; font-weight: 700; color: ${C.green}; background: rgba(22,163,74,.1); border: 1px solid rgba(22,163,74,.22); border-radius: 20px; padding: 2px 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 260px; }
  .sep-prev-card { margin: 24px 28px 40px; border-radius: 16px; padding: 36px 36px 40px; display: flex; flex-direction: column; gap: 22px; background: ${C.beigeD}; border-top: 6px solid ${C.border2}; box-shadow: 0 6px 32px rgba(0,0,0,.10); animation: sep-fi .22s both; }
  .sep-prev-title { font-size: 28px; font-weight: 800; color: ${C.ink}; line-height: 1.25; }
  .sep-prev-blist { list-style: none; display: flex; flex-direction: column; gap: 13px; }
  .sep-prev-b { display: flex; align-items: flex-start; gap: 12px; font-size: 16px; line-height: 1.6; color: ${C.k2}; }
  .sep-prev-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; margin-top: 9px; background: ${C.border2}; }

  /* ── SIDEBAR ── */
  .sep-sidebar { background: ${C.white}; border-left: 1px solid ${C.border}; overflow-y: auto; }
  .sep-sidebar::-webkit-scrollbar { width: 4px; }
  .sep-sidebar::-webkit-scrollbar-thumb { background: ${C.border2}; border-radius: 2px; }
  .sep-sb-inner { padding: 16px; display: flex; flex-direction: column; gap: 20px; }
  .sep-sec { display: flex; flex-direction: column; gap: 8px; }
  .sep-sec-hd { font-size: 10px; font-weight: 800; letter-spacing: .09em; text-transform: uppercase; color: ${C.k4}; margin-bottom: 2px; }
  .sep-info-r { display: flex; justify-content: space-between; font-size: 12px; }
  .sep-info-l { color: ${C.k3}; }
  .sep-info-v { font-weight: 600; color: ${C.ink}; }

  .sep-itgrid { display: grid; grid-template-columns: repeat(3,1fr); gap: 5px; }
  .sep-itbtn  { display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 8px 4px; border-radius: 7px; border: 1.5px solid ${C.border}; background: transparent; cursor: pointer; transition: all .13s; font-family: inherit; }
  .sep-itbtn:hover { border-color: ${C.blue}; background: ${C.blueBg}; }
  .sep-itbtn--on { border-color: ${C.blue}; background: ${C.blueBg}; }
  .sep-iticon { font-size: 16px; }
  .sep-itlbl  { font-size: 10px; font-weight: 600; color: ${C.k3}; }
  .sep-itbtn--on .sep-itlbl { color: ${C.blue}; }

  .sep-tog-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 8px 0; border-bottom: 1px solid ${C.border}; cursor: pointer; }
  .sep-tog-row:last-child { border-bottom: none; }
  .sep-tog-lbl  { font-size: 12px; font-weight: 600; color: ${C.k2}; }
  .sep-tog-hint { font-size: 11px; color: ${C.k4}; margin-top: 1px; }
  .sep-tog { width: 36px; height: 20px; border-radius: 10px; background: ${C.border2}; border: none; cursor: pointer; position: relative; flex-shrink: 0; transition: background .18s; }
  .sep-tog--on { background: ${C.blue}; }
  .sep-tog::after { content: ''; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.22); transition: transform .2s cubic-bezier(.34,1.56,.64,1); }
  .sep-tog--on::after { transform: translateX(16px); }

  .sep-act { display: flex; align-items: center; gap: 7px; width: 100%; padding: 8px 12px; border-radius: 7px; border: 1.5px solid ${C.border}; background: transparent; font-size: 12px; font-weight: 600; color: ${C.k2}; cursor: pointer; text-align: left; transition: all .13s; font-family: inherit; }
  .sep-act + .sep-act { margin-top: 5px; }
  .sep-act:hover:not(:disabled):not(.sep-act--dup):not(.sep-act--del) { border-color: ${C.green}; color: ${C.green}; background: ${C.greenBg}; }
  .sep-act--dup { color: ${C.purple}; border-color: rgba(124,58,237,.22); }
  .sep-act--dup:hover { border-color: ${C.purple}; background: ${C.purpleBg}; }
  .sep-act--del { color: ${C.red}; border-color: rgba(220,38,38,.25); }
  .sep-act--del:hover:not(:disabled) { border-color: ${C.red}; background: ${C.redBg}; }
  .sep-act:disabled { opacity: .38; cursor: default; }

  .sep-last { padding: 12px; border-radius: 10px; border: 1.5px solid rgba(22,163,74,.28); background: rgba(22,163,74,.05); }
  .sep-last-lbl  { font-size: 10px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: ${C.green}; margin-bottom: 6px; }
  .sep-last-text { font-size: 12px; color: ${C.k3}; line-height: 1.5; }

  /* ── FOOTER ── */
  .sep-footer { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 10px 20px; background: ${C.white}; border-top: 1px solid ${C.border}; flex-shrink: 0; }
  .sep-fnav   { display: flex; align-items: center; gap: 8px; }
  .sep-fcount { font-size: 12px; font-weight: 700; color: ${C.k3}; min-width: 52px; text-align: center; }
  .sep-fnbtn  { width: 32px; height: 32px; border-radius: 7px; border: 1.5px solid ${C.border}; background: transparent; cursor: pointer; display: flex; align-items: center; justify-content: center; color: ${C.k3}; transition: all .13s; font-size: 16px; }
  .sep-fnbtn:not(:disabled):hover { border-color: ${C.blue}; color: ${C.blue}; background: ${C.blueBg}; }
  .sep-fnbtn:disabled { opacity: .3; cursor: default; }

  /* ── TOAST ── */
  .sep-toast { position: fixed; bottom: 24px; right: 24px; z-index: 9999; background: ${C.navy}; color: #fff; padding: 10px 18px; border-radius: 12px; font-size: 13px; font-weight: 700; display: flex; align-items: center; gap: 8px; box-shadow: 0 8px 24px rgba(0,0,0,.25); animation: sep-toast .3s cubic-bezier(.22,.68,0,1.2) both; }
  @keyframes sep-toast { from { opacity:0; transform:translateY(12px) scale(.95); } to { opacity:1; transform:none; } }
`;

/* ─── Tiny helpers ───────────────────────────────────────────────────────── */
const uid  = () => Math.random().toString(36).slice(2, 9);
const grow = el => { if (!el) return; el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; };
const blank = (title = "New Slide") => ({ id: uid(), title, bullets: [""], image_url: null, exercise: null, teacher_notes: null, imageType: "auto" });

function Toggle({ on, onToggle }) {
  return <button role="switch" aria-checked={on} className={`sep-tog${on ? " sep-tog--on" : ""}`} onClick={() => onToggle(!on)} />;
}

function AutoTA({ value, onChange, className, placeholder, rows = 1 }) {
  const ref = useRef(null);
  useEffect(() => grow(ref.current), [value]);
  return (
    <textarea ref={ref} className={className} value={value || ""} placeholder={placeholder} rows={rows}
      onChange={e => { onChange(e.target.value); grow(e.target); }}
      onFocus={e => grow(e.target)} />
  );
}

function BulletList({ bullets, onChange }) {
  const refs    = useRef([]);
  const pending = useRef(null);

  useEffect(() => {
    if (pending.current !== null) {
      const el = refs.current[pending.current];
      if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
      pending.current = null;
    }
  });

  const upd = (i, v) => { const n = [...bullets]; n[i] = v; onChange(n); };
  const add = (after) => { const n = [...bullets]; n.splice(after + 1, 0, ""); onChange(n); pending.current = after + 1; };
  const del = (i) => {
    if (bullets.length <= 1) { upd(0, ""); return; }
    const n = [...bullets]; n.splice(i, 1); onChange(n); pending.current = Math.max(0, i - 1);
  };
  const kd = (e, i) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); add(i); }
    else if (e.key === "Backspace" && !bullets[i]) { e.preventDefault(); del(i); }
    else if (e.key === "ArrowUp"   && i > 0)               { e.preventDefault(); refs.current[i-1]?.focus(); }
    else if (e.key === "ArrowDown" && i < bullets.length-1) { e.preventDefault(); refs.current[i+1]?.focus(); }
  };

  return (
    <div className="sep-blist">
      {bullets.map((b, i) => (
        <div key={i} className="sep-brow">
          <span className="sep-bdot" />
          <textarea ref={el => refs.current[i] = el} className="sep-bta" value={b} placeholder="Add a bullet point…" rows={1}
            onChange={e => { upd(i, e.target.value); grow(e.target); }}
            onFocus={e => grow(e.target)}
            onKeyDown={e => kd(e, i)} aria-label={`Bullet ${i + 1}`} />
          <button className="sep-bdel" tabIndex={-1} onClick={() => del(i)}>✕</button>
        </div>
      ))}
      <button className="sep-badd" onClick={() => add(bullets.length - 1)}>
        + Add bullet point <span style={{ fontSize: 10, fontWeight: 400, opacity: .5 }}>or press Enter</span>
      </button>
    </div>
  );
}

/* ─── SlideEditorPage ────────────────────────────────────────────────────── */
export default function SlideEditorPage({
  slides:   initialSlides = [],
  title     = "Untitled",
  meta      = "",
  onSave,
  onBack,
  lessonCtx = null,
  saveLabel = "Save to Course",
}) {
  const [slides,    setSlides]    = useState(
    initialSlides.length
      ? initialSlides.map(s => ({ ...blank(), ...s }))
      : [blank("Introduction")]
  );
  const [activeIdx, setActiveIdx] = useState(0);
  const [viewMode,  setViewMode]  = useState("edit");
  const [saved,     setSaved]     = useState(false);
  const [toast,     setToast]     = useState(null);
  const fileRef = useRef(null);

  const slide = slides[activeIdx] || slides[0];
  const total = slides.length;

  /* Keyboard nav */
  useEffect(() => {
    const h = e => {
      if (e.target.tagName === "TEXTAREA" || e.target.tagName === "INPUT") return;
      if (e.key === "ArrowLeft"  && activeIdx > 0)       setActiveIdx(i => i - 1);
      if (e.key === "ArrowRight" && activeIdx < total-1) setActiveIdx(i => i + 1);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [activeIdx, total]);

  const patch       = useCallback(p => setSlides(ss => ss.map((s, i) => i === activeIdx ? { ...s, ...p } : s)), [activeIdx]);
  const addSlide    = useCallback(after => { setSlides(ss => { const n = [...ss]; n.splice(after + 1, 0, blank()); return n; }); setActiveIdx(after + 1); }, []);
  const dupSlide    = useCallback(idx   => { setSlides(ss => { const n = [...ss]; n.splice(idx + 1, 0, { ...ss[idx], id: uid() }); return n; }); setActiveIdx(idx + 1); }, []);
  const delSlide    = useCallback(idx   => { if (slides.length <= 1) return; setSlides(ss => ss.filter((_, i) => i !== idx)); setActiveIdx(Math.min(idx, slides.length - 2)); }, [slides.length]);

  const handleSave = useCallback(() => {
    onSave?.(slides);
    setSaved(true); setToast("💾 Saved successfully");
    setTimeout(() => { setSaved(false); setToast(null); }, 2400);
  }, [slides, onSave]);

  const imageTypes = [
    { id: "auto",    icon: "✨", label: "Auto"    },
    { id: "diagram", icon: "🔷", label: "Diagram" },
    { id: "chart",   icon: "📊", label: "Chart"   },
    { id: "scene",   icon: "🖼️", label: "Scene"   },
    { id: "none",    icon: "⊘",  label: "None"    },
  ];

  const isLast = lessonCtx && lessonCtx.lessonIndex === lessonCtx.totalLessons - 1;

  return (
    <>
      <style>{CSS}</style>
      <div className="sep-root">

        {/* ── Topbar ── */}
        <div className="sep-top">
          <span className="sep-badge">DRAFT</span>
          <span className="sep-top-title">{title}</span>
          {meta && <span className="sep-top-meta">{meta}</span>}
          <div className="sep-spacer" />
          <div className="sep-mode-toggle">
            <button className={`sep-mode-btn${viewMode === "edit"    ? " sep-mode-btn--on" : ""}`} onClick={() => setViewMode("edit")}>✎ Edit</button>
            <button className={`sep-mode-btn${viewMode === "preview" ? " sep-mode-btn--on" : ""}`} onClick={() => setViewMode("preview")}>▶ Preview</button>
          </div>
          <button className="sep-ghost" onClick={onBack}>← {lessonCtx ? "All Lessons" : "Back to Design"}</button>
          <button className={`sep-save${saved ? " sep-save--done" : ""}`} onClick={handleSave}>
            💾 {saved ? "Saved!" : saveLabel}
          </button>
        </div>

        {/* ── Subbar ── */}
        <div className="sep-sub">
          <div className="sep-sub-l">
            <span className="sep-sub-lbl">Slide {activeIdx + 1} / {total}</span>
            <div className="sep-prog-track"><div className="sep-prog-fill" style={{ width: `${((activeIdx + 1) / total) * 100}%` }} /></div>
          </div>
          <span className="sep-kbd"><kbd>←</kbd> <kbd>→</kbd> to navigate · <kbd>↵</kbd> to add bullet</span>
        </div>

        {/* ── Objective bar ── */}
        {lessonCtx?.objective && (
          <div className="sep-obj">
            <span style={{ fontSize: 14 }}>🎯</span>
            <span className="sep-obj-lbl">Objective</span>
            <span style={{ color: C.k2, fontSize: 12 }}>{lessonCtx.objective}</span>
          </div>
        )}

        {/* ── 3-col body ── */}
        <div className="sep-body">

          {/* Left navigator */}
          <nav className="sep-nav" aria-label="Slide list">
            <div className="sep-nav-hd">
              <span className="sep-nav-lbl">SLIDES</span>
              <button className="sep-nav-add" onClick={() => addSlide(total - 1)}>+</button>
            </div>
            <ol className="sep-nav-list">
              {slides.map((s, i) => (
                <li key={s.id} className={`sep-thumb${i === activeIdx ? " sep-thumb--on" : ""}`} onClick={() => setActiveIdx(i)}>
                  <div className="sep-thumb-c">
                    <span className="sep-thumb-n">{String(i + 1).padStart(2, "0")}</span>
                    <span className="sep-thumb-t">{s.title || <em style={{ opacity: .38 }}>Untitled</em>}</span>
                    <div className="sep-thumb-ls">
                      {Array.from({ length: Math.min((s.bullets || []).filter(Boolean).length, 3) }).map((_, j) => (
                        <div key={j} className="sep-thumb-l" style={{ width: j === 2 ? "50%" : "80%" }} />
                      ))}
                    </div>
                  </div>
                  <div className="sep-thumb-acts">
                    <button className="sep-tact" title="Add after"  onClick={e => { e.stopPropagation(); addSlide(i); }}>+</button>
                    <button className="sep-tact" title="Duplicate"  onClick={e => { e.stopPropagation(); dupSlide(i); }}>⧉</button>
                    <button className="sep-tact sep-tact--del" title="Delete" disabled={total <= 1} onClick={e => { e.stopPropagation(); delSlide(i); }}>✕</button>
                  </div>
                </li>
              ))}
            </ol>
            <button className="sep-nav-foot" onClick={() => addSlide(total - 1)}>+ Add Slide</button>
            {lessonCtx && <div className="sep-nav-hint">Edit freely · save when ready</div>}
          </nav>

          {/* Center */}
          <main className="sep-center" aria-label="Slide editor">
            {viewMode === "preview" ? (
              <>
                <div className="sep-prev-chrome">
                  <span className="sep-prev-badge">👁 Student View</span>
                  <span>Exactly as students will see it</span>
                  {lessonCtx?.objective && <span className="sep-prev-obj">🎯 {lessonCtx.objective}</span>}
                </div>
                <div className="sep-prev-card">
                  <h1 className="sep-prev-title">{slide.title || <em style={{ opacity: .3 }}>No title</em>}</h1>
                  {slide.image_url && <img src={slide.image_url} alt={slide.title} className="sep-img-photo" />}
                  {(slide.bullets || []).filter(Boolean).length > 0 && (
                    <ul className="sep-prev-blist">
                      {slide.bullets.filter(Boolean).map((b, i) => (
                        <li key={i} className="sep-prev-b"><span className="sep-prev-dot" /><span>{b}</span></li>
                      ))}
                    </ul>
                  )}
                  {slide.exercise && (
                    <div style={{ padding: "12px 16px", borderLeft: `4px solid ${C.border2}`, borderRadius: "0 8px 8px 0", background: "rgba(0,0,0,.04)" }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: C.k4, marginBottom: 4 }}>✏️ Exercise</div>
                      <p style={{ fontSize: 15, color: C.k2, lineHeight: 1.6 }}>{slide.exercise}</p>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="sep-toolbar">
                  <button className="sep-tbtn" onClick={() => setActiveIdx(i => Math.max(0,i-1))} disabled={activeIdx===0}>‹</button>
                  <span className="sep-tpos">{activeIdx+1} / {total}</span>
                  <button className="sep-tbtn" onClick={() => setActiveIdx(i => Math.min(total-1,i+1))} disabled={activeIdx===total-1}>›</button>
                  <div className="sep-tsep" />
                  <button className="sep-tbtn" onClick={() => addSlide(activeIdx)}>+ Add</button>
                  <button className="sep-tbtn sep-tbtn--dup" onClick={() => dupSlide(activeIdx)}>⧉ Duplicate</button>
                  <div className="sep-tsep" />
                  <button className="sep-tbtn sep-tbtn--del" onClick={() => delSlide(activeIdx)} disabled={total<=1}>🗑 Delete</button>
                </div>

                <div className="sep-scroll">
                  <div className="sep-canvas" key={slide.id}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <span className="sep-canvas-num">SLIDE {String(activeIdx+1).padStart(2,"0")} / {String(total).padStart(2,"0")}</span>
                      {lessonCtx && <span className="sep-chip">📖 {lessonCtx.title}</span>}
                    </div>

                    {/* Image */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {slide.image_url
                        ? <img src={slide.image_url} alt={slide.title} className="sep-img-photo" />
                        : <div className="sep-img-empty"><span style={{ fontSize: 28, opacity: .32 }}>🖼️</span><span style={{ fontSize: 12, color: C.k4 }}>No image on this slide</span></div>
                      }
                      <div className="sep-img-actions">
                        <button className="sep-img-btn" onClick={() => fileRef.current?.click()}>⬆ Upload Image</button>
                        {slide.image_url && <button className="sep-img-btn sep-img-btn--del" onClick={() => patch({ image_url: null })}>✕ Remove</button>}
                      </div>
                      <input ref={fileRef} type="file" accept="image/*" style={{ display:"none" }} onChange={e => {
                        const f = e.target.files?.[0]; if (!f) return;
                        const r = new FileReader(); r.onload = () => patch({ image_url: r.result }); r.readAsDataURL(f); e.target.value="";
                      }} />
                    </div>

                    {/* Title */}
                    <div className="sep-field">
                      <label className="sep-flbl">Title</label>
                      <AutoTA className="sep-title-ta" value={slide.title} placeholder="Slide title…" onChange={v => patch({ title: v })} />
                    </div>

                    {/* Bullets */}
                    <div className="sep-field">
                      <label className="sep-flbl">Bullet Points</label>
                      <BulletList bullets={slide.bullets?.length ? slide.bullets : [""]} onChange={b => patch({ bullets: b })} />
                    </div>

                    {/* Exercise */}
                    {slide.exercise !== null && slide.exercise !== undefined && (
                      <div className="sep-box">
                        <span className="sep-box-lbl">✏️ Exercise</span>
                        <AutoTA className="sep-box-ta" value={slide.exercise} placeholder="Describe the exercise…" rows={2} onChange={v => patch({ exercise: v })} />
                      </div>
                    )}

                    {/* Speaker notes */}
                    {slide.teacher_notes !== null && slide.teacher_notes !== undefined && (
                      <div className="sep-notes">
                        <span className="sep-notes-lbl">📌 Speaker Notes</span>
                        <AutoTA className="sep-notes-ta" value={slide.teacher_notes} placeholder="Add speaker notes…" rows={2} onChange={v => patch({ teacher_notes: v })} />
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </main>

          {/* Right sidebar */}
          <aside className="sep-sidebar" aria-label="Slide settings">
            <div className="sep-sb-inner">
              <section className="sep-sec">
                <h3 className="sep-sec-hd">Slide Info</h3>
                <div className="sep-info-r"><span className="sep-info-l">Position</span><span className="sep-info-v">{activeIdx+1} of {total}</span></div>
                <div className="sep-info-r"><span className="sep-info-l">Bullets</span><span className="sep-info-v">{(slide.bullets||[]).filter(Boolean).length}</span></div>
                <div className="sep-info-r"><span className="sep-info-l">Image</span><span className="sep-info-v" style={{ color: slide.image_url ? C.green : C.k4 }}>{slide.image_url ? "✓ Uploaded" : "— None"}</span></div>
              </section>

              <section className="sep-sec">
                <h3 className="sep-sec-hd">Image Type</h3>
                <div className="sep-itgrid">
                  {imageTypes.map(t => (
                    <button key={t.id} className={`sep-itbtn${(slide.imageType||"auto")===t.id ? " sep-itbtn--on":""}`} onClick={() => patch({ imageType: t.id })}>
                      <span className="sep-iticon">{t.icon}</span>
                      <span className="sep-itlbl">{t.label}</span>
                    </button>
                  ))}
                </div>
              </section>

              <section className="sep-sec">
                <h3 className="sep-sec-hd">Content</h3>
                <label className="sep-tog-row">
                  <div><div className="sep-tog-lbl">Speaker Notes</div><div className="sep-tog-hint">Visible during presentation</div></div>
                  <Toggle on={slide.teacher_notes != null} onToggle={v => patch({ teacher_notes: v ? "" : null })} />
                </label>
                <label className="sep-tog-row">
                  <div><div className="sep-tog-lbl">Exercise</div><div className="sep-tog-hint">Student activity</div></div>
                  <Toggle on={slide.exercise != null} onToggle={v => patch({ exercise: v ? "" : null })} />
                </label>
              </section>

              <section className="sep-sec">
                <h3 className="sep-sec-hd">Actions</h3>
                <button className="sep-act" onClick={() => addSlide(activeIdx)}>+ Insert slide after</button>
                <button className="sep-act sep-act--dup" onClick={() => dupSlide(activeIdx)}>⧉ Duplicate slide</button>
                <button className="sep-act sep-act--del" onClick={() => delSlide(activeIdx)} disabled={total<=1}>🗑 Delete this slide</button>
              </section>

              {isLast && (
                <section className="sep-last">
                  <div className="sep-last-lbl">🎉 Last Lesson</div>
                  <p className="sep-last-text">This is the final lesson. Save and return to the overview to publish.</p>
                  <button className="sep-act" style={{ marginTop: 8, borderColor:"rgba(22,163,74,.28)", color:C.green }} onClick={onBack}>✓ Done — All Lessons</button>
                </section>
              )}
            </div>
          </aside>
        </div>

        {/* Footer */}
        <footer className="sep-footer">
          <button className="sep-ghost" style={{ border:`1px solid ${C.border}`, color:C.k3 }} onClick={onBack}>
            ← {lessonCtx ? "All Lessons" : "Edit Design"}
          </button>
          <div className="sep-fnav">
            <button className="sep-fnbtn" onClick={() => setActiveIdx(i=>Math.max(0,i-1))} disabled={activeIdx===0}>‹</button>
            <span className="sep-fcount">{activeIdx+1} / {total}</span>
            <button className="sep-fnbtn" onClick={() => setActiveIdx(i=>Math.min(total-1,i+1))} disabled={activeIdx===total-1}>›</button>
          </div>
          <button className={`sep-save${saved?" sep-save--done":""}`} style={{ fontSize:14, padding:"8px 22px" }} onClick={handleSave}>
            💾 {saved ? "Saved!" : saveLabel}
          </button>
        </footer>

        {toast && <div className="sep-toast">{toast}</div>}
      </div>
    </>
  );
}