import type { BeatStatus } from "@/types/domain";
import { labelBeatStatus } from "@/lib/ui/labels";

/**
 * Compatibility surface for beat status PL labels.
 * Canonical SSOT: {@link labelBeatStatus} in `src/lib/ui/labels.ts` (POLISH-01).
 * AuthZ helper {@link canUserEditBeatStatus} stays here — not a label concern.
 */

export const BEAT_STATUS_LABEL_PL: Record<BeatStatus, string> = {
  DRAFT: labelBeatStatus("DRAFT"),
  PENDING_REVIEW: labelBeatStatus("PENDING_REVIEW"),
  APPROVED: labelBeatStatus("APPROVED"),
  REJECTED: labelBeatStatus("REJECTED"),
  PUBLISHED: labelBeatStatus("PUBLISHED"),
  ARCHIVED: labelBeatStatus("ARCHIVED"),
};

export function beatStatusLabelPl(status: BeatStatus | string): string {
  return labelBeatStatus(status);
}

export function canUserEditBeatStatus(status: BeatStatus | string): boolean {
  return status === "DRAFT" || status === "REJECTED";
}
