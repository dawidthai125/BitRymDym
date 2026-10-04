import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

describe("admin users W3 read-layer contract", () => {
  it("SELECT only — no INSERT UPDATE DELETE and no MAX_SCAN slice", () => {
    const src = readFileSync(join(ROOT, "src/lib/admin/users-audit-list.ts"), "utf8");
    expect(src).toMatch(/READ-ONLY/);
    expect(src).toMatch(/createSupabaseAdminClient/);
    expect(src).toMatch(/admin_audit_events/);
    expect(src).toMatch(/old_value/);
    expect(src).toMatch(/new_value/);
    expect(src).toMatch(/\.range\(/);
    expect(src).toMatch(/created_at/);
    expect(src).toMatch(/requireAdminUsersAuditAccess/);
    expect(src).toMatch(/audit_log\.view/);
    expect(src).toMatch(/metadata/);
    expect(src).not.toMatch(/\.insert\(/);
    expect(src).not.toMatch(/\.update\(/);
    expect(src).not.toMatch(/\.upsert\(/);
    expect(src).not.toMatch(/\.delete\(/);
    expect(src).not.toMatch(/ADMIN_USERS_MAX_SCAN/);
    expect(src).not.toMatch(/admin_apply_user_management/);
  });

  it("does not add a read RPC or authenticated SELECT policy", () => {
    const src = readFileSync(join(ROOT, "src/lib/admin/users-audit-list.ts"), "utf8");
    expect(src).not.toMatch(/rpc\(/);
    expect(src).not.toMatch(/CREATE POLICY/);
    expect(src).not.toMatch(/authenticated/);
  });
});

describe("admin users W3 UI contract", () => {
  it("history section replaces the W3 placeholder and has empty/error copy", () => {
    const src = readFileSync(join(ROOT, "src/app/admin/users/page.tsx"), "utf8");
    expect(src).toMatch("Historia zmian");
    expect(src).toMatch("Brak zapisanych zmian.");
    expect(src).toMatch("Nie znaleziono zmian dla podanych filtrów.");
    expect(src).toMatch("Nie udało się pobrać historii zmian.");
    expect(src).not.toMatch("Historia zmian pojawi się w kolejnej wersji.");
    expect(src).not.toMatch("error.message");
    expect(src).not.toMatch("JSON.stringify");
    expect(src).toMatch("listAdminUserAuditEvents");
  });

  it("presenter and page never stringify payloads for UI", () => {
    const present = readFileSync(
      join(ROOT, "src/lib/admin/users-audit-present.ts"),
      "utf8",
    );
    expect(present).not.toMatch(/JSON\.stringify/);
    expect(present).not.toMatch(/\bemail\b/);
  });

  it("optional manage-dialog history link filters by user_number", () => {
    const src = readFileSync(
      join(ROOT, "src/components/admin/admin-users-manage-dialog.tsx"),
      "utf8",
    );
    expect(src).toMatch("Historia tego ID");
    expect(src).toMatch("auditUser=");
  });
});
