-- Rights Safety P0 grant hardening.
-- Supabase default privileges give anon/authenticated ALL (incl. UPDATE, DELETE,
-- TRUNCATE) on every new public table. TRUNCATE bypasses RLS and row triggers.
-- Reduce the rights tables to exactly what P0 intends.
REVOKE ALL ON TABLE
  public.beat_rights_basis,
  public.beat_rights_reviews,
  public.beat_rights_hash_locks,
  public.beat_blocked_audio_hashes,
  public.beat_moderation_decisions
FROM anon, authenticated;

GRANT SELECT, INSERT ON public.beat_rights_basis TO authenticated;
GRANT SELECT, INSERT ON public.beat_blocked_audio_hashes TO authenticated;
GRANT SELECT, INSERT ON public.beat_moderation_decisions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.beat_rights_reviews TO authenticated;
-- beat_rights_hash_locks: written only by SECURITY DEFINER functions.
