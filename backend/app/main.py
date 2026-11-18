"""FastAPI application: content, practice labs and persistence. Binds to 127.0.0.1 only."""
from __future__ import annotations

import json
import re
import time
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import config, content, db, python_lab, sql_lab
from .content.modules import MODULES

app = FastAPI(title="Data Engineering Lab", version="1.0.0", docs_url="/api/docs", openapi_url="/api/openapi.json")
app.add_middleware(
    CORSMiddleware, allow_origins=config.ALLOWED_ORIGINS,
    allow_methods=["GET", "POST", "PUT", "DELETE"], allow_headers=["Content-Type"],
)

KEY_RE = re.compile(r"^[a-zA-Z0-9_.-]{1,64}$")
_CACHE: dict[str, Any] = {}


def cached(name: str, fn):
    if name not in _CACHE:
        _CACHE[name] = fn()
    return _CACHE[name]


# ---------------------------------------------------------------- health
@app.get("/api/health")
def health() -> dict[str, Any]:
    return {"status": "ok", "time": time.time()}


# ---------------------------------------------------------------- persistence
@app.get("/api/state")
def state_all() -> dict[str, Any]:
    return db.get_all()


@app.get("/api/state/{key}")
def state_get(key: str) -> Any:
    if not KEY_RE.match(key):
        raise HTTPException(400, "Invalid key")
    return {"key": key, "value": db.get_key(key)}


class StateBody(BaseModel):
    value: Any


@app.put("/api/state/{key}")
def state_put(key: str, body: StateBody) -> dict[str, bool]:
    if not KEY_RE.match(key):
        raise HTTPException(400, "Invalid key")
    if len(json.dumps(body.value)) > 5_000_000:
        raise HTTPException(413, "Value too large")
    db.set_key(key, body.value)
    return {"ok": True}


class ImportBody(BaseModel):
    data: dict[str, Any]


@app.post("/api/state/import")
def state_import(body: ImportBody) -> dict[str, Any]:
    bad = [k for k in body.data if not KEY_RE.match(k)]
    if bad:
        raise HTTPException(400, "Invalid keys in import file")
    db.replace_all(body.data)
    return {"ok": True, "keys": len(body.data)}


@app.delete("/api/state")
def state_reset() -> dict[str, bool]:
    db.delete_all()
    return {"ok": True}


@app.post("/api/backup")
def backup_create() -> dict[str, Any]:
    config.BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    name = time.strftime("backup-%Y%m%d-%H%M%S.json")
    (config.BACKUP_DIR / name).write_text(json.dumps(db.get_all()), encoding="utf-8")
    return {"ok": True, "name": name}


@app.get("/api/backup")
def backup_list() -> list[dict[str, Any]]:
    if not config.BACKUP_DIR.exists():
        return []
    files = sorted(config.BACKUP_DIR.glob("backup-*.json"), reverse=True)
    return [{"name": f.name, "size": f.stat().st_size, "modified": f.stat().st_mtime} for f in files[:50]]


class RestoreBody(BaseModel):
    name: str = Field(pattern=r"^backup-\d{8}-\d{6}\.json$")


@app.post("/api/backup/restore")
def backup_restore(body: RestoreBody) -> dict[str, Any]:
    path = config.BACKUP_DIR / body.name
    if not path.is_file():
        raise HTTPException(404, "Backup not found")
    data = json.loads(path.read_text(encoding="utf-8"))
    db.replace_all(data)
    return {"ok": True, "keys": len(data)}


# ---------------------------------------------------------------- content
def _strip(items: list[dict[str, Any]], hidden: tuple[str, ...]) -> list[dict[str, Any]]:
    return [{k: v for k, v in it.items() if k not in hidden} for it in items]


@app.get("/api/content/modules")
def get_modules() -> list[dict[str, Any]]:
    return MODULES


@app.get("/api/content/lessons")
def get_lessons() -> list[dict[str, Any]]:
    """Lesson index (no bodies) to keep the payload small."""
    return [{k: v for k, v in l.items() if k not in ("body", "quiz", "interview")} | {
        "quiz_count": len(l["quiz"]), "interview_count": len(l["interview"])}
        for l in cached("lessons", content.lessons)]


@app.get("/api/content/lessons/{lesson_id}")
def get_lesson(lesson_id: str) -> dict[str, Any]:
    for l in cached("lessons", content.lessons):
        if l["id"] == lesson_id:
            return l
    raise HTTPException(404, "Lesson not found")


@app.get("/api/content/projects")
def get_projects() -> list[dict[str, Any]]:
    return cached("projects", content.projects)


@app.get("/api/content/scenarios")
def get_scenarios() -> list[dict[str, Any]]:
    return cached("scenarios", content.scenarios)


@app.get("/api/content/mcq")
def get_mcq() -> list[dict[str, Any]]:
    return cached("mcq", content.mcq_bank)


@app.get("/api/content/questions")
def get_questions() -> list[dict[str, Any]]:
    return cached("questions", content.question_bank)


# ---------------------------------------------------------------- SQL lab
class SqlBody(BaseModel):
    sql: str = Field(max_length=config.SQL_MAX_CHARS)


@app.get("/api/sql/schema")
def sql_schema() -> list[dict[str, Any]]:
    return sql_lab.list_schema()


@app.post("/api/sql/run")
def sql_run(body: SqlBody) -> dict[str, Any]:
    return sql_lab.run_query(body.sql)


@app.post("/api/sql/reset")
def sql_reset() -> dict[str, bool]:
    sql_lab.reset()
    return {"ok": True}


def _find(items: list[dict[str, Any]], ex_id: str) -> dict[str, Any]:
    for it in items:
        if it["id"] == ex_id:
            return it
    raise HTTPException(404, "Exercise not found")


@app.get("/api/sql/exercises")
def sql_exercises() -> list[dict[str, Any]]:
    return _strip(cached("sqlx", content.sql_exercises), ("solution", "solution_explain"))


@app.get("/api/sql/exercises/{ex_id}/expected")
def sql_expected(ex_id: str) -> dict[str, Any]:
    ex = _find(cached("sqlx", content.sql_exercises), ex_id)
    conn = sql_lab.new_connection()
    try:
        return sql_lab.run_query(ex["solution"], conn)
    finally:
        conn.close()


@app.get("/api/sql/exercises/{ex_id}/solution")
def sql_solution(ex_id: str) -> dict[str, Any]:
    ex = _find(cached("sqlx", content.sql_exercises), ex_id)
    return {"solution": ex["solution"], "explain": ex.get("solution_explain", "")}


class SqlValidateBody(BaseModel):
    exercise_id: str
    sql: str = Field(max_length=config.SQL_MAX_CHARS)


@app.post("/api/sql/validate")
def sql_validate(body: SqlValidateBody) -> dict[str, Any]:
    ex = _find(cached("sqlx", content.sql_exercises), body.exercise_id)
    return sql_lab.validate(body.sql, ex["solution"], ordered=ex.get("ordered", False),
                            setup_sql=ex.get("setup"))


# ---------------------------------------------------------------- Python lab
class PyBody(BaseModel):
    code: str = Field(max_length=config.PY_MAX_CODE_CHARS)


@app.post("/api/python/run")
def py_run(body: PyBody) -> dict[str, Any]:
    return python_lab.run_python(body.code)


@app.get("/api/python/exercises")
def py_exercises() -> list[dict[str, Any]]:
    return _strip(cached("pyx", content.python_exercises), ("solution", "tests", "solution_explain"))


@app.get("/api/python/exercises/{ex_id}/solution")
def py_solution(ex_id: str) -> dict[str, Any]:
    ex = _find(cached("pyx", content.python_exercises), ex_id)
    return {"solution": ex["solution"], "explain": ex.get("solution_explain", "")}


class PyValidateBody(BaseModel):
    exercise_id: str
    code: str = Field(max_length=config.PY_MAX_CODE_CHARS)


@app.post("/api/python/validate")
def py_validate(body: PyValidateBody) -> dict[str, Any]:
    ex = _find(cached("pyx", content.python_exercises), body.exercise_id)
    return python_lab.run_python(body.code, tests=ex["tests"])


# ---------------------------------------------------------------- optional AI (disabled unless configured)
@app.get("/api/ai/status")
def ai_status() -> dict[str, Any]:
    return {"configured": bool(config.AI_BASE_URL and config.AI_MODEL and config.AI_API_KEY)}


# ---------------------------------------------------------------- static frontend (production build)
if config.STATIC_DIR.is_dir():
    app.mount("/assets", StaticFiles(directory=config.STATIC_DIR / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str) -> FileResponse:
        if path.startswith("api/"):
            raise HTTPException(404)
        f = (config.STATIC_DIR / path).resolve()
        if path and f.is_file() and config.STATIC_DIR.resolve() in f.parents:
            return FileResponse(f)
        return FileResponse(config.STATIC_DIR / "index.html")
