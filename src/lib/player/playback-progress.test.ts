import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  playbackProgressRatio,
  seekRatioFromClientX,
  shouldRestartFromStart,
} from "@/lib/player/playback-progress";
import {
  createInitialPlaybackSnapshot,
  reducePlayback,
} from "@/lib/player/playback-state";

describe("playbackProgressRatio", () => {
  it("CASE A — inactive / no duration → 0", () => {
    expect(playbackProgressRatio(0, 120, false)).toBe(0);
    expect(playbackProgressRatio(40, 0, true)).toBe(0);
    expect(playbackProgressRatio(Number.NaN, 120, true)).toBe(0);
  });

  it("CASE B — grows with currentTime / duration", () => {
    expect(playbackProgressRatio(0, 100, true)).toBe(0);
    expect(playbackProgressRatio(25, 100, true)).toBe(0.25);
    expect(playbackProgressRatio(37, 100, true)).toBe(0.37);
  });

  it("CASE C — pause position preserved as ratio", () => {
    expect(playbackProgressRatio(37, 100, true)).toBeCloseTo(0.37);
  });

  it("CASE H — ended at duration → 100%", () => {
    expect(playbackProgressRatio(180, 180, true)).toBe(1);
  });

  it("clamps above 1", () => {
    expect(playbackProgressRatio(200, 100, true)).toBe(1);
  });
});

describe("seekRatioFromClientX", () => {
  it("CASE E — maps click X to ratio", () => {
    expect(seekRatioFromClientX(70, 0, 100)).toBeCloseTo(0.7);
    expect(seekRatioFromClientX(55, 0, 100)).toBeCloseTo(0.55);
  });

  it("clamps to 0..1 and handles bad width", () => {
    expect(seekRatioFromClientX(-10, 0, 100)).toBe(0);
    expect(seekRatioFromClientX(150, 0, 100)).toBe(1);
    expect(seekRatioFromClientX(50, 0, 0)).toBe(0);
  });
});

describe("shouldRestartFromStart", () => {
  it("CASE H — play again after ended / at end", () => {
    expect(shouldRestartFromStart(100, 100, true)).toBe(true);
    expect(shouldRestartFromStart(99.98, 100, false)).toBe(true);
    expect(shouldRestartFromStart(37, 100, false)).toBe(false);
  });
});

describe("ENDED keeps 100% progress", () => {
  it("CASE H — reducePlayback ENDED pins currentTime to duration", () => {
    let state = createInitialPlaybackSnapshot();
    state = reducePlayback(state, {
      type: "TIME",
      currentTime: 99,
      duration: 100,
    });
    state = reducePlayback(state, { type: "ENDED" });
    expect(state.phase).toBe("paused");
    expect(state.currentTime).toBe(100);
    expect(playbackProgressRatio(state.currentTime, state.duration, true)).toBe(
      1,
    );
  });
});

describe("player surface contracts — no decorative progress", () => {
  const root = process.cwd();
  const catalog = readFileSync(
    join(root, "src/components/brand/beat-catalog-row.tsx"),
    "utf8",
  );
  const detail = readFileSync(
    join(root, "src/app/beat/[id]/beat-detail-client.tsx"),
    "utf8",
  );
  const home = readFileSync(
    join(root, "src/components/brand/home-beat-strip.tsx"),
    "utf8",
  );
  const shell = readFileSync(
    join(root, "src/components/player/playback-shell.tsx"),
    "utf8",
  );
  const provider = readFileSync(
    join(root, "src/components/player/player-provider.tsx"),
    "utf8",
  );
  const waveform = readFileSync(
    join(root, "src/components/brand/waveform.tsx"),
    "utf8",
  );

  it("catalog / detail / home / shell use real progress helpers", () => {
    expect(catalog).toContain("playbackProgressRatio");
    expect(catalog).not.toMatch(/featured \? 0\.1 : 0\.06/);
    expect(detail).toContain("playbackProgressRatio");
    expect(detail).not.toMatch(/:\s*0\.08/);
    expect(home).toContain("playbackProgressRatio");
    expect(home).not.toMatch(/playing \? 0\.48/);
    expect(shell).not.toMatch(/progress=\{hasSource \? progressRatio : 0\.12\}/);
    expect(shell).toContain("progress={progressRatio}");
  });

  it("CASE F — activateTrack supports autoplay:false; seek does not play", () => {
    expect(provider).toContain("activateTrack");
    expect(provider).toContain("autoplay");
    expect(provider).toMatch(/Seek only/);
    expect(catalog).toContain('autoplay: false');
    expect(detail).toContain('autoplay: false');
    expect(home).toContain('autoplay: false');
  });

  it("CASE G — track switch resets currentTime when beatId changes", () => {
    expect(provider).toContain("audio.dataset.beatId !== next.beatId");
    expect(provider).toContain("setCurrentTime(0)");
  });

  it("pointer drag seek reuses onSeekRatio + setPointerCapture", () => {
    expect(waveform).toContain("setPointerCapture");
    expect(waveform).toContain("onPointerDown");
    expect(waveform).toContain("onPointerMove");
    expect(waveform).toContain("onPointerUp");
    expect(waveform).toContain("seekRatioFromClientX");
    expect(waveform).toContain("touchAction");
  });
});
