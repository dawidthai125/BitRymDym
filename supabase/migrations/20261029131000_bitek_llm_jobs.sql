-- BITEK chat: DB queue for the self-hosted E3 model (stage 1b).
-- Vercel route (service_role) enqueues + polls; E3 worker (service_role) claims with SKIP LOCKED.
-- Payload = chat messages only (system prompt + turns); no user id, no e-mail.

create table if not exists public.bitek_llm_jobs (
  id uuid primary key default gen_random_uuid(),
  messages jsonb not null check (jsonb_typeof(messages) = 'array' and octet_length(messages::text) <= 65536),
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'error', 'expired')),
  result text check (result is null or char_length(result) <= 8000),
  error_code text check (error_code is null or char_length(error_code) <= 64),
  worker_ref text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '25 seconds',
  claimed_at timestamptz,
  finished_at timestamptz
);

create index if not exists bitek_llm_jobs_queued_idx on public.bitek_llm_jobs (created_at) where status = 'queued';
create index if not exists bitek_llm_jobs_created_idx on public.bitek_llm_jobs (created_at);

alter table public.bitek_llm_jobs enable row level security;
-- No policies: only service_role (bypasses RLS) touches this table.
revoke all on public.bitek_llm_jobs from public, anon, authenticated;
grant select, insert, update, delete on public.bitek_llm_jobs to service_role;

create or replace function public.claim_next_bitek_llm_job(p_worker_ref text)
returns setof public.bitek_llm_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_ref text := nullif(btrim(p_worker_ref), '');
  v_now timestamptz := clock_timestamp();
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Only service_role may claim_next_bitek_llm_job';
  end if;
  if v_ref is null then
    raise exception 'worker_ref required';
  end if;

  update public.bitek_llm_jobs
  set status = 'expired', finished_at = v_now
  where status = 'queued' and expires_at < v_now;

  select j.id into v_id
  from public.bitek_llm_jobs j
  where j.status = 'queued' and j.expires_at >= v_now
  order by j.created_at
  for update skip locked
  limit 1;
  if v_id is null then
    return;
  end if;

  return query
  update public.bitek_llm_jobs j
  set status = 'running', worker_ref = v_ref, claimed_at = v_now
  where j.id = v_id
  returning j.*;
end;
$$;

create or replace function public.complete_bitek_llm_job(
  p_id uuid,
  p_worker_ref text,
  p_result text,
  p_error_code text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Only service_role may complete_bitek_llm_job';
  end if;
  update public.bitek_llm_jobs
  set status = case when p_error_code is null and p_result is not null then 'done' else 'error' end,
      result = left(p_result, 8000),
      error_code = left(p_error_code, 64),
      finished_at = clock_timestamp()
  where id = p_id and status = 'running' and worker_ref = p_worker_ref;
  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;

-- Housekeeping: delete finished/abandoned jobs older than p_keep_minutes (default 60).
create or replace function public.purge_bitek_llm_jobs(p_keep_minutes integer default 60)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Only service_role may purge_bitek_llm_jobs';
  end if;
  delete from public.bitek_llm_jobs
  where created_at < clock_timestamp() - make_interval(mins => greatest(5, least(coalesce(p_keep_minutes, 60), 10080)));
  get diagnostics v_count = row_count;
  delete from public.bitek_chat_usage where day < (now() at time zone 'utc')::date - 30;
  return v_count;
end;
$$;

revoke all on function public.claim_next_bitek_llm_job(text) from public, anon, authenticated;
revoke all on function public.complete_bitek_llm_job(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.purge_bitek_llm_jobs(integer) from public, anon, authenticated;
grant execute on function public.claim_next_bitek_llm_job(text) to service_role;
grant execute on function public.complete_bitek_llm_job(uuid, text, text, text) to service_role;
grant execute on function public.purge_bitek_llm_jobs(integer) to service_role;

comment on table public.bitek_llm_jobs is
  'BITEK chat queue for the E3 model. service_role only. Messages carry no user identifiers; rows purged after ~1h.';
