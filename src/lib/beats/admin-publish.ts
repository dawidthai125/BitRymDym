import type { BeatStatus } from "@/types/domain";

/**
 * Phase 1.7 UI publish gate (FROZEN).
 * Server lifecycle soft-allow without READY MASTER remains GAP-PUBLISH-READY.
 */
export function getAdminPublishGate(params: {
  status: BeatStatus;
  activeMasterReady: boolean;
}): { enabled: boolean; blockedReason: string | null } {
  if (params.status !== "DRAFT") {
    return {
      enabled: false,
      blockedReason:
        params.status === "PUBLISHED"
          ? "Bit jest już opublikowany."
          : `Publikacja niedostępna w statusie ${params.status}.`,
    };
  }

  if (!params.activeMasterReady) {
    return {
      enabled: false,
      blockedReason:
        "Publikacja zablokowana: wymagany aktywny MASTER w statusie READY. (GAP-PUBLISH-READY: reguła UI; serwer nadal soft-allow.)",
    };
  }

  return { enabled: true, blockedReason: null };
}

export function canAdminPublishFromUi(params: {
  status: BeatStatus;
  activeMasterReady: boolean;
}): boolean {
  return getAdminPublishGate(params).enabled;
}
