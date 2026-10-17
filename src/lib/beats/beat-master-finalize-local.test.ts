/**
 * Security Wave 5 — `finalize_beat_master_asset` against the LOCAL Supabase
 * Postgres (real transactions, row locks, constraints, ACL).
 *
 * Opt-in: BEAT_FINALIZE_LOCAL_DB_TEST=1. Talks to the local DB container only,
 * through `docker exec psql` (local default credentials); never reads .env*,
 * never uses an API key. Sessions run as `authenticator` → `service_role` with
 * `request.jwt.claims` set, like PostgREST. Every fixture is created by the
 * test and deleted in afterAll.
 */
import { execFileSync, spawn } from "child_process";
import { createHash, randomUUID } from "crypto";
import { readFileSync } from "fs";
import path from "path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const enabled = process.env.BEAT_FINALIZE_LOCAL_DB_TEST === "1";
const dbContainer =
  process.env.BEAT_FINALIZE_LOCAL_DB_CONTAINER ?? "supabase_db_bitrymdym-local";
const MIGRATION = path.join(
  process.cwd(),
  "supabase/migrations/20261017140000_beat_master_finalize_atomic.sql",
);

type DbUser = "postgres" | "authenticator";

function psqlArgs(user: DbUser) {
  return [
    "exec",
    "-i",
    "-e",
    "PGPASSWORD=postgres",
    dbContainer,
    "psql",
    "-X",
    "-q",
    "-At",
    "-v",
    "ON_ERROR_STOP=1",
    "-h",
    "127.0.0.1",
    "-U",
    user,
    "-d",
    "postgres",
  ];
}

function psql(sql: string, user: DbUser = "postgres"): string {
  return execFileSync("docker", psqlArgs(user), {
    input: sql,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}

type SessionResult = { code: number; stdout: string; stderr: string; ms: number };

function psqlAsync(sql: string, user: DbUser = "authenticator"): Promise<SessionResult> {
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn("docker", psqlArgs(user), { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("close", (code) =>
      resolve({ code: code ?? -1, stdout: stdout.trim(), stderr, ms: Date.now() - started }),
    );
    child.stdin.end(sql);
  });
}

const SERVICE_CLAIMS = `SET LOCAL ROLE service_role;
SET LOCAL request.jwt.claims = '{"role":"service_role"}';`;

/** One transaction as service_role (PostgREST equivalent). */
function asService(statements: string): string {
  return `BEGIN;\n${SERVICE_CLAIMS}\n${statements}\nCOMMIT;`;
}

function svc(statements: string): string {
  return psql(asService(statements), "authenticator");
}

function svcError(statements: string): string | null {
  try {
    svc(statements);
    return null;
  } catch (error) {
    return String((error as { stderr?: string }).stderr ?? error);
  }
}

const q = (value: string | null) =>
  value === null ? "NULL" : `'${value.replace(/'/g, "''")}'`;

const checksumOf = (assetId: string) =>
  createHash("sha256").update(assetId).digest("hex");

/** Title that identifies the upload, so beat metadata can be matched to the active asset. */
const titleFor = (assetId: string) => `Upload ${assetId.slice(0, 8)}`;

type Call = {
  beatId: string;
  assetId: string;
  ownership: "USER" | "PLATFORM";
  ownerId: string | null;
  durationSeconds?: number;
  applyMetadata?: boolean;
  title?: string;
  bpm?: number;
  tags?: string[];
  checksum?: string;
};

function rpcSql(call: Call): string {
  const apply = call.applyMetadata ?? true;
  const tags = call.tags ?? ["wave5"];
  return `SELECT public.finalize_beat_master_asset(
  p_beat_id => ${q(call.beatId)}::uuid,
  p_asset_id => ${q(call.assetId)}::uuid,
  p_ownership_type => ${q(call.ownership)}::public.beat_ownership_type,
  p_owner_id => ${q(call.ownerId)}::uuid,
  p_content_type => 'audio/wav',
  p_byte_size => 4096,
  p_checksum_sha256 => ${q(call.checksum ?? checksumOf(call.assetId))},
  p_duration_seconds => ${call.durationSeconds ?? 95},
  p_apply_metadata => ${apply},
  p_title => ${apply ? q(call.title ?? titleFor(call.assetId)) : "NULL"},
  p_producer => ${apply ? "'W5 Producer'" : "NULL"},
  p_description => NULL,
  p_genre => ${apply ? "'trap'" : "NULL"},
  p_style => NULL,
  p_bpm => ${apply ? (call.bpm ?? 120) : "NULL"},
  p_key => NULL,
  p_scale => NULL,
  p_tags => ${apply ? `ARRAY[${tags.map(q).join(",")}]::text[]` : "NULL"},
  p_cover_ref => NULL
);`;
}

type RpcResult = {
  beat_id: string;
  asset: { id: string; status: string; is_active: boolean };
  replaced_asset_id: string | null;
  idempotent_replay: boolean;
};

function finalize(call: Call): RpcResult {
  return JSON.parse(svc(rpcSql(call))) as RpcResult;
}

function finalizeError(call: Call): string | null {
  return svcError(rpcSql(call));
}

function parseRpc(stdout: string): RpcResult {
  const line = stdout.split("\n").find((l) => l.startsWith("{"));
  if (!line) throw new Error(`no RPC result in: ${stdout}`);
  return JSON.parse(line) as RpcResult;
}

type AssetState = {
  id: string;
  status: string;
  is_active: boolean;
  replaced_by_asset_id: string | null;
  checksum_sha256: string | null;
};

function assets(beatId: string): AssetState[] {
  const out = psql(
    `SELECT coalesce(json_agg(json_build_object('id', id, 'status', status, 'is_active', is_active, 'replaced_by_asset_id', replaced_by_asset_id, 'checksum_sha256', checksum_sha256) ORDER BY created_at, id), '[]') FROM public.beat_audio_assets WHERE beat_id = ${q(beatId)};`,
  );
  return JSON.parse(out) as AssetState[];
}

const activeMasters = (beatId: string) =>
  assets(beatId).filter((a) => a.is_active);
const assetState = (beatId: string, assetId: string) =>
  assets(beatId).find((a) => a.id === assetId)!;

type BeatState = {
  title: string;
  bpm: number;
  duration_seconds: number;
  status: string;
  tags: string[];
  producer: string | null;
  updated_at: string;
};

function beatState(beatId: string): BeatState {
  return JSON.parse(
    psql(
      `SELECT json_build_object('title', title, 'bpm', bpm, 'duration_seconds', duration_seconds, 'status', status, 'tags', tags, 'producer', producer, 'updated_at', updated_at) FROM public.beats WHERE id = ${q(beatId)};`,
    ),
  ) as BeatState;
}

const createdBeats: string[] = [];
const createdUsers: string[] = [];

function createUser(): string {
  const id = randomUUID();
  psql(
    `INSERT INTO auth.users (id, email, aud, role, raw_user_meta_data) VALUES (${q(id)}, ${q(`w5-${id.slice(0, 8)}@bitrymdym.test`)}, 'authenticated', 'authenticated', '{"display_name":"W5 test"}'::jsonb);`,
  );
  createdUsers.push(id);
  return id;
}

function createBeat(opts: {
  ownership: "USER" | "PLATFORM";
  ownerId?: string | null;
  status?: string;
}): string {
  const id = randomUUID();
  svc(
    `INSERT INTO public.beats (id, ownership_type, owner_id, title, bpm, duration_seconds, status, tags)
     VALUES (${q(id)}, ${q(opts.ownership)}, ${q(opts.ownerId ?? null)}, 'Initial title', 1, 1, ${q(opts.status ?? "DRAFT")}, '{}');`,
  );
  createdBeats.push(id);
  return id;
}

function createAsset(
  beatId: string,
  opts: { status?: string; active?: boolean; purpose?: string } = {},
): string {
  const id = randomUUID();
  const status = opts.status ?? "PENDING_UPLOAD";
  svc(
    `INSERT INTO public.beat_audio_assets (id, beat_id, purpose, status, object_key, content_type, byte_size, checksum_sha256, is_active)
     SELECT ${q(id)}, b.id, ${q(opts.purpose ?? "MASTER")}, ${q(status)},
            CASE WHEN b.ownership_type = 'PLATFORM' THEN 'platform/w5/' ELSE 'user/' || b.owner_id || '/w5/' END
              || b.id || '/' || ${q(id)} || '.bin',
            'audio/wav', 4096, ${status === "READY" ? q(checksumOf(id)) : "NULL"}, ${opts.active ?? false}
     FROM public.beats b WHERE b.id = ${q(beatId)};`,
  );
  return id;
}

/** USER DRAFT beat owned by a fresh user. */
function userBeat(status = "DRAFT") {
  const ownerId = createUser();
  const beatId = createBeat({ ownership: "USER", ownerId, status });
  return { ownerId, beatId };
}

const userCall = (b: { ownerId: string; beatId: string }, assetId: string): Call => ({
  beatId: b.beatId,
  assetId,
  ownership: "USER",
  ownerId: b.ownerId,
});

const platformCall = (beatId: string, assetId: string): Call => ({
  beatId,
  assetId,
  ownership: "PLATFORM",
  ownerId: null,
});

describe.runIf(enabled)("finalize_beat_master_asset (local Postgres)", () => {
  beforeAll(() => {
    expect(
      psql(
        "SELECT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261017140000');",
      ),
    ).toBe("t");
  });

  afterAll(() => {
    if (createdBeats.length > 0) {
      const ids = createdBeats.map(q).join(",");
      svc(
        `DELETE FROM public.beat_audio_assets WHERE beat_id IN (${ids});
         DELETE FROM public.beats WHERE id IN (${ids});`,
      );
    }
    if (createdUsers.length > 0) {
      psql(`DELETE FROM auth.users WHERE id IN (${createdUsers.map(q).join(",")});`);
    }
  });

  describe("ACL, definition and migration", () => {
    it("EXECUTE: service_role only; INVOKER with an empty search_path", () => {
      expect(
        psql(`SELECT has_function_privilege('anon', p.oid, 'EXECUTE')
                  || '/' || has_function_privilege('authenticated', p.oid, 'EXECUTE')
                  || '/' || has_function_privilege('public', p.oid, 'EXECUTE')
                  || '/' || has_function_privilege('service_role', p.oid, 'EXECUTE')
                  || '/' || p.prosecdef || '/' || array_to_string(p.proconfig, ',')
              FROM pg_proc p WHERE p.proname = 'finalize_beat_master_asset';`),
      ).toBe('false/false/false/true/false/search_path=""');
    });

    it("(15) authenticated and anon cannot call it; service_role role without service claims is refused", () => {
      const b = userBeat();
      const assetId = createAsset(b.beatId);
      for (const role of ["authenticated", "anon"]) {
        const err = (() => {
          try {
            psql(
              `BEGIN;\nSET LOCAL ROLE ${role};\nSET LOCAL request.jwt.claims = '{"role":"${role}","sub":"${b.ownerId}"}';\n${rpcSql(userCall(b, assetId))}\nCOMMIT;`,
              "authenticator",
            );
            return null;
          } catch (error) {
            return String((error as { stderr?: string }).stderr);
          }
        })();
        expect(err, role).toContain("permission denied for function finalize_beat_master_asset");
      }
      const noClaims = (() => {
        try {
          psql(`BEGIN;\nSET LOCAL ROLE service_role;\n${rpcSql(userCall(b, assetId))}\nCOMMIT;`, "authenticator");
          return null;
        } catch (error) {
          return String((error as { stderr?: string }).stderr);
        }
      })();
      expect(noClaims).toContain("Only service_role may finalize beat audio");
      expect(assetState(b.beatId, assetId).status).toBe("PENDING_UPLOAD");
      expect(beatState(b.beatId).title).toBe("Initial title");
    });

    it("migration re-runs cleanly (CREATE OR REPLACE + ACL assertions) inside a rolled-back transaction", () => {
      const sql = readFileSync(MIGRATION, "utf8");
      expect(() => psql(`BEGIN;\n${sql}\nROLLBACK;`)).not.toThrow();
    });
  });

  describe("success, replacement and metadata", () => {
    it("(1)(16) first USER finalize without a previous MASTER commits asset + metadata together", () => {
      const b = userBeat();
      const assetId = createAsset(b.beatId);
      const result = finalize(userCall(b, assetId));
      expect(result).toMatchObject({
        beat_id: b.beatId,
        asset: { id: assetId, status: "READY", is_active: true },
        replaced_asset_id: null,
        idempotent_replay: false,
      });
      expect(activeMasters(b.beatId).map((a) => a.id)).toEqual([assetId]);
      expect(assetState(b.beatId, assetId).checksum_sha256).toBe(checksumOf(assetId));
      expect(beatState(b.beatId)).toMatchObject({
        title: titleFor(assetId),
        bpm: 120,
        duration_seconds: 95,
        status: "DRAFT",
        tags: ["wave5"],
        producer: "W5 Producer",
      });
    });

    it("(2)(18) PLATFORM replace: previous MASTER REPLACED by the new one, metadata switched", () => {
      const beatId = createBeat({ ownership: "PLATFORM", status: "PUBLISHED" });
      const oldId = createAsset(beatId, { status: "READY", active: true });
      const newId = createAsset(beatId);
      const result = finalize(platformCall(beatId, newId));
      expect(result.replaced_asset_id).toBe(oldId);
      expect(assetState(beatId, oldId)).toMatchObject({
        status: "REPLACED",
        is_active: false,
        replaced_by_asset_id: newId,
      });
      expect(activeMasters(beatId).map((a) => a.id)).toEqual([newId]);
      expect(beatState(beatId)).toMatchObject({ title: titleFor(newId), status: "PUBLISHED" });
    });

    it("(17) ADMIN MASTER replace without metadata: only duration changes with the active audio", () => {
      const beatId = createBeat({ ownership: "PLATFORM" });
      const oldId = createAsset(beatId, { status: "READY", active: true });
      const newId = createAsset(beatId);
      finalize({ ...platformCall(beatId, newId), applyMetadata: false, durationSeconds: 150 });
      expect(activeMasters(beatId).map((a) => a.id)).toEqual([newId]);
      expect(assetState(beatId, oldId).status).toBe("REPLACED");
      expect(beatState(beatId)).toMatchObject({
        title: "Initial title",
        bpm: 1,
        duration_seconds: 150,
      });
    });

    it("USER REJECTED beat may be finalized; status is never changed", () => {
      const b = userBeat("REJECTED");
      const assetId = createAsset(b.beatId);
      finalize(userCall(b, assetId));
      expect(beatState(b.beatId).status).toBe("REJECTED");
    });
  });

  describe("refusals leave everything unchanged", () => {
    function expectUnchanged(beatId: string, before: AssetState[], beatBefore: BeatState) {
      expect(assets(beatId)).toEqual(before);
      expect(beatState(beatId)).toEqual(beatBefore);
    }

    it.each([
      ["(8) REPLACED", { status: "REPLACED" }, "NOT_PENDING_MASTER"],
      ["(9) FAILED", { status: "FAILED" }, "NOT_PENDING_MASTER"],
      ["(10) READY, not active", { status: "READY", active: false }, "NOT_PENDING_MASTER"],
      ["ARCHIVED", { status: "ARCHIVED" }, "NOT_PENDING_MASTER"],
      ["(11)(13) PLAYBACK purpose", { purpose: "PLAYBACK" }, "NOT_PENDING_MASTER"],
      ["(13) DOWNLOAD purpose", { purpose: "DOWNLOAD" }, "NOT_PENDING_MASTER"],
    ] as [string, { status?: string; active?: boolean; purpose?: string }, string][])(
      "%s asset → %s",
      (_label, opts, token) => {
        const b = userBeat();
        const previous = createAsset(b.beatId, { status: "READY", active: true });
        const assetId = createAsset(b.beatId, opts);
        const before = assets(b.beatId);
        const beatBefore = beatState(b.beatId);
        expect(finalizeError(userCall(b, assetId))).toContain(token);
        expectUnchanged(b.beatId, before, beatBefore);
        expect(activeMasters(b.beatId).map((a) => a.id)).toEqual([previous]);
      },
    );

    it("(12) asset of another beat → ASSET_BEAT_MISMATCH, neither beat changes", () => {
      const b = userBeat();
      const other = userBeat();
      const foreignAsset = createAsset(other.beatId);
      const before = assets(other.beatId);
      const beatBefore = beatState(b.beatId);
      expect(finalizeError(userCall(b, foreignAsset))).toContain("ASSET_BEAT_MISMATCH");
      expect(assets(other.beatId)).toEqual(before);
      expect(beatState(b.beatId)).toEqual(beatBefore);
    });

    it.each([
      ["beat no longer DRAFT/REJECTED", "PENDING_REVIEW", null],
      ["another owner", "DRAFT", "other"],
    ] as [string, string, string | null][])(
      "(3) %s → BEAT_CHANGED before any write",
      (_label, status, owner) => {
        const b = userBeat(status);
        const assetId = createAsset(b.beatId);
        const before = assets(b.beatId);
        const beatBefore = beatState(b.beatId);
        const ownerId = owner ? createUser() : b.ownerId;
        expect(finalizeError({ ...userCall(b, assetId), ownerId })).toContain("BEAT_CHANGED");
        expectUnchanged(b.beatId, before, beatBefore);
      },
    );

    it("PLATFORM call on a USER beat → BEAT_CHANGED; unknown beat / asset → *_NOT_FOUND", () => {
      const b = userBeat();
      const assetId = createAsset(b.beatId);
      expect(finalizeError(platformCall(b.beatId, assetId))).toContain("BEAT_CHANGED");
      expect(finalizeError(userCall({ ...b, beatId: randomUUID() }, assetId))).toContain(
        "BEAT_NOT_FOUND",
      );
      expect(finalizeError(userCall(b, randomUUID()))).toContain("ASSET_NOT_FOUND");
      expect(assetState(b.beatId, assetId).status).toBe("PENDING_UPLOAD");
    });

    it("invalid input (bad checksum, USER without owner) → INVALID_INPUT, nothing written", () => {
      const b = userBeat();
      const assetId = createAsset(b.beatId);
      expect(finalizeError({ ...userCall(b, assetId), checksum: "not-hex" })).toContain(
        "INVALID_INPUT",
      );
      expect(finalizeError({ ...userCall(b, assetId), ownerId: null })).toContain("INVALID_INPUT");
      expect(assetState(b.beatId, assetId).status).toBe("PENDING_UPLOAD");
    });
  });

  describe("rollback of partial work", () => {
    it("(4) activation fails after the previous MASTER was replaced → full rollback", () => {
      const b = userBeat();
      const oldId = createAsset(b.beatId, { status: "READY", active: true });
      const newId = createAsset(b.beatId);
      const before = assets(b.beatId);
      const beatBefore = beatState(b.beatId);
      const fn = `w5_fail_activation_${newId.replace(/-/g, "")}`;
      psql(`CREATE FUNCTION public.${fn}() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id = ${q(newId)}::uuid AND NEW.status = 'READY' THEN
    RAISE EXCEPTION 'injected activation failure';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ${fn} BEFORE UPDATE ON public.beat_audio_assets FOR EACH ROW EXECUTE FUNCTION public.${fn}();`);
      try {
        expect(finalizeError(userCall(b, newId))).toContain("injected activation failure");
      } finally {
        psql(`DROP TRIGGER ${fn} ON public.beat_audio_assets; DROP FUNCTION public.${fn}();`);
      }
      expect(assets(b.beatId)).toEqual(before);
      expect(beatState(b.beatId)).toEqual(beatBefore);
      expect(activeMasters(b.beatId).map((a) => a.id)).toEqual([oldId]);
    });

    it("(14) database error in the last step (metadata CHECK) → swap and activation rolled back", () => {
      const b = userBeat();
      const oldId = createAsset(b.beatId, { status: "READY", active: true });
      const newId = createAsset(b.beatId);
      const before = assets(b.beatId);
      const beatBefore = beatState(b.beatId);
      expect(finalizeError({ ...userCall(b, newId), durationSeconds: 999 })).toContain(
        "beats_duration_range_chk",
      );
      expect(assets(b.beatId)).toEqual(before);
      expect(beatState(b.beatId)).toEqual(beatBefore);
      expect(activeMasters(b.beatId).map((a) => a.id)).toEqual([oldId]);
    });

    it("session killed mid-transaction (crash) → nothing persists; the beat stays finalizable", async () => {
      const b = userBeat();
      const oldId = createAsset(b.beatId, { status: "READY", active: true });
      const newId = createAsset(b.beatId);
      const before = assets(b.beatId);
      const beatBefore = beatState(b.beatId);
      const tag = `w5crash_${newId.slice(0, 8)}`;
      const session = psqlAsync(
        `SET application_name = '${tag}';\n${asService(`${rpcSql(userCall(b, newId))}\nSELECT pg_sleep(30);`)}`,
      );
      let pid = "";
      for (let i = 0; i < 100 && !pid; i++) {
        await new Promise((r) => setTimeout(r, 100));
        pid = psql(
          `SELECT pid FROM pg_stat_activity WHERE application_name = '${tag}' AND query LIKE '%pg_sleep%' AND state = 'active';`,
        );
      }
      expect(pid).not.toBe("");
      expect(psql(`SELECT pg_terminate_backend(${pid});`)).toBe("t");
      const result = await session;
      expect(result.code).not.toBe(0);
      expect(assets(b.beatId)).toEqual(before);
      expect(beatState(b.beatId)).toEqual(beatBefore);
      expect(activeMasters(b.beatId).map((a) => a.id)).toEqual([oldId]);

      finalize(userCall(b, newId));
      expect(activeMasters(b.beatId).map((a) => a.id)).toEqual([newId]);
    }, 30_000);
  });

  describe("idempotency", () => {
    it("(7) retry of a committed finalize → idempotent replay, no write", () => {
      const b = userBeat();
      const assetId = createAsset(b.beatId);
      finalize(userCall(b, assetId));
      const before = assets(b.beatId);
      const beatBefore = beatState(b.beatId);
      const replay = finalize(userCall(b, assetId));
      expect(replay).toMatchObject({
        idempotent_replay: true,
        asset: { id: assetId, status: "READY", is_active: true },
      });
      expect(assets(b.beatId)).toEqual(before);
      expect(beatState(b.beatId)).toEqual(beatBefore);
    });

    it("(7) retry with different metadata or different bytes → ALREADY_FINALIZED, nothing written", () => {
      const b = userBeat();
      const assetId = createAsset(b.beatId);
      finalize(userCall(b, assetId));
      const before = assets(b.beatId);
      const beatBefore = beatState(b.beatId);
      expect(finalizeError({ ...userCall(b, assetId), title: "Edited later" })).toContain(
        "ALREADY_FINALIZED",
      );
      expect(finalizeError({ ...userCall(b, assetId), checksum: checksumOf("other") })).toContain(
        "ALREADY_FINALIZED",
      );
      expect(assets(b.beatId)).toEqual(before);
      expect(beatState(b.beatId)).toEqual(beatBefore);
    });

    it("(5) two concurrent finalizations of the same asset: one commit, one replay", async () => {
      const b = userBeat();
      const assetId = createAsset(b.beatId);
      const sql = asService(`${rpcSql(userCall(b, assetId))}\nSELECT pg_sleep(0.5);`);
      const [first, second] = await Promise.all([psqlAsync(sql), psqlAsync(sql)]);
      expect([first.code, second.code]).toEqual([0, 0]);
      const replays = [parseRpc(first.stdout), parseRpc(second.stdout)].map(
        (r) => r.idempotent_replay,
      );
      expect(replays.sort()).toEqual([false, true]);
      expect(activeMasters(b.beatId).map((a) => a.id)).toEqual([assetId]);
      expect(beatState(b.beatId).title).toBe(titleFor(assetId));
    }, 30_000);
  });

  describe("concurrency on one beat", () => {
    it("(6)(19) two pending assets, no previous MASTER: serialized on the beat row; metadata always matches the active asset", async () => {
      const b = userBeat();
      const first = createAsset(b.beatId);
      const second = createAsset(b.beatId);
      const holder = psqlAsync(
        asService(`${rpcSql(userCall(b, first))}\nSELECT pg_sleep(1.5);`),
      );
      await new Promise((r) => setTimeout(r, 500));
      const waiter = await psqlAsync(asService(rpcSql(userCall(b, second))));
      const held = await holder;
      expect([held.code, waiter.code]).toEqual([0, 0]);
      // The second call waited for the first transaction's beat row lock.
      expect(waiter.ms).toBeGreaterThan(700);
      expect(parseRpc(waiter.stdout).replaced_asset_id).toBe(first);
      expect(activeMasters(b.beatId).map((a) => a.id)).toEqual([second]);
      expect(assetState(b.beatId, first)).toMatchObject({
        status: "REPLACED",
        replaced_by_asset_id: second,
      });
      expect(beatState(b.beatId).title).toBe(titleFor(second));
    }, 30_000);

    it("(20)(19) eight concurrent finalizations of different assets: exactly one active MASTER, every other REPLACED, metadata of the active one", async () => {
      const beatId = createBeat({ ownership: "PLATFORM" });
      const ids = Array.from({ length: 8 }, () => createAsset(beatId));
      const results = await Promise.all(
        ids.map((id) => psqlAsync(asService(rpcSql(platformCall(beatId, id))))),
      );
      expect(results.map((r) => r.code)).toEqual(ids.map(() => 0));
      const active = activeMasters(beatId);
      expect(active).toHaveLength(1);
      const states = assets(beatId);
      expect(states.filter((a) => a.status === "REPLACED")).toHaveLength(7);
      expect(states.filter((a) => a.status === "PENDING_UPLOAD")).toHaveLength(0);
      expect(beatState(beatId).title).toBe(titleFor(active[0].id));
      // REPLACED rows form one chain ending at the active asset.
      const byId = new Map(states.map((a) => [a.id, a]));
      for (const row of states.filter((a) => a.status === "REPLACED")) {
        let cursor = row;
        for (let hops = 0; cursor.replaced_by_asset_id && hops < 8; hops++) {
          cursor = byId.get(cursor.replaced_by_asset_id)!;
        }
        expect(cursor.id).toBe(active[0].id);
      }
    }, 60_000);

    it("lock order: a finalize holding the beat row does not block a new upload session insert", async () => {
      const b = userBeat();
      const pending = createAsset(b.beatId);
      const holder = psqlAsync(
        asService(`${rpcSql(userCall(b, pending))}\nSELECT pg_sleep(2);`),
      );
      await new Promise((r) => setTimeout(r, 500));
      const started = Date.now();
      createAsset(b.beatId);
      expect(Date.now() - started).toBeLessThan(1500);
      expect((await holder).code).toBe(0);
    }, 30_000);

    it("concurrent analyze-style asset write on a pending asset waits for the finalize, then pins PENDING_UPLOAD (0 rows)", async () => {
      const b = userBeat();
      const pending = createAsset(b.beatId);
      const holder = psqlAsync(
        asService(`${rpcSql(userCall(b, pending))}\nSELECT pg_sleep(1);`),
      );
      await new Promise((r) => setTimeout(r, 300));
      const out = svc(
        `WITH u AS (UPDATE public.beat_audio_assets SET checksum_sha256 = ${q(checksumOf("x"))} WHERE id = ${q(pending)} AND status = 'PENDING_UPLOAD' RETURNING 1) SELECT count(*) FROM u;`,
      );
      expect(out).toBe("0");
      expect((await holder).code).toBe(0);
      expect(assetState(b.beatId, pending).checksum_sha256).toBe(checksumOf(pending));
    }, 30_000);
  });
});
