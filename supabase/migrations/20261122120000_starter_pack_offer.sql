-- 2026-11-22 Owner decision: starter offer for new accounts. -30% on ONE one-off pack
-- (product_kind 'pack': take / master / youtube), within 48 h of auth.users.created_at.
-- No discount on plans, add-ons or beats.
--
-- * payment_orders.promo_code ('starter30' or null) + regular_amount_grosz (catalog price
--   before the discount). amount_grosz stays the amount actually charged (PayU checks it,
--   refunds compare against it). Pack units are decided from regular_amount_grosz.
-- * create_payment_order_capped now also inserts both columns and, under the same per-user
--   advisory lock that serialises every order insert of that user, refuses a second discounted
--   order while another discounted order is pending / paid / refunded ('promo_used').
--   A failed (cancelled) discounted order frees the offer again. The 48 h window is checked
--   by the app (checkout-service.ts → starter-offer.ts) from auth.users.created_at.
--   No unique index on purpose: reopen_failed_payment_order (failed -> pending after a late,
--   verified COMPLETED) must never fail on a constraint and loop PayU retries.
-- Idempotent, additive. Not applied from the app. Apply with the normal Owner migration path.

alter table public.payment_orders add column if not exists promo_code text;
alter table public.payment_orders add column if not exists regular_amount_grosz integer;

alter table public.payment_orders drop constraint if exists payment_orders_promo_chk;
alter table public.payment_orders add constraint payment_orders_promo_chk check (
  (promo_code is null and regular_amount_grosz is null)
  or
  (promo_code = 'starter30'
   and product_kind = 'pack'
   and regular_amount_grosz is not null
   and regular_amount_grosz > amount_grosz
   and regular_amount_grosz <= 100000000)
);

create index if not exists payment_orders_promo_user_idx
  on public.payment_orders (user_id, status)
  where promo_code is not null;

comment on column public.payment_orders.promo_code is
  'Discount applied by the server at checkout (starter30 = -30% on one pack for a <48 h account). Null = regular price.';
comment on column public.payment_orders.regular_amount_grosz is
  'Catalog price before the discount, in grosz. Null when promo_code is null. amount_grosz is what PayU charged.';

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
  if nullif(p_order->>'promo_code', '') is not null then
    -- One discounted pack per account: a pending, paid or refunded discounted order uses it up.
    if exists (
      select 1 from public.payment_orders o
       where o.user_id = p_user
         and o.promo_code is not null
         and o.status <> 'failed'
    ) then
      return query select 'promo_used'::text, null::uuid;
      return;
    end if;
  end if;
  insert into public.payment_orders (
    user_id, session_id, provider, product_kind, plan_tier, addon, beat_id, pack, period,
    amount_grosz, currency, buyer_email, locale, terms_version, privacy_version,
    terms_accepted_at, immediate_performance, promo_code, regular_amount_grosz)
  select p_user, r.session_id, r.provider, r.product_kind, r.plan_tier, r.addon, r.beat_id, r.pack, r.period,
         r.amount_grosz, r.currency, r.buyer_email, r.locale, r.terms_version, r.privacy_version,
         r.terms_accepted_at, r.immediate_performance, nullif(r.promo_code, ''), r.regular_amount_grosz
    from jsonb_populate_record(null::public.payment_orders, p_order) r
  returning id into v_id;
  return query select 'ok'::text, v_id;
end;
$$;
revoke all on function public.create_payment_order_capped(uuid, jsonb, integer, integer) from public, anon, authenticated;
grant execute on function public.create_payment_order_capped(uuid, jsonb, integer, integer) to service_role;
