/**
 * A3.5 — legacy Mix Working write paths delegate to atomic gateway (local only).
 * Gate: BRD_INTEGRATION_TESTS=1 + LOCAL_SUPABASE_* (loopback).
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
import {
  updateStudioMasterFxChainFor,
  updateStudioMasterMixFor,
  updateStudioTrackControlsFor,
  updateStudioTrackEffectsChainFor,
} from "@/lib/studio/studio-service";
import { emptyStudioFxChain } from "@/lib/studio/studio-fx-chain";

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
      displayName: "A35API",
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

describe.runIf(live)("A3.5 legacy Mix paths → atomic gateway (local)", () => {
  let admin: SupabaseClient;
  let fixtures: ReturnType<typeof createIntegrationFixtures>;
  let ownerId = "";
  let projectId = "";
  let trackId = "";
  let version = 0;

  beforeAll(async () => {
    if (!integration.enabled) return;
    admin = createClient(integration.url, integration.serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    fixtures = createIntegrationFixtures(admin);

    const email = `a35-legacy-${randomUUID().slice(0, 8)}@example.com`;
    const password = `A35!${randomUUID()}`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error || !data.user) throw new Error(error?.message ?? "createUser");
    ownerId = fixtures.trackUser(data.user.id);
    const { error: profileErr } = await admin.from("profiles").upsert({
      id: ownerId,
      display_name: "A35 Legacy",
      role: "USER",
      account_level: "BEGINNER_RAPPER",
    });
    if (profileErr) throw new Error(profileErr.message);

    const { data: proj, error: projErr } = await admin
      .from("studio_projects")
      .insert({
        owner_id: ownerId,
        title: "A35 Legacy Gateway",
        status: "ACTIVE",
        document_version: 1,
        master_gain_db: 0,
        master_pan: 0,
        master_fx_chain: emptyStudioFxChain(),
      })
      .select("id, document_version")
      .single();
    if (projErr || !proj) throw new Error(projErr?.message ?? "project");
    projectId = proj.id;
    version = Number(proj.document_version);

    const { data: track, error: trackErr } = await admin
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
        record_armed: false,
        effects_chain: emptyStudioFxChain(),
      })
      .select("id")
      .single();
    if (trackErr || !track) throw new Error(trackErr?.message ?? "track");
    trackId = String(track.id);
  }, 60_000);

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

  async function revisionCount(): Promise<number> {
    const { count, error } = await admin
      .from("studio_mix_working_revisions")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId);
    if (error) throw new Error(error.message);
    return count ?? 0;
  }

  async function latestRevision(): Promise<{
    id: string;
    parent_revision_id: string | null;
    source_document_version: number;
  }> {
    const { data, error } = await admin
      .from("studio_mix_working_revisions")
      .select("id, parent_revision_id, source_document_version")
      .eq("project_id", projectId)
      .order("source_document_version", { ascending: false })
      .limit(1)
      .single();
    if (error || !data) throw new Error(error?.message ?? "latest rev");
    return data as {
      id: string;
      parent_revision_id: string | null;
      source_document_version: number;
    };
  }

  it("master mix PATCH path creates one revision with null parent (first)", async () => {
    const before = await revisionCount();
    const result = await updateStudioMasterMixFor(context(ownerId), {
      projectId,
      expectedDocumentVersion: version,
      masterGainDb: -3,
    });
    expect(result.documentVersion).toBe(version + 1);
    expect(result.masterGainDb).toBe(-3);
    version = result.documentVersion;
    expect(await revisionCount()).toBe(before + 1);
    const rev = await latestRevision();
    expect(rev.source_document_version).toBe(version);
    expect(rev.parent_revision_id).toBeNull();
  });

  it("track controls allowlist path creates revision with tip parent", async () => {
    const parent = await latestRevision();
    const before = await revisionCount();
    const result = await updateStudioTrackControlsFor(context(ownerId), {
      projectId,
      trackId,
      expectedDocumentVersion: version,
      gainDb: -6,
      muted: true,
    });
    expect(result.documentVersion).toBe(version + 1);
    expect(result.track.gainDb).toBe(-6);
    expect(result.track.muted).toBe(true);
    version = result.documentVersion;
    expect(await revisionCount()).toBe(before + 1);
    const rev = await latestRevision();
    expect(rev.parent_revision_id).toBe(parent.id);
  });

  it("track FX path creates one revision", async () => {
    const parent = await latestRevision();
    const before = await revisionCount();
    const result = await updateStudioTrackEffectsChainFor(context(ownerId), {
      projectId,
      trackId,
      expectedDocumentVersion: version,
      chain: emptyStudioFxChain(),
    });
    expect(result.documentVersion).toBe(version + 1);
    version = result.documentVersion;
    expect(await revisionCount()).toBe(before + 1);
    const rev = await latestRevision();
    expect(rev.parent_revision_id).toBe(parent.id);
  });

  it("master FX path creates one revision", async () => {
    const parent = await latestRevision();
    const before = await revisionCount();
    const result = await updateStudioMasterFxChainFor(context(ownerId), {
      projectId,
      expectedDocumentVersion: version,
      chain: emptyStudioFxChain(),
    });
    expect(result.documentVersion).toBe(version + 1);
    version = result.documentVersion;
    expect(await revisionCount()).toBe(before + 1);
    const rev = await latestRevision();
    expect(rev.parent_revision_id).toBe(parent.id);
  });

  it("CAS conflict on master mix does not create revision", async () => {
    const before = await revisionCount();
    await expect(
      updateStudioMasterMixFor(context(ownerId), {
        projectId,
        expectedDocumentVersion: version - 1,
        masterPan: 0.1,
      }),
    ).rejects.toMatchObject({ code: "FX_CHAIN_VERSION_CONFLICT" });
    expect(await revisionCount()).toBe(before);
  });

  it("name-only track PATCH does not create Mix Working revision", async () => {
    const before = await revisionCount();
    const result = await updateStudioTrackControlsFor(context(ownerId), {
      projectId,
      trackId,
      expectedDocumentVersion: version,
      name: "Renamed Vox",
    });
    expect(result.documentVersion).toBe(version + 1);
    expect(result.track.name).toBe("Renamed Vox");
    version = result.documentVersion;
    expect(await revisionCount()).toBe(before);
  });
});
