/**
 * W3 Admin users audit history — presentation (pure).
 */

import { labelAdminAuditAction, labelPremiumTier, labelSystemRole } from "@/lib/ui/labels";

export type AdminAuditEventInput = {
  id: string;
  createdAt: string;
  action: string;
  actorUserId: string | null;
  targetUserId: string | null;
  actorUserNumber: number | null;
  targetUserNumber: number | null;
  oldValue: unknown;
  newValue: unknown;
  targetDisplayName?: string | null;
};

export type AdminAuditRow = {
  id: string;
  createdAt: string;
  action: string;
  actorLabel: string;
  targetLabel: string;
  oldLabel: string;
  newLabel: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function formatAuditDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Warsaw",
  }).format(date);
}

export function formatAdminAuditExpiresAt(iso: string | null | undefined): string {
  if (!iso) return "Bezterminowo";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Bezterminowo";
  return new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "medium",
    timeZone: "Europe/Warsaw",
  }).format(date);
}

function formatRoleValue(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "—";
  return labelSystemRole(value);
}

function formatPremiumTierValue(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "—";
  return labelPremiumTier(value);
}

function formatExpiresValue(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "Bezterminowo";
  }
  if (typeof value !== "string") return "—";
  return formatAdminAuditExpiresAt(value);
}

function mapChangeLabels(
  action: string,
  oldValue: unknown,
  newValue: unknown,
): { oldLabel: string; newLabel: string } {
  const oldRecord = asRecord(oldValue);
  const newRecord = asRecord(newValue);
  if (!oldRecord && !newRecord) {
    return { oldLabel: "—", newLabel: "—" };
  }

  if (
    action === "ROLE_CHANGE" ||
    action === "ADMIN_GRANT" ||
    action === "ADMIN_REVOKE" ||
    action === "MODERATOR_GRANT" ||
    action === "MODERATOR_REVOKE"
  ) {
    return {
      oldLabel: formatRoleValue(oldRecord?.role),
      newLabel: formatRoleValue(newRecord?.role),
    };
  }

  if (action === "PREMIUM_TIER_CHANGE") {
    return {
      oldLabel: formatPremiumTierValue(oldRecord?.premiumTier),
      newLabel: formatPremiumTierValue(newRecord?.premiumTier),
    };
  }

  if (action === "PREMIUM_EXPIRATION_CHANGE") {
    return {
      oldLabel: formatExpiresValue(oldRecord?.expiresAt),
      newLabel: formatExpiresValue(newRecord?.expiresAt),
    };
  }

  return { oldLabel: "—", newLabel: "—" };
}

export function actorAuditLabel(input: {
  actorUserId: string | null;
  actorUserNumber: number | null;
}): string {
  if (input.actorUserId) {
    return input.actorUserNumber != null
      ? `Administrator · #${input.actorUserNumber}`
      : "Administrator";
  }
  if (input.actorUserNumber != null) {
    return `Konto usunięte · #${input.actorUserNumber}`;
  }
  return "Konto usunięte";
}

export function targetAuditLabel(input: {
  targetUserId: string | null;
  targetUserNumber: number | null;
  targetDisplayName?: string | null;
}): string {
  if (input.targetUserId) {
    const ksywka = input.targetDisplayName?.trim();
    if (input.targetUserNumber != null) {
      return `${ksywka || "Użytkownik"} · #${input.targetUserNumber}`;
    }
    return ksywka || "Użytkownik";
  }
  if (input.targetUserNumber != null) {
    return `Użytkownik · #${input.targetUserNumber}`;
  }
  return "Użytkownik usunięty";
}

export function presentAdminAuditEvent(input: AdminAuditEventInput): AdminAuditRow {
  const change = mapChangeLabels(input.action, input.oldValue, input.newValue);
  return {
    id: input.id,
    createdAt: formatAuditDateTime(input.createdAt),
    action: labelAdminAuditAction(input.action),
    actorLabel: actorAuditLabel(input),
    targetLabel: targetAuditLabel(input),
    oldLabel: change.oldLabel,
    newLabel: change.newLabel,
  };
}
