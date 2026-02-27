"""
Subtitle parser — handles WebVTT (.vtt) and SubRip (.srt) files.

Strips all timestamps, cue identifiers, and formatting tags,
then groups cues into larger semantic blocks (by silence gaps or
a configurable sentence count) so the downstream chunker gets
meaningful segments rather than 3-word fragments.

Install: no extra dependencies — pure stdlib regex.
"""
from __future__ import annotations

import re
from typing import List, Tuple

from app.services.document_parsers.base import BaseParser, ParsedDocument, ParserError


class SubtitleParser(BaseParser):
    """
    Converts VTT / SRT subtitle files into clean prose text.

    Parameters
    ----------
    merge_window_sec : float
        Cues within this many seconds of each other are joined into
        the same paragraph.  Large gaps (> merge_window_sec) become
        blank-line breaks, which the chunker treats as paragraph boundaries.
    min_cue_chars : int
        Cues shorter than this (e.g. "[Music]", "(applause)") are dropped.
    """

    supported_mimetypes  = ("text/vtt", "text/x-subrip", "application/x-subrip")
    supported_extensions = ("vtt", "srt")

    def __init__(
        self,
        merge_window_sec: float = 3.0,
        min_cue_chars:    int   = 5,
    ) -> None:
        self.merge_window_sec = merge_window_sec
        self.min_cue_chars    = min_cue_chars

    def parse(self, data: bytes, filename: str = "") -> ParsedDocument:
        try:
            text = data.decode("utf-8-sig")      # handles BOM
        except UnicodeDecodeError:
            text = data.decode("latin-1", errors="replace")

        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

        if ext == "vtt" or text.strip().startswith("WEBVTT"):
            cues = _parse_vtt(text)
        else:
            cues = _parse_srt(text)

        if not cues:
            raise ParserError(
                f"No subtitle cues found in '{filename}'. "
                "Check that the file is a valid VTT or SRT."
            )

        # Filter noise cues
        cues = [
            (start, end, txt) for start, end, txt in cues
            if len(txt) >= self.min_cue_chars
        ]

        # Merge close cues into paragraphs
        paragraphs = _merge_cues(cues, self.merge_window_sec)

        duration_sec = cues[-1][1] if cues else None
        title        = _infer_title(filename)
        full_text    = "\n\n".join(paragraphs)

        return ParsedDocument(
            text         = full_text,
            title        = title,
            duration_sec = duration_sec,
            extra        = {
                "source_type": "subtitle",
                "filename":    filename,
                "cue_count":   len(cues),
            },
        )


# ── VTT parser ────────────────────────────────────────────────────────────────

_VTT_TIMESTAMP = re.compile(
    r"(\d{1,2}:)?\d{2}:\d{2}[.,]\d{3}\s*-->\s*(\d{1,2}:)?\d{2}:\d{2}[.,]\d{3}"
)
_VTT_TAG       = re.compile(r"<[^>]+>")
_VTT_NOTE      = re.compile(r"^NOTE\b", re.MULTILINE)


def _parse_vtt(text: str) -> List[Tuple[float, float, str]]:
    cues   = []
    blocks = re.split(r"\n{2,}", text)

    for block in blocks:
        lines = block.strip().splitlines()
        ts_line = next((l for l in lines if _VTT_TIMESTAMP.search(l)), None)
        if ts_line is None:
            continue

        match = _VTT_TIMESTAMP.search(ts_line)
        parts = re.split(r"\s*-->\s*", ts_line[match.start():match.end()])
        start = _ts_to_sec(parts[0].strip())
        end   = _ts_to_sec(parts[1].strip())

        # Text lines are after the timestamp line
        ts_idx    = lines.index(ts_line)
        cue_lines = lines[ts_idx + 1:]
        raw_text  = " ".join(
            _VTT_TAG.sub("", ln).strip()
            for ln in cue_lines
            if ln.strip() and not _VTT_TIMESTAMP.search(ln)
        ).strip()

        if raw_text:
            cues.append((start, end, raw_text))

    return cues


# ── SRT parser ────────────────────────────────────────────────────────────────

_SRT_TIMESTAMP = re.compile(
    r"(\d{2}:\d{2}:\d{2}[,\.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,\.]\d{3})"
)
_SRT_TAG = re.compile(r"<[^>]+>|\{[^}]+\}")


def _parse_srt(text: str) -> List[Tuple[float, float, str]]:
    cues   = []
    blocks = re.split(r"\n{2,}", text.strip())

    for block in blocks:
        lines = block.strip().splitlines()
        if not lines:
            continue

        ts_line = next((l for l in lines if _SRT_TIMESTAMP.search(l)), None)
        if ts_line is None:
            continue

        m     = _SRT_TIMESTAMP.search(ts_line)
        start = _ts_to_sec(m.group(1))
        end   = _ts_to_sec(m.group(2))

        ts_idx    = lines.index(ts_line)
        cue_lines = [l for l in lines[ts_idx + 1:] if l.strip()]
        raw_text  = " ".join(_SRT_TAG.sub("", ln).strip() for ln in cue_lines).strip()

        if raw_text:
            cues.append((start, end, raw_text))

    return cues


# ── helpers ───────────────────────────────────────────────────────────────────

def _ts_to_sec(ts: str) -> float:
    """Convert 'HH:MM:SS,mmm' or 'MM:SS.mmm' to float seconds."""
    ts = ts.replace(",", ".")
    parts = ts.split(":")
    parts = [float(p) for p in parts]
    if len(parts) == 3:
        return parts[0] * 3600 + parts[1] * 60 + parts[2]
    elif len(parts) == 2:
        return parts[0] * 60 + parts[1]
    return float(parts[0])


def _merge_cues(
    cues: List[Tuple[float, float, str]],
    window_sec: float,
) -> List[str]:
    """
    Group consecutive cues into paragraphs.
    A new paragraph starts when the gap to the next cue > window_sec.
    """
    if not cues:
        return []

    paragraphs: List[str] = []
    current_parts: List[str] = [cues[0][2]]
    prev_end = cues[0][1]

    for start, end, txt in cues[1:]:
        gap = start - prev_end
        if gap > window_sec:
            paragraphs.append(" ".join(current_parts))
            current_parts = [txt]
        else:
            current_parts.append(txt)
        prev_end = end

    if current_parts:
        paragraphs.append(" ".join(current_parts))

    return [p.strip() for p in paragraphs if p.strip()]


def _infer_title(filename: str) -> str:
    name = filename.rsplit(".", 1)[0] if "." in filename else filename
    name = re.sub(r"[_\-]+", " ", name)
    return name.strip().title()