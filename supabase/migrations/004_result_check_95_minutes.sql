create or replace function app_private.estimated_result_check_at(match_starts_at timestamptz, match_stage public.match_stage)
returns timestamptz
language sql
immutable
as $$
  select match_starts_at + interval '95 minutes';
$$;
