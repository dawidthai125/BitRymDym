-- Premium Retention G3-TCB / G4-L — dedicated worker role + fenced artifact soft-delete.
-- Contract: docs/decisions/PREMIUM_RETENTION_FENCING_CONTRACT.md (OD-PRET-01 JWT role, OD-PRET-02 REVOKE, OD-PRET-04 soft-delete).
-- Source artifact only: DO NOT apply to local/staging/prod without separate OD-62-08 GO.
-- Requires 20261021115453 (premium_works, premium_unlock_events), 20261029130000 (lease), 20261029130100 (L2).
--
-- After this migration:
--   * premium_retention_worker (NOLOGIN, NOBYPASSRLS) holds no table DML; it reads due works / linked
--     artifacts and executes fenced RPCs only.
--   * service_role holds no DML on premium_works / premium_unlock_events / lease (writes via SECURITY DEFINER RPCs).
--   * Soft-delete of a premium-linked audio_artifacts row is rejected unless performed inside
--     premium_retention_soft_delete_artifact_if_lease (lease → work → artifact, one transaction).
--   * Hard DELETE of audio_artifacts (render rollback, account deletion, take cascade) is NOT fenced here (OD-PRET-03).
--   * Storage bytes are G4-P (D-G4P): the worker may delete objects only for artifacts of due WORK_READY works.

-- ---------------------------------------------------------------------------
-- Role
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'premium_retention_worker') THEN
    CREATE ROLE premium_retention_worker
      NOLOGIN
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOREPLICATION
      NOBYPASSRLS
      NOINHERIT;
  END IF;
  -- SUPERUSER / REPLICATION / BYPASSRLS can only be altered by a superuser (PG16+); postgres is
  -- not one on Supabase, so assert them instead (fail-closed) and reset the rest.
  IF EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = 'premium_retention_worker'
      AND (rolsuper OR rolreplication OR rolbypassrls)
  ) THEN
    RAISE EXCEPTION 'premium_retention_worker has SUPERUSER/REPLICATION/BYPASSRLS; refusing to continue';
  END IF;
  ALTER ROLE premium_retention_worker NOLOGIN NOCREATEDB NOCREATEROLE NOINHERIT;
END
$$;

GRANT premium_retention_worker TO authenticator;

GRANT USAGE ON SCHEMA public TO premium_retention_worker;
GRANT USAGE ON SCHEMA storage TO premium_retention_worker;
GRANT USAGE ON TYPE public.audio_artifact_status TO premium_retention_worker;

COMMENT ON ROLE premium_retention_worker IS
  'Premium Retention worker (G3-TCB): SELECT due works / linked artifacts, EXECUTE fenced RPCs, Storage delete of purgeable objects. No table DML. Not service_role.';

-- ---------------------------------------------------------------------------
-- Linkage rule (single definition; mirrors listLinkedAlivePage owner + take_id / project_id)
-- Never NULL: a NULL take_id / project_id means "not linked" (callers use IF NOT ...).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.premium_retention_links(
  p_work_owner_id uuid,
  p_work_domain text,
  p_work_domain_ref uuid,
  p_artifact_owner_id uuid,
  p_artifact_take_id uuid,
  p_artifact_project_id uuid
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT COALESCE(
    p_work_owner_id = p_artifact_owner_id
    AND (
      (p_work_domain = 'TAKE' AND p_work_domain_ref = p_artifact_take_id)
      OR (p_work_domain = 'STUDIO_PROJECT' AND p_work_domain_ref = p_artifact_project_id)
    ),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.premium_retention_artifact_is_linked(
  p_owner_id uuid,
  p_take_id uuid,
  p_project_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.premium_works w
    WHERE public.premium_retention_links(
      w.owner_id, w.domain, w.domain_ref, p_owner_id, p_take_id, p_project_id
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.premium_retention_object_is_purgeable(
  p_bucket text,
  p_name text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.audio_artifacts a
    JOIN public.premium_works w
      ON public.premium_retention_links(
        w.owner_id, w.domain, w.domain_ref, a.owner_id, a.take_id, a.project_id
      )
    WHERE a.storage_bucket = p_bucket
      AND a.object_key = p_name
      AND w.status = 'WORK_READY'
      AND w.retention_expires_at IS NOT NULL
      AND w.retention_expires_at <= now()
  );
$$;

REVOKE ALL ON FUNCTION public.premium_retention_links(uuid, text, uuid, uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.premium_retention_artifact_is_linked(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.premium_retention_object_is_purgeable(text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.premium_retention_artifact_is_linked(uuid, uuid, uuid)
  TO premium_retention_worker, service_role;
GRANT EXECUTE ON FUNCTION public.premium_retention_object_is_purgeable(text, text)
  TO premium_retention_worker;

-- ---------------------------------------------------------------------------
-- Table privileges (real restriction, not code convention)
-- ---------------------------------------------------------------------------
-- REVOKE ALL also drops REFERENCES / TRIGGER / MAINTAIN granted by Supabase default privileges.
REVOKE ALL ON TABLE public.premium_works FROM service_role;
REVOKE ALL ON TABLE public.premium_unlock_events FROM service_role;
GRANT SELECT ON TABLE public.premium_works TO service_role;
GRANT SELECT ON TABLE public.premium_unlock_events TO service_role;
-- Row triggers do not fire on TRUNCATE; no application path truncates audio_artifacts.
REVOKE TRUNCATE ON TABLE public.audio_artifacts FROM service_role, anon, authenticated;

REVOKE ALL ON TABLE public.premium_works FROM premium_retention_worker;
REVOKE ALL ON TABLE public.premium_unlock_events FROM premium_retention_worker;
REVOKE ALL ON TABLE public.premium_retention_scheduler_lease FROM premium_retention_worker;
REVOKE ALL ON TABLE public.audio_artifacts FROM premium_retention_worker;

GRANT SELECT ON TABLE public.premium_works TO premium_retention_worker;
GRANT SELECT ON TABLE public.audio_artifacts TO premium_retention_worker;

DROP POLICY IF EXISTS premium_works_select_retention_worker ON public.premium_works;
CREATE POLICY premium_works_select_retention_worker
  ON public.premium_works
  FOR SELECT
  TO premium_retention_worker
  USING (true);

DROP POLICY IF EXISTS audio_artifacts_select_retention_worker ON public.audio_artifacts;
CREATE POLICY audio_artifacts_select_retention_worker
  ON public.audio_artifacts
  FOR SELECT
  TO premium_retention_worker
  USING (public.premium_retention_artifact_is_linked(owner_id, take_id, project_id));

-- ---------------------------------------------------------------------------
-- Triggers: fenced RPCs run with the caller's claim (service_role or worker)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_premium_works_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF COALESCE(auth.role(), '') NOT IN ('service_role', 'premium_retention_worker') THEN
    RAISE EXCEPTION 'Only service_role may mutate premium_works';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_premium_unlock_events_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF COALESCE(auth.role(), '') NOT IN ('service_role', 'premium_retention_worker') THEN
    RAISE EXCEPTION 'Only service_role may mutate premium_unlock_events';
  END IF;
  IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'premium_unlock_events is append-only';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_audio_artifact_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    IF COALESCE(auth.role(), '') NOT IN ('service_role', 'premium_retention_worker') THEN
      RAISE EXCEPTION 'Only service_role may mutate audio_artifacts';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE'
     AND (NEW.owner_id IS DISTINCT FROM OLD.owner_id
          OR NEW.take_id IS DISTINCT FROM OLD.take_id
          OR NEW.project_id IS DISTINCT FROM OLD.project_id)
     AND (public.premium_retention_artifact_is_linked(OLD.owner_id, OLD.take_id, OLD.project_id)
          OR public.premium_retention_artifact_is_linked(NEW.owner_id, NEW.take_id, NEW.project_id)) THEN
    RAISE EXCEPTION 'premium-linked audio_artifacts linkage is immutable';
  END IF;

  IF TG_OP = 'UPDATE'
     AND public.premium_retention_artifact_is_linked(OLD.owner_id, OLD.take_id, OLD.project_id) THEN
    -- Storage policies resolve objects through object_key; a rewrite would retarget the purge.
    IF NEW.object_key IS DISTINCT FROM OLD.object_key
       OR NEW.storage_bucket IS DISTINCT FROM OLD.storage_bucket THEN
      RAISE EXCEPTION 'premium-linked audio_artifacts storage location is immutable';
    END IF;
    -- A soft-delete is final: no undo, no moving deleted_at, no leaving status DELETED.
    IF OLD.deleted_at IS NOT NULL
       AND NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
      RAISE EXCEPTION 'premium-linked audio_artifacts soft-delete is irreversible';
    END IF;
    IF OLD.status = 'DELETED' AND NEW.status IS DISTINCT FROM 'DELETED' THEN
      RAISE EXCEPTION 'premium-linked audio_artifacts soft-delete is irreversible';
    END IF;
    -- GUC is transaction-local and set only by the fenced RPC; PostgREST callers cannot set it.
    IF ((OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
        OR (OLD.status IS DISTINCT FROM 'DELETED' AND NEW.status = 'DELETED'))
       AND COALESCE(current_setting('brd.premium_retention_fenced_artifact', true), '')
           IS DISTINCT FROM OLD.id::text THEN
      RAISE EXCEPTION 'premium-linked audio_artifacts soft-delete requires premium_retention_soft_delete_artifact_if_lease';
    END IF;
  END IF;

  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    IF NEW.storage_bucket IS DISTINCT FROM 'audio-artifacts' THEN
      RAISE EXCEPTION 'Invalid audio artifact storage bucket';
    END IF;
    IF NEW.object_key IS NULL
       OR (
         NEW.object_key NOT LIKE '%.mp3'
         AND NEW.object_key NOT LIKE '%.wav'
       ) THEN
      RAISE EXCEPTION 'Invalid audio artifact object key';
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_premium_works_privilege_escalation()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_premium_unlock_events_privilege_escalation()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_audio_artifact_privilege_escalation()
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Fenced soft-delete: lock lease → verify holder+token+unexpired → lock work → lock artifact → soft-delete
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.premium_retention_soft_delete_artifact_if_lease(
  p_work_id uuid,
  p_artifact_id uuid,
  p_run_id uuid,
  p_fencing_token bigint
)
RETURNS TABLE (
  ok boolean,
  reason text,
  artifact_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_now timestamptz;
  v_lease public.premium_retention_scheduler_lease%ROWTYPE;
  v_work public.premium_works%ROWTYPE;
  v_artifact public.audio_artifacts%ROWTYPE;
  v_updated_id uuid;
BEGIN
  IF COALESCE(auth.role(), '') NOT IN ('service_role', 'premium_retention_worker') THEN
    RAISE EXCEPTION 'Only service_role or premium_retention_worker may call premium_retention_soft_delete_artifact_if_lease';
  END IF;

  IF p_work_id IS NULL THEN
    RAISE EXCEPTION 'work_id required';
  END IF;
  IF p_artifact_id IS NULL THEN
    RAISE EXCEPTION 'artifact_id required';
  END IF;
  IF p_run_id IS NULL THEN
    RAISE EXCEPTION 'run_id required';
  END IF;
  IF p_fencing_token IS NULL OR p_fencing_token < 0 THEN
    RAISE EXCEPTION 'fencing_token required';
  END IF;

  artifact_id := p_artifact_id;

  SELECT *
  INTO v_lease
  FROM public.premium_retention_scheduler_lease
  WHERE lock_key = 'premium_retention_cleanup'
  FOR UPDATE;

  IF NOT FOUND OR v_lease.holder_run_id IS NULL OR v_lease.lease_expires_at IS NULL THEN
    ok := false; reason := 'LEASE_MISSING'; RETURN NEXT; RETURN;
  END IF;

  v_now := clock_timestamp();

  IF v_lease.lease_expires_at <= v_now THEN
    ok := false; reason := 'LEASE_EXPIRED'; RETURN NEXT; RETURN;
  END IF;
  IF v_lease.holder_run_id IS DISTINCT FROM p_run_id THEN
    ok := false; reason := 'LEASE_MISMATCH'; RETURN NEXT; RETURN;
  END IF;
  IF v_lease.fencing_token IS DISTINCT FROM p_fencing_token THEN
    ok := false; reason := 'STALE_TOKEN'; RETURN NEXT; RETURN;
  END IF;

  SELECT *
  INTO v_work
  FROM public.premium_works
  WHERE id = p_work_id
  FOR UPDATE;

  IF NOT FOUND THEN
    ok := false; reason := 'WORK_NOT_FOUND'; RETURN NEXT; RETURN;
  END IF;
  IF v_work.status IS DISTINCT FROM 'WORK_READY' THEN
    ok := false; reason := 'NOT_WORK_READY'; RETURN NEXT; RETURN;
  END IF;
  IF v_work.retention_expires_at IS NULL OR v_work.retention_expires_at > v_now THEN
    ok := false; reason := 'RETENTION_NOT_DUE'; RETURN NEXT; RETURN;
  END IF;

  SELECT *
  INTO v_artifact
  FROM public.audio_artifacts
  WHERE id = p_artifact_id
  FOR UPDATE;

  IF NOT FOUND THEN
    ok := false; reason := 'ARTIFACT_NOT_FOUND'; RETURN NEXT; RETURN;
  END IF;
  IF NOT public.premium_retention_links(
       v_work.owner_id, v_work.domain, v_work.domain_ref,
       v_artifact.owner_id, v_artifact.take_id, v_artifact.project_id
     ) THEN
    ok := false; reason := 'ARTIFACT_NOT_LINKED'; RETURN NEXT; RETURN;
  END IF;
  IF v_artifact.deleted_at IS NOT NULL THEN
    ok := true; reason := 'ALREADY_DELETED'; RETURN NEXT; RETURN;
  END IF;

  PERFORM set_config('brd.premium_retention_fenced_artifact', v_artifact.id::text, true);

  UPDATE public.audio_artifacts AS a
  SET
    deleted_at = v_now,
    status = 'DELETED'
  WHERE a.id = v_artifact.id
    AND a.deleted_at IS NULL
  RETURNING a.id INTO v_updated_id;

  PERFORM set_config('brd.premium_retention_fenced_artifact', '', true);

  IF v_updated_id IS NULL THEN
    ok := false; reason := 'CAS_CONFLICT'; RETURN NEXT; RETURN;
  END IF;

  ok := true;
  reason := 'SOFT_DELETED';
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.premium_retention_soft_delete_artifact_if_lease(uuid, uuid, uuid, bigint) IS
  'G4-L: atomic lease+token fence, due WORK_READY work, linked artifact, then soft-delete. Only path for premium-linked soft-delete.';

REVOKE ALL ON FUNCTION public.premium_retention_soft_delete_artifact_if_lease(uuid, uuid, uuid, bigint)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.premium_retention_soft_delete_artifact_if_lease(uuid, uuid, uuid, bigint)
  TO premium_retention_worker;

-- ---------------------------------------------------------------------------
-- Mutating lease / L2 RPCs: worker only. service_role taking the lease could fence out the
-- worker or, combined with a backdated premium_mark_work_ready, drive a fenced delete.
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.premium_retention_lease_acquire(uuid, integer) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.premium_retention_lease_renew(uuid, bigint, integer) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.premium_retention_lease_release(uuid, bigint) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.premium_retention_mark_expired_if_lease(uuid, uuid, bigint) FROM service_role;

GRANT EXECUTE ON FUNCTION public.premium_retention_lease_acquire(uuid, integer)
  TO premium_retention_worker;
GRANT EXECUTE ON FUNCTION public.premium_retention_lease_renew(uuid, bigint, integer)
  TO premium_retention_worker;
GRANT EXECUTE ON FUNCTION public.premium_retention_lease_release(uuid, bigint)
  TO premium_retention_worker;
GRANT EXECUTE ON FUNCTION public.premium_retention_lease_get()
  TO premium_retention_worker;
GRANT EXECUTE ON FUNCTION public.premium_retention_mark_expired_if_lease(uuid, uuid, bigint)
  TO premium_retention_worker;

-- ---------------------------------------------------------------------------
-- Storage (G4-P, outside fencing): delete only objects of due WORK_READY premium works
-- ---------------------------------------------------------------------------
GRANT SELECT ON TABLE storage.buckets TO premium_retention_worker;
GRANT SELECT, DELETE ON TABLE storage.objects TO premium_retention_worker;
REVOKE INSERT, UPDATE, TRUNCATE ON TABLE storage.objects FROM premium_retention_worker;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE storage.buckets FROM premium_retention_worker;

DROP POLICY IF EXISTS premium_retention_worker_select_purgeable_objects ON storage.objects;
CREATE POLICY premium_retention_worker_select_purgeable_objects
  ON storage.objects
  FOR SELECT
  TO premium_retention_worker
  USING (
    bucket_id = 'audio-artifacts'
    AND public.premium_retention_object_is_purgeable(bucket_id, name)
  );

DROP POLICY IF EXISTS premium_retention_worker_delete_purgeable_objects ON storage.objects;
CREATE POLICY premium_retention_worker_delete_purgeable_objects
  ON storage.objects
  FOR DELETE
  TO premium_retention_worker
  USING (
    bucket_id = 'audio-artifacts'
    AND public.premium_retention_object_is_purgeable(bucket_id, name)
  );
