/**
 * Following an E3 job (master, download, YouTube video) from the browser.
 * A dropped connection, a 429 or a 5xx says nothing about the job, so it is never reported as a failure:
 * the loop keeps asking and the caller may show that the connection is gone.
 */

export type StudioJobBody = {
  job?: {
    id?: string;
    status?: string;
    stage?: unknown;
    progress?: unknown;
    metrics?: unknown;
    errorCode?: string | null;
    sourceDocumentVersion?: number | null;
  };
  downloadUrl?: string | null;
  playUrl?: string | null;
  downloadParts?: string[] | null;
  filename?: string | null;
};

export type StudioJobOutcome =
  | { kind: "succeeded"; body: StudioJobBody }
  | { kind: "failed"; code: string; body: StudioJobBody }
  /** No such job for this user: nothing was queued (or the project is gone). */
  | { kind: "missing" }
  | { kind: "signed_out" }
  /** Still queued / running when we stopped waiting. */
  | { kind: "pending" }
  | { kind: "aborted" };

/** The server gives a dead job up after 45 min, so there is no point in waiting longer. */
export const STUDIO_JOB_WAIT_MS = 45 * 60 * 1000;

export type FollowStudioJobOptions = {
  signal?: AbortSignal;
  onUpdate?: (body: StudioJobBody) => void;
  /** false = the last reads failed, true = reads work again. */
  onConnection?: (ok: boolean) => void;
  maxWaitMs?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
};

export function studioJobUrl(projectId: string, jobId: string): string {
  return `/api/studio/projects/${encodeURIComponent(projectId)}/jobs/${encodeURIComponent(jobId)}`;
}

export async function followStudioJob(projectId: string, jobId: string, options: FollowStudioJobOptions = {}): Promise<StudioJobOutcome> {
  const { signal, onUpdate, onConnection } = options;
  const doFetch = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = options.now ?? Date.now;
  const deadline = now() + (options.maxWaitMs ?? STUDIO_JOB_WAIT_MS);
  let errors = 0;
  for (let i = 0; now() < deadline; i++) {
    if (signal?.aborted) return { kind: "aborted" };
    let body: StudioJobBody | null = null;
    try {
      const r = await doFetch(studioJobUrl(projectId, jobId), { cache: "no-store", signal });
      if (r.status === 401) return { kind: "signed_out" };
      if (r.status === 404) return { kind: "missing" };
      if (r.ok) body = (await r.json()) as StudioJobBody;
    } catch {
      body = null;
    }
    if (signal?.aborted) return { kind: "aborted" };
    if (body?.job) {
      if (errors >= 2) onConnection?.(true);
      errors = 0;
      const status = body.job.status;
      if (status === "succeeded") return { kind: "succeeded", body };
      if (status === "failed" || status === "cancelled") return { kind: "failed", code: body.job.errorCode ?? status, body };
      onUpdate?.(body);
      // E3 jobs take ~1 min: every second at first so the bar and the result feel live.
      await sleep(i < 90 ? 1000 : 3000);
    } else {
      errors++;
      if (errors === 2) onConnection?.(false);
      await sleep(Math.min(10_000, 1000 * errors));
    }
  }
  return { kind: "pending" };
}

/** Why a master / download was refused or failed → text key under studio.masterStep.bledy.* */
export type MasterErrorKey =
  | "docChanged" | "referenceInvalid" | "referenceLocked" | "sourceMissing" | "tooLong" | "noAudio"
  | "server" | "network" | "signedOut" | "rateLimited" | "missing" | "notApproved" | "format" | "other";

export function masterErrorKey(code: string | null | undefined): MasterErrorKey {
  const c = (code ?? "").toLowerCase();
  if (c === "doc_changed") return "docChanged";
  if (c === "reference_locked" || c === "addon_missing") return "referenceLocked";
  if (c.startsWith("reference_")) return "referenceInvalid";
  if (c.includes("expired") || c.includes("deleted") || c === "source_missing" || c.includes("take_not_found") || c.includes("source_take")) return "sourceMissing";
  if (c === "too_long") return "tooLong";
  if (c === "no_audio" || c === "silent") return "noAudio";
  if (c === "network") return "network";
  if (c === "signed_out" || c === "login" || c === "unauthenticated") return "signedOut";
  if (c === "rate_limited") return "rateLimited";
  if (c === "not_approved") return "notApproved";
  if (c === "tier_format" || c === "tier_project") return "format";
  if (c === "missing") return "missing";
  if (c === "quota_unavailable" || c === "worker_lost" || c === "internal" || c === "prepare" || c === "input_missing" || c === "upload_failed" || c === "unavailable") return "server";
  return "other";
}

/** A refused request (no job behind it): the status decides when the body has no code of ours. */
export function refusalCode(status: number, error: unknown): string {
  if (status === 401) return "signed_out";
  if (typeof error === "string" && /^[a-z_]+$/.test(error)) return error;
  if (status === 429) return "rate_limited";
  if (status >= 500) return "internal";
  return "commit";
}
