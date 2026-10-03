-- FAR-01 R1: least-privilege read-only role for production dry-run.
-- Owner GO: PROVISION R1 (not Verify, not dry-run execution, not Backfill GO).
-- Service-role is NOT the R1 credential. This role is SELECT-only.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'far01_dryrun_readonly') THEN
    CREATE ROLE far01_dryrun_readonly
      NOLOGIN
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOREPLICATION
      NOBYPASSRLS;
  END IF;
END
$$;

-- PostgREST role switching
GRANT far01_dryrun_readonly TO authenticator;

GRANT USAGE ON SCHEMA public TO far01_dryrun_readonly;
GRANT USAGE ON SCHEMA storage TO far01_dryrun_readonly;

-- DB SELECT-only (FAR-01 inventory surfaces)
GRANT SELECT ON TABLE public.beats TO far01_dryrun_readonly;
GRANT SELECT ON TABLE public.beat_audio_assets TO far01_dryrun_readonly;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.beats FROM far01_dryrun_readonly;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.beat_audio_assets FROM far01_dryrun_readonly;

GRANT USAGE ON TYPE public.beat_status TO far01_dryrun_readonly;
GRANT USAGE ON TYPE public.beat_ownership_type TO far01_dryrun_readonly;
GRANT USAGE ON TYPE public.beat_audio_purpose TO far01_dryrun_readonly;
GRANT USAGE ON TYPE public.beat_audio_asset_status TO far01_dryrun_readonly;

-- Storage metadata/list for beat-audio only (SELECT; no write policies for this role)
GRANT SELECT ON TABLE storage.buckets TO far01_dryrun_readonly;
GRANT SELECT ON TABLE storage.objects TO far01_dryrun_readonly;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE storage.objects FROM far01_dryrun_readonly;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE storage.buckets FROM far01_dryrun_readonly;

-- RLS: dedicated SELECT policies for R1
DROP POLICY IF EXISTS far01_dryrun_readonly_select_beats ON public.beats;
CREATE POLICY far01_dryrun_readonly_select_beats
  ON public.beats
  FOR SELECT
  TO far01_dryrun_readonly
  USING (true);

DROP POLICY IF EXISTS far01_dryrun_readonly_select_beat_audio_assets ON public.beat_audio_assets;
CREATE POLICY far01_dryrun_readonly_select_beat_audio_assets
  ON public.beat_audio_assets
  FOR SELECT
  TO far01_dryrun_readonly
  USING (storage_bucket = 'beat-audio');

DROP POLICY IF EXISTS far01_dryrun_readonly_select_beat_audio_objects ON storage.objects;
CREATE POLICY far01_dryrun_readonly_select_beat_audio_objects
  ON storage.objects
  FOR SELECT
  TO far01_dryrun_readonly
  USING (bucket_id = 'beat-audio');
