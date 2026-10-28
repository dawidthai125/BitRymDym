/**
 * A1 Mix Working apply — real HTTP E2E against local Next.js + local Supabase.
 *
 * Gate: BRD_HTTP_E2E=1 and NEXT_HTTP_BASE_URL loopback
 * and resolveIntegrationEnv() (LOCAL_SUPABASE_* loopback).
 * Does NOT call the service layer as a success substitute.
 * Uses cookie session from @supabase/ssr browser client (local Auth only).
 */

import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createBrowserClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { emptyStudioFxChain } from "@/lib/studio/studio-fx-chain";
import {
  applyIntegrationEnv,
  resolveIntegrationEnv,
  type IntegrationEnv,
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

function requireLiveIntegration(): Extract<IntegrationEnv, { enabled: true }> {
  if (!integration.enabled) {
    throw new Error("HTTP e2e requires resolveIntegrationEnv()");
  }
  return integration;
}

if (live) {
  assertLoopback(baseUrl, "NEXT_HTTP_BASE_URL");
  const env = requireLiveIntegration();
  applyIntegrationEnv(env);
  assertLoopback(env.url, "LOCAL_SUPABASE_URL");
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

function cookieJarClient(cookies: CookieRow[]) {
  const env = requireLiveIntegration();
  return createBrowserClient(env.url, env.anonKey, {
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

async function httpApply(
  projectId: string,
  body: unknown,
  cookies: CookieRow[] | null,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (cookies && cookies.length > 0) {
    headers.cookie = cookieHeader(cookies);
  }
  const res = await fetch(
    `${baseUrl}/api/studio/projects/${projectId}/mix-working/apply`,
    {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    },
  );
  let json: Record<string, unknown> = {};
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    json = {};
  }
  return { status: res.status, json };
}

describe.runIf(live)(
  "A1 Mix Working apply — HTTP E2E (local Next)",
  () => {
  let admin: SupabaseClient;
  let ownerId = "";
  let otherId = "";
  let ownerEmail = "";
  let ownerPassword = "";
  let otherEmail = "";
  let otherPassword = "";
  let ownerCookies: CookieRow[] = [];
  let otherCookies: CookieRow[] = [];
  let projectId = "";
  let trackId = "";
  let fatProjectId = "";
  let fatTrackId = "";

  beforeAll(async () => {
    const env = requireLiveIntegration();
    admin = createClient(env.url, env.serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    async function makeUser(tag: string) {
      const email = `a1-http-${tag}-${randomUUID().slice(0, 8)}@example.com`;
      const password = `A1Http!${randomUUID()}`;
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (error || !data.user) throw new Error(error?.message ?? "createUser");
      const id = data.user.id;
      const { error: profileErr } = await admin.from("profiles").upsert({
        id,
        role: "USER",
        account_level: "BEGINNER_RAPPER",
        display_name: `A1HTTP ${tag}`,
      });
      if (profileErr) throw new Error(profileErr.message);
      return { id, email, password };
    }

    const owner = await makeUser("owner");
    const other = await makeUser("other");
    ownerId = owner.id;
    ownerEmail = owner.email;
    ownerPassword = owner.password;
    otherId = other.id;
    otherEmail = other.email;
    otherPassword = other.password;

    ownerCookies = [];
    const ownerClient = cookieJarClient(ownerCookies);
    const ownerSign = await ownerClient.auth.signInWithPassword({
      email: ownerEmail,
      password: ownerPassword,
    });
    if (ownerSign.error) throw new Error(ownerSign.error.message);

    otherCookies = [];
    const otherClient = cookieJarClient(otherCookies);
    const otherSign = await otherClient.auth.signInWithPassword({
      email: otherEmail,
      password: otherPassword,
    });
    if (otherSign.error) throw new Error(otherSign.error.message);

    const { data: project, error: pErr } = await admin
      .from("studio_projects")
      .insert({
        owner_id: ownerId,
        title: "A1 HTTP Verify",
        status: "ACTIVE",
        document_version: 1,
        master_gain_db: 0,
        master_pan: 0,
        master_fx_chain: emptyStudioFxChain(),
      })
      .select("id")
      .single();
    if (pErr || !project) throw new Error(pErr?.message ?? "project");
    projectId = project.id;

    const { data: track, error: tErr } = await admin
      .from("studio_tracks")
      .insert({
        project_id: projectId,
        name: "Vox",
        track_type: "VOCAL",
        sort_order: 0,
        gain_db: 0,
        pan: 0,
        muted: false,
        solo: false,
        effects_chain: emptyStudioFxChain(),
      })
      .select("id")
      .single();
    if (tErr || !track) throw new Error(tErr?.message ?? "track");
    trackId = track.id;

    // Fat tip for snapshot byte-limit HTTP case (limit is tip snapshot, not body).
    const { data: fatProject, error: fpErr } = await admin
      .from("studio_projects")
      .insert({
        owner_id: ownerId,
        title: "A1 HTTP Fat",
        status: "ACTIVE",
        document_version: 1,
        master_gain_db: 0,
        master_pan: 0,
        master_fx_chain: emptyStudioFxChain(),
      })
      .select("id")
      .single();
    if (fpErr || !fatProject) throw new Error(fpErr?.message ?? "fat project");
    fatProjectId = fatProject.id;

    // Tip exceeds export track limit (SSOT) → service LIMIT → SNAPSHOT_TOO_LARGE
    // before RPC. This is tip-document validation on the HTTP path, not a
    // request-body Content-Length cap.
    const trackRows = Array.from({ length: 9 }, (_, i) => ({
      project_id: fatProjectId,
      name: `Fat${i}`,
      track_type: "VOCAL" as const,
      sort_order: i,
      effects_chain: emptyStudioFxChain(),
    }));
    const { data: fatTracks, error: ftErr } = await admin
      .from("studio_tracks")
      .insert(trackRows)
      .select("id");
    if (ftErr || !fatTracks?.length) throw new Error(ftErr?.message ?? "fat tracks");
    fatTrackId = fatTracks[0]!.id;

    // Warm the route so case timeouts are not eaten by Next compile.
    await httpApply(
      projectId,
      {
        expectedDocumentVersion: 1,
        requestId: randomUUID(),
        ops: [{ op: "set_track_controls", trackId, gainDb: 0 }],
      },
      null,
    ).catch(() => undefined);
  }, 120_000);

  afterAll(async () => {
    if (!live) return;
    try {
      psql(`
DO $$
BEGIN
  PERFORM set_config('request.jwt.claim.role','service_role', true);
  DELETE FROM public.studio_mix_working_idempotency
    WHERE project_id IN ('${projectId}'::uuid, '${fatProjectId}'::uuid);
  DELETE FROM public.studio_projects
    WHERE id IN ('${projectId}'::uuid, '${fatProjectId}'::uuid);
END;
$$;
`);
    } catch {
      /* best-effort */
    }
    try {
      if (ownerId) await admin.auth.admin.deleteUser(ownerId);
    } catch {
      /* best-effort */
    }
    try {
      if (otherId) await admin.auth.admin.deleteUser(otherId);
    } catch {
      /* best-effort */
    }
  }, 60_000);

  function tip(project: string): number {
    return Number(
      psql(
        `SELECT document_version FROM public.studio_projects WHERE id='${project}';`,
      ),
    );
  }

  function idemCount(project: string): number {
    return Number(
      psql(
        `SELECT count(*) FROM public.studio_mix_working_idempotency WHERE project_id='${project}';`,
      ),
    );
  }

  it(
    "1) no session → 401 UNAUTHENTICATED",
    async () => {
    const before = tip(projectId);
    const beforeIdem = idemCount(projectId);
    const res = await httpApply(
      projectId,
      {
        expectedDocumentVersion: before,
        requestId: randomUUID(),
        ops: [{ op: "set_track_controls", trackId, gainDb: -1 }],
      },
      null,
    );
    expect(res.status).toBe(401);
    expect(tip(projectId)).toBe(before);
    expect(idemCount(projectId)).toBe(beforeIdem);
  },
    30_000,
  );

  it(
    "2) owner success → 200 + bump",
    async () => {
    const before = tip(projectId);
    const requestId = randomUUID();
    const res = await httpApply(
      projectId,
      {
        expectedDocumentVersion: before,
        requestId,
        ops: [
          { op: "set_track_controls", trackId, gainDb: -3, muted: true },
          { op: "set_master_mix", masterGainDb: -1 },
        ],
        ownerId: otherId, // must be ignored
      },
      ownerCookies,
    );
    expect(res.status).toBe(200);
    expect(res.json.success).toBe(true);
    expect(res.json.replay).toBe(false);
    expect(res.json.documentVersion).toBe(before + 1);
    expect(String(res.json.documentDigest)).toMatch(/^[a-f0-9]{64}$/);
    expect(tip(projectId)).toBe(before + 1);
  },
    30_000,
  );

  it(
    "3) identical retry → replay without second bump",
    async () => {
    const before = tip(projectId);
    const requestId = randomUUID();
    const body = {
      expectedDocumentVersion: before,
      requestId,
      ops: [{ op: "set_track_controls", trackId, gainDb: -2 }],
    };
    const first = await httpApply(projectId, body, ownerCookies);
    expect(first.status).toBe(200);
    expect(first.json.replay).toBe(false);
    const second = await httpApply(projectId, body, ownerCookies);
    expect(second.status).toBe(200);
    expect(second.json.replay).toBe(true);
    expect(second.json.documentVersion).toBe(first.json.documentVersion);
    expect(tip(projectId)).toBe(before + 1);
  },
    30_000,
  );

  it(
    "4) same requestId different fingerprint → 409 IDEMPOTENCY_KEY_REUSE",
    async () => {
    const before = tip(projectId);
    const requestId = randomUUID();
    const first = await httpApply(
      projectId,
      {
        expectedDocumentVersion: before,
        requestId,
        ops: [{ op: "set_track_controls", trackId, pan: -0.1 }],
      },
      ownerCookies,
    );
    expect(first.status).toBe(200);
    const after = tip(projectId);
    const reuse = await httpApply(
      projectId,
      {
        expectedDocumentVersion: after,
        requestId,
        ops: [{ op: "set_track_controls", trackId, pan: 0.2 }],
      },
      ownerCookies,
    );
    expect(reuse.status).toBe(409);
    expect(reuse.json.code).toBe("IDEMPOTENCY_KEY_REUSE");
    expect(tip(projectId)).toBe(after);
  },
    30_000,
  );

  it(
    "5) stale version → 409 FX_CHAIN_VERSION_CONFLICT",
    async () => {
    const before = tip(projectId);
    const res = await httpApply(
      projectId,
      {
        expectedDocumentVersion: before + 99,
        requestId: randomUUID(),
        ops: [{ op: "set_track_controls", trackId, gainDb: -1 }],
      },
      ownerCookies,
    );
    expect(res.status).toBe(409);
    expect(res.json.code).toBe("FX_CHAIN_VERSION_CONFLICT");
    expect(tip(projectId)).toBe(before);
  },
    30_000,
  );

  it(
    "6) non-owner → AuthError without write",
    async () => {
    const before = tip(projectId);
    const beforeIdem = idemCount(projectId);
    const res = await httpApply(
      projectId,
      {
        expectedDocumentVersion: before,
        requestId: randomUUID(),
        ops: [{ op: "set_track_controls", trackId, gainDb: -9 }],
      },
      otherCookies,
    );
    expect([403, 404]).toContain(res.status);
    expect(tip(projectId)).toBe(before);
    expect(idemCount(projectId)).toBe(beforeIdem);
  },
    30_000,
  );

  it(
    "7) invalid requestId → 400",
    async () => {
    const before = tip(projectId);
    const res = await httpApply(
      projectId,
      {
        expectedDocumentVersion: before,
        requestId: "not-a-uuid",
        ops: [{ op: "set_track_controls", trackId, gainDb: -1 }],
      },
      ownerCookies,
    );
    expect(res.status).toBe(400);
    expect(res.json.code).toBe("INVALID_REQUEST");
    expect(tip(projectId)).toBe(before);
  },
    30_000,
  );

  it(
    "8) forbidden op → 400 FORBIDDEN_OP without write",
    async () => {
    const before = tip(projectId);
    const beforeIdem = idemCount(projectId);
    const res = await httpApply(
      projectId,
      {
        expectedDocumentVersion: before,
        requestId: randomUUID(),
        ops: [
          {
            op: "set_track_controls",
            trackId,
            gainDb: -1,
            sourceTakeId: randomUUID(),
          },
        ],
      },
      ownerCookies,
    );
    expect(res.status).toBe(400);
    expect(res.json.code).toBe("FORBIDDEN_OP");
    expect(tip(projectId)).toBe(before);
    expect(idemCount(projectId)).toBe(beforeIdem);
  },
    30_000,
  );

  it(
    "9) tip export/snapshot LIMIT on HTTP → 400 SNAPSHOT_TOO_LARGE without write",
    async () => {
    // Distinguishes tip-side domain limit (tracks/bytes) from request-body size.
    // Here: tip has > STUDIO_EXPORT_MAX_TRACKS; apply rejects before RPC.
    const before = tip(fatProjectId);
    const beforeIdem = idemCount(fatProjectId);
    const res = await httpApply(
      fatProjectId,
      {
        expectedDocumentVersion: before,
        requestId: randomUUID(),
        ops: [{ op: "set_track_controls", trackId: fatTrackId, gainDb: -1 }],
      },
      ownerCookies,
    );
    expect(res.status).toBe(400);
    expect(res.json.code).toBe("SNAPSHOT_TOO_LARGE");
    expect(tip(fatProjectId)).toBe(before);
    expect(idemCount(fatProjectId)).toBe(beforeIdem);
  },
    30_000,
  );

  it(
    "10) valid apply after failed requests still works",
    async () => {
    const before = tip(projectId);
    const bad = await httpApply(
      projectId,
      {
        expectedDocumentVersion: before,
        requestId: "bad",
        ops: [{ op: "set_track_controls", trackId, gainDb: -1 }],
      },
      ownerCookies,
    );
    expect(bad.status).toBe(400);
    expect(tip(projectId)).toBe(before);

    const ok = await httpApply(
      projectId,
      {
        expectedDocumentVersion: before,
        requestId: randomUUID(),
        ops: [{ op: "set_track_controls", trackId, solo: true }],
      },
      ownerCookies,
    );
    expect(ok.status).toBe(200);
    expect(ok.json.success).toBe(true);
    expect(ok.json.replay).toBe(false);
    expect(tip(projectId)).toBe(before + 1);
  },
    30_000,
  );
  },
  180_000,
);

describe.runIf(!live)("A1 Mix Working apply — HTTP E2E gate", () => {
  it("NOT RUN — requires BRD_HTTP_E2E=1 and resolveIntegrationEnv()", () => {
    expect(live).toBe(false);
  });
});
