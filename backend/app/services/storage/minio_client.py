"""
app/services/storage/minio_client.py
=====================================
Thin singleton wrapper around the MinIO Python client.

The client is initialised once from environment variables and reused
across all requests.  No connection pooling needed — the MinIO SDK
opens a new HTTP connection per call but keeps the overhead negligible.

Environment variables (already in docker-compose.yml)
------------------------------------------------------
MINIO_ENDPOINT      minio:9000
MINIO_ACCESS_KEY    minioadmin
MINIO_SECRET_KEY    minioadmin123
MINIO_BUCKET_NAME   eazy-italian
MINIO_USE_SSL       false (default)

Buckets created on first use
-----------------------------
get_minio_client() calls _ensure_bucket() which creates the bucket with
a public-read policy if it doesn't already exist.  Safe to call on every
startup — it's a no-op when the bucket is present.

Public vs presigned URLs
-------------------------
Slide images are set to public-read so the frontend can reference them as
plain https:// URLs without short-lived tokens.  If you need access
control in future, remove the public policy and switch to
client.presigned_get_object() with a 7-day TTL.
"""

from __future__ import annotations

import json
import logging
import os
from functools import lru_cache

from minio import Minio
from minio.error import S3Error

logger = logging.getLogger(__name__)

# ── Bucket name ───────────────────────────────────────────────────────────────

def _bucket_name() -> str:
    return os.environ.get("MINIO_BUCKET_NAME", "eazy-italian")


# ── Public-read bucket policy ─────────────────────────────────────────────────

def _public_read_policy(bucket: str) -> str:
    """
    S3-compatible policy that allows any anonymous GET on any object
    in *bucket*.  Applied once when the bucket is first created.
    """
    return json.dumps({
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect":    "Allow",
                "Principal": {"AWS": ["*"]},
                "Action":    ["s3:GetObject"],
                "Resource":  [f"arn:aws:s3:::{bucket}/*"],
            }
        ],
    })


# ── Singleton ─────────────────────────────────────────────────────────────────

@lru_cache(maxsize=1)
def get_minio_client() -> Minio:
    """
    Return (and lazily create) the shared MinIO client.

    Called once at startup; subsequent calls return the cached instance.
    Thread-safe — lru_cache guarantees a single initialisation.
    """
    endpoint   = os.environ.get("MINIO_ENDPOINT",   "minio:9000")
    access_key = os.environ.get("MINIO_ACCESS_KEY",  "minioadmin")
    secret_key = os.environ.get("MINIO_SECRET_KEY",  "minioadmin123")
    use_ssl    = os.environ.get("MINIO_USE_SSL",     "false").lower() == "true"

    client = Minio(
        endpoint   = endpoint,
        access_key = access_key,
        secret_key = secret_key,
        secure     = use_ssl,
    )

    _ensure_bucket(client)
    return client


def _ensure_bucket(client: Minio) -> None:
    """
    Create the bucket and apply a public-read policy if it does not exist.
    Swallows all errors so a MinIO outage never prevents the app from starting.
    """
    bucket = _bucket_name()
    try:
        if not client.bucket_exists(bucket):
            client.make_bucket(bucket)
            client.set_bucket_policy(bucket, _public_read_policy(bucket))
            logger.info("MinIO: created bucket %r with public-read policy", bucket)
        else:
            logger.debug("MinIO: bucket %r already exists", bucket)
    except S3Error as exc:
        logger.warning("MinIO: could not ensure bucket %r: %s", bucket, exc)
    except Exception as exc:
        logger.warning("MinIO: unexpected error ensuring bucket: %s", exc)