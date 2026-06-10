create schema if not exists app_private;

create extension if not exists pgcrypto;

create type public.user_role as enum ('admin', 'participant');
create type public.user_status as enum ('pending', 'approved', 'rejected');
create type public.match_stage as enum (
  'group',
  'round_of_32',
  'round_of_16',
  'quarter_final',
  'semi_final',
  'third_place',
  'final'
);
create type public.match_status as enum (
  'scheduled',
  'in_play',
  'finished',
  'postponed',
  'cancelled'
);
create type public.score_reason as enum (
  'match_sign',
  'match_exact',
  'knockout_qualified_bonus',
  'champion'
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-zA-Z0-9_-]{3,30}$'),
  role public.user_role not null default 'participant',
  status public.user_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  api_football_team_id integer unique,
  name text not null unique,
  code text,
  flag_url text,
  created_at timestamptz not null default now()
);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  api_football_fixture_id integer unique,
  stage public.match_stage not null,
  group_name text,
  round_name text,
  home_team_id uuid references public.teams(id),
  away_team_id uuid references public.teams(id),
  home_placeholder text,
  away_placeholder text,
  starts_at timestamptz not null,
  status public.match_status not null default 'scheduled',
  home_goals integer check (home_goals >= 0),
  away_goals integer check (away_goals >= 0),
  elapsed integer,
  winner_team_id uuid references public.teams(id),
  qualified_team_id uuid references public.teams(id),
  source text not null default 'manual',
  raw_api_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (home_goals is null and away_goals is null)
    or (home_goals is not null and away_goals is not null)
  )
);

create table public.match_predictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  match_id uuid not null references public.matches(id) on delete cascade,
  predicted_home_goals integer not null check (predicted_home_goals >= 0),
  predicted_away_goals integer not null check (predicted_away_goals >= 0),
  predicted_qualified_team_id uuid references public.teams(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, match_id)
);

create table public.champion_predictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  team_id uuid not null references public.teams(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create table public.scoring_rules (
  id boolean primary key default true,
  sign_points integer not null default 3 check (sign_points >= 0),
  exact_points integer not null default 5 check (exact_points >= 0),
  knockout_qualified_bonus_enabled boolean not null default true,
  knockout_qualified_bonus_points integer not null default 2 check (knockout_qualified_bonus_points >= 0),
  champion_points integer not null default 10 check (champion_points >= 0),
  champion_prediction_closes_at timestamptz,
  updated_at timestamptz not null default now(),
  check (id)
);

insert into public.scoring_rules (id) values (true)
on conflict (id) do nothing;

create table public.score_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  match_id uuid references public.matches(id) on delete cascade,
  champion_prediction_id uuid references public.champion_predictions(id) on delete cascade,
  reason public.score_reason not null,
  points integer not null,
  created_at timestamptz not null default now(),
  unique (user_id, match_id, reason),
  unique (user_id, champion_prediction_id, reason)
);

create table public.sync_logs (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'worldcup26.ir',
  endpoint text not null,
  request_count integer not null default 1,
  status text not null,
  message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  payload jsonb
);

create or replace function app_private.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function app_private.touch_updated_at();

create trigger matches_touch_updated_at
before update on public.matches
for each row execute function app_private.touch_updated_at();

create trigger match_predictions_touch_updated_at
before update on public.match_predictions
for each row execute function app_private.touch_updated_at();

create trigger champion_predictions_touch_updated_at
before update on public.champion_predictions
for each row execute function app_private.touch_updated_at();

create trigger scoring_rules_touch_updated_at
before update on public.scoring_rules
for each row execute function app_private.touch_updated_at();

create or replace function app_private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'username', ''), split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function app_private.handle_new_user();

create or replace function app_private.is_approved(user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = user_id and status = 'approved'
  );
$$;

create or replace function app_private.is_admin(user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = user_id and status = 'approved' and role = 'admin'
  );
$$;

create or replace function public.match_is_open(match_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.matches
    where id = match_id
      and starts_at > now()
      and status = 'scheduled'
  );
$$;

create or replace function app_private.validate_match_prediction()
returns trigger
language plpgsql
as $$
declare
  match_record public.matches%rowtype;
begin
  select * into match_record from public.matches where id = new.match_id;

  if match_record.id is null then
    raise exception 'match not found';
  end if;

  if match_record.starts_at <= now() or match_record.status <> 'scheduled' then
    raise exception 'match is closed for predictions';
  end if;

  if new.predicted_home_goals <> new.predicted_away_goals
    and new.predicted_qualified_team_id is not null then
    raise exception 'qualified team can only be set for draw predictions';
  end if;

  if match_record.stage = 'group' and new.predicted_qualified_team_id is not null then
    raise exception 'group matches cannot have a qualified team prediction';
  end if;

  if match_record.stage <> 'group'
    and match_record.home_team_id is not null
    and match_record.away_team_id is not null
    and new.predicted_home_goals = new.predicted_away_goals
    and new.predicted_qualified_team_id is null then
    raise exception 'draw predictions in knockout matches must include a qualified team';
  end if;

  if match_record.stage <> 'group'
    and new.predicted_home_goals = new.predicted_away_goals
    and new.predicted_qualified_team_id is not null
    and new.predicted_qualified_team_id is distinct from match_record.home_team_id
    and new.predicted_qualified_team_id is distinct from match_record.away_team_id then
    raise exception 'qualified team must be one of the match teams';
  end if;

  return new;
end;
$$;

create trigger validate_match_prediction_before_write
before insert or update on public.match_predictions
for each row execute function app_private.validate_match_prediction();

create or replace function app_private.validate_champion_prediction()
returns trigger
language plpgsql
as $$
declare
  closes_at timestamptz;
begin
  select coalesce(
    (select champion_prediction_closes_at from public.scoring_rules where id),
    (select min(starts_at) from public.matches)
  )
  into closes_at;

  if closes_at is not null and closes_at <= now() then
    raise exception 'champion predictions are closed';
  end if;

  return new;
end;
$$;

create trigger validate_champion_prediction_before_write
before insert or update on public.champion_predictions
for each row execute function app_private.validate_champion_prediction();

alter table public.profiles enable row level security;
alter table public.teams enable row level security;
alter table public.matches enable row level security;
alter table public.match_predictions enable row level security;
alter table public.champion_predictions enable row level security;
alter table public.scoring_rules enable row level security;
alter table public.score_events enable row level security;
alter table public.sync_logs enable row level security;

create policy "profiles_select_self_or_approved_users"
on public.profiles for select
to authenticated
using (id = auth.uid() or app_private.is_approved(auth.uid()));

create policy "profiles_admin_all"
on public.profiles for all
to authenticated
using (app_private.is_admin(auth.uid()))
with check (app_private.is_admin(auth.uid()));

create policy "teams_read_approved"
on public.teams for select
to authenticated
using (app_private.is_approved(auth.uid()));

create policy "teams_admin_all"
on public.teams for all
to authenticated
using (app_private.is_admin(auth.uid()))
with check (app_private.is_admin(auth.uid()));

create policy "matches_read_approved"
on public.matches for select
to authenticated
using (app_private.is_approved(auth.uid()));

create policy "matches_admin_all"
on public.matches for all
to authenticated
using (app_private.is_admin(auth.uid()))
with check (app_private.is_admin(auth.uid()));

create policy "match_predictions_select_visible"
on public.match_predictions for select
to authenticated
using (
  app_private.is_approved(auth.uid())
  and (
    user_id = auth.uid()
    or exists (
      select 1 from public.matches
      where matches.id = match_predictions.match_id
        and (matches.starts_at <= now() or matches.status <> 'scheduled')
    )
  )
);

create policy "match_predictions_insert_own_open"
on public.match_predictions for insert
to authenticated
with check (
  app_private.is_approved(auth.uid())
  and user_id = auth.uid()
  and public.match_is_open(match_id)
);

create policy "match_predictions_update_own_open"
on public.match_predictions for update
to authenticated
using (
  app_private.is_approved(auth.uid())
  and user_id = auth.uid()
  and public.match_is_open(match_id)
)
with check (
  app_private.is_approved(auth.uid())
  and user_id = auth.uid()
  and public.match_is_open(match_id)
);

create policy "match_predictions_admin_all"
on public.match_predictions for all
to authenticated
using (app_private.is_admin(auth.uid()))
with check (app_private.is_admin(auth.uid()));

create policy "champion_predictions_select_own_or_closed"
on public.champion_predictions for select
to authenticated
using (
  app_private.is_approved(auth.uid())
  and (
    user_id = auth.uid()
    or now() >= coalesce(
      (select champion_prediction_closes_at from public.scoring_rules where id),
      (select min(starts_at) from public.matches)
    )
  )
);

create policy "champion_predictions_upsert_own_before_close"
on public.champion_predictions for insert
to authenticated
with check (app_private.is_approved(auth.uid()) and user_id = auth.uid());

create policy "champion_predictions_update_own_before_close"
on public.champion_predictions for update
to authenticated
using (app_private.is_approved(auth.uid()) and user_id = auth.uid())
with check (app_private.is_approved(auth.uid()) and user_id = auth.uid());

create policy "champion_predictions_admin_all"
on public.champion_predictions for all
to authenticated
using (app_private.is_admin(auth.uid()))
with check (app_private.is_admin(auth.uid()));

create policy "scoring_rules_read_approved"
on public.scoring_rules for select
to authenticated
using (app_private.is_approved(auth.uid()));

create policy "scoring_rules_admin_all"
on public.scoring_rules for all
to authenticated
using (app_private.is_admin(auth.uid()))
with check (app_private.is_admin(auth.uid()));

create policy "score_events_read_approved"
on public.score_events for select
to authenticated
using (app_private.is_approved(auth.uid()));

create policy "score_events_admin_all"
on public.score_events for all
to authenticated
using (app_private.is_admin(auth.uid()))
with check (app_private.is_admin(auth.uid()));

create policy "sync_logs_admin_read"
on public.sync_logs for select
to authenticated
using (app_private.is_admin(auth.uid()));

create policy "sync_logs_admin_all"
on public.sync_logs for all
to authenticated
using (app_private.is_admin(auth.uid()))
with check (app_private.is_admin(auth.uid()));

grant usage on schema public to anon, authenticated;
grant usage on schema app_private to authenticated;
grant execute on function app_private.is_approved(uuid) to authenticated;
grant execute on function app_private.is_admin(uuid) to authenticated;
grant execute on function public.match_is_open(uuid) to authenticated;

grant select, insert, update, delete on all tables in schema public to authenticated;
