"""
Base classes and exceptions for document parsers.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Optional


@dataclass
class ParsedDocument:
    """
    Result of parsing a document file.

    Attributes
    ----------
    text : str
        Clean plain text extracted from the document.
    title : str, optional
        Document title (from metadata or inferred from filename).
    page_count : int, optional
        Number of pages/slides (if applicable).
    language : str, optional
        Detected or specified language code (e.g., 'it', 'en').
    extra : dict
        Additional metadata (source_type, filename, etc.).
    """
    text: str
    title: Optional[str] = None
    page_count: Optional[int] = None
    language: Optional[str] = None
    extra: dict[str, Any] = field(default_factory=dict)


class ParserError(Exception):
    """Raised when a parser cannot handle a file or encounters an error."""
    pass


class BaseParser(ABC):
    """
    Abstract base class for document parsers.

    Each parser must declare:
      - supported_mimetypes : tuple[str, ...]
      - supported_extensions : tuple[str, ...]

    And implement:
      - parse(data: bytes, filename: str = "") -> ParsedDocument
    """

    supported_mimetypes: tuple[str, ...] = ()
    supported_extensions: tuple[str, ...] = ()

    def can_handle(self, filename: str, mimetype: str = "") -> bool:
        """
        Check if this parser can handle the given file.

        Parameters
        ----------
        filename : str
            File name (used to extract extension).
        mimetype : str, optional
            MIME type if known (e.g., from Content-Type header).

        Returns
        -------
        bool
            True if this parser supports the file type.
        """
        # Check by extension
        if "." in filename:
            ext = filename.rsplit(".", 1)[-1].lower()
            if ext in self.supported_extensions:
                return True

        # Check by MIME type
        if mimetype:
            mimetype_lower = mimetype.lower().split(";")[0].strip()
            if mimetype_lower in self.supported_mimetypes:
                return True

        return False

    @abstractmethod
    def parse(self, data: bytes, filename: str = "") -> ParsedDocument:
        """
        Extract text and metadata from a document file.

        Parameters
        ----------
        data : bytes
            Raw file contents.
        filename : str, optional
            Original filename (for error messages and title inference).

        Returns
        -------
        ParsedDocument
            Extracted text and metadata.

        Raises
        ------
        ParserError
            If the file cannot be parsed (wrong format, corrupted, etc.).
        """
        pass
