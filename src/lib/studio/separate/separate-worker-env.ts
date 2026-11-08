import path from "node:path";

/** Kill switch for the host stem worker. The web app does not read this. */
export type SeparatorWorkerConfig =
  | { action: "exit_disabled"; reason: string }
  | { action: "run"; python: string; scriptPath: string; pollMs: number; timeoutMs: number; workerRef: string };

const TRUE = new Set(["true", "1", "yes", "on"]);
export const STEM_NAMES = ["vocals", "drums", "bass", "other"] as const;
export type StemName = (typeof STEM_NAMES)[number];
export const SEPARATE_MAX_BYTES = 52_428_800;

export function decideSeparatorWorker(
  env: Record<string, string | undefined>,
  pid: number,
  cwd = process.cwd(),
): SeparatorWorkerConfig {
  if (!TRUE.has((env.SEPARATOR_ENABLED ?? "").trim().toLowerCase())) {
    return { action: "exit_disabled", reason: "SEPARATOR_ENABLED not true" };
  }
  const python = (env.DEMUCS_PYTHON ?? "").trim();
  if (!python) return { action: "exit_disabled", reason: "DEMUCS_PYTHON missing" };
  const poll = Number(env.SEPARATOR_POLL_MS ?? "4000");
  const timeout = Number(env.SEPARATOR_TIMEOUT_MS ?? "1200000");
  return {
    action: "run",
    python,
    scriptPath: path.join(cwd, "scripts", "studio", "separate_stems.py"),
    pollMs: Number.isFinite(poll) && poll >= 1000 ? poll : 4000,
    timeoutMs: Number.isFinite(timeout) && timeout >= 60_000 ? timeout : 1_200_000,
    workerRef: (env.SEPARATOR_WORKER_REF ?? "").trim() || `studio-separate-${pid}`,
  };
}

/** htdemucs writes outdir/htdemucs/<input base>/<stem>.wav */
export function demucsStemFile(outdir: string, inputBase: string, stem: StemName): string {
  return path.join(outdir, "htdemucs", inputBase, `${stem}.wav`);
}

export function separateObjectKey(ownerId: string, jobId: string, stem: StemName, ext: "wav" | "flac" = "wav"): string {
  return `separate/${ownerId}/${jobId}/${stem}.${ext}`;
}

/** Extension of the project audio object. Never a path. */
export function separateSourceExt(key: string): string {
  const base = key.split("/").pop() ?? "";
  const match = /\.([a-z0-9]{1,8})$/i.exec(base);
  const ext = match?.[1]?.toLowerCase() ?? "bin";
  return /^[a-z0-9]+$/.test(ext) ? ext : "bin";
}
