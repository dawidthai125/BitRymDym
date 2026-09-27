/**
 * Generate synthetic known-BPM WAV fixtures outside the git repo.
 *
 * Output: ../bitrymdym-fixtures/bpm-<BPM>-steady.wav
 * Usage: npm run generate:bpm-fixtures
 */

import fs from "node:fs";
import path from "node:path";

import {
  SYNTHETIC_BPM_MATRIX,
  SYNTHETIC_FIXTURE_DURATION_SECONDS,
  SYNTHETIC_FIXTURE_SAMPLE_RATE,
  syntheticFixtureFilename,
} from "./bpm/synthetic-bpm-matrix";
import {
  encodeMonoWavPcm16,
  generateKickClickTrack,
} from "./bpm/synthetic-wav";

const DEFAULT_OUT_DIR = path.resolve(
  process.cwd(),
  "..",
  "bitrymdym-fixtures",
);

async function validateWithAudioDecode(filePath: string): Promise<{
  sampleRate: number;
  channels: number;
  durationSeconds: number;
}> {
  const decode = (await import("audio-decode")).default;
  const buf = fs.readFileSync(filePath);
  const audio = await decode(buf);
  const channelData = audio.channelData as Float32Array[];
  const channels = channelData.length;
  const length = channelData[0]?.length ?? 0;
  const sampleRate = audio.sampleRate;
  return {
    sampleRate,
    channels,
    durationSeconds: length / sampleRate,
  };
}

async function main() {
  const outDir = process.env.BPM_FIXTURES_DIR ?? DEFAULT_OUT_DIR;

  fs.mkdirSync(outDir, { recursive: true });

  const generated: Array<{
    file: string;
    bpm: number;
    bytes: number;
    sampleRate: number;
    durationSeconds: number;
    channels: number;
  }> = [];

  for (const bpm of SYNTHETIC_BPM_MATRIX) {
    const file = syntheticFixtureFilename(bpm);
    const absolutePath = path.join(outDir, file);

    const samples = generateKickClickTrack({
      bpm,
      durationSeconds: SYNTHETIC_FIXTURE_DURATION_SECONDS,
      sampleRate: SYNTHETIC_FIXTURE_SAMPLE_RATE,
    });
    const wav = encodeMonoWavPcm16(samples, SYNTHETIC_FIXTURE_SAMPLE_RATE);
    fs.writeFileSync(absolutePath, wav);

    const meta = await validateWithAudioDecode(absolutePath);
    if (meta.sampleRate !== SYNTHETIC_FIXTURE_SAMPLE_RATE) {
      throw new Error(`${file}: sampleRate ${meta.sampleRate}`);
    }
    if (meta.channels !== 1) {
      throw new Error(`${file}: channels ${meta.channels}`);
    }
    if (Math.abs(meta.durationSeconds - SYNTHETIC_FIXTURE_DURATION_SECONDS) > 0.05) {
      throw new Error(
        `${file}: duration ${meta.durationSeconds} (expected ~${SYNTHETIC_FIXTURE_DURATION_SECONDS})`,
      );
    }

    generated.push({
      file,
      bpm,
      bytes: wav.length,
      sampleRate: meta.sampleRate,
      durationSeconds: Number(meta.durationSeconds.toFixed(3)),
      channels: meta.channels,
    });
  }

  console.log(
    JSON.stringify(
      {
        outDir,
        count: generated.length,
        sampleRate: SYNTHETIC_FIXTURE_SAMPLE_RATE,
        durationSeconds: SYNTHETIC_FIXTURE_DURATION_SECONDS,
        channels: 1,
        format: "WAV PCM16 mono",
        files: generated,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
