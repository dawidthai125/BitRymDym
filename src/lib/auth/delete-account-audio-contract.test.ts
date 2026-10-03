import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("ACCOUNT/PROFILE-01 delete / audio trigger contract", () => {
  const mig = read(
    "supabase/migrations/20261003160000_account_profile_01.sql",
  );
  const del = read("src/lib/auth/delete-account.ts");

  it("migration keeps USER INSERT requiring living owner_id", () => {
    expect(mig).toMatch(
      /IF TG_OP = 'INSERT' THEN[\s\S]*USER beat missing owner_id for audio asset/,
    );
  });

  it("migration allows created_by-only nullify for service_role/admin path", () => {
    expect(mig).toContain("created_by_nullify_only");
    expect(mig).toContain("NEW.created_by IS NULL");
    expect(mig).toContain(
      "Only ADMIN may mutate beat audio assets",
    );
  });

  it("migration allows retained USER+NULL owner historical user/ keys on UPDATE", () => {
    expect(mig).toContain("Retained anonymized USER beat");
    expect(mig).toContain("USER audio object key must start with user/");
  });

  it("far01_live_mutator still cannot operate on NULL owner USER beats", () => {
    // Within live_mutator branch, NULL owner remains forbidden.
    const liveBranch = mig.slice(
      mig.indexOf("IF TG_OP = 'UPDATE' AND is_live_mutator"),
      mig.indexOf("IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN"),
    );
    expect(liveBranch).toContain(
      "USER beat missing owner_id for audio asset",
    );
  });

  it("orchestrator nullifies created_by before anonymize and Auth delete", () => {
    const nullifyAt = del.indexOf("created_by_nullify");
    const anonymizeAt = del.indexOf('step: "anonymize"');
    const authAt = del.indexOf("admin.auth.admin.deleteUser");
    expect(nullifyAt).toBeGreaterThan(-1);
    expect(anonymizeAt).toBeGreaterThan(nullifyAt);
    expect(authAt).toBeGreaterThan(anonymizeAt);
    expect(del).toContain(".update({ created_by: null })");
    expect(del).toContain('.eq("created_by", userId)');
  });

  it("playback path does not require created_by or owner_id", () => {
    const access = read("src/lib/beats/audio-access.ts");
    expect(access).toContain("resolveActiveAsset");
    expect(access).toContain('.eq("beat_id", params.beatId)');
    // Access gate selects assets by beat_id/status — not created_by.
    expect(access).not.toMatch(/created_by/);
  });
});
