/**
 * AI image providers for the cover generator. Free tiers only:
 *  - Cloudflare Workers AI FLUX.1 schnell (env CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_AI_TOKEN;
 *    10k neurons/day ≈ 57 images, reset 00:00 UTC, exhausted → HTTP 429 / code 3036),
 *  - Pollinations.ai (Classic API, no key: one image per IP every ~45 s, 402 + Retry-After
 *    beyond that; optional POLLINATIONS_API_KEY → gen.pollinations.ai, no logo).
 * Keys come from server env only and are sent as headers, never in URLs or logs.
 */
import type { AiCoverAspect } from "./config";

export type AiProviderId = "cloudflare" | "pollinations";
export type AiImageErrorKind = "limit" | "rate" | "timeout" | "server" | "network" | "auth" | "bad_response" | "refused";

export class AiImageError extends Error {
  constructor(
    readonly kind: AiImageErrorKind,
    /** Absolute epoch ms until which the provider should be skipped (limit / rate). */
    readonly blockedUntil?: number,
    readonly status?: number,
  ) {
    super(`ai image ${kind}${status ? ` ${status}` : ""}`);
  }
}

export type AiImageInput = { prompt: string; aspect: AiCoverAspect; seed: number };
export interface AiImageProvider {
  id: AiProviderId;
  generate(input: AiImageInput, signal: AbortSignal): Promise<Buffer>;
}

type Env = Record<string, string | undefined>;
type FetchFn = typeof fetch;

/** Next 00:00 UTC after `now` (Cloudflare's free allocation reset). */
export function nextUtcMidnight(now: number): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
}

/** Retry-After (seconds or HTTP date) → absolute ms; fallback when missing / odd. */
export function retryAfterMs(header: string | null, now: number, fallbackMs: number): number {
  if (header) {
    const s = Number(header);
    if (Number.isFinite(s) && s >= 0) return now + Math.min(s, 86_400) * 1000;
    const t = Date.parse(header);
    if (Number.isFinite(t) && t > now) return Math.min(t, now + 86_400_000);
  }
  return now + fallbackMs;
}

async function call(f: FetchFn, url: string, init: RequestInit, signal: AbortSignal): Promise<Response> {
  try {
    return await f(url, { ...init, signal, cache: "no-store" });
  } catch {
    if (signal.aborted) throw new AiImageError("timeout");
    throw new AiImageError("network");
  }
}

async function body(res: Response, signal: AbortSignal): Promise<Buffer> {
  try {
    return Buffer.from(await res.arrayBuffer());
  } catch {
    if (signal.aborted) throw new AiImageError("timeout");
    throw new AiImageError("network");
  }
}

const isImage = (b: Buffer) =>
  b.length > 1000 && ((b[0] === 0xff && b[1] === 0xd8) || (b[0] === 0x89 && b[1] === 0x50) || b.subarray(8, 12).toString("latin1") === "WEBP");

export const CLOUDFLARE_FLUX_MODEL = "@cf/black-forest-labs/flux-1-schnell";

export function cloudflareProvider(opts: { accountId: string; token: string; fetchFn?: FetchFn; now?: () => number }): AiImageProvider {
  const f = opts.fetchFn ?? fetch;
  const now = opts.now ?? Date.now;
  return {
    id: "cloudflare",
    async generate(input, signal) {
      const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(opts.accountId)}/ai/run/${CLOUDFLARE_FLUX_MODEL}`;
      const res = await call(f, url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.token}` },
        // FLUX schnell on Workers AI renders 1024² only → the server crops to 16:9.
        body: JSON.stringify({ prompt: input.prompt, steps: 4, seed: input.seed }),
      }, signal);
      type CfBody = { success?: boolean; result?: { image?: unknown }; errors?: { code?: number }[] };
      let json: CfBody | null = null;
      try {
        json = (await res.json()) as CfBody;
      } catch {
        if (signal.aborted) throw new AiImageError("timeout");
        json = null;
      }
      const codes = (json?.errors ?? []).map((e: { code?: number }) => e?.code);
      // 3036 = daily free allocation used up → skip until the 00:00 UTC reset.
      if (codes.includes(3036)) throw new AiImageError("limit", nextUtcMidnight(now()), res.status);
      if (res.status === 429) throw new AiImageError("rate", retryAfterMs(res.headers.get("retry-after"), now(), 60_000), 429);
      if (res.status === 401 || res.status === 403) throw new AiImageError("auth", undefined, res.status);
      if (res.status >= 500) throw new AiImageError("server", undefined, res.status);
      if (!res.ok) throw new AiImageError(codes.length ? "refused" : "bad_response", undefined, res.status);
      const b64 = json?.result?.image;
      if (typeof b64 !== "string" || !b64) throw new AiImageError("bad_response", undefined, res.status);
      const img = Buffer.from(b64, "base64");
      if (!isImage(img)) throw new AiImageError("bad_response", undefined, res.status);
      return img;
    },
  };
}

export function pollinationsProvider(opts: { apiKey?: string; fetchFn?: FetchFn; now?: () => number; size: (a: AiCoverAspect) => { w: number; h: number } }): AiImageProvider {
  const f = opts.fetchFn ?? fetch;
  const now = opts.now ?? Date.now;
  return {
    id: "pollinations",
    async generate(input, signal) {
      const { w, h } = opts.size(input.aspect);
      const q = new URLSearchParams({ width: String(w), height: String(h), seed: String(input.seed), nologo: "true", safe: "true", private: "true" });
      const p = encodeURIComponent(input.prompt);
      const url = opts.apiKey
        ? `https://gen.pollinations.ai/image/${p}?${new URLSearchParams({ ...Object.fromEntries(q), model: "black-forest-labs/flux.1-schnell" })}`
        : `https://image.pollinations.ai/prompt/${p}?${q}`;
      const res = await call(f, url, { method: "GET", headers: opts.apiKey ? { Authorization: `Bearer ${opts.apiKey}` } : {} }, signal);
      // Free tier beyond the per-IP slot → 402 + Retry-After (also accept 429).
      if (res.status === 402 || res.status === 429) {
        throw new AiImageError("rate", retryAfterMs(res.headers.get("retry-after"), now(), 60_000), res.status);
      }
      if (res.status === 401 || res.status === 403) throw new AiImageError("auth", undefined, res.status);
      if (res.status >= 500) throw new AiImageError("server", undefined, res.status);
      if (!res.ok) throw new AiImageError(res.status === 400 ? "refused" : "bad_response", undefined, res.status);
      if (!(res.headers.get("content-type") ?? "").startsWith("image/")) throw new AiImageError("bad_response", undefined, res.status);
      const img = await body(res, signal);
      if (!isImage(img)) throw new AiImageError("bad_response", undefined, res.status);
      return img;
    },
  };
}

/** Order: Cloudflare first when configured, then Pollinations (always available). */
export function aiImageProvidersFromEnv(env: Env, size: (a: AiCoverAspect) => { w: number; h: number }, fetchFn?: FetchFn): AiImageProvider[] {
  const out: AiImageProvider[] = [];
  const accountId = env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const token = env.CLOUDFLARE_AI_TOKEN?.trim();
  if (accountId && token) out.push(cloudflareProvider({ accountId, token, fetchFn }));
  out.push(pollinationsProvider({ apiKey: env.POLLINATIONS_API_KEY?.trim() || undefined, fetchFn, size }));
  return out;
}
