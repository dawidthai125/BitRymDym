-- One half-year prize for a finished track. The winner turns it on.
-- Clock starts at that click. community_rewards stays beat/sample, week/month.
-- Gold keeps its end and gains 365 days. Silver and Bronze freeze their remaining time.

create table if not exists public.work_half_prizes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  half_key text not null,
  place integer not null,
  work_id uuid not null references public.catalog_works (id) on delete cascade,
  status text not null default 'offered',
  paused_tier text,
  paused_ms bigint,
  paused_source text,
  paused_used_at timestamptz,
  activated_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint work_half_prizes_half_key_chk check (half_key ~ '^[0-9]{4}-H[12]$'),
  constraint work_half_prizes_place_chk check (place between 1 and 1000),
  constraint work_half_prizes_status_chk check (status in ('offered', 'active')),
  constraint work_half_prizes_paused_tier_chk check (paused_tier is null or paused_tier in ('BRONZE', 'SILVER')),
  constraint work_half_prizes_paused_ms_chk check (paused_ms is null or (paused_ms > 0 and paused_ms <= 500000000000)),
  constraint work_half_prizes_paused_pair_chk check ((paused_tier is null) = (paused_ms is null)),
  constraint work_half_prizes_paused_source_chk check (paused_source is null or char_length(paused_source) between 1 and 40)
);

create unique index if not exists work_half_prizes_half_key_uidx
  on public.work_half_prizes (half_key);

comment on table public.work_half_prizes is
  'Unclaimed half-year Gold for 1st place of a closed half. Activation starts the year. A paused Silver or Bronze waits until the account is Free.';

create or replace function public.claim_work_half_prize(p_prize_id uuid, p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prize public.work_half_prizes%rowtype;
  v_row public.premium_entitlements%rowtype;
  v_found boolean := false;
  v_tier text;
  v_expires timestamptz;
  v_pending_tier text;
  v_pending_end timestamptz;
  v_source text;
  v_new_expires timestamptz;
  v_new_pending_tier text;
  v_new_pending_end timestamptz;
  v_paused_tier text;
  v_paused_ms bigint;
  v_paused_source text;
  v_len interval;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'CATALOG_FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_prize
  from public.work_half_prizes
  where id = p_prize_id and user_id = p_user_id
  for update;
  if not found then return 'missing'; end if;
  if v_prize.status = 'active' then return 'already'; end if;
  if v_prize.status is distinct from 'offered' then return 'wait'; end if;

  select * into v_row
  from public.premium_entitlements
  where user_id = p_user_id and active
  for update;
  v_found := found;

  if v_found then
    v_tier := v_row.tier::text;
    v_expires := v_row.expires_at;
    v_pending_tier := v_row.pending_tier::text;
    v_pending_end := v_row.pending_expires_at;
    v_source := v_row.source;
    if v_expires is not null and v_expires <= now()
       and v_pending_end is not null and v_pending_end > now()
       and v_pending_tier in ('BRONZE', 'SILVER', 'GOLD') then
      v_tier := v_pending_tier;
      v_expires := v_pending_end;
      v_pending_tier := null;
      v_pending_end := null;
      v_source := null;
    end if;
  end if;

  if v_tier in ('BRONZE', 'SILVER', 'GOLD') and v_expires is null then
    return 'perpetual';
  end if;

  if v_source = 'work_prize' and v_tier = 'GOLD' and v_expires is not null and v_expires > now() then
    return 'already';
  end if;

  v_paused_tier := null;
  v_paused_ms := null;
  v_paused_source := null;
  v_new_pending_tier := null;
  v_new_pending_end := null;

  if v_tier = 'GOLD' and v_expires is not null and v_expires > now() then
    v_new_expires := v_expires + interval '365 days';
    if v_pending_tier in ('BRONZE', 'SILVER', 'GOLD') and v_pending_end is not null and v_pending_end > v_expires then
      v_len := v_pending_end - v_expires;
      v_new_pending_tier := v_pending_tier;
      v_new_pending_end := v_new_expires + v_len;
    end if;
  elsif v_tier in ('BRONZE', 'SILVER') and v_expires is not null and v_expires > now() then
    v_paused_tier := v_tier;
    v_paused_ms := floor(extract(epoch from (v_expires - now())) * 1000)::bigint;
    if v_paused_ms < 1 then v_paused_ms := 1; end if;
    v_paused_source := left(coalesce(nullif(btrim(v_source), ''), 'purchase'), 40);
    v_new_expires := now() + interval '365 days';
    if v_pending_tier in ('BRONZE', 'SILVER', 'GOLD') and v_pending_end is not null and v_pending_end > v_expires then
      v_len := v_pending_end - v_expires;
      v_new_pending_tier := v_pending_tier;
      v_new_pending_end := v_new_expires + v_len;
    end if;
  else
    v_new_expires := now() + interval '365 days';
  end if;

  if v_new_expires > now() + interval '15 years' then
    return 'conflict';
  end if;

  if v_found then
    update public.premium_entitlements
      set tier = 'GOLD'::public.premium_tier,
          active = true,
          source = 'work_prize',
          expires_at = v_new_expires,
          pending_tier = nullif(v_new_pending_tier, '')::public.premium_tier,
          pending_expires_at = v_new_pending_end
      where id = v_row.id;
  else
    insert into public.premium_entitlements (
      user_id, active, source, expires_at, tier, pending_tier, pending_expires_at
    ) values (
      p_user_id,
      true,
      'work_prize',
      v_new_expires,
      'GOLD'::public.premium_tier,
      nullif(v_new_pending_tier, '')::public.premium_tier,
      v_new_pending_end
    );
  end if;

  update public.work_half_prizes
    set status = 'active',
        activated_at = now(),
        expires_at = v_new_expires,
        paused_tier = v_paused_tier,
        paused_ms = v_paused_ms,
        paused_source = v_paused_source,
        updated_at = now()
    where id = v_prize.id;

  return 'ok';
end;
$$;

create or replace function public.resume_work_plan_hold(p_prize_id uuid, p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prize public.work_half_prizes%rowtype;
  v_row public.premium_entitlements%rowtype;
  v_found boolean := false;
  v_expires timestamptz;
  v_source text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'CATALOG_FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_prize
  from public.work_half_prizes
  where id = p_prize_id and user_id = p_user_id
  for update;
  if not found then return 'missing'; end if;
  if v_prize.paused_used_at is not null then return 'already'; end if;
  if v_prize.paused_tier is null or v_prize.paused_ms is null or v_prize.paused_ms < 1 then
    return 'missing';
  end if;

  select * into v_row
  from public.premium_entitlements
  where user_id = p_user_id and active
  for update;
  v_found := found;

  if v_found then
    if v_row.tier::text in ('BRONZE', 'SILVER', 'GOLD') and v_row.expires_at is null then
      return 'wait';
    end if;
    if v_row.tier::text in ('BRONZE', 'SILVER', 'GOLD') and v_row.expires_at > now() then
      return 'wait';
    end if;
    if v_row.expires_at is not null and v_row.expires_at <= now()
       and v_row.pending_expires_at is not null and v_row.pending_expires_at > now()
       and v_row.pending_tier::text in ('BRONZE', 'SILVER', 'GOLD') then
      return 'wait';
    end if;
  end if;

  v_expires := now() + (v_prize.paused_ms * interval '1 millisecond');
  if v_expires > now() + interval '15 years' then
    return 'conflict';
  end if;
  v_source := left(coalesce(nullif(btrim(v_prize.paused_source), ''), 'purchase'), 40);

  if v_found then
    update public.premium_entitlements
      set tier = v_prize.paused_tier::public.premium_tier,
          active = true,
          source = v_source,
          expires_at = v_expires,
          pending_tier = null,
          pending_expires_at = null
      where id = v_row.id;
  else
    insert into public.premium_entitlements (
      user_id, active, source, expires_at, tier, pending_tier, pending_expires_at
    ) values (
      p_user_id, true, v_source, v_expires, v_prize.paused_tier::public.premium_tier, null, null
    );
  end if;

  update public.work_half_prizes
    set paused_used_at = now(), updated_at = now()
    where id = v_prize.id;
  return 'ok';
end;
$$;

revoke all on function public.claim_work_half_prize(uuid, uuid) from public, anon, authenticated;
revoke all on function public.resume_work_plan_hold(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_work_half_prize(uuid, uuid) to service_role;
grant execute on function public.resume_work_plan_hold(uuid, uuid) to service_role;

alter table public.work_half_prizes enable row level security;
alter table public.work_half_prizes force row level security;
revoke all on table public.work_half_prizes from public, anon, authenticated;
grant select, insert, update, delete on table public.work_half_prizes to service_role;

create policy work_half_prizes_service_all
  on public.work_half_prizes
  for all
  to service_role
  using (true)
  with check (true);

create or replace function public.work_half_prizes_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'CATALOG_FORBIDDEN' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger work_half_prizes_guard_trg
  before insert or update on public.work_half_prizes
  for each row execute function public.work_half_prizes_guard();

revoke all on function public.work_half_prizes_guard() from public, anon, authenticated;
