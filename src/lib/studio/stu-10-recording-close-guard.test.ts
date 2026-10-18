/**
 * STU-10 — Inspector close guard during capture + state recovery.
 * Behaviour runs through the real recording reducer and helpers in a model of
 * the editor / overlay / panel slice; source contracts pin that every close
 * path reaches the single gate (no DOM in this vitest environment).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  deriveStudioInspectorContext,
  STUDIO_INSPECTOR_CLOSE_BLOCKED_PL,
  studioInspectorOverlayCloseBlocked,
  studioPreferRecordAfterCaptureReport,
  type StudioInspectorContext,
} from "@/components/studio/studio-inspector-context";
import {
  createInitialRecordingUiSnapshot,
  isRecordingCaptureActive,
  recordingInterruptedNoticePl,
  reduceRecordingUi,
  type RecordingUiEvent,
  type RecordingUiPhase,
  type RecordingUiSnapshot,
} from "@/lib/takes/recording-ui-state";

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");
const editor = read("src/components/studio/studio-editor.tsx");
const panel = read("src/components/studio/studio-recording-panel.tsx");
const shell = read("src/components/studio/studio-inspector-shell.tsx");

type ClosePath = "button" | "backdrop" | "escape" | "toolbar" | "mixer";
const CLOSE_PATHS: readonly ClosePath[] = [
  "button",
  "backdrop",
  "escape",
  "toolbar",
  "mixer",
];

type Studio = {
  desktopRail: boolean;
  overlayOpen: boolean;
  mixerOpen: boolean;
  recordingLocked: boolean;
  preferRecord: boolean;
  closeRejected: boolean;
  interruptedNotice: string | null;
  transportPaused: boolean;
  selectedClipId: string | null;
  selectedTrackId: string | null;
  panel: RecordingUiSnapshot | null;
  clips: string[];
};

const context = (s: Studio): StudioInspectorContext =>
  deriveStudioInspectorContext({
    recordingActive: s.recordingLocked || s.preferRecord,
    selectedClipId: s.selectedClipId,
    selectedTrackId: s.selectedTrackId,
  });

/** Panel is mounted iff its host surface is visible and context is record. */
const panelHosted = (s: Studio) =>
  context(s) === "record" && (s.desktopRail || s.overlayOpen);

/** Editor onRecordingActiveChange. */
function report(s: Studio, active: boolean): Studio {
  return {
    ...s,
    recordingLocked: active,
    preferRecord: studioPreferRecordAfterCaptureReport(s.preferRecord, active),
    selectedClipId: active ? null : s.selectedClipId,
    interruptedNotice: active ? null : s.interruptedNotice,
    closeRejected: active ? s.closeRejected : false,
  };
}

/** Panel unmount cleanup → host callbacks. */
function unmountPanel(s: Studio): Studio {
  const notice = s.panel ? recordingInterruptedNoticePl(s.panel.phase) : null;
  let next: Studio = { ...s, panel: null };
  if (notice) {
    next = report(next, false);
    next = { ...next, transportPaused: true, interruptedNotice: notice };
  }
  return next;
}

/** React reconciliation of the panel after a host state change. */
function reconcile(s: Studio, strict = false): Studio {
  if (panelHosted(s) && !s.panel) {
    let next: Studio = {
      ...s,
      panel: createInitialRecordingUiSnapshot({ maxRecordingSeconds: 20 }),
    };
    next = report(next, false);
    if (strict) {
      next = report(unmountPanel(next), false);
      next = {
        ...next,
        panel: createInitialRecordingUiSnapshot({ maxRecordingSeconds: 20 }),
      };
      next = report(next, false);
    }
    return next;
  }
  if (!panelHosted(s) && s.panel) return unmountPanel(s);
  return s;
}

/** Panel dispatch + its captureActive effect. */
function dispatch(s: Studio, event: RecordingUiEvent): Studio {
  if (!s.panel) throw new Error("panel not mounted");
  const phase = reduceRecordingUi(s.panel, event);
  return reconcile(report({ ...s, panel: phase }, isRecordingCaptureActive(phase.phase)));
}

/** Editor closeInspectorOverlay — the single gate. */
function closeInspectorOverlay(s: Studio): [Studio, boolean] {
  if (
    studioInspectorOverlayCloseBlocked({
      recordingLocked: s.recordingLocked,
      overlayHostsInspector: s.overlayOpen && !s.desktopRail,
    })
  ) {
    return [{ ...s, closeRejected: true }, false];
  }
  return [reconcile({ ...s, closeRejected: false, overlayOpen: false }), true];
}

function attemptClose(s: Studio, path: ClosePath): Studio {
  if (path === "mixer") {
    const [next, closed] = closeInspectorOverlay(s);
    return closed ? { ...next, mixerOpen: true } : next;
  }
  return closeInspectorOverlay(s)[0];
}

const closeBlockedMessage = (s: Studio) =>
  s.closeRejected && s.recordingLocked ? STUDIO_INSPECTOR_CLOSE_BLOCKED_PL : null;

function openRecordOnMobile(strict = false): Studio {
  const s: Studio = {
    desktopRail: false,
    overlayOpen: true,
    mixerOpen: false,
    recordingLocked: false,
    preferRecord: true,
    closeRejected: false,
    interruptedNotice: null,
    transportPaused: false,
    selectedClipId: null,
    selectedTrackId: "t-vocal",
    panel: null,
    clips: [],
  };
  return reconcile(s, strict);
}

function startRecording(s: Studio): Studio {
  s = dispatch(s, { type: "REQUEST_MIC" });
  s = dispatch(s, { type: "MIC_READY" });
  return dispatch(s, { type: "START_RECORDING" });
}

function driveTo(s: Studio, phase: RecordingUiPhase): Studio {
  s = startRecording(s);
  const steps: Partial<Record<RecordingUiPhase, RecordingUiEvent[]>> = {
    RECORDING: [],
    STOPPING: [{ type: "STOP" }],
    UPLOADING: [{ type: "STOP" }, { type: "UPLOAD_START" }],
    PROCESSING: [
      { type: "STOP" },
      { type: "UPLOAD_START" },
      { type: "FINALIZE_START" },
    ],
  };
  for (const e of steps[phase]!) s = dispatch(s, e);
  expect(s.panel?.phase).toBe(phase);
  return s;
}

function keepTake(s: Studio): Studio {
  return reconcile({
    ...s,
    preferRecord: false,
    selectedClipId: "clip-new",
    clips: [...s.clips, "clip-new"],
  });
}

describe("STU-10-A — close is rejected while capture is in flight", () => {
  it.each(
    (["RECORDING", "STOPPING", "UPLOADING", "PROCESSING"] as const).flatMap(
      (phase) => CLOSE_PATHS.map((path) => [phase, path] as const),
    ),
  )("%s via %s keeps the Inspector open and the panel mounted", (phase, path) => {
    const before = driveTo(openRecordOnMobile(), phase);
    expect(before.recordingLocked).toBe(true);
    const after = attemptClose(before, path);
    expect(after.overlayOpen).toBe(true);
    expect(after.mixerOpen).toBe(false);
    expect(after.panel).toBe(before.panel);
    expect(after.recordingLocked).toBe(true);
    expect(after.interruptedNotice).toBeNull();
    expect(closeBlockedMessage(after)).toBe(STUDIO_INSPECTOR_CLOSE_BLOCKED_PL);
  });

  it("repeated attempts are idempotent — one notice, no state churn", () => {
    let s = driveTo(openRecordOnMobile(), "RECORDING");
    s = attemptClose(s, "escape");
    const once = s;
    for (const path of CLOSE_PATHS) s = attemptClose(s, path);
    expect(s).toEqual(once);
  });

  it("no notice before any close attempt", () => {
    const s = driveTo(openRecordOnMobile(), "RECORDING");
    expect(closeBlockedMessage(s)).toBeNull();
  });

  it.each(["IDLE", "READY", "REQUESTING_MIC"] as const)(
    "%s (no capture) may close normally",
    (phase) => {
      let s = openRecordOnMobile();
      if (phase !== "IDLE") s = dispatch(s, { type: "REQUEST_MIC" });
      if (phase === "READY") s = dispatch(s, { type: "MIC_READY" });
      expect(s.panel?.phase).toBe(phase);
      const after = attemptClose(s, "button");
      expect(after.overlayOpen).toBe(false);
      expect(after.panel).toBeNull();
      expect(after.recordingLocked).toBe(false);
      expect(after.interruptedNotice).toBeNull();
    },
  );

  it("xl rail is never a guarded host (it has no close path)", () => {
    expect(
      studioInspectorOverlayCloseBlocked({
        recordingLocked: true,
        overlayHostsInspector: false,
      }),
    ).toBe(false);
  });
});

describe("STU-10-B — STU-09 reproduction: close attempt, stop, READY_TAKE", () => {
  it.each([false, true])("full cycle (strict=%s)", (strict) => {
    let s = openRecordOnMobile(strict);
    expect(context(s)).toBe("record");
    expect(s.panel?.phase).toBe("IDLE");

    s = startRecording(s);
    expect(s.panel?.phase).toBe("RECORDING");
    expect(s.recordingLocked).toBe(true);

    s = attemptClose(s, "button");
    s = attemptClose(s, "escape");
    expect(s.overlayOpen).toBe(true);
    expect(s.panel?.phase).toBe("RECORDING");
    expect(closeBlockedMessage(s)).toBe(STUDIO_INSPECTOR_CLOSE_BLOCKED_PL);

    for (const e of [
      { type: "STOP" },
      { type: "UPLOAD_START" },
      { type: "FINALIZE_START" },
      {
        type: "TAKE_READY",
        takeId: "take-1",
        previewUrl: null,
        takeDurationSeconds: 11,
      },
    ] as RecordingUiEvent[]) {
      s = dispatch(s, e);
    }
    expect(s.panel?.phase).toBe("READY_TAKE");
    expect(s.panel?.takeId).toBe("take-1");
    expect(s.recordingLocked).toBe(false);
    expect(closeBlockedMessage(s)).toBeNull();
    expect(context(s)).toBe("record");
    expect(s.overlayOpen).toBe(true);
    expect(s.clips).toEqual([]);

    s = keepTake(s);
    expect(context(s)).toBe("clip");
    expect(s.selectedClipId).toBe("clip-new");
    expect(s.panel).toBeNull();
    expect(s.recordingLocked).toBe(false);
  });

  it("READY_TAKE may be closed; the take stays undecided (no auto-place)", () => {
    let s = driveTo(openRecordOnMobile(), "PROCESSING");
    s = dispatch(s, {
      type: "TAKE_READY",
      takeId: "take-2",
      previewUrl: null,
      takeDurationSeconds: 5,
    });
    const after = attemptClose(s, "escape");
    expect(after.overlayOpen).toBe(false);
    expect(after.panel).toBeNull();
    expect(after.interruptedNotice).toBeNull();
    expect(after.clips).toEqual([]);
  });
});

describe("STU-10-C — failures leave a consistent, unlocked state", () => {
  it.each([
    ["device disconnected", "RECORDING", { type: "RECORDING_FAILED", message: "Mikrofon odłączony." }, "RECORDING_ERROR"],
    ["upload failed", "UPLOADING", { type: "UPLOAD_FAILED", message: "Błąd sieci." }, "UPLOAD_ERROR"],
    ["finalize failed", "PROCESSING", { type: "FINALIZE_FAILED", message: "Błąd finalizacji." }, "FINALIZE_ERROR"],
  ] as const)("%s → %s unlocks and keeps the error visible", (_label, from, event, errorPhase) => {
    let s = driveTo(openRecordOnMobile(), from);
    s = attemptClose(s, "button");
    s = dispatch(s, event as RecordingUiEvent);
    expect(s.panel?.phase).toBe(errorPhase);
    expect(s.panel?.error).toBe(event.message);
    expect(s.recordingLocked).toBe(false);
    expect(closeBlockedMessage(s)).toBeNull();
    expect(context(s)).toBe("record");
    const closed = attemptClose(s, "escape");
    expect(closed.overlayOpen).toBe(false);
    expect(closed.recordingLocked).toBe(false);
  });

  it("cancel (RETRY_IDLE) mid-recording unlocks without a loss notice", () => {
    let s = driveTo(openRecordOnMobile(), "RECORDING");
    s = dispatch(s, { type: "RETRY_IDLE" });
    expect(s.panel?.phase).toBe("IDLE");
    expect(s.recordingLocked).toBe(false);
    expect(s.interruptedNotice).toBeNull();
  });
});

describe("STU-10-D — unguardable unmount (xl breakpoint) recovers the editor", () => {
  const crossToDesktop = (s: Studio) =>
    reconcile(unmountPanel({ ...s, desktopRail: true, overlayOpen: false }));

  it.each(["RECORDING", "STOPPING"] as const)(
    "%s → lock released, transport paused, loss notice",
    (phase) => {
      const s = crossToDesktop(driveTo(openRecordOnMobile(), phase));
      expect(s.recordingLocked).toBe(false);
      expect(s.transportPaused).toBe(true);
      expect(s.interruptedNotice).toMatch(/nie zostało zapisane/);
      expect(s.panel?.phase).toBe("IDLE");
      expect(context(s)).toBe("record");
    },
  );

  it.each(["UPLOADING", "PROCESSING"] as const)(
    "%s → lock released, notice points to the library (upload continues)",
    (phase) => {
      const s = crossToDesktop(driveTo(openRecordOnMobile(), phase));
      expect(s.recordingLocked).toBe(false);
      expect(s.interruptedNotice).toMatch(/Moje Take'i/);
      expect(s.interruptedNotice).not.toMatch(/nie zostało zapisane/);
    },
  );

  it("no notice when nothing was in flight (IDLE / READY_TAKE / errors)", () => {
    for (const phase of [
      "IDLE",
      "REQUESTING_MIC",
      "READY",
      "READY_TAKE",
      "RECORDING_ERROR",
      "UPLOAD_ERROR",
      "FINALIZE_ERROR",
      "MIC_DENIED",
    ] as const) {
      expect(recordingInterruptedNoticePl(phase), phase).toBeNull();
    }
  });

  it("strict-mode mount/unmount at IDLE reports nothing", () => {
    const s = openRecordOnMobile(true);
    expect(s.interruptedNotice).toBeNull();
    expect(s.transportPaused).toBe(false);
    expect(s.recordingLocked).toBe(false);
  });

  it("starting a new capture clears the previous interruption notice", () => {
    let s = crossToDesktop(driveTo(openRecordOnMobile(), "RECORDING"));
    expect(s.interruptedNotice).not.toBeNull();
    s = startRecording(s);
    expect(s.interruptedNotice).toBeNull();
    expect(s.recordingLocked).toBe(true);
  });
});

describe("STU-10-E — wiring contracts", () => {
  const closeGate = editor.slice(
    editor.indexOf("function closeInspectorOverlay"),
    editor.indexOf("function closeMixerSurface"),
  );

  it("editor close gate uses the shared helper with the overlay-host condition", () => {
    expect(closeGate).toMatch(/studioInspectorOverlayCloseBlocked\(\{/);
    expect(closeGate).toMatch(
      /overlayHostsInspector: inspectorOverlayOpen && !inspectorDesktopRail/,
    );
    expect(closeGate).toMatch(/setInspectorCloseRejected\(true\);\s*return false;/);
    expect(closeGate).toMatch(/if \(!closeInspectorOverlay\(\)\) return;\s*setMixerOpen\(true\);/);
  });

  it("only the gate and the xl matchMedia branch set the overlay closed", () => {
    const hits = editor.match(/setInspectorOverlayOpen\(false\)/g) ?? [];
    expect(hits).toHaveLength(2);
    expect(closeGate).toMatch(/setInspectorOverlayOpen\(false\)/);
    expect(editor).toMatch(
      /if \(desktop\) \{\s*setInspectorOverlayOpen\(false\);/,
    );
  });

  it("every overlay close path calls onClose, which is the gate", () => {
    expect(editor).toMatch(/onClose=\{closeInspectorOverlay\}/);
    expect(editor).toMatch(
      /if \(inspectorOverlayOpen\) closeInspectorOverlay\(\);/,
    );
    expect(shell).toMatch(
      /aria-label="Zamknij Inspector"[\s\S]{0,120}onClick=\{onClose\}/,
    );
    expect(shell).toMatch(/onClick=\{onClose\}\s*>\s*Zamknij/);
    expect(shell).toMatch(/event\.key === "Escape"[\s\S]{0,80}onClose\(\);/);
    // prop type, destructure, Escape, effect deps, backdrop, Zamknij button.
    expect((shell.match(/onClose/g) ?? []).length).toBe(6);
  });

  it("overlay renders the rejection notice as an alert; editor gates it on the lock", () => {
    expect(shell).toMatch(
      /closeBlockedMessage \? \([\s\S]{0,200}role="alert"[\s\S]{0,120}\{closeBlockedMessage\}/,
    );
    expect(editor).toMatch(
      /closeBlockedMessage=\{\s*inspectorCloseRejected && recordingLocked\s*\?\s*STUDIO_INSPECTOR_CLOSE_BLOCKED_PL\s*:\s*null\s*\}/,
    );
  });

  it("editor callbacks: notice lifecycle and interruption recovery", () => {
    expect(editor).toMatch(
      /setConfirmDelete\(false\);\s*setCaptureInterruptedNotice\(null\);\s*\} else \{\s*setInspectorCloseRejected\(false\);\s*\}/,
    );
    expect(editor).toMatch(
      /onCaptureInterrupted=\{\(message\) => \{\s*transport\.pause\(\);\s*setCaptureInterruptedNotice\(message\);\s*\}\}/,
    );
    expect(editor).toMatch(
      /captureInterruptedNotice \? \([\s\S]{0,200}role="alert"/,
    );
  });

  it("panel derives captureActive from the shared helper", () => {
    expect(panel).toMatch(
      /const captureActive = isRecordingCaptureActive\(state\.phase\);/,
    );
  });

  it("panel unmount reports false then the notice, only for in-flight phases", () => {
    const cleanup = panel.slice(
      panel.indexOf("mountedRef.current = true;"),
      panel.indexOf("unmount cleanup only"),
    );
    expect(cleanup).toMatch(
      /const interruptedNotice = recordingInterruptedNoticePl\(phaseRef\.current, \{/,
    );
    expect(cleanup).toMatch(
      /if \(interruptedNotice\) \{\s*const report = captureReportRef\.current;\s*report\.onRecordingActiveChange\?\.\(false\);\s*report\.onCaptureInterrupted\?\.\(interruptedNotice\);/,
    );
    expect(cleanup).toMatch(/mountedRef\.current = false;/);
  });

  it("panel cancels a recorder that finished starting after unmount", () => {
    const start = panel.slice(
      panel.indexOf("async function startRecording"),
      panel.indexOf("async function stopAndFinalize"),
    );
    expect(start).toMatch(
      /if \(!mountedRef\.current\) \{\s*void recorder\.cancel\(\);\s*return;\s*\}\s*writer = createTakeRecoveryWriter\(/,
    );
    expect(start.indexOf("setMicStream(recorder.getStream())")).toBeGreaterThan(
      start.indexOf("if (!mountedRef.current)"),
    );
  });
});
