"""Module 1: Advanced SQL for Data Engineering."""
from ._types import iq, lesson, mcq

M = "sql"

LESSONS = [
    lesson("sql-foundations", M, "SQL fundamentals and query execution order", 14, "beginner", [],
           "How a SQL query is really evaluated, and the SELECT / WHERE / GROUP BY / HAVING toolkit.",
           r"""
## What SQL is, and why a data engineer lives in it

SQL (Structured Query Language) is a **declarative** language: you describe *what* result you want, and the database engine decides *how* to compute it. Almost every warehouse (Synapse, Snowflake, BigQuery, Databricks SQL) and every relational source system (Azure SQL, PostgreSQL, Oracle) speaks SQL, so it is the single most transferable skill in data engineering. Pipelines extract with SQL, transform with SQL, validate with SQL and serve analysts with SQL.

## The logical execution order

You *write* `SELECT` first, but the engine *evaluates* clauses in a different order. Understanding this explains most beginner errors.

| Step | Clause | What happens |
|---|---|---|
| 1 | `FROM` / `JOIN` | Build the working set of rows |
| 2 | `WHERE` | Filter individual rows |
| 3 | `GROUP BY` | Collapse rows into groups |
| 4 | `HAVING` | Filter whole groups |
| 5 | `SELECT` | Compute output columns and aliases |
| 6 | `DISTINCT` | Remove duplicate output rows |
| 7 | `ORDER BY` | Sort the result |
| 8 | `LIMIT` | Cut the result |

Consequences: you cannot use a `SELECT` alias inside `WHERE` (it does not exist yet), but you *can* use it in `ORDER BY`. You cannot put an aggregate such as `COUNT(*)` in `WHERE` because grouping has not happened; use `HAVING`.

## Core clauses by example

```sql
-- Revenue per product category for completed orders, only categories above 500
SELECT p.category,
       COUNT(*)                                  AS line_items,
       ROUND(SUM(oi.quantity * p.unit_price), 2) AS revenue
FROM   order_items oi
JOIN   products p ON p.product_id = oi.product_id
JOIN   orders   o ON o.order_id   = oi.order_id
WHERE  o.status = 'completed'          -- row filter, runs BEFORE grouping
GROUP  BY p.category
HAVING SUM(oi.quantity * p.unit_price) > 500   -- group filter, runs AFTER grouping
ORDER  BY revenue DESC;
```

### Aggregates and what they ignore

`COUNT(*)` counts rows. `COUNT(col)` counts rows where `col` is **not NULL**. `SUM`, `AVG`, `MIN`, `MAX` also skip NULLs, which means `AVG(col)` is *not* the same as `SUM(col)/COUNT(*)` when NULLs exist.

### Thinking in sets

A table is an unordered **set of rows**. Without `ORDER BY`, no order is guaranteed, even if rows appeared in order last time. Never build a pipeline that relies on implicit ordering.

## Common mistakes

- Filtering aggregates in `WHERE` instead of `HAVING`.
- Selecting a column that is neither grouped nor aggregated (most engines reject it; MySQL's old default silently returned an arbitrary value).
- Using `= NULL` instead of `IS NULL`.
- Assuming `SELECT *` is harmless: in columnar warehouses it forces reading every column and breaks downstream code when the schema changes.

## Real-world use

An insurance company's daily job counts claims per status and flags any status whose count jumped over 20% vs. yesterday. That is a `GROUP BY` plus a comparison, the same primitive that powers data-quality checks and dashboards.

> **Try it:** open the SQL Playground and solve *Orders per status* and *Big spenders (HAVING)*.
""",
           [mcq("Which clause is evaluated first logically?", ["SELECT", "WHERE", "FROM", "ORDER BY"], 2, "FROM/JOIN builds the working rowset before any filtering or projection happens."),
            mcq("Why does `WHERE COUNT(*) > 5` fail?", ["COUNT is deprecated", "Aggregates are computed after WHERE; use HAVING", "WHERE only accepts text", "It needs GROUP BY after it"], 1, "Rows are filtered before grouping, so aggregates are not available in WHERE. HAVING filters groups.", "beginner"),
            mcq("A column has values 10, 20, NULL. What does AVG(col) return?", ["10", "15", "30", "NULL"], 1, "AVG ignores NULLs: (10+20)/2 = 15, not 30/3 = 10.", "intermediate")],
           [iq("Explain the logical order in which SQL clauses are executed.", "FROM/JOIN -> WHERE -> GROUP BY -> HAVING -> SELECT -> DISTINCT -> ORDER BY -> LIMIT. This is why aliases defined in SELECT are not usable in WHERE but are usable in ORDER BY, and why aggregates need HAVING."),
            iq("What is the difference between WHERE and HAVING?", "WHERE filters individual rows before grouping and cannot reference aggregates. HAVING filters groups after aggregation. Filter with WHERE whenever possible because it reduces the rows that must be grouped.")],
           ["sql-01", "sql-02", "sql-03", "sql-05", "sql-09"]),

    lesson("sql-joins", M, "Joins and their variations", 16, "beginner", ["sql-foundations"],
           "INNER, LEFT, RIGHT, FULL, CROSS, SELF and anti/semi joins, plus the row-multiplication trap.",
           r"""
## Why joins exist

Relational databases split data into narrow tables (customers, orders, products) to avoid repeating information, a design called **normalisation**. A join recombines those tables at query time using a shared key. Every analytical report you ever build is a series of joins.

## The join family

Imagine `customers` (10 rows) and `orders` (16 rows).

| Join | Keeps | Typical use |
|---|---|---|
| `INNER JOIN` | Only rows with a match on both sides | "Orders with their customer" |
| `LEFT JOIN` | All left rows; right columns NULL when unmatched | "All customers, even those without orders" |
| `RIGHT JOIN` | Mirror of LEFT (rarely needed, swap the tables instead) | |
| `FULL OUTER JOIN` | All rows from both sides | Reconciling two systems: what is in A not B and vice versa |
| `CROSS JOIN` | Every combination (A x B) | Generating a date x product grid |
| Self join | A table joined to itself | Employee -> manager |

```sql
-- Customers who never ordered (anti-join)
SELECT c.name
FROM   customers c
LEFT   JOIN orders o ON o.customer_id = c.customer_id
WHERE  o.order_id IS NULL;

-- Same idea with NOT EXISTS, often clearer and just as fast
SELECT c.name FROM customers c
WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.customer_id);
```

### Semi-join and anti-join

A **semi-join** answers "does a match exist?" without multiplying rows (`EXISTS` / `IN`). An **anti-join** answers "does *no* match exist?" (`NOT EXISTS`, or LEFT JOIN + `IS NULL`). Prefer `NOT EXISTS` over `NOT IN`: `NOT IN` returns *no rows at all* if the subquery contains a NULL.

## The most important join bug: row multiplication

Joining on a non-unique key multiplies rows. If a customer has 3 orders and you join `customers` to `orders` and then `SUM(customers.credit_limit)`, the credit limit is counted three times. Always know the **grain** (what one row represents) of each table before joining.

```sql
-- Safe pattern: aggregate to the join grain first
WITH oc AS (SELECT customer_id, COUNT(*) AS n FROM orders GROUP BY customer_id)
SELECT c.name, COALESCE(oc.n, 0) AS orders
FROM customers c LEFT JOIN oc USING (customer_id);
```

## ON vs WHERE in outer joins

For a LEFT JOIN, a filter on the right table placed in `WHERE` silently turns it into an INNER JOIN (NULL rows are filtered out). Put right-table conditions in `ON` to keep the unmatched left rows.

## Common mistakes

- Joining without a key condition, creating an accidental cross join (millions of rows).
- Forgetting that NULL never equals NULL, so NULL keys never match.
- Using `SELECT DISTINCT` to hide a duplicated join instead of fixing the grain.

## Real-world use

Reconciling a bank ledger against a payments provider: a `FULL OUTER JOIN` on transaction id, then filtering for rows where either side is NULL, surfaces every missing or unmatched payment.
""",
           [mcq("Which join returns customers that have no orders?", ["INNER JOIN", "LEFT JOIN with WHERE orders.id IS NULL", "CROSS JOIN", "RIGHT JOIN with ON 1=1"], 1, "A LEFT JOIN keeps all customers; unmatched ones have NULL order columns, which the WHERE clause selects."),
            mcq("You LEFT JOIN customers to orders and add `WHERE o.status = 'completed'`. What happens?", ["Nothing changes", "Customers without completed orders disappear (it behaves like INNER JOIN)", "The query errors", "Rows duplicate"], 1, "Unmatched rows have NULL status, so the WHERE removes them. Put the condition in ON to preserve them.", "intermediate"),
            mcq("Why can NOT IN be dangerous?", ["It is slow only", "If the subquery returns a NULL, the whole predicate is never true", "It ignores duplicates", "It needs an index"], 1, "x NOT IN (1, NULL) evaluates to UNKNOWN, so no rows are returned. Use NOT EXISTS.", "advanced")],
           [iq("What is an anti-join and how do you write one?", "An anti-join returns rows from A with no match in B. Write it as NOT EXISTS (preferred) or LEFT JOIN ... WHERE b.key IS NULL. Avoid NOT IN when NULLs are possible."),
            iq("A report shows revenue three times too high after adding a join. What happened?", "The join key was not unique on one side, so rows were multiplied (fan-out). Check the grain of each table, aggregate to the join grain first, or join on a unique key.")],
           ["sql-06", "sql-07", "sql-14", "sql-34", "sql-36"]),

    lesson("sql-subqueries-ctes", M, "Subqueries, correlated subqueries and CTEs", 15, "intermediate", ["sql-joins"],
           "Scalar, table and correlated subqueries; readable multi-step logic with CTEs, including recursion.",
           r"""
## Subqueries

A **subquery** is a query nested inside another. Three shapes appear constantly:

```sql
-- Scalar subquery: returns one value
SELECT emp_name FROM employees WHERE salary > (SELECT AVG(salary) FROM employees);

-- IN / EXISTS subquery: returns a set to test membership
SELECT name FROM customers WHERE customer_id IN (SELECT customer_id FROM orders WHERE status = 'cancelled');

-- Derived table: a subquery in FROM
SELECT dept, AVG(salary) FROM (SELECT * FROM employees WHERE salary > 50000) t GROUP BY dept;
```

### Correlated subqueries

A correlated subquery references the outer row, so it conceptually re-runs for every outer row:

```sql
SELECT e1.emp_name, e1.department, e1.salary
FROM employees e1
WHERE e1.salary > (SELECT AVG(e2.salary) FROM employees e2 WHERE e2.department = e1.department);
```

Optimisers often rewrite these into joins, but on engines that do not, a correlated subquery over millions of rows is a classic performance trap. A window function (`AVG(salary) OVER (PARTITION BY department)`) usually does the same job in a single pass.

## Common Table Expressions (CTEs)

A CTE names an intermediate result so a complex query reads top to bottom like a pipeline.

```sql
WITH completed AS (
    SELECT order_id, customer_id FROM orders WHERE status = 'completed'
), revenue AS (
    SELECT c.customer_id, SUM(oi.quantity * p.unit_price) AS revenue
    FROM completed c
    JOIN order_items oi USING (order_id)
    JOIN products p USING (product_id)
    GROUP BY c.customer_id
)
SELECT * FROM revenue WHERE revenue > (SELECT AVG(revenue) FROM revenue);
```

Why CTEs matter in data engineering: transformation SQL in dbt, Databricks and warehouses is written as chains of CTEs. They make code reviewable, and each step can be tested by selecting from it directly.

> Note: in some engines a CTE is inlined (re-computed each time it is referenced), in others it is materialised. Do not assume a CTE is a cache.

### Recursive CTEs

Recursive CTEs walk hierarchies such as org charts, bills of materials, or category trees.

```sql
WITH RECURSIVE tree AS (
    SELECT emp_id, emp_name, 1 AS depth FROM employees WHERE manager_id = 1   -- anchor
    UNION ALL
    SELECT e.emp_id, e.emp_name, t.depth + 1                                  -- recursive step
    FROM employees e JOIN tree t ON e.manager_id = t.emp_id
)
SELECT * FROM tree;
```

Always make sure the recursion terminates (a hierarchy cycle causes an infinite loop; engines cap depth).

## Common mistakes

- Scalar subquery that returns more than one row (runtime error).
- Over-nesting instead of using CTEs.
- Treating a CTE as a temp table that is computed only once.

## Real-world use

A customer-360 model is typically 6 to 12 CTEs: clean customers, latest address, order aggregates, support tickets, then a final join. Each CTE is a testable unit.
""",
           [mcq("What distinguishes a correlated subquery?", ["It uses GROUP BY", "It references columns of the outer query", "It returns multiple columns", "It cannot be in WHERE"], 1, "The inner query depends on the outer row, so it is logically evaluated per outer row."),
            mcq("The main benefit of CTEs in transformation code is:", ["They always cache data", "They make multi-step logic readable and testable", "They are faster than joins", "They bypass permissions"], 1, "CTEs are about structure. Performance depends on the engine, which may inline them.", "beginner"),
            mcq("What must a recursive CTE contain?", ["Only an anchor", "An anchor member and a recursive member combined with UNION ALL", "A window function", "An index"], 1, "The anchor seeds the result; the recursive member repeatedly joins the previous iteration.", "intermediate")],
           [iq("When would you choose a CTE over a subquery?", "When the logic has several steps, a result is referenced more than once, or readability and testability matter. For one-off simple filters a subquery is fine."),
            iq("How would you query an employee hierarchy of unknown depth?", "A recursive CTE: the anchor selects the root (or direct reports), the recursive part joins the employees table to the CTE on manager_id, tracking depth, with UNION ALL, and I guard against cycles.")],
           ["sql-10", "sql-11", "sql-19", "sql-20"]),

    lesson("sql-window-functions", M, "Window functions", 20, "intermediate", ["sql-subqueries-ctes"],
           "ROW_NUMBER, RANK, DENSE_RANK, LEAD, LAG, running totals and moving averages with frames.",
           r"""
## The idea

A normal aggregate with `GROUP BY` collapses rows. A **window function** computes a value over a set of related rows *without* collapsing them, so each input row keeps its identity and gains extra columns. This is the tool behind "latest record per customer", "month-over-month growth", "running total" and deduplication.

```sql
function(...) OVER (
    PARTITION BY <group columns>     -- the window: rows that belong together
    ORDER BY <sort columns>          -- order inside each partition
    ROWS BETWEEN ... AND ...         -- optional frame
)
```

## Ranking functions

```sql
SELECT emp_name, department, salary,
       ROW_NUMBER() OVER (PARTITION BY department ORDER BY salary DESC) AS rn,
       RANK()       OVER (PARTITION BY department ORDER BY salary DESC) AS rnk,
       DENSE_RANK() OVER (PARTITION BY department ORDER BY salary DESC) AS drnk
FROM employees;
```

For salaries 140, 140, 110: `ROW_NUMBER` = 1,2,3 (unique, ties broken arbitrarily), `RANK` = 1,1,3 (gap after tie), `DENSE_RANK` = 1,1,2 (no gap).

### Top-N per group and deduplication

Window functions cannot be filtered in `WHERE` (they run after it), so wrap them:

```sql
SELECT * FROM (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY updated_at DESC) AS rn
  FROM stg_customers
) WHERE rn = 1;          -- latest version of each customer
```

This is the single most-used pattern in ETL SQL. (Some engines offer `QUALIFY` to filter directly.)

## LAG and LEAD

`LAG(col, n)` looks n rows back inside the partition, `LEAD` looks forward.

```sql
SELECT order_id, customer_id, order_date,
       order_date - LAG(order_date) OVER (PARTITION BY customer_id ORDER BY order_date) AS days_since_prev
FROM orders;
```

Use for gaps, growth, change detection ("did this value change from the previous record?") and sessionisation.

## Aggregate windows and frames

```sql
SELECT region, month, revenue,
       SUM(revenue) OVER (PARTITION BY region ORDER BY month)                              AS running_total,
       AVG(revenue) OVER (PARTITION BY region ORDER BY month
                          ROWS BETWEEN 2 PRECEDING AND CURRENT ROW)                         AS moving_avg_3,
       revenue * 100.0 / SUM(revenue) OVER (PARTITION BY region)                           AS pct_of_region
FROM monthly_sales;
```

The **frame** defines which rows around the current one participate. `ROWS` counts physical rows; `RANGE` groups peers with equal ORDER BY values. If you give `ORDER BY` but no frame, the default is "start of partition to current row (and its peers)", which is why a plain `SUM(...) OVER (ORDER BY ...)` is a running total.

## Common mistakes

- Using `RANK` when you need exactly one row per group (use `ROW_NUMBER` with a deterministic tie-breaker).
- Forgetting `PARTITION BY`, so the window spans the whole table.
- Non-deterministic `ORDER BY` (ties) making pipelines return different rows on each run. Add a unique tie-breaker column.
- Trying to filter a window result in the same query's `WHERE`.

## Real-world use

Banking: flag a transaction when the amount is more than 5x the account's trailing 30-day average, a moving-average window joined to the current row. E-commerce: "days between first and second purchase" with `LAG`.
""",
           [mcq("For values 100, 100, 90 ordered descending, what does DENSE_RANK produce?", ["1,2,3", "1,1,3", "1,1,2", "1,2,2"], 2, "DENSE_RANK gives tied rows the same rank and does not skip numbers."),
            mcq("How do you keep only the latest row per key?", ["GROUP BY key HAVING MAX()", "ROW_NUMBER() OVER (PARTITION BY key ORDER BY ts DESC) then filter rn = 1", "DISTINCT ON all columns", "LIMIT 1"], 1, "Rank rows inside each key by recency, then keep rank 1."),
            mcq("`SUM(x) OVER (PARTITION BY g ORDER BY d)` produces:", ["A single total per group", "A running total within each group", "The grand total", "An error"], 1, "With ORDER BY and the default frame, the sum accumulates up to the current row.", "intermediate"),
            mcq("Why add a unique column to the ORDER BY of ROW_NUMBER for dedup?", ["Speed", "To make tie-breaking deterministic so reruns pick the same row", "To satisfy the parser", "It removes NULLs"], 1, "With ties the chosen row is arbitrary and can change between runs, breaking idempotency.", "advanced")],
           [iq("Difference between ROW_NUMBER, RANK and DENSE_RANK?", "ROW_NUMBER gives unique sequential numbers. RANK gives ties the same number and leaves gaps after. DENSE_RANK gives ties the same number with no gaps."),
            iq("How do you compute month-over-month growth in SQL?", "Aggregate to monthly grain, then use LAG(revenue) OVER (PARTITION BY region ORDER BY month) and compute (revenue - prev) / prev. Guard against NULL/zero for the first month or zero previous values.")],
           ["sql-15", "sql-16", "sql-17", "sql-18", "sql-21", "sql-22", "sql-23", "sql-24", "sql-26"]),

    lesson("sql-nulls-dates-strings", M, "CASE, NULL handling, dates, strings and set operations", 15, "beginner", ["sql-foundations"],
           "The everyday toolkit for cleaning and reshaping data inside SQL.",
           r"""
## CASE: conditional logic

```sql
SELECT product_name,
       CASE WHEN unit_price >= 300 THEN 'premium'
            WHEN unit_price >= 50  THEN 'standard'
            ELSE 'budget' END AS tier
FROM products;
```

Branches are tested top to bottom and the first match wins, so order from most to least specific. `CASE` also enables **conditional aggregation**, a pivot without PIVOT:

```sql
SELECT customer_id,
       SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
       SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled
FROM orders GROUP BY customer_id;
```

## NULL: three-valued logic

NULL means "unknown", not zero or empty. Any comparison with NULL yields UNKNOWN, which `WHERE` treats as false.

| Expression | Result |
|---|---|
| `NULL = NULL` | UNKNOWN (not true!) |
| `NULL IS NULL` | TRUE |
| `1 + NULL` | NULL |
| `NULL AND FALSE` | FALSE |
| `NULL OR TRUE` | TRUE |

Tools: `IS NULL`, `COALESCE(a, b, c)` (first non-null), `NULLIF(a, b)` (NULL when equal, handy to avoid divide-by-zero: `x / NULLIF(y, 0)`), and `IS DISTINCT FROM` for NULL-safe comparison.

Data-engineering consequence: a join on a NULL key never matches, `COUNT(col)` skips NULLs, and `NOT IN` with a NULL breaks. Decide explicitly what NULL means for each column in your model.

## Dates and timestamps

```sql
SELECT order_date,
       EXTRACT(year FROM order_date)      AS yr,
       DATE_TRUNC('month', order_date)    AS month_start,
       order_date + INTERVAL 7 DAY        AS plus_week,
       order_date - DATE '2024-01-01'     AS days_since_new_year
FROM orders;
```

Best practices: store timestamps in **UTC** and convert at presentation time; filter with half-open ranges (`>= start AND < next_start`) instead of `BETWEEN` on timestamps; avoid wrapping the column in a function in `WHERE` (it blocks partition pruning and index use).

## Strings

`UPPER`, `LOWER`, `TRIM`, `SUBSTRING`, `REPLACE`, `CONCAT` / `||`, `LIKE`, regex functions (`REGEXP_MATCHES`, `REGEXP_REPLACE` in DuckDB). Cleaning customer data typically combines `TRIM`, `LOWER`, and regex validation of emails.

## Set operations

| Operator | Result |
|---|---|
| `UNION` | Rows in A or B, duplicates removed (sorts/hashes: slower) |
| `UNION ALL` | A followed by B, duplicates kept (fast, use by default) |
| `INTERSECT` | Rows in both |
| `EXCEPT` | Rows in A not in B (great for reconciliation) |

Both sides need the same number of compatible columns.

## Common mistakes

- `WHERE col != 'x'` also drops NULL rows, since NULL != 'x' is UNKNOWN.
- Using `UNION` when `UNION ALL` is enough, paying for needless de-duplication.
- Integer division: `3 / 2` may be 1 in some engines; multiply by `1.0`.
- Time-zone drift when comparing local timestamps.

## Real-world use

Source-vs-target row reconciliation after a migration: `SELECT * FROM source EXCEPT SELECT * FROM target` and the reverse list the exact missing and extra rows.
""",
           [mcq("What does `SELECT NULL = NULL` return?", ["TRUE", "FALSE", "NULL/UNKNOWN", "Error"], 2, "Comparison with NULL is UNKNOWN. Use IS NULL."),
            mcq("Which is the safest division guard?", ["x / y", "x / NULLIF(y, 0)", "x / COALESCE(y, 0)", "x / ABS(y)"], 1, "NULLIF turns a zero divisor into NULL so the result is NULL instead of an error.", "intermediate"),
            mcq("When prefer UNION ALL over UNION?", ["When you want to remove duplicates", "When duplicates are impossible or acceptable, since it skips the dedup cost", "Only with NULLs", "Never"], 1, "UNION ALL avoids a sort/hash for deduplication.")],
           [iq("How do you compare two columns that may contain NULLs?", "Use a NULL-safe comparison such as IS DISTINCT FROM / IS NOT DISTINCT FROM, or COALESCE both sides to a sentinel, because = returns UNKNOWN when either side is NULL."),
            iq("How can you find rows present in source but missing in target?", "SELECT ... FROM source EXCEPT SELECT ... FROM target, or a LEFT JOIN anti-join on the key; run it in both directions for a full reconciliation.")],
           ["sql-04", "sql-12", "sql-13", "sql-14"]),

    lesson("sql-performance-transactions", M, "Query optimisation, indexes, execution plans, transactions and modelling basics", 20, "advanced", ["sql-joins"],
           "How databases execute queries, why indexes help, ACID, and normalisation versus denormalisation.",
           r"""
## How a query is executed

The **optimiser** turns your SQL into an execution plan: an ordered tree of operations (scan, filter, join, aggregate, sort). It estimates the cost of alternative plans using **statistics** (row counts, value distributions) and picks the cheapest. Stale statistics produce bad plans, which is why "ANALYZE" or automatic statistics refresh matter.

Read a plan with `EXPLAIN` (estimated) or `EXPLAIN ANALYZE` (actual runtime). In DuckDB: `EXPLAIN SELECT ...;` Look for:

- **Full table scans** on big tables where a selective filter exists.
- **Join algorithm**: hash join (build a hash table on the smaller side), nested loop (fine only for tiny inputs), merge join (inputs sorted).
- **Large row-count estimate mismatches**, a sign of stale statistics.
- **Expensive sorts and shuffles** (in distributed engines, data movement is the dominant cost).

## Indexes

An index is a separate sorted structure (usually a B-tree) that lets the engine find rows without scanning the table, like a book index.

```sql
CREATE INDEX idx_orders_customer ON orders(customer_id);
```

- Help: selective filters, joins on the indexed key, `ORDER BY` of the indexed column.
- Hurt: every INSERT/UPDATE must also update the index, so write-heavy tables should not be over-indexed.
- Composite index order matters: `(customer_id, order_date)` serves filters on `customer_id` and on both, but not on `order_date` alone.
- A predicate must be **sargable**: `WHERE order_date >= '2024-03-01'` can use the index; `WHERE YEAR(order_date) = 2024` cannot.

Analytical warehouses mostly do *not* use B-tree indexes. They rely on **columnar storage, partitioning, clustering/sort keys and data skipping** (min/max metadata per block). The principle is the same: read less data.

## Practical optimisation checklist

1. Select only needed columns (columnar engines read only those).
2. Filter early and on sargable predicates; prune partitions.
3. Aggregate before joining when you only need aggregates.
4. Use `EXISTS` instead of join + `DISTINCT` for existence tests.
5. Prefer `UNION ALL` to `UNION`; avoid needless `ORDER BY` in subqueries.
6. Avoid correlated subqueries on large tables; use windows or joins.
7. Check the plan, then change one thing at a time and measure.

## Transactions and ACID

A **transaction** groups statements into one all-or-nothing unit.

| Property | Meaning | Example |
|---|---|---|
| Atomicity | All or nothing | Transfer: debit and credit both happen or neither |
| Consistency | Constraints stay valid | Balance cannot violate a CHECK |
| Isolation | Concurrent transactions do not see each other's partial work | Two transfers do not corrupt a balance |
| Durability | Committed data survives a crash | Write-ahead log |

```sql
BEGIN;
UPDATE accounts SET balance = balance - 100 WHERE account_id = 1001;
UPDATE accounts SET balance = balance + 100 WHERE account_id = 1002;
COMMIT;      -- or ROLLBACK on error
```

For pipelines: load into a staging table, validate, then swap/merge inside a transaction so consumers never see half-loaded data. OLTP systems optimise transactions; analytical warehouses relax some guarantees for scale (and lakehouse formats like Delta add ACID back on files).

## Normalisation vs denormalisation

**Normalisation** (1NF, 2NF, 3NF) removes redundancy: each fact is stored once, in the right table. It protects integrity and suits OLTP. **Denormalisation** deliberately duplicates or pre-joins data so analytical queries need fewer joins; star schemas and wide "one big table" models do this. Rule of thumb: normalise the source systems, denormalise the analytical layer.

## Common mistakes

- Adding indexes without checking the plan.
- Functions on filtered columns defeating pruning.
- Optimising a query that runs once a month while ignoring the one that runs every minute.
- Reading `EXPLAIN` estimates as truth with stale statistics.

## Real-world use

A nightly report that took 45 minutes dropped to 3 after replacing a correlated subquery with a window function, selecting 8 columns instead of `*`, and filtering on a partition column.
""",
           [mcq("A filter `WHERE YEAR(order_date) = 2024` is a problem because:", ["YEAR is deprecated", "It wraps the column in a function, preventing index use and partition pruning", "It returns NULLs", "It is case sensitive"], 1, "The predicate is not sargable. Rewrite as a date range.", "intermediate"),
            mcq("Which property guarantees committed data survives a crash?", ["Atomicity", "Consistency", "Isolation", "Durability"], 3, "Durability is typically implemented with a write-ahead log."),
            mcq("Why is denormalisation common in warehouses?", ["It saves disk", "It reduces joins and speeds analytical reads, at the cost of redundancy", "It is required by SQL", "It prevents NULLs"], 1, "Analytical workloads read much more than they write, so pre-joined shapes are a good trade."),
            mcq("An index on (customer_id, order_date) can efficiently serve a filter on:", ["order_date only", "customer_id only", "neither", "only both columns"], 1, "A composite index is usable from its leading column(s).", "advanced")],
           [iq("A query is slow. How do you approach it?", "Measure first: look at the execution plan (EXPLAIN ANALYZE) for scans, join types, row-count mismatches and sorts. Then reduce data read (columns, partition/predicate pruning), fix join order/grain, replace correlated subqueries, check statistics and indexes, and re-measure one change at a time."),
            iq("Explain ACID with an example.", "Money transfer: atomicity means both the debit and credit apply or neither; consistency keeps constraints valid; isolation stops concurrent transfers from seeing partial state; durability means the commit survives a crash.")],
           ["sql-34", "sql-35", "sql-36"]),

    lesson("sql-de-patterns", M, "Data engineering SQL patterns: deduplication, incremental loads and SCDs", 18, "advanced", ["sql-window-functions", "sql-performance-transactions"],
           "The SQL patterns that run inside real pipelines: dedupe, watermarks, MERGE, SCD Type 2 and point-in-time joins.",
           r"""
## Why this lesson matters

Real pipelines rarely run `SELECT` for fun. They **reload, deduplicate, upsert and track history**. These patterns are what separate analysts from data engineers.

## 1. Deduplication

Sources send duplicates through retries, overlapping extracts and manual re-exports. Keep one row per business key:

```sql
CREATE OR REPLACE TABLE customers_clean AS
SELECT * EXCLUDE (rn) FROM (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY updated_at DESC, ingest_id DESC) AS rn
    FROM stg_customers
) WHERE rn = 1;
```

Always include a deterministic tie-breaker. Keep the raw data untouched so you can replay.

## 2. Incremental processing with a watermark

Reprocessing everything every night does not scale. Instead store the highest `updated_at` already processed (the **watermark**) and fetch only newer rows:

```sql
SELECT * FROM source_orders
WHERE updated_at > (SELECT last_watermark FROM etl_state WHERE job = 'orders');
-- after a successful load:
UPDATE etl_state SET last_watermark = (SELECT MAX(updated_at) FROM source_orders) WHERE job = 'orders';
```

Pitfalls: late-arriving rows with an older timestamp (use an overlap/lookback window and make the load idempotent), clocks that are not monotonic, and updating the watermark *before* the load succeeds (always after).

## 3. Upsert / MERGE

Idempotent loads use MERGE (or `INSERT ... ON CONFLICT`):

```sql
MERGE INTO dim_customer t
USING stg_customers s ON t.customer_id = s.customer_id
WHEN MATCHED AND (t.email <> s.email OR t.name <> s.name) THEN UPDATE SET email = s.email, name = s.name
WHEN NOT MATCHED THEN INSERT (customer_id, name, email) VALUES (s.customer_id, s.name, s.email);
```

Running the same input twice must leave the same result: that is **idempotency**, the property that makes retries safe.

## 4. Slowly Changing Dimensions (SCD)

Attributes like a customer's city change. How do you keep reports accurate?

| Type | Behaviour | Use |
|---|---|---|
| 1 | Overwrite, no history | Corrections, typos |
| 2 | New row per change with `valid_from`, `valid_to`, `is_current` | Full history (the default for analytics) |
| 3 | Keep previous value in an extra column | Limited history (current + previous) |

SCD2 close-and-insert pattern:

```sql
-- 1) close the current row when something changed
UPDATE dim_customer_scd2 d SET valid_to = CURRENT_DATE - 1, is_current = false
FROM stg s WHERE d.customer_id = s.customer_id AND d.is_current AND d.city <> s.city;
-- 2) insert the new version
INSERT INTO dim_customer_scd2
SELECT nextval('sk_seq'), s.customer_id, s.city, CURRENT_DATE, DATE '9999-12-31', true
FROM stg s LEFT JOIN dim_customer_scd2 d ON d.customer_id = s.customer_id AND d.is_current
WHERE d.customer_id IS NULL OR d.city <> s.city;
```

Facts then join to the dimension **as of the event date**: `JOIN dim d ON d.customer_id = f.customer_id AND f.sale_date BETWEEN d.valid_from AND d.valid_to` (a point-in-time join).

## 5. Data-quality checks in SQL

```sql
SELECT customer_id, COUNT(*) FROM customers_clean GROUP BY 1 HAVING COUNT(*) > 1;   -- uniqueness
SELECT COUNT(*) FROM orders WHERE customer_id IS NULL;                              -- not null
SELECT COUNT(*) FROM orders o LEFT JOIN customers c USING (customer_id) WHERE c.customer_id IS NULL; -- referential integrity
```

## Common mistakes

- Dedupe without a stable tie-breaker.
- Advancing the watermark before the load commits.
- Using `DELETE + INSERT` outside a transaction, leaving a window with missing data.
- Joining facts to the *current* dimension row and rewriting history.

## Real-world use

A retail bank loads customer addresses nightly. Type 2 history lets compliance answer "where did the customer live when this transaction happened?", while the dashboard uses `is_current` for today's view.
""",
           [mcq("What makes a load idempotent?", ["It runs fast", "Running it twice yields the same final state", "It uses transactions only", "It never fails"], 1, "Idempotency lets you safely retry or backfill."),
            mcq("SCD Type 2 stores history by:", ["Overwriting", "Adding a new row per change with validity dates", "Adding a previous-value column", "Deleting old rows"], 1, "Each change creates a new version with valid_from/valid_to and a current flag."),
            mcq("When should the watermark be advanced?", ["Before extraction", "After the load has successfully committed", "Randomly", "Never"], 1, "If you advance early and the load fails, you silently lose data.", "intermediate"),
            mcq("A point-in-time join links a fact to:", ["The latest dimension row", "The dimension version valid at the fact's event date", "A random version", "The first version"], 1, "That is what keeps historical reports accurate.", "advanced")],
           [iq("How would you implement incremental loading?", "Track a watermark (max updated_at or an incrementing id) per source in a state table, extract only newer rows (with a small lookback for late data), upsert with MERGE so reruns are idempotent, and advance the watermark only after the load commits."),
            iq("Explain SCD Type 2 and when you would use it.", "Type 2 keeps full history by inserting a new dimension row for each change, with surrogate key, valid_from, valid_to and is_current. Use it when reports must reflect attributes as they were at the time of the event, e.g. customer segment or address.")],
           ["sql-27", "sql-28", "sql-29", "sql-30", "sql-31", "sql-32", "sql-33"]),
]
