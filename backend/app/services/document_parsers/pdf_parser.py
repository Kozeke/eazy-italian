"""
PDF parser — extracts plain text from PDF files.

Uses PyMuPDF (fitz) — fast, no Java, handles embedded fonts well.
Falls back to pdfplumber for complex column layouts if needed.

Install:
    pip install pymupdf          # fitz
    pip install pdfplumber       # optional fallback
"""
from __future__ import annotations

import io
import re
from typing import Optional

from app.services.document_parsers.base import BaseParser, ParsedDocument, ParserError


class PDFParser(BaseParser):
    """
    Extracts text from PDF files page by page.

    Each page's text is joined with a blank line so the downstream
    paragraph-aware chunker can treat page breaks as natural boundaries.

    Parameters
    ----------
    preserve_page_breaks : bool
        Insert '--- Page N ---' markers between pages.
        Useful so section-context chunker knows where pages end.
    min_page_chars : int
        Pages with fewer chars are considered blank/image-only and skipped.
    """

    supported_mimetypes  = ("application/pdf",)
    supported_extensions = ("pdf",)

    def __init__(
        self,
        preserve_page_breaks: bool = True,
        min_page_chars: int = 20,
    ) -> None:
        self.preserve_page_breaks = preserve_page_breaks
        self.min_page_chars       = min_page_chars

    def parse(self, data: bytes, filename: str = "") -> ParsedDocument:
        try:
            import fitz  # PyMuPDF
        except ImportError as exc:
            raise ParserError(
                "PyMuPDF is required: pip install pymupdf"
            ) from exc

        try:
            doc = fitz.open(stream=data, filetype="pdf")
        except Exception as exc:
            raise ParserError(f"Cannot open PDF '{filename}': {exc}") from exc

        page_count  = doc.page_count
        title       = doc.metadata.get("title", "") or _infer_title(filename)
        raw_pages   = []

        for page_num, page in enumerate(doc, start=1):
            page_text = page.get_text("text")          # raw text with newlines
            page_text = _clean_page_text(page_text)

            if len(page_text) < self.min_page_chars:
                continue                                 # skip blank/image pages

            if self.preserve_page_breaks:
                raw_pages.append(f"--- Page {page_num} ---\n\n{page_text}")
            else:
                raw_pages.append(page_text)

        if not raw_pages:
            raise ParserError(
                f"PDF '{filename}' contains no extractable text "
                "(may be a scanned image — consider adding OCR)."
            )

        full_text = "\n\n".join(raw_pages)
        doc.close()

        return ParsedDocument(
            text       = full_text,
            title      = title,
            page_count = page_count,
            extra      = {"source_type": "pdf", "filename": filename},
        )


# ── helpers ───────────────────────────────────────────────────────────────────

def _clean_page_text(text: str) -> str:
    """Remove ligature artifacts, excessive whitespace, and form-feed chars."""
    text = text.replace("\f", "\n")        # form feed → newline
    text = text.replace("\ufb01", "fi")    # ﬁ ligature
    text = text.replace("\ufb02", "fl")    # ﬂ ligature
    # Collapse runs of 3+ blank lines into 2
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _infer_title(filename: str) -> str:
    """Derive a readable title from the filename."""
    name = filename.rsplit(".", 1)[0] if "." in filename else filename
    name = re.sub(r"[_\-]+", " ", name)
    return name.strip().title()