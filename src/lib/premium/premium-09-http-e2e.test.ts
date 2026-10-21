/**
 * PREMIUM-09 — HTTP unlock + signed URL + storage retention E2E (local only).
 *
 * Gate: BRD_HTTP_E2E=1 + NEXT_HTTP_BASE_URL=http://127.0.0.1:3017
 * + .env.local.e2e / LOCAL_SUPABASE loopback (never *.supabase.co).
 */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createBrowserClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AUDIO_ARTIFACTS_BUCKET } from "@/config/audio-render";
import { runPremiumRetentionCleanupForWork } from "@/lib/premium/premium-retention-cleanup-service";
import {
  applyIntegrationEnv,
  resolveIntegrationEnv,
} from "@/test/integration-env";

const baseUrl = (process.env.NEXT_HTTP_BASE_URL ?? "").replace(/\/$/, "");
const integration = resolveIntegrationEnv({});
const live =
  process.env.BRD_HTTP_E2E === "1" &&
  Boolean(baseUrl) &&
  integration.enabled;

function assertLoopback(url: string, label: string): void {
  const host = new URL(url).hostname.toLowerCase();
  if (!["127.0.0.1", "localhost", "::1"].includes(host)) {
    throw new Error(`${label} must be loopback, got ${host}`);
  }
}

if (live) {
  assertLoopback(baseUrl, "NEXT_HTTP_BASE_URL");
  applyIntegrationEnv(integration);
  assertLoopback(integration.url, "NEXT_PUBLIC_SUPABASE_URL");
}

const dbContainer =
  process.env.LOCAL_SUPABASE_DB_CONTAINER ?? "supabase_db_bitrymdym-local";

function psql(sql: string): string {
  return execFileSync(
    "docker",
    [
      "exec",
      "-i",
      dbContainer,
      "psql",
      "-X",
      "-q",
      "-At",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      "postgres",
    ],
    { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  ).trim();
}

type CookieRow = { name: string; value: string };

function cookieJarClient(cookies: CookieRow[], url: string, anon: string) {
  return createBrowserClient(url, anon, {
    isSingleton: false,
    cookies: {
      getAll() {
        return cookies.map((c) => ({ name: c.name, value: c.value }));
      },
      setAll(next) {
        for (const item of next) {
          const idx = cookies.findIndex((c) => c.name === item.name);
          if (!item.value) {
            if (idx >= 0) cookies.splice(idx, 1);
            continue;
          }
          if (idx >= 0) cookies[idx] = { name: item.name, value: item.value };
          else cookies.push({ name: item.name, value: item.value });
        }
      },
    },
  });
}

function cookieHeader(cookies: CookieRow[]): string {
  return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}

async function httpJson(
  path: string,
  init: RequestInit & { cookies?: CookieRow[] | null },
): Promise<{ status: number; json: Record<string, unknown> }> {
  const headers = new Headers(init.headers);
  if (!headers.has("content-type") && init.body) {
    headers.set("content-type", "application/json");
  }
  if (init.cookies && init.cookies.length > 0) {
    headers.set("cookie", cookieHeader(init.cookies));
  }
  const res = await fetch(`${baseUrl}${path}`, { ...init, headers });
  let json: Record<string, unknown> = {};
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    json = {};
  }
  return { status: res.status, json };
}

describe.runIf(live)("PREMIUM-09 HTTP unlock / signed URL / cleanup", () => {
  const tag = randomUUID().slice(0, 8);
  let admin: SupabaseClient;
  let url = "";
  let anon = "";

  let freeId = "";
  let bronzeId = "";
  let otherId = "";
  let freeCookies: CookieRow[] = [];
  let bronzeCookies: CookieRow[] = [];
  let otherCookies: CookieRow[] = [];

  let workReadyId = "";
  let workFreeId = "";
  let workExpiredId = "";
  let workOtherOwnerId = "";
  let takeFreeId = "";
  let projectId = "";
  let cleanupProjectId = "";
  let artifactId = "";
  let objectKey = "";
  let otherObjectKey = "";
  let cleanupWorkId = "";
  let cleanupObjectKey = "";

  const trackedUsers: string[] = [];
  const trackedProjects: string[] = [];

  beforeAll(async () => {
    url = integration.url;
    anon = integration.anonKey;
    admin = createClient(url, integration.serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    async function makeUser(
      label: string,
      tier: "FREE" | "BRONZE",
    ): Promise<{ id: string; cookies: CookieRow[] }> {
      const email = `p09-${label}-${tag}@local.test`;
      const password = `P09!${randomUUID()}`;
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (error || !data.user) throw new Error(error?.message ?? "createUser");
      const id = data.user.id;
      trackedUsers.push(id);
      await admin.from("profiles").upsert({
        id,
        role: "USER",
        account_level: "BEGINNER_RAPPER",
        display_name: `p09_${label}`,
      });
      if (tier !== "FREE") {
        const { error: premErr } = await admin.from("premium_entitlements").upsert({
          user_id: id,
          active: true,
          source: "manual_admin",
          tier,
          expires_at: null,
        });
        if (premErr) throw new Error(premErr.message);
      }
      const cookies: CookieRow[] = [];
      const client = cookieJarClient(cookies, url, anon);
      const sign = await client.auth.signInWithPassword({ email, password });
      if (sign.error) throw new Error(sign.error.message);
      return { id, cookies };
    }

    const free = await makeUser("free", "FREE");
    const bronze = await makeUser("bronze", "BRONZE");
    const other = await makeUser("other", "BRONZE");
    freeId = free.id;
    bronzeId = bronze.id;
    otherId = other.id;
    freeCookies = free.cookies;
    bronzeCookies = bronze.cookies;
    otherCookies = other.cookies;

    takeFreeId = randomUUID();
    const takeExpired = randomUUID();
    const takeOther = randomUUID();
    projectId = randomUUID();
    cleanupProjectId = randomUUID();
    trackedProjects.push(projectId, cleanupProjectId);

    psql(`
SELECT set_config('request.jwt.claim.role', 'service_role', false);
INSERT INTO public.studio_projects (id, owner_id, title, status, document_version)
VALUES
  ('${projectId}'::uuid, '${bronzeId}'::uuid, 'p09-dl', 'ACTIVE', 1),
  ('${cleanupProjectId}'::uuid, '${bronzeId}'::uuid, 'p09-clean', 'ACTIVE', 1);
SELECT public.premium_mark_work_ready('${bronzeId}'::uuid, 'STUDIO_PROJECT', '${projectId}'::uuid, now(), 7);
SELECT public.premium_mark_work_ready('${freeId}'::uuid, 'TAKE', '${takeFreeId}'::uuid, now(), 7);
SELECT public.premium_mark_work_ready('${bronzeId}'::uuid, 'TAKE', '${takeExpired}'::uuid, now() - interval '10 days', 7);
SELECT public.premium_mark_work_ready('${otherId}'::uuid, 'TAKE', '${takeOther}'::uuid, now(), 7);
SELECT public.premium_mark_work_ready('${bronzeId}'::uuid, 'STUDIO_PROJECT', '${cleanupProjectId}'::uuid, now() - interval '10 days', 7);
UPDATE public.premium_works
  SET retention_expires_at = now() - interval '1 day',
      work_ready_at = now() - interval '8 days'
  WHERE owner_id = '${bronzeId}'::uuid AND domain_ref = '${takeExpired}'::uuid;
UPDATE public.premium_works
  SET retention_expires_at = now() - interval '1 hour',
      work_ready_at = now() - interval '8 days'
  WHERE owner_id = '${bronzeId}'::uuid AND domain_ref = '${cleanupProjectId}'::uuid;
`);

    workReadyId = psql(
      `SELECT id::text FROM public.premium_works WHERE owner_id='${bronzeId}' AND domain_ref='${projectId}'`,
    );
    workFreeId = psql(
      `SELECT id::text FROM public.premium_works WHERE owner_id='${freeId}' AND domain_ref='${takeFreeId}'`,
    );
    workExpiredId = psql(
      `SELECT id::text FROM public.premium_works WHERE owner_id='${bronzeId}' AND domain_ref='${takeExpired}'`,
    );
    workOtherOwnerId = psql(
      `SELECT id::text FROM public.premium_works WHERE owner_id='${otherId}' AND domain_ref='${takeOther}'`,
    );
    cleanupWorkId = psql(
      `SELECT id::text FROM public.premium_works WHERE owner_id='${bronzeId}' AND domain_ref='${cleanupProjectId}'`,
    );

    // LEGACY_STUDIO artifact (SFM_VERSIONS_V1 off) + SUCCEEDED job
    const jobId = randomUUID();
    const cleanupJob = randomUUID();
    objectKey = `premium09/${tag}/owner.mp3`;
    otherObjectKey = `premium09/${tag}/other.mp3`;
    cleanupObjectKey = `premium09/${tag}/cleanup.mp3`;
    const tinyMp3 = Buffer.from([
      0xff, 0xfb, 0x90, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    ]);

    for (const key of [objectKey, otherObjectKey, cleanupObjectKey]) {
      const up = await admin.storage
        .from(AUDIO_ARTIFACTS_BUCKET)
        .upload(key, tinyMp3, { contentType: "audio/mpeg", upsert: true });
      if (up.error) throw new Error(up.error.message);
    }

    psql(`
SELECT set_config('request.jwt.claim.role', 'service_role', false);
INSERT INTO public.render_jobs (
  id, owner_id, requested_tier, idempotency_key, status, kind, project_id,
  entitlement_snapshot, document_snapshot, finished_at
) VALUES
  ('${jobId}'::uuid, '${bronzeId}'::uuid, 'BASIC_MP3', 'p09-job-${tag}',
   'SUCCEEDED', 'STUDIO_EXPORT', '${projectId}'::uuid, '{}'::jsonb, '{}'::jsonb, now()),
  ('${cleanupJob}'::uuid, '${bronzeId}'::uuid, 'BASIC_MP3', 'p09-clean-${tag}',
   'SUCCEEDED', 'STUDIO_EXPORT', '${cleanupProjectId}'::uuid, '{}'::jsonb, '{}'::jsonb, now());
INSERT INTO public.audio_artifacts (
  owner_id, render_job_id, format, quality_tier, storage_bucket, object_key,
  byte_size, duration_ms, status, expires_at, project_id
) VALUES
  ('${bronzeId}'::uuid, '${jobId}'::uuid, 'audio/mpeg', 'BASIC_MP3',
   'audio-artifacts', '${objectKey}', 12, 1000, 'READY', now() + interval '7 days', '${projectId}'::uuid),
  ('${bronzeId}'::uuid, '${cleanupJob}'::uuid, 'audio/mpeg', 'BASIC_MP3',
   'audio-artifacts', '${cleanupObjectKey}', 12, 1000, 'READY', now() + interval '1 day', '${cleanupProjectId}'::uuid);
`);
    artifactId = psql(
      `SELECT id::text FROM public.audio_artifacts WHERE object_key='${objectKey}'`,
    );
  }, 120_000);

  afterAll(async () => {
    // Remove only our Storage objects
    await admin.storage
      .from(AUDIO_ARTIFACTS_BUCKET)
      .remove([objectKey, otherObjectKey, cleanupObjectKey].filter(Boolean));

    if (trackedUsers.length > 0) {
      const ids = trackedUsers.map((u) => `'${u}'`).join(",");
      psql(`
SELECT set_config('request.jwt.claim.role', 'service_role', false);
ALTER TABLE public.premium_unlock_events DISABLE TRIGGER USER;
DELETE FROM public.premium_unlock_events WHERE user_id IN (${ids});
DELETE FROM public.premium_track_unlocks WHERE user_id IN (${ids});
DELETE FROM public.premium_credit_periods WHERE user_id IN (${ids});
DELETE FROM public.premium_works WHERE owner_id IN (${ids});
ALTER TABLE public.premium_unlock_events ENABLE TRIGGER USER;
DELETE FROM public.audio_artifacts WHERE owner_id IN (${ids});
DELETE FROM public.render_jobs WHERE owner_id IN (${ids});
DELETE FROM public.premium_entitlements WHERE user_id IN (${ids});
${
  trackedProjects.length
    ? `DELETE FROM public.studio_projects WHERE id IN (${trackedProjects.map((p) => `'${p}'`).join(",")});`
    : ""
}
DELETE FROM public.profiles WHERE id IN (${ids});
`);
      for (const id of trackedUsers) {
        await admin.auth.admin.deleteUser(id);
      }
    }
  }, 60_000);

  it("D1: no session → 401", async () => {
    const res = await httpJson("/api/premium/unlock", {
      method: "POST",
      body: JSON.stringify({ workId: workReadyId, idempotencyKey: "x" }),
      cookies: null,
    });
    expect(res.status).toBe(401);
  });

  it("D2: FREE denies unlock; no unlock row", async () => {
    const before = psql(
      `SELECT count(*)::int FROM public.premium_track_unlocks WHERE user_id='${freeId}'`,
    );
    const res = await httpJson("/api/premium/unlock", {
      method: "POST",
      body: JSON.stringify({
        workId: workFreeId,
        idempotencyKey: `free-${tag}`,
      }),
      cookies: freeCookies,
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.json.success).not.toBe(true);
    expect(String(res.json.code ?? res.json.error ?? "")).toMatch(
      /NO_CREDITS|kredyt|Premium|FORBIDDEN/i,
    );
    const after = psql(
      `SELECT count(*)::int FROM public.premium_track_unlocks WHERE user_id='${freeId}'`,
    );
    expect(after).toBe(before);
  });

  it("D8: rejects client-supplied credits/tier", async () => {
    const res = await httpJson("/api/premium/unlock", {
      method: "POST",
      body: JSON.stringify({
        workId: workReadyId,
        idempotencyKey: `bad-${tag}`,
        premiumTier: "GOLD",
        credits: 99,
      }),
      cookies: bronzeCookies,
    });
    expect(res.status).toBe(400);
    expect(String(res.json.error ?? "")).toMatch(/must not supply/i);
  });

  it("E3a: bronze without unlock cannot mint signed URL", async () => {
    const res = await httpJson(`/api/mix/artifacts/${artifactId}/download`, {
      method: "GET",
      cookies: bronzeCookies,
    });
    expect(res.status).toBe(403);
    expect(String(res.json.error ?? "")).toMatch(/Odblokuj|unlock|FORBIDDEN/i);
    expect(JSON.stringify(res.json)).not.toMatch(/https?:\/\/.*token/i);
  });

  it("D3+D4: bronze unlock + idempotent retry", async () => {
    const key = `bronze-unlock-${tag}`;
    const first = await httpJson("/api/premium/unlock", {
      method: "POST",
      body: JSON.stringify({ workId: workReadyId, idempotencyKey: key }),
      cookies: bronzeCookies,
    });
    expect(first.status).toBe(200);
    expect(first.json.success).toBe(true);
    expect(first.json.reused).toBe(false);

    const second = await httpJson("/api/premium/unlock", {
      method: "POST",
      body: JSON.stringify({ workId: workReadyId, idempotencyKey: key }),
      cookies: bronzeCookies,
    });
    expect(second.status).toBe(200);
    expect(second.json.reused).toBe(true);

    const unlocks = psql(
      `SELECT count(*)::int FROM public.premium_track_unlocks WHERE user_id='${bronzeId}' AND work_id='${workReadyId}'`,
    );
    expect(unlocks).toBe("1");
    const consumed = psql(
      `SELECT consumed::text FROM public.premium_credit_periods WHERE user_id='${bronzeId}' ORDER BY created_at DESC LIMIT 1`,
    );
    expect(consumed).toBe("1");
  });

  it("D5: no credits left → deny without partial unlock", async () => {
    const take2 = randomUUID();
    psql(`
SELECT set_config('request.jwt.claim.role', 'service_role', false);
SELECT public.premium_mark_work_ready('${bronzeId}'::uuid, 'TAKE', '${take2}'::uuid, now(), 7);
`);
    const wid = psql(
      `SELECT id::text FROM public.premium_works WHERE owner_id='${bronzeId}' AND domain='TAKE' AND domain_ref='${take2}'`,
    );
    const before = psql(
      `SELECT count(*)::int FROM public.premium_track_unlocks WHERE user_id='${bronzeId}'`,
    );
    const res = await httpJson("/api/premium/unlock", {
      method: "POST",
      body: JSON.stringify({
        workId: wid,
        idempotencyKey: `nocredit-${tag}`,
      }),
      cookies: bronzeCookies,
    });
    expect([403, 409]).toContain(res.status);
    expect(String(res.json.code ?? res.json.error ?? "")).toMatch(
      /NO_CREDITS|kredyt/i,
    );
    const after = psql(
      `SELECT count(*)::int FROM public.premium_track_unlocks WHERE user_id='${bronzeId}'`,
    );
    expect(after).toBe(before);
  });

  it("D6: expired work denied", async () => {
    const res = await httpJson("/api/premium/unlock", {
      method: "POST",
      body: JSON.stringify({
        workId: workExpiredId,
        idempotencyKey: `exp-${tag}`,
      }),
      cookies: bronzeCookies,
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(String(res.json.code ?? res.json.error ?? "")).toMatch(
      /EXPIRED|wygas/i,
    );
  });

  it("D7: user A cannot unlock user B work", async () => {
    const res = await httpJson("/api/premium/unlock", {
      method: "POST",
      body: JSON.stringify({
        workId: workOtherOwnerId,
        idempotencyKey: `cross-${tag}`,
      }),
      cookies: bronzeCookies,
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(String(res.json.code ?? "")).toMatch(/NOT_OWNER|FORBIDDEN|^$/);
  });

  it("E1: FREE cannot mint signed URL", async () => {
    const res = await httpJson(`/api/mix/artifacts/${artifactId}/download`, {
      method: "GET",
      cookies: freeCookies,
    });
    expect(res.status).toBe(403);
    expect(JSON.stringify(res.json)).not.toMatch(/signedUrl|token/i);
  });

  it("E3–E7: unlocked owner mint; cross-user deny; public path deny; signed reuse", async () => {
    const res = await httpJson(`/api/mix/artifacts/${artifactId}/download`, {
      method: "GET",
      cookies: bronzeCookies,
    });
    expect(res.status).toBe(200);
    expect(typeof res.json.url).toBe("string");
    const signedUrl = String(res.json.url);
    assertLoopback(signedUrl, "signedUrl");
    expect(signedUrl).not.toMatch(/\/storage\/v1\/object\/public\//);

    const otherRes = await httpJson(
      `/api/mix/artifacts/${artifactId}/download`,
      { method: "GET", cookies: otherCookies },
    );
    expect(otherRes.status).toBe(403);

    const direct = await fetch(
      `${url}/storage/v1/object/public/${AUDIO_ARTIFACTS_BUCKET}/${objectKey}`,
    );
    expect(direct.status).toBeGreaterThanOrEqual(400);

    const reuse = await fetch(signedUrl);
    expect(reuse.ok || reuse.status === 200).toBe(true);
  });

  it("F: retention cleanup deletes due object; leaves other; idempotent", async () => {
    const before = await admin.storage
      .from(AUDIO_ARTIFACTS_BUCKET)
      .download(cleanupObjectKey);
    expect(before.error).toBeNull();

    const otherBefore = await admin.storage
      .from(AUDIO_ARTIFACTS_BUCKET)
      .download(otherObjectKey);
    expect(otherBefore.error).toBeNull();

    const first = await runPremiumRetentionCleanupForWork({
      workId: cleanupWorkId,
    });
    expect(first.markedExpired).toBe(true);
    expect(first.deletedObjectKeys).toContain(cleanupObjectKey);

    const after = await admin.storage
      .from(AUDIO_ARTIFACTS_BUCKET)
      .download(cleanupObjectKey);
    expect(after.error).not.toBeNull();

    const otherAfter = await admin.storage
      .from(AUDIO_ARTIFACTS_BUCKET)
      .download(otherObjectKey);
    expect(otherAfter.error).toBeNull();

    const status = psql(
      `SELECT status FROM public.premium_works WHERE id='${cleanupWorkId}'`,
    );
    expect(status).toBe("EXPIRED");

    const second = await runPremiumRetentionCleanupForWork({
      workId: cleanupWorkId,
    });
    expect(second.alreadyExpired).toBe(true);
    expect(second.markedExpired).toBe(false);
  });
});
