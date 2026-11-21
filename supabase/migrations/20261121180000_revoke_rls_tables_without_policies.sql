-- M1 (audyt 2026-11-21): tabele z RLS bez polityk są dostępne tylko dla service_role.
-- RLS już blokuje wiersze; REVOKE usuwa też uprawnienia tabelowe (obrona w głąb).
do $$
declare t text;
begin
  foreach t in array array[
    'admin_audit_events','auth_attempts','beat_access_grants','beat_audio_fingerprints',
    'beat_audio_playback_log','beat_download_reservations','beat_rights_hash_locks',
    'bitek_chat_usage','bitek_llm_jobs','desktop_studio_sends','payment_order_reviews',
    'sampek_usage','sample_policy_settings','site_settings','studio_ai_cover_usage',
    'studio_ai_lyrics_usage','studio_ai_provider_state','studio_listen_hits',
    'studio_mix_working_idempotency','studio_mix_working_revisions','usage_resets'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('revoke all on table public.%I from anon, authenticated', t);
    end if;
  end loop;
end $$;
