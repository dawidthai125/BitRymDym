-- Studio gaps P1 — private listen links + vocal cleanup jobs.
-- NOT applied to production yet (prepared + tested locally).
--
-- studio_listen_links: private, expiring, revocable "listen only" links to an
--   approved master (studio_master_jobs kind=master). Only sha256(token) is
--   stored; the token is HMAC(server secret, link id), recomputed for the owner. Plan limits
--   (active links, max lifetime) are enforced by the API (plan-policy.ts) with
--   an atomic RPC; the public page/audio route use service_role.
-- studio_listen_hits: sliding-window rate limit for the public audio route
--   (per link and per hashed client IP), pruned by the RPC itself.
-- studio_cleanup_jobs: E3 vocal cleanup (noise + room reverb reduction) of one
--   take. Daily quota per plan (Warsaw day) enforced atomically on enqueue.
--   `applied` = the cleaned file replaces the take in playback and renders.

CREATE TABLE IF NOT EXISTS public.studio_listen_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.studio_projects (id) ON DELETE CASCADE,
  master_job_id uuid NOT NULL REFERENCES public.studio_master_jobs (id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  title text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz NULL,
  play_count integer NOT NULL DEFAULT 0,
  last_played_at timestamptz NULL,
  CONSTRAINT studio_listen_links_hash_chk CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT studio_listen_links_title_chk CHECK (char_length(title) <= 120),
  CONSTRAINT studio_listen_links_expiry_chk CHECK (expires_at > created_at AND expires_at <= created_at + interval '61 days')
);
CREATE INDEX IF NOT EXISTS studio_listen_links_owner_idx ON public.studio_listen_links (owner_id, expires_at);
CREATE INDEX IF NOT EXISTS studio_listen_links_project_idx ON public.studio_listen_links (project_id);

CREATE OR REPLACE FUNCTION public.studio_listen_links_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.studio_master_jobs j
    WHERE j.id = NEW.master_job_id AND j.owner_id = NEW.owner_id AND j.project_id = NEW.project_id
      AND j.kind = 'master' AND j.status = 'succeeded'
  ) THEN
    RAISE EXCEPTION 'LISTEN_LINK_MASTER_MISMATCH' USING errcode = '42501';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS studio_listen_links_guard_trg ON public.studio_listen_links;
CREATE TRIGGER studio_listen_links_guard_trg
  BEFORE INSERT ON public.studio_listen_links
  FOR EACH ROW EXECUTE FUNCTION public.studio_listen_links_guard();
REVOKE ALL ON FUNCTION public.studio_listen_links_guard() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.studio_listen_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.studio_listen_links FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.studio_listen_links TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.studio_listen_links TO service_role;
DROP POLICY IF EXISTS studio_listen_links_owner_select ON public.studio_listen_links;
CREATE POLICY studio_listen_links_owner_select ON public.studio_listen_links
  FOR SELECT TO authenticated USING (owner_id = (SELECT auth.uid()));
COMMENT ON TABLE public.studio_listen_links IS
  'Studio gaps P1: private listen-only links to an approved master. token_hash = sha256(token). Writes via service_role API only.';

-- Atomic create under the plan's active-link cap (NULL = unlimited).
CREATE OR REPLACE FUNCTION public.create_studio_listen_link(
  p_id uuid, p_owner uuid, p_project uuid, p_master_job uuid, p_token_hash text, p_title text,
  p_expires_at timestamptz, p_max_active integer)
RETURNS public.studio_listen_links LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_active integer;
  v_row public.studio_listen_links;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('studio_listen_links:' || p_owner::text, 0));
  IF p_max_active IS NOT NULL THEN
    SELECT count(*) INTO v_active FROM public.studio_listen_links
     WHERE owner_id = p_owner AND revoked_at IS NULL AND expires_at > now();
    IF v_active >= p_max_active THEN
      RAISE EXCEPTION 'LISTEN_LINK_LIMIT' USING errcode = 'P0001';
    END IF;
  END IF;
  INSERT INTO public.studio_listen_links (id, owner_id, project_id, master_job_id, token_hash, title, expires_at)
  VALUES (p_id, p_owner, p_project, p_master_job, p_token_hash, left(coalesce(p_title, ''), 120), p_expires_at)
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.create_studio_listen_link(uuid, uuid, uuid, uuid, text, text, timestamptz, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_studio_listen_link(uuid, uuid, uuid, uuid, text, text, timestamptz, integer) TO service_role;

CREATE TABLE IF NOT EXISTS public.studio_listen_hits (
  id bigserial PRIMARY KEY,
  bucket text NOT NULL,
  at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT studio_listen_hits_bucket_chk CHECK (char_length(bucket) <= 80)
);
CREATE INDEX IF NOT EXISTS studio_listen_hits_bucket_idx ON public.studio_listen_hits (bucket, at);
ALTER TABLE public.studio_listen_hits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.studio_listen_hits FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.studio_listen_hits TO service_role;
GRANT USAGE ON SEQUENCE public.studio_listen_hits_id_seq TO service_role;

-- Sliding window: true = allowed (and recorded). Prunes old hits opportunistically.
CREATE OR REPLACE FUNCTION public.studio_listen_hit(p_bucket text, p_limit integer, p_window_seconds integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_count integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('studio_listen_hit:' || p_bucket, 0));
  SELECT count(*) INTO v_count FROM public.studio_listen_hits
   WHERE bucket = p_bucket AND at > now() - make_interval(secs => p_window_seconds);
  IF v_count >= p_limit THEN
    RETURN false;
  END IF;
  INSERT INTO public.studio_listen_hits (bucket) VALUES (p_bucket);
  IF random() < 0.02 THEN
    DELETE FROM public.studio_listen_hits WHERE at < now() - interval '1 day';
  END IF;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.studio_listen_hit(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.studio_listen_hit(text, integer, integer) TO service_role;

-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.studio_cleanup_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.studio_projects (id) ON DELETE CASCADE,
  take_id uuid NOT NULL REFERENCES public.takes (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued',
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  attempts integer NOT NULL DEFAULT 0,
  worker_ref text NULL,
  result_object_key text NULL,
  metrics jsonb NULL,
  error_code text NULL,
  applied boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz NULL,
  finished_at timestamptz NULL,
  CONSTRAINT studio_cleanup_jobs_status_chk CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  CONSTRAINT studio_cleanup_jobs_settings_chk CHECK (jsonb_typeof(settings) = 'object' AND pg_column_size(settings) <= 1024),
  CONSTRAINT studio_cleanup_jobs_applied_chk CHECK (NOT applied OR status = 'succeeded')
);
CREATE INDEX IF NOT EXISTS studio_cleanup_jobs_owner_idx ON public.studio_cleanup_jobs (owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS studio_cleanup_jobs_take_idx ON public.studio_cleanup_jobs (take_id, created_at DESC);
CREATE INDEX IF NOT EXISTS studio_cleanup_jobs_queue_idx ON public.studio_cleanup_jobs (created_at) WHERE status = 'queued';
CREATE UNIQUE INDEX IF NOT EXISTS studio_cleanup_jobs_applied_uq ON public.studio_cleanup_jobs (take_id) WHERE applied;

CREATE OR REPLACE FUNCTION public.studio_cleanup_jobs_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.studio_projects p WHERE p.id = NEW.project_id AND p.owner_id = NEW.owner_id) THEN
    RAISE EXCEPTION 'CLEANUP_PROJECT_OWNER_MISMATCH' USING errcode = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.takes t WHERE t.id = NEW.take_id AND t.owner_id = NEW.owner_id) THEN
    RAISE EXCEPTION 'CLEANUP_TAKE_OWNER_MISMATCH' USING errcode = '42501';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS studio_cleanup_jobs_guard_trg ON public.studio_cleanup_jobs;
CREATE TRIGGER studio_cleanup_jobs_guard_trg
  BEFORE INSERT ON public.studio_cleanup_jobs
  FOR EACH ROW EXECUTE FUNCTION public.studio_cleanup_jobs_guard();
REVOKE ALL ON FUNCTION public.studio_cleanup_jobs_guard() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.studio_cleanup_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.studio_cleanup_jobs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.studio_cleanup_jobs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.studio_cleanup_jobs TO service_role;
DROP POLICY IF EXISTS studio_cleanup_jobs_owner_select ON public.studio_cleanup_jobs;
CREATE POLICY studio_cleanup_jobs_owner_select ON public.studio_cleanup_jobs
  FOR SELECT TO authenticated USING (owner_id = (SELECT auth.uid()));
COMMENT ON TABLE public.studio_cleanup_jobs IS
  'Studio gaps P1 #5: E3 vocal cleanup (denoise + dereverb) of one take. Writes via service_role API / worker only.';

-- Atomic enqueue under the daily (Warsaw day) quota; failed/cancelled jobs do not count.
CREATE OR REPLACE FUNCTION public.enqueue_studio_cleanup_job(
  p_owner uuid, p_project uuid, p_take uuid, p_settings jsonb, p_per_day integer)
RETURNS public.studio_cleanup_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_day_start timestamptz := (date_trunc('day', now() AT TIME ZONE 'Europe/Warsaw')) AT TIME ZONE 'Europe/Warsaw';
  v_used integer;
  v_row public.studio_cleanup_jobs;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('studio_cleanup_jobs:' || p_owner::text, 0));
  IF EXISTS (SELECT 1 FROM public.studio_cleanup_jobs WHERE take_id = p_take
              AND ((status = 'queued' AND attempts < 3) OR (status = 'running' AND started_at > now() - interval '15 minutes'))) THEN
    RAISE EXCEPTION 'CLEANUP_IN_PROGRESS' USING errcode = 'P0001';
  END IF;
  SELECT count(*) INTO v_used FROM public.studio_cleanup_jobs
   WHERE owner_id = p_owner AND created_at >= v_day_start AND status NOT IN ('failed', 'cancelled');
  IF v_used >= p_per_day THEN
    RAISE EXCEPTION 'CLEANUP_DAILY_LIMIT' USING errcode = 'P0001';
  END IF;
  INSERT INTO public.studio_cleanup_jobs (owner_id, project_id, take_id, settings)
  VALUES (p_owner, p_project, p_take, coalesce(p_settings, '{}'::jsonb))
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_next_studio_cleanup_job(p_worker_ref text)
RETURNS SETOF public.studio_cleanup_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  RETURN QUERY
  UPDATE public.studio_cleanup_jobs j
     SET status = 'running', worker_ref = p_worker_ref, started_at = now(), attempts = j.attempts + 1
   WHERE j.id = (
     SELECT id FROM public.studio_cleanup_jobs
      WHERE attempts < 3
        AND (status = 'queued' OR (status = 'running' AND started_at < now() - interval '10 minutes'))  -- crashed worker
      ORDER BY created_at
      FOR UPDATE SKIP LOCKED
      LIMIT 1)
  RETURNING j.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_studio_cleanup_job(
  p_job_id uuid, p_worker_ref text, p_status text, p_result_object_key text, p_metrics jsonb, p_error_code text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_status NOT IN ('succeeded', 'failed') THEN
    RAISE EXCEPTION 'CLEANUP_BAD_STATUS' USING errcode = '22023';
  END IF;
  UPDATE public.studio_cleanup_jobs
     SET status = p_status, result_object_key = p_result_object_key, metrics = p_metrics,
         error_code = p_error_code, finished_at = now()
   WHERE id = p_job_id AND worker_ref = p_worker_ref AND status = 'running';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CLEANUP_NOT_CLAIMED' USING errcode = 'P0002';
  END IF;
END;
$$;

-- Apply (or un-apply with p_job = NULL) a cleaned version for a take, atomically.
CREATE OR REPLACE FUNCTION public.apply_studio_cleanup_job(p_owner uuid, p_take uuid, p_job uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.studio_cleanup_jobs SET applied = false
   WHERE take_id = p_take AND owner_id = p_owner AND applied;
  IF p_job IS NOT NULL THEN
    UPDATE public.studio_cleanup_jobs SET applied = true
     WHERE id = p_job AND take_id = p_take AND owner_id = p_owner AND status = 'succeeded';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'CLEANUP_NOT_READY' USING errcode = 'P0002';
    END IF;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_studio_cleanup_job(uuid, uuid, uuid, jsonb, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_next_studio_cleanup_job(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_studio_cleanup_job(uuid, text, text, text, jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_studio_cleanup_job(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_studio_cleanup_job(uuid, uuid, uuid, jsonb, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_next_studio_cleanup_job(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_studio_cleanup_job(uuid, text, text, text, jsonb, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_studio_cleanup_job(uuid, uuid, uuid) TO service_role;
