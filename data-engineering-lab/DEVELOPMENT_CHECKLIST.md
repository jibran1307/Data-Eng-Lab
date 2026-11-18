# Development Checklist

Status of every phase from the build brief. All items below were verified (see "Verification log").

## Phase 1: Foundation
- [x] Monorepo structure: `backend/` (FastAPI) and `frontend/` (React + TypeScript + Vite)
- [x] Design system: Tailwind 4 tokens, cards, badges, tabs, skeletons, empty states, toasts
- [x] Dark (default) and light themes, sun/moon toggle in the top bar, persisted in `localStorage`
- [x] Collapsible sidebar with all 11 sections, breadcrumbs, global search, profile menu, mobile drawer
- [x] Dashboard (progress, proficiency, weekly activity, continue learning, next steps, recent activity, revisions)
- [x] SQLite persistence (`backend/data/lab.db`) plus `localStorage` mirror

## Phase 2: Learning platform
- [x] 10 modules, 43 lessons (concept, why, how, examples, mistakes, use cases, exercises, quiz, interview questions)
- [x] Prerequisite locking, mark complete, notes (autosave), bookmarks, previous/next, table of contents
- [x] Code blocks with syntax highlighting and copy button
- [x] Progress tracking per lesson and module

## Phase 3: Practice labs
- [x] SQL playground (DuckDB): editor, run, results table, errors, create/insert/modify, reset, schema browser
- [x] 36 SQL exercises (basic, intermediate, advanced, analytical, DE scenarios, optimisation) with expected output, hints, hidden solution, automated validation
- [x] Python playground: sandboxed subprocess (isolated mode, rlimits, no network, 20 s timeout)
- [x] 25 Python exercises with hints, expected output, hidden solution, automated tests
- [x] Realistic datasets (customers, orders, products, payments, events, ...) and preloaded Python data files

## Phase 4: Projects and scenarios
- [x] 7 projects: requirement, architecture diagram, problem, dataset, milestones/steps, expected output, validation checklist, common errors, interview questions
- [x] Per-step progress and completion status
- [x] 12 scenarios with hints, rubric-based evaluation, reference approach and real-world implementation notes

## Phase 5: Assessments and interviews
- [x] Assessment engine: topic quizzes, timed and full-length tests, 3 difficulty levels, explanations, weak-topic detection, history charts
- [x] No repeats from the previous test; least-seen questions first; option shuffling with answer remapping
- [x] Mock interviews: 10 interview types, 4 difficulties, 15/30/45 min, question count and topic selection
- [x] Question bank of 316 questions across 14 topics plus scenario templates that expand into thousands of variants
- [x] Mix-signature uniqueness, recent-question avoidance, asked-question history, reset history
- [x] Add question form and JSON import with validation
- [x] Transparent keyword-rubric evaluation report (overall, 4 dimensions, expected answer, matched/missed concepts, revision topics); no AI claims; optional AI provider is environment-configured only

## Phase 6: Analytics, import/export, testing, polish
- [x] Progress and analytics (module completion, proficiency, SQL/Python accuracy, score trends, study time, weak areas, revision history)
- [x] Planner: daily target, weekly goal, study time tracking, spaced-repetition revisions
- [x] Export / import JSON, backups and restore, reset with confirmation
- [x] Backend tests (pytest) and frontend tests (vitest)
- [x] Lint (oxlint) clean, TypeScript clean, production build succeeds
- [x] README with setup instructions

## Phase 7: Free online hosting (static, browser-only build)
- [x] `scripts/export_static.py` exports lessons, exercises, questions, datasets to `frontend/public/static-data`
- [x] In-browser API layer (`frontend/src/static/`) answers the same `/api/*` calls: content from JSON, progress in `localStorage`
- [x] SQL Playground on DuckDB-WASM (sample database, reset, 10 s timeout, exercise validation)
- [x] Python Playground on Pyodide in a Web Worker (pandas/numpy, data files, 20 s timeout by terminating the worker)
- [x] `HashRouter` + relative base so it works on GitHub Pages sub-paths; no backend wording in the static UI
- [x] GitHub Pages workflow, Cloudflare/Netlify `_headers` with a strict CSP, `DEPLOY.md`
- [x] Real-Chrome end-to-end test (`npm run e2e:static`) and visual check of both themes and mobile

## Verification log
| Check | Result |
| --- | --- |
| `pytest` (content integrity, 36 SQL solutions, 25 Python solutions/starters, sandbox, API, persistence, static export in sync) | 92 passed |
| `vitest` (interview engine, evaluation, assessments, spaced repetition, streak, theme persistence, static API) | 51 passed |
| `tsc -b --noEmit` | clean |
| `oxlint` | 0 warnings, 0 errors |
| `npm run build` | succeeds, Monaco bundled locally (offline) |
| Server start on 127.0.0.1:8765 serves API and SPA | verified |
| State survives a server restart | verified |
| Listener bound to loopback only | verified |
| Static build in real Chrome under a sub-path with CSP (36/36 SQL, 25/25 Python solutions, timeouts, theme, export, backup, mobile, no console errors) | all passed |

## How to extend
- New lesson: add to the relevant `backend/app/content/l_*.py`.
- New interview questions: use the in-app form or JSON import, or add to `backend/app/content/qb_*.py`.
- New scenario template: add to `frontend/src/lib/templates.ts`.
