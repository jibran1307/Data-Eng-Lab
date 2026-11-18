"""Module 6: Apache Spark and PySpark."""
from ._types import iq, lesson, mcq

M = "spark"

LESSONS = [
    lesson("spark-architecture", M, "Distributed computing and Spark architecture", 18, "intermediate", ["de-pipelines"],
           "Why distribute work, how Spark is structured, and the driver/executor model.",
           r"""
## Why distributed computing

One machine has limits: memory, cores and disk throughput. When a dataset is hundreds of GB or TB, a single pandas process cannot hold it. **Distributed computing** splits data into pieces (**partitions**) and processes them in parallel on many machines (a **cluster**), then combines results.

The price: coordination. Data must move across the network (**shuffle**), machines can fail, and work must be balanced evenly.

## Hadoop in one minute

Hadoop introduced two ideas: **HDFS** (distributed file storage with replication) and **MapReduce** (batch processing in map and reduce steps writing to disk between stages). Spark replaced MapReduce for most workloads by keeping intermediate data **in memory** and offering richer APIs. In the cloud, HDFS is typically replaced by object storage (ADLS, S3) and YARN by managed cluster managers.

## Spark architecture

```
                 +-------------------+
 your code ----> |   Driver program  |  builds the plan, schedules tasks
                 +---------+---------+
                           | (cluster manager allocates resources)
          +----------------+----------------+
          v                v                v
     +----------+     +----------+     +----------+
     | Executor |     | Executor |     | Executor |   run tasks on partitions,
     |  tasks   |     |  tasks   |     |  tasks   |   cache data in memory
     +----------+     +----------+     +----------+
```

- **Driver**: runs your `main`, creates the SparkSession, converts transformations into a plan, splits it into **stages** and **tasks**, collects results.
- **Executors**: JVM processes on worker nodes that execute tasks and store cached partitions.
- **Cluster manager**: YARN, Kubernetes, standalone, or Databricks' own.
- **Job -> stages -> tasks**: an *action* triggers a **job**; shuffle boundaries split it into **stages**; each stage runs one **task per partition**.

## Abstractions

| Abstraction | What | Use |
|---|---|---|
| **RDD** | Low-level immutable distributed collection | Rare; fine-grained control, unstructured data |
| **DataFrame** | Distributed table with named columns and a schema | **Default**; optimised by Catalyst |
| **Dataset** | Typed DataFrame (Scala/Java) | Not in PySpark |
| **Spark SQL** | SQL over DataFrames/tables | Analysts and engineers alike |

DataFrames and SQL go through the **Catalyst optimiser** and **Tungsten** execution engine (predicate pushdown, column pruning, whole-stage code generation), which is why they usually outperform hand-written RDD code and Python UDFs.

## Transformations, actions and lazy evaluation

- **Transformations** (`select`, `filter`, `join`, `groupBy`) describe a new dataset. They are **lazy**: nothing runs yet.
- **Actions** (`count`, `show`, `collect`, `write`) trigger execution of the whole plan.

Laziness lets Spark see the full plan and optimise it (reorder filters, prune columns) before reading a single byte.

## Narrow vs wide transformations

- **Narrow**: each output partition depends on one input partition (`filter`, `select`, `map`). No data movement, pipelined within one stage.
- **Wide**: output partitions depend on many input partitions (`groupBy`, `join`, `distinct`, `orderBy`). Requires a **shuffle**: data is redistributed across the network, written to disk and read back. Shuffles are the main cost in Spark jobs.

## Local vs cluster

You can run PySpark locally (`local[*]` uses all cores) to learn the API. A real cluster adds scale, fault tolerance and resource management. The code is identical; the deployment differs. (See the README section on running PySpark locally; the in-app playground does not include Spark itself.)

## Common mistakes

- Treating Spark as a faster pandas for small data (the startup and shuffle overhead dominates).
- Calling `collect()` on a huge dataset, which pulls everything into the driver's memory.
- Not realising a transformation chain is lazy and being surprised where time is spent.

## Real-world use

A bank computes daily risk across billions of positions: data in ADLS Parquet, a Databricks cluster of 20 executors, a job that reads, joins and aggregates in parallel and writes results back in minutes instead of the many hours one machine would need.
""",
           [mcq("What triggers actual execution in Spark?", ["A transformation", "An action", "Importing pyspark", "Creating a DataFrame variable"], 1, "Transformations are lazy; actions such as count/write/show run the plan."),
            mcq("Which is a wide transformation?", ["filter", "select", "groupBy", "withColumn"], 2, "groupBy needs data with the same key on the same partition, hence a shuffle."),
            mcq("What does the driver do?", ["Stores all data", "Builds the plan, schedules tasks, collects results", "Replaces executors", "Compresses files"], 1, "Executors do the data processing; the driver coordinates."),
            mcq("Why is `collect()` on a large DataFrame dangerous?", ["It is slow only", "It pulls all data into the driver's memory and can crash it", "It deletes data", "It disables caching"], 1, "Use write/limit/aggregate instead.", "intermediate")],
           [iq("Explain Spark architecture.", "A driver builds the logical/physical plan, splits jobs into stages at shuffle boundaries and tasks per partition, and schedules them on executors allocated by a cluster manager. Executors run tasks and cache partitions."),
            iq("Narrow vs wide transformations?", "Narrow transformations (filter, select, map) operate within a single partition without data movement. Wide ones (groupBy, join, distinct) need a shuffle across partitions, which is expensive and creates stage boundaries.")]),

    lesson("spark-dataframes", M, "PySpark DataFrames: reading, transforming, joining and aggregating", 20, "intermediate", ["spark-architecture", "py-pandas"],
           "The day-to-day PySpark API with real examples, Spark SQL and window functions.",
           r"""
## Starting a session

```python
from pyspark.sql import SparkSession, functions as F, Window

spark = (SparkSession.builder.appName("sales").master("local[*]").getOrCreate())   # on Databricks `spark` already exists
```

## Reading data

```python
orders = (spark.read.option("header", True).option("inferSchema", True).csv("data/orders.csv"))
# In production define the schema explicitly (inference scans data and can guess wrong):
from pyspark.sql.types import *
schema = StructType([StructField("order_id", IntegerType()), StructField("amount", DoubleType()), StructField("order_date", DateType())])
orders = spark.read.schema(schema).parquet("lake/raw/orders/")
```

## Core transformations

```python
clean = (orders
    .filter(F.col("status") == "completed")
    .withColumn("revenue", F.col("quantity") * F.col("unit_price"))
    .withColumn("month", F.date_format("order_date", "yyyy-MM"))
    .select("order_id", "customer_id", "month", "revenue")
    .dropDuplicates(["order_id"]))
```

Use built-in `pyspark.sql.functions` (`F.*`) whenever possible. They run inside the JVM and are optimised. A Python **UDF** serialises every row between the JVM and Python and blocks optimisation; use it only when no built-in exists (prefer pandas UDFs over plain UDFs).

## Aggregations

```python
summary = (clean.groupBy("month")
    .agg(F.sum("revenue").alias("revenue"),
         F.countDistinct("customer_id").alias("customers"),
         F.avg("revenue").alias("avg_order")))
summary.orderBy("month").show()
```

## Joins

```python
enriched = clean.join(customers, on="customer_id", how="left")      # inner, left, right, outer, left_semi, left_anti
```

Spark picks a join strategy: **broadcast hash join** (small side copied to every executor, no shuffle of the big side), **sort-merge join** (both sides shuffled and sorted; the default for big-big), shuffle hash join. You can hint: `big.join(F.broadcast(small), "key")`.

## Window functions

```python
w = Window.partitionBy("customer_id").orderBy(F.col("order_date").desc())
latest = (orders.withColumn("rn", F.row_number().over(w)).filter("rn = 1").drop("rn"))
```

The same dedupe/top-N/LAG patterns from SQL carry over directly.

## Spark SQL

```python
orders.createOrReplaceTempView("orders")
spark.sql("SELECT month, SUM(revenue) FROM clean GROUP BY month")
```

DataFrame API and SQL compile to the same plan, so choose what is clearer. Teams commonly write transformations in SQL and orchestration/glue in Python.

## Writing

```python
(summary.write.mode("overwrite")
        .partitionBy("month")
        .parquet("lake/curated/monthly_revenue/"))
```

Write modes: `append`, `overwrite`, `ignore`, `error`. Dynamic partition overwrite (`spark.sql.sources.partitionOverwriteMode=dynamic`) replaces only the partitions present in the output: the idempotent daily-load pattern.

## A complete mini ETL

```python
raw = spark.read.json("lake/raw/orders/dt=2024-03-01/")
clean = (raw.dropDuplicates(["order_id"])
            .filter(F.col("amount") >= 0)
            .withColumn("order_date", F.to_date("order_ts")))
bad = raw.join(clean, "order_id", "left_anti")            # quarantine rejects
bad.write.mode("overwrite").json("lake/quarantine/orders/dt=2024-03-01/")
clean.write.mode("overwrite").partitionBy("order_date").parquet("lake/curated/orders/")
```

## Common mistakes

- `inferSchema` on huge files in production (slow and unstable types).
- Python UDFs where built-ins exist.
- Forgetting that `join` on a column with NULLs drops those rows.
- Writing thousands of tiny files by partitioning on a high-cardinality column.

## Real-world use

PySpark is the workhorse of Databricks pipelines: read raw Parquet/JSON from ADLS, apply the cleaning and joins above, and write curated Delta/Parquet tables that the warehouse and BI layers consume.

> To run this locally: `pip install pyspark` (requires Java 17+). See the README for details; the Python Playground does not bundle Spark.
""",
           [mcq("Why prefer built-in F.* functions over Python UDFs?", ["Prettier", "They execute in the JVM and are optimised by Catalyst", "UDFs are banned", "They use less disk"], 1, "UDFs serialise rows between Python and the JVM and block optimisation."),
            mcq("Which join type gives rows of A with no match in B?", ["left_semi", "left_anti", "outer", "cross"], 1, "left_anti is the anti-join."),
            mcq("Dynamic partition overwrite is useful because it:", ["Appends duplicates", "Replaces only the partitions being written, enabling idempotent daily loads", "Drops the table", "Disables Parquet"], 1, "Only affected partitions are replaced, so reruns give the same result.", "advanced")],
           [iq("How would you deduplicate a large DataFrame keeping the latest record per key?", "Use a Window partitioned by the key and ordered by updated_at descending, add row_number, filter rn = 1 (with a deterministic tie-breaker). dropDuplicates(keys) keeps an arbitrary row, so it is unsuitable when 'latest' matters."),
            iq("Why define schemas explicitly when reading data?", "Inference requires an extra pass over the data, can guess types wrongly and differs between runs; an explicit schema is faster, stable and a form of contract.")]),

    lesson("spark-performance", M, "Performance: partitioning, shuffles, caching, skew and tuning", 22, "advanced", ["spark-dataframes"],
           "How to diagnose and fix slow Spark jobs.",
           r"""
## Think in partitions

Spark parallelism equals the number of **partitions**. Too few: cores sit idle and each task holds too much memory (spills to disk, OOM). Too many: scheduling overhead and tiny files. A common guideline is **100-200 MB per partition** after reading and roughly 2-4 tasks per core.

```python
df.rdd.getNumPartitions()
df.repartition(200, "customer_id")     # full shuffle: increase or redistribute by key
df.coalesce(20)                         # reduce partitions WITHOUT a full shuffle (before writing)
spark.conf.set("spark.sql.shuffle.partitions", 400)    # partitions after a shuffle (default 200)
```

Adaptive Query Execution (AQE, on by default in Spark 3) coalesces small shuffle partitions, switches join strategies and splits skewed partitions at run time.

## Shuffles: the main cost

A shuffle writes data to local disk, sends it over the network and reads it back. Reduce it by:

1. **Filtering and selecting columns early** (Catalyst pushes many of these down).
2. **Broadcasting small tables** so the big side never shuffles.
3. **Pre-aggregating** before a join.
4. Using `reduceByKey`-style/`agg` rather than collecting groups.
5. **Bucketing / co-partitioning** large tables joined repeatedly on the same key.

```python
from pyspark.sql.functions import broadcast
fact.join(broadcast(dim_country), "country_id")      # small dimension: no shuffle of fact
```

## Data skew

Skew means some keys have vastly more rows (e.g. `customer_id = NULL` or one giant customer). One task processes most data while the rest finish and wait. Symptoms in the Spark UI: a few tasks far longer than the median, spill, or one executor out of memory.

Fixes:

- Enable AQE skew join handling (`spark.sql.adaptive.skewJoin.enabled`).
- **Salting**: add a random suffix to the hot key on the big side and replicate the small side across suffixes, then aggregate again.
- Filter out/handle NULL or "unknown" keys separately.
- Broadcast the small side if it fits.

```python
from pyspark.sql import functions as F
N = 8
big_s = big.withColumn("salt", (F.rand() * N).cast("int")).withColumn("k2", F.concat_ws("_", "key", "salt"))
small_s = small.withColumn("salt", F.explode(F.array(*[F.lit(i) for i in range(N)]))).withColumn("k2", F.concat_ws("_", "key", "salt"))
joined = big_s.join(small_s, "k2")
```

## Caching and persistence

`df.cache()` / `df.persist(StorageLevel.MEMORY_AND_DISK)` keeps a DataFrame after its first computation. Use when a DataFrame is reused several times (iterative logic, multiple actions). Do not cache everything: it consumes executor memory and caching is itself lazy until the first action. Call `df.unpersist()` when done.

## File and storage tuning

- Use **Parquet** (columnar, compressed, predicate pushdown); avoid CSV/JSON for large data.
- **Partition by a low-cardinality filter column** (date), avoid tiny files by controlling output partitions (`coalesce` / `maxRecordsPerFile`).
- Compact small files periodically (Delta `OPTIMIZE`).
- Prune: only read needed columns and partitions.

## Memory and executors

Right-size cores and memory per executor; avoid giant executors (long GC pauses). Watch for **spill** (data written to disk because memory ran out), **GC time**, and **OOM**. `collect()` and broadcasting a table that is too large can crash the driver.

## A diagnosis workflow

1. Open the **Spark UI**: find the slowest stage.
2. Check task time distribution (skew?), shuffle read/write size, spill, input size.
3. Check the **query plan** (`df.explain()`): are filters pushed down? Which join strategy?
4. Apply one fix (broadcast, filter earlier, repartition, salt, cache, file layout).
5. Re-measure.

## Scenario: 1 GB to 500 GB

What changes? Single-node tools fail, shuffles dominate, small mistakes become expensive. You: move to Parquet and partitioned storage, process incrementally instead of full reloads, broadcast dimensions, tune shuffle partitions/AQE, fix skew, avoid UDFs and `collect`, and scale the cluster only after fixing the plan.

## Common mistakes

- Increasing cluster size to fix skew (it does not help; one task is still the bottleneck).
- `repartition(1)` on large data to "get one file" (bottleneck).
- Caching everything.
- Tuning without reading the Spark UI.

## Real-world use

A telecom's sessionisation job dropped from 5 hours to 25 minutes after replacing a Python UDF with built-ins, broadcasting a reference table, and salting a handful of "super user" keys.
""",
           [mcq("Which fixes a hot join key in the big table?", ["Adding more executors only", "Salting the key (or AQE skew handling)", "Collecting to the driver", "Converting to CSV"], 1, "Skew is about uneven key distribution; more hardware does not fix the single straggler task."),
            mcq("`coalesce(n)` differs from `repartition(n)` by:", ["Increasing partitions", "Reducing partitions without a full shuffle", "Sorting data", "Caching"], 1, "coalesce merges partitions cheaply; repartition does a full shuffle."),
            mcq("When is `cache()` appropriate?", ["Always", "When a DataFrame is reused by multiple actions", "Never", "For a one-time read"], 1, "Caching pays off only on reuse and uses memory."),
            mcq("A broadcast join works best when:", ["Both tables are huge", "One table is small enough to fit in executor memory", "Tables have no keys", "Using RDDs"], 1, "The small table is copied to every executor, so the big one is not shuffled.")],
           [iq("How would you troubleshoot a slow Spark job?", "Open the Spark UI to find the slow stage; inspect task time distribution for skew, shuffle sizes, spill and GC; read df.explain() for pushdown and join strategy; then fix: filter/select early, broadcast small tables, tune partitions/AQE, salt skewed keys, remove UDFs, fix file layout; re-measure after each change."),
            iq("What is data skew and how do you handle it?", "Uneven distribution of keys so a few tasks do most of the work. Handle with AQE skew join, salting, broadcasting, isolating hot/NULL keys, and pre-aggregation.")]),

    lesson("spark-delta-patterns", M, "Spark in the real pipeline: Parquet, Delta tables and PySpark ETL structure", 16, "advanced", ["spark-performance", "de-lakes-warehouses"],
           "Reading and writing lake storage, Delta Lake MERGE, and structuring a PySpark job.",
           r"""
## Parquet in the lake

```python
df.write.mode("overwrite").partitionBy("order_date").parquet("abfss://curated@mylake.dfs.core.windows.net/orders/")
spark.read.parquet("abfss://curated@mylake.dfs.core.windows.net/orders/").filter("order_date = '2024-03-01'")
```

Predicate pushdown and partition pruning mean only the matching folder and column chunks are read. The `abfss://` URI is how Spark on Azure addresses ADLS Gen2 (see Module 8). Parquet files are immutable: you cannot update a row in place, you rewrite files, which is the gap Delta fills.

## Delta Lake in one page

Delta adds a **transaction log** (`_delta_log`) on top of Parquet files, giving a table with:

- **ACID transactions**: readers never see half-written data; concurrent writers are coordinated.
- **MERGE/UPDATE/DELETE** support.
- **Schema enforcement and evolution**.
- **Time travel**: query or restore an earlier version.
- **OPTIMIZE / compaction** and data skipping; **VACUUM** cleans old files.

```python
from delta.tables import DeltaTable

target = DeltaTable.forPath(spark, "lake/silver/customers")
(target.alias("t")
   .merge(updates.alias("s"), "t.customer_id = s.customer_id")
   .whenMatchedUpdateAll()
   .whenNotMatchedInsertAll()
   .execute())                                   # idempotent upsert

spark.read.format("delta").option("versionAsOf", 12).load("lake/silver/customers")   # time travel
```

On Databricks, Delta is the default table format. Iceberg and Hudi offer comparable capabilities.

## Structuring a PySpark ETL job

```python
def read_raw(spark, run_date):       ...
def transform(df):                   ...   # pure DataFrame -> DataFrame (unit-testable on small data)
def validate(df):                    ...   # raises or returns (good, bad)
def write(df, path, run_date):       ...

def main(run_date):
    spark = SparkSession.builder.appName("orders_etl").getOrCreate()
    raw = read_raw(spark, run_date)
    good, bad = validate(transform(raw))
    write(bad, "lake/quarantine/orders", run_date)
    write(good, "lake/silver/orders", run_date)
```

Pass the **run date as a parameter**, avoid hard-coded paths (use config), keep `transform` a pure function, and test it with a tiny local DataFrame. In production a scheduler (Airflow, ADF, Databricks Workflows) calls `main`.

## Medallion in Spark

1. **Bronze**: ingest raw data as-is plus ingestion metadata (`_ingested_at`, `_source_file`).
2. **Silver**: enforce schema, dedupe, standardise, join reference data.
3. **Gold**: aggregate into business models.

Each layer is rebuilt from the previous one, which gives replay and clear data contracts.

## Streaming preview

Structured Streaming uses the same DataFrame API on unbounded data (`spark.readStream`), with checkpointing and watermarks (Module 9). A batch job and a stream often share the same transformation function.

## Common mistakes

- Overwriting the whole table when only one partition changed.
- Many small appends creating a small-files problem (compact them).
- Mixing environment config into code.
- No explicit schema for incoming raw JSON.

## Real-world use

On Azure Databricks, a bronze-to-silver job reads new JSON from ADLS, MERGEs deduplicated rows into a Delta silver table, and a gold job aggregates daily revenue that Power BI reads through Synapse/Fabric.
""",
           [mcq("What does Delta Lake add on top of Parquet files?", ["A new compression", "A transaction log giving ACID, MERGE, time travel and schema enforcement", "A cluster manager", "A BI tool"], 1, "The _delta_log provides table semantics over immutable files."),
            mcq("Why keep transform() a pure DataFrame -> DataFrame function?", ["For fun", "So it can be unit-tested on small DataFrames and reused in batch and streaming", "To avoid Spark", "To speed up I/O"], 1, "Separation of I/O and logic enables testing."),
            mcq("A Delta MERGE is idempotent when:", ["Keyed on a business key with deterministic source rows", "It appends all rows", "It uses random IDs", "It runs once"], 0, "Same keyed source yields the same final table.", "advanced")],
           [iq("How do you implement an idempotent upsert in a lakehouse?", "Use Delta Lake MERGE keyed on the business key from a deduplicated source (latest per key), updating matched rows and inserting new ones; rerunning with the same source leaves the table unchanged."),
            iq("Why Delta instead of plain Parquet?", "Plain Parquet files are immutable and lack transactions: no safe concurrent writes, no row-level updates/deletes and weak schema control. Delta adds ACID via a transaction log, MERGE, time travel, schema enforcement and optimisation features.")]),
]
