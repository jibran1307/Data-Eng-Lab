"""Central configuration. All values can be overridden with environment variables."""
from __future__ import annotations

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.environ.get("DE_LAB_DATA_DIR", BASE_DIR / "data"))
DB_PATH = DATA_DIR / "lab.sqlite3"
BACKUP_DIR = DATA_DIR / "backups"

# Services bind to loopback only (never 0.0.0.0).
HOST = "127.0.0.1"
PORT = int(os.environ.get("DE_LAB_PORT", "8765"))

ALLOWED_ORIGINS = [
    "http://127.0.0.1:5173",
    "http://localhost:5173",
    f"http://127.0.0.1:{PORT}",
    f"http://localhost:{PORT}",
]

# Execution limits
SQL_TIMEOUT_SECONDS = 10
SQL_MAX_ROWS = 500
SQL_MAX_CHARS = 20_000
PY_TIMEOUT_SECONDS = 20
PY_MAX_OUTPUT_CHARS = 20_000
PY_MAX_CODE_CHARS = 50_000

STATIC_DIR = BASE_DIR.parent / "frontend" / "dist"

# Optional AI provider (all via environment; nothing is stored in the database).
AI_BASE_URL = os.environ.get("DE_LAB_AI_BASE_URL", "")
AI_MODEL = os.environ.get("DE_LAB_AI_MODEL", "")
AI_API_KEY = os.environ.get("DE_LAB_AI_API_KEY", "")
