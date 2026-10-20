/**
 * Rights Safety P0 assertions against the disposable container only.
 * Refuses any other container and any host port 5432.
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";

const CONTAINER = "bitrymdym-rights-p0-disposable-20261020";
const EXPECTED_PREFIX = "711d32b0fd30";
const OWNER = "11111111-1111-4111-8111-111111111111";
const STAFF = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";
const STAFF_OWNER = "44444444-4444-4444-8444-444444444444";

const results = [];

function sha(label) {
  return createHash("sha256").update(label).digest("hex");
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
  results.push({ name, status, detail: detail.replace(/\s+/g, " ").trim().slice(0, 500) });
  console.log(`${status}  ${name}  ${detail.replace(/\s+/g, " ").trim().slice(0, 240)}`);
}

async function expectError(name, sql, token) {
  const res = await psql(sql);
  const blob = `${res.err}\n${res.out}`;
  if (res.code !== 0 && blob.includes(token)) record(name, "PASS", token);
  else record(name, "FAIL", `code=${res.code} token=${token} ${blob}`);
  return blob;
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
  const stateOk = options.expectState ? (check.out || "").includes(options.expectState) : true;
  const ok = a.code === 0 && bOk && check.code === 0 && stateOk && elapsed >= 1500;
  record(name, ok ? "PASS" : "FAIL", blob);
  return { a, b, check, elapsed };
}

async function main() {
  const id = await new Promise((resolve) => {
    const child = spawn("docker", ["inspect", "-f", "{{.Id}} {{.HostConfig.PortBindings}}", CONTAINER], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    child.stdout.on("data", (d) => {
      out += d.toString();
    });
    child.on("close", () => resolve(out.trim()));
  });
  if (!id.startsWith(EXPECTED_PREFIX) || !id.includes("55433") || /:5432/.test(id)) {
    console.log("BLOCKED BY ENVIRONMENT — container identity or port is not the disposable database.");
    console.log(id);
    process.exit(2);
  }
  record("isolation-container", "PASS", id);

  await expectOk(
    "catalog-definer-search-path-seq",
    `
SELECT proname || ' definer=' || prosecdef::text || ' cfg=' || coalesce(proconfig::text,'')
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname = 'assert_beat_publish_rights'
UNION ALL
SELECT proname || ' definer=' || prosecdef::text || ' cfg=' || coalesce(proconfig::text,'')
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname IN (
    'assert_beat_moderation_actor','close_beat_rights_review',
    'lock_beat_rights_checksum','hash_event_blocks_publish'
  )
ORDER BY 1;
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='beat_rights_hash_locks' AND column_name='next_event_seq';
SELECT indexname FROM pg_indexes WHERE indexname='beat_blocked_audio_hashes_event_seq_uidx';
SELECT tgname FROM pg_trigger
WHERE tgname IN (
  'beat_rights_basis_no_update_delete','beat_blocked_audio_hashes_no_update_delete',
  'beat_moderation_decisions_no_update_delete','beat_rights_basis_insert_guard',
  'beat_blocked_audio_hashes_insert_guard','beat_rights_reviews_guard',
  'beats_prevent_privilege_escalation'
)
ORDER BY tgname;
`,
  );

  await expectOk(
    "catalog-execute-grants",
    `
DO $$
BEGIN
  IF has_function_privilege('anon', 'public.assert_beat_publish_rights(uuid,public.beat_status,public.beat_ownership_type)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.assert_beat_publish_rights(uuid,public.beat_status,public.beat_ownership_type)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.close_beat_rights_review(uuid,public.beat_review_close_outcome,text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.close_beat_rights_review(uuid,public.beat_review_close_outcome,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'unexpected execute grants';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    CROSS JOIN LATERAL aclexplode(p.proacl) AS x
    WHERE p.proname = 'assert_beat_publish_rights'
      AND x.grantee = 0
      AND x.privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'PUBLIC still has execute on the publish gate';
  END IF;
END $$;
`,
  );

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
DELETE FROM public.profiles WHERE id IN (
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444'
);
DELETE FROM auth.users WHERE email LIKE '%@disposable.local';
SET session_replication_role = DEFAULT;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon, authenticated, service_role;
`);
  if (reset.code !== 0) {
    record("disposable-reset", "FAIL", reset.err);
    dump();
    process.exit(1);
  }
  record("disposable-reset", "PASS", "truncated only this container before fixtures");

  const seed = await psql(`
INSERT INTO auth.users (id, email) VALUES
  ('${OWNER}', 'rights-owner@disposable.local'),
  ('${STAFF}', 'rights-staff@disposable.local'),
  ('${OTHER}', 'rights-other@disposable.local'),
  ('${STAFF_OWNER}', 'rights-staff-owner@disposable.local');
UPDATE public.profiles SET role = 'ADMIN' WHERE id IN ('${STAFF}', '${STAFF_OWNER}');
`);
  if (seed.code !== 0) {
    record("seed-users", "FAIL", seed.err);
    dump();
    process.exit(1);
  }
  record("seed-users", "PASS", "four disposable profiles");

  const H = {
    happy: sha("happy"),
    noAtt: sha("no-att"),
    badHash: sha("bad-hash"),
    wrongBeat: sha("wrong-beat"),
    noMaster: sha("no-master"),
    badSum: "zzzz",
    blocked: sha("blocked"),
    openRev: sha("open-review"),
    ownerPub: sha("owner-pub"),
    nullOwner: sha("null-owner"),
    republish: sha("republish"),
    still: sha("still"),
    needs: sha("needs"),
    platOk: sha("plat-ok"),
    platNone: sha("plat-none"),
    platOther: sha("plat-other"),
    platHash: sha("plat-hash"),
    platExp: sha("plat-exp"),
    platRev: sha("plat-rev"),
    platMaster: sha("plat-master"),
    platBlock: sha("plat-block"),
    platReview: sha("plat-review"),
    platIns: sha("plat-ins"),
    platUpd: sha("plat-upd"),
    imm: sha("immutable"),
    raceBL: sha("race-bl"),
    raceBB: sha("race-bb"),
    raceLL: sha("race-ll"),
    racePB: sha("race-pb"),
    racePR: sha("race-pr"),
    racePF: sha("race-pf"),
    uniq: sha("uniq"),
  };

  async function beat(id, ownership, owner, status, title) {
    const ownerSql = owner ? `'${owner}'` : "NULL";
    const res = await psql(`
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false);
INSERT INTO public.beats (id, owner_id, ownership_type, title, bpm, duration_seconds, tags, status)
VALUES ('${id}', ${ownerSql}, '${ownership}', '${title}', 90, 120, '{}', '${status}');
SELECT set_config('request.jwt.claims', '', false);
`);
    if (res.code !== 0) record(`fixture-${title}`, "FAIL", res.err);
  }

  async function master(beatId, hash, key) {
    const checksum = hash.length === 64 ? `'${hash}'` : "NULL";
    const res = await psql(`
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false);
INSERT INTO public.beat_audio_assets (
  beat_id, purpose, status, object_key, content_type, byte_size, checksum_sha256, is_active
) VALUES (
  '${beatId}', 'MASTER', 'READY', '${key}', 'audio/mpeg', 1000, ${checksum}, true
);
SELECT set_config('request.jwt.claims', '', false);
`);
    if (res.code !== 0) record(`fixture-master-${key}`, "FAIL", res.err);
  }

  const ids = {
    happy: "10000000-0000-4000-8000-000000000001",
    noAtt: "10000000-0000-4000-8000-000000000002",
    badHash: "10000000-0000-4000-8000-000000000003",
    wrongBeat: "10000000-0000-4000-8000-000000000004",
    noMaster: "10000000-0000-4000-8000-000000000005",
    blocked: "10000000-0000-4000-8000-000000000006",
    openRev: "10000000-0000-4000-8000-000000000007",
    ownerPub: "10000000-0000-4000-8000-000000000008",
    nullOwner: "10000000-0000-4000-8000-000000000009",
    republish: "10000000-0000-4000-8000-000000000010",
    still: "10000000-0000-4000-8000-000000000011",
    needs: "10000000-0000-4000-8000-000000000012",
    platOk: "20000000-0000-4000-8000-000000000001",
    platNone: "20000000-0000-4000-8000-000000000002",
    platOther: "20000000-0000-4000-8000-000000000003",
    platHash: "20000000-0000-4000-8000-000000000004",
    platExp: "20000000-0000-4000-8000-000000000005",
    platRev: "20000000-0000-4000-8000-000000000006",
    platMaster: "20000000-0000-4000-8000-000000000007",
    platBlock: "20000000-0000-4000-8000-000000000008",
    platReview: "20000000-0000-4000-8000-000000000009",
    platIns: "20000000-0000-4000-8000-000000000010",
    platUpd: "20000000-0000-4000-8000-000000000011",
    racePB: "30000000-0000-4000-8000-000000000001",
    racePR: "30000000-0000-4000-8000-000000000002",
    racePF: "30000000-0000-4000-8000-000000000003",
    uniq: "10000000-0000-4000-8000-000000000013",
  };

  await beat(ids.happy, "USER", OWNER, "APPROVED", "happy");
  await beat(ids.noAtt, "USER", OWNER, "APPROVED", "no-att");
  await beat(ids.badHash, "USER", OWNER, "APPROVED", "bad-hash");
  await beat(ids.wrongBeat, "USER", OWNER, "APPROVED", "wrong-beat");
  await beat(ids.noMaster, "USER", OWNER, "APPROVED", "no-master");
  await beat(ids.blocked, "USER", OWNER, "APPROVED", "blocked");
  await beat(ids.openRev, "USER", OWNER, "APPROVED", "open-review");
  await beat(ids.ownerPub, "USER", STAFF_OWNER, "APPROVED", "owner-pub");
  await beat(ids.nullOwner, "USER", OWNER, "APPROVED", "null-owner");
  await beat(ids.republish, "USER", OWNER, "APPROVED", "republish");
  await beat(ids.still, "USER", OWNER, "APPROVED", "still");
  await beat(ids.needs, "USER", OWNER, "APPROVED", "needs");
  await beat(ids.uniq, "USER", OWNER, "APPROVED", "uniq");
  await beat(ids.platOk, "PLATFORM", null, "DRAFT", "plat-ok");
  await beat(ids.platNone, "PLATFORM", null, "DRAFT", "plat-none");
  await beat(ids.platOther, "PLATFORM", null, "DRAFT", "plat-other");
  await beat(ids.platHash, "PLATFORM", null, "DRAFT", "plat-hash");
  await beat(ids.platExp, "PLATFORM", null, "DRAFT", "plat-exp");
  await beat(ids.platRev, "PLATFORM", null, "DRAFT", "plat-rev");
  await beat(ids.platMaster, "PLATFORM", null, "DRAFT", "plat-master");
  await beat(ids.platBlock, "PLATFORM", null, "DRAFT", "plat-block");
  await beat(ids.platReview, "PLATFORM", null, "DRAFT", "plat-review");
  await beat(ids.platUpd, "PLATFORM", null, "DRAFT", "plat-upd");
  await beat(ids.racePB, "USER", OWNER, "APPROVED", "race-pb");
  await beat(ids.racePR, "USER", OWNER, "APPROVED", "race-pr");
  await beat(ids.racePF, "PLATFORM", null, "DRAFT", "race-pf");

  const userKey = (owner, name) => `user/${owner}/${name}.bin`;
  const platKey = (name) => `platform/${name}.bin`;
  await master(ids.happy, H.happy, userKey(OWNER, "happy"));
  await master(ids.noAtt, H.noAtt, userKey(OWNER, "no-att"));
  await master(ids.badHash, "not-a-hash", userKey(OWNER, "bad-hash"));
  await master(ids.wrongBeat, H.wrongBeat, userKey(OWNER, "wrong-beat"));
  await master(ids.blocked, H.blocked, userKey(OWNER, "blocked"));
  await master(ids.openRev, H.openRev, userKey(OWNER, "open-review"));
  await master(ids.ownerPub, H.ownerPub, userKey(STAFF_OWNER, "owner-pub"));
  await master(ids.nullOwner, H.nullOwner, userKey(OWNER, "null-owner"));
  await master(ids.republish, H.republish, userKey(OWNER, "republish"));
  await master(ids.still, H.still, userKey(OWNER, "still"));
  await master(ids.needs, H.needs, userKey(OWNER, "needs"));
  await master(ids.uniq, H.uniq, userKey(OWNER, "uniq"));
  await master(ids.platOk, H.platOk, platKey("plat-ok"));
  await master(ids.platNone, H.platNone, platKey("plat-none"));
  await master(ids.platOther, H.platOther, platKey("plat-other"));
  await master(ids.platHash, H.platHash, platKey("plat-hash"));
  await master(ids.platExp, H.platExp, platKey("plat-exp"));
  await master(ids.platRev, H.platRev, platKey("plat-rev"));
  await master(ids.platBlock, H.platBlock, platKey("plat-block"));
  await master(ids.platReview, H.platReview, platKey("plat-review"));
  await master(ids.platUpd, H.platUpd, platKey("plat-upd"));
  await master(ids.racePB, H.racePB, userKey(OWNER, "race-pb"));
  await master(ids.racePR, H.racePR, userKey(OWNER, "race-pr"));
  await master(ids.racePF, H.racePF, platKey("race-pf"));

  const badMaster = await psql(`
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false);
INSERT INTO public.beat_audio_assets (
  beat_id, purpose, status, object_key, content_type, byte_size, checksum_sha256, is_active
) VALUES (
  '${ids.badHash}', 'MASTER', 'READY', 'bad-hash.bin', 'audio/mpeg', 1000, NULL, true
);
`);
  if (badMaster.code !== 0 && badMaster.err.includes("duplicate")) {
    record("fixture-bad-checksum", "PASS", "null checksum rejected or duplicate; using update");
  }
  await psql(`
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false);
UPDATE public.beat_audio_assets SET checksum_sha256 = 'abc' WHERE beat_id = '${ids.badHash}';
SELECT set_config('request.jwt.claims', '', false);
`);

  function attest(beatId, hash) {
    return asAuth(
      OWNER,
      `INSERT INTO public.beat_rights_basis (beat_id, basis_kind, checksum_sha256, statement_version, actor_id)
       VALUES ('${beatId}', 'user_attestation', '${hash}', 'proposal-2026-10-19', '${OWNER}');`,
    );
  }

  await expectOk("user-attestation-matching", attest(ids.happy, H.happy));
  await expectOk("user-attestation-blocked", attest(ids.blocked, H.blocked));
  await expectOk("user-attestation-open", attest(ids.openRev, H.openRev));
  await expectOk(
    "user-attestation-owner",
    asAuth(
      STAFF_OWNER,
      `INSERT INTO public.beat_rights_basis (beat_id, basis_kind, checksum_sha256, statement_version, actor_id)
       VALUES ('${ids.ownerPub}', 'user_attestation', '${H.ownerPub}', 'proposal-2026-10-19', '${STAFF_OWNER}');`,
    ),
  );
  await expectOk("user-attestation-null", attest(ids.nullOwner, H.nullOwner));
  await expectOk("user-attestation-re", attest(ids.republish, H.republish));
  await expectOk("user-attestation-still", attest(ids.still, H.still));
  await expectOk("user-attestation-needs", attest(ids.needs, H.needs));
  await expectOk("user-attestation-race-pb", attest(ids.racePB, H.racePB));
  await expectOk("user-attestation-race-pr", attest(ids.racePR, H.racePR));
  await expectError(
    "user-attestation-invalid-hash",
    asAuth(
      OWNER,
      `INSERT INTO public.beat_rights_basis (beat_id, basis_kind, checksum_sha256, statement_version, actor_id)
       VALUES ('${ids.badHash}', 'user_attestation', 'abc', 'proposal-2026-10-19', '${OWNER}');`,
    ),
    "RIGHTS_CHECKSUM_INVALID",
  );
  await expectOk("user-attestation-other-beat", attest(ids.wrongBeat, H.happy));

  await expectError(
    "user-publish-without-attestation",
    asAuth(STAFF, `UPDATE public.beats SET status='PUBLISHED' WHERE id='${ids.noAtt}';`),
    "RIGHTS_ATTESTATION_REQUIRED",
  );
  await expectError(
    "user-publish-bad-checksum",
    asAuth(STAFF, `UPDATE public.beats SET status='PUBLISHED' WHERE id='${ids.badHash}';`),
    "RIGHTS_CHECKSUM_INVALID",
  );
  await expectError(
    "user-publish-attestation-other-hash",
    asAuth(STAFF, `UPDATE public.beats SET status='PUBLISHED' WHERE id='${ids.wrongBeat}';`),
    "RIGHTS_ATTESTATION_REQUIRED",
  );
  await expectError(
    "user-publish-no-master",
    asAuth(STAFF, `UPDATE public.beats SET status='PUBLISHED' WHERE id='${ids.noMaster}';`),
    "RIGHTS_MASTER_NOT_READY",
  );

  await expectOk(
    "staff-block-hash",
    asAuth(
      STAFF,
      `INSERT INTO public.beat_blocked_audio_hashes (checksum_sha256, event_kind, reason, actor_id)
       VALUES ('${H.blocked}', 'block', 'fixture block', '${STAFF}');`,
    ),
  );
  await expectError(
    "user-publish-active-block",
    asAuth(STAFF, `UPDATE public.beats SET status='PUBLISHED' WHERE id='${ids.blocked}';`),
    "RIGHTS_HASH_BLOCKED",
  );

  const ownerReview = await psql(
    asAuth(
      OWNER,
      `INSERT INTO public.beat_rights_reviews (id, beat_id, checksum_sha256, kind, created_by)
       VALUES ('51000000-0000-4000-8000-000000000099', '${ids.openRev}', '${H.openRev}', 'not_run', '${OWNER}');`,
    ),
  );
  record(
    "owner-open-review-blocked-by-rls",
    ownerReview.code !== 0 && ownerReview.err.includes("row-level security") ? "RISK" : "FAIL",
    ownerReview.err || ownerReview.out,
  );
  await expectOk(
    "staff-open-review",
    asAuth(
      STAFF,
      `INSERT INTO public.beat_rights_reviews (id, beat_id, checksum_sha256, kind, created_by)
       VALUES ('51000000-0000-4000-8000-000000000099', '${ids.openRev}', '${H.openRev}', 'not_run', '${STAFF}');`,
    ),
  );
  await expectError(
    "user-publish-open-review",
    asAuth(STAFF, `UPDATE public.beats SET status='PUBLISHED' WHERE id='${ids.openRev}';`),
    "RIGHTS_REVIEW_OPEN",
  );
  await expectError(
    "other-user-cannot-close-review",
    asAuth(
      OTHER,
      `SELECT public.close_beat_rights_review(
         '51000000-0000-4000-8000-000000000099', 'dismissed_no_publish', 'no'
       );`,
    ),
    "RIGHTS_ACTOR_REQUIRED",
  );

  await expectError(
    "owner-staff-cannot-publish-own",
    asAuth(STAFF_OWNER, `UPDATE public.beats SET status='PUBLISHED' WHERE id='${ids.ownerPub}';`),
    "RIGHTS_SELF_MODERATION",
  );
  await expectError(
    "service-role-cannot-publish-user",
    asService(`UPDATE public.beats SET status='PUBLISHED' WHERE id='${ids.ownerPub}';`),
    "RIGHTS_ACTOR_REQUIRED",
  );
  await expectError(
    "insert-published-forbidden",
    asService(
      `INSERT INTO public.beats (owner_id, ownership_type, title, bpm, duration_seconds, tags, status)
       VALUES ('${OWNER}', 'USER', 'direct insert', 90, 120, '{}', 'PUBLISHED');`,
    ),
    "RIGHTS_PUBLISH_INSERT_FORBIDDEN",
  );

  await psql(`
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false);
UPDATE public.beats SET owner_id = NULL WHERE id = '${ids.nullOwner}';
SELECT set_config('request.jwt.claims', '', false);
`);
  await expectError(
    "user-null-owner-cannot-republish",
    asAuth(STAFF, `UPDATE public.beats SET status='PUBLISHED' WHERE id='${ids.nullOwner}';`),
    "RIGHTS_ATTESTATION_OWNER_MISSING",
  );

  await expectOk(
    "user-publish-by-other-staff",
    asAuth(STAFF, `UPDATE public.beats SET status='PUBLISHED' WHERE id='${ids.happy}';`),
  );
  const happyState = await psql(
    `SELECT status FROM public.beats WHERE id='${ids.happy}' AND status='PUBLISHED';`,
  );
  record(
    "user-publish-final-state",
    happyState.out.includes("PUBLISHED") ? "PASS" : "FAIL",
    happyState.out || happyState.err,
  );

  await expectOk(
    "user-publish-again-after-published",
    asAuth(STAFF, `UPDATE public.beats SET status='PUBLISHED' WHERE id='${ids.republish}';`),
  );
  await expectError(
    "user-second-publish-not-from-approved",
    asAuth(
      STAFF,
      `UPDATE public.beats SET status='DRAFT' WHERE id='${ids.republish}';
       UPDATE public.beats SET status='PUBLISHED' WHERE id='${ids.republish}';`,
    ),
    "PUBLISHED to DRAFT",
  );

  function license(beatId, hash, extra = "") {
    return asAuth(
      STAFF,
      `INSERT INTO public.beat_rights_basis (
         beat_id, basis_kind, checksum_sha256, statement_version, scope, verifier_id, verified_at, reference, valid_until
       ) VALUES (
         '${beatId}', 'platform_license', '${hash}', 'platform-license-2026-10-19',
         'catalog_publication', '${STAFF}', now(), ${extra || "NULL, NULL"}
       );`,
    );
  }

  await expectOk("platform-license-valid", license(ids.platOk, H.platOk, "NULL, NULL"));
  await expectOk("platform-license-with-reference", license(ids.platUpd, H.platUpd, "'optional-ref', NULL"));
  await expectError(
    "platform-license-already-expired-rejected-on-insert",
    asAuth(
      STAFF,
      `INSERT INTO public.beat_rights_basis (
         beat_id, basis_kind, checksum_sha256, statement_version, scope, verifier_id, verified_at, valid_until
       ) VALUES (
         '${ids.platExp}', 'platform_license', '${H.platExp}', 'platform-license-2026-10-19',
         'catalog_publication', '${STAFF}', now() - interval '2 days', now() - interval '1 day'
       );`,
    ),
    "RIGHTS_LICENSE_EXPIRED",
  );
  await expectOk(
    "platform-license-expires-during-insert",
    asAuth(
      STAFF,
      `INSERT INTO public.beat_rights_basis (
         beat_id, basis_kind, checksum_sha256, statement_version, scope, verifier_id, verified_at, valid_until
       ) VALUES (
         '${ids.platExp}', 'platform_license', '${H.platExp}', 'platform-license-2026-10-19',
         'catalog_publication', '${STAFF}', now(), now() + interval '1 second'
       );
       SELECT pg_sleep(2);`,
    ),
  );
  await expectOk("platform-license-to-revoke", license(ids.platRev, H.platRev, "NULL, NULL"));
  await expectOk("platform-license-other-beat", license(ids.platOther, H.platOk, "NULL, NULL"));
  await expectOk("platform-license-wrong-hash", license(ids.platHash, H.platOk, "NULL, NULL"));
  await expectOk(
    "platform-revoke",
    asAuth(
      STAFF,
      `INSERT INTO public.beat_rights_basis (
         beat_id, basis_kind, checksum_sha256, statement_version, verifier_id, verified_at, revokes_basis_id
       )
       SELECT '${ids.platRev}', 'platform_license_revocation', '${H.platRev}', 'platform-license-2026-10-19',
              '${STAFF}', now(), id
       FROM public.beat_rights_basis
       WHERE beat_id='${ids.platRev}' AND basis_kind='platform_license';`,
    ),
  );

  await expectError(
    "platform-publish-no-license",
    asAuth(STAFF, `UPDATE public.beats SET status='PUBLISHED' WHERE id='${ids.platNone}';`),
    "RIGHTS_LICENSE_REQUIRED",
  );
  await expectError(
    "platform-publish-other-beat-license",
    asAuth(STAFF, `UPDATE public.beats SET status='PUBLISHED' WHERE id='${ids.platHash}';`),
    "RIGHTS_LICENSE_REQUIRED",
  );
  await expectError(
    "platform-publish-expired",
    asAuth(STAFF, `UPDATE public.beats SET status='PUBLISHED' WHERE id='${ids.platExp}';`),
    "RIGHTS_LICENSE_REQUIRED",
  );
  await expectError(
    "platform-publish-revoked",
    asAuth(STAFF, `UPDATE public.beats SET status='PUBLISHED' WHERE id='${ids.platRev}';`),
    "RIGHTS_LICENSE_REQUIRED",
  );
  await expectError(
    "platform-publish-no-master",
    asAuth(STAFF, `UPDATE public.beats SET status='PUBLISHED' WHERE id='${ids.platMaster}';`),
    "RIGHTS_MASTER_NOT_READY",
  );
  await expectOk(
    "platform-block",
    asAuth(
      STAFF,
      `INSERT INTO public.beat_blocked_audio_hashes (checksum_sha256, event_kind, reason, actor_id)
       VALUES ('${H.platBlock}', 'block', 'platform block', '${STAFF}');`,
    ),
  );
  await expectOk("platform-license-blocked", license(ids.platBlock, H.platBlock, "NULL, NULL"));
  await expectError(
    "platform-publish-blocked",
    asAuth(STAFF, `UPDATE public.beats SET status='PUBLISHED' WHERE id='${ids.platBlock}';`),
    "RIGHTS_HASH_BLOCKED",
  );
  await expectOk("platform-license-review", license(ids.platReview, H.platReview, "NULL, NULL"));
  await expectOk(
    "platform-open-review",
    asAuth(
      STAFF,
      `INSERT INTO public.beat_rights_reviews (beat_id, checksum_sha256, kind, created_by)
       VALUES ('${ids.platReview}', '${H.platReview}', 'similar_signal', '${STAFF}');`,
    ),
  );
  await expectError(
    "platform-publish-open-review",
    asAuth(STAFF, `UPDATE public.beats SET status='PUBLISHED' WHERE id='${ids.platReview}';`),
    "RIGHTS_REVIEW_OPEN",
  );
  await expectOk(
    "platform-publish-valid",
    asAuth(STAFF, `UPDATE public.beats SET status='PUBLISHED' WHERE id='${ids.platOk}';`),
  );
  await expectError(
    "platform-insert-published-service",
    asService(
      `INSERT INTO public.beats (owner_id, ownership_type, title, bpm, duration_seconds, tags, status)
       VALUES (NULL, 'PLATFORM', 'direct platform', 90, 120, '{}', 'PUBLISHED');`,
    ),
    "RIGHTS_PUBLISH_INSERT_FORBIDDEN",
  );
  await expectError(
    "platform-update-published-service",
    asService(`UPDATE public.beats SET status='PUBLISHED' WHERE id='${ids.platUpd}';`),
    "RIGHTS_ACTOR_REQUIRED",
  );
  await expectError(
    "service-role-forged-staff-uuid-on-block",
    asService(
      `INSERT INTO public.beat_blocked_audio_hashes (checksum_sha256, event_kind, reason, actor_id)
       VALUES ('${sha("forged")}', 'block', 'forged', '${STAFF}');`,
    ),
    "RIGHTS_HASH_ACTOR_NOT_CALLER",
  );

  await expectOk(
    "hash-event-for-immutability",
    asAuth(
      STAFF,
      `INSERT INTO public.beat_blocked_audio_hashes (checksum_sha256, event_kind, reason, actor_id)
       VALUES ('${H.imm}', 'block', 'keep', '${STAFF}');`,
    ),
  );
  await expectError(
    "hash-history-update-rejected",
    `UPDATE public.beat_blocked_audio_hashes SET reason='changed' WHERE checksum_sha256='${H.imm}';`,
    "RIGHTS_HASH_HISTORY_IMMUTABLE",
  );
  await expectError(
    "hash-history-delete-rejected",
    `DELETE FROM public.beat_blocked_audio_hashes WHERE checksum_sha256='${H.imm}';`,
    "RIGHTS_HASH_HISTORY_IMMUTABLE",
  );
  await expectOk(
    "decision-insert-by-staff",
    asAuth(
      STAFF,
      `INSERT INTO public.beat_moderation_decisions (beat_id, checksum_sha256, actor_id, decision, reason)
       VALUES ('${ids.happy}', '${H.happy}', '${STAFF}', 'dismissed_no_publish', 'keep');`,
    ),
  );
  await expectError(
    "decision-update-rejected",
    `UPDATE public.beat_moderation_decisions SET reason='changed' WHERE beat_id='${ids.happy}';`,
    "RIGHTS_DECISION_IMMUTABLE",
  );
  await expectError(
    "decision-delete-rejected",
    `DELETE FROM public.beat_moderation_decisions WHERE beat_id='${ids.happy}';`,
    "RIGHTS_DECISION_IMMUTABLE",
  );

  await expectOk(
    "open-still-review",
    asAuth(
      STAFF,
      `INSERT INTO public.beat_rights_reviews (id, beat_id, checksum_sha256, kind, created_by)
       VALUES ('51000000-0000-4000-8000-000000000001', '${ids.still}', '${H.still}', 'blocked_hash', '${STAFF}');`,
    ),
  );
  await expectOk(
    "close-still-by-review-id",
    asAuth(
      STAFF,
      `SELECT public.close_beat_rights_review(
         '51000000-0000-4000-8000-000000000001', 'still_blocked', 'stays closed'
       );`,
    ),
  );
  const stillBeat = await psql(`SELECT status::text FROM public.beats WHERE id='${ids.still}';`);
  record(
    "close-does-not-change-beat-status",
    stillBeat.out.includes("APPROVED") ? "PASS" : "FAIL",
    stillBeat.out || stillBeat.err,
  );
  const stillPublish = await psql(
    asAuth(STAFF, `UPDATE public.beats SET status='PUBLISHED' WHERE id='${ids.still}';`),
  );
  record(
    "still-blocked-does-not-keep-publish-closed",
    stillPublish.code === 0 ? "RISK" : "PASS",
    stillPublish.code === 0
      ? "publish succeeded after still_blocked close; outcome is stored but the gate only checks open reviews"
      : stillPublish.err,
  );

  await expectOk(
    "open-needs-review",
    asAuth(
      STAFF,
      `INSERT INTO public.beat_rights_reviews (id, beat_id, checksum_sha256, kind, created_by)
       VALUES ('51000000-0000-4000-8000-000000000002', '${ids.needs}', '${H.needs}', 'error', '${STAFF}');`,
    ),
  );
  await expectOk(
    "close-needs-new-master",
    asAuth(
      STAFF,
      `SELECT public.close_beat_rights_review(
         '51000000-0000-4000-8000-000000000002', 'needs_new_master', 'new master required'
       );`,
    ),
  );
  const needsPublish = await psql(
    asAuth(STAFF, `UPDATE public.beats SET status='PUBLISHED' WHERE id='${ids.needs}';`),
  );
  record(
    "needs-new-master-does-not-keep-publish-closed",
    needsPublish.code === 0 ? "RISK" : "PASS",
    needsPublish.code === 0
      ? "publish succeeded after needs_new_master close"
      : needsPublish.err,
  );

  const dup = await psql(
    `\\set VERBOSITY verbose\n` +
    asAuth(
      STAFF,
      `INSERT INTO public.beat_rights_reviews (beat_id, checksum_sha256, kind, created_by)
       VALUES ('${ids.uniq}', '${H.uniq}', 'not_run', '${STAFF}');
       INSERT INTO public.beat_rights_reviews (beat_id, checksum_sha256, kind, created_by)
       VALUES ('${ids.uniq}', '${H.uniq}', 'not_run', '${STAFF}');`,
    ),
  );
  record(
    "duplicate-open-review-sqlstate-23505",
    dup.code !== 0 && dup.err.includes("23505") ? "PASS" : "FAIL",
    dup.err || dup.out,
  );

  await expectOk(
    "race-seed-block-lift-none",
    `SELECT 1;`,
  );

  await race(
    "race-block-then-lift",
    asAuth(
      STAFF,
      `INSERT INTO public.beat_blocked_audio_hashes (checksum_sha256, event_kind, reason, actor_id)
       VALUES ('${H.raceBL}', 'block', 'session A block', '${STAFF}');
       SELECT pg_sleep(2);`,
    ),
    asAuth(
      STAFF,
      `INSERT INTO public.beat_blocked_audio_hashes (checksum_sha256, event_kind, reason, actor_id)
       VALUES ('${H.raceBL}', 'lift', 'session B lift', '${STAFF}');`,
    ),
    `SELECT string_agg(event_kind::text || ':' || event_seq::text, ',' ORDER BY event_seq)
     FROM public.beat_blocked_audio_hashes WHERE checksum_sha256='${H.raceBL}';`,
    { expectState: "block:1,lift:2" },
  );

  await race(
    "race-two-blocks",
    asAuth(
      STAFF,
      `INSERT INTO public.beat_blocked_audio_hashes (checksum_sha256, event_kind, reason, actor_id)
       VALUES ('${H.raceBB}', 'block', 'session A', '${STAFF}');
       SELECT pg_sleep(2);`,
    ),
    asAuth(
      STAFF,
      `INSERT INTO public.beat_blocked_audio_hashes (checksum_sha256, event_kind, reason, actor_id)
       VALUES ('${H.raceBB}', 'block', 'session B', '${STAFF}');`,
    ),
    `SELECT count(*)::text || ' ' || min(event_seq)::text || ' ' || max(event_seq)::text
     FROM public.beat_blocked_audio_hashes WHERE checksum_sha256='${H.raceBB}';`,
    { expectState: "2 1 2" },
  );

  await expectOk(
    "race-lift-primer",
    asAuth(
      STAFF,
      `INSERT INTO public.beat_blocked_audio_hashes (checksum_sha256, event_kind, reason, actor_id)
       VALUES ('${H.raceLL}', 'block', 'primer', '${STAFF}');`,
    ),
  );
  await race(
    "race-two-lifts",
    asAuth(
      STAFF,
      `INSERT INTO public.beat_blocked_audio_hashes (checksum_sha256, event_kind, reason, actor_id)
       VALUES ('${H.raceLL}', 'lift', 'session A lift', '${STAFF}');
       SELECT pg_sleep(2);`,
    ),
    asAuth(
      STAFF,
      `INSERT INTO public.beat_blocked_audio_hashes (checksum_sha256, event_kind, reason, actor_id)
       VALUES ('${H.raceLL}', 'lift', 'session B lift', '${STAFF}');`,
    ),
    `SELECT count(*) FILTER (WHERE event_kind='lift')::text || ' ' ||
            (max(event_seq) - min(event_seq))::text
     FROM public.beat_blocked_audio_hashes WHERE checksum_sha256='${H.raceLL}';`,
    { expectState: "2 2" },
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
       VALUES ('${H.racePB}', 'block', 'after publish', '${STAFF}');`,
    ),
    `SELECT b.status::text || ' ' || e.event_kind::text || ':' || e.event_seq::text
     FROM public.beats b
     JOIN public.beat_blocked_audio_hashes e ON e.checksum_sha256='${H.racePB}'
     WHERE b.id='${ids.racePB}';`,
    { expectState: "PUBLISHED block:1" },
  );

  await race(
    "race-review-holds-then-publish-fails",
    asAuth(
      STAFF,
      `INSERT INTO public.beat_rights_reviews (beat_id, checksum_sha256, kind, created_by)
       VALUES ('${ids.racePR}', '${H.racePR}', 'not_run', '${STAFF}');
       SELECT pg_sleep(2);`,
    ),
    asAuth(STAFF, `UPDATE public.beats SET status='PUBLISHED' WHERE id='${ids.racePR}';`),
    `SELECT status::text FROM public.beats WHERE id='${ids.racePR}';`,
    { expectB: "RIGHTS_REVIEW_OPEN", expectState: "APPROVED" },
  );

  await expectOk(
    "race-finalize-pending-asset",
    `
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false);
INSERT INTO public.beat_audio_assets (
  id, beat_id, purpose, status, object_key, is_active
) VALUES (
  '61000000-0000-4000-8000-000000000001', '${ids.racePF}', 'MASTER', 'PENDING_UPLOAD', 'platform/race-pf-pending.bin', false
);
SELECT set_config('request.jwt.claims', '', false);
`,
  );
  await expectOk("platform-license-race-finalize", license(ids.racePF, H.racePF, "NULL, NULL"));
  const fin = await race(
    "race-publish-holds-then-finalize",
    asAuth(
      STAFF,
      `UPDATE public.beats SET status='PUBLISHED' WHERE id='${ids.racePF}';
       SELECT pg_sleep(2);`,
    ),
    asService(
      `SELECT public.finalize_beat_master_asset(
         '${ids.racePF}', '61000000-0000-4000-8000-000000000001', 'PLATFORM', NULL,
         'audio/mpeg', 2000, '${sha("race-pf-new")}', 120, false,
         NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
       );`,
    ),
    `SELECT b.status::text || ' ' || a.checksum_sha256
     FROM public.beats b
     JOIN public.beat_audio_assets a ON a.beat_id=b.id AND a.is_active AND a.purpose='MASTER'
     WHERE b.id='${ids.racePF}';`,
  );
  const swapped = (fin.check.out || "").includes(sha("race-pf-new"));
  record(
    "finalize-after-publish-can-swap-master",
    swapped ? "RISK" : "PASS",
    swapped
      ? "PLATFORM finalize after a committed publish replaced the master checksum"
      : fin.check.out || fin.b.err,
  );

  dump();
  const failed = results.some((r) => r.status === "FAIL");
  process.exit(failed ? 1 : 0);
}

function dump() {
  console.log("---JSON---");
  console.log(JSON.stringify(results, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
