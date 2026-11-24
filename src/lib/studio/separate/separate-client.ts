/** Separator page → API (client only). */
export type StemName = "vocals" | "drums" | "bass" | "other";

export type SeparateJob = {
  id: string;
  status: "queued" | "running" | "succeeded" | "failed";
  errorCode: string | null;
  stems: Partial<Record<StemName, string>> | null;
};

export type SeparateJobResult = { ok: true; job: SeparateJob | null } | { ok: false; reason: "off" | "signedOut" | "error" };

/** Latest job of the project. A failed read is not "no job". */
export async function fetchSeparateJob(projectId: string): Promise<SeparateJobResult> {
  try {
    const res = await fetch(`/api/studio/separate?projectId=${encodeURIComponent(projectId)}`, { cache: "no-store" });
    if (res.status === 503) return { ok: false, reason: "off" };
    if (res.status === 401) return { ok: false, reason: "signedOut" };
    if (!res.ok) return { ok: false, reason: "error" };
    const json = (await res.json()) as { job?: SeparateJob | null };
    return { ok: true, job: json.job ?? null };
  } catch {
    return { ok: false, reason: "error" };
  }
}

export const SEPARATE_POLL_MS = 4000;
const SEPARATE_POLL_MAX_MS = 30_000;

/** Wait before the next check: 4 s while answers come, longer after each failure in a row. Null: stop asking. */
export function nextSeparatePollMs(result: SeparateJobResult, failures: number): number | null {
  if (result.ok) {
    const status = result.job?.status;
    return status === "queued" || status === "running" ? SEPARATE_POLL_MS : null;
  }
  if (result.reason === "signedOut") return null;
  return Math.min(SEPARATE_POLL_MAX_MS, SEPARATE_POLL_MS * 2 ** Math.min(failures, 4));
}

/** Saves one stem with a fresh address: signed links live 10 minutes and an old one opens an error page. */
export async function saveSeparateStem(projectId: string, name: StemName): Promise<boolean> {
  const result = await fetchSeparateJob(projectId);
  const url = result.ok ? result.job?.stems?.[name] : undefined;
  if (!url) return false;
  const link = document.createElement("a");
  link.href = url;
  link.rel = "noopener";
  link.download = "";
  link.click();
  return true;
}
