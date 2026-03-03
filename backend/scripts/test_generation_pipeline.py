#!/usr/bin/env python3
"""
test_generation_pipeline.py

Comprehensive test script for the AI test generation pipeline.

Coverage
--------
UNIT tests (no HTTP, no DB, no LLM):
  1.  _build_prompt         — prompt contains all required fields
  2.  _extract_json_array   — handles clean JSON, markdown fences,
                              leading prose, trailing commas
  3.  _validate             — passes valid data, rejects every bad shape
  4.  generate_mcq_from_unit_content
                            — happy path (mock provider)
                            — retries on first bad output, succeeds second
                            — raises ValueError after all retries exhausted

INTEGRATION tests (live FastAPI at BASE_URL):
  5.  POST /auth/login      — obtain JWT for a teacher account
  6.  POST /units/{id}/generate-test
                            — 202 Accepted, returns test_id + poll_url
  7.  GET  poll_url         — returns generation_status ∈ {pending, running, done, failed}
  8.  Full polling loop     — waits up to MAX_POLL_WAIT seconds for "done"
  9.  Verify questions      — GET /tests/{id}/questions shows expected count

Usage
-----
# Unit tests only (no server needed):
python test_generation_pipeline.py --unit

# Integration tests (server must be running):
python test_generation_pipeline.py --integration \
    --base-url http://localhost:8000 \
    --email teacher@example.com \
    --password secret \
    --unit-id 1

# All tests:
python test_generation_pipeline.py --all \
    --base-url http://localhost:8000 \
    --email teacher@example.com \
    --password secret \
    --unit-id 1

Requirements: pip install requests (stdlib only otherwise)
"""

from __future__ import annotations

import argparse
import asyncio
import json
import re
import sys
import time
import traceback
import unittest
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import requests

# ── Colour helpers ─────────────────────────────────────────────────────────────

RESET  = "\033[0m"
GREEN  = "\033[32m"
RED    = "\033[31m"
YELLOW = "\033[33m"
CYAN   = "\033[36m"
BOLD   = "\033[1m"
DIM    = "\033[2m"

def ok(msg: str)   -> str: return f"{GREEN}✓{RESET}  {msg}"
def fail(msg: str) -> str: return f"{RED}✗{RESET}  {msg}"
def info(msg: str) -> str: return f"{CYAN}→{RESET}  {msg}"
def warn(msg: str) -> str: return f"{YELLOW}⚠{RESET}  {msg}"
def head(msg: str) -> str: return f"\n{BOLD}{CYAN}{msg}{RESET}"


# ─────────────────────────────────────────────────────────────────────────────
#  SECTION 1 — UNIT TESTS (pure Python, no network)
# ─────────────────────────────────────────────────────────────────────────────

class TestBuildPrompt(unittest.TestCase):
    """_build_prompt should produce a string that constrains the model."""

    def setUp(self):
        # Inline the function so tests run without the full app installed
        from app.services.ai_test_generator import _build_prompt
        self.build = _build_prompt

    def test_contains_mcq_count(self):
        prompt = self.build("Some content", mcq_count=7, answers_per_question=4, difficulty="B1")
        self.assertIn("7", prompt, "mcq_count must appear in prompt")

    def test_contains_answers_per_question(self):
        prompt = self.build("content", mcq_count=5, answers_per_question=3, difficulty="A2")
        self.assertIn("3", prompt)

    def test_contains_difficulty(self):
        prompt = self.build("content", mcq_count=5, answers_per_question=4, difficulty="C1")
        self.assertIn("C1", prompt)

    def test_contains_unit_content(self):
        content = "Italian verbs essere and avere"
        prompt = self.build(content, mcq_count=3, answers_per_question=4, difficulty="A1")
        self.assertIn(content, prompt)

    def test_contains_required_keys(self):
        prompt = self.build("content", 5, 4, "A1")
        for key in ("prompt_rich", "options", "correct_answer", "explanation_rich"):
            self.assertIn(key, prompt, f"Key '{key}' missing from prompt")

    def test_returns_string(self):
        result = self.build("text", 3, 4, "medium")
        self.assertIsInstance(result, str)
        self.assertGreater(len(result), 100)


class TestExtractJsonArray(unittest.TestCase):
    """_extract_json_array must handle all LLaMA output quirks."""

    def setUp(self):
        from app.services.ai_test_generator import _extract_json_array
        self.extract = _extract_json_array

    def _make_valid_json(self) -> str:
        return json.dumps([
            {
                "prompt_rich": "What is 'ciao'?",
                "options": ["Hello", "Goodbye", "Thank you", "Please"],
                "correct_answer": ["Hello"],
                "explanation_rich": "Ciao means hello in Italian.",
            }
        ])

    def test_clean_json(self):
        raw = self._make_valid_json()
        result = self.extract(raw)
        parsed = json.loads(result)
        self.assertIsInstance(parsed, list)
        self.assertEqual(len(parsed), 1)

    def test_strips_markdown_json_fence(self):
        raw = "```json\n" + self._make_valid_json() + "\n```"
        result = self.extract(raw)
        parsed = json.loads(result)
        self.assertIsInstance(parsed, list)

    def test_strips_plain_fence(self):
        raw = "```\n" + self._make_valid_json() + "\n```"
        result = self.extract(raw)
        json.loads(result)  # must not raise

    def test_strips_leading_prose(self):
        raw = "Sure! Here are your questions:\n\n" + self._make_valid_json()
        result = self.extract(raw)
        json.loads(result)

    def test_strips_trailing_prose(self):
        raw = self._make_valid_json() + "\n\nHope this helps! Let me know if you need more."
        result = self.extract(raw)
        json.loads(result)

    def test_fixes_trailing_comma_before_bracket(self):
        raw = '[{"a": 1,}]'
        result = self.extract(raw)
        parsed = json.loads(result)
        self.assertEqual(parsed[0]["a"], 1)

    def test_fixes_trailing_comma_in_array(self):
        raw = '[{"a": 1}, {"b": 2},]'
        result = self.extract(raw)
        json.loads(result)

    def test_raises_when_no_array(self):
        from app.services.ai_test_generator import _extract_json_array
        with self.assertRaises(ValueError):
            self.extract("This is just plain text with no JSON.")

    def test_combined_quirks(self):
        """Fence + prose + trailing comma — the worst realistic case."""
        payload = '[{"x": 1,}]'
        raw = f"Here you go!\n```json\n{payload}\n```\nAll done."
        result = self.extract(raw)
        json.loads(result)


class TestValidate(unittest.TestCase):
    """_validate must accept good data and reject every malformed shape."""

    def setUp(self):
        from app.services.ai_test_generator import _validate
        self.validate = _validate

    def _good_question(self, options=None, correct=None):
        opts = options or ["A", "B", "C", "D"]
        return {
            "prompt_rich": "What is Italian for dog?",
            "options": opts,
            "correct_answer": correct or [opts[0]],
            "explanation_rich": "Cane means dog.",
        }

    def test_valid_single_question(self):
        self.validate([self._good_question()], mcq_count=1, answers_per_question=4)

    def test_valid_multiple_questions(self):
        questions = [self._good_question() for _ in range(5)]
        self.validate(questions, mcq_count=5, answers_per_question=4)

    def test_wrong_count_raises(self):
        with self.assertRaises(ValueError) as ctx:
            self.validate([self._good_question()], mcq_count=3, answers_per_question=4)
        self.assertIn("Expected 3 questions", str(ctx.exception))

    def test_not_a_list_raises(self):
        with self.assertRaises(ValueError):
            self.validate({"key": "value"}, mcq_count=1, answers_per_question=4)

    def test_missing_prompt_rich_raises(self):
        q = self._good_question()
        del q["prompt_rich"]
        with self.assertRaises(ValueError) as ctx:
            self.validate([q], mcq_count=1, answers_per_question=4)
        self.assertIn("prompt_rich", str(ctx.exception))

    def test_missing_options_raises(self):
        q = self._good_question()
        del q["options"]
        with self.assertRaises(ValueError):
            self.validate([q], mcq_count=1, answers_per_question=4)

    def test_missing_correct_answer_raises(self):
        q = self._good_question()
        del q["correct_answer"]
        with self.assertRaises(ValueError):
            self.validate([q], mcq_count=1, answers_per_question=4)

    def test_missing_explanation_raises(self):
        q = self._good_question()
        del q["explanation_rich"]
        with self.assertRaises(ValueError):
            self.validate([q], mcq_count=1, answers_per_question=4)

    def test_wrong_option_count_raises(self):
        q = self._good_question(options=["A", "B"])  # only 2 options
        with self.assertRaises(ValueError) as ctx:
            self.validate([q], mcq_count=1, answers_per_question=4)  # expects 4
        self.assertIn("options", str(ctx.exception))

    def test_multiple_correct_answers_raises(self):
        q = self._good_question(correct=["A", "B"])
        with self.assertRaises(ValueError) as ctx:
            self.validate([q], mcq_count=1, answers_per_question=4)
        self.assertIn("correct_answer", str(ctx.exception))

    def test_correct_answer_not_in_options_raises(self):
        q = self._good_question(options=["A", "B", "C", "D"], correct=["Z"])
        with self.assertRaises(ValueError) as ctx:
            self.validate([q], mcq_count=1, answers_per_question=4)
        self.assertIn("not among options", str(ctx.exception))

    def test_empty_prompt_raises(self):
        q = self._good_question()
        q["prompt_rich"] = "   "
        with self.assertRaises(ValueError):
            self.validate([q], mcq_count=1, answers_per_question=4)

    def test_item_not_dict_raises(self):
        with self.assertRaises(ValueError):
            self.validate(["not a dict"], mcq_count=1, answers_per_question=4)


class TestGenerateMcq(unittest.IsolatedAsyncioTestCase):
    """generate_mcq_from_unit_content with mocked AI provider."""

    def _make_questions(self, count: int = 3, opts: int = 4) -> list[dict]:
        return [
            {
                "prompt_rich": f"Question {i + 1}?",
                "options": [chr(65 + j) for j in range(opts)],
                "correct_answer": [chr(65)],
                "explanation_rich": f"Explanation {i + 1}.",
            }
            for i in range(count)
        ]

    async def test_happy_path(self):
        from app.services.ai_test_generator import generate_mcq_from_unit_content

        questions = self._make_questions(3, 4)
        mock_provider = MagicMock()
        mock_provider.agenerate = AsyncMock(return_value=json.dumps(questions))

        result = await generate_mcq_from_unit_content(
            unit_content="Italian language content",
            mcq_count=3,
            answers_per_question=4,
            difficulty="A1",
            provider=mock_provider,
        )
        self.assertEqual(len(result), 3)
        self.assertEqual(result[0]["prompt_rich"], "Question 1?")
        mock_provider.agenerate.assert_called_once()

    async def test_retries_on_bad_first_output(self):
        """First call returns garbage; second call returns valid JSON."""
        from app.services.ai_test_generator import generate_mcq_from_unit_content

        questions = self._make_questions(2, 4)
        mock_provider = MagicMock()
        mock_provider.agenerate = AsyncMock(side_effect=[
            "Sorry, I cannot help with that.",   # bad — no JSON array
            json.dumps(questions),                # good
        ])

        result = await generate_mcq_from_unit_content(
            unit_content="Some content",
            mcq_count=2,
            answers_per_question=4,
            difficulty="B1",
            provider=mock_provider,
            max_retries=1,
        )
        self.assertEqual(len(result), 2)
        self.assertEqual(mock_provider.agenerate.call_count, 2)

    async def test_raises_after_all_retries(self):
        from app.services.ai_test_generator import generate_mcq_from_unit_content

        mock_provider = MagicMock()
        mock_provider.agenerate = AsyncMock(return_value="no json here")

        with self.assertRaises(ValueError) as ctx:
            await generate_mcq_from_unit_content(
                unit_content="content",
                mcq_count=3,
                answers_per_question=4,
                difficulty="A1",
                provider=mock_provider,
                max_retries=1,
            )
        self.assertIn("failed after", str(ctx.exception))

    async def test_raises_on_empty_content(self):
        from app.services.ai_test_generator import generate_mcq_from_unit_content

        mock_provider = MagicMock()
        with self.assertRaises(ValueError):
            await generate_mcq_from_unit_content(
                unit_content="   ",
                mcq_count=3,
                answers_per_question=4,
                difficulty="A1",
                provider=mock_provider,
            )

    async def test_raises_on_invalid_mcq_count(self):
        from app.services.ai_test_generator import generate_mcq_from_unit_content

        mock_provider = MagicMock()
        with self.assertRaises(ValueError):
            await generate_mcq_from_unit_content(
                unit_content="content",
                mcq_count=0,
                answers_per_question=4,
                difficulty="A1",
                provider=mock_provider,
            )

    async def test_provider_called_with_prompt_containing_content(self):
        from app.services.ai_test_generator import generate_mcq_from_unit_content

        content = "Essere means to be in Italian."
        questions = self._make_questions(1, 2)
        mock_provider = MagicMock()
        mock_provider.agenerate = AsyncMock(return_value=json.dumps(questions))

        await generate_mcq_from_unit_content(
            unit_content=content,
            mcq_count=1,
            answers_per_question=2,
            difficulty="A1",
            provider=mock_provider,
        )
        call_args = mock_provider.agenerate.call_args[0][0]
        self.assertIn(content, call_args)


# ─────────────────────────────────────────────────────────────────────────────
#  SECTION 2 — INTEGRATION TESTS (live HTTP)
# ─────────────────────────────────────────────────────────────────────────────

class IntegrationTestRunner:
    """
    HTTP-level integration tests against a running FastAPI server.
    Not using unittest so we get live progress output and clean error messages.
    """

    def __init__(
        self,
        base_url: str,
        email: str,
        password: str,
        unit_id: int,
        mcq_count: int = 3,
        answers_per_question: int = 4,
        difficulty: str = "A1",
        max_poll_wait: int = 120,
        poll_interval: int = 3,
    ):
        self.base = base_url.rstrip("/")
        self.email = email
        self.password = password
        self.unit_id = unit_id
        self.mcq_count = mcq_count
        self.answers_per_question = answers_per_question
        self.difficulty = difficulty
        self.max_poll_wait = max_poll_wait
        self.poll_interval = poll_interval

        self.session = requests.Session()
        self.token: str | None = None
        self.test_id: int | None = None
        self.poll_url: str | None = None

        self.passed = 0
        self.failed = 0
        self.errors: list[str] = []

    # ── helpers ───────────────────────────────────────────────────────────────

    def _url(self, path: str) -> str:
        return f"{self.base}/api/v1{path}"

    def _auth(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.token}"}

    def _assert(self, condition: bool, name: str, detail: str = "") -> bool:
        if condition:
            print(ok(name))
            self.passed += 1
            return True
        else:
            msg = f"{name}" + (f"\n     {DIM}{detail}{RESET}" if detail else "")
            print(fail(msg))
            self.failed += 1
            self.errors.append(name)
            return False

    def _step(self, name: str) -> None:
        print(f"\n  {BOLD}{name}{RESET}")

    # ── individual tests ──────────────────────────────────────────────────────

    def test_health(self) -> bool:
        self._step("01 — API health check")
        try:
            res = self.session.get(f"{self.base}/docs", timeout=5)
            return self._assert(
                res.status_code == 200,
                "Server is reachable",
                f"GET /docs → {res.status_code}",
            )
        except requests.ConnectionError as e:
            return self._assert(False, "Server is reachable", str(e))

    def test_login(self) -> bool:
        self._step("02 — Teacher authentication")
        res = self.session.post(
            self._url("/auth/login"),
            json={"email": self.email, "password": self.password},
            timeout=10,
        )
        ok_status = self._assert(
            res.status_code == 200,
            f"POST /auth/login → 200",
            f"Got {res.status_code}: {res.text[:200]}",
        )
        if not ok_status:
            return False

        data = res.json()
        token_ok = self._assert(
            "access_token" in data,
            "Response contains access_token",
            str(data),
        )
        if token_ok:
            self.token = data["access_token"]
            print(info(f"Token obtained: {self.token[:20]}..."))
        return token_ok

    def test_unit_exists(self) -> bool:
        self._step(f"03 — Unit {self.unit_id} exists and is accessible")
        res = self.session.get(
            self._url(f"/admin/units/{self.unit_id}"),
            headers=self._auth(),
            timeout=10,
        )
        exists = self._assert(
            res.status_code == 200,
            f"GET /admin/units/{self.unit_id} → 200",
            f"Got {res.status_code}: {res.text[:200]}",
        )
        if exists:
            data = res.json()
            print(info(f"Unit: '{data.get('title', '?')}' | level={data.get('level', '?')}"))
        return exists

    def test_trigger_generation(self) -> bool:
        self._step("04 — Trigger test generation (POST /units/{id}/generate-test)")
        payload = {
            "mcq_count": self.mcq_count,
            "answers_per_question": self.answers_per_question,
            "difficulty": self.difficulty,
            "title": f"[SCRIPT] {self.difficulty} Test — unit {self.unit_id}",
            "time_limit_minutes": 15,
            "passing_score": 60.0,
        }
        print(info(f"Payload: {json.dumps(payload, ensure_ascii=False)}"))

        res = self.session.post(
            self._url(f"/units/{self.unit_id}/generate-test"),
            json=payload,
            headers=self._auth(),
            timeout=15,
        )

        status_ok = self._assert(
            res.status_code == 202,
            "POST → 202 Accepted",
            f"Got {res.status_code}: {res.text[:400]}",
        )
        if not status_ok:
            return False

        data = res.json()
        has_id = self._assert(
            "test_id" in data and isinstance(data["test_id"], int),
            "Response has test_id (int)",
            str(data),
        )
        has_url = self._assert(
            "poll_url" in data and data["poll_url"],
            "Response has poll_url",
            str(data),
        )
        has_status = self._assert(
            data.get("status") == "pending",
            "Initial status is 'pending'",
            str(data),
        )

        if has_id:
            self.test_id = data["test_id"]
            print(info(f"Test ID: {self.test_id}"))
        if has_url:
            self.poll_url = data["poll_url"]
            print(info(f"Poll URL: {self.poll_url}"))

        return has_id and has_url

    def test_poll_initial(self) -> bool:
        self._step("05 — Immediate poll returns valid status")
        if not self.poll_url:
            print(warn("Skipping — no poll_url available"))
            return False

        res = self.session.get(
            f"{self.base}{self.poll_url}",
            headers=self._auth(),
            timeout=10,
        )
        status_ok = self._assert(
            res.status_code == 200,
            f"GET {self.poll_url} → 200",
            f"Got {res.status_code}: {res.text[:200]}",
        )
        if not status_ok:
            return False

        data = res.json()
        valid_statuses = {"pending", "running", "done", "failed"}
        gen_status = data.get("generation_status", "")
        self._assert(
            gen_status in valid_statuses,
            f"generation_status is valid ('{gen_status}')",
            f"Valid values: {valid_statuses}",
        )
        self._assert(
            "test_id" in data,
            "Poll response contains test_id",
        )
        self._assert(
            "question_count" in data,
            "Poll response contains question_count",
        )
        print(info(f"Status: {gen_status} | Questions so far: {data.get('question_count', 0)}"))
        return True

    def test_poll_until_done(self) -> bool:
        self._step(f"06 — Poll until done (max {self.max_poll_wait}s, every {self.poll_interval}s)")
        if not self.poll_url:
            print(warn("Skipping — no poll_url"))
            return False

        elapsed = 0
        final_status = ""
        question_count = 0

        print(info("Polling..."), end="", flush=True)
        while elapsed < self.max_poll_wait:
            time.sleep(self.poll_interval)
            elapsed += self.poll_interval

            try:
                res = self.session.get(
                    f"{self.base}{self.poll_url}",
                    headers=self._auth(),
                    timeout=10,
                )
                if res.status_code != 200:
                    print(f"\n{warn(f'Poll returned {res.status_code}')}")
                    break

                data = res.json()
                final_status = data.get("generation_status", "unknown")
                question_count = data.get("question_count", 0)
                error_msg = data.get("generation_error")

                print(f" [{elapsed}s:{final_status}]", end="", flush=True)

                if final_status == "done":
                    print()  # newline
                    break
                elif final_status == "failed":
                    print()
                    print(fail(f"Generation failed: {error_msg}"))
                    break

            except Exception as e:
                print(f"\n{warn(f'Poll error: {e}')}")
                break

        print()
        timed_out = elapsed >= self.max_poll_wait and final_status not in ("done", "failed")
        if timed_out:
            print(warn(f"Timed out after {self.max_poll_wait}s (last status: {final_status})"))

        done_ok = self._assert(
            final_status == "done",
            f"Generation completed with status 'done' (took ~{elapsed}s)",
            f"Final status: {final_status}",
        )
        if done_ok:
            count_ok = self._assert(
                question_count == self.mcq_count,
                f"Question count matches requested ({question_count}/{self.mcq_count})",
                f"Expected {self.mcq_count}, got {question_count}",
            )
            print(info(f"Generated {question_count} questions in ~{elapsed}s"))
            return count_ok
        return False

    def test_questions_in_db(self) -> bool:
        self._step("07 — Verify questions stored in DB")
        if not self.test_id:
            print(warn("Skipping — no test_id"))
            return False

        res = self.session.get(
            self._url(f"/tests/{self.test_id}/questions"),
            headers=self._auth(),
            timeout=10,
        )
        status_ok = self._assert(
            res.status_code == 200,
            f"GET /tests/{self.test_id}/questions → 200",
            f"Got {res.status_code}: {res.text[:200]}",
        )
        if not status_ok:
            return False

        data = res.json()
        count = data.get("total_questions", 0)
        questions = data.get("questions", [])

        self._assert(
            count == self.mcq_count,
            f"total_questions == {self.mcq_count} (got {count})",
        )

        if questions:
            q = questions[0]["question"]
            self._assert(q.get("type") == "multiple_choice", "Question type is 'multiple_choice'")
            self._assert(bool(q.get("prompt_rich")), "prompt_rich is non-empty")
            self._assert(
                isinstance(q.get("options"), list) and len(q["options"]) == self.answers_per_question,
                f"options has {self.answers_per_question} items (got {len(q.get('options', []))})",
            )
            self._assert(
                isinstance(q.get("correct_answer"), dict)
                and "correct_option_ids" in q["correct_answer"],
                "correct_answer is {correct_option_ids: [...]}",
                str(q.get("correct_answer")),
            )
            self._assert(bool(q.get("explanation_rich")), "explanation_rich is non-empty")
            print(info(f"Sample question: {q['prompt_rich'][:80]}..."))
            print(info(f"Options: {q['options']}"))
            print(info(f"Correct: {q['correct_answer']['correct_option_ids']}"))
        return True

    def test_test_is_draft(self) -> bool:
        self._step("08 — Verify test is in DRAFT status")
        if not self.test_id:
            print(warn("Skipping — no test_id"))
            return False

        res = self.session.get(
            self._url(f"/admin/tests/{self.test_id}"),
            headers=self._auth(),
            timeout=10,
        )
        if res.status_code == 404:
            print(warn("GET /admin/tests/{id} not implemented — skipping status check"))
            return True  # soft pass

        status_ok = self._assert(res.status_code == 200, f"GET /admin/tests/{self.test_id} → 200")
        if status_ok:
            data = res.json()
            self._assert(
                data.get("status") == "draft",
                "Test status is 'draft'",
                str(data.get("status")),
            )
        return status_ok

    def test_unauthorized_rejected(self) -> bool:
        self._step("09 — Unauthenticated request is rejected")
        res = self.session.post(
            self._url(f"/units/{self.unit_id}/generate-test"),
            json={"mcq_count": 3, "answers_per_question": 4, "difficulty": "A1"},
            timeout=10,
            # No Authorization header
        )
        return self._assert(
            res.status_code in (401, 403),
            f"POST without auth → 401/403 (got {res.status_code})",
        )

    def test_invalid_unit_404(self) -> bool:
        self._step("10 — Non-existent unit_id returns 404")
        res = self.session.post(
            self._url("/units/999999/generate-test"),
            json={"mcq_count": 3, "answers_per_question": 4, "difficulty": "A1"},
            headers=self._auth(),
            timeout=10,
        )
        return self._assert(
            res.status_code == 404,
            f"POST /units/999999/generate-test → 404 (got {res.status_code})",
        )

    # ── orchestrator ──────────────────────────────────────────────────────────

    def run(self) -> bool:
        print(head("═" * 60))
        print(head("  INTEGRATION TESTS"))
        print(head(f"  Server : {self.base}"))
        print(head(f"  Unit   : {self.unit_id}  |  MCQs: {self.mcq_count}  |  Difficulty: {self.difficulty}"))
        print(head("═" * 60))

        # Steps that must pass before proceeding
        if not self.test_health():
            print(fail("Server unreachable — aborting integration tests"))
            return False

        if not self.test_login():
            print(fail("Login failed — aborting integration tests"))
            return False

        self.test_unit_exists()
        self.test_unauthorized_rejected()
        self.test_invalid_unit_404()

        if not self.test_trigger_generation():
            print(fail("Failed to trigger generation — skipping poll tests"))
        else:
            self.test_poll_initial()
            self.test_poll_until_done()
            self.test_questions_in_db()
            self.test_test_is_draft()

        return self.failed == 0


# ─────────────────────────────────────────────────────────────────────────────
#  SECTION 3 — RUNNER
# ─────────────────────────────────────────────────────────────────────────────

def run_unit_tests() -> bool:
    print(head("═" * 60))
    print(head("  UNIT TESTS (no server required)"))
    print(head("═" * 60))

    loader = unittest.TestLoader()
    suite = unittest.TestSuite()
    for cls in (
        TestBuildPrompt,
        TestExtractJsonArray,
        TestValidate,
        TestGenerateMcq,
    ):
        suite.addTests(loader.loadTestsFromTestCase(cls))

    runner = unittest.TextTestRunner(verbosity=2, stream=sys.stdout)
    result = runner.run(suite)
    return result.wasSuccessful()


def print_summary(unit_ok: bool | None, integration_ok: bool | None) -> None:
    print(head("═" * 60))
    print(head("  SUMMARY"))
    print(head("═" * 60))
    if unit_ok is not None:
        status = f"{GREEN}PASSED{RESET}" if unit_ok else f"{RED}FAILED{RESET}"
        print(f"  Unit tests        : {status}")
    if integration_ok is not None:
        status = f"{GREEN}PASSED{RESET}" if integration_ok else f"{RED}FAILED{RESET}"
        print(f"  Integration tests : {status}")
    print()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Test the AI test generation pipeline",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("--unit", action="store_true", help="Run unit tests only")
    parser.add_argument("--integration", action="store_true", help="Run integration tests only")
    parser.add_argument("--all", action="store_true", help="Run all tests (default)")
    parser.add_argument("--base-url", default="http://localhost:8000", help="API base URL")
    parser.add_argument("--email", default="teacher@example.com", help="Teacher email")
    parser.add_argument("--password", default="password", help="Teacher password")
    parser.add_argument("--unit-id", type=int, default=1, help="Unit ID to generate test for")
    parser.add_argument("--mcq-count", type=int, default=3, help="Number of questions (keep low for fast tests)")
    parser.add_argument("--answers", type=int, default=4, help="Answer options per question")
    parser.add_argument("--difficulty", default="A1", help="Difficulty / CEFR level")
    parser.add_argument("--max-wait", type=int, default=120, help="Max seconds to wait for generation")
    parser.add_argument("--poll-interval", type=int, default=3, help="Seconds between status polls")

    args = parser.parse_args()

    run_all = args.all or (not args.unit and not args.integration)
    run_unit = args.unit or run_all
    run_integration = args.integration or run_all

    unit_ok: bool | None = None
    integration_ok: bool | None = None

    if run_unit:
        try:
            unit_ok = run_unit_tests()
        except Exception as e:
            print(f"\n{RED}Unit test runner error:{RESET} {e}")
            traceback.print_exc()
            unit_ok = False

    if run_integration:
        runner = IntegrationTestRunner(
            base_url=args.base_url,
            email=args.email,
            password=args.password,
            unit_id=args.unit_id,
            mcq_count=args.mcq_count,
            answers_per_question=args.answers,
            difficulty=args.difficulty,
            max_poll_wait=args.max_wait,
            poll_interval=args.poll_interval,
        )
        try:
            integration_ok = runner.run()
            print_summary(unit_ok, integration_ok)
            if runner.errors:
                print(f"  {RED}Failed checks:{RESET}")
                for e in runner.errors:
                    print(f"    • {e}")
        except Exception as e:
            print(f"\n{RED}Integration runner error:{RESET} {e}")
            traceback.print_exc()
            integration_ok = False

    if run_unit and not run_integration:
        print_summary(unit_ok, None)

    # Exit code
    all_ok = all(v for v in (unit_ok, integration_ok) if v is not None)
    sys.exit(0 if all_ok else 1)


if __name__ == "__main__":
    main()