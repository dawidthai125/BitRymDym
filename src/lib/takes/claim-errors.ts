import { AuthError } from "@/lib/auth/session";

/**
 * P2 structured take claim / replace codes (server SSOT).
 * Mapped from claim/finalize RPC exception messages.
 */
export const TAKE_CLAIM_CODES = [
  "REPLACE_REQUIRED",
  "REPLACE_INVALID",
  "REPLACE_OWNERSHIP_DENIED",
  "REPLACE_NOT_READY",
  "REPLACE_EXPIRED",
  "REPLACE_CONFLICT",
  "REPLACE_IDEMPOTENCY_REPLAY",
  "SESSION_DAY_CAP",
  "CONCURRENT_SESSION",
  // P3 anonymous → account claim
  "CLAIM_OK",
  "CLAIM_NO_ELIGIBLE",
  "CLAIM_CAP_REACHED",
  "CLAIM_CONFLICT",
  "CLAIM_STORAGE_FAILED",
  "CLAIM_IDEMPOTENT_REPLAY",
  "CLAIM_INVALID",
] as const;

export type TakeClaimCode = (typeof TAKE_CLAIM_CODES)[number];

export type ReplaceableTakeSummary = {
  id: string;
  beatId: string;
  beatTitle: string | null;
  durationSeconds: number | null;
  createdAt: string;
  expiresAt: string;
};

export class TakeClaimError extends AuthError {
  readonly claimCode: TakeClaimCode;
  readonly replaceableTakes?: ReplaceableTakeSummary[];

  constructor(
    claimCode: TakeClaimCode,
    message: string,
    opts?: { replaceableTakes?: ReplaceableTakeSummary[] },
  ) {
    super(
      claimCode === "REPLACE_CONFLICT" ||
        claimCode === "CONCURRENT_SESSION" ||
        claimCode === "REPLACE_IDEMPOTENCY_REPLAY" ||
        claimCode === "CLAIM_CONFLICT" ||
        claimCode === "CLAIM_IDEMPOTENT_REPLAY"
        ? "CONFLICT"
        : "FORBIDDEN",
      message,
    );
    this.name = "TakeClaimError";
    this.claimCode = claimCode;
    this.replaceableTakes = opts?.replaceableTakes;
  }
}

export function parseTakeClaimCodeFromRpc(message: string): TakeClaimCode | null {
  const upper = message.toUpperCase();
  // Legacy RPC alias → structured P2 code.
  if (upper.includes("ACTIVE_READY_CAP")) return "REPLACE_REQUIRED";
  for (const code of TAKE_CLAIM_CODES) {
    if (upper.includes(code)) return code;
  }
  return null;
}

export function messageForTakeClaimCode(code: TakeClaimCode): string {
  switch (code) {
    case "REPLACE_REQUIRED":
      return "REPLACE_REQUIRED: Active READY take limit reached — choose a sample to replace.";
    case "REPLACE_INVALID":
      return "REPLACE_INVALID: Replacement take is not eligible.";
    case "REPLACE_OWNERSHIP_DENIED":
      return "REPLACE_OWNERSHIP_DENIED: Replacement take is not owned by this actor.";
    case "REPLACE_NOT_READY":
      return "REPLACE_NOT_READY: Replacement take is not READY.";
    case "REPLACE_EXPIRED":
      return "REPLACE_EXPIRED: Replacement take has expired.";
    case "REPLACE_CONFLICT":
      return "REPLACE_CONFLICT: Replacement target is already reserved or changed.";
    case "REPLACE_IDEMPOTENCY_REPLAY":
      return "REPLACE_IDEMPOTENCY_REPLAY: Replacement finalize already completed.";
    case "SESSION_DAY_CAP":
      return "SESSION_DAY_CAP: Daily recording session limit reached for your sample policy.";
    case "CONCURRENT_SESSION":
      return "CONCURRENT_SESSION: Another recording session is already in progress.";
    case "CLAIM_OK":
      return "CLAIM_OK: Anonymous take claimed to account.";
    case "CLAIM_NO_ELIGIBLE":
      return "CLAIM_NO_ELIGIBLE: No eligible anonymous READY take to claim.";
    case "CLAIM_CAP_REACHED":
      return "CLAIM_CAP_REACHED: Active READY take limit reached — free a slot, then retry.";
    case "CLAIM_CONFLICT":
      return "CLAIM_CONFLICT: Anonymous take changed during claim.";
    case "CLAIM_STORAGE_FAILED":
      return "CLAIM_STORAGE_FAILED: Could not copy take audio to account path.";
    case "CLAIM_IDEMPOTENT_REPLAY":
      return "CLAIM_IDEMPOTENT_REPLAY: Anonymous take already claimed to this account.";
    case "CLAIM_INVALID":
      return "CLAIM_INVALID: Claim request failed validation.";
    default:
      return `${code}: Take claim denied.`;
  }
}

export function mapClaimRpcMessageToError(
  message: string,
  opts?: { replaceableTakes?: ReplaceableTakeSummary[] },
): never {
  const code = parseTakeClaimCodeFromRpc(message);
  if (code) {
    throw new TakeClaimError(code, messageForTakeClaimCode(code), {
      replaceableTakes:
        code === "REPLACE_REQUIRED" ? opts?.replaceableTakes : undefined,
    });
  }
  throw new Error(message);
}
