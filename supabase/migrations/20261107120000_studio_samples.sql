-- User samples and sound effects.
-- Prod apply = BLOCKED until a separate Owner GO apply.
-- No new bucket. Private prefix user-samples/{uuid}/original.bin in beat-audio.
-- Approval copies bytes to catalog/{uuid}/original.bin and inserts catalog_assets.
-- Client roles get no policy on this prefix. Beat MASTER limits are unchanged.

CREATE TABLE IF NOT EXISTS public.studio_samples (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 80),
  kind text NOT NULL CHECK (kind IN ('instrument', 'effect')),
  instrument text CHECK (instrument IS NULL OR char_length(instrument) BETWEEN 1 AND 32),
  status text NOT NULL CHECK (status IN ('PRIVATE', 'PENDING_REVIEW', 'PUBLISHED', 'REJECTED')),
  rights_accepted boolean NOT NULL DEFAULT false,
  object_key text NOT NULL,
  content_type text NOT NULL CHECK (
    content_type IN ('audio/mpeg', 'audio/wav', 'audio/x-wav')
  ),
  byte_size bigint NOT NULL CHECK (byte_size > 0 AND byte_size <= 8388608),
  duration_ms integer NOT NULL CHECK (duration_ms >= 1000 AND duration_ms <= 30000),
  catalog_asset_id uuid REFERENCES public.catalog_assets (id) ON DELETE RESTRICT,
  moderation_note text CHECK (moderation_note IS NULL OR char_length(moderation_note) <= 500),
  reviewed_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT studio_samples_object_key_chk
    CHECK (object_key = ('user-samples/' || id::text || '/original.bin')),
  CONSTRAINT studio_samples_published_catalog_chk
    CHECK (
      (status = 'PUBLISHED' AND catalog_asset_id IS NOT NULL)
      OR (status <> 'PUBLISHED' AND catalog_asset_id IS NULL)
    )
);

COMMENT ON TABLE public.studio_samples IS
  'Owner samples. Public catalog copy exists only after moderation.';

CREATE UNIQUE INDEX IF NOT EXISTS studio_samples_catalog_asset_uidx
  ON public.studio_samples (catalog_asset_id)
  WHERE catalog_asset_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS studio_samples_owner_created_idx
  ON public.studio_samples (owner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS studio_samples_review_idx
  ON public.studio_samples (created_at)
  WHERE status = 'PENDING_REVIEW';

ALTER TABLE public.studio_samples ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.studio_samples FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.studio_samples FROM PUBLIC;
REVOKE ALL ON TABLE public.studio_samples FROM anon;
REVOKE ALL ON TABLE public.studio_samples FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.studio_samples TO service_role;

DROP POLICY IF EXISTS studio_samples_service_all ON public.studio_samples;
CREATE POLICY studio_samples_service_all
  ON public.studio_samples
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS user_samples_service_select ON storage.objects;
CREATE POLICY user_samples_service_select
  ON storage.objects
  FOR SELECT
  TO service_role
  USING (
    bucket_id = 'beat-audio'
    AND name ~* '^user-samples/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/original\.bin$'
  );

DROP POLICY IF EXISTS user_samples_service_insert ON storage.objects;
CREATE POLICY user_samples_service_insert
  ON storage.objects
  FOR INSERT
  TO service_role
  WITH CHECK (
    bucket_id = 'beat-audio'
    AND name ~* '^user-samples/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/original\.bin$'
  );

DROP POLICY IF EXISTS user_samples_service_update ON storage.objects;
CREATE POLICY user_samples_service_update
  ON storage.objects
  FOR UPDATE
  TO service_role
  USING (
    bucket_id = 'beat-audio'
    AND name ~* '^user-samples/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/original\.bin$'
  )
  WITH CHECK (
    bucket_id = 'beat-audio'
    AND name ~* '^user-samples/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/original\.bin$'
  );

DROP POLICY IF EXISTS user_samples_service_delete ON storage.objects;
CREATE POLICY user_samples_service_delete
  ON storage.objects
  FOR DELETE
  TO service_role
  USING (
    bucket_id = 'beat-audio'
    AND name ~* '^user-samples/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/original\.bin$'
  );
