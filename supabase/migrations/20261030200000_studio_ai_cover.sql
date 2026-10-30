-- Gold — AI cover generator (prompt → image for the YouTube MP4 / beat cover).
-- 1) studio_ai_cover_usage: per-user daily cap ledger (Europe/Warsaw day, counted in the app;
--    'pending' reserves a slot while generating, 'failed' = all providers down, not counted).
-- 2) studio_ai_provider_state: free-tier exhaustion shared by all serverless instances
--    (e.g. Cloudflare daily neurons used up → blocked until 00:00 UTC; Pollinations Retry-After).
-- Service role only (RLS on, no policies). Images themselves live in the audio-artifacts
-- bucket under studio-video/{owner}/{project}/img/ (image/jpeg added by 20261030180000).

create table if not exists public.studio_ai_cover_usage (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.studio_projects(id) on delete set null,
  image_id uuid,
  aspect text not null check (aspect in ('16:9', '1:1')),
  status text not null default 'pending' check (status in ('pending', 'ok', 'image_rejected', 'failed')),
  provider text check (provider is null or provider in ('cloudflare', 'pollinations')),
  attempts text check (attempts is null or char_length(attempts) <= 200),
  created_at timestamptz not null default now()
);

create index if not exists studio_ai_cover_usage_owner_day_idx
  on public.studio_ai_cover_usage (owner_id, created_at desc);

alter table public.studio_ai_cover_usage enable row level security;

create table if not exists public.studio_ai_provider_state (
  provider text primary key check (provider in ('cloudflare', 'pollinations')),
  blocked_until timestamptz not null,
  reason text check (reason is null or char_length(reason) <= 20),
  updated_at timestamptz not null default now()
);

alter table public.studio_ai_provider_state enable row level security;

revoke all on public.studio_ai_cover_usage from anon, authenticated;
revoke all on public.studio_ai_provider_state from anon, authenticated;
