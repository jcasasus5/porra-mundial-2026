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
  effective_run_at timestamptz;
begin
  select value into app_url from public.app_settings where key = 'app_url';
  select value into cron_secret from public.app_settings where key = 'cron_secret';

  if app_url is null or cron_secret is null then
    raise exception 'Missing app_settings app_url or cron_secret';
  end if;

  job_name := 'check-match-result-' || match_uuid::text;
  effective_run_at := case
    when run_at > now() then run_at
    else now() + interval '1 minute'
  end;
  schedule := app_private.cron_expression_for(effective_run_at);

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
      next_result_check_at = effective_run_at
  where id = match_uuid;
end;
$$;
