-- Recording Wave 5 — Shared Grants → RECORD (Design Freeze Addendum + Arch Review)
-- D03 delivery. No PLAYBACK/DOWNLOAD via grant. Take ACL unchanged.
--
-- Advisory lock namespace (two-arg form):
--   key1 = 87245103  — BitRymDym Wave 5 beat_access_grants class
--   key2 = hashtext(beat_id::text)
-- Distinct from claim_take_recording_session which uses
--   pg_advisory_xact_lock(hashtextextended(owner_id::text, 0)) (single-arg).

CREATE TABLE public.beat_access_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beat_id uuid NOT NULL REFERENCES public.beats (id) ON DELETE CASCADE,
  grantee_user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  granted_by uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  can_record boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NULL,
  revoked_at timestamptz NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT beat_access_grants_no_self_chk CHECK (grantee_user_id <> granted_by),
  CONSTRAINT beat_access_grants_expiry_chk CHECK (
    expires_at IS NULL OR expires_at > created_at
  ),
  CONSTRAINT beat_access_grants_can_record_true_chk CHECK (can_record = true)
);

CREATE UNIQUE INDEX beat_access_grants_active_beat_grantee_uidx
  ON public.beat_access_grants (beat_id, grantee_user_id)
  WHERE revoked_at IS NULL;

CREATE INDEX beat_access_grants_beat_id_idx
  ON public.beat_access_grants (beat_id);

CREATE INDEX beat_access_grants_grantee_beat_idx
  ON public.beat_access_grants (grantee_user_id, beat_id);

CREATE INDEX beat_access_grants_active_expires_idx
  ON public.beat_access_grants (expires_at)
  WHERE revoked_at IS NULL AND expires_at IS NOT NULL;

CREATE TRIGGER beat_access_grants_set_updated_at
BEFORE UPDATE ON public.beat_access_grants
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.prevent_beat_access_grant_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Only service_role may mutate beat_access_grants';
  END IF;
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    IF NEW.can_record IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'can_record must be true';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER beat_access_grants_prevent_privilege_escalation
BEFORE INSERT OR UPDATE OR DELETE ON public.beat_access_grants
FOR EACH ROW
EXECUTE FUNCTION public.prevent_beat_access_grant_privilege_escalation();

ALTER TABLE public.beat_access_grants ENABLE ROW LEVEL SECURITY;

-- No policies for authenticated/anon → deny-by-default.
-- service_role bypasses RLS. App uses admin client only.

REVOKE ALL ON TABLE public.beat_access_grants FROM PUBLIC;
REVOKE ALL ON TABLE public.beat_access_grants FROM anon;
REVOKE ALL ON TABLE public.beat_access_grants FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.prevent_beat_access_grant_privilege_escalation() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.prevent_beat_access_grant_privilege_escalation() FROM anon;
REVOKE EXECUTE ON FUNCTION public.prevent_beat_access_grant_privilege_escalation() FROM authenticated;

-- Race-safe create: beat advisory lock → soft-revoke expired → count ACTIVE → INSERT.
CREATE OR REPLACE FUNCTION public.create_beat_access_grant(
  p_beat_id uuid,
  p_grantee_user_id uuid,
  p_granted_by uuid,
  p_expires_at timestamptz DEFAULT NULL,
  p_max_active integer DEFAULT 20
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id uuid;
  v_ownership public.beat_ownership_type;
  v_status public.beat_status;
  v_existing_id uuid;
  v_existing_expires timestamptz;
  v_active_count integer;
  v_new_id uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Only service_role may create beat access grants'
      USING ERRCODE = '42501';
  END IF;

  IF p_beat_id IS NULL OR p_grantee_user_id IS NULL OR p_granted_by IS NULL THEN
    RAISE EXCEPTION 'beat_id, grantee_user_id and granted_by are required';
  END IF;

  IF p_max_active IS NULL OR p_max_active < 1 THEN
    RAISE EXCEPTION 'Invalid max_active';
  END IF;

  IF p_grantee_user_id = p_granted_by THEN
    RAISE EXCEPTION 'SELF_GRANT'
      USING ERRCODE = 'P0001';
  END IF;

  -- Namespace 87245103 = Wave 5 beat grants (≠ single-arg owner claim locks).
  PERFORM pg_advisory_xact_lock(87245103, hashtext(p_beat_id::text));

  SELECT b.owner_id, b.ownership_type, b.status
  INTO v_owner_id, v_ownership, v_status
  FROM public.beats b
  WHERE b.id = p_beat_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BEAT_NOT_FOUND'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_ownership IS DISTINCT FROM 'USER' OR v_owner_id IS NULL THEN
    RAISE EXCEPTION 'PLATFORM_BEAT'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_owner_id IS DISTINCT FROM p_granted_by THEN
    RAISE EXCEPTION 'NOT_BEAT_OWNER'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_status IS DISTINCT FROM 'PUBLISHED' THEN
    RAISE EXCEPTION 'BEAT_NOT_PUBLISHED'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = p_grantee_user_id
  ) THEN
    RAISE EXCEPTION 'GRANTEE_NOT_FOUND'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_expires_at IS NOT NULL AND p_expires_at <= now() THEN
    RAISE EXCEPTION 'INVALID_EXPIRY'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT g.id, g.expires_at
  INTO v_existing_id, v_existing_expires
  FROM public.beat_access_grants g
  WHERE g.beat_id = p_beat_id
    AND g.grantee_user_id = p_grantee_user_id
    AND g.revoked_at IS NULL
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing_expires IS NULL OR v_existing_expires > now() THEN
      RAISE EXCEPTION 'ACTIVE_GRANT_EXISTS'
        USING ERRCODE = 'P0001';
    END IF;
    -- Expired but unrevoked: soft-revoke to free partial unique, keep history.
    UPDATE public.beat_access_grants
    SET revoked_at = now()
    WHERE id = v_existing_id;
  END IF;

  SELECT count(*)::integer INTO v_active_count
  FROM public.beat_access_grants g
  WHERE g.beat_id = p_beat_id
    AND g.revoked_at IS NULL
    AND (g.expires_at IS NULL OR g.expires_at > now());

  IF v_active_count >= p_max_active THEN
    RAISE EXCEPTION 'ACTIVE_GRANT_CAP'
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.beat_access_grants (
    beat_id,
    grantee_user_id,
    granted_by,
    can_record,
    expires_at
  ) VALUES (
    p_beat_id,
    p_grantee_user_id,
    p_granted_by,
    true,
    p_expires_at
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_beat_access_grant(uuid, uuid, uuid, timestamptz, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_beat_access_grant(uuid, uuid, uuid, timestamptz, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_beat_access_grant(uuid, uuid, uuid, timestamptz, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_beat_access_grant(uuid, uuid, uuid, timestamptz, integer) TO service_role;
