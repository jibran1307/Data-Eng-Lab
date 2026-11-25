# API reference

The app talks to two kinds of APIs. Which one is used depends on how it was built and where it runs.

| Mode | Content, SQL and Python labs | Your progress and saved data |
| --- | --- | --- |
| **Hosted (GitHub Pages)**, Supabase variables set | Static JSON, DuckDB-WASM and Pyodide in the browser | Supabase PostgreSQL, after Google sign-in (see [Supabase data API](#supabase-data-api)) |
| **Hosted**, no Supabase variables | same | This browser's `localStorage` |
| **Local** (`./run.sh start` or `dev`) | FastAPI backend (see [Local backend API](#local-backend-api)) | SQLite file `backend/data/lab.db` |

In cloud mode the backend routes under `/api/state` and `/api/backup` are not used; only the content and lab routes are.

---

## Supabase data API

Requests go from the browser to `https://<project-ref>.supabase.co` through `@supabase/supabase-js`. The client sends the publishable key as `apikey`, plus the signed-in user's JWT as `Authorization: Bearer <token>`.

### Authentication

| Action | Call |
| --- | --- |
| Sign in | `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } })`, PKCE flow |
| Restore session | `supabase.auth.getSession()` on start; the session is kept in the browser and refreshed automatically |
| Sign out | `supabase.auth.signOut()`, after pending changes are saved |

`redirectTo` is the app's own directory: `https://jibran1307.github.io/Data-Eng-Lab/` in production, `http://localhost:5173/` in development. Both must be listed under Supabase > Authentication > URL Configuration.

### Tables (REST: `/rest/v1/<table>`)

Every table is owned by `user_id` (default `auth.uid()`). Row Level Security allows an `authenticated` user to select, insert, update and delete only their own rows. The `anon` role has no access. Saves are upserts on the primary key, so repeating a save never creates a duplicate.

| Table | Primary key | Columns (besides `user_id`, `created_at`, `updated_at`) |
| --- | --- | --- |
| `profiles` | `user_id` | `display_name`, `theme` (`dark`/`light`), `settings` (json), `started_at` |
| `lesson_progress` | `user_id, lesson_id` | `completed_at`, `bookmarked`, `note`, `quiz_score`, `quiz_total`, `quiz_at`, `rev_stage`, `rev_due`, `rev_last` |
| `exercise_progress` | `user_id, exercise_id` | `solved`, `attempts`, `correct`, `last_at`, `sub_code`, `sub_at`, `sub_passed`, `solved_code`, `solved_at` |
| `project_progress` | `user_id, project_id` | `steps` (json `{stepId: bool}`) |
| `scenario_progress` | `user_id, scenario_id` | `best`, `attempts` (json array), `last_answer`, `last_score`, `last_at` |
| `drafts` | `user_id, draft_key` | `content` |
| `assessment_attempts` | `user_id, attempt_id` | `taken_at`, `score`, `data` (json) |
| `interview_attempts` | `user_id, attempt_id` | `taken_at`, `overall`, `data` (json) |
| `custom_questions` | `user_id, question_id` | `position`, `data` (json) |
| `study_days` | `user_id, day` | `minutes` |
| `user_kv` | `user_id, kv_key` | `value` (json); keys: `activity`, `assessmentSeen`, `lastAssessmentQs`, `askedQs`, `mixSignatures`, `activeAssessment`, `activeInterview` |

Size limits are enforced by the database (for example, 200,000 characters per code or note field).

### How the app uses it

| When | What happens |
| --- | --- |
| After sign-in | One `select` per table (paged, 1,000 rows) builds the app state. The UI shows a loading skeleton until it finishes. |
| After a change | About 0.6 s later, only changed rows are sent: `upsert` with `onConflict: user_id,<key>`; removed rows are `delete`d. |
| Tab hidden or closed | Pending changes are sent immediately. |
| A save fails | The top bar shows "Not saved", a toast appears once, and the save is retried every 8 seconds. |
| Load fails | An error screen offers "Try again". Nothing is saved until a load succeeds. |

The code is in `frontend/src/lib/cloudSync.ts` (row mapping and diff push), `frontend/src/lib/store.tsx` (load/save scheduling) and `frontend/src/lib/auth.tsx`.

### Example (what the client sends)

```http
POST /rest/v1/exercise_progress?on_conflict=user_id,exercise_id
apikey: <publishable key>
Authorization: Bearer <user JWT>
Content-Type: application/json
Prefer: resolution=merge-duplicates

[{"user_id":"<uid>","exercise_id":"sql-01","solved":true,"attempts":2,"correct":1,"sub_code":"SELECT 1","sub_passed":true}]
```

An anonymous call returns `401` with code `42501` (permission denied). A signed-in call that sets another user's `user_id` is rejected by the RLS `with check`.

---

## Local backend API

FastAPI, bound to `127.0.0.1:8765` (override with `DE_LAB_PORT`). Interactive docs: `http://127.0.0.1:8765/api/docs`. No authentication; CORS allows local origins only. Errors are generic, details stay in server logs.

### Health and state

| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| GET | `/api/health` | | `{status, time}` |
| GET | `/api/state` | | all stored keys, e.g. `{app: {...}}` |
| GET | `/api/state/{key}` | | `{key, value}` (key matches `[A-Za-z0-9_.-]{1,64}`) |
| PUT | `/api/state/{key}` | `{value}` (max 5 MB) | `{ok}` |
| POST | `/api/state/import` | `{data: {key: value}}` | `{ok, keys}` |
| DELETE | `/api/state` | | `{ok}` clears all progress |

### Backups

| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| POST | `/api/backup` | | `{ok, name}` |
| GET | `/api/backup` | | latest 50: `[{name, size, modified}]` |
| POST | `/api/backup/restore` | `{name}` matching `backup-YYYYMMDD-HHMMSS.json` | `{ok, keys}` |

### Content (read-only)

| Method | Path | Returns |
| --- | --- | --- |
| GET | `/api/content/modules` | module list |
| GET | `/api/content/lessons` | lesson index (no bodies) |
| GET | `/api/content/lessons/{lesson_id}` | one lesson, 404 if unknown |
| GET | `/api/content/projects` | projects |
| GET | `/api/content/scenarios` | scenarios |
| GET | `/api/content/mcq` | assessment questions |
| GET | `/api/content/questions` | interview question bank |

### SQL lab (DuckDB, in memory)

| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| GET | `/api/sql/schema` | | tables and columns |
| POST | `/api/sql/run` | `{sql}` (max 20,000 chars, 10 s timeout) | `{columns, rows, row_count, truncated}` or `{error}` |
| POST | `/api/sql/reset` | | `{ok}` restores the sample database |
| GET | `/api/sql/exercises` | | exercises without solutions |
| GET | `/api/sql/exercises/{id}/expected` | | expected output |
| GET | `/api/sql/exercises/{id}/solution` | | `{solution, explain}` |
| POST | `/api/sql/validate` | `{exercise_id, sql}` | `{passed, feedback, expected, actual}` |

### Python lab (sandboxed process)

| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| POST | `/api/python/run` | `{code}` (max 50,000 chars, 20 s timeout) | `{stdout, stderr, timed_out}` |
| GET | `/api/python/exercises` | | exercises without solutions or tests |
| GET | `/api/python/exercises/{id}/solution` | | `{solution, explain}` |
| POST | `/api/python/validate` | `{exercise_id, code}` | `{passed, feedback, stdout, stderr}` |

### Optional AI

| Method | Path | Returns |
| --- | --- | --- |
| GET | `/api/ai/status` | `{configured: bool}`; true only when `DE_LAB_AI_BASE_URL`, `DE_LAB_AI_MODEL` and `DE_LAB_AI_API_KEY` are set |

### Static build equivalent

In the hosted build the same paths are answered in the browser by `frontend/src/static/staticApi.ts`: content from `static-data/*.json`, SQL by DuckDB-WASM, Python by Pyodide, and state from `localStorage` (when Supabase is not configured).
