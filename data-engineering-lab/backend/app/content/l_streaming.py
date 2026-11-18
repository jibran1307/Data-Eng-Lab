"""Module 9: Big Data and Streaming."""
from ._types import iq, lesson, mcq

M = "streaming"

LESSONS = [
    lesson("bd-fundamentals", M, "Big Data fundamentals and distributed systems", 16, "beginner", ["de-pipelines"],
           "What makes data 'big', the Vs, and the distributed-systems ideas (partitioning, replication, CAP) behind every big data tool.",
           r"""
## What "big data" actually means

Data is "big" when a **single machine can no longer store or process it in acceptable time**, so you must spread the work across many machines. It is not a number of gigabytes; it is a *change in engineering approach*. A 5 GB CSV is not big data (pandas or DuckDB handles it), a 5 TB event log is.

## The Vs

| V | Meaning | Example |
|---|---|---|
| **Volume** | How much | Billions of card transactions |
| **Velocity** | How fast it arrives | 50,000 clicks per second |
| **Variety** | Many shapes | Tables, JSON logs, images, PDFs |
| **Veracity** | Trustworthiness | Duplicates, sensor noise, missing fields |
| **Value** | Whether it is worth using | Fraud scores, recommendations |
| Variability | Meaning and volume shift over time | Seasonal spikes, changing schemas |

The first three are the classic "3 Vs"; the others are common additions. Interviewers like candidates who connect each V to a design decision: velocity drives streaming, variety drives schema-on-read and formats, veracity drives data quality checks.

## Distributed systems in four ideas

1. **Partitioning (sharding)**: split data across nodes so each handles a slice. Spark partitions, Kafka partitions and HDFS blocks are all this idea.
2. **Replication**: keep copies on several nodes so failure of one machine loses nothing. Kafka's replication factor and HDFS's three copies.
3. **Parallelism**: process partitions simultaneously and combine the results (map then reduce / shuffle).
4. **Failure is normal**: with thousands of machines something is always failing, so systems retry, re-assign work and checkpoint state. This is why idempotency and fault tolerance recur throughout this course.

## The CAP idea in plain language

During a network partition a distributed store must choose between **consistency** (everyone sees the same latest value) and **availability** (always answers). Banking ledgers lean consistent; a "likes" counter can be eventually consistent. Know that "eventually consistent" is a deliberate trade-off for scale, not a bug.

## Batch versus real-time (introduction)

- **Batch**: process a bounded chunk (yesterday's data). Simple, cheap, high throughput; latency in hours.
- **Streaming**: process events continuously as they arrive. Seconds of latency, more complex (ordering, late data, state).
- Most organisations use batch for the majority of workloads and streaming only where freshness has real business value (fraud detection, live inventory, alerts).

## The ecosystem map

| Role | Examples |
|---|---|
| Distributed storage | HDFS, ADLS, S3 |
| Batch processing | Hadoop MapReduce (legacy), Apache Spark |
| Messaging / event log | Apache Kafka, Azure Event Hubs |
| Stream processing | Spark Structured Streaming, Flink, Kafka Streams |
| Serving/analytics | Warehouses, lakehouse tables, OLAP stores |

Hadoop's HDFS + MapReduce introduced the distributed model; Spark replaced MapReduce with in-memory processing; cloud object storage replaced HDFS in most new designs.

## Common mistakes

- Reaching for big data tools when a single-node tool is simpler and faster.
- Choosing streaming because it sounds modern when daily batch satisfies the requirement.
- Ignoring data quality ("veracity") at scale.

## Real-world use

A card issuer scores transactions for fraud in under a second (velocity, streaming) while a nightly batch job recomputes customer risk across ten years of history (volume, batch). Both read from the same lake.
""",
           [mcq("Which V mainly drives the need for streaming?", ["Volume", "Velocity", "Value", "Variety"], 1, "High arrival speed with low-latency needs points to streaming."),
            mcq("A 3 GB CSV on a laptop is usually:", ["Definitely big data", "Manageable with single-node tools like DuckDB or pandas", "Impossible to process", "Only for Spark"], 1, "Big data means exceeding single-machine capacity."),
            mcq("Replication in distributed systems primarily provides:", ["Faster SQL", "Fault tolerance because copies survive node failure", "Smaller files", "Encryption"], 1, "Copies on multiple nodes keep data available."),
            mcq("Eventual consistency means:", ["Data is never consistent", "Replicas converge to the same value after updates propagate", "Writes are lost", "Reads are blocked"], 1, "A deliberate trade-off for availability and scale.", "intermediate")],
           [iq("What are the 3 Vs of big data and what do they imply for design?", "Volume (data too large for one machine) implies distributed storage and processing; Velocity (rate of arrival) implies streaming and low-latency ingestion; Variety (formats) implies flexible schemas and varied connectors. Veracity and Value add data quality and business relevance."),
            iq("Why is failure handling so central in distributed systems?", "With many machines, failures are routine. Systems replicate data, retry and reschedule tasks, checkpoint state and rely on idempotent operations so recovery is safe.")]),

    lesson("kafka-core", M, "Kafka fundamentals: topics, partitions, producers, consumers and offsets", 22, "intermediate", ["bd-fundamentals"],
           "How Kafka works as a distributed commit log, and how producers, consumer groups and offsets deliver scalable event streaming.",
           r"""
> **Local practice.** Kafka runs locally with Docker or the standalone download (KRaft mode, no ZooKeeper). This app does not run Kafka, but you can rehearse the ideas in Python with a list as the "log" and integer offsets (see the Python exercises and the conceptual example below). Azure's equivalent managed service is **Event Hubs** (Kafka-compatible endpoint).

## Why Kafka exists

Early integrations were point-to-point: every system sent data directly to every other system. Ten producers and ten consumers means up to a hundred fragile connections, and a slow consumer slows the producer. Kafka puts a **durable, replayable log** in the middle:

```text
Producers (apps, CDC, sensors) --> [ Kafka topic: append-only log ] --> Consumers (fraud, warehouse loader, search index)
```

Producers do not know consumers exist. Consumers read at their own speed, can be added later, and can **replay** history. It decouples systems in time and in speed.

## Core concepts

- **Broker**: a Kafka server. A **cluster** has several for scale and fault tolerance.
- **Topic**: a named stream of events, such as `payments` or `web-clicks`.
- **Partition**: a topic is split into partitions; each is an **ordered, append-only log**. Partitions give parallelism and scale.
- **Offset**: the sequential position of a message within a partition. Consumers track "I have read up to offset 1042".
- **Record**: key (optional), value (payload, often JSON/Avro), timestamp, headers.
- **Replication**: each partition has a leader and follower replicas on other brokers; if the leader dies, a follower takes over.
- **Retention**: Kafka keeps data for a configured time or size (for example 7 days) regardless of whether it was consumed. This makes replay possible.

## How producers choose a partition

If the record has a **key**, Kafka hashes the key to pick the partition, so all events with the same key land in the same partition and keep their **order**. Use `customer_id` or `account_id` as key when per-entity ordering matters (all events for account 42 in order). **Ordering is only guaranteed within a partition**, not across a topic.

## Consumers and consumer groups

```text
Topic orders: partitions P0 P1 P2 P3
Consumer group "warehouse-loader": C1 -> P0,P1   C2 -> P2,P3
Consumer group "fraud-detector":   D1 -> P0,P1,P2,P3
```

- Within a **consumer group** each partition is read by **exactly one** consumer, so adding consumers scales throughput (up to the number of partitions).
- **Different groups** each receive all messages independently. This is how the same stream feeds many applications.
- If a consumer joins or dies, Kafka **rebalances** partitions among the group.
- Extra consumers beyond the partition count sit idle: partition count caps parallelism.

## Offsets and committing

The consumer group's progress per partition is stored as a **committed offset**. After a crash the consumer resumes from the last committed offset. When you commit decides the guarantee:

| Strategy | Result |
|---|---|
| Commit **before** processing | A crash can lose messages (at-most-once) |
| Commit **after** processing | A crash can re-deliver messages (at-least-once) |
| Commit with transactional/idempotent writes | Effectively exactly-once outcome |

## A tiny conceptual model in Python

```python
log = []                            # a partition: append-only list
def produce(msg): log.append(msg); return len(log) - 1   # returns offset
offsets = {"group-a": 0}            # committed offset per consumer group
def poll(group, n=2):
    start = offsets[group]
    batch = log[start:start+n]
    return batch, start + len(batch)           # new offset to commit after processing
```

Replaying is just resetting a group's offset to 0.

## Operations you should know

- **Partition count**: choose for target throughput and consumer parallelism; increasing later changes key-to-partition mapping.
- **Replication factor** (commonly 3) and `min.insync.replicas` for durability.
- **Producer acks**: `acks=all` waits for in-sync replicas; strongest durability.
- **Compaction**: keep only the latest record per key (useful for changelog/reference topics).
- **Schema registry** with Avro/Protobuf to manage schema evolution safely.
- **Lag**: how far a consumer group is behind the latest offset; the key health metric.

## Common mistakes

- Expecting global ordering across partitions.
- Fewer partitions than consumers you want to run.
- Committing offsets before processing then losing data on failure.
- Treating Kafka as a database for ad hoc queries.
- A hot key causing one overloaded partition (skew).
- Changing message schemas without compatibility rules.

## Real-world use

A bank publishes every card authorisation to a `card-auth` topic keyed by card ID. A fraud service in one consumer group scores each event in milliseconds; a loader in another group writes micro-batches to the lake for analytics; a third group updates a customer app. Adding a new consumer next quarter needs no change to the producer.
""",
           [mcq("Where does Kafka guarantee message ordering?", ["Across the whole topic", "Within a single partition", "Across consumer groups", "Nowhere"], 1, "Only a partition is an ordered log."),
            mcq("What does a consumer group give you?", ["Encryption", "Parallel consumption where each partition is read by one consumer in the group", "Schema validation", "Compression"], 1, "It scales reads and splits partitions among consumers."),
            mcq("A topic has 4 partitions and a group has 6 consumers. What happens?", ["All six work equally", "Four consumers are active and two idle", "Kafka adds partitions", "Messages are duplicated"], 1, "Parallelism is bounded by partition count.", "intermediate"),
            mcq("What is an offset?", ["A timestamp", "The sequential position of a record within a partition", "A consumer ID", "A topic name"], 1, "Consumers track progress by offset."),
            mcq("Why use a customer_id as the message key?", ["Faster network", "Same customer events go to the same partition and stay ordered", "Smaller messages", "Required by Kafka"], 1, "Keys hash to partitions, keeping per-key order.", "intermediate")],
           [iq("Explain topics, partitions, offsets and consumer groups.", "A topic is a named stream split into partitions, each an ordered append-only log. Records in a partition have increasing offsets. Consumers in a group share partitions so each partition is read by one member; different groups read the full stream independently, tracking their own committed offsets."),
            iq("How do you scale a Kafka consumer and what limits it?", "Add consumers to the same group so partitions are divided among them. The limit is the number of partitions, so plan partition counts for peak parallelism."),
            iq("Kafka versus a traditional queue?", "Kafka is a durable, replayable log retained for a period: many independent consumer groups can read the same data and replay history. Classic queues usually delete messages once consumed and are designed for task distribution.")]),

    lesson("stream-processing", M, "Stream processing: delivery semantics, event time and watermarks", 22, "advanced", ["kafka-core", "spark-delta-patterns"],
           "Exactly-once vs at-least-once, event time vs processing time, windows, watermarks, state and a Spark Structured Streaming example.",
           r"""
## Event-driven architecture

Instead of systems calling each other and waiting, services **publish events** ("OrderPlaced", "PaymentSettled") and others react. Benefits: loose coupling, scalability, an audit log of what happened. Cost: eventual consistency, harder debugging, and the need to handle duplicates and ordering.

## Batch versus stream processing

| | Batch | Stream |
|---|---|---|
| Input | Bounded dataset | Unbounded events |
| Latency | Minutes to hours | Milliseconds to seconds |
| Complexity | Lower | Higher (state, time, late data) |
| Typical tools | Spark batch, SQL | Kafka Streams, Flink, Spark Structured Streaming |

Many designs mix them (a **lambda** style: batch for accuracy plus stream for speed; or a **kappa** style: one streaming engine and replay from the log). Modern lakehouse stacks often use the same DataFrame code for both.

## Delivery semantics

- **At-most-once**: never duplicated but may be lost (commit before processing). Acceptable for non-critical metrics.
- **At-least-once**: never lost but may be duplicated after a failure (commit after processing). The common default.
- **Exactly-once**: the *effect* is applied once. Achieved by combining at-least-once delivery with **idempotent writes** (upsert on a unique event ID) or **transactions** that atomically write results and commit offsets (Kafka transactions, Spark checkpoint + idempotent sink, Delta).

Remember the pragmatic rule: **at-least-once delivery + idempotent processing = effectively exactly-once**. True exactly-once across arbitrary external systems is hard; be precise about the boundary where it holds.

```sql
-- Idempotent sink: a replay of the same event does nothing
MERGE INTO payments t USING staged s ON t.event_id = s.event_id
WHEN NOT MATCHED THEN INSERT *;
```

## Event time versus processing time

- **Event time**: when the event actually happened (a timestamp in the payload: the customer tapped their card at 10:00:03).
- **Processing time**: when your system saw it (10:04:55 because the phone was offline in a tunnel).

Results based on processing time are wrong when events arrive late or out of order. Analytics such as "transactions per minute" must use **event time**.

## Windows

Aggregations over unbounded streams need windows:

- **Tumbling**: fixed, non-overlapping (every 5 minutes).
- **Sliding (hopping)**: overlapping (5-minute window every 1 minute).
- **Session**: grouped by activity gaps (a user's browsing session ends after 30 minutes of inactivity).

## Late data and watermarks

How long do you wait for stragglers before declaring a window complete? A **watermark** is the engine's moving estimate: "I have probably seen all events with event time older than T". Defined as *max event time seen minus an allowed lateness*. Events later than the watermark may be dropped or sent to a side output; windows older than the watermark are finalised and state can be released.

```text
allowed lateness = 10 minutes
max event time seen = 10:30  =>  watermark = 10:20
window 10:00-10:05 is closed and emitted; an event stamped 10:03 arriving now is "too late"
```

Trade-off: a longer watermark means more complete results but higher latency and memory for state.

## Stateful processing

Counting, deduplicating and joining streams need **state** (stored in memory/RocksDB and checkpointed). Checkpoints let a restarted job resume without data loss. Bound state with watermarks or TTLs, or it grows forever.

## Spark Structured Streaming example

```python
from pyspark.sql import functions as F

events = (spark.readStream.format("kafka")
          .option("kafka.bootstrap.servers", "localhost:9092")
          .option("subscribe", "payments").load()
          .select(F.from_json(F.col("value").cast("string"), schema).alias("e")).select("e.*"))

agg = (events
       .withWatermark("event_time", "10 minutes")
       .dropDuplicates(["event_id"])
       .groupBy(F.window("event_time", "5 minutes"), "merchant_id")
       .agg(F.sum("amount").alias("total")))

(agg.writeStream.format("delta")
    .outputMode("append")
    .option("checkpointLocation", "/lake/chk/payments_agg")
    .start("/lake/silver/payments_agg"))
```

Locally you can rehearse Structured Streaming with the `rate` source or a folder of JSON files; Kafka requires a broker.

## Common mistakes

- Using processing time for business metrics.
- No watermark, so state grows without bound.
- Assuming exactly-once without idempotent sinks.
- Streaming everything when hourly micro-batches would satisfy the business.
- No checkpoint location, so restarts reprocess or lose data.

## Real-world use

A bank detects suspicious card patterns: events keyed by card, event-time windows of 5 minutes, a watermark of 2 minutes to tolerate delayed mobile transactions, deduplication by transaction ID so retries do not double count, and results upserted to a serving store for the fraud team.
""",
           [mcq("What gives an effectively exactly-once result with at-least-once delivery?", ["Faster brokers", "Idempotent writes or transactions keyed by a unique event id", "More partitions", "Larger batches"], 1, "Duplicates become harmless when processing is idempotent."),
            mcq("Which time should power 'transactions per minute' reports?", ["Processing time", "Event time", "Wall clock of the dashboard", "Commit time"], 1, "Event time reflects when things actually happened.", "intermediate"),
            mcq("A watermark of 10 minutes means:", ["Windows last 10 minutes", "The engine waits up to 10 minutes of event time for late data before finalising windows", "Events are delayed by 10 minutes", "Retention is 10 minutes"], 1, "It bounds lateness tolerance and state.", "advanced"),
            mcq("Commit offsets before processing results in:", ["At-least-once", "At-most-once (possible loss)", "Exactly-once", "No delivery"], 1, "A crash after committing but before processing loses messages.", "intermediate"),
            mcq("A session window groups events by:", ["Fixed time buckets", "Gaps of inactivity", "Partition", "Key hash"], 1, "A session ends after a period without activity.", "intermediate")],
           [iq("Explain exactly-once, at-least-once and at-most-once.", "At-most-once may lose messages (commit before processing); at-least-once never loses but can duplicate (commit after processing); exactly-once means the effect is applied once, typically achieved with at-least-once delivery plus idempotent writes or transactional sinks."),
            iq("What is a watermark and why do you need it?", "A watermark tracks how far event time has progressed minus an allowed lateness, telling the engine when a window is complete so results can be emitted and state released. It balances completeness against latency and memory."),
            iq("Event time versus processing time?", "Event time is when the event occurred; processing time is when the system handled it. Business aggregations use event time to stay correct when data arrives late or out of order."),
            iq("How would you design a real-time fraud pipeline at a high level?", "Producers publish card events keyed by card to Kafka; a stream processor with event-time windows, watermarks and state scores events; deduplicate by transaction id; write results idempotently to a low-latency store and to the lake; monitor consumer lag and latency; batch jobs retrain models on history.")]),
]
