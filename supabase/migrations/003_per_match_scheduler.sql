create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

create table if not exists public.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

drop policy if exists "app_settings_admin_all" on public.app_settings;
create policy "app_settings_admin_all"
on public.app_settings for all
to authenticated
using (app_private.is_admin(auth.uid()))
with check (app_private.is_admin(auth.uid()));

grant select, insert, update, delete on public.app_settings to authenticated;

alter table public.matches
add column if not exists result_check_job_name text,
add column if not exists next_result_check_at timestamptz;

create or replace function app_private.estimated_result_check_at(match_starts_at timestamptz, match_stage public.match_stage)
returns timestamptz
language sql
immutable
as $$
  select match_starts_at + interval '95 minutes';
$$;

create or replace function app_private.cron_expression_for(run_at timestamptz)
returns text
language sql
stable
as $$
  select concat_ws(
    ' ',
    extract(minute from run_at at time zone 'UTC')::int,
    extract(hour from run_at at time zone 'UTC')::int,
    extract(day from run_at at time zone 'UTC')::int,
    extract(month from run_at at time zone 'UTC')::int,
    '*'
  );
$$;

create or replace function app_private.schedule_match_result_check(match_uuid uuid, run_at timestamptz)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  app_url text;
  cron_secret text;
  job_name text;
  schedule text;
begin
  select value into app_url from public.app_settings where key = 'app_url';
  select value into cron_secret from public.app_settings where key = 'cron_secret';

  if app_url is null or cron_secret is null then
    raise exception 'Missing app_settings app_url or cron_secret';
  end if;

  job_name := 'check-match-result-' || match_uuid::text;
  schedule := app_private.cron_expression_for(run_at);

  begin
    perform cron.unschedule(job_name);
  exception when others then
    null;
  end;

  perform cron.schedule(
    job_name,
    schedule,
    format(
      $job$
      select net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || %L
        ),
        body := jsonb_build_object('matchId', %L),
        timeout_milliseconds := 10000
      );
      $job$,
      app_url || '/api/check-match-result',
      cron_secret,
      match_uuid::text
    )
  );

  update public.matches
  set result_check_job_name = job_name,
      next_result_check_at = run_at
  where id = match_uuid;
end;
$$;

create or replace function app_private.unschedule_match_result_check(match_uuid uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  job_name text;
begin
  select result_check_job_name into job_name
  from public.matches
  where id = match_uuid;

  if job_name is not null then
    perform cron.unschedule(job_name);
  end if;

  update public.matches
  set result_check_job_name = null,
      next_result_check_at = null
  where id = match_uuid;
end;
$$;

create or replace function public.schedule_match_result_check(match_uuid uuid, run_at timestamptz)
returns void
language sql
security definer
set search_path = public
as $$
  select app_private.schedule_match_result_check(match_uuid, run_at);
$$;

create or replace function public.unschedule_match_result_check(match_uuid uuid)
returns void
language sql
security definer
set search_path = public
as $$
  select app_private.unschedule_match_result_check(match_uuid);
$$;

create or replace function public.schedule_all_match_result_checks()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  match_record record;
begin
  for match_record in
    select id, starts_at, stage
    from public.matches
    where status <> 'finished'
      and manual_override = false
  loop
    perform app_private.schedule_match_result_check(
      match_record.id,
      app_private.estimated_result_check_at(match_record.starts_at, match_record.stage)
    );
  end loop;
end;
$$;

grant execute on function public.schedule_all_match_result_checks() to authenticated;
grant execute on function public.schedule_match_result_check(uuid, timestamptz) to authenticated;
grant execute on function public.unschedule_match_result_check(uuid) to authenticated;
