"""
app/utils/paths.py

Single source of truth for the uploads directory path.

Priority order
--------------
1. ``UPLOADS_DIR`` environment variable — set this on Render (or any host
   with a persistent disk) to point at the mount path, e.g. ``/var/data``.
2. Docker auto-detection  — when running inside a Docker container that has
   the app at ``/app``, falls back to ``/app/uploads``.
3. Local development       — resolves to ``<backend-root>/uploads``.

All path helpers scattered across endpoint files import and call
``resolve_uploads_path()`` so every component writes to the same directory.
"""

import os


def resolve_uploads_path() -> str:
    """
    Return the absolute path to the shared uploads directory.

    Checks the UPLOADS_DIR environment variable first so that Render
    persistent-disk users only need to set one env var — no code change required.
    """
    # Highest priority: explicit override from the environment (e.g. Render disk).
    env_dir = os.environ.get("UPLOADS_DIR", "").strip()
    if env_dir:
        return env_dir

    # Auto-detect Docker: main.py lives at /app/main.py in the container image.
    # __file__ is backend/app/utils/paths.py → four dirname() calls → backend/.
    backend_dir = os.path.dirname(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    )
    _is_docker = (
        os.name != "nt"
        and os.path.exists("/app")
        and os.getcwd() == "/app"
        and backend_dir == "/app"
    )
    if _is_docker:
        return "/app/uploads"

    # Local development: uploads/ lives beside the backend source tree.
    return os.path.join(backend_dir, "uploads")
