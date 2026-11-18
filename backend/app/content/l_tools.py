"""Module 10: Data Engineering Tools and Engineering Practices."""
from ._types import iq, lesson, mcq

M = "tools"

LESSONS = [
    lesson("tools-git-linux", M, "Git, GitHub and the Linux command line", 20, "beginner", [],
           "Version control workflow, branching and pull requests, and the shell commands you use daily on servers and in CI.",
           r"""
## Why version control is non-negotiable

Pipelines are code: SQL, Python, DAGs, infrastructure definitions. Git records every change, lets teams work in parallel, lets you roll back a bad deploy and provides the audit trail regulators ask for. If it is not in Git, it does not exist.

## Git mental model

```text
working directory --git add--> staging area --git commit--> local repo --git push--> remote (GitHub)
```

A **commit** is a snapshot with a message. A **branch** is a movable pointer to a commit. A **remote** is a shared copy.

```bash
git clone https://github.com/acme/pipelines.git
git switch -c feature/dedupe-orders          # new branch
git add etl/dedupe.py tests/test_dedupe.py   # stage specific files
git commit -m "Deduplicate orders by latest updated_at"
git push -u origin feature/dedupe-orders     # then open a Pull Request
git pull --rebase origin main                # bring in others' work
git log --oneline --graph -10
git diff                                     # unstaged changes
git restore path/file.py                     # discard local edits
git revert <commit>                          # safe undo (new commit)
```

## Team workflow

1. Branch from `main`, make small focused commits.
2. Push and open a **pull request (PR)**; CI runs tests and linters automatically.
3. A teammate reviews; you address comments.
4. Merge (squash or merge commit); delete the branch; CD deploys.

**Merge conflicts** happen when two branches change the same lines. Git marks the file (`<<<<<<<`, `=======`, `>>>>>>>`); you choose the right content, `git add`, and continue.

Good habits: meaningful messages, small PRs, never commit secrets or large data files, use `.gitignore` for `.env`, virtual environments, data and logs, never force-push shared branches.

## Linux command line essentials

Data engineers work on Linux servers, containers and CI runners, so the shell is a daily tool.

```bash
pwd; ls -lah; cd /data/raw            # where am I, what is here
cat file.csv | head -5                # peek
wc -l big.csv                         # row count
grep -i "error" app.log | tail -20    # search logs
grep -c "FAILED" run.log              # count matches
cut -d, -f1,3 sales.csv | sort | uniq -c | sort -nr | head
awk -F, '{sum+=$4} END {print sum}' sales.csv
find /data -name "*.parquet" -mtime -1   # modified in last day
du -sh /data/*; df -h                 # disk usage
chmod 600 secrets.env                 # restrict permissions
tail -f pipeline.log                  # follow a log live
ps aux | grep python; kill <pid>
export RUN_DATE=2024-03-01            # environment variable
crontab -e                            # schedule (see Module 5/7)
```

Key ideas: **pipes** (`|`) send one command's output to the next; **redirection** (`>`, `>>`, `2>&1`) captures output; **permissions** (`rwx` for user/group/other) protect files; **exit codes** (`echo $?`: 0 success, non-zero failure) are how schedulers and CI know a step failed.

A safe bash script header:

```bash
#!/usr/bin/env bash
set -euo pipefail    # stop on error, undefined variable, or failed pipe stage
```

## Common mistakes

- Committing credentials or a 2 GB dataset.
- Working directly on `main`.
- `git add .` without checking `git status`.
- Running destructive commands (`rm -rf`) with unchecked variables.
- Scripts that continue after an error because `set -e` is missing.

## Real-world use

An engineer fixes a currency-conversion bug on a branch, adds a regression test, opens a PR. CI runs unit tests; a reviewer approves; merge triggers deployment of the updated DAG. If the release misbehaves, `git revert` restores the previous behaviour in minutes and the history shows exactly what changed and who approved it.
""",
           [mcq("What does `git add` do?", ["Uploads to GitHub", "Stages changes for the next commit", "Creates a branch", "Deletes files"], 1, "It moves changes into the staging area."),
            mcq("Which command safely undoes a pushed commit?", ["git reset --hard on shared main", "git revert", "rm -rf .git", "git delete"], 1, "Revert creates a new commit that reverses the change without rewriting history."),
            mcq("What does `set -euo pipefail` do in bash?", ["Speeds scripts", "Fails fast on errors, unset variables and broken pipes", "Enables colours", "Installs packages"], 1, "It stops silent failures in scripts.", "intermediate"),
            mcq("Which belongs in .gitignore?", ["Source code", "Secrets files, virtual environments and large data", "README", "Tests"], 1, "Never commit secrets or generated artefacts.")],
           [iq("Describe a good Git workflow for a data team.", "Branch from main, make small commits, push and open a pull request, let CI run tests, get a review, merge and deploy. Never commit secrets or large data, and revert instead of rewriting shared history."),
            iq("How do exit codes matter for pipelines?", "Schedulers and CI judge success by exit code: 0 is success and non-zero is failure. Scripts must return non-zero on error (use set -e or explicit checks) so failures are detected and retried or alerted.")]),

    lesson("tools-docker-env-rest", M, "Docker, environment variables, APIs and REST", 22, "intermediate", ["tools-git-linux", "py-etl-apis-db"],
           "Package pipelines reproducibly, configure them without hard-coding, and understand HTTP APIs, REST and status codes.",
           r"""
## Docker: reproducible environments

"It works on my machine" is a classic failure. A **container** packages your code, Python version and libraries so it runs identically on a laptop, in CI and in production. Unlike a virtual machine it shares the host kernel, so it starts in seconds and uses less memory.

- **Image**: read-only template built from a Dockerfile.
- **Container**: a running instance of an image.
- **Registry**: storage for images (Azure Container Registry, Docker Hub).
- **Volume**: persistent storage mounted into a container.

```dockerfile
# Use a minimal, trusted base image from an approved registry
FROM registry.access.redhat.com/ubi9/python-311:latest
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
# Never run as root
USER 1001
CMD ["python", "-m", "etl.run_daily"]
```

```bash
docker build -t daily-etl:1.0 .
docker run --rm -e RUN_DATE=2024-03-01 -v "$PWD/data:/app/data" daily-etl:1.0
docker ps; docker logs <container>; docker compose up   # multi-service local stacks
```

Security habits: pin versions, minimal base images, non-root `USER`, no secrets baked into images, scan images for vulnerabilities, bind exposed ports to localhost for local development. `docker compose` is how you start Postgres, Kafka or Airflow locally for practice.

## Environment variables and configuration

Configuration (hostnames, paths, run dates) differs between dev, test and prod. Code must not. Read config from **environment variables** or a config service, and secrets from a **secrets manager**.

```python
import os
DB_HOST = os.environ["DB_HOST"]                # required: fail fast if missing
BATCH_SIZE = int(os.environ.get("BATCH_SIZE", "5000"))
API_TOKEN = os.environ["API_TOKEN"]            # injected at runtime; never in Git
```

Rules: never hard-code secrets; `.env` files for local convenience only and git-ignored; validate config on startup; document required variables; log *which* config was used but never secret values. This is the twelve-factor approach.

## APIs and REST

An **API** is a contract for programs to talk to each other. **REST** APIs use HTTP with resources as URLs and verbs as actions.

| Verb | Meaning | Idempotent? |
|---|---|---|
| GET | Read | Yes |
| POST | Create / trigger | No |
| PUT | Replace | Yes |
| PATCH | Partial update | Usually |
| DELETE | Remove | Yes |

**Status codes**: 2xx success (200, 201, 204); 3xx redirect; **4xx client error** (400 bad request, 401 unauthenticated, 403 forbidden, 404 not found, **429 too many requests**); **5xx server error** (500, 502, 503). Retry 429 and 5xx with backoff; do not blindly retry 400/404.

Data-engineering concerns when consuming APIs:

- **Pagination** (page/offset, cursor, next-link): loop until no more pages.
- **Rate limits**: respect `Retry-After`, back off exponentially with jitter.
- **Authentication**: API keys, OAuth 2.0 bearer tokens; keep them in env vars or a vault; always HTTPS with certificate validation; set **timeouts** on every request.
- **Incremental extraction**: use `updated_since` parameters or cursors.
- **Idempotent loading** of the fetched pages.

```python
import requests, time
def get_page(url, params, token, retries=4):
    for attempt in range(retries):
        r = requests.get(url, params=params, headers={"Authorization": f"Bearer {token}"}, timeout=10)
        if r.status_code in (429, 500, 502, 503):
            time.sleep(2 ** attempt); continue
        r.raise_for_status()
        return r.json()
    raise RuntimeError("API unavailable after retries")
```

## Common mistakes

- Images running as root or containing secrets.
- `latest` tags that change underneath you.
- Config values hard-coded and differing silently between environments.
- No timeout on HTTP calls, so a hung API blocks the pipeline forever.
- Retrying non-idempotent POSTs without protection.

## Real-world use

A bank's rates pipeline runs as a container in CI and production with identical dependencies. The API token comes from Key Vault into an environment variable at startup; the job paginates the rates API, backs off on 429, and loads results idempotently by date.
""",
           [mcq("What is the main benefit of a container image?", ["Smaller data", "The same code and dependencies run identically everywhere", "Faster SQL", "No need for Git"], 1, "It removes environment drift."),
            mcq("Which HTTP status codes should usually be retried with backoff?", ["400 and 404", "429 and 5xx", "200", "401 only"], 1, "They are typically transient; 4xx client errors usually are not.", "intermediate"),
            mcq("Where should an API token live?", ["Hard-coded in the script", "In environment variables or a secrets manager", "In the README", "In Git"], 1, "Never commit credentials."),
            mcq("Why set a timeout on API requests?", ["Prettier logs", "A hung server would block the pipeline indefinitely", "To count rows", "Required by JSON"], 1, "Every network call needs a bounded wait."),
            mcq("A Dockerfile should end with:", ["USER root", "A non-root USER", "No user", "sudo"], 1, "Run with least privilege.", "intermediate")],
           [iq("Why use Docker for data pipelines?", "It packages code, runtime and dependencies so the pipeline behaves identically on a laptop, in CI and in production, makes deployments reproducible and isolates dependencies."),
            iq("How do you consume a paginated, rate-limited REST API reliably?", "Use timeouts, loop through pages or cursors, respect rate limits and Retry-After, retry transient 429/5xx errors with exponential backoff and jitter, keep tokens in env vars or a vault, extract incrementally with updated_since, and load idempotently.")]),

    lesson("tools-testing-cicd", M, "Testing data pipelines and CI/CD", 20, "intermediate", ["tools-git-linux", "py-advanced"],
           "Unit, integration and data tests, a practical test pyramid for pipelines, and what a CI/CD flow looks like.",
           r"""
## Why test pipelines?

A bug in a pipeline silently produces wrong numbers that executives act on. Tests are your safety net for refactoring, upgrades and new features, and they document intent.

## The test pyramid for data

| Level | What it tests | Speed | Example |
|---|---|---|---|
| **Unit** | A pure function on small inputs | ms | `clean_phone("07 123")` returns normalised string |
| **Integration** | Components together with a real (local) DB or files | seconds | Extract from a temp SQLite, transform, load, query result |
| **Data / quality tests** | Properties of the actual data | varies | No null keys, unique ids, row counts within range |
| **End-to-end / smoke** | Whole pipeline on sample data in a test environment | minutes | Run DAG for a sample date |

Most tests should be **unit tests**; keep a smaller number of slower integration and end-to-end tests.

## Writing testable pipeline code

Separate **pure transformation logic** from **I/O**:

```python
# etl/transform.py  (pure: easy to test)
def normalise_amount(rows):
    return [{**r, "amount": round(float(r["amount"]), 2)} for r in rows if r.get("amount") not in ("", None)]

# tests/test_transform.py
def test_normalise_amount_drops_blank_and_rounds():
    rows = [{"id": 1, "amount": "10.456"}, {"id": 2, "amount": ""}]
    assert normalise_amount(rows) == [{"id": 1, "amount": 10.46}]
```

With **pytest**: fixtures for sample data, `tmp_path` for temp files, parametrised tests for edge cases (nulls, empty input, duplicates, wrong types, boundary dates), and **mocking** for external APIs so tests never hit the network.

```python
import pytest
@pytest.mark.parametrize("raw,expected", [("  Bob ", "bob"), ("", None), (None, None)])
def test_clean_name(raw, expected):
    assert clean_name(raw) == expected
```

Test the **idempotency** of a load: run it twice and assert the row count is unchanged.

## Data validation tests

Checks run on real batches inside the pipeline or in a separate job:

- **Schema**: expected columns and types present.
- **Completeness**: null rate below threshold; no missing keys.
- **Uniqueness**: primary key unique.
- **Validity**: values in allowed set or range; dates not in the future.
- **Referential integrity**: every `fact.customer_id` exists in `dim_customer`.
- **Reconciliation**: row counts and sums match the source (within tolerance).
- **Freshness / volume**: latest timestamp recent; row count not 50% below the usual.

Tools: Great Expectations, dbt tests, Soda, or plain SQL assertions. Decide per rule whether failure **blocks** the load, **quarantines** rows or merely **warns**.

## CI/CD

**Continuous Integration**: every push or PR automatically installs dependencies, lints, runs tests and builds the image. **Continuous Delivery/Deployment**: passing builds are promoted automatically (or with approval) to dev, test and prod.

```yaml
# .github/workflows/ci.yml  (GitHub Actions)
name: ci
on: [pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "3.12" }
      - run: pip install -r requirements.txt
      - run: ruff check .
      - run: pytest -q
```

A typical data CD flow: merge to `main` -> build container/package -> deploy to **dev** -> run smoke test -> promote to **test/UAT** -> manual approval -> **prod**. Deploy infrastructure and pipelines as code (Terraform/Bicep, ADF ARM/Bicep, Databricks asset bundles) so environments are reproducible. Use **feature flags** or run new logic in parallel (shadow mode) before cutting over, and keep rollback simple (previous image/commit).

## Common mistakes

- Testing only the happy path.
- Tests that call real APIs or production databases.
- Treating data-quality checks as optional.
- Manual deployments by copy-pasting into production.
- Secrets stored in CI config in plain text rather than a secrets store.

## Real-world use

A bank's PR changing an interest calculation must pass unit tests on boundary cases, an integration test loading a sample ledger into a local database and reconciling totals, and a CI check that no secrets appear. Deployment to production requires a reviewer's approval and an automatic rollback plan.
""",
           [mcq("Which tests should be most numerous?", ["End-to-end", "Unit tests", "Manual", "Load tests"], 1, "Unit tests are fast and cheap; keep the pyramid base wide."),
            mcq("How do you test a function that calls an external API?", ["Call production", "Mock the response", "Skip testing", "Hard-code a password"], 1, "Mocking keeps tests fast and deterministic."),
            mcq("A good idempotency test:", ["Runs the load once", "Runs it twice and asserts the output is unchanged", "Checks only logs", "Deletes the table"], 1, "Idempotent means a repeat does not change the result.", "intermediate"),
            mcq("What does CI do?", ["Writes SQL", "Automatically builds and tests every change", "Stores data", "Schedules jobs"], 1, "Continuous integration catches problems early."),
            mcq("A referential-integrity check verifies:", ["Column types", "Foreign keys in facts exist in dimensions", "File size", "Timestamps"], 1, "It finds orphan fact rows.", "intermediate")],
           [iq("How do you test a data pipeline?", "Unit-test pure transformations with edge cases, integration-test extract/transform/load against local temp databases or files, test idempotency by running twice, and add data-quality checks for schema, nulls, uniqueness, referential integrity, reconciliation and freshness. Mock external services."),
            iq("Describe a CI/CD flow for data pipelines.", "A PR triggers lint and tests; merge builds an artefact; it deploys to dev with a smoke test, then test/UAT, then production with approval. Infrastructure and pipeline definitions are code, secrets come from a vault, and rollback means redeploying the previous version.")]),

    lesson("tools-quality-governance-security", M, "Data quality, observability, governance, security, PII and secrets", 24, "advanced", ["tools-testing-cicd", "de-governance-basics"],
           "Keep data trustworthy and safe: observability, lineage, access control, PII handling, masking, and secrets management.",
           r"""
## Data observability

Monitoring tells you whether *jobs* ran; **observability** tells you whether the *data* is healthy. The five pillars most teams track:

1. **Freshness**: is the table updated when expected?
2. **Volume**: is the row count within normal range?
3. **Schema**: did columns appear, vanish or change type?
4. **Distribution**: did null rates or value ranges shift (average order value suddenly zero)?
5. **Lineage**: which upstream sources and downstream dashboards are affected by an issue?

Implement with scheduled SQL checks, expectations frameworks, anomaly detection on metrics, and alerts routed to owners. Define **SLAs/SLOs** ("gold sales table fresh by 07:00 on 99% of days") and **data contracts** between producers and consumers describing schema, semantics and quality guarantees so upstream changes do not silently break downstream users.

## Data governance

Governance is the people, policies and tooling that make data **findable, trustworthy, compliant and appropriately accessible**.

- **Ownership and stewardship**: every dataset has an accountable owner.
- **Catalog and metadata**: searchable descriptions, definitions and tags (Purview, Unity Catalog, DataHub).
- **Lineage**: end-to-end flow from source to report for impact analysis and audits.
- **Classification**: public, internal, confidential, restricted.
- **Quality rules** and certified datasets.
- **Retention and deletion** policies.
- **Access policies**: role-based, least privilege, reviewed regularly.

## Data security and PII

**PII** (personally identifiable information): names, emails, phone, national IDs, addresses, account numbers, IP addresses and anything that can identify a person. Regulations (GDPR, CCPA, financial rules, HIPAA for health) impose duties: lawful use, minimisation, protection, right to access and erasure, breach notification.

Techniques, from strongest to weakest protection of identity:

| Technique | What it does | Reversible? |
|---|---|---|
| **Remove / do not collect** | Data minimisation | n/a |
| **Aggregation** | Report only group-level numbers | No |
| **Tokenisation** | Replace with a random token, mapping held in a secured vault | Yes (vault) |
| **Hashing with a secret salt/pepper** | One-way pseudonymisation; join keys possible | No |
| **Masking** | `john@example.com` -> `j***@example.com` for display | Display only |
| **Encryption** | Protect at rest/in transit with managed keys | Yes (key) |

```python
import hmac, hashlib, os
PEPPER = os.environ["PII_PEPPER"].encode()          # secret from a vault, never in code
def pseudonymise(email: str) -> str:
    return hmac.new(PEPPER, email.strip().lower().encode(), hashlib.sha256).hexdigest()
```

Plain unsalted hashes of emails or phone numbers can be reversed by dictionary attack; use keyed hashing (HMAC) or tokenisation. Practices: classify columns, restrict raw PII to a small zone, **mask for analysts**, use column-level security, encrypt, log access, never print PII in logs, never copy production PII into dev, honour deletion requests across all copies (lake, warehouse, backups policy), and keep data only as long as needed.

## Secrets management

Secrets: passwords, API keys, tokens, certificates, connection strings.

- Never in source code, Git history, notebooks, container images, logs or tickets.
- Store in a **secrets manager** (Azure Key Vault, HashiCorp Vault, AWS Secrets Manager); inject at runtime via environment variables or managed identities.
- **Rotate** regularly and immediately after exposure; set **expiry**.
- **Least privilege**: each pipeline gets its own credentials with minimal rights.
- Prefer **identity-based access** (managed identity, OIDC) over long-lived keys.
- Scan repositories for secrets in CI (pre-commit hooks, secret scanners). A leaked key committed once must be treated as compromised even after deleting the commit.
- Do not log secrets; redact tokens in error messages.

## Common mistakes

- Dashboards go stale and nobody notices for days.
- "Anonymised" data that is trivially re-identifiable by joining quasi-identifiers (postcode + birth date + gender).
- Production PII copied to developers' laptops.
- Sharing one admin credential across all pipelines.
- Governance as a one-off document rather than enforced tooling and ownership.

## Real-world use

An insurer's claims lake keeps raw claimant data in a restricted zone readable only by a small group; the analytics zone exposes tokenised claimant IDs and masked contact fields; Purview records lineage from the claims system to executive dashboards; freshness and volume checks alert the claims data owner; secrets come from Key Vault with 90-day rotation; deletion requests trigger a documented purge across all zones.
""",
           [mcq("Why is an unsalted SHA-256 of an email weak pseudonymisation?", ["It is too long", "Attackers can hash guessed emails and match them (dictionary attack)", "It is reversible by key", "It breaks joins"], 1, "Use keyed hashing (HMAC) or tokenisation.", "advanced"),
            mcq("Data observability differs from job monitoring because it checks:", ["CPU usage", "Whether the data itself is fresh, complete and plausible", "Network latency", "Git history"], 1, "Jobs can succeed while data is wrong."),
            mcq("Best handling of a leaked API key committed to Git?", ["Delete the commit and relax", "Treat as compromised, rotate it and fix the process", "Ignore", "Share it"], 1, "Git history and clones keep the secret; rotate immediately."),
            mcq("A data contract mainly provides:", ["Faster queries", "Agreed schema, semantics and quality between producers and consumers", "Encryption", "Backup"], 1, "It prevents silent upstream breakage.", "intermediate"),
            mcq("Which gives analysts usable data while protecting identity?", ["Raw PII for everyone", "Tokenised or masked columns with restricted raw access", "Shared admin login", "Emailing extracts"], 1, "Minimise exposure with least privilege.")],
           [iq("How do you handle PII in a data platform?", "Classify and minimise it, restrict raw PII to a secured zone, tokenise or keyed-hash identifiers for analytics, mask for display, encrypt at rest and in transit, apply column-level access with least privilege, audit access, keep PII out of logs and non-production, and support retention and erasure requests."),
            iq("How do you manage secrets in pipelines?", "Keep them in a secrets manager (Key Vault, Vault), inject at runtime through managed identities or environment variables, never commit or log them, scope credentials narrowly, rotate and expire them, and scan repositories for leaks."),
            iq("What is data observability?", "Continuous monitoring of data health across freshness, volume, schema, distribution and lineage, with alerting to data owners, so problems are caught before consumers see wrong numbers.")]),
]
