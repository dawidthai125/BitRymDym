/**
 * W2 Admin users — payload validation + Warsaw expiry (pure).
 */

import { SYSTEM_ROLES, type SystemRole } from "@/types/domain";
import { PREMIUM_TIERS, type PremiumTier } from "@/types/premium";

import type { AdminUsersMutationCode } from "@/lib/admin/users-mutate-errors";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export type AdminUsersMutationInput = {
  targetUserId: string;
  role: SystemRole;
  premiumTier: PremiumTier;
  expiresOn: string | null;
};

export type ParsedAdminUsersMutation = {
  targetUserId: string;
  role: SystemRole;
  setPremium: true;
  premiumTier: PremiumTier;
  expiresAt: string | null;
};

function isSystemRole(value: string): value is SystemRole {
  return (SYSTEM_ROLES as readonly string[]).includes(value);
}

function isPremiumTierValue(value: string): value is PremiumTier {
  return (PREMIUM_TIERS as readonly string[]).includes(value);
}

function formatWarsawStamp(date: Date): {
  ymd: string;
  hour: number;
  minute: number;
  second: number;
} {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const pick = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "00";
  return {
    ymd: `${pick("year")}-${pick("month")}-${pick("day")}`,
    hour: Number(pick("hour")),
    minute: Number(pick("minute")),
    second: Number(pick("second")),
  };
}

/**
 * End of calendar day in Europe/Warsaw → UTC ISO.
 */
export function warsawEndOfDayToUtcIso(ymd: string): string | null {
  const match = YMD_RE.exec(ymd);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const utcGuess = Date.UTC(year, month - 1, day, 21, 59, 59, 0);
  for (const offsetHours of [0, 1, 2, 3]) {
    const candidate = new Date(utcGuess + offsetHours * 3600 * 1000);
    const local = formatWarsawStamp(candidate);
    if (
      local.ymd === ymd &&
      local.hour === 23 &&
      local.minute === 59 &&
      local.second === 59
    ) {
      return candidate.toISOString();
    }
  }
  return null;
}

export function parseAdminUsersMutationInput(
  raw: {
    targetUserId?: unknown;
    role?: unknown;
    premiumTier?: unknown;
    expiresOn?: unknown;
  },
  nowMs: number = Date.now(),
):
  | { ok: true; value: ParsedAdminUsersMutation }
  | { ok: false; code: AdminUsersMutationCode } {
  const targetUserId = String(raw.targetUserId ?? "").trim();
  if (!UUID_RE.test(targetUserId)) {
    return { ok: false, code: "TARGET_NOT_FOUND" };
  }

  const roleRaw = String(raw.role ?? "").trim();
  if (!isSystemRole(roleRaw)) {
    return { ok: false, code: "INVALID_ROLE" };
  }

  const tierRaw = String(raw.premiumTier ?? "").trim();
  if (!isPremiumTierValue(tierRaw)) {
    return { ok: false, code: "INVALID_PREMIUM_TIER" };
  }

  const expiresRaw = String(raw.expiresOn ?? "").trim();
  if (tierRaw === "FREE") {
    if (expiresRaw) return { ok: false, code: "INVALID_EXPIRATION" };
    return {
      ok: true,
      value: {
        targetUserId,
        role: roleRaw,
        setPremium: true,
        premiumTier: "FREE",
        expiresAt: null,
      },
    };
  }

  if (!expiresRaw) {
    return {
      ok: true,
      value: {
        targetUserId,
        role: roleRaw,
        setPremium: true,
        premiumTier: tierRaw,
        expiresAt: null,
      },
    };
  }

  const iso = warsawEndOfDayToUtcIso(expiresRaw);
  if (!iso) return { ok: false, code: "INVALID_EXPIRATION" };
  const expiresMs = Date.parse(iso);
  if (!Number.isFinite(expiresMs) || expiresMs <= nowMs) {
    return { ok: false, code: "INVALID_EXPIRATION" };
  }

  return {
    ok: true,
    value: {
      targetUserId,
      role: roleRaw,
      setPremium: true,
      premiumTier: tierRaw,
      expiresAt: iso,
    },
  };
}

export function selfDemotionDecision(params: {
  actorId: string;
  targetId: string;
  nextRole: SystemRole;
}): "PASS" | "NO_OP" | "SELF_DEMOTION_FORBIDDEN" {
  if (params.actorId !== params.targetId) return "PASS";
  if (params.nextRole === "ADMIN") return "NO_OP";
  return "SELF_DEMOTION_FORBIDDEN";
}

export function isHighRiskRoleChange(
  currentRole: SystemRole,
  nextRole: SystemRole,
): boolean {
  if (currentRole === nextRole) return false;
  return (
    currentRole === "ADMIN" ||
    currentRole === "MODERATOR" ||
    nextRole === "ADMIN" ||
    nextRole === "MODERATOR"
  );
}

export type LastAdminGuardInput = {
  adminIds: readonly string[];
  targetId: string;
  currentRole: SystemRole;
  nextRole: SystemRole;
};

export function lastAdminDemotionDecision(
  input: LastAdminGuardInput,
): "PASS" | "LAST_ADMIN_PROTECTED" | "NO_OP" {
  if (input.currentRole !== "ADMIN" || input.nextRole === "ADMIN") {
    return input.currentRole === input.nextRole ? "NO_OP" : "PASS";
  }
  const unique = [...new Set(input.adminIds)];
  if (unique.length <= 1 && unique[0] === input.targetId) {
    return "LAST_ADMIN_PROTECTED";
  }
  return "PASS";
}

/**
 * Advisory-lock serialization: first revoke sees 2 admins, second sees 1.
 */
export function serializedLastAdminRevokes(adminIds: readonly string[]): {
  first: ReturnType<typeof lastAdminDemotionDecision>;
  second: ReturnType<typeof lastAdminDemotionDecision>;
} {
  if (adminIds.length !== 2) {
    throw new Error("serializedLastAdminRevokes expects two ADMIN ids");
  }
  const [a, b] = adminIds;
  const first = lastAdminDemotionDecision({
    adminIds,
    targetId: a,
    currentRole: "ADMIN",
    nextRole: "USER",
  });
  const remaining = first === "PASS" ? [b] : [...adminIds];
  const second = lastAdminDemotionDecision({
    adminIds: remaining,
    targetId: b,
    currentRole: "ADMIN",
    nextRole: "USER",
  });
  return { first, second };
}
