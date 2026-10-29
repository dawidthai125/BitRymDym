/**
 * P0-C master mutation guard — disposable container only.
 * Verifies privileged direct beat_audio_assets mutations cannot leave a
 * PUBLISHED beat with an invalid active READY MASTER.
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const CONTAINER = "bitrymdym-rights-p0-disposable-20261020";
const EXPECTED_ID = "711d32b0fd309065d89eb9103fd0aab917eed41957bb85dcb665bf20cfb70d99";
const OWNER = "11111111-1111-4111-8111-111111111111";
const STAFF = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";
const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(
  HERE,
  "../migrations/20261029130030_beat_rights_safety_p0_master_mutation_guard.sql",
);

const results = [];

function sha(label) {
  return createHash("sha256").update(`master-mut-${label}`).digest("hex");
}

function psql(sql) {
  return new Promise((resolve) => {
    const child = spawn(
      "docker",
      ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-X", "-q"],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => {
      out += d.toString();
    });
    child.stderr.on("data", (d) => {
      err += d.toString();
    });
    child.on("close", (code) => resolve({ code: code ?? 1, out, err }));
    child.stdin.end(sql);
  });
}

function record(name, status, detail) {
  results.push({ name, status, detail: String(detail).replace(/\s+/g, " ").trim().slice(0, 800) });
  console.log(`${status}  ${name}  ${String(detail).replace(/\s+/g, " ").trim().slice(0, 240)}`);
}

async function expectError(name, sql, token) {
  const res = await psql(sql);
  const blob = `${res.err}\n${res.out}`;
  const tokens = Array.isArray(token) ? token : [token];
  if (res.code !== 0 && tokens.some((t) => blob.includes(t))) {
    record(name, "PASS", tokens.find((t) => blob.includes(t)));
  } else {
    record(name, "FAIL", `code=${res.code} want=${tokens.join("|")} ${blob}`);
  }
  return res;
}

async function expectOk(name, sql) {
  const res = await psql(sql);
  if (res.code === 0) record(name, "PASS", res.out.trim() || "ok");
  else record(name, "FAIL", `${res.err}\n${res.out}`);
  return res;
}

async function assertMasterUnchanged(name, beatId, checksum) {
  const res = await psql(`
SELECT b.status::text || '|' || a.is_active::text || '|' || a.checksum_sha256 || '|' || a.purpose::text || '|' || a.status::text
FROM public.beats b
JOIN public.beat_audio_assets a
  ON a.beat_id = b.id AND a.purpose = 'MASTER' AND a.is_active
WHERE b.id = '${beatId}';
`);
  const line = (res.out || "").trim();
  const ok =
    res.code === 0 &&
    line.includes("PUBLISHED") &&
    line.includes(checksum) &&
    line.includes("true") &&
    line.includes("MASTER") &&
    line.includes("READY");
  record(name, ok ? "PASS" : "FAIL", line || res.err);
  return ok;
}

function asAuth(sub, body) {
  return `
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"${sub}","role":"authenticated"}', true);
${body}
COMMIT;
`;
}

function asService(body) {
  return `
BEGIN;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
${body}
COMMIT;
`;
}

function license(beatId, checksum) {
  return asAuth(
    STAFF,
    `INSERT INTO public.beat_rights_basis (
       beat_id, basis_kind, checksum_sha256, statement_version, scope, verifier_id, verified_at
     ) VALUES (
       '${beatId}', 'platform_license', '${checksum}', 'platform-license-2026-10-19',
       'catalog_publication', '${STAFF}', now()
     );`,
  );
}

async function race(name, aSql, bSql, assertSql, options = {}) {
  const started = Date.now();
  const aPromise = psql(aSql);
  await new Promise((r) => setTimeout(r, 400));
  const b = await psql(bSql);
  const a = await aPromise;
  const check = await psql(assertSql);
  const elapsed = Date.now() - started;
  const blob = `A(${a.code}) ${a.err} ${a.out} | B(${b.code}) ${b.err} ${b.out} | ${check.out} elapsed=${elapsed}`;
  const aOk = options.expectA
    ? a.code !== 0 && `${a.err}\n${a.out}`.includes(options.expectA)
    : a.code === 0;
  const bOk = options.expectB
    ? b.code !== 0 && `${b.err}\n${b.out}`.includes(options.expectB)
    : b.code === 0;
  const stateOk = options.expectState ? (check.out || "").includes(options.expectState) : true;
  const timingOk = options.skipTiming ? true : elapsed >= 1500;
  record(name, aOk && bOk && check.code === 0 && stateOk && timingOk ? "PASS" : "FAIL", blob);
  return { a, b, check, elapsed };
}

async function main() {
  const inspect = await new Promise((resolve) => {
    const child = spawn(
      "docker",
      [
        "inspect",
        "-f",
        "{{.Id}} {{.State.Status}} {{json .HostConfig.PortBindings}} {{range .Mounts}}{{.Name}}{{end}}",
        CONTAINER,
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let out = "";
    child.stdout.on("data", (d) => {
      out += d.toString();
    });
    child.on("close", () => resolve(out.trim()));
  });
  if (
    !inspect.startsWith(EXPECTED_ID) ||
    !inspect.includes("running") ||
    !inspect.includes("55433") ||
    !inspect.includes("472d48f683621174b9d30fdb13238e36355167599cc9c1bdae2d3c3cfcab4f3e") ||
    /HostPort":"5432"/.test(inspect)
  ) {
    console.log("NOT RUN — ISOLATED ENVIRONMENT UNAVAILABLE");
    console.log(inspect);
    process.exit(2);
  }
  record("isolation", "PASS", inspect);

  const mig = await psql(readFileSync(MIGRATION, "utf8"));
  if (mig.code !== 0) {
    record("apply-migration", "FAIL", mig.err || mig.out);
    dump();
    process.exit(1);
  }
  record("apply-migration", "PASS", "ok");

  const triggerCheck = await psql(`
SELECT tgname || '|' || tgenabled::text
FROM pg_trigger
WHERE tgrelid = 'public.beat_audio_assets'::regclass
  AND tgname = 'beat_audio_assets_published_master_rights';
`);
  record(
    "trigger-present",
    triggerCheck.out.includes("beat_audio_assets_published_master_rights") ? "PASS" : "FAIL",
    triggerCheck.out || triggerCheck.err,
  );

  await expectOk(
    "reset",
    `
SET session_replication_role = replica;
TRUNCATE TABLE
  public.beat_rights_reviews,
  public.beat_moderation_decisions,
  public.beat_blocked_audio_hashes,
  public.beat_rights_basis,
  public.beat_rights_hash_locks,
  public.beat_audio_assets,
  public.beats
RESTART IDENTITY CASCADE;
DELETE FROM public.profiles WHERE id IN ('${OWNER}', '${STAFF}', '${OTHER}');
DELETE FROM auth.users WHERE id IN ('${OWNER}', '${STAFF}', '${OTHER}');
SET session_replication_role = DEFAULT;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon, authenticated, service_role;
INSERT INTO auth.users (id, email) VALUES
  ('${OWNER}', 'owner@master-mut.local'),
  ('${STAFF}', 'staff@master-mut.local'),
  ('${OTHER}', 'other@master-mut.local');
UPDATE public.profiles SET role = 'ADMIN' WHERE id = '${STAFF}';
`,
  );

  const H = {
    pub: sha("pub"),
    bad: sha("bad"),
    good: sha("good"),
    block: sha("block"),
    still: sha("still"),
    needs: sha("needs"),
    open: sha("open"),
    raceA: sha("race-a"),
    raceB: sha("race-b"),
    raceC: sha("race-c"),
    draft: sha("draft"),
    pub2: sha("pub2"),
  };

  const ids = {
    pub: "d1000000-0000-4000-8000-000000000001",
    user: "d1000000-0000-4000-8000-000000000002",
    draft: "d1000000-0000-4000-8000-000000000003",
    racePub: "d1000000-0000-4000-8000-000000000004",
    raceFin: "d1000000-0000-4000-8000-000000000005",
    racePublish: "d1000000-0000-4000-8000-000000000006",
    raceSwap: "d1000000-0000-4000-8000-000000000007",
    needsBeat: "d1000000-0000-4000-8000-000000000008",
  };

  const asset = {
    pub: "d2000000-0000-4000-8000-000000000001",
    user: "d2000000-0000-4000-8000-000000000004",
    draft: "d2000000-0000-4000-8000-000000000005",
    racePub: "d2000000-0000-4000-8000-000000000006",
    raceFinActive: "d2000000-0000-4000-8000-000000000007",
    raceFinPending: "d2000000-0000-4000-8000-000000000008",
    racePublish: "d2000000-0000-4000-8000-000000000009",
    raceSwapActive: "d2000000-0000-4000-8000-000000000010",
    raceSwapP1: "d2000000-0000-4000-8000-000000000011",
    raceSwapP2: "d2000000-0000-4000-8000-000000000012",
    needs: "d2000000-0000-4000-8000-000000000013",
  };

  await expectOk(
    "seed-beats",
    `
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false);
INSERT INTO public.beats (id, owner_id, ownership_type, title, bpm, duration_seconds, tags, status) VALUES
  ('${ids.pub}', NULL, 'PLATFORM', 'pub', 90, 120, '{}', 'DRAFT'),
  ('${ids.user}', '${OWNER}', 'USER', 'user', 90, 120, '{}', 'APPROVED'),
  ('${ids.draft}', NULL, 'PLATFORM', 'draft', 90, 120, '{}', 'DRAFT'),
  ('${ids.racePub}', NULL, 'PLATFORM', 'race-pub', 90, 120, '{}', 'DRAFT'),
  ('${ids.raceFin}', NULL, 'PLATFORM', 'race-fin', 90, 120, '{}', 'DRAFT'),
  ('${ids.racePublish}', NULL, 'PLATFORM', 'race-publish', 90, 120, '{}', 'DRAFT'),
  ('${ids.raceSwap}', NULL, 'PLATFORM', 'race-swap', 90, 120, '{}', 'DRAFT'),
  ('${ids.needsBeat}', NULL, 'PLATFORM', 'needs', 90, 120, '{}', 'DRAFT');
INSERT INTO public.beat_audio_assets (id, beat_id, purpose, status, object_key, content_type, byte_size, checksum_sha256, is_active) VALUES
  ('${asset.pub}', '${ids.pub}', 'MASTER', 'READY', 'platform/pub.bin', 'audio/mpeg', 1000, '${H.pub}', true),
  ('${asset.user}', '${ids.user}', 'MASTER', 'READY', 'user/${OWNER}/user.bin', 'audio/mpeg', 1000, '${H.pub}', true),
  ('${asset.draft}', '${ids.draft}', 'MASTER', 'READY', 'platform/draft.bin', 'audio/mpeg', 1000, '${H.draft}', true),
  ('${asset.racePub}', '${ids.racePub}', 'MASTER', 'READY', 'platform/race-pub.bin', 'audio/mpeg', 1000, '${H.raceA}', true),
  ('${asset.raceFinActive}', '${ids.raceFin}', 'MASTER', 'READY', 'platform/race-fin.bin', 'audio/mpeg', 1000, '${H.raceA}', true),
  ('${asset.racePublish}', '${ids.racePublish}', 'MASTER', 'READY', 'platform/race-publish.bin', 'audio/mpeg', 1000, '${H.pub2}', true),
  ('${asset.raceSwapActive}', '${ids.raceSwap}', 'MASTER', 'READY', 'platform/race-swap.bin', 'audio/mpeg', 1000, '${H.raceA}', true),
  ('${asset.needs}', '${ids.needsBeat}', 'MASTER', 'READY', 'platform/needs.bin', 'audio/mpeg', 1000, '${H.needs}', true);
`,
  );

  await expectOk("license-pub", license(ids.pub, H.pub));
  await expectOk(
    "attest-user",
    asAuth(
      OWNER,
      `INSERT INTO public.beat_rights_basis (beat_id, basis_kind, checksum_sha256, statement_version, actor_id)
       VALUES ('${ids.user}', 'user_attestation', '${H.pub}', 'proposal-2026-10-19', '${OWNER}');`,
    ),
  );
  await expectOk("license-race-a-pub", license(ids.racePub, H.raceA));
  await expectOk("license-race-a-fin", license(ids.raceFin, H.raceA));
  await expectOk("license-race-b-fin", license(ids.raceFin, H.raceB));
  await expectOk("license-race-publish", license(ids.racePublish, H.pub2));
  await expectOk("license-race-swap-a", license(ids.raceSwap, H.raceA));
  await expectOk("license-race-swap-b", license(ids.raceSwap, H.raceB));
  await expectOk("license-race-swap-c", license(ids.raceSwap, H.raceC));
  await expectOk("license-needs", license(ids.needsBeat, H.needs));

  await expectOk("publish-plat", asAuth(STAFF, `UPDATE public.beats SET status='PUBLISHED' WHERE id='${ids.pub}';`));
  await expectOk("publish-user", asAuth(STAFF, `UPDATE public.beats SET status='PUBLISHED' WHERE id='${ids.user}';`));
  await expectOk("publish-race-pub", asAuth(STAFF, `UPDATE public.beats SET status='PUBLISHED' WHERE id='${ids.racePub}';`));
  await expectOk("publish-race-fin", asAuth(STAFF, `UPDATE public.beats SET status='PUBLISHED' WHERE id='${ids.raceFin}';`));
  await expectOk("publish-race-swap", asAuth(STAFF, `UPDATE public.beats SET status='PUBLISHED' WHERE id='${ids.raceSwap}';`));
  await expectOk("publish-needs", asAuth(STAFF, `UPDATE public.beats SET status='PUBLISHED' WHERE id='${ids.needsBeat}';`));

  // --- Direct privileged mutations ---
  await expectError(
    "svc-change-checksum",
    asService(`UPDATE public.beat_audio_assets SET checksum_sha256='${H.bad}' WHERE id='${asset.pub}';`),
    "RIGHTS_",
  );
  await assertMasterUnchanged("svc-change-checksum-state", ids.pub, H.pub);

  await expectError(
    "svc-deactivate-active",
    asService(`UPDATE public.beat_audio_assets SET is_active=false, status='REPLACED' WHERE id='${asset.pub}';`),
    "RIGHTS_PUBLISHED_MASTER_INVALID",
  );
  await assertMasterUnchanged("svc-deactivate-state", ids.pub, H.pub);

  await expectOk(
    "empty-target-beat",
    `
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false);
INSERT INTO public.beats (id, owner_id, ownership_type, title, bpm, duration_seconds, tags, status)
VALUES ('d1000000-0000-4000-8000-000000000099', NULL, 'PLATFORM', 'empty-target', 90, 120, '{}', 'DRAFT')
ON CONFLICT (id) DO NOTHING;
`,
  );
  await expectError(
    "svc-change-beat-id",
    asService(
      `UPDATE public.beat_audio_assets SET beat_id='d1000000-0000-4000-8000-000000000099' WHERE id='${asset.pub}';`,
    ),
    ["RIGHTS_PUBLISHED_MASTER_INVALID", "RIGHTS_"],
  );
  await assertMasterUnchanged("svc-change-beat-id-state", ids.pub, H.pub);

  await expectError(
    "svc-change-purpose",
    asService(`UPDATE public.beat_audio_assets SET purpose='PLAYBACK' WHERE id='${asset.pub}';`),
    "RIGHTS_PUBLISHED_MASTER_INVALID",
  );
  await assertMasterUnchanged("svc-change-purpose-state", ids.pub, H.pub);

  await expectError(
    "svc-change-status",
    asService(`UPDATE public.beat_audio_assets SET status='PENDING_UPLOAD' WHERE id='${asset.pub}';`),
    "RIGHTS_PUBLISHED_MASTER_INVALID",
  );
  await assertMasterUnchanged("svc-change-status-state", ids.pub, H.pub);

  // Admin variants
  await expectError(
    "admin-change-checksum",
    asAuth(STAFF, `UPDATE public.beat_audio_assets SET checksum_sha256='${H.bad}' WHERE id='${asset.pub}';`),
    "RIGHTS_",
  );
  await assertMasterUnchanged("admin-change-checksum-state", ids.pub, H.pub);
  await expectError(
    "admin-deactivate",
    asAuth(STAFF, `UPDATE public.beat_audio_assets SET is_active=false, status='REPLACED' WHERE id='${asset.pub}';`),
    "RIGHTS_PUBLISHED_MASTER_INVALID",
  );
  await assertMasterUnchanged("admin-deactivate-state", ids.pub, H.pub);
  await expectError(
    "admin-change-beat-id",
    asAuth(
      STAFF,
      `UPDATE public.beat_audio_assets SET beat_id='d1000000-0000-4000-8000-000000000099' WHERE id='${asset.pub}';`,
    ),
    ["RIGHTS_PUBLISHED_MASTER_INVALID", "RIGHTS_"],
  );
  await assertMasterUnchanged("admin-change-beat-id-state", ids.pub, H.pub);
  await expectError(
    "admin-change-purpose",
    asAuth(STAFF, `UPDATE public.beat_audio_assets SET purpose='PLAYBACK' WHERE id='${asset.pub}';`),
    "RIGHTS_PUBLISHED_MASTER_INVALID",
  );
  await assertMasterUnchanged("admin-change-purpose-state", ids.pub, H.pub);
  await expectError(
    "admin-change-status",
    asAuth(STAFF, `UPDATE public.beat_audio_assets SET status='PENDING_UPLOAD' WHERE id='${asset.pub}';`),
    "RIGHTS_PUBLISHED_MASTER_INVALID",
  );
  await assertMasterUnchanged("admin-change-status-state", ids.pub, H.pub);

  await expectError(
    "svc-multi-row-checksum",
    asService(
      `UPDATE public.beat_audio_assets SET checksum_sha256='${H.bad}'
       WHERE id IN ('${asset.pub}', '${asset.user}');`,
    ),
    "RIGHTS_",
  );
  await assertMasterUnchanged("svc-multi-row-plat-state", ids.pub, H.pub);
  await assertMasterUnchanged("svc-multi-row-user-state", ids.user, H.pub);

  // Separate-commit deactivate then activate
  const pendingSep = "d2000000-0000-4000-8000-0000000000a1";
  await expectOk(
    "pending-for-separate-swap",
    asService(`
INSERT INTO public.beat_audio_assets (id, beat_id, purpose, status, object_key, is_active)
VALUES ('${pendingSep}', '${ids.pub}', 'MASTER', 'PENDING_UPLOAD', 'platform/pub-sep.bin', false);
`),
  );
  await expectError(
    "svc-deactivate-alone-commit",
    asService(`UPDATE public.beat_audio_assets SET is_active=false, status='REPLACED' WHERE id='${asset.pub}';`),
    "RIGHTS_PUBLISHED_MASTER_INVALID",
  );
  await assertMasterUnchanged("svc-deactivate-alone-state", ids.pub, H.pub);
  await expectError(
    "svc-activate-new-alone-no-license",
    asService(`
UPDATE public.beat_audio_assets
SET status='READY', is_active=true, content_type='audio/mpeg', byte_size=2000, checksum_sha256='${H.bad}'
WHERE id='${pendingSep}';
`),
    ["RIGHTS_", "beat_audio_assets_one_active_per_purpose_uidx"],
  );
  await assertMasterUnchanged("svc-activate-alone-state", ids.pub, H.pub);

  // Same-txn swap without license
  await expectError(
    "svc-swap-without-license",
    asService(`
UPDATE public.beat_audio_assets SET is_active=false, status='REPLACED', replaced_by_asset_id='${pendingSep}'
WHERE id='${asset.pub}';
UPDATE public.beat_audio_assets
SET status='READY', is_active=true, content_type='audio/mpeg', byte_size=2000, checksum_sha256='${H.bad}'
WHERE id='${pendingSep}';
`),
    "RIGHTS_LICENSE_REQUIRED",
  );
  await assertMasterUnchanged("svc-swap-without-license-state", ids.pub, H.pub);

  // Blocked hash activation
  await expectOk(
    "block-hash",
    asAuth(
      STAFF,
      `INSERT INTO public.beat_blocked_audio_hashes (checksum_sha256, event_kind, reason, actor_id)
       VALUES ('${H.block}', 'block', 'blocked', '${STAFF}');`,
    ),
  );
  const blockedPending = "d2000000-0000-4000-8000-0000000000aa";
  await expectOk(
    "pending-blocked",
    asService(`
INSERT INTO public.beat_audio_assets (id, beat_id, purpose, status, object_key, is_active)
VALUES ('${blockedPending}', '${ids.pub}', 'MASTER', 'PENDING_UPLOAD', 'platform/pub-blocked.bin', false);
`),
  );
  await expectError(
    "activate-blocked-hash",
    asService(`
UPDATE public.beat_audio_assets SET is_active=false, status='REPLACED' WHERE id='${asset.pub}';
UPDATE public.beat_audio_assets
SET status='READY', is_active=true, content_type='audio/mpeg', byte_size=2000, checksum_sha256='${H.block}'
WHERE id='${blockedPending}';
`),
    "RIGHTS_HASH_BLOCKED",
  );
  await assertMasterUnchanged("activate-blocked-state", ids.pub, H.pub);

  // Open review
  await expectOk(
    "open-review",
    asAuth(
      STAFF,
      `INSERT INTO public.beat_rights_reviews (id, beat_id, checksum_sha256, kind, created_by)
       VALUES ('d3000000-0000-4000-8000-000000000001', '${ids.pub}', '${H.open}', 'similar_signal', '${STAFF}');`,
    ),
  );
  const openPending = "d2000000-0000-4000-8000-0000000000ab";
  await expectOk(
    "pending-open",
    asService(`
INSERT INTO public.beat_audio_assets (id, beat_id, purpose, status, object_key, is_active)
VALUES ('${openPending}', '${ids.pub}', 'MASTER', 'PENDING_UPLOAD', 'platform/pub-open.bin', false);
`),
  );
  await expectError(
    "activate-open-review-hash",
    asService(`
UPDATE public.beat_audio_assets SET is_active=false, status='REPLACED' WHERE id='${asset.pub}';
UPDATE public.beat_audio_assets
SET status='READY', is_active=true, content_type='audio/mpeg', byte_size=2000, checksum_sha256='${H.open}'
WHERE id='${openPending}';
`),
    "RIGHTS_REVIEW_OPEN",
  );
  await assertMasterUnchanged("activate-open-state", ids.pub, H.pub);

  // still_blocked
  await expectOk(
    "close-open-still",
    asAuth(
      STAFF,
      `SELECT public.close_beat_rights_review(
         'd3000000-0000-4000-8000-000000000001', 'still_blocked', 'stay'
       );`,
    ),
  );
  await expectError(
    "activate-still-blocked-hash",
    asService(`
UPDATE public.beat_audio_assets SET is_active=false, status='REPLACED' WHERE id='${asset.pub}';
UPDATE public.beat_audio_assets
SET status='READY', is_active=true, content_type='audio/mpeg', byte_size=2000, checksum_sha256='${H.open}'
WHERE id='${openPending}';
`),
    "RIGHTS_REVIEW_UNRESOLVED",
  );
  await assertMasterUnchanged("activate-still-state", ids.pub, H.pub);

  // needs_new_master
  await expectOk(
    "open-needs-review",
    asAuth(
      STAFF,
      `INSERT INTO public.beat_rights_reviews (id, beat_id, checksum_sha256, kind, created_by)
       VALUES ('d3000000-0000-4000-8000-000000000002', '${ids.needsBeat}', '${H.still}', 'similar_signal', '${STAFF}');`,
    ),
  );
  await expectOk(
    "close-needs",
    asAuth(
      STAFF,
      `SELECT public.close_beat_rights_review(
         'd3000000-0000-4000-8000-000000000002', 'needs_new_master', 'replace'
       );`,
    ),
  );
  const needsPending = "d2000000-0000-4000-8000-0000000000ae";
  await expectOk(
    "pending-needs",
    asService(`
INSERT INTO public.beat_audio_assets (id, beat_id, purpose, status, object_key, is_active)
VALUES ('${needsPending}', '${ids.needsBeat}', 'MASTER', 'PENDING_UPLOAD', 'platform/needs-new.bin', false);
`),
  );
  await expectError(
    "activate-needs-new-master-hash",
    asService(`
UPDATE public.beat_audio_assets SET is_active=false, status='REPLACED' WHERE id='${asset.needs}';
UPDATE public.beat_audio_assets
SET status='READY', is_active=true, content_type='audio/mpeg', byte_size=2000, checksum_sha256='${H.still}'
WHERE id='${needsPending}';
`),
    "RIGHTS_REVIEW_UNRESOLVED",
  );
  await assertMasterUnchanged("activate-needs-state", ids.needsBeat, H.needs);

  // Allowed path: finalize with license
  await expectOk("license-good", license(ids.pub, H.good));
  const goodPending = "d2000000-0000-4000-8000-0000000000ac";
  await expectOk(
    "pending-good",
    asService(`
INSERT INTO public.beat_audio_assets (id, beat_id, purpose, status, object_key, is_active)
VALUES ('${goodPending}', '${ids.pub}', 'MASTER', 'PENDING_UPLOAD', 'platform/pub-good.bin', false);
`),
  );
  await expectOk(
    "finalize-with-license",
    asService(`
SELECT public.finalize_beat_master_asset(
  '${ids.pub}', '${goodPending}', 'PLATFORM', NULL,
  'audio/mpeg', 2000, '${H.good}', 120, false,
  NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
);
`),
  );
  await assertMasterUnchanged("finalize-good-state", ids.pub, H.good);

  // Ordinary user direct mutate — RLS may no-op (0 rows) or privilege trigger may raise.
  {
    const before = await psql(
      `SELECT checksum_sha256 FROM public.beat_audio_assets WHERE id='${asset.user}';`,
    );
    const res = await psql(
      asAuth(
        OWNER,
        `UPDATE public.beat_audio_assets SET checksum_sha256='${H.bad}' WHERE id='${asset.user}';`,
      ),
    );
    const after = await psql(
      `SELECT checksum_sha256 FROM public.beat_audio_assets WHERE id='${asset.user}';`,
    );
    const unchanged = (after.out || "").includes(H.pub) && (before.out || "").includes(H.pub);
    const denied =
      res.code !== 0 &&
      (`${res.err}\n${res.out}`.includes("Only ADMIN may mutate") ||
        `${res.err}\n${res.out}`.includes("permission denied") ||
        `${res.err}\n${res.out}`.includes("RIGHTS_"));
    record(
      "user-direct-mutate",
      unchanged && (denied || res.code === 0) ? "PASS" : "FAIL",
      `code=${res.code} unchanged=${unchanged} ${res.err} ${after.out}`,
    );
  }
  await assertMasterUnchanged("user-direct-mutate-state", ids.user, H.pub);

  // Forgeable GUC must not bypass
  await expectError(
    "forge-session-guc-then-update",
    asService(`
SELECT set_config('app.rights_trusted_finalize', '1', true);
UPDATE public.beat_audio_assets SET checksum_sha256='${H.bad}' WHERE id='${goodPending}';
`),
    "RIGHTS_",
  );
  await assertMasterUnchanged("forge-guc-state", ids.pub, H.good);

  // Draft finalize without license still OK
  const draftPending = "d2000000-0000-4000-8000-0000000000ad";
  await expectOk(
    "draft-pending",
    asService(`
INSERT INTO public.beat_audio_assets (id, beat_id, purpose, status, object_key, is_active)
VALUES ('${draftPending}', '${ids.draft}', 'MASTER', 'PENDING_UPLOAD', 'platform/draft-new.bin', false);
`),
  );
  await expectOk(
    "draft-finalize-no-license",
    asService(`
SELECT public.finalize_beat_master_asset(
  '${ids.draft}', '${draftPending}', 'PLATFORM', NULL,
  'audio/mpeg', 2000, '${sha("draft-new")}', 120, false,
  NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
);
`),
  );

  // Append-only regression
  await expectError(
    "append-only-basis",
    asService(`UPDATE public.beat_rights_basis SET statement_version='x' WHERE beat_id='${ids.pub}';`),
    "RIGHTS_",
  );

  // --- Concurrency ---
  await race(
    "race-direct-update-vs-block",
    asService(`
UPDATE public.beat_audio_assets SET checksum_sha256='${H.bad}' WHERE id='${asset.racePub}';
SELECT pg_sleep(2);
`),
    asAuth(
      STAFF,
      `INSERT INTO public.beat_blocked_audio_hashes (checksum_sha256, event_kind, reason, actor_id)
       VALUES ('${H.raceA}', 'block', 'race', '${STAFF}');`,
    ),
    `SELECT b.status::text || '|' || a.checksum_sha256 FROM public.beats b
     JOIN public.beat_audio_assets a ON a.beat_id=b.id AND a.is_active AND a.purpose='MASTER'
     WHERE b.id='${ids.racePub}';`,
    { expectA: "RIGHTS_", expectState: `PUBLISHED|${H.raceA}` },
  );

  {
    const started = Date.now();
    const aPromise = psql(asService(`
UPDATE public.beat_audio_assets SET checksum_sha256='${H.bad}' WHERE id='${asset.racePublish}';
SELECT pg_sleep(2);
`));
    await new Promise((r) => setTimeout(r, 400));
    const b = await psql(asAuth(STAFF, `UPDATE public.beats SET status='PUBLISHED' WHERE id='${ids.racePublish}';`));
    const a = await aPromise;
    const st = await psql(`
SELECT b.status::text || '|' || coalesce(a.checksum_sha256,'none') FROM public.beats b
LEFT JOIN public.beat_audio_assets a ON a.beat_id=b.id AND a.is_active AND a.purpose='MASTER'
WHERE b.id='${ids.racePublish}';
`);
    const elapsed = Date.now() - started;
    const line = (st.out || "").trim();
    const invalid = line.includes("PUBLISHED") && line.includes(H.bad);
    const interleaved = elapsed >= 1500;
    record(
      "race-direct-update-vs-publish",
      !invalid && interleaved && st.code === 0 ? "PASS" : "FAIL",
      `A(${a.code}) B(${b.code}) ${line} elapsed=${elapsed}`,
    );
  }

  await expectOk(
    "race-fin-pending",
    asService(`
INSERT INTO public.beat_audio_assets (id, beat_id, purpose, status, object_key, is_active)
VALUES ('${asset.raceFinPending}', '${ids.raceFin}', 'MASTER', 'PENDING_UPLOAD', 'platform/race-fin-pending.bin', false);
`),
  );
  await race(
    "race-finalize-vs-block-new-hash",
    asService(`
SELECT public.finalize_beat_master_asset(
  '${ids.raceFin}', '${asset.raceFinPending}', 'PLATFORM', NULL,
  'audio/mpeg', 2000, '${H.raceB}', 120, false,
  NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
);
SELECT pg_sleep(2);
`),
    asAuth(
      STAFF,
      `INSERT INTO public.beat_blocked_audio_hashes (checksum_sha256, event_kind, reason, actor_id)
       VALUES ('${H.raceB}', 'block', 'during finalize', '${STAFF}');`,
    ),
    `SELECT b.status::text || '|' || a.checksum_sha256 FROM public.beats b
     JOIN public.beat_audio_assets a ON a.beat_id=b.id AND a.is_active AND a.purpose='MASTER'
     WHERE b.id='${ids.raceFin}';`,
    { expectState: "PUBLISHED|" },
  );
  {
    const st = await psql(`
SELECT a.checksum_sha256 FROM public.beat_audio_assets a
WHERE a.beat_id='${ids.raceFin}' AND a.is_active AND a.purpose='MASTER';
`);
    const cs = (st.out || "").trim();
    // Either finalize won (raceB, post-commit block) or block won first (raceA remains)
    const ok = cs.includes(H.raceB) || cs.includes(H.raceA);
    record("race-finalize-vs-block-master", ok && !cs.includes(H.bad) ? "PASS" : "FAIL", cs);
  }

  // Fresh hashes so earlier block/review races do not contaminate this beat.
  const Hrev = sha("fin-review");
  const Hpar1 = sha("parallel-1");
  const Hpar2 = sha("parallel-2");
  await expectOk("license-fin-review", license(ids.raceSwap, Hrev));
  await expectOk("license-par-1", license(ids.raceSwap, Hpar1));
  await expectOk("license-par-2", license(ids.raceSwap, Hpar2));

  const finReviewPending = "d2000000-0000-4000-8000-0000000000b1";
  await expectOk(
    "fin-review-pending",
    asService(`
INSERT INTO public.beat_audio_assets (id, beat_id, purpose, status, object_key, is_active)
VALUES ('${finReviewPending}', '${ids.raceSwap}', 'MASTER', 'PENDING_UPLOAD', 'platform/fin-review.bin', false);
`),
  );
  {
    const started = Date.now();
    const aPromise = psql(asService(`
SELECT public.finalize_beat_master_asset(
  '${ids.raceSwap}', '${finReviewPending}', 'PLATFORM', NULL,
  'audio/mpeg', 2000, '${Hrev}', 120, false,
  NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
);
SELECT pg_sleep(2);
`));
    await new Promise((r) => setTimeout(r, 400));
    const b = await psql(
      asAuth(
        STAFF,
        `INSERT INTO public.beat_rights_reviews (beat_id, checksum_sha256, kind, created_by)
         VALUES ('${ids.raceSwap}', '${Hrev}', 'similar_signal', '${STAFF}');`,
      ),
    );
    const a = await aPromise;
    const st = await psql(`
SELECT b.status::text || '|' || a.checksum_sha256 FROM public.beats b
JOIN public.beat_audio_assets a ON a.beat_id=b.id AND a.is_active AND a.purpose='MASTER'
WHERE b.id='${ids.raceSwap}';
`);
    const elapsed = Date.now() - started;
    const line = (st.out || "").trim();
    const ok =
      line.includes("PUBLISHED") &&
      (line.includes(H.raceA) || line.includes(Hrev)) &&
      !line.includes(H.bad) &&
      elapsed >= 1500 &&
      st.code === 0 &&
      b.code === 0;
    record(
      "race-finalize-vs-open-review",
      ok ? "PASS" : "FAIL",
      `A(${a.code}) B(${b.code}) ${line} elapsed=${elapsed}`,
    );
  }

  const openIds = await psql(`
SELECT id::text FROM public.beat_rights_reviews
WHERE beat_id='${ids.raceSwap}' AND closed_at IS NULL;
`);
  const openMatch = [
    ...(openIds.out || "").matchAll(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
    ),
  ].map((m) => m[0]);
  for (const rid of openMatch) {
    await expectOk(
      `close-race-review-${rid.slice(0, 8)}`,
      asAuth(STAFF, `SELECT public.close_beat_rights_review('${rid}', 'dismissed_no_publish', 'clear');`),
    );
  }

  await expectOk(
    "race-swap-pendings",
    asService(`
INSERT INTO public.beat_audio_assets (id, beat_id, purpose, status, object_key, is_active) VALUES
  ('${asset.raceSwapP1}', '${ids.raceSwap}', 'MASTER', 'PENDING_UPLOAD', 'platform/swap-p1.bin', false),
  ('${asset.raceSwapP2}', '${ids.raceSwap}', 'MASTER', 'PENDING_UPLOAD', 'platform/swap-p2.bin', false)
ON CONFLICT (id) DO NOTHING;
`),
  );

  // Two parallel finalizes to different licensed hashes — exactly one active READY MASTER remains.
  {
    const started = Date.now();
    const aPromise = psql(asService(`
SELECT public.finalize_beat_master_asset(
  '${ids.raceSwap}', '${asset.raceSwapP1}', 'PLATFORM', NULL,
  'audio/mpeg', 2000, '${Hpar1}', 120, false,
  NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
);
SELECT pg_sleep(2);
`));
    await new Promise((r) => setTimeout(r, 400));
    const b = await psql(asService(`
SELECT public.finalize_beat_master_asset(
  '${ids.raceSwap}', '${asset.raceSwapP2}', 'PLATFORM', NULL,
  'audio/mpeg', 2000, '${Hpar2}', 120, false,
  NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
);
`));
    const a = await aPromise;
    const st = await psql(`
SELECT count(*)::text || '|' || string_agg(checksum_sha256, ',' ORDER BY checksum_sha256)
FROM public.beat_audio_assets
WHERE beat_id='${ids.raceSwap}' AND is_active AND purpose='MASTER' AND status='READY';
`);
    const elapsed = Date.now() - started;
    const line = (st.out || "").trim();
    const oneActive = /\b1\|[0-9a-f]{64}/i.test(line);
    const known =
      line.includes(Hpar1) ||
      line.includes(Hpar2) ||
      line.includes(H.raceA) ||
      line.includes(Hrev);
    record(
      "race-two-parallel-finalize",
      oneActive && known && elapsed >= 1500 && st.code === 0 ? "PASS" : "FAIL",
      `A(${a.code}) B(${b.code}) ${line} elapsed=${elapsed}`,
    );
  }

  dump();
  const failed = results.filter((r) => r.status === "FAIL");
  console.log(`\nTOTAL=${results.length} FAIL=${failed.length}`);
  process.exit(failed.length ? 1 : 0);
}

function dump() {
  console.log("---JSON---");
  console.log(JSON.stringify(results, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
