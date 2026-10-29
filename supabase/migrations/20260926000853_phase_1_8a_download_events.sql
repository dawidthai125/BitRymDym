-- Phase 1.8A — Download Productization
-- Design Freeze: docs/phases/PHASE_1_8A_DESIGN_FREEZE.md
-- Additive only. Access Gate remains application-layer (no Storage policy changes).

CREATE TYPE public.beat_download_actor_type AS ENUM (
  'ANON',
  'USER',
  'ADMIN'
);

CREATE TABLE public.beat_download_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beat_id uuid NOT NULL REFERENCES public.beats (id) ON DELETE RESTRICT,
  asset_id uuid REFERENCES public.beat_audio_assets (id) ON DELETE SET NULL,
  actor_type public.beat_download_actor_type NOT NULL,
  user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  anonymous_token_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT beat_download_events_identity_chk CHECK (
    (
      actor_type = 'ANON'
      AND anonymous_token_hash IS NOT NULL
      AND char_length(anonymous_token_hash) = 64
      AND user_id IS NULL
    )
    OR (
      actor_type IN ('USER', 'ADMIN')
      AND user_id IS NOT NULL
      AND anonymous_token_hash IS NULL
    )
  )
);

CREATE INDEX beat_download_events_user_created_idx
  ON public.beat_download_events (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX beat_download_events_anon_created_idx
  ON public.beat_download_events (anonymous_token_hash, created_at DESC)
  WHERE anonymous_token_hash IS NOT NULL;

CREATE INDEX beat_download_events_beat_created_idx
  ON public.beat_download_events (beat_id, created_at DESC);

COMMENT ON TABLE public.beat_download_events IS
  'Phase 1.8A append-only DOWNLOAD_EVENT log. Raw anonymous tokens never stored.';

COMMENT ON COLUMN public.beat_download_events.anonymous_token_hash IS
  'SHA-256 hex of opaque httpOnly cookie token; never the raw token.';

ALTER TABLE public.beat_download_events ENABLE ROW LEVEL SECURITY;

-- Users may read only their own authenticated events (Moje pobrane).
CREATE POLICY beat_download_events_select_own
  ON public.beat_download_events
  FOR SELECT
  TO authenticated
  USING (
    user_id IS NOT NULL
    AND user_id = (SELECT auth.uid())
  );

-- No INSERT/UPDATE/DELETE policies for anon/authenticated.
-- Client cannot create events; Access Gate inserts via service_role only.

GRANT SELECT ON public.beat_download_events TO authenticated;
GRANT USAGE ON TYPE public.beat_download_actor_type TO authenticated;

-- Atomic limit claim under transaction advisory lock.
-- Inserts the event row when under limit; caller must delete the row if
-- signed-URL issuance fails (final OD-17: event persists only with successful URL).
CREATE OR REPLACE FUNCTION public.claim_beat_download_slot(
  p_beat_id uuid,
  p_asset_id uuid,
  p_actor_type public.beat_download_actor_type,
  p_user_id uuid,
  p_anonymous_token_hash text,
  p_daily_limit integer,
  p_window_start timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lock_key bigint;
  v_count integer;
  v_event_id uuid;
BEGIN
  IF p_daily_limit IS NULL OR p_daily_limit < 0 THEN
    RAISE EXCEPTION 'invalid daily limit';
  END IF;

  IF p_actor_type = 'ANON' THEN
    IF p_anonymous_token_hash IS NULL OR p_user_id IS NOT NULL THEN
      RAISE EXCEPTION 'invalid ANON identity';
    END IF;
    v_lock_key := hashtextextended('brd_dl_anon:' || p_anonymous_token_hash, 0);
  ELSIF p_actor_type = 'USER' THEN
    IF p_user_id IS NULL OR p_anonymous_token_hash IS NOT NULL THEN
      RAISE EXCEPTION 'invalid USER identity';
    END IF;
    v_lock_key := hashtextextended('brd_dl_user:' || p_user_id::text, 0);
  ELSE
    RAISE EXCEPTION 'ADMIN must not use limited claim path';
  END IF;

  PERFORM pg_advisory_xact_lock(v_lock_key);

  IF p_actor_type = 'ANON' THEN
    SELECT count(*)::integer INTO v_count
    FROM public.beat_download_events
    WHERE actor_type = 'ANON'
      AND anonymous_token_hash = p_anonymous_token_hash
      AND created_at >= p_window_start;
  ELSE
    SELECT count(*)::integer INTO v_count
    FROM public.beat_download_events
    WHERE actor_type = 'USER'
      AND user_id = p_user_id
      AND created_at >= p_window_start;
  END IF;

  IF v_count >= p_daily_limit THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'count', v_count,
      'limit', p_daily_limit,
      'remaining', 0
    );
  END IF;

  INSERT INTO public.beat_download_events (
    beat_id,
    asset_id,
    actor_type,
    user_id,
    anonymous_token_hash
  )
  VALUES (
    p_beat_id,
    p_asset_id,
    p_actor_type,
    p_user_id,
    p_anonymous_token_hash
  )
  RETURNING id INTO v_event_id;

  RETURN jsonb_build_object(
    'allowed', true,
    'event_id', v_event_id,
    'count', v_count + 1,
    'limit', p_daily_limit,
    'remaining', greatest(p_daily_limit - (v_count + 1), 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_beat_download_slot(
  uuid, uuid, public.beat_download_actor_type, uuid, text, integer, timestamptz
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.claim_beat_download_slot(
  uuid, uuid, public.beat_download_actor_type, uuid, text, integer, timestamptz
) FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_beat_download_slot(
  uuid, uuid, public.beat_download_actor_type, uuid, text, integer, timestamptz
) TO service_role;
