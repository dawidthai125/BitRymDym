-- Paid catalogue beats are sold exclusively (Owner 2026-11-22): one buyer per beat.
-- After the sale the beat leaves the public catalogue; only the buyer (and staff) still see it.
-- A refund (beat_purchases row deleted) puts the beat back on sale.

alter table public.beats add column if not exists sold_to uuid;
alter table public.beats add column if not exists sold_at timestamptz;

comment on column public.beats.sold_to is 'Exclusive buyer of a paid-catalogue beat (server-managed via beat_purchases).';

create unique index if not exists beat_purchases_beat_uidx on public.beat_purchases (beat_id);

create or replace function public.beat_purchases_sync_sold()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.beats set sold_to = new.user_id, sold_at = now() where id = new.beat_id;
    return new;
  end if;
  update public.beats set sold_to = null, sold_at = null
   where id = old.beat_id and sold_to is not distinct from old.user_id;
  return old;
end;
$$;

revoke all on function public.beat_purchases_sync_sold() from public, anon, authenticated;

drop trigger if exists beat_purchases_sync_sold on public.beat_purchases;
create trigger beat_purchases_sync_sold
after insert or delete on public.beat_purchases
for each row execute function public.beat_purchases_sync_sold();

create or replace function public.beats_sold_server_managed()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if (new.sold_to is distinct from old.sold_to or new.sold_at is distinct from old.sold_at)
     and auth.role() is distinct from 'service_role'
     and current_user not in ('postgres', 'supabase_admin')
     and not public.is_admin() then
    raise exception 'sold_to / sold_at are server-managed' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists beats_sold_server_managed on public.beats;
create trigger beats_sold_server_managed
before update on public.beats
for each row execute function public.beats_sold_server_managed();

drop policy if exists beats_select_published on public.beats;
create policy beats_select_published on public.beats
  for select to anon, authenticated
  using (status = 'PUBLISHED' and visibility = 'public' and sold_at is null);

drop policy if exists beats_select_buyer on public.beats;
create policy beats_select_buyer on public.beats
  for select to authenticated
  using (status = 'PUBLISHED' and sold_to = (select auth.uid()));

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

  -- Exclusive sale (Owner 2026-11-22): one buyer per beat. Lock the beat so two paid orders
  -- cannot both win; the loser is paid but not granted and goes to the refund review queue.
  perform 1 from public.beats where id = v_order.beat_id for update;
  if exists (
    select 1 from public.beat_purchases
    where beat_id = v_order.beat_id
      and user_id <> v_order.user_id
  ) then
    update public.payment_orders
       set status = 'paid',
           grant_status = 'skipped',
           grant_note = 'sold_to_other',
           paid_at = coalesce(paid_at, now()),
           p24_order_id = p_payu_order_id,
           p24_statement = left(coalesce(p_statement, ''), 200)
     where id = v_order.id;
    return jsonb_build_object('result', 'sold');
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
