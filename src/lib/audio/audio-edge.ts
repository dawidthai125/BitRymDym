/**
 * When BITRYMDYM_AUDIO_EDGE_ORIGIN is set, beat listens go to the VPS cache
 * instead of Supabase Storage. The edge checks the signed URL and serves the
 * file from disk. Other buckets stay on Supabase.
 */
export function rewriteThroughAudioEdge(signedUrl: string): string {
  const origin = process.env.BITRYMDYM_AUDIO_EDGE_ORIGIN?.trim().replace(/\/$/, "") ?? "";
  if (!origin.startsWith("https://")) return signedUrl;
  let parsed: URL;
  try {
    parsed = new URL(signedUrl);
  } catch {
    return signedUrl;
  }
  if (parsed.protocol !== "https:") return signedUrl;
  if (!parsed.pathname.startsWith("/storage/v1/object/sign/beat-audio/")) return signedUrl;
  if (parsed.pathname.includes("..")) return signedUrl;
  return `${origin}/s?u=${encodeURIComponent(parsed.toString())}`;
}
