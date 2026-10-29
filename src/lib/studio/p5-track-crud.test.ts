/**
 * Phase 5 — Track CRUD + atomic capacity contracts.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { PREMIUM_TIER_MATRIX } from "@/config/premium-tiers";
import {
  assertCanAddStudioTrack,
  assertTrackTypeDeletable,
  canAddStudioTrack,
  nextTrackSortOrder,
  nextVocalTrackName,
  simulateConcurrentAddTrackAttempts,
  STUDIO_ADD_TRACK_DEFAULT_TYPE,
  StudioBeatTrackProtectedError,
  StudioTrackCapacityError,
  TRACK_CAPACITY_REACHED,
} from "@/lib/studio/studio-track-capacity";
import { studioApiErrorResponse } from "@/lib/studio/studio-api-error";
import { resolveProductEntitlement } from "@/lib/entitlements/product-entitlement";

const root = process.cwd();

describe("Phase 5 Premium SSOT studioMaxTracks", () => {
  it("FREE 2 / BRONZE 3 / SILVER 5 / GOLD 8", () => {
    expect(PREMIUM_TIER_MATRIX.FREE.studioMaxTracks).toBe(2);
    expect(PREMIUM_TIER_MATRIX.BRONZE.studioMaxTracks).toBe(3);
    expect(PREMIUM_TIER_MATRIX.SILVER.studioMaxTracks).toBe(5);
    expect(PREMIUM_TIER_MATRIX.GOLD.studioMaxTracks).toBe(8);
  });

  it("product entitlement surfaces studioMaxTracks from tier matrix", () => {
    const free = resolveProductEntitlement({
      userId: "u1",
      accountLevel: "BEGINNER_RAPPER",
      premium: null,
    });
    expect(free.limits.studioMaxTracks).toBe(2);

    const gold = resolveProductEntitlement({
      userId: "u1",
      accountLevel: "BEGINNER_RAPPER",
      premium: {
        userId: "u1",
        active: true,
        source: "test",
        expiresAt: null,
        tier: "GOLD",
      },
    });
    expect(gold.limits.studioMaxTracks).toBe(8);
  });
});

describe("Phase 5 add track planning", () => {
  it("default type is VOCAL; naming Wokal / Wokal 2", () => {
    expect(STUDIO_ADD_TRACK_DEFAULT_TYPE).toBe("VOCAL");
    expect(nextVocalTrackName([])).toBe("Wokal");
    expect(nextVocalTrackName(["Bit", "Wokal"])).toBe("Wokal 2");
    expect(nextVocalTrackName(["Bit", "Wokal", "Wokal 2"])).toBe("Wokal 3");
  });

  it("sortOrder = max + 1", () => {
    expect(nextTrackSortOrder([])).toBe(0);
    expect(nextTrackSortOrder([0, 1])).toBe(2);
    expect(nextTrackSortOrder([0, 5, 2])).toBe(6);
  });

  it("capacity: FREE Bit+Vocal = 2/2 blocks add", () => {
    expect(
      canAddStudioTrack({ currentTrackCount: 1, maxTracks: 2 }),
    ).toBe(true);
    expect(
      canAddStudioTrack({ currentTrackCount: 2, maxTracks: 2 }),
    ).toBe(false);
    expect(() =>
      assertCanAddStudioTrack({ currentTrackCount: 2, maxTracks: 2 }),
    ).toThrow(StudioTrackCapacityError);
  });

  it("concurrent serialised adds never exceed N", () => {
    for (const max of [2, 3, 5, 8] as const) {
      const result = simulateConcurrentAddTrackAttempts({
        initialCount: max,
        maxTracks: max,
        attempts: 10,
      });
      expect(result.finalCount).toBe(max);
      expect(result.accepted).toBe(0);
      expect(result.rejected).toBe(10);

      const fromOne = simulateConcurrentAddTrackAttempts({
        initialCount: max - 1,
        maxTracks: max,
        attempts: 5,
      });
      expect(fromOne.finalCount).toBe(max);
      expect(fromOne.accepted).toBe(1);
      expect(fromOne.rejected).toBe(4);
    }
  });
});

describe("Phase 5 delete safety planning", () => {
  it("rejects BEAT delete; allows VOCAL", () => {
    expect(() => assertTrackTypeDeletable("BEAT")).toThrow(
      StudioBeatTrackProtectedError,
    );
    expect(() => assertTrackTypeDeletable("VOCAL")).not.toThrow();
  });

  it("API maps capacity + beat-protect codes", () => {
    const capacity = studioApiErrorResponse(new StudioTrackCapacityError());
    expect(capacity.status).toBe(403);
    const beat = studioApiErrorResponse(new StudioBeatTrackProtectedError());
    expect(beat.status).toBe(403);
  });
});

describe("Phase 5 SQL / service / route wiring", () => {
  const migration = readFileSync(
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
  const addRoute = readFileSync(
    join(
      root,
      "src/app/api/studio/projects/[projectId]/tracks/route.ts",
    ),
    "utf8",
  );
  const trackRoute = readFileSync(
    join(
      root,
      "src/app/api/studio/projects/[projectId]/tracks/[trackId]/route.ts",
    ),
    "utf8",
  );
  const editor = readFileSync(
    join(root, "src/components/studio/studio-editor.tsx"),
    "utf8",
  );
  const eligibility = readFileSync(
    join(root, "src/lib/takes/recording-eligibility-service.ts"),
    "utf8",
  );

  it("add RPC: advisory lock + capacity + VOCAL + record_armed false", () => {
    expect(migration).toMatch(
      /pg_advisory_xact_lock\(87245130, hashtext\(p_project_id::text\)\)/,
    );
    expect(migration).toMatch(/TRACK_CAPACITY_REACHED/);
    expect(migration).toMatch(/COUNT\(\*\)/);
    expect(migration).toMatch(/p_max_tracks/);
    expect(migration).toMatch(/'VOCAL'/);
    expect(migration).toMatch(/record_armed/);
    expect(migration).toMatch(/false/);
    expect(migration).toMatch(/COALESCE\(MAX\(t\.sort_order\), -1\) \+ 1/);
    expect(migration).toMatch(/GRANT EXECUTE[\s\S]*TO service_role/);
    expect(migration).toMatch(/REVOKE ALL[\s\S]*FROM anon, authenticated/);
  });

  it("delete RPC: reject BEAT, cascade clips, CAS version", () => {
    expect(migration).toMatch(/BEAT_TRACK_PROTECTED/);
    expect(migration).toMatch(/DELETE FROM public\.studio_tracks/);
    expect(migration).toMatch(/document_version = sp\.document_version \+ 1/);
    expect(migration).not.toMatch(/DELETE FROM public\.takes/);
  });

  it("service uses premium SSOT + existing CAS conflict", () => {
    expect(service).toMatch(/resolveProductEntitlementForAuthContext/);
    expect(service).toMatch(/limits\.studioMaxTracks/);
    expect(service).toMatch(/studio_cas_add_track/);
    expect(service).toMatch(/studio_cas_delete_track/);
    expect(service).toMatch(/StudioTrackCapacityError/);
    expect(service).toMatch(/assertTrackTypeDeletable/);
    expect(service).toMatch(/nextVocalTrackName/);
    expect(service).not.toMatch(/STUDIO_TRACK_LIMIT\s*=\s*2/);
  });

  it("routes expose POST add + DELETE track", () => {
    expect(addRoute).toMatch(/addStudioTrack/);
    expect(addRoute).toMatch(/expectedDocumentVersion/);
    expect(trackRoute).toMatch(/deleteStudioTrack/);
    expect(trackRoute).toMatch(/export async function DELETE/);
  });

  it("editor: add button, confirm delete, no second engine", () => {
    expect(editor).toMatch(/studio-add-track/);
    expect(editor).toMatch(/\+ Dodaj ścieżkę/);
    expect(editor).toMatch(/studio-delete-track-confirm/);
    expect(editor).toMatch(/Źródłowe nagrania pozostaną/);
    expect(editor).toMatch(/studio-track-menu/);
    expect(editor).toMatch(/function addTrack\(\): void/);
    expect(editor).toMatch(/function deleteTrack\(trackId: string\): void/);
    expect(editor).toMatch(
      /function addTrack\(\): void \{[\s\S]*?enqueuePersist/,
    );
    expect(editor).toMatch(
      /function deleteTrack\([\s\S]*?enqueuePersist/,
    );
    expect(editor).toMatch(/TRACK_CAPACITY_REACHED/);
    expect(editor).not.toMatch(/new StudioAudioEngine/);
    expect(editor).not.toMatch(/new AudioContext/);
  });

  it("no schema table rewrite — migration is RPC-only", () => {
    expect(migration).not.toMatch(/CREATE TABLE/);
    expect(migration).not.toMatch(/ALTER TABLE/);
    expect(migration).not.toMatch(/DROP TABLE/);
  });

  it("sacred WIP eligibility file content unchanged by Phase 5 imports", () => {
    // Phase 5 must not import or rewrite this module.
    expect(service).not.toMatch(/recording-eligibility-service/);
    expect(editor).not.toMatch(/recording-eligibility-service/);
    expect(eligibility).toMatch(/resolveRecordingEligibility/);
  });

  it("stable capacity code constant", () => {
    expect(TRACK_CAPACITY_REACHED).toBe("TRACK_CAPACITY_REACHED");
  });
});

describe("Phase 5 FREE capacity model (Bit counts)", () => {
  it("Bit + 1 Vocal = full FREE; Master not counted", () => {
    // Project seed creates BEAT + VOCAL → count 2 → FREE full.
    expect(
      canAddStudioTrack({ currentTrackCount: 2, maxTracks: 2 }),
    ).toBe(false);
    // BRONZE allows one more vocal.
    expect(
      canAddStudioTrack({ currentTrackCount: 2, maxTracks: 3 }),
    ).toBe(true);
  });
});
