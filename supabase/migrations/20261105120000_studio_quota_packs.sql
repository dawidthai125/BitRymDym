-- One-off take and master packs.
-- Additive. A paid pack adds units once (grant_p24_quota_pack). The existing
-- claim functions spend one unit only after the plan allowance is already used.
-- Users may read their own balance. Writes are service_role only.
-- This file is not applied from the app. Apply it with the normal migration path.

create table public.studio_quota_credits (
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  remaining integer not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, kind),
  constraint studio_quota_credits_kind_chk check (kind in ('take', 'master')),
  constraint studio_quota_credits_remaining_chk check (remaining >= 0 and remaining <= 100000)
);

create trigger studio_quota_credits_set_updated_at
before update on public.studio_quota_credits
for each row
execute function public.set_updated_at();

create or replace function public.studio_quota_credits_service_role_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Only service_role may mutate studio_quota_credits' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger studio_quota_credits_service_role_only
before insert or update or delete on public.studio_quota_credits
for each row
execute function public.studio_quota_credits_service_role_only();

alter table public.studio_quota_credits enable row level security;

drop policy if exists studio_quota_credits_select_own on public.studio_quota_credits;
create policy studio_quota_credits_select_own
  on public.studio_quota_credits
  for select
  to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.studio_quota_credits from anon, authenticated;
grant select on public.studio_quota_credits to authenticated;
grant select, insert, update, delete on public.studio_quota_credits to service_role;

revoke all on function public.studio_quota_credits_service_role_only() from public, anon, authenticated;
grant execute on function public.studio_quota_credits_service_role_only() to service_role;

comment on table public.studio_quota_credits is
  'Spendable take/master credits from one-off packs. SELECT own row. Mutations service_role only.';

-- Spend one credit. False when the balance is missing or already zero.
create or replace function public.consume_studio_quota_credit(p_user_id uuid, p_kind text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_left integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'QUOTA_FORBIDDEN' using errcode = '42501';
  end if;
  if p_kind is distinct from 'take' and p_kind is distinct from 'master' then
    return false;
  end if;
  update public.studio_quota_credits
     set remaining = remaining - 1
   where user_id = p_user_id
     and kind = p_kind
     and remaining > 0
  returning remaining into v_left;
  return v_left is not null;
end;
$$;

revoke all on function public.consume_studio_quota_credit(uuid, text) from public, anon, authenticated;
grant execute on function public.consume_studio_quota_credit(uuid, text) to service_role;

-- Orders: pack is a third product. Plans and add-ons stay as they were.
alter table public.payment_orders add column if not exists pack text;

alter table public.payment_orders drop constraint if exists payment_orders_kind_chk;
alter table public.payment_orders add constraint payment_orders_kind_chk
  check (product_kind in ('plan', 'addon', 'pack'));

alter table public.payment_orders drop constraint if exists payment_orders_period_chk;
alter table public.payment_orders add constraint payment_orders_period_chk
  check (period in ('month', 'year', 'once'));

alter table public.payment_orders drop constraint if exists payment_orders_pack_chk;
alter table public.payment_orders add constraint payment_orders_pack_chk
  check (pack is null or pack in ('take', 'master'));

alter table public.payment_orders drop constraint if exists payment_orders_product_chk;
alter table public.payment_orders add constraint payment_orders_product_chk check (
  (product_kind = 'plan' and plan_tier is not null and addon is null and pack is null and period in ('month', 'year'))
  or
  (product_kind = 'addon' and addon = 'reference_mastering' and plan_tier is null and pack is null and period = 'month')
  or
  (product_kind = 'pack' and pack in ('take', 'master') and plan_tier is null and addon is null and period = 'once')
);

-- Idempotent pack grant. A second call on a paid order does not add units again.
-- Units are fixed here (10 takes / 5 masters), not taken from the client price.
create or replace function public.grant_p24_quota_pack(
  p_session_id text,
  p_amount integer,
  p_currency text,
  p_p24_order_id bigint,
  p_statement text,
  p_pack text,
  p_units integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.payment_orders%rowtype;
  v_left integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'PAYMENT_FORBIDDEN' using errcode = '42501';
  end if;
  if p_p24_order_id is null or p_p24_order_id <= 0 then
    return jsonb_build_object('result', 'conflict');
  end if;

  select * into v_order
  from public.payment_orders
  where session_id = p_session_id
  for update;

  if not found then
    return jsonb_build_object('result', 'missing');
  end if;

  if v_order.status = 'paid' and v_order.grant_status in ('granted', 'skipped') then
    return jsonb_build_object('result', 'already');
  end if;

  if v_order.status is distinct from 'pending' or v_order.grant_status is distinct from 'pending' then
    return jsonb_build_object('result', 'order_state');
  end if;

  if v_order.amount_grosz is distinct from p_amount
     or v_order.currency is distinct from p_currency
     or p_currency is distinct from 'PLN' then
    return jsonb_build_object('result', 'amount');
  end if;

  if v_order.product_kind is distinct from 'pack'
     or v_order.pack is distinct from p_pack
     or v_order.period is distinct from 'once'
     or p_pack not in ('take', 'master') then
    return jsonb_build_object('result', 'conflict');
  end if;

  if (p_pack = 'take' and p_units is distinct from 10)
     or (p_pack = 'master' and p_units is distinct from 5) then
    return jsonb_build_object('result', 'conflict');
  end if;

  insert into public.studio_quota_credits (user_id, kind, remaining)
  values (v_order.user_id, p_pack, p_units)
  on conflict (user_id, kind) do update
    set remaining = public.studio_quota_credits.remaining + excluded.remaining
    where public.studio_quota_credits.remaining + excluded.remaining <= 100000
  returning remaining into v_left;

  if v_left is null then
    return jsonb_build_object('result', 'conflict');
  end if;

  update public.payment_orders
  set status = 'paid',
      grant_status = 'granted',
      grant_note = null,
      p24_order_id = p_p24_order_id,
      p24_statement = left(coalesce(p_statement, ''), 200),
      paid_at = now(),
      granted_until = null
  where id = v_order.id;

  return jsonb_build_object('result', 'granted');
exception
  when unique_violation then
    return jsonb_build_object('result', 'conflict');
end;
$$;

revoke all on function public.grant_p24_quota_pack(text, integer, text, bigint, text, text, integer) from public, anon, authenticated;
grant execute on function public.grant_p24_quota_pack(text, integer, text, bigint, text, text, integer) to service_role;

-- Master claim: same signature. A pack credit is spent only when the plan month is full.
create or replace function public.claim_studio_master_job(
  p_job_id uuid,
  p_project_id uuid,
  p_owner_id uuid,
  p_target text,
  p_settings jsonb,
  p_source_document_version integer,
  p_month_limit integer,
  p_style text default null,
  p_style_intensity integer default 0,
  p_reference_id uuid default null,
  p_reference_intensity integer default 0)
returns table (allowed boolean, used integer, month_limit integer, reset_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  v_start timestamptz := public.studio_master_month_start(now());
  v_reset timestamptz := (date_trunc('month', now() at time zone 'Europe/Warsaw') + interval '1 month') at time zone 'Europe/Warsaw';
  v_used integer;
  v_left integer;
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
  end if;
  insert into public.studio_master_jobs (id, project_id, owner_id, kind, target, settings, source_document_version, output_format,
                                         style, style_intensity, reference_id, reference_intensity)
  values (p_job_id, p_project_id, p_owner_id, 'master', p_target, coalesce(p_settings, '{}'::jsonb), p_source_document_version, 'WAV_FLOAT',
          p_style, case when p_style is null then 0 else coalesce(p_style_intensity, 0) end,
          p_reference_id, case when p_reference_id is null then 0 else coalesce(p_reference_intensity, 0) end);
  select coalesce(c.remaining, 0) into v_left
    from public.studio_quota_credits c
   where c.user_id = p_owner_id and c.kind = 'master';
  v_left := coalesce(v_left, 0);
  return query select true, v_used + 1, greatest(v_used + 1, p_month_limit) + v_left, v_reset;
end $$;

revoke all on function public.claim_studio_master_job(uuid, uuid, uuid, text, jsonb, integer, integer, text, integer, uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_studio_master_job(uuid, uuid, uuid, text, jsonb, integer, integer, text, integer, uuid, integer) to service_role;

-- Take claim: same signature. A pack credit is spent only after today's plan sessions.
CREATE OR REPLACE FUNCTION public.claim_take_recording_session(
  p_owner_id uuid,
  p_beat_id uuid,
  p_take_id uuid,
  p_object_key text,
  p_content_type text,
  p_byte_size bigint,
  p_recording_mode public.take_recording_mode,
  p_beat_duration_seconds integer,
  p_recording_max_seconds integer,
  p_beat_bpm integer,
  p_expires_at timestamptz,
  p_max_active_ready integer,
  p_max_sessions_utc_day integer,
  p_replace_take_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_active_ready integer;
  v_sessions_today integer;
  v_utc_day_start timestamptz;
  v_replace public.takes%ROWTYPE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Only service_role may claim take recording sessions'
      USING ERRCODE = '42501';
  END IF;

  IF p_owner_id IS NULL OR p_beat_id IS NULL OR p_take_id IS NULL THEN
    RAISE EXCEPTION 'owner_id, beat_id and take_id are required';
  END IF;

  IF p_max_active_ready IS NULL OR p_max_active_ready < 0 THEN
    RAISE EXCEPTION 'Invalid max_active_ready';
  END IF;

  IF p_max_sessions_utc_day IS NULL OR p_max_sessions_utc_day < 1 THEN
    RAISE EXCEPTION 'Invalid max_sessions_utc_day';
  END IF;

  IF p_replace_take_id IS NOT NULL AND p_replace_take_id = p_take_id THEN
    RAISE EXCEPTION 'REPLACE_INVALID'
      USING ERRCODE = 'P0001';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_owner_id::text, 0));

  IF p_replace_take_id IS NOT NULL THEN
    SELECT * INTO v_replace
    FROM public.takes t
    WHERE t.id = p_replace_take_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'REPLACE_INVALID'
        USING ERRCODE = 'P0001';
    END IF;

    IF v_replace.owner_id IS DISTINCT FROM p_owner_id THEN
      RAISE EXCEPTION 'REPLACE_OWNERSHIP_DENIED'
        USING ERRCODE = 'P0001';
    END IF;

    IF v_replace.deleted_at IS NOT NULL OR v_replace.status = 'DELETED' THEN
      RAISE EXCEPTION 'REPLACE_INVALID'
        USING ERRCODE = 'P0001';
    END IF;

    IF v_replace.status IS DISTINCT FROM 'READY' THEN
      RAISE EXCEPTION 'REPLACE_NOT_READY'
        USING ERRCODE = 'P0001';
    END IF;

    IF v_replace.expires_at <= now() THEN
      RAISE EXCEPTION 'REPLACE_EXPIRED'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  SELECT count(*)::integer INTO v_active_ready
  FROM public.takes t
  WHERE t.owner_id = p_owner_id
    AND t.status = 'READY'
    AND t.deleted_at IS NULL
    AND t.expires_at > now();

  IF p_replace_take_id IS NULL THEN
    IF v_active_ready >= p_max_active_ready THEN
      RAISE EXCEPTION 'REPLACE_REQUIRED'
        USING ERRCODE = 'P0001';
    END IF;
  ELSE
    -- Valid replace reserves one slot: allow claim at/above prior DENY threshold.
    -- Still refuse pathological overshoot (active without counting reserved target).
    IF (v_active_ready - 1) >= p_max_active_ready THEN
      RAISE EXCEPTION 'REPLACE_REQUIRED'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  v_utc_day_start := date_trunc('day', timezone('utc', now()));

  SELECT count(*)::integer INTO v_sessions_today
  FROM public.takes t
  WHERE t.owner_id = p_owner_id
    AND t.created_at >= v_utc_day_start
    AND t.created_at < v_utc_day_start + interval '1 day';

  IF v_sessions_today >= p_max_sessions_utc_day THEN
    IF NOT public.consume_studio_quota_credit(p_owner_id, 'take') THEN
      RAISE EXCEPTION 'SESSION_DAY_CAP'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- STU-16: release the actor's own stale reservation (window elapsed, no
  -- object). Rolled back with the claim if anything below fails.
  UPDATE public.takes t
  SET status = 'FAILED',
      failure_reason = 'PENDING_UPLOAD_WINDOW_ELAPSED'
  WHERE t.owner_id = p_owner_id
    AND t.status = 'PENDING_UPLOAD'
    AND t.deleted_at IS NULL
    AND t.created_at <= now()
      - make_interval(secs => public.take_pending_upload_window_seconds())
    AND NOT EXISTS (
      SELECT 1
      FROM storage.objects o
      WHERE o.bucket_id = t.storage_bucket
        AND o.name = t.object_key
    );

  BEGIN
    INSERT INTO public.takes (
      id,
      owner_id,
      anonymous_token_hash,
      beat_id,
      status,
      recording_mode,
      storage_bucket,
      object_key,
      content_type,
      byte_size,
      beat_duration_seconds_snapshot,
      recording_max_seconds_snapshot,
      beat_bpm_snapshot,
      audio_offset_ms,
      expires_at,
      replaces_take_id
    ) VALUES (
      p_take_id,
      p_owner_id,
      NULL,
      p_beat_id,
      'PENDING_UPLOAD',
      p_recording_mode,
      'take-audio',
      p_object_key,
      p_content_type,
      p_byte_size,
      p_beat_duration_seconds,
      p_recording_max_seconds,
      p_beat_bpm,
      0,
      p_expires_at,
      p_replace_take_id
    );
  EXCEPTION
    WHEN unique_violation THEN
      IF SQLERRM ILIKE '%takes_one_pending_replace_target%'
         OR SQLERRM ILIKE '%replaces_take_id%' THEN
        RAISE EXCEPTION 'REPLACE_CONFLICT'
          USING ERRCODE = 'P0001';
      END IF;
      RAISE EXCEPTION 'CONCURRENT_SESSION'
        USING ERRCODE = 'P0001';
  END;

  RETURN p_take_id;
END;
$$;


REVOKE ALL ON FUNCTION public.claim_take_recording_session(
  uuid, uuid, uuid, text, text, bigint, public.take_recording_mode,
  integer, integer, integer, timestamptz, integer, integer, uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_take_recording_session(
  uuid, uuid, uuid, text, text, bigint, public.take_recording_mode,
  integer, integer, integer, timestamptz, integer, integer, uuid
) TO service_role;
