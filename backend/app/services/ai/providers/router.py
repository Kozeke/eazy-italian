"""
app/services/ai/providers/router.py

Plan-aware provider router.

Maps a teacher's subscription plan to the appropriate AI backend:

  free              → Groq  (fast, free-tier quota)
  standard / pro    → DeepSeek V3  (higher quality, paid)

Both choices are overridable via environment variables so you can flip
backends in production without a code deploy.

Environment variables
---------------------
AI_PROVIDER_FREE    default: "groq"      — provider for free-plan teachers
AI_PROVIDER_PAID    default: "deepseek"  — provider for standard/pro teachers

Usage
-----
from app.services.ai.providers.router import get_provider_for_plan

provider = get_provider_for_plan(teacher.plan)          # e.g. "free"
result   = await provider.agenerate(prompt)
"""

from __future__ import annotations

import logging
import os

from app.services.ai.providers.base import AIProvider, AIProviderError

logger = logging.getLogger(__name__)

# ── defaults (overridable via env-vars) ───────────────────────────────────────

_FREE_BACKEND  = os.environ.get("AI_PROVIDER_FREE",  "groq").strip().lower()
_PAID_BACKEND  = os.environ.get("AI_PROVIDER_PAID",  "deepseek").strip().lower()

# ── valid plan identifiers ────────────────────────────────────────────────────

_FREE_PLANS  = {"free"}
_PAID_PLANS  = {"standard", "pro"}


def _build_provider(backend: str, *, json_mode: bool = False) -> AIProvider:
    """
    Instantiate a provider by name string.

    Parameters
    ----------
    backend : str
        One of ``"groq"``, ``"deepseek"``, ``"ollama"``.
    json_mode : bool
        Passed through to providers that support it (Groq, DeepSeek).

    Returns
    -------
    AIProvider
        A fully configured, ready-to-use provider instance.

    Raises
    ------
    AIProviderError
        If *backend* is not a recognised provider name.
    """
    if backend == "groq":
        from app.services.ai.providers.groq_provider import GroqProvider
        p = GroqProvider(json_mode=json_mode)
        logger.debug("Router → GroqProvider (model=%s, json_mode=%s)", p.model, json_mode)
        return p

    if backend == "deepseek":
        from app.services.ai.providers.deepseek_provider import DeepSeekProvider
        p = DeepSeekProvider(json_mode=json_mode)
        logger.debug("Router → DeepSeekProvider (model=%s, json_mode=%s)", p.model, json_mode)
        return p

    if backend == "ollama":
        from app.services.ai.providers.ollama import LocalLlamaProvider
        p = LocalLlamaProvider()
        logger.debug("Router → LocalLlamaProvider (model=%s)", p.model)
        return p

    raise AIProviderError(
        f"Unknown provider backend {backend!r}. "
        "Valid values: 'groq', 'deepseek', 'ollama'. "
        "Check AI_PROVIDER_FREE / AI_PROVIDER_PAID env-vars."
    )


def get_provider_for_plan(plan: str) -> AIProvider:
    """
    Return the appropriate AI provider for *plan*.

    Plan routing table
    ------------------
    "free"                  → AI_PROVIDER_FREE  (default: GroqProvider)
    "standard" / "pro"      → AI_PROVIDER_PAID  (default: DeepSeekProvider)

    Parameters
    ----------
    plan : str
        The teacher's subscription plan identifier.  Case-insensitive.
        Expected values: ``"free"``, ``"standard"``, ``"pro"``.

    Returns
    -------
    AIProvider
        A configured provider instance.  Free-plan providers are created with
        ``json_mode=True`` so structured exercise generation works out-of-the-box.

    Raises
    ------
    AIProviderError
        If *plan* is not recognised or the underlying provider cannot be
        instantiated (e.g. missing API key).

    Example
    -------
    provider = get_provider_for_plan("pro")
    result   = await provider.agenerate(my_prompt)
    """
    normalised = plan.strip().lower() if plan else "free"

    if normalised in _FREE_PLANS:
        logger.info(
            "Plan-router: plan=%r → backend=%r (free tier)", normalised, _FREE_BACKEND
        )
        return _build_provider(_FREE_BACKEND, json_mode=True)

    if normalised in _PAID_PLANS:
        logger.info(
            "Plan-router: plan=%r → backend=%r (paid tier)", normalised, _PAID_BACKEND
        )
        return _build_provider(_PAID_BACKEND, json_mode=False)

    # Unknown plan — fall back to free-tier behaviour and log a warning so
    # engineers notice if a new plan string is introduced without updating here.
    logger.warning(
        "Plan-router: unrecognised plan=%r — falling back to free-tier backend=%r",
        plan,
        _FREE_BACKEND,
    )
    return _build_provider(_FREE_BACKEND, json_mode=True)