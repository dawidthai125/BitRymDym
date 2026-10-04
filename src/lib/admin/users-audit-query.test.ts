import { describe, expect, it } from "vitest";

import { canReadAdminUsersAudit } from "@/lib/admin/users-authz";
import {
  ADMIN_AUDIT_PAGE_SIZE,
  parseAdminAuditAction,
  parseAdminAuditTargetUserNumber,
  parseAdminUsersAuditQuery,
} from "@/lib/admin/users-audit-query";

describe("admin users W3 audit AuthZ", () => {
  it("ADMIN with audit_log.view PASS", () => {
    expect(canReadAdminUsersAudit("ADMIN", ["audit_log.view"])).toBe(true);
  });

  it("ADMIN with users.view only DENY", () => {
    expect(canReadAdminUsersAudit("ADMIN", ["users.view", "users.edit"])).toBe(
      false,
    );
  });

  it("MODERATOR DENY even with audit_log.view spoofed", () => {
    expect(canReadAdminUsersAudit("MODERATOR", ["audit_log.view", "users.view"])).toBe(
      false,
    );
  });

  it("USER DENY", () => {
    expect(canReadAdminUsersAudit("USER", ["audit_log.view"])).toBe(false);
  });

  it("unauthenticated / missing role DENY", () => {
    expect(canReadAdminUsersAudit(null, ["audit_log.view"])).toBe(false);
    expect(canReadAdminUsersAudit(undefined, ["audit_log.view"])).toBe(false);
  });
});

describe("admin users W3 audit query", () => {
  it("parses a valid action", () => {
    expect(parseAdminAuditAction("ADMIN_GRANT")).toBe("ADMIN_GRANT");
    const q = parseAdminUsersAuditQuery({
      auditAction: "PREMIUM_TIER_CHANGE",
      auditPage: "2",
    });
    expect(q.action).toBe("PREMIUM_TIER_CHANGE");
    expect(q.page).toBe(2);
  });

  it("ignores unknown action as all", () => {
    expect(parseAdminAuditAction("DELETE_USER")).toBeNull();
    expect(parseAdminAuditAction("all")).toBeNull();
    expect(parseAdminUsersAuditQuery({ auditAction: "DROP_TABLE" }).action).toBeNull();
  });

  it("parses a valid target user_number", () => {
    expect(parseAdminAuditTargetUserNumber("9")).toEqual({
      targetUserNumber: 9,
      rejectTarget: false,
    });
  });

  it("invalid user_number is rejected, not treated as all", () => {
    expect(parseAdminAuditTargetUserNumber("abc")).toEqual({
      targetUserNumber: null,
      rejectTarget: true,
    });
    expect(parseAdminAuditTargetUserNumber("0")).toEqual({
      targetUserNumber: null,
      rejectTarget: true,
    });
    expect(parseAdminAuditTargetUserNumber("-1")).toEqual({
      targetUserNumber: null,
      rejectTarget: true,
    });
    const q = parseAdminUsersAuditQuery({ auditUser: "not-a-number" });
    expect(q.rejectTarget).toBe(true);
    expect(q.targetUserNumber).toBeNull();
  });

  it("empty user_number means no target filter", () => {
    expect(parseAdminAuditTargetUserNumber("")).toEqual({
      targetUserNumber: null,
      rejectTarget: false,
    });
  });

  it("page defaults and bounds follow W1 cap", () => {
    expect(parseAdminUsersAuditQuery({}).page).toBe(1);
    expect(parseAdminUsersAuditQuery({ auditPage: "0" }).page).toBe(1);
    expect(parseAdminUsersAuditQuery({ auditPage: "-3" }).page).toBe(1);
    expect(parseAdminUsersAuditQuery({ auditPage: "9999" }).page).toBe(1000);
    expect(ADMIN_AUDIT_PAGE_SIZE).toBe(25);
  });

  it("does not accept list page as audit page", () => {
    const q = parseAdminUsersAuditQuery({ page: "7", auditPage: "3" });
    expect(q.page).toBe(3);
  });
});
