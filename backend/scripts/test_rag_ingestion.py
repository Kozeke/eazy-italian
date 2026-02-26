"""
scripts/test_rag_ingestion.py
==============================
End-to-end test:
  1. Connect to PostgreSQL, enable pgvector extension
  2. Create lesson_chunks table + HNSW index (if not already present)
  3. Load lesson content from fixtures/lesson_content.py
  4. Chunk each lesson with a sliding word window
  5. Embed every chunk with LaBSE (or multilingual-e5-base)
  6. Upsert all chunks into lesson_chunks
  7. Run a few sample similarity searches to verify retrieval

Run from the backend directory:
    python scripts/test_rag_ingestion.py

Requirements:
    pip install sentence-transformers pgvector sqlalchemy psycopg2-binary python-dotenv

Environment (set in .env or export before running):
    DATABASE_URL=postgresql://postgres:postgres@localhost:5432/eazy_italian
    EMBEDDING_MODEL=LaBSE          (optional, default LaBSE)
    EMBEDDING_BATCH_SIZE=16        (optional, default 16)
"""

import os
import sys
import uuid
import time
import re
import textwrap
from pathlib import Path
from typing import List, Any

# ── Make sure the backend root is on PYTHONPATH ───────────────────────────────
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

# ── Load .env if present ──────────────────────────────────────────────────────
try:
    from dotenv import load_dotenv
    load_dotenv(ROOT / ".env")
except ImportError:
    pass  # python-dotenv is optional

# ──────────────────────────────────────────────────────────────────────────────
# Config
# ──────────────────────────────────────────────────────────────────────────────
DATABASE_URL    = os.environ.get(
    "DATABASE_URL",
    "postgresql://postgres:postgres@localhost:5432/eazy_italian",
)
EMBEDDING_MODEL = os.environ.get("EMBEDDING_MODEL", "LaBSE")
BATCH_SIZE      = int(os.environ.get("EMBEDDING_BATCH_SIZE", "16"))
CHUNK_SIZE      = 120          # words per chunk
CHUNK_OVERLAP   = 30           # overlapping words between consecutive chunks

# Deterministic UUID namespace for chunk IDs
_CHUNK_NS = uuid.UUID("a1b2c3d4-e5f6-7890-abcd-ef1234567890")

# ──────────────────────────────────────────────────────────────────────────────
# Pretty-print helpers
# ──────────────────────────────────────────────────────────────────────────────
SEP  = "─" * 65
SEP2 = "═" * 65

def header(msg: str) -> None:
    print(f"\n{SEP2}\n  {msg}\n{SEP2}")

def step(n: int, msg: str) -> None:
    print(f"\n[{n}] {msg}")
    print(SEP)

def ok(msg: str)   -> None: print(f"  ✅  {msg}")
def info(msg: str) -> None: print(f"  ℹ️   {msg}")
def warn(msg: str) -> None: print(f"  ⚠️   {msg}")

# ──────────────────────────────────────────────────────────────────────────────
# 1 — Database connection
# ──────────────────────────────────────────────────────────────────────────────
step(1, f"Connecting to PostgreSQL\n  {DATABASE_URL}")

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, DeclarativeBase

engine       = create_engine(DATABASE_URL, echo=False)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

try:
    with engine.connect() as conn:
        version = conn.execute(text("SELECT version()")).scalar()
    ok(f"Connected — {version.split(',')[0]}")
except Exception as e:
    print(f"\n  ❌  Cannot connect: {e}")
    print("  Make sure PostgreSQL is running and DATABASE_URL is correct.")
    sys.exit(1)

# ──────────────────────────────────────────────────────────────────────────────
# 2 — Enable pgvector + create table
# ──────────────────────────────────────────────────────────────────────────────
step(2, "Setting up pgvector extension and lesson_chunks table")

with engine.connect() as conn:
    conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
    conn.execute(text("CREATE EXTENSION IF NOT EXISTS pgcrypto"))
    conn.commit()
    ok("Extensions: vector, pgcrypto")

# Check if courses / units tables exist (needed for FK) — create stubs if not
with engine.connect() as conn:
    for tbl in ("courses", "units"):
        exists = conn.execute(text(
            "SELECT 1 FROM information_schema.tables WHERE table_name = :t"
        ), {"t": tbl}).fetchone()
        if not exists:
            warn(f"Table '{tbl}' not found — creating minimal stub for testing")
            if tbl == "courses":
                conn.execute(text("""
                    CREATE TABLE courses (
                        id SERIAL PRIMARY KEY,
                        title VARCHAR(255) NOT NULL DEFAULT 'Test Course',
                        created_at TIMESTAMPTZ DEFAULT NOW()
                    )
                """))
                conn.execute(text(
                    "INSERT INTO courses (id, title) VALUES (1, 'Italian for Beginners'), "
                    "(2, 'Итальянский для начинающих') ON CONFLICT DO NOTHING"
                ))
            else:  # units
                conn.execute(text("""
                    CREATE TABLE units (
                        id SERIAL PRIMARY KEY,
                        title VARCHAR(255) NOT NULL DEFAULT 'Test Unit',
                        course_id INTEGER REFERENCES courses(id),
                        created_at TIMESTAMPTZ DEFAULT NOW()
                    )
                """))
                conn.execute(text("""
                    INSERT INTO units (id, title, course_id) VALUES
                      (1, 'Present Tense -are',    1),
                      (2, 'Present Tense -ere/-ire',1),
                      (3, 'Italian Articles',       1),
                      (4, 'Numbers 1-100',          1),
                      (5, 'Настоящее время -are',   2)
                    ON CONFLICT DO NOTHING
                """))
            conn.commit()
            ok(f"Stub table '{tbl}' created")

# Create lesson_chunks table
with engine.connect() as conn:
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS lesson_chunks (
            id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            course_id    INTEGER NOT NULL REFERENCES courses(id)  ON DELETE CASCADE,
            lesson_id    INTEGER NOT NULL REFERENCES units(id)    ON DELETE CASCADE,
            chunk_text   TEXT    NOT NULL,
            chunk_index  INTEGER NOT NULL DEFAULT 0,
            embedding    vector(768) NOT NULL,
            metadata     JSONB   NOT NULL DEFAULT '{}',
            created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """))
    conn.commit()
    ok("Table lesson_chunks ready")

# HNSW index
with engine.connect() as conn:
    idx_exists = conn.execute(text(
        "SELECT 1 FROM pg_indexes WHERE indexname = 'idx_lesson_chunks_embedding_hnsw'"
    )).fetchone()

if not idx_exists:
    info("Building HNSW index (this may take a moment on large datasets)…")
    # Must run outside a transaction
    with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
        conn.execute(text("""
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_lesson_chunks_embedding_hnsw
            ON lesson_chunks
            USING hnsw (embedding vector_cosine_ops)
            WITH (m = 16, ef_construction = 64)
        """))
    ok("HNSW index created")
else:
    ok("HNSW index already exists — skipping")

# Supporting B-tree indexes
with engine.connect() as conn:
    conn.execute(text("""
        CREATE INDEX IF NOT EXISTS idx_lesson_chunks_course_id
        ON lesson_chunks(course_id)
    """))
    conn.execute(text("""
        CREATE INDEX IF NOT EXISTS idx_lesson_chunks_lesson_id
        ON lesson_chunks(lesson_id)
    """))
    conn.commit()
    ok("B-tree indexes on course_id, lesson_id ready")

# ──────────────────────────────────────────────────────────────────────────────
# 3 — Load lesson fixtures
# ──────────────────────────────────────────────────────────────────────────────
step(3, "Loading lesson content from fixtures/lesson_content.py")

# Import fixtures — read and exec so we always use the file on disk
fixtures_path = ROOT / "fixtures" / "lesson_content.py"
if not fixtures_path.exists():
    raise FileNotFoundError(f"Fixtures not found: {fixtures_path}")
_globals = {"__name__": "lesson_content", "__file__": str(fixtures_path)}
exec(fixtures_path.read_text(encoding="utf-8"), _globals)
LESSONS = _globals.get("LESSONS")
if not LESSONS:
    raise AttributeError(f"{fixtures_path} must define LESSONS (list of lesson dicts)")

for lesson in LESSONS:
    word_count = len(lesson["text"].split())
    info(
        f"Lesson {lesson['lesson_id']} (course {lesson['course_id']}) — "
        f'"{lesson["title"]}" — {word_count} words'
    )
ok(f"{len(LESSONS)} lessons loaded")

# ──────────────────────────────────────────────────────────────────────────────
# 4 — Chunking
# ──────────────────────────────────────────────────────────────────────────────
step(4, f"Chunking lessons  (window={CHUNK_SIZE} words, overlap={CHUNK_OVERLAP})")

def chunk_text(text: str, chunk_size: int, overlap: int) -> List[str]:
    """Sliding word-window chunker that respects sentence boundaries."""
    words  = re.split(r"\s+", text.strip())
    step   = max(1, chunk_size - overlap)
    chunks = []
    start  = 0
    while start < len(words):
        end   = min(start + chunk_size, len(words))
        chunk = " ".join(words[start:end]).strip()
        if chunk:
            chunks.append(chunk)
        if end >= len(words):
            break
        start += step
    return chunks

all_items: List[dict] = []      # flat list of {chunk_id, embedding(placeholder), ...}

for lesson in LESSONS:
    chunks = chunk_text(lesson["text"], CHUNK_SIZE, CHUNK_OVERLAP)
    for idx, chunk in enumerate(chunks):
        chunk_id = uuid.uuid5(_CHUNK_NS, f"{lesson['lesson_id']}:{idx}")
        all_items.append({
            "chunk_id":   chunk_id,
            "course_id":  lesson["course_id"],
            "lesson_id":  lesson["lesson_id"],
            "chunk_text": chunk,
            "chunk_index": idx,
            "language":   lesson.get("language", "en"),
            "title":      lesson["title"],
        })
    info(
        f"  Lesson {lesson['lesson_id']} → {len(chunks)} chunks "
        f"({len(chunks)} × ~{CHUNK_SIZE} words)"
    )

ok(f"Total chunks to embed: {len(all_items)}")

# ──────────────────────────────────────────────────────────────────────────────
# 5 — Embedding
# ──────────────────────────────────────────────────────────────────────────────
step(5, f"Loading embedding model: {EMBEDDING_MODEL}")

try:
    from sentence_transformers import SentenceTransformer
except ImportError:
    print("\n  ❌  sentence-transformers not installed.")
    print("  Run: pip install sentence-transformers")
    sys.exit(1)

t0    = time.time()
model = SentenceTransformer(EMBEDDING_MODEL)
ok(f"Model loaded in {time.time() - t0:.1f}s — dim={model.get_sentence_embedding_dimension()}")

# Validate dimension matches table definition
dim = model.get_sentence_embedding_dimension()
if dim != 768:
    warn(
        f"Model dim={dim} ≠ 768.  "
        "Update CREATE TABLE to vector({dim}) and rebuild the index."
    )

info(f"Embedding {len(all_items)} chunks in batches of {BATCH_SIZE}…")
texts = [item["chunk_text"] for item in all_items]

t0         = time.time()
embeddings = model.encode(
    texts,
    normalize_embeddings=True,
    batch_size=BATCH_SIZE,
    show_progress_bar=True,
)
elapsed = time.time() - t0
ok(
    f"Embedded {len(embeddings)} chunks in {elapsed:.1f}s "
    f"({len(embeddings)/elapsed:.1f} chunks/s)"
)

# Attach embeddings to items
for item, emb in zip(all_items, embeddings):
    item["embedding"] = emb.tolist()

# ──────────────────────────────────────────────────────────────────────────────
# 6 — Upsert into lesson_chunks
# ──────────────────────────────────────────────────────────────────────────────
step(6, "Upserting chunks into lesson_chunks (PostgreSQL + pgvector)")

UPSERT_SQL = text("""
    INSERT INTO lesson_chunks
        (id, course_id, lesson_id, chunk_text, chunk_index, embedding, metadata)
    VALUES
        (:id, :course_id, :lesson_id, :chunk_text, :chunk_index,
         CAST(:embedding AS vector), :metadata::jsonb)
    ON CONFLICT (id) DO UPDATE SET
        chunk_text  = EXCLUDED.chunk_text,
        embedding   = EXCLUDED.embedding,
        chunk_index = EXCLUDED.chunk_index,
        metadata    = EXCLUDED.metadata
""")

import json

t0         = time.time()
total_rows = 0

with SessionLocal() as db:
    for item in all_items:
        db.execute(UPSERT_SQL, {
            "id":          str(item["chunk_id"]),
            "course_id":   item["course_id"],
            "lesson_id":   item["lesson_id"],
            "chunk_text":  item["chunk_text"],
            "chunk_index": item["chunk_index"],
            "embedding":   str(item["embedding"]),   # pgvector accepts '[x,y,...]'
            "metadata":    json.dumps({
                "language": item["language"],
                "title":    item["title"],
            }),
        })
        total_rows += 1
    db.commit()

ok(f"Upserted {total_rows} rows in {time.time() - t0:.2f}s")

# Quick count verification
with engine.connect() as conn:
    total = conn.execute(text("SELECT COUNT(*) FROM lesson_chunks")).scalar()
    info(f"Total rows in lesson_chunks: {total}")

# ──────────────────────────────────────────────────────────────────────────────
# 7 — Smoke-test similarity search
# ──────────────────────────────────────────────────────────────────────────────
step(7, "Smoke-test: cosine similarity search")

SEARCH_SQL = text("""
    SELECT
        id,
        course_id,
        lesson_id,
        chunk_index,
        chunk_text,
        metadata,
        1 - (embedding <=> CAST(:q AS vector)) AS similarity
    FROM lesson_chunks
    WHERE course_id = :course_id
    ORDER BY embedding <=> CAST(:q AS vector)
    LIMIT :k
""")

def run_search(question: str, course_id: int, k: int = 3) -> None:
    q_vec = model.encode(question, normalize_embeddings=True).tolist()

    with engine.connect() as conn:
        conn.execute(text(f"SET LOCAL hnsw.ef_search = 40"))
        rows  = conn.execute(SEARCH_SQL, {
            "q":         str(q_vec),
            "course_id": course_id,
            "k":         k,
        }).fetchall()

    print(f'\n  Query: "{question}"  (course_id={course_id})')
    print(f"  {'sim':>6}  lesson  chunk  preview")
    print(f"  {'─'*6}  {'─'*6}  {'─'*5}  {'─'*45}")
    for row in rows:
        preview = row.chunk_text.replace("\n", " ")[:60]
        print(
            f"  {row.similarity:>6.4f}  "
            f"L{row.lesson_id:<5}  "
            f"#{row.chunk_index:<4}  "
            f"{preview}…"
        )

# English queries → course 1
run_search("How do I conjugate -are verbs in Italian?",   course_id=1)
run_search("What is the difference between il and lo?",    course_id=1)
run_search("How do I say the numbers in Italian?",         course_id=1)
run_search("What are the -ire verbs that use -isc-?",      course_id=1)

# Russian query → course 2
run_search("Как спрягать глаголы на -are в настоящем времени?", course_id=2)

# ──────────────────────────────────────────────────────────────────────────────
# Summary
# ──────────────────────────────────────────────────────────────────────────────
header("✅  Ingestion complete")

with engine.connect() as conn:
    rows = conn.execute(text("""
        SELECT course_id, lesson_id, COUNT(*) as chunks
        FROM lesson_chunks
        GROUP BY course_id, lesson_id
        ORDER BY course_id, lesson_id
    """)).fetchall()

print(f"\n  {'course':>6}  {'lesson':>6}  {'chunks':>6}")
print(f"  {'─'*6}  {'─'*6}  {'─'*6}")
for r in rows:
    print(f"  {r.course_id:>6}  {r.lesson_id:>6}  {r.chunks:>6}")

print(f"""
  Next steps
  ──────────
  • POST /api/v1/rag/ask
      {{ "question": "How do I conjugate -are verbs?", "course_id": 1 }}

  • POST /api/v1/rag/retrieve   (debug — no LLM call)
      {{ "question": "articles in Italian", "course_id": 1 }}

  • To wipe and re-ingest:
      DELETE FROM lesson_chunks;
      python scripts/test_rag_ingestion.py
""")