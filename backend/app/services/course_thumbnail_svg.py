"""
app/services/course_thumbnail_svg.py
=====================================
Generates 360×360 square SVG course thumbnails matching AdminCoursesCatalog
card aspect-ratio (1/1).

Background colour rule: NEVER use a hue that appears in the flag.
  English  — charcoal dark  (flag: blue/red/white  → dark neutral grey)
  Italian  — dark teal      (flag: green/white/red → teal/slate)
  Spanish  — dark forest    (flag: red/yellow      → deep forest green)
  German   — dark slate     (flag: black/red/gold  → deep blue-slate)
  French   — dark olive     (flag: blue/white/red  → dark olive/brown)
  Others   — language-keyed dark neutral
"""

from __future__ import annotations
import base64, html

__all__ = ["build_course_thumbnail_svg", "build_course_thumbnail_data_uri"]

# ── helpers ───────────────────────────────────────────────────────────────────

def _esc(t: str) -> str:
    return html.escape(str(t), quote=False)

def _trunc(text: str, n: int = 18) -> str:
    return text if len(text) <= n else text[:n-1].rstrip() + "…"

_LEVEL_COLORS = {
    "A1": ("#22C55E","#fff"), "A2": ("#16A34A","#fff"),
    "B1": ("#6C6FEF","#fff"), "B2": ("#4F52C2","#fff"),
    "C1": ("#DC2626","#fff"), "C2": ("#9F1239","#fff"),
    "mixed": ("#F59E0B","#fff"),
}

def _badge(level: str, x: float, y: float) -> str:
    bg, fg = _LEVEL_COLORS.get(level.upper(), ("#6C6FEF","#fff"))
    return (
        f'<rect x="{x}" y="{y}" width="44" height="22" rx="11" fill="{bg}"/>'
        f'<text x="{x+22}" y="{y+15}" text-anchor="middle" '
        f'font-family="\'Inter\',system-ui,sans-serif" font-size="11" '
        f'font-weight="800" fill="{fg}">{_esc(level.upper())}</text>'
    )

def _title_and_badge(title: str, level: str) -> str:
    t = _trunc(title, 18)
    if len(t) > 10 and " " in t:
        words = t.split()
        mid = max(1, len(words)//2)
        l1, l2 = " ".join(words[:mid]), " ".join(words[mid:])
        tsv = (
            f'<text x="20" y="36" font-family="\'Inter\',system-ui,sans-serif" '
            f'font-size="22" font-weight="800" fill="#fff" filter="url(#ts)">{_esc(l1)}</text>'
            f'<text x="20" y="61" font-family="\'Inter\',system-ui,sans-serif" '
            f'font-size="22" font-weight="800" fill="#fff" filter="url(#ts)">{_esc(l2)}</text>'
        )
        by = 71
    else:
        tsv = (
            f'<text x="20" y="44" font-family="\'Inter\',system-ui,sans-serif" '
            f'font-size="24" font-weight="800" fill="#fff" filter="url(#ts)">{_esc(t)}</text>'
        )
        by = 54
    return tsv + "\n" + _badge(level, 20, by)

def _shadow_def() -> str:
    return (
        '<filter id="ts" x="-5%" y="-5%" width="110%" height="110%">'
        '<feDropShadow dx="0" dy="1" stdDeviation="2" flood-color="rgba(0,0,0,0.65)"/>'
        '</filter>'
    )

def _dot_grid() -> str:
    return (
        '<pattern id="dt" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">'
        '<circle cx="2" cy="2" r="1" fill="rgba(255,255,255,0.04)"/>'
        '</pattern>'
        '<rect width="360" height="360" fill="url(#dt)"/>'
    )

def _left_vignette(bg_color: str, stop_pct: str = "42%") -> str:
    """Fades the flag's left edge into the background colour."""
    return (
        f'<linearGradient id="vig" x1="0" y1="0" x2="1" y2="0">'
        f'<stop offset="0%"    stop-color="{bg_color}" stop-opacity="1"/>'
        f'<stop offset="{stop_pct}" stop-color="{bg_color}" stop-opacity="0"/>'
        f'</linearGradient>'
        f'<rect width="360" height="360" fill="url(#vig)"/>'
    )

def _bottom_bar(label: str) -> str:
    return (
        f'<rect x="0" y="325" width="360" height="35" fill="rgba(0,0,0,0.30)"/>'
        f'<text x="20" y="347" font-family="\'Inter\',system-ui,sans-serif" '
        f'font-size="11" font-weight="600" fill="rgba(255,255,255,0.60)">{_esc(label)}</text>'
    )

def _wrap(inner: str) -> str:
    return '<svg viewBox="0 0 360 360" xmlns="http://www.w3.org/2000/svg">' + inner + '</svg>'


# ── shared icon strips ────────────────────────────────────────────────────────

def _icons_language() -> str:
    """Speech bubble + book + tea cup + headphones."""
    return """
<g transform="translate(20,280)">
  <rect x="0" y="0" width="52" height="34" rx="10" fill="rgba(255,255,255,0.09)" stroke="rgba(255,255,255,0.20)" stroke-width="1.5"/>
  <polygon points="9,34 4,46 20,34" fill="rgba(255,255,255,0.09)"/>
  <rect x="7"  y="9"  width="38" height="4" rx="2" fill="rgba(255,255,255,0.45)"/>
  <rect x="7"  y="18" width="26" height="4" rx="2" fill="rgba(255,255,255,0.28)"/>
</g>
<g transform="translate(90,280)">
  <rect x="0" y="4" width="52" height="34" rx="4" fill="rgba(255,255,255,0.09)" stroke="rgba(255,255,255,0.20)" stroke-width="1.5"/>
  <line x1="26" y1="4" x2="26" y2="38" stroke="rgba(255,255,255,0.28)" stroke-width="1.5"/>
  <rect x="5"  y="12" width="14" height="3" rx="1.5" fill="rgba(255,255,255,0.40)"/>
  <rect x="5"  y="19" width="14" height="3" rx="1.5" fill="rgba(255,255,255,0.24)"/>
  <rect x="33" y="12" width="14" height="3" rx="1.5" fill="rgba(255,255,255,0.40)"/>
  <rect x="33" y="19" width="14" height="3" rx="1.5" fill="rgba(255,255,255,0.24)"/>
</g>
<g transform="translate(160,280)">
  <path d="M5 8 L47 8 L41 40 L11 40 Z" fill="rgba(255,255,255,0.09)" stroke="rgba(255,255,255,0.20)" stroke-width="1.5"/>
  <path d="M47 14 Q58 14 58 22 Q58 30 47 30" fill="none" stroke="rgba(255,255,255,0.26)" stroke-width="2" stroke-linecap="round"/>
  <path d="M17 3 Q19 0 17 -3" fill="none" stroke="rgba(255,255,255,0.26)" stroke-width="1.5" stroke-linecap="round"/>
  <path d="M26 3 Q28 0 26 -3" fill="none" stroke="rgba(255,255,255,0.26)" stroke-width="1.5" stroke-linecap="round"/>
  <path d="M35 3 Q37 0 35 -3" fill="none" stroke="rgba(255,255,255,0.26)" stroke-width="1.5" stroke-linecap="round"/>
</g>
<g transform="translate(234,278)">
  <path d="M7 24 Q7 4 26 4 Q45 4 45 24" fill="none" stroke="rgba(255,255,255,0.30)" stroke-width="2.5" stroke-linecap="round"/>
  <rect x="1"  y="20" width="11" height="17" rx="5.5" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.20)" stroke-width="1.5"/>
  <rect x="40" y="20" width="11" height="17" rx="5.5" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.20)" stroke-width="1.5"/>
</g>"""


# ══════════════════════════════════════════════════════════════════════════════
#  ENGLISH  —  charcoal bg · Union Jack · Big Ben
# ══════════════════════════════════════════════════════════════════════════════

def _english_thumbnail(title: str, level: str) -> str:
    BG = "#1c1c1e"
    return _wrap(f"""
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1" gradientUnits="objectBoundingBox">
    <stop offset="0%"   stop-color="#1c1c1e"/>
    <stop offset="100%" stop-color="#111113"/>
  </linearGradient>
  {_shadow_def()}
  {_left_vignette(BG, "42%")}
</defs>
<rect width="360" height="360" fill="url(#bg)"/>
{_dot_grid()}

<!-- Union Jack  x=160 y=65  w=190 h=210 -->
<g transform="translate(160,65)">
  <rect x="0" y="0" width="190" height="210" fill="#012169"/>
  <line x1="0"   y1="0"   x2="190" y2="210" stroke="#fff"    stroke-width="30"/>
  <line x1="190" y1="0"   x2="0"   y2="210" stroke="#fff"    stroke-width="30"/>
  <line x1="0"   y1="0"   x2="190" y2="210" stroke="#C8102E" stroke-width="11"/>
  <line x1="190" y1="0"   x2="0"   y2="210" stroke="#C8102E" stroke-width="11"/>
  <rect x="80"  y="0"   width="30" height="210" fill="#fff"/>
  <rect x="0"   y="90"  width="190" height="30" fill="#fff"/>
  <rect x="85"  y="0"   width="20" height="210" fill="#C8102E"/>
  <rect x="0"   y="95"  width="190" height="20" fill="#C8102E"/>
</g>
<rect width="360" height="360" fill="url(#vig)"/>

<!-- Big Ben -->
<g transform="translate(38,100)" fill="#888896" opacity="0.50">
  <rect x="14" y="110" width="28" height="110" rx="2"/>
  <rect x="8"  y="68"  width="40" height="48"  rx="3"/>
  <circle cx="28" cy="92" r="15" fill="#1c1c1e" opacity="0.9"/>
  <circle cx="28" cy="92" r="14" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="1.5"/>
  <line x1="28" y1="92" x2="28" y2="82" stroke="rgba(255,255,255,0.45)" stroke-width="2" stroke-linecap="round"/>
  <line x1="28" y1="92" x2="36" y2="92" stroke="rgba(255,255,255,0.45)" stroke-width="2" stroke-linecap="round"/>
  <polygon points="28,0 38,68 18,68"/>
  <rect x="8"  y="62" width="7" height="9" rx="2"/>
  <rect x="18" y="62" width="7" height="9" rx="2"/>
  <rect x="29" y="62" width="7" height="9" rx="2"/>
  <rect x="40" y="62" width="7" height="9" rx="2"/>
</g>

{_icons_language()}
{_bottom_bar("English Course")}
{_title_and_badge(title, level)}
""")


# ══════════════════════════════════════════════════════════════════════════════
#  ITALIAN  —  dark teal bg · Tricolore · Colosseum
# ══════════════════════════════════════════════════════════════════════════════

def _italian_thumbnail(title: str, level: str) -> str:
    BG = "#0f2027"
    return _wrap(f"""
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1" gradientUnits="objectBoundingBox">
    <stop offset="0%"   stop-color="#0f2027"/>
    <stop offset="100%" stop-color="#091519"/>
  </linearGradient>
  {_shadow_def()}
  {_left_vignette(BG, "48%")}
</defs>
<rect width="360" height="360" fill="url(#bg)"/>
{_dot_grid()}

<!-- Italian tricolore  3×57px bands -->
<g transform="translate(189,40)">
  <rect x="0"   y="0" width="57" height="290" fill="#009246"/>
  <rect x="57"  y="0" width="57" height="290" fill="#ffffff"/>
  <rect x="114" y="0" width="57" height="290" fill="#CE2B37"/>
</g>
<rect width="360" height="360" fill="url(#vig)"/>

<!-- Colosseum -->
<g transform="translate(24,130)" fill="#4a6070" opacity="0.55">
  <rect x="0"  y="60" width="140" height="150" rx="3"/>
  <rect x="10" y="168" width="20" height="42" rx="10 10 0 0" fill="#0f2027"/>
  <rect x="38" y="168" width="20" height="42" rx="10 10 0 0" fill="#0f2027"/>
  <rect x="66" y="168" width="20" height="42" rx="10 10 0 0" fill="#0f2027"/>
  <rect x="94" y="168" width="20" height="42" rx="10 10 0 0" fill="#0f2027"/>
  <rect x="10" y="110" width="20" height="44" rx="10 10 0 0" fill="#0f2027"/>
  <rect x="38" y="110" width="20" height="44" rx="10 10 0 0" fill="#0f2027"/>
  <rect x="66" y="110" width="20" height="44" rx="10 10 0 0" fill="#0f2027"/>
  <rect x="94" y="110" width="20" height="44" rx="10 10 0 0" fill="#0f2027"/>
  <rect x="10" y="60"  width="20" height="38" rx="10 10 0 0" fill="#0f2027"/>
  <rect x="38" y="60"  width="20" height="38" rx="10 10 0 0" fill="#0f2027"/>
  <rect x="66" y="60"  width="20" height="38" rx="10 10 0 0" fill="#0f2027"/>
  <rect x="94" y="60"  width="20" height="38" rx="10 10 0 0" fill="#0f2027"/>
</g>

<!-- Italian icons: pizza · pasta · gondola · ciao -->
<g transform="translate(20,278)">
  <path d="M26 0 L52 46 L0 46 Z" fill="rgba(255,200,60,0.14)" stroke="rgba(255,200,60,0.35)" stroke-width="1.5" stroke-linejoin="round"/>
  <circle cx="20" cy="32" r="4"   fill="rgba(200,38,38,0.45)"/>
  <circle cx="32" cy="22" r="3.5" fill="rgba(200,38,38,0.45)"/>
  <circle cx="36" cy="36" r="3"   fill="rgba(200,38,38,0.35)"/>
</g>
<g transform="translate(88,278)">
  <path d="M0 22 Q0 46 26 46 Q52 46 52 22 Z" fill="rgba(255,180,80,0.13)" stroke="rgba(255,180,80,0.32)" stroke-width="1.5"/>
  <ellipse cx="26" cy="22" rx="26" ry="7" fill="rgba(255,180,80,0.18)" stroke="rgba(255,180,80,0.28)" stroke-width="1"/>
  <path d="M10 27 Q16 19 22 27 Q28 35 34 27 Q40 19 46 27" fill="none" stroke="rgba(255,210,120,0.50)" stroke-width="2" stroke-linecap="round"/>
</g>
<g transform="translate(158,278)">
  <ellipse cx="30" cy="48" rx="30" ry="5" fill="none" stroke="rgba(100,180,255,0.25)" stroke-width="1.5"/>
  <path d="M2 38 Q8 12 30 12 Q52 12 58 38 Q52 46 30 48 Q8 46 2 38Z" fill="rgba(20,20,40,0.50)" stroke="rgba(255,255,255,0.18)" stroke-width="1"/>
  <path d="M58 38 Q64 30 62 22 Q60 16 57 14" fill="none" stroke="rgba(255,210,50,0.45)" stroke-width="2" stroke-linecap="round"/>
  <line x1="42" y1="12" x2="42" y2="-2" stroke="rgba(255,255,255,0.38)" stroke-width="2" stroke-linecap="round"/>
</g>
<g transform="translate(236,278)">
  <rect x="0" y="0" width="52" height="34" rx="10" fill="rgba(255,255,255,0.09)" stroke="rgba(255,255,255,0.20)" stroke-width="1.5"/>
  <polygon points="9,34 4,46 20,34" fill="rgba(255,255,255,0.09)"/>
  <text x="26" y="22" text-anchor="middle" font-family="'Inter',system-ui,sans-serif" font-size="10" font-weight="700" fill="rgba(255,255,255,0.65)">Ciao!</text>
</g>

{_bottom_bar("Italian Course · Italiano")}
{_title_and_badge(title, level)}
""")


# ══════════════════════════════════════════════════════════════════════════════
#  SPANISH  —  deep forest green bg · Spanish flag · flamenco/guitar icons
#  Flag: red (top) / yellow (middle) / red (bottom)  →  bg must NOT be red
# ══════════════════════════════════════════════════════════════════════════════

def _spanish_thumbnail(title: str, level: str) -> str:
    BG = "#0d2818"   # deep forest green — nothing like red or yellow
    return _wrap(f"""
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1" gradientUnits="objectBoundingBox">
    <stop offset="0%"   stop-color="#0d2818"/>
    <stop offset="100%" stop-color="#071610"/>
  </linearGradient>
  {_shadow_def()}
  {_left_vignette(BG, "44%")}
</defs>
<rect width="360" height="360" fill="url(#bg)"/>
{_dot_grid()}

<!-- Spanish flag  3 horizontal bands: red/yellow/red  ratio 1:2:1 -->
<!-- Total height 240, top-red=60, yellow=120, bottom-red=60  -->
<g transform="translate(165,60)">
  <rect x="0" y="0"   width="190" height="60"  fill="#AA151B"/>
  <rect x="0" y="60"  width="190" height="120" fill="#F1BF00"/>
  <rect x="0" y="180" width="190" height="60"  fill="#AA151B"/>
</g>
<rect width="360" height="360" fill="url(#vig)"/>

<!-- Flamenco dancer silhouette (simple) -->
<g transform="translate(55,95)" fill="#1a5c30" opacity="0.70">
  <!-- body -->
  <ellipse cx="30" cy="32" rx="10" ry="14"/>
  <!-- head -->
  <circle cx="30" cy="14" r="9"/>
  <!-- dress flare -->
  <path d="M20 42 Q5 90 0 130 L60 130 Q55 90 40 42 Z"/>
  <!-- arms raised -->
  <path d="M20 32 Q8 20 4 10" fill="none" stroke="#1a5c30" stroke-width="6" stroke-linecap="round"/>
  <path d="M40 32 Q52 20 56 10" fill="none" stroke="#1a5c30" stroke-width="6" stroke-linecap="round"/>
  <!-- fan (right hand) -->
  <path d="M56 10 Q66 2 72 8 Q68 16 56 10Z"/>
</g>

<!-- Spanish icons: guitar · sun · book · ¡Hola! -->
<g transform="translate(20,278)">
  <!-- guitar body -->
  <ellipse cx="14" cy="32" rx="14" ry="16" fill="rgba(241,191,0,0.15)" stroke="rgba(241,191,0,0.38)" stroke-width="1.5"/>
  <ellipse cx="14" cy="15" rx="9"  ry="10" fill="rgba(241,191,0,0.12)" stroke="rgba(241,191,0,0.30)" stroke-width="1.5"/>
  <!-- neck -->
  <rect x="11" y="-8" width="6" height="24" rx="3" fill="rgba(241,191,0,0.25)"/>
  <!-- sound hole -->
  <circle cx="14" cy="32" r="5" fill="none" stroke="rgba(241,191,0,0.35)" stroke-width="1"/>
  <!-- strings -->
  <line x1="14" y1="-6" x2="14" y2="46" stroke="rgba(241,191,0,0.30)" stroke-width="1"/>
</g>
<!-- sun -->
<g transform="translate(90,278)">
  <circle cx="26" cy="22" r="13" fill="rgba(241,191,0,0.18)" stroke="rgba(241,191,0,0.40)" stroke-width="1.5"/>
  <line x1="26" y1="4"  x2="26" y2="0"  stroke="rgba(241,191,0,0.40)" stroke-width="2" stroke-linecap="round"/>
  <line x1="26" y1="40" x2="26" y2="44" stroke="rgba(241,191,0,0.40)" stroke-width="2" stroke-linecap="round"/>
  <line x1="8"  y1="22" x2="4"  y2="22" stroke="rgba(241,191,0,0.40)" stroke-width="2" stroke-linecap="round"/>
  <line x1="44" y1="22" x2="48" y2="22" stroke="rgba(241,191,0,0.40)" stroke-width="2" stroke-linecap="round"/>
  <line x1="13" y1="9"  x2="10" y2="6"  stroke="rgba(241,191,0,0.35)" stroke-width="2" stroke-linecap="round"/>
  <line x1="39" y1="9"  x2="42" y2="6"  stroke="rgba(241,191,0,0.35)" stroke-width="2" stroke-linecap="round"/>
  <line x1="13" y1="35" x2="10" y2="38" stroke="rgba(241,191,0,0.35)" stroke-width="2" stroke-linecap="round"/>
  <line x1="39" y1="35" x2="42" y2="38" stroke="rgba(241,191,0,0.35)" stroke-width="2" stroke-linecap="round"/>
</g>
<!-- open book -->
<g transform="translate(162,280)">
  <rect x="0" y="4" width="52" height="34" rx="4" fill="rgba(255,255,255,0.09)" stroke="rgba(255,255,255,0.20)" stroke-width="1.5"/>
  <line x1="26" y1="4" x2="26" y2="38" stroke="rgba(255,255,255,0.28)" stroke-width="1.5"/>
  <rect x="5"  y="12" width="14" height="3" rx="1.5" fill="rgba(255,255,255,0.40)"/>
  <rect x="5"  y="19" width="14" height="3" rx="1.5" fill="rgba(255,255,255,0.24)"/>
  <rect x="33" y="12" width="14" height="3" rx="1.5" fill="rgba(255,255,255,0.40)"/>
  <rect x="33" y="19" width="14" height="3" rx="1.5" fill="rgba(255,255,255,0.24)"/>
</g>
<!-- ¡Hola! bubble -->
<g transform="translate(236,278)">
  <rect x="0" y="0" width="54" height="34" rx="10" fill="rgba(255,255,255,0.09)" stroke="rgba(255,255,255,0.20)" stroke-width="1.5"/>
  <polygon points="9,34 4,46 20,34" fill="rgba(255,255,255,0.09)"/>
  <text x="27" y="22" text-anchor="middle" font-family="'Inter',system-ui,sans-serif" font-size="10" font-weight="700" fill="rgba(255,255,255,0.65)">¡Hola!</text>
</g>

{_bottom_bar("Spanish Course · Español")}
{_title_and_badge(title, level)}
""")


# ══════════════════════════════════════════════════════════════════════════════
#  GERMAN  —  deep blue-slate bg · German flag · Brandenburg Gate
#  Flag: black / red / gold  →  bg must NOT be black, red, or gold
# ══════════════════════════════════════════════════════════════════════════════

def _german_thumbnail(title: str, level: str) -> str:
    BG = "#1a2340"   # deep blue-slate — contrast with all three flag bands
    return _wrap(f"""
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1" gradientUnits="objectBoundingBox">
    <stop offset="0%"   stop-color="#1a2340"/>
    <stop offset="100%" stop-color="#0e1628"/>
  </linearGradient>
  {_shadow_def()}
  {_left_vignette(BG, "44%")}
</defs>
<rect width="360" height="360" fill="url(#bg)"/>
{_dot_grid()}

<!-- German flag  3 equal horizontal bands: black / red / gold -->
<g transform="translate(165,70)">
  <rect x="0" y="0"   width="190" height="70" fill="#000000"/>
  <rect x="0" y="70"  width="190" height="70" fill="#DD0000"/>
  <rect x="0" y="140" width="190" height="70" fill="#FFCE00"/>
</g>
<rect width="360" height="360" fill="url(#vig)"/>

<!-- Brandenburg Gate silhouette -->
<g transform="translate(28,100)" fill="#2a3d6e" opacity="0.65">
  <!-- 5 columns -->
  <rect x="0"   y="80" width="12" height="130" rx="2"/>
  <rect x="18"  y="80" width="12" height="130" rx="2"/>
  <rect x="44"  y="80" width="12" height="130" rx="2"/>
  <rect x="70"  y="80" width="12" height="130" rx="2"/>
  <rect x="88"  y="80" width="12" height="130" rx="2"/>
  <!-- entablature -->
  <rect x="-4"  y="72" width="104" height="14" rx="2"/>
  <!-- attic -->
  <rect x="4"   y="50" width="88"  height="28" rx="2"/>
  <!-- quadriga base -->
  <rect x="30"  y="30" width="36"  height="24" rx="2"/>
  <!-- quadriga horses (simple triangles) -->
  <polygon points="30,30 20,10 40,30"/>
  <polygon points="66,30 56,10 76,30"/>
  <!-- archways -->
  <rect x="5"   y="104" width="18" height="50" rx="9 9 0 0" fill="#1a2340"/>
  <rect x="39"  y="104" width="18" height="50" rx="9 9 0 0" fill="#1a2340"/>
  <rect x="73"  y="104" width="18" height="50" rx="9 9 0 0" fill="#1a2340"/>
</g>

<!-- German icons: pretzel · beer · book · Hallo! -->
<g transform="translate(20,278)">
  <!-- pretzel shape (two loops) -->
  <path d="M14 10 Q4 2 4 14 Q4 24 14 26 Q24 28 26 22" fill="none" stroke="rgba(255,206,0,0.45)" stroke-width="3" stroke-linecap="round"/>
  <path d="M26 10 Q36 2 36 14 Q36 24 26 26 Q16 28 14 22" fill="none" stroke="rgba(255,206,0,0.45)" stroke-width="3" stroke-linecap="round"/>
  <line x1="14" y1="26" x2="8"  y2="40" stroke="rgba(255,206,0,0.38)" stroke-width="3" stroke-linecap="round"/>
  <line x1="26" y1="26" x2="32" y2="40" stroke="rgba(255,206,0,0.38)" stroke-width="3" stroke-linecap="round"/>
</g>
<!-- beer stein -->
<g transform="translate(82,278)">
  <path d="M4 6 L46 6 L40 46 L10 46 Z" fill="rgba(255,206,0,0.13)" stroke="rgba(255,206,0,0.35)" stroke-width="1.5"/>
  <path d="M46 12 Q58 12 58 22 Q58 34 46 34" fill="none" stroke="rgba(255,206,0,0.32)" stroke-width="2" stroke-linecap="round"/>
  <!-- foam -->
  <ellipse cx="25" cy="5" rx="22" ry="6" fill="rgba(255,255,255,0.22)"/>
</g>
<!-- open book -->
<g transform="translate(162,280)">
  <rect x="0" y="4" width="52" height="34" rx="4" fill="rgba(255,255,255,0.09)" stroke="rgba(255,255,255,0.20)" stroke-width="1.5"/>
  <line x1="26" y1="4" x2="26" y2="38" stroke="rgba(255,255,255,0.28)" stroke-width="1.5"/>
  <rect x="5"  y="12" width="14" height="3" rx="1.5" fill="rgba(255,255,255,0.40)"/>
  <rect x="5"  y="19" width="14" height="3" rx="1.5" fill="rgba(255,255,255,0.24)"/>
  <rect x="33" y="12" width="14" height="3" rx="1.5" fill="rgba(255,255,255,0.40)"/>
  <rect x="33" y="19" width="14" height="3" rx="1.5" fill="rgba(255,255,255,0.24)"/>
</g>
<!-- Hallo! bubble -->
<g transform="translate(236,278)">
  <rect x="0" y="0" width="56" height="34" rx="10" fill="rgba(255,255,255,0.09)" stroke="rgba(255,255,255,0.20)" stroke-width="1.5"/>
  <polygon points="9,34 4,46 20,34" fill="rgba(255,255,255,0.09)"/>
  <text x="28" y="22" text-anchor="middle" font-family="'Inter',system-ui,sans-serif" font-size="10" font-weight="700" fill="rgba(255,255,255,0.65)">Hallo!</text>
</g>

{_bottom_bar("German Course · Deutsch")}
{_title_and_badge(title, level)}
""")


# ══════════════════════════════════════════════════════════════════════════════
#  FRENCH  —  dark olive/brown bg · French flag · Eiffel Tower
#  Flag: blue / white / red  →  bg must NOT be blue, white, or red
# ══════════════════════════════════════════════════════════════════════════════

def _french_thumbnail(title: str, level: str) -> str:
    BG = "#1a1408"   # dark warm olive/brown — contrast with blue, white and red
    return _wrap(f"""
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1" gradientUnits="objectBoundingBox">
    <stop offset="0%"   stop-color="#1a1408"/>
    <stop offset="100%" stop-color="#0f0c04"/>
  </linearGradient>
  {_shadow_def()}
  {_left_vignette(BG, "44%")}
</defs>
<rect width="360" height="360" fill="url(#bg)"/>
{_dot_grid()}

<!-- French flag  3 equal vertical bands: blue / white / red -->
<g transform="translate(169,40)">
  <rect x="0"   y="0" width="64" height="290" fill="#002395"/>
  <rect x="64"  y="0" width="63" height="290" fill="#ffffff"/>
  <rect x="127" y="0" width="63" height="290" fill="#ED2939"/>
</g>
<rect width="360" height="360" fill="url(#vig)"/>

<!-- Eiffel Tower silhouette -->
<g transform="translate(34,80)" fill="#3d3010" opacity="0.80">
  <!-- wide base legs -->
  <path d="M10 180 Q20 120 38 80 L44 80 Q56 120 66 180Z"/>
  <!-- first platform -->
  <rect x="14" y="100" width="48" height="8" rx="2"/>
  <!-- second platform -->
  <rect x="22" y="60"  width="32" height="7"  rx="2"/>
  <!-- top spire -->
  <rect x="34" y="0"   width="8"  height="62" rx="2"/>
  <!-- antenna -->
  <line x1="38" y1="0" x2="38" y2="-14" stroke="#3d3010" stroke-width="3" stroke-linecap="round"/>
  <!-- arch legs (lower section detail) -->
  <path d="M10 180 Q10 140 20 130" fill="none" stroke="#3d3010" stroke-width="4" stroke-linecap="round"/>
  <path d="M66 180 Q66 140 56 130" fill="none" stroke="#3d3010" stroke-width="4" stroke-linecap="round"/>
</g>

<!-- French icons: croissant · wine · book · Bonjour! -->
<g transform="translate(20,278)">
  <!-- croissant (crescent arc) -->
  <path d="M6 36 Q-4 18 10 6 Q22 -4 38 6 Q28 14 26 26 Q22 38 6 36Z" fill="rgba(210,170,80,0.18)" stroke="rgba(210,170,80,0.42)" stroke-width="1.5"/>
  <path d="M38 6 Q48 18 42 30" fill="none" stroke="rgba(210,170,80,0.35)" stroke-width="2" stroke-linecap="round"/>
</g>
<!-- wine glass -->
<g transform="translate(88,278)">
  <!-- bowl -->
  <path d="M6 0 Q2 18 14 28 Q26 18 22 0 Z" fill="rgba(180,40,60,0.18)" stroke="rgba(180,40,60,0.38)" stroke-width="1.5"/>
  <!-- stem -->
  <line x1="14" y1="28" x2="14" y2="44" stroke="rgba(180,40,60,0.38)" stroke-width="2" stroke-linecap="round"/>
  <!-- base -->
  <line x1="6"  y1="44" x2="22" y2="44" stroke="rgba(180,40,60,0.38)" stroke-width="2" stroke-linecap="round"/>
  <!-- wine fill -->
  <path d="M8 14 Q6 22 14 26 Q22 22 20 14Z" fill="rgba(180,40,60,0.30)"/>
</g>
<!-- open book -->
<g transform="translate(162,280)">
  <rect x="0" y="4" width="52" height="34" rx="4" fill="rgba(255,255,255,0.09)" stroke="rgba(255,255,255,0.20)" stroke-width="1.5"/>
  <line x1="26" y1="4" x2="26" y2="38" stroke="rgba(255,255,255,0.28)" stroke-width="1.5"/>
  <rect x="5"  y="12" width="14" height="3" rx="1.5" fill="rgba(255,255,255,0.40)"/>
  <rect x="5"  y="19" width="14" height="3" rx="1.5" fill="rgba(255,255,255,0.24)"/>
  <rect x="33" y="12" width="14" height="3" rx="1.5" fill="rgba(255,255,255,0.40)"/>
  <rect x="33" y="19" width="14" height="3" rx="1.5" fill="rgba(255,255,255,0.24)"/>
</g>
<!-- Bonjour! bubble -->
<g transform="translate(236,278)">
  <rect x="0" y="0" width="56" height="34" rx="10" fill="rgba(255,255,255,0.09)" stroke="rgba(255,255,255,0.20)" stroke-width="1.5"/>
  <polygon points="9,34 4,46 20,34" fill="rgba(255,255,255,0.09)"/>
  <text x="28" y="22" text-anchor="middle" font-family="'Inter',system-ui,sans-serif" font-size="9" font-weight="700" fill="rgba(255,255,255,0.65)">Bonjour!</text>
</g>

{_bottom_bar("French Course · Français")}
{_title_and_badge(title, level)}
""")


# ══════════════════════════════════════════════════════════════════════════════
#  GENERIC fallback
# ══════════════════════════════════════════════════════════════════════════════

_PALETTES = {
    "russian":    ("#0d1020","#1a1f3a","#E53E3E"),
    "portuguese": ("#04200f","#052e16","#10B981"),
    "chinese":    ("#1a0a00","#3b1a00","#F59E0B"),
    "japanese":   ("#0e0e1e","#16213e","#EC4899"),
    "arabic":     ("#022c18","#064e3b","#34D399"),
    "korean":     ("#0e0e2e","#13104a","#818CF8"),
    "default":    ("#0f0f14","#1e293b","#6C6FEF"),
}
_GREETINGS = {
    "russian":"Привет!", "portuguese":"Olá!", "chinese":"你好！",
    "japanese":"こんにちは", "arabic":"مرحبا!", "korean":"안녕하세요!",
}

def _generic_thumbnail(title: str, level: str, language: str) -> str:
    k = language.lower()
    bg1, bg2, accent = _PALETTES.get(k, _PALETTES["default"])
    greeting = _GREETINGS.get(k, "Hello!")
    return _wrap(f"""
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1" gradientUnits="objectBoundingBox">
    <stop offset="0%"   stop-color="{bg1}"/>
    <stop offset="100%" stop-color="{bg2}"/>
  </linearGradient>
  {_shadow_def()}
</defs>
<rect width="360" height="360" fill="url(#bg)"/>
<pattern id="gr" x="0" y="0" width="36" height="36" patternUnits="userSpaceOnUse">
  <path d="M 36 0 L 0 0 0 36" fill="none" stroke="rgba(255,255,255,0.04)" stroke-width="1"/>
</pattern>
<rect width="360" height="360" fill="url(#gr)"/>
<circle cx="290" cy="80" r="120" fill="{accent}" opacity="0.07"/>
<circle cx="290" cy="80" r="75"  fill="{accent}" opacity="0.07"/>
<circle cx="290" cy="80" r="40"  fill="{accent}" opacity="0.09"/>
<text x="290" y="96" text-anchor="middle"
  font-family="'Inter',system-ui,sans-serif"
  font-size="40" font-weight="900" fill="{accent}" opacity="0.20"
  transform="rotate(-8 290 96)">{_esc(greeting)}</text>
<text x="290" y="260" text-anchor="middle"
  font-family="'Inter',system-ui,sans-serif"
  font-size="80" font-weight="900" fill="rgba(255,255,255,0.04)"
  transform="rotate(-4 290 260)">{_esc(language[:3].upper())}</text>
{_icons_language()}
{_bottom_bar(f"{language} Course")}
{_title_and_badge(title, level)}
""")


# ══════════════════════════════════════════════════════════════════════════════
#  Public API
# ══════════════════════════════════════════════════════════════════════════════

def build_course_thumbnail_svg(title: str, level: str = "B1", language: str = "English") -> str:
    lang = language.strip().lower()
    level = (level or "B1").strip()
    if   lang == "english":  return _english_thumbnail(title, level)
    elif lang == "italian":  return _italian_thumbnail(title, level)
    elif lang == "spanish":  return _spanish_thumbnail(title, level)
    elif lang == "german":   return _german_thumbnail(title, level)
    elif lang == "french":   return _french_thumbnail(title, level)
    else:                    return _generic_thumbnail(title, level, language)

def build_course_thumbnail_data_uri(title: str, level: str = "B1", language: str = "English") -> str:
    svg = build_course_thumbnail_svg(title, level, language)
    b64 = base64.b64encode(svg.encode("utf-8")).decode("ascii")
    return f"data:image/svg+xml;base64,{b64}"