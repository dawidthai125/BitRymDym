import "server-only";

import { AuthError } from "@/lib/auth/session";
import {
  nextAddTrackName,
  parseStudioAddTrackType,
  type StudioAddTrackType,
} from "@/lib/studio/studio-track-capacity";
import { parseScratchApprovedForWrite } from "@/lib/studio/studio-scratch-state";
import type { StudioClipDto } from "@/lib/studio/studio-types";
import { StudioFxCasConflictError } from "@/lib/studio/studio-fx-chain";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type StudioClipScratchRowFields = {
  scratch_cue_ms?: number | null;
  scratch_reverse?: boolean | null;
  scratch_rate?: number | string | null;
};

export type StudioClipScratchCasRow = {
  document_version: number;
  scratch_cue_ms: number;
  scratch_reverse: boolean;
  scratch_rate: number | string;
};

export type StudioClipScratchWriteInput = {
  projectId: string;
  clipId: string;
  expectedDocumentVersion: unknown;
  cueMs: unknown;
  reverse: unknown;
  rate: unknown;
};

function num(value: number | string): number {
  return typeof value === "number" ? value : Number(value);
}

export function mapStudioClipScratchFields(
  row: StudioClipScratchRowFields,
): Pick<StudioClipDto, "scratchCueMs" | "scratchReverse" | "scratchRate"> {
  return {
    scratchCueMs: row.scratch_cue_ms ?? 0,
    scratchReverse: Boolean(row.scratch_reverse),
    scratchRate: row.scratch_rate == null ? 1 : num(row.scratch_rate),
  };
}

export function resolveStudioAddTrackTypeForWrite(
  raw: unknown,
): StudioAddTrackType {
  try {
    return parseStudioAddTrackType(raw);
  } catch {
    throw new AuthError("FORBIDDEN", "Nieobsługiwany typ ścieżki.");
  }
}

export function resolveStudioAddTrackName(
  trackType: StudioAddTrackType,
  existingNames: readonly string[],
): string {
  return nextAddTrackName(trackType, existingNames);
}

export function parseStudioClipScratchApprovedForWrite(input: {
  cueMs: unknown;
  reverse: unknown;
  rate: unknown;
}) {
  try {
    return parseScratchApprovedForWrite(input);
  } catch (error) {
    throw new AuthError(
      "FORBIDDEN",
      error instanceof Error
        ? error.message
        : "Nie udało się zapisać stanu Scratch.",
    );
  }
}

/**
 * Scratch DJ v1 — persist approved cue/reverse/rate via existing CAS path.
 * RPC is service_role only; caller must already own the clip.
 */
export async function applyStudioClipScratchCas(params: {
  ownerId: string;
  projectId: string;
  clipId: string;
  expected: number;
  cueMs: unknown;
  reverse: unknown;
  rate: unknown;
}): Promise<{
  documentVersion: number;
  scratchCueMs: number;
  scratchReverse: boolean;
  scratchRate: number;
}> {
  const approved = parseStudioClipScratchApprovedForWrite({
    cueMs: params.cueMs,
    reverse: params.reverse,
    rate: params.rate,
  });

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("studio_cas_apply_clip_scratch", {
    p_project_id: params.projectId,
    p_owner_id: params.ownerId,
    p_clip_id: params.clipId,
    p_expected: params.expected,
    p_scratch_cue_ms: approved.cueMs,
    p_scratch_reverse: approved.reverse,
    p_scratch_rate: approved.rate,
  });
  if (error) {
    if (/CLIP_NOT_FOUND/i.test(error.message)) {
      throw new AuthError("NOT_FOUND", "Klip nie został znaleziony.");
    }
    if (/SCRATCH_/i.test(error.message)) {
      throw new AuthError("FORBIDDEN", "Nie udało się zapisać stanu Scratch.");
    }
    throw new Error(error.message);
  }
  const rows = (data as StudioClipScratchCasRow[] | null) ?? [];
  const row = rows[0];
  if (!row) throw new StudioFxCasConflictError();

  return {
    documentVersion: num(row.document_version),
    scratchCueMs: row.scratch_cue_ms,
    scratchReverse: Boolean(row.scratch_reverse),
    scratchRate: num(row.scratch_rate),
  };
}
