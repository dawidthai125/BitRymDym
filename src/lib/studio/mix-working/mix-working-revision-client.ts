/**
 * Mix Working revision history — client helpers (A3).
 * Pure URL builders, labels, formatters, HTTP result mapping. No second SSOT.
 */

import type { MixWorkingRevisionDiff } from "@/lib/studio/mix-working/mix-working-diff";
import type {
  MixRevision,
  MixRevisionAuthor,
  MixRevisionKind,
} from "@/lib/studio/mix-working/mix-working-types";
import type { StudioProjectDocument } from "@/lib/studio/studio-types";

export type MixRevisionListItem = Omit<MixRevision, "snapshot" | "ops"> & {
  hasSnapshot: boolean;
};

export type MixRevisionApiFailure = {
  ok: false;
  httpStatus: number;
  code: string | null;
  message: string;
  kind:
    | "unauthenticated"
    | "forbidden"
    | "not_found"
    | "conflict_cas"
    | "idempotency_reuse"
    | "revision_invalid"
    | "validation"
    | "network"
    | "unknown";
};

export type MixRevisionListSuccess = {
  ok: true;
  revisions: MixRevisionListItem[];
  nextCursor: string | null;
};

export type MixRevisionDetailSuccess = {
  ok: true;
  revision: MixRevision;
};

export type MixRevisionCompareSuccess = {
  ok: true;
  diff: MixWorkingRevisionDiff;
};

export type MixRevisionRestoreSuccess = {
  ok: true;
  documentVersion: number;
  documentDigest: string;
  replay: boolean;
  revisionId: string | null;
};

export type MixRevisionProjectDocSuccess = {
  ok: true;
  document: StudioProjectDocument;
};

export function mixWorkingRevisionsUrl(
  projectId: string,
  query?: { limit?: number; cursor?: string | null },
): string {
  const base = `/api/studio/projects/${encodeURIComponent(projectId)}/mix-working/revisions`;
  const params = new URLSearchParams();
  if (query?.limit != null) params.set("limit", String(query.limit));
  if (query?.cursor) params.set("cursor", query.cursor);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

export function mixWorkingRevisionUrl(
  projectId: string,
  revisionId: string,
): string {
  return `/api/studio/projects/${encodeURIComponent(projectId)}/mix-working/revisions/${encodeURIComponent(revisionId)}`;
}

export function mixWorkingRevisionCompareUrl(projectId: string): string {
  return `/api/studio/projects/${encodeURIComponent(projectId)}/mix-working/revisions/compare`;
}

export function mixWorkingRevisionRestoreUrl(
  projectId: string,
  revisionId: string,
): string {
  return `/api/studio/projects/${encodeURIComponent(projectId)}/mix-working/revisions/${encodeURIComponent(revisionId)}/restore`;
}

export function studioProjectDocumentUrl(projectId: string): string {
  return `/api/studio/projects/${encodeURIComponent(projectId)}`;
}

export function mixRevisionKindLabel(kind: MixRevisionKind | string): string {
  switch (kind) {
    case "tip_apply":
      return "Zmiana miksu";
    case "restored":
      return "Przywrócenie";
    case "baseline":
      return "Punkt bazowy";
    case "manual_checkpoint":
      return "Punkt kontrolny";
    case "auto_proposal":
      return "Propozycja automatyczna";
    case "accepted":
      return "Zaakceptowana";
    case "rejected":
      return "Odrzucona";
    default:
      return kind;
  }
}

/** Stage 2 — kind label that names BITEK's own versions. */
export function mixRevisionRowLabel(row: {
  kind: string;
  author: MixRevisionAuthor | string;
}): string {
  if (row.author === "AI") return "Poprawki BITKA";
  return mixRevisionKindLabel(row.kind);
}

export function mixRevisionAuthorLabel(
  author: MixRevisionAuthor | string,
): string {
  switch (author) {
    case "USER":
      return "Ty";
    case "AUTOMATION":
      return "Automatyzacja";
    case "AI":
      // Stage 2: auto-fixes are BITEK, the user's producer.
      return "BITEK";
    default:
      return author;
  }
}

/** Local timezone display; returns empty string if unparseable (never invents). */
export function formatMixRevisionWhen(iso: string | null | undefined): string {
  if (typeof iso !== "string" || iso.length < 1) return "";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "";
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(ms));
  } catch {
    return "";
  }
}

export function formatMixRevisionDiffValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "tak" : "nie";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return String(value);
    // Preserve meaningful precision; avoid noisy float tails.
    const rounded = Math.round(value * 1000) / 1000;
    return Object.is(rounded, -0) ? "0" : String(rounded);
  }
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "[obiekt]";
    }
  }
  return String(value);
}

export function mixRevisionDiffPathLabel(path: string): string {
  if (path === "project.masterGainDb") return "Master · głośność (dB)";
  if (path === "project.masterPan") return "Master · panorama";
  if (path === "project.masterFxChain") return "Master · efekty";
  const track = /^tracks\.([^.]+)\.(gainDb|pan|muted|solo|effectsChain)$/.exec(
    path,
  );
  if (track) {
    const field =
      track[2] === "gainDb"
        ? "głośność (dB)"
        : track[2] === "pan"
          ? "panorama"
          : track[2] === "muted"
            ? "mute"
            : track[2] === "solo"
              ? "solo"
              : "efekty";
    return `Ścieżka ${track[1]} · ${field}`;
  }
  return path;
}

export type MixRevisionDiffGroupId = "master" | "tracks" | "other";

export function groupMixRevisionDiffChanges(
  changes: MixWorkingRevisionDiff["changes"],
): Array<{
  group: MixRevisionDiffGroupId;
  label: string;
  changes: MixWorkingRevisionDiff["changes"];
}> {
  const master: MixWorkingRevisionDiff["changes"] = [];
  const tracks: MixWorkingRevisionDiff["changes"] = [];
  const other: MixWorkingRevisionDiff["changes"] = [];
  for (const change of changes) {
    if (change.path.startsWith("project.")) master.push(change);
    else if (change.path.startsWith("tracks.")) tracks.push(change);
    else other.push(change);
  }
  const out: Array<{
    group: MixRevisionDiffGroupId;
    label: string;
    changes: MixWorkingRevisionDiff["changes"];
  }> = [];
  if (master.length) out.push({ group: "master", label: "Master", changes: master });
  if (tracks.length) out.push({ group: "tracks", label: "Ścieżki", changes: tracks });
  if (other.length) out.push({ group: "other", label: "Inne", changes: other });
  return out;
}

function mapHttpFailure(input: {
  httpStatus: number;
  code?: unknown;
  error?: unknown;
  network?: boolean;
}): MixRevisionApiFailure {
  if (input.network) {
    return {
      ok: false,
      httpStatus: 0,
      code: null,
      message: "Brak połączenia. Sprawdź sieć i spróbuj ponownie.",
      kind: "network",
    };
  }
  const code = typeof input.code === "string" ? input.code : null;
  const raw =
    typeof input.error === "string" && input.error.length > 0
      ? input.error
      : "Operacja historii miksu nie powiodła się.";

  if (input.httpStatus === 401 || code === "UNAUTHENTICATED") {
    return {
      ok: false,
      httpStatus: input.httpStatus,
      code,
      message: "Musisz być zalogowany, aby przeglądać historię miksu.",
      kind: "unauthenticated",
    };
  }
  if (input.httpStatus === 403) {
    return {
      ok: false,
      httpStatus: input.httpStatus,
      code,
      message: "Brak uprawnień do tej historii miksu.",
      kind: "forbidden",
    };
  }
  if (code === "REVISION_NOT_FOUND" || input.httpStatus === 404) {
    return {
      ok: false,
      httpStatus: input.httpStatus,
      code: code ?? "NOT_FOUND",
      message: "Nie znaleziono rewizji lub projektu.",
      kind: "not_found",
    };
  }
  if (code === "FX_CHAIN_VERSION_CONFLICT") {
    return {
      ok: false,
      httpStatus: input.httpStatus,
      code,
      message:
        "Dokument miksu zmienił się od czasu rozpoczęcia operacji. Odśwież stan projektu i potwierdź przywrócenie ponownie.",
      kind: "conflict_cas",
    };
  }
  if (code === "IDEMPOTENCY_KEY_REUSE") {
    return {
      ok: false,
      httpStatus: input.httpStatus,
      code,
      message:
        "To żądanie zostało już użyte z innymi danymi. Nie wykonano kolejnej mutacji.",
      kind: "idempotency_reuse",
    };
  }
  if (code === "REVISION_INVALID") {
    const tipMatch =
      /matches tip mix plane|no ops|brak zmian/i.test(raw) ||
      raw.includes("Restore target matches tip");
    return {
      ok: false,
      httpStatus: input.httpStatus,
      code,
      message: tipMatch
        ? "Wybrana rewizja odpowiada już bieżącemu stanowi miksu — brak zmian do przywrócenia."
        : "Rewizja jest nieprawidłowa lub nie może być użyta do tej operacji.",
      kind: "revision_invalid",
    };
  }
  if (
    code === "INVALID_REQUEST" ||
    code === "FORBIDDEN_OP" ||
    code === "REVISION_COMPARE_INVALID" ||
    input.httpStatus === 400
  ) {
    return {
      ok: false,
      httpStatus: input.httpStatus,
      code,
      message: raw,
      kind: "validation",
    };
  }
  return {
    ok: false,
    httpStatus: input.httpStatus,
    code,
    message: raw,
    kind: "unknown",
  };
}

export function mapMixRevisionListHttpResult(input: {
  httpStatus: number;
  json: unknown;
  network?: boolean;
}): MixRevisionListSuccess | MixRevisionApiFailure {
  if (input.network) return mapHttpFailure({ httpStatus: 0, network: true });
  const json = (input.json ?? {}) as Record<string, unknown>;
  if (input.httpStatus >= 200 && input.httpStatus < 300 && json.success === true) {
    const revisions = Array.isArray(json.revisions)
      ? (json.revisions as MixRevisionListItem[])
      : [];
    return {
      ok: true,
      revisions,
      nextCursor:
        typeof json.nextCursor === "string" ? json.nextCursor : null,
    };
  }
  return mapHttpFailure({
    httpStatus: input.httpStatus,
    code: json.code,
    error: json.error,
  });
}

export function mapMixRevisionDetailHttpResult(input: {
  httpStatus: number;
  json: unknown;
  network?: boolean;
}): MixRevisionDetailSuccess | MixRevisionApiFailure {
  if (input.network) return mapHttpFailure({ httpStatus: 0, network: true });
  const json = (input.json ?? {}) as Record<string, unknown>;
  if (
    input.httpStatus >= 200 &&
    input.httpStatus < 300 &&
    json.success === true &&
    json.revision &&
    typeof json.revision === "object"
  ) {
    return { ok: true, revision: json.revision as MixRevision };
  }
  return mapHttpFailure({
    httpStatus: input.httpStatus,
    code: json.code,
    error: json.error,
  });
}

export function mapMixRevisionCompareHttpResult(input: {
  httpStatus: number;
  json: unknown;
  network?: boolean;
}): MixRevisionCompareSuccess | MixRevisionApiFailure {
  if (input.network) return mapHttpFailure({ httpStatus: 0, network: true });
  const json = (input.json ?? {}) as Record<string, unknown>;
  if (
    input.httpStatus >= 200 &&
    input.httpStatus < 300 &&
    json.success === true &&
    json.diff &&
    typeof json.diff === "object"
  ) {
    return { ok: true, diff: json.diff as MixWorkingRevisionDiff };
  }
  return mapHttpFailure({
    httpStatus: input.httpStatus,
    code: json.code,
    error: json.error,
  });
}

export function mapMixRevisionRestoreHttpResult(input: {
  httpStatus: number;
  json: unknown;
  network?: boolean;
}): MixRevisionRestoreSuccess | MixRevisionApiFailure {
  if (input.network) return mapHttpFailure({ httpStatus: 0, network: true });
  const json = (input.json ?? {}) as Record<string, unknown>;
  if (
    input.httpStatus >= 200 &&
    input.httpStatus < 300 &&
    json.success === true &&
    typeof json.documentVersion === "number" &&
    typeof json.documentDigest === "string"
  ) {
    return {
      ok: true,
      documentVersion: json.documentVersion,
      documentDigest: json.documentDigest,
      replay: Boolean(json.replay),
      revisionId:
        typeof json.revisionId === "string" ? json.revisionId : null,
    };
  }
  return mapHttpFailure({
    httpStatus: input.httpStatus,
    code: json.code,
    error: json.error,
  });
}

export function mapStudioProjectDocumentHttpResult(input: {
  httpStatus: number;
  json: unknown;
  network?: boolean;
}): MixRevisionProjectDocSuccess | MixRevisionApiFailure {
  if (input.network) return mapHttpFailure({ httpStatus: 0, network: true });
  const json = (input.json ?? {}) as Record<string, unknown>;
  if (
    input.httpStatus >= 200 &&
    input.httpStatus < 300 &&
    json.success === true &&
    json.document &&
    typeof json.document === "object"
  ) {
    return { ok: true, document: json.document as StudioProjectDocument };
  }
  return mapHttpFailure({
    httpStatus: input.httpStatus,
    code: json.code,
    error: json.error,
  });
}

/** Tip marker: highest sourceDocumentVersion among loaded list equals tip version. */
export function isLikelyTipRevision(
  item: Pick<MixRevisionListItem, "sourceDocumentVersion">,
  tipDocumentVersion: number,
): boolean {
  return item.sourceDocumentVersion === tipDocumentVersion;
}
