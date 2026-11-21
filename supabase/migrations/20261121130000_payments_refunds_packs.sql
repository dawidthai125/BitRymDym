-- Refunds, one source of truth for pack units, review queue, failed->paid reopen.
-- Idempotent and additive. Not applied from the app. Apply with the normal migration path.
--
-- * payment_orders.status gains 'refunded' (+ refunded_at, provider_refund_id, granted_units).
-- * payment_order_reviews: operator queue (partial refunds, refunds that cannot be undone safely,
--   paid orders with an unknown pack amount, failed orders that PayU did not confirm).
-- * grant_p24_quota_pack keeps its signature (old callers keep working during rollout) but trusts
--   p_units computed in TypeScript (plan-policy.ts) and stores it in payment_orders.granted_units.
-- * reopen_failed_payment_order: a verified COMPLETED notice after CANCELED moves failed -> pending,
--   then the normal grant RPCs run.
-- * apply_p24_refund: locks the order row, marks it refunded and revokes what that order granted
--   only when the grant is provably still the one this order wrote.

alter table public.payment_orders drop constraint if exists payment_orders_status_chk;
alter table public.payment_orders add constraint payment_orders_status_chk
  check (status in ('pending', 'paid', 'failed', 'refunded'));

alter table public.payment_orders add column if not exists granted_units integer;
alter table public.payment_orders add column if not exists refunded_at timestamptz;
alter table public.payment_orders add column if not exists provider_refund_id text;

alter table public.payment_orders drop constraint if exists payment_orders_granted_units_chk;
alter table public.payment_orders add constraint payment_orders_granted_units_chk
  check (granted_units is null or (granted_units > 0 and granted_units <= 1000));

alter table public.payment_orders drop constraint if exists payment_orders_refund_id_chk;
alter table public.payment_orders add constraint payment_orders_refund_id_chk
  check (provider_refund_id is null or provider_refund_id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$');

create table if not exists public.payment_order_reviews (
  id uuid primary key default gen_random_uuid(),
  order_ref text not null,
  order_id uuid,
  reason text not null,
  provider_ref text not null default '',
  details jsonb not null default '{}'::jsonb,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint payment_order_reviews_reason_chk check (reason ~ '^[a-z_]{3,60}$'),
  constraint payment_order_reviews_status_chk check (status in ('open', 'resolved')),
  constraint payment_order_reviews_ref_chk check (char_length(order_ref) between 1 and 100 and char_length(provider_ref) <= 100),
  constraint payment_order_reviews_uidx unique (order_ref, reason, provider_ref)
);

create index if not exists payment_order_reviews_open_idx
  on public.payment_order_reviews (created_at desc) where status = 'open';

alter table public.payment_order_reviews enable row level security;
revoke all on public.payment_order_reviews from anon, authenticated;
grant select, insert, update on public.payment_order_reviews to service_role;

comment on table public.payment_order_reviews is
  'Operator queue for payments that need a human. service_role only (no policies).';

-- Same signature as before. Units come from plan-policy.ts via the caller; SQL no longer hard-codes prices.
create or replace function public.grant_p24_quota_pack(
  p_session_id text,
  p_amount integer,
  p_currency text,
  p_p24_order_id text,
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
  if p_p24_order_id is null or p_p24_order_id !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$' then
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
  if v_order.status = 'refunded' then
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
     or p_pack not in ('take', 'master', 'youtube')
     or p_units is null
     or p_units < 1
     or p_units > 1000 then
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
      granted_units = p_units,
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

revoke all on function public.grant_p24_quota_pack(text, integer, text, text, text, text, integer) from public, anon, authenticated;
grant execute on function public.grant_p24_quota_pack(text, integer, text, text, text, text, integer) to service_role;

-- failed -> pending, only for an order that never granted anything. The caller has already verified
-- COMPLETED with PayU (amount, currency, POS). Grant RPCs then run unchanged.
create or replace function public.reopen_failed_payment_order(p_session_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.payment_orders%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'PAYMENT_FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_order
  from public.payment_orders
  where session_id = p_session_id
  for update;

  if not found then
    return jsonb_build_object('result', 'missing');
  end if;
  if v_order.status = 'pending' then
    return jsonb_build_object('result', 'reopened');
  end if;
  if v_order.status = 'failed' and v_order.grant_status = 'pending' and v_order.paid_at is null then
    update public.payment_orders set status = 'pending' where id = v_order.id;
    return jsonb_build_object('result', 'reopened');
  end if;
  return jsonb_build_object('result', 'order_state');
end;
$$;

revoke all on function public.reopen_failed_payment_order(text) from public, anon, authenticated;
grant execute on function public.reopen_failed_payment_order(text) to service_role;

-- Refund. Result: refunded | review | already | missing | amount.
--   refunded: order marked refunded. When the grant was provably still the one this order wrote it is
--             revoked; otherwise the entitlement is untouched and a review row is written.
--   review:   nothing revoked (partial refund, unpaid order, mismatch). Order not marked refunded
--             unless the refund is full.
-- p_units: units to take back for a pack when payment_orders.granted_units is empty (legacy orders).
create or replace function public.apply_p24_refund(
  p_provider_order_id text,
  p_refund_id text,
  p_refund_amount integer,
  p_currency text,
  p_units integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.payment_orders%rowtype;
  v_ref text;
  v_ent public.premium_entitlements%rowtype;
  v_addon_id uuid;
  v_units integer;
  v_revoked boolean := false;
  v_review text := null;
  v_rows integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'PAYMENT_FORBIDDEN' using errcode = '42501';
  end if;
  if p_provider_order_id is null or p_provider_order_id !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$'
     or p_refund_id is null or p_refund_id !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$' then
    return jsonb_build_object('result', 'conflict');
  end if;

  select * into v_order
  from public.payment_orders
  where p24_order_id = p_provider_order_id
  for update;

  if not found then
    return jsonb_build_object('result', 'missing');
  end if;
  v_ref := v_order.session_id;

  if v_order.status = 'refunded' then
    return jsonb_build_object('result', 'already');
  end if;

  if p_currency is distinct from 'PLN' or v_order.currency is distinct from 'PLN'
     or p_refund_amount is null or p_refund_amount <= 0 then
    return jsonb_build_object('result', 'amount');
  end if;

  if v_order.status is distinct from 'paid' then
    insert into public.payment_order_reviews (order_ref, order_id, reason, provider_ref, details)
    values (v_ref, v_order.id, 'refund_unpaid_order', p_refund_id,
            jsonb_build_object('status', v_order.status, 'refund_amount', p_refund_amount))
    on conflict do nothing;
    get diagnostics v_rows = row_count;
    return jsonb_build_object('result', case when v_rows = 0 then 'already' else 'review' end);
  end if;

  if p_refund_amount > v_order.amount_grosz then
    insert into public.payment_order_reviews (order_ref, order_id, reason, provider_ref, details)
    values (v_ref, v_order.id, 'refund_amount_mismatch', p_refund_id,
            jsonb_build_object('refund_amount', p_refund_amount, 'order_amount', v_order.amount_grosz))
    on conflict do nothing;
    get diagnostics v_rows = row_count;
    return jsonb_build_object('result', case when v_rows = 0 then 'already' else 'review' end);
  end if;

  if p_refund_amount < v_order.amount_grosz then
    insert into public.payment_order_reviews (order_ref, order_id, reason, provider_ref, details)
    values (v_ref, v_order.id, 'refund_partial', p_refund_id,
            jsonb_build_object('refund_amount', p_refund_amount, 'order_amount', v_order.amount_grosz))
    on conflict do nothing;
    get diagnostics v_rows = row_count;
    return jsonb_build_object('result', case when v_rows = 0 then 'already' else 'review' end);
  end if;

  -- Full refund of a paid order from here on.
  if v_order.grant_status = 'granted' then
    if v_order.product_kind = 'plan' then
      select * into v_ent
      from public.premium_entitlements
      where user_id = v_order.user_id and active is true
      for update;

      if found
         and v_ent.source = 'purchase'
         and v_order.granted_until is not null then
        if v_order.grant_note = 'schedule' then
          -- A queued cheaper plan: clear the queue only when it is exactly this order's.
          if v_ent.pending_tier is not null
             and v_ent.pending_tier::text = v_order.plan_tier
             and v_ent.pending_expires_at = v_order.granted_until then
            update public.premium_entitlements
            set pending_tier = null, pending_expires_at = null
            where id = v_ent.id;
            v_revoked := true;
          end if;
        elsif v_ent.tier::text = v_order.plan_tier
              and v_ent.expires_at = v_order.granted_until
              and v_ent.pending_tier is null
              and not exists (
                select 1 from public.payment_orders o
                where o.user_id = v_order.user_id
                  and o.id <> v_order.id
                  and o.product_kind = 'plan'
                  and o.status = 'paid'
                  and o.grant_status = 'granted'
                  and o.paid_at > v_order.paid_at
              ) then
          update public.premium_entitlements
          set expires_at = least(now(), expires_at)
          where id = v_ent.id;
          v_revoked := true;
        end if;
      end if;
      if not v_revoked then v_review := 'refund_needs_manual_review'; end if;

    elsif v_order.product_kind = 'addon' then
      select id into v_addon_id
      from public.plan_addon_entitlements
      where user_id = v_order.user_id
        and addon = 'reference_mastering'
        and revoked_at is null
        and source = 'purchase'
        and ends_at = v_order.granted_until
      for update;
      if found and v_order.granted_until is not null then
        update public.plan_addon_entitlements set revoked_at = now() where id = v_addon_id;
        v_revoked := true;
      else
        v_review := 'refund_needs_manual_review';
      end if;

    elsif v_order.product_kind = 'pack' then
      v_units := coalesce(v_order.granted_units, p_units);
      if v_units is null or v_units < 1 or v_units > 1000 then
        v_review := 'refund_needs_manual_review';
      else
        update public.studio_quota_credits
        set remaining = greatest(remaining - v_units, 0)
        where user_id = v_order.user_id and kind = v_order.pack;
        v_revoked := true;
      end if;

    elsif v_order.product_kind = 'beat' then
      delete from public.beat_purchases where payment_order_id = v_order.id;
      v_revoked := true;
    else
      v_review := 'refund_needs_manual_review';
    end if;
  else
    -- Nothing was granted (skipped). Only the money moves.
    v_revoked := true;
  end if;

  update public.payment_orders
  set status = 'refunded',
      refunded_at = now(),
      provider_refund_id = p_refund_id
  where id = v_order.id;

  if v_review is not null then
    insert into public.payment_order_reviews (order_ref, order_id, reason, provider_ref, details)
    values (v_ref, v_order.id, v_review, p_refund_id,
            jsonb_build_object('product_kind', v_order.product_kind, 'granted_until', v_order.granted_until))
    on conflict do nothing;
  end if;

  return jsonb_build_object('result', 'refunded', 'revoked', v_revoked, 'review', v_review is not null);
end;
$$;

revoke all on function public.apply_p24_refund(text, text, integer, text, integer) from public, anon, authenticated;
grant execute on function public.apply_p24_refund(text, text, integer, text, integer) to service_role;
