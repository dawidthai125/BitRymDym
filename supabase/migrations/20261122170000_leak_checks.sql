-- Admin "Wycieki" (Owner 2026-11-22): the admin uploads a leaked file for a beat; the E3 host compares it with
-- every personal listen copy of that beat and stores whose copy it is. Service role only.

insert into storage.buckets (id, name, public, file_size_limit)
values ('leak-checks', 'leak-checks', false, 52428800)
on conflict (id) do nothing;

create table if not exists public.leak_checks (
  id uuid primary key default gen_random_uuid(),
  beat_id uuid not null references public.beats (id) on delete cascade,
  created_by uuid not null,
  file_name text not null,
  object_key text not null,
  status text not null default 'uploading',
  attempts integer not null default 0,
  claimed_at timestamptz,
  result jsonb,
  error_code text,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  constraint leak_checks_status_chk check (status in ('uploading', 'pending', 'working', 'done', 'failed')),
  constraint leak_checks_name_chk check (char_length(file_name) between 1 and 200),
  constraint leak_checks_error_chk check (error_code is null or error_code ~ '^[a-z_]{1,60}$')
);

create index if not exists leak_checks_queue_idx on public.leak_checks (created_at) where status in ('pending', 'working');
create index if not exists leak_checks_recent_idx on public.leak_checks (created_at desc);

alter table public.leak_checks enable row level security;
revoke all on table public.leak_checks from anon, authenticated;

create or replace function public.claim_leak_check()
returns setof public.leak_checks
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  return query
  update public.leak_checks c
     set status = 'working', claimed_at = now(), attempts = c.attempts + 1
   where c.id = (
     select q.id from public.leak_checks q
      where (q.status = 'pending' or (q.status = 'working' and q.claimed_at < now() - interval '10 minutes'))
        and q.attempts < 3
      order by q.created_at
      limit 1
      for update skip locked
   )
  returning c.*;
end;
$$;

revoke all on function public.claim_leak_check() from public, anon, authenticated;
grant execute on function public.claim_leak_check() to service_role;
