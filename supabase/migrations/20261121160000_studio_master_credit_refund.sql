-- Studio mastering: return a spent pack credit when the master job fails (W8).
-- * A plan slot needs no refund: the month count already skips failed/cancelled jobs.
-- * A pack credit (studio_quota_credits kind 'master') was lost on failure. The claim now marks
--   the job with credit_spent, and the first move to 'failed' gives the credit back once.
-- * Exactly once: refund_studio_master_credit flips credit_refunded_at from null under the row
--   lock. A repeated failure callback, a manual retry or a success never refunds again.
-- * complete_studio_master_job refunds in the same transaction. A refund error only raises a
--   warning, so the job still finishes (credit_refunded_at stays null and the refund can be
--   retried with refund_studio_master_credit).
-- Additive. Service role only. Same RPC signatures, so the E3 worker needs no change.

alter table public.studio_master_jobs
  add column if not exists credit_spent boolean not null default false,
  add column if not exists credit_refunded_at timestamptz;

alter table public.studio_master_jobs drop constraint if exists studio_master_jobs_refund_chk;
alter table public.studio_master_jobs add constraint studio_master_jobs_refund_chk
  check (credit_refunded_at is null or (credit_spent and kind = 'master' and status = 'failed'));

comment on column public.studio_master_jobs.credit_spent is
  'True when claim_studio_master_job spent one pack credit (plan month already full).';
comment on column public.studio_master_jobs.credit_refunded_at is
  'Set once when the spent pack credit was returned after the job failed.';

-- 1) Idempotent refund -------------------------------------------------------
create or replace function public.refund_studio_master_credit(p_job_id uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'QUOTA_FORBIDDEN' using errcode = '42501';
  end if;
  update public.studio_master_jobs
     set credit_refunded_at = now()
   where id = p_job_id
     and kind = 'master'
     and status = 'failed'
     and credit_spent
     and credit_refunded_at is null
  returning owner_id into v_owner;
  if v_owner is null then
    return false;
  end if;
  insert into public.studio_quota_credits (user_id, kind, remaining)
  values (v_owner, 'master', 1)
  on conflict (user_id, kind) do update
    set remaining = least(public.studio_quota_credits.remaining + 1, 100000);
  return true;
end;
$$;
revoke all on function public.refund_studio_master_credit(uuid) from public, anon, authenticated;
grant execute on function public.refund_studio_master_credit(uuid) to service_role;

-- 2) Worker completion: refund on the move to 'failed' -----------------------
create or replace function public.complete_studio_master_job(
  p_job_id uuid, p_worker_ref text, p_status text, p_result_object_key text, p_metrics jsonb, p_error_code text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('succeeded', 'failed') then
    raise exception 'STUDIO_MASTER_BAD_STATUS' using errcode = '22023';
  end if;
  update public.studio_master_jobs
     set status = p_status, result_object_key = p_result_object_key, metrics = p_metrics,
         error_code = p_error_code, finished_at = now()
   where id = p_job_id and worker_ref = p_worker_ref and status = 'running';
  if not found then
    raise exception 'STUDIO_MASTER_NOT_CLAIMED' using errcode = 'P0002';
  end if;
  if p_status = 'failed' then
    begin
      perform public.refund_studio_master_credit(p_job_id);
    exception when others then
      raise warning 'STUDIO_MASTER_REFUND_FAILED job=% sqlstate=%', p_job_id, sqlstate;
    end;
  end if;
end $$;
revoke all on function public.complete_studio_master_job(uuid, text, text, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.complete_studio_master_job(uuid, text, text, text, jsonb, text) to service_role;

-- 3) Master claim: same signature and rules (20261120090000), now records credit_spent ----
create or replace function public.claim_studio_master_job(p_job_id uuid, p_project_id uuid, p_owner_id uuid, p_target text, p_settings jsonb, p_source_document_version integer, p_month_limit integer, p_style text default null::text, p_style_intensity integer default 0, p_reference_id uuid default null::uuid, p_reference_intensity integer default 0)
 returns table(allowed boolean, used integer, month_limit integer, reset_at timestamp with time zone)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_start timestamptz := public.studio_master_month_start(now());
  v_reset timestamptz := (date_trunc('month', now() at time zone 'Europe/Warsaw') + interval '1 month') at time zone 'Europe/Warsaw';
  v_used integer;
  v_left integer;
  v_credit boolean := false;
begin
  if p_month_limit is null or p_month_limit < 0 then
    raise exception 'MASTER_LIMIT_INVALID' using errcode = '22023';
  end if;
  if not exists (select 1 from public.studio_projects where id = p_project_id and owner_id = p_owner_id) then
    raise exception 'MASTER_PROJECT_OWNER_MISMATCH' using errcode = '42501';
  end if;
  if p_reference_id is not null and not exists (
    select 1 from public.studio_master_references r
     where r.id = p_reference_id and r.owner_id = p_owner_id and r.project_id = p_project_id
       and r.status = 'ready' and r.expires_at > now()) then
    raise exception 'MASTER_REFERENCE_INVALID' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('studio_master_month:' || p_owner_id::text, 0));
  v_start := greatest(v_start, coalesce(public.usage_reset_at(p_owner_id, 'masters'), v_start));
  select count(*) into v_used
    from public.studio_master_jobs
   where owner_id = p_owner_id and kind = 'master'
     and created_at >= v_start
     and status not in ('failed', 'cancelled');
  if v_used >= p_month_limit then
    if not public.consume_studio_quota_credit(p_owner_id, 'master') then
      return query select false, v_used, greatest(v_used, p_month_limit), v_reset;
      return;
    end if;
    v_credit := true;
  end if;
  insert into public.studio_master_jobs (id, project_id, owner_id, kind, target, settings, source_document_version, output_format,
                                         style, style_intensity, reference_id, reference_intensity, credit_spent)
  values (p_job_id, p_project_id, p_owner_id, 'master', p_target, coalesce(p_settings, '{}'::jsonb), p_source_document_version, 'WAV_FLOAT',
          p_style, case when p_style is null then 0 else coalesce(p_style_intensity, 0) end,
          p_reference_id, case when p_reference_id is null then 0 else coalesce(p_reference_intensity, 0) end, v_credit);
  select coalesce(c.remaining, 0) into v_left
    from public.studio_quota_credits c
   where c.user_id = p_owner_id and c.kind = 'master';
  v_left := coalesce(v_left, 0);
  return query select true, v_used + 1, greatest(v_used + 1, p_month_limit) + v_left, v_reset;
end $function$;
revoke all on function public.claim_studio_master_job(uuid, uuid, uuid, text, jsonb, integer, integer, text, integer, uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_studio_master_job(uuid, uuid, uuid, text, jsonb, integer, integer, text, integer, uuid, integer) to service_role;
