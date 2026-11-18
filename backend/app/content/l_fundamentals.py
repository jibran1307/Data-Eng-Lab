"""Module 3: Data Engineering Fundamentals."""
from ._types import iq, lesson, mcq

M = "fundamentals"

LESSONS = [
    lesson("de-what-is", M, "What data engineering is: the role, the lifecycle and the big picture", 14, "beginner", [],
           "What a data engineer actually does, the data lifecycle, and how Python, SQL, Airflow and Spark fit together.",
           r"""
## The problem data engineering solves

A company's data is scattered: orders in an application database, payments in a vendor API, clickstream in log files, spreadsheets from finance. Analysts, dashboards and machine-learning models need that data **combined, cleaned, trustworthy and fresh**. Data engineering is the discipline of building the systems that reliably move and shape data so others can use it.

> Analogy: if analysts are chefs, data engineers build the kitchen supply chain: sourcing, washing, storing and delivering ingredients on time, every day.

## What a data engineer does

- **Ingest** data from databases, APIs, files, events.
- **Transform** it: clean, join, standardise, aggregate.
- **Store** it in the right place and format (lake, warehouse).
- **Orchestrate** the work on schedules with dependencies and retries.
- **Guarantee quality**: tests, monitoring, lineage, alerting.
- **Secure and govern**: access control, PII protection, cost control.

Compared with neighbours: *data analysts* ask questions of data; *data scientists* build models; *analytics engineers* model data in the warehouse (often with dbt); *data engineers* build the platform and pipelines underneath.

## The data lifecycle

1. **Generation**: applications, devices, users create data.
2. **Ingestion**: batch extracts, CDC, APIs, streams.
3. **Storage**: raw landing zone, then curated layers.
4. **Transformation**: cleaning, modelling.
5. **Serving**: warehouse tables, APIs, BI dashboards, ML features.
6. **Governance across all steps**: quality, security, lineage, cost.

## How the tools fit together (a worked example)

Daily sales reporting for an e-commerce company:

1. **Airflow** triggers the pipeline at 02:00.
2. A **Python** task calls the orders API (paginated, with retries) and lands raw JSON files in the data lake.
3. A **Spark** job (Databricks) reads the raw files, cleans and deduplicates them, and writes Parquet to the curated zone.
4. **SQL** in the warehouse models fact and dimension tables (`MERGE` incremental load).
5. **Quality checks** (row counts, uniqueness, freshness) run; failure alerts the on-call engineer.
6. The **BI dashboard** reads the warehouse and the business sees yesterday's revenue at 07:00.

Each tool has one job: Python glues and calls, Spark scales transformations, SQL models and serves, Airflow coordinates. Keep this picture in mind throughout the course.

## Learning vs production

- **Learning:** run small pipelines locally (this app) to understand concepts.
- **Production:** adds scale, security, monitoring, on-call, cost, change management and many stakeholders. Later modules call out the difference explicitly.

## Common misconceptions

- "Data engineering is just ETL." It is also reliability, modelling, platform and governance.
- "More tools means better." Simple pipelines that are monitored beat clever pipelines nobody understands.

## Real-world use

A bank's fraud team needs card transactions within seconds, while the finance team needs reconciled end-of-day numbers. Same sources, two latency needs: the platform serves both through streaming and batch paths.
""",
           [mcq("The primary goal of data engineering is to:", ["Build ML models", "Reliably move and prepare data so others can use it", "Design dashboards", "Manage hardware"], 1, "Data engineers build the pipelines and platform that make data available and trustworthy."),
            mcq("In the sales example, which tool coordinates scheduling and dependencies?", ["Spark", "SQL", "Airflow", "Parquet"], 2, "Orchestrators like Airflow schedule, order and retry tasks."),
            mcq("Which is NOT typically a data engineer's core duty?", ["Building pipelines", "Ensuring data quality", "Choosing marketing strategy", "Securing data"], 2, "Marketing strategy is a business function.")],
           [iq("What does a data engineer do?", "Design, build and operate pipelines and platforms that ingest, transform, store, serve and govern data reliably, with quality checks, monitoring and security, so analysts, scientists and applications can trust and use it."),
            iq("Explain how SQL, Python, Spark and Airflow work together in a pipeline.", "Airflow schedules and orchestrates; Python extracts from APIs and glues steps; Spark does large-scale transformation; SQL models data in the warehouse and serves analytics. Each handles the part it is best at.")]),

    lesson("de-storage-formats", M, "OLTP vs OLAP, file formats, columnar storage and partitioning", 18, "beginner", ["de-what-is"],
           "Why analytical systems differ from application databases, and how CSV, JSON, Parquet, Avro and ORC compare.",
           r"""
## OLTP vs OLAP

| | OLTP (transactions) | OLAP (analytics) |
|---|---|---|
| Purpose | Run the business: place an order, update a balance | Analyse the business: revenue by region |
| Queries | Many small reads/writes by key | Few huge scans and aggregations |
| Data | Current, normalised | Historical, denormalised |
| Storage | Row-oriented | Column-oriented |
| Examples | PostgreSQL, Azure SQL, Oracle | Synapse, Snowflake, BigQuery, Databricks SQL |

Running heavy analytics on the OLTP database slows the application, which is why data is **copied into** an analytical system.

## Structured, semi-structured, unstructured

- **Structured**: fixed schema (tables, CSV).
- **Semi-structured**: self-describing but flexible (JSON, XML, Avro).
- **Unstructured**: text, images, audio, PDFs.

## Row vs columnar storage

A **row store** keeps all fields of a record together: great for "fetch order 42". A **column store** keeps each column together: great for "sum of `amount` over 1 billion rows", because it reads only that column, compresses similar values very well, and skips blocks using min/max statistics.

## File formats

| Format | Layout | Schema | Compressed | Best for |
|---|---|---|---|---|
| CSV | Row, text | None | No (gzip optional) | Simple exchange; avoid for big data |
| JSON | Row, text | Self-describing, nested | No | APIs, event payloads |
| **Parquet** | **Columnar**, binary | Embedded | Yes | Analytics, the default lake format |
| **Avro** | Row, binary | Embedded, strong **schema evolution** | Yes | Streaming (Kafka), record-at-a-time writes |
| **ORC** | Columnar, binary | Embedded | Yes | Hive/Hadoop ecosystems |

Rule of thumb: **Avro for streaming/row-wise ingestion, Parquet for analytics**. A 50 GB CSV is often under 8 GB as Parquet and queries read only the needed columns.

```python
import pandas as pd
df = pd.read_csv("sales.csv")
df.to_parquet("sales.parquet", index=False)     # needs pyarrow
```

## Partitioning

Partitioning splits a dataset into folders by a column, usually a date:

```
sales/
  year=2024/month=01/part-0001.parquet
  year=2024/month=02/part-0001.parquet
```

A query with `WHERE month = '2024-02'` reads only that folder (**partition pruning**). Choose a column that queries filter on and with moderate cardinality: partitioning by `customer_id` creates millions of tiny files (the *small files problem*), partitioning by nothing forces full scans.

## Schema evolution

Sources change: columns are added, renamed, types widen. Formats and table layers differ in tolerance. Adding a nullable column is usually safe; renaming or changing a type can break downstream readers. Use formats with embedded schemas (Parquet, Avro), a schema registry for streams, contract tests, and a policy: additive changes automatically, breaking changes through review.

## Common mistakes

- Landing everything as CSV, then fighting types forever.
- Over-partitioning (too many tiny files) or under-partitioning.
- Treating schema changes as rare; they are routine.

## Real-world use

An insurer receives claim files as CSV, converts them on ingest to date-partitioned Parquet, and their analysts' queries become 10x faster and cheaper.
""",
           [mcq("Why is Parquet good for analytics?", ["It is human-readable", "Columnar layout, compression and embedded schema let queries read only needed columns", "It supports updates in place", "It is row based"], 1, "Columnar formats minimise I/O for aggregations."),
            mcq("Which format is a typical choice for Kafka messages with evolving schemas?", ["CSV", "Avro", "Excel", "Parquet only"], 1, "Avro has strong schema evolution rules and works well with a schema registry.", "intermediate"),
            mcq("Partitioning by customer_id for 50M customers causes:", ["Faster queries always", "A huge number of tiny files (small-files problem)", "Compression", "Nothing"], 1, "High-cardinality partition keys are an anti-pattern.", "intermediate")],
           [iq("OLTP vs OLAP?", "OLTP supports transactional application workloads: many small, current-state reads/writes on normalised row-store data. OLAP supports analytics: large scans and aggregations over historical, denormalised, usually columnar data."),
            iq("Why Parquet over CSV?", "Parquet is columnar, compressed, typed and splittable with statistics for data skipping, so queries read far less data and avoid parsing ambiguity; CSV is untyped text with no schema.")]),

    lesson("de-pipelines", M, "Pipelines: ETL vs ELT, batch vs streaming, ingestion, quality and reliability", 20, "intermediate", ["de-storage-formats"],
           "How pipelines are shaped and what makes them dependable: idempotency, fault tolerance, quality and lineage.",
           r"""
## A data pipeline

A pipeline is an automated series of steps that moves data from sources to destinations, transforming it on the way. Pipelines are **code that runs repeatedly**, so reliability matters more than cleverness.

## ETL vs ELT

- **ETL** (Extract, Transform, Load): transform *before* loading, on a separate engine. Historically used when warehouses were expensive and rigid.
- **ELT** (Extract, Load, Transform): load raw data first, transform *inside* the scalable warehouse/lakehouse with SQL or Spark. Dominant today because storage and compute are cheap and elastic, raw data is kept for replay, and transformations are versioned SQL.

Neither is "better": use ETL when data must be masked or reduced before it may land, ELT when you want raw history and flexible modelling.

## Batch vs streaming

| | Batch | Streaming |
|---|---|---|
| Latency | Minutes to hours | Milliseconds to seconds |
| Processing | Bounded datasets on a schedule | Unbounded events continuously |
| Complexity | Lower | Higher (ordering, late data, state) |
| Use | Daily reports, finance close | Fraud detection, live metrics |

Start with batch; add streaming only where the business value of freshness justifies the cost.

## Ingestion patterns

- **Full load**: copy everything each time; simple, fine for small tables.
- **Incremental load**: only new/changed rows via a watermark column.
- **Change Data Capture (CDC)**: read the database's change log to capture inserts, updates and deletes with low impact.
- **Event ingestion**: consume messages from a broker.

## Medallion layering

Organise lake/lakehouse data into layers: **Bronze** (raw, as received), **Silver** (cleaned, deduplicated, conformed), **Gold** (business-level models for reporting). Raw data is never overwritten, so any later layer can be rebuilt.

## Reliability principles

1. **Idempotency**: running a step twice gives the same result (upsert/overwrite partition instead of blind append).
2. **Fault tolerance**: retries with backoff, checkpoints, resumable steps, dead-letter handling.
3. **Atomicity of publishing**: write to a staging location, validate, then swap so consumers never read half-written data.
4. **Observability**: log row counts, durations, freshness; alert on anomalies.
5. **Backfill-ability**: the pipeline takes a date parameter so history can be reprocessed.

## Data quality

Dimensions: completeness, uniqueness, validity, consistency, timeliness, accuracy. Implement as automated checks (not-null, unique, accepted values, referential integrity, row-count and freshness thresholds), run between layers, and decide per check: **warn**, **quarantine** bad rows, or **fail** the pipeline.

## Data lineage

Lineage records where each dataset came from and which jobs touched it, so you can answer "which dashboards break if this column changes?" and "where did this wrong number come from?".

## Common mistakes

- Appending without deduplication (retry = duplicates).
- Transforming in place and destroying raw data.
- Quality checks that only log and never block bad data.
- No alerting: failures noticed by the CEO.

## Real-world use

A bank ingests card transactions via CDC into bronze, deduplicates and masks PAN in silver, aggregates daily positions in gold; every step is idempotent so a failed night is simply re-run.
""",
           [mcq("Which statement describes ELT?", ["Transform before loading on a separate server", "Load raw data first, then transform inside the warehouse/lakehouse", "Only for streaming", "It avoids storage"], 1, "ELT leverages scalable destination compute and keeps raw data."),
            mcq("Idempotency means:", ["The job is fast", "Re-running with the same input produces the same final result", "The job never fails", "Data is encrypted"], 1, "It makes retries and backfills safe."),
            mcq("In the medallion architecture, silver holds:", ["Raw as-received data", "Cleaned, deduplicated, conformed data", "Dashboards", "Credentials"], 1, "Bronze = raw, Silver = cleaned, Gold = business-ready."),
            mcq("What is CDC?", ["Compressing data", "Capturing inserts/updates/deletes from a source's change log", "A file format", "A cloud region"], 1, "CDC streams row-level changes with low source impact.", "intermediate")],
           [iq("ETL vs ELT: which and why?", "ELT when the destination (cloud warehouse/lakehouse) scales and I want raw history and flexible SQL transformations. ETL when data must be filtered/masked before landing or the target cannot transform efficiently."),
            iq("How do you make a pipeline fault tolerant and idempotent?", "Use retries with backoff, checkpoints, atomic publish via staging and swap, upserts/partition overwrite instead of blind appends, deterministic transformations, and parameterise by run date so reruns and backfills give identical results.")]),

    lesson("de-lakes-warehouses", M, "Data lakes, warehouses, lakehouses and data marts", 15, "intermediate", ["de-storage-formats"],
           "Where data lives and why modern platforms combine the lake and the warehouse.",
           r"""
## Data lake

A **data lake** is low-cost, scalable object storage (ADLS Gen2, S3) holding data in its raw or lightly processed form: files of any type, no strict schema on write (**schema-on-read**). Great for raw history, semi/unstructured data and ML. Risk: without governance it becomes a **data swamp**.

## Data warehouse

A **data warehouse** stores curated, structured, modelled data in a database optimised for analytics (**schema-on-write**), with SQL, ACID transactions, security and strong performance for BI. Risk: rigid and costlier for raw/unstructured data.

## Lakehouse

A **lakehouse** puts warehouse features on lake files via open table formats (**Delta Lake**, Apache Iceberg, Apache Hudi): ACID transactions, schema enforcement, time travel, upserts (`MERGE`) and SQL on top of Parquet files in cheap storage. Databricks and Microsoft Fabric are built around it, one copy of data serving both BI and data science.

| | Lake | Warehouse | Lakehouse |
|---|---|---|---|
| Data | Any, raw | Structured, curated | Any, with table semantics |
| Schema | On read | On write | Enforced + evolvable |
| Transactions | No | Yes | Yes (table format) |
| Cost | Lowest | Higher | Low |
| Typical users | Engineers, scientists | Analysts, BI | All |

## Data marts

A **data mart** is a subject-focused slice of the warehouse for one team (sales, finance, marketing): smaller, simpler models with the columns and metrics that team needs, often with tighter access control. It can be physical (separate tables/schemas) or virtual (views).

## How they connect

```
Sources -> [Landing/Bronze in lake] -> [Silver cleaned] -> [Gold models / warehouse] -> Marts -> BI
```

In practice most organisations use a lake for raw/cheap storage plus a warehouse or lakehouse gold layer for serving.

## Common mistakes

- Dumping files into a lake with no naming, partitioning, catalog or ownership.
- Building a warehouse copy of everything instead of curated models.
- Treating lakehouse as magic: you still need modelling.

## Real-world use

A retailer lands raw POS and web data in ADLS, cleans it with Databricks into Delta tables, builds a star schema for finance in the warehouse, and gives marketing a mart with campaign metrics.
""",
           [mcq("Schema-on-read means:", ["Schema enforced when data is written", "Structure is applied when data is queried", "No schema ever", "Schemas are read-only"], 1, "Lakes store raw files and interpret structure at query time."),
            mcq("What does a lakehouse add to a lake?", ["Nothing", "ACID transactions, schema enforcement and SQL via open table formats", "Less storage", "Row stores"], 1, "Delta/Iceberg/Hudi layers provide warehouse-like reliability on files."),
            mcq("A data mart is:", ["A raw landing zone", "A subject-focused subset of curated data for a team", "A backup", "A message queue"], 1, "e.g. sales mart or finance mart.")],
           [iq("Lake vs warehouse vs lakehouse?", "Lake: cheap raw storage, schema-on-read. Warehouse: curated, modelled, schema-on-write with strong SQL/BI performance. Lakehouse: lake storage with transactional table formats giving warehouse features on one copy of data."),
            iq("What is a data swamp and how do you avoid it?", "An ungoverned lake nobody can navigate or trust. Avoid with naming/partition conventions, a catalog, ownership, quality checks, retention policies and a layered (medallion) design.")]),

    lesson("de-modeling", M, "Data modelling: facts, dimensions, star and snowflake schemas", 18, "intermediate", ["de-lakes-warehouses"],
           "How analytical data is structured so queries are simple and fast.",
           r"""
## Why model data at all?

Source tables are designed for applications (normalised, many joins). Analysts need models that are **easy to query, consistent in meaning, and fast**. Dimensional modelling (Kimball) organises data into **facts** (events/measurements) and **dimensions** (context).

## Fact tables

A fact table records business events at a declared **grain** (one row per...). Example `fact_sales`: one row per order line. Columns are foreign keys to dimensions plus numeric **measures** (quantity, amount).

Types: **transaction** (one row per event), **periodic snapshot** (balance at end of each day), **accumulating snapshot** (a process lifecycle, e.g. order placed/shipped/delivered dates).

Measure types: *additive* (sum across all dimensions, e.g. amount), *semi-additive* (sum across some, e.g. account balance not across time), *non-additive* (ratios; store numerator and denominator).

## Dimension tables

Descriptive context: who, what, where, when. `dim_customer`, `dim_product`, `dim_date`. Wide, denormalised, with a **surrogate key** (a meaningless integer the warehouse controls) in addition to the **natural/business key** from the source. Surrogate keys protect from source key changes and enable history (SCD Type 2).

## Star schema

```
          dim_date
             |
dim_customer -- fact_sales -- dim_product
             |
         dim_store
```

One central fact joined to flat dimensions. Fewer joins, simple SQL, great BI tool support, excellent performance. **Snowflake schema** normalises dimensions into sub-tables (`dim_product -> dim_category`): saves a little space, adds joins and complexity. Prefer star unless there is a clear reason.

```sql
SELECT d.year, p.category, SUM(f.amount) AS revenue
FROM fact_sales f
JOIN dim_date d    ON d.date_key = f.date_key
JOIN dim_product p ON p.product_key = f.product_key
GROUP BY d.year, p.category;
```

## Design steps (the Kimball four)

1. Pick the **business process** (sales).
2. Declare the **grain** (order line).
3. Identify the **dimensions**.
4. Identify the **facts/measures**.

Declaring grain first prevents the most common modelling error: mixing grains in one table.

## Normalisation vs dimensional modelling

Normalise OLTP sources for integrity; model the warehouse dimensionally for analytics. Newer "one big table" and Data Vault approaches exist; the dimensional model remains the most widely used for reporting.

## Common mistakes

- No declared grain.
- Putting descriptive text in the fact table.
- Using natural keys as primary keys and losing history when they change.
- A snowflake schema "to save space" that makes every report a 7-way join.

## Real-world use

An insurer's `fact_claim` (grain: claim) joins `dim_policy`, `dim_customer`, `dim_date` (multiple role-playing date keys: loss date, report date, settle date) so finance and operations share one consistent definition of "claim amount".
""",
           [mcq("What is the grain of a fact table?", ["Its size", "What one row represents", "Its primary index", "Its partition"], 1, "Declare it first; every measure must be true at that grain."),
            mcq("A surrogate key is:", ["The source system's business ID", "A warehouse-generated meaningless key", "A foreign key to itself", "A hash of the table"], 1, "It decouples the warehouse from source key changes and supports history."),
            mcq("Star vs snowflake: star schemas usually offer", ["More joins, less redundancy", "Fewer joins and simpler queries", "No dimensions", "Only normalised tables"], 1, "Flat dimensions mean simpler, faster analytical queries.")],
           [iq("Explain fact and dimension tables.", "Facts store measurable business events at a declared grain with foreign keys to dimensions and numeric measures; dimensions hold descriptive context (customer, product, date) used to filter, group and label the facts."),
            iq("Why use surrogate keys?", "They are stable, compact integers independent of source systems, allow multiple versions of the same business entity (SCD2), and speed joins.")]),

    lesson("de-governance-basics", M, "Reliability and trust: quality, lineage, security and cost basics", 12, "intermediate", ["de-pipelines"],
           "The responsibilities that turn working pipelines into trusted data products.",
           r"""
## Data as a product

Teams adopt dashboards only if they trust the numbers. Trust comes from **ownership, tests, documentation and communication**, not from tooling alone.

## The quality loop

1. **Define** expectations with the business (what is "valid"?).
2. **Test** automatically at ingestion and between layers.
3. **Monitor** freshness, volume, schema and distribution drift.
4. **Alert** the owner with context, **fix** root causes, **record** incidents.

Common automated tests: not null, unique, accepted values, referential integrity, row-count vs. source, freshness (max timestamp within SLA), and reconciliation totals.

## Lineage and catalog

A **data catalog** documents datasets, owners, definitions and sensitivity; **lineage** shows dependencies. Together they speed incident response and impact analysis.

## Security and privacy basics

- **Least privilege** and role-based access control.
- **Encryption** at rest and in transit (TLS).
- **PII** (names, emails, national IDs, card numbers): identify, minimise, mask or tokenise, restrict, and respect retention and deletion rules (GDPR-style rights).
- **Secrets** (passwords, keys) live in a vault (Azure Key Vault), never in code or logs.
- **Audit logs** record who accessed what.

## Cost awareness

Cloud costs scale with storage, compute time and data scanned. Partition and compress, avoid `SELECT *`, auto-terminate idle clusters, right-size, and monitor spend by pipeline.

## Common mistakes

- Treating quality as a one-time cleanup.
- Granting everyone admin "to make it work".
- Logging full records containing PII.

## Real-world use

A healthcare analytics platform masks patient identifiers in silver, exposes only aggregated gold tables to analysts, and logs every access for audit.
""",
           [mcq("Which is a data freshness check?", ["Count distinct customers", "Verify the latest timestamp is within the agreed SLA", "Compute AVG", "Check column names"], 1, "Freshness measures how recent the data is."),
            mcq("Where should database passwords be stored?", ["In the notebook", "In a secrets vault referenced at runtime", "In Git", "In log files"], 1, "Vaults centralise, rotate and audit secrets.")],
           [iq("How do you ensure data quality in pipelines?", "Agree expectations, implement automated tests (null, unique, accepted values, referential integrity, volume, freshness), run them between layers, quarantine or fail on violations, monitor trends, alert owners, and track incidents to root cause."),
            iq("How do you handle PII?", "Classify it, minimise collection, mask/tokenise early, encrypt, restrict access by role, audit access, apply retention and deletion policies, and keep it out of logs and non-prod environments.")]),
]
