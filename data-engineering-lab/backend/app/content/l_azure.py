"""Module 8: Cloud Data Engineering - Azure.

Every lesson separates: concept / local practice / cloud implementation / enterprise production.
Azure services are NOT executable inside this app.
"""
from ._types import iq, lesson, mcq

M = "azure"

LESSONS = [
    lesson("az-cloud-basics", M, "Cloud fundamentals and the Azure data platform map", 16, "beginner", ["de-lakes-warehouses"],
           "IaaS/PaaS/SaaS, regions, resource groups, and a map of which Azure service does what in a data platform.",
           r"""
> **How to read this module.** Azure services run in Microsoft's cloud and need an account. This app cannot run them. Each lesson marks four layers: **Concept** (what and why), **Local practice** (what you can rehearse offline), **Cloud implementation** (what you would click/script in Azure) and **Enterprise production** (what real companies add). Do not confuse understanding with having deployed.

## What "the cloud" really is

Instead of buying servers, you rent compute, storage and managed services by usage. Benefits: elasticity (scale up for month-end, down afterwards), no hardware lead time, managed reliability. Costs: you pay continuously, so idle clusters and careless queries are expensive; and you must design security and governance deliberately.

## IaaS, PaaS, SaaS

| Model | You manage | Provider manages | Data example |
|---|---|---|---|
| IaaS | OS, runtime, apps, data | Hardware, virtualisation | A virtual machine running your own Kafka |
| PaaS | Your code and data | OS, patching, scaling | Azure SQL Database, Data Factory, Databricks |
| SaaS | Just use it | Everything | Power BI, Microsoft Fabric experiences |

Data engineers mostly work with **PaaS**: you focus on pipelines and data, not on patching servers.

## Azure structure you must know

- **Tenant** (Microsoft Entra ID): your organisation's identity directory.
- **Subscription**: billing and access boundary.
- **Resource group**: a logical folder of related resources (for example `rg-sales-analytics-prod`) that share a lifecycle.
- **Region**: physical location (for example West Europe). Keep storage and compute in the **same region** to avoid latency and egress fees; consider data residency rules.
- **Resource**: a concrete service instance (a storage account, a Data Factory).

## The Azure data platform map

| Need | Service | One-line purpose |
|---|---|---|
| Cheap scalable file storage | **ADLS Gen2** | Data lake on Blob storage with hierarchical namespace |
| Move and orchestrate data | **Azure Data Factory (ADF)** | Managed pipelines, connectors, triggers |
| Big data processing | **Azure Databricks** | Managed Spark plus Delta Lake and notebooks |
| Analytics warehouse | **Azure Synapse Analytics** | SQL pools/serverless SQL, Spark, pipelines |
| Unified SaaS analytics | **Microsoft Fabric** | OneLake, lakehouse, warehouse, pipelines and Power BI in one product |
| Operational relational DB | **Azure SQL Database** | Managed SQL Server for applications |
| Secrets | **Key Vault** | Store secrets, keys and certificates |
| Observability | **Azure Monitor / Log Analytics** | Metrics, logs, alerts |
| Streaming ingestion | **Event Hubs** | Kafka-compatible event ingestion |
| Identity and access | **Microsoft Entra ID + RBAC** | Who can do what |

## How they fit together (preview)

```text
Sources --> ADF (copy/orchestrate) --> ADLS Gen2 (raw)
                                         |
                              Databricks (Spark transform)
                                         |
                              ADLS (curated) --> Synapse / Fabric (serve) --> Power BI
   Key Vault: secrets      Monitor: logs/alerts      Entra ID + RBAC: access
```

You will walk each hop in the following lessons.

## Layers: concept vs doing

- **Concept**: you can explain every box above and why it exists.
- **Local practice**: Python, SQL, PySpark (installed locally) and Docker let you rehearse the same logic (Parquet, Delta-like patterns, DAGs).
- **Cloud implementation**: creating the resources in the Azure portal, CLI, Bicep or Terraform. A free trial or sandbox is needed.
- **Enterprise production**: networking (private endpoints), policies, CI/CD, cost governance, disaster recovery.

## Common mistakes

- Treating cloud services as magic rather than understanding the underlying storage/compute split.
- Different regions for storage and compute.
- No resource-group/naming convention, leading to unmanageable estates.
- Leaving clusters running, causing surprise bills.

## Real-world use

A retail bank moves from an on-premises SQL Server warehouse to Azure: files land in ADLS, ADF orchestrates, Databricks transforms, Synapse serves reports. Understanding the map lets you reason about which service to choose rather than memorising portal screens.
""",
           [mcq("Azure Data Factory is best classified as:", ["IaaS", "PaaS", "SaaS only", "Hardware"], 1, "It is a managed platform service; you do not manage servers."),
            mcq("Why keep storage and compute in the same region?", ["Looks tidy", "Lower latency and no cross-region transfer cost", "Required by SQL", "To use Key Vault"], 1, "Cross-region data movement costs time and money."),
            mcq("Which Azure service is the data lake storage layer?", ["Azure Monitor", "ADLS Gen2", "Event Hubs", "Key Vault"], 1, "ADLS Gen2 provides lake storage with a hierarchical namespace."),
            mcq("A resource group is:", ["A billing account", "A logical container for related resources sharing a lifecycle", "A virtual network", "A region"], 1, "It groups resources for management and access.")],
           [iq("Explain IaaS, PaaS and SaaS with data examples.", "IaaS gives virtual machines you manage fully (self-hosted Kafka on a VM). PaaS manages the platform so you manage code and data (Azure SQL, ADF, Databricks). SaaS is a finished application (Power BI)."),
            iq("Give an end-to-end Azure data platform in one minute.", "Sources are ingested by Data Factory into ADLS Gen2 raw zone, Databricks transforms into curated Delta/Parquet, Synapse or Fabric serves the modelled data to Power BI, with Key Vault for secrets, Entra ID RBAC for access and Azure Monitor for logging and alerts.")]),

    lesson("az-adls-adf", M, "ADLS Gen2 and Azure Data Factory in depth", 22, "intermediate", ["az-cloud-basics", "etl-load-incremental-cdc", "orch-dags-tasks"],
           "How the lake is organised and secured, and how Data Factory pipelines, linked services, datasets, triggers and Copy Activity work together.",
           r"""
## Azure Data Lake Storage Gen2

**What it is.** A storage account with the **hierarchical namespace** enabled: Blob storage's scale and price plus real directories, POSIX-style ACLs and fast atomic rename.

**Why it exists.** Analytics engines (Spark, Synapse) work on folders of files. Plain object stores fake directories, so renaming a "folder" meant copying every object. Hierarchical namespace makes directory operations fast and enables fine-grained security.

**Problem it solves.** One cheap, scalable, secure place to land raw data in any format before it is modelled.

**Structure.**

```text
storage account: stsalesprod
  container: raw       -> /crm/customers/ingest_date=2024-03-01/part-0001.parquet
  container: curated   -> /sales/orders/order_date=2024-03-01/...
  container: serving   -> /gold/daily_revenue/
```

Containers typically map to **medallion zones** (bronze/raw, silver/cleansed, gold/curated). Partition folders (`ingest_date=...`) enable partition pruning.

**Access.** Address it as `abfss://curated@stsalesprod.dfs.core.windows.net/sales/orders/`. Secure with:

- **Azure RBAC** (for example Storage Blob Data Contributor) for broad access.
- **ACLs** for folder-level control.
- **Managed identities** so ADF/Databricks authenticate without passwords.
- Private endpoints and firewalls to keep traffic off the public internet (enterprise).

**When to use.** Whenever you need a data lake: raw landing, ML data, Delta tables.

## Azure Data Factory (ADF)

**What it is.** A managed, serverless data integration and orchestration service with a visual designer and 100+ connectors.

**Why it exists.** Moving data between systems and sequencing steps is repetitive. ADF provides connectors, scheduling, monitoring and scaling without servers.

**Problem it solves.** Reliable, scheduled movement of data from many sources (on-prem SQL Server, SaaS apps, files, APIs) into the lake or warehouse, plus orchestration of Databricks/SQL steps.

### The building blocks

| Concept | Meaning | Analogy |
|---|---|---|
| **Linked service** | Connection definition to a system (credentials, endpoint) | A saved connection string |
| **Dataset** | Named view of data inside a linked service (a table, a folder, a file pattern) | "This table" or "this folder" |
| **Activity** | One step: Copy, Data Flow, Databricks notebook, Stored procedure, Web, Lookup, ForEach | A task |
| **Pipeline** | A group of activities with dependencies | A DAG |
| **Trigger** | What starts a pipeline: schedule, tumbling window, storage event, manual | Scheduler |
| **Integration Runtime (IR)** | The compute that executes movement and dispatch | The worker |
| **Parameters / variables** | Make pipelines reusable by date or table name | Airflow params |

**Integration Runtime types.** *Azure IR* (managed, cloud-to-cloud), *Self-hosted IR* (installed on a VM/on-prem machine so ADF can reach private networks such as a bank's internal SQL Server), *Azure-SSIS IR* (lift-and-shift SSIS packages).

**Triggers.** *Schedule* (cron-like), *Tumbling window* (fixed, non-overlapping, supports backfill and dependencies, retries per window; the closest ADF equivalent of Airflow data intervals), *Event-based* (file arrives in storage), *Manual / API*.

### Copy Activity

The workhorse. Source dataset -> sink dataset, with parallelism, format conversion (CSV to Parquet), column mapping and optional staging. Pattern for an incremental load:

```text
Lookup(old watermark) -> Lookup(new watermark) -> Copy(WHERE modified > old AND <= new)
   -> Stored procedure(update watermark)
```

Parameterise by table to loop with **ForEach** over a metadata table and ingest hundreds of tables with one pipeline (a metadata-driven framework).

### Mapping Data Flows

Visual, code-free Spark-based transformations (joins, aggregations, derived columns, SCD-style upserts) executed on managed Spark clusters that ADF provisions. Good for simple-to-moderate transformations by teams that prefer low-code. For heavy or complex logic many teams use Databricks instead.

### Orchestrating other services

ADF can run a Databricks notebook, call a stored procedure, invoke an Azure Function or hit a REST endpoint, with success/failure/completion dependency arrows (equivalent to Airflow trigger rules).

## How ADF and ADLS interact

1. ADF authenticates to ADLS using its **managed identity** (granted Storage Blob Data Contributor on the container) or a Key Vault-held secret.
2. A linked service points to the storage account; datasets point to folders/files.
3. Copy Activity reads from the source and **writes files into ADLS** (often Parquet, partitioned by ingest date).
4. A downstream activity (Databricks notebook or Data Flow) reads those files from ADLS.

## Layers

- **Concept**: linked service -> dataset -> activity -> pipeline -> trigger; IR does the work.
- **Local practice**: write the same logic in Python/SQL: watermark table, incremental extract, partitioned Parquet output. See Module 5.
- **Cloud implementation**: author in ADF Studio or deploy JSON via CI/CD; connect to a free-tier or sandbox subscription.
- **Enterprise production**: git-integrated ADF, separate dev/test/prod factories, CI/CD, self-hosted IR in the corporate network, alerts via Azure Monitor, parameterised metadata-driven ingestion.

## Common mistakes

- Embedding passwords in linked services instead of Key Vault or managed identity.
- One pipeline per table instead of a parameterised, metadata-driven pipeline.
- Running everything in Data Flows when heavy logic suits Databricks.
- Not partitioning landed files, causing slow downstream reads.
- Full reloads of huge tables where incremental would do.

## Real-world use

An insurer ingests policy data nightly: a self-hosted IR reaches the on-premises policy database, a metadata-driven pipeline copies 150 tables as Parquet into `raw/policy/ingest_date=...` in ADLS, then triggers a Databricks job. Tumbling window triggers allow reprocessing a missed night.
""",
           [mcq("What does the hierarchical namespace in ADLS Gen2 provide?", ["Cheaper compute", "Real directories, ACLs and fast atomic rename", "SQL queries", "Streaming"], 1, "It turns flat blob storage into a file-system-like structure suited to analytics."),
            mcq("In Data Factory, which object stores connection information to a system?", ["Dataset", "Linked service", "Trigger", "Pipeline"], 1, "A linked service defines the connection; datasets point to data within it."),
            mcq("You need ADF to read a bank's on-premises SQL Server inside a private network. You use:", ["Azure IR", "Self-hosted Integration Runtime", "Key Vault", "Event Hubs"], 1, "A self-hosted IR runs inside the private network.", "intermediate"),
            mcq("Which trigger type best supports windowed backfills with dependencies?", ["Manual", "Tumbling window", "Event", "None"], 1, "Tumbling windows are non-overlapping intervals with retry and dependency support.", "intermediate"),
            mcq("How should ADF authenticate to ADLS without storing a password?", ["Account key in the pipeline", "Managed identity with an RBAC role", "Anonymous access", "Shared Excel"], 1, "Managed identities remove secrets from configuration.", "intermediate")],
           [iq("Explain linked service, dataset, activity, pipeline and trigger.", "A linked service is a connection to a system; a dataset describes the data within it; an activity is one step such as Copy; a pipeline groups activities with dependencies; a trigger starts a pipeline on a schedule, window or event. The Integration Runtime provides the compute."),
            iq("How would you ingest 200 tables incrementally with ADF?", "Build one metadata-driven pipeline: a control table lists source tables, keys and watermark columns; Lookup reads it, ForEach iterates, Copy Activity extracts rows newer than the stored watermark into partitioned Parquet in ADLS, and a stored procedure updates the watermark. Parameterise everything and add retries and alerts."),
            iq("ADF Mapping Data Flows versus Databricks?", "Data Flows are low-code Spark transformations managed by ADF, good for simple to moderate logic. Databricks offers full code control, notebooks, Delta, ML and better tuning for complex or heavy workloads.")]),

    lesson("az-databricks-synapse-fabric", M, "Databricks, Synapse Analytics and Microsoft Fabric", 22, "advanced", ["az-adls-adf", "spark-delta-patterns", "dw-architecture"],
           "How Databricks processes lake data, where Synapse and Fabric fit as the serving layer, and how to choose between them.",
           r"""
## Azure Databricks

**What it is.** A managed Apache Spark platform (built by the creators of Spark) integrated with Azure, with notebooks, jobs, Delta Lake, Unity Catalog governance and ML tooling.

**Why it exists.** Running your own Spark cluster means installing, patching, tuning and scaling it. Databricks provides ephemeral, auto-scaling clusters and a collaborative workspace.

**Problem it solves.** Large-scale transformation of lake data with Python/SQL/Scala, with ACID tables (Delta) and production job scheduling.

**How it processes data in the lake.**

1. A **cluster** (driver + workers, from Module 6) starts, usually via a job that terminates it when done.
2. Cluster identity is granted access to ADLS (managed identity / service principal, secrets in Key Vault-backed secret scopes).
3. Notebook or job reads `abfss://raw@...` Parquet/JSON into DataFrames. Compute and storage are **separate**: data stays in ADLS; the cluster only reads it.
4. Transformations run distributed across executors; results are written back as **Delta tables** in `curated`.
5. The cluster shuts down; you stop paying for compute while the data remains.

```python
raw = spark.read.json("abfss://raw@stsalesprod.dfs.core.windows.net/orders/ingest_date=2024-03-01/")
clean = (raw.dropDuplicates(["order_id"])
            .filter("amount > 0")
            .withColumn("order_date", F.to_date("order_ts")))
clean.write.format("delta").mode("append").partitionBy("order_date") \
     .save("abfss://curated@stsalesprod.dfs.core.windows.net/sales/orders/")
```

**Key features.** Job clusters (cheap, ephemeral) versus all-purpose clusters (interactive), **Delta Live Tables** (declarative pipelines), **Workflows** (orchestration), **Unity Catalog** (central governance, lineage, access control), **Auto Loader** (incrementally ingest new files).

**When to use.** Heavy transformations, large volumes, complex Python logic, streaming, ML feature engineering, lakehouse architectures.

## Azure Synapse Analytics

**What it is.** An integrated analytics service combining: **dedicated SQL pool** (provisioned MPP warehouse), **serverless SQL pool** (query files in the lake with T-SQL, pay per data scanned), **Spark pools**, and **Synapse pipelines** (ADF-like).

**Why it exists.** To give SQL-centric teams a scalable warehouse and lake-query engine under one workspace.

**Problem it solves.** Fast SQL analytics for reporting over modelled data, and ad-hoc SQL over lake files without loading them.

**Dedicated pool design points.** Data is distributed across 60 distributions; choose **hash** distribution for large fact tables on a join key, **round robin** for staging, **replicated** for small dimensions; use **clustered columnstore** indexes for analytics; avoid data skew.

**When to use.** Existing Synapse estates, T-SQL warehouse workloads, serverless SQL for lake exploration. Microsoft positions Fabric as the strategic evolution for new analytics projects.

## Microsoft Fabric (overview)

**What it is.** A SaaS analytics platform unifying data engineering, warehouse, real-time analytics, data science and Power BI on **OneLake**, a single logical lake built on ADLS Gen2 where tables are stored in Delta format.

**Why it exists.** To reduce stitching together separate services, duplicated copies and separate security models.

**Key ideas.** One copy of data in OneLake; **Lakehouse** (Spark + Delta files), **Warehouse** (T-SQL), **Data Factory in Fabric** (pipelines), **Shortcuts** (reference external storage without copying) and tight Power BI integration (Direct Lake mode reads Delta files directly).

**When to use.** New Microsoft-centric analytics programmes wanting a unified, capacity-based SaaS experience.

## Choosing between them

| Situation | Typical choice |
|---|---|
| Complex transformations, big data, ML | Databricks |
| T-SQL warehouse, existing Synapse investments | Synapse dedicated/serverless SQL |
| New unified analytics with Power BI | Fabric |
| Simple ingestion/orchestration | ADF (or Fabric pipelines) |
| Applications' OLTP database | Azure SQL Database (not an analytics warehouse) |

Many enterprises combine them: **ADF + ADLS + Databricks + Synapse/Fabric**. This pairing is the architecture you will design in Project 7.

## Azure SQL Database

A managed relational (OLTP) database based on SQL Server. It serves applications with transactions. In data engineering it is usually a **source** to ingest from or a small serving store; large analytics belongs in a warehouse or lakehouse. Features: automatic backups, elastic pools, geo-replication, Entra ID authentication.

## Layers

- **Concept**: separation of storage (ADLS) and compute (Databricks/Synapse); Delta for ACID tables; serving layer for BI.
- **Local practice**: run PySpark locally, write Parquet/partitions, use DuckDB for warehouse-style SQL (Modules 1 and 6).
- **Cloud implementation**: provision workspace, cluster policies, mount/credential-pass-through to ADLS, jobs.
- **Enterprise production**: Unity Catalog governance, private networking, cluster policies for cost control, CI/CD with asset bundles, monitoring and cost allocation.

## Common mistakes

- Using all-purpose clusters for scheduled jobs (costly); prefer job clusters.
- Using Azure SQL Database as the analytics warehouse for terabytes.
- Poor distribution choices in Synapse dedicated pools causing data movement.
- Treating Fabric and Synapse as identical; the operating and licensing models differ.
- No governance; every team creates its own copy of the data.

## Real-world use

A retailer lands clickstream and order data in ADLS, runs Databricks job clusters nightly to produce Delta gold tables, and Fabric/Synapse exposes star-schema views to Power BI. Compute for the transformation exists for 40 minutes per night; storage persists cheaply.
""",
           [mcq("Why can Databricks clusters be terminated without losing data?", ["Data is copied to the driver", "Storage is separate in ADLS; the cluster is only compute", "Spark caches permanently", "Clusters are never terminated"], 1, "Separation of storage and compute is a core cloud data principle."),
            mcq("For a large fact table joined often on customer_id in a Synapse dedicated pool you would choose:", ["Round-robin", "Hash distribution on customer_id", "Replicated", "No distribution"], 1, "Hash distribution co-locates matching keys and reduces data movement.", "advanced"),
            mcq("OneLake in Microsoft Fabric is:", ["A BI tool", "A single logical data lake for the organisation, storing tables as Delta", "A message broker", "A VM"], 1, "OneLake underpins Fabric items with one copy of data."),
            mcq("Azure SQL Database is primarily:", ["A data lake", "A managed OLTP relational database", "A streaming service", "An orchestrator"], 1, "It serves transactional applications and is often a source system."),
            mcq("For a nightly scheduled Spark transformation the cost-effective choice is:", ["Always-on all-purpose cluster", "Job cluster that terminates after the run", "A VM with manual start", "Excel"], 1, "Ephemeral job clusters avoid paying for idle compute.", "intermediate")],
           [iq("How does Databricks process data stored in ADLS?", "The cluster gets access through managed identity or service principal, reads files with abfss:// paths into distributed DataFrames, transforms them on executors and writes results (typically Delta) back to ADLS. Compute and storage are decoupled, so the cluster can be terminated after the job."),
            iq("Synapse versus Fabric versus Databricks?", "Databricks excels at code-heavy lakehouse processing and ML. Synapse offers SQL pools and serverless SQL plus Spark and pipelines. Fabric is the unified SaaS evolution with OneLake and Power BI integration. Choice depends on skills, existing estate, workload and governance needs."),
            iq("What are Synapse dedicated pool distribution types?", "Hash for large facts on a join key, round robin for even loading of staging data, replicated for small dimensions copied to every node.")]),

    lesson("az-security-monitoring-architecture", M, "Security, Key Vault, monitoring and a reference Azure architecture", 20, "advanced", ["az-databricks-synapse-fabric", "de-governance-basics"],
           "Entra ID and RBAC, managed identities, Key Vault, Azure Monitor, and how every service connects in an end-to-end design.",
           r"""
## Identity and access management

- **Microsoft Entra ID** (formerly Azure AD): identities for users, groups, service principals and managed identities.
- **RBAC**: roles assigned at a scope (subscription, resource group, resource). Example: *Storage Blob Data Reader* on the `curated` container.
- **Managed identity**: an identity automatically managed for an Azure resource (ADF, Databricks, Functions). No passwords, no rotation work.
- **Least privilege**: grant only the role needed at the narrowest scope; use **groups** not individuals.
- **ACLs** in ADLS give folder-level control beyond RBAC.

## Azure Key Vault

**What it is.** A managed vault for secrets (passwords, connection strings), keys and certificates.

**Why it exists.** Secrets in code, config files or pipelines leak through repositories, logs and screenshots.

**How it works.** Applications authenticate with a managed identity, request a secret, and Key Vault checks access policies/RBAC and logs the access. ADF linked services and Databricks secret scopes can reference Key Vault so the secret never appears in pipeline JSON.

```text
ADF linked service --(managed identity)--> Key Vault --> secret "sql-password"
        |                                                      |
        +-------- uses the value at runtime, never stores it --+
```

**Good practice.** Separate vaults per environment, soft-delete and purge protection, secret rotation, access audit logs.

## Network security (enterprise)

- Private endpoints so storage/SQL are reachable only inside your virtual network.
- Firewalls and service endpoints, disable public access.
- Encryption at rest (default, optionally customer-managed keys) and in transit (TLS 1.2+).

## Monitoring and observability

- **Azure Monitor** collects metrics and logs; **Log Analytics** stores logs queried with KQL.
- ADF has run monitoring, activity-level durations and alerts; Databricks has job run pages and Spark UI; Synapse has query monitoring.
- **Alerts**: pipeline failed, duration above threshold, storage cost spike, missing data freshness.
- **Diagnostic settings** route service logs to Log Analytics.

```kusto
ADFPipelineRun
| where Status == "Failed" and TimeGenerated > ago(1d)
| project PipelineName, RunId, TimeGenerated, FailureType
```

Combine platform monitoring with data-quality monitoring (row counts, freshness, null rates) because a successful run can still deliver bad data.

## Reference architecture: daily sales analytics

```text
  On-prem SQL / SaaS / files
            |  (self-hosted IR / connectors)
            v
   ADF pipeline (tumbling window trigger, parameterised)
            |  Copy Activity -> Parquet
            v
   ADLS Gen2: raw (bronze)  -----------------+
            |                                |
            v                                |
   Databricks job (PySpark, Delta MERGE)     |  Key Vault (secrets)
            |                                |  Entra ID / RBAC / managed identity
            v                                |  Azure Monitor + Log Analytics alerts
   ADLS Gen2: silver -> gold (Delta)  -------+
            |
            v
   Synapse serverless/dedicated SQL or Fabric Warehouse (star schema)
            |
            v
   Power BI dashboards (daily revenue, customer analytics)
```

### Data flow walkthrough

1. 01:00 tumbling-window trigger starts the ADF pipeline for the previous day's window.
2. Copy Activity extracts changed rows (watermark) and writes Parquet to `raw/sales/ingest_date=D`.
3. ADF calls a Databricks job; cluster reads raw, dedupes, validates, quarantines bad rows, MERGEs into silver Delta, builds gold aggregates.
4. A quality task compares counts to source; failure raises an alert and stops publication.
5. Synapse/Fabric exposes gold as star-schema tables; Power BI refreshes.
6. Monitor tracks durations and failures; Key Vault supplies secrets; RBAC restricts who sees PII.

### Service interaction summary

| From | To | How they connect |
|---|---|---|
| ADF | ADLS | Linked service with managed identity; Copy writes files |
| ADF | Databricks | Databricks activity runs job/notebook |
| Databricks | ADLS | abfss:// path, identity-based access |
| Databricks/ADF | Key Vault | Secret references via identity |
| Synapse/Fabric | ADLS/OneLake | Reads curated Delta/Parquet or loads into warehouse tables |
| Power BI | Synapse/Fabric | Import or DirectQuery/Direct Lake |
| All | Azure Monitor | Diagnostic logs and alerts |

## Layers (be honest about what you have done)

- **Concept**: you can draw and explain this architecture and justify each service.
- **Local practice**: replicate the logic with Python + PySpark + DuckDB + Airflow on your laptop with folders standing in for ADLS zones.
- **Cloud implementation**: requires an Azure subscription, resource creation and costs; do a small supervised lab if you want hands-on credibility.
- **Enterprise production**: private networking, governance (Purview/Unity Catalog), CI/CD, DR, cost management, on-call processes.

In interviews, say clearly which of these you have done. Strong candidates explain the design and trade-offs, and are honest about their hands-on depth.

## Common mistakes

- Secrets in ADF JSON or notebooks.
- Granting Owner/Contributor broadly for convenience.
- Public endpoints on storage holding PII.
- No alerting, so failures are discovered by business users.
- Designing without cost awareness (always-on clusters, full reloads).

## Real-world use

A bank's compliance team requires that PII columns be visible only to a privileged group. Unity Catalog column masks plus RBAC enforce it; Key Vault holds the database credentials; Log Analytics keeps access audit trails for 12 months for regulators.
""",
           [mcq("A managed identity helps because:", ["It is faster", "Azure resources authenticate without stored passwords or rotation", "It encrypts data", "It replaces RBAC"], 1, "No secret to store or leak."),
            mcq("Where should an ADF linked service obtain a database password?", ["Hard-coded text", "Key Vault reference", "A CSV file", "A pipeline comment"], 1, "Reference Key Vault so the secret is not in the pipeline definition."),
            mcq("A pipeline run is green but yesterday's data is missing. What should be added?", ["More clusters", "Data freshness and row-count quality checks with alerts", "A new region", "Sensors only"], 1, "Platform success is not data correctness.", "intermediate"),
            mcq("Least privilege means:", ["Everyone is Owner", "Grant only the minimum role at the narrowest scope", "No access at all", "Shared passwords"], 1, "Limit blast radius."),
            mcq("In the reference architecture, which service holds raw, silver and gold files?", ["Key Vault", "ADLS Gen2", "Power BI", "Azure Monitor"], 1, "ADLS Gen2 is the lake storage.")],
           [iq("Walk me through an end-to-end Azure data architecture.", "Sources are copied by ADF (self-hosted IR if on-prem) into the ADLS raw zone. Databricks reads raw, cleans, deduplicates, validates and writes Delta silver and gold. Synapse or Fabric serves star-schema tables to Power BI. Key Vault stores secrets, managed identities and RBAC control access, and Azure Monitor tracks runs and alerts. Triggers use tumbling windows with parameterised, idempotent pipelines."),
            iq("How do you secure an Azure data platform?", "Entra ID with groups and least-privilege RBAC, managed identities instead of passwords, Key Vault for secrets, private endpoints and disabled public access, encryption at rest and in transit, column-level protection for PII and audit logging with Azure Monitor."),
            iq("How do you handle the limits of your cloud experience in an interview?", "State clearly which parts you have implemented, which you have practised locally and which you understand conceptually, then show you can reason about design and trade-offs; honesty builds more trust than overclaiming.")]),
]
