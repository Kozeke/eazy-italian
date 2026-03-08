"""
Course Generator Service — AI-powered course builder.

Generates complete courses (Course, Units, Tasks, Tests, Questions) from a
high-level description using Groq/Llama.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.models.course import Course, CourseLevel, CourseStatus
from app.models.unit import Unit, UnitLevel
from app.models.task import Task, TaskType, TaskStatus
from app.services.ai.providers.base import AIProvider, AIProviderError
from app.services.test_builder import create_ai_generated_test

logger = logging.getLogger(__name__)


# ── Request schema ───────────────────────────────────────────────────────────────

class CourseGenerateRequest(BaseModel):
    """Request payload for course generation."""

    title: str = Field(..., min_length=3, max_length=255)
    description: str = Field(..., min_length=10)
    level: CourseLevel
    num_units: int = Field(5, ge=1, le=20)
    language: str = Field("Italian", description="Target language for the course")


# ── Service ─────────────────────────────────────────────────────────────────────

class CourseGeneratorService:
    """
    Orchestrates AI-powered course generation.

    Flow:
    1. Generate course blueprint JSON via LLM
    2. Parse and validate JSON structure
    3. Save Course + Units + Tasks + Tests to database
    """

    def __init__(self, ai_provider: AIProvider) -> None:
        """
        Initialize with an injected AI provider.

        Parameters
        ----------
        ai_provider : AIProvider
            The AI provider to use for course generation (Groq/Ollama/etc).
        """
        self.provider = ai_provider

    async def generate_preview(self, request: CourseGenerateRequest) -> dict[str, Any]:
        """
        Generate course blueprint JSON without saving to database.

        Returns
        -------
        dict
            Raw course blueprint with units, tasks, tests structure.
        """
        prompt = self._build_prompt(request)
        raw_output = await self.provider.agenerate(prompt)
        blueprint = self._parse_json(raw_output)
        return blueprint

    async def generate_and_save(
        self,
        request: CourseGenerateRequest,
        db: Session,
        teacher_id: int,
    ) -> Course:
        """
        Full pipeline: generate blueprint → parse → save to database.

        Returns
        -------
        Course
            The newly created course (DRAFT status).
        """
        blueprint = await self.generate_preview(request)

        # Create Course
        course = Course(
            title=request.title,
            description=request.description,
            level=request.level,
            status=CourseStatus.DRAFT,
            created_by=teacher_id,
        )
        db.add(course)
        db.flush()

        # Hydrate units, tasks, tests
        await self._hydrate(blueprint, request, db, teacher_id, course.id)

        db.commit()
        db.refresh(course)
        return course

    @staticmethod
    async def _hydrate(
        data: dict[str, Any],
        request: CourseGenerateRequest,
        db: Session,
        teacher_id: int,
        course_id: int,
    ) -> None:
        """
        Create Units, Tasks, and Tests from the blueprint data.

        Parameters
        ----------
        data : dict
            Parsed course blueprint JSON.
        request : CourseGenerateRequest
            Original generation request.
        db : Session
            Database session.
        teacher_id : int
            ID of the teacher creating the course.
        course_id : int
            ID of the parent Course.
        """
        units_data = data.get("units", [])

        for unit_idx, unit_data in enumerate(units_data):
            # Create Unit
            # Map CourseLevel to UnitLevel (handle MIXED case)
            if request.level == CourseLevel.MIXED:
                # For mixed courses, default to A1 (can be edited later)
                unit_level = UnitLevel.A1
            else:
                # CourseLevel and UnitLevel share the same enum values (A1-A2, B1-B2, C1-C2)
                unit_level = UnitLevel(request.level.value)
            
            unit = Unit(
                course_id=course_id,
                title=unit_data.get("title", f"Unit {unit_idx + 1}"),
                level=unit_level,
                description=unit_data.get("description", ""),
                order_index=unit_idx,
                created_by=teacher_id,
            )
            db.add(unit)
            db.flush()

            # Create Tasks
            tasks_data = unit_data.get("tasks", [])
            for task_idx, task_data in enumerate(tasks_data):
                # For manual tasks, don't set auto_task_type (leave it as None/default)
                task = Task(
                    unit_id=unit.id,
                    title=task_data.get("title", f"Task {task_idx + 1}"),
                    description=task_data.get("description", ""),
                    content=task_data.get("content", ""),
                    type=TaskType.MANUAL,  # Default to manual homework
                    status=TaskStatus.DRAFT,
                    order_index=task_idx,
                    max_score=100.0,
                    created_by=teacher_id,
                )
                # Explicitly set auto_task_type to None using SQL NULL
                # This ensures SQLAlchemy doesn't try to insert it as a string
                task.auto_task_type = None
                db.add(task)
                # Flush individually to avoid batch insert issues with enum types
                db.flush()

            # Create Test using test_builder pipeline
            questions_raw = unit_data.get("test_questions", [])
            if questions_raw:
                await create_ai_generated_test(
                    db=db,
                    unit_id=unit.id,
                    title=f"Unit Test — {unit.title}",
                    description=f"Auto-generated test for: {unit.title}.",
                    questions_data=_normalize_test_questions(questions_raw),
                    created_by=teacher_id,
                    difficulty=request.level.value,  # e.g. "A1", "A2", etc.
                    points_per_question=1.0,
                    time_limit_minutes=15,
                    passing_score=70.0,
                )

    def _build_prompt(self, request: CourseGenerateRequest) -> str:
        """Build the LLM prompt for course generation."""
        return f"""Generate a complete course structure in JSON format for:

Title: {request.title}
Description: {request.description}
Level: {request.level.value}
Language: {request.language}
Number of Units: {request.num_units}

Return a JSON object with this exact structure:

{{
  "units": [
    {{
      "title": "Unit title",
      "description": "Unit description",
      "tasks": [
        {{
          "title": "Task title",
          "description": "Task description",
          "content": "Task content/instructions"
        }}
      ],
      "test_questions": [
        {{
          "prompt_rich": "Question text",
          "options": ["Option A", "Option B", "Option C", "Option D"],
          "correct_answer": "exact text of the correct option verbatim",
          "explanation_rich": "Explanation of the answer"
        }}
      ]
    }}
  ]
}}

Important:
- Generate exactly {request.num_units} units
- Each unit should have 2-3 tasks
- Each unit should have 5-10 test questions (multiple choice)
- For correct_answer, use the EXACT TEXT of the correct option (not an index)
- All content should be appropriate for {request.level.value} level
- Content should be in {request.language} language

Return ONLY valid JSON, no markdown, no code blocks."""

    def _parse_json(self, raw_output: str) -> dict[str, Any]:
        """
        Extract JSON from LLM output.

        Handles cases where the model wraps JSON in markdown code blocks.
        """
        raw_output = raw_output.strip()

        # Remove markdown code blocks if present
        if raw_output.startswith("```"):
            lines = raw_output.split("\n")
            # Remove first line (```json or ```)
            lines = lines[1:]
            # Remove last line if it's ```
            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]
            raw_output = "\n".join(lines)

        try:
            return json.loads(raw_output)
        except json.JSONDecodeError as exc:
            logger.error("Failed to parse JSON from LLM output: %s", raw_output[:500])
            raise ValueError(f"AI returned invalid JSON: {exc}") from exc


# ── Helper functions ────────────────────────────────────────────────────────────

def _normalize_test_questions(questions_raw: list) -> list:
    """
    Convert course-generator question format → test_builder format.

    test_builder._build_question() expects:
        correct_answer: ["option text"]   ← list with option TEXT

    Course generator LLM may produce:
        correct_answer: "option text"     ← string  (what we ask for)
        correct_answer: 0                 ← int index (fallback)
        correct_answer: ["option text"]   ← already correct
    """
    result = []
    for q in questions_raw:
        options = q.get("options", [])
        raw = q.get("correct_answer")

        if isinstance(raw, str):
            correct_answer = [raw]
        elif isinstance(raw, int):
            correct_answer = [options[raw] if 0 <= raw < len(options) else options[0]]
        elif isinstance(raw, list):
            if raw and isinstance(raw[0], int):
                correct_answer = [options[raw[0]] if 0 <= raw[0] < len(options) else options[0]]
            else:
                correct_answer = [str(raw[0])] if raw else [options[0]]
        else:
            correct_answer = [options[0]] if options else [""]

        result.append({
            "prompt_rich":      q.get("prompt_rich", q.get("prompt", "")),
            "options":          options,
            "correct_answer":   correct_answer,   # ← now a list[str]
            "explanation_rich": q.get("explanation_rich", ""),
        })
    return result
