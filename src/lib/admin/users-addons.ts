/**
 * Admin users — plan add-ons (grant / revoke), pure parsing + presentation.
 * Writes go through admin_set_plan_addon (service_role RPC: one transaction with the audit row).
 */

import { warsawEndOfDayToUtcIso } from "@/lib/admin/users-mutate";
import { PLAN_ADDONS, type PlanAddon } from "@/config/plan-policy";
import type { PremiumTier } from "@/types/premium";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const ADMIN_PLAN_ADDONS = PLAN_ADDONS;
export type AdminPlanAddon = PlanAddon;

export const ADMIN_ADDON_NOTE_MAX = 200;

export const ADMIN_ADDON_CODES = [
  "ADMIN_FORBIDDEN",
  "TARGET_NOT_FOUND",
  "ADDON_INVALID",
  "ADDON_ENDS_IN_PAST",
  "ADDON_INVALID_DATE",
  "ADDON_NOTE_TOO_LONG",
  "ADDON_NOT_ACTIVE",
  "MUTATION_FAILED",
] as const;
export type AdminAddonCode = (typeof ADMIN_ADDON_CODES)[number];

const POLISH: Record<AdminAddonCode, string> = {
  ADMIN_FORBIDDEN: "Brak uprawnień do zmiany użytkowników.",
  TARGET_NOT_FOUND: "Nie znaleziono użytkownika.",
  ADDON_INVALID: "Nieznany dodatek.",
  ADDON_ENDS_IN_PAST: "Data końca dodatku musi być w przyszłości.",
  ADDON_INVALID_DATE: "Nieprawidłowa data końca dodatku.",
  ADDON_NOTE_TOO_LONG: "Notatka może mieć maksymalnie 200 znaków.",
  ADDON_NOT_ACTIVE: "Ten użytkownik nie ma aktywnego dodatku.",
  MUTATION_FAILED: "Nie udało się zapisać zmian.",
};

export function polishAdminAddonError(code: AdminAddonCode): string {
  return POLISH[code];
}

/** Maps an RPC error message to a known code (longest match first: ADDON_INVALID_DATE vs ADDON_INVALID). */
export function parseAdminAddonErrorCode(raw: string | null | undefined): AdminAddonCode {
  const text = raw ?? "";
  const byLength = [...ADMIN_ADDON_CODES].sort((a, b) => b.length - a.length);
  for (const code of byLength) {
    if (text.includes(code)) return code;
  }
  return "MUTATION_FAILED";
}

export type ParsedAdminAddonInput = {
  targetUserId: string;
  addon: AdminPlanAddon;
  grant: boolean;
  endsAt: string | null;
  note: string | null;
};

export function parseAdminAddonInput(
  raw: {
    targetUserId?: unknown;
    addon?: unknown;
    grant?: unknown;
    endsOn?: unknown;
    note?: unknown;
  },
  nowMs: number = Date.now(),
): { ok: true; value: ParsedAdminAddonInput } | { ok: false; code: AdminAddonCode } {
  const targetUserId = String(raw.targetUserId ?? "").trim();
  if (!UUID_RE.test(targetUserId)) return { ok: false, code: "TARGET_NOT_FOUND" };

  const addon = String(raw.addon ?? "").trim();
  if (!(ADMIN_PLAN_ADDONS as readonly string[]).includes(addon)) {
    return { ok: false, code: "ADDON_INVALID" };
  }
  if (typeof raw.grant !== "boolean") return { ok: false, code: "ADDON_INVALID" };

  const noteRaw = typeof raw.note === "string" ? raw.note.trim() : "";
  if (noteRaw.length > ADMIN_ADDON_NOTE_MAX) return { ok: false, code: "ADDON_NOTE_TOO_LONG" };
  const note = noteRaw || null;

  if (!raw.grant) {
    return {
      ok: true,
      value: { targetUserId, addon: addon as AdminPlanAddon, grant: false, endsAt: null, note },
    };
  }

  const endsOn = String(raw.endsOn ?? "").trim();
  let endsAt: string | null = null;
  if (endsOn) {
    endsAt = warsawEndOfDayToUtcIso(endsOn);
    if (!endsAt) return { ok: false, code: "ADDON_INVALID_DATE" };
    if (Date.parse(endsAt) <= nowMs) return { ok: false, code: "ADDON_ENDS_IN_PAST" };
  }
  return {
    ok: true,
    value: { targetUserId, addon: addon as AdminPlanAddon, grant: true, endsAt, note },
  };
}

/** Raw DB row → status for one user (only the open, non-revoked grant matters). */
export type AdminAddonStatus = {
  active: boolean;
  /** Set only when the grant has not started yet (admin grants start now, so rare). */
  startsAt: string | null;
  endsAt: string | null;
  note: string | null;
};

export function addonStatusFromRow(
  row: { starts_at?: string | null; ends_at?: string | null; revoked_at?: string | null; note?: string | null } | null,
  nowMs: number = Date.now(),
): AdminAddonStatus | null {
  if (!row || row.revoked_at) return null;
  const startsMs = row.starts_at ? Date.parse(row.starts_at) : Number.NEGATIVE_INFINITY;
  const endsMs = row.ends_at ? Date.parse(row.ends_at) : Number.POSITIVE_INFINITY;
  return {
    active: startsMs <= nowMs && endsMs > nowMs,
    startsAt: startsMs > nowMs ? (row.starts_at ?? null) : null,
    endsAt: row.ends_at ?? null,
    note: row.note ?? null,
  };
}

/** What the admin needs to know about the add-on for this plan. */
export type AdminAddonPlanFit = "included" | "applies" | "no_effect";

export function addonPlanFit(tier: PremiumTier): AdminAddonPlanFit {
  if (tier === "GOLD") return "included";
  if (tier === "SILVER") return "applies";
  return "no_effect";
}
