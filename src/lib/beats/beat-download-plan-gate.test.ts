/**
 * Owner 2026-10-29: guests and Free never download beats (listen only).
 * The Access Gate rejects before any asset lookup, slot reservation or signed URL.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  profile: null as null | { userId: string; profile: { role: string } },
  downloadsDaily: 0,
  adminUsed: false,
  reserveCalls: 0,
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
        data: { id: "b1", status: "PUBLISHED", ownership_type: "USER" },
        error: null,
      }),
    };
    return chain;
  },
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => {
    state.adminUsed = true;
    throw new Error("admin client must not be used for a denied download");
  },
}));

vi.mock("@/lib/audio/load-premium-entitlement", () => ({
  resolveProductEntitlementForAuthContext: vi.fn(async () => ({
    limits: { downloadsDaily: state.downloadsDaily },
  })),
}));

vi.mock("@/lib/downloads/slots", () => ({
  finalizeDownload: vi.fn(),
  insertAdminDownloadEvent: vi.fn(),
  releaseDownloadReservation: vi.fn(),
  reserveDownloadSlot: vi.fn(async () => {
    state.reserveCalls += 1;
    return { allowed: false };
  }),
  throwLimitReached: vi.fn(() => {
    throw new Error("limit");
  }),
}));

import {
  BEAT_DOWNLOAD_LOGIN_REQUIRED,
  BEAT_DOWNLOAD_PLAN_REQUIRED,
  requestBeatAudioAccess,
} from "@/lib/beats/audio-access";
import { toSafeDownloadErrorMessage } from "@/lib/beats/public";

beforeEach(() => {
  state.profile = null;
  state.downloadsDaily = 0;
  state.adminUsed = false;
  state.reserveCalls = 0;
});

describe("beat download plan gate (server)", () => {
  it("guest DOWNLOAD → UNAUTHENTICATED before asset lookup / slot", async () => {
    await expect(
      requestBeatAudioAccess({ beatId: "b1", purpose: "DOWNLOAD" }),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED", message: BEAT_DOWNLOAD_LOGIN_REQUIRED });
    expect(state.adminUsed).toBe(false);
    expect(state.reserveCalls).toBe(0);
  });

  it("Free user DOWNLOAD → FORBIDDEN (paid plan) before asset lookup / slot", async () => {
    state.profile = { userId: "u1", profile: { role: "USER" } };
    state.downloadsDaily = 0;
    await expect(
      requestBeatAudioAccess({ beatId: "b1", purpose: "DOWNLOAD" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN", message: BEAT_DOWNLOAD_PLAN_REQUIRED });
    expect(state.adminUsed).toBe(false);
    expect(state.reserveCalls).toBe(0);
  });

  it("Bronze user DOWNLOAD passes the plan gate (reaches asset lookup)", async () => {
    state.profile = { userId: "u1", profile: { role: "USER" } };
    state.downloadsDaily = 10;
    await expect(
      requestBeatAudioAccess({ beatId: "b1", purpose: "DOWNLOAD" }),
    ).rejects.toThrow(/admin client must not be used/);
    expect(state.adminUsed).toBe(true);
  });

  it("user-facing copy for both denials", () => {
    expect(toSafeDownloadErrorMessage(BEAT_DOWNLOAD_LOGIN_REQUIRED)).toBe("Zaloguj się, aby pobrać.");
    expect(toSafeDownloadErrorMessage(BEAT_DOWNLOAD_PLAN_REQUIRED)).toBe("Pobieranie bitów jest od planu Bronze.");
  });
});
