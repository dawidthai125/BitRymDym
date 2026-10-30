import "server-only";

/**
 * Stage 3 (E3) — render the project mix on the worker from sources already in
 * storage (takes + beat), driven by the saved project document. Uses the SAME
 * TypeScript DSP as the browser preview (buildMixAnalysisSkeleton → renderTrack →
 * studio-offline-fx chains → master FX/gain/pan), so server and browser renders
 * match by construction; only decoding/resampling differs (ffmpeg vs WebAudio).
 */
import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { resolveFfmpegBin, runCapture } from "@/lib/audio/native-ffmpeg";
import { authorizeStudioExportSourcesForDocument } from "@/lib/audio/studio-export-source-resolution";
import { STUDIO_MAX_SONG_MS } from "@/config/studio";
import type { AuthContext } from "@/lib/auth/types";
import { buildMixAnalysisSkeleton } from "@/lib/studio/mix-analysis/client";
import type { MixAnalysisInput, MixAnalysisSource } from "@/lib/studio/mix-analysis/render";

import { ffmpegDecodeArgs, parseDecodedWav } from "./render-io";
import { getStudioProjectDocumentFor } from "@/lib/studio/studio-service";
import type { StudioProjectDocument } from "@/lib/studio/studio-types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

import type { Stereo } from "./dsp";
/** Same rate the browser preview renders at. */
export const MASTER_RENDER_SAMPLE_RATE = 44100;
const DECODE_CONCURRENCY = 3;

export type ServerMixInput = { doc: StudioProjectDocument; input: MixAnalysisInput; decodeMs: number };

/** The owner's project document must still be at `expectedVersion` (cheap check for cache hits). */
export async function assertServerDocVersion(p: { ownerId: string; projectId: string; expectedVersion: number }): Promise<void> {
  const ctx = { userId: p.ownerId, email: null, profile: null, permissions: [] } as unknown as AuthContext;
  const doc = await getStudioProjectDocumentFor(ctx, p.projectId);
  if (Number(doc.project.documentVersion) !== Number(p.expectedVersion)) throw new Error("doc_changed");
}

/**
 * Load the owner's project document (must still be at `expectedVersion`), re-authorise
 * every take/beat source, download + decode them at 44.1 kHz.
 */
export async function loadServerMixInput(p: { ownerId: string; projectId: string; expectedVersion: number; workDir: string; timeoutMs: number; onProgress?: (fraction: number) => void }): Promise<ServerMixInput> {
  const ctx = { userId: p.ownerId, email: null, profile: null, permissions: [] } as unknown as AuthContext;
  const doc = await getStudioProjectDocumentFor(ctx, p.projectId);
  if (Number(doc.project.documentVersion) !== Number(p.expectedVersion)) throw new Error("doc_changed");
  const t0 = Date.now();
  const { takes, beats } = await authorizeStudioExportSourcesForDocument({ jobOwnerId: p.ownerId, document: doc });
  const skeleton = buildMixAnalysisSkeleton(doc, MASTER_RENDER_SAMPLE_RATE);
  if (skeleton.lengthMs > STUDIO_MAX_SONG_MS + 1000) throw new Error("too_long");
  const admin = createSupabaseAdminClient();
  const sources: Record<string, MixAnalysisSource> = {};
  // Download + ffmpeg decode a few sources at a time (I/O and ffmpeg overlap).
  const keys = [...skeleton.sourceClips.keys()];
  let next = 0;
  const decodeOne = async (n: number, key: string) => {
    const [kind, id] = key.split(":") as ["take" | "beat", string];
    const ref = kind === "take" ? takes[id] : beats[id];
    if (!ref) return;
    const { data, error } = await admin.storage.from(ref.storageBucket).download(ref.objectKey);
    if (error || !data) throw new Error("source_missing");
    const src = path.join(p.workDir, `src-${n}`);
    const pcm = path.join(p.workDir, `src-${n}.wav`);
    await writeFile(src, Buffer.from(await data.arrayBuffer()));
    // ffmpeg decode + resample to 44.1 kHz float, native channels (any container/codec).
    await runCapture(resolveFfmpegBin(), ffmpegDecodeArgs(src, pcm, MASTER_RENDER_SAMPLE_RATE), { timeoutMs: p.timeoutMs });
    const raw = await readFile(pcm);
    await rm(src, { force: true });
    await rm(pcm, { force: true });
    sources[key] = parseDecodedWav(raw, true);
    p.onProgress?.(Object.keys(sources).length / keys.length);
  };
  await Promise.all(
    Array.from({ length: Math.min(DECODE_CONCURRENCY, keys.length) }, async () => {
      while (next < keys.length) {
        const n = next++;
        await decodeOne(n, keys[n]!);
      }
    }),
  );
  if (Object.keys(sources).length === 0) throw new Error("no_audio");
  const { sourceClips: _unused, ...rest } = skeleton;
  void _unused;
  return { doc, input: { ...rest, sources }, decodeMs: Date.now() - t0 };
}

/** Float32 stereo WAV on disk (lossless hand-off to master.py / ffmpeg, never uploaded). */
export async function writeWavFloat(file: string, s: Stereo) {
  const n = s.left.length;
  const dataBytes = n * 8;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write("RIFF", 0, "ascii"); buf.writeUInt32LE(36 + dataBytes, 4); buf.write("WAVE", 8, "ascii");
  buf.write("fmt ", 12, "ascii"); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(3, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(s.sampleRate, 24); buf.writeUInt32LE(s.sampleRate * 8, 28); buf.writeUInt16LE(8, 32); buf.writeUInt16LE(32, 34);
  buf.write("data", 36, "ascii"); buf.writeUInt32LE(dataBytes, 40);
  const f = new Float32Array(buf.buffer, buf.byteOffset + 44, n * 2);
  for (let i = 0; i < n; i++) { f[2 * i] = s.left[i]; f[2 * i + 1] = s.right[i]; }
  await writeFile(file, buf);
}
