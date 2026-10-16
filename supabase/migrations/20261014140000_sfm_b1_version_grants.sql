-- SFM Stage B1 — version grants + atomic claim (Europe/Warsaw daily limit).
-- GO-SFM-IMPL-B1 / local only. No paid slots / checkout (Stage E / OD-04).
-- No render_jobs.kind. No download route cutover.

-- ---------------------------------------------------------------------------
-- studio_final_version_grants
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.studio_final_version_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  version_id uuid NOT NULL REFERENCES public.studio_final_versions (id) ON DELETE RESTRICT,
  source text NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  granted_qualities text[] NOT NULL,
  day_bucket date NOT NULL,
  paid_slot_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT studio_final_version_grants_source_chk
    CHECK (source IN ('DAILY', 'PAID_SLOT')),
  CONSTRAINT studio_final_version_grants_qualities_chk
    CHECK (
      granted_qualities <@ ARRAY['MP3_128', 'MP3_192', 'MP3_320', 'WAV']::text[]
    ),
  CONSTRAINT studio_final_version_grants_user_version_uidx
    UNIQUE (user_id, version_id)
);

CREATE INDEX IF NOT EXISTS studio_final_version_grants_user_day_daily_idx
  ON public.studio_final_version_grants (user_id, day_bucket)
  WHERE source = 'DAILY';

CREATE INDEX IF NOT EXISTS studio_final_version_grants_version_idx
  ON public.studio_final_version_grants (version_id);

CREATE TRIGGER studio_final_version_grants_set_updated_at
BEFORE UPDATE ON public.studio_final_version_grants
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.prevent_studio_final_version_grants_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
      RAISE EXCEPTION 'Only service_role may mutate studio_final_version_grants';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER studio_final_version_grants_prevent_privilege_escalation
BEFORE INSERT OR UPDATE OR DELETE ON public.studio_final_version_grants
FOR EACH ROW
EXECUTE FUNCTION public.prevent_studio_final_version_grants_privilege_escalation();

ALTER TABLE public.studio_final_version_grants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS studio_final_version_grants_select_own
  ON public.studio_final_version_grants;
CREATE POLICY studio_final_version_grants_select_own
  ON public.studio_final_version_grants
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

REVOKE ALL ON TABLE public.studio_final_version_grants
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.studio_final_version_grants TO authenticated;
GRANT ALL ON TABLE public.studio_final_version_grants TO service_role;

COMMENT ON TABLE public.studio_final_version_grants IS
  'SFM B1 — one grant per (user, version); granted_qualities is FIRST_GRANT snapshot (strict).';

REVOKE EXECUTE ON FUNCTION public.prevent_studio_final_version_grants_privilege_escalation()
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- sfm_claim_version_grant — atomic daily grant (no paid slots in B1)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sfm_claim_version_grant(
  p_version_id uuid,
  p_user_id uuid,
  p_daily_limit integer,
  p_granted_qualities text[]
)
RETURNS TABLE (
  grant_id uuid,
  user_id uuid,
  version_id uuid,
  source text,
  granted_at timestamptz,
  granted_qualities text[],
  day_bucket date,
  reused boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_version public.studio_final_versions%ROWTYPE;
  v_existing public.studio_final_version_grants%ROWTYPE;
  v_day date;
  v_daily_used integer;
  v_grant public.studio_final_version_grants%ROWTYPE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  IF p_version_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'INVALID';
  END IF;
  IF p_daily_limit IS NULL OR p_daily_limit < 0 THEN
    RAISE EXCEPTION 'INVALID';
  END IF;
  IF p_granted_qualities IS NULL THEN
    RAISE EXCEPTION 'INVALID';
  END IF;
  IF NOT (p_granted_qualities <@ ARRAY['MP3_128', 'MP3_192', 'MP3_320', 'WAV']::text[]) THEN
    RAISE EXCEPTION 'INVALID';
  END IF;

  -- Serialize claims per user (daily counter + unique grant races).
  PERFORM pg_advisory_xact_lock(
    hashtextextended('sfm_claim:' || p_user_id::text, 0)
  );

  SELECT * INTO v_version
  FROM public.studio_final_versions
  WHERE id = p_version_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;

  IF v_version.owner_id IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'NOT_OWNER';
  END IF;

  IF v_version.status IS DISTINCT FROM 'EXPORTS_ELIGIBLE' THEN
    RAISE EXCEPTION 'NOT_ELIGIBLE';
  END IF;

  IF v_version.expires_at IS NOT NULL AND v_version.expires_at <= now() THEN
    RAISE EXCEPTION 'NOT_ELIGIBLE';
  END IF;

  SELECT * INTO v_existing
  FROM public.studio_final_version_grants g
  WHERE g.user_id = p_user_id
    AND g.version_id = p_version_id
  FOR UPDATE;

  IF FOUND THEN
    RETURN QUERY SELECT
      v_existing.id,
      v_existing.user_id,
      v_existing.version_id,
      v_existing.source,
      v_existing.granted_at,
      v_existing.granted_qualities,
      v_existing.day_bucket,
      true;
    RETURN;
  END IF;

  v_day := (timezone('Europe/Warsaw', now()))::date;

  IF p_daily_limit <= 0 THEN
    RAISE EXCEPTION 'LIMIT_EXCEEDED';
  END IF;

  SELECT count(*)::integer INTO v_daily_used
  FROM public.studio_final_version_grants g
  WHERE g.user_id = p_user_id
    AND g.day_bucket = v_day
    AND g.source = 'DAILY';

  IF v_daily_used >= p_daily_limit THEN
    -- B1: paid slots out of scope — no AVAILABLE consume path.
    RAISE EXCEPTION 'LIMIT_EXCEEDED';
  END IF;

  INSERT INTO public.studio_final_version_grants (
    user_id,
    version_id,
    source,
    granted_qualities,
    day_bucket,
    paid_slot_id
  ) VALUES (
    p_user_id,
    p_version_id,
    'DAILY',
    p_granted_qualities,
    v_day,
    NULL
  )
  RETURNING * INTO v_grant;

  RETURN QUERY SELECT
    v_grant.id,
    v_grant.user_id,
    v_grant.version_id,
    v_grant.source,
    v_grant.granted_at,
    v_grant.granted_qualities,
    v_grant.day_bucket,
    false;
EXCEPTION
  WHEN unique_violation THEN
    -- Concurrent insert winner already created the grant — reuse (no 2nd consume).
    SELECT * INTO v_existing
    FROM public.studio_final_version_grants g
    WHERE g.user_id = p_user_id
      AND g.version_id = p_version_id;

    IF NOT FOUND THEN
      RAISE;
    END IF;

    RETURN QUERY SELECT
      v_existing.id,
      v_existing.user_id,
      v_existing.version_id,
      v_existing.source,
      v_existing.granted_at,
      v_existing.granted_qualities,
      v_existing.day_bucket,
      true;
END;
$$;

REVOKE ALL ON FUNCTION public.sfm_claim_version_grant(uuid, uuid, integer, text[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sfm_claim_version_grant(uuid, uuid, integer, text[])
  TO service_role;

COMMENT ON FUNCTION public.sfm_claim_version_grant(uuid, uuid, integer, text[]) IS
  'SFM B1 — claim version grant with Europe/Warsaw daily DAILY limit. No paid slots. Strict snapshot from caller (server-built).';
