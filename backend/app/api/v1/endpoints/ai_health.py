"""
app/api/v1/endpoints/ai_health.py

GET /admin/ai/health — check both AI provider backends concurrently.

Returns the reachability, active model, and round-trip latency for every
configured provider.  Designed for:
  • Teacher peace-of-mind ("why is generation slow right now?")
  • Ops / debugging without needing to tail logs

Security notes
--------------
• Requires teacher JWT (get_current_teacher) — not exposed publicly.
• API keys are never echoed; error messages are sanitised (no stack traces).
• Both providers are pinged in parallel; one failing never blocks the other.
• Total wall-clock timeout per provider: 10 s (enforced at the provider level).

Response shape
--------------
{
  "groq": {
    "status":     "ok" | "error",
    "model":      "llama-3.3-70b-versatile",
    "latency_ms": 312           # only present on success
  },
  "deepseek": {
    "status": "error",
    "model":  "deepseek-chat",
    "error":  "timeout"         # only present on error; sanitised string
  }
}
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

from fastapi import APIRouter, Depends

from app.core.auth import get_current_teacher
from app.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter()

# ── Health-check prompt ───────────────────────────────────────────────────────
# Intentionally minimal so the round-trip stays under 5 s on any provider.
_HEALTH_PROMPT   = "Reply with the single word: ok"
_HEALTH_TIMEOUT  = 10.0   # seconds per provider — hard upper bound


# ── Per-provider probe ────────────────────────────────────────────────────────

async def _probe_groq() -> dict[str, Any]:
    """
    Instantiate GroqProvider with a tight timeout and send one minimal prompt.

    Returns a dict compatible with the response model regardless of outcome.
    Exceptions are caught internally and converted to ``{"status": "error"}``.
    """
    from app.services.ai.providers.groq_provider import GroqProvider

    provider: GroqProvider | None = None
    model_name = "(unknown)"

    try:
        # Use a short timeout so the health check itself is fast.
        provider   = GroqProvider(timeout=_HEALTH_TIMEOUT, max_tokens=16)
        model_name = provider.model

        t0  = time.monotonic()
        out = await provider.agenerate(_HEALTH_PROMPT)
        ms  = round((time.monotonic() - t0) * 1000)

        logger.debug("Groq health OK: %r in %d ms", out[:40], ms)
        return {"status": "ok", "model": model_name, "latency_ms": ms}

    except Exception as exc:
        # Sanitise: log the real error but only return a short human string.
        err_str = _sanitise_error(exc)
        logger.warning("Groq health check failed: %s", exc)
        return {"status": "error", "model": model_name, "error": err_str}


async def _probe_deepseek() -> dict[str, Any]:
    """
    Instantiate DeepSeekProvider with a tight timeout and send one minimal prompt.

    Same contract as ``_probe_groq`` — never raises.
    """
    from app.services.ai.providers.deepseek_provider import DeepSeekProvider

    provider: DeepSeekProvider | None = None
    model_name = "(unknown)"

    try:
        provider   = DeepSeekProvider(timeout=_HEALTH_TIMEOUT, max_tokens=16)
        model_name = provider.model

        t0  = time.monotonic()
        out = await provider.agenerate(_HEALTH_PROMPT)
        ms  = round((time.monotonic() - t0) * 1000)

        logger.debug("DeepSeek health OK: %r in %d ms", out[:40], ms)
        return {"status": "ok", "model": model_name, "latency_ms": ms}

    except Exception as exc:
        err_str = _sanitise_error(exc)
        logger.warning("DeepSeek health check failed: %s", exc)
        return {"status": "error", "model": model_name, "error": err_str}


# ── Error sanitisation ────────────────────────────────────────────────────────

def _sanitise_error(exc: BaseException) -> str:
    """
    Convert an exception to a short, safe string for the API response.

    Rules:
    • No stack traces.
    • No API keys (we strip anything that looks like a bearer token or sk-…).
    • Keep it human-readable so teachers can understand what went wrong.
    """
    raw = str(exc)

    # Map known exception types to tidy labels.
    type_name = type(exc).__name__.lower()
    if "timeout" in type_name or "timeout" in raw.lower():
        return "timeout"
    if "auth" in raw.lower() or "401" in raw or "403" in raw:
        return "authentication error — check API key"
    if "rate" in raw.lower() or "429" in raw:
        return "rate limited"
    if "connect" in type_name or "network" in raw.lower() or "unreachable" in raw.lower():
        return "network error"
    if "503" in raw or "unavailable" in raw.lower():
        return "service unavailable"

    # Generic fallback — truncate long messages and strip anything key-like.
    safe = raw[:120]
    # Redact anything that looks like a secret (starts with sk-, bearer etc.)
    import re
    safe = re.sub(r"(sk-[A-Za-z0-9\-_]{6,}|Bearer\s+\S+)", "***", safe)
    return safe or "unknown error"


# ── Endpoint ──────────────────────────────────────────────────────────────────

@router.get(
    "/health",
    summary="AI provider health check",
    description=(
        "Pings both configured AI backends (Groq and DeepSeek) concurrently "
        "and returns their reachability status, active model name, and round-trip "
        "latency.  Requires a valid teacher session.  API keys are never exposed."
    ),
    tags=["ai-health"],
)
async def ai_health(
    _current_user: User = Depends(get_current_teacher),
) -> dict[str, dict[str, Any]]:
    """
    Fire both provider probes in parallel.

    ``asyncio.gather(return_exceptions=True)`` guarantees that a hard crash in
    one probe (e.g. ImportError if a package is missing) still returns a result
    for the other provider — the exception is captured as the gather result and
    then converted to an error dict below.
    """
    groq_result, deepseek_result = await asyncio.gather(
        _probe_groq(),
        _probe_deepseek(),
        return_exceptions=True,  # never let one failure kill the other
    )

    # If gather itself returned an exception object for a slot (shouldn't
    # happen since each probe catches internally, but belt-and-braces):
    if isinstance(groq_result, BaseException):
        logger.error("Unexpected groq probe exception: %s", groq_result)
        groq_result = {
            "status": "error",
            "model":  "(unknown)",
            "error":  _sanitise_error(groq_result),
        }

    if isinstance(deepseek_result, BaseException):
        logger.error("Unexpected deepseek probe exception: %s", deepseek_result)
        deepseek_result = {
            "status": "error",
            "model":  "(unknown)",
            "error":  _sanitise_error(deepseek_result),
        }

    return {
        "groq":     groq_result,
        "deepseek": deepseek_result,
    }