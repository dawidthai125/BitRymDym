import { describe, expect, it } from "vitest";

import {
  formatProfileWithUserNumber,
  mapProfileRow,
  PROFILE_SELECT_OWN,
  type ProfileRow,
} from "@/lib/auth/types";
import {
  toPublicBeatDetail,
  toPublicCatalogItem,
} from "@/lib/beats/public";
import type { Beat } from "@/types/domain";

describe("USER-ID-01 stable user number (unit)", () => {
  it("maps own profile whitelist including user_number", () => {
    expect(PROFILE_SELECT_OWN).toContain("user_number");
    expect(PROFILE_SELECT_OWN).not.toContain("*");

    const row: ProfileRow = {
      id: "fdf04726-e971-42a7-9d46-8b9bdd099c23",
      display_name: "Dawid",
      user_number: 1,
      role: "ADMIN",
      account_level: "BEGINNER_RAPPER",
      experience_total: 0,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    };
    expect(mapProfileRow(row).userNumber).toBe(1);
    expect(mapProfileRow(row).experienceTotal).toBe(0);
    expect(PROFILE_SELECT_OWN).toContain("experience_total");
  });

  it("formats account/admin label; null number stays bare name (Tajski)", () => {
    expect(formatProfileWithUserNumber("Dawid", 1)).toBe("Dawid (ID: 1)");
    expect(formatProfileWithUserNumber("Tajski", null)).toBe("Tajski");
    expect(formatProfileWithUserNumber("RaperXYZ", 2)).toBe("RaperXYZ (ID: 2)");
  });

  it("documents DB UPDATE immutability contract (incl. NULL → value)", () => {
    // BEFORE UPDATE trigger must reject any NEW.user_number IS DISTINCT FROM OLD
    // for non-service_role. INSERT DEFAULT nextval is out of scope (not UPDATE).
    const hardeningSql = `
IF NEW.user_number IS DISTINCT FROM OLD.user_number THEN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'user_number is immutable for this caller';
`;
    expect(hardeningSql).toMatch(/IS DISTINCT FROM OLD\.user_number/);
    expect(hardeningSql).not.toMatch(/OLD\.user_number IS NOT NULL/);
  });

  it("public catalog/detail DTOs never expose user_number or ownerId", () => {
    const beat: Beat = {
      id: "beat-1",
      ownerId: "fdf04726-e971-42a7-9d46-8b9bdd099c23",
      ownershipType: "USER",
      title: "Night Run",
      producer: "Dawid",
      description: "Desc",
      genre: "Trap",
      style: "Dark",
      bpm: 140,
      key: "A",
      scale: "minor",
      durationSeconds: 125,
      tags: [],
      coverRef: null,
      status: "PUBLISHED",
      rejectionReason: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const catalog = toPublicCatalogItem(beat);
    const detail = toPublicBeatDetail(beat);
    expect(catalog).not.toHaveProperty("user_number");
    expect(catalog).not.toHaveProperty("userNumber");
    expect(catalog).not.toHaveProperty("ownerId");
    expect(detail).not.toHaveProperty("user_number");
    expect(detail).not.toHaveProperty("userNumber");
    expect(detail).not.toHaveProperty("ownerId");
    expect(detail.producer).toBe("Dawid");
  });
});
