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
    /** Cloudflare error codes, numbers only. Never the provider message. */
    readonly codes: readonly number[] = [],
  ) {
    super(
      `ai image ${kind}${status ? ` ${status}` : ""}${codes.length ? ` ${codes.join(",")}` : ""}`,
    );
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

function decodeImageString(value: string): Buffer {
  const dataUrl = value.match(/^data:image\/[a-z0-9.+-]+;base64,([\s\S]+)$/i);
  return Buffer.from((dataUrl ? dataUrl[1] : value).replace(/\s+/g, ""), "base64");
}

type CfError = { code?: number; message?: string };
type CfBody = { success?: boolean; result?: { image?: unknown } | string; errors?: CfError[] };

/** 3036 is the documented daily cap. 4006 is the same cap when the text says so, otherwise an outage. */
function cloudflareFailure(
  errors: CfError[],
  status: number,
  nowMs: number,
  retryAfter: string | null,
): AiImageError | null {
  const codes = errors
    .map((error) => error?.code)
    .filter((code): code is number => typeof code === "number");
  const quota = errors.some((error) =>
    /neuron|free allocation|paid plan/i.test(error?.message ?? ""),
  );
  const fail = (kind: AiImageErrorKind, blockedUntil?: number) =>
    new AiImageError(kind, blockedUntil, status, codes);
  if (codes.includes(3036) || (codes.includes(4006) && quota)) {
    return fail("limit", nextUtcMidnight(nowMs));
  }
  if (codes.includes(4006)) return fail("server");
  if (codes.includes(3040) || status === 429) {
    return fail("rate", retryAfterMs(retryAfter, nowMs, 60_000));
  }
  if (status === 401 || status === 403) return fail("auth");
  if (status >= 500) return fail("server");
  if (status >= 400) return fail(codes.length ? "refused" : "bad_response");
  return null;
}

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
      const raw = Buffer.from(await res.arrayBuffer());
      const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
      let json: CfBody | null = null;
      if (!contentType.startsWith("image/")) {
        try {
          json = JSON.parse(raw.toString("utf8")) as CfBody;
        } catch {
          if (signal.aborted) throw new AiImageError("timeout");
          json = null;
        }
      }
      const failure = cloudflareFailure(
        json?.errors ?? [],
        res.status,
        now(),
        res.headers.get("retry-after"),
      );
      if (failure) throw failure;
      if (contentType.startsWith("image/") && isImage(raw)) return raw;
      const encoded =
        typeof json?.result === "string"
          ? json.result
          : json?.result && typeof json.result.image === "string"
            ? json.result.image
            : "";
      if (!encoded) throw new AiImageError("bad_response", undefined, res.status);
      const img = decodeImageString(encoded);
      if (!isImage(img)) throw new AiImageError("bad_response", undefined, res.status);
      return img;
    },
  };
}

const ACCOUNT_HEX = /^[a-f0-9]{32}$/i;

/**
 * Account id is 32 hex characters. A pasted dashboard line may wrap it.
 * If the fields were swapped, the token field is the 32-hex id.
 */
export function cloudflareCredentials(
  env: Env,
): { accountId: string; token: string } | null {
  const accountRaw = env.CLOUDFLARE_ACCOUNT_ID?.trim() ?? "";
  const tokenRaw = env.CLOUDFLARE_AI_TOKEN?.trim() ?? "";
  if (!accountRaw || !tokenRaw) return null;
  if (ACCOUNT_HEX.test(accountRaw)) return { accountId: accountRaw, token: tokenRaw };
  const embedded = accountRaw.match(/[a-f0-9]{32}/i)?.[0];
  if (embedded) return { accountId: embedded, token: tokenRaw };
  if (ACCOUNT_HEX.test(tokenRaw)) return { accountId: tokenRaw, token: accountRaw };
  return { accountId: accountRaw, token: tokenRaw };
}

/** Lengths only. Never the id or the token. */
export function cloudflareCredentialShape(env: Env): {
  accountLen: number;
  accountHex32: boolean;
  tokenLen: number;
} | null {
  const creds = cloudflareCredentials(env);
  if (!creds) return null;
  return {
    accountLen: creds.accountId.length,
    accountHex32: ACCOUNT_HEX.test(creds.accountId),
    tokenLen: creds.token.length,
  };
}

/** Cloudflare only (no external fallback). No Cloudflare → no providers (generator off). */
export function aiImageProvidersFromEnv(env: Env, fetchFn?: FetchFn): AiImageProvider[] {
  const creds = cloudflareCredentials(env);
  if (!creds) return [];
  return [cloudflareProvider({ accountId: creds.accountId, token: creds.token, fetchFn })];
}
