"""
app/services/document_parsers/image_parser.py
==============================================
Image parser — extracts text from JPG / JPEG / PNG files
using Anthropic's vision API (claude-sonnet).

Install:
    pip install anthropic

Environment:
    ANTHROPIC_API_KEY=sk-ant-...

Falls back with a helpful ParserError if the SDK is not installed
or the API key is missing.
"""
from __future__ import annotations

import base64
import logging
import os
import re
from typing import Optional

from app.services.document_parsers.base import BaseParser, ParsedDocument, ParserError

logger = logging.getLogger(__name__)

_VISION_MODEL   = "claude-sonnet-4-20250514"
_MAX_TOKENS     = 4096
_DEFAULT_TIMEOUT = 60.0

# ── Extraction prompt ─────────────────────────────────────────────────────────

_EXTRACTION_PROMPT = """\
You are a precise document-to-text extractor.
Look at this image and transcribe ALL visible text faithfully.

Rules:
- Preserve the logical reading order (top → bottom, left → right).
- Keep paragraph breaks as blank lines.
- If the image contains a table, represent each row on its own line,
  separating cells with " | ".
- If the image shows an exercise or worksheet, include both the instructions
  and every word / sentence visible — do NOT skip anything.
- Do NOT add commentary, headings, or explanations that are not in the image.
- Output ONLY the extracted text. No markdown fences. No preamble."""


class ImageParser(BaseParser):
    """
    Extracts text from raster images (JPG, JPEG, PNG) via Anthropic vision.

    Parameters
    ----------
    api_key : str, optional
        Anthropic API key.  Falls back to ANTHROPIC_API_KEY env-var.
    model : str
        Vision-capable Anthropic model to use.
    max_tokens : int
        Maximum tokens in the extraction response.
    timeout : float
        HTTP timeout in seconds.
    """

    supported_mimetypes  = (
        "image/jpeg",
        "image/jpg",
        "image/png",
    )
    supported_extensions = ("jpg", "jpeg", "png")

    def __init__(
        self,
        api_key:    Optional[str] = None,
        model:      str   = _VISION_MODEL,
        max_tokens: int   = _MAX_TOKENS,
        timeout:    float = _DEFAULT_TIMEOUT,
    ) -> None:
        self.api_key    = api_key or os.environ.get("ANTHROPIC_API_KEY", "")
        self.model      = model
        self.max_tokens = max_tokens
        self.timeout    = timeout

    # ── BaseParser interface ──────────────────────────────────────────────────

    def parse(self, data: bytes, filename: str = "") -> ParsedDocument:
        """
        Send the image to Anthropic vision and return the extracted text.

        Parameters
        ----------
        data : bytes
            Raw image bytes (JPG or PNG).
        filename : str
            Original filename — used for title inference and media_type detection.

        Returns
        -------
        ParsedDocument
            Extracted text and metadata.

        Raises
        ------
        ParserError
            If the SDK is missing, the API key is absent, or the call fails.
        """
        if not self.api_key:
            raise ParserError(
                "ANTHROPIC_API_KEY is not set. "
                "Image parsing requires the Anthropic API. "
                "Set the environment variable and restart the server."
            )

        try:
            import anthropic  # noqa: PLC0415
        except ImportError as exc:
            raise ParserError(
                "The 'anthropic' package is required for image parsing. "
                "Install it with: pip install anthropic"
            ) from exc

        media_type = _media_type_for(filename)
        b64_image  = base64.standard_b64encode(data).decode("ascii")

        logger.info(
            "ImageParser: sending %s (%d bytes, media_type=%s) to %s",
            filename or "<unknown>", len(data), media_type, self.model,
        )

        try:
            client = anthropic.Anthropic(
                api_key=self.api_key,
                timeout=self.timeout,
            )
            message = client.messages.create(
                model=self.model,
                max_tokens=self.max_tokens,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type":   "image",
                                "source": {
                                    "type":       "base64",
                                    "media_type": media_type,
                                    "data":       b64_image,
                                },
                            },
                            {
                                "type": "text",
                                "text": _EXTRACTION_PROMPT,
                            },
                        ],
                    }
                ],
            )
        except anthropic.APIConnectionError as exc:
            raise ParserError(
                f"Could not connect to Anthropic API: {exc}"
            ) from exc
        except anthropic.AuthenticationError as exc:
            raise ParserError(
                "Anthropic API key is invalid or expired."
            ) from exc
        except anthropic.RateLimitError as exc:
            raise ParserError(
                "Anthropic rate limit exceeded. Please retry in a moment."
            ) from exc
        except Exception as exc:
            raise ParserError(
                f"Anthropic vision call failed for '{filename}': {exc}"
            ) from exc

        # Extract the text content block
        raw_text = ""
        for block in message.content:
            if hasattr(block, "text"):
                raw_text += block.text

        raw_text = raw_text.strip()
        if not raw_text:
            raise ParserError(
                f"Anthropic vision returned no text for '{filename}'. "
                "The image may be blank or unreadable."
            )

        # Light cleanup — collapse 3+ blank lines
        cleaned = re.sub(r"\n{3,}", "\n\n", raw_text)

        title = _infer_title(filename)
        logger.info(
            "ImageParser: extracted %d chars from '%s'",
            len(cleaned), filename or "<unknown>",
        )

        return ParsedDocument(
            text       = cleaned,
            title      = title,
            page_count = 1,
            extra      = {
                "source_type": "image",
                "filename":    filename,
                "model":       self.model,
            },
        )


# ── helpers ───────────────────────────────────────────────────────────────────

def _media_type_for(filename: str) -> str:
    """Return the Anthropic-accepted media_type string for an image filename."""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    return {
        "jpg":  "image/jpeg",
        "jpeg": "image/jpeg",
        "png":  "image/png",
    }.get(ext, "image/jpeg")   # safe default


def _infer_title(filename: str) -> str:
    """Derive a readable title from the filename (strip extension, humanise)."""
    name = filename.rsplit(".", 1)[0] if "." in filename else filename
    name = re.sub(r"[_\-]+", " ", name)
    return name.strip().title()