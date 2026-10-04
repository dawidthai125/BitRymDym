import type { SystemRole } from "@/types/domain";

export function selfDeleteDecision(params: {
  actorId: string;
  targetId: string;
}): "PASS" | "SELF_DELETE_FORBIDDEN" {
  if (params.actorId === params.targetId) return "SELF_DELETE_FORBIDDEN";
  return "PASS";
}

export type LastAdminDeleteInput = {
  adminIds: readonly string[];
  targetId: string;
  targetRole: SystemRole;
};

export function lastAdminDeleteDecision(
  input: LastAdminDeleteInput,
): "PASS" | "LAST_ADMIN_PROTECTED" {
  if (input.targetRole !== "ADMIN") return "PASS";
  const unique = [...new Set(input.adminIds)];
  if (unique.length <= 1 && unique[0] === input.targetId) {
    return "LAST_ADMIN_PROTECTED";
  }
  return "PASS";
}

/**
 * Same serialization idea as W2: first operation sees 2 admins, second sees 1.
 * Models demote-then-delete (or delete-then-demote) under one lock.
 */
export function serializedLastAdminDeleteThenDemote(adminIds: readonly string[]): {
  deleteFirst: ReturnType<typeof lastAdminDeleteDecision>;
  demoteSecond: "PASS" | "LAST_ADMIN_PROTECTED";
} {
  if (adminIds.length !== 2) {
    throw new Error("serializedLastAdminDeleteThenDemote expects two ADMIN ids");
  }
  const [a, b] = adminIds;
  const deleteFirst = lastAdminDeleteDecision({
    adminIds,
    targetId: a,
    targetRole: "ADMIN",
  });
  const remaining = deleteFirst === "PASS" ? [b] : [...adminIds];
  const demoteSecond =
    remaining.length <= 1 && remaining[0] === b
      ? "LAST_ADMIN_PROTECTED"
      : "PASS";
  return { deleteFirst, demoteSecond };
}
