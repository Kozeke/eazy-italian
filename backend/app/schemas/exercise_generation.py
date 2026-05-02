"""
app/schemas/exercise_generation.py

Pydantic v2 schemas for the exercise-generation API.

Design
------
One generic request/response pair covers all exercise types:

    ExerciseGenerateRequest   → POST /segments/{id}/exercises/{type}
    ExerciseGenerateResponse  → all exercise generation endpoints

Each exercise type may carry extra params in the `params` dict.
The  build_generator_params()  method normalises + validates them
so the endpoint stays clean.

Backward-compat aliases (DragToGapGenerateRequest / Response) are
kept so any existing code that imports them continues to work.
"""

from __future__ import annotations

from typing import Any, Literal, Union

from pydantic import BaseModel, Field, model_validator


# ── Generic ───────────────────────────────────────────────────────────────────

class ExerciseGenerateRequest(BaseModel):
    """
    Request body for POST /segments/{id}/exercises/{exercise_type}.

    Common fields apply to every exercise type.
    Type-specific fields live in the `params` dict — see build_generator_params().
    """

    unit_id: int | None = Field(
        default=None,
        description=(
            "Optional: override the parent unit. "
            "If omitted the unit is resolved from the segment automatically."
        ),
    )
    block_title: str | None = Field(
        default=None,
        max_length=255,
        description="Override the exercise block title shown in the lesson.",
    )
    content_language: str = Field(
        default="auto",
        max_length=64,
        description="Language the source unit content is written in ('auto' = infer).",
    )
    instruction_language: str = Field(
        default="english",
        max_length=64,
        description="Language used for the exercise title / UI labels shown to students.",
    )
    topic_hint: str | None = Field(
        default=None,
        max_length=512,
        description=(
            "Optional teacher directive. Used as sole content source when the unit "
            "has no textual material. Example: 'Generate text with focus on future simple'."
        ),
    )
    difficulty: str | None = Field(
        default=None,
        max_length=64,
        description="Optional difficulty preference (for example Beginner, Intermediate, Advanced).",
    )

    # ── Type-specific extras ──────────────────────────────────────────────────
    # Gap-based exercises (drag_to_gap, type_word_in_gap, select_word_form)
    gap_count: Union[int, Literal["auto"]] = Field(
        default="auto",
        description=(
            "Number of word gaps to create, or 'auto' to let the AI decide. "
            "Integer must be 1–15."
        ),
    )
    gap_type: str | None = Field(
        default=None,
        max_length=128,
        description=(
            "Word-class constraint for gap selection. "
            "Examples: 'Verbs only', 'Nouns only', 'Mixed (verbs and nouns)'."
        ),
    )

    # Match-pairs / sort-into-columns exercises
    pair_count: Union[int, Literal["auto"]] = Field(
        default="auto",
        description="Number of pairs / items to generate. Integer must be 2–12.",
    )

    @model_validator(mode="after")
    def _validate_counts(self) -> "ExerciseGenerateRequest":
        if isinstance(self.gap_count, int) and not (1 <= self.gap_count <= 15):
            raise ValueError("gap_count must be between 1 and 15.")
        if isinstance(self.pair_count, int) and not (2 <= self.pair_count <= 12):
            raise ValueError("pair_count must be between 2 and 12.")
        return self

    def build_generator_params(self) -> dict[str, Any]:
        """
        Return the kwargs dict forwarded to the exercise generator function.

        The generator ignores any kwargs it doesn't understand, so it's safe to
        pass everything here — no need for type-specific param-building.
        """
        resolved_gap_count: int | None = (
            None if (self.gap_count is None or self.gap_count == "auto")
            else int(self.gap_count)
        )
        resolved_pair_count: int | None = (
            None if (self.pair_count is None or self.pair_count == "auto")
            else int(self.pair_count)
        )
        return {
            "gap_count":   resolved_gap_count,
            "gap_type":    self.gap_type,
            "pair_count":  resolved_pair_count,
            "difficulty":  self.difficulty,
        }


class ExerciseGenerateResponse(BaseModel):
    block: dict[str, Any]
    metadata: dict[str, Any] = Field(default_factory=dict)


# ── Backward-compat aliases ───────────────────────────────────────────────────

class DragToGapGenerateRequest(ExerciseGenerateRequest):
    """
    Legacy schema kept for existing code that imports DragToGapGenerateRequest.
    Identical to ExerciseGenerateRequest — no new fields needed.
    """
    pass


class DragToGapGenerateResponse(ExerciseGenerateResponse):
    pass