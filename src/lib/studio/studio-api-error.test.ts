import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthError } from "@/lib/auth/session";
import { STUDIO_INTERNAL_ERROR, studioApiErrorResponse } from "@/lib/studio/studio-api-error";
import { StudioValidationError } from "@/lib/studio/studio-validation-error";
import { takeApiErrorResponse } from "@/lib/takes/api-error";

describe("studioApiErrorResponse", () => {
  let log: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    log = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => log.mockRestore());

  it("unknown errors: 500, generic Polish, the raw text only in the server log", async () => {
    const raw = new Error("canceling statement due to statement timeout");
    const res = studioApiErrorResponse(raw);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: STUDIO_INTERNAL_ERROR, code: "INTERNAL" });
    expect(log).toHaveBeenCalledWith(expect.any(String), raw);
    expect(studioApiErrorResponse("boom").status).toBe(500);
    expect(studioApiErrorResponse(new Error("Nie udało się zapisać presetu.")).status).toBe(500);
  });

  it("known input checks stay 400 and speak Polish", async () => {
    for (const [error, text] of [
      [new Error("Clip exceeds project timeline length."), "Klip nie mieści się w długości projektu."],
      [new Error("sourceOffsetMs must be inside the recorded take."), "Ten fragment jest poza nagraniem."],
      [new Error("Przycięcie pozostawiłoby zbyt krótki klip."), "Przycięcie pozostawiłoby zbyt krótki klip."],
      [new StudioValidationError("Nazwa jest za długa."), "Nazwa jest za długa."],
      [new SyntaxError("Unexpected token"), "Nieprawidłowe żądanie."],
    ] as const) {
      const res = studioApiErrorResponse(error);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: text, code: "VALIDATION" });
    }
    expect(log).not.toHaveBeenCalled();
  });

  it("auth errors keep their status", () => {
    expect(studioApiErrorResponse(new AuthError("NOT_FOUND", "x")).status).toBe(404);
    expect(studioApiErrorResponse(new AuthError("CONFLICT", "x")).status).toBe(409);
  });

  it("take routes follow the same rule", async () => {
    expect(takeApiErrorResponse(new Error("duplicate key value")).status).toBe(500);
    expect((await takeApiErrorResponse(new Error("Title must be at most 80 characters.")).json()).code).toBe("VALIDATION");
  });
});
