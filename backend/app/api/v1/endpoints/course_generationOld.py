"""
course_generation.py
====================
Two endpoints for the TeacherOnboarding wizard.

POST /generate-outline   → course title + description + modules + lesson stubs
POST /generate-lesson    → slides (SlideGeneratorService)
                           + tasks (ai_task_generator)
                           + test  (ai_test_generator)
                           — all three generated in parallel

Design decisions
----------------
* generate-outline  : single LLM call — structure only, no content generation.
* generate-lesson   : three *parallel* AI calls via asyncio.gather():
    1. SlideGeneratorService.agenerate_slides()  — reuses DI singleton from
       slide_generation.py (same Ollama connection, same cache backend).
    2. generate_tasks_from_unit_content()        — from ai_task_generator.py.
    3. generate_mcq_from_unit_content()          — from ai_test_generator.py.
  All three share the same "virtual unit content" assembled from the request
  body (lesson metadata + RAG context).  If any one of the three fails, the
  whole request fails — partial lesson content is not useful to the teacher.

* Response schema is intentionally kept compatible with the existing frontend
  in TeacherOnboarding.jsx — no frontend changes required.

Registration (add to api.py)
-----------------------------
    from app.services.course_generator import router as course_builder_router
    api_router.include_router(
        course_builder_router,
        prefix="/course-builder",
        tags=["Course Builder"],
    )
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from functools import lru_cache
from typing import Annotated, Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.schemas.slides import SlideGenerationRequest
from app.services.ai.providers.base import AIProvider, AIProviderError
from app.services.ai.providers.groq_provider import GroqProvider
from app.services.ai_task_generator import generate_tasks_from_unit_content
from app.services.ai_test_generator import generate_mcq_from_unit_content
from app.services.slide_generator import SlideGeneratorService, SlideGenerationError

# Reuse the provider and slide-service singletons from slide_generation.py.
# Importing the *functions* (not calling them) lets lru_cache deduplicate
# the Ollama connection — no second provider instance is created.
from app.api.v1.endpoints.slide_generation import get_ai_provider, get_slide_service, SlideSvc

# For publish endpoint
from app.core.database import get_db
from app.core.auth import get_current_teacher
from app.models.course import Course, CourseLevel, CourseStatus
from app.models.unit import Unit, UnitLevel, UnitStatus
from app.models.presentation import Presentation, PresentationSlide, PresentationStatus
from app.models.task import Task, TaskType, TaskStatus
from app.models.test import Test, TestStatus, Question, QuestionType, TestQuestion
from app.models.user import User
from sqlalchemy.orm import Session
from datetime import datetime
import re

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Provider dependencies ───────────────────────────────────────────────────────

@lru_cache(maxsize=1)
def get_groq_provider() -> AIProvider:
    """Groq provider singleton for course outline generation."""
    return GroqProvider()


# ── Request / Response schemas ─────────────────────────────────────────────────

class CourseOutlineRequest(BaseModel):
    subject:            str
    level:              str
    native_language:    str = "English"
    unit_count:         int = Field(default=4, ge=1, le=12)
    extra_instructions: str = ""


class LessonStub(BaseModel):
    id:        str
    title:     str
    objective: str

class CourseModule(BaseModel):
    id:      str
    title:   str
    lessons: List[LessonStub]

class CourseOutlineResponse(BaseModel):
    title:       str
    description: str
    modules:     List[CourseModule]


class LessonContentRequest(BaseModel):
    # Course context
    course_title:       str
    course_description: str = ""
    # Lesson context
    module_title:       str
    lesson_title:       str
    lesson_objective:   str
    # Learner context
    subject:            str
    level:              str
    native_language:    str = "English"
    extra_instructions: str = ""
    # Optional RAG context pre-fetched by the caller from /rag/retrieve
    rag_context:        str = ""
    # Generation tuning
    slide_duration_minutes: int = Field(default=20, ge=5, le=90)
    task_count:             int = Field(default=3,  ge=1, le=6)
    mcq_count:              int = Field(default=4,  ge=2, le=10)
    difficulty:             str = "medium"


# Response schema — intentionally unchanged from the frontend contract

class SlideItem(BaseModel):
    id:      str
    emoji:   str
    title:   str
    bullets: List[str]

class TaskItem(BaseModel):
    id:          str
    type:        str
    instruction: str
    example:     Optional[str] = None

class MCQQuestion(BaseModel):
    id:       str
    question: str
    options:  List[str]
    correct:  int           # 0-based index into options

class LessonContentResponse(BaseModel):
    slides: List[SlideItem]
    tasks:  List[TaskItem]
    test:   List[MCQQuestion]


# ── Helpers ────────────────────────────────────────────────────────────────────

def _insert_missing_closers(text: str) -> str:
    """
    Walk the JSON character-by-character and insert missing closing braces/
    brackets wherever the bracket stack disagrees with the actual token.

    Handles the case where the LLM drops a closing `}` for the last object
    in an array, e.g.:

        "lessons": [
          { "id": "l1", "objective": "..."   ← missing }
        ]                                     ← ] seen while stack top is }

    Compared with _repair_truncated_json (which only appends a suffix for
    truly truncated responses), this function fixes interior structural gaps.
    """
    result: list[str] = []
    stack:  list[str] = []  # expected closing tokens
    i, n = 0, len(text)

    while i < n:
        ch = text[i]

        # ── string literal — copy verbatim, don't inspect brackets inside ──
        if ch == '"':
            result.append(ch)
            i += 1
            while i < n:
                c = text[i]
                if c == '\\':
                    result.append(c)
                    i += 1
                    if i < n:
                        result.append(text[i])
                        i += 1
                    continue
                result.append(c)
                i += 1
                if c == '"':
                    break
            continue

        # ── opening brackets ──────────────────────────────────────────────
        if ch == '{':
            stack.append('}')
        elif ch == '[':
            stack.append(']')

        # ── closing brackets — insert missing closers if stack mismatches ─
        elif ch in '}]':
            while stack and stack[-1] != ch:
                result.append(stack.pop())   # e.g. insert '}' before ']'
            if stack:
                stack.pop()

        result.append(ch)
        i += 1

    # Append any remaining unclosed brackets (handles truncated suffix too)
    while stack:
        result.append(stack.pop())

    return ''.join(result)


def _repair_truncated_json(fragment: str) -> dict[str, Any] | None:
    """
    Attempt to close a truncated JSON object by counting unclosed brackets,
    then appending the minimum closing tokens needed.

    Mirrors SlideGeneratorService._repair_truncated_json exactly.
    Returns parsed dict on success, None if repair fails.
    """
    text    = fragment.rstrip()
    in_str  = False
    escape  = False

    # Walk to determine if we're mid-string
    for ch in text:
        if escape:
            escape = False
            continue
        if ch == "\\" and in_str:
            escape = True
            continue
        if ch == '"':
            in_str = not in_str

    suffix = ""
    if in_str:
        suffix += '"'

    # Build closing sequence from open brackets
    close_stack: list[str] = []
    in_str2 = False
    escape2 = False
    for ch in text:
        if escape2:
            escape2 = False
            continue
        if ch == "\\" and in_str2:
            escape2 = True
            continue
        if ch == '"':
            in_str2 = not in_str2
            continue
        if in_str2:
            continue
        if ch == "{":
            close_stack.append("}")
        elif ch == "[":
            close_stack.append("]")
        elif ch in "}]" and close_stack:
            close_stack.pop()

    suffix += "".join(reversed(close_stack))

    if not suffix:
        return None  # wasn't truncated

    repaired = text + suffix
    # Remove trailing commas left before closing brackets when the LLM was
    # cut off mid-array/object (e.g. `"id": "m1",\n` → truncated → `}]}`
    # would produce `{"id": "m1",}` which is invalid JSON).
    repaired = re.sub(r",\s*([}\]])", r"\1", repaired)
    try:
        result = json.loads(repaired)
        logger.warning(
            "Repaired truncated JSON outline by appending %r", suffix
        )
        return result
    except json.JSONDecodeError:
        return None


def _extract_json(raw: str) -> dict[str, Any]:
    """
    Strip markdown fences and return the first valid JSON object.
    Falls back to bracket-closing repair for truncated LLM responses.
    """
    logger.info(f"[_extract_json] Raw response length: {len(raw)} chars")
    logger.debug(f"[_extract_json] Raw response (first 500 chars): {raw[:500]!r}")
    logger.debug(f"[_extract_json] Raw response (last 200 chars): {raw[-200:]!r}")
    
    cleaned = re.sub(r"^```(?:json)?\s*", "", raw.strip(), flags=re.IGNORECASE)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    # Normalise trailing commas before ] / } — common LLM artefact.
    cleaned = re.sub(r",\s*([}\]])", r"\1", cleaned)
    
    logger.debug(f"[_extract_json] Cleaned length: {len(cleaned)} chars")

    # 1. Fast path — complete valid JSON
    try:
        result = json.loads(cleaned)
        logger.info("[_extract_json] Successfully parsed JSON on first attempt")
        return result
    except json.JSONDecodeError as e:
        logger.warning(f"[_extract_json] First parse attempt failed: {e}")

    # 2. JSON embedded in prose — find first { … } block
    match = re.search(r"\{", cleaned)
    if match:
        candidate = cleaned[match.start():]
        logger.debug(f"[_extract_json] Found JSON candidate starting at position {match.start()}, length: {len(candidate)}")
        try:
            result = json.loads(candidate)
            logger.info("[_extract_json] Successfully parsed JSON from candidate")
            return result
        except json.JSONDecodeError as e:
            logger.warning(f"[_extract_json] Candidate parse failed: {e}")
            # 3. Truncated — try bracket-closing repair on the candidate
            logger.info("[_extract_json] Attempting to repair truncated JSON...")
            repaired = _repair_truncated_json(candidate)
            if repaired is not None:
                logger.info("[_extract_json] Successfully repaired truncated JSON")
                return repaired
            else:
                logger.error("[_extract_json] Repair attempt failed")

            # 4. Interior missing closers (e.g. LLM forgot } before ])
            logger.info("[_extract_json] Attempting interior-closer repair...")
            try:
                fixed = _insert_missing_closers(candidate)
                fixed = re.sub(r",\s*([}\]])", r"\1", fixed)
                result = json.loads(fixed)
                logger.warning("[_extract_json] Fixed JSON via interior-closer insertion")
                return result
            except (json.JSONDecodeError, Exception) as e2:
                logger.error("[_extract_json] Interior-closer repair failed: %s", e2)

    logger.error(
        f"[_extract_json] No valid JSON found. Full response length: {len(raw)}, "
        f"first 500 chars: {raw[:500]!r}, last 200 chars: {raw[-200:]!r}"
    )
    raise ValueError(
        f"No valid JSON found in LLM response (length: {len(raw)} chars, "
        f"first 300 chars: {raw[:300]!r})"
    )


# Slide emoji fallbacks — rotated by index so each slide feels distinct.
_SLIDE_EMOJIS = ["📖", "✏️", "💡", "🔤", "🗣️", "📝", "🎯", "🔍", "⭐", "🧩"]


def _build_unit_content(body: LessonContentRequest) -> str:
    """
    Assemble a "virtual unit content" string from the request body.

    Mirrors _assemble_unit_content() in test_generation_flow.py and
    task_generation_flow.py — those functions pull from DB; here we build
    the same shape from the API request, including any RAG context the
    frontend pre-fetched from /rag/retrieve.
    """
    separator = "\n\n" + "─" * 60 + "\n\n"
    parts: list[str] = []

    # ── 1. Unit / lesson metadata ─────────────────────────────────────────────
    meta_lines = [f"UNIT: {body.lesson_title}"]
    if body.lesson_objective:
        meta_lines.append(f"Description: {body.lesson_objective}")
        meta_lines.append(f"Learning Goals: {body.lesson_objective}")
    parts.append("\n".join(meta_lines))

    # ── 2. Course context ─────────────────────────────────────────────────────
    course_lines = [f"COURSE: {body.course_title}"]
    if body.course_description:
        course_lines.append(body.course_description)
    course_lines.append(f"Module: {body.module_title}")
    course_lines.append(
        f"Level: {body.level} | Students' language: {body.native_language}"
    )
    if body.extra_instructions:
        course_lines.append(f"Special focus: {body.extra_instructions}")
    parts.append("\n".join(course_lines))

    # ── 3. RAG context (teacher-uploaded materials) ───────────────────────────
    if body.rag_context.strip():
        parts.append(f"COURSE DOCUMENT CONTENT:\n{body.rag_context.strip()}")

    return separator.join(parts)


# ── Output mappers ─────────────────────────────────────────────────────────────

def _map_slides(deck) -> List[SlideItem]:
    """
    Map SlideDeck → List[SlideItem].

    SlideDeck.slides[i] has: title, bullet_points, examples, exercise, teacher_notes
    SlideItem needs:         id, emoji, title, bullets
    """
    return [
        SlideItem(
            id      = f"s{i + 1}",
            emoji   = _SLIDE_EMOJIS[i % len(_SLIDE_EMOJIS)],
            title   = slide.title,
            bullets = slide.bullet_points[:3],
        )
        for i, slide in enumerate(deck.slides)
    ]


def _map_tasks(tasks_data: list[dict]) -> List[TaskItem]:
    """
    Map ai_task_generator output → List[TaskItem].

    Generator keys: type, title, description, instructions,
                    content, example_answer, grading_hints
    TaskItem needs: id, type, instruction, example
    """
    return [
        TaskItem(
            id          = f"t{i + 1}",
            type        = t.get("type", "practice").capitalize(),
            instruction = t.get("instructions", ""),
            example     = t.get("example_answer") or None,
        )
        for i, t in enumerate(tasks_data)
    ]


def _map_test(questions_data: list[dict]) -> List[MCQQuestion]:
    """
    Map ai_test_generator output → List[MCQQuestion].

    Generator keys: prompt_rich, options, correct_answer (list[str]), explanation_rich
    MCQQuestion needs: id, question, options, correct (0-based index)
    """
    items: List[MCQQuestion] = []
    for i, q in enumerate(questions_data):
        options       = q.get("options", [])
        correct_texts = q.get("correct_answer", [])
        correct_text  = correct_texts[0] if correct_texts else ""

        try:
            correct_idx = options.index(correct_text)
        except ValueError:
            logger.warning(
                "MCQ Q%d: correct_answer %r not found verbatim in options %r "
                "— defaulting index to 0",
                i + 1, correct_text, options,
            )
            correct_idx = 0

        items.append(MCQQuestion(
            id       = f"q{i + 1}",
            question = q.get("prompt_rich", ""),
            options  = options,
            correct  = correct_idx,
        ))
    return items


# ── Endpoint 1: generate-outline ──────────────────────────────────────────────

@router.post(
    "/generate-outline",
    response_model=CourseOutlineResponse,
    summary="Generate a course outline (structure only — no slides/tasks/test)",
)
async def generate_outline(
    body: CourseOutlineRequest,
    ai:   AIProvider = Depends(get_groq_provider),
) -> CourseOutlineResponse:
    """
    Generate title + description + module/lesson stubs for a new course.
    Never generates slides, tasks, or test questions — those are per-lesson.
    """
    extra = (
        f"\n  Special focus: {body.extra_instructions}"
        if body.extra_instructions.strip()
        else ""
    )

    prompt = f"""You are an expert language course designer.
Generate a course OUTLINE ONLY — NO slides, NO tasks, NO tests — for:
  Subject              : {body.subject}
  Student level        : {body.level}
  Students' language   : {body.native_language}
  Number of modules    : {body.unit_count}
  Each module contains : 2–3 lessons{extra}

Return ONLY valid JSON. No markdown fences, no explanation, nothing outside the JSON:
{{
  "title": "Course title",
  "description": "2-sentence course description",
  "modules": [
    {{
      "id": "m1",
      "title": "Module title",
      "lessons": [
        {{ "id": "m1l1", "title": "Lesson title", "objective": "One-sentence learning objective" }}
      ]
    }}
  ]
}}"""

    try:
        logger.info(f"[generate_outline] Request params: subject={body.subject}, level={body.level}, unit_count={body.unit_count}")
        raw = await ai.agenerate(prompt)
        logger.info(f"[generate_outline] AI response received, length: {len(raw)} chars")
        logger.debug(f"[generate_outline] Full AI response: {raw!r}")
    except AIProviderError as exc:
        logger.error("AI provider error during outline generation: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI provider unavailable. Please try again.",
        ) from exc

    try:
        logger.info("[generate_outline] Attempting to extract JSON from response...")
        data = _extract_json(raw)
        logger.info(f"[generate_outline] JSON extracted successfully, keys: {list(data.keys())}")
        validated = CourseOutlineResponse.model_validate(data)
        logger.info(f"[generate_outline] Validation successful: {len(validated.modules)} modules")
        return validated
    except ValueError as exc:
        logger.error(
            "Failed to parse outline response (ValueError): %s\n"
            "Response length: %d chars\n"
            "First 1000 chars: %s\n"
            "Last 500 chars: %s",
            exc, len(raw), raw[:1000], raw[-500:],
            exc_info=True
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI returned an invalid response. Please try again.",
        ) from exc
    except Exception as exc:
        logger.error(
            "Failed to parse outline response (unexpected error): %s\n"
            "Response length: %d chars\n"
            "First 1000 chars: %s\n"
            "Last 500 chars: %s",
            exc, len(raw), raw[:1000], raw[-500:],
            exc_info=True
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI returned an invalid response. Please try again.",
        ) from exc


# ── Endpoint 2: generate-lesson ───────────────────────────────────────────────

@router.post(
    "/generate-lesson",
    response_model=LessonContentResponse,
    summary="Generate slides + tasks + test for ONE lesson (three parallel AI calls)",
)
async def generate_lesson(
    body:    LessonContentRequest,
    service: SlideSvc,                      # SlideGeneratorService with cache injected
) -> LessonContentResponse:
    """
    Generate the full content for exactly one lesson by calling three real
    AI services in parallel:

        asyncio.gather(
            SlideGeneratorService.agenerate_slides(),   → SlideDeck
            generate_tasks_from_unit_content(),          → list[task_dict]
            generate_mcq_from_unit_content(),            → list[mcq_dict]
        )

    All three receive the same "virtual unit content" built from the request
    body (lesson metadata + optional RAG context pre-fetched by the frontend).
    Results are mapped to the response schema expected by TeacherOnboarding.jsx.
    """
    unit_content = _build_unit_content(body)

    slide_request = SlideGenerationRequest(
        topic             = f"{body.lesson_title} — {body.lesson_objective}",
        level             = body.level,
        duration_minutes  = body.slide_duration_minutes,
        target_audience   = (
            f"{body.level} learners of {body.subject}, "
            f"native language: {body.native_language}"
        ),
        learning_goals       = [body.lesson_objective],
        include_exercises    = False,   # tasks handled separately
        include_teacher_notes= False,
        language             = body.native_language,
    )

    logger.info(
        "generate_lesson start — lesson=%r subject=%r level=%r "
        "rag=%s tasks=%d mcqs=%d difficulty=%s",
        body.lesson_title, body.subject, body.level,
        "yes" if body.rag_context.strip() else "no",
        body.task_count, body.mcq_count, body.difficulty,
    )

    # ── Three parallel AI calls ────────────────────────────────────────────────
    try:
        slides_result, tasks_result, test_result = await asyncio.gather(
            # 1. Slides — SlideGeneratorService (cached, provider-agnostic)
            service.agenerate_slides(slide_request),

            # 2. Practice tasks — ai_task_generator
            generate_tasks_from_unit_content(
                unit_content = unit_content,
                task_count   = body.task_count,
                difficulty   = body.difficulty,
                task_language= body.native_language,
            ),

            # 3. MCQ test questions — ai_test_generator
            generate_mcq_from_unit_content(
                unit_content         = unit_content,
                mcq_count            = body.mcq_count,
                answers_per_question = 4,
                difficulty           = body.difficulty,
                question_language    = body.native_language,
            ),
        )
    except AIProviderError as exc:
        logger.error("AI provider unavailable during lesson generation: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI provider unavailable. Please try again.",
        ) from exc
    except SlideGenerationError as exc:
        logger.error("Slide generation failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Slide generation failed: {exc}",
        ) from exc
    except ValueError as exc:
        # Raised by task or MCQ generator after all retries are exhausted
        logger.error("AI output validation failed during lesson generation: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"AI returned invalid content: {exc}",
        ) from exc
    except Exception as exc:
        logger.error(
            "Unexpected error during lesson generation: %s", exc, exc_info=True
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unexpected error during lesson generation.",
        ) from exc

    # tasks_result and test_result are (list[dict], metadata) tuples
    tasks_data, _tasks_meta = tasks_result
    test_data,  _test_meta  = test_result

    logger.info(
        "generate_lesson complete — slides=%d tasks=%d test_questions=%d",
        len(slides_result.slides), len(tasks_data), len(test_data),
    )

    return LessonContentResponse(
        slides = _map_slides(slides_result),
        tasks  = _map_tasks(tasks_data),
        test   = _map_test(test_data),
    )


# ── Publish Course Endpoint ─────────────────────────────────────────────────────

class PublishCourseRequest(BaseModel):
    """Request to publish a course from onboarding"""
    outline: CourseOutlineResponse
    generated_lessons: dict[str, LessonContentResponse]  # lesson_id -> content
    course_data: dict[str, Any]  # subject, level, etc.


class PublishCourseResponse(BaseModel):
    """Response after publishing course"""
    course_id: int
    message: str


def _generate_slug(text: str) -> str:
    """Generate URL-friendly slug from text"""
    slug = re.sub(r'[^\w\s-]', '', text.lower())
    slug = re.sub(r'[-\s]+', '-', slug)
    return slug.strip('-')


@router.post("/publish", response_model=PublishCourseResponse, status_code=status.HTTP_201_CREATED)
async def publish_course(
    body: PublishCourseRequest,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db),
):
    """
    Publish a course created during teacher onboarding.
    Creates Course, Units (modules), Presentations (lessons with slides), Tasks, and Tests.
    """
    try:
        # 1. Create Course
        course_level = CourseLevel[body.course_data.get("level", "A1").upper()] if body.course_data.get("level", "A1").upper() in [e.name for e in CourseLevel] else CourseLevel.A1
        
        slug = _generate_slug(body.outline.title)
        # Ensure slug uniqueness
        existing = db.query(Course).filter(Course.slug == slug).first()
        if existing:
            slug = f"{slug}-{int(datetime.utcnow().timestamp())}"
        
        course = Course(
            title=body.outline.title,
            description=body.outline.description or "",
            level=course_level,
            status=CourseStatus.PUBLISHED,
            publish_at=datetime.utcnow(),
            order_index=0,
            slug=slug,
            created_by=current_user.id,
        )
        db.add(course)
        db.flush()  # Get course.id without committing
        
        # 2. Create Units (modules) and their content
        unit_order = 0
        for module_idx, module in enumerate(body.outline.modules):
            # Create Unit for this module
            level_str = body.course_data.get("level", "A1").upper()
            try:
                unit_level = UnitLevel[level_str] if level_str in [e.name for e in UnitLevel] else UnitLevel.A1
            except (KeyError, AttributeError):
                unit_level = UnitLevel.A1
            
            unit_slug = _generate_slug(module.title)
            existing_unit = db.query(Unit).filter(Unit.slug == unit_slug).first()
            if existing_unit:
                unit_slug = f"{unit_slug}-{int(datetime.utcnow().timestamp())}"
            
            unit = Unit(
                course_id=course.id,
                title=module.title,
                level=unit_level,
                status=UnitStatus.PUBLISHED,
                order_index=unit_order,
                slug=unit_slug,
                created_by=current_user.id,
            )
            db.add(unit)
            db.flush()
            unit_order += 1
            
            # 3. Create Presentations (lessons) with slides, tasks, and tests
            for lesson_idx, lesson in enumerate(module.lessons):
                lesson_content = body.generated_lessons.get(lesson.id)
                if not lesson_content:
                    logger.warning(f"No content found for lesson {lesson.id}, skipping")
                    continue
                
                # Create Presentation for this lesson
                pres_slug = _generate_slug(lesson.title)
                existing_pres = db.query(Presentation).filter(Presentation.slug == pres_slug).first()
                if existing_pres:
                    pres_slug = f"{pres_slug}-{int(datetime.utcnow().timestamp())}"
                
                presentation = Presentation(
                    unit_id=unit.id,
                    title=lesson.title,
                    description=lesson.objective or "",
                    topic=lesson.title,
                    level=unit_level,
                    duration_minutes=20,  # Default, can be calculated from slides
                    language=body.course_data.get("native_language", "English"),
                    status=PresentationStatus.PUBLISHED,
                    order_index=lesson_idx,
                    slug=pres_slug,
                    created_by=current_user.id,
                )
                db.add(presentation)
                db.flush()
                
                # 4. Create Slides
                for slide_idx, slide in enumerate(lesson_content.slides):
                    db_slide = PresentationSlide(
                        presentation_id=presentation.id,
                        title=slide.title,
                        bullet_points=slide.bullets,
                        order_index=slide_idx,
                    )
                    db.add(db_slide)
                
                # 5. Create Tasks
                for task_idx, task in enumerate(lesson_content.tasks):
                    task_type = TaskType[task.type.upper()] if task.type.upper() in [e.name for e in TaskType] else TaskType.WRITING
                    db_task = Task(
                        unit_id=unit.id,
                        title=f"{lesson.title} - Task {task_idx + 1}",
                        description=task.instruction,
                        instructions=task.instruction,
                        type=task_type,
                        status=TaskStatus.PUBLISHED,
                        order_index=task_idx,
                        max_score=10,
                        created_by=current_user.id,
                    )
                    db.add(db_task)
                
                # 6. Create Test with Questions
                if lesson_content.test:
                    db_test = Test(
                        unit_id=unit.id,
                        title=f"{lesson.title} - Quiz",
                        description=f"Quiz for {lesson.title}",
                        status=TestStatus.PUBLISHED,
                        order_index=0,
                        time_limit_minutes=15,
                        created_by=current_user.id,
                    )
                    db.add(db_test)
                    db.flush()
                    
                    # Create MCQ questions
                    for q_idx, question in enumerate(lesson_content.test):
                        # Convert options to format expected by Question model
                        # Options can be list of strings or list of dicts with id/text
                        options_list = question.options
                        if options_list and isinstance(options_list[0], str):
                            # Convert string options to dict format with IDs
                            options_formatted = [
                                {"id": str(i), "text": opt} 
                                for i, opt in enumerate(options_list)
                            ]
                            # Use the option ID (as string) for correct_answer
                            correct_option_id = str(question.correct)
                        else:
                            # Already in dict format
                            options_formatted = options_list
                            # Find the correct option ID
                            if question.correct < len(options_list):
                                correct_option_id = options_list[question.correct].get("id", str(question.correct))
                            else:
                                correct_option_id = str(question.correct)
                        
                        # Create Question
                        db_question = Question(
                            type=QuestionType.MULTIPLE_CHOICE,
                            prompt_rich=question.question,
                            options=options_formatted,
                            correct_answer={"correct_option_ids": [correct_option_id]},
                            points=1.0,
                            autograde=True,
                            shuffle_options=True,
                            created_by=current_user.id,
                        )
                        db.add(db_question)
                        db.flush()
                        
                        # Link question to test via TestQuestion
                        test_question = TestQuestion(
                            test_id=db_test.id,
                            question_id=db_question.id,
                            order_index=q_idx,
                            points=1.0,
                        )
                        db.add(test_question)
        
        db.commit()
        db.refresh(course)
        
        logger.info(f"Published course id={course.id} with {len(body.outline.modules)} modules by user={current_user.id}")
        
        return PublishCourseResponse(
            course_id=course.id,
            message=f"Course '{course.title}' published successfully"
        )
        
    except Exception as exc:
        db.rollback()
        logger.error(f"Error publishing course: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to publish course: {str(exc)}"
        )


# ── Stub classes for course_generation.py endpoint compatibility ────────────────
# These are minimal stubs to prevent import errors. The course_generation.py
# endpoint expects these classes but they may need full implementation later.

class CourseGenerateRequest(BaseModel):
    """Stub request model for admin course generation endpoint."""
    subject: str
    level: str
    native_language: str = "English"
    unit_count: int = 4
    extra_instructions: str = ""


class CourseGeneratorService:
    """Stub service class for admin course generation endpoint."""
    
    def __init__(self, ai_provider: AIProvider):
        self.ai_provider = ai_provider
    
    async def generate_preview(self, request: CourseGenerateRequest) -> dict[str, Any]:
        """Stub method - needs implementation."""
        raise NotImplementedError(
            "CourseGeneratorService.generate_preview() is not yet implemented. "
            "This is a stub to prevent import errors."
        )
    
    async def generate_and_save(
        self,
        request: CourseGenerateRequest,
        db: Any,
        teacher_id: int,
    ) -> Any:
        """Stub method - needs implementation."""
        raise NotImplementedError(
            "CourseGeneratorService.generate_and_save() is not yet implemented. "
            "This is a stub to prevent import errors."
        )