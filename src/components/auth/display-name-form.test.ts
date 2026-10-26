import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("DisplayNameForm auth feedback contract", () => {
  const root = process.cwd();

  it("success uses role=status near Zapisano and error keeps role=alert", () => {
    const src = readFileSync(
      join(root, "src/components/auth/display-name-form.tsx"),
      "utf8",
    );
    expect(src).toContain('role="alert"');
    expect(src).toContain(
      '<p className="text-sm text-muted-foreground" role="status">',
    );
    expect(src).toMatch(/role="status"[\s\S]*Zapisano\./);
  });
});
