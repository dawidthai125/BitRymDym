/**
 * Reads sesja.brd.json from the Windows recorder (Studio Offline).
 * Same shape as desktop/recorder/offline_session.py. No audio, no beat bytes.
 */

export const RECORDER_SESSION_FORMAT = "bitrymdym.sesja";
export const RECORDER_SESSION_VERSION = 1;
export const OFFLINE_VOCALS = 16;
export const OFFLINE_EXTRAS = 6;
export const SITE_GOLD_TRACKS = 16;

export const RECORDER_RIGHTS_NOTE =
  "Program nie sprawdza praw ani licencji bitu, wokalu, podbić i adlibów. " +
  "Własny bit zostaje na tym komputerze i nie jedzie na stronę. " +
  "Stemy (osobne pliki WAV ścieżek, czysta nagrywka od 0:00) zapisujesz u siebie, " +
  "a potem wrzucasz je ręcznie: www.bitrymdym.pl → Studio → Utwórz projekt. " +
  "W sesji studia plan Gold układa ścieżki. " +
  "Plik sesji zapisuje kolejność, miejsce na osi, czas, głośność i balans lewo–prawo.";

export type RecorderSessionClip = {
  start: number;
  end: number;
  in: number;
  out: number;
};

export type RecorderSessionTrack = {
  order: number;
  role: "wokal" | "podbicie";
  name: string;
  gainDb: number;
  pan: number;
  muted: boolean;
  solo: boolean;
  stem: string;
  clips: RecorderSessionClip[];
};

export type RecorderSession = {
  title: string;
  savedAt: string;
  rightsNote: string;
  beatFileName: string;
  beatSeconds: number;
  beatGainDb: number;
  beatPan: number;
  beatMuted: boolean;
  tracks: RecorderSessionTrack[];
};

function clampGain(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(-24, Math.min(12, number));
}

function clampPan(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(-1, Math.min(1, number));
}

export function panText(pan: number): string {
  const bounded = clampPan(pan);
  const steps = Math.round(Math.abs(bounded) * 100);
  if (steps < 5) return "C";
  if (bounded < 0) return `L ${steps}`;
  return `R ${steps}`;
}

export function clockText(seconds: number): string {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const whole = Math.floor(safe);
  const minutes = Math.floor(whole / 60);
  const rest = (safe % 60).toFixed(2).padStart(5, "0");
  return `${minutes}:${rest}`;
}

function fileTitle(name: string): string {
  const text = name.split("\\").join("/").replace(/\/+$/, "");
  const slash = text.lastIndexOf("/");
  return slash >= 0 ? text.slice(slash + 1) : text;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clipRow(raw: unknown): RecorderSessionClip | null {
  if (!isRecord(raw)) return null;
  const start = typeof raw.start === "number" ? Math.max(0, raw.start) : 0;
  const srcIn = typeof raw.in === "number" ? Math.max(0, raw.in) : 0;
  const srcOut = typeof raw.out === "number" ? raw.out : 0;
  if (srcOut - srcIn < 0.01) return null;
  const end = typeof raw.end === "number" ? raw.end : start + (srcOut - srcIn);
  return {
    start: Math.round(start * 1000) / 1000,
    end: Math.round(Math.max(end, start + (srcOut - srcIn)) * 1000) / 1000,
    in: Math.round(srcIn * 1000) / 1000,
    out: Math.round(srcOut * 1000) / 1000,
  };
}

export function parseRecorderSession(raw: unknown): RecorderSession | null {
  if (!isRecord(raw)) return null;
  if (raw.format !== RECORDER_SESSION_FORMAT || raw.version !== RECORDER_SESSION_VERSION) return null;
  if ("audio" in raw || "audioBase64" in raw) return null;
  const beat = raw.beat;
  if (!isRecord(beat) || beat.included === true || "audio" in beat || "audioBase64" in beat) return null;
  if (!Array.isArray(raw.tracks)) return null;

  const tracks: RecorderSessionTrack[] = [];
  for (const item of raw.tracks) {
    if (!isRecord(item) || !Array.isArray(item.clips)) continue;
    const clips = item.clips.map(clipRow).filter((clip): clip is RecorderSessionClip => clip !== null);
    if (clips.length === 0) continue;
    const order = tracks.length + 1;
    const name = String(item.name ?? `Ścieżka ${order}`).slice(0, 40);
    tracks.push({
      order,
      role: item.role === "podbicie" ? "podbicie" : "wokal",
      name,
      gainDb: Math.round(clampGain(item.gainDb ?? item.gain_db) * 100) / 100,
      pan: Math.round(clampPan(item.pan) * 1000) / 1000,
      muted: Boolean(item.muted),
      solo: Boolean(item.solo),
      stem: String(item.stem ?? ""),
      clips,
    });
  }

  const rights = isRecord(raw.rights) && typeof raw.rights.note === "string" ? raw.rights.note.trim() : "";
  const beatSeconds = typeof beat.durationSeconds === "number" && beat.durationSeconds > 0 ? beat.durationSeconds : 0;

  return {
    title: String(raw.title ?? "Nagranie").trim().slice(0, 80) || "Nagranie",
    savedAt: typeof raw.savedAt === "string" ? raw.savedAt : "",
    rightsNote: rights || RECORDER_RIGHTS_NOTE,
    beatFileName: fileTitle(typeof beat.fileName === "string" ? beat.fileName : ""),
    beatSeconds: Math.round(beatSeconds * 1000) / 1000,
    beatGainDb: Math.round(clampGain(beat.gainDb) * 100) / 100,
    beatPan: Math.round(clampPan(beat.pan) * 1000) / 1000,
    beatMuted: Boolean(beat.muted),
    tracks,
  };
}

export function sessionSpanSeconds(session: RecorderSession): number {
  let end = session.beatSeconds;
  for (const track of session.tracks) {
    for (const clip of track.clips) end = Math.max(end, clip.end);
  }
  return Math.max(end, 1);
}

export function sessionChecklist(session: RecorderSession): string[] {
  const lines = [
    `Bit (zostaje u Ciebie, nie jedzie na stronę): ${session.beatFileName || "niepodany"}, ${clockText(session.beatSeconds)}, ${session.beatGainDb >= 0 ? "+" : ""}${Math.round(session.beatGainDb)} dB, ${panText(session.beatPan)}${session.beatMuted ? ", wyciszony" : ""}.`,
  ];
  for (const track of session.tracks) {
    const start = track.clips[0]?.start ?? 0;
    const role = track.role === "podbicie" ? "podbicie / adlib" : "wokal";
    const gain = `${track.gainDb >= 0 ? "+" : ""}${Math.round(track.gainDb)} dB`;
    const marks = [track.muted ? "wyciszona" : "", track.solo ? "solo" : ""].filter(Boolean).join(", ");
    lines.push(
      `${String(track.order).padStart(2, "0")}. ${track.name} (${role}) od ${clockText(start)}, ${gain}, ${panText(track.pan)}${marks ? `, ${marks}` : ""}, plik ${track.stem}`,
    );
  }
  return lines;
}
