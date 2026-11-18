#!/usr/bin/env python3
"""Export all curriculum content and lab assets to static JSON for the browser-only build.

Output: frontend/public/static-data/  (served as plain files; no backend needed)
Run from the repo root:  backend/.venv/bin/python scripts/export_static.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

from app import content, python_lab  # noqa: E402
from app.content.modules import MODULES  # noqa: E402

OUT = ROOT / "frontend" / "public" / "static-data"


def dump(name: str, data) -> None:
    path = OUT / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{name:32s} {path.stat().st_size / 1024:8.1f} KB")


def main() -> None:
    lessons = content.lessons()
    dump("modules.json", MODULES)
    dump("lessons-index.json", [
        {k: v for k, v in l.items() if k not in ("body", "quiz", "interview")}
        | {"quiz_count": len(l["quiz"]), "interview_count": len(l["interview"])}
        for l in lessons])
    for l in lessons:
        dump(f"lessons/{l['id']}.json", l)
    dump("projects.json", content.projects())
    dump("scenarios.json", content.scenarios())
    dump("mcq.json", content.mcq_bank())
    dump("questions.json", content.question_bank())

    # Exercises: the public lists hide solutions/tests, exactly like the API does.
    sql = content.sql_exercises()
    py = content.python_exercises()
    dump("sql-exercises.json", [{k: v for k, v in e.items() if k not in ("solution", "solution_explain", "setup")} for e in sql])
    dump("sql-solutions.json", {e["id"]: {"solution": e["solution"], "explain": e.get("solution_explain", ""),
                                          "ordered": bool(e.get("ordered", False)), "setup": e.get("setup")} for e in sql})
    dump("py-exercises.json", [{k: v for k, v in e.items() if k not in ("solution", "tests", "solution_explain")} for e in py])
    dump("py-solutions.json", {e["id"]: {"solution": e["solution"], "explain": e.get("solution_explain", ""), "tests": e["tests"]} for e in py})

    # Seed data for the in-browser engines
    (OUT / "datasets.sql").write_text((ROOT / "backend" / "app" / "datasets.sql").read_text(encoding="utf-8"), encoding="utf-8")
    print(f"{'datasets.sql':32s} {(OUT / 'datasets.sql').stat().st_size / 1024:8.1f} KB")
    import csv, io
    def csv_text(rows):
        buf = io.StringIO(); csv.writer(buf, lineterminator="\n").writerows(rows); return buf.getvalue()
    dump("py-files.json", {
        "sales.csv": csv_text(python_lab.SALES_CSV),
        "customers_dirty.csv": csv_text(python_lab.DIRTY_CSV),
        "orders.json": json.dumps(python_lab.ORDERS_JSON, indent=2),
        "app.log": python_lab.APP_LOG,
    })
    print(f"\nExported {len(lessons)} lessons, {len(sql)} SQL and {len(py)} Python exercises.")


if __name__ == "__main__":
    main()
