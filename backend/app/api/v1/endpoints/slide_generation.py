"""
app/api/routes/slide_generation.py  (DI wiring with cache)
===========================================================
Shows exactly how CacheService plugs into both services via FastAPI DI.

Dependency graph
----------------
get_db()                      → Session          (per request)
get_ai_provider()             → LocalLlamaProvider (singleton)
get_cache_backend(db)         → PostgresCacheBackend(db)
get_cache_service(backend)    → CacheService(backend, enabled)
get_slide_service(ai, cache)  → SlideGeneratorService(ai, cache)
get_svg_provider(ai, cache)   → SVGImageProvider(ai, cache, theme)

Swapping to Redis in future
---------------------------
Change get_cache_backend() to return RedisCacheBackend(url).
Zero other changes needed.

Disabling cache per-environment
--------------------------------
Set env-var:  SLIDE_CACHE_ENABLED=false
"""

from __future__ import annotations

import asyncio
import json as _json
import logging
import os
import time
from functools import lru_cache
from typing import Annotated, Any, AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.slides import Slide, SlideGenerationRequest, SlideDeck, SlideImageStreamRequest
from app.services.ai.cache.backends import PostgresCacheBackend, CacheBackend
from app.services.ai.cache.cache_service import CacheService
from app.services.ai.image_providers.image_base import NullImageProvider
from app.services.ai.image_providers.huggingface_provider import HuggingFaceImageProvider
from app.services.ai.image_providers.svg_provider import SVGImageProvider
from app.services.ai.providers.base import AIProvider, AIProviderError
from app.services.ai.providers.groq_provider import GroqProvider
from app.services.image_prompt_builder import ImagePromptBuilder
from app.services.slide_generator import SlideGeneratorService, SlideGenerationError
from app.services.slide_image_service import SlideImageService

logger      = logging.getLogger(__name__)
router      = APIRouter()
_CACHE_ON   = os.environ.get("SLIDE_CACHE_ENABLED", "true").lower() != "false"


# ── Singletons ────────────────────────────────────────────────────────────────

@lru_cache(maxsize=1)
def get_ai_provider() -> AIProvider:
    """One LLM client per process. Swap implementation here only."""
    return GroqProvider()


# ── Per-request dependencies ──────────────────────────────────────────────────

def get_cache_backend(db: Session = Depends(get_db)) -> CacheBackend:
    """
    Return the active cache backend.

    To switch to Redis:
        return RedisCacheBackend(url=os.environ["REDIS_URL"])

    To layer Redis (L1) + Postgres (L2):
        return TwoLayerBackend(
            l1=RedisCacheBackend(url),
            l2=PostgresCacheBackend(db),
        )
    """
    return PostgresCacheBackend(db)


def get_cache_service(
    backend: CacheBackend = Depends(get_cache_backend),
) -> CacheService:
    return CacheService(backend=backend, enabled=_CACHE_ON)


def get_slide_service(
    ai:    AIProvider    = Depends(get_ai_provider),
    cache: CacheService  = Depends(get_cache_service),
) -> SlideGeneratorService:
    """
    SlideGeneratorService with cache injected.
    Cache is None when SLIDE_CACHE_ENABLED=false.
    """
    return SlideGeneratorService(
        ai_provider = ai,
        cache       = cache if _CACHE_ON else None,
        max_retries = 1,
    )


def get_svg_provider(
    ai:    AIProvider   = Depends(get_ai_provider),
    cache: CacheService = Depends(get_cache_service),
    theme: str          = "editorial",
) -> SVGImageProvider:
    """
    SVGImageProvider with cache injected.
    Reuses the same AI provider instance — no second connection.
    """
    return SVGImageProvider(
        ai_provider = ai,
        cache       = cache if _CACHE_ON else None,
        theme       = theme,
        max_retries = 1,
    )


# Type aliases
SlideSvc = Annotated[SlideGeneratorService, Depends(get_slide_service)]
CacheSvc = Annotated[CacheService,          Depends(get_cache_service)]


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post(
    "/generate-slides",
    response_model=SlideDeck,
    summary="Generate slide deck (text only, cache-aware)",
)
async def generate_slides(
    body:    SlideGenerationRequest,
    service: SlideSvc,
) -> SlideDeck:
    return await _text_gen(body, service)


@router.post(
    "/generate-slides-with-images",
    response_model=SlideDeck,
    summary="Generate slide deck + per-slide AI images (cache-aware)",
)
async def generate_slides_with_images(
    body:    SlideGenerationRequest,
    service: SlideSvc,
    ai:      AIProvider   = Depends(get_ai_provider),
    cache:   CacheService = Depends(get_cache_service),
    db:      Session      = Depends(get_db),
) -> SlideDeck:
    t0   = time.perf_counter()
    deck = await _text_gen(body, service)

    if not getattr(body, "generate_images", False) or body.image_provider == "none":
        return deck

    theme    = getattr(body, "theme", "editorial")
    provider_type = getattr(body, "image_provider", "svg")
    
    # Select image provider based on request
    if provider_type == "huggingface":
        provider = HuggingFaceImageProvider(
            model = os.environ.get("HF_MODEL", "black-forest-labs/FLUX.1-schnell"),
            width = int(os.environ.get("HF_WIDTH", "512")),
            height = int(os.environ.get("HF_HEIGHT", "384")),
        )
        logger.info(
            "Using HuggingFace image provider — model=%r endpoint=%r",
            provider.model, provider._endpoint
        )
    else:  # default to SVG
        provider = SVGImageProvider(
            ai_provider = ai,
            cache       = cache if _CACHE_ON else None,
            theme       = theme,
            max_retries = 1,
        )
        logger.info(
            "Using SVG image provider — theme=%r",
            theme
        )

    style_parts = [getattr(body, "image_style", "illustration")]
    if getattr(body, "image_style_keywords", ""):
        style_parts.append(body.image_style_keywords)

    img_service = SlideImageService(
        image_provider     = provider,
        concurrency        = 3,
        skip_intro_slide   = True,
        skip_summary_slide = True,
        style              = ", ".join(filter(None, style_parts)),
    )

    try:
        enriched = await img_service.enrich_deck(deck)
        logger.info(
            "Full generation done in %.1fs | topic=%r", time.perf_counter() - t0, body.topic
        )
        return enriched
    except Exception as exc:
        logger.error("Image enrichment failed: %s — returning text-only deck.", exc)
        return deck


# ── Cache management ──────────────────────────────────────────────────────────

@router.get("/cache/stats", response_model=dict, summary="Cache statistics")
def cache_stats(cache: CacheSvc) -> dict[str, Any]:
    """Hit rates, entry counts, and top topics."""
    return cache.stats()


@router.delete("/cache/purge", response_model=dict, summary="Delete expired entries")
def cache_purge(cache: CacheSvc) -> dict[str, Any]:
    deleted = cache.purge_expired()
    return {"deleted": deleted, "status": "ok"}


# ── Health ────────────────────────────────────────────────────────────────────

@router.get("/health", response_model=dict, summary="AI provider health check")
def ai_health(ai: AIProvider = Depends(get_ai_provider)) -> dict[str, Any]:
    try:
        ok = ai.warm_up() if hasattr(ai, "warm_up") else True
        return {"status": "ok" if ok else "degraded", "provider": repr(ai),
                "cache_enabled": _CACHE_ON}
    except Exception as exc:
        return {"status": "error", "detail": str(exc)}


# ── Shared helper ─────────────────────────────────────────────────────────────

async def _text_gen(
    body:    SlideGenerationRequest,
    service: SlideGeneratorService,
) -> SlideDeck:
    try:
        return await service.agenerate_slides(body)
    except AIProviderError as exc:
        raise HTTPException(status_code=503, detail="AI provider unavailable.") from exc
    except SlideGenerationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


# ─────────────────────────────────────────────────────────────────────────────
# SSE wire-format helper
# ─────────────────────────────────────────────────────────────────────────────

def _sse(event: str, data: dict) -> str:
    """
    Encode one Server-Sent Event.

    Wire format (RFC 8895):
        event: <name>\\n
        data: <json>\\n
        \\n                 ← blank line ends the event frame

    The generator yields these strings; FastAPI's StreamingResponse writes
    them to the TCP socket as soon as they are produced.
    """
    return f"event: {event}\ndata: {_json.dumps(data)}\n\n"


# ─────────────────────────────────────────────────────────────────────────────
# Async generator — the core of the stream
# ─────────────────────────────────────────────────────────────────────────────

async def _image_stream(
    body: SlideImageStreamRequest,
    ai:   AIProvider,
    cache: CacheService,
) -> AsyncGenerator[str, None]:
    """
    Async generator that drives the image-only SSE stream.

    The generator has two clearly separated phases:

    Phase 1 — Announce & place holders  (synchronous, instant)
    ───────────────────────────────────
    One pass over the slide list to emit:
      • outline_received  — tells the frontend how many slides exist
      • image_placeholder — one per slide that will receive an image

    Because these are emitted before any coroutine is awaited, the browser
    receives all placeholder events in a single TCP flush, letting it render
    the full skeleton UI immediately.

    Phase 2 — Parallel image generation  (async, order by completion)
    ────────────────────────────────────
    One asyncio.Task per eligible slide, all sharing a Semaphore(3) so at
    most three provider calls run at the same time.

    Each task resolves into a (slide_id, data_uri) pair that it puts on a
    shared asyncio.Queue.  The generator awaits the queue in a tight loop,
    yielding image_ready events in *completion order* — the fastest image
    appears in the browser first, regardless of slide position.

    Error handling
    ──────────────
    • Provider error on a single slide → NullImageProvider placeholder is
      emitted (still a valid image_ready event) and the stream continues.
    • Unrecoverable error at startup → error event, stream closes.
    """
    slides        = body.slides
    n_slides      = len(slides)
    provider_type = body.image_provider

    if provider_type == "none" or n_slides == 0:
        yield _sse("outline_received", {"slides_count": n_slides})
        yield _sse("finished", {})
        return

    # ── Phase 1: emit outline + all placeholders up front ────────────────────

    yield _sse("outline_received", {"slides_count": n_slides})

    def _needs_image(idx: int) -> bool:
        """True when this slide index should receive an AI image."""
        if body.skip_intro_slide and idx == 0:
            return False
        if body.skip_summary_slide and idx == n_slides - 1:
            return False
        return True

    # Emit every placeholder before starting any I/O — single TCP flush.
    eligible: list[tuple[int, dict]] = []   # (slide_id_1based, slide_dict)
    for i, slide in enumerate(slides):
        if _needs_image(i):
            slide_id = i + 1
            eligible.append((slide_id, slide))
            yield _sse("image_placeholder", {"slide_id": slide_id})

    if not eligible:
        yield _sse("finished", {})
        return

    # ── Build the image provider ──────────────────────────────────────────────

    try:
        if provider_type == "huggingface":
            img_provider = HuggingFaceImageProvider(
                model  = os.environ.get("HF_MODEL", "black-forest-labs/FLUX.1-schnell"),
                width  = int(os.environ.get("HF_WIDTH", "512")),
                height = int(os.environ.get("HF_HEIGHT", "384")),
            )
            logger.info(
                "Stream: HuggingFace provider — model=%r", img_provider.model
            )
        else:
            img_provider = SVGImageProvider(
                ai_provider = ai,
                cache       = cache if _CACHE_ON else None,
                theme       = body.theme,
                max_retries = 1,
            )
            logger.info("Stream: SVG provider — theme=%r", body.theme)
    except Exception as exc:
        logger.error("Failed to build image provider: %s", exc)
        yield _sse("error", {"message": f"Image provider init failed: {exc}"})
        return

    style_parts = [body.image_style]
    if body.image_style_keywords:
        style_parts.append(body.image_style_keywords)
    style = ", ".join(filter(None, style_parts))

    null_provider = NullImageProvider()
    sem: asyncio.Semaphore     = asyncio.Semaphore(3)
    queue: asyncio.Queue[tuple] = asyncio.Queue()

    # ── Phase 2: launch tasks, collect from queue ─────────────────────────────

    async def _generate_one(slide_id: int, slide: dict) -> None:
        """
        Generate one image and push the result onto the shared queue.

        The Semaphore ensures at most 3 provider calls run simultaneously.
        All exceptions are caught: a failed slide still emits a placeholder
        data URI so the frontend always receives exactly one image_ready per
        image_placeholder.
        """
        title:   str       = slide.get("title", "")
        bullets: list[str] = slide.get("bullet_points") or []

        # Use ImagePromptBuilder for a structured, rich prompt that incorporates
        # deck-level context (topic, audience) alongside slide-level content.
        prompt = ImagePromptBuilder.build(
            slide_title   = title,
            bullet_points = bullets,
            topic         = body.topic,
            audience      = body.target_audience,
            style         = body.image_style,
            keywords      = body.image_style_keywords,
        )
        alt_text = f"Diagram illustrating: {title}"

        async with sem:
            try:
                result = await img_provider.agenerate_image(
                    prompt   = prompt,
                    alt_text = alt_text,
                    style    = style,
                )
                data_uri = result.as_data_uri()
                logger.debug(
                    "Slide %d image ready — source=%s size=%d",
                    slide_id, result.source, len(result.data),
                )
            except Exception as exc:
                logger.error(
                    "Slide %d image generation failed: %s", slide_id, exc, exc_info=True
                )
                fallback = null_provider.generate_image(prompt=prompt, alt_text=alt_text)
                data_uri = fallback.as_data_uri()

        # Put outside the semaphore so the slot is released before the queue
        # write — lets the next task start while we're still serialising JSON.
        await queue.put((slide_id, data_uri))

    # Fire all tasks concurrently — semaphore enforces the concurrency cap.
    tasks = [
        asyncio.create_task(_generate_one(slide_id, slide))
        for slide_id, slide in eligible
    ]

    # Drain the queue one result at a time in completion order.
    for _ in range(len(tasks)):
        slide_id, data_uri = await queue.get()
        yield _sse("image_ready", {
            "slide_id":  slide_id,
            "image_url": data_uri,   # named image_url per the spec; value is a data URI
        })

    # All tasks are done at this point; gather just to propagate any unexpected
    # exceptions to the server log rather than silently swallowing them.
    await asyncio.gather(*tasks, return_exceptions=True)

    yield _sse("finished", {})


# ─────────────────────────────────────────────────────────────────────────────
# Endpoint
# ─────────────────────────────────────────────────────────────────────────────

@router.post(
    "/generate-slides-with-images-stream",
    summary="Stream per-slide image generation via Server-Sent Events",
    response_class=StreamingResponse,
)
async def generate_slides_with_images_stream(
    body:  SlideImageStreamRequest,
    ai:    AIProvider   = Depends(get_ai_provider),
    cache: CacheService = Depends(get_cache_service),
) -> StreamingResponse:
    """
    Accepts pre-generated slides and streams AI-generated images as SSE events.

    Slide text is **not** generated here — the caller is expected to have
    already called ``POST /generate-slides`` and passes the resulting slides
    in the request body together with image-generation preferences.

    ## Event sequence

    | Event               | Payload                          | When                             |
    |---------------------|----------------------------------|----------------------------------|
    | `outline_received`  | `{slides_count: N}`              | Immediately, before any I/O      |
    | `image_placeholder` | `{slide_id: N}`                  | One per eligible slide, up front |
    | `image_ready`       | `{slide_id: N, image_url: "…"}` | As each image completes          |
    | `finished`          | `{}`                             | After all images are done        |
    | `error`             | `{message: "…"}`                 | Provider init failure only       |

    `image_placeholder` events are all emitted **before** any image generation
    begins, so the frontend can render the full set of spinners in one frame.

    `image_ready` events arrive in **completion order** — the fastest image
    fires first regardless of slide position.

    ## Minimal JS client

    ```js
    const res = await fetch("/api/v1/ai/generate-slides-with-images-stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slides: deck.slides,          // from /generate-slides response
        image_provider: "svg",
        image_style: "illustration",
        image_style_keywords: "",
        skip_intro_slide: true,
        skip_summary_slide: true,
      }),
    });

    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let   buffer  = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // SSE frames are separated by a blank line
      const frames = buffer.split("\\n\\n");
      buffer = frames.pop();          // last element is an incomplete frame

      for (const frame of frames) {
        const event = frame.match(/^event: (.+)$/m)?.[1];
        const raw   = frame.match(/^data: (.+)$/m)?.[1];
        if (event && raw) onSSEEvent(event, JSON.parse(raw));
      }
    }
    ```
    """
    return StreamingResponse(
        _image_stream(body, ai, cache),
        media_type="text/event-stream",
        headers={
            "Cache-Control":     "no-cache",
            "X-Accel-Buffering": "no",     # nginx: disable proxy buffering
            "Connection":        "keep-alive",
        },
    )