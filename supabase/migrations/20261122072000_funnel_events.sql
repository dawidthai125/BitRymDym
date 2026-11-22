-- 2026-11-22: purchase funnel for the owner (/admin/lejek).
-- Anonymous counters only: no user id, no IP, no cookie, no user agent.
-- 'checkout_started' and 'paid' are derived from payment_orders; the values stay allowed
-- in the check so a later change can store them without a new constraint.
create table if not exists public.funnel_events (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  event text not null,
  product text,
  tier text,
  constraint funnel_events_event_chk
    check (event in ('premium_view', 'buy_click', 'checkout_started', 'paid')),
  constraint funnel_events_product_chk
    check (product is null or product in ('plan', 'addon', 'pack', 'beat', 'take', 'master', 'youtube')),
  constraint funnel_events_tier_chk
    check (tier is null or tier in ('BRONZE', 'SILVER', 'GOLD'))
);

create index if not exists funnel_events_event_created_idx
  on public.funnel_events (event, created_at);

-- Service role only: RLS on, no policies, no grants for client roles.
alter table public.funnel_events enable row level security;
revoke all on table public.funnel_events from anon, authenticated;
revoke all on sequence public.funnel_events_id_seq from anon, authenticated;
