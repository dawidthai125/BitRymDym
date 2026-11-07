-- Community ratings, comments and claimable ranking prizes.
-- Applied on BitRymDym (rzzxrgcdogkybkiidqgw) 2026-11-07 after Owner GO.
-- The app fail-closes while these tables are absent.
-- Writes are service_role only. A prize never inserts a perpetual premium row.

create table if not exists public.community_ratings (
  id uuid primary key default gen_random_uuid(),
  target_kind text not null check (target_kind in ('beat', 'sample')),
  target_id uuid not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  stars smallint not null check (stars between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint community_ratings_one_vote unique (target_kind, target_id, user_id)
);

create index if not exists community_ratings_window_idx
  on public.community_ratings (target_kind, created_at);

create table if not exists public.community_comments (
  id uuid primary key default gen_random_uuid(),
  target_kind text not null check (target_kind in ('beat', 'sample')),
  target_id uuid not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);

create index if not exists community_comments_target_idx
  on public.community_comments (target_kind, target_id, created_at desc);

create table if not exists public.community_rewards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  period_kind text not null check (period_kind in ('week', 'month')),
  period_key text not null check (char_length(period_key) between 6 and 16),
  place smallint not null check (place between 1 and 3),
  target_kind text not null check (target_kind in ('beat', 'sample')),
  target_id uuid not null,
  reward_mode text not null check (reward_mode in ('extend_days', 'package_month')),
  reward_tier text not null check (reward_tier in ('EXTEND', 'BRONZE', 'SILVER', 'GOLD')),
  reward_days integer not null check (reward_days between 1 and 31),
  status text not null default 'unclaimed' check (status in ('unclaimed', 'reserving', 'claimed')),
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint community_rewards_place_once unique (period_kind, period_key, target_kind, place),
  constraint community_rewards_work_once unique (period_kind, period_key, target_kind, target_id)
);

create index if not exists community_rewards_user_idx
  on public.community_rewards (user_id, status, created_at desc);

comment on table public.community_rewards is
  'Unclaimed ranking prizes. Claim applies a finite premium window. It does not auto-start and cannot be perpetual.';

alter table public.community_ratings enable row level security;
alter table public.community_ratings force row level security;
alter table public.community_comments enable row level security;
alter table public.community_comments force row level security;
alter table public.community_rewards enable row level security;
alter table public.community_rewards force row level security;

revoke all on table public.community_ratings from public, anon, authenticated;
revoke all on table public.community_comments from public, anon, authenticated;
revoke all on table public.community_rewards from public, anon, authenticated;

grant select, insert, update, delete on table public.community_ratings to service_role;
grant select, insert, update, delete on table public.community_comments to service_role;
grant select, insert, update, delete on table public.community_rewards to service_role;

drop policy if exists community_ratings_service_all on public.community_ratings;
create policy community_ratings_service_all
  on public.community_ratings
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists community_comments_service_all on public.community_comments;
create policy community_comments_service_all
  on public.community_comments
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists community_rewards_service_all on public.community_rewards;
create policy community_rewards_service_all
  on public.community_rewards
  for all
  to service_role
  using (true)
  with check (true);

-- One transaction: the prize row and the finite premium window commit together.
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
