-- P3 Anonymous READY Take → Account Claim
-- Additive RPC only. Does not alter takes schema / RLS / Storage policies.
-- Ownership transfer + object_key flip; Storage COPY/DELETE is application-side.

CREATE OR REPLACE FUNCTION public.claim_anon_take_to_account(
  p_owner_id uuid,
  p_anonymous_token_hash text,
  p_expires_at timestamptz,
  p_max_active_ready integer,
  p_expected_new_object_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_take public.takes%ROWTYPE;
  v_active_ready integer;
  v_hash_prefix text;
  v_expected_anon_key text;
  v_canonical_user_key text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Only service_role may claim anonymous takes to accounts'
      USING ERRCODE = '42501';
  END IF;

  IF p_owner_id IS NULL THEN
    RAISE EXCEPTION 'CLAIM_INVALID: owner_id required'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_anonymous_token_hash IS NULL
     OR length(trim(p_anonymous_token_hash)) < 32 THEN
    RAISE EXCEPTION 'CLAIM_INVALID: anonymous_token_hash required'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_expires_at IS NULL OR p_expires_at <= now() THEN
    RAISE EXCEPTION 'CLAIM_INVALID: expires_at must be in the future'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_max_active_ready IS NULL OR p_max_active_ready < 0 THEN
    RAISE EXCEPTION 'CLAIM_INVALID: invalid max_active_ready'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_expected_new_object_key IS NULL
     OR p_expected_new_object_key !~ (
       '^user/' || p_owner_id::text ||
       '/takes/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/mic\.bin$'
     ) THEN
    RAISE EXCEPTION 'CLAIM_INVALID: expected_new_object_key is not canonical'
      USING ERRCODE = 'P0001';
  END IF;

  -- Lock order frozen (Design Freeze): anon class first, then owner.
  PERFORM pg_advisory_xact_lock(87245104, hashtext(p_anonymous_token_hash));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_owner_id::text, 0));

  -- Idempotent replay: already owned at expected user path.
  SELECT * INTO v_take
  FROM public.takes t
  WHERE t.object_key = p_expected_new_object_key
    AND t.owner_id = p_owner_id
    AND t.status = 'READY'
    AND t.deleted_at IS NULL
  FOR UPDATE;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'take_id', v_take.id,
      'beat_id', v_take.beat_id,
      'old_object_key', NULL,
      'new_object_key', v_take.object_key,
      'expires_at', v_take.expires_at,
      'code', 'CLAIM_IDEMPOTENT_REPLAY'
    );
  END IF;

  SELECT * INTO v_take
  FROM public.takes t
  WHERE t.anonymous_token_hash = p_anonymous_token_hash
    AND t.owner_id IS NULL
    AND t.status = 'READY'
    AND t.deleted_at IS NULL
    AND t.expires_at > now()
  ORDER BY t.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CLAIM_NO_ELIGIBLE'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*)::integer INTO v_active_ready
  FROM public.takes t
  WHERE t.owner_id = p_owner_id
    AND t.status = 'READY'
    AND t.deleted_at IS NULL
    AND t.expires_at > now();

  IF v_active_ready >= p_max_active_ready THEN
    RAISE EXCEPTION 'CLAIM_CAP_REACHED'
      USING ERRCODE = 'P0001';
  END IF;

  v_canonical_user_key :=
    'user/' || p_owner_id::text || '/takes/' || v_take.id::text || '/mic.bin';

  IF p_expected_new_object_key IS DISTINCT FROM v_canonical_user_key THEN
    RAISE EXCEPTION 'CLAIM_INVALID: expected_new_object_key does not match take'
      USING ERRCODE = 'P0001';
  END IF;

  v_hash_prefix := lower(substr(p_anonymous_token_hash, 1, 32));
  v_expected_anon_key :=
    'anon/' || v_hash_prefix || '/takes/' || v_take.id::text || '/mic.bin';

  IF v_take.object_key IS DISTINCT FROM v_expected_anon_key THEN
    RAISE EXCEPTION 'CLAIM_INVALID: anonymous object_key mismatch'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_take.storage_bucket IS DISTINCT FROM 'take-audio' THEN
    RAISE EXCEPTION 'CLAIM_INVALID: invalid storage bucket'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.takes
  SET
    owner_id = p_owner_id,
    anonymous_token_hash = NULL,
    object_key = p_expected_new_object_key,
    expires_at = p_expires_at,
    updated_at = now()
  WHERE id = v_take.id
    AND anonymous_token_hash = p_anonymous_token_hash
    AND owner_id IS NULL
    AND status = 'READY'
    AND deleted_at IS NULL
    AND expires_at > now()
  RETURNING * INTO v_take;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CLAIM_CONFLICT'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object(
    'take_id', v_take.id,
    'beat_id', v_take.beat_id,
    'old_object_key', v_expected_anon_key,
    'new_object_key', v_take.object_key,
    'expires_at', v_take.expires_at,
    'code', 'CLAIM_OK'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_anon_take_to_account(
  uuid, text, timestamptz, integer, text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_anon_take_to_account(
  uuid, text, timestamptz, integer, text
) TO service_role;
