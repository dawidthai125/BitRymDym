/**
 * Studio Final Mix Export — client helpers (Stage I).
 * Pure mapping / request builders; no auto-enqueue.
 */

import {
  isStudioExportPublicErrorCode,
  studioExportPublicErrorMessage,
} from "@/lib/audio/studio-export-failure-contract";

export type StudioExportUiPhase =
  | "IDLE"
  | "SUBMITTING"
  | "QUEUED"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED"
  | "CONFLICT"
  | "UNAVAILABLE";

export type StudioExportJobStatus =
  | "QUEUED"
  | "CLAIMED"
  | "RUNNING"
  | "UPLOADING"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELLED"
  | "TIMEOUT";

const TERMINAL_STATUSES = new Set<string>([
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
  "TIMEOUT",
]);

const ACTIVE_STATUSES = new Set<string>([
  "QUEUED",
  "CLAIMED",
  "RUNNING",
  "UPLOADING",
]);

export function isStudioExportTerminalStatus(status: string | null | undefined): boolean {
  return typeof status === "string" && TERMINAL_STATUSES.has(status);
}

export function isStudioExportActiveStatus(status: string | null | undefined): boolean {
  return typeof status === "string" && ACTIVE_STATUSES.has(status);
}

export function mapJobStatusToUiPhase(
  status: string | null | undefined,
): StudioExportUiPhase {
  switch (status) {
    case "QUEUED":
      return "QUEUED";
    case "CLAIMED":
    case "RUNNING":
    case "UPLOADING":
      return "RUNNING";
    case "SUCCEEDED":
      return "SUCCEEDED";
    case "FAILED":
    case "CANCELLED":
    case "TIMEOUT":
      return "FAILED";
    default:
      return "UNAVAILABLE";
  }
}

export function createStudioExportIdempotencyKey(input: {
  projectId: string;
  documentVersion: number;
  attemptId: string;
}): string {
  return `studio-export:${input.projectId}:${input.documentVersion}:${input.attemptId}`;
}

export function studioExportEnqueueUrl(projectId: string): string {
  return `/api/studio/projects/${encodeURIComponent(projectId)}/export`;
}

export function studioExportStatusUrl(projectId: string, jobId: string): string {
  return `/api/studio/projects/${encodeURIComponent(projectId)}/export?jobId=${encodeURIComponent(jobId)}`;
}

/** I.45AU — GET latest own STUDIO_EXPORT for project (no jobId; read-only). */
export function studioExportLatestStatusUrl(projectId: string): string {
  return `/api/studio/projects/${encodeURIComponent(projectId)}/export`;
}

/**
 * OD-SFM-ID-06 UI wire — download route from trusted server `sfmVersionId` only.
 * - Non-empty sfmVersionId → SFM route (OD-SFM-ID-01).
 * - Null / absent / empty → mix route (LEGACY_STUDIO pre-cutover; never invent SFM).
 * Never classify by projectId, filename, or client guesses. E3/MIX and TAKE do not use this helper.
 */
export function studioExportArtifactDownloadUrl(
  artifactId: string,
  options?: { sfmVersionId?: string | null },
): string {
  const id = encodeURIComponent(artifactId);
  if (
    typeof options?.sfmVersionId === "string" &&
    options.sfmVersionId.length > 0
  ) {
    return `/api/studio/artifacts/${id}/download`;
  }
  return `/api/mix/artifacts/${id}/download`;
}

/** Trusted sfm_version_id from export status — never invent from projectId / filename. */
export function parseStudioExportSfmVersionId(
  value: unknown,
): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export type StudioExportDownloadMappedResult =
  | { ok: true; url: string }
  | { ok: false; httpStatus: number; message: string };

/**
 * Map download JSON — AuthZ errors stay failures; missing url is never success.
 * Does not invent signed URLs or bypass the download route.
 */
export function mapStudioExportDownloadHttpResult(input: {
  httpStatus: number;
  json: { success?: boolean; url?: string; error?: string };
}): StudioExportDownloadMappedResult {
  if (input.httpStatus === 401) {
    return {
      ok: false,
      httpStatus: 401,
      message: "Zaloguj się, aby pobrać eksport.",
    };
  }
  if (input.httpStatus === 403) {
    return {
      ok: false,
      httpStatus: 403,
      message: "Brak uprawnień do pobrania tego artefaktu.",
    };
  }
  if (input.httpStatus === 404) {
    return {
      ok: false,
      httpStatus: 404,
      message: "Artefakt nie został znaleziony.",
    };
  }

  const url =
    typeof input.json.url === "string" && input.json.url.length > 0
      ? input.json.url
      : null;
  if (input.httpStatus >= 200 && input.httpStatus < 300 && url) {
    return { ok: true, url };
  }

  return {
    ok: false,
    httpStatus: input.httpStatus,
    message:
      typeof input.json.error === "string" && input.json.error.length > 0
        ? input.json.error
        : "Pobieranie niedostępne.",
  };
}

export type StudioExportApiPayload = {
  success?: boolean;
  /** I.45AU latest GET: false when owner has no STUDIO_EXPORT for the project. */
  found?: boolean;
  jobId?: string;
  projectId?: string;
  status?: string;
  artifactId?: string | null;
  /**
   * Trusted DB `audio_artifacts.sfm_version_id` when artifact present.
   * Null for LEGACY_STUDIO (project_id set, no SFM version) — never invent.
   */
  sfmVersionId?: string | null;
  /** I.17 — allowlisted public failure code from status GET. */
  errorCode?: string | null;
  /** I.17 — safe public message; client re-derives from code (does not trust raw). */
  errorMessage?: string | null;
  code?: string;
  error?: string;
};

export type StudioExportMappedResult =
  | {
      ok: true;
      phase: StudioExportUiPhase;
      jobId: string;
      projectId: string;
      status: string;
      artifactId: string | null;
      /** Trusted from status payload — null means not SFM (do not invent). */
      sfmVersionId: string | null;
      errorCode: string | null;
      message: string | null;
    }
  | {
      ok: false;
      phase: StudioExportUiPhase;
      httpStatus: number;
      code?: string;
      message: string;
      ambiguousNetwork?: boolean;
    };

function resolvePublicFailureFromPayload(json: StudioExportApiPayload): {
  errorCode: string | null;
  message: string | null;
} {
  const raw =
    typeof json.errorCode === "string" && json.errorCode.length > 0
      ? json.errorCode
      : null;
  if (!raw) {
    return { errorCode: null, message: null };
  }
  const errorCode = isStudioExportPublicErrorCode(raw) ? raw : "ENCODE_FAILED";
  return {
    errorCode,
    message: studioExportPublicErrorMessage(errorCode),
  };
}

export function mapStudioExportHttpResult(input: {
  httpStatus: number;
  json: StudioExportApiPayload;
  networkError?: boolean;
}): StudioExportMappedResult {
  if (input.networkError) {
    return {
      ok: false,
      phase: "UNAVAILABLE",
      httpStatus: 0,
      message: "Połączenie przerwane. Sprawdź status przed ponowieniem.",
      ambiguousNetwork: true,
    };
  }

  const { httpStatus, json } = input;

  if (httpStatus === 401 || httpStatus === 403) {
    return {
      ok: false,
      phase: "FAILED",
      httpStatus,
      code: json.code,
      message:
        httpStatus === 401
          ? "Zaloguj się, aby eksportować projekt."
          : "Brak uprawnień do eksportu tego projektu.",
    };
  }

  if (httpStatus === 404) {
    return {
      ok: false,
      phase: "FAILED",
      httpStatus,
      code: json.code,
      message: "Projekt lub zadanie eksportu nie zostało znalezione.",
    };
  }

  if (httpStatus === 409 && json.code === "CONFLICT") {
    return {
      ok: false,
      phase: "CONFLICT",
      httpStatus,
      code: "CONFLICT",
      message:
        "Dokument Studio zmienił się. Odśwież projekt i uruchom eksport ponownie.",
    };
  }

  if (httpStatus === 409) {
    return {
      ok: false,
      phase: "FAILED",
      httpStatus,
      code: json.code,
      message: "Eksport niedostępny (limit lub konflikt). Spróbuj później.",
    };
  }

  if (httpStatus === 503 || json.code === "DISABLED") {
    return {
      ok: false,
      phase: "UNAVAILABLE",
      httpStatus,
      code: json.code,
      message: "Eksport jest obecnie niedostępny.",
    };
  }

  if (!json.success || !json.jobId || !json.status) {
    return {
      ok: false,
      phase: httpStatus >= 400 ? "FAILED" : "UNAVAILABLE",
      httpStatus,
      code: json.code,
      message: "Nie udało się uruchomić eksportu. Spróbuj ponownie.",
    };
  }

  const phase = mapJobStatusToUiPhase(json.status);
  const failure =
    phase === "FAILED"
      ? resolvePublicFailureFromPayload(json)
      : { errorCode: null, message: null };
  return {
    ok: true,
    phase,
    jobId: json.jobId,
    projectId: typeof json.projectId === "string" ? json.projectId : "",
    status: json.status,
    artifactId: typeof json.artifactId === "string" ? json.artifactId : null,
    sfmVersionId: parseStudioExportSfmVersionId(json.sfmVersionId),
    errorCode: failure.errorCode,
    message: failure.message,
  };
}

export type StudioExportLatestMappedResult =
  | {
      ok: true;
      empty: true;
      projectId: string;
    }
  | {
      ok: true;
      empty: false;
      phase: StudioExportUiPhase;
      jobId: string;
      projectId: string;
      status: string;
      artifactId: string | null;
      sfmVersionId: string | null;
      /** I.17 — forwarded from mapStudioExportHttpResult when FAILED. */
      errorCode: string | null;
      message: string | null;
    }
  | Extract<StudioExportMappedResult, { ok: false }>;

/**
 * I.45AU — map GET latest (no jobId). Empty found=false → IDLE recovery, not enqueue.
 * Forwards I.17 allowlisted failure fields when a job is present.
 */
export function mapStudioExportLatestHttpResult(input: {
  httpStatus: number;
  json: StudioExportApiPayload;
  networkError?: boolean;
}): StudioExportLatestMappedResult {
  if (input.networkError) {
    return {
      ok: false,
      phase: "UNAVAILABLE",
      httpStatus: 0,
      message: "Połączenie przerwane. Sprawdź status przed ponowieniem.",
      ambiguousNetwork: true,
    };
  }

  const { httpStatus, json } = input;

  if (httpStatus === 401 || httpStatus === 403) {
    return {
      ok: false,
      phase: "FAILED",
      httpStatus,
      code: json.code,
      message:
        httpStatus === 401
          ? "Zaloguj się, aby eksportować projekt."
          : "Brak uprawnień do eksportu tego projektu.",
    };
  }

  if (httpStatus === 404) {
    return {
      ok: false,
      phase: "FAILED",
      httpStatus,
      code: json.code,
      message: "Projekt lub zadanie eksportu nie zostało znalezione.",
    };
  }

  if (httpStatus === 503 || json.code === "DISABLED") {
    return {
      ok: false,
      phase: "UNAVAILABLE",
      httpStatus,
      code: json.code,
      message: "Eksport jest obecnie niedostępny.",
    };
  }

  if (json.success === true && json.found === false) {
    return {
      ok: true,
      empty: true,
      projectId: typeof json.projectId === "string" ? json.projectId : "",
    };
  }

  const mapped = mapStudioExportHttpResult(input);
  if (!mapped.ok) return mapped;
  return {
    ok: true,
    empty: false,
    phase: mapped.phase,
    jobId: mapped.jobId,
    projectId: mapped.projectId,
    status: mapped.status,
    artifactId: mapped.artifactId,
    sfmVersionId: mapped.sfmVersionId,
    errorCode: mapped.errorCode,
    message: mapped.message,
  };
}

/** User-facing phase labels (Polish). */
export function studioExportPhaseLabel(phase: StudioExportUiPhase): string {
  switch (phase) {
    case "IDLE":
      return "Gotowy do eksportu";
    case "SUBMITTING":
      return "Wysyłanie żądania…";
    case "QUEUED":
      return "W kolejce";
    case "RUNNING":
      return "Eksport w toku";
    case "SUCCEEDED":
      return "Eksport gotowy";
    case "FAILED":
      return "Eksport nie powiódł się";
    case "CONFLICT":
      return "Konflikt wersji dokumentu";
    case "UNAVAILABLE":
      return "Status niedostępny";
  }
}

export const STUDIO_EXPORT_POLL_INTERVAL_MS = 1500;
export const STUDIO_EXPORT_POLL_MAX_ATTEMPTS = 40;

/** Phone / preview MP3 — lowest SFM quality on every paid plan (BRONZE+). */
export const SFM_PHONE_MP3_QUALITY = "MP3_128" as const;

export function sfmVersionStatusUrl(versionId: string): string {
  return `/api/studio/final/versions/${encodeURIComponent(versionId)}`;
}

export function sfmVersionGrantUrl(versionId: string): string {
  return `/api/studio/final/versions/${encodeURIComponent(versionId)}/grants`;
}

export function sfmVersionEncodeUrl(versionId: string): string {
  return `/api/studio/final/versions/${encodeURIComponent(versionId)}/encode`;
}

export function sfmVersionJobStatusUrl(versionId: string, jobId: string): string {
  return `/api/studio/final/versions/${encodeURIComponent(versionId)}/jobs/${encodeURIComponent(jobId)}`;
}

export function createSfmQualityEncodeIdempotencyKey(input: {
  versionId: string;
  quality: string;
  projectId: string;
}): string {
  return `sfm-encode:${input.versionId}:${input.quality}:${input.projectId}`;
}

export type SfmVersionStatusPayload = {
  success?: boolean;
  status?: string;
  currentArtifacts?: Array<{
    artifactId?: string;
    quality?: string;
    status?: string;
    isCurrent?: boolean;
  }>;
  error?: string;
  code?: string;
};

/** Find current READY artifact for a quality on a version status payload. */
export function findSfmCurrentQualityArtifactId(
  payload: SfmVersionStatusPayload,
  quality: string,
): string | null {
  const rows = Array.isArray(payload.currentArtifacts)
    ? payload.currentArtifacts
    : [];
  for (const row of rows) {
    if (
      row?.quality === quality &&
      row?.isCurrent === true &&
      row?.status === "READY" &&
      typeof row.artifactId === "string" &&
      row.artifactId.length > 0
    ) {
      return row.artifactId;
    }
  }
  return null;
}

export type SfmEncodeMappedError = {
  ok: false;
  httpStatus: number;
  code: string | null;
  message: string;
};

/** Map SFM grant/encode/status HTTP errors to safe UI copy (no SQL). */
export function mapSfmEncodeHttpError(input: {
  httpStatus: number;
  json: { error?: string; code?: string };
  fallback: string;
}): SfmEncodeMappedError {
  const code =
    typeof input.json.code === "string" && input.json.code.length > 0
      ? input.json.code
      : null;
  if (input.httpStatus === 401) {
    return {
      ok: false,
      httpStatus: 401,
      code,
      message: "Zaloguj się, aby pobrać MP3.",
    };
  }
  if (input.httpStatus === 503 || code === "DISABLED") {
    return {
      ok: false,
      httpStatus: input.httpStatus,
      code: code ?? "DISABLED",
      message: "Eksport MP3 Final Mix jest wyłączony.",
    };
  }
  if (code === "NOT_ELIGIBLE" || input.httpStatus === 403) {
    const byCode: Record<string, string> = {
      NOT_ELIGIBLE:
        "Wersja Final Mix nie jest jeszcze gotowa do MP3 (Master SFM musi się udać).",
      NO_GRANT: "Brak uprawnienia do pobrania MP3 dla tej wersji.",
      FREE_NO_DOWNLOAD: "Plan Free nie obejmuje pobierania MP3.",
      PLAN_DENIED: "Twój plan nie obejmuje tego formatu MP3.",
      QUALITY_DENIED: "Ten format MP3 nie jest w Twoim uprawnieniu.",
      DOWNGRADE_NEW_QUALITY:
        "Ten format MP3 nie był w uprawnieniu przy pierwszym pobraniu.",
    };
    return {
      ok: false,
      httpStatus: input.httpStatus,
      code,
      message:
        (code && byCode[code]) ||
        (typeof input.json.error === "string" && input.json.error.length > 0
          ? input.json.error
          : input.fallback),
    };
  }
  if (input.httpStatus === 409) {
    return {
      ok: false,
      httpStatus: 409,
      code,
      message:
        code === "LIMIT_EXCEEDED"
          ? "Wykorzystano dzienny limit pierwszego pobrania Final Mix."
          : input.fallback,
    };
  }
  return {
    ok: false,
    httpStatus: input.httpStatus,
    code,
    message:
      typeof input.json.error === "string" && input.json.error.length > 0
        ? input.json.error
        : input.fallback,
  };
}
