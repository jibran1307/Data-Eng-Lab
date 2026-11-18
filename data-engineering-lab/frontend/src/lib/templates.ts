/**
 * Scenario templates: each expands to many unique question variants (see interview.expandTemplate).
 * Add a template here and it immediately multiplies the bank.
 */
import type { Template } from './interview'

export const TEMPLATES: Template[] = [
  {
    id: 'tpl-dup-source', topic: 'scenario', type: 'scenario', level: 'intermediate',
    q: 'The {system} sends {volume} of records per day and about {dup} of them are duplicates because of {cause}. How do you make the pipeline into {target} produce correct results?',
    slots: {
      system: ['payments gateway', 'CRM export', 'IoT telemetry feed', 'order management system', 'mobile app event stream'],
      volume: ['2 million', '50 million', '800 thousand', '300 million'],
      dup: ['3%', '12%', '0.5%', '20%'],
      cause: ['at-least-once delivery retries', 'manual re-exports by the business', 'overlapping extraction windows', 'client-side resubmits'],
      target: ['the data warehouse', 'the lakehouse silver layer', 'a reporting database'],
    },
    answer: 'Define a business key (or natural/composite key) and deduplicate with ROW_NUMBER() OVER (PARTITION BY key ORDER BY updated_at DESC) = 1, or load with MERGE/upsert so reruns are idempotent. Keep raw data untouched in a landing layer, dedupe when promoting to the curated layer, add a data quality check that counts duplicate keys and alerts, and address the root cause ({cause}) with the source team where possible.',
    keywords: [['business key', 'natural key', 'composite key', 'primary key'], ['row_number', 'window function', 'dedupe', 'deduplicate'], ['merge', 'upsert', 'idempotent'], ['raw', 'landing', 'bronze'], ['quality check', 'monitor', 'alert', 'validation']],
    hints: ['Which column(s) uniquely identify a business entity?', 'What happens if the pipeline is re-run?'],
  },
  {
    id: 'tpl-growth', topic: 'scenario', type: 'scenario', level: 'advanced',
    q: 'A {job} job that processed {small} comfortably now has to handle {big} and runs {slow}. Walk through how you would diagnose and optimise it.',
    slots: {
      job: ['nightly sales aggregation', 'customer 360 join', 'clickstream sessionisation', 'risk exposure calculation'],
      small: ['1 GB', '5 GB', '20 GB'],
      big: ['500 GB', '2 TB', '300 GB'],
      slow: ['6 hours instead of 20 minutes', 'out of memory after 3 hours', 'for 10 hours with a few tasks stuck'],
    },
    answer: 'Measure first: use the Spark UI (stage timeline, shuffle read/write, task duration distribution) to find the bottleneck. Typical fixes: columnar partitioned storage (Parquet) with partition pruning and column pruning, filter early, broadcast small dimension tables, fix data skew (salting or AQE skew join), tune shuffle partitions, avoid collect/UDFs, cache only reused data, and scale cluster size last. Process incrementally rather than reprocessing everything.',
    keywords: [['spark ui', 'measure', 'profile', 'diagnose'], ['parquet', 'columnar', 'partition pruning'], ['broadcast'], ['skew', 'salting', 'aqe'], ['shuffle'], ['incremental']],
    hints: ['Where would you look to find the real bottleneck?', 'Which operation causes the most data movement?'],
  },
  {
    id: 'tpl-sql-topn', topic: 'sql', type: 'sql', level: 'intermediate',
    q: 'Write a SQL query returning the top {n} {entity} by {metric} within each {group}. Explain how ties are handled.',
    slots: {
      n: ['2', '3', '5'],
      entity: ['products', 'customers', 'sales reps', 'accounts'],
      metric: ['total revenue', 'order count', 'average order value', 'profit'],
      group: ['region', 'month', 'category', 'country'],
    },
    answer: 'Aggregate in a CTE, then rank with a window function: SELECT * FROM (SELECT g, entity, metric, DENSE_RANK() OVER (PARTITION BY g ORDER BY metric DESC) AS rnk FROM agg) WHERE rnk <= N. ROW_NUMBER returns exactly N rows per group (ties broken arbitrarily), RANK leaves gaps after ties, DENSE_RANK keeps ties without gaps.',
    keywords: [['partition by'], ['order by'], ['row_number', 'rank', 'dense_rank'], ['cte', 'subquery', 'with'], ['ties', 'tie']],
    hints: ['Use a window function with PARTITION BY.', 'Window functions cannot be filtered in WHERE directly.'],
  },
  {
    id: 'tpl-late', topic: 'scenario', type: 'scenario', level: 'advanced',
    q: 'Events for the {pipeline} arrive up to {delay} late. Reports must be accurate but also available by {sla}. How do you design for late-arriving data?',
    slots: {
      pipeline: ['daily revenue report', 'fraud detection dashboard', 'customer engagement metrics', 'inventory snapshot'],
      delay: ['2 hours', '3 days', '48 hours', '1 week'],
      sla: ['7am each day', '15 minutes after the hour', '9am Monday'],
    },
    answer: 'Separate event time from processing time. Partition by event date, and reprocess a rolling window of recent partitions (lookback) so late rows update earlier results idempotently via MERGE or partition overwrite. In streaming, use watermarks to bound lateness and emit updates. Publish a provisional figure by the SLA and restate when the lookback window closes; record load timestamps for auditing.',
    keywords: [['event time'], ['processing time', 'ingestion time', 'load time'], ['lookback', 'rolling window', 'reprocess'], ['watermark'], ['merge', 'overwrite', 'idempotent'], ['restate', 'provisional', 'correct']],
  },
  {
    id: 'tpl-design', topic: 'design', type: 'design', level: 'advanced',
    q: 'Design a data platform for a {company} that needs {need}. Data volume is {vol}. Describe ingestion, storage, processing, serving and how you would monitor it.',
    slots: {
      company: ['retail bank', 'insurance company', 'e-commerce marketplace', 'ride-sharing startup', 'telecom provider'],
      need: ['near real-time fraud signals and daily regulatory reports', 'a unified customer 360 view for analysts', 'hourly sales dashboards and ML feature tables', 'daily claims analytics with 7-year retention'],
      vol: ['200 GB per day', '5 TB per day', '20 GB per day with spikes'],
    },
    answer: 'Ingest via batch (ADF/Airflow, CDC) and streaming (Kafka/Event Hubs) into a landing zone on a data lake (ADLS Gen2). Use a medallion layout: bronze raw, silver cleaned and deduplicated, gold modelled. Process with Spark/Databricks or SQL; serve gold via a warehouse/lakehouse (Synapse/Fabric) with star schemas. Orchestrate with Airflow/ADF, add data quality checks, lineage, RBAC, Key Vault secrets, encryption, PII masking, monitoring and alerting, and cost controls.',
    keywords: [['ingest', 'batch', 'streaming', 'kafka', 'cdc'], ['data lake', 'adls', 'lakehouse', 'storage'], ['bronze', 'silver', 'gold', 'medallion', 'layer'], ['spark', 'databricks', 'transform'], ['warehouse', 'star schema', 'serve', 'serving'], ['orchestrat', 'airflow', 'adf'], ['monitor', 'quality', 'alert'], ['security', 'rbac', 'pii', 'key vault']],
  },
  {
    id: 'tpl-troubleshoot', topic: 'troubleshooting', type: 'troubleshoot', level: 'intermediate',
    q: 'The {task} task in your {tool} pipeline started failing with "{error}" after working for months. What is your investigation process?',
    slots: {
      task: ['load_customers', 'extract_orders', 'transform_events', 'publish_marts'],
      tool: ['Airflow', 'Azure Data Factory', 'Databricks workflow'],
      error: ['column not found', 'connection timed out', 'duplicate key value violates unique constraint', 'out of memory', 'permission denied'],
    },
    answer: 'Read the task logs first and identify the exact failing step and time. Check what changed: source schema, credentials/secret expiry, data volume, code deploys, infrastructure or permissions. Reproduce with a small slice, fix the root cause, then re-run safely - the pipeline should be idempotent so retries do not duplicate. Add an alert/test (schema or volume check) to catch it earlier, and write down the incident cause and fix.',
    keywords: [['log'], ['what changed', 'schema', 'credentials', 'permission', 'volume'], ['reproduce', 'isolate', 'root cause'], ['idempotent', 'rerun', 're run', 'retry'], ['alert', 'monitor', 'test', 'prevent']],
  },
  {
    id: 'tpl-py-transform', topic: 'python', type: 'python', level: 'beginner',
    q: 'Write a Python function that takes a list of {records} dictionaries and returns {output}. Describe how you would handle {edge}.',
    slots: {
      records: ['order', 'transaction', 'customer', 'sensor reading'],
      output: ['the total amount per category', 'the five largest values', 'a dictionary grouped by month', 'only the unique records by id'],
      edge: ['missing keys', 'empty input', 'invalid data types', 'duplicate ids'],
    },
    answer: 'Use a defaultdict or dict accumulator, iterate once, and use .get() with defaults or try/except to tolerate missing or invalid values. Validate inputs, return an empty result for empty input, and avoid mutating the input. Example: totals = defaultdict(float); for r in rows: totals[r.get("category","unknown")] += float(r.get("amount", 0)).',
    keywords: [['defaultdict', 'dict', 'dictionary'], ['loop', 'for ', 'iterate', 'comprehension'], ['get(', '.get', 'default', 'try'], ['validate', 'empty', 'check'], ['return']],
  },
]
