-- Harden claim_take_recording_session: revoke client EXECUTE.
-- Function body already rejects non-service_role; this removes Data API surface.

REVOKE ALL ON FUNCTION public.claim_take_recording_session(
  uuid, uuid, uuid, text, text, bigint, public.take_recording_mode,
  integer, integer, integer, timestamptz, integer, integer
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_take_recording_session(
  uuid, uuid, uuid, text, text, bigint, public.take_recording_mode,
  integer, integer, integer, timestamptz, integer, integer
) TO service_role;
