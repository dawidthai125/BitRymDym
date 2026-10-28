/**
 * Local Scratch bake listen dump — synthetic ramp PCM only.
 * Reuses renderStudioDocumentOffline + encodeWavFromBake (same fixture as
 * studio-offline-render.test.ts). Writes WAV outside the repo.
 *
 * Usage:
 *   npx tsx scripts/_bake-listen-scratch-wav.ts
 *   npx tsx scripts/_bake-listen-scratch-wav.ts --play
 *   npx tsx scripts/_bake-listen-scratch-wav.ts --cleanup
 *
 * Does NOT enqueue STUDIO_EXPORT, Contabo, SFM, Storage, or prod masters.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { encodeWavFromBake } from "../src/lib/audio/wav-encode";
import type { DecodedPcmStereo } from "../src/lib/audio/render-decode";
import type {
  StudioEngineClip,
  StudioEngineDocument,
  StudioEngineTrack,
} from "../src/lib/studio/studio-audio-schedule";
import {
  renderStudioDocumentOffline,
  STUDIO_OFFLINE_RENDER_SAMPLE_RATE,
  type StudioOfflinePcmResolver,
} from "../src/lib/studio/studio-offline-render";

const OUT_DIR = join(process.env.TEMP || tmpdir(), "bitrymdym-bake-listen");
const POLARITY_MS = 200;

type ScratchFlags = {
  scratchReverse?: boolean;
  scratchRate?: number;
  scratchCueMs?: number;
};

type Check = { name: string; ok: boolean; detail: string };

function track(
  partial: Partial<StudioEngineTrack> & Pick<StudioEngineTrack, "id">,
): StudioEngineTrack {
  return {
    gainDb: 0,
    pan: 0,
    muted: false,
    solo: false,
    ...partial,
  };
}

function clip(
  partial: Partial<StudioEngineClip> &
    Pick<StudioEngineClip, "id" | "trackId" | "sourceKind">,
): StudioEngineClip {
  return {
    sourceTakeId: partial.sourceKind === "TAKE" ? "take-1" : null,
    sourceBeatId: partial.sourceKind === "BEAT_REF" ? "beat-1" : null,
    sourceOffsetMs: 0,
    timelineStartMs: 0,
    durationMs: 1000,
    gainDb: 0,
    muted: false,
    fadeInMs: 0,
    fadeOutMs: 0,
    ...partial,
  };
}

function doc(
  partial: Partial<StudioEngineDocument> &
    Pick<StudioEngineDocument, "tracks" | "clips">,
): StudioEngineDocument {
  return {
    timelineLengthMs: 1000,
    masterGainDb: 0,
    masterPan: 0,
    projectBeatId: "beat-1",
    ...partial,
  };
}

/** Linear 0→1 stereo ramp — same fixture as studio-offline-render.test.ts. */
function rampPcm(frames: number): DecodedPcmStereo {
  const interleaved = new Float32Array(frames * 2);
  for (let i = 0; i < frames; i++) {
    const v = i / frames;
    interleaved[i * 2] = v;
    interleaved[i * 2 + 1] = v;
  }
  return {
    sampleRate: STUDIO_OFFLINE_RENDER_SAMPLE_RATE,
    channels: 2,
    frames,
    interleaved,
  };
}

function resolverFromMap(
  map: Record<string, DecodedPcmStereo>,
): StudioOfflinePcmResolver {
  return (key) => {
    const k =
      key.kind === "TAKE" ? `TAKE:${key.takeId}` : `BEAT_REF:${key.beatId}`;
    return map[k] ?? null;
  };
}

function assert(name: string, ok: boolean, detail: string): Check {
  return { name, ok, detail };
}

async function renderCase(durationMs: number, scratch: ScratchFlags = {}) {
  const sr = STUDIO_OFFLINE_RENDER_SAMPLE_RATE;
  const pcm = rampPcm(sr);
  return renderStudioDocumentOffline({
    document: doc({
      timelineLengthMs: durationMs,
      tracks: [track({ id: "t1" })],
      clips: [
        clip({
          id: "c1",
          trackId: "t1",
          sourceKind: "TAKE",
          sourceTakeId: "take-1",
          durationMs,
          ...scratch,
        }),
      ],
    }),
    resolvePcm: resolverFromMap({ "TAKE:take-1": pcm }),
  });
}

function polarityChecks(params: {
  identity: { interleaved: Float32Array; frames: number };
  reversed: { interleaved: Float32Array; frames: number };
  pitched: { interleaved: Float32Array; frames: number };
  cued: { interleaved: Float32Array; frames: number };
}): Check[] {
  const first = params.reversed.interleaved[0] ?? 0;
  const lastVoice =
    params.reversed.interleaved[
      Math.max(0, params.reversed.frames - 2) * 2
    ] ?? 0;
  const pitchedMid =
    params.pitched.interleaved[Math.floor(params.pitched.frames / 2) * 2] ?? 0;
  const identityMid =
    params.identity.interleaved[Math.floor(params.identity.frames / 2) * 2] ?? 0;
  const cuedFirst = params.cued.interleaved[0] ?? 0;
  const identityFirst = params.identity.interleaved[0] ?? 0;
  return [
    assert("reverse.first>0.7", first > 0.7, `first=${first}`),
    assert("reverse.last<first", lastVoice < first, `last=${lastVoice} first=${first}`),
    assert(
      "rate2.mid>identity.mid",
      pitchedMid > identityMid,
      `pitchedMid=${pitchedMid} identityMid=${identityMid}`,
    ),
    assert(
      "cue400.first 0.35..0.45",
      cuedFirst > 0.35 && cuedFirst < 0.45,
      `cuedFirst=${cuedFirst}`,
    ),
    assert("identity.first<0.05", identityFirst < 0.05, `identityFirst=${identityFirst}`),
  ];
}

function headerChecks(bytes: Buffer, encoded: { contentType: string; sampleRate: number; bitDepth: number; durationMs: number; byteSize: number }): Check[] {
  return [
    assert("RIFF", bytes.subarray(0, 4).toString("ascii") === "RIFF", bytes.subarray(0, 4).toString("ascii")),
    assert("WAVE", bytes.subarray(8, 12).toString("ascii") === "WAVE", bytes.subarray(8, 12).toString("ascii")),
    assert("contentType", encoded.contentType === "audio/wav", encoded.contentType),
    assert("sampleRate", encoded.sampleRate === STUDIO_OFFLINE_RENDER_SAMPLE_RATE, String(encoded.sampleRate)),
    assert("bitDepth16", encoded.bitDepth === 16, String(encoded.bitDepth)),
    assert("durationMs200", encoded.durationMs === POLARITY_MS, String(encoded.durationMs)),
    assert("byteSize>44", encoded.byteSize > 44 && bytes.length === encoded.byteSize, String(encoded.byteSize)),
  ];
}

async function encodeDump(
  label: string,
  offline: Awaited<ReturnType<typeof renderStudioDocumentOffline>>,
): Promise<{ path: string; encoded: Awaited<ReturnType<typeof encodeWavFromBake>> }> {
  const encoded = await encodeWavFromBake({
    interleaved: offline.interleaved,
    sampleRate: offline.sampleRate,
    channels: 2,
    frames: offline.frames,
    durationMs: Math.max(
      1,
      Math.round((offline.frames / offline.sampleRate) * 1000),
    ),
  });
  const dest = join(OUT_DIR, `${label}.wav`);
  writeFileSync(dest, encoded.bytes);
  return { path: dest, encoded };
}

function playWav(filePath: string): { ok: boolean; detail: string } {
  if (process.platform !== "win32") {
    return { ok: false, detail: `no SoundPlayer on ${process.platform}` };
  }
  const quoted = filePath.replace(/'/g, "''");
  const result = spawnSync(
    "powershell",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `$p = New-Object System.Media.SoundPlayer '${quoted}'; $p.PlaySync();`,
    ],
    { encoding: "utf8" },
  );
  if (result.status === 0) {
    return { ok: true, detail: "SoundPlayer.PlaySync exit 0" };
  }
  return {
    ok: false,
    detail: `SoundPlayer exit ${result.status}: ${(result.stderr || result.stdout || "").slice(0, 240)}`,
  };
}

async function main() {
  const wantPlay = process.argv.includes("--play");
  const wantCleanup = process.argv.includes("--cleanup");
  mkdirSync(OUT_DIR, { recursive: true });

  const identity = await renderCase(POLARITY_MS);
  const reversed = await renderCase(POLARITY_MS, {
    scratchReverse: true,
    scratchRate: 1,
    scratchCueMs: 0,
  });
  const pitched = await renderCase(POLARITY_MS, {
    scratchReverse: false,
    scratchRate: 2,
    scratchCueMs: 0,
  });
  const cued = await renderCase(POLARITY_MS, {
    scratchReverse: false,
    scratchRate: 1,
    scratchCueMs: 400,
  });

  const pcmChecks = polarityChecks({ identity, reversed, pitched, cued });

  const dumps = [
    await encodeDump("01-baseline", identity),
    await encodeDump("02-reverse", reversed),
    await encodeDump("03-rate2", pitched),
    await encodeDump("04-cue400", cued),
  ];
  const wavChecks = headerChecks(dumps[0]!.encoded.bytes, dumps[0]!.encoded);

  const failed = [...pcmChecks, ...wavChecks].filter((c) => !c.ok);
  const polarity = failed.length === 0 ? "PASS" : "FAIL";

  console.log(`OUT_DIR=${OUT_DIR}`);
  for (const d of dumps) {
    console.log(`WAV ${d.path} bytes=${d.encoded.byteSize} durationMs=${d.encoded.durationMs}`);
  }
  console.log("--- polarity (studio-offline-render.test.ts) ---");
  for (const c of [...pcmChecks, ...wavChecks]) {
    console.log(`${c.ok ? "PASS" : "FAIL"} ${c.name} ${c.detail}`);
  }
  console.log(`POLARITY=${polarity}`);
  console.log("--- EXPECT (Owner) ---");
  console.log("Syntetyczna rampa DC 0→1 (nie ton, nie prod master), clip 200ms.");
  console.log("01-baseline: start prawie cisza (first<0.05), lekki wzrost.");
  console.log("02-reverse: start głośny (first>0.7), spada.");
  console.log("03-rate2: start cichy, środek głośniejszy niż baseline (2×).");
  console.log("04-cue400: start już ~0.4 (cue 400ms w 1s rampie).");

  let play: "PASS" | "FAIL" | "SKIP" = "SKIP";
  if (wantPlay) {
    const playResults = dumps.map((d) => ({ path: d.path, ...playWav(d.path) }));
    for (const p of playResults) {
      console.log(`${p.ok ? "PLAY_OK" : "PLAY_FAIL"} ${p.path} ${p.detail}`);
    }
    play = playResults.every((p) => p.ok) ? "PASS" : "FAIL";
  } else {
    console.log("PLAY=SKIP (pass --play for local SoundPlayer; no browser / no prod)");
  }
  console.log(`PLAY=${play}`);
  console.log("LISTEN=NOT VERIFIED (ucho Ownera — agent nie potwierdza głośników)");

  if (wantCleanup) {
    rmSync(OUT_DIR, { recursive: true, force: true });
    console.log(`CLEANUP=removed ${OUT_DIR}`);
  } else {
    console.log("CLEANUP=kept (pass --cleanup to delete temp WAV)");
  }

  if (polarity !== "PASS") process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
