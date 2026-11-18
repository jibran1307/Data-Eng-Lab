"""DuckDB-backed SQL playground.

Each sandbox is an in-memory DuckDB database seeded from `datasets.sql`.
Results of exercise validation are compared as multisets (order-insensitive
unless the exercise requires ordering).
"""
from __future__ import annotations

import datetime as dt
import decimal
import threading
from pathlib import Path
from typing import Any

import duckdb

SEED_FILE = Path(__file__).resolve().parent / "datasets.sql"
MAX_ROWS = 500

_lock = threading.Lock()
_conn: duckdb.DuckDBPyConnection | None = None


def _seed(conn: duckdb.DuckDBPyConnection) -> None:
    conn.execute(SEED_FILE.read_text(encoding="utf-8"))


def new_connection() -> duckdb.DuckDBPyConnection:
    conn = duckdb.connect(":memory:")
    _seed(conn)
    return conn


def get_connection() -> duckdb.DuckDBPyConnection:
    global _conn
    if _conn is None:
        _conn = new_connection()
    return _conn


def reset() -> None:
    global _conn
    with _lock:
        if _conn is not None:
            _conn.close()
        _conn = new_connection()


def _jsonable(v: Any) -> Any:
    if v is None or isinstance(v, (bool, int, str)):
        return v
    if isinstance(v, float):
        return None if v != v else round(v, 6)
    if isinstance(v, decimal.Decimal):
        return round(float(v), 6)
    if isinstance(v, (dt.date, dt.datetime, dt.time)):
        return v.isoformat()
    if isinstance(v, (list, tuple)):
        return [_jsonable(x) for x in v]
    if isinstance(v, dict):
        return {str(k): _jsonable(x) for k, x in v.items()}
    return str(v)


def run_query(sql: str, conn: duckdb.DuckDBPyConnection | None = None) -> dict[str, Any]:
    """Execute SQL and return {columns, rows, row_count, truncated} or {error}."""
    sql = (sql or "").strip()
    if not sql:
        return {"error": "Query is empty."}
    if len(sql) > 20000:
        return {"error": "Query too long (max 20,000 characters)."}
    with _lock:
        c = conn or get_connection()
        try:
            cur = c.execute(sql)
            if cur.description is None:
                return {"columns": [], "rows": [], "row_count": 0, "truncated": False,
                        "message": "Statement executed successfully."}
            columns = [d[0] for d in cur.description]
            rows = cur.fetchall()
        except duckdb.Error as exc:
            return {"error": str(exc)}
    truncated = len(rows) > MAX_ROWS
    return {
        "columns": columns,
        "rows": [[_jsonable(v) for v in r] for r in rows[:MAX_ROWS]],
        "row_count": len(rows),
        "truncated": truncated,
    }


def list_schema() -> list[dict[str, Any]]:
    res = run_query(
        "SELECT table_name, column_name, data_type FROM information_schema.columns "
        "WHERE table_schema = 'main' ORDER BY table_name, ordinal_position"
    )
    tables: dict[str, list[dict[str, str]]] = {}
    for t, col, typ in res.get("rows", []):
        tables.setdefault(t, []).append({"name": col, "type": typ})
    return [{"table": t, "columns": cols} for t, cols in tables.items()]


def _normalise(rows: list[list[Any]]) -> list[tuple]:
    out = []
    for r in rows:
        out.append(tuple(round(v, 2) if isinstance(v, float) else v for v in r))
    return out


def _sortkey(row: tuple) -> tuple:
    return tuple((v is None, str(v)) for v in row)


def validate(user_sql: str, solution_sql: str, ordered: bool = False,
             setup_sql: str | None = None) -> dict[str, Any]:
    """Run user + reference SQL on a *fresh* seeded database and compare results."""
    ref_conn = new_connection()
    usr_conn = new_connection()
    try:
        if setup_sql:
            ref_conn.execute(setup_sql)
            usr_conn.execute(setup_sql)
        expected = run_query(solution_sql, ref_conn)
        actual = run_query(user_sql, usr_conn)
    finally:
        ref_conn.close()
        usr_conn.close()
    if "error" in expected:
        return {"passed": False, "error": "Reference solution failed: " + expected["error"]}
    if "error" in actual:
        return {"passed": False, "error": actual["error"], "expected": expected}
    exp_rows = _normalise(expected["rows"])
    act_rows = _normalise(actual["rows"])
    if not ordered:
        exp_rows = sorted(exp_rows, key=_sortkey)
        act_rows = sorted(act_rows, key=_sortkey)
    cols_match = len(expected["columns"]) == len(actual["columns"])
    passed = cols_match and exp_rows == act_rows
    feedback = "Correct - result matches the expected output."
    if not passed:
        if not cols_match:
            feedback = (f"Expected {len(expected['columns'])} columns "
                        f"({', '.join(expected['columns'])}) but got {len(actual['columns'])}.")
        elif len(exp_rows) != len(act_rows):
            feedback = f"Expected {len(exp_rows)} rows but got {len(act_rows)}."
        else:
            feedback = "Row count matches but some values differ" + (
                " (order matters for this exercise)." if ordered else ".")
    return {"passed": passed, "feedback": feedback, "expected": expected, "actual": actual}
