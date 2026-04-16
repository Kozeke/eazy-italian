"""
app/schemas/segment.py
=======================
Pydantic v2 schemas for Segment CRUD endpoints.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class SegmentMediaBlock(BaseModel):
    id: str
    kind: str
    url: str = ""
    caption: str = ""
    slides: list[Any] = Field(default_factory=list)

    model_config = {"extra": "allow"}


# ── Shared base ────────────────────────────────────────────────────────────────

class SegmentBase(BaseModel):
    title:                  str             = Field(..., min_length=1, max_length=255)
    description:            Optional[str]   = None
    order_index:            int             = Field(default=0, ge=0)
    status:                 str             = Field(default="draft")
    publish_at:             Optional[datetime] = None
    is_visible_to_students: bool            = False


# ── Request schemas ────────────────────────────────────────────────────────────

class SegmentCreate(SegmentBase):
    """Body for POST /units/{unit_id}/segments"""
    pass


class SegmentUpdate(BaseModel):
    """Body for PATCH /units/{unit_id}/segments/{segment_id} — all fields optional"""
    title:                  Optional[str]       = Field(default=None, min_length=1, max_length=255)
    description:            Optional[str]       = None
    order_index:            Optional[int]       = Field(default=None, ge=0)
    status:                 Optional[str]       = None
    publish_at:             Optional[datetime]  = None
    is_visible_to_students: Optional[bool]      = None
    media_blocks:           Optional[list[SegmentMediaBlock]] = None


class SegmentReorderItem(BaseModel):
    id:          int
    order_index: int


class SegmentReorderRequest(BaseModel):
    segments: list[SegmentReorderItem]


# ── Response schemas ───────────────────────────────────────────────────────────

class SegmentSummary(BaseModel):
    """Lightweight response — used inside UnitDetailResponse"""
    id:                     int
    unit_id:                int
    title:                  str
    description:            Optional[str]
    order_index:            int
    status:                 str
    is_visible_to_students: bool
    content_count:          int
    media_blocks:           list[SegmentMediaBlock] = []

    model_config = {"from_attributes": True}


class SegmentDetail(SegmentBase):
    """Full response — returned from GET /segments/{segment_id}"""
    id:         int
    unit_id:    int
    created_by: int
    created_at: datetime
    updated_at: Optional[datetime]

    # Content item counts (cheap — count from joined rows)
    video_count:        int = 0
    task_count:         int = 0
    test_count:         int = 0
    presentation_count: int = 0
    media_blocks:       list[SegmentMediaBlock] = []

    model_config = {"from_attributes": True}