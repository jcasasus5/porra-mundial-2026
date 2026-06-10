update public.scoring_rules
set knockout_qualified_bonus_points = 1
where id = true;

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

  if match_record.stage = 'group' and new.predicted_qualified_team_id is not null then
    raise exception 'group matches cannot have a qualified team prediction';
  end if;

  if match_record.stage <> 'group'
    and match_record.home_team_id is not null
    and match_record.away_team_id is not null
    and new.predicted_qualified_team_id is null then
    raise exception 'knockout matches must include a qualified team prediction';
  end if;

  if match_record.stage <> 'group'
    and new.predicted_qualified_team_id is not null
    and new.predicted_qualified_team_id is distinct from match_record.home_team_id
    and new.predicted_qualified_team_id is distinct from match_record.away_team_id then
    raise exception 'qualified team must be one of the match teams';
  end if;

  return new;
end;
$$;
