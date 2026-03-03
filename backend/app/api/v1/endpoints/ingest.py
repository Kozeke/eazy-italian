"""
app/api/v1/endpoints/ingest.py
================================
Document ingestion API — upload PDFs, subtitles, and DOCX files
for a lesson/unit and have them chunked + stored in the vector DB.

Mount in api_router:
    from app.api.v1.endpoints import ingest
    api_router.include_router(ingest.router, prefix="/ingest", tags=["RAG Ingestion"])

Endpoints
---------
  POST   /ingest/upload        — upload a single file for a lesson
  POST   /ingest/upload-many   — upload multiple files at once
  DELETE /ingest/lesson/{id}   — wipe all chunks for a lesson
  GET    /ingest/lesson/{id}/status — chunk count + metadata summary
"""
from __future__ import annotations

import logging
import os
import shutil
import mimetypes
from typing import List, Optional

from fastapi import (
    APIRouter, BackgroundTasks, Depends, File, Form,
    HTTPException, UploadFile, status,
)
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.auth import get_current_teacher          # teachers only
from app.models.user import User
from app.services.document_parsers import SUPPORTED_EXTENSIONS, ParserError
from app.services.ingestion_service import IngestionService, IngestionResult

logger = logging.getLogger(__name__)
router = APIRouter()

# ── file size guard — 50 MB ───────────────────────────────────────────────────
MAX_FILE_BYTES = 50 * 1024 * 1024


# ── Response schemas ──────────────────────────────────────────────────────────

class IngestResponse(BaseModel):
    lesson_id:   int
    course_id:   int
    filename:    str
    source_type: str
    title:       str
    chunk_count: int
    message:     str


class LessonStatusResponse(BaseModel):
    lesson_id:   int
    chunk_count: int
    sources:     List[dict] = Field(default_factory=list)


class DeleteResponse(BaseModel):
    lesson_id:    int
    deleted_chunks: int
    message:      str


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_ingest_service(db: Session = Depends(get_db)) -> IngestionService:
    return IngestionService(db=db)


def _get_rag_docs_path(lesson_id: int) -> str:
    """Returns the directory path for storing original RAG source files."""
    is_docker = (
        os.name != "nt"
        and os.path.exists("/app")
        and os.getcwd() == "/app"
    )
    base = "/app/uploads" if is_docker else os.path.join(
        os.path.dirname(os.path.abspath(__file__)),
        "../../../../../../uploads"   # up to project root/uploads
    )
    path = os.path.join(base, "rag_docs", str(lesson_id))
    os.makedirs(path, exist_ok=True)
    return path


def _fmt_size(n: int) -> str:
    """Format bytes as human-readable size."""
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024:
            return f"{n:.0f} {unit}"
        n /= 1024
    return f"{n:.1f} GB"


async def _read_and_validate(file: UploadFile) -> bytes:
    """Read upload bytes and enforce size + extension constraints."""
    data = await file.read()
    if len(data) > MAX_FILE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds 50 MB limit ({len(data) // (1024*1024)} MB uploaded).",
        )
    ext = (file.filename or "").rsplit(".", 1)[-1].lower()
    if ext not in SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=(
                f"Unsupported file type '.{ext}'. "
                f"Accepted: {sorted(SUPPORTED_EXTENSIONS)}"
            ),
        )
    return data


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post(
    "/upload",
    response_model=IngestResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload one document and ingest it into the vector store",
)
async def upload_document(
    file:          UploadFile        = File(..., description="PDF, VTT, SRT, or DOCX file"),
    lesson_id:     int               = Form(..., description="Target lesson/unit ID"),
    course_id:     int               = Form(..., description="Parent course ID"),
    title:         Optional[str]     = Form(None, description="Override document title"),
    language:      Optional[str]     = Form(None, description="Language hint: en | ru | it"),
    wipe_existing: bool              = Form(True, description="Delete previous chunks before ingesting"),
    svc:           IngestionService  = Depends(_get_ingest_service),
    current_user:  User              = Depends(get_current_teacher),
) -> IngestResponse:
    """
    Upload a document file and immediately chunk + embed it into the
    `lesson_chunks` vector table.

    - **PDF**: text extracted page by page; page breaks become section boundaries.
    - **VTT / SRT**: timestamps stripped; silence gaps become paragraph breaks.
    - **DOCX**: heading styles become section markers; tables are included.

    The endpoint is synchronous — for files > 5 MB consider the async
    background task variant (see `/upload-background`).
    """
    data = await _read_and_validate(file)

    # ── Save original file for later download ────────────────────────────────
    safe_filename = (file.filename or "upload").replace("/", "_").replace("..", "_")
    docs_dir = _get_rag_docs_path(lesson_id)
    file_path = os.path.join(docs_dir, safe_filename)
    try:
        with open(file_path, "wb") as f:
            f.write(data)
    except Exception as e:
        logger.warning("Could not save RAG source file '%s': %s", safe_filename, e)
    # ── End save ─────────────────────────────────────────────────────────────

    try:
        result: IngestionResult = svc.ingest(
            file_bytes    = data,
            filename      = file.filename or "upload",
            lesson_id     = lesson_id,
            course_id     = course_id,
            title         = title,
            language      = language,
            mimetype      = file.content_type or "",
            wipe_existing = wipe_existing,
        )
    except ParserError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                            detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                            detail=str(exc))
    except Exception as exc:
        logger.exception("Ingestion failed for '%s'", file.filename)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                            detail=f"Ingestion error: {exc}")

    return IngestResponse(
        lesson_id   = result.lesson_id,
        course_id   = result.course_id,
        filename    = result.filename,
        source_type = result.source_type,
        title       = result.title,
        chunk_count = result.chunk_count,
        message     = (
            f"Successfully ingested '{result.filename}' into lesson {lesson_id} "
            f"({result.chunk_count} chunks)."
        ),
    )


@router.post(
    "/upload-many",
    response_model=List[IngestResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Upload multiple documents for the same lesson at once",
)
async def upload_many(
    files:     List[UploadFile]  = File(...),
    lesson_id: int               = Form(...),
    course_id: int               = Form(...),
    language:  Optional[str]     = Form(None),
    svc:       IngestionService  = Depends(_get_ingest_service),
    _user:     User              = Depends(get_current_teacher),
) -> List[IngestResponse]:
    """
    Upload multiple files for a single lesson.

    Only the first file wipes existing chunks; subsequent files are
    *appended* to the same lesson's chunk pool.
    """
    if not files:
        raise HTTPException(status_code=400, detail="No files provided.")
    if len(files) > 10:
        raise HTTPException(status_code=400, detail="Maximum 10 files per request.")

    results = []
    for i, file in enumerate(files):
        data = await _read_and_validate(file)
        
        # ── Save original file for later download ────────────────────────────────
        safe_filename = (file.filename or f"file_{i}").replace("/", "_").replace("..", "_")
        docs_dir = _get_rag_docs_path(lesson_id)
        file_path = os.path.join(docs_dir, safe_filename)
        try:
            with open(file_path, "wb") as f:
                f.write(data)
        except Exception as e:
            logger.warning("Could not save RAG source file '%s': %s", safe_filename, e)
        # ── End save ─────────────────────────────────────────────────────────────
        
        try:
            result = svc.ingest(
                file_bytes    = data,
                filename      = file.filename or f"file_{i}",
                lesson_id     = lesson_id,
                course_id     = course_id,
                language      = language,
                mimetype      = file.content_type or "",
                wipe_existing = (i == 0),   # only wipe on the first file
            )
        except (ParserError, ValueError) as exc:
            raise HTTPException(status_code=422,
                                detail=f"Error processing '{file.filename}': {exc}")

        results.append(IngestResponse(
            lesson_id   = result.lesson_id,
            course_id   = result.course_id,
            filename    = result.filename,
            source_type = result.source_type,
            title       = result.title,
            chunk_count = result.chunk_count,
            message     = f"Ingested '{result.filename}' ({result.chunk_count} chunks).",
        ))

    return results


@router.get(
    "/lesson/{lesson_id}/status",
    response_model=LessonStatusResponse,
    summary="Check how many chunks are stored for a lesson",
)
def lesson_status(
    lesson_id: int,
    db:        Session = Depends(get_db),
    _user:     User    = Depends(get_current_teacher),
) -> LessonStatusResponse:
    """
    Returns total chunk count and a summary of ingested sources
    (filenames, types, chunk counts) for a lesson.
    """
    rows = db.execute(text("""
        SELECT
            COUNT(*)                        AS total,
            metadata->>'source_type'        AS source_type,
            metadata->>'filename'           AS filename,
            COUNT(*)                        AS n
        FROM lesson_chunks
        WHERE lesson_id = :lid
        GROUP BY metadata->>'source_type', metadata->>'filename'
        ORDER BY metadata->>'filename'
    """), {"lid": lesson_id}).fetchall()

    total   = sum(r.total for r in rows) if rows else 0
    sources = [
        {"source_type": r.source_type, "filename": r.filename, "chunks": r.n}
        for r in rows
    ]

    return LessonStatusResponse(
        lesson_id   = lesson_id,
        chunk_count = total,
        sources     = sources,
    )


@router.delete(
    "/lesson/{lesson_id}",
    response_model=DeleteResponse,
    summary="Delete all vector chunks for a lesson",
)
def delete_lesson_chunks(
    lesson_id: int,
    db:        Session = Depends(get_db),
    _user:     User    = Depends(get_current_teacher),
) -> DeleteResponse:
    """
    Wipe all chunks for a lesson from the vector store.
    Use this before re-ingesting updated documents.
    """
    from app.repositories.vector_repository import VectorRepository
    repo    = VectorRepository(db)
    deleted = repo.delete_by_lesson(lesson_id)

    return DeleteResponse(
        lesson_id      = lesson_id,
        deleted_chunks = deleted,
        message        = f"Deleted {deleted} chunks for lesson {lesson_id}.",
    )


# ── File download & delete ────────────────────────────────────────────────────

@router.get(
    "/lesson/{lesson_id}/file/{filename}",
    summary="Download an original RAG source file",
)
def download_rag_file(
    lesson_id: int,
    filename:  str,
    db:        Session = Depends(get_db),
    _user:     User    = Depends(get_current_teacher),
):
    """
    Serve the original uploaded file (PDF, DOCX, VTT, SRT) for a lesson.
    Filename must match exactly what was uploaded.
    """
    # Sanitise — never allow path traversal
    safe = filename.replace("/", "_").replace("..", "_").replace("\\", "_")
    docs_dir = _get_rag_docs_path(lesson_id)
    file_path = os.path.join(docs_dir, safe)

    if not os.path.isfile(file_path):
        raise HTTPException(status_code=404, detail="File not found. It may have been uploaded before file-saving was enabled.")

    mime, _ = mimetypes.guess_type(file_path)
    return FileResponse(
        path         = file_path,
        media_type   = mime or "application/octet-stream",
        filename     = safe,          # triggers download with correct name
    )


@router.delete(
    "/lesson/{lesson_id}/file/{filename}",
    summary="Delete a specific RAG source file (keeps vector chunks intact)",
)
def delete_rag_file(
    lesson_id: int,
    filename:  str,
    db:        Session = Depends(get_db),
    _user:     User    = Depends(get_current_teacher),
):
    """
    Remove the stored file from disk only.
    Does NOT delete vector chunks — use DELETE /lesson/{id} for that.
    """
    safe = filename.replace("/", "_").replace("..", "_").replace("\\", "_")
    docs_dir = _get_rag_docs_path(lesson_id)
    file_path = os.path.join(docs_dir, safe)

    if not os.path.isfile(file_path):
        raise HTTPException(status_code=404, detail="File not found")

    os.remove(file_path)
    return {"message": f"File '{safe}' deleted from lesson {lesson_id}."}


@router.get(
    "/lesson/{lesson_id}/files",
    summary="List saved original files for a lesson",
)
def list_rag_files(
    lesson_id: int,
    db:        Session = Depends(get_db),
    _user:     User    = Depends(get_current_teacher),
):
    """
    Returns all original files saved for a lesson with their size.
    Cross-referenced with lesson_chunks metadata to show chunk count per file.
    """
    docs_dir = _get_rag_docs_path(lesson_id)
    saved_files = []

    if os.path.isdir(docs_dir):
        for fname in sorted(os.listdir(docs_dir)):
            fpath = os.path.join(docs_dir, fname)
            if os.path.isfile(fpath):
                saved_files.append({
                    "filename": fname,
                    "size_bytes": os.path.getsize(fpath),
                    "size_human": _fmt_size(os.path.getsize(fpath)),
                })

    # Cross-reference chunk counts from DB
    rows = db.execute(text("""
        SELECT metadata->>'filename' AS filename, COUNT(*) AS chunks
        FROM lesson_chunks
        WHERE lesson_id = :lid
        GROUP BY metadata->>'filename'
    """), {"lid": lesson_id}).fetchall()
    chunk_map = {r.filename: r.chunks for r in rows}

    for f in saved_files:
        f["chunk_count"] = chunk_map.get(f["filename"], 0)
        f["has_chunks"]  = f["filename"] in chunk_map

    # Also surface filenames that have chunks but no saved file
    # (uploaded before this feature was added)
    saved_names = {f["filename"] for f in saved_files}
    for fname, chunks in chunk_map.items():
        if fname and fname not in saved_names:
            saved_files.append({
                "filename":   fname,
                "size_bytes": None,
                "size_human": None,
                "chunk_count": chunks,
                "has_chunks":  True,
                "file_missing": True,   # uploaded before file-save was enabled
            })

    return {
        "lesson_id":   lesson_id,
        "total_files": len(saved_files),
        "files":       saved_files,
    }