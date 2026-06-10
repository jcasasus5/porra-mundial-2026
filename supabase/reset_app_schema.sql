begin;

drop trigger if exists on_auth_user_created on auth.users;

drop table if exists public.score_events cascade;
drop table if exists public.sync_logs cascade;
drop table if exists public.match_predictions cascade;
drop table if exists public.champion_predictions cascade;
drop table if exists public.scoring_rules cascade;
drop table if exists public.matches cascade;
drop table if exists public.teams cascade;
drop table if exists public.profiles cascade;

drop function if exists public.match_is_open(uuid) cascade;
drop schema if exists app_private cascade;

drop type if exists public.score_reason cascade;
drop type if exists public.match_status cascade;
drop type if exists public.match_stage cascade;
drop type if exists public.user_status cascade;
drop type if exists public.user_role cascade;

commit;
