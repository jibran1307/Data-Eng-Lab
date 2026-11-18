"""Content registry. Each content file exposes a plain list; this module aggregates and validates it.

To extend the platform, add entries to the relevant file (or drop JSON via the API for interview questions).
"""
from __future__ import annotations

import importlib
from typing import Any

from .modules import MODULES

LESSON_FILES = ["l_sql", "l_python", "l_fundamentals", "l_warehousing", "l_etl", "l_spark",
                "l_orchestration", "l_azure", "l_streaming", "l_tools"]


def _load(name: str, attr: str) -> list[dict[str, Any]]:
    try:
        mod = importlib.import_module(f"{__package__}.{name}")
    except ModuleNotFoundError as exc:  # content file not authored yet
        if exc.name and exc.name.endswith(name):
            return []
        raise
    return list(getattr(mod, attr))


def lessons() -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for f in LESSON_FILES:
        out.extend(_load(f, "LESSONS"))
    return out


def sql_exercises() -> list[dict[str, Any]]:
    return _load("ex_sql", "EXERCISES")


def python_exercises() -> list[dict[str, Any]]:
    return _load("py_exercises", "EXERCISES")


def projects() -> list[dict[str, Any]]:
    return _load("proj_all", "PROJECTS")


def scenarios() -> list[dict[str, Any]]:
    return _load("scen_data", "SCENARIOS")


def mcq_bank() -> list[dict[str, Any]]:
    """Assessment MCQs = dedicated bank + every lesson knowledge-check question."""
    items = _load("mcq_data", "MCQS")
    for l in lessons():
        for i, q in enumerate(l["quiz"]):
            items.append({**q, "id": f"{l['id']}#q{i}", "topic": l["module"], "lesson": l["id"]})
    for i, q in enumerate(items):
        q.setdefault("id", f"bank#{i}")
    return items


def question_bank() -> list[dict[str, Any]]:
    from .questions_bank import BANK
    return BANK


def validate_content() -> list[str]:
    """Return a list of integrity problems (used by automated tests)."""
    problems: list[str] = []
    mod_ids = {m["id"] for m in MODULES}
    ls = lessons()
    ids = [l["id"] for l in ls]
    if len(ids) != len(set(ids)):
        problems.append("duplicate lesson ids")
    idset = set(ids)
    for l in ls:
        if l["module"] not in mod_ids:
            problems.append(f"{l['id']}: unknown module")
        for p in l["prereqs"]:
            if p not in idset:
                problems.append(f"{l['id']}: unknown prereq {p}")
    return problems
