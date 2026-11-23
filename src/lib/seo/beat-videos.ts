import "server-only";

import { BEAT_VIDEOS, YOUTUBE_CHANNEL_ID, type BeatVideo } from "@/lib/seo/beat-videos-data";

const FEED = `https://www.youtube.com/feeds/videos.xml?channel_id=${YOUTUBE_CHANNEL_ID}`;
const BEAT_LINK = /bitrymdym\.pl\/(?:en\/)?beat\/([0-9a-f-]{36})/i;

/** Parse the channel Atom feed: videos whose description links to a beat page. */
export function parseChannelFeed(xml: string): Record<string, BeatVideo> {
  const out: Record<string, BeatVideo> = {};
  for (const entry of xml.split("<entry>").slice(1)) {
    const videoId = /<yt:videoId>([^<]+)<\/yt:videoId>/.exec(entry)?.[1];
    const published = /<published>([^<]+)<\/published>/.exec(entry)?.[1];
    const desc = /<media:description>([\s\S]*?)<\/media:description>/.exec(entry)?.[1] ?? "";
    const title = /<media:title>([^<]+)<\/media:title>/.exec(entry)?.[1];
    const beatId = BEAT_LINK.exec(desc)?.[1]?.toLowerCase();
    if (videoId && beatId && !out[beatId]) out[beatId] = { videoId, uploadDate: (published ?? "").slice(0, 10), title };
  }
  return out;
}

async function feedVideos(): Promise<Record<string, BeatVideo>> {
  try {
    const res = await fetch(FEED, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(3000) });
    if (!res.ok) return {};
    return parseChannelFeed(await res.text());
  } catch {
    return {};
  }
}

/** YouTube video of a beat: static list first, then the live channel feed. */
export async function getBeatVideo(beatId: string): Promise<BeatVideo | null> {
  return BEAT_VIDEOS[beatId] ?? (await feedVideos())[beatId] ?? null;
}
