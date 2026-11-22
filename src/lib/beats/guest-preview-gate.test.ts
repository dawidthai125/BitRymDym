/**
 * Guests never receive a signed URL to the clean full beat file: PLAYBACK for a
 * guest resolves the PREVIEW asset only (no PLAYBACK/MASTER fallback).
 * Paid lane: watermarked full PREVIEW (no 20 s cap) until purchase → MASTER.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = {
  id: string;
  beat_id: string;
  purpose: string;
  object_key: string;
  original_filename?: string | null;
};

const state = vi.hoisted(() => ({
  profile: null as null | { userId: string; profile: { role: string } },
  assets: [] as Row[],
  purposesQueried: [] as string[],
  signedKeys: [] as string[],
  catalogLane: "free" as "free" | "paid",
  purchased: false,
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
        data: {
          id: "b1",
          status: "PUBLISHED",
          ownership_type: "PLATFORM",
          catalog_lane: state.catalogLane,
        },
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
        return {
          data: row
            ? {
                ...row,
                status: "READY",
                is_active: true,
                original_filename: row.original_filename ?? null,
              }
            : null,
          error: null,
        };
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
  resolveProductEntitlementForAuthContext: vi.fn(async () => ({
    limits: { downloadsDaily: 0 },
  })),
}));

vi.mock("@/lib/beats/usage/beat-usage-server", () => ({
  viewerPurchasedPaidBeat: vi.fn(async () => state.purchased),
}));

vi.mock("@/lib/beats/playback-guard", () => ({
  checkFullPlaybackAllowed: vi.fn(async () => ({ allowed: true })),
  logFullPlayback: vi.fn(async () => undefined),
}));

import { BEAT_PREVIEW_LOGIN_REQUIRED, requestBeatAudioAccess } from "@/lib/beats/audio-access";
import { requestBeatAudioAccessAction } from "@/lib/beats/audio-actions";
import {
  paidWatermarkPreviewSourceMarker,
  previewSourceMarker,
} from "@/lib/beats/preview/beat-preview";

const MASTER: Row = {
  id: "m1",
  beat_id: "b1",
  purpose: "MASTER",
  object_key: "platform/b1/m1/master.bin",
};
const PREVIEW_SHORT: Row = {
  id: "p1",
  beat_id: "b1",
  purpose: "PREVIEW",
  object_key: "platform/b1/p1/preview.bin",
  original_filename: previewSourceMarker("m1"),
};
const PREVIEW_WM: Row = {
  id: "p2",
  beat_id: "b1",
  purpose: "PREVIEW",
  object_key: "platform/b1/p2/preview.bin",
  original_filename: paidWatermarkPreviewSourceMarker("m1"),
};

beforeEach(() => {
  state.profile = null;
  state.assets = [MASTER, PREVIEW_SHORT];
  state.purposesQueried = [];
  state.signedKeys = [];
  state.catalogLane = "free";
  state.purchased = false;
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

  it("signed-in free catalog listen signs only PREVIEW and keeps the 20 s cap", async () => {
    state.profile = { userId: "u1", profile: { role: "USER" } };
    const r = await requestBeatAudioAccess({
      beatId: "b1",
      purpose: "PLAYBACK",
      previewOnly: true,
    });
    expect(r.assetId).toBe("p1");
    expect(r.previewLimitSeconds).toBe(20);
    expect(state.signedKeys).toEqual(["platform/b1/p1/preview.bin"]);
    expect(state.purposesQueried).toEqual(["PREVIEW"]);
  });

  it("paid catalog: guest gets watermarked PREVIEW with no 20 s cap", async () => {
    state.catalogLane = "paid";
    state.assets = [MASTER, PREVIEW_WM];
    const r = await requestBeatAudioAccess({ beatId: "b1", purpose: "PLAYBACK" });
    expect(r.assetId).toBe("p2");
    expect(r.previewLimitSeconds).toBeUndefined();
    expect(state.signedKeys).toEqual(["platform/b1/p2/preview.bin"]);
  });

  it("paid catalog: non-buyer signed-in previewOnly gets WM PREVIEW, no cap", async () => {
    state.catalogLane = "paid";
    state.assets = [MASTER, PREVIEW_WM];
    state.profile = { userId: "u1", profile: { role: "USER" } };
    const r = await requestBeatAudioAccess({
      beatId: "b1",
      purpose: "PLAYBACK",
      previewOnly: true,
    });
    expect(r.assetId).toBe("p2");
    expect(r.previewLimitSeconds).toBeUndefined();
    expect(state.signedKeys).toEqual(["platform/b1/p2/preview.bin"]);
  });

  it("paid catalog: buyer previewOnly gets clean MASTER, no cap", async () => {
    state.catalogLane = "paid";
    state.assets = [MASTER, PREVIEW_WM];
    state.profile = { userId: "u1", profile: { role: "USER" } };
    state.purchased = true;
    const r = await requestBeatAudioAccess({
      beatId: "b1",
      purpose: "PLAYBACK",
      previewOnly: true,
    });
    expect(r.assetId).toBe("m1");
    expect(r.previewLimitSeconds).toBeUndefined();
    expect(state.signedKeys).toEqual(["platform/b1/m1/master.bin"]);
  });

  it("paid catalog: non-buyer signed-in PLAYBACK without previewOnly still gets WM PREVIEW (2026-11-22)", async () => {
    state.catalogLane = "paid";
    state.assets = [MASTER, PREVIEW_WM];
    state.profile = { userId: "u1", profile: { role: "USER" } };
    const r = await requestBeatAudioAccess({ beatId: "b1", purpose: "PLAYBACK" });
    expect(r.assetId).toBe("p2");
    expect(state.signedKeys).toEqual(["platform/b1/p2/preview.bin"]);
  });

  it("paid catalog: non-buyer without any preview never falls back to MASTER", async () => {
    state.catalogLane = "paid";
    state.assets = [MASTER];
    state.profile = { userId: "u1", profile: { role: "USER" } };
    await expect(
      requestBeatAudioAccess({ beatId: "b1", purpose: "PLAYBACK" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(state.signedKeys).toEqual([]);
  });

  it("paid catalog: admin PLAYBACK gets MASTER", async () => {
    state.catalogLane = "paid";
    state.assets = [MASTER, PREVIEW_WM];
    state.profile = { userId: "a1", profile: { role: "ADMIN" } };
    const r = await requestBeatAudioAccess({ beatId: "b1", purpose: "PLAYBACK" });
    expect(r.assetId).toBe("m1");
  });

  it("paid catalog with stale short PREVIEW still returns the 20 s cap until backfill", async () => {
    state.catalogLane = "paid";
    state.assets = [MASTER, PREVIEW_SHORT];
    const r = await requestBeatAudioAccess({ beatId: "b1", purpose: "PLAYBACK" });
    expect(r.assetId).toBe("p1");
    expect(r.previewLimitSeconds).toBe(20);
  });
});
