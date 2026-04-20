"""
User self-service endpoints.

This module exposes profile read/update routes for the authenticated user and
handles profile avatar uploads that are persisted into notification_prefs.
"""

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session
import os
import uuid
from app.core.database import get_db
from app.core.auth import get_current_user
from app.models.user import User
from app.schemas.user import UserResponse, UserUpdate
from app.services.user_service import UserService

router = APIRouter()


# Stores max avatar payload size in bytes to prevent oversized uploads.
MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024
# Stores accepted image MIME types mapped to canonical saved extension.
ALLOWED_AVATAR_CONTENT_TYPES = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}


# Resolves shared uploads root path used by static /api/v1/static mount.
def _get_uploads_path() -> str:
    # Stores absolute backend directory path derived from this module file.
    backend_dir = os.path.dirname(
        os.path.dirname(
            os.path.dirname(
                os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            )
        )
    )
    # Detects docker runtime path so uploads align with mounted static directory.
    is_docker = (
        os.name != "nt"
        and os.path.exists("/app")
        and os.getcwd() == "/app"
        and backend_dir == "/app"
    )
    return "/app/uploads" if is_docker else os.path.join(backend_dir, "uploads")


@router.get("/me", response_model=UserResponse)
def get_current_user_info(current_user: User = Depends(get_current_user)):
    return current_user


@router.put("/me", response_model=UserResponse)
def update_current_user(
    user_update: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    user_service = UserService(db)
    return user_service.update_user(current_user.id, user_update)


@router.post("/me/avatar", response_model=UserResponse)
async def upload_current_user_avatar(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Validates that uploaded asset is one of supported image formats.
    if not file.content_type or file.content_type.lower() not in ALLOWED_AVATAR_CONTENT_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Avatar must be a JPEG, PNG, or WEBP image",
        )

    # Stores image bytes for size validation and filesystem persistence.
    avatar_bytes = await file.read()
    # Rejects oversized image payloads to protect storage and request processing.
    if not avatar_bytes:
        raise HTTPException(status_code=400, detail="Avatar file is empty")
    if len(avatar_bytes) > MAX_AVATAR_SIZE_BYTES:
        raise HTTPException(status_code=400, detail="Avatar file exceeds 5MB limit")

    # Stores normalized image extension derived from validated content type.
    image_ext = ALLOWED_AVATAR_CONTENT_TYPES[file.content_type.lower()]
    # Stores absolute per-user avatar directory under shared uploads root.
    user_avatar_dir = os.path.join(_get_uploads_path(), "avatars", str(current_user.id))
    # Ensures avatar directory exists before writing uploaded bytes.
    os.makedirs(user_avatar_dir, exist_ok=True)
    # Stores random filename to avoid collisions and stale browser cache reuse.
    avatar_filename = f"avatar_{uuid.uuid4().hex[:12]}{image_ext}"
    # Stores absolute on-disk avatar file path for write operation.
    avatar_file_path = os.path.join(user_avatar_dir, avatar_filename)

    # Writes uploaded avatar bytes to the configured static uploads directory.
    try:
        with open(avatar_file_path, "wb") as avatar_file:
            avatar_file.write(avatar_bytes)
    except OSError as exc:
        # Prevent crash if filesystem is temporarily unavailable or path is unwritable.
        raise HTTPException(status_code=500, detail=f"Failed to store avatar: {exc}") from exc

    # Stores static-relative path persisted in notification_prefs JSON column.
    avatar_relative_path = f"avatars/{current_user.id}/{avatar_filename}"
    # Stores mutable metadata map so avatar path updates preserve existing keys.
    profile_prefs = dict(current_user.notification_prefs or {})
    profile_prefs["avatar_url"] = avatar_relative_path
    current_user.notification_prefs = profile_prefs
    db.commit()
    db.refresh(current_user)
    return current_user

