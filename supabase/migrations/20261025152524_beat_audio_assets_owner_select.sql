-- Owner SELECT on own beat_audio_assets (any beat status, including DRAFT).
-- Fixes community submit assertActiveMasterReady when user session cannot see
-- READY MASTER under published-only + staff-only SELECT policies.
-- Additive: does not alter INSERT/UPDATE/DELETE, staff, or published policies.

CREATE POLICY beat_audio_assets_select_own
  ON public.beat_audio_assets
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.beats b
      WHERE b.id = beat_audio_assets.beat_id
        AND b.owner_id IS NOT NULL
        AND b.owner_id = (SELECT auth.uid())
    )
  );

COMMENT ON POLICY beat_audio_assets_select_own ON public.beat_audio_assets IS
  'Authenticated beat owner may SELECT assets of own beats (incl. DRAFT); not a draft-wide open policy.';
