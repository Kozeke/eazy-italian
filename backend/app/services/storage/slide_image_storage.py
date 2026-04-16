"""
app/services/storage/slide_image_storage.py
============================================
SlideImageStorage — uploads a generated slide image to MinIO and
returns a permanent public URL.

Responsibilities
----------------
1. Accept either an ImageResult (from image generation pipeline) or a
   raw data URI string (already in memory from the SSE stream).
2. Decode the image bytes.
3. Upload to MinIO under a deterministic, collision-free key.
4. Return the public HTTP URL — short enough to store in VARCHAR(500).

Object key scheme
-----------------
    slide-images/{presentation_id}/{slide_index}.{ext}

Example:
    slide-images/42/03.png
    slide-images/42/03.svg

Using the presentation + slide index makes keys deterministic:
re-saving the same slide overwrites the previous image rather than
accumulating orphaned objects.  If you need versioning, append a
timestamp or UUID.

Returned URL format
-------------------
The URL is built from the MINIO_ENDPOINT env-var so it works in both
Docker (minio:9000) and local dev (localhost:9000).

    http://minio:9000/eazy-italian/slide-images/42/03.png

The frontend can reference this directly — the bucket has public-read
policy applied by minio_client.py.

Usage
-----
    from app.services.storage.slide_image_storage import SlideImageStorage

    storage = SlideImageStorage()
    url = await storage.upload_from_data_uri(
        data_uri        = slide.image,          # "data:image/png;base64,..."
        presentation_id = pres.id,
        slide_index     = 3,
    )
    # url = "http://minio:9000/eazy-italian/slide-images/42/03.png"
"""

from __future__ import annotations

import base64
import io
import logging
import os
import urllib.parse
from typing import Optional

from minio.error import S3Error

from app.services.storage.minio_client import get_minio_client, _bucket_name

logger = logging.getLogger(__name__)


class SlideImageStorage:
    """
    Handles uploading slide images to MinIO and returning public URLs.

    Stateless — safe to instantiate per-request or as a singleton.
    """

    # Content-type map for each format we support
    _CONTENT_TYPES: dict[str, str] = {
        "svg":  "image/svg+xml",
        "png":  "image/png",
        "jpeg": "image/jpeg",
        "jpg":  "image/jpeg",
        "webp": "image/webp",
    }

    def upload_from_data_uri(
        self,
        data_uri:        str,
        presentation_id: int,
        slide_index:     int,
    ) -> Optional[str]:
        """
        Parse a data URI, upload the image to MinIO, and return its public URL.

        Parameters
        ----------
        data_uri
            A string like "data:image/png;base64,/9j/..." or
            "data:image/svg+xml;charset=utf-8,%3Csvg...".
        presentation_id
            Used to build the object key path.
        slide_index
            0-based slide index, zero-padded to 2 digits in the key.

        Returns
        -------
        str or None
            Public URL on success, None on any failure (caller falls back
            to storing the data URI or None).
        """
        try:
            fmt, data_bytes = self._decode_data_uri(data_uri)
            object_key      = self._make_key(presentation_id, slide_index, fmt)
            content_type    = self._CONTENT_TYPES.get(fmt, "application/octet-stream")

            client = get_minio_client()
            bucket = _bucket_name()

            client.put_object(
                bucket_name  = bucket,
                object_name  = object_key,
                data         = io.BytesIO(data_bytes),
                length       = len(data_bytes),
                content_type = content_type,
            )

            url = self._build_url(bucket, object_key)
            logger.debug(
                "Slide image uploaded — key=%s size=%d url=%s",
                object_key, len(data_bytes), url,
            )
            return url

        except S3Error as exc:
            logger.error(
                "MinIO upload failed for presentation=%d slide=%d: %s",
                presentation_id, slide_index, exc,
            )
            return None
        except ValueError as exc:
            # Malformed data URI — log and skip
            logger.warning(
                "Could not parse data URI for presentation=%d slide=%d: %s",
                presentation_id, slide_index, exc,
            )
            return None
        except Exception as exc:
            logger.error(
                "Unexpected error uploading slide image: %s", exc, exc_info=True
            )
            return None

    # ── Private helpers ────────────────────────────────────────────────────────

    @staticmethod
    def _decode_data_uri(data_uri: str) -> tuple[str, bytes]:
        """
        Parse a data URI into (format_ext, raw_bytes).

        Supports:
            data:image/png;base64,<b64data>
            data:image/svg+xml;base64,<b64data>
            data:image/svg+xml;charset=utf-8,<url_encoded_svg>

        Returns
        -------
        (ext, bytes)
            ext is "png", "jpeg", "webp", or "svg"

        Raises
        ------
        ValueError if the string is not a recognised data URI.
        """
        if not data_uri or not data_uri.startswith("data:"):
            raise ValueError(f"Not a data URI: {data_uri[:40]!r}")

        # Split off the header: "data:image/png;base64" vs data
        header, _, payload = data_uri.partition(",")
        if not payload:
            raise ValueError("Data URI has no payload after comma")

        # Parse media type from header
        # header looks like "data:image/png;base64" or "data:image/svg+xml;charset=utf-8"
        meta = header[5:]  # strip "data:"
        parts = meta.split(";")
        mime  = parts[0].strip().lower()    # e.g. "image/png"
        encoding = parts[1].strip().lower() if len(parts) > 1 else "base64"

        # Map MIME → extension
        mime_to_ext = {
            "image/png":      "png",
            "image/jpeg":     "jpeg",
            "image/jpg":      "jpeg",
            "image/webp":     "webp",
            "image/svg+xml":  "svg",
        }
        ext = mime_to_ext.get(mime)
        if ext is None:
            raise ValueError(f"Unsupported image MIME type: {mime!r}")

        # Decode payload
        if "base64" in encoding:
            raw_bytes = base64.b64decode(payload)
        else:
            # URL-encoded text (SVG inline)
            svg_text  = urllib.parse.unquote(payload)
            raw_bytes = svg_text.encode("utf-8")

        return ext, raw_bytes

    @staticmethod
    def _make_key(presentation_id: int, slide_index: int, ext: str) -> str:
        """
        Build the MinIO object key.

        Pattern: slide-images/{presentation_id}/{slide_index:02d}.{ext}

        Zero-padding the index keeps directory listings in order and
        avoids "10 comes before 2" string-sort issues.
        """
        return f"slide-images/{presentation_id}/{slide_index:02d}.{ext}"

    @staticmethod
    def _build_url(bucket: str, object_key: str) -> str:
        """
        Construct the public HTTP URL for an uploaded object.

        Reads MINIO_ENDPOINT from env so the URL matches wherever the
        service is running (Docker internal vs localhost vs prod domain).
        """
        endpoint = os.environ.get("MINIO_ENDPOINT", "minio:9000")
        use_ssl  = os.environ.get("MINIO_USE_SSL", "false").lower() == "true"
        scheme   = "https" if use_ssl else "http"
        return f"{scheme}://{endpoint}/{bucket}/{object_key}"