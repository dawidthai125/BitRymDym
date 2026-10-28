/**
 * A2 Mix Working revisions — API live tests against LOCAL Supabase only.
 * Gate: BRD_INTEGRATION_TESTS=1 + LOCAL_SUPABASE_* (loopback).
 */

import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AuthError } from "@/lib/auth/session";
import type { AuthContext } from "@/lib/auth/types";
import { MixWorkingApplyError } from "@/lib/studio/mix-working/mix-working-apply-errors";
import { applyStudioMixWorkingOpsFor } from "@/lib/studio/mix-working-apply-service";
import {
  compareMixWorkingRevisionsFor,
  getMixWorkingRevisionFor,
  listMixWorkingRevisionsFor,
  restoreMixWorkingRevisionFor,
} from "@/lib/studio/mix-working-revision-service";
import { studioApiErrorResponse } from "@/lib/studio/studio-api-error";
import { emptyStudioFxChain } from "@/lib/studio/studio-fx-chain";
import {
  applyIntegrationEnv,
  resolveIntegrationEnv,
} from "@/test/integration-env";
import { createIntegrationFixtures } from "@/test/integration-fixtures";

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
      displayName: "A2API",
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

describe.runIf(live)("A2 Mix Working revisions — API live (local)", () => {
  let admin: SupabaseClient;
  let fixtures: ReturnType<typeof createIntegrationFixtures>;
  let ownerId = "";
  let otherId = "";
  let projectId = "";
  let otherProjectId = "";
  let trackId = "";
  let revA = "";
  let revB = "";

  beforeAll(async () => {
    if (!integration.enabled) return;
    admin = createClient(integration.url, integration.serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    fixtures = createIntegrationFixtures(admin);

    async function makeUser(tag: string) {
      const email = `a2-api-${tag}-${randomUUID().slice(0, 8)}@example.com`;
      const password = `A2!${randomUUID()}`;
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
        display_name: `A2API ${tag}`,
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
        title: "A2 API Verify",
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

    const { data: otherProject, error: opErr } = await admin
      .from("studio_projects")
      .insert({
        owner_id: otherId,
        title: "A2 Other Project",
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
  }, 60_000);

  function tipVersion(): number {
    return Number(
      psql(
        `SELECT document_version FROM public.studio_projects WHERE id='${projectId}';`,
      ),
    );
  }

  function revisionCount(): number {
    return Number(
      psql(
        `SELECT count(*) FROM public.studio_mix_working_revisions WHERE project_id='${projectId}';`,
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
  DELETE FROM public.studio_mix_working_idempotency
    WHERE project_id IN ('${projectId}', '${otherProjectId}');
  DELETE FROM public.studio_mix_working_revisions
    WHERE project_id IN ('${projectId}', '${otherProjectId}');
  DELETE FROM public.studio_projects
    WHERE id IN ('${projectId}', '${otherProjectId}');
END;
$$;
`);
    } catch {
      /* best-effort */
    }
    await fixtures?.cleanup();
  }, 60_000);

  it("apply creates durable revision; replay does not duplicate", async () => {
    const before = tipVersion();
    const requestId = randomUUID();
    const first = await applyStudioMixWorkingOpsFor(context(ownerId), {
      projectId,
      expectedDocumentVersion: before,
      requestId,
      ops: [{ op: "set_track_controls", trackId, gainDb: -4, muted: true }],
    });
    expect(first.replay).toBe(false);
    expect(first.revisionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(revisionCount()).toBe(1);
    revA = first.revisionId!;

    const replay = await applyStudioMixWorkingOpsFor(context(ownerId), {
      projectId,
      expectedDocumentVersion: before,
      requestId,
      ops: [{ op: "set_track_controls", trackId, gainDb: -4, muted: true }],
    });
    expect(replay.replay).toBe(true);
    expect(replay.revisionId).toBe(revA);
    expect(revisionCount()).toBe(1);

    const second = await applyStudioMixWorkingOpsFor(context(ownerId), {
      projectId,
      expectedDocumentVersion: tipVersion(),
      requestId: randomUUID(),
      ops: [{ op: "set_master_mix", masterGainDb: -2 }],
    });
    expect(second.revisionId).toBeTruthy();
    revB = second.revisionId!;
    expect(revisionCount()).toBe(2);
  });

  it("list/detail/compare for owner; pagination limit", async () => {
    const listed = await listMixWorkingRevisionsFor(context(ownerId), {
      projectId,
      limit: 1,
    });
    expect(listed.revisions).toHaveLength(1);
    expect(listed.nextCursor).toBeTruthy();
    expect(listed.revisions[0]).not.toHaveProperty("snapshot");
    expect(listed.revisions[0]!.hasSnapshot).toBe(true);

    const detail = await getMixWorkingRevisionFor(context(ownerId), {
      projectId,
      revisionId: revA,
    });
    expect(detail.id).toBe(revA);
    expect(detail.snapshot?.snapshotKind).toBe("MIX_WORKING");
    expect(detail.ops).toBeTruthy();

    const diff = await compareMixWorkingRevisionsFor(context(ownerId), {
      projectId,
      fromRevisionId: revA,
      toRevisionId: revB,
    });
    expect(diff.kind).toBe("MIX_WORKING_REVISION_DIFF");
    expect(diff.projectId).toBe(projectId);
    expect(diff.changes.length).toBeGreaterThan(0);
  });

  it("non-owner and foreign revision isolation", async () => {
    await expect(
      listMixWorkingRevisionsFor(context(otherId), { projectId }),
    ).rejects.toBeInstanceOf(AuthError);

    await expect(
      getMixWorkingRevisionFor(context(ownerId), {
        projectId,
        revisionId: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "REVISION_NOT_FOUND" });

    await expect(
      getMixWorkingRevisionFor(context(otherId), {
        projectId,
        revisionId: revA,
      }),
    ).rejects.toBeInstanceOf(AuthError);

    // Other owner's project cannot see owner's revision id even if guessed.
    await expect(
      getMixWorkingRevisionFor(context(otherId), {
        projectId: otherProjectId,
        revisionId: revA,
      }),
    ).rejects.toMatchObject({ code: "REVISION_NOT_FOUND" });
  });

  it("restore creates new revision; identical retry replays", async () => {
    const beforeCount = revisionCount();
    const beforeTip = tipVersion();
    const sourceBefore = await getMixWorkingRevisionFor(context(ownerId), {
      projectId,
      revisionId: revA,
    });
    const requestId = randomUUID();

    const restored = await restoreMixWorkingRevisionFor(context(ownerId), {
      projectId,
      revisionId: revA,
      expectedDocumentVersion: beforeTip,
      requestId,
    });
    expect(restored.replay).toBe(false);
    expect(restored.revisionId).toBeTruthy();
    expect(restored.revisionId).not.toBe(revA);
    expect(tipVersion()).toBe(beforeTip + 1);
    expect(revisionCount()).toBe(beforeCount + 1);

    const replay = await restoreMixWorkingRevisionFor(context(ownerId), {
      projectId,
      revisionId: revA,
      expectedDocumentVersion: beforeTip,
      requestId,
    });
    expect(replay.replay).toBe(true);
    expect(replay.revisionId).toBe(restored.revisionId);
    expect(replay.documentVersion).toBe(restored.documentVersion);
    expect(tipVersion()).toBe(beforeTip + 1);
    expect(revisionCount()).toBe(beforeCount + 1);

    await expect(
      restoreMixWorkingRevisionFor(context(ownerId), {
        projectId,
        revisionId: revB,
        expectedDocumentVersion: beforeTip,
        requestId,
      }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSE" });
    expect(tipVersion()).toBe(beforeTip + 1);
    expect(revisionCount()).toBe(beforeCount + 1);

    const sourceAfter = await getMixWorkingRevisionFor(context(ownerId), {
      projectId,
      revisionId: revA,
    });
    expect(sourceAfter.documentDigest).toBe(sourceBefore.documentDigest);
    expect(sourceAfter.sourceDocumentVersion).toBe(
      sourceBefore.sourceDocumentVersion,
    );

    const newRev = await getMixWorkingRevisionFor(context(ownerId), {
      projectId,
      revisionId: restored.revisionId!,
    });
    expect(newRev.kind).toBe("restored");
    expect(newRev.restoredFromRevisionId).toBe(revA);
  });

  it("stale restore CAS rejects without mutation", async () => {
    // Tip was restored to revA; revB still differs so ops are built, then CAS fails.
    const before = tipVersion();
    const beforeCount = revisionCount();
    await expect(
      restoreMixWorkingRevisionFor(context(ownerId), {
        projectId,
        revisionId: revB,
        expectedDocumentVersion: before + 99,
        requestId: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "FX_CHAIN_VERSION_CONFLICT" });
    expect(tipVersion()).toBe(before);
    expect(revisionCount()).toBe(beforeCount);
  });

  it("invalid body / missing revision map to apply errors", async () => {
    await expect(
      listMixWorkingRevisionsFor(context(ownerId), {
        projectId,
        limit: 999,
      }),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });

    try {
      await getMixWorkingRevisionFor(context(ownerId), {
        projectId,
        revisionId: "not-uuid",
      });
      expect.fail("expected error");
    } catch (error) {
      expect(error).toBeInstanceOf(MixWorkingApplyError);
      expect(studioApiErrorResponse(error).status).toBe(400);
    }
  });
});

describe.runIf(!live)("A2 Mix Working revisions — API live gate", () => {
  it("NOT RUN — integration env not enabled", () => {
    expect(live).toBe(false);
  });
});
