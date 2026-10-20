/**
 * Rights Safety P0 remediation regression against the disposable container only.
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";

const CONTAINER = "bitrymdym-rights-p0-disposable-20261020";
const EXPECTED_ID = "711d32b0fd309065d89eb9103fd0aab917eed41957bb85dcb665bf20cfb70d99";
const OWNER = "11111111-1111-4111-8111-111111111111";
const STAFF = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";

const results = [];

function sha(label) {
  return createHash("sha256").update(`remediation-${label}`).digest("hex");
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
  results.push({ name, status, detail: String(detail).replace(/\s+/g, " ").trim().slice(0, 600) });
  console.log(`${status}  ${name}  ${String(detail).replace(/\s+/g, " ").trim().slice(0, 220)}`);
}

async function expectError(name, sql, token) {
  const res = await psql(sql);
  const blob = `${res.err}\n${res.out}`;
  if (res.code !== 0 && blob.includes(token)) record(name, "PASS", token);
  else record(name, "FAIL", `code=${res.code} want=${token} ${blob}`);
}

async function expectOk(name, sql) {
  const res = await psql(sql);
  if (res.code === 0) record(name, "PASS", res.out.trim() || "ok");
  else record(name, "FAIL", `${res.err}\n${res.out}`);
  return res;
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

async function race(name, aSql, bSql, assertSql, options = {}) {
  const started = Date.now();
  const aPromise = psql(aSql);
  await new Promise((r) => setTimeout(r, 400));
  const b = await psql(bSql);
  const a = await aPromise;
  const check = await psql(assertSql);
  const elapsed = Date.now() - started;
  const blob = `A(${a.code}) ${a.err} ${a.out} | B(${b.code}) ${b.err} ${b.out} | ${check.out} elapsed=${elapsed}`;
  const bOk = options.expectB
    ? b.code !== 0 && `${b.err}\n${b.out}`.includes(options.expectB)
    : b.code === 0;
  const aOk = options.expectA
    ? a.code !== 0 && `${a.err}\n${a.out}`.includes(options.expectA)
    : a.code === 0;
  const stateOk = options.expectState ? (check.out || "").includes(options.expectState) : true;
  const ok = aOk && bOk && check.code === 0 && stateOk && elapsed >= 1500;
  record(name, ok ? "PASS" : "FAIL", blob);
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
  record("isolation-container", "PASS", inspect);

  const reset = await psql(`
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
`);
  if (reset.code !== 0) {
    record("reset", "FAIL", reset.err);
    dump();
    process.exit(1);
  }
  record("reset", "PASS", "ok");

  await expectOk(
    "seed",
    `
INSERT INTO auth.users (id, email) VALUES
  ('${OWNER}', 'owner@remediation.local'),
  ('${STAFF}', 'staff@remediation.local'),
  ('${OTHER}', 'other@remediation.local');
UPDATE public.profiles SET role = 'ADMIN' WHERE id = '${STAFF}';
`,
  );

  const H = {
    still: sha("still"),
    needs: sha("needs"),
    dismiss: sha("dismiss"),
    newMaster: sha("new-master"),
    ownerOpen: sha("owner-open"),
    foreign: sha("foreign"),
    platPub: sha("plat-pub"),
    platNewBad: sha("plat-new-bad"),
    platNewOk: sha("plat-new-ok"),
    platBlock: sha("plat-block"),
    platReview: sha("plat-review"),
    raceBL: sha("race-bl"),
    racePR: sha("race-pr"),
    racePB: sha("race-pb"),
    racePF: sha("race-pf"),
    raceSB: sha("race-sb"),
    raceNM: sha("race-nm"),
    raceFB: sha("race-fb"),
  };

  const ids = {
    still: "a1000000-0000-4000-8000-000000000001",
    needs: "a1000000-0000-4000-8000-000000000002",
    dismiss: "a1000000-0000-4000-8000-000000000003",
    newMaster: "a1000000-0000-4000-8000-000000000004",
    ownerOpen: "a1000000-0000-4000-8000-000000000005",
    foreign: "a1000000-0000-4000-8000-000000000006",
    platPub: "a2000000-0000-4000-8000-000000000001",
    platDraft: "a2000000-0000-4000-8000-000000000002",
    racePR: "a3000000-0000-4000-8000-000000000001",
    racePB: "a3000000-0000-4000-8000-000000000002",
    racePF: "a3000000-0000-4000-8000-000000000003",
    raceSB: "a3000000-0000-4000-8000-000000000004",
    raceNM: "a3000000-0000-4000-8000-000000000005",
    raceFB: "a3000000-0000-4000-8000-000000000006",
  };

  async function beat(id, ownership, owner, status, title) {
    const ownerSql = owner ? `'${owner}'` : "NULL";
    const res = await psql(`
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false);
INSERT INTO public.beats (id, owner_id, ownership_type, title, bpm, duration_seconds, tags, status)
VALUES ('${id}', ${ownerSql}, '${ownership}', '${title}', 90, 120, '{}', '${status}');
`);
    if (res.code !== 0) record(`fixture-beat-${title}`, "FAIL", res.err);
  }

  async function master(beatId, hash, key) {
    const res = await psql(`
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false);
INSERT INTO public.beat_audio_assets (
  beat_id, purpose, status, object_key, content_type, byte_size, checksum_sha256, is_active
) VALUES (
  '${beatId}', 'MASTER', 'READY', '${key}', 'audio/mpeg', 1000, '${hash}', true
);
`);
    if (res.code !== 0) record(`fixture-master-${key}`, "FAIL", res.err);
  }

  const uk = (name) => `user/${OWNER}/${name}.bin`;
  const pk = (name) => `platform/${name}.bin`;

  await beat(ids.still, "USER", OWNER, "APPROVED", "still");
  await beat(ids.needs, "USER", OWNER, "APPROVED", "needs");
  await beat(ids.dismiss, "USER", OWNER, "APPROVED", "dismiss");
  await beat(ids.newMaster, "USER", OWNER, "APPROVED", "new-master");
  await beat(ids.ownerOpen, "USER", OWNER, "APPROVED", "owner-open");
  await beat(ids.foreign, "USER", OTHER, "APPROVED", "foreign");
  await beat(ids.platPub, "PLATFORM", null, "DRAFT", "plat-pub");
  await beat(ids.platDraft, "PLATFORM", null, "DRAFT", "plat-draft");
  await beat(ids.racePR, "USER", OWNER, "APPROVED", "race-pr");
  await beat(ids.racePB, "USER", OWNER, "APPROVED", "race-pb");
  await beat(ids.racePF, "PLATFORM", null, "DRAFT", "race-pf");
  await beat(ids.raceSB, "USER", OWNER, "APPROVED", "race-sb");
  await beat(ids.raceNM, "USER", OWNER, "APPROVED", "race-nm");
  await beat(ids.raceFB, "PLATFORM", null, "DRAFT", "race-fb");

  await master(ids.still, H.still, uk("still"));
  await master(ids.needs, H.needs, uk("needs"));
  await master(ids.dismiss, H.dismiss, uk("dismiss"));
  await master(ids.newMaster, H.still, uk("new-master-old"));
  await master(ids.ownerOpen, H.ownerOpen, uk("owner-open"));
  await master(ids.foreign, H.foreign, `user/${OTHER}/foreign.bin`);
  await master(ids.platPub, H.platPub, pk("plat-pub"));
  await master(ids.platDraft, H.platBlock, pk("plat-draft"));
  await master(ids.racePR, H.racePR, uk("race-pr"));
  await master(ids.racePB, H.racePB, uk("race-pb"));
  await master(ids.racePF, H.racePF, pk("race-pf"));
  await master(ids.raceSB, H.raceSB, uk("race-sb"));
  await master(ids.raceNM, H.raceNM, uk("race-nm"));
  await master(ids.raceFB, H.raceFB, pk("race-fb"));

  function attest(beatId, hash, actor = OWNER) {
    return asAuth(
      actor,
      `INSERT INTO public.beat_rights_basis (beat_id, basis_kind, checksum_sha256, statement_version, actor_id)
       VALUES ('${beatId}', 'user_attestation', '${hash}', 'proposal-2026-10-19', '${actor}');`,
    );
  }

  function license(beatId, hash) {
    return asAuth(
      STAFF,
      `INSERT INTO public.beat_rights_basis (
         beat_id, basis_kind, checksum_sha256, statement_version, scope, verifier_id, verified_at
       ) VALUES (
         '${beatId}', 'platform_license', '${hash}', 'platform-license-2026-10-19',
         'catalog_publication', '${STAFF}', now()
       );`,
    );
  }

  for (const [id, hash] of [
    [ids.still, H.still],
    [ids.needs, H.needs],
    [ids.dismiss, H.dismiss],
    [ids.newMaster, H.still],
    [ids.ownerOpen, H.ownerOpen],
    [ids.racePR, H.racePR],
    [ids.racePB, H.racePB],
    [ids.raceSB, H.raceSB],
    [ids.raceNM, H.raceNM],
  ]) {
    await expectOk(`attest-${id.slice(-1)}`, attest(id, hash));
  }
  await expectOk("attest-foreign", attest(ids.foreign, H.foreign, OTHER));
  await expectOk("license-plat-pub", license(ids.platPub, H.platPub));
  await expectOk("license-race-pf", license(ids.racePF, H.racePF));
  await expectOk("license-race-fb-old", license(ids.raceFB, H.raceFB));
  await expectOk(
    "publish-race-fb",
    asAuth(STAFF, `UPDATE public.beats SET status='PUBLISHED' WHERE id='${ids.raceFB}';`),
  );

  // --- P0-A ---
  await expectOk(
    "p0a-open-still",
    asAuth(
      STAFF,
      `INSERT INTO public.beat_rights_reviews (id, beat_id, checksum_sha256, kind, created_by)
       VALUES ('b1000000-0000-4000-8000-000000000001', '${ids.still}', '${H.still}', 'blocked_hash', '${STAFF}');`,
    ),
  );
  await expectOk(
    "p0a-close-still",
    asAuth(
      STAFF,
      `SELECT public.close_beat_rights_review(
         'b1000000-0000-4000-8000-000000000001', 'still_blocked', 'keep blocked'
       );`,
    ),
  );
  await expectError(
    "p0a-still-blocks-same-hash-publish",
    asAuth(STAFF, `UPDATE public.beats SET status='PUBLISHED' WHERE id='${ids.still}';`),
    "RIGHTS_REVIEW_UNRESOLVED",
  );

  await expectOk(
    "p0a-open-needs",
    asAuth(
      STAFF,
      `INSERT INTO public.beat_rights_reviews (id, beat_id, checksum_sha256, kind, created_by)
       VALUES ('b1000000-0000-4000-8000-000000000002', '${ids.needs}', '${H.needs}', 'error', '${STAFF}');`,
    ),
  );
  await expectOk(
    "p0a-close-needs",
    asAuth(
      STAFF,
      `SELECT public.close_beat_rights_review(
         'b1000000-0000-4000-8000-000000000002', 'needs_new_master', 'replace master'
       );`,
    ),
  );
  await expectError(
    "p0a-needs-blocks-same-hash-publish",
    asAuth(STAFF, `UPDATE public.beats SET status='PUBLISHED' WHERE id='${ids.needs}';`),
    "RIGHTS_REVIEW_UNRESOLVED",
  );

  await expectOk(
    "p0a-open-dismiss",
    asAuth(
      STAFF,
      `INSERT INTO public.beat_rights_reviews (id, beat_id, checksum_sha256, kind, created_by)
       VALUES ('b1000000-0000-4000-8000-000000000003', '${ids.dismiss}', '${H.dismiss}', 'similar_signal', '${STAFF}');`,
    ),
  );
  await expectOk(
    "p0a-close-dismiss",
    asAuth(
      STAFF,
      `SELECT public.close_beat_rights_review(
         'b1000000-0000-4000-8000-000000000003', 'dismissed_no_publish', 'cleared'
       );`,
    ),
  );
  await expectOk(
    "p0a-dismiss-allows-publish",
    asAuth(STAFF, `UPDATE public.beats SET status='PUBLISHED' WHERE id='${ids.dismiss}';`),
  );

  await expectOk(
    "p0a-open-old-hash-for-new-master-beat",
    asAuth(
      STAFF,
      `INSERT INTO public.beat_rights_reviews (id, beat_id, checksum_sha256, kind, created_by)
       VALUES ('b1000000-0000-4000-8000-000000000004', '${ids.newMaster}', '${H.still}', 'blocked_hash', '${STAFF}');`,
    ),
  );
  await expectOk(
    "p0a-close-old-hash-needs",
    asAuth(
      STAFF,
      `SELECT public.close_beat_rights_review(
         'b1000000-0000-4000-8000-000000000004', 'needs_new_master', 'swap'
       );`,
    ),
  );
  await expectOk(
    "p0a-swap-to-new-master-hash",
    `
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false);
UPDATE public.beat_audio_assets SET is_active=false, status='REPLACED'
WHERE beat_id='${ids.newMaster}' AND is_active;
INSERT INTO public.beat_audio_assets (
  beat_id, purpose, status, object_key, content_type, byte_size, checksum_sha256, is_active
) VALUES (
  '${ids.newMaster}', 'MASTER', 'READY', '${uk("new-master-new")}', 'audio/mpeg', 1000, '${H.newMaster}', true
);
`,
  );
  await expectOk("p0a-attest-new-master", attest(ids.newMaster, H.newMaster));
  await expectOk(
    "p0a-new-hash-publish-independent",
    asAuth(STAFF, `UPDATE public.beats SET status='PUBLISHED' WHERE id='${ids.newMaster}';`),
  );

  const ownerClose = await psql(
    asAuth(
      OWNER,
      `UPDATE public.beat_rights_reviews
       SET closed_at=now(), closed_by='${OWNER}', close_outcome='dismissed_no_publish'
       WHERE beat_id='${ids.still}';`,
    ),
  );
  record(
    "p0a-owner-cannot-set-outcome",
    ownerClose.code !== 0 ||
      ownerClose.err.includes("row-level security") ||
      ownerClose.err.includes("RIGHTS_") ||
      !(await psql(`SELECT close_outcome::text FROM public.beat_rights_reviews WHERE beat_id='${ids.still}' AND close_outcome='dismissed_no_publish';`)).out.includes("dismissed")
      ? "PASS"
      : "FAIL",
    ownerClose.err || ownerClose.out || "no dismissed outcome written",
  );

  // --- P0-B ---
  await expectOk(
    "p0b-owner-opens-own-review",
    asAuth(
      OWNER,
      `INSERT INTO public.beat_rights_reviews (id, beat_id, checksum_sha256, kind, created_by)
       VALUES ('b2000000-0000-4000-8000-000000000001', '${ids.ownerOpen}', '${H.ownerOpen}', 'not_run', '${OWNER}');`,
    ),
  );
  await expectError(
    "p0b-owner-cannot-open-foreign",
    asAuth(
      OWNER,
      `INSERT INTO public.beat_rights_reviews (beat_id, checksum_sha256, kind, created_by)
       VALUES ('${ids.foreign}', '${H.foreign}', 'not_run', '${OWNER}');`,
    ),
    "RIGHTS_REVIEW_ACTOR",
  );
  await expectError(
    "p0b-owner-cannot-spoof-created-by",
    asAuth(
      OWNER,
      `INSERT INTO public.beat_rights_reviews (beat_id, checksum_sha256, kind, created_by)
       VALUES ('${ids.ownerOpen}', '${H.ownerOpen}', 'error', '${STAFF}');`,
    ),
    "RIGHTS_REVIEW_ACTOR",
  );
  await expectError(
    "p0b-anon-cannot-open",
    `
BEGIN;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
INSERT INTO public.beat_rights_reviews (beat_id, checksum_sha256, kind, created_by)
VALUES ('${ids.ownerOpen}', '${H.ownerOpen}', 'not_run', '${OWNER}');
COMMIT;
`,
    "permission denied",
  );
  await expectError(
    "p0b-owner-cannot-close",
    asAuth(
      OWNER,
      `SELECT public.close_beat_rights_review(
         'b2000000-0000-4000-8000-000000000001', 'dismissed_no_publish', 'no'
       );`,
    ),
    "RIGHTS_ACTOR_REQUIRED",
  );
  await expectError(
    "p0b-owner-open-blocks-publish",
    asAuth(STAFF, `UPDATE public.beats SET status='PUBLISHED' WHERE id='${ids.ownerOpen}';`),
    "RIGHTS_REVIEW_OPEN",
  );
  await expectOk(
    "p0b-staff-can-close-owner-review",
    asAuth(
      STAFF,
      `SELECT public.close_beat_rights_review(
         'b2000000-0000-4000-8000-000000000001', 'dismissed_no_publish', 'staff clears'
       );`,
    ),
  );

  // --- P0-C ---
  await expectOk(
    "p0c-publish-platform",
    asAuth(STAFF, `UPDATE public.beats SET status='PUBLISHED' WHERE id='${ids.platPub}';`),
  );
  const oldMaster = await psql(
    `SELECT id::text FROM public.beat_audio_assets WHERE beat_id='${ids.platPub}' AND is_active AND purpose='MASTER';`,
  );
  const oldMasterId = (oldMaster.out.match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
  ) || [])[0];
  await expectOk(
    "p0c-pending-bad-hash",
    `
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false);
INSERT INTO public.beat_audio_assets (
  id, beat_id, purpose, status, object_key, is_active
) VALUES (
  'c1000000-0000-4000-8000-000000000001', '${ids.platPub}', 'MASTER', 'PENDING_UPLOAD',
  'platform/plat-pub-bad.bin', false
);
`,
  );
  await expectError(
    "p0c-finalize-published-without-license",
    asService(
      `SELECT public.finalize_beat_master_asset(
         '${ids.platPub}', 'c1000000-0000-4000-8000-000000000001', 'PLATFORM', NULL,
         'audio/mpeg', 2000, '${H.platNewBad}', 120, false,
         NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
       );`,
    ),
    "RIGHTS_LICENSE_REQUIRED",
  );
  const afterBad = await psql(
    `SELECT a.is_active::text || ' ' || a.checksum_sha256 FROM public.beat_audio_assets a
     WHERE a.beat_id='${ids.platPub}' AND a.id='${oldMasterId}';`,
  );
  record(
    "p0c-previous-master-unchanged-after-reject",
    afterBad.out.includes(H.platPub) &&
      (afterBad.out.includes("true") || afterBad.out.includes("t "))
      ? "PASS"
      : "FAIL",
    afterBad.out || afterBad.err,
  );

  await expectOk(
    "p0c-license-other-beat-only",
    license(ids.platDraft, H.platNewOk),
  );
  await expectOk(
    "p0c-pending-other-license-hash",
    `
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false);
INSERT INTO public.beat_audio_assets (
  id, beat_id, purpose, status, object_key, is_active
) VALUES (
  'c1000000-0000-4000-8000-000000000002', '${ids.platPub}', 'MASTER', 'PENDING_UPLOAD',
  'platform/plat-pub-other.bin', false
);
`,
  );
  await expectError(
    "p0c-finalize-license-for-other-beat",
    asService(
      `SELECT public.finalize_beat_master_asset(
         '${ids.platPub}', 'c1000000-0000-4000-8000-000000000002', 'PLATFORM', NULL,
         'audio/mpeg', 2000, '${H.platNewOk}', 120, false,
         NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
       );`,
    ),
    "RIGHTS_LICENSE_REQUIRED",
  );

  await expectOk(
    "p0c-block-hash",
    asAuth(
      STAFF,
      `INSERT INTO public.beat_blocked_audio_hashes (checksum_sha256, event_kind, reason, actor_id)
       VALUES ('${H.platBlock}', 'block', 'blocked for finalize', '${STAFF}');`,
    ),
  );
  await expectOk(
    "p0c-pending-blocked",
    `
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false);
INSERT INTO public.beat_audio_assets (
  id, beat_id, purpose, status, object_key, is_active
) VALUES (
  'c1000000-0000-4000-8000-000000000003', '${ids.platDraft}', 'MASTER', 'PENDING_UPLOAD',
  'platform/plat-draft-blocked.bin', false
);
`,
  );
  await expectError(
    "p0c-finalize-blocked-hash",
    asService(
      `SELECT public.finalize_beat_master_asset(
         '${ids.platDraft}', 'c1000000-0000-4000-8000-000000000003', 'PLATFORM', NULL,
         'audio/mpeg', 2000, '${H.platBlock}', 120, false,
         NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
       );`,
    ),
    "RIGHTS_HASH_BLOCKED",
  );

  await expectOk(
    "p0c-open-review-on-draft",
    asAuth(
      STAFF,
      `INSERT INTO public.beat_rights_reviews (beat_id, checksum_sha256, kind, created_by)
       VALUES ('${ids.platDraft}', '${H.platReview}', 'similar_signal', '${STAFF}');`,
    ),
  );
  await expectOk(
    "p0c-pending-open-review",
    `
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false);
INSERT INTO public.beat_audio_assets (
  id, beat_id, purpose, status, object_key, is_active
) VALUES (
  'c1000000-0000-4000-8000-000000000004', '${ids.platDraft}', 'MASTER', 'PENDING_UPLOAD',
  'platform/plat-draft-review.bin', false
);
`,
  );
  await expectError(
    "p0c-finalize-open-review",
    asService(
      `SELECT public.finalize_beat_master_asset(
         '${ids.platDraft}', 'c1000000-0000-4000-8000-000000000004', 'PLATFORM', NULL,
         'audio/mpeg', 2000, '${H.platReview}', 120, false,
         NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
       );`,
    ),
    "RIGHTS_REVIEW_OPEN",
  );

  await expectOk(
    "p0c-license-good-replacement",
    license(ids.platPub, H.platNewOk),
  );
  await expectOk(
    "p0c-pending-good",
    `
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false);
INSERT INTO public.beat_audio_assets (
  id, beat_id, purpose, status, object_key, is_active
) VALUES (
  'c1000000-0000-4000-8000-000000000005', '${ids.platPub}', 'MASTER', 'PENDING_UPLOAD',
  'platform/plat-pub-good.bin', false
);
`,
  );
  await expectOk(
    "p0c-finalize-published-with-license",
    asService(
      `SELECT public.finalize_beat_master_asset(
         '${ids.platPub}', 'c1000000-0000-4000-8000-000000000005', 'PLATFORM', NULL,
         'audio/mpeg', 2000, '${H.platNewOk}', 120, false,
         NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
       );`,
    ),
  );
  const goodState = await psql(
    `SELECT b.status::text || ' ' || a.checksum_sha256 FROM public.beats b
     JOIN public.beat_audio_assets a ON a.beat_id=b.id AND a.is_active AND a.purpose='MASTER'
     WHERE b.id='${ids.platPub}';`,
  );
  record(
    "p0c-published-master-swapped-with-license",
    goodState.out.includes(`PUBLISHED ${H.platNewOk}`) ? "PASS" : "FAIL",
    goodState.out || goodState.err,
  );

  const openDraft = await psql(
    `SELECT id::text FROM public.beat_rights_reviews WHERE beat_id='${ids.platDraft}' AND closed_at IS NULL LIMIT 1;`,
  );
  const openDraftId = (openDraft.out.match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
  ) || [])[0];
  if (openDraftId) {
    await expectOk(
      "p0c-close-draft-review",
      asAuth(
        STAFF,
        `SELECT public.close_beat_rights_review('${openDraftId}', 'dismissed_no_publish', 'clear draft');`,
      ),
    );
  } else {
    record("p0c-close-draft-review", "PASS", "no open review left");
  }
  await expectOk(
    "p0c-draft-pending-unlicensed",
    `
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false);
INSERT INTO public.beat_audio_assets (
  id, beat_id, purpose, status, object_key, is_active
) VALUES (
  'c1000000-0000-4000-8000-000000000006', '${ids.platDraft}', 'MASTER', 'PENDING_UPLOAD',
  'platform/plat-draft-new.bin', false
);
`,
  );
  await expectOk(
    "p0c-unpublished-finalize-without-license",
    asService(
      `SELECT public.finalize_beat_master_asset(
         '${ids.platDraft}', 'c1000000-0000-4000-8000-000000000006', 'PLATFORM', NULL,
         'audio/mpeg', 2000, '${sha("draft-ok")}', 120, false,
         NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
       );`,
    ),
  );

  // --- concurrency ---
  await race(
    "race-block-then-lift",
    asAuth(
      STAFF,
      `INSERT INTO public.beat_blocked_audio_hashes (checksum_sha256, event_kind, reason, actor_id)
       VALUES ('${H.raceBL}', 'block', 'A', '${STAFF}');
       SELECT pg_sleep(2);`,
    ),
    asAuth(
      STAFF,
      `INSERT INTO public.beat_blocked_audio_hashes (checksum_sha256, event_kind, reason, actor_id)
       VALUES ('${H.raceBL}', 'lift', 'B', '${STAFF}');`,
    ),
    `SELECT string_agg(event_kind::text || ':' || event_seq::text, ',' ORDER BY event_seq)
     FROM public.beat_blocked_audio_hashes WHERE checksum_sha256='${H.raceBL}';`,
    { expectState: "block:1,lift:2" },
  );

  await race(
    "race-review-holds-then-publish",
    asAuth(
      OWNER,
      `INSERT INTO public.beat_rights_reviews (beat_id, checksum_sha256, kind, created_by)
       VALUES ('${ids.racePR}', '${H.racePR}', 'not_run', '${OWNER}');
       SELECT pg_sleep(2);`,
    ),
    asAuth(STAFF, `UPDATE public.beats SET status='PUBLISHED' WHERE id='${ids.racePR}';`),
    `SELECT status::text FROM public.beats WHERE id='${ids.racePR}';`,
    { expectB: "RIGHTS_REVIEW_OPEN", expectState: "APPROVED" },
  );

  await race(
    "race-publish-holds-then-block",
    asAuth(
      STAFF,
      `UPDATE public.beats SET status='PUBLISHED' WHERE id='${ids.racePB}';
       SELECT pg_sleep(2);`,
    ),
    asAuth(
      STAFF,
      `INSERT INTO public.beat_blocked_audio_hashes (checksum_sha256, event_kind, reason, actor_id)
       VALUES ('${H.racePB}', 'block', 'after', '${STAFF}');`,
    ),
    `SELECT b.status::text || ' ' || e.event_kind::text FROM public.beats b
     JOIN public.beat_blocked_audio_hashes e ON e.checksum_sha256='${H.racePB}'
     WHERE b.id='${ids.racePB}';`,
    { expectState: "PUBLISHED block" },
  );

  await expectOk(
    "race-pf-pending",
    `
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false);
INSERT INTO public.beat_audio_assets (
  id, beat_id, purpose, status, object_key, is_active
) VALUES (
  'c2000000-0000-4000-8000-000000000001', '${ids.racePF}', 'MASTER', 'PENDING_UPLOAD',
  'platform/race-pf-pending.bin', false
);
`,
  );
  await race(
    "race-publish-holds-then-finalize-unlicensed",
    asAuth(
      STAFF,
      `UPDATE public.beats SET status='PUBLISHED' WHERE id='${ids.racePF}';
       SELECT pg_sleep(2);`,
    ),
    asService(
      `SELECT public.finalize_beat_master_asset(
         '${ids.racePF}', 'c2000000-0000-4000-8000-000000000001', 'PLATFORM', NULL,
         'audio/mpeg', 2000, '${sha("race-pf-bad")}', 120, false,
         NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
       );`,
    ),
    `SELECT b.status::text || ' ' || a.checksum_sha256 FROM public.beats b
     JOIN public.beat_audio_assets a ON a.beat_id=b.id AND a.is_active
     WHERE b.id='${ids.racePF}';`,
    { expectB: "RIGHTS_LICENSE_REQUIRED", expectState: `PUBLISHED ${H.racePF}` },
  );

  await expectOk(
    "race-sb-open",
    asAuth(
      STAFF,
      `INSERT INTO public.beat_rights_reviews (id, beat_id, checksum_sha256, kind, created_by)
       VALUES ('b3000000-0000-4000-8000-000000000001', '${ids.raceSB}', '${H.raceSB}', 'blocked_hash', '${STAFF}');`,
    ),
  );
  await race(
    "race-close-still-holds-then-publish",
    asAuth(
      STAFF,
      `SELECT public.close_beat_rights_review(
         'b3000000-0000-4000-8000-000000000001', 'still_blocked', 'hold'
       );
       SELECT pg_sleep(2);`,
    ),
    asAuth(STAFF, `UPDATE public.beats SET status='PUBLISHED' WHERE id='${ids.raceSB}';`),
    `SELECT status::text FROM public.beats WHERE id='${ids.raceSB}';`,
    { expectB: "RIGHTS_REVIEW_UNRESOLVED", expectState: "APPROVED" },
  );

  await expectOk(
    "race-nm-open",
    asAuth(
      STAFF,
      `INSERT INTO public.beat_rights_reviews (id, beat_id, checksum_sha256, kind, created_by)
       VALUES ('b3000000-0000-4000-8000-000000000002', '${ids.raceNM}', '${H.raceNM}', 'error', '${STAFF}');`,
    ),
  );
  await race(
    "race-close-needs-holds-then-publish",
    asAuth(
      STAFF,
      `SELECT public.close_beat_rights_review(
         'b3000000-0000-4000-8000-000000000002', 'needs_new_master', 'hold'
       );
       SELECT pg_sleep(2);`,
    ),
    asAuth(STAFF, `UPDATE public.beats SET status='PUBLISHED' WHERE id='${ids.raceNM}';`),
    `SELECT status::text FROM public.beats WHERE id='${ids.raceNM}';`,
    { expectB: "RIGHTS_REVIEW_UNRESOLVED", expectState: "APPROVED" },
  );

  await expectOk(
    "race-fb-pending",
    `
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false);
INSERT INTO public.beat_audio_assets (
  id, beat_id, purpose, status, object_key, is_active
) VALUES (
  'c2000000-0000-4000-8000-000000000002', '${ids.raceFB}', 'MASTER', 'PENDING_UPLOAD',
  'platform/race-fb-pending.bin', false
);
`,
  );
  await race(
    "race-block-holds-then-finalize",
    asAuth(
      STAFF,
      `INSERT INTO public.beat_blocked_audio_hashes (checksum_sha256, event_kind, reason, actor_id)
       VALUES ('${sha("race-fb-new")}', 'block', 'A', '${STAFF}');
       SELECT pg_sleep(2);`,
    ),
    asService(
      `SELECT public.finalize_beat_master_asset(
         '${ids.raceFB}', 'c2000000-0000-4000-8000-000000000002', 'PLATFORM', NULL,
         'audio/mpeg', 2000, '${sha("race-fb-new")}', 120, false,
         NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
       );`,
    ),
    `SELECT a.checksum_sha256 FROM public.beat_audio_assets a
     WHERE a.beat_id='${ids.raceFB}' AND a.is_active;`,
    { expectB: "RIGHTS_HASH_BLOCKED", expectState: H.raceFB },
  );

  dump();
  process.exit(results.some((r) => r.status === "FAIL") ? 1 : 0);
}

function dump() {
  console.log("---JSON---");
  console.log(JSON.stringify(results, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
