"""
app/services/file_storage.py

Unified file-storage abstraction for generated images and uploaded assets.

Strategy
--------
Cloud mode  (MINIO_PUBLIC_URL is set)
    Files are uploaded to the configured S3-compatible bucket via the MinIO
    client (works with Cloudflare R2, Backblaze B2, AWS S3, and MinIO itself).
    The returned URL is the permanent CDN URL, e.g.:
        https://pub-xxxx.r2.dev/questions/1/abc123.png
    This survives container restarts and Render redeploys.

Local mode  (MINIO_PUBLIC_URL is empty)
    Files are written to the local ``uploads/`` directory and the returned URL
    is the internal static route:
        /api/v1/static/questions/1/abc123.png
    This is the existing behaviour used in Docker Compose development.

Usage
-----
    from app.services.file_storage import save_image

    url = save_image(
        data=png_bytes,          # raw bytes
        object_name="questions/1/abc123.png",  # path inside bucket / uploads dir
        content_type="image/png",
    )
    card["imageUrl"] = url
"""

from __future__ import annotations

import io
import logging
import os

logger = logging.getLogger(__name__)

# ── Internal helpers ──────────────────────────────────────────────────────────


def _get_settings():
    """Lazily import settings to avoid circular imports at module level."""
    from app.core.config import settings  # noqa: PLC0415
    return settings


def _resolve_uploads_dir() -> str:
    """
    Return the absolute path to the shared ``uploads/`` directory.

    Delegates to the canonical resolver in app.utils.paths so all components
    always agree on the path (including when UPLOADS_DIR env var is set).
    """
    from app.utils.paths import resolve_uploads_path  # noqa: PLC0415
    return resolve_uploads_path()


# ── Public API ────────────────────────────────────────────────────────────────


def save_image(data: bytes, object_name: str, content_type: str = "image/png") -> str:
    """
    Persist *data* and return the URL to store in the database.

    Parameters
    ----------
    data         : Raw image bytes.
    object_name  : Logical path, e.g. ``"questions/1/abc123.png"``.
                   Used as the bucket key in cloud mode or the sub-path under
                   ``uploads/`` in local mode.
    content_type : MIME type reported to the S3 bucket (cloud mode only).

    Returns
    -------
    str
        Absolute CDN URL (cloud mode) or ``/api/v1/static/<object_name>``
        (local mode).
    """
    settings = _get_settings()
    # Strip any leading slash so path joins are consistent.
    object_name = object_name.lstrip("/")

    public_url_base = (getattr(settings, "MINIO_PUBLIC_URL", "") or "").rstrip("/")

    if public_url_base:
        return _save_to_cloud(data, object_name, content_type, settings, public_url_base)
    else:
        return _save_to_local(data, object_name)


def save_upload(
    file_data: bytes,
    object_name: str,
    content_type: str = "application/octet-stream",
) -> str:
    """
    Convenience wrapper identical to ``save_image`` but with a generic default
    content type — suitable for arbitrary uploaded files (thumbnails, avatars).
    """
    return save_image(data=file_data, object_name=object_name, content_type=content_type)


# ── Storage backends ──────────────────────────────────────────────────────────


def _save_to_cloud(
    data: bytes,
    object_name: str,
    content_type: str,
    settings,
    public_url_base: str,
) -> str:
    """
    Upload *data* to the S3-compatible bucket and return the CDN URL.

    Uses the MinIO Python client which is already a project dependency and
    supports Cloudflare R2, Backblaze B2, AWS S3, and MinIO out of the box.
    Just point MINIO_ENDPOINT at the right host.
    """
    # Prevent crash if the minio package is unexpectedly absent.
    try:
        from minio import Minio  # noqa: PLC0415
    except ImportError as exc:  # pragma: no cover
        raise RuntimeError(
            "minio package is required for cloud storage. "
            "Add `minio` to requirements.txt."
        ) from exc

    endpoint = getattr(settings, "MINIO_ENDPOINT", "")
    access_key = getattr(settings, "MINIO_ACCESS_KEY", "")
    secret_key = getattr(settings, "MINIO_SECRET_KEY", "")
    bucket_name = getattr(settings, "MINIO_BUCKET_NAME", "eazy-italian")
    secure = bool(getattr(settings, "MINIO_SECURE", True))

    client = Minio(
        endpoint=endpoint,
        access_key=access_key,
        secret_key=secret_key,
        secure=secure,
    )

    # Ensure the bucket exists (idempotent).
    if not client.bucket_exists(bucket_name):
        client.make_bucket(bucket_name)
        logger.info("file_storage: created bucket %r", bucket_name)

    # Upload via in-memory stream — no temp file needed.
    stream = io.BytesIO(data)
    client.put_object(
        bucket_name=bucket_name,
        object_name=object_name,
        data=stream,
        length=len(data),
        content_type=content_type,
    )

    # Construct the public CDN URL.
    url = f"{public_url_base}/{object_name}"
    logger.info("file_storage: uploaded %r to bucket %r → %s", object_name, bucket_name, url)
    return url


def _save_to_local(data: bytes, object_name: str) -> str:
    """
    Write *data* to the local uploads directory and return the static URL.

    Falls back to the existing behaviour used in Docker Compose development
    (files served via ``/api/v1/static/``).
    """
    uploads_dir = _resolve_uploads_dir()
    # Ensure the destination sub-directory exists.
    file_path = os.path.join(uploads_dir, *object_name.split("/"))
    os.makedirs(os.path.dirname(file_path), exist_ok=True)

    with open(file_path, "wb") as fh:
        fh.write(data)

    # The static mount serves everything under uploads/ at /api/v1/static/
    static_url = f"/api/v1/static/{object_name}"
    logger.info("file_storage: saved %r to local disk → %s", object_name, static_url)
    return static_url
