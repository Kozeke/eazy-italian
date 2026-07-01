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
from app.models.ai_cache import AICache  # ensures ai_cache table is created on boot
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

    # Bump this string whenever new one-time migrations are added so they run
    # exactly once on the next deploy and are skipped on all subsequent boots.
    MIGRATION_VERSION = "v3_add_missing_indexes"

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


def _add_enum_values(enum_name: str, values: list):
    """
    ALTER TYPE ... ADD VALUE must run outside any transaction block in PostgreSQL.
    We open a raw AUTOCOMMIT connection for these statements only.
    """
    from sqlalchemy import text
    raw = engine.raw_connection()
    try:
        raw.set_isolation_level(0)  # AUTOCOMMIT — required for ALTER TYPE ADD VALUE
        cur = raw.cursor()
        for val in values:
            try:
                cur.execute(f"ALTER TYPE {enum_name} ADD VALUE IF NOT EXISTS '{val}'")
            except Exception as e:
                # Value already exists or enum doesn't exist — both are fine
                print(f"  ⚠️  {enum_name} ADD VALUE '{val}': {e}")
        cur.close()
    finally:
        raw.close()


def _run_all_migrations(_unused_conn):
    """
    All one-time schema migrations.
    Called only on the very first boot after deployment.
    On subsequent boots this is never called — startup cost drops to 2 queries.

    Each step opens its own connection so a failure in one step cannot
    poison the transaction state for any other step.

    PostgreSQL rule: ALTER TYPE ... ADD VALUE cannot run inside a transaction.
    Those calls go through _add_enum_values() which uses AUTOCOMMIT isolation.
    """
    from sqlalchemy import text

    # ── Helper: run ALTER TABLE statements in their own connection ────────────
    def run(sql: str, params=None):
        with engine.connect() as c:
            c.execute(text(sql), params or {})
            c.commit()

    def run_many(statements: list):
        """Each statement gets its own try/connect so one failure can't abort others."""
        for sql in statements:
            try:
                run(sql)
            except Exception as e:
                # IF NOT EXISTS makes most of these no-ops on repeated runs
                print(f"  ⚠️  (non-fatal) {str(e)[:120]}")

    # ── Presentations tables ──────────────────────────────────────────────────
    print("  Running migration: presentations tables...")
    try:
        from app.models.presentation import Presentation, PresentationSlide
        with engine.connect() as c:
            Presentation.__table__.create(bind=c, checkfirst=True)
            PresentationSlide.__table__.create(bind=c, checkfirst=True)
            c.commit()
        print("  ✅ Presentations tables ensured")
    except Exception as exc:
        print(f"  ⚠️  Presentations table: {exc}")

    # ── questions columns ─────────────────────────────────────────────────────
    print("  Running migration: questions columns...")
    run_many([
        "ALTER TABLE questions ADD COLUMN IF NOT EXISTS shuffle_options BOOLEAN DEFAULT FALSE",
        "ALTER TABLE questions ADD COLUMN IF NOT EXISTS autograde BOOLEAN DEFAULT TRUE",
        "ALTER TABLE questions ADD COLUMN IF NOT EXISTS manual_review_threshold DOUBLE PRECISION",
        "ALTER TABLE questions ADD COLUMN IF NOT EXISTS expected_answer_config JSON DEFAULT '{}'",
        "ALTER TABLE questions ADD COLUMN IF NOT EXISTS gaps_config JSON DEFAULT '[]'",
        "ALTER TABLE questions ADD COLUMN IF NOT EXISTS question_metadata JSON DEFAULT '{}'",
        "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS questions JSON DEFAULT '[]'",
    ])

    # ── Enum: TaskType — MUST use AUTOCOMMIT ──────────────────────────────────
    print("  Running migration: TaskType enum values...")
    _add_enum_values("tasktype", ["listening", "reading"])

    # ── tasks.type / tasks.status: enum → VARCHAR ─────────────────────────────
    print("  Running migration: tasks type/status to VARCHAR...")
    run_many([
        "ALTER TABLE tasks ALTER COLUMN type TYPE VARCHAR(50) USING type::text",
        "ALTER TABLE tasks ALTER COLUMN status TYPE VARCHAR(50) USING status::text",
    ])

    # ── Enum: SubscriptionType — MUST use AUTOCOMMIT ─────────────────────────
    print("  Running migration: SubscriptionType enum...")
    try:
        run("""
            DO $$ BEGIN
                CREATE TYPE subscriptiontype AS ENUM ('free', 'standard', 'premium');
            EXCEPTION WHEN duplicate_object THEN null;
            END $$;
        """)
    except Exception:
        pass
    _add_enum_values("subscriptiontype", [
        "free", "standard", "pro", "FREE", "STANDARD", "PRO"
    ])

    # ── users columns ─────────────────────────────────────────────────────────
    print("  Running migration: users columns...")
    run_many([
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMP WITH TIME ZONE",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_type subscriptiontype",
    ])
    try:
        run("UPDATE users SET subscription_type = 'FREE'::subscriptiontype WHERE subscription_type IS NULL")
    except Exception:
        pass

    # ── Enum: QuestionType — MUST use AUTOCOMMIT ──────────────────────────────
    print("  Running migration: QuestionType enum values...")
    try:
        from app.models.test import QuestionType
        _add_enum_values("questiontype", [e.value for e in QuestionType])
    except Exception as e:
        print(f"  ⚠️  QuestionType enum: {e}")

    # ── courses columns ───────────────────────────────────────────────────────
    print("  Running migration: courses columns...")
    run_many([
        "ALTER TABLE courses ADD COLUMN IF NOT EXISTS thumbnail_path VARCHAR(500)",
        "ALTER TABLE courses ADD COLUMN IF NOT EXISTS target_language VARCHAR(100)",
        "ALTER TABLE courses ADD COLUMN IF NOT EXISTS native_language VARCHAR(100)",
        "ALTER TABLE courses ADD COLUMN IF NOT EXISTS units_count INTEGER DEFAULT 0",
        "ALTER TABLE courses ADD COLUMN IF NOT EXISTS published_units_count INTEGER DEFAULT 0",
        "ALTER TABLE courses ADD COLUMN IF NOT EXISTS content_summary JSONB DEFAULT '{}'::jsonb",
    ])

    # ── units columns ─────────────────────────────────────────────────────────
    print("  Running migration: units columns...")
    run_many([
        "ALTER TABLE units ADD COLUMN IF NOT EXISTS course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE",
        "ALTER TABLE units ADD COLUMN IF NOT EXISTS goals TEXT",
        "ALTER TABLE units ADD COLUMN IF NOT EXISTS homework_blocks JSONB DEFAULT '[]'::jsonb",
        "ALTER TABLE units ADD COLUMN IF NOT EXISTS content_count INTEGER DEFAULT 0",
        "ALTER TABLE units ADD COLUMN IF NOT EXISTS segment_count INTEGER DEFAULT 0",
    ])

    # ── video_progress columns ────────────────────────────────────────────────
    print("  Running migration: video_progress columns...")
    run_many([
        "ALTER TABLE video_progress ADD COLUMN IF NOT EXISTS watch_time_sec DOUBLE PRECISION DEFAULT 0",
        "ALTER TABLE video_progress ADD COLUMN IF NOT EXISTS first_watched_at TIMESTAMP WITH TIME ZONE",
        "ALTER TABLE video_progress ADD COLUMN IF NOT EXISTS last_watched_at TIMESTAMP WITH TIME ZONE",
        "ALTER TABLE video_progress ADD COLUMN IF NOT EXISTS watched_percentage DOUBLE PRECISION DEFAULT 0",
        "ALTER TABLE video_progress ADD COLUMN IF NOT EXISTS progress_percent DOUBLE PRECISION DEFAULT 0",
        "ALTER TABLE video_progress ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE",
        "ALTER TABLE video_progress ADD COLUMN IF NOT EXISTS is_completed BOOLEAN DEFAULT FALSE",
        "ALTER TABLE video_progress ADD CONSTRAINT unique_user_video_progress UNIQUE (user_id, video_id)",
    ])

    # ── course_enrollments table ──────────────────────────────────────────────
    print("  Running migration: course_enrollments table...")
    run_many([
        """CREATE TABLE IF NOT EXISTS course_enrollments (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
            UNIQUE(user_id, course_id)
        )""",
        "CREATE INDEX IF NOT EXISTS idx_course_enrollments_user_id ON course_enrollments(user_id)",
        "CREATE INDEX IF NOT EXISTS idx_course_enrollments_course_id ON course_enrollments(course_id)",
        # Speed up the admin/courses list query: filter by created_by + order by order_index
        "CREATE INDEX IF NOT EXISTS idx_courses_created_by ON courses(created_by)",
        "CREATE INDEX IF NOT EXISTS idx_courses_order_index ON courses(order_index ASC, created_at DESC)",
        # Speed up units listing per course
        "CREATE INDEX IF NOT EXISTS idx_units_course_id_order ON units(course_id, order_index ASC)",
    ])

    # ── task_submissions + tasks extra columns ────────────────────────────────
    print("  Running migration: task_submissions + tasks columns...")
    run_many([
        "ALTER TABLE task_submissions ADD COLUMN IF NOT EXISTS attempt_number INTEGER DEFAULT 1",
        "ALTER TABLE task_submissions ADD COLUMN IF NOT EXISTS time_spent_minutes INTEGER DEFAULT 0",
        "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS instructions TEXT",
        "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS auto_task_type VARCHAR(50)",
        "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS allow_late_submissions BOOLEAN DEFAULT FALSE",
        "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS late_penalty_percent INTEGER DEFAULT 0",
        "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS max_attempts INTEGER DEFAULT 1",
        "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assigned_cohorts JSON DEFAULT '[]'",
        "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assigned_students JSON DEFAULT '[]'",
        "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assign_to_all BOOLEAN DEFAULT FALSE",
        "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS send_assignment_email BOOLEAN DEFAULT FALSE",
        "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS reminder_days_before INTEGER DEFAULT 1",
        "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS send_results_email BOOLEAN DEFAULT FALSE",
        "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS send_teacher_copy BOOLEAN DEFAULT FALSE",
        "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS notify_on_assignment BOOLEAN DEFAULT FALSE",
        "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS notify_reminder_days INTEGER DEFAULT 1",
        "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS notify_on_submit BOOLEAN DEFAULT FALSE",
        "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS notify_on_grade BOOLEAN DEFAULT FALSE",
    ])

    # ── Enum: SubscriptionName — MUST use AUTOCOMMIT ──────────────────────────
    print("  Running migration: SubscriptionName enum + subscription sync...")
    _add_enum_values("subscriptionname", ["standard", "pro"])

    # Consolidate legacy PREMIUM catalog rows into standard (idempotent).
    print("  Running migration: premium -> standard catalog consolidation...")
    try:
        run("""
            INSERT INTO subscriptions (name, price, is_active)
            SELECT 'standard'::subscriptionname, COALESCE(p.price, 12.00), true
            FROM subscriptions p
            WHERE lower(p.name::text) = 'premium'
              AND NOT EXISTS (
                SELECT 1 FROM subscriptions WHERE lower(name::text) = 'standard'
              )
            LIMIT 1
        """)
    except Exception as e:
        print(f"  ⚠️  standard catalog insert (non-fatal): {e}")

    try:
        run("""
            WITH std AS (
                SELECT id FROM subscriptions
                WHERE lower(name::text) = 'standard' AND is_active IS TRUE
                ORDER BY id LIMIT 1
            ),
            prem AS (
                SELECT id FROM subscriptions WHERE lower(name::text) = 'premium'
            )
            UPDATE user_subscriptions us
            SET subscription_id = (SELECT id FROM std)
            WHERE subscription_id IN (SELECT id FROM prem)
              AND EXISTS (SELECT 1 FROM std)
        """)
        print("  ✅ Repointed user_subscriptions from premium to standard")
    except Exception as e:
        print(f"  ⚠️  user_subscriptions premium->standard (non-fatal): {e}")

    try:
        run("""
            UPDATE subscriptions SET is_active = false
            WHERE lower(name::text) = 'premium'
        """)
    except Exception as e:
        print(f"  ⚠️  deactivate premium catalog (non-fatal): {e}")

    try:
        run("""
            UPDATE users SET subscription_type = 'standard'::subscriptiontype
            WHERE lower(subscription_type::text) = 'premium'
        """)
        print("  ✅ Migrated users.subscription_type premium -> standard")
    except Exception as e:
        print(f"  ⚠️  users premium->standard (non-fatal): {e}")

    try:
        run("""
            DELETE FROM subscriptions s
            WHERE lower(s.name::text) = 'premium'
              AND NOT EXISTS (
                SELECT 1 FROM user_subscriptions us WHERE us.subscription_id = s.id
              )
        """)
        print("  ✅ Removed unused premium catalog rows")
    except Exception as e:
        print(f"  ⚠️  delete premium catalog (non-fatal): {e}")

    # Sync subscription_type on users from active subscriptions
    try:
        run("""
            UPDATE users u
            SET subscription_type = 'standard'::subscriptiontype
            FROM user_subscriptions us
            JOIN subscriptions s ON s.id = us.subscription_id
            WHERE u.id = us.user_id
              AND us.is_active = true
              AND lower(s.name::text) = 'standard'
              AND lower(u.subscription_type::text) = 'free'
        """)
        run("""
            UPDATE users u
            SET subscription_type = 'pro'::subscriptiontype
            FROM user_subscriptions us
            JOIN subscriptions s ON s.id = us.subscription_id
            WHERE u.id = us.user_id
              AND us.is_active = true
              AND lower(s.name::text) = 'pro'
              AND lower(u.subscription_type::text) = 'free'
        """)
        print("  ✅ Migrated subscription types from UserSubscription")
    except Exception as e:
        print(f"  ⚠️  Subscription sync (non-fatal): {e}")

    print("  ✅ All migrations complete")



@app.on_event("startup")
async def ensure_ai_cache_image_index():
    """
    Ensure the partial index on ai_cache for image lookups exists.
    The table is created by Base.metadata.create_all (AICache imported above).
    The index is idempotent — IF NOT EXISTS makes it safe on every boot.

    The WHERE predicate must use the exact enum label stored in PostgreSQL.
    Older deployments may have uppercase labels (IMAGE) created by SQLAlchemy
    create_all, while migrations use lowercase (image). We detect the actual
    label at runtime so the index creation works on both.
    """
    from sqlalchemy import text as _text
    try:
        with engine.connect() as conn:
            # Detect the actual enum label stored in this DB (IMAGE or image).
            row = conn.execute(_text("""
                SELECT e.enumlabel
                  FROM pg_enum e
                  JOIN pg_type t ON t.oid = e.enumtypid
                 WHERE t.typname = 'cache_content_type'
                   AND LOWER(e.enumlabel) = 'image'
                 LIMIT 1
            """)).fetchone()

            if row is None:
                print("⚠️  [startup] cache_content_type enum missing 'image' label — skipping index", flush=True)
                return

            # Use the exact label (IMAGE or image) from the DB.
            image_label = row[0]
            conn.execute(_text(f"""
                CREATE INDEX IF NOT EXISTS ix_ai_cache_image_lookup
                    ON ai_cache (cache_key)
                    WHERE content_type = '{image_label}'::cache_content_type
            """))
            conn.commit()
        print("\u2705 [startup] ai_cache image index ensured", flush=True)
    except Exception as exc:
        print(f"\u26a0\ufe0f  [startup] ai_cache image index (non-fatal): {exc}", flush=True)

# ── Utility endpoints ─────────────────────────────────────────────────────────


@app.delete("/api/v1/admin/image-cache", tags=["Admin"])
async def evict_image_cache(days: int = 30):
    """
    Delete image cache entries not accessed in the last ``days`` days.
    Defaults to 30 days.  Returns counts of deleted and remaining rows.
    """
    from app.core.database import SessionLocal
    from app.services.image_cache_service import (
        evict_old_image_cache_entries,
        count_image_cache_entries,
    )
    db = SessionLocal()
    try:
        total_before = count_image_cache_entries(db)
        deleted = evict_old_image_cache_entries(db, days=days)
        return {
            "deleted": deleted,
            "remaining": total_before - deleted,
            "days_threshold": days,
        }
    finally:
        db.close()


@app.get("/api/v1/admin/image-cache/stats", tags=["Admin"])
async def image_cache_stats():
    """Return total entry count and the 10 most-hit cached images."""
    from app.core.database import SessionLocal
    from app.models.ai_cache import AICache, CacheContentType
    db = SessionLocal()
    try:
        total = (
            db.query(AICache)
            .filter(AICache.content_type == CacheContentType.IMAGE)
            .count()
        )
        top_hits = (
            db.query(AICache)
            .filter(AICache.content_type == CacheContentType.IMAGE)
            .order_by(AICache.usage_count.desc())
            .limit(10)
            .all()
        )
        return {
            "total_entries": total,
            "top_hits": [
                {
                    "cache_key": r.cache_key[:16] + "\u2026",
                    "hit_count": r.usage_count,
                    "model": (r.input_json or {}).get("model", "?"),
                    "created_at": r.created_at.isoformat() if r.created_at else None,
                    "last_accessed_at": r.last_accessed_at.isoformat() if r.last_accessed_at else None,
                }
                for r in top_hits
            ],
        }
    finally:
        db.close()


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
    # Serve actual build artifacts (JS, CSS, images) from the dist folder.
    app.mount("/assets", StaticFiles(directory="frontend/dist/assets"), name="assets")


# ── SPA catch-all ──────────────────────────────────────────────────────────────
# Must be declared LAST so every /api/v1/... route registered above takes
# precedence.  For any path that is not an API route:
#   - if the file exists in frontend/dist (e.g. favicon.ico), serve it directly
#   - otherwise serve index.html so React Router handles the URL
if os.path.exists("frontend/dist"):
    from fastapi.responses import FileResponse as _FileResponse

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        """Serve the React SPA for any non-API path, enabling client-side routing on reload."""
        # Stores resolved path to the requested file inside the built frontend.
        candidate = os.path.join("frontend/dist", full_path)
        if os.path.isfile(candidate):
            return _FileResponse(candidate)
        # Fall back to index.html so React Router handles the deep-link.
        return _FileResponse("frontend/dist/index.html")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)