/**
 * P4.5 — pure RAW own-take download daily C helpers (unit-test safe).
 */

import { OWN_TAKE_RAW_DOWNLOADS_DAILY } from "@/config/recording";
import { AuthError } from "@/lib/auth/session";

export function assertUnderOwnTakeRawDailyCap(params: {
  usedToday: number;
  limit?: number;
}): void {
  const limit = params.limit ?? OWN_TAKE_RAW_DOWNLOADS_DAILY;
  if (params.usedToday >= limit) {
    throw new AuthError(
      "FORBIDDEN",
      `Dzienny limit pobrań RAW wyczerpany (${limit}/dzień, plan GOLD).`,
    );
  }
}
