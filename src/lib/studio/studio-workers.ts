/**
 * Studio Web Workers — prebuilt by scripts/build-studio-workers.mjs into
 * public/workers/<name>.<hash>.js (URLs injected via next.config `env`).
 * Turbopack does not bundle `new Worker(new URL("./x.worker.ts", import.meta.url))`.
 *
 * `spawnStudioWorker` resolves only after the worker script loaded and posted
 * `{ type: "ready" }`, so callers can fall back to the main thread before any
 * buffers are transferred. Resolves null when workers are unavailable.
 */

export const STUDIO_WORKER_READY = "ready";

export type StudioWorkerName = "master" | "mixAnalysis";

/** Must stay literal `process.env.NEXT_PUBLIC_…` reads so Next can inline them. */
export function studioWorkerUrl(name: StudioWorkerName): string {
  const url =
    name === "master"
      ? process.env.NEXT_PUBLIC_STUDIO_MASTER_WORKER_URL
      : process.env.NEXT_PUBLIC_STUDIO_MIX_ANALYSIS_WORKER_URL;
  return url ?? "";
}

/** Time allowed for the worker script to load and report ready. */
export const STUDIO_WORKER_READY_TIMEOUT_MS = 10000;

const broken = new Set<StudioWorkerName>();

/** Test hook. */
export function resetStudioWorkersForTests() {
  broken.clear();
}

export function spawnStudioWorker(
  name: StudioWorkerName,
  opts: { timeoutMs?: number; create?: (url: string) => Worker } = {},
): Promise<Worker | null> {
  const url = studioWorkerUrl(name);
  if (!url || broken.has(name) || (!opts.create && typeof Worker === "undefined")) return Promise.resolve(null);
  return new Promise((resolve) => {
    let worker: Worker;
    try {
      worker = opts.create ? opts.create(url) : new Worker(url, { type: "module" });
    } catch {
      broken.add(name);
      resolve(null);
      return;
    }
    const fail = () => {
      clearTimeout(timer);
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
      broken.add(name);
      resolve(null);
    };
    const timer = setTimeout(fail, opts.timeoutMs ?? STUDIO_WORKER_READY_TIMEOUT_MS);
    worker.onerror = (event) => {
      event.preventDefault?.();
      fail();
    };
    worker.onmessage = (event: MessageEvent<{ type?: string }>) => {
      if (event.data?.type !== STUDIO_WORKER_READY) return;
      clearTimeout(timer);
      worker.onmessage = null;
      worker.onerror = null;
      resolve(worker);
    };
  });
}
