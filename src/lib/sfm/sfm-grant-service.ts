/**
 * SFM Stage B1 — version grant claim (daily Europe/Warsaw).
 * Paid slots / checkout out of scope (Stage E / OD-04).
 */

import "server-only";

import { isSfmVersionsV1Enabled } from "@/config/audio-render";
import type { AuthContext } from "@/lib/auth/types";
import { AuthError } from "@/lib/auth/session";
import { resolveProductEntitlementForAuthContext } from "@/lib/audio/load-premium-entitlement";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  mapSfmRpcErrorMessage,
  SfmDomainError,
} from "@/lib/sfm/sfm-domain";
import {
  resolveSfmQualityEntitlement,
} from "@/lib/sfm/sfm-quality-entitlement";
import {
  sfmDailyFirstDownloadLimit,
  sfmGrantedQualitiesSnapshot,
  type SfmQuality,
} from "@/lib/sfm/sfm-plan-matrix";

export type SfmVersionGrantRecord = {
  grantId: string;
  userId: string;
  versionId: string;
  source: "DAILY" | "PAID_SLOT";
  grantedAt: string;
  grantedQualities: SfmQuality[];
  dayBucket: string;
  reused: boolean;
};

function assertSfmVersionsEnabled(): void {
  if (!isSfmVersionsV1Enabled()) {
    throw new SfmDomainError(
      "Studio Final Mix versions are not enabled (SFM_VERSIONS_V1=OFF).",
      "DISABLED",
    );
  }
}

function throwMappedRpcError(error: { message: string }): never {
  const code = mapSfmRpcErrorMessage(error.message);
  if (code === "NOT_OWNER" || code === "FORBIDDEN") {
    throw new AuthError("FORBIDDEN", "Brak dostępu do tej wersji.");
  }
  if (code === "NOT_FOUND") {
    throw new AuthError("NOT_FOUND", "Wersja nie została znaleziona.");
  }
  throw new SfmDomainError(error.message, code);
}

function mapGrantRow(row: Record<string, unknown>): SfmVersionGrantRecord {
  const qualities = (row.granted_qualities as string[] | null) ?? [];
  return {
    grantId: String(row.grant_id ?? row.id),
    userId: String(row.user_id),
    versionId: String(row.version_id),
    source: row.source as "DAILY" | "PAID_SLOT",
    grantedAt: String(row.granted_at),
    grantedQualities: qualities as SfmQuality[],
    dayBucket: String(row.day_bucket),
    reused: Boolean(row.reused),
  };
}

/**
 * Atomically claim (or reuse) a version grant for the authenticated owner.
 * Plan + daily limit + granted_qualities snapshot are server-derived — never from client body.
 */
export async function claimSfmVersionGrantFor(
  context: AuthContext,
  input: {
    versionId: string;
    /** Rejected if present — plan/quality/user must not come from client. */
    clientBody?: Record<string, unknown>;
  },
): Promise<SfmVersionGrantRecord> {
  assertSfmVersionsEnabled();

  if (typeof input.versionId !== "string" || input.versionId.length < 8) {
    throw new SfmDomainError("Invalid versionId.", "INVALID");
  }

  if (input.clientBody) {
    const forbidden = [
      "premiumTier",
      "premium_tier",
      "userId",
      "user_id",
      "grantedQualities",
      "granted_qualities",
      "dailyLimit",
      "day_bucket",
      "dayBucket",
      "quality",
    ];
    for (const key of forbidden) {
      if (Object.prototype.hasOwnProperty.call(input.clientBody, key)) {
        throw new SfmDomainError(
          `Client must not supply ${key} for SFM grant claim.`,
          "FORBIDDEN",
        );
      }
    }
  }

  const product = await resolveProductEntitlementForAuthContext(context);
  const tier = product.premiumTier;

  const claimGate = resolveSfmQualityEntitlement({
    premiumTier: tier,
    quality: "MP3_128",
    versionGrant: null,
    accessMode: "CLAIM_GRANT",
  });
  if (!claimGate.allow) {
    throw new SfmDomainError(
      "SFM plan does not allow version grants.",
      claimGate.denyCode === "FREE_NO_DOWNLOAD"
        ? "FREE_NO_DOWNLOAD"
        : "LIMIT_EXCEEDED",
    );
  }

  const dailyLimit = sfmDailyFirstDownloadLimit(tier);
  const grantedQualities = sfmGrantedQualitiesSnapshot(tier);

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("sfm_claim_version_grant", {
    p_version_id: input.versionId,
    p_user_id: context.userId,
    p_daily_limit: dailyLimit,
    p_granted_qualities: grantedQualities,
  });

  if (error) throwMappedRpcError(error);

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") {
    throw new SfmDomainError("Grant claim RPC returned no row.", "CONFLICT");
  }

  return mapGrantRow(row as Record<string, unknown>);
}
