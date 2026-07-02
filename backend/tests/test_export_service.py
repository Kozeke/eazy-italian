"""
Unit tests for app/services/export_service.py

Covers, per the REFACTOR brief's acceptance criteria:
  * true_false alias-fallback normalisation (both AI and editor-saved shapes,
    plus the statement/question prompt aliases and the boolean/string
    correct-answer aliases).
  * type_word_in_gap gap-walking, including multiple gaps in one sentence.
  * correct sequential numbering across a mixed-type unit (text + true_false
    + type_word_in_gap + test_with_timer in one segment, more in a second
    segment) with no gaps or duplicates.
  * a text-only unit (zero gradable exercises) exporting without crashing.
"""

import pytest

from app.services.export import service as export_service
from app.services.export import normalizers
from app.services.export import markdown as export_markdown


class _ExportTestSvc:
    """Namespace mirroring the old export_service.py module surface for tests."""

    build_export_context = staticmethod(export_service.build_export_context)
    render_unit_export = staticmethod(export_service.render_unit_export)
    markdown_to_html = staticmethod(export_markdown.markdown_to_html)
    normalise_answer_text = staticmethod(normalizers.normalise_answer_text)
    normalise_true_false_block = staticmethod(normalizers.normalise_true_false_block)
    normalise_gap_fill_block = staticmethod(normalizers.normalise_gap_fill_block)
    normalise_test_block = staticmethod(normalizers.normalise_test_block)
    normalise_text_block = staticmethod(normalizers.normalise_text_block)
    normalise_vocabulary_block = staticmethod(normalizers.normalise_vocabulary_block)
    normalise_image_block = staticmethod(normalizers.normalise_image_block)
    normalise_gif_block = staticmethod(normalizers.normalise_gif_block)
    normalise_audio_block = staticmethod(normalizers.normalise_audio_block)
    normalise_video_block = staticmethod(normalizers.normalise_video_block)
    normalise_carousel_block = staticmethod(normalizers.normalise_carousel_block)
    normalise_order_paragraphs_block = staticmethod(normalizers.normalise_order_paragraphs_block)
    normalise_build_sentence_block = staticmethod(normalizers.normalise_build_sentence_block)
    normalise_sort_into_columns_block = staticmethod(normalizers.normalise_sort_into_columns_block)
    normalise_match_pairs_block = staticmethod(normalizers.normalise_match_pairs_block)
    resolve_asset_url = staticmethod(normalizers.resolve_asset_url)


svc = _ExportTestSvc()


# ═══════════════════════════════════════════════════════════════════════════════
# Fixtures
# ═══════════════════════════════════════════════════════════════════════════════
#
# Tests exercise the public surface (build_export_context + the per-block
# normalisers) against the real data shapes the live frontend stores:
# media_blocks of {"kind", "title", "data"} with kind-specific data payloads.
# No ORM rows are involved — test/MCQ questions live inline in
# test_with_timer / test_without_timer blocks' data.questions.


# ═══════════════════════════════════════════════════════════════════════════════
# true_false alias-fallback normalisation
# ═══════════════════════════════════════════════════════════════════════════════


class TestTrueFalseNormalisation:
    def test_shape_a_ai_generated_boolean_answer(self):
        """Shape A: {prompt, correct_answer: bool}"""
        block = {
            "kind": "true_false",
            "title": "Quiz",
            "data": {"questions": [{"prompt": "The sky is blue.", "correct_answer": True}]},
        }
        answers = {}
        group, consumed = svc.normalise_true_false_block(block, 1, answers)
        assert consumed == 1
        assert group.true_false_questions[0].prompt == "The sky is blue."
        assert group.true_false_questions[0].correct_id == "true"
        assert answers == {"1": "true"}

    def test_shape_a_ai_generated_string_answer(self):
        """Shape A variant: correct_answer as the string 'false' (any case)."""
        block = {
            "kind": "true_false",
            "data": {"questions": [{"prompt": "Cats can fly.", "correct_answer": "FALSE"}]},
        }
        answers = {}
        group, consumed = svc.normalise_true_false_block(block, 1, answers)
        assert consumed == 1
        assert group.true_false_questions[0].correct_id == "false"
        assert answers == {"1": "false"}

    def test_shape_b_editor_saved_correct_option_id(self):
        """Shape B: {type: 'true_false', prompt, correct_option_id}"""
        block = {
            "kind": "true_false",
            "data": {
                "questions": [
                    {"type": "true_false", "prompt": "Paris is in France.", "correct_option_id": "true"}
                ]
            },
        }
        answers = {}
        group, consumed = svc.normalise_true_false_block(block, 1, answers)
        assert consumed == 1
        assert group.true_false_questions[0].correct_id == "true"

    def test_prompt_alias_statement(self):
        block = {"kind": "true_false", "data": {"questions": [{"statement": "Water boils at 100C.", "answer": "true"}]}}
        answers = {}
        group, consumed = svc.normalise_true_false_block(block, 5, answers)
        assert consumed == 1
        assert group.true_false_questions[0].prompt == "Water boils at 100C."
        assert group.true_false_questions[0].number == 5
        assert answers == {"5": "true"}

    def test_prompt_alias_question(self):
        block = {"kind": "true_false", "data": {"questions": [{"question": "Is the sun a star?", "answer": False}]}}
        answers = {}
        group, _ = svc.normalise_true_false_block(block, 1, answers)
        assert group.true_false_questions[0].prompt == "Is the sun a star?"
        assert group.true_false_questions[0].correct_id == "false"

    def test_missing_or_garbage_answer_defaults_to_false(self):
        """Mirrors resolveCorrectId() in the frontend: unrecognised values → false."""
        block = {"kind": "true_false", "data": {"questions": [{"prompt": "X", "correct_answer": "maybe"}]}}
        answers = {}
        group, _ = svc.normalise_true_false_block(block, 1, answers)
        assert group.true_false_questions[0].correct_id == "false"

    def test_empty_prompt_is_dropped(self):
        """Mirrors the frontend's .filter((q) => q.prompt.length > 0)."""
        block = {
            "kind": "true_false",
            "data": {
                "questions": [
                    {"prompt": "", "correct_answer": True},
                    {"prompt": "Valid one", "correct_answer": False},
                ]
            },
        }
        answers = {}
        group, consumed = svc.normalise_true_false_block(block, 1, answers)
        assert consumed == 1
        assert len(group.true_false_questions) == 1
        assert group.true_false_questions[0].prompt == "Valid one"
        # Numbering still starts at 1 for the single surviving question.
        assert group.true_false_questions[0].number == 1

    def test_multiple_questions_get_sequential_numbers(self):
        block = {
            "kind": "true_false",
            "data": {
                "questions": [
                    {"prompt": "Q1", "correct_answer": True},
                    {"prompt": "Q2", "correct_answer": False},
                    {"prompt": "Q3", "correct_answer": True},
                ]
            },
        }
        answers = {}
        group, consumed = svc.normalise_true_false_block(block, 10, answers)
        assert consumed == 3
        numbers = [q.number for q in group.true_false_questions]
        assert numbers == [10, 11, 12]
        assert answers == {"10": "true", "11": "false", "12": "true"}


# ═══════════════════════════════════════════════════════════════════════════════
# type_word_in_gap gap-walking
# ═══════════════════════════════════════════════════════════════════════════════


class TestGapFillNormalisation:
    def test_single_gap(self):
        block = {
            "kind": "type_word_in_gap",
            "data": {
                "title": "Fill it in",
                "segments": [
                    {"type": "text", "value": "The capital of France is "},
                    {"type": "gap", "id": "gap_1"},
                    {"type": "text", "value": "."},
                ],
                "gaps": {"gap_1": "Paris"},
            },
        }
        answers = {}
        group, consumed = svc.normalise_gap_fill_block(block, 1, answers)
        assert consumed == 1
        assert answers == {"1": "paris"}
        frag_types = [f[0] for f in group.gap_fill_block.fragments]
        assert frag_types == ["text", "gap", "text"]
        assert group.gap_fill_block.fragments[1] == ("gap", 1)

    def test_multiple_gaps_in_one_sentence(self):
        """
        Per acceptance criteria: multiple gaps in a single sentence must be
        walked strictly in document order, each consuming the next number.
        """
        block = {
            "kind": "type_word_in_gap",
            "data": {
                "segments": [
                    {"type": "text", "value": "I "},
                    {"type": "gap", "id": "g1"},
                    {"type": "text", "value": " to the "},
                    {"type": "gap", "id": "g2"},
                    {"type": "text", "value": " yesterday."},
                ],
                "gaps": {"g1": "went", "g2": "market"},
            },
        }
        answers = {}
        group, consumed = svc.normalise_gap_fill_block(block, 3, answers)
        assert consumed == 2
        assert answers == {"3": "went", "4": "market"}
        gap_fragments = [f for f in group.gap_fill_block.fragments if f[0] == "gap"]
        assert [f[1] for f in gap_fragments] == [3, 4]

    def test_multiple_gaps_across_two_sentences(self):
        block = {
            "kind": "type_word_in_gap",
            "data": {
                "segments": [
                    {"type": "text", "value": "First "},
                    {"type": "gap", "id": "a"},
                    {"type": "text", "value": " sentence. Second "},
                    {"type": "gap", "id": "b"},
                    {"type": "text", "value": " sentence here, with "},
                    {"type": "gap", "id": "c"},
                    {"type": "text", "value": " too."},
                ],
                "gaps": {"a": "ONE", "b": "Two", "c": "three"},
            },
        }
        answers = {}
        group, consumed = svc.normalise_gap_fill_block(block, 1, answers)
        assert consumed == 3
        # Case-insensitive, trimmed comparison — mirrors normaliseAnswer().
        assert answers == {"1": "one", "2": "two", "3": "three"}

    def test_gap_with_no_matching_answer_defaults_to_empty(self):
        block = {
            "kind": "type_word_in_gap",
            "data": {
                "segments": [{"type": "gap", "id": "missing"}],
                "gaps": {},
            },
        }
        answers = {}
        group, consumed = svc.normalise_gap_fill_block(block, 1, answers)
        assert consumed == 1
        assert answers == {"1": ""}

    def test_no_gaps_consumes_zero_numbers(self):
        block = {
            "kind": "type_word_in_gap",
            "data": {"segments": [{"type": "text", "value": "just prose"}], "gaps": {}},
        }
        answers = {}
        group, consumed = svc.normalise_gap_fill_block(block, 1, answers)
        assert consumed == 0
        assert answers == {}

    def test_drag_to_gap_shares_gap_fill_normaliser(self):
        """drag_to_gap uses the same DragToGapData shape as type_word_in_gap."""
        block = {
            "kind": "drag_to_gap",
            "title": "Drag exercise",
            "data": {
                "title": "Introduce Myself",
                "segments": [
                    {"type": "text", "value": "I am "},
                    {"type": "gap", "id": "g1"},
                    {"type": "text", "value": " and I feel "},
                    {"type": "gap", "id": "g2"},
                    {"type": "text", "value": "."},
                ],
                "gaps": {"g1": "Alex", "g2": "confident"},
            },
        }
        answers = {}
        group, consumed = svc.normalise_gap_fill_block(block, 1, answers)
        assert consumed == 2
        assert group.kind == "gap_fill"
        assert answers == {"1": "alex", "2": "confident"}


# ═══════════════════════════════════════════════════════════════════════════════
# normalise_answer_text — exact mirror of normaliseAnswer() in the frontend
# ═══════════════════════════════════════════════════════════════════════════════


class TestNormaliseAnswerText:
    @pytest.mark.parametrize(
        "raw,expected",
        [
            ("Paris", "paris"),
            ("  Paris  ", "paris"),
            ("PARIS", "paris"),
            ("", ""),
            (None, ""),
        ],
    )
    def test_trim_and_lowercase(self, raw, expected):
        assert svc.normalise_answer_text(raw) == expected


# ═══════════════════════════════════════════════════════════════════════════════
# Multiple-choice (test_with_timer / test_without_timer) normalisation
# ═══════════════════════════════════════════════════════════════════════════════


class TestTestBlockNormalisation:
    """test_with_timer / test_without_timer blocks store questions inline
    in data.questions as QuestionDraft dicts — these tests cover that path."""

    def _block(self, questions, kind="test_with_timer", title="Quiz"):
        return {"kind": kind, "title": title, "data": {"title": title, "questions": questions}}

    def test_single_correct_mc_renders_as_radio(self):
        block = self._block([
            {"type": "multiple_choice", "prompt": "What is 2+2?",
             "options": [{"id": "a", "text": "3"}, {"id": "b", "text": "4"}],
             "correct_option_ids": ["b"]},
        ])
        answers = {}
        groups = svc.normalise_test_block(block, 1, answers)
        assert len(groups) == 1
        group, consumed = groups[0]
        assert consumed == 1
        assert group.kind == "multiple_choice"
        assert group.multiple_choice_questions[0].multi is False
        assert answers == {"1": "b"}

    def test_multiple_correct_mc_renders_as_checkbox(self):
        block = self._block([
            {"type": "multiple_choice", "prompt": "Select all primes.",
             "options": [{"id": "a", "text": "2"}, {"id": "b", "text": "3"}, {"id": "c", "text": "4"}],
             "correct_option_ids": ["a", "b"]},
        ])
        answers = {}
        (group, consumed), = svc.normalise_test_block(block, 1, answers)
        assert consumed == 1
        assert group.multiple_choice_questions[0].multi is True
        assert answers == {"1": ["a", "b"]}

    def test_prompt_alias_question(self):
        block = self._block([
            {"type": "multiple_choice", "question": "Aliased prompt?",
             "options": [{"id": "a", "text": "A"}], "correct_option_ids": ["a"]},
        ])
        answers = {}
        (group, _), = svc.normalise_test_block(block, 1, answers)
        assert group.multiple_choice_questions[0].prompt == "Aliased prompt?"

    def test_legacy_correct_index_shape(self):
        """Draft without `type` but with correct_index is treated as MC (mirrors
        toRuntimeQuestion in TestWithTimerBlock.tsx)."""
        block = self._block([
            {"prompt": "Legacy?", "options": [{"id": "x", "text": "X"}, {"id": "y", "text": "Y"}],
             "correct_index": 1},
        ])
        answers = {}
        (group, _), = svc.normalise_test_block(block, 1, answers)
        assert answers == {"1": "y"}

    def test_true_false_draft_inside_test_block(self):
        block = self._block([
            {"type": "true_false", "prompt": "Sky is blue.", "correct_option_id": "true"},
        ])
        answers = {}
        (group, consumed), = svc.normalise_test_block(block, 1, answers)
        assert group.kind == "true_false"
        assert consumed == 1
        assert answers == {"1": "true"}

    def test_mixed_mc_and_tf_drafts_bucket_with_contiguous_numbering(self):
        block = self._block([
            {"type": "multiple_choice", "prompt": "MC1", "options": [{"id": "a", "text": "A"}], "correct_option_ids": ["a"]},
            {"type": "true_false", "prompt": "TF1", "correct_option_id": "false"},
            {"type": "multiple_choice", "prompt": "MC2", "options": [{"id": "b", "text": "B"}], "correct_option_ids": ["b"]},
        ])
        answers = {}
        groups = svc.normalise_test_block(block, 1, answers)
        # MC drafts (1, 3) bucket together; TF draft (2) into its own group.
        assert {g.kind for g, _ in groups} == {"multiple_choice", "true_false"}
        # Numbering follows document order: MC1=1, TF1=2, MC2=3 — no gaps/dupes.
        assert answers == {"1": "a", "2": "false", "3": "b"}
        mc_group = next(g for g, _ in groups if g.kind == "multiple_choice")
        assert [q.number for q in mc_group.multiple_choice_questions] == [1, 3]

    def test_tier2_drafts_inside_test_block_are_skipped(self):
        block = self._block([
            {"type": "multiple_choice", "prompt": "MC1", "options": [{"id": "a", "text": "A"}], "correct_option_ids": ["a"]},
            {"type": "matching_pairs", "prompt": "skip me"},
            {"type": "cloze_input", "prompt": "skip me too"},
        ])
        answers = {}
        groups = svc.normalise_test_block(block, 1, answers)
        assert answers == {"1": "a"}
        assert sum(consumed for _, consumed in groups) == 1

    def test_test_without_timer_kind_works_identically(self):
        block = self._block([
            {"type": "multiple_choice", "prompt": "Q", "options": [{"id": "a", "text": "A"}], "correct_option_ids": ["a"]},
        ], kind="test_without_timer")
        answers = {}
        (group, consumed), = svc.normalise_test_block(block, 5, answers)
        assert consumed == 1
        assert group.multiple_choice_questions[0].number == 5
        assert answers == {"5": "a"}

    def test_mc_draft_with_no_options_is_skipped(self):
        block = self._block([{"type": "multiple_choice", "prompt": "No options", "options": []}])
        answers = {}
        groups = svc.normalise_test_block(block, 1, answers)
        assert sum(consumed for _, consumed in groups) == 0
        assert answers == {}


# ═══════════════════════════════════════════════════════════════════════════════
# build_export_context — sequential numbering across a mixed-type unit
# ═══════════════════════════════════════════════════════════════════════════════


class TestBuildExportContext:
    def _mixed_unit_segments(self):
        return [
            {
                "id": 1,
                "order_index": 0,
                "media_blocks": [
                    {"kind": "text", "title": "Intro", "data": {"content": "Some **prose** here."}},
                    {
                        "kind": "true_false",
                        "data": {
                            "questions": [
                                {"prompt": "TF one", "correct_answer": True},
                                {"prompt": "TF two", "correct_answer": False},
                            ]
                        },
                    },
                ],
                "tests": [],
            },
            {
                "id": 2,
                "order_index": 1,
                "media_blocks": [
                    {
                        "kind": "type_word_in_gap",
                        "data": {
                            "segments": [
                                {"type": "text", "value": "A "},
                                {"type": "gap", "id": "g1"},
                                {"type": "text", "value": " and a "},
                                {"type": "gap", "id": "g2"},
                                {"type": "text", "value": "."},
                            ],
                            "gaps": {"g1": "cat", "g2": "dog"},
                        },
                    },
                    {
                        "kind": "test_with_timer",
                        "title": "Quiz",
                        "data": {
                            "title": "Quiz",
                            "questions": [
                                {"type": "multiple_choice", "prompt": "MC one",
                                 "options": [{"id": "a", "text": "A"}], "correct_option_ids": ["a"]},
                                {"type": "multiple_choice", "prompt": "MC two",
                                 "options": [{"id": "b", "text": "B"}], "correct_option_ids": ["b"]},
                            ],
                        },
                    },
                ],
                "tests": [],
            },
        ]

    def test_numbering_is_sequential_with_no_gaps_or_duplicates(self):
        ctx = svc.build_export_context("My Unit", self._mixed_unit_segments())

        # 2 TF + 2 gaps + 2 MC = 6 total, numbered 1..6 with no gaps/dupes.
        assert ctx.total_questions == 6
        assert sorted(int(k) for k in ctx.correct_answers.keys()) == [1, 2, 3, 4, 5, 6]

        # Document order: TF block (seg 1) before gap-fill block (seg 2)
        # before the test block in that same segment.
        tf_group = ctx.question_groups[0]
        assert tf_group.kind == "true_false"
        assert [q.number for q in tf_group.true_false_questions] == [1, 2]

        gap_group = ctx.question_groups[1]
        assert gap_group.kind == "gap_fill"
        gap_numbers = [f[1] for f in gap_group.gap_fill_block.fragments if f[0] == "gap"]
        assert gap_numbers == [3, 4]

        mc_group = ctx.question_groups[2]
        assert mc_group.kind == "multiple_choice"
        assert [q.number for q in mc_group.multiple_choice_questions] == [5, 6]

        # One passage block from the text content block.
        assert len(ctx.passage_blocks) == 1
        assert "prose" in ctx.passage_blocks[0].html

    def test_text_only_unit_exports_without_crashing(self):
        segments = [
            {
                "id": 1,
                "order_index": 0,
                "media_blocks": [
                    {"kind": "text", "title": "Just reading", "data": {"content": "No exercises here."}}
                ],
                "tests": [],
            }
        ]
        ctx = svc.build_export_context("Reading Only", segments)
        assert ctx.total_questions == 0
        assert ctx.correct_answers == {}
        assert ctx.question_groups == []
        assert len(ctx.passage_blocks) == 1

    def test_vocabulary_block_renders_in_passage_panel(self):
        segments = [
            {
                "id": 1,
                "order_index": 0,
                "media_blocks": [
                    {
                        "kind": "text",
                        "title": "Intro",
                        "data": {"content": "Overview text."},
                    },
                    {
                        "kind": "vocabulary",
                        "title": "Key Vocabulary",
                        "data": {
                            "target_language": "english",
                            "explanation_language": "russian",
                            "entries": [
                                {
                                    "word": "confident",
                                    "translation": "уверенный",
                                    "example": "I feel confident.",
                                },
                                {
                                    "word": "dream",
                                    "translation": "мечта",
                                    "example": "My dream is to travel.",
                                },
                            ],
                        },
                    },
                ],
                "tests": [],
            }
        ]
        ctx = svc.build_export_context("Vocab Unit", segments)
        html = svc.render_unit_export("Vocab Unit", segments)

        assert len(ctx.passage_blocks) == 2
        assert "vocab-table" in ctx.passage_blocks[1].html
        assert "confident" in ctx.passage_blocks[1].html
        assert "Word (English)" in ctx.passage_blocks[1].html
        assert "Translation (Russian)" in ctx.passage_blocks[1].html
        assert "vocab-table" in html
        assert "confident" in html

    def test_drag_to_gap_block_exports_as_gap_fill(self):
        segments = [
            {
                "id": 1,
                "order_index": 0,
                "media_blocks": [
                    {
                        "kind": "drag_to_gap",
                        "title": "Gap drill",
                        "data": {
                            "title": "My gap",
                            "segments": [
                                {"type": "text", "value": "Hello "},
                                {"type": "gap", "id": "g1"},
                                {"type": "text", "value": "!"},
                            ],
                            "gaps": {"g1": "world"},
                        },
                    }
                ],
                "tests": [],
            }
        ]
        ctx = svc.build_export_context("Gap Unit", segments)
        html = svc.render_unit_export("Gap Unit", segments)

        assert ctx.total_questions == 1
        assert ctx.question_groups[0].kind == "gap_fill"
        assert ctx.correct_answers == {"1": "world"}
        assert 'id="q1"' in html
        assert "Hello " in html

    def test_segments_are_processed_in_order_index_order_even_if_unsorted_input(self):
        segments = [
            {
                "id": 2,
                "order_index": 1,
                "media_blocks": [{"kind": "true_false", "data": {"questions": [{"prompt": "second", "correct_answer": True}]}}],
                "tests": [],
            },
            {
                "id": 1,
                "order_index": 0,
                "media_blocks": [{"kind": "true_false", "data": {"questions": [{"prompt": "first", "correct_answer": False}]}}],
                "tests": [],
            },
        ]
        ctx = svc.build_export_context("Unit", segments)
        assert ctx.question_groups[0].true_false_questions[0].prompt == "first"
        assert ctx.question_groups[1].true_false_questions[0].prompt == "second"

    def test_empty_test_block_consumes_no_numbers(self):
        segments = [
            {"id": 1, "order_index": 0,
             "media_blocks": [{"kind": "test_with_timer", "title": "Empty", "data": {"questions": []}}],
             "tests": []}
        ]
        ctx = svc.build_export_context("Unit", segments)
        assert ctx.total_questions == 0
        assert ctx.question_groups == []

    def test_orm_tests_summary_is_ignored(self):
        """seg['tests'] (ORM summary) carries no questions and must NOT add to
        the export — all gradable content comes from media_blocks."""
        segments = [
            {"id": 1, "order_index": 0, "media_blocks": [],
             "tests": [{"id": 99, "title": "Some ORM test", "time_limit_minutes": 10}]}
        ]
        ctx = svc.build_export_context("Unit", segments)
        assert ctx.total_questions == 0
        assert ctx.question_groups == []

    def test_unknown_media_block_kind_is_silently_skipped(self):
        """Tier-2/3 kinds present in older data must not crash the export."""
        segments = [
            {
                "id": 1,
                "order_index": 0,
                "media_blocks": [
                    {"kind": "match_pairs", "data": {}},
                    {"kind": "true_false", "data": {"questions": [{"prompt": "Q", "correct_answer": True}]}},
                ],
                "tests": [],
            }
        ]
        ctx = svc.build_export_context("Unit", segments)
        assert ctx.total_questions == 1
        assert ctx.question_groups[0].kind == "true_false"


# ═══════════════════════════════════════════════════════════════════════════════
# markdown_to_html — sanity coverage (not the focus of acceptance criteria,
# but exercised by the text-only-unit test above; a couple of direct checks
# guard against silent regressions in the passage-panel rendering).
# ═══════════════════════════════════════════════════════════════════════════════


class TestMarkdownToHtml:
    def test_bold_and_italic(self):
        html = svc.markdown_to_html("**bold** and *italic*")
        assert "<strong>bold</strong>" in html
        assert "<em>italic</em>" in html

    def test_escapes_html_special_chars(self):
        html = svc.markdown_to_html("a < b & c > d")
        assert "&lt;" in html and "&gt;" in html and "&amp;" in html

    def test_heading_and_list(self):
        html = svc.markdown_to_html("## Title\n- one\n- two")
        assert "<h2>Title</h2>" in html
        assert "<ul><li>one</li><li>two</li></ul>" in html


if __name__ == "__main__":
    sys.exit(pytest.main([__file__, "-v"]))


# ═══════════════════════════════════════════════════════════════════════════════
# Tier-2 normalizers
# ═══════════════════════════════════════════════════════════════════════════════


class TestOrderParagraphs:
    def test_nested_question_shape(self):
        block = {"kind": "order_paragraphs", "title": "Order", "data": {"question": {
            "items": [{"id": "a", "text": "A"}, {"id": "b", "text": "B"}, {"id": "c", "text": "C"}],
            "correct_order": ["a", "b", "c"]}}}
        answers = {}
        group, consumed = svc.normalise_order_paragraphs_block(block, 1, answers)
        assert consumed == 1
        assert group.kind == "order"
        assert answers == {"1": {"kind": "order", "order": ["a", "b", "c"]}}

    def test_flat_items_shape_sorted_by_correct_order(self):
        block = {"kind": "order_paragraphs", "data": {"items": [
            {"id": "x", "text": "third", "correct_order": 2},
            {"id": "y", "text": "first", "correct_order": 0},
            {"id": "z", "text": "second", "correct_order": 1}]}}
        answers = {}
        group, consumed = svc.normalise_order_paragraphs_block(block, 5, answers)
        assert consumed == 1
        assert answers["5"]["order"] == ["y", "z", "x"]
        assert group.order_questions[0].number == 5

    def test_fewer_than_two_items_skipped(self):
        block = {"kind": "order_paragraphs", "data": {"items": [{"id": "a", "text": "A", "correct_order": 0}]}}
        answers = {}
        group, consumed = svc.normalise_order_paragraphs_block(block, 1, answers)
        assert consumed == 0
        assert answers == {}


class TestBuildSentence:
    def test_nested_ordering_words_with_groups(self):
        block = {"kind": "build_sentence", "data": {"question": {
            "type": "ordering_words",
            "tokens": [{"id": "w1", "text": "I"}, {"id": "w2", "text": "run"}],
            "correct_order": ["w1", "w2"],
            "metadata": {"sentence_groups": [["w1", "w2"]]}}}}
        answers = {}
        group, consumed = svc.normalise_build_sentence_block(block, 1, answers)
        assert consumed == 1
        assert answers["1"] == {"kind": "order", "order": ["w1", "w2"]}
        assert group.order_questions[0].group_sizes == [2]

    def test_legacy_sentences_shape(self):
        block = {"kind": "build_sentence", "data": {"sentences": [
            {"words": ["Hello", "world"]}, {"words": ["Bye", "now"]}]}}
        answers = {}
        group, consumed = svc.normalise_build_sentence_block(block, 1, answers)
        assert consumed == 1
        # tok_{s}_{w} ids in reading order
        assert answers["1"]["order"] == ["tok_0_0", "tok_0_1", "tok_1_0", "tok_1_1"]
        assert group.order_questions[0].group_sizes == [2, 2]


class TestSortIntoColumns:
    def test_nested_ordering_words_with_columns(self):
        block = {"kind": "sort_into_columns", "data": {"question": {
            "type": "ordering_words",
            "tokens": [{"id": "sic_0_0", "text": "cat"}, {"id": "sic_1_0", "text": "red"}],
            "correct_order": ["sic_0_0", "sic_1_0"],
            "metadata": {"sentence_groups": [["sic_0_0"], ["sic_1_0"]], "column_titles": ["Animals", "Colors"]}}}}
        answers = {}
        group, consumed = svc.normalise_sort_into_columns_block(block, 1, answers)
        assert consumed == 1
        assert answers["1"] == {"kind": "sort", "columns": {"sic_0_0": 0, "sic_1_0": 1}}
        assert [c.title for c in group.sort_questions[0].columns] == ["Animals", "Colors"]

    def test_raw_columns_shape(self):
        block = {"kind": "sort_into_columns", "data": {"columns": [
            {"title": "Fruit", "words": ["apple", "pear"]},
            {"title": "Veg", "words": ["kale"]}]}}
        answers = {}
        group, consumed = svc.normalise_sort_into_columns_block(block, 1, answers)
        assert consumed == 1
        cols = answers["1"]["columns"]
        assert cols == {"sic_0_0": 0, "sic_0_1": 0, "sic_1_0": 1}

    def test_single_column_skipped(self):
        block = {"kind": "sort_into_columns", "data": {"columns": [{"title": "Only", "words": ["a", "b"]}]}}
        answers = {}
        group, consumed = svc.normalise_sort_into_columns_block(block, 1, answers)
        assert consumed == 0


class TestMatchPairs:
    def test_flat_shape(self):
        block = {"kind": "match_pairs", "data": {
            "left_items": [{"id": "l1", "text": "Dog"}, {"id": "l2", "text": "Cat"}],
            "right_items": [{"id": "r1", "text": "Woof"}, {"id": "r2", "text": "Meow"}],
            "pairs": [{"left_id": "l1", "right_id": "r1"}, {"left_id": "l2", "right_id": "r2"}]}}
        answers = {}
        group, consumed = svc.normalise_match_pairs_block(block, 1, answers)
        assert consumed == 1
        assert answers["1"] == {"kind": "match", "pairs": {"l1": "r1", "l2": "r2"}}

    def test_nested_question_shape(self):
        block = {"kind": "match_pairs", "data": {"question": {
            "left_items": [{"id": "l1", "text": "A"}, {"id": "l2", "text": "B"}],
            "right_items": [{"id": "r1", "text": "1"}, {"id": "r2", "text": "2"}],
            "pairs": [{"left_id": "l1", "right_id": "r2"}, {"left_id": "l2", "right_id": "r1"}]}}}
        answers = {}
        group, consumed = svc.normalise_match_pairs_block(block, 3, answers)
        assert consumed == 1
        assert answers["3"]["pairs"] == {"l1": "r2", "l2": "r1"}

    def test_left_alias_without_id_suffix(self):
        block = {"kind": "match_pairs", "data": {
            "left_items": [{"id": "l1", "text": "A"}, {"id": "l2", "text": "B"}],
            "right_items": [{"id": "r1", "text": "1"}, {"id": "r2", "text": "2"}],
            "pairs": [{"left": "l1", "right": "r1"}, {"left": "l2", "right": "r2"}]}}
        answers = {}
        group, consumed = svc.normalise_match_pairs_block(block, 1, answers)
        assert answers["1"]["pairs"] == {"l1": "r1", "l2": "r2"}

    def test_no_pairs_skipped(self):
        block = {"kind": "match_pairs", "data": {
            "left_items": [{"id": "l1", "text": "A"}, {"id": "l2", "text": "B"}],
            "right_items": [{"id": "r1", "text": "1"}, {"id": "r2", "text": "2"}], "pairs": []}}
        answers = {}
        group, consumed = svc.normalise_match_pairs_block(block, 1, answers)
        assert consumed == 0


class TestMixedTierNumbering:
    def test_tier1_and_tier2_number_sequentially(self):
        segs = [{"id": 1, "order_index": 0, "media_blocks": [
            {"kind": "true_false", "data": {"questions": [
                {"prompt": "TF1", "correct_answer": True}, {"prompt": "TF2", "correct_answer": False}]}},
            {"kind": "match_pairs", "data": {
                "left_items": [{"id": "l1", "text": "A"}, {"id": "l2", "text": "B"}],
                "right_items": [{"id": "r1", "text": "1"}, {"id": "r2", "text": "2"}],
                "pairs": [{"left_id": "l1", "right_id": "r1"}, {"left_id": "l2", "right_id": "r2"}]}},
            {"kind": "order_paragraphs", "data": {"question": {
                "items": [{"id": "p1", "text": "P1"}, {"id": "p2", "text": "P2"}],
                "correct_order": ["p1", "p2"]}}},
        ], "tests": []}]
        ctx = svc.build_export_context("Mixed", segs)
        # 2 TF + 1 match + 1 order = 4, numbered 1..4
        assert ctx.total_questions == 4
        assert sorted(int(k) for k in ctx.correct_answers) == [1, 2, 3, 4]
        assert ctx.correct_answers["3"]["kind"] == "match"
        assert ctx.correct_answers["4"]["kind"] == "order"

    def test_unknown_tier3_kind_still_skipped(self):
        segs = [{"id": 1, "order_index": 0, "media_blocks": [
            {"kind": "drag_word_to_image", "data": {}},
            {"kind": "true_false", "data": {"questions": [{"prompt": "Q", "correct_answer": True}]}},
        ], "tests": []}]
        ctx = svc.build_export_context("U", segs)
        assert ctx.total_questions == 1
        assert ctx.question_groups[0].kind == "true_false"


class TestBuildSentenceRows:
    """Regression: multi-sentence build_sentence must render one word bank per
    sentence (BuildSentenceBlock never merges sentences into one bank)."""
    def test_group_sizes_produce_row_slices(self):
        from app.services.export.templates import render_export
        segs = [{"id": 1, "order_index": 0, "media_blocks": [
            {"kind": "build_sentence", "data": {"question": {
                "type": "ordering_words",
                "tokens": [{"id": "t0", "text": "I"}, {"id": "t1", "text": "run"},
                           {"id": "t2", "text": "She"}, {"id": "t3", "text": "sings"}],
                "correct_order": ["t0", "t1", "t2", "t3"],
                "metadata": {"sentence_groups": [["t0", "t1"], ["t2", "t3"]]}}}},
        ], "tests": []}]
        ctx = svc.build_export_context("U", segs)
        html = render_export(ctx)
        assert html.count('class="order-list"') == 2  # two sentence banks
        q = ctx.question_groups[0].order_questions[0]
        assert len(q.rows) == 2
        # Row membership preserved (words don't cross sentence boundaries),
        # but each row is scrambled (not necessarily original order).
        assert {i.id for i in q.rows[0]} == {"t0", "t1"}
        assert {i.id for i in q.rows[1]} == {"t2", "t3"}

    def test_order_paragraphs_single_row(self):
        from app.services.export.templates import render_export
        segs = [{"id": 1, "order_index": 0, "media_blocks": [
            {"kind": "order_paragraphs", "data": {"question": {
                "items": [{"id": "a", "text": "A"}, {"id": "b", "text": "B"}],
                "correct_order": ["a", "b"]}}},
        ], "tests": []}]
        ctx = svc.build_export_context("U", segs)
        html = render_export(ctx)
        assert html.count('class="order-list"') == 1  # single row


# ═══════════════════════════════════════════════════════════════════════════════
# Media blocks (image / audio / video / gif / carousel)
# ═══════════════════════════════════════════════════════════════════════════════


class TestAssetUrlResolution:
    @pytest.mark.parametrize("inp,base,exp", [
        ("data:image/png;base64,AAA", "https://x.com", "data:image/png;base64,AAA"),
        ("https://cdn.x/a.png", "https://x.com", "https://cdn.x/a.png"),
        ("//cdn.x/a.png", "https://x.com", "//cdn.x/a.png"),
        ("/api/v1/static/a.png", "https://x.com", "https://x.com/api/v1/static/a.png"),
        ("q/1/a.png", "https://x.com", "https://x.com/q/1/a.png"),
        ("/static/a.png", "", "/static/a.png"),  # no base → unchanged
        ("", "https://x.com", ""),
    ])
    def test_resolve(self, inp, base, exp):
        assert svc.resolve_asset_url(inp, base) == exp


class TestMediaBlocks:
    def test_image_relative_made_absolute(self):
        pb = svc.normalise_image_block(
            {"kind": "image", "data": {"src": "/static/cat.png", "alt_text": "cat", "caption": "Il gatto"}},
            "https://linguai.net")
        assert 'src="https://linguai.net/static/cat.png"' in pb.html
        assert 'alt="cat"' in pb.html
        assert "Il gatto" in pb.html

    def test_image_data_uri_untouched(self):
        pb = svc.normalise_image_block(
            {"kind": "image", "data": {"src": "data:image/svg+xml;base64,PHN2Zz4="}}, "https://x.com")
        assert "data:image/svg+xml;base64,PHN2Zz4=" in pb.html

    def test_image_fallback_to_block_url(self):
        pb = svc.normalise_image_block({"kind": "image", "url": "/static/legacy.png"}, "https://x.com")
        assert 'src="https://x.com/static/legacy.png"' in pb.html

    def test_image_empty_src_returns_none(self):
        assert svc.normalise_image_block({"kind": "image", "data": {}}, "https://x.com") is None

    def test_audio(self):
        pb = svc.normalise_audio_block(
            {"kind": "audio_embed", "data": {"src": "/static/a.mp3", "caption": "Ciao"}}, "https://x.com")
        assert '<audio src="https://x.com/static/a.mp3" controls' in pb.html
        assert "Ciao" in pb.html

    def test_video_youtube_embed(self):
        pb = svc.normalise_video_block(
            {"kind": "video_embed", "data": {"src": "https://youtu.be/dQw4w9WgXcQ"}}, "https://x.com")
        assert "youtube.com/embed/dQw4w9WgXcQ" in pb.html
        assert "<iframe" in pb.html

    def test_video_vimeo_embed(self):
        pb = svc.normalise_video_block(
            {"kind": "video_embed", "data": {"src": "https://vimeo.com/123456"}}, "https://x.com")
        assert "player.vimeo.com/video/123456" in pb.html

    def test_video_direct_file(self):
        pb = svc.normalise_video_block(
            {"kind": "video_embed", "data": {"src": "/static/clip.mp4"}}, "https://x.com")
        assert '<video src="https://x.com/static/clip.mp4" controls' in pb.html

    def test_gif(self):
        pb = svc.normalise_gif_block(
            {"kind": "gif", "data": {"src": "https://cdn.x/a.gif", "caption": "wave"}}, "https://x.com")
        assert 'src="https://cdn.x/a.gif"' in pb.html
        assert "wave" in pb.html

    def test_carousel_stack(self):
        pb = svc.normalise_carousel_block({"kind": "carousel_slides", "data": {"slides": [
            {"url": "/static/1.png", "caption": "one"}, {"url": "/static/2.png", "caption": "two"}]}}, "https://x.com")
        assert pb.html.count("<img") == 2
        assert "one" in pb.html and "two" in pb.html

    def test_media_is_non_gradable_in_context(self):
        segs = [{"id": 1, "order_index": 0, "media_blocks": [
            {"kind": "image", "data": {"src": "/static/a.png"}},
            {"kind": "audio_embed", "data": {"src": "/static/a.mp3"}},
            {"kind": "true_false", "data": {"questions": [{"prompt": "Q", "correct_answer": True}]}},
        ], "tests": []}]
        ctx = svc.build_export_context("U", segs, asset_base_url="https://x.com")
        assert ctx.total_questions == 1          # media adds no questions
        assert len(ctx.passage_blocks) == 2       # image + audio in left panel