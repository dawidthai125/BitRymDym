-- PayU is the default provider. PayU orderId is a string. The column keeps the name p24_order_id and stores either id.
-- Numeric P24 ids convert with ::text. Drop is required: CREATE OR REPLACE cannot change bigint to text.

alter table public.payment_orders drop constraint if exists payment_orders_provider_chk;
alter table public.payment_orders add constraint payment_orders_provider_chk
  check (provider in ('p24', 'payu'));
alter table public.payment_orders alter column provider set default 'payu';

drop function if exists public.apply_p24_purchase(text, integer, text, bigint, text, jsonb);
drop function if exists public.grant_p24_quota_pack(text, integer, text, bigint, text, text, integer);

drop index if exists public.payment_orders_p24_order_uidx;
alter table public.payment_orders
  alter column p24_order_id type text using p24_order_id::text;

alter table public.payment_orders drop constraint if exists payment_orders_provider_order_id_chk;
alter table public.payment_orders add constraint payment_orders_provider_order_id_chk
  check (p24_order_id is null or p24_order_id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$');

create unique index payment_orders_p24_order_uidx
  on public.payment_orders (p24_order_id)
  where p24_order_id is not null;

create or replace function public.apply_p24_purchase(
  p_session_id text,
  p_amount integer,
  p_currency text,
  p_p24_order_id text,
  p_statement text,
  p_write jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.payment_orders%rowtype;
  v_action text;
  v_present boolean;
  v_pe_id uuid;
  v_tier text;
  v_active boolean;
  v_expires timestamptz;
  v_addon_id uuid;
  v_ends timestamptz;
  v_starts timestamptz;
  v_new_expires timestamptz;
  v_note text;
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

  if v_order.status is distinct from 'pending' or v_order.grant_status is distinct from 'pending' then
    return jsonb_build_object('result', 'order_state');
  end if;

  if v_order.amount_grosz is distinct from p_amount
     or v_order.currency is distinct from p_currency
     or p_currency is distinct from 'PLN' then
    return jsonb_build_object('result', 'amount');
  end if;

  v_action := p_write->>'action';

  if v_action = 'plan' then
    if v_order.product_kind is distinct from 'plan'
       or v_order.plan_tier is distinct from (p_write->>'tier')
       or (p_write->>'tier') not in ('BRONZE', 'SILVER', 'GOLD') then
      return jsonb_build_object('result', 'conflict');
    end if;
    v_new_expires := (p_write->>'expiresAt')::timestamptz;
    if v_new_expires is null or v_new_expires <= now() or v_new_expires > now() + interval '4 years' then
      return jsonb_build_object('result', 'conflict');
    end if;

    select id, tier::text, active, expires_at
      into v_pe_id, v_tier, v_active, v_expires
    from public.premium_entitlements
    where user_id = v_order.user_id and active is true
    for update;

    v_present := found;
    if v_present is distinct from coalesce((p_write->>'expectedPresent')::boolean, false) then
      return jsonb_build_object('result', 'conflict');
    end if;
    if v_present and (
      v_tier is distinct from (p_write->>'expectedTier')
      or v_active is distinct from (p_write->>'expectedActive')::boolean
      or v_expires is distinct from nullif(p_write->>'expectedExpiresAt', '')::timestamptz
    ) then
      return jsonb_build_object('result', 'conflict');
    end if;

    if v_present then
      update public.premium_entitlements
      set active = true,
          source = 'purchase',
          tier = (p_write->>'tier')::public.premium_tier,
          expires_at = v_new_expires
      where id = v_pe_id;
    else
      insert into public.premium_entitlements (user_id, active, source, expires_at, tier)
      values (v_order.user_id, true, 'purchase', v_new_expires, (p_write->>'tier')::public.premium_tier);
    end if;

    update public.payment_orders
    set status = 'paid',
        grant_status = 'granted',
        grant_note = null,
        p24_order_id = p_p24_order_id,
        p24_statement = left(coalesce(p_statement, ''), 200),
        paid_at = now(),
        granted_until = v_new_expires
    where id = v_order.id;

    return jsonb_build_object('result', 'granted');
  elsif v_action = 'addon' then
    if v_order.product_kind is distinct from 'addon' or v_order.addon is distinct from 'reference_mastering' then
      return jsonb_build_object('result', 'conflict');
    end if;
    v_new_expires := (p_write->>'endsAt')::timestamptz;
    if v_new_expires is null or v_new_expires <= now() or v_new_expires > now() + interval '4 years' then
      return jsonb_build_object('result', 'conflict');
    end if;

    select id, ends_at, starts_at
      into v_addon_id, v_ends, v_starts
    from public.plan_addon_entitlements
    where user_id = v_order.user_id
      and addon = 'reference_mastering'
      and revoked_at is null
    for update;

    v_present := found;
    if v_present is distinct from coalesce((p_write->>'expectedPresent')::boolean, false) then
      return jsonb_build_object('result', 'conflict');
    end if;
    if v_present and v_ends is distinct from nullif(p_write->>'expectedEndsAt', '')::timestamptz then
      return jsonb_build_object('result', 'conflict');
    end if;
    if v_present and v_new_expires <= v_starts then
      return jsonb_build_object('result', 'conflict');
    end if;

    if v_present then
      update public.plan_addon_entitlements
      set source = 'purchase',
          ends_at = v_new_expires
      where id = v_addon_id;
    else
      insert into public.plan_addon_entitlements (user_id, addon, source, ends_at)
      values (v_order.user_id, 'reference_mastering', 'purchase', v_new_expires);
    end if;

    update public.payment_orders
    set status = 'paid',
        grant_status = 'granted',
        grant_note = null,
        p24_order_id = p_p24_order_id,
        p24_statement = left(coalesce(p_statement, ''), 200),
        paid_at = now(),
        granted_until = v_new_expires
    where id = v_order.id;

    return jsonb_build_object('result', 'granted');
  elsif v_action = 'skip' then
    v_note := left(coalesce(p_write->>'note', ''), 200);
    if v_note not in ('perpetual', 'downgrade', 'addon_perpetual') then
      return jsonb_build_object('result', 'conflict');
    end if;

    update public.payment_orders
    set status = 'paid',
        grant_status = 'skipped',
        grant_note = v_note,
        p24_order_id = p_p24_order_id,
        p24_statement = left(coalesce(p_statement, ''), 200),
        paid_at = now()
    where id = v_order.id;

    return jsonb_build_object('result', 'skipped');
  else
    return jsonb_build_object('result', 'conflict');
  end if;
exception
  when unique_violation then
    return jsonb_build_object('result', 'conflict');
end;
$$;

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

revoke all on function public.apply_p24_purchase(text, integer, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.apply_p24_purchase(text, integer, text, text, text, jsonb) to service_role;

revoke all on function public.grant_p24_quota_pack(text, integer, text, text, text, text, integer) from public, anon, authenticated;
grant execute on function public.grant_p24_quota_pack(text, integer, text, text, text, text, integer) to service_role;
