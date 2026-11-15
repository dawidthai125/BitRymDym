/** Pure checks for a paid-catalog wav sale. No database and no price from the client. */

const WAV_TYPES = new Set(["audio/wav", "audio/x-wav", "audio/wave", "audio/vnd.wave"]);

export function isPurchasedWavContentType(contentType: string | null | undefined): boolean {
  if (typeof contentType !== "string") return false;
  return WAV_TYPES.has(contentType.trim().toLowerCase());
}
