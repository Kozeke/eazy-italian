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
  JPG/JPEG/PNG → ImageParser  (anthropic vision)
"""
from __future__ import annotations

import logging

from app.services.document_parsers.base import BaseParser, ParsedDocument, ParserError

logger = logging.getLogger(__name__)
from app.services.document_parsers.pdf_parser import PDFParser
from app.services.document_parsers.subtitle_parser import SubtitleParser
from app.services.document_parsers.docx_parser import DocxParser
from app.services.document_parsers.image_parser import ImageParser

__all__ = [
    "BaseParser",
    "ParsedDocument",
    "ParserError",
    "PDFParser",
    "SubtitleParser",
    "DocxParser",
    "get_parser",
    "SUPPORTED_EXTENSIONS",
    "ImageParser",
]

# Registry — order matters: first match wins
_REGISTRY: list[BaseParser] = [
    PDFParser(),
    SubtitleParser(),
    DocxParser(),
    ImageParser(),
]

SUPPORTED_EXTENSIONS: set[str] = {
    ext
    for parser in _REGISTRY
    for ext in parser.supported_extensions
}


def get_parser(filename: str, mimetype: str = "") -> BaseParser:
    """
    Return the appropriate parser for the given file.
 
    Parameters
    ----------
    filename : str
        Original filename (extension is the primary dispatch key).
    mimetype : str, optional
        MIME type hint from the HTTP Content-Type header.
 
    Returns
    -------
    BaseParser
        A parser instance capable of handling the file.
 
    Raises
    ------
    ParserError
        If no registered parser supports the file type.
    """
    for parser in _REGISTRY:
        if parser.can_handle(filename, mimetype):
            logger.debug(
                "get_parser: '%s' (mime=%r) → %s",
                filename, mimetype, type(parser).__name__,
            )
            return parser
 
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "(none)"
    raise ParserError(
        f"No parser available for file type '.{ext}' "
        f"(filename={filename!r}, mimetype={mimetype!r}). "
        "Supported types: pdf, docx, vtt, srt, jpg, jpeg, png."
    )