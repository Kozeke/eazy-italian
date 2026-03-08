"""
schemas/slides.py  (extended with image support)
=================
Pydantic models for the AI Slide Generator feature.

Changes from v1
---------------
* Added SlideImage — a serialisable wrapper around ImageResult.
* Added optional `image` field to Slide.
* Added image_style / generate_images fields to SlideGenerationRequest.
* SlideDeck is unchanged at the top level.

SlideImage intentionally mirrors ImageResult but:
- Uses plain str/Literal instead of the ImageFormat enum so the model
  is JSON-serialisable without importing image_providers.
- Provides from_result() to convert from ImageResult cleanly.
- Provides as_data_uri() so templates can embed the image directly.
"""

from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator


# ── Image model ───────────────────────────────────────────────────────────────

class SlideImage(BaseModel):
    """
    Serialisable image attached to a slide.

    data        : Base64-encoded bytes (PNG/JPEG/WEBP) or raw SVG string.
    format      : "svg" | "png" | "jpeg" | "webp"
    alt_text    : Screen-reader description.
    source      : Provider that generated this image.
    prompt_used : The exact prompt sent to the image backend.
    width       : Pixel width (0 for SVG).
    height      : Pixel height (0 for SVG).
    """

    data:        str = Field(..., description="Base64 bytes or raw SVG string.")
    format:      Literal["svg","png","jpeg","webp"] = Field("svg")
    alt_text:    str = Field("", description="Accessibility description.")
    source:      str = Field("", description="Provider identifier.")
    prompt_used: str = Field("", description="Prompt sent to the image backend.")
    width:       int = Field(0, ge=0)
    height:      int = Field(0, ge=0)

    # ── Factory ───────────────────────────────────────────────────────────────

    @classmethod
    def from_result(cls, result) -> "SlideImage":
        """Convert an ImageResult (from image_base.py) to a SlideImage."""
        return cls(
            data        = result.data,
            format      = result.format.value if hasattr(result.format, "value") else str(result.format),
            alt_text    = result.alt_text,
            source      = result.source,
            prompt_used = result.prompt_used,
            width       = result.width,
            height      = result.height,
        )

    # ── Convenience ───────────────────────────────────────────────────────────

    def as_data_uri(self) -> str:
        """Return a data URI ready for <img src=…> or CSS background-image."""
        if self.format == "svg":
            import urllib.parse
            encoded = urllib.parse.quote(self.data, safe="/:@!$&'()*+,;=")
            return f"data:image/svg+xml;charset=utf-8,{encoded}"
        mime = {"png":"image/png","jpeg":"image/jpeg","webp":"image/webp"}.get(
            self.format, "application/octet-stream"
        )
        return f"data:{mime};base64,{self.data}"

    def is_placeholder(self) -> bool:
        return self.source.endswith("/fallback") or self.source == "NullImageProvider"


# ── Content models ─────────────────────────────────────────────────────────────

class Slide(BaseModel):
    """
    A single presentation slide.

    Fields
    ------
    title           : Short headline for the slide (≤ 120 chars).
    bullet_points   : 2–7 concise teaching points.
    examples        : Optional concrete examples that illustrate the content.
    exercise        : Optional hands-on activity or discussion prompt.
    teacher_notes   : Optional delivery guidance visible only to the teacher.
    image           : Optional AI-generated image for this slide.
    """

    id: int = Field(
        default=0,
        description="1-based position index, auto-assigned by SlideDeck after parse.",
    )
    title: str = Field(
        ...,
        min_length=1,
        max_length=120,
        description="Short, descriptive slide headline.",
    )
    bullet_points: List[str] = Field(
        ...,
        min_length=1,
        description="Key teaching points for this slide (2–7 items recommended).",
    )
    examples: Optional[List[str]] = Field(
        default=None,
        description="Concrete examples that illustrate the bullet points.",
    )
    exercise: Optional[str] = Field(
        default=None,
        description="A hands-on activity or discussion prompt.",
    )
    teacher_notes: Optional[str] = Field(
        default=None,
        description="Delivery hints for the teacher — not shown to students.",
    )
    image: Optional[str] = Field(
        default=None,
        description="Data URI string (e.g. 'data:image/svg+xml,...') populated after image generation.",
    )

    @field_validator("bullet_points")
    @classmethod
    def at_least_one_bullet(cls, v: List[str]) -> List[str]:
        if not v:
            raise ValueError("Each slide must have at least one bullet point.")
        stripped = [b.strip() for b in v if b.strip()]
        if not stripped:
            raise ValueError("Bullet points must not be empty strings.")
        return stripped


class SlideDeck(BaseModel):
    """A complete AI-generated slide deck."""

    topic:            str               = Field(..., description="Subject covered.")
    level:            str               = Field(..., description="Audience level.")
    target_audience:  Optional[str]     = Field(default=None)
    duration_minutes: int               = Field(..., gt=0)
    slides:           List[Slide]       = Field(..., min_length=1)
    has_images:       bool              = Field(
        default=False,
        description="True when at least one slide has an image attached.",
    )

    @field_validator("slides")
    @classmethod
    def at_least_one_slide(cls, v: List[Slide]) -> List[Slide]:
        if not v:
            raise ValueError("A SlideDeck must contain at least one slide.")
        return v

    def model_post_init(self, __context) -> None:
        # Stamp each slide with its 1-based position index.
        # Done here so LLM output, cache reads, and model_copy() calls
        # all get consistent IDs without any caller having to set them.
        for i, slide in enumerate(self.slides):
            object.__setattr__(slide, "id", i + 1)

        # Auto-set has_images.
        # image is now Optional[str] (a data URI), so truthy check is enough.
        object.__setattr__(
            self,
            "has_images",
            any(bool(s.image) for s in self.slides),
        )


# ── Request schema ─────────────────────────────────────────────────────────────

ImageStyleEnum = Literal[
    "illustration", "photo", "abstract", "3d", "lineart", "auto"
]

class SlideGenerationRequest(BaseModel):
    """Parameters submitted by the teacher to generate a slide deck."""

    topic:                str                   = Field(..., min_length=2, max_length=300)
    level:                str                   = Field(..., min_length=1, max_length=80)
    duration_minutes:     int                   = Field(..., ge=5, le=180)
    target_audience:      Optional[str]         = Field(default=None, max_length=300)
    learning_goals:       Optional[List[str]]   = Field(default=None)
    include_exercises:    bool                  = Field(default=True)
    include_teacher_notes:bool                  = Field(default=True)
    language:             str                   = Field(default="English", max_length=50)

    # ── Image generation settings ─────────────────────────────────────────────
    generate_images:      bool                  = Field(
        default=False,
        description="Generate an AI image for each slide.",
    )
    image_style:          ImageStyleEnum        = Field(
        default="illustration",
        description="Visual style for generated images.",
    )
    image_style_keywords: Optional[str]         = Field(
        default=None,
        max_length=200,
        description='Extra style keywords, e.g. "minimal, blue palette, geometric".',
    )
    image_provider:       Literal["svg","huggingface","none"] = Field(
        default="svg",
        description=(
            "Which image backend to use. "
            "'svg' = free, offline, AI-generated SVG diagrams. "
            "'huggingface' = free-tier diffusion model (requires HF_API_KEY). "
            "'none' = skip image generation."
        ),
    )

# ── Stream request schema ─────────────────────────────────────────────────────

class SlideImageStreamRequest(BaseModel):
    """
    Request body for POST /generate-slides-with-images-stream.

    Slide text is already generated.  The caller passes back the slides from
    /generate-slides together with image-generation preferences and the
    deck-level context that ImagePromptBuilder needs for richer prompts.
    """

    # ── Pre-generated slides ──────────────────────────────────────────────────
    slides: List[dict] = Field(
        ...,
        description=(
            "Slide objects from the /generate-slides response. "
            "Each dict must contain at least 'title' and 'bullet_points'."
        ),
    )

    # ── Deck-level context for ImagePromptBuilder ─────────────────────────────
    topic: str = Field(
        default="",
        description="Deck topic forwarded to the image prompt for richer context.",
    )
    target_audience: str = Field(
        default="",
        description="Audience description forwarded to the image prompt.",
    )

    # ── Image-generation options ──────────────────────────────────────────────
    image_provider: Literal["svg", "huggingface", "none"] = Field(
        default="svg",
        description="Which image backend to use.",
    )
    image_style: ImageStyleEnum = Field(
        default="illustration",
        description="Base visual style forwarded to the image provider.",
    )
    image_style_keywords: str = Field(
        default="",
        description="Optional comma-separated extra style words.",
    )
    theme: str = Field(
        default="editorial",
        description="SVG theme name passed to SVGImageProvider.",
    )
    skip_intro_slide: bool = Field(
        default=True,
        description="Skip image generation for the first slide (usually a title slide).",
    )
    skip_summary_slide: bool = Field(
        default=True,
        description="Skip image generation for the last slide (usually a recap).",
    )