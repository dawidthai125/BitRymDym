/**
 * Best-effort award wrappers for trusted domain transitions.
 * Never throw into the primary product path.
 */

import "server-only";

import {
  awardBeatApproved,
  awardBeatFirstPublished,
  awardMixSessionFirstExport,
  awardProfileCompleted,
  awardRenderSucceeded,
  awardTakeReady,
} from "@/lib/creator-progress/award";

async function ignoreAwardErrors(
  run: () => Promise<unknown>,
): Promise<void> {
  try {
    await run();
  } catch {
    // Experience must not break publish / finalize / render.
  }
}

export function hookProfileCompleted(userId: string): Promise<void> {
  return ignoreAwardErrors(() => awardProfileCompleted(userId));
}

export function hookBeatApproved(params: {
  ownerUserId: string | null | undefined;
  beatId: string;
}): Promise<void> {
  if (!params.ownerUserId) return Promise.resolve();
  return ignoreAwardErrors(() =>
    awardBeatApproved({
      ownerUserId: params.ownerUserId!,
      beatId: params.beatId,
    }),
  );
}

export function hookBeatFirstPublished(params: {
  ownerUserId: string | null | undefined;
  beatId: string;
}): Promise<void> {
  if (!params.ownerUserId) return Promise.resolve();
  return ignoreAwardErrors(() =>
    awardBeatFirstPublished({
      ownerUserId: params.ownerUserId!,
      beatId: params.beatId,
    }),
  );
}

export function hookTakeReadyAuth(params: {
  ownerUserId: string;
  takeId: string;
}): Promise<void> {
  return ignoreAwardErrors(() => awardTakeReady(params));
}

/** First export + render success (idempotent / capped independently). */
export function hookRenderJobSucceeded(params: {
  ownerUserId: string;
  mixSessionId: string;
  renderJobId: string;
}): Promise<void> {
  return ignoreAwardErrors(async () => {
    await awardMixSessionFirstExport({
      ownerUserId: params.ownerUserId,
      mixSessionId: params.mixSessionId,
      renderJobId: params.renderJobId,
    });
    await awardRenderSucceeded({
      ownerUserId: params.ownerUserId,
      renderJobId: params.renderJobId,
    });
  });
}
