"""
app/services/ai/image_providers/__init__.py
==========================================
Public API for the image providers package.

Import surface is intentionally flat — callers should import from here,
not from individual modules, so internal refactors don't break them.

Usage
-----
    from app.services.ai.image_providers import (
        ImageProvider,
        ImageResult,
        ImageFormat,
        ImageProviderError,
        NullImageProvider,
        SVGImageProvider,
        FalImageProvider,
    )
"""

from app.services.ai.image_providers.image_base import (
    ImageFormat,
    ImageProvider,
    ImageProviderError,
    ImageResult,
    NullImageProvider,
)
from app.services.ai.image_providers.svg_provider import SVGImageProvider
from app.services.ai.image_providers.fal_provider import FalImageProvider

__all__ = [
    "ImageFormat",
    "ImageProvider",
    "ImageProviderError",
    "ImageResult",
    "NullImageProvider",
    "SVGImageProvider",
    "FalImageProvider",
]