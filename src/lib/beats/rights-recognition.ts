import type { RightsCheckResult } from "@/lib/beats/rights-policy";

/**
 * Local stand-in for a future recognition provider.
 * It never contacts an external service and never publishes a beat.
 * no_signal is not proof of rights.
 */
/** No external recognizer is configured. Absence of a signal is not clearance. */
export function localRecognitionResult(): RightsCheckResult {
  return { kind: "not_run" };
}

export function mockRecognitionResult(input: {
  mode: RightsCheckResult["kind"];
}): RightsCheckResult {
  if (input.mode === "blocked_hash") {
    return { kind: "blocked_hash", sourceDecisionId: "mock-decision" };
  }
  return { kind: input.mode };
}
