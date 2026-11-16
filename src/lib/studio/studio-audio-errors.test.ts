import { describe, expect, it } from "vitest";

import {
  STUDIO_TAKE_EXPIRED_ERROR_PL,
  STUDIO_TAKE_PLAYBACK_ERROR_PL,
  takePreviewFailureMessage,
} from "@/lib/studio/studio-audio-errors";

describe("takePreviewFailureMessage", () => {
  it("maps Take session expired to the Studio expired copy", () => {
    expect(takePreviewFailureMessage("Take session expired.")).toBe(
      STUDIO_TAKE_EXPIRED_ERROR_PL,
    );
  });

  it("keeps a generic copy for other preview failures", () => {
    expect(takePreviewFailureMessage("Not take owner.")).toBe(
      STUDIO_TAKE_PLAYBACK_ERROR_PL,
    );
    expect(takePreviewFailureMessage(undefined)).toBe(
      STUDIO_TAKE_PLAYBACK_ERROR_PL,
    );
  });
});
