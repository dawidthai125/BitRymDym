-- Sample Catalog originals (OD-SC-01…04) — repo migration only.
-- Prod apply = BLOCKED until a separate Owner GO apply.
-- No fourth bucket. Prefix catalog/{uuid}/original.bin in beat-audio.
-- Client roles (anon/authenticated) get no catalog/ Storage policy (RLS deny).
-- Beat MASTER bucket limits (50 MiB + FLAC) are NOT changed here.

CREATE TABLE IF NOT EXISTS public.catalog_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publish_state text NOT NULL CHECK (publish_state IN ('DRAFT', 'PUBLISHED', 'WITHDRAWN')),
  license_allows_copy boolean NOT NULL DEFAULT false,
  license_allows_export boolean NOT NULL DEFAULT false,
  object_key text NOT NULL,
  content_type text NOT NULL CHECK (
    content_type IN (
      'audio/mpeg',
      'audio/wav',
      'audio/x-wav',
      'audio/mp4',
      'audio/aac'
    )
  ),
  byte_size bigint NOT NULL CHECK (byte_size > 0 AND byte_size <= 20971520),
  duration_seconds integer NOT NULL CHECK (duration_seconds > 0 AND duration_seconds <= 180),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT catalog_assets_object_key_matches_id_chk
    CHECK (object_key = ('catalog/' || id::text || '/original.bin'))
);

COMMENT ON TABLE public.catalog_assets IS
  'Platform catalog original metadata (OD-SC-01). Independent of beat MASTER and take-audio janitor.';

ALTER TABLE public.catalog_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_assets FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.catalog_assets FROM PUBLIC;
REVOKE ALL ON TABLE public.catalog_assets FROM anon;
REVOKE ALL ON TABLE public.catalog_assets FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.catalog_assets TO service_role;

DROP POLICY IF EXISTS catalog_assets_service_all ON public.catalog_assets;
CREATE POLICY catalog_assets_service_all
  ON public.catalog_assets
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Storage: catalog/ originals — service_role path only. FAR-01 INSERT remains user/…/master.bin.
DROP POLICY IF EXISTS catalog_originals_service_select ON storage.objects;
CREATE POLICY catalog_originals_service_select
  ON storage.objects
  FOR SELECT
  TO service_role
  USING (
    bucket_id = 'beat-audio'
    AND name ~* '^catalog/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/original\.bin$'
  );

DROP POLICY IF EXISTS catalog_originals_service_insert ON storage.objects;
CREATE POLICY catalog_originals_service_insert
  ON storage.objects
  FOR INSERT
  TO service_role
  WITH CHECK (
    bucket_id = 'beat-audio'
    AND name ~* '^catalog/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/original\.bin$'
  );

DROP POLICY IF EXISTS catalog_originals_service_update ON storage.objects;
CREATE POLICY catalog_originals_service_update
  ON storage.objects
  FOR UPDATE
  TO service_role
  USING (
    bucket_id = 'beat-audio'
    AND name ~* '^catalog/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/original\.bin$'
  )
  WITH CHECK (
    bucket_id = 'beat-audio'
    AND name ~* '^catalog/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/original\.bin$'
  );

DROP POLICY IF EXISTS catalog_originals_service_delete ON storage.objects;
CREATE POLICY catalog_originals_service_delete
  ON storage.objects
  FOR DELETE
  TO service_role
  USING (
    bucket_id = 'beat-audio'
    AND name ~* '^catalog/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/original\.bin$'
  );
