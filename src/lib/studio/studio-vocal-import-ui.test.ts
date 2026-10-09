/**
 * Contract tests — Studio AI vocal import UI reuses take-audio + CAS place.
 * No production mutations.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const panelPath = join(
  root,
  "src/components/studio/studio-recording-panel.tsx",
);
const importHelperPath = join(root, "src/lib/takes/studio-vocal-import.ts");
const uiStatePath = join(root, "src/lib/takes/recording-ui-state.ts");

describe("Studio vocal import UI contract", () => {
  const panel = readFileSync(panelPath, "utf8");
  const helper = readFileSync(importHelperPath, "utf8");
  const uiState = readFileSync(uiStatePath, "utf8");

  it("exposes file input + Importuj wokal without new bucket/ARTIFACT", () => {
    expect(panel).toMatch(/type="file"/);
    expect(panel).toMatch(/STUDIO_VOCAL_IMPORT_ACCEPT/);
    expect(panel).toMatch(/Importuj wokal/);
    expect(panel).toMatch(/onImportVocalFile/);
    expect(panel).toMatch(/uploadTakeRecordingBlob/);
    expect(panel).toMatch(/gateStudioVocalImportFile/);
    expect(panel).not.toMatch(/audio-artifacts/);
    expect(panel).not.toMatch(/sourceKind:\s*["']ARTIFACT["']/);
    expect(helper).toMatch(/validateTakeUploadMeta/);
  });

  it("reuses eligibility + place CAS path; does not MediaRecorder for import", () => {
    expect(panel).toMatch(/async function onImportVocalFile/);
    const importIdx = panel.indexOf("async function onImportVocalFile");
    const importTail = panel.slice(importIdx, importIdx + 3500);
    expect(importTail).toMatch(/\/api\/takes\/eligibility/);
    expect(importTail).toMatch(/uploadTakeRecordingBlob/);
    expect(importTail).toMatch(/placeReadyTakeOnTimeline/);
    expect(importTail).not.toMatch(/TakeMediaRecorder/);
    expect(importTail).not.toMatch(/getUserMedia/);
    expect(panel).toMatch(/record\/place/);
    expect(panel).toMatch(/expectedDocumentVersion/);
  });

  it("keeps mic stopAndFinalize without place; Keep/import share place helper", () => {
    const stopIdx = panel.indexOf("async function stopAndFinalize");
    const placeHelperIdx = panel.indexOf(
      "async function placeReadyTakeOnTimeline",
    );
    const stopBody = panel.slice(stopIdx, placeHelperIdx);
    expect(stopBody).not.toMatch(/record\/place/);
    expect(panel).toMatch(/async function placeReadyTakeOnTimeline/);
    expect(panel).toMatch(/onKeepWorkflowTake/);
    expect(panel).toMatch(/TakeMediaRecorder/);
  });

  it("allows UPLOAD_START from IDLE for import phase reuse", () => {
    expect(uiState).toMatch(/Studio vocal file import/);
    expect(uiState).toMatch(/state\.phase !== "IDLE"/);
  });
});
