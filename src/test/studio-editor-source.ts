import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Source-contract tests read the Studio editor as text. The editor was split (audit 2026-11-21) into
 * these files; read them together so contracts keep holding wherever the code now lives.
 */
export const STUDIO_EDITOR_SOURCE_FILES = [
  "src/components/studio/studio-editor.tsx",
  "src/components/studio/studio-transport-bar.tsx",
  "src/components/studio/studio-timeline.tsx",
  "src/components/studio/studio-daw-layout.ts",
  "src/components/studio/studio-inspector-panels.tsx",
  "src/components/studio/studio-track-header.tsx",
  "src/components/studio/studio-step-nav.tsx",
] as const;

export function readStudioEditorSource(root: string = process.cwd()): string {
  return STUDIO_EDITOR_SOURCE_FILES.map((file) => readFileSync(join(root, file), "utf8")).join("\n");
}
