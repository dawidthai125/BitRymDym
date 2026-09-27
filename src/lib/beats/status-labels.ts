import type { BeatStatus } from "@/types/domain";

/** Polish UI labels for beat lifecycle statuses (Wave 3). */
export const BEAT_STATUS_LABEL_PL: Record<BeatStatus, string> = {
  DRAFT: "Szkic",
  PENDING_REVIEW: "W moderacji",
  APPROVED: "Zaakceptowany",
  REJECTED: "Odrzucony",
  PUBLISHED: "Opublikowany",
  ARCHIVED: "Zarchiwizowany",
};

export function beatStatusLabelPl(status: BeatStatus | string): string {
  if (status in BEAT_STATUS_LABEL_PL) {
    return BEAT_STATUS_LABEL_PL[status as BeatStatus];
  }
  return status;
}

export function canUserEditBeatStatus(status: BeatStatus | string): boolean {
  return status === "DRAFT" || status === "REJECTED";
}
