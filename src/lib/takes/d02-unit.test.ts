import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

import {
  ANON_TAKE_COOKIE_NAME,
  ANON_TAKE_TTL_SECONDS,
  RECORDING_ANTI_ABUSE,
  TAKE_AUDIO_PREVIEW_TTL_SECONDS,
} from "@/config/recording";
import { ANON_DOWNLOAD_COOKIE_NAME } from "@/config/downloads";
import {
  assertAnonTakeRecordAccess,
  assertTakeRecordAccess,
  rejectClientChosenTakeStorageParams,
  TakeAuthzError,
} from "@/lib/takes/authz";
import {
  antiAbuseCapsForAnonymous,
  computeAnonymousRecordingMaxSeconds,
  computeRecordingMaxSeconds,
  isTakeExpired,
  retentionSecondsForAnonymous,
} from "@/lib/takes/entitlement";
import {
  buildAnonTakeObjectKey,
  buildUserTakeObjectKey,
  expectedAnonTakeObjectKey,
} from "@/lib/takes/object-key";
import {
  assertOwnAnonReadyTakeAccess,
  assertOwnReadyTakeAccess,
  type TakeAccessRow,
} from "@/lib/takes/take-access";
import {
  anonymousTakeTokenHashPrefix,
  hashAnonymousTakeToken,
} from "@/lib/takes/token-hash";
import { AuthError } from "@/lib/auth/session";
import type { AuthContext } from "@/lib/auth/types";

function ownerCtx(level: string): AuthContext {
  return {
    userId: "11111111-1111-4111-8111-111111111111",
    email: "owner@test",
    profile: {
      id: "11111111-1111-4111-8111-111111111111",
      displayName: "Owner",
      userNumber: null,
      role: "USER",
      accountLevel: level as AuthContext["profile"]["accountLevel"],
      experienceTotal: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    permissions: [],
  };
}

const TOKEN_A = "a".repeat(64);
const TOKEN_B = "b".repeat(64);
const HASH_A = hashAnonymousTakeToken(TOKEN_A);
const HASH_B = hashAnonymousTakeToken(TOKEN_B);
const TAKE_ID = "22222222-2222-4222-8222-222222222222";
const BEAT_ID = "33333333-3333-4333-8333-333333333333";

function anonReadyRow(overrides: Partial<TakeAccessRow> = {}): TakeAccessRow {
  return {
    id: TAKE_ID,
    owner_id: null,
    anonymous_token_hash: HASH_A,
    beat_id: BEAT_ID,
    status: "READY",
    object_key: buildAnonTakeObjectKey({
      tokenHashPrefix: anonymousTakeTokenHashPrefix(HASH_A),
      takeId: TAKE_ID,
    }),
    storage_bucket: "take-audio",
    content_type: "audio/webm",
    duration_seconds: 5,
    byte_size: 1000,
    expires_at: new Date(Date.now() + 3600_000).toISOString(),
    deleted_at: null,
    ...overrides,
  };
}

describe("Recording D02 — anonymous identity / config", () => {
  it("uses dedicated cookie distinct from download aid", () => {
    expect(ANON_TAKE_COOKIE_NAME).toBe("brd_tk_aid");
    expect(ANON_TAKE_COOKIE_NAME).not.toBe(ANON_DOWNLOAD_COOKIE_NAME);
  });

  it("hashes token and never equals raw", () => {
    expect(HASH_A).toMatch(/^[a-f0-9]{64}$/);
    expect(HASH_A).not.toBe(TOKEN_A);
    expect(HASH_A).not.toBe(HASH_B);
  });

  it("TTL is 7200s and preview TTL is 120s", () => {
    expect(ANON_TAKE_TTL_SECONDS).toBe(7200);
    expect(retentionSecondsForAnonymous()).toBe(7200);
    expect(TAKE_AUDIO_PREVIEW_TTL_SECONDS).toBe(120);
  });

  it("anonymous caps are 1 READY / 3 per UTC day", () => {
    expect(antiAbuseCapsForAnonymous()).toEqual(
      RECORDING_ANTI_ABUSE.ANONYMOUS,
    );
    expect(antiAbuseCapsForAnonymous()).toEqual({
      maxActiveReady: 1,
      maxSessionsPerUtcDay: 3,
    });
  });
});

describe("Recording D02 — entitlement + AuthZ", () => {
  it("anonymous max is MIN(beat, 15)", () => {
    expect(computeAnonymousRecordingMaxSeconds(90)).toBe(15);
    expect(computeAnonymousRecordingMaxSeconds(12)).toBe(12);
  });

  it("PUBLISHED ALLOW for anon hash; non-PUBLISHED DENY", () => {
    expect(
      assertAnonTakeRecordAccess({
        tokenHash: HASH_A,
        beat: { id: BEAT_ID, status: "PUBLISHED", durationSeconds: 60 },
      }).maxRecordingSeconds,
    ).toBe(15);

    expect(() =>
      assertAnonTakeRecordAccess({
        tokenHash: HASH_A,
        beat: { id: BEAT_ID, status: "DRAFT", durationSeconds: 60 },
      }),
    ).toThrow(TakeAuthzError);
  });

  it("missing hash is UNAUTHENTICATED; client storage params rejected", () => {
    expect(() =>
      assertAnonTakeRecordAccess({
        tokenHash: "",
        beat: { id: BEAT_ID, status: "PUBLISHED", durationSeconds: 30 },
      }),
    ).toThrow(/identity/i);

    expect(() =>
      rejectClientChosenTakeStorageParams({ objectKey: "anon/x/takes/y/mic.bin" }),
    ).toThrow(TakeAuthzError);
  });

  it("authenticated assertTakeRecordAccess still DENY without userId (W4)", () => {
    expect(() =>
      assertTakeRecordAccess({
        context: { ...ownerCtx("BEGINNER_RAPPER"), userId: "" as unknown as string },
        beat: { id: BEAT_ID, status: "PUBLISHED", durationSeconds: 30 },
        premiumTier: "FREE",
      }),
    ).toThrow(TakeAuthzError);
  });

  it("legacy computeRecordingMaxSeconds fail-closed to FREE (30)", () => {
    expect(
      computeRecordingMaxSeconds({
        accountLevel: "PRO_RAPPER",
        beatDurationSeconds: 120,
      }),
    ).toBe(30);
  });
});

describe("Recording D02 — object key + preview AuthZ matrix", () => {
  it("builds anon/{prefix}/takes/{id}/mic.bin", () => {
    const key = buildAnonTakeObjectKey({
      tokenHashPrefix: anonymousTakeTokenHashPrefix(HASH_A),
      takeId: TAKE_ID,
    });
    expect(key).toBe(
      `anon/${anonymousTakeTokenHashPrefix(HASH_A)}/takes/${TAKE_ID}/mic.bin`,
    );
    expect(key.startsWith("user/")).toBe(false);
    expect(
      expectedAnonTakeObjectKey({
        tokenHashPrefix: anonymousTakeTokenHashPrefix(HASH_A),
        takeId: TAKE_ID,
        objectKey: key,
      }),
    ).toBe(true);
  });

  it("token mismatch / cross-take / cross-beat IDOR DENY", () => {
    const row = anonReadyRow();

    expect(() =>
      assertOwnAnonReadyTakeAccess({ take: row, tokenHash: HASH_B }),
    ).toThrow(AuthError);

    expect(() =>
      assertOwnAnonReadyTakeAccess({
        take: { ...row, id: "44444444-4444-4444-8444-444444444444" },
        tokenHash: HASH_A,
      }),
    ).toThrow(/Object key/i);

    expect(() =>
      assertOwnAnonReadyTakeAccess({
        take: {
          ...row,
          object_key: buildUserTakeObjectKey({
            ownerId: "11111111-1111-4111-8111-111111111111",
            takeId: TAKE_ID,
          }),
        },
        tokenHash: HASH_A,
      }),
    ).toThrow(/Object key/i);
  });

  it("expired READY DENY for preview; PENDING DENY", () => {
    expect(() =>
      assertOwnAnonReadyTakeAccess({
        take: anonReadyRow({
          expires_at: new Date(Date.now() - 1000).toISOString(),
        }),
        tokenHash: HASH_A,
      }),
    ).toThrow(/expired/i);

    expect(
      isTakeExpired({
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      }),
    ).toBe(true);

    expect(() =>
      assertOwnAnonReadyTakeAccess({
        take: anonReadyRow({ status: "PENDING_UPLOAD" }),
        tokenHash: HASH_A,
      }),
    ).toThrow(/READY/i);
  });

  it("owner preview gate rejects anonymous row (preview != download authority)", () => {
    expect(() =>
      assertOwnReadyTakeAccess({
        take: anonReadyRow(),
        userId: "11111111-1111-4111-8111-111111111111",
        purpose: "preview",
      }),
    ).toThrow(/owner/i);

    expect(() =>
      assertOwnReadyTakeAccess({
        take: anonReadyRow(),
        userId: "11111111-1111-4111-8111-111111111111",
        purpose: "download",
      }),
    ).toThrow(/owner/i);
  });

  it("happy anon preview ALLOW", () => {
    expect(() =>
      assertOwnAnonReadyTakeAccess({
        take: anonReadyRow(),
        tokenHash: HASH_A,
      }),
    ).not.toThrow();
  });
});

describe("Recording D02 — no grant dependency + route surface", () => {
  it("anon transport source never imports grant APIs", () => {
    const transport = readFileSync(
      resolve(process.cwd(), "src/lib/takes/anon-take-transport.ts"),
      "utf8",
    );
    const preview = readFileSync(
      resolve(process.cwd(), "src/lib/takes/anon-take-preview.ts"),
      "utf8",
    );
    expect(transport).not.toMatch(/beat-access-grants|hasActiveRecordGrant|can_record/);
    expect(preview).not.toMatch(/from ["']@\/lib\/takes\/take-download["']/);
    expect(preview).not.toMatch(/createOwnTakeDownload/);
    expect(transport).toMatch(/claim_anon_take_recording_session/);
    expect(transport).not.toMatch(/["']claim_take_recording_session["']/);
  });

  it("no anonymous download API route", () => {
    expect(() =>
      readFileSync(
        resolve(process.cwd(), "src/app/api/takes/anon/download/route.ts"),
        "utf8",
      ),
    ).toThrow();
    const session = readFileSync(
      resolve(process.cwd(), "src/app/api/takes/anon/session/route.ts"),
      "utf8",
    );
    expect(session).toMatch(/createAnonTakeRecordingSession/);
  });

  it("cookie identity module uses Secure+httpOnly+SameSite pattern", () => {
    const src = readFileSync(
      resolve(process.cwd(), "src/lib/takes/anonymous-identity.ts"),
      "utf8",
    );
    expect(src).toMatch(/httpOnly:\s*true/);
    expect(src).toMatch(/sameSite:\s*"lax"/);
    expect(src).toMatch(/secure:\s*process\.env\.NODE_ENV === "production"/);
    expect(src).toMatch(/ensureAnonymousTakeIdentity/);
    expect(src).not.toMatch(/console\.(log|info|debug).*token/);
  });
});

describe("Recording D02 — mobile Gate M (UI contract)", () => {
  it("RecordingPanel unlocks anon path and keeps touch-sized CTAs", () => {
    const panel = readFileSync(
      resolve(process.cwd(), "src/components/takes/recording-panel.tsx"),
      "utf8",
    );
    expect(panel).toMatch(/uploadAnonTakeRecordingBlob/);
    expect(panel).toMatch(/\/api\/takes\/anon\/preview/);
    expect(panel).not.toMatch(/REQUIRE_AUTH/);
    expect(panel).toMatch(/visibilitychange/);
    expect(panel).toMatch(/min-h-11/);
    expect(panel).toMatch(/załóż konto/);
    expect(panel).toMatch(/Gościnne nagranie/);
  });
});
