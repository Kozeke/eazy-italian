"""
app/services/export/models.py

Normalised, render-ready data structures produced by the normalizers and
consumed by the templates. These are deliberately dumb data holders — all
"what does this block mean" logic lives in normalizers.py, all "how is this
drawn" logic lives in templates.py.

Tiers covered:
  Tier-1  true_false, gap_fill (type_word_in_gap), multiple_choice (tests), text
  Tier-2  match_pairs, sort_into_columns, order_paragraphs, build_sentence
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional


# ── Tier-1 ──────────────────────────────────────────────────────────────────────

@dataclass
class TrueFalseQuestion:
    number: int
    prompt: str
    correct_id: str  # "true" | "false"


@dataclass
class GapFillBlock:
    """One type_word_in_gap exercise. Holds multiple gap question numbers."""
    title: str
    # Rendered fragments in order: ("text", value) or ("gap", question_number)
    fragments: list[tuple[str, Any]]


@dataclass
class MultipleChoiceOption:
    id: str
    text: str


@dataclass
class MultipleChoiceQuestion:
    number: int
    prompt: str
    options: list[MultipleChoiceOption]
    multi: bool  # True → checkboxes (2+ correct answers), False → radio


@dataclass
class PassageBlock:
    """Non-gradable content for the left (passage) panel."""
    html: str


# ── Tier-2 ──────────────────────────────────────────────────────────────────────
#
# All four Tier-2 types reduce to one of two interaction models, each with one
# grader-JS branch in the base template:
#
#   ORDERING  (build_sentence, order_paragraphs, sort_into_columns)
#       The student arranges scrambled items; correct = final arrangement
#       matches an answer key. Sort-into-columns is ordering-with-buckets:
#       each item belongs to a column and the answer key is per-column.
#
#   MATCHING  (match_pairs)
#       The student links left items to right items; correct = every left
#       maps to its designated right.


@dataclass
class OrderItem:
    """One draggable item in an ordering/sort exercise."""
    id: str
    text: str


@dataclass
class OrderQuestion:
    """
    build_sentence / order_paragraphs.

    `items` are presented to the student in scrambled order (the template
    scrambles deterministically at render time). `correct_order` is the list
    of item ids in the right sequence — this is the answer key. `group_sizes`
    optionally segments the items into rows (build_sentence: one row per
    sentence); empty/None means a single row.
    """
    number: int
    prompt: str
    items: list[OrderItem]            # author order (correct order)
    correct_order: list[str]          # item ids, correct sequence
    group_sizes: list[int] = field(default_factory=list)  # row lengths, in order
    scrambled: list[OrderItem] = field(default_factory=list)  # flat scramble (fallback)
    rows: list[list[OrderItem]] = field(default_factory=list)  # per-row scrambled items


@dataclass
class SortColumn:
    title: str
    item_ids: list[str]               # ids that belong in this column (answer key)


@dataclass
class SortQuestion:
    """
    sort_into_columns. Student drags each item from a shared pool into the
    correct column. `items` is the full pool; `columns` is the answer key
    (which item belongs in which column).
    """
    number: int
    prompt: str
    items: list[OrderItem]            # full pool (scrambled at render)
    columns: list[SortColumn]
    scrambled: list[OrderItem] = field(default_factory=list)  # render-time scramble


@dataclass
class MatchItem:
    id: str
    text: str


@dataclass
class MatchQuestion:
    """
    match_pairs. Student links each left item to a right item. `pairs` maps
    left_id → right_id and is the answer key. Right items are scrambled at
    render so positions are not aligned.
    """
    number: int
    prompt: str
    left_items: list[MatchItem]
    right_items: list[MatchItem]
    pairs: dict[str, str]             # left_id → right_id (answer key)
    right_scrambled: list[MatchItem] = field(default_factory=list)  # render-time scramble


# ── Container ────────────────────────────────────────────────────────────────────

@dataclass
class QuestionGroup:
    """One contiguous run of same-kind questions, rendered by one partial."""
    kind: str  # "true_false" | "gap_fill" | "multiple_choice"
               # | "order" | "sort" | "match"
    title: Optional[str]
    true_false_questions: list[TrueFalseQuestion] = field(default_factory=list)
    gap_fill_block: Optional[GapFillBlock] = None
    multiple_choice_questions: list[MultipleChoiceQuestion] = field(default_factory=list)
    order_questions: list[OrderQuestion] = field(default_factory=list)
    sort_questions: list[SortQuestion] = field(default_factory=list)
    match_questions: list[MatchQuestion] = field(default_factory=list)


@dataclass
class ExportContext:
    unit_title: str
    passage_blocks: list[PassageBlock]
    question_groups: list[QuestionGroup]
    correct_answers: dict[str, Any]  # flat, JSON-serialisable
    total_questions: int