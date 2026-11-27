import { describe, expect, it } from "vitest";

import { studioShortcutRows } from "@/lib/studio/studio-shortcut-list";
import { resolveStudioTransportKeyAction } from "@/lib/studio/transport-keyboard-mode";

describe("Studio shortcut list", () => {
  it("shows the transport keys that the editor really uses in both keyboard modes", () => {
    for (const mode of ["standard_daw", "quick_rec"] as const) {
      const rows = studioShortcutRows(mode);
      for (const [id, action] of [["graj", "play"], ["nagraj", "record"]] as const) {
        for (const key of rows.find((r) => r.id === id)!.keys) {
          expect(resolveStudioTransportKeyAction({ mode, key: key === "space" ? " " : key })).toBe(action);
        }
      }
    }
  });
});
