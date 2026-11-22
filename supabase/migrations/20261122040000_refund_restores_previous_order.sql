-- 2026-11-22 code review: a full refund of a plan extension / upgrade (or an add-on
-- extension) also wiped the time paid by an EARLIER order: the plan ended now.
-- Now the refund restores the state before the refunded order: the latest earlier
-- paid+granted order of the same product that is still running gives back its
-- tier and end date. With no such order the plan / add-on ends now (as before).

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
