-- Personal listen copies (Owner 2026-11-22): Studio, the recording page and the Windows program no longer get
-- the clean master. They get a 256 kbps MP3 with an inaudible mark tied to the copy id (one copy per account,
-- beat and master). The E3 host renders it; the leak tool reads beat_listen_copies to know whose copy a file is.
-- Service role only: no client policies.

create table if not exists public.beat_listen_copies (
  id uuid primary key default gen_random_uuid(),
  beat_id uuid not null references public.beats (id) on delete cascade,
  user_id uuid not null,
  master_asset_id uuid not null,
  status text not null default 'pending',
  object_key text,
  byte_size integer,
  attempts integer not null default 0,
  error_code text,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  ready_at timestamptz,
  last_used_at timestamptz not null default now(),
  -- 0 = someone is waiting in the Studio / program, 1 = background warm-up from the beat page.
  priority smallint not null default 0,
  constraint beat_listen_copies_status_chk check (status in ('pending', 'working', 'ready', 'failed')),
  constraint beat_listen_copies_error_chk check (error_code is null or error_code ~ '^[a-z_]{1,60}$'),
  constraint beat_listen_copies_uidx unique (beat_id, user_id, master_asset_id)
);

create index if not exists beat_listen_copies_queue_idx
  on public.beat_listen_copies (created_at)
  where status in ('pending', 'working');
create index if not exists beat_listen_copies_user_idx on public.beat_listen_copies (user_id, created_at desc);
create index if not exists beat_listen_copies_used_idx on public.beat_listen_copies (last_used_at);

alter table public.beat_listen_copies enable row level security;
revoke all on table public.beat_listen_copies from anon, authenticated;

comment on table public.beat_listen_copies is
  'Per-account watermarked MP3 listen copies of catalogue beats (Studio/recording/Windows). Service role only.';

create or replace function public.claim_beat_listen_copy()
returns setof public.beat_listen_copies
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  return query
  update public.beat_listen_copies c
     set status = 'working', claimed_at = now(), attempts = c.attempts + 1
   where c.id = (
     select q.id from public.beat_listen_copies q
      where (q.status = 'pending' or (q.status = 'working' and q.claimed_at < now() - interval '3 minutes'))
        and q.attempts < 3
      order by q.priority, q.created_at
      limit 1
      for update skip locked
   )
  returning c.*;
end;
$$;

revoke all on function public.claim_beat_listen_copy() from public, anon, authenticated;
grant execute on function public.claim_beat_listen_copy() to service_role;

-- One owner alert per kind, subject and day (scraping signal mails).
create table if not exists public.owner_alerts (
  kind text not null,
  subject text not null,
  day date not null,
  created_at timestamptz not null default now(),
  primary key (kind, subject, day),
  constraint owner_alerts_kind_chk check (kind ~ '^[a-z_]{3,40}$')
);

alter table public.owner_alerts enable row level security;
revoke all on table public.owner_alerts from anon, authenticated;
