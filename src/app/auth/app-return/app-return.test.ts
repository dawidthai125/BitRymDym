import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { GET } from "./route";

const call = async (query: string) =>
  (await GET(new NextRequest(`https://www.bitrymdym.pl/auth/app-return?${query}`))).text();

describe("/auth/app-return", () => {
  it("hands the code back to the app scheme", async () => {
    expect(await call("flow=oauth&code=abc-123&next=%2Fstudio")).toContain(
      'href="bitrymdym://auth-callback?code=abc-123&amp;next=%2Fstudio"',
    );
  });
  it("drops hostile input", async () => {
    const html = await call('code=%22%3E%3Cscript%3E&next=https%3A%2F%2Fevil.example');
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("evil.example");
    expect(html).toContain("bitrymdym://auth-callback?error=1");
  });
});
