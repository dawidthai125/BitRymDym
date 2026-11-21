-- Own rate limit for auth attempts (sign-in, password reset, sign-up, re-auth).
-- Keys are pre-hashed by the app (HMAC/SHA-256); no raw e-mail or IP is stored.
-- service_role only: the function is SECURITY DEFINER and not executable by anon/authenticated.

create table if not exists public.auth_attempts (
  id bigserial primary key,
  action text not null,
  key_hash text not null,
  created_at timestamptz not null default now()
);

alter table public.auth_attempts enable row level security;
revoke all on public.auth_attempts from anon, authenticated;
revoke all on sequence public.auth_attempts_id_seq from anon, authenticated;
grant select, insert, delete on public.auth_attempts to service_role;
grant usage, select on sequence public.auth_attempts_id_seq to service_role;

create index if not exists auth_attempts_lookup_idx
  on public.auth_attempts (action, key_hash, created_at);
create index if not exists auth_attempts_created_at_idx
  on public.auth_attempts (created_at);

comment on table public.auth_attempts is
  'Auth attempt log for rate limiting. Hashed keys only. RLS on, no policies; service_role only.';

create or replace function public.auth_attempts_cleanup()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  delete from public.auth_attempts where created_at < now() - interval '2 days';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.auth_attempts_cleanup() from public, anon, authenticated;
grant execute on function public.auth_attempts_cleanup() to service_role;

-- Returns one row: status 'ok' | 'blocked', retry_after_seconds (0 when ok).
-- When p_record is true and the attempt is allowed it is recorded atomically
-- (advisory xact lock per action+key serialises concurrent attempts).
-- Blocked attempts are not recorded, so the window slides naturally.
create or replace function public.auth_attempt_check(
  p_action text,
  p_key_hash text,
  p_max int,
  p_window_seconds int,
  p_record boolean default true
)
returns table (status text, retry_after_seconds int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_since timestamptz;
  v_count int;
  v_oldest timestamptz;
  v_retry int;
begin
  if p_action is null or p_key_hash is null or p_max < 1 or p_window_seconds < 1 then
    raise exception 'invalid arguments';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_action || ':' || p_key_hash, 0));

  v_since := now() - make_interval(secs => p_window_seconds);

  select count(*), min(created_at)
    into v_count, v_oldest
    from public.auth_attempts
   where action = p_action and key_hash = p_key_hash and created_at > v_since;

  if v_count >= p_max then
    v_retry := greatest(1, ceil(extract(epoch from (v_oldest + make_interval(secs => p_window_seconds) - now())))::int);
    return query select 'blocked'::text, v_retry;
    return;
  end if;

  if p_record then
    insert into public.auth_attempts (action, key_hash) values (p_action, p_key_hash);
    -- Opportunistic cleanup (~1% of writes).
    if random() < 0.01 then
      perform public.auth_attempts_cleanup();
    end if;
  end if;

  return query select 'ok'::text, 0;
end;
$$;

revoke all on function public.auth_attempt_check(text, text, int, int, boolean) from public, anon, authenticated;
grant execute on function public.auth_attempt_check(text, text, int, int, boolean) to service_role;
