-- Phase 1.8A fix — OD-17: reservation ≠ final DOWNLOAD_EVENT
-- Design Freeze order: AuthZ → limit reserve → signed URL SUCCESS → EVENT
-- Additive. Does not change frozen limit values or Access Gate AuthZ.

-- ---------------------------------------------------------------------------
-- Least-privilege grants on beat_download_events (MAJOR audit fix)
-- ---------------------------------------------------------------------------
REVOKE ALL ON TABLE public.beat_download_events FROM PUBLIC;
REVOKE ALL ON TABLE public.beat_download_events FROM anon;
REVOKE ALL ON TABLE public.beat_download_events FROM authenticated;

GRANT SELECT ON TABLE public.beat_download_events TO authenticated;
-- service_role retains full access via default Supabase grants / bypass RLS

-- Drop provisional claim RPC (inserted final events before URL — rejected).
DROP FUNCTION IF EXISTS public.claim_beat_download_slot(
  uuid, uuid, public.beat_download_actor_type, uuid, text, integer, timestamptz
);

-- ---------------------------------------------------------------------------
-- Ephemeral limit reservations (NOT DOWNLOAD_EVENTs)
-- ---------------------------------------------------------------------------
CREATE TABLE public.beat_download_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beat_id uuid NOT NULL REFERENCES public.beats (id) ON DELETE RESTRICT,
  asset_id uuid REFERENCES public.beat_audio_assets (id) ON DELETE SET NULL,
  actor_type public.beat_download_actor_type NOT NULL,
  user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  anonymous_token_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CONSTRAINT beat_download_reservations_identity_chk CHECK (
    (
      actor_type = 'ANON'
      AND anonymous_token_hash IS NOT NULL
      AND char_length(anonymous_token_hash) = 64
      AND user_id IS NULL
    )
    OR (
      actor_type = 'USER'
      AND user_id IS NOT NULL
      AND anonymous_token_hash IS NULL
    )
  ),
  CONSTRAINT beat_download_reservations_actor_chk CHECK (
    actor_type IN ('ANON', 'USER')
  ),
  CONSTRAINT beat_download_reservations_expires_chk CHECK (
    expires_at > created_at
  )
);

CREATE INDEX beat_download_reservations_user_active_idx
  ON public.beat_download_reservations (user_id, expires_at)
  WHERE user_id IS NOT NULL;

CREATE INDEX beat_download_reservations_anon_active_idx
  ON public.beat_download_reservations (anonymous_token_hash, expires_at)
  WHERE anonymous_token_hash IS NOT NULL;

CREATE INDEX beat_download_reservations_expires_idx
  ON public.beat_download_reservations (expires_at);

COMMENT ON TABLE public.beat_download_reservations IS
  'Phase 1.8A ephemeral download slot holds. Never a DOWNLOAD_EVENT. Expires automatically.';

ALTER TABLE public.beat_download_reservations ENABLE ROW LEVEL SECURITY;

-- No SELECT/INSERT/UPDATE/DELETE policies for anon/authenticated.
REVOKE ALL ON TABLE public.beat_download_reservations FROM PUBLIC;
REVOKE ALL ON TABLE public.beat_download_reservations FROM anon;
REVOKE ALL ON TABLE public.beat_download_reservations FROM authenticated;

-- ---------------------------------------------------------------------------
-- reserve: atomic limit check + insert reservation (not an event)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reserve_beat_download_slot(
  p_beat_id uuid,
  p_asset_id uuid,
  p_actor_type public.beat_download_actor_type,
  p_user_id uuid,
  p_anonymous_token_hash text,
  p_daily_limit integer,
  p_window_start timestamptz,
  p_ttl_seconds integer DEFAULT 120
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lock_key bigint;
  v_event_count integer;
  v_reservation_count integer;
  v_used integer;
  v_reservation_id uuid;
  v_expires_at timestamptz;
BEGIN
  IF p_daily_limit IS NULL OR p_daily_limit < 0 THEN
    RAISE EXCEPTION 'invalid daily limit';
  END IF;
  IF p_ttl_seconds IS NULL OR p_ttl_seconds < 1 OR p_ttl_seconds > 600 THEN
    RAISE EXCEPTION 'invalid reservation ttl';
  END IF;

  IF p_actor_type = 'ANON' THEN
    IF p_anonymous_token_hash IS NULL OR p_user_id IS NOT NULL THEN
      RAISE EXCEPTION 'invalid ANON identity';
    END IF;
    v_lock_key := hashtextextended(
      'brd_dl_anon:' || p_anonymous_token_hash || ':day:' || p_window_start::text,
      0
    );
  ELSIF p_actor_type = 'USER' THEN
    IF p_user_id IS NULL OR p_anonymous_token_hash IS NOT NULL THEN
      RAISE EXCEPTION 'invalid USER identity';
    END IF;
    v_lock_key := hashtextextended(
      'brd_dl_user:' || p_user_id::text || ':day:' || p_window_start::text,
      0
    );
  ELSE
    RAISE EXCEPTION 'ADMIN must not use limited reservation path';
  END IF;

  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- Purge expired reservations for this identity (keeps counts accurate).
  IF p_actor_type = 'ANON' THEN
    DELETE FROM public.beat_download_reservations
    WHERE actor_type = 'ANON'
      AND anonymous_token_hash = p_anonymous_token_hash
      AND expires_at <= now();

    SELECT count(*)::integer INTO v_event_count
    FROM public.beat_download_events
    WHERE actor_type = 'ANON'
      AND anonymous_token_hash = p_anonymous_token_hash
      AND created_at >= p_window_start;

    SELECT count(*)::integer INTO v_reservation_count
    FROM public.beat_download_reservations
    WHERE actor_type = 'ANON'
      AND anonymous_token_hash = p_anonymous_token_hash
      AND expires_at > now()
      AND created_at >= p_window_start;
  ELSE
    DELETE FROM public.beat_download_reservations
    WHERE actor_type = 'USER'
      AND user_id = p_user_id
      AND expires_at <= now();

    SELECT count(*)::integer INTO v_event_count
    FROM public.beat_download_events
    WHERE actor_type = 'USER'
      AND user_id = p_user_id
      AND created_at >= p_window_start;

    SELECT count(*)::integer INTO v_reservation_count
    FROM public.beat_download_reservations
    WHERE actor_type = 'USER'
      AND user_id = p_user_id
      AND expires_at > now()
      AND created_at >= p_window_start;
  END IF;

  v_used := v_event_count + v_reservation_count;

  IF v_used >= p_daily_limit THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'count', v_used,
      'events', v_event_count,
      'reservations', v_reservation_count,
      'limit', p_daily_limit,
      'remaining', 0
    );
  END IF;

  v_expires_at := now() + make_interval(secs => p_ttl_seconds);

  INSERT INTO public.beat_download_reservations (
    beat_id,
    asset_id,
    actor_type,
    user_id,
    anonymous_token_hash,
    expires_at
  )
  VALUES (
    p_beat_id,
    p_asset_id,
    p_actor_type,
    p_user_id,
    p_anonymous_token_hash,
    v_expires_at
  )
  RETURNING id INTO v_reservation_id;

  RETURN jsonb_build_object(
    'allowed', true,
    'reservation_id', v_reservation_id,
    'expires_at', v_expires_at,
    'count', v_used + 1,
    'events', v_event_count,
    'reservations', v_reservation_count + 1,
    'limit', p_daily_limit,
    'remaining', greatest(p_daily_limit - (v_used + 1), 0)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- finalize: URL already succeeded → insert FINAL event + consume reservation
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finalize_beat_download(
  p_reservation_id uuid,
  p_beat_id uuid,
  p_asset_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_res public.beat_download_reservations%ROWTYPE;
  v_event_id uuid;
  v_lock_key bigint;
BEGIN
  SELECT * INTO v_res
  FROM public.beat_download_reservations
  WHERE id = p_reservation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'reservation not found';
  END IF;

  IF v_res.expires_at <= now() THEN
    DELETE FROM public.beat_download_reservations WHERE id = p_reservation_id;
    RAISE EXCEPTION 'reservation expired';
  END IF;

  IF v_res.beat_id IS DISTINCT FROM p_beat_id THEN
    RAISE EXCEPTION 'reservation beat mismatch';
  END IF;

  IF v_res.actor_type = 'ANON' THEN
    v_lock_key := hashtextextended(
      'brd_dl_anon:' || v_res.anonymous_token_hash || ':fin',
      0
    );
  ELSE
    v_lock_key := hashtextextended(
      'brd_dl_user:' || v_res.user_id::text || ':fin',
      0
    );
  END IF;

  PERFORM pg_advisory_xact_lock(v_lock_key);

  INSERT INTO public.beat_download_events (
    beat_id,
    asset_id,
    actor_type,
    user_id,
    anonymous_token_hash
  )
  VALUES (
    p_beat_id,
    COALESCE(p_asset_id, v_res.asset_id),
    v_res.actor_type,
    v_res.user_id,
    v_res.anonymous_token_hash
  )
  RETURNING id INTO v_event_id;

  DELETE FROM public.beat_download_reservations WHERE id = p_reservation_id;

  RETURN jsonb_build_object(
    'event_id', v_event_id,
    'reservation_id', p_reservation_id
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- release: URL failed / abandon — drop reservation, never create event
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.release_beat_download_reservation(
  p_reservation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.beat_download_reservations WHERE id = p_reservation_id;
  RETURN jsonb_build_object('released', true, 'reservation_id', p_reservation_id);
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_beat_download_slot(
  uuid, uuid, public.beat_download_actor_type, uuid, text, integer, timestamptz, integer
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_beat_download_slot(
  uuid, uuid, public.beat_download_actor_type, uuid, text, integer, timestamptz, integer
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_beat_download_slot(
  uuid, uuid, public.beat_download_actor_type, uuid, text, integer, timestamptz, integer
) TO service_role;

REVOKE ALL ON FUNCTION public.finalize_beat_download(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_beat_download(uuid, uuid, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_beat_download(uuid, uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.release_beat_download_reservation(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_beat_download_reservation(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_beat_download_reservation(uuid) TO service_role;
