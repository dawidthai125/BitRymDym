-- Phase 1.8A follow-up: revoke claim RPC from anon/authenticated (service_role only).
-- Original migration REVOKE FROM PUBLIC can leave role-level EXECUTE in some setups.

REVOKE ALL ON FUNCTION public.claim_beat_download_slot(
  uuid, uuid, public.beat_download_actor_type, uuid, text, integer, timestamptz
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.claim_beat_download_slot(
  uuid, uuid, public.beat_download_actor_type, uuid, text, integer, timestamptz
) FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_beat_download_slot(
  uuid, uuid, public.beat_download_actor_type, uuid, text, integer, timestamptz
) TO service_role;
