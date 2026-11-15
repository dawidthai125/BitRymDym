-- One-off PayU purchase of a paid-catalog beat wav.
-- Price is fixed here at 1999 grosz (19.99 PLN). The checkout body has no amount.
-- A beat order does not change a plan, an add-on, or a quota pack.
-- Buyers may read their own purchase rows. Writes are service_role only.
-- This file is not applied from the app. Apply it with the normal migration path.

alter table public.payment_orders add column if not exists beat_id uuid;

alter table public.payment_orders drop constraint if exists payment_orders_beat_fk;
alter table public.payment_orders
  add constraint payment_orders_beat_fk
  foreign key (beat_id) references public.beats (id);

alter table public.payment_orders drop constraint if exists payment_orders_kind_chk;
alter table public.payment_orders add constraint payment_orders_kind_chk
  check (product_kind in ('plan', 'addon', 'pack', 'beat'));

alter table public.payment_orders drop constraint if exists payment_orders_product_chk;
alter table public.payment_orders add constraint payment_orders_product_chk check (
  (product_kind = 'plan' and plan_tier is not null and addon is null and pack is null and beat_id is null and period in ('month', 'year'))
  or
  (product_kind = 'addon' and addon = 'reference_mastering' and plan_tier is null and pack is null and beat_id is null and period = 'month')
  or
  (product_kind = 'pack' and pack in ('take', 'master', 'youtube') and plan_tier is null and addon is null and beat_id is null and period = 'once')
  or
  (product_kind = 'beat' and beat_id is not null and plan_tier is null and addon is null and pack is null and period = 'once' and amount_grosz = 1999)
);

create index if not exists payment_orders_beat_id_idx
  on public.payment_orders (user_id, beat_id, created_at desc)
  where beat_id is not null;

create table if not exists public.beat_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  beat_id uuid not null references public.beats (id),
  payment_order_id uuid not null references public.payment_orders (id),
  created_at timestamptz not null default now(),
  constraint beat_purchases_user_beat_uidx unique (user_id, beat_id),
  constraint beat_purchases_order_uidx unique (payment_order_id)
);

create index if not exists beat_purchases_beat_id_idx on public.beat_purchases (beat_id);

create or replace function public.beat_purchases_service_role_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Only service_role may mutate beat_purchases' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists beat_purchases_service_role_only on public.beat_purchases;
create trigger beat_purchases_service_role_only
before insert or update or delete on public.beat_purchases
for each row
execute function public.beat_purchases_service_role_only();

alter table public.beat_purchases enable row level security;

drop policy if exists beat_purchases_select_own on public.beat_purchases;
create policy beat_purchases_select_own
  on public.beat_purchases
  for select
  to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.beat_purchases from anon, authenticated;
grant select on public.beat_purchases to authenticated;
grant select, insert, update, delete on public.beat_purchases to service_role;

revoke all on function public.beat_purchases_service_role_only() from public, anon, authenticated;
grant execute on function public.beat_purchases_service_role_only() to service_role;

comment on table public.beat_purchases is
  'Paid-catalog wav purchases. SELECT own row. Mutations service_role only. One row per user and beat.';

-- Idempotent wav grant. A replay does not insert a second purchase.
-- A second paid order for the same beat is marked skipped and does not replace the first file.
create or replace function public.grant_payu_beat_wav(
  p_session_id text,
  p_amount integer,
  p_currency text,
  p_payu_order_id text,
  p_statement text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.payment_orders%rowtype;
  v_inserted integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'PAYMENT_FORBIDDEN' using errcode = '42501';
  end if;
  if p_payu_order_id is null or p_payu_order_id !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$' then
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

  if v_order.product_kind is distinct from 'beat'
     or v_order.beat_id is null
     or v_order.plan_tier is not null
     or v_order.addon is not null
     or v_order.pack is not null
     or v_order.period is distinct from 'once' then
    return jsonb_build_object('result', 'conflict');
  end if;

  if v_order.amount_grosz is distinct from 1999
     or p_amount is distinct from 1999
     or v_order.currency is distinct from 'PLN'
     or p_currency is distinct from 'PLN' then
    return jsonb_build_object('result', 'amount');
  end if;

  if exists (
    select 1 from public.payment_orders
    where p24_order_id = p_payu_order_id
      and id <> v_order.id
  ) then
    return jsonb_build_object('result', 'conflict');
  end if;

  insert into public.beat_purchases (user_id, beat_id, payment_order_id)
  values (v_order.user_id, v_order.beat_id, v_order.id)
  on conflict (user_id, beat_id) do nothing;

  get diagnostics v_inserted = row_count;

  if v_inserted = 0 then
    update public.payment_orders
       set status = 'paid',
           grant_status = 'skipped',
           grant_note = 'already_owned',
           paid_at = coalesce(paid_at, now()),
           p24_order_id = p_payu_order_id,
           p24_statement = left(coalesce(p_statement, ''), 200)
     where id = v_order.id;
    return jsonb_build_object('result', 'skipped');
  end if;

  update public.payment_orders
     set status = 'paid',
         grant_status = 'granted',
         grant_note = null,
         paid_at = coalesce(paid_at, now()),
         p24_order_id = p_payu_order_id,
         p24_statement = left(coalesce(p_statement, ''), 200)
   where id = v_order.id;

  return jsonb_build_object('result', 'granted');
end;
$$;

revoke all on function public.grant_payu_beat_wav(text, integer, text, text, text) from public, anon, authenticated;
grant execute on function public.grant_payu_beat_wav(text, integer, text, text, text) to service_role;
