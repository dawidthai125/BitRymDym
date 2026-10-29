import { describe, expect, it } from "vitest";

import entries from "../../messages/lib-text.json";
import { isDeleteConfirmWord, DELETE_CONFIRM_WORD } from "@/i18n/config";
import { translateLibText } from "@/i18n/lib-text";

describe("lib-text dictionary", () => {
  it("every entry has a non-empty en and template slots match", () => {
    const slots = (s: string) => (s.match(/\{\d+\}/g) ?? []).sort().join();
    for (const e of entries as Array<{ src: string; en: string; pl?: string; tpl?: boolean }>) {
      expect(e.en.trim().length, e.src).toBeGreaterThan(0);
      if (e.tpl) expect(slots(e.en), e.src).toBe(slots(e.src));
    }
  });

  it("maps PL source to EN, keeps PL, leaves unknown text", () => {
    expect(translateLibText("Zapisano", "en")).toBe("Saved");
    expect(translateLibText("Zapisano", "pl")).toBe("Zapisano");
    expect(translateLibText("Mój bit z bazy", "en")).toBe("Mój bit z bazy");
    expect(translateLibText("Aby potwierdzić, wpisz USUŃ.", "en")).toBe("To confirm, type DELETE.");
  });

  it("English internal sources get a PL translation", () => {
    expect(translateLibText("Take not found.", "pl")).toBe("Nie znaleziono nagrania.");
    expect(translateLibText("Take not found.", "en")).toBe("Take not found.");
  });

  it("delete confirm word depends on locale; server accepts both", () => {
    expect(DELETE_CONFIRM_WORD.pl).toBe("USUŃ");
    expect(DELETE_CONFIRM_WORD.en).toBe("DELETE");
    expect(isDeleteConfirmWord("USUŃ")).toBe(true);
    expect(isDeleteConfirmWord("DELETE")).toBe(true);
    expect(isDeleteConfirmWord("usun")).toBe(false);
  });
});
