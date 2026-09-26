/**
 * Pure OD-17 / limit semantics for unit tests.
 * Runtime enforcement lives in Postgres RPCs.
 */

export type DownloadUsage = {
  /** Final DOWNLOAD_EVENTs in UTC window */
  events: number;
  /** Unexpired reservations in UTC window */
  activeReservations: number;
};

export function downloadUsageTotal(usage: DownloadUsage): number {
  return usage.events + usage.activeReservations;
}

export function canReserveDownloadSlot(params: {
  usage: DownloadUsage;
  limit: number;
}): { allowed: boolean; used: number; remaining: number } {
  const used = downloadUsageTotal(params.usage);
  if (used >= params.limit) {
    return { allowed: false, used, remaining: 0 };
  }
  return {
    allowed: true,
    used,
    remaining: Math.max(params.limit - used, 0),
  };
}

/**
 * State machine after a download attempt (no I/O).
 * DOWNLOAD_EVENT exists only on finalize after URL success.
 */
export type DownloadAttemptPhase =
  | { phase: "idle" }
  | { phase: "reserved"; reservationId: string }
  | { phase: "url_issued"; reservationId: string; url: string }
  | { phase: "finalized"; reservationId: string; url: string; eventId: string }
  | { phase: "released"; reservationId: string }
  | { phase: "failed_no_reservation" };

export function afterReserveSuccess(reservationId: string): {
  phase: "reserved";
  reservationId: string;
} {
  return { phase: "reserved", reservationId };
}

export function afterUrlSuccess(
  state: { phase: "reserved"; reservationId: string },
  url: string,
): { phase: "url_issued"; reservationId: string; url: string } {
  return {
    phase: "url_issued",
    reservationId: state.reservationId,
    url,
  };
}

export function afterFinalizeSuccess(
  state: { phase: "url_issued"; reservationId: string; url: string },
  eventId: string,
): {
  phase: "finalized";
  reservationId: string;
  url: string;
  eventId: string;
} {
  return {
    phase: "finalized",
    reservationId: state.reservationId,
    url: state.url,
    eventId,
  };
}

export function afterUrlFailure(state: {
  phase: "reserved";
  reservationId: string;
}): { phase: "released"; reservationId: string } {
  return { phase: "released", reservationId: state.reservationId };
}

export function hasFinalDownloadEvent(state: DownloadAttemptPhase): boolean {
  return state.phase === "finalized";
}

export function isReservationActive(params: {
  expiresAt: Date;
  now: Date;
}): boolean {
  return params.expiresAt.getTime() > params.now.getTime();
}
