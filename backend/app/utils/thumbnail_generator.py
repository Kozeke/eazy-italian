"""
Utility to generate default video thumbnails based on unit level
"""
from PIL import Image, ImageDraw, ImageFont
import os
from typing import Optional
from pathlib import Path
from textwrap import wrap

THUMB_SIZE = (1280, 720)

LEVEL_STYLES = {
    "A1": {"bg": ("#1e3c72", "#2a5298")},
    "A2": {"bg": ("#134e5e", "#71b280")},
    "B1": {"bg": ("#42275a", "#734b6d")},
    "B2": {"bg": ("#232526", "#414345")},
    "C1": {"bg": ("#0f2027", "#203a43")},
    "C2": {"bg": ("#000428", "#004e92")},
}

FONT_DIR = "assets/fonts"  # add fonts here
TITLE_FONT = os.path.join(FONT_DIR, "Inter-Bold.ttf")
SUB_FONT = os.path.join(FONT_DIR, "Inter-Regular.ttf")

# Fonts ordered by preference.
# DejaVu is listed first among system fonts because it has full Cyrillic support.
# The custom Inter fonts are tried first, but if they are missing or don't render
# Cyrillic correctly the system will fall back to DejaVu automatically.
_BOLD_FONT_CANDIDATES = [
    TITLE_FONT,
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",       # Linux – Cyrillic ✓
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",           # macOS
    "/System/Library/Fonts/Helvetica.ttc",
    "C:/Windows/Fonts/arialbd.ttf",                                # Windows
]

_REGULAR_FONT_CANDIDATES = [
    SUB_FONT,
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",             # Linux – Cyrillic ✓
    "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    "/usr/share/fonts/truetype/freefont/FreeSans.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",                # macOS
    "/System/Library/Fonts/Helvetica.ttc",
    "C:/Windows/Fonts/arial.ttf",                                  # Windows
]


def _load_font(size: int, bold: bool = True) -> ImageFont.FreeTypeFont:
    """Return a TrueType font at *size* with Cyrillic support.

    Tries candidates in order; the first readable file wins.  Falls back to
    Pillow's built-in bitmap font only as a last resort (will look small and
    won't render Cyrillic – a warning is printed so the operator knows to
    install a proper font).
    """
    candidates = _BOLD_FONT_CANDIDATES if bold else _REGULAR_FONT_CANDIDATES
    for path in candidates:
        if os.path.exists(path):
            try:
                font = ImageFont.truetype(path, size)
                print(f"[THUMBNAIL] Loaded font ({size}px): {path}")
                return font
            except Exception as exc:
                print(f"[THUMBNAIL] Could not load {path}: {exc}")
    print(
        f"[THUMBNAIL] WARNING: No TrueType font found – falling back to bitmap default. "
        "Text will be tiny and Cyrillic will not render. "
        "Install fonts (e.g. fonts-dejavu-core) or place Inter-*.ttf in assets/fonts/."
    )
    return ImageFont.load_default()


def _vertical_gradient(size, top_color, bottom_color):
    """Create a vertical gradient from top_color to bottom_color"""
    def hex_to_rgb(hex_color):
        hex_color = hex_color.lstrip('#')
        return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))
    
    top_rgb = hex_to_rgb(top_color)
    bottom_rgb = hex_to_rgb(bottom_color)
    
    top = Image.new("RGB", size, top_rgb)
    bottom = Image.new("RGB", size, bottom_rgb)
    mask = Image.linear_gradient("L").resize(size)
    return Image.composite(top, bottom, mask)


def generate_default_thumbnail(level: str, output_path: str, title: str = "Video Lesson"):
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    style = LEVEL_STYLES.get(level, LEVEL_STYLES["A1"])
    img = _vertical_gradient(THUMB_SIZE, *style["bg"])

    draw = ImageDraw.Draw(img)

    title_font = _load_font(72, bold=True)
    sub_font   = _load_font(40, bold=False)

    # Card
    card_margin = 80
    card_radius = 40
    card_box = [
        card_margin,
        card_margin,
        THUMB_SIZE[0] - card_margin,
        THUMB_SIZE[1] - card_margin,
    ]

    # Create a semi-transparent overlay for the card
    overlay = Image.new("RGBA", THUMB_SIZE, (0, 0, 0, 0))
    overlay_draw = ImageDraw.Draw(overlay)
    overlay_draw.rounded_rectangle(
        card_box,
        radius=card_radius,
        fill=(0, 0, 0, 160),
        outline=None
    )
    img = Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB")
    draw = ImageDraw.Draw(img)

    # LEVEL badge
    badge_w, badge_h = 140, 64
    badge_x = card_box[0] + 40
    badge_y = card_box[1] + 40

    draw.rounded_rectangle(
        [badge_x, badge_y, badge_x + badge_w, badge_y + badge_h],
        radius=20,
        fill=(255, 255, 255)
    )

    draw.text(
        (badge_x + 36, badge_y + 12),
        level,
        fill=(0, 0, 0),
        font=sub_font
    )

    # Title
    max_width = 28
    lines = wrap(title, max_width)[:2]

    y = THUMB_SIZE[1] // 2 - 80
    for line in lines:
        bbox = draw.textbbox((0, 0), line, font=title_font)
        w = bbox[2] - bbox[0]
        h = bbox[3] - bbox[1]
        draw.text(
            ((THUMB_SIZE[0] - w) // 2, y),
            line,
            fill=(255, 255, 255),
            font=title_font
        )
        y += h + 10

    # Footer text
    draw.text(
        (card_box[0] + 40, card_box[3] - 70),
        "Eazy Italian · Video Lesson",
        fill=(220, 220, 220),
        font=sub_font
    )

    img.save(output_path, "JPEG", quality=92)

def generate_course_thumbnail(level: str, output_path: str, title: str = "Course", subtitle: str = ""):
    """Generate a thumbnail for a course (similar to video but with course branding)"""
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    style = LEVEL_STYLES.get(level, LEVEL_STYLES["A1"])
    img = _vertical_gradient(THUMB_SIZE, *style["bg"])

    draw = ImageDraw.Draw(img)

    title_font  = _load_font(180, bold=True)   # Increased from 140 to 180
    sub_font    = _load_font(90,  bold=False)  # Increased from 70 to 90
    badge_font  = _load_font(72,  bold=True)   # Increased from 56 to 72
    footer_font = _load_font(65,  bold=False)  # Increased from 50 to 65

    # Card
    card_margin = 80
    card_radius = 40
    card_box = [
        card_margin,
        card_margin,
        THUMB_SIZE[0] - card_margin,
        THUMB_SIZE[1] - card_margin,
    ]

    # Create a semi-transparent overlay for the card
    overlay = Image.new("RGBA", THUMB_SIZE, (0, 0, 0, 0))
    overlay_draw = ImageDraw.Draw(overlay)
    overlay_draw.rounded_rectangle(
        card_box,
        radius=card_radius,
        fill=(0, 0, 0, 160),
        outline=None
    )
    img = Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB")
    draw = ImageDraw.Draw(img)

    # LEVEL badge - increased size for better visibility
    badge_w, badge_h = 220, 100  # Increased from 180x80 to 220x100
    badge_x = card_box[0] + 40
    badge_y = card_box[1] + 40

    draw.rounded_rectangle(
        [badge_x, badge_y, badge_x + badge_w, badge_y + badge_h],
        radius=20,
        fill=(255, 255, 255)
    )

    # Center text in badge
    bbox = draw.textbbox((0, 0), level, font=badge_font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]
    draw.text(
        (badge_x + (badge_w - text_w) // 2, badge_y + (badge_h - text_h) // 2 - 4),
        level,
        fill=(0, 0, 0),
        font=badge_font
    )

    # Title - adjusted for larger font
    max_width = 22  # Reduced to account for larger font
    lines = wrap(title, max_width)[:2]

    y = THUMB_SIZE[1] // 2 - 40  # Moved up slightly for better positioning
    for line in lines:
        bbox = draw.textbbox((0, 0), line, font=title_font)
        w = bbox[2] - bbox[0]
        h = bbox[3] - bbox[1]
        draw.text(
            ((THUMB_SIZE[0] - w) // 2, y),
            line,
            fill=(255, 255, 255),
            font=title_font
        )
        y += h + 25  # Increased spacing between lines

    # Subtitle if provided
    if subtitle:
        subtitle_lines = wrap(subtitle, 30)[:1]  # Adjusted for larger font
        if subtitle_lines:
            bbox = draw.textbbox((0, 0), subtitle_lines[0], font=sub_font)
            w = bbox[2] - bbox[0]
            draw.text(
                ((THUMB_SIZE[0] - w) // 2, y + 20),
                subtitle_lines[0],
                fill=(220, 220, 220),
                font=sub_font
            )

    draw.text(
        (card_box[0] + 40, card_box[3] - 80),
        "Eazy Italian · Course",
        fill=(220, 220, 220),
        font=footer_font
    )

    img.save(output_path, "JPEG", quality=92)

def get_thumbnail_path(video_id: int, level: str, base_dir: str = "thumbnails") -> str:
    """
    Generate a path for a video thumbnail
    Note: Returns path relative to uploads/ directory since static files are served from there
    
    Args:
        video_id: Video ID
        level: Unit level
        base_dir: Base directory for thumbnails (relative to uploads/)
    
    Returns:
        Relative path to thumbnail (e.g., "thumbnails/video_5_A1.png")
    """
    filename = f"video_{video_id}_{level.upper()}.png"
    return f"{base_dir}/{filename}"

def get_course_thumbnail_path(course_id: int, level: str, base_dir: str = "thumbnails") -> str:
    """
    Generate a path for a course thumbnail
    Note: Returns path relative to uploads/ directory since static files are served from there
    
    Args:
        course_id: Course ID
        level: Course level
        base_dir: Base directory for thumbnails (relative to uploads/)
    
    Returns:
        Relative path to thumbnail (e.g., "thumbnails/course_5_A1.jpg")
    """
    filename = f"course_{course_id}_{level.upper()}.jpg"
    return f"{base_dir}/{filename}"