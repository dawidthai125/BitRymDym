/**
 * P6.4.1 — Master Gain/Pan mutation helpers (document columns, CAS).
 * Studio-owned. Not E3 Mix. Not a second settings store.
 */

import {
  applyStudioFxCasToState,
  StudioFxChainError,
} from "@/lib/studio/studio-fx-chain";

/** Match Track Gain UI bounds in studio-editor (−24…12 dB). */
export const STUDIO_MASTER_GAIN_DB_MIN = -24;
export const STUDIO_MASTER_GAIN_DB_MAX = 12;

/** Match Track Pan / normalizePan domain (−1…1). */
export const STUDIO_MASTER_PAN_MIN = -1;
export const STUDIO_MASTER_PAN_MAX = 1;

const MIX_INVALID_PL =
  "Nie udało się zapisać Master. Sprawdź wartości i spróbuj ponownie.";

function mixInvalid(detail?: string): never {
  throw new StudioFxChainError(
    "FX_CHAIN_INVALID",
    detail ? `${MIX_INVALID_PL} (${detail})` : MIX_INVALID_PL,
  );
}

export function parseStudioMasterGainDb(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    mixInvalid("masterGainDb");
  }
  if (raw < STUDIO_MASTER_GAIN_DB_MIN || raw > STUDIO_MASTER_GAIN_DB_MAX) {
    mixInvalid("masterGainDb range");
  }
  return raw;
}

export function parseStudioMasterPan(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    mixInvalid("masterPan");
  }
  if (raw < STUDIO_MASTER_PAN_MIN || raw > STUDIO_MASTER_PAN_MAX) {
    mixInvalid("masterPan range");
  }
  return raw;
}

export type StudioMasterMixState = {
  documentVersion: number;
  masterGainDb: number;
  masterPan: number;
};

/**
 * In-memory Master Mix CAS — SSOT algorithm for tests / planning.
 * Reuses FX CAS conflict vocabulary (same document_version).
 */
export function applyStudioMasterMixCasToState(
  state: StudioMasterMixState,
  expectedDocumentVersion: number,
  patch: { masterGainDb?: number; masterPan?: number },
): StudioMasterMixState {
  if (patch.masterGainDb === undefined && patch.masterPan === undefined) {
    mixInvalid("empty patch");
  }
  const nextGain =
    patch.masterGainDb === undefined
      ? state.masterGainDb
      : parseStudioMasterGainDb(patch.masterGainDb);
  const nextPan =
    patch.masterPan === undefined
      ? state.masterPan
      : parseStudioMasterPan(patch.masterPan);

  return applyStudioFxCasToState(state, expectedDocumentVersion, (next) => {
    next.masterGainDb = nextGain;
    next.masterPan = nextPan;
  });
}
