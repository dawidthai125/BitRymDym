-- Gold cover ledger may record the xAI image provider. Pollinations stays a legacy id only.

alter table public.studio_ai_cover_usage drop constraint studio_ai_cover_usage_provider_check;
alter table public.studio_ai_cover_usage
  add constraint studio_ai_cover_usage_provider_check
  check (provider is null or provider in ('cloudflare', 'pollinations', 'xai'));

alter table public.studio_ai_provider_state drop constraint studio_ai_provider_state_provider_check;
alter table public.studio_ai_provider_state
  add constraint studio_ai_provider_state_provider_check
  check (provider in ('cloudflare', 'pollinations', 'xai'));
