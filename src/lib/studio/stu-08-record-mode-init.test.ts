/**
 * STU-08 — Record mode must survive StudioRecordingPanel initialization.
 * Behaviour is exercised through the real pure helpers; the editor/panel wiring
 * is pinned with source contracts (no DOM in this vitest environment).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  deriveStudioInspectorContext,
  studioPreferRecordAfterCaptureReport,
  type StudioInspectorContext,
} from "@/components/studio/studio-inspector-context";
import {
  isRecordingCaptureActive,
  type RecordingUiPhase,
} from "@/lib/takes/recording-ui-state";

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");
const editor = read("src/components/studio/studio-editor.tsx");
const panel = read("src/components/studio/studio-recording-panel.tsx");

const ALL_PHASES: readonly RecordingUiPhase[] = [
  "IDLE",
  "REQUESTING_MIC",
  "READY",
  "RECORDING",
  "STOPPING",
  "UPLOADING",
  "PROCESSING",
  "READY_TAKE",
  "MIC_DENIED",
  "UNSUPPORTED",
  "RECORDING_ERROR",
  "UPLOAD_ERROR",
  "FINALIZE_ERROR",
  "EXPIRED",
  "AUTH_REQUIRED",
  "BEAT_NOT_ELIGIBLE",
];

/** Phases the panel reports as captureActive=true (panel uses this helper). */
const CAPTURE_PHASES: ReadonlySet<string> = new Set(
  ALL_PHASES.filter(isRecordingCaptureActive),
);

type EditorSlice = {
  recordingLocked: boolean;
  preferRecord: boolean;
  selectedClipId: string | null;
  selectedTrackId: string | null;
};

/** Editor `onRecordingActiveChange` state effect (see wiring contract below). */
function report(s: EditorSlice, captureActive: boolean): EditorSlice {
  return {
    recordingLocked: captureActive,
    preferRecord: studioPreferRecordAfterCaptureReport(
      s.preferRecord,
      captureActive,
    ),
    selectedClipId: captureActive ? null : s.selectedClipId,
    selectedTrackId: s.selectedTrackId,
  };
}

const ctx = (s: EditorSlice): StudioInspectorContext =>
  deriveStudioInspectorContext({
    recordingActive: s.recordingLocked || s.preferRecord,
    selectedClipId: s.selectedClipId,
    selectedTrackId: s.selectedTrackId,
  });

/** Panel mount in dev Strict Mode: effect runs, is torn down, runs again. */
function mountPanel(s: EditorSlice, strict: boolean): EditorSlice {
  let next = report(s, false);
  if (strict) next = report(next, false);
  return next;
}

const base: EditorSlice = {
  recordingLocked: false,
  preferRecord: false,
  selectedClipId: null,
  selectedTrackId: null,
};
const enterRecord = (s: EditorSlice): EditorSlice => ({
  ...s,
  preferRecord: true,
});

describe("STU-08-A — entering Record survives panel initialization", () => {
  it.each([false, true])(
    "empty → Record stays in Record (strict=%s)",
    (strict) => {
      expect(ctx(base)).toBe("empty");
      const entered = enterRecord(base);
      expect(ctx(entered)).toBe("record");
      expect(ctx(mountPanel(entered, strict))).toBe("record");
    },
  );

  it.each([false, true])(
    "Record tab entry stays in Record (strict=%s)",
    (strict) => {
      const onTrack = { ...base, selectedTrackId: "t-vocal" };
      expect(ctx(mountPanel(enterRecord(onTrack), strict))).toBe("record");
    },
  );

  it.each([false, true])(
    "track → Record does not fall back to Track (strict=%s)",
    (strict) => {
      const onTrack = { ...base, selectedTrackId: "t-vocal" };
      expect(ctx(onTrack)).toBe("track");
      const mounted = mountPanel(enterRecord(onTrack), strict);
      expect(ctx(mounted)).toBe("record");
      expect(mounted.selectedTrackId).toBe("t-vocal");
    },
  );
});

describe("STU-08-B — captureActive=false is not 'leave Record'", () => {
  it("initial false keeps the explicit Record choice", () => {
    expect(studioPreferRecordAfterCaptureReport(true, false)).toBe(true);
  });

  it("initial false does not invent a Record choice", () => {
    expect(studioPreferRecordAfterCaptureReport(false, false)).toBe(false);
  });

  it("repeated false (callback identity changes every editor render) keeps Record", () => {
    let s = enterRecord(base);
    for (let i = 0; i < 25; i += 1) s = report(s, false);
    expect(ctx(s)).toBe("record");
    expect(s.recordingLocked).toBe(false);
  });

  it("active capture always selects Record and locks the timeline", () => {
    expect(studioPreferRecordAfterCaptureReport(false, true)).toBe(true);
    const s = report({ ...base, selectedClipId: "c1" }, true);
    expect(s.recordingLocked).toBe(true);
    expect(s.selectedClipId).toBeNull();
    expect(ctx(s)).toBe("record");
  });
});

describe("STU-08-C — real capture lifecycle (true → false)", () => {
  const lifecycle: RecordingUiPhase[] = [
    "IDLE",
    "REQUESTING_MIC",
    "READY",
    "RECORDING",
    "STOPPING",
    "UPLOADING",
    "PROCESSING",
    "READY_TAKE",
  ];

  it("panel reports capture only for RECORDING / STOPPING / UPLOADING / PROCESSING", () => {
    expect([...CAPTURE_PHASES].sort()).toEqual(
      ["PROCESSING", "RECORDING", "STOPPING", "UPLOADING"].sort(),
    );
    expect(panel).toMatch(
      /const captureActive = isRecordingCaptureActive\(state\.phase\);/,
    );
  });

  it.each([false, true])(
    "lock follows capture, Record (READY_TAKE decision UI) stays mounted after it ends (strict=%s)",
    (strict) => {
      let s = mountPanel(enterRecord(base), strict);
      const trace: Array<[RecordingUiPhase, boolean, StudioInspectorContext]> =
        [];
      for (const phase of lifecycle) {
        s = report(s, CAPTURE_PHASES.has(phase));
        trace.push([phase, s.recordingLocked, ctx(s)]);
      }
      for (const [phase, locked, context] of trace) {
        expect(locked, phase).toBe(CAPTURE_PHASES.has(phase));
        expect(context, phase).toBe("record");
      }
    },
  );

  it.each<RecordingUiPhase>(["RECORDING_ERROR", "UPLOAD_ERROR", "FINALIZE_ERROR"])(
    "capture ending in %s unlocks but keeps the panel (error stays visible)",
    (errorPhase) => {
      let s = report(enterRecord(base), true);
      s = report(s, CAPTURE_PHASES.has(errorPhase));
      expect(s.recordingLocked).toBe(false);
      expect(ctx(s)).toBe("record");
    },
  );
});

describe("STU-08-D — editor / panel wiring contract", () => {
  const start = editor.indexOf("onRecordingActiveChange={(active) => {");
  const callback = editor.slice(start, editor.indexOf("onClipCreated=", start));

  it("callback mirrors capture into recordingLocked", () => {
    expect(start).toBeGreaterThan(-1);
    expect(callback).toMatch(/setRecordingLocked\(active\);/);
  });

  it("callback derives Record choice from the previous value via the helper", () => {
    expect(callback).toMatch(
      /setInspectorPreferRecord\(\(prev\) =>\s*studioPreferRecordAfterCaptureReport\(prev, active\),?\s*\)/,
    );
  });

  it("callback never clears the Record choice directly", () => {
    expect(callback).not.toMatch(/setInspectorPreferRecord\(false\)/);
  });

  it("active capture still forces seek mode and clears clip selection", () => {
    expect(callback).toMatch(
      /if \(active\) \{\s*setMode\("seek"\);\s*setSelectedClipId\(clearClipSelection\(\)\);\s*setConfirmDelete\(false\);/,
    );
  });

  it("Record is left on clip placement after the take workflow", () => {
    const placed = editor.slice(
      editor.indexOf("onClipCreated={(clip, nextDocumentVersion, options) => {"),
      editor.indexOf('setStatus("Nagranie dodane na oś czasu.");'),
    );
    expect(placed).toMatch(/if \(options\?\.keepRecordPanel\) \{\s*return;\s*\}/);
    expect(placed).toMatch(/setInspectorPreferRecord\(false\);/);
    expect(placed).toMatch(/setSelectedClipId\(selectClipId\(null, clip\.id\)\);/);
  });

  it("panel still reports captureActive from an effect keyed on it", () => {
    expect(panel).toMatch(
      /useEffect\(\(\) => \{[\s\S]{0,300}onRecordingActiveChange\?\.\(captureActive\);\s*\}, \[captureActive, onRecordingActiveChange\]\);/,
    );
  });

  it("panel keeps READY_TAKE as manual decision UI (no auto-place)", () => {
    expect(panel).toMatch(/do not auto-place/);
    expect(panel).toMatch(
      /const showWorkflow = state\.phase === "READY_TAKE" && state\.takeId;/,
    );
  });
});
