import { describe, expect, it } from "vitest";

import { presentAdminAuditEvent } from "@/lib/admin/users-audit-present";

const base = {
  id: "evt-1",
  createdAt: "2026-10-04T15:42:00.000Z",
  actorUserId: "actor-live",
  targetUserId: "target-live",
  actorUserNumber: 1,
  targetUserNumber: 9,
  targetDisplayName: "Kora",
};

function labelsOf(row: ReturnType<typeof presentAdminAuditEvent>) {
  return `${row.createdAt} ${row.actorLabel} ${row.targetLabel} ${row.action} ${row.oldLabel} ${row.newLabel}`;
}

describe("admin users W3 presenter", () => {
  it("ROLE_CHANGE maps roles", () => {
    const row = presentAdminAuditEvent({
      ...base,
      action: "ROLE_CHANGE",
      oldValue: { role: "USER" },
      newValue: { role: "ADMIN" },
    });
    expect(row.action).toBe("Zmiana roli");
    expect(row.oldLabel).toBe("Użytkownik");
    expect(row.newLabel).toBe("Administrator");
    expect(row.createdAt).toMatch(/2026/);
    expect(row.createdAt).toMatch(/17:42/);
  });

  it("ADMIN_GRANT / ADMIN_REVOKE / MODERATOR_GRANT / MODERATOR_REVOKE", () => {
    expect(
      presentAdminAuditEvent({
        ...base,
        action: "ADMIN_GRANT",
        oldValue: { role: "USER" },
        newValue: { role: "ADMIN" },
      }).action,
    ).toBe("Nadanie roli administratora");
    expect(
      presentAdminAuditEvent({
        ...base,
        action: "ADMIN_REVOKE",
        oldValue: { role: "ADMIN" },
        newValue: { role: "USER" },
      }).action,
    ).toBe("Odebranie roli administratora");
    expect(
      presentAdminAuditEvent({
        ...base,
        action: "MODERATOR_GRANT",
        oldValue: { role: "USER" },
        newValue: { role: "MODERATOR" },
      }).action,
    ).toBe("Nadanie roli moderatora");
    expect(
      presentAdminAuditEvent({
        ...base,
        action: "MODERATOR_REVOKE",
        oldValue: { role: "MODERATOR" },
        newValue: { role: "USER" },
      }).action,
    ).toBe("Odebranie roli moderatora");
  });

  it("PREMIUM_TIER_CHANGE uses Free/Bronze/Silver/Gold", () => {
    const row = presentAdminAuditEvent({
      ...base,
      action: "PREMIUM_TIER_CHANGE",
      oldValue: { premiumTier: "FREE", active: false },
      newValue: { premiumTier: "GOLD", active: true },
    });
    expect(row.action).toBe("Zmiana Premium");
    expect(row.oldLabel).toBe("Free");
    expect(row.newLabel).toBe("Gold");
    expect(row.oldLabel).not.toMatch(/active/i);
    expect(row.newLabel).not.toMatch(/true|false/);
  });

  it("PREMIUM_EXPIRATION_CHANGE formats Warsaw dates and null as Bezterminowo", () => {
    const row = presentAdminAuditEvent({
      ...base,
      action: "PREMIUM_EXPIRATION_CHANGE",
      oldValue: { expiresAt: null },
      newValue: { expiresAt: "2027-01-15T22:59:59.000Z" },
    });
    expect(row.action).toBe("Zmiana daty wygaśnięcia");
    expect(row.oldLabel).toBe("Bezterminowo");
    expect(row.newLabel).toMatch(/2027/);
  });

  it("null target with snapshot number stays visible", () => {
    const row = presentAdminAuditEvent({
      ...base,
      action: "ADMIN_GRANT",
      targetUserId: null,
      targetDisplayName: "ignored",
      oldValue: { role: "USER" },
      newValue: { role: "ADMIN" },
    });
    expect(row.targetLabel).toBe("Użytkownik · #9");
  });

  it("null actor with number snapshot", () => {
    const row = presentAdminAuditEvent({
      ...base,
      action: "ROLE_CHANGE",
      actorUserId: null,
      oldValue: { role: "USER" },
      newValue: { role: "MODERATOR" },
    });
    expect(row.actorLabel).toBe("Konto usunięte · #1");
  });

  it("null actor without number", () => {
    const row = presentAdminAuditEvent({
      ...base,
      action: "ROLE_CHANGE",
      actorUserId: null,
      actorUserNumber: null,
      oldValue: { role: "USER" },
      newValue: { role: "USER" },
    });
    expect(row.actorLabel).toBe("Konto usunięte");
  });

  it("null target without number", () => {
    const row = presentAdminAuditEvent({
      ...base,
      action: "ROLE_CHANGE",
      targetUserId: null,
      targetUserNumber: null,
      oldValue: { role: "USER" },
      newValue: { role: "USER" },
    });
    expect(row.targetLabel).toBe("Użytkownik usunięty");
  });

  it("live target without ksywka", () => {
    const row = presentAdminAuditEvent({
      ...base,
      action: "ROLE_CHANGE",
      targetDisplayName: "  ",
      oldValue: { role: "USER" },
      newValue: { role: "USER" },
    });
    expect(row.targetLabel).toBe("Użytkownik · #9");
  });

  it("unknown JSON shape is a dash, not raw JSON", () => {
    const row = presentAdminAuditEvent({
      ...base,
      action: "ROLE_CHANGE",
      oldValue: { foo: "bar", email: "leak@example.com" },
      newValue: ["not", "an", "object"],
    });
    expect(row.oldLabel).toBe("—");
    expect(row.newLabel).toBe("—");
    const text = labelsOf(row);
    expect(text).not.toContain("{");
    expect(text).not.toContain("foo");
    expect(text).not.toMatch(/leak@example\.com/i);
  });

  it("USER_ACCOUNT_DELETE shows escaped reason, never email or JSON", () => {
    const row = presentAdminAuditEvent({
      ...base,
      action: "USER_ACCOUNT_DELETE",
      targetUserId: null,
      oldValue: { role: "USER", premiumActive: false, email: "leak@example.com" },
      newValue: { deleted: true },
      metadata: { panel: "admin_users", reason: "Naruszenie regulaminu" },
    });
    expect(row.action).toBe("Usunięcie konta");
    expect(row.newLabel).toBe("Powód: Naruszenie regulaminu");
    expect(row.oldLabel).toBe("Użytkownik");
    const text = labelsOf(row);
    expect(text).not.toMatch(/leak@example\.com/i);
    expect(text).not.toContain("{");
    expect(text).not.toContain("premiumActive");
  });

  it("USER_ACCOUNT_DELETE missing reason is Powód niedostępny", () => {
    const row = presentAdminAuditEvent({
      ...base,
      action: "USER_ACCOUNT_DELETE",
      oldValue: { role: "USER" },
      newValue: { deleted: true },
      metadata: { panel: "admin_users" },
    });
    expect(row.newLabel).toBe("Powód niedostępny");
  });

  it("does not expose email or stringify payloads", () => {
    const row = presentAdminAuditEvent({
      ...base,
      action: "PREMIUM_TIER_CHANGE",
      oldValue: { premiumTier: "SILVER", email: "a@b.c" },
      newValue: { premiumTier: "BRONZE" },
    });
    expect(row.oldLabel).toBe("Silver");
    expect(row.newLabel).toBe("Bronze");
    const text = labelsOf(row);
    expect(text).not.toMatch(/@/);
    expect(text).not.toContain("premiumTier");
    expect(JSON.stringify(row)).not.toMatch(/@/);
  });
});
