import { describe, expect, it } from "vitest";

import { isAuthorizedUserBeatObjectKeyRepresentation } from "@/lib/beats/audio-validation";
import { assertPublishHardGate } from "@/lib/beats/admin-publish";
import {
  BLOCKED_HASH_RACE_BARRIER,
  DIRECT_SQL_PUBLISH_ENFORCEMENT,
  PLATFORM_LICENSE_SCOPE,
  PLATFORM_LICENSE_VERSION,
  PROPOSED_RIGHTS_STATEMENT,
  appendHashEvent,
  applyBlockedHashCommand,
  attestationMatchesMaterial,
  checksumSha256,
  classifyRightsCheck,
  closedReviewBlocksPublish,
  evaluatePlatformPublishRights,
  evaluateUserPublishRights,
  findBlockedHash,
  hashIsBlocked,
  latestHashEvent,
  platformRoleIsLicense,
  rightsCheckAllowsAutomaticPublish,
  staffMayModerateBeat,
  type BlockedHashRecord,
  type RightsAttestation,
} from "@/lib/beats/rights-policy";
import { localRecognitionResult, mockRecognitionResult } from "@/lib/beats/rights-recognition";
import { canTransitionStatus } from "@/lib/beats/validation";

const BEAT = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const ACTOR = "33333333-3333-4333-8333-333333333333";

function blocked(
  checksum: string,
  createdAt = "2026-10-19T12:00:00.000Z",
  id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  eventSeq = 1,
): BlockedHashRecord {
  return {
    id,
    checksumSha256: checksum,
    eventKind: "block",
    eventSeq,
    reason: "earlier report",
    createdAt,
    actorId: ACTOR,
  };
}

function attestation(checksum: string): RightsAttestation {
  return {
    beatId: BEAT,
    checksumSha256: checksum,
    statementVersion: PROPOSED_RIGHTS_STATEMENT.version,
    acceptedAt: "2026-10-19T12:00:00.000Z",
  };
}

describe("rights publish policy", () => {
  it("denies USER publish without approval, including an ADMIN actor", () => {
    for (const actor of ["USER", "ADMIN", "MODERATOR"] as const) {
      for (const from of ["DRAFT", "PENDING_REVIEW", "REJECTED"] as const) {
        expect(
          canTransitionStatus({
            from,
            to: "PUBLISHED",
            actor,
            ownershipType: "USER",
            isOwner: true,
          }),
        ).toBe(false);
      }
    }
    expect(
      canTransitionStatus({
        from: "APPROVED",
        to: "PUBLISHED",
        actor: "ADMIN",
        ownershipType: "USER",
      }),
    ).toBe(true);
    expect(
      canTransitionStatus({
        from: "DRAFT",
        to: "PUBLISHED",
        actor: "ADMIN",
        ownershipType: "PLATFORM",
      }),
    ).toBe(true);
  });

  it("denies publish without a READY master", () => {
    const gate = assertPublishHardGate({
      beatId: BEAT,
      ownershipType: "USER",
      status: "APPROVED",
      assetsForBeat: [],
    });
    expect(gate.ok).toBe(false);
  });

  it("does not claim the application gate closes a direct SQL write", () => {
    expect(DIRECT_SQL_PUBLISH_ENFORCEMENT).toBe("trigger_enforced");
  });

  it("rejects a missing attestation and an attestation for an older master", () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const checksum = checksumSha256(bytes);
    const replaced = checksumSha256(new Uint8Array([1, 2, 3, 5]));
    expect(
      evaluateUserPublishRights({
        beatId: BEAT,
        status: "APPROVED",
        masterReady: true,
        attestation: null,
        currentChecksum: checksum,
        statementVersion: PROPOSED_RIGHTS_STATEMENT.version,
        check: { kind: "no_signal" },
        openManualReview: false,
        hashBlocked: false,
        ownerId: OTHER,
      }).ok,
    ).toBe(false);
    expect(
      attestationMatchesMaterial({
        attestation: attestation(checksum),
        beatId: BEAT,
        checksumSha256: replaced,
        statementVersion: PROPOSED_RIGHTS_STATEMENT.version,
      }),
    ).toBe(false);
  });

  it("hashes bytes, not the filename", () => {
    const bytes = new Uint8Array([9, 8, 7]);
    expect(checksumSha256(bytes)).toBe(checksumSha256(bytes));
    expect(checksumSha256(bytes)).not.toBe(checksumSha256(new Uint8Array([9, 8, 6])));
  });

  it("holds a blocked hash for review and does not treat the match as a legal verdict", () => {
    const checksum = checksumSha256(new Uint8Array([4, 4, 4]));
    const registry = [blocked(checksum)];
    const match = findBlockedHash(registry, checksum);
    expect(match?.id).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    const decision = evaluateUserPublishRights({
      beatId: BEAT,
      status: "APPROVED",
      masterReady: true,
      attestation: attestation(checksum),
      currentChecksum: checksum,
      statementVersion: PROPOSED_RIGHTS_STATEMENT.version,
      check: { kind: "blocked_hash", sourceDecisionId: match!.id },
      openManualReview: true,
      hashBlocked: false,
      ownerId: OTHER,
    });
    expect(decision.ok).toBe(false);
    expect(rightsCheckAllowsAutomaticPublish({ kind: "blocked_hash", sourceDecisionId: "decision-1" })).toBe(false);
  });

  it("collapses concurrent admits of the same hash into one registry row", () => {
    const checksum = checksumSha256(new Uint8Array([5]));
    const first = blocked(checksum, "2026-10-19T12:00:00.000Z");
    const second = blocked(
      checksum,
      "2026-10-19T12:00:01.000Z",
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      2,
    );
    expect(BLOCKED_HASH_RACE_BARRIER).toBe("checksum_row_lock");
    const merged = appendHashEvent([first], second);
    expect(merged).toHaveLength(2);
    expect(latestHashEvent(merged, checksum)?.id).toBe(second.id);
    expect(hashIsBlocked(merged, checksum)).toBe(true);
    const liftFirstByClock = {
      ...blocked(checksum, "2026-10-19T13:00:00.000Z", "cccccccc-cccc-4ccc-8ccc-cccccccccccc", 1),
      eventKind: "lift" as const,
    };
    const blockLaterByLock = blocked(
      checksum,
      "2026-10-19T11:00:00.000Z",
      "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      2,
    );
    expect(hashIsBlocked([liftFirstByClock, blockLaterByLock], checksum)).toBe(true);
    expect(hashIsBlocked([blockLaterByLock, { ...liftFirstByClock, eventSeq: 3 }], checksum)).toBe(false);
  });

  it("refuses user edits and deletes of the blocked-hash registry", () => {
    const checksum = checksumSha256(new Uint8Array([6]));
    const records = [blocked(checksum)];
    expect(
      applyBlockedHashCommand({
        records,
        actor: "USER",
        command: { type: "delete", checksumSha256: checksum },
      }).ok,
    ).toBe(false);
    expect(
      applyBlockedHashCommand({
        records,
        actor: "USER",
        command: { type: "admit", record: blocked(checksumSha256(new Uint8Array([7]))) },
      }).ok,
    ).toBe(false);
    expect(
      applyBlockedHashCommand({
        records,
        actor: "ADMIN",
        command: { type: "delete", checksumSha256: checksum },
      }).ok,
    ).toBe(false);
  });

  it("does not authorize another owner's object key", () => {
    expect(
      isAuthorizedUserBeatObjectKeyRepresentation({
        objectKey: `user/${OTHER}/${BEAT}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/master.bin`,
        ownerId: ACTOR,
        beatId: BEAT,
        assetId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      }),
    ).toBe(false);
  });

  it("does not treat an admin role as a platform license", () => {
    expect(platformRoleIsLicense()).toBe(false);
    const decision = evaluatePlatformPublishRights({
      beatId: BEAT,
      checksumSha256: checksumSha256(new Uint8Array([1])),
      nowIso: "2026-10-19T12:00:00.000Z",
      license: {
        beatId: BEAT,
        checksumSha256: checksumSha256(new Uint8Array([1])),
        statementVersion: PLATFORM_LICENSE_VERSION,
        verifierId: "",
        verifiedAt: "",
        scope: PLATFORM_LICENSE_SCOPE,
        validUntil: null,
        revoked: false,
        reference: "only-a-locator",
      },
      check: { kind: "no_signal" },
      openManualReview: false,
    });
    expect(decision.ok).toBe(false);
  });

  it("does not treat an error, timeout or missing check as clearance", () => {
    const checksum = checksumSha256(new Uint8Array([8]));
    for (const check of [
      { kind: "error" },
      { kind: "timeout" },
      { kind: "uninterpretable" },
      { kind: "not_run" },
    ] as const) {
      expect(classifyRightsCheck(check)).toBe("hold_for_review");
      expect(rightsCheckAllowsAutomaticPublish(check)).toBe(false);
      expect(
        evaluateUserPublishRights({
          beatId: BEAT,
          status: "APPROVED",
          masterReady: true,
          attestation: attestation(checksum),
          currentChecksum: checksum,
          statementVersion: PROPOSED_RIGHTS_STATEMENT.version,
          check,
          openManualReview: false,
          hashBlocked: false,
          ownerId: OTHER,
        }).ok,
      ).toBe(false);
    }
  });

  it("keeps a cleared community publish on the existing moderation path", () => {
    const checksum = checksumSha256(new Uint8Array([9]));
    const decision = evaluateUserPublishRights({
      beatId: BEAT,
      status: "APPROVED",
      masterReady: true,
      attestation: attestation(checksum),
      currentChecksum: checksum,
      statementVersion: PROPOSED_RIGHTS_STATEMENT.version,
      check: { kind: "no_signal" },
      openManualReview: false,
      hashBlocked: false,
      ownerId: OTHER,
    });
    expect(decision.ok).toBe(true);
    expect(rightsCheckAllowsAutomaticPublish({ kind: "no_signal" })).toBe(false);
    expect(staffMayModerateBeat(ACTOR, ACTOR)).toBe(false);
    expect(rightsCheckAllowsAutomaticPublish(mockRecognitionResult({ mode: "timeout" }))).toBe(false);
    expect(rightsCheckAllowsAutomaticPublish(mockRecognitionResult({ mode: "no_signal" }))).toBe(false);
    expect(classifyRightsCheck(mockRecognitionResult({ mode: "timeout" }))).toBe("hold_for_review");
    expect(classifyRightsCheck(mockRecognitionResult({ mode: "no_signal" }))).toBe("continue_to_moderation");
    expect(staffMayModerateBeat(ACTOR, OTHER)).toBe(true);
    expect(localRecognitionResult().kind).toBe("not_run");
    expect(
      evaluateUserPublishRights({
        beatId: BEAT,
        status: "APPROVED",
        masterReady: true,
        attestation: attestation(checksum),
        currentChecksum: checksum,
        statementVersion: PROPOSED_RIGHTS_STATEMENT.version,
        check: { kind: "no_signal" },
        openManualReview: false,
        hashBlocked: false,
        ownerId: null,
      }).ok,
    ).toBe(false);
  });

  it("keeps still_blocked and needs_new_master closed outcomes as a publish hold for that hash", () => {
    const checksum = checksumSha256(new Uint8Array([10]));
    expect(closedReviewBlocksPublish("still_blocked")).toBe(true);
    expect(closedReviewBlocksPublish("needs_new_master")).toBe(true);
    expect(closedReviewBlocksPublish("dismissed_no_publish")).toBe(false);
    expect(closedReviewBlocksPublish(null)).toBe(false);
    expect(
      evaluateUserPublishRights({
        beatId: BEAT,
        status: "APPROVED",
        masterReady: true,
        attestation: attestation(checksum),
        currentChecksum: checksum,
        statementVersion: PROPOSED_RIGHTS_STATEMENT.version,
        check: { kind: "no_signal" },
        openManualReview: false,
        hashBlocked: false,
        ownerId: OTHER,
        latestClosedOutcome: "still_blocked",
      }).ok,
    ).toBe(false);
    expect(
      evaluateUserPublishRights({
        beatId: BEAT,
        status: "APPROVED",
        masterReady: true,
        attestation: attestation(checksum),
        currentChecksum: checksum,
        statementVersion: PROPOSED_RIGHTS_STATEMENT.version,
        check: { kind: "no_signal" },
        openManualReview: false,
        hashBlocked: false,
        ownerId: OTHER,
        latestClosedOutcome: "dismissed_no_publish",
      }).ok,
    ).toBe(true);
  });
});
