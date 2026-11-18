"""Module 4: Data Warehousing."""
from ._types import iq, lesson, mcq

M = "warehousing"

LESSONS = [
    lesson("dw-architecture", M, "Warehouse architecture, layers and loading strategies", 16, "intermediate", ["de-modeling"],
           "Staging, core and mart layers; full vs incremental loading; historical data and optimisation.",
           r"""
## Why a warehouse

Operational systems answer "what is true now". A warehouse answers "what happened, and how does it compare?" across all systems, with consistent definitions. It is the **single source of truth** feeding BI and analytics.

## Typical layered architecture

```
Sources -> STAGING (raw copy, truncate/reload)
        -> CORE / INTEGRATION (cleaned, conformed dimensions, facts)
        -> MARTS (subject-oriented, aggregates, reporting views)
        -> BI / APIs / ML
```

- **Staging**: exact copy of source extracts. No business logic. Replaceable and disposable.
- **Core**: cleaned, deduplicated, keys assigned, history tracked, **conformed dimensions** shared by all facts (one `dim_customer` for everyone).
- **Marts**: denormalised, aggregated models for a domain.

## Loading strategies

| Strategy | How | Use when |
|---|---|---|
| Full refresh | Truncate and reload | Small tables, simple logic |
| Incremental append | Add only new rows | Immutable events (logs, transactions) |
| Incremental upsert (MERGE) | Insert new, update changed | Mutable entities (customers, orders) |
| Partition overwrite | Replace one date partition | Reprocessable daily batches |
| Snapshot | Capture state periodically | Balances, inventory |

Handling **deletes**: soft-delete flags, CDC delete events, or periodic full-key comparison.

## Historical data management

Keep raw history immutable, track attribute changes with SCD2, snapshot slow-changing balances, and archive old partitions to cheap storage with a retention policy. Reports must be reproducible: "revenue for last March, as it was reported then" sometimes needs **time travel** or snapshots.

## Warehouse optimisation

- **Distribution/partitioning**: spread data across nodes; co-locate join keys to avoid shuffling (e.g. hash-distribute big facts on the join key, replicate small dimensions).
- **Clustering / sort keys / indexing**: order data to help filtering.
- **Columnar compression and statistics**.
- **Materialised views and aggregate tables** for expensive, repeated queries.
- **Workload management**: separate ETL and BI compute so loads do not slow dashboards.
- **Query design**: filter on partition columns, select needed columns.

## Common mistakes

- Putting business logic in staging, so raw can never be reloaded cleanly.
- Separate "customer" definitions per mart (non-conformed dimensions) producing conflicting numbers.
- Full-reloading billion-row facts nightly.
- No retention policy; storage grows silently.

## Real-world use

A bank's finance warehouse loads transactions incrementally each hour, rebuilds a daily positions snapshot at close, and keeps seven years of history for regulators.
""",
           [mcq("A conformed dimension is:", ["A dimension duplicated per team", "A shared dimension with one consistent definition used across fact tables", "A compressed dimension", "A temporary table"], 1, "It lets facts from different processes be analysed together consistently."),
            mcq("For mutable customer records, the best incremental strategy is:", ["Append-only", "MERGE (upsert)", "Truncate source", "Delete warehouse"], 1, "Changes must update existing rows, so upsert."),
            mcq("Staging should contain:", ["Heavy business logic", "A raw, disposable copy of source extracts", "Final reports", "Only aggregates"], 1, "Keep staging simple so it can be reloaded.")],
           [iq("Explain the layers of a warehouse.", "Staging holds raw extracts; core integrates, cleans and models conformed dimensions and facts with history; marts provide subject-specific denormalised models for reporting. Raw is separated from business logic so each layer can be rebuilt."),
            iq("Full vs incremental loading?", "Full reloads everything (simple, expensive at scale); incremental loads only new/changed rows via watermark or CDC (efficient, needs idempotency and delete handling).")]),

    lesson("dw-scd", M, "Slowly Changing Dimensions Types 0, 1, 2 and 3 in depth", 18, "advanced", ["dw-architecture", "sql-de-patterns"],
           "Choose and implement the right history strategy, with surrogate vs natural keys.",
           r"""
## The problem

Customer 42 lives in Boston in 2022 and moves to Seattle in 2023. A 2022 sale should still report as Boston. What do we store when a dimension attribute changes? That decision is a **Slowly Changing Dimension** (SCD) strategy, chosen per attribute.

## The types

| Type | What happens on change | History | Use |
|---|---|---|---|
| **0** | Never changes (retain original) | Original only | Birth date, original sign-up channel |
| **1** | Overwrite | None | Corrections, attributes where history is irrelevant |
| **2** | Insert new row; expire the old one | Full | The default for analytics-relevant attributes |
| **3** | Keep prior value in an extra column | Previous only | Limited "current vs previous" needs |
| 6 (hybrid) | Type 1 + 2 + 3 combined | Full + current on all rows | Advanced reporting needs |

### Type 2 structure

| sk | customer_id | city | valid_from | valid_to | is_current |
|---|---|---|---|---|---|
| 1 | 42 | Boston | 2022-01-01 | 2023-06-30 | false |
| 2 | 42 | Seattle | 2023-07-01 | 9999-12-31 | true |

`sk` is the **surrogate key** (unique per version); `customer_id` is the **natural/business key** (same across versions). Facts store the *surrogate key valid at load time* (or use a point-in-time join on dates), so each sale points to the right version.

## Implementing Type 2 (SQL outline)

```sql
-- 1) Expire changed current rows
UPDATE dim_customer d SET valid_to = CURRENT_DATE - 1, is_current = FALSE
FROM stg_customer s
WHERE d.customer_id = s.customer_id AND d.is_current AND d.city <> s.city;

-- 2) Insert new versions (and brand-new customers)
INSERT INTO dim_customer (customer_id, city, valid_from, valid_to, is_current)
SELECT s.customer_id, s.city, CURRENT_DATE, DATE '9999-12-31', TRUE
FROM stg_customer s
LEFT JOIN dim_customer d ON d.customer_id = s.customer_id AND d.is_current
WHERE d.customer_id IS NULL OR d.city <> s.city;
```

Detect change by comparing tracked columns (or a **hash** of them). Run both steps in one transaction. Make it idempotent: re-running the same day must not create duplicate versions.

## Choosing a type: ask the business

"If this attribute changes, should last year's report change?" If no, Type 2. If yes (correction), Type 1. If you only ever need the previous value, Type 3. Mix per column: `email` Type 1, `segment` Type 2.

## Surrogate vs natural keys

- **Natural key**: identifies the entity in the source (`customer_id`, `SSN`). May be reused, reformatted, or collide across sources.
- **Surrogate key**: warehouse-generated integer. Stable, compact, enables multiple versions. Always add a surrogate key to dimensions; keep the natural key as an attribute for lookups and incremental matching.

## Common mistakes

- Type 2 on every column, exploding row counts for volatile attributes (e.g. "last_login").
- Joining facts to the current row and silently rewriting history.
- Gaps or overlaps in validity date ranges; test for them.
- Forgetting the "unknown member" row (key -1) for facts with missing dimension values.

## Real-world use

Insurance: policy premium band and customer region are Type 2 so loss ratios by region remain correct historically; customer phone is Type 1.
""",
           [mcq("Which SCD type keeps full history by adding rows?", ["0", "1", "2", "3"], 2, "Type 2 versions rows with validity dates."),
            mcq("Which SCD type overwrites with no history?", ["Type 1", "Type 2", "Type 3", "Type 0"], 0, "Type 1 simply updates the value."),
            mcq("Why store a surrogate key in dimensions?", ["It is required by SQL", "To uniquely identify each version and decouple from source keys", "To save space only", "To encrypt data"], 1, "Natural keys repeat across Type 2 versions, so a surrogate key distinguishes them."),
            mcq("A valid Type 2 table should have:", ["Overlapping validity ranges", "Exactly one current row per natural key with no gaps/overlaps", "No dates", "Duplicate surrogate keys"], 1, "Validity ranges must be contiguous and non-overlapping.", "advanced")],
           [iq("Explain SCD Type 2 with an example.", "When a customer moves from Boston to Seattle, close the Boston row (set valid_to, is_current false) and insert a Seattle row with a new surrogate key and open-ended valid_to. Facts join by date so historical sales still report as Boston."),
            iq("How do you test an SCD2 dimension?", "Assert exactly one current row per natural key, no overlapping or gapped date ranges, valid_from < valid_to, unique surrogate keys, and that fact rows map to exactly one dimension version.")],
           ["sql-29", "sql-30"]),

    lesson("dw-modeling-practice", M, "Practical modelling: design a retail warehouse end to end", 20, "advanced", ["dw-scd", "sql-window-functions"],
           "A worked design exercise: requirements to grain, dimensions, DDL, load logic and analytical queries.",
           r"""
## The business brief

A retailer wants to analyse **sales by product, customer segment, store and month**, compare to prior periods, and see customer history even after they move. Sources: an orders database (orders, order lines, customers, products).

## Step 1: business process and grain

Process: sales. **Grain: one row per order line.** (Not per order: an order has many products.)

## Step 2: dimensions

- `dim_date` (generated calendar: date_key, day, month, quarter, year, is_weekend)
- `dim_customer` (SCD2: city, segment)
- `dim_product` (SCD1: name, category, brand)
- `dim_store` / channel

## Step 3: facts

`fact_sales` measures: `quantity`, `gross_amount`, `discount_amount`, `net_amount`. Degenerate dimension: `order_number` kept on the fact.

## Step 4: DDL

```sql
CREATE TABLE dim_customer (
  customer_key INTEGER PRIMARY KEY,     -- surrogate
  customer_id  INTEGER NOT NULL,        -- natural
  name VARCHAR, city VARCHAR, segment VARCHAR,
  valid_from DATE NOT NULL, valid_to DATE NOT NULL, is_current BOOLEAN NOT NULL
);

CREATE TABLE fact_sales (
  date_key INTEGER NOT NULL,
  customer_key INTEGER NOT NULL,
  product_key INTEGER NOT NULL,
  order_number INTEGER NOT NULL,
  quantity INTEGER, gross_amount DECIMAL(12,2), discount_amount DECIMAL(12,2), net_amount DECIMAL(12,2)
);
```

## Step 5: load logic

1. Load staging from the source.
2. Upsert `dim_product` (SCD1), apply SCD2 to `dim_customer`.
3. Build facts by joining staged order lines to dimensions to look up **surrogate keys** (for customers use the version valid on the order date).
4. Missing dimension members map to key `-1` ("Unknown"), and the count is monitored.
5. Make facts idempotent: delete-and-insert the processed date partition inside a transaction, or MERGE on (order_number, line_number).

## Step 6: analytical queries

```sql
-- Revenue by segment and month, with change vs previous month
WITH m AS (
  SELECT d.year, d.month, c.segment, SUM(f.net_amount) AS revenue
  FROM fact_sales f
  JOIN dim_date d ON d.date_key = f.date_key
  JOIN dim_customer c ON c.customer_key = f.customer_key
  GROUP BY 1, 2, 3)
SELECT *, revenue - LAG(revenue) OVER (PARTITION BY segment ORDER BY year, month) AS change
FROM m;
```

## Validation checklist

- Fact row count equals staged line count (minus rejects).
- Sum of `net_amount` reconciles to the source system.
- No fact row has a NULL dimension key.
- One current row per customer; no date overlaps.
- Re-running the load changes nothing.

## Common mistakes

- Mixing order-level and line-level amounts in one fact.
- Storing derived/aggregated numbers that cannot be re-summed.
- Missing a date dimension and using raw timestamps everywhere.

## Real-world use

This is the template behind countless retail, banking and telecom warehouses: a fact at the finest useful grain, shared conformed dimensions, SCD2 where history matters, daily idempotent loads, and reconciliation checks.

> Hands-on: Project 3 (Data Warehouse) implements exactly this in SQL.
""",
           [mcq("What is a degenerate dimension?", ["A broken dimension", "An identifier like order_number stored on the fact with no dimension table", "A deleted dimension", "A snowflaked dimension"], 1, "It carries context without needing its own table."),
            mcq("A fact row whose product is unknown should:", ["Be dropped silently", "Map to an 'Unknown' dimension member and be monitored", "Fail the entire load always", "Use a random product"], 1, "Keeping the fact and flagging the gap preserves totals while exposing the data issue."),
            mcq("Why must the fact load be idempotent?", ["For style", "So retries and backfills don't duplicate rows", "To enable partitioning", "To reduce columns"], 1, "Otherwise a re-run double-counts revenue.")],
           [iq("Walk me through designing a warehouse for e-commerce sales.", "Pick the process (sales), declare the grain (order line), define dimensions (date, customer SCD2, product, store/channel), define measures, create surrogate keys, build staging and idempotent loads, handle unknown members, add reconciliation tests, and expose marts/views for BI."),
            iq("How do you reconcile warehouse numbers to the source?", "Compare row counts and key measure totals by day between source and fact (accounting for rejects), investigate differences by key, automate the comparison and alert when beyond tolerance.")],
           ["sql-29"]),
]
