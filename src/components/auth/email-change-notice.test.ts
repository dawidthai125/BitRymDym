import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("EmailChangeNotice auth feedback contract", () => {
  const root = process.cwd();

  it("invalid uses role=alert and other statuses use role=status", () => {
    const src = readFileSync(
      join(root, "src/components/auth/email-change-notice.tsx"),
      "utf8",
    );
    expect(src).toMatch(
      /role=\{status === "invalid"\s*\?\s*"alert"\s*:\s*"status"\}/,
    );
    expect(src).toContain('"alert"');
    expect(src).toContain('"status"');
  });
});
