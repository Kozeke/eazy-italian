from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os

from app.core.config import settings
from app.api.v1.api import api_router
from app.core.database import engine
from app.core.database import Base

# Import all models so SQLAlchemy can create tables
from app.models import (
    Course,
    Unit,
    User,
    EmailCampaign,
    TeacherPayment,
)
# LEGACY: legacy ORM tables still registered with SQLAlchemy metadata for existing DB rows
from app.models.video import Video                      # → video_embed blocks on Segment
from app.models.video_progress import VideoProgress     # → UnitHomeworkSubmission / segment completion
from app.models.task import Task                        # → exercise blocks on Segment
from app.models.test import Test                        # → test_without_timer / test_with_timer blocks
from app.models.progress import Progress                # → UnitHomeworkSubmission
from app.models.presentation import Presentation, PresentationSlide
from app.models.live_session import LiveSession
import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s - %(message)s",
    datefmt="%H:%M:%S",
)

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    docs_url="/docs",
    redoc_url="/redoc",
)

# ── CORS ──────────────────────────────────────────────────────────────────────
print(f"Setting up CORS with origins: {settings.cors_origins_list}")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=3600,
)

# ── Static file mount ─────────────────────────────────────────────────────────
backend_dir = os.path.dirname(os.path.abspath(__file__))

is_docker = (
    os.name != 'nt'
    and os.path.exists("/app")
    and os.getcwd() == "/app"
    and backend_dir == "/app"
)

uploads_path = "/app/uploads" if is_docker else os.path.join(backend_dir, "uploads")

_env_uploads = os.environ.get("UPLOADS_DIR", "").strip()
if _env_uploads:
    uploads_path = _env_uploads

print(f"[DEBUG] Backend dir: {backend_dir}")
print(f"[DEBUG] Uploads path: {uploads_path}")
print(f"[DEBUG] Uploads path exists: {os.path.exists(uploads_path)}")
print(f"[DEBUG] Is Docker: {is_docker}")
print(f"[DEBUG] Current working directory: {os.getcwd()}")

try:
    os.makedirs(uploads_path, exist_ok=True)
    os.makedirs(os.path.join(uploads_path, "thumbnails"), exist_ok=True)
    os.makedirs(os.path.join(uploads_path, "videos"), exist_ok=True)
    os.makedirs(os.path.join(uploads_path, "tasks", "audio"), exist_ok=True)
    os.makedirs(os.path.join(uploads_path, "tasks", "documents"), exist_ok=True)

    if os.path.exists(uploads_path):
        if os.path.exists(os.path.join(uploads_path, "videos")):
            videos_dir = os.path.join(uploads_path, "videos")
            print(f"[DEBUG] Videos directory exists: {videos_dir}")
            subdirs = [d for d in os.listdir(videos_dir) if os.path.isdir(os.path.join(videos_dir, d))]
            print(f"[DEBUG] Video subdirectories: {subdirs}")

        app.mount("/api/v1/static", StaticFiles(directory=uploads_path), name="uploads")
        print(f"✅ Static files mounted at /api/v1/static from {uploads_path}")
    else:
        print(f"⚠️  Warning: Uploads directory does not exist at {uploads_path}")
except PermissionError as e:
    print(f"⚠️  Warning: Permission denied creating uploads directory: {e}")
except Exception as e:
    print(f"⚠️  Warning: Error setting up uploads directory: {e}")
    import traceback
    traceback.print_exc()

# Include API router AFTER static mount
app.include_router(api_router, prefix=settings.API_V1_STR)


# ── Startup event handlers ────────────────────────────────────────────────────

@app.on_event("startup")
async def start_presence_eviction():
    from app.api.v1.endpoints.presence_rest import start_eviction_task
    start_eviction_task(interval_seconds=60, max_age_seconds=90)


@app.on_event("startup")
async def warmup_rag():
    # RAG / LaBSE warmup disabled — not in use.
    # Re-enable when /courses/{id}/ask goes live for students.
    # from app.services.ai.embedding_service import get_embedding_service
    # import asyncio
    # svc = get_embedding_service()
    # asyncio.ensure_future(asyncio.to_thread(svc.embed, "warmup"))
    pass


@app.on_event("startup")
async def startup_event():
    # ── Route sanity check ────────────────────────────────────────────────────
    print("\n=== Checking Admin Routes ===")
    admin_routes = [r for r in app.routes if hasattr(r, 'path') and '/admin' in str(r.path)]
    if admin_routes:
        print(f"✅ Found {len(admin_routes)} admin routes")
        for route in admin_routes[:5]:
            methods = getattr(route, 'methods', set())
            path = getattr(route, 'path', 'N/A')
            print(f"  {', '.join(methods)} {path}")
    else:
        print("⚠️  WARNING: No admin routes found!")
    print("=== End Route Check ===\n")

    # ── DB init: create tables + run migrations ───────────────────────────────
    # All migrations are gated behind migration_tracking so they only run ONCE.
    # On subsequent boots the check is a single SELECT — not 74 round-trips.
    import time
    from sqlalchemy.exc import OperationalError
    from sqlalchemy import text

    MIGRATION_VERSION = "v2_schema_complete"

    max_retries = 5
    retry_delay = 2

    for attempt in range(max_retries):
        try:
            # Always safe — SQLAlchemy uses IF NOT EXISTS internally
            Base.metadata.create_all(bind=engine)
            print("Database tables created successfully")

            with engine.connect() as conn:
                # ── Step 1: create migration_tracking table (1 round-trip) ──
                conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS migration_tracking (
                        id SERIAL PRIMARY KEY,
                        migration_name VARCHAR(255) UNIQUE NOT NULL,
                        applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                        applied_by VARCHAR(100) DEFAULT 'system'
                    )
                """))
                conn.commit()

                # ── Step 2: check if migrations already ran (1 round-trip) ──
                already_done = conn.execute(text("""
                    SELECT 1 FROM migration_tracking WHERE migration_name = :name
                """), {"name": MIGRATION_VERSION}).fetchone()

                if already_done:
                    # All migrations already applied — boot is done in 2 queries.
                    print(f"✅ Migrations already applied ({MIGRATION_VERSION}) — skipping")
                else:
                    # First boot (or after a reset): run all migrations once.
                    print(f"🔧 Running one-time migrations ({MIGRATION_VERSION})...")
                    _run_all_migrations(conn)

                    # Mark as done so future boots skip this block entirely
                    conn.execute(text("""
                        INSERT INTO migration_tracking (migration_name, applied_by)
                        VALUES (:name, 'startup_event')
                        ON CONFLICT (migration_name) DO NOTHING
                    """), {"name": MIGRATION_VERSION})
                    conn.commit()
                    print(f"✅ Migrations complete — marked as {MIGRATION_VERSION}")

            break

        except OperationalError as e:
            if attempt < max_retries - 1:
                print(f"Database connection failed (attempt {attempt + 1}/{max_retries}): {e}")
                print(f"Retrying in {retry_delay} seconds...")
                time.sleep(retry_delay)
                retry_delay *= 2
            else:
                print(f"Failed to connect to database after {max_retries} attempts")
                print("Starting application without database initialization...")
                break


def _run_all_migrations(conn):
    """
    All one-time schema migrations.
    Called only on the very first boot after deployment (or after migration_tracking reset).
    On subsequent boots this function is never called — startup cost drops to ~2 queries.
    """
    from sqlalchemy import text
    from app.models.test import QuestionType

    print("  Running migration: presentations tables...")
    try:
        from app.models.presentation import Presentation, PresentationSlide
        Presentation.__table__.create(bind=conn, checkfirst=True)
        PresentationSlide.__table__.create(bind=conn, checkfirst=True)
        conn.commit()
        print("  ✅ Presentations tables ensured")
    except Exception as exc:
        print(f"  ⚠️  Presentations table: {exc}")

    # ── questions table ───────────────────────────────────────────────────────
    print("  Running migration: questions columns...")
    question_migrations = [
        ("shuffle_options",          "BOOLEAN DEFAULT FALSE"),
        ("autograde",                "BOOLEAN DEFAULT TRUE"),
        ("manual_review_threshold",  "DOUBLE PRECISION"),
        ("expected_answer_config",   "JSON DEFAULT '{}'"),
        ("gaps_config",              "JSON DEFAULT '[]'"),
        ("question_metadata",        "JSON DEFAULT '{}'"),
    ]
    for col, defn in question_migrations:
        try:
            conn.execute(text(f"ALTER TABLE questions ADD COLUMN IF NOT EXISTS {col} {defn}"))
            conn.commit()
        except Exception:
            pass

    # ── tasks table (questions column) ────────────────────────────────────────
    try:
        conn.execute(text("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS questions JSON DEFAULT '[]'"))
        conn.commit()
    except Exception:
        pass

    # ── TaskType enum ─────────────────────────────────────────────────────────
    print("  Running migration: TaskType enum...")
    for value in ('listening', 'reading'):
        try:
            conn.execute(text(f"ALTER TYPE tasktype ADD VALUE IF NOT EXISTS '{value}'"))
            conn.commit()
        except Exception:
            pass

    # ── tasks.type / tasks.status: enum → VARCHAR ─────────────────────────────
    print("  Running migration: tasks type/status columns...")
    try:
        conn.execute(text(
            "ALTER TABLE tasks ALTER COLUMN type TYPE VARCHAR(50) USING type::text"
        ))
        conn.commit()
    except Exception:
        pass
    try:
        conn.execute(text(
            "ALTER TABLE tasks ALTER COLUMN status TYPE VARCHAR(50) USING status::text"
        ))
        conn.commit()
    except Exception:
        pass

    # ── SubscriptionType enum ─────────────────────────────────────────────────
    print("  Running migration: SubscriptionType enum...")
    try:
        conn.execute(text("""
            DO $$ BEGIN
                CREATE TYPE subscriptiontype AS ENUM ('free', 'standard', 'premium');
            EXCEPTION WHEN duplicate_object THEN null;
            END $$;
        """))
        conn.commit()
    except Exception:
        pass
    for val in ('free', 'standard', 'premium', 'FREE', 'STANDARD', 'PREMIUM'):
        try:
            conn.execute(text(f"ALTER TYPE subscriptiontype ADD VALUE IF NOT EXISTS '{val}'"))
            conn.commit()
        except Exception:
            pass

    # ── users table ───────────────────────────────────────────────────────────
    print("  Running migration: users columns...")
    try:
        conn.execute(text(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMP WITH TIME ZONE"
        ))
        conn.commit()
    except Exception:
        pass
    try:
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_type subscriptiontype"))
        conn.commit()
        conn.execute(text(
            "UPDATE users SET subscription_type = 'FREE'::subscriptiontype WHERE subscription_type IS NULL"
        ))
        conn.commit()
    except Exception:
        pass

    # ── QuestionType enum ─────────────────────────────────────────────────────
    print("  Running migration: QuestionType enum...")
    required_values = [e.value for e in QuestionType]
    for value in required_values:
        try:
            conn.execute(text(f"ALTER TYPE questiontype ADD VALUE IF NOT EXISTS '{value}'"))
            conn.commit()
        except Exception:
            pass

    # ── courses table columns ─────────────────────────────────────────────────
    print("  Running migration: courses columns...")
    course_columns = [
        ("thumbnail_path",          "VARCHAR(500)"),
        ("target_language",         "VARCHAR(100)"),
        ("native_language",         "VARCHAR(100)"),
        ("units_count",             "INTEGER DEFAULT 0"),
        ("published_units_count",   "INTEGER DEFAULT 0"),
        ("content_summary",         "JSONB DEFAULT '{}'::jsonb"),
    ]
    for col, defn in course_columns:
        try:
            conn.execute(text(f"ALTER TABLE courses ADD COLUMN IF NOT EXISTS {col} {defn}"))
            conn.commit()
        except Exception:
            pass

    # ── units table columns ───────────────────────────────────────────────────
    print("  Running migration: units columns...")
    unit_columns = [
        ("course_id",       "INTEGER REFERENCES courses(id) ON DELETE CASCADE"),
        ("goals",           "TEXT"),
        ("homework_blocks", "JSONB DEFAULT '[]'::jsonb"),
        ("content_count",   "INTEGER DEFAULT 0"),
        ("segment_count",   "INTEGER DEFAULT 0"),
    ]
    for col, defn in unit_columns:
        try:
            conn.execute(text(f"ALTER TABLE units ADD COLUMN IF NOT EXISTS {col} {defn}"))
            conn.commit()
        except Exception:
            pass

    # ── video_progress table ──────────────────────────────────────────────────
    print("  Running migration: video_progress columns...")
    vp_columns = [
        ("watch_time_sec",      "DOUBLE PRECISION DEFAULT 0"),
        ("first_watched_at",    "TIMESTAMP WITH TIME ZONE"),
        ("last_watched_at",     "TIMESTAMP WITH TIME ZONE"),
        ("watched_percentage",  "DOUBLE PRECISION DEFAULT 0"),
        ("progress_percent",    "DOUBLE PRECISION DEFAULT 0"),
        ("completed_at",        "TIMESTAMP WITH TIME ZONE"),
        ("is_completed",        "BOOLEAN DEFAULT FALSE"),
    ]
    for col, defn in vp_columns:
        try:
            conn.execute(text(f"ALTER TABLE video_progress ADD COLUMN IF NOT EXISTS {col} {defn}"))
            conn.commit()
        except Exception:
            pass
    try:
        conn.execute(text("""
            ALTER TABLE video_progress
            ADD CONSTRAINT unique_user_video_progress UNIQUE (user_id, video_id)
        """))
        conn.commit()
    except Exception:
        pass

    # ── course_enrollments table ──────────────────────────────────────────────
    print("  Running migration: course_enrollments table...")
    try:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS course_enrollments (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
                UNIQUE(user_id, course_id)
            )
        """))
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_course_enrollments_user_id
            ON course_enrollments(user_id)
        """))
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_course_enrollments_course_id
            ON course_enrollments(course_id)
        """))
        conn.commit()
    except Exception:
        pass

    # ── task_submissions + tasks extra columns ────────────────────────────────
    print("  Running migration: task_submissions columns...")
    task_sub_cols = [
        ("attempt_number",      "INTEGER DEFAULT 1"),
        ("time_spent_minutes",  "INTEGER DEFAULT 0"),
    ]
    for col, defn in task_sub_cols:
        try:
            conn.execute(text(f"ALTER TABLE task_submissions ADD COLUMN IF NOT EXISTS {col} {defn}"))
            conn.commit()
        except Exception:
            pass

    task_extra_cols = [
        ("instructions",            "TEXT"),
        ("auto_task_type",          "VARCHAR(50)"),
        ("allow_late_submissions",  "BOOLEAN DEFAULT FALSE"),
        ("late_penalty_percent",    "INTEGER DEFAULT 0"),
        ("max_attempts",            "INTEGER DEFAULT 1"),
        ("assigned_cohorts",        "JSON DEFAULT '[]'"),
        ("assigned_students",       "JSON DEFAULT '[]'"),
        ("assign_to_all",           "BOOLEAN DEFAULT FALSE"),
        ("send_assignment_email",   "BOOLEAN DEFAULT FALSE"),
        ("reminder_days_before",    "INTEGER DEFAULT 1"),
        ("send_results_email",      "BOOLEAN DEFAULT FALSE"),
        ("send_teacher_copy",       "BOOLEAN DEFAULT FALSE"),
        ("notify_on_assignment",    "BOOLEAN DEFAULT FALSE"),
        ("notify_reminder_days",    "INTEGER DEFAULT 1"),
        ("notify_on_submit",        "BOOLEAN DEFAULT FALSE"),
        ("notify_on_grade",         "BOOLEAN DEFAULT FALSE"),
    ]
    for col, defn in task_extra_cols:
        try:
            conn.execute(text(f"ALTER TABLE tasks ADD COLUMN IF NOT EXISTS {col} {defn}"))
            conn.commit()
        except Exception:
            pass

    # ── SubscriptionName enum + user subscription sync ────────────────────────
    print("  Running migration: SubscriptionName enum + subscription sync...")
    try:
        conn.execute(text("ALTER TYPE subscriptionname ADD VALUE IF NOT EXISTS 'standard'"))
        conn.commit()
    except Exception:
        pass
    try:
        conn.execute(text("""
            UPDATE users u
            SET subscription_type = 'PREMIUM'::subscriptiontype
            FROM user_subscriptions us
            JOIN subscriptions s ON s.id = us.subscription_id
            WHERE u.id = us.user_id
              AND us.is_active = true
              AND s.name IN ('PREMIUM', 'premium', 'PRO', 'pro')
              AND u.subscription_type = 'FREE'::subscriptiontype
        """))
        conn.commit()
        print("  ✅ Migrated subscription types from UserSubscription")
    except Exception as e:
        print(f"  ⚠️  Subscription migration note: {e}")

    print("  ✅ All migrations complete")


# ── Utility endpoints ─────────────────────────────────────────────────────────

@app.get("/health")
async def health_check():
    return {"status": "healthy"}


@app.get("/cors-test")
async def cors_test():
    return {
        "message": "CORS is working",
        "origins": settings.cors_origins_list,
        "environment": settings.ENVIRONMENT,
    }


@app.options("/api/v1/auth/login")
async def options_login():
    return {"message": "OK"}


@app.get("/")
async def root():
    return {
        "message": "Eazy Italian API",
        "version": "1.0.0",
        "status": "deployed",
        "database": "connected",
        "cors_origins": settings.cors_origins_list,
    }


if os.path.exists("frontend/dist"):
    app.mount("/static", StaticFiles(directory="frontend/dist", html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)