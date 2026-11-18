"""Python lab: executes learner code in an isolated child process.

Isolation measures (defence in depth, best effort - this is a *local learning tool*,
not a multi-tenant hosting sandbox):
  * separate interpreter process in isolated mode (-I), never inside the API process
  * throwaway working directory seeded with practice datasets, deleted afterwards
  * wall-clock timeout + CPU/file-size limits (+ memory limit on Linux)
  * minimal environment (no inherited secrets), networking disabled
  * output truncated
The API only listens on 127.0.0.1, so only local users can reach it.
"""
from __future__ import annotations

import csv
import json
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

RUNNER = Path(__file__).resolve().parent / "sandbox_runner.py"
TIMEOUT = 20
MAX_OUT = 20_000
MAX_CODE = 50_000

SALES_CSV = [
    ["order_id", "customer", "product", "category", "quantity", "unit_price", "order_date"],
    [1001, "Alice", "Laptop", "Electronics", 1, 1200.00, "2024-01-05"],
    [1002, "Bob", "Mouse", "Electronics", 2, 25.00, "2024-01-07"],
    [1003, "Alice", "Desk", "Furniture", 1, 450.00, "2024-01-20"],
    [1004, "Chandra", "Notebook", "Stationery", 10, 3.50, "2024-02-02"],
    [1005, "Diana", "Chair", "Furniture", 2, 150.00, "2024-02-14"],
    [1006, "Bob", "Laptop", "Electronics", 1, 1150.00, "2024-02-20"],
    [1007, "Ethan", "Pen", "Stationery", 20, 1.20, "2024-03-01"],
    [1008, "Alice", "Mouse", "Electronics", 1, 25.00, "2024-03-05"],
]

DIRTY_CSV = [
    ["id", "name", "email", "age", "country"],
    [1, "  alice JOHNSON ", "ALICE@EXAMPLE.COM", "34", "us"],
    [2, "Bob Smith", "bob@example.com", "", "UK"],
    [3, "chandra rao", "chandra@example", "41", "in"],
    [2, "Bob Smith", "bob@example.com", "", "UK"],
    [4, "Diana Lopez", "diana@example.com", "abc", "ES"],
    [5, "  ", "ethan@example.com", "29", "us"],
]

ORDERS_JSON = {
    "orders": [
        {"id": 1, "customer": {"id": 11, "name": "Alice", "tier": "gold"},
         "items": [{"sku": "A1", "qty": 2, "price": 10.0}, {"sku": "B2", "qty": 1, "price": 25.5}]},
        {"id": 2, "customer": {"id": 12, "name": "Bob", "tier": "silver"},
         "items": [{"sku": "A1", "qty": 5, "price": 10.0}]},
        {"id": 3, "customer": {"id": 11, "name": "Alice", "tier": "gold"}, "items": []},
    ]
}

APP_LOG = """2024-03-01 08:00:01 INFO  ingest started source=crm
2024-03-01 08:00:05 INFO  rows_read=1200 source=crm
2024-03-01 08:00:09 WARNING slow_query duration_ms=4200
2024-03-01 08:01:00 ERROR connection_timeout host=db1 attempt=1
2024-03-01 08:01:30 ERROR connection_timeout host=db1 attempt=2
2024-03-01 08:02:10 INFO  retry_succeeded host=db1
2024-03-01 08:03:00 ERROR schema_mismatch column=amount
2024-03-01 08:03:05 INFO  ingest finished rows_loaded=1188
"""


def _seed_workdir(path: Path) -> None:
    with open(path / "sales.csv", "w", newline="", encoding="utf-8") as f:
        csv.writer(f).writerows(SALES_CSV)
    with open(path / "customers_dirty.csv", "w", newline="", encoding="utf-8") as f:
        csv.writer(f).writerows(DIRTY_CSV)
    (path / "orders.json").write_text(json.dumps(ORDERS_JSON, indent=2), encoding="utf-8")
    (path / "app.log").write_text(APP_LOG, encoding="utf-8")


def _trim(text: str) -> str:
    if len(text) > MAX_OUT:
        return text[:MAX_OUT] + f"\n... output truncated ({len(text)} chars total)"
    return text


def run_python(code: str, tests: str | None = None, timeout: int = TIMEOUT) -> dict[str, Any]:
    if not isinstance(code, str) or not code.strip():
        return {"error": "Code is empty."}
    if len(code) > MAX_CODE:
        return {"error": "Code too long (max 50,000 characters)."}
    with tempfile.TemporaryDirectory(prefix="delab_") as tmp:
        work = Path(tmp)
        _seed_workdir(work)
        result_file = work / ".result.json"
        job_file = work / ".job.json"
        job_file.write_text(json.dumps({"code": code, "tests": tests, "result": str(result_file),
                                        "cpu": timeout}), encoding="utf-8")
        env = {"PATH": "/usr/bin:/bin", "PYTHONIOENCODING": "utf-8", "PYTHONHASHSEED": "0",
               "HOME": str(work), "LANG": "en_US.UTF-8"}
        try:
            proc = subprocess.run(
                [sys.executable, "-I", str(RUNNER), str(job_file)],
                cwd=work, env=env, capture_output=True, text=True, timeout=timeout,
            )
            out, err, timed_out = proc.stdout, proc.stderr, False
        except subprocess.TimeoutExpired as exc:
            out = (exc.stdout or b"").decode("utf-8", "replace") if isinstance(exc.stdout, bytes) else (exc.stdout or "")
            err = f"TimeoutError: execution exceeded {timeout} seconds and was stopped."
            timed_out = True
        status: dict[str, Any] = {}
        if result_file.exists():
            try:
                status = json.loads(result_file.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                status = {}
    res: dict[str, Any] = {"stdout": _trim(out), "stderr": _trim(err), "timed_out": timed_out}
    if tests is not None:
        res["passed"] = bool(status.get("passed")) and not timed_out
        res["feedback"] = status.get("message") or ("Execution timed out." if timed_out else "Tests did not run.")
    return res

