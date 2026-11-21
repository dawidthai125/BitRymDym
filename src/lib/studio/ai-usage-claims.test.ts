import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/plans/usage-resets", () => ({ usageWindowStart: vi.fn(async (_u: string, _m: string, d: string) => d) }));

const rpc = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({ rpc }) }));

import { claimAiLyricsUsage } from "./lyrics/ai-lyrics-server";
import { claimAiCoverUsage } from "./video/ai-cover/server";

const lyr = { ownerId: "o", usageId: "u", projectId: "p", mode: "verse", inputChars: 10, perDay: 5, since: "2026-11-21T00:00:00Z" };
const cov = { ownerId: "o", usageId: "u", projectId: "p", aspect: "16:9", perDay: 3 };
const admin = { rpc } as never;

beforeEach(() => rpc.mockReset());

describe("AI usage claims (RPC, fail-closed)", () => {
  it("lyrics: uses claim_ai_lyrics_usage and maps statuses", async () => {
    rpc.mockResolvedValueOnce({ data: [{ status: "ok", used: 2 }], error: null });
    expect(await claimAiLyricsUsage(admin, lyr)).toEqual({ status: "ok", used: 2 });
    expect(rpc.mock.calls[0][0]).toBe("claim_ai_lyrics_usage");
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_owner: "o", p_per_day: 5, p_max_attempts: 15 });
    rpc.mockResolvedValueOnce({ data: [{ status: "busy", used: 1 }], error: null });
    expect((await claimAiLyricsUsage(admin, lyr)).status).toBe("busy");
    rpc.mockResolvedValueOnce({ data: [{ status: "daily_limit", used: 5 }], error: null });
    expect((await claimAiLyricsUsage(admin, lyr)).status).toBe("daily_limit");
  });

  it("lyrics: RPC error, throw or garbage → unavailable (never ok)", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "PGRST202" } });
    expect((await claimAiLyricsUsage(admin, lyr)).status).toBe("unavailable");
    rpc.mockRejectedValueOnce(new Error("net"));
    expect((await claimAiLyricsUsage(admin, lyr)).status).toBe("unavailable");
    rpc.mockResolvedValueOnce({ data: [], error: null });
    expect((await claimAiLyricsUsage(admin, lyr)).status).toBe("unavailable");
    expect((await claimAiLyricsUsage(admin, { ...lyr, since: null })).status).toBe("unavailable");
  });

  it("cover: uses claim_ai_cover_usage and fails closed", async () => {
    rpc.mockResolvedValueOnce({ data: [{ status: "ok", used: 1 }], error: null });
    expect(await claimAiCoverUsage(admin, cov)).toEqual({ status: "ok", used: 1 });
    expect(rpc.mock.calls[0][0]).toBe("claim_ai_cover_usage");
    rpc.mockResolvedValueOnce({ data: null, error: { code: "42883" } });
    expect((await claimAiCoverUsage(admin, cov)).status).toBe("unavailable");
  });
});

describe("AI usage claims — source wiring", () => {
  const cover = readFileSync("src/lib/studio/video/ai-cover/server.ts", "utf8");
  const lyrics = readFileSync("src/lib/studio/lyrics/ai-lyrics-server.ts", "utf8");
  const sampek = readFileSync("src/app/api/studio/play/sampek/route.ts", "utf8");
  const sql = readFileSync("supabase/migrations/20261121120000_ai_usage_atomic_claims.sql", "utf8");

  it("cover reserves the slot before the moderation call and no longer reads-then-inserts", () => {
    const g = cover.slice(cover.indexOf("export async function generateAiCover"));
    expect(g.indexOf("claimAiCoverUsage(")).toBeGreaterThan(-1);
    expect(g.indexOf("claimAiCoverUsage(")).toBeLessThan(g.indexOf("screenAiCoverPrompt("));
    expect(g).not.toContain("aiCoversUsedToday(");
    expect(g).not.toContain(".insert(");
  });

  it("lyrics goes through the RPC and fails closed", () => {
    expect(lyrics).toContain('"unavailable"');
    expect(lyrics).not.toContain(".insert(");
    expect(lyrics.slice(lyrics.indexOf("export async function generateAiLyrics"))).not.toContain("usedToday(");
  });

  it("sampek uses the durable RPC, per-tier limits, 429 busy and fail-closed 503", () => {
    expect(sampek).toContain("claim_sampek_usage");
    expect(sampek).not.toContain("sampekHits");
    expect(sampek).toMatch(/BRONZE: 10, SILVER: 30, GOLD: 60, STAFF: 120/);
    expect(sampek).toContain('claim === "busy"');
    expect(sampek).toContain('claim === "unavailable"');
    expect(sampek).toContain("Sampek nie odpowiedział. Spróbuj ponownie.");
  });

  it("migration: security definer, locked down, atomic lock, RLS on sampek_usage", () => {
    for (const fn of ["claim_ai_lyrics_usage", "claim_ai_cover_usage", "claim_sampek_usage"]) {
      expect(sql).toMatch(new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public, anon, authenticated`));
      expect(sql).toMatch(new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to service_role`));
    }
    expect(sql.match(/pg_advisory_xact_lock/g)?.length).toBe(3);
    expect(sql.match(/security definer set search_path = public/g)?.length).toBe(3);
    expect(sql).toContain("alter table public.sampek_usage enable row level security");
    expect(sql).toContain("revoke all on public.sampek_usage from anon, authenticated");
    expect(sql).toContain("sampek_usage (owner_id, created_at)");
  });
});
