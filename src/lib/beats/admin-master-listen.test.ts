import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("admin beat listen uses the master, catalog stays on the preview", () => {
  const button = readFileSync(
    path.join(process.cwd(), "src/components/admin/admin-beat-play-button.tsx"),
    "utf8",
  );
  const player = readFileSync(
    path.join(process.cwd(), "src/components/player/player-provider.tsx"),
    "utf8",
  );

  it("asks the shared player for the full file from the admin button only", () => {
    expect(button).toContain("master: true");
    expect(player).toContain("listenMasterRef.current = next.master === true");
    expect(player).toContain("previewOnly: !listenMasterRef.current");
  });
});
