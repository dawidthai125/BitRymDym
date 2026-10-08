/**
 * P6.6.2 — Selected Track Peak Meter UI (presentation + selection binding).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  peakToDbFs,
  STUDIO_METER_HZ,
  STUDIO_METER_NEUTRAL,
  buildMeterSnapshot,
} from "@/lib/studio/studio-meter";

const root = process.cwd();

describe("P6.6.2 Track meter UI contracts", () => {
  const editor = readFileSync(
    join(root, "src/components/studio/studio-editor.tsx"),
    "utf8",
  );
  const trackMeter = readFileSync(
    join(root, "src/components/studio/studio-track-meter.tsx"),
    "utf8",
  );
  const peakMeter = readFileSync(
    join(root, "src/components/studio/studio-peak-meter.tsx"),
    "utf8",
  );
  const masterMeter = readFileSync(
    join(root, "src/components/studio/studio-master-meter.tsx"),
    "utf8",
  );
  const transport = readFileSync(
    join(root, "src/components/studio/studio-transport-provider.tsx"),
    "utf8",
  );
  const engine = readFileSync(
    join(root, "src/lib/studio/studio-audio-engine.ts"),
    "utf8",
  );

  it("no selection → no always-on Track Meter UI", () => {
    expect(editor).toMatch(/activeSelectedTrackId/);
    // Phase 7.1.5 — leaf wrapper; still gated by isSelected in mixer row.
    expect(editor).toMatch(/isSelected \? \(\s*<StudioTrackMeterLive/);
    expect(editor).toMatch(/\) : null\}/);
    // Single Track meter mount site in Mix — gated by isSelected
    const meterSites = editor.match(/<StudioTrackMeterLive\b/g) ?? [];
    expect(meterSites).toHaveLength(1);
    expect(editor).toMatch(/const isSelected = activeSelectedTrackId === track\.id/);
  });

  it("selected Track A → meter renders via Mix selection", () => {
    expect(editor).toMatch(/selectedTrackId/);
    expect(editor).toMatch(/setSelectedTrackId/);
    expect(editor).toMatch(/studio-mix-track-select/);
    expect(editor).toMatch(/data-selected=\{isSelected \? \"true\" : \"false\"\}/);
    expect(trackMeter).toMatch(/testIdPrefix=\"studio-track-meter\"/);
    expect(trackMeter).toMatch(/Miernik ścieżki/);
  });

  it("selection A→B / clear syncs engine Track meter target", () => {
    expect(editor).toMatch(/setTrackMeterTarget\(activeSelectedTrackId\)/);
    expect(transport).toMatch(/setTrackMeterTarget/);
    expect(transport).toMatch(/subscribeTrackMeter\(setTrackMeter\)/);
    expect(transport).toMatch(/trackMeter/);
    expect(engine).toMatch(/setTrackMeterTarget/);
  });

  it("meter snapshot updates through subscribeTrackMeter (no UI rAF)", () => {
    expect(transport).toMatch(/subscribeTrackMeter/);
    expect(trackMeter).not.toMatch(/requestAnimationFrame/);
    expect(peakMeter).not.toMatch(/requestAnimationFrame/);
    expect(editor).not.toMatch(/requestAnimationFrame/);
    expect(STUDIO_METER_HZ).toBeLessThanOrEqual(15);
  });

  it("Peak value + clip state rendered via shared studio-meter", () => {
    expect(peakMeter).toMatch(/peakToDbFs/);
    expect(peakMeter).toMatch(/\$\{testIdPrefix\}-peak/);
    expect(peakMeter).toMatch(/\$\{testIdPrefix\}-clip/);
    expect(peakMeter).toMatch(/data-clipping=/);
    expect(peakMeter).toMatch(/Clipping/);
    expect(peakMeter).toMatch(/Bez clippingu/);
    const hot = buildMeterSnapshot({
      peak: 0.5,
      clipping: true,
      timestamp: 1,
    });
    expect(peakToDbFs(hot.peak)).toMatch(/dB/);
    expect(hot.clipping).toBe(true);
    expect(STUDIO_METER_NEUTRAL.peak).toBe(0);
  });

  it("no second AudioContext / analyser / engine in UI path", () => {
    expect(trackMeter).not.toMatch(/createAnalyser|new AudioContext|getFloatTimeDomainData/);
    expect(peakMeter).not.toMatch(/createAnalyser|new AudioContext|getFloatTimeDomainData/);
    expect(editor).not.toMatch(/createAnalyser|new AudioContext/);
    expect(transport).not.toMatch(/new StudioAudioEngine\(\)[\s\S]*new StudioAudioEngine/);
    expect(transport).toMatch(/new StudioAudioEngine/);
  });

  it("Master Meter remains unchanged in Mix composition", () => {
    // Phase 7.1.5 — StudioMasterMeterLive → StudioMasterMeter via meters context.
    expect(editor).toMatch(/StudioMasterMeterLive/);
    expect(editor).toMatch(/useStudioTransportMeters/);
    expect(editor).toMatch(/<StudioMasterMeter snapshot=\{meter\}/);
    expect(masterMeter).toMatch(/testIdPrefix=\"studio-master-meter\"/);
    expect(masterMeter).toMatch(/Miernik Master/);
    // Visual Parity V2 — Master strip: Level · Pan · FX · meter
    const mixerStart = editor.indexOf('data-testid="studio-mixer-drawer"');
    expect(mixerStart).toBeGreaterThan(0);
    const mixer = editor.slice(mixerStart);
    const levelIdx = mixer.indexOf('ariaLabel="Głośność Master"');
    const panIdx = mixer.indexOf('ariaLabel="Panorama Master"');
    const masterFxIdx = mixer.indexOf('aria-label="Efekty Master"');
    const masterMeterIdx = mixer.indexOf("<StudioMasterMeterLive");
    expect(levelIdx).toBeGreaterThanOrEqual(0);
    expect(panIdx).toBeGreaterThan(levelIdx);
    expect(masterFxIdx).toBeGreaterThan(panIdx);
    expect(masterMeterIdx).toBeGreaterThan(masterFxIdx);
  });

  it("desktop Mix: Track meter after name, before Level (V2 / P6.6)", () => {
    // Visual Parity V2 channel strip: name · meter · Level · Pan · M/S/R · FX
    const mixerStart = editor.indexOf('data-testid="studio-mixer-drawer"');
    expect(mixerStart).toBeGreaterThan(0);
    const mixer = editor.slice(mixerStart);
    const meterIdx = mixer.indexOf("<StudioTrackMeterLive");
    const levelIdx = mixer.indexOf("ariaLabel={`Głośność ścieżki");
    const panIdx = mixer.indexOf("ariaLabel={`Panorama ścieżki");
    const fxIdx = mixer.indexOf("Efekty ścieżki");
    expect(meterIdx).toBeGreaterThanOrEqual(0);
    expect(levelIdx).toBeGreaterThan(meterIdx);
    expect(panIdx).toBeGreaterThan(levelIdx);
    expect(fxIdx).toBeGreaterThan(panIdx);
  });

  it("mobile ~390: min-w-0, min-h-11 select, no overflow traps", () => {
    expect(peakMeter).toMatch(/min-w-0/);
    expect(peakMeter).toMatch(/w-full/);
    expect(editor).toMatch(/studio-mix-track-select/);
    expect(editor).toMatch(/min-h-11 min-w-0 flex-1/);
    // Phase 1 DAW shell — page/frame owns safe-area pad; shell is viewport-flex.
    expect(editor).toMatch(/studio-daw-shell/);
    expect(editor).toMatch(/min-h-\[calc\(100dvh/);
    expect(trackMeter).not.toMatch(/fixed bottom|w-screen|min-w-\[4/);
    expect(peakMeter).not.toMatch(/overflow-x-scroll|w-\[4[0-9]{2,}/);
  });

  it("transport remains reachable (sticky + labels)", () => {
    expect(editor).toMatch(/sticky top-14/);
    expect(editor).toMatch(/aria-label=\"Transport Studio\"/);
    // Visual Parity V2 — Play label may include noBeat “wymaga bitu” suffix.
    expect(editor).toMatch(/aria-label=\{noBeat \? \"Odtwórz — wymaga bitu\" : \"Odtwórz\"\}/);
    expect(editor).toMatch(/aria-label=\"Stop\"/);
    expect(editor).toMatch(/min-h-11/);
  });

  it("architecture guard: no PlayerProvider / E3 / MeteringEngine in UI", () => {
    expect(editor).not.toMatch(/PlayerProvider|mix-graph|StudioMixEngine|MeteringEngine/);
    expect(trackMeter).not.toMatch(/PlayerProvider|mix-graph|StudioMixEngine|MeteringEngine/);
    expect(transport).not.toMatch(/MeteringEngine|StudioMixEngine|mix-graph/);
    expect(peakMeter).toMatch(/never touches AnalyserNode/);
  });

  it("Track meter reuses shared StudioPeakMeter (no duplicate Peak math)", () => {
    expect(trackMeter).toMatch(/StudioPeakMeter/);
    expect(masterMeter).toMatch(/StudioPeakMeter/);
    expect(trackMeter).not.toMatch(/samplePeakFromTimeDomain|updateClipLatch/);
    expect(peakMeter).not.toMatch(/samplePeakFromTimeDomain|updateClipLatch/);
  });
});
