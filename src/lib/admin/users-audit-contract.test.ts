import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function migrationSql(): string {
  const dir = join(ROOT, "supabase/migrations");
  const file = readdirSync(dir).find((name) =>
    name.endsWith("_admin_user_management_w2_mutations.sql"),
  );
  if (!file) throw new Error("W2 admin mutation migration missing");
  return readFileSync(join(dir, file), "utf8");
}

describe("admin users W2 SQL/RPC contract", () => {
  it("creates audit table with SET NULL FKs and no email column", () => {
    const sql = migrationSql();
    expect(sql).toMatch(/CREATE TABLE public\.admin_audit_events/);
    expect(sql).toMatch(/ON DELETE SET NULL/);
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/REVOKE ALL ON TABLE public\.admin_audit_events FROM anon/);
    expect(sql).toMatch(
      /REVOKE ALL ON TABLE public\.admin_audit_events FROM authenticated/,
    );
    expect(sql).toMatch(/admin_audit_events_target_created_idx/);
    expect(sql).not.toMatch(/email/);
    expect(sql).toMatch(/panel', 'admin_users'/);
    expect(sql).toMatch(/ADMIN_GRANT/);
    expect(sql).toMatch(/ADMIN_REVOKE/);
    expect(sql).toMatch(/PREMIUM_TIER_CHANGE/);
    expect(sql).toMatch(/PREMIUM_EXPIRATION_CHANGE/);
  });

  it("RPC is atomic SECURITY DEFINER service_role-only with last-admin lock", () => {
    const sql = migrationSql();
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.admin_apply_user_management/);
    expect(sql).toMatch(/SECURITY DEFINER/);
    expect(sql).toMatch(/SET search_path = public/);
    expect(sql).toMatch(/pg_advisory_xact_lock\(4242026, 2002\)/);
    expect(sql).toMatch(/WHERE role = 'ADMIN'/);
    expect(sql).toMatch(/FOR UPDATE/);
    expect(sql).toMatch(/LAST_ADMIN_PROTECTED/);
    expect(sql).toMatch(/SELF_DEMOTION_FORBIDDEN/);
    expect(sql).toMatch(/source = 'manual_admin'/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.admin_apply_user_management/);
    expect(sql).toMatch(/TO service_role/);
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.admin_apply_user_management[\s\S]*FROM authenticated/,
    );
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.admin_apply_user_management[\s\S]*FROM PUBLIC/,
    );
    expect(sql).toMatch(/WHEN raise_exception THEN/);
    expect(sql).toMatch(/RAISE EXCEPTION 'MUTATION_FAILED'/);
    expect(sql).not.toMatch(/CREATE OR REPLACE FUNCTION public\.prevent_/);
    expect(sql).not.toMatch(/DROP INDEX/);
  });

  it("does not write passwords tokens or actor email into audit metadata", () => {
    const sql = migrationSql();
    expect(sql.toLowerCase()).not.toMatch(/password/);
    expect(sql.toLowerCase()).not.toMatch(/token/);
    expect(sql.toLowerCase()).not.toMatch(/secret/);
    expect(sql).not.toMatch(/auth\.users/);
  });
});

describe("admin users W2 no client foreign DML", () => {
  it("manage dialog and list do not touch supabase admin DML", () => {
    const dialog = readFileSync(
      join(ROOT, "src/components/admin/admin-users-manage-dialog.tsx"),
      "utf8",
    );
    const list = readFileSync(join(ROOT, "src/lib/admin/users-list.ts"), "utf8");
    const actions = readFileSync(
      join(ROOT, "src/app/admin/users/actions.ts"),
      "utf8",
    );
    expect(dialog).not.toMatch(/createSupabaseAdminClient/);
    expect(dialog).not.toMatch(/\.from\("profiles"\)/);
    expect(dialog).not.toMatch(/premium_entitlements/);
    expect(list).not.toMatch(/\.insert\(/);
    expect(list).not.toMatch(/\.update\(/);
    expect(actions).toMatch(/requireRole\(\["ADMIN"\]\)/);
    expect(actions).toMatch(/requirePermission\("users.edit"\)/);
    expect(actions).toMatch(/p_actor_id: context\.userId/);
    expect(actions).not.toMatch(/p_actor_id: input/);
    expect(actions).toMatch(/polishAdminUsersMutationError/);
    expect(actions).not.toMatch(/error: error\.message/);
  });

  it("existing privilege triggers still deny authenticated role/premium DML", () => {
    const identity = readFileSync(
      join(ROOT, "supabase/migrations/20260925120000_phase_1_3_identity.sql"),
      "utf8",
    );
    const premium = readFileSync(
      join(
        ROOT,
        "supabase/migrations/20260928200000_e3_1_audio_foundation.sql",
      ),
      "utf8",
    );
    expect(identity).toMatch(/prevent_privilege_escalation/);
    expect(premium).toMatch(/Only service_role may mutate premium_entitlements/);
  });
});
