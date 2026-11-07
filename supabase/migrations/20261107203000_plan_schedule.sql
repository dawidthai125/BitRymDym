-- A cheaper plan paid during a higher one waits in pending_tier until the
-- higher plan ends. apply_p24_purchase turns that queue into the current
-- plan before it compares the expected row, so no cron is required.

alter table public.premium_entitlements
  add column if not exists pending_tier public.premium_tier,
  add column if not exists pending_expires_at timestamptz;

alter table public.premium_entitlements drop constraint if exists premium_entitlements_pending_pair_chk;
alter table public.premium_entitlements add constraint premium_entitlements_pending_pair_chk
  check (
    (pending_tier is null and pending_expires_at is null)
    or (pending_tier in ('BRONZE', 'SILVER', 'GOLD') and pending_expires_at is not null)
  );

alter table public.premium_entitlements drop constraint if exists premium_entitlements_pending_after_current_chk;
alter table public.premium_entitlements add constraint premium_entitlements_pending_after_current_chk
  check (pending_expires_at is null or expires_at is null or pending_expires_at > expires_at);

comment on column public.premium_entitlements.pending_tier is
  'Cheaper plan paid in advance. Starts when expires_at is reached.';

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
  v_row_pending_tier text;
  v_row_pending_expires timestamptz;
  v_pending_tier text;
  v_pending_expires timestamptz;
  v_addon_id uuid;
  v_ends timestamptz;
  v_starts timestamptz;
  v_new_expires timestamptz;
  v_note text;
  v_rank_current integer;
  v_rank_pending integer;
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

  if v_action = 'plan' or v_action = 'schedule' then
    v_pending_tier := nullif(case when v_action = 'schedule' then p_write->>'pendingTier' else p_write->>'tier' end, '');
    if v_order.product_kind is distinct from 'plan'
       or v_order.plan_tier is distinct from v_pending_tier
       or v_pending_tier not in ('BRONZE', 'SILVER', 'GOLD') then
      return jsonb_build_object('result', 'conflict');
    end if;

    select id, tier::text, active, expires_at, pending_tier::text, pending_expires_at
      into v_pe_id, v_tier, v_active, v_expires, v_row_pending_tier, v_row_pending_expires
    from public.premium_entitlements
    where user_id = v_order.user_id and active is true
    for update;

    v_present := found;

    if v_present and v_expires is not null and v_expires <= now() then
      if v_row_pending_tier in ('BRONZE', 'SILVER', 'GOLD')
         and v_row_pending_expires is not null
         and v_row_pending_expires > now() then
        update public.premium_entitlements
        set tier = v_row_pending_tier::public.premium_tier,
            expires_at = v_row_pending_expires,
            pending_tier = null,
            pending_expires_at = null,
            source = 'purchase'
        where id = v_pe_id;
        v_tier := v_row_pending_tier;
        v_expires := v_row_pending_expires;
        v_row_pending_tier := null;
        v_row_pending_expires := null;
      elsif v_row_pending_tier is not null or v_row_pending_expires is not null then
        update public.premium_entitlements
        set pending_tier = null,
            pending_expires_at = null
        where id = v_pe_id;
        v_row_pending_tier := null;
        v_row_pending_expires := null;
      end if;
    end if;

    if v_present is distinct from coalesce((p_write->>'expectedPresent')::boolean, false) then
      return jsonb_build_object('result', 'conflict');
    end if;
    if v_present and (
      v_tier is distinct from nullif(p_write->>'expectedTier', '')
      or v_active is distinct from (p_write->>'expectedActive')::boolean
      or v_expires is distinct from nullif(p_write->>'expectedExpiresAt', '')::timestamptz
      or v_row_pending_tier is distinct from nullif(p_write->>'expectedPendingTier', '')
      or v_row_pending_expires is distinct from nullif(p_write->>'expectedPendingExpiresAt', '')::timestamptz
    ) then
      return jsonb_build_object('result', 'conflict');
    end if;

    if v_action = 'schedule' then
      if not v_present or v_expires is null or v_expires <= now() then
        return jsonb_build_object('result', 'conflict');
      end if;
      v_pending_expires := nullif(p_write->>'pendingExpiresAt', '')::timestamptz;
      v_rank_current := case v_tier when 'BRONZE' then 1 when 'SILVER' then 2 when 'GOLD' then 3 else 0 end;
      v_rank_pending := case v_pending_tier when 'BRONZE' then 1 when 'SILVER' then 2 when 'GOLD' then 3 else 0 end;
      if v_pending_expires is null
         or v_pending_expires <= v_expires
         or v_pending_expires > now() + interval '4 years'
         or v_rank_pending >= v_rank_current then
        return jsonb_build_object('result', 'conflict');
      end if;

      update public.premium_entitlements
      set pending_tier = v_pending_tier::public.premium_tier,
          pending_expires_at = v_pending_expires
      where id = v_pe_id;

      update public.payment_orders
      set status = 'paid',
          grant_status = 'granted',
          grant_note = 'schedule',
          p24_order_id = p_p24_order_id,
          p24_statement = left(coalesce(p_statement, ''), 200),
          paid_at = now(),
          granted_until = v_pending_expires
      where id = v_order.id;

      return jsonb_build_object('result', 'granted');
    end if;

    v_new_expires := nullif(p_write->>'expiresAt', '')::timestamptz;
    if v_new_expires is null or v_new_expires <= now() or v_new_expires > now() + interval '4 years' then
      return jsonb_build_object('result', 'conflict');
    end if;
    v_pending_tier := nullif(p_write->>'pendingTier', '');
    v_pending_expires := nullif(p_write->>'pendingExpiresAt', '')::timestamptz;
    if (v_pending_tier is null) <> (v_pending_expires is null) then
      return jsonb_build_object('result', 'conflict');
    end if;
    if v_pending_tier is not null and (
      v_pending_tier not in ('BRONZE', 'SILVER', 'GOLD')
      or v_pending_expires <= v_new_expires
      or v_pending_expires > now() + interval '4 years'
    ) then
      return jsonb_build_object('result', 'conflict');
    end if;
    if not v_present and v_pending_tier is not null then
      return jsonb_build_object('result', 'conflict');
    end if;

    if v_present then
      update public.premium_entitlements
      set active = true,
          source = 'purchase',
          tier = (p_write->>'tier')::public.premium_tier,
          expires_at = v_new_expires,
          pending_tier = v_pending_tier::public.premium_tier,
          pending_expires_at = v_pending_expires
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
    if v_note not in ('perpetual', 'downgrade', 'pending_plan', 'addon_perpetual') then
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

revoke all on function public.apply_p24_purchase(text, integer, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.apply_p24_purchase(text, integer, text, text, text, jsonb) to service_role;
