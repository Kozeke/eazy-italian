from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from app.core.config import settings

# Fix the database URL for SQLAlchemy compatibility
database_url = settings.DATABASE_URL
if database_url.startswith("postgres://"):
    database_url = database_url.replace("postgres://", "postgresql://", 1)

# pool_pre_ping=True: test each connection before use so stale connections after
# Render cold-start / Postgres idle-timeout are discarded instead of erroring.
# pool_recycle=300: force-replace connections older than 5 min to avoid hitting
# Render's TCP idle-timeout which closes them server-side at ~300 s.
# pool_size / max_overflow: Basic-256mb Postgres allows ~20 connections; keep
# the backend well within that limit.
engine = create_engine(
    database_url,
    pool_pre_ping=True,
    pool_recycle=300,
    pool_size=5,
    max_overflow=10,
    connect_args={"connect_timeout": 10},
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
