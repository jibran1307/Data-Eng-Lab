"""SQLite persistence layer.

All user state is stored as JSON documents in a single `kv` table. The frontend
owns the shape of each document, which keeps the backend small and makes
export/import trivial (a dump of every key).
"""
from __future__ import annotations

import json
import os
import sqlite3
import threading
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

from . import config

DEFAULT_DB = config.DATA_DIR / "lab.db"
_lock = threading.Lock()


def db_path() -> Path:
    return Path(os.environ.get("DE_LAB_DB", str(DEFAULT_DB)))


@contextmanager
def connect() -> Iterator[sqlite3.Connection]:
    path = db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, timeout=10)
    try:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute(
            "CREATE TABLE IF NOT EXISTS kv ("
            "key TEXT PRIMARY KEY, value TEXT NOT NULL, "
            "updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"
        )
        yield conn
        conn.commit()
    finally:
        conn.close()


def get_all() -> dict[str, Any]:
    with _lock, connect() as c:
        rows = c.execute("SELECT key, value FROM kv").fetchall()
    return {k: json.loads(v) for k, v in rows}


def get_key(key: str) -> Any | None:
    with _lock, connect() as c:
        row = c.execute("SELECT value FROM kv WHERE key = ?", (key,)).fetchone()
    return json.loads(row[0]) if row else None


def set_key(key: str, value: Any) -> None:
    with _lock, connect() as c:
        c.execute(
            "INSERT INTO kv(key, value, updated_at) VALUES(?, ?, CURRENT_TIMESTAMP) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP",
            (key, json.dumps(value)),
        )


def replace_all(data: dict[str, Any]) -> None:
    with _lock, connect() as c:
        c.execute("DELETE FROM kv")
        c.executemany(
            "INSERT INTO kv(key, value) VALUES(?, ?)",
            [(k, json.dumps(v)) for k, v in data.items()],
        )


def delete_all() -> None:
    with _lock, connect() as c:
        c.execute("DELETE FROM kv")
