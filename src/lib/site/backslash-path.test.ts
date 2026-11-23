import { describe, expect, it, vi } from "vitest";

vi.mock("@supabase/ssr", () => ({ createServerClient: vi.fn() }));

describe("backslash paths (scanner 500s)", async () => {
  const { stripBackslashes } = await import("@/middleware");
  it("strips encoded and raw backslashes", () => {
    expect(stripBackslashes("/premium%5C")).toBe("/premium");
    expect(stripBackslashes("/ranking%5c")).toBe("/ranking");
    expect(stripBackslashes("/beat/abc\\")).toBe("/beat/abc");
    expect(stripBackslashes("/%5C")).toBe("/");
    expect(stripBackslashes("/a%5C/b")).toBe("/a/b");
  });
  it("leaves clean paths alone", () => {
    expect(stripBackslashes("/premium")).toBeNull();
    expect(stripBackslashes("/rymy/%C5%BCycie")).toBeNull();
  });
});
