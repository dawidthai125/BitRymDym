/**
 * Studio recording P0 — feature gates (SSOT).
 *
 * Nothing is premium-locked yet: every feature is ON for everyone. When plans
 * land, set `minTier` here and the UI/API read the same helper — one place.
 */

export type StudioRecordingFeature =
  | "latencyCalibration"
  | "bluetoothWarning"
  | "sectionLoop"
  | "punchInLine"
  | "multiTakeComping";

export type StudioPlanTier = "free" | "plus" | "pro";

type FeatureGate = {
  /** Lowest tier that gets the feature; null = everyone (no gate). */
  minTier: StudioPlanTier | null;
  /** Hard kill switch (incident / rollout). */
  enabled: boolean;
};

export const STUDIO_RECORDING_FEATURES: Readonly<
  Record<StudioRecordingFeature, FeatureGate>
> = {
  latencyCalibration: { minTier: null, enabled: true },
  bluetoothWarning: { minTier: null, enabled: true },
  sectionLoop: { minTier: null, enabled: true },
  punchInLine: { minTier: null, enabled: true },
  multiTakeComping: { minTier: null, enabled: true },
};

const TIER_RANK: Record<StudioPlanTier, number> = { free: 0, plus: 1, pro: 2 };

export function isStudioRecordingFeatureEnabled(
  feature: StudioRecordingFeature,
  tier: StudioPlanTier = "free",
): boolean {
  const gate = STUDIO_RECORDING_FEATURES[feature];
  if (!gate.enabled) return false;
  if (gate.minTier == null) return true;
  return TIER_RANK[tier] >= TIER_RANK[gate.minTier];
}

/** Hard limits for take lanes (bounded jsonb, also enforced server-side). */
export const STUDIO_TAKE_LANE_LIMITS = {
  maxPassesPerLane: 24,
  maxLanesPerProject: 64,
  sectionBars: [4, 8, 16] as const,
  /** Overlap between comp segments. */
  crossfadeMs: 12,
  /** Tiny fade at comp edges against clicks. */
  edgeFadeMs: 4,
} as const;
