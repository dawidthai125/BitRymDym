/**
 * Guests never receive a signed URL to the full beat file: PLAYBACK for a
 * guest resolves the PREVIEW asset only (no PLAYBACK/MASTER fallback).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = { id: string; beat_id: string; purpose: string; object_key: string };

const state = vi.hoisted(() => ({
  profile: null as null | { userId: string; profile: { role: string } },
  assets: [] as Row[],
  purposesQueried: [] as string[],
  signedKeys: [] as string[],
}));

vi.mock("@/lib/auth/session", async (orig) => {
  const actual = await orig<typeof import("@/lib/auth/session")>();
  return {
    ...actual,
    getCurrentProfile: vi.fn(async () => state.profile),
    requireUser: vi.fn(async () => ({ id: state.profile?.userId })),
    requireRole: vi.fn(async () => undefined),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => {
    const chain = {
      from: () => chain,
      select: () => chain,
      eq: () => chain,
      maybeSingle: async () => ({
        data: { id: "b1", status: "PUBLISHED", ownership_type: "PLATFORM" },
        error: null,
      }),
    };
    return chain;
  },
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => {
    const filters: Record<string, unknown> = {};
    const chain = {
      from: () => chain,
      select: () => chain,
      eq: (col: string, val: unknown) => {
        filters[col] = val;
        return chain;
      },
      maybeSingle: async () => {
        state.purposesQueried.push(String(filters.purpose));
        const row = state.assets.find(
          (a) => a.beat_id === filters.beat_id && a.purpose === filters.purpose,
        );
        return { data: row ? { ...row, status: "READY", is_active: true } : null, error: null };
      },
      storage: {
        from: () => ({
          createSignedUrl: async (key: string) => {
            state.signedKeys.push(key);
            return { data: { signedUrl: `https://signed.invalid/${key}` }, error: null };
          },
        }),
      },
    };
    return chain;
  },
}));

vi.mock("@/lib/audio/load-premium-entitlement", () => ({
  resolveProductEntitlementForAuthContext: vi.fn(async () => ({ limits: { downloadsDaily: 0 } })),
}));

import { BEAT_PREVIEW_LOGIN_REQUIRED, requestBeatAudioAccess } from "@/lib/beats/audio-access";
import { requestBeatAudioAccessAction } from "@/lib/beats/audio-actions";

const MASTER: Row = { id: "m1", beat_id: "b1", purpose: "MASTER", object_key: "platform/b1/m1/master.bin" };
const PREVIEW: Row = { id: "p1", beat_id: "b1", purpose: "PREVIEW", object_key: "platform/b1/p1/preview.bin" };

beforeEach(() => {
  state.profile = null;
  state.assets = [MASTER, PREVIEW];
  state.purposesQueried = [];
  state.signedKeys = [];
});

describe("guest beat preview gate (server-enforced)", () => {
  it("guest PLAYBACK signs only the PREVIEW asset and returns the 20 s cap", async () => {
    const r = await requestBeatAudioAccess({ beatId: "b1", purpose: "PLAYBACK" });
    expect(r.assetId).toBe("p1");
    expect(r.previewLimitSeconds).toBe(20);
    expect(state.signedKeys).toEqual(["platform/b1/p1/preview.bin"]);
    expect(state.purposesQueried).toEqual(["PREVIEW"]);
  });

  it("guest PLAYBACK without a preview → sign-in required, never falls back to MASTER", async () => {
    state.assets = [MASTER];
    await expect(
      requestBeatAudioAccess({ beatId: "b1", purpose: "PLAYBACK" }),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED", message: BEAT_PREVIEW_LOGIN_REQUIRED });
    expect(state.signedKeys).toEqual([]);
    expect(state.purposesQueried).toEqual(["PREVIEW"]);
  });

  it("action maps a missing guest preview to PREVIEW_UNAVAILABLE (no URL)", async () => {
    state.assets = [MASTER];
    const r = await requestBeatAudioAccessAction({ beatId: "b1", purpose: "PLAYBACK" });
    expect(r).toMatchObject({ success: false, code: "PREVIEW_UNAVAILABLE" });
    expect(r.url).toBeUndefined();
  });

  it("signed-in PLAYBACK gets the full file (PLAYBACK → MASTER fallback), no cap", async () => {
    state.profile = { userId: "u1", profile: { role: "USER" } };
    const r = await requestBeatAudioAccess({ beatId: "b1", purpose: "PLAYBACK" });
    expect(r.assetId).toBe("m1");
    expect(r.previewLimitSeconds).toBeUndefined();
    expect(state.signedKeys).toEqual(["platform/b1/m1/master.bin"]);
    expect(state.purposesQueried).not.toContain("PREVIEW");
  });
});
