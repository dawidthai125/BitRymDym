import { createHash } from "node:crypto";

import type { BeatStatus } from "@/types/domain";

/**
 * Rights policy for community and platform beats.
 * SHA-256 and an attestation are signals, not a legal verdict.
 * Persistence of the block registry and attestation requires a migration.
 * Until that migration, callers must not treat a missing row as clearance.
 */
export const DIRECT_SQL_PUBLISH_ENFORCEMENT = "trigger_enforced" as const;

export const BLOCKED_HASH_RACE_BARRIER = "checksum_row_lock" as const;

export const USER_RIGHTS_STATEMENT_VERSION = "proposal-2026-10-19";
export const PLATFORM_LICENSE_VERSION = "platform-license-2026-10-19";
export const PLATFORM_LICENSE_SCOPE = "catalog_publication";

/** Proposal only. Not shown in the product until the owner approves the wording. */
export const PROPOSED_RIGHTS_STATEMENT = {
  version: "proposal-2026-10-19",
  legalStatus: "pending_owner_approval" as const,
  text:
    "Oświadczam, że mam prawa do tego nagrania i do sampli w nim użytych albo mam zgodę uprawnionych. Rozumiem, że to oświadczenie nie zastępuje weryfikacji i że BitRymDym może wstrzymać publikację.",
};

export type RightsCheckResult =
  | { kind: "no_signal" }
  | { kind: "blocked_hash"; sourceDecisionId: string }
  | { kind: "similar_signal" }
  | { kind: "error" }
  | { kind: "timeout" }
  | { kind: "uninterpretable" }
  | { kind: "not_run" };

export type RightsAttestation = {
  beatId: string;
  checksumSha256: string;
  statementVersion: string;
  acceptedAt: string;
};

export type BlockedHashRecord = {
  id: string;
  checksumSha256: string;
  eventKind: "block" | "lift";
  eventSeq: number;
  reason: string;
  createdAt: string;
  actorId: string;
};

export type RegistryActor = "USER" | "MODERATOR" | "ADMIN" | "anon";

export type PlatformLicenseRecord = {
  beatId: string;
  checksumSha256: string;
  statementVersion: string;
  verifierId: string;
  verifiedAt: string;
  scope: string;
  validUntil: string | null;
  revoked: boolean;
  reference?: string | null;
};

const SHA256_HEX = /^[0-9a-f]{64}$/;

export function checksumSha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function isSha256Hex(value: string): boolean {
  return SHA256_HEX.test(value);
}

/** A rights check never authorizes automatic publication. */
export function rightsCheckAllowsAutomaticPublish(
  result: RightsCheckResult,
): false {
  switch (result.kind) {
    case "no_signal":
    case "blocked_hash":
    case "similar_signal":
    case "error":
    case "timeout":
    case "uninterpretable":
    case "not_run":
      return false;
    default: {
      const _exhaustive: never = result;
      return _exhaustive;
    }
  }
}

/**
 * no_signal may continue into the existing moderation queue.
 * Every failure, missing run, similarity hit or blocked hash stays a hold.
 * no_signal is not proof of rights.
 */
export function classifyRightsCheck(
  result: RightsCheckResult,
): "continue_to_moderation" | "hold_for_review" {
  if (result.kind === "no_signal") return "continue_to_moderation";
  return "hold_for_review";
}

export function attestationMatchesMaterial(params: {
  attestation: RightsAttestation | null;
  beatId: string;
  checksumSha256: string;
  statementVersion: string;
}): boolean {
  const attestation = params.attestation;
  if (!attestation) return false;
  if (!attestation.acceptedAt) return false;
  if (!isSha256Hex(attestation.checksumSha256)) return false;
  return (
    attestation.beatId === params.beatId &&
    attestation.checksumSha256 === params.checksumSha256 &&
    attestation.statementVersion === params.statementVersion
  );
}

export function staffMayModerateBeat(
  actorId: string,
  ownerId: string,
): boolean {
  return actorId !== ownerId;
}

export function canMutateBlockedHashRegistry(actor: RegistryActor): boolean {
  return actor === "ADMIN" || actor === "MODERATOR";
}

/** Block entries are append-only. Nobody deletes a match by editing metadata. */
export function canDeleteBlockedHash(): false {
  return false;
}

export function latestHashEvent(
  records: readonly BlockedHashRecord[],
  checksumSha256: string,
): BlockedHashRecord | null {
  const matches = records
    .filter((row) => row.checksumSha256 === checksumSha256)
    .sort((a, b) => b.eventSeq - a.eventSeq);
  return matches[0] ?? null;
}

export function hashIsBlocked(
  records: readonly BlockedHashRecord[],
  checksumSha256: string,
): boolean {
  return latestHashEvent(records, checksumSha256)?.eventKind === "block";
}

export function appendHashEvent(
  existing: readonly BlockedHashRecord[],
  incoming: BlockedHashRecord,
): BlockedHashRecord[] {
  return [...existing, incoming];
}

export function applyBlockedHashCommand(params: {
  records: readonly BlockedHashRecord[];
  actor: RegistryActor;
  command:
    | { type: "admit"; record: BlockedHashRecord }
    | { type: "delete"; checksumSha256: string };
}): { ok: true; records: BlockedHashRecord[] } | { ok: false; reason: string } {
  if (params.command.type === "delete" || canDeleteBlockedHash()) {
    return { ok: false, reason: "blocked hash registry is append-only" };
  }
  if (!canMutateBlockedHashRegistry(params.actor)) {
    return { ok: false, reason: "registry mutation denied" };
  }
  if (params.command.type !== "admit") {
    return { ok: false, reason: "blocked hash registry is append-only" };
  }
  return {
    ok: true,
    records: appendHashEvent(params.records, params.command.record),
  };
}

export function findBlockedHash(
  records: readonly BlockedHashRecord[],
  checksumSha256: string,
): BlockedHashRecord | null {
  const latest = latestHashEvent(records, checksumSha256);
  return latest?.eventKind === "block" ? latest : null;
}

/** A staff role is not a license. */
export function platformRoleIsLicense(): false {
  return false;
}

export function platformLicenseCovers(
  license: PlatformLicenseRecord | null,
  beatId: string,
  checksumSha256: string,
  nowIso: string,
): boolean {
  if (!license || license.revoked) return false;
  if (!license.verifierId || !license.verifiedAt) return false;
  if (license.scope !== PLATFORM_LICENSE_SCOPE) return false;
  if (license.statementVersion !== PLATFORM_LICENSE_VERSION) return false;
  if (!isSha256Hex(license.checksumSha256)) return false;
  if (license.validUntil !== null && license.validUntil <= nowIso) return false;
  return (
    license.beatId === beatId && license.checksumSha256 === checksumSha256
  );
}

const RIGHTS_DATABASE_MESSAGES: Record<string, string> = {
  RIGHTS_ATTESTATION_REQUIRED:
    "Publikacja wymaga oświadczenia dla aktualnego pliku audio.",
  RIGHTS_HASH_BLOCKED:
    "Ten plik jest zablokowany. Publikacja jest wstrzymana do ręcznej weryfikacji.",
  RIGHTS_REVIEW_OPEN:
    "Otwarta sprawa blokuje publikację. Zamknięcie sprawy nie publikuje bitu.",
  RIGHTS_REVIEW_UNRESOLVED:
    "Zamknięta sprawa nadal blokuje ten hash. Potrzebny jest nowy Master albo rozstrzygnięcie bez blokady.",
  RIGHTS_LICENSE_REQUIRED:
    "Publikacja platformy wymaga licencji dla aktualnego Mastera. Sama referencja nie wystarcza.",
  RIGHTS_LICENSE_EXPIRED: "Licencja platformy jest po terminie.",
  RIGHTS_MASTER_NOT_READY: "Publikacja wymaga jednego aktywnego Mastera w stanie gotowym.",
  RIGHTS_MASTER_CHANGED: "Plik Master zmienił się w trakcie publikacji. Spróbuj ponownie.",
  RIGHTS_USER_NOT_APPROVED:
    "Bit użytkownika można opublikować tylko ze statusu zatwierdzonego.",
  RIGHTS_ATTESTATION_OWNER_MISSING:
    "Nie można złożyć oświadczenia ani opublikować bitu bez właściciela.",
  RIGHTS_PUBLISH_INSERT_FORBIDDEN:
    "Nie można utworzyć bitu od razu jako opublikowanego. Najpierw zapisz wersję roboczą.",
  RIGHTS_ACTOR_REQUIRED:
    "Publikację i zatwierdzenie może wykonać tylko zalogowany członek zespołu.",
  RIGHTS_SELF_MODERATION:
    "Nie możesz zatwierdzać ani publikować własnego bitu.",
  RIGHTS_REVIEW_NOT_FOUND: "Nie ma takiej otwartej sprawy.",
};

export function rightsDatabaseMessage(raw: string): string | null {
  for (const [token, message] of Object.entries(RIGHTS_DATABASE_MESSAGES)) {
    if (raw.includes(token)) return message;
  }
  return null;
}

export type ClosedReviewOutcome =
  | "dismissed_no_publish"
  | "still_blocked"
  | "needs_new_master";

/** Closed still_blocked / needs_new_master keep blocking that exact beat+hash. */
export function closedReviewBlocksPublish(
  outcome: ClosedReviewOutcome | null,
): boolean {
  return outcome === "still_blocked" || outcome === "needs_new_master";
}

export function evaluateUserPublishRights(params: {
  beatId: string;
  status: BeatStatus;
  masterReady: boolean;
  attestation: RightsAttestation | null;
  currentChecksum: string;
  statementVersion: string;
  check: RightsCheckResult;
  openManualReview: boolean;
  hashBlocked: boolean;
  ownerId: string | null;
  latestClosedOutcome?: ClosedReviewOutcome | null;
}): { ok: true } | { ok: false; reason: string } {
  if (params.status !== "APPROVED") {
    return { ok: false, reason: "USER publish requires APPROVED" };
  }
  if (!params.ownerId) {
    return { ok: false, reason: "USER publish requires a living owner" };
  }
  if (!params.masterReady) {
    return { ok: false, reason: "USER publish requires READY master" };
  }
  if (params.hashBlocked) {
    return { ok: false, reason: "blocked hash holds publication" };
  }
  if (
    !attestationMatchesMaterial({
      attestation: params.attestation,
      beatId: params.beatId,
      checksumSha256: params.currentChecksum,
      statementVersion: params.statementVersion,
    })
  ) {
    return { ok: false, reason: "rights attestation does not match this master" };
  }
  if (params.openManualReview) {
    return { ok: false, reason: "open manual review blocks publish" };
  }
  if (closedReviewBlocksPublish(params.latestClosedOutcome ?? null)) {
    return {
      ok: false,
      reason: "unresolved closed review still blocks this master hash",
    };
  }
  if (classifyRightsCheck(params.check) !== "continue_to_moderation") {
    return { ok: false, reason: "rights check requires manual review" };
  }
  return { ok: true };
}

export function evaluatePlatformPublishRights(params: {
  beatId: string;
  checksumSha256: string;
  nowIso: string;
  license: PlatformLicenseRecord | null;
  check: RightsCheckResult;
  openManualReview: boolean;
  latestClosedOutcome?: ClosedReviewOutcome | null;
}): { ok: true } | { ok: false; reason: string } {
  if (
    !platformLicenseCovers(
      params.license,
      params.beatId,
      params.checksumSha256,
      params.nowIso,
    )
  ) {
    return { ok: false, reason: "platform publish requires a documented license" };
  }
  if (params.openManualReview) {
    return { ok: false, reason: "open manual review blocks publish" };
  }
  if (closedReviewBlocksPublish(params.latestClosedOutcome ?? null)) {
    return {
      ok: false,
      reason: "unresolved closed review still blocks this master hash",
    };
  }
  if (classifyRightsCheck(params.check) !== "continue_to_moderation") {
    return { ok: false, reason: "rights check requires manual review" };
  }
  return { ok: true };
}
