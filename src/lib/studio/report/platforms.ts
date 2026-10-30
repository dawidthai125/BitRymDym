/**
 * Gaps P1 #7 — streaming platform loudness check (pure). Uses the master's measured
 * integrated LUFS + true peak; normalisation is a plain gain offset on playback.
 * Reference levels (2026, see docs): Spotify −14 (down + up, up only while peaks stay
 * ≤ −1 dBTP), YouTube −14 (down only), Apple Music −16 (Sound Check, down + up limited
 * by peaks, never limits), TikTok ≈ −14 (not published — community-measured, down only).
 */
export const STREAMING_PLATFORMS = [
  { id: "spotify", lufs: -14, turnsUp: true, published: true },
  { id: "youtube", lufs: -14, turnsUp: false, published: true },
  { id: "apple", lufs: -16, turnsUp: true, published: true },
  { id: "tiktok", lufs: -14, turnsUp: false, published: false },
] as const;
export type StreamingPlatformId = (typeof STREAMING_PLATFORMS)[number]["id"];

/** Encoders (Ogg/AAC/MP3) add inter-sample peaks: keep ≤ −1 dBTP, ≤ −2 dBTP when louder than −14 LUFS. */
export const PLATFORM_TP_CEILING = -1;
export const PLATFORM_TP_CEILING_LOUD = -2;
/** Peak headroom kept when a platform turns a quiet track up. */
const UP_PEAK_LIMIT = -1;

export type PlatformVerdict = {
  id: StreamingPlatformId;
  referenceLufs: number;
  /** Playback gain the platform applies (dB, − = turned down). */
  gainDb: number;
  /** Loudness the listener hears. */
  playbackLufs: number;
  /** Turned up less than needed because of peak headroom. */
  peakLimited: boolean;
  published: boolean;
  kind: "down" | "up" | "same";
};
export type PlatformCheck = {
  lufs: number;
  truePeakDb: number;
  platforms: PlatformVerdict[];
  tp: { status: "ok" | "warn" | "over"; ceiling: number };
};

const r1 = (n: number) => Math.round(n * 10) / 10;

export function checkPlatforms(lufs: number, truePeakDb: number): PlatformCheck | null {
  if (!Number.isFinite(lufs) || !Number.isFinite(truePeakDb)) return null;
  const platforms = STREAMING_PLATFORMS.map((p): PlatformVerdict => {
    let gain = p.lufs - lufs;
    let peakLimited = false;
    if (gain > 0) {
      if (!p.turnsUp) gain = 0;
      else {
        const room = Math.max(0, UP_PEAK_LIMIT - truePeakDb);
        if (room < gain) {
          gain = room;
          peakLimited = true;
        }
      }
    }
    const g = r1(gain);
    return { id: p.id, referenceLufs: p.lufs, gainDb: g === 0 ? 0 : g, playbackLufs: r1(lufs + gain), peakLimited, published: p.published, kind: g < 0 ? "down" : g > 0 ? "up" : "same" };
  });
  const ceiling = lufs > -14 ? PLATFORM_TP_CEILING_LOUD : PLATFORM_TP_CEILING;
  const status = truePeakDb > PLATFORM_TP_CEILING + 0.05 ? "over" : truePeakDb > ceiling + 0.05 ? "warn" : "ok";
  return { lufs: r1(lufs), truePeakDb: r1(truePeakDb), platforms, tp: { status, ceiling } };
}
