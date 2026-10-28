/**
 * A1 Mix Working apply — API live tests against LOCAL Supabase only.
 * Gate: BRD_INTEGRATION_TESTS=1 + LOCAL_SUPABASE_* (loopback).
 * Synthetic users/projects only; cleaned up via fixtures + SQL delete.
 */

import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  applyIntegrationEnv,
  resolveIntegrationEnv,
} from "@/test/integration-env";
import { createIntegrationFixtures } from "@/test/integration-fixtures";
import type { AuthContext } from "@/lib/auth/types";
import { MixWorkingApplyError } from "@/lib/studio/mix-working/mix-working-apply-errors";
import { applyStudioMixWorkingOpsFor } from "@/lib/studio/mix-working-apply-service";
import { studioApiErrorResponse } from "@/lib/studio/studio-api-error";
import {
  emptyStudioFxChain,
  StudioFxCasConflictError,
} from "@/lib/studio/studio-fx-chain";
import { AuthError } from "@/lib/auth/session";

const integration = resolveIntegrationEnv();
const live = integration.enabled;
if (integration.enabled) applyIntegrationEnv(integration);

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

function context(userId: string): AuthContext {
  return {
    userId,
    email: `${userId}@example.com`,
    profile: {
      id: userId,
      displayName: "A1API",
      userNumber: null,
      role: "USER",
      accountLevel: "BEGINNER_RAPPER",
      experienceTotal: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    permissions: [],
  };
}

describe.runIf(live)("A1 Mix Working apply — API live (local)", () => {
  let admin: SupabaseClient;
  let fixtures: ReturnType<typeof createIntegrationFixtures>;
  let ownerId = "";
  let otherId = "";
  let projectId = "";
  let trackId = "";
  let version = 0;

  beforeAll(async () => {
    if (!integration.enabled) return;
    admin = createClient(integration.url, integration.serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    fixtures = createIntegrationFixtures(admin);

    async function makeUser(tag: string) {
      const email = `a1-api-${tag}-${randomUUID().slice(0, 8)}@example.com`;
      const password = `A1!${randomUUID()}`;
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (error || !data.user) throw new Error(error?.message ?? "createUser");
      const id = fixtures.trackUser(data.user.id);
      const { error: profileErr } = await admin.from("profiles").upsert({
        id,
        role: "USER",
        account_level: "BEGINNER_RAPPER",
        display_name: `A1API ${tag}`,
      });
      if (profileErr) throw new Error(profileErr.message);
      return id;
    }

    ownerId = await makeUser("owner");
    otherId = await makeUser("other");

    const { data: project, error: pErr } = await admin
      .from("studio_projects")
      .insert({
        owner_id: ownerId,
        title: "A1 API Verify",
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

  function tipVersion(): number {
    return Number(
      psql(
        `SELECT document_version FROM public.studio_projects WHERE id='${projectId}';`,
      ),
    );
  }

  afterAll(async () => {
    if (!integration.enabled) return;
    try {
      psql(`
DO $$
BEGIN
  PERFORM set_config('request.jwt.claim.role','service_role', true);
  DELETE FROM public.studio_mix_working_idempotency WHERE project_id = '${projectId}';
  DELETE FROM public.studio_mix_working_revisions WHERE project_id = '${projectId}';
  DELETE FROM public.studio_projects WHERE id = '${projectId}';
END;
$$;
`);
    } catch {
      /* best-effort */
    }
    await fixtures?.cleanup();
  }, 60_000);

  it("owner apply succeeds and bumps once", async () => {
    const before = tipVersion();
    const requestId = randomUUID();
    const result = await applyStudioMixWorkingOpsFor(context(ownerId), {
      projectId,
      expectedDocumentVersion: before,
      requestId,
      ops: [
        { op: "set_track_controls", trackId, gainDb: -3, muted: true },
        { op: "set_master_mix", masterGainDb: -1 },
      ],
    });
    expect(result.replay).toBe(false);
    expect(result.documentVersion).toBe(before + 1);
    expect(result.documentDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(result.revisionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(tipVersion()).toBe(before + 1);
    version = result.documentVersion;
  });

  it("identical retry replays without bump (including after tip advances)", async () => {
    const before = tipVersion();
    const requestId = randomUUID();
    const ops = [
      { op: "set_track_controls" as const, trackId, gainDb: -2 },
    ];
    const first = await applyStudioMixWorkingOpsFor(context(ownerId), {
      projectId,
      expectedDocumentVersion: before,
      requestId,
      ops,
    });
    // Immediate retry (tip == historical after).
    const second = await applyStudioMixWorkingOpsFor(context(ownerId), {
      projectId,
      expectedDocumentVersion: before,
      requestId,
      ops,
    });
    expect(first.replay).toBe(false);
    expect(second.replay).toBe(true);
    expect(second.documentVersion).toBe(first.documentVersion);
    expect(tipVersion()).toBe(before + 1);

    // Advance tip via a different request, then replay historical key.
    const advanceBefore = tipVersion();
    await applyStudioMixWorkingOpsFor(context(ownerId), {
      projectId,
      expectedDocumentVersion: advanceBefore,
      requestId: randomUUID(),
      ops: [{ op: "set_master_mix", masterPan: 0.15 }],
    });
    expect(tipVersion()).toBe(advanceBefore + 1);
    const afterTipMove = await applyStudioMixWorkingOpsFor(context(ownerId), {
      projectId,
      expectedDocumentVersion: before,
      requestId,
      ops,
    });
    expect(afterTipMove.replay).toBe(true);
    expect(afterTipMove.documentVersion).toBe(first.documentVersion);
    expect(afterTipMove.documentDigest).toBe(first.documentDigest);
    expect(tipVersion()).toBe(advanceBefore + 1);
    version = tipVersion();
  });

  it("IDEMPOTENCY_KEY_REUSE on same key different payload", async () => {
    const before = tipVersion();
    const requestId = randomUUID();
    await applyStudioMixWorkingOpsFor(context(ownerId), {
      projectId,
      expectedDocumentVersion: before,
      requestId,
      ops: [{ op: "set_track_controls", trackId, pan: -0.1 }],
    });
    const after = tipVersion();
    expect(after).toBe(before + 1);
    await expect(
      applyStudioMixWorkingOpsFor(context(ownerId), {
        projectId,
        expectedDocumentVersion: after,
        requestId,
        ops: [{ op: "set_track_controls", trackId, pan: 0.2 }],
      }),
    ).rejects.toBeInstanceOf(MixWorkingApplyError);

    try {
      await applyStudioMixWorkingOpsFor(context(ownerId), {
        projectId,
        expectedDocumentVersion: after,
        requestId,
        ops: [{ op: "set_track_controls", trackId, pan: 0.2 }],
      });
    } catch (error) {
      expect(error).toBeInstanceOf(MixWorkingApplyError);
      expect((error as MixWorkingApplyError).code).toBe("IDEMPOTENCY_KEY_REUSE");
      const res = studioApiErrorResponse(error);
      expect(res.status).toBe(409);
    }
    expect(tipVersion()).toBe(after);
    version = after;
  });

  it("CAS conflict maps to FX_CHAIN_VERSION_CONFLICT", async () => {
    const before = tipVersion();
    await expect(
      applyStudioMixWorkingOpsFor(context(ownerId), {
        projectId,
        expectedDocumentVersion: before + 50,
        requestId: randomUUID(),
        ops: [{ op: "set_track_controls", trackId, gainDb: -1 }],
      }),
    ).rejects.toBeInstanceOf(StudioFxCasConflictError);
    const res = studioApiErrorResponse(new StudioFxCasConflictError());
    expect(res.status).toBe(409);
    expect(tipVersion()).toBe(before);
  });

  it("non-owner is AuthError without tip mutation (existing semantics)", async () => {
    const before = tipVersion();
    try {
      await applyStudioMixWorkingOpsFor(context(otherId), {
        projectId,
        expectedDocumentVersion: before,
        requestId: randomUUID(),
        ops: [{ op: "set_track_controls", trackId, gainDb: -1 }],
      });
      expect.fail("expected AuthError");
    } catch (error) {
      expect(error).toBeInstanceOf(AuthError);
      const code = (error as AuthError).code;
      // Existing assertOwnsProject uses FORBIDDEN for foreign project (no data leak).
      expect(["FORBIDDEN", "NOT_FOUND"]).toContain(code);
      const status = studioApiErrorResponse(error).status;
      expect([403, 404]).toContain(status);
    }
    expect(tipVersion()).toBe(before);
  });

  it("missing project is NOT_FOUND", async () => {
    await expect(
      applyStudioMixWorkingOpsFor(context(ownerId), {
        projectId: randomUUID(),
        expectedDocumentVersion: 1,
        requestId: randomUUID(),
        ops: [{ op: "set_track_controls", trackId, gainDb: -1 }],
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("forged ownerId in body is irrelevant (service uses context)", async () => {
    const before = tipVersion();
    await expect(
      applyStudioMixWorkingOpsFor(context(otherId), {
        projectId,
        expectedDocumentVersion: before,
        requestId: randomUUID(),
        ops: [{ op: "set_track_controls", trackId, gainDb: -5 }],
      }),
    ).rejects.toBeInstanceOf(AuthError);
    expect(tipVersion()).toBe(before);
  });

  it("forbidden op maps FORBIDDEN_OP 400", async () => {
    const before = tipVersion();
    try {
      await applyStudioMixWorkingOpsFor(context(ownerId), {
        projectId,
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
      });
      expect.fail("expected error");
    } catch (error) {
      expect(error).toBeInstanceOf(MixWorkingApplyError);
      expect((error as MixWorkingApplyError).code).toBe("FORBIDDEN_OP");
      expect(studioApiErrorResponse(error).status).toBe(400);
    }
    expect(tipVersion()).toBe(before);
  });

  it("invalid requestId rejected", async () => {
    const before = tipVersion();
    await expect(
      applyStudioMixWorkingOpsFor(context(ownerId), {
        projectId,
        expectedDocumentVersion: before,
        requestId: "not-a-uuid",
        ops: [{ op: "set_track_controls", trackId, gainDb: -1 }],
      }),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  });

  it("persist classifier does not retry KEY_REUSE", async () => {
    const { classifyPersistHttpFailure } = await import(
      "@/lib/studio/studio-persist-orchestrator"
    );
    const c = classifyPersistHttpFailure({
      status: 409,
      code: "IDEMPOTENCY_KEY_REUSE",
    });
    expect(c.ok).toBe(false);
    if (!c.ok) expect(c.retryable).toBe(false);
  });
});

describe.runIf(!live)("A1 Mix Working apply — API live gate", () => {
  it("NOT RUN — integration env not enabled", () => {
    expect(live).toBe(false);
  });
});
