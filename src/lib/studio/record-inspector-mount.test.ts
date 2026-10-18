/**
 * Record inspector stays mounted when the recording panel reports
 * captureActive=false on initial mount (IDLE). Explicit UI still clears it.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const editor = readFileSync(
  join(process.cwd(), "src/components/studio/studio-editor.tsx"),
  "utf8",
);

function recordingActiveCallback(source: string): string {
  const start = source.indexOf("onRecordingActiveChange={(active) => {");
  const end = source.indexOf("onLocalRecoveryChanged=", start);
  expect(start).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("Record inspector initial mount", () => {
  it("does not clear inspectorPreferRecord when capture is inactive", () => {
    const callback = recordingActiveCallback(editor);
    expect(callback).toMatch(/setRecordingLocked\(active\)/);
    expect(callback).toMatch(/if \(active\)/);
    expect(callback).toMatch(/setInspectorPreferRecord\(true\)/);
    expect(callback).not.toMatch(/setInspectorPreferRecord\(false\)/);
  });

  it("explicit inspector exits still clear the Record preference", () => {
    expect(editor).toMatch(/id: "settings"[\s\S]*?setInspectorPreferRecord\(false\)/);
    expect(editor).toMatch(/onSelectClip=\{\(id\) => \{[\s\S]*?setInspectorPreferRecord\(false\)/);
    expect(editor).toMatch(/setStatus\("Nagranie dodane na oś czasu\."\)/);
    const clipCreated = editor.slice(
      editor.indexOf("onClipCreated="),
      editor.indexOf("/>", editor.indexOf("onClipCreated=")),
    );
    expect(clipCreated).toMatch(/setInspectorPreferRecord\(false\)/);
  });
});
