"""
app/services/export

Self-contained HTML export for a Unit. Public API:

    from app.services.export import render_unit_export, slugify

`render_unit_export(unit_title, segments)` returns a complete, single-file
HTML string (no external assets except remote CDN media). `slugify` builds
the download filename.

Package layout:
    models.py       render-ready dataclasses (no logic)
    markdown.py     tiny offline Markdown→HTML for text blocks
    normalizers.py  per-block normalisation (Tier-1 + Tier-2), the answer keys
    templates.py    embedded HTML/CSS/JS + Jinja env + render_export()
    service.py      build_export_context() orchestration + render_unit_export()
"""

from .models import ExportContext
from .normalizers import slugify
from .service import build_export_context, render_unit_export

__all__ = [
    "render_unit_export",
    "build_export_context",
    "slugify",
    "ExportContext",
]