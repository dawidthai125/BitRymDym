-- 1. PayU refund of an order that waits for review (paid, never settled): it was "unknown", the order stayed
--    pending and the return page could later grant it for free.
create or replace function public.apply_p24_refund(p_provider_order_id text, p_refund_id text, p_refund_amount integer, p_currency text, p_units integer default null::integer)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_order public.payment_orders%rowtype;
  v_prev public.payment_orders%rowtype;
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

  -- A paid order that nobody settled yet (review queue) carries the provider id only in provider_order_id.
  select * into v_order
  from public.payment_orders
  where p24_order_id = p_provider_order_id
     or (p24_order_id is null and provider_order_id = p_provider_order_id)
  order by (p24_order_id is not null) desc
  limit 1
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

  -- Money back in full, nothing was ever granted: close the order, so that no later notice can grant it.
  if v_order.status in ('pending', 'failed') and v_order.grant_status = 'pending'
     and p_refund_amount = v_order.amount_grosz then
    update public.payment_orders
    set status = 'refunded',
        refunded_at = now(),
        provider_refund_id = p_refund_id,
        p24_order_id = coalesce(p24_order_id, p_provider_order_id)
    where id = v_order.id;
    return jsonb_build_object('result', 'refunded', 'revoked', false, 'review', false);
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
          -- Earlier paid order that still runs → back to its tier and end date.
          select * into v_prev
          from public.payment_orders o
          where o.user_id = v_order.user_id
            and o.id <> v_order.id
            and o.product_kind = 'plan'
            and o.status = 'paid'
            and o.grant_status = 'granted'
            and coalesce(o.grant_note, '') <> 'schedule'
            and o.paid_at < v_order.paid_at
            and o.granted_until is not null
            and o.granted_until > now()
            and o.granted_until < v_order.granted_until
            and o.plan_tier in ('BRONZE', 'SILVER', 'GOLD')
          order by o.paid_at desc
          limit 1;
          if found then
            update public.premium_entitlements
            set tier = v_prev.plan_tier::public.premium_tier,
                expires_at = v_prev.granted_until
            where id = v_ent.id;
          else
            update public.premium_entitlements
            set expires_at = least(now(), expires_at)
            where id = v_ent.id;
          end if;
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
        select * into v_prev
        from public.payment_orders o
        where o.user_id = v_order.user_id
          and o.id <> v_order.id
          and o.product_kind = 'addon'
          and o.status = 'paid'
          and o.grant_status = 'granted'
          and o.paid_at < v_order.paid_at
          and o.granted_until is not null
          and o.granted_until > now()
          and o.granted_until < v_order.granted_until
        order by o.paid_at desc
        limit 1;
        if found then
          update public.plan_addon_entitlements set ends_at = v_prev.granted_until where id = v_addon_id;
        else
          update public.plan_addon_entitlements set revoked_at = now() where id = v_addon_id;
        end if;
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
$function$;
revoke all on function public.apply_p24_refund(text, text, integer, text, integer) from public, anon, authenticated;
grant execute on function public.apply_p24_refund(text, text, integer, text, integer) to service_role;

-- 2. A paid order that cannot be granted automatically leaves "pending" (paid + skipped, with the provider id):
--    no notice or return page grants it later and a refund finds it. A person settles it from the review queue.
create or replace function public.park_paid_payment_order(
  p_session_id text,
  p_amount integer,
  p_provider_order_id text,
  p_note text
)
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
  if p_provider_order_id is null or p_provider_order_id !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$'
     or p_note is null or p_note not in ('pending_plan', 'pack_amount') then
    return jsonb_build_object('result', 'conflict');
  end if;

  select * into v_order from public.payment_orders where session_id = p_session_id for update;
  if not found then
    return jsonb_build_object('result', 'missing');
  end if;
  if v_order.status in ('paid', 'refunded') then
    return jsonb_build_object('result', 'already');
  end if;
  if v_order.status is distinct from 'pending' or v_order.grant_status is distinct from 'pending' then
    return jsonb_build_object('result', 'order_state');
  end if;
  if v_order.amount_grosz is distinct from p_amount or v_order.currency is distinct from 'PLN' then
    return jsonb_build_object('result', 'amount');
  end if;

  update public.payment_orders
  set status = 'paid',
      grant_status = 'skipped',
      grant_note = p_note,
      p24_order_id = p_provider_order_id,
      paid_at = now()
  where id = v_order.id;
  return jsonb_build_object('result', 'parked');
exception
  when unique_violation then
    return jsonb_build_object('result', 'conflict');
end;
$$;
revoke all on function public.park_paid_payment_order(text, integer, text, text) from public, anon, authenticated;
grant execute on function public.park_paid_payment_order(text, integer, text, text) to service_role;

-- 3. Ranking reward with a queued cheaper plan that is already due.
create or replace function public.claim_community_reward(
  p_reward_id uuid,
  p_user_id uuid,
  p_write jsonb
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reward public.community_rewards%rowtype;
  v_row public.premium_entitlements%rowtype;
  v_found boolean := false;
  v_action text;
  v_expect boolean;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'COMMUNITY_FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_reward
  from public.community_rewards
  where id = p_reward_id and user_id = p_user_id
  for update;
  if not found then return 'missing'; end if;
  if v_reward.status = 'claimed' then return 'already'; end if;
  if v_reward.status is distinct from 'unclaimed' then return 'wait'; end if;

  v_action := p_write->>'action';
  if v_action is distinct from 'plan' and v_action is distinct from 'schedule' then
    return 'conflict';
  end if;
  if v_action = 'plan' and nullif(p_write->>'expiresAt', '') is null then
    return 'conflict';
  end if;

  select * into v_row
  from public.premium_entitlements
  where user_id = p_user_id and active
  for update;
  v_found := found;
  -- Same promotion as apply_p24_purchase: the caller compares with the plan that is due now (withDuePlan),
  -- so a queued cheaper plan whose time has come is written first.
  if v_found and v_row.expires_at is not null and v_row.expires_at <= now() then
    if v_row.pending_tier::text in ('BRONZE', 'SILVER', 'GOLD')
       and v_row.pending_expires_at is not null
       and v_row.pending_expires_at > now() then
      update public.premium_entitlements
        set tier = v_row.pending_tier,
            expires_at = v_row.pending_expires_at,
            pending_tier = null,
            pending_expires_at = null,
            source = 'purchase'
        where id = v_row.id
        returning * into v_row;
    elsif v_row.pending_tier is not null or v_row.pending_expires_at is not null then
      update public.premium_entitlements
        set pending_tier = null, pending_expires_at = null
        where id = v_row.id
        returning * into v_row;
    end if;
  end if;
  v_expect := coalesce((p_write->>'expectedPresent')::boolean, false);

  if v_expect then
    if not v_found then return 'conflict'; end if;
    if v_row.tier::text is distinct from p_write->>'expectedTier' then return 'conflict'; end if;
    if v_row.expires_at is distinct from nullif(p_write->>'expectedExpiresAt', '')::timestamptz then
      return 'conflict';
    end if;
    if v_row.pending_tier::text is distinct from nullif(p_write->>'expectedPendingTier', '') then
      return 'conflict';
    end if;
    if v_row.pending_expires_at is distinct from nullif(p_write->>'expectedPendingExpiresAt', '')::timestamptz then
      return 'conflict';
    end if;
  elsif v_found then
    return 'conflict';
  end if;

  if v_action = 'schedule' then
    update public.premium_entitlements
      set pending_tier = nullif(p_write->>'pendingTier', '')::public.premium_tier,
          pending_expires_at = nullif(p_write->>'pendingExpiresAt', '')::timestamptz
      where id = v_row.id;
  elsif v_found then
    update public.premium_entitlements
      set tier = (p_write->>'tier')::public.premium_tier,
          active = true,
          expires_at = (p_write->>'expiresAt')::timestamptz,
          pending_tier = nullif(p_write->>'pendingTier', '')::public.premium_tier,
          pending_expires_at = nullif(p_write->>'pendingExpiresAt', '')::timestamptz
      where id = v_row.id;
  else
    insert into public.premium_entitlements (
      user_id, active, source, expires_at, tier, pending_tier, pending_expires_at
    ) values (
      p_user_id,
      true,
      'community_reward',
      (p_write->>'expiresAt')::timestamptz,
      (p_write->>'tier')::public.premium_tier,
      nullif(p_write->>'pendingTier', '')::public.premium_tier,
      nullif(p_write->>'pendingExpiresAt', '')::timestamptz
    );
  end if;

  update public.community_rewards
    set status = 'claimed', claimed_at = now(), updated_at = now()
    where id = p_reward_id;
  return 'ok';
end;
$$;
revoke all on function public.claim_community_reward(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.claim_community_reward(uuid, uuid, jsonb) to service_role;

-- 4. Retention janitor: rows whose file is already gone leave the sweep, so newer ones are always reached.
alter table public.takes add column if not exists object_removed_at timestamptz;
comment on column public.takes.object_removed_at is
  'Set by the retention janitor once the storage object of a terminal take is gone.';
