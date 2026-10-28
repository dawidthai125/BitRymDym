/**
 * A3.5 — legacy Mix Working HTTP routes create atomic revisions (local Next).
 * Gate: BRD_HTTP_E2E=1 and NEXT_HTTP_BASE_URL loopback
 * and resolveIntegrationEnv() (LOCAL_SUPABASE_* loopback).
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

async function httpJson(
  path: string,
  method: string,
  body: unknown,
  cookies: CookieRow[],
): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      cookie: cookieHeader(cookies),
    },
    body: JSON.stringify(body),
  });
  let json: Record<string, unknown> = {};
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    json = {};
  }
  return { status: res.status, json };
}

describe.runIf(live)("A3.5 legacy Mix HTTP → revision gateway (local Next)", () => {
  let admin: SupabaseClient;
  let ownerId = "";
  let ownerCookies: CookieRow[] = [];
  let projectId = "";
  let trackId = "";
  let version = 1;

  beforeAll(async () => {
    const env = requireLiveIntegration();
    admin = createClient(env.url, env.serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const email = `a35-http-${randomUUID().slice(0, 8)}@example.com`;
    const password = `A35Http!${randomUUID()}`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error || !data.user) throw new Error(error?.message ?? "createUser");
    ownerId = data.user.id;
    await admin.from("profiles").upsert({
      id: ownerId,
      role: "USER",
      account_level: "BEGINNER_RAPPER",
      display_name: "A35HTTP",
    });

    ownerCookies = [];
    const client = cookieJarClient(ownerCookies);
    const sign = await client.auth.signInWithPassword({ email, password });
    if (sign.error) throw new Error(sign.error.message);

    const { data: project, error: pErr } = await admin
      .from("studio_projects")
      .insert({
        owner_id: ownerId,
        title: "A35 HTTP Legacy",
        status: "ACTIVE",
        document_version: 1,
        master_gain_db: 0,
        master_pan: 0,
        master_fx_chain: emptyStudioFxChain(),
      })
      .select("id, document_version")
      .single();
    if (pErr || !project) throw new Error(pErr?.message ?? "project");
    projectId = project.id;
    version = Number(project.document_version);

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
  }, 60_000);

  afterAll(async () => {
    if (!live || !projectId) return;
    try {
      psql(`
DO $$
BEGIN
  PERFORM set_config('request.jwt.claim.role','service_role', true);
  DELETE FROM public.studio_mix_working_idempotency WHERE project_id = '${projectId}';
  DELETE FROM public.studio_mix_working_revisions WHERE project_id = '${projectId}';
  DELETE FROM public.studio_projects WHERE id = '${projectId}';
  DELETE FROM public.profiles WHERE id = '${ownerId}';
  DELETE FROM auth.users WHERE id = '${ownerId}';
END;
$$;
`);
    } catch {
      /* best-effort */
    }
  }, 60_000);

  function revCount(): number {
    return Number(
      psql(
        `SELECT count(*) FROM public.studio_mix_working_revisions WHERE project_id='${projectId}';`,
      ),
    );
  }

  function tipParent(): string {
    return psql(`
SELECT coalesce(parent_revision_id::text, 'NULL')
FROM public.studio_mix_working_revisions
WHERE project_id='${projectId}'
ORDER BY source_document_version DESC
LIMIT 1;
`);
  }

  it("PATCH master mix creates one revision", async () => {
    const before = revCount();
    const { status, json } = await httpJson(
      `/api/studio/projects/${projectId}`,
      "PATCH",
      { expectedDocumentVersion: version, masterGainDb: -2 },
      ownerCookies,
    );
    expect(status).toBe(200);
    expect(json.documentVersion).toBe(version + 1);
    version = Number(json.documentVersion);
    expect(revCount()).toBe(before + 1);
    expect(tipParent()).toBe("NULL");
  });

  it("PATCH track controls creates revision with tip parent", async () => {
    const parentBefore = psql(`
SELECT id::text FROM public.studio_mix_working_revisions
WHERE project_id='${projectId}'
ORDER BY source_document_version DESC LIMIT 1;
`);
    const before = revCount();
    const { status, json } = await httpJson(
      `/api/studio/projects/${projectId}/tracks/${trackId}`,
      "PATCH",
      { expectedDocumentVersion: version, gainDb: -4, solo: true },
      ownerCookies,
    );
    expect(status).toBe(200);
    expect(json.documentVersion).toBe(version + 1);
    version = Number(json.documentVersion);
    expect(revCount()).toBe(before + 1);
    expect(tipParent()).toBe(parentBefore);
  });

  it("PATCH track effects creates one revision", async () => {
    const parentId = psql(`
SELECT id::text FROM public.studio_mix_working_revisions
WHERE project_id='${projectId}'
ORDER BY source_document_version DESC LIMIT 1;
`);
    const before = revCount();
    const { status, json } = await httpJson(
      `/api/studio/projects/${projectId}/tracks/${trackId}/effects`,
      "PATCH",
      {
        expectedDocumentVersion: version,
        chain: emptyStudioFxChain(),
      },
      ownerCookies,
    );
    expect(status).toBe(200);
    expect(json.documentVersion).toBe(version + 1);
    version = Number(json.documentVersion);
    expect(revCount()).toBe(before + 1);
    expect(tipParent()).toBe(parentId);
  });

  it("PATCH master-fx creates one revision", async () => {
    const parentId = psql(`
SELECT id::text FROM public.studio_mix_working_revisions
WHERE project_id='${projectId}'
ORDER BY source_document_version DESC LIMIT 1;
`);
    const before = revCount();
    const { status, json } = await httpJson(
      `/api/studio/projects/${projectId}/master-fx`,
      "PATCH",
      {
        expectedDocumentVersion: version,
        chain: emptyStudioFxChain(),
      },
      ownerCookies,
    );
    expect(status).toBe(200);
    expect(json.documentVersion).toBe(version + 1);
    version = Number(json.documentVersion);
    expect(revCount()).toBe(before + 1);
    expect(tipParent()).toBe(parentId);
  });
});

describe.runIf(!live)("A3.5 legacy Mix HTTP E2E gate", () => {
  it("NOT RUN — requires BRD_HTTP_E2E=1 and resolveIntegrationEnv()", () => {
    expect(live).toBe(false);
  });
});
