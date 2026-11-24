/** Public fields the Windows recorder may see. No service role, no audio URL. */

export type DesktopBeatChoice = {
  id: string;
  title: string;
  bpm: number;
  /** Beat length for the recorder timeline. 0 when unknown. */
  durationSeconds?: number;
};

/** Far above the free catalogue (35 on 2026-11-24). At the old 40 the oldest beats would soon drop out of the program. */
export const DESKTOP_BEAT_LIMIT = 1000;

export function desktopBootstrapBody(input: {
  supabaseUrl: string | undefined;
  anonKey: string | undefined;
  beats: DesktopBeatChoice[];
}): {
  supabaseUrl: string;
  anonKey: string;
  beats: DesktopBeatChoice[];
} {
  const supabaseUrl = input.supabaseUrl?.trim() ?? "";
  const anonKey = input.anonKey?.trim() ?? "";
  if (!supabaseUrl || !anonKey) {
    throw new Error("Klient publiczny nie jest ustawiony.");
  }
  return {
    supabaseUrl,
    anonKey,
    beats: input.beats.slice(0, DESKTOP_BEAT_LIMIT).map((beat) => ({
      id: beat.id,
      title: beat.title,
      bpm: Number.isFinite(beat.bpm) ? beat.bpm : 0,
      durationSeconds:
        typeof beat.durationSeconds === "number" && Number.isFinite(beat.durationSeconds) && beat.durationSeconds > 0
          ? Math.round(beat.durationSeconds)
          : 0,
    })),
  };
}
