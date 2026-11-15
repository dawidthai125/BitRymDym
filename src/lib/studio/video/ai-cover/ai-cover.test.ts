import { describe, expect, it, vi } from "vitest";

import { memoryProviderState, runAiImageChain } from "./chain";
import { aiCoverEnabled, aiCoverPerDay } from "./config";
import { MOOD_COVERS } from "./moods";
import { checkPromptRules, matchPromptRule } from "./prompt-rules";
import { AiImageError, aiImageProvidersFromEnv, cloudflareCredentials, cloudflareProvider, xaiProvider, nextUtcMidnight, retryAfterMs, type AiImageProvider } from "./providers";
import { screenAiCoverPrompt } from "./screen";

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(2000, 1)]);
const input = { prompt: "neon city", aspect: "16:9" as const, seed: 1 };
const ok = (id: AiImageProvider["id"]): AiImageProvider => ({ id, generate: vi.fn(async () => JPEG) });
const fail = (id: AiImageProvider["id"], err: AiImageError): AiImageProvider => ({ id, generate: vi.fn(async () => { throw err; }) });

describe("AI cover provider chain", () => {
  it("uses the first provider when it works", async () => {
    const a = ok("cloudflare"), b = ok("pollinations");
    const r = await runAiImageChain([a, b], input, { timeoutMs: 1000, state: memoryProviderState() });
    expect(r.ok && r.provider).toBe("cloudflare");
    expect(b.generate).not.toHaveBeenCalled();
  });

  it("fails over on limit and remembers it until the UTC reset", async () => {
    const now = Date.UTC(2026, 9, 30, 18, 0);
    const state = memoryProviderState();
    const a = fail("cloudflare", new AiImageError("limit", nextUtcMidnight(now), 429)), b = ok("pollinations");
    const r1 = await runAiImageChain([a, b], input, { timeoutMs: 1000, state, now: () => now });
    expect(r1.ok && r1.provider).toBe("pollinations");
    expect(state.snapshot().cloudflare).toBe(Date.UTC(2026, 9, 31));
    // Still blocked later today → skipped without a call.
    const r2 = await runAiImageChain([a, b], input, { timeoutMs: 1000, state, now: () => now + 3600_000 });
    expect(r2.attempts[0]).toMatchObject({ provider: "cloudflare", outcome: "skipped" });
    expect(a.generate).toHaveBeenCalledTimes(1);
    // After midnight UTC it is tried again.
    await runAiImageChain([a, b], input, { timeoutMs: 1000, state, now: () => Date.UTC(2026, 9, 31, 0, 1) });
    expect(a.generate).toHaveBeenCalledTimes(2);
  });

  it("times out a slow provider and moves on (short cool-down)", async () => {
    const slow: AiImageProvider = { id: "cloudflare", generate: () => new Promise(() => {}) };
    const state = memoryProviderState();
    const r = await runAiImageChain([slow, ok("pollinations")], input, { timeoutMs: 20, state });
    expect(r.ok && r.provider).toBe("pollinations");
    expect(r.attempts[0].outcome).toBe("timeout");
    expect(state.snapshot().cloudflare).toBeGreaterThan(Date.now());
  });

  it("reports failure when every provider fails; refused prompts do not block the provider", async () => {
    const state = memoryProviderState();
    const r = await runAiImageChain([fail("cloudflare", new AiImageError("refused")), fail("pollinations", new AiImageError("rate", Date.now() + 45_000, 402))], input, { timeoutMs: 1000, state });
    expect(r.ok).toBe(false);
    expect(state.snapshot().cloudflare).toBeUndefined();
    expect(state.snapshot().pollinations).toBeGreaterThan(Date.now());
  });

  it("is off without a key; xAI is first and Pollinations stays out", () => {
    expect(aiImageProvidersFromEnv({})).toEqual([]);
    expect(aiImageProvidersFromEnv({ CLOUDFLARE_ACCOUNT_ID: "a" })).toEqual([]);
    expect(aiCoverEnabled({})).toBe(false);
    expect(aiCoverEnabled({ CLOUDFLARE_ACCOUNT_ID: "a", CLOUDFLARE_AI_TOKEN: " " })).toBe(false);
    expect(aiCoverEnabled({ XAI_API_KEY: "x" })).toBe(true);
    expect(aiCoverEnabled({ CLOUDFLARE_ACCOUNT_ID: "a", CLOUDFLARE_AI_TOKEN: "t" })).toBe(true);
    expect(aiImageProvidersFromEnv({ CLOUDFLARE_ACCOUNT_ID: "a", CLOUDFLARE_AI_TOKEN: "t", POLLINATIONS_API_KEY: "k" }).map((p) => p.id)).toEqual(["cloudflare"]);
    expect(aiImageProvidersFromEnv({ XAI_API_KEY: "x", CLOUDFLARE_ACCOUNT_ID: "a", CLOUDFLARE_AI_TOKEN: "t", POLLINATIONS_API_KEY: "k" }).map((p) => p.id)).toEqual(["xai", "cloudflare"]);
  });
});

describe("AI cover providers", () => {
  const signal = new AbortController().signal;
  it("Cloudflare: 3036 = daily limit until 00:00 UTC; base64 image decoded; token only in the header", async () => {
    const now = Date.UTC(2026, 9, 30, 22, 0);
    const f = vi.fn(async () => new Response(JSON.stringify({ success: false, errors: [{ code: 3036 }] }), { status: 429 }));
    const p = cloudflareProvider({ accountId: "acc", token: "secret", fetchFn: f as unknown as typeof fetch, now: () => now });
    await expect(p.generate(input, signal)).rejects.toMatchObject({ kind: "limit", blockedUntil: Date.UTC(2026, 9, 31) });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).not.toContain("secret");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer secret");
    expect(JSON.parse(String(init.body))).toEqual({ prompt: "neon city", steps: 4 });
    const g = vi.fn(async () => new Response(JSON.stringify({ success: true, result: { image: JPEG.toString("base64") } })));
    const img = await cloudflareProvider({ accountId: "acc", token: "t", fetchFn: g as unknown as typeof fetch }).generate(input, signal);
    expect(img.equals(JPEG)).toBe(true);
  });

  it("Cloudflare: 4006 is the daily cap only when the text says so, otherwise an outage", async () => {
    const now = Date.UTC(2026, 9, 30, 22, 0);
    const quota = vi.fn(async () => new Response(JSON.stringify({
      success: false,
      errors: [{ code: 4006, message: "you have used up your daily free allocation of 10,000 neurons" }],
    }), { status: 400 }));
    const limited = cloudflareProvider({ accountId: "acc", token: "t", fetchFn: quota as unknown as typeof fetch, now: () => now });
    await expect(limited.generate(input, signal)).rejects.toMatchObject({
      kind: "limit",
      codes: [4006],
      blockedUntil: Date.UTC(2026, 9, 31),
    });
    const down = vi.fn(async () => new Response(JSON.stringify({
      success: false,
      errors: [{ code: 4006, message: "Service temporarily unavailable" }],
    }), { status: 400 }));
    const outage = cloudflareProvider({ accountId: "acc", token: "t", fetchFn: down as unknown as typeof fetch, now: () => now });
    await expect(outage.generate(input, signal)).rejects.toMatchObject({ kind: "server", codes: [4006] });
  });

  it("Cloudflare: accepts a data URL and a raw JPEG body", async () => {
    const dataUrl = `data:image/jpeg;base64,${JPEG.toString("base64")}`;
    const asUrl = vi.fn(async () => new Response(JSON.stringify({ success: true, result: { image: dataUrl } })));
    const fromUrl = await cloudflareProvider({ accountId: "acc", token: "t", fetchFn: asUrl as unknown as typeof fetch }).generate(input, signal);
    expect(fromUrl.equals(JPEG)).toBe(true);
    const raw = vi.fn(async () => new Response(JPEG, { headers: { "content-type": "image/jpeg" } }));
    const fromRaw = await cloudflareProvider({ accountId: "acc", token: "t", fetchFn: raw as unknown as typeof fetch }).generate(input, signal);
    expect(fromRaw.equals(JPEG)).toBe(true);
  });

  it("puts a 32-hex account id in the path even if the fields were swapped or wrapped", async () => {
    const id = "ab".repeat(16);
    const f = vi.fn(async () => new Response(JSON.stringify({ success: true, result: { image: JPEG.toString("base64") } })));
    const swapped = aiImageProvidersFromEnv(
      { CLOUDFLARE_ACCOUNT_ID: "cfut_not_an_account", CLOUDFLARE_AI_TOKEN: id },
      f as unknown as typeof fetch,
    );
    await swapped[0].generate(input, signal);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain(`/accounts/${id}/`);
    expect(url).not.toContain("cfut_not_an_account");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer cfut_not_an_account");
    expect(cloudflareCredentials({
      CLOUDFLARE_ACCOUNT_ID: `Account ID: ${id}`,
      CLOUDFLARE_AI_TOKEN: "real-token",
    })).toEqual({ accountId: id, token: "real-token" });
  });

  it("xAI: square JPEG from base64, key only in the header, 401 is auth", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ data: [{ b64_json: JPEG.toString("base64"), mime_type: "image/jpeg" }] })));
    const img = await xaiProvider({ apiKey: "xai-secret", fetchFn: f as unknown as typeof fetch }).generate({ ...input, aspect: "1:1" }, signal);
    expect(img.equals(JPEG)).toBe(true);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.x.ai/v1/images/generations");
    expect(url).not.toContain("xai-secret");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer xai-secret");
    expect(JSON.parse(String(init.body))).toEqual({
      model: "grok-imagine-image-2.0",
      prompt: "neon city",
      n: 1,
      aspect_ratio: "1:1",
      resolution: "1k",
      quality: "low",
      response_format: "b64_json",
    });
    const denied = vi.fn(async () => new Response(JSON.stringify({ error: { message: "invalid key" } }), { status: 401 }));
    await expect(xaiProvider({ apiKey: "x", fetchFn: denied as unknown as typeof fetch }).generate(input, signal)).rejects.toMatchObject({ kind: "auth", status: 401 });
  });

  it("xAI: downloads a temporary x.ai URL and ignores any other host", async () => {
    const f = vi.fn(async (url: string) => url.includes("/images/generations")
      ? new Response(JSON.stringify({ data: [{ url: "https://imgen.x.ai/xai-tmp/a.jpeg" }] }))
      : new Response(JPEG, { headers: { "content-type": "image/jpeg" } }));
    const img = await xaiProvider({ apiKey: "x", fetchFn: f as unknown as typeof fetch }).generate(input, signal);
    expect(img.equals(JPEG)).toBe(true);
    expect(f).toHaveBeenCalledTimes(2);
    const foreign = vi.fn(async () => new Response(JSON.stringify({ data: [{ url: "https://evil.example/a.jpeg" }] })));
    await expect(xaiProvider({ apiKey: "x", fetchFn: foreign as unknown as typeof fetch }).generate(input, signal)).rejects.toMatchObject({ kind: "bad_response" });
    expect(foreign).toHaveBeenCalledTimes(1);
  });

  it("retryAfterMs handles seconds, dates and garbage", () => {
    expect(retryAfterMs("10", 0, 5)).toBe(10_000);
    expect(retryAfterMs(null, 100, 5)).toBe(105);
    expect(retryAfterMs("soon", 100, 5)).toBe(105);
  });
});

describe("AI cover prompt rules", () => {
  it.each(["neonowe miasto nocą, synthwave", "las we mgle o świcie, złote światło", "abstract purple waves", "sokół nad górami", "jabłoń w kwiatach"])("allows %s", (p) => {
    expect(checkPromptRules(p).ok).toBe(true);
  });
  it.each([
    ["naga kobieta na plaży", "sexual"], ["N.A.G.A dziewczyna", "sexual"], ["Taylor Swift na scenie", "real_person"],
    ["okładka z logo Nike", "logo_brand"], ["swastyka w ogniu", "hate"], ["krwawe zwłoki", "violence"], ["portret Lewandowskiego", "real_person"],
  ])("blocks %s", (p, cat) => {
    expect(matchPromptRule(p)).toBe(cat);
    expect(checkPromptRules(p).ok).toBe(false);
  });
  it("mood covers pass the prompt rules", () => {
    for (const mood of MOOD_COVERS) expect(checkPromptRules(mood.prompt).ok).toBe(true);
  });
  it("length limits", () => {
    expect(checkPromptRules("ab")).toMatchObject({ ok: false, reason: "too_short" });
    expect(checkPromptRules("a".repeat(301))).toMatchObject({ ok: false, reason: "too_long" });
    expect(checkPromptRules(42)).toMatchObject({ ok: false, reason: "too_short" });
  });
  it("daily cap from env", () => {
    expect(aiCoverPerDay({})).toBe(10);
    expect(aiCoverPerDay({ STUDIO_AI_COVER_PER_DAY: "3" })).toBe(3);
    expect(aiCoverPerDay({ STUDIO_AI_COVER_PER_DAY: "0" })).toBe(10);
  });
});

describe("Groq prompt screening", () => {
  const groq = (safe: unknown, rewrite: unknown) => vi.fn(async (_u: string, init: RequestInit) => {
    const model = JSON.parse(String(init.body)).model as string;
    const content = model.includes("safeguard") ? safe : rewrite;
    return content === "down" ? new Response("x", { status: 503 }) : new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }));
  });
  it("safe → English rewrite + style suffix", async () => {
    const r = await screenAiCoverPrompt("neonowe miasto", { groqKey: "k", fetchFn: groq({ violation: 0 }, { prompt: "neon city at night" }) as unknown as typeof fetch });
    expect(r).toMatchObject({ ok: true, rewritten: true });
    expect(r.ok && r.finalPrompt).toMatch(/^neon city at night, music cover artwork.*no logos/);
  });
  it("violation → policy refusal", async () => {
    expect(await screenAiCoverPrompt("x", { groqKey: "k", fetchFn: groq({ violation: 1, category: "real_person" }, { prompt: "y" }) as unknown as typeof fetch }))
      .toEqual({ ok: false, reason: "policy", category: "real_person" });
  });
  it("fail-closed when the safeguard is down or no key; rewrite failure falls back to the user's text", async () => {
    expect(await screenAiCoverPrompt("x", { groqKey: "k", fetchFn: groq("down", { prompt: "y" }) as unknown as typeof fetch })).toEqual({ ok: false, reason: "unavailable" });
    expect(await screenAiCoverPrompt("x", {})).toEqual({ ok: false, reason: "unavailable" });
    const r = await screenAiCoverPrompt("las we mgle", { groqKey: "k", fetchFn: groq({ violation: 0 }, "down") as unknown as typeof fetch });
    expect(r).toMatchObject({ ok: true, rewritten: false });
  });
  it("a rewrite that trips the rules is not used", async () => {
    const r = await screenAiCoverPrompt("miasto", { groqKey: "k", fetchFn: groq({ violation: 0 }, { prompt: "city with Nike logo" }) as unknown as typeof fetch });
    expect(r).toMatchObject({ ok: true, rewritten: false });
  });
});
