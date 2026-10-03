/**
 * Pure ACCOUNT/PROFILE-01 delete classification (no I/O).
 * Used by orchestrator + unit tests.
 */

export type OwnedBeatClass = {
  id: string;
  status: string;
  ownershipType: string;
};

export function classifyOwnedBeatsForDelete(beats: readonly OwnedBeatClass[]): {
  retainIds: string[];
  deleteIds: string[];
} {
  const retainIds: string[] = [];
  const deleteIds: string[] = [];
  for (const b of beats) {
    if (b.ownershipType !== "USER") continue;
    if (b.status === "PUBLISHED") {
      retainIds.push(b.id);
    } else {
      deleteIds.push(b.id);
    }
  }
  return { retainIds, deleteIds };
}

/** Keys safe to remove: under user prefix and not retained for public content. */
export function filterPrivateStorageKeysToDelete(params: {
  userId: string;
  candidateKeys: readonly string[];
  retainedKeys: ReadonlySet<string>;
}): string[] {
  const prefix = `user/${params.userId}/`;
  return params.candidateKeys.filter(
    (key) =>
      key.startsWith(prefix) &&
      !key.startsWith("platform/") &&
      !key.startsWith("anon/") &&
      !params.retainedKeys.has(key),
  );
}

/** Reject client-supplied identity for delete (IDOR guard). */
export function assertDeleteTargetsSessionUser(params: {
  sessionUserId: string;
  claimedUserId?: string | null;
  claimedUserNumber?: string | null;
  claimedEmail?: string | null;
}): void {
  if (params.claimedUserId && params.claimedUserId !== params.sessionUserId) {
    throw new Error("Forbidden: foreign user id.");
  }
  // user_number / email from form are never authority — ignore if present.
  void params.claimedUserNumber;
  void params.claimedEmail;
}
