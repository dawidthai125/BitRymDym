/**
 * Studio markers A3/P7 lite — verse/hook at integer ms.
 * Persist goes through existing document_version + studio_cas_* (not a second engine).
 */

export const STUDIO_MARKER_KINDS = ["verse", "hook"] as const;
export type StudioMarkerKind = (typeof STUDIO_MARKER_KINDS)[number];

export const STUDIO_MARKERS_MAX = 24;
export const STUDIO_MARKER_POSITION_MS_MAX = 86_400_000;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type StudioMarkerDto = {
  id: string;
  kind: StudioMarkerKind;
  positionMs: number;
};

export function isStudioMarkerKind(value: unknown): value is StudioMarkerKind {
  return value === "verse" || value === "hook";
}

export function parseStudioMarkerKind(raw: unknown): StudioMarkerKind {
  if (!isStudioMarkerKind(raw)) {
    throw new Error("MARKER_KIND_INVALID");
  }
  return raw;
}

export function parseStudioMarkerPositionMs(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 0) {
    throw new Error("MARKER_POSITION_INVALID");
  }
  if (raw > STUDIO_MARKER_POSITION_MS_MAX) {
    throw new Error("MARKER_POSITION_INVALID");
  }
  return raw;
}

export function parseStudioMarkerId(raw: unknown): string {
  if (typeof raw !== "string" || !UUID_RE.test(raw)) {
    throw new Error("MARKER_ID_INVALID");
  }
  return raw;
}

export function parseStudioMarker(raw: unknown): StudioMarkerDto {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("MARKER_INVALID");
  }
  const row = raw as Record<string, unknown>;
  return {
    id: parseStudioMarkerId(row.id),
    kind: parseStudioMarkerKind(row.kind),
    positionMs: parseStudioMarkerPositionMs(row.positionMs),
  };
}

export function parseStudioMarkersArray(raw: unknown): StudioMarkerDto[] {
  if (raw == null) return [];
  if (!Array.isArray(raw)) {
    throw new Error("MARKERS_INVALID");
  }
  if (raw.length > STUDIO_MARKERS_MAX) {
    throw new Error("MARKERS_CAPACITY");
  }
  const seen = new Set<string>();
  const markers: StudioMarkerDto[] = [];
  for (const item of raw) {
    const marker = parseStudioMarker(item);
    if (seen.has(marker.id)) {
      throw new Error("MARKER_ID_INVALID");
    }
    seen.add(marker.id);
    markers.push(marker);
  }
  return markers;
}

/** Read-path: keep only valid verse/hook rows. Never invent markers. */
export function mapStudioMarkersField(raw: unknown): StudioMarkerDto[] {
  if (raw == null) return [];
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const markers: StudioMarkerDto[] = [];
  for (const item of raw) {
    try {
      const marker = parseStudioMarker(item);
      if (seen.has(marker.id)) continue;
      if (markers.length >= STUDIO_MARKERS_MAX) break;
      seen.add(marker.id);
      markers.push(marker);
    } catch {
      // skip corrupt row
    }
  }
  return markers;
}

export function addStudioMarker(
  current: readonly StudioMarkerDto[],
  input: { kind: unknown; positionMs: unknown; id?: unknown },
): StudioMarkerDto[] {
  if (current.length >= STUDIO_MARKERS_MAX) {
    throw new Error("MARKERS_CAPACITY");
  }
  const marker: StudioMarkerDto = {
    id:
      input.id == null
        ? crypto.randomUUID()
        : parseStudioMarkerId(input.id),
    kind: parseStudioMarkerKind(input.kind),
    positionMs: parseStudioMarkerPositionMs(input.positionMs),
  };
  if (current.some((item) => item.id === marker.id)) {
    throw new Error("MARKER_ID_INVALID");
  }
  return [...current, marker];
}

export function removeStudioMarker(
  current: readonly StudioMarkerDto[],
  markerId: unknown,
): StudioMarkerDto[] {
  const id = parseStudioMarkerId(markerId);
  const next = current.filter((item) => item.id !== id);
  if (next.length === current.length) {
    throw new Error("MARKER_NOT_FOUND");
  }
  return next;
}

export function studioMarkerKindLabelPl(kind: StudioMarkerKind): string {
  return kind === "verse" ? "Zwrotka" : "Refren";
}
