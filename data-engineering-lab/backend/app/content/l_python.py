"""Module 2: Python for Data Engineering."""
from ._types import iq, lesson, mcq

M = "python"

LESSONS = [
    lesson("py-core", M, "Python fundamentals: types, collections, control flow and functions", 18, "beginner", [],
           "The building blocks you will use in every script: variables, lists, dicts, sets, comprehensions, functions and lambdas.",
           r"""
## Why Python is the data engineer's glue language

Python orchestrates and glues everything: it calls APIs, reads files, drives Spark (PySpark), defines Airflow DAGs and runs quality checks. SQL transforms data inside a database; Python moves, shapes and coordinates data **between** systems.

## Variables and core types

```python
count = 42                 # int
price = 19.99              # float
name = "Alice"             # str (immutable)
active = True              # bool
nothing = None             # absence of a value
```

Python is dynamically typed: names refer to objects, and types are checked at run time. Use **type hints** (`def f(x: int) -> str`) in pipeline code so tools and teammates catch mistakes early.

## Collections: pick the right one

| Type | Ordered | Mutable | Duplicates | Typical use |
|---|---|---|---|---|
| `list` | yes | yes | yes | A sequence of records |
| `tuple` | yes | no | yes | Fixed row, dict key |
| `set` | no | yes | no | Membership tests, distinct values |
| `dict` | insertion | yes | unique keys | Records, lookup tables, counters |

```python
orders = [{"id": 1, "amount": 25.0, "status": "completed"},
          {"id": 2, "amount": 80.0, "status": "cancelled"}]

seen_ids = {o["id"] for o in orders}                 # set comprehension
by_id = {o["id"]: o for o in orders}                 # dict comprehension: O(1) lookup
completed = [o for o in orders if o["status"] == "completed"]   # list comprehension
total = sum(o["amount"] for o in completed)          # generator expression (no list built)
```

Lookups in a `set` or `dict` are O(1) on average; searching a list is O(n). That single fact turns many quadratic loops into linear ones.

## Control flow

```python
for o in orders:
    if o["amount"] > 50:
        print("large", o["id"])
    elif o["amount"] > 0:
        print("small", o["id"])
    else:
        print("invalid", o["id"])

i = 0
while i < 3:
    i += 1
```

`enumerate(items)` gives index and value; `zip(a, b)` iterates in step; `break`/`continue` control loops.

## Functions

```python
def net_price(price: float, discount: float = 0.0, *, tax: float = 0.2) -> float:
    '''Return the price after discount and tax.'''
    return round(price * (1 - discount) * (1 + tax), 2)

net_price(100, 0.1)            # 108.0
net_price(100, tax=0.0)        # keyword-only argument
```

A **lambda** is a tiny anonymous function, handy as a sort key: `sorted(orders, key=lambda o: o["amount"], reverse=True)`.

### The mutable-default trap

```python
def add(item, bucket=[]):      # BUG: one shared list across calls
    bucket.append(item); return bucket

def add(item, bucket=None):    # correct
    bucket = [] if bucket is None else bucket
    bucket.append(item); return bucket
```

## Common mistakes

- Modifying a list while iterating over it.
- Comparing floats with `==` for money; use `decimal.Decimal` or integers of cents.
- Using a list for membership checks inside a loop.
- Shadowing built-ins (`list`, `id`, `sum`).

## Real-world use

A 15-line function that reads a vendor's order list, drops cancelled orders and totals revenue per category is typical glue code, and the exact shape of the first exercises in the Python lab.
""",
           [mcq("Which structure gives O(1) average membership checks?", ["list", "tuple", "set", "string"], 2, "Sets and dict keys are hash-based."),
            mcq("What is wrong with `def f(x, acc=[])`?", ["Nothing", "The default list is created once and shared across calls", "Lists cannot be defaults", "It is slow"], 1, "Mutable defaults persist between calls. Use None and create inside the function."),
            mcq("`[o for o in orders if o['amount'] > 50]` is:", ["A generator", "A list comprehension", "A dict", "A lambda"], 1, "Square brackets create a list; round brackets would create a generator expression.")],
           [iq("List vs tuple vs set vs dict, and when do you use each?", "List: ordered mutable sequence. Tuple: immutable fixed record, usable as a dict key. Set: unique unordered items with fast membership. Dict: key to value mapping with fast lookup. Choose by whether you need order, uniqueness, mutation and lookup."),
            iq("What is a generator expression and why use one?", "It lazily produces items one at a time instead of building a full list, saving memory, e.g. sum(x for x in rows). Ideal for large files.")],
           ["py-01", "py-02", "py-03", "py-04", "py-05"]),

    lesson("py-errors-files", M, "Exceptions, files, CSV and JSON", 16, "beginner", ["py-core"],
           "Handle failure, read and write files safely, and parse CSV and JSON the way production code does.",
           r"""
## Exception handling

Data is messy and networks fail, so a pipeline must expect errors and decide what to do about each.

```python
def to_int(value, default=None):
    try:
        return int(value)
    except (ValueError, TypeError):      # catch specific exceptions only
        return default
    finally:
        pass                             # always runs (cleanup)
```

Rules that matter in pipelines:

1. Catch the **narrowest** exception. A bare `except:` hides bugs (and swallows Ctrl-C).
2. Do not silently ignore errors. Log them with context, count them, and decide: skip the bad record, quarantine it, or fail the run.
3. `raise` (re-raise) when your code cannot fix the problem. Use `raise ... from exc` to keep the cause.
4. Define your own exceptions (`class ValidationError(Exception)`) so callers can react precisely.

## Files

Always use a context manager so the file is closed even on error:

```python
with open("app.log", encoding="utf-8") as f:
    for line in f:                 # streams one line at a time: safe for huge files
        process(line)
```

Use `pathlib.Path` for paths: `Path("data") / "sales.csv"`, `.exists()`, `.read_text()`, `.mkdir(parents=True, exist_ok=True)`.

## CSV

```python
import csv
with open("sales.csv", newline="", encoding="utf-8") as f:
    rows = list(csv.DictReader(f))               # every value is a STRING
total = sum(int(r["quantity"]) * float(r["unit_price"]) for r in rows)
```

CSV has no types, no standard null, and quoting quirks. Always specify encoding and `newline=""`, convert types explicitly, and validate.

## JSON

```python
import json
with open("orders.json") as f:
    data = json.load(f)
flat = [{"order_id": o["id"], "customer": o["customer"]["name"],
         "total": sum(i["qty"] * i["price"] for i in o["items"])} for o in data["orders"]]
```

Semi-structured JSON is nested and optional-heavy; use `.get("key", default)` for optional fields and flatten before loading to a table. `json.dump(obj, f, indent=2)` writes it back. For many records, **JSON Lines** (one JSON object per line) streams better than one giant array.

## Common mistakes

- Reading a 10 GB file with `.read()` or `list(f)`.
- Forgetting that CSV numbers are strings, so `"10" < "9"` is True.
- Catching `Exception` everywhere and returning silently.
- Hard-coding paths instead of using configuration.

## Real-world use

An ingestion script reads a vendor CSV, converts and validates each row, writes valid rows to the database and bad rows to a `rejects.csv` with the reason, then logs counts: read 10,000, loaded 9,874, rejected 126.
""",
           [mcq("Why use `with open(...)`?", ["It is faster", "It guarantees the file is closed even if an error occurs", "It makes the file read-only", "It buffers the whole file"], 1, "The context manager runs cleanup on exit."),
            mcq("All values from csv.DictReader are:", ["Auto-typed", "Strings", "Floats", "Bytes"], 1, "You must convert and validate types yourself."),
            mcq("Best practice for catching errors is:", ["`except:` everywhere", "Catch specific exceptions, log with context, and decide skip/quarantine/fail", "Ignore them", "Use `assert`"], 1, "Specific handling prevents hiding real bugs.")],
           [iq("How do you process a file too large for memory?", "Stream it: iterate the file object line by line, or read in chunks (pandas read_csv(chunksize=...)), process and write incrementally, and prefer columnar formats like Parquet for repeated analysis."),
            iq("How do you handle bad records in an ETL script?", "Validate each record; route invalid ones to a rejects/quarantine file or table with the reason, keep counts and log them, continue with good rows, and fail the run only when error rates exceed an agreed threshold.")],
           ["py-06", "py-09", "py-10", "py-11", "py-12", "py-14"]),

    lesson("py-advanced", M, "Functions in depth: iterators, generators, decorators, OOP, modules and logging", 20, "intermediate", ["py-errors-files"],
           "Write reusable, memory-efficient, well-structured pipeline code.",
           r"""
## Iterators and generators

An **iterator** produces values one at a time. A **generator function** uses `yield` and gives you an iterator for free, holding only the current state in memory.

```python
def batches(iterable, size):
    batch = []
    for x in iterable:
        batch.append(x)
        if len(batch) == size:
            yield batch
            batch = []
    if batch:
        yield batch

for chunk in batches(open("huge.csv"), 10_000):
    insert_many(chunk)
```

This is the foundation of memory-safe ETL: **read a batch, process it, write it, forget it.**

## Decorators

A decorator wraps a function to add behaviour without editing it: retries, timing, logging, caching.

```python
import functools, time

def retry(times=3, delay=1.0):
    def deco(fn):
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            for attempt in range(1, times + 1):
                try:
                    return fn(*args, **kwargs)
                except Exception:
                    if attempt == times:
                        raise
                    time.sleep(delay * 2 ** (attempt - 1))   # exponential backoff
        return wrapper
    return deco

@retry(times=3)
def call_api(): ...
```

## Object-oriented programming

Use classes when you have **state plus behaviour**, e.g. a connector holding a connection, or a validator holding rules.

```python
from dataclasses import dataclass

@dataclass
class Order:
    id: int
    amount: float
    status: str = "new"

class Validator:
    def __init__(self, required): self.required = required
    def validate(self, record):
        return [f"missing: {f}" for f in self.required if record.get(f) in (None, "")]
```

Key ideas: encapsulation (hide details), inheritance/composition (reuse; prefer composition), polymorphism (different sources implementing the same `extract()` interface). `@dataclass` removes boilerplate for record types.

## Modules, packages, virtual environments

A **module** is a `.py` file; a **package** is a folder with modules. Structure pipelines as `extract.py`, `transform.py`, `load.py`, `config.py` plus a `main.py`. A **virtual environment** isolates dependencies per project:

```bash
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt    # pin exact versions for reproducibility
```

Never install into the system Python, and commit `requirements.txt` (or `pyproject.toml` plus a lock file).

## Logging

`print` is not logging. Use the `logging` module with levels and structure:

```python
import logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("etl.orders")

log.info("loaded rows=%d source=%s", n, source)
log.error("load failed", exc_info=True)       # includes the traceback
```

Log counts, durations and identifiers, never secrets or personal data.

## Debugging

Read the traceback bottom-up (the last line is the error, the lines above show the call path). Reproduce with a tiny input, use `breakpoint()` / `pdb`, or print/log intermediate values, and write a failing test before fixing.

## Common mistakes

- Returning a giant list when a generator would do.
- A decorator that forgets `functools.wraps`, losing the function name and docstring.
- Deep inheritance trees instead of simple composition.
- Unpinned dependencies that break pipelines when a library updates.

## Real-world use

An Airflow task calls `extract(source)`, `transform(rows)` and `load(rows)` imported from your package: independently testable functions with retries and logging attached by decorators.
""",
           [mcq("A generator function is defined by:", ["Using `return` twice", "Using `yield`", "Using a class", "Using lambda"], 1, "yield turns the function into a lazy iterator."),
            mcq("Why use `functools.wraps` in a decorator?", ["Speed", "To preserve the wrapped function's name and docstring", "To catch errors", "To make it async"], 1, "Otherwise the wrapper masks the original metadata, confusing logs and tools."),
            mcq("The main reason for virtual environments is:", ["Faster Python", "Isolating project dependencies and versions", "Encryption", "Running code in the cloud"], 1, "Each project gets its own consistent set of packages.")],
           [iq("Explain generators and when you use them in ETL.", "Generators yield items lazily, so you can stream large files or API pages through transform and load without holding everything in memory, batching writes for efficiency."),
            iq("How would you add retry logic to many functions cleanly?", "Write a decorator (with functools.wraps) that retries on transient exceptions with exponential backoff and jitter, re-raising after the final attempt, and apply it with @retry().")],
           ["py-07", "py-08", "py-19", "py-23", "py-24", "py-25"]),

    lesson("py-pandas", M, "pandas and NumPy for data cleaning and transformation", 20, "intermediate", ["py-errors-files"],
           "DataFrames, vectorised operations, cleaning, joins, groupby and handling larger-than-memory files.",
           r"""
## What pandas is for

pandas provides the **DataFrame**: an in-memory table with labelled columns. It is the standard tool for cleaning and shaping data that fits in memory (up to a few GB). For bigger data, use Spark/DuckDB/Polars. NumPy underlies pandas, supplying fast typed arrays.

## Load and inspect

```python
import pandas as pd
df = pd.read_csv("sales.csv", parse_dates=["order_date"])
df.head(); df.info(); df.describe(); df.shape; df.dtypes
df.isna().sum()                    # missing values per column
```

## Vectorised operations (not loops)

```python
df["revenue"] = df["quantity"] * df["unit_price"]        # whole-column arithmetic
df["month"]   = df["order_date"].dt.strftime("%Y-%m")
big = df[(df["revenue"] > 100) & (df["category"] == "Electronics")]   # note & and parentheses
```

Operations on whole columns run in compiled code and are typically 10-100x faster than a Python `for` loop or `df.apply(axis=1)`.

## Cleaning

```python
df = pd.read_csv("customers_dirty.csv")
df = df.drop_duplicates()
df["name"]  = df["name"].str.strip().str.title()
df["email"] = df["email"].str.lower()
df["age"]   = pd.to_numeric(df["age"], errors="coerce")        # invalid -> NaN
df["age"]   = df["age"].fillna(df["age"].median())
df = df[df["name"].str.len() > 0]
```

Decide per column how to treat missing values: drop, fill with a constant/median, or keep NaN and flag it. Document the decision.

## GroupBy, merge, reshape

```python
monthly = df.groupby("month", as_index=False)["revenue"].sum()
by_cust = df.groupby("customer")["revenue"].agg(["sum", "count", "mean"]).sort_values("sum", ascending=False)
joined  = orders.merge(customers, on="customer_id", how="left", validate="many_to_one")
```

`validate="many_to_one"` makes pandas raise if the join would silently multiply rows, the same fan-out trap as in SQL.

## NumPy essentials

```python
import numpy as np
a = np.asarray([1, 2, 3], dtype=float)
(a - a.min()) / (a.max() - a.min())     # broadcasting: operate on all elements at once
np.where(a > 1, "high", "low")
```

## Working with large files

```python
parts = []
for chunk in pd.read_csv("big.csv", chunksize=500_000, usecols=["id", "amount"], dtype={"id": "int32"}):
    parts.append(chunk.groupby("id")["amount"].sum())
result = pd.concat(parts).groupby(level=0).sum()
```

Read only the columns you need, set compact dtypes (`category`, `int32`), process in chunks, and store intermediate data as **Parquet** (`df.to_parquet("x.parquet")`), which is smaller and keeps types.

## Common mistakes

- Chained indexing (`df[df.a > 1]["b"] = 0`) that silently edits a copy; use `df.loc[mask, "b"] = 0`.
- Using `apply(axis=1)` for something vectorisable.
- Merging on a non-unique key without checking.
- Reading everything into memory when streaming/chunking would work.

## Real-world use

A finance team's nightly script loads three vendor extracts, standardises names and currencies in pandas, joins them to a reference table, and writes a clean Parquet file that SQL and BI tools consume.
""",
           [mcq("Why prefer vectorised pandas operations to Python loops?", ["Prettier code", "They run in optimised compiled code and are much faster", "They use less disk", "They avoid NaN"], 1, "Whole-column operations avoid per-row Python overhead."),
            mcq("`pd.to_numeric(s, errors='coerce')` does what to invalid strings?", ["Raises", "Converts them to NaN", "Drops the row", "Converts to 0"], 1, "coerce turns unparseable values into NaN, which you can then handle explicitly."),
            mcq("How do you process a CSV larger than RAM with pandas?", ["Impossible", "read_csv with chunksize, usecols and compact dtypes", "Use apply", "Convert to Excel"], 1, "Chunking plus column pruning keeps memory bounded.")],
           [iq("How would you clean a dirty customer dataset in pandas?", "Inspect with info/isna, drop exact duplicates, standardise text (strip, case), convert types with coerce, handle missing values by explicit rules, validate formats (email regex), quarantine rejects, and write the result to Parquet."),
            iq("pandas vs Spark: when do you switch?", "pandas is simplest and fastest for data that fits comfortably in one machine's memory. Move to Spark (or DuckDB/Polars) when data exceeds memory, needs distributed processing, or must be processed in parallel on a cluster.")],
           ["py-15", "py-16", "py-17", "py-18"]),

    lesson("py-etl-apis-db", M, "APIs, databases and writing reusable ETL scripts", 20, "intermediate", ["py-advanced"],
           "Call REST APIs reliably, talk to databases safely and assemble a clean extract-transform-load script.",
           r"""
## HTTP and API fundamentals

APIs expose data over HTTP. The essentials:

- **Methods**: GET (read), POST (create), PUT/PATCH (update), DELETE.
- **Status codes**: 2xx success, 4xx client error (401 unauthenticated, 403 forbidden, 404 not found, 429 rate limited), 5xx server error (retry candidates).
- **Headers**: `Authorization`, `Content-Type`, `Accept`.
- **Pagination**: page number, offset/limit or cursor token. Loop until there is no next page.
- **Rate limits**: respect `Retry-After`; back off.

```python
import requests

def fetch_all(url, token, timeout=10):
    page, out = 1, []
    session = requests.Session()
    session.headers["Authorization"] = f"Bearer {token}"     # token from an env var, never hard-coded
    while page:
        r = session.get(url, params={"page": page}, timeout=timeout)   # ALWAYS set a timeout
        r.raise_for_status()
        body = r.json()
        out.extend(body["data"])
        page = body.get("next_page")
    return out
```

Always set `timeout`, retry only **transient** failures (timeouts, 429, 5xx) with exponential backoff, and never retry non-idempotent writes blindly. (The Python lab disables network access, so it simulates APIs with local functions.)

## Database connectivity

```python
import sqlite3                            # same DB-API shape as psycopg2, pyodbc, etc.
conn = sqlite3.connect("warehouse.db")
conn.execute("CREATE TABLE IF NOT EXISTS facts(id INTEGER PRIMARY KEY, amount REAL)")
conn.executemany("INSERT OR REPLACE INTO facts VALUES (?, ?)", [(1, 10.5), (2, 7.0)])   # parameterised
conn.commit()
```

**Always use parameters (`?`, `%s`)**, never string formatting. Parameterised queries prevent **SQL injection** and let the database reuse plans. Use `executemany`/bulk loads, wrap multi-statement loads in a transaction, and close connections (or use `with`). With SQLAlchemy and pandas: `df.to_sql("facts", engine, if_exists="append", index=False)`.

## Anatomy of a reusable ETL script

```python
import logging, os, sys
log = logging.getLogger("etl")

def extract(path):  ...                # returns raw rows (generator or list)
def transform(rows): ...               # pure function: no I/O, easy to test
def validate(rows):  ...               # split into (good, rejects)
def load(rows, conn): ...              # idempotent upsert

def main():
    logging.basicConfig(level=logging.INFO)
    cfg = {"source": os.environ["SOURCE_PATH"], "db": os.environ.get("DB_PATH", "warehouse.db")}
    rows = extract(cfg["source"])
    good, rejects = validate(transform(rows))
    load(good, connect(cfg["db"]))
    log.info("done good=%d rejected=%d", len(good), len(rejects))

if __name__ == "__main__":
    sys.exit(main())
```

Design principles: **separate pure transformation from I/O**, make `load` idempotent, read configuration from environment variables, log counts, return non-zero on failure so schedulers notice, and write tests for `transform` and `validate`.

## Common mistakes

- No timeout on HTTP calls (a hung request stalls the whole pipeline).
- Building SQL with f-strings.
- Re-running a script and duplicating data because the load is not idempotent.
- Secrets in source code or logs.
- A single 300-line function mixing extraction, cleaning and loading.

## Real-world use

A scheduled job calls a payments API for yesterday's transactions, paginates, retries on 429/5xx, flattens the JSON, validates, upserts into a staging table, and a SQL step merges staging into the warehouse. Airflow (Module 7) runs and monitors it.
""",
           [mcq("Why must every HTTP call set a timeout?", ["Speed", "Without it, a hung server can block the pipeline indefinitely", "Required by JSON", "To enable retries"], 1, "Default requests have no timeout."),
            mcq("Which prevents SQL injection?", ["String concatenation", "Parameterised queries", "Lowercasing input", "Using SELECT *"], 1, "Parameters keep data separate from SQL code."),
            mcq("Which errors are safe to retry automatically?", ["400 Bad Request", "Transient ones: timeouts, 429, 5xx", "401 Unauthorized", "404 Not Found"], 1, "Client errors will keep failing; transient ones may succeed later.", "intermediate")],
           [iq("How do you make an API ingestion script robust?", "Timeouts, retries with exponential backoff and jitter on transient errors, pagination handling, rate-limit respect, schema validation, logging, an incremental watermark, idempotent loading and secrets from environment/Key Vault."),
            iq("How do you structure an ETL script so it is testable?", "Split into extract, transform, validate, load functions; keep transform pure with no I/O; inject connections and config; write unit tests for transform and validate, and an integration test using an in-memory database.")],
           ["py-13", "py-20", "py-21", "py-22"]),
]
