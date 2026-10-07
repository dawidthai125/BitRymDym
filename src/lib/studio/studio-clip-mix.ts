/**
 * POST-RECORDING V1 — Clip Gain / Mute write helpers (CAS culture).
 * Reuses Track/Master gain bounds. Not a second audio engine.
 */

import type { StudioClipDto } from "@/lib/studio/studio-types";
import {
  applyStudioFxCasToState,
  FX_CHAIN_CONFLICT_UI_PL,
  StudioFxChainError,
} from "@/lib/studio/studio-fx-chain";
import {
  STUDIO_MASTER_GAIN_DB_MAX,
  STUDIO_MASTER_GAIN_DB_MIN,
} from "@/lib/studio/studio-master-mix";

/** Match Track / Master Gain UI bounds (−24…12 dB). */
export const STUDIO_CLIP_GAIN_DB_MIN = STUDIO_MASTER_GAIN_DB_MIN;
export const STUDIO_CLIP_GAIN_DB_MAX = STUDIO_MASTER_GAIN_DB_MAX;

const CLIP_MIX_INVALID_PL =
  "Nie udało się zapisać klipu. Sprawdź wartości i spróbuj ponownie.";

function clipMixInvalid(detail?: string): never {
  throw new StudioFxChainError(
    "FX_CHAIN_INVALID",
    detail ? `${CLIP_MIX_INVALID_PL} (${detail})` : CLIP_MIX_INVALID_PL,
  );
}

export function parseStudioClipGainDb(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    clipMixInvalid("gainDb");
  }
  if (raw < STUDIO_CLIP_GAIN_DB_MIN || raw > STUDIO_CLIP_GAIN_DB_MAX) {
    clipMixInvalid("gainDb range");
  }
  return raw;
}

export function parseStudioClipMuted(raw: unknown): boolean {
  if (typeof raw !== "boolean") {
    clipMixInvalid("muted");
  }
  return raw;
}

export type StudioClipGainMuteCasState = {
  documentVersion: number;
  gainDb: number;
  muted: boolean;
};

export function applyStudioClipGainMuteCasToState(
  state: StudioClipGainMuteCasState,
  expectedDocumentVersion: number,
  patch: { gainDb?: unknown; muted?: unknown },
): StudioClipGainMuteCasState {
  if (patch.gainDb === undefined && patch.muted === undefined) {
    clipMixInvalid("empty patch");
  }
  const nextGain =
    patch.gainDb === undefined
      ? state.gainDb
      : parseStudioClipGainDb(patch.gainDb);
  const nextMuted =
    patch.muted === undefined
      ? state.muted
      : parseStudioClipMuted(patch.muted);

  return applyStudioFxCasToState(state, expectedDocumentVersion, (next) => {
    next.gainDb = nextGain;
    next.muted = nextMuted;
  });
}

export type StudioClipGainPatchBody = {
  op: "set_gain";
  gainDb: number;
  expectedDocumentVersion: number;
};

export type StudioClipMutePatchBody = {
  op: "set_mute";
  muted: boolean;
  expectedDocumentVersion: number;
};

export function buildStudioClipGainPatchBody(params: {
  gainDb: number;
  expectedDocumentVersion: number;
}): StudioClipGainPatchBody {
  return {
    op: "set_gain",
    gainDb: params.gainDb,
    expectedDocumentVersion: params.expectedDocumentVersion,
  };
}

export function buildStudioClipMutePatchBody(params: {
  muted: boolean;
  expectedDocumentVersion: number;
}): StudioClipMutePatchBody {
  return {
    op: "set_mute",
    muted: params.muted,
    expectedDocumentVersion: params.expectedDocumentVersion,
  };
}

export type StudioClipMixPersistResult =
  | { ok: true; documentVersion: number; clip: StudioClipDto }
  | {
      ok: false;
      kind: "conflict" | "unauthorized" | "forbidden" | "validation" | "error";
      status: number;
      message: string;
    };

export function interpretStudioClipMixPersistResponse(
  status: number,
  json: {
    success?: boolean;
    clip?: StudioClipDto;
    documentVersion?: number;
    error?: string;
    code?: string;
  },
): StudioClipMixPersistResult {
  if (status === 409 || json.code === "FX_CHAIN_VERSION_CONFLICT") {
    return {
      ok: false,
      kind: "conflict",
      status: status === 409 ? 409 : status,
      message: json.error ?? FX_CHAIN_CONFLICT_UI_PL,
    };
  }
  if (status === 401) {
    return {
      ok: false,
      kind: "unauthorized",
      status: 401,
      message: json.error ?? "Wymagane logowanie.",
    };
  }
  if (status === 403 || status === 404) {
    return {
      ok: false,
      kind: "forbidden",
      status,
      message: json.error ?? "Brak dostępu.",
    };
  }
  if (status === 400) {
    return {
      ok: false,
      kind: "validation",
      status: 400,
      message: json.error ?? CLIP_MIX_INVALID_PL,
    };
  }
  if (
    !json.success ||
    !json.clip ||
    typeof json.documentVersion !== "number"
  ) {
    return {
      ok: false,
      kind: "error",
      status,
      message: json.error ?? CLIP_MIX_INVALID_PL,
    };
  }
  return {
    ok: true,
    documentVersion: json.documentVersion,
    clip: json.clip,
  };
}
