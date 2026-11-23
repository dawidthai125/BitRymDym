/**
 * YouTube videos of catalogue beats (channel @bitrymdym). Pure data, client-safe.
 * New uploads are also picked up live from the channel RSS (beat-videos.ts); this list
 * keeps videos that dropped out of the 15-item feed. Synced from the autopost queue.
 */
export type BeatVideo = { videoId: string; uploadDate: string; title?: string };

export const YOUTUBE_CHANNEL_ID = "UCW_rCfBRpEUgAHPpo1V36nA";

export const BEAT_VIDEOS: Readonly<Record<string, BeatVideo>> = {
  "cf6d9a70-5a5e-443c-a117-263f678a72f1": { videoId: "yWY7JM4xf5k", uploadDate: "2026-11-23" },
  "fd1f8593-10e6-4a9d-b234-5726a9a5db2e": { videoId: "11JEPpFBN0w", uploadDate: "2026-11-23" },
};
