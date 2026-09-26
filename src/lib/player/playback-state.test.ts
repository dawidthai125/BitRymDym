import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  canTogglePlay,
  createInitialPlaybackSnapshot,
  isPlayLabel,
  reducePlayback,
} from "@/lib/player/playback-state";

describe("playback state machine", () => {
  it("transitions loading → ready → playing → paused", () => {
    let state = createInitialPlaybackSnapshot();
    state = reducePlayback(state, { type: "REQUEST_PLAY" });
    expect(state.phase).toBe("loading");
    state = reducePlayback(state, { type: "URL_READY" });
    expect(state.phase).toBe("ready");
    state = reducePlayback(state, { type: "PLAYING" });
    expect(state.phase).toBe("playing");
    state = reducePlayback(state, { type: "PAUSED" });
    expect(state.phase).toBe("paused");
  });

  it("surfaces URL and engine errors", () => {
    let state = createInitialPlaybackSnapshot();
    state = reducePlayback(state, { type: "REQUEST_PLAY" });
    state = reducePlayback(state, {
      type: "URL_FAILED",
      message: "Brak dostępu do odsłuchu.",
    });
    expect(state.phase).toBe("error");
    expect(state.error).toBe("Brak dostępu do odsłuchu.");

    state = reducePlayback(state, { type: "REQUEST_PLAY" });
    state = reducePlayback(state, {
      type: "ENGINE_ERROR",
      message: "Nie udało się odtworzyć audio.",
    });
    expect(state.phase).toBe("error");
  });

  it("updates time, volume, and mute", () => {
    let state = createInitialPlaybackSnapshot();
    state = reducePlayback(state, {
      type: "TIME",
      currentTime: 12,
      duration: 120,
    });
    state = reducePlayback(state, { type: "VOLUME", volume: 0.4 });
    state = reducePlayback(state, { type: "MUTE", muted: true });
    expect(state.currentTime).toBe(12);
    expect(state.duration).toBe(120);
    expect(state.volume).toBe(0.4);
    expect(state.muted).toBe(true);
  });

  it("disables toggle while loading and labels play correctly", () => {
    expect(canTogglePlay("loading")).toBe(false);
    expect(canTogglePlay("playing")).toBe(true);
    expect(isPlayLabel("idle")).toBe(true);
    expect(isPlayLabel("playing")).toBe(false);
  });
});

describe("PlaybackShell hard-outs", () => {
  const shellSource = readFileSync(
    join(process.cwd(), "src/components/player/playback-shell.tsx"),
    "utf8",
  );
  const detailSource = readFileSync(
    join(process.cwd(), "src/app/beat/[id]/page.tsx"),
    "utf8",
  );
  const catalogSource = readFileSync(
    join(process.cwd(), "src/app/beats/page.tsx"),
    "utf8",
  );

  it("does not expose DOWNLOAD purpose or download CTA on PlaybackShell / catalog", () => {
    expect(shellSource).toContain("PUBLIC_PLAYBACK_PURPOSE");
    expect(shellSource).not.toMatch(/purpose:\s*["']DOWNLOAD["']/);
    expect(shellSource).not.toMatch(/<audio[^>]*\scontrols/i);
    expect(shellSource).toContain("<audio");
    expect(shellSource.toLowerCase()).not.toContain("pobierz");
    expect(catalogSource.toLowerCase()).not.toContain("download");
    expect(catalogSource.toLowerCase()).not.toContain("pobierz");
    // Phase 1.8A: beat detail may expose Download CTA (separate from PlaybackShell).
    expect(detailSource).toContain("DownloadButton");
  });

  it("does not include Quick Take or waveform engine hooks", () => {
    const combined = `${shellSource}\n${detailSource}\n${catalogSource}`;
    expect(combined.toLowerCase()).not.toContain("mediarecorder");
    expect(combined.toLowerCase()).not.toContain("quick take");
    expect(combined.toLowerCase()).not.toContain("waveform");
    expect(combined.toLowerCase()).not.toContain("microphone");
  });
});
