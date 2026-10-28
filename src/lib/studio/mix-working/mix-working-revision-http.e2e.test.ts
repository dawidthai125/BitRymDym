/**
 * A2.1 Mix Working revisions — real HTTP E2E against local Next.js + local Supabase.
 *
 * Gate: BRD_HTTP_E2E=1 and NEXT_HTTP_BASE_URL loopback
 * and resolveIntegrationEnv() (LOCAL_SUPABASE_* loopback).
 * Transport: fetch → App Router → session → service → local Supabase.
 * Does NOT call the service layer as a success substitute.
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
  method: string,
  path: string,
  body: unknown | undefined,
  cookies: CookieRow[] | null,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const headers: Record<string, string> = {};
  if (body !== undefined) {
    headers["content-type"] = "application/json";
  }
  if (cookies && cookies.length > 0) {
    headers.cookie = cookieHeader(cookies);
  }
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json: Record<string, unknown> = {};
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    json = {};
  }
  return { status: res.status, json };
}

function applyPath(projectId: string): string {
  return `/api/studio/projects/${projectId}/mix-working/apply`;
}
function revisionsPath(projectId: string, qs = ""): string {
  return `/api/studio/projects/${projectId}/mix-working/revisions${qs}`;
}
function revisionPath(projectId: string, revisionId: string): string {
  return `/api/studio/projects/${projectId}/mix-working/revisions/${revisionId}`;
}
function comparePath(projectId: string): string {
  return `/api/studio/projects/${projectId}/mix-working/revisions/compare`;
}
function restorePath(projectId: string, revisionId: string): string {
  return `/api/studio/projects/${projectId}/mix-working/revisions/${revisionId}/restore`;
}

describe.runIf(live)(
  "A2 Mix Working revisions — HTTP E2E (local Next)",
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
    let otherProjectId = "";
    let trackId = "";
    let revA = "";
    let revB = "";
    let revRestore = "";

    beforeAll(async () => {
      const env = requireLiveIntegration();
      admin = createClient(env.url, env.serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      async function makeUser(tag: string) {
        const email = `a2-http-${tag}-${randomUUID().slice(0, 8)}@example.com`;
        const password = `A2Http!${randomUUID()}`;
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
          display_name: `A2HTTP ${tag}`,
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
          title: "A2 HTTP Verify",
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

      const { data: otherProject, error: opErr } = await admin
        .from("studio_projects")
        .insert({
          owner_id: otherId,
          title: "A2 HTTP Other",
          status: "ACTIVE",
          document_version: 1,
          master_gain_db: 0,
          master_pan: 0,
          master_fx_chain: emptyStudioFxChain(),
        })
        .select("id")
        .single();
      if (opErr || !otherProject) throw new Error(opErr?.message ?? "other project");
      otherProjectId = otherProject.id;

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

      // Warm routes (compile) without requiring a successful auth write.
      await httpJson("GET", revisionsPath(projectId), undefined, null).catch(
        () => undefined,
      );
      await httpJson(
        "POST",
        applyPath(projectId),
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
    WHERE project_id IN ('${projectId}'::uuid, '${otherProjectId}'::uuid);
  DELETE FROM public.studio_mix_working_revisions
    WHERE project_id IN ('${projectId}'::uuid, '${otherProjectId}'::uuid);
  DELETE FROM public.studio_projects
    WHERE id IN ('${projectId}'::uuid, '${otherProjectId}'::uuid);
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

    function revCount(project: string): number {
      return Number(
        psql(
          `SELECT count(*) FROM public.studio_mix_working_revisions WHERE project_id='${project}';`,
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
      "A1) no session → 401 on list/detail/compare/restore/apply",
      async () => {
        const before = tip(projectId);
        const beforeRev = revCount(projectId);
        const fakeRev = randomUUID();
        const list = await httpJson(
          "GET",
          revisionsPath(projectId),
          undefined,
          null,
        );
        const detail = await httpJson(
          "GET",
          revisionPath(projectId, fakeRev),
          undefined,
          null,
        );
        const compare = await httpJson(
          "POST",
          comparePath(projectId),
          { fromRevisionId: fakeRev, toRevisionId: fakeRev },
          null,
        );
        const restore = await httpJson(
          "POST",
          restorePath(projectId, fakeRev),
          {
            expectedDocumentVersion: before,
            requestId: randomUUID(),
          },
          null,
        );
        const apply = await httpJson(
          "POST",
          applyPath(projectId),
          {
            expectedDocumentVersion: before,
            requestId: randomUUID(),
            ops: [{ op: "set_track_controls", trackId, gainDb: -1 }],
          },
          null,
        );
        expect(list.status).toBe(401);
        expect(detail.status).toBe(401);
        expect(compare.status).toBe(401);
        expect(restore.status).toBe(401);
        expect(apply.status).toBe(401);
        expect(tip(projectId)).toBe(before);
        expect(revCount(projectId)).toBe(beforeRev);
      },
      60_000,
    );

    it(
      "B1) owner apply creates one revision; list/detail/pagination",
      async () => {
        const before = tip(projectId);
        const beforeRev = revCount(projectId);
        const apply1 = await httpJson(
          "POST",
          applyPath(projectId),
          {
            expectedDocumentVersion: before,
            requestId: randomUUID(),
            ops: [
              { op: "set_track_controls", trackId, gainDb: -4, muted: true },
            ],
            ownerId: otherId,
          },
          ownerCookies,
        );
        expect(apply1.status).toBe(200);
        expect(apply1.json.success).toBe(true);
        expect(apply1.json.replay).toBe(false);
        expect(apply1.json.revisionId).toBeTruthy();
        expect(tip(projectId)).toBe(before + 1);
        expect(revCount(projectId)).toBe(beforeRev + 1);
        revA = String(apply1.json.revisionId);

        const apply2 = await httpJson(
          "POST",
          applyPath(projectId),
          {
            expectedDocumentVersion: tip(projectId),
            requestId: randomUUID(),
            ops: [{ op: "set_master_mix", masterGainDb: -2, masterPan: 0.25 }],
          },
          ownerCookies,
        );
        expect(apply2.status).toBe(200);
        revB = String(apply2.json.revisionId);
        expect(revCount(projectId)).toBe(beforeRev + 2);

        const page1 = await httpJson(
          "GET",
          revisionsPath(projectId, "?limit=1"),
          undefined,
          ownerCookies,
        );
        expect(page1.status).toBe(200);
        expect(page1.json.success).toBe(true);
        const revs1 = page1.json.revisions as Array<Record<string, unknown>>;
        expect(revs1).toHaveLength(1);
        expect(revs1[0]).not.toHaveProperty("snapshot");
        expect(revs1[0]!.hasSnapshot).toBe(true);
        expect(page1.json.nextCursor).toBeTruthy();

        const page2 = await httpJson(
          "GET",
          revisionsPath(
            projectId,
            `?limit=1&cursor=${encodeURIComponent(String(page1.json.nextCursor))}`,
          ),
          undefined,
          ownerCookies,
        );
        expect(page2.status).toBe(200);
        const revs2 = page2.json.revisions as Array<Record<string, unknown>>;
        expect(revs2).toHaveLength(1);
        expect(revs2[0]!.id).not.toBe(revs1[0]!.id);

        const badLimit = await httpJson(
          "GET",
          revisionsPath(projectId, "?limit=999"),
          undefined,
          ownerCookies,
        );
        expect(badLimit.status).toBe(400);
        expect(badLimit.json.code).toBe("INVALID_REQUEST");

        const detail = await httpJson(
          "GET",
          revisionPath(projectId, revA),
          undefined,
          ownerCookies,
        );
        expect(detail.status).toBe(200);
        const revision = detail.json.revision as Record<string, unknown>;
        expect(revision.id).toBe(revA);
        expect(revision.kind).toBe("tip_apply");
        const snapshot = revision.snapshot as Record<string, unknown>;
        expect(snapshot.snapshotKind).toBe("MIX_WORKING");
        expect(revision.ops).toBeTruthy();

        const badId = await httpJson(
          "GET",
          revisionPath(projectId, "not-a-uuid"),
          undefined,
          ownerCookies,
        );
        expect(badId.status).toBe(400);
        expect(badId.json.code).toBe("INVALID_REQUEST");
      },
      60_000,
    );

    it(
      "C1) compare deterministic + isolation",
      async () => {
        // Apply a track-only change so compare can show channel + master deltas.
        const apply3 = await httpJson(
          "POST",
          applyPath(projectId),
          {
            expectedDocumentVersion: tip(projectId),
            requestId: randomUUID(),
            ops: [{ op: "set_track_controls", trackId, pan: -0.35 }],
          },
          ownerCookies,
        );
        expect(apply3.status).toBe(200);
        const revC = String(apply3.json.revisionId);

        const first = await httpJson(
          "POST",
          comparePath(projectId),
          { fromRevisionId: revA, toRevisionId: revC, ownerId: otherId },
          ownerCookies,
        );
        expect(first.status).toBe(200);
        const diff1 = first.json.diff as Record<string, unknown>;
        expect(diff1.kind).toBe("MIX_WORKING_REVISION_DIFF");
        expect(diff1.projectId).toBe(projectId);
        const changes1 = diff1.changes as Array<{ path: string }>;
        const paths = changes1.map((c) => c.path).sort();
        expect(paths).toContain("project.masterGainDb");
        expect(paths).toContain(`tracks.${trackId}.pan`);

        const second = await httpJson(
          "POST",
          comparePath(projectId),
          { fromRevisionId: revA, toRevisionId: revC },
          ownerCookies,
        );
        expect(second.status).toBe(200);
        expect(JSON.stringify(second.json.diff)).toBe(JSON.stringify(diff1));

        const missing = await httpJson(
          "POST",
          comparePath(projectId),
          { fromRevisionId: revA, toRevisionId: randomUUID() },
          ownerCookies,
        );
        expect(missing.status).toBe(404);
        expect(missing.json.code).toBe("REVISION_NOT_FOUND");

        // Other owner cannot compare using owner's revision ids on own project.
        const foreign = await httpJson(
          "POST",
          comparePath(otherProjectId),
          { fromRevisionId: revA, toRevisionId: revB },
          otherCookies,
        );
        expect(foreign.status).toBe(404);
        expect(foreign.json.code).toBe("REVISION_NOT_FOUND");
      },
      60_000,
    );

    it(
      "A2) non-owner denied list/detail/restore; missing project opaque",
      async () => {
        const before = tip(projectId);
        const beforeRev = revCount(projectId);
        const list = await httpJson(
          "GET",
          revisionsPath(projectId),
          undefined,
          otherCookies,
        );
        expect([403, 404]).toContain(list.status);

        const detail = await httpJson(
          "GET",
          revisionPath(projectId, revA),
          undefined,
          otherCookies,
        );
        expect([403, 404]).toContain(detail.status);

        const restore = await httpJson(
          "POST",
          restorePath(projectId, revA),
          {
            expectedDocumentVersion: before,
            requestId: randomUUID(),
            ownerId: ownerId,
          },
          otherCookies,
        );
        expect([403, 404]).toContain(restore.status);
        expect(tip(projectId)).toBe(before);
        expect(revCount(projectId)).toBe(beforeRev);

        const missingProject = await httpJson(
          "GET",
          revisionsPath(randomUUID()),
          undefined,
          ownerCookies,
        );
        expect(missingProject.status).toBe(404);
      },
      60_000,
    );

    it(
      "D1) restore creates new restored revision; replay/CAS/no-ops",
      async () => {
        const beforeTip = tip(projectId);
        const beforeRev = revCount(projectId);
        const sourceDigest = String(
          (
            (
              await httpJson(
                "GET",
                revisionPath(projectId, revA),
                undefined,
                ownerCookies,
              )
            ).json.revision as Record<string, unknown>
          ).documentDigest,
        );

        const requestId = randomUUID();
        const restore = await httpJson(
          "POST",
          restorePath(projectId, revA),
          {
            expectedDocumentVersion: beforeTip,
            requestId,
            ownerId: otherId,
          },
          ownerCookies,
        );
        expect(restore.status).toBe(200);
        expect(restore.json.success).toBe(true);
        expect(restore.json.replay).toBe(false);
        expect(restore.json.revisionId).toBeTruthy();
        expect(restore.json.revisionId).not.toBe(revA);
        expect(tip(projectId)).toBe(beforeTip + 1);
        expect(revCount(projectId)).toBe(beforeRev + 1);
        revRestore = String(restore.json.revisionId);

        const newDetail = await httpJson(
          "GET",
          revisionPath(projectId, revRestore),
          undefined,
          ownerCookies,
        );
        expect(newDetail.status).toBe(200);
        const newRev = newDetail.json.revision as Record<string, unknown>;
        expect(newRev.kind).toBe("restored");
        expect(newRev.restoredFromRevisionId).toBe(revA);

        const sourceAfter = await httpJson(
          "GET",
          revisionPath(projectId, revA),
          undefined,
          ownerCookies,
        );
        expect(
          (sourceAfter.json.revision as Record<string, unknown>).documentDigest,
        ).toBe(sourceDigest);

        // A2.2: identical restore retry → replay via A1 ledger (no second bump/rev).
        const replay = await httpJson(
          "POST",
          restorePath(projectId, revA),
          {
            expectedDocumentVersion: beforeTip,
            requestId,
          },
          ownerCookies,
        );
        expect(replay.status).toBe(200);
        expect(replay.json.replay).toBe(true);
        expect(replay.json.revisionId).toBe(revRestore);
        expect(replay.json.documentVersion).toBe(restore.json.documentVersion);
        expect(replay.json.documentDigest).toBe(restore.json.documentDigest);
        expect(tip(projectId)).toBe(beforeTip + 1);
        expect(revCount(projectId)).toBe(beforeRev + 1);

        // Same requestId, different restore target → KEY_REUSE, no mutation.
        const reuse = await httpJson(
          "POST",
          restorePath(projectId, revB),
          {
            expectedDocumentVersion: beforeTip,
            requestId,
          },
          ownerCookies,
        );
        expect(reuse.status).toBe(409);
        expect(reuse.json.code).toBe("IDEMPOTENCY_KEY_REUSE");
        expect(tip(projectId)).toBe(beforeTip + 1);
        expect(revCount(projectId)).toBe(beforeRev + 1);

        // Tip still matches revA mix plane → fresh requestId → REVISION_INVALID.
        const noop = await httpJson(
          "POST",
          restorePath(projectId, revA),
          {
            expectedDocumentVersion: tip(projectId),
            requestId: randomUUID(),
          },
          ownerCookies,
        );
        expect(noop.status).toBe(400);
        expect(noop.json.code).toBe("REVISION_INVALID");
        expect(tip(projectId)).toBe(beforeTip + 1);
        expect(revCount(projectId)).toBe(beforeRev + 1);

        // Advance tip, then historical restore replay still returns original result.
        const advance = await httpJson(
          "POST",
          applyPath(projectId),
          {
            expectedDocumentVersion: tip(projectId),
            requestId: randomUUID(),
            ops: [{ op: "set_track_controls", trackId, gainDb: -9 }],
          },
          ownerCookies,
        );
        expect(advance.status).toBe(200);
        const tipAfterAdvance = tip(projectId);
        const revAfterAdvance = revCount(projectId);
        const replayAfterAdvance = await httpJson(
          "POST",
          restorePath(projectId, revA),
          {
            expectedDocumentVersion: beforeTip,
            requestId,
          },
          ownerCookies,
        );
        expect(replayAfterAdvance.status).toBe(200);
        expect(replayAfterAdvance.json.replay).toBe(true);
        expect(replayAfterAdvance.json.revisionId).toBe(revRestore);
        expect(replayAfterAdvance.json.documentVersion).toBe(
          restore.json.documentVersion,
        );
        expect(tip(projectId)).toBe(tipAfterAdvance);
        expect(revCount(projectId)).toBe(revAfterAdvance);

        // Stale CAS on a differing revision (revB) — no partial write.
        const tipBeforeCas = tip(projectId);
        const revBeforeCas = revCount(projectId);
        const stale = await httpJson(
          "POST",
          restorePath(projectId, revB),
          {
            expectedDocumentVersion: tipBeforeCas + 99,
            requestId: randomUUID(),
          },
          ownerCookies,
        );
        expect(stale.status).toBe(409);
        expect(stale.json.code).toBe("FX_CHAIN_VERSION_CONFLICT");
        expect(tip(projectId)).toBe(tipBeforeCas);
        expect(revCount(projectId)).toBe(revBeforeCas);

        // Non-owner cannot replay owner's restore idempotency.
        const otherReplay = await httpJson(
          "POST",
          restorePath(projectId, revA),
          {
            expectedDocumentVersion: beforeTip,
            requestId,
          },
          otherCookies,
        );
        expect([403, 404]).toContain(otherReplay.status);
        expect(tip(projectId)).toBe(tipBeforeCas);
        expect(revCount(projectId)).toBe(revBeforeCas);
      },
      120_000,
    );

    it(
      "E1) apply replay/CAS/invalid do not create revisions; recovery works",
      async () => {
        const beforeTip = tip(projectId);
        const beforeRev = revCount(projectId);
        const beforeIdem = idemCount(projectId);

        const requestId = randomUUID();
        const first = await httpJson(
          "POST",
          applyPath(projectId),
          {
            expectedDocumentVersion: beforeTip,
            requestId,
            ops: [{ op: "set_track_controls", trackId, solo: true }],
          },
          ownerCookies,
        );
        expect(first.status).toBe(200);
        expect(first.json.replay).toBe(false);
        expect(revCount(projectId)).toBe(beforeRev + 1);
        const createdRev = String(first.json.revisionId);

        const replay = await httpJson(
          "POST",
          applyPath(projectId),
          {
            expectedDocumentVersion: beforeTip,
            requestId,
            ops: [{ op: "set_track_controls", trackId, solo: true }],
          },
          ownerCookies,
        );
        expect(replay.status).toBe(200);
        expect(replay.json.replay).toBe(true);
        expect(replay.json.revisionId).toBe(createdRev);
        expect(tip(projectId)).toBe(beforeTip + 1);
        expect(revCount(projectId)).toBe(beforeRev + 1);

        const casTip = tip(projectId);
        const casRev = revCount(projectId);
        const cas = await httpJson(
          "POST",
          applyPath(projectId),
          {
            expectedDocumentVersion: casTip + 50,
            requestId: randomUUID(),
            ops: [{ op: "set_track_controls", trackId, gainDb: -1 }],
          },
          ownerCookies,
        );
        expect(cas.status).toBe(409);
        expect(cas.json.code).toBe("FX_CHAIN_VERSION_CONFLICT");
        expect(tip(projectId)).toBe(casTip);
        expect(revCount(projectId)).toBe(casRev);

        const bad = await httpJson(
          "POST",
          applyPath(projectId),
          {
            expectedDocumentVersion: casTip,
            requestId: "bad",
            ops: [{ op: "set_track_controls", trackId, gainDb: -1 }],
          },
          ownerCookies,
        );
        expect(bad.status).toBe(400);
        expect(tip(projectId)).toBe(casTip);
        expect(revCount(projectId)).toBe(casRev);
        expect(idemCount(projectId)).toBe(beforeIdem + 1);

        const ok = await httpJson(
          "POST",
          applyPath(projectId),
          {
            expectedDocumentVersion: casTip,
            requestId: randomUUID(),
            ops: [{ op: "set_track_controls", trackId, pan: 0.1 }],
          },
          ownerCookies,
        );
        expect(ok.status).toBe(200);
        expect(ok.json.success).toBe(true);
        expect(tip(projectId)).toBe(casTip + 1);
        expect(revCount(projectId)).toBe(casRev + 1);
      },
      60_000,
    );
  },
  240_000,
);

describe.runIf(!live)("A2 Mix Working revisions — HTTP E2E gate", () => {
  it("NOT RUN — requires BRD_HTTP_E2E=1 and resolveIntegrationEnv()", () => {
    expect(live).toBe(false);
  });
});
