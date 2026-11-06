-- Silver+ — AI lyrics helper: per-user daily cap ledger (Europe/Warsaw day, counted in the app).
-- 'pending' reserves a slot while generating; 'failed' (all providers down / unusable) is not counted.
-- Only the length of the user input is stored, never the text. Service role only (RLS on, no policies).

create table if not exists public.studio_ai_lyrics_usage (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.studio_projects(id) on delete set null,
  mode text not null check (mode in ('keywords', 'continue', 'verse')),
  input_chars integer not null check (input_chars between 0 and 10000),
  status text not null default 'pending' check (status in ('pending', 'ok', 'failed')),
  provider text check (provider is null or char_length(provider) <= 20),
  created_at timestamptz not null default now()
);

create index if not exists studio_ai_lyrics_usage_owner_day_idx
  on public.studio_ai_lyrics_usage (owner_id, created_at desc);

alter table public.studio_ai_lyrics_usage enable row level security;
revoke all on public.studio_ai_lyrics_usage from anon, authenticated;
