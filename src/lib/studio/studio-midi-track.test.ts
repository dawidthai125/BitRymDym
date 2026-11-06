import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { MASTER_RENDER_SAMPLE_RATE } from "@/lib/studio/master/client";
import { renderMixStereo } from "@/lib/studio/master/render-mix";

describe("midi — wiring", () => {
  const read = (p: string) => readFileSync(p, "utf8");
  it("migration adds the column and a service-role CAS function", () => {
    const sql = read("supabase/migrations/20261106190000_studio_track_midi.sql");
    expect(sql).toContain("add column if not exists midi jsonb");
    expect(sql).toContain("studio_cas_apply_midi");
    expect(sql).toContain("studio_projects.document_version = p_expected");
    expect(sql).toContain("revoke all on function public.studio_cas_apply_midi");
    expect(sql).toContain("to service_role");
  });
  it("service validates strictly and writes through the CAS RPC", () => {
    const src = read("src/lib/studio/studio-service.ts");
    expect(src).toContain("parseMidiForWrite(input.midi)");
    expect(src).toContain('"studio_cas_apply_midi"');
    expect(src).toContain("readMidi(row.midi)");
    const route = read("src/app/api/studio/projects/[projectId]/tracks/[trackId]/midi/route.ts");
    expect(route).toContain("export async function PUT");
    expect(route).toContain("applyStudioTrackMidi");
  });
});

describe("renderMixStereo midi", () => {
  const sr = MASTER_RENDER_SAMPLE_RATE;
  const mixOf = (muted: boolean) =>
    renderMixStereo({
      sampleRate: sr,
      lengthMs: 400,
      masterGainDb: 0,
      masterPan: 0,
      tracks: [
        {
          id: "t",
          name: "Nuty",
          role: "lead_vocal",
          gainDb: 0,
          pan: 0,
          muted,
          solo: false,
          midi: { v: 1, instrument: "sine", notes: [{ t: 0, dur: 200, pitch: 69, vel: 1 }] },
        },
      ],
      clips: [],
      sources: {},
    });

  const energy = (mix: ReturnType<typeof mixOf>, fromMs: number, toMs: number) => {
    const a = Math.floor((fromMs / 1000) * sr);
    const b = Math.floor((toMs / 1000) * sr);
    let s = 0;
    for (let i = a; i < b; i++) s += mix.left[i] * mix.left[i] + mix.right[i] * mix.right[i];
    return s / (b - a);
  };

  it("a sine note is non-silent inside the note and near silent after it", () => {
    const mix = mixOf(false);
    expect(mix.sampleRate).toBe(sr);
    expect(energy(mix, 40, 160)).toBeGreaterThan(0.01);
    expect(energy(mix, 250, 380)).toBeLessThan(1e-8);
  });

  it("a muted track does not play the note", () => {
    const mix = mixOf(true);
    expect(energy(mix, 40, 160)).toBe(0);
  });
});
