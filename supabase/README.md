# Supabase setup (cloud progress + Google sign-in)

The hosted app stores each learner's progress in Supabase PostgreSQL and signs in with Google through Supabase Auth.
Lessons, exercises and questions stay in the app; the database holds only user-owned rows.

## 1. Create the tables (once)

Supabase dashboard > **SQL Editor** > **New query** > paste [`migrations/20260101000000_user_data.sql`](migrations/20260101000000_user_data.sql) > **Run**.
It is safe to run again; it never drops data.

## 2. Check that Row Level Security is on (recommended)

Run this in the SQL Editor. Every row should show `rls_enabled = true` and `anon_privileges = 0`.

```sql
select c.relname as table_name,
       c.relrowsecurity as rls_enabled,
       (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as policies,
       (select count(*) from information_schema.role_table_grants g
         where g.table_schema = 'public' and g.table_name = c.relname and g.grantee = 'anon') as anon_privileges
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by 1;
```

Expected: 11 tables, 4 policies each (select, insert, update, delete).

## 3. Authentication settings

Authentication > **URL Configuration**
- Site URL: `https://jibran1307.github.io/Data-Eng-Lab/`
- Redirect URLs (both):
  - `https://jibran1307.github.io/Data-Eng-Lab/`
  - `http://localhost:5173/`

Authentication > **Providers** > Google: enabled with your Google client ID and secret (kept in Supabase, never in this repo).
Google Cloud Console > OAuth client > Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`.

## 4. Build-time variables

| Variable | Where |
| --- | --- |
| `VITE_SUPABASE_URL` | GitHub: Settings > Secrets and variables > Actions > **Variables**; locally in `frontend/.env.local` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | same |

Both values are designed to be public; the data is protected by RLS. Never use the service-role key, database password or Google client secret in the frontend.

## Tables

| Table | Key | Used by |
| --- | --- | --- |
| `profiles` | `user_id` | name, theme, learning preferences (Settings, greetings) |
| `lesson_progress` | `user_id, lesson_id` | completion, bookmarks, notes, knowledge checks, spaced revisions (Learning Path, Lesson, Progress) |
| `exercise_progress` | `user_id, exercise_id` | SQL and Python attempts, last submission, last passing solution |
| `project_progress` | `user_id, project_id` | project step checklists |
| `scenario_progress` | `user_id, scenario_id` | scenario scores, attempts, last answer |
| `drafts` | `user_id, draft_key` | unsubmitted editor text (SQL, Python, scenarios) |
| `assessment_attempts` | `user_id, attempt_id` | assessment results with per-question detail |
| `interview_attempts` | `user_id, attempt_id` | mock interview questions, answers, scores, report |
| `custom_questions` | `user_id, question_id` | question-bank additions and imports |
| `study_days` | `user_id, day` | minutes studied per day (planner, analytics) |
| `user_kv` | `user_id, kv_key` | activity feed, repeat-avoidance history, in-progress test or interview |

All tables: RLS enabled and forced, `select/insert/update/delete` allowed only to `authenticated` where `user_id = auth.uid()`, no privileges for `anon`.
