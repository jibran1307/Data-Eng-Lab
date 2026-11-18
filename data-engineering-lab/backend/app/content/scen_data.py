"""Real-world scenario practice. Each scenario has a rubric of weighted concept groups (synonyms per group)."""
from __future__ import annotations

from typing import Any


def sc(id: str, title: str, topic: str, level: str, business: str, task: str, hints: list[str],
       reference: str, rubric: list[tuple[str, int, list[list[str]], str]], realworld: str) -> dict[str, Any]:
    assert sum(r[1] for r in rubric) == 100, id
    return {
        "id": id, "title": title, "topic": topic, "level": level, "business": business, "task": task,
        "hints": hints, "reference": reference.strip("\n"), "realworld": realworld.strip("\n"),
        "rubric": [{"name": n, "weight": w, "keywords": k, "tip": t} for n, w, k, t in rubric],
    }


SCENARIOS: list[dict[str, Any]] = [
    sc("sc-failed-halfway", "A pipeline failed halfway through execution", "etl", "intermediate",
       "The nightly orders pipeline loads 40 million rows into the warehouse. At 03:10 the job crashed after loading about 60% of the data. Finance dashboards at 07:00 now show partial numbers, and the on-call engineer must recover without creating duplicates.",
       "Explain how you would diagnose and recover the pipeline, and what design changes would prevent partial loads from being visible next time.",
       ["First: what state is the target in? Can you tell what was loaded?", "Think about transactions and loading into a staging table first.", "How would a rerun avoid loading the same rows twice?", "What would you check before declaring recovery complete?"],
       r"""
**Immediate response**
1. **Stabilise**: tell consumers the data is incomplete (banner/hold dashboard refresh) so nobody acts on partial numbers.
2. **Diagnose** from logs and the run-history table: which stage failed, the error (timeout, out-of-memory, source schema change, lock), and how many rows were committed.
3. **Fix the root cause** (resource, bad record, credentials) or apply a safe workaround.

**Recover safely**
- If the load is **idempotent per partition/run date** (delete-and-insert or MERGE on a key), simply **rerun** the same run date; the result is identical to a clean run.
- If the load is not idempotent, first **roll back or remove the partial data** (delete rows with that `run_id`/date) then rerun.
- Resume from the failed stage if earlier stages were checkpointed (raw files already landed) rather than re-extracting everything.

**Verify**: reconcile source vs target counts and sums, check for duplicates on the business key, then release the dashboards.

**Prevent next time**
- Load into a **staging table** and swap/publish only after validation (atomic publish), or load inside a transaction.
- Store a **run_id and status** per run; alert on failure; add retries for transient errors.
- Add **reconciliation checks** and a post-load data-quality gate so partial data is never published.
- Write a **runbook** and practise the failure drill.
""",
       [("Stabilise and communicate", 10, [["stakeholder", "notify", "communicate", "alert", "dashboard", "inform"]], "Mention telling consumers the data is incomplete."),
        ("Diagnose from logs and state", 15, [["log", "logs", "run history", "run_id", "monitoring"], ["root cause", "error", "diagnose", "investigate"]], "Find what failed and how much loaded."),
        ("Idempotent rerun", 25, [["idempotent", "idempotency", "rerun safely", "safe to rerun"], ["merge", "upsert", "delete and insert", "overwrite partition", "delete insert"]], "Reruns must not duplicate rows."),
        ("Transactions or staging / atomic publish", 20, [["transaction", "atomic", "rollback", "roll back", "staging", "swap"]], "Partial data should never be visible."),
        ("Reconciliation and validation", 15, [["reconcile", "reconciliation", "row count", "count", "checksum", "validation", "data quality"]], "Prove completeness before release."),
        ("Prevention: retries, alerts, checkpoints, runbook", 15, [["retry", "retries", "alert", "checkpoint", "runbook", "orchestrator", "airflow"]], "Reduce recurrence.")],
       r"""
At banks and insurers a failed nightly load is a normal operational event, so mature teams design for it: orchestrators (Airflow/ADF) with retries and alerts, per-run audit tables, partition-level idempotent loads and a documented runbook. The incident review ends with a ticket for the structural fix (atomic publish, data-quality gate), not just the rerun.
"""),

    sc("sc-duplicates", "A source system sends duplicate records", "etl", "intermediate",
       "The CRM export sometimes sends the same customer twice, occasionally with different values (a newer email, an old phone). Downstream customer counts are inflated and marketing emails are sent twice.",
       "Describe how you would detect, resolve and prevent duplicates in the pipeline and in the warehouse.",
       ["Are the duplicates exact copies or different versions of the same key?", "Which row should win?", "Where can you enforce uniqueness?", "How do you stop them reappearing on reruns?"],
       r"""
**Classify first**: *exact duplicates* (identical rows, often from retries or file re-delivery) versus *conflicting versions* (same business key, different values).

**Detect**: `GROUP BY business_key HAVING COUNT(*) > 1`; track duplicate rate as a metric and alert when it spikes.

**Resolve**
- Pick the **business key** (`customer_id`) and a deterministic **tie-breaker** (latest `updated_at`, then highest ingest sequence).
- Deduplicate in the transform layer: `ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY updated_at DESC, ingested_at DESC) = 1` (or `dropDuplicates` after sorting in Spark).
- Keep the discarded rows in a **quarantine/audit** table for investigation rather than deleting silently.

**Prevent**
- **Idempotent loads** with `MERGE`/upsert keyed on the business key, so re-delivery of a file cannot create duplicates.
- A **primary key / unique constraint** in the warehouse (where supported) or a uniqueness check as a quality gate.
- Track processed file names/hashes so the same file is not loaded twice.
- Raise the problem with the source owner and agree a **data contract**.
""",
       [("Distinguish exact vs conflicting duplicates", 15, [["exact", "identical", "full duplicate"], ["conflict", "different values", "versions", "latest"]], "These need different handling."),
        ("Detection with group by / count", 15, [["group by", "having", "count", "duplicate rate", "profile"]], "Measure before fixing."),
        ("Deterministic dedupe using a key and ordering", 25, [["row_number", "row number", "window", "dropduplicates", "drop duplicates", "distinct"], ["business key", "primary key", "natural key", "customer_id"], ["latest", "updated_at", "timestamp", "most recent", "tie break", "tie-break"]], "State which row wins and why."),
        ("Idempotent load / constraints", 25, [["merge", "upsert", "idempotent", "unique constraint", "primary key"]], "Prevent re-introduction on reruns."),
        ("Quarantine, audit and source feedback", 10, [["quarantine", "audit", "data contract", "source owner", "feedback", "alert"]], "Do not silently delete.") ,
        ("Quality gate / monitoring", 10, [["quality check", "data quality", "test", "monitor", "alert", "gate"]], "Catch regressions automatically.")],
       r"""
In a bank's customer master, duplicates are also a *regulatory* issue (KYC). Teams run entity-resolution rules, keep a golden record, and use MERGE-based loads with survivorship rules (which source wins per attribute). Duplicate rate is a tracked data-quality KPI with an owner.
"""),

    sc("sc-scale-growth", "A dataset grows from 1 GB to 500 GB", "spark", "advanced",
       "A pandas script processing daily clickstream took 2 minutes at 1 GB. After a product launch the daily file is 500 GB and the job runs out of memory after hours.",
       "How would you re-architect and optimise processing for the new scale?",
       ["Where does the single machine break: memory, CPU or disk?", "What storage format would help?", "How can you avoid reading everything?", "How do you process in parallel?"],
       r"""
**Why it breaks**: pandas is single-node and in-memory; 500 GB cannot fit and a CSV must be fully parsed.

**Re-architect**
1. **Distributed processing**: move to Spark (Databricks/EMR/local cluster) or a scalable SQL engine so work is split across executors.
2. **Columnar, compressed storage**: convert CSV to **Parquet** (or Delta), which reads only needed columns and supports predicate pushdown.
3. **Partitioning**: store by `event_date` (and maybe region) so a query reads only the partitions it needs (partition pruning). Avoid too many tiny files; target roughly 128 MB to 1 GB files.
4. **Incremental processing**: process only the new day's partition rather than reprocessing history.
5. **Push work down**: filter and select early, avoid `collect()`/`toPandas()` on big data, use built-in functions instead of UDFs.
6. **Joins**: broadcast small dimensions; watch for skewed keys; tune shuffle partitions or use AQE.
7. **Scale compute elastically** (autoscaling job clusters) and pay only while the job runs.

**Validate**: benchmark on a sample, read the Spark UI for shuffle/skew/spill, set data-quality and cost monitors.
""",
       [("Identify single-node limits", 10, [["memory", "single machine", "single node", "out of memory", "oom"]], "Explain why it fails."),
        ("Distributed engine", 20, [["spark", "distributed", "databricks", "cluster", "parallel"]], "Move to parallel processing."),
        ("Columnar format (Parquet/Delta)", 20, [["parquet", "delta", "orc", "columnar"]], "Format matters as much as engine."),
        ("Partitioning and pruning", 20, [["partition", "partitioning", "pruning", "partitioned by"]], "Read less data."),
        ("Incremental processing", 10, [["incremental", "only new", "watermark", "new partition", "daily partition"]], "Avoid reprocessing history."),
        ("Join and shuffle tuning", 10, [["broadcast", "shuffle", "skew", "aqe", "salting"]], "Handle joins and skew."),
        ("Cost/elasticity and measurement", 10, [["autoscal", "elastic", "job cluster", "cost", "spark ui", "benchmark", "monitor"]], "Measure and control cost.")],
       r"""
A common real migration: nightly pandas jobs become Databricks jobs reading raw files from ADLS, writing partitioned Delta tables. Engineers first prove correctness against the old output on a sample day, then optimise (file sizes, partitioning, broadcast joins), and finally put it behind an orchestrator with alerts.
"""),

    sc("sc-incremental", "Implement incremental loading", "etl", "intermediate",
       "A 300M-row orders table in the source database is fully reloaded every night, taking 6 hours and straining the source. Only about 1% of rows change daily.",
       "Design an incremental load, including how you handle updates, deletes and failures.",
       ["How do you know which rows changed?", "Where do you store progress?", "What about deletes?", "What if the job fails after copying?"],
       r"""
**Options to detect change**
- **Watermark** on a reliable `updated_at` (or increasing id): `WHERE updated_at > :last_watermark AND updated_at <= :new_watermark`.
- **Change Data Capture (CDC)** from database logs (captures inserts, updates *and deletes*).
- **Change tracking / hash comparison** when no reliable timestamp exists.

**Design**
1. Store the **watermark** in a state table; read old, compute new (`MAX(updated_at)` at start of run) so rows changing mid-run are not missed.
2. Extract the delta into a **staging** table.
3. **MERGE/upsert** into the target on the business key (updates existing, inserts new). This makes the load idempotent.
4. **Deletes**: use CDC delete flags, soft-delete columns, or periodic reconciliation against the source keys.
5. **Advance the watermark only after the merge commits**; use a small overlap window (re-read the last few minutes/hours) and rely on the idempotent MERGE.
6. **Safety nets**: a periodic full reconciliation (counts/checksums), alerts on abnormal delta size, a way to reset the watermark and backfill.
""",
       [("Change detection method", 25, [["watermark", "updated_at", "timestamp", "cdc", "change data capture", "change tracking", "high water"]], "Name how changes are found."),
        ("State management of the watermark", 15, [["state table", "watermark table", "store the watermark", "checkpoint", "last run", "last value"]], "Persist progress."),
        ("Idempotent merge/upsert", 25, [["merge", "upsert", "idempotent", "on conflict"]], "Apply changes safely."),
        ("Handling deletes", 15, [["delete", "deletes", "soft delete", "tombstone", "cdc"]], "Watermarks miss hard deletes."),
        ("Failure ordering and overlap", 10, [["only after", "after commit", "overlap", "transaction", "retry", "rerun"]], "Advance watermark after success."),
        ("Reconciliation and monitoring", 10, [["reconcile", "reconciliation", "checksum", "row count", "full refresh", "monitor", "alert"]], "Detect drift over time.")],
       r"""
ADF's watermark pattern (Lookup old, Lookup new, Copy with a parameterised query, Stored Procedure to update) and Databricks Auto Loader / Delta MERGE implement exactly this. Banks often prefer log-based CDC so deletes and intermediate states are captured without loading the source system.
"""),

    sc("sc-schema-change", "Handle schema changes from a source", "fundamentals", "advanced",
       "A partner API adds new fields, renames `cust_id` to `customer_id` and changes `amount` from integer to a string with a currency symbol. Last month this broke the pipeline and dashboards.",
       "How would you design the pipeline and the process so schema changes do not cause outages or silent corruption?",
       ["Which changes are safe and which are breaking?", "Where should schema be enforced?", "What should happen to unexpected records?", "Who should be told?"],
       r"""
**Classify changes**
- *Additive* (new nullable column): usually safe; can be allowed automatically (schema evolution).
- *Breaking* (rename, removal, type change, semantic change): must not flow silently downstream.

**Design**
1. **Land raw as-is** (bronze) with ingestion metadata so nothing is lost and you can reprocess after fixing the logic.
2. **Explicit schema + validation** at the bronze-to-silver boundary: expected columns, types and constraints. Unknown new columns are logged or captured in a catch-all column; type failures go to **quarantine**.
3. **Schema evolution policy**: allow additive changes (Delta `mergeSchema`, Avro/Protobuf with a schema registry and backward-compatible rules); require review for breaking ones.
4. **Mapping layer** for renames (`cust_id` to `customer_id`) so downstream contracts stay stable.
5. **Data contracts and alerts**: a schema-drift check compares incoming schema with the contract and alerts the owner/partner *before* publishing.
6. **Versioned transformations and tests** with sample payloads for each schema version; keep a rollback path.
""",
       [("Additive vs breaking", 15, [["additive", "backward compatible", "backward-compatible", "non-breaking"], ["breaking", "rename", "type change", "removed column"]], "Different handling for each."),
        ("Raw landing and replay", 15, [["raw", "bronze", "as is", "as-is", "reprocess", "replay"]], "Never lose data."),
        ("Explicit schema validation", 20, [["schema validation", "enforce", "explicit schema", "expected schema", "validate", "schema check"]], "Detect drift at the boundary."),
        ("Schema evolution mechanism", 15, [["mergeschema", "schema evolution", "schema registry", "avro", "protobuf", "evolve"]], "Use tooling for safe evolution."),
        ("Quarantine / mapping layer", 15, [["quarantine", "dead letter", "mapping", "alias", "rename mapping", "compatibility layer"]], "Isolate bad data and stabilise names."),
        ("Contracts, alerts and communication", 20, [["data contract", "contract", "alert", "notify", "owner", "partner", "monitor"]], "Process matters as much as code.")],
       r"""
Mature platforms use a schema registry or data contracts with producers, CI checks on contract changes, and a bronze layer that tolerates anything while silver enforces the contract. Breaking changes follow a deprecation process with a notice period.
"""),

    sc("sc-slow-spark", "Troubleshoot a slow Spark job", "spark", "advanced",
       "A Spark job that took 20 minutes last month now takes 3 hours. The cluster size has not changed. Daily data volume grew about 30%.",
       "Walk through how you would find and fix the cause.",
       ["Where do you look first?", "What would indicate skew versus shuffle versus I/O problems?", "What can you change in code and in configuration?", "How do you confirm the fix?"],
       r"""
**1. Compare, then look in the Spark UI**: what changed (data volume, new join, code, cluster, file layout)? Find the **slowest stage**.

**2. Diagnose**
- **Skew**: a few tasks take far longer than the median; one key dominates.
- **Large shuffle / spill**: shuffle read/write sizes large, spill to disk, many stages.
- **Small files / bad partitioning**: thousands of tiny tasks, or too few huge partitions.
- **Inefficient plan** (`df.explain()`): missing pushdown, sort-merge join where a broadcast would do, Python UDFs, repeated recomputation without caching.
- **GC / memory pressure**, or reading uncompressed CSV instead of Parquet.

**3. Fix and re-measure**
- Filter and select columns early; use Parquet/Delta with partition pruning.
- **Broadcast** small tables; enable **AQE** (skew join, coalesce partitions); salt or isolate hot keys.
- Right-size `spark.sql.shuffle.partitions`; compact small files.
- Replace UDFs with built-ins; cache only reused DataFrames.
- Increase resources only after fixing the plan.
- Change one thing at a time and compare runtimes and shuffle volumes.
""",
       [("Use Spark UI and find the slow stage", 20, [["spark ui", "stage", "slowest", "task time", "dag"]], "Evidence before changes."),
        ("Check for skew", 15, [["skew", "straggler", "hot key", "uneven", "salting"]], "Look at task time distribution."),
        ("Shuffle and partitions", 15, [["shuffle", "partition", "spill", "shuffle partitions"]], "Understand shuffle cost."),
        ("Inspect the plan and pushdown", 15, [["explain", "physical plan", "pushdown", "predicate", "plan"]], "Read the execution plan."),
        ("Join strategy / broadcast / AQE", 15, [["broadcast", "aqe", "adaptive", "join strategy", "sort merge", "sort-merge"]], "Choose the right join."),
        ("File format and small files", 10, [["parquet", "small files", "compaction", "file size", "delta"]], "Storage layout."),
        ("Iterate and measure", 10, [["one change at a time", "measure", "benchmark", "re-run", "compare", "baseline"]], "Verify each fix.")],
       r"""
Real teams keep a performance baseline per job (runtime, shuffle bytes, spill) and alert on regressions, so a slowdown is caught when data grows 30%, not when SLAs are missed. Skew from a new customer or a NULL key is the single most common culprit.
"""),

    sc("sc-daily-sales", "Design a daily sales data pipeline", "design", "intermediate",
       "A retailer wants daily revenue by store, product category and channel in a dashboard by 07:00. Sources: POS files from 400 stores (CSV via SFTP), an e-commerce API, and a product table in SQL Server.",
       "Design the pipeline end to end: layers, tools, scheduling, data quality, failure handling and the reporting model.",
       ["Start from the SLA and sources.", "What layers do you keep?", "How do you model for reporting?", "What happens when one store file is missing?"],
       r"""
**Flow**
1. **Orchestrate** (Airflow/ADF) at 01:00 with `run_date` parameter, dependencies and retries.
2. **Ingest** each source to a **raw/bronze** zone untouched, partitioned by ingest date (POS files copied from SFTP; API paginated with incremental `updated_since`; SQL Server by watermark/CDC).
3. **Validate**: expected files from all stores arrived (completeness check), schema, nulls, duplicates, negative amounts; quarantine bad rows.
4. **Transform to silver**: typed, deduplicated, standardised currency/timezone, joined to product and store reference data.
5. **Model to gold** as a **star schema**: `fact_sales` (grain: order line), `dim_product`, `dim_store`, `dim_date`, `dim_customer`; plus a pre-aggregated daily table for the dashboard.
6. **Serve** through a warehouse/semantic layer to BI.

**Reliability**: idempotent per-date loads, reconciliation of totals with source, alerts if data is not fresh by 06:30, handling of late/missing store files with a re-run window, runbook.
**Governance/cost**: PII masking, access control, partition pruning, job clusters.
""",
       [("Orchestration with parameters and retries", 15, [["airflow", "adf", "data factory", "orchestrat", "scheduler", "schedule"], ["run_date", "parameter", "retry", "retries", "dependency"]], "Run dependably and repeatably."),
        ("Raw/bronze landing", 15, [["raw", "bronze", "landing", "lake", "staging"]], "Keep source data untouched."),
        ("Validation and quality gates", 20, [["validate", "validation", "data quality", "quarantine", "completeness", "missing file", "row count"]], "Block bad data."),
        ("Layered transformation (silver/gold)", 15, [["silver", "gold", "curated", "transform", "medallion"]], "Progressive refinement."),
        ("Star schema modelling and grain", 20, [["star schema", "fact", "dimension"], ["grain", "order line", "dim_date", "dim_product", "dim_store"]], "Model for reporting."),
        ("Idempotency, reconciliation, alerting", 15, [["idempotent", "reconcile", "reconciliation", "alert", "sla", "freshness", "monitor"]], "Operational safety.")],
       r"""
This is the most common interview design question. On Azure: ADF copies to ADLS raw, Databricks produces silver/gold Delta, Synapse or Fabric serves Power BI, with alerts if gold is not refreshed by 06:30.
"""),

    sc("sc-late-data", "Handle late-arriving data", "streaming", "advanced",
       "Mobile payment events sometimes arrive hours late when phones are offline. Your hourly revenue report was already published, and late events now change totals. Finance wants numbers they can trust and reconcile.",
       "How do you handle late data in batch and streaming, and how do you keep reports trustworthy?",
       ["What time should reports be based on?", "How long do you wait?", "What do you do with data after the window closes?", "How do you communicate changes?"],
       r"""
**Use event time, not arrival time**, for business metrics, and also record `ingested_at`.

**Batch**: partition by event date but ingest by arrival date; run a **reprocessing/lookback window** (for example always recompute the last 3 days) using idempotent MERGE/partition overwrite so late rows correct earlier results.

**Streaming**: use **event-time windows with a watermark** (allowed lateness). Events within the watermark update the window; later events go to a **late-data side output/table** for batch correction.

**Reporting**
- Define business rules: report is *provisional* until the lateness window closes, then *final*; late corrections are tracked.
- Keep both the original and corrected values (versioning/time travel on Delta) so finance can reconcile and audit.
- Dashboards show a "data complete as of" timestamp.
- Monitor the lateness distribution to tune the watermark and lookback.
""",
       [("Event time vs processing/arrival time", 25, [["event time", "event_time"], ["processing time", "arrival", "ingested_at", "ingestion time"]], "Core distinction."),
        ("Watermark / allowed lateness", 20, [["watermark", "allowed lateness", "lateness"]], "Bound how long you wait."),
        ("Batch lookback and idempotent reprocessing", 20, [["lookback", "reprocess", "reprocessing", "backfill", "recompute", "late window"], ["merge", "idempotent", "overwrite", "upsert"]], "Fix totals safely."),
        ("Late data side output / table", 10, [["side output", "late table", "dead letter", "late data table", "quarantine"]], "Do not drop silently."),
        ("Reporting policy: provisional vs final, audit", 15, [["provisional", "final", "restatement", "audit", "time travel", "version", "reconcile"]], "Trust requires policy."),
        ("Monitoring lateness", 10, [["monitor", "distribution", "metric", "alert", "tune"]], "Tune from evidence.")],
       r"""
Payments and ad-tech platforms commonly run a stream for fast provisional numbers and a nightly batch that recomputes final numbers over a lookback window, a pragmatic hybrid of lambda and kappa architectures.
"""),

    sc("sc-data-quality", "Ensure data quality", "tools", "intermediate",
       "Executives noticed that last Tuesday's revenue number was wrong for two days before anyone found out. The pipeline run showed green the entire time.",
       "Design a data-quality strategy that detects and prevents this class of problem.",
       ["What did 'green' actually prove?", "Which kinds of checks exist?", "What should block a load and what should only warn?", "Who owns the response?"],
       r"""
**Why it happened**: job success is not data correctness. There were no checks on the data itself.

**Layered checks**
- **Schema**: expected columns/types.
- **Completeness**: null rates, required fields, expected files/partitions present.
- **Uniqueness**: primary-key duplicates.
- **Validity**: ranges, allowed values, formats.
- **Referential integrity**: facts reference existing dimensions.
- **Reconciliation**: counts and sums against the source system.
- **Freshness and volume**: latest timestamp recent; row count within a statistical range of the usual (anomaly detection).
- **Distribution drift**: sudden change in averages or category mix.

**Where and how**: run checks at stage boundaries (bronze to silver, silver to gold) using tests in code, SQL assertions, or tools (Great Expectations, dbt tests, Soda). Classify severity: **block** the publish for critical failures, **quarantine** bad rows, **warn** for minor issues.

**Operate**: owners per dataset, alerts to the owning team, dashboards for quality KPIs, SLAs/SLOs, data contracts with producers, incident reviews that add a new check for every incident.
""",
       [("Job success is not data correctness", 10, [["green", "job success", "success does not", "not enough", "silent"]], "Identify the gap."),
        ("Types of checks", 30, [["null", "completeness"], ["unique", "duplicate"], ["range", "validity", "valid values"], ["referential", "foreign key", "orphan"]], "Name several dimensions."),
        ("Reconciliation, freshness and volume", 20, [["reconcile", "reconciliation", "row count", "sum"], ["freshness", "volume", "anomaly"]], "Detect missing or stale data."),
        ("Placement and severity (block/quarantine/warn)", 15, [["block", "quarantine", "warn", "severity", "gate", "fail the"]], "Decide what to do on failure."),
        ("Tooling and automation", 10, [["great expectations", "dbt", "soda", "automated", "ci", "test"]], "Automate checks."),
        ("Ownership, alerts, SLAs, contracts", 15, [["owner", "alert", "sla", "slo", "data contract", "incident", "observability"]], "People and process.")],
       r"""
Data observability platforms and in-pipeline expectations are standard in finance. Each incident becomes a new automated check, so the same failure cannot reach executives twice.
"""),

    sc("sc-scalable-dw", "Design a scalable data warehouse", "warehousing", "advanced",
       "An insurer has policy, claims, billing and customer data in five systems. Analysts want a single trusted source; data volume is 20 TB and growing, with regulatory retention of 7 years.",
       "Design the warehouse architecture, model, loading approach and how it scales.",
       ["Which architecture style fits: warehouse, lake, lakehouse?", "How do you model for analytics?", "How do you manage history?", "How do you control cost and performance?"],
       r"""
**Architecture**: lakehouse/warehouse hybrid. Land sources in a **raw** layer (cheap object storage), refine into **cleansed** then **modelled** layers; serve the modelled layer from a scalable analytical engine (Synapse/Fabric/Databricks SQL/Snowflake-style MPP).

**Modelling**: dimensional **star schemas** per business process (claims, policies, billing) with **conformed dimensions** (customer, policy, date, product) shared across facts so cross-process analysis works. Define fact grain explicitly; use **surrogate keys**; manage history with **SCD Type 2** where analysis needs it; keep an unknown member for late dimensions.

**Loading**: incremental (CDC/watermark) with idempotent MERGE; orchestrated with dependencies; dimensions before facts; reconciliation to sources.

**Scale and performance**: columnar storage, **partitioning** by date, distribution/clustering keys for large joins, pre-aggregates/materialised views for hot dashboards, separate compute from storage and size compute per workload, workload isolation for BI vs ETL.

**Governance**: PII classification and masking, RBAC, lineage, retention/archival tiers for the 7-year rule, data catalog and definitions (single source of truth), monitoring and cost budgets.
""",
       [("Layered architecture (raw to modelled)", 15, [["raw", "bronze", "staging", "layer", "lakehouse", "medallion"]], "Separate concerns."),
        ("Dimensional modelling and grain", 25, [["star schema", "fact", "dimension"], ["grain"], ["conformed", "surrogate"]], "Model for analytics."),
        ("History / SCD", 15, [["scd", "slowly changing", "type 2", "history"]], "Preserve change history."),
        ("Incremental idempotent loading", 15, [["incremental", "cdc", "watermark", "merge", "idempotent"]], "Scalable loads."),
        ("Performance and scale techniques", 15, [["partition", "columnar", "distribution", "clustering", "materialized", "materialised", "aggregate", "separate compute"]], "Keep queries fast and costs controlled."),
        ("Governance, security, retention", 15, [["pii", "mask", "rbac", "lineage", "catalog", "retention", "archive", "governance"]], "Regulated environment.")],
       r"""
Insurance and banking warehouses are built around conformed dimensions and a business glossary, with data stewards owning definitions. Cost and performance are managed by workload-specific compute and tiered storage for older data.
"""),

    sc("sc-pipeline-slo", "Meet a freshness SLA for a critical report", "troubleshooting", "intermediate",
       "The executive revenue report must be ready by 07:00. Over the past month the nightly pipeline finished after 07:00 on five days, with no pattern obvious.",
       "How would you investigate and make the pipeline reliably meet the SLA?",
       ["What data do you need to see the pattern?", "Which stage dominates runtime?", "Which risks are variable (inputs, shared resources)?", "How would you build in safety margin and early warning?"],
       r"""
**Measure first**: use run history/orchestrator metrics to chart per-stage durations and start times for the last 30-60 runs; correlate late days with input size, upstream arrival time, day of week, month-end, concurrent jobs and retries.

**Typical causes**: late upstream data, input volume spikes, resource contention with other jobs, skew, long retries, serial steps that could run in parallel, full reloads, cold cluster startup.

**Fixes**
- Remove or shorten the dominant stage (incremental processing, partition pruning, broadcast joins, compaction).
- **Parallelise independent branches**; avoid unnecessary dependencies.
- **Data-driven triggers** instead of fixed start times; sensors with timeouts.
- Isolate resources (dedicated cluster/queue) so other jobs cannot starve it.
- **Early-warning alerts** (for example no input by 02:30, stage running 50% longer than normal) rather than only alerting at 07:00.
- Define a **fallback**: publish the previous good snapshot with a "not yet refreshed" banner; document an escalation path.
- Track SLA attainment as a KPI and run a post-mortem for each miss.
""",
       [("Measure with run history and metrics", 25, [["run history", "metrics", "duration", "durations", "trend", "monitor", "log"]], "Evidence before fixes."),
        ("Find the dominant stage / variable factors", 20, [["bottleneck", "slowest", "dominant", "critical path", "volume", "upstream", "late arrival", "contention"]], "Locate the cause."),
        ("Optimisation and parallelism", 20, [["incremental", "parallel", "partition", "optimi", "broadcast", "skew"]], "Reduce runtime."),
        ("Data-driven triggers and resource isolation", 15, [["sensor", "trigger", "dependency", "isolat", "dedicated", "queue", "resource"]], "Remove timing risks."),
        ("Early warning and fallback", 20, [["early warning", "alert", "sla", "fallback", "previous snapshot", "escalat", "banner", "post-mortem", "postmortem"]], "Operational resilience.")],
       r"""
SLAs are tracked like service-level objectives: for example 99% of days finished by 06:30, with error-budget reviews. Teams design with margin (finish by 05:00 typically for a 07:00 deadline).
"""),

    sc("sc-pii-lake", "Protect PII in a data lake", "tools", "advanced",
       "Analysts need customer behaviour data for segmentation, but the raw files contain names, emails, phone numbers and national IDs. A new regulation requires you to prove who accessed PII and to delete a customer's data on request.",
       "Design the controls for storage, access, analytics use and deletion requests.",
       ["Which data truly needs to be identifiable?", "How can analysts join data without raw identifiers?", "How do you control and prove access?", "How do you delete data in immutable files?"],
       r"""
**Minimise and classify**: identify PII columns, collect only what is needed, tag data in a catalog (Purview/Unity Catalog).

**Zones**: restrict raw PII to a small, locked-down zone; the analytics zone uses **tokenised or keyed-hash (HMAC) identifiers** and **masked** fields; aggregates for broad use.

**Access control**: RBAC with groups and least privilege, column-level security and dynamic masking, private networking, encryption at rest and in transit, secrets in a vault, and **audit logs** of every access retained per policy.

**Analytics without raw identifiers**: a stable pseudonymous key (HMAC with a secret pepper, or token vault) enables joins and counts without exposing identity. Beware re-identification through quasi-identifiers (postcode + birth date).

**Deletion/erasure**: keep a **subject-to-token map** so a request can locate all copies; use Delta `DELETE` plus `VACUUM` (or rewrite partitions) for lakehouse files; apply to downstream marts; define a backup/retention policy and document timelines; log fulfilment for audit.

**Process**: DPIA/review, no production PII in dev, PII-safe logging, regular access reviews.
""",
       [("Classification and minimisation", 15, [["classif", "minimi", "tag", "purview", "catalog", "pii columns"]], "Know what is PII."),
        ("Zoning and pseudonymisation / tokenisation", 25, [["tokenis", "tokeniz", "hmac", "hash", "pseudonym", "mask"], ["zone", "restricted", "separate", "raw zone"]], "Analysts should not need raw identifiers."),
        ("Access control and least privilege", 20, [["rbac", "least privilege", "column level", "column-level", "dynamic masking", "role"]], "Control who sees what."),
        ("Audit logging", 15, [["audit", "access log", "logging", "who accessed"]], "Prove access."),
        ("Deletion/erasure mechanism", 15, [["delete", "erasure", "right to be forgotten", "vacuum", "purge"]], "Immutable files need a plan."),
        ("Encryption, secrets, process controls", 10, [["encrypt", "key vault", "secret", "access review", "dev", "non-production", "private endpoint"]], "Defence in depth.")],
       r"""
Healthcare and banking platforms treat this as a primary design driver: PII is tokenised at ingestion, the token vault is isolated, analysts work on tokenised data, and erasure requests run as audited jobs across all layers.
"""),
]
