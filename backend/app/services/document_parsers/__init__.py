"""
app/services/document_parsers
==============================
Document parsers for RAG ingestion.

Usage — auto-detect by filename:

    from app.services.document_parsers import get_parser

    parser = get_parser("lecture.pdf")
    doc    = parser.parse(file_bytes, filename="lecture.pdf")
    print(doc.text)      # clean plain text
    print(doc.title)     # extracted title

Supported formats
-----------------
  .pdf   → PDFParser   (PyMuPDF)
  .vtt   → SubtitleParser
  .srt   → SubtitleParser
  .docx  → DocxParser  (python-docx)
"""
from __future__ import annotations

from app.services.document_parsers.base import BaseParser, ParsedDocument, ParserError
from app.services.document_parsers.pdf_parser import PDFParser
from app.services.document_parsers.subtitle_parser import SubtitleParser
from app.services.document_parsers.docx_parser import DocxParser

__all__ = [
    "BaseParser",
    "ParsedDocument",
    "ParserError",
    "PDFParser",
    "SubtitleParser",
    "DocxParser",
    "get_parser",
    "SUPPORTED_EXTENSIONS",
]

# Registry — order matters: first match wins
_REGISTRY: list[BaseParser] = [
    PDFParser(),
    SubtitleParser(),
    DocxParser(),
]

SUPPORTED_EXTENSIONS: set[str] = {
    ext
    for parser in _REGISTRY
    for ext in parser.supported_extensions
}


def get_parser(filename: str, mimetype: str = "") -> BaseParser:
    """
    Return the right parser for *filename*.

    Raises
    ------
    ParserError
        If no parser supports the given file type.
    """
    for parser in _REGISTRY:
        if parser.can_handle(filename, mimetype):
            return parser

    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "unknown"
    raise ParserError(
        f"No parser available for '.{ext}' files. "
        f"Supported: {sorted(SUPPORTED_EXTENSIONS)}"
    )