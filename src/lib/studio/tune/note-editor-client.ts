/**
 * BRD Tune note editor (Gold) — browser side: decode the track's take clips,
 * detect notes on the track timeline, and render a short note preview with
 * the SAME TuneCore (anchored on the timeline) that the E3 render runs.
 */
import type { StudioTuneNoteEdit } from "@/lib/studio/studio-fx-chain";

import { detectPitchTrack, monoMix, segmentNotes, type DetectedNote } from "./note-detect";
import { TuneCore } from "./tune-core";
import { toTuneCoreParams } from "./tune";
import type { StudioFxTuneParams } from "@/lib/studio/studio-fx-chain";

export type NoteEditorClip = {
  id: string;
  sourceKind: string;
  sourceTakeId: string | null;
  sourceBeatId: string | null;
  sourceArtifactId: string | null;
  sourceOffsetMs: number;
  timelineStartMs: number;
  durationMs: number;
  muted?: boolean;
};

export type DecodedTrackClip = { clip: NoteEditorClip; sampleRate: number; channels: Float32Array[] };

export const NOTE_PREVIEW_SR = 44100;

/** Decode every unmuted TAKE clip of the track (sequentially: bounded memory). */
export async function decodeTrackClips(
  clips: readonly NoteEditorClip[],
  resolveUrl: (clip: NoteEditorClip) => Promise<string | null>,
): Promise<DecodedTrackClip[]> {
  if (typeof OfflineAudioContext === "undefined") return [];
  const out: DecodedTrackClip[] = [];
  for (const clip of clips) {
    if (clip.muted || clip.sourceKind !== "TAKE" || clip.durationMs < 50) continue;
    const url = await resolveUrl(clip).catch(() => null);
    if (!url) continue;
    const bytes = await fetch(url)
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .catch(() => null);
    if (!bytes) continue;
    try {
      const ctx = new OfflineAudioContext(1, 1, NOTE_PREVIEW_SR);
      const audio = await ctx.decodeAudioData(bytes);
      const channels = Array.from({ length: Math.min(2, audio.numberOfChannels) }, (_, c) => audio.getChannelData(c));
      out.push({ clip, sampleRate: audio.sampleRate, channels });
    } catch {
      /* undecodable take → skipped */
    }
  }
  return out;
}

/** Notes of one decoded clip mapped onto the track timeline (clip window only). */
export function clipNotesOnTimeline(decoded: DecodedTrackClip): DetectedNote[] {
  const { clip, sampleRate, channels } = decoded;
  const from = Math.max(0, Math.floor((clip.sourceOffsetMs / 1000) * sampleRate));
  const to = Math.min(channels[0]!.length, from + Math.ceil((clip.durationMs / 1000) * sampleRate));
  const mono = monoMix(channels.map((c) => c.subarray(from, to)));
  const shift = clip.timelineStartMs;
  return segmentNotes(detectPitchTrack(mono, sampleRate)).map((n) => ({
    ...n,
    startMs: n.startMs + shift,
    endMs: n.endMs + shift,
  }));
}

export function detectTrackNotes(decoded: readonly DecodedTrackClip[]): DetectedNote[] {
  return decoded.flatMap(clipNotesOnTimeline).sort((a, b) => a.startMs - b.startMs);
}

/**
 * Stereo slice of the dry track on the timeline [startMs, endMs) (clips summed),
 * optionally tuned with TuneCore anchored at startMs (latency compensated).
 */
export function renderTrackSlice(
  decoded: readonly DecodedTrackClip[],
  startMs: number,
  endMs: number,
  tune: { params: StudioFxTuneParams; notes: readonly StudioTuneNoteEdit[] } | null,
): { left: Float32Array; right: Float32Array; sampleRate: number } {
  const sr = decoded[0]?.sampleRate ?? NOTE_PREVIEW_SR;
  const len = Math.max(1, Math.round(((endMs - startMs) / 1000) * sr));
  const left = new Float32Array(len);
  const right = new Float32Array(len);
  for (const { clip, channels, sampleRate } of decoded) {
    if (sampleRate !== sr) continue;
    const l = channels[0]!;
    const r = channels[1] ?? l;
    const clipStart = Math.round((clip.timelineStartMs / 1000) * sr);
    const clipEnd = clipStart + Math.round((clip.durationMs / 1000) * sr);
    const srcOff = Math.round((clip.sourceOffsetMs / 1000) * sr);
    const winStart = Math.round((startMs / 1000) * sr);
    for (let i = 0; i < len; i += 1) {
      const t = winStart + i;
      if (t < clipStart || t >= clipEnd) continue;
      const s = srcOff + (t - clipStart);
      if (s < 0 || s >= l.length) continue;
      left[i]! += l[s]!;
      right[i]! += r[s]!;
    }
  }
  if (!tune) return { left, right, sampleRate: sr };
  const core = new TuneCore(sr, 2, toTuneCoreParams(tune.params, tune.notes));
  core.setTimeOrigin(Math.round((startMs / 1000) * sr));
  const L = core.latency;
  const outL = new Float32Array(len);
  const outR = new Float32Array(len);
  for (let i = 0; i < len + L; i += 1) {
    core.step(i < len ? left[i]! : 0, i < len ? right[i]! : 0);
    if (i >= L) {
      outL[i - L] = core.outL;
      outR[i - L] = core.outR;
    }
  }
  return { left: outL, right: outR, sampleRate: sr };
}
