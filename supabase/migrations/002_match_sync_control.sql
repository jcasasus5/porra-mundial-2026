alter table public.matches
add column if not exists manual_override boolean not null default false,
add column if not exists last_result_checked_at timestamptz,
add column if not exists result_synced_at timestamptz;

create index if not exists matches_result_polling_idx
on public.matches (status, starts_at)
where manual_override = false;
