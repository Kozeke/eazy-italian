"""
tests/test_slide_generator.py
==============================
Unit + integration tests for the AI Slide Generator feature.

Test strategy
-------------
* AIProvider is always mocked — no real LLM calls.
* Tests cover: happy path, retry logic, malformed JSON, empty response,
  schema back-fill, async path, and FastAPI endpoint integration.

Run with:
    pytest tests/test_slide_generator.py -v
"""

from __future__ import annotations

import json
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.schemas.slides import Slide, SlideDeck, SlideGenerationRequest
from app.services.ai.providers.base import AIProvider, AIProviderError
from app.services.slide_generator import SlideGenerationError, SlideGeneratorService


# ── Fixtures ───────────────────────────────────────────────────────────────────

def _make_valid_deck_dict(
    topic: str = "Test Topic",
    level: str = "beginner",
    duration: int = 30,
    n_slides: int = 3,
) -> dict[str, Any]:
    """Build a minimal but valid SlideDeck JSON payload."""
    slides = []
    for i in range(n_slides):
        slide: dict[str, Any] = {
            "title": f"Slide {i + 1}",
            "bullet_points": [f"Point A for slide {i + 1}", f"Point B for slide {i + 1}"],
            "examples": [f"Example for slide {i + 1}"],
            "exercise": f"Practice task for slide {i + 1}",
            "teacher_notes": f"Teacher hint for slide {i + 1}",
        }
        slides.append(slide)

    return {
        "topic":            topic,
        "level":            level,
        "target_audience":  None,
        "duration_minutes": duration,
        "slides":           slides,
    }


def _make_provider(return_value: str) -> AIProvider:
    """Return a mock AIProvider whose generate() returns *return_value*."""
    provider = MagicMock(spec=AIProvider)
    provider.generate.return_value = return_value
    provider.agenerate = AsyncMock(return_value=return_value)
    return provider


def _make_request(**kwargs: Any) -> SlideGenerationRequest:
    defaults = dict(
        topic="The Water Cycle",
        level="Grade 5",
        duration_minutes=30,
        target_audience="Primary school students",
        include_exercises=True,
        include_teacher_notes=True,
    )
    defaults.update(kwargs)
    return SlideGenerationRequest(**defaults)


# ── Schema tests ───────────────────────────────────────────────────────────────

class TestSlide:
    def test_valid_slide(self):
        s = Slide(title="Intro", bullet_points=["Point one", "Point two"])
        assert s.title == "Intro"
        assert len(s.bullet_points) == 2

    def test_slide_strips_whitespace_from_bullets(self):
        s = Slide(title="X", bullet_points=["  hello  ", "  world  "])
        assert s.bullet_points == ["hello", "world"]

    def test_slide_requires_at_least_one_bullet(self):
        with pytest.raises(ValidationError):
            Slide(title="X", bullet_points=[])

    def test_slide_optional_fields_default_to_none(self):
        s = Slide(title="X", bullet_points=["Y"])
        assert s.examples is None
        assert s.exercise is None
        assert s.teacher_notes is None

    def test_slide_title_max_length(self):
        with pytest.raises(ValidationError):
            Slide(title="A" * 121, bullet_points=["ok"])


class TestSlideDeck:
    def test_valid_deck(self):
        deck = SlideDeck(**_make_valid_deck_dict())
        assert deck.topic == "Test Topic"
        assert len(deck.slides) == 3

    def test_deck_requires_slides(self):
        data = _make_valid_deck_dict()
        data["slides"] = []
        with pytest.raises(ValidationError):
            SlideDeck(**data)


class TestSlideGenerationRequest:
    def test_valid_request(self):
        req = _make_request()
        assert req.topic == "The Water Cycle"
        assert req.include_exercises is True

    def test_duration_min_boundary(self):
        with pytest.raises(ValidationError):
            _make_request(duration_minutes=4)

    def test_duration_max_boundary(self):
        with pytest.raises(ValidationError):
            _make_request(duration_minutes=181)

    def test_language_defaults_to_english(self):
        req = _make_request()
        assert req.language == "English"


# ── SlideGeneratorService tests ────────────────────────────────────────────────

class TestSlideGeneratorService:

    # ── happy path ─────────────────────────────────────────────────────────────

    def test_generate_slides_happy_path(self):
        deck_dict = _make_valid_deck_dict()
        provider  = _make_provider(json.dumps(deck_dict))
        service   = SlideGeneratorService(ai_provider=provider)
        request   = _make_request()

        deck = service.generate_slides(request)

        assert isinstance(deck, SlideDeck)
        assert deck.topic == "Test Topic"
        assert len(deck.slides) == 3
        provider.generate.assert_called_once()

    def test_provider_receives_non_empty_prompt(self):
        provider = _make_provider(json.dumps(_make_valid_deck_dict()))
        service  = SlideGeneratorService(ai_provider=provider)
        service.generate_slides(_make_request())

        call_args = provider.generate.call_args[0][0]
        assert "The Water Cycle" in call_args
        assert "Grade 5" in call_args

    def test_deck_back_fills_topic_from_request(self):
        """If model omits top-level fields, service fills them from request."""
        data = _make_valid_deck_dict()
        del data["topic"]
        del data["level"]

        provider = _make_provider(json.dumps(data))
        service  = SlideGeneratorService(ai_provider=provider)
        request  = _make_request(topic="My Topic", level="advanced")

        deck = service.generate_slides(request)
        assert deck.topic == "My Topic"
        assert deck.level == "advanced"

    # ── markdown fence stripping ───────────────────────────────────────────────

    def test_strips_markdown_json_fence(self):
        raw = "```json\n" + json.dumps(_make_valid_deck_dict()) + "\n```"
        provider = _make_provider(raw)
        service  = SlideGeneratorService(ai_provider=provider)
        deck = service.generate_slides(_make_request())
        assert isinstance(deck, SlideDeck)

    def test_strips_plain_markdown_fence(self):
        raw = "```\n" + json.dumps(_make_valid_deck_dict()) + "\n```"
        provider = _make_provider(raw)
        service  = SlideGeneratorService(ai_provider=provider)
        deck = service.generate_slides(_make_request())
        assert isinstance(deck, SlideDeck)

    # ── retry logic ────────────────────────────────────────────────────────────

    def test_retries_once_on_invalid_json(self):
        valid_json = json.dumps(_make_valid_deck_dict())
        provider   = _make_provider("not valid json at all")
        # Second call returns valid JSON
        provider.generate.side_effect = ["not valid json", valid_json]
        service = SlideGeneratorService(ai_provider=provider, max_retries=1)

        deck = service.generate_slides(_make_request())

        assert isinstance(deck, SlideDeck)
        assert provider.generate.call_count == 2

    def test_raises_after_all_retries_exhausted(self):
        provider = _make_provider("not valid json")
        provider.generate.side_effect = ["bad json 1", "bad json 2"]
        service  = SlideGeneratorService(ai_provider=provider, max_retries=1)

        with pytest.raises(SlideGenerationError):
            service.generate_slides(_make_request())

        assert provider.generate.call_count == 2

    def test_no_retry_when_max_retries_zero(self):
        provider = _make_provider("bad json")
        service  = SlideGeneratorService(ai_provider=provider, max_retries=0)

        with pytest.raises(SlideGenerationError):
            service.generate_slides(_make_request())

        provider.generate.assert_called_once()

    # ── error cases ────────────────────────────────────────────────────────────

    def test_empty_response_raises(self):
        provider = _make_provider("")
        service  = SlideGeneratorService(ai_provider=provider)

        with pytest.raises(SlideGenerationError, match="empty response"):
            service.generate_slides(_make_request())

    def test_whitespace_only_response_raises(self):
        provider = _make_provider("   \n\t  ")
        service  = SlideGeneratorService(ai_provider=provider)

        with pytest.raises(SlideGenerationError):
            service.generate_slides(_make_request())

    def test_json_without_slides_key_raises(self):
        provider = _make_provider(json.dumps({"topic": "X", "level": "Y"}))
        service  = SlideGeneratorService(ai_provider=provider)

        with pytest.raises(SlideGenerationError):
            service.generate_slides(_make_request())

    def test_provider_error_propagates(self):
        provider         = MagicMock(spec=AIProvider)
        provider.generate.side_effect = AIProviderError("Ollama is down")
        provider.agenerate = AsyncMock(side_effect=AIProviderError("Ollama is down"))
        service = SlideGeneratorService(ai_provider=provider, max_retries=0)

        with pytest.raises(SlideGenerationError):
            service.generate_slides(_make_request())

    # ── JSON embedded in prose ─────────────────────────────────────────────────

    def test_extracts_json_embedded_in_prose(self):
        """Model ignores the 'no prose' instruction — we still extract the JSON."""
        valid    = _make_valid_deck_dict()
        response = f"Sure! Here is the deck:\n{json.dumps(valid)}\nHope that helps."
        provider = _make_provider(response)
        service  = SlideGeneratorService(ai_provider=provider)

        deck = service.generate_slides(_make_request())
        assert isinstance(deck, SlideDeck)

    # ── async path ─────────────────────────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_agenerate_slides_happy_path(self):
        deck_dict = _make_valid_deck_dict()
        provider  = _make_provider(json.dumps(deck_dict))
        service   = SlideGeneratorService(ai_provider=provider)

        deck = await service.agenerate_slides(_make_request())

        assert isinstance(deck, SlideDeck)
        provider.agenerate.assert_called_once()

    @pytest.mark.asyncio
    async def test_agenerate_retries_on_bad_json(self):
        valid_json = json.dumps(_make_valid_deck_dict())
        provider   = _make_provider("")
        provider.agenerate = AsyncMock(side_effect=["bad json", valid_json])
        service = SlideGeneratorService(ai_provider=provider, max_retries=1)

        deck = await service.agenerate_slides(_make_request())
        assert isinstance(deck, SlideDeck)
        assert provider.agenerate.call_count == 2

    # ── constructor validation ─────────────────────────────────────────────────

    def test_constructor_rejects_non_provider(self):
        with pytest.raises(TypeError):
            SlideGeneratorService(ai_provider="not_a_provider")  # type: ignore


# ── FastAPI endpoint tests ─────────────────────────────────────────────────────

class TestGenerateSlidesEndpoint:
    """Integration tests using FastAPI's TestClient with a mocked service."""

    @pytest.fixture()
    def client(self):
        """Minimal FastAPI app with only the AI router mounted."""
        from fastapi import FastAPI
        from app.api.routes.ai import router

        app = FastAPI()
        app.include_router(router, prefix="/ai")
        return TestClient(app)

    @pytest.fixture()
    def valid_payload(self) -> dict:
        return {
            "topic": "Photosynthesis",
            "level": "Grade 6",
            "duration_minutes": 45,
            "target_audience": "Middle school students",
            "include_exercises": True,
            "include_teacher_notes": True,
        }

    @pytest.fixture()
    def mock_deck(self) -> SlideDeck:
        return SlideDeck(**_make_valid_deck_dict(topic="Photosynthesis", level="Grade 6"))

    def test_returns_200_with_valid_deck(self, client, valid_payload, mock_deck):
        with patch(
            "app.api.routes.ai.SlideGeneratorService.agenerate_slides",
            new=AsyncMock(return_value=mock_deck),
        ):
            resp = client.post("/ai/generate-slides", json=valid_payload)

        assert resp.status_code == 200
        body = resp.json()
        assert body["topic"] == "Test Topic"       # from fixture deck
        assert "slides" in body
        assert len(body["slides"]) == 3

    def test_returns_422_on_missing_topic(self, client):
        resp = client.post("/ai/generate-slides", json={"level": "A2", "duration_minutes": 30})
        assert resp.status_code == 422

    def test_returns_422_on_duration_too_short(self, client, valid_payload):
        valid_payload["duration_minutes"] = 2
        resp = client.post("/ai/generate-slides", json=valid_payload)
        assert resp.status_code == 422

    def test_returns_503_when_service_raises(self, client, valid_payload):
        with patch(
            "app.api.routes.ai.SlideGeneratorService.agenerate_slides",
            new=AsyncMock(side_effect=SlideGenerationError("model error")),
        ):
            resp = client.post("/ai/generate-slides", json=valid_payload)

        assert resp.status_code == 503

    def test_returns_503_when_provider_raises(self, client, valid_payload):
        with patch(
            "app.api.routes.ai.SlideGeneratorService.agenerate_slides",
            new=AsyncMock(side_effect=AIProviderError("Ollama is down")),
        ):
            resp = client.post("/ai/generate-slides", json=valid_payload)

        assert resp.status_code == 503

    def test_health_endpoint_returns_200(self, client):
        with patch("app.api.routes.ai.get_ai_provider") as mock_get:
            provider = MagicMock()
            provider.warm_up.return_value = True
            mock_get.return_value = provider
            resp = client.get("/ai/health")

        assert resp.status_code == 200
        assert resp.json()["status"] in ("ok", "error")

    def test_response_shape_matches_slide_deck_schema(self, client, valid_payload, mock_deck):
        with patch(
            "app.api.routes.ai.SlideGeneratorService.agenerate_slides",
            new=AsyncMock(return_value=mock_deck),
        ):
            resp = client.post("/ai/generate-slides", json=valid_payload)

        body = resp.json()
        # Top-level keys
        for key in ("topic", "level", "duration_minutes", "slides"):
            assert key in body, f"Missing top-level key: {key}"

        # Slide-level keys
        first_slide = body["slides"][0]
        assert "title" in first_slide
        assert "bullet_points" in first_slide
        assert isinstance(first_slide["bullet_points"], list)