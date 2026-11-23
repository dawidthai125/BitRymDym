/** Studio WAV export → download: the owner with Gold gets the file, nobody else, and nothing is spent on a refusal. */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/config/audio-render", async (orig) => ({ ...(await orig<typeof import("@/config/audio-render")>()), E3_RENDER_JOBS_ENABLED: true, isSfmVersionsV1Enabled: () => false }));

const h = vi.hoisted(() => ({
  tier: "GOLD" as string,
  artifact: {} as Record<string, unknown>,
  job: {} as Record<string, unknown>,
  project: {} as Record<string, unknown> | null,
  work: null as Record<string, unknown> | null,
  unlock: null as Record<string, unknown> | null,
  rpc: [] as string[],
  denied: null as string | null,
}));

vi.mock("@/lib/audio/load-premium-entitlement", async () => {
  const { resolveEffectiveAudioEntitlement } = await import("@/lib/audio/effective-entitlement");
  return {
    resolveAudioEntitlementForAuthContext: async () =>
      resolveEffectiveAudioEntitlement({
        userId: "u1", accountLevel: "BEGINNER_RAPPER",
        premium: h.tier === "FREE" ? null : { userId: "u1", active: true, source: "manual", expiresAt: new Date(Date.now() + 864e5).toISOString(), tier: h.tier as "GOLD" },
      }),
    resolveProductEntitlementForAuthContext: async () => ({ premiumTier: h.tier }),
  };
});
vi.mock("@/lib/audio/public-audio-gate", async (orig) => ({ ...(await orig<typeof import("@/lib/audio/public-audio-gate")>()), assertPublicFreeAudioReleased: () => {} }));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: (table: string) => {
      const filters: Record<string, unknown> = {};
      const q: Record<string, unknown> = {
        select: () => q,
        eq: (k: string, v: unknown) => ((filters[k] = v), q),
        maybeSingle: async () => {
          const row = table === "audio_artifacts" ? h.artifact : table === "render_jobs" ? h.job : table === "premium_works" ? h.work : table === "premium_track_unlocks" ? h.unlock
            : table === "studio_projects" ? (h.project && h.project.owner_id === filters.owner_id ? h.project : null) : { created_at: new Date().toISOString() };
          return { data: row, error: null };
        },
      };
      return q;
    },
    rpc: async (name: string) => {
      h.rpc.push(name);
      const until = new Date(Date.now() + 864e5).toISOString();
      if (name === "premium_mark_work_ready") {
        h.work ??= { id: "work-0001", status: "WORK_READY", retention_expires_at: until };
        return { data: [{ work_id: "work-0001", status: "WORK_READY", work_ready_at: until, retention_expires_at: until, created: true }], error: null };
      }
      if (h.denied) return { data: [{ denied_reason: h.denied }], error: null };
      h.unlock = { id: "unlock-1" };
      return { data: [{ unlock_id: "unlock-1", work_id: "work-0001", reused: false, retention_expires_at: until, credits_remaining: 3 }], error: null };
    },
    storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: "https://files.example/x.wav" }, error: null }) }) },
  }),
}));

import { createOwnArtifactDownloadSignedUrlFor } from "./artifact-download";

const ctx = { userId: "u1" } as Parameters<typeof createOwnArtifactDownloadSignedUrlFor>[0];
const run = () => createOwnArtifactDownloadSignedUrlFor(ctx, { artifactId: "art" });

beforeEach(() => {
  h.tier = "GOLD";
  h.artifact = {
    id: "art", owner_id: "u1", project_id: "proj", mix_session_id: null, take_id: null, sfm_version_id: null, render_job_id: "job", format: "audio/wav",
    quality_tier: "WAV", storage_bucket: "audio-artifacts", object_key: "k", byte_size: 1, duration_ms: 1, status: "READY",
    expires_at: new Date(Date.now() + 864e5).toISOString(), deleted_at: null,
  };
  h.job = { id: "job", owner_id: "u1", status: "SUCCEEDED", kind: "STUDIO_EXPORT" };
  h.project = { id: "proj", owner_id: "u1" };
  h.work = null;
  h.unlock = null;
  h.rpc = [];
  h.denied = null;
});

describe("studio export download", () => {
  it("Gold owner downloads the export; the project is unlocked through the database functions", async () => {
    expect((await run()).url).toBe("https://files.example/x.wav");
    expect(h.rpc).toEqual(["premium_mark_work_ready", "premium_unlock_work"]);
  });

  it("no plan, no owner, unfinished job: refused and nothing is spent", async () => {
    for (const tier of ["FREE", "BRONZE", "SILVER"]) {
      h.tier = tier;
      await expect(run()).rejects.toThrow();
    }
    h.tier = "GOLD";
    h.project = { id: "proj", owner_id: "someone-else" };
    await expect(run()).rejects.toThrow(/Brak dostępu/);
    h.project = { id: "proj", owner_id: "u1" };
    h.artifact.owner_id = "someone-else";
    await expect(run()).rejects.toThrow(/owner/);
    h.artifact.owner_id = "u1";
    h.job.status = "RUNNING";
    await expect(run()).rejects.toThrow(/SUCCEEDED/);
    expect(h.rpc).toEqual([]);
  });

  it("other kinds of files still need their own unlock", async () => {
    h.artifact.take_id = "take";
    h.artifact.project_id = null;
    await expect(run()).rejects.toThrow(/nie jest gotowy/);
    expect(h.rpc).toEqual([]);
  });

  it("used-up unlocks are explained", async () => {
    h.denied = "NO_CREDITS";
    await expect(run()).rejects.toThrow(/na 7 dni \(4\)/);
  });
});
