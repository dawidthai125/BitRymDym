/**
 * Live tests seed a catalog beat. Inserting it as PUBLISHED is rejected
 * (RIGHTS_PUBLISH_INSERT_FORBIDDEN). This walks the local DB through the
 * same gates the app uses: ready master, passed auto-check, owner
 * attestation, then staff APPROVED → PUBLISHED.
 * Local container only. Ids are checked before they are interpolated.
 */
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertUuid(value: string, label: string): void {
  if (!UUID.test(value)) throw new Error(`${label} is not a uuid`);
}

function containerName(): string {
  return process.env.LOCAL_SUPABASE_DB_CONTAINER ?? "supabase_db_bitrymdym-local";
}

function psql(sql: string): string {
  return execFileSync(
    "docker",
    ["exec", "-i", containerName(), "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q", "-At"],
    { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  ).trim();
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** DRAFT user beat that already has a READY active master row. */
export function publishDraftUserBeat(opts: {
  beatId: string;
  ownerId: string;
  assetId: string;
  bytes: Buffer;
}): void {
  assertUuid(opts.beatId, "beatId");
  assertUuid(opts.ownerId, "ownerId");
  assertUuid(opts.assetId, "assetId");
  const sum = sha256(opts.bytes);
  const mod = randomUUID();
  psql(`
BEGIN;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
UPDATE public.beat_audio_assets
   SET checksum_sha256 = '${sum}'
 WHERE id = '${opts.assetId}'::uuid;
INSERT INTO auth.users (id, email, aud, role, raw_user_meta_data)
VALUES ('${mod}', '${mod}@bitrymdym.test', 'authenticated', 'authenticated', '{"display_name":"live-mod"}'::jsonb);
UPDATE public.profiles SET role = 'ADMIN' WHERE id = '${mod}'::uuid;
INSERT INTO public.beat_auto_checks (beat_id, master_asset_id, checksum_sha256, status, finished_at)
VALUES ('${opts.beatId}'::uuid, '${opts.assetId}'::uuid, '${sum}', 'passed', now());
SELECT set_config('request.jwt.claims', json_build_object('sub', '${opts.ownerId}', 'role', 'authenticated')::text, true);
INSERT INTO public.beat_rights_basis (beat_id, basis_kind, checksum_sha256, statement_version, actor_id)
VALUES ('${opts.beatId}'::uuid, 'user_attestation', '${sum}', 'proposal-2026-10-19', '${opts.ownerId}'::uuid);
UPDATE public.beats SET status = 'PENDING_REVIEW', rejection_reason = NULL WHERE id = '${opts.beatId}'::uuid;
SELECT set_config('request.jwt.claims', json_build_object('sub', '${mod}', 'role', 'authenticated')::text, true);
UPDATE public.beats SET status = 'APPROVED', rejection_reason = NULL WHERE id = '${opts.beatId}'::uuid;
UPDATE public.beats SET status = 'PUBLISHED', rejection_reason = NULL WHERE id = '${opts.beatId}'::uuid;
COMMIT;
`);
}

/** Local cleanup. Rights rows are immutable and a published master cannot be removed, so the triggers are off only for this transaction. */
export function scrubLocalBeatFixtures(beatIds: string[], userIds: string[]): void {
  const ids = [...beatIds, ...userIds];
  if (ids.length === 0) return;
  for (const id of ids) assertUuid(id, "fixture id");
  const beats = beatIds.length > 0 ? beatIds.map((id) => `'${id}'`).join(",") : "NULL";
  const users = userIds.length > 0 ? userIds.map((id) => `'${id}'`).join(",") : "NULL";
  psql(`
BEGIN;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
ALTER TABLE public.beat_rights_basis DISABLE TRIGGER beat_rights_basis_no_update_delete;
ALTER TABLE public.beat_audio_assets DISABLE TRIGGER beat_audio_assets_published_master_rights;
ALTER TABLE public.beat_audio_assets DISABLE TRIGGER beat_audio_assets_prevent_privilege_escalation;
UPDATE public.takes SET replaces_take_id = NULL WHERE beat_id IN (${beats});
DELETE FROM public.takes WHERE beat_id IN (${beats});
DELETE FROM public.beat_rights_basis
 WHERE beat_id IN (${beats}) OR actor_id IN (${users}) OR verifier_id IN (${users});
DELETE FROM public.beat_auto_checks WHERE beat_id IN (${beats});
DELETE FROM public.beat_audio_fingerprints WHERE beat_id IN (${beats});
DELETE FROM public.beat_audio_assets WHERE beat_id IN (${beats});
DELETE FROM public.beats WHERE id IN (${beats});
ALTER TABLE public.beat_audio_assets ENABLE TRIGGER beat_audio_assets_prevent_privilege_escalation;
ALTER TABLE public.beat_rights_basis ENABLE TRIGGER beat_rights_basis_no_update_delete;
ALTER TABLE public.beat_audio_assets ENABLE TRIGGER beat_audio_assets_published_master_rights;
COMMIT;
`);
}

/** Cleared auto-check for the beat's current active READY master. */
export function markAutoCheckPassed(beatId: string): void {
  assertUuid(beatId, "beatId");
  psql(`
INSERT INTO public.beat_auto_checks (beat_id, master_asset_id, checksum_sha256, status, finished_at)
SELECT a.beat_id, a.id, a.checksum_sha256, 'passed', now()
FROM public.beat_audio_assets a
WHERE a.beat_id = '${beatId}'::uuid
  AND a.purpose = 'MASTER'
  AND a.is_active
  AND a.status = 'READY'
  AND a.checksum_sha256 ~ '^[0-9a-f]{64}$'
  AND NOT EXISTS (
    SELECT 1 FROM public.beat_auto_checks c
    WHERE c.beat_id = a.beat_id
      AND c.master_asset_id = a.id
      AND c.checksum_sha256 = a.checksum_sha256
      AND c.status = 'passed'
  );
`);
}

/** Owner attestation for the current active master checksum. */
export function attestUserMaster(beatId: string, ownerId: string): void {
  assertUuid(beatId, "beatId");
  assertUuid(ownerId, "ownerId");
  psql(`
BEGIN;
SELECT set_config('request.jwt.claims', json_build_object('sub', '${ownerId}', 'role', 'authenticated')::text, true);
INSERT INTO public.beat_rights_basis (beat_id, basis_kind, checksum_sha256, statement_version, actor_id)
SELECT a.beat_id, 'user_attestation', a.checksum_sha256, 'proposal-2026-10-19', '${ownerId}'::uuid
FROM public.beat_audio_assets a
WHERE a.beat_id = '${beatId}'::uuid
  AND a.purpose = 'MASTER' AND a.is_active AND a.status = 'READY'
  AND NOT EXISTS (
    SELECT 1 FROM public.beat_rights_basis b
    WHERE b.beat_id = a.beat_id
      AND b.basis_kind = 'user_attestation'
      AND b.checksum_sha256 = a.checksum_sha256
  );
COMMIT;
`);
}

/**
 * PLATFORM beat is DRAFT and already has one active READY master.
 * `staffId` must be an ADMIN or MODERATOR profile.
 */
export function publishPlatformDraft(beatId: string, staffId: string): void {
  assertUuid(beatId, "beatId");
  assertUuid(staffId, "staffId");
  const admin = randomUUID();
  psql(`
BEGIN;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
INSERT INTO auth.users (id, email, aud, role, raw_user_meta_data)
VALUES ('${admin}', '${admin}@bitrymdym.test', 'authenticated', 'authenticated', '{"display_name":"live-admin"}'::jsonb);
UPDATE public.profiles SET role = 'ADMIN' WHERE id = '${admin}'::uuid;
SELECT set_config('request.jwt.claims', json_build_object('sub', '${admin}', 'role', 'authenticated')::text, true);
INSERT INTO public.beat_rights_basis (beat_id, basis_kind, checksum_sha256, statement_version, scope, verifier_id, verified_at)
SELECT a.beat_id, 'platform_license', a.checksum_sha256, 'platform-license-2026-10-19', 'catalog_publication', '${admin}'::uuid, now()
FROM public.beat_audio_assets a
WHERE a.beat_id = '${beatId}'::uuid
  AND a.purpose = 'MASTER' AND a.is_active AND a.status = 'READY';
UPDATE public.beats SET status = 'PUBLISHED' WHERE id = '${beatId}'::uuid AND status = 'DRAFT';
COMMIT;
`);
}

/** Rows the owner-SELECT live test expects on a fresh local database. */
export function seedOwnerSelectVisualFixtures(): void {
  const existing = psql(
    `SELECT count(*) FROM public.beats WHERE title = 'Visual Fixture — Published Local Only';`,
  );
  if (existing.endsWith("1") || existing === "1") return;
  const owner = randomUUID();
  const peer = randomUUID();
  const mod = randomUUID();
  const published = randomUUID();
  const draft = randomUUID();
  const asset = randomUUID();
  const sum = "ab".repeat(32);
  psql(`
BEGIN;
INSERT INTO auth.users (id, email, aud, role, raw_user_meta_data) VALUES
  ('${owner}', '${owner}@bitrymdym.test', 'authenticated', 'authenticated', '{"display_name":"vis-owner"}'::jsonb),
  ('${peer}', '${peer}@bitrymdym.test', 'authenticated', 'authenticated', '{"display_name":"vis-peer"}'::jsonb),
  ('${mod}', '${mod}@bitrymdym.test', 'authenticated', 'authenticated', '{"display_name":"vis-mod"}'::jsonb);
UPDATE public.profiles SET role = 'USER' WHERE id IN ('${owner}'::uuid, '${peer}'::uuid);
UPDATE public.profiles SET role = 'ADMIN' WHERE id = '${mod}'::uuid;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
INSERT INTO public.beats (id, ownership_type, owner_id, title, bpm, duration_seconds, status, tags) VALUES
  ('${published}', 'USER', '${owner}', 'Visual Fixture — Published Local Only', 120, 30, 'DRAFT', '{}'),
  ('${draft}', 'USER', '${owner}', 'Visual Fixture — Local Only', 100, 20, 'DRAFT', '{}');
INSERT INTO public.beat_audio_assets (id, beat_id, purpose, status, object_key, content_type, byte_size, checksum_sha256, is_active, created_by)
VALUES ('${asset}', '${published}', 'MASTER', 'READY',
  'user/${owner}/${published}/${asset}/master.bin', 'audio/wav', 100, '${sum}', true, '${owner}');
INSERT INTO public.beat_auto_checks (beat_id, master_asset_id, checksum_sha256, status, finished_at)
VALUES ('${published}', '${asset}', '${sum}', 'passed', now());
SELECT set_config('request.jwt.claims', json_build_object('sub', '${owner}', 'role', 'authenticated')::text, true);
INSERT INTO public.beat_rights_basis (beat_id, basis_kind, checksum_sha256, statement_version, actor_id)
VALUES ('${published}', 'user_attestation', '${sum}', 'proposal-2026-10-19', '${owner}');
UPDATE public.beats SET status = 'PENDING_REVIEW' WHERE id = '${published}';
SELECT set_config('request.jwt.claims', json_build_object('sub', '${mod}', 'role', 'authenticated')::text, true);
UPDATE public.beats SET status = 'APPROVED', rejection_reason = NULL WHERE id = '${published}';
UPDATE public.beats SET status = 'PUBLISHED', rejection_reason = NULL WHERE id = '${published}';
COMMIT;
`);
}

/** License a checksum that is not yet the active master (replace-while-published). */
export function licensePlatformChecksum(beatId: string, staffId: string, checksum: string): void {
  assertUuid(beatId, "beatId");
  assertUuid(staffId, "staffId");
  if (!/^[0-9a-f]{64}$/.test(checksum)) throw new Error("checksum");
  psql(`
BEGIN;
SELECT set_config('request.jwt.claims', json_build_object('sub', '${staffId}', 'role', 'authenticated')::text, true);
INSERT INTO public.beat_rights_basis (beat_id, basis_kind, checksum_sha256, statement_version, scope, verifier_id, verified_at)
VALUES ('${beatId}'::uuid, 'platform_license', '${checksum}', 'platform-license-2026-10-19', 'catalog_publication', '${staffId}'::uuid, now());
COMMIT;
`);
}
