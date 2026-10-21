/**
 * PREMIUM-02 — Server unlock service (RPC premium_unlock_work).
 * Requires local migration applied. Client never supplies credits/tier.
 */

import "server-only";

import {
  retentionDaysForTier,
  unlockCreditsForTier,
} from "@/config/premium-export-policy";
import { resolveProductEntitlementForAuthContext } from "@/lib/audio/load-premium-entitlement";
import { AuthError, requireUser } from "@/lib/auth/session";
import type { AuthContext } from "@/lib/auth/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type PremiumUnlockResult = {
  unlockId: string;
  workId: string;
  reused: boolean;
  retentionExpiresAt: string;
  creditsRemaining: number | null;
};

export class PremiumUnlockError extends Error {
  readonly code:
    | "WORK_NOT_FOUND"
    | "NOT_OWNER"
    | "EXPIRED_OR_NOT_READY"
    | "KEY_REUSE"
    | "NO_CREDITS"
    | "ALREADY_UNLOCKED"
    | "INVALID"
    | "UNAVAILABLE";
  constructor(message: string, code: PremiumUnlockError["code"]) {
    super(message);
    this.name = "PremiumUnlockError";
    this.code = code;
  }
}

function mapDenied(reason: string | null | undefined): PremiumUnlockError {
  switch (reason) {
    case "WORK_NOT_FOUND":
      return new PremiumUnlockError("Utwór nie istnieje.", "WORK_NOT_FOUND");
    case "NOT_OWNER":
      return new PremiumUnlockError("Brak dostępu do utworu.", "NOT_OWNER");
    case "EXPIRED_OR_NOT_READY":
      return new PremiumUnlockError(
        "Utwór wygasł lub nie jest gotowy.",
        "EXPIRED_OR_NOT_READY",
      );
    case "KEY_REUSE":
      return new PremiumUnlockError(
        "Klucz idempotencji użyty dla innego utworu.",
        "KEY_REUSE",
      );
    case "NO_CREDITS":
      return new PremiumUnlockError("Brak kredytów odblokowania.", "NO_CREDITS");
    case "ALREADY_UNLOCKED":
      return new PremiumUnlockError(
        "Utwór był już odblokowany.",
        "ALREADY_UNLOCKED",
      );
    default:
      return new PremiumUnlockError("Odblokowanie niedostępne.", "INVALID");
  }
}

/**
 * Atomically unlock a WORK_READY premium_works row.
 * activatedAt: premium_entitlements created_at / purchase time when available.
 */
export async function unlockPremiumWorkFor(
  context: AuthContext,
  input: {
    workId: string;
    idempotencyKey: unknown;
    activatedAtIso?: string | null;
  },
): Promise<PremiumUnlockResult> {
  if (typeof input.workId !== "string" || input.workId.length < 8) {
    throw new PremiumUnlockError("Nieprawidłowy workId.", "INVALID");
  }
  if (
    typeof input.idempotencyKey !== "string" ||
    !input.idempotencyKey.trim()
  ) {
    throw new PremiumUnlockError("Wymagany idempotencyKey.", "INVALID");
  }

  const product = await resolveProductEntitlementForAuthContext(context);
  const granted = unlockCreditsForTier(product.premiumTier);
  const retentionDays = retentionDaysForTier(product.premiumTier);
  const admin = createSupabaseAdminClient();

  let activatedAt = input.activatedAtIso ?? null;
  if (!activatedAt) {
    const { data: entRow } = await admin
      .from("premium_entitlements")
      .select("created_at")
      .eq("user_id", context.userId)
      .eq("active", true)
      .maybeSingle();
    activatedAt =
      (entRow?.created_at as string | undefined) ?? new Date().toISOString();
  }

  const { data, error } = await admin.rpc("premium_unlock_work", {
    p_user_id: context.userId,
    p_work_id: input.workId,
    p_idempotency_key: input.idempotencyKey.trim(),
    p_granted: granted,
    p_activated_at: activatedAt,
    p_now: new Date().toISOString(),
    p_retention_days: retentionDays,
  });

  if (error) {
    if (/premium_unlock_work|does not exist|schema cache/i.test(error.message)) {
      throw new PremiumUnlockError(
        "Moduł odblokowań nie jest jeszcze dostępny w bazie lokalnej.",
        "UNAVAILABLE",
      );
    }
    throw new Error(error.message);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new PremiumUnlockError("Pusta odpowiedź unlock.", "INVALID");
  }
  if (row.denied_reason) {
    throw mapDenied(String(row.denied_reason));
  }
  if (!row.unlock_id || !row.retention_expires_at) {
    throw new PremiumUnlockError("Niepełna odpowiedź unlock.", "INVALID");
  }

  return {
    unlockId: String(row.unlock_id),
    workId: String(row.work_id),
    reused: Boolean(row.reused),
    retentionExpiresAt: String(row.retention_expires_at),
    creditsRemaining:
      row.credits_remaining == null ? null : Number(row.credits_remaining),
  };
}

export async function unlockPremiumWork(input: {
  workId: string;
  idempotencyKey: unknown;
}): Promise<PremiumUnlockResult> {
  const context = await requireUser();
  return unlockPremiumWorkFor(context, input);
}

export async function markPremiumWorkReadyFor(
  context: AuthContext,
  input: {
    domain: "TAKE" | "STUDIO_PROJECT";
    domainRef: string;
  },
): Promise<{
  workId: string;
  status: string;
  workReadyAt: string | null;
  retentionExpiresAt: string | null;
  created: boolean;
}> {
  const product = await resolveProductEntitlementForAuthContext(context);
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("premium_mark_work_ready", {
    p_user_id: context.userId,
    p_domain: input.domain,
    p_domain_ref: input.domainRef,
    p_now: new Date().toISOString(),
    p_retention_days: retentionDaysForTier(product.premiumTier),
  });
  if (error) {
    if (/premium_mark_work_ready|does not exist|schema cache/i.test(error.message)) {
      throw new PremiumUnlockError(
        "Moduł retencji nie jest jeszcze dostępny w bazie lokalnej.",
        "UNAVAILABLE",
      );
    }
    throw new Error(error.message);
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.work_id) {
    throw new AuthError("NOT_FOUND", "Nie udało się oznaczyć utworu.");
  }
  return {
    workId: String(row.work_id),
    status: String(row.status),
    workReadyAt: row.work_ready_at ? String(row.work_ready_at) : null,
    retentionExpiresAt: row.retention_expires_at
      ? String(row.retention_expires_at)
      : null,
    created: Boolean(row.created),
  };
}
