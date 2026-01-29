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

    # Load fonts with fallbacks
    title_font = None
    sub_font = None
    
    # Try to load custom fonts
    font_paths = [
        TITLE_FONT,
        SUB_FONT,
        '/System/Library/Fonts/Helvetica.ttc',  # macOS
        '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',  # Linux
        'C:/Windows/Fonts/arial.ttf',  # Windows
    ]
    
    # Try to load title font
    for font_path in [TITLE_FONT] + font_paths[2:]:
        if os.path.exists(font_path):
            try:
                title_font = ImageFont.truetype(font_path, 72)
                print(f"[THUMBNAIL] Loaded title font: {font_path}")
                break
            except Exception as e:
                continue
    
    if title_font is None:
        # Use default font but try to load a larger size from common system fonts
        try:
            default_fonts = [
                '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',  # Linux common
                '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',  # Linux Debian/Ubuntu
                '/System/Library/Fonts/Supplemental/Arial Bold.ttf',  # macOS
                'C:/Windows/Fonts/arialbd.ttf',  # Windows Arial Bold
            ]
            for font_path in default_fonts:
                if os.path.exists(font_path):
                    try:
                        title_font = ImageFont.truetype(font_path, 72)
                        print(f"[THUMBNAIL] Loaded title font (fallback): {font_path}")
                        break
                    except:
                        continue
            if title_font is None:
                # Last resort: use default font (will be small but better than nothing)
                print("[THUMBNAIL] WARNING: Using default font for title (text will be small!)")
                title_font = ImageFont.load_default()
        except Exception as e:
            print(f"[THUMBNAIL] Error loading fonts: {e}")
            title_font = ImageFont.load_default()
    
    # Try to load subtitle font
    for font_path in [SUB_FONT] + font_paths[2:]:
        if os.path.exists(font_path):
            try:
                sub_font = ImageFont.truetype(font_path, 40)
                print(f"[THUMBNAIL] Loaded subtitle font: {font_path}")
                break
            except Exception as e:
                continue
    
    if sub_font is None:
        # Use default font but try to load a larger size from common system fonts
        try:
            default_fonts = [
                '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',  # Linux common
                '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',  # Linux Debian/Ubuntu
                '/System/Library/Fonts/Supplemental/Arial.ttf',  # macOS
                'C:/Windows/Fonts/arial.ttf',  # Windows Arial
            ]
            for font_path in default_fonts:
                if os.path.exists(font_path):
                    try:
                        sub_font = ImageFont.truetype(font_path, 40)
                        print(f"[THUMBNAIL] Loaded subtitle font (fallback): {font_path}")
                        break
                    except:
                        continue
            if sub_font is None:
                # Last resort: use default font (will be small but better than nothing)
                print("[THUMBNAIL] WARNING: Using default font for subtitle (text will be small!)")
                sub_font = ImageFont.load_default()
        except Exception as e:
            print(f"[THUMBNAIL] Error loading fonts: {e}")
            sub_font = ImageFont.load_default()

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

    # Load fonts with fallbacks
    title_font = None
    sub_font = None
    
    # Try to load custom fonts
    font_paths = [
        TITLE_FONT,
        SUB_FONT,
        '/System/Library/Fonts/Helvetica.ttc',  # macOS
        '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',  # Linux
        'C:/Windows/Fonts/arial.ttf',  # Windows
    ]
    
    # Try to load title font
    for font_path in [TITLE_FONT] + font_paths[2:]:
        if os.path.exists(font_path):
            try:
                title_font = ImageFont.truetype(font_path, 72)
                break
            except:
                continue
    
    if title_font is None:
        # Use default font but try to load a larger size from common system fonts
        try:
            default_fonts = [
                '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',  # Linux common
                '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',  # Linux Debian/Ubuntu
                '/System/Library/Fonts/Supplemental/Arial Bold.ttf',  # macOS
                'C:/Windows/Fonts/arialbd.ttf',  # Windows Arial Bold
            ]
            for font_path in default_fonts:
                if os.path.exists(font_path):
                    title_font = ImageFont.truetype(font_path, 72)
                    break
            else:
                # Last resort: use default font (will be small but better than nothing)
                title_font = ImageFont.load_default()
        except:
            title_font = ImageFont.load_default()
    
    # Try to load subtitle font
    for font_path in [SUB_FONT] + font_paths[2:]:
        if os.path.exists(font_path):
            try:
                sub_font = ImageFont.truetype(font_path, 40)
                break
            except:
                continue
    
    if sub_font is None:
        # Use default font but try to load a larger size from common system fonts
        try:
            default_fonts = [
                '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',  # Linux common
                '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',  # Linux Debian/Ubuntu
                '/System/Library/Fonts/Supplemental/Arial.ttf',  # macOS
                'C:/Windows/Fonts/arial.ttf',  # Windows Arial
            ]
            for font_path in default_fonts:
                if os.path.exists(font_path):
                    sub_font = ImageFont.truetype(font_path, 40)
                    break
            else:
                # Last resort: use default font (will be small but better than nothing)
                sub_font = ImageFont.load_default()
        except:
            sub_font = ImageFont.load_default()

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

    # Subtitle if provided
    if subtitle:
        subtitle_lines = wrap(subtitle, 40)[:1]
        if subtitle_lines:
            bbox = draw.textbbox((0, 0), subtitle_lines[0], font=sub_font)
            w = bbox[2] - bbox[0]
            draw.text(
                ((THUMB_SIZE[0] - w) // 2, y + 10),
                subtitle_lines[0],
                fill=(220, 220, 220),
                font=sub_font
            )

    # Footer text
    draw.text(
        (card_box[0] + 40, card_box[3] - 70),
        "Eazy Italian · Course",
        fill=(220, 220, 220),
        font=sub_font
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
