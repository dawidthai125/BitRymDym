import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

describe("P1 sample_policy_settings migration contract", () => {
  it("creates singleton settings table + SAMPLE_POLICY_UPDATE audit action", () => {
    const dir = join(process.cwd(), "supabase/migrations");
    const file = readdirSync(dir).find((name) =>
      name.includes("p1_sample_policy_settings"),
    );
    expect(file).toBeTruthy();
    const sql = readFileSync(join(dir, file!), "utf8");
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.sample_policy_settings/);
    expect(sql).toMatch(/bronze_max_recording_seconds/);
    expect(sql).toMatch(/silver_max_recording_seconds/);
    expect(sql).toMatch(/gold_max_recording_seconds/);
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/REVOKE ALL ON TABLE public\.sample_policy_settings FROM anon/);
    expect(sql).toMatch(
      /REVOKE ALL ON TABLE public\.sample_policy_settings FROM authenticated/,
    );
    expect(sql).toMatch(/SAMPLE_POLICY_UPDATE/);
    expect(sql).toMatch(/CHECK \(id = 1\)/);
  });

  it("settings service requires ADMIN and validates range", () => {
    const src = readFileSync(
      join(process.cwd(), "src/lib/takes/sample-policy-settings.ts"),
      "utf8",
    );
    expect(src).toContain('requireRole(["ADMIN"])');
    expect(src).toContain("validateAdminRecordingDurationSeconds");
    expect(src).toContain("SAMPLE_POLICY_UPDATE");
    expect(src).not.toContain("requireRole([\"MODERATOR\"]);");
  });

  it("Admin page is ADMIN-gated", () => {
    const page = readFileSync(
      join(process.cwd(), "src/app/admin/sample-policy/page.tsx"),
      "utf8",
    );
    expect(page).toContain('requireRole(["ADMIN"])');
  });

  it("transport wires Product Entitlement + Sample Policy (not Account Level)", () => {
    const transport = readFileSync(
      join(process.cwd(), "src/lib/takes/take-transport.ts"),
      "utf8",
    );
    expect(transport).toContain("resolveProductEntitlementForAuthContext");
    expect(transport).toContain("loadSamplePolicyDurationOverrides");
    expect(transport).toContain("antiAbuseCapsFromPolicy");
    expect(transport).not.toContain("antiAbuseCapsForAccountLevel");
    expect(transport).not.toContain("retentionSecondsForAccountLevel");
  });
});
