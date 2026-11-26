/**
 * Take title rules → typed error codes → 400 VALIDATION with clear, localized copy.
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => {
    throw new Error("title validation must not reach the database");
  },
}));

import en from "../../../messages/en.json";
import pl from "../../../messages/pl.json";
import { TAKE_TITLE_MAX_LENGTH } from "@/config/recording";
import { translateLibText } from "@/i18n/lib-text";
import { TAKE_TITLE_ERROR_MESSAGE, takeApiErrorResponse } from "@/lib/takes/api-error";
import {
  isTakeTitleErrorCode,
  normalizeTakeTitle,
  TakeTitleError,
  takeTitleErrorCode,
} from "@/lib/takes/take-title";
import { updateOwnTakeTitleFor } from "@/lib/takes/take-title-service";
import { toUserFacingError } from "@/lib/ui/user-errors";

const ctx = { userId: "00000000-0000-4000-8000-000000000001" } as Parameters<
  typeof updateOwnTakeTitleFor
>[0];

describe("take title codes", () => {
  it("reserved prefixes, too long and non-string get their own code", () => {
    expect(takeTitleErrorCode("smp:test")).toBe("TITLE_RESERVED_PREFIX");
    expect(takeTitleErrorCode("  CATALOG:x")).toBe("TITLE_RESERVED_PREFIX");
    expect(takeTitleErrorCode("x".repeat(TAKE_TITLE_MAX_LENGTH + 1))).toBe("TITLE_TOO_LONG");
    expect(takeTitleErrorCode(42)).toBe("TITLE_NOT_STRING");
    expect(takeTitleErrorCode("Moje smp: nagranie")).toBeNull();
    expect(takeTitleErrorCode("")).toBeNull();
    expect(() => normalizeTakeTitle("smp:test")).toThrow(TakeTitleError);
    expect(isTakeTitleErrorCode("TITLE_TOO_LONG")).toBe(true);
    expect(isTakeTitleErrorCode("FORBIDDEN")).toBe(false);
  });
});

describe("PATCH /api/takes/title error response", () => {
  it("reserved prefix is a 400 with its own Polish message, not a 403", async () => {
    const res = takeApiErrorResponse(new TakeTitleError("TITLE_RESERVED_PREFIX", "x"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("TITLE_RESERVED_PREFIX");
    expect(body.error).toBe("Tytuł nie może zaczynać się od „smp:” ani „catalog:”.");
  });

  it("service rejects bad titles with TakeTitleError before any DB call", async () => {
    await expect(updateOwnTakeTitleFor(ctx, { takeId: "a".repeat(36), title: "smp:test" }))
      .rejects.toMatchObject({ code: "TITLE_RESERVED_PREFIX" });
    await expect(
      updateOwnTakeTitleFor(ctx, { takeId: "a".repeat(36), title: "x".repeat(TAKE_TITLE_MAX_LENGTH + 1) }),
    ).rejects.toBeInstanceOf(TakeTitleError);
  });

  it("every server title message is Polish, kept by the UI mapper and translated to EN", () => {
    expect(TAKE_TITLE_ERROR_MESSAGE.TITLE_TOO_LONG).toContain(String(TAKE_TITLE_MAX_LENGTH));
    for (const msg of Object.values(TAKE_TITLE_ERROR_MESSAGE)) {
      expect(toUserFacingError(msg, "generic")).toBe(msg);
      expect(translateLibText(msg, "en")).not.toBe(msg);
    }
    expect(toUserFacingError(TAKE_TITLE_ERROR_MESSAGE.TITLE_RESERVED_PREFIX, "recording")).not.toBe(
      "Nie udało się nagrać. Spróbuj ponownie.",
    );
  });
});

describe("own takes list title copy", () => {
  const keys = ["tytulZastrzezonyPrefiks", "tytulZaDlugi", "tytulNieprawidlowy"] as const;
  it("PL and EN carry the same title error keys", () => {
    const plList = (pl as { studio: { ownTakesList: Record<string, string> } }).studio.ownTakesList;
    const enList = (en as { studio: { ownTakesList: Record<string, string> } }).studio.ownTakesList;
    for (const k of keys) {
      expect(plList[k], k).toBeTruthy();
      expect(enList[k], k).toBeTruthy();
    }
    expect(plList.tytulZastrzezonyPrefiks).toBe(TAKE_TITLE_ERROR_MESSAGE.TITLE_RESERVED_PREFIX);
    expect(plList.tytulZaDlugi).toContain("{max}");
    expect(enList.tytulZaDlugi).toContain("{max}");
  });
});
