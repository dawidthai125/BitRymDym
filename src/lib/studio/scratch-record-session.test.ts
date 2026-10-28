/**
 * Scratch session SSOT: lastScratchClipId lives in the editor.
 * keepRecordPanel + timeline select must keep Record (debugger 30044945).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  deriveStudioInspectorContext,
  studioPreferRecordAfterClipCreated,
  studioPreferRecordAfterTimelineSelect,
} from "@/components/studio/studio-inspector-context";

type ScratchEditorSlice = {
  preferRecord: boolean;
  lastScratchClipId: string | null;
  selectedClipId: string | null;
};

const base: ScratchEditorSlice = {
  preferRecord: true,
  lastScratchClipId: null,
  selectedClipId: null,
};

function placeKeepRecord(
  s: ScratchEditorSlice,
  clipId: string,
): ScratchEditorSlice {
  return {
    ...s,
    lastScratchClipId: clipId,
    preferRecord: studioPreferRecordAfterClipCreated({ keepRecordPanel: true }),
  };
}

function unmountRecordPanel(s: ScratchEditorSlice): ScratchEditorSlice {
  return s;
}

function selectClip(
  s: ScratchEditorSlice,
  clipId: string,
): ScratchEditorSlice {
  return {
    ...s,
    selectedClipId: clipId,
    preferRecord: studioPreferRecordAfterTimelineSelect({
      scratchSessionActive: s.lastScratchClipId != null,
    }),
  };
}

const ctx = (s: ScratchEditorSlice) =>
  deriveStudioInspectorContext({
    recordingActive: s.preferRecord,
    selectedClipId: s.selectedClipId,
    selectedTrackId: null,
  });

describe("scratch Record session helpers", () => {
  it("place keepRecord keeps preferRecord true and stores the clip id", () => {
    expect(
      studioPreferRecordAfterClipCreated({ keepRecordPanel: true }),
    ).toBe(true);
    expect(studioPreferRecordAfterClipCreated({})).toBe(false);
    expect(
      studioPreferRecordAfterClipCreated({ keepRecordPanel: false }),
    ).toBe(false);

    const placed = placeKeepRecord(base, "clip-scratch");
    expect(placed.preferRecord).toBe(true);
    expect(placed.lastScratchClipId).toBe("clip-scratch");
    expect(ctx(placed)).toBe("record");
  });

  it("unmount of Record panel does not drop lastScratchClipId", () => {
    const placed = placeKeepRecord(base, "clip-scratch");
    const afterUnmount = unmountRecordPanel(placed);
    expect(afterUnmount.lastScratchClipId).toBe("clip-scratch");
    expect(afterUnmount.preferRecord).toBe(true);
  });

  it("onSelectClip during a scratch session does not drop Record", () => {
    expect(
      studioPreferRecordAfterTimelineSelect({ scratchSessionActive: true }),
    ).toBe(true);
    expect(
      studioPreferRecordAfterTimelineSelect({ scratchSessionActive: false }),
    ).toBe(false);

    const placed = placeKeepRecord(base, "clip-scratch");
    const selected = selectClip(placed, "clip-scratch");
    expect(selected.selectedClipId).toBe("clip-scratch");
    expect(selected.preferRecord).toBe(true);
    expect(ctx(selected)).toBe("record");
  });

  it("onSelectClip without a scratch session drops Record", () => {
    const selected = selectClip(base, "clip-other");
    expect(selected.preferRecord).toBe(false);
    expect(ctx(selected)).toBe("clip");
  });
});

describe("scratch Record session wiring", () => {
  const root = process.cwd();
  const editor = readFileSync(
    join(root, "src/components/studio/studio-editor.tsx"),
    "utf8",
  );
  const panel = readFileSync(
    join(root, "src/components/studio/studio-recording-panel.tsx"),
    "utf8",
  );

  it("lifts lastScratchClipId into StudioEditorInner and passes value+setter", () => {
    expect(editor).toMatch(
      /const \[lastScratchClipId, setLastScratchClipId\] = useState<string \| null>\(/,
    );
    expect(editor).toMatch(/lastScratchClipId=\{lastScratchClipId\}/);
    expect(editor).toMatch(
      /onLastScratchClipIdChange=\{setLastScratchClipId\}/,
    );
    expect(panel).not.toMatch(
      /const \[lastScratchClipId, setLastScratchClipId\] = useState/,
    );
    expect(panel).toMatch(/onApprove=\{\(approved\) => \{/);
    expect(panel).toMatch(/if \(!lastScratchClipId\) \{/);
  });
});
