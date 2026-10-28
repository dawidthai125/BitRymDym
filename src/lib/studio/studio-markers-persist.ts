import "server-only";

import { AuthError } from "@/lib/auth/session";
import {
  parseExpectedDocumentVersion,
  StudioFxCasConflictError,
} from "@/lib/studio/studio-fx-chain";
import {
  mapStudioMarkersField,
  parseStudioMarkerId,
  parseStudioMarkerKind,
  parseStudioMarkerPositionMs,
  type StudioMarkerDto,
  type StudioMarkerKind,
} from "@/lib/studio/studio-markers-state";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type StudioMarkersCasRow = {
  document_version: number;
  markers: unknown;
};

function num(value: number | string): number {
  return typeof value === "number" ? value : Number(value);
}

function mapMarkersError(error: { message: string }): never {
  if (/PROJECT_NOT_FOUND/i.test(error.message)) {
    throw new AuthError("NOT_FOUND", "Projekt nie został znaleziony.");
  }
  if (/MARKER_NOT_FOUND/i.test(error.message)) {
    throw new AuthError("NOT_FOUND", "Marker nie został znaleziony.");
  }
  if (/MARKERS_CAPACITY/i.test(error.message)) {
    throw new AuthError("FORBIDDEN", "Osiągnięto limit markerów.");
  }
  if (/MARKER_|MARKERS_/i.test(error.message)) {
    throw new AuthError("FORBIDDEN", "Nie udało się zapisać markera.");
  }
  throw new Error(error.message);
}

/**
 * Studio markers A3/P7 lite — persist verse/hook via existing CAS path.
 * RPC is service_role only; caller must already own the project.
 */
export async function listStudioProjectMarkersCas(params: {
  ownerId: string;
  projectId: string;
}): Promise<{
  documentVersion: number;
  markers: StudioMarkerDto[];
}> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("studio_projects")
    .select("document_version, markers")
    .eq("id", params.projectId)
    .eq("owner_id", params.ownerId)
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    throw new AuthError("NOT_FOUND", "Projekt nie został znaleziony.");
  }
  return {
    documentVersion: num(data.document_version as number | string),
    markers: mapStudioMarkersField(data.markers),
  };
}

export async function applyStudioMarkersCas(params: {
  ownerId: string;
  projectId: string;
  expected: unknown;
  op: unknown;
  kind?: unknown;
  positionMs?: unknown;
  markerId?: unknown;
}): Promise<{
  documentVersion: number;
  markers: StudioMarkerDto[];
}> {
  const expected = parseExpectedDocumentVersion(params.expected);
  const op = params.op === "remove" ? "remove" : params.op === "add" ? "add" : null;
  if (!op) {
    throw new AuthError("FORBIDDEN", "Nieznana operacja markera.");
  }

  let kind: StudioMarkerKind | null = null;
  let positionMs: number | null = null;
  let markerId: string | null = null;
  try {
    if (op === "add") {
      kind = parseStudioMarkerKind(params.kind);
      positionMs = parseStudioMarkerPositionMs(params.positionMs);
    } else {
      markerId = parseStudioMarkerId(params.markerId);
    }
  } catch (error) {
    throw new AuthError(
      "FORBIDDEN",
      error instanceof Error && error.message === "MARKER_NOT_FOUND"
        ? "Marker nie został znaleziony."
        : "Nie udało się zapisać markera.",
    );
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("studio_cas_apply_markers", {
    p_project_id: params.projectId,
    p_owner_id: params.ownerId,
    p_expected: expected,
    p_op: op,
    p_kind: kind,
    p_position_ms: positionMs,
    p_marker_id: markerId,
  });
  if (error) {
    mapMarkersError(error);
  }
  const rows = (data as StudioMarkersCasRow[] | null) ?? [];
  const row = rows[0];
  if (!row) throw new StudioFxCasConflictError();

  return {
    documentVersion: num(row.document_version),
    markers: mapStudioMarkersField(row.markers),
  };
}
