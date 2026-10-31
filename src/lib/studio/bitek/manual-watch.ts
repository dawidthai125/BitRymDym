/**
 * One note when a manual mix/master move is clearly bad.
 * Numbers come from the last measurement plus the faders as they are now.
 * No measurement → no balance/peak claim.
 */

export type WatchLang = "pl" | "en";

export type WatchTrack = {
  id: string;
  name: string;
  role: string;
  gainDb: number;
  pan: number;
  muted: boolean;
  hasAudio: boolean;
  eqGainDb: number | null;
  compressorRatio: number | null;
};

export type WatchMixInput = {
  lang: WatchLang;
  tracks: WatchTrack[];
  /** Gains at the moment `vocalVsBeatLu` / peaks were measured. */
  baseline: null | {
    vocalVsBeatLu: number | null;
    vocalGainDb: number;
    beatGainDb: number;
    masterTruePeakDbtp: number | null;
    tracks: { id: string; samplePeakDbfs: number; gainDb: number }[];
  };
};

export type WatchMasterInput = {
  lang: WatchLang;
  measuredLufs: number | null;
  truePeakDb: number | null;
  targetLufs: number;
  ceilingDb: number;
  loudness: number;
};

export type ManualFix =
  | { kind: "controls"; trackId: string; gainDb?: number; pan?: number; muted?: boolean }
  | { kind: "eqFlat"; trackId: string }
  | { kind: "compressorEase"; trackId: string }
  | { kind: "masterLoudness"; value: number };

export type ManualIssue = { key: string; text: string; fix: ManualFix | null };

const round1 = (n: number) => Math.round(n * 10) / 10;
const fmt = (n: number) => `${n > 0 ? "+" : n < 0 ? "\u2212" : ""}${Math.abs(round1(n))}`;

function lead(tracks: WatchTrack[]): WatchTrack | undefined {
  return tracks.find((t) => t.role === "lead_vocal" && t.hasAudio);
}
function beat(tracks: WatchTrack[]): WatchTrack | undefined {
  return tracks.find((t) => (t.role === "beat" || t.role === "instrument") && t.hasAudio && !t.muted);
}

export function watchMixManual(input: WatchMixInput): ManualIssue | null {
  const pl = input.lang === "pl";
  const vocal = lead(input.tracks);
  const vocals = input.tracks.filter((t) => t.role === "lead_vocal" && t.hasAudio);
  if (vocals.length > 0 && vocals.every((t) => t.muted)) {
    const name = vocals[0]!.name || (pl ? "wokal" : "vocal");
    return {
      key: "mute-vocal",
      text: pl
        ? `Nie tak — „${name}” jest wyciszony, a to jedyny wokal z nagraniem. Reszta miksu gra bez głosu.`
        : `Not like that — “${name}” is muted and it's the only vocal with audio. The mix is playing without the voice.`,
      fix: { kind: "controls", trackId: vocals[0]!.id, muted: false },
    };
  }
  const base = input.baseline;
  if (base && vocal) {
    const peak = base.tracks.find((t) => t.id === vocal.id);
    if (peak && Number.isFinite(peak.samplePeakDbfs)) {
      const projected = peak.samplePeakDbfs + (vocal.gainDb - peak.gainDb);
      if (projected > -1) {
        const back = round1(Math.max(-24, vocal.gainDb - (projected - -6)));
        return {
          key: `clip:${vocal.id}`,
          text: pl
            ? `Nie tak — przy tym suwaku szczyt „${vocal.name}” wychodzi na ${fmt(projected)} dBFS (był ${fmt(peak.samplePeakDbfs)}). Ścięłoby to nagranie.`
            : `Not like that — at this fader “${vocal.name}” peaks at ${fmt(projected)} dBFS (it was ${fmt(peak.samplePeakDbfs)}). That clips the take.`,
          fix: back === vocal.gainDb ? null : { kind: "controls", trackId: vocal.id, gainDb: back },
        };
      }
    }
    const beatTrack = beat(input.tracks);
    if (base.vocalVsBeatLu !== null && beatTrack && Number.isFinite(base.vocalVsBeatLu)) {
      const projected = round1(base.vocalVsBeatLu + (vocal.gainDb - base.vocalGainDb) - (beatTrack.gainDb - base.beatGainDb));
      if (projected < -6 || projected > 6) {
        const delta = round1(1.5 - projected);
        const next = round1(Math.min(12, Math.max(-24, vocal.gainDb + delta)));
        const buried = projected < -6;
        return {
          key: buried ? "balance-buried" : "balance-hot",
          text: pl
            ? buried
              ? `Nie tak — wokal jest ${fmt(projected)} LU pod bitem (chcę go 0 do +3). Suwak zszedł za nisko.`
              : `Nie tak — wokal jest ${fmt(projected)} LU nad bitem (chcę go 0 do +3). Suwak poszedł za wysoko.`
            : buried
              ? `Not like that — the vocal is ${fmt(projected)} LU under the beat (I want it 0 to +3). The fader went too low.`
              : `Not like that — the vocal is ${fmt(projected)} LU over the beat (I want it 0 to +3). The fader went too high.`,
          fix: next === vocal.gainDb ? null : { kind: "controls", trackId: vocal.id, gainDb: next },
        };
      }
    }
  }
  if (vocal && Math.abs(vocal.pan) >= 0.75) {
    return {
      key: "pan-lead",
      text: pl
        ? `Nie tak — „${vocal.name}” siedzi na ${fmt(vocal.pan)} (panorama). Główny wokal ma być na środku, bo inaczej mix wali w jedną stronę.`
        : `Not like that — “${vocal.name}” is panned ${fmt(vocal.pan)}. The lead belongs in the centre, or the mix leans to one side.`,
      fix: { kind: "controls", trackId: vocal.id, pan: 0 },
    };
  }
  const eq = input.tracks.find((t) => t.hasAudio && t.eqGainDb !== null && Math.abs(t.eqGainDb) >= 12);
  if (eq) {
    return {
      key: `eq:${eq.id}`,
      text: pl
        ? `Nie tak — EQ na „${eq.name}” stoi na ${fmt(eq.eqGainDb!)} dB, czyli na samym końcu skali. To przerysuje pasmo.`
        : `Not like that — the EQ on “${eq.name}” is at ${fmt(eq.eqGainDb!)} dB, the end of the scale. That paints the band on too thick.`,
      fix: { kind: "eqFlat", trackId: eq.id },
    };
  }
  const comp = input.tracks.find((t) => t.hasAudio && t.compressorRatio !== null && t.compressorRatio >= 12);
  if (comp) {
    return {
      key: `comp:${comp.id}`,
      text: pl
        ? `Nie tak — kompresja na „${comp.name}” ma ratio ${comp.compressorRatio}:1. Przy takiej ścianie dźwięk się spłaszcza. Zwykle wystarcza około 3:1.`
        : `Not like that — compression on “${comp.name}” is at ${comp.compressorRatio}:1. That flattens the sound. About 3:1 is usually enough.`,
      fix: { kind: "compressorEase", trackId: comp.id },
    };
  }
  return null;
}

export function watchMasterManual(input: WatchMasterInput): ManualIssue | null {
  if (input.truePeakDb === null || !Number.isFinite(input.truePeakDb)) return null;
  if (input.truePeakDb <= input.ceilingDb + 0.05) return null;
  const over = round1(input.truePeakDb - input.ceilingDb);
  const next = round1(Math.max(-3, Math.min(3, input.loudness - over)));
  const pl = input.lang === "pl";
  const measured = input.measuredLufs !== null && Number.isFinite(input.measuredLufs) ? input.measuredLufs : null;
  return {
    key: "master-tp",
    text: pl
      ? `Nie tak — szczyt całości jest ${fmt(input.truePeakDb)} dBTP, a sufit celu to ${fmt(input.ceilingDb)}.${measured !== null ? ` Pomiar głośności to ${fmt(measured)} LUFS przy celu ${fmt(input.targetLufs)}.` : ""} Suwak głośności jest na ${fmt(input.loudness)}.`
      : `Not like that — the whole song peaks at ${fmt(input.truePeakDb)} dBTP and the target ceiling is ${fmt(input.ceilingDb)}.${measured !== null ? ` Loudness measures ${fmt(measured)} LUFS against a ${fmt(input.targetLufs)} target.` : ""} The loudness fader is at ${fmt(input.loudness)}.`,
    fix: next === round1(input.loudness) ? null : { kind: "masterLoudness", value: next },
  };
}
