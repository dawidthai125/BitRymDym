/**
 * AI image provider for the cover generator: Cloudflare Workers AI FLUX.1 schnell only
 * (env CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_AI_TOKEN; 10k neurons/day ≈ 57 images, reset
 * 00:00 UTC, exhausted → HTTP 429 / code 3036). When it fails the user gets the friendly
 * "allFailed" message — there is deliberately NO third-party fallback (the former
 * Pollinations failover was removed 2026-10-31: no DPA, processing outside the EEA).
 * Keys come from server env only and are sent as headers, never in URLs or logs.
 */
import type { AiCoverAspect } from "./config";

/**
 * "pollinations" is a legacy id only: historical rows in studio_ai_cover_generations /
 * studio_ai_provider_state may carry it. No Pollinations provider exists anymore.
 */
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
        // FLUX schnell on Workers AI renders 1024² only → the server crops to 16:9. The schema
        // rejects any other property (live: `seed` → 400 code 5006), so only prompt + steps.
        body: JSON.stringify({ prompt: input.prompt, steps: 4 }),
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

/** Cloudflare only (no external fallback). No Cloudflare → no providers (generator off). */
export function aiImageProvidersFromEnv(env: Env, fetchFn?: FetchFn): AiImageProvider[] {
  const out: AiImageProvider[] = [];
  const accountId = env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const token = env.CLOUDFLARE_AI_TOKEN?.trim();
  if (!accountId || !token) return out;
  out.push(cloudflareProvider({ accountId, token, fetchFn }));
  return out;
}
