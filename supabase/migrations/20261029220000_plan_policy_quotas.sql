-- Plan policy (Owner 2026-10-29, t45s320) — server-side quotas that need the DB.
--   1. Monthly E3 master quota (FREE 8 / BRONZE 30 / SILVER 80 / GOLD 200 per
--      calendar month, Europe/Warsaw). Atomic check + insert under a per-owner
--      advisory lock, so parallel commits cannot overshoot. Failed / cancelled
--      jobs do not count. The limit itself comes from the app SSOT
--      (src/config/plan-policy.ts) — the RPC only enforces what it is given.
--   2. Take retention extension after an upgrade: live takes get
--      expires_at = greatest(expires_at, created_at + new plan TTL). Never shortens.
-- Additive only: no table changes, no data rewrite on apply. service_role only.

create index if not exists studio_master_jobs_owner_master_month_idx
  on public.studio_master_jobs (owner_id, created_at)
  where kind = 'master';

-- Start of the current calendar month in Europe/Warsaw, as timestamptz.
create or replace function public.studio_master_month_start(p_at timestamptz default now())
returns timestamptz
language sql stable set search_path = public as $$
  select (date_trunc('month', p_at at time zone 'Europe/Warsaw')) at time zone 'Europe/Warsaw'
$$;

create or replace function public.claim_studio_master_job(
  p_job_id uuid,
  p_project_id uuid,
  p_owner_id uuid,
  p_target text,
  p_settings jsonb,
  p_source_document_version integer,
  p_month_limit integer)
returns table (allowed boolean, used integer, month_limit integer, reset_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  v_start timestamptz := public.studio_master_month_start(now());
  v_reset timestamptz := (date_trunc('month', now() at time zone 'Europe/Warsaw') + interval '1 month') at time zone 'Europe/Warsaw';
  v_used integer;
begin
  if p_month_limit is null or p_month_limit < 0 then
    raise exception 'MASTER_LIMIT_INVALID' using errcode = '22023';
  end if;
  if not exists (select 1 from public.studio_projects where id = p_project_id and owner_id = p_owner_id) then
    raise exception 'MASTER_PROJECT_OWNER_MISMATCH' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('studio_master_month:' || p_owner_id::text, 0));
  select count(*) into v_used
    from public.studio_master_jobs
   where owner_id = p_owner_id and kind = 'master'
     and created_at >= v_start
     and status not in ('failed', 'cancelled');
  if v_used >= p_month_limit then
    return query select false, v_used, p_month_limit, v_reset;
    return;
  end if;
  insert into public.studio_master_jobs (id, project_id, owner_id, kind, target, settings, source_document_version, output_format)
  values (p_job_id, p_project_id, p_owner_id, 'master', p_target, coalesce(p_settings, '{}'::jsonb), p_source_document_version, 'WAV_FLOAT');
  return query select true, v_used + 1, p_month_limit, v_reset;
end $$;

revoke all on function public.claim_studio_master_job(uuid, uuid, uuid, text, jsonb, integer, integer) from public, anon, authenticated;
grant execute on function public.claim_studio_master_job(uuid, uuid, uuid, text, jsonb, integer, integer) to service_role;
revoke all on function public.studio_master_month_start(timestamptz) from public, anon, authenticated;
grant execute on function public.studio_master_month_start(timestamptz) to service_role;

-- Upgrade → longer validity for takes that are still alive. Returns rows touched.
create or replace function public.extend_take_retention_for_owner(p_owner_id uuid, p_ttl_seconds integer)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
begin
  if p_ttl_seconds is null or p_ttl_seconds <= 0 or p_ttl_seconds > 30 * 24 * 3600 then
    raise exception 'TAKE_TTL_INVALID' using errcode = '22023';
  end if;
  update public.takes t
     set expires_at = t.created_at + make_interval(secs => p_ttl_seconds)
   where t.owner_id = p_owner_id
     and t.deleted_at is null
     and t.status in ('READY', 'PENDING_UPLOAD')
     and t.expires_at > now()
     and t.created_at + make_interval(secs => p_ttl_seconds) > t.expires_at;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke all on function public.extend_take_retention_for_owner(uuid, integer) from public, anon, authenticated;
grant execute on function public.extend_take_retention_for_owner(uuid, integer) to service_role;
