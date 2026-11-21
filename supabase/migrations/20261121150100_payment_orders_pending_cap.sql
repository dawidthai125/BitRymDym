-- Atomic cap on unfinished checkouts per user (audit W9: order spam / count-then-insert race).
-- create_payment_order_capped: under a per-user advisory xact lock count this user's `pending`
-- orders created in the last hour and in the last 24 h; when both are below the caps passed by the
-- app (SSOT = PAYMENT_PENDING_ORDER_LIMITS in src/config/plan-policy.ts) insert the order row.
-- p_order = the same column map the app used to insert directly; only the listed columns are taken,
-- user_id always comes from p_user, status/grant_status keep their table defaults ('pending').
-- Returns (status, order_id): 'ok' | 'rate_hour' | 'rate_day'.
-- SECURITY INVOKER: service_role only (payment_orders_service_role_only trigger checks auth.role()).
-- Idempotent. Do not db push to production without the Owner apply process.

create or replace function public.create_payment_order_capped(
  p_user uuid,
  p_order jsonb,
  p_max_hour integer,
  p_max_day integer)
returns table (status text, order_id uuid)
language plpgsql security invoker set search_path = public as $$
declare
  v_hour integer;
  v_day integer;
  v_id uuid;
begin
  if p_user is null or p_order is null or jsonb_typeof(p_order) <> 'object'
     or p_max_hour is null or p_max_hour < 0 or p_max_day is null or p_max_day < 0 then
    raise exception 'PAYMENT_ORDER_INVALID' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('payment_orders_pending:' || p_user::text, 0));
  select count(*) filter (where o.created_at > now() - interval '1 hour'),
         count(*)
    into v_hour, v_day
    from public.payment_orders o
   where o.user_id = p_user
     and o.status = 'pending'
     and o.created_at > now() - interval '24 hours';
  if v_hour >= p_max_hour then
    return query select 'rate_hour'::text, null::uuid;
    return;
  end if;
  if v_day >= p_max_day then
    return query select 'rate_day'::text, null::uuid;
    return;
  end if;
  insert into public.payment_orders (
    user_id, session_id, provider, product_kind, plan_tier, addon, beat_id, pack, period,
    amount_grosz, currency, buyer_email, locale, terms_version, privacy_version,
    terms_accepted_at, immediate_performance)
  select p_user, r.session_id, r.provider, r.product_kind, r.plan_tier, r.addon, r.beat_id, r.pack, r.period,
         r.amount_grosz, r.currency, r.buyer_email, r.locale, r.terms_version, r.privacy_version,
         r.terms_accepted_at, r.immediate_performance
    from jsonb_populate_record(null::public.payment_orders, p_order) r
  returning id into v_id;
  return query select 'ok'::text, v_id;
end;
$$;
revoke all on function public.create_payment_order_capped(uuid, jsonb, integer, integer) from public, anon, authenticated;
grant execute on function public.create_payment_order_capped(uuid, jsonb, integer, integer) to service_role;
