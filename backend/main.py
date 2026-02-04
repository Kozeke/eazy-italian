from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os

from app.core.config import settings
from app.api.v1.api import api_router
from app.core.database import engine
from app.core.database import Base

# Import all models so SQLAlchemy can create tables
from app.models import Course, Unit, User, Video, Task, Test, Progress, EmailCampaign, VideoProgress

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    docs_url="/docs",
    redoc_url="/redoc",
)

# Set up CORS - Must be before including routers
print(f"Setting up CORS with origins: {settings.cors_origins_list}")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=3600,  # Cache preflight requests for 1 hour
)

# Mount static files BEFORE API router to avoid route conflicts
# Handle both local development and Docker environments
backend_dir = os.path.dirname(os.path.abspath(__file__))

# Check if we're in Docker - more accurate check
# In Docker, the working directory is /app and backend_dir would be /app
# In local dev, backend_dir would be something like C:\...\eazy-italian\backend
# Also check if we're on Windows (not Docker)
is_docker = (os.name != 'nt' and  # Not Windows
             os.path.exists("/app") and 
             os.getcwd() == "/app" and 
             backend_dir == "/app")

if is_docker:
    # Docker environment - use /app/uploads
    uploads_path = "/app/uploads"
else:
    # Local development - uploads should be at project root (parent of backend)
    uploads_path = os.path.join(os.path.dirname(backend_dir), "uploads")

print(f"[DEBUG] Backend dir: {backend_dir}")
print(f"[DEBUG] Uploads path: {uploads_path}")
print(f"[DEBUG] Uploads path exists: {os.path.exists(uploads_path)}")

# Create uploads directory if it doesn't exist and mount static files
try:
    os.makedirs(uploads_path, exist_ok=True)
    os.makedirs(os.path.join(uploads_path, "thumbnails"), exist_ok=True)
    if os.path.exists(uploads_path):
        # Verify a test file exists
        test_file = os.path.join(uploads_path, "thumbnails", "video_5_A1.png")
        print(f"[DEBUG] Test file exists: {os.path.exists(test_file)}")
        if os.path.exists(test_file):
            print(f"[DEBUG] Test file path: {test_file}")
        
        # Mount static files BEFORE API router
        app.mount("/api/v1/static", StaticFiles(directory=uploads_path), name="uploads")
        print(f"✅ Static files mounted at /api/v1/static from {uploads_path}")
    else:
        print(f"⚠️  Warning: Uploads directory does not exist at {uploads_path}")
except PermissionError as e:
    print(f"⚠️  Warning: Permission denied creating uploads directory at {uploads_path}: {e}")
    print(f"⚠️  Static file serving disabled. Please create the directory manually with proper permissions.")
except Exception as e:
    print(f"⚠️  Warning: Error setting up uploads directory: {e}")
    import traceback
    traceback.print_exc()

# Include API router AFTER static mount
app.include_router(api_router, prefix=settings.API_V1_STR)


@app.on_event("startup")
async def startup_event():
    # Debug: Check if admin routes are registered
    print("\n=== Checking Admin Routes ===")
    admin_routes = [r for r in app.routes if hasattr(r, 'path') and '/admin' in str(r.path)]
    if admin_routes:
        print(f"✅ Found {len(admin_routes)} admin routes")
        for route in admin_routes[:5]:  # Print first 5
            methods = getattr(route, 'methods', set())
            path = getattr(route, 'path', 'N/A')
            print(f"  {', '.join(methods)} {path}")
    else:
        print("⚠️  WARNING: No admin routes found! This may indicate a registration issue.")
    print("=== End Route Check ===\n")
    
    # Create database tables with retry logic
    import time
    from sqlalchemy.exc import OperationalError
    from sqlalchemy import text
    
    max_retries = 5
    retry_delay = 2
    
    for attempt in range(max_retries):
        try:
            Base.metadata.create_all(bind=engine)
            print("Database tables created successfully")
            
            # Run migrations for missing columns and tables (idempotent - safe to run multiple times)
            try:
                with engine.connect() as conn:
                    # Add missing columns to questions table if they don't exist
                    question_migrations = [
                        ("shuffle_options", "BOOLEAN DEFAULT FALSE"),
                        ("autograde", "BOOLEAN DEFAULT TRUE"),
                        ("manual_review_threshold", "DOUBLE PRECISION"),
                        ("expected_answer_config", "JSON DEFAULT '{}'"),
                        ("gaps_config", "JSON DEFAULT '[]'"),
                        ("question_metadata", "JSON DEFAULT '{}'"),
                    ]
                    
                    for column_name, column_def in question_migrations:
                        # Check if column exists
                        check_query = text("""
                            SELECT column_name 
                            FROM information_schema.columns 
                            WHERE table_name = 'questions' 
                            AND column_name = :column_name
                        """)
                        result = conn.execute(check_query, {"column_name": column_name})
                        if result.fetchone() is None:
                            # Column doesn't exist, add it
                            migration_sql = text(f"""
                                ALTER TABLE questions 
                                ADD COLUMN IF NOT EXISTS {column_name} {column_def}
                            """)
                            conn.execute(migration_sql)
                            conn.commit()
                            print(f"✅ Added missing column: questions.{column_name}")
                    
                    # Add missing columns to users table
                    user_migrations = [
                        ("last_login", "TIMESTAMP WITH TIME ZONE"),
                    ]
                    
                    for column_name, column_def in user_migrations:
                        # Check if column exists
                        check_query = text("""
                            SELECT column_name 
                            FROM information_schema.columns 
                            WHERE table_name = 'users' 
                            AND column_name = :column_name
                        """)
                        result = conn.execute(check_query, {"column_name": column_name})
                        if result.fetchone() is None:
                            # Column doesn't exist, add it
                            migration_sql = text(f"""
                                ALTER TABLE users 
                                ADD COLUMN IF NOT EXISTS {column_name} {column_def}
                            """)
                            conn.execute(migration_sql)
                            conn.commit()
                            print(f"✅ Added missing column: users.{column_name}")
                    
                    # Create courses table if it doesn't exist
                    check_courses_table = text("""
                        SELECT table_name 
                        FROM information_schema.tables 
                        WHERE table_name = 'courses'
                    """)
                    result = conn.execute(check_courses_table)
                    if result.fetchone() is None:
                        print("Creating courses table...")
                        
                        # Create ENUM types for course level and status if they don't exist
                        try:
                            create_level_enum = text("""
                                DO $$ BEGIN
                                    CREATE TYPE courselevel AS ENUM ('A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'mixed');
                                EXCEPTION
                                    WHEN duplicate_object THEN null;
                                END $$;
                            """)
                            conn.execute(create_level_enum)
                            conn.commit()
                        except Exception as e:
                            print(f"⚠️  Level enum note: {e}")
                        
                        try:
                            create_status_enum = text("""
                                DO $$ BEGIN
                                    CREATE TYPE coursestatus AS ENUM ('draft', 'scheduled', 'published', 'archived');
                                EXCEPTION
                                    WHEN duplicate_object THEN null;
                                END $$;
                            """)
                            conn.execute(create_status_enum)
                            conn.commit()
                        except Exception as e:
                            print(f"⚠️  Status enum note: {e}")
                        
                        # Create courses table with proper types
                        create_courses_table = text("""
                            CREATE TABLE courses (
                                id SERIAL PRIMARY KEY,
                                title VARCHAR(255) NOT NULL,
                                description TEXT,
                                level courselevel NOT NULL,
                                status coursestatus NOT NULL DEFAULT 'draft',
                                publish_at TIMESTAMP WITH TIME ZONE,
                                order_index INTEGER NOT NULL DEFAULT 0,
                                thumbnail_url VARCHAR(500),
                                duration_hours INTEGER,
                                tags JSONB DEFAULT '[]'::jsonb,
                                slug VARCHAR(255) UNIQUE,
                                meta_title VARCHAR(255),
                                meta_description TEXT,
                                is_visible_to_students BOOLEAN NOT NULL DEFAULT FALSE,
                                settings JSONB DEFAULT '{}'::jsonb,
                                created_by INTEGER NOT NULL REFERENCES users(id),
                                updated_by INTEGER REFERENCES users(id),
                                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                                updated_at TIMESTAMP WITH TIME ZONE
                            )
                        """)
                        conn.execute(create_courses_table)
                        conn.commit()
                        print("✅ Created courses table")
                    
                    # Add course_id column to units table if it doesn't exist
                    check_course_id = text("""
                        SELECT column_name 
                        FROM information_schema.columns 
                        WHERE table_name = 'units' 
                        AND column_name = 'course_id'
                    """)
                    result = conn.execute(check_course_id)
                    if result.fetchone() is None:
                        print("Adding course_id column to units table...")
                        # First check if courses table exists
                        check_courses_exists = text("""
                            SELECT table_name 
                            FROM information_schema.tables 
                            WHERE table_name = 'courses'
                        """)
                        courses_exists = conn.execute(check_courses_exists).fetchone() is not None
                        
                        if courses_exists:
                            add_course_id = text("""
                                ALTER TABLE units 
                                ADD COLUMN course_id INTEGER REFERENCES courses(id) ON DELETE SET NULL
                            """)
                            conn.execute(add_course_id)
                            conn.commit()
                            print("✅ Added course_id column to units table")
                            
                            # Create index for better performance
                            try:
                                create_index = text("""
                                    CREATE INDEX IF NOT EXISTS idx_units_course_id ON units(course_id)
                                """)
                                conn.execute(create_index)
                                conn.commit()
                                print("✅ Created index on units.course_id")
                            except Exception as idx_error:
                                print(f"⚠️  Index creation note: {idx_error}")
                        else:
                            print("⚠️  Courses table doesn't exist yet, skipping course_id column")
                    
                    # Add thumbnail_path column to courses table if it doesn't exist
                    check_thumbnail_path = text("""
                        SELECT column_name 
                        FROM information_schema.columns 
                        WHERE table_name = 'courses' 
                        AND column_name = 'thumbnail_path'
                    """)
                    result = conn.execute(check_thumbnail_path)
                    if result.fetchone() is None:
                        print("Adding thumbnail_path column to courses table...")
                        add_thumbnail_path = text("""
                            ALTER TABLE courses 
                            ADD COLUMN thumbnail_path VARCHAR(500)
                        """)
                        conn.execute(add_thumbnail_path)
                        conn.commit()
                        print("✅ Added thumbnail_path column to courses table")
                    
                    # Create or migrate video_progress table
                    check_video_progress_table = text("""
                        SELECT table_name 
                        FROM information_schema.tables 
                        WHERE table_name = 'video_progress'
                    """)
                    result = conn.execute(check_video_progress_table)
                    table_exists = result.fetchone() is not None
                    
                    if not table_exists:
                        print("Creating video_progress table...")
                        create_video_progress_table = text("""
                            CREATE TABLE video_progress (
                                id SERIAL PRIMARY KEY,
                                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                                video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
                                watched_percentage DOUBLE PRECISION NOT NULL DEFAULT 0.0,
                                progress_percent DOUBLE PRECISION NOT NULL DEFAULT 0.0,
                                last_position_sec DOUBLE PRECISION NOT NULL DEFAULT 0.0,
                                watch_time_sec DOUBLE PRECISION NOT NULL DEFAULT 0.0,
                                completed BOOLEAN NOT NULL DEFAULT FALSE,
                                is_completed BOOLEAN NOT NULL DEFAULT FALSE,
                                first_watched_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
                                last_watched_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
                                completed_at TIMESTAMP WITH TIME ZONE,
                                UNIQUE(user_id, video_id)
                            )
                        """)
                        conn.execute(create_video_progress_table)
                        conn.commit()
                        
                        # Create indexes
                        create_indexes = [
                            text("CREATE INDEX IF NOT EXISTS idx_video_progress_user_id ON video_progress(user_id)"),
                            text("CREATE INDEX IF NOT EXISTS idx_video_progress_video_id ON video_progress(video_id)"),
                        ]
                        for idx_sql in create_indexes:
                            conn.execute(idx_sql)
                        conn.commit()
                        print("✅ Created video_progress table")
                    else:
                        # Table exists - check if it has the correct columns
                        check_user_id = text("""
                            SELECT column_name 
                            FROM information_schema.columns 
                            WHERE table_name = 'video_progress' 
                            AND column_name = 'user_id'
                        """)
                        result = conn.execute(check_user_id)
                        if result.fetchone() is None:
                            # Check if it has student_id instead
                            check_student_id = text("""
                                SELECT column_name 
                                FROM information_schema.columns 
                                WHERE table_name = 'video_progress' 
                                AND column_name = 'student_id'
                            """)
                            result = conn.execute(check_student_id)
                            if result.fetchone() is not None:
                                # Rename student_id to user_id
                                print("Migrating video_progress table: renaming student_id to user_id...")
                                rename_column = text("ALTER TABLE video_progress RENAME COLUMN student_id TO user_id")
                                conn.execute(rename_column)
                                conn.commit()
                                print("✅ Renamed student_id to user_id in video_progress table")
                        
                        # Check and add missing columns
                        column_checks = [
                            ("watched_percentage", "DOUBLE PRECISION NOT NULL DEFAULT 0.0"),
                            ("progress_percent", "DOUBLE PRECISION NOT NULL DEFAULT 0.0"),
                            ("last_position_sec", "DOUBLE PRECISION NOT NULL DEFAULT 0.0"),
                            ("watch_time_sec", "DOUBLE PRECISION NOT NULL DEFAULT 0.0"),
                            ("completed", "BOOLEAN NOT NULL DEFAULT FALSE"),
                            ("is_completed", "BOOLEAN NOT NULL DEFAULT FALSE"),
                            ("first_watched_at", "TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL"),
                            ("last_watched_at", "TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL"),
                            ("completed_at", "TIMESTAMP WITH TIME ZONE"),
                        ]
                        
                        for column_name, column_def in column_checks:
                            check_col = text(f"""
                                SELECT column_name 
                                FROM information_schema.columns 
                                WHERE table_name = 'video_progress' 
                                AND column_name = '{column_name}'
                            """)
                            result = conn.execute(check_col)
                            if result.fetchone() is None:
                                print(f"Adding {column_name} column to video_progress table...")
                                add_col = text(f"ALTER TABLE video_progress ADD COLUMN {column_name} {column_def}")
                                conn.execute(add_col)
                                conn.commit()
                                print(f"✅ Added {column_name} column to video_progress table")
                        
                        # Check if unique constraint exists
                        check_constraint = text("""
                            SELECT constraint_name 
                            FROM information_schema.table_constraints 
                            WHERE table_name = 'video_progress' 
                            AND constraint_type = 'UNIQUE'
                            AND constraint_name = 'unique_user_video_progress'
                        """)
                        result = conn.execute(check_constraint)
                        if result.fetchone() is None:
                            print("Adding unique constraint to video_progress table...")
                            add_constraint = text("""
                                ALTER TABLE video_progress 
                                ADD CONSTRAINT unique_user_video_progress UNIQUE (user_id, video_id)
                            """)
                            try:
                                conn.execute(add_constraint)
                                conn.commit()
                                print("✅ Added unique constraint to video_progress table")
                            except Exception as e:
                                print(f"⚠️  Constraint may already exist: {e}")
            except Exception as migration_error:
                # Don't fail startup if migrations fail - log and continue
                print(f"⚠️  Migration check failed (non-critical): {migration_error}")
                import traceback
                traceback.print_exc()
            
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

# Health check endpoint (must be before static file mounting)
@app.get("/health")
async def health_check():
    return {"status": "healthy"}

# CORS test endpoint - Test if CORS is properly configured
@app.get("/cors-test")
async def cors_test():
    return {
        "message": "CORS is working", 
        "origins": settings.cors_origins_list,
        "environment": settings.ENVIRONMENT
    }

# OPTIONS handler for CORS preflight - Explicit handler for debugging
@app.options("/api/v1/auth/login")
async def options_login():
    return {"message": "OK"}

# Root endpoint
@app.get("/")
async def root():
    return {
        "message": "Eazy Italian API", 
        "version": "1.0.0", 
        "status": "deployed", 
        "database": "connected",
        "cors_origins": settings.cors_origins_list
    }

# Mount static files for frontend at /static path
if os.path.exists("frontend/dist"):
    app.mount("/static", StaticFiles(directory="frontend/dist", html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
