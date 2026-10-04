import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function w4Sql(): string {
  const dir = join(ROOT, "supabase/migrations");
  const file = readdirSync(dir).find((name) =>
    name.endsWith("_admin_user_management_w4_delete.sql"),
  );
  if (!file) throw new Error("W4 admin delete migration missing");
  return readFileSync(join(dir, file), "utf8");
}

describe("admin users W4 SQL contract", () => {
  it("extends action CHECK with USER_ACCOUNT_DELETE and no new table", () => {
    const sql = w4Sql();
    expect(sql).toMatch(/USER_ACCOUNT_DELETE/);
    expect(sql).toMatch(/DROP CONSTRAINT admin_audit_events_action_chk/);
    expect(sql).toMatch(/ADD CONSTRAINT admin_audit_events_action_chk/);
    expect(sql).not.toMatch(/CREATE TABLE/);
    expect(sql).not.toMatch(/email/i);
    expect(sql).not.toMatch(/GRANT INSERT ON TABLE public\.admin_audit_events TO anon/);
    expect(sql).not.toMatch(/GRANT INSERT ON TABLE public\.admin_audit_events TO authenticated/);
  });

  it("assert RPC uses the same last-admin lock as W2", () => {
    const sql = w4Sql();
    const w2 = readFileSync(
      join(ROOT, "supabase/migrations/20261004180000_admin_user_management_w2_mutations.sql"),
      "utf8",
    );
    expect(w2).toMatch(/pg_advisory_xact_lock\(4242026, 2002\)/);
    expect(sql).toMatch(/pg_advisory_xact_lock\(4242026, 2002\)/);
    expect(sql).toMatch(/admin_assert_user_deletable/);
    expect(sql).toMatch(/SELF_DELETE_FORBIDDEN/);
    expect(sql).toMatch(/LAST_ADMIN_PROTECTED/);
    expect(sql).toMatch(/SECURITY DEFINER/);
    expect(sql).toMatch(/SET search_path = public/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.admin_assert_user_deletable/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.admin_assert_user_deletable[\s\S]*TO service_role/);
    expect(sql).not.toMatch(/users\.suspend/);
  });
});

describe("admin users W4 action / UI contract", () => {
  it("server action uses session actor and shared deletion core", () => {
    const actions = readFileSync(
      join(ROOT, "src/app/admin/users/actions.ts"),
      "utf8",
    );
    expect(actions).toMatch(/adminDeleteUserAction/);
    expect(actions).toMatch(/requireRole\(\["ADMIN"\]\)/);
    expect(actions).toMatch(/requirePermission\("users.edit"\)/);
    expect(actions).toMatch(/p_actor_id: context\.userId/);
    expect(actions).toMatch(/executeAccountProfile01Deletion/);
    expect(actions).toMatch(/USER_ACCOUNT_DELETE/);
    expect(actions).toMatch(/getUserById/);
    expect(actions).toMatch(/sendAdminAccountDeletionEmail/);
    expect(actions).not.toMatch(/actorUserId: input/);
    expect(actions).not.toMatch(/error: error\.message/);
    expect(actions).not.toMatch(/RESEND_API_KEY/);
    expect(actions).not.toMatch(/console\.log/);
  });

  it("delete dialog is danger confirm with reason and no client admin client", () => {
    const dialog = readFileSync(
      join(ROOT, "src/components/admin/admin-users-delete-dialog.tsx"),
      "utf8",
    );
    expect(dialog).toMatch("Usuń konto");
    expect(dialog).toMatch("Ta operacja jest nieodwracalna.");
    expect(dialog).toMatch("Powód usunięcia konta");
    expect(dialog).toMatch("Nie możesz usunąć własnego konta.");
    expect(dialog).not.toMatch(/createSupabaseAdminClient/);
    expect(dialog).not.toMatch(/auth\.admin\.deleteUser/);
  });
});
