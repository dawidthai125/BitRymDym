/**
 * Phase 6 — Track duplicate + capacity UX + premium entitlement contracts.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { PREMIUM_TIER_MATRIX } from "@/config/premium-tiers";
import { resolveProductEntitlement } from "@/lib/entitlements/product-entitlement";
import {
  assertTrackTypeDuplicable,
  canAddStudioTrack,
  formatStudioTrackCapacityLabel,
  formatStudioTrackCapacityLabelCompact,
  nextDuplicatedTrackName,
  shouldShowStudioTrackUpgradeCta,
  simulateConcurrentTrackCapacityOps,
  STUDIO_TRACK_UPGRADE_HREF,
  StudioBeatTrackProtectedError,
  trackNameBase,
} from "@/lib/studio/studio-track-capacity";

const root = process.cwd();

describe("Phase 6 Premium SSOT (unchanged matrix)", () => {
  it("FREE 2 / BRONZE 3 / SILVER 5 / GOLD 8", () => {
    expect(PREMIUM_TIER_MATRIX.FREE.studioMaxTracks).toBe(2);
    expect(PREMIUM_TIER_MATRIX.BRONZE.studioMaxTracks).toBe(3);
    expect(PREMIUM_TIER_MATRIX.SILVER.studioMaxTracks).toBe(5);
    expect(PREMIUM_TIER_MATRIX.GOLD.studioMaxTracks).toBe(8);
  });

  it("entitlement surfaces studioMaxTracks — no UI matrix", () => {
    for (const tier of ["FREE", "BRONZE", "SILVER", "GOLD"] as const) {
      const product = resolveProductEntitlement({
        userId: "u1",
        accountLevel: "BEGINNER_RAPPER",
        premium:
          tier === "FREE"
            ? null
            : {
                userId: "u1",
                active: true,
                source: "test",
                expiresAt: null,
                tier,
              },
      });
      expect(product.limits.studioMaxTracks).toBe(
        PREMIUM_TIER_MATRIX[tier].studioMaxTracks,
      );
    }
  });
});

describe("Phase 6 duplicate naming", () => {
  it("Wokal → Wokal 2; Wokal 2 → Wokal 3; Adlib → Adlib 2", () => {
    expect(trackNameBase("Wokal")).toBe("Wokal");
    expect(trackNameBase("Wokal 2")).toBe("Wokal");
    expect(nextDuplicatedTrackName("Wokal", ["Bit", "Wokal"])).toBe("Wokal 2");
    expect(
      nextDuplicatedTrackName("Wokal 2", ["Bit", "Wokal", "Wokal 2"]),
    ).toBe("Wokal 3");
    expect(nextDuplicatedTrackName("Adlib", ["Bit", "Adlib"])).toBe("Adlib 2");
  });
});

describe("Phase 6 duplicate + capacity concurrency", () => {
  it("mixed ADD/DUPLICATE never exceed N", () => {
    const result = simulateConcurrentTrackCapacityOps({
      initialCount: 1,
      maxTracks: 2,
      ops: ["add", "duplicate", "add", "duplicate"],
    });
    expect(result.finalCount).toBe(2);
    expect(result.accepted).toBe(1);
    expect(result.rejected).toBe(3);
  });

  it("rejects BEAT duplicate", () => {
    expect(() => assertTrackTypeDuplicable("BEAT")).toThrow(
      StudioBeatTrackProtectedError,
    );
    expect(() => assertTrackTypeDuplicable("VOCAL")).not.toThrow();
  });
});

describe("Phase 6 capacity UX helpers", () => {
  it("formats n/max; Master excluded from count", () => {
    expect(formatStudioTrackCapacityLabel(2, 2)).toBe("2 / 2");
    expect(formatStudioTrackCapacityLabelCompact(3, 5)).toBe("3/5");
    // Bit included in trackCount; Master never is.
    expect(canAddStudioTrack({ currentTrackCount: 2, maxTracks: 2 })).toBe(
      false,
    );
  });

  it("upgrade CTA Free/Bronze/Silver at capacity; Gold never", () => {
    expect(
      shouldShowStudioTrackUpgradeCta({
        premiumTier: "FREE",
        trackCount: 2,
        maxTracks: 2,
      }),
    ).toBe(true);
    expect(
      shouldShowStudioTrackUpgradeCta({
        premiumTier: "BRONZE",
        trackCount: 3,
        maxTracks: 3,
      }),
    ).toBe(true);
    expect(
      shouldShowStudioTrackUpgradeCta({
        premiumTier: "SILVER",
        trackCount: 5,
        maxTracks: 5,
      }),
    ).toBe(true);
    expect(
      shouldShowStudioTrackUpgradeCta({
        premiumTier: "GOLD",
        trackCount: 8,
        maxTracks: 8,
      }),
    ).toBe(false);
    expect(
      shouldShowStudioTrackUpgradeCta({
        premiumTier: "FREE",
        trackCount: 1,
        maxTracks: 2,
      }),
    ).toBe(false);
    expect(STUDIO_TRACK_UPGRADE_HREF).toBe("/account");
  });
});

describe("Phase 6 wiring — SQL / service / UI / architecture", () => {
  const migration = readFileSync(
    join(
      root,
      "supabase/migrations/20261008150000_p6_studio_duplicate_track_cas.sql",
    ),
    "utf8",
  );
  const p5Migration = readFileSync(
    join(
      root,
      "supabase/migrations/20261008140000_p5_studio_track_crud_cas.sql",
    ),
    "utf8",
  );
  const service = readFileSync(
    join(root, "src/lib/studio/studio-service.ts"),
    "utf8",
  );
  const route = readFileSync(
    join(
      root,
      "src/app/api/studio/projects/[projectId]/tracks/[trackId]/duplicate/route.ts",
    ),
    "utf8",
  );
  const editor = readFileSync(
    join(root, "src/components/studio/studio-editor.tsx"),
    "utf8",
  );
  const page = readFileSync(
    join(root, "src/app/studio/p/[projectId]/page.tsx"),
    "utf8",
  );
  const capacity = readFileSync(
    join(root, "src/lib/studio/studio-track-capacity.ts"),
    "utf8",
  );
  const eligibility = readFileSync(
    join(root, "src/lib/takes/recording-eligibility-service.ts"),
    "utf8",
  );

  it("Phase 5 migration file still present (PENDING apply)", () => {
    expect(p5Migration).toMatch(/studio_cas_add_track/);
    expect(p5Migration).toMatch(/pg_advisory_xact_lock\(87245130/);
  });

  it("duplicate RPC: lock + capacity + reject BEAT + copy clips + share sources", () => {
    expect(migration).toMatch(/studio_cas_duplicate_track/);
    expect(migration).toMatch(
      /pg_advisory_xact_lock\(87245130, hashtext\(p_project_id::text\)\)/,
    );
    expect(migration).toMatch(/TRACK_CAPACITY_REACHED/);
    expect(migration).toMatch(/BEAT_TRACK_PROTECTED/);
    expect(migration).toMatch(/record_armed/);
    expect(migration).toMatch(/false/);
    expect(migration).toMatch(/source_take_id/);
    expect(migration).toMatch(/source_offset_ms/);
    expect(migration).toMatch(/effects_chain/);
    expect(migration).toMatch(/INSERT INTO public\.studio_clips/);
    expect(migration).not.toMatch(/INSERT INTO public\.takes/);
    expect(migration).not.toMatch(/CREATE TABLE/);
    expect(migration).toMatch(/GRANT EXECUTE[\s\S]*TO service_role/);
    expect(migration).toMatch(/REVOKE ALL[\s\S]*FROM anon, authenticated/);
    expect(migration).toMatch(/SET search_path = public/);
  });

  it("service + route reuse premium SSOT", () => {
    expect(service).toMatch(/duplicateStudioTrackFor/);
    expect(service).toMatch(/studio_cas_duplicate_track/);
    expect(service).toMatch(/resolveProductEntitlementForAuthContext/);
    expect(service).toMatch(/limits\.studioMaxTracks/);
    expect(service).toMatch(/nextDuplicatedTrackName/);
    expect(service).toMatch(/assertTrackTypeDuplicable/);
    expect(route).toMatch(/duplicateStudioTrack/);
    expect(route).toMatch(/expectedDocumentVersion/);
  });

  it("UI: capacity indicator from entitlement props; no hardcoded matrix", () => {
    expect(page).toMatch(/resolveProductEntitlementForAuthContext/);
    expect(page).toMatch(/limits\.studioMaxTracks/);
    expect(page).toMatch(/premiumTier/);
    expect(editor).toMatch(/studio-track-capacity/);
    expect(editor).toMatch(/studio-track-upgrade-cta/);
    expect(editor).toMatch(/studio-track-duplicate/);
    expect(editor).toMatch(/function duplicateTrack\(trackId: string\): void/);
    expect(editor).toMatch(
      /function duplicateTrack\([\s\S]*?enqueuePersist/,
    );
    expect(editor).toMatch(/STUDIO_TRACK_UPGRADE_HREF/);
    expect(editor).not.toMatch(/studioMaxTracks:\s*2/);
    expect(editor).not.toMatch(/if \(.*FREE.*\)\s*\{?\s*2/);
    expect(capacity).not.toMatch(/FREE:\s*2/);
  });

  it("architecture: no second engine / AudioContext in Phase 6 paths", () => {
    expect(editor).not.toMatch(/new StudioAudioEngine/);
    expect(editor).not.toMatch(/new AudioContext/);
    expect(route).not.toMatch(/AudioContext/);
    expect(service).not.toMatch(/new StudioAudioEngine/);
  });

  it("sacred WIP untouched by Phase 6 imports", () => {
    expect(service).not.toMatch(/recording-eligibility-service/);
    expect(editor).not.toMatch(/recording-eligibility-service/);
    expect(eligibility).toMatch(/resolveRecordingEligibility/);
  });
});
