import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { AuthError } from "@/lib/auth/session";
import { interpretSignUpResult } from "@/lib/auth/signup-result";
import {
  toSafeDownloadErrorMessage,
  toSafePlaybackErrorMessage,
} from "@/lib/beats/public";
import { toUserFacingTakeUploadError } from "@/lib/takes/client-upload";
import {
  mapSupabaseAuthError,
  toUserFacingAuthError,
  toUserFacingError,
  toUserFacingMixError,
} from "@/lib/ui/user-errors";

describe("mapSupabaseAuthError", () => {
  it("maps invalid credentials to Polish without revealing account existence", () => {
    expect(mapSupabaseAuthError("Invalid login credentials")).toBe(
      "Nieprawidłowy e-mail lub hasło.",
    );
  });

  it("maps signup raw error to Polish", () => {
    const mapped = mapSupabaseAuthError("Signup failed");
    expect(mapped).toMatch(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]|Spróbuj|udało/i);
    expect(mapped.toLowerCase()).not.toContain("signup failed");
  });

  it("maps generic auth failure to Polish", () => {
    expect(mapSupabaseAuthError("Something went wrong")).toMatch(
      /Nie udało się|Spróbuj/i,
    );
  });

  it("maps Supabase not configured to natural Polish", () => {
    expect(
      mapSupabaseAuthError(
        "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL.",
      ),
    ).toBe("Logowanie jest chwilowo niedostępne.");
  });
});

describe("interpretSignUpResult localization", () => {
  it("maps signup raw error to Polish", () => {
    const result = interpretSignUpResult({
      error: { message: "User already registered" },
      session: null,
    });
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.error.toLowerCase()).not.toContain("already registered");
      expect(result.error).toMatch(/konto|zaloguj|spróbuj/i);
    }
  });
});

describe("toUserFacingAuthError", () => {
  it("maps UNAUTHENTICATED AuthError", () => {
    expect(
      toUserFacingAuthError(new AuthError("UNAUTHENTICATED", "Authentication required.")),
    ).toBe("Musisz być zalogowany.");
  });
});

describe("take upload user-facing errors", () => {
  it("maps daily recording limit to Polish", () => {
    expect(
      toUserFacingTakeUploadError("Daily recording session limit reached."),
    ).toBe("Osiągnięto dzienny limit sesji nagrań.");
  });

  it("maps unauthenticated to Polish", () => {
    expect(toUserFacingTakeUploadError("Authentication required.")).toBe(
      "Musisz być zalogowany.",
    );
  });

  it("never returns raw English backend text", () => {
    const raw = "permission denied for table takes";
    const mapped = toUserFacingTakeUploadError(raw);
    expect(mapped).not.toBe(raw);
    expect(mapped.toLowerCase()).not.toContain("permission denied");
    expect(mapped.toLowerCase()).not.toContain("table takes");
    expect(mapped).toMatch(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]|uprawnień|spróbuj|udało/i);
  });
});

describe("playback / download mappers", () => {
  it("maps access denied to Polish", () => {
    expect(toSafePlaybackErrorMessage("Audio access denied.")).toBe(
      "Brak dostępu do odsłuchu.",
    );
  });

  it("maps download limit reached to Polish", () => {
    expect(toSafeDownloadErrorMessage("Daily download limit reached.")).toBe(
      "Osiągnięto dzienny limit pobrań. Spróbuj ponownie jutro.",
    );
  });
});

describe("mix / render user-facing errors", () => {
  it("maps mix capability to Polish", () => {
    expect(toUserFacingMixError("Mix is not enabled (E3_MIX_ENABLED).")).toBe(
      "Miks jest chwilowo niedostępny.",
    );
  });

  it("maps render limit to Polish", () => {
    expect(toUserFacingError("Daily render limit reached.", "render")).toBe(
      "Osiągnięto dzienny limit eksportów.",
    );
  });
});

describe("grant user-facing errors", () => {
  it("maps cannot grant to yourself", () => {
    expect(
      toUserFacingError("Cannot grant access to yourself.", "grant"),
    ).toBe("Nie możesz przyznać dostępu samemu sobie.");
  });
});

describe("global error / not-found / auth pages copy", () => {
  it("global error page does not expose raw error.message", () => {
    const src = readFileSync(
      join(process.cwd(), "src/app/error.tsx"),
      "utf8",
    );
    expect(src).not.toMatch(/error\.message/);
    expect(src).toMatch(/nieoczekiwany błąd/i);
  });

  it("not-found has no scaffold text", () => {
    const src = readFileSync(
      join(process.cwd(), "src/app/not-found.tsx"),
      "utf8",
    );
    expect(src.toLowerCase()).not.toContain("scaffold");
    expect(src).toMatch(/Ta strona nie istnieje/);
  });

  it("sign-in has no Phase 1.3 text", () => {
    const src = readFileSync(
      join(process.cwd(), "src/app/sign-in/page.tsx"),
      "utf8",
    );
    expect(src).not.toMatch(/Phase 1\.3/);
    expect(src.toLowerCase()).not.toContain("minimalny flow techniczny");
  });

  it("sign-up has no OD-19 / OD-20 text", () => {
    const src = readFileSync(
      join(process.cwd(), "src/app/sign-up/page.tsx"),
      "utf8",
    );
    expect(src).not.toMatch(/OD-19|OD-20|BEGINNER_RAPPER|\bUSER\b|\bADMIN\b/);
  });

  it("account has no Security / Danger Zone English", () => {
    const src = readFileSync(
      join(process.cwd(), "src/app/account/page.tsx"),
      "utf8",
    );
    expect(src).not.toMatch(/Danger Zone/);
    expect(src).not.toMatch(/>Security</);
    expect(src).toMatch(/Bezpieczeństwo/);
    expect(src).toMatch(/Usuwanie konta/);
  });

  it("home chrome has no Workspace English label", () => {
    const src = readFileSync(join(process.cwd(), "src/app/page.tsx"), "utf8");
    expect(src).not.toMatch(/>\s*Workspace\s*</);
    expect(src).toMatch(/Studio/);
  });

  it("public catalog presentation has no fixture mood/title arrays", async () => {
    const mod = await import("./demo-beats");
    expect(mod).not.toHaveProperty("CATALOG_MOODS");
    expect(mod).not.toHaveProperty("CATALOG_GENRES");
    expect(mod).not.toHaveProperty("DEMO_BEAT_TEMPLATES");
    expect(mod.presentBeats([])).toEqual([]);
  });
});
