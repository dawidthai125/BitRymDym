/**
 * Audio artifact domain classification from trusted DB bindings (XOR).
 * OD-SFM-ID-01 / OD-SFM-ID-06 — never trust client claims / object_key / READY alone.
 */

import { AuthError } from "@/lib/auth/session";

export const AUDIO_ARTIFACT_DOMAINS = [
  "SFM",
  "E3_MIX",
  "TAKE",
  "LEGACY_STUDIO",
  "UNKNOWN",
] as const;

export type AudioArtifactDomain = (typeof AUDIO_ARTIFACT_DOMAINS)[number];

export type AudioArtifactDomainBinding = {
  sfmVersionId: string | null;
  mixSessionId: string | null;
  takeId: string | null;
  projectId: string | null;
};

/**
 * Domain SSOT from DB foreign keys — not quality_tier, object_key, or URL.
 * SFM wins when sfm_version_id is set (even if project_id is also set).
 */
export function classifyAudioArtifactDomain(
  row: AudioArtifactDomainBinding,
): AudioArtifactDomain {
  if (row.sfmVersionId) return "SFM";
  if (row.mixSessionId) return "E3_MIX";
  if (row.takeId) return "TAKE";
  if (row.projectId) return "LEGACY_STUDIO";
  return "UNKNOWN";
}

/**
 * Mix/E3 download route gate after SFM cutover rules:
 * - SFM rows always DENY on mix route (OD-SFM-ID-01) — dedicated SFM route only.
 * - LEGACY_STUDIO DENY when SFM_VERSIONS_V1 ON (OD-SFM-ID-06 deny-without-backfill).
 * - E3_MIX / TAKE unchanged.
 * Does not invent versions/grants (no backfill).
 *
 * Call only after ownership is confirmed (F-02) — never before.
 */
export function assertMixRouteAllowsArtifactDomain(params: {
  domain: AudioArtifactDomain;
  sfmVersionsV1Enabled: boolean;
}): void {
  if (params.domain === "SFM") {
    throw new AuthError(
      "FORBIDDEN",
      "Studio Final Mix artifacts must use the SFM download route.",
    );
  }
  if (params.domain === "LEGACY_STUDIO" && params.sfmVersionsV1Enabled) {
    throw new AuthError(
      "FORBIDDEN",
      "Legacy Studio WAV is not a current Studio Final Mix final (OD-SFM-ID-06).",
    );
  }
  if (params.domain === "UNKNOWN") {
    throw new AuthError(
      "FORBIDDEN",
      "Artifact domain binding is incomplete.",
    );
  }
}

/**
 * F-02 helper — ownership first, then mix-route domain gate.
 * Non-owners get a generic FORBIDDEN without domain disclosure.
 */
export function assertOwnedThenMixRouteDomain(params: {
  artifactOwnerId: string;
  userId: string;
  domain: AudioArtifactDomain;
  sfmVersionsV1Enabled: boolean;
}): void {
  if (params.artifactOwnerId !== params.userId) {
    throw new AuthError("FORBIDDEN", "Not artifact owner.");
  }
  assertMixRouteAllowsArtifactDomain({
    domain: params.domain,
    sfmVersionsV1Enabled: params.sfmVersionsV1Enabled,
  });
}

/** True when SFM route must reject rows lacking sfm_version_id (legacy / other domains). */
export function isSfmDownloadDomain(domain: AudioArtifactDomain): boolean {
  return domain === "SFM";
}
