-- Atomic usage claims for costly AI calls (closes check-then-insert races).
-- * claim_ai_lyrics_usage / claim_ai_cover_usage: under a per-owner advisory lock count today's
--   usage (ok + fresh pending toward the daily cap; failed + stale pending only toward a higher
--   attempts cap), allow at most one fresh pending per user, insert the reservation row.
--   p_since = window start computed by the app (Warsaw day start moved forward by admin reset).
-- * sampek_usage + claim_sampek_usage: durable hourly cap + short single-flight for Sampek.
-- Service role only. Idempotent.

-- 1) AI lyrics ----------------------------------------------------------------
create or replace function public.claim_ai_lyrics_usage(
  p_owner uuid,
  p_usage_id uuid,
  p_project_id uuid,
  p_mode text,
  p_input_chars integer,
  p_since timestamptz,
  p_per_day integer,
  p_max_attempts integer default null,
  p_busy_seconds integer default 300)
returns table (status text, used integer)
language plpgsql security definer set search_path = public as $$
declare
  v_used integer;
  v_total integer;
  v_busy boolean;
  v_max integer := coalesce(p_max_attempts, p_per_day * 3);
begin
  if p_owner is null or p_usage_id is null or p_per_day is null or p_per_day < 0 then
    raise exception 'AI_USAGE_INVALID' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('ai_lyrics_usage:' || p_owner::text, 0));
  select count(*) filter (where u.status = 'ok'
                            or (u.status = 'pending' and u.created_at > now() - make_interval(secs => p_busy_seconds))),
         count(*),
         coalesce(bool_or(u.status = 'pending' and u.created_at > now() - make_interval(secs => p_busy_seconds)), false)
    into v_used, v_total, v_busy
    from public.studio_ai_lyrics_usage u
   where u.owner_id = p_owner and u.created_at >= p_since;
  if v_used >= p_per_day or v_total >= v_max then
    return query select 'daily_limit'::text, v_used;
    return;
  end if;
  if v_busy then
    return query select 'busy'::text, v_used;
    return;
  end if;
  insert into public.studio_ai_lyrics_usage (id, owner_id, project_id, mode, input_chars, status)
  values (p_usage_id, p_owner, p_project_id, p_mode, p_input_chars, 'pending');
  return query select 'ok'::text, v_used + 1;
end;
$$;
revoke all on function public.claim_ai_lyrics_usage(uuid, uuid, uuid, text, integer, timestamptz, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.claim_ai_lyrics_usage(uuid, uuid, uuid, text, integer, timestamptz, integer, integer, integer) to service_role;

-- 2) AI cover -----------------------------------------------------------------
create or replace function public.claim_ai_cover_usage(
  p_owner uuid,
  p_usage_id uuid,
  p_project_id uuid,
  p_aspect text,
  p_since timestamptz,
  p_per_day integer,
  p_max_attempts integer default null,
  p_busy_seconds integer default 300)
returns table (status text, used integer)
language plpgsql security definer set search_path = public as $$
declare
  v_used integer;
  v_total integer;
  v_busy boolean;
  v_max integer := coalesce(p_max_attempts, p_per_day * 3);
begin
  if p_owner is null or p_usage_id is null or p_per_day is null or p_per_day < 0 then
    raise exception 'AI_USAGE_INVALID' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('ai_cover_usage:' || p_owner::text, 0));
  select count(*) filter (where u.status in ('ok', 'image_rejected')
                            or (u.status = 'pending' and u.created_at > now() - make_interval(secs => p_busy_seconds))),
         count(*),
         coalesce(bool_or(u.status = 'pending' and u.created_at > now() - make_interval(secs => p_busy_seconds)), false)
    into v_used, v_total, v_busy
    from public.studio_ai_cover_usage u
   where u.owner_id = p_owner and u.created_at >= p_since;
  if v_used >= p_per_day or v_total >= v_max then
    return query select 'daily_limit'::text, v_used;
    return;
  end if;
  if v_busy then
    return query select 'busy'::text, v_used;
    return;
  end if;
  insert into public.studio_ai_cover_usage (id, owner_id, project_id, aspect, status)
  values (p_usage_id, p_owner, p_project_id, p_aspect, 'pending');
  return query select 'ok'::text, v_used + 1;
end;
$$;
revoke all on function public.claim_ai_cover_usage(uuid, uuid, uuid, text, timestamptz, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.claim_ai_cover_usage(uuid, uuid, uuid, text, timestamptz, integer, integer, integer) to service_role;

-- 3) Sampek -------------------------------------------------------------------
create table if not exists public.sampek_usage (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  created_at timestamptz not null default now()
);
create index if not exists sampek_usage_owner_created_idx on public.sampek_usage (owner_id, created_at);
alter table public.sampek_usage enable row level security;
revoke all on public.sampek_usage from anon, authenticated;
grant select, insert, delete on public.sampek_usage to service_role;

create or replace function public.claim_sampek_usage(
  p_owner uuid,
  p_per_hour integer,
  p_busy_seconds integer default 5)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_hour integer;
  v_busy boolean;
begin
  if p_owner is null or p_per_hour is null or p_per_hour < 0 then
    raise exception 'SAMPEK_USAGE_INVALID' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('sampek_usage:' || p_owner::text, 0));
  delete from public.sampek_usage where owner_id = p_owner and created_at < now() - interval '2 hours';
  select count(*),
         coalesce(bool_or(created_at > now() - make_interval(secs => p_busy_seconds)), false)
    into v_hour, v_busy
    from public.sampek_usage
   where owner_id = p_owner and created_at > now() - interval '1 hour';
  if v_busy then
    return 'busy';
  end if;
  if v_hour >= p_per_hour then
    return 'rate_limit';
  end if;
  insert into public.sampek_usage (owner_id) values (p_owner);
  return 'ok';
end;
$$;
revoke all on function public.claim_sampek_usage(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.claim_sampek_usage(uuid, integer, integer) to service_role;
