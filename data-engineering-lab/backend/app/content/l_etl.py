"""Module 5: ETL and ELT Pipelines."""
from ._types import iq, lesson, mcq

M = "etl"

LESSONS = [
    lesson("etl-extract-transform", M, "Extract and transform: files, APIs, databases and validation", 18, "intermediate", ["py-etl-apis-db", "de-pipelines"],
           "Reading from CSV, JSON, APIs and databases, then transforming and validating records before load.",
           r"""
## The shape of a pipeline

Every ETL/ELT job has the same skeleton: **extract -> transform -> validate -> load**, wrapped in logging, configuration and error handling. Keeping those stages as separate functions is what makes a pipeline testable and reusable.

## Extract

| Source | Technique | Watch out for |
|---|---|---|
| CSV / JSON files | Stream with `csv`/`json`, or pandas chunks | Encodings, delimiters, header drift, all-strings typing |
| REST APIs | `requests` with timeout, pagination, retries | Rate limits (429), auth expiry, partial pages |
| Relational DBs | SQL query with a watermark filter, server-side cursor | Load on the source, long transactions, locking |
| Event streams | Consumer with committed offsets | Ordering, duplicates, late data |

Extraction should be **read-only and repeatable**: re-running with the same parameters must return the same slice. Parameterise by date or watermark, never by "whatever is there now".

```python
def extract_orders(conn, since):
    cur = conn.execute("SELECT id, customer_id, amount, updated_at FROM orders WHERE updated_at > ? ORDER BY updated_at", (since,))
    while rows := cur.fetchmany(5_000):
        yield from rows
```

## Transform

Typical transformations: type conversion, trimming and case normalisation, standardising codes (`us`, `USA`, `United States` -> `US`), deriving columns, flattening nested JSON, joining reference data, aggregating, and masking PII.

Principles:

1. **Pure functions**: input rows in, output rows out, no hidden I/O. They become trivial to unit-test.
2. **Never mutate the raw layer**. Keep the original so you can replay with fixed logic.
3. **Be explicit about NULL/empty/invalid handling** for every column.
4. **Deterministic**: no `now()` or random values inside a transformation unless passed in as a parameter (otherwise reruns differ).

## Validate

Validation answers "is this record fit to load?". Categories:

- **Schema**: required fields present, types correct.
- **Domain**: value in an allowed set or range (`status in {...}`, `amount >= 0`).
- **Format**: email regex, date parse.
- **Referential**: foreign key exists in the dimension.
- **Uniqueness**: no duplicate business keys.
- **Batch-level**: row count within expected band, totals reconcile.

```python
def validate(rec):
    errors = []
    if not rec.get("id"): errors.append("missing id")
    if rec.get("amount") is None or rec["amount"] < 0: errors.append("bad amount")
    return errors

good, rejects = [], []
for r in rows:
    errs = validate(r)
    (rejects if errs else good).append({**r, "errors": errs} if errs else r)
```

Decide the policy per rule: **warn** (load anyway), **quarantine** (load to a rejects table with the reason), or **fail** (stop the run). A sudden spike in rejects (say 0.1% to 15%) should itself fail the run: it usually means the source changed.

## Handling duplicates

Duplicates arise from retries, overlapping windows and source bugs. Define the **business key**, choose which duplicate wins (latest `updated_at`, with a deterministic tie-breaker), and dedupe in the transform stage, or rely on `MERGE`/`ON CONFLICT` at load.

## ELT variant

In ELT you extract and load raw data almost untouched, then transform with SQL inside the warehouse. Validation then happens as SQL tests between raw and curated tables. The principles are identical; only the location of the transform moves.

## Common mistakes

- Doing transformation and I/O in the same function.
- Converting types implicitly and losing leading zeros in IDs (`"00123"` becomes `123`).
- Dropping bad rows without recording them.
- Using the run time as the extraction window instead of a stored watermark.

## Real-world use

An insurance claims feed arrives as nightly CSVs. The pipeline streams the file, converts types, validates claim ids and amounts, writes rejects with reasons to a quarantine table that the data steward reviews each morning, and loads clean claims.
""",
           [mcq("Why should transformation functions be pure?", ["They run faster", "They are easy to unit test and give identical output on reruns", "They avoid memory", "They need no validation"], 1, "No hidden I/O or state means deterministic, testable behaviour."),
            mcq("A validation rule that sends bad rows to a rejects table but continues the run is a:", ["Fail policy", "Quarantine policy", "Warn policy only", "Drop policy"], 1, "Quarantine isolates bad records with reasons while good data flows on."),
            mcq("Which makes extraction repeatable?", ["Reading 'latest' data", "Parameterising by watermark or run date", "Random sampling", "Using SELECT *"], 1, "A fixed parameter gives the same slice every time.")],
           [iq("How do you validate data in an ETL pipeline?", "Layered checks: schema and types, domain/format rules, referential integrity, uniqueness and batch-level volume/reconciliation checks. Each rule has a policy (warn, quarantine or fail), rejects are stored with reasons, and abnormal reject rates stop the run."),
            iq("How do you handle duplicates from a source?", "Define the business key, pick a deterministic winner (latest updated_at plus tie-breaker) with ROW_NUMBER or MERGE, keep the raw data, add a uniqueness test, and raise the root cause with the source owner.")],
           ["py-14", "py-20", "sql-27", "sql-28"]),

    lesson("etl-load-incremental-cdc", M, "Loading: full vs incremental, CDC, idempotency and late data", 20, "intermediate", ["etl-extract-transform", "sql-de-patterns"],
           "Loading strategies and the guarantees that make reruns safe.",
           r"""
## Full vs incremental

A **full load** replaces the target with the entire source. Simple and self-healing, but cost grows with data size and it can disrupt consumers if not published atomically.

An **incremental load** moves only changes. It needs a way to identify them:

| Method | How | Catches deletes? | Notes |
|---|---|---|---|
| Watermark column | `updated_at > last_watermark` | No | Needs a trustworthy, indexed timestamp |
| Incrementing ID | `id > last_id` | No | Only for append-only data |
| Hash/diff comparison | Compare row hashes | Yes (full scan of keys) | Heavy but robust |
| **CDC** (change data capture) | Read the DB transaction log | **Yes** | Lowest source impact, captures every change |
| Soft-delete flag | `is_deleted` column | Yes | Needs source support |

### Change Data Capture

CDC reads the database's write-ahead/transaction log and emits an event per insert/update/delete, with before and after images and an operation type. Tools: Debezium (to Kafka), SQL Server CDC / Change Tracking, Azure Data Factory CDC resources. Apply the events to the target in order with a MERGE: `op = 'D'` deletes, `'U'` updates, `'I'` inserts.

## Idempotent loading

The golden rule: **running the same load twice must not change the result.**

1. **Upsert** keyed on the business key (`MERGE`, `INSERT ... ON CONFLICT DO UPDATE`).
2. **Partition overwrite**: delete-and-reload the date partition inside one transaction.
3. **Staging + swap**: load to a staging table, validate, then atomically swap/merge.
4. **Deterministic keys**: derive IDs from content (hash) rather than random UUIDs per run.

```python
conn.executemany(
    "INSERT INTO t(id, val) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET val = excluded.val", rows)
```

Avoid blind `INSERT` appends for anything that can be retried.

## Watermark correctness

Update the stored watermark **after** the load commits, in the same transaction if possible. Add an **overlap window** (e.g. re-read the last 10 minutes or 1 day) and rely on idempotent upserts, so late commits and clock skew do not lose rows.

## Late-arriving data

Events can arrive after their business date. Strategies: reprocess a rolling lookback window of partitions; key facts by **event time**, not load time; for dimensions, insert an "inferred member" placeholder and update it when the real record lands; publish provisional numbers and restate.

## Full-load vs incremental decision guide

- Table small (< a few million rows) and cheap to reload: full load, simplest.
- Large, append-only: incremental by ID/date.
- Large, mutable: watermark + MERGE, or CDC when deletes matter.
- Need audit/history of changes: CDC into a change table, then SCD2.

## Common mistakes

- Watermark on a column that is not updated on every change.
- Advancing the watermark when the load failed.
- No handling for deletes, so the warehouse drifts from the source.
- Non-deterministic dedupe that picks different rows per run.

## Real-world use

A bank replicates its core-banking customer table via CDC into Kafka and onward to the lakehouse. Deletes and updates are applied by MERGE, giving a near-real-time mirror without hammering the production database.
""",
           [mcq("Which method captures deletes with minimal source impact?", ["Watermark on updated_at", "Change Data Capture from the transaction log", "Full table SELECT", "ID > last_id"], 1, "CDC reads the log and emits delete events too."),
            mcq("Why add an overlap window to the watermark?", ["To use more storage", "To tolerate late commits and clock skew, relying on idempotent upserts", "To slow the job", "To avoid MERGE"], 1, "Re-reading a small overlap is cheap and prevents missed rows."),
            mcq("Which is idempotent?", ["INSERT of all rows each run", "MERGE keyed on the business key", "Appending a file each run", "Sending an email"], 1, "Upsert yields the same final state however many times it runs.")],
           [iq("How do you implement an incremental load safely?", "Store a watermark per source, extract rows newer than it with a small overlap, dedupe and MERGE into the target idempotently, handle deletes (CDC or soft-delete), and advance the watermark only after the commit succeeds."),
            iq("What is CDC and when do you use it over a watermark?", "CDC captures row-level changes from the database transaction log. Use it when deletes matter, no reliable updated_at exists, or you need low source impact and near-real-time replication.")],
           ["py-21", "py-22", "sql-31"]),

    lesson("etl-resilience-scheduling", M, "Retries, failure handling, logging, monitoring and scheduling", 18, "intermediate", ["etl-load-incremental-cdc"],
           "Operating pipelines in production: how they fail, how they recover, and how you find out.",
           r"""
## Failures are normal

A pipeline touching networks, disks and other teams' systems will fail regularly. The goal is not "never fails" but **fails loudly, recovers safely and tells the right person**.

### Kinds of failure

| Kind | Examples | Response |
|---|---|---|
| Transient | Network blip, 503, deadlock, throttling | Retry with backoff |
| Data | Bad record, schema change, nulls in a key | Quarantine or fail with a clear message |
| Logic | Bug in transformation | Fix, backfill, add a test |
| Infrastructure | Out of memory, disk full, expired credential | Alert; scale or rotate; rerun |
| Upstream | Late or missing source file | Sensor/wait with timeout, then alert |

## Retries done properly

- Retry **only transient** errors and **only idempotent** operations.
- **Exponential backoff** (1s, 2s, 4s, ...) with **jitter** (random spread) so many jobs do not retry in lockstep.
- Bound attempts and total time; then fail.
- Distinguish retrying a *task* (orchestrator) from retrying a *call* (inside code).

```python
for attempt in range(1, 5):
    try:
        return call()
    except TransientError:
        if attempt == 4: raise
        time.sleep(min(30, 2 ** attempt) * (0.5 + random.random()))
```

## Recovering from a pipeline that failed halfway

1. **Do not panic-rerun.** Read the logs, find which step failed and why.
2. Check what was already written (partial loads).
3. Because steps are idempotent and published atomically, **rerun from the failed step** (or the whole run for that date).
4. Verify with counts/reconciliation, then notify consumers.
5. Add a test/alert so it is caught earlier next time.

If steps are *not* idempotent, you must clean up partial writes first. This is the strongest argument for designing idempotency from day one.

## Logging and monitoring

Log at each stage with **run id, step, source, rows read/written/rejected, duration**. Use structured (JSON) logs so they can be searched. Never log secrets or PII.

Monitor four signals:

1. **Success/failure** of each run.
2. **Duration** (sudden growth predicts trouble).
3. **Volume** (rows in/out versus normal band).
4. **Freshness** (is the target as recent as the SLA?).

Alert on symptoms that matter to users (data is late or wrong), route to an owner with a runbook link, and avoid alert floods that train people to ignore pages.

## Scheduling

- **Time-based**: cron-like (`0 2 * * *`).
- **Dependency/event-based**: start when upstream data lands (sensor, storage event trigger).
- **Parameterised runs**: each run processes a *logical date*, enabling backfills.
- Pick a schedule offset that allows late data to arrive; define SLAs.
- Orchestrators (Airflow, ADF) provide scheduling, dependencies, retries and monitoring so you do not hand-roll them with cron.

## Common mistakes

- Retrying non-idempotent writes.
- Swallowing exceptions so the scheduler thinks the run succeeded.
- No alert on "job did not run at all".
- Logging only on failure, leaving nothing to compare with.

## Real-world use

A nightly sales pipeline retries API calls three times, quarantines bad rows, emits `rows_in=1.2M rows_out=1.19M rejects=9.6K`, and pages on-call only if the finished data is more than two hours later than SLA.
""",
           [mcq("Which errors are good retry candidates?", ["Schema mismatch", "Transient network timeouts", "Logic bugs", "Permission denied"], 1, "Transient failures often succeed on retry; others will just fail again."),
            mcq("Why add jitter to backoff?", ["To lengthen waits", "To avoid many clients retrying simultaneously", "To hide errors", "To use less CPU"], 1, "Randomisation prevents a thundering herd."),
            mcq("A pipeline failed halfway. The safest recovery is possible because steps are:", ["Fast", "Idempotent and published atomically", "Sequential", "Logged"], 1, "You can rerun without duplicates or partial exposure.")],
           [iq("A pipeline failed halfway through. How do you recover?", "Inspect logs for the failing step and cause, check partial writes, fix the root cause, then rerun from the failed step or for the date since the steps are idempotent with atomic publish; verify counts via reconciliation and notify consumers; add a test or alert to prevent recurrence."),
            iq("What do you monitor in a data pipeline?", "Run success/failure, duration, row counts versus expected bands, data freshness against SLA, reject rates, schema drift and resource usage, with alerts routed to owners and runbooks.")],
           ["py-23"]),

    lesson("etl-end-to-end", M, "Putting it together: an end-to-end batch pipeline", 16, "advanced", ["etl-resilience-scheduling", "dw-architecture"],
           "How extraction, transformation, loading, scheduling and monitoring combine in one design.",
           r"""
## The scenario

A retailer wants a **daily sales mart** by 07:00. Orders live in an operational database; product prices come from a vendor API; finance wants reconciled numbers.

## Design

```
02:00 trigger (parameter: run_date)
  |-- extract_orders   (DB, watermark, overlap 1 day)  --> raw/orders/dt=run_date
  |-- extract_prices   (API, paginated, retries)       --> raw/prices/dt=run_date
  v
  transform (clean, dedupe, join) --> curated/sales/dt=run_date (Parquet)
  v
  validate (counts, nulls, uniqueness, totals) -- fail => alert, stop
  v
  load_warehouse (MERGE into fact_sales by order_line_id)
  v
  refresh_marts + reconcile with source totals
  v
  notify (success summary) / alert (failure)
```

## Principles applied

1. **Parameterised by run date**: any day can be rerun or backfilled.
2. **Raw preserved**: raw files are append-only and dated; transformations are replayable.
3. **Idempotent steps**: partition overwrite for curated, MERGE for the warehouse.
4. **Validation gate** before publishing.
5. **Observability**: each step logs run id, counts and duration to a `pipeline_runs` table.
6. **Failure isolation**: extraction of prices failing retries independently of orders.

## A runnable miniature (what you build in Projects 1 and 4)

```python
def run(run_date):
    log.info("start run_date=%s", run_date)
    raw = list(extract(run_date))
    clean, rejects = transform_and_validate(raw)
    if len(rejects) > 0.05 * max(len(raw), 1):
        raise RuntimeError("reject rate above 5%")
    load(clean)                      # idempotent upsert
    reconcile(run_date, expected_total=sum(r["amount"] for r in raw))
    log.info("done rows=%d rejects=%d", len(clean), len(rejects))
```

## Trade-offs to be able to discuss

- Schedule time vs source availability and late data.
- Fail the whole run or quarantine and continue.
- Reprocess entire history on a logic change vs only forward.
- Single big job vs many small tasks (retry granularity vs overhead).
- Where to run transformations: Python (small), SQL in the warehouse (set-based), Spark (large).

## Common mistakes

- A monolithic script with no intermediate persisted state, so any failure restarts everything.
- Hard-coded dates and paths.
- No reconciliation, so subtle loss goes unnoticed for weeks.

## Real-world use

Variants of exactly this design run at almost every company: the specific tools differ (Airflow or ADF; Spark or SQL; Delta or Synapse), the shape does not.
""",
           [mcq("Why parameterise a pipeline by run date?", ["Style", "So any date can be rerun or backfilled identically", "To speed it up", "To reduce logs"], 1, "Parameters decouple the logic from 'now'."),
            mcq("What is the purpose of a validation gate before publishing?", ["Documentation", "Prevent bad data reaching consumers", "Speed", "Compression"], 1, "It stops the run before wrong data is exposed.")],
           [iq("Design a daily sales pipeline.", "Parameterised by run date; extract orders incrementally and prices from an API into dated raw files; transform and dedupe into curated Parquet; validate counts, nulls, uniqueness and totals; MERGE into the warehouse fact; refresh marts; reconcile against the source; log run metrics; alert on failure; schedule with an orchestrator with retries and SLAs."),
            iq("How do you handle a logic change that affects history?", "Fix the transformation, then backfill by re-running affected dates from raw in order. Idempotent partition overwrites or MERGE make this safe; communicate restated numbers to stakeholders.")]),
]
