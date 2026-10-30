import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  addonPlanFit,
  addonStatusFromRow,
  parseAdminAddonErrorCode,
  parseAdminAddonInput,
  polishAdminAddonError,
} from "@/lib/admin/users-addons";
import { presentAdminAuditEvent } from "@/lib/admin/users-audit-present";
import { ADMIN_AUDIT_ACTIONS, parseAdminAuditAction } from "@/lib/admin/users-audit-query";
import { labelAdminAuditAction } from "@/lib/ui/labels";

const UID = "fdf04726-e971-42a7-9d46-8b9bdd099c23";
const NOW = Date.parse("2026-10-30T10:00:00Z");

describe("parseAdminAddonInput", () => {
  it("grant with a date → end of that day in Warsaw", () => {
    const r = parseAdminAddonInput(
      { targetUserId: UID, addon: "reference_mastering", grant: true, endsOn: "2026-11-30", note: " test " },
      NOW,
    );
    expect(r).toEqual({
      ok: true,
      value: {
        targetUserId: UID,
        addon: "reference_mastering",
        grant: true,
        endsAt: "2026-11-30T22:59:59.000Z",
        note: "test",
      },
    });
  });

  it("grant without a date = no expiry; empty note = null", () => {
    const r = parseAdminAddonInput({ targetUserId: UID, addon: "reference_mastering", grant: true, endsOn: "", note: "  " }, NOW);
    expect(r.ok && r.value.endsAt).toBeNull();
    expect(r.ok && r.value.note).toBeNull();
  });

  it("revoke ignores the date", () => {
    const r = parseAdminAddonInput({ targetUserId: UID, addon: "reference_mastering", grant: false, endsOn: "2020-01-01" }, NOW);
    expect(r.ok && r.value).toMatchObject({ grant: false, endsAt: null });
  });

  it("rejects bad input", () => {
    const base = { targetUserId: UID, addon: "reference_mastering", grant: true };
    expect(parseAdminAddonInput({ ...base, targetUserId: "x" }, NOW)).toEqual({ ok: false, code: "TARGET_NOT_FOUND" });
    expect(parseAdminAddonInput({ ...base, addon: "gold" }, NOW)).toEqual({ ok: false, code: "ADDON_INVALID" });
    expect(parseAdminAddonInput({ ...base, grant: "true" }, NOW)).toEqual({ ok: false, code: "ADDON_INVALID" });
    expect(parseAdminAddonInput({ ...base, endsOn: "30.11.2026" }, NOW)).toEqual({ ok: false, code: "ADDON_INVALID_DATE" });
    expect(parseAdminAddonInput({ ...base, endsOn: "2026-10-29" }, NOW)).toEqual({ ok: false, code: "ADDON_ENDS_IN_PAST" });
    expect(parseAdminAddonInput({ ...base, note: "x".repeat(201) }, NOW)).toEqual({ ok: false, code: "ADDON_NOTE_TOO_LONG" });
  });

  it("today is still valid (ends 23:59:59 Warsaw)", () => {
    const r = parseAdminAddonInput({ targetUserId: UID, addon: "reference_mastering", grant: true, endsOn: "2026-10-30" }, NOW);
    expect(r.ok).toBe(true);
  });
});

describe("errors + status", () => {
  it("maps RPC messages, longest code first", () => {
    expect(parseAdminAddonErrorCode("ERROR: ADDON_NOT_ACTIVE")).toBe("ADDON_NOT_ACTIVE");
    expect(parseAdminAddonErrorCode("ADDON_INVALID_DATE")).toBe("ADDON_INVALID_DATE");
    expect(parseAdminAddonErrorCode("ADMIN_FORBIDDEN")).toBe("ADMIN_FORBIDDEN");
    expect(parseAdminAddonErrorCode("boom")).toBe("MUTATION_FAILED");
    expect(polishAdminAddonError("ADDON_NOT_ACTIVE")).toMatch(/aktywnego dodatku/);
  });

  it("status from the open grant row", () => {
    expect(addonStatusFromRow(null, NOW)).toBeNull();
    expect(addonStatusFromRow({ revoked_at: "2026-10-01T00:00:00Z" }, NOW)).toBeNull();
    expect(addonStatusFromRow({ starts_at: "2026-10-01T00:00:00Z", ends_at: null }, NOW)).toEqual({ active: true, startsAt: null, endsAt: null, note: null });
    expect(addonStatusFromRow({ starts_at: "2026-10-31T00:00:00Z", ends_at: null }, NOW)).toMatchObject({ active: false, startsAt: "2026-10-31T00:00:00Z" });
    expect(addonStatusFromRow({ starts_at: "2026-10-01T00:00:00Z", ends_at: "2026-10-29T00:00:00Z" }, NOW)?.active).toBe(false);
  });

  it("plan fit: Gold included, Silver applies, others no effect", () => {
    expect(addonPlanFit("GOLD")).toBe("included");
    expect(addonPlanFit("SILVER")).toBe("applies");
    expect(addonPlanFit("BRONZE")).toBe("no_effect");
    expect(addonPlanFit("FREE")).toBe("no_effect");
  });
});

describe("audit", () => {
  it("new actions are filterable and labelled", () => {
    expect(ADMIN_AUDIT_ACTIONS).toContain("PLAN_ADDON_GRANT");
    expect(parseAdminAuditAction("PLAN_ADDON_REVOKE")).toBe("PLAN_ADDON_REVOKE");
    expect(labelAdminAuditAction("PLAN_ADDON_GRANT")).toBe("Dodanie dodatku do planu");
    expect(labelAdminAuditAction("PLAN_ADDON_REVOKE")).toBe("Odebranie dodatku do planu");
  });

  it("presents grant / revoke values", () => {
    const base = {
      id: "1",
      createdAt: "2026-10-30T10:00:00Z",
      actorUserId: UID,
      targetUserId: UID,
      actorUserNumber: 1,
      targetUserNumber: 1,
    };
    const grant = presentAdminAuditEvent({
      ...base,
      action: "PLAN_ADDON_GRANT",
      oldValue: { addon: "reference_mastering", active: false },
      newValue: { addon: "reference_mastering", active: true, endsAt: null },
    });
    expect(grant.oldLabel).toBe("Brak dodatku");
    expect(grant.newLabel).toBe("Mastering pod referencję · bezterminowo");
    const revoke = presentAdminAuditEvent({
      ...base,
      action: "PLAN_ADDON_REVOKE",
      oldValue: { addon: "reference_mastering", active: true, endsAt: "2026-11-30T22:59:59Z" },
      newValue: { addon: "reference_mastering", active: false },
    });
    expect(revoke.oldLabel).toMatch(/^Mastering pod referencję · do 30 lis 2026$/);
    expect(revoke.newLabel).toBe("Brak dodatku");
  });
});

describe("20261030110000_admin_plan_addons.sql", () => {
  const sql = readFileSync(
    path.resolve(__dirname, "../../../supabase/migrations/20261030110000_admin_plan_addons.sql"),
    "utf8",
  )
    .replace(/--.*$/gm, "")
    .replace(/\s+/g, " ");

  it("keeps every existing audit action and adds the add-on ones", () => {
    for (const a of [
      "ROLE_CHANGE", "ADMIN_GRANT", "ADMIN_REVOKE", "MODERATOR_GRANT", "MODERATOR_REVOKE",
      "PREMIUM_TIER_CHANGE", "PREMIUM_EXPIRATION_CHANGE", "USER_ACCOUNT_DELETE",
      "SAMPLE_POLICY_UPDATE", "BEAT_METADATA_UPDATE", "SITE_MAINTENANCE_UPDATE",
      "PLAN_ADDON_GRANT", "PLAN_ADDON_REVOKE",
    ]) {
      expect(sql).toContain(`'${a}'`);
    }
  });

  it("RPC is service_role only, checks ADMIN + users.edit and audits in the same function", () => {
    expect(sql).toMatch(/SECURITY DEFINER SET search_path = public/);
    expect(sql).toMatch(/auth\.role\(\), ''\) IS DISTINCT FROM 'service_role'/);
    expect(sql).toMatch(/v_actor_role IS DISTINCT FROM 'ADMIN'/);
    expect(sql).toMatch(/perm\.key = 'users\.edit'/);
    expect(sql).toMatch(/INSERT INTO public\.admin_audit_events/);
    expect(sql).toMatch(/FROM PUBLIC, anon, authenticated/);
    expect(sql).toMatch(/TO service_role;/);
  });
});
