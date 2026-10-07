/**
 * POST-RECORDING V1 — architecture guards (ONE Studio audio path).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

describe("PR-V1 architecture guards", () => {
  it("keeps ONE StudioAudioEngine / ONE transport / no PlayerProvider in Studio mix", () => {
    const engine = read("src/lib/studio/studio-audio-engine.ts");
    const transport = read("src/components/studio/studio-transport-provider.tsx");
    const editor = read("src/components/studio/studio-editor.tsx");

    expect(engine).toMatch(/class StudioAudioEngine/);
    expect(engine.match(/class StudioAudioEngine/g)).toHaveLength(1);
    expect(transport).toMatch(/StudioTransportProvider/);
    expect(editor).toMatch(/StudioTransportProvider/);
    expect(editor).not.toMatch(/PlayerProvider/);
    expect(editor).not.toMatch(/VocalEditorEngine/);
    expect(editor).not.toMatch(/PostProductionEngine/);
    expect(editor).not.toMatch(/FadeEngine/);
    expect(editor).not.toMatch(/StudioMixEngine/);
  });

  it("V1 write paths do not rewrite Take bytes / Storage", () => {
    const service = read("src/lib/studio/studio-service.ts");
    expect(service).toMatch(/studio_cas_apply_clip_gain_mute/);
    expect(service).toMatch(/studio_cas_apply_clip_duplicate/);
    expect(service).toMatch(/studio_cas_apply_clip_delete/);
    expect(service).not.toMatch(/\.from\("takes"\)\s*\.update/);
    expect(service).not.toMatch(/storage\.from\(/);
  });

  it("new V1 CAS RPCs revoke anon/authenticated and grant service_role", () => {
    const migrations = [
      "supabase/migrations/20261007150000_pr_v1_studio_cas_clip_gain_mute.sql",
      "supabase/migrations/20261007151000_pr_v1_studio_cas_clip_duplicate.sql",
      "supabase/migrations/20261007152000_pr_v1_studio_cas_clip_delete.sql",
    ];
    for (const rel of migrations) {
      const sql = read(rel);
      expect(sql).toMatch(/REVOKE ALL[\s\S]*FROM anon, authenticated/);
      expect(sql).toMatch(/GRANT EXECUTE[\s\S]*TO service_role/);
      expect(sql).not.toMatch(/CREATE TABLE/);
      expect(sql).not.toMatch(/ALTER TABLE/);
    }
  });

  it("does not add Autosave / Undo / Automation / Clip Pan / Region Mute / E3 render", () => {
    const files = [
      "src/lib/studio/studio-clip-mix.ts",
      "src/lib/studio/studio-service.ts",
      "src/components/studio/studio-editor.tsx",
    ];
    for (const rel of files) {
      const src = read(rel);
      expect(src).not.toMatch(/Autosave|autoSave|commandStack|UndoRedo|Autotune/);
      expect(src).not.toMatch(/clipPan|regionMute|Region Mute/);
      expect(src).not.toMatch(/E3.*Studio.*[Rr]ender|studioDocumentToE3/);
    }
  });
});
