/**
 * Studio recording P0 — latency calibration (pure, browser-free).
 *
 * Round trip = what the singer hears (output) + what the mic needs to deliver
 * (input) + MediaRecorder start bias. Measured end-to-end through the same
 * TakeMediaRecorder the takes use, so the measured value is exactly the shift
 * to apply when placing a take on the timeline.
 */

export const LATENCY_HIGH_WARN_MS = 40;
export const LATENCY_MIN_MS = -60;
export const LATENCY_MAX_MS = 700;
export const MANUAL_OFFSET_MIN_MS = -150;
export const MANUAL_OFFSET_MAX_MS = 300;
/** Unknown hardware/OS overhead added to the AudioContext estimate. */
export const CONTEXT_ESTIMATE_PAD_MS = 10;

export type OnsetWindow = { beforeMs: number; afterMs: number };

export const CLICK_CALIBRATION = {
  count: 8,
  firstMs: 600,
  spacingMs: 750,
  window: { beforeMs: 40, afterMs: 650 } as OnsetWindow,
  maxSpreadMs: 6,
  minValidRatio: 0.6,
} as const;

export const CLAP_CALIBRATION = {
  /** First `leadIn` clicks are just for locking in; claps measured after. */
  leadIn: 4,
  count: 12,
  firstMs: 800,
  spacingMs: 600,
  window: { beforeMs: 200, afterMs: 380 } as OnsetWindow,
  maxSpreadMs: 30,
  minValidRatio: 0.5,
} as const;

export function calibrationClickTimesMs(
  count: number,
  firstMs: number,
  spacingMs: number,
): number[] {
  return Array.from({ length: count }, (_, i) => firstMs + i * spacingMs);
}

/** Short broadband click (decaying burst) — easy to detect, ~4 ms. */
export function renderCalibrationClick(
  sampleRate: number,
  amplitude = 0.6,
): Float32Array<ArrayBuffer> {
  const n = Math.max(8, Math.round(sampleRate * 0.004));
  const out = new Float32Array(n);
  let seed = 1234567;
  for (let i = 0; i < n; i += 1) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const noise = (seed / 0x7fffffff) * 2 - 1;
    const env = Math.exp((-6 * i) / n);
    out[i] = amplitude * env * (i < 2 ? 1 : noise);
  }
  return out;
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** Median absolute deviation (robust spread). */
export function medianAbsDeviation(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN;
  const m = median(values);
  return median(values.map((v) => Math.abs(v - m)));
}

/**
 * Find the first strong onset near each expected time.
 * Returns onset times in ms (recording timebase) or null when nothing was heard.
 */
export function detectOnsetsNear(
  samples: Float32Array,
  sampleRate: number,
  expectedMs: readonly number[],
  window: OnsetWindow,
): Array<number | null> {
  const msToIdx = (ms: number) => Math.round((ms * sampleRate) / 1000);
  const firstExpected = expectedMs.length ? Math.min(...expectedMs) : 0;
  const noiseEnd = Math.max(
    0,
    Math.min(samples.length, msToIdx(firstExpected - window.beforeMs - 20)),
  );
  // Robust noise floor: 90th percentile of |x| in the lead-in.
  let noise = 0;
  if (noiseEnd > 16) {
    const lead = Array.from(samples.subarray(0, noiseEnd), Math.abs).sort(
      (a, b) => a - b,
    );
    noise = lead[Math.floor(lead.length * 0.9)] ?? 0;
  }
  return expectedMs.map((e) => {
    const a = Math.max(0, msToIdx(e - window.beforeMs));
    const b = Math.min(samples.length, msToIdx(e + window.afterMs));
    if (b - a < 4) return null;
    let peak = 0;
    for (let i = a; i < b; i += 1) {
      const v = Math.abs(samples[i]!);
      if (v > peak) peak = v;
    }
    if (peak < Math.max(noise * 6, 0.004)) return null;
    const threshold = Math.max(noise * 4, peak * 0.3);
    for (let i = a; i < b; i += 1) {
      if (Math.abs(samples[i]!) >= threshold) {
        return (i * 1000) / sampleRate;
      }
    }
    return null;
  });
}

export type LatencyMeasureFailure = "NO_SIGNAL" | "TOO_FEW" | "UNSTABLE";

export type LatencyMeasurement =
  | {
      ok: true;
      latencyMs: number;
      spreadMs: number;
      detected: number;
      total: number;
    }
  | {
      ok: false;
      reason: LatencyMeasureFailure;
      detected: number;
      total: number;
      latencyMs?: number;
      spreadMs?: number;
    };

/** Measure the median lag of onsets vs expected times. */
export function measureLatency(
  samples: Float32Array,
  sampleRate: number,
  expectedMs: readonly number[],
  opts: { window: OnsetWindow; maxSpreadMs: number; minValidRatio: number },
): LatencyMeasurement {
  const onsets = detectOnsetsNear(samples, sampleRate, expectedMs, opts.window);
  const lags: number[] = [];
  onsets.forEach((o, i) => {
    if (o != null) lags.push(o - expectedMs[i]!);
  });
  const total = expectedMs.length;
  if (lags.length === 0) {
    return { ok: false, reason: "NO_SIGNAL", detected: 0, total };
  }
  if (lags.length < Math.ceil(total * opts.minValidRatio)) {
    return { ok: false, reason: "TOO_FEW", detected: lags.length, total };
  }
  // Drop outliers further than 3×MAD (min 3 ms) from the median.
  const m0 = median(lags);
  const mad0 = Math.max(3, medianAbsDeviation(lags));
  const kept = lags.filter((l) => Math.abs(l - m0) <= mad0 * 3);
  const latencyMs = Math.round(median(kept) * 10) / 10;
  const spreadMs = Math.round(medianAbsDeviation(kept) * 10) / 10;
  if (
    kept.length < Math.ceil(total * opts.minValidRatio) ||
    spreadMs > opts.maxSpreadMs ||
    latencyMs < LATENCY_MIN_MS ||
    latencyMs > LATENCY_MAX_MS
  ) {
    return {
      ok: false,
      reason: "UNSTABLE",
      detected: kept.length,
      total,
      latencyMs,
      spreadMs,
    };
  }
  return { ok: true, latencyMs, spreadMs, detected: kept.length, total };
}

// ── Device profiles ─────────────────────────────────────────────────────────

export type LatencyMethod = "click" | "clap" | "manual";

export type LatencyProfile = {
  deviceKey: string;
  /** Measured round trip (ms); null = not calibrated (estimate is used). */
  roundTripMs: number | null;
  /** User fine-tune added on top (ms). */
  manualOffsetMs: number;
  method: LatencyMethod;
  spreadMs: number | null;
  updatedAt: string;
};

function normLabel(label: string | null | undefined): string {
  return (label ?? "")
    .toLowerCase()
    .replace(/\(([0-9a-f]{4}:[0-9a-f]{4})\)/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

/** Stable per-device key: input + output labels (deviceIds rotate per origin). */
export function latencyDeviceKey(params: {
  inputLabel?: string | null;
  outputLabel?: string | null;
}): string {
  const i = normLabel(params.inputLabel) || "default-in";
  const o = normLabel(params.outputLabel) || "default-out";
  return `${i}|${o}`.slice(0, 160);
}

const BLUETOOTH_RE =
  /bluetooth|airpods|\bbuds\b|galaxy buds|hands[- ]?free|\bhfp\b|\ba2dp\b|wh-1000|wf-1000|\bjbl\b|beats|\bbose\b|soundcore|\bbt\b|headset \(|freebuds|pixel buds|nothing ear/i;

export function looksLikeBluetooth(
  labels: ReadonlyArray<string | null | undefined>,
): boolean {
  return labels.some((l) => Boolean(l && BLUETOOTH_RE.test(l)));
}

/** AudioContext-only estimate (no calibration yet). */
export function estimateLatencyFromContext(ctx: {
  outputLatency?: number;
  baseLatency?: number;
}): number {
  const out = Number.isFinite(ctx.outputLatency) ? ctx.outputLatency! : 0;
  const base = Number.isFinite(ctx.baseLatency) ? ctx.baseLatency! : 0;
  return Math.round((Math.max(0, out) + Math.max(0, base)) * 1000) +
    CONTEXT_ESTIMATE_PAD_MS;
}

export type CompensationSource = "calibrated" | "estimate";

export function resolveCompensationMs(params: {
  profile: LatencyProfile | null;
  contextEstimateMs: number;
}): { totalMs: number; baseMs: number; source: CompensationSource } {
  const p = params.profile;
  const measured = p?.roundTripMs;
  const baseMs =
    measured != null && Number.isFinite(measured)
      ? measured
      : params.contextEstimateMs;
  const manual = clampManualOffset(p?.manualOffsetMs ?? 0);
  return {
    totalMs: Math.round(baseMs + manual),
    baseMs,
    source: measured != null ? "calibrated" : "estimate",
  };
}

export function clampManualOffset(ms: number): number {
  if (!Number.isFinite(ms)) return 0;
  return Math.round(
    Math.min(MANUAL_OFFSET_MAX_MS, Math.max(MANUAL_OFFSET_MIN_MS, ms)),
  );
}

export type LatencyWarning = "bluetooth" | "high" | null;

export function latencyWarning(params: {
  labels: ReadonlyArray<string | null | undefined>;
  compensationMs: number;
  calibrated: boolean;
}): LatencyWarning {
  if (looksLikeBluetooth(params.labels)) return "bluetooth";
  if (params.compensationMs > LATENCY_HIGH_WARN_MS) return "high";
  return null;
}

// ── Local persistence (per browser, per device) ─────────────────────────────

export const LATENCY_STORAGE_KEY = "brd.studio.latency.v1";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export function parseLatencyProfile(raw: unknown): LatencyProfile | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.deviceKey !== "string" || !r.deviceKey) return null;
  const rt =
    typeof r.roundTripMs === "number" && Number.isFinite(r.roundTripMs)
      ? Math.min(LATENCY_MAX_MS, Math.max(LATENCY_MIN_MS, r.roundTripMs))
      : null;
  const method: LatencyMethod =
    r.method === "clap" || r.method === "manual" ? r.method : "click";
  return {
    deviceKey: r.deviceKey.slice(0, 160),
    roundTripMs: rt,
    manualOffsetMs: clampManualOffset(Number(r.manualOffsetMs ?? 0)),
    method,
    spreadMs:
      typeof r.spreadMs === "number" && Number.isFinite(r.spreadMs)
        ? r.spreadMs
        : null,
    updatedAt:
      typeof r.updatedAt === "string" ? r.updatedAt : new Date(0).toISOString(),
  };
}

export function loadLatencyProfiles(
  storage: StorageLike | null | undefined,
): Record<string, LatencyProfile> {
  if (!storage) return {};
  try {
    const raw = JSON.parse(storage.getItem(LATENCY_STORAGE_KEY) ?? "{}");
    const out: Record<string, LatencyProfile> = {};
    if (raw && typeof raw === "object") {
      for (const v of Object.values(raw as Record<string, unknown>)) {
        const p = parseLatencyProfile(v);
        if (p) out[p.deviceKey] = p;
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function saveLatencyProfile(
  storage: StorageLike | null | undefined,
  profile: LatencyProfile,
): void {
  if (!storage) return;
  try {
    const all = loadLatencyProfiles(storage);
    all[profile.deviceKey] = profile;
    const keys = Object.keys(all);
    // Keep at most 12 devices (drop oldest).
    if (keys.length > 12) {
      keys
        .sort((a, b) => all[a]!.updatedAt.localeCompare(all[b]!.updatedAt))
        .slice(0, keys.length - 12)
        .forEach((k) => delete all[k]);
    }
    storage.setItem(LATENCY_STORAGE_KEY, JSON.stringify(all));
  } catch {
    // quota / private mode — calibration still works for this session
  }
}

/** Newer of local vs profile copy. */
export function newerLatencyProfile(
  a: LatencyProfile | null,
  b: LatencyProfile | null,
): LatencyProfile | null {
  if (!a) return b;
  if (!b) return a;
  return a.updatedAt >= b.updatedAt ? a : b;
}
