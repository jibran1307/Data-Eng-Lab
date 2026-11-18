"""Module 7: Data Orchestration."""
from ._types import iq, lesson, mcq

M = "orchestration"

LESSONS = [
    lesson("orch-why-airflow", M, "Why orchestration exists and how Airflow is structured", 16, "intermediate", ["etl-resilience-scheduling"],
           "Cron's limits, what an orchestrator adds, and the core Airflow architecture.",
           r"""
## The problem: cron is not enough

Imagine a nightly banking pipeline: extract transactions from the core system, load them to the lake, run a Spark job, rebuild warehouse tables, then refresh reports. With `cron` you can start each script at a fixed time, but:

- Step 3 must **wait** for step 2. If step 2 runs long, cron starts step 3 anyway on incomplete data.
- If step 2 fails at 02:10 nothing retries it, nobody is alerted, and downstream steps run on stale data.
- You cannot see in one place what ran, how long it took, or what failed.
- Re-running last Tuesday after a bug fix means hand-editing scripts and dates.

An **orchestrator** is the control plane for pipelines. It does not (usually) process data itself; it **decides what runs, when, in what order, and what happens on failure**.

| Capability | What it gives you |
|---|---|
| Dependencies | Task B starts only after task A succeeds |
| Scheduling | Time-based or data-arrival-based triggers |
| Retries and alerts | Automatic retry with backoff, notify on final failure |
| Backfill | Re-run past periods deterministically |
| Observability | UI with run history, durations, logs |
| Parameterisation | The same pipeline code for any date or environment |

## Orchestration vs processing

The orchestrator calls other systems: it triggers a Spark job, runs a SQL statement in the warehouse, or starts an Azure Data Factory pipeline. Keep heavy computation **out** of the orchestrator's workers. Airflow is the traffic controller, not the lorry.

## Apache Airflow architecture

Airflow is the most widely used open-source orchestrator. You define workflows as **Python code**.

- **Scheduler**: reads DAG files, decides which task instances are due, and queues them.
- **Executor / workers**: actually run tasks (local processes, Celery, Kubernetes).
- **Metadata database**: stores DAG runs, task states, variables and connections (Postgres in production, SQLite for local learning).
- **Webserver / API server (UI)**: view runs, trigger, clear and inspect logs.
- **DAG files folder**: where your Python definitions live.

```text
DAG files --> Scheduler --> Executor --> Workers --> (Spark, SQL, APIs, ADF)
                 |                          |
                 +------ Metadata DB <------+      UI reads the same DB
```

## Core vocabulary

- **DAG** (Directed Acyclic Graph): tasks plus dependency arrows with **no cycles**.
- **Task**: one unit of work; an instance of an **operator**.
- **Operator**: a template for a kind of work (`BashOperator`, `PythonOperator`, `SQLExecuteQueryOperator`, Spark/Databricks/ADF operators).
- **Task instance**: a task for one specific run.
- **DAG run**: one execution of the DAG for one **logical date / data interval**.

## Common mistakes

- Putting heavy data processing inside the Airflow worker instead of delegating.
- Treating Airflow as a data store (passing big datasets between tasks).
- Doing expensive work at DAG-file import time; the scheduler re-parses files constantly.

## Real-world use

An insurer's claims DAG: sensor waits for the claims extract on ADLS, Databricks job cleans it, a SQL task merges into the warehouse, a data-quality task checks counts, and a notification task posts to the team channel. Operations staff watch one UI instead of five servers.

> **Local vs production.** You can run Airflow locally with `pip install apache-airflow` (use the official constraints file) or Docker. Production Airflow adds Postgres, a distributed executor, secrets backend and authentication. In Azure you may instead use Azure Data Factory or Managed Airflow in Fabric.
""",
           [mcq("What is the main reason to use an orchestrator over cron?", ["Cron cannot run Python", "Dependencies, retries, alerting, backfill and run history", "Cron is paid", "Airflow runs faster"], 1, "Orchestrators coordinate dependencies and failure handling."),
            mcq("Why must a DAG be acyclic?", ["For aesthetics", "A cycle would make tasks wait for each other forever", "Python requires it", "To save memory"], 1, "A dependency cycle can never be satisfied."),
            mcq("Which component decides which tasks are due to run?", ["Webserver", "Scheduler", "Metadata DB", "Operator"], 1, "The scheduler evaluates DAGs and queues task instances.")],
           [iq("Why do data teams use an orchestrator?", "To run multi-step pipelines in the correct order with retries, alerts, scheduling, backfills and a central view of history. It coordinates work; the heavy processing is delegated to Spark, the warehouse or other engines."),
            iq("Describe Airflow's main components.", "Scheduler (decides what is due), executor/workers (run tasks), metadata database (state), webserver/UI (monitoring) and the folder of Python DAG files.")]),

    lesson("orch-dags-tasks", M, "Building DAGs: tasks, dependencies, operators, sensors and parameters", 20, "intermediate", ["orch-why-airflow", "py-etl-apis-db"],
           "Write a real DAG, wire dependencies, use sensors and templated parameters, and avoid common design traps.",
           r"""
## A minimal modern DAG (TaskFlow API)

```python
from datetime import datetime, timedelta
from airflow.decorators import dag, task

default_args = {
    "owner": "data-eng",
    "retries": 3,
    "retry_delay": timedelta(minutes=5),
    "retry_exponential_backoff": True,
}

@dag(
    dag_id="daily_sales",
    schedule="0 2 * * *",              # 02:00 every day
    start_date=datetime(2024, 1, 1),
    catchup=False,
    default_args=default_args,
    tags=["sales"],
)
def daily_sales():
    @task
    def extract(ds=None):
        # ds is the logical date as 'YYYY-MM-DD'
        return f"/lake/raw/sales/{ds}.csv"

    @task
    def transform(path: str):
        return path.replace("raw", "clean")

    @task
    def load(path: str):
        print("loading", path)

    load(transform(extract()))

daily_sales()
```

The function-call chain `load(transform(extract()))` defines dependencies **and** passes small values (file paths, counts) through XCom.

## Classic operator style and the `>>` operator

```python
from airflow import DAG
from airflow.operators.bash import BashOperator

with DAG("etl_classic", schedule="@daily", start_date=datetime(2024, 1, 1), catchup=False) as dag:
    extract = BashOperator(task_id="extract", bash_command="python extract.py --date {{ ds }}")
    transform = BashOperator(task_id="transform", bash_command="python transform.py --date {{ ds }}")
    load = BashOperator(task_id="load", bash_command="python load.py --date {{ ds }}")
    extract >> transform >> load            # extract first, then transform, then load
```

Fan-out and fan-in:

```python
extract >> [clean_a, clean_b] >> merge     # clean_a and clean_b run in parallel
```

## Templating and parameterisation

Airflow renders **Jinja templates** in operator fields. Useful variables: `{{ ds }}` (logical date), `{{ data_interval_start }}`, `{{ data_interval_end }}`, `{{ params.x }}`. Use them so each run processes **its own** partition and reruns are idempotent. Never use `datetime.now()` inside tasks for data selection; that breaks backfills.

## Sensors

A **sensor** waits for a condition before downstream work begins: a file landing, a partition appearing, an upstream DAG finishing.

```python
from airflow.sensors.filesystem import FileSensor
wait_file = FileSensor(task_id="wait_for_file", filepath="/data/in/sales_{{ ds }}.csv",
                       poke_interval=60, timeout=60*60*3, mode="reschedule")
```

`mode="reschedule"` releases the worker slot between checks, which matters when many sensors wait. Always set a `timeout`.

## Retries, timeouts and failure handling

- `retries` and `retry_delay` handle transient failures (network blips, throttling).
- `execution_timeout` stops hung tasks.
- `on_failure_callback` or email/Slack alerts notify on final failure.
- **Trigger rules** control behaviour when upstream fails: default `all_success`; `all_done` for cleanup tasks; `one_failed` for alert tasks.
- Retries only help if tasks are **idempotent** (Module 5). A retry that duplicates rows is worse than a failure.

## Scheduling, catchup and backfill

`schedule` defines cadence; the **data interval** for the run covering 2024-03-01 executes just after that interval ends (Airflow runs a period after it closes). `catchup=True` makes Airflow create runs for every missed interval since `start_date`; `False` runs only the latest. **Backfill** re-runs a historical range, for example after fixing a bug:

```bash
airflow dags backfill daily_sales -s 2024-03-01 -e 2024-03-07
```

This works cleanly only if each run reads and writes just its own date partition.

## XCom and data passing

XCom stores small values in the metadata DB. Pass **references** (paths, row counts, IDs), never DataFrames or files.

## Common mistakes

- Non-idempotent tasks plus retries and backfills creating duplicates.
- Using `datetime.now()` instead of the logical date.
- Giant monolithic tasks; split so failures can be retried at the right granularity.
- Sensors in `poke` mode without timeout, exhausting worker slots.
- Heavy imports or database calls at top level of DAG files.

## Real-world use

An e-commerce DAG: `wait_for_orders_file >> extract >> validate >> [load_fact_orders, load_dim_customer] >> run_dq_checks >> refresh_dashboard`, with an `on_failure` task messaging the on-call channel. Backfilling last week after a pricing bug is one command because every task takes the logical date as input.
""",
           [mcq("What does `extract >> transform >> load` define?", ["Parallel execution", "Run order: extract, then transform, then load", "A schedule", "A retry policy"], 1, "The bitshift operator sets downstream dependencies."),
            mcq("Why is `datetime.now()` inside a task a bad way to choose the data partition?", ["It is slow", "Reruns and backfills would read the wrong date instead of the run's logical date", "It is deprecated", "It needs a sensor"], 1, "Use the logical date so runs are reproducible.", "intermediate"),
            mcq("What is the best thing to pass through XCom?", ["Large DataFrames", "Small references such as file paths or row counts", "Passwords", "Entire files"], 1, "XCom lives in the metadata DB and is meant for small values."),
            mcq("What does `catchup=False` do?", ["Disables retries", "Skips creating runs for all missed historical intervals", "Stops the scheduler", "Removes the DAG"], 1, "Only the latest interval is scheduled; use backfill for history.", "intermediate")],
           [iq("How do you make an Airflow pipeline safe to retry and backfill?", "Make every task idempotent and parameterised by the logical date: write to a date partition with overwrite or MERGE, never use now(), keep config external, and pass references instead of data between tasks."),
            iq("What is a sensor and what are the pitfalls?", "A task that waits for a condition such as a file or partition. Pitfalls are holding worker slots in poke mode and waiting forever; use reschedule mode and a timeout."),
            iq("Explain catchup and backfill.", "Catchup creates runs for all missed intervals since start_date; backfill is an explicit command to rerun a historical range. Both depend on date-parameterised, idempotent tasks.")]),

    lesson("orch-production", M, "Running orchestration in production: monitoring, dependencies and ADF comparison", 15, "advanced", ["orch-dags-tasks"],
           "Cross-DAG dependencies, SLAs, alerting, scaling choices and how Airflow compares with Azure Data Factory and Databricks Workflows.",
           r"""
## Monitoring and alerting

A pipeline that fails silently is worse than one that fails loudly. Monitor:

- **Run status and duration**: alert if a daily DAG has not succeeded by 06:00 (an SLA / deadline alert) or its runtime doubles.
- **Task failures** after retries are exhausted: notify a human with a link to the log.
- **Data-level signals**: row-count anomalies, freshness, null spikes (see Module 10 on observability). A DAG can be green while the data is wrong, so add data-quality tasks.
- **Platform health**: scheduler heartbeat, queued tasks, worker utilisation.

Send alerts to where people work (email, Teams, Slack, PagerDuty) and keep them actionable: which DAG, which date, what failed, where the log is. Too many noisy alerts get ignored.

## Dependencies between workflows

Options when pipeline B needs the output of pipeline A:

1. **One DAG**: simplest if one team owns both.
2. **Sensor on the upstream task or dataset**: `ExternalTaskSensor`.
3. **Dataset-aware scheduling** (Airflow datasets/assets): B runs when A *updates* a dataset, rather than at a guessed time. This removes brittle "start B at 03:00 and hope A finished".
4. **Trigger**: `TriggerDagRunOperator` explicitly starts another DAG.

Prefer **data-driven** triggers over clock-time guesses.

## Handling failure properly

```text
Task fails -> retry (transient?) -> still failing -> alert + stop downstream
   -> engineer fixes root cause -> clear task (rerun failed task only) -> downstream resumes
```

Because tasks are idempotent you can safely **clear** the failed task or the failed range. Quarantine bad records rather than failing the entire pipeline when only a few rows are invalid (a design choice to agree with the business).

## Scaling and execution choices

- **LocalExecutor**: one machine, fine for learning and small teams.
- **CeleryExecutor**: pool of workers.
- **KubernetesExecutor**: one pod per task; elastic and isolated, more operational complexity.
- Keep tasks small and delegate heavy compute to Spark/Databricks/warehouse.
- Store credentials in a **secrets backend** (Key Vault, Vault), not in DAG code.

## Orchestrator comparison

| Tool | Strengths | Typical fit |
|---|---|---|
| Apache Airflow | Code-first Python, huge operator ecosystem, flexible | Teams wanting full control, multi-cloud |
| Azure Data Factory | Managed, low-code UI, 100+ connectors, native Azure integration | Azure-centric ingestion and orchestration |
| Databricks Workflows | Native to Databricks jobs and notebooks | Pipelines mostly inside Databricks |
| Dagster / Prefect | Modern asset-centric / Pythonic alternatives | Teams valuing local dev and typed assets |

Concepts you learn here (DAG, dependencies, triggers, retries, backfill, parameters, idempotency) carry over to ADF pipelines, triggers and activities (Module 8).

## Testing DAGs

- **Import test**: every DAG file imports without error and has no cycles.
- **Unit tests** on the Python functions inside tasks.
- Keep transformation logic in plain modules that tests can call without Airflow.

```python
def test_dags_import():
    from airflow.models import DagBag
    bag = DagBag(include_examples=False)
    assert not bag.import_errors
```

## Common mistakes

- Relying on schedule times instead of data-ready signals.
- Green DAG, bad data: no quality checks.
- Credentials in code or in Variables as plain text.
- One huge DAG nobody can reason about; split by domain and ownership.

## Real-world use

A bank's overnight chain: ingestion DAG (ADF copy to ADLS) updates a dataset; the transformation DAG (Databricks) is triggered by that update; the warehouse-load DAG follows; an SLA alert fires if the regulatory report table is not fresh by 07:00. Engineers on call receive a message with the failing task and log link.
""",
           [mcq("Why prefer dataset-aware triggers over a fixed start time for a dependent DAG?", ["They are cheaper", "They run when upstream data is actually ready, not when you guess", "They avoid Python", "They disable retries"], 1, "Data-driven triggers remove timing guesswork."),
            mcq("A DAG run is green but the output table is empty. What was missing?", ["More retries", "Data-quality checks and freshness/volume monitoring", "A larger executor", "A sensor"], 1, "Task success does not guarantee correct data.", "intermediate"),
            mcq("Where should database passwords for tasks live?", ["Hard-coded in the DAG", "A secrets backend such as Key Vault", "In the Git repository", "In XCom"], 1, "Use a managed secrets store."),
            mcq("Which tool is the Azure-native managed orchestrator with a visual designer?", ["Airflow", "Azure Data Factory", "Kafka", "Pandas"], 1, "ADF is Azure's managed integration and orchestration service.")],
           [iq("How would you monitor a production Airflow environment?", "Alert on failed tasks after retries and on missed SLAs, track durations for regressions, add data-quality and freshness checks, watch scheduler and worker health, and route actionable alerts to the on-call channel."),
            iq("Airflow versus Azure Data Factory?", "Airflow is code-first and flexible with a rich operator ecosystem and works across clouds. ADF is a managed, low-code Azure service with native connectors, strong for ingestion and orchestration inside Azure. Many teams use ADF for movement and Databricks/Airflow for complex logic; the concepts of dependencies, triggers, retries and idempotency are common.")]),
]
