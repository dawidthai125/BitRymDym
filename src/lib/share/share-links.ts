/**
 * Share targets (pure, client-safe). Only public web intents — no SDKs, no tracking pixels.
 */
export type ShareTarget = "facebook" | "x" | "whatsapp";
export const SHARE_TARGETS: readonly ShareTarget[] = ["facebook", "x", "whatsapp"];

export function shareUrl(target: ShareTarget, url: string, text: string): string {
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(text);
  switch (target) {
    case "facebook":
      return `https://www.facebook.com/sharer/sharer.php?u=${u}`;
    case "x":
      return `https://x.com/intent/post?url=${u}&text=${t}`;
    case "whatsapp":
      return `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`.trim())}`;
  }
}

/** Absolute URL from a site origin + path (no double slashes). */
export function absoluteUrl(origin: string, path: string): string {
  return `${origin.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

/** Text fragment for cards / share text: collapse whitespace, cut on a word with an ellipsis. */
export function clampText(s: string | null | undefined, max: number): string {
  const v = (s ?? "").replace(/\s+/g, " ").trim();
  if (v.length <= max) return v;
  const cut = v.slice(0, max - 1);
  const sp = cut.lastIndexOf(" ");
  return `${(sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,.;:–-]+$/, "")}…`;
}

export type NativeShareResult = "shared" | "cancelled" | "unsupported" | "failed";
type ShareCapableNavigator = { share?: (data: ShareData) => Promise<void>; canShare?: (data: ShareData) => boolean };

/**
 * Web Share API (system share sheet on phones → Instagram, WhatsApp, Messenger…).
 * "cancelled" = the user closed the sheet (AbortError) — do nothing; "unsupported"/"failed" → caller copies the link.
 */
export async function tryNativeShare(nav: ShareCapableNavigator | null | undefined, data: ShareData): Promise<NativeShareResult> {
  if (!nav || typeof nav.share !== "function") return "unsupported";
  try {
    if (typeof nav.canShare === "function" && !nav.canShare(data)) return "unsupported";
  } catch {
    return "unsupported";
  }
  try {
    await nav.share(data);
    return "shared";
  } catch (e) {
    return (e as { name?: string } | null)?.name === "AbortError" ? "cancelled" : "failed";
  }
}
