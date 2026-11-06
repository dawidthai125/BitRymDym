-- YouTube MP4 packs.
-- Gold keeps 2 videos per Warsaw week in the plan. A paid pack adds credits
-- (Gold 2, Silver 1, Bronze 1). The charged grosz decides the units.
-- enqueue_studio_youtube_video spends the week first, then one credit, in one transaction.
-- This file is not applied from the app. Apply it with the normal migration path.

alter table public.studio_quota_credits drop constraint if exists studio_quota_credits_kind_chk;
alter table public.studio_quota_credits add constraint studio_quota_credits_kind_chk
  check (kind in ('take', 'master', 'youtube'));

alter table public.payment_orders drop constraint if exists payment_orders_pack_chk;
alter table public.payment_orders add constraint payment_orders_pack_chk
  check (pack is null or pack in ('take', 'master', 'youtube'));

alter table public.payment_orders drop constraint if exists payment_orders_product_chk;
alter table public.payment_orders add constraint payment_orders_product_chk check (
  (product_kind = 'plan' and plan_tier is not null and addon is null and pack is null and period in ('month', 'year'))
  or
  (product_kind = 'addon' and addon = 'reference_mastering' and plan_tier is null and pack is null and period = 'month')
  or
  (product_kind = 'pack' and pack in ('take', 'master', 'youtube') and plan_tier is null and addon is null and period = 'once')
);

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
  if p_kind is distinct from 'take' and p_kind is distinct from 'master' and p_kind is distinct from 'youtube' then
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
     or p_pack not in ('take', 'master', 'youtube') then
    return jsonb_build_object('result', 'conflict');
  end if;

  if p_pack = 'youtube' then
    if not (
      (p_amount = 999 and p_units = 2)
      or (p_amount = 1499 and p_units = 1)
      or (p_amount = 2499 and p_units = 1)
    ) then
      return jsonb_build_object('result', 'conflict');
    end if;
  elsif (p_pack = 'take' and p_units is distinct from 10)
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

-- Queue one YouTube MP4. Locks the owner's youtube credit row, counts this week's
-- jobs, then either uses the plan allowance or spends one credit. The insert rolls
-- back with the credit if it fails.
create or replace function public.enqueue_studio_youtube_video(
  p_job_id uuid,
  p_project_id uuid,
  p_owner_id uuid,
  p_source_artifact_id uuid,
  p_source_document_version integer,
  p_video jsonb,
  p_week_start timestamptz,
  p_week_limit integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_credits integer;
  v_used integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'QUOTA_FORBIDDEN' using errcode = '42501';
  end if;
  if p_week_limit is distinct from 0 and p_week_limit is distinct from 2 then
    return jsonb_build_object('result', 'bad_limit');
  end if;
  if p_video is null or pg_column_size(p_video) > 2048 then
    return jsonb_build_object('result', 'bad_video');
  end if;

  insert into public.studio_quota_credits (user_id, kind, remaining)
  values (p_owner_id, 'youtube', 0)
  on conflict (user_id, kind) do nothing;

  select remaining into v_credits
  from public.studio_quota_credits
  where user_id = p_owner_id and kind = 'youtube'
  for update;

  select count(*) into v_used
  from public.studio_master_jobs
  where owner_id = p_owner_id
    and kind = 'youtube_video'
    and created_at >= p_week_start
    and status not in ('failed', 'cancelled');

  if v_used >= p_week_limit then
    if v_credits is null or v_credits <= 0 then
      return jsonb_build_object('result', 'limit');
    end if;
    update public.studio_quota_credits
       set remaining = remaining - 1
     where user_id = p_owner_id and kind = 'youtube' and remaining > 0;
  end if;

  insert into public.studio_master_jobs (
    id, project_id, owner_id, kind, output_format, source_artifact_id, source_document_version, video
  ) values (
    p_job_id, p_project_id, p_owner_id, 'youtube_video', 'MP4', p_source_artifact_id, p_source_document_version, p_video
  );

  return jsonb_build_object('result', 'ok');
end;
$$;

revoke all on function public.enqueue_studio_youtube_video(uuid, uuid, uuid, uuid, integer, jsonb, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.enqueue_studio_youtube_video(uuid, uuid, uuid, uuid, integer, jsonb, timestamptz, integer) to service_role;
