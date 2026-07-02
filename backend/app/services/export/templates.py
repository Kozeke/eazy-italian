"""
app/services/export/templates.py

The self-contained HTML/CSS/JS, embedded as module-level string constants and
loaded into a Jinja2 Environment via DictLoader at import time. No app/templates
folder to ship, no Docker COPY step, no TemplateNotFound at runtime.

autoescape is ON for all templates: teacher-authored prompts/options/items are
HTML-escaped automatically. Only the passage markdown (already escaped inside
markdown_to_html) uses | safe; the answer key uses | tojson.
"""

from __future__ import annotations

from jinja2 import DictLoader, Environment, select_autoescape

from .models import ExportContext

_TPL_UNIT_EXPORT = r"""\
{# ════════════════════════════════════════════════════════════════════════════
   app/templates/export/unit_export.html.j2

   Self-contained single-file HTML export shell.

   This is the reference file's (Chilli_Peppers_part_1.html) split-pane
   layout, resizer, sticky timer header, panel-sync navigation, and results
   modal — reused close to verbatim per the implementation brief, with:
     - IELTS branding swapped for LinguAI brand colors (#6C6FEF / #4F52C2),
       per "Open questions to confirm with product" → resolved in favour of
       the mandatory design system rather than the IELTS file's blue.
     - Band-score table dropped entirely (IELTS-specific, brief says it must go).
     - Highlighting / notes / context-menu kept (generic UX win, brief said
       this was Claude's call) but trimmed to the minimal version needed.
     - Telegram link / IELTS logo / watermark removed (not relevant to us).
     - The hardcoded `correctAnswers` dict and `totalQuestions=13` constant
       are now templated from real unit data instead of one passage's
       13 fixed questions.
     - Multi-part skeleton (switchToPart) kept as a single-part no-op so a
       future course-level (multi-unit) export is a thin follow-on per the
       brief's "Architect it so a course-level export ... is a thin
       follow-on, not a rewrite" requirement — NOT built out now.

   Business logic (what each question means, how it's scored) lives entirely
   in export_service.py and is injected here as already-normalised data.
   This template only knows how to lay things out.
════════════════════════════════════════════════════════════════════════════ #}
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{{ unit_title }} — LinguAI</title>
<style>
/* CSS Reset & Base Styles */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}
:root {
  /* LIGHT MODE COLORS (DEFAULT) — LinguAI brand palette */
  --brand-primary: #6C6FEF;
  --brand-primary-dark: #4F52C2;
  --brand-tint: #EEF0FE;
  --bg-color: #F7F7FA;
  --text-color: #1C1F3A;
  --header-bg: #ffffff;
  --border-color: #E8EAFD;
  --panel-bg: #ffffff;
  --question-bg: #ffffff;
  --input-bg: #ffffff;
  --input-border: #d7d9f7;
  --input-focus: #6C6FEF;
  --correct-color: #28a745;
  --incorrect-color: #dc3545;
  --highlight-bg: #ffe27a;
  --modal-bg: #ffffff;
  --nav-bg: #ffffff;
  --resizer-bg: #EEF0FE;
  --part-header-bg: #EEF0FE;
  --link-color: #6C6FEF;
  --shadow-color: rgba(76, 78, 175, 0.12);
}
[data-theme="dark"] {
  --bg-color: #16172A;
  --text-color: #E7E8FA;
  --header-bg: #1F2138;
  --border-color: #34365A;
  --panel-bg: #1F2138;
  --question-bg: #262A4A;
  --input-bg: #262A4A;
  --input-border: #3C3F66;
  --input-focus: #9799FF;
  --correct-color: #2ecc71;
  --incorrect-color: #e74c3c;
  --highlight-bg: #5b5420;
  --modal-bg: #1F2138;
  --nav-bg: #1F2138;
  --resizer-bg: #262A4A;
  --part-header-bg: #262A4A;
  --link-color: #9799FF;
  --shadow-color: rgba(0,0,0,0.35);
}
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
  background-color: var(--bg-color);
  color: var(--text-color);
  line-height: 1.5;
  font-size: 16px;
  transition: background-color 0.3s, color 0.3s;
}
/* Header */
.header {
  background-color: var(--header-bg);
  padding: 12px 24px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
  position: fixed;
  top: 0; left: 0; right: 0;
  z-index: 100;
  height: 60px;
  transition: all 0.3s;
}
.header-left { display: flex; align-items: center; gap: 14px; }
.header-right { display: flex; align-items: center; gap: 16px; }
.brand-mark {
  display: flex; align-items: center; gap: 8px;
  font-weight: 700; font-size: 16px; color: var(--brand-primary-dark);
  letter-spacing: -0.01em;
}
.brand-dot {
  width: 24px; height: 24px; border-radius: 8px;
  background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark));
  flex-shrink: 0;
}
.unit-title-header {
  font-size: 14px; color: var(--text-color); opacity: 0.7;
  border-left: 1px solid var(--border-color); padding-left: 14px;
  max-width: 38vw; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.timer-container { display: flex; align-items: center; gap: 10px; font-size: 15px; font-weight: 500; }
.timer-display { font-weight: 600; min-width: 56px; }
.timer-controls { display: flex; gap: 8px; }
.timer-controls button, .dark-mode-btn {
  background: var(--brand-tint);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  width: 32px; height: 32px;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  transition: background-color 0.2s, transform 0.2s;
}
.timer-controls button:hover, .dark-mode-btn:hover {
  background: var(--border-color);
  transform: scale(1.05);
}
.timer-controls button svg, .dark-mode-btn svg {
  width: 18px; height: 18px; fill: var(--brand-primary-dark);
  transition: fill 0.3s;
}
/* Main layout */
.main-container {
  margin-top: 60px;
  display: flex; flex-direction: column;
  background: var(--bg-color);
  height: calc(100vh - 60px);
  position: relative;
}
.panels-container { display: flex; flex: 1; overflow: hidden; }
.passage-panel, .questions-panel {
  flex: 1;
  padding: 28px 32px 110px;
  overflow-y: auto;
  min-width: 220px;
  background-color: var(--panel-bg);
  transition: background-color 0.3s;
}
.questions-panel { border-left: 1px solid var(--border-color); }
.resizer {
  width: 8px;
  cursor: col-resize;
  background-color: var(--resizer-bg);
  background-image: url('data:image/svg+xml;charset=UTF-8,<svg xmlns="http://www.w3.org/2000/svg" width="8" height="28" viewBox="0 0 8 28"><path d="M3 10h2v2H3zM3 14h2v2H3zM3 18h2v2H3z" fill="%236C6FEF"/></svg>');
  background-repeat: no-repeat;
  background-position: center;
  flex-shrink: 0; flex-grow: 0;
  transition: background-color 0.3s;
}
/* Passage content */
.reading-passage h4 {
  font-size: 20px; font-weight: 700; margin-bottom: 16px; color: var(--brand-primary-dark);
}
.reading-passage h2 { font-size: 17px; font-weight: 700; margin: 18px 0 8px; color: var(--brand-primary-dark); }
.reading-passage h3 { font-size: 14px; font-weight: 700; margin: 14px 0 6px; opacity: 0.75; text-transform: uppercase; letter-spacing: 0.03em; }
.reading-passage p { margin-bottom: 1.1em; }
.reading-passage ul { margin: 0 0 1.1em 20px; }
.reading-passage strong { color: var(--text-color); }
.passage-block { margin-bottom: 28px; padding-bottom: 24px; border-bottom: 1px solid var(--border-color); }
.passage-block:last-child { border-bottom: none; }
/* Vocabulary glossary table (VocabularyBlock.tsx export) */
.vocab-export h4 {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  font-size: 20px; font-weight: 700; margin-bottom: 12px; color: var(--brand-primary-dark);
}
.vocab-count {
  margin-left: auto; font-size: 11px; font-weight: 600; opacity: 0.65;
  background: var(--brand-tint); border-radius: 999px; padding: 3px 10px;
}
.vocab-table {
  width: 100%; border-collapse: separate; border-spacing: 0;
  font-size: 13.5px; border: 1.5px solid var(--border-color); border-radius: 12px; overflow: hidden;
}
.vocab-table th {
  text-align: left; padding: 8px 12px; font-size: 11px; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.04em; opacity: 0.7;
  background: var(--brand-tint); border-bottom: 2px solid var(--border-color);
}
.vocab-table td { padding: 10px 12px; vertical-align: top; border-bottom: 1px solid var(--border-color); }
.vocab-table tr:last-child td { border-bottom: none; }
.vocab-row-alt { background: var(--input-bg); }
.vocab-word { font-weight: 700; color: var(--brand-primary-dark); width: 26%; }
.vocab-translation { width: 26%; }
.vocab-example { font-style: italic; opacity: 0.75; line-height: 1.5; }
/* ── Media (image / gif / audio / video / carousel) ─────────────────────────── */
.media-title { font-weight: 700; font-size: 15px; margin-bottom: 8px; color: var(--brand-primary-dark); }
.media-caption { font-size: 13px; opacity: 0.7; margin-top: 6px; text-align: center; font-style: italic; }
.media-figure { margin: 0; border-radius: 14px; overflow: hidden; border: 1.5px solid var(--border-color); background: var(--input-bg); }
.media-figure img { display: block; width: 100%; height: auto; }
.media-audio { width: 100%; display: block; margin: 4px 0; }
.media-video { display: block; width: 100%; border-radius: 14px; border: 1.5px solid var(--border-color); background: #000; }
.media-embed { position: relative; width: 100%; padding-bottom: 56.25%; height: 0; border-radius: 14px; overflow: hidden; border: 1.5px solid var(--border-color); background: #000; }
.media-embed iframe { position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0; }
.media-carousel { display: flex; flex-direction: column; gap: 14px; }
/* Question groups */
.question-group-title { font-weight: 700; margin-bottom: 14px; color: var(--brand-primary-dark); font-size: 15px; }
.question { margin-bottom: 36px; }
/* True/False */
.tf-question {
  margin-bottom: 22px;
  padding: 14px;
  border-radius: 14px;
  background: var(--question-bg);
  border: 1.5px solid var(--border-color);
  box-shadow: 0 1px 4px var(--shadow-color);
  transition: border-color 0.3s, background-color 0.3s;
}
.tf-question-line { display: flex; align-items: flex-start; margin-bottom: 12px; }
.tf-question-number {
  border: 1.5px solid var(--border-color);
  padding: 2px 9px;
  margin-right: 10px;
  border-radius: 8px;
  font-weight: 700;
  background-color: var(--brand-tint);
  color: var(--brand-primary-dark);
}
.tf-question.active-question .tf-question-number { border-color: var(--input-focus); }
.tf-question-text { padding-top: 3px; }
.tf-options { padding-left: 4px; display: flex; gap: 8px; }
.tf-option {
  flex: 1;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  padding: 10px 12px;
  transition: background-color 0.2s ease, border-color 0.2s ease;
  background-color: var(--input-bg);
  border: 1.5px solid var(--border-color);
  border-radius: 10px;
  font-weight: 600;
  font-size: 14px;
}
.tf-option:hover { background-color: var(--part-header-bg); }
.tf-option:has(input[type="radio"]:checked) {
  background-color: var(--brand-tint);
  border-color: var(--input-focus);
}
.tf-option.correct { background-color: rgba(40, 167, 69, 0.15) !important; border-color: var(--correct-color) !important; }
.tf-option.incorrect { background-color: rgba(220, 53, 69, 0.15) !important; border-color: var(--incorrect-color) !important; }
.tf-option input[type="radio"] { margin-right: 8px; transform: scale(1.1); accent-color: var(--input-focus); }
/* Gap fill */
.gap-fill-block {
  padding: 16px;
  border-radius: 14px;
  background: var(--question-bg);
  border: 1.5px solid var(--border-color);
  box-shadow: 0 1px 4px var(--shadow-color);
  line-height: 2.1;
}
.answer-input {
  border: 1.5px solid var(--input-border);
  border-radius: 8px;
  background-color: var(--input-bg);
  padding: 3px 8px;
  font-size: 15px;
  font-weight: 700;
  margin: 0 4px;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, background-color 0.3s, color 0.3s;
  height: 30px;
  min-width: 110px;
  color: var(--text-color);
}
.answer-input.active-input, .answer-input:focus { border-color: var(--input-focus); border-width: 2px; outline: none; }
.answer-input::placeholder { color: var(--text-color); opacity: 0.5; font-weight: 700; }
.answer-input.correct { border-color: var(--correct-color); background-color: rgba(40, 167, 69, 0.1); }
.answer-input.incorrect { border-color: var(--incorrect-color); background-color: rgba(220, 53, 69, 0.1); }
.correct-answer-display { font-weight: 700; color: var(--correct-color); margin-left: 8px; font-size: 14px; }
/* Multiple choice */
.multi-choice-question {
  margin-bottom: 18px;
  padding: 16px;
  border-radius: 14px;
  background: var(--question-bg);
  border: 1.5px solid var(--border-color);
  box-shadow: 0 1px 4px var(--shadow-color);
  transition: border-color 0.3s, background-color 0.3s;
}
.multi-choice-question .question-prompt-text {
  display: flex; align-items: flex-start; gap: 10px; margin-bottom: 14px; font-weight: 600;
}
.multi-choice-question .q-num-badge {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 26px; height: 26px; padding: 0 6px;
  border-radius: 8px; background: var(--brand-tint); color: var(--brand-primary-dark);
  font-weight: 700; font-size: 13px; flex-shrink: 0;
}
.multi-choice-question.active-question .q-num-badge { border: 2px solid var(--input-focus); }
.multi-choice-option {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  font-size: 15px;
  padding: 10px 12px;
  background-color: var(--input-bg);
  transition: background-color 0.2s ease, border-color 0.2s ease;
  border: 1.5px solid var(--border-color);
  border-radius: 10px;
  margin-bottom: 6px;
}
.multi-choice-option:hover { background-color: var(--part-header-bg); }
.multi-choice-option:has(input:checked) { background-color: var(--brand-tint); border-color: var(--input-focus); }
.multi-choice-option.correct { background-color: rgba(40, 167, 69, 0.15) !important; border-color: var(--correct-color) !important; }
.multi-choice-option.incorrect { background-color: rgba(220, 53, 69, 0.15) !important; border-color: var(--incorrect-color) !important; }
.multi-choice-option label { display: flex; align-items: center; cursor: pointer; font-size: 15px; }
.multi-choice-option input[type="checkbox"], .multi-choice-option input[type="radio"] {
  margin-right: 0; transform: scale(1.2); accent-color: var(--input-focus); flex-shrink: 0;
}
/* Nav arrows */
.nav-arrows { position: fixed; bottom: 96px; right: 24px; display: flex; gap: 8px; z-index: 101; }
.nav-arrow {
  width: 44px; height: 44px; border: none; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  color: #fff; border-radius: 14px;
  transition: transform 0.1s ease, box-shadow 0.2s ease;
  box-shadow: 0 2px 8px var(--shadow-color);
}
.nav-arrow.prev { background-color: var(--brand-primary-dark); }
.nav-arrow.next { background-color: var(--brand-primary); }
.nav-arrow:hover { transform: translateY(-1px); }
.nav-arrow:active { transform: translateY(0); }
/* Bottom nav */
.nav-row {
  position: fixed; bottom: 0; left: 0; right: 0;
  background: var(--nav-bg);
  display: flex; align-items: center;
  height: 78px; z-index: 100;
  border-top: 1px solid var(--border-color);
  padding: 0 16px;
}
.question-wrapper { display: flex; align-items: center; gap: 4px; overflow-x: auto; flex: 1; }
.subquestion-nav { display: flex; gap: 4px; flex-wrap: nowrap; }
.subQuestion {
  width: 32px; height: 32px;
  border: 1.5px solid var(--border-color);
  background: var(--input-bg);
  color: var(--text-color);
  font-size: 13px; font-weight: 600;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.2s;
  border-radius: 8px;
  flex-shrink: 0;
}
.subQuestion:hover { background-color: var(--part-header-bg); border-color: var(--input-focus); }
.subQuestion.answered { background-color: var(--brand-tint); border-color: var(--border-color); }
.subQuestion.correct { background-color: var(--correct-color); color: white; border-color: var(--correct-color); }
.subQuestion.incorrect { background-color: var(--incorrect-color); color: white; border-color: var(--incorrect-color); }
.subQuestion.active { background-color: var(--input-focus); color: white; border-color: var(--input-focus); }
.attempted-count { font-size: 13px; opacity: 0.65; margin-right: 12px; white-space: nowrap; }
.deliver-button {
  margin-left: 12px;
  background-color: var(--brand-primary);
  color: white;
  border: none;
  padding: 11px 20px;
  font-size: 14px; font-weight: 700;
  cursor: pointer;
  display: inline-flex; align-items: center; gap: 8px;
  transition: transform 0.08s ease, background-color 0.2s ease;
  min-width: 150px; justify-content: center;
  border-radius: 12px;
  flex-shrink: 0;
}
.deliver-button:hover { background-color: var(--brand-primary-dark); }
.deliver-button:active { transform: translateY(1px); }
.deliver-button:disabled { opacity: 0.5; cursor: not-allowed; }
.hidden { display: none !important; }
/* Results modal */
.modal-overlay {
  position: fixed; top: 0; left: 0; width: 100%; height: 100%;
  background-color: rgba(28, 31, 58, 0.55);
  backdrop-filter: blur(3px);
  z-index: 2000;
  display: flex; justify-content: center; align-items: center;
}
.modal-overlay.hidden { display: none; }
.modal-content {
  background: var(--modal-bg);
  padding: 28px;
  border-radius: 20px;
  width: 92%; max-width: 760px; max-height: 86vh;
  display: flex; flex-direction: column;
  position: relative;
  border: 1px solid var(--border-color);
  box-shadow: 0 20px 60px var(--shadow-color);
  color: var(--text-color);
}
.modal-close-btn { position: absolute; top: 14px; right: 18px; background: none; border: none; font-size: 26px; cursor: pointer; color: var(--text-color); }
.modal-content h2 { text-align: center; margin-bottom: 18px; color: var(--brand-primary-dark); }
.results-summary { display: flex; gap: 12px; justify-content: center; margin-bottom: 18px; border-bottom: 1px solid var(--border-color); padding-bottom: 16px; }
.results-summary p { margin: 0; font-size: 14px; }
.results-summary p span {
  display: inline-block; padding: 5px 12px; margin-left: 6px;
  border-radius: 999px; background: var(--brand-tint); color: var(--brand-primary-dark);
  font-weight: 700;
}
.results-details-container { overflow-y: auto; padding-right: 6px; }
.result-row {
  display: grid; grid-template-columns: 48px 1fr 1fr 100px; gap: 12px;
  padding: 10px 8px; border-bottom: 1px solid var(--border-color); font-size: 14px; align-items: center;
}
.result-row.correct { background-color: rgba(40, 167, 69, 0.08); }
.result-row.incorrect { background-color: rgba(220, 53, 69, 0.08); }
.result-row .q-num {
  font-weight: 700; background: var(--brand-tint); color: var(--brand-primary-dark);
  border-radius: 8px; width: 36px; height: 28px;
  display: inline-flex; align-items: center; justify-content: center;
}
.result-row .user-ans { background: var(--part-header-bg); padding: 4px 8px; border-radius: 6px; }
.result-row .correct-ans { color: var(--correct-color); font-weight: 600; background: rgba(40, 167, 69, 0.1); padding: 4px 8px; border-radius: 6px; }
.status-badge { justify-self: end; padding: 4px 10px; border-radius: 999px; font-size: 11px; font-weight: 700; }
.status-badge.ok { background: rgba(40, 167, 69, 0.18); color: var(--correct-color); }
.status-badge.bad { background: rgba(220, 53, 69, 0.18); color: var(--incorrect-color); }
.dark-mode-btn { position: relative; }
.dark-mode-btn .sun-icon, .dark-mode-btn .moon-icon { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); transition: opacity 0.3s, transform 0.3s; }
.dark-mode-btn .moon-icon { opacity: 0; transform: translate(-50%, -50%) rotate(90deg); }
[data-theme="dark"] .dark-mode-btn .sun-icon { opacity: 0; transform: translate(-50%, -50%) rotate(-90deg); }
[data-theme="dark"] .dark-mode-btn .moon-icon { opacity: 1; transform: translate(-50%, -50%) rotate(0deg); }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
.empty-state { padding: 40px 20px; text-align: center; opacity: 0.6; font-size: 14px; }
::-webkit-scrollbar { width: 10px; }
::-webkit-scrollbar-track { background: var(--panel-bg); }
::-webkit-scrollbar-thumb { background: var(--border-color); border-radius: 5px; }
::-webkit-scrollbar-thumb:hover { background: var(--input-focus); }
/* ── Tier-2: order / sort / match ────────────────────────────────────────────── */
.t2-question {
  margin-bottom: 26px;
  padding: 16px;
  border-radius: 14px;
  background: var(--question-bg);
  border: 1.5px solid var(--border-color);
  box-shadow: 0 1px 4px var(--shadow-color);
}
.t2-question .question-prompt-text {
  display: flex; align-items: flex-start; gap: 10px; margin-bottom: 14px; font-weight: 600;
}
/* Order */
.order-list { display: flex; flex-direction: column; gap: 8px; }
.order-row { margin-bottom: 8px; }
.order-row-labeled {
  padding: 10px 12px 12px;
  border: 1.5px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-color);
  margin-bottom: 12px;
}
.order-row-label {
  font-size: 12px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.04em; color: var(--brand-primary-dark);
  margin-bottom: 8px; opacity: 0.85;
}
.order-item {
  display: flex; align-items: center; gap: 10px;
  padding: 11px 12px;
  background: var(--input-bg);
  border: 1.5px solid var(--border-color);
  border-radius: 10px;
  cursor: grab;
  user-select: none;
  transition: border-color 0.15s, background-color 0.15s, box-shadow 0.15s;
}
.order-item:active { cursor: grabbing; }
.order-item.dragging { opacity: 0.45; }
.order-item.drag-over { border-color: var(--input-focus); box-shadow: 0 0 0 2px var(--brand-tint); }
.order-item.correct { border-color: var(--correct-color); background: rgba(40,167,69,0.12); }
.order-item.incorrect { border-color: var(--incorrect-color); background: rgba(220,53,69,0.12); }
.drag-handle { color: var(--input-focus); font-size: 14px; letter-spacing: -2px; flex-shrink: 0; opacity: 0.7; }
.order-item-text { flex: 1; }
/* Sort */
.sort-pool {
  display: flex; flex-wrap: wrap; gap: 8px;
  min-height: 46px; padding: 10px;
  background: var(--bg-color);
  border: 1.5px dashed var(--input-border);
  border-radius: 10px;
  margin-bottom: 14px;
}
.sort-pool.drag-over, .sort-dropzone.drag-over { border-color: var(--input-focus); background: var(--brand-tint); }
.sort-chip {
  padding: 7px 12px;
  background: var(--input-bg);
  border: 1.5px solid var(--border-color);
  border-radius: 999px;
  cursor: grab; user-select: none;
  font-size: 14px; font-weight: 600;
  transition: border-color 0.15s, background-color 0.15s;
}
.sort-chip:active { cursor: grabbing; }
.sort-chip.dragging { opacity: 0.45; }
.sort-chip.correct { border-color: var(--correct-color); background: rgba(40,167,69,0.14); }
.sort-chip.incorrect { border-color: var(--incorrect-color); background: rgba(220,53,69,0.14); }
.sort-columns { display: flex; gap: 12px; flex-wrap: wrap; }
.sort-column { flex: 1; min-width: 140px; }
.sort-column-title {
  font-weight: 700; font-size: 13px; margin-bottom: 6px;
  color: var(--brand-primary-dark); text-align: center;
}
.sort-dropzone {
  display: flex; flex-wrap: wrap; gap: 8px; align-content: flex-start;
  min-height: 90px; padding: 10px;
  background: var(--input-bg);
  border: 1.5px dashed var(--input-border);
  border-radius: 10px;
}
/* Match */
.match-grid { display: flex; gap: 14px; }
.match-col { flex: 1; display: flex; flex-direction: column; gap: 8px; }
.match-item {
  text-align: left; width: 100%;
  padding: 11px 12px;
  background: var(--input-bg);
  border: 1.5px solid var(--border-color);
  border-radius: 10px;
  cursor: pointer; font-size: 15px;
  color: var(--text-color);
  transition: border-color 0.15s, background-color 0.15s;
}
.match-item:hover { background: var(--part-header-bg); }
.match-item.selected { border-color: var(--input-focus); background: var(--brand-tint); }
.match-item.linked { border-color: var(--brand-primary); }
.match-item.linked::after {
  content: attr(data-link-badge);
  float: right; font-size: 11px; font-weight: 700;
  color: #fff; background: var(--brand-primary);
  border-radius: 999px; padding: 1px 8px; margin-left: 8px;
}
.match-item.correct { border-color: var(--correct-color); background: rgba(40,167,69,0.12); }
.match-item.incorrect { border-color: var(--incorrect-color); background: rgba(220,53,69,0.12); }
.match-pairs-list { margin-top: 12px; display: flex; flex-direction: column; gap: 6px; }
.match-pair-row {
  display: flex; align-items: center; gap: 8px; font-size: 13px;
  padding: 6px 10px; background: var(--part-header-bg); border-radius: 8px;
}
.match-pair-row .unlink-btn {
  margin-left: auto; cursor: pointer; border: none; background: none;
  color: var(--incorrect-color); font-weight: 700; font-size: 15px;
}
   The default layout puts passage + questions side by side, each with a
   min-width. Below 820px the two minimums (plus the resizer/border/padding)
   exceed the viewport, and the side-by-side flex row would otherwise clip the
   questions panel off-screen. Here we switch to a single scrolling column so
   both panels are always reachable. */
@media (max-width: 820px) {
  .main-container { height: auto; min-height: calc(100vh - 60px); }
  .panels-container {
    flex-direction: column;
    overflow: visible;
    height: auto;
  }
  .passage-panel, .questions-panel {
    flex: none;
    width: 100%;
    min-width: 0;
    overflow-y: visible;
    padding: 20px 18px;
  }
  .passage-panel { padding-bottom: 8px; }
  .questions-panel {
    border-left: none;
    border-top: 1px solid var(--border-color);
    padding-bottom: 110px; /* clearance for the fixed bottom nav */
  }
  .resizer { display: none; }
  .nav-arrows { bottom: 92px; right: 14px; }
}
@media (max-width: 480px) {
  .passage-panel, .questions-panel { padding-left: 14px; padding-right: 14px; }
  .tf-options { flex-direction: column; gap: 6px; }
  .nav-row { padding: 0 8px; }
  .deliver-button { min-width: 120px; padding: 10px 12px; }
  .match-grid { flex-direction: column; }
  .sort-columns { flex-direction: column; }
}
</style>
</head>
<body data-theme="light">
<div class="header">
  <div class="header-left">
    <div class="brand-mark"><span class="brand-dot"></span>LinguAI</div>
    <div class="unit-title-header">{{ unit_title }}</div>
  </div>
  <div class="header-right">
    {% if total_questions > 0 %}
    <div class="timer-container">
      <span class="timer-display">60:00</span>
      <div class="timer-controls">
        <button id="timer-toggle-btn" title="Pause/Resume Timer">
          <svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 0 24 24" width="20px"><path d="M0 0h24v24H0V0z" fill="none"/><path d="M8 5v14l11-7L8 5z"/></svg>
        </button>
        <button id="timer-reset-btn" title="Reset Timer">
          <svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 0 24 24" width="20px"><path d="M0 0h24v24H0V0z" fill="none"/><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/></svg>
        </button>
      </div>
    </div>
    {% endif %}
    <button class="dark-mode-btn" id="dark-mode-toggle" title="Toggle Dark Mode">
      <svg class="sun-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      <svg class="moon-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
  </div>
</div>

<div class="main-container" id="main-container">
  <div class="panels-container">
    <div class="passage-panel" id="passage-panel">
      {% if passage_blocks %}
        {% for block in passage_blocks %}
        <div class="reading-passage passage-block">{{ block.html | safe }}</div>
        {% endfor %}
      {% else %}
        <div class="empty-state">No reading content in this unit.</div>
      {% endif %}
    </div>

    {% if total_questions > 0 %}<div class="resizer" id="resizer"></div>{% endif %}

    <div class="questions-panel" id="questions-panel" {% if total_questions == 0 %}style="display:none;"{% endif %}>
      <div class="questions-container">
        {% for group in question_groups %}
          {% if group.kind == "true_false" %}
            {% include "export/_true_false.html.j2" %}
          {% elif group.kind == "gap_fill" %}
            {% include "export/_gap_fill.html.j2" %}
          {% elif group.kind == "multiple_choice" %}
            {% include "export/_multiple_choice.html.j2" %}
          {% elif group.kind == "order" %}
            {% include "export/_order.html.j2" %}
          {% elif group.kind == "sort" %}
            {% include "export/_sort.html.j2" %}
          {% elif group.kind == "match" %}
            {% include "export/_match.html.j2" %}
          {% endif %}
        {% endfor %}
      </div>
    </div>
  </div>
</div>

{% if total_questions > 0 %}
<div class="nav-arrows">
  <button class="nav-arrow prev" onclick="previousQuestion()" id="prevBtn" aria-label="Previous question">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M15 18l-6-6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
  </button>
  <button class="nav-arrow next" onclick="nextQuestion()" id="nextBtn" aria-label="Next question">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
  </button>
</div>

<nav class="nav-row" aria-label="Questions">
  <div class="question-wrapper">
    <span class="attempted-count" id="attempted-count">0 of {{ total_questions }}</span>
    <div class="subquestion-nav">
      {% for n in range(1, total_questions + 1) %}
      <button class="subQuestion" onclick="goToQuestion({{ n }})"><span class="sr-only">Question {{ n }}</span><span aria-hidden="true">{{ n }}</span></button>
      {% endfor %}
    </div>
  </div>
  <button id="deliver-button" aria-label="Check your answers" class="deliver-button">
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" fill="currentColor"/></svg>
    <span>Check Answers</span>
  </button>
</nav>

<div id="results-modal" class="modal-overlay hidden">
  <div class="modal-content">
    <button class="modal-close-btn" onclick="closeResultsModal()">&times;</button>
    <h2>Results</h2>
    <div class="results-summary">
      <p>Score: <span id="results-score"></span> / {{ total_questions }}</p>
    </div>
    <div id="results-details" class="results-details-container"></div>
  </div>
</div>
{% endif %}

<script>
document.addEventListener('DOMContentLoaded', () => {
  // --- STATE ---
  let currentQuestion = 1;
  let timeInSeconds = 3600;
  let timerInterval;
  let activeQuestionElement = null;
  const totalQuestions = {{ total_questions }};

  // --- DARK MODE ---
  const darkModeToggle = document.getElementById('dark-mode-toggle');
  const body = document.body;
  body.setAttribute('data-theme', 'light');
  function toggleDarkMode() {
    const isDark = body.getAttribute('data-theme') === 'dark';
    body.setAttribute('data-theme', isDark ? 'light' : 'dark');
  }
  darkModeToggle.addEventListener('click', toggleDarkMode);

  if (totalQuestions === 0) {
    // Nothing gradable in this unit — skip all exercise wiring.
    return;
  }

  // --- DOM ELEMENTS ---
  const timerDisplay = document.querySelector('.timer-display');
  const timerToggleButton = document.getElementById('timer-toggle-btn');
  const timerResetButton = document.getElementById('timer-reset-btn');
  const deliverButton = document.getElementById('deliver-button');
  const resizer = document.getElementById('resizer');
  const passagePanel = document.getElementById('passage-panel');
  const questionsPanel = document.getElementById('questions-panel');

  const playIcon = '<svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 0 24 24" width="20px"><path d="M0 0h24v24H0V0z" fill="none"/><path d="M8 5v14l11-7L8 5z"/></svg>';
  const pauseIcon = '<svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 0 24 24" width="20px"><path d="M0 0h24v24H0V0z" fill="none"/><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';

  // --- ANSWERS (embedded by export_service.py via build_export_context) ---
  // Values are either a string (radio/single-correct/gap) or an array of
  // strings (checkbox / multi-correct MCQ) — see normalise_test_block().
  const correctAnswers = {{ correct_answers | tojson }};

  // --- INIT ---
  function initialize() {
    startTimer();
    deliverButton.addEventListener('click', checkAnswers);
    timerToggleButton.addEventListener('click', toggleTimer);
    timerResetButton.addEventListener('click', resetTimer);

    document.querySelectorAll('[data-q-start]').forEach(el => {
      el.addEventListener('click', (event) => {
        event.stopPropagation();
        const qNum = parseInt(el.dataset.qStart, 10);
        if (!isNaN(qNum) && currentQuestion !== qNum) goToQuestion(qNum);
      });
    });

    document.querySelectorAll('.answer-input[id^="q"]').forEach(input => {
      ['focus', 'click', 'input', 'change'].forEach(evt => {
        input.addEventListener(evt, () => {
          const qNum = parseInt(input.id.replace('q', ''), 10);
          if (!isNaN(qNum) && currentQuestion !== qNum) goToQuestion(qNum);
        });
      });
    });

    document.querySelectorAll('input[type="radio"], input[type="checkbox"]').forEach(el => {
      const update = () => {
        const name = el.name || '';
        if (name.startsWith('q')) {
          const qNum = parseInt(name.replace('q', ''), 10);
          if (!isNaN(qNum) && currentQuestion !== qNum) goToQuestion(qNum);
        }
      };
      el.addEventListener('focus', update);
      el.addEventListener('change', update);
      el.addEventListener('click', update);
    });

    if (resizer) resizer.addEventListener('mousedown', initResize, false);

    setupTier2();

    document.body.addEventListener('input', updateAllIndicators);
    document.body.addEventListener('change', updateAllIndicators);
    updateAllIndicators();
    goToQuestion(1);
  }

  // --- TIER-2 INTERACTIONS (order / sort / match) ---
  // State per question number. order/sort store the live DOM arrangement;
  // match stores left_id -> right_id links chosen by the student.
  const t2Match = {};   // qnum -> { links: {leftId: rightId}, sel: {side,id}|null }

  function setupTier2() {
    // ORDER: drag rows to reorder within their list.
    document.querySelectorAll('.order-list').forEach(list => enableListDnD(list, '.order-item'));

    // SORT: drag chips between the pool and column dropzones.
    document.querySelectorAll('.sort-question').forEach(q => enableSortDnD(q));

    // MATCH: click a left item then a right item (or vice-versa) to link.
    document.querySelectorAll('.match-question').forEach(q => enableMatch(q));
  }

  // Generic drag-to-reorder for a vertical list of children.
  function enableListDnD(container, itemSelector) {
    let dragged = null;
    container.addEventListener('dragstart', e => {
      const item = e.target.closest(itemSelector);
      if (!item) return;
      dragged = item;
      item.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    container.addEventListener('dragend', () => {
      if (dragged) dragged.classList.remove('dragging');
      container.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
      dragged = null;
    });
    container.addEventListener('dragover', e => {
      e.preventDefault();
      const after = getDragAfterElement(container, itemSelector, e.clientY);
      if (!dragged) return;
      if (after == null) container.appendChild(dragged);
      else container.insertBefore(dragged, after);
    });
  }

  function getDragAfterElement(container, itemSelector, y) {
    const els = [...container.querySelectorAll(itemSelector + ':not(.dragging)')];
    return els.reduce((closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) return { offset, element: child };
      return closest;
    }, { offset: -Infinity, element: null }).element;
  }

  // Drag chips between pool + column dropzones for one sort question.
  function enableSortDnD(qEl) {
    let dragged = null;
    const zones = [qEl.querySelector('.sort-pool'), ...qEl.querySelectorAll('.sort-dropzone')];
    qEl.addEventListener('dragstart', e => {
      const chip = e.target.closest('.sort-chip');
      if (!chip) return;
      dragged = chip; chip.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    qEl.addEventListener('dragend', () => {
      if (dragged) dragged.classList.remove('dragging');
      zones.forEach(z => z.classList.remove('drag-over'));
      dragged = null;
    });
    zones.forEach(zone => {
      zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
      zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
      zone.addEventListener('drop', e => {
        e.preventDefault();
        zone.classList.remove('drag-over');
        if (dragged) zone.appendChild(dragged);
      });
    });
  }

  // Click-to-link matching for one match question.
  function enableMatch(qEl) {
    const qnum = qEl.dataset.qnum;
    t2Match[qnum] = { links: {}, sel: null };
    const state = t2Match[qnum];
    const listEl = qEl.querySelector('.match-pairs-list');

    qEl.querySelectorAll('.match-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const side = btn.dataset.side, id = btn.dataset.itemId;
        if (!state.sel) {
          state.sel = { side, id, el: btn };
          btn.classList.add('selected');
          return;
        }
        if (state.sel.side === side) {
          // Re-select on the same side.
          state.sel.el.classList.remove('selected');
          state.sel = { side, id, el: btn };
          btn.classList.add('selected');
          return;
        }
        // Complete a link.
        const leftId = side === 'left' ? id : state.sel.id;
        const rightId = side === 'right' ? id : state.sel.id;
        // Remove any existing link involving either endpoint.
        delete state.links[leftId];
        Object.keys(state.links).forEach(l => { if (state.links[l] === rightId) delete state.links[l]; });
        state.links[leftId] = rightId;
        state.sel.el.classList.remove('selected');
        state.sel = null;
        renderMatchLinks(qEl, qnum);
      });
    });
  }

  function renderMatchLinks(qEl, qnum) {
    const state = t2Match[qnum];
    const listEl = qEl.querySelector('.match-pairs-list');
    const leftText = {}, rightText = {};
    qEl.querySelectorAll('.match-left-item').forEach(b => leftText[b.dataset.itemId] = b.textContent);
    qEl.querySelectorAll('.match-right-item').forEach(b => rightText[b.dataset.itemId] = b.textContent);
    // Badge + linked styling
    qEl.querySelectorAll('.match-item').forEach(b => { b.classList.remove('linked'); b.removeAttribute('data-link-badge'); });
    listEl.innerHTML = '';
    let n = 0;
    Object.keys(state.links).forEach(leftId => {
      n++;
      const rightId = state.links[leftId];
      const lb = qEl.querySelector('.match-left-item[data-item-id="' + leftId + '"]');
      const rb = qEl.querySelector('.match-right-item[data-item-id="' + rightId + '"]');
      if (lb) { lb.classList.add('linked'); lb.setAttribute('data-link-badge', n); }
      if (rb) { rb.classList.add('linked'); rb.setAttribute('data-link-badge', n); }
      const row = document.createElement('div');
      row.className = 'match-pair-row';
      row.innerHTML = '<span>' + (leftText[leftId] || '') + '</span><span>&rarr;</span><span>' + (rightText[rightId] || '') + '</span>';
      const btn = document.createElement('button');
      btn.className = 'unlink-btn'; btn.textContent = '\u00d7'; btn.setAttribute('aria-label', 'Remove link');
      btn.addEventListener('click', () => { delete state.links[leftId]; renderMatchLinks(qEl, qnum); updateAllIndicators(); });
      row.appendChild(btn);
      listEl.appendChild(row);
    });
    updateAllIndicators();
  }

  // --- SCORING ---
  function checkAnswers() {
    document.querySelectorAll('input, select, textarea').forEach(input => { input.disabled = true; });
    deliverButton.disabled = true;
    clearInterval(timerInterval);

    let score = 0;
    const resultsDetailsContainer = document.getElementById('results-details');
    resultsDetailsContainer.innerHTML = '';

    document.querySelectorAll('.correct, .incorrect').forEach(el => {
      el.classList.remove('correct', 'incorrect');
    });
    document.querySelectorAll('.correct-answer-display').forEach(el => el.remove());

    const normalize = (s) => (s || '').toString().trim().toLowerCase();

    for (let i = 1; i <= totalQuestions; i++) {
      const key = String(i);
      const correctAnswer = correctAnswers[key];
      let userAnswerDisplay = 'Not answered';
      let isCorrect = false;

      // --- Tier-2: correctAnswer is an object {kind: order|sort|match} ---
      if (correctAnswer && typeof correctAnswer === 'object' && !Array.isArray(correctAnswer) && correctAnswer.kind) {
        const r = gradeTier2(i, correctAnswer);
        isCorrect = r.isCorrect;
        userAnswerDisplay = r.userAnswerDisplay;
        if (isCorrect) score++;
        pushResultRow(resultsDetailsContainer, i, userAnswerDisplay, r.correctDisplay, isCorrect);
        markNav(i, isCorrect);
        continue;
      }

      const textInput = document.getElementById(`q${i}`);
      const radioGroup = document.querySelectorAll(`input[name="q${i}"][type="radio"]`);
      const checkboxGroup = document.querySelectorAll(`input[name="q${i}"][type="checkbox"]`);

      if (textInput && textInput.tagName === 'INPUT') {
        // Gap-fill: case-insensitive trimmed compare (normalise_answer_text()).
        const userAnswer = textInput.value.trim();
        userAnswerDisplay = userAnswer || 'Not answered';
        isCorrect = normalize(userAnswer) === normalize(correctAnswer);
        if (isCorrect) {
          score++;
          textInput.classList.add('correct');
        } else {
          textInput.classList.add('incorrect');
          const span = document.createElement('span');
          span.className = 'correct-answer-display';
          span.textContent = `→ ${correctAnswer}`;
          textInput.parentNode.insertBefore(span, textInput.nextSibling);
        }
      } else if (checkboxGroup.length > 0) {
        // Multi-correct MCQ: compare the checked set against the array.
        const correctSet = Array.isArray(correctAnswer) ? correctAnswer : [correctAnswer];
        const checked = Array.from(checkboxGroup).filter(c => c.checked).map(c => c.value);
        userAnswerDisplay = checked.length ? checked.join(', ') : 'Not answered';
        isCorrect = checked.length === correctSet.length && checked.every(v => correctSet.includes(v));
        checkboxGroup.forEach(c => {
          const label = c.closest('.multi-choice-option');
          if (!label) return;
          if (correctSet.includes(c.value)) label.classList.add('correct');
          else if (c.checked) label.classList.add('incorrect');
        });
        if (isCorrect) score++;
      } else if (radioGroup.length > 0) {
        const checkedRadio = document.querySelector(`input[name="q${i}"]:checked`);
        if (checkedRadio) {
          userAnswerDisplay = checkedRadio.value;
          isCorrect = checkedRadio.value === correctAnswer;
          const label = checkedRadio.closest('.tf-option, .multi-choice-option');
          if (label) label.classList.add(isCorrect ? 'correct' : 'incorrect');
        }
        if (isCorrect) {
          score++;
        } else {
          const container = radioGroup[0].closest('.tf-question, .multi-choice-question');
          if (container) {
            const candidates = container.querySelectorAll(`input[name="q${i}"]`);
            for (const cand of candidates) {
              if (cand.value === String(correctAnswer)) {
                const correctLabel = cand.closest('.tf-option, .multi-choice-option');
                if (correctLabel) correctLabel.classList.add('correct');
                break;
              }
            }
          }
        }
      }

      const correctText = Array.isArray(correctAnswer) ? correctAnswer.join(', ') : correctAnswer;
      resultsDetailsContainer.innerHTML += `
        <div class="result-row ${isCorrect ? 'correct' : 'incorrect'}">
          <span class="q-num">${i}</span>
          <span class="user-ans">${userAnswerDisplay}</span>
          <span class="correct-ans">${correctText}</span>
          <span class="status-badge ${isCorrect ? 'ok' : 'bad'}">${isCorrect ? 'Correct' : 'Incorrect'}</span>
        </div>`;

      const navButton = document.querySelector(`.subQuestion[onclick="goToQuestion(${i})"]`);
      if (navButton) {
        navButton.classList.remove('answered', 'active');
        navButton.classList.add(isCorrect ? 'correct' : 'incorrect');
      }
    }

    document.getElementById('results-score').textContent = score;
    document.getElementById('results-modal').classList.remove('hidden');

    deliverButton.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" fill="currentColor"/></svg><span>My Result</span>`;
    deliverButton.disabled = false;
    deliverButton.removeEventListener('click', checkAnswers);
    deliverButton.addEventListener('click', showResultsModal);
  }

  function showResultsModal() { document.getElementById('results-modal').classList.remove('hidden'); }
  window.closeResultsModal = function () { document.getElementById('results-modal').classList.add('hidden'); };

  // --- TIER-2 GRADING ---
  function pushResultRow(container, num, userDisplay, correctDisplay, isCorrect) {
    container.innerHTML += `
      <div class="result-row ${isCorrect ? 'correct' : 'incorrect'}">
        <span class="q-num">${num}</span>
        <span class="user-ans">${userDisplay}</span>
        <span class="correct-ans">${correctDisplay}</span>
        <span class="status-badge ${isCorrect ? 'ok' : 'bad'}">${isCorrect ? 'Correct' : 'Incorrect'}</span>
      </div>`;
  }
  function markNav(num, isCorrect) {
    const navButton = document.querySelector(`.subQuestion[onclick="goToQuestion(${num})"]`);
    if (navButton) {
      navButton.classList.remove('answered', 'active');
      navButton.classList.add(isCorrect ? 'correct' : 'incorrect');
    }
  }
  function textOf(qEl, itemId) {
    const el = qEl.querySelector('[data-item-id="' + itemId + '"]');
    return el ? (el.querySelector('.order-item-text') ? el.querySelector('.order-item-text').textContent : el.textContent).trim() : itemId;
  }

  function gradeTier2(num, answer) {
    const qEl = document.querySelector('.t2-question[data-qnum="' + num + '"]');
    if (!qEl) return { isCorrect: false, userAnswerDisplay: 'Not answered', correctDisplay: '' };

    if (answer.kind === 'order') {
      // Concatenate all rows (build_sentence has one .order-list per sentence;
      // order_paragraphs has a single row) in document order.
      const lists = [...qEl.querySelectorAll('.order-list')];
      const current = [];
      lists.forEach(list => list.querySelectorAll('.order-item').forEach(el => current.push(el.dataset.itemId)));
      const correct = answer.order;
      const isCorrect = current.length === correct.length && current.every((id, idx) => id === correct[idx]);
      // Per-item green/red at its concatenated position.
      let pos = 0;
      lists.forEach(list => list.querySelectorAll('.order-item').forEach(el => {
        el.classList.add(el.dataset.itemId === correct[pos] ? 'correct' : 'incorrect');
        pos++;
      }));
      return {
        isCorrect,
        userAnswerDisplay: current.map(id => textOf(qEl, id)).join(' / '),
        correctDisplay: correct.map(id => textOf(qEl, id)).join(' / '),
      };
    }

    if (answer.kind === 'sort') {
      const colOf = answer.columns; // itemId -> correct column index
      let allCorrect = true, anyPlaced = false;
      // Each chip: which zone is it in now?
      qEl.querySelectorAll('.sort-chip').forEach(chip => {
        const zone = chip.parentElement;
        const zoneIdx = zone.dataset.zone; // "pool" or a column index string
        const want = colOf[chip.dataset.itemId];
        const placedCol = zoneIdx === 'pool' ? -1 : parseInt(zoneIdx, 10);
        if (placedCol !== -1) anyPlaced = true;
        const ok = placedCol === want;
        chip.classList.add(ok ? 'correct' : 'incorrect');
        if (!ok) allCorrect = false;
      });
      const isCorrect = allCorrect && anyPlaced;
      // Build a readable "col: items" summary for the correct answer.
      const titles = [...qEl.querySelectorAll('.sort-column-title')].map(t => t.textContent);
      const byCol = {};
      Object.keys(colOf).forEach(id => { (byCol[colOf[id]] = byCol[colOf[id]] || []).push(textOf(qEl, id)); });
      const correctDisplay = Object.keys(byCol).map(ci => (titles[ci] || ('Col ' + ci)) + ': ' + byCol[ci].join(', ')).join(' | ');
      return { isCorrect, userAnswerDisplay: isCorrect ? 'All placed correctly' : 'See highlights', correctDisplay };
    }

    if (answer.kind === 'match') {
      const state = t2Match[num] || { links: {} };
      const pairs = answer.pairs; // leftId -> rightId
      const leftIds = Object.keys(pairs);
      let allCorrect = leftIds.length > 0;
      leftIds.forEach(leftId => {
        const chosen = state.links[leftId];
        const ok = chosen === pairs[leftId];
        if (!ok) allCorrect = false;
        const lb = qEl.querySelector('.match-left-item[data-item-id="' + leftId + '"]');
        if (lb) lb.classList.add(ok ? 'correct' : 'incorrect');
      });
      // colour right items by whether they were correctly linked
      qEl.querySelectorAll('.match-right-item').forEach(rb => {
        const rid = rb.dataset.itemId;
        const correctlyUsed = leftIds.some(l => pairs[l] === rid && state.links[l] === rid);
        const wronglyUsed = Object.keys(state.links).some(l => state.links[l] === rid && pairs[l] !== rid);
        if (correctlyUsed) rb.classList.add('correct');
        else if (wronglyUsed) rb.classList.add('incorrect');
      });
      const userDisplay = leftIds.map(l => textOf(qEl, l) + '→' + (state.links[l] ? textOf(qEl, state.links[l]) : '?')).join('; ');
      const correctDisplay = leftIds.map(l => textOf(qEl, l) + '→' + textOf(qEl, pairs[l])).join('; ');
      return { isCorrect: allCorrect, userAnswerDisplay: userDisplay || 'Not answered', correctDisplay };
    }

    return { isCorrect: false, userAnswerDisplay: 'Not answered', correctDisplay: '' };
  }


  // --- NAVIGATION ---
  // Single-part skeleton today; switchToPart is kept as the seam a future
  // course-level (multi-unit) export hooks into without touching goToQuestion.
  function switchToPart(_partNumber) { goToQuestion(1); }
  window.switchToPart = switchToPart;

  function goToQuestion(questionNumber) {
    currentQuestion = questionNumber;
    if (activeQuestionElement) {
      activeQuestionElement.classList.remove('active-question', 'active-input');
      const prevBlock = activeQuestionElement.closest('[data-q-start]');
      if (prevBlock) prevBlock.classList.remove('active-question');
    }

    let targetEl = document.getElementById(`q${questionNumber}`);
    if (targetEl) {
      activeQuestionElement = targetEl;
      targetEl.classList.add('active-input');
      scrollIntoViewIfNeeded(targetEl);
    } else {
      targetEl = document.querySelector(`[data-q-start="${questionNumber}"]`);
      if (targetEl) {
        activeQuestionElement = targetEl;
        targetEl.classList.add('active-question');
        scrollIntoViewIfNeeded(targetEl);
      }
    }
    updateNavigation();
  }
  window.goToQuestion = goToQuestion;
  window.nextQuestion = () => currentQuestion < totalQuestions && goToQuestion(currentQuestion + 1);
  window.previousQuestion = () => currentQuestion > 1 && goToQuestion(currentQuestion - 1);

  function updateNavigation() {
    document.querySelectorAll('.subQuestion').forEach(btn => btn.classList.remove('active'));
    const activeNav = document.querySelector(`.subQuestion[onclick="goToQuestion(${currentQuestion})"]`);
    if (activeNav) activeNav.classList.add('active');

    document.querySelectorAll('.answer-input').forEach(input => input.classList.remove('active-input'));
    const activeInput = document.getElementById(`q${currentQuestion}`);
    if (activeInput) {
      activeInput.classList.add('active-input');
      if (typeof activeInput.focus === 'function') activeInput.focus();
    } else {
      const block = document.querySelector(`.tf-question[data-q-start="${currentQuestion}"]`)
        || document.querySelector(`.multi-choice-question[data-q-start="${currentQuestion}"]`);
      if (block) {
        block.classList.add('active-question');
        const firstInput = block.querySelector('input');
        if (firstInput) firstInput.classList.add('active-input');
      }
    }
  }

  function updateAllIndicators() {
    let answeredCount = 0;
    for (let i = 1; i <= totalQuestions; i++) if (isQuestionAnswered(i)) answeredCount++;
    const countEl = document.getElementById('attempted-count');
    if (countEl) countEl.textContent = `${answeredCount} of ${totalQuestions}`;

    document.querySelectorAll('.subQuestion').forEach((btn) => {
      const match = (btn.getAttribute('onclick') || '').match(/goToQuestion\((\d+)\)/);
      const qNum = match ? parseInt(match[1], 10) : NaN;
      if (!isNaN(qNum)) btn.classList.toggle('answered', isQuestionAnswered(qNum));
    });
  }

  function isQuestionAnswered(qNum) {
    const textInput = document.getElementById(`q${qNum}`);
    if (textInput && textInput.value && textInput.value.trim() !== '') return true;
    if (document.querySelector(`input[name="q${qNum}"]:checked`)) return true;
    // Tier-2: sort = any chip moved out of the pool; match = any link made;
    // order lists start arranged so count as always in-progress once present.
    const t2 = document.querySelector('.t2-question[data-qnum="' + qNum + '"]');
    if (t2) {
      const kind = t2.dataset.kind;
      if (kind === 'order') return true;
      if (kind === 'sort') {
        return [...t2.querySelectorAll('.sort-dropzone')].some(z => z.querySelector('.sort-chip'));
      }
      if (kind === 'match') {
        const st = t2Match[qNum];
        return !!(st && Object.keys(st.links).length > 0);
      }
    }
    return false;
  }

  function scrollIntoViewIfNeeded(element) {
    const panel = element.closest('.questions-panel, .passage-panel');
    if (!panel) return;
    const panelRect = panel.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    if (elementRect.top < panelRect.top || elementRect.bottom > panelRect.bottom) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  // --- TIMER ---
  function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      timeInSeconds--;
      const minutes = Math.floor(timeInSeconds / 60);
      const seconds = timeInSeconds % 60;
      timerDisplay.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
      if (timeInSeconds <= 0) {
        clearInterval(timerInterval);
        timerDisplay.textContent = "Time's up!";
      }
    }, 1000);
    timerToggleButton.innerHTML = pauseIcon;
  }
  function pauseTimer() { clearInterval(timerInterval); timerToggleButton.innerHTML = playIcon; }
  function toggleTimer() {
    if (timerToggleButton.innerHTML.includes('M6 19h4V5H6v14z')) pauseTimer(); else startTimer();
  }
  function resetTimer() {
    timeInSeconds = 3600;
    const minutes = Math.floor(timeInSeconds / 60);
    const seconds = timeInSeconds % 60;
    timerDisplay.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    startTimer();
  }

  // --- RESIZER ---
  function initResize(e) {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = passagePanel.offsetWidth;
    const doDrag = (e) => {
      const newWidth = startWidth + e.clientX - startX;
      if (newWidth > 220 && (document.body.clientWidth - newWidth - resizer.offsetWidth) > 220) {
        passagePanel.style.flex = `0 0 ${newWidth}px`;
      }
    };
    const stopDrag = () => {
      window.removeEventListener('mousemove', doDrag, false);
      window.removeEventListener('mouseup', stopDrag, false);
    };
    window.addEventListener('mousemove', doDrag, false);
    window.addEventListener('mouseup', stopDrag, false);
  }

  initialize();
});
</script>
</body>
</html>
"""

_TPL_TRUE_FALSE = r"""\
{#
  app/templates/export/_true_false.html.j2

  Renders one QuestionGroup of kind "true_false". Reuses the reference
  file's .tf-question / .tf-options / .tf-option markup and classes, but
  with two options (true/false) instead of the IELTS file's three-way
  TRUE/FALSE/NOT GIVEN — our TrueFalseBlock.tsx data model is binary.

  Expects `group` (a QuestionGroup with .true_false_questions populated)
  in scope, provided by the {% include %} loop in unit_export.html.j2.
#}
<div class="question" data-q-start="{{ group.true_false_questions[0].number }}" data-q-end="{{ group.true_false_questions[-1].number }}">
  {% if group.title %}<div class="question-group-title">{{ group.title }}</div>{% endif %}
  {% for q in group.true_false_questions %}
  <div class="tf-question" data-q-start="{{ q.number }}" data-q-end="{{ q.number }}">
    <div class="tf-question-line">
      <span class="tf-question-number">{{ q.number }}</span>
      <span class="tf-question-text">{{ q.prompt }}</span>
    </div>
    <div class="tf-options">
      <label class="tf-option"><input type="radio" name="q{{ q.number }}" value="true"> True</label>
      <label class="tf-option"><input type="radio" name="q{{ q.number }}" value="false"> False</label>
    </div>
  </div>
  {% endfor %}
</div>
"""

_TPL_GAP_FILL = r"""\
{#
  app/templates/export/_gap_fill.html.j2

  Renders one QuestionGroup of kind "gap_fill" (type_word_in_gap or drag_to_gap).
  Walks the pre-normalised `fragments` list in document order, emitting text
  verbatim and an `.answer-input` for each gap — exactly the reference
  file's "answer-input inline in prose" pattern, but driven by our
  segments/gaps data model instead of hardcoded notes-completion HTML.

  Expects `group` (a QuestionGroup with .gap_fill_block populated) in scope.
#}
{% set gap_numbers = group.gap_fill_block.fragments | selectattr('0', 'equalto', 'gap') | map(attribute='1') | list %}
{% if gap_numbers %}
<div class="question"
     data-q-start="{{ gap_numbers[0] }}"
     data-q-end="{{ gap_numbers[-1] }}">
  {% if group.gap_fill_block.title %}<div class="question-group-title">{{ group.gap_fill_block.title }}</div>{% endif %}
  <div class="gap-fill-block">
    <p>
    {%- for kind, value in group.gap_fill_block.fragments -%}
      {%- if kind == "text" -%}{{ value }}{%- else -%}<input type="text" class="answer-input" id="q{{ value }}" placeholder="{{ value }}">{%- endif -%}
    {%- endfor -%}
    </p>
  </div>
</div>
{% endif %}
"""

_TPL_MULTIPLE_CHOICE = r"""\
{#
  app/templates/export/_multiple_choice.html.j2

  Renders one QuestionGroup of kind "multiple_choice" — the questions
  loaded from a test_with_timer / test_without_timer block via the
  Test → TestQuestion → Question chain. Reuses the reference file's
  .multi-choice-question / .multi-choice-option pattern; radio when there's
  exactly one correct option, checkbox when there are several (mirrors
  question_service.py's correct_option_ids contract — see
  normalise_test_block() / _mc_draft_to_question() in export_service.py).

  Expects `group` (a QuestionGroup with .multiple_choice_questions
  populated) in scope.
#}
{% if group.title %}<div class="question-group-title">{{ group.title }}</div>{% endif %}
{% for q in group.multiple_choice_questions %}
<div class="multi-choice-question" data-q-start="{{ q.number }}" data-q-end="{{ q.number }}">
  <div class="question-prompt-text">
    <span class="q-num-badge">{{ q.number }}</span>
    <span>{{ q.prompt }}</span>
  </div>
  <div class="multi-choice-options">
    {% for opt in q.options %}
    <label class="multi-choice-option">
      <input type="{{ 'checkbox' if q.multi else 'radio' }}" name="q{{ q.number }}" value="{{ opt.id }}">
      {{ opt.text }}
    </label>
    {% endfor %}
  </div>
</div>
{% endfor %}
"""

_TPL_PASSAGE_TEXT = r"""\
{#
  app/templates/export/_passage_text.html.j2

  Renders one PassageBlock (a "text" media block — grammar rules, vocab
  notes, etc.) in the left panel. The HTML body is pre-rendered in Python
  by markdown_to_html() / normalise_text_block() in export_service.py —
  this partial is intentionally a thin wrapper so the "one partial per
  kind" convention stays uniform even though passage blocks need no
  question-numbering logic at the template layer.

  Not currently {% include %}-ed from unit_export.html.j2 (which inlines
  `block.html` directly in its passage-panel loop for one fewer indirection)
  — kept as the documented per-kind partial for the extension-point
  convention described in export_service.py's docstring, and as the seam to
  switch to if passage rendering ever needs template-level logic (e.g. a
  per-block heading style that differs from the gradable partials).

  Expects `block` (a PassageBlock) in scope.
#}
<div class="reading-passage passage-block">{{ block.html | safe }}</div>
"""



# ── Tier-2 partials ─────────────────────────────────────────────────────────────
#
# Each renders one question into a draggable widget. The student arranges
# items; the embedded grader (see _TPL_UNIT_EXPORT's <script>) reads the
# data-* answer keys and the live DOM order at Check-time. No per-question
# JS here — the partials are pure markup with data-attributes the generic
# grader understands.

# ORDER (build_sentence, order_paragraphs): a vertical list of draggable rows.
# Items are pre-scrambled by the server so the initial order is not the answer.
_TPL_ORDER = r"""\
{% for q in group.order_questions %}
<div class="t2-question order-question" data-q-start="{{ q.number }}" data-q-end="{{ q.number }}"
     data-kind="order" data-qnum="{{ q.number }}">
  <div class="question-prompt-text">
    <span class="q-num-badge">{{ q.number }}</span>
    <span>{{ q.prompt }}</span>
  </div>
  {% set multi = q.rows | length > 1 %}
  {% for row in q.rows %}
  <div class="order-row{% if multi %} order-row-labeled{% endif %}">
    {% if multi %}<div class="order-row-label">Sentence {{ loop.index }}</div>{% endif %}
    <div class="order-list" data-qnum="{{ q.number }}" data-row="{{ loop.index0 }}">
      {% for item in row %}
      <div class="order-item" draggable="true" data-item-id="{{ item.id }}">
        <span class="drag-handle" aria-hidden="true">⋮⋮</span>
        <span class="order-item-text">{{ item.text }}</span>
      </div>
      {% endfor %}
    </div>
  </div>
  {% endfor %}
</div>
{% endfor %}
"""

# SORT (sort_into_columns): a pool of chips + N column drop-zones.
_TPL_SORT = r"""\
{% for q in group.sort_questions %}
<div class="t2-question sort-question" data-q-start="{{ q.number }}" data-q-end="{{ q.number }}"
     data-kind="sort" data-qnum="{{ q.number }}">
  <div class="question-prompt-text">
    <span class="q-num-badge">{{ q.number }}</span>
    <span>{{ q.prompt }}</span>
  </div>
  <div class="sort-pool" id="sort-pool-{{ q.number }}" data-qnum="{{ q.number }}" data-zone="pool">
    {% for item in q.scrambled %}
    <div class="sort-chip" draggable="true" data-item-id="{{ item.id }}">{{ item.text }}</div>
    {% endfor %}
  </div>
  <div class="sort-columns">
    {% for col in q.columns %}
    <div class="sort-column">
      <div class="sort-column-title">{{ col.title }}</div>
      <div class="sort-dropzone" data-qnum="{{ q.number }}" data-zone="{{ loop.index0 }}"></div>
    </div>
    {% endfor %}
  </div>
</div>
{% endfor %}
"""

# MATCH (match_pairs): two columns; click a left then a right to link them.
_TPL_MATCH = r"""\
{% for q in group.match_questions %}
<div class="t2-question match-question" data-q-start="{{ q.number }}" data-q-end="{{ q.number }}"
     data-kind="match" data-qnum="{{ q.number }}">
  <div class="question-prompt-text">
    <span class="q-num-badge">{{ q.number }}</span>
    <span>{{ q.prompt }}</span>
  </div>
  <div class="match-grid" id="match-grid-{{ q.number }}" data-qnum="{{ q.number }}">
    <div class="match-col match-left">
      {% for item in q.left_items %}
      <button type="button" class="match-item match-left-item" data-side="left" data-item-id="{{ item.id }}">{{ item.text }}</button>
      {% endfor %}
    </div>
    <div class="match-col match-right">
      {% for item in q.right_scrambled %}
      <button type="button" class="match-item match-right-item" data-side="right" data-item-id="{{ item.id }}">{{ item.text }}</button>
      {% endfor %}
    </div>
  </div>
  <div class="match-pairs-list" id="match-pairs-{{ q.number }}"></div>
</div>
{% endfor %}
"""


# ── Registry + environment ──────────────────────────────────────────────────────

def _clean_template(src: str) -> str:
    """
    Each _TPL_* constant is written as r\"\"\"\\<newline>...  The leading
    backslash was intended as a line-continuation to swallow the first
    newline, but in a RAW string the backslash is literal — so it leaked a
    stray '\\' into rendered output (visible at the very top of the export).
    Strip a single leading backslash and the surrounding newline here so the
    fix applies uniformly to every template without editing 8 constants.
    """
    if src.startswith("\\"):
        src = src[1:]
    return src.lstrip("\n")


_EXPORT_TEMPLATES: dict[str, str] = {
    "export/unit_export.html.j2": _clean_template(_TPL_UNIT_EXPORT),
    "export/_true_false.html.j2": _clean_template(_TPL_TRUE_FALSE),
    "export/_gap_fill.html.j2": _clean_template(_TPL_GAP_FILL),
    "export/_multiple_choice.html.j2": _clean_template(_TPL_MULTIPLE_CHOICE),
    "export/_passage_text.html.j2": _clean_template(_TPL_PASSAGE_TEXT),
    "export/_order.html.j2": _clean_template(_TPL_ORDER),
    "export/_sort.html.j2": _clean_template(_TPL_SORT),
    "export/_match.html.j2": _clean_template(_TPL_MATCH),
}

_export_jinja_env = Environment(
    loader=DictLoader(_EXPORT_TEMPLATES),
    autoescape=select_autoescape(["html.j2", "j2"], default=True),
)


def _scramble(ids_or_items: list, seed: str) -> list:
    """
    Deterministic scramble so the initial on-screen order is not the answer,
    but is stable across re-renders of the same question. Uses a simple
    seeded key sort (no RNG state, no external dep). Guarantees the result
    differs from the input when there are >= 2 distinct items.
    """
    import hashlib

    def key(idx: int, item) -> str:
        ident = getattr(item, "id", None) or str(item)
        return hashlib.md5(f"{seed}:{ident}".encode()).hexdigest()

    indexed = list(enumerate(ids_or_items))
    shuffled = sorted(indexed, key=lambda pair: key(pair[0], pair[1]))
    result = [item for _, item in shuffled]
    # If the hash happened to preserve order, rotate by one so students never
    # see the answer pre-arranged.
    if len(result) >= 2 and all(a is b for a, b in zip(result, ids_or_items)):
        result = result[1:] + result[:1]
    return result


def render_export(ctx: ExportContext) -> str:
    """
    Render an ExportContext to the final self-contained HTML string.

    Attaches server-side scrambled orderings to each Tier-2 question so the
    initial layout never reveals the answer key. Scramble is deterministic
    per (unit_title, question_number) so re-exports are byte-stable unless the
    content changes.
    """
    for group in ctx.question_groups:
        if group.kind == "order":
            for q in group.order_questions:
                # Build rows honouring group_sizes (build_sentence: one row per
                # sentence, each its own word bank — matches BuildSentenceBlock).
                # order_paragraphs has no group_sizes → a single row.
                by_id = {it.id: it for it in q.items}
                rows: list[list] = []
                if q.group_sizes and sum(q.group_sizes) == len(q.correct_order):
                    cursor = 0
                    for r_idx, size in enumerate(q.group_sizes):
                        row_ids = q.correct_order[cursor:cursor + size]
                        cursor += size
                        row_items = [by_id[i] for i in row_ids if i in by_id]
                        rows.append(_scramble(list(row_items), f"{ctx.unit_title}:{q.number}:row{r_idx}"))
                else:
                    ordered = [by_id[i] for i in q.correct_order if i in by_id]
                    rows.append(_scramble(list(ordered), f"{ctx.unit_title}:{q.number}"))
                q.rows = rows
                # Flat scramble kept for backwards compatibility / single-row use.
                q.scrambled = [it for row in rows for it in row]
        elif group.kind == "sort":
            for q in group.sort_questions:
                q.scrambled = _scramble(list(q.items), f"{ctx.unit_title}:{q.number}")
        elif group.kind == "match":
            for q in group.match_questions:
                q.right_scrambled = _scramble(list(q.right_items), f"{ctx.unit_title}:{q.number}:r")

    template = _export_jinja_env.get_template("export/unit_export.html.j2")
    html = template.render(
        unit_title=ctx.unit_title,
        passage_blocks=ctx.passage_blocks,
        question_groups=ctx.question_groups,
        correct_answers=ctx.correct_answers,
        total_questions=ctx.total_questions,
    )
    # Strip any leading whitespace left by the top-of-file Jinja comment so the
    # file starts cleanly at <!DOCTYPE html>.
    return html.lstrip()