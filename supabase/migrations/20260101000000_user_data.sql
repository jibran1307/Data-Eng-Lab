-- Data Engineering Lab: per-user cloud persistence.
--
-- Run once in the Supabase dashboard: SQL Editor > New query > paste this file > Run.
-- It is idempotent for tables/indexes/policies (safe to re-run).
--
-- Design notes
--   * Static learning content (lessons, exercises, questions, scenarios) stays in the app. No content tables.
--   * Every table is user-owned: user_id references auth.users and defaults to auth.uid().
--   * Row Level Security is enabled on every table; each user can only select/insert/update/delete rows
--     where user_id = auth.uid(). The anon role has no privileges at all.
--   * Primary keys are (user_id, <natural key>) so the client can upsert without creating duplicates.
-- ---------------------------------------------------------------- guard against an older, different schema
do $$
begin
  if exists (
    select 1 from information_schema.tables where table_schema = 'public' and table_name = 'profiles'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'user_id'
  ) then
    raise exception 'public.profiles exists with an older layout (id column). Run supabase/migrations/00000000000000_drop_old_schema.sql first.';
  end if;
end
$$;



-- ---------------------------------------------------------------- helper: updated_at trigger
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.set_updated_at() from public, anon, authenticated;

-- ---------------------------------------------------------------- tables
-- Display name, theme, learning preferences (daily target, weekly goal, revision intervals, ...).
create table if not exists public.profiles (
  user_id      uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 80),
  theme        text check (theme in ('dark', 'light')),
  settings     jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  started_at   timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- One row per lesson: completion, bookmark, personal note, knowledge-check result, spaced-repetition state.
create table if not exists public.lesson_progress (
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  lesson_id    text not null check (char_length(lesson_id) between 1 and 100),
  completed_at timestamptz,
  bookmarked   boolean not null default false,
  note         text check (char_length(note) <= 200000),
  quiz_score   numeric check (quiz_score >= 0),
  quiz_total   integer check (quiz_total >= 0),
  quiz_at      timestamptz,
  rev_stage    integer check (rev_stage >= 0),
  rev_due      timestamptz,
  rev_last     timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (user_id, lesson_id)
);
create index if not exists lesson_progress_due_idx on public.lesson_progress (user_id, rev_due) where rev_due is not null;

-- One row per SQL/Python exercise: attempt counters, last submission and last passing solution.
create table if not exists public.exercise_progress (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  exercise_id text not null check (char_length(exercise_id) between 1 and 100),
  solved      boolean not null default false,
  attempts    integer not null default 0 check (attempts >= 0),
  correct     integer not null default 0 check (correct >= 0),
  last_at     timestamptz,
  sub_code    text check (char_length(sub_code) <= 200000),
  sub_at      timestamptz,
  sub_passed  boolean,
  solved_code text check (char_length(solved_code) <= 200000),
  solved_at   timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (user_id, exercise_id)
);

-- Hands-on project checklist: { "<step id>": true/false }.
create table if not exists public.project_progress (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id text not null check (char_length(project_id) between 1 and 100),
  steps      jsonb not null default '{}'::jsonb check (jsonb_typeof(steps) = 'object' and pg_column_size(steps) <= 100000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, project_id)
);

-- Scenario practice: best score, attempt history and the last submitted answer.
create table if not exists public.scenario_progress (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  scenario_id text not null check (char_length(scenario_id) between 1 and 100),
  best        numeric not null default 0 check (best >= 0),
  attempts    jsonb not null default '[]'::jsonb check (jsonb_typeof(attempts) = 'array' and pg_column_size(attempts) <= 100000),
  last_answer text check (char_length(last_answer) <= 200000),
  last_score  numeric check (last_score >= 0),
  last_at     timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (user_id, scenario_id)
);

-- Unsubmitted editor / textarea text (keys such as sql:free, sql:<exercise>, py:<exercise>, scn:<scenario>).
create table if not exists public.drafts (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  draft_key  text not null check (char_length(draft_key) between 1 and 150),
  content    text not null check (char_length(content) <= 200000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, draft_key)
);

-- Completed assessments (quiz / timed / full tests) with per-question results.
create table if not exists public.assessment_attempts (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  attempt_id text not null check (char_length(attempt_id) between 1 and 100),
  taken_at   timestamptz not null,
  score      numeric not null check (score >= 0),
  data       jsonb not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) <= 1000000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, attempt_id)
);
create index if not exists assessment_attempts_taken_idx on public.assessment_attempts (user_id, taken_at desc);

-- Completed mock interviews with questions, answers, scores and rubric report.
create table if not exists public.interview_attempts (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  attempt_id text not null check (char_length(attempt_id) between 1 and 100),
  taken_at   timestamptz not null,
  overall    numeric not null check (overall >= 0),
  data       jsonb not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) <= 1000000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, attempt_id)
);
create index if not exists interview_attempts_taken_idx on public.interview_attempts (user_id, taken_at desc);

-- Interview questions the learner added or imported.
create table if not exists public.custom_questions (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  question_id text not null check (char_length(question_id) between 1 and 100),
  position    integer not null default 0,
  data        jsonb not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) <= 100000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (user_id, question_id)
);

-- Minutes studied per calendar day (drives planner and analytics).
create table if not exists public.study_days (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day        date not null,
  minutes    numeric not null default 0 check (minutes >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

-- Small bookkeeping blobs (allow-listed keys only): recent activity feed, assessment/interview
-- question history used to avoid repeats, and the in-progress assessment/interview session.
create table if not exists public.user_kv (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kv_key     text not null check (kv_key in (
               'activity', 'assessmentSeen', 'lastAssessmentQs', 'askedQs', 'mixSignatures',
               'activeAssessment', 'activeInterview')),
  value      jsonb not null check (pg_column_size(value) <= 1000000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, kv_key)
);

-- ---------------------------------------------------------------- triggers, RLS, grants, policies
do $$
declare
  t text;
  tables text[] := array[
    'profiles', 'lesson_progress', 'exercise_progress', 'project_progress', 'scenario_progress', 'drafts',
    'assessment_attempts', 'interview_attempts', 'custom_questions', 'study_days', 'user_kv'
  ];
begin
  foreach t in array tables loop
    -- keep updated_at fresh
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);

    -- Row Level Security: never disabled
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);

    -- Privileges: signed-in users only, no anonymous access
    execute format('revoke all on table public.%I from public, anon', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);

    -- Policies: a user can only touch rows whose user_id is their own auth.uid()
    execute format('drop policy if exists "owner select" on public.%I', t);
    execute format('drop policy if exists "owner insert" on public.%I', t);
    execute format('drop policy if exists "owner update" on public.%I', t);
    execute format('drop policy if exists "owner delete" on public.%I', t);
    execute format('create policy "owner select" on public.%I for select to authenticated using ((select auth.uid()) = user_id)', t);
    execute format('create policy "owner insert" on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', t);
    execute format('create policy "owner update" on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
    execute format('create policy "owner delete" on public.%I for delete to authenticated using ((select auth.uid()) = user_id)', t);
  end loop;
end
$$;
