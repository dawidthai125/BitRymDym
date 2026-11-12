-- Owner 2026-11-12: nobody should be able to collect the clean Bit files. Every FULL-file playback URL handed to a
-- signed-in user (Studio / recording page / Windows program) is logged, and the app limits requests per user and hour.
-- Service-role only: RLS on, no policies.
create table if not exists public.beat_audio_playback_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  beat_id uuid not null references public.beats (id) on delete cascade,
  asset_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists beat_audio_playback_log_user_idx on public.beat_audio_playback_log (user_id, created_at desc);
alter table public.beat_audio_playback_log enable row level security;
