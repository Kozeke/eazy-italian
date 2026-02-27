"""
EmbeddingService — multilingual embeddings for English & Russian.

Model choice: LaBSE (Language-Agnostic BERT Sentence Embeddings, Google)
  • Best-in-class cross-lingual alignment for EN + RU out of the box.
  • 768-dim vectors, ~471 MB — fast enough on CPU for RAG batch sizes.
  • Alternative: "intfloat/multilingual-e5-base" (768-dim, slightly smaller,
    but requires "query: " / "passage: " prefix convention).
  • Set EMBEDDING_MODEL env-var to swap without code changes.

Install:
    pip install sentence-transformers
"""

from __future__ import annotations

import logging
import os
from functools import lru_cache
from typing import List

import numpy as np

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────────────────────────
# Default model — override via env variable
# ──────────────────────────────────────────────────────────────────────────────
DEFAULT_MODEL = "LaBSE"                        # google/LaBSE on HuggingFace
# Alternatives:
#   "intfloat/multilingual-e5-base"           — needs "query: " prefix
#   "ai-forever/rubert-tiny2"                 — Russian-only, faster / lighter
#   "cointegrated/LaBSE-en-ru"               — EN+RU fine-tuned variant


class EmbeddingService:
    """
    Thin wrapper around a sentence-transformers encoder.
    Produces L2-normalised float vectors suitable for cosine similarity search.

    Usage
    -----
    svc = EmbeddingService()               # loads model once, lazy
    vec = svc.embed("Привет, мир!")        # List[float], length == 768
    """

    def __init__(self, model_name: str | None = None) -> None:
        self._model_name: str = (
            model_name
            or os.environ.get("EMBEDDING_MODEL", DEFAULT_MODEL)
        )
        self._model = None          # lazy — loaded on first call to embed()

    # ── public ───────────────────────────────────────────────────────────────

    def embed(self, text: str) -> List[float]:
        """
        Encode *text* and return a normalised embedding vector.

        Parameters
        ----------
        text : str
            Any UTF-8 string (English, Russian, or mixed).

        Returns
        -------
        List[float]
            L2-normalised vector of length 768 (LaBSE) or 384/768
            depending on the chosen model.
        """
        if not text or not text.strip():
            raise ValueError("embed() requires non-empty text")

        model = self._get_model()
        raw: np.ndarray = model.encode(
            text,
            normalize_embeddings=True,   # L2-norm baked in
            show_progress_bar=False,
        )
        return raw.tolist()

    def embed_batch(self, texts: List[str]) -> List[List[float]]:
        """Encode multiple texts in one forward pass (more efficient)."""
        if not texts:
            return []
        model = self._get_model()
        raw: np.ndarray = model.encode(
            texts,
            normalize_embeddings=True,
            batch_size=32,
            show_progress_bar=False,
        )
        return raw.tolist()

    @property
    def model_name(self) -> str:
        return self._model_name

    @property
    def embedding_dim(self) -> int:
        """Vector dimensionality — available after first embed() call."""
        if self._model is None:
            self._get_model()
        return self._model.get_sentence_embedding_dimension()

    # ── private ──────────────────────────────────────────────────────────────

    def _get_model(self):
        """Lazy-load and cache the sentence-transformers model."""
        if self._model is None:
            try:
                from sentence_transformers import SentenceTransformer
            except ImportError as exc:
                raise ImportError(
                    "sentence-transformers is required: "
                    "pip install sentence-transformers"
                ) from exc

            logger.info("Loading embedding model: %s", self._model_name)
            self._model = SentenceTransformer(self._model_name)
            logger.info(
                "Embedding model loaded — dim=%d",
                self._model.get_sentence_embedding_dimension(),
            )
        return self._model


# ── module-level singleton (one model process-wide) ─────────────────────────

@lru_cache(maxsize=1)
def get_embedding_service(model_name: str = DEFAULT_MODEL) -> EmbeddingService:
    """
    FastAPI-friendly factory — use as a Depends() or import directly.

    Example
    -------
    from app.services.ai.embedding_service import get_embedding_service
    svc = get_embedding_service()
    """
    return EmbeddingService(model_name=model_name)