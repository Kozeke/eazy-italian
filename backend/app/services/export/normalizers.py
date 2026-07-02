"""
app/services/export/normalizers.py

Owns ALL "what does this block mean" logic — the alias fallback chains, the
gap-walking, the option/pair/order resolution. Each normaliser takes a raw
media_block dict (+ the running question number + the mutable correct_answers
dict) and returns render-ready model objects. Kept here, in plain Python,
fully unit-testable, and separate from rendering (templates.py).

Verified against the live frontend components (not guessed):
  Tier-1:
    true_false        TrueFalseBlock.tsx          (prompt/statement/question +
                                                   correct_answer/correct_option_id/answer)
    type_word_in_gap  TypeWordInGapBlock.tsx      (data.segments + data.gaps,
                                                   normaliseAnswer = trim+lower)
    drag_to_gap       DragToGapBlock.tsx          (same DragToGapData shape as
                                                   type_word_in_gap — exported as
                                                   inline text inputs)
    test_with_timer / test_without_timer
                      TestWithTimerBlock.tsx      (inline data.questions drafts:
                                                   multiple_choice / true_false)
    text              TextBlock.tsx               (data.content markdown)
    vocabulary        VocabularyBlock.tsx         (data.entries + target_language +
                                                   explanation_language)
  Tier-2 (this expansion):
    match_pairs       MatchPairsBlock.tsx         (left_items/right_items/pairs)
    sort_into_columns SortIntoColumnsBlock.tsx    (ordering_words + sentence_groups
                                                   + column_titles, or raw columns)
    order_paragraphs  OrderParagraphsBlock.tsx    (ordering_sentences correct_order,
                                                   or items[].correct_order)
    build_sentence    BuildSentenceBlock.tsx      (ordering_words question, or
                                                   legacy sentences[].words)
"""

from __future__ import annotations

import re
from typing import Any, Optional

from .markdown import _escape_html, markdown_to_html
from .models import (
    GapFillBlock,
    MatchItem,
    MatchQuestion,
    MultipleChoiceOption,
    MultipleChoiceQuestion,
    OrderItem,
    OrderQuestion,
    PassageBlock,
    QuestionGroup,
    SortColumn,
    SortQuestion,
    TrueFalseQuestion,
)


# ── Shared helpers (mirror the frontend exactly) ────────────────────────────────

def normalise_answer_text(value: Any) -> str:
    """
    Mirror TypeWordInGapBlock.tsx's ``normaliseAnswer()``: trim + lowercase.

    Used both when emitting the correctAnswers dict (so the embedded JS grader
    in the exported file behaves identically to the live app) and is the
    canonical reference for what the exported file's own JS grader does.
    """
    return str(value or "").strip().lower()


def _resolve_tf_correct_id(raw: Any) -> str:
    """
    Mirror TrueFalseBlock.tsx's ``resolveCorrectId()``:
      real booleans map directly; otherwise compare the lowercased string
      to "true" — anything else (including missing/garbage data) is "false".
    """
    if isinstance(raw, bool):
        return "true" if raw else "false"
    s = str(raw if raw is not None else "").strip().lower()
    return "true" if s == "true" else "false"


def slugify(text: str) -> str:
    """Filesystem/URL-safe slug for the downloaded filename."""
    s = re.sub(r"[^a-zA-Z0-9]+", "-", text or "unit").strip("-").lower()
    return s or "unit"

# ── Tier-1 normalizers ──────────────────────────────────────────────────────────

def normalise_text_block(block: dict) -> PassageBlock:
    data = block.get("data") or {}
    content = data.get("content") or ""
    title = block.get("title") or ""
    html = markdown_to_html(content)
    if title:
        html = f"<h4>{_escape_html(title)}</h4>\n{html}"
    return PassageBlock(html=html)


def _labelize_language(raw: Any) -> str:
    """Title-case a language label like 'italian' → 'Italian' for column headers."""
    s = str(raw or "").strip()
    if not s:
        return ""
    return s[0].upper() + s[1:]


def normalise_vocabulary_block(block: dict) -> Optional[PassageBlock]:
    """
    Render a unit glossary table (VocabularyBlock.tsx) into the passage panel.

    Data shape:
        data.entries: [{word, translation, example}, ...]
        data.target_language / data.explanation_language: optional column labels
    """
    data = block.get("data") or {}
    raw_entries = data.get("entries")
    if not isinstance(raw_entries, list):
        return None

    # Collect validated rows — skip incomplete entries rather than failing export.
    rows: list[tuple[str, str, str]] = []
    seen: set[str] = set()
    for item in raw_entries:
        if not isinstance(item, dict):
            continue
        word = str(item.get("word") or "").strip()
        translation = str(item.get("translation") or "").strip()
        example = str(item.get("example") or "").strip()
        if not (word and translation and example):
            continue
        key = word.casefold()
        if key in seen:
            continue
        seen.add(key)
        rows.append((word, translation, example))

    if not rows:
        return None

    title = str(block.get("title") or "Key Vocabulary").strip() or "Key Vocabulary"
    tgt = _labelize_language(data.get("target_language"))
    expl = _labelize_language(data.get("explanation_language"))
    word_header = f"Word ({tgt})" if tgt else "Word"
    trans_header = f"Translation ({expl})" if expl else "Translation"
    count_label = "word" if len(rows) == 1 else "words"

    thead = (
        "<thead><tr>"
        f"<th>{_escape_html(word_header)}</th>"
        f"<th>{_escape_html(trans_header)}</th>"
        "<th>Example</th>"
        "</tr></thead>"
    )
    body_parts: list[str] = []
    for idx, (word, translation, example) in enumerate(rows):
        row_class = " vocab-row-alt" if idx % 2 == 1 else ""
        body_parts.append(
            "<tr"
            f' class="vocab-row{row_class}">'
            f"<td class=\"vocab-word\">{_escape_html(word)}</td>"
            f"<td class=\"vocab-translation\">{_escape_html(translation)}</td>"
            f"<td class=\"vocab-example\">{_escape_html(example)}</td>"
            "</tr>"
        )
    tbody = "<tbody>" + "".join(body_parts) + "</tbody>"

    html = (
        '<div class="vocab-export">'
        f"<h4>{_escape_html(title)}"
        f'<span class="vocab-count">{len(rows)} {count_label}</span></h4>'
        f'<table class="vocab-table">{thead}{tbody}</table>'
        "</div>"
    )
    return PassageBlock(html=html)


# ── Media blocks (image / audio / video / gif) ──────────────────────────────────
#
# Non-gradable content that renders in the left (passage) panel alongside text.
# Verified shapes:
#   image        ImageBlock.tsx        src = data.src || block.url; alt = data.alt_text || block.label
#   audio_embed  AudioBlock.tsx        src = data.src || block.url; caption, title
#   video_embed  VideoBlock.tsx        src = data.src || block.url; YouTube/Vimeo → iframe embed; caption, title
#   gif          GifAnimationBlock.tsx src = data.src; alt = data.alt_text; caption
#
# URL handling (the offline-safety requirement): resolve_asset_url() leaves
# absolute http(s) URLs and data: URIs untouched (they already work offline),
# and prefixes relative paths (e.g. "/api/v1/static/...") with asset_base_url
# so the exported file loads media from the live server rather than a path
# that only resolves inside the app. Media is linked, never inlined (except
# data: URIs that were already inline in the DB).


def resolve_asset_url(url: str, asset_base_url: str = "") -> str:
    """
    Make a stored media URL absolute so it loads from the exported file.

    - data: URIs (base64/SVG) → returned unchanged (already self-contained).
    - absolute http(s):// URLs → unchanged (CDN/R2 links already work).
    - protocol-relative (//host/...) → unchanged.
    - root-relative (/static/..., /api/...) → prefixed with asset_base_url.
    - bare relative (foo/bar.png) → prefixed with asset_base_url + "/".
    If asset_base_url is empty, relative paths are returned unchanged (best
    effort — the endpoint always supplies it from request.base_url).
    """
    u = (url or "").strip()
    if not u:
        return ""
    if u.startswith("data:") or u.startswith("http://") or u.startswith("https://") or u.startswith("//"):
        return u
    base = (asset_base_url or "").rstrip("/")
    if not base:
        return u
    if u.startswith("/"):
        return base + u
    return base + "/" + u


_YOUTUBE_RE = re.compile(
    r"(?:youtu\.be/|youtube\.com/(?:watch\?v=|embed/|shorts/))([a-zA-Z0-9_-]{11})"
)
_VIMEO_RE = re.compile(r"vimeo\.com/(\d+)")


def _media_src(block: dict) -> str:
    data = block.get("data") or {}
    return str(data.get("src") or block.get("url") or "").strip()


def _media_caption_title(block: dict) -> tuple[str, str]:
    data = block.get("data") or {}
    caption = str(data.get("caption") or "").strip()
    title = str(data.get("title") or block.get("label") or block.get("title") or "").strip()
    return caption, title


def _caption_html(caption: str) -> str:
    return f'<div class="media-caption">{_escape_html(caption)}</div>' if caption else ""


def _title_html(title: str) -> str:
    return f'<div class="media-title">{_escape_html(title)}</div>' if title else ""


def normalise_image_block(block: dict, asset_base_url: str = "") -> Optional[PassageBlock]:
    src = resolve_asset_url(_media_src(block), asset_base_url)
    if not src:
        return None
    data = block.get("data") or {}
    alt = str(data.get("alt_text") or block.get("label") or "Educational illustration")
    caption, title = _media_caption_title(block)
    html = (
        f'{_title_html(title)}'
        f'<figure class="media-figure">'
        f'<img src="{_escape_html(src)}" alt="{_escape_html(alt)}" loading="lazy">'
        f'</figure>'
        f'{_caption_html(caption)}'
    )
    return PassageBlock(html=html)


def normalise_gif_block(block: dict, asset_base_url: str = "") -> Optional[PassageBlock]:
    # A GIF is just an <img> whose file animates — same rendering as image.
    src = resolve_asset_url(_media_src(block), asset_base_url)
    if not src:
        return None
    data = block.get("data") or {}
    alt = str(data.get("alt_text") or block.get("label") or "Animated illustration")
    caption = str(data.get("caption") or "").strip()
    html = (
        f'<figure class="media-figure">'
        f'<img src="{_escape_html(src)}" alt="{_escape_html(alt)}" loading="lazy">'
        f'</figure>'
        f'{_caption_html(caption)}'
    )
    return PassageBlock(html=html)


def normalise_audio_block(block: dict, asset_base_url: str = "") -> Optional[PassageBlock]:
    src = resolve_asset_url(_media_src(block), asset_base_url)
    if not src:
        return None
    caption, title = _media_caption_title(block)
    html = (
        f'{_title_html(title)}'
        f'<audio src="{_escape_html(src)}" controls class="media-audio"></audio>'
        f'{_caption_html(caption)}'
    )
    return PassageBlock(html=html)


def normalise_video_block(block: dict, asset_base_url: str = "") -> Optional[PassageBlock]:
    raw = _media_src(block)
    if not raw:
        return None
    caption, title = _media_caption_title(block)

    yt = _YOUTUBE_RE.search(raw)
    vimeo = _VIMEO_RE.search(raw)
    if yt:
        embed = f"https://www.youtube.com/embed/{yt.group(1)}"
        player = (
            f'<div class="media-embed"><iframe src="{_escape_html(embed)}" '
            f'frameborder="0" allow="accelerometer; autoplay; clipboard-write; '
            f'encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>'
        )
    elif vimeo:
        embed = f"https://player.vimeo.com/video/{vimeo.group(1)}"
        player = (
            f'<div class="media-embed"><iframe src="{_escape_html(embed)}" '
            f'frameborder="0" allow="autoplay; fullscreen; picture-in-picture" '
            f'allowfullscreen></iframe></div>'
        )
    else:
        # Direct video file (mp4/webm) served from CDN or /static.
        src = resolve_asset_url(raw, asset_base_url)
        player = f'<video src="{_escape_html(src)}" controls class="media-video"></video>'

    html = f'{_title_html(title)}{player}{_caption_html(caption)}'
    return PassageBlock(html=html)


def normalise_carousel_block(block: dict, asset_base_url: str = "") -> Optional[PassageBlock]:
    """
    carousel_slides → a simple vertical stack of images with captions. (A true
    swipe carousel would need extra JS; for a self-contained worksheet a
    labelled stack is clearer and printable.)
    """
    data = block.get("data") or {}
    raw_slides = data.get("slides")
    if not isinstance(raw_slides, list):
        raw_slides = []
    parts: list[str] = []
    for s in raw_slides:
        if not isinstance(s, dict):
            continue
        src = resolve_asset_url(str(s.get("url") or s.get("src") or "").strip(), asset_base_url)
        if not src:
            continue
        cap = str(s.get("caption") or "").strip()
        parts.append(
            f'<figure class="media-figure">'
            f'<img src="{_escape_html(src)}" alt="{_escape_html(cap or "Slide")}" loading="lazy">'
            f'</figure>{_caption_html(cap)}'
        )
    if not parts:
        return None
    title = str(block.get("label") or block.get("title") or "").strip()
    return PassageBlock(html=f'{_title_html(title)}<div class="media-carousel">{"".join(parts)}</div>')


def normalise_true_false_block(
    block: dict,
    start_number: int,
    correct_answers: dict[str, Any],
) -> tuple[QuestionGroup, int]:
    """
    Mirror TrueFalseBlock.tsx's normaliseQuestions() exactly: accept both the
    AI-generation shape (prompt/correct_answer) and the editor-saved shape
    (prompt/correct_option_id), plus the statement/question prompt aliases.
    Items with an empty resolved prompt are dropped, same as the frontend.
    """
    data = block.get("data") or {}
    raw_questions = data.get("questions")
    if not isinstance(raw_questions, list):
        raw_questions = []

    questions: list[TrueFalseQuestion] = []
    number = start_number
    for q in raw_questions:
        if not isinstance(q, dict):
            continue
        prompt = str(q.get("prompt") or q.get("statement") or q.get("question") or "")
        if not prompt:
            continue
        raw_answer = q.get("correct_answer")
        if raw_answer is None:
            raw_answer = q.get("correct_option_id")
        if raw_answer is None:
            raw_answer = q.get("answer")
        correct_id = _resolve_tf_correct_id(raw_answer)

        questions.append(TrueFalseQuestion(number=number, prompt=prompt, correct_id=correct_id))
        correct_answers[str(number)] = correct_id
        number += 1

    group = QuestionGroup(
        kind="true_false",
        title=block.get("title") or None,
        true_false_questions=questions,
    )
    return group, number - start_number


def normalise_gap_fill_block(
    block: dict,
    start_number: int,
    correct_answers: dict[str, Any],
) -> tuple[QuestionGroup, int]:
    """
    Walk `segments` in order for type_word_in_gap and drag_to_gap blocks.
    Each {"type": "text"} fragment is emitted verbatim; each {"type": "gap",
    "id": ...} fragment consumes the next question number and is looked up in
    `gaps` for its correct answer. Both kinds share DragToGapData; the export
    renders every gap as a text input (offline-friendly worksheet style).
    """
    data = block.get("data") or {}
    segments = data.get("segments")
    if not isinstance(segments, list):
        segments = []
    gaps = data.get("gaps")
    if not isinstance(gaps, dict):
        gaps = {}

    fragments: list[tuple[str, Any]] = []
    number = start_number
    for seg in segments:
        if not isinstance(seg, dict):
            continue
        seg_type = seg.get("type")
        if seg_type == "text":
            fragments.append(("text", str(seg.get("value") or "")))
        elif seg_type == "gap":
            gap_id = seg.get("id")
            answer = gaps.get(gap_id, "")
            fragments.append(("gap", number))
            correct_answers[str(number)] = normalise_answer_text(answer)
            number += 1

    group = QuestionGroup(
        kind="gap_fill",
        title=data.get("title") or block.get("title") or None,
        gap_fill_block=GapFillBlock(title=data.get("title") or "", fragments=fragments),
    )
    return group, number - start_number


def _mc_draft_to_question(
    draft: dict,
    number: int,
    correct_answers: dict[str, Any],
) -> Optional[MultipleChoiceQuestion]:
    """
    Convert one `multiple_choice` QuestionDraft (as stored inside a
    test_with_timer / test_without_timer block's data.questions) into a
    MultipleChoiceQuestion, writing the answer key into correct_answers.

    Mirrors TestWithTimerBlock.tsx's toRuntimeQuestion()/getQuestionVerdict():
      prompt:  draft.prompt (alias: draft.question — see the editor's
               `raw.prompt ?? raw.question` fallback)
      options: draft.options == [{id, text}]
      correct: draft.correct_option_ids (set-equality grading)
      Also tolerates the legacy `correct_index` shape the runtime block
      itself still normalises (draft without `type`/with `correct_index`).
    Returns None for a draft with no usable prompt or no options.
    """
    prompt = str(draft.get("prompt") or draft.get("question") or "")
    raw_options = draft.get("options")
    if not isinstance(raw_options, list):
        raw_options = []
    options = [
        MultipleChoiceOption(id=str(o.get("id", f"opt_{i}")), text=str(o.get("text", "")))
        for i, o in enumerate(raw_options)
        if isinstance(o, dict)
    ]
    if not prompt or not options:
        return None

    raw_correct = draft.get("correct_option_ids")
    if isinstance(raw_correct, list) and raw_correct:
        correct_ids = [str(c) for c in raw_correct]
    elif "correct_index" in draft:
        # Legacy shape: a single correct_index into the options list.
        idx = draft.get("correct_index")
        try:
            idx = int(idx)
        except (TypeError, ValueError):
            idx = 0
        correct_ids = [options[idx].id] if 0 <= idx < len(options) else [options[0].id]
    else:
        correct_ids = []

    correct_answers[str(number)] = correct_ids[0] if len(correct_ids) == 1 else correct_ids
    return MultipleChoiceQuestion(
        number=number,
        prompt=prompt,
        options=options,
        multi=len(correct_ids) > 1,
    )


def normalise_test_block(
    block: dict,
    start_number: int,
    correct_answers: dict[str, Any],
) -> list[tuple[QuestionGroup, int]]:
    """
    Normalise a test_with_timer / test_without_timer media block.

    IMPORTANT — data source. In the live product these tests are NOT the
    Test → TestQuestion → Question ORM rows; they are media_blocks whose
    questions are stored INLINE at data.questions as a list of
    QuestionDraft dicts (verified against TestWithTimerBlock.tsx /
    TestWithoutTimerBlock.tsx / TestWithTimerEditorPage.tsx). The block's
    `tests[]` summary in _segment_to_dict (id/title/time_limit) is a
    SEPARATE, ORM-backed concept and is not where the questions live for
    these block kinds.

    A single test block can mix question types. For this Tier-1 export we
    support the `multiple_choice` and `true_false` drafts inside it and
    skip Tier-2/3 drafts (cloze/matching/ordering/etc.) gracefully — they
    are out of scope and silently omitted, with question numbering staying
    contiguous across the supported ones.

    Returns a list of (QuestionGroup, consumed) tuples — usually one MC
    group and/or one TF group — so the caller appends each and advances the
    running number. Mixed drafts are bucketed by type while preserving the
    original draft order's numbering.
    """
    data = block.get("data") or {}
    raw_questions = data.get("questions")
    if not isinstance(raw_questions, list):
        raw_questions = []

    title = data.get("title") or block.get("title") or None

    mc_questions: list[MultipleChoiceQuestion] = []
    tf_questions: list[TrueFalseQuestion] = []
    number = start_number

    for draft in raw_questions:
        if not isinstance(draft, dict):
            continue
        dtype = draft.get("type")

        # A draft without an explicit type but with correct_index is a legacy
        # multiple_choice (the runtime block treats it as such).
        if dtype == "multiple_choice" or (dtype is None and "correct_index" in draft):
            mc = _mc_draft_to_question(draft, number, correct_answers)
            if mc is not None:
                mc_questions.append(mc)
                number += 1

        elif dtype == "true_false":
            prompt = str(draft.get("prompt") or draft.get("question") or "")
            if not prompt:
                continue
            correct_id = _resolve_tf_correct_id(
                draft.get("correct_option_id")
                if draft.get("correct_option_id") is not None
                else draft.get("correct_answer")
            )
            tf_questions.append(TrueFalseQuestion(number=number, prompt=prompt, correct_id=correct_id))
            correct_answers[str(number)] = correct_id
            number += 1

        # Tier-2/3 drafts (cloze_input, cloze_drag, matching_pairs,
        # ordering_*, open_answer) are intentionally skipped for v1 — they
        # are out of scope and would need their own partials + grader paths.

    groups: list[tuple[QuestionGroup, int]] = []
    if mc_questions:
        groups.append((
            QuestionGroup(kind="multiple_choice", title=title, multiple_choice_questions=mc_questions),
            len(mc_questions),
        ))
    if tf_questions:
        # TF drafts inside a test block render with the same TF partial as
        # standalone true_false media blocks — reusing one renderer/grader.
        groups.append((
            QuestionGroup(kind="true_false", title=None, true_false_questions=tf_questions),
            len(tf_questions),
        ))
    return groups

# ── Tier-2 normalizers ──────────────────────────────────────────────────────────
#
# All Tier-2 blocks may store their question either nested under data.question
# (editor-saved) or in a flat top-level shape (unit-generator / AI). Each
# normaliser resolves both, exactly like the corresponding *Block.tsx's
# resolveQuestion(). One block == one question == one global question number
# (the whole arrangement is graded as a single right/wrong, mirroring the
# in-app all-or-nothing check).


def _coerce_items(raw: Any) -> list[dict]:
    """Filter a raw list down to {id, text} dicts with string ids."""
    out: list[dict] = []
    if not isinstance(raw, list):
        return out
    for it in raw:
        if isinstance(it, dict) and it.get("id") is not None:
            out.append({"id": str(it["id"]), "text": str(it.get("text", ""))})
    return out


def normalise_order_paragraphs_block(
    block: dict,
    start_number: int,
    correct_answers: dict[str, Any],
) -> tuple[Optional[QuestionGroup], int]:
    """
    order_paragraphs → one OrderQuestion (no group rows).

    Resolution mirrors OrderParagraphsBlock.tsx's resolveQuestion():
      nested:  data.question = {items:[{id,text}], correct_order:[ids]}
      flat:    data.items = [{id, text, correct_order: int}]  (sorted asc)
    Correct = arranged order matches correct_order exactly.
    """
    data = block.get("data") or {}
    question = data.get("question") if isinstance(data.get("question"), dict) else None

    if question:
        items = _coerce_items(question.get("items"))
        correct_order = [str(i) for i in (question.get("correct_order") or [])]
    else:
        raw_items = data.get("items")
        if not isinstance(raw_items, list):
            raw_items = []
        sortable = [i for i in raw_items if isinstance(i, dict) and i.get("id") is not None]
        sortable.sort(key=lambda i: i.get("correct_order", 0))
        items = [{"id": str(i["id"]), "text": str(i.get("text", ""))} for i in sortable]
        correct_order = [str(i["id"]) for i in sortable]

    # If correct_order is empty but we have items, fall back to item order.
    if not correct_order and items:
        correct_order = [i["id"] for i in items]
    if len(items) < 2 or not correct_order:
        return None, 0

    number = start_number
    correct_answers[str(number)] = {"kind": "order", "order": correct_order}
    group = QuestionGroup(
        kind="order",
        title=data.get("title") or block.get("title") or None,
        order_questions=[OrderQuestion(
            number=number,
            prompt=data.get("title") or block.get("title") or "Put the paragraphs in the correct order.",
            items=[OrderItem(id=i["id"], text=i["text"]) for i in items],
            correct_order=correct_order,
            group_sizes=[],
        )],
    )
    return group, 1


def normalise_build_sentence_block(
    block: dict,
    start_number: int,
    correct_answers: dict[str, Any],
) -> tuple[Optional[QuestionGroup], int]:
    """
    build_sentence → one OrderQuestion, optionally segmented into rows.

    Resolution mirrors BuildSentenceBlock.tsx:
      nested:  data.question = ordering_words draft
                 {tokens:[{id,text}], correct_order:[ids],
                  metadata.sentence_groups:[[ids],...]}
      legacy:  data.sentences = [{words:[...]}]  → tokens ids tok_{s}_{w}
    Correct = arranged order matches correct_order; group rows define where
    sentences break (each row is its own word bank in-app, but for export
    grading the whole order is what matters).
    """
    data = block.get("data") or {}
    question = data.get("question") if isinstance(data.get("question"), dict) else None

    items: list[dict] = []
    correct_order: list[str] = []
    group_sizes: list[int] = []

    if question and question.get("tokens"):
        items = _coerce_items(question.get("tokens"))
        correct_order = [str(i) for i in (question.get("correct_order") or [])]
        meta = question.get("metadata") or {}
        groups = meta.get("sentence_groups")
        if isinstance(groups, list):
            group_sizes = [len(g) for g in groups if isinstance(g, list) and g]
    else:
        sentences = data.get("sentences")
        if isinstance(sentences, list):
            for s_idx, sent in enumerate(sentences):
                if not isinstance(sent, dict):
                    continue
                words = sent.get("words")
                if not isinstance(words, list):
                    continue
                row_len = 0
                for w_idx, word in enumerate(words):
                    tid = f"tok_{s_idx}_{w_idx}"
                    items.append({"id": tid, "text": str(word)})
                    correct_order.append(tid)
                    row_len += 1
                if row_len:
                    group_sizes.append(row_len)

    if not correct_order and items:
        correct_order = [i["id"] for i in items]
    if len(items) < 2 or not correct_order:
        return None, 0

    number = start_number
    correct_answers[str(number)] = {"kind": "order", "order": correct_order}
    group = QuestionGroup(
        kind="order",
        title=data.get("title") or block.get("title") or None,
        order_questions=[OrderQuestion(
            number=number,
            prompt=data.get("title") or block.get("title") or "Put the words in the correct order.",
            items=[OrderItem(id=i["id"], text=i["text"]) for i in items],
            correct_order=correct_order,
            group_sizes=group_sizes,
        )],
    )
    return group, 1


def normalise_sort_into_columns_block(
    block: dict,
    start_number: int,
    correct_answers: dict[str, Any],
) -> tuple[Optional[QuestionGroup], int]:
    """
    sort_into_columns → one SortQuestion.

    Resolution mirrors SortIntoColumnsBlock.tsx:
      nested:  data.question = ordering_words draft with
                 metadata.sentence_groups (one group per column, token ids)
                 + metadata.column_titles
      raw:     data.columns = [{title, words:[...]}]  → ids sic_{col}_{word}
    Correct = each item placed in its designated column (per-column membership;
    within-column order is NOT graded, matching the in-app check).
    """
    data = block.get("data") or {}
    question = data.get("question") if isinstance(data.get("question"), dict) else None

    items: list[dict] = []
    columns: list[SortColumn] = []

    if question and question.get("tokens"):
        items = _coerce_items(question.get("tokens"))
        meta = question.get("metadata") or {}
        groups = meta.get("sentence_groups")
        titles = meta.get("column_titles")
        titles = titles if isinstance(titles, list) else []
        if isinstance(groups, list):
            for c_idx, group in enumerate(groups):
                if not isinstance(group, list):
                    continue
                ids = [str(g) for g in group]
                title = str(titles[c_idx]) if c_idx < len(titles) else f"Column {c_idx + 1}"
                if ids:
                    columns.append(SortColumn(title=title, item_ids=ids))
    else:
        raw_columns = data.get("columns")
        if isinstance(raw_columns, list):
            for c_idx, col in enumerate(raw_columns):
                if not isinstance(col, dict):
                    continue
                words = col.get("words")
                if not isinstance(words, list):
                    continue
                ids: list[str] = []
                for w_idx, word in enumerate(words):
                    tid = f"sic_{c_idx}_{w_idx}"
                    items.append({"id": tid, "text": str(word)})
                    ids.append(tid)
                title = str(col.get("title") or f"Column {c_idx + 1}")
                if ids:
                    columns.append(SortColumn(title=title, item_ids=ids))

    # Need at least 2 columns and some items to be a meaningful exercise.
    if len(columns) < 2 or len(items) < 2:
        return None, 0

    # Answer key: item_id → column index.
    col_of: dict[str, int] = {}
    for c_idx, col in enumerate(columns):
        for iid in col.item_ids:
            col_of[iid] = c_idx

    number = start_number
    correct_answers[str(number)] = {"kind": "sort", "columns": col_of}
    group = QuestionGroup(
        kind="sort",
        title=data.get("title") or block.get("title") or None,
        sort_questions=[SortQuestion(
            number=number,
            prompt=data.get("title") or block.get("title") or "Sort each item into the correct column.",
            items=[OrderItem(id=i["id"], text=i["text"]) for i in items],
            columns=columns,
        )],
    )
    return group, 1


def normalise_match_pairs_block(
    block: dict,
    start_number: int,
    correct_answers: dict[str, Any],
) -> tuple[Optional[QuestionGroup], int]:
    """
    match_pairs → one MatchQuestion.

    Resolution mirrors MatchPairsBlock.tsx:
      nested:  data.question = {left_items, right_items, pairs:[{left_id,right_id}]}
      flat:    data.left_items / data.right_items / data.pairs
    Correct = every left item linked to its designated right item.
    """
    data = block.get("data") or {}
    question = data.get("question") if isinstance(data.get("question"), dict) else None
    source = question if (question and question.get("left_items")) else data

    left_items = _coerce_items(source.get("left_items"))
    right_items = _coerce_items(source.get("right_items"))

    raw_pairs = source.get("pairs")
    pairs: dict[str, str] = {}
    if isinstance(raw_pairs, list):
        for p in raw_pairs:
            if not isinstance(p, dict):
                continue
            lid = p.get("left_id") if p.get("left_id") is not None else p.get("left")
            rid = p.get("right_id") if p.get("right_id") is not None else p.get("right")
            if lid is not None and rid is not None:
                pairs[str(lid)] = str(rid)

    if len(left_items) < 2 or len(right_items) < 2 or not pairs:
        return None, 0

    number = start_number
    correct_answers[str(number)] = {"kind": "match", "pairs": pairs}
    group = QuestionGroup(
        kind="match",
        title=data.get("title") or block.get("title") or None,
        match_questions=[MatchQuestion(
            number=number,
            prompt=data.get("title") or block.get("title") or "Match each item on the left with its pair on the right.",
            left_items=[MatchItem(id=i["id"], text=i["text"]) for i in left_items],
            right_items=[MatchItem(id=i["id"], text=i["text"]) for i in right_items],
            pairs=pairs,
        )],
    )
    return group, 1