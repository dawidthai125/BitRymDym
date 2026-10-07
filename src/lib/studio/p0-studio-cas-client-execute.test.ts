/**
 * P0 Security — studio_cas_* client EXECUTE revoke contract.
 * REVOKE FROM PUBLIC alone is insufficient under schema default privileges.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATION = join(
  process.cwd(),
  "supabase/migrations/20261007140000_p0_studio_cas_client_execute_revoke.sql",
);

const RPCS = [
  "studio_cas_apply_fx_chain",
  "studio_cas_apply_clip_fades",
  "studio_cas_apply_clip_geometry_fades",
  "studio_cas_apply_clip_split",
] as const;

describe("P0 — studio_cas_* client EXECUTE revoke", () => {
  const sql = readFileSync(MIGRATION, "utf8");

  it("is ACL-only (no CREATE/REPLACE body, no ALTER TABLE, no default-privilege DDL)", () => {
    const statements = sql
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("--"))
      .join("\n");
    expect(sql).toMatch(/P0 Security hardening/);
    expect(sql).toMatch(/REVOKE FROM PUBLIC does not remove role-level default grants/i);
    expect(statements).not.toMatch(/CREATE OR REPLACE FUNCTION/);
    expect(statements).not.toMatch(/ALTER TABLE/);
    expect(statements).not.toMatch(/CREATE TABLE/);
    expect(statements).not.toMatch(/ALTER DEFAULT PRIVILEGES/);
    expect(statements).not.toMatch(/auth\.uid\s*\(/);
  });

  it.each(RPCS)("%s revokes PUBLIC + anon/authenticated and grants service_role", (rpc) => {
    const escaped = rpc.replace(/_/g, "\\_");
    expect(sql).toMatch(
      new RegExp(
        `REVOKE ALL ON FUNCTION public\\.${escaped}[\\s\\S]*?FROM PUBLIC`,
      ),
    );
    expect(sql).toMatch(
      new RegExp(
        `REVOKE ALL ON FUNCTION public\\.${escaped}[\\s\\S]*?FROM anon, authenticated`,
      ),
    );
    expect(sql).toMatch(
      new RegExp(
        `GRANT EXECUTE ON FUNCTION public\\.${escaped}[\\s\\S]*?TO service_role`,
      ),
    );
  });

  it("covers exact four studio_cas signatures from production", () => {
    expect(sql).toMatch(
      /studio_cas_apply_fx_chain\(\s*uuid, uuid, integer, jsonb, uuid\s*\)/,
    );
    expect(sql).toMatch(
      /studio_cas_apply_clip_fades\(\s*uuid, uuid, uuid, integer, integer, integer\s*\)/,
    );
    expect(sql).toMatch(
      /studio_cas_apply_clip_geometry_fades\(\s*uuid, uuid, uuid, integer, integer, integer, integer, integer, integer\s*\)/,
    );
    expect(sql).toMatch(
      /studio_cas_apply_clip_split\(\s*uuid, uuid, uuid, integer,/,
    );
  });
});
