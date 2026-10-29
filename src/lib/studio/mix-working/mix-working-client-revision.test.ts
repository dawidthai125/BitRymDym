import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  MIX_CLIENT_REVISION_DESCRIPTION_MAX,
  parseClientMixRevisionMeta,
} from "@/lib/studio/mix-working/mix-working-client-revision";

describe("Stage 2 — client revision meta (BITEK = AI author)", () => {
  it("accepts only author AI, forces kind accepted, sanitises description", () => {
    expect(parseClientMixRevisionMeta({ author: "AI", description: " BITEK:\n poprawiłem mix " })).toEqual({
      author: "AI",
      kind: "accepted",
      description: "BITEK: poprawiłem mix",
    });
    expect(parseClientMixRevisionMeta({ author: "AI", kind: "restored", restoredFromRevisionId: "x" })).toEqual({
      author: "AI",
      kind: "accepted",
      description: null,
    });
  });

  it("rejects anything else → server default", () => {
    for (const raw of [undefined, null, "AI", [], { author: "USER" }, { author: "AUTOMATION" }, { kind: "accepted" }]) {
      expect(parseClientMixRevisionMeta(raw)).toBeUndefined();
    }
  });

  it("caps description length", () => {
    const meta = parseClientMixRevisionMeta({ author: "AI", description: "ą".repeat(900) });
    expect(Array.from(meta!.description!)).toHaveLength(MIX_CLIENT_REVISION_DESCRIPTION_MAX);
  });

  it("route wires the allowlist; service maps author into the revision payload", () => {
    const route = readFileSync(
      path.join(process.cwd(), "src/app/api/studio/projects/[projectId]/mix-working/apply/route.ts"),
      "utf8",
    );
    expect(route).toContain("revision: parseClientMixRevisionMeta(body.revision)");
    const service = readFileSync(path.join(process.cwd(), "src/lib/studio/mix-working-apply-service.ts"), "utf8");
    expect(service).toContain('author: input.revision?.author === "AI" ? "AI" : "USER"');
  });
});
