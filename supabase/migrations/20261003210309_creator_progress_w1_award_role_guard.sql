-- Allow postgres maintainer sessions (SQL editor / MCP) in addition to service_role JWT.
-- Authenticated / anon remain denied via GRANT + role guard.

CREATE OR REPLACE FUNCTION public.prevent_creator_experience_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    IF coalesce(auth.role(), '') IS DISTINCT FROM 'service_role'
       AND current_user IS DISTINCT FROM 'postgres' THEN
      RAISE EXCEPTION 'Only service_role may mutate creator_experience_events';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.award_creator_experience(
  p_user_id uuid,
  p_event_type public.creator_experience_event_type,
  p_subject_id text,
  p_amount integer,
  p_idempotency_key text,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_daily_cap integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id uuid;
  v_new_total integer;
  v_day_count integer;
  v_window_start timestamptz;
BEGIN
  IF coalesce(auth.role(), '') IS DISTINCT FROM 'service_role'
     AND current_user IS DISTINCT FROM 'postgres' THEN
    RAISE EXCEPTION 'award_creator_experience requires service_role';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id required';
  END IF;

  IF p_amount IS NULL OR p_amount = 0 THEN
    RAISE EXCEPTION 'amount must be non-zero';
  END IF;

  IF p_subject_id IS NULL OR char_length(trim(p_subject_id)) = 0 THEN
    RAISE EXCEPTION 'subject_id required';
  END IF;

  IF p_idempotency_key IS NULL OR char_length(trim(p_idempotency_key)) = 0 THEN
    RAISE EXCEPTION 'idempotency_key required';
  END IF;

  IF p_event_type = 'ADMIN_CORRECTION' THEN
    IF p_metadata IS NULL
       OR NOT (p_metadata ? 'reason')
       OR char_length(trim(p_metadata ->> 'reason')) = 0 THEN
      RAISE EXCEPTION 'ADMIN_CORRECTION requires metadata.reason';
    END IF;
  END IF;

  PERFORM 1 FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.creator_experience_events e
    WHERE e.idempotency_key = p_idempotency_key
  ) THEN
    SELECT experience_total INTO v_new_total
    FROM public.profiles
    WHERE id = p_user_id;
    RETURN jsonb_build_object(
      'awarded', false,
      'reason', 'IDEMPOTENT',
      'experience_total', v_new_total
    );
  END IF;

  IF p_daily_cap IS NOT NULL AND p_amount > 0 AND p_event_type <> 'ADMIN_CORRECTION' THEN
    IF p_daily_cap < 0 THEN
      RAISE EXCEPTION 'invalid daily cap';
    END IF;
    v_window_start := date_trunc('day', timezone('utc', now()));
    SELECT count(*)::integer INTO v_day_count
    FROM public.creator_experience_events e
    WHERE e.user_id = p_user_id
      AND e.event_type = p_event_type
      AND e.amount > 0
      AND e.created_at >= v_window_start;
    IF v_day_count >= p_daily_cap THEN
      SELECT experience_total INTO v_new_total
      FROM public.profiles
      WHERE id = p_user_id;
      RETURN jsonb_build_object(
        'awarded', false,
        'reason', 'DAILY_CAP',
        'experience_total', v_new_total,
        'day_count', v_day_count
      );
    END IF;
  END IF;

  INSERT INTO public.creator_experience_events (
    user_id,
    event_type,
    subject_id,
    amount,
    idempotency_key,
    metadata
  )
  VALUES (
    p_user_id,
    p_event_type,
    trim(p_subject_id),
    p_amount,
    trim(p_idempotency_key),
    COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_event_id;

  UPDATE public.profiles
  SET experience_total = experience_total + p_amount
  WHERE id = p_user_id
  RETURNING experience_total INTO v_new_total;

  IF v_new_total < 0 THEN
    RAISE EXCEPTION 'experience_total would become negative';
  END IF;

  RETURN jsonb_build_object(
    'awarded', true,
    'event_id', v_event_id,
    'experience_total', v_new_total
  );
END;
$$;

REVOKE ALL ON FUNCTION public.award_creator_experience(
  uuid, public.creator_experience_event_type, text, integer, text, jsonb, integer
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.award_creator_experience(
  uuid, public.creator_experience_event_type, text, integer, text, jsonb, integer
) FROM anon;
REVOKE ALL ON FUNCTION public.award_creator_experience(
  uuid, public.creator_experience_event_type, text, integer, text, jsonb, integer
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.award_creator_experience(
  uuid, public.creator_experience_event_type, text, integer, text, jsonb, integer
) TO service_role;
