-- Advisor follow-up after beat_rights_safety_p0: these SECURITY DEFINER functions
-- return `trigger` and are referenced only by their table triggers (no RPC, no
-- policy, no other function). PostgreSQL checks EXECUTE on a trigger function
-- only at CREATE TRIGGER time, so revoking it does not affect the triggers.
revoke execute on function public.beat_rights_basis_before_insert() from public, anon, authenticated;
revoke execute on function public.beat_rights_basis_immutable() from public, anon, authenticated;
revoke execute on function public.beat_rights_reviews_guard() from public, anon, authenticated;
revoke execute on function public.beat_blocked_audio_hashes_before_insert() from public, anon, authenticated;
revoke execute on function public.beat_blocked_audio_hashes_immutable() from public, anon, authenticated;
revoke execute on function public.beat_moderation_decisions_immutable() from public, anon, authenticated;
