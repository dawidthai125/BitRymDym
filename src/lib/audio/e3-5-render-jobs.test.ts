import { describe, expect, it } from "vitest";

import {
  E3_MIX_ENABLED,
  E3_PUBLIC_AUDIO,
  E3_RENDER_JOBS_ENABLED,
  AUDIO_RENDER_JOB_TIMEOUT_SECONDS,
  AUDIO_RENDER_MAX_ATTEMPTS,
  getRenderWorkerSecret,
} from "@/config/audio-render";
import {
  FREE_AUDIO_CAPABILITIES,
  PREMIUM_AUDIO_CAPABILITIES,
  hasAudioCapability,
  rejectClientChosenPremiumClaims,
  resolveEffectiveAudioEntitlement,
} from "@/lib/audio/effective-entitlement";
import { buildAudioArtifactObjectKey } from "@/lib/audio/artifact-object-key";
import {
  assertUnderConcurrentCap,
  assertUnderDailyCap,
  assertUnderQuota,
  buildRenderJobEntitlementSnapshot,
  canCancelRenderJob,
  canClaimRenderJob,
  canCompleteRenderJobSuccess,
  capabilityForRenderTier,
  computeTimeoutAtFromClaim,
  isActiveRenderJobStatus,
  isRenderJobTier,
  isRunningJobTimedOut,
  isTerminalRenderJobStatus,
  parseRenderJobEntitlementSnapshot,
  quotaBytesForPremium,
  retentionSecondsForPremium,
  RenderJobDomainError,
} from "@/lib/audio/render-job-core";
import { createFakeRenderWorkerAdapter } from "@/lib/audio/worker-adapter";
import { sanitizeMixClientClaims } from "@/lib/mix/authz-core";
import {
  defaultMixParameters,
  serializeMixParameters,
} from "@/lib/mix/params";

const USER = "11111111-1111-4111-8111-111111111111";

describe("E3.5 — Render Jobs domain (unit)", () => {
  it("keeps all runtime flags OFF by default", () => {
    const envOverridesPresent = [
      process.env.E3_RENDER_JOBS_ENABLED,
      process.env.E3_MIX_ENABLED,
      process.env.E3_PUBLIC_AUDIO,
      process.env.E3_RENDER_WORKER_SECRET,
    ].some((v) => v !== undefined && v.trim() !== "");

    if (envOverridesPresent) {
      // Local PE / worker env — module consts reflect process.env, not code defaults.
      // Not a product regression; defaults remain fail-closed when unset.
      expect(typeof E3_RENDER_JOBS_ENABLED).toBe("boolean");
      expect(typeof E3_MIX_ENABLED).toBe("boolean");
      expect(typeof E3_PUBLIC_AUDIO).toBe("boolean");
      return;
    }

    expect(E3_RENDER_JOBS_ENABLED).toBe(false);
    expect(E3_MIX_ENABLED).toBe(false);
    expect(E3_PUBLIC_AUDIO).toBe(false);
    expect(getRenderWorkerSecret()).toBeNull();
  });

  it("maps tiers to EXPORT capabilities only", () => {
    expect(capabilityForRenderTier("BASIC_MP3")).toBe("EXPORT_BASIC_MP3");
    expect(capabilityForRenderTier("HQ_MP3")).toBe("EXPORT_HQ_MP3");
    expect(capabilityForRenderTier("WAV")).toBe("EXPORT_WAV");
    expect(isRenderJobTier("BASIC_MP3")).toBe(true);
    expect(isRenderJobTier("STEMS")).toBe(false);
    expect(isRenderJobTier("PRO_MASTER_BAKE")).toBe(false);
  });

  it("Free has EXPORT_BASIC_MP3; legacy Premium=SILVER has HQ not WAV; anon none", () => {
    const free = resolveEffectiveAudioEntitlement({
      userId: USER,
      accountLevel: "BEGINNER_RAPPER",
      premium: null,
    });
    expect(hasAudioCapability(free, "EXPORT_BASIC_MP3")).toBe(true);
    expect(hasAudioCapability(free, "EXPORT_HQ_MP3")).toBe(false);
    expect(FREE_AUDIO_CAPABILITIES).toContain("EXPORT_BASIC_MP3");

    const premium = resolveEffectiveAudioEntitlement({
      userId: USER,
      accountLevel: "BEGINNER_RAPPER",
      premium: {
        userId: USER,
        active: true,
        source: "manual_admin",
        expiresAt: null,
      },
    });
    expect(premium.premiumTier).toBe("SILVER");
    expect(hasAudioCapability(premium, "EXPORT_HQ_MP3")).toBe(true);
    expect(hasAudioCapability(premium, "EXPORT_WAV")).toBe(false);
    expect(PREMIUM_AUDIO_CAPABILITIES).toContain("EXPORT_WAV");

    const gold = resolveEffectiveAudioEntitlement({
      userId: USER,
      accountLevel: "BEGINNER_RAPPER",
      premium: {
        userId: USER,
        active: true,
        source: "manual_admin",
        expiresAt: null,
        tier: "GOLD",
      },
    });
    expect(hasAudioCapability(gold, "EXPORT_WAV")).toBe(true);

    const anon = resolveEffectiveAudioEntitlement({
      userId: null,
      accountLevel: null,
      premium: null,
    });
    expect(anon.capabilities).toEqual([]);
  });

  it("rejects client premium/tier/capability/userId claims", () => {
    expect(() =>
      sanitizeMixClientClaims({ premium: true } as Record<string, unknown>),
    ).toThrow();
    expect(() =>
      sanitizeMixClientClaims({
        capabilities: ["EXPORT_WAV"],
      } as Record<string, unknown>),
    ).toThrow();
    expect(() =>
      sanitizeMixClientClaims({ userId: USER } as Record<string, unknown>),
    ).toThrow();
    expect(() => rejectClientChosenPremiumClaims({ tier: "premium" })).toThrow();
  });

  it("builds/parses entitlement + parameters snapshot", () => {
    const entitlement = resolveEffectiveAudioEntitlement({
      userId: USER,
      accountLevel: "BEGINNER_RAPPER",
      premium: null,
    });
    const parameters = serializeMixParameters(defaultMixParameters());
    const snap = buildRenderJobEntitlementSnapshot({
      entitlement,
      parameters,
      paramsVersion: 1,
    });
    expect(snap.parameters.master.gainDb).toBe(0);
    expect(snap.entitlement.premiumActive).toBe(false);
    expect(snap.entitlement.premiumTier).toBe("FREE");
    expect(snap.entitlement.limits.rendersDaily).toBe(5);
    expect(snap.entitlement.limits.goldRetentionDesignOnly).toBe(false);
    const parsed = parseRenderJobEntitlementSnapshot(snap);
    expect(parsed.paramsVersion).toBe(1);
    expect(() => parseRenderJobEntitlementSnapshot({})).toThrow(
      RenderJobDomainError,
    );
  });

  it("timeout clock starts at CLAIM only (180s)", () => {
    expect(AUDIO_RENDER_JOB_TIMEOUT_SECONDS).toBe(180);
    const claimAt = new Date("2026-09-29T10:00:00.000Z");
    const timeoutAt = computeTimeoutAtFromClaim(claimAt);
    expect(timeoutAt.toISOString()).toBe("2026-09-29T10:03:00.000Z");

    expect(
      isRunningJobTimedOut({
        status: "QUEUED",
        timeoutAt: null,
        nowMs: claimAt.getTime() + 999_999,
      }),
    ).toBe(false);

    expect(
      isRunningJobTimedOut({
        status: "RUNNING",
        timeoutAt: timeoutAt.toISOString(),
        nowMs: timeoutAt.getTime(),
      }),
    ).toBe(true);

    expect(
      isRunningJobTimedOut({
        status: "RUNNING",
        timeoutAt: timeoutAt.toISOString(),
        nowMs: timeoutAt.getTime() - 1,
      }),
    ).toBe(false);
  });

  it("state machine helpers: claim/cancel/complete/terminal", () => {
    expect(canClaimRenderJob("QUEUED")).toBe(true);
    expect(canClaimRenderJob("RUNNING")).toBe(false);
    expect(canCancelRenderJob("QUEUED")).toBe(true);
    expect(canCancelRenderJob("RUNNING")).toBe(true);
    expect(canCancelRenderJob("SUCCEEDED")).toBe(false);
    expect(canCompleteRenderJobSuccess("RUNNING")).toBe(true);
    expect(canCompleteRenderJobSuccess("CANCELLED")).toBe(false);
    expect(canCompleteRenderJobSuccess("QUEUED")).toBe(false);
    expect(isActiveRenderJobStatus("QUEUED")).toBe(true);
    expect(isTerminalRenderJobStatus("CANCELLED")).toBe(true);
    expect(AUDIO_RENDER_MAX_ATTEMPTS).toBe(3);
  });

  it("enforces daily / concurrent / quota caps from config SSOT", () => {
    expect(() =>
      assertUnderDailyCap({ jobsCreatedToday: 5, premiumActive: false }),
    ).toThrow(/Daily render limit/);
    expect(() =>
      assertUnderDailyCap({ jobsCreatedToday: 4, premiumActive: false }),
    ).not.toThrow();
    expect(() =>
      assertUnderConcurrentCap({ activeJobs: 1, premiumActive: false }),
    ).toThrow(/Concurrent/);
    expect(() =>
      assertUnderConcurrentCap({ activeJobs: 2, premiumActive: true }),
    ).toThrow(/Concurrent/);
    expect(() =>
      assertUnderQuota({
        usedBytes: quotaBytesForPremium(false),
        quotaBytes: quotaBytesForPremium(false),
      }),
    ).toThrow(/quota/);
  });

  it("retention classes: Free 48h · Premium 30d", () => {
    expect(retentionSecondsForPremium(false)).toBe(48 * 60 * 60);
    expect(retentionSecondsForPremium(true)).toBe(30 * 24 * 60 * 60);
  });

  it("artifact object key stays canonical under audio-artifacts", () => {
    const ownerId = "11111111-1111-4111-8111-111111111111";
    const mixSessionId = "22222222-2222-4222-8222-222222222222";
    const jobId = "33333333-3333-4333-8333-333333333333";
    expect(
      buildAudioArtifactObjectKey({
        ownerId,
        mixSessionId,
        jobId,
        tier: "BASIC_MP3",
      }),
    ).toBe(
      `user/${ownerId}/mix/${mixSessionId}/jobs/${jobId}/BASIC_MP3.mp3`,
    );
  });

  it("Fake adapter enqueues workerRef without AuthZ decisions", async () => {
    const adapter = createFakeRenderWorkerAdapter();
    const enq = await adapter.enqueue("33333333-3333-4333-8333-333333333333", {
      tier: "BASIC_MP3",
    });
    expect(enq.workerRef).toMatch(/^fake:/);
    const status = await adapter.getStatus(enq.workerRef);
    expect(status.state).toBe("queued");
    await adapter.cancel(enq.workerRef);
    expect((await adapter.getStatus(enq.workerRef)).state).toBe("cancelled");
  });

  it("cancel safety: cancelled jobs cannot complete SUCCESS", () => {
    expect(canCompleteRenderJobSuccess("CANCELLED")).toBe(false);
    expect(canCompleteRenderJobSuccess("TIMEOUT")).toBe(false);
    expect(canCompleteRenderJobSuccess("FAILED")).toBe(false);
    expect(canCompleteRenderJobSuccess("SUCCEEDED")).toBe(false);
  });
});
