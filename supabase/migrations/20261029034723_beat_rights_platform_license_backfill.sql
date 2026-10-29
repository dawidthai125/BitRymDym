-- Rights Safety P0 backfill: register a platform_license legal basis for every
-- PUBLISHED PLATFORM beat whose single active READY MASTER has no valid license.
-- Same row shape as recordPlatformLicense() in src/lib/beats/rights-records.ts.
-- Idempotent (NOT EXISTS), selects by condition, never changes beat status.
-- Verifier = oldest ADMIN profile; the insert guard requires auth.uid() = verifier
-- and role 'authenticated', so the migration impersonates that admin via
-- transaction-local JWT claims (cleared at the end).
DO $$
DECLARE
  v_admin uuid;
  v_missing integer;
  v_inserted integer;
BEGIN
  SELECT count(*) INTO v_missing
  FROM public.beats b
  WHERE b.status = 'PUBLISHED'
    AND b.ownership_type = 'PLATFORM'
    AND NOT EXISTS (
      SELECT 1 FROM public.beat_rights_basis l
      WHERE l.beat_id = b.id
        AND l.basis_kind = 'platform_license'
        AND NOT EXISTS (
          SELECT 1 FROM public.beat_rights_basis r
          WHERE r.basis_kind = 'platform_license_revocation'
            AND r.revokes_basis_id = l.id
        )
        AND (l.valid_until IS NULL OR l.valid_until > now())
        AND l.checksum_sha256 = (
          SELECT a.checksum_sha256 FROM public.beat_audio_assets a
          WHERE a.beat_id = b.id AND a.purpose = 'MASTER'
            AND a.is_active AND a.status = 'READY'
          LIMIT 1
        )
    );

  IF v_missing = 0 THEN
    RAISE NOTICE 'beat_rights backfill: nothing to do';
    RETURN;
  END IF;

  SELECT p.id INTO v_admin
  FROM public.profiles p
  WHERE p.role = 'ADMIN'
  ORDER BY p.created_at, p.id
  LIMIT 1;

  IF v_admin IS NULL THEN
    RAISE EXCEPTION 'beat_rights backfill: % beats need a license but no ADMIN profile exists', v_missing;
  END IF;

  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text,
    true
  );

  INSERT INTO public.beat_rights_basis (
    beat_id, basis_kind, checksum_sha256, statement_version, scope,
    verifier_id, verified_at, valid_until, reference
  )
  SELECT b.id, 'platform_license', m.checksum_sha256,
         'platform-license-2026-10-19', 'catalog_publication',
         v_admin, now(), NULL, 'backfill:rights-safety-p0'
  FROM public.beats b
  JOIN LATERAL (
    SELECT a.checksum_sha256
    FROM public.beat_audio_assets a
    WHERE a.beat_id = b.id AND a.purpose = 'MASTER'
      AND a.is_active AND a.status = 'READY'
  ) m ON true
  WHERE b.status = 'PUBLISHED'
    AND b.ownership_type = 'PLATFORM'
    AND m.checksum_sha256 ~ '^[0-9a-f]{64}$'
    AND (
      SELECT count(*) FROM public.beat_audio_assets a2
      WHERE a2.beat_id = b.id AND a2.purpose = 'MASTER'
        AND a2.is_active AND a2.status = 'READY'
    ) = 1
    AND NOT EXISTS (
      SELECT 1 FROM public.beat_rights_basis l
      WHERE l.beat_id = b.id
        AND l.basis_kind = 'platform_license'
        AND l.checksum_sha256 = m.checksum_sha256
        AND (l.valid_until IS NULL OR l.valid_until > now())
        AND NOT EXISTS (
          SELECT 1 FROM public.beat_rights_basis r
          WHERE r.basis_kind = 'platform_license_revocation'
            AND r.revokes_basis_id = l.id
        )
    );
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  PERFORM set_config('request.jwt.claims', '', true);

  IF v_inserted <> v_missing THEN
    RAISE EXCEPTION 'beat_rights backfill: expected % licenses, inserted % (beats without exactly one valid READY MASTER?)', v_missing, v_inserted;
  END IF;

  -- Every backfilled beat must now pass the publish-time rights check.
  PERFORM public.assert_beat_checksum_rights(b.id, a.checksum_sha256, 'PLATFORM', true)
  FROM public.beats b
  JOIN public.beat_audio_assets a
    ON a.beat_id = b.id AND a.purpose = 'MASTER' AND a.is_active AND a.status = 'READY'
  WHERE b.status = 'PUBLISHED' AND b.ownership_type = 'PLATFORM';

  RAISE NOTICE 'beat_rights backfill: inserted % platform licenses (verifier %)', v_inserted, v_admin;
END;
$$;
