-- ONE-TIME CLEANUP. Run this only if you earlier created the first-draft tables below.
-- It deletes those tables and any rows in them. Safe when no data needs keeping.
-- Afterwards run 20260101000000_user_data.sql.

drop table if exists public.profiles cascade;
drop table if exists public.user_settings cascade;
drop table if exists public.topic_progress cascade;
drop table if exists public.sql_submissions cascade;
drop table if exists public.python_submissions cascade;
drop table if exists public.user_notes cascade;
drop table if exists public.mock_interviews cascade;
drop table if exists public.study_sessions cascade;
