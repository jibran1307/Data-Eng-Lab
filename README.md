# Data Engineering Lab

A local, offline-first environment for becoming a job-ready Data Engineer. It combines a structured curriculum, runnable SQL and Python labs, hands-on projects, scenario practice, assessments, a dynamic mock-interview simulator, a spaced-repetition planner and analytics.

Nothing here needs a cloud account, paid API or internet connection once dependencies are installed.

| Area | What you get |
| --- | --- |
| Learning Path | 10 modules, 43 lessons, prerequisites, notes, bookmarks, knowledge checks |
| SQL Playground | DuckDB with realistic datasets, 36 graded exercises, create/insert/modify, reset |
| Python Playground | Sandboxed execution, 25 graded exercises, preloaded data files |
| Projects | 7 end-to-end projects with milestones and checklists |
| Scenarios | 12 production problems, rubric evaluation, reference approach |
| Assessments | Quizzes, timed and full tests, no back-to-back repeats, weak-topic detection |
| Mock Interviews | 10 interview types, 316 questions plus templates that expand into thousands of variants |
| Planner and Analytics | Daily/weekly goals, study hours, spaced repetition, score trends |
| Data | SQLite persistence, JSON export/import, backups, reset |
| Free hosting | Static browser-only build with a GitHub Pages workflow ([DEPLOY.md](DEPLOY.md)) |

## Requirements

- Python 3.11 or newer (developed on 3.13)
- Node.js 20 or newer (developed on 25) and npm
- Optional, only for running PySpark examples locally: Java 17+ and `pip install pyspark`

## Quick start

```bash
cd data-engineering-lab
./run.sh start        # installs dependencies on first run, builds the UI, serves everything
```

Open http://127.0.0.1:8765

Manual equivalent:

```bash
# backend
python3 -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements.txt

# frontend
cd frontend && npm install && npm run build && cd ..

# run (API + built UI on one port)
backend/.venv/bin/python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8765
```

### Development with hot reload

```bash
./run.sh dev          # API on 127.0.0.1:8765, Vite on http://127.0.0.1:5173 (proxies /api)
```

### Tests, lint, type check

```bash
./run.sh test
# or individually
cd backend  && .venv/bin/python -m pytest -q
cd frontend && npm run typecheck && npm run lint && npm test && npm run build
```

## Share it online (free)

`./run.sh static` builds a browser-only version (SQL in DuckDB-WASM, Python in Pyodide, progress in each visitor's own browser) that deploys to GitHub Pages, Cloudflare Pages or Netlify at no cost. A GitHub Actions workflow is included. See [DEPLOY.md](DEPLOY.md).

Live site: https://jibran1307.github.io/Data-Eng-Lab/ (checked with the browser test suite against this URL).

## Where your data lives

| Data | Location |
| --- | --- |
| Progress, notes, history, settings | `backend/data/lab.db` (SQLite, git-ignored) |
| Backups | `backend/data/backups/` |
| Theme and sidebar preference | browser `localStorage` (`delab.theme`, `delab.sidebar`) |

Override the data directory with `DE_LAB_DATA_DIR`. Use **Settings** to export or import progress as JSON, create or restore backups, and reset (with confirmation).

## Using the app

- **Learning Path**: lessons unlock when their prerequisites are done. Completing a lesson schedules a revision (default intervals 1, 3, 7, 16, 35 days, configurable in Settings).
- **SQL / Python Playground**: press Run, or Ctrl/Cmd+Enter in the editor. Pick an exercise for the problem, schema, hints, expected output and automated check. Solutions stay hidden until you ask.
- **Mock Interviews**: choose type, difficulty, duration (15/30/45 min), question count and topics. Each interview draws a fresh mix of topics; recent mixes and recently asked questions are avoided. After finishing you get a rubric report. Use **Question bank** to add questions or import JSON, and **Reset interview history** to start fresh.
- **Scenarios**: write your own answer first, then compare to the rubric and reference approach.
- **Your work is kept**: code in the SQL and Python playgrounds (free mode and each exercise) and scenario answers are saved as you type, so you can visit other pages and come back. Code you submit is shown again under **Saved code** with a **Load into editor** button. A test or interview in progress resumes where you left it (the timer keeps running).
- **First launch** asks for your name and uses it in greetings. Change it in **Settings**. Updating the app never resets existing progress; new fields are added alongside what you already have.

### Adding questions

Via the UI (Mock Interviews, then Question bank), or import a JSON file:

```json
[
  {
    "q": "How would you make a nightly load idempotent?",
    "topic": "etl",
    "type": "concept",
    "level": "intermediate",
    "answer": "Use a business key with MERGE/upsert, or overwrite a partition, so reruns give the same result.",
    "keywords": [["idempotent"], ["merge", "upsert"], ["partition", "overwrite"]],
    "hints": ["What happens if the job runs twice?"]
  }
]
```

`keywords` is a list of concept groups; a group is satisfied when any synonym appears in the answer. If omitted, keywords are derived from the expected answer. Valid topics: `sql python fundamentals etl warehousing spark orchestration azure streaming modeling scenario design troubleshooting tools`.

Built-in questions live in `backend/app/content/qb_*.py`. Scenario templates (with `{slot}` placeholders) live in `frontend/src/lib/templates.ts`.

## How answers are evaluated

Evaluation is transparent and rule-based. Every question has concept groups; the score is the share of groups covered, with a small depth factor so one-line keyword dumps cannot reach 100. The report shows which concepts were matched or missed. No AI is used.

An optional AI provider can be configured later through environment variables (`DE_LAB_AI_BASE_URL`, `DE_LAB_AI_MODEL`, `DE_LAB_AI_API_KEY`). Keys are read from the environment only and are never stored. The app is fully usable without them.

## Architecture

```
frontend/            React 19 + TypeScript + Vite + Tailwind 4, Recharts, Monaco (bundled locally)
  src/lib/           pure logic: interview engine, evaluation, assessments, spaced repetition, store
  src/pages/         one file per sidebar section
backend/
  app/main.py        FastAPI routes (state, backup, content, SQL, Python) and static UI
  app/db.py          SQLite key/value persistence
  app/sql_lab.py     DuckDB lab (in-memory, seeded from datasets.sql, validation by result comparison)
  app/python_lab.py  sandboxed Python execution (see below)
  app/content/       curriculum, exercises, projects, scenarios, MCQs, interview questions
  tests/             pytest suite
```

## Security notes

- All services bind to `127.0.0.1`. CORS allows only local origins.
- Python exercises run in a separate process: isolated mode (`-I`), an empty temporary working directory, minimal environment, CPU/memory/file-size/process limits, sockets disabled and a hard 20 second timeout. It protects a normal local setup, but it is not a substitute for a container or VM if you ever expose this beyond your own machine.
- SQL runs in an in-memory DuckDB with a timeout and row cap. Persistence uses parameterised SQLite queries.
- Backup restore accepts only generated file names. Error responses are generic; details stay in server logs.
- No secrets are stored in code or in the database.

## Cloud and Spark honesty

Azure lessons and the Azure project are architecture and concept material. They do not run locally and the app does not pretend they do. PySpark lessons include local installation notes; the in-app Python lab does not ship Spark, so run Spark examples in your own terminal after installing Java and `pyspark`.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| "Is the backend running?" messages | Start the API (`./run.sh start` or `./run.sh dev`) |
| Port 8765 in use | `DE_LAB_PORT=8800 ./run.sh start` (for dev mode also update the proxy in `frontend/vite.config.ts`) |
| Blank page after pulling changes | `cd frontend && npm install && npm run build` |
| Want a clean slate | Settings, then Reset progress, or delete `backend/data/lab.db` |
