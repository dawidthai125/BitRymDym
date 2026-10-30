-- One-off Przelewy24 orders (plans + reference-mastering add-on).
-- Additive. Users may read their own rows. Writes are service_role only
-- (trigger + grants). No FK to profiles: a billing row outlives account
-- deletion (privacy: settlement data kept 5 years) and must not block
-- auth.users removal. user_id stays the auth user id for RLS.
--
-- Confirmed payment grants exactly once via apply_p24_purchase:
-- the order row is locked, amount/currency/product are re-checked, the
-- entitlement update and the paid/granted flip commit together. A retry
-- sees status paid and does not extend expiry again.
-- Grant rules live in src/lib/payments/entitlement-grant.ts (no proration;
-- higher tier starts now; lower tier is not applied; perpetual is not shortened).

create table public.payment_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  session_id text not null,
  provider text not null default 'p24',
  product_kind text not null,
  plan_tier text,
  addon text,
  period text not null,
  amount_grosz integer not null,
  currency text not null default 'PLN',
  status text not null default 'pending',
  grant_status text not null default 'pending',
  grant_note text,
  p24_order_id bigint,
  p24_statement text,
  buyer_email text not null,
  locale text not null default 'pl',
  terms_version text not null,
  privacy_version text not null,
  terms_accepted_at timestamptz not null,
  immediate_performance boolean not null,
  paid_at timestamptz,
  granted_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_orders_session_uidx unique (session_id),
  constraint payment_orders_session_len check (char_length(session_id) between 8 and 100),
  constraint payment_orders_provider_chk check (provider = 'p24'),
  constraint payment_orders_kind_chk check (product_kind in ('plan', 'addon')),
  constraint payment_orders_tier_chk check (plan_tier is null or plan_tier in ('BRONZE', 'SILVER', 'GOLD')),
  constraint payment_orders_addon_chk check (addon is null or addon = 'reference_mastering'),
  constraint payment_orders_period_chk check (period in ('month', 'year')),
  constraint payment_orders_amount_chk check (amount_grosz > 0 and amount_grosz <= 100000000),
  constraint payment_orders_currency_chk check (currency = 'PLN'),
  constraint payment_orders_status_chk check (status in ('pending', 'paid', 'failed')),
  constraint payment_orders_grant_chk check (grant_status in ('pending', 'granted', 'skipped')),
  constraint payment_orders_locale_chk check (locale in ('pl', 'en')),
  constraint payment_orders_email_chk check (position('@' in buyer_email) > 1 and char_length(buyer_email) <= 320),
  constraint payment_orders_note_chk check (grant_note is null or char_length(grant_note) <= 200),
  constraint payment_orders_statement_chk check (p24_statement is null or char_length(p24_statement) <= 200),
  constraint payment_orders_versions_chk check (
    char_length(terms_version) between 1 and 40 and char_length(privacy_version) between 1 and 40
  ),
  constraint payment_orders_immediate_chk check (immediate_performance),
  constraint payment_orders_product_chk check (
    (product_kind = 'plan' and plan_tier is not null and addon is null and period in ('month', 'year'))
    or
    (product_kind = 'addon' and addon = 'reference_mastering' and plan_tier is null and period = 'month')
  )
);

create index payment_orders_user_id_idx on public.payment_orders (user_id, created_at desc);
create unique index payment_orders_p24_order_uidx on public.payment_orders (p24_order_id) where p24_order_id is not null;

create trigger payment_orders_set_updated_at
before update on public.payment_orders
for each row
execute function public.set_updated_at();

create or replace function public.payment_orders_service_role_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Only service_role may mutate payment_orders' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger payment_orders_service_role_only
before insert or update or delete on public.payment_orders
for each row
execute function public.payment_orders_service_role_only();

alter table public.payment_orders enable row level security;

drop policy if exists payment_orders_select_own on public.payment_orders;
create policy payment_orders_select_own
  on public.payment_orders
  for select
  to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.payment_orders from anon, authenticated;
grant select on public.payment_orders to authenticated;
grant select, insert, update, delete on public.payment_orders to service_role;

revoke all on function public.payment_orders_service_role_only() from public, anon, authenticated;
grant execute on function public.payment_orders_service_role_only() to service_role;

comment on table public.payment_orders is
  'One-off P24 checkouts. SELECT own row. Mutations service_role only. Grant is idempotent in apply_p24_purchase.';

-- Atomic grant. Returns jsonb result: granted | skipped | already | conflict | amount | missing | order_state.
create or replace function public.apply_p24_purchase(
  p_session_id text,
  p_amount integer,
  p_currency text,
  p_p24_order_id bigint,
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

revoke all on function public.apply_p24_purchase(text, integer, text, bigint, text, jsonb) from public, anon, authenticated;
grant execute on function public.apply_p24_purchase(text, integer, text, bigint, text, jsonb) to service_role;
