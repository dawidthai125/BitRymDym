import { describe, expect, it } from "vitest";

import {
  CLAP_CALIBRATION,
  CLICK_CALIBRATION,
  LATENCY_STORAGE_KEY,
  calibrationClickTimesMs,
  estimateLatencyFromContext,
  latencyDeviceKey,
  latencyWarning,
  loadLatencyProfiles,
  looksLikeBluetooth,
  measureLatency,
  renderCalibrationClick,
  resolveCompensationMs,
  saveLatencyProfile,
  type LatencyProfile,
} from "@/lib/studio/recording/latency";

const SR = 48000;

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

/** Synthetic mic capture: noise + attenuated clicks at expected+lag (+jitter) with room tail. */
function synth(params: {
  expected: number[];
  lagMs: number;
  jitterMs?: number;
  gain?: number;
  noise?: number;
  drop?: number[];
  totalMs: number;
}): Float32Array {
  const r = rng(42);
  const out = new Float32Array(Math.round((params.totalMs * SR) / 1000));
  const noise = params.noise ?? 0.002;
  for (let i = 0; i < out.length; i += 1) out[i] = (r() * 2 - 1) * noise;
  const click = renderCalibrationClick(SR, params.gain ?? 0.15);
  params.expected.forEach((e, k) => {
    if (params.drop?.includes(k)) return;
    const j = params.jitterMs ? (r() * 2 - 1) * params.jitterMs : 0;
    const at = Math.round(((e + params.lagMs + j) * SR) / 1000);
    for (let i = 0; i < click.length && at + i < out.length; i += 1) {
      out[at + i]! += click[i]!;
    }
    // Room reflection 9 ms later, quieter.
    const refl = at + Math.round(0.009 * SR);
    for (let i = 0; i < click.length && refl + i < out.length; i += 1) {
      out[refl + i]! += click[i]! * 0.35;
    }
  });
  return out;
}

const clickTimes = calibrationClickTimesMs(
  CLICK_CALIBRATION.count,
  CLICK_CALIBRATION.firstMs,
  CLICK_CALIBRATION.spacingMs,
);
const clickOpts = {
  window: CLICK_CALIBRATION.window,
  maxSpreadMs: CLICK_CALIBRATION.maxSpreadMs,
  minValidRatio: CLICK_CALIBRATION.minValidRatio,
};

describe("measureLatency (click round trip)", () => {
  it.each([12, 37, 180, 260])("finds %i ms within 1 ms", (lag) => {
    const sig = synth({ expected: clickTimes, lagMs: lag, totalMs: 7600 });
    const m = measureLatency(sig, SR, clickTimes, clickOpts);
    expect(m.ok).toBe(true);
    if (m.ok) {
      expect(Math.abs(m.latencyMs - lag)).toBeLessThanOrEqual(1);
      expect(m.detected).toBe(8);
    }
  });

  it("tolerates jitter and a missed click", () => {
    const sig = synth({
      expected: clickTimes,
      lagMs: 64,
      jitterMs: 1.5,
      drop: [3],
      totalMs: 7600,
    });
    const m = measureLatency(sig, SR, clickTimes, clickOpts);
    expect(m.ok).toBe(true);
    if (m.ok) {
      expect(Math.abs(m.latencyMs - 64)).toBeLessThanOrEqual(2);
      expect(m.detected).toBe(7);
    }
  });

  it("handles slightly negative bias (recorder started late)", () => {
    const sig = synth({ expected: clickTimes, lagMs: -15, totalMs: 7600 });
    const m = measureLatency(sig, SR, clickTimes, clickOpts);
    expect(m.ok && Math.abs(m.latencyMs + 15) <= 1).toBe(true);
  });

  it("reports NO_SIGNAL on silence (headphones, mic can't hear)", () => {
    const sig = synth({ expected: clickTimes, lagMs: 40, totalMs: 7600, drop: [0, 1, 2, 3, 4, 5, 6, 7] });
    expect(measureLatency(sig, SR, clickTimes, clickOpts)).toMatchObject({
      ok: false,
      reason: "NO_SIGNAL",
    });
  });

  it("reports TOO_FEW when most clicks are lost", () => {
    const sig = synth({ expected: clickTimes, lagMs: 40, totalMs: 7600, drop: [0, 1, 2, 4, 5, 6] });
    expect(measureLatency(sig, SR, clickTimes, clickOpts)).toMatchObject({
      ok: false,
      reason: "TOO_FEW",
    });
  });

  it("reports UNSTABLE for chaotic onsets", () => {
    const sig = synth({ expected: clickTimes, lagMs: 200, jitterMs: 150, totalMs: 7600 });
    const m = measureLatency(sig, SR, clickTimes, clickOpts);
    expect(m.ok).toBe(false);
  });
});

describe("measureLatency (clap test)", () => {
  it("averages human claps (±15 ms) to the round trip", () => {
    const all = calibrationClickTimesMs(
      CLAP_CALIBRATION.count,
      CLAP_CALIBRATION.firstMs,
      CLAP_CALIBRATION.spacingMs,
    );
    const measured = all.slice(CLAP_CALIBRATION.leadIn);
    // Claps only after lead-in.
    const sig = synth({
      expected: measured,
      lagMs: 95,
      jitterMs: 15,
      gain: 0.5,
      totalMs: 8600,
    });
    const m = measureLatency(sig, SR, measured, {
      window: CLAP_CALIBRATION.window,
      maxSpreadMs: CLAP_CALIBRATION.maxSpreadMs,
      minValidRatio: CLAP_CALIBRATION.minValidRatio,
    });
    expect(m.ok).toBe(true);
    if (m.ok) expect(Math.abs(m.latencyMs - 95)).toBeLessThanOrEqual(10);
  });
});

describe("device profile + warnings", () => {
  it("builds stable keys from labels", () => {
    expect(
      latencyDeviceKey({ inputLabel: "USB Mic (1234:abcd)", outputLabel: " AirPods  Pro " }),
    ).toBe("usb mic|airpods pro");
    expect(latencyDeviceKey({})).toBe("default-in|default-out");
  });

  it("detects bluetooth labels", () => {
    expect(looksLikeBluetooth(["AirPods Pro"])).toBe(true);
    expect(looksLikeBluetooth(["Słuchawki (WH-1000XM4) Hands-Free"])).toBe(true);
    expect(looksLikeBluetooth(["Głośniki (Realtek)", "Focusrite USB"])).toBe(false);
    expect(
      latencyWarning({ labels: ["Focusrite"], compensationMs: 55, calibrated: true }),
    ).toBe("high");
    expect(
      latencyWarning({ labels: ["Galaxy Buds2"], compensationMs: 10, calibrated: false }),
    ).toBe("bluetooth");
    expect(latencyWarning({ labels: ["Focusrite"], compensationMs: 12, calibrated: true })).toBeNull();
  });

  it("prefers calibration, else AudioContext estimate, plus manual", () => {
    const est = estimateLatencyFromContext({ outputLatency: 0.02, baseLatency: 0.005 });
    expect(est).toBe(35);
    expect(resolveCompensationMs({ profile: null, contextEstimateMs: est })).toEqual({
      totalMs: 35,
      baseMs: 35,
      source: "estimate",
    });
    const p: LatencyProfile = {
      deviceKey: "a|b",
      roundTripMs: 41.5,
      manualOffsetMs: -6,
      method: "click",
      spreadMs: 0.5,
      updatedAt: "2026-10-29T10:00:00.000Z",
    };
    expect(resolveCompensationMs({ profile: p, contextEstimateMs: est }).totalMs).toBe(36);
  });

  it("persists per device in storage", () => {
    const mem = new Map<string, string>();
    const storage = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
    };
    saveLatencyProfile(storage, {
      deviceKey: "mic|phones",
      roundTripMs: 23,
      manualOffsetMs: 999,
      method: "click",
      spreadMs: 1,
      updatedAt: "2026-10-29T10:00:00.000Z",
    });
    const all = loadLatencyProfiles(storage);
    expect(all["mic|phones"]?.roundTripMs).toBe(23);
    expect(all["mic|phones"]?.manualOffsetMs).toBe(300);
    mem.set(LATENCY_STORAGE_KEY, "{broken");
    expect(loadLatencyProfiles(storage)).toEqual({});
  });
});
