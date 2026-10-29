/**
 * Premium Retention pre-deploy gate — REAL PostgreSQL 17 (throwaway local cluster).
 *
 * Run (from repo root):  node --test scripts/premium-retention-pg-gate/
 * Prerequisite: BRD_PG_GATE_DEPS (default %TEMP%\brd-pg-gate) with embedded-postgres + pg.
 *
 * Emulates PostgREST exactly at the DB boundary: connect as `authenticator`, then per
 * transaction `SET LOCAL ROLE <role>` + `request.jwt.claims`. Not covered here: PostgREST,
 * GoTrue JWT verification, Storage API (they are not part of this harness).
 * Seeding and lease reset use `postgres` (platform admin, outside G3-TCB per D-ADMIN).
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, afterEach, before, describe, it } from "node:test";

import { client, startGateServer } from "./pg-gate-server.mjs";

const WORKER = "premium_retention_worker";
const BUCKET = "audio-artifacts";
const TTL = 120;
const T = { timeout: 30_000 };

let server;
let admin;
const pools = [];

before(async () => {
  server = await startGateServer({ port: Number(process.env.BRD_PG_GATE_PORT ?? 55432) });
  admin = await connect("postgres");
  const { rows } = await admin.query(
    "SELECT current_database() AS db, inet_server_addr()::text AS addr, version() AS v",
  );
  assert.equal(rows[0].db, "brd_gate");
  assert.match(rows[0].addr, /^127\.0\.0\.1/);
  console.log(`# engine: ${rows[0].v}`);
  console.log(`# migrations applied: ${server.applied.length}`);
});

after(async () => {
  for (const c of pools) await c.end().catch(() => {});
  server?.stop();
});

async function connect(user) {
  const c = client(server.port, user);
  c.on("error", () => {});
  await c.connect();
  pools.push(c);
  return c;
}

/** PostgREST-shaped transaction: SET LOCAL ROLE + request.jwt.claims. */
async function asRole(c, role, fn, { commit = true } = {}) {
  await c.query("BEGIN");
  try {
    await c.query(`SET LOCAL ROLE ${role}`);
    await c.query("SELECT set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ role }),
    ]);
    const out = await fn(c);
    await c.query(commit ? "COMMIT" : "ROLLBACK");
    return out;
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  }
}

async function rejects(promise, code, messageRe) {
  try {
    await promise;
  } catch (e) {
    assert.equal(e.code, code, `expected SQLSTATE ${code}, got ${e.code}: ${e.message}`);
    if (messageRe) assert.match(e.message, messageRe);
    return e;
  }
  assert.fail(`expected SQLSTATE ${code}, but statement succeeded`);
}

async function adminTx(sql, params = []) {
  await admin.query("BEGIN");
  try {
    await admin.query("SELECT set_config('request.jwt.claims', '{\"role\":\"service_role\"}', true)");
    const r = await admin.query(sql, params);
    await admin.query("COMMIT");
    return r;
  } catch (e) {
    await admin.query("ROLLBACK");
    throw e;
  }
}

async function resetLease() {
  await adminTx(`UPDATE public.premium_retention_scheduler_lease
    SET holder_run_id = NULL, lease_expires_at = NULL, acquired_at = NULL, heartbeat_at = NULL
    WHERE lock_key = 'premium_retention_cleanup'`);
}

async function expireLease() {
  await adminTx(`UPDATE public.premium_retention_scheduler_lease
    SET lease_expires_at = clock_timestamp() - interval '1 second'
    WHERE lock_key = 'premium_retention_cleanup'`);
}

async function seedWork({ due = true, artifacts = 2, objects = true, premium = true } = {}) {
  const ownerId = randomUUID();
  const projectId = randomUUID();
  const tag = ownerId.slice(0, 8);
  await adminTx(
    `INSERT INTO auth.users (id, email) VALUES ($1, $2)`,
    [ownerId, `gate-${tag}@local.test`],
  );
  await adminTx(
    `INSERT INTO public.studio_projects (id, owner_id, title, status, document_version)
     VALUES ($1, $2, 'gate', 'ACTIVE', 1)`,
    [projectId, ownerId],
  );
  if (premium) {
    await adminTx(
      `SELECT public.premium_mark_work_ready($1, 'STUDIO_PROJECT', $2, now() - interval '8 days', 7)`,
      [ownerId, projectId],
    );
  }
  if (premium && !due) {
    await adminTx(
      `UPDATE public.premium_works SET retention_expires_at = now() + interval '3 days'
       WHERE owner_id = $1 AND domain_ref = $2`,
      [ownerId, projectId],
    );
  }
  const { rows: w } = await admin.query(
    "SELECT id FROM public.premium_works WHERE owner_id = $1 AND domain_ref = $2",
    [ownerId, projectId],
  );
  const artifactIds = [];
  const keys = [];
  for (let i = 0; i < artifacts; i += 1) {
    const r = await insertArtifact(ownerId, projectId, `gate/${tag}/a${i}.mp3`);
    artifactIds.push(r.id);
    keys.push(r.key);
  }
  if (objects) {
    for (const key of keys) {
      await admin.query(
        "INSERT INTO storage.objects (bucket_id, name, owner) VALUES ($1, $2, $3)",
        [BUCKET, key, ownerId],
      );
    }
  }
  return { ownerId, projectId, workId: w[0]?.id ?? null, artifactIds, keys };
}

async function insertArtifact(ownerId, projectId, key) {
  const jobId = randomUUID();
  await adminTx(
    `INSERT INTO public.render_jobs (
       id, owner_id, requested_tier, idempotency_key, status, kind, project_id,
       entitlement_snapshot, document_snapshot, finished_at)
     VALUES ($1, $2, 'BASIC_MP3', $3, 'SUCCEEDED', 'STUDIO_EXPORT', $4, '{}'::jsonb, '{}'::jsonb, now())`,
    [jobId, ownerId, `gate-${jobId}`, projectId],
  );
  const { rows } = await adminTx(
    `INSERT INTO public.audio_artifacts (
       owner_id, render_job_id, format, quality_tier, storage_bucket, object_key,
       byte_size, duration_ms, status, expires_at, project_id)
     VALUES ($1, $2, 'audio/mpeg', 'BASIC_MP3', $3, $4, 12, 1000, 'READY', now() + interval '1 day', $5)
     RETURNING id`,
    [ownerId, jobId, BUCKET, key, projectId],
  );
  return { id: rows[0].id, key };
}

async function artifact(id) {
  const { rows } = await admin.query(
    "SELECT id, status, deleted_at, project_id FROM public.audio_artifacts WHERE id = $1",
    [id],
  );
  return rows[0];
}

const acquire = (c, runId, ttl = TTL) =>
  asRole(c, WORKER, async (cc) =>
    (await cc.query("SELECT * FROM public.premium_retention_lease_acquire($1, $2)", [runId, ttl]))
      .rows[0]);

const softDeleteSql =
  "SELECT * FROM public.premium_retention_soft_delete_artifact_if_lease($1, $2, $3, $4)";

const softDelete = (c, { workId, artifactId, runId, token }) =>
  asRole(c, WORKER, async (cc) =>
    (await cc.query(softDeleteSql, [workId, artifactId, runId, token])).rows[0]);

async function backendPid(c) {
  return (await c.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
}

/** Waits until `pid` is blocked by `blockerPid` (pg_stat_activity wait fields need pg_read_all_stats). */
async function waitUntilBlocked(pid, blockerPid) {
  for (let i = 0; i < 200; i += 1) {
    const { rows } = await admin.query(
      "SELECT $2::int = ANY(pg_blocking_pids($1)) AS b",
      [pid, blockerPid],
    );
    if (rows[0].b) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  assert.fail(`backend ${pid} never blocked on backend ${blockerPid}`);
}

// ---------------------------------------------------------------------------
describe("D1 roles, membership, GRANT/REVOKE (catalog)", () => {
  it("worker role attributes: NOLOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT NOCREATEROLE NOCREATEDB NOREPLICATION", T, async () => {
    const { rows } = await admin.query("SELECT * FROM pg_roles WHERE rolname = $1", [WORKER]);
    assert.equal(rows.length, 1);
    const r = rows[0];
    assert.deepEqual(
      [r.rolcanlogin, r.rolsuper, r.rolbypassrls, r.rolinherit, r.rolcreaterole, r.rolcreatedb, r.rolreplication],
      [false, false, false, false, false, false, false],
    );
  });

  it("only authenticator can assume the worker role; worker is a member of nothing", T, async () => {
    const { rows: members } = await admin.query(
      `SELECT m.rolname FROM pg_auth_members am
       JOIN pg_roles r ON r.oid = am.roleid JOIN pg_roles m ON m.oid = am.member
       WHERE r.rolname = $1 ORDER BY 1`,
      [WORKER],
    );
    assert.deepEqual(members.map((x) => x.rolname).filter((n) => n !== "postgres"), ["authenticator"]);
    const { rows: of } = await admin.query(
      `SELECT r.rolname FROM pg_auth_members am
       JOIN pg_roles r ON r.oid = am.roleid JOIN pg_roles m ON m.oid = am.member
       WHERE m.rolname = $1`,
      [WORKER],
    );
    assert.deepEqual(of, []);
    for (const role of ["anon", "authenticated", "service_role"]) {
      const { rows } = await admin.query("SELECT pg_has_role($1, $2, 'MEMBER') AS m", [role, WORKER]);
      assert.equal(rows[0].m, false, `${role} must not be a member of ${WORKER}`);
    }
  });

  it("worker holds no DML on premium tables, lease, audio_artifacts", T, async () => {
    for (const t of [
      "premium_works", "premium_unlock_events", "premium_track_unlocks",
      "premium_retention_scheduler_lease", "audio_artifacts",
    ]) {
      for (const p of ["INSERT", "UPDATE", "DELETE", "TRUNCATE"]) {
        const { rows } = await admin.query("SELECT has_table_privilege($1, $2, $3) AS h", [WORKER, `public.${t}`, p]);
        assert.equal(rows[0].h, false, `${WORKER} ${p} ${t}`);
      }
    }
  });

  it("service_role holds only SELECT on premium_works / premium_unlock_events / lease, no TRUNCATE on audio_artifacts", T, async () => {
    for (const t of ["premium_works", "premium_unlock_events", "premium_retention_scheduler_lease"]) {
      const { rows: s } = await admin.query("SELECT has_table_privilege('service_role', $1, 'SELECT') AS h", [`public.${t}`]);
      assert.equal(s[0].h, true, `service_role SELECT ${t}`);
      for (const p of ["INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER", "MAINTAIN"]) {
        const { rows } = await admin.query("SELECT has_table_privilege('service_role', $1, $2) AS h", [`public.${t}`, p]);
        assert.equal(rows[0].h, false, `service_role ${p} ${t}`);
      }
    }
    const { rows } = await admin.query("SELECT has_table_privilege('service_role', 'public.audio_artifacts', 'TRUNCATE') AS h");
    assert.equal(rows[0].h, false);
  });

  it("RESIDUAL (recorded, not a pass): service_role keeps UPDATE/DELETE on audio_artifacts", T, async () => {
    const { rows } = await admin.query(
      `SELECT has_table_privilege('service_role', 'public.audio_artifacts', 'UPDATE') AS u,
              has_table_privilege('service_role', 'public.audio_artifacts', 'DELETE') AS d`,
    );
    assert.deepEqual(rows[0], { u: true, d: true });
  });

  it("anon / authenticated cannot EXECUTE any retention/lease/L2/fenced function; worker can EXECUTE exactly the fenced set", T, async () => {
    const { rows } = await admin.query(
      `SELECT p.oid::regprocedure::text AS sig, p.proname
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname LIKE 'premium_retention%'`,
    );
    assert.ok(rows.length >= 9);
    for (const { sig } of rows) {
      for (const role of ["anon", "authenticated"]) {
        const { rows: h } = await admin.query("SELECT has_function_privilege($1, $2, 'EXECUTE') AS h", [role, sig]);
        assert.equal(h[0].h, false, `${role} EXECUTE ${sig}`);
      }
    }
    const allowed = new Set([
      "premium_retention_lease_acquire", "premium_retention_lease_renew", "premium_retention_lease_release",
      "premium_retention_lease_get", "premium_retention_mark_expired_if_lease",
      "premium_retention_soft_delete_artifact_if_lease", "premium_retention_artifact_is_linked",
      "premium_retention_object_is_purgeable",
    ]);
    for (const { sig, proname } of rows) {
      const { rows: h } = await admin.query("SELECT has_function_privilege($1, $2, 'EXECUTE') AS h", [WORKER, sig]);
      assert.equal(h[0].h, allowed.has(proname), `${WORKER} EXECUTE ${sig}`);
    }
    for (const fn of [
      "premium_retention_lease_acquire", "premium_retention_lease_renew", "premium_retention_lease_release",
      "premium_retention_mark_expired_if_lease", "premium_retention_soft_delete_artifact_if_lease",
    ]) {
      const { sig } = rows.find((r) => r.proname === fn);
      const { rows: h } = await admin.query("SELECT has_function_privilege('service_role', $1, 'EXECUTE') AS h", [sig]);
      assert.equal(h[0].h, false, `service_role EXECUTE ${sig}`);
    }
    for (const sig of [
      "public.premium_unlock_work(uuid,uuid,text,integer,timestamp with time zone,timestamp with time zone,integer)",
      "public.premium_mark_work_ready(uuid,text,uuid,timestamp with time zone,integer)",
    ]) {
      for (const role of [WORKER, "anon", "authenticated"]) {
        const { rows: h } = await admin.query("SELECT has_function_privilege($1, $2, 'EXECUTE') AS h", [role, sig]);
        assert.equal(h[0].h, false, `${role} EXECUTE ${sig}`);
      }
    }
  });

  it("SECURITY DEFINER retention functions pin search_path = pg_catalog, public, pg_temp; all premium ones are owned by postgres", T, async () => {
    const { rows } = await admin.query(
      `SELECT p.oid::regprocedure::text AS sig, p.proconfig, pg_get_userbyid(p.proowner) AS owner
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.prosecdef
         AND (p.proname LIKE 'premium_%' OR p.proname IN (
           'prevent_audio_artifact_privilege_escalation', 'prevent_premium_works_privilege_escalation',
           'prevent_premium_unlock_events_privilege_escalation',
           'prevent_premium_retention_scheduler_lease_privilege_escalation'))`,
    );
    assert.ok(rows.length > 0);
    const loose = [];
    for (const r of rows) {
      const sp = (r.proconfig ?? []).find((c) => c.startsWith("search_path="));
      assert.ok(sp, `${r.sig} has no pinned search_path`);
      assert.equal(r.owner, "postgres", r.sig);
      if (/premium_retention|audio_artifact|premium_works_|premium_unlock_events_/.test(r.sig)) {
        assert.equal(sp, "search_path=pg_catalog, public, pg_temp", r.sig);
      } else if (sp !== "search_path=pg_catalog, public, pg_temp") {
        loose.push(`${r.sig} ${sp}`);
      }
    }
    console.log(`# RESIDUAL pre-existing SECURITY DEFINER with looser search_path: ${JSON.stringify(loose)}`);
  });
});

// ---------------------------------------------------------------------------
describe("D2 RLS and direct DML as PostgREST-shaped roles", () => {
  let auth;
  let seed;
  let foreign;
  before(async () => {
    auth = await connect("authenticator");
    seed = await seedWork();
    foreign = await seedWork({ premium: false });
  });

  it("worker sees premium works and only premium-linked artifacts", T, async () => {
    const seen = await asRole(auth, WORKER, async (c) => (await c.query(
      "SELECT id FROM public.audio_artifacts WHERE id = ANY($1)",
      [[...seed.artifactIds, ...foreign.artifactIds]],
    )).rows.map((r) => r.id).sort());
    assert.deepEqual(seen, [...seed.artifactIds].sort());
    const works = await asRole(auth, WORKER, async (c) =>
      (await c.query("SELECT count(*)::int AS n FROM public.premium_works WHERE id = $1", [seed.workId])).rows[0].n);
    assert.equal(works, 1);
  });

  it("worker direct DML is denied by privileges (42501), even with the fence GUC set", T, async () => {
    const id = seed.artifactIds[0];
    await rejects(asRole(auth, WORKER, (c) => c.query(
      "UPDATE public.premium_works SET status = 'EXPIRED' WHERE id = $1", [seed.workId])), "42501");
    await rejects(asRole(auth, WORKER, async (c) => {
      await c.query("SELECT set_config('brd.premium_retention_fenced_artifact', $1, true)", [id]);
      return c.query("UPDATE public.audio_artifacts SET deleted_at = now(), status = 'DELETED' WHERE id = $1", [id]);
    }), "42501");
    await rejects(asRole(auth, WORKER, (c) => c.query("DELETE FROM public.audio_artifacts WHERE id = $1", [id])), "42501");
    await rejects(asRole(auth, WORKER, (c) => c.query(
      "UPDATE public.premium_retention_scheduler_lease SET fencing_token = fencing_token + 100")), "42501");
    await rejects(asRole(auth, WORKER, (c) => c.query(
      "INSERT INTO public.premium_unlock_events (user_id) VALUES ($1)", [seed.ownerId])), "42501");
    assert.equal((await artifact(id)).deleted_at, null);
  });

  it("service_role direct DML on premium_works / unlock events / lease is denied (42501)", T, async () => {
    await rejects(asRole(auth, "service_role", (c) => c.query(
      "UPDATE public.premium_works SET status = 'EXPIRED' WHERE id = $1", [seed.workId])), "42501");
    await rejects(asRole(auth, "service_role", (c) => c.query(
      "DELETE FROM public.premium_works WHERE id = $1", [seed.workId])), "42501");
    await rejects(asRole(auth, "service_role", (c) => c.query(
      "INSERT INTO public.premium_unlock_events (user_id) VALUES ($1)", [seed.ownerId])), "42501");
    await rejects(asRole(auth, "service_role", (c) => c.query(
      "UPDATE public.premium_retention_scheduler_lease SET fencing_token = 0")), "42501");
    await rejects(asRole(auth, "service_role", (c) => c.query("TRUNCATE public.audio_artifacts")), "42501");
  });

  it("service_role unfenced soft-delete / status DELETED / undo / relink of a premium-linked artifact is rejected (P0001)", T, async () => {
    const id = seed.artifactIds[0];
    await rejects(asRole(auth, "service_role", (c) => c.query(
      "UPDATE public.audio_artifacts SET deleted_at = now() WHERE id = $1", [id])), "P0001", /requires premium_retention_soft_delete/);
    await rejects(asRole(auth, "service_role", (c) => c.query(
      "UPDATE public.audio_artifacts SET status = 'DELETED' WHERE id = $1", [id])), "P0001", /requires premium_retention_soft_delete/);
    await rejects(asRole(auth, "service_role", (c) => c.query(
      "UPDATE public.audio_artifacts SET project_id = $2 WHERE id = $1", [id, foreign.projectId])), "P0001", /linkage is immutable/);
    assert.equal((await artifact(id)).deleted_at, null);
  });

  it("service_role cannot link a foreign artifact into a premium work or move a linked artifact's storage location (P0001)", T, async () => {
    const stray = foreign.artifactIds[0];
    await rejects(asRole(auth, "service_role", (c) => c.query(
      "UPDATE public.audio_artifacts SET owner_id = $2, project_id = $3 WHERE id = $1",
      [stray, seed.ownerId, seed.projectId])), "P0001", /linkage is immutable/);
    const id = seed.artifactIds[1];
    await rejects(asRole(auth, "service_role", (c) => c.query(
      "UPDATE public.audio_artifacts SET object_key = $2 WHERE id = $1", [id, foreign.keys[0]])), "P0001", /storage location is immutable/);
    // Unlinked artifacts keep their ordinary update path.
    await asRole(auth, "service_role", (c) => c.query(
      "UPDATE public.audio_artifacts SET object_key = object_key WHERE id = $1", [stray]));
  });

  it("role / claim mismatch is rejected: worker role with another claim, or no claim at all (P0001)", T, async () => {
    const call = (c) => c.query(softDeleteSql, [seed.workId, seed.artifactIds[0], randomUUID(), 1]);
    await rejects((async () => {
      await auth.query("BEGIN");
      try {
        await auth.query(`SET LOCAL ROLE ${WORKER}`);
        await auth.query("SELECT set_config('request.jwt.claims', '{\"role\":\"authenticated\"}', true)");
        return await call(auth);
      } finally {
        await auth.query("ROLLBACK");
      }
    })(), "P0001", /Only service_role or premium_retention_worker may call/);
    await rejects((async () => {
      await auth.query("BEGIN");
      try {
        await auth.query(`SET LOCAL ROLE ${WORKER}`);
        return await call(auth);
      } finally {
        await auth.query("ROLLBACK");
      }
    })(), "P0001", /Only service_role or premium_retention_worker may call/);
    assert.equal((await artifact(seed.artifactIds[0])).deleted_at, null);
  });

  it("RESIDUAL (recorded, D-ADMIN): any raw SQL session with UPDATE can forge the fence GUC (PostgREST API exposure not tested here)", T, async () => {
    const extra = await insertArtifact(seed.ownerId, seed.projectId, `gate/${seed.ownerId.slice(0, 8)}/forged.mp3`);
    await admin.query("BEGIN");
    try {
      await admin.query("SELECT set_config('request.jwt.claims', '{\"role\":\"service_role\"}', true)");
      await admin.query("SELECT set_config('brd.premium_retention_fenced_artifact', $1, true)", [extra.id]);
      const r = await admin.query(
        "UPDATE public.audio_artifacts SET deleted_at = now(), status = 'DELETED' WHERE id = $1", [extra.id]);
      assert.equal(r.rowCount, 1);
    } finally {
      await admin.query("ROLLBACK");
    }
    assert.equal((await artifact(extra.id)).deleted_at, null);
  });

  it("anon / authenticated cannot call the fenced RPC (42501)", T, async () => {
    for (const role of ["anon", "authenticated"]) {
      await rejects(asRole(auth, role, (c) => c.query(softDeleteSql,
        [seed.workId, seed.artifactIds[0], randomUUID(), 1])), "42501");
    }
  });

  it("RESIDUAL (recorded, not a pass): service_role can still hard-DELETE and set status EXPIRED on a premium-linked artifact", T, async () => {
    const extra = await insertArtifact(seed.ownerId, seed.projectId, `gate/${seed.ownerId.slice(0, 8)}/residual.mp3`);
    await asRole(auth, "service_role", (c) => c.query(
      "UPDATE public.audio_artifacts SET status = 'EXPIRED' WHERE id = $1", [extra.id]));
    assert.equal((await artifact(extra.id)).status, "EXPIRED");
    const del = await asRole(auth, "service_role", (c) => c.query(
      "DELETE FROM public.audio_artifacts WHERE id = $1", [extra.id]));
    assert.equal(del.rowCount, 1);
  });

  it("CONFLICT (recorded, pre-existing): deleting a user with a premium work is blocked by append-only premium_unlock_events", T, async () => {
    const s = await seedWork({ artifacts: 0, objects: false });
    const { rows } = await admin.query(
      "SELECT count(*)::int AS n FROM public.premium_unlock_events WHERE work_id = $1", [s.workId]);
    assert.ok(rows[0].n >= 1, "seed must produce an unlock event");
    await rejects(adminTx("DELETE FROM auth.users WHERE id = $1", [s.ownerId]), "P0001", /append-only/);
    // GoTrue deletes without a service_role claim: rejected by the same trigger earlier.
    await rejects(admin.query("DELETE FROM auth.users WHERE id = $1", [s.ownerId]), "P0001", /Only service_role may mutate/);
    await rejects(adminTx("DELETE FROM public.premium_works WHERE id = $1", [s.workId]), "P0001", /append-only/);
  });
});

// ---------------------------------------------------------------------------
describe("D3 fenced soft-delete RPC and trigger", () => {
  let w;
  let auth;
  before(async () => {
    w = await connect("authenticator");
    auth = await connect("authenticator");
  });

  it("current generation soft-deletes; repeat is idempotent (ALREADY_DELETED); undo is rejected", T, async () => {
    await resetLease();
    const s = await seedWork();
    const runId = randomUUID();
    const a = await acquire(w, runId);
    assert.equal(a.reason, "ACQUIRED");
    const fence = { workId: s.workId, artifactId: s.artifactIds[0], runId, token: a.fencing_token };
    const r1 = await softDelete(w, fence);
    assert.deepEqual([r1.ok, r1.reason], [true, "SOFT_DELETED"]);
    const row = await artifact(s.artifactIds[0]);
    assert.equal(row.status, "DELETED");
    assert.notEqual(row.deleted_at, null);
    const r2 = await softDelete(w, fence);
    assert.deepEqual([r2.ok, r2.reason], [true, "ALREADY_DELETED"]);
    assert.equal((await artifact(s.artifactIds[1])).deleted_at, null, "sibling untouched");
    await rejects(asRole(auth, "service_role", (c) => c.query(
      "UPDATE public.audio_artifacts SET deleted_at = NULL, status = 'READY' WHERE id = $1", [s.artifactIds[0]])),
    "P0001", /irreversible/);
    await rejects(asRole(auth, "service_role", (c) => c.query(
      "UPDATE public.audio_artifacts SET status = 'READY' WHERE id = $1", [s.artifactIds[0]])),
    "P0001", /irreversible/);
  });

  it("fence GUC does not leak past the RPC inside the same transaction", T, async () => {
    await resetLease();
    const s = await seedWork();
    const runId = randomUUID();
    const a = await acquire(w, runId);
    await asRole(w, WORKER, async (c) => {
      const r = (await c.query(softDeleteSql, [s.workId, s.artifactIds[0], runId, a.fencing_token])).rows[0];
      assert.equal(r.reason, "SOFT_DELETED");
      const g = (await c.query("SELECT current_setting('brd.premium_retention_fenced_artifact', true) AS g")).rows[0].g;
      assert.equal(g, "");
    });
    await rejects(asRole(auth, "service_role", (c) => c.query(
      "UPDATE public.audio_artifacts SET deleted_at = now() WHERE id = $1", [s.artifactIds[1]])),
    "P0001", /requires premium_retention_soft_delete/);
  });

  it("search_path hijack with a pg_temp shadow table does not redirect the RPC", T, async () => {
    await resetLease();
    const s = await seedWork();
    const runId = randomUUID();
    const a = await acquire(w, runId);
    await asRole(w, WORKER, async (c) => {
      await c.query("CREATE TEMP TABLE audio_artifacts (LIKE public.audio_artifacts) ON COMMIT DROP");
      await c.query("CREATE TEMP TABLE premium_works (LIKE public.premium_works) ON COMMIT DROP");
      await c.query("SET LOCAL search_path = pg_temp, public");
      const r = (await c.query(softDeleteSql, [s.workId, s.artifactIds[0], runId, a.fencing_token])).rows[0];
      assert.equal(r.reason, "SOFT_DELETED");
      assert.equal((await c.query("SELECT count(*)::int AS n FROM pg_temp.audio_artifacts")).rows[0].n, 0);
    });
    assert.equal((await artifact(s.artifactIds[0])).status, "DELETED");
  });

  it("L2 expires a work exactly once (one EXPIRE_WORK event), then ALREADY_EXPIRED", T, async () => {
    await resetLease();
    const s = await seedWork({ artifacts: 0, objects: false });
    const runId = randomUUID();
    const a = await acquire(w, runId);
    const l2 = () => asRole(w, WORKER, async (c) => (await c.query(
      "SELECT * FROM public.premium_retention_mark_expired_if_lease($1, $2, $3)", [s.workId, runId, a.fencing_token])).rows[0]);
    const first = await l2();
    assert.equal(first.reason, "MARKED_EXPIRED");
    const second = await l2();
    assert.equal(second.reason, "ALREADY_EXPIRED");
    const { rows } = await admin.query(
      "SELECT count(*)::int AS n FROM public.premium_unlock_events WHERE work_id = $1 AND event_type = 'EXPIRE_WORK'", [s.workId]);
    assert.equal(rows[0].n, 1);
  });

  it("not found / not linked / NULL linkage / not due / not WORK_READY are rejected without effect", T, async () => {
    await resetLease();
    const s = await seedWork();
    const other = await seedWork();
    const notDue = await seedWork({ due: false });
    const runId = randomUUID();
    const a = await acquire(w, runId);
    const base = { runId, token: a.fencing_token };
    assert.equal((await softDelete(w, { ...base, workId: s.workId, artifactId: randomUUID() })).reason, "ARTIFACT_NOT_FOUND");
    assert.equal((await softDelete(w, { ...base, workId: s.workId, artifactId: other.artifactIds[0] })).reason, "ARTIFACT_NOT_LINKED");
    assert.equal((await artifact(other.artifactIds[0])).deleted_at, null);
    assert.equal((await softDelete(w, { ...base, workId: notDue.workId, artifactId: notDue.artifactIds[0] })).reason, "RETENTION_NOT_DUE");
    assert.equal((await artifact(notDue.artifactIds[0])).deleted_at, null);
    assert.equal((await softDelete(w, { ...base, workId: randomUUID(), artifactId: s.artifactIds[0] })).reason, "WORK_NOT_FOUND");
    const { rows } = await admin.query(
      "SELECT public.premium_retention_links($1, 'STUDIO_PROJECT', $2, $1, NULL, NULL) AS l",
      [s.ownerId, s.projectId],
    );
    assert.equal(rows[0].l, false, "NULL linkage must be false, not NULL");
    const l2 = await asRole(w, WORKER, async (c) => (await c.query(
      "SELECT * FROM public.premium_retention_mark_expired_if_lease($1, $2, $3)", [s.workId, runId, a.fencing_token])).rows[0]);
    assert.equal(l2.ok, true);
    assert.equal((await softDelete(w, { ...base, workId: s.workId, artifactId: s.artifactIds[0] })).reason, "NOT_WORK_READY");
    assert.equal((await artifact(s.artifactIds[0])).deleted_at, null);
  });

  it("missing / expired / foreign / stale lease is rejected without effect", T, async () => {
    await resetLease();
    const s = await seedWork();
    const id = s.artifactIds[0];
    assert.equal((await softDelete(w, { workId: s.workId, artifactId: id, runId: randomUUID(), token: 0 })).reason, "LEASE_MISSING");
    const runA = randomUUID();
    const a1 = await acquire(w, runA);
    assert.equal((await softDelete(w, { workId: s.workId, artifactId: id, runId: randomUUID(), token: a1.fencing_token })).reason, "LEASE_MISMATCH");
    await expireLease();
    assert.equal((await softDelete(w, { workId: s.workId, artifactId: id, runId: runA, token: a1.fencing_token })).reason, "LEASE_EXPIRED");
    const a2 = await acquire(w, runA);
    assert.equal(a2.reason, "ACQUIRED");
    assert.equal(Number(a2.fencing_token), Number(a1.fencing_token) + 1);
    assert.equal((await softDelete(w, { workId: s.workId, artifactId: id, runId: runA, token: a1.fencing_token })).reason, "STALE_TOKEN");
    assert.equal((await artifact(id)).deleted_at, null);
  });

  it("rollback after a successful call leaves no partial effect", T, async () => {
    await resetLease();
    const s = await seedWork();
    const runId = randomUUID();
    const a = await acquire(w, runId);
    await asRole(w, WORKER, async (c) => {
      const r = (await c.query(softDeleteSql, [s.workId, s.artifactIds[0], runId, a.fencing_token])).rows[0];
      assert.equal(r.reason, "SOFT_DELETED");
    }, { commit: false });
    assert.equal((await artifact(s.artifactIds[0])).deleted_at, null);
  });

  it("connection lost before COMMIT leaves no effect; retry after COMMIT is idempotent", T, async () => {
    await resetLease();
    const s = await seedWork();
    const runId = randomUUID();
    const a = await acquire(w, runId);
    const doomed = await connect("authenticator");
    await doomed.query("BEGIN");
    await doomed.query(`SET LOCAL ROLE ${WORKER}`);
    await doomed.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: WORKER })]);
    const r = (await doomed.query(softDeleteSql, [s.workId, s.artifactIds[0], runId, a.fencing_token])).rows[0];
    assert.equal(r.reason, "SOFT_DELETED");
    const doomedPid = await backendPid(doomed);
    doomed.connection.stream.destroy();
    for (let i = 0; i < 200; i += 1) {
      const { rows } = await admin.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE pid = $1", [doomedPid]);
      if (rows[0].n === 0) break;
      await new Promise((res) => setTimeout(res, 20));
    }
    assert.equal((await artifact(s.artifactIds[0])).deleted_at, null, "server aborted the orphaned transaction");
    const ok = await softDelete(w, { workId: s.workId, artifactId: s.artifactIds[0], runId, token: a.fencing_token });
    assert.equal(ok.reason, "SOFT_DELETED");
    const again = await softDelete(w, { workId: s.workId, artifactId: s.artifactIds[0], runId, token: a.fencing_token });
    assert.deepEqual([again.ok, again.reason], [true, "ALREADY_DELETED"]);
  });
});

// ---------------------------------------------------------------------------
describe("D4 concurrency on real row locks (two sessions)", () => {
  // Closing a session aborts its open transaction, so a failed test cannot leave locks behind.
  afterEach(async () => {
    await admin.query("ROLLBACK").catch(() => {});
    for (const c of pools.splice(1)) await c.end().catch(() => {});
  });
  it("old generation's in-flight delete commits before takeover; takeover blocks; old generation is fenced afterwards", T, async () => {
    await resetLease();
    const s = await seedWork();
    const a = await connect("authenticator");
    const b = await connect("authenticator");
    const aPid = await backendPid(a);
    const bPid = await backendPid(b);
    const runA = randomUUID();
    const runB = randomUUID();
    const la = await acquire(a, runA, 1);

    await a.query("BEGIN");
    await a.query(`SET LOCAL ROLE ${WORKER}`);
    await a.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: WORKER })]);
    const r = (await a.query(softDeleteSql, [s.workId, s.artifactIds[0], runA, la.fencing_token])).rows[0];
    assert.equal(r.reason, "SOFT_DELETED");
    await new Promise((res) => setTimeout(res, 1200));

    const bAcquire = acquire(b, runB, TTL);
    await waitUntilBlocked(bPid, aPid);
    await a.query("COMMIT");
    const lb = await bAcquire;
    assert.equal(lb.reason, "ACQUIRED");
    assert.equal(Number(lb.fencing_token), Number(la.fencing_token) + 1);
    assert.equal((await artifact(s.artifactIds[0])).status, "DELETED");

    const late = await softDelete(a, { workId: s.workId, artifactId: s.artifactIds[1], runId: runA, token: la.fencing_token });
    assert.deepEqual([late.ok, late.reason], [false, "LEASE_MISMATCH"]);
    assert.equal((await artifact(s.artifactIds[1])).deleted_at, null);
  });

  it("takeover in flight first: old generation's delete waits on the lease lock and is then fenced (no commit after takeover)", T, async () => {
    await resetLease();
    const s = await seedWork();
    const a = await connect("authenticator");
    const b = await connect("authenticator");
    const aPid = await backendPid(a);
    const runA = randomUUID();
    const runB = randomUUID();
    const la = await acquire(a, runA, TTL);
    await expireLease();

    await b.query("BEGIN");
    await b.query(`SET LOCAL ROLE ${WORKER}`);
    await b.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: WORKER })]);
    const lb = (await b.query("SELECT * FROM public.premium_retention_lease_acquire($1, $2)", [runB, TTL])).rows[0];
    assert.equal(lb.reason, "ACQUIRED");

    const aDelete = softDelete(a, { workId: s.workId, artifactId: s.artifactIds[0], runId: runA, token: la.fencing_token });
    await waitUntilBlocked(aPid, await backendPid(b));
    await b.query("COMMIT");
    const res = await aDelete;
    // EvalPlanQual re-reads the committed takeover row: holder is runB, so not LEASE_EXPIRED.
    assert.deepEqual([res.ok, res.reason], [false, "LEASE_MISMATCH"]);
    assert.equal((await artifact(s.artifactIds[0])).deleted_at, null);
  });

  it("same-generation renew in flight, rolled back: waiting delete of the still-valid generation proceeds", T, async () => {
    await resetLease();
    const s = await seedWork();
    const a = await connect("authenticator");
    const b = await connect("authenticator");
    const aPid = await backendPid(a);
    const bPid = await backendPid(b);
    const runA = randomUUID();
    const la = await acquire(a, runA, TTL);

    await b.query("BEGIN");
    await b.query(`SET LOCAL ROLE ${WORKER}`);
    await b.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: WORKER })]);
    const hb = (await b.query("SELECT * FROM public.premium_retention_lease_renew($1, $2, $3)", [runA, la.fencing_token, TTL])).rows[0];
    assert.equal(hb.renewed, true);

    const aDelete = softDelete(a, { workId: s.workId, artifactId: s.artifactIds[0], runId: runA, token: la.fencing_token });
    await waitUntilBlocked(aPid, bPid);
    await b.query("ROLLBACK");
    const res = await aDelete;
    assert.deepEqual([res.ok, res.reason], [true, "SOFT_DELETED"]);
  });

  it("two sessions of the same generation deleting the same artifact serialize: second waits, then ALREADY_DELETED", T, async () => {
    await resetLease();
    const s = await seedWork();
    const a = await connect("authenticator");
    const b = await connect("authenticator");
    const aPid = await backendPid(a);
    const bPid = await backendPid(b);
    const runId = randomUUID();
    const l = await acquire(a, runId);
    const f = [s.workId, s.artifactIds[0], runId, l.fencing_token];

    await a.query("BEGIN");
    await a.query(`SET LOCAL ROLE ${WORKER}`);
    await a.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: WORKER })]);
    assert.equal((await a.query(softDeleteSql, f)).rows[0].reason, "SOFT_DELETED");

    const bDelete = softDelete(b, { workId: f[0], artifactId: f[1], runId, token: f[3] });
    await waitUntilBlocked(bPid, aPid);
    await a.query("COMMIT");
    const res = await bDelete;
    assert.deepEqual([res.ok, res.reason], [true, "ALREADY_DELETED"]);
  });

  it("replay of an old generation's exact call after takeover is fenced", T, async () => {
    await resetLease();
    const s = await seedWork();
    const a = await connect("authenticator");
    const runA = randomUUID();
    const la = await acquire(a, runA);
    await expireLease();
    const lb = await acquire(a, randomUUID());
    assert.equal(lb.reason, "ACQUIRED");
    const replay = await softDelete(a, { workId: s.workId, artifactId: s.artifactIds[0], runId: runA, token: la.fencing_token });
    assert.deepEqual([replay.ok, replay.reason], [false, "LEASE_MISMATCH"]);
    const reacquire = await acquire(a, runA);
    assert.equal(reacquire.reason, "HELD");
    assert.equal((await artifact(s.artifactIds[0])).deleted_at, null);
  });

  it("release in flight first: waiting delete sees the released lease (LEASE_MISSING)", T, async () => {
    await resetLease();
    const s = await seedWork();
    const a = await connect("authenticator");
    const b = await connect("authenticator");
    const bPid = await backendPid(b);
    const runId = randomUUID();
    const l = await acquire(a, runId);

    await a.query("BEGIN");
    await a.query(`SET LOCAL ROLE ${WORKER}`);
    await a.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: WORKER })]);
    const rel = (await a.query("SELECT * FROM public.premium_retention_lease_release($1, $2)", [runId, l.fencing_token])).rows[0];
    assert.equal(rel.reason, "RELEASED");

    const bDelete = softDelete(b, { workId: s.workId, artifactId: s.artifactIds[0], runId, token: l.fencing_token });
    await waitUntilBlocked(bPid, await backendPid(a));
    await a.query("COMMIT");
    const res = await bDelete;
    assert.deepEqual([res.ok, res.reason], [false, "LEASE_MISSING"]);
    assert.equal((await artifact(s.artifactIds[0])).deleted_at, null);
  });

  it("REPEATABLE READ caller: concurrent takeover surfaces as 40001 with no effect", T, async () => {
    await resetLease();
    const s = await seedWork();
    const a = await connect("authenticator");
    const b = await connect("authenticator");
    const aPid = await backendPid(a);
    const runA = randomUUID();
    const la = await acquire(a, runA, TTL);
    await expireLease();

    await b.query("BEGIN");
    await b.query(`SET LOCAL ROLE ${WORKER}`);
    await b.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: WORKER })]);
    await b.query("SELECT * FROM public.premium_retention_lease_acquire($1, $2)", [randomUUID(), TTL]);

    await a.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
    await a.query(`SET LOCAL ROLE ${WORKER}`);
    await a.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: WORKER })]);
    const aDelete = a.query(softDeleteSql, [s.workId, s.artifactIds[0], runA, la.fencing_token]);
    await waitUntilBlocked(aPid, await backendPid(b));
    await b.query("COMMIT");
    await rejects(aDelete, "40001");
    await a.query("ROLLBACK");
    assert.equal((await artifact(s.artifactIds[0])).deleted_at, null);
  });

  it("lock waits are boundable with lock_timeout (55P03) — no default bound is configured by migrations", T, async () => {
    await resetLease();
    const s = await seedWork();
    const a = await connect("authenticator");
    const b = await connect("authenticator");
    const runId = randomUUID();
    const l = await acquire(a, runId);
    await admin.query("BEGIN");
    await admin.query("SELECT 1 FROM public.premium_retention_scheduler_lease WHERE lock_key = 'premium_retention_cleanup' FOR UPDATE");
    await b.query("BEGIN");
    await b.query("SET LOCAL lock_timeout = '200ms'");
    await b.query(`SET LOCAL ROLE ${WORKER}`);
    await b.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: WORKER })]);
    await rejects(b.query(softDeleteSql, [s.workId, s.artifactIds[0], runId, l.fencing_token]), "55P03");
    await b.query("ROLLBACK");
    await admin.query("ROLLBACK");
    const { rows } = await admin.query(
      `SELECT r.rolname, s.setconfig FROM pg_db_role_setting s JOIN pg_roles r ON r.oid = s.setrole
       WHERE r.rolname IN ('premium_retention_worker', 'service_role', 'authenticator')`,
    );
    for (const r of rows) {
      assert.ok(!(r.setconfig ?? []).some((c) => /^(lock_timeout|statement_timeout)=/.test(c)), r.rolname);
    }
    console.log(`# role settings for worker/service_role/authenticator: ${JSON.stringify(rows)}`);
  });
});

// ---------------------------------------------------------------------------
describe("D5 storage.objects policies for the worker (DB level only, no Storage API)", () => {
  it("worker sees/deletes only objects of due WORK_READY premium works; cannot insert/update", T, async () => {
    const auth = await connect("authenticator");
    const due = await seedWork();
    const notDue = await seedWork({ due: false });
    const strayKey = `gate/${randomUUID().slice(0, 8)}/stray.mp3`;
    await admin.query("INSERT INTO storage.objects (bucket_id, name) VALUES ($1, $2)", [BUCKET, strayKey]);

    const visible = await asRole(auth, WORKER, async (c) => (await c.query(
      "SELECT name FROM storage.objects WHERE name = ANY($1)",
      [[...due.keys, ...notDue.keys, strayKey]],
    )).rows.map((r) => r.name).sort());
    assert.deepEqual(visible, [...due.keys].sort());

    const delNotDue = await asRole(auth, WORKER, (c) => c.query(
      "DELETE FROM storage.objects WHERE bucket_id = $1 AND name = $2", [BUCKET, notDue.keys[0]]));
    assert.equal(delNotDue.rowCount, 0);
    const delStray = await asRole(auth, WORKER, (c) => c.query(
      "DELETE FROM storage.objects WHERE bucket_id = $1 AND name = $2", [BUCKET, strayKey]));
    assert.equal(delStray.rowCount, 0);
    const delDue = await asRole(auth, WORKER, (c) => c.query(
      "DELETE FROM storage.objects WHERE bucket_id = $1 AND name = $2", [BUCKET, due.keys[0]]));
    assert.equal(delDue.rowCount, 1);

    await rejects(asRole(auth, WORKER, (c) => c.query(
      "INSERT INTO storage.objects (bucket_id, name) VALUES ($1, 'gate/x.mp3')", [BUCKET])), "42501");
    await rejects(asRole(auth, WORKER, (c) => c.query(
      "UPDATE storage.objects SET name = name WHERE name = $1", [due.keys[1]])), "42501");
  });

  it("G4-P (recorded limitation): object DELETE is not fenced — allowed without holding the lease", T, async () => {
    await resetLease();
    const auth = await connect("authenticator");
    const due = await seedWork();
    await acquire(auth, randomUUID());
    const del = await asRole(auth, WORKER, (c) => c.query(
      "DELETE FROM storage.objects WHERE bucket_id = $1 AND name = $2", [BUCKET, due.keys[0]]));
    assert.equal(del.rowCount, 1);
  });
});
