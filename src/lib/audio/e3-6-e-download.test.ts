import { describe, expect, it } from "vitest";

import { rejectClientRenderSourceClaims } from "@/lib/audio/render-source-core";
import { RenderJobDomainError } from "@/lib/audio/render-job-core";

/**
 * Download AuthZ pure contracts covered via rejectClientRenderSourceClaims
 * + FINDING-03 documented in artifact-download (job SUCCEEDED required).
 */
describe("E3.6-E — signed download AuthZ surface", () => {
  it("download query must not accept client object_key / url", () => {
    expect(() =>
      rejectClientRenderSourceClaims({ object_key: "evil" }),
    ).toThrow(RenderJobDomainError);
    expect(() =>
      rejectClientRenderSourceClaims({ url: "https://evil" }),
    ).toThrow(RenderJobDomainError);
  });
});
