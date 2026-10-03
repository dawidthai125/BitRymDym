-- Creator Progress W1 — Experience ledger + experience_total cache
-- Design Freeze: docs/decisions/CREATOR_PROGRESS_PREMIUM_DESIGN_FREEZE_V1.md @ 1e66cae
-- Rank is derived in application code — NOT stored as SSOT; NOT profiles.account_level.
-- ON DELETE CASCADE: W1 avoids ACCOUNT/PROFILE-01 delete-orchestrator change.
-- Explicit delete step (premium-style RESTRICT) may be added in a later GO.

CREATE TYPE public.creator_experience_event_type AS ENUM (
  'PROFILE_COMPLETED',
  'BEAT_APPROVED',
  'BEAT_FIRST_PUBLISHED',
  'MIX_SESSION_FIRST_EXPORT',
  'RENDER_SUCCEEDED',
  'TAKE_READY',
  'ADMIN_CORRECTION'
);

CREATE TABLE public.creator_experience_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  event_type public.creator_experience_event_type NOT NULL,
  subject_id text NOT NULL,
  amount integer NOT NULL,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT creator_experience_events_subject_nonempty_chk CHECK (
    char_length(trim(subject_id)) > 0
  ),
  CONSTRAINT creator_experience_events_idempotency_nonempty_chk CHECK (
    char_length(trim(idempotency_key)) > 0
  ),
  CONSTRAINT creator_experience_events_amount_nonzero_chk CHECK (amount <> 0),
  CONSTRAINT creator_experience_events_correction_meta_chk CHECK (
    event_type <> 'ADMIN_CORRECTION'
    OR (
      metadata ? 'reason'
      AND char_length(trim(metadata ->> 'reason')) > 0
    )
  )
);

CREATE UNIQUE INDEX creator_experience_events_idempotency_key_uidx
  ON public.creator_experience_events (idempotency_key);

CREATE INDEX creator_experience_events_user_created_idx
  ON public.creator_experience_events (user_id, created_at DESC);

CREATE INDEX creator_experience_events_user_type_day_idx
  ON public.creator_experience_events (user_id, event_type, created_at DESC);

COMMENT ON TABLE public.creator_experience_events IS
  'Creator Progress W1 — experience ledger SSOT. Server/service_role awards only.';

ALTER TABLE public.profiles
  ADD COLUMN experience_total integer NOT NULL DEFAULT 0
  CONSTRAINT profiles_experience_total_nonneg_chk CHECK (experience_total >= 0);

COMMENT ON COLUMN public.profiles.experience_total IS
  'Creator Progress W1 — derived cache of SUM(ledger amounts). Server-write only.';

-- Extend privilege escalation: experience_total is not user-writable.
CREATE OR REPLACE FUNCTION public.prevent_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.role IS DISTINCT FROM OLD.role
       OR NEW.account_level IS DISTINCT FROM OLD.account_level
       OR NEW.experience_total IS DISTINCT FROM OLD.experience_total THEN
      IF coalesce(auth.role(), '') IS DISTINCT FROM 'service_role'
         AND current_user IS DISTINCT FROM 'postgres' THEN
        RAISE EXCEPTION
          'Changing role, account_level, or experience_total is not allowed for this caller';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Ledger mutations: service_role only (mirror premium_entitlements).
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

CREATE TRIGGER creator_experience_events_prevent_privilege_escalation
BEFORE INSERT OR UPDATE OR DELETE ON public.creator_experience_events
FOR EACH ROW
EXECUTE FUNCTION public.prevent_creator_experience_privilege_escalation();

ALTER TABLE public.creator_experience_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY creator_experience_events_select_own
  ON public.creator_experience_events
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

GRANT SELECT ON public.creator_experience_events TO authenticated;
GRANT USAGE ON TYPE public.creator_experience_event_type TO authenticated;

-- Atomic award: insert ledger + bump experience_total (idempotent).
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

  -- Serialize awards per user for total consistency.
  PERFORM 1 FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found';
  END IF;

  -- Idempotency short-circuit (no total bump).
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

  -- Daily cap (UTC day) for positive product events only.
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

  -- Guard negative total from corrections (clamp not applied — fail closed).
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
  uuid,
  public.creator_experience_event_type,
  text,
  integer,
  text,
  jsonb,
  integer
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.award_creator_experience(
  uuid,
  public.creator_experience_event_type,
  text,
  integer,
  text,
  jsonb,
  integer
) FROM anon;
REVOKE ALL ON FUNCTION public.award_creator_experience(
  uuid,
  public.creator_experience_event_type,
  text,
  integer,
  text,
  jsonb,
  integer
) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.award_creator_experience(
  uuid,
  public.creator_experience_event_type,
  text,
  integer,
  text,
  jsonb,
  integer
) TO service_role;

REVOKE EXECUTE ON FUNCTION public.prevent_creator_experience_privilege_escalation() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.prevent_creator_experience_privilege_escalation() FROM anon;
REVOKE EXECUTE ON FUNCTION public.prevent_creator_experience_privilege_escalation() FROM authenticated;
