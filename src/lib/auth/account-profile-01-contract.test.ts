import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { PROTECTED_PROFILE_FIELDS } from "@/lib/auth/permissions";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("ACCOUNT/PROFILE-01 contract (static)", () => {
  it("migration does not UNIQUE display_name or alter user_number columns", () => {
    const sql = read(
      "supabase/migrations/20261003160000_account_profile_01.sql",
    );
    expect(sql).toContain("public_author_display_names");
    expect(sql).toContain("ON DELETE SET NULL");
    expect(sql).not.toMatch(/UNIQUE\s*\(.*display_name/i);
    expect(sql).toContain("Does NOT change user_number");
    expect(sql).not.toMatch(/ADD COLUMN\s+.*user_number/i);
    expect(sql).not.toMatch(/DROP COLUMN\s+.*user_number/i);
    expect(sql).not.toMatch(/user_number_seq/i);
  });

  it("protected fields include id role account_level user_number", () => {
    expect(PROTECTED_PROFILE_FIELDS).toEqual(
      expect.arrayContaining(["id", "role", "account_level", "user_number"]),
    );
  });

  it("signup action validates ksywka and confirm password", () => {
    const actions = read("src/lib/auth/actions.ts");
    expect(actions).toContain("validateDisplayName");
    expect(actions).toContain("confirmPassword");
    expect(actions).toContain("changePasswordAction");
    expect(actions).toContain("requestPasswordResetAction");
    expect(actions).toContain("deleteAccountAction");
    expect(actions).toContain("resetPasswordForEmail");
    expect(actions).toContain("updateUser");
    expect(actions).not.toMatch(/password.*=.*console\.log/i);
  });

  it("delete orchestrator is session-bound and selective on Storage", () => {
    const del = read("src/lib/auth/delete-account.ts");
    expect(del).toContain("reauthenticateWithPassword");
    expect(del).toContain("ANONYMIZED_PUBLIC_AUTHOR");
    expect(del).toContain("selectiveUserStorageCleanup");
    expect(del).toContain("admin.auth.admin.deleteUser");
    expect(del).toContain("beat_download_events");
    expect(del).toContain("USER_PREFIX");
    // Cleanup walks only user/{uuid}/ — never storage.from("platform")
    expect(del).not.toMatch(/storage\.from\(\s*["']platform["']/);
  });

  it("callback keeps recovery session for reset password (PKCE+OTP)", () => {
    const cb = read("src/app/auth/callback/route.ts");
    const actions = read("src/lib/auth/actions.ts");
    expect(cb).toContain("decideAuthCallbackRoute");
    expect(cb).toContain("/auth/reset-password");
    expect(cb).toContain("flow");
    expect(actions).toContain("getAuthPasswordResetRedirectTo");
    expect(actions).not.toMatch(
      /resetPasswordForEmail[\s\S]*getAuthEmailRedirectTo/,
    );
  });

  it("delete nullifies created_by before Auth delete", () => {
    const del = read("src/lib/auth/delete-account.ts");
    expect(del).toContain("created_by_nullify");
    expect(del.indexOf("created_by_nullify")).toBeLessThan(
      del.indexOf("admin.auth.admin.deleteUser"),
    );
  });

  it("USER-ID-01 hardening migration remains present", () => {
    // Sequence / immutability contract must not be rewritten by ACCOUNT-01.
    const listing = read(
      "supabase/migrations/20261003123000_user_id_01_user_number_null_hardening.sql",
    );
    expect(listing).toMatch(/user_number/);
  });
});
