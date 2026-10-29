-- STORAGE-ARCH-07 — backup run + object manifest (OD-SA-07-07 / OD-SA-07-16)
-- Operator-only. No client Data API access.
-- Does NOT authorize ARCH-05 DELETE.

CREATE TABLE public.storage_backup_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  mode text NOT NULL,
  operator text NOT NULL,
  tool_version text NOT NULL,
  status text NOT NULL,
  notes text,
  CONSTRAINT storage_backup_runs_mode_chk CHECK (
    mode IN ('dry-run', 'backup', 'verify', 'restore-drill')
  ),
  CONSTRAINT storage_backup_runs_status_chk CHECK (
    status IN ('RUNNING', 'PASS', 'FAIL', 'ABORTED')
  )
);

CREATE TABLE public.storage_backup_manifests (
  manifest_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  backup_run_id uuid NOT NULL REFERENCES public.storage_backup_runs (id),
  source_bucket text NOT NULL,
  source_object_key text NOT NULL,
  source_size_bytes bigint NOT NULL CHECK (source_size_bytes >= 0),
  source_content_type text NOT NULL,
  source_sha256 text NOT NULL,
  source_etag text,
  source_version_id text,
  source_last_modified timestamptz NOT NULL,
  classification text NOT NULL,
  db_refs_count integer NOT NULL CHECK (db_refs_count >= 0),
  backup_provider text NOT NULL,
  backup_bucket text NOT NULL,
  backup_object_key text NOT NULL,
  backup_version_id text NOT NULL,
  backup_sha256 text NOT NULL,
  backup_size_bytes bigint NOT NULL CHECK (backup_size_bytes >= 0),
  backed_up_at timestamptz NOT NULL,
  hash_algorithm text NOT NULL DEFAULT 'sha256',
  verify_status text NOT NULL,
  restore_drill_status text NOT NULL DEFAULT 'NOT_RUN',
  restore_drill_at timestamptz,
  gc_safety_status text NOT NULL DEFAULT 'PROPOSED',
  evidence_path text NOT NULL,
  operator text NOT NULL,
  tool_version text NOT NULL,
  CONSTRAINT storage_backup_manifests_sha256_src_chk
    CHECK (source_sha256 ~ '^[a-f0-9]{64}$'),
  CONSTRAINT storage_backup_manifests_sha256_bak_chk
    CHECK (backup_sha256 ~ '^[a-f0-9]{64}$'),
  CONSTRAINT storage_backup_manifests_hash_alg_chk
    CHECK (hash_algorithm = 'sha256'),
  CONSTRAINT storage_backup_manifests_class_chk CHECK (
    classification IN ('USER', 'PLATFORM', 'ORPHAN', 'UNKNOWN')
  ),
  CONSTRAINT storage_backup_manifests_verify_chk CHECK (
    verify_status IN ('PENDING', 'MATCH', 'MISMATCH')
  ),
  CONSTRAINT storage_backup_manifests_drill_chk CHECK (
    restore_drill_status IN ('NOT_RUN', 'PASS', 'FAIL')
  ),
  CONSTRAINT storage_backup_manifests_gc_chk CHECK (
    gc_safety_status IN (
      'PROPOSED',
      'BACKED_UP',
      'RESTORE_VERIFIED',
      'SAFE',
      'OWNER_APPROVED',
      'DELETED',
      'NOT_SAFE'
    )
  ),
  CONSTRAINT storage_backup_manifests_run_key_uidx
    UNIQUE (backup_run_id, source_bucket, source_object_key)
);

CREATE INDEX storage_backup_manifests_backup_run_id_idx
  ON public.storage_backup_manifests (backup_run_id);

CREATE INDEX storage_backup_manifests_source_key_idx
  ON public.storage_backup_manifests (source_bucket, source_object_key);

CREATE INDEX storage_backup_manifests_source_sha256_idx
  ON public.storage_backup_manifests (source_bucket, source_object_key, source_sha256);

ALTER TABLE public.storage_backup_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storage_backup_manifests ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.storage_backup_runs FROM PUBLIC;
REVOKE ALL ON TABLE public.storage_backup_runs FROM anon;
REVOKE ALL ON TABLE public.storage_backup_runs FROM authenticated;

REVOKE ALL ON TABLE public.storage_backup_manifests FROM PUBLIC;
REVOKE ALL ON TABLE public.storage_backup_manifests FROM anon;
REVOKE ALL ON TABLE public.storage_backup_manifests FROM authenticated;

COMMENT ON TABLE public.storage_backup_runs IS
  'STORAGE-ARCH-07 backup/restore operator runs. No client access. ARCH-05 DELETE not authorized by this table.';

COMMENT ON TABLE public.storage_backup_manifests IS
  'STORAGE-ARCH-07 object backup evidence. PRIMARY manifest store. Client GRANT forbidden.';
