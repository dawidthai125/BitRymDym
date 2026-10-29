CREATE OR REPLACE FUNCTION public.finalize_take_ready_swap(
  p_take_id uuid,
  p_actor_owner_id uuid,
  p_actor_anon_hash text,
  p_duration_seconds integer,
  p_byte_size bigint,
  p_content_type text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_take public.takes%ROWTYPE;
  v_old public.takes%ROWTYPE;
  v_deleted_at timestamptz;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Only service_role may finalize take ready swap' USING ERRCODE = '42501';
  END IF;
  IF p_take_id IS NULL THEN RAISE EXCEPTION 'take_id is required'; END IF;
  IF (p_actor_owner_id IS NULL AND p_actor_anon_hash IS NULL)
     OR (p_actor_owner_id IS NOT NULL AND p_actor_anon_hash IS NOT NULL) THEN
    RAISE EXCEPTION 'Exactly one of owner_id or anonymous_token_hash required';
  END IF;
  IF p_duration_seconds IS NULL OR p_duration_seconds < 0 OR p_duration_seconds > 180 THEN
    RAISE EXCEPTION 'Invalid duration_seconds';
  END IF;
  IF p_byte_size IS NULL OR p_byte_size <= 0 THEN RAISE EXCEPTION 'Invalid byte_size'; END IF;
  IF p_content_type IS NULL OR length(trim(p_content_type)) = 0 THEN RAISE EXCEPTION 'Invalid content_type'; END IF;

  IF p_actor_owner_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(p_actor_owner_id::text, 0));
  ELSE
    PERFORM pg_advisory_xact_lock(87245104, hashtext(p_actor_anon_hash));
  END IF;

  SELECT * INTO v_take FROM public.takes t WHERE t.id = p_take_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Take not found' USING ERRCODE = 'P0002'; END IF;

  IF p_actor_owner_id IS NOT NULL THEN
    IF v_take.owner_id IS DISTINCT FROM p_actor_owner_id THEN
      RAISE EXCEPTION 'REPLACE_OWNERSHIP_DENIED' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    IF v_take.anonymous_token_hash IS DISTINCT FROM p_actor_anon_hash OR v_take.owner_id IS NOT NULL THEN
      RAISE EXCEPTION 'REPLACE_OWNERSHIP_DENIED' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF v_take.deleted_at IS NOT NULL OR v_take.status = 'DELETED' THEN
    RAISE EXCEPTION 'Take was deleted' USING ERRCODE = 'P0001';
  END IF;

  IF v_take.status = 'READY' THEN
    IF v_take.replaces_take_id IS NOT NULL THEN
      SELECT * INTO v_old FROM public.takes WHERE id = v_take.replaces_take_id;
      IF FOUND AND v_old.status IS DISTINCT FROM 'DELETED' THEN
        v_deleted_at := coalesce(v_old.deleted_at, now());
        UPDATE public.takes SET status = 'DELETED', deleted_at = v_deleted_at,
          failure_reason = coalesce(failure_reason, 'REPLACED')
        WHERE id = v_old.id AND status = 'READY' AND deleted_at IS NULL;
      END IF;
    END IF;
    RETURN jsonb_build_object(
      'take_id', v_take.id, 'beat_id', v_take.beat_id, 'status', 'READY',
      'duration_seconds', v_take.duration_seconds, 'byte_size', v_take.byte_size,
      'content_type', v_take.content_type, 'replaced_take_id', v_take.replaces_take_id,
      'idempotent_replay', true, 'code', 'REPLACE_IDEMPOTENCY_REPLAY'
    );
  END IF;

  IF v_take.status IS DISTINCT FROM 'PENDING_UPLOAD' THEN
    RAISE EXCEPTION 'Take is not awaiting finalize' USING ERRCODE = 'P0001';
  END IF;

  IF v_take.expires_at <= now() THEN
    UPDATE public.takes SET status = 'EXPIRED', failure_reason = 'EXPIRED'
    WHERE id = v_take.id AND status = 'PENDING_UPLOAD';
    RAISE EXCEPTION 'Take session expired' USING ERRCODE = 'P0001';
  END IF;

  IF v_take.replaces_take_id IS NOT NULL THEN
    SELECT * INTO v_old FROM public.takes t WHERE t.id = v_take.replaces_take_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'REPLACE_INVALID' USING ERRCODE = 'P0001'; END IF;
    IF p_actor_owner_id IS NOT NULL THEN
      IF v_old.owner_id IS DISTINCT FROM p_actor_owner_id THEN
        RAISE EXCEPTION 'REPLACE_OWNERSHIP_DENIED' USING ERRCODE = 'P0001';
      END IF;
    ELSE
      IF v_old.anonymous_token_hash IS DISTINCT FROM p_actor_anon_hash OR v_old.owner_id IS NOT NULL THEN
        RAISE EXCEPTION 'REPLACE_OWNERSHIP_DENIED' USING ERRCODE = 'P0001';
      END IF;
    END IF;
    IF v_old.deleted_at IS NOT NULL OR v_old.status = 'DELETED' THEN
      RAISE EXCEPTION 'REPLACE_CONFLICT' USING ERRCODE = 'P0001';
    END IF;
    IF v_old.status IS DISTINCT FROM 'READY' THEN
      RAISE EXCEPTION 'REPLACE_NOT_READY' USING ERRCODE = 'P0001';
    END IF;
    IF v_old.expires_at <= now() THEN
      RAISE EXCEPTION 'REPLACE_EXPIRED' USING ERRCODE = 'P0001';
    END IF;

    v_deleted_at := now();
    UPDATE public.takes SET status = 'READY', duration_seconds = p_duration_seconds,
      byte_size = p_byte_size, content_type = p_content_type, failure_reason = NULL
    WHERE id = v_take.id AND status = 'PENDING_UPLOAD' AND deleted_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'REPLACE_CONFLICT' USING ERRCODE = 'P0001'; END IF;

    UPDATE public.takes SET status = 'DELETED', deleted_at = v_deleted_at, failure_reason = 'REPLACED'
    WHERE id = v_old.id AND status = 'READY' AND deleted_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'REPLACE_CONFLICT' USING ERRCODE = 'P0001'; END IF;

    RETURN jsonb_build_object(
      'take_id', v_take.id, 'beat_id', v_take.beat_id, 'status', 'READY',
      'duration_seconds', p_duration_seconds, 'byte_size', p_byte_size,
      'content_type', p_content_type, 'replaced_take_id', v_old.id,
      'replaced_object_key', v_old.object_key, 'replaced_storage_bucket', v_old.storage_bucket,
      'idempotent_replay', false
    );
  END IF;

  UPDATE public.takes SET status = 'READY', duration_seconds = p_duration_seconds,
    byte_size = p_byte_size, content_type = p_content_type, failure_reason = NULL
  WHERE id = v_take.id AND status = 'PENDING_UPLOAD' AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'REPLACE_CONFLICT' USING ERRCODE = 'P0001'; END IF;

  RETURN jsonb_build_object(
    'take_id', v_take.id, 'beat_id', v_take.beat_id, 'status', 'READY',
    'duration_seconds', p_duration_seconds, 'byte_size', p_byte_size,
    'content_type', p_content_type, 'replaced_take_id', NULL, 'idempotent_replay', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_take_ready_swap(
  uuid, uuid, text, integer, bigint, text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.finalize_take_ready_swap(
  uuid, uuid, text, integer, bigint, text
) TO service_role;
;
