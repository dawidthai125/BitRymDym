/** Contract: site_settings migration is additive, locked down, and audited. */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  path.resolve(__dirname, "../../../supabase/migrations/20261030060000_site_maintenance.sql"),
  "utf8",
)
  .replace(/--.*$/gm, "")
  .replace(/\s+/g, " ");

describe("20261030060000_site_maintenance.sql", () => {
  it("creates a singleton site_settings with RLS and no anon/authenticated table access", () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.site_settings/);
    expect(sql).toMatch(/CHECK \(id = 1\)/);
    expect(sql).toMatch(/maintenance_enabled boolean NOT NULL DEFAULT false/);
    expect(sql).toMatch(/ALTER TABLE public\.site_settings ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/REVOKE ALL ON TABLE public\.site_settings FROM anon/);
    expect(sql).toMatch(/REVOKE ALL ON TABLE public\.site_settings FROM authenticated/);
    expect(sql).not.toMatch(/GRANT [A-Z, ]+ ON (TABLE )?public\.site_settings/);
    expect(sql).not.toMatch(/CREATE POLICY/);
  });

  it("seeds the site as UP (never ships with maintenance on)", () => {
    expect(sql).toMatch(/VALUES \(1, false\) ON CONFLICT \(id\) DO NOTHING/);
  });

  it("exposes state via a SECURITY DEFINER RPC with a pinned search_path", () => {
    expect(sql).toMatch(/FUNCTION public\.get_site_maintenance\(\) RETURNS jsonb/);
    expect(sql).toMatch(/SECURITY DEFINER SET search_path = public, pg_temp/);
    expect(sql).toMatch(/p\.id = auth\.uid\(\) AND p\.role = 'ADMIN'/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.get_site_maintenance\(\) TO anon, authenticated/);
  });

  it("extends the audit CHECK without dropping existing actions", () => {
    for (const action of [
      "ROLE_CHANGE",
      "ADMIN_GRANT",
      "ADMIN_REVOKE",
      "MODERATOR_GRANT",
      "MODERATOR_REVOKE",
      "PREMIUM_TIER_CHANGE",
      "PREMIUM_EXPIRATION_CHANGE",
      "USER_ACCOUNT_DELETE",
      "SAMPLE_POLICY_UPDATE",
      "BEAT_METADATA_UPDATE",
      "SITE_MAINTENANCE_UPDATE",
    ]) {
      expect(sql).toContain(`'${action}'`);
    }
  });

  it("touches no user data", () => {
    expect(sql).not.toMatch(/\b(DELETE FROM|TRUNCATE|UPDATE public\.)/i);
    expect(sql).not.toMatch(/DROP TABLE/i);
  });
});
