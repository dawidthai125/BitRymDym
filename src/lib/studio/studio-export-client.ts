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

export function studioExportArtifactDownloadUrl(artifactId: string): string {
  return `/api/mix/artifacts/${encodeURIComponent(artifactId)}/download`;
}

export type StudioExportApiPayload = {
  success?: boolean;
  /** I.45AU latest GET: false when owner has no STUDIO_EXPORT for the project. */
  found?: boolean;
  jobId?: string;
  projectId?: string;
  status?: string;
  artifactId?: string | null;
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
