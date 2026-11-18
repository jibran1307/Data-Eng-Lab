"""Standalone multiple-choice bank for assessments (lesson knowledge checks are merged in automatically).

Format: m(topic, level, question, options, correct_index, explanation)
"""
from __future__ import annotations

from typing import Any

_n: dict[str, int] = {}


def m(topic: str, level: str, q: str, options: list[str], answer: int, why: str) -> dict[str, Any]:
    assert 0 <= answer < len(options) and level in ("beginner", "intermediate", "advanced"), q
    _n[topic] = _n.get(topic, 0) + 1
    return {"id": f"mcq-{topic}-{_n[topic]:02d}", "topic": topic, "level": level, "q": q,
            "options": options, "answer": answer, "why": why}


MCQS: list[dict[str, Any]] = [
    # ---------------- SQL ----------------
    m("sql", "beginner", "Which clause filters rows AFTER aggregation?", ["WHERE", "HAVING", "ORDER BY", "LIMIT"], 1, "HAVING filters groups after GROUP BY; WHERE filters rows before grouping."),
    m("sql", "beginner", "What does `SELECT COUNT(email) FROM customers` count?", ["All rows", "Rows where email is not NULL", "Distinct emails", "Rows where email is empty string only"], 1, "COUNT(column) ignores NULLs; COUNT(*) counts all rows."),
    m("sql", "beginner", "Which join returns all rows from the left table, with NULLs where there is no match?", ["INNER JOIN", "LEFT JOIN", "CROSS JOIN", "SELF JOIN"], 1, "LEFT JOIN preserves every left-side row."),
    m("sql", "intermediate", "What is the logical order of evaluation in a SELECT query?", ["SELECT, FROM, WHERE", "FROM, WHERE, GROUP BY, HAVING, SELECT, ORDER BY", "WHERE, FROM, SELECT", "GROUP BY, WHERE, FROM"], 1, "FROM and joins come first, SELECT is computed late, which is why aliases cannot be used in WHERE."),
    m("sql", "intermediate", "Which window function gives tied rows the same rank WITHOUT gaps afterwards?", ["ROW_NUMBER", "RANK", "DENSE_RANK", "NTILE"], 2, "DENSE_RANK yields 1,1,2; RANK yields 1,1,3; ROW_NUMBER never ties."),
    m("sql", "intermediate", "What does `LAG(amount, 1) OVER (PARTITION BY account_id ORDER BY ts)` return?", ["The next amount", "The previous row's amount within the account", "The first amount", "The sum so far"], 1, "LAG looks backwards by the offset within the partition ordering."),
    m("sql", "intermediate", "Why is `WHERE col = NULL` always wrong?", ["It is slow", "NULL comparisons yield UNKNOWN; use IS NULL", "NULL is zero", "It deletes rows"], 1, "Three-valued logic: nothing equals NULL, not even NULL."),
    m("sql", "advanced", "A NOT IN subquery returns no rows unexpectedly. Likely cause?", ["Missing index", "The subquery returns a NULL", "Too many rows", "Wrong collation"], 1, "x NOT IN (..., NULL) is never TRUE; prefer NOT EXISTS."),
    m("sql", "advanced", "Which pattern deduplicates keeping the latest row per key?", ["DISTINCT *", "ROW_NUMBER() OVER (PARTITION BY key ORDER BY updated_at DESC) = 1", "GROUP BY *", "LIMIT 1"], 1, "Ranking within each key and keeping rank 1 is deterministic."),
    m("sql", "advanced", "A running total over a date-ordered window should use which frame?", ["ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW", "ROWS BETWEEN 1 PRECEDING AND 1 FOLLOWING", "RANGE NONE", "PARTITION ONLY"], 0, "Cumulative sums span from the start of the partition to the current row."),
    m("sql", "intermediate", "A composite index on (customer_id, order_date) helps most with which filter?", ["order_date alone", "customer_id = ? AND order_date >= ?", "Neither column", "Only OR conditions"], 1, "Leftmost-prefix rule: queries must use the leading column."),
    m("sql", "advanced", "Which statement about an EXPLAIN plan showing a full table scan is correct?", ["It is always bad", "It may be optimal for small tables or queries touching most rows", "It means the index is corrupt", "It cannot be avoided"], 1, "Scans are fine when selectivity is low; judge by row counts and cost."),

    # ---------------- Python ----------------
    m("python", "beginner", "Which is mutable?", ["tuple", "str", "list", "int"], 2, "Lists can be changed in place; tuples and strings cannot."),
    m("python", "beginner", "What does `{k: v for k, v in pairs}` create?", ["A list", "A dictionary comprehension result", "A set", "A generator"], 1, "Braces with key: value form a dict comprehension."),
    m("python", "beginner", "Which keyword safely opens and automatically closes a file?", ["try", "with", "using", "def"], 1, "The context manager closes the file even on exceptions."),
    m("python", "intermediate", "What is the advantage of a generator for a 20 GB file?", ["Faster CPU", "Yields items lazily so memory use stays small", "Automatic parallelism", "Compression"], 1, "Generators produce values one at a time."),
    m("python", "intermediate", "What does a decorator do?", ["Defines a class", "Wraps a function to add behaviour without changing its code", "Imports modules", "Compiles code"], 1, "It takes a function and returns a modified function."),
    m("python", "intermediate", "Which handles a possibly missing dictionary key without KeyError?", ["d[k]", "d.get(k, default)", "d.pop()", "d.keys()"], 1, "get returns the default when the key is absent."),
    m("python", "intermediate", "In pandas, `df.groupby('region')['amount'].sum()` returns:", ["A DataFrame of all rows", "A Series of sums per region", "A list", "The first row"], 1, "Selecting one column after groupby yields a Series."),
    m("python", "advanced", "Why avoid a mutable default argument like `def f(x, acc=[])`?", ["It is slow", "The list is shared across calls", "Syntax error", "It breaks recursion"], 1, "Defaults are evaluated once at definition time."),
    m("python", "advanced", "What does `pd.read_csv(path, chunksize=100_000)` return?", ["A DataFrame", "An iterator of DataFrames", "A list of strings", "A numpy array"], 1, "Chunked reading lets you process big files incrementally."),
    m("python", "intermediate", "Best way to parse an ISO date string?", ["Regex only", "datetime.fromisoformat / strptime", "Split on dashes manually", "eval"], 1, "Use the standard library parsers and handle ValueError."),
    m("python", "advanced", "Retrying a failing HTTP call should use:", ["A tight infinite loop", "Exponential backoff with a retry limit", "No timeout", "Random sleeps forever"], 1, "Bounded, backed-off retries avoid hammering a struggling service."),
    m("python", "intermediate", "Which stores credentials most safely?", ["Hard-coded constant", "Environment variable or secrets manager", "Comment in code", "Committed .env file"], 1, "Secrets must stay out of source control."),

    # ---------------- Fundamentals ----------------
    m("fundamentals", "beginner", "ETL stands for:", ["Extract, Transform, Load", "Evaluate, Test, Launch", "Export, Transfer, Log", "Extract, Translate, Link"], 0, "Data is extracted, transformed and then loaded."),
    m("fundamentals", "beginner", "Which workload is OLAP?", ["Insert a bank transfer", "Report total revenue by region over three years", "Update a customer address", "Reserve a seat"], 1, "OLAP is analytical, scanning and aggregating lots of history."),
    m("fundamentals", "intermediate", "Why is Parquet generally preferred to CSV for analytics?", ["Human readable", "Columnar, compressed, typed and supports predicate pushdown", "Smaller schema", "Required by SQL"], 1, "Columnar layout reads only needed columns."),
    m("fundamentals", "intermediate", "Which statement defines idempotency?", ["Fast pipeline", "Running the same job repeatedly yields the same final state", "Runs once only", "Uses retries"], 1, "Repeats must not change the result."),
    m("fundamentals", "intermediate", "ELT differs from ETL mainly because:", ["Data is not transformed", "Raw data is loaded first and transformed inside the target platform", "It uses no SQL", "It is only streaming"], 1, "Modern warehouses and lakehouses have scalable compute."),
    m("fundamentals", "intermediate", "A data lake is best described as:", ["A strictly modelled star schema", "Scalable storage for raw and curated data of any format", "An OLTP database", "A BI dashboard"], 1, "Lakes store files cheaply and defer structure."),
    m("fundamentals", "advanced", "What is the main purpose of the medallion (bronze/silver/gold) pattern?", ["Compression", "Progressively refine data with clear quality contracts and replay ability", "Encryption", "Scheduling"], 1, "Each layer improves quality and supports reprocessing."),
    m("fundamentals", "advanced", "What is schema-on-read?", ["Schema enforced at write time", "Structure applied when data is queried", "No schema at all", "XML only"], 1, "Lakes often store raw data and interpret it at read time."),
    m("fundamentals", "beginner", "Which is semi-structured data?", ["A relational table", "A JSON document", "A scanned image", "A video"], 1, "JSON has structure but flexible schema."),
    m("fundamentals", "intermediate", "Fault tolerance in pipelines is best achieved by:", ["Never failing", "Retries, checkpoints, idempotent steps and monitoring", "Bigger servers", "Manual reruns"], 1, "Plan for failure and make recovery safe."),
    m("fundamentals", "advanced", "Data lineage helps primarily to:", ["Compress files", "Trace where data came from and what depends on it", "Speed up joins", "Schedule jobs"], 1, "Lineage supports impact analysis and audits."),
    m("fundamentals", "intermediate", "Partitioning a table by date mainly improves:", ["Encryption", "Query performance via pruning and manageable loads", "Row uniqueness", "Join correctness"], 1, "Queries and loads touch only relevant partitions."),

    # ---------------- Warehousing ----------------
    m("warehousing", "beginner", "A fact table typically contains:", ["Descriptive attributes only", "Numeric measures and foreign keys to dimensions", "User passwords", "Raw log text"], 1, "Facts store measurable events."),
    m("warehousing", "beginner", "A dimension table typically contains:", ["Transactions", "Descriptive context such as customer or product attributes", "Only keys", "Logs"], 1, "Dimensions provide the 'who/what/where/when'."),
    m("warehousing", "intermediate", "What is the grain of a fact table?", ["Its size", "What one row represents", "Its primary key type", "Its partition count"], 1, "Declare the grain before choosing dimensions and measures."),
    m("warehousing", "intermediate", "SCD Type 2 preserves history by:", ["Overwriting values", "Adding a new row version with validity dates", "Adding a column for the previous value only", "Deleting the old row"], 1, "Expire old row, insert new current row."),
    m("warehousing", "intermediate", "Why use surrogate keys?", ["They are secret", "Independent of source keys, allow history versions and stable joins", "Required by SQL", "They are shorter strings"], 1, "They decouple the warehouse from changing source keys."),
    m("warehousing", "intermediate", "SCD Type 1 means:", ["Keep full history", "Overwrite the old value", "Add a previous-value column", "Never change"], 1, "No history is kept."),
    m("warehousing", "advanced", "A snowflake schema differs from a star schema by:", ["Using no dimensions", "Normalising dimensions into sub-tables", "Having no fact table", "Using NoSQL"], 1, "Snowflaking trades simplicity for less redundancy."),
    m("warehousing", "advanced", "Joining facts to SCD2 dimensions correctly requires:", ["Joining on the business key only", "Joining the version valid at the event date", "A cross join", "Ignoring dates"], 1, "Otherwise rows fan out and double count."),
    m("warehousing", "advanced", "A conformed dimension is:", ["A deleted dimension", "A dimension shared consistently across multiple fact tables", "A private table", "A junk dimension"], 1, "It enables drill-across between business processes."),
    m("warehousing", "intermediate", "A data mart is:", ["A server", "A subject-focused subset of the warehouse for a team", "A backup", "A log"], 1, "For example a finance or marketing mart."),
    m("warehousing", "advanced", "Late-arriving dimension members are best handled by:", ["Dropping the fact", "Inferred/unknown members that are later updated", "Failing the pipeline forever", "Random keys"], 1, "Create placeholder members and fix them when the data arrives."),
    m("warehousing", "beginner", "OLTP systems are optimised for:", ["Large historical aggregations", "Many small, fast transactions", "Machine learning", "Image storage"], 1, "OLTP serves applications; OLAP serves analysis."),

    # ---------------- ETL ----------------
    m("etl", "beginner", "A full load:", ["Loads only changes", "Reloads the entire dataset each time", "Never deletes data", "Is always faster"], 1, "Simple but expensive on large tables."),
    m("etl", "intermediate", "A watermark in incremental loading is:", ["A security token", "The stored high-water mark (last processed timestamp or id)", "A log level", "A partition"], 1, "It records where the last load stopped."),
    m("etl", "intermediate", "When should the watermark be advanced?", ["Before loading", "Only after the load commits successfully", "Randomly", "Never"], 1, "Otherwise a failure causes silent data loss."),
    m("etl", "intermediate", "Why quarantine invalid rows instead of silently dropping them?", ["It saves space", "They can be audited, fixed and reprocessed", "It is required by SQL", "It speeds up loads"], 1, "Silent drops hide data problems."),
    m("etl", "advanced", "What does Change Data Capture (CDC) capture that a simple updated_at watermark may miss?", ["New rows", "Hard deletes and intermediate changes", "Column names", "Index sizes"], 1, "Log-based CDC sees deletes and every change."),
    m("etl", "intermediate", "Which technique makes a load idempotent?", ["Append only", "MERGE/upsert keyed on a business key or partition overwrite", "Random IDs", "Skipping validation"], 1, "Reruns converge to the same state."),
    m("etl", "intermediate", "Which errors should generally be retried?", ["Invalid data", "Transient errors like timeouts and 503", "Syntax errors", "Permission denied always"], 1, "Retrying permanent errors wastes time."),
    m("etl", "advanced", "A good reconciliation check after a load is:", ["Counting log lines", "Compare source row counts and sums with target plus rejected rows", "Check file names", "Restart the server"], 1, "Proves nothing was lost or duplicated."),
    m("etl", "beginner", "Why log row counts at each stage?", ["It looks professional", "To detect where data was lost or inflated", "To use more disk", "No reason"], 1, "Counts reveal anomalies quickly."),
    m("etl", "advanced", "Safest way to replace a day's data in a warehouse table?", ["DELETE then INSERT in separate commits", "DELETE and INSERT inside one transaction (or partition swap)", "TRUNCATE the whole table", "INSERT only"], 1, "Atomicity prevents partial states."),
    m("etl", "intermediate", "Hard-coding `datetime.now()` for data selection hurts because:", ["It is slow", "Reruns and backfills select the wrong data", "It uses memory", "It is deprecated"], 1, "Pass the run date as a parameter."),
    m("etl", "beginner", "ELT is common with cloud warehouses because:", ["They cannot transform", "They provide scalable in-database compute for transformations", "They have no SQL", "ETL is illegal"], 1, "Load raw first, transform with SQL in place."),

    # ---------------- Spark ----------------
    m("spark", "beginner", "Spark transformations are:", ["Executed immediately", "Lazy until an action is called", "Only for RDDs", "Always shuffles"], 1, "Spark builds a plan and executes on an action."),
    m("spark", "beginner", "Which is an ACTION?", ["filter", "select", "count", "withColumn"], 2, "count triggers execution."),
    m("spark", "intermediate", "Which causes a shuffle (wide transformation)?", ["filter", "map", "groupBy aggregation", "select"], 2, "Grouping needs equal keys on the same partition."),
    m("spark", "intermediate", "Why is a broadcast join fast?", ["It sorts data", "The small table is copied to all executors so the large table is not shuffled", "It uses disk", "It skips keys"], 1, "It avoids shuffling the big side."),
    m("spark", "intermediate", "Where does the driver run your main program logic?", ["On every executor", "On the driver, which builds the plan and coordinates executors", "On the storage layer", "Nowhere"], 1, "Executors run tasks; the driver coordinates."),
    m("spark", "advanced", "Data skew is best identified by:", ["Reading source code", "A few tasks in a stage taking much longer than the median in the Spark UI", "Counting columns", "Row order"], 1, "Task time distribution reveals hot keys."),
    m("spark", "advanced", "Adaptive Query Execution can:", ["Rewrite your SQL file", "Coalesce partitions and handle skewed joins at runtime", "Replace Parquet", "Remove the driver"], 1, "AQE adapts the plan using runtime statistics."),
    m("spark", "intermediate", "A Python UDF is usually slower than built-ins because:", ["Python is illegal", "Rows are serialised to Python and the optimiser cannot see inside", "It uses GPUs", "It needs Java 8"], 1, "Prefer built-in functions or pandas UDFs."),
    m("spark", "intermediate", "Partitioning output by a high-cardinality column like customer_id causes:", ["Faster reads", "Millions of tiny files and slow metadata operations", "Better compression", "Nothing"], 1, "Choose low-to-medium cardinality columns used in filters."),
    m("spark", "advanced", "`df.cache()` helps when:", ["Used once", "The DataFrame is reused by several actions", "Never", "Reading from Parquet"], 1, "Caching avoids recomputation but uses memory."),
    m("spark", "beginner", "A DataFrame is:", ["A mutable list", "A distributed table-like collection with a schema", "A file format", "A cluster"], 1, "It is the main structured API."),
    m("spark", "advanced", "Narrow vs wide transformation: a narrow one", ["Needs a shuffle", "Computes each output partition from one input partition", "Always caches", "Only works in SQL"], 1, "Examples: filter, select, map."),

    # ---------------- Orchestration ----------------
    m("orchestration", "beginner", "In Airflow a DAG is:", ["A database", "A graph of tasks with dependencies and no cycles", "A cluster", "A log"], 1, "Directed acyclic graph."),
    m("orchestration", "beginner", "What does an operator represent?", ["A user", "A template for a kind of task", "A server", "A schedule"], 1, "Instances of operators are tasks."),
    m("orchestration", "intermediate", "What is a sensor for?", ["Storing data", "Waiting for a condition such as a file or partition", "Formatting code", "Sending email only"], 1, "It blocks downstream tasks until ready."),
    m("orchestration", "intermediate", "Backfilling means:", ["Deleting runs", "Running the pipeline for past periods", "Adding workers", "Changing the schedule"], 1, "Reprocess historical intervals."),
    m("orchestration", "intermediate", "Retries are safe only when tasks are:", ["Fast", "Idempotent", "Long", "Parallel"], 1, "Otherwise retries duplicate effects."),
    m("orchestration", "advanced", "A task that sends an alert regardless of upstream outcome should use trigger rule:", ["all_success", "all_done (or one_failed)", "none_failed only", "never"], 1, "Trigger rules control behaviour when upstream fails."),
    m("orchestration", "advanced", "Why avoid heavy work at the top level of a DAG file?", ["Style", "The scheduler parses DAG files repeatedly, slowing everything", "It is illegal", "It breaks XCom"], 1, "Keep import-time code light."),
    m("orchestration", "intermediate", "What should XCom carry?", ["Large DataFrames", "Small values like paths or counts", "Passwords", "Entire tables"], 1, "Metadata DB is not a data store."),
    m("orchestration", "intermediate", "`{{ ds }}` in Airflow templates is:", ["The server name", "The logical date of the run as YYYY-MM-DD", "A secret", "A task id"], 1, "Use it for date-parameterised work."),
    m("orchestration", "advanced", "ADF tumbling window triggers resemble Airflow's:", ["Sensors", "Data intervals with per-window runs and backfill", "XCom", "Executors"], 1, "Both model fixed non-overlapping intervals."),
    m("orchestration", "beginner", "Why use an orchestrator instead of cron?", ["Cron is slower", "Dependencies, retries, alerting, monitoring and backfill", "Cron cannot run Python", "Looks nicer"], 1, "Orchestrators coordinate pipelines."),
    m("orchestration", "advanced", "A green DAG with wrong data shows the need for:", ["More retries", "Data-quality and freshness checks as tasks", "Bigger executors", "A new schedule"], 1, "Task success is not correctness."),

    # ---------------- Azure ----------------
    m("azure", "beginner", "ADLS Gen2 is:", ["A relational database", "Data lake storage built on Blob storage with hierarchical namespace", "A BI tool", "A VM"], 1, "It underpins lakes on Azure."),
    m("azure", "beginner", "Azure Data Factory is mainly used for:", ["Drawing diagrams", "Data integration and orchestration", "Email", "Running Excel"], 1, "Pipelines, copy and triggers."),
    m("azure", "intermediate", "A Linked Service in ADF defines:", ["A pipeline schedule", "The connection to a data store or compute", "A SQL query", "A trigger"], 1, "Datasets then point to data within it."),
    m("azure", "intermediate", "Self-hosted Integration Runtime is needed to:", ["Run Databricks", "Reach private or on-premises data sources", "Store secrets", "Create dashboards"], 1, "It runs inside your network."),
    m("azure", "intermediate", "Azure Key Vault stores:", ["Parquet files", "Secrets, keys and certificates", "DAGs", "Logs only"], 1, "Reference it instead of hard-coding credentials."),
    m("azure", "intermediate", "Best way to authenticate an Azure service to storage without a password:", ["Account key", "Managed identity with an RBAC role", "Anonymous", "Shared password"], 1, "Credentials are managed by Azure."),
    m("azure", "advanced", "Databricks differs from Synapse dedicated SQL pool mainly by:", ["Neither uses storage", "Databricks is a Spark/lakehouse platform; the SQL pool is a T-SQL MPP warehouse", "Databricks is a database server only", "No difference"], 1, "Different engines for different workloads."),
    m("azure", "advanced", "Microsoft Fabric's OneLake aims to:", ["Replace Power BI", "Provide one logical, Delta-based lake for all Fabric workloads", "Be an OLTP DB", "Run Kafka"], 1, "Reduce copies and integration work."),
    m("azure", "intermediate", "Cost-effective compute for a nightly Spark job is:", ["Always-on cluster", "Job cluster that terminates after completion", "Large VM left running", "Manual cluster"], 1, "Pay only while it runs."),
    m("azure", "beginner", "PaaS means:", ["You manage hardware", "The provider manages the platform; you manage code and data", "No cloud", "Only email"], 1, "Azure SQL and ADF are PaaS."),
    m("azure", "advanced", "Which event-ingestion service offers a Kafka-compatible endpoint?", ["Key Vault", "Event Hubs", "Blob Storage", "Purview"], 1, "Event Hubs supports the Kafka protocol."),
    m("azure", "advanced", "Which statement is honest about cloud learning?", ["Concepts equal deployed experience", "Be clear about what you designed, rehearsed locally and actually deployed", "Never mention limits", "Claim every service"], 1, "Interviewers value accuracy and reasoning."),

    # ---------------- Streaming ----------------
    m("streaming", "beginner", "Kafka stores events in:", ["A single file", "Topics divided into partitions", "A SQL table", "Excel"], 1, "Partitions are ordered logs."),
    m("streaming", "beginner", "Velocity in the 3 Vs refers to:", ["Data size", "Speed of data arrival", "Data types", "Data quality"], 1, "High velocity suggests streaming."),
    m("streaming", "intermediate", "Ordering in Kafka is guaranteed:", ["Across the topic", "Within a partition", "Across groups", "Never"], 1, "Use a key to keep related events together."),
    m("streaming", "intermediate", "Consumers in the same group:", ["All receive every message", "Share the partitions so each message is processed once by the group", "Cannot scale", "Ignore offsets"], 1, "Different groups each get all messages."),
    m("streaming", "intermediate", "What is consumer lag?", ["Network delay", "How far a consumer group is behind the latest offset", "Retry count", "Message size"], 1, "A key health metric."),
    m("streaming", "advanced", "At-least-once delivery plus idempotent writes gives:", ["Data loss", "Effectively exactly-once results", "Random order", "No guarantees"], 1, "Duplicates have no extra effect."),
    m("streaming", "advanced", "A watermark in stream processing:", ["Encrypts events", "Defines how late data may be before windows close", "Sets partitions", "Compresses logs"], 1, "Balances completeness with latency."),
    m("streaming", "advanced", "Which time should business windows use?", ["Processing time", "Event time", "Server boot time", "Commit time"], 1, "Event time stays correct with late data."),
    m("streaming", "intermediate", "More consumers than partitions in one group means:", ["Faster", "Extra consumers sit idle", "Messages duplicated", "Kafka adds partitions"], 1, "Parallelism is capped by partition count."),
    m("streaming", "beginner", "A good use of streaming is:", ["Annual report", "Real-time fraud detection", "Archiving old files", "Monthly payroll"], 1, "Low latency has business value there."),
    m("streaming", "advanced", "Committing offsets before processing risks:", ["Duplicates", "Message loss on failure", "Slower reads", "Larger topics"], 1, "A crash after commit skips unprocessed messages."),
    m("streaming", "intermediate", "A hot key in Kafka causes:", ["More ordering", "One overloaded partition", "Faster consumers", "Smaller topics"], 1, "Skew limits throughput."),

    # ---------------- Tools ----------------
    m("tools", "beginner", "Which Git command stages files?", ["git push", "git add", "git pull", "git log"], 1, "Staging prepares changes for commit."),
    m("tools", "beginner", "Why use Docker?", ["To avoid code", "Reproducible environments across machines", "Faster disks", "Free cloud"], 1, "Same image, same behaviour."),
    m("tools", "intermediate", "HTTP 429 means:", ["Not found", "Too many requests (rate limited)", "Server crashed", "Unauthorized"], 1, "Back off and retry later."),
    m("tools", "intermediate", "Which belongs in unit tests for a pipeline?", ["Production data", "Pure transformation functions with edge cases", "Network calls", "Passwords"], 1, "Fast and deterministic."),
    m("tools", "intermediate", "Environment variables are used to:", ["Store large data", "Supply configuration and secrets outside code", "Compile code", "Cache queries"], 1, "Separate config from code."),
    m("tools", "advanced", "Pseudonymising emails safely for joins uses:", ["Plain SHA-256", "Keyed hashing (HMAC) or a token vault", "Base64", "Reversible XOR"], 1, "Unsalted hashes are easy to reverse by dictionary attack."),
    m("tools", "advanced", "Data observability checks include:", ["Freshness, volume, schema, distribution and lineage", "Colour themes", "Fan speed", "Git branch count"], 0, "They monitor data health, not just jobs."),
    m("tools", "intermediate", "CI/CD for pipelines should:", ["Skip tests", "Run tests automatically and deploy through environments", "Edit prod manually", "Share passwords"], 1, "Automation reduces human error."),
    m("tools", "advanced", "A leaked key found in Git history should be:", ["Ignored", "Rotated immediately and the process fixed", "Hidden in a comment", "Shared"], 1, "Deleting the commit does not undo exposure."),
    m("tools", "beginner", "Which Linux command shows the last lines of a log as they grow?", ["cat", "tail -f", "rm", "cd"], 1, "tail -f follows a file."),
    m("tools", "intermediate", "Referential-integrity testing finds:", ["Slow queries", "Fact rows whose keys do not exist in dimensions", "Large files", "Unused indexes"], 1, "Orphan keys break joins."),
    m("tools", "advanced", "Dockerfile best practice:", ["Run as root", "Use a minimal trusted base image and a non-root USER", "Embed secrets", "Use latest blindly"], 1, "Least privilege and reproducibility."),
]
